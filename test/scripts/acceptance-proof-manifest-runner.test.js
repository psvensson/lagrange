import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ACCEPTANCE_MANIFEST_SCHEMA_VERSION,
  runAcceptanceManifest,
  validateAcceptanceManifest,
} from '../../scripts/checks/acceptance-proof-manifest-runner.js';
import {
  renderRunSummary,
  runProjectHardeningAcceptance,
} from '../../scripts/run-project-hardening-acceptance.js';
import {
  formatBatchSignalLine,
  formatPlannedLine,
  formatTestFilesSummary,
} from '../../scripts/run-test-files.js';

function command(id = 'proof', overrides = {}) {
  return {
    id,
    executable: 'node',
    argv: ['-e', 'process.exit(0)'],
    timeoutMs: 1000,
    acceptableExitCodes: [0],
    requiredArtifact: {
      mode: 'captured-output',
      path: `artifacts/${id}.json`,
    },
    ...overrides,
  };
}

function manifest(commands = [command()]) {
  return {
    schemaVersion: ACCEPTANCE_MANIFEST_SCHEMA_VERSION,
    id: 'test-acceptance-manifest',
    environment: {inherit: true, set: {PROOF_TEST: '1'}},
    commands,
  };
}

function setup(data = manifest()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acceptance-manifest-'));
  const manifestPath = 'proof-manifest.json';
  fs.writeFileSync(
    path.join(root, manifestPath),
    JSON.stringify(data, null, 2),
  );
  return {root, manifestPath};
}

function successfulExecution() {
  return {status: 0, signal: null, stdout: 'ok\n', stderr: '', error: null};
}

