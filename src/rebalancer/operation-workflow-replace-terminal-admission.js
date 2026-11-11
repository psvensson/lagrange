import {readStateField} from '../utils/state-field-read.js';
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
import {
  deliveryAnswerOf,
  deliveryTransportOf,
} from '../transport/transport-semantic-outcome.js';
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
import {assertCanonicalRebalancerEntityIdentity} from
  './rebalancer-entity-identity.js';
import {presentOperationOf} from
  './replica-operation-repository-operation-visibility.js';

const {
  EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
  OPERATION_METADATA_KEY,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaStatus,
  SERVICE_TYPE,
  WORKFLOW_STEP,
  getOperationMetadataObject,
  isCompletedReplicaOperationAnswer,
  isDeliveredTransportDeliveryOutcome,
  resolveOperationHandlerType,
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
const ADD_TARGET_LIVENESS_READ = EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS;

// A failure no post-intent boundary applies to (not a partition create).
const NO_INTENT_FAILURE_ADMISSION = Object.freeze({
  admitted: true,
  expectedWorkflowStep: null,
  completeInstead: false,
  stepMetadata: null,
  requiresRevalidation: false,
});

function matchesFailedCreatePreconditionTokens(
  precondition,
  cleanupToken,
  createAttemptToken,
) {
  if (!precondition || precondition.status !== ReplicaStatus.FAILED) {
    return false;
  }
  return precondition.cleanup_token === cleanupToken &&
    typeof createAttemptToken === 'string' &&
    createAttemptToken.length > 0 &&
    precondition.create_attempt_token === createAttemptToken;
}

function isClaimedFailedCreateObservation(
  observation,
  cleanupToken,
  createAttemptToken,
) {
  return observation?.state === OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED &&
    observation.lifecycleStatus === ReplicaStatus.FAILED &&
    observation.previousState !== ReplicaStatus.ACTIVE &&
    matchesFailedCreatePreconditionTokens(
      observation.lifecyclePrecondition,
      cleanupToken,
      createAttemptToken,
    );
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
  const authoritative = presentOperationOf(
    await owner.repository.queryReplicaOperationPersistenceAuthorityObservation(
      operation));
  // The persistence authority's step, else the operation's own.
  return readStateField(authoritative?.workflowStep, operation.workflowStep);
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
 * applies; after it, only target death, decided on the source node's typed
 * cancel answer (its source retained, or - degraded - already removed). The
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
    Object.values(REPLACE_POST_INTENT_FAILURE)
      .includes(options?.replacePostIntentFailure);
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

function hasCompleteLifecyclePrecondition(observation) {
  return Boolean(observation?.lifecyclePrecondition) &&
    CREATE_TARGET_LIFECYCLE_PRECONDITION_FIELDS.every(
      (field) => Object.hasOwn(observation.lifecyclePrecondition, field),
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
  ) && hasCompleteLifecyclePrecondition(observation);
  return eligible ? observation.lifecyclePrecondition : null;
}

function isObservedUnclaimedFailedTarget(observation) {
  return observation?.state === OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED &&
    observation.lifecycleStatus === ReplicaStatus.FAILED &&
    observation.previousState !== ReplicaStatus.ACTIVE &&
    hasCompleteLifecyclePrecondition(observation) &&
    observation.lifecyclePrecondition.status === ReplicaStatus.FAILED &&
    observation.lifecyclePrecondition.cleanup_token === null;
}

function isUnclaimedFailedCreateObservationForAttempt(observation, operation) {
  const attemptToken = operation?.createAdmissionAttemptToken;
  if (!isObservedUnclaimedFailedTarget(observation) ||
      typeof attemptToken !== 'string' ||
      attemptToken.length === 0 ||
      observation.lifecyclePrecondition.create_attempt_token !== attemptToken) {
    return false;
  }
  return !Number.isSafeInteger(operation?.createAdmissionReplicaCreatedAt) ||
    observation.lifecyclePrecondition.created_at ===
      operation.createAdmissionReplicaCreatedAt;
}

async function deliverClaimFailedCreateCleanup(owner, operation, precondition) {
  try {
    const canDeliver = typeof owner?.deliverReplicaOperationRequest ===
      OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION ||
      typeof owner?.messageRouter?.deliver ===
        OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION;
    if (!canDeliver) return false;
    const {entityType, entityId} =
      assertCanonicalRebalancerEntityIdentity(operation);
    const target = `${operation.targetNodeId}/service/` +
      resolveOperationHandlerType(entityType);
    const request = {
      [ReplicaOperationField.TYPE]:
        ReplicaOperationMessageType.CLAIM_FAILED_CREATE_CLEANUP,
      [ReplicaOperationField.OPERATION_ID]: operation.operationId,
      [ReplicaOperationField.OPERATION_TYPE]: operation.type,
      [ReplicaOperationField.PARTITION_ID]: operation.partitionId,
      [ReplicaOperationField.REPLICA_ID]: operation.replicaId,
      [ReplicaOperationField.ENTITY_TYPE]: entityType,
      [ReplicaOperationField.ENTITY_ID]: entityId,
      [ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]:
        precondition,
    };
    const deliveryEnvelope = typeof owner.deliverReplicaOperationRequest ===
      OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION ?
      await owner.deliverReplicaOperationRequest(
        operation,
        target,
        request,
        operation.targetNodeId,
      ) :
      await owner.messageRouter.deliver(target, request);
    const transport = deliveryTransportOf(deliveryEnvelope);
    const answer = deliveryAnswerOf(deliveryEnvelope);
    return isDeliveredTransportDeliveryOutcome(transport) &&
      isCompletedReplicaOperationAnswer(answer);
  } catch (_error) {
    return false;
  }
}

async function resolveTerminalFailedCreateCleanupPrecondition(
  owner,
  operation,
) {
  const observation = await observeCreateTarget(owner, operation);
  const expectedCleanupToken = buildFailedCreateCleanupToken(
    operation.operationId,
  );
  if (isClaimedFailedCreateObservation(
    observation,
    expectedCleanupToken,
    operation.createAdmissionAttemptToken,
  ) && hasCompleteLifecyclePrecondition(observation)) {
    return observation.lifecyclePrecondition;
  }
  if (!isUnclaimedFailedCreateObservationForAttempt(observation, operation)) {
    return null;
  }
  const claimed = await deliverClaimFailedCreateCleanup(
    owner,
    operation,
    observation.lifecyclePrecondition,
  );
  return claimed ?
    captureFailedCreateTargetCleanupClaim(owner, operation) :
    null;
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

function matchesDelayedFailedCreateTargetPrecondition(
  operation,
  lifecyclePrecondition,
) {
  if (!lifecyclePrecondition) {
    return false;
  }
  const expectedCleanupToken = buildFailedCreateCleanupToken(
    operation?.operationId,
  );
  const attemptToken = operation?.createAdmissionAttemptToken;
  if (
    typeof attemptToken !== 'string' ||
    attemptToken.length === 0 ||
    lifecyclePrecondition.create_attempt_token !== attemptToken
  ) {
    return false;
  }
  if (
    Number.isSafeInteger(operation?.createAdmissionReplicaCreatedAt) &&
    lifecyclePrecondition.created_at !==
      operation.createAdmissionReplicaCreatedAt
  ) {
    return false;
  }
  return lifecyclePrecondition.cleanup_token === expectedCleanupToken;
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
  const lifecyclePrecondition =
    await resolveTerminalFailedCreateCleanupPrecondition(
      owner,
      operation,
    );
  const claimedPrecondition = getOperationMetadataObject(
    operation.stepsHistory,
    OPERATION_METADATA_KEY.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION,
  );
  const eligible = claimedPrecondition ?
    lifecyclePreconditionsEqual(
      lifecyclePrecondition,
      claimedPrecondition,
    ) :
    matchesDelayedFailedCreateTargetPrecondition(
      operation,
      lifecyclePrecondition,
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
