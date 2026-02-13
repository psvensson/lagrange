/**
 * Tests for explicit unavailable errors when service leaders
 * are missing or unroutable.
 *
 * Verifies that the routing infrastructure returns typed,
 * structured error responses instead of silent failures.
 *
 * Requirements: 7.2, 12.5
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';

import {
  META_ROUTER_ERROR_CODE,
  META_ROUTER_ERROR_MSG,
  routeToMetaService,
  checkMetaServiceAvailability,
} from '../../src/wasm-service/meta-service-router.js';

import {
  ADMIN_DELEGATOR_ERROR_CODE,
  ADMIN_DELEGATOR_ERROR_MSG,
  isDelegatable,
  delegateToWasmMeta,
} from '../../src/admin/admin-meta-delegator.js';

import {
  ADAPTER_ERROR_CODE,
  ADAPTER_ERROR_MSG,
  adaptAdminAction,
} from '../../src/admin/admin-api-adapter.js';

import {
  ADMIN_META_ACTION,
  WASM_DELEGATION_ACTIONS,
} from '../../src/admin/admin-meta-command-handlers.js';

import {META_SERVICE_ID, WASM_META_ACTION} from '../../src/constants/index.js';
import {TABLES} from '../../src/constants/tables.js';
import {COLUMN} from '../../src/constants/columns.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

/**
 * Creates a minimal mock system table cache.
 * @param {Array} serviceRows - Rows for the services table.
 * @return {Object} Mock cache with getAll method.
 */
function createMockCache(serviceRows = []) {
  return {
    getAll(tableName) {
      if (tableName === TABLES.SERVICES) {
        return serviceRows;
      }
      return [];
    },
  };
}

/**
 * Creates a service row for the mock cache.
 * @param {string} serviceId - Service ID.
 * @param {string} raftRole - Raft role.
 * @param {string} [address] - Optional address.
 * @return {Object} Service row.
 */
function createServiceRow(serviceId, raftRole, address) {
  const row = {
    [COLUMN.SERVICE_ID]: serviceId,
    [COLUMN.RAFT_ROLE]: raftRole,
  };
  if (address) {
    row[COLUMN.ADDRESS] = address;
  }
  return row;
}

