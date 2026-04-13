/**
 * Storage Capacity Metrics - collects per-node capacity metrics and
 * tracks admission decision counters for observability.
 *
 * Requirements: 10.1, 10.2
 */
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
import { LoggingService } from '../logging/logging-service.js';
import { NUM } from '../constants/index.js';
import { ADMISSION_DECISION, STORAGE_CAPACITY_SUBSYSTEM, STORAGE_METRIC } from './storage-capacity-constants.js';
class StorageCapacityMetrics {
  /**
   * @param {Object} options
   * @param {Object} options.accountingService -
   *   StorageCapacityAccountingService instance
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("141757")) {
      {}
    } else {
      stryCov_9fa48("141757");
      this.accountingService = stryMutAct_9fa48("141760") ? options.accountingService && null : stryMutAct_9fa48("141759") ? false : stryMutAct_9fa48("141758") ? true : (stryCov_9fa48("141758", "141759", "141760"), options.accountingService || null);
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(STORAGE_CAPACITY_SUBSYSTEM) : console;
      this.admissionAllowCount = NUM.ZERO;
      this.admissionDenyCount = NUM.ZERO;
    }
  }

  /**
   * Collect capacity metrics for a single node.
   * @param {string} nodeId
   * @return {Promise<Object|null>} metrics snapshot or null
   */
  async collectNodeMetrics(nodeId) {
    if (stryMutAct_9fa48("141761")) {
      {}
    } else {
      stryCov_9fa48("141761");
      if (stryMutAct_9fa48("141764") ? !this.accountingService && !nodeId : stryMutAct_9fa48("141763") ? false : stryMutAct_9fa48("141762") ? true : (stryCov_9fa48("141762", "141763", "141764"), (stryMutAct_9fa48("141765") ? this.accountingService : (stryCov_9fa48("141765"), !this.accountingService)) || (stryMutAct_9fa48("141766") ? nodeId : (stryCov_9fa48("141766"), !nodeId)))) {
        if (stryMutAct_9fa48("141767")) {
          {}
        } else {
          stryCov_9fa48("141767");
          return null;
        }
      }
      const snapshot = await this.accountingService.getCapacitySnapshotForNode(nodeId);
      if (stryMutAct_9fa48("141770") ? false : stryMutAct_9fa48("141769") ? true : stryMutAct_9fa48("141768") ? snapshot : (stryCov_9fa48("141768", "141769", "141770"), !snapshot)) {
        if (stryMutAct_9fa48("141771")) {
          {}
        } else {
          stryCov_9fa48("141771");
          return null;
        }
      }
      return this.buildMetrics(snapshot);
    }
  }

  /**
   * Collect capacity metrics for all known nodes.
   * @return {Promise<Object[]>}
   */
  async collectAllNodeMetrics() {
    if (stryMutAct_9fa48("141772")) {
      {}
    } else {
      stryCov_9fa48("141772");
      if (stryMutAct_9fa48("141775") ? false : stryMutAct_9fa48("141774") ? true : stryMutAct_9fa48("141773") ? this.accountingService : (stryCov_9fa48("141773", "141774", "141775"), !this.accountingService)) {
        if (stryMutAct_9fa48("141776")) {
          {}
        } else {
          stryCov_9fa48("141776");
          return stryMutAct_9fa48("141777") ? ["Stryker was here"] : (stryCov_9fa48("141777"), []);
        }
      }
      const snapshots = await this.accountingService.getCapacitySnapshots();
      if (stryMutAct_9fa48("141780") ? !snapshots && !snapshots.length : stryMutAct_9fa48("141779") ? false : stryMutAct_9fa48("141778") ? true : (stryCov_9fa48("141778", "141779", "141780"), (stryMutAct_9fa48("141781") ? snapshots : (stryCov_9fa48("141781"), !snapshots)) || (stryMutAct_9fa48("141782") ? snapshots.length : (stryCov_9fa48("141782"), !snapshots.length)))) {
        if (stryMutAct_9fa48("141783")) {
          {}
        } else {
          stryCov_9fa48("141783");
          return stryMutAct_9fa48("141784") ? ["Stryker was here"] : (stryCov_9fa48("141784"), []);
        }
      }
      return snapshots.map(stryMutAct_9fa48("141785") ? () => undefined : (stryCov_9fa48("141785"), snapshot => this.buildMetrics(snapshot)));
    }
  }

