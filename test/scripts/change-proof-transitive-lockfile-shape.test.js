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
const {proofFromCommittedBaseline} = createChangeProofFixture({
  root,
  checkBaseEnvironment: CHECK_BASE_ENV,
  workspaceInjectionEnvironment: WORKSPACE_INJECTION_ENV,
});

test('a transitive package array makes lock graph comparison unavailable', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), UTF8));
  const lockfile = JSON.parse(
    fs.readFileSync(path.join(root, 'package-lock.json'), UTF8));
  const transitivePath = Object.keys(lockfile.packages)
    .find((candidate) => candidate !== '');
  assert.ok(transitivePath, 'fixture lockfile needs a transitive package row');
  lockfile.packages[transitivePath] = [];
  const baselineLockfile = `${JSON.stringify(lockfile, null, 2)}\n`;
  manifest.version = '9.9.9';
  lockfile.version = '9.9.9';
  lockfile.packages[''].version = '9.9.9';
  const proof = proofFromCommittedBaseline({
    'package-lock.json': baselineLockfile,
  }, {
    'package.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'package-lock.json': `${JSON.stringify(lockfile, null, 2)}\n`,
  });
  assert.notEqual(proof.status, 0);
  assert.equal(proof.invocation, null);
  assert.ok(proof.output.includes('RELEASE_PROOF_REQUIRED'));
});
