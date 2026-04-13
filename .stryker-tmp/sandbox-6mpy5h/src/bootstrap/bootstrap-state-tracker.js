/**
 * Bootstrap State Tracker - Tracks and logs bootstrap initialization state.
 * Provides structured logging for phase transitions and Raft state changes.
 * Requirements: 28.1, 28.2, 28.5, 28.6, 28.8, 28.9
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
import { NUM, STRING, SERVICE_TYPE } from '../constants/index.js';
import { BOOTSTRAP_PHASE } from './bootstrap-constants.js';
import { BOOTSTRAP_TRACKER_EVENT, BOOTSTRAP_TRACKER_LOG_MSG, BOOTSTRAP_TRACKER_PHASE_DESCRIPTION, BOOTSTRAP_TRACKER_SUBSYSTEM } from './bootstrap-tracker-constants.js';
const BootstrapPhase = BOOTSTRAP_PHASE;
const PHASE_DESCRIPTIONS = BOOTSTRAP_TRACKER_PHASE_DESCRIPTION;

/**
 * BootstrapStateTracker tracks and logs bootstrap initialization state.
 * It provides structured logging for phase transitions and Raft state changes.
 */
class BootstrapStateTracker extends EventEmitter {
  /**
   * Create a new BootstrapStateTracker.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("13312")) {
      {}
    } else {
      stryCov_9fa48("13312");
      super();
      this.nodeId = stryMutAct_9fa48("13315") ? options.nodeId && STRING.UNKNOWN : stryMutAct_9fa48("13314") ? false : stryMutAct_9fa48("13313") ? true : (stryCov_9fa48("13313", "13314", "13315"), options.nodeId || STRING.UNKNOWN);
      this.currentPhase = BootstrapPhase.NOT_STARTED;
      this.phaseHistory = stryMutAct_9fa48("13316") ? ["Stryker was here"] : (stryCov_9fa48("13316"), []);
      this.startTime = null;
      this.phaseStartTime = null;
      this.servicesCreated = NUM.ZERO;
      this.partitionsCreated = NUM.ZERO;
      this.messageGroupsCreated = NUM.ZERO;
      this.raftStateChanges = stryMutAct_9fa48("13317") ? ["Stryker was here"] : (stryCov_9fa48("13317"), []);
      this.errors = stryMutAct_9fa48("13318") ? ["Stryker was here"] : (stryCov_9fa48("13318"), []);

      // Initialize logger
      this.logger = this.initLogger();
    }
  }

  /**
   * Initialize the logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("13319")) {
      {}
    } else {
      stryCov_9fa48("13319");
      try {
        if (stryMutAct_9fa48("13320")) {
          {}
        } else {
          stryCov_9fa48("13320");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("13322") ? false : stryMutAct_9fa48("13321") ? true : (stryCov_9fa48("13321", "13322"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("13323")) {
              {}
            } else {
              stryCov_9fa48("13323");
              return loggingService.forSubsystem(BOOTSTRAP_TRACKER_SUBSYSTEM);
            }
          }
        }
      } catch {
        // Logging not available
      }
      return console;
    }
  }

  /**
   * Set the node ID.
   * @param {string} nodeId - Node ID.
   */
  setNodeId(nodeId) {
    if (stryMutAct_9fa48("13324")) {
      {}
    } else {
      stryCov_9fa48("13324");
      this.nodeId = nodeId;
    }
  }

  /**
   * Start tracking bootstrap.
   */
  startTracking() {
    if (stryMutAct_9fa48("13325")) {
      {}
    } else {
      stryCov_9fa48("13325");
      this.startTime = Date.now();
      this.currentPhase = BootstrapPhase.NOT_STARTED;
      this.logger.info(BOOTSTRAP_TRACKER_LOG_MSG.TRACKING_STARTED, stryMutAct_9fa48("13326") ? {} : (stryCov_9fa48("13326"), {
        nodeId: this.nodeId,
        timestamp: this.startTime
      }));
      this.emit(BOOTSTRAP_TRACKER_EVENT.TRACKING_STARTED, stryMutAct_9fa48("13327") ? {} : (stryCov_9fa48("13327"), {
        nodeId: this.nodeId,
        timestamp: this.startTime
      }));
    }
  }

