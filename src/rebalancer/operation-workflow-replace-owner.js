/**
 * Owner contract:
 * Owner: the REPLACE owner's source-removal decisions (quest
 * replace-source-removal-owner, amendment-1 step 3; owner decisions D1, D2).
 * Inputs: the witness replica's committed configuration, commit index and
 * leader, read through the READ_REPLICA_MEMBERSHIP replica-operation seam
 * (the REPLACE target t: under D1 it bootstraps from the committed
 * configuration, so the source is in t's ConfState until a committed
 * RemoveNode takes it out); the source replica's lifecycle row; the target
 * replica's failure-detector verdict.
 *  - R-1a decideReplaceCompletion: SOURCE_RETIRED iff the source is absent
 *    from the witness's voters and outgoing voters at a commit index at
 *    least the one recorded with the removal intent; otherwise STILL_VOTER or
 *    UNAVAILABLE. completeOperation refuses a REPLACE without it.
 *  - the durable removal intent (the STOPPING CAS, written before the
 *    REMOVE_REPLICA effect) and its witness metadata;
 *  - the STOPPING owner: R-1e completion at entry, T5' re-send of
 *    REMOVE_REPLICA while the source row is still admissible, R-1f
 *    re-drive of REMOVE_PEER through the witness while the source is a voter
 *    and its row is gone or retiring, and the D2 target-death rule;
 *  - D2: after durable intent, the only admitted FAILED is target death:
 *    with the source still a voter its node cancels the source's removal
 *    first (CANCEL_REPLICA_REMOVAL); CANCELLED or NOT_IN_PROGRESS records
 *    the source retained, ALREADY_REMOVED (or the authority reading the
 *    source absent, checked after target death) the degraded source-removed
 *    outcome, anything else waits (2026-11-11). No elapsed-time budget fails
 *    a REPLACE after its intent; budgets become bounded diagnostics.
 * Prohibited: completing from a row, the AVAILABLE readiness verdict, a
 * release, a predicted configuration or any third replica; failing a
 * post-intent REPLACE on elapsed time; resubmitting REMOVE_PEER on a wake
 * that changed nothing.
 */
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  PARTITION_REPLICA_MEMBERSHIP_STATE,
} from '../partition/partition-replica-membership-constants.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION} from
  './replica-operation-update-disposition.js';
import {
  captureReplaceOwnerLevel,
  resolveReplaceOwnerEntryLevel,
} from './operation-workflow-replace-owner-wake.js';
import {
  isPartitionReplace,
  isReplaceRemovalIntentDurable,
  isSourceUnreachableAtIntent,
  resolveIntentCommitIndex,
} from './operation-workflow-replace-intent.js';
import {
  isReplaceTargetGone,
  readReplaceCompletionAuthority,
} from './operation-workflow-replace-surviving-membership.js';
import {
  evaluateRemovalLeadershipSafety,
  isRemovalSubjectCorroboratedLeader,
} from './operation-workflow-removal-leadership-gate.js';
import {
  replaceAnswerStatus,
  readReplaceWitnessMembership,
  replaceReplicaIdsOf,
} from './operation-workflow-replace-witness.js';
import {
  clearAllReplaceHandoffAttempts,
  clearReplaceHandoffAttempt,
  isReplaceHandoffAttemptUnresolved,
  readReplaceHandoffAttempt,
  readReplaceHandoffDecisionUnresolved,
} from './operation-workflow-replace-handoff-attempt.js';
import {
  REPLACE_INTENT_FIELD,
  isDeferredVisibilitySnapshot,
  REPLACE_REMOVAL_PENDING_ESCALATION_MS,
  nowMsOf,
  readOwnerState,
  readReplaceOwnerDiagnostic,
  recordReplaceWaitDiagnostic,
  releaseAllReplaceOwnerState,
  releaseReplaceOwnerOperationState,
  replaceIntentEntryOf,
} from './operation-workflow-replace-owner-state.js';
import {
  REPLACE_OWNER_RESTART_CLASS,
  REPLACE_OWNER_STALENESS_CLASS,
  REPLACE_SOURCE_ROW_CLASS,
  classifyReplaceOwnerPhase,
  releaseReplaceOwnerSessionOperation,
  startReplaceOwnerSession,
} from './operation-workflow-replace-owner-recovery.js';
import {redriveReplaceSourceRetirement} from
  './operation-workflow-replace-source-retirement.js';
