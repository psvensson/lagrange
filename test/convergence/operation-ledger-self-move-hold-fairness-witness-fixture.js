import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  isDisruptiveOperationLedgerSelfMove,
} from '../../src/rebalancer/replica-status.js';
import {isTerminalStep} from '../../src/rebalancer/replica-operation-progress.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {RESERVATION_STATUS} from '../../src/rebalancer/storage-capacity-constants.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from '../../src/rebalancer/operation-workflow-owner-shared.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  DEFAULT_SCENARIO_PROFILE,
  EXEMPT_TABLE_ID,
  FORMATION_READINESS_BUDGET_MS,
  JOINER_1_NODE_ID,
  JOINER_3_NODE_ID,
  JOINER_4_NODE_ID,
  LEADER_REPLICA_INDEX,
  LEDGER_PARTITION_ID,
  LEDGER_TABLE_ID,
  MOVED_REPLICA_INDEX,
  TARGET_READY_AT_MS,
  buildMove,
  buildUniformNodeReadiness,
  isTypedRetryableSkip,
  runSelfMovePlannedBeforeAddsScenario,
  skipReasonOf,
} from './operation-ledger-self-move-hold-engagement-witness-fixture.js';

// Deterministic witness for the GCP streak on 4bc6c1d25 (five-node
// formation, 60 s certification window; forensics scratchpad
// closure-regression.md): runs 23-51-32 and 23-58-17 spread the priority
// partitions only after 66 s / 83 s because the seed's REGISTERED ledger
// self-move was overtaken indefinitely by newer priority ADDs:
//   1. FAIRNESS — the interlock classified the target as not
//      dispatch-admissible on controlPlaneRecoveryEligible while the target
//      was PRIORITY_CONTROL_PLANE_RECOVERY_PENDING (every joiner is, during
//      formation), so the holder stayed REGISTERED, the re-planned dependents
//      (sql x4 second spread) and the exempt control_plane_publications
//      learner re-plans (00:01:39.16 -> n1, ~30 s each) kept extending the
//      IDLE_ONLY census the self-move's dispatch waits for.
//   2. SINGLE NON-TERMINAL SELF-MOVE — run 23-51-32: the seed's reservation
//      reconciliation released b0b98821's reservation as an orphan at
//      23:55:14.47 on a null point read while the row was durably PENDING,
//      and the seed's next lifecycle read for the holder released the hold
//      and admitted a second ledger self-move 8ae2b559 at 23:55:15.01 while
//      #1 was still acted on by its target (40 refused raft log truncations).
//   3. CENSUS RETRY — run 23-58-17: queryClusterWideIncompleteOperations
//      threw at 00:01:42.59 and the self-move re-read only at 00:01:54.91
//      (12.3 s, the incomplete-read backoff) instead of the dispatch-retry
//      cadence (DISPATCH_RETRY_DELAY_MS).
//
// Scenario `dependents-stream-after-registration` (offsets from the
// self-move creation; all on the virtual clock; run-cited unless noted):
//   t+0      seed creates REPLACE replica_operations-p1 seed -> n1 (the
//            ledger's three voters: seed x2, joiner-3 x1 — run 23-58-17's
//            placement where the spread was satisfied at the REPLACE's
//            ACTIVE, 02:01.25/02:01.79; the source retires at the terminal).
//   t+3.5 s  five priority ADDs -> joiner-2: control_plane_publications
//            (exempt emergency partition; learner, completes +30.0) and the
//            four dependents (ack +8.7 s, activation +6 s -> +18.2).
//   t+14 s   n1 holds a current READY lease on the dimension the dispatch
//            path evaluates (controlPlaneRecoveryEligible via the priority-
//            recovery dispatch bootstrap exemption) while it is still
//            PRIORITY_CONTROL_PLANE_RECOVERY_PENDING until the spread is
//            satisfied; n1's real workflow owner drives the dispatch.
//   t+18.2 s the four dependents' second spread round (-> joiner-3) is
//            planned on their completion wake.
//   t+26 s   the seed's authoritative point reads of the self-move answer
//            EMPTY (the null point read of run 23-51-32, 23:55:14.47): the
//            reservation reconciliation releases the reservation as an
//            orphan and the seed's recent-intent memory of the self-move is
//            pruned; the ledger planner then executes a second REPLACE (r1
//            -> joiner-4) whose interlock lifecycle reads are answered with
//            a positive terminal row that is NOT the holder's (a lagging,
//            misattributed ledger read — the one HEAD path by which a read
//            releases the hold without the holder's own terminal row).
//            Placed in the window where no create holds the seed's
//            synchronous gate (the exempt learner create is in flight
//            3.5-24 s and from 30.5 s), the only window in which HEAD's
//            admission of the second self-move is observable rather than
//            masked by operation_ledger_self_move_waiting_for_idle_ledger.
//   t+29.8 s the last cluster-wide census read before the learner completes
//            throws with the repository's retryable backoff hint (run
//            23-58-17: 00:01:42.59, next attempt 00:01:54.91, 12.3 s).
//   t+30.5 s the exempt control_plane_publications re-plan (-> joiner-4)
//            0.5 s after its first spread completes (run: 00:01:39.16, 1.1 s
//            after 00:01:38.07). Exempt emergency ADDs stay contenders of the
//            IDLE_ONLY census (unchanged): the self-move claims in the idle
//            gap the dispatch-retry cadence catches; the backoff misses it.
//   self-move CREATE_REPLICA ack +14.0 s, ACTIVE +9.6 s, terminal +1.5 s
//   (the sibling engagement fixture's run-cited lifecycle, unchanged).
//
// RED on HEAD (4bc6c1d25): the holder stays REGISTERED at +14 (the later
// dependents are deferred by the quorum-spread hold, not excluded by the
// engaged self-move), the failed census re-reads after the 5 s backoff so
// the self-move claims only after the exempt re-plan drains (>= +57 s), and
// the non-holder terminal row releases the hold so a second ledger
// self-move is admitted. GREEN after the cure: engaged at +14, later dependents refused
// operation_ledger_self_move_in_flight, SENDING by +32 s, exactly one
// non-terminal ledger self-move, census re-read within 2 x
// DISPATCH_RETRY_DELAY_MS, READY inside 60 s.
//
// HONEST SCOPE: real seed + target coordinators/owners/interlock/startup
// authority as in the engagement fixture; MODELED: node READY leases and
// the recovery-pending readiness snapshot (readiness owner), handler
// acknowledgement/activation latencies, the seed ledger's point-read answers
// at +41 and the reservation rows the reconcile sweeps.

