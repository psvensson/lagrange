/**
 * Remove safety for replicated entities that are not partitions.
 *
 * Partitions own voter/quorum/leader semantics. Message groups and runtime
 * services own different row identities and availability floors; routing
 * either through partition safety is an authority violation, not reuse.
 */

import {SERVICE_TYPE} from '../constants/service.js';
import {UNIFIED_SERVICE_TYPE} from
  '../constants/unified-service-lifecycle.js';
import {ReplicaStatus} from './replica-status.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from
  './operation-workflow-owner-shared.js';
import {
  evaluateProjectedPeersContactable,
} from './operation-workflow-remove-safety-universal-tier.js';

const ENTITY_REMOVE_SAFETY_POLICY = Object.freeze({
  [SERVICE_TYPE.MESSAGE_GROUP]: 'message_group_raft_availability',
  [UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE]: 'runtime_service_availability',
});
const UNKNOWN_REPLICA_ID = 'unknown';

const {
  OperationType,
  REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  REMOVE_SAFETY_READINESS_DIMENSION,
} = OPERATION_WORKFLOW_OWNER_SHARED;

function isRuntimeServiceRowActive(row) {
  return row?.status === ReplicaStatus.ACTIVE &&
    typeof (row?.node_id || row?.nodeId) === 'string';
}

function isEntityReplicaCountable(context, identity, row) {
  if (identity.entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE) {
    return isRuntimeServiceRowActive(row);
  }
  if (identity.entityType === SERVICE_TYPE.MESSAGE_GROUP) {
    return context.isVoterReadyRoutableReplica(row, {
      partitionId: identity.entityId,
      decisionDimension: REMOVE_SAFETY_READINESS_DIMENSION,
      participationKind: REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
    });
  }
  return false;
}

function findReplicaRow(context, rows, operation, replicaId) {
  return rows.find((row) =>
    context.isOperationReplicaRow(row, {...operation, replicaId})) || null;
}

async function evaluateEntityRemoveSafety(context, operation, identity) {
  if (!ENTITY_REMOVE_SAFETY_POLICY[identity.entityType]) {
    return context.buildFailedRemoveSafetyEvaluation(
      `Unsupported remove-safety entity type ${identity.entityType}`,
    );
  }
  const observation = await context.getEntityReplicaRowsForSafety(identity);
  const rows = Array.isArray(observation?.rows) ? observation.rows : [];
  if (observation?.available !== true || rows.length === 0) {
    return context.buildFailedRemoveSafetyEvaluation(
      `${identity.entityType} ${identity.entityId} safety check unavailable`,
    );
  }

  const sourceReplicaId = operation.type === OperationType.REPLACE ?
    context.repository.getReplaceSourceReplicaId(operation) :
    operation.replicaId;
  if (!sourceReplicaId) {
    return context.buildFailedRemoveSafetyEvaluation(
      `${identity.entityType} ${identity.entityId} safety check unavailable`,
    );
  }
  const countableRows = rows.filter((row) =>
    isEntityReplicaCountable(context, identity, row));
  const sourceRow = findReplicaRow(
    context,
    countableRows,
    operation,
    sourceReplicaId,
  );
  if (!sourceRow) {
    return context.buildSafeRemoveSafetyEvaluation();
  }

  const projectedRows = countableRows.filter((row) =>
    !context.isOperationReplicaRow(row, {...operation, replicaId: sourceReplicaId}));
  if (context.repository.isReplaceRemovePhase(operation)) {
    const replacementReplicaId =
      context.repository.getReplaceTargetReplicaId(operation) ||
      operation.replicaId ||
      null;
    const replacementRow = findReplicaRow(
      context,
      countableRows,
      operation,
      replacementReplicaId,
    );
    if (!replacementReplicaId || !replacementRow) {
      return context.buildDeferredRemoveSafetyEvaluationForOperation(
        operation,
        `${identity.entityType} ${identity.entityId} replacement replica ` +
          `${replacementReplicaId || UNKNOWN_REPLICA_ID} is not active`,
      );
    }
    const peerGuard = await evaluateProjectedPeersContactable(
      context,
      operation,
      projectedRows,
    );
    return peerGuard || context.buildSafeRemoveSafetyEvaluation();
  }

  const minReplicaCount = await context.getEntityRemoveSafetyMinReplicaCount(
    identity.entityType,
    identity.entityId,
  );
  if (!Number.isInteger(minReplicaCount) || minReplicaCount < 1) {
    return context.buildFailedRemoveSafetyEvaluation(
      `${identity.entityType} ${identity.entityId} safety policy unavailable`,
    );
  }
  if (projectedRows.length < minReplicaCount) {
    return context.buildDeferredRemoveSafetyEvaluationForOperation(
      operation,
      `${identity.entityType} ${identity.entityId} would drop active replicas ` +
        `below minimum (${projectedRows.length}/${minReplicaCount})`,
    );
  }
  const peerGuard = await evaluateProjectedPeersContactable(
    context,
    operation,
    projectedRows,
  );
  return peerGuard || context.buildSafeRemoveSafetyEvaluation();
}

export {
  ENTITY_REMOVE_SAFETY_POLICY,
  evaluateEntityRemoveSafety,
};
