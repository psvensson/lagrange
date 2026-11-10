import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CACHE_CDC_OPERATIONS} from '../../src/cache/cache-constants.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  createCommittedServeEligibilityOwner,
} from '../control-plane/serve-eligibility-test-support.js';
import {
  createMockMessageRouter,
  createMockSystemCache,
} from './sql-query-engine-test-support.js';

const SYSTEM_TABLE_BRIDGE_RETENTION_MODE = 'system_table_service_gap_bridge';
const SYSTEM_TABLE_NODES = TABLES.NODES;
const NON_EXPIRING_RETENTION_MS = Number.POSITIVE_INFINITY;
const AUTHORITATIVE_OVERLAY_STATE = Object.freeze({
  AVAILABLE: 'available',
  AUTHORITATIVE_MISSING: 'authoritative_missing',
  MISSING: 'missing',
});
const AUTHORITATIVE_OVERLAY_PARTITION_STATE = Object.freeze({
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
});
const AUTHORITATIVE_OVERLAY_CACHE_SERVICE_STATE = Object.freeze({
  ELIGIBLE: 'eligible',
  MASKED: 'masked',
});

function createEngine() {
  const engine = Object.create(SQLQueryEngine.prototype);
  engine.authoritativeRoutingOverlayEntries = new Map();
  engine.bootstrapRoutingOverlayEntries = new Map();
  engine.nowFn = () => 1000;
  engine.getCachedPartitionRecord = () => null;
  engine.getPartitionServiceRows = () => [];
  engine.partitionMatchesTableRef = () => true;
  engine.isPartitionVisibleForRouting = () => true;
  engine.isSystemTable = (tableRef) => tableRef === SYSTEM_TABLE_NODES;
  engine.tablePartitionProvisioningTimeoutMs = 5000;
  return engine;
}

test('SQLQueryEngine exposes missing authoritative overlay state explicitly',
  async (t) => {
    const engine = createEngine();

    t.same(
      engine.getAuthoritativeRoutingOverlayEntryState('partition-1'),
      {
        state: AUTHORITATIVE_OVERLAY_STATE.MISSING,
        partitionState: AUTHORITATIVE_OVERLAY_PARTITION_STATE.UNAVAILABLE,
        cacheServiceState: AUTHORITATIVE_OVERLAY_CACHE_SERVICE_STATE.ELIGIBLE,
        services: [],
      },
      'missing authoritative overlay entries should use an explicit state',
    );
  });

test('SQLQueryEngine exposes authoritative overlay service-only state explicitly',
  async (t) => {
    const engine = createEngine();
    engine.authoritativeRoutingOverlayEntries.set('partition-1', {
      services: [
        {service_id: 'svc-1'},
      ],
    });

    const state = engine.getAuthoritativeRoutingOverlayEntryState('partition-1');

    t.equal(state.state, AUTHORITATIVE_OVERLAY_STATE.AVAILABLE);
    t.equal(
      state.partitionState,
      AUTHORITATIVE_OVERLAY_PARTITION_STATE.UNAVAILABLE,
    );
    t.equal(
      state.cacheServiceState,
      AUTHORITATIVE_OVERLAY_CACHE_SERVICE_STATE.MASKED,
    );
    t.same(state.services, [{service_id: 'svc-1'}]);
  });

test('SQLQueryEngine exposes authoritative-missing overlay state explicitly',
  async (t) => {
    const engine = createEngine();
    engine.authoritativeRoutingOverlayEntries.set('partition-1', {
      state: AUTHORITATIVE_OVERLAY_STATE.AUTHORITATIVE_MISSING,
      partition: null,
      services: [],
    });

    t.same(
      engine.getAuthoritativeRoutingOverlayEntryState('partition-1'),
      {
        state: AUTHORITATIVE_OVERLAY_STATE.AUTHORITATIVE_MISSING,
        partitionState: AUTHORITATIVE_OVERLAY_PARTITION_STATE.UNAVAILABLE,
        cacheServiceState: AUTHORITATIVE_OVERLAY_CACHE_SERVICE_STATE.MASKED,
        services: [],
      },
      'authoritative absence should remain explicit so stale cache rows can be masked',
    );
    t.equal(
      engine.shouldAuthoritativeRoutingOverlayMaskCacheServices('partition-1'),
      true,
      'authoritative absence should suppress stale cached service rows',
    );
  });

