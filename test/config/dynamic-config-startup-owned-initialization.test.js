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
import {
  ConfigValueType,
  DynamicConfigService,
} from '../../src/config/dynamic-config-service.js';
import {RaftAdaptiveTimingController} from
  '../../src/config/raft-adaptive-timing-controller.js';
import {
  DYNAMIC_CONFIG_STARTUP_OUTCOME as OUTCOME,
  createDynamicConfigStartupWiring,
} from '../../src/config/dynamic-config-startup-wiring.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';

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

// Config watchers still registered on the wiring's service, any key.
function liveWatchers(wiring) {
  let count = 0;
  for (const callbacks of wiring.dynamicConfigService.watchers.values()) {
    count += callbacks.size;
  }
  return count;
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

// The wiring's bound timers are unref'd; a held read has nothing else keeping
// the process up.
const keepAlive = setInterval(() => {}, 1000);

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
  t.equal(wiring.startupOutcome().reads[CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS],
    OUTCOME.APPLIED_LATE, 'the outcome names the late apply');
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
  t.equal(wiring.startupOutcome().controller, OUTCOME.ADOPTED_LATE,
    'the late controller is adopted, not dropped');
  t.equal(intervals.live.size, 1, 'the adopted controller runs its one loop, owned');
  wiring.shutdown();
  t.equal(intervals.live.size, 0,
    'no adaptive timing loop outlives the wiring that started it');
  t.equal(liveWatchers(wiring), 0, 'and no config watcher');
});

test('row 4 ordering: a CDC apply for the key during a late read wins; the late ' +
  'read is dropped as stale, never applied', async (t) => {
  const group = new EventEmitter();
  const partition = raftService();
  const rows = {};
  for (const [key, value] of Object.entries(STORED_RAFT_TIMING)) {
    rows[key] = storedRow(key, value);
  }
  rows[CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS] =
    storedRow(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS, '130');
  const wiring = await createDynamicConfigStartupWiring({
    nodeId: 'owned-startup-node',
    sqlQueryEngine: lateSqlQueryEngine(rows),
    messageGroupServices: new Map([['group-1', group]]),
    partitionServices: new Map([['partition-1', partition.service]]),
  });
  group.emit('cdcApplied', {
    tableName: TABLES.CONFIG,
    operation: 'UPDATE',
    data: {config_key: CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS, config_value: '210',
      value_type: ConfigValueType.NUMBER},
  });
  await settle();
  t.equal(partition.calls.at(-1).heartbeatIntervalMs, 210, 'the CDC value stands');
  t.notOk(partition.calls.some((call) => call.heartbeatIntervalMs === 130),
    'the stale late read was never applied');
  t.equal(wiring.startupOutcome().reads[CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS],
    OUTCOME.DROPPED_STALE, 'the outcome names the drop');
  t.equal(partition.calls.at(-1).electionTimeoutMinMs, 1800,
    'a key with no CDC apply still gets its late value');
  wiring.shutdown();
});

test('row 5 cancellation: a shutdown while initialize is in flight leaves nothing ' +
  'running when it completes', async (t) => {
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
  t.equal(wiring.startupOutcome().controller, OUTCOME.PENDING, 'initialize still in flight');
  wiring.shutdown();
  await settle();
  t.equal(intervals.live.size, 0, 'the cancelled initialize started no loop');
  t.equal(liveWatchers(wiring), 0, 'and registered no config watcher');
  t.equal(wiring.startupOutcome().controller, OUTCOME.CANCELLED, 'the outcome names the cancel');
});

// A config table whose reads answer only when the test releases them. The rows
// are read at release, so a test can hold a read while a CDC apply passes it.
function heldSqlQueryEngine(rowsByKey, heldKeys) {
  const held = [];
  return {
    held,
    release() {
      for (const answer of held.splice(0)) answer();
    },
    async executeQuery(sql, params = []) {
      if (!sql.includes('WHERE config_key = ?')) return {rows: []};
      const key = params[0];
      if (heldKeys.has(key)) await new Promise((resolve) => held.push(resolve));
      const row = rowsByKey[key] || null;
      return {rows: row ? [row] : []};
    },
  };
}

function cdcUpdate(key, value, valueType = ConfigValueType.NUMBER) {
  return {
    tableName: TABLES.CONFIG,
    operation: 'UPDATE',
    data: {config_key: key, config_value: value, value_type: valueType},
  };
}

