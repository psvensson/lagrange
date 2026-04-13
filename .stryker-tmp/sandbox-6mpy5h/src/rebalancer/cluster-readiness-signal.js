/**
 * Cluster Readiness Signal — composite readiness evaluator for the
 * rebalancer's first planning cycle.
 *
 * Evaluates three conditions before declaring the cluster ready:
 *   1. CDC pipeline ready (delegates to CDCPipelineReadinessGate)
 *   2. Expected nodes registered with ACTIVE status
 *   3. Cache hydrated for all CDC-propagated tables
 *
 * The signal is a stateless evaluator — it reads from existing state
 * (CDCPipelineReadinessGate, SystemTableCache). It does not maintain
 * its own state or cache.
 *
 * Requirements: 4.2
 *
 * @module rebalancer/cluster-readiness-signal
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
import { COLUMN, NUM, TABLES } from '../constants/index.js';
import { NODE_STATE } from '../constants/node-state.js';
import { CDC_LIFECYCLE_LOG_MSG, CLUSTER_READINESS_CONDITION } from '../constants/cdc-lifecycle-constants.js';
const SIGNAL_SUBSYSTEM = stryMutAct_9fa48("129957") ? "" : (stryCov_9fa48("129957"), 'cluster-readiness-signal');

/**
 * ClusterReadinessSignal evaluates whether the cluster has reached a
 * stable state suitable for rebalancer planning.
 */
class ClusterReadinessSignal {
  /**
   * @param {Object} options
   * @param {Object} options.cdcPipelineReadinessGate —
   *   CDCPipelineReadinessGate instance
   * @param {Object} options.systemTableCache — SystemTableCache instance
   * @param {number} options.expectedNodeCount — number of nodes expected
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("129958")) {
      {}
    } else {
      stryCov_9fa48("129958");
      this.cdcPipelineReadinessGate = options.cdcPipelineReadinessGate;
      this.systemTableCache = options.systemTableCache;
      this.expectedNodeCount = stryMutAct_9fa48("129961") ? options.expectedNodeCount && NUM.ZERO : stryMutAct_9fa48("129960") ? false : stryMutAct_9fa48("129959") ? true : (stryCov_9fa48("129959", "129960", "129961"), options.expectedNodeCount || NUM.ZERO);
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(SIGNAL_SUBSYSTEM) : console;
    }
  }

  /**
   * Evaluate cluster readiness for rebalancer planning.
   *
   * @param {Object} context — same context as CDCPipelineReadinessGate
   * @param {Map} context.partitionServices — partition replicas
   * @param {Map} context.messageGroupServices — message group replicas
   * @return {{ready: boolean, unmetConditions: string[]}}
   */
  evaluate(context) {
    if (stryMutAct_9fa48("129962")) {
      {}
    } else {
      stryCov_9fa48("129962");
      const unmetConditions = stryMutAct_9fa48("129963") ? ["Stryker was here"] : (stryCov_9fa48("129963"), []);
      if (stryMutAct_9fa48("129966") ? false : stryMutAct_9fa48("129965") ? true : stryMutAct_9fa48("129964") ? this._checkCdcPipelineReady(context) : (stryCov_9fa48("129964", "129965", "129966"), !this._checkCdcPipelineReady(context))) {
        if (stryMutAct_9fa48("129967")) {
          {}
        } else {
          stryCov_9fa48("129967");
          unmetConditions.push(CLUSTER_READINESS_CONDITION.CDC_PIPELINE_READY);
        }
      }
      if (stryMutAct_9fa48("129970") ? false : stryMutAct_9fa48("129969") ? true : stryMutAct_9fa48("129968") ? this._checkNodesRegistered() : (stryCov_9fa48("129968", "129969", "129970"), !this._checkNodesRegistered())) {
        if (stryMutAct_9fa48("129971")) {
          {}
        } else {
          stryCov_9fa48("129971");
          unmetConditions.push(CLUSTER_READINESS_CONDITION.NODES_REGISTERED);
        }
      }
      if (stryMutAct_9fa48("129974") ? false : stryMutAct_9fa48("129973") ? true : stryMutAct_9fa48("129972") ? this._checkCacheHydrated() : (stryCov_9fa48("129972", "129973", "129974"), !this._checkCacheHydrated())) {
        if (stryMutAct_9fa48("129975")) {
          {}
        } else {
          stryCov_9fa48("129975");
          unmetConditions.push(CLUSTER_READINESS_CONDITION.CACHE_HYDRATED);
        }
      }
      const ready = stryMutAct_9fa48("129978") ? unmetConditions.length !== NUM.ZERO : stryMutAct_9fa48("129977") ? false : stryMutAct_9fa48("129976") ? true : (stryCov_9fa48("129976", "129977", "129978"), unmetConditions.length === NUM.ZERO);
      if (stryMutAct_9fa48("129981") ? false : stryMutAct_9fa48("129980") ? true : stryMutAct_9fa48("129979") ? ready : (stryCov_9fa48("129979", "129980", "129981"), !ready)) {
        if (stryMutAct_9fa48("129982")) {
          {}
        } else {
          stryCov_9fa48("129982");
          this.logger.info(CDC_LIFECYCLE_LOG_MSG.CLUSTER_NOT_READY, stryMutAct_9fa48("129983") ? {} : (stryCov_9fa48("129983"), {
            unmetConditions,
            expectedNodeCount: this.expectedNodeCount
          }));
        }
      }
      return stryMutAct_9fa48("129984") ? {} : (stryCov_9fa48("129984"), {
        ready,
        unmetConditions
      });
    }
  }

