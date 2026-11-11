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

test('ReplicaOperationRepository refuses cache fallback after authoritative failure',
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
        state: 'unavailable',
        source: 'unavailable',
      },
      'authoritative read failure must remain unavailable and never fall back to cache',
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
        observedTargetIdentity: {
          replicaId: TEST_REPLICA_ID,
          serviceId: TEST_REPLICA_ID,
          partitionId: TEST_PARTITION_ID,
          nodeId: TEST_NODE_ID,
          serviceType: TEST_PARTITION_SERVICE_TYPE,
          status: ReplicaStatus.SYNCING,
        },
        lifecyclePrecondition: {},
        previousState: null,
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
        observedTargetIdentity: {
          replicaId: TEST_REPLICA_ID,
          serviceId: TEST_REPLICA_ID,
          partitionId: TEST_PARTITION_ID,
          nodeId: TEST_NODE_ID,
          serviceType: TEST_PARTITION_SERVICE_TYPE,
          status: ReplicaStatus.SYNCING,
        },
        lifecyclePrecondition: {},
        previousState: null,
      },
      'syncing rows without routable address should not be promoted in observation',
    );
  },
);

test(
  'ReplicaOperationRepository deletes authoritative partition-node fallback ' +
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
      {allowPartitionNodeFallback: true},
    );
    const observedWithoutFallback =
      await repository.getActualReplicaObservation(
        TEST_REPLICA_ID,
        TEST_PARTITION_ID,
        TEST_NODE_ID,
      );

    t.same(
      observedWithFallback,
      {
        state: 'absent',
        source: TEST_AUTHORITATIVE_SOURCE,
      },
      'passing allowPartitionNodeFallback: true must not surface sibling visibility',
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
  'ReplicaOperationRepository deletes cache partition-node fallback for ' +
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
        {allowPartitionNodeFallback: true},
      ),
      null,
      'passing allowPartitionNodeFallback: true must not surface sibling visibility in cache',
    );
    t.equal(
      repository.getObservedReplicaStatusFromCache(
        TEST_REPLICA_ID,
        TEST_PARTITION_ID,
        TEST_NODE_ID,
      ),
      null,
      'exact-target cache status should stay absent',
    );
    t.end();
  },
);

test(
  'ReplicaOperationRepository exact-target observation rejects mismatched replica, ' +
    'null or mismatched partition, and wrong node even when state_entered_at is null',
  async (t) => {
    const baseRow = {
      service_id: TEST_REPLICA_ID,
      replica_id: TEST_REPLICA_ID,
      partition_id: TEST_PARTITION_ID,
      node_id: TEST_NODE_ID,
      service_type: TEST_PARTITION_SERVICE_TYPE,
      status: ReplicaStatus.ACTIVE,
      raft_role: RAFT_ROLE.FOLLOWER,
      address: TEST_REPLICA_ADDRESS,
      created_at: 1000,
      state_entered_at: null,
    };
    const invalidRows = [
      {
        label: 'different replica_id with null state_entered_at',
        row: {
          ...baseRow,
          service_id: 'other-replica-r99',
          replica_id: 'other-replica-r99',
        },
      },
      {
        label: 'conflicting replica_id vs service_id',
        row: {...baseRow, replica_id: 'other-replica-r99'},
      },
      {
        label: 'null partition_id when partitionId is required',
        row: {...baseRow, partition_id: null},
      },
      {
        label: 'mismatched partition_id',
        row: {...baseRow, partition_id: 'other-partition-99'},
      },
      {
        label: 'mismatched node_id',
        row: {...baseRow, node_id: 'other-node-99'},
      },
    ];

    for (const {label, row} of invalidRows) {
      const repository = createRepository({
        systemTableCache: {
          get: () => row,
          getAll: () => [row],
        },
        controlPlaneSystemTableGateway: {
          async readAuthoritativeRows() {
            return {success: true, rows: [row]};
          },
        },
      });
      const observation = await repository.getActualReplicaObservation(
        TEST_REPLICA_ID,
        TEST_PARTITION_ID,
        TEST_NODE_ID,
        {allowPartitionNodeFallback: false, allowCacheFallback: false},
      );
      t.same(
        observation,
        {state: 'unavailable', source: 'unavailable'},
        `authoritative exact-target observation rejects ${label}`,
      );
      t.equal(
        repository.getObservedReplicaStatusFromCache(
          TEST_REPLICA_ID,
          TEST_PARTITION_ID,
          TEST_NODE_ID,
          {allowPartitionNodeFallback: false},
        ),
        null,
        `cache exact-target observation rejects ${label}`,
      );
    }

    const exactNullStateEnteredRepository = createRepository({
      controlPlaneSystemTableGateway: {
        async readAuthoritativeRows() {
          return {success: true, rows: [baseRow]};
        },
      },
    });
    const exactObservation =
      await exactNullStateEnteredRepository.getActualReplicaObservation(
        TEST_REPLICA_ID,
        TEST_PARTITION_ID,
        TEST_NODE_ID,
        {allowPartitionNodeFallback: false, allowCacheFallback: false},
      );
    t.same(
      exactObservation.observedTargetIdentity,
      {
        replicaId: TEST_REPLICA_ID,
        serviceId: TEST_REPLICA_ID,
        partitionId: TEST_PARTITION_ID,
        nodeId: TEST_NODE_ID,
        serviceType: TEST_PARTITION_SERVICE_TYPE,
        status: ReplicaStatus.ACTIVE,
      },
      'observedTargetIdentity stays populated when state_entered_at is null',
    );
    t.same(
      exactObservation.lifecyclePrecondition,
      {},
      'lifecyclePrecondition stays empty when state_entered_at is null',
    );
  },
);

test(
  'ReplicaOperationRepository normalizes partition_cleanup receipt rows into workflow removal lifecycle',
  async (t) => {
    const repository = createRepository();
    t.equal(
      repository.normalizeObservedReplicaLifecycle({
        service_id: TEST_REPLICA_ID,
        replica_id: TEST_REPLICA_ID,
        partition_id: TEST_PARTITION_ID,
        node_id: TEST_NODE_ID,
        service_type: 'partition_cleanup',
        status: 'cleanup_owned',
      }),
      ReplicaStatus.REMOVING,
      'cleanup_owned partition_cleanup row normalizes to REMOVING',
    );
    t.equal(
      repository.normalizeObservedReplicaLifecycle({
        service_id: TEST_REPLICA_ID,
        replica_id: TEST_REPLICA_ID,
        partition_id: TEST_PARTITION_ID,
        node_id: TEST_NODE_ID,
        service_type: 'partition_cleanup',
        status: 'cleanup_complete',
      }),
      ReplicaStatus.REMOVED,
      'cleanup_complete partition_cleanup receipt normalizes to REMOVED',
    );
  },
);
