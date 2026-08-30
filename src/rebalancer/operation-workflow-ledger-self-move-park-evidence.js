import {WORKFLOW_STEP} from '../constants/index.js';
import {isDisruptiveOperationLedgerSelfMove} from './replica-status.js';

// Owner-local progress evidence of a PENDING operation-ledger self-move parked
// by the workflow owner's dispatch gate
// (operation-workflow-dispatch-ledger-self-move-gate.js), consumed by the
// same owner's priority-recovery drain
// (operation-workflow-recovery-timeout.js
// resolvePriorityRecoveryOperationDrainStaleState).
//
// A ledger self-move is owned by its TARGET node and is dispatched only into
// an idle ledger (IDLE_ONLY at dispatch admissibility): while incumbents are
// live its owner's dispatch lane parks and re-reads the cluster-wide census
// on the dispatch-retry cadence. The PENDING row's step-entry timestamp never
// advances during that wait, so the drain's step-age rule read the wait as
// staleness and FAILED the parked self-move on its own node (GCP runs
// 2026-08-30T04-49-12 / 07-06-30: REPLACE b0b98821 parked behind the
// control_plane_publications learner ADDs, fail_priority_recovery_drain_stale
// at age 33.6 s / 39.8 s while local_owner, then a 15 s re-plan). A remote
// drain already treats an available owner as "wake, not kill"
// (operation-workflow-recovery-drain.js
// resolvePriorityRecoveryOperationDrainOwnerState); this evidence gives the
// LOCAL owner the same rule with a positive, time-bounded witness of its own
// lane's progress.
//
// Evidence is in-memory only (never the durable row), produced only by the
// owning node's dispatch gate, refreshed on every park, cleared when the
// self-move claims PENDING -> SENDING or reaches a terminal, and read
// against the owner's own clock (resolveTimeoutCheckNowMs, the clock the
// drain's staleness rule uses). Freshness is bounded by the PENDING step
// budget itself (getTimeoutForStep(PENDING) = PENDING_TIMEOUT_MS) measured
// from the LAST park instead of the step entry: a self-move whose lane has
// not parked for a full PENDING_TIMEOUT_MS is stale exactly as one that
// never parked. Liveness of the wait itself is owned by the census
// (findOperationLedgerSelfMoveConflict excludes incumbents past their own
// step budget), so a fresh park never means an unbounded hold.

// Typed reasons the dispatch gate parks a PENDING ledger self-move for.
//   WAITING_FOR_INCUMBENT   — the authoritative census found a live ledger
//                             writer (its ids are carried as incumbents).
//   WAITING_FOR_IDLE_LEDGER — the coordinator's engagement point refused the
//                             claim (NOT_IDLE / HELD_BY_OTHER).
const OPERATION_LEDGER_SELF_MOVE_PARK_KIND = Object.freeze({
  WAITING_FOR_INCUMBENT: 'waiting_for_incumbent',
  WAITING_FOR_IDLE_LEDGER: 'waiting_for_idle_ledger',
});

// Typed classification of the evidence at the drain's read instant.
//   NOT_APPLICABLE — not a PENDING disruptive ledger self-move.
//   ABSENT         — the owner's lane never parked this self-move (or the
//                    record was cleared by a claim / terminal).
//   FRESH          — the last park is younger than the freshness bound.
//   EXPIRED        — the last park is at least the freshness bound old.
const OPERATION_LEDGER_SELF_MOVE_PARK_EVIDENCE_STATE = Object.freeze({
  NOT_APPLICABLE: 'not_applicable',
  ABSENT: 'absent',
  FRESH: 'fresh',
  EXPIRED: 'expired',
});

const NO_AGE_MS = 0;
const NO_BOUND_MS = 0;

function normalizeOperationId(operation) {
  const operationId = operation?.operationId;
  return typeof operationId === 'string' && operationId.length > 0 ?
    operationId :
    null;
}

function isPendingOperationLedgerSelfMove(operation) {
  return (
    operation?.workflowStep === WORKFLOW_STEP.PENDING &&
    isDisruptiveOperationLedgerSelfMove(
      operation?.type,
      operation?.partitionId,
    )
  );
}

function resolveParkEvidenceStore(owner) {
  return owner?.operationLedgerSelfMoveParkEvidenceByOperationId instanceof
    Map ?
    owner.operationLedgerSelfMoveParkEvidenceByOperationId :
    null;
}

/**
 * The freshness bound: the PENDING step budget of this operation, read from
 * the owner's existing step-timeout policy (PENDING_TIMEOUT_MS), unchanged.
 * @param {Object} owner
 * @param {Object} operation
 * @return {number}
 */
