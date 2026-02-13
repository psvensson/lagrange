import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {validate as uuidValidate} from 'uuid';
import {
  OPERATION_LIFECYCLE_ERROR_MSG,
  createOperation,
  transitionOperation,
  buildGetOperationSQL,
  buildListOperationsSQL,
  buildIdempotencyCheckSQL,
} from '../../src/wasm-service/operation-lifecycle.js';
import {
  WASM_OPERATION_COL,
  WASM_OPERATION_FIELD,
} from '../../src/wasm-service/wasm-meta-models-constants.js';
import {WASM_OPERATION_STATE} from '../../src/constants/wasm-meta.js';
import {TABLES} from '../../src/constants/tables.js';
import {SQL} from '../../src/constants/sql.js';

// --- createOperation ---

describe('createOperation', () => {
  it('should return success with valid operation and INSERT SQL', () => {
    const result = createOperation('tenant-1', 'publishModule');
    assert.equal(result.success, true);
    assert.ok(result.operation);
    assert.ok(result.sql);
    assert.ok(result.params);
    assert.ok(
      result.sql.startsWith(
        `${SQL.INSERT_INTO} ${TABLES.WASM_OPERATIONS}`,
      ),
    );
  });

  it('should fail when tenantId is missing', () => {
    const result = createOperation(null, 'publishModule');
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      OPERATION_LIFECYCLE_ERROR_MSG.TENANT_ID_REQUIRED,
    ));
  });

  it('should fail when command is missing', () => {
    const result = createOperation('tenant-1', null);
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      OPERATION_LIFECYCLE_ERROR_MSG.COMMAND_REQUIRED,
    ));
  });

  it('should set initial state to PENDING', () => {
    const result = createOperation('tenant-1', 'publishModule');
    assert.equal(
      result.operation[WASM_OPERATION_FIELD.STATE],
      WASM_OPERATION_STATE.PENDING,
    );
  });

  it('should generate a UUID operationId', () => {
    const result = createOperation('tenant-1', 'publishModule');
    const opId =
      result.operation[WASM_OPERATION_FIELD.OPERATION_ID];
    assert.ok(uuidValidate(opId));
  });

  it('should include idempotencyKey when provided', () => {
    const result = createOperation(
      'tenant-1', 'publishModule', 'idem-key-1',
    );
    assert.equal(
      result.operation[WASM_OPERATION_FIELD.IDEMPOTENCY_KEY],
      'idem-key-1',
    );
  });

  it('should set idempotencyKey to null when not provided', () => {
    const result = createOperation('tenant-1', 'publishModule');
    assert.equal(
      result.operation[WASM_OPERATION_FIELD.IDEMPOTENCY_KEY],
      null,
    );
  });

  it('should include all column names in INSERT SQL', () => {
    const result = createOperation('tenant-1', 'publishModule');
    assert.ok(
      result.sql.includes(WASM_OPERATION_COL.OPERATION_ID),
    );
    assert.ok(
      result.sql.includes(WASM_OPERATION_COL.TENANT_ID),
    );
    assert.ok(
      result.sql.includes(WASM_OPERATION_COL.COMMAND),
    );
    assert.ok(
      result.sql.includes(WASM_OPERATION_COL.STATE),
    );
  });

  it('should return 9 params matching columns', () => {
    const result = createOperation('tenant-1', 'publishModule');
    assert.equal(result.params.length, 9);
  });
});

// --- transitionOperation ---

describe('transitionOperation', () => {
  it('should succeed for PENDING to IN_PROGRESS', () => {
    const result = transitionOperation(
      'op-1',
      WASM_OPERATION_STATE.PENDING,
      WASM_OPERATION_STATE.IN_PROGRESS,
    );
    assert.equal(result.success, true);
    assert.ok(result.sql.startsWith(
      `${SQL.UPDATE} ${TABLES.WASM_OPERATIONS}`,
    ));
    assert.ok(result.params.includes(
      WASM_OPERATION_STATE.IN_PROGRESS,
    ));
  });

  it('should succeed for IN_PROGRESS to COMPLETED with result', () => {
    const payload = {moduleId: 'mod-1'};
    const result = transitionOperation(
      'op-1',
      WASM_OPERATION_STATE.IN_PROGRESS,
      WASM_OPERATION_STATE.COMPLETED,
      payload,
    );
    assert.equal(result.success, true);
    assert.ok(result.sql.includes(WASM_OPERATION_COL.RESULT));
    assert.ok(
      result.params.includes(JSON.stringify(payload)),
    );
  });

  it('should succeed for IN_PROGRESS to FAILED with error', () => {
    const payload = {message: 'validation failed'};
    const result = transitionOperation(
      'op-1',
      WASM_OPERATION_STATE.IN_PROGRESS,
      WASM_OPERATION_STATE.FAILED,
      payload,
    );
    assert.equal(result.success, true);
    assert.ok(result.sql.includes(WASM_OPERATION_COL.ERROR));
    assert.ok(
      result.params.includes(JSON.stringify(payload)),
    );
  });

  it('should succeed for PENDING to CANCELLED', () => {
    const result = transitionOperation(
      'op-1',
      WASM_OPERATION_STATE.PENDING,
      WASM_OPERATION_STATE.CANCELLED,
    );
    assert.equal(result.success, true);
  });

  it('should succeed for IN_PROGRESS to CANCELLED', () => {
    const result = transitionOperation(
      'op-1',
      WASM_OPERATION_STATE.IN_PROGRESS,
      WASM_OPERATION_STATE.CANCELLED,
    );
    assert.equal(result.success, true);
  });

  it('should fail for COMPLETED to IN_PROGRESS (invalid)', () => {
    const result = transitionOperation(
      'op-1',
      WASM_OPERATION_STATE.COMPLETED,
      WASM_OPERATION_STATE.IN_PROGRESS,
    );
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      OPERATION_LIFECYCLE_ERROR_MSG.INVALID_TRANSITION,
    ));
  });

  it('should fail for FAILED to PENDING (invalid)', () => {
    const result = transitionOperation(
      'op-1',
      WASM_OPERATION_STATE.FAILED,
      WASM_OPERATION_STATE.PENDING,
    );
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      OPERATION_LIFECYCLE_ERROR_MSG.INVALID_TRANSITION,
    ));
  });

  it('should fail when operationId is missing', () => {
    const result = transitionOperation(
      null,
      WASM_OPERATION_STATE.PENDING,
      WASM_OPERATION_STATE.IN_PROGRESS,
    );
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      OPERATION_LIFECYCLE_ERROR_MSG.OPERATION_ID_REQUIRED,
    ));
  });

  it('should include CAS guard on fromState in WHERE', () => {
    const result = transitionOperation(
      'op-1',
      WASM_OPERATION_STATE.PENDING,
      WASM_OPERATION_STATE.IN_PROGRESS,
    );
    assert.ok(result.sql.includes(WASM_OPERATION_COL.STATE));
    assert.ok(result.params.includes(
      WASM_OPERATION_STATE.PENDING,
    ));
  });
});

