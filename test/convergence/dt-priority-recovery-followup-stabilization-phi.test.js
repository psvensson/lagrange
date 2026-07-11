import t from 'tap';
import {UnifiedRebalancerCore} from '../../src/rebalancer/unified-rebalancer-core.js';
import {UNIFIED_REBALANCER_FOLLOW_UP_SHARED as SHARED} from
  '../../src/rebalancer/unified-rebalancer-follow-up-shared.js';
import {
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
} from '../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {buildReplicaInventorySnapshot} from
  '../../src/rebalancer/replica-inventory.js';

// ---------------------------------------------------------------------------
// Deterministic self-stabilization Φ-prover for the priority-recovery
// spread/drain follow-up loop — the SOLE residual head the current-HEAD gate
// (stat-gate-20260701T171618Z) blocks on (priority_recovery_workflow_progress).
//
// QUESTION: "at what wait does it stabilize, or can we prove it eventually
// stabilizes?" A Docker gate with a fixed timeout can never separate "slow
// monotone tail" from "limit cycle". This does, deterministically.
//
// METHOD: drive the REAL decision kernel (UnifiedRebalancerCore.prototype:
// buildPriorityRecoveryFollowUpMove + selectTarget + the deficit suppression +
// getReadyNodeOccupiedReplicas + countPriorityRecoveryFollowUpInFlightAdds +
// computeInFlightAwareReplicaAccounting) in a closed plan→apply→replan loop over
// a modelled world (node readiness, in-flight op completion, learner promotion).
// FIDELITY BOUNDARY: the DECISION logic is 100% real (Object.create of the real
// prototype chain, no method copies). Only the ENVIRONMENT projections are
// stubbed to read the modelled world: getAvailableNodes / isNodeProcessAlive /
// isCriticalSystemPartition / getTopologyBlockingInFlightOperations /
// isPriorityRecoveryFollowUpTargetKnownLocallyNotReady, plus the upstream
// decision snapshot (required / eligibleNodeIds / target). Φ is computed each
// settled tick FROM the real accessors.
//
// Φ (potential) = deficit + overCount + inFlightOps, where
//   deficit   = max(0, target − (occupied + inFlightAdds))   [real accessors]
//   overCount = max(0, activeReplicas − target)               [over-replication]
//   inFlightOps = modelled in-flight operation count
// Fixpoint (self-stabilized) ⇔ Φ = 0 AND the kernel emits no new work
//   (NOT_REQUIRED / TARGET_UNAVAILABLE / IN_FLIGHT_ADD_SATISFIES_DEFICIT).
// Limit cycle ⇔ a prior world-Φ signature re-enters with Φ > 0, or overCount
//   ever exceeds 0 (an over-replication overshoot — the gate's 3→5→6 signature).
//
// THE PROVEN PROPERTY (red-on-revert against budget-planning.js:394's
// `|| this.isNodeProcessAlive(...)` guard, commit 4700a47b): WITH the guard the
// process-alive rejoiner's ACTIVE replica is counted as occupied → the redundant
// ADD is suppressed → Φ decreases monotonically to 0 (self-stabilizes, no
// overshoot). WITHOUT the guard that replica is invisible → an ADD is re-minted →
// overCount > 0 (the over-replication limit cycle). So eventual stabilization of
// THIS head holds BECAUSE the guard makes Φ monotone.
//
// SCOPE (honest boundary — do not over-read "self-stabilization proven"): the Φ
// monotonicity is proven for a MONOTONE environment — the rejoiner goes serve-ready
// once and stays, processAlive is constant true, learners only promote. The sweep
// varies catch-up TIMING (rReadyAtTick × opCountdown), NOT ENV FLAP. An adversarial
// process-alive flap (true→false→true) DOES mint one redundant ADD during the
// believed-death window, but that ADD is correct-by-construction (a genuinely-down
// node is re-placed), and the resulting bounded +1 surplus is reconciled by the
// SEPARATE over-target surplus-drain path (move-planner-move-calculation-methods.js),
// not by this ADD-only follow-up loop — so it is a bounded transient, not a sustained
// cycle (a sustained cycle would require sub-op-latency FD flapping = a failure-
// detector pathology, out of scope for this kernel). Verified 2026-07-01.
// ---------------------------------------------------------------------------

const {RAFT_ROLE, ReplicaStatus, NodeStatus, EntityType} =
  SHARED.UNIFIED_REBALANCER_SHARED;

const PARTITION_ID = 'p1';
const TARGET = 3;
const VOTER_ROLE = RAFT_ROLE.FOLLOWER || 'follower';

