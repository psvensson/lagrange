import {
  TABLES,
} from '../constants/index.js';
import {
  deriveAuthoritativeRepairTables,
} from './admin-authoritative-repair-policy.js';

function normalizeAuthoritativeRepairTriggerCodes(triggerCodes = []) {
  return [...new Set(
    (Array.isArray(triggerCodes) ? triggerCodes : [])
      .filter((triggerCode) =>
        typeof triggerCode === 'string' &&
        triggerCode.length > 0,
      ),
  )];
}

function hasAuthoritativeRepairTrigger(
  repairEvaluation,
  triggerCode,
) {
  if (typeof triggerCode !== 'string' ||
      triggerCode.length === 0) {
    return false;
  }
  return normalizeAuthoritativeRepairTriggerCodes(
    repairEvaluation?.triggerCodes,
  ).includes(triggerCode);
}

function isReplicaOperationsOnlyTableSet(tableNames = []) {
  const normalizedTableNames =
    normalizeAuthoritativeRepairTriggerCodes(tableNames);
  return normalizedTableNames.length > 0 &&
    normalizedTableNames.every((tableName) =>
      tableName === TABLES.REPLICA_OPERATIONS,
    );
}

function isReplicaOperationsOnlyRepairScope(repairEvaluation) {
  return isReplicaOperationsOnlyTableSet(
    deriveAuthoritativeRepairTables({
      triggerCodes: normalizeAuthoritativeRepairTriggerCodes(
        repairEvaluation?.triggerCodes,
      ),
    }),
  );
}

function shouldAttemptAuthoritativeRepair(options = {}) {
  if (options.repairEvaluation?.shouldRepair !== true) {
    return false;
  }
  return options.forceAuthoritativeRepair === true ||
    options.allowAuthoritativeRepair === true;
}

export {
  hasAuthoritativeRepairTrigger,
  isReplicaOperationsOnlyRepairScope,
  isReplicaOperationsOnlyTableSet,
  normalizeAuthoritativeRepairTriggerCodes,
  shouldAttemptAuthoritativeRepair,
};
