import {EventEmitter} from 'events';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {CONFIG_KEY} from '../../src/config/config-constants.js';
import {createDynamicConfigStartupWiring} from
  '../../src/config/dynamic-config-startup-wiring.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Witness, re-derived (dynamic-config-startup-owned-initialization, which
// supersedes under R09 the designed-fallback classification of 2026-10-04):
// the startup dynamic-config reads and the adaptive-controller
// initialization are owned startup work with a bound. Startup proceeds on the
// defaults when a bound is spent, exactly as before; the spend is now a
// reported late state (one wait_bound_spent per bound, under the constant's
// own name), and the late result is applied by the owner when it arrives
// (see dynamic-config-startup-owned-initialization.test.js).

function createSqlQueryEngine(neverResolve) {
  return {
    async executeQuery(sql) {
      if (neverResolve && sql.includes('WHERE config_key = ?')) {
        return new Promise(() => {});
      }
      return {rows: []};
    },
  };
}

/**
 * Run the wiring with console.error / console.warn captured (an
 * uninitialized LoggingService makes the wiring log through console).
 * @param {Object} options
 * @return {Promise<{wiring: Object, spent: Array<Object>,
 *   warns: Array<Object>}>}
 */
async function runWiringCapturingSpent({afterStartupMs = 0, ...options}) {
  const errors = [];
  const warns = [];
  // The wiring's bound timers are unref'd; keep the loop alive meanwhile.
  const keepAlive = setInterval(() => {}, 1000);
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (message, context) => {
    errors.push({message, context});
  };
  console.warn = (message, context) => {
    warns.push({message, context});
  };
  try {
    const wiring = await createDynamicConfigStartupWiring({
      nodeId: 'witness-node',
      messageGroupServices: new Map([['group-1', new EventEmitter()]]),
      initialReadTimeoutMs: 20,
      controllerInitTimeoutMs: 20,
      ...options,
    });
    if (afterStartupMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, afterStartupMs));
    }
    return {
      wiring,
      warns,
      spent: errors.filter((entry) =>
        entry.context?.event === 'wait_bound_spent'),
    };
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
    clearInterval(keepAlive);
  }
}

test('setup dynamic config wait-bound witnesses', async (t) => {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'witness-node'}});
  LoggingService.resetInstance();
  t.pass('configuration initialized, logging service left uninitialized');
});

test('stalled startup config reads: startup proceeds on defaults and each spent ' +
  'bound is reported under its own name, the read still owned', async (t) => {
  const {wiring, spent, warns} = await runWiringCapturingSpent({
    sqlQueryEngine: createSqlQueryEngine(true),
  });
  t.ok(wiring, 'startup still resolves while the reads stall');
  const readSpent = spent.filter((entry) =>
    entry.context?.wait === 'DYNAMIC_CONFIG_STARTUP_INITIAL_READ_TIMEOUT_MS');
  t.equal(readSpent.length, 8, 'one wait_bound_spent per stalled startup key');
  for (const entry of readSpent) {
    t.equal(typeof entry.context?.scope?.key, 'string', 'the spend names the key');
    t.equal(entry.context?.boundMs, 20, 'the spend names its bound');
  }
  t.equal(warns.filter((entry) => String(entry.message)
    .includes('Failed to apply initial dynamic config setting')).length, 0,
  'a late read is not a failed read');
  t.equal(spent.filter((entry) => entry.context?.wait ===
    'DYNAMIC_CONFIG_STARTUP_CONTROLLER_INIT_TIMEOUT_MS').length, 1,
  'the stalled controller initialize is reported once under its own name');
  const outcome = wiring.startupOutcome();
  t.ok(Object.values(outcome.reads).every((state) => state === 'pending'),
    'every stalled read is still owned, pending');
  t.equal(outcome.controller, 'pending', 'the controller is still owned, pending');
  wiring.shutdown();
});

test('completed startup config reads log no wait_bound_spent', async (t) => {
  const {wiring, spent} = await runWiringCapturingSpent({
    sqlQueryEngine: createSqlQueryEngine(false),
    afterStartupMs: 80,
  });
  t.ok(wiring, 'wiring resolves');
  t.equal(spent.length, 0,
    'no wait_bound_spent when every read completes, even after the bound has passed');
  t.ok(Object.values(wiring.startupOutcome().reads).every((state) => state === 'applied'),
    'every read applied on time');
  wiring.shutdown();
});

test('a spent bound starts on the defaults, a CDC apply reaches the replicas, and the ' +
  'late read then loses to it', async (t) => {
  const key = CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS;
  const group = new EventEmitter();
  const calls = [];
  const held = [];
  const {wiring, spent} = await runWiringCapturingSpent({
    messageGroupServices: new Map([['group-1', group]]),
    partitionServices: new Map([['partition-1', {
      applyRaftTimingConfig(timing) {
        calls.push({...timing});
        return true;
      },
    }]]),
    sqlQueryEngine: {
      async executeQuery(sql, params = []) {
        if (!sql.includes('WHERE config_key = ?')) return {rows: []};
        await new Promise((resolve) => held.push(resolve));
        return {rows: params[0] === key ? [{config_key: key, config_value: '130',
          value_type: 'number'}] : []};
      },
    },
  });
  t.ok(spent.length > 0, 'the bounds were spent');
  const defaults = ConfigurationManager.getInstance().get(key);
  t.equal(calls.length, 1, 'one startup sweep');
  t.equal(calls[0].heartbeatIntervalMs, defaults, 'on the default, the read still out');
  group.emit('cdcApplied', {tableName: 'config', operation: 'UPDATE',
    data: {config_key: key, config_value: '210', value_type: 'number'}});
  await new Promise((resolve) => setTimeout(resolve, 10));
  t.equal(calls.at(-1).heartbeatIntervalMs, 210, 'CDC after the spend applies');
  for (const answer of held.splice(0)) answer();
  await new Promise((resolve) => setTimeout(resolve, 20));
  t.equal(calls.at(-1).heartbeatIntervalMs, 210, 'the late read did not undo it');
  t.equal(wiring.startupOutcome().reads[key], 'dropped_stale', 'and is named dropped');
  wiring.shutdown();
});
