/**
 * Tests for admin-meta-delegator.
 * Requirements: 1.3, 11.1
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_DELEGATOR_ERROR_CODE,
  ADMIN_DELEGATOR_ERROR_MSG,
  isDelegatable,
  delegateToWasmMeta,
} from '../../src/admin/admin-meta-delegator.js';
import {
  WASM_META_ACTION,
  META_SERVICE_ID,
  COLUMN,
} from '../../src/constants/index.js';
import {
  ADMIN_META_ACTION,
} from '../../src/admin/admin-meta-command-handlers.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {TABLES} from '../../src/constants/tables.js';
import {
  META_ROUTER_ERROR_CODE,
} from '../../src/wasm-service/meta-service-router.js';

/**
 * Build a minimal systemTableCache mock.
 * @param {Array} serviceRows - Rows for the services table.
 * @return {Object} Mock cache with getAll.
 */
function buildCacheMock(serviceRows) {
  return {
    getAll(table) {
      if (table === TABLES.SERVICES) {
        return serviceRows;
      }
      return [];
    },
  };
}

const LEADER_ADDRESS = 'node-1/wasm-service/sys-wasm-meta-r1';

describe('admin-meta-delegator', () => {
  describe('isDelegatable', () => {
    it('returns true for every WASM_META_ACTION value', () => {
      for (const action of Object.values(WASM_META_ACTION)) {
        assert.equal(
          isDelegatable(action),
          true,
          `Expected ${action} to be delegatable`,
        );
      }
    });

    it('returns false for ADMIN_META_ACTION values', () => {
      for (const action of Object.values(ADMIN_META_ACTION)) {
        assert.equal(
          isDelegatable(action),
          false,
          `Expected ${action} to NOT be delegatable`,
        );
      }
    });
  });

  describe('delegateToWasmMeta', () => {
    it('routes delegatable action when leader available', () => {
      const cache = buildCacheMock([{
        [COLUMN.SERVICE_ID]: META_SERVICE_ID.WASM_META,
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
        [COLUMN.ADDRESS]: LEADER_ADDRESS,
      }]);
      const payload = {moduleId: 'm1'};
      const result = delegateToWasmMeta(
        cache,
        WASM_META_ACTION.PUBLISH_MODULE,
        payload,
      );
      assert.equal(result.success, true);
      assert.equal(result.leaderAddress, LEADER_ADDRESS);
      assert.equal(
        result.serviceId, META_SERVICE_ID.WASM_META,
      );
      assert.equal(
        result.command, WASM_META_ACTION.PUBLISH_MODULE,
      );
      assert.deepEqual(result.payload, payload);
    });

    it('returns failure when leader is unavailable', () => {
      const cache = buildCacheMock([{
        [COLUMN.SERVICE_ID]: META_SERVICE_ID.WASM_META,
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER,
        [COLUMN.ADDRESS]: LEADER_ADDRESS,
      }]);
      const result = delegateToWasmMeta(
        cache,
        WASM_META_ACTION.GET_MODULE,
        {},
      );
      assert.equal(result.success, false);
      assert.equal(
        result.code,
        META_ROUTER_ERROR_CODE.META_SERVICE_UNAVAILABLE,
      );
    });

    it('returns NOT_DELEGATABLE for non-WASM action', () => {
      const cache = buildCacheMock([]);
      const result = delegateToWasmMeta(
        cache,
        ADMIN_META_ACTION.EXECUTE_QUERY,
        {},
      );
      assert.equal(result.success, false);
      assert.equal(
        result.code,
        ADMIN_DELEGATOR_ERROR_CODE.NOT_DELEGATABLE,
      );
      assert.equal(
        result.error,
        ADMIN_DELEGATOR_ERROR_MSG.NOT_DELEGATABLE,
      );
    });

    it('throws when systemTableCache is null', () => {
      assert.throws(
        () => delegateToWasmMeta(
          null,
          WASM_META_ACTION.CREATE_SERVICE,
          {},
        ),
        (err) => err instanceof Error,
      );
    });
  });
});
