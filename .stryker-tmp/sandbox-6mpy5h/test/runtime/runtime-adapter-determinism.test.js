/**
 * Deterministic adapter behavior tests.
 *
 * Verifies that the admin adapter produces identical, deterministic
 * results regardless of which node it runs on. Simulates multiple
 * "nodes" by creating adapter calls with different mock caches and
 * verifies identical results for identical inputs.
 *
 * Requirements: 7.5, 14.3
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  ADAPTER_ERROR_CODE,
  ADAPTER_ERROR_MSG,
  adaptAdminAction,
  guardedAdaptAdminAction,
} from '../../src/admin/admin-api-adapter.js';
import {
  ADMIN_META_ACTION,
} from '../../src/admin/admin-meta-command-handlers.js';
import {
  MUTATION_GUARD_MODE,
  MUTATION_GUARD_ERROR_CODE,
} from '../../src/admin/admin-mutation-guard.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';
import {WASM_META_ACTION} from '../../src/constants/wasm-meta.js';
import {TABLES} from '../../src/constants/tables.js';
import {COLUMN} from '../../src/constants/columns.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  META_ROUTER_ERROR_CODE,
} from '../../src/wasm-service/meta-service-router.js';

/**
 * Creates a minimal mock systemTableCache with configurable
 * service rows, simulating a node's local cache state.
 *
 * @param {Array<Object>} serviceRows - Rows for services table.
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
 *
 * @param {string} serviceId - Service identifier.
 * @param {string} raftRole - Raft role value.
 * @param {string} address - Service address.
 * @return {Object} Service row object.
 */
function serviceRow(serviceId, raftRole, address) {
  return {
    [COLUMN.SERVICE_ID]: serviceId,
    [COLUMN.RAFT_ROLE]: raftRole,
    [COLUMN.ADDRESS]: address,
  };
}

