import {
  PRIORITY_RECOVERY_CORRELATION_KEY,
  PRIORITY_RECOVERY_PRESSURE_STATE,
} from './priority-recovery-diagnostics-constants.js';

const arrayIsArray = Array.isArray;
const arrayPrototypeIncludes = Function.call.bind(Array.prototype.includes);
const arrayPrototypePush = Function.call.bind(Array.prototype.push);
const arrayPrototypeSort = Function.call.bind(Array.prototype.sort);
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const safeString = String;
const stringPrototypeTrim = Function.call.bind(String.prototype.trim);
const OWN_DATA_VALUE_FIELD = 'value';

const PRIORITY_RECOVERY_HELPER_LITERAL = Object.freeze({
  VALUE: '',
  PARTITION_SUFFIX: '-p',
});
const PRIORITY_RECOVERY_LOGS_TABLE_FIELD = Object.freeze({
  PENDING_WRITES: 'pendingWrites',
  PENDING_WRITE_GROWTH_COUNT: 'pendingWriteGrowthCount',
  RETAINED_BACKLOG_GROWTH_COUNT: 'retainedBacklogGrowthCount',
  RETAINED_PRESSURE_BACKLOG_CAP: 'retainedPressureBacklogCap',
  MAX_PENDING_WRITES: 'maxPendingWrites',
  CONSECUTIVE_DEFERRED_WRITE_FAILURES: 'consecutiveDeferredWriteFailures',
  SHARED_PRESSURE_BACKPRESSURED: 'sharedPressureBackpressured',
  TRANSPORT_PRESSURE_BACKPRESSURED: 'transportPressureBackpressured',
  QUERY_PRESSURE_BACKPRESSURED: 'queryPressureBackpressured',
});
const PRIORITY_RECOVERY_TABLE_SUFFIX_PATTERN = /^\d+$/;

function normalizePriorityRecoveryInteger(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? Math.floor(parsedValue) : null;
}

function normalizePriorityRecoveryStringList(values = []) {
  const normalized = [];
  if (!arrayIsArray(values)) return normalized;
  for (let index = 0; index < values.length; index += 1) {
    const descriptor = objectGetOwnPropertyDescriptor(values, String(index));
    if (!descriptor || !objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD)) {
      continue;
    }
    const value = stringPrototypeTrim(safeString(
      descriptor.value || PRIORITY_RECOVERY_HELPER_LITERAL.VALUE,
    ));
    if (value.length > 0 && !arrayPrototypeIncludes(normalized, value)) {
      arrayPrototypePush(normalized, value);
    }
  }
  arrayPrototypeSort(normalized);
  return normalized;
}

function inferPriorityRecoveryTableNameFromPartitionId(partitionId) {
  const normalizedPartitionId = String(partitionId || PRIORITY_RECOVERY_HELPER_LITERAL.VALUE);
  if (normalizedPartitionId.length === 0) {
    return null;
  }
  const partitionSuffixIndex = normalizedPartitionId.lastIndexOf(
    PRIORITY_RECOVERY_HELPER_LITERAL.PARTITION_SUFFIX,
  );
  if (partitionSuffixIndex <= 0) {
    return normalizedPartitionId;
  }
  const suffix = normalizedPartitionId.slice(partitionSuffixIndex + 2);
  if (!PRIORITY_RECOVERY_TABLE_SUFFIX_PATTERN.test(suffix)) {
    return normalizedPartitionId;
  }
  return normalizedPartitionId.slice(0, partitionSuffixIndex);
}

function buildPriorityRecoveryCorrelationKey(partitionId, epoch, operationId) {
  const normalizedPartitionId = String(partitionId || PRIORITY_RECOVERY_HELPER_LITERAL.VALUE)
    .trim();
  if (normalizedPartitionId.length === 0) {
    return null;
  }
  const normalizedEpoch = Number.isInteger(epoch) ?
    String(epoch) :
    PRIORITY_RECOVERY_CORRELATION_KEY.EPOCH_UNKNOWN;
  const normalizedOperationId =
    typeof operationId === 'string' && operationId.length > 0 ?
      operationId :
      PRIORITY_RECOVERY_CORRELATION_KEY.OPERATION_UNKNOWN;
  return [normalizedPartitionId, normalizedEpoch, normalizedOperationId].join(
    PRIORITY_RECOVERY_CORRELATION_KEY.SEPARATOR,
  );
}

function normalizePriorityRecoveryNonNegativeInteger(value) {
  const normalizedValue = normalizePriorityRecoveryInteger(value);
  if (!Number.isFinite(normalizedValue) || normalizedValue < 0) {
    return null;
  }
  return normalizedValue;
}

