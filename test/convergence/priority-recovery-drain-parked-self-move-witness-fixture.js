import {OperationType} from '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {REBALANCER_DEFAULT} from '../../src/rebalancer/rebalancer-constants.js';
import {
  DEFAULT_SCENARIO_PROFILE,
  EXEMPT_TABLE_ID,
  FORMATION_READINESS_BUDGET_MS,
  JOINER_3_NODE_ID,
  LEDGER_PARTITION_ID,
  TARGET_READY_AT_MS,
  runSelfMovePlannedBeforeAddsScenario,
} from './operation-ledger-self-move-hold-engagement-witness-fixture.js';
import {
  buildRecoveryPendingNodeReadiness,
  snapshotHolder,
} from './operation-ledger-self-move-hold-fairness-witness-fixture.js';

// Deterministic witness for GCP runs 2026-08-30T04-49-12 and 07-06-30
// (forensics scratchpad barrier-not-released.md section 3 "Trigger" /
// section 4 "Secondary", streak-9d5deb4f1.md section 2): REPLACE b0b98821
// (replica_operations ledger -> n1) was parked by n1's own dispatch gate at
// the IDLE_ONLY census behind the control_plane_publications learner ADDs
// (`waiting for incumbent`, one re-read per DISPATCH_RETRY_DELAY_MS) and
// n1's own priority-recovery drain settled it
// `fail_priority_recovery_drain_stale / stale_without_retirement_evidence,
// completionState converged, sourceState retirement_unproven_stale,
// ownerState local_owner` at age 33.6 s / 39.8 s (run 07-06-30 node-1
// 07:10:00.199) — the PENDING row's step-entry timestamp never advances
// while the lane parks, so the drain read a live wait as staleness. The
// re-plan and the successor cost 15 s of the 60 s certification window.
// The remote-owner rule (operation-workflow-recovery-drain.js: an available
// owner is woken, not killed) never applied to the local owner.
//
// Scenario `parked-self-move-drain` (offsets from REPLACE A's creation, all
// on the virtual clock; run-cited unless noted):
//   t+0      seed creates REPLACE A replica_operations-p1 seed -> n1 (r2;
//            the ledger's third voter on joiner-3 as in the run's placement).
//            A's PENDING step entry is anchored on the virtual clock (the
//            production timeout/staleness anchor; the fixture rows are
//            otherwise stamped by the wall clock at creation).
//   t+3.5 s  the priority ADDs plan: control_plane_publications (the cpp
//            incumbent; acknowledges after 25.5 s, activates 6 s later:
//            live on the target's census until +35.0 s, the run's 25 s of
//            parking behind the learner's own 29 s) and the four dependents
//            (ack 8.7 s, activation 6 s).
//   t+14 s   n1 READY; n1's real owner parks A at the census every
//            DISPATCH_RETRY_DELAY_MS behind the incumbents (the dispatch
//            gate refreshes its park evidence on every park). From here the
//            target's planning view counts the ledger spread satisfied by
//            the replacement replica it was assigned (run 07-06-30
//            07:10:00.487 `Reconciled observed MOVE_REPLICA assignment to
//            committed state mg-1-r2 -> n1`; the drain's completionState
//            `converged` at the settle) while the seed's view keeps the gap.
//   t+30 s   n1's priority-recovery drain sweeps A on the coordinator's
//            TIMEOUT_CHECK_INTERVAL_MS cadence from the first sweep past
//            PENDING_TIMEOUT_MS (run: 33.6 s / 39.8 s): the real drain
//            snapshot, remote-owner wake decision, lifecycle gate and the
//            real timeout reconcile of one visible operation
//            (operation-workflow-recovery-timeout.js checkTimeouts' per-
//            operation body; only the ledger discovery is modeled because
//            the fixture's SQL double scopes the incomplete read by source
//            node). The seed's (remote, non-owner) drain sweeps A once at
//            the same instant.
//   t+35 s   the cpp incumbent completes; A's next park re-drive finds the
//            ledger idle and claims SENDING through the existing engagement
//            (CREATE_REPLICA ack +14.0 s, ACTIVE +9.6 s, terminal +1.5 s).
//
// RED on HEAD (dae475a3b): the t+30 s sweep settles A
// fail_priority_recovery_drain_stale (row FAILED, ownerState local_owner)
// while its lane is parking every 250 ms. GREEN after the cure: every sweep
// while the park evidence is fresh classifies A recovering_dispatch_parked
// (NOOP, owner state local_lane_parked), A claims SENDING within one
// dispatch cadence of the incumbent's terminal, no successor is ever
// planned. The lane variants prove the stale rules are unchanged without
// progress evidence: a lane that NEVER ran (no park evidence) still
// stale-fails at t+30 s; a lane SILENT after its first park (its retry
// timer cleared at the first park) is recovering while the evidence is
// younger than PENDING_TIMEOUT_MS and stale-fails on the first sweep after
// its last park is a full PENDING_TIMEOUT_MS old (t+44 s).
//
// HONEST SCOPE: real seed + target coordinators/owners/interlock/startup
// authority as in the engagement fixture; the real dispatch gate, park
// evidence, drain classification, dispatch-pending re-entry, terminal
// transitions and claim. MODELED: node READY leases and the recovery-pending
// readiness snapshot (readiness owner), the target's planning view of its
// own assigned replica, handler acknowledgement/activation latencies, the
// drain sweep's discovery of A (the sweep instants and its per-operation
// body are the production sequence), the silent/never-ran lane variants.

