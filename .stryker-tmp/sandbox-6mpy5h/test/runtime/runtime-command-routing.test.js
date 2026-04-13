/**
 * Tests for runtime command routing — verifies that command routing
 * resolves service leaders from `services` metadata for all
 * runtime-owned handlers (not just WASM).
 *
 * Requirements: 7.1, 7.5
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  checkMetaServiceAvailability,
  routeToMetaService,
  META_ROUTER_ERROR_CODE,
  META_ROUTER_ERROR_MSG,
} from '../../src/wasm-service/meta-service-router.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';
import {TABLES} from '../../src/constants/tables.js';
import {COLUMN} from '../../src/constants/columns.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

/**
 * Creates a minimal mock systemTableCache with configurable
 * service rows.
 *
 * @param {Array<Object>} serviceRows - Rows returned by getAll.
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
 * Builds a service row matching the column constants.
 */
function serviceRow(serviceId, raftRole, address) {
  return {
    [COLUMN.SERVICE_ID]: serviceId,
    [COLUMN.RAFT_ROLE]: raftRole,
    [COLUMN.ADDRESS]: address,
  };
}

describe('Runtime command routing', () => {
  let cache;

  describe('checkMetaServiceAvailability', () => {
    it('throws when systemTableCache is null', () => {
      assert.throws(
        () => checkMetaServiceAvailability(null, META_SERVICE_ID.ADMIN_META),
        {message: META_ROUTER_ERROR_MSG.CACHE_REQUIRED},
      );
    });

    it('throws when systemTableCache is undefined', () => {
      assert.throws(
        () => checkMetaServiceAvailability(
          undefined, META_SERVICE_ID.WASM_META,
        ),
        {message: META_ROUTER_ERROR_MSG.CACHE_REQUIRED},
      );
    });

    it('returns unavailable for unrecognized service ID', () => {
      cache = createMockCache([]);
      const result = checkMetaServiceAvailability(cache, 'unknown-svc');
      assert.equal(result.available, false);
      assert.equal(result.error, META_ROUTER_ERROR_MSG.NOT_META_SERVICE);
    });

    it('returns unavailable when no leader exists for admin meta', () => {
      cache = createMockCache([
        serviceRow(
          META_SERVICE_ID.ADMIN_META,
          RAFT_ROLE.FOLLOWER,
          'node-1/wasm-service/sys-admin-meta-r1',
        ),
      ]);
      const result = checkMetaServiceAvailability(
        cache, META_SERVICE_ID.ADMIN_META,
      );
      assert.equal(result.available, false);
      assert.equal(result.error, META_ROUTER_ERROR_MSG.NO_LEADER);
    });

    it('returns unavailable when leader has no address', () => {
      cache = createMockCache([
        serviceRow(
          META_SERVICE_ID.WASM_META,
          RAFT_ROLE.LEADER,
          '',
        ),
      ]);
      const result = checkMetaServiceAvailability(
        cache, META_SERVICE_ID.WASM_META,
      );
      assert.equal(result.available, false);
      assert.equal(result.error, META_ROUTER_ERROR_MSG.NO_LEADER);
    });

    it('returns unavailable when leader address is null', () => {
      cache = createMockCache([
        serviceRow(
          META_SERVICE_ID.ADMIN_META,
          RAFT_ROLE.LEADER,
          null,
        ),
      ]);
      const result = checkMetaServiceAvailability(
        cache, META_SERVICE_ID.ADMIN_META,
      );
      assert.equal(result.available, false);
      assert.equal(result.error, META_ROUTER_ERROR_MSG.NO_LEADER);
    });

    it('resolves leader address for sys-admin-meta', () => {
      const addr = 'node-1/wasm-service/sys-admin-meta-r1';
      cache = createMockCache([
        serviceRow(META_SERVICE_ID.ADMIN_META, RAFT_ROLE.LEADER, addr),
      ]);
      const result = checkMetaServiceAvailability(
        cache, META_SERVICE_ID.ADMIN_META,
      );
      assert.equal(result.available, true);
      assert.equal(result.leaderAddress, addr);
    });

    it('resolves leader address for sys-wasm-meta', () => {
      const addr = 'node-2/wasm-service/sys-wasm-meta-r1';
      cache = createMockCache([
        serviceRow(META_SERVICE_ID.WASM_META, RAFT_ROLE.LEADER, addr),
      ]);
      const result = checkMetaServiceAvailability(
        cache, META_SERVICE_ID.WASM_META,
      );
      assert.equal(result.available, true);
      assert.equal(result.leaderAddress, addr);
    });

    it('picks leader among mixed roles', () => {
      const leaderAddr = 'node-3/wasm-service/sys-admin-meta-r2';
      cache = createMockCache([
        serviceRow(
          META_SERVICE_ID.ADMIN_META,
          RAFT_ROLE.FOLLOWER,
          'node-1/wasm-service/sys-admin-meta-r1',
        ),
        serviceRow(
          META_SERVICE_ID.ADMIN_META,
          RAFT_ROLE.LEADER,
          leaderAddr,
        ),
        serviceRow(
          META_SERVICE_ID.ADMIN_META,
          RAFT_ROLE.FOLLOWER,
          'node-2/wasm-service/sys-admin-meta-r3',
        ),
      ]);
      const result = checkMetaServiceAvailability(
        cache, META_SERVICE_ID.ADMIN_META,
      );
      assert.equal(result.available, true);
      assert.equal(result.leaderAddress, leaderAddr);
    });

    it('ignores leader rows for a different service ID', () => {
      cache = createMockCache([
        serviceRow(
          META_SERVICE_ID.WASM_META,
          RAFT_ROLE.LEADER,
          'node-1/wasm-service/sys-wasm-meta-r1',
        ),
      ]);
      const result = checkMetaServiceAvailability(
        cache, META_SERVICE_ID.ADMIN_META,
      );
      assert.equal(result.available, false);
      assert.equal(result.error, META_ROUTER_ERROR_MSG.NO_LEADER);
    });

    it('returns unavailable when services table is empty', () => {
      cache = createMockCache([]);
      const result = checkMetaServiceAvailability(
        cache, META_SERVICE_ID.WASM_META,
      );
      assert.equal(result.available, false);
      assert.equal(result.error, META_ROUTER_ERROR_MSG.NO_LEADER);
    });
  });

  describe('routeToMetaService', () => {
    it('returns error for unrecognized service ID', () => {
      cache = createMockCache([]);
      const result = routeToMetaService(
        cache, 'not-a-meta-svc', 'someCmd', {},
      );
      assert.equal(result.success, false);
      assert.equal(
        result.error, META_ROUTER_ERROR_MSG.NOT_META_SERVICE,
      );
      assert.equal(
        result.code, META_ROUTER_ERROR_CODE.INVALID_META_SERVICE,
      );
    });

    it('returns unavailable when no leader for admin meta', () => {
      cache = createMockCache([]);
      const result = routeToMetaService(
        cache, META_SERVICE_ID.ADMIN_META, 'getClusterState', {},
      );
      assert.equal(result.success, false);
      assert.equal(result.error, META_ROUTER_ERROR_MSG.NO_LEADER);
      assert.equal(
        result.code,
        META_ROUTER_ERROR_CODE.META_SERVICE_UNAVAILABLE,
      );
    });

    it('returns unavailable when no leader for wasm meta', () => {
      cache = createMockCache([]);
      const result = routeToMetaService(
        cache, META_SERVICE_ID.WASM_META, 'publishModule', {},
      );
      assert.equal(result.success, false);
      assert.equal(result.error, META_ROUTER_ERROR_MSG.NO_LEADER);
      assert.equal(
        result.code,
        META_ROUTER_ERROR_CODE.META_SERVICE_UNAVAILABLE,
      );
    });

    it('routes command to admin meta leader', () => {
      const addr = 'node-1/wasm-service/sys-admin-meta-r1';
      cache = createMockCache([
        serviceRow(META_SERVICE_ID.ADMIN_META, RAFT_ROLE.LEADER, addr),
      ]);
      const payload = {key: 'value'};
      const result = routeToMetaService(
        cache, META_SERVICE_ID.ADMIN_META, 'getClusterState', payload,
      );
      assert.equal(result.success, true);
      assert.equal(result.leaderAddress, addr);
      assert.equal(result.serviceId, META_SERVICE_ID.ADMIN_META);
      assert.equal(result.command, 'getClusterState');
      assert.deepEqual(result.payload, payload);
    });

    it('routes command to wasm meta leader', () => {
      const addr = 'node-2/wasm-service/sys-wasm-meta-r1';
      cache = createMockCache([
        serviceRow(META_SERVICE_ID.WASM_META, RAFT_ROLE.LEADER, addr),
      ]);
      const payload = {moduleId: 'mod-1'};
      const result = routeToMetaService(
        cache, META_SERVICE_ID.WASM_META, 'publishModule', payload,
      );
      assert.equal(result.success, true);
      assert.equal(result.leaderAddress, addr);
      assert.equal(result.serviceId, META_SERVICE_ID.WASM_META);
      assert.equal(result.command, 'publishModule');
      assert.deepEqual(result.payload, payload);
    });
  });

  describe('routing for runtime-owned handlers', () => {
    it('resolves admin meta independently of wasm meta', () => {
      const adminAddr = 'node-1/wasm-service/sys-admin-meta-r1';
      const wasmAddr = 'node-2/wasm-service/sys-wasm-meta-r1';
      cache = createMockCache([
        serviceRow(
          META_SERVICE_ID.ADMIN_META, RAFT_ROLE.LEADER, adminAddr,
        ),
        serviceRow(
          META_SERVICE_ID.WASM_META, RAFT_ROLE.LEADER, wasmAddr,
        ),
      ]);
      const adminResult = routeToMetaService(
        cache, META_SERVICE_ID.ADMIN_META, 'getNodeState', {},
      );
      const wasmResult = routeToMetaService(
        cache, META_SERVICE_ID.WASM_META, 'createService', {},
      );
      assert.equal(adminResult.success, true);
      assert.equal(adminResult.leaderAddress, adminAddr);
      assert.equal(wasmResult.success, true);
      assert.equal(wasmResult.leaderAddress, wasmAddr);
    });

    it('handles one service available and other unavailable', () => {
      const wasmAddr = 'node-1/wasm-service/sys-wasm-meta-r1';
      cache = createMockCache([
        serviceRow(
          META_SERVICE_ID.WASM_META, RAFT_ROLE.LEADER, wasmAddr,
        ),
        serviceRow(
          META_SERVICE_ID.ADMIN_META, RAFT_ROLE.FOLLOWER,
          'node-2/wasm-service/sys-admin-meta-r1',
        ),
      ]);
      const wasmResult = routeToMetaService(
        cache, META_SERVICE_ID.WASM_META, 'listModules', {},
      );
      const adminResult = routeToMetaService(
        cache, META_SERVICE_ID.ADMIN_META, 'getCacheState', {},
      );
      assert.equal(wasmResult.success, true);
      assert.equal(wasmResult.leaderAddress, wasmAddr);
      assert.equal(adminResult.success, false);
      assert.equal(
        adminResult.code,
        META_ROUTER_ERROR_CODE.META_SERVICE_UNAVAILABLE,
      );
    });

    it('routing uses services metadata not hardcoded addresses', () => {
      const dynamicAddr = 'node-99/wasm-service/sys-admin-meta-r7';
      cache = createMockCache([
        serviceRow(
          META_SERVICE_ID.ADMIN_META, RAFT_ROLE.LEADER, dynamicAddr,
        ),
      ]);
      const result = routeToMetaService(
        cache, META_SERVICE_ID.ADMIN_META, 'getConfig', {},
      );
      assert.equal(result.success, true);
      assert.equal(result.leaderAddress, dynamicAddr);
    });

    it('learner role does not satisfy leader requirement', () => {
      cache = createMockCache([
        serviceRow(
          META_SERVICE_ID.WASM_META,
          RAFT_ROLE.LEARNER,
          'node-1/wasm-service/sys-wasm-meta-r1',
        ),
      ]);
      const result = checkMetaServiceAvailability(
        cache, META_SERVICE_ID.WASM_META,
      );
      assert.equal(result.available, false);
      assert.equal(result.error, META_ROUTER_ERROR_MSG.NO_LEADER);
    });

    it('candidate role does not satisfy leader requirement', () => {
      cache = createMockCache([
        serviceRow(
          META_SERVICE_ID.ADMIN_META,
          RAFT_ROLE.CANDIDATE,
          'node-1/wasm-service/sys-admin-meta-r1',
        ),
      ]);
      const result = checkMetaServiceAvailability(
        cache, META_SERVICE_ID.ADMIN_META,
      );
      assert.equal(result.available, false);
      assert.equal(result.error, META_ROUTER_ERROR_MSG.NO_LEADER);
    });
  });
});
