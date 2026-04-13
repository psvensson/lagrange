/**
 * Unit tests for OCI registry and source policy enforcement.
 *
 * Validates: Requirements 9.2, 9.3, 9.5
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

import {
  OCI_POLICY_ERROR,
  OCI_POLICY_FIELD,
  OCI_POLICY_DECISION,
  WILDCARD,
  validateRegistryPolicy,
  checkRegistryAllowed,
  checkRepositoryAllowed,
  enforceImagePolicy,
} from '../../src/runtime/oci-registry-policy.js';

describe('OCI registry policy', () => {
  describe('policy validation', () => {
    it('should accept valid policy with allowedRegistries', () => {
      const result = validateRegistryPolicy({
        [OCI_POLICY_FIELD.ALLOWED_REGISTRIES]: ['docker.io'],
      });
      assert.equal(result.valid, true);
    });

    it('should reject missing policy (null)', () => {
      const result = validateRegistryPolicy(null);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_POLICY_ERROR.POLICY_REQUIRED,
      ));
    });

    it('should reject missing policy (undefined)', () => {
      const result = validateRegistryPolicy(undefined);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_POLICY_ERROR.POLICY_REQUIRED,
      ));
    });

    it('should reject non-object policy (string)', () => {
      const result = validateRegistryPolicy('not-an-object');
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_POLICY_ERROR.POLICY_NOT_OBJECT,
      ));
    });

    it('should reject non-object policy (array)', () => {
      const result = validateRegistryPolicy([]);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_POLICY_ERROR.POLICY_NOT_OBJECT,
      ));
    });

    it('should reject missing allowedRegistries', () => {
      const result = validateRegistryPolicy({});
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        OCI_POLICY_ERROR.ALLOWLIST_REQUIRED,
      ));
    });

    it('should accept valid policy with optional repos', () => {
      const result = validateRegistryPolicy({
        [OCI_POLICY_FIELD.ALLOWED_REGISTRIES]: ['ghcr.io'],
        [OCI_POLICY_FIELD.ALLOWED_REPOSITORIES]: ['myorg/'],
      });
      assert.equal(result.valid, true);
    });
  });

  describe('registry check', () => {
    it('should allow registry in allowlist', () => {
      const policy = {
        [OCI_POLICY_FIELD.ALLOWED_REGISTRIES]: [
          'docker.io', 'ghcr.io',
        ],
      };
      const result = checkRegistryAllowed('docker.io', policy);
      assert.equal(result.decision, OCI_POLICY_DECISION.ALLOWED);
    });

    it('should deny registry not in allowlist', () => {
      const policy = {
        [OCI_POLICY_FIELD.ALLOWED_REGISTRIES]: ['docker.io'],
      };
      const result = checkRegistryAllowed('evil.io', policy);
      assert.equal(result.decision, OCI_POLICY_DECISION.DENIED);
      assert.equal(result.reason, OCI_POLICY_ERROR.REGISTRY_DENIED);
    });

    it('should allow all registries with wildcard', () => {
      const policy = {
        [OCI_POLICY_FIELD.ALLOWED_REGISTRIES]: [WILDCARD],
      };
      const result = checkRegistryAllowed('anything.io', policy);
      assert.equal(result.decision, OCI_POLICY_DECISION.ALLOWED);
    });

    it('should deny by default when no policy', () => {
      const result = checkRegistryAllowed('docker.io', null);
      assert.equal(result.decision, OCI_POLICY_DECISION.DENIED);
      assert.equal(
        result.reason, OCI_POLICY_ERROR.DENY_BY_DEFAULT,
      );
    });
  });

  describe('repository check', () => {
    it('should allow when no repo restrictions', () => {
      const policy = {
        [OCI_POLICY_FIELD.ALLOWED_REGISTRIES]: ['docker.io'],
      };
      const result = checkRepositoryAllowed(
        'myorg/myimage', policy,
      );
      assert.equal(result.decision, OCI_POLICY_DECISION.ALLOWED);
    });

    it('should allow matching repository', () => {
      const policy = {
        [OCI_POLICY_FIELD.ALLOWED_REGISTRIES]: ['docker.io'],
        [OCI_POLICY_FIELD.ALLOWED_REPOSITORIES]: [
          'myorg/myimage',
        ],
      };
      const result = checkRepositoryAllowed(
        'myorg/myimage', policy,
      );
      assert.equal(result.decision, OCI_POLICY_DECISION.ALLOWED);
    });

    it('should deny non-matching repository', () => {
      const policy = {
        [OCI_POLICY_FIELD.ALLOWED_REGISTRIES]: ['docker.io'],
        [OCI_POLICY_FIELD.ALLOWED_REPOSITORIES]: [
          'myorg/allowed',
        ],
      };
      const result = checkRepositoryAllowed(
        'other/denied', policy,
      );
      assert.equal(result.decision, OCI_POLICY_DECISION.DENIED);
      assert.equal(
        result.reason, OCI_POLICY_ERROR.REPOSITORY_DENIED,
      );
    });

    it('should support prefix matching', () => {
      const policy = {
        [OCI_POLICY_FIELD.ALLOWED_REGISTRIES]: ['docker.io'],
        [OCI_POLICY_FIELD.ALLOWED_REPOSITORIES]: ['myorg/'],
      };
      const result = checkRepositoryAllowed(
        'myorg/any-image', policy,
      );
      assert.equal(result.decision, OCI_POLICY_DECISION.ALLOWED);
    });

    it('should deny by default when no policy', () => {
      const result = checkRepositoryAllowed(
        'myorg/myimage', null,
      );
      assert.equal(result.decision, OCI_POLICY_DECISION.DENIED);
      assert.equal(
        result.reason, OCI_POLICY_ERROR.DENY_BY_DEFAULT,
      );
    });
  });

  describe('full enforcement', () => {
    const validPolicy = {
      [OCI_POLICY_FIELD.ALLOWED_REGISTRIES]: ['docker.io'],
      [OCI_POLICY_FIELD.ALLOWED_REPOSITORIES]: ['myorg/'],
    };

    it('should allow image matching policy', () => {
      const result = enforceImagePolicy(
        'docker.io/myorg/app@sha256:abc', validPolicy,
      );
      assert.equal(result.allowed, true);
      assert.equal(
        result.decision, OCI_POLICY_DECISION.ALLOWED,
      );
    });

    it('should deny image from disallowed registry', () => {
      const result = enforceImagePolicy(
        'evil.io/myorg/app', validPolicy,
      );
      assert.equal(result.allowed, false);
      assert.equal(
        result.decision, OCI_POLICY_DECISION.DENIED,
      );
      assert.ok(result.errors.includes(
        OCI_POLICY_ERROR.REGISTRY_DENIED,
      ));
    });

    it('should deny image from disallowed repository', () => {
      const result = enforceImagePolicy(
        'docker.io/other/app', validPolicy,
      );
      assert.equal(result.allowed, false);
      assert.equal(
        result.decision, OCI_POLICY_DECISION.DENIED,
      );
      assert.ok(result.errors.includes(
        OCI_POLICY_ERROR.REPOSITORY_DENIED,
      ));
    });

    it('should deny by default when no policy', () => {
      const result = enforceImagePolicy(
        'docker.io/myorg/app', null,
      );
      assert.equal(result.allowed, false);
      assert.ok(result.errors.includes(
        OCI_POLICY_ERROR.DENY_BY_DEFAULT,
      ));
    });

    it('should deny null ref', () => {
      const result = enforceImagePolicy(null, validPolicy);
      assert.equal(result.allowed, false);
      assert.ok(result.errors.includes(
        OCI_POLICY_ERROR.REF_REQUIRED,
      ));
    });

    it('should deny non-string ref', () => {
      const result = enforceImagePolicy(42, validPolicy);
      assert.equal(result.allowed, false);
      assert.ok(result.errors.includes(
        OCI_POLICY_ERROR.REF_REQUIRED,
      ));
    });

    it('should deny empty string ref', () => {
      const result = enforceImagePolicy('', validPolicy);
      assert.equal(result.allowed, false);
      assert.ok(result.errors.includes(
        OCI_POLICY_ERROR.REF_REQUIRED,
      ));
    });
  });

  describe('property-based: deny-by-default', () => {
    it('should deny arbitrary registries not in allowlist',
      () => {
        const allowedList = ['docker.io', 'ghcr.io'];
        const policy = {
          [OCI_POLICY_FIELD.ALLOWED_REGISTRIES]: allowedList,
        };
        fc.assert(
          fc.property(
            fc.string({minLength: 1}).filter(
              (s) => !allowedList.includes(s),
            ),
            (registry) => {
              const result = checkRegistryAllowed(
                registry, policy,
              );
              assert.equal(
                result.decision,
                OCI_POLICY_DECISION.DENIED,
              );
            },
          ),
          {numRuns: 10},
        );
      });
  });
});
