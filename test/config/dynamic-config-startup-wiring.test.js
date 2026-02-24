import {EventEmitter} from 'events';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {CONFIG_KEY} from '../../src/config/config-constants.js';
import {ConfigValueType} from '../../src/config/dynamic-config-service.js';
import {createDynamicConfigStartupWiring} from
  '../../src/config/dynamic-config-startup-wiring.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';

/**
 * Build a minimal SQL query engine mock for config lookups.
 * @param {Object} rowsByKey
 * @return {{executeQuery: Function}}
 */
function createMockSqlQueryEngine(rowsByKey = {}) {
  return {
    async executeQuery(sql, params = []) {
      if (sql.includes('WHERE config_key = ?')) {
        const key = params[0];
        const row = rowsByKey[key] || null;
        return {rows: row ? [row] : []};
      }
      return {rows: []};
    },
  };
}

/**
 * Build a SQL engine mock that never resolves config lookups.
 * @return {{executeQuery: Function}}
 */
function createNeverResolvingConfigSqlQueryEngine() {
  return {
    async executeQuery(sql, _params = []) {
      if (sql.includes('WHERE config_key = ?')) {
        return new Promise(() => {});
      }
      return {rows: []};
    },
  };
}

/**
 * Wait for queued async CDC handling to complete.
 * @return {Promise<void>}
 */
function flushAsync() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

/**
 * Create a raft-capable service test double.
 * @param {Object} [options]
 * @param {boolean|Function} [options.runtimeResult]
 * @return {{calls: Array<Object>, service: Object}}
 */
function createMockRaftService(options = {}) {
  const calls = [];
  const runtimeResult = options.runtimeResult === undefined ?
    true :
    options.runtimeResult;
  return {
    calls,
    service: {
      applyRaftTimingConfig(timingConfig) {
        calls.push({...timingConfig});
        if (typeof runtimeResult === 'function') {
          return runtimeResult(timingConfig);
        }
        return runtimeResult;
      },
    },
  };
}

test('setup dynamic config startup wiring tests', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  t.pass('configuration initialized');
});

test('Dynamic config startup wiring applies initial metrics persistence setting', async (t) => {
  LoggingService.resetInstance();
  const loggingService = LoggingService.getInstance();
  loggingService.initialize({
    nodeId: 'test-node',
    persistMetricsLogs: true,
  });

  const messageGroupService = new EventEmitter();
  const sqlQueryEngine = createMockSqlQueryEngine({
    [CONFIG_KEY.LOGGING_PERSIST_METRICS_LOGS]: {
      config_key: CONFIG_KEY.LOGGING_PERSIST_METRICS_LOGS,
      config_value: 'false',
      value_type: ConfigValueType.BOOLEAN,
    },
  });

  const wiring = await createDynamicConfigStartupWiring({
    nodeId: 'test-node',
    sqlQueryEngine,
    messageGroupServices: new Map([['group-1', messageGroupService]]),
  });

  t.equal(
    loggingService.getDiagnosticsStats().persistMetricsLogs,
    false,
    'startup should apply persisted config value',
  );

  wiring.shutdown();
  LoggingService.resetInstance();
});

test('Dynamic config startup wiring does not block startup on stalled config reads',
  async (t) => {
    LoggingService.resetInstance();
    const loggingService = LoggingService.getInstance();
    loggingService.initialize({
      nodeId: 'test-node',
      persistMetricsLogs: true,
    });

    const messageGroupService = new EventEmitter();
    const sqlQueryEngine = createNeverResolvingConfigSqlQueryEngine();

    const startAt = Date.now();
    const wiring = await Promise.race([
      createDynamicConfigStartupWiring({
        nodeId: 'test-node',
        sqlQueryEngine,
        messageGroupServices: new Map([['group-1', messageGroupService]]),
      }),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('startup wiring creation timed out'));
        }, 1000);
      }),
    ]);
    const elapsedMs = Date.now() - startAt;

    t.ok(wiring, 'startup wiring should still resolve');
    t.ok(
      elapsedMs < 1000,
      'startup wiring should not block on initial config read stalls',
    );

    wiring.shutdown();
    LoggingService.resetInstance();
  });

