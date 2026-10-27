/**
 * Accretion guard for the legacy partition_callback execution axis.
 *
 * The callback-axis-retirement epic (solve/epics/callback-axis-retirement.md)
 * freezes the axis: it stays green for its existing chain but no NEW
 * production code may depend on it, so rung-4 deletion scope stays equal to
 * the sealed census. This suite fails when a src/ file outside the sealed
 * allowlist references an axis token, or when production code instantiates
 * WasmCallAdapter (today it is export-only with test consumers).
 *
 * If this test fails because a file was legitimately added to the axis
 * chain, that is an epic-level decision: update the allowlist AND the
 * epic's decision log in the same change.
 */

import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';

const SRC_ROOT = new URL('../../src', import.meta.url).pathname;
const JS_SUFFIX = '.js';

const AXIS_TOKEN_PATTERN = new RegExp(
  [
    'partition_callback',
    'partitionCallback',
    'PARTITION_CALLBACK',
    'js_wasm_component_v1',
    'CallbackExecutionHost',
    'callback-execution-host',
    'WasmCallAdapter',
    'wasm-call-adapter',
    'query/callback',
    '/callback/',
    'PartitionCallback',
    'CallbackStageExecutor',
    'CallbackRuntimeDriverRegistry',
    'CallbackDriver',
    'buildCallbackContext',
    'CallbackModuleArtifact',
    'JsWasmComponentArtifact',
  ].join('|'),
  'u',
);

const PRODUCTION_INSTANTIATION_PATTERN = /new\s+WasmCallAdapter\s*\(/u;

// The legacy partition_callback execution axis has been retired (epic
// solve/epics/callback-axis-retirement.md, rung 4). Zero production files
// may reference any axis token.
const AXIS_ALLOWLIST = new Set([]);

// Internal helper files of the axis chain may reference each other freely;
// everything under query/callback/ is axis-internal by definition.
const AXIS_INTERNAL_PREFIX = 'query/callback/';

function listSourceFiles(root) {
  const files = [];
  const stack = [''];
  while (stack.length > 0) {
    const relative = stack.pop();
    const absolute = join(root, relative);
    for (const entry of readdirSync(absolute, {withFileTypes: true})) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        stack.push(childRelative);
      } else if (entry.name.endsWith(JS_SUFFIX)) {
        files.push(childRelative);
      }
    }
  }
  return files;
}

function isAllowlisted(relativePath) {
  return AXIS_ALLOWLIST.has(relativePath) ||
    relativePath.startsWith(AXIS_INTERNAL_PREFIX);
}

test('no production file outside the sealed chain references the callback axis',
  async () => {
    const offenders = [];
    for (const relativePath of listSourceFiles(SRC_ROOT)) {
      if (isAllowlisted(relativePath)) continue;
      const content = readFileSync(join(SRC_ROOT, relativePath), 'utf8');
      if (AXIS_TOKEN_PATTERN.test(content)) {
        offenders.push(relativePath);
      }
    }
    assert.deepStrictEqual(
      offenders,
      [],
      'new production dependencies accreted onto the legacy callback axis; ' +
      'see solve/epics/callback-axis-retirement.md before extending the ' +
      'allowlist',
    );
  });

test('every sealed allowlist entry still references the axis (census fresh)',
  async () => {
    const stale = [];
    for (const relativePath of AXIS_ALLOWLIST) {
      const content = readFileSync(join(SRC_ROOT, relativePath), 'utf8');
      if (!AXIS_TOKEN_PATTERN.test(content)) {
        stale.push(relativePath);
      }
    }
    assert.deepStrictEqual(
      stale,
      [],
      'allowlisted files no longer reference the axis; shrink the ' +
      'allowlist so retirement scope stays equal to the real census',
    );
  });

test('WasmCallAdapter has zero production instantiations', async () => {
  const offenders = [];
  for (const relativePath of listSourceFiles(SRC_ROOT)) {
    const content = readFileSync(join(SRC_ROOT, relativePath), 'utf8');
    if (PRODUCTION_INSTANTIATION_PATTERN.test(content)) {
      offenders.push(relativePath);
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    'WasmCallAdapter gained a production consumer; the ' +
    'callback-axis-retirement epic assumes it is test-only (absorb or ' +
    'delete it in rung 1)',
  );
});
