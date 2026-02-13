import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  generateLockId,
  createDependencyLock,
  buildLockRow,
  buildInsertLockSQL,
  buildSelectLockSQL,
  buildSelectLocksByModuleSQL,
  buildSelectLocksByServiceSQL,
  validateLockConsistency,
  validateActivationLock,
} from '../../src/wasm-service/dependency-lock-service.js';
import {
  DEPENDENCY_LOCK_COL,
  DEPENDENCY_LOCK_FIELD,
  DEPENDENCY_LOCK_ERROR_MSG,
} from '../../src/wasm-service/wasm-meta-models-constants.js';
import {
  MODULE_MANIFEST_FIELD as MF,
  MODULE_MANIFEST_ERROR_MSG as ERR,
  DIGEST_HEX_LENGTH,
} from '../../src/wasm-service/module-manifest-constants.js';
import {TABLES} from '../../src/constants/tables.js';

const DIGEST_A = 'sha256:' + 'a'.repeat(DIGEST_HEX_LENGTH);
const DIGEST_B = 'sha256:' + 'b'.repeat(DIGEST_HEX_LENGTH);

function makeManifest(overrides = {}) {
  return {
    [MF.NAMESPACE]: 'acme',
    [MF.NAME]: 'fraud-policy',
    [MF.VERSION]: '1.0.0',
    ...overrides,
  };
}

const RESOLVED_DEPS = [
  {moduleId: 'cap-sql', digest: DIGEST_A},
  {moduleId: 'cap-kv', digest: DIGEST_B},
];

// --- generateLockId ---

describe('generateLockId', () => {
  it('should produce a deterministic hex string', () => {
    const id1 = generateLockId(
      'acme', 'fraud-policy', '1.0.0', RESOLVED_DEPS,
    );
    const id2 = generateLockId(
      'acme', 'fraud-policy', '1.0.0', RESOLVED_DEPS,
    );
    assert.equal(id1, id2);
    assert.match(id1, /^[a-f0-9]{64}$/);
  });

  it('should differ when namespace changes', () => {
    const id1 = generateLockId(
      'acme', 'fraud-policy', '1.0.0', RESOLVED_DEPS,
    );
    const id2 = generateLockId(
      'other', 'fraud-policy', '1.0.0', RESOLVED_DEPS,
    );
    assert.notEqual(id1, id2);
  });

  it('should differ when version changes', () => {
    const id1 = generateLockId(
      'acme', 'fraud-policy', '1.0.0', RESOLVED_DEPS,
    );
    const id2 = generateLockId(
      'acme', 'fraud-policy', '2.0.0', RESOLVED_DEPS,
    );
    assert.notEqual(id1, id2);
  });

  it('should differ when dependencies change', () => {
    const id1 = generateLockId(
      'acme', 'fraud-policy', '1.0.0', RESOLVED_DEPS,
    );
    const id2 = generateLockId(
      'acme', 'fraud-policy', '1.0.0', [],
    );
    assert.notEqual(id1, id2);
  });

  it('should be order-independent for dependencies', () => {
    const reversed = [...RESOLVED_DEPS].reverse();
    const id1 = generateLockId(
      'acme', 'fraud-policy', '1.0.0', RESOLVED_DEPS,
    );
    const id2 = generateLockId(
      'acme', 'fraud-policy', '1.0.0', reversed,
    );
    assert.equal(id1, id2);
  });

  it('should handle empty dependencies', () => {
    const id = generateLockId(
      'acme', 'fraud-policy', '1.0.0', [],
    );
    assert.match(id, /^[a-f0-9]{64}$/);
  });
});

// --- createDependencyLock ---