import {cancelReplaceSourceRemoval, isSourceRetainedAnswer,
  removalAppliedAnswer, targetDeathStepMetadataOf} from
  './operation-workflow-replace-source-cancellation.js';
import {REPLICA_REMOVAL_CANCEL_ANSWER} from
  '../node/replica-removal-cancel-contract.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  ReplicaStatus,
  WORKFLOW_STEP,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const REPLACE_COMPLETION_VERDICT = Object.freeze({
  SOURCE_RETIRED: 'source_retired',
  STILL_VOTER: 'still_voter',
  UNAVAILABLE: 'unavailable',
  // The witness's applied configuration is below its participation gate
  // (O1, B12): a replaying replica's transient view proves no absence.
  WITNESS_BELOW_GATE: 'witness_below_gate',
});

// The FAILED a REPLACE may reach after its durable removal intent (D2):
// target death, its source retained or (degraded) already removed.
const REPLACE_POST_INTENT_FAILURE = Object.freeze({
  TARGET_DEAD_SOURCE_RETAINED: 'replace_target_dead_source_retained',
  TARGET_DEAD_SOURCE_REMOVED: 'replace_target_dead_source_removed',
});

// R-1c: the drain's non-owner FAIL of a pre-intent REPLACE whose owner is
// unavailable and whose target the failure detector marked dead.
const REPLACE_OWNER_UNAVAILABLE_SOURCE_RETAINED =
  'replace_owner_unavailable_source_retained';

// D2 pre-effect: a REPLACE whose target the failure detector marked dead
// before its removal intent; nothing about the source was changed.
const REPLACE_TARGET_DEAD_BEFORE_INTENT = 'replace_target_dead_before_intent';

// A10: a REPLACE whose target replica is gone before its removal intent.
const REPLACE_TARGET_REMOVED_BEFORE_ACTIVE =
  'replace_target_removed_before_active';

const REPLACE_OWNER_REFUSAL = Object.freeze({
  COMPLETION_WITHOUT_SOURCE_RETIREMENT:
    'replace_completion_refused_source_not_retired',
  POST_INTENT_TIMER_FAILURE: 'replace_post_intent_failure_refused',
});

// What the STOPPING owner is waiting on (S9/D2 diagnostics; bounded state).
const REPLACE_WAIT_REASON = Object.freeze({
  WITNESS_UNAVAILABLE: 'witness_membership_unavailable',
  WITNESS_BELOW_GATE: 'witness_below_participation_gate',
  SOURCE_ROW_UNAVAILABLE: 'source_row_unavailable',
  SOURCE_REMOVAL_EFFECT_PENDING: 'source_removal_effect_pending',
  SOURCE_MEMBERSHIP_REMOVAL_PENDING: 'source_membership_removal_pending',
  TARGET_DEAD_WITNESS_UNAVAILABLE: 'target_dead_witness_unavailable',
  // D2: the source's node has not answered the cancellation of its removal.
  SOURCE_REMOVAL_CANCEL_PENDING: 'source_removal_cancel_pending',
  REMOVAL_INTENT_NOT_DURABLE: 'removal_intent_not_durable',
  EFFECT_REVALIDATION_MOVED: 'effect_revalidation_inputs_moved',
  // The corroborated leader is the source: no RemoveNode is proposed through
  // it; the removal leadership gate hands its leadership off first.
  SOURCE_LEADS: 'source_leads_handoff_pending',
  // BR12: the owner's copy is a deferred-visibility snapshot.
  DEFERRED_VISIBILITY: 'deferred_visibility_snapshot',
  // A former step or operation budget elapsed while no other wait was
  // recorded (a diagnostic only).
  BUDGET_ELAPSED: 'former_time_budget_elapsed',
});

// The verdicts on which the STOPPING owner waits with nothing concluded: an
// unreadable witness, and a witness below its participation gate (B12).
const VERDICT_WAIT_REASON = Object.freeze({
  [REPLACE_COMPLETION_VERDICT.UNAVAILABLE]:
    REPLACE_WAIT_REASON.WITNESS_UNAVAILABLE,
  [REPLACE_COMPLETION_VERDICT.WITNESS_BELOW_GATE]:
    REPLACE_WAIT_REASON.WITNESS_BELOW_GATE,
});

