import {test} from '../../src/test-helpers/tap.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

const TEST_PARTITION_SERVICE_TYPE = 'partition';
const TEST_REPLICA_ID = 'replica-1';
const TEST_PARTITION_ID = 'partition-1';
const TEST_NODE_ID = 'node-2';
const TEST_REPLICA_ADDRESS = 'node-2/partition/replica-1';
const TEST_OBSERVED_STATE = 'observed';
const TEST_AUTHORITATIVE_SOURCE = 'authoritative';
const TEST_PARTITION_NODE_FALLBACK_REPLICA_ID = 'replica-2';
const TEST_PARTITION_NODE_FALLBACK_ADDRESS = 'node-2/partition/replica-2';

function createRepository(overrides = {}) {
  return new ReplicaOperationRepository({
    nodeId: 'node-1',
    systemTableCache: {},
    cdcIntegrationService: {},
    logger: console,
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows() {
        return {
          success: true,
          rows: [],
        };
      },
    },
    ...overrides,
  });
}

test('ReplicaOperationRepository fails closed when a live cache row contradicts ' +
  'authoritative absence',
async (t) => {
  const repository = createRepository();
  // A production-shaped row (the normalizer reads `status`, not
  // `lifecycle_status`): a surviving live row means the stores diverged, so
  // ABSENT is not proven and the observation must fail closed (quest
  // replica-retirement-terminal-actuals-coherence).
  repository.getObservedReplicaRowFromCache = () => ({
    service_id: 'replica-1',
    partition_id: 'partition-1',
    node_id: 'node-2',
    status: 'active',
  });

  const observation = await repository.getActualReplicaObservation(
    'replica-1',
    'partition-1',
    'node-2',
  );

  t.same(
    observation,
    {
      state: 'unavailable',
      source: 'authoritative_absent_cache_blocking',
    },
    'a live contradicting cache row must veto authoritative absence',
  );
});

test('ReplicaOperationRepository confirms authoritative absence when the cache ' +
  'corroborates it',
async (t) => {
  const repository = createRepository();
  repository.getObservedReplicaRowFromCache = () => ({
    service_id: 'replica-1',
    partition_id: 'partition-1',
    node_id: 'node-2',
    status: 'removed',
  });

  const observation = await repository.getActualReplicaObservation(
    'replica-1',
    'partition-1',
    'node-2',
  );

  t.same(
    observation,
    {
      state: 'absent',
      source: 'authoritative',
    },
    'a removed cache row corroborates the successful no-row read as true absence',
  );
});

test('ReplicaOperationRepository exposes cache fallback after authoritative failure explicitly',
  async (t) => {
    const repository = createRepository({
      controlPlaneSystemTableGateway: {
        async readAuthoritativeRows() {
          return {
            success: false,
            rows: [],
          };
        },
      },
    });
    repository.getObservedReplicaRowFromCache = () => ({
      status: 'STOPPING',
    });

    const observation = await repository.getActualReplicaObservation(
      'replica-1',
      'partition-1',
      'node-2',
    );

    t.same(
      observation,
      {
        state: 'observed',
        source: 'cache_fallback_after_authoritative_failure',
        lifecycleStatus: 'stopping',
      },
      'cache fallback should remain explicit when authoritative reads fail',
    );
  });

test('ReplicaOperationRepository keeps authoritative failure without cache visibility unavailable',
  async (t) => {
    const repository = createRepository({
      controlPlaneSystemTableGateway: {
        async readAuthoritativeRows() {
          return {
            success: false,
            rows: [],
          };
        },
      },
    });
    repository.getObservedReplicaRowFromCache = () => null;

    const observation = await repository.getActualReplicaObservation(
      'replica-1',
      'partition-1',
      'node-2',
    );

    t.same(
      observation,
      {
        state: 'unavailable',
        source: 'unavailable',
      },
      'failed authoritative reads without cache visibility should stay unresolved',
    );
  });

test(
  'ReplicaOperationRepository treats syncing non-learner rows with address as active lifecycle evidence',
  async (t) => {
    const repository = createRepository({
      controlPlaneSystemTableGateway: {
        async readAuthoritativeRows() {
          return {
            success: true,
            rows: [{
              service_id: TEST_REPLICA_ID,
              replica_id: TEST_REPLICA_ID,
              partition_id: TEST_PARTITION_ID,
              node_id: TEST_NODE_ID,
              service_type: TEST_PARTITION_SERVICE_TYPE,
              status: ReplicaStatus.SYNCING,
              raft_role: RAFT_ROLE.FOLLOWER,
              address: TEST_REPLICA_ADDRESS,
            }],
          };
        },
      },
    });

    const observation = await repository.getActualReplicaObservation(
      TEST_REPLICA_ID,
      TEST_PARTITION_ID,
      TEST_NODE_ID,
    );

    t.same(
      observation,
      {
        state: TEST_OBSERVED_STATE,
        source: TEST_AUTHORITATIVE_SOURCE,
        lifecycleStatus: ReplicaStatus.ACTIVE,
      },
      'voter-ready syncing rows should advance operation lifecycle reconciliation',
    );
  },
);