const CPP_DISPATCH_ACK_LATENCY_MS = 20_500;
const CENSUS_READ_FAILS_AT_MS = 29_800;
const CENSUS_READ_FAILURE_RETRY_HINT_MS = 12_300;
const RESERVATION_RECONCILE_AT_MS = 26_000;
const EXEMPT_REPLAN_AFTER_COMPLETION_MS = 500;
const SELF_MOVE_SENDING_BOUND_MS = 32_000;
const CENSUS_RETRY_CADENCE_MULTIPLIER = 2;
const LEDGER_SELF_MOVE_SAMPLE_INTERVAL_MS = 100;
const RESERVATION_ESTIMATED_BYTES = 1;
const UNBOUNDED_RETRY_HINT_MS = Number.MAX_SAFE_INTEGER;
const SINGLE_ROW = 1;
const NO_SELF_MOVES = 0;
const LOCAL_STR_FUNCTION = 'function';
const RESERVATION_ID_PREFIX = 'res-';
const CENSUS_PRESSURE_MESSAGE =
  'In-flight operation owner query indicates control-plane pressure';
const REPLICA_OPERATIONS_TABLE_MARKER = SYSTEM_TABLE_NAME.REPLICA_OPERATIONS;
const STORAGE_RESERVATIONS_TABLE_MARKER = SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS;
const POINT_READ_MARKER = 'operation_id = ?';
const ENTITY_READ_MARKER = 'entity_id = ?';
const RESERVATION_STATUS_MARKER = 'status = ?';
const RESERVATION_EXPIRY_MARKER = 'expires_at';

// The seed ledger's answer to the authoritative point read of the held
// self-move during the injected sequence: EMPTY for every reader (the null
// point read of run 23-51-32 — it releases the reservation as an orphan and
// prunes the seed's recent-intent memory of the self-move), and a positive
// terminal row of a DIFFERENT operation for the interlock's own lifecycle
// reads (the misattributed ledger read that released the hold).
// FAILED_READ serves the holder-release witness below: a point read that
// fails outright (the interlock's unresolved read).
const POINT_READ_ANSWER = Object.freeze({
  LEDGER: 'ledger',
  EMPTY: 'empty',
  FAILED_READ: 'failed_read',
  FOREIGN_TERMINAL_ROW: 'foreign_terminal_row',
});
const NO_INTERLOCK_READS = 0;
const SINGLE_INTERLOCK_READ = 1;
const WITNESS_READ_REFUSED_MESSAGE = 'ledger point read refused by the witness';

const CENSUS_OUTCOME = Object.freeze({
  READ: 'read',
  FAILED: 'failed',
});

const FAIRNESS_EVENT = Object.freeze({
  CENSUS_READ: 'census_read',
  RESERVATION_RECONCILED: 'reservation_reconciled',
  SECOND_SELF_MOVE_ADMITTED: 'second_self_move_admitted',
  SECOND_SELF_MOVE_REFUSED: 'second_self_move_refused',
});

const RECOVERY_PENDING_REASON_CODES = Object.freeze([
  CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
]);

// The readiness owner's snapshot of a READY node during formation: every
// dimension satisfied except controlPlaneRecoveryEligible, with the
// priority-recovery-pending reason codes, until the spread is satisfied
// (run 23-58-17: n3 join_ready 00:01:30.06 yet degraded until 02:00.9).
function buildRecoveryPendingNodeReadiness(nodeId, ready, {spreadSatisfied}) {
  const readiness = buildUniformNodeReadiness(nodeId, ready);
  if (!ready || spreadSatisfied) {
    return readiness;
  }
  readiness.dimensions[
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
  ] = false;
  readiness.reasons = RECOVERY_PENDING_REASON_CODES.map((code) => ({code}));
  return readiness;
}

function buildReservationRow(operationId, nowMs) {
  return {
    reservation_id: RESERVATION_ID_PREFIX + operationId,
    operation_id: operationId,
    status: RESERVATION_STATUS.ACTIVE,
    estimated_bytes: RESERVATION_ESTIMATED_BYTES,
    expires_at: nowMs,
  };
}

function countNonTerminalLedgerSelfMoves(trackedOperations) {
  return [...trackedOperations.values()].filter(
    (row) =>
      row.partition_id === LEDGER_PARTITION_ID &&
      isDisruptiveOperationLedgerSelfMove(row.type, row.partition_id) &&
      !isTerminalStep(row.type, row.workflow_step),
  ).length;
}

// Boundary injection: the target owner's cluster-wide idle census, observed
// per attempt; the first attempt at/after CENSUS_READ_FAILS_AT_MS fails with
// the repository's own retryable backoff derivation of the run's hint.
function observeTargetCensus({target, elapsed, record, extras}) {
  const repository = target.repository;
  const original = repository.queryClusterWideIncompleteOperations.bind(
    repository,
  );
  // The repository's own retryable-backoff bounds (floor: no hint; ceiling:
  // an unbounded hint), asserted unchanged by the budgets receipt.
  extras.census.backoffBounds = {
    floorMs: repository.getRetryableIncompleteOperationReadBackoffMs({}),
    ceilingMs: repository.getRetryableIncompleteOperationReadBackoffMs({
      retryAfterMs: UNBOUNDED_RETRY_HINT_MS,
    }),
  };
  let failureArmed = true;
  repository.queryClusterWideIncompleteOperations = async () => {
    const atMs = elapsed();
    if (failureArmed && atMs >= CENSUS_READ_FAILS_AT_MS) {
      failureArmed = false;
      const retryAfterMs = repository.getRetryableIncompleteOperationReadBackoffMs(
        {retryAfterMs: CENSUS_READ_FAILURE_RETRY_HINT_MS},
      );
      extras.census.attempts.push({
        atMs,
        outcome: CENSUS_OUTCOME.FAILED,
        retryAfterMs,
      });
      record(FAIRNESS_EVENT.CENSUS_READ, {
        outcome: CENSUS_OUTCOME.FAILED,
        retryAfterMs,
      });
      const error = new Error(CENSUS_PRESSURE_MESSAGE);
      error.retryAfterMs = retryAfterMs;
      throw error;
    }
    const rows = await original();
    extras.census.attempts.push({
      atMs,
      outcome: CENSUS_OUTCOME.READ,
      liveCount: rows.length,
    });
    record(FAIRNESS_EVENT.CENSUS_READ, {
      outcome: CENSUS_OUTCOME.READ,
      liveCount: rows.length,
    });
    return rows;
  };
}

