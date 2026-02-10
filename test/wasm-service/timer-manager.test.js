import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {TimerManager} from '../../src/wasm-service/timer-manager.js';
import {
  TIMER_STATUS,
  RESERVED_KV_PREFIX,
} from '../../src/wasm-service/wasm-service-constants.js';
import {
  serializeTimerEntry,
  deserializeTimerEntry,
  TE_FIELD,
} from '../../src/wasm-service/wasm-service-models.js';

/**
 * Creates a mock replica object with an in-memory KV store
 * and a proposeEntry method that writes directly to the store.
 * @return {Object} Mock replica.
 */
function createMockReplica() {
  const store = new Map();
  return {
    kvStore: {
      get(sessionId, key) {
        const fullKey = sessionId + key;
        const val = store.get(fullKey);
        return val !== undefined ? Buffer.from(val) : null;
      },
      getAll(sessionId) {
        const result = new Map();
        for (const [k, v] of store) {
          if (k.startsWith(sessionId)) {
            const subKey = k.slice(sessionId.length);
            result.set(subKey, Buffer.from(v));
          }
        }
        return result;
      },
    },
    proposeEntry({key, value}) {
      store.set(key, value);
      return Promise.resolve();
    },
    onTimerCallback: null,
    _store: store,
  };
}

/**
 * Helper to seed a timer entry directly into the mock store.
 * @param {Object} replica - Mock replica.
 * @param {Object} entry - TimerEntry object.
 */
function seedTimerEntry(replica, entry) {
  const key = RESERVED_KV_PREFIX.TIMERS +
    entry[TE_FIELD.TIMER_ID];
  const serialized = serializeTimerEntry(entry);
  replica._store.set(key, serialized);
}

