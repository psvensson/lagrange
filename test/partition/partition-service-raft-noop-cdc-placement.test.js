import {
  afterEach,
  beforeEach,
  test,
} from '../../src/test-helpers/tap.js';
import {
  CDC_OPERATION,
  TABLES,
} from '../../src/constants/index.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import LifeRaft from '../../src/raft/liferaft.js';
import {
  INITIAL_PARTITION_IDS,
  SERVICES_SCHEMA,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  buildCurrentPriorityPlacementObservation,
} from '../../src/control-plane/current-priority-placement-observation.js';
import {
  waitForAffinityDemoSchemaAdmission,
} from '../../examples/service-data-affinity/affinity-demo-preload-gate.js';

const TEST_NOW_MS = 10_000;
const TEST_NODE_IDS = Object.freeze(['node-a', 'node-b', 'node-c']);
const TEST_PRIORITY_TABLE_IDS = Object.freeze([
  SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
  SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
  SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS,
]);

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function buildPriorityPlacementCache() {
  const cache = new SystemTableCache();
  for (const tableId of TEST_PRIORITY_TABLE_IDS) {
    const partitionId = INITIAL_PARTITION_IDS[tableId];
    cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.UPSERT, {
      partition_id: partitionId,
      table_id: tableId,
      table_name: tableId,
      leader_node_id: TEST_NODE_IDS[0],
      state: 'NORMAL',
    });
    for (const [index, nodeId] of TEST_NODE_IDS.entries()) {
      const replicaId = `${partitionId}-r${index + 1}`;
      cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
        service_id: replicaId,
        service_type: 'partition',
        partition_id: partitionId,
        replica_id: replicaId,
        node_id: nodeId,
        status: 'active',
        raft_role: 'follower',
        address: `${nodeId}/partition/${replicaId}`,
        created_at: TEST_NOW_MS,
        updated_at: TEST_NOW_MS,
      });
    }
  }
  return cache;
}

function buildPlacementObservation(cache) {
  return buildCurrentPriorityPlacementObservation({
    capturedAt: TEST_NOW_MS,
    partitionRows: cache.getAll(TABLES.PARTITIONS),
    serviceRows: cache.getAll(TABLES.SERVICES),
    readinessByNodeId: {},
    activeNodeViews: {
      locallyEligibleNodeIds: [...TEST_NODE_IDS],
      effectiveActiveNodeIds: [...TEST_NODE_IDS],
      projectedServingNodeIds: [...TEST_NODE_IDS],
      publishedActiveNodeIds: [...TEST_NODE_IDS],
    },
  });
}

function buildAdmissionSnapshot(observation) {
  return {
    capturedAt: TEST_NOW_MS,
    snapshotObservation: {state: 'fresh', reasonCodes: []},
    replicaOperations: {
      inFlightCount: 0,
      staleInFlightCount: 0,
      rows: [],
    },
    leaders: {'ratings-p1': 'node-a'},
    controlPlaneDiagnostics: {
      currentPriorityPlacementObservation: observation,
      priorityRecoveryObservation: {
        priorityPartitionSummary: observation.priorityPartitionSummary,
      },
    },
  };
}

async function admitPlacement(observation) {
  let nowMs = TEST_NOW_MS;
  return waitForAffinityDemoSchemaAdmission({
    target: 'ws://127.0.0.1:8081/api/admin/stream',
    query: async () => ({rows: [buildAdmissionSnapshot(observation)]}),
    now: () => nowMs,
    sleep: async () => {
      nowMs += 1;
    },
    timeoutMs: 4,
    pollIntervalMs: 0,
    stableWindowMs: 0,
  });
}

function createServicesPartition() {
  const replicaIds = ['services-test-r1', 'services-test-r2', 'services-test-r3'];
  return new PartitionService({
    partitionId: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES],
    tableId: SYSTEM_TABLE_NAME.SERVICES,
    tableName: SYSTEM_TABLE_NAME.SERVICES,
    replicaId: replicaIds[0],
    replicaIds,
    peerAddresses: replicaIds.map(
      (replicaId) => `test-node/partition/${replicaId}`,
    ),
    schema: SERVICES_SCHEMA,
    dbPath: ':memory:',
  });
}

test('MovieLens schema admission rejects a stale priority lifecycle overlay',
  async (t) => {
    const cache = buildPriorityPlacementCache();
    const targetReplicaId =
      `${INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS]}-r3`;
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {
      service_id: targetReplicaId,
      status: 'syncing',
      updated_at: TEST_NOW_MS + 1,
      updated_at_hlc: `${TEST_NOW_MS + 1}:0:test-node`,
    });

    const observation = buildPlacementObservation(cache);
    t.equal(observation.satisfied, false);
    t.equal(observation.priorityPartitionSummary.totalSpreadGap, 1);
    await t.rejects(
      admitPlacement(observation),
      /critical_system_spread_gap=1/,
      'the unchanged schema gate must remain closed on a real stale overlay',
    );
    t.end();
  });

test('zero-change Raft apply cannot overwrite completed priority placement',
  async (t) => {
    const cache = buildPriorityPlacementCache();
    const partition = createServicesPartition();
    await partition.initialize();
    partition.role = 'leader';
    partition.isLeader = true;
    partition.leaderId = partition.replicaId;
    partition.raft.state = LifeRaft.LEADER;
    await partition.subscribeToCDCWithHandshake((event) => {
      cache.applySystemTableChange(
        event.tableName,
        event.operation,
        event.data,
      );
    });
    partition.raftProvider.propose = async (_raft, entry) => {
      partition.applyCommittedEntry(entry);
    };

    const targetReplicaId =
      `${INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS]}-r3`;
    const result = await partition.updateData(
      SYSTEM_TABLE_NAME.SERVICES,
      {service_id: targetReplicaId},
      {
        status: 'syncing',
        updated_at: TEST_NOW_MS + 1,
      },
    );
    await Promise.all([...partition.pendingCDCEventDeliveries]);

    t.equal(result.success, true);
    t.equal(result.changes, 0, 'the local state-machine update is a no-op');
    t.equal(
      cache.get(TABLES.SERVICES, targetReplicaId)?.status,
      'active',
      'a no-op replica apply must not publish a stale lifecycle payload',
    );
    const observation = buildPlacementObservation(cache);
    t.equal(observation.satisfied, true);
    t.equal(observation.priorityPartitionSummary.totalSpreadGap, 0);
    t.equal(observation.leaderCoverage.missingLeaderPartitionCount, 0);
    const admission = await admitPlacement(observation);
    t.equal(
      admission.admitted,
      true,
      'completed placement must reach the unchanged MovieLens schema gate',
    );

    await partition.shutdown();
    t.end();
  });
