import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {
  resolveInsertMutationColumnNames,
  resolveReplicaOperationMutationCoalescingKey,
} from './cdc-replica-operation-mutation-coalescing-key.js';
import {deriveParticipantEntryId} from
  '../query/distributed/distributed-write-coordinator.js';

const {
  AUTHORITATIVE_ROW_VERSION_FIELD_CANDIDATES,
  CDC_SYSTEM_WRITE_RECOVERY_CANDIDATE_SELECTION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
  normalizeDeliveryPriority,
  normalizeSystemWriteRecoveryCandidateSelectionKeyValue,
  resolveSystemTableMutationDeliveryPriority,
  stableSerializeMutationKey,
} = CDC_INTEGRATION_SERVICE_SHARED;

const CDC_VOLATILE_SELECTION_PARAM_VALUE = '<volatile-row-version>';
// The identity of one routed system-table mutation (quest
// reroute-carries-the-entry-id, C1): the caller's idempotency key when it
// carries one, otherwise one minted per routed call, outside its attempt
// loop, and carried by every attempt and by the local lane.
const CDC_ROUTED_MUTATION_IDEMPOTENCY_KEY_PREFIX = 'cdc-mutation-';

function resolveRoutedMutationIdempotencyKey(options, mint) {
  const supplied = options?.idempotencyKey;
  return typeof supplied === 'string' && supplied.length > 0 ?
    supplied :
    `${CDC_ROUTED_MUTATION_IDEMPOTENCY_KEY_PREFIX}${mint()}`;
}

// The options a local replica is sent a routed mutation under: its key and
// the entryId the distributed write coordinator derives for the replica's
// partition (the one derivation); none for a write without a key.
function routedMutationLocalWriteOptions(idempotencyKey, partitionId) {
  return idempotencyKey === null ? {} : {
    idempotencyKey,
    entryId: deriveParticipantEntryId(idempotencyKey, partitionId),
  };
}

function normalizeRoutedSystemWriteSelectionParams(sql, params = []) {
  if (!Array.isArray(params) || params.length === 0) {
    return [];
  }
  const columnNames = resolveInsertMutationColumnNames(sql);
  if (columnNames.length !== params.length) {
    return params;
  }
  const volatileColumns = new Set(AUTHORITATIVE_ROW_VERSION_FIELD_CANDIDATES);
  return params.map((param, index) => {
    return volatileColumns.has(columnNames[index]) ?
      CDC_VOLATILE_SELECTION_PARAM_VALUE :
      param;
  });
}

function resolveRoutedSystemTableMutationCoalescingKey(
  tableName,
  sql,
  params,
  options,
) {
  if (
    typeof options?.coalescingKey === 'string' &&
    options.coalescingKey.length > 0
  ) {
    return options.coalescingKey;
  }
  return resolveReplicaOperationMutationCoalescingKey(tableName, sql, params);
}

function resolveRoutedSystemWriteRecoveryCandidateSelectionKey(
  tableName,
  sql,
  params = [],
  options = {},
) {
  const explicitSelectionKey =
    normalizeSystemWriteRecoveryCandidateSelectionKeyValue(
      options?.recoveryCandidateSelectionKey,
    );
  if (explicitSelectionKey !== null) {
    return explicitSelectionKey;
  }
  const explicitCoalescingKey =
    normalizeSystemWriteRecoveryCandidateSelectionKeyValue(
      options?.coalescingKey,
    );
  if (explicitCoalescingKey !== null) {
    return stableSerializeMutationKey({
      kind: CDC_SYSTEM_WRITE_RECOVERY_CANDIDATE_SELECTION_KIND,
      tableName,
      coalescingKey: explicitCoalescingKey,
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    });
  }
  const explicitSessionId =
    normalizeSystemWriteRecoveryCandidateSelectionKeyValue(
      options?.sessionId,
    );
  if (explicitSessionId !== null) {
    return explicitSessionId;
  }
  return stableSerializeMutationKey({
    kind: CDC_SYSTEM_WRITE_RECOVERY_CANDIDATE_SELECTION_KIND,
    tableName,
    sql,
    params: normalizeRoutedSystemWriteSelectionParams(sql, params),
    workClass: options?.workClass || null,
    deliveryPriority: normalizeDeliveryPriority(
      options?.deliveryPriority,
      resolveSystemTableMutationDeliveryPriority({tableName}),
    ),
    routingReadinessDimension:
      options?.routingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  });
}

export {
  resolveRoutedMutationIdempotencyKey,
  resolveRoutedSystemTableMutationCoalescingKey,
  resolveRoutedSystemWriteRecoveryCandidateSelectionKey,
  routedMutationLocalWriteOptions,
};
