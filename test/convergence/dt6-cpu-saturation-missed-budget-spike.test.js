import t from 'tap';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {createCostTable} from '../distributed/harness/cost-table.js';
import {driveNetwork} from '../distributed/harness/raft-network-host.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {OperationWorkflowOwner} from '../../src/rebalancer/operation-workflow-owner.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from
  '../../src/rebalancer/operation-workflow-recovery-reconcile-shared.js';

const {INCOMPLETE_OPERATION_OBSERVATION_STATE, WORKFLOW_STEP} = SHARED;
// Kept equal to the per-test {timeout: ...} declarations below. This value was
// previously 60_000 and inert: tap caps everything at its 30s default and
// t.setTimeout() cannot extend past it (run-test-files.js:198-213). Now that
// the per-test declarations lift TAP_TIMEOUT to 180s, a stale 60s file-level
// timeout would silently become the new binding limit — below the 77.6s this
// file reached on a contended runner. Underscores are deliberate: the harness
// scans for `{timeout: NNNN}` digits, so this constant is not a declaration.
const TEST_FILE_TIMEOUT_MS = 180_000;

t.setTimeout(TEST_FILE_TIMEOUT_MS);

// ============================================================================
// DT6 fidelity-spike: the rolling-restart CPU-SATURATION missed-budget kill-gate
// root reproduces in-process, deterministically, with a genuine red-on-revert
// handle on the per-node single-core COST CHARGE (commit 69365220 cost-model seam).
// ============================================================================
//
// This is the FIRST (CPU) kill-gate root for the docker rolling-restart scenario,
// the harder counterpart to the COORDINATION-tail spike
// (dt6-replacement-leader-pending-spike.test.js). It hosts the REAL drain/timeout
// orchestration loop — RebalanceCoordinator's startTimeoutChecking loop body =
// OperationWorkflowOwner.prototype.checkTimeouts (DT6 steps 9-12) — on a
// COST-MODELED VirtualNetwork node, and asserts the DISCRIMINATING SIGNAL the
// docker convergence oracle classifies `load` on.
//
// THE DOCKER DISCRIMINATING SIGNAL (the bar — NOT the bare rootCauseClass string):
//   The convergence oracle (assertions-convergence-wait.js) polls
//   `inFlightReplicaOperationCount` in a loop bounded by a WALL-CLOCK deadline
//   `startMs + perRestartActiveTimeoutMs` (rolling-restart.js default 120_000ms,
//   threaded as readinessTimeoutMs:730). A `load` FAIL is exactly: the in-flight
//   replica_operations DO NOT clear to 0 within that per-restart budget window —
//   a node too CPU-saturated to service (drain) its in-flight operations before
//   the deadline fires on schedule in global time. The loadMetrics chain in docker
//   (eventLoopUtilization=1.0 -> the drain/timeout loop starves -> in-flight not
//   clearing) is the real-world producer of this signal.
//
// HOW THE COST MODEL REPRODUCES IT (the mechanism):
//   The drain node W runs its REAL checkTimeouts loop on a per-node single-core
//   clock (networkTimeSource(W)). Each loop tick services (reconciles -> drains)
//   at most ONE in-flight operation AND charges W's single core
//   `charge('priorityRecovery.snapshotBuild', remainingInFlight)` — the
//   snapshot-CONSTRUCTION CPU sink whose cost grows with the in-flight backlog
//   (the priority-recovery snapshot is rebuilt per tick over the whole in-flight
//   set; cf. the saturation-relief profiler verdict, MEMORY). With the charge
//   present W's single core saturates: its own next loop tick is DEFERRED forward
//   to busyUntilMs (virtual-network.js maybeDeferForBusyNode), so ticks slip past
//   the budget deadline faster than they drain the backlog -> in-flight > 0 when
//   the (separately-hosted, un-charged) budget timer fires -> the load signal ->
//   convergence FAIL.
//
//   RED-ON-REVERT: with costTable null (the charge removed, byte-identical default
//   path) the SAME hosted loop ticks every interval in global time, drains the
//   whole backlog well before the deadline -> in-flight == 0 -> converged. The
//   cost charge is therefore PROVABLY the sole cause of the missed budget.
//
// PROVISIONAL COEFFICIENTS (honest): {fixedMs, perUnitMs} below are a structural
// placeholder. A sibling calibration task is profiling the real per-sink ms; the
// deliverable here is the STRUCTURAL red-on-revert (the mechanism fires and flips),
// not a calibrated magnitude. Any coefficients that saturate the single core past
// the per-tick interval reproduce the signal; the exact values are a follow-up.
//
// Determinism: no wall-clock, no real cluster — the whole run is a pure function
// of the virtual clock + the seeded VirtualNetwork drive. Same seed twice =>
// identical outcome (asserted directly).

