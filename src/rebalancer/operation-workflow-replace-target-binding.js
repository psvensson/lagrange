import {buildOperationTransitionOutcome} from './operation-workflow-transition-outcome.js';
import {COLUMN, TABLES} from '../constants/index.js';
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

function isPlacementCreateOperation(operation, replaceRemoveDispatchPhase) {
  if (!operation || replaceRemoveDispatchPhase === true) {
    return false;
  }
  if (
    operation.type !== OperationType.ADD &&
    operation.type !== OperationType.REPLACE
  ) {
    return false;
  }
  const placementAdmission =
    operation.stepsHistory?.[0]?.[OPERATION_METADATA_KEY.PLACEMENT_ADMISSION];
  return (
    placementAdmission?.transitionKind === PLACEMENT_TRANSITION_KIND.PLACEMENT
  );
}

function needsPlacementCreateBootstrapTopology(
  operation,
  replaceRemoveDispatchPhase,
) {
  if (
    !isPlacementCreateOperation(operation, replaceRemoveDispatchPhase) ||
    Boolean(operation[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP])
  ) {
    return false;
  }
  return (
    operation.entityType !== UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE &&
    operation.entityType !== UNIFIED_SERVICE_TYPE.MESSAGE_GROUP &&
    typeof operation.partitionId === 'string' &&
    operation.partitionId.length > 0
  );
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

function stampOperationBootstrapTopology(operation, topology) {
  operation[ReplicaOperationField.REPLICA_IDS] = topology.replicaIds;
  operation[ReplicaOperationField.PEER_ADDRESSES] = topology.peerAddresses;
  operation[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP] =
    topology.bootstrapMembership;
  const firstStep = Array.isArray(operation.stepsHistory) ?
    operation.stepsHistory[0] : null;
  if (firstStep) {
    firstStep[OPERATION_METADATA_KEY.REPLICA_IDS] = topology.replicaIds;
    firstStep[OPERATION_METADATA_KEY.PEER_ADDRESSES] = topology.peerAddresses;
    firstStep[OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP] =
      topology.bootstrapMembership;
  }
}

async function ensurePlacementCreateBootstrapTopology(
  owner,
  operation,
  replaceRemoveDispatchPhase,
) {
  if (
    !needsPlacementCreateBootstrapTopology(
      operation,
      replaceRemoveDispatchPhase,
    )
  ) {
    return operation;
  }
  const topology = await buildCommittedBootstrapTopology({
    partitionId: operation.partitionId,
    targetNodeId: operation.targetNodeId,
    targetReplicaId: operation.replicaId,
    readStamp: () => readCommittedMembershipStamp(
      owner,
      operation.partitionId,
    ),
    readAddressBook: () => Promise.resolve(
      readServiceRowsForBootstrap(owner, operation.partitionId),
    ),
  }).catch((error) => {
    owner.deferDispatchRetry(operation, error);
    return null;
  });
  if (!topology) {
    return null;
  }
  stampOperationBootstrapTopology(operation, topology);
  return operation;
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
  if (!needsReplaceCreateTargetBinding(
    operation,
    replaceRemoveDispatchPhase,
    sourceReplicaId,
  )) {
    return ensurePlacementCreateBootstrapTopology(
      owner,
      operation,
      replaceRemoveDispatchPhase,
    );
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
    return ensurePlacementCreateBootstrapTopology(
      owner,
      operation,
      replaceRemoveDispatchPhase,
    );
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
  return ensurePlacementCreateBootstrapTopology(
    owner,
    operation,
    replaceRemoveDispatchPhase,
  );
}

export {bindReplaceCreateTargetReplicaId};
