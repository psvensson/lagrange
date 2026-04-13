// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { NUM, TABLES, TYPEOF } from '../constants/index.js';
import { AUTHORITATIVE_REPAIR_TRIGGER, deriveAuthoritativeRepairTables } from './admin-authoritative-repair-policy.js';
const DEFAULT_AUTO_REPAIR_TRIGGER_CODES = Object.freeze(stryMutAct_9fa48("368") ? [] : (stryCov_9fa48("368"), [AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP]));
function normalizeAuthoritativeRepairTriggerCodes(triggerCodes = stryMutAct_9fa48("369") ? ["Stryker was here"] : (stryCov_9fa48("369"), [])) {
  if (stryMutAct_9fa48("370")) {
    {}
  } else {
    stryCov_9fa48("370");
    return stryMutAct_9fa48("371") ? [] : (stryCov_9fa48("371"), [...new Set(stryMutAct_9fa48("372") ? Array.isArray(triggerCodes) ? triggerCodes : [] : (stryCov_9fa48("372"), (Array.isArray(triggerCodes) ? triggerCodes : stryMutAct_9fa48("373") ? ["Stryker was here"] : (stryCov_9fa48("373"), [])).filter(stryMutAct_9fa48("374") ? () => undefined : (stryCov_9fa48("374"), triggerCode => stryMutAct_9fa48("377") ? typeof triggerCode === TYPEOF.STRING || triggerCode.length > NUM.ZERO : stryMutAct_9fa48("376") ? false : stryMutAct_9fa48("375") ? true : (stryCov_9fa48("375", "376", "377"), (stryMutAct_9fa48("379") ? typeof triggerCode !== TYPEOF.STRING : stryMutAct_9fa48("378") ? true : (stryCov_9fa48("378", "379"), typeof triggerCode === TYPEOF.STRING)) && (stryMutAct_9fa48("382") ? triggerCode.length <= NUM.ZERO : stryMutAct_9fa48("381") ? triggerCode.length >= NUM.ZERO : stryMutAct_9fa48("380") ? true : (stryCov_9fa48("380", "381", "382"), triggerCode.length > NUM.ZERO)))))))]);
  }
}
function hasAuthoritativeRepairTrigger(repairEvaluation, triggerCode) {
  if (stryMutAct_9fa48("383")) {
    {}
  } else {
    stryCov_9fa48("383");
    if (stryMutAct_9fa48("386") ? typeof triggerCode !== TYPEOF.STRING && triggerCode.length === NUM.ZERO : stryMutAct_9fa48("385") ? false : stryMutAct_9fa48("384") ? true : (stryCov_9fa48("384", "385", "386"), (stryMutAct_9fa48("388") ? typeof triggerCode === TYPEOF.STRING : stryMutAct_9fa48("387") ? false : (stryCov_9fa48("387", "388"), typeof triggerCode !== TYPEOF.STRING)) || (stryMutAct_9fa48("390") ? triggerCode.length !== NUM.ZERO : stryMutAct_9fa48("389") ? false : (stryCov_9fa48("389", "390"), triggerCode.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("391")) {
        {}
      } else {
        stryCov_9fa48("391");
        return stryMutAct_9fa48("392") ? true : (stryCov_9fa48("392"), false);
      }
    }
    return normalizeAuthoritativeRepairTriggerCodes(stryMutAct_9fa48("393") ? repairEvaluation.triggerCodes : (stryCov_9fa48("393"), repairEvaluation?.triggerCodes)).includes(triggerCode);
  }
}
function isReplicaOperationsOnlyTableSet(tableNames = stryMutAct_9fa48("394") ? ["Stryker was here"] : (stryCov_9fa48("394"), [])) {
  if (stryMutAct_9fa48("395")) {
    {}
  } else {
    stryCov_9fa48("395");
    const normalizedTableNames = normalizeAuthoritativeRepairTriggerCodes(tableNames);
    return stryMutAct_9fa48("398") ? normalizedTableNames.length > NUM.ZERO || normalizedTableNames.every(tableName => tableName === TABLES.REPLICA_OPERATIONS) : stryMutAct_9fa48("397") ? false : stryMutAct_9fa48("396") ? true : (stryCov_9fa48("396", "397", "398"), (stryMutAct_9fa48("401") ? normalizedTableNames.length <= NUM.ZERO : stryMutAct_9fa48("400") ? normalizedTableNames.length >= NUM.ZERO : stryMutAct_9fa48("399") ? true : (stryCov_9fa48("399", "400", "401"), normalizedTableNames.length > NUM.ZERO)) && (stryMutAct_9fa48("402") ? normalizedTableNames.some(tableName => tableName === TABLES.REPLICA_OPERATIONS) : (stryCov_9fa48("402"), normalizedTableNames.every(stryMutAct_9fa48("403") ? () => undefined : (stryCov_9fa48("403"), tableName => stryMutAct_9fa48("406") ? tableName !== TABLES.REPLICA_OPERATIONS : stryMutAct_9fa48("405") ? false : stryMutAct_9fa48("404") ? true : (stryCov_9fa48("404", "405", "406"), tableName === TABLES.REPLICA_OPERATIONS))))));
  }
}
function isReplicaOperationsOnlyRepairScope(repairEvaluation) {
  if (stryMutAct_9fa48("407")) {
    {}
  } else {
    stryCov_9fa48("407");
    return isReplicaOperationsOnlyTableSet(deriveAuthoritativeRepairTables(stryMutAct_9fa48("408") ? {} : (stryCov_9fa48("408"), {
      triggerCodes: normalizeAuthoritativeRepairTriggerCodes(stryMutAct_9fa48("409") ? repairEvaluation.triggerCodes : (stryCov_9fa48("409"), repairEvaluation?.triggerCodes))
    })));
  }
}
function shouldAttemptAuthoritativeRepair(options = {}) {
  if (stryMutAct_9fa48("410")) {
    {}
  } else {
    stryCov_9fa48("410");
    if (stryMutAct_9fa48("413") ? options.repairEvaluation?.shouldRepair === true : stryMutAct_9fa48("412") ? false : stryMutAct_9fa48("411") ? true : (stryCov_9fa48("411", "412", "413"), (stryMutAct_9fa48("414") ? options.repairEvaluation.shouldRepair : (stryCov_9fa48("414"), options.repairEvaluation?.shouldRepair)) !== (stryMutAct_9fa48("415") ? false : (stryCov_9fa48("415"), true)))) {
      if (stryMutAct_9fa48("416")) {
        {}
      } else {
        stryCov_9fa48("416");
        return stryMutAct_9fa48("417") ? true : (stryCov_9fa48("417"), false);
      }
    }
    if (stryMutAct_9fa48("420") ? options.forceAuthoritativeRepair === true && options.allowAuthoritativeRepair === true : stryMutAct_9fa48("419") ? false : stryMutAct_9fa48("418") ? true : (stryCov_9fa48("418", "419", "420"), (stryMutAct_9fa48("422") ? options.forceAuthoritativeRepair !== true : stryMutAct_9fa48("421") ? false : (stryCov_9fa48("421", "422"), options.forceAuthoritativeRepair === (stryMutAct_9fa48("423") ? false : (stryCov_9fa48("423"), true)))) || (stryMutAct_9fa48("425") ? options.allowAuthoritativeRepair !== true : stryMutAct_9fa48("424") ? false : (stryCov_9fa48("424", "425"), options.allowAuthoritativeRepair === (stryMutAct_9fa48("426") ? false : (stryCov_9fa48("426"), true)))))) {
      if (stryMutAct_9fa48("427")) {
        {}
      } else {
        stryCov_9fa48("427");
        return stryMutAct_9fa48("428") ? false : (stryCov_9fa48("428"), true);
      }
    }
    const autoRepairTriggerCodes = normalizeAuthoritativeRepairTriggerCodes(stryMutAct_9fa48("431") ? options.autoRepairTriggerCodes && DEFAULT_AUTO_REPAIR_TRIGGER_CODES : stryMutAct_9fa48("430") ? false : stryMutAct_9fa48("429") ? true : (stryCov_9fa48("429", "430", "431"), options.autoRepairTriggerCodes || DEFAULT_AUTO_REPAIR_TRIGGER_CODES));
    return stryMutAct_9fa48("432") ? autoRepairTriggerCodes.every(triggerCode => hasAuthoritativeRepairTrigger(options.repairEvaluation, triggerCode)) : (stryCov_9fa48("432"), autoRepairTriggerCodes.some(stryMutAct_9fa48("433") ? () => undefined : (stryCov_9fa48("433"), triggerCode => hasAuthoritativeRepairTrigger(options.repairEvaluation, triggerCode))));
  }
}
export { hasAuthoritativeRepairTrigger, isReplicaOperationsOnlyRepairScope, isReplicaOperationsOnlyTableSet, normalizeAuthoritativeRepairTriggerCodes, shouldAttemptAuthoritativeRepair };