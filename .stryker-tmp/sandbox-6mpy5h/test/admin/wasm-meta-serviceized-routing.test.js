/**
 * Tests verifying sys-wasm-meta remains invokable through the
 * same serviceized routing flow as sys-admin-meta — both via
 * direct routing and explicit delegation.
 *
 * Validates: Requirements 2.3, 7.4
 *
 * @module test/admin/wasm-meta-serviceized-routing
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  META_SERVICE_ID,
  META_SERVICE_RUNTIME_REF,
  COLUMN,
  TABLES,
  WASM_META_ACTION,
} from '../../src/constants/index.js';
import {RUNTIME_KIND, RUNTIME_FIELD} from '../../src/constants/runtime.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  routeToMetaService,
  META_ROUTER_ERROR_CODE,
} from '../../src/wasm-service/meta-service-router.js';
import {
  delegateToWasmMeta,
  isDelegatable,
} from '../../src/admin/admin-meta-delegator.js';
import {adaptAdminAction} from '../../src/admin/admin-api-adapter.js';
import {
  createWasmMetaDefinition,
  createAdminMetaDefinition,
} from '../../src/wasm-service/meta-service-factory.js';
import {
  serializeServiceDefinition,
} from '../../src/wasm-service/wasm-service-models.js';

const WASM_LEADER_ADDR = 'node-1/wasm-service/sys-wasm-meta-r1';
const ADMIN_LEADER_ADDR = 'node-2/wasm-service/sys-admin-meta-r1';

/**
 * Build a minimal systemTableCache mock.
 * @param {Array} serviceRows - Rows for the services table.
 * @return {Object} Mock cache with getAll.
 */
function buildCacheMock(serviceRows) {
  return {
    getAll(table) {
      if (table === TABLES.SERVICES) return serviceRows;
      return [];
    },
  };
}

