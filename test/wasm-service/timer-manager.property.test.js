/**
 * Property Tests: Timer Reconstruction
 *
 * **Property 5: Timer reconstruction skips non-active timers**
 * **Validates: Requirements 7.3, 7.6**
 *
 * *For any* set of timer entries in the KV store with mixed
 * statuses (active, fired, cancelled), reconstructing timers
 * SHALL produce active timer handles only for entries with
 * status 'active', and SHALL skip all entries with status
 * 'fired' or 'cancelled'.
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {TimerManager} from '../../src/wasm-service/timer-manager.js';
import {
  TIMER_STATUS,
  RESERVED_KV_PREFIX,
} from '../../src/wasm-service/wasm-service-constants.js';
import {
  serializeTimerEntry,
  TE_FIELD,
} from '../../src/wasm-service/wasm-service-models.js';

/**
 * Creates a mock replica with an in-memory KV store.
 * @return {Object} Mock replica with kvStore and proposeEntry.
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
 * Seeds a timer entry directly into the mock store.
 * @param {Object} replica - Mock replica.
 * @param {Object} entry - TimerEntry object.
 */
function seedTimerEntry(replica, entry) {
  const key = RESERVED_KV_PREFIX.TIMERS +
    entry[TE_FIELD.TIMER_ID];
  const serialized = serializeTimerEntry(entry);
  replica._store.set(key, serialized);
}

/** All valid timer statuses for generation. */
const STATUSES = [
  TIMER_STATUS.ACTIVE,
  TIMER_STATUS.FIRED,
  TIMER_STATUS.CANCELLED,
];

/** Generates a timer status from the valid set. */
const statusArb = fc.constantFrom(...STATUSES);

/** Generates a unique timer ID string. */
const timerIdArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,19}$/);

/**
 * Generates a list of timer entries with unique IDs and
 * random statuses.
 */
const timerEntriesArb = fc.array(
  fc.record({
    timerId: timerIdArb,
    status: statusArb,
    delayMs: fc.integer({min: 100, max: 60000}),
  }),
  {minLength: 1, maxLength: 10},
).map((entries) => {
  // Deduplicate by timerId — last entry wins
  const seen = new Map();
  for (const entry of entries) {
    seen.set(entry.timerId, entry);
  }
  return [...seen.values()];
});

test(
  'Feature: replicated-wasm-services, ' +
  'Property 5: Timer reconstruction skips non-active timers',
  async (t) => {
    /**
     * **Validates: Requirements 7.3, 7.6**
     */
    t.test(
      'reconstructTimers produces handles only for active entries',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            timerEntriesArb,
            async (entries) => {
              const replica = createMockReplica();
              const tm = new TimerManager(replica);
              try {
                const now = Date.now();

                // Seed all entries into the mock KV store
                for (const entry of entries) {
                  seedTimerEntry(replica, {
                    [TE_FIELD.TIMER_ID]: entry.timerId,
                    [TE_FIELD.DELAY_MS]: entry.delayMs,
                    [TE_FIELD.FIRE_AT]: now + entry.delayMs,
                    [TE_FIELD.PAYLOAD]: {},
                    [TE_FIELD.STATUS]: entry.status,
                    [TE_FIELD.CREATED_AT]: now,
                  });
                }

                const expectedActive = entries.filter(
                  (e) => e.status === TIMER_STATUS.ACTIVE,
                );

                const count = await tm.reconstructTimers();

                // 1. Count of reconstructed timers equals
                //    number of active entries
                if (count !== expectedActive.length) return false;

                // 2. Only active timer IDs appear in activeTimers
                for (const entry of expectedActive) {
                  if (!tm.activeTimers.has(entry.timerId)) {
                    return false;
                  }
                }

                // 3. Non-active timer IDs do NOT appear
                const nonActive = entries.filter(
                  (e) => e.status !== TIMER_STATUS.ACTIVE,
                );
                for (const entry of nonActive) {
                  if (tm.activeTimers.has(entry.timerId)) {
                    return false;
                  }
                }

                // 4. Total activeTimers size matches expected
                if (tm.activeTimers.size !== expectedActive.length) {
                  return false;
                }

                return true;
              } finally {
                tm.stopAll();
              }
            },
          ),
          {numRuns: 10},
        );
      },
    );

    t.test(
      'reconstructTimers with all non-active entries produces ' +
      'zero active timers',
      async () => {
        const nonActiveStatusArb = fc.constantFrom(
          TIMER_STATUS.FIRED,
          TIMER_STATUS.CANCELLED,
        );

        const nonActiveEntriesArb = fc.array(
          fc.record({
            timerId: timerIdArb,
            status: nonActiveStatusArb,
            delayMs: fc.integer({min: 100, max: 60000}),
          }),
          {minLength: 1, maxLength: 10},
        ).map((entries) => {
          const seen = new Map();
          for (const entry of entries) {
            seen.set(entry.timerId, entry);
          }
          return [...seen.values()];
        });

        await fc.assert(
          fc.asyncProperty(
            nonActiveEntriesArb,
            async (entries) => {
              const replica = createMockReplica();
              const tm = new TimerManager(replica);
              try {
                const now = Date.now();
                for (const entry of entries) {
                  seedTimerEntry(replica, {
                    [TE_FIELD.TIMER_ID]: entry.timerId,
                    [TE_FIELD.DELAY_MS]: entry.delayMs,
                    [TE_FIELD.FIRE_AT]: now + entry.delayMs,
                    [TE_FIELD.PAYLOAD]: {},
                    [TE_FIELD.STATUS]: entry.status,
                    [TE_FIELD.CREATED_AT]: now,
                  });
                }

                const count = await tm.reconstructTimers();

                // Zero active timers reconstructed
                if (count !== 0) return false;
                if (tm.activeTimers.size !== 0) return false;

                return true;
              } finally {
                tm.stopAll();
              }
            },
          ),
          {numRuns: 10},
        );
      },
    );

    t.test(
      'reconstructTimers with all active entries produces ' +
      'handles for every entry',
      async () => {
        const activeEntriesArb = fc.array(
          fc.record({
            timerId: timerIdArb,
            delayMs: fc.integer({min: 100, max: 60000}),
          }),
          {minLength: 1, maxLength: 10},
        ).map((entries) => {
          const seen = new Map();
          for (const entry of entries) {
            seen.set(entry.timerId, entry);
          }
          return [...seen.values()];
        });

        await fc.assert(
          fc.asyncProperty(
            activeEntriesArb,
            async (entries) => {
              const replica = createMockReplica();
              const tm = new TimerManager(replica);
              try {
                const now = Date.now();
                for (const entry of entries) {
                  seedTimerEntry(replica, {
                    [TE_FIELD.TIMER_ID]: entry.timerId,
                    [TE_FIELD.DELAY_MS]: entry.delayMs,
                    [TE_FIELD.FIRE_AT]: now + entry.delayMs,
                    [TE_FIELD.PAYLOAD]: {},
                    [TE_FIELD.STATUS]: TIMER_STATUS.ACTIVE,
                    [TE_FIELD.CREATED_AT]: now,
                  });
                }

                const count = await tm.reconstructTimers();

                // All entries should be reconstructed
                if (count !== entries.length) return false;
                if (tm.activeTimers.size !== entries.length) {
                  return false;
                }

                for (const entry of entries) {
                  if (!tm.activeTimers.has(entry.timerId)) {
                    return false;
                  }
                }

                return true;
              } finally {
                tm.stopAll();
              }
            },
          ),
          {numRuns: 10},
        );
      },
    );
  },
);
