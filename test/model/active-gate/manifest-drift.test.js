// Phase D - drift lint. The action manifest is the single source of truth;
// the executable fast-check model, the fast-check command set, and the TLA+
// spec must all render exactly the same state variables and actions. If any
// surface drifts from the manifest this test fails, forcing the divergence to
// be reconciled rather than silently accumulating.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  STATE_VARIABLES,
  ACTION_NAMES,
} from './model.js';
import {COMMAND_CLASSES} from './commands.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const MANIFEST_PATH = path.join(
  REPO_ROOT, 'models', 'active-gate', 'action-manifest.json',
);
const TLA_PATH = path.join(REPO_ROOT, 'models', 'active-gate', 'ActiveGate.tla');

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const tlaSource = fs.readFileSync(TLA_PATH, 'utf8');

function sorted(values) {
  return [...values].sort();
}

test('manifest is the canonical action/state source of truth', () => {
  assert.ok(Array.isArray(manifest.actions) && manifest.actions.length > 0);
  assert.ok(
    Array.isArray(manifest.stateVariables) &&
    manifest.stateVariables.length > 0,
  );
});

test('executable model matches the manifest', () => {
  assert.deepEqual(sorted(ACTION_NAMES), sorted(manifest.actions));
  assert.deepEqual(sorted(STATE_VARIABLES), sorted(manifest.stateVariables));
});

test('fast-check command set matches the manifest', () => {
  assert.deepEqual(sorted(Object.keys(COMMAND_CLASSES)), sorted(manifest.actions));
});

test('progress and regression actions partition the manifest actions', () => {
  const progress = manifest.progressActions || [];
  const regression = manifest.regressionActions || [];
  assert.deepEqual(
    sorted([...progress, ...regression]),
    sorted(manifest.actions),
    'every action must be classified as progress or regression exactly once',
  );
  for (const action of progress) {
    assert.ok(!regression.includes(action), `${action} cannot be both`);
  }
});

test('TLA+ spec declares each manifest action operator', () => {
  for (const action of manifest.actions) {
    const operatorPattern = new RegExp(`\\b${action}\\b`);
    assert.match(
      tlaSource,
      operatorPattern,
      `ActiveGate.tla is missing action ${action}`,
    );
  }
});

test('TLA+ spec declares each manifest state variable', () => {
  const variablesLine = tlaSource.match(/VARIABLES([^\n]*)/);
  assert.ok(variablesLine, 'ActiveGate.tla must declare VARIABLES');
  for (const variable of manifest.stateVariables) {
    assert.match(
      variablesLine[1],
      new RegExp(`\\b${variable}\\b`),
      `ActiveGate.tla VARIABLES is missing ${variable}`,
    );
  }
});

test('TLA+ spec declares each manifest safety invariant', () => {
  for (const invariant of manifest.safetyInvariants || []) {
    assert.match(
      tlaSource,
      new RegExp(`\\b${invariant}\\b`),
      `ActiveGate.tla is missing invariant ${invariant}`,
    );
  }
});

test('model binds to the real reducer oracle named in the manifest', () => {
  const oracle = manifest.realReducerOracle || {};
  assert.ok(oracle.function, 'manifest must name the real reducer function');
  const modelSource = fs.readFileSync(path.join(HERE, 'model.js'), 'utf8');
  assert.match(
    modelSource,
    new RegExp(`\\b${oracle.function}\\b`),
    `model.js must import the real reducer ${oracle.function}`,
  );
});