const ownerProto = OperationWorkflowOwner.prototype;
const lifecycleProto = RebalanceCoordinator.prototype;

// Virtual-time constants. Compressed vs the docker 120_000ms budget so the test
// runs fast; the RATIO (budget vs per-tick drain cost) is what matters, not the
// absolute scale. The drain node ticks every INTERVAL_MS; the budget deadline is
// armed on a SEPARATE, un-charged node so it always fires on schedule in global
// virtual time regardless of W's saturation (the docker oracle's wall-clock
// deadline, which a saturated node cannot slow).
const START_MS = 1_000_000;
const DRAIN_NODE = 'rejoiner-7493b0ab'; // the CPU-saturated drain node
const BUDGET_NODE = 'oracle'; // hosts the per-restart deadline timer (never charged)
const INTERVAL_MS = 20; // the drain/timeout loop cadence
// The per-restart active budget window (docker perRestartActiveTimeoutMs analog,
// compressed). At a 20ms loop interval this is ~50 un-charged ticks — far more than
// enough to drain the backlog when work is FREE, but the cost charge starves it.
const PER_RESTART_BUDGET_MS = 1_000;
const DRIVE_SPAN_MS = PER_RESTART_BUDGET_MS + 400; // drive past the deadline
const INITIAL_IN_FLIGHT = 16; // the surplus-drain REPLACE backlog to clear
// Per-op service quota: an op needs this many reconcile passes to drain (the per-op
// cross-node write/raft work). Un-charged, all ops drain in SERVICES_PER_OP ticks
// (~8 * 20ms = 160ms, well under budget). Charged, the snapshot-build charge per
// tick over the ~16-op backlog (~5 + 12*16 = 197ms) lets only ~5 passes fit in the
// 1000ms budget — fewer than the 8 needed — so the backlog never clears in time.
const SERVICES_PER_OP = 8;

// Provisional cost coefficients (a sibling task calibrates the real ms). The
// snapshot-build cost grows with the in-flight backlog (perUnitMs * remaining),
// plus a fixed per-tick floor. The TOTAL single-core work to drain the whole
// backlog one-op-per-tick is sum_{r=16..1}(fixedMs + perUnitMs*r)
// = 16*5 + 12*(16*17/2) = 80 + 1632 = 1712ms — well OVER the 1000ms budget, so the
// saturated core cannot clear the backlog in time. Un-charged the same backlog
// drains in ~16 ticks * 20ms = 320ms, well UNDER budget. The RATIO is the point;
// the exact magnitudes are a calibration follow-up.
const COST_SPEC = {
  'priorityRecovery.snapshotBuild': {fixedMs: 5, perUnitMs: 12},
};
const COST_OP_KEY = 'priorityRecovery.snapshotBuild';

// A drainable in-flight operation. Shaped like the reconcile-branch fixture (a
// locally-owned, incomplete, non-terminal operation the REAL checkTimeouts loop
// selects and routes to reconcileTimeoutOperation, DT6 step 12).
function makeInFlightOperation(index) {
  return {
    operationId: `op-replace-${index}`,
    type: 'create', // non-priority-recovery drain type -> NOT_APPLICABLE drain path
    workflowStep: WORKFLOW_STEP.CREATING,
    partitionId: `replica_operations-p${index}`,
    updatedAt: START_MS - 5_000,
    createdAt: START_MS - 5_000,
  };
}