function wiringOptions(extra) {
  return {
    nodeId: 'owned-startup-node',
    messageGroupServices: new Map([['group-1', new EventEmitter()]]),
    ...extra,
  };
}

function tick(ms = 20) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Warnings the wiring logs through console, and any rejection left unhandled.
function trackFailures(t) {
  const warns = [];
  const unhandled = [];
  const originalWarn = console.warn;
  const onUnhandled = (reason) => unhandled.push(reason);
  console.warn = (message, context) => warns.push({message, context});
  process.on('unhandledRejection', onUnhandled);
  t.teardown(() => {
    console.warn = originalWarn;
    process.removeListener('unhandledRejection', onUnhandled);
  });
  return {warns, unhandled};
}

test('F3 P1: durable 130, CDC 210, the stale read, then CDC 130 converges to 130',
  async (t) => {
    const key = CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS;
    const group = new EventEmitter();
    const partition = raftService();
    const engine = heldSqlQueryEngine(
      {[key]: storedRow(key, '130')}, new Set([key]));
    const wiring = await createDynamicConfigStartupWiring(wiringOptions({
      sqlQueryEngine: engine,
      messageGroupServices: new Map([['group-1', group]]),
      partitionServices: new Map([['partition-1', partition.service]]),
      initialReadTimeoutMs: 20,
      controllerInitTimeoutMs: 20,
    }));
    group.emit('cdcApplied', cdcUpdate(key, '210'));
    await tick();
    engine.release();
    await tick();
    t.equal(await wiring.dynamicConfigService.get(key), 210,
      'the stale read did not overwrite the cache');
    t.equal(partition.calls.at(-1).heartbeatIntervalMs, 210, 'replicas at 210');
    t.equal(wiring.startupOutcome().reads[key], OUTCOME.DROPPED_STALE,
      'the read is named dropped');
    group.emit('cdcApplied', cdcUpdate(key, '130'));
    await tick();
    t.equal(await wiring.dynamicConfigService.get(key), 130, 'the cache follows CDC');
    t.equal(partition.calls.at(-1).heartbeatIntervalMs, 130,
      'and the replicas converge to 130');
    wiring.shutdown();
  });

test('F3: get answers the CDC value, and a delete during a read leaves nothing cached',
  async (t) => {
    const key = CONFIG_KEY.RAFT_TICK_INTERVAL_MS;
    const engine = heldSqlQueryEngine({[key]: storedRow(key, '25')}, new Set([key]));
    const service = new DynamicConfigService({sqlQueryEngine: engine});
    const first = service.get(key);
    await tick(5);
    t.equal(service.cdcApplySequence(key), 0, 'no apply yet');
    await service.handleCDCEvent(cdcUpdate(key, '40'));
    t.equal(service.cdcApplySequence(key), 1, 'one apply counted, for that key only');
    t.equal(service.cdcApplySequence(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS), 0,
      'another key is not touched');
    engine.release();
    t.equal(await first, 40, 'the in-flight read answers the CDC value');
    await service.handleCDCEvent({tableName: TABLES.CONFIG, operation: 'DELETE',
      data: {config_key: key}});
    const second = service.get(key);
    await tick(5);
    await service.handleCDCEvent({tableName: TABLES.CONFIG, operation: 'DELETE',
      data: {config_key: key}});
    engine.release();
    await second;
    t.notOk(service.configCache.has(key), 'a read older than the delete caches nothing');
    await service.shutdown?.();
  });

test('F3 P4: a stale adaptiveTimingEnabled read does not beat CDC false during ' +
  'initialize', async (t) => {
  const key = CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ENABLED;
  const engine = heldSqlQueryEngine(
    {[key]: storedRow(key, 'true', ConfigValueType.BOOLEAN)}, new Set([key]));
  const service = new DynamicConfigService({sqlQueryEngine: engine});
  let loops = 0;
  const controller = new RaftAdaptiveTimingController({
    dynamicConfigService: service,
    nodeId: 'owned-startup-node',
    intervalFactory: () => {
      loops += 1;
      return setInterval(() => {}, 100000);
    },
  });
  t.teardown(() => controller.shutdown());
  const initialize = controller.initialize();
  await tick(5);
  await service.handleCDCEvent(cdcUpdate(key, 'false', ConfigValueType.BOOLEAN));
  engine.release();
  await initialize;
  t.equal(controller.settings.enabled, false, 'CDC false stands');
  t.equal(loops, 0, 'and no adaptive loop started');
});

