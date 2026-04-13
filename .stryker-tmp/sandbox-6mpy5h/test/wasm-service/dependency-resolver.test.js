// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDependencies,
  validateDependencyDigests,
  detectUndeclaredImports,
} from '../../src/wasm-service/dependency-resolver.js';
import {
  DIGEST_HEX_LENGTH,
  MODULE_MANIFEST_ERROR_MSG as ERR,
} from '../../src/wasm-service/module-manifest-constants.js';

const DIGEST_A = 'sha256:' + 'a'.repeat(DIGEST_HEX_LENGTH);
const DIGEST_B = 'sha256:' + 'b'.repeat(DIGEST_HEX_LENGTH);
const DIGEST_C = 'sha256:' + 'c'.repeat(DIGEST_HEX_LENGTH);
const DIGEST_D = 'sha256:' + 'd'.repeat(DIGEST_HEX_LENGTH);

function makeManifest(deps) {
  return {
    namespace: 'acme',
    name: 'my-module',
    version: '1.0.0',
    digest: DIGEST_A,
    runExport: 'run',
    exports: ['run'],
    dependencies: deps,
    capabilities: ['sql.read'],
  };
}

function makeAvailable(entries) {
  const map = new Map();
  for (const [id, digest] of entries) {
    map.set(id, {digest});
  }
  return map;
}

describe('resolveDependencies', () => {
  it('should resolve all dependencies successfully', () => {
    const manifest = makeManifest([
      {moduleId: 'cap-sql', digest: DIGEST_B},
      {moduleId: 'cap-kv', digest: DIGEST_C},
    ]);
    const available = makeAvailable([
      ['cap-sql', DIGEST_B],
      ['cap-kv', DIGEST_C],
    ]);

    const result = resolveDependencies(
      manifest, available,
    );
    assert.equal(result.resolved, true);
    assert.equal(result.resolvedDependencies.length, 2);
    assert.equal(
      result.resolvedDependencies[0].moduleId, 'cap-sql',
    );
    assert.equal(
      result.resolvedDependencies[0].digest, DIGEST_B,
    );
    assert.equal(
      result.resolvedDependencies[1].moduleId, 'cap-kv',
    );
    assert.equal(
      result.resolvedDependencies[1].digest, DIGEST_C,
    );
  });

  it('should return error for missing dependency', () => {
    const manifest = makeManifest([
      {moduleId: 'cap-missing', digest: DIGEST_B},
    ]);
    const available = makeAvailable([]);

    const result = resolveDependencies(
      manifest, available,
    );
    assert.equal(result.resolved, false);
    assert.ok(result.errors[0].includes(
      ERR.DEPENDENCY_NOT_FOUND,
    ));
    assert.ok(result.errors[0].includes('cap-missing'));
  });

  it('should return error for digest mismatch', () => {
    const manifest = makeManifest([
      {moduleId: 'cap-sql', digest: DIGEST_B},
    ]);
    const available = makeAvailable([
      ['cap-sql', DIGEST_C],
    ]);

    const result = resolveDependencies(
      manifest, available,
    );
    assert.equal(result.resolved, false);
    assert.ok(result.errors[0].includes(
      ERR.DEPENDENCY_DIGEST_MISMATCH,
    ));
  });

  it('should resolve empty dependencies array', () => {
    const manifest = makeManifest([]);
    const available = makeAvailable([]);

    const result = resolveDependencies(
      manifest, available,
    );
    assert.equal(result.resolved, true);
    assert.equal(result.resolvedDependencies.length, 0);
  });

  it('should resolve undefined dependencies', () => {
    const manifest = makeManifest(undefined);
    const available = makeAvailable([]);

    const result = resolveDependencies(
      manifest, available,
    );
    assert.equal(result.resolved, true);
    assert.equal(result.resolvedDependencies.length, 0);
  });

  it('should produce audit log entries', () => {
    const manifest = makeManifest([
      {moduleId: 'cap-sql', digest: DIGEST_B},
    ]);
    const available = makeAvailable([
      ['cap-sql', DIGEST_B],
    ]);

    const result = resolveDependencies(
      manifest, available,
    );
    assert.equal(result.auditLog.length, 1);
    assert.equal(
      result.auditLog[0].decision, 'resolved',
    );
    assert.equal(
      result.auditLog[0].moduleId, 'cap-sql',
    );
  });

  it('should collect multiple errors', () => {
    const manifest = makeManifest([
      {moduleId: 'cap-missing', digest: DIGEST_B},
      {moduleId: 'cap-wrong', digest: DIGEST_C},
    ]);
    const available = makeAvailable([
      ['cap-wrong', DIGEST_D],
    ]);

    const result = resolveDependencies(
      manifest, available,
    );
    assert.equal(result.resolved, false);
    assert.equal(result.errors.length, 2);
  });
});

describe('validateDependencyDigests', () => {
  it('should validate matching digests', () => {
    const deps = [
      {moduleId: 'cap-sql', digest: DIGEST_B},
    ];
    const available = makeAvailable([
      ['cap-sql', DIGEST_B],
    ]);

    const result = validateDependencyDigests(
      deps, available,
    );
    assert.equal(result.valid, true);
  });

  it('should reject missing module', () => {
    const deps = [
      {moduleId: 'cap-missing', digest: DIGEST_B},
    ];
    const available = makeAvailable([]);

    const result = validateDependencyDigests(
      deps, available,
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes(
      ERR.DEPENDENCY_NOT_FOUND,
    ));
  });

  it('should reject digest mismatch', () => {
    const deps = [
      {moduleId: 'cap-sql', digest: DIGEST_B},
    ];
    const available = makeAvailable([
      ['cap-sql', DIGEST_C],
    ]);

    const result = validateDependencyDigests(
      deps, available,
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes(
      ERR.DEPENDENCY_DIGEST_MISMATCH,
    ));
  });

  it('should accept empty dependencies', () => {
    const result = validateDependencyDigests(
      [], makeAvailable([]),
    );
    assert.equal(result.valid, true);
  });

  it('should accept null dependencies', () => {
    const result = validateDependencyDigests(
      null, makeAvailable([]),
    );
    assert.equal(result.valid, true);
  });
});

describe('detectUndeclaredImports', () => {
  it('should accept all declared imports', () => {
    const imports = ['cap-sql', 'cap-kv'];
    const deps = [
      {moduleId: 'cap-sql', digest: DIGEST_B},
      {moduleId: 'cap-kv', digest: DIGEST_C},
    ];

    const result = detectUndeclaredImports(imports, deps);
    assert.equal(result.valid, true);
  });

  it('should reject undeclared import', () => {
    const imports = ['cap-sql', 'cap-secret'];
    const deps = [
      {moduleId: 'cap-sql', digest: DIGEST_B},
    ];

    const result = detectUndeclaredImports(imports, deps);
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes(
      ERR.UNDECLARED_IMPORT,
    ));
    assert.ok(result.errors[0].includes('cap-secret'));
  });

  it('should accept empty imports', () => {
    const result = detectUndeclaredImports([], []);
    assert.equal(result.valid, true);
  });

  it('should accept null imports', () => {
    const result = detectUndeclaredImports(null, []);
    assert.equal(result.valid, true);
  });
});
