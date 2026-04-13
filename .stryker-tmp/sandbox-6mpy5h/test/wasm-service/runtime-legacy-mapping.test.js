// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  inferRuntimeFromLegacy,
  inferLegacyFromRuntime,
  applyRuntimeDefaults,
  applyLegacyDefaults,
} from '../../src/wasm-service/runtime-legacy-mapping.js';
import {
  RUNTIME_KIND,
  SQL_ENGINE_RUNTIME_KIND,
} from '../../src/constants/runtime.js';
import {SERVICE_PROFILE} from '../../src/constants/service.js';

describe('runtime-legacy-mapping', () => {
  describe('inferRuntimeFromLegacy', () => {
    it('should map legacy WASM row with handler to wasm_component', () => {
      const row = {
        handlerFunctionId: 'func-abc',
        serviceProfile: SERVICE_PROFILE.DEFAULT,
      };
      const result = inferRuntimeFromLegacy(row);
      assert.equal(result.runtimeKind, RUNTIME_KIND.WASM_COMPONENT);
      assert.equal(result.runtimeRef, 'func-abc');
      assert.equal(result.runtimeConfig, null);
    });

    it('should map row without handler to native_js', () => {
      const row = {
        handlerFunctionId: null,
        serviceProfile: SERVICE_PROFILE.DEFAULT,
      };
      const result = inferRuntimeFromLegacy(row);
      assert.equal(result.runtimeKind, RUNTIME_KIND.NATIVE_JS);
      assert.equal(result.runtimeRef, null);
      assert.equal(result.runtimeConfig, null);
    });

    it('should map sql_engine profile to native_js', () => {
      const row = {
        handlerFunctionId: null,
        serviceProfile: SERVICE_PROFILE.SQL_ENGINE,
      };
      const result = inferRuntimeFromLegacy(row);
      assert.equal(result.runtimeKind, SQL_ENGINE_RUNTIME_KIND);
      assert.equal(result.runtimeRef, null);
    });

    it('should map sql_engine profile to native_js even with handler', () => {
      const row = {
        handlerFunctionId: 'func-x',
        serviceProfile: SERVICE_PROFILE.SQL_ENGINE,
      };
      const result = inferRuntimeFromLegacy(row);
      assert.equal(result.runtimeKind, SQL_ENGINE_RUNTIME_KIND);
      assert.equal(result.runtimeRef, null);
    });

    it('should preserve existing runtimeConfig', () => {
      const row = {
        handlerFunctionId: 'func-1',
        serviceProfile: SERVICE_PROFILE.DEFAULT,
        runtimeConfig: '{"timeout":5000}',
      };
      const result = inferRuntimeFromLegacy(row);
      assert.equal(result.runtimeConfig, '{"timeout":5000}');
    });

    it('should treat undefined handlerFunctionId as absent', () => {
      const row = {serviceProfile: SERVICE_PROFILE.DEFAULT};
      const result = inferRuntimeFromLegacy(row);
      assert.equal(result.runtimeKind, RUNTIME_KIND.NATIVE_JS);
      assert.equal(result.runtimeRef, null);
    });

    it('should treat empty string handlerFunctionId as absent', () => {
      const row = {
        handlerFunctionId: '',
        serviceProfile: SERVICE_PROFILE.DEFAULT,
      };
      const result = inferRuntimeFromLegacy(row);
      assert.equal(result.runtimeKind, RUNTIME_KIND.NATIVE_JS);
      assert.equal(result.runtimeRef, null);
    });

    it('should be deterministic across repeated calls', () => {
      const row = {
        handlerFunctionId: 'func-det',
        serviceProfile: SERVICE_PROFILE.DEFAULT,
      };
      const r1 = inferRuntimeFromLegacy(row);
      const r2 = inferRuntimeFromLegacy(row);
      assert.deepStrictEqual(r1, r2);
    });
  });

  describe('inferLegacyFromRuntime', () => {
    it('should map wasm_component runtime_ref to handler_function_id',
      () => {
        const def = {
          runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
          runtimeRef: 'module-abc',
        };
        assert.equal(inferLegacyFromRuntime(def), 'module-abc');
      });

    it('should return null for native_js', () => {
      const def = {
        runtimeKind: RUNTIME_KIND.NATIVE_JS,
        runtimeRef: 'admin-handler',
      };
      assert.equal(inferLegacyFromRuntime(def), null);
    });

    it('should return null for oci_container', () => {
      const def = {
        runtimeKind: RUNTIME_KIND.OCI_CONTAINER,
        runtimeRef: 'registry/repo@sha256:abc',
      };
      assert.equal(inferLegacyFromRuntime(def), null);
    });

    it('should return null when wasm_component has no runtime_ref',
      () => {
        const def = {
          runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
          runtimeRef: null,
        };
        assert.equal(inferLegacyFromRuntime(def), null);
      });
  });

  describe('applyRuntimeDefaults', () => {
    it('should not modify definition with existing runtimeKind', () => {
      const def = {
        runtimeKind: RUNTIME_KIND.OCI_CONTAINER,
        runtimeRef: 'img@sha256:abc',
        runtimeConfig: null,
        handlerFunctionId: null,
        serviceProfile: SERVICE_PROFILE.DEFAULT,
      };
      const result = applyRuntimeDefaults(def);
      assert.equal(result, def);
    });

    it('should infer runtime fields for legacy WASM row', () => {
      const def = {
        runtimeKind: null,
        runtimeRef: null,
        runtimeConfig: null,
        handlerFunctionId: 'func-1',
        serviceProfile: SERVICE_PROFILE.DEFAULT,
      };
      const result = applyRuntimeDefaults(def);
      assert.equal(result.runtimeKind, RUNTIME_KIND.WASM_COMPONENT);
      assert.equal(result.runtimeRef, 'func-1');
    });

    it('should infer native_js for legacy admin row', () => {
      const def = {
        runtimeKind: null,
        runtimeRef: null,
        runtimeConfig: null,
        handlerFunctionId: null,
        serviceProfile: SERVICE_PROFILE.DEFAULT,
      };
      const result = applyRuntimeDefaults(def);
      assert.equal(result.runtimeKind, RUNTIME_KIND.NATIVE_JS);
      assert.equal(result.runtimeRef, null);
    });

    it('should not mutate the input object', () => {
      const def = {
        runtimeKind: null,
        handlerFunctionId: 'func-1',
        serviceProfile: SERVICE_PROFILE.DEFAULT,
      };
      applyRuntimeDefaults(def);
      assert.equal(def.runtimeKind, null);
    });
  });

  describe('applyLegacyDefaults', () => {
    it('should preserve existing handlerFunctionId', () => {
      const def = {
        handlerFunctionId: 'existing-func',
        runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
        runtimeRef: 'other-ref',
      };
      const result = applyLegacyDefaults(def);
      assert.equal(result.handlerFunctionId, 'existing-func');
    });

    it('should infer handler from wasm_component runtime', () => {
      const def = {
        handlerFunctionId: null,
        runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
        runtimeRef: 'module-xyz',
      };
      const result = applyLegacyDefaults(def);
      assert.equal(result.handlerFunctionId, 'module-xyz');
    });

    it('should set null handler for native_js runtime', () => {
      const def = {
        handlerFunctionId: null,
        runtimeKind: RUNTIME_KIND.NATIVE_JS,
        runtimeRef: 'admin-handler',
      };
      const result = applyLegacyDefaults(def);
      assert.equal(result.handlerFunctionId, null);
    });

    it('should set null handler for oci_container runtime', () => {
      const def = {
        handlerFunctionId: null,
        runtimeKind: RUNTIME_KIND.OCI_CONTAINER,
        runtimeRef: 'registry/repo@sha256:abc',
      };
      const result = applyLegacyDefaults(def);
      assert.equal(result.handlerFunctionId, null);
    });

    it('should infer handler when handlerFunctionId is undefined',
      () => {
        const def = {
          runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
          runtimeRef: 'mod-1',
        };
        const result = applyLegacyDefaults(def);
        assert.equal(result.handlerFunctionId, 'mod-1');
      });

    it('should not mutate the input object', () => {
      const def = {
        handlerFunctionId: null,
        runtimeKind: RUNTIME_KIND.NATIVE_JS,
        runtimeRef: null,
      };
      applyLegacyDefaults(def);
      assert.equal(def.handlerFunctionId, null);
    });
  });
});
