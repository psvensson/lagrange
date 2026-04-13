// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOciReference,
  validateDigestPin,
  formatOciReference,
  OCI_REFERENCE_ERROR,
} from '../../src/wasm-service/oci-reference.js';

const VALID_DIGEST =
  'sha256:' + 'a'.repeat(64);
const VALID_DIGEST_MIXED =
  'sha256:' + 'abcdef0123456789'.repeat(4);

// --- parseOciReference ---

describe('parseOciReference', () => {
  it('should parse reference with digest', () => {
    const ref = `registry.io/ns/name@${VALID_DIGEST}`;
    const result = parseOciReference(ref);
    assert.equal(result.valid, true);
    assert.equal(result.registry, 'registry.io');
    assert.equal(result.repository, 'ns/name');
    assert.equal(result.digest, VALID_DIGEST);
    assert.equal(result.tag, null);
  });

  it('should parse reference with tag', () => {
    const ref = 'registry.io/ns/name:v1.0.0';
    const result = parseOciReference(ref);
    assert.equal(result.valid, true);
    assert.equal(result.registry, 'registry.io');
    assert.equal(result.repository, 'ns/name');
    assert.equal(result.tag, 'v1.0.0');
    assert.equal(result.digest, null);
  });

  it('should parse reference with both tag and digest', () => {
    const ref =
      `registry.io/ns/name:latest@${VALID_DIGEST}`;
    const result = parseOciReference(ref);
    assert.equal(result.valid, true);
    assert.equal(result.registry, 'registry.io');
    assert.equal(result.repository, 'ns/name');
    assert.equal(result.tag, 'latest');
    assert.equal(result.digest, VALID_DIGEST);
  });

  it('should parse reference with port in registry', () => {
    const ref = `localhost:5000/myrepo@${VALID_DIGEST}`;
    const result = parseOciReference(ref);
    assert.equal(result.valid, true);
    assert.equal(result.registry, 'localhost:5000');
    assert.equal(result.repository, 'myrepo');
    assert.equal(result.digest, VALID_DIGEST);
  });

  it('should parse deep repository path', () => {
    const ref =
      `ghcr.io/org/sub/image:v2@${VALID_DIGEST_MIXED}`;
    const result = parseOciReference(ref);
    assert.equal(result.valid, true);
    assert.equal(result.registry, 'ghcr.io');
    assert.equal(result.repository, 'org/sub/image');
    assert.equal(result.tag, 'v2');
    assert.equal(result.digest, VALID_DIGEST_MIXED);
  });

  it('should reject null reference', () => {
    const result = parseOciReference(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      OCI_REFERENCE_ERROR.REFERENCE_REQUIRED,
    ));
  });

  it('should reject undefined reference', () => {
    const result = parseOciReference(undefined);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      OCI_REFERENCE_ERROR.REFERENCE_REQUIRED,
    ));
  });

  it('should reject empty string', () => {
    const result = parseOciReference('');
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      OCI_REFERENCE_ERROR.REFERENCE_REQUIRED,
    ));
  });

  it('should reject non-string input', () => {
    const result = parseOciReference(42);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      OCI_REFERENCE_ERROR.REFERENCE_NOT_STRING,
    ));
  });

  it('should reject reference without slash', () => {
    const result = parseOciReference('noslash:tag');
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      OCI_REFERENCE_ERROR.REGISTRY_REQUIRED,
    ));
  });

  it('should reject invalid digest format', () => {
    const ref = 'registry.io/repo@sha256:tooshort';
    const result = parseOciReference(ref);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      OCI_REFERENCE_ERROR.DIGEST_INVALID_FORMAT,
    ));
  });

  it('should reject reference with no tag or digest', () => {
    const ref = 'registry.io/repo';
    const result = parseOciReference(ref);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      OCI_REFERENCE_ERROR.TAG_OR_DIGEST_REQUIRED,
    ));
  });
});

