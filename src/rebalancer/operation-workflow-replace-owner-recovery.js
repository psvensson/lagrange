/**
 * Owner contract:
 * Owner: the REPLACE owner's recovery vocabulary and its in-memory session
 * (quest replace-source-removal-owner, amendment-1 step 5: BR10, S9/D2
 * diagnostics, the P3 recovery contract).
 * Inputs: the operation's durable step and its entry time; the owner's
 * in-memory attempt and effect state; a fresh witness verdict and source row
 * observation supplied by the caller.
 * Canonical output:
 *  - REPLACE_OWNER_PHASE: the six phases of a partition REPLACE under its
 *    owner (Φ1-Φ6), classified from those inputs; the owner's bounded
 *    diagnostic reports it;
 *  - REPLACE_OWNER_RESTART_CLASS: what the recovery contract covers - what
 *    can discard in-memory state while the durable row survives;
 *  - the owner session: when the owner's in-memory state began, and whether
 *    an operation's attempt state may have been lost with an earlier session
 *    (its current step was entered before this session began). Such state is
 *    rebuilt once from the durable intent and a fresh read (BR10) - never
 *    assumed empty.
 * Prohibited: no decision; nothing here reads a row or the witness itself.
 */
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {resolveOperationCurrentStepEntry} from './operation-step-age.js';

const {WORKFLOW_STEP} = OPERATION_WORKFLOW_OWNER_SHARED;

const REPLACE_OWNER_PHASE = Object.freeze({
  // Φ1: ACTIVE, remove safety deferring.
  ACTIVE_DEFERRING: 'active_deferring',
  // Φ2: ACTIVE, a named-target handoff attempt unresolved.
  ACTIVE_ATTEMPT_UNRESOLVED: 'active_attempt_unresolved',
  // Φ3: STOPPING, the removal intent is durable and the source's row has not
  // retired (its removal effect not sent, or not yet visible).
  INTENT_EFFECT_PENDING: 'intent_effect_pending',
  // Φ4: STOPPING, the source's row reads REMOVING.
  SOURCE_ROW_RETIRING: 'source_row_retiring',
  // Φ5: STOPPING, the source's row is gone (or failed) and it is still a
  // committed voter.
  MEMBERSHIP_REMOVAL_UNCOMMITTED: 'membership_removal_uncommitted',
  // Φ6: STOPPING, the removal is committed and the terminal is unwritten.
  REMOVAL_COMMITTED_TERMINAL_UNWRITTEN: 'removal_committed_terminal_unwritten',
});

const REPLACE_OWNER_RESTART_CLASS = Object.freeze({
  // A new owner instance over the same durable rows.
  PROCESS_RESTART: 'process_restart',
  // The same coordinator shut down and initialized again: the owner's
  // in-memory state was released at shutdown.
  COORDINATOR_REINIT: 'coordinator_reinit',
  // The witness replica's raft runtime or group rebuilt: the owner keeps its
  // state; a proposal the witness had not forwarded may be lost, which the
  // R-1f level re-drive and backstop recover.
  WITNESS_RUNTIME_REBUILD: 'witness_runtime_rebuild',
});

// How a waiting REPLACE's staleness is classified (A6/A5): never by the age
// of its step; only a failure-detector FAILED target ends its hold.
const REPLACE_OWNER_STALENESS_CLASS = Object.freeze({
  NEVER_STALE_BY_AGE: 'never_stale_by_age',
  TARGET_FAILED: 'target_failed',
});

// A diagnostic's attempt that was issued in this owner session.
const REPLACE_ATTEMPT_NOT_REBUILT = 'not_rebuilt';

// Outside the owner phases (before ACTIVE, or terminal).
const REPLACE_NOT_IN_OWNER_PHASE = 'not_in_owner_phase';

// The answer of claimReplaceAttemptStateRebuild when nothing is to rebuild.
const REPLACE_ATTEMPT_STATE_REBUILD_NOT_DUE = Object.freeze({due: false});

// How the source replica's lifecycle row reads to the phase classification.
const REPLACE_SOURCE_ROW_CLASS = Object.freeze({
  ADMISSIBLE: 'admissible',
  RETIRING: 'retiring',
  GONE: 'gone',
  UNKNOWN: 'unknown',
});

/**
 * @param {Object} inputs
 * @param {string} inputs.workflowStep
 * @param {boolean} inputs.handoffAttemptUnresolved
 * @param {boolean} inputs.sourceRetired - The fresh R-1a verdict is
 *   SOURCE_RETIRED.
 * @param {string} inputs.sourceRowClass - REPLACE_SOURCE_ROW_CLASS.
 * @return {string} A REPLACE_OWNER_PHASE member, or
 *   REPLACE_NOT_IN_OWNER_PHASE.
 */