describe('acceptance proof manifest runner', () => {
  it('rejects empty manifests and explicit skip controls', () => {
    assert.match(
      validateAcceptanceManifest(manifest([])).join('\n'),
      /non-empty ordered array/u,
    );
    assert.match(
      validateAcceptanceManifest(manifest([command('skipped', {skip: true})]))
        .join('\n'),
      /must not be skipped/u,
    );
  });

  it('rejects shell strings and shell interpreter executables', () => {
    assert.match(
      validateAcceptanceManifest(manifest([
        command('string', {command: 'npm run test:fast'}),
      ])).join('\n'),
      /not a shell string/u,
    );
    assert.match(
      validateAcceptanceManifest(manifest([
        command('shell', {executable: 'bash', argv: ['-c', 'true']}),
      ])).join('\n'),
      /shell interpreter/u,
    );
  });

  it('fails on non-zero status and records a fresh output identity', () => {
    const fixture = setup(manifest([
      command('nonzero', {argv: ['-e', 'process.exit(7)']}),
    ]));
    const report = runAcceptanceManifest(fixture);
    assert.equal(report.passed, false);
    assert.equal(report.commands[0].exitCode, 7);
    assert.match(report.commands[0].reasons.join('\n'), /not acceptable/u);
    assert.equal(report.commands[0].artifactIdentity.exists, true);
    assert.match(report.commands[0].artifactIdentity.sha256, /^[a-f0-9]{64}$/u);
    fs.rmSync(fixture.root, {recursive: true, force: true});
  });

  it('fails closed on timeout', () => {
    const fixture = setup(manifest([
      command('timeout', {
        argv: ['-e', 'setTimeout(() => {}, 5000)'],
        timeoutMs: 20,
      }),
    ]));
    const report = runAcceptanceManifest(fixture);
    assert.equal(report.passed, false);
    assert.match(report.commands[0].reasons.join('\n'), /timed out/u);
    fs.rmSync(fixture.root, {recursive: true, force: true});
  });

  it('fails when an external artifact is missing or stale', () => {
    const missingFixture = setup(manifest([
      command('missing', {
        requiredArtifact: {mode: 'external', path: 'artifacts/missing.json'},
      }),
    ]));
    const missing = runAcceptanceManifest(missingFixture);
    assert.match(missing.commands[0].reasons.join('\n'), /artifact is missing/u);
    fs.rmSync(missingFixture.root, {recursive: true, force: true});

    const staleFixture = setup(manifest([
      command('stale', {
        requiredArtifact: {mode: 'external', path: 'artifacts/stale.json'},
      }),
    ]));
    const stalePath = path.join(staleFixture.root, 'artifacts/stale.json');
    fs.mkdirSync(path.dirname(stalePath), {recursive: true});
    fs.writeFileSync(stalePath, '{}');
    const old = new Date(Date.now() - 60000);
    fs.utimesSync(stalePath, old, old);
    const stale = runAcceptanceManifest(staleFixture);
    assert.match(stale.commands[0].reasons.join('\n'), /artifact is stale/u);
    fs.rmSync(staleFixture.root, {recursive: true, force: true});
  });

  it('requires an external artifact to change during the command', () => {
    const fixture = setup(manifest([
      command('external', {
        requiredArtifact: {mode: 'external', path: 'artifacts/external.json'},
      }),
    ]));
    const artifactPath = path.join(fixture.root, 'artifacts/external.json');
    fs.mkdirSync(path.dirname(artifactPath), {recursive: true});
    fs.writeFileSync(artifactPath, '{"before":true}');

    const unchanged = runAcceptanceManifest({
      ...fixture,
      execute: successfulExecution,
    });
    assert.equal(unchanged.passed, false);
    assert.match(
      unchanged.commands[0].reasons.join('\n'),
      /not produced or updated/u,
    );

    const updated = runAcceptanceManifest({
      ...fixture,
      execute() {
        fs.writeFileSync(artifactPath, '{"after":true}');
        return successfulExecution();
      },
    });
    assert.equal(updated.passed, true);
    assert.notEqual(
      updated.commands[0].artifactBeforeIdentity.sha256,
      updated.commands[0].artifactIdentity.sha256,
    );
    fs.rmSync(fixture.root, {recursive: true, force: true});
  });

  it('passes argv literally without shell expansion', () => {
    const fixture = setup();
    const marker = path.join(fixture.root, 'injected');
    const data = manifest([
      command('argv', {
        argv: ['-e', 'process.exit(0)', `$(touch ${marker})`],
      }),
    ]);
    fs.writeFileSync(
      path.join(fixture.root, fixture.manifestPath),
      JSON.stringify(data, null, 2),
    );
    const report = runAcceptanceManifest(fixture);
    assert.equal(report.passed, true);
    assert.equal(fs.existsSync(marker), false);
    fs.rmSync(fixture.root, {recursive: true, force: true});
  });

  it('detects manifest drift during command execution', () => {
    const fixture = setup();
    const report = runAcceptanceManifest({
      ...fixture,
      execute() {
        fs.appendFileSync(
          path.join(fixture.root, fixture.manifestPath),
          '\n',
        );
        return successfulExecution();
      },
    });
    assert.equal(report.passed, false);
    assert.match(report.commands[0].reasons.join('\n'), /manifest drifted/u);
    fs.rmSync(fixture.root, {recursive: true, force: true});
  });

  it('runs every ordered command and records per-command artifact identity', () => {
    const fixture = setup(manifest([command('first'), command('second')]));
    const observed = [];
    const report = runAcceptanceManifest({
      ...fixture,
      execute(entry, options) {
        observed.push({id: entry.id, proofTest: options.env.PROOF_TEST});
        return successfulExecution();
      },
    });
    assert.equal(report.passed, true);
    assert.deepEqual(observed, [
      {id: 'first', proofTest: '1'},
      {id: 'second', proofTest: '1'},
    ]);
    assert.equal(report.commands.every((entry) =>
      entry.status === 'PASS' && entry.artifactIdentity.exists), true);
    fs.rmSync(fixture.root, {recursive: true, force: true});
  });

  it('writes Solver scenario evidence from the same public executor', () => {
    const fixture = setup();
    const result = runProjectHardeningAcceptance({
      ...fixture,
      execute: successfulExecution,
      scenario: 'test-scenario',
      receiptDir: 'receipts',
      scenarioReportDir: 'reports',
    });
    const scenario = JSON.parse(fs.readFileSync(
      path.join(fixture.root, result.scenarioPath),
      'utf8',
    ));
    assert.equal(result.run.passed, true);
    assert.equal(scenario.producer, 'acceptance-proof-manifest-runner');
    assert.equal(scenario.standardSummary.scenarios[0].passed, true);
    assert.equal(scenario.receipt.path, result.receiptPath);
    assert.match(scenario.receipt.sha256, /^[a-f0-9]{64}$/u);
    assert.equal(scenario.receipt.size > 0, true);
    assert.match(
      scenario.standardSummary.scenarios[0]
        .detail.commands[0].artifactIdentity.sha256,
      /^[a-f0-9]{64}$/u,
    );
    fs.rmSync(fixture.root, {recursive: true, force: true});
  });

  it('projects invalid manifest validation as a non-zero scenario failure', () => {
    const fixture = setup(manifest([]));
    const result = runProjectHardeningAcceptance({
      ...fixture,
      execute() {
        throw new Error('invalid manifest must not execute commands');
      },
      scenario: 'invalid-manifest-scenario',
      receiptDir: 'receipts',
      scenarioReportDir: 'reports',
    });
    const scenario = JSON.parse(fs.readFileSync(
      path.join(fixture.root, result.scenarioPath),
      'utf8',
    ));
    assert.equal(result.run.passed, false);
    assert.deepEqual(scenario.summary, {total: 1, passed: 0, failed: 1});
    assert.equal(scenario.optimizationSummary.totalPriorityItems, 1);
    assert.equal(scenario.standardSummary.scenarios[0].passed, false);
    assert.match(scenario.receipt.sha256, /^[a-f0-9]{64}$/u);
    fs.rmSync(fixture.root, {recursive: true, force: true});
  });

  it('keeps one complete command inventory and one public gate executor', () => {
    const actual = JSON.parse(fs.readFileSync(
      'test/manifests/project-hardening-proof-manifest.json',
      'utf8',
    ));
    assert.deepEqual(actual.commands.map((entry) => entry.id), [
      'focused-contracts',
      'static-analysis',
      'model-contracts',
      'owner-debt-report-inputs',
      'golden-capability-guard-scenarios',
      'fast-tests',
    ]);
    const focused = actual.commands[0].argv;
    for (const required of [
      'test/scripts/run-test-files.test.js',
      'test/scripts/acceptance-proof-manifest-runner.test.js',
      'test/release/public-api-side-effect-boundary.test.js',
      'test/release/project-hardening-contracts.test.js',
      'test/release/release-pipeline-proof-reuse.test.js',
      'test/admin/admin-websocket-external-bind-policy.test.js',
      'test/runtime/pgwire-protocol-ordering.test.js',
      'test/compatibility/pgwire-client-compat.test.js',
    ]) {
      assert.equal(focused.includes(required), true, `${required} is engaged`);
    }
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    assert.equal(
      packageJson.scripts['test:gate'],
      packageJson.scripts['test:project-hardening'],
    );
    assert.match(
      packageJson.scripts['test:gate'],
      /run-project-hardening-acceptance\.js/u,
    );
  });

  it('owns the short developer proof in one acceptance manifest', () => {
    const smokeManifestPath =
      'test/manifests/developer-smoke-proof-manifest.json';
    const smoke = JSON.parse(fs.readFileSync(smokeManifestPath, 'utf8'));
    const expectedTests = [
      'test/scripts/run-test-files.test.js',
      'test/scripts/acceptance-proof-manifest-runner.test.js',
      'test/release/public-api-side-effect-boundary.test.js',
      'test/release/project-hardening-contracts.test.js',
      'test/release/release-pipeline-proof-reuse.test.js',
      'test/admin/admin-websocket-external-bind-policy.test.js',
      'test/runtime/pgwire-protocol-ordering.test.js',
      'test/compatibility/pgwire-client-compat.test.js',
      'test/closure/CL-040.repro.test.js',
      'test/closure/CL-041.repro.test.js',
      'test/closure/CL-042.repro.test.js',
      'test/convergence/dt6-publication-quorum-failback-network.test.js',
      'test/convergence/dt6-publication-failback-pct-search.test.js',
      'test/convergence/dt6-fine-drive-midchurn-safety.test.js',
      'test/control-plane/owner-outcome-contract.test.js',
      'test/rebalancer/in-flight-aware-drain-phase-replace-credit.test.js',
      'test/query/transaction-owned-commit-mode-guard.test.js',
      'test/solve/commands.test.js',
    ];

    assert.deepEqual(validateAcceptanceManifest(smoke), []);
    assert.equal(smoke.id, 'developer-smoke-proof');
    assert.deepEqual(smoke.commands.map((entry) => entry.id), [
      'focused-contracts',
    ]);
    assert.equal(smoke.commands[0].timeoutMs, 60000);
    assert.deepEqual(smoke.commands[0].argv.slice(0, 2), [
      'scripts/run-test-files.js',
      '--jobs=8',
    ]);
    assert.deepEqual(smoke.commands[0].argv.slice(2), expectedTests);
    assert.equal(new Set(expectedTests).size, expectedTests.length);
    assert.equal(expectedTests.every((file) => fs.existsSync(file)), true);

    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    assert.match(
      packageJson.scripts['test:smoke'],
      /run-project-hardening-acceptance\.js/u,
    );
    assert.match(packageJson.scripts['test:smoke'], new RegExp(smokeManifestPath));
  });
});

