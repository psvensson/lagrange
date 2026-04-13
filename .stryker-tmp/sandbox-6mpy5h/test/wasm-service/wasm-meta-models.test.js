// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRegistryMapping,
  serializeRegistryMapping,
  deserializeRegistryMapping,
  validateRegistryOverride,
  serializeRegistryOverride,
  deserializeRegistryOverride,
  validateDependencyLock,
  serializeDependencyLock,
  deserializeDependencyLock,
  validateWasmOperation,
  serializeWasmOperation,
  deserializeWasmOperation,
} from '../../src/wasm-service/wasm-meta-models.js';
import {
  REGISTRY_MAPPING_COL,
  REGISTRY_MAPPING_FIELD,
  REGISTRY_MAPPING_ERROR_MSG,
  REGISTRY_OVERRIDE_COL,
  REGISTRY_OVERRIDE_FIELD,
  REGISTRY_OVERRIDE_ERROR_MSG,
  DEPENDENCY_LOCK_COL,
  DEPENDENCY_LOCK_FIELD,
  DEPENDENCY_LOCK_ERROR_MSG,
  WASM_OPERATION_COL,
  WASM_OPERATION_FIELD,
  WASM_OPERATION_ERROR_MSG,
} from '../../src/wasm-service/wasm-meta-models-constants.js';
import {WASM_OPERATION_STATE} from '../../src/constants/index.js';

// --- Registry Mapping ---

