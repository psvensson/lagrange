import {EventEmitter} from 'events';
import {test} from '../../src/test-helpers/tap.js';
import {TRANSPORT_EVENT} from '../../src/constants/transport.js';
import {
  subscribeToMessageRouterEvents,
  subscribeToSystemTableCacheChanges,
  waitForStartupConvergence,
} from '../../src/bootstrap/shared/startup-convergence-gate.js';

function createCache() {
  const listeners = new Set();
  return {
    emit(tableName, operation = 'UPDATE', record = {}, metadata = null) {
      for (const listener of listeners) {
        listener(tableName, operation, record, metadata);
      }
    },
    onCacheChange(listener) {
      listeners.add(listener);
    },
    offCacheChange(listener) {
      listeners.delete(listener);
    },
  };
}

test('waitForStartupConvergence resolves from cache-change signals',
  async (t) => {
    const cache = createCache();
    let ready = false;

    const result = await waitForStartupConvergence({
      timeoutMs: 100,
      subscriptions: [
        (notify) => subscribeToSystemTableCacheChanges(
          cache,
          notify,
          {tableNames: ['nodes']},
        ),
      ],
      evaluate: () => ({ready}),
      onBlocked: ({ready: blocked}) => {
        if (blocked) {
          return;
        }
        ready = true;
        cache.emit('nodes');
      },
    });

    t.equal(result.ready, true, 'cache signal should wake convergence gate');
  });

test('waitForStartupConvergence resolves from router-event signals',
  async (t) => {
    const messageRouter = new EventEmitter();
    let ready = false;

    const result = await waitForStartupConvergence({
      timeoutMs: 100,
      subscriptions: [
        (notify) => subscribeToMessageRouterEvents(messageRouter, notify),
      ],
      evaluate: () => ({ready}),
      onBlocked: ({ready: blocked}) => {
        if (blocked) {
          return;
        }
        ready = true;
        messageRouter.emit(TRANSPORT_EVENT.CONNECTION_ESTABLISHED, {
          nodeId: 'node-b',
        });
      },
    });

    t.equal(result.ready, true, 'router event should wake convergence gate');
  });

test('waitForStartupConvergence re-evaluates immediately after local repair',
  async (t) => {
    let ready = false;
    let repairs = 0;

    const result = await waitForStartupConvergence({
      timeoutMs: 100,
      evaluate: () => ({ready}),
      onBlocked: () => {
        if (ready) {
          return false;
        }
        repairs += 1;
        ready = true;
        return true;
      },
    });

    t.equal(result.ready, true, 'local repair should trigger reevaluation');
    t.equal(repairs, 1, 'local repair should only run once');
  });

test('waitForStartupConvergence re-evaluates on poll cadence without signals',
  async (t) => {
    let ready = false;
    const timer = setTimeout(() => {
      ready = true;
    }, 10);
    t.teardown(() => {
      clearTimeout(timer);
    });

    const result = await waitForStartupConvergence({
      timeoutMs: 100,
      pollIntervalMs: 5,
      evaluate: () => ({ready}),
    });

    t.equal(result.ready, true, 'poll cadence should detect readiness change');
  });

test('waitForStartupConvergence reports timeout context', async (t) => {
  try {
    await waitForStartupConvergence({
      timeoutMs: 20,
      evaluate: () => ({
        ready: false,
        reason: 'still_blocked',
      }),
      createTimeoutError: (_result, context) => {
        const error = new Error('startup convergence timed out');
        error.timeoutKind = context.timeoutKind;
        error.lastProgressElapsedMs = context.lastProgressElapsedMs;
        return error;
      },
    });
    t.fail('expected timeout');
  } catch (error) {
    t.equal(
      error.message,
      'startup convergence timed out',
      'timeout should use the caller-provided error',
    );
    t.equal(
      error.timeoutKind,
      'no_progress',
      'timeout should classify no-signal stalls explicitly',
    );
  }
});
