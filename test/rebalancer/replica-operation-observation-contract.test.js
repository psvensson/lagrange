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

test('ReplicaOperationRepository treats authoritative absence as distinct from cache visibility',
  async (t) => {
    const repository = createRepository();
    repository.getObservedReplicaRowFromCache = () => ({
      lifecycle_status: 'ACTIVE',
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
      'successful authoritative no-row reads should not fall back to stale cache',
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
