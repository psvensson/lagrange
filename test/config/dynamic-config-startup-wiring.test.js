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
 * @return {{calls: Array<Object>, service: Object}}
 */
function createMockRaftService() {
  const calls = [];
  return {
    calls,
    service: {
      applyRaftTimingConfig(timingConfig) {
        calls.push({...timingConfig});
        return true;
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
    },
    'startup should apply persisted raft timing to message group replicas',
  );
  t.same(
    lastPartitionApply,
    {
      heartbeatIntervalMs: 120,
      electionTimeoutMinMs: 1800,
      electionTimeoutMaxMs: 5400,
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
    },
    'cdc raft updates should apply to message group replicas',
  );
  t.same(
    latestPartitionApply,
    {
      heartbeatIntervalMs: 220,
      electionTimeoutMinMs: 3000,
      electionTimeoutMaxMs: 6000,
    },
    'cdc raft updates should apply to partition replicas',
  );

  wiring.shutdown();
});

test('cleanup dynamic config startup wiring tests', async (t) => {
  LoggingService.resetInstance();
  ConfigurationManager.resetInstance();
  t.pass('cleanup complete');
});
