/**
 * Property Test: Reconnection Backoff
 * Property 12: For any sequence of connection failures, the reconnection delays
 * should follow exponential backoff pattern (delay doubles each attempt, capped at maximum).
 *
 * **Validates: Requirements 1.5**
 */
// @ts-nocheck


import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {ConnectionManager} from '../../../src/cli/core/connection-manager.js';

test('Property 12: Reconnection Backoff', async (t) => {
  await t.test('delay doubles with each attempt', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 100, max: 5000}), // baseDelay
        fc.integer({min: 10000, max: 60000}), // maxDelay
        fc.integer({min: 0, max: 5}), // attempt number
        (baseDelay, maxDelay, attempt) => {
          const manager = new ConnectionManager({baseDelay, maxDelay});

          const delay = manager.calculateBackoffDelay(attempt);
          const expectedDelay = Math.min(
            baseDelay * Math.pow(2, attempt),
            maxDelay,
          );

          return delay === expectedDelay;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Delay doubles with each attempt');
  });

  await t.test('delay is capped at maxDelay', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 100, max: 2000}), // baseDelay
        fc.integer({min: 5000, max: 30000}), // maxDelay
        fc.integer({min: 0, max: 20}), // attempt number (high to ensure cap)
        (baseDelay, maxDelay, attempt) => {
          const manager = new ConnectionManager({baseDelay, maxDelay});

          const delay = manager.calculateBackoffDelay(attempt);

          // Delay should never exceed maxDelay
          return delay <= maxDelay;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Delay is capped at maxDelay');
  });

  await t.test('delay is at least baseDelay for first attempt', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 100, max: 10000}), // baseDelay
        fc.integer({min: 10000, max: 60000}), // maxDelay
        (baseDelay, maxDelay) => {
          const manager = new ConnectionManager({baseDelay, maxDelay});

          const delay = manager.calculateBackoffDelay(0);

          return delay === baseDelay;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Delay is at least baseDelay for first attempt');
  });

  await t.test('consecutive delays are monotonically increasing until cap', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 100, max: 2000}), // baseDelay
        fc.integer({min: 10000, max: 60000}), // maxDelay
        fc.integer({min: 1, max: 10}), // number of attempts to check
        (baseDelay, maxDelay, numAttempts) => {
          const manager = new ConnectionManager({baseDelay, maxDelay});

          let prevDelay = 0;
          for (let i = 0; i < numAttempts; i++) {
            const delay = manager.calculateBackoffDelay(i);

            // Each delay should be >= previous delay
            if (delay < prevDelay) {
              return false;
            }

            prevDelay = delay;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Consecutive delays are monotonically increasing until cap');
  });

  await t.test('delay is always positive', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 10000}), // baseDelay
        fc.integer({min: 1, max: 60000}), // maxDelay
        fc.integer({min: 0, max: 100}), // attempt number
        (baseDelay, maxDelay, attempt) => {
          const manager = new ConnectionManager({baseDelay, maxDelay});

          const delay = manager.calculateBackoffDelay(attempt);

          return delay > 0;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Delay is always positive');
  });

  await t.test('scheduleReconnect increments attempt counter', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 0, max: 5}), // initial attempts
        fc.integer({min: 10, max: 20}), // maxReconnectAttempts
        (initialAttempts, maxReconnectAttempts) => {
          const manager = new ConnectionManager({maxReconnectAttempts});
          manager.reconnectAttempts = initialAttempts;
          manager.currentAddress = 'localhost:8080';

          // Capture status changes
          const statusChanges = [];
          manager.onStatusChange = (status) => statusChanges.push(status);

          manager.scheduleReconnect();

          // Clean up timer
          manager.cancelReconnect();

          // Attempt counter should have incremented
          return manager.reconnectAttempts === initialAttempts + 1;
        },
      ),
      {numRuns: 10},
    );
    t.pass('scheduleReconnect increments attempt counter');
  });

  await t.test('scheduleReconnect sets status to failed after max attempts', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 10}), // maxReconnectAttempts
        (maxReconnectAttempts) => {
          const manager = new ConnectionManager({maxReconnectAttempts});
          manager.reconnectAttempts = maxReconnectAttempts;

          const statusChanges = [];
          manager.onStatusChange = (status) => statusChanges.push(status);

          manager.scheduleReconnect();

          return manager.getStatus() === 'failed' &&
                     statusChanges.includes('failed');
        },
      ),
      {numRuns: 10},
    );
    t.pass('scheduleReconnect sets status to failed after max attempts');
  });

  await t.test('scheduleReconnect sets status to reconnecting', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 0, max: 5}), // initial attempts
        fc.integer({min: 10, max: 20}), // maxReconnectAttempts
        (initialAttempts, maxReconnectAttempts) => {
          const manager = new ConnectionManager({maxReconnectAttempts});
          manager.reconnectAttempts = initialAttempts;
          manager.currentAddress = 'localhost:8080';

          const statusChanges = [];
          manager.onStatusChange = (status) => statusChanges.push(status);

          manager.scheduleReconnect();

          // Clean up timer
          manager.cancelReconnect();

          return manager.getStatus() === 'reconnecting' &&
                     statusChanges.includes('reconnecting');
        },
      ),
      {numRuns: 10},
    );
    t.pass('scheduleReconnect sets status to reconnecting');
  });

  await t.test('resetReconnectAttempts resets counter to zero', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 100}), // initial attempts
        (initialAttempts) => {
          const manager = new ConnectionManager();
          manager.reconnectAttempts = initialAttempts;

          manager.resetReconnectAttempts();

          return manager.getReconnectAttempts() === 0;
        },
      ),
      {numRuns: 10},
    );
    t.pass('resetReconnectAttempts resets counter to zero');
  });
});
