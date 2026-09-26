/**
 * Owner contract:
 * Owner: the REPLACE owner's in-memory state and its bounded diagnostic
 * (quest replace-source-removal-owner; D2/S9): per owner instance, the R-1f
 * attempt, the recorded removal effect and the one diagnostic per operation;
 * the durable removal-intent entry's field names and its reader.
 * Inputs: the owner's clock; the operation's durable steps; what the owner's
 * decisions report.
 * Canonical output: the state records and the diagnostic (phase, source and
 * target, the wait reason and since when, the last attempt and whether its
 * outcome is uncertain, the leader, the source's membership, severity). Past
 * the former budgets only the severity rises; nothing is appended per retry.
 * Prohibited: no decision; no state change of an operation.
 */
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {replaceReplicaIdsOf} from './operation-workflow-replace-witness.js';
import {
  ReplicaOperationField,
  ReplicaOperationVisibilityClass,
} from './replica-operation-constants.js';
import {
  REPLACE_ATTEMPT_NOT_REBUILT,
  REPLACE_NOT_IN_OWNER_PHASE,
  REPLACE_OWNER_STALENESS_CLASS,
} from './operation-workflow-replace-owner-recovery.js';

const {REBALANCE_COORDINATOR_LOG_MSG} = OPERATION_WORKFLOW_OWNER_SHARED;

// Durable witness metadata on the STOPPING (removal-intent) step entry.
const REPLACE_INTENT_FIELD = Object.freeze({
  INTENT: 'replaceRemovalIntent',
  WITNESS_REPLICA_ID: 'replaceWitnessReplicaId',
  WITNESS_NODE_ID: 'replaceWitnessNodeId',
  WITNESS_COMMIT_INDEX: 'replaceWitnessCommitIndex',
  SOURCE_UNREACHABLE: 'replaceSourceUnreachable',
});

const REPLACE_DIAGNOSTIC_SEVERITY = Object.freeze({
  NORMAL: 'normal',
  // D2: removal pending past the former 60 s step budget, or a REPLACE past
  // the former 300 s operation budget, raises severity only.
  ELEVATED: 'elevated',
});
const REPLACE_REMOVAL_PENDING_ESCALATION_MS = 60_000;
const REPLACE_OPERATION_AGE_ESCALATION_MS = 300_000;

// Owner-scoped in-memory state, keyed by the owner instance: the R-1f
// attempt and the diagnostic per operation. Rebuilt from the durable intent
// and a fresh read after a restart.
const STATE_BY_OWNER = new WeakMap();

function readOwnerState(owner) {
  let state = STATE_BY_OWNER.get(owner);
  if (!state) {
    state = {
      retirementAttemptByOperationId: new Map(),
      removalEffectByOperationId: new Map(),
      diagnosticByOperationId: new Map(),
      // BR14: the drain verdict a remote owner was last handed back on.
      handBackVerdictByOperationId: new Map(),
      nextAttemptSeq: 1,
    };
    STATE_BY_OWNER.set(owner, state);
  }
  return state;
}

function nowMsOf(owner) {
  return typeof owner.resolveTimeoutCheckNowMs === 'function' ?
    owner.resolveTimeoutCheckNowMs() : Date.now();
}

function replaceIntentEntryOf(operation) {
  const history = Array.isArray(operation?.stepsHistory) ?
    operation.stepsHistory : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry?.[REPLACE_INTENT_FIELD.INTENT] === true) {
      return entry;
    }
  }
  return null;
}

/**
 * Record the owner's current wait as its one bounded diagnostic (D2/S9):
 * step and owner phase, source and target, how long this wait has lasted,
 * why, the last R-1f attempt, whether its outcome is uncertain and whether
 * it was rebuilt after a restart, the staleness classification, whether R-1f
 * may act, the leader, and the source's membership. Severity rises past the former budgets; the state
 * never changes and nothing is appended per retry.
 * @param {Object} owner
 * @param {Object} operation
 * @param {string} reason
 * @param {Object|null} observation
 * @param {Object} [details] - {ownerPhase, stalenessClass,
 *   retirementAdmissible} as the waiting decision classified them.
 * @return {Object} The diagnostic.
 */
function recordReplaceWaitDiagnostic(owner, operation, reason, observation,
  details = {}) {
  const state = readOwnerState(owner);
  const nowMs = nowMsOf(owner);
  const previous = state.diagnosticByOperationId.get(operation.operationId);
  const waitingSinceMs = previous?.reason === reason ?
    previous.waitingSinceMs : nowMs;
  const {sourceReplicaId, targetReplicaId} =
    replaceReplicaIdsOf(owner, operation);
  const diagnostic = Object.freeze({
    operationId: operation.operationId,
    phase: operation.workflowStep,
    sourceReplicaId,
    targetReplicaId,
    reason,
    waitingSinceMs,
    waitedMs: nowMs - waitingSinceMs,
    ...retirementAttemptSummaryOf(
      state.retirementAttemptByOperationId.get(operation.operationId)),
    ownerPhase: details.ownerPhase ?? REPLACE_NOT_IN_OWNER_PHASE,
    stalenessClass: details.stalenessClass ??
      REPLACE_OWNER_STALENESS_CLASS.NEVER_STALE_BY_AGE,
    retirementAdmissible: details.retirementAdmissible === true,
    leaderReplicaId: observation?.leaderReplicaId ?? null,
    sourceMembership: observation?.state ?? null,
    severity: diagnosticSeverityOf(operation, nowMs),
  });
  state.diagnosticByOperationId.set(operation.operationId, diagnostic);
  logReplaceDiagnosticTransition(owner, previous, diagnostic);
  return diagnostic;
}