test('SQLQueryEngine expires bootstrap overlay entries into an explicit state',
  async (t) => {
    const engine = createEngine();
    engine.bootstrapRoutingOverlayEntries.set('partition-1', {
      partition: {partition_id: 'partition-1'},
      services: [{service_id: 'svc-1'}],
      expiresAtMs: 999,
    });

    const state = engine.getBootstrapRoutingOverlayEntryState('partition-1');

    t.same(
      state,
      {
        entry: null,
        partition: null,
        state: 'expired',
        reason: 'expired',
        partitionState: 'unavailable',
        services: [],
      },
      'expired bootstrap overlay entries should not masquerade as missing',
    );
    t.equal(
      engine.bootstrapRoutingOverlayEntries.has('partition-1'),
      false,
      'expired bootstrap overlay entries should be removed',
    );
  });

test('SQLQueryEngine keeps bootstrap overlays available during a cache leader service gap',
  async (t) => {
    const engine = createEngine();
    engine.getCachedPartitionRecord = () => ({
      leader_node_id: 'node-1',
    });
    engine.bootstrapRoutingOverlayEntries.set('partition-1', {
      partition: {partition_id: 'partition-1'},
      services: [
        {
          service_id: 'svc-1',
          service_type: SERVICE_TYPE.PARTITION,
          partition_id: 'partition-1',
          node_id: 'node-1',
          status: SERVICE_STATUS.ACTIVE,
          address: 'node-1/partition/partition-1-r1',
        },
        {
          service_id: 'svc-2',
          service_type: SERVICE_TYPE.PARTITION,
          partition_id: 'partition-1',
          node_id: 'node-2',
          status: SERVICE_STATUS.ACTIVE,
          address: 'node-2/partition/partition-1-r2',
        },
      ],
      expiresAtMs: 2000,
    });

    const state = engine.getBootstrapRoutingOverlayEntryState('partition-1');

    t.equal(state.state, 'available');
    t.equal(state.reason, 'leader_service_gap');
    t.equal(state.partitionState, 'available');
    t.equal(state.partition?.leader_node_id, 'node-1');
    t.same(
      state.services.map((service) => service.node_id),
      ['node-1'],
      'bootstrap overlay should narrow to current-leader services while cache service rows are missing',
    );
  },
);

test('SQLQueryEngine keeps system-table bootstrap overlays alive past the ' +
  'provisioning timeout while the leader service gap persists',
async (t) => {
  const engine = createEngine();
  engine.getCachedPartitionRecord = () => ({
    leader_node_id: 'node-1',
    table_name: SYSTEM_TABLE_NODES,
  });
  engine.bootstrapRoutingOverlayEntries.set('partition-1', {
    partition: {
      partition_id: 'partition-1',
      table_name: SYSTEM_TABLE_NODES,
    },
    services: [
      {
        service_id: 'svc-1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: 'partition-1',
        node_id: 'node-1',
        status: SERVICE_STATUS.ACTIVE,
        address: 'node-1/partition/partition-1-r1',
      },
    ],
    expiresAtMs: 999,
    retentionMode: SYSTEM_TABLE_BRIDGE_RETENTION_MODE,
  });

  const state = engine.getBootstrapRoutingOverlayEntryState('partition-1');

  t.equal(state.state, 'available');
  t.equal(state.reason, 'leader_service_gap');
  t.equal(state.partitionState, 'available');
  t.equal(
    engine.bootstrapRoutingOverlayEntries.has('partition-1'),
    true,
    'system-table service-gap bridges should not expire on the provisioning timer',
  );
});

test('SQLQueryEngine marks bootstrap overlays superseded when cache leader service exists',
  async (t) => {
    const engine = createEngine();
    engine.getCachedPartitionRecord = () => ({
      leader_node_id: 'node-1',
    });
    engine.getPartitionServiceRows = () => [{
      service_id: 'svc-cache',
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: 'partition-1',
      node_id: 'node-1',
      status: SERVICE_STATUS.ACTIVE,
      address: 'node-1/partition/partition-1-r1',
    }];
    engine.bootstrapRoutingOverlayEntries.set('partition-1', {
      partition: {partition_id: 'partition-1'},
      services: [{service_id: 'svc-1'}],
      expiresAtMs: 2000,
    });

    const state = engine.getBootstrapRoutingOverlayEntryState('partition-1');

    t.same(
      state,
      {
        entry: null,
        partition: null,
        state: 'superseded',
        reason: 'cache_leader_service_ready',
        partitionState: 'unavailable',
        services: [],
      },
      'bootstrap overlay entries should resolve to a distinct superseded state once cache routing is covered',
    );
  });

