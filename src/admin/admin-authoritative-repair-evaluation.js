import {
  NUM,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {
  AUTHORITATIVE_REPAIR_TRIGGER,
  deriveAuthoritativeRepairTables,
} from './admin-authoritative-repair-policy.js';

const DEFAULT_AUTO_REPAIR_TRIGGER_CODES = Object.freeze([
  AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP,
]);

function normalizeAuthoritativeRepairTriggerCodes(triggerCodes = []) {
  return [...new Set(
    (Array.isArray(triggerCodes) ? triggerCodes : [])
      .filter((triggerCode) =>
        typeof triggerCode === TYPEOF.STRING &&
        triggerCode.length > NUM.ZERO,
      ),
  )];
}

function hasAuthoritativeRepairTrigger(
  repairEvaluation,
  triggerCode,
) {
  if (typeof triggerCode !== TYPEOF.STRING ||
      triggerCode.length === NUM.ZERO) {
    return false;
  }
  return normalizeAuthoritativeRepairTriggerCodes(
    repairEvaluation?.triggerCodes,
  ).includes(triggerCode);
}

function isReplicaOperationsOnlyTableSet(tableNames = []) {
  const normalizedTableNames =
    normalizeAuthoritativeRepairTriggerCodes(tableNames);
  return normalizedTableNames.length > NUM.ZERO &&
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
  if (options.forceAuthoritativeRepair === true ||
      options.allowAuthoritativeRepair === true) {
    return true;
  }

  const autoRepairTriggerCodes =
    normalizeAuthoritativeRepairTriggerCodes(
      options.autoRepairTriggerCodes ||
      DEFAULT_AUTO_REPAIR_TRIGGER_CODES,
    );
  return autoRepairTriggerCodes.some((triggerCode) =>
    hasAuthoritativeRepairTrigger(options.repairEvaluation, triggerCode),
  );
}

export {
  hasAuthoritativeRepairTrigger,
  isReplicaOperationsOnlyRepairScope,
  isReplicaOperationsOnlyTableSet,
  normalizeAuthoritativeRepairTriggerCodes,
  shouldAttemptAuthoritativeRepair,
};