  /**
   * Delegate to CDCPipelineReadinessGate.
   *
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  _checkCdcPipelineReady(context) {
    if (stryMutAct_9fa48("129985")) {
      {}
    } else {
      stryCov_9fa48("129985");
      if (stryMutAct_9fa48("129988") ? false : stryMutAct_9fa48("129987") ? true : stryMutAct_9fa48("129986") ? this.cdcPipelineReadinessGate : (stryCov_9fa48("129986", "129987", "129988"), !this.cdcPipelineReadinessGate)) {
        if (stryMutAct_9fa48("129989")) {
          {}
        } else {
          stryCov_9fa48("129989");
          return stryMutAct_9fa48("129990") ? true : (stryCov_9fa48("129990"), false);
        }
      }
      const result = this.cdcPipelineReadinessGate.evaluate(context);
      return result.ready;
    }
  }

  /**
   * Check that the SystemTableCache nodes table contains at least
   * expectedNodeCount entries with ACTIVE status.
   *
   * @return {boolean}
   * @private
   */
  _checkNodesRegistered() {
    if (stryMutAct_9fa48("129991")) {
      {}
    } else {
      stryCov_9fa48("129991");
      if (stryMutAct_9fa48("129994") ? !this.systemTableCache && this.expectedNodeCount <= NUM.ZERO : stryMutAct_9fa48("129993") ? false : stryMutAct_9fa48("129992") ? true : (stryCov_9fa48("129992", "129993", "129994"), (stryMutAct_9fa48("129995") ? this.systemTableCache : (stryCov_9fa48("129995"), !this.systemTableCache)) || (stryMutAct_9fa48("129998") ? this.expectedNodeCount > NUM.ZERO : stryMutAct_9fa48("129997") ? this.expectedNodeCount < NUM.ZERO : stryMutAct_9fa48("129996") ? false : (stryCov_9fa48("129996", "129997", "129998"), this.expectedNodeCount <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("129999")) {
          {}
        } else {
          stryCov_9fa48("129999");
          return stryMutAct_9fa48("130003") ? this.expectedNodeCount > NUM.ZERO : stryMutAct_9fa48("130002") ? this.expectedNodeCount < NUM.ZERO : stryMutAct_9fa48("130001") ? false : stryMutAct_9fa48("130000") ? true : (stryCov_9fa48("130000", "130001", "130002", "130003"), this.expectedNodeCount <= NUM.ZERO);
        }
      }
      try {
        if (stryMutAct_9fa48("130004")) {
          {}
        } else {
          stryCov_9fa48("130004");
          const activeNodes = stryMutAct_9fa48("130005") ? this.systemTableCache : (stryCov_9fa48("130005"), this.systemTableCache.filter(TABLES.NODES, stryMutAct_9fa48("130006") ? () => undefined : (stryCov_9fa48("130006"), node => stryMutAct_9fa48("130009") ? node[COLUMN.STATUS] !== NODE_STATE.ACTIVE : stryMutAct_9fa48("130008") ? false : stryMutAct_9fa48("130007") ? true : (stryCov_9fa48("130007", "130008", "130009"), node[COLUMN.STATUS] === NODE_STATE.ACTIVE))));
          return stryMutAct_9fa48("130013") ? activeNodes.length < this.expectedNodeCount : stryMutAct_9fa48("130012") ? activeNodes.length > this.expectedNodeCount : stryMutAct_9fa48("130011") ? false : stryMutAct_9fa48("130010") ? true : (stryCov_9fa48("130010", "130011", "130012", "130013"), activeNodes.length >= this.expectedNodeCount);
        }
      } catch (_err) {
        if (stryMutAct_9fa48("130014")) {
          {}
        } else {
          stryCov_9fa48("130014");
          return stryMutAct_9fa48("130015") ? true : (stryCov_9fa48("130015"), false);
        }
      }
    }
  }

  /**
   * Core membership tables that always have entries after bootstrap.
   * Used to verify cache hydration without requiring every
   * CDC-propagated table to be non-empty (many are legitimately
   * empty in a fresh cluster).
   * @type {string[]}
   * @private
   */
  static CORE_HYDRATION_TABLES = stryMutAct_9fa48("130016") ? [] : (stryCov_9fa48("130016"), [TABLES.NODES, TABLES.PARTITIONS, TABLES.SERVICES, TABLES.TABLES, TABLES.MESSAGE_GROUPS, TABLES.CONFIG]);

  /**
   * Check that the SystemTableCache has been hydrated by verifying
   * core membership tables contain data. Many CDC-propagated tables
   * (sql_transactions, debug_sessions, storage_reservations, etc.)
   * are legitimately empty in a fresh cluster, so we only check the
   * tables that always have entries after bootstrap.
   *
   * @return {boolean}
   * @private
   */
  _checkCacheHydrated() {
    if (stryMutAct_9fa48("130017")) {
      {}
    } else {
      stryCov_9fa48("130017");
      if (stryMutAct_9fa48("130020") ? false : stryMutAct_9fa48("130019") ? true : stryMutAct_9fa48("130018") ? this.systemTableCache : (stryCov_9fa48("130018", "130019", "130020"), !this.systemTableCache)) {
        if (stryMutAct_9fa48("130021")) {
          {}
        } else {
          stryCov_9fa48("130021");
          return stryMutAct_9fa48("130022") ? true : (stryCov_9fa48("130022"), false);
        }
      }
      for (const tableName of ClusterReadinessSignal.CORE_HYDRATION_TABLES) {
        if (stryMutAct_9fa48("130023")) {
          {}
        } else {
          stryCov_9fa48("130023");
          try {
            if (stryMutAct_9fa48("130024")) {
              {}
            } else {
              stryCov_9fa48("130024");
              const records = this.systemTableCache.getAll(tableName);
              if (stryMutAct_9fa48("130027") ? !records && records.length === NUM.ZERO : stryMutAct_9fa48("130026") ? false : stryMutAct_9fa48("130025") ? true : (stryCov_9fa48("130025", "130026", "130027"), (stryMutAct_9fa48("130028") ? records : (stryCov_9fa48("130028"), !records)) || (stryMutAct_9fa48("130030") ? records.length !== NUM.ZERO : stryMutAct_9fa48("130029") ? false : (stryCov_9fa48("130029", "130030"), records.length === NUM.ZERO)))) {
                if (stryMutAct_9fa48("130031")) {
                  {}
                } else {
                  stryCov_9fa48("130031");
                  return stryMutAct_9fa48("130032") ? true : (stryCov_9fa48("130032"), false);
                }
              }
            }
          } catch (_err) {
            if (stryMutAct_9fa48("130033")) {
              {}
            } else {
              stryCov_9fa48("130033");
              return stryMutAct_9fa48("130034") ? true : (stryCov_9fa48("130034"), false);
            }
          }
        }
      }
      return stryMutAct_9fa48("130035") ? false : (stryCov_9fa48("130035"), true);
    }
  }
}
export { ClusterReadinessSignal };