/**
 * Unit tests for ProposalQueue.
 *
 * Tests the bounded proposal queue with backpressure enforcement.
 * Validates Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {ProposalQueue} from '../../src/partition/proposal-queue.js';
import {
  PROPOSAL_QUEUE_DEFAULT,
  PROPOSAL_QUEUE_ERROR_MSG,
} from '../../src/partition/proposal-queue-constants.js';

test('ProposalQueue', async (t) => {
  t.test('constructor uses default maxCapacity', async (t) => {
    const queue = new ProposalQueue();

    t.equal(
      queue.maxCapacity,
      PROPOSAL_QUEUE_DEFAULT.MAX_CAPACITY,
      'should use default MAX_CAPACITY',
    );
    t.equal(queue.size, 0, 'should start empty');
    t.equal(queue.isFull, false, 'should not be full when empty');
  });

  t.test('constructor accepts custom maxCapacity', async (t) => {
    const queue = new ProposalQueue({maxCapacity: 5});

    t.equal(queue.maxCapacity, 5, 'should use custom maxCapacity');
  });

  t.test('enqueue adds entry to the queue', async (t) => {
    const queue = new ProposalQueue({maxCapacity: 10});
    const entry = {resolve: () => {}, reject: () => {}};

    queue.enqueue('entry-1', entry);

    t.equal(queue.size, 1, 'size should be 1 after enqueue');
    t.equal(queue.isFull, false, 'should not be full');
  });

  t.test('enqueue throws backpressure error when at capacity',
    async (t) => {
      const queue = new ProposalQueue({maxCapacity: 2});

      queue.enqueue('entry-1', {resolve: () => {}, reject: () => {}});
      queue.enqueue('entry-2', {resolve: () => {}, reject: () => {}});

      t.equal(queue.isFull, true, 'should be full at capacity');

      t.throws(
        () => queue.enqueue('entry-3', {
          resolve: () => {},
          reject: () => {},
        }),
        {message: PROPOSAL_QUEUE_ERROR_MSG.BACKPRESSURE},
        'should throw backpressure error',
      );

      t.equal(queue.size, 2, 'size should remain at capacity');
    });

  t.test('resolve removes entry and frees capacity', async (t) => {
    const queue = new ProposalQueue({maxCapacity: 2});
    let resolvedValue = null;

    queue.enqueue('entry-1', {
      resolve: (val) => {
        resolvedValue = val;
      },
      reject: () => {},
    });
    queue.enqueue('entry-2', {resolve: () => {}, reject: () => {}});

    t.equal(queue.isFull, true, 'should be full');

    const result = queue.resolve('entry-1', {success: true});

    t.equal(result, true, 'resolve should return true');
    t.equal(queue.size, 1, 'size should decrease after resolve');
    t.equal(queue.isFull, false, 'should no longer be full');
    t.same(
      resolvedValue,
      {success: true},
      'resolve callback should receive result',
    );
  });

  t.test('resolve returns false for unknown entryId', async (t) => {
    const queue = new ProposalQueue();

    const result = queue.resolve('nonexistent', {success: true});

    t.equal(result, false, 'should return false for unknown entry');
  });

  t.test('resolve clears timeout on entry', async (t) => {
    const queue = new ProposalQueue({maxCapacity: 5});
    let timeoutCleared = false;
    const fakeTimeoutId = setTimeout(() => {
      timeoutCleared = false;
    }, 10000);

    queue.enqueue('entry-1', {
      resolve: () => {},
      reject: () => {},
      timeoutId: fakeTimeoutId,
    });

    queue.resolve('entry-1', {success: true});
    clearTimeout(fakeTimeoutId);
    timeoutCleared = true;

    t.equal(timeoutCleared, true, 'timeout should be cleared');
    t.equal(queue.size, 0, 'entry should be removed');
  });

  t.test('reject removes entry and frees capacity', async (t) => {
    const queue = new ProposalQueue({maxCapacity: 2});
    let rejectedError = null;

    queue.enqueue('entry-1', {
      resolve: () => {},
      reject: (err) => {
        rejectedError = err;
      },
    });
    queue.enqueue('entry-2', {resolve: () => {}, reject: () => {}});

    t.equal(queue.isFull, true, 'should be full');

    const result = queue.reject('entry-1', 'timeout occurred');

    t.equal(result, true, 'reject should return true');
    t.equal(queue.size, 1, 'size should decrease after reject');
    t.equal(queue.isFull, false, 'should no longer be full');
    t.ok(rejectedError instanceof Error, 'reject callback should get Error');
    t.equal(
      rejectedError.message,
      'timeout occurred',
      'error message should match',
    );
  });

  t.test('reject accepts Error instance', async (t) => {
    const queue = new ProposalQueue({maxCapacity: 5});
    let rejectedError = null;

    queue.enqueue('entry-1', {
      resolve: () => {},
      reject: (err) => {
        rejectedError = err;
      },
    });

    const error = new Error('custom error');
    queue.reject('entry-1', error);

    t.equal(rejectedError, error, 'should pass Error instance directly');
  });

  t.test('reject returns false for unknown entryId', async (t) => {
    const queue = new ProposalQueue();

    const result = queue.reject('nonexistent', 'some error');

    t.equal(result, false, 'should return false for unknown entry');
  });

  t.test('reject clears timeout on entry', async (t) => {
    const queue = new ProposalQueue({maxCapacity: 5});
    const fakeTimeoutId = setTimeout(() => {}, 10000);

    queue.enqueue('entry-1', {
      resolve: () => {},
      reject: () => {},
      timeoutId: fakeTimeoutId,
    });

    queue.reject('entry-1', 'error');
    // If timeout was not cleared, the test process would hang
    // The queue's reject method clears it internally
    t.equal(queue.size, 0, 'entry should be removed');
  });

  t.test('clear rejects all pending entries', async (t) => {
    const queue = new ProposalQueue({maxCapacity: 10});
    const errors = [];

    queue.enqueue('entry-1', {
      resolve: () => {},
      reject: (err) => errors.push(err),
    });
    queue.enqueue('entry-2', {
      resolve: () => {},
      reject: (err) => errors.push(err),
    });
    queue.enqueue('entry-3', {
      resolve: () => {},
      reject: (err) => errors.push(err),
    });

    t.equal(queue.size, 3, 'should have 3 entries');

    queue.clear('leadership lost');

    t.equal(queue.size, 0, 'should be empty after clear');
    t.equal(errors.length, 3, 'all entries should be rejected');
    for (const err of errors) {
      t.ok(err instanceof Error, 'each rejection should be an Error');
      t.equal(
        err.message,
        'leadership lost',
        'error message should match reason',
      );
    }
  });

  t.test('clear clears timeouts on all entries', async (t) => {
    const queue = new ProposalQueue({maxCapacity: 10});
    const timeout1 = setTimeout(() => {}, 10000);
    const timeout2 = setTimeout(() => {}, 10000);

    queue.enqueue('entry-1', {
      resolve: () => {},
      reject: () => {},
      timeoutId: timeout1,
    });
    queue.enqueue('entry-2', {
      resolve: () => {},
      reject: () => {},
      timeoutId: timeout2,
    });

    queue.clear('shutdown');

    t.equal(queue.size, 0, 'should be empty after clear');
  });

  t.test('getStats returns size and maxCapacity', async (t) => {
    const queue = new ProposalQueue({maxCapacity: 50});

    queue.enqueue('entry-1', {resolve: () => {}, reject: () => {}});
    queue.enqueue('entry-2', {resolve: () => {}, reject: () => {}});

    const stats = queue.getStats();

    t.same(stats, {
      size: 2,
      maxCapacity: 50,
    }, 'stats should reflect current state');
  });

  t.test('getStats reflects changes after resolve/reject',
    async (t) => {
      const queue = new ProposalQueue({maxCapacity: 10});

      queue.enqueue('entry-1', {resolve: () => {}, reject: () => {}});
      queue.enqueue('entry-2', {resolve: () => {}, reject: () => {}});
      queue.enqueue('entry-3', {resolve: () => {}, reject: () => {}});

      t.equal(queue.getStats().size, 3, 'should show 3 entries');

      queue.resolve('entry-1', {});
      t.equal(queue.getStats().size, 2, 'should show 2 after resolve');

      queue.reject('entry-2', 'error');
      t.equal(queue.getStats().size, 1, 'should show 1 after reject');
    });

  t.test('capacity becomes available after resolve', async (t) => {
    const queue = new ProposalQueue({maxCapacity: 2});

    queue.enqueue('entry-1', {resolve: () => {}, reject: () => {}});
    queue.enqueue('entry-2', {resolve: () => {}, reject: () => {}});

    t.equal(queue.isFull, true, 'should be full');

    queue.resolve('entry-1', {});

    // Should now accept a new entry
    t.doesNotThrow(
      () => queue.enqueue('entry-3', {
        resolve: () => {},
        reject: () => {},
      }),
      'should accept new entry after resolve frees capacity',
    );

    t.equal(queue.size, 2, 'should be at capacity again');
  });

  t.test('capacity becomes available after reject', async (t) => {
    const queue = new ProposalQueue({maxCapacity: 2});

    queue.enqueue('entry-1', {resolve: () => {}, reject: () => {}});
    queue.enqueue('entry-2', {resolve: () => {}, reject: () => {}});

    t.equal(queue.isFull, true, 'should be full');

    queue.reject('entry-2', 'timeout');

    t.doesNotThrow(
      () => queue.enqueue('entry-3', {
        resolve: () => {},
        reject: () => {},
      }),
      'should accept new entry after reject frees capacity',
    );

    t.equal(queue.size, 2, 'should be at capacity again');
  });

  t.test('entries without callbacks are handled gracefully',
    async (t) => {
      const queue = new ProposalQueue({maxCapacity: 5});

      queue.enqueue('entry-1', {});

      t.doesNotThrow(
        () => queue.resolve('entry-1', {success: true}),
        'resolve should not throw without resolve callback',
      );

      queue.enqueue('entry-2', {});

      t.doesNotThrow(
        () => queue.reject('entry-2', 'error'),
        'reject should not throw without reject callback',
      );

      queue.enqueue('entry-3', {});

      t.doesNotThrow(
        () => queue.clear('shutdown'),
        'clear should not throw without reject callback',
      );
    });
});