// What the removal-effect boundary decides after SAFE (A8/BR7): send the
// REMOVE_REPLICA effect now, hand the operation to the STOPPING owner (the
// source is unreachable or already retiring, T5''), or wait.
const REPLACE_EFFECT_ADMISSION = Object.freeze({
  SEND: 'send',
  STOPPING_OWNER: 'stopping_owner',
  WAIT: 'wait',
});

// Source rows under which the source's lifecycle has retired or failed, so
// its membership removal is the REPLACE's to re-drive (R-1f preconditions).
const RETIRING_SOURCE_ROW_STATUSES = Object.freeze(new Set([
  ReplicaStatus.FAILED,
  ReplicaStatus.REMOVING,
  ReplicaStatus.REMOVED,
]));

const STOPPING_OBSERVATION_ABSENT = 'absent';
const STOPPING_OBSERVATION_UNAVAILABLE = 'unavailable';

/**
 * R-1a: the REPLACE succeeds only when its source has left the committed
 * voters (incoming and outgoing) as the witness reports them, at a commit
 * index no older than the one recorded with the removal intent.
 * @param {Object} owner
 * @param {Object} operation
 * @return {Promise<Object>} Frozen {verdict, observation}.
 */
async function decideReplaceCompletion(owner, operation) {
  // F1: the group's leader-answered current committed configuration; t's
  // own view (and, t gone, a survivor's) only routes the question (D2).
  const observation = await readReplaceCompletionAuthority(owner, operation);
  return Object.freeze({
    verdict: await completionVerdictOf(owner, operation, observation),
    observation,
  });
}

// R-1a on the completion authority's observation (the leader's own answer,
// F1): a voter is a voter; an absence retires the source only when the
// answering replica is at or past its participation gate (B12: gateOpen from
// its port's committed-membership read - the ruling requires it when the
// target answers as leader; it is required of every answer here, a leader's
// gate being open by construction) and at or past the intent's commit index
// C0 (AN11).
async function completionVerdictOf(owner, operation, observation) {
  if (observation.state === PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER) {
    return REPLACE_COMPLETION_VERDICT.STILL_VOTER;
  }
  if (observation.state !== PARTITION_REPLICA_MEMBERSHIP_STATE.ABSENT) {
    return REPLACE_COMPLETION_VERDICT.UNAVAILABLE;
  }
  if (observation.gateOpen !== true) {
    return REPLACE_COMPLETION_VERDICT.WITNESS_BELOW_GATE;
  }
  return Number(observation.commitIndex) >=
    await resolveIntentCommitIndex(owner, operation) ?
    REPLACE_COMPLETION_VERDICT.SOURCE_RETIRED :
    REPLACE_COMPLETION_VERDICT.UNAVAILABLE;
}

/**
 * The typed refusal completeOperation answers for a partition REPLACE whose
 * source has not left the committed voters (R11: an explicit outcome, never
 * a quieter path).
 * @param {Object} decision
 * @return {Object}
 */
function buildReplaceCompletionRefusal(decision) {
  return Object.freeze({
    committed: false,
    disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
    refusal: REPLACE_OWNER_REFUSAL.COMPLETION_WITHOUT_SOURCE_RETIREMENT,
    verdict: decision.verdict,
  });
}

function buildReplaceFailureRefusal() {
  return Object.freeze({
    committed: false,
    disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
    refusal: REPLACE_OWNER_REFUSAL.POST_INTENT_TIMER_FAILURE,
  });
}

/**
 * The durable-intent step metadata recorded with the STOPPING CAS.
 * @param {Object} operation
 * @param {Object} witness - The witness observation read before the intent.
 * @param {Object} [options]
 * @return {Object}
 */
function buildReplaceRemovalIntentMetadata(operation, witness, options = {}) {
  const commitIndex = Number(witness?.commitIndex);
  return {
    [REPLACE_INTENT_FIELD.INTENT]: true,
    [REPLACE_INTENT_FIELD.WITNESS_REPLICA_ID]: witness?.replicaId || null,
    [REPLACE_INTENT_FIELD.WITNESS_NODE_ID]: operation?.targetNodeId || null,
    [REPLACE_INTENT_FIELD.WITNESS_COMMIT_INDEX]:
      Number.isFinite(commitIndex) ? commitIndex : 0,
    [REPLACE_INTENT_FIELD.SOURCE_UNREACHABLE]:
      options.sourceUnreachable === true,
  };
}

