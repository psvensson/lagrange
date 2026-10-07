/**
 * Owner contract:
 * Owner: the post-intent admission of terminal writes of a create (quest
 * replace-source-removal-owner; D2, R11, A11.1; M2 for ADD) - the ONE
 * no-fail guard both create kinds share: past its intent a create is never
 * failed by a timer or a heuristic.
 * Inputs: the operation's durable step (authoritative read), the ADD
 * target's authoritative row, the owner's R-1a verdict, and the options a
 * terminal was admitted with.
 * Canonical output: two separate decisions: whether ordinary FAILED
 * settlement is admitted (including the step CAS it carries), and whether a
 * terminal FAILED create owns a fresh exact-generation cleanup claim.
 * Prohibited: no terminal is decided or written here, and settlement never
 * derives deletion authority from target lifecycle evidence.
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
import {buildFailedCreateCleanupToken} from
  './failed-create-cleanup-token.js';

const {
  EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
  OPERATION_METADATA_KEY,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  ReplicaStatus,
  SERVICE_TYPE,
  WORKFLOW_STEP,
  getOperationMetadataObject,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const CREATE_TARGET_CLEANUP_DECISION = Object.freeze({
  ELIGIBLE: 'eligible',
  INELIGIBLE: 'ineligible',
});
const CREATE_TARGET_LIFECYCLE_PRECONDITION_FIELDS = Object.freeze([
  'service_id',
  'replica_id',
  'group_id',
  'partition_id',
  'node_id',
  'service_type',
  'status',
  'created_at',
  'state_entered_at',
  'cleanup_token',
  'create_attempt_token',
]);

// The ADD target's lifecycle is read from the authority only: a cache row
// that lags is no evidence either way. A positive live row completes instead;
// absent, unavailable and non-live evidence preserve ordinary settlement.
const ADD_TARGET_LIVENESS_READ = Object.freeze({
  ...EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
  allowCacheFallback: false,
});

// A failure no post-intent boundary applies to (not a partition create).
const NO_INTENT_FAILURE_ADMISSION = Object.freeze({
  admitted: true,
  expectedWorkflowStep: null,
  completeInstead: false,
  stepMetadata: null,
  requiresRevalidation: false,
});

function isClaimedFailedCreateObservation(
  observation,
  cleanupToken,
  createAttemptToken,
) {
  return observation?.state === OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED &&
    observation.lifecycleStatus === ReplicaStatus.FAILED &&
    observation.lifecyclePrecondition?.status === ReplicaStatus.FAILED &&
    observation.lifecyclePrecondition?.cleanup_token === cleanupToken &&
    typeof createAttemptToken === 'string' && createAttemptToken.length > 0 &&
    observation.lifecyclePrecondition?.create_attempt_token ===
      createAttemptToken;
}

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

async function observeCreateTarget(owner, operation) {
  return typeof owner.repository?.getActualReplicaObservation ===
    OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION ?
    owner.repository.getActualReplicaObservation(
      operation.replicaId,
      operation.partitionId,
      operation.targetNodeId,
      ADD_TARGET_LIVENESS_READ,
    ) : null;
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
  return Object.freeze({admitted,
    expectedWorkflowStep: durableStep,
    completeInstead: false,
    stepMetadata: null,
    requiresRevalidation: true});
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
  const [observation, durableStep] = await Promise.all([
    observeCreateTarget(owner, operation),
    readReplaceDurableStep(owner, operation),
  ]);
  const live = observation?.state === OPERATION_WORKFLOW_OWNER_LITERAL
    .OBSERVED && isLiveCreateTargetStatus(observation.lifecycleStatus);
  return Object.freeze({
    admitted: !live,
    expectedWorkflowStep: durableStep,
    completeInstead: live,
    stepMetadata: null,
    requiresRevalidation: true,
  });
}

function lifecyclePreconditionsEqual(left, right) {
  return Boolean(left && right) &&
    CREATE_TARGET_LIFECYCLE_PRECONDITION_FIELDS.every(
      (field) => left[field] === right[field],
    );
}

async function captureFailedCreateTargetCleanupClaim(owner, operation) {
  if ((!isPartitionAdd(operation) && !isPartitionReplace(operation)) ||
      typeof operation?.operationId !== 'string' ||
      operation.operationId.length === 0 ||
      typeof operation?.replicaId !== 'string' ||
      operation.replicaId.length === 0) return null;
  const observation = await observeCreateTarget(owner, operation);
  const expectedCleanupToken = buildFailedCreateCleanupToken(
    operation.operationId,
  );
  const eligible = isClaimedFailedCreateObservation(
    observation,
    expectedCleanupToken,
    operation.createAdmissionAttemptToken,
  ) && CREATE_TARGET_LIFECYCLE_PRECONDITION_FIELDS.every(
    (field) => Object.hasOwn(observation.lifecyclePrecondition, field),
  );
  return eligible ? observation.lifecyclePrecondition : null;
}

function isTerminalFailedOperation(operation) {
  return operation?.workflowStep === WORKFLOW_STEP.FAILED &&
    operation?.status === ReplicaStatus.FAILED &&
    Number.isFinite(operation?.completedAt);
}

function hasCreateOperationIdentity(operation) {
  const hasOperationId = typeof operation?.operationId === 'string' &&
    operation.operationId.length > 0;
  const hasReplicaId = typeof operation?.replicaId === 'string' &&
    operation.replicaId.length > 0;
  return hasOperationId && hasReplicaId;
}

function isTerminalFailedCreateOperation(operation) {
  const partitionCreate = isPartitionAdd(operation) ||
    isPartitionReplace(operation);
  return partitionCreate && isTerminalFailedOperation(operation) &&
    hasCreateOperationIdentity(operation);
}

/**
 * Decide whether one terminal failed ADD/REPLACE target is the same exact
 * authoritative FAILED lifecycle generation admitted by the operation owner.
 * The recorded value is only a precondition: the repository remains lifecycle
 * authority and an absent/unavailable/mismatched observation is ineligible.
 * @param {Object} owner
 * @param {Object} operation
 * @return {Promise<Object>}
 */
