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
 * Canonical output:
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
 *  - D2: after durable intent, the only admitted FAILED is target death with
 *    the source still a voter. No elapsed-time budget fails a REPLACE after
 *    its intent; budgets become the bounded diagnostics recorded here.
 * Prohibited: completing from a row, the AVAILABLE readiness verdict, a
 * release, a predicted configuration or any third replica; failing a
 * post-intent REPLACE on elapsed time; resubmitting REMOVE_PEER on a wake
 * that changed nothing.
 */
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
} from './replica-operation-constants.js';
import {
  PARTITION_REPLICA_MEMBERSHIP_STATE,
} from '../partition/partition-replica-membership-constants.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION} from
  './replica-operation-update-disposition.js';
import {captureReplaceOwnerLevel} from './operation-workflow-replace-owner-wake.js';
import {isPartitionReplaceOwnerPhase} from './replica-operation-step-policy.js';
import {
  deliverToReplaceWitness,
  readReplaceWitnessMembership,
  replaceReplicaIdsOf,
} from './operation-workflow-replace-witness.js';
import {
  clearAllReplaceHandoffAttempts,
  clearReplaceHandoffAttempt,
  isReplaceHandoffAttemptUnresolved,
} from './operation-workflow-replace-handoff-attempt.js';
import {
  REPLACE_INTENT_FIELD,
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
  claimReplaceAttemptStateRebuild,
  classifyReplaceOwnerPhase,
  releaseReplaceOwnerSessionOperation,
  startReplaceOwnerSession,
} from './operation-workflow-replace-owner-recovery.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  ReplicaStatus,
  SERVICE_TYPE,
  WORKFLOW_STEP,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const REPLACE_COMPLETION_VERDICT = Object.freeze({
  SOURCE_RETIRED: 'source_retired',
  STILL_VOTER: 'still_voter',
  UNAVAILABLE: 'unavailable',
});

// The one FAILED a REPLACE may reach after its durable removal intent (D2).
const REPLACE_POST_INTENT_FAILURE = Object.freeze({
  TARGET_DEAD_SOURCE_RETAINED: 'replace_target_dead_source_retained',
});

// R-1c: the drain's non-owner FAIL of a pre-intent REPLACE whose owner is
// unavailable and whose target the failure detector marked dead.
const REPLACE_OWNER_UNAVAILABLE_SOURCE_RETAINED =
  'replace_owner_unavailable_source_retained';

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
  SOURCE_ROW_UNAVAILABLE: 'source_row_unavailable',
  SOURCE_REMOVAL_EFFECT_PENDING: 'source_removal_effect_pending',
  SOURCE_MEMBERSHIP_REMOVAL_PENDING: 'source_membership_removal_pending',
  TARGET_DEAD_WITNESS_UNAVAILABLE: 'target_dead_witness_unavailable',
  REMOVAL_INTENT_NOT_DURABLE: 'removal_intent_not_durable',
  EFFECT_REVALIDATION_MOVED: 'effect_revalidation_inputs_moved',
  // A former step or operation budget elapsed while no other wait was
  // recorded (a diagnostic only).
  BUDGET_ELAPSED: 'former_time_budget_elapsed',
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
 * Whether this operation is a REPLACE of a partition replica (the C1/D2
 * contract is about raft membership; runtime-service and message-group
 * REPLACEs keep their own owners).
 * @param {Object} operation
 * @return {boolean}
 */
function isPartitionReplace(operation) {
  return operation?.type === OperationType.REPLACE &&
    (operation?.entityType === undefined ||
      operation?.entityType === null ||
      operation?.entityType === SERVICE_TYPE.PARTITION);
}

/**
 * The durable removal-intent boundary (D2): the REPLACE has persisted
 * STOPPING, which is written before the REMOVE_REPLICA effect.
 * @param {Object} operation
 * @return {boolean}
 */
function isReplaceRemovalIntentDurable(operation) {
  return isPartitionReplace(operation) &&
    operation?.workflowStep === WORKFLOW_STEP.STOPPING;
}

