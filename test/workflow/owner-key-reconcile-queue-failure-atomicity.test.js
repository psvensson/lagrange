import {test} from '../../src/test-helpers/tap.js';
import {OwnerKeyReconcileQueue} from
  '../../src/workflow/owner-key-reconcile-queue.js';

test('retry error accessors are captured once before policy evaluation',
  async (t) => {
    const timers = [];
    let codeReads = 0;
    const retryError = new Error('retryable build failure');
    Object.defineProperty(retryError, 'code', {
      configurable: true,
      get() {
        codeReads++;
        if (codeReads > 1) throw new Error('second code read escaped');
        return 'RETRYABLE_BUILD';
      },
    });
    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async () => {},
      setTimeoutFn: (callback, delayMs) => {
        const timer = {callback, delayMs, unref() {}};
        timers.push(timer);
        return timer;
      },
      clearTimeoutFn: () => {},
      retryPolicy: {
        isRetryableError: (error) => error.code === 'RETRYABLE_BUILD',
        getRetryAfterMs: () => 5,
        getFailureReason: (error) => error.code,
        maxAttempts: 3,
      },
    });
    queue.logger = {debug() {}, error() {}, warn() {}};

    let escaped = null;
    try {
      queue._deferRetryableDrainFailure(
        'owner-a',
        {context: null, reasons: new Set(['source_changed'])},
        ['source_changed'],
        retryError,
      );
    } catch (error) {
      escaped = error;
    }

    t.equal(escaped, null, 'a changing error accessor cannot escape retry');
    t.equal(codeReads, 1, 'the untrusted code accessor is read exactly once');
    t.equal(timers.length, 1, 'the retry owner retains a wake timer');
    t.same(queue.getDiagnostics().retryingKeys, ['owner-a'],
      'the retry owner remains represented in queue state');
    queue.shutdown();
  });

test('retry timer registration failure becomes loud terminal ownership',
  async (t) => {
    const exhausted = [];
    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async () => {},
      setTimeoutFn: () => {
        throw new Error('timer registration failed');
      },
      clearTimeoutFn: () => {},
      retryPolicy: {
        isRetryableError: () => true,
        getRetryAfterMs: () => 5,
        getFailureReason: () => 'retryable_build',
        maxAttempts: 3,
      },
    });
    queue.logger = {debug() {}, error() {}, warn() {}};
    queue.on('retryable_drain_exhausted', (event) => exhausted.push(event));

    let escaped = null;
    try {
      queue._deferRetryableDrainFailure(
        'owner-a',
        {context: null, reasons: new Set(['source_changed'])},
        ['source_changed'],
        new Error('retryable build failure'),
      );
    } catch (error) {
      escaped = error;
    }

    const diagnostics = queue.getDiagnostics();
    t.equal(escaped, null, 'timer registration failure cannot escape');
    t.same(diagnostics.retryingKeys, [], 'no timerless retry remains live');
    t.same(diagnostics.exhaustedRetryKeys, ['owner-a'],
      'the failed owner remains in loud terminal state');
    t.equal(exhausted.length, 1, 'terminal ownership emits one loud event');
    t.equal(exhausted[0].failureReason, 'retry_timer_registration_failed',
      'terminal state names the scheduling boundary that failed');
    queue.shutdown();
  });