// --- validateDigestPin ---

describe('validateDigestPin', () => {
  it('should accept reference with digest', () => {
    const ref = `registry.io/ns/name@${VALID_DIGEST}`;
    const result = validateDigestPin(ref);
    assert.equal(result.valid, true);
    assert.equal(result.digest, VALID_DIGEST);
  });

  it('should accept reference with tag and digest', () => {
    const ref =
      `registry.io/ns/name:v1@${VALID_DIGEST}`;
    const result = validateDigestPin(ref);
    assert.equal(result.valid, true);
    assert.equal(result.digest, VALID_DIGEST);
  });

  it('should reject tag-only reference', () => {
    const ref = 'registry.io/ns/name:latest';
    const result = validateDigestPin(ref);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      OCI_REFERENCE_ERROR.DIGEST_PIN_REQUIRED,
    ));
    assert.ok(result.errors.includes(
      OCI_REFERENCE_ERROR.TAG_ONLY_NOT_PINNED,
    ));
  });

  it('should reject invalid reference', () => {
    const result = validateDigestPin('');
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('should reject invalid digest in reference', () => {
    const ref = 'registry.io/repo@sha256:bad';
    const result = validateDigestPin(ref);
    assert.equal(result.valid, false);
  });
});

// --- formatOciReference ---

describe('formatOciReference', () => {
  it('should format with tag only', () => {
    const result = formatOciReference({
      registry: 'registry.io',
      repository: 'ns/name',
      tag: 'v1.0.0',
    });
    assert.equal(result.valid, true);
    assert.equal(
      result.reference, 'registry.io/ns/name:v1.0.0',
    );
  });

  it('should format with digest only', () => {
    const result = formatOciReference({
      registry: 'registry.io',
      repository: 'ns/name',
      digest: VALID_DIGEST,
    });
    assert.equal(result.valid, true);
    assert.equal(
      result.reference,
      `registry.io/ns/name@${VALID_DIGEST}`,
    );
  });

  it('should format with both tag and digest', () => {
    const result = formatOciReference({
      registry: 'registry.io',
      repository: 'ns/name',
      tag: 'latest',
      digest: VALID_DIGEST,
    });
    assert.equal(result.valid, true);
    assert.equal(
      result.reference,
      `registry.io/ns/name:latest@${VALID_DIGEST}`,
    );
  });

  it('should reject missing registry', () => {
    const result = formatOciReference({
      repository: 'ns/name',
      tag: 'v1',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      OCI_REFERENCE_ERROR.REGISTRY_REQUIRED_FOR_FORMAT,
    ));
  });

  it('should reject missing repository', () => {
    const result = formatOciReference({
      registry: 'registry.io',
      tag: 'v1',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      OCI_REFERENCE_ERROR.REPOSITORY_REQUIRED_FOR_FORMAT,
    ));
  });

  it('should round-trip a digest reference', () => {
    const original =
      `registry.io/ns/name@${VALID_DIGEST}`;
    const parsed = parseOciReference(original);
    assert.equal(parsed.valid, true);
    const formatted = formatOciReference(parsed);
    assert.equal(formatted.valid, true);
    assert.equal(formatted.reference, original);
  });

  it('should round-trip a tag reference', () => {
    const original = 'registry.io/ns/name:v2.1.0';
    const parsed = parseOciReference(original);
    assert.equal(parsed.valid, true);
    const formatted = formatOciReference(parsed);
    assert.equal(formatted.valid, true);
    assert.equal(formatted.reference, original);
  });

  it('should round-trip a tag+digest reference', () => {
    const original =
      `registry.io/ns/name:latest@${VALID_DIGEST}`;
    const parsed = parseOciReference(original);
    assert.equal(parsed.valid, true);
    const formatted = formatOciReference(parsed);
    assert.equal(formatted.valid, true);
    assert.equal(formatted.reference, original);
  });
});
