// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  checkMetaServiceAvailability,
  routeToMetaService,
  META_ROUTER_ERROR_CODE,
  META_ROUTER_ERROR_MSG,
} from '../../src/wasm-service/meta-service-router.js';
import {META_SERVICE_ID, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

/**
 * Creates a mock system table cache with the given services.
 *
 * @param {Array<Object>} services - Service rows.
 * @return {Object} Mock cache with getAll method.
 */
function createMockCache(services = []) {
  return {
    getAll: (tableName) => {
      if (tableName === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };
}

const LEADER_ADDRESS = 'node-1/wasm-service/sys-wasm-meta-r1';

describe('meta-service-router', () => {
  describe('checkMetaServiceAvailability', () => {
    it('returns available when leader exists with address', () => {
      const cache = createMockCache([
        {
          service_id: META_SERVICE_ID.WASM_META,
          raft_role: RAFT_ROLE.LEADER,
          address: LEADER_ADDRESS,
        },
      ]);

      const result = checkMetaServiceAvailability(
        cache, META_SERVICE_ID.WASM_META,
      );

      assert.equal(result.available, true);
      assert.equal(result.leaderAddress, LEADER_ADDRESS);
    });

    it('returns unavailable when no leader exists', () => {
      const cache = createMockCache([
        {
          service_id: META_SERVICE_ID.WASM_META,
          raft_role: RAFT_ROLE.FOLLOWER,
          address: LEADER_ADDRESS,
        },
      ]);

      const result = checkMetaServiceAvailability(
        cache, META_SERVICE_ID.WASM_META,
      );

      assert.equal(result.available, false);
      assert.equal(result.error, META_ROUTER_ERROR_MSG.NO_LEADER);
    });

    it('returns unavailable when leader has no address', () => {
      const cache = createMockCache([
        {
          service_id: META_SERVICE_ID.WASM_META,
          raft_role: RAFT_ROLE.LEADER,
          address: '',
        },
      ]);

      const result = checkMetaServiceAvailability(
        cache, META_SERVICE_ID.WASM_META,
      );

      assert.equal(result.available, false);
      assert.equal(result.error, META_ROUTER_ERROR_MSG.NO_LEADER);
    });

    it('throws when cache is missing', () => {
      assert.throws(
        () => checkMetaServiceAvailability(
          null, META_SERVICE_ID.WASM_META,
        ),
        {message: META_ROUTER_ERROR_MSG.CACHE_REQUIRED},
      );
    });

    it('returns unavailable for non-meta service IDs', () => {
      const cache = createMockCache([]);

      const result = checkMetaServiceAvailability(
        cache, 'user-service',
      );

      assert.equal(result.available, false);
      assert.equal(
        result.error, META_ROUTER_ERROR_MSG.NOT_META_SERVICE,
      );
    });

    it('works with admin meta service', () => {
      const adminAddr = 'node-2/wasm-service/sys-admin-meta-r1';
      const cache = createMockCache([
        {
          service_id: META_SERVICE_ID.ADMIN_META,
          raft_role: RAFT_ROLE.LEADER,
          address: adminAddr,
        },
      ]);

      const result = checkMetaServiceAvailability(
        cache, META_SERVICE_ID.ADMIN_META,
      );

      assert.equal(result.available, true);
      assert.equal(result.leaderAddress, adminAddr);
    });

    it('ignores services with different service_id', () => {
      const cache = createMockCache([
        {
          service_id: 'other-service',
          raft_role: RAFT_ROLE.LEADER,
          address: LEADER_ADDRESS,
        },
      ]);

      const result = checkMetaServiceAvailability(
        cache, META_SERVICE_ID.WASM_META,
      );

      assert.equal(result.available, false);
    });
  });

  describe('routeToMetaService', () => {
    it('returns success with leader address when available', () => {
      const cache = createMockCache([
        {
          service_id: META_SERVICE_ID.WASM_META,
          raft_role: RAFT_ROLE.LEADER,
          address: LEADER_ADDRESS,
        },
      ]);
      const payload = {moduleId: 'test:mod@1.0.0'};

      const result = routeToMetaService(
        cache, META_SERVICE_ID.WASM_META,
        'publishModule', payload,
      );

      assert.equal(result.success, true);
      assert.equal(result.leaderAddress, LEADER_ADDRESS);
      assert.equal(result.serviceId, META_SERVICE_ID.WASM_META);
      assert.equal(result.command, 'publishModule');
      assert.deepStrictEqual(result.payload, payload);
    });

    it('returns failure with error code when unavailable', () => {
      const cache = createMockCache([]);

      const result = routeToMetaService(
        cache, META_SERVICE_ID.WASM_META,
        'publishModule', {},
      );

      assert.equal(result.success, false);
      assert.equal(result.error, META_ROUTER_ERROR_MSG.NO_LEADER);
      assert.equal(
        result.code,
        META_ROUTER_ERROR_CODE.META_SERVICE_UNAVAILABLE,
      );
    });

    it('returns failure for non-meta service IDs', () => {
      const cache = createMockCache([]);

      const result = routeToMetaService(
        cache, 'random-service', 'doStuff', {},
      );

      assert.equal(result.success, false);
      assert.equal(
        result.error, META_ROUTER_ERROR_MSG.NOT_META_SERVICE,
      );
      assert.equal(
        result.code,
        META_ROUTER_ERROR_CODE.INVALID_META_SERVICE,
      );
    });
  });

  describe('META_ROUTER_ERROR_CODE', () => {
    it('is frozen', () => {
      assert.ok(Object.isFrozen(META_ROUTER_ERROR_CODE));
    });

    it('has expected keys', () => {
      assert.ok(META_ROUTER_ERROR_CODE.META_SERVICE_UNAVAILABLE);
      assert.ok(META_ROUTER_ERROR_CODE.INVALID_META_SERVICE);
    });
  });

  describe('META_ROUTER_ERROR_MSG', () => {
    it('is frozen', () => {
      assert.ok(Object.isFrozen(META_ROUTER_ERROR_MSG));
    });

    it('has expected keys', () => {
      assert.ok(META_ROUTER_ERROR_MSG.NO_LEADER);
      assert.ok(META_ROUTER_ERROR_MSG.NOT_META_SERVICE);
      assert.ok(META_ROUTER_ERROR_MSG.CACHE_REQUIRED);
    });
  });
});
