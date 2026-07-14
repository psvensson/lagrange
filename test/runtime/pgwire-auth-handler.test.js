/**
 * Unit tests for PgWireAuthHandler — authentication and policy
 * context mapping for PG wire protocol sessions.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {PgWireAuthHandler} from
  '../../src/runtime/pgwire-auth-handler.js';
import {
  PGWIRE_AUTH_DECISION,
  PGWIRE_AUTH_ACTION,
  PGWIRE_AUTH_AUDIT_MSG,
  PGWIRE_AUTH_ERROR_MSG,
  PGWIRE_AUTH_HANDLER_MODE,
} from '../../src/runtime/pgwire-auth-constants.js';

/** Silent logger for tests. */
const silentLogger = {
  info() {},
  debug() {},
  warn() {},
  error() {},
};

const trustPolicy = Object.freeze({allowedActions: '*'});

function createAuthHandler(options = {}) {
  return new PgWireAuthHandler({
    mode: PGWIRE_AUTH_HANDLER_MODE.TRUST,
    policy: trustPolicy,
    ...options,
  });
}

describe('PgWireAuthHandler', () => {
  describe('construction', () => {
    it('requires an explicit authentication mode', () => {
      assert.throws(
        () => new PgWireAuthHandler(),
        new RegExp(PGWIRE_AUTH_ERROR_MSG.MODE_REQUIRED, 'u'),
      );
    });

    it('requires an explicit authorization policy', () => {
      assert.throws(
        () => new PgWireAuthHandler({
          mode: PGWIRE_AUTH_HANDLER_MODE.TRUST,
        }),
        new RegExp(PGWIRE_AUTH_ERROR_MSG.POLICY_REQUIRED, 'u'),
      );
    });

    it('requires an authenticator for password mode', () => {
      assert.throws(
        () => new PgWireAuthHandler({
          mode: PGWIRE_AUTH_HANDLER_MODE.PASSWORD,
          policy: trustPolicy,
        }),
        new RegExp(PGWIRE_AUTH_ERROR_MSG.MODE_REQUIRED, 'u'),
      );
    });
  });

  describe('authenticate', () => {
    it('maps user/database to tenant/principal context', async () => {
      const handler = createAuthHandler({logger: silentLogger});
      const result = await handler.authenticate({
        user: 'alice',
        database: 'mydb',
      });

      assert.equal(result.authenticated, true);
      assert.ok(result.context);
      assert.equal(result.context.tenantId, 'mydb');
      assert.equal(result.context.principal, 'alice');
      assert.deepEqual(result.context.roles, []);
    });

    it('produces frozen context object', async () => {
      const handler = createAuthHandler({logger: silentLogger});
      const result = await handler.authenticate({
        user: 'bob',
        database: 'testdb',
      });

      assert.ok(Object.isFrozen(result.context));
    });

    it('emits audit record on successful auth', async () => {
      const handler = createAuthHandler({logger: silentLogger});
      const result = await handler.authenticate({
        user: 'alice',
        database: 'mydb',
      });

      assert.ok(result.auditRecord);
      assert.equal(
        result.auditRecord.message,
        PGWIRE_AUTH_AUDIT_MSG.AUTH_SUCCESS,
      );
      assert.equal(
        result.auditRecord.decision,
        PGWIRE_AUTH_DECISION.AUTHENTICATED,
      );
      assert.ok(result.auditRecord.timestamp);
    });

    it('includes roles from authenticator result', async () => {
      const authenticator = async () => ({
        authenticated: true,
        roles: ['admin', 'reader'],
      });
      const handler = createAuthHandler({
        authenticator,
        logger: silentLogger,
      });
      const result = await handler.authenticate({
        user: 'alice',
        database: 'mydb',
      });

      assert.equal(result.authenticated, true);
      assert.deepEqual(result.context.roles, ['admin', 'reader']);
    });

    it('fails closed when credentials are null', async () => {
      const handler = createAuthHandler({logger: silentLogger});
      const result = await handler.authenticate(null);

      assert.equal(result.authenticated, false);
      assert.equal(result.context, null);
      assert.equal(
        result.error,
        PGWIRE_AUTH_ERROR_MSG.CREDENTIALS_REQUIRED,
      );
    });

    it('fails closed when user is missing', async () => {
      const handler = createAuthHandler({logger: silentLogger});
      const result = await handler.authenticate({
        database: 'mydb',
      });

      assert.equal(result.authenticated, false);
      assert.equal(result.context, null);
      assert.equal(
        result.error,
        PGWIRE_AUTH_ERROR_MSG.USER_REQUIRED,
      );
    });

    it('fails closed when database is missing', async () => {
      const handler = createAuthHandler({logger: silentLogger});
      const result = await handler.authenticate({
        user: 'alice',
      });

      assert.equal(result.authenticated, false);
      assert.equal(result.context, null);
      assert.equal(
        result.error,
        PGWIRE_AUTH_ERROR_MSG.DATABASE_REQUIRED,
      );
    });

    it('fails closed when authenticator rejects', async () => {
      const authenticator = async () => ({authenticated: false});
      const handler = createAuthHandler({
        authenticator,
        logger: silentLogger,
      });
      const result = await handler.authenticate({
        user: 'alice',
        database: 'mydb',
      });

      assert.equal(result.authenticated, false);
      assert.equal(result.context, null);
      assert.equal(
        result.error,
        PGWIRE_AUTH_ERROR_MSG.AUTHENTICATOR_FAILED,
      );
    });

    it('fails closed when authenticator throws', async () => {
      const logged = [];
      const authenticator = async (credentials) => {
        throw new Error(`backend rejected ${credentials.password}`);
      };
      const handler = createAuthHandler({
        authenticator,
        mode: PGWIRE_AUTH_HANDLER_MODE.PASSWORD,
        logger: {
          ...silentLogger,
          info(...args) {
            logged.push(args);
          },
        },
      });
      const result = await handler.authenticate({
        user: 'alice',
        database: 'mydb',
        password: 'never-log-this-secret',
      });

      assert.equal(result.authenticated, false);
      assert.equal(result.context, null);
      assert.equal(result.error, PGWIRE_AUTH_ERROR_MSG.AUTHENTICATOR_FAILED);
      assert.doesNotMatch(JSON.stringify(logged), /never-log-this-secret/u);
    });

    it('emits audit record on failed auth', async () => {
      const authenticator = async () => ({authenticated: false});
      const handler = createAuthHandler({
        authenticator,
        logger: silentLogger,
      });
      const result = await handler.authenticate({
        user: 'alice',
        database: 'mydb',
      });

      assert.ok(result.auditRecord);
      assert.equal(
        result.auditRecord.message,
        PGWIRE_AUTH_AUDIT_MSG.AUTH_FAILED,
      );
      assert.equal(
        result.auditRecord.decision,
        PGWIRE_AUTH_DECISION.DENIED,
      );
    });

    it('does not create context on auth failure', async () => {
      const authenticator = async () => ({authenticated: false});
      const handler = createAuthHandler({
        authenticator,
        logger: silentLogger,
      });
      const result = await handler.authenticate({
        user: 'alice',
        database: 'mydb',
      });

      assert.equal(result.context, null);
    });

    it('logs audit record via logger.info', async () => {
      const logged = [];
      const capturingLogger = {
        info(...args) {
          logged.push(args);
        },
        debug() {},
        warn() {},
        error() {},
      };
      const handler = createAuthHandler({
        logger: capturingLogger,
      });
      await handler.authenticate({
        user: 'alice',
        database: 'mydb',
      });

      assert.equal(logged.length, 1);
      assert.equal(logged[0][0], 'pgwire.auth');
      assert.ok(logged[0][1].timestamp);
    });
  });

  describe('authorizeQuery', () => {
    it('authorizes with valid context and no policy', async () => {
      const handler = createAuthHandler({logger: silentLogger});
      const context = {
        tenantId: 'mydb',
        principal: 'alice',
        roles: [],
      };
      const result = handler.authorizeQuery(context);

      assert.equal(result.authorized, true);
      assert.ok(result.auditRecord);
      assert.equal(
        result.auditRecord.message,
        PGWIRE_AUTH_AUDIT_MSG.AUTHZ_GRANTED,
      );
    });

    it('uses EXECUTE_QUERY as default action', async () => {
      const handler = createAuthHandler({logger: silentLogger});
      const context = {
        tenantId: 'mydb',
        principal: 'alice',
        roles: [],
      };
      const result = handler.authorizeQuery(context);

      assert.equal(
        result.auditRecord.action,
        PGWIRE_AUTH_ACTION.EXECUTE_QUERY,
      );
    });

    it('authorizes when policy allows the action', () => {
      const policy = {
        allowedActions: new Set([
          PGWIRE_AUTH_ACTION.EXECUTE_QUERY,
        ]),
      };
      const handler = createAuthHandler({
        policy,
        logger: silentLogger,
      });
      const context = {
        tenantId: 'mydb',
        principal: 'alice',
        roles: [],
      };
      const result = handler.authorizeQuery(context);

      assert.equal(result.authorized, true);
    });

    it('authorizes when policy uses wildcard', () => {
      const policy = {allowedActions: '*'};
      const handler = createAuthHandler({
        policy,
        logger: silentLogger,
      });
      const context = {
        tenantId: 'mydb',
        principal: 'alice',
        roles: [],
      };
      const result = handler.authorizeQuery(context);

      assert.equal(result.authorized, true);
    });

    it('denies when policy does not include action', () => {
      const policy = {
        allowedActions: new Set(['other.action']),
      };
      const handler = createAuthHandler({
        policy,
        logger: silentLogger,
      });
      const context = {
        tenantId: 'mydb',
        principal: 'alice',
        roles: [],
      };
      const result = handler.authorizeQuery(context);

      assert.equal(result.authorized, false);
      assert.ok(result.error);
      assert.equal(
        result.auditRecord.message,
        PGWIRE_AUTH_AUDIT_MSG.AUTHZ_DENIED,
      );
      assert.equal(
        result.auditRecord.decision,
        PGWIRE_AUTH_DECISION.REJECTED,
      );
    });

    it('denies when context is missing tenantId', () => {
      const handler = createAuthHandler({logger: silentLogger});
      const result = handler.authorizeQuery({
        principal: 'alice',
      });

      assert.equal(result.authorized, false);
      assert.ok(result.error);
    });

    it('denies when context is missing principal', () => {
      const handler = createAuthHandler({logger: silentLogger});
      const result = handler.authorizeQuery({
        tenantId: 'mydb',
      });

      assert.equal(result.authorized, false);
      assert.ok(result.error);
    });

    it('denies when context is null', () => {
      const handler = createAuthHandler({logger: silentLogger});
      const result = handler.authorizeQuery(null);

      assert.equal(result.authorized, false);
      assert.ok(result.error);
    });

    it('supports custom action parameter', () => {
      const policy = {
        allowedActions: new Set(['custom.action']),
      };
      const handler = createAuthHandler({
        policy,
        logger: silentLogger,
      });
      const context = {
        tenantId: 'mydb',
        principal: 'alice',
        roles: [],
      };
      const result = handler.authorizeQuery(
        context, 'custom.action',
      );

      assert.equal(result.authorized, true);
      assert.equal(
        result.auditRecord.action,
        'custom.action',
      );
    });

    it('emits audit record on authorization denial', () => {
      const policy = {allowedActions: new Set()};
      const handler = createAuthHandler({
        policy,
        logger: silentLogger,
      });
      const context = {
        tenantId: 'mydb',
        principal: 'alice',
        roles: [],
      };
      const result = handler.authorizeQuery(context);

      assert.ok(result.auditRecord);
      assert.ok(result.auditRecord.timestamp);
      assert.equal(
        result.auditRecord.decision,
        PGWIRE_AUTH_DECISION.REJECTED,
      );
    });

    it('logs audit via logger.info on authz check', () => {
      const logged = [];
      const capturingLogger = {
        info(...args) {
          logged.push(args);
        },
        debug() {},
        warn() {},
        error() {},
      };
      const handler = createAuthHandler({
        logger: capturingLogger,
      });
      handler.authorizeQuery({
        tenantId: 'mydb',
        principal: 'alice',
        roles: [],
      });

      assert.equal(logged.length, 1);
      assert.equal(logged[0][0], 'pgwire.auth');
    });
  });

  describe('end-to-end auth + authz flow', () => {
    it('authenticate then authorize succeeds', async () => {
      const authenticator = async () => ({
        authenticated: true,
        roles: ['user'],
      });
      const handler = createAuthHandler({
        authenticator,
        logger: silentLogger,
      });

      const authResult = await handler.authenticate({
        user: 'alice',
        database: 'mydb',
      });
      assert.equal(authResult.authenticated, true);

      const authzResult = handler.authorizeQuery(
        authResult.context,
      );
      assert.equal(authzResult.authorized, true);
    });

    it('failed auth prevents authorization', async () => {
      const authenticator = async () => ({authenticated: false});
      const handler = createAuthHandler({
        authenticator,
        logger: silentLogger,
      });

      const authResult = await handler.authenticate({
        user: 'alice',
        database: 'mydb',
      });
      assert.equal(authResult.authenticated, false);
      assert.equal(authResult.context, null);

      // Attempting authz with null context fails closed
      const authzResult = handler.authorizeQuery(
        authResult.context,
      );
      assert.equal(authzResult.authorized, false);
    });

    it('all audit records have timestamps', async () => {
      const handler = createAuthHandler({logger: silentLogger});
      const authResult = await handler.authenticate({
        user: 'alice',
        database: 'mydb',
      });
      const authzResult = handler.authorizeQuery(
        authResult.context,
      );

      assert.ok(authResult.auditRecord.timestamp > 0);
      assert.ok(authzResult.auditRecord.timestamp > 0);
    });
  });
});
