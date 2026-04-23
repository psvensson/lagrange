import {NUM, TYPEOF} from '../constants/index.js';
import {
  PRIORITY_RECOVERY_CORRELATION_KEY,
  PRIORITY_RECOVERY_PRESSURE_STATE,
} from './priority-recovery-diagnostics-constants.js';

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
});
const PRIORITY_RECOVERY_TABLE_SUFFIX_PATTERN = /^\d+$/;

function normalizePriorityRecoveryInteger(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? Math.floor(parsedValue) : null;
}

function normalizePriorityRecoveryStringList(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || PRIORITY_RECOVERY_HELPER_LITERAL.VALUE).trim())
        .filter((value) => value.length > NUM.ZERO),
    ),
  ].sort();
}

function inferPriorityRecoveryTableNameFromPartitionId(partitionId) {
  const normalizedPartitionId = String(partitionId || PRIORITY_RECOVERY_HELPER_LITERAL.VALUE);
  if (normalizedPartitionId.length === NUM.ZERO) {
    return null;
  }
  const partitionSuffixIndex = normalizedPartitionId.lastIndexOf(
    PRIORITY_RECOVERY_HELPER_LITERAL.PARTITION_SUFFIX,
  );
  if (partitionSuffixIndex <= NUM.ZERO) {
    return normalizedPartitionId;
  }
  const suffix = normalizedPartitionId.slice(partitionSuffixIndex + 2);
  if (!PRIORITY_RECOVERY_TABLE_SUFFIX_PATTERN.test(suffix)) {
    return normalizedPartitionId;
  }
  return normalizedPartitionId.slice(NUM.ZERO, partitionSuffixIndex);
}

function buildPriorityRecoveryCorrelationKey(partitionId, epoch, operationId) {
  const normalizedPartitionId = String(partitionId || PRIORITY_RECOVERY_HELPER_LITERAL.VALUE)
    .trim();
  if (normalizedPartitionId.length === NUM.ZERO) {
    return null;
  }
  const normalizedEpoch = Number.isInteger(epoch) ?
    String(epoch) :
    PRIORITY_RECOVERY_CORRELATION_KEY.EPOCH_UNKNOWN;
  const normalizedOperationId =
    typeof operationId === TYPEOF.STRING && operationId.length > NUM.ZERO ?
      operationId :
      PRIORITY_RECOVERY_CORRELATION_KEY.OPERATION_UNKNOWN;
  return [normalizedPartitionId, normalizedEpoch, normalizedOperationId].join(
    PRIORITY_RECOVERY_CORRELATION_KEY.SEPARATOR,
  );
}

function normalizePriorityRecoveryNonNegativeInteger(value) {
  const normalizedValue = normalizePriorityRecoveryInteger(value);
  if (!Number.isFinite(normalizedValue) || normalizedValue < NUM.ZERO) {
    return null;
  }
  return normalizedValue;
}

function buildPriorityRecoveryPressureConditions(logsTable = null) {
  const normalizedLogsTable =
    logsTable && typeof logsTable === TYPEOF.OBJECT ?
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

  let pressureState = PRIORITY_RECOVERY_PRESSURE_STATE.NONE;
  if (
    sharedPressureBackpressured === true ||
    (Number.isFinite(consecutiveDeferredWriteFailures) &&
      consecutiveDeferredWriteFailures > NUM.ZERO)
  ) {
    pressureState = PRIORITY_RECOVERY_PRESSURE_STATE.BACKPRESSURED;
  } else if (
    (Number.isFinite(pendingWrites) && pendingWrites > NUM.ZERO) ||
    (Number.isFinite(pendingWriteGrowthCount) &&
      pendingWriteGrowthCount > NUM.ZERO) ||
    (Number.isFinite(retainedBacklogGrowthCount) &&
      retainedBacklogGrowthCount > NUM.ZERO)
  ) {
    pressureState = PRIORITY_RECOVERY_PRESSURE_STATE.WRITE_BACKLOG;
  }

  return Object.freeze({
    pressureState,
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
