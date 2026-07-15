import {createHash} from 'node:crypto';
import {
  REPLICA_OPERATION_INSERT_DISPOSITION,
} from './replica-operation-insert-disposition.js';

const REPLACE_INTENT_ID_VERSION = 'rebalance-replace-v1';
const REPLACE_OPERATION_ID_PREFIX = 'replace-op-';
const REPLACE_REPLICA_ID_PREFIX = 'replace-replica-';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const ID_DIGEST_LENGTH = 32;
const REPLACE_OPERATION_TYPE = 'REPLACE';
const REPLACE_INTENT_GENERATION_CYCLE_ERROR =
  'REPLACE intent generation revisited a durable operation ID';

function digest(value) {
  return createHash(HASH_ALGORITHM)
    .update(value)
    .digest(HASH_ENCODING)
    .slice(0, ID_DIGEST_LENGTH);
}

function buildOperationId(value) {
  return `${REPLACE_OPERATION_ID_PREFIX}${digest(value)}`;
}

function buildReplicaId(operationId) {
  return `${REPLACE_REPLICA_ID_PREFIX}${digest(operationId)}`;
}

function applyReplaceIntentIdentity(move, identity) {
  if (!identity) {
    return move;
  }
  return {
    ...move,
    operationIntentId: identity.operationIntentId,
    replicaIntentId: identity.replicaIntentId,
  };
}

function normalizeOperationPersistResult(result) {
  if (result && typeof result === 'object') {
    return result;
  }
  return {
    persisted: result === true,
    disposition: result === true ?
      REPLICA_OPERATION_INSERT_DISPOSITION.INSERTED :
      REPLICA_OPERATION_INSERT_DISPOSITION.EXISTING,
    operation: null,
  };
}

function buildCoordinatorReplaceIntentIdentity(context = {}) {
  const {
    move,
    normalizedMoveType,
    entityType,
    entityId,
    partitionId,
    criticalAddLikeIntentKey,
  } = context;
  if (
    normalizedMoveType !== REPLACE_OPERATION_TYPE ||
    move?.operationIntentId ||
    move?.replicaIntentId
  ) {
    return null;
  }

  // Critical add-like admission already treats target churn as one lifecycle,
  // so its durable identity omits the target while retaining the source
  // replica generation. Ordinary REPLACEs remain source/target-specific.
  const intent = JSON.stringify({
    version: REPLACE_INTENT_ID_VERSION,
    type: normalizedMoveType,
    entityType,
    entityId,
    partitionId,
    sourceReplicaId: move?.replicaId || null,
    targetNodeId: criticalAddLikeIntentKey ? null : move?.nodeId || null,
  });
  const operationIntentId = buildOperationId(intent);
  return Object.freeze({
    baseOperationIntentId: operationIntentId,
    operationIntentId,
    replicaIntentId: buildReplicaId(operationIntentId),
    collidedOperationIntentIds: Object.freeze([]),
  });
}

function buildSuccessorReplaceIntentIdentity(identity, terminalOperationId) {
  // Terminal rows are retained. Link the next generation to the durable row
  // that blocked this ID so every concurrent creator derives the same next ID.
  const operationIntentId = buildOperationId(JSON.stringify({
    version: REPLACE_INTENT_ID_VERSION,
    baseOperationIntentId: identity.baseOperationIntentId,
    previousOperationIntentId: terminalOperationId,
  }));
  const collidedOperationIntentIds = Object.freeze([
    ...identity.collidedOperationIntentIds,
    terminalOperationId,
  ]);
  if (collidedOperationIntentIds.includes(operationIntentId)) {
    throw new Error(REPLACE_INTENT_GENERATION_CYCLE_ERROR);
  }
  return Object.freeze({
    baseOperationIntentId: identity.baseOperationIntentId,
    operationIntentId,
    replicaIntentId: buildReplicaId(operationIntentId),
    collidedOperationIntentIds,
  });
}

function replaceIntentEntityMatches(existing, entityType, entityId) {
  const existingEntityType = existing.entityType || 'partition';
  const existingEntityId = existing.entityId || existing.partitionId;
  return [
    existingEntityType === entityType,
    existingEntityId === entityId,
  ].every(Boolean);
}

function replaceIntentTargetMatches(existing, move, allowTargetChurn) {
  if (allowTargetChurn) {
    return true;
  }
  return existing.targetNodeId === move?.nodeId;
}

function replaceIntentCollisionMatches(context = {}) {
  const {existing, move, operation, entityType, entityId, allowTargetChurn} =
    context;
  if (!existing) {
    return false;
  }
  return [
    existing.type === REPLACE_OPERATION_TYPE,
    replaceIntentEntityMatches(existing, entityType, entityId),
    existing.sourceReplicaId === move?.replicaId,
    existing.replicaId === operation?.replicaId,
    replaceIntentTargetMatches(existing, move, allowTargetChurn),
  ].every(Boolean);
}

export {
  applyReplaceIntentIdentity,
  buildCoordinatorReplaceIntentIdentity,
  buildSuccessorReplaceIntentIdentity,
  normalizeOperationPersistResult,
  replaceIntentCollisionMatches,
};