function buildPriorityRecoveryPressureConditions(logsTable = null) {
  const normalizedLogsTable =
    logsTable && typeof logsTable === 'object' ?
      logsTable :
      null;
  const pendingWrites = normalizePriorityRecoveryNonNegativeInteger(
    normalizedLogsTable?.[PRIORITY_RECOVERY_LOGS_TABLE_FIELD.PENDING_WRITES],
  );
  const pendingWriteGrowthCount = normalizePriorityRecoveryNonNegativeInteger(
    normalizedLogsTable?.[
      PRIORITY_RECOVERY_LOGS_TABLE_FIELD.PENDING_WRITE_GROWTH_COUNT
    ],
  );
  const retainedBacklogGrowthCount = normalizePriorityRecoveryNonNegativeInteger(
    normalizedLogsTable?.[
      PRIORITY_RECOVERY_LOGS_TABLE_FIELD.RETAINED_BACKLOG_GROWTH_COUNT
    ],
  );
  const retainedPressureBacklogCap = normalizePriorityRecoveryNonNegativeInteger(
    normalizedLogsTable?.[
      PRIORITY_RECOVERY_LOGS_TABLE_FIELD.RETAINED_PRESSURE_BACKLOG_CAP
    ],
  );
  const maxPendingWrites = normalizePriorityRecoveryNonNegativeInteger(
    normalizedLogsTable?.[PRIORITY_RECOVERY_LOGS_TABLE_FIELD.MAX_PENDING_WRITES],
  );
  const consecutiveDeferredWriteFailures =
    normalizePriorityRecoveryNonNegativeInteger(
      normalizedLogsTable?.[
        PRIORITY_RECOVERY_LOGS_TABLE_FIELD
          .CONSECUTIVE_DEFERRED_WRITE_FAILURES
      ],
    );
  const sharedPressureBackpressured =
    normalizedLogsTable?.[
      PRIORITY_RECOVERY_LOGS_TABLE_FIELD.SHARED_PRESSURE_BACKPRESSURED
    ] === true;
  const transportPressureBackpressured =
    normalizedLogsTable?.[
      PRIORITY_RECOVERY_LOGS_TABLE_FIELD.TRANSPORT_PRESSURE_BACKPRESSURED
    ] === true;
  const queryPressureBackpressured =
    normalizedLogsTable?.[
      PRIORITY_RECOVERY_LOGS_TABLE_FIELD.QUERY_PRESSURE_BACKPRESSURED
    ] === true;

  const pressureEvidence = Object.freeze({
    hasPendingWrites:
      Number.isFinite(pendingWrites) && pendingWrites > 0,
    hasPendingWriteGrowth:
      Number.isFinite(pendingWriteGrowthCount) &&
      pendingWriteGrowthCount > 0,
    hasRetainedBacklogGrowth:
      Number.isFinite(retainedBacklogGrowthCount) &&
      retainedBacklogGrowthCount > 0,
    isBackpressuredBySharedSignals:
      sharedPressureBackpressured === true ||
      transportPressureBackpressured === true ||
      queryPressureBackpressured === true ||
      (Number.isFinite(consecutiveDeferredWriteFailures) &&
        consecutiveDeferredWriteFailures > 0),
  });

  let pressureState = PRIORITY_RECOVERY_PRESSURE_STATE.NONE;
  if (pressureEvidence.isBackpressuredBySharedSignals === true) {
    pressureState = PRIORITY_RECOVERY_PRESSURE_STATE.BACKPRESSURED;
  } else if (
    pressureEvidence.hasPendingWrites ||
    pressureEvidence.hasPendingWriteGrowth ||
    pressureEvidence.hasRetainedBacklogGrowth
  ) {
    pressureState = PRIORITY_RECOVERY_PRESSURE_STATE.WRITE_BACKLOG;
  }

  const blocksCriticalRecoveryActuation =
    pressureState === PRIORITY_RECOVERY_PRESSURE_STATE.BACKPRESSURED;

  return Object.freeze({
    pressureState,
    blocksCriticalRecoveryActuation,
    ...(Number.isFinite(pendingWrites) ? {pendingWrites} : {}),
    ...(Number.isFinite(pendingWriteGrowthCount) ?
      {pendingWriteGrowthCount} :
      {}),
    ...(Number.isFinite(retainedBacklogGrowthCount) ?
      {retainedBacklogGrowthCount} :
      {}),
    ...(Number.isFinite(retainedPressureBacklogCap) ?
      {retainedPressureBacklogCap} :
      {}),
    ...(Number.isFinite(maxPendingWrites) ? {maxPendingWrites} : {}),
    ...(Number.isFinite(consecutiveDeferredWriteFailures) ?
      {consecutiveDeferredWriteFailures} :
      {}),
    ...(sharedPressureBackpressured === true ?
      {sharedPressureBackpressured: true} :
      {}),
    ...(transportPressureBackpressured === true ?
      {transportPressureBackpressured: true} :
      {}),
    ...(queryPressureBackpressured === true ?
      {queryPressureBackpressured: true} :
      {}),
  });
}

export {
  buildPriorityRecoveryCorrelationKey,
  buildPriorityRecoveryPressureConditions,
  inferPriorityRecoveryTableNameFromPartitionId,
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryNonNegativeInteger,
  normalizePriorityRecoveryStringList,
};