test('SQLQueryEngine retains system-table bootstrap bridges after cache ' +
  'coverage so they can reactivate on later service regressions',
async (t) => {
  const engine = createEngine();
  engine.getCachedPartitionRecord = () => ({
    leader_node_id: 'node-1',
    table_name: SYSTEM_TABLE_NODES,
  });
  engine.getPartitionServiceRows = () => [{
    service_id: 'svc-cache',
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: 'partition-1',
    node_id: 'node-1',
    status: SERVICE_STATUS.ACTIVE,
    address: 'node-1/partition/partition-1-r1',
  }];
  engine.bootstrapRoutingOverlayEntries.set('partition-1', {
    partition: {
      partition_id: 'partition-1',
      table_name: SYSTEM_TABLE_NODES,
    },
    services: [{
      service_id: 'svc-1',
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: 'partition-1',
      node_id: 'node-1',
      status: SERVICE_STATUS.ACTIVE,
      address: 'node-1/partition/partition-1-r1',
    }],
    expiresAtMs: NON_EXPIRING_RETENTION_MS,
    retentionMode: SYSTEM_TABLE_BRIDGE_RETENTION_MODE,
  });

  const state = engine.getBootstrapRoutingOverlayEntryState('partition-1');

  t.equal(state.state, 'superseded');
  t.equal(
    engine.bootstrapRoutingOverlayEntries.has('partition-1'),
    true,
    'system-table bootstrap bridges should remain installed while cache routing is healthy',
  );
});

function buildPartitionRow({
  partitionId = 'users-p1',
  tableName = 'users',
  leaderNodeId = 'node-1',
  replicaCount = 1,
  partitionVersion = 1,
  state = 'NORMAL',
  updatedAt = 100,
} = {}) {
  return {
    partition_id: partitionId,
    table_name: tableName,
    leader_node_id: leaderNodeId,
    replica_count: replicaCount,
    partition_version: partitionVersion,
    state,
    updated_at: updatedAt,
  };
}

function buildPartitionServiceRow({
  serviceId = 'users-p1-r1',
  partitionId = 'users-p1',
  nodeId = 'node-1',
  raftRole = 'leader',
  status = SERVICE_STATUS.ACTIVE,
  address = `${nodeId}/partition/${serviceId}`,
  updatedAt = 100,
} = {}) {
  return {
    service_id: serviceId,
    replica_id: serviceId,
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: partitionId,
    node_id: nodeId,
    raft_role: raftRole,
    status,
    address,
    updated_at: updatedAt,
  };
}

function createAuthoritativeViewStub(getSnapshot) {
  return {
    async readRows(tableName) {
      const snapshot = getSnapshot();
      if (tableName === TABLES.PARTITIONS) {
        return {success: true, rows: snapshot.partitions};
      }
      if (tableName === TABLES.SERVICES) {
        return {success: true, rows: snapshot.services};
      }
      return {success: false, rows: []};
    },
  };
}

