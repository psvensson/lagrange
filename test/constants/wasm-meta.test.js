/**
 * Unit tests for WASM meta-service constants.
 *
 * Validates package identity parsing constants, operation states,
 * command action names, and service identifiers.
 *
 * Requirements: 2.1, 3.1, 8.1
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  PACKAGE_ID_SEPARATOR,
  PACKAGE_VERSION_SEPARATOR,
  PACKAGE_ID_MAX_LENGTH,
  PACKAGE_ID_PATTERN,
  WASM_OPERATION_STATE,
  WASM_META_ACTION,
  META_SERVICE_ID,
} from '../../src/constants/wasm-meta.js';

describe('PACKAGE_ID_SEPARATOR', () => {
  it('should be colon', () => {
    assert.equal(PACKAGE_ID_SEPARATOR, ':');
  });
});

describe('PACKAGE_VERSION_SEPARATOR', () => {
  it('should be at-sign', () => {
    assert.equal(PACKAGE_VERSION_SEPARATOR, '@');
  });
});

describe('PACKAGE_ID_MAX_LENGTH', () => {
  it('should be frozen', () => {
    assert.ok(Object.isFrozen(PACKAGE_ID_MAX_LENGTH));
  });

  it('should define NAMESPACE max length', () => {
    assert.equal(PACKAGE_ID_MAX_LENGTH.NAMESPACE, 128);
  });

  it('should define NAME max length', () => {
    assert.equal(PACKAGE_ID_MAX_LENGTH.NAME, 128);
  });

  it('should define VERSION max length', () => {
    assert.equal(PACKAGE_ID_MAX_LENGTH.VERSION, 64);
  });

  it('should have exactly three fields', () => {
    assert.equal(Object.keys(PACKAGE_ID_MAX_LENGTH).length, 3);
  });
});

describe('PACKAGE_ID_PATTERN', () => {
  it('should match valid canonical package id', () => {
    assert.ok(PACKAGE_ID_PATTERN.test('acme:fraud-policy@1.4.2'));
  });

  it('should match namespace with digits', () => {
    assert.ok(PACKAGE_ID_PATTERN.test('ddb:sql-callbacks@0.3.0'));
  });

  it('should capture namespace, name, and version groups', () => {
    const match = 'acme:fraud-policy@1.4.2'.match(PACKAGE_ID_PATTERN);
    assert.equal(match[1], 'acme');
    assert.equal(match[2], 'fraud-policy');
    assert.equal(match[3], '1.4.2');
  });

  it('should reject missing namespace', () => {
    assert.equal(PACKAGE_ID_PATTERN.test(':name@1.0.0'), false);
  });

  it('should reject missing version', () => {
    assert.equal(PACKAGE_ID_PATTERN.test('ns:name'), false);
  });

  it('should reject uppercase namespace', () => {
    assert.equal(PACKAGE_ID_PATTERN.test('Acme:name@1.0.0'), false);
  });

  it('should reject namespace starting with digit', () => {
    assert.equal(PACKAGE_ID_PATTERN.test('1acme:name@1.0.0'), false);
  });

  it('should reject empty string', () => {
    assert.equal(PACKAGE_ID_PATTERN.test(''), false);
  });
});

describe('WASM_OPERATION_STATE', () => {
  it('should be frozen', () => {
    assert.ok(Object.isFrozen(WASM_OPERATION_STATE));
  });

  it('should have PENDING state', () => {
    assert.equal(WASM_OPERATION_STATE.PENDING, 'pending');
  });

  it('should have IN_PROGRESS state', () => {
    assert.equal(WASM_OPERATION_STATE.IN_PROGRESS, 'in_progress');
  });

  it('should have COMPLETED state', () => {
    assert.equal(WASM_OPERATION_STATE.COMPLETED, 'completed');
  });

  it('should have FAILED state', () => {
    assert.equal(WASM_OPERATION_STATE.FAILED, 'failed');
  });

  it('should have CANCELLED state', () => {
    assert.equal(WASM_OPERATION_STATE.CANCELLED, 'cancelled');
  });

  it('should have exactly five states', () => {
    assert.equal(Object.keys(WASM_OPERATION_STATE).length, 5);
  });
});

describe('WASM_META_ACTION', () => {
  it('should be frozen', () => {
    assert.ok(Object.isFrozen(WASM_META_ACTION));
  });

  it('should have all module actions', () => {
    assert.equal(WASM_META_ACTION.PUBLISH_MODULE, 'publishModule');
    assert.equal(WASM_META_ACTION.GET_MODULE, 'getModule');
    assert.equal(WASM_META_ACTION.LIST_MODULES, 'listModules');
  });

  it('should have all service actions', () => {
    assert.equal(WASM_META_ACTION.CREATE_SERVICE, 'createService');
    assert.equal(WASM_META_ACTION.UPDATE_SERVICE, 'updateService');
    assert.equal(WASM_META_ACTION.SCALE_SERVICE, 'scaleService');
    assert.equal(WASM_META_ACTION.ROLLOUT_SERVICE, 'rolloutService');
    assert.equal(WASM_META_ACTION.DELETE_SERVICE, 'deleteService');
  });

  it('should have operation query actions', () => {
    assert.equal(WASM_META_ACTION.GET_OPERATION, 'getOperation');
    assert.equal(
      WASM_META_ACTION.STREAM_OPERATIONS, 'streamOperations',
    );
  });

  it('should have exactly ten actions', () => {
    assert.equal(Object.keys(WASM_META_ACTION).length, 10);
  });
});

describe('META_SERVICE_ID', () => {
  it('should be frozen', () => {
    assert.ok(Object.isFrozen(META_SERVICE_ID));
  });

  it('should have WASM_META identifier', () => {
    assert.equal(META_SERVICE_ID.WASM_META, 'sys-wasm-meta');
  });

  it('should have ADMIN_META identifier', () => {
    assert.equal(META_SERVICE_ID.ADMIN_META, 'sys-admin-meta');
  });

  it('should have POSTGRES_WIRE identifier', () => {
    assert.equal(
      META_SERVICE_ID.POSTGRES_WIRE, 'sys-postgres-wire',
    );
  });

  it('should have exactly three identifiers', () => {
    assert.equal(Object.keys(META_SERVICE_ID).length, 3);
  });
});
