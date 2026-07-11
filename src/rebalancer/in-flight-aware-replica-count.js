import {buildReplicaInventorySnapshot} from './replica-inventory.js';
import {SERVICE_TYPE} from '../constants/service.js';
import {
  REPLICA_INVENTORY_OBSERVATION_STATE,
} from './replica-inventory-constants.js';
import {OperationType} from './replica-status.js';

function adaptLegacyReplaceSourceShape(operation, committedReplicaIds) {
  const type = String(
    operation?.type || operation?.operation_type || operation?.operationType || '',
  ).toUpperCase();
  const explicitSource =
    operation?.source_replica_id || operation?.sourceReplicaId;
  const replicaId = operation?.replica_id || operation?.replicaId;
  if (
    type !== OperationType.REPLACE ||
    explicitSource ||
    !committedReplicaIds.has(replicaId)
  ) {
    return operation;
  }
  return {
    ...operation,
    source_replica_id: replicaId,
    replica_id: null,
  };
}

/**
 * Compatibility projection for callers that still consume the historical
 * accounting shape. The committed-row/in-flight-operation join is owned by the
 * canonical replica inventory; this module intentionally contains no second
 * classification implementation.
 *
 * @param {Object} options
 * @param {Array<Object>} options.currentReplicas
 * @param {Array<Object>} options.inFlightOperations
 * @param {string|null} options.partitionId
 * @return {Object}
 */
export function computeInFlightAwareReplicaAccounting({
  currentReplicas = [],
  inFlightOperations = [],
  partitionId = null,
} = {}) {
  const committedReplicaIds = new Set(currentReplicas.map((replica) =>
    replica?.replica_id || replica?.replicaId ||
      replica?.service_id || replica?.serviceId,
  ));
  const adaptedOperations = inFlightOperations.map((operation) =>
    adaptLegacyReplaceSourceShape(operation, committedReplicaIds),
  );
  return buildReplicaInventorySnapshot({
    entityType: SERVICE_TYPE.PARTITION,
    entityId: partitionId,
    committedRowsObservation: {
      state: currentReplicas.length > 0 ?
        REPLICA_INVENTORY_OBSERVATION_STATE.PRESENT :
        REPLICA_INVENTORY_OBSERVATION_STATE.EMPTY,
      rows: currentReplicas,
    },
    inFlightOperationObservation: {
      state: adaptedOperations.length > 0 ?
        REPLICA_INVENTORY_OBSERVATION_STATE.PRESENT :
        REPLICA_INVENTORY_OBSERVATION_STATE.EMPTY,
      operations: adaptedOperations,
    },
  }).accounting;
}
