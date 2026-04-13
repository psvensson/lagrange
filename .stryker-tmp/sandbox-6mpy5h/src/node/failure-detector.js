/**
 * Failure Detector - Detects node failures via heartbeat timeout.
 * Marks affected replicas as unavailable when nodes fail.
 * Requirements: 14.1
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
import { NUM, SERVICE_TYPE, TYPEOF } from '../constants/index.js';
import { ReplicaStatus } from '../rebalancer/replica-status.js';
import { CONTROL_PLANE_MUTATION_OPERATION, readAuthoritativeControlPlaneRows } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { assertCritical } from '../utils/assert.js';
import { FAILURE_DETECTOR_ACTION, FAILURE_DETECTOR_DEFAULT, FAILURE_DETECTOR_ERROR_MSG, FAILURE_DETECTOR_EVENT, FAILURE_DETECTOR_LOG_MSG, FAILURE_DETECTOR_REPLICA_TYPE, FAILURE_DETECTOR_SQL, FAILURE_DETECTOR_SUBSYSTEM, NODE_STATUS } from './node-constants.js';

/**
 * FailureDetector monitors node health via heartbeat timeouts.
 * When a node fails, it marks all affected replicas as unavailable.
 *
 * Two-layer detection:
 * - Layer 1 (Raft-Level): Fast detection of replica failures (150-500ms)
 * - Layer 2 (Node-Level): Confirmation of node failures (15 seconds)
 */