async function decideFailedCreateTargetCleanup(owner, operation) {
  if (!isTerminalFailedCreateOperation(operation)) {
    return Object.freeze({
      decision: CREATE_TARGET_CLEANUP_DECISION.INELIGIBLE,
      observationState: null,
      lifecyclePrecondition: null,
    });
  }
  const lifecyclePrecondition = await captureFailedCreateTargetCleanupClaim(
    owner,
    operation,
  );
  const claimedPrecondition = getOperationMetadataObject(
    operation.stepsHistory,
    OPERATION_METADATA_KEY.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION,
  );
  const eligible = lifecyclePreconditionsEqual(
    lifecyclePrecondition,
    claimedPrecondition,
  );
  return Object.freeze({
    decision: eligible ?
      CREATE_TARGET_CLEANUP_DECISION.ELIGIBLE :
      CREATE_TARGET_CLEANUP_DECISION.INELIGIBLE,
    observationState: lifecyclePrecondition ?
      OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED : null,
    lifecyclePrecondition: eligible ? lifecyclePrecondition : null,
    cleanupEligible: eligible,
  });
}

/**
 * The one post-intent failure admission of a create, for both kinds.
 * @param {Object} owner
 * @param {Object} operation
 * @param {Object} options - failOperation options.
 * @return {Promise<Object>} Frozen {admitted, expectedWorkflowStep,
 *   completeInstead}.
 */
async function admitCreateTerminalFailure(owner, operation, options = {}) {
  const admission = isPartitionReplace(operation) ?
    await admitReplaceTerminalFailure(owner, operation, options) :
    isPartitionAdd(operation) ?
      await admitAddTerminalFailure(owner, operation) :
      NO_INTENT_FAILURE_ADMISSION;
  if (admission.admitted !== true) return admission;
  const lifecyclePrecondition =
    await captureFailedCreateTargetCleanupClaim(owner, operation);
  return Object.freeze({
    ...admission,
    stepMetadata: lifecyclePrecondition ? {
      [OPERATION_METADATA_KEY.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]:
        lifecyclePrecondition,
    } : null,
  });
}

async function revalidateCreateTerminalFailure(
  owner,
  operation,
  initialAdmission,
  options = {},
) {
  const current = await admitCreateTerminalFailure(owner, operation, options);
  const initialCleanupClaim = initialAdmission.stepMetadata?.[
    OPERATION_METADATA_KEY.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION
  ] || null;
  const currentCleanupClaim = current.stepMetadata?.[
    OPERATION_METADATA_KEY.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION
  ] || null;
  return current?.admitted === true &&
    current.expectedWorkflowStep === initialAdmission.expectedWorkflowStep &&
    current.completeInstead === initialAdmission.completeInstead &&
    (!initialCleanupClaim || lifecyclePreconditionsEqual(
      initialCleanupClaim,
      currentCleanupClaim,
    ));
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
  decideFailedCreateTargetCleanup,
  revalidateCreateTerminalFailure,
};
