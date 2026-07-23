import assert from 'node:assert/strict';
import {describe, test} from 'node:test';

import {
  RUNTIME_ACCESS_POLICY_DECISION,
  RUNTIME_ACCESS_POLICY_REASON,
  RUNTIME_ACCESS_POLICY_STATUS,
  RuntimeAccessPolicyOwner,
  statementAccesses,
} from '../../src/control-plane/owners/runtime-access-policy-owner.js';
import {SQLParser} from '../../src/query/sql-parser.js';

const SERVICE_ID = `binding-service-${'a'.repeat(64)}`;
const SECURITY_CONTEXT = Object.freeze({
  principal: 'alice',
  roles: Object.freeze(['deployer']),
  tenantId: 'tenant-a',
});

class PolicyGateway {
  constructor() {
    this.rows = new Map();
    this.failReads = false;
    this.lastUpsertOptions = null;
  }

  async upsertSystemTableRow(_tableName, row, options) {
    this.lastUpsertOptions = structuredClone(options);
    this.rows.set(row.config_key, structuredClone(row));
    return {affectedRows: 1, success: true};
  }

  async readProjectionRows(_tableName, options) {
    if (this.failReads) throw new Error('projection unavailable');
    return options.readFromCache(options.systemTableCache);
  }
}

function cacheFor(gateway) {
  return {
    get(_tableName, key) {
      return gateway.rows.get(key) || null;
    },
  };
}

function createOwner(gateway = new PolicyGateway()) {
  return {
    gateway,
    owner: new RuntimeAccessPolicyOwner({
      bindingOwner: {
        async getBindingByName(bindingName, securityContext) {
          if (bindingName !== 'orders-api' ||
              securityContext.tenantId !== SECURITY_CONTEXT.tenantId) {
            return null;
          }
          return {
            bindingVersionId: 'binding-version-orders',
            tenantId: SECURITY_CONTEXT.tenantId,
          };
        },
      },
      controlPlaneSystemTableGateway: gateway,
      systemTableCache: cacheFor(gateway),
      now: () => 1000,
    }),
  };
}

