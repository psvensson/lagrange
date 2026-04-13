/**
 * Unit tests for runtime-specific policy gates enforced
 * prior to activation.
 *
 * Validates: Requirements 9.2, 9.4
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  OCI_POLICY_ERROR,
  OCI_POLICY_DECISION,
  validateRegistryPolicy,
  checkRegistryAllowed,
  checkRepositoryAllowed,
  enforceImagePolicy,
} from '../../src/runtime/oci-registry-policy.js';
import {NativeJsDriver} from '../../src/runtime/native-js-driver.js';
import {
  WasmComponentDriver,
} from '../../src/runtime/wasm-component-driver.js';
import {
  OciContainerDriver,
} from '../../src/runtime/oci-container-driver.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';

// --- OCI policy gate tests ---

describe('OCI enforceImagePolicy', () => {
  it('denies when no policy', () => {
    const result = enforceImagePolicy(
      'ghcr.io/myorg/myimage@sha256:abc', null,
    );
    assert.equal(result.allowed, false);
    assert.equal(result.decision, OCI_POLICY_DECISION.DENIED);
    assert.ok(result.errors.includes(
      OCI_POLICY_ERROR.DENY_BY_DEFAULT,
    ));
  });

  it('denies when ref is missing', () => {
    const policy = {allowedRegistries: ['ghcr.io']};
    const result = enforceImagePolicy(null, policy);
    assert.equal(result.allowed, false);
    assert.equal(result.decision, OCI_POLICY_DECISION.DENIED);
    assert.ok(result.errors.includes(
      OCI_POLICY_ERROR.REF_REQUIRED,
    ));
  });

  it('allows when registry is in allowlist', () => {
    const policy = {allowedRegistries: ['ghcr.io']};
    const result = enforceImagePolicy(
      'ghcr.io/myorg/myimage@sha256:abc', policy,
    );
    assert.equal(result.allowed, true);
    assert.equal(result.decision, OCI_POLICY_DECISION.ALLOWED);
    assert.equal(result.errors, undefined);
  });

  it('denies when registry is not in allowlist', () => {
    const policy = {allowedRegistries: ['docker.io']};
    const result = enforceImagePolicy(
      'ghcr.io/myorg/myimage', policy,
    );
    assert.equal(result.allowed, false);
    assert.equal(result.decision, OCI_POLICY_DECISION.DENIED);
    assert.ok(result.errors.includes(
      OCI_POLICY_ERROR.REGISTRY_DENIED,
    ));
  });

  it('allows wildcard registry', () => {
    const policy = {allowedRegistries: ['*']};
    const result = enforceImagePolicy(
      'anything.io/repo/image@sha256:abc', policy,
    );
    assert.equal(result.allowed, true);
    assert.equal(result.decision, OCI_POLICY_DECISION.ALLOWED);
  });

  it('denies when repository is not in allowlist', () => {
    const policy = {
      allowedRegistries: ['ghcr.io'],
      allowedRepositories: ['org/allowed'],
    };
    const result = enforceImagePolicy(
      'ghcr.io/org/denied', policy,
    );
    assert.equal(result.allowed, false);
    assert.equal(result.decision, OCI_POLICY_DECISION.DENIED);
    assert.ok(result.errors.includes(
      OCI_POLICY_ERROR.REPOSITORY_DENIED,
    ));
  });

  it('allows matching repository', () => {
    const policy = {
      allowedRegistries: ['ghcr.io'],
      allowedRepositories: ['org/allowed'],
    };
    const result = enforceImagePolicy(
      'ghcr.io/org/allowed', policy,
    );
    assert.equal(result.allowed, true);
    assert.equal(result.decision, OCI_POLICY_DECISION.ALLOWED);
  });

  it('allows repository prefix match', () => {
    const policy = {
      allowedRegistries: ['ghcr.io'],
      allowedRepositories: ['org/'],
    };
    const result = enforceImagePolicy(
      'ghcr.io/org/anything', policy,
    );
    assert.equal(result.allowed, true);
    assert.equal(result.decision, OCI_POLICY_DECISION.ALLOWED);
  });
});

// --- validateRegistryPolicy tests ---

describe('OCI validateRegistryPolicy', () => {
  it('rejects null policy', () => {
    const result = validateRegistryPolicy(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      OCI_POLICY_ERROR.POLICY_REQUIRED,
    ));
  });

  it('rejects non-object policy', () => {
    const result = validateRegistryPolicy('not-an-object');
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      OCI_POLICY_ERROR.POLICY_NOT_OBJECT,
    ));
  });

  it('rejects missing allowedRegistries', () => {
    const result = validateRegistryPolicy({});
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      OCI_POLICY_ERROR.ALLOWLIST_REQUIRED,
    ));
  });

  it('accepts valid policy', () => {
    const result = validateRegistryPolicy({
      allowedRegistries: ['ghcr.io'],
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors, undefined);
  });
});

// --- Driver descriptor validation as policy gate ---

describe('Driver descriptor validation as policy gate', () => {
  it('NativeJsDriver rejects missing runtime_ref', () => {
    const driver = new NativeJsDriver();
    const result = driver.validateDescriptor({
      serviceId: 'svc-1',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('WasmComponentDriver rejects missing runtime_ref', () => {
    const driver = new WasmComponentDriver();
    const result = driver.validateDescriptor({
      serviceId: 'svc-1',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('OciContainerDriver rejects missing digest', () => {
    const driver = new OciContainerDriver();
    const result = driver.validateDescriptor({
      serviceId: 'svc-1',
      runtime_ref: 'ghcr.io/myorg/myimage:latest',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('NativeJsDriver rejects empty definition', () => {
    const driver = new NativeJsDriver();
    assert.equal(
      driver.validateDescriptor(null).valid, false,
    );
    assert.equal(
      driver.validateDescriptor(undefined).valid, false,
    );
  });

  it('WasmComponentDriver rejects empty definition', () => {
    const driver = new WasmComponentDriver();
    assert.equal(
      driver.validateDescriptor(null).valid, false,
    );
    assert.equal(
      driver.validateDescriptor(undefined).valid, false,
    );
  });

  it('OciContainerDriver rejects empty definition', () => {
    const driver = new OciContainerDriver();
    assert.equal(
      driver.validateDescriptor(null).valid, false,
    );
    assert.equal(
      driver.validateDescriptor(undefined).valid, false,
    );
  });
});

// --- Deny-by-default semantics ---

describe('OCI deny-by-default semantics', () => {
  it('denies when no policy configured', () => {
    const result = enforceImagePolicy(
      'ghcr.io/repo', null,
    );
    assert.equal(result.allowed, false);
    assert.equal(result.decision, OCI_POLICY_DECISION.DENIED);
    assert.ok(result.errors.includes(
      OCI_POLICY_ERROR.DENY_BY_DEFAULT,
    ));
  });

  it('denies when empty allowlist', () => {
    const result = enforceImagePolicy(
      'ghcr.io/repo', {allowedRegistries: []},
    );
    assert.equal(result.allowed, false);
    assert.equal(result.decision, OCI_POLICY_DECISION.DENIED);
    assert.ok(result.errors.includes(
      OCI_POLICY_ERROR.REGISTRY_DENIED,
    ));
  });
});
