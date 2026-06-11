/**
 * CL-010 guard: recovery-epoch diagnostics must be O(changes), not O(calls),
 * on the getNodeReadinessSync hot path.
 *
 * Production witness (V8 sampling profiler inside the event-loop gap
 * watchdog, stat-gate-20260611T064855Z): recordRecoveryEpochObservation was
 * the dominant named frame inside the seed's 20-80s event-loop gaps. Its
 * change check JSON.stringify-compared full summaries INCLUDING observedAtMs
 * (fresh every call), so it never matched: every readiness read allocated a
 * frozen summary embedding the whole projection contract, stringified it
 * twice, and appended to the epoch timeline.
 *
 * The fix compares a cheap semantic signature that excludes observation
 * timestamps. This test proves: identical-state observations do not grow the
 * timeline (red pre-fix), semantic changes still append, epochs still close
 * into bounded history, and the event limit still applies.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  installControlPlaneReadinessSnapshotStoreMethods,
} from '../../src/control-plane/control-plane-readiness-snapshot-store.js';

const NODE_ID = 'node-under-recovery';

function createStore() {
  const store = {
    recoveryEpochEventLimit: 5,
    recoveryEpochHistoryLimit: 2,
    currentRecoveryEpochByNodeId: new Map(),
    recoveryEpochHistoryByNodeId: new Map(),
  };
  installControlPlaneReadinessSnapshotStoreMethods(store);
  return store;
}

function buildSnapshot({
  serveEligible = false,
  recoveryOpen = true,
  reasonCodes = ['publication_pending'],
  observedAt = '2026-06-11T07:00:00.000Z',
} = {}) {
  return {
    observedAt,
    lifecycleState: 'JOINING',
    dimensions: {
      processAlive: true,
      clusterMemberHealthy: true,
      controlPlaneWritable: false,
      controlPlanePublished: false,
      controlPlaneRecoveryEligible: true,
      repairEligible: false,
      serveEligible,
    },
    reasons: reasonCodes.map((code) => ({code})),
    projectionReadinessContract: {
      state: 'recovering',
      recoveryOpen,
      priorityRecovery: {active: true, reasonCodes: ['spread_pending']},
    },
  };
}

test('CL-010: recovery epoch observation hot path', async (t) => {
  await t.test(
    'identical-state observations do not grow the epoch timeline',
    async (t) => {
      const store = createStore();
      const snapshot = buildSnapshot();
      for (let callIndex = 0; callIndex < 1000; callIndex++) {
        // observedAtMs advances every call, as on the real hot path.
        store.recordRecoveryEpochObservation(
          NODE_ID,
          snapshot,
          1_000_000 + callIndex,
        );
      }
      const epoch = store.currentRecoveryEpochByNodeId.get(NODE_ID);
      t.ok(epoch, 'epoch opened');
      t.equal(
        epoch.events.length,
        1,
        '1000 identical observations produce one event ' +
          `(got ${epoch.events.length})`,
      );
    },
  );

  await t.test('semantic changes still append events', async (t) => {
    const store = createStore();
    store.recordRecoveryEpochObservation(NODE_ID, buildSnapshot(), 1);
    store.recordRecoveryEpochObservation(NODE_ID, buildSnapshot(), 2);
    store.recordRecoveryEpochObservation(
      NODE_ID,
      buildSnapshot({reasonCodes: ['spread_pending']}),
      3,
    );
    store.recordRecoveryEpochObservation(
      NODE_ID,
      buildSnapshot({serveEligible: true, reasonCodes: []}),
      4,
    );
    const epoch = store.currentRecoveryEpochByNodeId.get(NODE_ID);
    t.equal(epoch.events.length, 3, 'three distinct states recorded');
    t.equal(
      epoch.events[2].serveEligible,
      true,
      'latest event reflects the latest state',
    );
  });

  await t.test('event limit still bounds the timeline', async (t) => {
    const store = createStore();
    for (let stateIndex = 0; stateIndex < 12; stateIndex++) {
      store.recordRecoveryEpochObservation(
        NODE_ID,
        buildSnapshot({reasonCodes: [`reason_${stateIndex}`]}),
        stateIndex,
      );
    }
    const epoch = store.currentRecoveryEpochByNodeId.get(NODE_ID);
    t.equal(epoch.events.length, 5, 'event limit enforced');
    t.equal(
      epoch.events[4].reasonCodes[0],
      'reason_11',
      'newest events retained',
    );
  });

  await t.test(
    'recovery end closes the epoch into bounded history without the ' +
      'signature bookkeeping field',
    async (t) => {
      const store = createStore();
      store.recordRecoveryEpochObservation(NODE_ID, buildSnapshot(), 1);
      store.recordRecoveryEpochObservation(
        NODE_ID,
        buildSnapshot({
          serveEligible: true,
          recoveryOpen: false,
          reasonCodes: [],
        }),
        2,
      );
      t.equal(
        store.currentRecoveryEpochByNodeId.has(NODE_ID),
        false,
        'epoch closed',
      );
      const history = store.recoveryEpochHistoryByNodeId.get(NODE_ID);
      t.equal(history.length, 1, 'epoch archived');
      t.equal(history[0].open, false, 'archived epoch marked closed');
      t.equal(history[0].endedAtMs, 2, 'end timestamp recorded');
      t.equal(history[0].events.length, 2, 'closing event appended');
      t.equal(
        Object.hasOwn(history[0], 'lastEventSignature'),
        false,
        'signature bookkeeping does not leak into diagnostics output',
      );

      // A new recovery after closure opens a fresh epoch.
      store.recordRecoveryEpochObservation(NODE_ID, buildSnapshot(), 3);
      t.ok(
        store.currentRecoveryEpochByNodeId.has(NODE_ID),
        'new epoch opens after closure',
      );
    },
  );

  await t.test(
    'no epoch is opened while recovery is not active',
    async (t) => {
      const store = createStore();
      store.recordRecoveryEpochObservation(
        NODE_ID,
        buildSnapshot({recoveryOpen: false}),
        1,
      );
      t.equal(
        store.currentRecoveryEpochByNodeId.has(NODE_ID),
        false,
        'no epoch for non-recovering node',
      );
    },
  );
});
