/**
 * Owner contract:
 * Owner: the post-intent admission of terminal writes of a create (quest
 * replace-source-removal-owner; D2, R11, A11.1; M2 for ADD) - the ONE
 * no-fail guard both create kinds share: past its intent a create is never
 * failed by a timer or a heuristic.
 * Inputs: the operation's durable step (authoritative read), the ADD
 * target's authoritative row, the owner's R-1a verdict, and the options a
 * terminal was admitted with.
 * Canonical output: whether a FAILED of a partition REPLACE or ADD is
 * admitted, the step CAS its write carries, and whether a refused ADD is
 * completed instead; whether the terminal-transition repair may re-assert a
 * retained REPLACE terminal.
 * Prohibited: no terminal is decided or written here.
 */
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  REPLACE_COMPLETION_VERDICT,
  REPLACE_POST_INTENT_FAILURE,
  decideReplaceCompletion,
  isPartitionReplace,
  isReplaceRemovalIntentDurable,
} from './operation-workflow-replace-owner.js';

import {isLiveCreateTargetStatus} from './replica-status.js';

const {
  EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  SERVICE_TYPE,
  WORKFLOW_STEP,
} = OPERATION_WORKFLOW_OWNER_SHARED;

// The ADD target's liveness is read from the authority only: a cache row
// that lags is no evidence either way, and absence of evidence admits the
// failure exactly as before.
const ADD_TARGET_LIVENESS_READ = Object.freeze({
  ...EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
  allowCacheFallback: false,
});

// A failure no post-intent boundary applies to (not a partition create).
const NO_INTENT_FAILURE_ADMISSION = Object.freeze({
  admitted: true,
  expectedWorkflowStep: null,
  completeInstead: false,
});

function isPartitionAdd(operation) {
  return operation?.type === OperationType.ADD &&
    (operation?.entityType === undefined ||
      operation?.entityType === null ||
      operation?.entityType === SERVICE_TYPE.PARTITION);
}

/**
 * The step the operation's durable row holds, from the authoritative read;
 * when the authority cannot be read, the caller's copy - whose FAILED write
 * is then a CAS on exactly that step, so a copy that lags the durable intent
 * still cannot cross it. A caller's in-memory copy may lag the durable
 * removal intent; the D2 boundary is the row's.
 * @param {Object} owner
 * @param {Object} operation
 * @return {Promise<string>}
 */
async function readReplaceDurableStep(owner, operation) {
  const authoritative = typeof owner.repository
    ?.queryReplicaOperationPersistenceAuthorityOperation ===
      OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION ?
    await owner.repository.queryReplicaOperationPersistenceAuthorityOperation(
      operation) : null;
  return authoritative?.workflowStep || operation.workflowStep;
}

/**
 * D2's admission of a terminal FAILED for a partition REPLACE, decided on
 * the DURABLE step: before the durable intent every existing failure
 * applies; after it, only target death with the source still a voter. The
 * admitted write is a CAS on the step it was admitted against, so a copy
 * that read before the intent landed cannot write FAILED past it.
 * @param {Object} owner
 * @param {Object} operation
 * @param {Object} options - failOperation options.
 * @return {Promise<Object>} Frozen {admitted, expectedWorkflowStep}.
 */
async function admitReplaceTerminalFailure(owner, operation, options = {}) {
  const durableStep = await readReplaceDurableStep(owner, operation);
  const admitted = !isReplaceRemovalIntentDurable(
    {...operation, workflowStep: durableStep}) ||
    options?.replacePostIntentFailure ===
      REPLACE_POST_INTENT_FAILURE.TARGET_DEAD_SOURCE_RETAINED;
  return Object.freeze({admitted, expectedWorkflowStep: durableStep,
    completeInstead: false});
}

/**
 * M2: an ADD's intent is its target going live - the authoritative row
 * ACTIVE (isLiveCreateTargetStatus). An ADD failed after that (the SYNCING
 * step timer firing after the promotion, a lost completion answer) would
 * leave a healthy voter as a failed target: it is refused and completed
 * instead, as the operation completes on that same evidence.
 * @param {Object} owner
 * @param {Object} operation
 * @return {Promise<Object>} Frozen {admitted, expectedWorkflowStep,
 *   completeInstead}.
 */
async function admitAddTerminalFailure(owner, operation) {
  const observation = typeof owner.repository?.getActualReplicaObservation ===
    OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION ?
    await owner.repository.getActualReplicaObservation(operation.replicaId,
      operation.partitionId, operation.targetNodeId,
      ADD_TARGET_LIVENESS_READ) : null;
  const live = observation?.state === OPERATION_WORKFLOW_OWNER_LITERAL
    .OBSERVED && isLiveCreateTargetStatus(observation.lifecycleStatus);
  return Object.freeze({admitted: !live, expectedWorkflowStep: null,
    completeInstead: live});
}

/**
 * The one post-intent failure admission of a create, for both kinds.
 * @param {Object} owner
 * @param {Object} operation
 * @param {Object} options - failOperation options.
 * @return {Promise<Object>} Frozen {admitted, expectedWorkflowStep,
 *   completeInstead}.
 */
function admitCreateTerminalFailure(owner, operation, options = {}) {
  if (isPartitionReplace(operation)) {
    return admitReplaceTerminalFailure(owner, operation, options);
  }
  if (isPartitionAdd(operation)) {
    return admitAddTerminalFailure(owner, operation);
  }
  return Promise.resolve(NO_INTENT_FAILURE_ADMISSION);
}

/**
 * R11 / A11.1: the terminal-transition repair re-asserts a retained terminal
 * projection later; for a partition REPLACE it is never a second route to a
 * terminal. A retained REMOVED is re-decided by R-1a now; a retained FAILED
 * is written only as the step CAS it was admitted with, while the durable
 * row still holds that step.
 * The repair's admission and the options its write carries. A retained
 * FAILED armed without admission options (an older arm) is admitted again
 * now, from the durable step, exactly as failOperation admits it.
 * @param {Object} owner
 * @param {Object} projectedOperation
 * @param {Object} persistOptions
 * @return {Promise<Object>} Frozen {admitted, persistOptions}.
 */
async function admitReplaceTerminalRepair(owner, projectedOperation,
  persistOptions = {}) {
  if (!isPartitionReplace(projectedOperation)) {
    return Object.freeze({admitted: true, persistOptions});
  }
  if (projectedOperation.workflowStep === WORKFLOW_STEP.REMOVED) {
    const decision = await decideReplaceCompletion(owner, projectedOperation);
    return Object.freeze({
      admitted: decision.verdict === REPLACE_COMPLETION_VERDICT.SOURCE_RETIRED,
      persistOptions,
    });
  }
  const durableStep = await readReplaceDurableStep(owner, projectedOperation);
  const expectedStep = persistOptions.expectedWorkflowStep;
  if (typeof expectedStep === 'string') {
    return Object.freeze({admitted: durableStep === expectedStep,
      persistOptions});
  }
  const admission = await admitReplaceTerminalFailure(owner,
    {...projectedOperation, workflowStep: durableStep},
    {replacePostIntentFailure: projectedOperation.errorMessage});
  return Object.freeze({
    admitted: admission.admitted,
    persistOptions: {...persistOptions,
      expectedWorkflowStep: admission.expectedWorkflowStep},
  });
}

export {
  admitCreateTerminalFailure,
  admitReplaceTerminalRepair,
};