describe('validateRegistryMapping', () => {
  it('should accept a valid mapping', () => {
    const result = validateRegistryMapping({
      namespace: 'acme',
      registryUrl: 'https://registry.acme.io',
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('should reject missing namespace', () => {
    const result = validateRegistryMapping({
      namespace: '',
      registryUrl: 'https://registry.acme.io',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      REGISTRY_MAPPING_ERROR_MSG.NAMESPACE_REQUIRED
    ));
  });

  it('should reject invalid namespace format', () => {
    const result = validateRegistryMapping({
      namespace: '123-BAD',
      registryUrl: 'https://registry.acme.io',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      REGISTRY_MAPPING_ERROR_MSG.NAMESPACE_INVALID_FORMAT
    ));
  });

  it('should reject missing registry_url', () => {
    const result = validateRegistryMapping({
      namespace: 'acme',
      registryUrl: '',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      REGISTRY_MAPPING_ERROR_MSG.REGISTRY_URL_REQUIRED
    ));
  });
});

describe('serializeRegistryMapping / deserializeRegistryMapping',
  () => {
    it('should round-trip a mapping', () => {
      const now = Date.now();
      const mapping = {
        namespace: 'acme',
        registryUrl: 'https://registry.acme.io',
        policyMetadata: {tier: 'premium'},
        createdAt: now,
        updatedAt: now,
      };
      const row = serializeRegistryMapping(mapping);
      const result = deserializeRegistryMapping(row);
      assert.deepStrictEqual(result, mapping);
    });

    it('should default empty policy_metadata', () => {
      const row = serializeRegistryMapping({
        namespace: 'acme',
        registryUrl: 'https://registry.acme.io',
      });
      const result = deserializeRegistryMapping(row);
      assert.deepStrictEqual(result.policyMetadata, {});
    });

    it('should produce snake_case keys', () => {
      const row = serializeRegistryMapping({
        namespace: 'acme',
        registryUrl: 'https://registry.acme.io',
      });
      assert.ok(REGISTRY_MAPPING_COL.NAMESPACE in row);
      assert.ok(REGISTRY_MAPPING_COL.REGISTRY_URL in row);
      assert.ok(REGISTRY_MAPPING_COL.POLICY_METADATA in row);
      assert.ok(REGISTRY_MAPPING_COL.CREATED_AT in row);
      assert.ok(REGISTRY_MAPPING_COL.UPDATED_AT in row);
    });
  });

// --- Registry Override ---

describe('validateRegistryOverride', () => {
  it('should accept a valid override', () => {
    const result = validateRegistryOverride({
      namespace: 'acme',
      name: 'fraud-policy',
      registryUrl: 'https://private.acme.io',
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('should reject missing namespace', () => {
    const result = validateRegistryOverride({
      namespace: '',
      name: 'fraud-policy',
      registryUrl: 'https://private.acme.io',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      REGISTRY_OVERRIDE_ERROR_MSG.NAMESPACE_REQUIRED
    ));
  });

  it('should reject invalid namespace format', () => {
    const result = validateRegistryOverride({
      namespace: 'BAD',
      name: 'fraud-policy',
      registryUrl: 'https://private.acme.io',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      REGISTRY_OVERRIDE_ERROR_MSG.NAMESPACE_INVALID_FORMAT
    ));
  });

  it('should reject missing name', () => {
    const result = validateRegistryOverride({
      namespace: 'acme',
      name: '',
      registryUrl: 'https://private.acme.io',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      REGISTRY_OVERRIDE_ERROR_MSG.NAME_REQUIRED
    ));
  });

  it('should reject invalid name format', () => {
    const result = validateRegistryOverride({
      namespace: 'acme',
      name: '123-BAD',
      registryUrl: 'https://private.acme.io',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      REGISTRY_OVERRIDE_ERROR_MSG.NAME_INVALID_FORMAT
    ));
  });

  it('should reject missing registry_url', () => {
    const result = validateRegistryOverride({
      namespace: 'acme',
      name: 'fraud-policy',
      registryUrl: '',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      REGISTRY_OVERRIDE_ERROR_MSG.REGISTRY_URL_REQUIRED
    ));
  });
});

describe(
  'serializeRegistryOverride / deserializeRegistryOverride',
  () => {
    it('should round-trip an override', () => {
      const now = Date.now();
      const override = {
        namespace: 'acme',
        name: 'fraud-policy',
        registryUrl: 'https://private.acme.io',
        policyMetadata: {reason: 'internal'},
        createdAt: now,
        updatedAt: now,
      };
      const row = serializeRegistryOverride(override);
      const result = deserializeRegistryOverride(row);
      assert.deepStrictEqual(result, override);
    });

    it('should default empty policy_metadata', () => {
      const row = serializeRegistryOverride({
        namespace: 'acme',
        name: 'fraud-policy',
        registryUrl: 'https://private.acme.io',
      });
      const result = deserializeRegistryOverride(row);
      assert.deepStrictEqual(result.policyMetadata, {});
    });

    it('should produce snake_case keys', () => {
      const row = serializeRegistryOverride({
        namespace: 'acme',
        name: 'fraud-policy',
        registryUrl: 'https://private.acme.io',
      });
      assert.ok(REGISTRY_OVERRIDE_COL.NAMESPACE in row);
      assert.ok(REGISTRY_OVERRIDE_COL.NAME in row);
      assert.ok(REGISTRY_OVERRIDE_COL.REGISTRY_URL in row);
      assert.ok(REGISTRY_OVERRIDE_COL.POLICY_METADATA in row);
    });
  });

// --- Dependency Lock ---

describe('validateDependencyLock', () => {
  it('should accept a valid lock', () => {
    const result = validateDependencyLock({
      lockId: 'lock-001',
      targetModuleNamespace: 'acme',
      targetModuleName: 'fraud-policy',
      targetModuleVersion: '1.0.0',
      resolvedDependencies: [{moduleId: 'cap-sql', digest: 'sha256:abc'}],
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('should reject missing lock_id', () => {
    const result = validateDependencyLock({
      lockId: '',
      targetModuleNamespace: 'acme',
      targetModuleName: 'fraud-policy',
      targetModuleVersion: '1.0.0',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      DEPENDENCY_LOCK_ERROR_MSG.LOCK_ID_REQUIRED
    ));
  });

  it('should reject missing target fields', () => {
    const result = validateDependencyLock({
      lockId: 'lock-001',
      targetModuleNamespace: '',
      targetModuleName: '',
      targetModuleVersion: '',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      DEPENDENCY_LOCK_ERROR_MSG.TARGET_NAMESPACE_REQUIRED
    ));
    assert.ok(result.errors.includes(
      DEPENDENCY_LOCK_ERROR_MSG.TARGET_NAME_REQUIRED
    ));
    assert.ok(result.errors.includes(
      DEPENDENCY_LOCK_ERROR_MSG.TARGET_VERSION_REQUIRED
    ));
  });

  it('should reject non-array resolved_dependencies', () => {
    const result = validateDependencyLock({
      lockId: 'lock-001',
      targetModuleNamespace: 'acme',
      targetModuleName: 'fraud-policy',
      targetModuleVersion: '1.0.0',
      resolvedDependencies: 'not-array',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      DEPENDENCY_LOCK_ERROR_MSG.RESOLVED_DEPS_NOT_ARRAY
    ));
  });

  it('should accept lock with undefined dependencies', () => {
    const result = validateDependencyLock({
      lockId: 'lock-001',
      targetModuleNamespace: 'acme',
      targetModuleName: 'fraud-policy',
      targetModuleVersion: '1.0.0',
    });
    assert.equal(result.valid, true);
  });
});

describe(
  'serializeDependencyLock / deserializeDependencyLock',
  () => {
    it('should round-trip a lock', () => {
      const now = Date.now();
      const lock = {
        lockId: 'lock-001',
        targetModuleNamespace: 'acme',
        targetModuleName: 'fraud-policy',
        targetModuleVersion: '1.0.0',
        targetServiceId: 'svc-123',
        resolvedDependencies: [
          {moduleId: 'cap-sql', digest: 'sha256:abc'},
        ],
        createdAt: now,
      };
      const row = serializeDependencyLock(lock);
      const result = deserializeDependencyLock(row);
      assert.deepStrictEqual(result, lock);
    });

    it('should default null for optional fields', () => {
      const row = serializeDependencyLock({
        lockId: 'lock-001',
        targetModuleNamespace: 'acme',
        targetModuleName: 'fraud-policy',
        targetModuleVersion: '1.0.0',
      });
      const result = deserializeDependencyLock(row);
      assert.equal(result.targetServiceId, null);
      assert.deepStrictEqual(
        result.resolvedDependencies, []
      );
    });

    it('should produce snake_case keys', () => {
      const row = serializeDependencyLock({
        lockId: 'lock-001',
        targetModuleNamespace: 'acme',
        targetModuleName: 'fraud-policy',
        targetModuleVersion: '1.0.0',
      });
      assert.ok(DEPENDENCY_LOCK_COL.LOCK_ID in row);
      assert.ok(
        DEPENDENCY_LOCK_COL.TARGET_MODULE_NAMESPACE in row
      );
      assert.ok(
        DEPENDENCY_LOCK_COL.RESOLVED_DEPENDENCIES in row
      );
      assert.ok(DEPENDENCY_LOCK_COL.CREATED_AT in row);
    });
  });

// --- Wasm Operation ---

describe('validateWasmOperation', () => {
  it('should accept a valid operation', () => {
    const result = validateWasmOperation({
      operationId: 'op-001',
      tenantId: 'tenant-1',
      command: 'publishModule',
      state: WASM_OPERATION_STATE.PENDING,
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('should reject missing operation_id', () => {
    const result = validateWasmOperation({
      operationId: '',
      tenantId: 'tenant-1',
      command: 'publishModule',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      WASM_OPERATION_ERROR_MSG.OPERATION_ID_REQUIRED
    ));
  });

  it('should reject missing tenant_id', () => {
    const result = validateWasmOperation({
      operationId: 'op-001',
      tenantId: '',
      command: 'publishModule',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      WASM_OPERATION_ERROR_MSG.TENANT_ID_REQUIRED
    ));
  });

  it('should reject missing command', () => {
    const result = validateWasmOperation({
      operationId: 'op-001',
      tenantId: 'tenant-1',
      command: '',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      WASM_OPERATION_ERROR_MSG.COMMAND_REQUIRED
    ));
  });

  it('should reject invalid state', () => {
    const result = validateWasmOperation({
      operationId: 'op-001',
      tenantId: 'tenant-1',
      command: 'publishModule',
      state: 'bogus',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      WASM_OPERATION_ERROR_MSG.STATE_INVALID
    ));
  });

  it('should accept operation without state', () => {
    const result = validateWasmOperation({
      operationId: 'op-001',
      tenantId: 'tenant-1',
      command: 'publishModule',
    });
    assert.equal(result.valid, true);
  });
});

describe(
  'serializeWasmOperation / deserializeWasmOperation',
  () => {
    it('should round-trip an operation', () => {
      const now = Date.now();
      const op = {
        operationId: 'op-001',
        tenantId: 'tenant-1',
        command: 'publishModule',
        idempotencyKey: 'idem-abc',
        state: WASM_OPERATION_STATE.IN_PROGRESS,
        result: {moduleVersion: '1.0.0'},
        error: {},
        createdAt: now,
        updatedAt: now,
      };
      const row = serializeWasmOperation(op);
      const result = deserializeWasmOperation(row);
      assert.deepStrictEqual(result, op);
    });

    it('should default pending state', () => {
      const row = serializeWasmOperation({
        operationId: 'op-001',
        tenantId: 'tenant-1',
        command: 'publishModule',
      });
      assert.equal(
        row[WASM_OPERATION_COL.STATE],
        WASM_OPERATION_STATE.PENDING
      );
    });

    it('should default null for idempotency_key', () => {
      const row = serializeWasmOperation({
        operationId: 'op-001',
        tenantId: 'tenant-1',
        command: 'publishModule',
      });
      const result = deserializeWasmOperation(row);
      assert.equal(result.idempotencyKey, null);
    });

    it('should produce snake_case keys', () => {
      const row = serializeWasmOperation({
        operationId: 'op-001',
        tenantId: 'tenant-1',
        command: 'publishModule',
      });
      assert.ok(WASM_OPERATION_COL.OPERATION_ID in row);
      assert.ok(WASM_OPERATION_COL.TENANT_ID in row);
      assert.ok(WASM_OPERATION_COL.COMMAND in row);
      assert.ok(WASM_OPERATION_COL.STATE in row);
      assert.ok(WASM_OPERATION_COL.RESULT in row);
      assert.ok(WASM_OPERATION_COL.ERROR in row);
      assert.ok(WASM_OPERATION_COL.CREATED_AT in row);
      assert.ok(WASM_OPERATION_COL.UPDATED_AT in row);
    });
  });
