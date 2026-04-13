/**
 * Tests for admin-api-adapter.
 * Requirements: 1.4, 11.2
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  ADAPTER_ERROR_CODE,
  ADAPTER_ERROR_MSG,
  adaptQueryMessage,
  adaptRefreshMessage,
  adaptAdminAction,
} from '../../src/admin/admin-api-adapter.js';
import {
  ADMIN_META_ACTION,
  ADMIN_META_ERROR_MSG,
  CACHE_DUMP_TABLES,
} from '../../src/admin/admin-meta-command-handlers.js';
import {
  COLUMN,
  META_SERVICE_ID,
  TABLES,
  WASM_META_ACTION,
} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

/**
 * Build a minimal systemTableCache mock.
 * @param {Array} serviceRows - Rows for the services table.
 * @return {Object} Mock cache with getAll.
 */
function buildCacheMock(serviceRows) {
  return {
    getAll(tableName) {
      if (tableName === TABLES.SERVICES) {
        return serviceRows;
      }
      return [];
    },
  };
}

describe('admin-api-adapter', () => {
  describe('adaptQueryMessage', () => {
    it('returns SQL for a valid query', () => {
      const result = adaptQueryMessage({
        type: 'query',
        queryId: 'q-1',
        sql: 'SELECT 1',
        params: [],
      });
      assert.equal(result.success, true);
      assert.equal(result.sql, 'SELECT 1');
      assert.deepEqual(result.params, []);
      assert.equal(result.queryId, 'q-1');
    });

    it('returns error when SQL is missing', () => {
      const result = adaptQueryMessage({
        type: 'query',
        queryId: 'q-2',
      });
      assert.equal(result.success, false);
      assert.deepEqual(
        result.errors,
        [ADMIN_META_ERROR_MSG.SQL_REQUIRED],
      );
      assert.equal(result.queryId, 'q-2');
    });

    it('preserves queryId in both success and error', () => {
      const ok = adaptQueryMessage({
        type: 'query',
        queryId: 'q-ok',
        sql: 'SELECT 1',
      });
      assert.equal(ok.queryId, 'q-ok');

      const err = adaptQueryMessage({
        type: 'query',
        queryId: 'q-err',
      });
      assert.equal(err.queryId, 'q-err');
    });
  });

  describe('adaptRefreshMessage', () => {
    it('returns table names', () => {
      const result = adaptRefreshMessage({type: 'refresh'});
      assert.equal(result.success, true);
      assert.strictEqual(result.tables, CACHE_DUMP_TABLES);
      assert.ok(result.tables.includes(TABLES.NODES));
    });
  });

  describe('adaptAdminAction', () => {
    it('dispatches EXECUTE_QUERY correctly', () => {
      const result = adaptAdminAction(
        ADMIN_META_ACTION.EXECUTE_QUERY,
        {sql: 'SELECT 1'},
        null,
      );
      assert.equal(result.success, true);
      assert.equal(result.sql, 'SELECT 1');
    });

    it('dispatches GET_CACHE_DUMP correctly', () => {
      const result = adaptAdminAction(
        ADMIN_META_ACTION.GET_CACHE_DUMP,
        {},
        null,
      );
      assert.equal(result.success, true);
      assert.ok(Array.isArray(result.tables));
    });

    it('dispatches LIST_NODES correctly', () => {
      const result = adaptAdminAction(
        ADMIN_META_ACTION.LIST_NODES,
        {},
        null,
      );
      assert.equal(result.success, true);
      assert.ok(result.sql.includes(TABLES.NODES));
    });

    it('dispatches LIST_LATENCY_GROUPS correctly', () => {
      const result = adaptAdminAction(
        ADMIN_META_ACTION.LIST_LATENCY_GROUPS,
        {},
        null,
      );
      assert.equal(result.success, true);
      assert.ok(result.sql.includes(TABLES.LATENCY_GROUPS));
    });

    it('dispatches LIST_INTER_GROUP_LATENCIES correctly', () => {
      const result = adaptAdminAction(
        ADMIN_META_ACTION.LIST_INTER_GROUP_LATENCIES,
        {sourceGroupId: 'g-1'},
        null,
      );
      assert.equal(result.success, true);
      assert.ok(result.sql.includes(TABLES.INTER_GROUP_LATENCIES));
      assert.deepEqual(result.params, ['g-1']);
    });

    it('delegates WASM action when leader is available', () => {
      const leaderAddr = 'node-1/wasm-service/sys-wasm-meta-r1';
      const cache = buildCacheMock([
        {
          [COLUMN.SERVICE_ID]: META_SERVICE_ID.WASM_META,
          [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
          [COLUMN.ADDRESS]: leaderAddr,
        },
      ]);
      const result = adaptAdminAction(
        WASM_META_ACTION.PUBLISH_MODULE,
        {namespace: 'ns', name: 'mod', version: '1.0.0'},
        cache,
      );
      assert.equal(result.success, true);
      assert.equal(result.leaderAddress, leaderAddr);
      assert.equal(result.serviceId, META_SERVICE_ID.WASM_META);
      assert.equal(result.command, WASM_META_ACTION.PUBLISH_MODULE);
    });

    it('returns failure for WASM action when leader unavailable', () => {
      const cache = buildCacheMock([]);
      const result = adaptAdminAction(
        WASM_META_ACTION.PUBLISH_MODULE,
        {namespace: 'ns'},
        cache,
      );
      assert.equal(result.success, false);
      assert.ok(result.error);
      assert.ok(result.code);
    });

    it('returns UNKNOWN_ACTION for unrecognized action', () => {
      const result = adaptAdminAction(
        'nonExistentAction',
        {},
        null,
      );
      assert.equal(result.success, false);
      assert.equal(result.error, ADAPTER_ERROR_MSG.UNKNOWN_ACTION);
      assert.equal(result.code, ADAPTER_ERROR_CODE.UNKNOWN_ACTION);
    });
  });
});