function isTargetFailureDetectorDead(owner, operation) {
  const {targetReplicaId} = replaceReplicaIdsOf(owner, operation);
  if (!targetReplicaId ||
      typeof owner.repository?.getObservedReplicaStatusFromCache !==
        OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION) {
    return false;
  }
  return owner.repository.getObservedReplicaStatusFromCache(
    targetReplicaId,
    operation.partitionId,
    operation.targetNodeId,
  ) === ReplicaStatus.FAILED;
}

/**
 * Drop an operation's in-memory owner state (terminal, or shutdown).
 * @param {Object} owner
 * @param {string} operationId
 */
function clearReplaceOwnerState(owner, operationId) {
  releaseReplaceOwnerOperationState(owner, operationId);
  clearReplaceHandoffAttempt(owner, operationId);
  releaseReplaceOwnerSessionOperation(owner, operationId);
}

// Shutdown releases every in-memory attempt, effect and diagnostic; what
// follows is a new owner session (a re-initialization), in which an
// operation's lost attempt is rebuilt, never assumed absent (BR10).
function clearAllReplaceOwnerState(owner) {
  releaseAllReplaceOwnerState(owner);
  clearAllReplaceHandoffAttempts(owner);
  startReplaceOwnerSession(owner, REPLACE_OWNER_RESTART_CLASS.COORDINATOR_REINIT);
}

/**
 * Record that the REMOVE_REPLICA effect was delivered and what the source
 * answered. T5' re-sends only when no effect is recorded (a restart lost it)
 * or the recorded one has had its backstop window without the source's row
 * retiring.
 * @param {Object} owner
 * @param {Object} operation
 * @param {Object|null} response
 */
function recordReplaceSourceRemovalEffect(owner, operation, response) {
  readOwnerState(owner).removalEffectByOperationId.set(operation.operationId, {
    sentAtMs: nowMsOf(owner),
    status: replaceAnswerStatus(response),
  });
}

function isRemovalEffectResendDue(owner, operation) {
  const effect = readOwnerState(owner).removalEffectByOperationId
    .get(operation.operationId);
  return !effect ||
    nowMsOf(owner) - effect.sentAtMs >= REPLACE_REMOVAL_PENDING_ESCALATION_MS;
}

async function observeReplaceSourceRow(owner, operation) {
  const {sourceReplicaId} = replaceReplicaIdsOf(owner, operation);
  return owner.observeStoppingReplicaProgress(
    sourceReplicaId,
    operation.partitionId,
    operation.sourceNodeId,
  );
}

function isSourceRowRetiring(sourceRow) {
  return sourceRow.state === STOPPING_OBSERVATION_ABSENT ||
    RETIRING_SOURCE_ROW_STATUSES.has(sourceRow.lifecycleStatus);
}

/**
 * Whether the operation is over as far as this owner can observe: its own
 * copy, or the replicated row a terminal written anywhere lands in.
 * @param {Object} owner
 * @param {Object} operation
 * @return {boolean}
 */
function isReplaceOperationTerminalObserved(owner, operation) {
  const cachedRow = owner.repository.getReplicaOperationRowFromCache?.(
    operation.operationId) || null;
  return owner.repository.isOperationTerminal(operation) ||
    (cachedRow !== null && cachedRow.completed_at !== null &&
      cachedRow.completed_at !== undefined);
}

/**
 * The owner waits: its bounded diagnostic, the fallback and the wake. A
 * decision that was in flight when the operation's terminal was observed
 * records nothing and arms nothing (BR17): its state is released instead.
 * @param {Object} owner
 * @param {Object} operation
 * @param {string} reason
 * @param {Object} context - {observation, entryLevel}.
 * @return {boolean} false (the operation did not progress).
 */
function waitForReplaceOwner(owner, operation, reason, context) {
  if (recordReplaceOwnerWait(owner, operation, reason, context)) {
    owner.armReplaceOwnerWait?.(operation, reason, context.entryLevel || null);
  }
  return false;
}

