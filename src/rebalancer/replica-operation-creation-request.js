import {SERVICE_TYPE} from '../constants/service.js';
import {OperationType} from './replica-operation-progress.js';
import {MEMBERSHIP_PUBLICATION_EPOCH_BINDING_STATE} from
  './replica-operation-membership-epoch-binding.js';

const EXPLICIT_CREATION_BINDINGS = Object.freeze([
  'targetNodeBootIncarnation',
  'targetNodeStorageIncarnation',
  'copySourceNodeId',
]);

function matchesExplicitCreationBindings(operation, move, {complete = false} = {}) {
  return EXPLICIT_CREATION_BINDINGS.every((field) =>
    (!complete && move[field] == null) ||
    (operation[field] ?? null) === (move[field] ?? null));
}

function operationMatchesCreationRequest(owner, operation, move, placementIntent) {
  const moveType = owner.normalizeMoveType(move.type);
  const epoch = owner.assertCreationRequestEpoch(move);
  const placementEntry = owner.buildPlacementCreationIntent(operation, move);
  const exactPlacementIntent = placementIntent && placementEntry &&
    placementEntry.entryId === placementIntent.entryId &&
    placementIntent.operationIntentId === (move.operationIntentId ?? null) &&
    placementIntent.replicaIntentId === (move.replicaIntentId ?? null);
  // The placement applier mints partition replica IDs. A public planner
  // replicaIntentId correlates that request to the retained native entry.
  const nativePartitionAssignment = placementEntry &&
    move.entityType === SERVICE_TYPE.PARTITION &&
    (moveType === OperationType.ADD || moveType === OperationType.REPLACE);
  const requestedReplicaIntent = nativePartitionAssignment ? null : move.replicaIntentId;
  const explicitTargetReplicaId = moveType === OperationType.ADD ?
    move.replicaId || requestedReplicaIntent :
    requestedReplicaIntent || (move.sourceReplicaId ? move.replicaId : null);
  return operation.partitionId === move.partitionId &&
    owner.operationMatchesMoveIntent(operation, move, move.entityType, move.entityId) &&
    (!move.entryId || placementEntry?.entryId === move.entryId) &&
    (!move.operationIntentId || (placementEntry ?
      exactPlacementIntent : operation.operationId === move.operationIntentId)) &&
    (!nativePartitionAssignment || !move.replicaIntentId || exactPlacementIntent) &&
    (!explicitTargetReplicaId || operation.replicaId === explicitTargetReplicaId) &&
    matchesExplicitCreationBindings(operation, move) &&
    (!Object.hasOwn(move, 'targetClaimKey') ||
      operation.targetClaimKey === move.targetClaimKey) &&
    (epoch.state === MEMBERSHIP_PUBLICATION_EPOCH_BINDING_STATE.UNBOUND ||
      operation.membershipPublicationEpoch === epoch.epoch) &&
    (moveType !== OperationType.REPLACE ||
      operation.sourceNodeId === (move.sourceNodeId || owner.nodeId));
}

export {matchesExplicitCreationBindings, operationMatchesCreationRequest};
