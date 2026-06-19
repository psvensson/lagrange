import {test} from '../../src/test-helpers/tap.js';
import {
  COLUMN,
  CDC_OPERATION,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  AuthoritativeNodeEvidenceReconciler,
} from '../../src/control-plane/authoritative-node-evidence-reconciler.js';
import {
  CONTROL_PLANE_CACHE_RECONCILE_INTENT,
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';

const TEST_CONNECTION_STATE_READY = 'ready';
const TEST_LAST_HEARTBEAT = 1000;
const TEST_READY_LEASE_EXPIRES_AT = 2000;
const TEST_REPAIR_EVIDENCE_STATE_OBSERVED_EMPTY_UNCONFIRMED =
  'observed_empty_unconfirmed';
const TEST_REPAIR_EVIDENCE_STATE_OBSERVED_EMPTY_CONFIRMED =
  'observed_empty_confirmed';
const TEST_SEED_NODE_ID = 'seed-node';
const TEST_AUTHORITATIVE_READ_FAILURE = Object.freeze({
  success: false,
  rows: [],
});
const TEST_AUTHORITATIVE_REPAIR_LANE = Object.freeze({
  async run(_key, operation) {
    return operation();
  },
});

function createNodeRow(nodeId) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.CONNECTION_STATE]: TEST_CONNECTION_STATE_READY,
    [COLUMN.LAST_HEARTBEAT]: TEST_LAST_HEARTBEAT,
    [COLUMN.READY_LEASE_EXPIRES_AT]: TEST_READY_LEASE_EXPIRES_AT,
  };
}

