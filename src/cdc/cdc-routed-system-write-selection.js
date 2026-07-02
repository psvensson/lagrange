import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {
  resolveInsertMutationColumnNames,
  resolveReplicaOperationMutationCoalescingKey,
} from './cdc-replica-operation-mutation-coalescing-key.js';

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
  resolveRoutedSystemTableMutationCoalescingKey,
  resolveRoutedSystemWriteRecoveryCandidateSelectionKey,
};