// Host the REAL checkTimeouts drain loop on the drain node. The repository (the
// only I/O boundary) reports the LIVE remaining in-flight set; reconcileTimeoutOperation
// (the terminal state-transition boundary) DRAINS one operation per service (marks
// it terminal -> removed from the in-flight set). Each loop tick charges the node's
// single core for the priority-recovery snapshot build over the remaining backlog,
// so a costTable-equipped network saturates the core and starves the drain.
function hostDrainLoop(net, nodeId, {charge}) {
  net.registerNode(nodeId, () => {});
  const ts = net.networkTimeSource(nodeId);
  // The live in-flight set. Draining = marking an op terminal (deleting it here).
  const inFlight = new Map();
  for (let i = 0; i < INITIAL_IN_FLIGHT; i += 1) {
    const op = makeInFlightOperation(i);
    inFlight.set(op.operationId, op);
  }
  // Per-op accumulated service. An op DRAINS only after SERVICES_PER_OP reconcile
  // passes — modelling the per-op cross-node replica_operations WRITE / raft-commit
  // work that keeps an operation in-flight across many loop ticks in docker (an op
  // is not a free local terminal flip; it waits on distributed progress). One real
  // checkTimeouts invocation services EVERY remaining op once (the real loop iterates
  // them all), so the backlog shrinks gradually across ticks — and each tick re-pays
  // the snapshot-build charge over a still-large backlog, which is what saturates the
  // single core.
  const serviced = new Map();
  const counters = {checks: 0, drained: 0, services: 0};
  const realCheckTimeouts = ownerProto.checkTimeouts;

  const coord = Object.create(ownerProto);
  Object.assign(coord, {
    nodeId,
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
    // Each REAL loop entry: CHARGE the single core for the snapshot build over the
    // remaining in-flight backlog, then delegate to the real checkTimeouts body.
    checkTimeouts: async function checkTimeouts() {
      counters.checks += 1;
      if (charge) {
        // The snapshot-construction cost scales with the in-flight backlog size.
        ts.charge(COST_OP_KEY, inFlight.size);
      }
      return realCheckTimeouts.call(this);
    },
    // --- boundary overrides (own-props shadow the real prototype methods) ---
    repository: {
      hasReplicaOperationCacheObservationBoundary: () => false,
      queryCachedIncompleteOperations: async () => [],
      // The LIVE remaining in-flight set — what the docker oracle polls as
      // inFlightReplicaOperationCount.
      getIncompleteOperationVisibilityObservation: async () => {
        const operations = [...inFlight.values()];
        return {
          state: operations.length > 0 ?
            INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT :
            INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY,
          operations,
        };
      },
      getOperationByIdVisibilityObservation: async (operationId) => ({
        operation: inFlight.get(operationId) || null,
      }),
      isOperationTerminal: () => false,
      isOperationLocallyOwned: () => true,
    },
    getOperationOwnerSingleFlightKey: (operationId) => operationId,
    operationWorkflowRunExclusive: async (_key, fn) => fn(),
    reconcileReservations: async () => {},
    // The terminal state-transition boundary: SERVICING an operation accrues one
    // unit of progress; the op DRAINS (terminal -> removed from in-flight) only once
    // it has accrued SERVICES_PER_OP. The cost charge per tick governs HOW MANY
    // reconcile passes fit in the budget, hence whether the backlog clears in time.
    reconcileTimeoutOperation: async (op) => {
      if (!op || !inFlight.has(op.operationId)) {
        return;
      }
      counters.services += 1;
      const done = (serviced.get(op.operationId) || 0) + 1;
      if (done >= SERVICES_PER_OP) {
        inFlight.delete(op.operationId);
        serviced.delete(op.operationId);
        counters.drained += 1;
      } else {
        serviced.set(op.operationId, done);
      }
    },
  });
  coord.startTimeoutChecking();
  return {
    coord,
    counters,
    inFlightCount: () => inFlight.size,
  };
}

// Arm the per-restart budget deadline as a one-shot timer on a SEPARATE, never-charged
// node. It fires at START_MS + PER_RESTART_BUDGET_MS in GLOBAL virtual time — the
// docker oracle's wall-clock deadline, which a saturated drain node cannot push back.
function armBudgetDeadline(net) {
  net.registerNode(BUDGET_NODE, () => {});
  const fired = {atMs: null};
  net.setTimer(BUDGET_NODE, (api) => {
    fired.atMs = api.now();
  }, PER_RESTART_BUDGET_MS);
  return fired;
}