function retirementAttemptSummaryOf(attempt) {
  return {
    lastAttemptSeq: attempt?.attemptSeq ?? null,
    lastAttemptUncertain: attempt ? attempt.answer === null : false,
    attemptRebuiltAfter: attempt?.rebuiltAfter ?? REPLACE_ATTEMPT_NOT_REBUILT,
  };
}

function elapsedSinceMs(nowMs, startMs) {
  return Number.isFinite(startMs) ? nowMs - startMs : 0;
}

// D2: removal pending past the former 60 s step budget, or a REPLACE past
// the former 300 s operation budget, raises severity only.
function diagnosticSeverityOf(operation, nowMs) {
  const removalPendingMs = elapsedSinceMs(nowMs,
    Number(replaceIntentEntryOf(operation)?.timestamp));
  const operationAgeMs = elapsedSinceMs(nowMs, Number(operation.createdAt));
  return removalPendingMs >= REPLACE_REMOVAL_PENDING_ESCALATION_MS ||
    operationAgeMs >= REPLACE_OPERATION_AGE_ESCALATION_MS ?
    REPLACE_DIAGNOSTIC_SEVERITY.ELEVATED :
    REPLACE_DIAGNOSTIC_SEVERITY.NORMAL;
}

// One log line per change of reason or severity; nothing per retry.
function logReplaceDiagnosticTransition(owner, previous, diagnostic) {
  if (previous?.reason === diagnostic.reason &&
      previous?.severity === diagnostic.severity) {
    return;
  }
  const log = diagnostic.severity === REPLACE_DIAGNOSTIC_SEVERITY.ELEVATED ?
    owner.logger?.warn : owner.logger?.info;
  log?.call(owner.logger,
    REBALANCE_COORDINATOR_LOG_MSG.REPLACE_SOURCE_REMOVAL_WAITING, diagnostic);
}

/**
 * @param {Object} owner
 * @param {string} operationId
 * @return {Object|null} The operation's current bounded diagnostic.
 */
function readReplaceOwnerDiagnostic(owner, operationId) {
  return STATE_BY_OWNER.get(owner)?.diagnosticByOperationId
    .get(operationId) || null;
}

/**
 * Drop an operation's attempt, effect and diagnostic (terminal).
 * @param {Object} owner
 * @param {string} operationId
 */
function releaseReplaceOwnerOperationState(owner, operationId) {
  const state = STATE_BY_OWNER.get(owner);
  state?.retirementAttemptByOperationId.delete(operationId);
  state?.removalEffectByOperationId.delete(operationId);
  state?.diagnosticByOperationId.delete(operationId);
  state?.handBackVerdictByOperationId.delete(operationId);
}

/**
 * R-1b / BR14: whether the drain wakes a remote REPLACE owner for this
 * verdict - only when it differs from the verdict the owner was last handed
 * back on, so the seed's wake traffic is bounded by verdict changes, not by
 * sweeps.
 * @param {Object} owner
 * @param {string} operationId
 * @param {string} verdictKey
 * @return {boolean}
 */
function admitReplaceOwnerHandBack(owner, operationId, verdictKey) {
  const verdicts = readOwnerState(owner).handBackVerdictByOperationId;
  if (verdicts.get(operationId) === verdictKey) {
    return false;
  }
  verdicts.set(operationId, verdictKey);
  return true;
}

/**
 * Drop every operation's state (shutdown).
 * @param {Object} owner
 */
function releaseAllReplaceOwnerState(owner) {
  STATE_BY_OWNER.delete(owner);
}

/**
 * BR12: whether the owner holds this copy only as a deferred-visibility
 * snapshot; an effect boundary (the removal effect, a handoff issue) waits
 * on it.
 * @param {Object} operation
 * @return {boolean}
 */
function isDeferredVisibilitySnapshot(operation) {
  return operation?.[ReplicaOperationField.VISIBILITY_CLASS] ===
    ReplicaOperationVisibilityClass.DEFERRED_SNAPSHOT;
}

export {
  admitReplaceOwnerHandBack,
  isDeferredVisibilitySnapshot,
  REPLACE_INTENT_FIELD,
  REPLACE_REMOVAL_PENDING_ESCALATION_MS,
  nowMsOf,
  readOwnerState,
  readReplaceOwnerDiagnostic,
  recordReplaceWaitDiagnostic,
  releaseAllReplaceOwnerState,
  releaseReplaceOwnerOperationState,
  replaceIntentEntryOf,
};
