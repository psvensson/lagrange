/**
 * Tests for capability policy enforcement — tenant/service
 * allowlists for WASM module capabilities.
 *
 * Requirements: 8.2, 8.3
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {
  isCapabilityAllowed,
  enforceCapabilityPolicy,
  buildCapabilityImports,
  checkUndeclaredCapabilities,
} from '../../src/wasm-service/capability-policy.js';
import {
  MODULE_MANIFEST_ERROR_MSG as ERR,
  DIGEST_HEX_LENGTH,
} from '../../src/wasm-service/module-manifest-constants.js';

const VALID_DIGEST = 'sha256:' + 'a'.repeat(DIGEST_HEX_LENGTH);

function makeManifest(overrides = {}) {
  return {
    moduleId: 'test-mod',
    version: '1.0.0',
    digest: VALID_DIGEST,
    runExport: 'run',
    exports: ['run'],
    dependencies: [],
    capabilities: ['sql.read', 'sql.write', 'kv.session'],
    ...overrides,
  };
}

function makePolicy(overrides = {}) {
  return {
    allowedCapabilities: [
      'sql.read', 'sql.write', 'kv.session',
    ],
    ...overrides,
  };
}

// --- isCapabilityAllowed ---

test('isCapabilityAllowed - allowed capability', (t) => {
  t.ok(isCapabilityAllowed('sql.read', ['sql.read', 'kv.session']));
  t.end();
});

test('isCapabilityAllowed - denied capability', (t) => {
  t.notOk(isCapabilityAllowed('net.http', ['sql.read']));
  t.end();
});

test('isCapabilityAllowed - null allowlist', (t) => {
  t.notOk(isCapabilityAllowed('sql.read', null));
  t.end();
});

// --- enforceCapabilityPolicy ---

test('enforceCapabilityPolicy - all allowed', (t) => {
  const result = enforceCapabilityPolicy(
    makeManifest(), makePolicy()
  );
  t.ok(result.valid);
  t.equal(result.errors.length, 0);
  t.equal(result.allowed.length, 3);
  t.equal(result.denied.length, 0);
  t.end();
});

test('enforceCapabilityPolicy - partial denial', (t) => {
  const policy = makePolicy({
    allowedCapabilities: ['sql.read'],
  });
  const result = enforceCapabilityPolicy(
    makeManifest(), policy
  );
  t.notOk(result.valid);
  t.equal(result.allowed.length, 1);
  t.equal(result.denied.length, 2);
  t.ok(result.denied.includes('sql.write'));
  t.ok(result.denied.includes('kv.session'));
  t.end();
});

test('enforceCapabilityPolicy - null manifest', (t) => {
  const result = enforceCapabilityPolicy(null, makePolicy());
  t.notOk(result.valid);
  t.ok(result.errors.includes(ERR.MANIFEST_REQUIRED));
  t.end();
});

test('enforceCapabilityPolicy - null policy', (t) => {
  const result = enforceCapabilityPolicy(makeManifest(), null);
  t.notOk(result.valid);
  t.ok(result.errors.includes(ERR.POLICY_REQUIRED));
  t.end();
});

test('enforceCapabilityPolicy - no capabilities', (t) => {
  const manifest = makeManifest({capabilities: []});
  const result = enforceCapabilityPolicy(manifest, makePolicy());
  t.ok(result.valid);
  t.equal(result.allowed.length, 0);
  t.equal(result.denied.length, 0);
  t.end();
});

// --- buildCapabilityImports ---

test('buildCapabilityImports - injects allowed only', (t) => {
  const modules = {
    'sql.read': {exec: () => {}},
    'sql.write': {exec: () => {}},
    'kv.session': {exec: () => {}},
    'net.http': {exec: () => {}},
  };
  const result = buildCapabilityImports(
    makeManifest(), makePolicy(), modules
  );
  t.equal(Object.keys(result.imports).length, 3);
  t.ok('sql.read' in result.imports);
  t.ok('sql.write' in result.imports);
  t.ok('kv.session' in result.imports);
  t.notOk('net.http' in result.imports);
  t.equal(result.errors.length, 0);
  t.end();
});

test('buildCapabilityImports - denied caps produce errors', (t) => {
  const policy = makePolicy({
    allowedCapabilities: ['sql.read'],
  });
  const modules = {
    'sql.read': {exec: () => {}},
    'sql.write': {exec: () => {}},
  };
  const result = buildCapabilityImports(
    makeManifest(), policy, modules
  );
  t.equal(Object.keys(result.imports).length, 1);
  t.ok('sql.read' in result.imports);
  t.ok(result.errors.length > 0);
  t.end();
});

test('buildCapabilityImports - null manifest', (t) => {
  const result = buildCapabilityImports(null, makePolicy(), {});
  t.ok(result.errors.includes(ERR.MANIFEST_REQUIRED));
  t.equal(Object.keys(result.imports).length, 0);
  t.end();
});

test('buildCapabilityImports - null policy', (t) => {
  const result = buildCapabilityImports(
    makeManifest(), null, {}
  );
  t.ok(result.errors.includes(ERR.POLICY_REQUIRED));
  t.end();
});

test('buildCapabilityImports - missing module impl', (t) => {
  const result = buildCapabilityImports(
    makeManifest(), makePolicy(), {}
  );
  t.equal(Object.keys(result.imports).length, 0);
  t.equal(result.errors.length, 0);
  t.end();
});

// --- checkUndeclaredCapabilities ---

test('checkUndeclaredCapabilities - all declared', (t) => {
  const manifest = makeManifest();
  const result = checkUndeclaredCapabilities(
    ['sql.read', 'kv.session'], manifest
  );
  t.ok(result.valid);
  t.equal(result.undeclared.length, 0);
  t.end();
});

test('checkUndeclaredCapabilities - undeclared cap', (t) => {
  const manifest = makeManifest();
  const result = checkUndeclaredCapabilities(
    ['sql.read', 'net.http'], manifest
  );
  t.notOk(result.valid);
  t.equal(result.undeclared.length, 1);
  t.ok(result.undeclared.includes('net.http'));
  t.ok(result.errors.includes(ERR.CAPABILITY_NOT_DECLARED));
  t.end();
});

test('checkUndeclaredCapabilities - null manifest', (t) => {
  const result = checkUndeclaredCapabilities(['sql.read'], null);
  t.notOk(result.valid);
  t.ok(result.errors.includes(ERR.MANIFEST_REQUIRED));
  t.end();
});

test('checkUndeclaredCapabilities - empty request', (t) => {
  const result = checkUndeclaredCapabilities([], makeManifest());
  t.ok(result.valid);
  t.equal(result.undeclared.length, 0);
  t.end();
});


// ─── Additional coverage for Req 8.2 ────────────────────────

import fc from 'fast-check';

test('isCapabilityAllowed - empty allowlist', (t) => {
  t.notOk(isCapabilityAllowed('sql.read', []));
  t.end();
});

test('enforceCapabilityPolicy - all denied', (t) => {
  const manifest = makeManifest();
  const policy = makePolicy({allowedCapabilities: []});
  const result = enforceCapabilityPolicy(manifest, policy);
  t.notOk(result.valid);
  t.equal(result.allowed.length, 0);
  t.equal(result.denied.length, 3);
  t.end();
});

test('buildCapabilityImports - null availableModules', (t) => {
  const result = buildCapabilityImports(
    makeManifest(), makePolicy(), null
  );
  t.equal(Object.keys(result.imports).length, 0);
  t.equal(result.errors.length, 0);
  t.end();
});

test('checkUndeclaredCapabilities - all undeclared', (t) => {
  const manifest = makeManifest({capabilities: []});
  const result = checkUndeclaredCapabilities(
    ['net.http', 'fs.write'], manifest
  );
  t.notOk(result.valid);
  t.equal(result.undeclared.length, 2);
  t.end();
});

// ─── PBT: capability allowlist enforcement (Req 8.2) ────────

test('PBT: allowed capabilities pass policy', (t) => {
  /**
   * **Validates: Requirements 8.2**
   */
  const capPool = [
    'sql.read', 'sql.write', 'kv.session',
    'net.http', 'fs.read',
  ];
  fc.assert(
    fc.property(
      fc.subarray(capPool, {minLength: 0, maxLength: 5}),
      (caps) => {
        const manifest = makeManifest({capabilities: caps});
        const policy = makePolicy({
          allowedCapabilities: capPool,
        });
        const result = enforceCapabilityPolicy(
          manifest, policy
        );
        return result.valid === true &&
          result.denied.length === 0 &&
          result.allowed.length === caps.length;
      },
    ),
    {numRuns: 10},
  );
  t.pass('allowed capabilities pass policy');
  t.end();
});