describe('Runtime adapter determinism', () => {
  describe('same action + same cache state = same result', () => {
    it('admin-meta actions produce identical results on two nodes' +
      ' with same cache', () => {
      const cacheA = createMockCache([]);
      const cacheB = createMockCache([]);
      for (const action of Object.values(ADMIN_META_ACTION)) {
        const params = {sql: 'SELECT 1'};
        const resultA = adaptAdminAction(action, params, cacheA);
        const resultB = adaptAdminAction(action, params, cacheB);
        assert.deepEqual(resultA, resultB,
          `${action} should be deterministic across nodes`);
      }
    });

    it('WASM delegation produces identical routing on two nodes' +
      ' with same leader', () => {
      const leaderAddr = 'node-1/wasm-service/sys-wasm-meta-r1';
      const row = serviceRow(
        META_SERVICE_ID.WASM_META,
        RAFT_ROLE.LEADER,
        leaderAddr,
      );
      const cacheA = createMockCache([row]);
      const cacheB = createMockCache([row]);
      const params = {namespace: 'ns', name: 'mod', version: '1.0.0'};
      const resultA = adaptAdminAction(
        WASM_META_ACTION.PUBLISH_MODULE, params, cacheA,
      );
      const resultB = adaptAdminAction(
        WASM_META_ACTION.PUBLISH_MODULE, params, cacheB,
      );
      assert.deepEqual(resultA, resultB);
      assert.equal(resultA.success, true);
      assert.equal(resultA.leaderAddress, leaderAddr);
    });

    it('unknown action produces identical error on two nodes', () => {
      const cacheA = createMockCache([]);
      const cacheB = createMockCache([]);
      const resultA = adaptAdminAction('bogusAction', {}, cacheA);
      const resultB = adaptAdminAction('bogusAction', {}, cacheB);
      assert.deepEqual(resultA, resultB);
      assert.equal(resultA.success, false);
      assert.equal(resultA.code, ADAPTER_ERROR_CODE.UNKNOWN_ACTION);
      assert.equal(resultA.error, ADAPTER_ERROR_MSG.UNKNOWN_ACTION);
    });
  });

  describe('same action + different cache state = consistent' +
    ' error structure', () => {
    it('WASM delegation: one node has leader, other does not', () => {
      const leaderAddr = 'node-1/wasm-service/sys-wasm-meta-r1';
      const cacheWithLeader = createMockCache([
        serviceRow(
          META_SERVICE_ID.WASM_META,
          RAFT_ROLE.LEADER,
          leaderAddr,
        ),
      ]);
      const cacheWithoutLeader = createMockCache([
        serviceRow(
          META_SERVICE_ID.WASM_META,
          RAFT_ROLE.FOLLOWER,
          'node-2/wasm-service/sys-wasm-meta-r2',
        ),
      ]);
      const params = {namespace: 'ns', name: 'mod', version: '1.0.0'};
      const resultWithLeader = adaptAdminAction(
        WASM_META_ACTION.PUBLISH_MODULE, params, cacheWithLeader,
      );
      const resultWithoutLeader = adaptAdminAction(
        WASM_META_ACTION.PUBLISH_MODULE, params, cacheWithoutLeader,
      );
      assert.equal(resultWithLeader.success, true);
      assert.equal(resultWithoutLeader.success, false);
      // Error structure uses the same constant code
      assert.equal(
        resultWithoutLeader.code,
        META_ROUTER_ERROR_CODE.META_SERVICE_UNAVAILABLE,
      );
      assert.equal(typeof resultWithoutLeader.error, 'string');
    });

    it('empty cache vs populated cache: admin-meta actions' +
      ' still succeed identically', () => {
      const emptyCache = createMockCache([]);
      const populatedCache = createMockCache([
        serviceRow(
          META_SERVICE_ID.ADMIN_META,
          RAFT_ROLE.LEADER,
          'node-1/wasm-service/sys-admin-meta-r1',
        ),
      ]);
      // Admin-meta actions don't depend on cache state
      const resultEmpty = adaptAdminAction(
        ADMIN_META_ACTION.LIST_NODES, {}, emptyCache,
      );
      const resultPopulated = adaptAdminAction(
        ADMIN_META_ACTION.LIST_NODES, {}, populatedCache,
      );
      assert.deepEqual(resultEmpty, resultPopulated);
      assert.equal(resultEmpty.success, true);
    });
  });

  describe('adapter behavior is stateless', () => {
    it('repeated calls with same inputs produce same output', () => {
      const cache = createMockCache([]);
      const params = {sql: 'SELECT 1'};
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(adaptAdminAction(
          ADMIN_META_ACTION.EXECUTE_QUERY, params, cache,
        ));
      }
      for (let i = 1; i < results.length; i++) {
        assert.deepEqual(results[i], results[0],
          `call ${i} should match call 0`);
      }
    });

    it('order of different actions does not affect results', () => {
      const cache = createMockCache([]);
      const params = {sql: 'SELECT 1'};
      // Call in order A then B
      const queryFirst = adaptAdminAction(
        ADMIN_META_ACTION.EXECUTE_QUERY, params, cache,
      );
      const nodesFirst = adaptAdminAction(
        ADMIN_META_ACTION.LIST_NODES, {}, cache,
      );
      // Call in order B then A
      const nodesSecond = adaptAdminAction(
        ADMIN_META_ACTION.LIST_NODES, {}, cache,
      );
      const querySecond = adaptAdminAction(
        ADMIN_META_ACTION.EXECUTE_QUERY, params, cache,
      );
      assert.deepEqual(queryFirst, querySecond);
      assert.deepEqual(nodesFirst, nodesSecond);
    });

    it('interleaving WASM and admin actions has no side effects',
      () => {
        const leaderAddr = 'node-1/wasm-service/sys-wasm-meta-r1';
        const cache = createMockCache([
          serviceRow(
            META_SERVICE_ID.WASM_META,
            RAFT_ROLE.LEADER,
            leaderAddr,
          ),
        ]);
        const wasmParams = {
          namespace: 'ns', name: 'mod', version: '1.0.0',
        };
        const adminParams = {sql: 'SELECT 1'};
        const wasm1 = adaptAdminAction(
          WASM_META_ACTION.PUBLISH_MODULE, wasmParams, cache,
        );
        const admin1 = adaptAdminAction(
          ADMIN_META_ACTION.EXECUTE_QUERY, adminParams, cache,
        );
        const wasm2 = adaptAdminAction(
          WASM_META_ACTION.PUBLISH_MODULE, wasmParams, cache,
        );
        const admin2 = adaptAdminAction(
          ADMIN_META_ACTION.EXECUTE_QUERY, adminParams, cache,
        );
        assert.deepEqual(wasm1, wasm2);
        assert.deepEqual(admin1, admin2);
      });
  });

  describe('guard behavior is deterministic', () => {
    it('reject mode produces same rejection for same unknown' +
      ' action on two nodes', () => {
      const cacheA = createMockCache([]);
      const cacheB = createMockCache([]);
      const resultA = guardedAdaptAdminAction(
        'directPartitionWrite', {}, cacheA,
        MUTATION_GUARD_MODE.REJECT,
      );
      const resultB = guardedAdaptAdminAction(
        'directPartitionWrite', {}, cacheB,
        MUTATION_GUARD_MODE.REJECT,
      );
      assert.deepEqual(resultA, resultB);
      assert.equal(resultA.success, false);
      assert.equal(
        resultA.code,
        MUTATION_GUARD_ERROR_CODE.BYPASS_REJECTED,
      );
    });

    it('warn mode produces same warning for same deprecated' +
      ' action on two nodes', () => {
      const cacheA = createMockCache([]);
      const cacheB = createMockCache([]);
      const resultA = guardedAdaptAdminAction(
        'directPartitionWrite', {}, cacheA,
        MUTATION_GUARD_MODE.WARN,
      );
      const resultB = guardedAdaptAdminAction(
        'directPartitionWrite', {}, cacheB,
        MUTATION_GUARD_MODE.WARN,
      );
      assert.deepEqual(resultA, resultB);
      assert.ok(resultA.warning);
      // Unknown action still returns unknown error with warning
      assert.equal(resultA.code, ADAPTER_ERROR_CODE.UNKNOWN_ACTION);
    });

    it('known admin action passes guard identically on two' +
      ' nodes in reject mode', () => {
      const cacheA = createMockCache([]);
      const cacheB = createMockCache([]);
      const resultA = guardedAdaptAdminAction(
        ADMIN_META_ACTION.GET_NODE_STATUS, {}, cacheA,
        MUTATION_GUARD_MODE.REJECT,
      );
      const resultB = guardedAdaptAdminAction(
        ADMIN_META_ACTION.GET_NODE_STATUS, {}, cacheB,
        MUTATION_GUARD_MODE.REJECT,
      );
      assert.deepEqual(resultA, resultB);
      assert.equal(resultA.success, true);
      assert.equal(resultA.warning, undefined);
    });

    it('known admin action passes guard identically on two' +
      ' nodes in warn mode', () => {
      const cacheA = createMockCache([]);
      const cacheB = createMockCache([]);
      const resultA = guardedAdaptAdminAction(
        ADMIN_META_ACTION.LIST_PARTITIONS, {tableId: 't1'},
        cacheA, MUTATION_GUARD_MODE.WARN,
      );
      const resultB = guardedAdaptAdminAction(
        ADMIN_META_ACTION.LIST_PARTITIONS, {tableId: 't1'},
        cacheB, MUTATION_GUARD_MODE.WARN,
      );
      assert.deepEqual(resultA, resultB);
      assert.equal(resultA.success, true);
      assert.equal(resultA.warning, undefined);
    });

    it('WASM action passes guard identically on two nodes', () => {
      const leaderAddr = 'node-1/wasm-service/sys-wasm-meta-r1';
      const row = serviceRow(
        META_SERVICE_ID.WASM_META,
        RAFT_ROLE.LEADER,
        leaderAddr,
      );
      const cacheA = createMockCache([row]);
      const cacheB = createMockCache([row]);
      const params = {
        namespace: 'ns', name: 'mod', version: '1.0.0',
      };
      const resultA = guardedAdaptAdminAction(
        WASM_META_ACTION.CREATE_SERVICE, params, cacheA,
        MUTATION_GUARD_MODE.REJECT,
      );
      const resultB = guardedAdaptAdminAction(
        WASM_META_ACTION.CREATE_SERVICE, params, cacheB,
        MUTATION_GUARD_MODE.REJECT,
      );
      assert.deepEqual(resultA, resultB);
      assert.equal(resultA.success, true);
      assert.equal(resultA.warning, undefined);
    });
  });

  describe('delegation routing is deterministic', () => {
    it('same cache state routes to same wasm-meta leader', () => {
      const leaderAddr = 'node-3/wasm-service/sys-wasm-meta-r1';
      const rows = [
        serviceRow(
          META_SERVICE_ID.WASM_META,
          RAFT_ROLE.FOLLOWER,
          'node-1/wasm-service/sys-wasm-meta-r2',
        ),
        serviceRow(
          META_SERVICE_ID.WASM_META,
          RAFT_ROLE.LEADER,
          leaderAddr,
        ),
        serviceRow(
          META_SERVICE_ID.WASM_META,
          RAFT_ROLE.FOLLOWER,
          'node-2/wasm-service/sys-wasm-meta-r3',
        ),
      ];
      const cacheA = createMockCache(rows);
      const cacheB = createMockCache(rows);
      const params = {moduleId: 'mod-1'};
      const resultA = adaptAdminAction(
        WASM_META_ACTION.GET_MODULE, params, cacheA,
      );
      const resultB = adaptAdminAction(
        WASM_META_ACTION.GET_MODULE, params, cacheB,
      );
      assert.deepEqual(resultA, resultB);
      assert.equal(resultA.success, true);
      assert.equal(resultA.leaderAddress, leaderAddr);
      assert.equal(resultA.serviceId, META_SERVICE_ID.WASM_META);
    });

    it('different leader addresses produce different routing' +
      ' but same structure', () => {
      const addrA = 'node-1/wasm-service/sys-wasm-meta-r1';
      const addrB = 'node-2/wasm-service/sys-wasm-meta-r1';
      const cacheA = createMockCache([
        serviceRow(
          META_SERVICE_ID.WASM_META, RAFT_ROLE.LEADER, addrA,
        ),
      ]);
      const cacheB = createMockCache([
        serviceRow(
          META_SERVICE_ID.WASM_META, RAFT_ROLE.LEADER, addrB,
        ),
      ]);
      const params = {namespace: 'ns', name: 'svc', version: '2.0.0'};
      const resultA = adaptAdminAction(
        WASM_META_ACTION.SCALE_SERVICE, params, cacheA,
      );
      const resultB = adaptAdminAction(
        WASM_META_ACTION.SCALE_SERVICE, params, cacheB,
      );
      // Same structure, same keys
      assert.equal(resultA.success, true);
      assert.equal(resultB.success, true);
      assert.equal(resultA.serviceId, resultB.serviceId);
      assert.equal(resultA.command, resultB.command);
      assert.deepEqual(resultA.payload, resultB.payload);
      // Different leader addresses
      assert.equal(resultA.leaderAddress, addrA);
      assert.equal(resultB.leaderAddress, addrB);
    });

    it('all WASM delegation actions route deterministically', () => {
      const leaderAddr = 'node-5/wasm-service/sys-wasm-meta-r1';
      const row = serviceRow(
        META_SERVICE_ID.WASM_META,
        RAFT_ROLE.LEADER,
        leaderAddr,
      );
      const cacheA = createMockCache([row]);
      const cacheB = createMockCache([row]);
      for (const action of Object.values(WASM_META_ACTION)) {
        const params = {key: 'value'};
        const resultA = adaptAdminAction(action, params, cacheA);
        const resultB = adaptAdminAction(action, params, cacheB);
        assert.deepEqual(resultA, resultB,
          `${action} should route deterministically`);
        assert.equal(resultA.success, true);
        assert.equal(resultA.serviceId, META_SERVICE_ID.WASM_META);
      }
    });

    it('no leader on either node produces identical error', () => {
      const cacheA = createMockCache([
        serviceRow(
          META_SERVICE_ID.WASM_META,
          RAFT_ROLE.FOLLOWER,
          'node-1/wasm-service/sys-wasm-meta-r1',
        ),
      ]);
      const cacheB = createMockCache([
        serviceRow(
          META_SERVICE_ID.WASM_META,
          RAFT_ROLE.FOLLOWER,
          'node-2/wasm-service/sys-wasm-meta-r2',
        ),
      ]);
      const resultA = adaptAdminAction(
        WASM_META_ACTION.DELETE_SERVICE, {}, cacheA,
      );
      const resultB = adaptAdminAction(
        WASM_META_ACTION.DELETE_SERVICE, {}, cacheB,
      );
      assert.deepEqual(resultA, resultB);
      assert.equal(resultA.success, false);
      assert.equal(
        resultA.code,
        META_ROUTER_ERROR_CODE.META_SERVICE_UNAVAILABLE,
      );
    });
  });
});