test('SQLQueryEngine retires T0 masked authoritative overlay immediately when ' +
  'SystemTableCache receives a new SERVICES replica or updated PARTITIONS metadata',
async (t) => {
  const partitionId = 'users-p1';
  const systemCache = new SystemTableCache({
    scheduleCacheChangeNotification: () => {},
  });
  let authoritativeSnapshot = {
    partitions: [buildPartitionRow({partitionId, replicaCount: 1, updatedAt: 100})],
    services: [buildPartitionServiceRow({partitionId, serviceId: 'users-p1-r1', updatedAt: 100})],
  };
  systemCache.applySystemTableChange(
    TABLES.PARTITIONS,
    CACHE_CDC_OPERATIONS.INSERT,
    authoritativeSnapshot.partitions[0],
  );
  systemCache.applySystemTableChange(
    TABLES.SERVICES,
    CACHE_CDC_OPERATIONS.INSERT,
    authoritativeSnapshot.services[0],
  );

  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache,
    messageRouter: createMockMessageRouter(),
    authoritativeControlPlaneView: createAuthoritativeViewStub(() => authoritativeSnapshot),
    autoStartDistributedTransactionRecovery: false,
  });

  t.equal(await engine.refreshAuthoritativeRoutingOverlay(partitionId), true);
  t.equal(engine.authoritativeRoutingOverlayEntries.has(partitionId), true);
  t.equal(
    engine.shouldAuthoritativeRoutingOverlayMaskCacheServices(partitionId),
    true,
    'T0 complete authoritative overlay should mask cache services prior to cache advancement',
  );

  // 1) New SERVICES replica row retires the T0 overlay synchronously via onCacheApplyChange.
  systemCache.applySystemTableChange(
    TABLES.SERVICES,
    CACHE_CDC_OPERATIONS.INSERT,
    buildPartitionServiceRow({
      partitionId,
      serviceId: 'users-p1-r2',
      nodeId: 'node-2',
      raftRole: 'follower',
      updatedAt: 110,
    }),
  );

  t.equal(
    engine.authoritativeRoutingOverlayEntries.has(partitionId),
    false,
    'new cached SERVICES replica should synchronously retire the T0 repair overlay',
  );
  t.equal(
    engine.getAuthoritativeRoutingOverlayEntryState(partitionId).state,
    AUTHORITATIVE_OVERLAY_STATE.MISSING,
  );
  t.same(
    engine.queryExecutor.getPartitionServiceRows(partitionId)
      .map((row) => row.service_id).sort(),
    ['users-p1-r1', 'users-p1-r2'],
    'QueryExecutor should immediately observe both replicas from SystemTableCache',
  );

  // 2) Re-install T0 overlay and advance PARTITIONS replica_count.
  authoritativeSnapshot = {
    partitions: [buildPartitionRow({partitionId, replicaCount: 2, updatedAt: 120})],
    services: [
      buildPartitionServiceRow({partitionId, serviceId: 'users-p1-r1', updatedAt: 100}),
      buildPartitionServiceRow({
        partitionId,
        serviceId: 'users-p1-r2',
        nodeId: 'node-2',
        raftRole: 'follower',
        updatedAt: 110,
      }),
    ],
  };
  systemCache.applySystemTableChange(
    TABLES.PARTITIONS,
    CACHE_CDC_OPERATIONS.UPDATE,
    authoritativeSnapshot.partitions[0],
  );
  t.equal(await engine.refreshAuthoritativeRoutingOverlay(partitionId), true);
  t.equal(engine.authoritativeRoutingOverlayEntries.has(partitionId), true);

  systemCache.applySystemTableChange(
    TABLES.PARTITIONS,
    CACHE_CDC_OPERATIONS.UPDATE,
    buildPartitionRow({partitionId, replicaCount: 3, updatedAt: 130}),
  );

  t.equal(
    engine.authoritativeRoutingOverlayEntries.has(partitionId),
    false,
    'updated PARTITIONS replica_count should synchronously retire the T0 repair overlay',
  );
  t.equal(
    engine.queryExecutor.getPartitionRecord(partitionId)?.replica_count,
    3,
    'QueryExecutor should observe updated cached replica_count once overlay retires',
  );

  // 3) Deterministic on-read retirement on caches without onCacheApplyChange
  // when PARTITIONS leader_node_id advances.
  const mockCache = createMockSystemCache(
    [],
    [buildPartitionRow({partitionId, leaderNodeId: 'node-1', replicaCount: 1, updatedAt: 200})],
    [buildPartitionServiceRow({partitionId, serviceId: 'users-p1-r1', updatedAt: 200})],
  );
  const mockEngine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: mockCache,
    messageRouter: createMockMessageRouter(),
    authoritativeControlPlaneView: createAuthoritativeViewStub(() => ({
      partitions: [buildPartitionRow({
        partitionId,
        leaderNodeId: 'node-1',
        replicaCount: 1,
        updatedAt: 200,
      })],
      services: [buildPartitionServiceRow({
        partitionId,
        serviceId: 'users-p1-r1',
        updatedAt: 200,
      })],
    })),
    autoStartDistributedTransactionRecovery: false,
  });

  t.equal(await mockEngine.refreshAuthoritativeRoutingOverlay(partitionId), true);
  t.equal(mockEngine.authoritativeRoutingOverlayEntries.has(partitionId), true);

  mockCache.applySystemTableChange(
    TABLES.PARTITIONS,
    CACHE_CDC_OPERATIONS.UPDATE,
    buildPartitionRow({partitionId, leaderNodeId: 'node-2', replicaCount: 1, updatedAt: 210}),
  );

  t.equal(
    mockEngine.getAuthoritativeRoutingOverlayEntryState(partitionId).state,
    AUTHORITATIVE_OVERLAY_STATE.MISSING,
    'on-read currency check should deterministically retire overlay after leader_node_id change',
  );
  t.equal(mockEngine.authoritativeRoutingOverlayEntries.has(partitionId), false);
  t.equal(mockEngine.queryExecutor.getPartitionRecord(partitionId)?.leader_node_id, 'node-2');
});