// --- buildGetOperationSQL ---

describe('buildGetOperationSQL', () => {
  it('should return correct SELECT SQL', () => {
    const {sql} = buildGetOperationSQL('op-abc');
    assert.ok(sql.startsWith(
      `${SQL.SELECT} * FROM ${TABLES.WASM_OPERATIONS}`,
    ));
    assert.ok(sql.includes(
      `${WASM_OPERATION_COL.OPERATION_ID} = $1`,
    ));
  });

  it('should return operationId as the single param', () => {
    const {params} = buildGetOperationSQL('op-abc');
    assert.equal(params.length, 1);
    assert.equal(params[0], 'op-abc');
  });
});

// --- buildListOperationsSQL ---

describe('buildListOperationsSQL', () => {
  it('should return SQL without filters when no params', () => {
    const {sql, params} = buildListOperationsSQL();
    assert.ok(sql.startsWith(
      `${SQL.SELECT} * FROM ${TABLES.WASM_OPERATIONS}`,
    ));
    assert.ok(!sql.includes(SQL.WHERE));
    assert.equal(params.length, 0);
  });

  it('should return SQL with tenant filter', () => {
    const {sql, params} = buildListOperationsSQL('tenant-1');
    assert.ok(sql.includes(SQL.WHERE));
    assert.ok(sql.includes(
      `${WASM_OPERATION_COL.TENANT_ID} = $1`,
    ));
    assert.equal(params.length, 1);
    assert.equal(params[0], 'tenant-1');
  });

  it('should return SQL with tenant and state filters', () => {
    const {sql, params} = buildListOperationsSQL(
      'tenant-1', WASM_OPERATION_STATE.PENDING,
    );
    assert.ok(sql.includes(SQL.WHERE));
    assert.ok(sql.includes(
      `${WASM_OPERATION_COL.TENANT_ID} = $1`,
    ));
    assert.ok(sql.includes(
      `${WASM_OPERATION_COL.STATE} = $2`,
    ));
    assert.equal(params.length, 2);
    assert.equal(params[0], 'tenant-1');
    assert.equal(params[1], WASM_OPERATION_STATE.PENDING);
  });

  it('should return SQL with only state filter', () => {
    const {sql, params} = buildListOperationsSQL(
      null, WASM_OPERATION_STATE.COMPLETED,
    );
    assert.ok(sql.includes(SQL.WHERE));
    assert.ok(sql.includes(
      `${WASM_OPERATION_COL.STATE} = $1`,
    ));
    assert.equal(params.length, 1);
    assert.equal(
      params[0], WASM_OPERATION_STATE.COMPLETED,
    );
  });
});


// --- buildIdempotencyCheckSQL ---

describe('buildIdempotencyCheckSQL', () => {
  it('should return correct SELECT SQL with tenant and key params', () => {
    const result = buildIdempotencyCheckSQL(
      'tenant-1', 'idem-key-1',
    );
    assert.equal(result.success, true);
    assert.ok(result.sql.startsWith(
      `${SQL.SELECT} * FROM ${TABLES.WASM_OPERATIONS}`,
    ));
    assert.deepEqual(
      result.params, ['tenant-1', 'idem-key-1'],
    );
  });

  it('should fail when tenantId is missing', () => {
    const result = buildIdempotencyCheckSQL(
      null, 'idem-key-1',
    );
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      OPERATION_LIFECYCLE_ERROR_MSG.TENANT_ID_REQUIRED,
    ));
  });

  it('should fail when idempotencyKey is missing', () => {
    const result = buildIdempotencyCheckSQL(
      'tenant-1', null,
    );
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      OPERATION_LIFECYCLE_ERROR_MSG.IDEMPOTENCY_KEY_REQUIRED,
    ));
  });

  it('should use correct table name and column names', () => {
    const result = buildIdempotencyCheckSQL(
      'tenant-1', 'idem-key-1',
    );
    assert.ok(result.sql.includes(TABLES.WASM_OPERATIONS));
    assert.ok(result.sql.includes(
      WASM_OPERATION_COL.TENANT_ID,
    ));
    assert.ok(result.sql.includes(
      WASM_OPERATION_COL.IDEMPOTENCY_KEY,
    ));
  });

  it('should return params array with exactly 2 elements', () => {
    const result = buildIdempotencyCheckSQL(
      'tenant-1', 'idem-key-1',
    );
    assert.equal(result.params.length, 2);
  });
});