// Boundary injection: one coordinator's ledger answers — the held
// self-move's point read (empty, failed, empty off the owner-local lane, or a
// positive terminal row of a DIFFERENT operation) and the reservation rows
// the reconcile sweeps. The fairness drive applies it to the seed for the
// +26 s sequence; the holder-release drive applies it to the target.
function injectLedgerAnswers({
  coordinator,
  timeSource,
  elapsed,
  selfMoveId,
  foreignRow,
}) {
  const gateway = coordinator.controlPlaneSystemTableGateway;
  const control = {
    pointReadAnswer: POINT_READ_ANSWER.LEDGER,
    reservationRowsVisible: false,
    interlockForeignRow: false,
    interlockReadDepth: NO_INTERLOCK_READS,
    // Every answered point read of the held self-move (evidence that the
    // injected answers reached their readers).
    pointReads: [],
    // Every lifecycle read the coordinator's interlock issued (operation id
    // and the hold action it resolved to).
    interlockReads: [],
  };
  // The interlock's lifecycle read (rebalance-coordinator-ledger-interlock-
  // hold-state.js resolveAuthoritativeLedgerSelfMoveHoldAction) is the reader
  // whose answer is the foreign terminal row.
  const originalHoldAction =
    coordinator.resolveAuthoritativeLedgerSelfMoveHoldAction.bind(coordinator);
  coordinator.resolveAuthoritativeLedgerSelfMoveHoldAction = async (
    operationId,
  ) => {
    control.interlockReadDepth += SINGLE_INTERLOCK_READ;
    try {
      const action = await originalHoldAction(operationId);
      control.interlockReads.push({atMs: elapsed(), operationId, action});
      return action;
    } finally {
      control.interlockReadDepth -= SINGLE_INTERLOCK_READ;
    }
  };
  const isSelfMovePointRead = (sql, params) =>
    String(sql).includes(REPLICA_OPERATIONS_TABLE_MARKER) &&
    String(sql).includes(POINT_READ_MARKER) &&
    params?.[0] === selfMoveId();
  // The seed's entity-scoped visibility read of the ledger partition's rows
  // (the recent-intent memory's miss re-check): empty alongside the point
  // read, as the seed's ledger reads were in run 23-51-32.
  const isLedgerEntityRead = (sql, params) =>
    String(sql).includes(REPLICA_OPERATIONS_TABLE_MARKER) &&
    String(sql).includes(ENTITY_READ_MARKER) &&
    params?.includes(LEDGER_PARTITION_ID);
  const isActiveReservationSweep = (sql) =>
    String(sql).includes(STORAGE_RESERVATIONS_TABLE_MARKER) &&
    String(sql).includes(RESERVATION_STATUS_MARKER) &&
    !String(sql).includes(RESERVATION_EXPIRY_MARKER) &&
    !String(sql).includes(POINT_READ_MARKER);
  for (const [method, sqlIndex] of [
    ['readAuthoritativeRows', 1],
    ['readRows', 1],
    ['executeQuery', 0],
  ]) {
    const original = gateway[method].bind(gateway);
    gateway[method] = async (...args) => {
      const sql = args[sqlIndex];
      const params = args[sqlIndex + SINGLE_ROW];
      if (isSelfMovePointRead(sql, params)) {
        if (
          control.interlockForeignRow &&
          control.interlockReadDepth > NO_INTERLOCK_READS
        ) {
          control.pointReads.push({
            atMs: elapsed(),
            answer: POINT_READ_ANSWER.FOREIGN_TERMINAL_ROW,
          });
          return {success: true, rows: [foreignRow()]};
        }
        if (control.pointReadAnswer === POINT_READ_ANSWER.EMPTY) {
          control.pointReads.push({atMs: elapsed(), answer: POINT_READ_ANSWER.EMPTY});
          return {success: true, rows: []};
        }
        if (control.pointReadAnswer === POINT_READ_ANSWER.FAILED_READ) {
          control.pointReads.push({
            atMs: elapsed(),
            answer: POINT_READ_ANSWER.FAILED_READ,
          });
          return {success: false, error: WITNESS_READ_REFUSED_MESSAGE};
        }
      }
      if (
        control.pointReadAnswer === POINT_READ_ANSWER.EMPTY &&
        isLedgerEntityRead(sql, params)
      ) {
        return {success: true, rows: []};
      }
      if (control.reservationRowsVisible && isActiveReservationSweep(sql)) {
        return {
          success: true,
          rows: [buildReservationRow(selfMoveId(), timeSource.now())],
        };
      }
      return original(...args);
    };
  }
  return control;
}

