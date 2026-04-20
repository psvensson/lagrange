import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  HeartbeatService as RawHeartbeatService,
  calculateUsageSlopePerMinute,
} from '../../src/control-plane/heartbeat-service.js';
import {HEARTBEAT_EVENT} from
  '../../src/control-plane/heartbeat-service-constants.js';
import {
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-constants.js';
import {SERVICE_STATUS, STATE} from '../../src/constants/index.js';
import {TRANSPORT_DEFAULT} from '../../src/constants/transport.js';
import {
  createMockControlPlaneSystemTableGateway,
} from './test-helpers.js';
import {
  createHeartbeatUpdateRow,
  createMockCache,
  createMockCdc,
  HeartbeatService,
  HEARTBEAT_RECOVERY_FAILURE_RETRY_REASON,
  HEARTBEAT_REPORTER_FAILURE_REASON,
  HEARTBEAT_REPORTER_FAILURE_STAGE,
  HEARTBEAT_REPORTER_PUBLICATION_PATH,
  HEARTBEAT_REPORTER_VISIBILITY_ROUTING_DIMENSION,
  initEnv,
} from './heartbeat-memory-trend-test-helpers.js';

test('Heartbeat memory trend slope helper handles minimal and rising samples', async (t) => {
  t.equal(calculateUsageSlopePerMinute([]), 0, 'empty sample list should return 0');
  t.equal(
    calculateUsageSlopePerMinute([{timestamp: 1, usagePercent: 50}]),
    0,
    'single sample should return 0',
  );

  const slope = calculateUsageSlopePerMinute([
    {timestamp: 0, usagePercent: 50},
    {timestamp: 60000, usagePercent: 52},
    {timestamp: 120000, usagePercent: 56},
  ]);
  t.ok(slope > 0, 'rising usage should have positive slope');
  t.ok(slope >= 2 && slope <= 4, `expected slope near 3%/min, got ${slope}`);
});

test('HeartbeatService emits memory trend warning and enforces cooldown', async (t) => {
  initEnv();

  const service = new HeartbeatService({
    nodeId: 'node-a',
    nodeAddress: '10.0.0.1:8080',
    cdcIntegrationService: createMockCdc(),
    systemTableCache: createMockCache(),
    memoryTrend: {
      windowMs: 60000,
      minSamples: 3,
      slopePercentPerMinThreshold: 0.5,
      warningPercent: 70,
      warningCooldownMs: 300000,
    },
  });

  const warnings = [];
  service.on(HEARTBEAT_EVENT.MEMORY_TREND_WARNING, (warning) => {
    warnings.push(warning);
  });

  service.recordMemoryTrendSample(65, 0);
  service.recordMemoryTrendSample(72, 10000);
  service.recordMemoryTrendSample(75, 20000);
  service.recordMemoryTrendSample(80, 30000);
  service.recordMemoryTrendSample(85, 40000);

  t.equal(warnings.length, 1, 'cooldown should limit repeated warnings');
  t.equal(warnings[0].nodeId, 'node-a', 'warning should include node id');
  t.ok(
    warnings[0].slopePercentPerMin > 0.5,
    'warning slope should exceed configured threshold',
  );

  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('HeartbeatService does not emit warning below usage threshold', async (t) => {
  initEnv();

  const service = new HeartbeatService({
    nodeId: 'node-b',
    nodeAddress: '10.0.0.2:8080',
    cdcIntegrationService: createMockCdc(),
    systemTableCache: createMockCache(),
    memoryTrend: {
      windowMs: 60000,
      minSamples: 3,
      slopePercentPerMinThreshold: 0.5,
      warningPercent: 90,
      warningCooldownMs: 300000,
    },
  });

  let warningCount = 0;
  service.on(HEARTBEAT_EVENT.MEMORY_TREND_WARNING, () => {
    warningCount++;
  });

  service.recordMemoryTrendSample(40, 0);
  service.recordMemoryTrendSample(50, 10000);
  service.recordMemoryTrendSample(60, 20000);
  service.recordMemoryTrendSample(70, 30000);

  t.equal(
    warningCount,
    0,
    'warning should not emit when usage percent stays below threshold',
  );

  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('HeartbeatService start and stop use injected interval scheduler', async (t) => {
  initEnv();

  const scheduled = [];
  const cleared = [];
  const service = new HeartbeatService({
    nodeId: 'node-timer',
    nodeAddress: '10.0.0.9:8080',
    cdcIntegrationService: createMockCdc(),
    systemTableCache: createMockCache(),
    setIntervalFn: (callback, intervalMs) => {
      const handle = {
        callback,
        intervalMs,
        unrefCalled: false,
        unref() {
          this.unrefCalled = true;
        },
      };
      scheduled.push(handle);
      return handle;
    },
    clearIntervalFn: (handle) => {
      cleared.push(handle);
    },
  });

  service.initialize();
  service.start();

  t.equal(scheduled.length, 1, 'start should schedule one heartbeat interval');
  t.equal(
    scheduled[0].intervalMs,
    service.heartbeatIntervalMs,
    'injected scheduler should receive the configured interval',
  );
  t.equal(scheduled[0].unrefCalled, true, 'heartbeat timer should be unrefed when supported');

  service.stop();
  t.same(cleared, [scheduled[0]], 'stop should clear the injected interval handle');

  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('HeartbeatService sendHeartbeat uses injected clock', async (t) => {
  initEnv();

  let capturedUpdate = null;
  const now = 12345;
  const service = new HeartbeatService({
    nodeId: 'node-clock',
    nodeAddress: '10.0.0.10:8080',
    cdcIntegrationService: {
      updateSystemTableRow: async (_table, _whereClause, updateRow) => {
        capturedUpdate = updateRow;
        return {success: true};
      },
      upsertSystemTableRow: async () => ({success: true}),
    },
    systemTableCache: createMockCache(),
    now: () => now,
  });

  await service.sendHeartbeat(null, null);

  t.equal(capturedUpdate.last_heartbeat, now, 'heartbeat timestamp should come from injected clock');
  t.equal(
    capturedUpdate.ready_lease_expires_at,
    now + service.readyLeaseMs,
    'ready lease expiry should come from injected clock',
  );

  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('HeartbeatService sendHeartbeat uses injected control-plane system-table ' +
  'gateway', async (t) => {
  initEnv();

  const gatewayCalls = [];
  const service = new HeartbeatService({
    nodeId: 'node-gateway',
    nodeAddress: '10.0.0.15:8080',
    cdcIntegrationService: {
      updateSystemTableRow: async () => {
        throw new Error('cdcIntegrationService should not handle heartbeat writes');
      },
      upsertSystemTableRow: async () => {
        throw new Error('cdcIntegrationService should not handle heartbeat writes');
      },
    },
    controlPlaneSystemTableGateway: {
      async updateSystemTableRow(tableName, whereClause, row, options) {
        gatewayCalls.push({
          method: 'updateSystemTableRow',
          tableName,
          whereClause,
          row,
          options,
        });
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
      async upsertSystemTableRow(tableName, row, options) {
        gatewayCalls.push({
          method: 'upsertSystemTableRow',
          tableName,
          row,
          options,
        });
        return {success: true};
      },
    },
    systemTableCache: createMockCache(),
    now: () => 45678,
  });

  await service.sendHeartbeat(null, null);

  t.equal(gatewayCalls.length, 2, 'gateway should own node and endpoint writes');
  t.same(
    gatewayCalls.map((call) => `${call.method}:${call.tableName}`),
    [
      'updateSystemTableRow:nodes',
      'upsertSystemTableRow:node_endpoints',
    ],
    'heartbeat writes should route through the shared gateway',
  );

  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('HeartbeatService skips cache wait for heartbeat writes and fails on missing rows',
  async (t) => {
    initEnv();

    const now = 56789;
    const updates = [];
    const upserts = [];
    const service = new HeartbeatService({
      nodeId: 'node-heartbeat-repair',
      nodeAddress: '10.0.0.11:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async (_table, _whereClause, updateRow, options) => {
          updates.push({updateRow, options});
          return {
            success: true,
            partitionResult: {affectedRows: 0},
          };
        },
        upsertSystemTableRow: async (tableName, row, options) => {
          upserts.push({tableName, row, options});
          return {success: true};
        },
      },
      systemTableCache: {
        get: (_tableName, key) => {
          if (key !== 'node-heartbeat-repair') {
            return null;
          }
          return {
            node_id: 'node-heartbeat-repair',
            created_at: 50000,
            storage_budget_bytes: 1024,
            storage_budget_source: 'absolute',
          };
        },
      },
      now: () => now,
    });

    await t.rejects(
      service.sendHeartbeat(null, null),
      /node row .*missing/i,
      'steady-state heartbeat should fail instead of recreating missing rows',
    );
    t.equal(updates.length, 1, 'issues one heartbeat update');
    t.equal(
      updates[0].options?.skipCacheWait,
      true,
      'heartbeat update should not block on cache wait',
    );
    const nodeUpserts = upserts.filter((entry) => entry.tableName === 'nodes');
    t.equal(nodeUpserts.length, 0, 'steady-state heartbeat should not upsert nodes');

    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

test('HeartbeatService keeps attempt timeout outside transport message timeout boundary',
  async (t) => {
    initEnv();

    const service = new HeartbeatService({
      nodeId: 'node-timeout-budget',
      nodeAddress: '10.0.0.12:8080',
      cdcIntegrationService: createMockCdc(),
      systemTableCache: createMockCache(),
    });

    t.ok(
      service.heartbeatAttemptTimeoutMs > TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS,
      'heartbeat attempt watchdog should exceed router message timeout to avoid equal-deadline races',
    );
    t.ok(
      service.heartbeatAttemptTimeoutMs <=
        service.readyLeaseMs - service.heartbeatIntervalMs,
      'heartbeat attempt watchdog should remain within the ready-lease safety budget',
    );

    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

test('HeartbeatService throttles endpoint upserts but refreshes after interval', async (t) => {
  initEnv();

  const counters = {
    nodeUpdates: 0,
    endpointUpserts: 0,
  };
  const service = new HeartbeatService({
    nodeId: 'node-c',
    nodeAddress: '10.0.0.3:8080',
    cdcIntegrationService: {
      updateSystemTableRow: async () => {
        counters.nodeUpdates += 1;
        return {success: true};
      },
      upsertSystemTableRow: async () => {
        counters.endpointUpserts += 1;
        return {success: true};
      },
    },
    systemTableCache: createMockCache(),
    endpointRefreshIntervalMs: 100,
    nodeMetadataMinUpdateIntervalMs: 0,
    nodeMetadataMaxStalenessMs: 1000,
  });

  const originalNow = Date.now;
  let now = 0;
  Date.now = () => now;
  try {
    await service.sendHeartbeat(null, null);
    now += 10;
    await service.sendHeartbeat(null, null);
    now += 10;
    await service.sendHeartbeat(null, null);

    t.equal(
      counters.nodeUpdates,
      1,
      'should coalesce unchanged nodes-row writes independently of endpoint refresh',
    );
    t.equal(
      counters.endpointUpserts,
      1,
      'should avoid repeated endpoint upserts inside refresh window',
    );

    now += 150;
    await service.sendHeartbeat(null, null);
    t.equal(
      counters.endpointUpserts,
      2,
      'should refresh endpoint row after refresh interval elapses',
    );
  } finally {
    Date.now = originalNow;
  }

  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('HeartbeatService coalesces unchanged node heartbeat writes within min interval',
  async (t) => {
    initEnv();

    const counters = {
      nodeUpdates: 0,
      endpointUpserts: 0,
    };
    const service = new HeartbeatService({
      nodeId: 'node-e',
      nodeAddress: '10.0.0.5:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async () => {
          counters.nodeUpdates += 1;
          return {success: true};
        },
        upsertSystemTableRow: async () => {
          counters.endpointUpserts += 1;
          return {success: true};
        },
      },
      systemTableCache: createMockCache(),
      nodeMetadataMinUpdateIntervalMs: 1000,
      nodeMetadataMaxStalenessMs: 5000,
    });

    const originalNow = Date.now;
    let now = 0;
    Date.now = () => now;
    try {
      await service.sendHeartbeat(null, null);
      now += 10;
      await service.sendHeartbeat(null, null);
      now += 10;
      await service.sendHeartbeat(null, null);

      t.equal(
        counters.nodeUpdates,
        1,
        'unchanged node metadata should be coalesced within min update interval',
      );
      t.equal(
        counters.endpointUpserts,
        1,
        'endpoint upsert should still be coalesced independently',
      );
    } finally {
      Date.now = originalNow;
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('HeartbeatService forces node heartbeat refresh once max staleness elapses',
  async (t) => {
    initEnv();

    let nodeUpdates = 0;
    const service = new HeartbeatService({
      nodeId: 'node-f',
      nodeAddress: '10.0.0.6:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async () => {
          nodeUpdates += 1;
          return {success: true};
        },
        upsertSystemTableRow: async () => ({success: true}),
      },
      systemTableCache: createMockCache(),
      nodeMetadataMinUpdateIntervalMs: 1000,
      nodeMetadataMaxStalenessMs: 50,
    });

    const originalNow = Date.now;
    let now = 0;
    Date.now = () => now;
    try {
      await service.sendHeartbeat(null, null);
      now += 10;
      await service.sendHeartbeat(null, null);
      now += 60;
      await service.sendHeartbeat(null, null);

      t.equal(
        nodeUpdates,
        2,
        'liveness refresh should force a write when max staleness is reached',
      );
    } finally {
      Date.now = originalNow;
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('HeartbeatService routes confirmed stale refreshes through the ' +
  'heartbeat maintenance mode', async (t) => {
  initEnv();

  const service = new HeartbeatService({
    nodeId: 'node-maintenance-refresh',
    nodeAddress: '10.0.0.62:8080',
    cdcIntegrationService: createMockCdc(),
    systemTableCache: createMockCache(),
    nodeMetadataMinUpdateIntervalMs: 1000,
    nodeMetadataMaxStalenessMs: 5000,
  });

  const updateRow = createHeartbeatUpdateRow(service.nodeAddress);
  service.recordConfirmedNodeHeartbeatWrite(updateRow, 0);

  const decision = service.resolveNodeHeartbeatWriteDecision(updateRow, 6000);

  t.same(
    decision,
    {
      shouldWrite: true,
      reason: 'max_staleness',
      publicationMode:
        CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_MAINTENANCE,
    },
    'confirmed stale refreshes should use the maintenance owner path',
  );

  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('HeartbeatService escalates stale refreshes back to recovery after ' +
  'one failed maintenance attempt', async (t) => {
  initEnv();

  const service = new HeartbeatService({
    nodeId: 'node-maintenance-recovery',
    nodeAddress: '10.0.0.63:8080',
    cdcIntegrationService: createMockCdc(),
    systemTableCache: createMockCache(),
    nodeMetadataMinUpdateIntervalMs: 1000,
    nodeMetadataMaxStalenessMs: 5000,
  });

  const updateRow = createHeartbeatUpdateRow(service.nodeAddress);
  service.recordConfirmedNodeHeartbeatWrite(updateRow, 0);
  service.lastHeartbeatPublicationDecision = {
    publicationMode:
      CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_MAINTENANCE,
  };
  service.heartbeatConsecutiveFailures = 1;

  const decision = service.resolveNodeHeartbeatWriteDecision(updateRow, 6000);

  t.same(
    decision,
    {
      shouldWrite: true,
      reason: HEARTBEAT_RECOVERY_FAILURE_RETRY_REASON,
      publicationMode:
        CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
    },
    'a failed maintenance attempt should re-enter the recovery owner path',
  );

  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('HeartbeatService suppresses bucket-equivalent utilization churn even after min interval',
  async (t) => {
    initEnv();

    let nodeUpdates = 0;
    const service = new HeartbeatService({
      nodeId: 'node-f1',
      nodeAddress: '10.0.0.61:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async () => {
          nodeUpdates += 1;
          return {success: true};
        },
        upsertSystemTableRow: async () => ({success: true}),
      },
      systemTableCache: createMockCache(),
      nodeMetadataMinUpdateIntervalMs: 1000,
      nodeMetadataMaxStalenessMs: 5000,
      nodeMetadataUsagePercentBucketSize: 5,
    });

    const originalNow = Date.now;
    let now = 0;
    Date.now = () => now;
    try {
      await service.sendHeartbeat({
        cpu: {count: 4, usagePercent: 11},
        memory: {totalBytes: 128 * 1024 * 1024, usagePercent: 21},
        diskGb: 100,
        diskUsagePercent: 31,
      }, ['partition_replica']);
      now += 1500;
      await service.sendHeartbeat({
        cpu: {count: 4, usagePercent: 12},
        memory: {totalBytes: 128 * 1024 * 1024, usagePercent: 22},
        diskGb: 100,
        diskUsagePercent: 33,
      }, ['partition_replica']);

      t.equal(
        nodeUpdates,
        1,
        'usage jitter within the same bucket should not trigger another write',
      );
    } finally {
      Date.now = originalNow;
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('HeartbeatService writes immediately when structural metadata changes',
  async (t) => {
    initEnv();

    let nodeUpdates = 0;
    const service = new HeartbeatService({
      nodeId: 'node-f2',
      nodeAddress: '10.0.0.62:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async () => {
          nodeUpdates += 1;
          return {success: true};
        },
        upsertSystemTableRow: async () => ({success: true}),
      },
      systemTableCache: createMockCache(),
      nodeMetadataMinUpdateIntervalMs: 1000,
      nodeMetadataMaxStalenessMs: 5000,
      nodeMetadataUsagePercentBucketSize: 5,
    });

    const originalNow = Date.now;
    let now = 0;
    Date.now = () => now;
    try {
      await service.sendHeartbeat(null, ['partition_replica']);
      now += 10;
      await service.sendHeartbeat(null, ['partition_replica', 'leader']);

      t.equal(
        nodeUpdates,
        2,
        'structural metadata changes should bypass the min-interval coalescing',
      );
    } finally {
      Date.now = originalNow;
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('HeartbeatService prefers node-state reporter for node heartbeats', async (t) => {
  initEnv();

  let nodeUpdates = 0;
  let endpointUpserts = 0;
  let reportedHeartbeat = null;
  let authoritativeReads = 0;
  const service = new HeartbeatService({
    nodeId: 'node-reporter',
    nodeAddress: '10.0.0.9:8080',
    cdcIntegrationService: {
      updateSystemTableRow: async () => {
        nodeUpdates += 1;
        return {success: true};
      },
      upsertSystemTableRow: async () => {
        endpointUpserts += 1;
        return {success: true};
      },
      executeAuthoritativeSystemTableRead: async () => {
        authoritativeReads += 1;
        return {
          success: true,
          rows: [{
            node_id: 'node-reporter',
            last_heartbeat: service.now(),
          }],
        };
      },
    },
    systemTableCache: createMockCache(),
    nodeMetadataMinUpdateIntervalMs: 0,
    nodeMetadataMaxStalenessMs: 5000,
    nodeStateReporter: async (payload) => {
      reportedHeartbeat = payload;
      return {
        publicationPath: 'node_state_reporter',
        targetAddress: 'seed-1/message-group/mg-1',
      };
    },
  });

  try {
    await service.sendHeartbeat({
      cpu: {count: 4, usagePercent: 12},
      memory: {totalBytes: 256 * 1024 * 1024, usagePercent: 34},
      diskGb: 200,
      diskUsagePercent: 56,
    }, ['partition_replica']);

    t.equal(nodeUpdates, 0, 'successful reporter should bypass routed SQL node update');
    t.equal(endpointUpserts, 1, 'endpoint upsert still runs after reporter heartbeat');
    t.ok(reportedHeartbeat, 'reporter should receive heartbeat payload');
    t.equal(authoritativeReads, 0,
      'default reporter heartbeat path should not block on visibility checks');
    t.equal(reportedHeartbeat.state, 'ready', 'reported heartbeat should keep READY state');
    t.equal(
      reportedHeartbeat.nodeRow.cpu_cores,
      4,
      'reported node row should include current node metadata',
    );
    t.same(
      service.getHeartbeatPublicationDiagnostics(),
      {
        lastAttemptAt: null,
        lastSuccessAt: service.getHeartbeatPublicationDiagnostics().lastSuccessAt,
        lastFailureAt: null,
        lastFailureStage: null,
        lastFailureReason: null,
        publicationPath: 'node_state_reporter',
        targetAddress: 'seed-1/message-group/mg-1',
        targetNodeId: 'seed-1',
        targetServiceType: 'message-group',
        targetServiceId: 'mg-1',
        consecutiveFailures: 0,
      },
      'successful reporter heartbeat should publish diagnostics for the resolved target',
    );
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
  });

test('HeartbeatService promotes stopped rows back to active in reporter heartbeats',
  async (t) => {
    initEnv();

    let reportedHeartbeat = null;
    const existingNodeRow = {
      node_id: 'node-reporter-restart',
      node_address: '10.0.0.91:8080',
      cpu_cores: 4,
      memory_mb: 256,
      disk_gb: 64,
      cpu_usage_percent: 10,
      memory_usage_percent: 20,
      disk_usage_percent: 30,
      status: SERVICE_STATUS.STOPPED,
      connection_state: STATE.DISCONNECTED,
      capabilities: '["partition_replica"]',
      last_heartbeat: 111,
      ready_lease_expires_at: null,
      created_at: 100,
    };
    const service = new HeartbeatService({
      nodeId: 'node-reporter-restart',
      nodeAddress: '10.0.0.91:8080',
      cdcIntegrationService: createMockCdc(),
      systemTableCache: {
        get: (_tableName, key) =>
          key === 'node-reporter-restart' ? existingNodeRow : null,
      },
      nodeMetadataMinUpdateIntervalMs: 0,
      nodeMetadataMaxStalenessMs: 5000,
      nodeStateReporter: async (payload) => {
        reportedHeartbeat = payload;
        return {
          publicationPath: 'node_state_reporter',
          targetAddress: 'seed-1/message-group/mg-1',
        };
      },
    });

    try {
      await service.sendHeartbeat(null, ['partition_replica']);

      t.ok(reportedHeartbeat, 'reporter should receive heartbeat payload');
      t.equal(
        reportedHeartbeat.nodeRow.status,
        SERVICE_STATUS.ACTIVE,
        'ready heartbeat should promote a restarted node back to active',
      );
      t.equal(
        reportedHeartbeat.nodeRow.connection_state,
        STATE.READY,
        'reported heartbeat should publish ready connectivity',
      );
    } finally {
      service.stop();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('HeartbeatService surfaces reporter failure when node-state reporter fails',
  async (t) => {
    initEnv();

    let reporterAttempts = 0;
    let nodeUpdates = 0;
    const service = new HeartbeatService({
      nodeId: 'node-reporter-fallback',
      nodeAddress: '10.0.0.10:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async () => {
          nodeUpdates += 1;
          return {success: true};
        },
        upsertSystemTableRow: async () => ({success: true}),
      },
      systemTableCache: createMockCache(),
      nodeMetadataMinUpdateIntervalMs: 0,
      nodeMetadataMaxStalenessMs: 5000,
      nodeStateReporter: async () => {
        reporterAttempts += 1;
        const error = new Error('control-plane route unavailable');
        error.publicationDiagnostics = {
          publicationPath: 'node_state_reporter',
          targetAddress: 'seed-1/message-group/mg-1',
        };
        throw error;
      },
    });

    try {
      await t.rejects(
        service.sendHeartbeat(null, ['partition_replica']),
        /control-plane route unavailable/,
        'reporter failure should surface to the heartbeat owner path',
      );

      t.equal(reporterAttempts, 1, 'reporter should be attempted first');
      t.equal(nodeUpdates, 0, 'failed reporter should not fall back to routed SQL update');
      t.equal(
        service.getHeartbeatPublicationDiagnostics().targetAddress,
        'seed-1/message-group/mg-1',
        'failure diagnostics should retain the last known reporter target',
      );
    } finally {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('HeartbeatService surfaces reporter timeout when node-state reporter exceeds ' +
  'its timeout budget',
async (t) => {
  initEnv();

  let nodeUpdates = 0;
  const service = new HeartbeatService({
    nodeId: 'node-reporter-timeout-fallback',
    nodeAddress: '10.0.0.15:8080',
    heartbeatAttemptTimeoutMs: 7000,
    cdcIntegrationService: {
      updateSystemTableRow: async () => {
        nodeUpdates += 1;
        return {success: true};
      },
      upsertSystemTableRow: async () => ({success: true}),
    },
    systemTableCache: createMockCache(),
    nodeMetadataMinUpdateIntervalMs: 0,
    nodeMetadataMaxStalenessMs: 5000,
    nodeStateReporter: async () => new Promise(() => {}),
    setTimeoutFn: (callback, timeoutMs) => {
      const handle = {
        timeoutMs,
        unref() {},
      };
      // Trigger reporter timeout watchdog immediately to keep this test
      // deterministic across reporter-timeout budget tuning.
      if (timeoutMs <= 5000) {
        callback();
      }
      return handle;
    },
    clearTimeoutFn: () => {},
  });

  try {
    await t.rejects(
      service.sendHeartbeat(null, ['partition_replica']),
      /timed out/,
      'reporter timeout should surface to the heartbeat owner path',
    );

    t.equal(nodeUpdates, 0,
      'timed-out reporter should not fall back to a routed SQL node write');
    t.equal(
      service.getHeartbeatPublicationDiagnostics().targetAddress,
      null,
      'reporter-timeout diagnostics should not invent a routed SQL target',
    );
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('HeartbeatService avoids premature reporter timeout when reporter ' +
  'completes within the bounded heartbeat write budget',
async (t) => {
  initEnv();

  let reporterAttempts = 0;
  let nodeUpdates = 0;
  const service = new HeartbeatService({
    nodeId: 'node-reporter-budget-aligned',
    nodeAddress: '10.0.0.16:8080',
    heartbeatAttemptTimeoutMs: 7000,
    cdcIntegrationService: {
      updateSystemTableRow: async () => {
        nodeUpdates += 1;
        return {success: true};
      },
      upsertSystemTableRow: async () => ({success: true}),
    },
    systemTableCache: createMockCache(),
    nodeMetadataMinUpdateIntervalMs: 0,
    nodeMetadataMaxStalenessMs: 5000,
    nodeStateReporter: async () => {
      reporterAttempts += 1;
      return {
        publicationPath: 'node_state_reporter',
        targetAddress: 'seed-1/message-group/mg-1',
      };
    },
    setTimeoutFn: (callback, timeoutMs) => {
      const handle = {
        timeoutMs,
        unref() {},
      };
      // Simulate a regression where the reporter budget is cut too low.
      if (timeoutMs <= 3200) {
        callback();
      }
      return handle;
    },
    clearTimeoutFn: () => {},
  });

  try {
    await service.sendHeartbeat(null, ['partition_replica']);

    t.equal(reporterAttempts, 1, 'reporter should execute once');
    t.equal(nodeUpdates, 0,
      'successful reporter heartbeat should not fall back to routed SQL writes');
    t.equal(
      service.getHeartbeatPublicationDiagnostics().publicationPath,
      'node_state_reporter',
      'publication diagnostics should preserve reporter path on success',
    );
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('HeartbeatService accepts reporter heartbeat without visibility fallback ' +
  'in default mode',
async (t) => {
  initEnv();

  let reporterAttempts = 0;
  let nodeUpdates = 0;
  let authoritativeReads = 0;
  const service = new HeartbeatService({
    nodeId: 'node-reporter-default-visibility',
    nodeAddress: '10.0.0.14:8080',
    cdcIntegrationService: {
      updateSystemTableRow: async () => {
        nodeUpdates += 1;
        return {success: true};
      },
      upsertSystemTableRow: async () => ({success: true}),
      executeAuthoritativeSystemTableRead: async () => {
        authoritativeReads += 1;
        return {
          success: true,
          rows: [{
            node_id: 'node-reporter-default-visibility',
            last_heartbeat: 1,
          }],
        };
      },
    },
    systemTableCache: createMockCache(),
    nodeMetadataMinUpdateIntervalMs: 0,
    nodeMetadataMaxStalenessMs: 5000,
    nodeStateReporter: async () => {
      reporterAttempts += 1;
      return {
        publicationPath: 'node_state_reporter',
        targetAddress: 'seed-1/message-group/mg-1',
      };
    },
    now: () => 1000,
  });

  try {
    await service.sendHeartbeat(null, ['partition_replica']);

    t.equal(reporterAttempts, 1,
      'reporter should be attempted first');
    t.equal(authoritativeReads, 0,
      'default mode should skip canonical visibility verification');
    t.equal(nodeUpdates, 0,
      'default mode should not force routed SQL fallback after reporter success');
    t.equal(
      service.getHeartbeatPublicationDiagnostics().publicationPath,
      'node_state_reporter',
      'default mode should classify reporter delivery as successful',
    );
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('HeartbeatService surfaces reporter failure without routed SQL fallback',
  async (t) => {
    initEnv();

    const nodeWriteOptions = [];
    const endpointWriteOptions = [];
    const service = new HeartbeatService({
      nodeId: 'node-reporter-timeout-budget',
      nodeAddress: '10.0.0.13:8080',
      heartbeatAttemptTimeoutMs: 7000,
      cdcIntegrationService: {
        updateSystemTableRow: async (_table, _where, _row, options = {}) => {
          nodeWriteOptions.push(options);
          return {success: true};
        },
        upsertSystemTableRow: async (_table, _row, options = {}) => {
          endpointWriteOptions.push(options);
          return {success: true};
        },
      },
      systemTableCache: createMockCache(),
      nodeMetadataMinUpdateIntervalMs: 0,
      nodeMetadataMaxStalenessMs: 5000,
      nodeStateReporter: async () => {
        throw new Error('reporter unavailable');
      },
    });

    try {
      await t.rejects(
        service.sendHeartbeat(null, ['partition_replica']),
        /reporter unavailable/,
        'reporter failure should surface to the heartbeat owner path',
      );
      t.equal(nodeWriteOptions.length, 0,
        'reporter failure should not trigger a routed SQL node write');
      t.equal(endpointWriteOptions.length, 0,
        'heartbeat should stop before endpoint refresh when publication fails');
    } finally {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('HeartbeatService keeps the reporter path when heartbeat visibility ' +
  'remains unverified',
async (t) => {
  initEnv();

  let reporterAttempts = 0;
  let nodeUpdates = 0;
  let authoritativeReads = 0;
  const scheduledVerifications = [];
  const flushScheduledVerifications = async () => {
    while (scheduledVerifications.length > 0) {
      const verification = scheduledVerifications.shift();
      await verification();
    }
  };
  const service = new HeartbeatService({
    nodeId: 'node-reporter-visibility-gap',
    nodeAddress: '10.0.0.11:8080',
    cdcIntegrationService: {
      updateSystemTableRow: async () => {
        nodeUpdates += 1;
        return {success: true};
      },
      upsertSystemTableRow: async () => ({success: true}),
      executeAuthoritativeSystemTableRead: async () => {
        authoritativeReads += 1;
        return {
          success: true,
          rows: [{
            node_id: 'node-reporter-visibility-gap',
            last_heartbeat: 1,
          }],
        };
      },
    },
    systemTableCache: createMockCache(),
    nodeMetadataMinUpdateIntervalMs: 0,
    nodeMetadataMaxStalenessMs: 5000,
    nodeStateReporter: async () => {
      reporterAttempts += 1;
      return {
        publicationPath: 'node_state_reporter',
        targetAddress: 'seed-1/message-group/mg-1',
      };
    },
    verifyReporterVisibilityOnSuccess: true,
    now: () => 1000,
    setTimeoutFn: (fn) => {
      scheduledVerifications.push(fn);
      return {unref() {}};
    },
  });

  try {
    await service.sendHeartbeat(null, ['partition_replica']);

    t.equal(reporterAttempts, 1,
      'reporter should still be attempted first');
    t.equal(authoritativeReads, 0,
      'visibility verification should not block the heartbeat hot path');

    await flushScheduledVerifications();

    t.equal(authoritativeReads, 1,
      'reporter success should be followed by canonical visibility verification');
    t.equal(nodeUpdates, 0,
      'stale authoritative heartbeat evidence should not trigger CDC fallback');
    t.equal(
      service.heartbeatConsecutiveFailures,
      1,
      'missing canonical visibility proof should count as a heartbeat failure',
    );
    t.equal(
      service.getHeartbeatPublicationDiagnostics().publicationPath,
      HEARTBEAT_REPORTER_PUBLICATION_PATH.NODE_STATE_REPORTER_UNVERIFIED,
      'visibility gap should remain on the reporter publication path',
    );
    t.equal(
      service.getHeartbeatPublicationDiagnostics().targetAddress,
      'seed-1/message-group/mg-1',
      'visibility-gap fallback should retain the reporter target diagnostics',
    );
    t.equal(
      service.getHeartbeatPublicationDiagnostics().lastFailureStage,
      HEARTBEAT_REPORTER_FAILURE_STAGE.REPORTER_VISIBILITY,
      'visibility gap should use the reporter-visibility failure stage',
    );
    t.equal(
      service.getHeartbeatPublicationDiagnostics().lastFailureReason,
      HEARTBEAT_REPORTER_FAILURE_REASON.VISIBILITY_NOT_CONFIRMED,
      'visibility gap should use the canonical reporter-visibility reason',
    );
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('HeartbeatService canonical reporter visibility checks can route to the ' +
  'authoritative SQL path instead of trusting a local replica fallback',
async (t) => {
  initEnv();

  const authoritativeReadOptions = [];
  const scheduledVerifications = [];
  const flushScheduledVerifications = async () => {
    while (scheduledVerifications.length > 0) {
      const verification = scheduledVerifications.shift();
      await verification();
    }
  };
  const service = new HeartbeatService({
    nodeId: 'node-reporter-routed-visibility',
    nodeAddress: '10.0.0.12:8080',
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
      executeAuthoritativeSystemTableRead: async (
        tableName,
        sql,
        params,
        options,
      ) => {
        authoritativeReadOptions.push({tableName, sql, params, options});
        return {
          success: true,
          rows: [{
            node_id: 'node-reporter-routed-visibility',
            last_heartbeat: 1000,
          }],
        };
      },
    },
    systemTableCache: createMockCache(),
    nodeMetadataMinUpdateIntervalMs: 0,
    nodeMetadataMaxStalenessMs: 5000,
    nodeStateReporter: async () => ({
      publicationPath: 'node_state_reporter',
      targetAddress: 'seed-1/message-group/mg-1',
    }),
    verifyReporterVisibilityOnSuccess: true,
    now: () => 1000,
    setTimeoutFn: (fn) => {
      scheduledVerifications.push(fn);
      return {unref() {}};
    },
  });

  try {
    await service.sendHeartbeat(null, ['partition_replica']);

    t.equal(authoritativeReadOptions.length, 0,
      'visibility verification should be deferred off the heartbeat hot path');

    await flushScheduledVerifications();

    t.equal(authoritativeReadOptions.length, 1,
      'reporter success should perform exactly one canonical visibility read');
    t.match(authoritativeReadOptions[0], {
      tableName: 'nodes',
      params: ['node-reporter-routed-visibility'],
      options: {
        localReadConsistency: 'local_leader',
        allowSqlFallback: false,
      },
    });
    t.equal(
      authoritativeReadOptions[0].options.queryOptions?.routingReadinessDimension,
      HEARTBEAT_REPORTER_VISIBILITY_ROUTING_DIMENSION,
      'reporter visibility verification should stay on the recovery-eligible routing lane',
    );
    t.equal(
      authoritativeReadOptions[0].options.replicaFallbackConsistency,
      undefined,
      'visibility verification must not fall back to a possibly stale local replica',
    );
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('HeartbeatService does not coalesce reporter heartbeats before canonical ' +
  'visibility is proven',
async (t) => {
  initEnv();

  let reporterAttempts = 0;
  let authoritativeReads = 0;
  let now = 1000;
  const scheduledVerifications = [];
  const flushScheduledVerifications = async () => {
    while (scheduledVerifications.length > 0) {
      const verification = scheduledVerifications.shift();
      await verification();
    }
  };
  const service = new HeartbeatService({
    nodeId: 'node-reporter-confirmation-gap',
    nodeAddress: '10.0.0.30:8080',
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
      executeAuthoritativeSystemTableRead: async () => {
        authoritativeReads += 1;
        return {
          success: true,
          rows: [{
            node_id: 'node-reporter-confirmation-gap',
            last_heartbeat: now,
          }],
        };
      },
    },
    systemTableCache: createMockCache(),
    nodeMetadataMinUpdateIntervalMs: 0,
    nodeMetadataMaxStalenessMs: 5000,
    nodeStateReporter: async () => {
      reporterAttempts += 1;
      return {
        publicationPath: 'node_state_reporter',
        targetAddress: 'seed-1/message-group/mg-1',
      };
    },
    verifyReporterVisibilityOnSuccess: true,
    reporterVisibilitySuccessTtlMs: 10000,
    now: () => now,
    setTimeoutFn: (fn) => {
      scheduledVerifications.push(fn);
      return {unref() {}};
    },
  });

  try {
    await service.sendHeartbeat(null, ['partition_replica']);
    now += 1000;
    await service.sendHeartbeat(null, ['partition_replica']);

    t.equal(
      reporterAttempts,
      2,
      'unverified reporter heartbeats must not advance coalescing state',
    );
    t.equal(
      authoritativeReads,
      0,
      'verification should remain off the heartbeat hot path until flushed',
    );

    await flushScheduledVerifications();
    t.equal(authoritativeReads, 1,
      'flush should perform one authoritative visibility proof');

    now += 1000;
    await service.sendHeartbeat(null, ['partition_replica']);

    t.equal(
      reporterAttempts,
      2,
      'verified reporter proof should allow later identical heartbeats to coalesce',
    );
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