// failed-gate-keeps-evidence: a failed command's captured output is the only
// place its per-file verdicts exist, so the run summary names the failing
// test files from it - the runner's file-level verdict lines only, decided by
// the last verdict and a retried-once pass, bounded with a withheld count, and
// never a count when the runner's summary line is absent.
const FILE_LINE = /^ {4}(test\/\S+\.test\.js)$/u;

function summaryOfFailedOutput(stdout, signal = null) {
  const fixture = setup(manifest([command('change-proof')]));
  const run = runAcceptanceManifest({
    ...fixture,
    execute: () => ({status: signal ? null : 1, signal, stdout, stderr: '', error: null}),
  });
  const summary = renderRunSummary(run, fixture.root);
  fs.rmSync(fixture.root, {recursive: true, force: true});
  return {
    summary,
    named: summary.split('\n').map((line) => FILE_LINE.exec(line)?.[1])
      .filter(Boolean),
  };
}

function verdict(outcome, file) {
  return `${outcome} ${file} (2 assertions, 15ms)`;
}

describe('failing-file run summary', () => {
  it('names exactly the failing test files of the failing command', () => {
    const {summary, named} = summaryOfFailedOutput([
      'classified lane ordinary: 3 file(s), jobs=2',
      verdict('ok', 'test/a/green.test.js'),
      verdict('not ok', 'test/a/red.test.js'),
      '# test failed',
      'TAP version 13',
      'not ok 1 - a nested subtest that is not a file verdict',
      '    not ok 1 - an indented nested subtest',
      'not ok 2 - test/a/lookalike.test.js (1 assertions, 3ms)',
      '# test-files total=2 pass=1 fail=1 assertions=4',
      '[lab-a] ' + verdict('not ok', 'test/b/relayed-red.test.js'),
      '[lab-a] ' + verdict('not ok', 'test/b/decided-green.test.js'),
      '[lab-a] # test-files total=2 pass=0 fail=2 assertions=4',
      verdict('ok', 'test/b/decided-green.test.js'),
      '# test-files total=1 pass=1 fail=0 assertions=2',
      '',
    ].join('\n'));
    assert.deepEqual(named, ['test/a/red.test.js', 'test/b/relayed-red.test.js'],
      summary);
    assert.match(summary, /^ {2}failing test files: 2$/mu);
  });

  it('does not name a file that passed its retried-once rerun', () => {
    const {summary, named} = summaryOfFailedOutput([
      verdict('not ok', 'test/a/flaky.test.js'),
      verdict('not ok', 'test/a/broken.test.js'),
      '# test-files total=2 pass=0 fail=2 assertions=4',
      '# retry-failed-once: rerunning 2 failed file(s) standalone',
      verdict('ok', 'test/a/flaky.test.js'),
      '# retried-once pass test/a/flaky.test.js',
      verdict('not ok', 'test/a/broken.test.js'),
      '# retried-once fail test/a/broken.test.js',
      '',
    ].join('\n'));
    assert.deepEqual(named, ['test/a/broken.test.js'], summary);
    assert.match(summary, /^ {2}failing test files: 1$/mu);
  });

  it('reports an absent runner summary line as incomplete, never as a count', () => {
    const {summary, named} = summaryOfFailedOutput([
      verdict('ok', 'test/a/green.test.js'),
      verdict('not ok', 'test/a/red.test.js'),
      '',
    ].join('\n'));
    assert.match(summary,
      /^ {2}failing test files: summary line absent - list may be incomplete$/mu);
    assert.doesNotMatch(summary, /failing test files: \d/u);
    assert.deepEqual(named, ['test/a/red.test.js'], summary);
  });

  it('bounds the failing-file list and counts what it withheld', () => {
    const files = Array.from({length: 27},
      (_unused, index) => `test/many/red-${String(index).padStart(2, '0')}.test.js`);
    const {summary, named} = summaryOfFailedOutput([
      ...files.map((file) => verdict('not ok', file)),
      '# test-files total=27 pass=0 fail=27 assertions=54',
      '',
    ].join('\n'));
    assert.match(summary, /^ {2}failing test files: 27$/mu);
    assert.deepEqual(named, files.slice(0, 20), summary);
    assert.match(summary, /^ {4}\.\.\. 7 more withheld /mu);
  });
});