test('Dynamic config startup wiring applies initial metrics policy settings', async (t) => {
  LoggingService.resetInstance();
  const loggingService = LoggingService.getInstance();
  loggingService.initialize({
    nodeId: 'test-node',
    persistMetricsLogs: false,
    metricsDefaultResolutionMs: 1000,
    metricsDetailedWindowEnabled: false,
    metricsDetailedWindowTtlMs: 5000,
  });

  const messageGroupService = new EventEmitter();
  const sqlQueryEngine = createMockSqlQueryEngine({
    [CONFIG_KEY.LOGGING_METRICS_DEFAULT_RESOLUTION_MS]: {
      config_key: CONFIG_KEY.LOGGING_METRICS_DEFAULT_RESOLUTION_MS,
      config_value: '15000',
      value_type: ConfigValueType.NUMBER,
    },
    [CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_TTL_MS]: {
      config_key: CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_TTL_MS,
      config_value: '120000',
      value_type: ConfigValueType.NUMBER,
    },
    [CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_ENABLED]: {
      config_key: CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_ENABLED,
      config_value: 'true',
      value_type: ConfigValueType.BOOLEAN,
    },
  });

  const wiring = await createDynamicConfigStartupWiring({
    nodeId: 'test-node',
    sqlQueryEngine,
    messageGroupServices: new Map([['group-1', messageGroupService]]),
  });

  const diagnostics = loggingService.getDiagnosticsStats();
  t.equal(
    diagnostics.metricsDefaultResolutionMs,
    15000,
    'startup should apply metrics resolution from persisted config',
  );
  t.equal(
    diagnostics.metricsDetailedWindowTtlMs,
    120000,
    'startup should apply detailed window TTL from persisted config',
  );
  t.equal(
    diagnostics.metricsDetailedWindowEnabled,
    true,
    'startup should apply detailed metrics window enablement',
  );
  t.ok(
    diagnostics.metricsDetailedWindowRemainingMs > 0,
    'startup should initialize detailed window remaining lifetime',
  );

  wiring.shutdown();
  LoggingService.resetInstance();
});

test('Dynamic config startup wiring applies config CDC updates at runtime', async (t) => {
  LoggingService.resetInstance();
  const loggingService = LoggingService.getInstance();
  loggingService.initialize({
    nodeId: 'test-node',
    persistMetricsLogs: false,
  });

  const messageGroupService = new EventEmitter();
  const sqlQueryEngine = createMockSqlQueryEngine();

  const wiring = await createDynamicConfigStartupWiring({
    nodeId: 'test-node',
    sqlQueryEngine,
    messageGroupServices: new Map([['group-1', messageGroupService]]),
  });

  messageGroupService.emit('cdcApplied', {
    tableName: TABLES.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: CONFIG_KEY.LOGGING_PERSIST_METRICS_LOGS,
      config_value: 'true',
    },
  });
  await flushAsync();

  t.equal(
    loggingService.getDiagnosticsStats().persistMetricsLogs,
    true,
    'config CDC update should enable metrics persistence',
  );

  messageGroupService.emit('cdcApplied', {
    tableName: TABLES.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-2',
      status: 'READY',
    },
  });
  await flushAsync();

  t.equal(
    loggingService.getDiagnosticsStats().persistMetricsLogs,
    true,
    'non-config CDC events should be ignored',
  );

  wiring.shutdown();

  messageGroupService.emit('cdcApplied', {
    tableName: TABLES.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: CONFIG_KEY.LOGGING_PERSIST_METRICS_LOGS,
      config_value: 'false',
    },
  });
  await flushAsync();

  t.equal(
    loggingService.getDiagnosticsStats().persistMetricsLogs,
    true,
    'shutdown should detach CDC listener',
  );

  LoggingService.resetInstance();
});

