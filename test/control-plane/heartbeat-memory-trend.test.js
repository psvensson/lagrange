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