const NodeStatus = NODE_STATUS;
function buildObservedNodeWhereClause(node) {
  if (stryMutAct_9fa48("91654")) {
    {}
  } else {
    stryCov_9fa48("91654");
    const whereClause = stryMutAct_9fa48("91655") ? {} : (stryCov_9fa48("91655"), {
      node_id: node.node_id
    });
    if (stryMutAct_9fa48("91658") ? typeof node?.status === TYPEOF.STRING || node.status.length > 0 : stryMutAct_9fa48("91657") ? false : stryMutAct_9fa48("91656") ? true : (stryCov_9fa48("91656", "91657", "91658"), (stryMutAct_9fa48("91660") ? typeof node?.status !== TYPEOF.STRING : stryMutAct_9fa48("91659") ? true : (stryCov_9fa48("91659", "91660"), typeof (stryMutAct_9fa48("91661") ? node.status : (stryCov_9fa48("91661"), node?.status)) === TYPEOF.STRING)) && (stryMutAct_9fa48("91664") ? node.status.length <= 0 : stryMutAct_9fa48("91663") ? node.status.length >= 0 : stryMutAct_9fa48("91662") ? true : (stryCov_9fa48("91662", "91663", "91664"), node.status.length > 0)))) {
      if (stryMutAct_9fa48("91665")) {
        {}
      } else {
        stryCov_9fa48("91665");
        whereClause.status = node.status;
      }
    }
    if (stryMutAct_9fa48("91667") ? false : stryMutAct_9fa48("91666") ? true : (stryCov_9fa48("91666", "91667"), Number.isFinite(stryMutAct_9fa48("91668") ? node.last_heartbeat : (stryCov_9fa48("91668"), node?.last_heartbeat)))) {
      if (stryMutAct_9fa48("91669")) {
        {}
      } else {
        stryCov_9fa48("91669");
        whereClause.last_heartbeat = node.last_heartbeat;
      }
    }
    if (stryMutAct_9fa48("91671") ? false : stryMutAct_9fa48("91670") ? true : (stryCov_9fa48("91670", "91671"), Number.isFinite(stryMutAct_9fa48("91672") ? node.failed_at : (stryCov_9fa48("91672"), node?.failed_at)))) {
      if (stryMutAct_9fa48("91673")) {
        {}
      } else {
        stryCov_9fa48("91673");
        whereClause.failed_at = node.failed_at;
      }
    }
    if (stryMutAct_9fa48("91675") ? false : stryMutAct_9fa48("91674") ? true : (stryCov_9fa48("91674", "91675"), Number.isFinite(stryMutAct_9fa48("91676") ? node.recovered_at : (stryCov_9fa48("91676"), node?.recovered_at)))) {
      if (stryMutAct_9fa48("91677")) {
        {}
      } else {
        stryCov_9fa48("91677");
        whereClause.recovered_at = node.recovered_at;
      }
    }
    return whereClause;
  }
}
function buildObservedReplicaWhereClause(replica) {
  if (stryMutAct_9fa48("91678")) {
    {}
  } else {
    stryCov_9fa48("91678");
    const whereClause = stryMutAct_9fa48("91679") ? {} : (stryCov_9fa48("91679"), {
      service_id: replica.service_id
    });
    if (stryMutAct_9fa48("91682") ? typeof replica?.node_id === TYPEOF.STRING || replica.node_id.length > 0 : stryMutAct_9fa48("91681") ? false : stryMutAct_9fa48("91680") ? true : (stryCov_9fa48("91680", "91681", "91682"), (stryMutAct_9fa48("91684") ? typeof replica?.node_id !== TYPEOF.STRING : stryMutAct_9fa48("91683") ? true : (stryCov_9fa48("91683", "91684"), typeof (stryMutAct_9fa48("91685") ? replica.node_id : (stryCov_9fa48("91685"), replica?.node_id)) === TYPEOF.STRING)) && (stryMutAct_9fa48("91688") ? replica.node_id.length <= 0 : stryMutAct_9fa48("91687") ? replica.node_id.length >= 0 : stryMutAct_9fa48("91686") ? true : (stryCov_9fa48("91686", "91687", "91688"), replica.node_id.length > 0)))) {
      if (stryMutAct_9fa48("91689")) {
        {}
      } else {
        stryCov_9fa48("91689");
        whereClause.node_id = replica.node_id;
      }
    }
    if (stryMutAct_9fa48("91692") ? typeof replica?.status === TYPEOF.STRING || replica.status.length > 0 : stryMutAct_9fa48("91691") ? false : stryMutAct_9fa48("91690") ? true : (stryCov_9fa48("91690", "91691", "91692"), (stryMutAct_9fa48("91694") ? typeof replica?.status !== TYPEOF.STRING : stryMutAct_9fa48("91693") ? true : (stryCov_9fa48("91693", "91694"), typeof (stryMutAct_9fa48("91695") ? replica.status : (stryCov_9fa48("91695"), replica?.status)) === TYPEOF.STRING)) && (stryMutAct_9fa48("91698") ? replica.status.length <= 0 : stryMutAct_9fa48("91697") ? replica.status.length >= 0 : stryMutAct_9fa48("91696") ? true : (stryCov_9fa48("91696", "91697", "91698"), replica.status.length > 0)))) {
      if (stryMutAct_9fa48("91699")) {
        {}
      } else {
        stryCov_9fa48("91699");
        whereClause.status = replica.status;
      }
    }
    if (stryMutAct_9fa48("91701") ? false : stryMutAct_9fa48("91700") ? true : (stryCov_9fa48("91700", "91701"), Number.isFinite(stryMutAct_9fa48("91702") ? replica.updated_at : (stryCov_9fa48("91702"), replica?.updated_at)))) {
      if (stryMutAct_9fa48("91703")) {
        {}
      } else {
        stryCov_9fa48("91703");
        whereClause.updated_at = replica.updated_at;
      }
    }
    return whereClause;
  }
}
function guardedUpdateApplied(result) {
  if (stryMutAct_9fa48("91704")) {
    {}
  } else {
    stryCov_9fa48("91704");
    if (stryMutAct_9fa48("91707") ? result?.success !== false : stryMutAct_9fa48("91706") ? false : stryMutAct_9fa48("91705") ? true : (stryCov_9fa48("91705", "91706", "91707"), (stryMutAct_9fa48("91708") ? result.success : (stryCov_9fa48("91708"), result?.success)) === (stryMutAct_9fa48("91709") ? true : (stryCov_9fa48("91709"), false)))) {
      if (stryMutAct_9fa48("91710")) {
        {}
      } else {
        stryCov_9fa48("91710");
        return stryMutAct_9fa48("91711") ? true : (stryCov_9fa48("91711"), false);
      }
    }
    const affectedRows = Number(stryMutAct_9fa48("91713") ? result.partitionResult?.affectedRows : stryMutAct_9fa48("91712") ? result?.partitionResult.affectedRows : (stryCov_9fa48("91712", "91713"), result?.partitionResult?.affectedRows));
    return stryMutAct_9fa48("91716") ? !Number.isFinite(affectedRows) && affectedRows > NUM.ZERO : stryMutAct_9fa48("91715") ? false : stryMutAct_9fa48("91714") ? true : (stryCov_9fa48("91714", "91715", "91716"), (stryMutAct_9fa48("91717") ? Number.isFinite(affectedRows) : (stryCov_9fa48("91717"), !Number.isFinite(affectedRows))) || (stryMutAct_9fa48("91720") ? affectedRows <= NUM.ZERO : stryMutAct_9fa48("91719") ? affectedRows >= NUM.ZERO : stryMutAct_9fa48("91718") ? false : (stryCov_9fa48("91718", "91719", "91720"), affectedRows > NUM.ZERO)));
  }
}
class FailureDetector extends EventEmitter {
  /**
   * Create a new FailureDetector.
   * @param {Object} options - Configuration options.
   * @param {Object} options.sqlQueryEngine - SQL query engine for reads.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   * @param {string} options.nodeId - This node's ID.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("91721")) {
      {}
    } else {
      stryCov_9fa48("91721");
      super();
      this.sqlQueryEngine = stryMutAct_9fa48("91724") ? options.sqlQueryEngine && null : stryMutAct_9fa48("91723") ? false : stryMutAct_9fa48("91722") ? true : (stryCov_9fa48("91722", "91723", "91724"), options.sqlQueryEngine || null);
      this.systemTableCache = stryMutAct_9fa48("91727") ? options.systemTableCache && null : stryMutAct_9fa48("91726") ? false : stryMutAct_9fa48("91725") ? true : (stryCov_9fa48("91725", "91726", "91727"), options.systemTableCache || null);
      this.cdcIntegrationService = stryMutAct_9fa48("91730") ? options.cdcIntegrationService && null : stryMutAct_9fa48("91729") ? false : stryMutAct_9fa48("91728") ? true : (stryCov_9fa48("91728", "91729", "91730"), options.cdcIntegrationService || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("91733") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("91732") ? false : stryMutAct_9fa48("91731") ? true : (stryCov_9fa48("91731", "91732", "91733"), options.controlPlaneSystemTableGateway || null);
      this.nodeId = stryMutAct_9fa48("91736") ? options.nodeId && null : stryMutAct_9fa48("91735") ? false : stryMutAct_9fa48("91734") ? true : (stryCov_9fa48("91734", "91735", "91736"), options.nodeId || null);

      // Configuration
      const config = ConfigurationManager.getInstance();
      this.checkIntervalMs = stryMutAct_9fa48("91739") ? config.get(CONFIG_KEY.FAILURE_DETECTOR_CHECK_INTERVAL_MS) && FAILURE_DETECTOR_DEFAULT.CHECK_INTERVAL_MS : stryMutAct_9fa48("91738") ? false : stryMutAct_9fa48("91737") ? true : (stryCov_9fa48("91737", "91738", "91739"), config.get(CONFIG_KEY.FAILURE_DETECTOR_CHECK_INTERVAL_MS) || FAILURE_DETECTOR_DEFAULT.CHECK_INTERVAL_MS);
      this.suspicionThresholdMs = stryMutAct_9fa48("91742") ? config.get(CONFIG_KEY.FAILURE_DETECTOR_SUSPICION_THRESHOLD_MS) && FAILURE_DETECTOR_DEFAULT.SUSPICION_THRESHOLD_MS : stryMutAct_9fa48("91741") ? false : stryMutAct_9fa48("91740") ? true : (stryCov_9fa48("91740", "91741", "91742"), config.get(CONFIG_KEY.FAILURE_DETECTOR_SUSPICION_THRESHOLD_MS) || FAILURE_DETECTOR_DEFAULT.SUSPICION_THRESHOLD_MS);
      this.failureThresholdMs = stryMutAct_9fa48("91745") ? config.get(CONFIG_KEY.FAILURE_DETECTOR_FAILURE_THRESHOLD_MS) && FAILURE_DETECTOR_DEFAULT.FAILURE_THRESHOLD_MS : stryMutAct_9fa48("91744") ? false : stryMutAct_9fa48("91743") ? true : (stryCov_9fa48("91743", "91744", "91745"), config.get(CONFIG_KEY.FAILURE_DETECTOR_FAILURE_THRESHOLD_MS) || FAILURE_DETECTOR_DEFAULT.FAILURE_THRESHOLD_MS);
      this.flappingWindowMs = stryMutAct_9fa48("91748") ? config.get(CONFIG_KEY.FAILURE_DETECTOR_FLAPPING_WINDOW_MS) && FAILURE_DETECTOR_DEFAULT.FLAPPING_WINDOW_MS : stryMutAct_9fa48("91747") ? false : stryMutAct_9fa48("91746") ? true : (stryCov_9fa48("91746", "91747", "91748"), config.get(CONFIG_KEY.FAILURE_DETECTOR_FLAPPING_WINDOW_MS) || FAILURE_DETECTOR_DEFAULT.FLAPPING_WINDOW_MS);
      this.flappingThreshold = stryMutAct_9fa48("91751") ? config.get(CONFIG_KEY.FAILURE_DETECTOR_FLAPPING_THRESHOLD) && FAILURE_DETECTOR_DEFAULT.FLAPPING_THRESHOLD : stryMutAct_9fa48("91750") ? false : stryMutAct_9fa48("91749") ? true : (stryCov_9fa48("91749", "91750", "91751"), config.get(CONFIG_KEY.FAILURE_DETECTOR_FLAPPING_THRESHOLD) || FAILURE_DETECTOR_DEFAULT.FLAPPING_THRESHOLD);
      this.adaptiveMaxThresholdMs = stryMutAct_9fa48("91754") ? config.get(CONFIG_KEY.FAILURE_DETECTOR_ADAPTIVE_MAX_THRESHOLD_MS) && FAILURE_DETECTOR_DEFAULT.ADAPTIVE_MAX_THRESHOLD_MS : stryMutAct_9fa48("91753") ? false : stryMutAct_9fa48("91752") ? true : (stryCov_9fa48("91752", "91753", "91754"), config.get(CONFIG_KEY.FAILURE_DETECTOR_ADAPTIVE_MAX_THRESHOLD_MS) || FAILURE_DETECTOR_DEFAULT.ADAPTIVE_MAX_THRESHOLD_MS);
      this.stabilityPeriodMs = stryMutAct_9fa48("91757") ? config.get(CONFIG_KEY.FAILURE_DETECTOR_STABILITY_PERIOD_MS) && FAILURE_DETECTOR_DEFAULT.STABILITY_PERIOD_MS : stryMutAct_9fa48("91756") ? false : stryMutAct_9fa48("91755") ? true : (stryCov_9fa48("91755", "91756", "91757"), config.get(CONFIG_KEY.FAILURE_DETECTOR_STABILITY_PERIOD_MS) || FAILURE_DETECTOR_DEFAULT.STABILITY_PERIOD_MS);

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.forSubsystem(FAILURE_DETECTOR_SUBSYSTEM);

      // State
      this.checkTimer = null;
      this.adaptiveResetTimer = null;
      this.recentFailures = new Map(); // nodeId -> failure timestamps
      this.currentFailureThreshold = this.failureThresholdMs;
      this.initialized = stryMutAct_9fa48("91758") ? true : (stryCov_9fa48("91758"), false);
    }
  }

  /**
   * Initialize the failure detector.
   * @param {Object} options - Initialization options.
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("91759")) {
      {}
    } else {
      stryCov_9fa48("91759");
      if (stryMutAct_9fa48("91761") ? false : stryMutAct_9fa48("91760") ? true : (stryCov_9fa48("91760", "91761"), options.sqlQueryEngine)) {
        if (stryMutAct_9fa48("91762")) {
          {}
        } else {
          stryCov_9fa48("91762");
          this.sqlQueryEngine = options.sqlQueryEngine;
        }
      }
      if (stryMutAct_9fa48("91764") ? false : stryMutAct_9fa48("91763") ? true : (stryCov_9fa48("91763", "91764"), options.systemTableCache)) {
        if (stryMutAct_9fa48("91765")) {
          {}
        } else {
          stryCov_9fa48("91765");
          this.systemTableCache = options.systemTableCache;
        }
      }
      if (stryMutAct_9fa48("91767") ? false : stryMutAct_9fa48("91766") ? true : (stryCov_9fa48("91766", "91767"), options.cdcIntegrationService)) {
        if (stryMutAct_9fa48("91768")) {
          {}
        } else {
          stryCov_9fa48("91768");
          this.cdcIntegrationService = options.cdcIntegrationService;
        }
      }
      if (stryMutAct_9fa48("91770") ? false : stryMutAct_9fa48("91769") ? true : (stryCov_9fa48("91769", "91770"), options.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("91771")) {
          {}
        } else {
          stryCov_9fa48("91771");
          this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
        }
      }
      if (stryMutAct_9fa48("91773") ? false : stryMutAct_9fa48("91772") ? true : (stryCov_9fa48("91772", "91773"), options.nodeId)) {
        if (stryMutAct_9fa48("91774")) {
          {}
        } else {
          stryCov_9fa48("91774");
          this.nodeId = options.nodeId;
        }
      }
      if (stryMutAct_9fa48("91777") ? false : stryMutAct_9fa48("91776") ? true : stryMutAct_9fa48("91775") ? this.nodeId : (stryCov_9fa48("91775", "91776", "91777"), !this.nodeId)) {
        if (stryMutAct_9fa48("91778")) {
          {}
        } else {
          stryCov_9fa48("91778");
          throw new Error(FAILURE_DETECTOR_ERROR_MSG.MISSING_NODE_ID);
        }
      }
      if (stryMutAct_9fa48("91781") ? !this.sqlQueryEngine || this.cdcIntegrationService?.sqlQueryEngine : stryMutAct_9fa48("91780") ? false : stryMutAct_9fa48("91779") ? true : (stryCov_9fa48("91779", "91780", "91781"), (stryMutAct_9fa48("91782") ? this.sqlQueryEngine : (stryCov_9fa48("91782"), !this.sqlQueryEngine)) && (stryMutAct_9fa48("91783") ? this.cdcIntegrationService.sqlQueryEngine : (stryCov_9fa48("91783"), this.cdcIntegrationService?.sqlQueryEngine)))) {
        if (stryMutAct_9fa48("91784")) {
          {}
        } else {
          stryCov_9fa48("91784");
          this.sqlQueryEngine = this.cdcIntegrationService.sqlQueryEngine;
        }
      }
      this.sqlQueryEngine = assertCritical(this.sqlQueryEngine, FAILURE_DETECTOR_ERROR_MSG.MISSING_SQL_QUERY_ENGINE);
      if (stryMutAct_9fa48("91787") ? !this.cdcIntegrationService || !this.controlPlaneSystemTableGateway : stryMutAct_9fa48("91786") ? false : stryMutAct_9fa48("91785") ? true : (stryCov_9fa48("91785", "91786", "91787"), (stryMutAct_9fa48("91788") ? this.cdcIntegrationService : (stryCov_9fa48("91788"), !this.cdcIntegrationService)) && (stryMutAct_9fa48("91789") ? this.controlPlaneSystemTableGateway : (stryCov_9fa48("91789"), !this.controlPlaneSystemTableGateway)))) {
        if (stryMutAct_9fa48("91790")) {
          {}
        } else {
          stryCov_9fa48("91790");
          throw new Error(FAILURE_DETECTOR_ERROR_MSG.MISSING_CDC_SERVICE);
        }
      }
      this.initialized = stryMutAct_9fa48("91791") ? false : (stryCov_9fa48("91791"), true);
      this.logger.info(FAILURE_DETECTOR_LOG_MSG.INITIALIZED, stryMutAct_9fa48("91792") ? {} : (stryCov_9fa48("91792"), {
        nodeId: this.nodeId,
        checkIntervalMs: this.checkIntervalMs,
        suspicionThresholdMs: this.suspicionThresholdMs,
        failureThresholdMs: this.failureThresholdMs
      }));
    }
  }

  /**
   * Replace the active SQL query engine with a newer canonical engine.
   * No-op if called with null/undefined.
   * @param {Object} sqlQueryEngine - The real SQL query engine.
   */
  upgradeSqlQueryEngine(sqlQueryEngine) {
    if (stryMutAct_9fa48("91793")) {
      {}
    } else {
      stryCov_9fa48("91793");
      if (stryMutAct_9fa48("91796") ? false : stryMutAct_9fa48("91795") ? true : stryMutAct_9fa48("91794") ? sqlQueryEngine : (stryCov_9fa48("91794", "91795", "91796"), !sqlQueryEngine)) return;
      this.sqlQueryEngine = sqlQueryEngine;
    }
  }

