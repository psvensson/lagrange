import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {
  SessionKVStore,
  KV_TABLE_NAME,
  KV_COL,
  KV_SQL,
} from '../../src/wasm-service/session-kv-store.js';
import {
  WASM_SERVICE_ERROR_MSG,
} from '../../src/wasm-service/wasm-service-constants.js';

describe('SessionKVStore', () => {
  let store;

  beforeEach(() => {
    store = new SessionKVStore(':memory:');
  });

  afterEach(() => {
    if (store) {
      store.close();
      store = null;
    }
  });

  describe('constants', () => {
    it('should export the internal table name', () => {
      assert.equal(KV_TABLE_NAME, '_kv_store');
    });

    it('should export frozen column name constants', () => {
      assert.ok(Object.isFrozen(KV_COL));
      assert.equal(KV_COL.SESSION_ID, 'session_id');
      assert.equal(KV_COL.KEY, 'key');
      assert.equal(KV_COL.VALUE, 'value');
      assert.equal(KV_COL.UPDATED_AT, 'updated_at');
    });

    it('should export frozen SQL constants', () => {
      assert.ok(Object.isFrozen(KV_SQL));
    });
  });

  describe('schema creation', () => {
    it('should create the _kv_store table on construction', () => {
      const sql =
        'SELECT name FROM sqlite_master ' +
        'WHERE type = ? AND name = ?';
      const rows = store.db.prepare(sql).all('table', KV_TABLE_NAME);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].name, KV_TABLE_NAME);
    });

    it('should create the session index on construction', () => {
      const sql =
        'SELECT name FROM sqlite_master ' +
        'WHERE type = ? AND name = ?';
      const rows = store.db.prepare(sql).all('index', 'idx_kv_session');
      assert.equal(rows.length, 1);
    });
  });

  describe('get', () => {
    it('should return null for a non-existent key', () => {
      const result = store.get('session-1', 'missing-key');
      assert.equal(result, null);
    });

    it('should return a Buffer for an existing key', () => {
      const value = Buffer.from('hello');
      store.applySet('session-1', 'key-1', value);
      const result = store.get('session-1', 'key-1');
      assert.ok(Buffer.isBuffer(result));
      assert.ok(result.equals(value));
    });

    it('should not return keys from other sessions', () => {
      store.applySet('session-1', 'key-1', Buffer.from('a'));
      const result = store.get('session-2', 'key-1');
      assert.equal(result, null);
    });
  });

  describe('getAll', () => {
    it('should return an empty Map for a non-existent session', () => {
      const result = store.getAll('no-session');
      assert.ok(result instanceof Map);
      assert.equal(result.size, 0);
    });

    it('should return all keys for a session', () => {
      store.applySet('s1', 'k1', Buffer.from('v1'));
      store.applySet('s1', 'k2', Buffer.from('v2'));
      store.applySet('s2', 'k3', Buffer.from('v3'));

      const result = store.getAll('s1');
      assert.equal(result.size, 2);
      assert.ok(result.get('k1').equals(Buffer.from('v1')));
      assert.ok(result.get('k2').equals(Buffer.from('v2')));
    });

    it('should return Buffers as values', () => {
      store.applySet('s1', 'k1', Buffer.from([0, 1, 255]));
      const result = store.getAll('s1');
      assert.ok(Buffer.isBuffer(result.get('k1')));
    });
  });

  describe('applySet', () => {
    it('should insert a new key-value pair', () => {
      store.applySet('s1', 'k1', Buffer.from('data'));
      const result = store.get('s1', 'k1');
      assert.ok(result.equals(Buffer.from('data')));
    });

    it('should upsert an existing key', () => {
      store.applySet('s1', 'k1', Buffer.from('old'));
      store.applySet('s1', 'k1', Buffer.from('new'));
      const result = store.get('s1', 'k1');
      assert.ok(result.equals(Buffer.from('new')));
    });

    it('should store binary data correctly', () => {
      const binary = Buffer.from([0, 1, 2, 127, 128, 254, 255]);
      store.applySet('s1', 'bin', binary);
      const result = store.get('s1', 'bin');
      assert.ok(result.equals(binary));
    });

    it('should store empty buffer', () => {
      const empty = Buffer.alloc(0);
      store.applySet('s1', 'empty', empty);
      const result = store.get('s1', 'empty');
      assert.ok(Buffer.isBuffer(result));
      assert.equal(result.length, 0);
    });
  });

  describe('applyDelete', () => {
    it('should delete a single key', () => {
      store.applySet('s1', 'k1', Buffer.from('v1'));
      store.applySet('s1', 'k2', Buffer.from('v2'));
      store.applyDelete('s1', 'k1');
      assert.equal(store.get('s1', 'k1'), null);
      assert.ok(store.get('s1', 'k2') !== null);
    });

    it('should be a no-op for non-existent key', () => {
      assert.doesNotThrow(() => {
        store.applyDelete('s1', 'missing');
      });
    });
  });

  describe('applyDeleteSession', () => {
    it('should delete all keys for a session', () => {
      store.applySet('s1', 'k1', Buffer.from('v1'));
      store.applySet('s1', 'k2', Buffer.from('v2'));
      store.applySet('s2', 'k3', Buffer.from('v3'));

      store.applyDeleteSession('s1');

      assert.equal(store.get('s1', 'k1'), null);
      assert.equal(store.get('s1', 'k2'), null);
      assert.ok(store.get('s2', 'k3') !== null);
    });

    it('should be a no-op for non-existent session', () => {
      assert.doesNotThrow(() => {
        store.applyDeleteSession('no-session');
      });
    });
  });

  describe('getSessionSize', () => {
    it('should return 0 for an empty session', () => {
      assert.equal(store.getSessionSize('empty'), 0);
    });

    it('should return total bytes of values for a session', () => {
      store.applySet('s1', 'k1', Buffer.from('abc'));
      store.applySet('s1', 'k2', Buffer.from('de'));
      const size = store.getSessionSize('s1');
      assert.equal(size, 5);
    });

    it('should not include other sessions', () => {
      store.applySet('s1', 'k1', Buffer.from('abc'));
      store.applySet('s2', 'k2', Buffer.from('defgh'));
      assert.equal(store.getSessionSize('s1'), 3);
      assert.equal(store.getSessionSize('s2'), 5);
    });

    it('should update after upsert', () => {
      store.applySet('s1', 'k1', Buffer.from('short'));
      assert.equal(store.getSessionSize('s1'), 5);
      store.applySet('s1', 'k1', Buffer.from('longer-value'));
      assert.equal(store.getSessionSize('s1'), 12);
    });
  });

  describe('getTotalSize', () => {
    it('should return 0 for an empty store', () => {
      assert.equal(store.getTotalSize(), 0);
    });

    it('should return total bytes across all sessions', () => {
      store.applySet('s1', 'k1', Buffer.from('abc'));
      store.applySet('s2', 'k2', Buffer.from('de'));
      assert.equal(store.getTotalSize(), 5);
    });

    it('should decrease after delete', () => {
      store.applySet('s1', 'k1', Buffer.from('abc'));
      store.applySet('s1', 'k2', Buffer.from('de'));
      assert.equal(store.getTotalSize(), 5);
      store.applyDelete('s1', 'k1');
      assert.equal(store.getTotalSize(), 2);
    });
  });

  describe('close', () => {
    it('should close the database connection', () => {
      store.close();
      assert.equal(store.db, null);
      store = null;
    });

    it('should be safe to call close twice', () => {
      store.close();
      assert.doesNotThrow(() => store.close());
      store = null;
    });
  });

  describe('setLimits', () => {
    it('should accept writes when no limits are set', () => {
      const result = store.applySet(
        's1', 'k1', Buffer.alloc(1024),
      );
      assert.equal(result.accepted, true);
      assert.equal(result.error, null);
    });

    it('should return accepted result for writes within limits',
      () => {
        store.setLimits(100, 1000);
        const result = store.applySet(
          's1', 'k1', Buffer.alloc(50),
        );
        assert.equal(result.accepted, true);
        assert.equal(result.error, null);
      });

    it('should reject write exceeding per-session limit', () => {
      store.setLimits(10, 1000);
      const result = store.applySet(
        's1', 'k1', Buffer.alloc(11),
      );
      assert.equal(result.accepted, false);
      assert.equal(
        result.error,
        WASM_SERVICE_ERROR_MSG.SESSION_SIZE_LIMIT_EXCEEDED,
      );
    });

    it('should reject write exceeding per-service limit', () => {
      store.setLimits(1000, 10);
      const result = store.applySet(
        's1', 'k1', Buffer.alloc(11),
      );
      assert.equal(result.accepted, false);
      assert.equal(
        result.error,
        WASM_SERVICE_ERROR_MSG.SERVICE_SIZE_LIMIT_EXCEEDED,
      );
    });

    it('should check session limit before service limit', () => {
      store.setLimits(5, 5);
      const result = store.applySet(
        's1', 'k1', Buffer.alloc(6),
      );
      assert.equal(result.accepted, false);
      assert.equal(
        result.error,
        WASM_SERVICE_ERROR_MSG.SESSION_SIZE_LIMIT_EXCEEDED,
      );
    });

    it('should account for existing data in session', () => {
      store.setLimits(10, 1000);
      store.applySet('s1', 'k1', Buffer.alloc(6));
      const result = store.applySet(
        's1', 'k2', Buffer.alloc(5),
      );
      assert.equal(result.accepted, false);
      assert.equal(
        result.error,
        WASM_SERVICE_ERROR_MSG.SESSION_SIZE_LIMIT_EXCEEDED,
      );
    });

    it('should account for existing data across sessions', () => {
      store.setLimits(1000, 15);
      store.applySet('s1', 'k1', Buffer.alloc(10));
      const result = store.applySet(
        's2', 'k1', Buffer.alloc(6),
      );
      assert.equal(result.accepted, false);
      assert.equal(
        result.error,
        WASM_SERVICE_ERROR_MSG.SERVICE_SIZE_LIMIT_EXCEEDED,
      );
    });

    it('should allow upsert that replaces with same size', () => {
      store.setLimits(10, 100);
      store.applySet('s1', 'k1', Buffer.alloc(10));
      const result = store.applySet(
        's1', 'k1', Buffer.alloc(10),
      );
      assert.equal(result.accepted, true);
      assert.equal(result.error, null);
    });

    it('should allow upsert that shrinks value', () => {
      store.setLimits(10, 100);
      store.applySet('s1', 'k1', Buffer.alloc(10));
      const result = store.applySet(
        's1', 'k1', Buffer.alloc(5),
      );
      assert.equal(result.accepted, true);
      assert.equal(result.error, null);
    });

    it('should reject upsert that grows beyond session limit',
      () => {
        store.setLimits(10, 100);
        store.applySet('s1', 'k1', Buffer.alloc(8));
        const result = store.applySet(
          's1', 'k1', Buffer.alloc(11),
        );
        assert.equal(result.accepted, false);
        assert.equal(
          result.error,
          WASM_SERVICE_ERROR_MSG.SESSION_SIZE_LIMIT_EXCEEDED,
        );
      });

    it('should not write data when limit is exceeded', () => {
      store.setLimits(10, 100);
      store.applySet('s1', 'k1', Buffer.from('original'));
      store.applySet('s1', 'k1', Buffer.alloc(11));
      const result = store.get('s1', 'k1');
      assert.ok(result.equals(Buffer.from('original')));
    });

    it('should allow write exactly at session limit', () => {
      store.setLimits(10, 100);
      const result = store.applySet(
        's1', 'k1', Buffer.alloc(10),
      );
      assert.equal(result.accepted, true);
    });

    it('should allow write exactly at service limit', () => {
      store.setLimits(100, 10);
      const result = store.applySet(
        's1', 'k1', Buffer.alloc(10),
      );
      assert.equal(result.accepted, true);
    });

    it('should enforce only session limit when service is null',
      () => {
        store.setLimits(10, null);
        const result = store.applySet(
          's1', 'k1', Buffer.alloc(11),
        );
        assert.equal(result.accepted, false);
        assert.equal(
          result.error,
          WASM_SERVICE_ERROR_MSG.SESSION_SIZE_LIMIT_EXCEEDED,
        );
      });

    it('should enforce only service limit when session is null',
      () => {
        store.setLimits(null, 10);
        const result = store.applySet(
          's1', 'k1', Buffer.alloc(11),
        );
        assert.equal(result.accepted, false);
        assert.equal(
          result.error,
          WASM_SERVICE_ERROR_MSG.SERVICE_SIZE_LIMIT_EXCEEDED,
        );
      });
  });
});
