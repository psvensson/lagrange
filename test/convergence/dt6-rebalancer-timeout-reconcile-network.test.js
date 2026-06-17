import t from 'tap';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {driveNetwork} from '../distributed/harness/raft-network-host.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {OperationWorkflowOwner} from '../../src/rebalancer/operation-workflow-owner.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from
  '../../src/rebalancer/operation-workflow-recovery-reconcile-shared.js';

const {INCOMPLETE_OPERATION_OBSERVATION_STATE, WORKFLOW_STEP} = SHARED;

// DT6 step 12 — drive the NON-EMPTY timeout-RECONCILE branch of checkTimeouts on the virtual clock.
// Step 11 seamed the orchestration clock and drove the EMPTY-observation path (early return); this
// step drives the per-operation reconcile branch: an incomplete, non-terminal, locally-owned
// operation flows through the REAL checkTimeouts orchestration — the real priority-recovery drain
// snapshot + owner-action gate, the real wake/lifecycle gating, the real single-flight selection —
// until reconcileTimeoutOperation is invoked with the VIRTUAL-clock `now` (the second seam point,
// operation-workflow-recovery-timeout.js ~line 249, resolveTimeoutCheckNowMs).
//
// The host is a REAL OperationWorkflowOwner prototype object (Object.create), so every method on the
// path runs production code; only genuine boundaries are overridden as own-properties:
//  - repository: the persistence/visibility I/O boundary (reports one incomplete, non-terminal,
//    locally-owned operation).
//  - getOperationOwnerSingleFlightKey / operationWorkflowRunExclusive: the concurrency-control
//    boundary (no contention in a single-operation deterministic run, so run inline).
//  - reconcileTimeoutOperation: the terminal state-transition/persistence boundary — records the
//    (operation, now) it is invoked with.
//  - reconcileReservations: the reservation I/O boundary (no-op).
// The loop itself is the real RebalanceCoordinator.prototype timeout loop (step 9) on a per-node
// network TimeSource.
//
// Because the operation is locally owned, the REAL drain snapshot resolves LOCAL_OWNER -> ALLOW_RECONCILE
// (operation-workflow-recovery-reconcile-shared.js), so shouldEnterOperationLifecycleFromDrainSnapshot
// admits it and it reaches reconcile. A terminal operation, by contrast, is skipped by the real loop's
// own terminal check — proving the orchestration logic (not a stub) gates reconcile.
//
// HONEST SCOPE: everything up to the reconcile call is real and virtual-clock-driven; the terminal
// reconcileTimeoutOperation MUTATION (transition grace, operation-progress reconcile, budget/persist)
// is the stubbed boundary — exercising it end-to-end needs a real operation-store + transition
// fixture, a later step. What this proves: the real reconcile branch selects the real operation and
// carries the virtual clock to the reconcile, on the network clock.

const ownerProto = OperationWorkflowOwner.prototype;
const lifecycleProto = RebalanceCoordinator.prototype;
const START_MS = 1_000_000;
const INTERVAL_MS = 20;
const DRIVE_SPAN_MS = 200;

function makeOperation() {
  return {
    operationId: 'op-1',
    type: 'create', // not a priority-recovery DRAIN operation type -> NOT_APPLICABLE drain path
    workflowStep: WORKFLOW_STEP.CREATING,
    partitionId: 'data-1', // non-priority partition
    updatedAt: START_MS - 5_000,
    createdAt: START_MS - 5_000,
  };
}

