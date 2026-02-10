/**
 * Property Tests: KV Store Round-Trip
 *
 * **Property 2: KV store round-trip preserves opaque bytes**
 * **Validates: Requirements 3.2, 3.3**
 *
 * *For any* session identifier, key string, and arbitrary byte
 * sequence stored in the SessionKVStore, reading back the same
 * session+key SHALL return the identical byte sequence.
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {SessionKVStore} from '../../src/wasm-service/session-kv-store.js';

/** Generates a non-empty string suitable for session IDs. */
const sessionIdArb = fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,29}$/);

/** Generates a non-empty string suitable for keys. */
const keyArb = fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,29}$/);

/** Generates an arbitrary byte array as a Uint8Array. */
const bytesArb = fc.uint8Array({minLength: 0, maxLength: 256});

test(
  'Feature: replicated-wasm-services, ' +
  'Property 2: KV store round-trip preserves opaque bytes',
  async (t) => {
    /**
     * **Validates: Requirements 3.2, 3.3**
     */
    t.test(
      'applySet then get returns identical byte sequence',
      async () => {
        await fc.assert(
          fc.property(
            sessionIdArb,
            keyArb,
            bytesArb,
            (sessionId, key, bytes) => {
              const store = new SessionKVStore(':memory:');
              try {
                const value = Buffer.from(bytes);
                store.applySet(sessionId, key, value);
                const result = store.get(sessionId, key);

                // Result must be a Buffer
                if (!Buffer.isBuffer(result)) return false;

                // Result must have the same length
                if (result.length !== value.length) return false;

                // Result must contain identical bytes
                if (!result.equals(value)) return false;

                return true;
              } finally {
                store.close();
              }
            },
          ),
          {numRuns: 10},
        );
      },
    );

    t.test(
      'multiple keys in same session each preserve their bytes',
      async () => {
        await fc.assert(
          fc.property(
            sessionIdArb,
            fc.array(
              fc.tuple(keyArb, bytesArb),
              {minLength: 1, maxLength: 5},
            ),
            (sessionId, entries) => {
              const store = new SessionKVStore(':memory:');
              try {
                // Deduplicate keys — last write wins
                const expected = new Map();
                for (const [key, bytes] of entries) {
                  const value = Buffer.from(bytes);
                  store.applySet(sessionId, key, value);
                  expected.set(key, value);
                }

                // Verify each key returns the correct bytes
                for (const [key, value] of expected) {
                  const result = store.get(sessionId, key);
                  if (!Buffer.isBuffer(result)) return false;
                  if (!result.equals(value)) return false;
                }

                return true;
              } finally {
                store.close();
              }
            },
          ),
          {numRuns: 10},
        );
      },
    );
  },
);

/**
 * Property Tests: Size Limit Enforcement
 *
 * **Property 4: Size limit enforcement rejects oversized writes**
 * **Validates: Requirements 3.5, 3.6, 10.3, 10.4, 10.5**
 *
 * *For any* session context write, if the resulting session size
 * exceeds the per-session limit OR the resulting total service size
 * exceeds the per-service limit, the write SHALL be rejected with
 * an error that identifies which specific limit was breached. If
 * neither limit is exceeded, the write SHALL be accepted.
 */

import {
  WASM_SERVICE_ERROR_MSG,
} from '../../src/wasm-service/wasm-service-constants.js';

/**
 * Generates a small positive integer for size limits.
 * Range 10-100 bytes to trigger limits easily.
 */
const limitArb = fc.integer({min: 10, max: 100});

/**
 * Generates a byte array whose length is constrained to
 * a range that can both fit within and exceed small limits.
 */
const valueBytesArb = fc.uint8Array({minLength: 0, maxLength: 120});

