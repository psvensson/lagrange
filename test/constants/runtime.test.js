/**
 * Unit tests for unified service runtime constants.
 *
 * Validates runtime kind enum, allowed kinds set, and
 * runtime descriptor field name constants.
 *
 * Requirements: 1.1, 5.1
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  RUNTIME_KIND,
  SQL_ENGINE_RUNTIME_KIND,
  ALLOWED_RUNTIME_KINDS,
  RUNTIME_FIELD,
} from '../../src/constants/runtime.js';

describe('RUNTIME_KIND', () => {
  it('should be frozen', () => {
    assert.ok(Object.isFrozen(RUNTIME_KIND));
  });

  it('should have NATIVE_JS kind', () => {
    assert.equal(RUNTIME_KIND.NATIVE_JS, 'native_js');
  });

  it('should have WASM_COMPONENT kind', () => {
    assert.equal(RUNTIME_KIND.WASM_COMPONENT, 'wasm_component');
  });

  it('should have OCI_CONTAINER kind', () => {
    assert.equal(RUNTIME_KIND.OCI_CONTAINER, 'oci_container');
  });

  it('should have exactly three kinds', () => {
    assert.equal(Object.keys(RUNTIME_KIND).length, 3);
  });
});

describe('SQL_ENGINE_RUNTIME_KIND', () => {
  it('should map SQL engine profile to native_js', () => {
    assert.equal(SQL_ENGINE_RUNTIME_KIND, RUNTIME_KIND.NATIVE_JS);
    assert.equal(SQL_ENGINE_RUNTIME_KIND, 'native_js');
  });
});

describe('ALLOWED_RUNTIME_KINDS', () => {
  it('should be a frozen Set', () => {
    assert.ok(ALLOWED_RUNTIME_KINDS instanceof Set);
    assert.ok(Object.isFrozen(ALLOWED_RUNTIME_KINDS));
  });

  it('should contain all RUNTIME_KIND values', () => {
    for (const kind of Object.values(RUNTIME_KIND)) {
      assert.ok(
        ALLOWED_RUNTIME_KINDS.has(kind),
        `should contain ${kind}`,
      );
    }
  });

  it('should have exactly three members', () => {
    assert.equal(ALLOWED_RUNTIME_KINDS.size, 3);
  });

  it('should reject unknown kinds', () => {
    assert.equal(ALLOWED_RUNTIME_KINDS.has('unknown'), false);
  });
});

describe('RUNTIME_FIELD', () => {
  it('should be frozen', () => {
    assert.ok(Object.isFrozen(RUNTIME_FIELD));
  });

  it('should have RUNTIME_KIND field name', () => {
    assert.equal(RUNTIME_FIELD.RUNTIME_KIND, 'runtime_kind');
  });

  it('should have RUNTIME_REF field name', () => {
    assert.equal(RUNTIME_FIELD.RUNTIME_REF, 'runtime_ref');
  });

  it('should have RUNTIME_CONFIG field name', () => {
    assert.equal(RUNTIME_FIELD.RUNTIME_CONFIG, 'runtime_config');
  });

  it('should have exactly three fields', () => {
    assert.equal(Object.keys(RUNTIME_FIELD).length, 3);
  });
});