// Run the hosted drain loop against the budget deadline. Returns the in-flight count
// SAMPLED at the budget deadline (the docker oracle's verdict input), the deadline
// fire instant, and the drain counters. The run is a pure function of the virtual
// clock (no wall-clock, no RNG on this path), so it is deterministic by construction.
async function runDrainUnderBudget({charge}) {
  const costTable = charge ? createCostTable(COST_SPEC) : null;
  const net = createVirtualNetwork({startMs: START_MS, costTable});
  const budget = armBudgetDeadline(net);
  const host = hostDrainLoop(net, DRAIN_NODE, {charge});

  // Drive to the deadline: the budget timer fires at the budget instant in global
  // virtual time. Sample the in-flight count AT the deadline (the oracle's poll).
  await driveNetwork(net, {untilMs: START_MS + PER_RESTART_BUDGET_MS, stepMs: 5});
  const inFlightAtDeadline = host.inFlightCount();
  // Drive a little further to confirm the deadline fired and observe the tail.
  await driveNetwork(net, {untilMs: START_MS + DRIVE_SPAN_MS, stepMs: 5});
  host.coord.stopTimeoutChecking();

  return {
    inFlightAtDeadline,
    deadlineFiredAtMs: budget.atMs,
    checks: host.counters.checks,
    drained: host.counters.drained,
    finalInFlight: host.inFlightCount(),
    drainNodeBusyUntil: net.nodeBusyUntil(DRAIN_NODE),
    globalNow: net.now(),
  };
}

// ============================================================================
// 1. THE WEDGE (cost charge present): the CPU-saturated drain node misses the
//    per-restart budget — in-flight replica_operations do NOT clear within the
//    budget window. This is the docker `load` discriminating signal.
// ============================================================================
// Harness watchdogs, not latency contracts. tap silently caps every test at
// its 30s default and only TAP_TIMEOUT lifts it, which run-test-files.js
// derives from the largest declaration in this file; declaring nothing left
// these scenarios on the bare 30s cap. Healthy execution measures 22.1s for
// the whole file — the heaviest of the dt6 set — so a contended 2-vCPU runner
// reached 77.6s and reported "timeout!". 180000 keeps a genuine hang
// detectable with room for a slow machine. The budget SEMANTICS under test are
// asserted on the virtual clock below, not on wall-clock duration.
t.test('CPU-saturation WEDGE (cost charge present): the saturated drain node ' +
  'misses the per-restart budget — in-flight replica_operations > 0 at the ' +
  'deadline (the docker `load` signal)', {timeout: TEST_FILE_TIMEOUT_MS}, async (t) => {
  const m = await runDrainUnderBudget({charge: true});

  t.ok(m.checks > 0, 'the REAL checkTimeouts drain loop ran on the virtual clock');
  // The deadline fired on schedule in global time — saturation cannot push it back.
  t.equal(m.deadlineFiredAtMs, START_MS + PER_RESTART_BUDGET_MS,
    'the per-restart budget deadline fired on schedule in global virtual time');
  // THE DISCRIMINATING SIGNAL: in-flight did NOT clear within the budget window.
  t.ok(m.inFlightAtDeadline > 0,
    `in-flight replica_operations NOT cleared within budget (${m.inFlightAtDeadline} ` +
      'still in flight at the deadline) — the load / in-flight-not-clearing signal');
  // The mechanism: the single core saturated past the budget window (busyUntil
  // advanced far beyond the deadline because each tick charged the snapshot build).
  t.ok(m.drainNodeBusyUntil > START_MS + PER_RESTART_BUDGET_MS,
    'the drain node\'s single core is saturated past the budget ' +
      `(busyUntil ${m.drainNodeBusyUntil} > deadline ${START_MS + PER_RESTART_BUDGET_MS})`);
  // It DID make some progress (it is a real loop, not frozen) but not enough — the
  // saturation starves the drain rate below what the budget needs.
  t.ok(m.drained < INITIAL_IN_FLIGHT,
    `the saturated loop drained only ${m.drained}/${INITIAL_IN_FLIGHT} before the budget`);
  t.end();
});

