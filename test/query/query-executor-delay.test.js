import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';

const RETRY_DELAY_MS = 1;

test('QueryExecutor delay unreferences retry backoff timers', async (t) => {
  const originalSetTimeout = globalThis.setTimeout;
  let unrefCalled = false;

  try {
    globalThis.setTimeout = (callback, _delayMs) => {
      callback();
      return {
        unref() {
          unrefCalled = true;
        },
      };
    };

    await QueryExecutor.prototype.delay.call(
      {unrefRetryDelayTimers: true},
      RETRY_DELAY_MS,
    );

    t.equal(
      unrefCalled,
      true,
      'retry backoff timers should unref so shutdown does not wait on them',
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});