// C0: the witness commit index recorded with the first removal intent; NaN
// when no intent is recorded, which no commit index satisfies.
function witnessCommitIndexAtIntent(operation) {
  const entry = replaceIntentEntryOf(operation);
  return entry === null ? Number.NaN :
    Number(entry[REPLACE_INTENT_FIELD.WITNESS_COMMIT_INDEX]);
}

function isSourceUnreachableAtIntent(operation) {
  return replaceIntentEntryOf(operation)
    ?.[REPLACE_INTENT_FIELD.SOURCE_UNREACHABLE] === true;
}

/**
 * R-1a: the REPLACE succeeds only when its source has left the committed
 * voters (incoming and outgoing) as the witness reports them, at a commit
 * index no older than the one recorded with the removal intent.
 * @param {Object} owner
 * @param {Object} operation
 * @return {Promise<Object>} Frozen {verdict, observation}.
 */
async function decideReplaceCompletion(owner, operation) {
  const observation = await readReplaceWitnessMembership(owner, operation);
  let verdict = REPLACE_COMPLETION_VERDICT.UNAVAILABLE;
  if (observation.state === PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER) {
    verdict = REPLACE_COMPLETION_VERDICT.STILL_VOTER;
  } else if (
    observation.state === PARTITION_REPLICA_MEMBERSHIP_STATE.ABSENT &&
    Number(observation.commitIndex) >= witnessCommitIndexAtIntent(operation)
  ) {
    verdict = REPLACE_COMPLETION_VERDICT.SOURCE_RETIRED;
  }
  return Object.freeze({verdict, observation});
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
    {allowPartitionNodeFallback: false},
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

const RETIREMENT_LEVEL_SEPARATOR = '|';
// The sequence of an attempt record rebuilt after a restart (BR10): not one
// this session issued.
const REBUILT_ATTEMPT_SEQ = 0;

// The leader, term and membership the witness reported: an R-1f attempt is
// re-issued only when one of them moved since it was issued (a proposal a
// leader change dropped), or the backstop window passed with no answer
// resolving it.
function retirementLevelOf(observation) {
  return [
    observation?.leaderReplicaId ?? '',
    observation?.term ?? '',
    observation?.state ?? '',
  ].join(RETIREMENT_LEVEL_SEPARATOR);
}

function shouldIssueRetirementAttempt(owner, attempt, observation) {
  if (!attempt) {
    return true;
  }
  if (attempt.answer === null) {
    // One uncertain attempt at a time: a wake re-evaluates, never resubmits.
    return false;
  }
  if (attempt.level !== retirementLevelOf(observation)) {
    return true;
  }
  const windowMs = Number(observation?.transferWindowMaxMs);
  const backstopMs = Number.isFinite(windowMs) && windowMs > 0 ?
    windowMs : REPLACE_REMOVAL_PENDING_ESCALATION_MS;
  return nowMsOf(owner) - attempt.answeredAtMs >= backstopMs;
}

/**
 * BR10: the previous owner session may have issued a REMOVE_PEER whose
 * outcome is unknown. Its record is rebuilt as an outstanding attempt,
 * answered now at the witness's current level: a changed level or the
 * backstop window resolves it; nothing is issued before.
 * @param {Object} owner
 * @param {Object} state - The owner state.
 * @param {Object} operation
 * @param {Object} observation - The fresh witness observation.
 */
function rebuildLostRetirementAttempt(owner, state, operation, observation) {
  if (state.retirementAttemptByOperationId.has(operation.operationId)) {
    return;
  }
  const rebuild = claimReplaceAttemptStateRebuild(owner, operation);
  if (!rebuild.due) {
    return;
  }
  const nowMs = nowMsOf(owner);
  state.retirementAttemptByOperationId.set(operation.operationId, {
    attemptSeq: REBUILT_ATTEMPT_SEQ,
    issuedAtMs: nowMs,
    level: retirementLevelOf(observation),
    answer: Object.freeze({rebuiltAfter: rebuild.restartClass}),
    answeredAtMs: nowMs,
    rebuiltAfter: rebuild.restartClass,
  });
}

/**
 * R-1f: propose REMOVE_PEER of the source through the witness replica while
 * the source is still a voter and its row is gone or retiring. At most one
 * attempt is in flight; a repeat after a leader, term or membership change,
 * or after the backstop window, is a raft no-op if the first one committed.
 * @param {Object} owner
 * @param {Object} operation
 * @param {Object} observation
 * @return {Promise<boolean>} Whether an attempt was issued.
 */
async function redriveReplaceSourceRetirement(owner, operation, observation) {
  const state = readOwnerState(owner);
  rebuildLostRetirementAttempt(owner, state, operation, observation);
  const attempt =
    state.retirementAttemptByOperationId.get(operation.operationId) || null;
  if (!shouldIssueRetirementAttempt(owner, attempt, observation)) {
    return false;
  }
  const issued = {
    attemptSeq: state.nextAttemptSeq,
    issuedAtMs: nowMsOf(owner),
    level: retirementLevelOf(observation),
    answer: null,
    answeredAtMs: null,
  };
  state.nextAttemptSeq += 1;
  state.retirementAttemptByOperationId.set(operation.operationId, issued);
  const {response, reason} = await deliverToReplaceWitness(
    owner, operation, ReplicaOperationMessageType.RETIRE_REPLICA_PEER);
  if (state.retirementAttemptByOperationId.get(operation.operationId) ===
      issued) {
    issued.answer = response?.[ReplicaOperationField.PROPOSAL] ||
      {reason: reason || response?.status || null};
    issued.answeredAtMs = nowMsOf(owner);
  }
  return true;
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
    status: response?.status ?? null,
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
  recordReplaceWaitDiagnostic(owner, operation, reason, observation, {
    ownerPhase: classifyReplaceOwnerPhase({
      workflowStep: operation.workflowStep,
      handoffAttemptUnresolved: isReplaceHandoffAttemptUnresolved(
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

async function handleReplaceTargetDeath(owner, operation, decision, context) {
  if (decision.verdict === REPLACE_COMPLETION_VERDICT.STILL_VOTER) {
    // D2: a real premise change - fail safely and retain the source.
    await owner.failOperation(
      operation,
      REPLACE_POST_INTENT_FAILURE.TARGET_DEAD_SOURCE_RETAINED,
      {replacePostIntentFailure:
        REPLACE_POST_INTENT_FAILURE.TARGET_DEAD_SOURCE_RETAINED},
    );
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
  if (decision.verdict === REPLACE_COMPLETION_VERDICT.SOURCE_RETIRED) {
    await owner.completeOperation(operation);
    return true;
  }
  if (isTargetFailureDetectorDead(owner, operation)) {
    return handleReplaceTargetDeath(owner, operation, decision, context);
  }
  if (decision.verdict === REPLACE_COMPLETION_VERDICT.UNAVAILABLE) {
    return waitForReplaceOwner(owner, operation,
      REPLACE_WAIT_REASON.WITNESS_UNAVAILABLE, waitContext);
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
    // T5': no effect is recorded (or its backstop window passed) and the
    // source's lifecycle has not retired - (re-)send its removal effect
    // through the same remove-safety evaluation.
    recordReplaceOwnerWait(owner, operation,
      REPLACE_WAIT_REASON.SOURCE_REMOVAL_EFFECT_PENDING, rowContext);
    return owner.executeReplaceSourceRemovalEffect(operation);
  }
  await redriveReplaceSourceRetirement(owner, operation, decision.observation);
  return waitForReplaceOwner(owner, operation,
    REPLACE_WAIT_REASON.SOURCE_MEMBERSHIP_REMOVAL_PENDING, rowContext);
}

function waitAdmission(reason, witness = null) {
  return Object.freeze({
    admission: REPLACE_EFFECT_ADMISSION.WAIT, reason, witness});
}

/**
 * The synchronous checks after the last await before the REMOVE_REPLICA
 * effect (design §3.2, A12): the live operation still holds its durable
 * intent and is not terminal (a cached terminal row wins); the target has not
 * failed; and the owner's waited-on level - readiness of every node the
 * floor may count, the partition's consensus observation, the entity's
 * concurrent operations - is the one the SAFE evaluation started from.
 * @param {Object} owner
 * @param {Object} operation
 * @param {Object|null} entryLevel
 * @return {Object} Frozen admission.
 */
function revalidateReplaceSourceRemovalEffect(owner, operation, entryLevel) {
  if (isReplaceOperationTerminalObserved(owner, operation) ||
      operation.workflowStep !== WORKFLOW_STEP.STOPPING ||
      isTargetFailureDetectorDead(owner, operation)) {
    return waitAdmission(REPLACE_WAIT_REASON.EFFECT_REVALIDATION_MOVED);
  }
  if (entryLevel &&
      captureReplaceOwnerLevel(owner, operation)?.levelKey !==
        entryLevel.levelKey) {
    return waitAdmission(REPLACE_WAIT_REASON.EFFECT_REVALIDATION_MOVED);
  }
  return Object.freeze({admission: REPLACE_EFFECT_ADMISSION.SEND});
}

/**
 * The removal-effect boundary after remove safety answered SAFE: at ACTIVE,
 * read the witness, then persist the removal intent (the STOPPING CAS, with
 * the witness and its commit index) BEFORE any effect; a source that is
 * already unreachable or retiring goes to the STOPPING owner without a
 * REMOVE_REPLICA (T5''). Then the synchronous revalidations decide whether
 * the effect is sent now.
 * @param {Object} owner
 * @param {Object} operation
 * @param {Object|null} entryLevel
 * @return {Promise<Object>} Frozen {admission, reason?, witness?}.
 */
async function admitReplaceSourceRemovalEffect(owner, operation, entryLevel) {
  if (operation.workflowStep === WORKFLOW_STEP.ACTIVE) {
    const witness = await readReplaceWitnessMembership(owner, operation);
    if (witness.state !== PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER &&
        witness.state !== PARTITION_REPLICA_MEMBERSHIP_STATE.ABSENT) {
      return waitAdmission(REPLACE_WAIT_REASON.WITNESS_UNAVAILABLE, witness);
    }
    const sourceRow = await observeReplaceSourceRow(owner, operation);
    if (sourceRow.state === STOPPING_OBSERVATION_UNAVAILABLE) {
      return waitAdmission(REPLACE_WAIT_REASON.SOURCE_ROW_UNAVAILABLE,
        witness);
    }
    const sourceUnreachable =
      sourceRow.lifecycleStatus === ReplicaStatus.FAILED;
    const persisted = await owner.persistReplaceRemovalIntent(
      operation,
      buildReplaceRemovalIntentMetadata(operation, witness,
        {sourceUnreachable}),
    );
    if (!persisted) {
      return waitAdmission(REPLACE_WAIT_REASON.REMOVAL_INTENT_NOT_DURABLE,
        witness);
    }
    // A source whose lifecycle is already retiring (REMOVING/REMOVED) or
    // failed gets no effect (T5''). An absent row may be visibility lag, and
    // a source already out of the configuration may still run: both still
    // get the idempotent effect (the source answers NOT_FOUND if it is gone).
    if (sourceUnreachable ||
        RETIRING_SOURCE_ROW_STATUSES.has(sourceRow.lifecycleStatus)) {
      return Object.freeze({
        admission: REPLACE_EFFECT_ADMISSION.STOPPING_OWNER, witness});
    }
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
 * S9 (ACTIVE: no time bound) and D2 (after durable intent: no timer-driven
 * FAILED): no elapsed-time budget may end a partition REPLACE at ACTIVE or
 * STOPPING; the budget becomes this diagnostic.
 * @param {Object} operation
 * @return {boolean}
 */
function isReplaceExemptFromTimeBudget(operation) {
  return isPartitionReplaceOwnerPhase(operation);
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
  isReplaceExemptFromTimeBudget,
  isReplaceOperationTerminalObserved,
  isReplaceRemovalIntentDurable,
  isTargetFailureDetectorDead,
  readReplaceOwnerDiagnostic,
  readReplaceOwnerPhase,
  recordReplaceBudgetDiagnostic,
  recordReplaceOwnerWait,
  recordReplaceSourceRemovalEffect,
  reconcileReplaceStoppingOwner,
  recordReplaceWaitDiagnostic,
};
