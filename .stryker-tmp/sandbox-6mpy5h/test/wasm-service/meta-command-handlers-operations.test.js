// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  META_COMMAND_ERROR_MSG,
  handleGetOperation,
  handleListOperations,
  buildOperationResponse,
  buildMutationResponse,
} from '../../src/wasm-service/meta-command-handlers.js';
import {
  WASM_OPERATION_COL,
} from '../../src/wasm-service/wasm-meta-models-constants.js';
import {
  WASM_OPERATION_STATE,
} from '../../src/constants/wasm-meta.js';
import {TABLES} from '../../src/constants/tables.js';
import {SQL} from '../../src/constants/sql.js';

// --- handleGetOperation ---

describe('handleGetOperation', () => {
  it('should return SQL for valid operationId', () => {
    const result = handleGetOperation({operationId: 'op-1'});
    assert.equal(result.success, true);
    assert.ok(result.sql.startsWith(
      `${SQL.SELECT} * FROM ${TABLES.WASM_OPERATIONS}`,
    ));
    assert.ok(result.sql.includes(
      `${WASM_OPERATION_COL.OPERATION_ID}`,
    ));
    assert.deepEqual(result.params, ['op-1']);
  });

  it('should fail when operationId is missing', () => {
    const result = handleGetOperation({});
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.OPERATION_ID_REQUIRED,
    ));
  });

  it('should fail when params is null', () => {
    const result = handleGetOperation(null);
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.OPERATION_ID_REQUIRED,
    ));
  });
});

// --- handleListOperations ---

describe('handleListOperations', () => {
  it('should return unfiltered SQL with no filters', () => {
    const result = handleListOperations({});
    assert.equal(result.success, true);
    assert.ok(result.sql.startsWith(
      `${SQL.SELECT} * FROM ${TABLES.WASM_OPERATIONS}`,
    ));
    assert.ok(!result.sql.includes(SQL.WHERE));
    assert.equal(result.params.length, 0);
  });

  it('should filter by tenantId', () => {
    const result = handleListOperations(
      {tenantId: 'tenant-1'},
    );
    assert.equal(result.success, true);
    assert.ok(result.sql.includes(SQL.WHERE));
    assert.ok(result.sql.includes(
      WASM_OPERATION_COL.TENANT_ID,
    ));
    assert.equal(result.params.length, 1);
    assert.equal(result.params[0], 'tenant-1');
  });

  it('should filter by state', () => {
    const result = handleListOperations(
      {state: WASM_OPERATION_STATE.PENDING},
    );
    assert.equal(result.success, true);
    assert.ok(result.sql.includes(SQL.WHERE));
    assert.ok(result.sql.includes(
      WASM_OPERATION_COL.STATE,
    ));
    assert.equal(result.params.length, 1);
    assert.equal(
      result.params[0], WASM_OPERATION_STATE.PENDING,
    );
  });

  it('should handle null params gracefully', () => {
    const result = handleListOperations(null);
    assert.equal(result.success, true);
    assert.ok(!result.sql.includes(SQL.WHERE));
    assert.equal(result.params.length, 0);
  });
});

// --- buildOperationResponse ---

describe('buildOperationResponse', () => {
  const sampleOperation = {
    [WASM_OPERATION_COL.OPERATION_ID]: 'op-abc',
    [WASM_OPERATION_COL.STATE]: WASM_OPERATION_STATE.COMPLETED,
    [WASM_OPERATION_COL.RESULT]: '{"moduleId":"m-1"}',
    [WASM_OPERATION_COL.ERROR]: null,
    [WASM_OPERATION_COL.CREATED_AT]: 1000,
    [WASM_OPERATION_COL.UPDATED_AT]: 2000,
  };

  it('should create frozen envelope with all fields', () => {
    const envelope = buildOperationResponse(
      sampleOperation, 'req-1',
    );
    assert.equal(envelope.requestId, 'req-1');
    assert.equal(envelope.operationId, 'op-abc');
    assert.equal(
      envelope.state, WASM_OPERATION_STATE.COMPLETED,
    );
    assert.equal(
      envelope.result, '{"moduleId":"m-1"}',
    );
    assert.equal(envelope.error, null);
    assert.equal(envelope.createdAt, 1000);
    assert.equal(envelope.updatedAt, 2000);
    assert.ok(Object.isFrozen(envelope));
  });

  it('should fail when requestId is missing', () => {
    const result = buildOperationResponse(
      sampleOperation, null,
    );
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.REQUEST_ID_REQUIRED,
    ));
  });

  it('should default result and error to null', () => {
    const op = {
      [WASM_OPERATION_COL.OPERATION_ID]: 'op-xyz',
      [WASM_OPERATION_COL.STATE]: WASM_OPERATION_STATE.PENDING,
      [WASM_OPERATION_COL.CREATED_AT]: 3000,
      [WASM_OPERATION_COL.UPDATED_AT]: 3000,
    };
    const envelope = buildOperationResponse(op, 'req-2');
    assert.equal(envelope.result, null);
    assert.equal(envelope.error, null);
  });
});

// --- buildMutationResponse ---

describe('buildMutationResponse', () => {
  it('should create minimal frozen response', () => {
    const resp = buildMutationResponse('op-1', 'req-1');
    assert.equal(resp.operationId, 'op-1');
    assert.equal(resp.requestId, 'req-1');
    assert.ok(Object.isFrozen(resp));
  });

  it('should fail when operationId is missing', () => {
    const result = buildMutationResponse(null, 'req-1');
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.OPERATION_ID_REQUIRED,
    ));
  });

  it('should fail when requestId is missing', () => {
    const result = buildMutationResponse('op-1', null);
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.REQUEST_ID_REQUIRED,
    ));
  });

  it('should fail with both errors when both missing', () => {
    const result = buildMutationResponse(null, null);
    assert.equal(result.success, false);
    assert.equal(result.errors.length, 2);
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.OPERATION_ID_REQUIRED,
    ));
    assert.ok(result.errors.includes(
      META_COMMAND_ERROR_MSG.REQUEST_ID_REQUIRED,
    ));
  });
});