const PARKED_CPP_DISPATCH_ACK_LATENCY_MS = 25_500;
const DRAIN_FIRST_SWEEP_AT_MS = 30_000;
const DRAIN_SWEEP_INTERVAL_MS =
  REBALANCER_DEFAULT.COORDINATOR.TIMEOUT_CHECK_INTERVAL_MS;
const DRAIN_LAST_SWEEP_AT_MS = 70_000;
const LOCAL_STR_FUNCTION = 'function';
const SINGLE_ROW = 1;
const NO_PARKS = 0;

// How the target's dispatch lane behaves after n1 is READY.
//   LIVE                    — the real lane: parks and re-drives on the
//                             dispatch-retry cadence until it claims.
//   SILENT_AFTER_FIRST_PARK — the lane's retry timer is cleared right after
//                             its first park (a lane that stopped
//                             re-driving): its park evidence ages and
//                             expires.
//   NEVER_RAN               — the target's dispatch of A never runs (no park
//                             evidence at all).
const DISPATCH_LANE = Object.freeze({
  LIVE: 'live',
  SILENT_AFTER_FIRST_PARK: 'silent_after_first_park',
  NEVER_RAN: 'never_ran',
});

// Park evidence classification as the witness reads it from the owner
// (operation-workflow-ledger-self-move-park-evidence.js states); an owner
// without the surface (HEAD) reads UNAVAILABLE.
const PARK_EVIDENCE_READ = Object.freeze({
  UNAVAILABLE: 'unavailable',
});

const DRAIN_EVENT = Object.freeze({
  SELF_MOVE_PARK_EVIDENCE: 'self_move_park_evidence',
  TARGET_DRAIN_SWEEP: 'target_drain_sweep',
  SEED_DRAIN_SWEEP: 'seed_drain_sweep',
  SELF_MOVE_FAILED: 'self_move_failed',
  SELF_MOVE_CLAIMED: 'self_move_claimed',
  HOLD_ENGAGEMENT: 'hold_engagement',
  LANE_SILENCED: 'lane_silenced',
});

// The production timeout/staleness anchor is the newest step-history entry
// for the current step (operation-step-age.js); the fixture rows carry the
// wall clock at creation, so the witness anchors A's PENDING entry (and
// updated_at) on the virtual clock, exactly as the shared timeout fixture's
// setOperationUpdatedAt does.
function anchorRowStepEntryOnClock(row, atMs) {
  row.updated_at = atMs;
  const history = JSON.parse(row.steps_history);
  for (
    let index = history.length - SINGLE_ROW;
    index >= NO_PARKS;
    index -= SINGLE_ROW
  ) {
    const entry = history[index];
    if (entry && entry.step === row.workflow_step) {
      entry.timestamp = atMs;
      break;
    }
  }
  row.steps_history = JSON.stringify(history);
}

// Boundary injection (readiness owner): the target's own planning view of
// the ledger spread from its READY lease on (see the header): the shared
// planning answer with the ledger counted spread-satisfied.
function injectTargetPlanningView({target, elapsed, extras}) {
  const readinessService = target.controlPlaneReadinessService;
  const shared =
    readinessService.getMembershipPublicationPlanningSnapshotBestEffort;
  readinessService.getMembershipPublicationPlanningSnapshotBestEffort =
    async () => {
      const answer = await shared();
      if (
        elapsed() < TARGET_READY_AT_MS ||
        !answer?.priorityPartitionSummary
      ) {
        return answer;
      }
      const summary = answer.priorityPartitionSummary;
      const missingPartitionIds = (summary.missingPartitionIds || []).filter(
        (partitionId) => partitionId !== LEDGER_PARTITION_ID,
      );
      extras.targetPlanningViewReads += SINGLE_ROW;
      return {
        ...answer,
        priorityPartitionSummary: {
          ...summary,
          satisfied: missingPartitionIds.length === NO_PARKS,
          missingPartitionIds,
          blockedPartitions: (summary.blockedPartitions || []).filter(
            (blocked) => blocked.partitionId !== LEDGER_PARTITION_ID,
          ),
        },
      };
    };
}

