/**
 * Formation health trend: one compact record per run, appended durably,
 * summarized with a pass rate; a run without a report records nothing.
 */

import {execFileSync, spawnSync} from 'node:child_process';
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
  verifyTrendPush,
} from '../../scripts/checks/formation-health.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';
import {
  FORMATION_OWNER,
} from '../../src/diagnostics/formation-diagnostics-contract.js';

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

test('parseArguments reads report, gcp, summary, metric, trend and limit', (t) => {
  t.same(parseArguments([]), {
    report: null, gcp: false, summary: false, metric: false,
    calibration: null, botCommits: false,
    trend: 'data/formation-health/trend.ndjson', limit: 20,
  });
  t.same(
    parseArguments(['--report', 'r.json', '--gcp', '--summary', '--metric',
      '--trend', 't.ndjson', '--limit', '5']),
    {report: 'r.json', gcp: true, summary: true, metric: true,
      calibration: null, botCommits: false, trend: 't.ndjson', limit: 5},
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

// The nightly workflow's token commits one inert file and nothing else.
test('--bot-commits flags a formation-health commit that touches anything but the trend', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'formation-bot-'));
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'commit.gpgsign', 'false');
  const commit = (name, email, file, message) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.appendFileSync(path.join(root, file), `${message}\n`);
    git('add', file);
    git('-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-q', '-m', message);
  };
  commit('Human', 'h@example.invalid', 'src/a.js', 'human change');
  const check = () => runFormationHealth({
    root, botCommits: true, run: () => t.fail('never runs the demo'), log: () => {},
  }).exitCode;
  t.equal(check(), 0, 'no bot commit yet');
  commit('formation-health', 'formation-health@users.noreply.github.com',
    'data/formation-health/trend.ndjson', 'formation-health: trend record');
  t.equal(check(), 0, 'the trend is the bot\'s one file');
  commit('formation-health', 'formation-health@users.noreply.github.com', 'src/b.js', 'bot touches source');
  t.equal(check(), 1, 'anything else by the bot is flagged');
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
    root, report: 'test-output/reports/r.report.json', env, log: () => {},
    run: () => t.fail('never runs the demo'),
  }).record;
  t.same(record({GITHUB_RUN_ID: '35303538995', GITHUB_RUN_ATTEMPT: '1'}).run,
    {id: '35303538995', attempt: '1'});
  t.equal(record({}).run, null);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

const TREND = 'data/formation-health/trend.ndjson';
const measured = (verdict, at = '2026-09-15T03:59:00.000Z') =>
  `${JSON.stringify({schemaVersion: 1, at, head: '3b1fd7877', verdict})}\n`;

// A scratch repository whose main already holds the trend and some source.
function trendRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'formation-trend-push-'));
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t',
    ...args], {cwd: root, encoding: 'utf8', env: gitProcessEnvironment()}).trim();
  const write = (file, text, mode = 0o644) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), text, {mode});
  };
  const commit = (message) => {
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q', '-b', 'main');
  git('config', 'commit.gpgsign', 'false');
  write(TREND, measured('PASS', '2026-09-14T03:46:58.215Z'));
  write('src/a.js', 'export const a = 1;\n');
  write('test/shards/impact-graph-seal.json', '{"snapshotDigest": "a"}\n');
  const base = commit('base');
  const append = (text) => fs.appendFileSync(path.join(root, TREND), text);
  const reset = () => git('checkout', '-q', '--detach', base);
  return {root, git, write, commit, base, append, reset};
}

const problemsOf = (repo, head, base = repo.base) =>
  verifyTrendPush(repo.root, base, head).problems;

test('a data-only trend push is admitted when it only appends measuring records', (t) => {
  const repo = trendRepo(t);
  repo.append(measured('PASS'));
  const one = repo.commit('trend 09-15');
  t.same(verifyTrendPush(repo.root, repo.base, one), {problems: [], records: 1, commits: 1});
  repo.append(measured('FAIL', '2026-09-16T03:59:00.000Z') +
    measured('PASS', '2026-09-17T03:59:00.000Z'));
  const two = repo.commit('trend 09-16 and 09-17');
  t.same(verifyTrendPush(repo.root, repo.base, two), {problems: [], records: 3, commits: 2},
    'a red measurement is a record like a green one');
  t.end();
});

