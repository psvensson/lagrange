import {EventEmitter} from 'events';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {createDynamicConfigStartupWiring} from
  '../../src/config/dynamic-config-startup-wiring.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Witness: the startup dynamic-config reads and the adaptive-controller
// initialization are startup time-boxes with a designed fallback (defaults
// now, CDC applies the stored values later): an expired box is not a spent
// wait. It logs its base WARN (INITIAL_APPLY_FAILED per key), never a
// wait_bound_spent ERROR, and startup still proceeds on defaults.

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
async function runWiringCapturingSpent(options) {
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

test('stalled startup config reads are a time-box: base WARN per key, no ' +
  'wait_bound_spent, startup proceeds', async (t) => {
  const {wiring, spent, warns} = await runWiringCapturingSpent({
    sqlQueryEngine: createSqlQueryEngine(true),
  });
  t.ok(wiring, 'post-expiry behaviour unchanged: wiring still resolves');
  t.equal(spent.length, 0, 'no wait_bound_spent for an expired time-box');
  const applyFailed = warns.filter((entry) => String(entry.message)
    .includes('Failed to apply initial dynamic config setting'));
  t.ok(applyFailed.length > 0, 'each stalled read logs its base WARN');
  for (const entry of applyFailed) {
    t.equal(typeof entry.context?.key, 'string', 'the WARN names the key');
    t.match(entry.context?.error, /Timed out|timed out/,
      'the WARN carries the time-box error');
  }
  wiring.shutdown();
});

test('completed startup config reads log no wait_bound_spent', async (t) => {
  const {wiring, spent} = await runWiringCapturingSpent({
    sqlQueryEngine: createSqlQueryEngine(false),
  });
  t.ok(wiring, 'wiring resolves');
  t.equal(spent.length, 0, 'no wait_bound_spent when every read completes');
  wiring.shutdown();
});