/**
 * S9: record one owner wait as its bounded diagnostic, classified from what
 * the waiting decision read (its witness observation, the source's row when
 * it was read, R-1f's admissibility). A wait observed after the operation's
 * terminal records nothing and releases its state instead (BR17).
 * @param {Object} owner
 * @param {Object} operation
 * @param {string} reason
 * @param {Object} [context] - {observation, sourceRow, retirementAdmissible}.
 * @return {boolean} Whether the wait was recorded (the operation is live).
 */
function recordReplaceOwnerWait(owner, operation, reason, context = {}) {
  if (isReplaceOperationTerminalObserved(owner, operation)) {
    owner.clearDeferredSafetyBlockState?.(operation.operationId);
    clearReplaceOwnerState(owner, operation.operationId);
    return false;
  }
  const observation = context.observation || null;
  const handoffPhase = operation.workflowStep === WORKFLOW_STEP.ACTIVE;
  recordReplaceWaitDiagnostic(owner, operation, reason, observation, {
    // S9: at ACTIVE the attempt is the named handoff's, labelled from the
    // decision that read it (its witness), not re-classified without one.
    handoffAttempt: handoffPhase ?
      readReplaceHandoffAttempt(owner, operation.operationId) : null,
    ownerPhase: classifyReplaceOwnerPhase({
      workflowStep: operation.workflowStep,
      handoffAttemptUnresolved: readReplaceHandoffDecisionUnresolved(
        owner, operation.operationId) ??
        isReplaceHandoffAttemptUnresolved(
          owner, operation.operationId, observation),
      sourceRetired: false,
      sourceRowClass: context.sourceRow ?
        sourceRowClassOf(context.sourceRow) : REPLACE_SOURCE_ROW_CLASS.UNKNOWN,
    }),
    stalenessClass: isTargetFailureDetectorDead(owner, operation) ?
      REPLACE_OWNER_STALENESS_CLASS.TARGET_FAILED :
      REPLACE_OWNER_STALENESS_CLASS.NEVER_STALE_BY_AGE,
    retirementAdmissible: context.retirementAdmissible === true,
  });
  return true;
}

// D2's terminal for the source node's typed cancel answer, or null.
function targetDeathFailureOf(cancel) {
  if (isSourceRetainedAnswer(cancel)) {
    return REPLACE_POST_INTENT_FAILURE.TARGET_DEAD_SOURCE_RETAINED;
  }
  return cancel.answer === REPLICA_REMOVAL_CANCEL_ANSWER.ALREADY_REMOVED ?
    REPLACE_POST_INTENT_FAILURE.TARGET_DEAD_SOURCE_REMOVED : null;
}

async function handleReplaceTargetDeath(owner, operation, decision, context) {
  const removed =
    decision.verdict === REPLACE_COMPLETION_VERDICT.SOURCE_RETIRED;
  if (removed ||
      decision.verdict === REPLACE_COMPLETION_VERDICT.STILL_VOTER) {
    // D2: a real premise change. The source is retained only once its node
    // cancelled its removal; an unanswered cancel records nothing. A source
    // already out of the committed configuration is the degraded outcome,
    // however the owner learned it (2026-11-11).
    const cancel = removed ? removalAppliedAnswer() :
      await cancelReplaceSourceRemoval(owner, operation);
    const failure = targetDeathFailureOf(cancel);
    if (failure === null) {
      return waitForReplaceOwner(owner, operation,
        REPLACE_WAIT_REASON.SOURCE_REMOVAL_CANCEL_PENDING,
        {...context, observation: decision.observation});
    }
    await owner.failOperation(operation, failure, {
      replacePostIntentFailure: failure,
      stepMetadata: targetDeathStepMetadataOf(cancel, decision.observation,
        replaceReplicaIdsOf(owner, operation))});
    return true;
  }
  // The witness is the dead target: its configuration cannot be read, so
  // nothing is concluded - the REPLACE waits visibly (never a rollback).
  return waitForReplaceOwner(owner, operation,
    REPLACE_WAIT_REASON.TARGET_DEAD_WITNESS_UNAVAILABLE,
    {...context, observation: decision.observation});
}

/**
 * A STOPPING REPLACE another writer moved there without an intent: the
 * owner records its intent now, from a fresh witness read (C0 is that
 * read's commit index), before deciding anything from the witness.
 * @param {Object} owner
 * @param {Object} operation
 * @return {Promise<boolean>} Whether the intent is durable.
 */
