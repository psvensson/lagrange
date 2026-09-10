import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
  CHECK_BASE_ENV,
  WORKSPACE_INJECTION_ENV,
} from '../../scripts/checks/change-selection-constants.js';
import {createChangeProofFixture} from './change-proof-fixture.js';

const root = process.cwd();
const UTF8 = 'utf8';
const {
  fixtureEnv,
  objectToJsonPollution,
  proofFor,
  proofFromCommittedBaseline,
} = createChangeProofFixture({
  root,
  checkBaseEnvironment: CHECK_BASE_ENV,
  workspaceInjectionEnvironment: WORKSPACE_INJECTION_ENV,
});

function withDependency(name) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), UTF8));
  manifest.dependencies = {...manifest.dependencies, [name]: '1.0.0'};
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function lockfileWithRootDependency(name) {
  const lockfile = JSON.parse(
    fs.readFileSync(path.join(root, 'package-lock.json'), UTF8));
  lockfile.packages[''].dependencies = {
    ...lockfile.packages[''].dependencies,
    [name]: '1.0.0',
  };
  return `${JSON.stringify(lockfile, null, 2)}\n`;
}

function lockfileWithUnsafeGraphRevision(rawInteger) {
  const lockfile = fs.readFileSync(path.join(root, 'package-lock.json'), UTF8);
  return lockfile.replace('{', `{\n  "graphRevision": ${rawInteger},`);
}

function releaseVersionChanges(lockfile, version) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), UTF8));
  const priorVersionField = `"version": "${manifest.version}"`;
  const nextVersionField = `"version": "${version}"`;
  manifest.version = version;
  return {
    'package.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'package-lock.json': lockfile.replace(priorVersionField, nextVersionField)
      .replace(priorVersionField, nextVersionField),
  };
}

test('a real lockfile dependency change still refuses modular proof', () => {
  const proof = proofFor({
    'package-lock.json': lockfileWithRootDependency('fixture-package'),
  });
  assert.notEqual(proof.status, 0);
  assert.equal(proof.invocation, null);
  assert.ok(proof.output.includes('RELEASE_PROOF_REQUIRED'));
});

test('a malformed changed lockfile fails closed', () => {
  const proof = proofFor({'package-lock.json': '{'});
  assert.notEqual(proof.status, 0);
  assert.equal(proof.invocation, null);
  assert.ok(proof.output.includes('RELEASE_PROOF_REQUIRED'));
});

test('a numerically lossy changed lockfile fails closed', () => {
  const proof = proofFor({
    'package-lock.json': lockfileWithUnsafeGraphRevision('9007199254740993'),
  });
  assert.notEqual(proof.status, 0);
  assert.equal(proof.invocation, null);
  assert.ok(proof.output.includes('RELEASE_PROOF_REQUIRED'));
});

test('unchanged negative-zero graph data fails closed', () => {
  const baselineLockfile = lockfileWithUnsafeGraphRevision('-0');
  const proof = proofFromCommittedBaseline({
    'package-lock.json': baselineLockfile,
  }, releaseVersionChanges(baselineLockfile, '9.9.9'));
  assert.notEqual(proof.status, 0);
  assert.equal(proof.invocation, null);
  assert.ok(proof.output.includes('RELEASE_PROOF_REQUIRED'));
});

test('inherited toJSON cannot hide package or lock graph changes', () => {
  const env = fixtureEnv({preload: objectToJsonPollution});
  for (const changes of [
    {'package.json': withDependency('fixture-package')},
    {'package-lock.json': lockfileWithRootDependency('fixture-package')},
  ]) {
    const proof = proofFor(changes, {env});
    assert.notEqual(proof.status, 0);
    assert.equal(proof.invocation, null,
      'prototype pollution must not admit a dependency change');
    assert.ok(proof.output.includes('RELEASE_PROOF_REQUIRED'));
  }
});
