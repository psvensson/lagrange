import assert from 'node:assert/strict';
import {describe, test} from 'node:test';

import {PostgresWireAdapter} from
  '../../src/query/pg/postgres-wire-adapter.js';
import {
  SERVICE_LIFECYCLE_SQL_CLASSIFICATION,
  SERVICE_LIFECYCLE_SQL_COMMAND,
  SERVICE_LIFECYCLE_SQL_ERROR_CODE,
  classifyServiceLifecycleSql,
  parseServiceLifecycleSql,
} from '../../src/query/service-lifecycle-sql-contract.js';
import {
  PGWIRE_AUTH_ACTION,
  PGWIRE_AUTH_DEFAULT_ACTIONS,
  PGWIRE_AUTH_HANDLER_MODE,
} from '../../src/runtime/pgwire-auth-constants.js';
import {PgWireAuthHandler} from
  '../../src/runtime/pgwire-auth-handler.js';

const silentLogger = Object.freeze({
  debug() {},
  error() {},
  info() {},
  warn() {},
});

function callPayload(overrides = {}) {
  return JSON.stringify({
    schema_version: 1,
    name: 'daily-rollup',
    ...overrides,
  });
}

function createAuthHandler(allowedActions) {
  return new PgWireAuthHandler({
    mode: PGWIRE_AUTH_HANDLER_MODE.PASSWORD,
    authenticator: async () => ({
      authenticated: true,
      roles: ['service-operator'],
    }),
    policy: {allowedActions: new Set(allowedActions)},
    logger: silentLogger,
  });
}

async function createAuthenticatedAdapter(sqlCore, allowedActions) {
  const adapter = new PostgresWireAdapter({
    sqlCore,
    authHandler: createAuthHandler(allowedActions),
    logger: silentLogger,
  });
  await adapter.authenticate('call-session', {
    tenantId: 'tenant-a',
    user: 'alice',
    password: 'fixture-password',
  });
  return adapter;
}

describe('CALL BINDING SQL ingress classification', () => {
  test('classifies CALL BINDING as a lifecycle command', () => {
    assert.equal(
      classifyServiceLifecycleSql('CALL BINDING $1').kind,
      SERVICE_LIFECYCLE_SQL_CLASSIFICATION.LIFECYCLE,
    );
    assert.equal(
      classifyServiceLifecycleSql('CALL BINDING $1').command,
      SERVICE_LIFECYCLE_SQL_COMMAND.CALL_BINDING,
    );
    assert.equal(
      classifyServiceLifecycleSql('  call   binding $1;').command,
      SERVICE_LIFECYCLE_SQL_COMMAND.CALL_BINDING,
    );
    assert.equal(
      classifyServiceLifecycleSql('/* lead */ CALL BINDING $1').command,
      SERVICE_LIFECYCLE_SQL_COMMAND.CALL_BINDING,
    );
    assert.equal(
      classifyServiceLifecycleSql('SELECT 1').kind,
      SERVICE_LIFECYCLE_SQL_CLASSIFICATION.ORDINARY,
    );
  });

  test('parses a valid payload with required and optional fields', () => {
    const parsed = parseServiceLifecycleSql(
      'CALL BINDING $1',
      [callPayload({arguments: {shard: 2}})],
    );
    assert.equal(parsed.command, SERVICE_LIFECYCLE_SQL_COMMAND.CALL_BINDING);
    assert.deepEqual(parsed.payload, {
      arguments: {shard: 2},
      name: 'daily-rollup',
      schema_version: 1,
    });
    const minimal = parseServiceLifecycleSql(
      'CALL BINDING $1;',
      [callPayload()],
    );
    assert.deepEqual(minimal.payload, {
      name: 'daily-rollup',
      schema_version: 1,
    });
  });

  test('rejects malformed grammar around the exact statement', () => {
    assert.throws(
      () => parseServiceLifecycleSql('CALL BINDING $1 EXTRA', [callPayload()]),
      (error) =>
        error.code === SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_GRAMMAR,
    );
    assert.throws(
      () => parseServiceLifecycleSql(
        '/* lead */ CALL BINDING $1',
        [callPayload()],
      ),
      (error) =>
        error.code === SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_GRAMMAR,
    );
    assert.throws(
      () => parseServiceLifecycleSql('CALL BINDING', [callPayload()]),
      (error) =>
        error.code === SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_GRAMMAR,
    );
  });

  test('rejects payloads missing required fields or carrying unknown fields',
    () => {
      assert.throws(
        () => parseServiceLifecycleSql(
          'CALL BINDING $1',
          [JSON.stringify({name: 'daily-rollup'})],
        ),
        (error) =>
          error.code === SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_PAYLOAD &&
          error.path === '/payload/schema_version',
      );
      assert.throws(
        () => parseServiceLifecycleSql(
          'CALL BINDING $1',
          [JSON.stringify({schema_version: 1})],
        ),
        (error) =>
          error.code === SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_PAYLOAD &&
          error.path === '/payload/name',
      );
      assert.throws(
        () => parseServiceLifecycleSql(
          'CALL BINDING $1',
          [callPayload({tenant_id: 'attacker-selected'})],
        ),
        (error) =>
          error.code === SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_PAYLOAD &&
          error.path === '/payload/tenant_id',
      );
    });
});

describe('CALL BINDING authorization action mapping', () => {
  test('maps the command to the BINDING_CALL auth action', async () => {
    let ownerCalls = 0;
    const sqlCore = {
      async executeRequest() {
        ownerCalls += 1;
        return {success: true, rows: []};
      },
    };
    const adapter = await createAuthenticatedAdapter(sqlCore, [
      PGWIRE_AUTH_ACTION.BINDING_CALL,
      PGWIRE_AUTH_ACTION.EXECUTE_QUERY,
    ]);
    const result = await adapter.execute(
      'call-session',
      'CALL BINDING $1',
      [callPayload()],
    );
    assert.equal(result.success, true);
    assert.equal(ownerCalls, 1);
  });

  test('fails closed when the session lacks the BINDING_CALL action',
    async () => {
      let ownerCalls = 0;
      const sqlCore = {
        async executeRequest() {
          ownerCalls += 1;
          return {success: true, rows: []};
        },
      };
      const adapter = await createAuthenticatedAdapter(sqlCore, [
        PGWIRE_AUTH_ACTION.EXECUTE_QUERY,
      ]);
      await assert.rejects(
        adapter.execute('call-session', 'CALL BINDING $1', [callPayload()]),
        /authorized/iu,
      );
      assert.equal(ownerCalls, 0);
    },
  );

  test('grants BINDING_CALL to password-mode sessions by default', () => {
    assert.equal(
      PGWIRE_AUTH_DEFAULT_ACTIONS.PASSWORD.includes(
        PGWIRE_AUTH_ACTION.BINDING_CALL,
      ),
      true,
    );
    assert.equal(Object.isFrozen(PGWIRE_AUTH_DEFAULT_ACTIONS.PASSWORD), true);
  });
});