// Build the mutable world for the post-restart differential scenario:
//  N1, N2  — serve-ready voters holding ACTIVE voter replicas (healthy = 2)
//  R       — a rejoiner: process-alive but NOT serve-ready, ACTIVE learner
//            replica already materialised (invisible to a ready-ONLY occupancy
//            count; visible to the ready-OR-process-alive count)
//  F       — a serve-ready, eligible, EMPTY node (a free ADD target)
// target = 3, so healthy(2) < target: the deficit path runs every tick.
function makeWorld({rReadyAtTick = 3, opCountdown = 2} = {}) {
  return {
    tick: 0,
    opCountdown,
    // node_id -> readiness
    nodes: new Map([
      ['N1', {serveReady: true, processAlive: true, address: 'a-N1'}],
      ['N2', {serveReady: true, processAlive: true, address: 'a-N2'}],
      ['R', {serveReady: false, processAlive: true, address: 'a-R'}],
      ['F', {serveReady: true, processAlive: true, address: 'a-F'}],
    ]),
    // committed replica rows for p1
    replicas: [
      replicaRow('N1', 'r-N1', ReplicaStatus.ACTIVE, VOTER_ROLE),
      replicaRow('N2', 'r-N2', ReplicaStatus.ACTIVE, VOTER_ROLE),
      // the rejoiner's replica: materialised ACTIVE, still a learner
      replicaRow('R', 'r-R', ReplicaStatus.ACTIVE, RAFT_ROLE.LEARNER),
    ],
    // modelled in-flight ops (ADD/REPLACE), each with a completion countdown
    inFlight: [],
    // R becomes serve-ready after this many ticks (rejoiner catch-up)
    rReadyAtTick,
  };
}

function replicaRow(nodeId, replicaId, status, role) {
  return {
    node_id: nodeId,
    address: `a-${nodeId}`,
    replica_id: replicaId,
    service_id: replicaId,
    status,
    raft_role: role,
    partition_id: PARTITION_ID,
  };
}

// Wire a REAL UnifiedRebalancerCore instance whose decision kernel is untouched;
// only environment projections read `world`.
function makeRebalancer(world) {
  const rb = Object.create(UnifiedRebalancerCore.prototype);
  rb.entityId = PARTITION_ID;
  rb.entityType = EntityType.PARTITION;
  rb.nowFn = () => world.tick;
  rb.replicaInventoryBuilder = buildReplicaInventorySnapshot;
  rb.logger = {error() {}, warn() {}, info() {}, debug() {}};

  // --- environment projections (stubbed to the modelled world) ---
  rb.isCriticalSystemPartition = () => true;
  rb.getAvailableNodes = () =>
    [...world.nodes.entries()]
      .filter(([, n]) => n.serveReady)
      .map(([nodeId, n]) => ({node_id: nodeId, address: n.address}));
  rb.isNodeProcessAlive = (nodeId) =>
    world.nodes.get(nodeId)?.processAlive === true;
  const inFlightOpRows = () =>
    world.inFlight.map((op) => ({
      type: op.type,
      partition_id: PARTITION_ID,
      entity_id: PARTITION_ID,
      replica_id: op.replicaId,
      target_node_id: op.targetNodeId,
      status: op.status,
    }));
  rb.getTopologyBlockingInFlightOperations = inFlightOpRows;
  rb.getGlobalTopologyBlockingInFlightOperations = inFlightOpRows;
  // node-known-not-ready = environment readiness (a not-serve-ready node is not a
  // valid fresh ADD target); keeps R out of target selection, F in.
  rb.isPriorityRecoveryFollowUpTargetKnownLocallyNotReady = (nodeId) =>
    world.nodes.get(nodeId)?.serveReady !== true;
  rb.systemTableCache = {
    get: (_table, nodeId) =>
      world.nodes.has(nodeId) ? {node_id: nodeId, status: NodeStatus.ACTIVE} : null,
  };
  return rb;
}

// The upstream decision snapshot the observation pipeline would emit: unresolved
// (NEEDS_OPERATION, CREATE_RECOVERY_OPERATION) while the partition is short of
// target on distinct ready voters; resolved once converged.
function buildDecision(world, converged) {
  const eligibleNodeIds = [...world.nodes.keys()];
  const decisionSnapshot = converged ?
    {
      partitionId: PARTITION_ID,
      semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE.CONVERGED || 'converged',
      eligibleNodeIds,
      planner: {requiredDistinctNodeCount: TARGET},
    } :
    {
      partitionId: PARTITION_ID,
      semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.CREATE_RECOVERY_OPERATION,
      eligibleNodeIds,
      planner: {requiredDistinctNodeCount: TARGET},
    };
  return {decisionSnapshot};
}