function scheduleFairnessExtras(context, {withDuplicateSelfMoveInjection}) {
  const {
    timeSource,
    elapsed,
    record,
    seed,
    target,
    state,
    trackedOperations,
    publicationRow,
    holderPhase,
  } = context;
  const extras = state.extras;
  extras.census = {attempts: []};
  extras.reconcile = null;
  extras.secondSelfMove = {
    attemptedAtMs: null,
    admittedAtMs: null,
    operationId: null,
    refusals: [],
    resolved: false,
    holderPhaseAfter: null,
  };
  extras.maxNonTerminalLedgerSelfMoves = NO_SELF_MOVES;
  extras.targetReadinessAtEngagement = null;
  observeTargetCensus({target, elapsed, record, extras});
  // The target's readiness snapshot as the seed's interlock reads it at the
  // READY-lease instant (the readiness owner surface both consult).
  timeSource.setTimeout(() => {
    extras.targetReadinessAtEngagement =
      seed.controlPlaneReadinessService.getNodeReadinessSync(JOINER_1_NODE_ID, {
        decisionDimension:
          seed.resolveOperationReadinessDecisionDimension(LEDGER_PARTITION_ID),
      });
  }, TARGET_READY_AT_MS);
  const selfMoveId = () => state.selfMove?.operationId || null;
  const ledgerAnswers = injectLedgerAnswers({
    coordinator: seed,
    timeSource,
    elapsed,
    selfMoveId,
    // A positive terminal row of another operation (the first dependent's
    // completed spread ADD) — the misattributed answer of a lagging read.
    foreignRow: () =>
      [...trackedOperations.values()].find(
        (row) =>
          row.partition_id !== LEDGER_PARTITION_ID &&
          isTerminalStep(row.type, row.workflow_step),
      ),
  });

  const sampleLedgerSelfMoves = () => {
    extras.maxNonTerminalLedgerSelfMoves = Math.max(
      extras.maxNonTerminalLedgerSelfMoves,
      countNonTerminalLedgerSelfMoves(trackedOperations),
    );
    timeSource.setTimeout(sampleLedgerSelfMoves, LEDGER_SELF_MOVE_SAMPLE_INTERVAL_MS);
  };
  sampleLedgerSelfMoves();

  const attemptSecondSelfMove = async () => {
    extras.secondSelfMove.attemptedAtMs = elapsed();
    try {
      const operation = await seed.createOperation(
        buildMove({
          publicationEpoch: publicationRow().publication_epoch,
          type: OperationType.REPLACE,
          tableId: LEDGER_TABLE_ID,
          targetNodeId: JOINER_4_NODE_ID,
          replicaIndex: LEADER_REPLICA_INDEX,
        }),
      );
      extras.secondSelfMove.admittedAtMs = elapsed();
      extras.secondSelfMove.operationId = operation.operationId;
      record(FAIRNESS_EVENT.SECOND_SELF_MOVE_ADMITTED, {
        holderPhase: holderPhase(),
      });
    } catch (error) {
      if (!isTypedRetryableSkip(error)) {
        throw error;
      }
      extras.secondSelfMove.refusals.push({
        atMs: elapsed(),
        reason: skipReasonOf(error),
      });
      record(FAIRNESS_EVENT.SECOND_SELF_MOVE_REFUSED, {
        reason: skipReasonOf(error),
        holderPhase: holderPhase(),
      });
    }
  };
  const runInjectedSequence = async () => {
    ledgerAnswers.pointReadAnswer = POINT_READ_ANSWER.EMPTY;
    ledgerAnswers.reservationRowsVisible = true;
    const reconcile = await seed.reconcileReservations();
    ledgerAnswers.reservationRowsVisible = false;
    extras.reconcile = {
      atMs: elapsed(),
      orphansReleased: reconcile.orphansReleased,
      expired: reconcile.expired,
      holderPhase: holderPhase(),
    };
    record(FAIRNESS_EVENT.RESERVATION_RECONCILED, extras.reconcile);
    ledgerAnswers.interlockForeignRow = true;
    try {
      await attemptSecondSelfMove();
    } finally {
      ledgerAnswers.pointReadAnswer = POINT_READ_ANSWER.LEDGER;
      ledgerAnswers.interlockForeignRow = false;
      extras.secondSelfMove.resolved = true;
      extras.secondSelfMove.holderPhaseAfter = holderPhase();
      extras.selfMoveOperationId = selfMoveId();
      extras.pointReads = ledgerAnswers.pointReads;
      extras.ledgerSelfMoveRowsAfterInjection = [...trackedOperations.values()]
        .filter((row) => row.partition_id === LEDGER_PARTITION_ID)
        .map((row) => ({
          id: row.operation_id,
          type: row.type,
          step: row.workflow_step,
          target: row.target_node_id,
        }));
    }
  };
  if (!withDuplicateSelfMoveInjection) {
    extras.secondSelfMove.resolved = true;
    return;
  }
  timeSource.setTimeout(() => {
    runInjectedSequence().catch((error) => {
      extras.secondSelfMove.resolved = true;
      record(FAIRNESS_EVENT.SECOND_SELF_MOVE_REFUSED, {error: error.message});
    });
  }, RESERVATION_RECONCILE_AT_MS);
}

function isFairnessScenarioDone({state, exempt, dependentsSpread}) {
  return (
    state.startupAuthorityReadyAtMs !== null &&
    state.selfMoveTerminalAtMs !== null &&
    state.extras.secondSelfMove?.resolved === true &&
    exempt.secondRound?.attemptedAtMs !== null &&
    exempt.secondRound?.attemptedAtMs !== undefined &&
    dependentsSpread()
  );
}

// The +26 s duplicate-self-move injection is optional so the preservation
// receipts (exclusion, IDLE_ONLY, budgets) observe the fairness drive on
// HEAD too: on HEAD the injected second self-move is admitted and, as a
// registered disruptive contender, parks the first self-move's IDLE_ONLY
// census forever — the deadlock a duplicate ledger self-move causes.
function buildFairnessScenarioProfile({withDuplicateSelfMoveInjection}) {
  return Object.freeze({
    ...DEFAULT_SCENARIO_PROFILE,
    ledgerThirdReplicaNodeId: JOINER_3_NODE_ID,
    dispatchAckLatencyMsByTableId: Object.freeze({
      [EXEMPT_TABLE_ID]: CPP_DISPATCH_ACK_LATENCY_MS,
    }),
    buildNodeReadiness: buildRecoveryPendingNodeReadiness,
    exemptSecondRound: Object.freeze({
      targetNodeId: JOINER_4_NODE_ID,
      plannedAfterCompletionMs: EXEMPT_REPLAN_AFTER_COMPLETION_MS,
    }),
    placementFollowsSelfMoveActive: true,
    ledgerSpreadAddOnTerminal: false,
    scheduleExtras: (context) =>
      scheduleFairnessExtras(context, {withDuplicateSelfMoveInjection}),
    isDone: isFairnessScenarioDone,
  });
}

async function runDependentsStreamAfterRegistrationScenario({
  withDuplicateSelfMoveInjection = true,
} = {}) {
  return runSelfMovePlannedBeforeAddsScenario(
    buildFairnessScenarioProfile({withDuplicateSelfMoveInjection}),
  );
}