test('a data-only trend push that changes anything else is refused', (t) => {
  const repo = trendRepo(t);
  const refused = (label, build, pattern) => {
    repo.reset();
    const head = build();
    const problems = problemsOf(repo, head);
    t.ok(problems.length > 0, `${label} is refused`);
    t.match(problems.join('; '), pattern, label);
  };
  refused('source beside the record', () => {
    repo.append(measured('PASS'));
    repo.write('src/a.js', 'export const a = 2;\n');
    return repo.commit('smuggled');
  }, /more than the trend file/u);
  refused('the seal alone', () => {
    repo.write('test/shards/impact-graph-seal.json', '{"snapshotDigest": "b"}\n');
    return repo.commit('seal');
  }, /more than the trend file/u);
  refused('a source change reverted later in the push', () => {
    repo.write('src/a.js', 'export const a = 3;\n');
    repo.commit('change');
    repo.write('src/a.js', 'export const a = 1;\n');
    repo.append(measured('PASS'));
    return repo.commit('revert and append');
  }, /more than the trend file/u);
  refused('a rewritten record', () => {
    repo.write(TREND, measured('FAIL', '2026-09-14T03:46:58.215Z') + measured('PASS'));
    return repo.commit('rewrite');
  }, /rewrites the trend/u);
  refused('a mode change', () => {
    repo.append(measured('PASS'));
    fs.chmodSync(path.join(repo.root, TREND), 0o755);
    return repo.commit('mode');
  }, /more than the trend file/u);
  refused('an UNKNOWN verdict', () => {
    repo.append(measured('UNKNOWN'));
    return repo.commit('non-verdict');
  }, /no measuring verdict/u);
  refused('another schema version', () => {
    repo.append(`${JSON.stringify({schemaVersion: 2, at: '2026-09-15T03:59:00.000Z',
      head: 'h', verdict: 'PASS'})}\n`);
    return repo.commit('schema');
  }, /another schema version/u);
  refused('a record with no time or head', () => {
    repo.append(`${JSON.stringify({schemaVersion: 1, verdict: 'PASS'})}\n`);
    return repo.commit('unanchored');
  }, /names no time or head/u);
  refused('a record whose time is not a time', () => {
    repo.append(`${JSON.stringify({schemaVersion: 1, at: 'last night', head: 'h',
      verdict: 'PASS'})}\n`);
    return repo.commit('bad time');
  }, /names no time or head/u);
  refused('a padded verdict', () => {
    repo.append(measured('UNKNOWN ').replace('"UNKNOWN "', '"UNKNOWN "'));
    return repo.commit('padded');
  }, /no measuring verdict/u);
  refused('an empty verdict', () => {
    repo.append(measured(''));
    return repo.commit('empty verdict');
  }, /no measuring verdict/u);
  refused('an invented verdict', () => {
    repo.append(measured('banana'));
    return repo.commit('banana');
  }, /no measuring verdict/u);
  refused('a duplicate key hiding a non-verdict', () => {
    repo.append('{"schemaVersion":1,"at":"2026-09-15T03:59:00.000Z","head":"h",' +
      '"verdict":"UNKNOWN","verdict":"PASS"}\n');
    return repo.commit('duplicate key');
  }, /not a record as the writer writes one/u);
  refused('a time that is not the writer\'s ISO stamp', () => {
    repo.append(`${JSON.stringify({schemaVersion: 1, at: '0', head: 'h', verdict: 'PASS'})}\n`);
    return repo.commit('loose time');
  }, /names no time or head/u);
  refused('a blank line', () => {
    repo.append('\n');
    return repo.commit('blank');
  }, /not a record as the writer writes one/u);
  refused('a CRLF record', () => {
    repo.append(measured('PASS').replace('\n', '\r\n'));
    return repo.commit('crlf');
  }, /not a record as the writer writes one/u);
  refused('a gitlink that .gitmodules says to ignore', () => {
    repo.append(measured('PASS'));
    repo.git('update-index', '--add', '--cacheinfo', `160000,${repo.base},vendor/sub`);
    fs.writeFileSync(path.join(repo.root, '.gitmodules'),
      '[submodule "sub"]\n\tpath = vendor/sub\n\turl = ./sub\n\tignore = all\n');
    repo.git('add', TREND);
    repo.git('commit', '-q', '-m', 'hidden gitlink');
    // .gitmodules stays in the working tree while the push is judged: git
    // would honour its ignore=all even untracked.
    return repo.git('rev-parse', 'HEAD');
  }, /more than the trend file/u);
  refused('a replace ref standing in for the pushed commit', () => {
    fs.rmSync(path.join(repo.root, '.gitmodules'), {force: true});
    repo.append(measured('PASS'));
    repo.write('src/a.js', 'export const a = 4;\n');
    const smuggled = repo.commit('smuggled');
    repo.reset();
    repo.append(measured('PASS'));
    const innocent = repo.commit('innocent');
    repo.git('replace', smuggled, innocent);
    return smuggled;
  }, /more than the trend file/u);
  refused('a line that is not JSON', () => {
    repo.append('not json\n');
    return repo.commit('garbage');
  }, /not a record as the writer writes one/u);
  refused('a partial line', () => {
    repo.append(measured('PASS').trimEnd());
    return repo.commit('torn');
  }, /partial line/u);
  refused('a merge, even of a pure append', () => {
    repo.append(measured('PASS'));
    const side = repo.commit('side');
    repo.reset();
    repo.git('merge', '-q', '--no-ff', '--no-edit', side);
    return repo.git('rev-parse', 'HEAD');
  }, /exactly one parent/u);
  refused('an unrelated history', () => {
    repo.git('checkout', '-q', '--orphan', 'elsewhere');
    repo.append(measured('PASS'));
    return repo.commit('orphan');
  }, /does not descend/u);
  repo.reset();
  // The base itself must end on a line boundary, or the first appended line
  // is glued to the last old one.
  repo.write(TREND, measured('PASS', '2026-09-14T03:46:58.215Z').trimEnd());
  const tornBase = repo.commit('torn base');
  repo.append(`\n${measured('PASS')}`);
  t.match(problemsOf(repo, repo.commit('after a torn base'), tornBase).join('; '), /partial line/u,
    'a torn base is refused');
  // A git failure is a refusal, never an empty problem list.
  repo.reset();
  repo.append(measured('PASS'));
  const unreadable = repo.commit('unreadable');
  const blob = repo.git('rev-parse', `${unreadable}:${TREND}`);
  fs.rmSync(path.join(repo.root, '.git', 'objects', blob.slice(0, 2), blob.slice(2)));
  t.match(problemsOf(repo, unreadable).join('; '), /^git: /u, 'a git error refuses');
  repo.reset();
  t.match(problemsOf(repo, repo.base, '0'.repeat(40))[0], /not a commit/u,
    'a new main (no remote sha) is not a data-only push');
  t.match(problemsOf(repo, repo.base)[0], /no commit/u, 'an empty push proves nothing');
  t.end();
});