function classifyReplaceOwnerPhase(inputs) {
  if (inputs.workflowStep === WORKFLOW_STEP.ACTIVE) {
    return inputs.handoffAttemptUnresolved ?
      REPLACE_OWNER_PHASE.ACTIVE_ATTEMPT_UNRESOLVED :
      REPLACE_OWNER_PHASE.ACTIVE_DEFERRING;
  }
  if (inputs.workflowStep !== WORKFLOW_STEP.STOPPING) {
    return REPLACE_NOT_IN_OWNER_PHASE;
  }
  if (inputs.sourceRetired) {
    return REPLACE_OWNER_PHASE.REMOVAL_COMMITTED_TERMINAL_UNWRITTEN;
  }
  if (inputs.sourceRowClass === REPLACE_SOURCE_ROW_CLASS.GONE) {
    return REPLACE_OWNER_PHASE.MEMBERSHIP_REMOVAL_UNCOMMITTED;
  }
  return inputs.sourceRowClass === REPLACE_SOURCE_ROW_CLASS.RETIRING ?
    REPLACE_OWNER_PHASE.SOURCE_ROW_RETIRING :
    REPLACE_OWNER_PHASE.INTENT_EFFECT_PENDING;
}

const SESSION_BY_OWNER = new WeakMap();

// The session clock is the owner's timeout-check clock (its injected
// TimeSource when one is present, else Date.now()): the clock the durable
// step entries are stamped with, and the one a deterministic host drives.
function sessionClockNowMs(owner) {
  return typeof owner?.resolveTimeoutCheckNowMs === 'function' ?
    owner.resolveTimeoutCheckNowMs() : Date.now();
}

/**
 * Begin a new owner session: a new owner instance, or the owner's state
 * released at shutdown.
 * @param {Object} owner
 * @param {string} restartClass - REPLACE_OWNER_RESTART_CLASS.
 */
function startReplaceOwnerSession(owner, restartClass) {
  SESSION_BY_OWNER.set(owner, {
    startedAtMs: sessionClockNowMs(owner),
    restartClass,
    rebuiltOperationIds: new Set(),
  });
}

// When the operation entered its current step: its step entry, else its
// last durable update. Unknown answers NaN, which a rebuild treats as "may
// have been lost".
function stepEnteredAtMsOf(operation) {
  const entryAtMs = Number(resolveOperationCurrentStepEntry(operation)
    ?.timestamp);
  return Number.isFinite(entryAtMs) ? entryAtMs :
    Number(operation?.updatedAt ?? operation?.createdAt);
}

/**
 * Whether this operation's in-memory attempt state must be rebuilt now: its
 * current step did not provably begin within this owner session, and it has
 * not been rebuilt in this session yet. Due at most once per operation and
 * session.
 * @param {Object} owner
 * @param {Object} operation
 * @return {Object} Frozen {due, restartClass?}: restartClass is the class of
 *   the session that lost the state.
 */
function claimReplaceAttemptStateRebuild(owner, operation) {
  const session = SESSION_BY_OWNER.get(owner);
  const operationId = operation?.operationId;
  if (!session || !operationId ||
      session.rebuiltOperationIds.has(operationId)) {
    return REPLACE_ATTEMPT_STATE_REBUILD_NOT_DUE;
  }
  const enteredAtMs = stepEnteredAtMsOf(operation);
  if (Number.isFinite(enteredAtMs) && enteredAtMs >= session.startedAtMs) {
    return REPLACE_ATTEMPT_STATE_REBUILD_NOT_DUE;
  }
  session.rebuiltOperationIds.add(operationId);
  return Object.freeze({due: true, restartClass: session.restartClass});
}

/**
 * Drop an operation from the session's rebuild record (terminal).
 * @param {Object} owner
 * @param {string} operationId
 */
function releaseReplaceOwnerSessionOperation(owner, operationId) {
  SESSION_BY_OWNER.get(owner)?.rebuiltOperationIds.delete(operationId);
}

export {
  REPLACE_ATTEMPT_NOT_REBUILT,
  REPLACE_NOT_IN_OWNER_PHASE,
  REPLACE_OWNER_PHASE,
  REPLACE_OWNER_RESTART_CLASS,
  REPLACE_OWNER_STALENESS_CLASS,
  REPLACE_SOURCE_ROW_CLASS,
  claimReplaceAttemptStateRebuild,
  classifyReplaceOwnerPhase,
  releaseReplaceOwnerSessionOperation,
  startReplaceOwnerSession,
};
