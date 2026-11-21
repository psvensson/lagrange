import {buildOperationTransitionOutcome} from './operation-workflow-transition-outcome.js';
import {COLUMN, TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from '../control-plane/control-plane-system-table-gateway-constants.js';
import {committedStampOfAnswer} from '../raft/raft-committed-membership-stamp.js';
import {UNIFIED_SERVICE_TYPE} from '../constants/unified-service-lifecycle.js';
import {WORKFLOW_STEP} from '../constants/workflow.js';
import {
  buildCommittedBootstrapTopology,
  readCommittedMembershipStamp,
} from './committed-membership-bootstrap-read.js';
import {
  assertCanonicalRebalancerEntityIdentity,
} from './rebalancer-entity-identity.js';
import {ReplicaOperationField} from './replica-operation-constants.js';
import {assertOperationUpdateSubject} from './replica-operation-update-outcome.js';
import {OPERATION_METADATA_KEY} from './replica-operation-progress.js';
import {PLACEMENT_TRANSITION_KIND} from './replica-placement-owner-constants.js';
import {OperationType} from './replica-status.js';

function needsReplaceCreateTargetBinding(
  operation,
  replaceRemoveDispatchPhase,
  sourceReplicaId,
) {
  return operation?.type === OperationType.REPLACE &&
    replaceRemoveDispatchPhase !== true &&
    (!operation.replicaId || operation.replicaId === sourceReplicaId);
}

function requiresPlacementCreateBootstrapTopology(
  operation,
  replaceRemoveDispatchPhase,
) {
  if (!operation || replaceRemoveDispatchPhase === true ||
      (operation.type !== OperationType.ADD &&
        operation.type !== OperationType.REPLACE) ||
      operation.entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE ||
      operation.entityType === UNIFIED_SERVICE_TYPE.MESSAGE_GROUP) {
    return false;
  }
  const placementAdmission =
    operation.stepsHistory?.[0]?.[OPERATION_METADATA_KEY.PLACEMENT_ADMISSION];
  return placementAdmission?.transitionKind === PLACEMENT_TRANSITION_KIND.PLACEMENT;
}

function readServiceRowsForBootstrap(owner, partitionId) {
  if (!owner?.systemTableCache) {
    return [];
  }
  return owner.systemTableCache.filter(
    TABLES.SERVICES,
    (row) => row?.[COLUMN.PARTITION_ID] === partitionId,
  );
}

function projectBootstrapTopology(operation, topology) {
  const firstStep = {
    ...operation.stepsHistory[0],
    [OPERATION_METADATA_KEY.REPLICA_IDS]: topology.replicaIds,
    [OPERATION_METADATA_KEY.PEER_ADDRESSES]: topology.peerAddresses,
    [OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP]: topology.bootstrapMembership,
  };
  return {
    ...operation,
    stepsHistory: [firstStep, ...operation.stepsHistory.slice(1)],
    [ReplicaOperationField.REPLICA_IDS]: topology.replicaIds,
    [ReplicaOperationField.PEER_ADDRESSES]: topology.peerAddresses,
    [ReplicaOperationField.BOOTSTRAP_MEMBERSHIP]: topology.bootstrapMembership,
  };
}

function deferPlacementBootstrapBinding(owner, operation, reason, source) {
  const error = new Error(reason, {cause: source});
  error.deferRetry = true;
  error.retryAfterMs = source?.retryAfterMs;
  owner.deferDispatchRetry(operation, error);
  return null;
}

async function bindPlacementBootstrapTopology(owner, operation, sourceReplicaId) {
  const observation = await owner.repository.queryAuthoritativeOperationVisibilityObservation(
    operation.operationId,
    {
      authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
      requireCompleteExactKey: true,
    },
  );
  if (observation.deferredOutcome) {
    return deferPlacementBootstrapBinding(owner, operation,
      'Placement CREATE bootstrap row is unavailable', observation.deferredOutcome);
  }
  const current = observation.operation;
  if (!current || current.completedAt !== null) return null;
  assertOperationUpdateSubject(operation, current);
  if (!requiresPlacementCreateBootstrapTopology(current, false) ||
      !current.replicaId || current.replicaId !== operation.replicaId ||
      current.createdAt !== operation.createdAt ||
      current.membershipPublicationEpoch !== operation.membershipPublicationEpoch ||
      current.replicaId === sourceReplicaId) {
    return null;
  }

  if (operation.createAdmissionState != null && current.createAdmissionState == null) {
    return deferPlacementBootstrapBinding(owner, operation,
      'Placement CREATE admission is not yet observable');
  }
  const recordedStamp = current[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP];
  if (committedStampOfAnswer(recordedStamp) !== null) return current;
  // Once CREATE has been admitted, an absent stamp cannot be reconstructed
  // from a newer view of Raft membership. Retain that operation as unresolved.
  if (recordedStamp != null || current.createAdmissionState != null ||
      (current.workflowStep !== WORKFLOW_STEP.PENDING &&
        current.workflowStep !== WORKFLOW_STEP.SENDING)) {
    return deferPlacementBootstrapBinding(owner, operation,
      'Original placement CREATE bootstrap topology is unresolved');
  }

  try {
    const topology = await buildCommittedBootstrapTopology({
      partitionId: current.partitionId,
      targetNodeId: current.targetNodeId,
      targetReplicaId: current.replicaId,
      readStamp: () => readCommittedMembershipStamp(owner, current.partitionId),
      readAddressBook: () => readServiceRowsForBootstrap(owner, current.partitionId),
    });
    const projected = projectBootstrapTopology(current, topology);
    const persisted = await owner.repository.persistOperationUpdate(projected, {
      ...owner.buildOperationTransitionPersistOptions(),
      expectedWorkflowStep: current.workflowStep,
      expectedStepsHistory: current.stepsHistory,
      requireCreateAdmissionAbsent: true,
      requireExactCreateTarget: true,
    });
    const outcome = buildOperationTransitionOutcome(persisted,
      {repository: owner.repository, requestedOperation: projected});
    if (outcome.committed) return outcome.operation;
  } catch (error) {
    return deferPlacementBootstrapBinding(owner, operation,
      'Placement CREATE bootstrap binding was not confirmed', error);
  }
  return deferPlacementBootstrapBinding(owner, operation,
    'Placement CREATE bootstrap compare-and-set did not commit');
}

/**
 * Bind a REPLACE target through the workflow owner's durable row before
 * CREATE admission can claim it.
 * @param {Object} owner
 * @param {Object} operation
 * @param {boolean} replaceRemoveDispatchPhase
 * @param {?string} sourceReplicaId
 * @return {Promise<?Object>}
 */
async function bindReplaceCreateTargetReplicaId(
  owner,
  operation,
  replaceRemoveDispatchPhase,
  sourceReplicaId,
) {
  if (requiresPlacementCreateBootstrapTopology(operation, replaceRemoveDispatchPhase)) {
    return bindPlacementBootstrapTopology(owner, operation, sourceReplicaId);
  }
  if (!needsReplaceCreateTargetBinding(
    operation,
    replaceRemoveDispatchPhase,
    sourceReplicaId,
  )) {
    return operation;
  }
  // An admitted CREATE is already bound to the exact durable replica_id.
  // Never rotate that identity from a later in-memory dispatch snapshot.
  if (operation.createAdmissionState != null) return null;
  const {entityType, entityId} =
    assertCanonicalRebalancerEntityIdentity(operation);
  const replicaId = await owner.allocateCanonicalReplicaId({
    partitionId: operation.partitionId,
    entityType,
    entityId,
    excludeReplicaIds: sourceReplicaId ? [sourceReplicaId] : [],
  });
  if (!replicaId || replicaId === sourceReplicaId) return null;
  if (operation.workflowStep === WORKFLOW_STEP.PENDING) {
    // The PENDING -> SENDING CAS below persists this target in the same write
    // that establishes the admission workflow anchor.
    operation.replicaId = replicaId;
    return operation;
  }
  const projectedOperation = {...operation, replicaId};
  const persisted = await owner.repository.persistOperationUpdate(
    projectedOperation,
    {
      ...owner.buildOperationTransitionPersistOptions(),
      expectedWorkflowStep: operation.workflowStep,
    },
  );
  const outcome = buildOperationTransitionOutcome(persisted,
    {repository: owner.repository, requestedOperation: projectedOperation});
  if (!outcome.committed) return null;
  operation.replicaId = replicaId;
  return operation;
}

export {bindReplaceCreateTargetReplicaId, requiresPlacementCreateBootstrapTopology};