function resolveOperationLedgerSelfMoveParkEvidenceFreshnessBoundMs(
  owner,
  operation,
) {
  const boundMs = Number(
    owner.getTimeoutForStep(WORKFLOW_STEP.PENDING, operation),
  );
  return Number.isFinite(boundMs) && boundMs > NO_BOUND_MS ?
    boundMs :
    NO_BOUND_MS;
}

/**
 * Record (or refresh) the owner's park evidence for a PENDING ledger
 * self-move. Called by the dispatch gate on every park; a non-self-move or
 * an owner without the store records nothing.
 * @param {Object} owner
 * @param {Object} operation
 * @param {string} kind OPERATION_LEDGER_SELF_MOVE_PARK_KIND member
 * @param {Array<string>} incumbentOperationIds
 * @return {Object|null} The recorded evidence, or null when not recorded.
 */
function recordOperationLedgerSelfMoveParkEvidence(
  owner,
  operation,
  kind,
  incumbentOperationIds,
) {
  const store = resolveParkEvidenceStore(owner);
  const operationId = normalizeOperationId(operation);
  if (
    !store ||
    operationId === null ||
    !isPendingOperationLedgerSelfMove(operation)
  ) {
    return null;
  }
  const evidence = Object.freeze({
    operationId,
    kind,
    incumbentOperationIds: Object.freeze(
      (Array.isArray(incumbentOperationIds) ? incumbentOperationIds : [])
        .filter((candidate) => typeof candidate === 'string')
        .slice(),
    ),
    parkedAtMs: owner.resolveTimeoutCheckNowMs(),
  });
  store.set(operationId, evidence);
  return evidence;
}

/**
 * Forget the park evidence of one operation (its claim committed, or its
 * terminal row is proven durable).
 * @param {Object} owner
 * @param {string|null} operationId
 * @return {void}
 */
function clearOperationLedgerSelfMoveParkEvidence(owner, operationId) {
  const store = resolveParkEvidenceStore(owner);
  if (!store || typeof operationId !== 'string') {
    return;
  }
  store.delete(operationId);
}

/**
 * Classify the owner's park evidence for an operation against the owner's
 * clock. The drain's staleness rule consults this: FRESH is progress, every
 * other state leaves the stale rules exactly as they are.
 * @param {Object} owner
 * @param {Object} operation
 * @param {number} [nowMs=owner.resolveTimeoutCheckNowMs()]
 * @return {{state: string, ageMs: number, boundMs: number,
 *   evidence: Object|null}}
 */
function classifyOperationLedgerSelfMoveParkEvidence(
  owner,
  operation,
  nowMs = owner.resolveTimeoutCheckNowMs(),
) {
  if (!isPendingOperationLedgerSelfMove(operation)) {
    return Object.freeze({
      state: OPERATION_LEDGER_SELF_MOVE_PARK_EVIDENCE_STATE.NOT_APPLICABLE,
      ageMs: NO_AGE_MS,
      boundMs: NO_BOUND_MS,
      evidence: null,
    });
  }
  const store = resolveParkEvidenceStore(owner);
  const evidence = store?.get(normalizeOperationId(operation)) || null;
  const boundMs = resolveOperationLedgerSelfMoveParkEvidenceFreshnessBoundMs(
    owner,
    operation,
  );
  if (!evidence) {
    return Object.freeze({
      state: OPERATION_LEDGER_SELF_MOVE_PARK_EVIDENCE_STATE.ABSENT,
      ageMs: NO_AGE_MS,
      boundMs,
      evidence: null,
    });
  }
  const ageMs = Math.max(NO_AGE_MS, Math.floor(nowMs - evidence.parkedAtMs));
  return Object.freeze({
    state:
      boundMs > NO_BOUND_MS && ageMs < boundMs ?
        OPERATION_LEDGER_SELF_MOVE_PARK_EVIDENCE_STATE.FRESH :
        OPERATION_LEDGER_SELF_MOVE_PARK_EVIDENCE_STATE.EXPIRED,
    ageMs,
    boundMs,
    evidence,
  });
}

function hasFreshOperationLedgerSelfMoveParkEvidence(owner, operation) {
  return (
    classifyOperationLedgerSelfMoveParkEvidence(owner, operation).state ===
    OPERATION_LEDGER_SELF_MOVE_PARK_EVIDENCE_STATE.FRESH
  );
}

export {
  OPERATION_LEDGER_SELF_MOVE_PARK_KIND,
  classifyOperationLedgerSelfMoveParkEvidence,
  clearOperationLedgerSelfMoveParkEvidence,
  hasFreshOperationLedgerSelfMoveParkEvidence,
  isPendingOperationLedgerSelfMove,
  recordOperationLedgerSelfMoveParkEvidence,
};
