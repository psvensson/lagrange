import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  HeartbeatService,
  calculateUsageSlopePerMinute,
} from '../../src/control-plane/heartbeat-service.js';
import {HEARTBEAT_EVENT} from
  '../../src/control-plane/heartbeat-service-constants.js';
import {TRANSPORT_DEFAULT} from '../../src/constants/transport.js';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createMockCache() {
  const store = new Map();
  return {
    get: (_table, key) => store.get(key) || null,
  };
}

function createMockCdc() {
  return {
    updateSystemTableRow: async () => ({success: true}),
    upsertSystemTableRow: async () => ({success: true}),
  };
}

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

test('HeartbeatService skips cache wait for heartbeat writes and repairs missing rows',
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

    await service.sendHeartbeat(null, null);

    t.equal(updates.length, 1, 'issues heartbeat update');
    t.equal(
      updates[0].options?.skipCacheWait,
      true,
      'heartbeat update should not block on cache wait',
    );
    const nodeUpserts = upserts.filter((entry) => entry.tableName === 'nodes');
    t.equal(nodeUpserts.length, 1, 'repairs missing row via upsert fallback');
    t.equal(
      nodeUpserts[0].options?.skipCacheWait,
      true,
      'upsert repair should also skip cache wait',
    );
    t.equal(
      nodeUpserts[0].row.storage_budget_bytes,
      1024,
      'upsert repair should preserve storage budget fields',
    );
    t.equal(
      nodeUpserts[0].row.last_heartbeat,
      now,
      'upsert repair should keep current heartbeat timestamp',
    );

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

    t.equal(counters.nodeUpdates, 3, 'should update nodes row every heartbeat');
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

test('HeartbeatService falls back to routed SQL when node-state reporter fails',
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
      await service.sendHeartbeat(null, ['partition_replica']);

      t.equal(reporterAttempts, 1, 'reporter should be attempted first');
      t.equal(nodeUpdates, 1, 'failed reporter should fall back to routed SQL update');
      t.equal(
        service.getHeartbeatPublicationDiagnostics().publicationPath,
        'cdc_update_after_reporter_failure',
        'fallback publication should preserve that the reporter path failed first',
      );
      t.equal(
        service.getHeartbeatPublicationDiagnostics().targetAddress,
        'seed-1/message-group/mg-1',
        'fallback diagnostics should retain the last known reporter target',
      );
    } finally {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('HeartbeatService falls back to routed SQL when node-state reporter exceeds ' +
  'its timeout budget',
async (t) => {
  initEnv();

  let nodeUpdates = 0;
  const nodeWriteTimeouts = [];
  const service = new HeartbeatService({
    nodeId: 'node-reporter-timeout-fallback',
    nodeAddress: '10.0.0.15:8080',
    heartbeatAttemptTimeoutMs: 7000,
    cdcIntegrationService: {
      updateSystemTableRow: async (_table, _where, _row, options = {}) => {
        nodeUpdates += 1;
        nodeWriteTimeouts.push(options.queryTimeoutMs ?? null);
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
      // Trigger reporter timeout watchdog immediately to keep this test deterministic.
      if (timeoutMs === 3000) {
        callback();
      }
      return handle;
    },
    clearTimeoutFn: () => {},
  });

  try {
    await service.sendHeartbeat(null, ['partition_replica']);

    t.equal(nodeUpdates, 1,
      'timed-out reporter should still fall back to one routed SQL node write');
    t.equal(nodeWriteTimeouts[0], 3000,
      'fallback node write should use the reduced timeout budget');
    t.equal(
      service.getHeartbeatPublicationDiagnostics().publicationPath,
      'cdc_update_after_reporter_failure',
      'reporter-timeout fallback should preserve reporter-failure classification',
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

test('HeartbeatService bounds routed SQL heartbeat write timeouts below attempt timeout',
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
      await service.sendHeartbeat(null, ['partition_replica']);

      t.equal(nodeWriteOptions.length, 1,
        'reporter failure should trigger one routed SQL node write');
      t.equal(nodeWriteOptions[0]?.queryTimeoutMs, 6000,
        'node heartbeat routed SQL timeout should stay below attempt timeout');
      t.equal(nodeWriteOptions[0]?.skipCacheWait, true,
        'heartbeat write should still bypass cache wait');
      t.equal(endpointWriteOptions.length, 1,
        'endpoint refresh should still execute');
      t.equal(endpointWriteOptions[0]?.queryTimeoutMs, 6000,
        'endpoint upsert should reuse bounded heartbeat write timeout');
    } finally {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('HeartbeatService falls back to routed SQL when reporter heartbeat ' +
  'does not become canonically visible',
async (t) => {
  initEnv();

  let reporterAttempts = 0;
  let nodeUpdates = 0;
  let authoritativeReads = 0;
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
    fallbackToCdcOnReporterVisibilityGap: true,
    now: () => 1000,
  });

  try {
    await service.sendHeartbeat(null, ['partition_replica']);

    t.equal(reporterAttempts, 1,
      'reporter should still be attempted first');
    t.equal(authoritativeReads, 1,
      'reporter success should be followed by canonical visibility verification');
    t.equal(nodeUpdates, 1,
      'stale authoritative heartbeat evidence should trigger direct CDC fallback');
    t.equal(
      service.getHeartbeatPublicationDiagnostics().publicationPath,
      'cdc_update_after_reporter_visibility_gap',
      'fallback publication should classify reporter visibility gaps separately',
    );
    t.equal(
      service.getHeartbeatPublicationDiagnostics().targetAddress,
      'seed-1/message-group/mg-1',
      'visibility-gap fallback should retain the reporter target diagnostics',
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
  });

  try {
    await service.sendHeartbeat(null, ['partition_replica']);

    t.equal(authoritativeReadOptions.length, 1,
      'reporter success should perform exactly one canonical visibility read');
    t.match(authoritativeReadOptions[0], {
      tableName: 'nodes',
      params: ['node-reporter-routed-visibility'],
      options: {
        localReadConsistency: 'local_leader',
        allowSqlFallback: true,
      },
    });
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

test('HeartbeatService suppresses non-critical heartbeat writes while quiet mode is active',
  async (t) => {
    initEnv();

    const counters = {
      nodeUpdates: 0,
      endpointUpserts: 0,
    };
    let quietModeActive = false;
    const service = new HeartbeatService({
      nodeId: 'node-g',
      nodeAddress: '10.0.0.7:8080',
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
      endpointRefreshIntervalMs: 1000,
      nodeMetadataMinUpdateIntervalMs: 1000,
      nodeMetadataMaxStalenessMs: 5000,
      quietMode: {
        isActive: () => quietModeActive,
      },
    });

    const originalNow = Date.now;
    let now = 0;
    Date.now = () => now;
    try {
      await service.sendHeartbeat(null, null);
      quietModeActive = true;
      now += 1500;
      await service.sendHeartbeat(null, null);

      t.equal(
        counters.nodeUpdates,
        1,
        'quiet mode should suppress non-critical node heartbeat writes',
      );
      t.equal(
        counters.endpointUpserts,
        1,
        'quiet mode should suppress non-critical endpoint upserts',
      );
    } finally {
      Date.now = originalNow;
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('HeartbeatService allows initial node heartbeat write during quiet mode',
  async (t) => {
    initEnv();

    let nodeUpdates = 0;
    let endpointUpserts = 0;
    const service = new HeartbeatService({
      nodeId: 'node-g0',
      nodeAddress: '10.0.0.70:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async () => {
          nodeUpdates += 1;
          return {success: true};
        },
        upsertSystemTableRow: async () => {
          endpointUpserts += 1;
          return {success: true};
        },
      },
      systemTableCache: createMockCache(),
      endpointRefreshIntervalMs: 1000,
      nodeMetadataMinUpdateIntervalMs: 1000,
      nodeMetadataMaxStalenessMs: 5000,
      quietMode: {
        isActive: () => true,
      },
    });

    try {
      await service.sendHeartbeat(null, null);

      t.equal(
        nodeUpdates,
        1,
        'initial heartbeat write should bypass quiet mode suppression',
      );
      t.equal(
        endpointUpserts,
        0,
        'endpoint upserts should remain suppressed in quiet mode',
      );
      t.same(
        service.getQuietModeBypassReasonHistogram(),
        {node_heartbeat_initial_write: 1},
        'quiet mode should record initial-write bypass reason',
      );
    } finally {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('HeartbeatService allows quiet-mode safety bypass for staleness guard and records reason',
  async (t) => {
    initEnv();

    let nodeUpdates = 0;
    let quietModeActive = false;
    const service = new HeartbeatService({
      nodeId: 'node-h',
      nodeAddress: '10.0.0.8:8080',
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
      quietMode: {
        isActive: () => quietModeActive,
      },
    });

    const originalNow = Date.now;
    let now = 0;
    Date.now = () => now;
    try {
      await service.sendHeartbeat(null, null);
      quietModeActive = true;
      now += 60;
      await service.sendHeartbeat(null, null);

      t.equal(
        nodeUpdates,
        2,
        'staleness guard should bypass quiet mode suppression for liveness',
      );
      t.same(
        service.getQuietModeBypassReasonHistogram(),
        {node_heartbeat_max_staleness: 1},
        'quiet mode safety bypass should record reason histogram',
      );
    } finally {
      Date.now = originalNow;
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('HeartbeatService preserves max-staleness liveness writes in quiet mode even when signature changes',
  async (t) => {
    initEnv();

    let nodeUpdates = 0;
    let quietModeActive = false;
    const service = new HeartbeatService({
      nodeId: 'node-h2',
      nodeAddress: '10.0.0.81:8080',
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
      quietMode: {
        isActive: () => quietModeActive,
      },
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
      quietModeActive = true;
      now += 60;
      await service.sendHeartbeat({
        cpu: {count: 4, usagePercent: 12},
        memory: {totalBytes: 128 * 1024 * 1024, usagePercent: 22},
        diskGb: 100,
        diskUsagePercent: 32,
      }, ['partition_replica']);

      t.equal(
        nodeUpdates,
        2,
        'max-staleness liveness refresh must bypass quiet mode even with metadata churn',
      );
      t.same(
        service.getQuietModeBypassReasonHistogram(),
        {node_heartbeat_max_staleness: 1},
        'quiet mode should account the staleness bypass reason',
      );
    } finally {
      Date.now = originalNow;
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('HeartbeatService does not overlap heartbeat writes when a tick is still in-flight',
  async (t) => {
    initEnv();

    let inFlightWrites = 0;
    let maxInFlightWrites = 0;
    const releaseWrites = [];
    const service = new HeartbeatService({
      nodeId: 'node-d',
      nodeAddress: '10.0.0.4:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async () => {
          inFlightWrites += 1;
          maxInFlightWrites = Math.max(maxInFlightWrites, inFlightWrites);
          return new Promise((resolve) => {
            releaseWrites.push(() => {
              inFlightWrites -= 1;
              resolve({success: true});
            });
          });
        },
        upsertSystemTableRow: async () => ({success: true}),
      },
      systemTableCache: createMockCache(),
    });
    service.initialize();
    service.heartbeatIntervalMs = 5;
    service.start();

    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      t.equal(
        maxInFlightWrites,
        1,
        'heartbeat loop should keep at most one in-flight write',
      );
    } finally {
      service.stop();
      while (releaseWrites.length > 0) {
        const release = releaseWrites.shift();
        release();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('HeartbeatService recovers from a hung heartbeat attempt after timeout',
  async (t) => {
    initEnv();

    const intervalHandles = [];
    const timeoutHandles = [];
    const writes = [];
    const service = new HeartbeatService({
      nodeId: 'node-timeout',
      nodeAddress: '10.0.0.11:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async () => {
          const writeIndex = writes.length;
          writes.push({resolved: false});
          if (writeIndex === 0) {
            return new Promise(() => {});
          }
          writes[writeIndex].resolved = true;
          return {success: true};
        },
        upsertSystemTableRow: async () => ({success: true}),
      },
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
        intervalHandles.push(handle);
        return handle;
      },
      clearIntervalFn: () => {},
      setTimeoutFn: (callback, delayMs) => {
        const handle = {
          callback,
          delayMs,
          cleared: false,
          unrefCalled: false,
          unref() {
            this.unrefCalled = true;
          },
        };
        timeoutHandles.push(handle);
        return handle;
      },
      clearTimeoutFn: (handle) => {
        if (handle) {
          handle.cleared = true;
        }
      },
      heartbeatAttemptTimeoutMs: 25,
    });

    service.initialize();
    service.start();

    try {
      t.equal(writes.length, 1, 'start should issue the first heartbeat attempt');
      t.equal(service.heartbeatConsecutiveFailures, 0,
        'first heartbeat attempt should not fail immediately');

      await intervalHandles[0].callback();
      t.equal(
        writes.length,
        1,
        'heartbeat loop should not overlap before the attempt timeout fires',
      );

      t.equal(timeoutHandles.length, 1,
        'heartbeat attempt should arm a timeout watchdog');
      timeoutHandles[0].callback();

      t.equal(
        service.heartbeatConsecutiveFailures,
        1,
        'timed out heartbeat attempt should count as a failure',
      );

      await intervalHandles[0].callback();
      t.equal(
        writes.length,
        2,
        'heartbeat loop should retry after timing out the stalled attempt',
      );

      await new Promise((resolve) => setTimeout(resolve, 0));
      t.equal(service.getHeartbeatCount(), 1,
        'successful retry should increment the heartbeat count');
      t.equal(service.heartbeatConsecutiveFailures, 0,
        'successful retry should reset consecutive failures');
    } finally {
      service.stop();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });
