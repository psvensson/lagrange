import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SERVICE_STATUS, STATE} from '../../src/constants/index.js';
import {
  createMockControlPlaneSystemTableGateway,
} from './test-helpers.js';
import {
  createMockCache,
  HeartbeatService,
  HEARTBEAT_REPORTER_PUBLICATION_PATH,
  initEnv,
} from './heartbeat-memory-trend-test-helpers.js';

test('HeartbeatService retries a reporter heartbeat after a fresh publish ' +
  'loses canonical visibility proof even inside the min update interval',
async (t) => {
  initEnv();

  let reporterAttempts = 0;
  let authoritativeReads = 0;
  let now = 1000;
  let reporterTargetAddress = 'seed-1/message-group/mg-1';
  const scheduledVerifications = [];
  const flushScheduledVerifications = async () => {
    while (scheduledVerifications.length > 0) {
      const verification = scheduledVerifications.shift();
      await verification();
    }
  };
  const service = new HeartbeatService({
    nodeId: 'node-reporter-target-change',
    nodeAddress: '10.0.0.31:8080',
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
      executeAuthoritativeSystemTableRead: async () => {
        authoritativeReads += 1;
        const lastHeartbeat =
          reporterTargetAddress === 'seed-1/message-group/mg-1' ? now : 1000;
        return {
          success: true,
          rows: [{
            node_id: 'node-reporter-target-change',
            last_heartbeat: lastHeartbeat,
          }],
        };
      },
    },
    systemTableCache: createMockCache(),
    nodeMetadataMinUpdateIntervalMs: 60000,
    nodeMetadataMaxStalenessMs: 600000,
    nodeStateReporter: async () => {
      reporterAttempts += 1;
      return {
        publicationPath:
          HEARTBEAT_REPORTER_PUBLICATION_PATH.NODE_STATE_REPORTER,
        targetAddress: reporterTargetAddress,
      };
    },
    verifyReporterVisibilityOnSuccess: true,
    reporterVisibilitySuccessTtlMs: 10000,
    reporterVisibilityRetryIntervalMs: 10000,
    now: () => now,
    setTimeoutFn: (fn) => {
      scheduledVerifications.push(fn);
      return {unref() {}};
    },
  });

  try {
    await service.sendHeartbeat(null, ['partition_replica']);
    await flushScheduledVerifications();

    t.equal(
      authoritativeReads,
      1,
      'first reporter heartbeat should establish one successful visibility proof',
    );

    now += 1000;
    reporterTargetAddress = 'seed-2/message-group/mg-1';
    await service.sendHeartbeat(null, ['partition_replica', 'leader']);
    await flushScheduledVerifications();

    t.equal(
      reporterAttempts,
      2,
      'target change should force a second reporter heartbeat',
    );
    t.equal(
      service.heartbeatConsecutiveFailures,
      1,
      'failed visibility proof after the target change should count as a failure',
    );

    now += 1000;
    await service.sendHeartbeat(null, ['partition_replica', 'leader']);

    t.equal(
      reporterAttempts,
      3,
      'unverified reporter state should force another publish even inside the min interval',
    );
    t.equal(
      authoritativeReads,
      2,
      'retry cooldown should defer another visibility readback while forcing a fresh publish',
    );
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('HeartbeatService reuses a recent successful reporter visibility proof',
  async (t) => {
    initEnv();

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
      nodeId: 'node-reporter-visibility-throttle',
      nodeAddress: '10.0.0.13:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
        executeAuthoritativeSystemTableRead: async () => {
          authoritativeReads += 1;
          return {
            success: true,
            rows: [{
              node_id: 'node-reporter-visibility-throttle',
              last_heartbeat: now,
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
      reporterVisibilitySuccessTtlMs: 10000,
      now: () => now,
      setTimeoutFn: (fn) => {
        scheduledVerifications.push(fn);
        return {unref() {}};
      },
    });

    try {
      await service.sendHeartbeat(null, ['partition_replica']);
      await flushScheduledVerifications();
      now += 1000;
      await service.sendHeartbeat(null, ['partition_replica']);
      await flushScheduledVerifications();

      t.equal(
        authoritativeReads,
        1,
        'steady-state heartbeat publishes should reuse a recent visibility proof',
      );

      now += 10000;
      await service.sendHeartbeat(null, ['partition_replica']);
      await flushScheduledVerifications();

      t.equal(
        authoritativeReads,
        2,
        'visibility proof should be refreshed after the reuse window expires',
      );
    } finally {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('HeartbeatService throttles repeated unverified reporter visibility retries',
  async (t) => {
    initEnv();

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
      nodeId: 'node-reporter-visibility-retry-throttle',
      nodeAddress: '10.0.0.14:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
        executeAuthoritativeSystemTableRead: async () => {
          authoritativeReads += 1;
          return {
            success: true,
            rows: [{
              node_id: 'node-reporter-visibility-retry-throttle',
              last_heartbeat: 1,
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
      reporterVisibilityRetryIntervalMs: 10000,
      now: () => now,
      setTimeoutFn: (fn) => {
        scheduledVerifications.push(fn);
        return {unref() {}};
      },
    });

    try {
      await service.sendHeartbeat(null, ['partition_replica']);
      await flushScheduledVerifications();

      now += 1000;
      await service.sendHeartbeat(null, ['partition_replica']);
      await flushScheduledVerifications();

      t.equal(
        authoritativeReads,
        1,
        'failed visibility proofs should not trigger another immediate readback',
      );

      now += 10000;
      await service.sendHeartbeat(null, ['partition_replica']);
      await flushScheduledVerifications();

      t.equal(
        authoritativeReads,
        2,
        'visibility proof should retry after the failure cooldown expires',
      );
    } finally {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('HeartbeatService cancels deferred reporter visibility verification when the reporter is disabled',
  async (t) => {
    initEnv();

    let authoritativeReads = 0;
    const scheduledVerifications = [];
    const flushScheduledVerifications = async () => {
      while (scheduledVerifications.length > 0) {
        const verification = scheduledVerifications.shift();
        await verification();
      }
    };
    const service = new HeartbeatService({
      nodeId: 'node-reporter-disabled-before-verify',
      nodeAddress: '10.0.0.15:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
        executeAuthoritativeSystemTableRead: async () => {
          authoritativeReads += 1;
          return {
            success: true,
            rows: [{
              node_id: 'node-reporter-disabled-before-verify',
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
      service.setNodeStateReporter(null);
      await flushScheduledVerifications();

      t.equal(
        authoritativeReads,
        0,
        'disabling the reporter should skip any queued visibility readback',
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

test('HeartbeatService promotes stopped rows back to active for direct node writes',
  async (t) => {
    initEnv();

    const nodeUpdates = [];
    const existingNodeRow = {
      node_id: 'node-direct-restart',
      node_address: '10.0.0.92:8080',
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
      nodeId: 'node-direct-restart',
      nodeAddress: '10.0.0.92:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async (_tableName, _whereClause, updateRow) => {
          nodeUpdates.push(updateRow);
          return {success: true};
        },
        upsertSystemTableRow: async () => ({success: true}),
      },
      systemTableCache: {
        get: (_tableName, key) =>
          key === 'node-direct-restart' ? existingNodeRow : null,
      },
      nodeMetadataMinUpdateIntervalMs: 0,
      nodeMetadataMaxStalenessMs: 5000,
    });

    try {
      await service.sendHeartbeat(null, ['partition_replica']);

      t.equal(nodeUpdates.length, 1, 'should persist one heartbeat update');
      t.equal(
        nodeUpdates[0].status,
        SERVICE_STATUS.ACTIVE,
        'direct heartbeat writes should promote a restarted node back to active',
      );
      t.equal(
        nodeUpdates[0].connection_state,
        STATE.READY,
        'direct heartbeat writes should publish ready connectivity',
      );
    } finally {
      service.stop();
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

test('HeartbeatService allows quiet-mode structural-change bypass and records reason',
  async (t) => {
    initEnv();

    let nodeUpdates = 0;
    let quietModeActive = false;
    const service = new HeartbeatService({
      nodeId: 'node-h3',
      nodeAddress: '10.0.0.82:8080',
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
      quietMode: {
        isActive: () => quietModeActive,
      },
    });

    const originalNow = Date.now;
    let now = 0;
    Date.now = () => now;
    try {
      await service.sendHeartbeat(null, ['partition_replica']);
      quietModeActive = true;
      now += 10;
      await service.sendHeartbeat(null, ['partition_replica', 'leader']);

      t.equal(
        nodeUpdates,
        2,
        'quiet mode should not suppress structural heartbeat metadata changes',
      );
      t.same(
        service.getQuietModeBypassReasonHistogram(),
        {node_heartbeat_structural_change: 1},
        'quiet mode should record the structural-change bypass reason',
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
    const controlPlaneSystemTableGateway =
      createMockControlPlaneSystemTableGateway({
        updateSystemTableRow: async () => {
          const writeIndex = writes.length;
          writes.push({resolved: false});
          if (writeIndex === 0) {
            return new Promise(() => {});
          }
          writes[writeIndex].resolved = true;
          return {
            success: true,
            partitionResult: {
              affectedRows: 1,
            },
          };
        },
        upsertSystemTableRow: async () => ({
          success: true,
          partitionResult: {
            affectedRows: 1,
          },
        }),
      });
    const service = new HeartbeatService({
      nodeId: 'node-timeout',
      nodeAddress: '10.0.0.11:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      controlPlaneSystemTableGateway,
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
      await new Promise((resolve) => setTimeout(resolve, 0));
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

test('HeartbeatService reportNodeShutdown publishes stopped state through node-state reporter',
  async (t) => {
    initEnv();

    const publications = [];
    const existingNodeRow = {
      node_id: 'node-shutdown-reporter',
      node_address: '10.0.0.21:8080',
      cpu_cores: 4,
      memory_mb: 256,
      disk_gb: 64,
      cpu_usage_percent: 10,
      memory_usage_percent: 20,
      disk_usage_percent: 30,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      capabilities: '["partition_replica"]',
      last_heartbeat: 111,
      ready_lease_expires_at: 222,
      created_at: 100,
    };
    const service = new HeartbeatService({
      nodeId: 'node-shutdown-reporter',
      nodeAddress: '10.0.0.21:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async () => {
          t.fail('shutdown publication should not fall back to CDC');
        },
        upsertSystemTableRow: async () => {
          t.fail('shutdown publication should not upsert rows');
        },
      },
      systemTableCache: {
        get: (_tableName, key) =>
          key === 'node-shutdown-reporter' ? existingNodeRow : null,
      },
      nodeStateReporter: async (payload) => {
        publications.push(payload);
        return {
          publicationPath: 'node_shutdown_reporter',
          targetAddress: 'seed-node/message-group/mg-1-r1',
        };
      },
      now: () => 12345,
    });

    const published = await service.reportNodeShutdown();

    t.equal(published, true, 'shutdown publication should report success');
    t.equal(publications.length, 1, 'should publish one shutdown update');
    t.equal(publications[0].state, STATE.DISCONNECTED,
      'should publish a disconnected shutdown state');
    t.equal(publications[0].readyLeaseExpiresAt, null,
      'should clear the ready lease on shutdown publication');
    t.equal(publications[0].nodeRow.status, SERVICE_STATUS.STOPPED,
      'should mark the node row stopped during shutdown');
    t.equal(publications[0].nodeRow.connection_state, STATE.DISCONNECTED,
      'should mark the node row disconnected during shutdown');
    t.equal(publications[0].nodeRow.ready_lease_expires_at, null,
      'should persist a null ready lease in the shutdown row');

    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

test('HeartbeatService reportNodeShutdown fails when reporter publication fails',
  async (t) => {
    initEnv();

    const updates = [];
    const service = new HeartbeatService({
      nodeId: 'node-shutdown-cdc',
      nodeAddress: '10.0.0.22:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async (tableName, whereClause, updateRow, options) => {
          updates.push({tableName, whereClause, updateRow, options});
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        },
        upsertSystemTableRow: async () => {
          t.fail('shutdown publication should not create missing rows');
        },
      },
      systemTableCache: {
        get: (_tableName, key) => {
          if (key !== 'node-shutdown-cdc') {
            return null;
          }
          return {
            node_id: 'node-shutdown-cdc',
            node_address: '10.0.0.22:8080',
            cpu_cores: 8,
            memory_mb: 512,
            disk_gb: 128,
            status: SERVICE_STATUS.ACTIVE,
            connection_state: STATE.READY,
            capabilities: '["partition_replica"]',
            last_heartbeat: 500,
            ready_lease_expires_at: 600,
          };
        },
      },
      nodeStateReporter: async () => {
        throw new Error('reporter unavailable');
      },
      now: () => 22334,
    });

    await t.rejects(
      service.reportNodeShutdown(),
      /reporter unavailable/,
      'shutdown publication should stay on the reporter path when configured',
    );
    t.equal(updates.length, 0, 'shutdown publication should not fall back to CDC');

    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

test('HeartbeatService reportNodeShutdown keeps the reporter path when shutdown ' +
  'visibility remains unverified',
async (t) => {
  initEnv();

  const updates = [];
  let authoritativeReads = 0;
  const service = new HeartbeatService({
    nodeId: 'node-shutdown-visibility-gap',
    nodeAddress: '10.0.0.24:8080',
    cdcIntegrationService: {
      updateSystemTableRow: async (tableName, whereClause, updateRow, options) => {
        updates.push({tableName, whereClause, updateRow, options});
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
      upsertSystemTableRow: async () => {
        t.fail('shutdown publication should not create missing rows');
      },
      executeAuthoritativeSystemTableRead: async () => {
        authoritativeReads += 1;
        return {
          success: true,
          rows: [{
            node_id: 'node-shutdown-visibility-gap',
            status: SERVICE_STATUS.ACTIVE,
            connection_state: STATE.READY,
            last_heartbeat: 777,
            ready_lease_expires_at: 888,
          }],
        };
      },
    },
    systemTableCache: {
      get: (_tableName, key) => {
        if (key !== 'node-shutdown-visibility-gap') {
          return null;
        }
        return {
          node_id: 'node-shutdown-visibility-gap',
          node_address: '10.0.0.24:8080',
          cpu_cores: 8,
          memory_mb: 512,
          disk_gb: 128,
          status: SERVICE_STATUS.ACTIVE,
          connection_state: STATE.READY,
          capabilities: '["partition_replica"]',
          last_heartbeat: 500,
          ready_lease_expires_at: 600,
        };
      },
    },
    nodeStateReporter: async () => {
      return {
        publicationPath: 'node_shutdown_reporter',
        targetAddress: 'seed-node/message-group/mg-1-r1',
      };
    },
    now: () => 22335,
  });

  const published = await service.reportNodeShutdown();

  t.equal(published, true,
    'shutdown publication should still succeed when the reporter path is unverified');
  t.equal(authoritativeReads, 1,
    'shutdown publication should verify canonical visibility after reporter success');
  t.equal(updates.length, 0,
    'shutdown publication should not repair the authoritative nodes row via CDC fallback');
  t.equal(
    service.getHeartbeatPublicationDiagnostics().publicationPath,
    'node_shutdown_reporter_unverified',
    'shutdown visibility gap should remain on the reporter publication path',
  );

  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('HeartbeatService reportNodeShutdown skips publication when node row is absent',
  async (t) => {
    initEnv();

    let updateCalls = 0;
    const service = new HeartbeatService({
      nodeId: 'node-shutdown-missing',
      nodeAddress: '10.0.0.23:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async () => {
          updateCalls++;
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        },
        upsertSystemTableRow: async () => {
          t.fail('missing node row should not be synthesized on shutdown');
        },
      },
      systemTableCache: {
        get: () => null,
      },
      now: () => 33445,
    });

    const published = await service.reportNodeShutdown();

    t.equal(published, false, 'shutdown publication should skip when row is absent');
    t.equal(updateCalls, 0, 'shutdown publication should not write without a cached row');

    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