test('F5 w5: a CDC apply while the startup reads are still inside their bound is seen',
  async (t) => {
    const key = CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS;
    const group = new EventEmitter();
    const partition = raftService();
    const engine = heldSqlQueryEngine({[key]: storedRow(key, '130')}, new Set([key]));
    const starting = createDynamicConfigStartupWiring(wiringOptions({
      sqlQueryEngine: engine,
      messageGroupServices: new Map([['group-1', group]]),
      partitionServices: new Map([['partition-1', partition.service]]),
    }));
    await tick(100);
    group.emit('cdcApplied', cdcUpdate(key, '210'));
    engine.release();
    const wiring = await starting;
    await tick();
    t.equal(wiring.startupOutcome().reads[key], OUTCOME.DROPPED_STALE,
      'the read is dropped, not applied');
    t.equal(partition.calls.at(-1).heartbeatIntervalMs, 210, 'CDC value stands');
    wiring.shutdown();
  });

test('F5 w7: a read settling after shutdown is cancelled at read level and applies nothing',
  async (t) => {
    const key = CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS;
    const partition = raftService();
    const engine = heldSqlQueryEngine({[key]: storedRow(key, '130')}, new Set([key]));
    const wiring = await createDynamicConfigStartupWiring(wiringOptions({
      sqlQueryEngine: engine,
      partitionServices: new Map([['partition-1', partition.service]]),
      initialReadTimeoutMs: 20,
      controllerInitTimeoutMs: 20,
    }));
    const callsAtShutdown = partition.calls.length;
    wiring.shutdown();
    engine.release();
    await tick();
    t.equal(wiring.startupOutcome().reads[key], OUTCOME.CANCELLED, 'read-level cancel');
    t.equal(partition.calls.length, callsAtShutdown, 'no sweep after shutdown');
  });

test('F1: a throw in the apply path is FAILED with the old warning, never unhandled',
  async (t) => {
    const key = CONFIG_KEY.LOGGING_METRICS_DEFAULT_RESOLUTION_MS;
    const failures = trackFailures(t);
    const logging = LoggingService.getInstance();
    const original = logging.setMetricsDefaultResolutionMs;
    logging.setMetricsDefaultResolutionMs = () => {
      throw new Error('apply threw');
    };
    t.teardown(() => {
      logging.setMetricsDefaultResolutionMs = original;
    });
    const wiring = await createDynamicConfigStartupWiring(wiringOptions({
      sqlQueryEngine: heldSqlQueryEngine({}, new Set()),
    }));
    await tick();
    t.equal(wiring.startupOutcome().reads[key], OUTCOME.FAILED, 'outcome failed, not applied');
    t.ok(failures.warns.some((entry) =>
      entry.message === 'Failed to apply initial dynamic config setting' &&
      entry.context?.key === key && entry.context?.error === 'apply threw'),
    'the old warning names the key and the error');
    t.equal(failures.unhandled.length, 0, 'no unhandled rejection');
    wiring.shutdown();
  });

test('F2: a late value the sweep refuses is refused, the replicas keep their timing',
  async (t) => {
    const key = CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS;
    const partition = raftService();
    const wiring = await createDynamicConfigStartupWiring(wiringOptions({
      sqlQueryEngine: lateSqlQueryEngine({[key]: storedRow(key, '3500')}),
      partitionServices: new Map([['partition-1', partition.service]]),
    }));
    await settle();
    t.equal(wiring.startupOutcome().reads[key], OUTCOME.REFUSED, 'refused, not applied_late');
    t.notOk(partition.calls.some((call) => call.electionTimeoutMinMs === 3500),
      '3500 reached no replica');
    wiring.shutdown();
  });

