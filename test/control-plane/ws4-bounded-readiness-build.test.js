/**
 * WS4 (bound the readiness build): under recovery churn the strict stored-snapshot
 * reuse misses every call, so the heavy synchronous build reruns per routing call
 * and can monopolize the event loop long enough to lose raft leadership
 * (CL-033/CL-034/CL-001-B freeze->leadership spiral). When ON, the hot path serves a
 * bounded-stale stored snapshot for a node whose last full build was expensive,
 * instead of rebuilding synchronously. Default OFF.
 *
 * These are the deterministic guards (reproduced rung, branch a) for the bounded
 * serve LOGIC; the freeze precondition itself is load-emergent and is validated by
 * the statistical gate as the promotion step (flag stays off until then).
 */

import {test} from '../../src/test-helpers/tap.js';
import {installControlPlaneReadinessNodeMethods} from '../../src/control-plane/control-plane-readiness-service-node-methods.js';
import {installControlPlaneReadinessSnapshotStoreMethods} from '../../src/control-plane/control-plane-readiness-snapshot-store.js';

const NODE_ID = 'node-1';
const SLICE_MS = 250;
const MAX_STALE_MS = 2000;

function createStore() {
  const store = {
    now: () => 10_000,
    lastReadinessSnapshotByNodeId: new Map(),
    lastReadinessSnapshotAtMsByNodeId: new Map(),
    lastReadinessBuildDurationMsByNodeId: new Map(),
  };
  installControlPlaneReadinessSnapshotStoreMethods(store);
  return store;
}

test('recordReadinessBuildDurationMs stores valid durations and ignores junk', (t) => {
  const store = createStore();
  store.recordReadinessBuildDurationMs(NODE_ID, 400);
  t.equal(store.lastReadinessBuildDurationMsByNodeId.get(NODE_ID), 400);
  store.recordReadinessBuildDurationMs(NODE_ID, -5);
  t.equal(store.lastReadinessBuildDurationMsByNodeId.get(NODE_ID), 400, 'negative ignored');
  store.recordReadinessBuildDurationMs(NODE_ID, Number.NaN);
  t.equal(store.lastReadinessBuildDurationMsByNodeId.get(NODE_ID), 400, 'NaN ignored');
  store.recordReadinessBuildDurationMs(null, 100);
  t.equal(store.lastReadinessBuildDurationMsByNodeId.has(null), false, 'no nodeId ignored');
  t.end();
});

test('getBoundedStaleReadinessSnapshot decision table', (t) => {
  const snap = Object.freeze({dimensions: {}});
  const opts = {sliceMs: SLICE_MS, maxStaleMs: MAX_STALE_MS};

  // expensive build + fresh-enough stored snapshot -> serve.
  const ok = createStore();
  ok.lastReadinessBuildDurationMsByNodeId.set(NODE_ID, 400);
  ok.lastReadinessSnapshotByNodeId.set(NODE_ID, snap);
  ok.lastReadinessSnapshotAtMsByNodeId.set(NODE_ID, 9_000); // 1s stale < 2s
  t.equal(ok.getBoundedStaleReadinessSnapshot(NODE_ID, 10_000, opts), snap, 'expensive+fresh -> serve');

  // cheap last build -> do not serve (let it rebuild; it is not the freeze driver).
  const cheap = createStore();
  cheap.lastReadinessBuildDurationMsByNodeId.set(NODE_ID, 50);
  cheap.lastReadinessSnapshotByNodeId.set(NODE_ID, snap);
  cheap.lastReadinessSnapshotAtMsByNodeId.set(NODE_ID, 9_000);
  t.equal(cheap.getBoundedStaleReadinessSnapshot(NODE_ID, 10_000, opts), null, 'cheap build -> null');

  // too stale -> do not serve.
  const stale = createStore();
  stale.lastReadinessBuildDurationMsByNodeId.set(NODE_ID, 400);
  stale.lastReadinessSnapshotByNodeId.set(NODE_ID, snap);
  stale.lastReadinessSnapshotAtMsByNodeId.set(NODE_ID, 5_000); // 5s stale > 2s
  t.equal(stale.getBoundedStaleReadinessSnapshot(NODE_ID, 10_000, opts), null, 'too stale -> null');

  // no stored snapshot -> null (cold build must run).
  const cold = createStore();
  cold.lastReadinessBuildDurationMsByNodeId.set(NODE_ID, 400);
  t.equal(cold.getBoundedStaleReadinessSnapshot(NODE_ID, 10_000, opts), null, 'no snapshot -> null');

  // no recorded duration -> null (unknown cost, do not serve stale).
  const unknown = createStore();
  unknown.lastReadinessSnapshotByNodeId.set(NODE_ID, snap);
  unknown.lastReadinessSnapshotAtMsByNodeId.set(NODE_ID, 9_000);
  t.equal(unknown.getBoundedStaleReadinessSnapshot(NODE_ID, 10_000, opts), null, 'no duration -> null');

  // missing budgets -> null (defensive).
  t.equal(ok.getBoundedStaleReadinessSnapshot(NODE_ID, 10_000, {}), null, 'no budgets -> null');
  t.end();
});

