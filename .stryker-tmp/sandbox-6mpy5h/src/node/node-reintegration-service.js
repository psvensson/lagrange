/**
 * Node Reintegration Service - Reintegrates recovered nodes into the cluster.
 * Triggers rebalancing after node recovery.
 * Requirements: 14.4
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
import { EventEmitter } from 'events';
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { CONFIG_KEY } from '../config/config-constants.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { NUM } from '../constants/index.js';
import { CONTROL_PLANE_MUTATION_OPERATION } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { assertCritical } from '../utils/assert.js';
import { NODE_REINTEGRATION_DEFAULT, NODE_REINTEGRATION_ERROR_MSG, NODE_REINTEGRATION_EVENT, NODE_REINTEGRATION_LOG_MSG, NODE_REINTEGRATION_REASON, NODE_REINTEGRATION_STATUS, NODE_REINTEGRATION_SUBSYSTEM, NODE_STATUS } from './node-constants.js';
const NodeStatus = NODE_STATUS;
const ReintegrationStatus = NODE_REINTEGRATION_STATUS;
function buildObservedNodeWhereClause(node) {
  if (stryMutAct_9fa48("93311")) {
    {}
  } else {
    stryCov_9fa48("93311");
    const whereClause = stryMutAct_9fa48("93312") ? {} : (stryCov_9fa48("93312"), {
      node_id: node.node_id
    });
    if (stryMutAct_9fa48("93315") ? typeof node?.status === 'string' || node.status.length > 0 : stryMutAct_9fa48("93314") ? false : stryMutAct_9fa48("93313") ? true : (stryCov_9fa48("93313", "93314", "93315"), (stryMutAct_9fa48("93317") ? typeof node?.status !== 'string' : stryMutAct_9fa48("93316") ? true : (stryCov_9fa48("93316", "93317"), typeof (stryMutAct_9fa48("93318") ? node.status : (stryCov_9fa48("93318"), node?.status)) === (stryMutAct_9fa48("93319") ? "" : (stryCov_9fa48("93319"), 'string')))) && (stryMutAct_9fa48("93322") ? node.status.length <= 0 : stryMutAct_9fa48("93321") ? node.status.length >= 0 : stryMutAct_9fa48("93320") ? true : (stryCov_9fa48("93320", "93321", "93322"), node.status.length > 0)))) {
      if (stryMutAct_9fa48("93323")) {
        {}
      } else {
        stryCov_9fa48("93323");
        whereClause.status = node.status;
      }
    }
    if (stryMutAct_9fa48("93325") ? false : stryMutAct_9fa48("93324") ? true : (stryCov_9fa48("93324", "93325"), Number.isFinite(stryMutAct_9fa48("93326") ? node.last_heartbeat : (stryCov_9fa48("93326"), node?.last_heartbeat)))) {
      if (stryMutAct_9fa48("93327")) {
        {}
      } else {
        stryCov_9fa48("93327");
        whereClause.last_heartbeat = node.last_heartbeat;
      }
    }
    if (stryMutAct_9fa48("93329") ? false : stryMutAct_9fa48("93328") ? true : (stryCov_9fa48("93328", "93329"), Number.isFinite(stryMutAct_9fa48("93330") ? node.failed_at : (stryCov_9fa48("93330"), node?.failed_at)))) {
      if (stryMutAct_9fa48("93331")) {
        {}
      } else {
        stryCov_9fa48("93331");
        whereClause.failed_at = node.failed_at;
      }
    }
    if (stryMutAct_9fa48("93333") ? false : stryMutAct_9fa48("93332") ? true : (stryCov_9fa48("93332", "93333"), Number.isFinite(stryMutAct_9fa48("93334") ? node.recovered_at : (stryCov_9fa48("93334"), node?.recovered_at)))) {
      if (stryMutAct_9fa48("93335")) {
        {}
      } else {
        stryCov_9fa48("93335");
        whereClause.recovered_at = node.recovered_at;
      }
    }
    return whereClause;
  }
}
function guardedUpdateApplied(result) {
  if (stryMutAct_9fa48("93336")) {
    {}
  } else {
    stryCov_9fa48("93336");
    if (stryMutAct_9fa48("93339") ? result?.success !== false : stryMutAct_9fa48("93338") ? false : stryMutAct_9fa48("93337") ? true : (stryCov_9fa48("93337", "93338", "93339"), (stryMutAct_9fa48("93340") ? result.success : (stryCov_9fa48("93340"), result?.success)) === (stryMutAct_9fa48("93341") ? true : (stryCov_9fa48("93341"), false)))) {
      if (stryMutAct_9fa48("93342")) {
        {}
      } else {
        stryCov_9fa48("93342");
        return stryMutAct_9fa48("93343") ? true : (stryCov_9fa48("93343"), false);
      }
    }
    const affectedRows = Number(stryMutAct_9fa48("93345") ? result.partitionResult?.affectedRows : stryMutAct_9fa48("93344") ? result?.partitionResult.affectedRows : (stryCov_9fa48("93344", "93345"), result?.partitionResult?.affectedRows));
    return stryMutAct_9fa48("93348") ? !Number.isFinite(affectedRows) && affectedRows > NUM.ZERO : stryMutAct_9fa48("93347") ? false : stryMutAct_9fa48("93346") ? true : (stryCov_9fa48("93346", "93347", "93348"), (stryMutAct_9fa48("93349") ? Number.isFinite(affectedRows) : (stryCov_9fa48("93349"), !Number.isFinite(affectedRows))) || (stryMutAct_9fa48("93352") ? affectedRows <= NUM.ZERO : stryMutAct_9fa48("93351") ? affectedRows >= NUM.ZERO : stryMutAct_9fa48("93350") ? false : (stryCov_9fa48("93350", "93351", "93352"), affectedRows > NUM.ZERO)));
  }
}

/**
 * NodeReintegrationService monitors for recovering nodes and reintegrates them.
 * It marks nodes as active after successful reintegration and triggers
 * rebalancing to redistribute replicas.
 */
