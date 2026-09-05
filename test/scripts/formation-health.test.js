/**
 * Formation health trend: one compact record per run, appended durably,
 * summarized with a pass rate; a run without a report records nothing.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {
  buildTrendRecord,
  parseArguments,
  readTrend,
  renderTrendSummary,
  runFormationHealth,
} from '../../scripts/checks/formation-health.js';

function liveReport({passed, verdict, reason, seedStarved, blockedMs}) {
  return {
    timestamp: '2026-09-05T19:10:11.628Z',
    scenario: 'movielens-lagrange-formation-only-live',
    formationVerdict: {
      verdict, reason, seedStarved,
      seedGaps: {unexplainedMs: blockedMs, maxGapMs: 5365},
      window: {windowMs: 135150},
      leaseWaits: {count: 521},
      criticalSpread: {finalSpreadGap: 6},
      admission: {state: passed ? 'admitted' : 'denied'},
    },
    standardSummary: {scenarios: [{passed}]},
  };
}

test('buildTrendRecord reduces a report to the trend fields', (t) => {
  const record = buildTrendRecord(
    liveReport({
      passed: false, verdict: 'FAIL', reason: 'seed_event_loop_starved',
      seedStarved: true, blockedMs: 49840,
    }),
    {head: 'abc1234', reportPath: 'test-output/reports/x.report.json'},
  );
  t.same(record, {
    schemaVersion: 1,
    at: '2026-09-05T19:10:11.628Z',
    head: 'abc1234',
    scenario: 'movielens-lagrange-formation-only-live',
    passed: false,
    verdict: 'FAIL',
    reason: 'seed_event_loop_starved',
    seedStarved: true,
    seedBlockedMs: 49840,
    seedMaxGapMs: 5365,
    windowMs: 135150,
    leaseWaits: 521,
    spreadGap: 6,
    admissionState: 'denied',
    reportPath: 'test-output/reports/x.report.json',
  });
  const bare = buildTrendRecord({}, {head: 'h'});
  t.equal(bare.verdict, null);
  t.equal(bare.passed, false);
  t.end();
});

test('parseArguments reads report, gcp, summary, trend and limit', (t) => {
  t.same(parseArguments([]), {
    report: null, gcp: false, summary: false,
    trend: 'data/formation-health/trend.ndjson', limit: 20,
  });
  t.same(
    parseArguments(['--report', 'r.json', '--gcp', '--summary', '--trend',
      't.ndjson', '--limit', '5']),
    {report: 'r.json', gcp: true, summary: true, trend: 't.ndjson', limit: 5},
  );
  t.equal(parseArguments(['--limit', 'nope']).limit, 20);
  t.end();
});

test('runFormationHealth appends one record per run and summarizes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'formation-health-'));
  const reportDir = path.join(root, 'test-output/reports');
  fs.mkdirSync(reportDir, {recursive: true});
  const calls = [];
  const lines = [];
  const run = (command, args) => {
    calls.push(args.join(' '));
    if (args[0].endsWith('run-affinity-demo.js')) {
      fs.writeFileSync(
        path.join(reportDir,
          'movielens-lagrange-formation-only-live-2026-09-05T20-00-00-000Z' +
          '.report.json'),
        JSON.stringify(liveReport({
          passed: true, verdict: 'PASS', reason: 'schema_admitted',
          seedStarved: false, blockedMs: 1200,
        })),
      );
    }
    return {status: 0};
  };
  const first = runFormationHealth({
    root, gcp: true, run, log: (line) => lines.push(line),
  });
  t.same(calls, [
    'scripts/checks/wait-for-thermal-headroom.js',
    'examples/service-data-affinity/run-affinity-demo.js --formation-only ' +
      '--gcp',
  ]);
  t.equal(first.exitCode, 0);
  t.equal(first.record.verdict, 'PASS');
  const trendPath = path.join(root, 'data/formation-health/trend.ndjson');
  t.equal(readTrend(trendPath).length, 1);
  fs.writeFileSync(
    path.join(reportDir, 'failed.report.json'),
    JSON.stringify(liveReport({
      passed: false, verdict: 'FAIL', reason: 'seed_event_loop_starved',
      seedStarved: true, blockedMs: 49840,
    })),
  );
  const second = runFormationHealth({
    root, report: 'test-output/reports/failed.report.json', run,
    log: () => {},
  });
  t.equal(second.exitCode, 1, 'a failed formation is a red run');
  const records = readTrend(trendPath);
  t.equal(records.length, 2);
  t.equal(records[1].reason, 'seed_event_loop_starved');
  const summaryLines = [];
  const summary = runFormationHealth({
    root, summary: true, run: () => t.fail('summary never runs the demo'),
    log: (line) => summaryLines.push(line),
  });
  t.equal(summary.exitCode, 0);
  t.match(summaryLines.join('\n'),
    /formation health: 1\/2 passed \(50%\), 1 with a starved seed/);
  const rendered = renderTrendSummary(records, 1);
  t.match(rendered, /0\/1 passed \(0%\)/, 'the limit bounds the window');
  fs.appendFileSync(trendPath, '{"torn');
  t.equal(readTrend(trendPath).length, 2, 'a torn tail line is skipped');
  // Fail closed: a refused thermal gate or a run without a NEW report
  // records nothing, even with an older report on disk.
  const beforeCount = readTrend(trendPath).length;
  const refusedLines = [];
  const refused = runFormationHealth({
    root, run: () => ({status: 1}), log: (line) => refusedLines.push(line),
  });
  t.equal(refused.exitCode, 1);
  t.equal(refused.record, null);
  t.match(refusedLines.join('\n'), /thermal gate refused/);
  const noNew = runFormationHealth({
    root, run: (command, args) =>
      ({status: args[0].endsWith('run-affinity-demo.js') ? 1 : 0}),
    log: () => {},
  });
  t.equal(noNew.exitCode, 1);
  t.equal(noNew.record, null);
  t.equal(readTrend(trendPath).length, beforeCount,
    'no record for a run that produced no report');
  const none = runFormationHealth({
    root: fs.mkdtempSync(path.join(os.tmpdir(), 'formation-health-empty-')),
    run: () => ({status: 0}), log: () => {},
  });
  t.equal(none.exitCode, 1);
  t.equal(none.record, null);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});