// Real-owner observation: the target's cluster-wide idle census reads (the
// authoritative read every park re-issues on the dispatch-retry cadence).
function observeTargetCensusReads({target, elapsed, extras}) {
  const repository = target.repository;
  const original = repository.queryClusterWideIncompleteOperations.bind(
    repository,
  );
  repository.queryClusterWideIncompleteOperations = async () => {
    const rows = await original();
    extras.census.attempts.push({atMs: elapsed(), liveCount: rows.length});
    return rows;
  };
}

// Real-owner observation: every engagement of the target's interlock hold
// (the owner port the dispatch claim calls).
function observeTargetEngagements({target, elapsed, record, extras}) {
  const original = target.engageOperationLedgerSelfMoveHold.bind(target);
  target.engageOperationLedgerSelfMoveHold = async (operation) => {
    const engagement = await original(operation);
    extras.engagements.push({
      atMs: elapsed(),
      operationId: operation?.operationId || null,
      engagement,
    });
    record(DRAIN_EVENT.HOLD_ENGAGEMENT, {engagement});
    return engagement;
  };
}

function readParkEvidence(owner, operation) {
  if (
    typeof owner.classifyOperationLedgerSelfMoveParkEvidence !==
    LOCAL_STR_FUNCTION
  ) {
    return {state: PARK_EVIDENCE_READ.UNAVAILABLE};
  }
  const classification =
    owner.classifyOperationLedgerSelfMoveParkEvidence(operation);
  return {
    state: classification.state,
    ageMs: classification.ageMs,
    boundMs: classification.boundMs,
    kind: classification.evidence?.kind ?? null,
    incumbentOperationIds: classification.evidence?.incumbentOperationIds ?
      [...classification.evidence.incumbentOperationIds] :
      [],
  };
}

function describeRow(row) {
  return row ? {step: row.workflow_step, status: row.status} : null;
}

const DRAIN_SNAPSHOT_KEYS = Object.freeze([
  'state',
  'action',
  'ownerState',
  'ownerAction',
  'completionState',
  'sourceState',
]);

function describeDrainSnapshot(snapshot) {
  return Object.fromEntries(
    DRAIN_SNAPSHOT_KEYS.map((key) => [key, snapshot?.[key] ?? null]),
  );
}

// checkTimeouts' per-operation body (operation-workflow-recovery-timeout.js)
// for one visible operation: the real drain snapshot, the remote-owner wake
// decision, the lifecycle gate and the real timeout reconcile under the
// owner's single-flight lane.
async function sweepOperationThroughDrain(coordinator, operation) {
  const owner = coordinator.workflowOwner;
  const snapshot = await owner.buildPriorityRecoveryOperationDrainSnapshot(
    operation,
  );
  const woken = await owner.wakePriorityRecoveryRemoteOwnerFromDrainSnapshot(
    operation,
    snapshot,
  );
  const entered =
    !woken && owner.shouldEnterOperationLifecycleFromDrainSnapshot(snapshot);
  if (entered) {
    await owner.operationWorkflowRunExclusive(
      owner.getOperationOwnerSingleFlightKey(operation.operationId),
      () =>
        owner.reconcileTimeoutOperation(
          operation,
          owner.resolveTimeoutCheckNowMs(),
        ),
    );
  }
  return {snapshot: describeDrainSnapshot(snapshot), woken, entered};
}