describe('runtime access policy owner', () => {
  test('stores canonical indexed policy directly in the existing config table',
    async () => {
      const {gateway, owner} = createOwner();
      const configured = await owner.configureBindingAccess({
        binding_name: 'orders-api',
        schema_version: 1,
        tables: [
          {
            operations: ['write', 'read'],
            slot: 7,
            table: 'table:global.audit',
          },
          {
            operations: ['read'],
            slot: 2,
            table: 'table:global.orders',
          },
        ],
      }, SECURITY_CONTEXT);

      assert.equal(configured.status, undefined);
      assert.equal(configured.serviceId.startsWith('binding-service-'), true);
      assert.deepEqual(
        configured.tables.map((table) => ({
          operations: table.operations,
          slot: table.slot,
          table: table.context,
        })),
        [
          {
            operations: ['read'],
            slot: 2,
            table: 'table:global.orders',
          },
          {
            operations: ['read', 'write'],
            slot: 7,
            table: 'table:global.audit',
          },
        ],
      );

      const [row] = [...gateway.rows.values()];
      assert.equal(row.value_type, 'json');
      assert.equal(row.requires_restart, 0);
      assert.equal(Object.hasOwn(row, 'reads'), false);
      assert.equal(Object.hasOwn(row, 'writes'), false);
      assert.equal(
        JSON.parse(row.config_value).binding_version_id,
        'binding-version-orders',
      );
      assert.deepEqual(gateway.lastUpsertOptions.expectedCacheFields, {
        config_value: row.config_value,
        updated_at: 1000,
      });
    });

  test('authorizes parsed table operations and fails closed without valid policy',
    async () => {
      const {gateway, owner} = createOwner();
      const policy = {
        binding_version_id: 'binding-version-orders',
        schema_version: 1,
        service_id: SERVICE_ID,
        tables: [
          {
            operations: ['read'],
            slot: 0,
            table: 'table:global.orders',
          },
          {
            operations: ['write'],
            slot: 1,
            table: 'table:global.audit',
          },
        ],
        tenant_id: SECURITY_CONTEXT.tenantId,
      };
      gateway.rows.set(owner.configKey(SERVICE_ID), {
        config_key: owner.configKey(SERVICE_ID),
        config_value: JSON.stringify(policy),
        value_type: 'json',
      });

      const allowedRead = await owner.authorizeStatement(SERVICE_ID, {
        type: 'SELECT',
        from: {name: 'orders'},
        joins: [],
      });
      assert.equal(
        allowedRead.decision,
        RUNTIME_ACCESS_POLICY_DECISION.ALLOWED,
      );
      const allowedWrite = await owner.authorizeStatement(SERVICE_ID, {
        type: 'INSERT',
        table: 'global.audit',
      });
      assert.equal(
        allowedWrite.decision,
        RUNTIME_ACCESS_POLICY_DECISION.ALLOWED,
      );
      const deniedWrite = await owner.authorizeStatement(SERVICE_ID, {
        type: 'UPDATE',
        table: 'orders',
      });
      assert.equal(
        deniedWrite.decision,
        RUNTIME_ACCESS_POLICY_DECISION.DENIED,
      );
      assert.equal(
        deniedWrite.reason,
        RUNTIME_ACCESS_POLICY_REASON.ACCESS_NOT_GRANTED,
      );
      const deniedJoin = await owner.authorizeStatement(SERVICE_ID, {
        type: 'SELECT',
        from: {name: 'orders'},
        joins: [{table: {name: 'customers'}}],
      });
      assert.equal(
        deniedJoin.decision,
        RUNTIME_ACCESS_POLICY_DECISION.DENIED,
      );
      const deniedWriteSubquery = await owner.authorizeStatement(
        SERVICE_ID,
        new SQLParser(
          'DELETE FROM audit WHERE id IN (SELECT id FROM secret)',
        ).parse(),
      );
      assert.equal(
        deniedWriteSubquery.decision,
        RUNTIME_ACCESS_POLICY_DECISION.DENIED,
      );
      assert.deepEqual(deniedWriteSubquery.access, {
        operation: 'read',
        table: 'table:global.secret',
      });

      gateway.rows.delete(owner.configKey(SERVICE_ID));
      const missing = await owner.getRuntimePolicy(SERVICE_ID);
      assert.equal(missing.status, RUNTIME_ACCESS_POLICY_STATUS.DENIED);
      assert.equal(
        missing.reason,
        RUNTIME_ACCESS_POLICY_REASON.POLICY_NOT_FOUND,
      );
      gateway.failReads = true;
      const unavailable = await owner.getRuntimePolicy(SERVICE_ID);
      assert.equal(unavailable.status, RUNTIME_ACCESS_POLICY_STATUS.DENIED);
      assert.equal(
        unavailable.reason,
        RUNTIME_ACCESS_POLICY_REASON.POLICY_READ_FAILED,
      );
    });

  test('derives accesses from parsed statement structure without SQL matching',
    () => {
      assert.deepEqual(statementAccesses({
        type: 'SELECT',
        from: {name: 'orders'},
        joins: [{table: {name: 'audit'}}],
      }), {
        accesses: [
          {operation: 'read', table: 'table:global.orders'},
          {operation: 'read', table: 'table:global.audit'},
        ],
        allowedStatement: true,
      });
      assert.equal(
        statementAccesses({type: 'CREATE_TABLE', tableName: 'orders'})
          .allowedStatement,
        false,
      );
      assert.deepEqual(
        statementAccesses(new SQLParser(
          'SELECT * FROM orders WHERE id IN (SELECT id FROM secret)',
        ).parse()).accesses,
        [
          {operation: 'read', table: 'table:global.orders'},
          {operation: 'read', table: 'table:global.secret'},
        ],
      );
      assert.deepEqual(
        statementAccesses(new SQLParser(
          'WITH selected AS (SELECT * FROM secret) SELECT * FROM selected',
        ).parse()).accesses,
        [{operation: 'read', table: 'table:global.secret'}],
      );
      assert.deepEqual(
        statementAccesses(new SQLParser(
          'UPDATE orders SET id = 1 ' +
          'WHERE id IN (SELECT id FROM secret)',
        ).parse()),
        {
          accesses: [
            {operation: 'write', table: 'table:global.orders'},
            {operation: 'read', table: 'table:global.secret'},
          ],
          allowedStatement: true,
        },
      );
      assert.deepEqual(
        statementAccesses(new SQLParser(
          'DELETE FROM orders WHERE id IN (SELECT id FROM secret)',
        ).parse()).accesses,
        [
          {operation: 'write', table: 'table:global.orders'},
          {operation: 'read', table: 'table:global.secret'},
        ],
      );
      assert.equal(
        statementAccesses(new SQLParser(
          'INSERT INTO orders (id) SELECT id FROM secret',
        ).parse()).allowedStatement,
        false,
      );
    });

  test('rejects control-plane system tables as application grants',
    async () => {
      const {owner} = createOwner();
      await assert.rejects(
        owner.configureBindingAccess({
          binding_name: 'orders-api',
          schema_version: 1,
          tables: [{
            operations: ['read'],
            slot: 0,
            table: 'table:global.nodes',
          }],
        }, SECURITY_CONTEXT),
        {code: 'runtime_access_invalid_field', path: '/tables/0'},
      );
    });
});