function createServiceRow(nodeId, serviceId) {
  return {
    [COLUMN.SERVICE_ID]: serviceId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.PARTITION_ID]: `${serviceId}-partition`,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${nodeId}/partition/${serviceId}`,
  };
}

function createPartitionRow(partitionId, leaderNodeId = TEST_SEED_NODE_ID) {
  return {
    [COLUMN.PARTITION_ID]: partitionId,
    [COLUMN.TABLE_NAME]: TABLES.SQL_TRANSACTIONS,
    [COLUMN.LEADER_NODE_ID]: leaderNodeId,
  };
}

function createCacheWithNodeEvidence(nodeId) {
  const cache = new SystemTableCache();
  const firstServiceRow = createServiceRow(nodeId, `${nodeId}-svc-1`);
  const secondServiceRow = createServiceRow(nodeId, `${nodeId}-svc-2`);
  cache.applySystemTableChange(
    TABLES.NODES,
    CDC_OPERATION.UPSERT,
    createNodeRow(nodeId),
  );
  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATION.UPSERT,
    firstServiceRow,
  );
  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATION.UPSERT,
    secondServiceRow,
  );
  cache.applySystemTableChange(
    TABLES.PARTITIONS,
    CDC_OPERATION.UPSERT,
    createPartitionRow(firstServiceRow[COLUMN.PARTITION_ID]),
  );
  cache.applySystemTableChange(
    TABLES.PARTITIONS,
    CDC_OPERATION.UPSERT,
    createPartitionRow(secondServiceRow[COLUMN.PARTITION_ID]),
  );
  return cache;
}

function createNodeEvidenceReconciler({
  nodeId,
  cache,
  snapshot,
}) {
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: TEST_SEED_NODE_ID,
    systemTableCache: cache,
  });
  return new AuthoritativeNodeEvidenceReconciler({
    nodeId: TEST_SEED_NODE_ID,
    authoritativeReadinessRepairLane: TEST_AUTHORITATIVE_REPAIR_LANE,
    cacheMutationTarget: cache,
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead() {
        return TEST_AUTHORITATIVE_READ_FAILURE;
      },
    },
    controlPlaneSystemTableGateway: gateway,
    getAuthoritativeControlPlaneView() {
      return {
        async readNodeSnapshot() {
          return snapshot;
        },
      };
    },
    logger: {
      info() {},
      warn() {},
    },
    readNodeRow: async () => {
      return cache.getAll(TABLES.NODES).find((row) =>
        row?.[COLUMN.NODE_ID] === nodeId,
      ) || null;
    },
    readNodeServiceRows: async () => {
      return cache.getAll(TABLES.SERVICES).filter((row) =>
        row?.[COLUMN.NODE_ID] === nodeId,
      );
    },
    readNodePartitionRows: async () => {
      const partitionIds = new Set(
        cache.getAll(TABLES.SERVICES)
          .filter((row) => row?.[COLUMN.NODE_ID] === nodeId)
          .map((row) => row?.[COLUMN.PARTITION_ID])
          .filter((partitionId) => typeof partitionId === 'string'),
      );
      return cache.getAll(TABLES.PARTITIONS).filter((row) =>
        partitionIds.has(row?.[COLUMN.PARTITION_ID]),
      );
    },
    systemTableCache: cache,
  });
}

test('AuthoritativeNodeEvidenceReconciler preserves cached node evidence ' +
  'when empty local replica reads are unconfirmed', async (t) => {
  const nodeId = 'node-empty-local-repair';
  const cache = createCacheWithNodeEvidence(nodeId);
  const reconciler = createNodeEvidenceReconciler({
    nodeId,
    cache,
    snapshot: {
      tables: {
        nodes: {
          success: true,
          rows: [],
          source: 'local_partition_replica',
          localReadHit: true,
          localReplicaFallbackHit: true,
        },
        services: {
          success: true,
          rows: [],
          source: 'local_partition_replica',
          localReadHit: true,
          localReplicaFallbackHit: true,
        },
        partitions: {
          success: true,
          rows: [],
          source: 'local_partition_replica',
          localReadHit: true,
          localReplicaFallbackHit: true,
        },
      },
    },
  });

  const repaired = await reconciler.ensureNodeEvidence(nodeId);
  const latestRepair = reconciler.getLatestRepair(nodeId);

  t.equal(repaired, false, 'empty refresh should not report a cache mutation');
  t.equal(
    latestRepair?.repairIntent,
    CONTROL_PLANE_CACHE_RECONCILE_INTENT.REFRESH_EVIDENCE,
    'readiness repair should use refresh-only reconcile intent',
  );
  t.equal(
    latestRepair?.nodeEvidenceState,
    TEST_REPAIR_EVIDENCE_STATE_OBSERVED_EMPTY_UNCONFIRMED,
    'local empty node reads should be classified as unconfirmed emptiness',
  );
  t.equal(
    latestRepair?.serviceEvidenceState,
    TEST_REPAIR_EVIDENCE_STATE_OBSERVED_EMPTY_UNCONFIRMED,
    'local empty service reads should be classified as unconfirmed emptiness',
  );
  t.equal(
    cache.getAll(TABLES.NODES).length,
    1,
    'refresh-only empty reads should preserve the cached node row',
  );
  t.equal(
    cache.getAll(TABLES.SERVICES).length,
    2,
    'refresh-only empty reads should preserve cached service rows',
  );
  t.equal(
    cache.getAll(TABLES.PARTITIONS).length,
    2,
    'refresh-only empty reads should preserve cached partition rows',
  );
});

test('AuthoritativeNodeEvidenceReconciler distinguishes confirmed empty ' +
  'reads without pruning cached evidence', async (t) => {
  const nodeId = 'node-empty-confirmed-repair';
  const cache = createCacheWithNodeEvidence(nodeId);
  const reconciler = createNodeEvidenceReconciler({
    nodeId,
    cache,
    snapshot: {
      tables: {
        nodes: {
          success: true,
          rows: [],
          source: 'owner_rpc_lane',
        },
        services: {
          success: true,
          rows: [],
          source: 'owner_rpc_lane',
        },
        partitions: {
          success: true,
          rows: [],
          source: 'owner_rpc_lane',
        },
      },
    },
  });

  const repaired = await reconciler.ensureNodeEvidence(nodeId);
  const latestRepair = reconciler.getLatestRepair(nodeId);

  t.equal(repaired, false, 'confirmed empty refresh should not prune cache');
  t.equal(
    latestRepair?.nodeEvidenceState,
    TEST_REPAIR_EVIDENCE_STATE_OBSERVED_EMPTY_CONFIRMED,
    'owner-rpc empty node reads should be classified as confirmed emptiness',
  );
  t.equal(
    latestRepair?.serviceEvidenceState,
    TEST_REPAIR_EVIDENCE_STATE_OBSERVED_EMPTY_CONFIRMED,
    'owner-rpc empty service reads should be classified as confirmed emptiness',
  );
  t.equal(
    latestRepair?.partitionEvidenceState,
    TEST_REPAIR_EVIDENCE_STATE_OBSERVED_EMPTY_CONFIRMED,
    'owner-rpc empty partition reads should be classified as confirmed emptiness',
  );
  t.equal(
    cache.getAll(TABLES.NODES).length,
    1,
    'confirmed empty refreshes should still preserve cached node evidence',
  );
  t.equal(
    cache.getAll(TABLES.SERVICES).length,
    2,
    'confirmed empty refreshes should still preserve cached service evidence',
  );
  t.equal(
    cache.getAll(TABLES.PARTITIONS).length,
    2,
    'confirmed empty refreshes should still preserve cached partition evidence',
  );
});

test('AuthoritativeNodeEvidenceReconciler repairs partition owner rows ' +
  'for the node service set', async (t) => {
  const nodeId = 'node-partition-owner-repair';
  const partitionId = 'sql_transactions-p1';
  const authoritativeLeaderNodeId = 'node-authoritative-leader';
  const cache = new SystemTableCache();
  cache.applySystemTableChange(
    TABLES.NODES,
    CDC_OPERATION.UPSERT,
    createNodeRow(nodeId),
  );
  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATION.UPSERT,
    {
      ...createServiceRow(nodeId, `${nodeId}-svc-1`),
      [COLUMN.PARTITION_ID]: partitionId,
    },
  );
  cache.applySystemTableChange(
    TABLES.PARTITIONS,
    CDC_OPERATION.UPSERT,
    createPartitionRow(partitionId, null),
  );

  const reconciler = createNodeEvidenceReconciler({
    nodeId,
    cache,
    snapshot: {
      tables: {
        nodes: {
          success: true,
          rows: [createNodeRow(nodeId)],
          source: 'owner_rpc_lane',
        },
        services: {
          success: true,
          rows: [{
            ...createServiceRow(nodeId, `${nodeId}-svc-1`),
            [COLUMN.PARTITION_ID]: partitionId,
          }],
          source: 'owner_rpc_lane',
        },
        partitions: {
          success: true,
          rows: [createPartitionRow(partitionId, authoritativeLeaderNodeId)],
          source: 'owner_rpc_lane',
        },
      },
    },
  });

  const repaired = await reconciler.ensureNodeEvidence(nodeId);
  const latestRepair = reconciler.getLatestRepair(nodeId);
  const repairedPartitionRow =
    cache.getAll(TABLES.PARTITIONS).find((row) =>
      row?.[COLUMN.PARTITION_ID] === partitionId,
    ) || null;

  t.equal(repaired, true, 'partition owner refresh should report a mutation');
  t.equal(
    latestRepair?.partitionRowCount,
    1,
    'repair metadata should record the authoritative partition row count',
  );
  t.equal(
    latestRepair?.partitionEvidenceState,
    'observed_rows',
    'repair metadata should expose partition evidence state explicitly',
  );
  t.equal(
    repairedPartitionRow?.[COLUMN.LEADER_NODE_ID],
    authoritativeLeaderNodeId,
    'authoritative partition rows should refresh cached owner metadata',
  );
});

function createClockedReconcilerWithSnapshotCounter({cache, clock}) {
  let snapshotReadCount = 0;
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: TEST_SEED_NODE_ID,
    systemTableCache: cache,
  });
  const reconciler = new AuthoritativeNodeEvidenceReconciler({
    nodeId: TEST_SEED_NODE_ID,
    now: () => clock.value,
    authoritativeReadinessRepairBypassFloorMs: 1000,
    authoritativeReadinessRepairLane: TEST_AUTHORITATIVE_REPAIR_LANE,
    cacheMutationTarget: cache,
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead() {
        return TEST_AUTHORITATIVE_READ_FAILURE;
      },
    },
    controlPlaneSystemTableGateway: gateway,
    getAuthoritativeControlPlaneView() {
      return {
        async readNodeSnapshot() {
          snapshotReadCount += 1;
          return {
            tables: {
              nodes: {success: true, rows: [], source: 'owner_rpc_lane'},
              services: {success: true, rows: [], source: 'owner_rpc_lane'},
              partitions: {success: true, rows: [], source: 'owner_rpc_lane'},
            },
          };
        },
      };
    },
    logger: {info() {}, warn() {}},
    systemTableCache: cache,
  });
  return {reconciler, getSnapshotReadCount: () => snapshotReadCount};
}

const FRESH_ON_INELIGIBLE_OPTIONS = Object.freeze({
  allowAuthoritativeRefresh: true,
  requireFreshOnIneligible: true,
});

test('AuthoritativeNodeEvidenceReconciler floors cooldown-bypass repairs so a ' +
  'fresh-on-ineligible retry burst collapses instead of starving the node', async (t) => {
  const nodeId = 'node-bypass-floor';
  const cache = createCacheWithNodeEvidence(nodeId);
  const clock = {value: 10000};
  const {reconciler, getSnapshotReadCount} =
    createClockedReconcilerWithSnapshotCounter({nodeId, cache, clock});

  // First fresh-on-ineligible repair always executes an authoritative read.
  await reconciler.ensureNodeEvidence(nodeId, FRESH_ON_INELIGIBLE_OPTIONS);
  t.equal(getSnapshotReadCount(), 1, 'first bypass repair performs the read');

  // A second bypass repair within the 1000ms floor adds load with no freshness
  // benefit — it must be floored out (skipped), NOT re-issued.
  clock.value = 10500;
  await reconciler.ensureNodeEvidence(nodeId, FRESH_ON_INELIGIBLE_OPTIONS);
  t.equal(
    getSnapshotReadCount(),
    1,
    'bypass repair within the floor window is skipped (no second read)',
  );

  // Once the floor elapses, a bypass caller is served a fresh read again — the
  // floor bounds load without blocking force-fresh responsiveness for 5-15s.
  clock.value = 11200;
  await reconciler.ensureNodeEvidence(nodeId, FRESH_ON_INELIGIBLE_OPTIONS);
  t.equal(
    getSnapshotReadCount(),
    2,
    'bypass repair past the floor window performs a fresh read',
  );
});

test('AuthoritativeNodeEvidenceReconciler keeps the full cooldown for ' +
  'non-bypass callers (bypass floor does not weaken normal throttling)', async (t) => {
  const nodeId = 'node-non-bypass-cooldown';
  const cache = createCacheWithNodeEvidence(nodeId);
  const clock = {value: 10000};
  const {reconciler, getSnapshotReadCount} =
    createClockedReconcilerWithSnapshotCounter({nodeId, cache, clock});

  await reconciler.ensureNodeEvidence(nodeId);
  t.equal(getSnapshotReadCount(), 1, 'first non-bypass repair performs the read');

  // 2s later — well past the 1000ms bypass floor but inside the normal no-change
  // cooldown. A non-bypass caller must still be throttled (no second read).
  clock.value = 12000;
  await reconciler.ensureNodeEvidence(nodeId);
  t.equal(
    getSnapshotReadCount(),
    1,
    'non-bypass repair inside the normal cooldown is still skipped',
  );
});