// ============================================================================
// 2. RED-ON-REVERT (cost charge removed, costTable null): the SAME hosted loop
//    drains the whole in-flight backlog within the budget — in-flight == 0
//    before the deadline => converged. The cost charge is the SOLE cause.
// ============================================================================
t.test('RED-ON-REVERT (cost charge removed): the SAME drain loop clears ALL ' +
  'in-flight replica_operations within the budget window => converged',
{timeout: TEST_FILE_TIMEOUT_MS}, async (t) => {
  const m = await runDrainUnderBudget({charge: false});

  t.ok(m.checks > 0, 'the REAL checkTimeouts drain loop ran on the virtual clock');
  t.equal(m.deadlineFiredAtMs, START_MS + PER_RESTART_BUDGET_MS,
    'the per-restart budget deadline still fired on schedule');
  // CONVERGED: in-flight cleared to 0 within the budget window.
  t.equal(m.inFlightAtDeadline, 0,
    'in-flight replica_operations CLEARED within the budget (== 0 at the deadline) => converged');
  t.equal(m.drained, INITIAL_IN_FLIGHT,
    `the un-charged loop drained the entire backlog (${INITIAL_IN_FLIGHT}/${INITIAL_IN_FLIGHT})`);
  // With no cost table the single core never advances past global time (the
  // byte-identical default path): busyUntil never exceeds the node clock.
  t.ok(m.drainNodeBusyUntil <= m.globalNow,
    'the drain node was never saturated (busyUntil never advanced past the clock)');
  t.end();
});

// ============================================================================
// 3. THE PIN: the cost charge is the SOLE difference. Identical hosted loop,
//    identical backlog, identical budget — the ONLY change is the cost charge.
//    Charged => in-flight > 0 at the deadline (FAIL); un-charged => 0 (converged).
//    This is the genuine red-on-revert handle on the cost-model mechanism.
// ============================================================================
t.test('red-on-revert pin: the ONLY change is the cost charge — charged MISSES ' +
  'the budget (in-flight > 0), un-charged MEETS it (in-flight == 0); the cost ' +
  'charge is provably the cause of the missed budget',
{timeout: TEST_FILE_TIMEOUT_MS}, async (t) => {
  const charged = await runDrainUnderBudget({charge: true});
  const uncharged = await runDrainUnderBudget({charge: false});

  // Same loop, same backlog, same deadline.
  t.equal(charged.deadlineFiredAtMs, uncharged.deadlineFiredAtMs,
    'identical budget deadline in both directions');
  // The discriminator flips with the charge.
  t.ok(charged.inFlightAtDeadline > 0,
    'charged: in-flight NOT cleared within budget (load signal -> oracle FAIL)');
  t.equal(uncharged.inFlightAtDeadline, 0,
    'un-charged: in-flight cleared within budget (converged)');
  t.not(charged.inFlightAtDeadline, uncharged.inFlightAtDeadline,
    'removing the cost charge flips the load signal from FAIL to converged — ' +
      'a true red-on-revert handle on the cost-model mechanism');
  t.end();
});

// ============================================================================
// 4. DETERMINISM: same construction twice => identical outcome (no wall-clock,
//    pure function of the virtual clock + seeded drive).
// ============================================================================
t.test('determinism: the same charged run twice yields the identical outcome',
  {timeout: TEST_FILE_TIMEOUT_MS},
  async (t) => {
    const a = await runDrainUnderBudget({charge: true});
    const b = await runDrainUnderBudget({charge: true});
    t.same(
      {
        inFlightAtDeadline: a.inFlightAtDeadline,
        deadlineFiredAtMs: a.deadlineFiredAtMs,
        checks: a.checks,
        drained: a.drained,
        drainNodeBusyUntil: a.drainNodeBusyUntil,
      },
      {
        inFlightAtDeadline: b.inFlightAtDeadline,
        deadlineFiredAtMs: b.deadlineFiredAtMs,
        checks: b.checks,
        drained: b.drained,
        drainNodeBusyUntil: b.drainNodeBusyUntil,
      },
      'identical virtual drive => identical in-flight/drain/saturation outcome',
    );
    t.end();
  });