async function recordAdoptedReplaceIntent(owner, operation) {
  const witness = await readReplaceWitnessMembership(owner, operation);
  if (witness.state !== PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER &&
      witness.state !== PARTITION_REPLICA_MEMBERSHIP_STATE.ABSENT) {
    return false;
  }
  return owner.persistReplaceRemovalIntent(operation,
    buildReplaceRemovalIntentMetadata(operation, witness));
}

/**
 * The STOPPING owner: one decision per entry from fresh authoritative
 * state (R-1e, T5', R-1f, D2).
 * @param {Object} owner
 * @param {Object} operation
 * @param {Object} [context] - {entryLevel}: the owner's waited-on level,
 *   captured before this decision's reads (the lost-wakeup rule).
 * @return {Promise<boolean|Object>} true when the operation progressed; an
 *   execute result for a T5' re-send; false while it waits.
 */
async function reconcileReplaceStoppingOwner(owner, operation, context = {}) {
  if (owner.repository.isOperationTerminal(operation)) {
    return false;
  }
  if (replaceIntentEntryOf(operation) === null &&
      !await recordAdoptedReplaceIntent(owner, operation)) {
    return waitForReplaceOwner(owner, operation,
      REPLACE_WAIT_REASON.REMOVAL_INTENT_NOT_DURABLE, context);
  }
  const decision = await decideReplaceCompletion(owner, operation);
  const waitContext = {...context, observation: decision.observation};
  if (isReplaceTargetGone(owner, operation)) {
    return handleReplaceTargetDeath(owner, operation, decision, context);
  }
  if (decision.verdict === REPLACE_COMPLETION_VERDICT.SOURCE_RETIRED) {
    await owner.completeOperation(operation);
    return true;
  }
  if (Object.hasOwn(VERDICT_WAIT_REASON, decision.verdict)) {
    return waitForReplaceOwner(owner, operation,
      VERDICT_WAIT_REASON[decision.verdict], waitContext);
  }
  if (isRemovalSubjectCorroboratedLeader(owner, operation,
    decision.observation)) {
    // Leadership moved onto the source: no RETIRE through it; the gate's
    // named handoff leaves and the owner waits until a survivor leads.
    return handOffLeadingSource(owner, operation, waitContext);
  }
  const sourceRow = await observeReplaceSourceRow(owner, operation);
  if (sourceRow.state === STOPPING_OBSERVATION_UNAVAILABLE) {
    return waitForReplaceOwner(owner, operation,
      REPLACE_WAIT_REASON.SOURCE_ROW_UNAVAILABLE, waitContext);
  }
  const retirementAdmissible = isSourceRowRetiring(sourceRow) ||
    isSourceUnreachableAtIntent(operation);
  const rowContext = {...waitContext, sourceRow, retirementAdmissible};
  if (!retirementAdmissible) {
    if (!isRemovalEffectResendDue(owner, operation)) {
      // The effect was delivered and the source's row has not retired yet:
      // wait for its lifecycle (or the membership) to move.
      return waitForReplaceOwner(owner, operation,
        REPLACE_WAIT_REASON.SOURCE_REMOVAL_EFFECT_PENDING, rowContext);
    }
    // T5': when the backstop is due and lifecycle has not retired, re-send
    // the removal effect through the same remove-safety evaluation.
    const result = await owner.executeReplaceSourceRemovalEffect(operation);
    const waitReason = result?.deferReason ||
      REPLACE_WAIT_REASON.SOURCE_REMOVAL_EFFECT_PENDING;
    // Reinstall the dispatch-cleared wait against the entry level.
    if (recordReplaceOwnerWait(owner, operation, waitReason, rowContext)) {
      owner.armReplaceOwnerWait?.(operation, waitReason,
        context.entryLevel || null);
    }
    return result;
  }
  await redriveReplaceSourceRetirement(owner, operation, decision.observation);
  return waitForReplaceOwner(owner, operation,
    REPLACE_WAIT_REASON.SOURCE_MEMBERSHIP_REMOVAL_PENDING, rowContext);
}

