import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePackageReference,
  formatPackageReference,
  validatePackageReference,
  PKG_REF_ERROR,
} from '../../src/wasm-service/package-reference.js';

// --- parsePackageReference ---

describe('parsePackageReference', () => {
  it('should parse a valid reference', () => {
    const result = parsePackageReference('acme:fraud-policy@1.4.2');
    assert.equal(result.valid, true);
    assert.equal(result.namespace, 'acme');
    assert.equal(result.name, 'fraud-policy');
    assert.equal(result.version, '1.4.2');
  });

  it('should parse a reference with semver pre-release', () => {
    const result = parsePackageReference(
      'ddb:sql-callbacks@0.3.0-beta+build42',
    );
    assert.equal(result.valid, true);
    assert.equal(result.namespace, 'ddb');
    assert.equal(result.name, 'sql-callbacks');
    assert.equal(result.version, '0.3.0-beta+build42');
  });

  it('should parse single-char namespace and name', () => {
    const result = parsePackageReference('a:b@1');
    assert.equal(result.valid, true);
    assert.equal(result.namespace, 'a');
    assert.equal(result.name, 'b');
    assert.equal(result.version, '1');
  });

  it('should reject empty string', () => {
    const result = parsePackageReference('');
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      PKG_REF_ERROR.INPUT_REQUIRED,
    ));
  });

  it('should reject null', () => {
    const result = parsePackageReference(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      PKG_REF_ERROR.INPUT_REQUIRED,
    ));
  });

  it('should reject undefined', () => {
    const result = parsePackageReference(undefined);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      PKG_REF_ERROR.INPUT_REQUIRED,
    ));
  });

  it('should reject non-string input', () => {
    const result = parsePackageReference(42);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      PKG_REF_ERROR.INPUT_NOT_STRING,
    ));
  });

  it('should reject missing colon separator', () => {
    const result = parsePackageReference('acme-fraud@1.0.0');
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      PKG_REF_ERROR.MISSING_NAMESPACE_SEPARATOR,
    ));
  });

  it('should reject missing @ separator', () => {
    const result = parsePackageReference('acme:fraud-policy');
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      PKG_REF_ERROR.MISSING_VERSION_SEPARATOR,
    ));
  });

  it('should reject uppercase namespace', () => {
    const result = parsePackageReference('ACME:fraud@1.0.0');
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      PKG_REF_ERROR.NAMESPACE_INVALID_FORMAT,
    ));
  });

  it('should reject namespace starting with digit', () => {
    const result = parsePackageReference('1acme:fraud@1.0.0');
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      PKG_REF_ERROR.NAMESPACE_INVALID_FORMAT,
    ));
  });

  it('should reject uppercase name', () => {
    const result = parsePackageReference('acme:FRAUD@1.0.0');
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      PKG_REF_ERROR.NAME_INVALID_FORMAT,
    ));
  });

  it('should reject version starting with letter', () => {
    const result = parsePackageReference('acme:fraud@vBad');
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      PKG_REF_ERROR.VERSION_INVALID_FORMAT,
    ));
  });

  it('should reject empty namespace segment', () => {
    const result = parsePackageReference(':fraud@1.0.0');
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      PKG_REF_ERROR.NAMESPACE_EMPTY,
    ));
  });

  it('should reject empty name segment', () => {
    const result = parsePackageReference('acme:@1.0.0');
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      PKG_REF_ERROR.NAME_EMPTY,
    ));
  });

  it('should reject empty version segment', () => {
    const result = parsePackageReference('acme:fraud@');
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      PKG_REF_ERROR.VERSION_EMPTY,
    ));
  });

  it('should collect multiple field errors', () => {
    const result = parsePackageReference(':@');
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      PKG_REF_ERROR.NAMESPACE_EMPTY,
    ));
    assert.ok(result.errors.includes(
      PKG_REF_ERROR.NAME_EMPTY,
    ));
    assert.ok(result.errors.includes(
      PKG_REF_ERROR.VERSION_EMPTY,
    ));
  });
});

// --- formatPackageReference ---

describe('formatPackageReference', () => {
  it('should format components to canonical string', () => {
    const result = formatPackageReference({
      namespace: 'acme',
      name: 'fraud-policy',
      version: '1.4.2',
    });
    assert.equal(result, 'acme:fraud-policy@1.4.2');
  });
});

// --- validatePackageReference ---

describe('validatePackageReference', () => {
  it('should accept a valid reference', () => {
    const result = validatePackageReference(
      'acme:fraud-policy@1.4.2',
    );
    assert.equal(result.valid, true);
  });

  it('should reject an invalid reference with errors', () => {
    const result = validatePackageReference('bad');
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });
});

// --- Round-trip ---

describe('round-trip: format(parse(ref))', () => {
  it('should produce the original reference', () => {
    const ref = 'acme:fraud-policy@1.4.2';
    const parsed = parsePackageReference(ref);
    assert.equal(parsed.valid, true);
    const formatted = formatPackageReference(parsed);
    assert.equal(formatted, ref);
  });

  it('should round-trip semver with pre-release', () => {
    const ref = 'ddb:sql-callbacks@0.3.0-beta+build42';
    const parsed = parsePackageReference(ref);
    assert.equal(parsed.valid, true);
    const formatted = formatPackageReference(parsed);
    assert.equal(formatted, ref);
  });
});