// ---------------------------------------------------------------------------
// Holder-release witness (quest operation-ledger-self-move-holder-release-on-
// engagement; GCP run 2026-08-30T04-49-12, forensics barrier-not-released.md).
// On the DISPATCHING node the interlock's HELD_BY_OTHER was a memory, never a
// read: the drain-failed REPLACE 691efb46 (fail_priority_recovery_drain_stale
// 04:52:48.6, authoritative row FAILED) had its stale claim attempt engage the
// target's hold at 04:52:55.8 (claim refused, holder id retained by the
// disengage), and the re-planned successor 4f30c060 parked
// `hold not engaged: held_by_other` 41 times 04:52:57.4-04:53:45.7 until
// teardown while the cluster-wide census correctly ignored the terminal 691.
// The dispatch-only target never runs the planner's admission lane, the one
// lane that read the holder's row.
//
// Scenario `failed-holder-does-not-starve-successor` (forensics section 4;
// offsets from the predecessor's creation, virtual clock):
//   t+0      seed creates REPLACE A replica_operations-p1 seed -> n1 (r2;
//            the run's r3 sits on joiner-3 in this placement).
//   t+3.5 s  the priority ADDs plan (control_plane_publications + the four
//            dependents); the cpp incumbent acknowledges after 24.0 s and
//            activates 6 s later (+33.5 s: the run's two back-to-back cpp
//            ADDs kept the target's census busy until 04:52:53.9 = +38.9 s;
//            section 4 places A's claim attempt at t+34 s).
//   t+14 s   n1 READY; n1's real owner parks A at the census behind the
//            incumbents (`waiting for incumbent operation`).
//   t+31 s   the target's priority-recovery drain settles A
//            fail_priority_recovery_drain_stale (age >= PENDING_TIMEOUT_MS
//            30 s; run: 33.6 s): the real owner failOperation with the
//            drain's message, exactly recovery-drain.js's settle.
//   t+34 s   A's retained PENDING dispatch snapshot is re-driven (the run's
//            claim attempt 7.2 s after the FAILED row): the census is idle,
//            the hold ENGAGES for A, the compare-and-set is refused against
//            the FAILED row (`control_plane_pressure_degraded while claiming
//            priority dispatch transition`, the run's message) -> the claim
//            does not commit -> the disengage keeps A as the holder
//            (REGISTERED).
//   t+36 s   seed re-plans the same REPLACE: the intent identity collides
//            with A's terminal row and derives successor B (same partition,
//            same target); n1 drives B's dispatch.
// RED on HEAD: B parks held_by_other on every attempt (DISPATCH_RETRY_DELAY_MS
// cadence) until the 60 s window ends; no lifecycle read of A on the target.
// GREEN: B's first engagement resolves A through exactly one lifecycle read
// (RELEASE_HOLDER), engages, claims SENDING at +36 s, ACTIVE at +59.6 s, the
// spread is satisfied inside the 60 s window.
//
// Scenario `claim-refused-then-local-settlement` (same drive; the claim
// refusal and the settlement are ordered as the run's message reads them):
// from +33.5 s A's claim compare-and-set is refused under pressure (the
// UPDATE lands zero rows against an unchanged PENDING row: A stays the
// retained holder, PENDING and live); at +35 s the target's engagement point
// is probed with a candidate self-move against a live PENDING holder, an
// empty read, a failed read, a foreign terminal row, the holder's age
// (>= PENDING_TIMEOUT_MS) and an orphan reservation reconcile — every probe
// must refuse (HELD_BY_OTHER) and keep A; at +35.5 s the target's drain
// settles A locally (the real failOperation): RED keeps A registered, GREEN
// clears the registration at the commit; B is planned at +36 s and claims on
// its first attempt without any lifecycle read.
//
// Scenario `live-sending-holder-refuses` (the fairness drive without the
// +26 s duplicate injection): at +40 s A is SENDING on the target (claimed
// +30.x, acknowledged +44.x) and the engagement point is probed with a
// candidate self-move -> HELD_BY_OTHER, A retained (green before and after).
//
// HONEST SCOPE: as the fairness drive (real seed + target coordinators,
// owners, interlock, startup authority); MODELED: the drain's settle instant
// (its real terminal transition is executed), the stale dispatch snapshot
// re-drive, the claim pressure of the second scenario (a zero-row
// compare-and-set), the probe candidate and the target ledger's injected
// point-read answers.

const HOLDER_RELEASE_CPP_DISPATCH_ACK_LATENCY_MS = 24_000;
const DRAIN_SETTLES_HOLDER_AT_MS = 31_000;
const STALE_CLAIM_REDRIVE_AT_MS = 34_000;
const SUCCESSOR_PLANNED_AT_MS = 36_000;
const HOLDER_PROBES_AT_MS = 35_000;
const LOCAL_SETTLEMENT_AT_MS = 35_500;
const LIVE_SENDING_PROBE_AT_MS = 40_000;
const PROBE_CANDIDATE_OPERATION_ID = 'holder-release-probe-self-move';
// operation-workflow-dispatch-ledger-self-move-gate.js park message prefix
// of an engagement that did not engage (module-local there).
const HOLD_NOT_ENGAGED_MESSAGE_PREFIX =
  'operation-ledger self-move hold not engaged: ';
const UPDATE_STATEMENT_MARKER = 'UPDATE replica_operations';
const EXPECTED_STEP_PREDICATE_MARKER = 'AND workflow_step = ?';
const UPDATE_OPERATION_ID_PARAM_INDEX = 7;
const ZERO_ROWS_CHANGED = 0;

const {FAILURE_LOG_LEVEL, OPERATION_WORKFLOW_OWNER_LITERAL} =
  OPERATION_WORKFLOW_OWNER_SHARED;

// How the predecessor's terminal row comes to exist relative to its claim.
const HOLDER_SETTLEMENT = Object.freeze({
  DRAIN_ROW_BEFORE_CLAIM: 'drain_row_before_claim',
  LOCAL_SETTLEMENT_AFTER_CLAIM_REFUSED: 'local_settlement_after_claim_refused',
});

const HOLDER_PROBE = Object.freeze({
  LIVE_PENDING_HOLDER: 'live_pending_holder',
  LIVE_SENDING_HOLDER: 'live_sending_holder',
  EMPTY_READ: 'empty_read',
  FAILED_READ: 'failed_read',
  FOREIGN_TERMINAL_ROW: 'foreign_terminal_row',
  RESERVATION_RECONCILE: 'reservation_reconcile',
});

