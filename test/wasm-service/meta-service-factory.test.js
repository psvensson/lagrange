import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  createWasmMetaDefinition,
  createAdminMetaDefinition,
  META_FACTORY_SUBSYSTEM,
  META_FACTORY_LOG_MSG,
} from '../../src/wasm-service/meta-service-factory.js';
import {
  META_SERVICE_ID,
  META_SERVICE_RUNTIME_REF,
  SERVICE_PROFILE,
} from '../../src/constants/index.js';
import {RUNTIME_KIND, RUNTIME_FIELD} from '../../src/constants/runtime.js';
import {
  READ_CONSISTENCY_MODE,
  WRITE_CONSISTENCY_MODE,
  WASM_SERVICE_DEFAULT,
} from '../../src/wasm-service/wasm-service-constants.js';
import {
  serializeServiceDefinition,
} from '../../src/wasm-service/wasm-service-models.js';

describe('meta-service-factory', () => {
  describe('createWasmMetaDefinition', () => {
    it('should return correct service ID', () => {
      const def = createWasmMetaDefinition();
      assert.equal(def.serviceId, META_SERVICE_ID.WASM_META);
    });

    it('should return correct service name', () => {
      const def = createWasmMetaDefinition();
      assert.equal(def.serviceName, META_SERVICE_ID.WASM_META);
    });

    it('should use default service profile', () => {
      const def = createWasmMetaDefinition();
      assert.equal(def.serviceProfile, SERVICE_PROFILE.DEFAULT);
    });

    it('should have null handlerFunctionId for built-in service', () => {
      const def = createWasmMetaDefinition();
      assert.equal(def.handlerFunctionId, null);
    });

    it('should use strong read consistency', () => {
      const def = createWasmMetaDefinition();
      assert.equal(def.readConsistency, READ_CONSISTENCY_MODE.STRONG);
    });

    it('should use strong write consistency', () => {
      const def = createWasmMetaDefinition();
      assert.equal(
        def.writeConsistency, WRITE_CONSISTENCY_MODE.STRONG
      );
    });

    it('should use default replica count', () => {
      const def = createWasmMetaDefinition();
      assert.equal(
        def.replicaCount, WASM_SERVICE_DEFAULT.REPLICA_COUNT
      );
    });

    it('should use empty resource budget', () => {
      const def = createWasmMetaDefinition();
      assert.deepStrictEqual(def.resourceBudget, {});
    });

    it('should use default safety interval', () => {
      const def = createWasmMetaDefinition();
      assert.equal(
        def.safetyIntervalMs,
        WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS
      );
    });

    it('should serialize without errors', () => {
      const def = createWasmMetaDefinition();
      assert.doesNotThrow(() => serializeServiceDefinition(def));
    });
  });

  describe('createAdminMetaDefinition', () => {
    it('should return correct service ID', () => {
      const def = createAdminMetaDefinition();
      assert.equal(def.serviceId, META_SERVICE_ID.ADMIN_META);
    });

    it('should return correct service name', () => {
      const def = createAdminMetaDefinition();
      assert.equal(def.serviceName, META_SERVICE_ID.ADMIN_META);
    });

    it('should have null handlerFunctionId for built-in service', () => {
      const def = createAdminMetaDefinition();
      assert.equal(def.handlerFunctionId, null);
    });

    it('should use native_js runtime kind', () => {
      const def = createAdminMetaDefinition();
      assert.equal(def.runtimeKind, RUNTIME_KIND.NATIVE_JS);
    });

    it('should use admin meta handler runtime ref', () => {
      const def = createAdminMetaDefinition();
      assert.equal(
        def.runtimeRef,
        META_SERVICE_RUNTIME_REF.ADMIN_META
      );
    });

    it('should have null runtime config', () => {
      const def = createAdminMetaDefinition();
      assert.equal(def.runtimeConfig, null);
    });

    it('should serialize without errors', () => {
      const def = createAdminMetaDefinition();
      assert.doesNotThrow(() => serializeServiceDefinition(def));
    });

    it('should persist runtime fields in serialized row', () => {
      const def = createAdminMetaDefinition();
      const row = serializeServiceDefinition(def);
      assert.equal(
        row[RUNTIME_FIELD.RUNTIME_KIND],
        RUNTIME_KIND.NATIVE_JS
      );
      assert.equal(
        row[RUNTIME_FIELD.RUNTIME_REF],
        META_SERVICE_RUNTIME_REF.ADMIN_META
      );
      assert.equal(row[RUNTIME_FIELD.RUNTIME_CONFIG], null);
    });
  });

  describe('constants', () => {
    it('should export subsystem name', () => {
      assert.equal(
        META_FACTORY_SUBSYSTEM, 'meta-service-factory'
      );
    });

    it('should export log messages', () => {
      assert.ok(META_FACTORY_LOG_MSG.WASM_META_CREATED);
      assert.ok(META_FACTORY_LOG_MSG.ADMIN_META_CREATED);
    });
  });
});