describe('TimerManager', () => {
  let replica;
  let tm;

  beforeEach(() => {
    replica = createMockReplica();
    tm = new TimerManager(replica);
  });

  afterEach(() => {
    tm.stopAll();
  });

  describe('constructor', () => {
    it('should initialize with empty activeTimers map', () => {
      assert.equal(tm.activeTimers.size, 0);
    });

    it('should store the replica reference', () => {
      assert.strictEqual(tm.replica, replica);
    });
  });

  describe('createTimer', () => {
    it('should store timer entry in KV store via proposal',
      async () => {
        await tm.createTimer('t1', 10000, {msg: 'hello'});
        const raw = replica.kvStore.get(
          RESERVED_KV_PREFIX.TIMERS, 't1',
        );
        assert.notEqual(raw, null);
        const entry = deserializeTimerEntry(raw.toString());
        assert.equal(entry[TE_FIELD.TIMER_ID], 't1');
        assert.equal(entry[TE_FIELD.DELAY_MS], 10000);
        assert.equal(entry[TE_FIELD.STATUS], TIMER_STATUS.ACTIVE);
        assert.deepStrictEqual(entry[TE_FIELD.PAYLOAD], {
          msg: 'hello',
        });
      });

    it('should schedule a setTimeout handle', async () => {
      await tm.createTimer('t1', 10000, {});
      assert.equal(tm.activeTimers.has('t1'), true);
    });

    it('should set fireAt to approximately now + delayMs',
      async () => {
        const before = Date.now();
        await tm.createTimer('t1', 5000, {});
        const after = Date.now();
        const raw = replica.kvStore.get(
          RESERVED_KV_PREFIX.TIMERS, 't1',
        );
        const entry = deserializeTimerEntry(raw.toString());
        const fireAt = entry[TE_FIELD.FIRE_AT];
        assert.ok(fireAt >= before + 5000);
        assert.ok(fireAt <= after + 5000);
      });
  });

  describe('cancelTimer', () => {
    it('should update timer status to cancelled in KV store',
      async () => {
        await tm.createTimer('t1', 10000, {});
        await tm.cancelTimer('t1');
        const raw = replica.kvStore.get(
          RESERVED_KV_PREFIX.TIMERS, 't1',
        );
        const entry = deserializeTimerEntry(raw.toString());
        assert.equal(
          entry[TE_FIELD.STATUS], TIMER_STATUS.CANCELLED,
        );
      });

    it('should clear the setTimeout handle', async () => {
      await tm.createTimer('t1', 10000, {});
      assert.equal(tm.activeTimers.has('t1'), true);
      await tm.cancelTimer('t1');
      assert.equal(tm.activeTimers.has('t1'), false);
    });

    it('should handle cancelling a non-existent timer gracefully',
      async () => {
        await tm.cancelTimer('nonexistent');
        assert.equal(tm.activeTimers.size, 0);
      });
  });

  describe('reconstructTimers', () => {
    it('should schedule timers for active entries only',
      async () => {
        const now = Date.now();
        seedTimerEntry(replica, {
          [TE_FIELD.TIMER_ID]: 'active1',
          [TE_FIELD.DELAY_MS]: 5000,
          [TE_FIELD.FIRE_AT]: now + 5000,
          [TE_FIELD.PAYLOAD]: {},
          [TE_FIELD.STATUS]: TIMER_STATUS.ACTIVE,
          [TE_FIELD.CREATED_AT]: now,
        });
        seedTimerEntry(replica, {
          [TE_FIELD.TIMER_ID]: 'fired1',
          [TE_FIELD.DELAY_MS]: 5000,
          [TE_FIELD.FIRE_AT]: now - 1000,
          [TE_FIELD.PAYLOAD]: {},
          [TE_FIELD.STATUS]: TIMER_STATUS.FIRED,
          [TE_FIELD.CREATED_AT]: now,
        });
        seedTimerEntry(replica, {
          [TE_FIELD.TIMER_ID]: 'cancelled1',
          [TE_FIELD.DELAY_MS]: 5000,
          [TE_FIELD.FIRE_AT]: now + 3000,
          [TE_FIELD.PAYLOAD]: {},
          [TE_FIELD.STATUS]: TIMER_STATUS.CANCELLED,
          [TE_FIELD.CREATED_AT]: now,
        });
        const count = await tm.reconstructTimers();
        assert.equal(count, 1);
        assert.equal(tm.activeTimers.has('active1'), true);
        assert.equal(tm.activeTimers.has('fired1'), false);
        assert.equal(tm.activeTimers.has('cancelled1'), false);
      });

    it('should return zero when no active timers exist',
      async () => {
        seedTimerEntry(replica, {
          [TE_FIELD.TIMER_ID]: 'fired1',
          [TE_FIELD.DELAY_MS]: 5000,
          [TE_FIELD.FIRE_AT]: Date.now() - 1000,
          [TE_FIELD.PAYLOAD]: {},
          [TE_FIELD.STATUS]: TIMER_STATUS.FIRED,
          [TE_FIELD.CREATED_AT]: Date.now(),
        });
        const count = await tm.reconstructTimers();
        assert.equal(count, 0);
        assert.equal(tm.activeTimers.size, 0);
      });

    it('should return zero when KV store is empty', async () => {
      const count = await tm.reconstructTimers();
      assert.equal(count, 0);
    });

    it('should schedule multiple active timers', async () => {
      const now = Date.now();
      seedTimerEntry(replica, {
        [TE_FIELD.TIMER_ID]: 'a1',
        [TE_FIELD.DELAY_MS]: 5000,
        [TE_FIELD.FIRE_AT]: now + 5000,
        [TE_FIELD.PAYLOAD]: {},
        [TE_FIELD.STATUS]: TIMER_STATUS.ACTIVE,
        [TE_FIELD.CREATED_AT]: now,
      });
      seedTimerEntry(replica, {
        [TE_FIELD.TIMER_ID]: 'a2',
        [TE_FIELD.DELAY_MS]: 3000,
        [TE_FIELD.FIRE_AT]: now + 3000,
        [TE_FIELD.PAYLOAD]: {},
        [TE_FIELD.STATUS]: TIMER_STATUS.ACTIVE,
        [TE_FIELD.CREATED_AT]: now,
      });
      const count = await tm.reconstructTimers();
      assert.equal(count, 2);
      assert.equal(tm.activeTimers.has('a1'), true);
      assert.equal(tm.activeTimers.has('a2'), true);
    });
  });

  describe('onTimerFired', () => {
    it('should mark timer as fired in KV before invoking handler',
      async () => {
        const callOrder = [];
        replica.onTimerCallback = async (timerId, _payload) => {
          const raw = replica.kvStore.get(
            RESERVED_KV_PREFIX.TIMERS, timerId,
          );
          const entry = deserializeTimerEntry(raw.toString());
          callOrder.push(entry[TE_FIELD.STATUS]);
        };
        await tm.createTimer('t1', 10000, {data: 'test'});
        await tm.onTimerFired('t1');
        assert.deepStrictEqual(callOrder, [TIMER_STATUS.FIRED]);
      });

    it('should remove timer from activeTimers', async () => {
      await tm.createTimer('t1', 10000, {});
      assert.equal(tm.activeTimers.has('t1'), true);
      await tm.onTimerFired('t1');
      assert.equal(tm.activeTimers.has('t1'), false);
    });

    it('should invoke callback with timerId and payload',
      async () => {
        let receivedId = null;
        let receivedPayload = null;
        replica.onTimerCallback = async (timerId, payload) => {
          receivedId = timerId;
          receivedPayload = payload;
        };
        await tm.createTimer('t1', 10000, {key: 'val'});
        await tm.onTimerFired('t1');
        assert.equal(receivedId, 't1');
        assert.deepStrictEqual(receivedPayload, {key: 'val'});
      });

    it('should not invoke callback if no callback is set',
      async () => {
        await tm.createTimer('t1', 10000, {});
        replica.onTimerCallback = null;
        await tm.onTimerFired('t1');
        const raw = replica.kvStore.get(
          RESERVED_KV_PREFIX.TIMERS, 't1',
        );
        const entry = deserializeTimerEntry(raw.toString());
        assert.equal(entry[TE_FIELD.STATUS], TIMER_STATUS.FIRED);
      });

    it('should skip if timer does not exist in KV store',
      async () => {
        let callbackCalled = false;
        replica.onTimerCallback = async () => {
          callbackCalled = true;
        };
        await tm.onTimerFired('nonexistent');
        assert.equal(callbackCalled, false);
      });

    it('should skip if timer status is not active', async () => {
      let callbackCalled = false;
      replica.onTimerCallback = async () => {
        callbackCalled = true;
      };
      seedTimerEntry(replica, {
        [TE_FIELD.TIMER_ID]: 'already-fired',
        [TE_FIELD.DELAY_MS]: 5000,
        [TE_FIELD.FIRE_AT]: Date.now() - 1000,
        [TE_FIELD.PAYLOAD]: {},
        [TE_FIELD.STATUS]: TIMER_STATUS.FIRED,
        [TE_FIELD.CREATED_AT]: Date.now(),
      });
      await tm.onTimerFired('already-fired');
      assert.equal(callbackCalled, false);
    });
  });

  describe('stopAll', () => {
    it('should clear all active timer handles', async () => {
      await tm.createTimer('t1', 10000, {});
      await tm.createTimer('t2', 10000, {});
      assert.equal(tm.activeTimers.size, 2);
      tm.stopAll();
      assert.equal(tm.activeTimers.size, 0);
    });

    it('should be safe to call when no timers exist', () => {
      tm.stopAll();
      assert.equal(tm.activeTimers.size, 0);
    });
  });
});
