/**
 * Formation health trend: one compact record per run, appended durably,
 * summarized with a pass rate; a run without a report records nothing.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {
  DATA_BRANCH,
  buildTrendRecord,
  parseArguments,
  readDataBranchTrend,
  readTrend,
  renderTrendSummary,
  runFormationHealth,
} from '../../scripts/checks/formation-health.js';
import {
  FORMATION_OWNER,
} from '../../src/diagnostics/formation-diagnostics-contract.js';
import {execGit} from '../../scripts/checks/git-invocation.js';

const DATA_BRANCH_LOCAL_REF = 'refs/remotes/origin/data/formation-health';
const SCRATCH_TREND = 'scratch/formation-trend.ndjson';
const FORMATION_HEALTH_WORKFLOW_PATH = '.github/workflows/formation-health.yml';
const DEPENDENCY_POLICY_PATH = 'dependency-policy.json';
const PULUMI_PACKAGE_NAMES = ['@pulumi/pulumi', '@pulumi/gcp'];
const PINNED_PULUMI_INSTALL =
  'npm install --no-save @pulumi/pulumi@3.261.0 @pulumi/gcp@9.36.1';

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
    run: null,
  });
  const bare = buildTrendRecord({}, {head: 'h'});
  t.equal(bare.verdict, null);
  t.equal(bare.passed, false);
  t.end();
});

test('parseArguments reads report, gcp, summary, metric, fetch, trend and limit', (t) => {
  t.same(parseArguments([]), {
    report: null, gcp: false, summary: false, metric: false,
    calibration: null, fetch: false,
    trend: null, limit: 20,
  });
  t.same(
    parseArguments(['--report', 'r.json', '--gcp', '--summary', '--metric',
      '--fetch', '--trend', 't.ndjson', '--limit', '5']),
    {report: 'r.json', gcp: true, summary: true, metric: true,
      calibration: null, fetch: true, trend: 't.ndjson', limit: 5},
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
  // --package-lock=false re-resolved the whole tree from the semver ranges:
  // the driver ran on 262 locked packages at other versions, and the push
  // gate's import-graph refresh rewrote the committed seal (2026-09-18).
  t.notMatch(workflow, /--package-lock=false/u,
    'the optional install leaves every locked package where the lockfile put it');

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
    root, gcp: true, trend: SCRATCH_TREND, run, log: (line) => lines.push(line),
  });
  t.same(calls, [
    'scripts/checks/wait-for-thermal-headroom.js',
    'examples/service-data-affinity/run-affinity-demo.js --formation-only ' +
      '--gcp',
  ]);
  t.equal(first.exitCode, 0);
  t.equal(first.record.verdict, 'PASS');
  const trendPath = path.join(root, SCRATCH_TREND);
  t.equal(readTrend(trendPath).length, 1);
  fs.writeFileSync(
    path.join(reportDir, 'failed.report.json'),
    JSON.stringify(liveReport({
      passed: false, verdict: 'FAIL', reason: 'seed_event_loop_starved',
      seedStarved: true, blockedMs: 49840,
    })),
  );
  const second = runFormationHealth({
    root, report: 'test-output/reports/failed.report.json', trend: SCRATCH_TREND, run,
    log: () => {},
  });
  t.equal(second.exitCode, 1, 'a failed formation is a red run');
  const records = readTrend(trendPath);
  t.equal(records.length, 2);
  t.equal(records[1].reason, 'seed_event_loop_starved');
  const summaryLines = [];
  const summary = runFormationHealth({
    root, summary: true, trend: SCRATCH_TREND, run: () => t.fail('summary never runs the demo'),
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
    root, trend: SCRATCH_TREND, run: () => ({status: 1}), log: (line) => refusedLines.push(line),
  });
  t.equal(refused.exitCode, 1);
  t.equal(refused.record, null);
  t.match(refusedLines.join('\n'), /thermal gate refused/);
  const noNew = runFormationHealth({
    root, trend: SCRATCH_TREND, run: (command, args) =>
      ({status: args[0].endsWith('run-affinity-demo.js') ? 1 : 0}),
    log: () => {},
  });
  t.equal(noNew.exitCode, 1);
  t.equal(noNew.record, null);
  t.equal(readTrend(trendPath).length, beforeCount,
    'no record for a run that produced no report');
  const none = runFormationHealth({
    root: fs.mkdtempSync(path.join(os.tmpdir(), 'formation-health-empty-')),
    trend: SCRATCH_TREND, run: () => ({status: 0}), log: () => {},
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
  const trendPath = path.join(root, SCRATCH_TREND);
  const metric = () => runFormationHealth({
    root, metric: true, trend: SCRATCH_TREND, run: () => t.fail('metric never runs the demo'),
    log: () => {},
  });
  t.equal(metric().exitCode, 1, 'an empty trend is unmeasured');
  fs.writeFileSync(path.join(reportDir, 'unknown.report.json'),
    JSON.stringify(liveReport({
      passed: false, verdict: 'UNKNOWN', reason: 'seed_log_missing',
      seedStarved: null, blockedMs: null,
    })));
  const unknown = runFormationHealth({
    root, report: 'test-output/reports/unknown.report.json', trend: SCRATCH_TREND, run: () => {},
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
      trend: SCRATCH_TREND, run: () => {}, log: () => {},
    });
  }
  t.equal(readTrend(trendPath).length, 3, 'measuring runs, red or green, are records');
  t.equal(metric().exitCode, 0, 'three measuring records make the probe green');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

// formation-calibration-run probe: owners the calibration table does not
// carry as a row; prose mentions never count.
test('--calibration counts formation-path owners missing from the table', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'formation-calibration-'));
  const table = path.join(root, 'table.md');
  const metric = () => runFormationHealth({
    root, calibration: 'table.md', run: () => t.fail('never runs the demo'), log: () => {},
  }).exitCode;
  t.equal(metric(), 1, 'no table: every owner uncovered');
  fs.writeFileSync(table, 'The bootstrap, raft_apply, raft_protocol and readiness owners.\n');
  t.equal(metric(), 1, 'prose mentions are not rows');
  const owners = Object.values(FORMATION_OWNER)
    .filter((owner) => owner !== FORMATION_OWNER.UNATTRIBUTED);
  const rows = owners.map((owner, index) => `| ${owner} | ${index + 1} |`);
  fs.writeFileSync(table, `| owner | ms |\n| --- | --- |\n${rows.slice(1).join('\n')}\n`);
  t.equal(metric(), 1, 'one owner short is one uncovered owner');
  fs.writeFileSync(table, `| owner | ms |\n| --- | --- |\n${rows.join('\n')}\n`);
  t.equal(metric(), 0, 'one row per owner covers the contract');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

// A record names the workflow run that measured it, so a late record can never
// pass for a new run; a local run names none.
test('a trend record carries the workflow run that measured it', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'formation-run-'));
  const reportPath = path.join(root, 'test-output/reports/r.report.json');
  fs.mkdirSync(path.dirname(reportPath), {recursive: true});
  fs.writeFileSync(reportPath, JSON.stringify(liveReport({
    passed: true, verdict: 'PASS', reason: 'schema_admitted', seedStarved: false, blockedMs: 1,
  })));
  const record = (env) => runFormationHealth({
    root, report: 'test-output/reports/r.report.json', trend: SCRATCH_TREND, env, log: () => {},
    run: () => t.fail('never runs the demo'),
  }).record;
  t.same(record({GITHUB_RUN_ID: '35303538995', GITHUB_RUN_ATTEMPT: '1'}).run,
    {id: '35303538995', attempt: '1'});
  t.equal(record({}).run, null);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

const measured = (verdict, at = '2026-09-15T03:59:00.000Z') =>
  `${JSON.stringify({schemaVersion: 1, at, head: '3b1fd7877', verdict})}\n`;

test('only PASS and FAIL count as measuring for --metric', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'formation-metric-'));
  const trend = path.join(root, SCRATCH_TREND);
  fs.mkdirSync(path.dirname(trend), {recursive: true});
  const metric = () => {
    const lines = [];
    runFormationHealth({root, metric: true, trend: SCRATCH_TREND, log: (line) => lines.push(line)});
    return Number(lines[lines.length - 1]);
  };
  fs.writeFileSync(trend, measured('PASS') + measured('FAIL') + measured('PASS'));
  t.equal(metric(), 0);
  fs.writeFileSync(trend, measured('PASS') + measured('') + measured('banana'));
  t.equal(metric(), 2, 'an empty or invented verdict is not a measurement');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

// The record's home is the branch data/formation-health. Probes read the LOCAL
// remote-tracking ref and never fetch; an absent ref is `unavailable`, never an
// empty (and so never a measuring or non-measuring) trend.
test('the data-branch reader never fetches and reports an absent ref as unavailable', (t) => {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'formation-data-branch-'));
  t.teardown(() => fs.rmSync(top, {recursive: true, force: true}));
  const git = (cwd, ...args) => execGit(['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
    {cwd, encoding: 'utf8'}).trim();
  const origin = path.join(top, 'origin');
  const clone = path.join(top, 'clone');
  fs.mkdirSync(origin);
  git(origin, 'init', '-q', '-b', 'main');
  git(origin, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(origin, 'trend.ndjson'), [
    {schemaVersion: 1, at: '2026-09-15T03:59:00.000Z', head: 'h', verdict: 'PASS', passed: true},
    {schemaVersion: 1, at: '2026-09-16T03:59:00.000Z', head: 'h', verdict: 'FAIL', passed: false},
    {schemaVersion: 1, at: '2026-09-17T03:59:00.000Z', head: 'h', verdict: 'PASS', passed: true},
  ].map((record) => `${JSON.stringify(record)}\n`).join(''));
  git(origin, 'add', 'trend.ndjson');
  git(origin, 'commit', '-q', '-m', 'record');
  git(origin, 'branch', DATA_BRANCH);
  git(origin, 'checkout', '-q', '--detach');
  fs.mkdirSync(clone);
  git(clone, 'init', '-q', '-b', 'main');
  git(clone, 'remote', 'add', 'origin', origin);
  const lines = [];
  const read = (options) => {
    lines.length = 0;
    const result = runFormationHealth({root: clone, log: (line) => lines.push(line),
      run: () => t.fail('never runs the demo'), ...options});
    return {exitCode: result.exitCode, out: lines.join('\n')};
  };
  t.same(readDataBranchTrend(clone), {state: 'unavailable',
    reason: 'refs/remotes/origin/data/formation-health is absent (run with --fetch)'},
  'no tracking ref yet: the ref is absent');
  const notRepo = path.join(top, 'plain');
  fs.mkdirSync(notRepo);
  t.match(readDataBranchTrend(notRepo).reason, /^git could not read the repository: exit 128$/u,
    'a directory git cannot read is its own reason');
  const savedPath = process.env.PATH;
  process.env.PATH = path.join(top, 'no-git-here');
  const noGit = readDataBranchTrend(clone);
  process.env.PATH = savedPath;
  t.match(noGit.reason, /^git could not read the repository: .*ENOENT/u, 'git that cannot run');
  git(clone, 'update-ref', DATA_BRANCH_LOCAL_REF, git(clone, 'commit-tree', git(clone, 'mktree'), '-m', 'empty'));
  t.same(readDataBranchTrend(clone), {state: 'unavailable',
    reason: 'refs/remotes/origin/data/formation-health holds no trend.ndjson'},
  'the ref exists but has no trend.ndjson');
  git(clone, 'update-ref', '-d', DATA_BRANCH_LOCAL_REF);
  const metric = read({metric: true});
  t.equal(metric.exitCode, 1, 'unavailable is not measuring');
  t.match(metric.out, /^unavailable\n/u, 'the probe prints the state, not a number');
  t.equal(read({summary: true}).exitCode, 1);
  t.match(read({summary: true}).out, /trend unavailable/u);
  t.same(readDataBranchTrend(clone).state, 'unavailable',
    'reading never fetched the branch although origin has it');
  const fetched = read({metric: true, fetch: true});
  t.equal(fetched.exitCode, 0, `fetch is the explicit operator step: ${fetched.out}`);
  t.match(fetched.out, /^formation health: read data\/formation-health @ [0-9a-f]{40}\n0$/u);
  t.equal(readDataBranchTrend(clone).lines.length, 3);
  t.match(readDataBranchTrend(clone).commit, /^[0-9a-f]{40}$/u, 'the reader names the commit it read');
  t.match(read({summary: true}).out, /2\/3 passed/u, 'later reads use the local ref');
  git(clone, 'remote', 'set-url', 'origin', path.join(top, 'gone'));
  t.equal(read({metric: true, fetch: true}).exitCode, 1, 'a failed fetch is unavailable');
  t.match(read({metric: true, fetch: true}).out, /the fetch of data\/formation-health failed/u);
  t.equal(read({metric: true, trend: 'missing.ndjson'}).exitCode, 1,
    'an explicit --trend file is read as a file, not from the branch');
  t.end();
});

test('recording needs an explicit --trend file and runs nothing without it', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'formation-no-trend-'));
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const lines = [];
  const result = runFormationHealth({root, run: () => t.fail('the demo must not start'),
    log: (line) => lines.push(line)});
  t.equal(result.exitCode, 1);
  t.match(lines.join('\n'), /recording needs --trend <file>/u);
  t.notOk(fs.existsSync(path.join(root, 'data')), 'no file appears in the tree');
  t.end();
});

// The workflow pushes the record to the data branch only, never to main, and
// never creates that branch (the owner seeds it once).
test('the scheduled workflow pushes the trend to the data branch only', (t) => {
  const workflow = fs.readFileSync(FORMATION_HEALTH_WORKFLOW_PATH, 'utf8');
  // The complete set of push invocations: one, to exactly this refspec.
  t.equal((workflow.match(/\bgit\b[^\n]*\bpush\b/gu) ?? []).length, 1, 'exactly one git push');
  t.match(workflow, /git push origin HEAD:data\/formation-health; then/u);
  t.notMatch(workflow, /--force|--mirror|--delete|git push[^\n]* -f\b|--tags|\+HEAD|push origin [^H]/u,
    'no force, mirror, delete or other refspec');
  t.notMatch(workflow, /\bgit\s+-C\b|\bcd\s|GITHUB_WORKSPACE/u,
    'the push step never addresses the main checkout');
  t.notMatch(workflow, /HEAD:main|origin main|LAGRANGE_PUSH_DATA_ONLY|--orphan|checkout -b|branch --create/u,
    'no main push, no data-only hook request, no branch creation');
  t.notMatch(workflow, /gh (?:api|pr|release)|api\.github\.com|GITHUB_TOKEN|github\.token/u,
    'no other way to write to the repository');
  // The complete set of actions: none of them pushes, commits or opens a pull request.
  const used = [...workflow.matchAll(/^\s*uses:\s*([^@\s]+)@/gmu)].map(([, action]) => action).sort();
  t.same([...new Set(used)], [
    'actions/checkout', 'actions/setup-node', 'actions/upload-artifact',
    'google-github-actions/auth', 'google-github-actions/setup-gcloud',
  ], 'only the known non-writing actions');
  t.notMatch(workflow, /continue-on-error/u, 'no step may fail silently');
  const checkouts = workflow.split(/^\s*-\s+name:/mu).filter((step) => /actions\/checkout@/u.test(step));
  t.equal(checkouts.length, 2, 'the main tree and the data branch');
  const dataCheckout = checkouts.filter((step) => /ref: data\/formation-health/u.test(step));
  t.equal(dataCheckout.length, 1);
  t.match(dataCheckout[0], /path: trend-data\n\s+persist-credentials: true/u,
    'only the data branch keeps the token');
  t.match(checkouts.filter((step) => !/ref: data\/formation-health/u.test(step))[0],
    /persist-credentials: false/u, 'the main checkout keeps no credentials');
  const pushStep = workflow.split(/^\s*-\s+name:/mu).filter((step) => /git push/u.test(step));
  t.equal(pushStep.length, 1);
  t.match(pushStep[0], /working-directory: trend-data/u, 'the push runs inside the data checkout');
  t.match(workflow, /path: trend-data[\s\S]*--trend trend-data\/trend\.ndjson/u);
  t.end();
});

// The reader owns validity: a line is a record only when it is exactly what the
// writer writes. Every other line counts as unmeasured and is reported by line
// number; a file that cannot be a trend is unavailable with its own reason.
const rec = (verdict, day) => `${JSON.stringify({schemaVersion: 1,
  at: `2026-09-${day}T03:59:00.000Z`, head: 'h', verdict, passed: verdict === 'PASS'})}\n`;
const GOOD = rec('PASS', '15') + rec('FAIL', '16') + rec('PASS', '17');

function scratchRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'formation-validity-'));
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const git = (args, input) => execGit(['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
    {cwd: root, encoding: 'utf8', input}).trim();
  git(['init', '-q', '-b', 'main']);
  const blob = (text) => git(['hash-object', '-w', '--stdin'], text);
  const setRef = (sha) => git(['update-ref', DATA_BRANCH_LOCAL_REF, sha]);
  const commitFile = (text) => {
    setRef(git(['commit-tree', git(['mktree'], `100644 blob ${blob(text)}\ttrend.ndjson\n`), '-m', 'x']));
  };
  const metric = () => {
    const out = [];
    const result = runFormationHealth({root, metric: true, log: (line) => out.push(line)});
    return {exitCode: result.exitCode, out};
  };
  return {root, git, blob, setRef, commitFile, metric};
}

test('the reader counts lines, not parsed records, and reports each bad line by number', (t) => {
  const repo = scratchRepo(t);
  repo.commitFile(GOOD);
  t.equal(repo.metric().exitCode, 0, 'three whole measuring records');
  repo.commitFile(GOOD + '{"schemaVersion":1,"at":"2026-11-29T03:35:00.000Z","verdict":"UNK');
  const torn = repo.metric();
  t.equal(torn.exitCode, 1, 'a torn newest line is unmeasured, not dropped');
  t.equal(torn.out[torn.out.length - 1], '1');
  t.match(torn.out.join('\n'), /line 4 is a partial line|line 4 is not JSON/u, 'reported by line number');
  repo.commitFile(`${GOOD}{"torn${rec('PASS', '30')}`);
  const glued = repo.metric();
  t.equal(glued.exitCode, 1, 'a real record glued onto a torn line is not invisible');
  t.match(glued.out.join('\n'), /line 4 is not JSON/u);
  repo.commitFile('{"verdict":"PASS"}\n{"verdict":"PASS"}\n{"verdict":"PASS"}\n');
  const handmade = repo.metric();
  t.equal(handmade.out[handmade.out.length - 1], '3', 'hand-made lines are not measuring records');
  t.match(handmade.out.join('\n'), /line 1 has another schema version/u);
  repo.commitFile(GOOD.replace('"schemaVersion":1', '"schemaVersion":2'));
  t.match(repo.metric().out.join('\n'), /line 1 has another schema version/u);
  repo.commitFile(rec('PASS', '15') + rec('PASS', '16') + rec('PASS', '17').replace('"head":"h"', '"head":""'));
  t.match(repo.metric().out.join('\n'), /line 3 names no time or head/u);
  repo.commitFile(rec('PASS', '15') + rec('PASS', '16') + rec('UNKNOWN', '17'));
  t.match(repo.metric().out.join('\n'), /line 3 carries no measuring verdict/u);
  repo.commitFile(rec('PASS', '15') + rec('PASS', '16') + rec('PASS', '17').trimEnd());
  t.match(repo.metric().out.join('\n'), /line 3 is a partial line/u, 'a last line with no line end is partial');
  // Canonical bytes: a duplicate key hides a non-verdict, and padding is not what the writer writes.
  repo.commitFile(rec('PASS', '15') + rec('PASS', '16') + rec('PASS', '17').replace(
    '"verdict":"PASS"', '"verdict":"UNKNOWN","verdict":"PASS"'));
  t.match(repo.metric().out.join('\n'), /line 3 is not a record as the writer writes one/u,
    'a duplicate key is not a whole record');
  repo.commitFile(rec('PASS', '15') + rec('PASS', '16') + rec('PASS', '17').replace('"head":', '"head": '));
  t.match(repo.metric().out.join('\n'), /line 3 is not a record as the writer writes one/u,
    'padding is not what the writer writes');
  // The writer's ISO stamp, nothing looser: a time Date.parse accepts is still not that stamp.
  repo.commitFile(rec('PASS', '15') + rec('PASS', '16') +
    rec('PASS', '17').replace('2026-09-17T03:59:00.000Z', '2026-09-17 03:59:00'));
  t.match(repo.metric().out.join('\n'), /line 3 names no time or head/u,
    'a non-ISO time is not a record');
  // The measurement names its input: the commit read, as a note line before the number.
  repo.commitFile(GOOD);
  const tip = repo.git(['rev-parse', DATA_BRANCH_LOCAL_REF]);
  const named = repo.metric();
  t.equal(named.out[named.out.length - 2], `formation health: read ${DATA_BRANCH} @ ${tip}`);
  t.equal(named.out[named.out.length - 1], '0', 'the number stays the last line');
  const noted = [];
  runFormationHealth({root: repo.root, summary: true, log: (line) => noted.push(line)});
  t.equal(noted[0], `formation health: read ${DATA_BRANCH} @ ${tip}`);
  const summary = [];
  repo.commitFile(GOOD + 'junk\n');
  runFormationHealth({root: repo.root, summary: true, log: (line) => summary.push(line)});
  t.match(summary.join('\n'), /line 4 is not JSON[\s\S]*2\/3 passed/u, 'the summary reports it and renders the rest');
  t.end();
});

test('a file or ref that cannot be a trend is unavailable with its own reason', (t) => {
  const repo = scratchRepo(t);
  const reasonOf = () => {
    const read = readDataBranchTrend(repo.root);
    t.equal(read.state, 'unavailable');
    return read.reason;
  };
  repo.commitFile('this is not ndjson\nat all\n');
  t.match(reasonOf(), /is not ndjson/u);
  t.equal(repo.metric().exitCode, 1);
  t.match(repo.metric().out.join('\n'), /^unavailable\n/u);
  const sub = repo.git(['mktree'], `100644 blob ${repo.blob('x')}\tx\n`);
  repo.setRef(repo.git(['commit-tree', repo.git(['mktree'], `040000 tree ${sub}\ttrend.ndjson\n`), '-m', 'dir']));
  t.match(reasonOf(), /is not a regular file/u, 'a directory named trend.ndjson');
  repo.setRef(repo.git(['commit-tree', repo.git(['mktree'], `120000 blob ${repo.blob('elsewhere')}\ttrend.ndjson\n`), '-m', 'link']));
  t.match(reasonOf(), /is not a regular file/u, 'a symlink');
  repo.setRef(repo.blob('a blob, not a commit'));
  t.match(reasonOf(), /is not a commit/u, 'a ref that points at a blob is not an absent ref');
  repo.git(['update-ref', '-d', DATA_BRANCH_LOCAL_REF]);
  t.match(reasonOf(), /is absent/u);
  t.end();
});

test('--metric with an explicit --trend that is missing or a directory is unavailable', (t) => {
  const repo = scratchRepo(t);
  fs.mkdirSync(path.join(repo.root, 'adir'));
  for (const trend of ['missing.ndjson', 'adir']) {
    const out = [];
    const result = runFormationHealth(
      {root: repo.root, metric: true, trend, log: (line) => out.push(line)});
    t.equal(result.exitCode, 1, trend);
    t.match(out.join('\n'), /^unavailable\n/u, `${trend}: not an empty trend`);
  }
  t.end();
});

test('--fetch refuses under a probe', (t) => {
  const repo = scratchRepo(t);
  const saved = process.env.LAGRANGE_PROBE;
  process.env.LAGRANGE_PROBE = '1';
  try {
    t.throws(() => runFormationHealth({root: repo.root, metric: true, fetch: true, log: () => {}}),
      /refused under LAGRANGE_PROBE=1/u);
  } finally {
    if (saved === undefined) delete process.env.LAGRANGE_PROBE;
    else process.env.LAGRANGE_PROBE = saved;
  }
  t.end();
});

test('recording closes a torn tail so a new record never glues onto it', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'formation-torn-'));
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const file = path.join(root, 't.ndjson');
  fs.writeFileSync(file, rec('PASS', '15') + '{"torn');
  const reportPath = path.join(root, 'r.report.json');
  fs.writeFileSync(reportPath, JSON.stringify(liveReport({
    passed: true, verdict: 'PASS', reason: 'schema_admitted', seedStarved: false, blockedMs: 1,
  })));
  runFormationHealth({root, report: 'r.report.json', trend: 't.ndjson', run: () => t.fail('no demo'), log: () => {}});
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  t.equal(lines[1], '{"torn', 'the torn line stays its own line');
  t.equal(JSON.parse(lines[2]).verdict, 'PASS', 'the new record is whole on the next line');
  t.end();
});