test('F2: invalid timing on time is refused with no sweep', async (t) => {
  const tick0 = CONFIG_KEY.RAFT_TICK_INTERVAL_MS;
  const heartbeat = CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS;
  const persist = CONFIG_KEY.LOGGING_PERSIST_METRICS_LOGS;
  const partition = raftService();
  const wiring = await createDynamicConfigStartupWiring(wiringOptions({
    sqlQueryEngine: heldSqlQueryEngine({
      [tick0]: storedRow(tick0, '0'),
      [heartbeat]: storedRow(heartbeat, 'abc'),
      [persist]: storedRow(persist, 'nope', ConfigValueType.STRING),
    }, new Set()),
    partitionServices: new Map([['partition-1', partition.service]]),
  }));
  await tick();
  const {reads} = wiring.startupOutcome();
  t.equal(reads[tick0], OUTCOME.REFUSED, 'tick 0 refused by the sweep');
  t.equal(reads[heartbeat], OUTCOME.REFUSED, 'heartbeat abc refused at the apply');
  t.equal(reads[persist], OUTCOME.REFUSED, 'a logging value of the wrong type refused');
  t.equal(reads[CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS], OUTCOME.REFUSED,
    'a valid key in a refused sweep was not applied either');
  t.equal(partition.calls.length, 0, 'no sweep reached a replica');
  wiring.shutdown();
});

test('F2: two late keys that are only valid together are both applied late',
  async (t) => {
    const min = CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS;
    const max = CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS;
    const partition = raftService();
    const wiring = await createDynamicConfigStartupWiring(wiringOptions({
      sqlQueryEngine: lateSqlQueryEngine({
        [min]: storedRow(min, '3500'), [max]: storedRow(max, '5000')}),
      partitionServices: new Map([['partition-1', partition.service]]),
    }));
    await settle();
    const {reads} = wiring.startupOutcome();
    t.equal(reads[min], OUTCOME.APPLIED_LATE, 'min applied late');
    t.equal(reads[max], OUTCOME.APPLIED_LATE, 'max applied late');
    t.equal(partition.calls.at(-1).electionTimeoutMinMs, 3500, 'replicas hold the pair');
    wiring.shutdown();
  });

test('F5 w9: a failed initialize is FAILED and its controller shut down', async (t) => {
  const key = CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS;
  trackFailures(t);
  const engine = {
    async executeQuery(sql, params = []) {
      if (params[0] === key) throw new Error('read refused');
      return {rows: []};
    },
  };
  const wiring = await createDynamicConfigStartupWiring(wiringOptions({
    sqlQueryEngine: engine,
  }));
  await tick();
  const outcome = wiring.startupOutcome();
  t.equal(outcome.reads[key], OUTCOME.FAILED, 'the read names its failure');
  t.equal(outcome.controller, OUTCOME.FAILED, 'and so does the controller');
  const watchers = wiring.dynamicConfigService.watchers.get(
    CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ENABLED);
  t.equal(watchers?.size ?? 0, 0, 'the failed controller left no watcher');
  wiring.shutdown();
});

test('UNAVAILABLE: a controller that cannot be constructed is named', async (t) => {
  const failures = trackFailures(t);
  const logging = LoggingService.getInstance();
  const original = logging.isInitialized;
  logging.isInitialized = function isInitialized() {
    if (new Error().stack.includes('new RaftAdaptiveTimingController')) {
      throw new Error('controller refused');
    }
    return original.call(this);
  };
  t.teardown(() => {
    logging.isInitialized = original;
  });
  const wiring = await createDynamicConfigStartupWiring(wiringOptions({
    sqlQueryEngine: heldSqlQueryEngine({}, new Set()),
  }));
  t.equal(wiring.startupOutcome().controller, OUTCOME.UNAVAILABLE, 'unavailable');
  t.ok(failures.warns.some((entry) => entry.context?.error === 'controller refused'),
    'and warned');
  wiring.shutdown();
});

function controllerOver(get) {
  const watched = [];
  const started = [];
  const controller = new RaftAdaptiveTimingController({
    nodeId: 'owned-startup-node',
    dynamicConfigService: {get, watch: () => {
      const entry = {live: true};
      watched.push(entry);
      return () => {
        entry.live = false;
      };
    }},
    intervalFactory: () => {
      const handle = setInterval(() => {}, 100000);
      started.push(handle);
      return handle;
    },
  });
  return {controller, watched, started,
    liveWatchers: () => watched.filter((entry) => entry.live).length};
}

test('F5 c1: initialize after shutdown reads nothing', async (t) => {
  let reads = 0;
  const {controller, watched} = controllerOver(async () => {
    reads += 1;
    return undefined;
  });
  controller.shutdown();
  await controller.initialize();
  t.equal(reads, 0, 'no config read');
  t.equal(watched.length, 0, 'no watcher');
});