function scheduleDrainExtras(context, {dispatchLane}) {
  const {timeSource, elapsed, record, seed, target, state, trackedOperations,
    exempt} = context;
  const extras = state.extras;
  extras.dispatchLane = dispatchLane;
  extras.census = {attempts: []};
  extras.parks = [];
  extras.engagements = [];
  extras.targetSweeps = [];
  extras.seedSweep = null;
  extras.failure = null;
  extras.claim = null;
  extras.laneSilencedAtMs = null;
  extras.pendingTimeoutMs = target.config.pendingTimeoutMs;
  extras.ledgerSelfMoveIds = new Set();
  extras.holderAtSend = null;
  extras.holderAtTerminal = null;
  extras.targetPlanningViewReads = NO_PARKS;
  observeTargetCensusReads({target, elapsed, extras});
  injectTargetPlanningView({target, elapsed, extras});
  observeTargetEngagements({target, elapsed, record, extras});
  const selfMoveId = () => state.selfMove?.operationId || null;
  const rowOf = (operationId) => trackedOperations.get(operationId) || null;
  const selfMoveOperation = () =>
    target.repository.rowToOperation(rowOf(selfMoveId()));

  anchorRowStepEntryOnClock(rowOf(selfMoveId()), timeSource.now());

  // Every ledger self-move row that ever exists (a successor would be a
  // second id).
  const sampleLedgerSelfMoves = () => {
    for (const row of trackedOperations.values()) {
      if (
        row.partition_id === LEDGER_PARTITION_ID &&
        row.type === OperationType.REPLACE
      ) {
        extras.ledgerSelfMoveIds.add(row.operation_id);
      }
    }
    timeSource.setTimeout(sampleLedgerSelfMoves, DRAIN_SWEEP_INTERVAL_MS);
  };
  sampleLedgerSelfMoves();

  // Real-owner observation: every park of A by the target's gate, with the
  // owner's park evidence as the drain will read it.
  const targetOwner = target.workflowOwner;
  const originalPark = targetOwner.parkOperationLedgerSelfMoveDispatch
    .bind(targetOwner);
  targetOwner.parkOperationLedgerSelfMoveDispatch = (
    operation,
    reason,
    errorMessage,
    ...rest
  ) => {
    const result = originalPark(operation, reason, errorMessage, ...rest);
    if (operation?.operationId === selfMoveId()) {
      const evidence = readParkEvidence(targetOwner, operation);
      extras.parks.push({atMs: elapsed(), reason, errorMessage, evidence});
      record(DRAIN_EVENT.SELF_MOVE_PARK_EVIDENCE, {
        reason,
        evidence: {state: evidence.state, kind: evidence.kind ?? null},
      });
      if (
        dispatchLane === DISPATCH_LANE.SILENT_AFTER_FIRST_PARK &&
        extras.laneSilencedAtMs === null
      ) {
        targetOwner.clearDispatchRetry(operation.operationId);
        extras.laneSilencedAtMs = elapsed();
        record(DRAIN_EVENT.LANE_SILENCED);
      }
    }
    return result;
  };
  if (dispatchLane === DISPATCH_LANE.NEVER_RAN) {
    const originalDispatch = target.dispatchOperation.bind(target);
    target.dispatchOperation = (operation, ...rest) =>
      operation?.operationId === selfMoveId() ?
        Promise.resolve(null) :
        originalDispatch(operation, ...rest);
  }

  // Real-owner observation: A's terminal transitions on the target (the
  // drain's stale FAIL is a failOperation; the claim is the SENDING row
  // handed to the transport).
  const originalFail = targetOwner.failOperation.bind(targetOwner);
  targetOwner.failOperation = async (operation, error, ...rest) => {
    const outcome = await originalFail(operation, error, ...rest);
    if (operation?.operationId === selfMoveId() && extras.failure === null) {
      extras.failure = {
        atMs: elapsed(),
        error: typeof error === 'string' ? error : error?.message || null,
        committed: outcome?.committed === true,
        row: describeRow(rowOf(selfMoveId())),
      };
      record(DRAIN_EVENT.SELF_MOVE_FAILED, {error: extras.failure.error});
    }
    return outcome;
  };
  const originalDeliver = targetOwner.messageRouter.deliver;
  targetOwner.messageRouter.deliver = (targetAddress, request) => {
    if (
      request?.operationId === selfMoveId() &&
      extras.claim === null &&
      rowOf(selfMoveId())?.workflow_step === WORKFLOW_STEP.SENDING
    ) {
      extras.claim = {
        atMs: elapsed(),
        incumbentCompletedAtMs: exempt.completedAtMs,
      };
      extras.holderAtSend = snapshotHolder(target);
      record(DRAIN_EVENT.SELF_MOVE_CLAIMED);
    }
    return originalDeliver(targetAddress, request);
  };

  const sweepTarget = async () => {
    const rowBefore = describeRow(rowOf(selfMoveId()));
    const operation = selfMoveOperation();
    const evidence = readParkEvidence(targetOwner, operation);
    const sweep = await sweepOperationThroughDrain(target, operation);
    const observation = {
      atMs: elapsed(),
      evidence,
      ...sweep,
      rowBefore,
      rowAfter: describeRow(rowOf(selfMoveId())),
    };
    extras.targetSweeps.push(observation);
    record(DRAIN_EVENT.TARGET_DRAIN_SWEEP, {
      state: observation.snapshot.state,
      action: observation.snapshot.action,
      ownerState: observation.snapshot.ownerState,
      evidence: evidence.state,
      rowAfter: observation.rowAfter,
    });
  };
  const sweepSeed = async () => {
    const operation = seed.repository.rowToOperation(rowOf(selfMoveId()));
    const sweep = await sweepOperationThroughDrain(seed, operation);
    extras.seedSweep = {
      atMs: elapsed(),
      evidence: readParkEvidence(seed.workflowOwner, operation),
      ...sweep,
      rowAfter: describeRow(rowOf(selfMoveId())),
    };
    record(DRAIN_EVENT.SEED_DRAIN_SWEEP, {
      state: extras.seedSweep.snapshot.state,
      ownerAction: extras.seedSweep.snapshot.ownerAction,
      rowAfter: extras.seedSweep.rowAfter,
    });
  };
  const scheduleSweep = (atMs) => {
    timeSource.setTimeout(() => {
      if (
        rowOf(selfMoveId()).workflow_step !== WORKFLOW_STEP.PENDING ||
        atMs > DRAIN_LAST_SWEEP_AT_MS
      ) {
        return;
      }
      sweepTarget()
        .catch((error) => {
          record(DRAIN_EVENT.TARGET_DRAIN_SWEEP, {error: error.message});
        })
        .then(() => scheduleSweep(atMs + DRAIN_SWEEP_INTERVAL_MS));
    }, atMs - elapsed());
  };
  scheduleSweep(DRAIN_FIRST_SWEEP_AT_MS);
  timeSource.setTimeout(() => {
    sweepSeed().catch((error) => {
      record(DRAIN_EVENT.SEED_DRAIN_SWEEP, {error: error.message});
    });
  }, DRAIN_FIRST_SWEEP_AT_MS);
  extras.observeTerminal = () => {
    extras.holderAtTerminal = snapshotHolder(target);
  };
}