describe('sys-wasm-meta serviceized routing (Req 2.3, 7.4)', () => {
  describe('runtime descriptor binding', () => {
    it('wasm-meta definition uses wasm_component runtime kind', () => {
      const def = createWasmMetaDefinition();
      assert.equal(def.runtimeKind, RUNTIME_KIND.WASM_COMPONENT);
    });

    it('wasm-meta definition has a runtime ref', () => {
      const def = createWasmMetaDefinition();
      assert.equal(
        def.runtimeRef, META_SERVICE_RUNTIME_REF.WASM_META,
      );
    });

    it('wasm-meta serialized row persists runtime fields', () => {
      const def = createWasmMetaDefinition();
      const row = serializeServiceDefinition(def);
      assert.equal(
        row[RUNTIME_FIELD.RUNTIME_KIND],
        RUNTIME_KIND.WASM_COMPONENT,
      );
      assert.equal(
        row[RUNTIME_FIELD.RUNTIME_REF],
        META_SERVICE_RUNTIME_REF.WASM_META,
      );
      assert.equal(row[RUNTIME_FIELD.RUNTIME_CONFIG], null);
    });

    it('both meta services have runtime descriptors', () => {
      const wasm = createWasmMetaDefinition();
      const admin = createAdminMetaDefinition();
      assert.ok(wasm.runtimeKind, 'wasm-meta missing runtimeKind');
      assert.ok(wasm.runtimeRef, 'wasm-meta missing runtimeRef');
      assert.ok(admin.runtimeKind, 'admin-meta missing runtimeKind');
      assert.ok(admin.runtimeRef, 'admin-meta missing runtimeRef');
    });
  });

  describe('direct routing to sys-wasm-meta', () => {
    it('routes directly when leader is available', () => {
      const cache = buildCacheMock([{
        [COLUMN.SERVICE_ID]: META_SERVICE_ID.WASM_META,
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
        [COLUMN.ADDRESS]: WASM_LEADER_ADDR,
      }]);
      const result = routeToMetaService(
        cache,
        META_SERVICE_ID.WASM_META,
        WASM_META_ACTION.PUBLISH_MODULE,
        {namespace: 'ns', name: 'mod', version: '1.0.0'},
      );
      assert.equal(result.success, true);
      assert.equal(result.leaderAddress, WASM_LEADER_ADDR);
      assert.equal(result.serviceId, META_SERVICE_ID.WASM_META);
      assert.equal(
        result.command, WASM_META_ACTION.PUBLISH_MODULE,
      );
    });

    it('returns unavailable when no wasm-meta leader', () => {
      const cache = buildCacheMock([]);
      const result = routeToMetaService(
        cache,
        META_SERVICE_ID.WASM_META,
        WASM_META_ACTION.GET_MODULE,
        {},
      );
      assert.equal(result.success, false);
      assert.equal(
        result.code,
        META_ROUTER_ERROR_CODE.META_SERVICE_UNAVAILABLE,
      );
    });

    it('uses same routing function as sys-admin-meta', () => {
      const cache = buildCacheMock([
        {
          [COLUMN.SERVICE_ID]: META_SERVICE_ID.WASM_META,
          [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
          [COLUMN.ADDRESS]: WASM_LEADER_ADDR,
        },
        {
          [COLUMN.SERVICE_ID]: META_SERVICE_ID.ADMIN_META,
          [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
          [COLUMN.ADDRESS]: ADMIN_LEADER_ADDR,
        },
      ]);
      const wasmResult = routeToMetaService(
        cache, META_SERVICE_ID.WASM_META, 'cmd', {},
      );
      const adminResult = routeToMetaService(
        cache, META_SERVICE_ID.ADMIN_META, 'cmd', {},
      );
      assert.equal(wasmResult.success, true);
      assert.equal(adminResult.success, true);
    });
  });

  describe('explicit delegation from sys-admin-meta', () => {
    it('all WASM_META_ACTION values are delegatable', () => {
      for (const action of Object.values(WASM_META_ACTION)) {
        assert.equal(isDelegatable(action), true, action);
      }
    });

    it('delegation returns auditable routing info', () => {
      const cache = buildCacheMock([{
        [COLUMN.SERVICE_ID]: META_SERVICE_ID.WASM_META,
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
        [COLUMN.ADDRESS]: WASM_LEADER_ADDR,
      }]);
      const payload = {serviceId: 'svc-1'};
      const result = delegateToWasmMeta(
        cache,
        WASM_META_ACTION.CREATE_SERVICE,
        payload,
      );
      assert.equal(result.success, true);
      assert.equal(result.serviceId, META_SERVICE_ID.WASM_META);
      assert.equal(
        result.command, WASM_META_ACTION.CREATE_SERVICE,
      );
      assert.deepEqual(result.payload, payload);
      assert.equal(result.leaderAddress, WASM_LEADER_ADDR);
    });

    it('adapter routes WASM actions via delegation', () => {
      const cache = buildCacheMock([{
        [COLUMN.SERVICE_ID]: META_SERVICE_ID.WASM_META,
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
        [COLUMN.ADDRESS]: WASM_LEADER_ADDR,
      }]);
      const result = adaptAdminAction(
        WASM_META_ACTION.DELETE_SERVICE,
        {serviceId: 'svc-2'},
        cache,
      );
      assert.equal(result.success, true);
      assert.equal(result.serviceId, META_SERVICE_ID.WASM_META);
      assert.equal(
        result.command, WASM_META_ACTION.DELETE_SERVICE,
      );
    });

    it('delegation fails explicitly when leader unavailable', () => {
      const cache = buildCacheMock([]);
      const result = delegateToWasmMeta(
        cache,
        WASM_META_ACTION.SCALE_SERVICE,
        {},
      );
      assert.equal(result.success, false);
      assert.equal(
        result.code,
        META_ROUTER_ERROR_CODE.META_SERVICE_UNAVAILABLE,
      );
    });
  });
});