test('F5 c2: a shutdown during loadConfig registers no watcher, though profile ' +
  'detection never answers', async (t) => {
  const release = [];
  const {controller, watched} = controllerOver(() =>
    new Promise((resolve) => release.push(resolve)));
  void controller.initialize();
  await tick(5);
  controller.shutdown();
  for (let round = 0; round < 40 && release.length > 0; round += 1) {
    release.shift()(undefined);
    await tick(1);
  }
  t.equal(watched.length, 0, 'loadConfig finished into a stopped controller');
});

test('F5 c3: a shutdown during profile detection leaves it uninitialized', async (t) => {
  const detectKey = CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS;
  let releaseDetect = null;
  const {controller, started, liveWatchers} = controllerOver((key) =>
    (key === detectKey ?
      new Promise((resolve) => {
        releaseDetect = resolve;
      }) :
      Promise.resolve(key === CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ENABLED ? true : undefined)));
  t.teardown(() => controller.shutdown());
  const initialize = controller.initialize();
  await tick();
  t.ok(releaseDetect, 'detection is in flight');
  controller.shutdown();
  releaseDetect(undefined);
  await initialize;
  t.equal(controller.initialized, false, 'never initialized');
  t.equal(liveWatchers(), 0, 'its watchers are gone');
  t.equal(started.length, 0, 'no loop');
});

test('F5 c4: startLoop on a stopped controller starts nothing', async (t) => {
  const {controller, started} = controllerOver(async () => undefined);
  controller.shutdown();
  controller.startLoop();
  t.equal(started.length, 0, 'no interval');
});

const HEARTBEAT = CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS;
const ELECTION_MIN = CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS;
const ELECTION_MAX = CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS;
const TICK = CONFIG_KEY.RAFT_TICK_INTERVAL_MS;

// A wiring whose raft keys are stored as `rows`. `lateKeys` answer when
// released, after the bound; `failFirst` keys fail their first read only, so
// the durable row stays valid and later reads find it.
async function blockedStart(t, {rows, lateKeys = [], failFirst = []}) {
  trackFailures(t);
  // Every wiring writes accepted timing to the singleton: start on defaults.
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'owned-startup-node'}});
  const group = new EventEmitter();
  const partition = raftService();
  const engine = heldSqlQueryEngine(rows, new Set(lateKeys));
  const failing = new Set(failFirst);
  const executeQuery = engine.executeQuery.bind(engine);
  engine.executeQuery = async (sql, params = []) => {
    if (failing.delete(params[0])) throw new Error('read failed');
    return executeQuery(sql, params);
  };
  const wiring = await createDynamicConfigStartupWiring(wiringOptions({
    sqlQueryEngine: engine,
    messageGroupServices: new Map([['group-1', group]]),
    partitionServices: new Map([['partition-1', partition.service]]),
    initialReadTimeoutMs: 20,
    controllerInitTimeoutMs: 20,
  }));
  engine.release();
  await tick(40);
  return {group, partition, wiring, reads: () => wiring.startupOutcome().reads};
}

// Three good CDC writes of another key reach the replicas.
async function assertCdcNotBlocked(t, {group, partition}) {
  for (const value of ['61', '62', '63']) {
    group.emit('cdcApplied', cdcUpdate(HEARTBEAT, value));
    await tick(5);
    t.equal(partition.calls.at(-1)?.heartbeatIntervalMs, Number(value),
      `heartbeat ${value} reaches the replicas`);
  }
}

function storedTiming(overrides) {
  const rows = {};
  for (const [key, value] of Object.entries({...STORED_RAFT_TIMING, ...overrides})) {
    rows[key] = storedRow(key, value);
  }
  return rows;
}

test('R1 B1: an on-time bad tick blocks no CDC, and its own CDC heals it', async (t) => {
  const run = await blockedStart(t, {rows: storedTiming({[TICK]: '0'})});
  t.equal(run.reads()[TICK], OUTCOME.REFUSED, 'tick refused');
  await assertCdcNotBlocked(t, run);
  run.group.emit('cdcApplied', cdcUpdate(TICK, '25'));
  await tick(5);
  t.equal(run.partition.calls.at(-1).tickIntervalMs, 25, 'the fixed tick applies');
  t.equal(run.partition.calls.at(-1).electionTimeoutMinMs, 1800,
    'and the held stored values with it');
  t.equal(run.reads()[TICK], OUTCOME.HEALED_BY_CDC, 'the refused outcome clears');
  t.equal(run.reads()[ELECTION_MIN], OUTCOME.APPLIED, 'the held reads resolve');
  run.wiring.shutdown();
});