const HOLDER_RELEASE_EVENT = Object.freeze({
  PREDECESSOR_DRAIN_SETTLED: 'predecessor_drain_settled',
  PREDECESSOR_STALE_CLAIM: 'predecessor_stale_claim',
  PREDECESSOR_LOCAL_SETTLEMENT: 'predecessor_local_settlement',
  SUCCESSOR_PLANNED: 'successor_planned',
  SUCCESSOR_REFUSED: 'successor_refused',
  SUCCESSOR_DISPATCH_PARKED: 'successor_dispatch_parked',
  HOLD_ENGAGEMENT: 'hold_engagement',
  HOLDER_PROBE: 'holder_probe',
});

function snapshotHolder(coordinator) {
  const state = coordinator.getOperationLedgerInterlockAdmissionState();
  return {
    operationId: state.heldSelfMoveOperationId,
    phase: state.heldSelfMovePhase,
  };
}

// Real-owner observation: every engagement of the target's interlock hold
// (the owner port the dispatch claim calls), sync or async as the owner
// under test returns it — the wrapper never changes its shape.
function observeTargetEngagements({target, elapsed, record, ledgerAnswers, extras}) {
  const original = target.engageOperationLedgerSelfMoveHold.bind(target);
  target.engageOperationLedgerSelfMoveHold = (operation) => {
    const attempt = {
      atMs: elapsed(),
      operationId: operation?.operationId || null,
      holderBefore: snapshotHolder(target),
      interlockReadsBefore: ledgerAnswers.interlockReads.length,
    };
    const settle = (engagement) => {
      attempt.engagement = engagement;
      attempt.holderAfter = snapshotHolder(target);
      attempt.interlockReads = ledgerAnswers.interlockReads.slice(
        attempt.interlockReadsBefore,
      );
      extras.engagements.push(attempt);
      record(HOLDER_RELEASE_EVENT.HOLD_ENGAGEMENT, {
        operationId: attempt.operationId,
        engagement,
        holderAfter: attempt.holderAfter,
      });
      return engagement;
    };
    const outcome = original(operation);
    return typeof outcome?.then === LOCAL_STR_FUNCTION ?
      outcome.then(settle) :
      settle(outcome);
  };
}

// Boundary injection: while armed, the predecessor's PENDING -> SENDING
// compare-and-set lands zero rows against an unchanged PENDING row (the
// pressure ambiguity the claim re-arms through the dispatch retry lane).
function injectClaimWriteRefusal({target, selfMoveId, extras}) {
  const gateway = target.controlPlaneSystemTableGateway;
  const original = gateway.executeQuery.bind(gateway);
  const control = {armed: false};
  gateway.executeQuery = async (sql, params, ...rest) => {
    if (
      control.armed &&
      String(sql).includes(UPDATE_STATEMENT_MARKER) &&
      String(sql).includes(EXPECTED_STEP_PREDICATE_MARKER) &&
      params?.[UPDATE_OPERATION_ID_PARAM_INDEX] === selfMoveId()
    ) {
      extras.refusedClaimWrites += SINGLE_ROW;
      return {success: true, changes: ZERO_ROWS_CHANGED};
    }
    return original(sql, params, ...rest);
  };
  return control;
}

function buildProbeCandidate() {
  return {
    operationId: PROBE_CANDIDATE_OPERATION_ID,
    type: OperationType.REPLACE,
    partitionId: LEDGER_PARTITION_ID,
    targetNodeId: JOINER_1_NODE_ID,
    workflowStep: WORKFLOW_STEP.PENDING,
  };
}

