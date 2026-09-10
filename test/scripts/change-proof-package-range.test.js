import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
  CHECK_BASE_ENV,
  WORKSPACE_INJECTION_ENV,
} from '../../scripts/checks/change-selection-constants.js';
import {testsForSubsystem} from '../../scripts/check-subsystem.js';
import {createChangeProofFixture} from './change-proof-fixture.js';

const root = process.cwd();
const UTF8 = 'utf8';
const BANNER = 'MODULAR PROOF NOT SAFE';
const {
  proofFor,
  proofForCommittedAndWorkingChanges,
} = createChangeProofFixture({
  root,
  checkBaseEnvironment: CHECK_BASE_ENV,
  workspaceInjectionEnvironment: WORKSPACE_INJECTION_ENV,
});

function releaseVersionChanges(version) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), UTF8));
  const lockfile = JSON.parse(
    fs.readFileSync(path.join(root, 'package-lock.json'), UTF8));
  manifest.version = version;
  lockfile.version = version;
  lockfile.packages[''].version = version;
  return {
    'package.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'package-lock.json': `${JSON.stringify(lockfile, null, 2)}\n`,
  };
}

function withJsonDependency(jsonText, name) {
  const manifest = JSON.parse(jsonText);
  manifest.dependencies = {...manifest.dependencies, [name]: '1.0.0'};
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function withTransitiveIntegrity(jsonText) {
  const lockfile = JSON.parse(jsonText);
  const dependencyPath = Object.keys(lockfile.packages)
    .find((candidate) => candidate !== '');
  assert.ok(dependencyPath, 'fixture lockfile must contain a transitive node');
  lockfile.packages[dependencyPath].integrity = 'sha512-fixture-integrity';
  return `${JSON.stringify(lockfile, null, 2)}\n`;
}

test('a coordinated release version edit takes a real modular proof', () => {
  const proof = proofFor(releaseVersionChanges('9.9.9'));
  assert.equal(proof.status, 0, proof.output);
  assert.ok(!proof.output.includes(BANNER));
  assert.notEqual(proof.invocation, null,
    'version metadata must run a proof, not become inert');
  const invoked = new Set(proof.invocation);
  for (const packagingTest of testsForSubsystem('release-packaging')) {
    assert.ok(invoked.has(packagingTest),
      `${packagingTest} must prove release version metadata`);
  }
});

test('an explicit committed head cannot hide a dirty lock graph change', () => {
  const committed = releaseVersionChanges('9.9.9');
  const proof = proofForCommittedAndWorkingChanges(committed, {
    'package-lock.json': withTransitiveIntegrity(
      committed['package-lock.json']),
  });
  assert.notEqual(proof.status, 0);
  assert.equal(proof.invocation, null,
    'a dirty transitive change must refuse before spawning tests');
  assert.ok(proof.output.includes('RELEASE_PROOF_REQUIRED'));
});

test('an explicit committed head cannot hide a deleted dirty lockfile', () => {
  const committed = releaseVersionChanges('9.9.9');
  const proof = proofForCommittedAndWorkingChanges(committed, {
    'package-lock.json': null,
  });
  assert.notEqual(proof.status, 0);
  assert.equal(proof.invocation, null,
    'an unavailable dirty lock comparison must refuse before spawning tests');
  assert.ok(proof.output.includes('RELEASE_PROOF_REQUIRED'));
});

test('an explicit committed head cannot hide a dirty package dependency', () => {
  const committed = releaseVersionChanges('9.9.9');
  const proof = proofForCommittedAndWorkingChanges(committed, {
    'package.json': withJsonDependency(
      committed['package.json'], 'fixture-package'),
  });
  assert.notEqual(proof.status, 0);
  assert.equal(proof.invocation, null,
    'a dirty package dependency must refuse before spawning tests');
  assert.ok(proof.output.includes('RELEASE_PROOF_REQUIRED'));
});
