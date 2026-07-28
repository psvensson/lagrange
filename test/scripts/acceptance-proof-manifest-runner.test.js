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
  runProjectHardeningAcceptance,
} from '../../scripts/run-project-hardening-acceptance.js';

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
      'fast-tests',
    ]);
    const focused = actual.commands[0].argv;
    for (const required of [
      'test/scripts/run-test-files.test.js',
      'test/scripts/acceptance-proof-manifest-runner.test.js',
      'test/release/public-api-side-effect-boundary.test.js',
      'test/release/project-hardening-contracts.test.js',
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
    for (const script of [
      'scripts/run-solver-acceptance-proof-manifest-scenarios.js',
      'scripts/run-project-hardening-proof-integrity-cutover-scenarios.js',
    ]) {
      assert.match(
        fs.readFileSync(script, 'utf8'),
        /runProjectHardeningAcceptance/u,
      );
    }
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
      'test/solve/content-addressed-change-artifact.test.js',
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
    const scenarioRunner = fs.readFileSync(
      'scripts/run-developer-smoke-proof-scenarios.js',
      'utf8',
    );
    assert.match(scenarioRunner, /runProjectHardeningAcceptance/u);
    assert.match(scenarioRunner, new RegExp(smokeManifestPath));
  });
});
