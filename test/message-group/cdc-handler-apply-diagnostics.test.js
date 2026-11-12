/**
 * The cache-apply diagnostics line carries the apply lag from the event's
 * origin HLC wall component, and an unreadable origin timestamp yields no lag
 * instead of failing the apply it describes.
 */

import {test} from '../../src/test-helpers/tap.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {
  CDC_EVENT_APPLIED_TO_CACHE,
  reportCdcEventAppliedToCache,
} from '../../src/message-group/cdc-handler-apply-diagnostics.js';

function captureConsoleOnly(t) {
  const logging = LoggingService.getInstance();
  const lines = [];
  const original = logging.logConsoleOnly;
  logging.logConsoleOnly = (level, message, context) => {
    lines.push({level, message, context});
  };
  t.teardown(() => {
    logging.logConsoleOnly = original;
  });
  return lines;
}

test('the line reports lag from the origin HLC wall component', async (t) => {
  const lines = captureConsoleOnly(t);
  const originMs = 1700000000000;

  reportCdcEventAppliedToCache({
    subsystem: 'cdc-handler',
    tableName: 'diag_lag_table',
    operation: 'UPDATE',
    timestamp: new HLCTimestamp(originMs, 3, 'node-a').toString(),
    receivedAt: originMs + 400,
    sourcePartition: 'p1',
    sourceLogIndex: 42,
    sourceOrdinal: 0,
    nowMs: originMs + 650,
  });

  t.equal(lines.length, 1, 'the first event of a table is written at once');
  t.equal(lines[0].message, CDC_EVENT_APPLIED_TO_CACHE);
  t.equal(lines[0].level, 'info');
  t.equal(lines[0].context.lagMs, 650);
  t.equal(lines[0].context.maxLagMs, 650);
  t.equal(lines[0].context.receivedToAppliedMs, 250);
  t.equal(lines[0].context.sourceLogIndex, 42);
  t.equal(lines[0].context.suppressed, 0);
});

test('an unreadable origin timestamp yields no lag and never throws',
  async (t) => {
    const lines = captureConsoleOnly(t);

    t.doesNotThrow(() => reportCdcEventAppliedToCache({
      subsystem: 'cdc-handler',
      tableName: 'diag_unreadable_table',
      operation: 'INSERT',
      timestamp: undefined,
      receivedAt: 10,
      nowMs: 20,
    }));

    t.equal(lines[0].context.lagMs, null);
    t.equal(lines[0].context.maxLagMs, null);
  });