  /**
   * Record an admission decision for counter tracking.
   * @param {Object} decision - admission result from StorageAdmissionService
   */
  recordAdmission(decision) {
    if (stryMutAct_9fa48("141786")) {
      {}
    } else {
      stryCov_9fa48("141786");
      if (stryMutAct_9fa48("141789") ? false : stryMutAct_9fa48("141788") ? true : stryMutAct_9fa48("141787") ? decision : (stryCov_9fa48("141787", "141788", "141789"), !decision)) {
        if (stryMutAct_9fa48("141790")) {
          {}
        } else {
          stryCov_9fa48("141790");
          return;
        }
      }
      if (stryMutAct_9fa48("141793") ? decision.decision !== ADMISSION_DECISION.ALLOW : stryMutAct_9fa48("141792") ? false : stryMutAct_9fa48("141791") ? true : (stryCov_9fa48("141791", "141792", "141793"), decision.decision === ADMISSION_DECISION.ALLOW)) {
        if (stryMutAct_9fa48("141794")) {
          {}
        } else {
          stryCov_9fa48("141794");
          stryMutAct_9fa48("141795") ? this.admissionAllowCount-- : (stryCov_9fa48("141795"), this.admissionAllowCount++);
        }
      } else if (stryMutAct_9fa48("141798") ? decision.decision !== ADMISSION_DECISION.DENY : stryMutAct_9fa48("141797") ? false : stryMutAct_9fa48("141796") ? true : (stryCov_9fa48("141796", "141797", "141798"), decision.decision === ADMISSION_DECISION.DENY)) {
        if (stryMutAct_9fa48("141799")) {
          {}
        } else {
          stryCov_9fa48("141799");
          stryMutAct_9fa48("141800") ? this.admissionDenyCount-- : (stryCov_9fa48("141800"), this.admissionDenyCount++);
        }
      }
    }
  }

  /**
   * Return current admission counters.
   * @return {Object}
   */
  getAdmissionMetrics() {
    if (stryMutAct_9fa48("141801")) {
      {}
    } else {
      stryCov_9fa48("141801");
      return Object.freeze(stryMutAct_9fa48("141802") ? {} : (stryCov_9fa48("141802"), {
        [STORAGE_METRIC.ADMISSION_ALLOW_COUNT]: this.admissionAllowCount,
        [STORAGE_METRIC.ADMISSION_DENY_COUNT]: this.admissionDenyCount
      }));
    }
  }

  /**
   * Build a metrics object from a capacity snapshot.
   * @param {Object} snapshot
   * @return {Object}
   * @private
   */
  buildMetrics(snapshot) {
    if (stryMutAct_9fa48("141803")) {
      {}
    } else {
      stryCov_9fa48("141803");
      return Object.freeze(stryMutAct_9fa48("141804") ? {} : (stryCov_9fa48("141804"), {
        nodeId: snapshot.nodeId,
        [STORAGE_METRIC.BUDGET_BYTES]: snapshot.budgetBytes,
        [STORAGE_METRIC.USED_BYTES]: snapshot.usedBytes,
        [STORAGE_METRIC.RESERVED_BYTES]: snapshot.reservedBytes,
        [STORAGE_METRIC.AVAILABLE_BYTES]: snapshot.availableBytes,
        [STORAGE_METRIC.UTILIZATION_PERCENT]: snapshot.utilizationPercent,
        [STORAGE_METRIC.PRESSURE_STATE]: snapshot.pressureState
      }));
    }
  }
}
export { StorageCapacityMetrics };