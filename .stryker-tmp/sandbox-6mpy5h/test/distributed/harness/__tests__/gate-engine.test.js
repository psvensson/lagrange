// @ts-nocheck
import assert from 'node:assert/strict';
import {test} from '../../../../src/test-helpers/tap.js';
import {GateEngine} from '../gate-engine.js';

const ZERO = 0;
const POLL_INTERVAL_MS = 5;

function createManualClock(startMs = 0) {
  let nowMs = startMs;
  return {
    now: () => nowMs,
    sleep: async (durationMs) => {
      nowMs += durationMs;
    },
  };
}

test('GateEngine returns all_ready after required stability window', async () => {
  const clock = createManualClock();
  const engine = new GateEngine({
    now: clock.now,
    sleep: clock.sleep,
  });

  let attempt = ZERO;
  const result = await engine.waitForGate({
    nodes: [
      {id: 'n1'},
      {id: 'n2'},
    ],
    timeoutMs: 30,
    pollIntervalMs: POLL_INTERVAL_MS,
    stableWindowMs: 10,
    probeNode: async (node) => {
      attempt += 1;
      if (attempt < 3 && node.id === 'n2') {
        return {
          ready: false,
          reasons: ['n2_not_ready'],
        };
      }
      return {
        ready: true,
        reasons: [],
      };
    },
    evaluateGlobalCondition: async () => ({
      ready: true,
      reasons: [],
    }),
  });

  assert.equal(result.mode, 'all_ready');
  assert.deepEqual(result.includedNodeIds, ['n1', 'n2']);
  assert.deepEqual(result.excludedNodeIds, []);
  assert.ok(result.stableElapsedMs >= 10);
});

test('GateEngine fails closed when gate times out after transient subset readiness',
  async () => {
    const clock = createManualClock();
    const engine = new GateEngine({
      now: clock.now,
      sleep: clock.sleep,
    });

    let attempt = ZERO;
    const result = await engine.waitForGate({
      nodes: [
        {id: 'n1'},
        {id: 'n2'},
        {id: 'n3'},
      ],
      timeoutMs: 15,
      pollIntervalMs: POLL_INTERVAL_MS,
      stableWindowMs: 10,
      probeNode: async (node) => {
        if (attempt === ZERO && node.id !== 'n3') {
          return {
            ready: true,
            reasons: [],
          };
        }
        return {
          ready: false,
          reasons: ['table_not_ready'],
        };
      },
      evaluateGlobalCondition: async () => {
        attempt += 1;
        if (attempt === 1) {
          return {
            ready: true,
            reasons: [],
          };
        }
        return {
          ready: false,
          reasons: ['in_flight_replica_ops'],
        };
      },
    });

    assert.equal(result.mode, 'failed');
    assert.deepEqual(result.includedNodeIds, []);
    assert.deepEqual(result.excludedNodeIds, ['n1', 'n2', 'n3']);
  });

test('GateEngine reports reason histogram and included/excluded nodes on failure',
  async () => {
    const clock = createManualClock();
    const engine = new GateEngine({
      now: clock.now,
      sleep: clock.sleep,
    });

    const result = await engine.waitForGate({
      nodes: [
        {id: 'n1'},
        {id: 'n2'},
      ],
      timeoutMs: 10,
      pollIntervalMs: POLL_INTERVAL_MS,
      stableWindowMs: 5,
      probeNode: async (node) => {
        if (node.id === 'n1') {
          return {
            ready: false,
            reasons: ['sql_timeout'],
          };
        }
        return {
          ready: false,
          reasons: ['table_not_ready'],
        };
      },
      evaluateGlobalCondition: async () => ({
        ready: false,
        reasons: ['in_flight_replica_ops'],
      }),
    });

    assert.equal(result.mode, 'failed');
    assert.deepEqual(result.includedNodeIds, []);
    assert.deepEqual(result.excludedNodeIds, ['n1', 'n2']);
    assert.ok(result.reasonHistogram.sql_timeout > 0);
    assert.ok(result.reasonHistogram.table_not_ready > 0);
    assert.ok(result.reasonHistogram.in_flight_replica_ops > 0);
  });

test('GateEngine aborts early when abort condition is met', async () => {
  const clock = createManualClock();
  const engine = new GateEngine({
    now: clock.now,
    sleep: clock.sleep,
  });

  const result = await engine.waitForGate({
    nodes: [
      {id: 'n1'},
      {id: 'n2'},
    ],
    timeoutMs: 500,
    pollIntervalMs: POLL_INTERVAL_MS,
    stableWindowMs: 0,
    probeNode: async () => ({
      ready: true,
      reasons: [],
    }),
    evaluateGlobalCondition: async () => ({
      ready: false,
      reasons: ['in_flight_replica_operations:5'],
    }),
    abortIf: ({attempts}) => {
      if (attempts >= 3) {
        return {
          abort: true,
          reason: 'stalled_no_progress:15',
        };
      }
      return null;
    },
  });

  assert.equal(result.mode, 'failed');
  assert.equal(result.aborted, true);
  assert.equal(result.abortReason, 'stalled_no_progress:15');
  assert.ok(result.attempts < 10);
  assert.ok(result.reasonHistogram['stalled_no_progress:15'] > 0);
});
