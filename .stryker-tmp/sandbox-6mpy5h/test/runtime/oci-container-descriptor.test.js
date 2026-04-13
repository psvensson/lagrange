/**
 * Unit tests for OCI container descriptor model and validation.
 *
 * Validates: Requirements 4.1, 4.2, 9.3
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

import {
  OCI_DESCRIPTOR_FIELD,
  OCI_CONFIG_FIELD,
  OCI_NETWORK_POLICY,
  ALLOWED_NETWORK_POLICIES,
  OCI_DESCRIPTOR_ERROR,
  OCI_FEATURE_GATE,
  validateOciDescriptorRef,
  validateOciRuntimeConfig,
  validateOciDescriptor,
  isOciFeatureGateEnabled,
} from '../../src/runtime/oci-container-descriptor.js';

// --- Helpers ---

const VALID_DIGEST_REF =
  'registry.io/ns/name@sha256:' + 'a'.repeat(64);

const VALID_CONFIG_JSON = JSON.stringify({
  memoryLimitMb: 512,
  cpuLimit: 2.0,
  networkPolicy: 'isolated',
  healthCheckIntervalMs: 5000,
});

describe('OCI container descriptor', () => {
  describe('constants', () => {
    it('should export frozen OCI_DESCRIPTOR_FIELD', () => {
      assert.ok(Object.isFrozen(OCI_DESCRIPTOR_FIELD));
      assert.equal(
        OCI_DESCRIPTOR_FIELD.IMAGE_REF, 'imageRef',
      );
    });

    it('should export frozen OCI_CONFIG_FIELD', () => {
      assert.ok(Object.isFrozen(OCI_CONFIG_FIELD));
      assert.equal(
        OCI_CONFIG_FIELD.MEMORY_LIMIT_MB, 'memoryLimitMb',
      );
    });

    it('should export frozen OCI_NETWORK_POLICY', () => {
      assert.ok(Object.isFrozen(OCI_NETWORK_POLICY));
      assert.equal(OCI_NETWORK_POLICY.NONE, 'none');
      assert.equal(OCI_NETWORK_POLICY.HOST, 'host');
      assert.equal(OCI_NETWORK_POLICY.ISOLATED, 'isolated');
    });

    it('should have ALLOWED_NETWORK_POLICIES matching enum',
      () => {
        assert.equal(ALLOWED_NETWORK_POLICIES.size, 3);
        assert.ok(
          ALLOWED_NETWORK_POLICIES.has(OCI_NETWORK_POLICY.NONE),
        );
        assert.ok(
          ALLOWED_NETWORK_POLICIES.has(OCI_NETWORK_POLICY.HOST),
        );
        assert.ok(
          ALLOWED_NETWORK_POLICIES.has(
            OCI_NETWORK_POLICY.ISOLATED,
          ),
        );
      });

    it('should export frozen OCI_DESCRIPTOR_ERROR', () => {
      assert.ok(Object.isFrozen(OCI_DESCRIPTOR_ERROR));
    });

    it('should export frozen OCI_FEATURE_GATE', () => {
      assert.ok(Object.isFrozen(OCI_FEATURE_GATE));
      assert.equal(
        OCI_FEATURE_GATE.KEY, 'oci_container_enabled',
      );
      assert.equal(OCI_FEATURE_GATE.DEFAULT, false);
    });
  });

  describe('validateOciDescriptorRef', () => {
    it('should accept valid digest ref', () => {
      const result = validateOciDescriptorRef(VALID_DIGEST_REF);
      assert.equal(result.valid, true);
      assert.ok(result.parsed);
      assert.ok(result.parsed.digest);
    });

    it('should reject null ref', () => {
      const result = validateOciDescriptorRef(null);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DESCRIPTOR_ERROR.REF_REQUIRED,
      ));
    });

    it('should reject undefined ref', () => {
      const result = validateOciDescriptorRef(undefined);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DESCRIPTOR_ERROR.REF_REQUIRED,
      ));
    });

    it('should reject empty string ref', () => {
      const result = validateOciDescriptorRef('');
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DESCRIPTOR_ERROR.REF_EMPTY,
      ));
    });

    it('should reject whitespace-only ref', () => {
      const result = validateOciDescriptorRef('   ');
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DESCRIPTOR_ERROR.REF_EMPTY,
      ));
    });

    it('should reject non-string ref', () => {
      const result = validateOciDescriptorRef(42);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DESCRIPTOR_ERROR.REF_NOT_STRING,
      ));
    });

    it('should reject tag-only ref (no digest)', () => {
      const result = validateOciDescriptorRef(
        'registry.io/ns/name:v1',
      );
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DESCRIPTOR_ERROR.DIGEST_REQUIRED,
      ));
    });

    it('should reject invalid digest format', () => {
      const result = validateOciDescriptorRef(
        'registry.io/ns/name@sha256:invalid',
      );
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(
        (e) => e === OCI_DESCRIPTOR_ERROR.DIGEST_INVALID ||
               e === OCI_DESCRIPTOR_ERROR.DIGEST_REQUIRED,
      ));
    });
  });

  describe('validateOciRuntimeConfig', () => {
    it('should accept null config (optional)', () => {
      const result = validateOciRuntimeConfig(null);
      assert.equal(result.valid, true);
    });

    it('should accept undefined config (optional)', () => {
      const result = validateOciRuntimeConfig(undefined);
      assert.equal(result.valid, true);
    });

    it('should accept valid JSON config', () => {
      const result = validateOciRuntimeConfig(
        VALID_CONFIG_JSON,
      );
      assert.equal(result.valid, true);
      assert.ok(result.config);
      assert.equal(result.config.memoryLimitMb, 512);
    });

    it('should accept empty JSON object', () => {
      const result = validateOciRuntimeConfig('{}');
      assert.equal(result.valid, true);
    });

    it('should reject non-string config', () => {
      const result = validateOciRuntimeConfig(123);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DESCRIPTOR_ERROR.CONFIG_NOT_STRING,
      ));
    });

    it('should reject invalid JSON', () => {
      const result = validateOciRuntimeConfig('{bad json}');
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DESCRIPTOR_ERROR.CONFIG_INVALID_JSON,
      ));
    });

    it('should reject invalid memoryLimitMb', () => {
      const cfg = JSON.stringify({memoryLimitMb: -1});
      const result = validateOciRuntimeConfig(cfg);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DESCRIPTOR_ERROR.MEMORY_LIMIT_INVALID,
      ));
    });

    it('should reject zero memoryLimitMb', () => {
      const cfg = JSON.stringify({memoryLimitMb: 0});
      const result = validateOciRuntimeConfig(cfg);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DESCRIPTOR_ERROR.MEMORY_LIMIT_INVALID,
      ));
    });

    it('should reject non-number memoryLimitMb', () => {
      const cfg = JSON.stringify({memoryLimitMb: 'big'});
      const result = validateOciRuntimeConfig(cfg);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DESCRIPTOR_ERROR.MEMORY_LIMIT_INVALID,
      ));
    });

    it('should reject invalid cpuLimit', () => {
      const cfg = JSON.stringify({cpuLimit: -0.5});
      const result = validateOciRuntimeConfig(cfg);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DESCRIPTOR_ERROR.CPU_LIMIT_INVALID,
      ));
    });

    it('should reject zero cpuLimit', () => {
      const cfg = JSON.stringify({cpuLimit: 0});
      const result = validateOciRuntimeConfig(cfg);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DESCRIPTOR_ERROR.CPU_LIMIT_INVALID,
      ));
    });

    it('should reject invalid networkPolicy', () => {
      const cfg = JSON.stringify({networkPolicy: 'bridge'});
      const result = validateOciRuntimeConfig(cfg);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DESCRIPTOR_ERROR.NETWORK_POLICY_INVALID,
      ));
    });

    it('should reject non-integer healthCheckIntervalMs',
      () => {
        const cfg = JSON.stringify({
          healthCheckIntervalMs: 1.5,
        });
        const result = validateOciRuntimeConfig(cfg);
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          OCI_DESCRIPTOR_ERROR.HEALTH_CHECK_INTERVAL_INVALID,
        ));
      });

    it('should reject negative healthCheckIntervalMs', () => {
      const cfg = JSON.stringify({healthCheckIntervalMs: -100});
      const result = validateOciRuntimeConfig(cfg);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DESCRIPTOR_ERROR.HEALTH_CHECK_INTERVAL_INVALID,
      ));
    });

    it('should reject zero healthCheckIntervalMs', () => {
      const cfg = JSON.stringify({healthCheckIntervalMs: 0});
      const result = validateOciRuntimeConfig(cfg);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DESCRIPTOR_ERROR.HEALTH_CHECK_INTERVAL_INVALID,
      ));
    });

    it('should collect multiple config errors', () => {
      const cfg = JSON.stringify({
        memoryLimitMb: -1,
        cpuLimit: 0,
        networkPolicy: 'bad',
      });
      const result = validateOciRuntimeConfig(cfg);
      assert.equal(result.valid, false);
      assert.ok(result.errors.length >= 3);
    });
  });

  describe('validateOciDescriptor', () => {
    it('should accept valid descriptor', () => {
      const result = validateOciDescriptor({
        runtime_ref: VALID_DIGEST_REF,
        runtime_config: VALID_CONFIG_JSON,
      });
      assert.equal(result.valid, true);
    });

    it('should accept descriptor with no config', () => {
      const result = validateOciDescriptor({
        runtime_ref: VALID_DIGEST_REF,
      });
      assert.equal(result.valid, true);
    });

    it('should reject invalid ref', () => {
      const result = validateOciDescriptor({
        runtime_ref: 'no-digest',
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.length > 0);
    });

    it('should reject invalid config', () => {
      const result = validateOciDescriptor({
        runtime_ref: VALID_DIGEST_REF,
        runtime_config: '{bad}',
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DESCRIPTOR_ERROR.CONFIG_INVALID_JSON,
      ));
    });

    it('should collect errors from both ref and config', () => {
      const result = validateOciDescriptor({
        runtime_ref: null,
        runtime_config: '{bad}',
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DESCRIPTOR_ERROR.REF_REQUIRED,
      ));
      assert.ok(result.errors.includes(
        OCI_DESCRIPTOR_ERROR.CONFIG_INVALID_JSON,
      ));
    });

    it('should handle null descriptor', () => {
      const result = validateOciDescriptor(null);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_DESCRIPTOR_ERROR.REF_REQUIRED,
      ));
    });
  });

  describe('isOciFeatureGateEnabled', () => {
    it('should return false by default (null map)', () => {
      assert.equal(isOciFeatureGateEnabled(null), false);
    });

    it('should return false by default (undefined map)', () => {
      assert.equal(isOciFeatureGateEnabled(undefined), false);
    });

    it('should return false when key is missing', () => {
      assert.equal(isOciFeatureGateEnabled({}), false);
    });

    it('should return false when key is false', () => {
      const map = {[OCI_FEATURE_GATE.KEY]: false};
      assert.equal(isOciFeatureGateEnabled(map), false);
    });

    it('should return false when key is truthy non-boolean',
      () => {
        const map = {[OCI_FEATURE_GATE.KEY]: 'true'};
        assert.equal(isOciFeatureGateEnabled(map), false);
      });

    it('should return true when explicitly true', () => {
      const map = {[OCI_FEATURE_GATE.KEY]: true};
      assert.equal(isOciFeatureGateEnabled(map), true);
    });
  });

  describe('property-based: ref validation', () => {
    it('should reject arbitrary strings without @sha256:',
      () => {
        fc.assert(
          fc.property(
            fc.string().filter(
              (s) => !s.includes('@sha256:'),
            ),
            (s) => {
              const result = validateOciDescriptorRef(s);
              assert.equal(result.valid, false);
            },
          ),
          {numRuns: 10},
        );
      });
  });
});
