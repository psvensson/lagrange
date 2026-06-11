/**
 * Guard for the event-loop gap watchdog (closure ledger CL-008 next
 * falsification step): it must detect a synchronous loop blockage, attribute
 * tagged sync sections with an exclusive (non-double-counted) total, expose
 * the unexplained remainder, and stay silent while the loop is healthy.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  EventLoopGapWatchdog,
  GapSamplingProfiler,
  SyncSectionRegistry,
  trackSyncSection,
} from '../../src/diagnostics/event-loop-gap-watchdog.js';

function busyWaitMs(durationMs) {
  const start = Date.now();
  while (Date.now() - start < durationMs) {
    // synchronous block
  }
}

function profilerTargetBusyLoop(durationMs) {
  const start = Date.now();
  let accumulator = 0;
  while (Date.now() - start < durationMs) {
    accumulator += Math.sqrt(accumulator + 1);
  }
  return accumulator;
}

test('event loop gap watchdog', async (t) => {
  await t.test('registry accrues exclusive time across nested sections',
    async (t) => {
      const registry = new SyncSectionRegistry();
      const outerToken = registry.enter('outer');
      busyWaitMs(20);
      const innerToken = registry.enter('inner');
      busyWaitMs(20);
      registry.exit('inner', innerToken);
      busyWaitMs(5);
      registry.exit('outer', outerToken);

      const snapshot = registry.snapshot();
      t.ok(
        snapshot.sites.outer.totalMs >= 40,
        `outer inclusive total covers nested time (${snapshot.sites.outer.totalMs}ms)`,
      );
      t.ok(
        snapshot.sites.inner.totalMs >= 15,
        'inner section measured',
      );
      t.ok(
        snapshot.exclusiveTaggedMs >= 40 &&
          snapshot.exclusiveTaggedMs <=
            snapshot.sites.outer.totalMs + 5,
        `exclusive total is the union, not the sum (${snapshot.exclusiveTaggedMs}ms)`,
      );
      t.equal(snapshot.sites.outer.count, 1, 'outer counted once');
    });

  await t.test(
    'detects a blockage, attributes tagged work, reports remainder',
    async (t) => {
      const registry = new SyncSectionRegistry();
      const watchdog = new EventLoopGapWatchdog({
        thresholdMs: 50,
        intervalMs: 10,
        registry,
      });
      const reports = [];
      watchdog.logConsoleOnly = (level, message, context) => {
        if (message === 'Event loop gap detected') {
          reports.push({level, context});
        }
      };
      watchdog.start();
      await new Promise((resolve) => setTimeout(resolve, 30));

      // Tagged blockage (~60ms) plus untagged blockage (~40ms) in one
      // synchronous turn.
      const token = registry.enter('cdc_update_row_fetch');
      busyWaitMs(60);
      registry.exit('cdc_update_row_fetch', token);
      busyWaitMs(40);

      await new Promise((resolve) => setTimeout(resolve, 50));
      watchdog.stop();

      t.ok(reports.length >= 1, `gap reported (${reports.length})`);
      const report = reports[0].context;
      t.ok(report.gapMs >= 80, `gap magnitude captured (${report.gapMs}ms)`);
      const fetchDelta = report.siteDeltas.find(
        (delta) => delta.site === 'cdc_update_row_fetch',
      );
      t.ok(fetchDelta, 'tagged site appears in the report');
      t.ok(
        fetchDelta.totalMs >= 50,
        `tagged time attributed (${fetchDelta.totalMs}ms)`,
      );
      t.ok(
        report.unexplainedMs >= 25,
        `untagged remainder quantified (${report.unexplainedMs}ms)`,
      );
      t.ok(
        report.cumulative.gapCount >= 1,
        'cumulative gap stats carried',
      );
    },
  );

  await t.test('silent while healthy; thresholdMs=0 disables', async (t) => {
    const watchdog = new EventLoopGapWatchdog({
      thresholdMs: 500,
      intervalMs: 10,
    });
    const reports = [];
    watchdog.logConsoleOnly = (_level, message) => {
      if (message === 'Event loop gap detected') {
        reports.push(message);
      }
    };
    watchdog.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    watchdog.stop();
    t.equal(reports.length, 0, 'no reports on a healthy loop');

    const disabled = new EventLoopGapWatchdog({thresholdMs: 0});
    t.equal(disabled.start(), false, 'thresholdMs=0 never starts');
  });

  await t.test('sampling profiler names the blocking function', async (t) => {
    const profiler = new GapSamplingProfiler({
      windowMs: 10,
      samplingIntervalUs: 1000,
    });
    await profiler.start();
    profilerTargetBusyLoop(150);
    const windowReport = await profiler.rotateWindow();
    profiler.stop();

    t.ok(windowReport, 'window report produced');
    t.ok(
      windowReport.totalSamples > 0,
      `samples collected (${windowReport.totalSamples})`,
    );
    const target = windowReport.topFrames.find(
      (frame) => frame.fn === 'profilerTargetBusyLoop',
    );
    t.ok(
      target,
      'blocking function appears in top frames ' +
        `(got ${windowReport.topFrames.map((f) => f.fn).join(', ')})`,
    );
    t.ok(
      target && target.share > 0.3,
      `blocking function dominates the window (share=${target?.share})`,
    );
  });

  await t.test('trackSyncSection records into the shared registry and ' +
    'propagates return values and exceptions', async (t) => {
    const value = trackSyncSection('test_site', () => 42);
    t.equal(value, 42, 'return value propagated');
    let thrown = null;
    try {
      trackSyncSection('test_site', () => {
        throw new Error('boom');
      });
    } catch (error) {
      thrown = error;
    }
    t.equal(thrown?.message, 'boom', 'exception propagated');
  });
});
