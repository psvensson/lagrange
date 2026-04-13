/**
 * Unit tests for PgWireSession — per-connection session state.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4
 *
 * Tests cover session lifecycle, prepared statement management,
 * portal management, transaction state tracking, and connection-
 * scoped isolation.
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  PgWireSession,
  PGWIRE_SESSION_STATE,
  PGWIRE_SESSION_ERROR,
} from '../../src/runtime/pgwire-session.js';
import {
  PG_TRANSACTION_STATE,
} from '../../src/runtime/pgwire-protocol-constants.js';

describe('PgWireSession', () => {
  describe('construction', () => {
    it('should create session with required fields', () => {
      const s = new PgWireSession({sessionId: 'sess-1'});
      assert.equal(s.sessionId, 'sess-1');
      assert.equal(s.state, PGWIRE_SESSION_STATE.CREATED);
      assert.equal(s.txState, PG_TRANSACTION_STATE.IDLE);
      assert.equal(s.tenantId, null);
      assert.equal(s.user, null);
      assert.equal(s.database, null);
    });

    it('should accept optional fields', () => {
      const s = new PgWireSession({
        sessionId: 'sess-2',
        tenantId: 'tenant-a',
        user: 'alice',
        database: 'mydb',
      });
      assert.equal(s.tenantId, 'tenant-a');
      assert.equal(s.user, 'alice');
      assert.equal(s.database, 'mydb');
    });

    it('should throw when sessionId is missing', () => {
      assert.throws(
        () => new PgWireSession({}),
        (err) => err.message ===
          PGWIRE_SESSION_ERROR.SESSION_ID_REQUIRED,
      );
    });

    it('should throw when options is null', () => {
      assert.throws(
        () => new PgWireSession(null),
        (err) => err.message ===
          PGWIRE_SESSION_ERROR.SESSION_ID_REQUIRED,
      );
    });
  });

  describe('lifecycle', () => {
    it('should transition through states', () => {
      const s = new PgWireSession({sessionId: 's1'});
      assert.equal(s.state, PGWIRE_SESSION_STATE.CREATED);

      s.markAuthenticated();
      assert.equal(s.state, PGWIRE_SESSION_STATE.AUTHENTICATED);

      s.markReady();
      assert.equal(s.state, PGWIRE_SESSION_STATE.READY);

      s.close();
      assert.equal(s.state, PGWIRE_SESSION_STATE.CLOSED);
      assert.ok(s.isClosed());
    });

    it('should clear statements and portals on close', () => {
      const s = new PgWireSession({sessionId: 's1'});
      s.setPreparedStatement('stmt1', 'SELECT 1');
      s.setPortal('p1', 'stmt1', []);

      s.close();

      assert.equal(s.getPreparedStatement('stmt1'), null);
      assert.equal(s.getPortal('p1'), null);
    });
  });

  describe('prepared statements', () => {
    it('should store and retrieve a prepared statement', () => {
      const s = new PgWireSession({sessionId: 's1'});
      s.setPreparedStatement('stmt1', 'SELECT $1', [25]);

      const stmt = s.getPreparedStatement('stmt1');
      assert.equal(stmt.query, 'SELECT $1');
      assert.deepStrictEqual(stmt.paramTypes, [25]);
    });

    it('should support unnamed prepared statement', () => {
      const s = new PgWireSession({sessionId: 's1'});
      s.setPreparedStatement('', 'SELECT 1');

      assert.ok(s.hasPreparedStatement(''));
      assert.equal(s.getPreparedStatement('').query, 'SELECT 1');
    });

    it('should return null for missing statement', () => {
      const s = new PgWireSession({sessionId: 's1'});
      assert.equal(s.getPreparedStatement('nope'), null);
    });

    it('should overwrite existing statement with same name', () => {
      const s = new PgWireSession({sessionId: 's1'});
      s.setPreparedStatement('s', 'SELECT 1');
      s.setPreparedStatement('s', 'SELECT 2');
      assert.equal(s.getPreparedStatement('s').query, 'SELECT 2');
    });

    it('should close associated portal when overwriting', () => {
      const s = new PgWireSession({sessionId: 's1'});
      s.setPreparedStatement('s', 'SELECT 1');
      s.setPortal('s', 's', []);
      assert.ok(s.getPortal('s'));

      s.setPreparedStatement('s', 'SELECT 2');
      assert.equal(s.getPortal('s'), null);
    });

    it('should close statement and associated portal', () => {
      const s = new PgWireSession({sessionId: 's1'});
      s.setPreparedStatement('s', 'SELECT 1');
      s.setPortal('s', 's', []);

      s.closePreparedStatement('s');
      assert.equal(s.getPreparedStatement('s'), null);
      assert.equal(s.getPortal('s'), null);
    });

    it('should report existence via hasPreparedStatement', () => {
      const s = new PgWireSession({sessionId: 's1'});
      assert.equal(s.hasPreparedStatement('x'), false);
      s.setPreparedStatement('x', 'SELECT 1');
      assert.equal(s.hasPreparedStatement('x'), true);
    });
  });

  describe('portals', () => {
    it('should store and retrieve a portal', () => {
      const s = new PgWireSession({sessionId: 's1'});
      s.setPortal('p1', 'stmt1', ['val1']);

      const p = s.getPortal('p1');
      assert.equal(p.statementName, 'stmt1');
      assert.deepStrictEqual(p.params, ['val1']);
    });

    it('should support unnamed portal', () => {
      const s = new PgWireSession({sessionId: 's1'});
      s.setPortal('', 'stmt1', []);
      assert.ok(s.getPortal(''));
    });

    it('should return null for missing portal', () => {
      const s = new PgWireSession({sessionId: 's1'});
      assert.equal(s.getPortal('nope'), null);
    });

    it('should close a portal', () => {
      const s = new PgWireSession({sessionId: 's1'});
      s.setPortal('p1', 'stmt1', []);
      s.closePortal('p1');
      assert.equal(s.getPortal('p1'), null);
    });
  });

  describe('transaction state', () => {
    it('should default to IDLE', () => {
      const s = new PgWireSession({sessionId: 's1'});
      assert.equal(
        s.getTransactionState(), PG_TRANSACTION_STATE.IDLE,
      );
    });

    it('should track IN_TRANSACTION state', () => {
      const s = new PgWireSession({sessionId: 's1'});
      s.setTransactionState(PG_TRANSACTION_STATE.IN_TRANSACTION);
      assert.equal(
        s.getTransactionState(),
        PG_TRANSACTION_STATE.IN_TRANSACTION,
      );
      assert.equal(s.isInFailedTransaction(), false);
    });

    it('should track FAILED state', () => {
      const s = new PgWireSession({sessionId: 's1'});
      s.setTransactionState(PG_TRANSACTION_STATE.FAILED);
      assert.equal(
        s.getTransactionState(), PG_TRANSACTION_STATE.FAILED,
      );
      assert.ok(s.isInFailedTransaction());
    });
  });

  describe('connection-scoped isolation', () => {
    it('should isolate state between sessions', () => {
      const s1 = new PgWireSession({sessionId: 'a'});
      const s2 = new PgWireSession({sessionId: 'b'});

      s1.setPreparedStatement('stmt', 'SELECT 1');
      s1.setPortal('p', 'stmt', []);
      s1.setTransactionState(PG_TRANSACTION_STATE.IN_TRANSACTION);

      assert.equal(s2.getPreparedStatement('stmt'), null);
      assert.equal(s2.getPortal('p'), null);
      assert.equal(
        s2.getTransactionState(), PG_TRANSACTION_STATE.IDLE,
      );
    });
  });

  describe('constants', () => {
    it('should export frozen PGWIRE_SESSION_STATE', () => {
      assert.ok(Object.isFrozen(PGWIRE_SESSION_STATE));
      assert.equal(PGWIRE_SESSION_STATE.CREATED, 'created');
      assert.equal(
        PGWIRE_SESSION_STATE.AUTHENTICATED, 'authenticated',
      );
      assert.equal(PGWIRE_SESSION_STATE.READY, 'ready');
      assert.equal(PGWIRE_SESSION_STATE.CLOSED, 'closed');
    });

    it('should export frozen PGWIRE_SESSION_ERROR', () => {
      assert.ok(Object.isFrozen(PGWIRE_SESSION_ERROR));
    });
  });
});