describe('runtime unavailable errors', () => {
  let emptyCache;

  beforeEach(() => {
    emptyCache = createMockCache([]);
  });

  describe('routeToMetaService - missing leader', () => {
    it('returns META_SERVICE_UNAVAILABLE when no leader exists', () => {
      const result = routeToMetaService(
        emptyCache,
        META_SERVICE_ID.WASM_META,
        'someCommand',
        {},
      );
      assert.equal(result.success, false);
      assert.equal(
        result.code,
        META_ROUTER_ERROR_CODE.META_SERVICE_UNAVAILABLE,
      );
      assert.equal(result.error, META_ROUTER_ERROR_MSG.NO_LEADER);
    });

    it('returns unavailable when leader has no address', () => {
      const cache = createMockCache([
        createServiceRow(
          META_SERVICE_ID.WASM_META,
          RAFT_ROLE.LEADER,
        ),
      ]);
      const result = routeToMetaService(
        cache,
        META_SERVICE_ID.WASM_META,
        'someCommand',
        {},
      );
      assert.equal(result.success, false);
      assert.equal(
        result.code,
        META_ROUTER_ERROR_CODE.META_SERVICE_UNAVAILABLE,
      );
    });

    it('returns unavailable when only followers exist', () => {
      const cache = createMockCache([
        createServiceRow(
          META_SERVICE_ID.WASM_META,
          RAFT_ROLE.FOLLOWER,
          'node-1/wasm-service/sys-wasm-meta-r1',
        ),
      ]);
      const result = routeToMetaService(
        cache,
        META_SERVICE_ID.WASM_META,
        'someCommand',
        {},
      );
      assert.equal(result.success, false);
      assert.equal(
        result.code,
        META_ROUTER_ERROR_CODE.META_SERVICE_UNAVAILABLE,
      );
      assert.equal(result.error, META_ROUTER_ERROR_MSG.NO_LEADER);
    });

    it('succeeds when leader with address exists', () => {
      const leaderAddr = 'node-1/wasm-service/sys-wasm-meta-r1';
      const cache = createMockCache([
        createServiceRow(
          META_SERVICE_ID.WASM_META,
          RAFT_ROLE.LEADER,
          leaderAddr,
        ),
      ]);
      const result = routeToMetaService(
        cache,
        META_SERVICE_ID.WASM_META,
        'testCmd',
        {key: 'val'},
      );
      assert.equal(result.success, true);
      assert.equal(result.leaderAddress, leaderAddr);
      assert.equal(result.serviceId, META_SERVICE_ID.WASM_META);
      assert.equal(result.command, 'testCmd');
      assert.deepEqual(result.payload, {key: 'val'});
    });
  });

  describe('routeToMetaService - invalid service ID', () => {
    it('returns INVALID_META_SERVICE for unknown service', () => {
      const result = routeToMetaService(
        emptyCache,
        'unknown-service',
        'someCommand',
        {},
      );
      assert.equal(result.success, false);
      assert.equal(
        result.code,
        META_ROUTER_ERROR_CODE.INVALID_META_SERVICE,
      );
      assert.equal(
        result.error,
        META_ROUTER_ERROR_MSG.NOT_META_SERVICE,
      );
    });

    it('returns INVALID_META_SERVICE for empty string', () => {
      const result = routeToMetaService(
        emptyCache, '', 'cmd', {},
      );
      assert.equal(result.success, false);
      assert.equal(
        result.code,
        META_ROUTER_ERROR_CODE.INVALID_META_SERVICE,
      );
    });
  });

  describe('checkMetaServiceAvailability', () => {
    it('throws when cache is missing', () => {
      assert.throws(
        () => checkMetaServiceAvailability(null, META_SERVICE_ID.WASM_META),
        {message: META_ROUTER_ERROR_MSG.CACHE_REQUIRED},
      );
    });

    it('returns unavailable for non-meta service', () => {
      const result = checkMetaServiceAvailability(
        emptyCache, 'not-a-meta-service',
      );
      assert.equal(result.available, false);
      assert.equal(
        result.error,
        META_ROUTER_ERROR_MSG.NOT_META_SERVICE,
      );
    });

    it('returns unavailable when no leader in cache', () => {
      const result = checkMetaServiceAvailability(
        emptyCache, META_SERVICE_ID.ADMIN_META,
      );
      assert.equal(result.available, false);
      assert.equal(result.error, META_ROUTER_ERROR_MSG.NO_LEADER);
    });

    it('returns available with leader address', () => {
      const addr = 'node-2/wasm-service/sys-admin-meta-r1';
      const cache = createMockCache([
        createServiceRow(
          META_SERVICE_ID.ADMIN_META,
          RAFT_ROLE.LEADER,
          addr,
        ),
      ]);
      const result = checkMetaServiceAvailability(
        cache, META_SERVICE_ID.ADMIN_META,
      );
      assert.equal(result.available, true);
      assert.equal(result.leaderAddress, addr);
    });
  });

  describe('delegateToWasmMeta - unavailable leader', () => {
    it('returns META_SERVICE_UNAVAILABLE when wasm-meta leader missing', () => {
      const result = delegateToWasmMeta(
        emptyCache,
        WASM_META_ACTION.PUBLISH_MODULE,
        {},
      );
      assert.equal(result.success, false);
      assert.equal(
        result.code,
        META_ROUTER_ERROR_CODE.META_SERVICE_UNAVAILABLE,
      );
      assert.equal(result.error, META_ROUTER_ERROR_MSG.NO_LEADER);
    });

    it('returns NOT_DELEGATABLE for non-delegatable action', () => {
      const result = delegateToWasmMeta(
        emptyCache,
        ADMIN_META_ACTION.GET_CACHE_DUMP,
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

    it('succeeds when wasm-meta leader is available', () => {
      const addr = 'node-1/wasm-service/sys-wasm-meta-r1';
      const cache = createMockCache([
        createServiceRow(
          META_SERVICE_ID.WASM_META,
          RAFT_ROLE.LEADER,
          addr,
        ),
      ]);
      const result = delegateToWasmMeta(
        cache,
        WASM_META_ACTION.CREATE_SERVICE,
        {name: 'svc'},
      );
      assert.equal(result.success, true);
      assert.equal(result.leaderAddress, addr);
      assert.equal(result.serviceId, META_SERVICE_ID.WASM_META);
    });
  });

  describe('isDelegatable', () => {
    it('returns true for WASM delegation actions', () => {
      for (const action of WASM_DELEGATION_ACTIONS) {
        assert.equal(isDelegatable(action), true);
      }
    });

    it('returns false for admin-only actions', () => {
      assert.equal(
        isDelegatable(ADMIN_META_ACTION.GET_CACHE_DUMP),
        false,
      );
      assert.equal(
        isDelegatable(ADMIN_META_ACTION.GET_NODE_STATUS),
        false,
      );
    });
  });

  describe('adaptAdminAction - unknown action', () => {
    it('returns UNKNOWN_ACTION for unrecognized action', () => {
      const result = adaptAdminAction(
        'nonExistentAction', {}, emptyCache,
      );
      assert.equal(result.success, false);
      assert.equal(
        result.code,
        ADAPTER_ERROR_CODE.UNKNOWN_ACTION,
      );
      assert.equal(
        result.error,
        ADAPTER_ERROR_MSG.UNKNOWN_ACTION,
      );
    });

    it('returns UNKNOWN_ACTION for empty string action', () => {
      const result = adaptAdminAction('', {}, emptyCache);
      assert.equal(result.success, false);
      assert.equal(
        result.code,
        ADAPTER_ERROR_CODE.UNKNOWN_ACTION,
      );
    });
  });

  describe('error structure consistency', () => {
    it('all routing errors have success, error, and code', () => {
      const errors = [
        routeToMetaService(
          emptyCache, META_SERVICE_ID.WASM_META, 'cmd', {},
        ),
        routeToMetaService(
          emptyCache, 'bad-id', 'cmd', {},
        ),
        delegateToWasmMeta(
          emptyCache, ADMIN_META_ACTION.GET_CACHE_DUMP, {},
        ),
        delegateToWasmMeta(
          emptyCache, WASM_META_ACTION.PUBLISH_MODULE, {},
        ),
        adaptAdminAction('unknownAction', {}, emptyCache),
      ];
      for (const err of errors) {
        assert.equal(err.success, false);
        assert.equal(typeof err.error, 'string');
        assert.ok(err.error.length > 0);
        assert.equal(typeof err.code, 'string');
        assert.ok(err.code.length > 0);
      }
    });

    it('success responses do not contain error code', () => {
      const addr = 'node-1/wasm-service/sys-wasm-meta-r1';
      const cache = createMockCache([
        createServiceRow(
          META_SERVICE_ID.WASM_META,
          RAFT_ROLE.LEADER,
          addr,
        ),
      ]);
      const result = routeToMetaService(
        cache, META_SERVICE_ID.WASM_META, 'cmd', {},
      );
      assert.equal(result.success, true);
      assert.equal(result.error, undefined);
      assert.equal(result.code, undefined);
    });
  });

  describe('no fallback behavior', () => {
    it('does not try alternative routing when leader unavailable', () => {
      // Only followers exist — system must NOT route to them
      const cache = createMockCache([
        createServiceRow(
          META_SERVICE_ID.WASM_META,
          RAFT_ROLE.FOLLOWER,
          'node-1/wasm-service/sys-wasm-meta-r1',
        ),
        createServiceRow(
          META_SERVICE_ID.WASM_META,
          RAFT_ROLE.FOLLOWER,
          'node-2/wasm-service/sys-wasm-meta-r2',
        ),
      ]);
      const result = routeToMetaService(
        cache,
        META_SERVICE_ID.WASM_META,
        'cmd',
        {},
      );
      assert.equal(result.success, false);
      assert.equal(
        result.code,
        META_ROUTER_ERROR_CODE.META_SERVICE_UNAVAILABLE,
      );
      // Must not contain a leader address from fallback
      assert.equal(result.leaderAddress, undefined);
    });

    it('does not fall back to default handler for bad service', () => {
      const result = routeToMetaService(
        emptyCache,
        'totally-unknown-service',
        'cmd',
        {},
      );
      assert.equal(result.success, false);
      assert.equal(
        result.code,
        META_ROUTER_ERROR_CODE.INVALID_META_SERVICE,
      );
      // Must not contain routing info from fallback
      assert.equal(result.leaderAddress, undefined);
      assert.equal(result.serviceId, undefined);
    });
  });
});
