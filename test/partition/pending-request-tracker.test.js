/**
 * Unit tests for PendingRequestTracker bounded capacity and telemetry.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PendingRequestTracker} from '../../src/partition/pending-request-tracker.js';
import {
  PENDING_REQUEST_DEFAULT,
  PENDING_REQUEST_ERROR_MSG,
} from '../../src/partition/partition-constants.js';

test('PendingRequestTracker', async (t) => {
  t.beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});
  });

  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  t.test('getStats exposes capacity defaults and empty counters', async (t) => {
    const tracker = new PendingRequestTracker();
    try {
      const stats = tracker.getStats();
      t.equal(
        stats.maxPendingRequests,
        PENDING_REQUEST_DEFAULT.MAX_PENDING_REQUESTS,
        'uses default max pending capacity',
      );
      t.equal(stats.pendingCount, 0, 'starts with zero pending');
      t.equal(stats.trackedTotal, 0, 'starts with zero tracked');
      t.equal(stats.backpressureRejectTotal, 0, 'starts with zero backpressure');
    } finally {
      tracker.clear();
    }
  });

  t.test('applies backpressure at max capacity and records telemetry', async (t) => {
    const tracker = new PendingRequestTracker({
      maxPendingRequests: 1,
      defaultTimeoutMs: 5000,
    });
    const firstPromise = tracker.track('req-1', {type: 'CREATE_REPLICA'});
    t.equal(tracker.getPendingCount(), 1, 'first request is tracked');

    t.throws(
      () => tracker.track('req-2', {type: 'CREATE_REPLICA'}),
      {message: PENDING_REQUEST_ERROR_MSG.backpressure(1)},
      'second request should be rejected by backpressure',
    );

    const saturatedStats = tracker.getStats();
    t.equal(
      saturatedStats.backpressureRejectTotal,
      1,
      'backpressure rejection count increments',
    );
    t.equal(saturatedStats.pendingCount, 1, 'pending request count remains bounded');
    t.equal(saturatedStats.maxPendingObserved, 1, 'max pending watermark tracked');

    tracker.resolve('req-1', {request_id: 'req-1', status: 'success'});
    await firstPromise;
    const settledStats = tracker.getStats();
    t.equal(settledStats.pendingCount, 0, 'pending request cleared after resolve');
    t.equal(settledStats.resolvedTotal, 1, 'resolved count increments');
    tracker.clear();
  });

  t.test('timeout rejection updates timeout and rejection counters', async (t) => {
    const tracker = new PendingRequestTracker({
      defaultTimeoutMs: 15,
      maxPendingRequests: 4,
    });
    try {
      let timeoutError = null;
      try {
        await tracker.track('req-timeout', {
          type: 'REMOVE_REPLICA',
          timeoutMs: 15,
        });
      } catch (error) {
        timeoutError = error;
      }

      t.ok(timeoutError, 'track promise should reject on timeout');
      t.ok(
        timeoutError.message.includes('ACK timeout'),
        'timeout error should describe ACK timeout',
      );

      const stats = tracker.getStats();
      t.equal(stats.pendingCount, 0, 'timed out request is removed');
      t.equal(stats.timedOutTotal, 1, 'timeout counter increments');
      t.equal(stats.rejectedTotal, 1, 'rejection counter increments');
      t.equal(stats.trackedTotal, 1, 'tracked counter increments');
    } finally {
      tracker.clear();
    }
  });
});