test('R1 B2: a late bad tick blocks no CDC', async (t) => {
  const run = await blockedStart(t, {rows: storedTiming({[TICK]: '0'}), lateKeys: [TICK]});
  t.equal(run.reads()[TICK], OUTCOME.REFUSED, 'tick refused');
  await assertCdcNotBlocked(t, run);
  t.notOk(run.partition.calls.some((call) => call.tickIntervalMs === 0), '0 reached no replica');
  run.wiring.shutdown();
});

test('R1 B3 and the equal-value heal: an on-time failed read of a valid durable max',
  async (t) => {
    const run = await blockedStart(t, {
      rows: storedTiming({[ELECTION_MIN]: '3500', [ELECTION_MAX]: '5400'}),
      failFirst: [ELECTION_MAX],
    });
    t.equal(run.reads()[ELECTION_MAX], OUTCOME.FAILED, 'the failed read is named');
    t.equal(run.reads()[ELECTION_MIN], OUTCOME.REFUSED, 'the min it would have allowed is refused');
    t.equal(await run.wiring.dynamicConfigService.get(ELECTION_MAX), 5400,
      'the service cache already holds the durable value');
    await assertCdcNotBlocked(t, run);
    run.group.emit('cdcApplied', cdcUpdate(ELECTION_MAX, '5400'));
    await tick(5);
    t.equal(run.partition.calls.at(-1).electionTimeoutMaxMs, 5400,
      'a CDC equal to the cache is adopted');
    t.equal(run.partition.calls.at(-1).electionTimeoutMinMs, 3500,
      'and the held min applies with it');
    t.equal(run.reads()[ELECTION_MAX], OUTCOME.HEALED_BY_CDC, 'the outcome names the heal');
    t.equal(run.reads()[ELECTION_MIN], OUTCOME.APPLIED, 'the held read is applied');
    run.wiring.shutdown();
  });

test('R1 B4: a late refused min with a failed max blocks no CDC, and heals', async (t) => {
  const run = await blockedStart(t, {
    rows: storedTiming({[ELECTION_MIN]: '3500', [ELECTION_MAX]: '5400'}),
    lateKeys: [ELECTION_MIN],
    failFirst: [ELECTION_MAX],
  });
  t.equal(run.reads()[ELECTION_MIN], OUTCOME.REFUSED, 'min refused');
  t.equal(run.reads()[ELECTION_MAX], OUTCOME.FAILED, 'max failed');
  await assertCdcNotBlocked(t, run);
  run.group.emit('cdcApplied', cdcUpdate(ELECTION_MAX, '5400'));
  await tick(5);
  t.equal(run.partition.calls.at(-1).electionTimeoutMinMs, 3500, 'the held min applies');
  t.equal(run.reads()[ELECTION_MIN], OUTCOME.APPLIED_LATE, 'and its refusal clears');
  t.equal(run.reads()[ELECTION_MAX], OUTCOME.HEALED_BY_CDC, 'max is healed');
  run.wiring.shutdown();
});

test('R1: a refused CDC value is held, blocks nothing, and a held refusal clears on ' +
  'its own key', async (t) => {
  const run = await blockedStart(t, {rows: {[ELECTION_MIN]: storedRow(ELECTION_MIN, '3500')},
    lateKeys: [ELECTION_MIN]});
  t.equal(run.reads()[ELECTION_MIN], OUTCOME.REFUSED, 'min refused');
  run.group.emit('cdcApplied', cdcUpdate(TICK, '0'));
  await tick(5);
  await assertCdcNotBlocked(t, run);
  run.group.emit('cdcApplied', cdcUpdate(TICK, '30'));
  await tick(5);
  t.equal(run.partition.calls.at(-1).tickIntervalMs, 30, 'tick 30 supersedes the held 0');
  run.group.emit('cdcApplied', cdcUpdate(ELECTION_MIN, '2000'));
  await tick(5);
  t.equal(run.partition.calls.at(-1).electionTimeoutMinMs, 2000, 'the CDC min applies');
  t.equal(run.reads()[ELECTION_MIN], OUTCOME.HEALED_BY_CDC, 'the held refusal cleared');
  run.wiring.shutdown();
});