test(
  'Feature: replicated-wasm-services, ' +
  'Property 4: Size limit enforcement rejects oversized writes',
  async (t) => {
    /**
     * **Validates: Requirements 3.5, 3.6, 10.3, 10.4, 10.5**
     */
    t.test(
      'single write: accept/reject matches limit comparison',
      async () => {
        await fc.assert(
          fc.property(
            sessionIdArb,
            keyArb,
            valueBytesArb,
            limitArb,
            limitArb,
            (sessionId, key, bytes, sessionLimit, serviceLimit) => {
              const store = new SessionKVStore(':memory:');
              try {
                store.setLimits(sessionLimit, serviceLimit);
                const value = Buffer.from(bytes);
                const result = store.applySet(sessionId, key, value);
                const valueSize = value.length;

                if (valueSize > sessionLimit) {
                  // Session limit checked first
                  return (
                    result.accepted === false &&
                    result.error ===
                      WASM_SERVICE_ERROR_MSG
                        .SESSION_SIZE_LIMIT_EXCEEDED
                  );
                }
                if (valueSize > serviceLimit) {
                  return (
                    result.accepted === false &&
                    result.error ===
                      WASM_SERVICE_ERROR_MSG
                        .SERVICE_SIZE_LIMIT_EXCEEDED
                  );
                }
                // Both limits OK
                return (
                  result.accepted === true &&
                  result.error === null
                );
              } finally {
                store.close();
              }
            },
          ),
          {numRuns: 10},
        );
      },
    );

    t.test(
      'cumulative writes: session limit checked on projected size',
      async () => {
        await fc.assert(
          fc.property(
            sessionIdArb,
            fc.array(
              fc.tuple(keyArb, valueBytesArb),
              {minLength: 1, maxLength: 4},
            ),
            limitArb,
            (sessionId, entries, sessionLimit) => {
              const store = new SessionKVStore(':memory:');
              try {
                // Service limit high so only session limit matters
                const highServiceLimit = 100000;
                store.setLimits(sessionLimit, highServiceLimit);

                // Track expected session size (last-write-wins)
                const keyValues = new Map();

                for (const [key, bytes] of entries) {
                  const value = Buffer.from(bytes);
                  const oldSize = keyValues.has(key) ?
                    keyValues.get(key).length : 0;
                  const currentSessionSize = Array.from(
                    keyValues.values(),
                  ).reduce((sum, v) => sum + v.length, 0);
                  const projectedSize =
                    currentSessionSize - oldSize + value.length;

                  const result = store.applySet(
                    sessionId, key, value,
                  );

                  if (projectedSize > sessionLimit) {
                    if (result.accepted !== false) return false;
                    if (
                      result.error !==
                      WASM_SERVICE_ERROR_MSG
                        .SESSION_SIZE_LIMIT_EXCEEDED
                    ) {
                      return false;
                    }
                    // Value not written — map unchanged
                  } else {
                    if (result.accepted !== true) return false;
                    if (result.error !== null) return false;
                    keyValues.set(key, value);
                  }
                }
                return true;
              } finally {
                store.close();
              }
            },
          ),
          {numRuns: 10},
        );
      },
    );

    t.test(
      'cumulative writes: service limit checked across sessions',
      async () => {
        await fc.assert(
          fc.property(
            fc.array(
              fc.tuple(sessionIdArb, keyArb, valueBytesArb),
              {minLength: 1, maxLength: 4},
            ),
            limitArb,
            (entries, serviceLimit) => {
              const store = new SessionKVStore(':memory:');
              try {
                // Session limit high so only service limit matters
                const highSessionLimit = 100000;
                store.setLimits(highSessionLimit, serviceLimit);

                // Track total size across all sessions
                // Map<sessionId, Map<key, Buffer>>
                const sessions = new Map();

                for (const [sessionId, key, bytes] of entries) {
                  const value = Buffer.from(bytes);

                  if (!sessions.has(sessionId)) {
                    sessions.set(sessionId, new Map());
                  }
                  const sessionMap = sessions.get(sessionId);
                  const oldSize = sessionMap.has(key) ?
                    sessionMap.get(key).length : 0;

                  let totalSize = 0;
                  for (const sMap of sessions.values()) {
                    for (const v of sMap.values()) {
                      totalSize += v.length;
                    }
                  }
                  const projectedTotal =
                    totalSize - oldSize + value.length;

                  const result = store.applySet(
                    sessionId, key, value,
                  );

                  if (projectedTotal > serviceLimit) {
                    if (result.accepted !== false) return false;
                    if (
                      result.error !==
                      WASM_SERVICE_ERROR_MSG
                        .SERVICE_SIZE_LIMIT_EXCEEDED
                    ) {
                      return false;
                    }
                    // Value not written — map unchanged
                  } else {
                    if (result.accepted !== true) return false;
                    if (result.error !== null) return false;
                    sessionMap.set(key, value);
                  }
                }
                return true;
              } finally {
                store.close();
              }
            },
          ),
          {numRuns: 10},
        );
      },
    );

    t.test(
      'session limit checked before service limit when both ' +
      'would be exceeded',
      async () => {
        await fc.assert(
          fc.property(
            sessionIdArb,
            keyArb,
            valueBytesArb,
            (sessionId, key, bytes) => {
              const store = new SessionKVStore(':memory:');
              try {
                const value = Buffer.from(bytes);
                // Set both limits to a small value that the
                // write will exceed (if value is non-empty)
                const tinyLimit = 1;
                store.setLimits(tinyLimit, tinyLimit);

                const result = store.applySet(
                  sessionId, key, value,
                );

                if (value.length > tinyLimit) {
                  // Both limits exceeded — session checked first
                  return (
                    result.accepted === false &&
                    result.error ===
                      WASM_SERVICE_ERROR_MSG
                        .SESSION_SIZE_LIMIT_EXCEEDED
                  );
                }
                // Value fits within both limits
                return (
                  result.accepted === true &&
                  result.error === null
                );
              } finally {
                store.close();
              }
            },
          ),
          {numRuns: 10},
        );
      },
    );
  },
);
