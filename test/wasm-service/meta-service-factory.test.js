import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  createWasmMetaDefinition,
  createAdminMetaDefinition,
  createPostgresWireDefinition,
  META_FACTORY_SUBSYSTEM,
  META_FACTORY_LOG_MSG,
} from '../../src/wasm-service/meta-service-factory.js';
import {
  META_SERVICE_ID,
  META_SERVICE_RUNTIME_REF,
  SERVICE_PROFILE,
  UNIFIED_SERVICE_TYPE,
} from '../../src/constants/index.js';
import {RUNTIME_KIND, RUNTIME_FIELD} from '../../src/constants/runtime.js';
import {
  READ_CONSISTENCY_MODE,
  WRITE_CONSISTENCY_MODE,
  WASM_SERVICE_DEFAULT,
  WASM_SERVICE_PROTOCOL,
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
        def.writeConsistency, WRITE_CONSISTENCY_MODE.STRONG,
      );
    });

    it('ships not-started: replica count 0 — meta command handling runs ' +
      'in-process via the meta router; no lifecycle module exists for ' +
      'the runtime_ref, so placed replicas can only churn failed ADDs ' +
      'and burn the concurrent-operation budget', () => {
      const def = createWasmMetaDefinition();
      assert.equal(def.replicaCount, 0);
    });

    it('should use empty resource budget', () => {
      const def = createWasmMetaDefinition();
      assert.deepStrictEqual(def.resourceBudget, {});
    });

    it('should use default safety interval', () => {
      const def = createWasmMetaDefinition();
      assert.equal(
        def.safetyIntervalMs,
        WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS,
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
        META_SERVICE_RUNTIME_REF.ADMIN_META,
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
        RUNTIME_KIND.NATIVE_JS,
      );
      assert.equal(
        row[RUNTIME_FIELD.RUNTIME_REF],
        META_SERVICE_RUNTIME_REF.ADMIN_META,
      );
      assert.equal(row[RUNTIME_FIELD.RUNTIME_CONFIG], null);
    });
  });

  describe('createPostgresWireDefinition', () => {
    it('should return correct service ID', () => {
      const def = createPostgresWireDefinition();
      assert.equal(def.serviceId, META_SERVICE_ID.POSTGRES_WIRE);
    });

    it('should return correct service name', () => {
      const def = createPostgresWireDefinition();
      assert.equal(def.serviceName, META_SERVICE_ID.POSTGRES_WIRE);
    });

    it('should use default service profile', () => {
      const def = createPostgresWireDefinition();
      assert.equal(def.serviceProfile, SERVICE_PROFILE.DEFAULT);
    });

    it('should use runtime_service service type', () => {
      const def = createPostgresWireDefinition();
      assert.equal(
        def.serviceType, UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      );
    });

    it('should have null handlerFunctionId for built-in service', () => {
      const def = createPostgresWireDefinition();
      assert.equal(def.handlerFunctionId, null);
    });

    it('should use native_js runtime kind', () => {
      const def = createPostgresWireDefinition();
      assert.equal(def.runtimeKind, RUNTIME_KIND.NATIVE_JS);
    });

    it('should use postgres wire runtime ref', () => {
      const def = createPostgresWireDefinition();
      assert.equal(
        def.runtimeRef, META_SERVICE_RUNTIME_REF.POSTGRES_WIRE,
      );
    });

    it('should explicitly configure loopback trust mode', () => {
      const def = createPostgresWireDefinition();
      assert.deepEqual(JSON.parse(def.runtimeConfig), {
        host: '127.0.0.1',
        authMode: 'trust',
        tlsMode: 'disable',
      });
    });

    it('should use postgresql protocol', () => {
      const def = createPostgresWireDefinition();
      assert.equal(
        def.protocol, WASM_SERVICE_PROTOCOL.POSTGRESQL,
      );
    });

    it('ships not-started: replica count 0 places no replicas until ' +
      'an operator scales it (pgwire is a managed service, not a boot ' +
      'listener — with the native_js handler map wired, a non-zero ' +
      'ship count would bind :5432 on placement)', () => {
      const def = createPostgresWireDefinition();
      assert.equal(def.replicaCount, 0);
    });

    it('should serialize without errors', () => {
      const def = createPostgresWireDefinition();
      assert.doesNotThrow(() => serializeServiceDefinition(def));
    });

    it('should persist runtime fields in serialized row', () => {
      const def = createPostgresWireDefinition();
      const row = serializeServiceDefinition(def);
      assert.equal(
        row[RUNTIME_FIELD.RUNTIME_KIND],
        RUNTIME_KIND.NATIVE_JS,
      );
      assert.equal(
        row[RUNTIME_FIELD.RUNTIME_REF],
        META_SERVICE_RUNTIME_REF.POSTGRES_WIRE,
      );
      assert.deepEqual(JSON.parse(row[RUNTIME_FIELD.RUNTIME_CONFIG]), {
        host: '127.0.0.1',
        authMode: 'trust',
        tlsMode: 'disable',
      });
    });

    it('should persist postgresql protocol in serialized row', () => {
      const def = createPostgresWireDefinition();
      const row = serializeServiceDefinition(def);
      assert.equal(row.protocol, WASM_SERVICE_PROTOCOL.POSTGRESQL);
    });
  });

  describe('constants', () => {
    it('should export subsystem name', () => {
      assert.equal(
        META_FACTORY_SUBSYSTEM, 'meta-service-factory',
      );
    });

    it('should export log messages', () => {
      assert.ok(META_FACTORY_LOG_MSG.WASM_META_CREATED);
      assert.ok(META_FACTORY_LOG_MSG.ADMIN_META_CREATED);
      assert.ok(META_FACTORY_LOG_MSG.POSTGRES_WIRE_CREATED);
    });
  });
});
