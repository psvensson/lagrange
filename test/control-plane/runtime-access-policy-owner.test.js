import assert from 'node:assert/strict';
import {describe, test} from 'node:test';

import {
  RUNTIME_ACCESS_POLICY_DECISION,
  RUNTIME_ACCESS_POLICY_MAX_CALL_TARGETS,
  RUNTIME_ACCESS_POLICY_REASON,
  RUNTIME_ACCESS_POLICY_STATUS,
  RuntimeAccessPolicyOwner,
  isOutboundCallAllowed,
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

describe('runtime access policy schema v2 outbound calls', () => {
  const v2Tables = Object.freeze([{
    operations: Object.freeze(['read']),
    slot: 0,
    table: 'table:global.orders',
  }]);

  function v2Payload(calls) {
    return {
      binding_name: 'orders-api',
      calls,
      schema_version: 2,
      tables: structuredClone(v2Tables),
    };
  }

  test('canonicalizes v2 call targets into a sorted frozen allowlist',
    async () => {
      const {gateway, owner} = createOwner();
      const configured = await owner.configureBindingAccess(v2Payload([
        {binding: 'zeta-worker'},
        {binding: 'alpha-worker'},
      ]), SECURITY_CONTEXT);

      assert.equal(configured.schemaVersion, 2);
      assert.deepEqual(configured.calls, ['alpha-worker', 'zeta-worker']);
      assert.equal(Object.isFrozen(configured), true);
      assert.equal(Object.isFrozen(configured.calls), true);
      const [row] = [...gateway.rows.values()];
      const storedValue = JSON.parse(row.config_value);
      assert.equal(storedValue.schema_version, 2);
      assert.deepEqual(storedValue.calls, [
        {binding: 'alpha-worker'},
        {binding: 'zeta-worker'},
      ]);
      const firstBytes = row.config_value;
      assert.equal(
        gateway.lastUpsertOptions.expectedCacheFields.config_value,
        firstBytes,
      );

      const replayed = await owner.configureBindingAccess(v2Payload([
        {binding: 'alpha-worker'},
        {binding: 'zeta-worker'},
      ]), SECURITY_CONTEXT);
      const [replayRow] = [...gateway.rows.values()];
      assert.equal(replayRow.config_value, firstBytes);
      assert.equal(
        gateway.lastUpsertOptions.expectedCacheFields.config_value,
        firstBytes,
      );
      assert.deepEqual(replayed.calls, configured.calls);

      await owner.configureBindingAccess(
        v2Payload([{binding: 'other-worker'}]),
        SECURITY_CONTEXT,
      );
      assert.notEqual(
        gateway.lastUpsertOptions.expectedCacheFields.config_value,
        firstBytes,
      );
    });

  test('accepts an empty allowlist and the exact call target bound',
    async () => {
      const {owner} = createOwner();
      const none = await owner.configureBindingAccess(
        v2Payload([]),
        SECURITY_CONTEXT,
      );
      assert.deepEqual(none.calls, []);
      assert.equal(Object.isFrozen(none.calls), true);

      const bounded = await owner.configureBindingAccess(v2Payload(
        Array.from(
          {length: RUNTIME_ACCESS_POLICY_MAX_CALL_TARGETS},
          (_, index) => ({
            binding: `target-${String(index).padStart(2, '0')}`,
          }),
        ),
      ), SECURITY_CONTEXT);
      assert.equal(
        bounded.calls.length,
        RUNTIME_ACCESS_POLICY_MAX_CALL_TARGETS,
      );
    });

  test('fails closed on invalid v2 call allowlists', async () => {
    const {owner} = createOwner();
    const configure = (calls) =>
      owner.configureBindingAccess(v2Payload(calls), SECURITY_CONTEXT);
    const code = 'runtime_access_invalid_field';

    await assert.rejects(
      configure([{binding: 'dup-target'}, {binding: 'dup-target'}]),
      {code, path: '/calls/1'},
    );
    await assert.rejects(
      configure(Array.from(
        {length: RUNTIME_ACCESS_POLICY_MAX_CALL_TARGETS + 1},
        (_, index) => ({binding: `target-${String(index).padStart(2, '0')}`}),
      )),
      {code, path: '/calls'},
    );
    for (const wildcard of ['*', 'foo*', 'foo.*']) {
      await assert.rejects(
        configure([{binding: wildcard}]),
        {code, path: '/calls/0'},
      );
    }
    await assert.rejects(
      configure([{binding: 'orders-api'}]),
      {code, path: '/calls/0'},
    );
    await assert.rejects(configure('all-of-them'), {code, path: '/calls'});
    await assert.rejects(
      configure([{binding: 'inner-worker', extra: true}]),
      {code, path: '/calls/0'},
    );
    await assert.rejects(configure(['inner-worker']), {code, path: '/calls/0'});
    await assert.rejects(
      owner.configureBindingAccess({
        binding_name: 'orders-api',
        schema_version: 2,
        tables: [],
      }, SECURITY_CONTEXT),
      {code, path: '/policy'},
    );
    await assert.rejects(
      owner.configureBindingAccess({
        binding_name: 'orders-api',
        calls: [],
        schema_version: 1,
        tables: [],
      }, SECURITY_CONTEXT),
      {code, path: '/policy'},
    );
    await assert.rejects(
      owner.configureBindingAccess({
        binding_name: 'orders-api',
        calls: [],
        schema_version: '2',
        tables: [],
      }, SECURITY_CONTEXT),
      {code, path: '/schema_version'},
    );
    await assert.rejects(
      owner.configureBindingAccess({
        binding_name: 'orders-api',
        schema_version: 3,
        tables: [],
      }, SECURITY_CONTEXT),
      {code, path: '/schema_version'},
    );
  });

  test('keeps schema v1 semantics with empty outbound calls and no upgrade',
    async () => {
      const {gateway, owner} = createOwner();
      const configured = await owner.configureBindingAccess({
        binding_name: 'orders-api',
        schema_version: 1,
        tables: structuredClone(v2Tables),
      }, SECURITY_CONTEXT);

      assert.equal(configured.schemaVersion, 1);
      assert.deepEqual(configured.calls, []);
      assert.equal(Object.isFrozen(configured.calls), true);
      const [row] = [...gateway.rows.values()];
      const storedValue = JSON.parse(row.config_value);
      assert.equal(storedValue.schema_version, 1);
      assert.equal(Object.hasOwn(storedValue, 'calls'), false);

      const resolved = await owner.getRuntimePolicy(configured.serviceId);
      assert.equal(resolved.status, RUNTIME_ACCESS_POLICY_STATUS.RESOLVED);
      assert.equal(resolved.policy.schemaVersion, 1);
      assert.deepEqual(resolved.policy.calls, []);
      const outbound = await owner.getOutboundCallPolicy(configured.serviceId);
      assert.deepEqual(outbound, {
        calls: [],
        status: RUNTIME_ACCESS_POLICY_STATUS.RESOLVED,
      });
      assert.equal(isOutboundCallAllowed(outbound, 'any-worker'), false);
    });

  test('exposes outbound call policy variants for the invocation bridge',
    async () => {
      const {gateway, owner} = createOwner();
      const missing = await owner.getOutboundCallPolicy(SERVICE_ID);
      assert.deepEqual(missing, {
        reason: RUNTIME_ACCESS_POLICY_REASON.POLICY_NOT_FOUND,
        status: RUNTIME_ACCESS_POLICY_STATUS.DENIED,
      });
      assert.equal(isOutboundCallAllowed(missing, 'alpha-worker'), false);

      const policy = {
        binding_version_id: 'binding-version-orders',
        calls: [{binding: 'alpha-worker'}, {binding: 'beta-worker'}],
        schema_version: 2,
        service_id: SERVICE_ID,
        tables: [],
        tenant_id: SECURITY_CONTEXT.tenantId,
      };
      const writeStored = (value) => {
        gateway.rows.set(owner.configKey(SERVICE_ID), {
          config_key: owner.configKey(SERVICE_ID),
          config_value: JSON.stringify(value),
          value_type: 'json',
        });
      };
      writeStored(policy);
      const outbound = await owner.getOutboundCallPolicy(SERVICE_ID);
      assert.equal(outbound.status, RUNTIME_ACCESS_POLICY_STATUS.RESOLVED);
      assert.deepEqual(outbound.calls, ['alpha-worker', 'beta-worker']);
      assert.equal(Object.isFrozen(outbound.calls), true);
      assert.equal(isOutboundCallAllowed(outbound, 'alpha-worker'), true);
      assert.equal(isOutboundCallAllowed(outbound, 'beta-worker'), true);
      assert.equal(isOutboundCallAllowed(outbound, 'alpha'), false);
      assert.equal(isOutboundCallAllowed(outbound, 'gamma-worker'), false);
      assert.equal(isOutboundCallAllowed(outbound, undefined), false);

      const expectInvalid = async () => {
        const denied = await owner.getOutboundCallPolicy(SERVICE_ID);
        assert.deepEqual(denied, {
          reason: RUNTIME_ACCESS_POLICY_REASON.INVALID_POLICY,
          status: RUNTIME_ACCESS_POLICY_STATUS.DENIED,
        });
      };
      writeStored({
        ...policy,
        calls: [{binding: 'dup-worker'}, {binding: 'dup-worker'}],
      });
      await expectInvalid();
      writeStored({...policy, schema_version: 1});
      await expectInvalid();
      const {calls: _ignored, ...v2WithoutCalls} = policy;
      writeStored(v2WithoutCalls);
      await expectInvalid();

      gateway.failReads = true;
      const unavailable = await owner.getOutboundCallPolicy(SERVICE_ID);
      assert.deepEqual(unavailable, {
        reason: RUNTIME_ACCESS_POLICY_REASON.POLICY_READ_FAILED,
        status: RUNTIME_ACCESS_POLICY_STATUS.DENIED,
      });
    });

  test('propagates durable write conflicts without returning a policy',
    async () => {
      const gateway = new PolicyGateway();
      gateway.upsertSystemTableRow = async () => {
        throw new Error('expected cache fields conflict');
      };
      const {owner} = createOwner(gateway);
      await assert.rejects(
        owner.configureBindingAccess(
          v2Payload([{binding: 'inner-worker'}]),
          SECURITY_CONTEXT,
        ),
        /expected cache fields conflict/u,
      );
      assert.equal(gateway.rows.size, 0);
    });
});
