/**
 * Host-scheduling run-validity wiring: watchdog gap totals harvested from node
 * logs must flow into the live report, and an over-budget run must read as
 * NON-MEASURING to the Solver probe (like a thermally invalid run), never as red.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {
  collectHostSchedulingEvidence,
  lastCumulativeGapRecord,
} from '../../examples/service-data-affinity/host-scheduling-evidence.js';
import {
  buildAffinityDemoLiveReport,
  LIVE_SCENARIO,
} from '../../examples/service-data-affinity/affinity-demo-live-report.js';
import {reportSampleIsNonMeasuring}
  from '../../scripts/solve/probes/scenario-harness.js';

const TIMESTAMP = '2026-07-20T09:00:00.000Z';

function gapLine(cumulative, time) {
  return JSON.stringify({
    level: 40,
    ...(time ? {time} : {}),
    subsystem: 'resource-diagnostics',
    gapMs: 1000,
    cumulative,
    msg: 'Event loop gap detected',
  });
}

function plainLogLine(time, msg) {
  return JSON.stringify({level: 30, time, msg});
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'host-sched-test-'));
}

test('lastCumulativeGapRecord returns the final record and skips plain text',
  (t) => {
    const text = [
      'Starting node...',
      gapLine({gapCount: 3, totalGapMs: 900, maxGapMs: 400}),
      'plain console line mentioning Event loop gap detected',
      gapLine({gapCount: 7, totalGapMs: 2100, maxGapMs: 800}),
      '{"truncated json',
    ].join('\n');
    t.same(
      lastCumulativeGapRecord(text),
      {gapCount: 7, totalGapMs: 2100, maxGapMs: 800},
      'the last well-formed cumulative record carries the run totals',
    );
    t.equal(lastCumulativeGapRecord('no gaps logged'), null);
    t.end();
  });

test('collectHostSchedulingEvidence flags any node over budget', async (t) => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'node-0.log'), gapLine(
    {gapCount: 2, totalGapMs: 3000, maxGapMs: 2000, blockedPercentOfWall: 1.2}));
  fs.writeFileSync(path.join(dir, 'node-1.log'), gapLine(
    {gapCount: 46, totalGapMs: 207534, maxGapMs: 20214, blockedPercentOfWall: 41.5}));
  const evidence = await collectHostSchedulingEvidence(dir, 3);
  t.equal(evidence.exceeded, true, 'one frozen node invalidates the run');
  t.equal(evidence.perNode.length, 3);
  t.equal(evidence.perNode[2].nodeId, 'node-2');
  t.ok(evidence.perNode[2].readError,
    'a missing log degrades to a readError entry instead of failing the harvest');
  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

test('collectHostSchedulingEvidence stays quiet under budget', async (t) => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'node-0.log'), gapLine(
    {gapCount: 4, totalGapMs: 5000, maxGapMs: 1500, blockedPercentOfWall: 2.0}));
  const evidence = await collectHostSchedulingEvidence(dir, 1);
  t.equal(evidence.exceeded, false);
  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

// The watchdog's own blockedPercentOfWall is sampled at the time of each gap, so
// a lone startup stall reads ~90% blocked. The harvester must judge the percent
// over the node's FULL logged lifespan instead: a clean run after one early gap
// stays measuring, while sustained blocking across the run still invalidates.
test('percent budget uses the full log span, not time-of-last-gap', async (t) => {
  t.test('a lone startup gap in a long clean run stays measuring', async (t) => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'node-0.log'), [
      plainLogLine('2026-07-20T09:00:00.000Z', 'node starting'),
      gapLine({gapCount: 1, totalGapMs: 1857, maxGapMs: 1857,
        blockedPercentOfWall: 88.13}, '2026-07-20T09:00:02.100Z'),
      plainLogLine('2026-07-20T09:05:00.000Z', 'run complete'),
    ].join('\n'));
    const evidence = await collectHostSchedulingEvidence(dir, 1);
    t.equal(evidence.perNode[0].blockedPercentOfLogSpan !== null, true);
    t.ok(evidence.perNode[0].blockedPercentOfLogSpan < 1,
      '1.9s of gap over a 5-minute span is under 1 percent');
    t.equal(evidence.exceeded, false,
      'the sampled-at-gap 88% figure does not invalidate the run');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('sustained blocking across the span still invalidates', async (t) => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'node-0.log'), [
      plainLogLine('2026-07-20T09:00:00.000Z', 'node starting'),
      gapLine({gapCount: 8, totalGapMs: 15000, maxGapMs: 4000},
        '2026-07-20T09:00:55.000Z'),
      plainLogLine('2026-07-20T09:01:00.000Z', 'run complete'),
    ].join('\n'));
    const evidence = await collectHostSchedulingEvidence(dir, 1);
    t.equal(evidence.exceeded, true,
      '15s blocked over a 60s span exceeds the 20 percent budget');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.end();
});

test('over-budget host scheduling marks the live report non-measuring', (t) => {
  const hostScheduling = {
    perNode: [{nodeId: 'node-0', gapCount: 46, totalGapMs: 207534,
      maxGapMs: 20214, blockedPercentOfLogSpan: 41.5}],
    exceeded: true,
    budget: {maxSingleGapMs: 10000, maxTotalGapMs: 60000, maxBlockedPercent: 20},
  };
  const report = buildAffinityDemoLiveReport({
    timestamp: TIMESTAMP,
    error: new Error('schema admission denied'),
    phaseEvidence: {hostScheduling},
  });
  const entry = report.standardSummary.scenarios[0];
  t.equal(entry.current.verdictReason, 'host_scheduling_gap_budget_exceeded');
  t.same(entry.detail.hostScheduling, hostScheduling,
    'the harvested evidence is preserved for attribution');

  const dir = tmpDir();
  const file = path.join(dir, 'run.report.json');
  fs.writeFileSync(file, JSON.stringify(report));
  t.equal(reportSampleIsNonMeasuring(file, {scenario: LIVE_SCENARIO}), true,
    'the Solver probe invalidates the sample instead of scoring it red');
  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

test('an in-budget run keeps its measuring verdict', (t) => {
  const report = buildAffinityDemoLiveReport({
    timestamp: TIMESTAMP,
    error: new Error('learned-affinity stalled'),
    phaseEvidence: {hostScheduling: {perNode: [], exceeded: false, budget: {}}},
  });
  const entry = report.standardSummary.scenarios[0];
  t.equal(entry.current.verdictReason, undefined);

  const dir = tmpDir();
  const file = path.join(dir, 'run.report.json');
  fs.writeFileSync(file, JSON.stringify(report));
  t.equal(reportSampleIsNonMeasuring(file, {scenario: LIVE_SCENARIO}), false);
  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

// The budgets consume only the UNEXPLAINED (host-noise) share when the
// watchdog reports the tagged/unexplained split: app-owned stall time is
// system-under-test behavior and must stay measurable as red.
test('app-owned gap time does not invalidate; unexplained time does', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'host-sched-split-'));
  fs.writeFileSync(path.join(dir, 'node-0.log'), gapLine({
    gapCount: 40, totalGapMs: 150000, maxGapMs: 12000,
    totalUnexplainedMs: 8000, maxUnexplainedGapMs: 900,
  }));
  const appOwned = await collectHostSchedulingEvidence(dir, 1);
  t.equal(appOwned.exceeded, false,
    '150s of tagged app-owned stalls stays measuring (a perf bug is red, not invalid)');
  t.equal(appOwned.perNode[0].unexplainedTotalMs, 8000);

  fs.writeFileSync(path.join(dir, 'node-0.log'), gapLine({
    gapCount: 40, totalGapMs: 150000, maxGapMs: 12000,
    totalUnexplainedMs: 140000, maxUnexplainedGapMs: 11000,
  }));
  const hostNoise = await collectHostSchedulingEvidence(dir, 1);
  t.equal(hostNoise.exceeded, true,
    'the same totals dominated by unexplained host noise invalidate the run');
  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

// Mirror of the runner's thermal rule ('a green run counts even when the
// machine ends hot'): a PASSED demo is never invalidated by the gap budget —
// converging despite adverse scheduling is stronger evidence, not weaker.
test('a passed run over the gap budget stays measuring', (t) => {
  const report = buildAffinityDemoLiveReport({
    timestamp: TIMESTAMP,
    result: {converged: true},
    phaseEvidence: {hostScheduling: {
      perNode: [{nodeId: 'node-0', gapCount: 73, totalGapMs: 138665,
        maxGapMs: 13167, unexplainedTotalMs: 116955,
        unexplainedMaxGapMs: 13167, blockedPercentOfLogSpan: 24.9}],
      exceeded: true,
      budget: {maxSingleGapMs: 10000, maxTotalGapMs: 60000,
        maxBlockedPercent: 20},
    }},
  });
  const entry = report.standardSummary.scenarios[0];
  t.equal(entry.passed, true);
  t.equal(entry.current.verdictReason, undefined,
    'no non-measuring stamp on a pass');
  t.ok(entry.detail.hostScheduling.exceeded,
    'the harvested evidence stays recorded for attribution');

  const dir = tmpDir();
  const file = path.join(dir, 'run.report.json');
  fs.writeFileSync(file, JSON.stringify(report));
  t.equal(reportSampleIsNonMeasuring(file, {scenario: LIVE_SCENARIO}), false,
    'the Solver probe counts the pass');
  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});
