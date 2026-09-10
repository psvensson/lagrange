import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
  CHECK_BASE_ENV,
  REASON_SAFETY_SPINE,
  SELECTION_WIDENED,
  WORKSPACE_INJECTION_ENV,
} from '../../scripts/checks/change-selection-constants.js';
import {testsForSubsystem} from '../../scripts/check-subsystem.js';
import {
  buildExecutionPlan,
  changedPackageFields,
  lockfileDependencyGraphChanged,
} from '../../scripts/select-change-tests.js';
import {createChangeProofFixture} from './change-proof-fixture.js';

const root = process.cwd();
const UTF8 = 'utf8';
const {
  repo,
  restoreFixture,
  writeChanges,
} = createChangeProofFixture({
  root,
  checkBaseEnvironment: CHECK_BASE_ENV,
  workspaceInjectionEnvironment: WORKSPACE_INJECTION_ENV,
});

function dependencyChanges() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), UTF8));
  const lockfile = JSON.parse(
    fs.readFileSync(path.join(root, 'package-lock.json'), UTF8));
  manifest.dependencies = {...manifest.dependencies, 'fixture-package': '1.0.0'};
  lockfile.packages[''].dependencies = {
    ...lockfile.packages[''].dependencies,
    'fixture-package': '1.0.0',
  };
  return {
    'package.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'package-lock.json': `${JSON.stringify(lockfile, null, 2)}\n`,
  };
}

test('collection pollution cannot remove release-packaging proof', () => {
  const original = Set.prototype.add;
  let plan;
  try {
    Reflect.set(Set.prototype, 'add', function add() {
      return this;
    });
    plan = buildExecutionPlan({
      changedPaths: ['package.json', 'package-lock.json'],
      packageFields: ['version'],
      lockfileGraphChanged: false,
      planRoot: root,
    });
  } finally {
    Reflect.set(Set.prototype, 'add', original);
  }
  const invoked = new Set(plan.tests.map((entry) => entry.path));
  for (const packagingTest of testsForSubsystem('release-packaging')) {
    assert.ok(invoked.has(packagingTest),
      `${packagingTest} must survive collection pollution`);
  }
});

test('post-import intrinsic replacement cannot hide semantic deltas', () => {
  writeChanges(dependencyChanges());
  const replacements = [
    [Set.prototype, 'add', function add() {
      return this;
    }],
    [Set.prototype, Symbol.iterator, function iterator() {
      return {next: () => ({done: true})};
    }],
    [Array.prototype, 'sort', function sort() {
      return [];
    }],
    [Array.prototype, Symbol.iterator, function iterator() {
      return {next: () => ({done: true})};
    }],
    [Object, 'keys', () => []],
    [JSON, 'parse', () => ({})],
  ];
  const results = [];
  try {
    for (const [owner, key, replacement] of replacements) {
      const original = owner[key];
      try {
        Reflect.set(owner, key, replacement);
        results.push({
          fields: changedPackageFields(null, null, repo),
          graph: lockfileDependencyGraphChanged(null, null, repo),
        });
      } finally {
        Reflect.set(owner, key, original);
      }
    }
  } finally {
    restoreFixture();
  }
  for (const result of results) {
    assert.deepEqual(result.fields, ['dependencies']);
    assert.equal(result.graph, true);
  }
});

test('mutable Map methods cannot empty an admitted execution plan', () => {
  const originals = {
    get: Map.prototype.get,
    keys: Map.prototype.keys,
    set: Map.prototype.set,
  };
  let result;
  try {
    Reflect.set(Map.prototype, 'get', () => undefined);
    Reflect.set(Map.prototype, 'keys', () => [][Symbol.iterator]());
    Reflect.set(Map.prototype, 'set', function set() {
      return this;
    });
    result = buildExecutionPlan({
      changedPaths: ['package-lock.json'],
      packageFields: ['version'],
      lockfileGraphChanged: false,
      selector: () => ({
        kind: SELECTION_WIDENED,
        refusals: [],
        subsystems: ['release-packaging'],
        tests: [{path: 'test/release/selected.test.js', reasons: ['selected']}],
      }),
      spine: () => ['test/scripts/spine.test.js'],
    });
  } finally {
    Reflect.set(Map.prototype, 'get', originals.get);
    Reflect.set(Map.prototype, 'keys', originals.keys);
    Reflect.set(Map.prototype, 'set', originals.set);
  }
  assert.deepEqual(result.tests, [
    {path: 'test/release/selected.test.js', reasons: ['selected']},
    {path: 'test/scripts/spine.test.js', reasons: [REASON_SAFETY_SPINE]},
  ]);
});
