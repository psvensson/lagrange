import {NUM, TYPEOF} from '../constants/index.js';
import {PRIORITY_RECOVERY_CORRELATION_KEY} from './priority-recovery-diagnostics-constants.js';

const PRIORITY_RECOVERY_HELPER_LITERAL = Object.freeze({
  VALUE: '',
  PARTITION_SUFFIX: '-p',
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

export {
  buildPriorityRecoveryCorrelationKey,
  inferPriorityRecoveryTableNameFromPartitionId,
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
};