// The source leads at STOPPING: the gate decides (an attempt out waits for
// its resolution); its handoff leaves; the owner waits on the one wake.
async function handOffLeadingSource(owner, operation, waitContext) {
  const evaluation = await evaluateRemovalLeadershipSafety(owner, operation);
  if (evaluation?.handoffRequest) {
    await owner.dispatchRemoveSafetyHandoffRequest(operation,
      evaluation.handoffRequest);
  }
  return waitForReplaceOwner(owner, operation,
    REPLACE_WAIT_REASON.SOURCE_LEADS, waitContext);
}

function waitAdmission(reason, witness = null) {
  return Object.freeze({
    admission: REPLACE_EFFECT_ADMISSION.WAIT, reason, witness});
}

function revalidateReplaceSourceRemovalEffect(
  owner, operation, entryLevel, expectedStep = WORKFLOW_STEP.STOPPING) {
  if (isDeferredVisibilitySnapshot(operation)) {
    return waitAdmission(REPLACE_WAIT_REASON.DEFERRED_VISIBILITY);
  }
  if (isReplaceOperationTerminalObserved(owner, operation) ||
      operation.workflowStep !== expectedStep ||
      isTargetFailureDetectorDead(owner, operation)) {
    return waitAdmission(REPLACE_WAIT_REASON.EFFECT_REVALIDATION_MOVED);
  }
  const resolvedEntry = resolveReplaceOwnerEntryLevel(owner, entryLevel);
  if (resolvedEntry &&
      captureReplaceOwnerLevel(owner, operation)?.levelKey !==
        resolvedEntry.levelKey) {
    return waitAdmission(REPLACE_WAIT_REASON.EFFECT_REVALIDATION_MOVED);
  }
  return Object.freeze({admission: REPLACE_EFFECT_ADMISSION.SEND});
}

async function admitActiveReplaceSourceRemovalIntent(
  owner, operation, entryLevel) {
  const witness = await readReplaceWitnessMembership(owner, operation);
  if (witness.state !== PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER &&
      witness.state !== PARTITION_REPLICA_MEMBERSHIP_STATE.ABSENT) {
    return waitAdmission(REPLACE_WAIT_REASON.WITNESS_UNAVAILABLE, witness);
  }
  const sourceRow = await observeReplaceSourceRow(owner, operation);
  if (sourceRow.state === STOPPING_OBSERVATION_UNAVAILABLE) {
    return waitAdmission(REPLACE_WAIT_REASON.SOURCE_ROW_UNAVAILABLE, witness);
  }
  const preIntent = revalidateReplaceSourceRemovalEffect(
    owner, operation, entryLevel, WORKFLOW_STEP.ACTIVE);
  if (preIntent.admission !== REPLACE_EFFECT_ADMISSION.SEND) {
    return preIntent;
  }
  const sourceUnreachable = sourceRow.lifecycleStatus === ReplicaStatus.FAILED;
  const persisted = await owner.persistReplaceRemovalIntent(
    operation,
    buildReplaceRemovalIntentMetadata(operation, witness, {sourceUnreachable}),
  );
  if (!persisted) {
    return waitAdmission(REPLACE_WAIT_REASON.REMOVAL_INTENT_NOT_DURABLE,
      witness);
  }
  const postIntent = revalidateReplaceSourceRemovalEffect(
    owner, operation, entryLevel);
  if (postIntent.admission === REPLACE_EFFECT_ADMISSION.SEND &&
      (sourceUnreachable ||
       RETIRING_SOURCE_ROW_STATUSES.has(sourceRow.lifecycleStatus))) {
    return Object.freeze({
      admission: REPLACE_EFFECT_ADMISSION.STOPPING_OWNER, witness});
  }
  return postIntent;
}

async function admitReplaceSourceRemovalEffect(owner, operation, entryLevel) {
  if (isDeferredVisibilitySnapshot(operation)) {
    // BR12: no intent and no effect from a deferred snapshot.
    return waitAdmission(REPLACE_WAIT_REASON.DEFERRED_VISIBILITY);
  }
  if (operation.workflowStep === WORKFLOW_STEP.ACTIVE) {
    return admitActiveReplaceSourceRemovalIntent(owner, operation, entryLevel);
  }
  return revalidateReplaceSourceRemovalEffect(owner, operation, entryLevel);
}

/**
 * BR7: at ACTIVE the source row already reads REMOVING or absent - its
 * removal effect happened without a recorded intent (a restart or an older
 * path). Record the intent now, against a fresh witness read, and hand the
 * operation to the STOPPING owner; nothing is completed from the row.
 * @param {Object} owner
 * @param {Object} operation
 * @return {Promise<boolean>} Whether the intent is durable.
 */