// Host the real checkTimeouts reconcile branch on one network node.
function hostReconcileLoop(net, nodeId, {operation, terminal}) {
  net.registerNode(nodeId, () => {});
  const ts = net.networkTimeSource(nodeId);
  const reconciled = []; // {operationId, now}
  const counters = {checks: 0};
  const coord = Object.create(ownerProto);
  Object.assign(coord, {
    nodeId,
    // isInitialized / isShuttingDown are getters backed by injected predicates (retry registry).
    _isInitialized: () => true,
    _isShuttingDown: () => false,
    timeSource: ts,
    lastEmptyIncompleteOperationQueryAtMs: 0,
    incompleteOperationQueryEmptyBackoffMs: 0,
    logger: {error: () => {}, warn: () => {}, info: () => {}, debug: () => {}},
    // step-9 real loop
    timeoutCheckInterval: null,
    timeoutCheckInFlight: false,
    timeoutCheckIntervalMs: INTERVAL_MS,
    timeoutCheckSetIntervalFn: (fn, ms) => ts.setInterval(fn, ms),
    timeoutCheckClearIntervalFn: (handle) => ts.clearInterval(handle),
    startTimeoutChecking: lifecycleProto.startTimeoutChecking,
    stopTimeoutChecking: lifecycleProto.stopTimeoutChecking,
    logQueryOperationsFailure: () => {},
    // count entries into the REAL checkTimeouts, then delegate to it
    checkTimeouts: async function checkTimeouts() {
      counters.checks += 1;
      return ownerProto.checkTimeouts.call(this);
    },
    // --- boundary overrides (own-props shadow the real prototype methods) ---
    repository: {
      hasReplicaOperationCacheObservationBoundary: () => false,
      queryCachedIncompleteOperations: async () => [],
      getIncompleteOperationVisibilityObservation: async () => ({
        state: INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT,
        operations: [operation],
      }),
      getOperationByIdVisibilityObservation: async () => ({operation}),
      isOperationTerminal: () => terminal === true,
      isOperationLocallyOwned: () => true,
    },
    getOperationOwnerSingleFlightKey: (operationId) => operationId,
    operationWorkflowRunExclusive: async (_key, fn) => fn(),
    reconcileReservations: async () => {},
    reconcileTimeoutOperation: async (op, now) => {
      reconciled.push({operationId: op?.operationId, now});
    },
  });
  coord.startTimeoutChecking();
  return {coord, reconciled, counters};
}

async function runReconcile({terminal = false} = {}) {
  const net = createVirtualNetwork({startMs: START_MS});
  const host = hostReconcileLoop(net, 'W', {operation: makeOperation(), terminal});
  await driveNetwork(net, {untilMs: START_MS + DRIVE_SPAN_MS, stepMs: 5});
  host.coord.stopTimeoutChecking();
  return {reconciled: host.reconciled, checks: host.counters.checks};
}

t.test('a real incomplete operation reaches reconcileTimeoutOperation with the VIRTUAL clock now',
  async (t) => {
    const m = await runReconcile();
    t.ok(m.checks > 0, 'the real checkTimeouts loop ran on the virtual clock');
    t.ok(m.reconciled.length > 0,
      'the operation flowed through the REAL reconcile branch (real drain gate ALLOW_RECONCILE)');
    t.ok(m.reconciled.every((r) => r.operationId === 'op-1'),
      'the real orchestration selected our operation for reconcile');
    // The reconcile `now` is the seam'd virtual clock (resolveTimeoutCheckNowMs), not wall time.
    t.ok(m.reconciled.every((r) => r.now >= START_MS && r.now <= START_MS + DRIVE_SPAN_MS),
      'reconcile received a virtual-clock now within the driven window');
    const nows = m.reconciled.map((r) => r.now);
    t.same(nows, [...nows].sort((a, b) => a - b),
      'the reconcile now advances monotonically with virtual time across ticks');
    t.ok(nows[nows.length - 1] > nows[0],
      'the virtual now genuinely advanced between the first and last reconcile (driven by the clock)');
  });

t.test('a terminal operation is NOT reconciled — the REAL loop logic gates it, not a stub',
  async (t) => {
    const m = await runReconcile({terminal: true});
    t.ok(m.checks > 0, 'the loop still ran every tick');
    t.equal(m.reconciled.length, 0,
      'the real checkTimeouts terminal check skipped the operation before reconcile');
  });

t.test('the reconcile-branch drive is deterministic across runs', async (t) => {
  const a = await runReconcile();
  const b = await runReconcile();
  t.same(
    {checks: a.checks, nows: a.reconciled.map((r) => r.now)},
    {checks: b.checks, nows: b.reconciled.map((r) => r.now)},
    'identical virtual drive -> identical reconcile instants',
  );
});
