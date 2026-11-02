// The node's startup dynamic configuration has one owner even when its 300 ms
// startup bounds are spent (dynamic-config-startup-owned-initialization, rows
// 4 and 5 of the fixed-work-bound census). A stored value whose read completes
// after the bound is still applied, with no CDC apply to carry it (a
// restarting node); a controller whose initialize completes after the bound is
// owned or cancelled, never left running beside the wiring after shutdown.
import {EventEmitter} from 'events';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {CONFIG_KEY} from '../../src/config/config-constants.js';
import {ConfigValueType} from '../../src/config/dynamic-config-service.js';
import {createDynamicConfigStartupWiring} from
  '../../src/config/dynamic-config-startup-wiring.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// The startup reads run first, each bounded by 300 ms; the controller's
// initialize starts after them under its own 300 ms bound. Reads that answer
// only after 700 ms are late for both.
const LATE_MS = 700;
const SETTLE_MS = LATE_MS * 2;

const STORED_RAFT_TIMING = Object.freeze({
  [CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS]: '120',
  [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS]: '1800',
  [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS]: '5400',
  [CONFIG_KEY.RAFT_TICK_INTERVAL_MS]: '25',
});

function storedRow(key, value, valueType = ConfigValueType.NUMBER) {
  return {config_key: key, config_value: value, value_type: valueType};
}

// The config table of a restarting node under load: every stored row is
// local, and no read answers before the startup bound has passed; reads made
// after that answer at once.
function lateSqlQueryEngine(rowsByKey) {
  const answersFrom = Date.now() + LATE_MS;
  return {
    async executeQuery(sql, params = []) {
      if (!sql.includes('WHERE config_key = ?')) return {rows: []};
      const waitMs = answersFrom - Date.now();
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      const row = rowsByKey[params[0]] || null;
      return {rows: row ? [row] : []};
    },
  };
}

function raftService() {
  const calls = [];
  return {calls, service: {
    applyRaftTimingConfig(timing) {
      calls.push({...timing});
      return true;
    },
  }};
}

function settle() {
  return new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
}

// Every interval started while the wiring lives, and whether it was cleared.
function trackIntervals() {
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;
  const live = new Set();
  globalThis.setInterval = (...args) => {
    const handle = realSet(...args);
    live.add(handle);
    return handle;
  };
  globalThis.clearInterval = (handle) => {
    live.delete(handle);
    return realClear(handle);
  };
  return {
    live,
    restore() {
      for (const handle of live) realClear(handle);
      globalThis.setInterval = realSet;
      globalThis.clearInterval = realClear;
    },
  };
}

test('setup owned dynamic config startup witnesses', async (t) => {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'owned-startup-node'}});
  LoggingService.resetInstance();
  t.pass('configuration initialized');
});

test('row 4: a stored raft timing whose read completes after the bound is applied ' +
  'without any CDC apply', async (t) => {
  const partition = raftService();
  const rows = {};
  for (const [key, value] of Object.entries(STORED_RAFT_TIMING)) {
    rows[key] = storedRow(key, value);
  }
  const wiring = await createDynamicConfigStartupWiring({
    nodeId: 'owned-startup-node',
    sqlQueryEngine: lateSqlQueryEngine(rows),
    messageGroupServices: new Map([['group-1', new EventEmitter()]]),
    partitionServices: new Map([['partition-1', partition.service]]),
  });
  await settle();
  t.same(partition.calls.at(-1), {
    heartbeatIntervalMs: 120,
    electionTimeoutMinMs: 1800,
    electionTimeoutMaxMs: 5400,
    tickIntervalMs: 25,
  }, 'the late stored values reach the raft replicas, not the defaults');
  wiring.shutdown();
});

test('row 5: a controller whose initialize completes after the bound leaves nothing ' +
  'running after shutdown', async (t) => {
  const intervals = trackIntervals();
  t.teardown(() => intervals.restore());
  const wiring = await createDynamicConfigStartupWiring({
    nodeId: 'owned-startup-node',
    sqlQueryEngine: lateSqlQueryEngine({
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ENABLED]: storedRow(
        CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ENABLED, 'true', ConfigValueType.BOOLEAN),
    }),
    messageGroupServices: new Map([['group-1', new EventEmitter()]]),
  });
  await settle();
  wiring.shutdown();
  t.equal(intervals.live.size, 0,
    'no adaptive timing loop outlives the wiring that started it');
});
