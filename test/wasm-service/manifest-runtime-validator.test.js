/**
 * Tests for manifest runtime validator — validates run_export
 * existence and signature checks against WASM module instances.
 *
 * Requirements: 7.1, 7.2, 7.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  RUNTIME_VALIDATION_ERROR_MSG,
  validateRunExportExists,
  validateRunExportSignature,
  validateManifestRuntime,
  validateManifestRuntimeWithAdapter,
} from '../../src/wasm-service/manifest-runtime-validator.js';
import {
  MODULE_MANIFEST_ERROR_MSG as ERR,
  DIGEST_HEX_LENGTH,
} from '../../src/wasm-service/module-manifest-constants.js';

const VALID_DIGEST = 'sha256:' + 'a'.repeat(DIGEST_HEX_LENGTH);
const VALID_DEP_DIGEST = 'sha256:' + 'b'.repeat(DIGEST_HEX_LENGTH);

function makeValidManifest(overrides = {}) {
  return {
    namespace: 'acme',
    name: 'orders-score',
    version: '3.2.0',
    digest: VALID_DIGEST,
    runExport: 'run_batch',
    exports: ['run_batch', 'init', 'teardown'],
    dependencies: [
      {moduleId: 'cap-sql', digest: VALID_DEP_DIGEST},
    ],
    capabilities: ['sql.read', 'sql.write'],
    ...overrides,
  };
}

function makeModuleExports(overrides = {}) {
  return {
    run_batch: function runBatch(_ctx, _batch) {},
    init: function init() {},
    teardown: function teardown() {},
    ...overrides,
  };
}

function makeModuleEntry(overrides = {}) {
  return {
    manifest: makeValidManifest(),
    exports: makeModuleExports(),
    ...overrides,
  };
}

function makeRuntimeAdapter(overrides = {}) {
  return {
    async createInstance() {
      return {
        instanceHandle: {
          instanceId: 'inst-1',
          moduleRef: 'mod-1',
        },
      };
    },
    async inspect() {
      return {exportNames: ['run_batch', 'init', 'teardown']};
    },
    async destroyInstance() {
      return {destroyed: true};
    },
    ...overrides,
  };
}

// --- validateRunExportExists ---

test('validateRunExportExists - valid export', (t) => {
  const exports_ = makeModuleExports();
  const result = validateRunExportExists(exports_, 'run_batch');
  t.ok(result.valid);
  t.equal(result.errors.length, 0);
  t.end();
});

test('validateRunExportExists - null moduleExports', (t) => {
  const result = validateRunExportExists(null, 'run_batch');
  t.notOk(result.valid);
  t.ok(result.errors.includes(ERR.MODULE_INSTANCE_REQUIRED));
  t.end();
});

test('validateRunExportExists - empty runExportName', (t) => {
  const exports_ = makeModuleExports();
  const result = validateRunExportExists(exports_, '');
  t.notOk(result.valid);
  t.ok(result.errors.includes(ERR.RUN_EXPORT_REQUIRED));
  t.end();
});

test('validateRunExportExists - missing export', (t) => {
  const exports_ = makeModuleExports();
  const result = validateRunExportExists(
    exports_, 'nonexistent_fn',
  );
  t.notOk(result.valid);
  t.ok(result.errors.includes(ERR.RUN_EXPORT_MISSING_IN_MODULE));
  t.end();
});

test('validateRunExportExists - export is not function', (t) => {
  const exports_ = {run_batch: 42};
  const result = validateRunExportExists(exports_, 'run_batch');
  t.notOk(result.valid);
  t.ok(result.errors.includes(ERR.RUN_EXPORT_NOT_FUNCTION));
  t.end();
});

// --- validateRunExportSignature ---

test('validateRunExportSignature - valid 2-param', (t) => {
  const fn = function run(_ctx, _batch) {};
  const result = validateRunExportSignature(fn);
  t.ok(result.valid);
  t.equal(result.errors.length, 0);
  t.end();
});

test('validateRunExportSignature - valid 3-param', (t) => {
  const fn = function run(_ctx, _batch, _opts) {};
  const result = validateRunExportSignature(fn);
  t.ok(result.valid);
  t.equal(result.errors.length, 0);
  t.end();
});

test('validateRunExportSignature - too few params', (t) => {
  const fn = function run(_ctx) {};
  const result = validateRunExportSignature(fn);
  t.notOk(result.valid);
  t.ok(result.errors.includes(ERR.RUN_EXPORT_SIGNATURE_MISMATCH));
  t.end();
});

test('validateRunExportSignature - too many params', (t) => {
  const fn = function run(_a, _b, _c, _d) {};
  const result = validateRunExportSignature(fn);
  t.notOk(result.valid);
  t.ok(result.errors.includes(ERR.RUN_EXPORT_SIGNATURE_MISMATCH));
  t.end();
});

test('validateRunExportSignature - not a function', (t) => {
  const result = validateRunExportSignature('not-fn');
  t.notOk(result.valid);
  t.ok(result.errors.includes(ERR.RUN_EXPORT_NOT_FUNCTION));
  t.end();
});

// --- validateManifestRuntime (full pipeline) ---

test('validateManifestRuntime - full valid pipeline', (t) => {
  const manifest = makeValidManifest();
  const exports_ = makeModuleExports();
  const result = validateManifestRuntime(manifest, exports_);
  t.ok(result.valid);
  t.equal(result.errors.length, 0);
  t.end();
});

test('validateManifestRuntime - null manifest', (t) => {
  const exports_ = makeModuleExports();
  const result = validateManifestRuntime(null, exports_);
  t.notOk(result.valid);
  t.ok(result.errors.includes(ERR.MANIFEST_REQUIRED));
  t.end();
});

test('validateManifestRuntime - null moduleExports', (t) => {
  const manifest = makeValidManifest();
  const result = validateManifestRuntime(manifest, null);
  t.notOk(result.valid);
  t.ok(result.errors.includes(ERR.MODULE_INSTANCE_REQUIRED));
  t.end();
});

test('validateManifestRuntime - invalid manifest struct', (t) => {
  const manifest = makeValidManifest({namespace: ''});
  const exports_ = makeModuleExports();
  const result = validateManifestRuntime(manifest, exports_);
  t.notOk(result.valid);
  t.ok(result.errors.includes(ERR.NAMESPACE_REQUIRED));
  t.end();
});

test('validateManifestRuntime - run_export missing in module',
  (t) => {
    const manifest = makeValidManifest();
    const exports_ = {init: function init() {}};
    const result = validateManifestRuntime(manifest, exports_);
    t.notOk(result.valid);
    t.ok(
      result.errors.includes(ERR.RUN_EXPORT_MISSING_IN_MODULE),
    );
    t.end();
  });

test('validateManifestRuntime - run_export bad signature', (t) => {
  const manifest = makeValidManifest();
  const exports_ = makeModuleExports({
    run_batch: function badSig(_a) {},
  });
  const result = validateManifestRuntime(manifest, exports_);
  t.notOk(result.valid);
  t.ok(
    result.errors.includes(ERR.RUN_EXPORT_SIGNATURE_MISMATCH),
  );
  t.end();
});

test('validateManifestRuntime - 3-param export passes', (t) => {
  const manifest = makeValidManifest();
  const exports_ = makeModuleExports({
    run_batch: function run(_ctx, _batch, _opts) {},
  });
  const result = validateManifestRuntime(manifest, exports_);
  t.ok(result.valid);
  t.equal(result.errors.length, 0);
  t.end();
});

test('validateManifestRuntimeWithAdapter - valid runtime instance' +
  ' verification', async (t) => {
  const manifest = makeValidManifest();
  const moduleEntry = makeModuleEntry({manifest});
  const runtimeAdapter = makeRuntimeAdapter();
  const result = await validateManifestRuntimeWithAdapter(
    manifest,
    moduleEntry,
    runtimeAdapter,
    'mod-runtime',
  );
  t.ok(result.valid);
  t.equal(result.errors.length, 0);
  t.end();
});

test('validateManifestRuntimeWithAdapter - rejects missing adapter' +
  ' methods', async (t) => {
  const manifest = makeValidManifest();
  const moduleEntry = makeModuleEntry({manifest});
  const result = await validateManifestRuntimeWithAdapter(
    manifest,
    moduleEntry,
    {},
    'mod-runtime',
  );
  t.notOk(result.valid);
  t.ok(result.errors.includes(
    RUNTIME_VALIDATION_ERROR_MSG.ADAPTER_REQUIRED,
  ));
  t.end();
});

test('validateManifestRuntimeWithAdapter - rejects when inspect' +
  ' export list misses run_export', async (t) => {
  const manifest = makeValidManifest();
  const moduleEntry = makeModuleEntry({manifest});
  const runtimeAdapter = makeRuntimeAdapter({
    async inspect() {
      return {exportNames: ['init', 'teardown']};
    },
  });
  const result = await validateManifestRuntimeWithAdapter(
    manifest,
    moduleEntry,
    runtimeAdapter,
    'mod-runtime',
  );
  t.notOk(result.valid);
  t.ok(result.errors.includes(ERR.RUN_EXPORT_MISSING_IN_MODULE));
  t.end();
});


// ─── Additional coverage for Req 7.3 ────────────────────────

import fc from 'fast-check';

test('validateRunExportExists - non-object moduleExports', (t) => {
  const result = validateRunExportExists('not-object', 'run');
  t.notOk(result.valid);
  t.ok(result.errors.includes(ERR.MODULE_INSTANCE_REQUIRED));
  t.end();
});

test('validateManifestRuntime - non-object moduleExports', (t) => {
  const manifest = makeValidManifest();
  const result = validateManifestRuntime(manifest, 'string');
  t.notOk(result.valid);
  t.ok(result.errors.includes(ERR.MODULE_INSTANCE_REQUIRED));
  t.end();
});

test('validateRunExportExists - null runExportName', (t) => {
  const exports_ = makeModuleExports();
  const result = validateRunExportExists(exports_, null);
  t.notOk(result.valid);
  t.ok(result.errors.includes(ERR.RUN_EXPORT_REQUIRED));
  t.end();
});

test('validateRunExportSignature - zero params rejected', (t) => {
  const fn = function run() {};
  const result = validateRunExportSignature(fn);
  t.notOk(result.valid);
  t.ok(result.errors.includes(ERR.RUN_EXPORT_SIGNATURE_MISMATCH));
  t.end();
});

// ─── PBT: run_export signature validation (Req 7.3) ─────────

test('PBT: valid param counts pass signature check', (t) => {
  /**
   * **Validates: Requirements 7.3**
   */
  const makeFn = (paramCount) => {
    if (paramCount === 2) return function f(_a, _b) {};
    return function f(_a, _b, _c) {};
  };
  fc.assert(
    fc.property(
      fc.constantFrom(2, 3),
      (paramCount) => {
        const fn = makeFn(paramCount);
        const result = validateRunExportSignature(fn);
        return result.valid === true &&
          result.errors.length === 0;
      },
    ),
    {numRuns: 10},
  );
  t.pass('valid param counts pass signature check');
  t.end();
});