test('SQLQueryEngine keeps unchanged pre-repair stale SystemTableCache rows ' +
  'masked until SystemTableCache actually advances',
async (t) => {
  const partitionId = 'users-p1';
  const systemCache = new SystemTableCache({
    scheduleCacheChangeNotification: () => {},
  });
  systemCache.applySystemTableChange(
    TABLES.PARTITIONS,
    CACHE_CDC_OPERATIONS.INSERT,
    buildPartitionRow({partitionId, leaderNodeId: 'stale-node', replicaCount: 1, updatedAt: 50}),
  );
  systemCache.applySystemTableChange(
    TABLES.SERVICES,
    CACHE_CDC_OPERATIONS.INSERT,
    buildPartitionServiceRow({
      partitionId,
      serviceId: 'users-p1-r-stale',
      nodeId: 'stale-node',
      updatedAt: 50,
    }),
  );

  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache,
    messageRouter: createMockMessageRouter(),
    authoritativeControlPlaneView: createAuthoritativeViewStub(() => ({
      partitions: [buildPartitionRow({
        partitionId,
        leaderNodeId: 'owner-node',
        replicaCount: 1,
        updatedAt: 100,
      })],
      services: [buildPartitionServiceRow({
        partitionId,
        serviceId: 'users-p1-r-owner',
        nodeId: 'owner-node',
        updatedAt: 100,
      })],
    })),
    autoStartDistributedTransactionRecovery: false,
  });

  t.equal(await engine.refreshAuthoritativeRoutingOverlay(partitionId), true);
  t.equal(
    engine.shouldAuthoritativeRoutingOverlayMaskCacheServices(partitionId),
    true,
    'unchanged pre-repair stale cache rows must stay masked',
  );
  t.same(
    engine.queryExecutor.getPartitionServiceRows(partitionId).map((row) => row.service_id),
    ['users-p1-r-owner'],
    'QueryExecutor should see only the repaired authoritative service while cache lags',
  );

  // Partial CDC catch-up (PARTITIONS catches up to T0 while stale SERVICES row remains)
  // must keep masking the stale service until SERVICES in SystemTableCache also converges.
  systemCache.applySystemTableChange(
    TABLES.PARTITIONS,
    CACHE_CDC_OPERATIONS.UPDATE,
    buildPartitionRow({partitionId, leaderNodeId: 'owner-node', replicaCount: 1, updatedAt: 100}),
  );
  t.equal(
    engine.shouldAuthoritativeRoutingOverlayMaskCacheServices(partitionId),
    true,
    'stale cached SERVICES row must remain masked until SERVICES converges',
  );

  systemCache.applySystemTableChange(
    TABLES.SERVICES,
    CACHE_CDC_OPERATIONS.DELETE,
    {service_id: 'users-p1-r-stale', partition_id: partitionId, updated_at: 100},
  );
  systemCache.applySystemTableChange(
    TABLES.SERVICES,
    CACHE_CDC_OPERATIONS.INSERT,
    buildPartitionServiceRow({
      partitionId,
      serviceId: 'users-p1-r-owner',
      nodeId: 'owner-node',
      updatedAt: 100,
    }),
  );

  t.equal(
    engine.authoritativeRoutingOverlayEntries.has(partitionId),
    false,
    'overlay should retire once SystemTableCache converges to the repaired owner state',
  );
  t.same(
    engine.queryExecutor.getPartitionServiceRows(partitionId).map((row) => row.service_id),
    ['users-p1-r-owner'],
  );
});