test('only PASS and FAIL count as measuring for --metric', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'formation-metric-'));
  const trend = path.join(root, TREND);
  fs.mkdirSync(path.dirname(trend), {recursive: true});
  const metric = () => {
    const lines = [];
    runFormationHealth({root, metric: true, log: (line) => lines.push(line)});
    return Number(lines[0]);
  };
  fs.writeFileSync(trend, measured('PASS') + measured('FAIL') + measured('PASS'));
  t.equal(metric(), 0);
  fs.writeFileSync(trend, measured('PASS') + measured('') + measured('banana'));
  t.equal(metric(), 2, 'an empty or invented verdict is not a measurement');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

// The pre-push hook admits a data-only push only on this script's word, so
// the script must run wherever the checkout lives: a path holding '#' made
// the old main-module guard skip everything and exit 0, and the hook then
// admitted a smuggled source change (verifier, round 1). The real hook and
// the real script, copied into scratch checkouts.
const HOOK_CLOSURE = Object.freeze([
  '.githooks/pre-push',
  'scripts/checks/formation-health.js',
  'examples/service-data-affinity/formation-verdict.js',
  'src/diagnostics/formation-diagnostics-contract.js',
  'src/test-helpers/probe-guard.js',
]);

test('the real hook admits a trend append and refuses a smuggled change, at any checkout path', (t) => {
  for (const parent of ['plain', 'runner#1']) {
    const top = fs.mkdtempSync(path.join(os.tmpdir(), 'formation-hook-'));
    t.teardown(() => fs.rmSync(top, {recursive: true, force: true}));
    const root = path.join(top, parent, 'lagrange');
    fs.mkdirSync(root, {recursive: true});
    const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t',
      ...args], {cwd: root, encoding: 'utf8', env: gitProcessEnvironment()}).trim();
    for (const file of HOOK_CLOSURE) {
      fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
      fs.copyFileSync(file, path.join(root, file));
    }
    fs.writeFileSync(path.join(root, 'package.json'), '{"type": "module"}\n');
    fs.mkdirSync(path.join(root, 'src'), {recursive: true});
    fs.writeFileSync(path.join(root, 'src/a.js'), 'export const a = 1;\n');
    fs.mkdirSync(path.dirname(path.join(root, TREND)), {recursive: true});
    fs.writeFileSync(path.join(root, TREND), measured('PASS', '2026-09-14T03:46:58.215Z'));
    git('init', '-q', '-b', 'main');
    git('config', 'commit.gpgsign', 'false');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    const base = git('rev-parse', 'HEAD');
    const push = (head) => spawnSync('bash', ['.githooks/pre-push'], {cwd: root, encoding: 'utf8',
      input: `refs/heads/main ${head} refs/heads/main ${base}\n`,
      env: {...gitProcessEnvironment(), LAGRANGE_PUSH_DATA_ONLY: 'formation-trend'}});
    fs.appendFileSync(path.join(root, TREND), measured('PASS'));
    git('commit', '-q', '-am', 'trend');
    const good = push(git('rev-parse', 'HEAD'));
    t.equal(good.status, 0, `${parent}: a trend append is admitted: ${good.stdout}${good.stderr}`);
    t.match(good.stdout, /trend push verified - 1 appended record/u, `${parent}: on the owner's word`);
    git('reset', '-q', '--hard', base);
    fs.appendFileSync(path.join(root, TREND), measured('PASS'));
    fs.writeFileSync(path.join(root, 'src/a.js'), 'export const a = 2;\n');
    git('commit', '-q', '-am', 'smuggled');
    const evil = push(git('rev-parse', 'HEAD'));
    t.equal(evil.status, 1, `${parent}: a smuggled source change is refused: ${evil.stdout}`);
    t.match(evil.stdout, /more than the trend file/u, `${parent}: by the owner, not by accident`);
  }
  t.end();
});