test('PBT: invalid param counts fail signature check', (t) => {
  /**
   * **Validates: Requirements 7.3**
   */
  const makeFn = (paramCount) => {
    return new Function(...Array.from(
      {length: paramCount}, (_, i) => `_p${i}`,
    ), 'return;');
  };
  fc.assert(
    fc.property(
      fc.oneof(
        fc.constant(0),
        fc.constant(1),
        fc.integer({min: 4, max: 10}),
      ),
      (paramCount) => {
        const fn = makeFn(paramCount);
        const result = validateRunExportSignature(fn);
        return result.valid === false &&
          result.errors.includes(
            ERR.RUN_EXPORT_SIGNATURE_MISMATCH,
          );
      },
    ),
    {numRuns: 10},
  );
  t.pass('invalid param counts fail signature check');
  t.end();
});

test('PBT: full pipeline rejects missing run_export', (t) => {
  /**
   * **Validates: Requirements 7.3**
   */
  fc.assert(
    fc.property(
      fc.string({minLength: 1, maxLength: 20}).filter(
        (s) => s !== 'run_batch' && s !== 'init' &&
          s !== 'teardown',
      ),
      (badExportName) => {
        const manifest = makeValidManifest({
          runExport: badExportName,
          exports: [badExportName],
        });
        const exports_ = makeModuleExports();
        const result = validateManifestRuntime(
          manifest, exports_,
        );
        return result.valid === false;
      },
    ),
    {numRuns: 10},
  );
  t.pass('pipeline rejects missing run_export');
  t.end();
});