test('SQLQueryEngine rejects regressive cache rows from retiring newer ' +
  'authoritative overlay evidence and retires missing overlays on appearance',
async (t) => {
  const partitionId = 'users-p1';
  const missingPartitionId = 'missing-p1';
  const systemCache = new SystemTableCache({
    scheduleCacheChangeNotification: () => {},
  });
  systemCache.applySystemTableChange(
    TABLES.PARTITIONS,
    CACHE_CDC_OPERATIONS.INSERT,
    buildPartitionRow({
      partitionId,
      leaderNodeId: 'node-1',
      partitionVersion: 1,
      updatedAt: 50,
    }),
  );
  systemCache.applySystemTableChange(
    TABLES.SERVICES,
    CACHE_CDC_OPERATIONS.INSERT,
    buildPartitionServiceRow({
      partitionId,
      serviceId: 'users-p1-r1',
      nodeId: 'node-1',
      updatedAt: 50,
    }),
  );

  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache,
    messageRouter: createMockMessageRouter(),
    authoritativeControlPlaneView: {
      async readRows(tableName, _sql, params) {
        if (params?.[0] === missingPartitionId) {
          return {success: true, rows: []};
        }
        if (tableName === TABLES.PARTITIONS) {
          return {
            success: true,
            rows: [buildPartitionRow({
              partitionId,
              leaderNodeId: 'node-2',
              partitionVersion: 2,
              updatedAt: 200,
            })],
          };
        }
        return {
          success: true,
          rows: [buildPartitionServiceRow({
            partitionId,
            serviceId: 'users-p1-r2',
            nodeId: 'node-2',
            updatedAt: 200,
          })],
        };
      },
    },
    autoStartDistributedTransactionRecovery: false,
  });

  t.equal(await engine.refreshAuthoritativeRoutingOverlay(partitionId), true);

  // Regressive updated_at (< overlay.updated_at 200, though > baseline 50)
  systemCache.applySystemTableChange(
    TABLES.PARTITIONS,
    CACHE_CDC_OPERATIONS.UPDATE,
    buildPartitionRow({
      partitionId,
      leaderNodeId: 'node-stale',
      partitionVersion: 2,
      updatedAt: 120,
    }),
  );
  t.equal(
    engine.authoritativeRoutingOverlayEntries.has(partitionId),
    true,
    'cached PARTITIONS row with updated_at < overlay.updated_at must not retire overlay',
  );

  // Regressive partition_version (< overlay.partition_version 2, even with higher updated_at)
  systemCache.applySystemTableChange(
    TABLES.PARTITIONS,
    CACHE_CDC_OPERATIONS.UPDATE,
    buildPartitionRow({
      partitionId,
      leaderNodeId: 'node-stale',
      partitionVersion: 1,
      updatedAt: 250,
    }),
  );
  t.equal(
    engine.authoritativeRoutingOverlayEntries.has(partitionId),
    true,
    'cached PARTITIONS row with partition_version < overlay.partition_version must not retire overlay',
  );

  // Regressive SERVICES rows (updated_at < overlay.updated_at 200)
  systemCache.applySystemTableChange(
    TABLES.SERVICES,
    CACHE_CDC_OPERATIONS.UPDATE,
    buildPartitionServiceRow({
      partitionId,
      serviceId: 'users-p1-r1',
      nodeId: 'node-stale',
      updatedAt: 150,
    }),
  );
  systemCache.applySystemTableChange(
    TABLES.SERVICES,
    CACHE_CDC_OPERATIONS.INSERT,
    buildPartitionServiceRow({
      partitionId,
      serviceId: 'users-p1-r0',
      nodeId: 'node-stale',
      updatedAt: 180,
    }),
  );
  t.equal(
    engine.shouldAuthoritativeRoutingOverlayMaskCacheServices(partitionId),
    true,
    'cached SERVICES rows older than authoritative overlay must not retire overlay',
  );
  t.equal(engine.queryExecutor.getPartitionRecord(partitionId)?.leader_node_id, 'node-2');

  // Authoritative-missing overlay with null baseline retires when PARTITIONS row appears.
  t.equal(await engine.refreshAuthoritativeRoutingOverlay(missingPartitionId), true);
  t.equal(
    engine.getAuthoritativeRoutingOverlayEntryState(missingPartitionId).state,
    AUTHORITATIVE_OVERLAY_STATE.AUTHORITATIVE_MISSING,
  );
  systemCache.applySystemTableChange(
    TABLES.PARTITIONS,
    CACHE_CDC_OPERATIONS.INSERT,
    buildPartitionRow({partitionId: missingPartitionId, leaderNodeId: 'node-3', updatedAt: 300}),
  );
  t.equal(
    engine.authoritativeRoutingOverlayEntries.has(missingPartitionId),
    false,
    'authoritative_missing overlay should retire when cached PARTITIONS row appears',
  );
  await engine.shutdown();
});

