// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRuntimeKind,
  validateRuntimeConfig,
  validateRuntimeDescriptor,
  unknownKindMessage,
  DESCRIPTOR_ERROR,
} from '../../src/wasm-service/runtime-descriptor-validator.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';

describe('runtime-descriptor-validator', () => {
  describe('validateRuntimeKind', () => {
    it('should accept native_js', () => {
      const result = validateRuntimeKind(RUNTIME_KIND.NATIVE_JS);
      assert.equal(result.valid, true);
    });

    it('should accept wasm_component', () => {
      const result = validateRuntimeKind(RUNTIME_KIND.WASM_COMPONENT);
      assert.equal(result.valid, true);
    });

    it('should accept oci_container', () => {
      const result = validateRuntimeKind(RUNTIME_KIND.OCI_CONTAINER);
      assert.equal(result.valid, true);
    });

    it('should reject null kind', () => {
      const result = validateRuntimeKind(null);
      assert.equal(result.valid, false);
      assert.deepStrictEqual(
        result.errors, [DESCRIPTOR_ERROR.KIND_REQUIRED],
      );
    });

    it('should reject undefined kind', () => {
      const result = validateRuntimeKind(undefined);
      assert.equal(result.valid, false);
      assert.deepStrictEqual(
        result.errors, [DESCRIPTOR_ERROR.KIND_REQUIRED],
      );
    });

    it('should reject non-string kind', () => {
      const result = validateRuntimeKind(42);
      assert.equal(result.valid, false);
      assert.deepStrictEqual(
        result.errors, [DESCRIPTOR_ERROR.KIND_NOT_STRING],
      );
    });

    it('should reject unknown string kind', () => {
      const result = validateRuntimeKind('docker_swarm');
      assert.equal(result.valid, false);
      assert.equal(result.errors.length, 1);
      assert.ok(result.errors[0].includes('docker_swarm'));
      assert.ok(result.errors[0].includes(RUNTIME_KIND.NATIVE_JS));
      assert.ok(result.errors[0].includes(RUNTIME_KIND.WASM_COMPONENT));
      assert.ok(result.errors[0].includes(RUNTIME_KIND.OCI_CONTAINER));
    });
  });

  describe('validateRuntimeConfig', () => {
    it('should accept null config', () => {
      const result = validateRuntimeConfig(null);
      assert.equal(result.valid, true);
    });

    it('should accept undefined config', () => {
      const result = validateRuntimeConfig(undefined);
      assert.equal(result.valid, true);
    });

    it('should accept valid JSON string', () => {
      const result = validateRuntimeConfig('{"timeout":5000}');
      assert.equal(result.valid, true);
    });

    it('should accept empty JSON object string', () => {
      const result = validateRuntimeConfig('{}');
      assert.equal(result.valid, true);
    });

    it('should reject non-string config', () => {
      const result = validateRuntimeConfig({timeout: 5000});
      assert.equal(result.valid, false);
      assert.deepStrictEqual(
        result.errors, [DESCRIPTOR_ERROR.CONFIG_NOT_STRING],
      );
    });

    it('should reject invalid JSON string', () => {
      const result = validateRuntimeConfig('{bad json}');
      assert.equal(result.valid, false);
      assert.deepStrictEqual(
        result.errors, [DESCRIPTOR_ERROR.CONFIG_INVALID_JSON],
      );
    });
  });

  describe('validateRuntimeDescriptor', () => {
    describe('native_js descriptors', () => {
      it('should accept valid descriptor with null ref', () => {
        const result = validateRuntimeDescriptor({
          runtimeKind: RUNTIME_KIND.NATIVE_JS,
          runtimeRef: null,
          runtimeConfig: null,
        });
        assert.equal(result.valid, true);
      });

      it('should accept valid descriptor with string ref', () => {
        const result = validateRuntimeDescriptor({
          runtimeKind: RUNTIME_KIND.NATIVE_JS,
          runtimeRef: 'admin-handler',
          runtimeConfig: '{"mode":"enforce"}',
        });
        assert.equal(result.valid, true);
      });

      it('should reject non-string ref', () => {
        const result = validateRuntimeDescriptor({
          runtimeKind: RUNTIME_KIND.NATIVE_JS,
          runtimeRef: 123,
          runtimeConfig: null,
        });
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          DESCRIPTOR_ERROR.REF_NOT_STRING,
        ));
      });
    });

    describe('wasm_component descriptors', () => {
      it('should accept valid descriptor', () => {
        const result = validateRuntimeDescriptor({
          runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
          runtimeRef: 'handler-func-id',
          runtimeConfig: null,
        });
        assert.equal(result.valid, true);
      });

      it('should reject null ref', () => {
        const result = validateRuntimeDescriptor({
          runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
          runtimeRef: null,
          runtimeConfig: null,
        });
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          DESCRIPTOR_ERROR.REF_REQUIRED,
        ));
      });

      it('should reject empty string ref', () => {
        const result = validateRuntimeDescriptor({
          runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
          runtimeRef: '',
          runtimeConfig: null,
        });
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          DESCRIPTOR_ERROR.REF_EMPTY,
        ));
      });
    });

    describe('oci_container descriptors', () => {
      it('should accept valid digest reference', () => {
        const result = validateRuntimeDescriptor({
          runtimeKind: RUNTIME_KIND.OCI_CONTAINER,
          runtimeRef: 'registry.io/repo@sha256:abcdef1234567890',
          runtimeConfig: null,
        });
        assert.equal(result.valid, true);
      });

      it('should reject null ref', () => {
        const result = validateRuntimeDescriptor({
          runtimeKind: RUNTIME_KIND.OCI_CONTAINER,
          runtimeRef: null,
          runtimeConfig: null,
        });
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          DESCRIPTOR_ERROR.REF_REQUIRED,
        ));
      });

      it('should reject ref without digest marker', () => {
        const result = validateRuntimeDescriptor({
          runtimeKind: RUNTIME_KIND.OCI_CONTAINER,
          runtimeRef: 'registry.io/repo:latest',
          runtimeConfig: null,
        });
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          DESCRIPTOR_ERROR.REF_MISSING_DIGEST,
        ));
      });

      it('should reject empty string ref', () => {
        const result = validateRuntimeDescriptor({
          runtimeKind: RUNTIME_KIND.OCI_CONTAINER,
          runtimeRef: '',
          runtimeConfig: null,
        });
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          DESCRIPTOR_ERROR.REF_EMPTY,
        ));
      });
    });

    describe('fail-closed semantics', () => {
      it('should reject unknown runtime kind with diagnostic info', () => {
        const result = validateRuntimeDescriptor({
          runtimeKind: 'unknown_runtime',
          runtimeRef: 'some-ref',
          runtimeConfig: null,
        });
        assert.equal(result.valid, false);
        assert.equal(result.errors.length, 1);
        assert.ok(result.errors[0].includes('unknown_runtime'));
        assert.ok(result.errors[0].includes(RUNTIME_KIND.NATIVE_JS));
      });

      it('should reject missing runtime kind', () => {
        const result = validateRuntimeDescriptor({
          runtimeKind: null,
          runtimeRef: 'some-ref',
          runtimeConfig: null,
        });
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          DESCRIPTOR_ERROR.KIND_REQUIRED,
        ));
      });

      it('should collect ref and config errors together', () => {
        const result = validateRuntimeDescriptor({
          runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
          runtimeRef: null,
          runtimeConfig: '{bad}',
        });
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          DESCRIPTOR_ERROR.REF_REQUIRED,
        ));
        assert.ok(result.errors.includes(
          DESCRIPTOR_ERROR.CONFIG_INVALID_JSON,
        ));
      });

      it('unknownKindMessage includes value and allowed kinds', () => {
        const msg = unknownKindMessage('bad_kind');
        assert.ok(msg.includes('bad_kind'));
        assert.ok(msg.includes(RUNTIME_KIND.NATIVE_JS));
        assert.ok(msg.includes(RUNTIME_KIND.WASM_COMPONENT));
        assert.ok(msg.includes(RUNTIME_KIND.OCI_CONTAINER));
      });
    });
  });
});
