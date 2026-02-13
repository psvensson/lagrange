/**
 * WASM API compatibility tests for runtime abstraction transition.
 *
 * Proves that existing WASM service APIs remain fully compatible
 * when the WasmComponentDriver is used alongside NativeJsDriver
 * in the RuntimeDriverRegistry.
 *
 * Validates: Requirements 3.4, 13.3
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  WasmComponentDriver,
} from '../../src/runtime/wasm-component-driver.js';
import {NativeJsDriver} from '../../src/runtime/native-js-driver.js';
import {
  RuntimeDriverRegistry,
} from '../../src/runtime/runtime-driver-registry.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {
  SD_COL,
  serializeServiceDefinition,
  deserializeServiceDefinition,
} from '../../src/wasm-service/wasm-service-models.js';
import {
  handleCreateService,
} from '../../src/wasm-service/meta-command-handlers.js';
import {
  applyRuntimeDefaults,
  applyLegacyDefaults,
} from '../../src/wasm-service/runtime-legacy-mapping.js';
import {PREPARE_STATUS} from '../../src/runtime/runtime-driver.js';

// --- Test constants ---

const TEST_SERVICE_ID = 'svc-compat-1';
const TEST_SERVICE_NAME = 'compat-test-svc';
const TEST_HANDLER_ID = 'func-compat-handler';
const TEST_RUNTIME_CONFIG = '{"timeout":5000}';
const TEST_NATIVE_REF = 'admin-handler';

// --- 1. Serialization round-trip with runtime fields ---

describe('WASM API compatibility with runtime abstraction', () => {
  describe('serialization round-trip', () => {
    it('should preserve runtime fields through serialize/deserialize',
      () => {
        const def = {
          serviceId: TEST_SERVICE_ID,
          serviceName: TEST_SERVICE_NAME,
          handlerFunctionId: TEST_HANDLER_ID,
          runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
          runtimeRef: TEST_HANDLER_ID,
          runtimeConfig: TEST_RUNTIME_CONFIG,
        };
        const row = serializeServiceDefinition(def);
        const restored = deserializeServiceDefinition(row);
        assert.equal(
          restored.runtimeKind, RUNTIME_KIND.WASM_COMPONENT,
        );
        assert.equal(restored.runtimeRef, TEST_HANDLER_ID);
        assert.equal(restored.runtimeConfig, TEST_RUNTIME_CONFIG);
      });

    it('should infer wasm_component for legacy definitions ' +
      'without runtime_kind', () => {
      const legacyRow = {
        [SD_COL.SERVICE_ID]: TEST_SERVICE_ID,
        [SD_COL.SERVICE_NAME]: TEST_SERVICE_NAME,
        [SD_COL.HANDLER_FUNCTION_ID]: TEST_HANDLER_ID,
        [SD_COL.READ_CONSISTENCY]: 'strong',
        [SD_COL.WRITE_CONSISTENCY]: 'strong',
        [SD_COL.REPLICA_COUNT]: 3,
        [SD_COL.PROTOCOL]: 'websocket',
        [SD_COL.RESOURCE_BUDGET]: '{}',
        [SD_COL.SAFETY_INTERVAL_MS]: 500,
        [SD_COL.STATUS]: 'active',
        [SD_COL.CREATED_AT]: 1000,
        [SD_COL.UPDATED_AT]: 1000,
      };
      const restored = deserializeServiceDefinition(legacyRow);
      assert.equal(
        restored.runtimeKind, RUNTIME_KIND.WASM_COMPONENT,
      );
      assert.equal(restored.runtimeRef, TEST_HANDLER_ID);
    });

    it('should preserve legacy handlerFunctionId when writing ' +
      'runtime-aware definitions', () => {
      const def = {
        serviceId: TEST_SERVICE_ID,
        serviceName: TEST_SERVICE_NAME,
        runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
        runtimeRef: TEST_HANDLER_ID,
      };
      const row = serializeServiceDefinition(def);
      assert.equal(
        row[SD_COL.HANDLER_FUNCTION_ID], TEST_HANDLER_ID,
      );
    });
  });

  // --- 2. Meta command handler compatibility ---

  describe('meta command handler compatibility', () => {
    it('should create service with runtime fields', () => {
      const params = {
        serviceId: TEST_SERVICE_ID,
        serviceName: TEST_SERVICE_NAME,
        handlerFunctionId: TEST_HANDLER_ID,
        runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
        runtimeRef: TEST_HANDLER_ID,
        runtimeConfig: TEST_RUNTIME_CONFIG,
      };
      const result = handleCreateService(params);
      assert.equal(result.success, true);
      assert.ok(result.sql.includes(SD_COL.RUNTIME_KIND));
      assert.ok(result.sql.includes(SD_COL.RUNTIME_REF));
      assert.ok(result.sql.includes(SD_COL.RUNTIME_CONFIG));
      assert.ok(
        result.params.includes(RUNTIME_KIND.WASM_COMPONENT),
      );
      assert.ok(result.params.includes(TEST_HANDLER_ID));
      assert.ok(result.params.includes(TEST_RUNTIME_CONFIG));
    });

    it('should create service without runtime fields (legacy)',
      () => {
        const params = {
          serviceId: TEST_SERVICE_ID,
          serviceName: TEST_SERVICE_NAME,
          handlerFunctionId: TEST_HANDLER_ID,
        };
        const result = handleCreateService(params);
        assert.equal(result.success, true);
        assert.equal(result.serviceId, TEST_SERVICE_ID);
      });
  });

  // --- 3. Driver registry coexistence ---

  describe('driver registry coexistence', () => {
    it('should register both NativeJsDriver and ' +
      'WasmComponentDriver', () => {
      const registry = new RuntimeDriverRegistry();
      const nativeDriver = new NativeJsDriver();
      const wasmDriver = new WasmComponentDriver();
      registry.register(nativeDriver);
      registry.register(wasmDriver);
      registry.freeze();
      assert.equal(
        registry.getDriver(RUNTIME_KIND.NATIVE_JS),
        nativeDriver,
      );
      assert.equal(
        registry.getDriver(RUNTIME_KIND.WASM_COMPONENT),
        wasmDriver,
      );
    });

    it('should validate descriptors for both drivers ' +
      'independently', () => {
      const registry = new RuntimeDriverRegistry();
      registry.register(new NativeJsDriver());
      registry.register(new WasmComponentDriver());
      registry.freeze();

      const nativeDriver = registry.getDriver(
        RUNTIME_KIND.NATIVE_JS,
      );
      const wasmDriver = registry.getDriver(
        RUNTIME_KIND.WASM_COMPONENT,
      );

      const nativeDef = {
        runtimeRef: TEST_NATIVE_REF,
      };
      const wasmDef = {
        runtimeRef: TEST_HANDLER_ID,
      };

      const nativeResult =
        nativeDriver.validateDescriptor(nativeDef);
      const wasmResult =
        wasmDriver.validateDescriptor(wasmDef);

      assert.equal(nativeResult.valid, true);
      assert.equal(wasmResult.valid, true);
    });

    it('should prepare both drivers independently', async () => {
      const nativeDriver = new NativeJsDriver();
      const wasmDriver = new WasmComponentDriver();

      const nativeDef = {
        serviceId: 'svc-native-1',
        runtimeRef: TEST_NATIVE_REF,
      };
      const handlerFn = () => {};
      const nativeResult = await nativeDriver.prepare(
        nativeDef, {handlerMap: {[TEST_NATIVE_REF]: handlerFn}},
      );
      assert.equal(nativeResult.status, PREPARE_STATUS.READY);

      const wasmDef = {
        serviceId: 'svc-wasm-1',
        runtimeRef: TEST_HANDLER_ID,
      };
      const wasmResult = await wasmDriver.prepare(wasmDef, {});
      assert.equal(wasmResult.status, PREPARE_STATUS.READY);
    });
  });

  // --- 4. Legacy mapping integration ---

  describe('legacy mapping integration', () => {
    it('should map legacy WASM row to driver-compatible definition',
      () => {
        const legacyDef = {
          serviceId: TEST_SERVICE_ID,
          serviceName: TEST_SERVICE_NAME,
          handlerFunctionId: TEST_HANDLER_ID,
          runtimeKind: null,
          runtimeRef: null,
          runtimeConfig: null,
        };
        const mapped = applyRuntimeDefaults(legacyDef);
        assert.equal(
          mapped.runtimeKind, RUNTIME_KIND.WASM_COMPONENT,
        );
        assert.equal(mapped.runtimeRef, TEST_HANDLER_ID);

        const wasmDriver = new WasmComponentDriver();
        const validation =
          wasmDriver.validateDescriptor(mapped);
        assert.equal(validation.valid, true);
      });

    it('should map runtime-aware definition to ' +
      'legacy-compatible row', () => {
      const def = {
        serviceId: TEST_SERVICE_ID,
        serviceName: TEST_SERVICE_NAME,
        runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
        runtimeRef: TEST_HANDLER_ID,
        runtimeConfig: null,
      };
      const compat = applyLegacyDefaults(def);
      assert.equal(compat.handlerFunctionId, TEST_HANDLER_ID);

      const row = serializeServiceDefinition(compat);
      assert.equal(
        row[SD_COL.HANDLER_FUNCTION_ID], TEST_HANDLER_ID,
      );
    });

    it('should handle native_js definitions without legacy handler',
      () => {
        const def = {
          serviceId: 'svc-native-compat',
          serviceName: 'native-compat',
          runtimeKind: RUNTIME_KIND.NATIVE_JS,
          runtimeRef: TEST_NATIVE_REF,
          runtimeConfig: null,
        };
        const compat = applyLegacyDefaults(def);
        assert.equal(compat.handlerFunctionId, null);
      });
  });
});
