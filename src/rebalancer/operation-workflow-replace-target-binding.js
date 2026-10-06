import {WORKFLOW_STEP} from '../constants/workflow.js';
import {OperationType} from './replica-status.js';
import {
  assertCanonicalRebalancerEntityIdentity,
} from './rebalancer-entity-identity.js';

function needsReplaceCreateTargetBinding(
  operation,
  replaceRemoveDispatchPhase,
  sourceReplicaId,
) {
  return operation?.type === OperationType.REPLACE &&
    replaceRemoveDispatchPhase !== true &&
    (!operation.replicaId || operation.replicaId === sourceReplicaId);
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
      confirmPersistence: true,
      expectedWorkflowStep: operation.workflowStep,
    },
  );
  if (persisted !== true) return null;
  operation.replicaId = replicaId;
  return operation;
}

export {bindReplaceCreateTargetReplicaId};