describe('createDependencyLock', () => {
  it('should create a valid lock from manifest and deps', () => {
    const result = createDependencyLock(
      makeManifest(), RESOLVED_DEPS,
    );
    assert.equal(result.valid, true);
    assert.ok(result.lock);
    assert.equal(
      result.lock[DEPENDENCY_LOCK_FIELD.TARGET_MODULE_NAMESPACE],
      'acme',
    );
    assert.equal(
      result.lock[DEPENDENCY_LOCK_FIELD.TARGET_MODULE_NAME],
      'fraud-policy',
    );
    assert.equal(
      result.lock[DEPENDENCY_LOCK_FIELD.TARGET_MODULE_VERSION],
      '1.0.0',
    );
    assert.deepStrictEqual(
      result.lock[DEPENDENCY_LOCK_FIELD.RESOLVED_DEPENDENCIES],
      RESOLVED_DEPS,
    );
    assert.equal(
      result.lock[DEPENDENCY_LOCK_FIELD.TARGET_SERVICE_ID],
      null,
    );
  });

  it('should attach serviceId when provided', () => {
    const result = createDependencyLock(
      makeManifest(), RESOLVED_DEPS, 'svc-42',
    );
    assert.equal(result.valid, true);
    assert.equal(
      result.lock[DEPENDENCY_LOCK_FIELD.TARGET_SERVICE_ID],
      'svc-42',
    );
  });

  it('should generate deterministic lock ID', () => {
    const r1 = createDependencyLock(
      makeManifest(), RESOLVED_DEPS,
    );
    const r2 = createDependencyLock(
      makeManifest(), RESOLVED_DEPS,
    );
    assert.equal(
      r1.lock[DEPENDENCY_LOCK_FIELD.LOCK_ID],
      r2.lock[DEPENDENCY_LOCK_FIELD.LOCK_ID],
    );
  });

  it('should return errors for missing manifest fields', () => {
    const result = createDependencyLock(
      {[MF.NAMESPACE]: '', [MF.NAME]: '', [MF.VERSION]: ''},
      RESOLVED_DEPS,
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors.includes(
      DEPENDENCY_LOCK_ERROR_MSG.TARGET_NAMESPACE_REQUIRED,
    ));
    assert.ok(result.errors.includes(
      DEPENDENCY_LOCK_ERROR_MSG.TARGET_NAME_REQUIRED,
    ));
    assert.ok(result.errors.includes(
      DEPENDENCY_LOCK_ERROR_MSG.TARGET_VERSION_REQUIRED,
    ));
  });

  it('should handle empty resolved dependencies', () => {
    const result = createDependencyLock(makeManifest(), []);
    assert.equal(result.valid, true);
    assert.deepStrictEqual(
      result.lock[DEPENDENCY_LOCK_FIELD.RESOLVED_DEPENDENCIES],
      [],
    );
  });
});

// --- buildLockRow ---

describe('buildLockRow', () => {
  it('should produce snake_case column keys', () => {
    const {lock} = createDependencyLock(
      makeManifest(), RESOLVED_DEPS,
    );
    const row = buildLockRow(lock);
    assert.ok(DEPENDENCY_LOCK_COL.LOCK_ID in row);
    assert.ok(
      DEPENDENCY_LOCK_COL.TARGET_MODULE_NAMESPACE in row,
    );
    assert.ok(
      DEPENDENCY_LOCK_COL.TARGET_MODULE_NAME in row,
    );
    assert.ok(
      DEPENDENCY_LOCK_COL.TARGET_MODULE_VERSION in row,
    );
    assert.ok(
      DEPENDENCY_LOCK_COL.RESOLVED_DEPENDENCIES in row,
    );
    assert.ok(DEPENDENCY_LOCK_COL.CREATED_AT in row);
  });

  it('should JSON-stringify resolved dependencies', () => {
    const {lock} = createDependencyLock(
      makeManifest(), RESOLVED_DEPS,
    );
    const row = buildLockRow(lock);
    const parsed = JSON.parse(
      row[DEPENDENCY_LOCK_COL.RESOLVED_DEPENDENCIES],
    );
    assert.deepStrictEqual(parsed, RESOLVED_DEPS);
  });
});

// --- buildInsertLockSQL ---

