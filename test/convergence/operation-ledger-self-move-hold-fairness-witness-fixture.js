import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  isDisruptiveOperationLedgerSelfMove,
} from '../../src/rebalancer/replica-status.js';
import {isTerminalStep} from '../../src/rebalancer/replica-operation-progress.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {RESERVATION_STATUS} from '../../src/rebalancer/storage-capacity-constants.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  DEFAULT_SCENARIO_PROFILE,
  EXEMPT_TABLE_ID,
  JOINER_1_NODE_ID,
  JOINER_3_NODE_ID,
  JOINER_4_NODE_ID,
  LEADER_REPLICA_INDEX,
  LEDGER_PARTITION_ID,
  LEDGER_TABLE_ID,
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
const POINT_READ_ANSWER = Object.freeze({
  LEDGER: 'ledger',
  EMPTY: 'empty',
  FOREIGN_TERMINAL_ROW: 'foreign_terminal_row',
});
const NO_INTERLOCK_READS = 0;
const SINGLE_INTERLOCK_READ = 1;

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

// Boundary injection: the seed ledger's answers during the +41 s sequence —
// the held self-move's point read (empty, then a positive terminal row of a
// DIFFERENT operation) and the reservation rows the reconcile sweeps.
function injectSeedLedgerAnswers({
  seed,
  timeSource,
  elapsed,
  selfMoveId,
  foreignRow,
}) {
  const gateway = seed.controlPlaneSystemTableGateway;
  const control = {
    pointReadAnswer: POINT_READ_ANSWER.LEDGER,
    reservationRowsVisible: false,
    interlockForeignRow: false,
    interlockReadDepth: NO_INTERLOCK_READS,
    // Every answered point read of the held self-move (evidence that the
    // injected answers reached their readers).
    pointReads: [],
  };
  // The interlock's lifecycle read (rebalance-coordinator-ledger-interlock-
  // hold-state.js resolveAuthoritativeLedgerSelfMoveHoldAction) is the reader
  // whose answer is the foreign terminal row.
  const originalHoldAction =
    seed.resolveAuthoritativeLedgerSelfMoveHoldAction.bind(seed);
  seed.resolveAuthoritativeLedgerSelfMoveHoldAction = async (operationId) => {
    control.interlockReadDepth += SINGLE_INTERLOCK_READ;
    try {
      return await originalHoldAction(operationId);
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
  const ledgerAnswers = injectSeedLedgerAnswers({
    seed,
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

export {
  CENSUS_OUTCOME,
  CENSUS_READ_FAILS_AT_MS,
  CENSUS_RETRY_CADENCE_MULTIPLIER,
  SELF_MOVE_SENDING_BOUND_MS,
  runDependentsStreamAfterRegistrationScenario,
};
