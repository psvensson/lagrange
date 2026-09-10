import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
  CHECK_BASE_ENV,
  WORKSPACE_INJECTION_ENV,
} from '../../scripts/checks/change-selection-constants.js';
import {lockfileDependencyGraphChanged} from '../../scripts/select-change-tests.js';
import {createChangeProofFixture} from './change-proof-fixture.js';

const root = process.cwd();
const UTF8 = 'utf8';
const {
  fixtureEnv,
  objectToJsonPollution,
  proofFor,
  repo,
  restoreFixture,
  writeChanges,
} = createChangeProofFixture({
  root,
  checkBaseEnvironment: CHECK_BASE_ENV,
  workspaceInjectionEnvironment: WORKSPACE_INJECTION_ENV,
});

function proofWithPollution(changes, pollutionSource) {
  fs.writeFileSync(objectToJsonPollution, pollutionSource, UTF8);
  return proofFor(changes, {
    env: fixtureEnv({preload: objectToJsonPollution}),
  });
}

function assertReleaseRefusal(proof) {
  assert.notEqual(proof.status, 0);
  assert.equal(proof.invocation, null);
  assert.ok(proof.output.includes('RELEASE_PROOF_REQUIRED'));
}

test('inherited dependencies cannot replace deleted package authority', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), UTF8));
  const dependencies = manifest.dependencies;
  delete manifest.dependencies;
  const proof = proofWithPollution({
    'package.json': `${JSON.stringify(manifest, null, 2)}\n`,
  },
  'Object.defineProperty(Object.prototype, \'dependencies\', {' +
    `value: ${JSON.stringify(dependencies)}, enumerable: true});\n`);
  assertReleaseRefusal(proof);
});

test('inherited packages cannot replace deleted lock graph authority', () => {
  const lockfile = JSON.parse(
    fs.readFileSync(path.join(root, 'package-lock.json'), UTF8));
  const packages = lockfile.packages;
  delete lockfile.packages;
  const proof = proofWithPollution({
    'package-lock.json': `${JSON.stringify(lockfile, null, 2)}\n`,
  },
  'Object.defineProperty(Object.prototype, \'packages\', {' +
    `value: ${JSON.stringify(packages)}, enumerable: true});\n`);
  assertReleaseRefusal(proof);
});

test('an inherited root row cannot replace deleted lock graph authority', () => {
  const lockfile = JSON.parse(
    fs.readFileSync(path.join(root, 'package-lock.json'), UTF8));
  const rootRow = lockfile.packages[''];
  delete lockfile.packages[''];
  const proof = proofWithPollution({
    'package-lock.json': `${JSON.stringify(lockfile, null, 2)}\n`,
  },
  'Object.defineProperty(Object.prototype, \'\', {' +
    `value: ${JSON.stringify(rootRow)}, enumerable: true});\n`);
  assertReleaseRefusal(proof);
});

test('a missing own lock graph never evaluates an inherited accessor', () => {
  const lockfile = JSON.parse(
    fs.readFileSync(path.join(root, 'package-lock.json'), UTF8));
  delete lockfile.packages[''];
  writeChanges({
    'package-lock.json': `${JSON.stringify(lockfile, null, 2)}\n`,
  });
  const original = Object.getOwnPropertyDescriptor(
    Object.prototype, '');
  let reads = 0;
  let changed;
  try {
    Reflect.defineProperty(Object.prototype, '', {
      configurable: true,
      enumerable: false,
      get() {
        reads += 1;
        throw new Error('accessor executed');
      },
    });
    changed = lockfileDependencyGraphChanged(null, null, repo);
  } finally {
    if (original) {
      Reflect.defineProperty(Object.prototype, '', original);
    } else {
      Reflect.deleteProperty(Object.prototype, '');
    }
    restoreFixture();
  }
  assert.equal(changed, null);
  assert.equal(reads, 0);
});