test('PBT: denied capabilities rejected by policy', (t) => {
  /**
   * **Validates: Requirements 8.2**
   */
  fc.assert(
    fc.property(
      fc.subarray(
        ['net.http', 'fs.write', 'sys.exec'],
        {minLength: 1, maxLength: 3},
      ),
      (deniedCaps) => {
        const manifest = makeManifest({
          capabilities: deniedCaps,
        });
        const policy = makePolicy({
          allowedCapabilities: ['sql.read'],
        });
        const result = enforceCapabilityPolicy(
          manifest, policy
        );
        return result.valid === false &&
          result.denied.length === deniedCaps.length;
      },
    ),
    {numRuns: 10},
  );
  t.pass('denied capabilities rejected by policy');
  t.end();
});

test('PBT: buildCapabilityImports only injects allowed', (t) => {
  /**
   * **Validates: Requirements 8.2**
   */
  const allCaps = [
    'sql.read', 'sql.write', 'kv.session',
    'net.http', 'fs.read',
  ];
  const modules = {};
  for (const cap of allCaps) {
    modules[cap] = {impl: cap};
  }
  fc.assert(
    fc.property(
      fc.subarray(allCaps, {minLength: 1, maxLength: 5}),
      fc.subarray(allCaps, {minLength: 0, maxLength: 5}),
      (manifestCaps, allowedCaps) => {
        const manifest = makeManifest({
          capabilities: manifestCaps,
        });
        const policy = makePolicy({
          allowedCapabilities: allowedCaps,
        });
        const result = buildCapabilityImports(
          manifest, policy, modules
        );
        const importedKeys = Object.keys(result.imports);
        // Every imported cap must be both declared and allowed
        for (const key of importedKeys) {
          if (!manifestCaps.includes(key)) return false;
          if (!allowedCaps.includes(key)) return false;
        }
        return true;
      },
    ),
    {numRuns: 10},
  );
  t.pass('buildCapabilityImports only injects allowed');
  t.end();
});