// Node-methods integration: a stub whose strict reuse misses, with an expensive
// recorded build and a fresh-enough stored snapshot.
function createNodeStub({enabled}) {
  const calls = {fullBuild: 0, planningSnapshot: 0, backgroundRefresh: 0};
  const storedSnapshot = Object.freeze({dimensions: {serveEligible: true}, reasons: []});
  const stub = {
    now: () => 10_000,
    readinessBuildBoundEnabled: enabled,
    readinessBuildSliceMs: SLICE_MS,
    readinessBuildMaxStaleMs: MAX_STALE_MS,
    lastReadinessSnapshotByNodeId: new Map([[NODE_ID, storedSnapshot]]),
    lastReadinessSnapshotAtMsByNodeId: new Map([[NODE_ID, 9_000]]),
    lastReadinessBuildDurationMsByNodeId: new Map([[NODE_ID, 400]]),
    getNodeRow: () => ({node_id: NODE_ID, status: 'active'}),
    getPublicationDiagnostics: () => ({status: 'PUBLISHED'}),
    getMembershipPublicationDiagnosticsSync: () => ({published: true}),
    shouldPersistReadinessSnapshot: () => false,
    getFresherStoredReadinessSnapshot: () => null, // strict reuse MISSES (churn)
    resolveNodeMembershipPublicationPlanningAnswerSync: () => {
      calls.planningSnapshot += 1;
      return {answer: 'ok'};
    },
    getNodeServiceRows: () => [],
    getLifecycleState: () => 'ACTIVE',
    buildNodeEvidence: () => ({}),
    buildMissingSelfNodeEvidence: () => ({}),
    resolveMissingNodeReadinessState: () => null,
    getCapacitySnapshotSync: () => ({}),
    buildEvaluatedNodeReadinessSnapshot: () => {
      calls.fullBuild += 1;
      return Object.freeze({dimensions: {}, reasons: []});
    },
  };
  installControlPlaneReadinessSnapshotStoreMethods(stub);
  installControlPlaneReadinessNodeMethods(stub);
  // Override the (now real) background-refresh hook with a counter AFTER install
  // (the store install defines it writable); the real bounded-stale + duration
  // store logic is exercised, only the refresh side effect is observed.
  stub.maybeStartBackgroundSyncReadinessRefresh = () => {
    calls.backgroundRefresh += 1;
  };
  return {stub, calls, storedSnapshot};
}

test('WS4 ON: serves the bounded-stale snapshot and SKIPS the heavy build under churn', (t) => {
  const {stub, calls, storedSnapshot} = createNodeStub({enabled: true});
  const result = stub.getNodeReadinessSync(NODE_ID, {});
  t.equal(result, storedSnapshot, 'returns the bounded-stale stored snapshot');
  t.equal(calls.planningSnapshot, 0, 'heavy planning resolution skipped');
  t.equal(calls.fullBuild, 0, 'full synchronous build skipped');
  t.equal(calls.backgroundRefresh, 1, 'background refresh still kicked');
  t.end();
});

test('WS4 OFF (default): rebuilds synchronously even when a stale snapshot exists (repro of the per-call freeze)', (t) => {
  const {stub, calls} = createNodeStub({enabled: false});
  stub.getNodeReadinessSync(NODE_ID, {});
  t.equal(calls.planningSnapshot, 1, 'heavy planning resolution runs');
  t.equal(calls.fullBuild, 1, 'full synchronous build runs — the per-call freeze the flag bounds');
  t.end();
});