test('Dynamic config startup wiring applies metrics policy CDC updates at runtime',
  async (t) => {
    LoggingService.resetInstance();
    const loggingService = LoggingService.getInstance();
    loggingService.initialize({
      nodeId: 'test-node',
      persistMetricsLogs: false,
      metricsDefaultResolutionMs: 1000,
      metricsDetailedWindowEnabled: false,
      metricsDetailedWindowTtlMs: 5000,
    });

    const messageGroupService = new EventEmitter();
    const sqlQueryEngine = createMockSqlQueryEngine();

    const wiring = await createDynamicConfigStartupWiring({
      nodeId: 'test-node',
      sqlQueryEngine,
      messageGroupServices: new Map([['group-1', messageGroupService]]),
    });

    messageGroupService.emit('cdcApplied', {
      tableName: TABLES.CONFIG,
      operation: 'UPDATE',
      data: {
        config_key: CONFIG_KEY.LOGGING_METRICS_DEFAULT_RESOLUTION_MS,
        config_value: '25000',
      },
    });
    messageGroupService.emit('cdcApplied', {
      tableName: TABLES.CONFIG,
      operation: 'UPDATE',
      data: {
        config_key: CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_TTL_MS,
        config_value: '45000',
      },
    });
    messageGroupService.emit('cdcApplied', {
      tableName: TABLES.CONFIG,
      operation: 'UPDATE',
      data: {
        config_key: CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_ENABLED,
        config_value: 'true',
      },
    });
    await flushAsync();

    const diagnostics = loggingService.getDiagnosticsStats();
    t.equal(
      diagnostics.metricsDefaultResolutionMs,
      25000,
      'cdc update should apply metrics resolution dynamically',
    );
    t.equal(
      diagnostics.metricsDetailedWindowTtlMs,
      45000,
      'cdc update should apply detailed window TTL dynamically',
    );
    t.equal(
      diagnostics.metricsDetailedWindowEnabled,
      true,
      'cdc update should enable detailed metrics window dynamically',
    );

    wiring.shutdown();
    LoggingService.resetInstance();
  });

test('Dynamic config startup wiring applies initial raft timing settings', async (t) => {
  const config = ConfigurationManager.getInstance();
  const messageGroupService = new EventEmitter();
  const messageGroupRaft = createMockRaftService();
  messageGroupService.applyRaftTimingConfig =
    messageGroupRaft.service.applyRaftTimingConfig;
  const partitionRaft = createMockRaftService();
  const sqlQueryEngine = createMockSqlQueryEngine({
    [CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS]: {
      config_key: CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS,
      config_value: '120',
      value_type: ConfigValueType.NUMBER,
    },
    [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS]: {
      config_key: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS,
      config_value: '1800',
      value_type: ConfigValueType.NUMBER,
    },
    [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS]: {
      config_key: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS,
      config_value: '5400',
      value_type: ConfigValueType.NUMBER,
    },
    [CONFIG_KEY.RAFT_TICK_INTERVAL_MS]: {
      config_key: CONFIG_KEY.RAFT_TICK_INTERVAL_MS,
      config_value: '25',
      value_type: ConfigValueType.NUMBER,
    },
  });

  const wiring = await createDynamicConfigStartupWiring({
    nodeId: 'test-node',
    sqlQueryEngine,
    messageGroupServices: new Map([['group-1', messageGroupService]]),
    partitionServices: new Map([['partition-1', partitionRaft.service]]),
  });

  const lastMessageGroupApply =
    messageGroupRaft.calls[messageGroupRaft.calls.length - 1];
  const lastPartitionApply =
    partitionRaft.calls[partitionRaft.calls.length - 1];
  t.same(
    lastMessageGroupApply,
    {
      heartbeatIntervalMs: 120,
      electionTimeoutMinMs: 1800,
      electionTimeoutMaxMs: 5400,
      tickIntervalMs: 25,
    },
    'startup should apply persisted raft timing to message group replicas',
  );
  t.same(
    lastPartitionApply,
    {
      heartbeatIntervalMs: 120,
      electionTimeoutMinMs: 1800,
      electionTimeoutMaxMs: 5400,
      tickIntervalMs: 25,
    },
    'startup should apply persisted raft timing to partition replicas',
  );
  t.equal(
    config.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS),
    120,
    'configuration manager should keep latest heartbeat timing',
  );
  t.equal(
    config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS),
    1800,
    'configuration manager should keep latest election min timing',
  );
  t.equal(
    config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS),
    5400,
    'configuration manager should keep latest election max timing',
  );
  t.equal(
    config.get(CONFIG_KEY.RAFT_TICK_INTERVAL_MS),
    25,
    'configuration manager should keep latest raft tick interval',
  );

  wiring.shutdown();
});