// failed-gate-keeps-evidence, corrective attempt: a count is printed only when
// the list is complete - every file a classified run planned is covered by a
// runner summary, no batch or command ended by a signal, and every verdict
// line was read whole - never from the absence of one known bad sign.
function summarised(files, failed = 0) {
  return formatTestFilesSummary({total: files, passed: files - failed, failed,
    assertions: 2 * files});
}

describe('failing-file run summary completeness', () => {
  it('never counts a run whose batch was killed mid-run', () => {
    const {summary, named} = summaryOfFailedOutput([
      formatPlannedLine(3),
      verdict('ok', 'test/b1/green.test.js'),
      summarised(1),
      formatBatchSignalLine('SIGKILL', 1),
      verdict('not ok', 'test/b3/red.test.js'),
      summarised(1, 1),
      '',
    ].join('\n'));
    assert.match(summary, /^ {2}failing test files: 1 of 3 planned file\(s\) not covered by a summary - list may be incomplete$/mu);
    assert.deepEqual(named, ['test/b3/red.test.js'], summary);
    // Killed after its summary, during its retry: summaries cover the plan,
    // and the signalled batch alone says the list is incomplete.
    const retried = summaryOfFailedOutput([
      formatPlannedLine(1),
      verdict('not ok', 'test/b1/flaky.test.js'),
      summarised(1, 1),
      formatBatchSignalLine('SIGKILL', 1),
      '',
    ].join('\n')).summary;
    assert.match(retried, /^ {2}failing test files: ended by SIGKILL - list may be incomplete$/mu);
  });

  it('never counts a run the thermal gate refused mid-run', () => {
    const {summary} = summaryOfFailedOutput([
      formatPlannedLine(2),
      verdict('ok', 'test/b1/green.test.js'),
      summarised(1),
      '# thermal-headroom-exhausted: 1 file(s) not run: test/b2/never.test.js',
      '',
    ].join('\n'));
    assert.match(summary, /^ {2}failing test files: 1 of 2 planned file\(s\) not covered by a summary - list may be incomplete$/mu);
  });

  it('never counts a command that ended by a signal', () => {
    const {summary, named} = summaryOfFailedOutput([
      verdict('not ok', 'test/a/red.test.js'),
      summarised(1, 1),
      '',
    ].join('\n'), 'SIGTERM');
    assert.match(summary, /^ {2}failing test files: ended by SIGTERM - list may be incomplete$/mu);
    assert.deepEqual(named, ['test/a/red.test.js'], summary);
  });

  it('never counts a run with a verdict line too long to read', () => {
    const {summary} = summaryOfFailedOutput([
      verdict('not ok', `test/${'d/'.repeat(130)}long.test.js`),
      summarised(1, 1),
      '',
    ].join('\n'));
    assert.match(summary, /^ {2}failing test files: 1 verdict line\(s\) too long to read - list may be incomplete$/mu);
  });

  it('counts a complete classified run and says nothing for a non-test command', () => {
    const {summary, named} = summaryOfFailedOutput([
      formatPlannedLine(2),
      verdict('ok', 'test/b1/green.test.js'),
      verdict('not ok', 'test/b1/red.test.js'),
      summarised(2, 1),
      '',
    ].join('\n'));
    assert.match(summary, /^ {2}failing test files: 1$/mu);
    assert.deepEqual(named, ['test/b1/red.test.js'], summary);
    assert.doesNotMatch(summaryOfFailedOutput('src/a.js: 1 lint problem\n').summary,
      /failing test files/u);
  });
});
