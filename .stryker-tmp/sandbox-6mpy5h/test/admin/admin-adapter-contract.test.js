/**
 * Adapter-only contract tests for node-local admin APIs.
 *
 * Verifies that the admin adapter layer (AdminApiAdapter,
 * AdminWebSocketAPI, AdminCliCompat) acts as a thin routing
 * adapter only — no direct SQL mutations, no system metadata
 * writes, no alternative mutation paths.
 *
 * Requirements: 2.4, 13.2
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
} from '../../src/admin/admin-meta-command-handlers.js';
import {
  COLUMN,
  META_SERVICE_ID,
  TABLES,
  WASM_META_ACTION,
} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  validateIncomingMessage,
  validateOutgoingMessage,
} from '../../src/admin/admin-cli-compat.js';
import {ADMIN_MESSAGE_TYPE} from '../../src/admin/admin-constants.js';
import {
  guardMutation,
  MUTATION_GUARD_MODE,
  MUTATION_GUARD_ERROR_CODE,
} from '../../src/admin/admin-mutation-guard.js';

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

describe('admin adapter-only contract', () => {
  describe('ADAPTER_ROLE constant', () => {
    it('declares compatibility_adapter role', () => {
      assert.equal(ADAPTER_ROLE, 'compatibility_adapter');
    });
  });

  describe('adaptQueryMessage returns data only, no execution', () => {
    it('returns SQL string without executing it', () => {
      const result = adaptQueryMessage({
        type: 'query',
        queryId: 'q-1',
        sql: 'INSERT INTO nodes VALUES (?1)',
        params: ['node-x'],
      });
      assert.equal(result.success, true);
      assert.equal(result.sql, 'INSERT INTO nodes VALUES (?1)');
      assert.deepEqual(result.params, ['node-x']);
      // Adapter returns data — no execution side-effects
      assert.equal(typeof result.execute, 'undefined');
      assert.equal(typeof result.rows, 'undefined');
    });
  });

  describe('adaptRefreshMessage returns table names only', () => {
    it('returns table list without reading cache', () => {
      const result = adaptRefreshMessage({type: 'refresh'});
      assert.equal(result.success, true);
      assert.ok(Array.isArray(result.tables));
      // No data rows — just table names for the caller to use
      for (const t of result.tables) {
        assert.equal(typeof t, 'string');
      }
    });
  });

  describe('adaptAdminAction routes without mutation', () => {
    it('routes admin-meta actions to command handlers', () => {
      const actions = Object.values(ADMIN_META_ACTION);
      for (const action of actions) {
        const result = adaptAdminAction(action, {sql: 'SELECT 1'}, null);
        assert.equal(result.success, true,
          `action ${action} should succeed`);
        // No mutation side-effects — result is data only
        assert.equal(typeof result.mutated, 'undefined');
      }
    });

    it('routes WASM actions to sys-wasm-meta via delegation', () => {
      const leaderAddr = 'node-1/wasm-service/sys-wasm-meta-r1';
      const cache = buildCacheMock([{
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
      // Adapter provides routing info — does not execute the command
      assert.equal(typeof result.mutated, 'undefined');
    });

    it('rejects unknown actions without fallback execution', () => {
      const result = adaptAdminAction('directPartitionWrite', {}, null);
      assert.equal(result.success, false);
      assert.equal(result.code, ADAPTER_ERROR_CODE.UNKNOWN_ACTION);
      assert.equal(result.error, ADAPTER_ERROR_MSG.UNKNOWN_ACTION);
    });
  });

  describe('CLI compat validates envelopes only', () => {
    it('validates incoming query envelope without execution', () => {
      const result = validateIncomingMessage({
        type: ADMIN_MESSAGE_TYPE.QUERY,
        queryId: 'q-1',
        sql: 'DELETE FROM nodes',
      });
      assert.equal(result.valid, true);
      // Validation only — no SQL was executed
      assert.equal(result.messageType, ADMIN_MESSAGE_TYPE.QUERY);
    });

    it('validates outgoing envelope without producing data', () => {
      const result = validateOutgoingMessage({
        type: ADMIN_MESSAGE_TYPE.QUERY_RESULT,
        queryId: 'q-1',
        timestamp: Date.now(),
      });
      assert.equal(result.valid, true);
    });
  });

  describe('mutation guard rejects bypass in reject mode', () => {
    it('blocks deprecated direct mutation paths', () => {
      const result = guardMutation(
        'directPartitionWrite',
        MUTATION_GUARD_MODE.REJECT,
      );
      assert.equal(result.allowed, false);
      assert.equal(
        result.code,
        MUTATION_GUARD_ERROR_CODE.BYPASS_REJECTED,
      );
    });

    it('allows known meta-service actions through', () => {
      for (const action of Object.values(ADMIN_META_ACTION)) {
        const result = guardMutation(
          action,
          MUTATION_GUARD_MODE.REJECT,
        );
        assert.equal(result.allowed, true,
          `${action} should be allowed`);
      }
    });

    it('allows known WASM meta-service actions through', () => {
      for (const action of Object.values(WASM_META_ACTION)) {
        const result = guardMutation(
          action,
          MUTATION_GUARD_MODE.REJECT,
        );
        assert.equal(result.allowed, true,
          `${action} should be allowed`);
      }
    });
  });

  describe('guardedAdaptAdminAction integration', () => {
    it('rejects deprecated action in reject mode', () => {
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

    it('allows deprecated action with warning in warn mode',
      () => {
        const result = guardedAdaptAdminAction(
          'directPartitionWrite', {}, null,
          MUTATION_GUARD_MODE.WARN,
        );
        // Action is unknown so adapter returns unknown error,
        // but guard allows it through with a warning attached
        assert.equal(result.code,
          ADAPTER_ERROR_CODE.UNKNOWN_ACTION);
        assert.ok(result.warning);
      });

    it('routes known admin action without warning in reject' +
      ' mode', () => {
      const result = guardedAdaptAdminAction(
        ADMIN_META_ACTION.GET_NODE_STATUS, {}, null,
        MUTATION_GUARD_MODE.REJECT,
      );
      assert.equal(result.success, true);
      assert.equal(result.warning, undefined);
    });

    it('routes known admin action without warning in warn' +
      ' mode', () => {
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
        const cache = buildCacheMock([{
          [COLUMN.SERVICE_ID]: META_SERVICE_ID.WASM_META,
          [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
          [COLUMN.ADDRESS]: leaderAddr,
        }]);
        const result = guardedAdaptAdminAction(
          WASM_META_ACTION.PUBLISH_MODULE,
          {namespace: 'ns', name: 'mod', version: '1.0.0'},
          cache,
          MUTATION_GUARD_MODE.REJECT,
        );
        assert.equal(result.success, true);
        assert.equal(result.serviceId,
          META_SERVICE_ID.WASM_META);
        assert.equal(result.warning, undefined);
      });
  });
});