function scheduleHolderReleaseExtras(context, {settlement}) {
  const {timeSource, elapsed, record, seed, target, state, trackedOperations,
    publicationRow} = context;
  const extras = state.extras;
  extras.census = {attempts: []};
  extras.settlement = settlement;
  extras.engagements = [];
  extras.probes = [];
  extras.refusedClaimWrites = NO_INTERLOCK_READS;
  extras.drainSettlement = null;
  extras.staleClaim = null;
  extras.localSettlement = null;
  extras.successor = {
    plannedAtMs: null,
    createdAtMs: null,
    operationId: null,
    refusals: [],
    parks: [],
  };
  extras.pendingTimeoutMs = target.config.pendingTimeoutMs;
  observeTargetCensus({target, elapsed, record, extras});
  const selfMoveId = () => state.selfMove?.operationId || null;
  const rowOf = (operationId) => trackedOperations.get(operationId) || null;
  const ledgerAnswers = injectLedgerAnswers({
    coordinator: target,
    timeSource,
    elapsed,
    selfMoveId,
    foreignRow: () =>
      [...trackedOperations.values()].find(
        (row) =>
          row.partition_id !== LEDGER_PARTITION_ID &&
          isTerminalStep(row.type, row.workflow_step),
      ),
  });
  extras.interlockReads = ledgerAnswers.interlockReads;
  extras.pointReads = ledgerAnswers.pointReads;
  observeTargetEngagements({target, elapsed, record, ledgerAnswers, extras});
  const claimWriteRefusal = injectClaimWriteRefusal({target, selfMoveId, extras});
  const originalPark = target.workflowOwner.parkOperationLedgerSelfMoveDispatch
    .bind(target.workflowOwner);
  target.workflowOwner.parkOperationLedgerSelfMoveDispatch = (
    operation,
    reason,
    errorMessage,
    ...rest
  ) => {
    if (operation?.operationId === extras.successor.operationId) {
      extras.successor.parks.push({atMs: elapsed(), reason, errorMessage});
      record(HOLDER_RELEASE_EVENT.SUCCESSOR_DISPATCH_PARKED, {
        reason,
        errorMessage,
      });
    }
    return originalPark(operation, reason, errorMessage, ...rest);
  };

  // The drain's settle of the predecessor: the real owner terminal
  // transition on the target with the drain's message
  // (operation-workflow-recovery-drain.js, FAIL_PRIORITY_RECOVERY_DRAIN_STALE).
  const settlePredecessorAsDrainStale = async () =>
    target.failOperation(
      target.repository.rowToOperation(rowOf(selfMoveId())),
      OPERATION_WORKFLOW_OWNER_LITERAL
        .PRIORITY_RECOVERY_DRAIN_STALE_WITHOUT_RETIREMENT_EVIDENCE,
      {logLevel: FAILURE_LOG_LEVEL.WARN},
    );
  const describeRow = (operationId) => {
    const row = rowOf(operationId);
    return row ? {step: row.workflow_step, status: row.status} : null;
  };

  const runDrainRowBeforeClaim = () => {
    let staleSnapshot = null;
    timeSource.setTimeout(() => {
      staleSnapshot = target.repository.rowToOperation({...rowOf(selfMoveId())});
      settlePredecessorAsDrainStale().then((outcome) => {
        extras.drainSettlement = {
          atMs: elapsed(),
          ageMs: elapsed(),
          committed: outcome?.committed === true,
          disposition: outcome?.disposition || null,
          row: describeRow(selfMoveId()),
          targetHolder: snapshotHolder(target),
        };
        record(HOLDER_RELEASE_EVENT.PREDECESSOR_DRAIN_SETTLED, extras.drainSettlement);
      });
    }, DRAIN_SETTLES_HOLDER_AT_MS);
    timeSource.setTimeout(() => {
      const holderBefore = snapshotHolder(target);
      target.dispatchOperation(staleSnapshot).then((result) => {
        extras.staleClaim = {
          atMs: elapsed(),
          holderBefore,
          holderAfter: snapshotHolder(target),
          skipReason: result?.skipReason || result?.reason || null,
          error: result?.error || null,
          row: describeRow(selfMoveId()),
        };
        record(HOLDER_RELEASE_EVENT.PREDECESSOR_STALE_CLAIM, extras.staleClaim);
      });
    }, STALE_CLAIM_REDRIVE_AT_MS);
  };

  const probeEngagement = async (probe, configure) => {
    const holderBefore = snapshotHolder(target);
    const readsBefore = ledgerAnswers.interlockReads.length;
    configure();
    let engagement = null;
    let reconcile = null;
    try {
      if (probe === HOLDER_PROBE.RESERVATION_RECONCILE) {
        reconcile = await target.reconcileReservations();
      } else {
        engagement = await target.engageOperationLedgerSelfMoveHold(
          buildProbeCandidate(),
        );
      }
    } finally {
      ledgerAnswers.pointReadAnswer = POINT_READ_ANSWER.LEDGER;
      ledgerAnswers.interlockForeignRow = false;
      ledgerAnswers.reservationRowsVisible = false;
    }
    const observation = {
      probe,
      atMs: elapsed(),
      engagement,
      orphansReleased: reconcile?.orphansReleased ?? null,
      holderBefore,
      holderAfter: snapshotHolder(target),
      holderRow: describeRow(holderBefore.operationId),
      holderAgeMs: elapsed(),
      interlockReads: ledgerAnswers.interlockReads.slice(readsBefore),
    };
    extras.probes.push(observation);
    record(HOLDER_RELEASE_EVENT.HOLDER_PROBE, {
      probe,
      engagement,
      holderAfter: observation.holderAfter,
    });
  };
  const runHolderProbes = async () => {
    await probeEngagement(HOLDER_PROBE.LIVE_PENDING_HOLDER, () => {});
    await probeEngagement(HOLDER_PROBE.EMPTY_READ, () => {
      ledgerAnswers.pointReadAnswer = POINT_READ_ANSWER.EMPTY;
    });
    await probeEngagement(HOLDER_PROBE.FAILED_READ, () => {
      ledgerAnswers.pointReadAnswer = POINT_READ_ANSWER.FAILED_READ;
    });
    await probeEngagement(HOLDER_PROBE.FOREIGN_TERMINAL_ROW, () => {
      ledgerAnswers.interlockForeignRow = true;
    });
    await probeEngagement(HOLDER_PROBE.RESERVATION_RECONCILE, () => {
      ledgerAnswers.pointReadAnswer = POINT_READ_ANSWER.EMPTY;
      ledgerAnswers.reservationRowsVisible = true;
    });
  };
  const runLocalSettlementAfterClaimRefused = () => {
    claimWriteRefusal.armed = true;
    timeSource.setTimeout(() => {
      runHolderProbes().catch((error) => {
        record(HOLDER_RELEASE_EVENT.HOLDER_PROBE, {error: error.message});
      });
    }, HOLDER_PROBES_AT_MS);
    timeSource.setTimeout(() => {
      claimWriteRefusal.armed = false;
      const holderBefore = snapshotHolder(target);
      settlePredecessorAsDrainStale().then((outcome) => {
        extras.localSettlement = {
          atMs: elapsed(),
          ageMs: elapsed(),
          committed: outcome?.committed === true,
          disposition: outcome?.disposition || null,
          row: describeRow(selfMoveId()),
          holderBefore,
          holderAfter: snapshotHolder(target),
        };
        record(
          HOLDER_RELEASE_EVENT.PREDECESSOR_LOCAL_SETTLEMENT,
          extras.localSettlement,
        );
      });
    }, LOCAL_SETTLEMENT_AT_MS);
  };

  // The seed's re-plan of the same REPLACE intent: A's terminal row collides
  // with the identity and the successor B is derived; n1 drives B's dispatch
  // (the readiness capture admits the row to the owner).
  const planSuccessor = async () => {
    extras.successor.plannedAtMs = elapsed();
    try {
      const operation = await seed.createOperation(
        buildMove({
          publicationEpoch: publicationRow().publication_epoch,
          type: OperationType.REPLACE,
          tableId: LEDGER_TABLE_ID,
          targetNodeId: JOINER_1_NODE_ID,
          replicaIndex: MOVED_REPLICA_INDEX,
        }),
      );
      extras.successor.createdAtMs = elapsed();
      extras.successor.operationId = operation.operationId;
      state.successorSelfMoveId = operation.operationId;
      record(HOLDER_RELEASE_EVENT.SUCCESSOR_PLANNED, {
        distinctFromPredecessor: operation.operationId !== selfMoveId(),
      });
      target
        .dispatchOperation(target.repository.rowToOperation(rowOf(operation.operationId)))
        .catch((error) => {
          record(HOLDER_RELEASE_EVENT.SUCCESSOR_DISPATCH_PARKED, {error: error.message});
        });
    } catch (error) {
      if (!isTypedRetryableSkip(error)) {
        throw error;
      }
      extras.successor.refusals.push({atMs: elapsed(), reason: skipReasonOf(error)});
      record(HOLDER_RELEASE_EVENT.SUCCESSOR_REFUSED, {reason: skipReasonOf(error)});
    }
  };

  if (settlement === HOLDER_SETTLEMENT.DRAIN_ROW_BEFORE_CLAIM) {
    runDrainRowBeforeClaim();
  } else {
    runLocalSettlementAfterClaimRefused();
  }
  timeSource.setTimeout(() => {
    planSuccessor().catch((error) => {
      record(HOLDER_RELEASE_EVENT.SUCCESSOR_REFUSED, {error: error.message});
    });
  }, SUCCESSOR_PLANNED_AT_MS);
}

