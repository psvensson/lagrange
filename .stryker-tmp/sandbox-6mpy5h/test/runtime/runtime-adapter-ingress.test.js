/**
 * Adapter ingress-only contract tests.
 *
 * Verifies that the node-local admin API adapter is ingress-only
 * with no mutation ownership. The adapter translates envelopes
 * and routes to meta-service handlers — it never executes SQL,
 * writes system metadata, or mutates cache.
 *
 * Requirements: 8.4, 13.2
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  ADAPTER_ROLE,
  ADAPTER_ERROR_CODE,
  ADAPTER_ERROR_MSG,
  adaptQueryMessage,
  adaptRefreshMessage,
  adaptAdminAction,
  guardedAdaptAdminAction,
} from '../../src/admin/admin-api-adapter.js';
import {
  ADMIN_META_ACTION,
  ADMIN_META_ERROR_MSG,
  CACHE_DUMP_TABLES,
} from '../../src/admin/admin-meta-command-handlers.js';
import {
  MUTATION_GUARD_MODE,
  MUTATION_GUARD_ERROR_CODE,
} from '../../src/admin/admin-mutation-guard.js';
import {
  DEPRECATION_WARNING,
} from '../../src/admin/admin-deprecation.js';
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
function createMockCache(serviceRows = []) {
  return {
    getAll(tableName) {
      if (tableName === TABLES.SERVICES) return serviceRows;
      return [];
    },
  };
}

describe('runtime adapter ingress-only contract', () => {
  describe('ADAPTER_ROLE constant', () => {
    it('exports compatibility_adapter role', () => {
      assert.equal(ADAPTER_ROLE, 'compatibility_adapter');
    });

    it('is a string primitive', () => {
      assert.equal(typeof ADAPTER_ROLE, 'string');
    });
  });

  describe('adaptQueryMessage is pure envelope translation', () => {
    it('translates valid query message to handler format', () => {
      const result = adaptQueryMessage({
        type: 'query',
        queryId: 'q-42',
        sql: 'SELECT * FROM nodes',
        params: [],
      });
      assert.equal(result.success, true);
      assert.equal(result.sql, 'SELECT * FROM nodes');
      assert.deepEqual(result.params, []);
      assert.equal(result.queryId, 'q-42');
    });

    it('preserves queryId in response', () => {
      const result = adaptQueryMessage({
        type: 'query',
        queryId: 'q-99',
        sql: 'INSERT INTO nodes VALUES (?1)',
        params: ['node-x'],
      });
      assert.equal(result.queryId, 'q-99');
      assert.equal(result.sql, 'INSERT INTO nodes VALUES (?1)');
      assert.deepEqual(result.params, ['node-x']);
    });

    it('does not execute SQL — no rows or execute in result', () => {
      const result = adaptQueryMessage({
        type: 'query',
        queryId: 'q-1',
        sql: 'DELETE FROM nodes',
        params: [],
      });
      assert.equal(result.execute, undefined);
      assert.equal(result.rows, undefined);
      assert.equal(result.mutated, undefined);
    });

    it('returns error for missing sql', () => {
      const result = adaptQueryMessage({
        type: 'query',
        queryId: 'q-bad',
      });
      assert.equal(result.success, false);
      assert.deepEqual(
        result.errors,
        [ADMIN_META_ERROR_MSG.SQL_REQUIRED],
      );
      assert.equal(result.queryId, 'q-bad');
    });
  });

  describe('adaptRefreshMessage returns table names only', () => {
    it('returns success with table name array', () => {
      const result = adaptRefreshMessage({type: 'refresh'});
      assert.equal(result.success, true);
      assert.ok(Array.isArray(result.tables));
      assert.deepEqual(result.tables, CACHE_DUMP_TABLES);
    });

    it('returns only string table names, no data rows', () => {
      const result = adaptRefreshMessage({type: 'refresh'});
      for (const t of result.tables) {
        assert.equal(typeof t, 'string');
      }
    });

    it('does not read or write cache', () => {
      const result = adaptRefreshMessage({type: 'refresh'});
      assert.equal(result.rows, undefined);
      assert.equal(result.data, undefined);
      assert.equal(result.mutated, undefined);
    });
  });

  describe('adaptAdminAction routes to handlers', () => {
    it('delegates WASM actions to delegateToWasmMeta', () => {
      const leaderAddr = 'node-1/wasm-service/sys-wasm-meta-r1';
      const cache = createMockCache([{
        [COLUMN.SERVICE_ID]: META_SERVICE_ID.WASM_META,
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
        [COLUMN.ADDRESS]: leaderAddr,
      }]);
      const result = adaptAdminAction(
        WASM_META_ACTION.PUBLISH_MODULE,
        {namespace: 'ns', name: 'mod', version: '1.0.0'},
        cache,
      );
      assert.equal(result.success, true);
      assert.equal(result.serviceId, META_SERVICE_ID.WASM_META);
      assert.equal(result.leaderAddress, leaderAddr);
      assert.equal(result.command, WASM_META_ACTION.PUBLISH_MODULE);
    });

    it('routes known admin actions to their handlers', () => {
      for (const action of Object.values(ADMIN_META_ACTION)) {
        const result = adaptAdminAction(
          action,
          {sql: 'SELECT 1'},
          null,
        );
        assert.equal(
          result.success, true,
          `action ${action} should succeed`,
        );
      }
    });

    it('returns UNKNOWN_ACTION for unrecognized actions', () => {
      const result = adaptAdminAction(
        'directPartitionWrite', {}, null,
      );
      assert.equal(result.success, false);
      assert.equal(result.code, ADAPTER_ERROR_CODE.UNKNOWN_ACTION);
      assert.equal(result.error, ADAPTER_ERROR_MSG.UNKNOWN_ACTION);
    });

    it('never executes SQL directly', () => {
      for (const action of Object.values(ADMIN_META_ACTION)) {
        const result = adaptAdminAction(
          action,
          {sql: 'SELECT 1'},
          null,
        );
        assert.equal(result.execute, undefined);
        assert.equal(result.rows, undefined);
        assert.equal(result.mutated, undefined);
      }
    });
  });

  describe('guardedAdaptAdminAction enforces mutation guard', () => {
    it('blocks deprecated bypass paths in reject mode', () => {
      const result = guardedAdaptAdminAction(
        'directPartitionWrite', {}, null,
        MUTATION_GUARD_MODE.REJECT,
      );
      assert.equal(result.success, false);
      assert.equal(
        result.code,
        MUTATION_GUARD_ERROR_CODE.BYPASS_REJECTED,
      );
    });

    it('attaches deprecation warning in warn mode', () => {
      const result = guardedAdaptAdminAction(
        'directPartitionWrite', {}, null,
        MUTATION_GUARD_MODE.WARN,
      );
      assert.equal(
        result.warning,
        DEPRECATION_WARNING.DIRECT_MUTATION,
      );
    });

    it('allows known admin action without warning in reject mode',
      () => {
        const result = guardedAdaptAdminAction(
          ADMIN_META_ACTION.GET_NODE_STATUS, {}, null,
          MUTATION_GUARD_MODE.REJECT,
        );
        assert.equal(result.success, true);
        assert.equal(result.warning, undefined);
      });

    it('allows known admin action without warning in warn mode',
      () => {
        const result = guardedAdaptAdminAction(
          ADMIN_META_ACTION.GET_NODE_STATUS, {}, null,
          MUTATION_GUARD_MODE.WARN,
        );
        assert.equal(result.success, true);
        assert.equal(result.warning, undefined);
      });

    it('routes WASM delegation through guard in reject mode',
      () => {
        const leaderAddr =
          'node-1/wasm-service/sys-wasm-meta-r1';
        const cache = createMockCache([{
          [COLUMN.SERVICE_ID]: META_SERVICE_ID.WASM_META,
          [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
          [COLUMN.ADDRESS]: leaderAddr,
        }]);
        const result = guardedAdaptAdminAction(
          WASM_META_ACTION.CREATE_SERVICE,
          {name: 'svc'},
          cache,
          MUTATION_GUARD_MODE.REJECT,
        );
        assert.equal(result.success, true);
        assert.equal(
          result.serviceId, META_SERVICE_ID.WASM_META,
        );
        assert.equal(result.warning, undefined);
      });

    it('guard result flows through to response on rejection',
      () => {
        const result = guardedAdaptAdminAction(
          'legacyBypass', {}, null,
          MUTATION_GUARD_MODE.REJECT,
        );
        assert.equal(result.success, false);
        assert.ok(result.error);
        assert.equal(
          result.code,
          MUTATION_GUARD_ERROR_CODE.BYPASS_REJECTED,
        );
      });
  });

  describe('adapter does NOT own mutations', () => {
    it('adaptQueryMessage produces no mutation side-effects',
      () => {
        const result = adaptQueryMessage({
          type: 'query',
          queryId: 'q-1',
          sql: 'UPDATE nodes SET status = ?1',
          params: ['active'],
        });
        assert.equal(result.mutated, undefined);
        assert.equal(result.execute, undefined);
        assert.equal(result.rows, undefined);
      });

    it('adaptRefreshMessage produces no mutation side-effects',
      () => {
        const result = adaptRefreshMessage({type: 'refresh'});
        assert.equal(result.mutated, undefined);
        assert.equal(result.execute, undefined);
      });

    it('adaptAdminAction produces no mutation side-effects',
      () => {
        const result = adaptAdminAction(
          ADMIN_META_ACTION.LIST_NODES, {}, null,
        );
        assert.equal(result.success, true);
        assert.equal(result.mutated, undefined);
        assert.equal(result.execute, undefined);
      });

    it('WASM delegation returns routing info, not execution',
      () => {
        const leaderAddr =
          'node-2/wasm-service/sys-wasm-meta-r1';
        const cache = createMockCache([{
          [COLUMN.SERVICE_ID]: META_SERVICE_ID.WASM_META,
          [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
          [COLUMN.ADDRESS]: leaderAddr,
        }]);
        const result = adaptAdminAction(
          WASM_META_ACTION.DELETE_SERVICE,
          {serviceId: 'svc-1'},
          cache,
        );
        assert.equal(result.success, true);
        assert.equal(result.leaderAddress, leaderAddr);
        assert.equal(result.mutated, undefined);
        assert.equal(result.execute, undefined);
      });
  });
});