  /**
   * Transition to a new phase.
   * @param {string} phase - New phase.
   * @param {Object} context - Additional context.
   */
  transitionToPhase(phase, context = {}) {
    if (stryMutAct_9fa48("13328")) {
      {}
    } else {
      stryCov_9fa48("13328");
      const previousPhase = this.currentPhase;
      const now = Date.now();
      const phaseDuration = this.phaseStartTime ? stryMutAct_9fa48("13329") ? now + this.phaseStartTime : (stryCov_9fa48("13329"), now - this.phaseStartTime) : NUM.ZERO;

      // Record phase completion
      if (stryMutAct_9fa48("13332") ? previousPhase === BootstrapPhase.NOT_STARTED : stryMutAct_9fa48("13331") ? false : stryMutAct_9fa48("13330") ? true : (stryCov_9fa48("13330", "13331", "13332"), previousPhase !== BootstrapPhase.NOT_STARTED)) {
        if (stryMutAct_9fa48("13333")) {
          {}
        } else {
          stryCov_9fa48("13333");
          this.phaseHistory.push(stryMutAct_9fa48("13334") ? {} : (stryCov_9fa48("13334"), {
            phase: previousPhase,
            startTime: this.phaseStartTime,
            endTime: now,
            duration: phaseDuration
          }));
        }
      }

      // Update state
      this.currentPhase = phase;
      this.phaseStartTime = now;

      // Log phase transition at INFO level (Requirement 28.1)
      this.logger.info(BOOTSTRAP_TRACKER_LOG_MSG.PHASE_TRANSITION, stryMutAct_9fa48("13335") ? {} : (stryCov_9fa48("13335"), {
        nodeId: this.nodeId,
        previousPhase,
        newPhase: phase,
        phaseDescription: PHASE_DESCRIPTIONS[phase],
        previousPhaseDuration: phaseDuration,
        servicesCreated: this.servicesCreated,
        partitionsCreated: this.partitionsCreated,
        messageGroupsCreated: this.messageGroupsCreated,
        ...context
      }));
      this.emit(BOOTSTRAP_TRACKER_EVENT.PHASE_TRANSITION, stryMutAct_9fa48("13336") ? {} : (stryCov_9fa48("13336"), {
        nodeId: this.nodeId,
        previousPhase,
        newPhase: phase,
        duration: phaseDuration,
        ...context
      }));
    }
  }

  /**
   * Record a Raft state change.
   * @param {Object} change - Raft state change details.
   * @param {string} change.serviceId - Service ID.
   * @param {string} change.serviceType - Service type (partition, message_group).
   * @param {string} change.previousRole - Previous Raft role.
   * @param {string} change.newRole - New Raft role.
   * @param {string} change.groupId - Group or partition ID.
   */
  recordRaftStateChange(change) {
    if (stryMutAct_9fa48("13337")) {
      {}
    } else {
      stryCov_9fa48("13337");
      const timestamp = Date.now();
      const record = stryMutAct_9fa48("13338") ? {} : (stryCov_9fa48("13338"), {
        ...change,
        timestamp,
        nodeId: this.nodeId
      });
      this.raftStateChanges.push(record);

      // Log Raft state changes at DEBUG level (Requirement 28.5)
      this.logger.debug(BOOTSTRAP_TRACKER_LOG_MSG.RAFT_STATE_CHANGE, stryMutAct_9fa48("13339") ? {} : (stryCov_9fa48("13339"), {
        nodeId: this.nodeId,
        serviceId: change.serviceId,
        serviceType: change.serviceType,
        previousRole: change.previousRole,
        newRole: change.newRole,
        groupId: change.groupId,
        partitionId: change.partitionId,
        replicaId: change.replicaId
      }));
      this.emit(BOOTSTRAP_TRACKER_EVENT.RAFT_STATE_CHANGE, record);
    }
  }