test('SQLQueryEngine shutdown detaches SystemTableCache apply listener, clears ' +
  'routing overlays, and remains idempotent across repeated shutdown and rebind',
async (t) => {
  const partitionId = 'users-p1';
  const systemCache = new SystemTableCache({
    scheduleCacheChangeNotification: () => {},
  });
  const replacementCache = new SystemTableCache({
    scheduleCacheChangeNotification: () => {},
  });
  const snapshot = {
    partitions: [buildPartitionRow({partitionId, replicaCount: 1, updatedAt: 100})],
    services: [buildPartitionServiceRow({partitionId, serviceId: 'users-p1-r1', updatedAt: 100})],
  };
  for (const cache of [systemCache, replacementCache]) {
    cache.applySystemTableChange(
      TABLES.PARTITIONS,
      CACHE_CDC_OPERATIONS.INSERT,
      snapshot.partitions[0],
    );
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CACHE_CDC_OPERATIONS.INSERT,
      snapshot.services[0],
    );
  }

  let listenerInvocations = 0;
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache,
    messageRouter: createMockMessageRouter(),
    authoritativeControlPlaneView: createAuthoritativeViewStub(() => snapshot),
    autoStartDistributedTransactionRecovery: false,
  });
  const originalHandleApply =
    engine.handleAuthoritativeRoutingOverlayCacheApplyChange.bind(engine);
  engine.handleAuthoritativeRoutingOverlayCacheApplyChange = (
    tableName,
    operation,
    record,
  ) => {
    listenerInvocations += 1;
    return originalHandleApply(tableName, operation, record);
  };

  t.equal(
    systemCache.applyListeners.size,
    1,
    'constructing SQLQueryEngine registers one apply listener on SystemTableCache',
  );
  t.type(engine.authoritativeRoutingOverlayCacheApplyListener, 'function');
  t.type(engine.authoritativeRoutingOverlayCacheApplyUnsubscribe, 'function');

  // Rebinding to another SystemTableCache detaches from the previous cache first.
  engine.setSystemCache(replacementCache);
  t.equal(
    systemCache.applyListeners.size,
    0,
    'setSystemCache detaches apply listener from the previous SystemTableCache',
  );
  t.equal(
    replacementCache.applyListeners.size,
    1,
    'setSystemCache attaches apply listener to the replacement SystemTableCache',
  );

  t.equal(await engine.refreshAuthoritativeRoutingOverlay(partitionId), true);
  engine.bootstrapRoutingOverlayEntries.set(partitionId, {
    partition: {partition_id: partitionId},
    services: snapshot.services,
    expiresAtMs: 999999,
  });
  t.equal(engine.authoritativeRoutingOverlayEntries.size, 1);
  t.equal(engine.bootstrapRoutingOverlayEntries.size, 1);

  await engine.shutdown();
  t.equal(
    replacementCache.applyListeners.size,
    0,
    'shutdown removes the apply listener from SystemTableCache',
  );
  t.equal(engine.authoritativeRoutingOverlayCacheApplyListener, null);
  t.equal(engine.authoritativeRoutingOverlayCacheApplyUnsubscribe, null);
  t.equal(
    engine.authoritativeRoutingOverlayEntries.size,
    0,
    'shutdown clears authoritativeRoutingOverlayEntries',
  );
  t.equal(
    engine.bootstrapRoutingOverlayEntries.size,
    0,
    'shutdown clears bootstrapRoutingOverlayEntries',
  );

  const invocationsBeforePostShutdownApply = listenerInvocations;
  replacementCache.applySystemTableChange(
    TABLES.PARTITIONS,
    CACHE_CDC_OPERATIONS.UPDATE,
    buildPartitionRow({partitionId, replicaCount: 3, updatedAt: 200}),
  );
  t.equal(
    listenerInvocations,
    invocationsBeforePostShutdownApply,
    'subsequent applySystemTableChange does not invoke shut-down engine listener',
  );

  // Calling shutdown() twice and setSystemCache() after shutdown are idempotent.
  await engine.shutdown();
  engine.setSystemCache(systemCache);
  t.equal(systemCache.applyListeners.size, 0);
  t.equal(replacementCache.applyListeners.size, 0);
  t.equal(engine.authoritativeRoutingOverlayCacheApplyListener, null);
  t.equal(engine.authoritativeRoutingOverlayCacheApplyUnsubscribe, null);
});
