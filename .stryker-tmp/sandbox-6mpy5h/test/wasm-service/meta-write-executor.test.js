// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  executeMetaWrite,
  executeMetaRead,
  META_WRITE_ERROR_MSG,
} from '../../src/wasm-service/meta-write-executor.js';

function makeMockEngine(response) {
  return {
    executeQuery: async (_sql, _params) => response,
  };
}

function makeFailingEngine(message) {
  return {
    executeQuery: async () => {
      throw new Error(message);
    },
  };
}

const MOCK_ROWS = [{id: 'test'}];
const MOCK_RESULT = {success: true, rows: MOCK_ROWS, rowCount: 1};
const WRITE_SQL = 'INSERT INTO module_manifests (namespace) VALUES (?1)';
const WRITE_PARAMS = ['acme'];
const DB_ERROR = 'connection lost';

describe('executeMetaWrite', () => {
  it('returns failure when command result is unsuccessful', async () => {
    const engine = makeMockEngine(MOCK_RESULT);
    const commandResult = {
      success: false,
      errors: ['validation error'],
    };
    const result = await executeMetaWrite(engine, commandResult);
    assert.equal(result.success, false);
    assert.deepEqual(result.errors, ['validation error']);
  });

  it('calls sqlQueryEngine.executeQuery with correct sql and params',
    async () => {
      let capturedSql;
      let capturedParams;
      const engine = {
        executeQuery: async (sql, params) => {
          capturedSql = sql;
          capturedParams = params;
          return MOCK_RESULT;
        },
      };
      const commandResult = {
        success: true,
        sql: WRITE_SQL,
        params: WRITE_PARAMS,
      };
      await executeMetaWrite(engine, commandResult);
      assert.equal(capturedSql, WRITE_SQL);
      assert.deepEqual(capturedParams, WRITE_PARAMS);
    });

  it('returns success with result from engine', async () => {
    const engine = makeMockEngine(MOCK_RESULT);
    const commandResult = {
      success: true,
      sql: WRITE_SQL,
      params: WRITE_PARAMS,
      serviceId: 'svc-1',
    };
    const result = await executeMetaWrite(engine, commandResult);
    assert.equal(result.success, true);
    assert.deepEqual(result.result, MOCK_RESULT);
    assert.equal(result.serviceId, 'svc-1');
  });

  it('returns failure with error message on execution error',
    async () => {
      const engine = makeFailingEngine(DB_ERROR);
      const commandResult = {
        success: true,
        sql: WRITE_SQL,
        params: WRITE_PARAMS,
      };
      const result = await executeMetaWrite(engine, commandResult);
      assert.equal(result.success, false);
      assert.ok(result.error.includes(
        META_WRITE_ERROR_MSG.EXECUTION_FAILED,
      ));
      assert.ok(result.error.includes(DB_ERROR));
    });

  it('throws when sqlQueryEngine is missing', async () => {
    const commandResult = {success: true, sql: WRITE_SQL, params: []};
    await assert.rejects(
      () => executeMetaWrite(null, commandResult),
      {message: META_WRITE_ERROR_MSG.ENGINE_REQUIRED},
    );
  });
});

describe('executeMetaRead', () => {
  it('returns rows from engine', async () => {
    const engine = makeMockEngine(MOCK_RESULT);
    const commandResult = {
      success: true,
      sql: 'SELECT * FROM module_manifests',
      params: [],
    };
    const result = await executeMetaRead(engine, commandResult);
    assert.equal(result.success, true);
    assert.deepEqual(result.rows, MOCK_ROWS);
  });

  it('returns failure on execution error', async () => {
    const engine = makeFailingEngine(DB_ERROR);
    const commandResult = {
      success: true,
      sql: 'SELECT * FROM module_manifests',
      params: [],
    };
    const result = await executeMetaRead(engine, commandResult);
    assert.equal(result.success, false);
    assert.ok(result.error.includes(
      META_WRITE_ERROR_MSG.EXECUTION_FAILED,
    ));
    assert.ok(result.error.includes(DB_ERROR));
  });

  it('throws when sqlQueryEngine is missing', async () => {
    const commandResult = {
      success: true,
      sql: 'SELECT * FROM module_manifests',
      params: [],
    };
    await assert.rejects(
      () => executeMetaRead(null, commandResult),
      {message: META_WRITE_ERROR_MSG.ENGINE_REQUIRED},
    );
  });

  it('returns failure when command result is unsuccessful', async () => {
    const engine = makeMockEngine(MOCK_RESULT);
    const commandResult = {
      success: false,
      errors: ['missing namespace'],
    };
    const result = await executeMetaRead(engine, commandResult);
    assert.equal(result.success, false);
    assert.deepEqual(result.errors, ['missing namespace']);
  });
});