test(
  'ReplicaOperationRepository keeps syncing non-learner rows without address in syncing lifecycle',
  async (t) => {
    const repository = createRepository({
      controlPlaneSystemTableGateway: {
        async readAuthoritativeRows() {
          return {
            success: true,
            rows: [{
              service_id: TEST_REPLICA_ID,
              replica_id: TEST_REPLICA_ID,
              partition_id: TEST_PARTITION_ID,
              node_id: TEST_NODE_ID,
              service_type: TEST_PARTITION_SERVICE_TYPE,
              status: ReplicaStatus.SYNCING,
              raft_role: RAFT_ROLE.FOLLOWER,
            }],
          };
        },
      },
    });

    const observation = await repository.getActualReplicaObservation(
      TEST_REPLICA_ID,
      TEST_PARTITION_ID,
      TEST_NODE_ID,
    );

    t.same(
      observation,
      {
        state: TEST_OBSERVED_STATE,
        source: TEST_AUTHORITATIVE_SOURCE,
        lifecycleStatus: ReplicaStatus.SYNCING,
      },
      'syncing rows without routable address should not be promoted in observation',
    );
  },
);

test(
  'ReplicaOperationRepository can disable authoritative partition-node fallback ' +
    'for exact-target observation',
  async (t) => {
    const repository = createRepository({
      controlPlaneSystemTableGateway: {
        async readAuthoritativeRows(_tableName, _sql, params = []) {
          if (params[0] === TEST_REPLICA_ID) {
            return {
              success: true,
              rows: [],
            };
          }
          if (
            params[0] === TEST_PARTITION_ID &&
            params[1] === TEST_NODE_ID
          ) {
            return {
              success: true,
              rows: [{
                service_id: TEST_PARTITION_NODE_FALLBACK_REPLICA_ID,
                replica_id: TEST_PARTITION_NODE_FALLBACK_REPLICA_ID,
                partition_id: TEST_PARTITION_ID,
                node_id: TEST_NODE_ID,
                service_type: TEST_PARTITION_SERVICE_TYPE,
                status: ReplicaStatus.ACTIVE,
                raft_role: RAFT_ROLE.FOLLOWER,
                address: TEST_PARTITION_NODE_FALLBACK_ADDRESS,
              }],
            };
          }
          return {
            success: true,
            rows: [],
          };
        },
      },
    });

    const observedWithFallback = await repository.getActualReplicaObservation(
      TEST_REPLICA_ID,
      TEST_PARTITION_ID,
      TEST_NODE_ID,
    );
    const observedWithoutFallback =
      await repository.getActualReplicaObservation(
        TEST_REPLICA_ID,
        TEST_PARTITION_ID,
        TEST_NODE_ID,
        {allowPartitionNodeFallback: false},
      );

    t.same(
      observedWithFallback,
      {
        state: TEST_OBSERVED_STATE,
        source: TEST_AUTHORITATIVE_SOURCE,
        lifecycleStatus: ReplicaStatus.ACTIVE,
      },
      'default partition-node fallback should still surface sibling visibility',
    );
    t.same(
      observedWithoutFallback,
      {
        state: 'absent',
        source: TEST_AUTHORITATIVE_SOURCE,
      },
      'exact-target observation should stay absent when fallback is disabled',
    );
  },
);

test(
  'ReplicaOperationRepository can disable cache partition-node fallback for ' +
    'exact-target observation',
  (t) => {
    const repository = createRepository({
      systemTableCache: {
        get() {
          return null;
        },
        getAll() {
          return [{
            service_id: TEST_PARTITION_NODE_FALLBACK_REPLICA_ID,
            replica_id: TEST_PARTITION_NODE_FALLBACK_REPLICA_ID,
            partition_id: TEST_PARTITION_ID,
            node_id: TEST_NODE_ID,
            service_type: TEST_PARTITION_SERVICE_TYPE,
            status: ReplicaStatus.ACTIVE,
            raft_role: RAFT_ROLE.FOLLOWER,
            address: TEST_PARTITION_NODE_FALLBACK_ADDRESS,
          }];
        },
      },
    });

    t.equal(
      repository.getObservedReplicaStatusFromCache(
        TEST_REPLICA_ID,
        TEST_PARTITION_ID,
        TEST_NODE_ID,
      ),
      ReplicaStatus.ACTIVE,
      'default cache fallback should still surface sibling visibility',
    );
    t.equal(
      repository.getObservedReplicaStatusFromCache(
        TEST_REPLICA_ID,
        TEST_PARTITION_ID,
        TEST_NODE_ID,
        {allowPartitionNodeFallback: false},
      ),
      null,
      'exact-target cache status should stay absent when fallback is disabled',
    );
    t.end();
  },
);