// Done when the successor reached terminal and the dependents' second spread
// round it released has been created (no create mid-flight at shutdown), or
// the 60 s certification window closed without the successor ever being sent
// (RED on HEAD).
function isHolderReleaseScenarioDone({state, dependentsSpread, elapsed}) {
  const successorId = state.extras.successor?.operationId || null;
  if (
    successorId !== null &&
    state.selfMoveTerminalAtMs !== null &&
    dependentsSpread()
  ) {
    return true;
  }
  return (
    elapsed() >= FORMATION_READINESS_BUDGET_MS &&
    state.selfMoveSentAtMs === null
  );
}

function buildHolderReleaseScenarioProfile({settlement}) {
  return Object.freeze({
    ...DEFAULT_SCENARIO_PROFILE,
    ledgerThirdReplicaNodeId: JOINER_3_NODE_ID,
    dispatchAckLatencyMsByTableId: Object.freeze({
      [EXEMPT_TABLE_ID]: HOLDER_RELEASE_CPP_DISPATCH_ACK_LATENCY_MS,
    }),
    buildNodeReadiness: buildRecoveryPendingNodeReadiness,
    exemptSecondRound: null,
    placementFollowsSelfMoveActive: true,
    ledgerSpreadAddOnTerminal: false,
    scheduleExtras: (context) =>
      scheduleHolderReleaseExtras(context, {settlement}),
    isDone: isHolderReleaseScenarioDone,
  });
}

async function runFailedHolderDoesNotStarveSuccessorScenario() {
  return runSelfMovePlannedBeforeAddsScenario(
    buildHolderReleaseScenarioProfile({
      settlement: HOLDER_SETTLEMENT.DRAIN_ROW_BEFORE_CLAIM,
    }),
  );
}

async function runClaimRefusedThenLocalSettlementScenario() {
  return runSelfMovePlannedBeforeAddsScenario(
    buildHolderReleaseScenarioProfile({
      settlement: HOLDER_SETTLEMENT.LOCAL_SETTLEMENT_AFTER_CLAIM_REFUSED,
    }),
  );
}

// The fairness drive (no duplicate injection) with one probe of the target's
// engagement point while its holder A is SENDING.
function scheduleLiveSendingProbeExtras(context) {
  scheduleFairnessExtras(context, {withDuplicateSelfMoveInjection: false});
  const {timeSource, elapsed, record, target, state, trackedOperations} = context;
  const extras = state.extras;
  extras.probes = [];
  const ledgerAnswers = injectLedgerAnswers({
    coordinator: target,
    timeSource,
    elapsed,
    selfMoveId: () => state.selfMove?.operationId || null,
    foreignRow: () => null,
  });
  timeSource.setTimeout(() => {
    const holderBefore = snapshotHolder(target);
    const readsBefore = ledgerAnswers.interlockReads.length;
    Promise.resolve(
      target.engageOperationLedgerSelfMoveHold(buildProbeCandidate()),
    ).then((engagement) => {
      const row = trackedOperations.get(holderBefore.operationId) || null;
      extras.probes.push({
        probe: HOLDER_PROBE.LIVE_SENDING_HOLDER,
        atMs: elapsed(),
        engagement,
        holderBefore,
        holderAfter: snapshotHolder(target),
        holderRow: row ? {step: row.workflow_step, status: row.status} : null,
        interlockReads: ledgerAnswers.interlockReads.slice(readsBefore),
      });
      record(HOLDER_RELEASE_EVENT.HOLDER_PROBE, {
        probe: HOLDER_PROBE.LIVE_SENDING_HOLDER,
        engagement,
      });
    });
  }, LIVE_SENDING_PROBE_AT_MS);
}

async function runLiveSendingHolderProbeScenario() {
  return runSelfMovePlannedBeforeAddsScenario(
    Object.freeze({
      ...buildFairnessScenarioProfile({withDuplicateSelfMoveInjection: false}),
      scheduleExtras: scheduleLiveSendingProbeExtras,
    }),
  );
}

// Assertion helpers shared by the fairness and holder-release witnesses:
// the dependents' refusals / admissions inside one window of the drive.
function refusalsWithin(dependents, fromMs, toMs) {
  return dependents.flatMap((dependent) =>
    dependent.refusals
      .filter((refusal) => refusal.atMs >= fromMs && refusal.atMs < toMs)
      .map((refusal) => ({tableId: dependent.tableId, ...refusal})),
  );
}

function admittedWithin(dependents, fromMs, toMs) {
  return dependents.flatMap((dependent) =>
    [dependent.firstRound, dependent.secondRound]
      .filter(
        (round) =>
          round.admittedAtMs !== null &&
          round.admittedAtMs >= fromMs &&
          round.admittedAtMs < toMs,
      )
      .map((round) => ({tableId: dependent.tableId, atMs: round.admittedAtMs})),
  );
}

export {
  CENSUS_OUTCOME,
  CENSUS_READ_FAILS_AT_MS,
  CENSUS_RETRY_CADENCE_MULTIPLIER,
  DRAIN_SETTLES_HOLDER_AT_MS,
  HOLDER_PROBE,
  HOLDER_SETTLEMENT,
  HOLD_NOT_ENGAGED_MESSAGE_PREFIX,
  LOCAL_SETTLEMENT_AT_MS,
  POINT_READ_ANSWER,
  SELF_MOVE_SENDING_BOUND_MS,
  STALE_CLAIM_REDRIVE_AT_MS,
  SUCCESSOR_PLANNED_AT_MS,
  admittedWithin,
  buildRecoveryPendingNodeReadiness,
  refusalsWithin,
  runClaimRefusedThenLocalSettlementScenario,
  runDependentsStreamAfterRegistrationScenario,
  runFailedHolderDoesNotStarveSuccessorScenario,
  runLiveSendingHolderProbeScenario,
  snapshotHolder,
};
