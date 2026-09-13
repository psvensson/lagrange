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

const FORMATION_HEALTH_WORKFLOW_PATH = '.github/workflows/formation-health.yml';
const DEPENDENCY_POLICY_PATH = 'dependency-policy.json';
const PULUMI_PACKAGE_NAMES = ['@pulumi/pulumi', '@pulumi/gcp'];
const PINNED_PULUMI_INSTALL =
  'npm install --no-save --package-lock=false ' +
  '@pulumi/pulumi@3.261.0 @pulumi/gcp@9.36.1';

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

test('parseArguments reads report, gcp, summary, metric, trend and limit', (t) => {
  t.same(parseArguments([]), {
    report: null, gcp: false, summary: false, metric: false,
    trend: 'data/formation-health/trend.ndjson', limit: 20,
  });
  t.same(
    parseArguments(['--report', 'r.json', '--gcp', '--summary', '--metric',
      '--trend', 't.ndjson', '--limit', '5']),
    {report: 'r.json', gcp: true, summary: true, metric: true,
      trend: 't.ndjson', limit: 5},
  );
  t.equal(parseArguments(['--limit', 'nope']).limit, 20);
  t.end();
});

test('scheduled GCP health installs only its pinned optional boundary', (t) => {
  const workflow = fs.readFileSync(FORMATION_HEALTH_WORKFLOW_PATH, 'utf8');
  const dependencyPolicy = JSON.parse(
    fs.readFileSync(DEPENDENCY_POLICY_PATH, 'utf8'),
  );
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const declaredPackages = new Set([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
    ...Object.keys(packageJson.optionalDependencies || {}),
  ]);

  for (const packageName of PULUMI_PACKAGE_NAMES) {
    t.notOk(declaredPackages.has(packageName),
      `${packageName} stays outside the ordinary npm ci boundary`);
    t.equal(
      dependencyPolicy.optionalExternals[packageName]?.owner,
      'test/distributed/harness/gcp-provisioner.js',
      `${packageName} remains owned by the GCP provisioner boundary`,
    );
  }
  const ciIndex = workflow.indexOf('npm ci');
  const optionalInstallIndex = workflow.indexOf(PINNED_PULUMI_INSTALL);
  const healthRunIndex = workflow.indexOf(
    'npm run health:formation -- --gcp',
  );
  t.ok(ciIndex >= 0, 'the workflow starts from the ordinary clean install');
  t.ok(optionalInstallIndex > ciIndex,
    'the optional boundary is restored after npm ci removes ambient packages');
  t.ok(healthRunIndex > optionalInstallIndex,
    'the provisioner cannot run before its optional boundary is installed');

  // The Pulumi JS SDK drives the `pulumi` CLI binary, which npm ci cannot
  // provide: the scheduled runner must install it itself, pinned to the same
  // SDK version, with a bounded network install, before anything needs it.
  const cliInstallIndex = workflow.indexOf(
    'sh "$RUNNER_TEMP/install-pulumi.sh" --version 3.261.0',
  );
  t.ok(cliInstallIndex >= 0, 'the workflow installs the Pulumi CLI at 3.261.0');
  t.match(workflow, /--connect-timeout \d+/,
    'the CLI download is bounded by a connect timeout');
  t.match(workflow, /--max-time \d+/,
    'the CLI download is bounded by a total timeout');
  t.match(workflow, /timeout-minutes: 10/,
    'the CLI install step has a step timeout');
  t.match(workflow, /echo "\$HOME\/\.pulumi\/bin" >> "\$GITHUB_PATH"/,
    'the CLI lands on the step PATH');
  t.match(workflow, /test "\$\(pulumi version\)" = "v3\.261\.0"/,
    'the installed CLI is verified to be the pinned version');
  t.ok(cliInstallIndex > workflow.indexOf('node-version: "22"'),
    'the CLI installs after Node setup');
  t.ok(cliInstallIndex < healthRunIndex,
    'the CLI exists before the formation run needs it');
  for (const packageName of PULUMI_PACKAGE_NAMES) {
    t.match(workflow, `${packageName}@`);
    t.ok(workflow.includes(`${packageName}@3.261.0`) ||
        workflow.includes(`${packageName}@9.36.1`),
    `${packageName} stays pinned at its expected version`);
  }
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

// formation-health-verdicts: a non-verdict is a failed run, never a trend
// record, and --metric is the probe (unmeasured among the last three).
test('an UNKNOWN verdict fails the run and records nothing; --metric counts the window', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'formation-health-verdicts-'));
  const reportDir = path.join(root, 'test-output', 'reports');
  fs.mkdirSync(reportDir, {recursive: true});
  const trendPath = path.join(root, 'data/formation-health/trend.ndjson');
  const metric = () => runFormationHealth({
    root, metric: true, run: () => t.fail('metric never runs the demo'),
    log: () => {},
  });
  t.equal(metric().exitCode, 1, 'an empty trend is unmeasured');
  fs.writeFileSync(path.join(reportDir, 'unknown.report.json'),
    JSON.stringify(liveReport({
      passed: false, verdict: 'UNKNOWN', reason: 'seed_log_missing',
      seedStarved: null, blockedMs: null,
    })));
  const unknown = runFormationHealth({
    root, report: 'test-output/reports/unknown.report.json', run: () => {},
    log: () => {},
  });
  t.equal(unknown.exitCode, 1, 'UNKNOWN is a failed run');
  t.equal(readTrend(trendPath).length, 0, 'UNKNOWN is never appended');
  for (let index = 0; index < 3; index += 1) {
    fs.writeFileSync(path.join(reportDir, `measured-${index}.report.json`),
      JSON.stringify(liveReport({
        passed: index !== 1, verdict: index === 1 ? 'FAIL' : 'PASS',
        reason: index === 1 ? 'seed_event_loop_starved' : 'formed',
        seedStarved: index === 1, blockedMs: index === 1 ? 5000 : 0,
      })));
    runFormationHealth({
      root, report: `test-output/reports/measured-${index}.report.json`,
      run: () => {}, log: () => {},
    });
  }
  t.equal(readTrend(trendPath).length, 3, 'measuring runs, red or green, are records');
  t.equal(metric().exitCode, 0, 'three measuring records make the probe green');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});