// Done when A settled (its own terminal, or the drain's FAIL) and the
// dependents' second spread round its terminal released has been created
// (no seed create lane mid-flight at shutdown), or the window closed.
function isDrainScenarioDone({state, dependentsSpread, elapsed}) {
  if (
    state.selfMoveTerminalAtMs !== null &&
    typeof state.extras.observeTerminal === LOCAL_STR_FUNCTION
  ) {
    state.extras.observeTerminal();
    state.extras.observeTerminal = null;
  }
  const settled =
    state.selfMoveTerminalAtMs !== null || state.extras.failure !== null;
  return (
    (settled && dependentsSpread()) ||
    elapsed() >= FORMATION_READINESS_BUDGET_MS + DRAIN_FIRST_SWEEP_AT_MS
  );
}

function buildDrainScenarioProfile({dispatchLane}) {
  return Object.freeze({
    ...DEFAULT_SCENARIO_PROFILE,
    ledgerThirdReplicaNodeId: JOINER_3_NODE_ID,
    dispatchAckLatencyMsByTableId: Object.freeze({
      [EXEMPT_TABLE_ID]: PARKED_CPP_DISPATCH_ACK_LATENCY_MS,
    }),
    buildNodeReadiness: buildRecoveryPendingNodeReadiness,
    exemptSecondRound: null,
    placementFollowsSelfMoveActive: true,
    ledgerSpreadAddOnTerminal: false,
    scheduleExtras: (context) => scheduleDrainExtras(context, {dispatchLane}),
    isDone: isDrainScenarioDone,
  });
}

async function runParkedSelfMoveDrainScenario({
  dispatchLane = DISPATCH_LANE.LIVE,
} = {}) {
  const m = await runSelfMovePlannedBeforeAddsScenario(
    buildDrainScenarioProfile({dispatchLane}),
  );
  m.extras.ledgerSelfMoveIds = [...m.extras.ledgerSelfMoveIds];
  delete m.extras.observeTerminal;
  return m;
}

export {
  DISPATCH_LANE,
  DRAIN_FIRST_SWEEP_AT_MS,
  DRAIN_SWEEP_INTERVAL_MS,
  runParkedSelfMoveDrainScenario,
};
