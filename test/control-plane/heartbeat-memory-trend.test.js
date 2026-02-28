import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  HeartbeatService,
  calculateUsageSlopePerMinute,
} from '../../src/control-plane/heartbeat-service.js';
import {HEARTBEAT_EVENT} from
  '../../src/control-plane/heartbeat-service-constants.js';

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