test('R1 pair: CDC keys valid only together apply when the second arrives', async (t) => {
  const run = await blockedStart(t, {rows: {}});
  const calls = run.partition.calls.length;
  run.group.emit('cdcApplied', cdcUpdate(ELECTION_MIN, '3500'));
  await tick(5);
  t.equal(run.partition.calls.length, calls, 'the first alone is refused');
  run.group.emit('cdcApplied', cdcUpdate(ELECTION_MAX, '5000'));
  await tick(5);
  t.equal(run.partition.calls.at(-1).electionTimeoutMinMs, 3500, 'min applies');
  t.equal(run.partition.calls.at(-1).electionTimeoutMaxMs, 5000, 'with max');
  run.wiring.shutdown();
});

test('heal: an equal-value CDC adopts a failed logging key', async (t) => {
  const key = CONFIG_KEY.LOGGING_METRICS_DEFAULT_RESOLUTION_MS;
  const run = await blockedStart(t, {rows: {[key]: storedRow(key, '7000')},
    failFirst: [key]});
  t.equal(run.reads()[key], OUTCOME.FAILED, 'failed');
  await run.wiring.dynamicConfigService.handleCDCEvent(cdcUpdate(key, '7000'));
  run.group.emit('cdcApplied', cdcUpdate(key, '7000'));
  await tick(5);
  t.equal(run.reads()[key], OUTCOME.HEALED_BY_CDC, 'healed though the cache was equal');
  run.wiring.shutdown();
});

function cdcDelete(key) {
  return {tableName: TABLES.CONFIG, operation: 'DELETE', data: {config_key: key}};
}

test('D1: a DELETE CDC drops the held value of its key, which never applies later',
  async (t) => {
    const run = await blockedStart(t, {rows: {[ELECTION_MIN]: storedRow(ELECTION_MIN, '3500')},
      lateKeys: [ELECTION_MIN]});
    t.equal(run.reads()[ELECTION_MIN], OUTCOME.REFUSED, 'held, refused');
    run.group.emit('cdcApplied', cdcDelete(ELECTION_MIN));
    await tick(5);
    t.equal(run.reads()[ELECTION_MIN], OUTCOME.DROPPED_STALE, 'the outcome names the drop');
    run.group.emit('cdcApplied', cdcUpdate(ELECTION_MAX, '5000'));
    await tick(5);
    t.equal(run.partition.calls.at(-1).electionTimeoutMaxMs, 5000, 'max applies');
    t.notOk(run.partition.calls.some((call) => call.electionTimeoutMinMs === 3500),
      'the deleted row\'s value never reaches a replica');
    run.wiring.shutdown();
  });

test('W1: a DELETE CDC does not heal a failed key', async (t) => {
  const run = await blockedStart(t, {rows: {}, failFirst: [TICK]});
  t.equal(run.reads()[TICK], OUTCOME.FAILED, 'failed');
  const calls = run.partition.calls.length;
  run.group.emit('cdcApplied', cdcDelete(TICK));
  await tick(5);
  t.equal(run.reads()[TICK], OUTCOME.FAILED, 'still failed');
  t.equal(run.partition.calls.length, calls, 'no sweep');
  run.wiring.shutdown();
});

test('W1: a heal overtaken by shutdown applies nothing', async (t) => {
  const run = await blockedStart(t, {rows: {}, failFirst: [TICK]});
  const service = run.wiring.dynamicConfigService;
  const get = service.get.bind(service);
  service.get = async (key) => {
    run.wiring.shutdown();
    return get(key);
  };
  service.configCache.set(TICK, 30);
  const calls = run.partition.calls.length;
  run.group.emit('cdcApplied', cdcUpdate(TICK, '30'));
  await tick(5);
  t.equal(run.partition.calls.length, calls, 'no sweep after shutdown');
  t.equal(run.reads()[TICK], OUTCOME.FAILED, 'and no heal recorded');
});

test('teardown', async (t) => {
  clearInterval(keepAlive);
  t.pass('keep-alive released');
});