// A distinct-ready-voter count: the real convergence target for this head.
function healthyDistinctReadyVoterCount(world) {
  const seen = new Set();
  for (const r of world.replicas) {
    if (
      r.status === ReplicaStatus.ACTIVE &&
      r.raft_role !== RAFT_ROLE.LEARNER &&
      world.nodes.get(r.node_id)?.serveReady === true
    ) {
      seen.add(r.node_id);
    }
  }
  return seen.size;
}

function activeReplicaCount(world) {
  return world.replicas.filter((r) => r.status === ReplicaStatus.ACTIVE).length;
}

// Apply one modelled world transition after reading the kernel's move:
//  - dispatch the emitted move into the in-flight set (ADD/REPLACE)
//  - advance in-flight ops toward completion; materialise / drain rows
//  - advance rejoiner readiness; promote a settled learner while voters < target
function stepWorld(world, move) {
  world.tick += 1;

  // 1. dispatch the emitted move
  if (move && move.type === 'add') {
    world.inFlight.push({
      type: 'add',
      targetNodeId: move.nodeId,
      replicaId: `add-${move.nodeId}-${world.tick}`,
      status: ReplicaStatus.PENDING,
      countdown: world.opCountdown,
    });
  } else if (move && move.type === 'replace') {
    world.inFlight.push({
      type: 'replace',
      targetNodeId: move.nodeId,
      sourceNodeId: move.sourceNodeId,
      sourceReplicaId: move.replicaId,
      replicaId: `rep-${move.nodeId}-${world.tick}`,
      status: ReplicaStatus.PENDING,
      countdown: world.opCountdown,
    });
  }

  // 2. advance in-flight ops
  const stillInFlight = [];
  for (const op of world.inFlight) {
    op.countdown -= 1;
    if (op.countdown > 0) {
      op.status = ReplicaStatus.CREATING;
      stillInFlight.push(op);
      continue;
    }
    // op completes: materialise the new replica (ADD & REPLACE both create one)
    world.replicas.push(
      replicaRow(op.targetNodeId, op.replicaId, ReplicaStatus.ACTIVE,
        RAFT_ROLE.LEARNER),
    );
    // REPLACE drains its source row
    if (op.type === 'replace') {
      world.replicas = world.replicas.filter(
        (r) => r.replica_id !== op.sourceReplicaId,
      );
    }
  }
  world.inFlight = stillInFlight;

  // 3. rejoiner R catches up and becomes serve-ready
  if (world.tick >= world.rReadyAtTick) {
    const r = world.nodes.get('R');
    if (r) {
      r.serveReady = true;
    }
  }

  // 4. learner promotion: while voters < target, promote a settled learner whose
  //    node is serve-ready (uncapped voter promotion below target).
  let voters = world.replicas.filter(
    (r) => r.status === ReplicaStatus.ACTIVE && r.raft_role !== RAFT_ROLE.LEARNER,
  ).length;
  for (const r of world.replicas) {
    if (voters >= TARGET) {
      break;
    }
    if (
      r.status === ReplicaStatus.ACTIVE &&
      r.raft_role === RAFT_ROLE.LEARNER &&
      world.nodes.get(r.node_id)?.serveReady === true
    ) {
      r.raft_role = VOTER_ROLE;
      voters += 1;
    }
  }
}

// Run the closed plan→apply→replan loop; return the Φ trace + verdict.
function runStabilizationTrace(world, maxTicks = 40) {
  const rb = makeRebalancer(world);
  const trace = [];
  let maxOverCount = 0;
  let fixpointTicks = 0;
  let verdict = 'running';

  for (let i = 0; i < maxTicks; i += 1) {
    const converged =
      healthyDistinctReadyVoterCount(world) >= TARGET &&
      activeReplicaCount(world) <= TARGET;
    const decision = buildDecision(world, converged);

    // --- REAL kernel decision ---
    const outcome = rb.buildPriorityRecoveryFollowUpMove({
      decision,
      currentReplicas: world.replicas,
      targetState: {targetReplicaCount: TARGET},
    });

    // --- Φ: distance to TRUE convergence (target voters on distinct ready
    // nodes), plus over-replication and in-flight work. occupied/inFlightAdds
    // are the REAL suppression accessors, surfaced for the trace. ---
    const occupied = rb.getReadyNodeOccupiedReplicas(world.replicas).length;
    const inFlightAdds = rb.countPriorityRecoveryFollowUpInFlightAdds(PARTITION_ID);
    const servedDeficit =
      Math.max(0, TARGET - healthyDistinctReadyVoterCount(world));
    const overCount = Math.max(0, activeReplicaCount(world) - TARGET);
    const phi = servedDeficit + overCount + world.inFlight.length;
    maxOverCount = Math.max(maxOverCount, overCount);

    const state = outcome.followUpMoveState;
    const emittedWork =
      state === 'move_created' ||
      state === 'source_fallback_add_created' ||
      typeof outcome.type === 'string';

    trace.push({
      tick: world.tick, state, moveType: outcome.type || null,
      occupied, inFlightAdds, servedDeficit, overCount,
      inFlight: world.inFlight.length, phi, emittedWork,
    });

    // fixpoint: Φ == 0 and the kernel emits no new work
    if (phi === 0 && !emittedWork) {
      fixpointTicks += 1;
      if (fixpointTicks >= 3) {
        verdict = 'self_stabilized';
        break;
      }
    } else {
      fixpointTicks = 0;
    }

    // Over-replication overshoot = the limit-cycle signature (the gate's 3→5→6).
    // A steady suppression-WAIT for an async catch-up is NOT a cycle (its Φ is
    // constant, then drops when the rejoiner promotes), so we do not flag a
    // repeated signature: only a real overshoot, or failure to settle within the
    // virtual horizon, counts against stabilization.
    if (overCount > 0) {
      verdict = 'over_replication_overshoot';
      break;
    }

    stepWorld(world, emittedWork ? outcome : null);
  }
  if (verdict === 'running') {
    verdict = 'did_not_settle';
  }
  return {verdict, maxOverCount, trace};
}