async function adoptObservedReplaceSourceRetirement(owner, operation) {
  if (operation?.workflowStep !== WORKFLOW_STEP.ACTIVE) {
    return isReplaceRemovalIntentDurable(operation);
  }
  const witness = await readReplaceWitnessMembership(owner, operation);
  if (witness.state !== PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER &&
      witness.state !== PARTITION_REPLICA_MEMBERSHIP_STATE.ABSENT) {
    return false;
  }
  return owner.persistReplaceRemovalIntent(
    operation, buildReplaceRemovalIntentMetadata(operation, witness));
}

/**
 * Record an exhausted budget of a time-exempt REPLACE as its bounded
 * diagnostic (severity only, never a state change).
 * @param {Object} owner
 * @param {Object} operation
 * @return {Object} The diagnostic.
 */
function recordReplaceBudgetDiagnostic(owner, operation) {
  const previous = readReplaceOwnerDiagnostic(owner, operation.operationId);
  return recordReplaceWaitDiagnostic(owner, operation,
    previous?.reason || REPLACE_WAIT_REASON.BUDGET_ELAPSED, null, {
      ownerPhase: previous?.ownerPhase,
      stalenessClass: previous?.stalenessClass,
      retirementAdmissible: previous?.retirementAdmissible,
    });
}

function sourceRowClassOf(sourceRow) {
  if (sourceRow.state === STOPPING_OBSERVATION_UNAVAILABLE) {
    return REPLACE_SOURCE_ROW_CLASS.UNKNOWN;
  }
  if (sourceRow.state === STOPPING_OBSERVATION_ABSENT ||
      sourceRow.lifecycleStatus === ReplicaStatus.REMOVED ||
      sourceRow.lifecycleStatus === ReplicaStatus.FAILED) {
    return REPLACE_SOURCE_ROW_CLASS.GONE;
  }
  return sourceRow.lifecycleStatus === ReplicaStatus.REMOVING ?
    REPLACE_SOURCE_ROW_CLASS.RETIRING : REPLACE_SOURCE_ROW_CLASS.ADMISSIBLE;
}

/**
 * The operation's owner phase (Φ1-Φ6) from fresh reads: the witness verdict,
 * the source's row, and the owner's own attempt state.
 * @param {Object} owner
 * @param {Object} operation
 * @return {Promise<string>} A REPLACE_OWNER_PHASE member, or
 *   REPLACE_NOT_IN_OWNER_PHASE.
 */
async function readReplaceOwnerPhase(owner, operation) {
  const decision = await decideReplaceCompletion(owner, operation);
  const sourceRow = await observeReplaceSourceRow(owner, operation);
  return classifyReplaceOwnerPhase({
    workflowStep: operation?.workflowStep,
    handoffAttemptUnresolved: isReplaceHandoffAttemptUnresolved(
      owner, operation?.operationId, decision.observation),
    sourceRetired:
      decision.verdict === REPLACE_COMPLETION_VERDICT.SOURCE_RETIRED,
    sourceRowClass: sourceRowClassOf(sourceRow),
  });
}
export {
  REPLACE_COMPLETION_VERDICT,
  REPLACE_POST_INTENT_FAILURE,
  REPLACE_EFFECT_ADMISSION,
  REPLACE_OWNER_UNAVAILABLE_SOURCE_RETAINED,
  REPLACE_TARGET_DEAD_BEFORE_INTENT,
  REPLACE_TARGET_REMOVED_BEFORE_ACTIVE,
  REPLACE_WAIT_REASON,
  adoptObservedReplaceSourceRetirement,
  admitReplaceSourceRemovalEffect,
  buildReplaceCompletionRefusal,
  buildReplaceFailureRefusal,
  clearAllReplaceOwnerState,
  clearReplaceOwnerState,
  decideReplaceCompletion,
  isPartitionReplace,
  isReplaceRemovalIntentDurable,
  isTargetFailureDetectorDead,
  readReplaceOwnerDiagnostic,
  readReplaceOwnerPhase,
  recordReplaceBudgetDiagnostic,
  recordReplaceOwnerWait,
  recordReplaceSourceRemovalEffect,
  reconcileReplaceStoppingOwner,
};
