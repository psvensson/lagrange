/**
 * Tests for callback validator — runtime callback signature
 * and validation for async WASM entry exports.
 *
 * Requirements: 4.3, 4.5, 7.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  validateCallbackDescriptor,
  validateCallbackSignature,
  validateCallbackAgainstManifest,
  validateCallback,
  isAsyncFunction,
} from '../../src/query/callback-validator.js';
import {
  CALLBACK_ERROR_MSG,
} from '../../src/query/callback-constants.js';

// --- isAsyncFunction ---

test('isAsyncFunction - returns true for async function', (t) => {
  const fn = async (_ctx, _batch) => {};
  t.ok(isAsyncFunction(fn));
  t.end();
});

test('isAsyncFunction - returns false for sync function', (t) => {
  const fn = (_ctx, _batch) => {};
  t.notOk(isAsyncFunction(fn));
  t.end();
});

test('isAsyncFunction - returns false for non-function', (t) => {
  t.notOk(isAsyncFunction('not a function'));
  t.notOk(isAsyncFunction(null));
  t.notOk(isAsyncFunction(42));
  t.end();
});

// --- validateCallbackDescriptor ---

test('validateCallbackDescriptor - valid descriptor', (t) => {
  const result = validateCallbackDescriptor({
    moduleRef: 'mod-1',
    exportName: 'run_batch',
  });
  t.ok(result.valid);
  t.equal(result.errors.length, 0);
  t.end();
});

test('validateCallbackDescriptor - null descriptor', (t) => {
  const result = validateCallbackDescriptor(null);
  t.notOk(result.valid);
  t.ok(result.errors.length >= 2);
  t.end();
});

test('validateCallbackDescriptor - missing moduleRef', (t) => {
  const result = validateCallbackDescriptor({
    exportName: 'run_batch',
  });
  t.notOk(result.valid);
  t.ok(result.errors.includes(
    CALLBACK_ERROR_MSG.MODULE_REF_REQUIRED,
  ));
  t.end();
});

test('validateCallbackDescriptor - missing exportName', (t) => {
  const result = validateCallbackDescriptor({
    moduleRef: 'mod-1',
  });
  t.notOk(result.valid);
  t.ok(result.errors.includes(
    CALLBACK_ERROR_MSG.EXPORT_NAME_REQUIRED,
  ));
  t.end();
});

// --- validateCallbackSignature ---

test('validateCallbackSignature - valid async 2-param', (t) => {
  const fn = async function run(_ctx, _batch) {};
  const result = validateCallbackSignature(fn, 'run');
  t.ok(result.valid);
  t.equal(result.errors.length, 0);
  t.end();
});

test('validateCallbackSignature - valid async 3-param', (t) => {
  const fn = async function run(_ctx, _batch, _opts) {};
  const result = validateCallbackSignature(fn, 'run');
  t.ok(result.valid);
  t.equal(result.errors.length, 0);
  t.end();
});

test('validateCallbackSignature - rejects null export', (t) => {
  const result = validateCallbackSignature(null, 'run');
  t.notOk(result.valid);
  t.ok(result.errors.includes(
    CALLBACK_ERROR_MSG.EXPORT_NOT_FOUND,
  ));
  t.end();
});

test('validateCallbackSignature - rejects non-function', (t) => {
  const result = validateCallbackSignature('not-fn', 'run');
  t.notOk(result.valid);
  t.ok(result.errors.includes(
    CALLBACK_ERROR_MSG.EXPORT_NOT_FUNCTION,
  ));
  t.end();
});

test('validateCallbackSignature - rejects sync function', (t) => {
  const fn = function run(_ctx, _batch) {};
  const result = validateCallbackSignature(fn, 'run');
  t.notOk(result.valid);
  t.ok(result.errors.includes(
    CALLBACK_ERROR_MSG.EXPORT_NOT_ASYNC,
  ));
  t.end();
});

test('validateCallbackSignature - rejects too few params', (t) => {
  const fn = async function run(_ctx) {};
  const result = validateCallbackSignature(fn, 'run');
  t.notOk(result.valid);
  t.ok(result.errors.includes(
    CALLBACK_ERROR_MSG.PARAM_COUNT_TOO_FEW,
  ));
  t.end();
});

test('validateCallbackSignature - rejects too many params', (t) => {
  const fn = async function run(_a, _b, _c, _d) {};
  const result = validateCallbackSignature(fn, 'run');
  t.notOk(result.valid);
  t.ok(result.errors.includes(
    CALLBACK_ERROR_MSG.PARAM_COUNT_TOO_MANY,
  ));
  t.end();
});

// --- validateCallbackAgainstManifest ---

test('validateCallbackAgainstManifest - valid match', (t) => {
  const manifest = {
    runExport: 'run_batch',
    exports: ['run_batch', 'init'],
  };
  const result = validateCallbackAgainstManifest(
    'run_batch', manifest,
  );
  t.ok(result.valid);
  t.equal(result.errors.length, 0);
  t.end();
});

test('validateCallbackAgainstManifest - null manifest', (t) => {
  const result = validateCallbackAgainstManifest('run', null);
  t.notOk(result.valid);
  t.ok(result.errors.includes(
    CALLBACK_ERROR_MSG.MANIFEST_REQUIRED,
  ));
  t.end();
});

test('validateCallbackAgainstManifest - export not declared', (t) => {
  const manifest = {
    runExport: 'run_batch',
    exports: ['run_batch'],
  };
  const result = validateCallbackAgainstManifest(
    'unknown_fn', manifest,
  );
  t.notOk(result.valid);
  t.ok(result.errors.includes(
    CALLBACK_ERROR_MSG.EXPORT_NOT_FOUND,
  ));
  t.end();
});

test('validateCallbackAgainstManifest - run_export mismatch', (t) => {
  const manifest = {
    runExport: 'run_batch',
    exports: ['run_batch', 'other_fn'],
  };
  const result = validateCallbackAgainstManifest(
    'other_fn', manifest,
  );
  t.notOk(result.valid);
  t.ok(result.errors.includes(
    CALLBACK_ERROR_MSG.RUN_EXPORT_MISMATCH,
  ));
  t.end();
});

// --- validateCallback (full pipeline) ---

test('validateCallback - full valid pipeline', (t) => {
  const descriptor = {
    moduleRef: 'mod-1',
    exportName: 'run_batch',
  };
  const manifest = {
    runExport: 'run_batch',
    exports: ['run_batch'],
  };
  const fn = async function runBatch(_ctx, _batch) {};
  const result = validateCallback(descriptor, manifest, fn);
  t.ok(result.valid);
  t.equal(result.errors.length, 0);
  t.end();
});

test('validateCallback - fails on bad descriptor', (t) => {
  const result = validateCallback(null, {}, async () => {});
  t.notOk(result.valid);
  t.ok(result.errors.length > 0);
  t.end();
});

test('validateCallback - aggregates manifest + sig errors', (t) => {
  const descriptor = {
    moduleRef: 'mod-1',
    exportName: 'wrong_fn',
  };
  const manifest = {
    runExport: 'run_batch',
    exports: ['run_batch'],
  };
  const fn = function syncFn(_ctx, _batch) {};
  const result = validateCallback(descriptor, manifest, fn);
  t.notOk(result.valid);
  // Should have errors from both manifest and signature checks
  t.ok(result.errors.length >= 2);
  t.end();
});