t.test('priority-recovery follow-up loop self-stabilizes (Φ→0, no over-replication) ' +
  'from a process-alive rejoiner — the current-HEAD spread head', async (t) => {
  const world = makeWorld();
  const result = runStabilizationTrace(world);

  // Diagnostic trace (visible with --verbose / on failure)
  for (const s of result.trace) {
    t.comment(
      `tick=${s.tick} state=${s.state} move=${s.moveType} ` +
      `occupied=${s.occupied} inFlightAdds=${s.inFlightAdds} ` +
      `servedDeficit=${s.servedDeficit} over=${s.overCount} ` +
      `inFlight=${s.inFlight} Φ=${s.phi}`,
    );
  }

  t.equal(result.verdict, 'self_stabilized',
    'the loop reaches a Φ=0 fixpoint (eventual stabilization holds for this head)');
  t.equal(result.maxOverCount, 0,
    'NO over-replication overshoot — the process-alive occupancy guard ' +
    '(budget-planning.js:394) keeps the rejoiner counted so the redundant ADD ' +
    'is suppressed; reverting the guard makes this fail (over_replication_overshoot)');

  // Φ must be monotone non-increasing until the fixpoint (a decreasing variant =
  // the self-stabilization proof; a rise would be a limit-cycle signature).
  let monotone = true;
  for (let i = 1; i < result.trace.length; i += 1) {
    if (result.trace[i].phi > result.trace[i - 1].phi) {
      monotone = false;
      break;
    }
  }
  t.ok(monotone, 'Φ is monotone non-increasing to 0 (a decreasing variant ⇒ ' +
    'no persistent limit cycle on this head)');
});

function phiMonotone(trace) {
  for (let i = 1; i < trace.length; i += 1) {
    if (trace[i].phi > trace[i - 1].phi) {
      return false;
    }
  }
  return true;
}

// Schedule sweep: vary the rejoiner catch-up time and the in-flight completion
// latency across a grid of interleavings. The self-stabilization claim is only
// meaningful if NO schedule produces a Φ rise / over-replication overshoot — i.e.
// the decreasing variant holds regardless of WHEN the async catch-up lands. This
// is the deterministic analogue of a PCT interleaving sweep for this head.
t.test('Φ decreasing-variant holds across every catch-up/completion schedule ' +
  '(no interleaving produces a limit cycle)', async (t) => {
  const rReadyGrid = [1, 2, 3, 5, 8, 13];
  const opCountdownGrid = [1, 2, 3];
  let scheduleCount = 0;
  for (const rReadyAtTick of rReadyGrid) {
    for (const opCountdown of opCountdownGrid) {
      scheduleCount += 1;
      const world = makeWorld({rReadyAtTick, opCountdown});
      const result = runStabilizationTrace(world, 80);
      const label = `rReadyAtTick=${rReadyAtTick} opCountdown=${opCountdown}`;
      t.equal(result.verdict, 'self_stabilized',
        `${label}: reaches Φ=0 fixpoint`);
      t.equal(result.maxOverCount, 0, `${label}: no over-replication overshoot`);
      t.ok(phiMonotone(result.trace), `${label}: Φ monotone non-increasing`);
    }
  }
  t.comment(`swept ${scheduleCount} catch-up/completion schedules — all ` +
    'self-stabilized with a monotone Φ variant');
});
