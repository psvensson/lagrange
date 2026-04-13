/**
 * LatencyGroupManager - single owner for latency-group assignment lifecycle.
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
import { ConfigurationManager } from '../config/configuration-manager.js';
import { LoggingService } from '../logging/logging-service.js';
import { assertCritical } from '../utils/assert.js';
import { COLUMN, NUM, TABLES, TYPEOF } from '../constants/index.js';
import { CONTROL_PLANE_MUTATION_OPERATION } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { LATENCY_ASSIGNMENT_STATE, LATENCY_GROUP_STATE, LATENCY_TOPOLOGY_CONFIG_KEY, LATENCY_TOPOLOGY_DEFAULT } from './latency-topology-constants.js';
import { LATENCY_GROUP_MANAGER_DEFAULT, LATENCY_GROUP_MANAGER_ERROR_MSG, LATENCY_GROUP_MANAGER_EVENT, LATENCY_GROUP_MANAGER_LOG_MSG, LATENCY_GROUP_MANAGER_REASON, LATENCY_GROUP_MANAGER_STATE, LATENCY_GROUP_MANAGER_SUBSYSTEM, LATENCY_GROUP_MANAGER_TRIGGER } from './latency-group-manager-constants.js';
class LatencyGroupManager extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {Object} options.systemTableCache
   * @param {Object} options.cdcIntegrationService
   * @param {Object} options.latencyMeasurementService
   * @param {Object} options.groupSelectionService
   * @param {Function} options.nowFn
   * @param {Function} options.randomFn
   * @param {Function} options.setTimeoutFn
   * @param {Function} options.clearTimeoutFn
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("153923")) {
      {}
    } else {
      stryCov_9fa48("153923");
      super();
      this.nodeId = stryMutAct_9fa48("153926") ? options.nodeId && null : stryMutAct_9fa48("153925") ? false : stryMutAct_9fa48("153924") ? true : (stryCov_9fa48("153924", "153925", "153926"), options.nodeId || null);
      this.systemTableCache = stryMutAct_9fa48("153929") ? options.systemTableCache && null : stryMutAct_9fa48("153928") ? false : stryMutAct_9fa48("153927") ? true : (stryCov_9fa48("153927", "153928", "153929"), options.systemTableCache || null);
      this.cdcIntegrationService = stryMutAct_9fa48("153932") ? options.cdcIntegrationService && null : stryMutAct_9fa48("153931") ? false : stryMutAct_9fa48("153930") ? true : (stryCov_9fa48("153930", "153931", "153932"), options.cdcIntegrationService || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("153935") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("153934") ? false : stryMutAct_9fa48("153933") ? true : (stryCov_9fa48("153933", "153934", "153935"), options.controlPlaneSystemTableGateway || null);
      this.latencyMeasurementService = stryMutAct_9fa48("153938") ? options.latencyMeasurementService && null : stryMutAct_9fa48("153937") ? false : stryMutAct_9fa48("153936") ? true : (stryCov_9fa48("153936", "153937", "153938"), options.latencyMeasurementService || null);
      this.groupSelectionService = stryMutAct_9fa48("153941") ? options.groupSelectionService && null : stryMutAct_9fa48("153940") ? false : stryMutAct_9fa48("153939") ? true : (stryCov_9fa48("153939", "153940", "153941"), options.groupSelectionService || null);
      this.nowFn = stryMutAct_9fa48("153944") ? options.nowFn && Date.now : stryMutAct_9fa48("153943") ? false : stryMutAct_9fa48("153942") ? true : (stryCov_9fa48("153942", "153943", "153944"), options.nowFn || Date.now);
      this.randomFn = stryMutAct_9fa48("153947") ? options.randomFn && Math.random : stryMutAct_9fa48("153946") ? false : stryMutAct_9fa48("153945") ? true : (stryCov_9fa48("153945", "153946", "153947"), options.randomFn || Math.random);
      this.setTimeoutFn = stryMutAct_9fa48("153950") ? options.setTimeoutFn && setTimeout : stryMutAct_9fa48("153949") ? false : stryMutAct_9fa48("153948") ? true : (stryCov_9fa48("153948", "153949", "153950"), options.setTimeoutFn || setTimeout);
      this.clearTimeoutFn = stryMutAct_9fa48("153953") ? options.clearTimeoutFn && clearTimeout : stryMutAct_9fa48("153952") ? false : stryMutAct_9fa48("153951") ? true : (stryCov_9fa48("153951", "153952", "153953"), options.clearTimeoutFn || clearTimeout);
      this.config = ConfigurationManager.getInstance();
      this.refreshConfig();
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(LATENCY_GROUP_MANAGER_SUBSYSTEM) : console;
      this.state = LATENCY_GROUP_MANAGER_STATE.CREATED;
      this.recalcTimer = null;
      this.cycleInFlight = stryMutAct_9fa48("153954") ? true : (stryCov_9fa48("153954"), false);
      this.activeCyclePromises = new Set();
      this.stats = stryMutAct_9fa48("153955") ? {} : (stryCov_9fa48("153955"), {
        cycleCount: NUM.ZERO,
        assignmentChangedCount: NUM.ZERO,
        assignmentUnchangedCount: NUM.ZERO,
        groupCreatedCount: NUM.ZERO,
        cycleFailureCount: NUM.ZERO,
        lastCycleAt: null,
        lastReason: null,
        lastTargetGroupId: null
      });
    }
  }

  /**
   * Initialize dependencies and validate required owners.
   * @param {Object} options
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("153956")) {
      {}
    } else {
      stryCov_9fa48("153956");
      if (stryMutAct_9fa48("153958") ? false : stryMutAct_9fa48("153957") ? true : (stryCov_9fa48("153957", "153958"), options.nodeId)) {
        if (stryMutAct_9fa48("153959")) {
          {}
        } else {
          stryCov_9fa48("153959");
          this.nodeId = options.nodeId;
        }
      }
      if (stryMutAct_9fa48("153961") ? false : stryMutAct_9fa48("153960") ? true : (stryCov_9fa48("153960", "153961"), options.systemTableCache)) {
        if (stryMutAct_9fa48("153962")) {
          {}
        } else {
          stryCov_9fa48("153962");
          this.systemTableCache = options.systemTableCache;
        }
      }
      if (stryMutAct_9fa48("153964") ? false : stryMutAct_9fa48("153963") ? true : (stryCov_9fa48("153963", "153964"), options.cdcIntegrationService)) {
        if (stryMutAct_9fa48("153965")) {
          {}
        } else {
          stryCov_9fa48("153965");
          this.cdcIntegrationService = options.cdcIntegrationService;
        }
      }
      if (stryMutAct_9fa48("153967") ? false : stryMutAct_9fa48("153966") ? true : (stryCov_9fa48("153966", "153967"), options.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("153968")) {
          {}
        } else {
          stryCov_9fa48("153968");
          this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
        }
      }
      if (stryMutAct_9fa48("153970") ? false : stryMutAct_9fa48("153969") ? true : (stryCov_9fa48("153969", "153970"), options.latencyMeasurementService)) {
        if (stryMutAct_9fa48("153971")) {
          {}
        } else {
          stryCov_9fa48("153971");
          this.latencyMeasurementService = options.latencyMeasurementService;
        }
      }
      if (stryMutAct_9fa48("153973") ? false : stryMutAct_9fa48("153972") ? true : (stryCov_9fa48("153972", "153973"), options.groupSelectionService)) {
        if (stryMutAct_9fa48("153974")) {
          {}
        } else {
          stryCov_9fa48("153974");
          this.groupSelectionService = options.groupSelectionService;
        }
      }
      if (stryMutAct_9fa48("153976") ? false : stryMutAct_9fa48("153975") ? true : (stryCov_9fa48("153975", "153976"), options.nowFn)) {
        if (stryMutAct_9fa48("153977")) {
          {}
        } else {
          stryCov_9fa48("153977");
          this.nowFn = options.nowFn;
        }
      }
      if (stryMutAct_9fa48("153979") ? false : stryMutAct_9fa48("153978") ? true : (stryCov_9fa48("153978", "153979"), options.randomFn)) {
        if (stryMutAct_9fa48("153980")) {
          {}
        } else {
          stryCov_9fa48("153980");
          this.randomFn = options.randomFn;
        }
      }
      if (stryMutAct_9fa48("153982") ? false : stryMutAct_9fa48("153981") ? true : (stryCov_9fa48("153981", "153982"), options.setTimeoutFn)) {
        if (stryMutAct_9fa48("153983")) {
          {}
        } else {
          stryCov_9fa48("153983");
          this.setTimeoutFn = options.setTimeoutFn;
        }
      }
      if (stryMutAct_9fa48("153985") ? false : stryMutAct_9fa48("153984") ? true : (stryCov_9fa48("153984", "153985"), options.clearTimeoutFn)) {
        if (stryMutAct_9fa48("153986")) {
          {}
        } else {
          stryCov_9fa48("153986");
          this.clearTimeoutFn = options.clearTimeoutFn;
        }
      }
      this.nodeId = assertCritical(this.nodeId, LATENCY_GROUP_MANAGER_ERROR_MSG.MISSING_NODE_ID);
      this.systemTableCache = assertCritical(this.systemTableCache, LATENCY_GROUP_MANAGER_ERROR_MSG.MISSING_CACHE);
      this.cdcIntegrationService = assertCritical(this.cdcIntegrationService, LATENCY_GROUP_MANAGER_ERROR_MSG.MISSING_CDC);
      this.latencyMeasurementService = assertCritical(this.latencyMeasurementService, LATENCY_GROUP_MANAGER_ERROR_MSG.MISSING_MEASUREMENT_SERVICE);
      this.groupSelectionService = assertCritical(this.groupSelectionService, LATENCY_GROUP_MANAGER_ERROR_MSG.MISSING_SELECTION_SERVICE);
      this.refreshConfig();
      this.state = LATENCY_GROUP_MANAGER_STATE.INITIALIZED;
      this.logger.info(LATENCY_GROUP_MANAGER_LOG_MSG.INITIALIZED, stryMutAct_9fa48("153987") ? {} : (stryCov_9fa48("153987"), {
        nodeId: this.nodeId,
        groupThresholdMs: this.groupThresholdMs,
        recalcIntervalMs: this.recalcIntervalMs,
        recalcJitterRatio: this.recalcJitterRatio
      }));
    }
  }

  /**
   * Start periodic assignment recalculation.
   * @param {Object} options
   * @param {boolean} options.runImmediately
   */
  start(options = {}) {
    if (stryMutAct_9fa48("153988")) {
      {}
    } else {
      stryCov_9fa48("153988");
      this.ensureInitialized();
      if (stryMutAct_9fa48("153991") ? this.state !== LATENCY_GROUP_MANAGER_STATE.RUNNING : stryMutAct_9fa48("153990") ? false : stryMutAct_9fa48("153989") ? true : (stryCov_9fa48("153989", "153990", "153991"), this.state === LATENCY_GROUP_MANAGER_STATE.RUNNING)) {
        if (stryMutAct_9fa48("153992")) {
          {}
        } else {
          stryCov_9fa48("153992");
          return;
        }
      }
      this.state = LATENCY_GROUP_MANAGER_STATE.RUNNING;
      this.logger.info(LATENCY_GROUP_MANAGER_LOG_MSG.STARTED, stryMutAct_9fa48("153993") ? {} : (stryCov_9fa48("153993"), {
        nodeId: this.nodeId
      }));
      const runImmediately = stryMutAct_9fa48("153996") ? options.runImmediately === false : stryMutAct_9fa48("153995") ? false : stryMutAct_9fa48("153994") ? true : (stryCov_9fa48("153994", "153995", "153996"), options.runImmediately !== (stryMutAct_9fa48("153997") ? true : (stryCov_9fa48("153997"), false)));
      if (stryMutAct_9fa48("153999") ? false : stryMutAct_9fa48("153998") ? true : (stryCov_9fa48("153998", "153999"), runImmediately)) {
        if (stryMutAct_9fa48("154000")) {
          {}
        } else {
          stryCov_9fa48("154000");
          void this.executeScheduledCycle(LATENCY_GROUP_MANAGER_TRIGGER.INITIAL);
          return;
        }
      }
      this.scheduleNextCycle();
    }
  }

  /**
   * Stop periodic assignment recalculation.
   */
  async stop() {
    if (stryMutAct_9fa48("154001")) {
      {}
    } else {
      stryCov_9fa48("154001");
      this.clearScheduledCycle();
      this.state = LATENCY_GROUP_MANAGER_STATE.STOPPED;
      this.logger.info(LATENCY_GROUP_MANAGER_LOG_MSG.STOPPED, stryMutAct_9fa48("154002") ? {} : (stryCov_9fa48("154002"), {
        nodeId: this.nodeId
      }));
      if (stryMutAct_9fa48("154006") ? this.activeCyclePromises.size <= NUM.ZERO : stryMutAct_9fa48("154005") ? this.activeCyclePromises.size >= NUM.ZERO : stryMutAct_9fa48("154004") ? false : stryMutAct_9fa48("154003") ? true : (stryCov_9fa48("154003", "154004", "154005", "154006"), this.activeCyclePromises.size > NUM.ZERO)) {
        if (stryMutAct_9fa48("154007")) {
          {}
        } else {
          stryCov_9fa48("154007");
          await Promise.allSettled(stryMutAct_9fa48("154008") ? [] : (stryCov_9fa48("154008"), [...this.activeCyclePromises]));
        }
      }
    }
  }

  /**
   * Execute one assignment/reassignment cycle.
   * @param {Object} options
   * @param {string} options.trigger
   * @return {Promise<Object>}
   */
  async runAssignmentCycle(options = {}) {
    if (stryMutAct_9fa48("154009")) {
      {}
    } else {
      stryCov_9fa48("154009");
      this.ensureInitialized();
      const trigger = stryMutAct_9fa48("154012") ? options.trigger && LATENCY_GROUP_MANAGER_TRIGGER.MANUAL : stryMutAct_9fa48("154011") ? false : stryMutAct_9fa48("154010") ? true : (stryCov_9fa48("154010", "154011", "154012"), options.trigger || LATENCY_GROUP_MANAGER_TRIGGER.MANUAL);
      stryMutAct_9fa48("154013") ? this.stats.cycleCount -= NUM.ONE : (stryCov_9fa48("154013"), this.stats.cycleCount += NUM.ONE);
      this.stats.lastCycleAt = this.now();
      if (stryMutAct_9fa48("154015") ? false : stryMutAct_9fa48("154014") ? true : (stryCov_9fa48("154014", "154015"), this.cycleInFlight)) {
        if (stryMutAct_9fa48("154016")) {
          {}
        } else {
          stryCov_9fa48("154016");
          return stryMutAct_9fa48("154017") ? {} : (stryCov_9fa48("154017"), {
            success: stryMutAct_9fa48("154018") ? true : (stryCov_9fa48("154018"), false),
            skipped: stryMutAct_9fa48("154019") ? false : (stryCov_9fa48("154019"), true),
            reason: LATENCY_GROUP_MANAGER_REASON.CYCLE_IN_FLIGHT,
            trigger
          });
        }
      }
      this.cycleInFlight = stryMutAct_9fa48("154020") ? false : (stryCov_9fa48("154020"), true);
      try {
        if (stryMutAct_9fa48("154021")) {
          {}
        } else {
          stryCov_9fa48("154021");
          const localNodeRow = this.systemTableCache.get(TABLES.NODES, this.nodeId);
          if (stryMutAct_9fa48("154024") ? false : stryMutAct_9fa48("154023") ? true : stryMutAct_9fa48("154022") ? localNodeRow : (stryCov_9fa48("154022", "154023", "154024"), !localNodeRow)) {
            if (stryMutAct_9fa48("154025")) {
              {}
            } else {
              stryCov_9fa48("154025");
              const result = stryMutAct_9fa48("154026") ? {} : (stryCov_9fa48("154026"), {
                success: stryMutAct_9fa48("154027") ? true : (stryCov_9fa48("154027"), false),
                changed: stryMutAct_9fa48("154028") ? true : (stryCov_9fa48("154028"), false),
                reason: LATENCY_GROUP_MANAGER_REASON.MISSING_LOCAL_NODE,
                previousGroupId: null,
                targetGroupId: null,
                createdGroup: stryMutAct_9fa48("154029") ? true : (stryCov_9fa48("154029"), false),
                trigger
              });
              this.emit(LATENCY_GROUP_MANAGER_EVENT.ASSIGNMENT_UNCHANGED, result);
              return result;
            }
          }
          const allNodeRows = this.systemTableCache.getAll(TABLES.NODES);
          const allGroupRows = this.systemTableCache.getAll(TABLES.LATENCY_GROUPS);
          const decision = await this.computeAssignmentDecision(localNodeRow, allGroupRows);
          const assignment = await this.persistAssignmentDecision(stryMutAct_9fa48("154030") ? {} : (stryCov_9fa48("154030"), {
            decision,
            localNodeRow,
            allNodeRows,
            allGroupRows
          }));
          const eventName = assignment.changed ? LATENCY_GROUP_MANAGER_EVENT.ASSIGNMENT_CHANGED : LATENCY_GROUP_MANAGER_EVENT.ASSIGNMENT_UNCHANGED;
          const result = stryMutAct_9fa48("154031") ? {} : (stryCov_9fa48("154031"), {
            success: stryMutAct_9fa48("154032") ? false : (stryCov_9fa48("154032"), true),
            trigger,
            ...assignment
          });
          this.stats.lastReason = result.reason;
          this.stats.lastTargetGroupId = result.targetGroupId;
          if (stryMutAct_9fa48("154034") ? false : stryMutAct_9fa48("154033") ? true : (stryCov_9fa48("154033", "154034"), result.changed)) {
            if (stryMutAct_9fa48("154035")) {
              {}
            } else {
              stryCov_9fa48("154035");
              stryMutAct_9fa48("154036") ? this.stats.assignmentChangedCount -= NUM.ONE : (stryCov_9fa48("154036"), this.stats.assignmentChangedCount += NUM.ONE);
            }
          } else {
            if (stryMutAct_9fa48("154037")) {
              {}
            } else {
              stryCov_9fa48("154037");
              stryMutAct_9fa48("154038") ? this.stats.assignmentUnchangedCount -= NUM.ONE : (stryCov_9fa48("154038"), this.stats.assignmentUnchangedCount += NUM.ONE);
            }
          }
          this.emit(eventName, result);
          const logMessage = assignment.changed ? LATENCY_GROUP_MANAGER_LOG_MSG.ASSIGNMENT_CHANGED : LATENCY_GROUP_MANAGER_LOG_MSG.ASSIGNMENT_UNCHANGED;
          this.logger.info(logMessage, stryMutAct_9fa48("154039") ? {} : (stryCov_9fa48("154039"), {
            nodeId: this.nodeId,
            trigger,
            reason: assignment.reason,
            previousGroupId: assignment.previousGroupId,
            targetGroupId: assignment.targetGroupId
          }));
          return result;
        }
      } finally {
        if (stryMutAct_9fa48("154040")) {
          {}
        } else {
          stryCov_9fa48("154040");
          this.cycleInFlight = stryMutAct_9fa48("154041") ? true : (stryCov_9fa48("154041"), false);
        }
      }
    }
  }

  /**
   * Execute one scheduled cycle and queue the next one when still running.
   * @param {string} trigger
   * @return {Promise<void>}
   * @private
   */
  async executeScheduledCycle(trigger) {
    if (stryMutAct_9fa48("154042")) {
      {}
    } else {
      stryCov_9fa48("154042");
      if (stryMutAct_9fa48("154045") ? this.state === LATENCY_GROUP_MANAGER_STATE.RUNNING : stryMutAct_9fa48("154044") ? false : stryMutAct_9fa48("154043") ? true : (stryCov_9fa48("154043", "154044", "154045"), this.state !== LATENCY_GROUP_MANAGER_STATE.RUNNING)) {
        if (stryMutAct_9fa48("154046")) {
          {}
        } else {
          stryCov_9fa48("154046");
          return;
        }
      }
      const cyclePromise = (async () => {
        if (stryMutAct_9fa48("154047")) {
          {}
        } else {
          stryCov_9fa48("154047");
          try {
            if (stryMutAct_9fa48("154048")) {
              {}
            } else {
              stryCov_9fa48("154048");
              await this.runAssignmentCycle(stryMutAct_9fa48("154049") ? {} : (stryCov_9fa48("154049"), {
                trigger
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("154050")) {
              {}
            } else {
              stryCov_9fa48("154050");
              stryMutAct_9fa48("154051") ? this.stats.cycleFailureCount -= NUM.ONE : (stryCov_9fa48("154051"), this.stats.cycleFailureCount += NUM.ONE);
              this.logger.error(LATENCY_GROUP_MANAGER_LOG_MSG.CYCLE_FAILED, stryMutAct_9fa48("154052") ? {} : (stryCov_9fa48("154052"), {
                nodeId: this.nodeId,
                trigger,
                error: error.message
              }));
              this.emit(LATENCY_GROUP_MANAGER_EVENT.CYCLE_FAILED, stryMutAct_9fa48("154053") ? {} : (stryCov_9fa48("154053"), {
                nodeId: this.nodeId,
                trigger,
                error: error.message
              }));
            }
          } finally {
            if (stryMutAct_9fa48("154054")) {
              {}
            } else {
              stryCov_9fa48("154054");
              if (stryMutAct_9fa48("154057") ? this.state !== LATENCY_GROUP_MANAGER_STATE.RUNNING : stryMutAct_9fa48("154056") ? false : stryMutAct_9fa48("154055") ? true : (stryCov_9fa48("154055", "154056", "154057"), this.state === LATENCY_GROUP_MANAGER_STATE.RUNNING)) {
                if (stryMutAct_9fa48("154058")) {
                  {}
                } else {
                  stryCov_9fa48("154058");
                  this.scheduleNextCycle();
                }
              }
            }
          }
        }
      })();
      this.activeCyclePromises.add(cyclePromise);
      try {
        if (stryMutAct_9fa48("154059")) {
          {}
        } else {
          stryCov_9fa48("154059");
          await cyclePromise;
        }
      } finally {
        if (stryMutAct_9fa48("154060")) {
          {}
        } else {
          stryCov_9fa48("154060");
          this.activeCyclePromises.delete(cyclePromise);
        }
      }
    }
  }

  /**
   * Determine the assignment target for the local node.
   * @param {Object} localNodeRow
   * @param {Object[]} groupRows
   * @return {Promise<Object>}
   * @private
   */
  async computeAssignmentDecision(localNodeRow, groupRows) {
    if (stryMutAct_9fa48("154061")) {
      {}
    } else {
      stryCov_9fa48("154061");
      const currentGroupId = stryMutAct_9fa48("154064") ? localNodeRow[COLUMN.LATENCY_GROUP_ID] && null : stryMutAct_9fa48("154063") ? false : stryMutAct_9fa48("154062") ? true : (stryCov_9fa48("154062", "154063", "154064"), localNodeRow[COLUMN.LATENCY_GROUP_ID] || null);
      const activeGroups = this.getActiveGroups(groupRows);
      const measurements = await this.measureGroups(activeGroups);
      const nearestEligible = this.selectNearestEligibleGroup(measurements);
      const currentGroupMeasurement = this.getMeasurementForGroup(measurements, currentGroupId);
      const shouldCreateNewGroup = stryMutAct_9fa48("154067") ? !currentGroupId || !nearestEligible : stryMutAct_9fa48("154066") ? false : stryMutAct_9fa48("154065") ? true : (stryCov_9fa48("154065", "154066", "154067"), (stryMutAct_9fa48("154068") ? currentGroupId : (stryCov_9fa48("154068"), !currentGroupId)) && (stryMutAct_9fa48("154069") ? nearestEligible : (stryCov_9fa48("154069"), !nearestEligible)));
      const createdGroupRow = shouldCreateNewGroup ? (() => {
        if (stryMutAct_9fa48("154070")) {
          {}
        } else {
          stryCov_9fa48("154070");
          const now = this.now();
          const groupId = this.buildGroupId(now);
          return stryMutAct_9fa48("154071") ? {} : (stryCov_9fa48("154071"), {
            [COLUMN.GROUP_ID]: groupId,
            [COLUMN.REPRESENTATIVE_NODE_ID]: this.nodeId,
            [COLUMN.COORDINATOR_NODE_ID]: this.nodeId,
            [COLUMN.STATE]: LATENCY_GROUP_STATE.ACTIVE,
            [COLUMN.CREATED_AT]: now,
            [COLUMN.UPDATED_AT]: now
          });
        }
      })() : null;
      const currentRttMs = Number(stryMutAct_9fa48("154072") ? currentGroupMeasurement.rttMs : (stryCov_9fa48("154072"), currentGroupMeasurement?.rttMs));
      const reason = (stryMutAct_9fa48("154075") ? !currentGroupId || nearestEligible : stryMutAct_9fa48("154074") ? false : stryMutAct_9fa48("154073") ? true : (stryCov_9fa48("154073", "154074", "154075"), (stryMutAct_9fa48("154076") ? currentGroupId : (stryCov_9fa48("154076"), !currentGroupId)) && nearestEligible)) ? LATENCY_GROUP_MANAGER_REASON.JOIN_NEAREST_GROUP : shouldCreateNewGroup ? LATENCY_GROUP_MANAGER_REASON.CREATE_NEW_GROUP : (stryMutAct_9fa48("154077") ? nearestEligible : (stryCov_9fa48("154077"), !nearestEligible)) ? LATENCY_GROUP_MANAGER_REASON.KEEP_CURRENT_GROUP : (stryMutAct_9fa48("154080") ? nearestEligible.groupId !== currentGroupId : stryMutAct_9fa48("154079") ? false : stryMutAct_9fa48("154078") ? true : (stryCov_9fa48("154078", "154079", "154080"), nearestEligible.groupId === currentGroupId)) ? LATENCY_GROUP_MANAGER_REASON.KEEP_CURRENT_GROUP : (stryMutAct_9fa48("154083") ? !Number.isFinite(currentRttMs) && nearestEligible.rttMs < currentRttMs : stryMutAct_9fa48("154082") ? false : stryMutAct_9fa48("154081") ? true : (stryCov_9fa48("154081", "154082", "154083"), (stryMutAct_9fa48("154084") ? Number.isFinite(currentRttMs) : (stryCov_9fa48("154084"), !Number.isFinite(currentRttMs))) || (stryMutAct_9fa48("154087") ? nearestEligible.rttMs >= currentRttMs : stryMutAct_9fa48("154086") ? nearestEligible.rttMs <= currentRttMs : stryMutAct_9fa48("154085") ? false : (stryCov_9fa48("154085", "154086", "154087"), nearestEligible.rttMs < currentRttMs)))) ? LATENCY_GROUP_MANAGER_REASON.REASSIGN_TO_BETTER_GROUP : LATENCY_GROUP_MANAGER_REASON.KEEP_CURRENT_GROUP;
      const targetGroupId = (stryMutAct_9fa48("154090") ? reason === LATENCY_GROUP_MANAGER_REASON.JOIN_NEAREST_GROUP && reason === LATENCY_GROUP_MANAGER_REASON.REASSIGN_TO_BETTER_GROUP : stryMutAct_9fa48("154089") ? false : stryMutAct_9fa48("154088") ? true : (stryCov_9fa48("154088", "154089", "154090"), (stryMutAct_9fa48("154092") ? reason !== LATENCY_GROUP_MANAGER_REASON.JOIN_NEAREST_GROUP : stryMutAct_9fa48("154091") ? false : (stryCov_9fa48("154091", "154092"), reason === LATENCY_GROUP_MANAGER_REASON.JOIN_NEAREST_GROUP)) || (stryMutAct_9fa48("154094") ? reason !== LATENCY_GROUP_MANAGER_REASON.REASSIGN_TO_BETTER_GROUP : stryMutAct_9fa48("154093") ? false : (stryCov_9fa48("154093", "154094"), reason === LATENCY_GROUP_MANAGER_REASON.REASSIGN_TO_BETTER_GROUP)))) ? nearestEligible.groupId : (stryMutAct_9fa48("154097") ? reason !== LATENCY_GROUP_MANAGER_REASON.CREATE_NEW_GROUP : stryMutAct_9fa48("154096") ? false : stryMutAct_9fa48("154095") ? true : (stryCov_9fa48("154095", "154096", "154097"), reason === LATENCY_GROUP_MANAGER_REASON.CREATE_NEW_GROUP)) ? createdGroupRow[COLUMN.GROUP_ID] : currentGroupId;
      return stryMutAct_9fa48("154098") ? {} : (stryCov_9fa48("154098"), {
        reason,
        currentGroupId,
        targetGroupId,
        changed: stryMutAct_9fa48("154101") ? reason === LATENCY_GROUP_MANAGER_REASON.KEEP_CURRENT_GROUP : stryMutAct_9fa48("154100") ? false : stryMutAct_9fa48("154099") ? true : (stryCov_9fa48("154099", "154100", "154101"), reason !== LATENCY_GROUP_MANAGER_REASON.KEEP_CURRENT_GROUP),
        createdGroupRow,
        measurements
      });
    }
  }

  /**
   * Persist assignment and reconcile affected groups.
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async persistAssignmentDecision(options) {
    if (stryMutAct_9fa48("154102")) {
      {}
    } else {
      stryCov_9fa48("154102");
      const decision = options.decision;
      const allNodeRows = options.allNodeRows;
      const allGroupRows = options.allGroupRows;
      const previousGroupId = stryMutAct_9fa48("154105") ? decision.currentGroupId && null : stryMutAct_9fa48("154104") ? false : stryMutAct_9fa48("154103") ? true : (stryCov_9fa48("154103", "154104", "154105"), decision.currentGroupId || null);
      const targetGroupId = stryMutAct_9fa48("154108") ? decision.targetGroupId && null : stryMutAct_9fa48("154107") ? false : stryMutAct_9fa48("154106") ? true : (stryCov_9fa48("154106", "154107", "154108"), decision.targetGroupId || null);
      const now = this.now();
      if (stryMutAct_9fa48("154110") ? false : stryMutAct_9fa48("154109") ? true : (stryCov_9fa48("154109", "154110"), decision.createdGroupRow)) {
        if (stryMutAct_9fa48("154111")) {
          {}
        } else {
          stryCov_9fa48("154111");
          await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("154112") ? {} : (stryCov_9fa48("154112"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
            tableName: TABLES.LATENCY_GROUPS,
            row: decision.createdGroupRow
          }), stryMutAct_9fa48("154113") ? {} : (stryCov_9fa48("154113"), {
            workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
            deliveryPriority: stryMutAct_9fa48("154114") ? "" : (stryCov_9fa48("154114"), 'critical')
          }));
          this.logger.info(LATENCY_GROUP_MANAGER_LOG_MSG.GROUP_CREATED, stryMutAct_9fa48("154115") ? {} : (stryCov_9fa48("154115"), {
            nodeId: this.nodeId,
            groupId: decision.createdGroupRow[COLUMN.GROUP_ID]
          }));
          stryMutAct_9fa48("154116") ? this.stats.groupCreatedCount -= NUM.ONE : (stryCov_9fa48("154116"), this.stats.groupCreatedCount += NUM.ONE);
          this.emit(LATENCY_GROUP_MANAGER_EVENT.GROUP_CREATED, stryMutAct_9fa48("154117") ? {} : (stryCov_9fa48("154117"), {
            nodeId: this.nodeId,
            groupId: decision.createdGroupRow[COLUMN.GROUP_ID]
          }));
        }
      }
      const isReassignment = stryMutAct_9fa48("154120") ? previousGroupId && targetGroupId || previousGroupId !== targetGroupId : stryMutAct_9fa48("154119") ? false : stryMutAct_9fa48("154118") ? true : (stryCov_9fa48("154118", "154119", "154120"), (stryMutAct_9fa48("154122") ? previousGroupId || targetGroupId : stryMutAct_9fa48("154121") ? true : (stryCov_9fa48("154121", "154122"), previousGroupId && targetGroupId)) && (stryMutAct_9fa48("154124") ? previousGroupId === targetGroupId : stryMutAct_9fa48("154123") ? true : (stryCov_9fa48("154123", "154124"), previousGroupId !== targetGroupId)));
      if (stryMutAct_9fa48("154126") ? false : stryMutAct_9fa48("154125") ? true : (stryCov_9fa48("154125", "154126"), isReassignment)) {
        if (stryMutAct_9fa48("154127")) {
          {}
        } else {
          stryCov_9fa48("154127");
          await this.persistNodeAssignment(stryMutAct_9fa48("154128") ? {} : (stryCov_9fa48("154128"), {
            groupId: previousGroupId,
            assignmentState: LATENCY_ASSIGNMENT_STATE.REASSIGNING,
            timestamp: now
          }));
        }
      }
      await this.persistNodeAssignment(stryMutAct_9fa48("154129") ? {} : (stryCov_9fa48("154129"), {
        groupId: targetGroupId,
        assignmentState: targetGroupId ? LATENCY_ASSIGNMENT_STATE.ASSIGNED : LATENCY_ASSIGNMENT_STATE.UNASSIGNED,
        timestamp: now
      }));
      const affectedGroupIds = this.collectAffectedGroupIds(previousGroupId, targetGroupId);
      await this.reconcileAffectedGroups(stryMutAct_9fa48("154130") ? {} : (stryCov_9fa48("154130"), {
        affectedGroupIds,
        allNodeRows,
        allGroupRows,
        targetGroupId,
        createdGroupRow: decision.createdGroupRow,
        timestamp: now
      }));
      return stryMutAct_9fa48("154131") ? {} : (stryCov_9fa48("154131"), {
        changed: decision.changed,
        reason: decision.reason,
        previousGroupId,
        targetGroupId,
        createdGroup: Boolean(decision.createdGroupRow),
        measurements: decision.measurements
      });
    }
  }

  /**
   * Persist local node latency assignment metadata.
   * @param {Object} options
   * @return {Promise<void>}
   * @private
   */
  async persistNodeAssignment(options) {
    if (stryMutAct_9fa48("154132")) {
      {}
    } else {
      stryCov_9fa48("154132");
      const updateRow = stryMutAct_9fa48("154133") ? {} : (stryCov_9fa48("154133"), {
        [COLUMN.LATENCY_GROUP_ID]: options.groupId,
        [COLUMN.LATENCY_ASSIGNMENT_STATE]: options.assignmentState,
        [COLUMN.LAST_LATENCY_CHECK_AT]: options.timestamp
      });
      await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("154134") ? {} : (stryCov_9fa48("154134"), {
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.NODES,
        whereClause: stryMutAct_9fa48("154135") ? {} : (stryCov_9fa48("154135"), {
          [COLUMN.NODE_ID]: this.nodeId
        }),
        data: updateRow
      }), stryMutAct_9fa48("154136") ? {} : (stryCov_9fa48("154136"), {
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
        deliveryPriority: stryMutAct_9fa48("154137") ? "" : (stryCov_9fa48("154137"), 'critical')
      }));
    }
  }

  /**
   * Reconcile lifecycle state + leadership for affected groups.
   * @param {Object} options
   * @return {Promise<void>}
   * @private
   */
  async reconcileAffectedGroups(options) {
    if (stryMutAct_9fa48("154138")) {
      {}
    } else {
      stryCov_9fa48("154138");
      const groupById = this.buildGroupMap(options.allGroupRows);
      if (stryMutAct_9fa48("154140") ? false : stryMutAct_9fa48("154139") ? true : (stryCov_9fa48("154139", "154140"), options.createdGroupRow)) {
        if (stryMutAct_9fa48("154141")) {
          {}
        } else {
          stryCov_9fa48("154141");
          groupById.set(options.createdGroupRow[COLUMN.GROUP_ID], options.createdGroupRow);
        }
      }
      const nodeRowsAfterAssignment = this.buildNodeRowsAfterAssignment(options.allNodeRows, options.targetGroupId);
      for (const groupId of options.affectedGroupIds) {
        if (stryMutAct_9fa48("154142")) {
          {}
        } else {
          stryCov_9fa48("154142");
          const groupRow = stryMutAct_9fa48("154145") ? groupById.get(groupId) && null : stryMutAct_9fa48("154144") ? false : stryMutAct_9fa48("154143") ? true : (stryCov_9fa48("154143", "154144", "154145"), groupById.get(groupId) || null);
          const memberRows = stryMutAct_9fa48("154146") ? nodeRowsAfterAssignment : (stryCov_9fa48("154146"), nodeRowsAfterAssignment.filter(nodeRow => {
            if (stryMutAct_9fa48("154147")) {
              {}
            } else {
              stryCov_9fa48("154147");
              return stryMutAct_9fa48("154150") ? nodeRow?.[COLUMN.LATENCY_GROUP_ID] !== groupId : stryMutAct_9fa48("154149") ? false : stryMutAct_9fa48("154148") ? true : (stryCov_9fa48("154148", "154149", "154150"), (stryMutAct_9fa48("154151") ? nodeRow[COLUMN.LATENCY_GROUP_ID] : (stryCov_9fa48("154151"), nodeRow?.[COLUMN.LATENCY_GROUP_ID])) === groupId);
            }
          }));
          if (stryMutAct_9fa48("154154") ? !groupRow || memberRows.length === NUM.ZERO : stryMutAct_9fa48("154153") ? false : stryMutAct_9fa48("154152") ? true : (stryCov_9fa48("154152", "154153", "154154"), (stryMutAct_9fa48("154155") ? groupRow : (stryCov_9fa48("154155"), !groupRow)) && (stryMutAct_9fa48("154157") ? memberRows.length !== NUM.ZERO : stryMutAct_9fa48("154156") ? true : (stryCov_9fa48("154156", "154157"), memberRows.length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("154158")) {
              {}
            } else {
              stryCov_9fa48("154158");
              continue;
            }
          }
          const desiredState = (stryMutAct_9fa48("154162") ? memberRows.length <= NUM.ZERO : stryMutAct_9fa48("154161") ? memberRows.length >= NUM.ZERO : stryMutAct_9fa48("154160") ? false : stryMutAct_9fa48("154159") ? true : (stryCov_9fa48("154159", "154160", "154161", "154162"), memberRows.length > NUM.ZERO)) ? LATENCY_GROUP_STATE.ACTIVE : LATENCY_GROUP_STATE.DRAINING;
          const normalizedGroupRow = this.buildNormalizedGroupRow(stryMutAct_9fa48("154163") ? {} : (stryCov_9fa48("154163"), {
            groupId,
            groupRow,
            desiredState,
            timestamp: options.timestamp
          }));
          if (stryMutAct_9fa48("154165") ? false : stryMutAct_9fa48("154164") ? true : (stryCov_9fa48("154164", "154165"), this.shouldPersistLifecycleState(groupRow, normalizedGroupRow))) {
            if (stryMutAct_9fa48("154166")) {
              {}
            } else {
              stryCov_9fa48("154166");
              await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("154167") ? {} : (stryCov_9fa48("154167"), {
                operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
                tableName: TABLES.LATENCY_GROUPS,
                row: normalizedGroupRow
              }), stryMutAct_9fa48("154168") ? {} : (stryCov_9fa48("154168"), {
                workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
                deliveryPriority: stryMutAct_9fa48("154169") ? "" : (stryCov_9fa48("154169"), 'critical')
              }));
            }
          }
          await this.groupSelectionService.applyGroupLeadership(stryMutAct_9fa48("154170") ? {} : (stryCov_9fa48("154170"), {
            groupRow: normalizedGroupRow,
            memberRows
          }));
        }
      }
    }
  }

  /**
   * Build a normalized group row for lifecycle + leadership reconciliation.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  buildNormalizedGroupRow(options) {
    if (stryMutAct_9fa48("154171")) {
      {}
    } else {
      stryCov_9fa48("154171");
      const groupRow = options.groupRow;
      return stryMutAct_9fa48("154172") ? {} : (stryCov_9fa48("154172"), {
        [COLUMN.GROUP_ID]: options.groupId,
        [COLUMN.REPRESENTATIVE_NODE_ID]: stryMutAct_9fa48("154175") ? groupRow?.[COLUMN.REPRESENTATIVE_NODE_ID] && null : stryMutAct_9fa48("154174") ? false : stryMutAct_9fa48("154173") ? true : (stryCov_9fa48("154173", "154174", "154175"), (stryMutAct_9fa48("154176") ? groupRow[COLUMN.REPRESENTATIVE_NODE_ID] : (stryCov_9fa48("154176"), groupRow?.[COLUMN.REPRESENTATIVE_NODE_ID])) || null),
        [COLUMN.COORDINATOR_NODE_ID]: stryMutAct_9fa48("154179") ? groupRow?.[COLUMN.COORDINATOR_NODE_ID] && null : stryMutAct_9fa48("154178") ? false : stryMutAct_9fa48("154177") ? true : (stryCov_9fa48("154177", "154178", "154179"), (stryMutAct_9fa48("154180") ? groupRow[COLUMN.COORDINATOR_NODE_ID] : (stryCov_9fa48("154180"), groupRow?.[COLUMN.COORDINATOR_NODE_ID])) || null),
        [COLUMN.STATE]: options.desiredState,
        [COLUMN.CREATED_AT]: stryMutAct_9fa48("154183") ? groupRow?.[COLUMN.CREATED_AT] && options.timestamp : stryMutAct_9fa48("154182") ? false : stryMutAct_9fa48("154181") ? true : (stryCov_9fa48("154181", "154182", "154183"), (stryMutAct_9fa48("154184") ? groupRow[COLUMN.CREATED_AT] : (stryCov_9fa48("154184"), groupRow?.[COLUMN.CREATED_AT])) || options.timestamp),
        [COLUMN.UPDATED_AT]: options.timestamp
      });
    }
  }

  /**
   * Determine whether lifecycle row persistence is needed.
   * @param {Object|null} currentGroupRow
   * @param {Object} nextGroupRow
   * @return {boolean}
   * @private
   */
  shouldPersistLifecycleState(currentGroupRow, nextGroupRow) {
    if (stryMutAct_9fa48("154185")) {
      {}
    } else {
      stryCov_9fa48("154185");
      if (stryMutAct_9fa48("154188") ? false : stryMutAct_9fa48("154187") ? true : stryMutAct_9fa48("154186") ? currentGroupRow : (stryCov_9fa48("154186", "154187", "154188"), !currentGroupRow)) {
        if (stryMutAct_9fa48("154189")) {
          {}
        } else {
          stryCov_9fa48("154189");
          return stryMutAct_9fa48("154190") ? false : (stryCov_9fa48("154190"), true);
        }
      }
      return stryMutAct_9fa48("154193") ? currentGroupRow[COLUMN.STATE] === nextGroupRow[COLUMN.STATE] : stryMutAct_9fa48("154192") ? false : stryMutAct_9fa48("154191") ? true : (stryCov_9fa48("154191", "154192", "154193"), currentGroupRow[COLUMN.STATE] !== nextGroupRow[COLUMN.STATE]);
    }
  }

  /**
   * Build a group-id keyed map from cached rows.
   * @param {Object[]} allGroupRows
   * @return {Map<string, Object>}
   * @private
   */
  buildGroupMap(allGroupRows) {
    if (stryMutAct_9fa48("154194")) {
      {}
    } else {
      stryCov_9fa48("154194");
      const map = new Map();
      for (const groupRow of allGroupRows) {
        if (stryMutAct_9fa48("154195")) {
          {}
        } else {
          stryCov_9fa48("154195");
          const groupId = stryMutAct_9fa48("154196") ? groupRow[COLUMN.GROUP_ID] : (stryCov_9fa48("154196"), groupRow?.[COLUMN.GROUP_ID]);
          if (stryMutAct_9fa48("154199") ? false : stryMutAct_9fa48("154198") ? true : stryMutAct_9fa48("154197") ? groupId : (stryCov_9fa48("154197", "154198", "154199"), !groupId)) {
            if (stryMutAct_9fa48("154200")) {
              {}
            } else {
              stryCov_9fa48("154200");
              continue;
            }
          }
          map.set(groupId, groupRow);
        }
      }
      return map;
    }
  }

  /**
   * Build nodes view with local node assignment updated to the target group.
   * @param {Object[]} allNodeRows
   * @param {string|null} targetGroupId
   * @return {Object[]}
   * @private
   */
  buildNodeRowsAfterAssignment(allNodeRows, targetGroupId) {
    if (stryMutAct_9fa48("154201")) {
      {}
    } else {
      stryCov_9fa48("154201");
      return allNodeRows.map(nodeRow => {
        if (stryMutAct_9fa48("154202")) {
          {}
        } else {
          stryCov_9fa48("154202");
          if (stryMutAct_9fa48("154205") ? nodeRow?.[COLUMN.NODE_ID] === this.nodeId : stryMutAct_9fa48("154204") ? false : stryMutAct_9fa48("154203") ? true : (stryCov_9fa48("154203", "154204", "154205"), (stryMutAct_9fa48("154206") ? nodeRow[COLUMN.NODE_ID] : (stryCov_9fa48("154206"), nodeRow?.[COLUMN.NODE_ID])) !== this.nodeId)) {
            if (stryMutAct_9fa48("154207")) {
              {}
            } else {
              stryCov_9fa48("154207");
              return nodeRow;
            }
          }
          return stryMutAct_9fa48("154208") ? {} : (stryCov_9fa48("154208"), {
            ...nodeRow,
            [COLUMN.LATENCY_GROUP_ID]: targetGroupId
          });
        }
      });
    }
  }

  /**
   * Collect unique non-null affected group IDs.
   * @param {string|null} previousGroupId
   * @param {string|null} targetGroupId
   * @return {string[]}
   * @private
   */
  collectAffectedGroupIds(previousGroupId, targetGroupId) {
    if (stryMutAct_9fa48("154209")) {
      {}
    } else {
      stryCov_9fa48("154209");
      const groupIds = new Set();
      if (stryMutAct_9fa48("154211") ? false : stryMutAct_9fa48("154210") ? true : (stryCov_9fa48("154210", "154211"), previousGroupId)) {
        if (stryMutAct_9fa48("154212")) {
          {}
        } else {
          stryCov_9fa48("154212");
          groupIds.add(previousGroupId);
        }
      }
      if (stryMutAct_9fa48("154214") ? false : stryMutAct_9fa48("154213") ? true : (stryCov_9fa48("154213", "154214"), targetGroupId)) {
        if (stryMutAct_9fa48("154215")) {
          {}
        } else {
          stryCov_9fa48("154215");
          groupIds.add(targetGroupId);
        }
      }
      return stryMutAct_9fa48("154216") ? [] : (stryCov_9fa48("154216"), [...groupIds]);
    }
  }

  /**
   * Measure latency to active group representatives.
   * @param {Object[]} groups
   * @return {Promise<Object[]>}
   * @private
   */
  async measureGroups(groups) {
    if (stryMutAct_9fa48("154217")) {
      {}
    } else {
      stryCov_9fa48("154217");
      const measurements = stryMutAct_9fa48("154218") ? ["Stryker was here"] : (stryCov_9fa48("154218"), []);
      for (const groupRow of groups) {
        if (stryMutAct_9fa48("154219")) {
          {}
        } else {
          stryCov_9fa48("154219");
          const groupId = stryMutAct_9fa48("154220") ? groupRow[COLUMN.GROUP_ID] : (stryCov_9fa48("154220"), groupRow?.[COLUMN.GROUP_ID]);
          const representativeNodeId = stryMutAct_9fa48("154221") ? groupRow[COLUMN.REPRESENTATIVE_NODE_ID] : (stryCov_9fa48("154221"), groupRow?.[COLUMN.REPRESENTATIVE_NODE_ID]);
          if (stryMutAct_9fa48("154224") ? !groupId && !representativeNodeId : stryMutAct_9fa48("154223") ? false : stryMutAct_9fa48("154222") ? true : (stryCov_9fa48("154222", "154223", "154224"), (stryMutAct_9fa48("154225") ? groupId : (stryCov_9fa48("154225"), !groupId)) || (stryMutAct_9fa48("154226") ? representativeNodeId : (stryCov_9fa48("154226"), !representativeNodeId)))) {
            if (stryMutAct_9fa48("154227")) {
              {}
            } else {
              stryCov_9fa48("154227");
              continue;
            }
          }
          const measurement = await this.latencyMeasurementService.measureNodeLatency(representativeNodeId);
          if (stryMutAct_9fa48("154230") ? !measurement && !Number.isFinite(measurement.rttMs) : stryMutAct_9fa48("154229") ? false : stryMutAct_9fa48("154228") ? true : (stryCov_9fa48("154228", "154229", "154230"), (stryMutAct_9fa48("154231") ? measurement : (stryCov_9fa48("154231"), !measurement)) || (stryMutAct_9fa48("154232") ? Number.isFinite(measurement.rttMs) : (stryCov_9fa48("154232"), !Number.isFinite(measurement.rttMs))))) {
            if (stryMutAct_9fa48("154233")) {
              {}
            } else {
              stryCov_9fa48("154233");
              continue;
            }
          }
          measurements.push(stryMutAct_9fa48("154234") ? {} : (stryCov_9fa48("154234"), {
            groupId,
            representativeNodeId,
            rttMs: measurement.rttMs
          }));
        }
      }
      return stryMutAct_9fa48("154235") ? measurements : (stryCov_9fa48("154235"), measurements.sort((left, right) => {
        if (stryMutAct_9fa48("154236")) {
          {}
        } else {
          stryCov_9fa48("154236");
          if (stryMutAct_9fa48("154239") ? left.rttMs === right.rttMs : stryMutAct_9fa48("154238") ? false : stryMutAct_9fa48("154237") ? true : (stryCov_9fa48("154237", "154238", "154239"), left.rttMs !== right.rttMs)) {
            if (stryMutAct_9fa48("154240")) {
              {}
            } else {
              stryCov_9fa48("154240");
              return stryMutAct_9fa48("154241") ? left.rttMs + right.rttMs : (stryCov_9fa48("154241"), left.rttMs - right.rttMs);
            }
          }
          if (stryMutAct_9fa48("154245") ? left.groupId >= right.groupId : stryMutAct_9fa48("154244") ? left.groupId <= right.groupId : stryMutAct_9fa48("154243") ? false : stryMutAct_9fa48("154242") ? true : (stryCov_9fa48("154242", "154243", "154244", "154245"), left.groupId < right.groupId)) {
            if (stryMutAct_9fa48("154246")) {
              {}
            } else {
              stryCov_9fa48("154246");
              return NUM.NEGATIVE_ONE;
            }
          }
          if (stryMutAct_9fa48("154250") ? left.groupId <= right.groupId : stryMutAct_9fa48("154249") ? left.groupId >= right.groupId : stryMutAct_9fa48("154248") ? false : stryMutAct_9fa48("154247") ? true : (stryCov_9fa48("154247", "154248", "154249", "154250"), left.groupId > right.groupId)) {
            if (stryMutAct_9fa48("154251")) {
              {}
            } else {
              stryCov_9fa48("154251");
              return NUM.ONE;
            }
          }
          return NUM.ZERO;
        }
      }));
    }
  }

  /**
   * Select nearest eligible group under configured threshold.
   * @param {Object[]} measurements
   * @return {Object|null}
   * @private
   */
  selectNearestEligibleGroup(measurements) {
    if (stryMutAct_9fa48("154252")) {
      {}
    } else {
      stryCov_9fa48("154252");
      const eligible = stryMutAct_9fa48("154253") ? measurements : (stryCov_9fa48("154253"), measurements.filter(measurement => {
        if (stryMutAct_9fa48("154254")) {
          {}
        } else {
          stryCov_9fa48("154254");
          return stryMutAct_9fa48("154258") ? measurement.rttMs > this.groupThresholdMs : stryMutAct_9fa48("154257") ? measurement.rttMs < this.groupThresholdMs : stryMutAct_9fa48("154256") ? false : stryMutAct_9fa48("154255") ? true : (stryCov_9fa48("154255", "154256", "154257", "154258"), measurement.rttMs <= this.groupThresholdMs);
        }
      }));
      return stryMutAct_9fa48("154261") ? eligible[NUM.ZERO] && null : stryMutAct_9fa48("154260") ? false : stryMutAct_9fa48("154259") ? true : (stryCov_9fa48("154259", "154260", "154261"), eligible[NUM.ZERO] || null);
    }
  }

  /**
   * Find measurement entry for a group.
   * @param {Object[]} measurements
   * @param {string|null} groupId
   * @return {Object|null}
   * @private
   */
  getMeasurementForGroup(measurements, groupId) {
    if (stryMutAct_9fa48("154262")) {
      {}
    } else {
      stryCov_9fa48("154262");
      if (stryMutAct_9fa48("154265") ? false : stryMutAct_9fa48("154264") ? true : stryMutAct_9fa48("154263") ? groupId : (stryCov_9fa48("154263", "154264", "154265"), !groupId)) {
        if (stryMutAct_9fa48("154266")) {
          {}
        } else {
          stryCov_9fa48("154266");
          return null;
        }
      }
      return stryMutAct_9fa48("154269") ? measurements.find(measurement => measurement.groupId === groupId) && null : stryMutAct_9fa48("154268") ? false : stryMutAct_9fa48("154267") ? true : (stryCov_9fa48("154267", "154268", "154269"), measurements.find(stryMutAct_9fa48("154270") ? () => undefined : (stryCov_9fa48("154270"), measurement => stryMutAct_9fa48("154273") ? measurement.groupId !== groupId : stryMutAct_9fa48("154272") ? false : stryMutAct_9fa48("154271") ? true : (stryCov_9fa48("154271", "154272", "154273"), measurement.groupId === groupId))) || null);
    }
  }

  /**
   * Keep only groups currently considered active.
   * @param {Object[]} groupRows
   * @return {Object[]}
   * @private
   */
  getActiveGroups(groupRows) {
    if (stryMutAct_9fa48("154274")) {
      {}
    } else {
      stryCov_9fa48("154274");
      return stryMutAct_9fa48("154275") ? groupRows : (stryCov_9fa48("154275"), groupRows.filter(groupRow => {
        if (stryMutAct_9fa48("154276")) {
          {}
        } else {
          stryCov_9fa48("154276");
          const state = stryMutAct_9fa48("154277") ? groupRow[COLUMN.STATE] : (stryCov_9fa48("154277"), groupRow?.[COLUMN.STATE]);
          return stryMutAct_9fa48("154280") ? !state && state === LATENCY_GROUP_STATE.ACTIVE : stryMutAct_9fa48("154279") ? false : stryMutAct_9fa48("154278") ? true : (stryCov_9fa48("154278", "154279", "154280"), (stryMutAct_9fa48("154281") ? state : (stryCov_9fa48("154281"), !state)) || (stryMutAct_9fa48("154283") ? state !== LATENCY_GROUP_STATE.ACTIVE : stryMutAct_9fa48("154282") ? false : (stryCov_9fa48("154282", "154283"), state === LATENCY_GROUP_STATE.ACTIVE)));
        }
      }));
    }
  }

  /**
   * Schedule next periodic reassignment cycle.
   * @private
   */
  scheduleNextCycle() {
    if (stryMutAct_9fa48("154284")) {
      {}
    } else {
      stryCov_9fa48("154284");
      this.clearScheduledCycle();
      const delayMs = this.computeNextDelayMs();
      this.recalcTimer = this.setTimeoutFn(() => {
        if (stryMutAct_9fa48("154285")) {
          {}
        } else {
          stryCov_9fa48("154285");
          void this.executeScheduledCycle(LATENCY_GROUP_MANAGER_TRIGGER.PERIODIC);
        }
      }, delayMs);
      if (stryMutAct_9fa48("154288") ? typeof this.recalcTimer?.unref !== TYPEOF.FUNCTION : stryMutAct_9fa48("154287") ? false : stryMutAct_9fa48("154286") ? true : (stryCov_9fa48("154286", "154287", "154288"), typeof (stryMutAct_9fa48("154289") ? this.recalcTimer.unref : (stryCov_9fa48("154289"), this.recalcTimer?.unref)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("154290")) {
          {}
        } else {
          stryCov_9fa48("154290");
          this.recalcTimer.unref();
        }
      }
    }
  }

  /**
   * Clear pending periodic cycle timer.
   * @private
   */
  clearScheduledCycle() {
    if (stryMutAct_9fa48("154291")) {
      {}
    } else {
      stryCov_9fa48("154291");
      if (stryMutAct_9fa48("154293") ? false : stryMutAct_9fa48("154292") ? true : (stryCov_9fa48("154292", "154293"), this.recalcTimer)) {
        if (stryMutAct_9fa48("154294")) {
          {}
        } else {
          stryCov_9fa48("154294");
          this.clearTimeoutFn(this.recalcTimer);
          this.recalcTimer = null;
        }
      }
    }
  }

  /**
   * Compute next periodic cycle delay with bounded jitter.
   * @return {number}
   * @private
   */
  computeNextDelayMs() {
    if (stryMutAct_9fa48("154295")) {
      {}
    } else {
      stryCov_9fa48("154295");
      const jitterRange = stryMutAct_9fa48("154296") ? this.recalcIntervalMs / this.recalcJitterRatio : (stryCov_9fa48("154296"), this.recalcIntervalMs * this.recalcJitterRatio);
      if (stryMutAct_9fa48("154300") ? jitterRange > NUM.ZERO : stryMutAct_9fa48("154299") ? jitterRange < NUM.ZERO : stryMutAct_9fa48("154298") ? false : stryMutAct_9fa48("154297") ? true : (stryCov_9fa48("154297", "154298", "154299", "154300"), jitterRange <= NUM.ZERO)) {
        if (stryMutAct_9fa48("154301")) {
          {}
        } else {
          stryCov_9fa48("154301");
          return this.recalcIntervalMs;
        }
      }
      const rawRandom = this.randomFn();
      const randomValue = Number.isFinite(rawRandom) ? rawRandom : LATENCY_GROUP_MANAGER_DEFAULT.RANDOM_CENTER;
      const centeredRandom = stryMutAct_9fa48("154302") ? (randomValue - LATENCY_GROUP_MANAGER_DEFAULT.RANDOM_CENTER) / NUM.TWO : (stryCov_9fa48("154302"), (stryMutAct_9fa48("154303") ? randomValue + LATENCY_GROUP_MANAGER_DEFAULT.RANDOM_CENTER : (stryCov_9fa48("154303"), randomValue - LATENCY_GROUP_MANAGER_DEFAULT.RANDOM_CENTER)) * NUM.TWO);
      const jitterOffset = Math.round(stryMutAct_9fa48("154304") ? centeredRandom / jitterRange : (stryCov_9fa48("154304"), centeredRandom * jitterRange));
      return stryMutAct_9fa48("154305") ? Math.min(LATENCY_GROUP_MANAGER_DEFAULT.MIN_DELAY_MS, this.recalcIntervalMs + jitterOffset) : (stryCov_9fa48("154305"), Math.max(LATENCY_GROUP_MANAGER_DEFAULT.MIN_DELAY_MS, stryMutAct_9fa48("154306") ? this.recalcIntervalMs - jitterOffset : (stryCov_9fa48("154306"), this.recalcIntervalMs + jitterOffset)));
    }
  }

  /**
   * Build deterministic group ID when no eligible group exists.
   * @param {number} timestamp
   * @return {string}
   * @private
   */
  buildGroupId(timestamp) {
    if (stryMutAct_9fa48("154307")) {
      {}
    } else {
      stryCov_9fa48("154307");
      const baseTimestamp = Number.isFinite(timestamp) ? Math.floor(timestamp) : this.now();
      let attempt = NUM.ZERO;
      while (stryMutAct_9fa48("154309") ? false : stryMutAct_9fa48("154308") ? false : (stryCov_9fa48("154308", "154309"), true)) {
        if (stryMutAct_9fa48("154310")) {
          {}
        } else {
          stryCov_9fa48("154310");
          const retrySuffix = (stryMutAct_9fa48("154313") ? attempt !== NUM.ZERO : stryMutAct_9fa48("154312") ? false : stryMutAct_9fa48("154311") ? true : (stryCov_9fa48("154311", "154312", "154313"), attempt === NUM.ZERO)) ? stryMutAct_9fa48("154314") ? "Stryker was here!" : (stryCov_9fa48("154314"), '') : (stryMutAct_9fa48("154315") ? `` : (stryCov_9fa48("154315"), `${LATENCY_GROUP_MANAGER_DEFAULT.GROUP_ID_SEPARATOR}`)) + (stryMutAct_9fa48("154316") ? `` : (stryCov_9fa48("154316"), `${LATENCY_GROUP_MANAGER_DEFAULT.GROUP_ID_RETRY_MARKER}`)) + (stryMutAct_9fa48("154317") ? `` : (stryCov_9fa48("154317"), `${LATENCY_GROUP_MANAGER_DEFAULT.GROUP_ID_SEPARATOR}`)) + (stryMutAct_9fa48("154318") ? `` : (stryCov_9fa48("154318"), `${attempt}`));
          const groupId = (stryMutAct_9fa48("154319") ? `` : (stryCov_9fa48("154319"), `${LATENCY_GROUP_MANAGER_DEFAULT.GROUP_ID_PREFIX}`)) + (stryMutAct_9fa48("154320") ? `` : (stryCov_9fa48("154320"), `${this.nodeId}`)) + (stryMutAct_9fa48("154321") ? `` : (stryCov_9fa48("154321"), `${LATENCY_GROUP_MANAGER_DEFAULT.GROUP_ID_SEPARATOR}`)) + (stryMutAct_9fa48("154322") ? `` : (stryCov_9fa48("154322"), `${baseTimestamp}${retrySuffix}`));
          if (stryMutAct_9fa48("154325") ? false : stryMutAct_9fa48("154324") ? true : stryMutAct_9fa48("154323") ? this.hasGroup(groupId) : (stryCov_9fa48("154323", "154324", "154325"), !this.hasGroup(groupId))) {
            if (stryMutAct_9fa48("154326")) {
              {}
            } else {
              stryCov_9fa48("154326");
              return groupId;
            }
          }
          stryMutAct_9fa48("154327") ? attempt -= NUM.ONE : (stryCov_9fa48("154327"), attempt += NUM.ONE);
        }
      }
    }
  }

  /**
   * Check whether a group already exists in cache.
   * @param {string} groupId
   * @return {boolean}
   * @private
   */
  hasGroup(groupId) {
    if (stryMutAct_9fa48("154328")) {
      {}
    } else {
      stryCov_9fa48("154328");
      const hasFn = stryMutAct_9fa48("154329") ? this.systemTableCache.has : (stryCov_9fa48("154329"), this.systemTableCache?.has);
      if (stryMutAct_9fa48("154332") ? typeof hasFn === TYPEOF.FUNCTION : stryMutAct_9fa48("154331") ? false : stryMutAct_9fa48("154330") ? true : (stryCov_9fa48("154330", "154331", "154332"), typeof hasFn !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("154333")) {
          {}
        } else {
          stryCov_9fa48("154333");
          return stryMutAct_9fa48("154334") ? true : (stryCov_9fa48("154334"), false);
        }
      }
      const hasResult = hasFn.call(this.systemTableCache, TABLES.LATENCY_GROUPS, groupId);

      // Some runtime cache implementations (for example proxy-backed caches)
      // expose async `has()` methods that return a Promise. `buildGroupId()` is
      // synchronous and cannot await here, so treat async responses as
      // non-colliding to avoid blocking in a synchronous retry loop.
      if (stryMutAct_9fa48("154337") ? hasResult || typeof hasResult.then === TYPEOF.FUNCTION : stryMutAct_9fa48("154336") ? false : stryMutAct_9fa48("154335") ? true : (stryCov_9fa48("154335", "154336", "154337"), hasResult && (stryMutAct_9fa48("154339") ? typeof hasResult.then !== TYPEOF.FUNCTION : stryMutAct_9fa48("154338") ? true : (stryCov_9fa48("154338", "154339"), typeof hasResult.then === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("154340")) {
          {}
        } else {
          stryCov_9fa48("154340");
          return stryMutAct_9fa48("154341") ? true : (stryCov_9fa48("154341"), false);
        }
      }
      return Boolean(hasResult);
    }
  }

  /**
   * Refresh runtime config values from ConfigurationManager.
   */
  refreshConfig() {
    if (stryMutAct_9fa48("154342")) {
      {}
    } else {
      stryCov_9fa48("154342");
      this.groupThresholdMs = this.resolveNumericConfig(LATENCY_TOPOLOGY_CONFIG_KEY.GROUP_THRESHOLD_MS, LATENCY_TOPOLOGY_DEFAULT.GROUP_THRESHOLD_MS, LATENCY_GROUP_MANAGER_DEFAULT.MIN_GROUP_THRESHOLD_MS);
      this.recalcIntervalMs = this.resolveNumericConfig(LATENCY_TOPOLOGY_CONFIG_KEY.RECALC_INTERVAL_MS, LATENCY_TOPOLOGY_DEFAULT.RECALC_INTERVAL_MS, LATENCY_GROUP_MANAGER_DEFAULT.MIN_RECALC_INTERVAL_MS);
      this.recalcJitterRatio = this.resolveRatioConfig(LATENCY_TOPOLOGY_CONFIG_KEY.RECALC_JITTER_RATIO, LATENCY_TOPOLOGY_DEFAULT.RECALC_JITTER_RATIO);
    }
  }

  /**
   * Resolve numeric config with fallback and lower bound.
   * @param {string} key
   * @param {number} fallback
   * @param {number} minValue
   * @return {number}
   * @private
   */
  resolveNumericConfig(key, fallback, minValue) {
    if (stryMutAct_9fa48("154343")) {
      {}
    } else {
      stryCov_9fa48("154343");
      const value = this.config.get(key);
      if (stryMutAct_9fa48("154346") ? typeof value !== TYPEOF.NUMBER && !Number.isFinite(value) : stryMutAct_9fa48("154345") ? false : stryMutAct_9fa48("154344") ? true : (stryCov_9fa48("154344", "154345", "154346"), (stryMutAct_9fa48("154348") ? typeof value === TYPEOF.NUMBER : stryMutAct_9fa48("154347") ? false : (stryCov_9fa48("154347", "154348"), typeof value !== TYPEOF.NUMBER)) || (stryMutAct_9fa48("154349") ? Number.isFinite(value) : (stryCov_9fa48("154349"), !Number.isFinite(value))))) {
        if (stryMutAct_9fa48("154350")) {
          {}
        } else {
          stryCov_9fa48("154350");
          return fallback;
        }
      }
      return stryMutAct_9fa48("154351") ? Math.min(minValue, value) : (stryCov_9fa48("154351"), Math.max(minValue, value));
    }
  }

  /**
   * Resolve ratio config with fallback and hard bounds.
   * @param {string} key
   * @param {number} fallback
   * @return {number}
   * @private
   */
  resolveRatioConfig(key, fallback) {
    if (stryMutAct_9fa48("154352")) {
      {}
    } else {
      stryCov_9fa48("154352");
      const value = this.config.get(key);
      if (stryMutAct_9fa48("154355") ? typeof value !== TYPEOF.NUMBER && !Number.isFinite(value) : stryMutAct_9fa48("154354") ? false : stryMutAct_9fa48("154353") ? true : (stryCov_9fa48("154353", "154354", "154355"), (stryMutAct_9fa48("154357") ? typeof value === TYPEOF.NUMBER : stryMutAct_9fa48("154356") ? false : (stryCov_9fa48("154356", "154357"), typeof value !== TYPEOF.NUMBER)) || (stryMutAct_9fa48("154358") ? Number.isFinite(value) : (stryCov_9fa48("154358"), !Number.isFinite(value))))) {
        if (stryMutAct_9fa48("154359")) {
          {}
        } else {
          stryCov_9fa48("154359");
          return fallback;
        }
      }
      return stryMutAct_9fa48("154360") ? Math.max(LATENCY_GROUP_MANAGER_DEFAULT.MAX_RECALC_JITTER_RATIO, Math.max(LATENCY_GROUP_MANAGER_DEFAULT.MIN_RECALC_JITTER_RATIO, value)) : (stryCov_9fa48("154360"), Math.min(LATENCY_GROUP_MANAGER_DEFAULT.MAX_RECALC_JITTER_RATIO, stryMutAct_9fa48("154361") ? Math.min(LATENCY_GROUP_MANAGER_DEFAULT.MIN_RECALC_JITTER_RATIO, value) : (stryCov_9fa48("154361"), Math.max(LATENCY_GROUP_MANAGER_DEFAULT.MIN_RECALC_JITTER_RATIO, value))));
    }
  }

  /**
   * Ensure lifecycle initialization has happened.
   * @private
   */
  ensureInitialized() {
    if (stryMutAct_9fa48("154362")) {
      {}
    } else {
      stryCov_9fa48("154362");
      assertCritical(stryMutAct_9fa48("154365") ? this.state === LATENCY_GROUP_MANAGER_STATE.CREATED : stryMutAct_9fa48("154364") ? false : stryMutAct_9fa48("154363") ? true : (stryCov_9fa48("154363", "154364", "154365"), this.state !== LATENCY_GROUP_MANAGER_STATE.CREATED), LATENCY_GROUP_MANAGER_ERROR_MSG.NOT_INITIALIZED);
    }
  }

  /**
   * Current wall clock timestamp.
   * @return {number}
   * @private
   */
  now() {
    if (stryMutAct_9fa48("154366")) {
      {}
    } else {
      stryCov_9fa48("154366");
      return this.nowFn();
    }
  }
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("154367")) {
      {}
    } else {
      stryCov_9fa48("154367");
      if (stryMutAct_9fa48("154369") ? false : stryMutAct_9fa48("154368") ? true : (stryCov_9fa48("154368", "154369"), this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("154370")) {
          {}
        } else {
          stryCov_9fa48("154370");
          return this.controlPlaneSystemTableGateway;
        }
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("154371") ? {} : (stryCov_9fa48("154371"), {
        nodeId: this.nodeId,
        getCdcIntegrationService: stryMutAct_9fa48("154372") ? () => undefined : (stryCov_9fa48("154372"), () => this.cdcIntegrationService),
        getSystemTableCache: stryMutAct_9fa48("154373") ? () => undefined : (stryCov_9fa48("154373"), () => this.systemTableCache)
      })).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
  }

  /**
   * Get diagnostics counters.
   * @return {Object}
   */
  getStats() {
    if (stryMutAct_9fa48("154374")) {
      {}
    } else {
      stryCov_9fa48("154374");
      return stryMutAct_9fa48("154375") ? {} : (stryCov_9fa48("154375"), {
        ...this.stats,
        nodeId: this.nodeId,
        state: this.state
      });
    }
  }
}
export { LatencyGroupManager };