  /**
   * Start the failure detection loop.
   */
  start() {
    if (stryMutAct_9fa48("91797")) {
      {}
    } else {
      stryCov_9fa48("91797");
      if (stryMutAct_9fa48("91800") ? false : stryMutAct_9fa48("91799") ? true : stryMutAct_9fa48("91798") ? this.initialized : (stryCov_9fa48("91798", "91799", "91800"), !this.initialized)) {
        if (stryMutAct_9fa48("91801")) {
          {}
        } else {
          stryCov_9fa48("91801");
          throw new Error(FAILURE_DETECTOR_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      if (stryMutAct_9fa48("91803") ? false : stryMutAct_9fa48("91802") ? true : (stryCov_9fa48("91802", "91803"), this.checkTimer)) {
        if (stryMutAct_9fa48("91804")) {
          {}
        } else {
          stryCov_9fa48("91804");
          return; // Already running
        }
      }
      this.logger.info(FAILURE_DETECTOR_LOG_MSG.STARTING, stryMutAct_9fa48("91805") ? {} : (stryCov_9fa48("91805"), {
        nodeId: this.nodeId,
        intervalMs: this.checkIntervalMs
      }));
      this.checkTimer = setInterval(async () => {
        if (stryMutAct_9fa48("91806")) {
          {}
        } else {
          stryCov_9fa48("91806");
          try {
            if (stryMutAct_9fa48("91807")) {
              {}
            } else {
              stryCov_9fa48("91807");
              await this.checkNodeHealth();
            }
          } catch (error) {
            if (stryMutAct_9fa48("91808")) {
              {}
            } else {
              stryCov_9fa48("91808");
              if (stryMutAct_9fa48("91811") ? error.isCritical : stryMutAct_9fa48("91810") ? false : stryMutAct_9fa48("91809") ? true : (stryCov_9fa48("91809", "91810", "91811"), error?.isCritical)) {
                if (stryMutAct_9fa48("91812")) {
                  {}
                } else {
                  stryCov_9fa48("91812");
                  throw error;
                }
              }
              this.logger.error(FAILURE_DETECTOR_LOG_MSG.CHECK_ERROR, stryMutAct_9fa48("91813") ? {} : (stryCov_9fa48("91813"), {
                nodeId: this.nodeId,
                error: error.message
              }));
              throw error;
            }
          }
        }
      }, this.checkIntervalMs);
      this.checkTimer.unref();

      // Reset timer is demand-driven and only runs after observed failures.
      this.ensureAdaptiveThresholdResetTimer();
    }
  }

  /**
   * Stop the failure detection loop.
   */
  stop() {
    if (stryMutAct_9fa48("91814")) {
      {}
    } else {
      stryCov_9fa48("91814");
      if (stryMutAct_9fa48("91816") ? false : stryMutAct_9fa48("91815") ? true : (stryCov_9fa48("91815", "91816"), this.checkTimer)) {
        if (stryMutAct_9fa48("91817")) {
          {}
        } else {
          stryCov_9fa48("91817");
          clearInterval(this.checkTimer);
          this.checkTimer = null;
        }
      }
      this.stopAdaptiveThresholdResetTimer();
      this.logger.info(FAILURE_DETECTOR_LOG_MSG.STOPPED, stryMutAct_9fa48("91818") ? {} : (stryCov_9fa48("91818"), {
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Check health of all known nodes.
   * @return {Promise<void>}
   */
  async checkNodeHealth() {
    if (stryMutAct_9fa48("91819")) {
      {}
    } else {
      stryCov_9fa48("91819");
      const now = Date.now();
      const nodes = await this.getNodes();
      for (const node of nodes) {
        if (stryMutAct_9fa48("91820")) {
          {}
        } else {
          stryCov_9fa48("91820");
          // Skip self
          if (stryMutAct_9fa48("91823") ? node.node_id !== this.nodeId : stryMutAct_9fa48("91822") ? false : stryMutAct_9fa48("91821") ? true : (stryCov_9fa48("91821", "91822", "91823"), node.node_id === this.nodeId)) {
            if (stryMutAct_9fa48("91824")) {
              {}
            } else {
              stryCov_9fa48("91824");
              continue;
            }
          }
          await this.evaluateNodeHealth(node, now);
        }
      }
    }
  }

  /**
   * Evaluate health of a single node.
   * @param {Object} node - Node to evaluate.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async evaluateNodeHealth(node, now) {
    if (stryMutAct_9fa48("91825")) {
      {}
    } else {
      stryCov_9fa48("91825");
      const lastHeartbeat = stryMutAct_9fa48("91828") ? node.last_heartbeat && NUM.ZERO : stryMutAct_9fa48("91827") ? false : stryMutAct_9fa48("91826") ? true : (stryCov_9fa48("91826", "91827", "91828"), node.last_heartbeat || NUM.ZERO);
      const timeSinceHeartbeat = stryMutAct_9fa48("91829") ? now + lastHeartbeat : (stryCov_9fa48("91829"), now - lastHeartbeat);

      // Node recovery detected
      if (stryMutAct_9fa48("91832") ? node.status === NODE_STATUS.FAILED || timeSinceHeartbeat < this.currentFailureThreshold : stryMutAct_9fa48("91831") ? false : stryMutAct_9fa48("91830") ? true : (stryCov_9fa48("91830", "91831", "91832"), (stryMutAct_9fa48("91834") ? node.status !== NODE_STATUS.FAILED : stryMutAct_9fa48("91833") ? true : (stryCov_9fa48("91833", "91834"), node.status === NODE_STATUS.FAILED)) && (stryMutAct_9fa48("91837") ? timeSinceHeartbeat >= this.currentFailureThreshold : stryMutAct_9fa48("91836") ? timeSinceHeartbeat <= this.currentFailureThreshold : stryMutAct_9fa48("91835") ? true : (stryCov_9fa48("91835", "91836", "91837"), timeSinceHeartbeat < this.currentFailureThreshold)))) {
        if (stryMutAct_9fa48("91838")) {
          {}
        } else {
          stryCov_9fa48("91838");
          await this.handleNodeRecovery(node, now);
          return;
        }
      }

      // Skip already failed nodes
      if (stryMutAct_9fa48("91841") ? node.status !== NODE_STATUS.FAILED : stryMutAct_9fa48("91840") ? false : stryMutAct_9fa48("91839") ? true : (stryCov_9fa48("91839", "91840", "91841"), node.status === NODE_STATUS.FAILED)) {
        if (stryMutAct_9fa48("91842")) {
          {}
        } else {
          stryCov_9fa48("91842");
          return;
        }
      }

      // Node has failed (no heartbeat for too long)
      if (stryMutAct_9fa48("91846") ? timeSinceHeartbeat <= this.currentFailureThreshold : stryMutAct_9fa48("91845") ? timeSinceHeartbeat >= this.currentFailureThreshold : stryMutAct_9fa48("91844") ? false : stryMutAct_9fa48("91843") ? true : (stryCov_9fa48("91843", "91844", "91845", "91846"), timeSinceHeartbeat > this.currentFailureThreshold)) {
        if (stryMutAct_9fa48("91847")) {
          {}
        } else {
          stryCov_9fa48("91847");
          if (stryMutAct_9fa48("91850") ? node.status !== NODE_STATUS.SUSPECTED : stryMutAct_9fa48("91849") ? false : stryMutAct_9fa48("91848") ? true : (stryCov_9fa48("91848", "91849", "91850"), node.status === NODE_STATUS.SUSPECTED)) {
            if (stryMutAct_9fa48("91851")) {
              {}
            } else {
              stryCov_9fa48("91851");
              // Already suspected, now confirm failure
              await this.handleNodeFailure(node, now);
            }
          } else if (stryMutAct_9fa48("91854") ? node.status !== NODE_STATUS.ACTIVE : stryMutAct_9fa48("91853") ? false : stryMutAct_9fa48("91852") ? true : (stryCov_9fa48("91852", "91853", "91854"), node.status === NODE_STATUS.ACTIVE)) {
            if (stryMutAct_9fa48("91855")) {
              {}
            } else {
              stryCov_9fa48("91855");
              // First timeout, mark as suspected
              await this.handleNodeSuspicion(node, now, timeSinceHeartbeat);
            }
          }
          return;
        }
      }

      // Node is suspected (slow to respond)
      if (stryMutAct_9fa48("91858") ? timeSinceHeartbeat > this.suspicionThresholdMs || node.status === NODE_STATUS.ACTIVE : stryMutAct_9fa48("91857") ? false : stryMutAct_9fa48("91856") ? true : (stryCov_9fa48("91856", "91857", "91858"), (stryMutAct_9fa48("91861") ? timeSinceHeartbeat <= this.suspicionThresholdMs : stryMutAct_9fa48("91860") ? timeSinceHeartbeat >= this.suspicionThresholdMs : stryMutAct_9fa48("91859") ? true : (stryCov_9fa48("91859", "91860", "91861"), timeSinceHeartbeat > this.suspicionThresholdMs)) && (stryMutAct_9fa48("91863") ? node.status !== NODE_STATUS.ACTIVE : stryMutAct_9fa48("91862") ? true : (stryCov_9fa48("91862", "91863"), node.status === NODE_STATUS.ACTIVE)))) {
        if (stryMutAct_9fa48("91864")) {
          {}
        } else {
          stryCov_9fa48("91864");
          await this.handleNodeSuspicion(node, now, timeSinceHeartbeat);
        }
      }
    }
  }

  /**
   * Handle node suspicion (first sign of potential failure).
   * @param {Object} node - Node to mark as suspected.
   * @param {number} now - Current timestamp.
   * @param {number} timeSinceHeartbeat - Time since last heartbeat.
   * @return {Promise<void>}
   * @private
   */
  async handleNodeSuspicion(node, now, timeSinceHeartbeat) {
    if (stryMutAct_9fa48("91865")) {
      {}
    } else {
      stryCov_9fa48("91865");
      this.logger.warn(FAILURE_DETECTOR_LOG_MSG.NODE_SUSPECTED, stryMutAct_9fa48("91866") ? {} : (stryCov_9fa48("91866"), {
        nodeId: node.node_id,
        timeSinceHeartbeat,
        threshold: this.suspicionThresholdMs
      }));
      try {
        if (stryMutAct_9fa48("91867")) {
          {}
        } else {
          stryCov_9fa48("91867");
          const result = await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("91868") ? {} : (stryCov_9fa48("91868"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
            tableName: SYSTEM_TABLE_NAME.NODES,
            whereClause: buildObservedNodeWhereClause(node),
            data: stryMutAct_9fa48("91869") ? {} : (stryCov_9fa48("91869"), {
              status: NODE_STATUS.SUSPECTED,
              updated_at: now
            })
          }), stryMutAct_9fa48("91870") ? {} : (stryCov_9fa48("91870"), {
            workClass: PRESSURE_WORK_CLASS.CRITICAL,
            deliveryPriority: stryMutAct_9fa48("91871") ? "" : (stryCov_9fa48("91871"), 'critical')
          }));
          if (stryMutAct_9fa48("91874") ? false : stryMutAct_9fa48("91873") ? true : stryMutAct_9fa48("91872") ? guardedUpdateApplied(result) : (stryCov_9fa48("91872", "91873", "91874"), !guardedUpdateApplied(result))) {
            if (stryMutAct_9fa48("91875")) {
              {}
            } else {
              stryCov_9fa48("91875");
              this.logger.debug(FAILURE_DETECTOR_LOG_MSG.STALE_NODE_SUSPICION_UPDATE, stryMutAct_9fa48("91876") ? {} : (stryCov_9fa48("91876"), {
                nodeId: node.node_id,
                timeSinceHeartbeat
              }));
              return;
            }
          }
        }
      } catch (error) {
        if (stryMutAct_9fa48("91877")) {
          {}
        } else {
          stryCov_9fa48("91877");
          this.logger.error(FAILURE_DETECTOR_LOG_MSG.MARK_NODE_SUSPECTED_FAILED, stryMutAct_9fa48("91878") ? {} : (stryCov_9fa48("91878"), {
            nodeId: node.node_id,
            error: error.message
          }));
          throw error;
        }
      }
      this.emit(FAILURE_DETECTOR_EVENT.NODE_SUSPECTED, stryMutAct_9fa48("91879") ? {} : (stryCov_9fa48("91879"), {
        nodeId: node.node_id,
        timeSinceHeartbeat
      }));
    }
  }

  /**
   * Handle confirmed node failure.
   * @param {Object} node - Node that has failed.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async handleNodeFailure(node, now) {
    if (stryMutAct_9fa48("91880")) {
      {}
    } else {
      stryCov_9fa48("91880");
      this.logger.error(FAILURE_DETECTOR_LOG_MSG.NODE_FAILURE_DETECTED, stryMutAct_9fa48("91881") ? {} : (stryCov_9fa48("91881"), {
        nodeId: node.node_id,
        lastHeartbeat: new Date(stryMutAct_9fa48("91884") ? node.last_heartbeat && NUM.ZERO : stryMutAct_9fa48("91883") ? false : stryMutAct_9fa48("91882") ? true : (stryCov_9fa48("91882", "91883", "91884"), node.last_heartbeat || NUM.ZERO)).toISOString(),
        threshold: this.currentFailureThreshold
      }));

      // Check for flapping
      await this.checkFlapping(node.node_id, now);

      // Mark node as failed
      try {
        if (stryMutAct_9fa48("91885")) {
          {}
        } else {
          stryCov_9fa48("91885");
          const result = await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("91886") ? {} : (stryCov_9fa48("91886"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
            tableName: SYSTEM_TABLE_NAME.NODES,
            whereClause: buildObservedNodeWhereClause(node),
            data: stryMutAct_9fa48("91887") ? {} : (stryCov_9fa48("91887"), {
              status: NODE_STATUS.FAILED,
              failed_at: now,
              updated_at: now
            })
          }), stryMutAct_9fa48("91888") ? {} : (stryCov_9fa48("91888"), {
            workClass: PRESSURE_WORK_CLASS.CRITICAL,
            deliveryPriority: stryMutAct_9fa48("91889") ? "" : (stryCov_9fa48("91889"), 'critical')
          }));
          if (stryMutAct_9fa48("91892") ? false : stryMutAct_9fa48("91891") ? true : stryMutAct_9fa48("91890") ? guardedUpdateApplied(result) : (stryCov_9fa48("91890", "91891", "91892"), !guardedUpdateApplied(result))) {
            if (stryMutAct_9fa48("91893")) {
              {}
            } else {
              stryCov_9fa48("91893");
              this.logger.debug(FAILURE_DETECTOR_LOG_MSG.STALE_NODE_FAILURE_UPDATE, stryMutAct_9fa48("91894") ? {} : (stryCov_9fa48("91894"), {
                nodeId: node.node_id
              }));
              return;
            }
          }
        }
      } catch (error) {
        if (stryMutAct_9fa48("91895")) {
          {}
        } else {
          stryCov_9fa48("91895");
          this.logger.error(FAILURE_DETECTOR_LOG_MSG.MARK_NODE_FAILED_FAILED, stryMutAct_9fa48("91896") ? {} : (stryCov_9fa48("91896"), {
            nodeId: node.node_id,
            error: error.message
          }));
          throw error;
        }
      }

      // Mark all replicas on this node as failed
      await this.markReplicasAsFailed(node.node_id, now);
      this.emit(FAILURE_DETECTOR_EVENT.NODE_FAILURE, stryMutAct_9fa48("91897") ? {} : (stryCov_9fa48("91897"), {
        nodeId: node.node_id,
        timestamp: now
      }));
    }
  }

  /**
   * Handle node recovery.
   * @param {Object} node - Node that has recovered.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async handleNodeRecovery(node, now) {
    if (stryMutAct_9fa48("91898")) {
      {}
    } else {
      stryCov_9fa48("91898");
      const downtime = stryMutAct_9fa48("91899") ? now + (node.failed_at || node.last_heartbeat || now) : (stryCov_9fa48("91899"), now - (stryMutAct_9fa48("91902") ? (node.failed_at || node.last_heartbeat) && now : stryMutAct_9fa48("91901") ? false : stryMutAct_9fa48("91900") ? true : (stryCov_9fa48("91900", "91901", "91902"), (stryMutAct_9fa48("91904") ? node.failed_at && node.last_heartbeat : stryMutAct_9fa48("91903") ? false : (stryCov_9fa48("91903", "91904"), node.failed_at || node.last_heartbeat)) || now)));
      this.logger.info(FAILURE_DETECTOR_LOG_MSG.NODE_RECOVERY_DETECTED, stryMutAct_9fa48("91905") ? {} : (stryCov_9fa48("91905"), {
        nodeId: node.node_id,
        downtime
      }));
      try {
        if (stryMutAct_9fa48("91906")) {
          {}
        } else {
          stryCov_9fa48("91906");
          const result = await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("91907") ? {} : (stryCov_9fa48("91907"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
            tableName: SYSTEM_TABLE_NAME.NODES,
            whereClause: buildObservedNodeWhereClause(node),
            data: stryMutAct_9fa48("91908") ? {} : (stryCov_9fa48("91908"), {
              status: NODE_STATUS.RECOVERING,
              recovered_at: now,
              updated_at: now
            })
          }), stryMutAct_9fa48("91909") ? {} : (stryCov_9fa48("91909"), {
            workClass: PRESSURE_WORK_CLASS.CRITICAL,
            deliveryPriority: stryMutAct_9fa48("91910") ? "" : (stryCov_9fa48("91910"), 'critical')
          }));
          if (stryMutAct_9fa48("91913") ? false : stryMutAct_9fa48("91912") ? true : stryMutAct_9fa48("91911") ? guardedUpdateApplied(result) : (stryCov_9fa48("91911", "91912", "91913"), !guardedUpdateApplied(result))) {
            if (stryMutAct_9fa48("91914")) {
              {}
            } else {
              stryCov_9fa48("91914");
              this.logger.debug(FAILURE_DETECTOR_LOG_MSG.STALE_NODE_RECOVERY_UPDATE, stryMutAct_9fa48("91915") ? {} : (stryCov_9fa48("91915"), {
                nodeId: node.node_id
              }));
              return;
            }
          }
        }
      } catch (error) {
        if (stryMutAct_9fa48("91916")) {
          {}
        } else {
          stryCov_9fa48("91916");
          this.logger.error(FAILURE_DETECTOR_LOG_MSG.MARK_NODE_RECOVERING_FAILED, stryMutAct_9fa48("91917") ? {} : (stryCov_9fa48("91917"), {
            nodeId: node.node_id,
            error: error.message
          }));
          throw error;
        }
      }
      this.emit(FAILURE_DETECTOR_EVENT.NODE_RECOVERY, stryMutAct_9fa48("91918") ? {} : (stryCov_9fa48("91918"), {
        nodeId: node.node_id,
        downtime,
        timestamp: now
      }));
    }
  }

  /**
   * Mark all replicas on a failed node as failed.
   * @param {string} nodeId - Failed node ID.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async markReplicasAsFailed(nodeId, now) {
    if (stryMutAct_9fa48("91919")) {
      {}
    } else {
      stryCov_9fa48("91919");
      // Mark partition replicas as failed
      const partitionReplicas = await this.getPartitionReplicasOnNode(nodeId);
      for (const replica of partitionReplicas) {
        if (stryMutAct_9fa48("91920")) {
          {}
        } else {
          stryCov_9fa48("91920");
          await this.markReplicaAsFailed(replica, nodeId, now);
        }
      }

      // Mark message group replicas as failed
      const messageGroupReplicas = await this.getMessageGroupReplicasOnNode(nodeId);
      for (const replica of messageGroupReplicas) {
        if (stryMutAct_9fa48("91921")) {
          {}
        } else {
          stryCov_9fa48("91921");
          await this.markMessageGroupReplicaAsFailed(replica, nodeId, now);
        }
      }
      this.logger.info(FAILURE_DETECTOR_LOG_MSG.MARKED_REPLICAS_FAILED, stryMutAct_9fa48("91922") ? {} : (stryCov_9fa48("91922"), {
        nodeId,
        partitionReplicas: partitionReplicas.length,
        messageGroupReplicas: messageGroupReplicas.length
      }));
    }
  }

  /**
   * Mark a partition replica as failed.
   * @param {Object} replica - Replica to mark as failed.
   * @param {string} nodeId - Node ID where replica was located.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async markReplicaAsFailed(replica, nodeId, now) {
    if (stryMutAct_9fa48("91923")) {
      {}
    } else {
      stryCov_9fa48("91923");
      try {
        if (stryMutAct_9fa48("91924")) {
          {}
        } else {
          stryCov_9fa48("91924");
          const result = await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("91925") ? {} : (stryCov_9fa48("91925"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
            tableName: SYSTEM_TABLE_NAME.SERVICES,
            whereClause: buildObservedReplicaWhereClause(replica),
            data: stryMutAct_9fa48("91926") ? {} : (stryCov_9fa48("91926"), {
              status: ReplicaStatus.FAILED,
              updated_at: now
            })
          }), stryMutAct_9fa48("91927") ? {} : (stryCov_9fa48("91927"), {
            workClass: PRESSURE_WORK_CLASS.CRITICAL,
            deliveryPriority: stryMutAct_9fa48("91928") ? "" : (stryCov_9fa48("91928"), 'critical')
          }));
          if (stryMutAct_9fa48("91931") ? false : stryMutAct_9fa48("91930") ? true : stryMutAct_9fa48("91929") ? guardedUpdateApplied(result) : (stryCov_9fa48("91929", "91930", "91931"), !guardedUpdateApplied(result))) {
            if (stryMutAct_9fa48("91932")) {
              {}
            } else {
              stryCov_9fa48("91932");
              this.logger.debug(FAILURE_DETECTOR_LOG_MSG.STALE_PARTITION_REPLICA_FAILURE_UPDATE, stryMutAct_9fa48("91933") ? {} : (stryCov_9fa48("91933"), {
                serviceId: replica.service_id,
                nodeId
              }));
              return;
            }
          }
          this.logger.warn(FAILURE_DETECTOR_LOG_MSG.MARK_PARTITION_REPLICA_FAILED, stryMutAct_9fa48("91934") ? {} : (stryCov_9fa48("91934"), {
            serviceId: replica.service_id,
            partitionId: replica.partition_id,
            nodeId
          }));
          this.emit(FAILURE_DETECTOR_EVENT.REPLICA_FAILED, stryMutAct_9fa48("91935") ? {} : (stryCov_9fa48("91935"), {
            type: FAILURE_DETECTOR_REPLICA_TYPE.PARTITION,
            serviceId: replica.service_id,
            partitionId: replica.partition_id,
            nodeId
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("91936")) {
          {}
        } else {
          stryCov_9fa48("91936");
          this.logger.error(FAILURE_DETECTOR_LOG_MSG.MARK_PARTITION_REPLICA_FAILED_FAILED, stryMutAct_9fa48("91937") ? {} : (stryCov_9fa48("91937"), {
            serviceId: replica.service_id,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Mark a message group replica as failed.
   * @param {Object} replica - Replica to mark as failed.
   * @param {string} nodeId - Node ID where replica was located.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async markMessageGroupReplicaAsFailed(replica, nodeId, now) {
    if (stryMutAct_9fa48("91938")) {
      {}
    } else {
      stryCov_9fa48("91938");
      try {
        if (stryMutAct_9fa48("91939")) {
          {}
        } else {
          stryCov_9fa48("91939");
          const result = await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("91940") ? {} : (stryCov_9fa48("91940"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
            tableName: SYSTEM_TABLE_NAME.SERVICES,
            whereClause: buildObservedReplicaWhereClause(replica),
            data: stryMutAct_9fa48("91941") ? {} : (stryCov_9fa48("91941"), {
              status: ReplicaStatus.FAILED,
              updated_at: now
            })
          }), stryMutAct_9fa48("91942") ? {} : (stryCov_9fa48("91942"), {
            workClass: PRESSURE_WORK_CLASS.CRITICAL,
            deliveryPriority: stryMutAct_9fa48("91943") ? "" : (stryCov_9fa48("91943"), 'critical')
          }));
          if (stryMutAct_9fa48("91946") ? false : stryMutAct_9fa48("91945") ? true : stryMutAct_9fa48("91944") ? guardedUpdateApplied(result) : (stryCov_9fa48("91944", "91945", "91946"), !guardedUpdateApplied(result))) {
            if (stryMutAct_9fa48("91947")) {
              {}
            } else {
              stryCov_9fa48("91947");
              this.logger.debug(FAILURE_DETECTOR_LOG_MSG.STALE_MESSAGE_GROUP_REPLICA_FAILURE_UPDATE, stryMutAct_9fa48("91948") ? {} : (stryCov_9fa48("91948"), {
                serviceId: replica.service_id,
                nodeId
              }));
              return;
            }
          }
          this.logger.warn(FAILURE_DETECTOR_LOG_MSG.MARK_MESSAGE_GROUP_REPLICA_FAILED, stryMutAct_9fa48("91949") ? {} : (stryCov_9fa48("91949"), {
            serviceId: replica.service_id,
            groupId: replica.group_id,
            nodeId
          }));
          this.emit(FAILURE_DETECTOR_EVENT.REPLICA_FAILED, stryMutAct_9fa48("91950") ? {} : (stryCov_9fa48("91950"), {
            type: FAILURE_DETECTOR_REPLICA_TYPE.MESSAGE_GROUP,
            serviceId: replica.service_id,
            groupId: replica.group_id,
            nodeId
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("91951")) {
          {}
        } else {
          stryCov_9fa48("91951");
          this.logger.error(FAILURE_DETECTOR_LOG_MSG.MARK_MESSAGE_GROUP_REPLICA_FAILED_FAILED, stryMutAct_9fa48("91952") ? {} : (stryCov_9fa48("91952"), {
            serviceId: replica.service_id,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Check for node flapping (repeated failures).
   * @param {string} nodeId - Node ID to check.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async checkFlapping(nodeId, now) {
    if (stryMutAct_9fa48("91953")) {
      {}
    } else {
      stryCov_9fa48("91953");
      const failures = stryMutAct_9fa48("91956") ? this.recentFailures.get(nodeId) && [] : stryMutAct_9fa48("91955") ? false : stryMutAct_9fa48("91954") ? true : (stryCov_9fa48("91954", "91955", "91956"), this.recentFailures.get(nodeId) || (stryMutAct_9fa48("91957") ? ["Stryker was here"] : (stryCov_9fa48("91957"), [])));

      // Filter to recent failures within window
      const recentCount = stryMutAct_9fa48("91958") ? failures.length : (stryCov_9fa48("91958"), failures.filter(stryMutAct_9fa48("91959") ? () => undefined : (stryCov_9fa48("91959"), t => stryMutAct_9fa48("91963") ? now - t >= this.flappingWindowMs : stryMutAct_9fa48("91962") ? now - t <= this.flappingWindowMs : stryMutAct_9fa48("91961") ? false : stryMutAct_9fa48("91960") ? true : (stryCov_9fa48("91960", "91961", "91962", "91963"), (stryMutAct_9fa48("91964") ? now + t : (stryCov_9fa48("91964"), now - t)) < this.flappingWindowMs))).length);
      if (stryMutAct_9fa48("91968") ? recentCount < this.flappingThreshold : stryMutAct_9fa48("91967") ? recentCount > this.flappingThreshold : stryMutAct_9fa48("91966") ? false : stryMutAct_9fa48("91965") ? true : (stryCov_9fa48("91965", "91966", "91967", "91968"), recentCount >= this.flappingThreshold)) {
        if (stryMutAct_9fa48("91969")) {
          {}
        } else {
          stryCov_9fa48("91969");
          this.logger.error(FAILURE_DETECTOR_LOG_MSG.NODE_FLAPPING_DETECTED, stryMutAct_9fa48("91970") ? {} : (stryCov_9fa48("91970"), {
            nodeId,
            failureCount: recentCount,
            window: this.flappingWindowMs,
            action: FAILURE_DETECTOR_ACTION.ADAPTIVE_THRESHOLD_INCREASE
          }));

          // Increase threshold adaptively (up to max)
          this.currentFailureThreshold = stryMutAct_9fa48("91971") ? Math.max(this.currentFailureThreshold * FAILURE_DETECTOR_DEFAULT.ADAPTIVE_MULTIPLIER, this.adaptiveMaxThresholdMs) : (stryCov_9fa48("91971"), Math.min(stryMutAct_9fa48("91972") ? this.currentFailureThreshold / FAILURE_DETECTOR_DEFAULT.ADAPTIVE_MULTIPLIER : (stryCov_9fa48("91972"), this.currentFailureThreshold * FAILURE_DETECTOR_DEFAULT.ADAPTIVE_MULTIPLIER), this.adaptiveMaxThresholdMs));
        }
      }

      // Record this failure
      failures.push(now);
      this.recentFailures.set(nodeId, failures);
      this.ensureAdaptiveThresholdResetTimer();
    }
  }

  /**
   * Ensure adaptive threshold reset timer is running when needed.
   * @private
   */
  ensureAdaptiveThresholdResetTimer() {
    if (stryMutAct_9fa48("91973")) {
      {}
    } else {
      stryCov_9fa48("91973");
      if (stryMutAct_9fa48("91976") ? this.adaptiveResetTimer && this.recentFailures.size === NUM.ZERO : stryMutAct_9fa48("91975") ? false : stryMutAct_9fa48("91974") ? true : (stryCov_9fa48("91974", "91975", "91976"), this.adaptiveResetTimer || (stryMutAct_9fa48("91978") ? this.recentFailures.size !== NUM.ZERO : stryMutAct_9fa48("91977") ? false : (stryCov_9fa48("91977", "91978"), this.recentFailures.size === NUM.ZERO)))) {
        if (stryMutAct_9fa48("91979")) {
          {}
        } else {
          stryCov_9fa48("91979");
          return;
        }
      }
      this.adaptiveResetTimer = setInterval(() => {
        if (stryMutAct_9fa48("91980")) {
          {}
        } else {
          stryCov_9fa48("91980");
          const now = Date.now();
          for (const [nodeId, failures] of this.recentFailures) {
            if (stryMutAct_9fa48("91981")) {
              {}
            } else {
              stryCov_9fa48("91981");
              if (stryMutAct_9fa48("91984") ? failures.length !== NUM.ZERO : stryMutAct_9fa48("91983") ? false : stryMutAct_9fa48("91982") ? true : (stryCov_9fa48("91982", "91983", "91984"), failures.length === NUM.ZERO)) {
                if (stryMutAct_9fa48("91985")) {
                  {}
                } else {
                  stryCov_9fa48("91985");
                  continue;
                }
              }
              const lastFailure = stryMutAct_9fa48("91986") ? Math.min(...failures) : (stryCov_9fa48("91986"), Math.max(...failures));
              if (stryMutAct_9fa48("91990") ? now - lastFailure <= this.stabilityPeriodMs : stryMutAct_9fa48("91989") ? now - lastFailure >= this.stabilityPeriodMs : stryMutAct_9fa48("91988") ? false : stryMutAct_9fa48("91987") ? true : (stryCov_9fa48("91987", "91988", "91989", "91990"), (stryMutAct_9fa48("91991") ? now + lastFailure : (stryCov_9fa48("91991"), now - lastFailure)) > this.stabilityPeriodMs)) {
                if (stryMutAct_9fa48("91992")) {
                  {}
                } else {
                  stryCov_9fa48("91992");
                  // Node has been stable, reset threshold
                  this.currentFailureThreshold = this.failureThresholdMs;
                  this.recentFailures.delete(nodeId);
                  this.logger.info(FAILURE_DETECTOR_LOG_MSG.RESET_ADAPTIVE_THRESHOLD, stryMutAct_9fa48("91993") ? {} : (stryCov_9fa48("91993"), {
                    nodeId,
                    newThreshold: this.currentFailureThreshold
                  }));
                }
              }
            }
          }
          if (stryMutAct_9fa48("91996") ? this.recentFailures.size !== NUM.ZERO : stryMutAct_9fa48("91995") ? false : stryMutAct_9fa48("91994") ? true : (stryCov_9fa48("91994", "91995", "91996"), this.recentFailures.size === NUM.ZERO)) {
            if (stryMutAct_9fa48("91997")) {
              {}
            } else {
              stryCov_9fa48("91997");
              this.stopAdaptiveThresholdResetTimer();
            }
          }
        }
      }, FAILURE_DETECTOR_DEFAULT.ADAPTIVE_RESET_INTERVAL_MS);
      this.adaptiveResetTimer.unref();
    }
  }

  /**
   * Stop adaptive threshold reset timer if running.
   * @private
   */
  stopAdaptiveThresholdResetTimer() {
    if (stryMutAct_9fa48("91998")) {
      {}
    } else {
      stryCov_9fa48("91998");
      if (stryMutAct_9fa48("92001") ? false : stryMutAct_9fa48("92000") ? true : stryMutAct_9fa48("91999") ? this.adaptiveResetTimer : (stryCov_9fa48("91999", "92000", "92001"), !this.adaptiveResetTimer)) {
        if (stryMutAct_9fa48("92002")) {
          {}
        } else {
          stryCov_9fa48("92002");
          return;
        }
      }
      clearInterval(this.adaptiveResetTimer);
      this.adaptiveResetTimer = null;
    }
  }

  /**
   * Get all nodes via SQL query engine.
   * @return {Promise<Array<Object>>} Array of node objects.
   * @private
   */
  async getNodes() {
    if (stryMutAct_9fa48("92003")) {
      {}
    } else {
      stryCov_9fa48("92003");
      const result = await readAuthoritativeControlPlaneRows(this.getControlPlaneSystemTableGateway(), SYSTEM_TABLE_NAME.NODES, FAILURE_DETECTOR_SQL.SELECT_ALL_NODES, stryMutAct_9fa48("92004") ? ["Stryker was here"] : (stryCov_9fa48("92004"), []), stryMutAct_9fa48("92005") ? {} : (stryCov_9fa48("92005"), {
        coalescingKey: stryMutAct_9fa48("92006") ? "" : (stryCov_9fa48("92006"), 'failure-detector:nodes'),
        workClass: PRESSURE_WORK_CLASS.CRITICAL
      }));
      return stryMutAct_9fa48("92009") ? result.rows && [] : stryMutAct_9fa48("92008") ? false : stryMutAct_9fa48("92007") ? true : (stryCov_9fa48("92007", "92008", "92009"), result.rows || (stryMutAct_9fa48("92010") ? ["Stryker was here"] : (stryCov_9fa48("92010"), [])));
    }
  }

  /**
   * Get partition replicas on a specific node via SQL query engine.
   * @param {string} nodeId - Node ID.
   * @return {Promise<Array<Object>>} Array of replica objects.
   * @private
   */
  async getPartitionReplicasOnNode(nodeId) {
    if (stryMutAct_9fa48("92011")) {
      {}
    } else {
      stryCov_9fa48("92011");
      const result = await readAuthoritativeControlPlaneRows(this.getControlPlaneSystemTableGateway(), SYSTEM_TABLE_NAME.SERVICES, FAILURE_DETECTOR_SQL.SELECT_SERVICES_BY_NODE_AND_TYPE, stryMutAct_9fa48("92012") ? [] : (stryCov_9fa48("92012"), [nodeId, SERVICE_TYPE.PARTITION]), stryMutAct_9fa48("92013") ? {} : (stryCov_9fa48("92013"), {
        coalescingKey: stryMutAct_9fa48("92014") ? `` : (stryCov_9fa48("92014"), `failure-detector:partition-services:${nodeId}`),
        workClass: PRESSURE_WORK_CLASS.CRITICAL
      }));
      return stryMutAct_9fa48("92017") ? result.rows && [] : stryMutAct_9fa48("92016") ? false : stryMutAct_9fa48("92015") ? true : (stryCov_9fa48("92015", "92016", "92017"), result.rows || (stryMutAct_9fa48("92018") ? ["Stryker was here"] : (stryCov_9fa48("92018"), [])));
    }
  }

  /**
   * Get message group replicas on a specific node via SQL query engine.
   * @param {string} nodeId - Node ID.
   * @return {Promise<Array<Object>>} Array of replica objects.
   * @private
   */
  async getMessageGroupReplicasOnNode(nodeId) {
    if (stryMutAct_9fa48("92019")) {
      {}
    } else {
      stryCov_9fa48("92019");
      const result = await readAuthoritativeControlPlaneRows(this.getControlPlaneSystemTableGateway(), SYSTEM_TABLE_NAME.SERVICES, FAILURE_DETECTOR_SQL.SELECT_SERVICES_BY_NODE_AND_TYPE, stryMutAct_9fa48("92020") ? [] : (stryCov_9fa48("92020"), [nodeId, SERVICE_TYPE.MESSAGE_GROUP_REPLICA]), stryMutAct_9fa48("92021") ? {} : (stryCov_9fa48("92021"), {
        coalescingKey: stryMutAct_9fa48("92022") ? `` : (stryCov_9fa48("92022"), `failure-detector:mg-services:${nodeId}`),
        workClass: PRESSURE_WORK_CLASS.CRITICAL
      }));
      return stryMutAct_9fa48("92025") ? result.rows && [] : stryMutAct_9fa48("92024") ? false : stryMutAct_9fa48("92023") ? true : (stryCov_9fa48("92023", "92024", "92025"), result.rows || (stryMutAct_9fa48("92026") ? ["Stryker was here"] : (stryCov_9fa48("92026"), [])));
    }
  }

  /**
   * Get current failure threshold.
   * @return {number} Current failure threshold in ms.
   */
  getFailureThreshold() {
    if (stryMutAct_9fa48("92027")) {
      {}
    } else {
      stryCov_9fa48("92027");
      return this.currentFailureThreshold;
    }
  }

  /**
   * Get failure detector statistics.
   * @return {Object} Statistics object.
   */
  getStats() {
    if (stryMutAct_9fa48("92028")) {
      {}
    } else {
      stryCov_9fa48("92028");
      return stryMutAct_9fa48("92029") ? {} : (stryCov_9fa48("92029"), {
        nodeId: this.nodeId,
        checkIntervalMs: this.checkIntervalMs,
        currentFailureThreshold: this.currentFailureThreshold,
        recentFailuresCount: this.recentFailures.size,
        isRunning: stryMutAct_9fa48("92032") ? this.checkTimer === null : stryMutAct_9fa48("92031") ? false : stryMutAct_9fa48("92030") ? true : (stryCov_9fa48("92030", "92031", "92032"), this.checkTimer !== null),
        initialized: this.initialized
      });
    }
  }

  /**
   * Check if failure detector is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("92033")) {
      {}
    } else {
      stryCov_9fa48("92033");
      return this.initialized;
    }
  }

  /**
   * Check if failure detector is running.
   * @return {boolean} True if running.
   */
  isRunning() {
    if (stryMutAct_9fa48("92034")) {
      {}
    } else {
      stryCov_9fa48("92034");
      return stryMutAct_9fa48("92037") ? this.checkTimer === null : stryMutAct_9fa48("92036") ? false : stryMutAct_9fa48("92035") ? true : (stryCov_9fa48("92035", "92036", "92037"), this.checkTimer !== null);
    }
  }

  /**
   * @return {ControlPlaneSystemTableGateway}
   * @private
   */
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("92038")) {
      {}
    } else {
      stryCov_9fa48("92038");
      if (stryMutAct_9fa48("92040") ? false : stryMutAct_9fa48("92039") ? true : (stryCov_9fa48("92039", "92040"), this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("92041")) {
          {}
        } else {
          stryCov_9fa48("92041");
          return this.controlPlaneSystemTableGateway;
        }
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("92042") ? {} : (stryCov_9fa48("92042"), {
        nodeId: this.nodeId,
        getSqlQueryEngine: stryMutAct_9fa48("92043") ? () => undefined : (stryCov_9fa48("92043"), () => this.sqlQueryEngine),
        getCdcIntegrationService: stryMutAct_9fa48("92044") ? () => undefined : (stryCov_9fa48("92044"), () => this.cdcIntegrationService),
        getMessageRouter: stryMutAct_9fa48("92045") ? () => undefined : (stryCov_9fa48("92045"), () => stryMutAct_9fa48("92048") ? this.cdcIntegrationService?.messageRouter && null : stryMutAct_9fa48("92047") ? false : stryMutAct_9fa48("92046") ? true : (stryCov_9fa48("92046", "92047", "92048"), (stryMutAct_9fa48("92049") ? this.cdcIntegrationService.messageRouter : (stryCov_9fa48("92049"), this.cdcIntegrationService?.messageRouter)) || null))
      })).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
  }

  /**
   * Shutdown the failure detector.
   */
  shutdown() {
    if (stryMutAct_9fa48("92050")) {
      {}
    } else {
      stryCov_9fa48("92050");
      this.stop();
      this.recentFailures.clear();
      this.currentFailureThreshold = this.failureThresholdMs;
      this.initialized = stryMutAct_9fa48("92051") ? true : (stryCov_9fa48("92051"), false);
      this.logger.info(FAILURE_DETECTOR_LOG_MSG.SHUTDOWN, stryMutAct_9fa48("92052") ? {} : (stryCov_9fa48("92052"), {
        nodeId: this.nodeId
      }));
    }
  }
}
export { FailureDetector, NodeStatus, ReplicaStatus };