test('Dynamic config startup wiring applies raft timing CDC updates', async (t) => {
  const config = ConfigurationManager.getInstance();
  const messageGroupService = new EventEmitter();
  const messageGroupRaft = createMockRaftService();
  messageGroupService.applyRaftTimingConfig =
    messageGroupRaft.service.applyRaftTimingConfig;
  const partitionRaft = createMockRaftService();
  const sqlQueryEngine = createMockSqlQueryEngine();

  const wiring = await createDynamicConfigStartupWiring({
    nodeId: 'test-node',
    sqlQueryEngine,
    messageGroupServices: new Map([['group-1', messageGroupService]]),
    partitionServices: new Map([['partition-1', partitionRaft.service]]),
  });

  messageGroupService.emit('cdcApplied', {
    tableName: TABLES.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS,
      config_value: '220',
    },
  });
  await flushAsync();

  const lastApply =
    messageGroupRaft.calls[messageGroupRaft.calls.length - 1];
  t.equal(
    lastApply.heartbeatIntervalMs,
    220,
    'cdc update should apply heartbeat changes to existing replicas',
  );
  t.equal(
    config.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS),
    220,
    'configuration manager should be updated for future replicas',
  );

  messageGroupService.emit('cdcApplied', {
    tableName: TABLES.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS,
      config_value: '3000',
    },
  });
  messageGroupService.emit('cdcApplied', {
    tableName: TABLES.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS,
      config_value: '6000',
    },
  });
  await flushAsync();

  const latestMessageGroupApply =
    messageGroupRaft.calls[messageGroupRaft.calls.length - 1];
  const latestPartitionApply =
    partitionRaft.calls[partitionRaft.calls.length - 1];
  t.same(
    latestMessageGroupApply,
    {
      heartbeatIntervalMs: 220,
      electionTimeoutMinMs: 3000,
      electionTimeoutMaxMs: 6000,
      tickIntervalMs: 20,
    },
    'cdc raft updates should apply to message group replicas',
  );
  t.same(
    latestPartitionApply,
    {
      heartbeatIntervalMs: 220,
      electionTimeoutMinMs: 3000,
      electionTimeoutMaxMs: 6000,
      tickIntervalMs: 20,
    },
    'cdc raft updates should apply to partition replicas',
  );

  wiring.shutdown();
});

test(
  'Dynamic config startup wiring keeps raft timing updates for future replicas ' +
  'when runtime apply is unsupported',
  async (t) => {
    const config = ConfigurationManager.getInstance();
    const messageGroupService = new EventEmitter();
    const deferredRaft = createMockRaftService({runtimeResult: false});
    messageGroupService.applyRaftTimingConfig =
      deferredRaft.service.applyRaftTimingConfig;
    const runtimeRaft = createMockRaftService();
    const sqlQueryEngine = createMockSqlQueryEngine();

    const wiring = await createDynamicConfigStartupWiring({
      nodeId: 'test-node',
      sqlQueryEngine,
      messageGroupServices: new Map([['group-1', messageGroupService]]),
      partitionServices: new Map([['partition-1', runtimeRaft.service]]),
    });

    messageGroupService.emit('cdcApplied', {
      tableName: TABLES.CONFIG,
      operation: 'UPDATE',
      data: {
        config_key: CONFIG_KEY.RAFT_TICK_INTERVAL_MS,
        config_value: '42',
      },
    });
    await flushAsync();

    const lastDeferredApply = deferredRaft.calls[deferredRaft.calls.length - 1];
    const lastRuntimeApply = runtimeRaft.calls[runtimeRaft.calls.length - 1];

    t.equal(
      lastDeferredApply.tickIntervalMs,
      42,
      'runtime-unsupported service should still receive canonical timing update',
    );
    t.equal(
      lastRuntimeApply.tickIntervalMs,
      42,
      'runtime-capable service should receive canonical timing update',
    );
    t.equal(
      config.get(CONFIG_KEY.RAFT_TICK_INTERVAL_MS),
      42,
      'timing update should persist in config manager for new/restarted replicas',
    );

    wiring.shutdown();
  },
);

test('cleanup dynamic config startup wiring tests', async (t) => {
  LoggingService.resetInstance();
  ConfigurationManager.resetInstance();
  t.pass('cleanup complete');
});
