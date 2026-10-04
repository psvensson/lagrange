import {EventEmitter} from 'events';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {createDynamicConfigStartupWiring} from
  '../../src/config/dynamic-config-startup-wiring.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Witness: the startup dynamic-config reads and the adaptive-controller
// initialization are bounded; a spent bound logs one ERROR wait_bound_spent
// per awaited key/step (naming it), startup still proceeds on defaults, and a
// read that completes logs none.

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
 * Run the wiring with console.error captured (an uninitialized
 * LoggingService makes the wiring log through console).
 * @param {Object} options
 * @return {Promise<{wiring: Object, spent: Array<Object>}>}
 */
async function runWiringCapturingSpent(options) {
  const errors = [];
  // The wiring's bound timers are unref'd; keep the loop alive meanwhile.
  const keepAlive = setInterval(() => {}, 1000);
  const originalError = console.error;
  console.error = (message, context) => {
    errors.push({message, context});
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
      spent: errors.filter((entry) =>
        entry.context?.event === 'wait_bound_spent'),
    };
  } finally {
    console.error = originalError;
    clearInterval(keepAlive);
  }
}

test('setup dynamic config wait-bound witnesses', async (t) => {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'witness-node'}});
  LoggingService.resetInstance();
  t.pass('configuration initialized, logging service left uninitialized');
});

test('stalled startup config reads: one wait_bound_spent per awaited key, startup proceeds',
  async (t) => {
    const {wiring, spent} = await runWiringCapturingSpent({
      sqlQueryEngine: createSqlQueryEngine(true),
    });
    t.ok(wiring, 'post-expiry behaviour unchanged: wiring still resolves');
    const reads = spent.filter((entry) =>
      entry.context.wait === 'DYNAMIC_CONFIG_STARTUP_INITIAL_READ_TIMEOUT_MS');
    t.ok(reads.length > 0, 'stalled reads report their spent bound');
    const keys = reads.map((entry) => entry.context.lastObserved.key);
    t.equal(new Set(keys).size, keys.length,
      'exactly one wait_bound_spent per awaited key');
    for (const entry of reads) {
      t.equal(entry.context.boundMs, 20, 'reports the applied bound');
      t.equal(typeof entry.context.lastObserved.key, 'string',
        'lastObserved names the awaited key');
      t.equal(entry.context.lastObserved.promiseSettled, false,
        'lastObserved records the read had not settled');
    }
    wiring.shutdown();
  });

test('completed startup config reads log no wait_bound_spent', async (t) => {
  const {wiring, spent} = await runWiringCapturingSpent({
    sqlQueryEngine: createSqlQueryEngine(false),
  });
  t.ok(wiring, 'wiring resolves');
  t.equal(
    spent.filter((entry) =>
      entry.context.wait === 'DYNAMIC_CONFIG_STARTUP_INITIAL_READ_TIMEOUT_MS')
      .length,
    0,
    'no spent read when every read completes',
  );
  wiring.shutdown();
});