describe('buildInsertLockSQL', () => {
  it('should produce INSERT targeting the correct table', () => {
    const {lock} = createDependencyLock(
      makeManifest(), RESOLVED_DEPS,
    );
    const {sql} = buildInsertLockSQL(lock);
    assert.ok(
      sql.startsWith(
        `INSERT INTO ${TABLES.MODULE_DEPENDENCY_LOCKS}`,
      ),
    );
  });

  it('should include all column names', () => {
    const {lock} = createDependencyLock(
      makeManifest(), RESOLVED_DEPS,
    );
    const {sql} = buildInsertLockSQL(lock);
    assert.ok(sql.includes(DEPENDENCY_LOCK_COL.LOCK_ID));
    assert.ok(sql.includes(
      DEPENDENCY_LOCK_COL.TARGET_MODULE_NAMESPACE,
    ));
    assert.ok(sql.includes(
      DEPENDENCY_LOCK_COL.TARGET_MODULE_NAME,
    ));
    assert.ok(sql.includes(
      DEPENDENCY_LOCK_COL.TARGET_MODULE_VERSION,
    ));
    assert.ok(sql.includes(
      DEPENDENCY_LOCK_COL.TARGET_SERVICE_ID,
    ));
    assert.ok(sql.includes(
      DEPENDENCY_LOCK_COL.RESOLVED_DEPENDENCIES,
    ));
    assert.ok(sql.includes(DEPENDENCY_LOCK_COL.CREATED_AT));
  });

  it('should use positional placeholders', () => {
    const {lock} = createDependencyLock(
      makeManifest(), RESOLVED_DEPS,
    );
    const {sql} = buildInsertLockSQL(lock);
    assert.ok(sql.includes('$1'));
    assert.ok(sql.includes('$7'));
  });

  it('should return 7 params matching columns', () => {
    const {lock} = createDependencyLock(
      makeManifest(), RESOLVED_DEPS,
    );
    const {params} = buildInsertLockSQL(lock);
    assert.equal(params.length, 7);
    // First param is lock_id
    assert.equal(
      params[0],
      lock[DEPENDENCY_LOCK_FIELD.LOCK_ID],
    );
  });

  it('should include serialized deps in params', () => {
    const {lock} = createDependencyLock(
      makeManifest(), RESOLVED_DEPS,
    );
    const {params} = buildInsertLockSQL(lock);
    // resolved_dependencies is the 6th column (index 5)
    const parsed = JSON.parse(params[5]);
    assert.deepStrictEqual(parsed, RESOLVED_DEPS);
  });
});


const DIGEST_C = 'sha256:' + 'c'.repeat(DIGEST_HEX_LENGTH);

function makeLock(resolvedDeps) {
  return {
    [DEPENDENCY_LOCK_FIELD.LOCK_ID]: 'lock-1',
    [DEPENDENCY_LOCK_FIELD.TARGET_MODULE_NAMESPACE]: 'acme',
    [DEPENDENCY_LOCK_FIELD.TARGET_MODULE_NAME]: 'fraud-policy',
    [DEPENDENCY_LOCK_FIELD.TARGET_MODULE_VERSION]: '1.0.0',
    [DEPENDENCY_LOCK_FIELD.TARGET_SERVICE_ID]: null,
    [DEPENDENCY_LOCK_FIELD.RESOLVED_DEPENDENCIES]:
      resolvedDeps,
  };
}

// --- validateLockConsistency ---

describe('validateLockConsistency', () => {
  it('should return valid when deps match lock', () => {
    const lock = makeLock(RESOLVED_DEPS);
    const result = validateLockConsistency(
      lock, RESOLVED_DEPS,
    );
    assert.equal(result.valid, true);
  });

  it('should detect digest change as drift', () => {
    const lock = makeLock(RESOLVED_DEPS);
    const drifted = [
      {moduleId: 'cap-sql', digest: DIGEST_C},
      {moduleId: 'cap-kv', digest: DIGEST_B},
    ];
    const result = validateLockConsistency(lock, drifted);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(
      (e) => e.includes(ERR.DEPENDENCY_VERSION_MUTABLE),
    ));
    assert.equal(result.driftedDependencies.length, 1);
    assert.equal(
      result.driftedDependencies[0].reason, 'changed',
    );
  });

  it('should detect new dependency as undeclared', () => {
    const lock = makeLock(RESOLVED_DEPS);
    const withNew = [
      ...RESOLVED_DEPS,
      {moduleId: 'cap-new', digest: DIGEST_C},
    ];
    const result = validateLockConsistency(lock, withNew);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(
      (e) => e.includes(ERR.UNDECLARED_IMPORT),
    ));
    assert.equal(result.driftedDependencies.length, 1);
    assert.equal(
      result.driftedDependencies[0].reason, 'added',
    );
  });

  it('should handle empty lock and empty deps', () => {
    const lock = makeLock([]);
    const result = validateLockConsistency(lock, []);
    assert.equal(result.valid, true);
  });

  it('should report multiple drift errors', () => {
    const lock = makeLock(RESOLVED_DEPS);
    const drifted = [
      {moduleId: 'cap-sql', digest: DIGEST_C},
      {moduleId: 'cap-kv', digest: DIGEST_C},
    ];
    const result = validateLockConsistency(lock, drifted);
    assert.equal(result.valid, false);
    assert.equal(result.errors.length, 2);
    assert.equal(result.driftedDependencies.length, 2);
  });
});