class NodeReintegrationService extends EventEmitter {
  /**
   * Create a new NodeReintegrationService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   * @param {string} options.nodeId - This node's ID.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("93353")) {
      {}
    } else {
      stryCov_9fa48("93353");
      super();
      this.systemTableCache = stryMutAct_9fa48("93356") ? options.systemTableCache && null : stryMutAct_9fa48("93355") ? false : stryMutAct_9fa48("93354") ? true : (stryCov_9fa48("93354", "93355", "93356"), options.systemTableCache || null);
      this.cdcIntegrationService = stryMutAct_9fa48("93359") ? options.cdcIntegrationService && null : stryMutAct_9fa48("93358") ? false : stryMutAct_9fa48("93357") ? true : (stryCov_9fa48("93357", "93358", "93359"), options.cdcIntegrationService || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("93362") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("93361") ? false : stryMutAct_9fa48("93360") ? true : (stryCov_9fa48("93360", "93361", "93362"), options.controlPlaneSystemTableGateway || null);
      this.nodeId = stryMutAct_9fa48("93365") ? options.nodeId && null : stryMutAct_9fa48("93364") ? false : stryMutAct_9fa48("93363") ? true : (stryCov_9fa48("93363", "93364", "93365"), options.nodeId || null);

      // Configuration
      const config = ConfigurationManager.getInstance();
      this.checkIntervalMs = stryMutAct_9fa48("93368") ? config.get(CONFIG_KEY.NODE_REINTEGRATION_CHECK_INTERVAL_MS) && NODE_REINTEGRATION_DEFAULT.CHECK_INTERVAL_MS : stryMutAct_9fa48("93367") ? false : stryMutAct_9fa48("93366") ? true : (stryCov_9fa48("93366", "93367", "93368"), config.get(CONFIG_KEY.NODE_REINTEGRATION_CHECK_INTERVAL_MS) || NODE_REINTEGRATION_DEFAULT.CHECK_INTERVAL_MS);
      this.reintegrationDelayMs = stryMutAct_9fa48("93371") ? config.get(CONFIG_KEY.NODE_REINTEGRATION_DELAY_MS) && NODE_REINTEGRATION_DEFAULT.REINTEGRATION_DELAY_MS : stryMutAct_9fa48("93370") ? false : stryMutAct_9fa48("93369") ? true : (stryCov_9fa48("93369", "93370", "93371"), config.get(CONFIG_KEY.NODE_REINTEGRATION_DELAY_MS) || NODE_REINTEGRATION_DEFAULT.REINTEGRATION_DELAY_MS);
      this.healthCheckCount = stryMutAct_9fa48("93374") ? config.get(CONFIG_KEY.NODE_REINTEGRATION_HEALTH_CHECK_COUNT) && NODE_REINTEGRATION_DEFAULT.HEALTH_CHECK_COUNT : stryMutAct_9fa48("93373") ? false : stryMutAct_9fa48("93372") ? true : (stryCov_9fa48("93372", "93373", "93374"), config.get(CONFIG_KEY.NODE_REINTEGRATION_HEALTH_CHECK_COUNT) || NODE_REINTEGRATION_DEFAULT.HEALTH_CHECK_COUNT);
      this.healthCheckIntervalMs = stryMutAct_9fa48("93377") ? config.get(CONFIG_KEY.NODE_REINTEGRATION_HEALTH_CHECK_INTERVAL_MS) && NODE_REINTEGRATION_DEFAULT.HEALTH_CHECK_INTERVAL_MS : stryMutAct_9fa48("93376") ? false : stryMutAct_9fa48("93375") ? true : (stryCov_9fa48("93375", "93376", "93377"), config.get(CONFIG_KEY.NODE_REINTEGRATION_HEALTH_CHECK_INTERVAL_MS) || NODE_REINTEGRATION_DEFAULT.HEALTH_CHECK_INTERVAL_MS);

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.forSubsystem(NODE_REINTEGRATION_SUBSYSTEM);

      // State
      this.checkTimer = null;
      this.monitoringActive = stryMutAct_9fa48("93378") ? true : (stryCov_9fa48("93378"), false);
      this.currentCheckIntervalMs = this.checkIntervalMs;
      this.pendingReintegrations = new Map(); // nodeId -> reintegration info
      this.cleanupTimers = new Map(); // nodeId -> cleanup timer
      this.reintegrationCount = NUM.ZERO;
      this.initialized = stryMutAct_9fa48("93379") ? true : (stryCov_9fa48("93379"), false);
    }
  }

  /**
   * Initialize the node reintegration service.
   * @param {Object} options - Initialization options.
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("93380")) {
      {}
    } else {
      stryCov_9fa48("93380");
      if (stryMutAct_9fa48("93382") ? false : stryMutAct_9fa48("93381") ? true : (stryCov_9fa48("93381", "93382"), options.systemTableCache)) {
        if (stryMutAct_9fa48("93383")) {
          {}
        } else {
          stryCov_9fa48("93383");
          this.systemTableCache = options.systemTableCache;
        }
      }
      if (stryMutAct_9fa48("93385") ? false : stryMutAct_9fa48("93384") ? true : (stryCov_9fa48("93384", "93385"), options.cdcIntegrationService)) {
        if (stryMutAct_9fa48("93386")) {
          {}
        } else {
          stryCov_9fa48("93386");
          this.cdcIntegrationService = options.cdcIntegrationService;
        }
      }
      if (stryMutAct_9fa48("93388") ? false : stryMutAct_9fa48("93387") ? true : (stryCov_9fa48("93387", "93388"), options.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("93389")) {
          {}
        } else {
          stryCov_9fa48("93389");
          this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
        }
      }
      if (stryMutAct_9fa48("93391") ? false : stryMutAct_9fa48("93390") ? true : (stryCov_9fa48("93390", "93391"), options.nodeId)) {
        if (stryMutAct_9fa48("93392")) {
          {}
        } else {
          stryCov_9fa48("93392");
          this.nodeId = options.nodeId;
        }
      }
      if (stryMutAct_9fa48("93395") ? false : stryMutAct_9fa48("93394") ? true : stryMutAct_9fa48("93393") ? this.nodeId : (stryCov_9fa48("93393", "93394", "93395"), !this.nodeId)) {
        if (stryMutAct_9fa48("93396")) {
          {}
        } else {
          stryCov_9fa48("93396");
          throw new Error(NODE_REINTEGRATION_ERROR_MSG.MISSING_NODE_ID);
        }
      }
      this.systemTableCache = assertCritical(this.systemTableCache, NODE_REINTEGRATION_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE);
      if (stryMutAct_9fa48("93399") ? !this.cdcIntegrationService || !this.controlPlaneSystemTableGateway : stryMutAct_9fa48("93398") ? false : stryMutAct_9fa48("93397") ? true : (stryCov_9fa48("93397", "93398", "93399"), (stryMutAct_9fa48("93400") ? this.cdcIntegrationService : (stryCov_9fa48("93400"), !this.cdcIntegrationService)) && (stryMutAct_9fa48("93401") ? this.controlPlaneSystemTableGateway : (stryCov_9fa48("93401"), !this.controlPlaneSystemTableGateway)))) {
        if (stryMutAct_9fa48("93402")) {
          {}
        } else {
          stryCov_9fa48("93402");
          throw new Error(NODE_REINTEGRATION_ERROR_MSG.MISSING_CDC_SERVICE);
        }
      }
      this.initialized = stryMutAct_9fa48("93403") ? false : (stryCov_9fa48("93403"), true);
      this.logger.info(NODE_REINTEGRATION_LOG_MSG.INITIALIZED, stryMutAct_9fa48("93404") ? {} : (stryCov_9fa48("93404"), {
        nodeId: this.nodeId,
        checkIntervalMs: this.checkIntervalMs,
        healthCheckCount: this.healthCheckCount
      }));
    }
  }

  /**
   * Start the node reintegration monitoring loop.
   */
  start() {
    if (stryMutAct_9fa48("93405")) {
      {}
    } else {
      stryCov_9fa48("93405");
      if (stryMutAct_9fa48("93408") ? false : stryMutAct_9fa48("93407") ? true : stryMutAct_9fa48("93406") ? this.initialized : (stryCov_9fa48("93406", "93407", "93408"), !this.initialized)) {
        if (stryMutAct_9fa48("93409")) {
          {}
        } else {
          stryCov_9fa48("93409");
          throw new Error(NODE_REINTEGRATION_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      if (stryMutAct_9fa48("93411") ? false : stryMutAct_9fa48("93410") ? true : (stryCov_9fa48("93410", "93411"), this.monitoringActive)) {
        if (stryMutAct_9fa48("93412")) {
          {}
        } else {
          stryCov_9fa48("93412");
          return; // Already running
        }
      }
      this.logger.info(NODE_REINTEGRATION_LOG_MSG.STARTING_MONITORING, stryMutAct_9fa48("93413") ? {} : (stryCov_9fa48("93413"), {
        nodeId: this.nodeId,
        intervalMs: this.checkIntervalMs
      }));
      this.monitoringActive = stryMutAct_9fa48("93414") ? false : (stryCov_9fa48("93414"), true);
      this.currentCheckIntervalMs = this.checkIntervalMs;
      this.scheduleNextCheck(this.currentCheckIntervalMs);
    }
  }

  /**
   * Stop the node reintegration monitoring loop.
   */
  stop() {
    if (stryMutAct_9fa48("93415")) {
      {}
    } else {
      stryCov_9fa48("93415");
      this.monitoringActive = stryMutAct_9fa48("93416") ? true : (stryCov_9fa48("93416"), false);
      if (stryMutAct_9fa48("93418") ? false : stryMutAct_9fa48("93417") ? true : (stryCov_9fa48("93417", "93418"), this.checkTimer)) {
        if (stryMutAct_9fa48("93419")) {
          {}
        } else {
          stryCov_9fa48("93419");
          clearTimeout(this.checkTimer);
          this.checkTimer = null;
        }
      }
      this.logger.info(NODE_REINTEGRATION_LOG_MSG.STOPPED_MONITORING, stryMutAct_9fa48("93420") ? {} : (stryCov_9fa48("93420"), {
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Check for recovering nodes and process reintegration.
   * @return {Promise<Object>} Summary of cycle activity.
   */
  async checkRecoveringNodes() {
    if (stryMutAct_9fa48("93421")) {
      {}
    } else {
      stryCov_9fa48("93421");
      const nodes = this.getNodes();
      let recoveringNodeCount = NUM.ZERO;
      for (const node of nodes) {
        if (stryMutAct_9fa48("93422")) {
          {}
        } else {
          stryCov_9fa48("93422");
          // Skip self
          if (stryMutAct_9fa48("93425") ? node.node_id !== this.nodeId : stryMutAct_9fa48("93424") ? false : stryMutAct_9fa48("93423") ? true : (stryCov_9fa48("93423", "93424", "93425"), node.node_id === this.nodeId)) {
            if (stryMutAct_9fa48("93426")) {
              {}
            } else {
              stryCov_9fa48("93426");
              continue;
            }
          }

          // Process recovering nodes
          if (stryMutAct_9fa48("93429") ? node.status !== NODE_STATUS.RECOVERING : stryMutAct_9fa48("93428") ? false : stryMutAct_9fa48("93427") ? true : (stryCov_9fa48("93427", "93428", "93429"), node.status === NODE_STATUS.RECOVERING)) {
            if (stryMutAct_9fa48("93430")) {
              {}
            } else {
              stryCov_9fa48("93430");
              stryMutAct_9fa48("93431") ? recoveringNodeCount -= NUM.ONE : (stryCov_9fa48("93431"), recoveringNodeCount += NUM.ONE);
              await this.processRecoveringNode(node);
            }
          }
        }
      }
      return stryMutAct_9fa48("93432") ? {} : (stryCov_9fa48("93432"), {
        recoveringNodeCount,
        hadActivity: stryMutAct_9fa48("93435") ? recoveringNodeCount > NUM.ZERO && this.pendingReintegrations.size > NUM.ZERO : stryMutAct_9fa48("93434") ? false : stryMutAct_9fa48("93433") ? true : (stryCov_9fa48("93433", "93434", "93435"), (stryMutAct_9fa48("93438") ? recoveringNodeCount <= NUM.ZERO : stryMutAct_9fa48("93437") ? recoveringNodeCount >= NUM.ZERO : stryMutAct_9fa48("93436") ? false : (stryCov_9fa48("93436", "93437", "93438"), recoveringNodeCount > NUM.ZERO)) || (stryMutAct_9fa48("93441") ? this.pendingReintegrations.size <= NUM.ZERO : stryMutAct_9fa48("93440") ? this.pendingReintegrations.size >= NUM.ZERO : stryMutAct_9fa48("93439") ? false : (stryCov_9fa48("93439", "93440", "93441"), this.pendingReintegrations.size > NUM.ZERO)))
      });
    }
  }

  /**
   * Schedule the next monitoring cycle as a one-shot timer.
   * @param {number} delayMs - Delay before next cycle.
   * @private
   */
  scheduleNextCheck(delayMs) {
    if (stryMutAct_9fa48("93442")) {
      {}
    } else {
      stryCov_9fa48("93442");
      if (stryMutAct_9fa48("93445") ? false : stryMutAct_9fa48("93444") ? true : stryMutAct_9fa48("93443") ? this.monitoringActive : (stryCov_9fa48("93443", "93444", "93445"), !this.monitoringActive)) {
        if (stryMutAct_9fa48("93446")) {
          {}
        } else {
          stryCov_9fa48("93446");
          return;
        }
      }
      const boundedDelay = stryMutAct_9fa48("93447") ? Math.min(this.checkIntervalMs, Math.min(delayMs, NODE_REINTEGRATION_DEFAULT.MAX_CHECK_INTERVAL_MS)) : (stryCov_9fa48("93447"), Math.max(this.checkIntervalMs, stryMutAct_9fa48("93448") ? Math.max(delayMs, NODE_REINTEGRATION_DEFAULT.MAX_CHECK_INTERVAL_MS) : (stryCov_9fa48("93448"), Math.min(delayMs, NODE_REINTEGRATION_DEFAULT.MAX_CHECK_INTERVAL_MS))));
      this.checkTimer = setTimeout(async () => {
        if (stryMutAct_9fa48("93449")) {
          {}
        } else {
          stryCov_9fa48("93449");
          this.checkTimer = null;
          if (stryMutAct_9fa48("93452") ? false : stryMutAct_9fa48("93451") ? true : stryMutAct_9fa48("93450") ? this.monitoringActive : (stryCov_9fa48("93450", "93451", "93452"), !this.monitoringActive)) {
            if (stryMutAct_9fa48("93453")) {
              {}
            } else {
              stryCov_9fa48("93453");
              return;
            }
          }
          let cycleSummary = stryMutAct_9fa48("93454") ? {} : (stryCov_9fa48("93454"), {
            hadActivity: stryMutAct_9fa48("93455") ? true : (stryCov_9fa48("93455"), false)
          });
          try {
            if (stryMutAct_9fa48("93456")) {
              {}
            } else {
              stryCov_9fa48("93456");
              cycleSummary = await this.checkRecoveringNodes();
            }
          } catch (error) {
            if (stryMutAct_9fa48("93457")) {
              {}
            } else {
              stryCov_9fa48("93457");
              if (stryMutAct_9fa48("93460") ? error.isCritical : stryMutAct_9fa48("93459") ? false : stryMutAct_9fa48("93458") ? true : (stryCov_9fa48("93458", "93459", "93460"), error?.isCritical)) {
                if (stryMutAct_9fa48("93461")) {
                  {}
                } else {
                  stryCov_9fa48("93461");
                  throw error;
                }
              }
              this.logger.error(NODE_REINTEGRATION_LOG_MSG.CHECK_ERROR, stryMutAct_9fa48("93462") ? {} : (stryCov_9fa48("93462"), {
                nodeId: this.nodeId,
                error: error.message
              }));
            }
          }
          this.updateCheckCadence(cycleSummary);
          this.scheduleNextCheck(this.currentCheckIntervalMs);
        }
      }, boundedDelay);
      this.checkTimer.unref();
    }
  }

  /**
   * Adapt monitoring cadence based on recent activity.
   * @param {Object} cycleSummary - Summary returned from checkRecoveringNodes.
   */
  updateCheckCadence(cycleSummary = {}) {
    if (stryMutAct_9fa48("93463")) {
      {}
    } else {
      stryCov_9fa48("93463");
      if (stryMutAct_9fa48("93465") ? false : stryMutAct_9fa48("93464") ? true : (stryCov_9fa48("93464", "93465"), cycleSummary.hadActivity)) {
        if (stryMutAct_9fa48("93466")) {
          {}
        } else {
          stryCov_9fa48("93466");
          this.currentCheckIntervalMs = this.checkIntervalMs;
          return;
        }
      }
      const nextIntervalMs = Math.floor(stryMutAct_9fa48("93467") ? this.currentCheckIntervalMs / NODE_REINTEGRATION_DEFAULT.IDLE_BACKOFF_MULTIPLIER : (stryCov_9fa48("93467"), this.currentCheckIntervalMs * NODE_REINTEGRATION_DEFAULT.IDLE_BACKOFF_MULTIPLIER));
      this.currentCheckIntervalMs = stryMutAct_9fa48("93468") ? Math.max(NODE_REINTEGRATION_DEFAULT.MAX_CHECK_INTERVAL_MS, Math.max(this.checkIntervalMs, nextIntervalMs)) : (stryCov_9fa48("93468"), Math.min(NODE_REINTEGRATION_DEFAULT.MAX_CHECK_INTERVAL_MS, stryMutAct_9fa48("93469") ? Math.min(this.checkIntervalMs, nextIntervalMs) : (stryCov_9fa48("93469"), Math.max(this.checkIntervalMs, nextIntervalMs))));
    }
  }

  /**
   * Process a recovering node for reintegration.
   * @param {Object} node - Node in recovering state.
   * @return {Promise<void>}
   * @private
   */
  async processRecoveringNode(node) {
    if (stryMutAct_9fa48("93470")) {
      {}
    } else {
      stryCov_9fa48("93470");
      const nodeId = node.node_id;

      // Check if already processing this node
      if (stryMutAct_9fa48("93472") ? false : stryMutAct_9fa48("93471") ? true : (stryCov_9fa48("93471", "93472"), this.pendingReintegrations.has(nodeId))) {
        if (stryMutAct_9fa48("93473")) {
          {}
        } else {
          stryCov_9fa48("93473");
          const pending = this.pendingReintegrations.get(nodeId);
          if (stryMutAct_9fa48("93476") ? pending.status !== ReintegrationStatus.IN_PROGRESS : stryMutAct_9fa48("93475") ? false : stryMutAct_9fa48("93474") ? true : (stryCov_9fa48("93474", "93475", "93476"), pending.status === ReintegrationStatus.IN_PROGRESS)) {
            if (stryMutAct_9fa48("93477")) {
              {}
            } else {
              stryCov_9fa48("93477");
              return; // Already in progress
            }
          }
        }
      }

      // Start reintegration process
      this.logger.info(NODE_REINTEGRATION_LOG_MSG.STARTING_REINTEGRATION, stryMutAct_9fa48("93478") ? {} : (stryCov_9fa48("93478"), {
        nodeId,
        recoveredAt: node.recovered_at
      }));
      this.pendingReintegrations.set(nodeId, stryMutAct_9fa48("93479") ? {} : (stryCov_9fa48("93479"), {
        nodeId,
        status: ReintegrationStatus.IN_PROGRESS,
        startedAt: Date.now(),
        healthChecks: NUM.ZERO
      }));
      try {
        if (stryMutAct_9fa48("93480")) {
          {}
        } else {
          stryCov_9fa48("93480");
          // Verify node health with multiple checks
          const isHealthy = await this.verifyNodeHealth(node);
          if (stryMutAct_9fa48("93482") ? false : stryMutAct_9fa48("93481") ? true : (stryCov_9fa48("93481", "93482"), isHealthy)) {
            if (stryMutAct_9fa48("93483")) {
              {}
            } else {
              stryCov_9fa48("93483");
              await this.completeReintegration(node);
            }
          } else {
            if (stryMutAct_9fa48("93484")) {
              {}
            } else {
              stryCov_9fa48("93484");
              await this.failReintegration(node, NODE_REINTEGRATION_REASON.HEALTH_CHECK_FAILED);
            }
          }
        }
      } catch (error) {
        if (stryMutAct_9fa48("93485")) {
          {}
        } else {
          stryCov_9fa48("93485");
          await this.failReintegration(node, error.message);
        }
      }
    }
  }

  /**
   * Verify node health with multiple consecutive checks.
   * @param {Object} node - Node to verify.
   * @return {Promise<boolean>} True if node is healthy.
   * @private
   */
  async verifyNodeHealth(node) {
    if (stryMutAct_9fa48("93486")) {
      {}
    } else {
      stryCov_9fa48("93486");
      const nodeId = node.node_id;
      let successfulChecks = NUM.ZERO;
      for (let i = NUM.ZERO; stryMutAct_9fa48("93489") ? i >= this.healthCheckCount : stryMutAct_9fa48("93488") ? i <= this.healthCheckCount : stryMutAct_9fa48("93487") ? false : (stryCov_9fa48("93487", "93488", "93489"), i < this.healthCheckCount); stryMutAct_9fa48("93490") ? i -= NUM.ONE : (stryCov_9fa48("93490"), i += NUM.ONE)) {
        if (stryMutAct_9fa48("93491")) {
          {}
        } else {
          stryCov_9fa48("93491");
          // Wait between checks
          if (stryMutAct_9fa48("93495") ? i <= NUM.ZERO : stryMutAct_9fa48("93494") ? i >= NUM.ZERO : stryMutAct_9fa48("93493") ? false : stryMutAct_9fa48("93492") ? true : (stryCov_9fa48("93492", "93493", "93494", "93495"), i > NUM.ZERO)) {
            if (stryMutAct_9fa48("93496")) {
              {}
            } else {
              stryCov_9fa48("93496");
              await this.sleep(this.healthCheckIntervalMs);
            }
          }

          // Check if node is still sending heartbeats
          const currentNode = this.getNode(nodeId);
          if (stryMutAct_9fa48("93499") ? false : stryMutAct_9fa48("93498") ? true : stryMutAct_9fa48("93497") ? currentNode : (stryCov_9fa48("93497", "93498", "93499"), !currentNode)) {
            if (stryMutAct_9fa48("93500")) {
              {}
            } else {
              stryCov_9fa48("93500");
              this.logger.warn(NODE_REINTEGRATION_LOG_MSG.NODE_NOT_FOUND, stryMutAct_9fa48("93501") ? {} : (stryCov_9fa48("93501"), {
                nodeId
              }));
              return stryMutAct_9fa48("93502") ? true : (stryCov_9fa48("93502"), false);
            }
          }
          const now = Date.now();
          const lastHeartbeat = stryMutAct_9fa48("93505") ? currentNode.last_heartbeat && NUM.ZERO : stryMutAct_9fa48("93504") ? false : stryMutAct_9fa48("93503") ? true : (stryCov_9fa48("93503", "93504", "93505"), currentNode.last_heartbeat || NUM.ZERO);
          const timeSinceHeartbeat = stryMutAct_9fa48("93506") ? now + lastHeartbeat : (stryCov_9fa48("93506"), now - lastHeartbeat);

          // Consider healthy if heartbeat within HEALTHY_HEARTBEAT_WINDOW_MS
          if (stryMutAct_9fa48("93510") ? timeSinceHeartbeat >= NODE_REINTEGRATION_DEFAULT.HEALTHY_HEARTBEAT_WINDOW_MS : stryMutAct_9fa48("93509") ? timeSinceHeartbeat <= NODE_REINTEGRATION_DEFAULT.HEALTHY_HEARTBEAT_WINDOW_MS : stryMutAct_9fa48("93508") ? false : stryMutAct_9fa48("93507") ? true : (stryCov_9fa48("93507", "93508", "93509", "93510"), timeSinceHeartbeat < NODE_REINTEGRATION_DEFAULT.HEALTHY_HEARTBEAT_WINDOW_MS)) {
            if (stryMutAct_9fa48("93511")) {
              {}
            } else {
              stryCov_9fa48("93511");
              stryMutAct_9fa48("93512") ? successfulChecks -= NUM.ONE : (stryCov_9fa48("93512"), successfulChecks += NUM.ONE);
              this.logger.debug(NODE_REINTEGRATION_LOG_MSG.HEALTH_CHECK_PASSED, stryMutAct_9fa48("93513") ? {} : (stryCov_9fa48("93513"), {
                nodeId,
                check: stryMutAct_9fa48("93514") ? i - NUM.ONE : (stryCov_9fa48("93514"), i + NUM.ONE),
                total: this.healthCheckCount,
                timeSinceHeartbeat
              }));
            }
          } else {
            if (stryMutAct_9fa48("93515")) {
              {}
            } else {
              stryCov_9fa48("93515");
              this.logger.warn(NODE_REINTEGRATION_LOG_MSG.HEALTH_CHECK_FAILED, stryMutAct_9fa48("93516") ? {} : (stryCov_9fa48("93516"), {
                nodeId,
                check: stryMutAct_9fa48("93517") ? i - NUM.ONE : (stryCov_9fa48("93517"), i + NUM.ONE),
                total: this.healthCheckCount,
                timeSinceHeartbeat
              }));
              return stryMutAct_9fa48("93518") ? true : (stryCov_9fa48("93518"), false);
            }
          }

          // Update pending reintegration
          const pending = this.pendingReintegrations.get(nodeId);
          if (stryMutAct_9fa48("93520") ? false : stryMutAct_9fa48("93519") ? true : (stryCov_9fa48("93519", "93520"), pending)) {
            if (stryMutAct_9fa48("93521")) {
              {}
            } else {
              stryCov_9fa48("93521");
              pending.healthChecks = successfulChecks;
            }
          }
        }
      }
      return stryMutAct_9fa48("93524") ? successfulChecks !== this.healthCheckCount : stryMutAct_9fa48("93523") ? false : stryMutAct_9fa48("93522") ? true : (stryCov_9fa48("93522", "93523", "93524"), successfulChecks === this.healthCheckCount);
    }
  }

  /**
   * Complete node reintegration.
   * @param {Object} node - Node to reintegrate.
   * @return {Promise<void>}
   * @private
   */
  async completeReintegration(node) {
    if (stryMutAct_9fa48("93525")) {
      {}
    } else {
      stryCov_9fa48("93525");
      const nodeId = node.node_id;
      const now = Date.now();
      this.logger.info(NODE_REINTEGRATION_LOG_MSG.COMPLETING_REINTEGRATION, stryMutAct_9fa48("93526") ? {} : (stryCov_9fa48("93526"), {
        nodeId,
        downtime: stryMutAct_9fa48("93527") ? now + (node.failed_at || node.recovered_at || now) : (stryCov_9fa48("93527"), now - (stryMutAct_9fa48("93530") ? (node.failed_at || node.recovered_at) && now : stryMutAct_9fa48("93529") ? false : stryMutAct_9fa48("93528") ? true : (stryCov_9fa48("93528", "93529", "93530"), (stryMutAct_9fa48("93532") ? node.failed_at && node.recovered_at : stryMutAct_9fa48("93531") ? false : (stryCov_9fa48("93531", "93532"), node.failed_at || node.recovered_at)) || now)))
      }));

      // Mark node as active
      try {
        if (stryMutAct_9fa48("93533")) {
          {}
        } else {
          stryCov_9fa48("93533");
          const result = await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("93534") ? {} : (stryCov_9fa48("93534"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
            tableName: SYSTEM_TABLE_NAME.NODES,
            whereClause: buildObservedNodeWhereClause(node),
            data: stryMutAct_9fa48("93535") ? {} : (stryCov_9fa48("93535"), {
              status: NodeStatus.ACTIVE,
              reintegrated_at: now,
              updated_at: now
            })
          }), stryMutAct_9fa48("93536") ? {} : (stryCov_9fa48("93536"), {
            workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
            deliveryPriority: stryMutAct_9fa48("93537") ? "" : (stryCov_9fa48("93537"), 'critical')
          }));
          if (stryMutAct_9fa48("93540") ? false : stryMutAct_9fa48("93539") ? true : stryMutAct_9fa48("93538") ? guardedUpdateApplied(result) : (stryCov_9fa48("93538", "93539", "93540"), !guardedUpdateApplied(result))) {
            if (stryMutAct_9fa48("93541")) {
              {}
            } else {
              stryCov_9fa48("93541");
              this.logger.debug(NODE_REINTEGRATION_LOG_MSG.STALE_COMPLETION_UPDATE, stryMutAct_9fa48("93542") ? {} : (stryCov_9fa48("93542"), {
                nodeId
              }));
              return;
            }
          }
        }
      } catch (error) {
        if (stryMutAct_9fa48("93543")) {
          {}
        } else {
          stryCov_9fa48("93543");
          this.logger.error(NODE_REINTEGRATION_LOG_MSG.MARK_NODE_ACTIVE_FAILED, stryMutAct_9fa48("93544") ? {} : (stryCov_9fa48("93544"), {
            nodeId,
            error: error.message
          }));
          throw error;
        }
      }

      // Update pending reintegration status
      const pending = this.pendingReintegrations.get(nodeId);
      if (stryMutAct_9fa48("93546") ? false : stryMutAct_9fa48("93545") ? true : (stryCov_9fa48("93545", "93546"), pending)) {
        if (stryMutAct_9fa48("93547")) {
          {}
        } else {
          stryCov_9fa48("93547");
          pending.status = ReintegrationStatus.COMPLETED;
          pending.completedAt = now;
        }
      }
      stryMutAct_9fa48("93548") ? this.reintegrationCount -= NUM.ONE : (stryCov_9fa48("93548"), this.reintegrationCount += NUM.ONE);

      // Emit events
      this.emit(NODE_REINTEGRATION_EVENT.NODE_REINTEGRATED, stryMutAct_9fa48("93549") ? {} : (stryCov_9fa48("93549"), {
        nodeId,
        timestamp: now
      }));

      // Trigger rebalancing
      this.emit(NODE_REINTEGRATION_EVENT.TRIGGER_REBALANCING, stryMutAct_9fa48("93550") ? {} : (stryCov_9fa48("93550"), {
        nodeId,
        reason: NODE_REINTEGRATION_REASON.NODE_REINTEGRATION,
        timestamp: now
      }));
      this.logger.info(NODE_REINTEGRATION_LOG_MSG.REINTEGRATION_COMPLETED, stryMutAct_9fa48("93551") ? {} : (stryCov_9fa48("93551"), {
        nodeId,
        message: NODE_REINTEGRATION_LOG_MSG.REBALANCER_NOTICE
      }));

      // Clean up pending reintegration after a delay
      const cleanupTimer = setTimeout(() => {
        if (stryMutAct_9fa48("93552")) {
          {}
        } else {
          stryCov_9fa48("93552");
          this.pendingReintegrations.delete(nodeId);
          this.cleanupTimers.delete(nodeId);
        }
      }, NODE_REINTEGRATION_DEFAULT.CLEANUP_DELAY_MS);
      stryMutAct_9fa48("93553") ? cleanupTimer.unref() : (stryCov_9fa48("93553"), cleanupTimer.unref?.());
      this.cleanupTimers.set(nodeId, cleanupTimer);
    }
  }

  /**
   * Handle failed reintegration.
   * @param {Object} node - Node that failed reintegration.
   * @param {string} reason - Reason for failure.
   * @return {Promise<void>}
   * @private
   */
  async failReintegration(node, reason) {
    if (stryMutAct_9fa48("93554")) {
      {}
    } else {
      stryCov_9fa48("93554");
      const nodeId = node.node_id;
      this.logger.error(NODE_REINTEGRATION_LOG_MSG.REINTEGRATION_FAILED, stryMutAct_9fa48("93555") ? {} : (stryCov_9fa48("93555"), {
        nodeId,
        reason
      }));

      // Update pending reintegration status
      const pending = this.pendingReintegrations.get(nodeId);
      if (stryMutAct_9fa48("93557") ? false : stryMutAct_9fa48("93556") ? true : (stryCov_9fa48("93556", "93557"), pending)) {
        if (stryMutAct_9fa48("93558")) {
          {}
        } else {
          stryCov_9fa48("93558");
          pending.status = NODE_REINTEGRATION_STATUS.FAILED;
          pending.failedAt = Date.now();
          pending.failureReason = reason;
        }
      }

      // Mark node back to failed status if health checks failed
      if (stryMutAct_9fa48("93561") ? reason !== NODE_REINTEGRATION_REASON.HEALTH_CHECK_FAILED : stryMutAct_9fa48("93560") ? false : stryMutAct_9fa48("93559") ? true : (stryCov_9fa48("93559", "93560", "93561"), reason === NODE_REINTEGRATION_REASON.HEALTH_CHECK_FAILED)) {
        if (stryMutAct_9fa48("93562")) {
          {}
        } else {
          stryCov_9fa48("93562");
          try {
            if (stryMutAct_9fa48("93563")) {
              {}
            } else {
              stryCov_9fa48("93563");
              const result = await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("93564") ? {} : (stryCov_9fa48("93564"), {
                operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
                tableName: SYSTEM_TABLE_NAME.NODES,
                whereClause: buildObservedNodeWhereClause(node),
                data: stryMutAct_9fa48("93565") ? {} : (stryCov_9fa48("93565"), {
                  status: NodeStatus.FAILED,
                  updated_at: Date.now()
                })
              }), stryMutAct_9fa48("93566") ? {} : (stryCov_9fa48("93566"), {
                workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
                deliveryPriority: stryMutAct_9fa48("93567") ? "" : (stryCov_9fa48("93567"), 'critical')
              }));
              if (stryMutAct_9fa48("93570") ? false : stryMutAct_9fa48("93569") ? true : stryMutAct_9fa48("93568") ? guardedUpdateApplied(result) : (stryCov_9fa48("93568", "93569", "93570"), !guardedUpdateApplied(result))) {
                if (stryMutAct_9fa48("93571")) {
                  {}
                } else {
                  stryCov_9fa48("93571");
                  this.logger.debug(NODE_REINTEGRATION_LOG_MSG.STALE_FAILURE_UPDATE, stryMutAct_9fa48("93572") ? {} : (stryCov_9fa48("93572"), {
                    nodeId,
                    reason
                  }));
                }
              }
            }
          } catch (error) {
            if (stryMutAct_9fa48("93573")) {
              {}
            } else {
              stryCov_9fa48("93573");
              this.logger.error(NODE_REINTEGRATION_LOG_MSG.MARK_NODE_FAILED_FAILED, stryMutAct_9fa48("93574") ? {} : (stryCov_9fa48("93574"), {
                nodeId,
                error: error.message
              }));
              throw error;
            }
          }
        }
      }
      this.emit(NODE_REINTEGRATION_EVENT.REINTEGRATION_FAILED, stryMutAct_9fa48("93575") ? {} : (stryCov_9fa48("93575"), {
        nodeId,
        reason
      }));

      // Clean up pending reintegration after a delay
      const cleanupTimer = setTimeout(() => {
        if (stryMutAct_9fa48("93576")) {
          {}
        } else {
          stryCov_9fa48("93576");
          this.pendingReintegrations.delete(nodeId);
          this.cleanupTimers.delete(nodeId);
        }
      }, NODE_REINTEGRATION_DEFAULT.CLEANUP_DELAY_MS);
      stryMutAct_9fa48("93577") ? cleanupTimer.unref() : (stryCov_9fa48("93577"), cleanupTimer.unref?.());
      this.cleanupTimers.set(nodeId, cleanupTimer);
    }
  }

  /**
   * Get all nodes from cache.
   * @return {Array<Object>} Array of node objects.
   * @private
   */
  getNodes() {
    if (stryMutAct_9fa48("93578")) {
      {}
    } else {
      stryCov_9fa48("93578");
      assertCritical(this.systemTableCache, NODE_REINTEGRATION_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE);
      return this.systemTableCache.getAll(SYSTEM_TABLE_NAME.NODES);
    }
  }

  /**
   * Get a specific node from cache.
   * @param {string} nodeId - Node ID.
   * @return {Object|null} Node object or null.
   * @private
   */
  getNode(nodeId) {
    if (stryMutAct_9fa48("93579")) {
      {}
    } else {
      stryCov_9fa48("93579");
      assertCritical(this.systemTableCache, NODE_REINTEGRATION_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE);
      const nodes = stryMutAct_9fa48("93580") ? this.systemTableCache : (stryCov_9fa48("93580"), this.systemTableCache.filter(SYSTEM_TABLE_NAME.NODES, node => {
        if (stryMutAct_9fa48("93581")) {
          {}
        } else {
          stryCov_9fa48("93581");
          return stryMutAct_9fa48("93584") ? node.node_id !== nodeId : stryMutAct_9fa48("93583") ? false : stryMutAct_9fa48("93582") ? true : (stryCov_9fa48("93582", "93583", "93584"), node.node_id === nodeId);
        }
      }));
      return stryMutAct_9fa48("93587") ? nodes[NUM.ZERO] && null : stryMutAct_9fa48("93586") ? false : stryMutAct_9fa48("93585") ? true : (stryCov_9fa48("93585", "93586", "93587"), nodes[NUM.ZERO] || null);
    }
  }

  /**
   * Sleep for a specified duration.
   * @param {number} ms - Milliseconds to sleep.
   * @return {Promise<void>}
   * @private
   */
  sleep(ms) {
    if (stryMutAct_9fa48("93588")) {
      {}
    } else {
      stryCov_9fa48("93588");
      return new Promise(stryMutAct_9fa48("93589") ? () => undefined : (stryCov_9fa48("93589"), resolve => setTimeout(resolve, ms)));
    }
  }

  /**
   * Get node reintegration statistics.
   * @return {Object} Statistics object.
   */
  getStats() {
    if (stryMutAct_9fa48("93590")) {
      {}
    } else {
      stryCov_9fa48("93590");
      return stryMutAct_9fa48("93591") ? {} : (stryCov_9fa48("93591"), {
        nodeId: this.nodeId,
        checkIntervalMs: this.checkIntervalMs,
        currentCheckIntervalMs: this.currentCheckIntervalMs,
        healthCheckCount: this.healthCheckCount,
        pendingReintegrations: this.pendingReintegrations.size,
        reintegrationCount: this.reintegrationCount,
        isRunning: this.monitoringActive,
        initialized: this.initialized
      });
    }
  }

  /**
   * Get pending reintegrations.
   * @return {Array<Object>} Array of pending reintegration info.
   */
  getPendingReintegrations() {
    if (stryMutAct_9fa48("93592")) {
      {}
    } else {
      stryCov_9fa48("93592");
      return Array.from(this.pendingReintegrations.values());
    }
  }

  /**
   * Check if service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("93593")) {
      {}
    } else {
      stryCov_9fa48("93593");
      return this.initialized;
    }
  }

  /**
   * Check if service is running.
   * @return {boolean} True if running.
   */
  isRunning() {
    if (stryMutAct_9fa48("93594")) {
      {}
    } else {
      stryCov_9fa48("93594");
      return this.monitoringActive;
    }
  }

  /**
   * @return {ControlPlaneSystemTableGateway}
   * @private
   */
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("93595")) {
      {}
    } else {
      stryCov_9fa48("93595");
      if (stryMutAct_9fa48("93597") ? false : stryMutAct_9fa48("93596") ? true : (stryCov_9fa48("93596", "93597"), this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("93598")) {
          {}
        } else {
          stryCov_9fa48("93598");
          return this.controlPlaneSystemTableGateway;
        }
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("93599") ? {} : (stryCov_9fa48("93599"), {
        nodeId: this.nodeId,
        getCdcIntegrationService: stryMutAct_9fa48("93600") ? () => undefined : (stryCov_9fa48("93600"), () => this.cdcIntegrationService),
        getMessageRouter: stryMutAct_9fa48("93601") ? () => undefined : (stryCov_9fa48("93601"), () => stryMutAct_9fa48("93604") ? this.cdcIntegrationService?.messageRouter && null : stryMutAct_9fa48("93603") ? false : stryMutAct_9fa48("93602") ? true : (stryCov_9fa48("93602", "93603", "93604"), (stryMutAct_9fa48("93605") ? this.cdcIntegrationService.messageRouter : (stryCov_9fa48("93605"), this.cdcIntegrationService?.messageRouter)) || null))
      })).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
  }

  /**
   * Shutdown the node reintegration service.
   */
  shutdown() {
    if (stryMutAct_9fa48("93606")) {
      {}
    } else {
      stryCov_9fa48("93606");
      this.stop();

      // Clear all cleanup timers
      for (const timer of this.cleanupTimers.values()) {
        if (stryMutAct_9fa48("93607")) {
          {}
        } else {
          stryCov_9fa48("93607");
          clearTimeout(timer);
        }
      }
      this.cleanupTimers.clear();
      this.pendingReintegrations.clear();
      this.initialized = stryMutAct_9fa48("93608") ? true : (stryCov_9fa48("93608"), false);
      this.logger.info(NODE_REINTEGRATION_LOG_MSG.SHUTDOWN, stryMutAct_9fa48("93609") ? {} : (stryCov_9fa48("93609"), {
        nodeId: this.nodeId,
        totalReintegrations: this.reintegrationCount
      }));
    }
  }
}
export { NodeReintegrationService, NodeStatus, NODE_REINTEGRATION_STATUS as ReintegrationStatus };