  /**
   * Record service creation.
   * @param {Object} service - Service details.
   * @param {string} service.serviceId - Service ID.
   * @param {string} service.serviceType - Service type.
   * @param {string} service.partitionId - Partition ID (if applicable).
   * @param {string} service.groupId - Group ID (if applicable).
   */
  recordServiceCreated(service) {
    if (stryMutAct_9fa48("13340")) {
      {}
    } else {
      stryCov_9fa48("13340");
      stryMutAct_9fa48("13341") ? this.servicesCreated-- : (stryCov_9fa48("13341"), this.servicesCreated++);

      // Log at DEBUG level with relevant identifiers (Requirement 28.6)
      this.logger.debug(BOOTSTRAP_TRACKER_LOG_MSG.SERVICE_CREATED, stryMutAct_9fa48("13342") ? {} : (stryCov_9fa48("13342"), {
        nodeId: this.nodeId,
        serviceId: service.serviceId,
        serviceType: service.serviceType,
        partitionId: stryMutAct_9fa48("13345") ? service.partitionId && null : stryMutAct_9fa48("13344") ? false : stryMutAct_9fa48("13343") ? true : (stryCov_9fa48("13343", "13344", "13345"), service.partitionId || null),
        groupId: stryMutAct_9fa48("13348") ? service.groupId && null : stryMutAct_9fa48("13347") ? false : stryMutAct_9fa48("13346") ? true : (stryCov_9fa48("13346", "13347", "13348"), service.groupId || null),
        replicaId: stryMutAct_9fa48("13351") ? service.replicaId && null : stryMutAct_9fa48("13350") ? false : stryMutAct_9fa48("13349") ? true : (stryCov_9fa48("13349", "13350", "13351"), service.replicaId || null),
        tableId: stryMutAct_9fa48("13354") ? service.tableId && null : stryMutAct_9fa48("13353") ? false : stryMutAct_9fa48("13352") ? true : (stryCov_9fa48("13352", "13353", "13354"), service.tableId || null),
        totalServicesCreated: this.servicesCreated
      }));
      if (stryMutAct_9fa48("13357") ? service.serviceType !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("13356") ? false : stryMutAct_9fa48("13355") ? true : (stryCov_9fa48("13355", "13356", "13357"), service.serviceType === SERVICE_TYPE.PARTITION)) {
        if (stryMutAct_9fa48("13358")) {
          {}
        } else {
          stryCov_9fa48("13358");
          stryMutAct_9fa48("13359") ? this.partitionsCreated-- : (stryCov_9fa48("13359"), this.partitionsCreated++);
        }
      } else if (stryMutAct_9fa48("13362") ? service.serviceType !== SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("13361") ? false : stryMutAct_9fa48("13360") ? true : (stryCov_9fa48("13360", "13361", "13362"), service.serviceType === SERVICE_TYPE.MESSAGE_GROUP)) {
        if (stryMutAct_9fa48("13363")) {
          {}
        } else {
          stryCov_9fa48("13363");
          stryMutAct_9fa48("13364") ? this.messageGroupsCreated-- : (stryCov_9fa48("13364"), this.messageGroupsCreated++);
        }
      }
      this.emit(BOOTSTRAP_TRACKER_EVENT.SERVICE_CREATED, stryMutAct_9fa48("13365") ? {} : (stryCov_9fa48("13365"), {
        ...service,
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Record an error during bootstrap.
   * @param {Object} error - Error details.
   * @param {string} error.phase - Phase where error occurred.
   * @param {string} error.message - Error message.
   * @param {string} error.serviceId - Service ID (if applicable).
   * @param {Object} error.context - Additional context.
   */
  recordError(error) {
    if (stryMutAct_9fa48("13366")) {
      {}
    } else {
      stryCov_9fa48("13366");
      const timestamp = Date.now();
      const record = stryMutAct_9fa48("13367") ? {} : (stryCov_9fa48("13367"), {
        ...error,
        timestamp,
        nodeId: this.nodeId,
        phase: this.currentPhase
      });
      this.errors.push(record);

      // Log errors at ERROR level with full context (Requirement 28.3)
      this.logger.error(BOOTSTRAP_TRACKER_LOG_MSG.ERROR, stryMutAct_9fa48("13368") ? {} : (stryCov_9fa48("13368"), {
        nodeId: this.nodeId,
        phase: this.currentPhase,
        errorMessage: error.message,
        serviceId: stryMutAct_9fa48("13371") ? error.serviceId && null : stryMutAct_9fa48("13370") ? false : stryMutAct_9fa48("13369") ? true : (stryCov_9fa48("13369", "13370", "13371"), error.serviceId || null),
        partitionId: stryMutAct_9fa48("13374") ? error.partitionId && null : stryMutAct_9fa48("13373") ? false : stryMutAct_9fa48("13372") ? true : (stryCov_9fa48("13372", "13373", "13374"), error.partitionId || null),
        groupId: stryMutAct_9fa48("13377") ? error.groupId && null : stryMutAct_9fa48("13376") ? false : stryMutAct_9fa48("13375") ? true : (stryCov_9fa48("13375", "13376", "13377"), error.groupId || null),
        stack: stryMutAct_9fa48("13380") ? error.stack && null : stryMutAct_9fa48("13379") ? false : stryMutAct_9fa48("13378") ? true : (stryCov_9fa48("13378", "13379", "13380"), error.stack || null),
        ...error.context
      }));
      this.emit(BOOTSTRAP_TRACKER_EVENT.ERROR, record);
    }
  }

  /**
   * Complete bootstrap tracking.
   * @param {boolean} success - Whether bootstrap succeeded.
   * @param {Object} context - Additional context.
   */
  completeTracking(success, context = {}) {
    if (stryMutAct_9fa48("13381")) {
      {}
    } else {
      stryCov_9fa48("13381");
      const endTime = Date.now();
      const totalDuration = this.startTime ? stryMutAct_9fa48("13382") ? endTime + this.startTime : (stryCov_9fa48("13382"), endTime - this.startTime) : NUM.ZERO;

      // Transition to final phase
      this.transitionToPhase(success ? BootstrapPhase.COMPLETE : BootstrapPhase.FAILED, context);

      // Log summary at INFO level (Requirement 28.4)
      if (stryMutAct_9fa48("13384") ? false : stryMutAct_9fa48("13383") ? true : (stryCov_9fa48("13383", "13384"), success)) {
        if (stryMutAct_9fa48("13385")) {
          {}
        } else {
          stryCov_9fa48("13385");
          this.logger.info(BOOTSTRAP_TRACKER_LOG_MSG.TRACKING_COMPLETE, stryMutAct_9fa48("13386") ? {} : (stryCov_9fa48("13386"), {
            nodeId: this.nodeId,
            totalDuration,
            servicesCreated: this.servicesCreated,
            partitionsCreated: this.partitionsCreated,
            messageGroupsCreated: this.messageGroupsCreated,
            phaseCount: this.phaseHistory.length,
            raftStateChanges: this.raftStateChanges.length,
            ...context
          }));
        }
      } else {
        if (stryMutAct_9fa48("13387")) {
          {}
        } else {
          stryCov_9fa48("13387");
          this.logger.error(BOOTSTRAP_TRACKER_LOG_MSG.TRACKING_FAILED, stryMutAct_9fa48("13388") ? {} : (stryCov_9fa48("13388"), {
            nodeId: this.nodeId,
            totalDuration,
            failedPhase: this.currentPhase,
            servicesCreated: this.servicesCreated,
            errorCount: this.errors.length,
            lastError: stryMutAct_9fa48("13391") ? this.errors[this.errors.length - NUM.ONE]?.message && null : stryMutAct_9fa48("13390") ? false : stryMutAct_9fa48("13389") ? true : (stryCov_9fa48("13389", "13390", "13391"), (stryMutAct_9fa48("13392") ? this.errors[this.errors.length - NUM.ONE].message : (stryCov_9fa48("13392"), this.errors[stryMutAct_9fa48("13393") ? this.errors.length + NUM.ONE : (stryCov_9fa48("13393"), this.errors.length - NUM.ONE)]?.message)) || null),
            ...context
          }));
        }
      }
      this.emit(BOOTSTRAP_TRACKER_EVENT.TRACKING_COMPLETE, stryMutAct_9fa48("13394") ? {} : (stryCov_9fa48("13394"), {
        nodeId: this.nodeId,
        success,
        totalDuration,
        servicesCreated: this.servicesCreated,
        partitionsCreated: this.partitionsCreated,
        messageGroupsCreated: this.messageGroupsCreated
      }));
    }
  }

  /**
   * Get the current bootstrap state.
   * @return {Object} Current state.
   */
  getState() {
    if (stryMutAct_9fa48("13395")) {
      {}
    } else {
      stryCov_9fa48("13395");
      return stryMutAct_9fa48("13396") ? {} : (stryCov_9fa48("13396"), {
        nodeId: this.nodeId,
        currentPhase: this.currentPhase,
        phaseDescription: PHASE_DESCRIPTIONS[this.currentPhase],
        startTime: this.startTime,
        phaseStartTime: this.phaseStartTime,
        servicesCreated: this.servicesCreated,
        partitionsCreated: this.partitionsCreated,
        messageGroupsCreated: this.messageGroupsCreated,
        phaseHistory: stryMutAct_9fa48("13397") ? [] : (stryCov_9fa48("13397"), [...this.phaseHistory]),
        raftStateChanges: this.raftStateChanges.length,
        errors: this.errors.length,
        duration: this.startTime ? stryMutAct_9fa48("13398") ? Date.now() + this.startTime : (stryCov_9fa48("13398"), Date.now() - this.startTime) : NUM.ZERO
      });
    }
  }

  /**
   * Get phase history.
   * @return {Array} Phase history.
   */
  getPhaseHistory() {
    if (stryMutAct_9fa48("13399")) {
      {}
    } else {
      stryCov_9fa48("13399");
      return stryMutAct_9fa48("13400") ? [] : (stryCov_9fa48("13400"), [...this.phaseHistory]);
    }
  }

  /**
   * Get Raft state changes.
   * @return {Array} Raft state changes.
   */
  getRaftStateChanges() {
    if (stryMutAct_9fa48("13401")) {
      {}
    } else {
      stryCov_9fa48("13401");
      return stryMutAct_9fa48("13402") ? [] : (stryCov_9fa48("13402"), [...this.raftStateChanges]);
    }
  }

  /**
   * Get errors.
   * @return {Array} Errors.
   */
  getErrors() {
    if (stryMutAct_9fa48("13403")) {
      {}
    } else {
      stryCov_9fa48("13403");
      return stryMutAct_9fa48("13404") ? [] : (stryCov_9fa48("13404"), [...this.errors]);
    }
  }

  /**
   * Check if bootstrap is in progress.
   * @return {boolean} True if in progress.
   */
  isInProgress() {
    if (stryMutAct_9fa48("13405")) {
      {}
    } else {
      stryCov_9fa48("13405");
      return stryMutAct_9fa48("13408") ? this.currentPhase !== BootstrapPhase.NOT_STARTED && this.currentPhase !== BootstrapPhase.COMPLETE || this.currentPhase !== BootstrapPhase.FAILED : stryMutAct_9fa48("13407") ? false : stryMutAct_9fa48("13406") ? true : (stryCov_9fa48("13406", "13407", "13408"), (stryMutAct_9fa48("13410") ? this.currentPhase !== BootstrapPhase.NOT_STARTED || this.currentPhase !== BootstrapPhase.COMPLETE : stryMutAct_9fa48("13409") ? true : (stryCov_9fa48("13409", "13410"), (stryMutAct_9fa48("13412") ? this.currentPhase === BootstrapPhase.NOT_STARTED : stryMutAct_9fa48("13411") ? true : (stryCov_9fa48("13411", "13412"), this.currentPhase !== BootstrapPhase.NOT_STARTED)) && (stryMutAct_9fa48("13414") ? this.currentPhase === BootstrapPhase.COMPLETE : stryMutAct_9fa48("13413") ? true : (stryCov_9fa48("13413", "13414"), this.currentPhase !== BootstrapPhase.COMPLETE)))) && (stryMutAct_9fa48("13416") ? this.currentPhase === BootstrapPhase.FAILED : stryMutAct_9fa48("13415") ? true : (stryCov_9fa48("13415", "13416"), this.currentPhase !== BootstrapPhase.FAILED)));
    }
  }

  /**
   * Check if bootstrap completed successfully.
   * @return {boolean} True if completed successfully.
   */
  isComplete() {
    if (stryMutAct_9fa48("13417")) {
      {}
    } else {
      stryCov_9fa48("13417");
      return stryMutAct_9fa48("13420") ? this.currentPhase !== BootstrapPhase.COMPLETE : stryMutAct_9fa48("13419") ? false : stryMutAct_9fa48("13418") ? true : (stryCov_9fa48("13418", "13419", "13420"), this.currentPhase === BootstrapPhase.COMPLETE);
    }
  }

  /**
   * Check if bootstrap failed.
   * @return {boolean} True if failed.
   */
  isFailed() {
    if (stryMutAct_9fa48("13421")) {
      {}
    } else {
      stryCov_9fa48("13421");
      return stryMutAct_9fa48("13424") ? this.currentPhase !== BootstrapPhase.FAILED : stryMutAct_9fa48("13423") ? false : stryMutAct_9fa48("13422") ? true : (stryCov_9fa48("13422", "13423", "13424"), this.currentPhase === BootstrapPhase.FAILED);
    }
  }

  /**
   * Reset the tracker.
   */
  reset() {
    if (stryMutAct_9fa48("13425")) {
      {}
    } else {
      stryCov_9fa48("13425");
      this.currentPhase = BootstrapPhase.NOT_STARTED;
      this.phaseHistory = stryMutAct_9fa48("13426") ? ["Stryker was here"] : (stryCov_9fa48("13426"), []);
      this.startTime = null;
      this.phaseStartTime = null;
      this.servicesCreated = NUM.ZERO;
      this.partitionsCreated = NUM.ZERO;
      this.messageGroupsCreated = NUM.ZERO;
      this.raftStateChanges = stryMutAct_9fa48("13427") ? ["Stryker was here"] : (stryCov_9fa48("13427"), []);
      this.errors = stryMutAct_9fa48("13428") ? ["Stryker was here"] : (stryCov_9fa48("13428"), []);
    }
  }
}
export { BootstrapStateTracker, BootstrapPhase, PHASE_DESCRIPTIONS };