// --- validateActivationLock ---

describe('validateActivationLock', () => {
  it('should pass when explicit rollout is true', () => {
    const lock = makeLock(RESOLVED_DEPS);
    const drifted = [
      {moduleId: 'cap-sql', digest: DIGEST_C},
    ];
    const result = validateActivationLock(
      makeManifest(), lock, drifted, true,
    );
    assert.equal(result.valid, true);
  });

  it('should reject drift on non-rollout activation', () => {
    const lock = makeLock(RESOLVED_DEPS);
    const drifted = [
      {moduleId: 'cap-sql', digest: DIGEST_C},
      {moduleId: 'cap-kv', digest: DIGEST_B},
    ];
    const result = validateActivationLock(
      makeManifest(), lock, drifted, false,
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('should pass non-rollout when deps match lock', () => {
    const lock = makeLock(RESOLVED_DEPS);
    const result = validateActivationLock(
      makeManifest(), lock, RESOLVED_DEPS, false,
    );
    assert.equal(result.valid, true);
  });
});


// --- buildSelectLockSQL ---

describe('buildSelectLockSQL', () => {
  it('should produce SELECT targeting the correct table', () => {
    const {sql} = buildSelectLockSQL('lock-abc');
    assert.ok(
      sql.startsWith(
        `SELECT * FROM ${TABLES.MODULE_DEPENDENCY_LOCKS}`,
      ),
    );
  });

  it('should filter by lock_id column', () => {
    const {sql} = buildSelectLockSQL('lock-abc');
    assert.ok(
      sql.includes(
        `${DEPENDENCY_LOCK_COL.LOCK_ID} = $1`,
      ),
    );
  });

  it('should return lockId as the single param', () => {
    const {params} = buildSelectLockSQL('lock-abc');
    assert.equal(params.length, 1);
    assert.equal(params[0], 'lock-abc');
  });
});

// --- buildSelectLocksByModuleSQL ---

describe('buildSelectLocksByModuleSQL', () => {
  it('should produce SELECT targeting the correct table', () => {
    const {sql} = buildSelectLocksByModuleSQL(
      'acme', 'fraud-policy', '1.0.0',
    );
    assert.ok(
      sql.startsWith(
        `SELECT * FROM ${TABLES.MODULE_DEPENDENCY_LOCKS}`,
      ),
    );
  });

  it('should filter by namespace, name, and version', () => {
    const {sql} = buildSelectLocksByModuleSQL(
      'acme', 'fraud-policy', '1.0.0',
    );
    assert.ok(sql.includes(
      `${DEPENDENCY_LOCK_COL.TARGET_MODULE_NAMESPACE} = $1`,
    ));
    assert.ok(sql.includes(
      `${DEPENDENCY_LOCK_COL.TARGET_MODULE_NAME} = $2`,
    ));
    assert.ok(sql.includes(
      `${DEPENDENCY_LOCK_COL.TARGET_MODULE_VERSION} = $3`,
    ));
  });

  it('should return three params in order', () => {
    const {params} = buildSelectLocksByModuleSQL(
      'acme', 'fraud-policy', '1.0.0',
    );
    assert.equal(params.length, 3);
    assert.equal(params[0], 'acme');
    assert.equal(params[1], 'fraud-policy');
    assert.equal(params[2], '1.0.0');
  });
});

// --- buildSelectLocksByServiceSQL ---

describe('buildSelectLocksByServiceSQL', () => {
  it('should produce SELECT targeting the correct table', () => {
    const {sql} = buildSelectLocksByServiceSQL('svc-42');
    assert.ok(
      sql.startsWith(
        `SELECT * FROM ${TABLES.MODULE_DEPENDENCY_LOCKS}`,
      ),
    );
  });

  it('should filter by target_service_id column', () => {
    const {sql} = buildSelectLocksByServiceSQL('svc-42');
    assert.ok(
      sql.includes(
        `${DEPENDENCY_LOCK_COL.TARGET_SERVICE_ID} = $1`,
      ),
    );
  });

  it('should return serviceId as the single param', () => {
    const {params} = buildSelectLocksByServiceSQL('svc-42');
    assert.equal(params.length, 1);
    assert.equal(params[0], 'svc-42');
  });
});
