/**
 * Property Test: Read Routing Correctness Across Consistency Modes
 *
 * **Property 3: Read routing correctness across consistency modes**
 * **Validates: Requirements 3.4, 4.1, 4.3, 4.4, 4.5**
 *
 * *For any* read consistency mode, replica role (leader/follower),
 * and follower state (applied index, last leader broadcast index,
 * last leader broadcast timestamp, safety interval), the read
 * routing decision SHALL satisfy:
 *   - leader_only mode → route to leader always
 *   - strong mode → serve locally iff applied index >=
 *     last leader broadcast index AND (now - last leader broadcast
 *     timestamp) < safety interval; otherwise forward to leader
 *   - eventual mode → serve locally always
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {routeRead, ROUTING_DECISION} from
  '../../src/wasm-service/read-router.js';
import {SafetyInterval} from
  '../../src/wasm-service/safety-interval.js';
import {READ_CONSISTENCY_MODE} from
  '../../src/wasm-service/wasm-service-constants.js';

const CONSISTENCY_MODE_VALUES = Object.values(READ_CONSISTENCY_MODE);

/**
 * Arbitrary that generates a valid read consistency mode from the
 * enum values.
 */
const consistencyModeArb = fc.constantFrom(...CONSISTENCY_MODE_VALUES);

/**
 * Arbitrary that generates a SafetyInterval configuration with
 * controlled state so we can predict canServeRead() outcome.
 *
 * Produces:
 *   - intervalMs: the staleness bound (positive integer)
 *   - appliedIndex: the follower's local applied index
 *   - leaderIndex: the leader's last broadcast committed index
 *   - leaderTimestamp: the leader's last broadcast timestamp
 *   - expectedCanServe: whether canServeRead() should return true
 */
const safetyIntervalStateArb = fc.record({
  intervalMs: fc.integer({min: 1, max: 10000}),
  appliedIndex: fc.nat({max: 1000}),
  leaderIndex: fc.nat({max: 1000}),
}).chain(({intervalMs, appliedIndex, leaderIndex}) => {
  const indexOk = appliedIndex >= leaderIndex;

  // Generate a timestamp that is either within or outside the
  // safety interval, so we cover both branches.
  return fc.boolean().map((withinTime) => {
    const now = Date.now();
    // When withinTime is true, set timestamp to be recent
    // (within interval). When false, set it far in the past.
    const leaderTimestamp = withinTime
      ? now - Math.floor(intervalMs / 2)
      : now - intervalMs - 1000;

    const expectedCanServe = indexOk && withinTime;

    return {
      intervalMs,
      appliedIndex,
      leaderIndex,
      leaderTimestamp,
      expectedCanServe,
    };
  });
});

/**
 * Builds a real SafetyInterval instance with the given state.
 */
function buildSafetyInterval(state) {
  const si = new SafetyInterval(state.intervalMs);
  si.updateLeaderState(state.leaderIndex, state.leaderTimestamp);
  si.updateLocalAppliedIndex(state.appliedIndex);
  return si;
}

test(
  'Property 3: Read routing correctness across consistency modes',
  async (t) => {
    t.test(
      'leader always serves locally regardless of mode or state',
      async () => {
        /**
         * When isLeader is true, routeRead must return
         * SERVE_LOCALLY for every consistency mode and every
         * safety interval state.
         *
         * **Validates: Requirements 3.4**
         */
        await fc.assert(
          fc.property(
            consistencyModeArb,
            safetyIntervalStateArb,
            (mode, siState) => {
              const si = buildSafetyInterval(siState);
              const result = routeRead(mode, true, si);
              return result === ROUTING_DECISION.SERVE_LOCALLY;
            },
          ),
          {numRuns: 10},
        );
      },
    );

    t.test(
      'follower routing matches consistency mode rules',
      async () => {
        /**
         * When isLeader is false, the routing decision must
         * follow the mode-specific rules:
         *   - leader_only → FORWARD_TO_LEADER
         *   - eventual → SERVE_LOCALLY
         *   - strong → depends on canServeRead()
         *
         * **Validates: Requirements 4.1, 4.3, 4.4, 4.5**
         */
        await fc.assert(
          fc.property(
            consistencyModeArb,
            safetyIntervalStateArb,
            (mode, siState) => {
              const si = buildSafetyInterval(siState);
              const result = routeRead(mode, false, si);

              if (mode === READ_CONSISTENCY_MODE.LEADER_ONLY) {
                return result ===
                  ROUTING_DECISION.FORWARD_TO_LEADER;
              }

              if (mode === READ_CONSISTENCY_MODE.EVENTUAL) {
                return result === ROUTING_DECISION.SERVE_LOCALLY;
              }

              // strong mode: decision depends on safety interval
              if (siState.expectedCanServe) {
                return result === ROUTING_DECISION.SERVE_LOCALLY;
              }
              return result ===
                ROUTING_DECISION.FORWARD_TO_LEADER;
            },
          ),
          {numRuns: 10},
        );
      },
    );
  },
);
