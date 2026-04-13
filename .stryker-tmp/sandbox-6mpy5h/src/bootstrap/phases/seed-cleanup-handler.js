/**
 * Seed Cleanup Handler — handles bootstrap failure cleanup and
 * graceful shutdown for the seed bootstrap service.
 *
 * Extracted from BootstrapService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
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
import { LatencyTopologySetup } from '../shared/latency-topology-setup.js';
import { BOOTSTRAP_CLEANUP_STEP, BOOTSTRAP_EVENT, BOOTSTRAP_LOG_MSG, BOOTSTRAP_PHASE, CLEANUP_RESULT } from '../bootstrap-constants.js';
import { NodeState } from '../../node/node-lifecycle-state-machine.js';
import { ADDRESS, ENTITY_TYPE, NUM, TYPEOF } from '../../constants/index.js';

/**
 * All cleanup steps in reverse phase order.
 */
const CLEANUP_STEPS_REVERSE_ORDER = Object.freeze(stryMutAct_9fa48("26439") ? [] : (stryCov_9fa48("26439"), [BOOTSTRAP_CLEANUP_STEP.CACHE_HYDRATION, BOOTSTRAP_CLEANUP_STEP.REGISTRATION, BOOTSTRAP_CLEANUP_STEP.PARTITIONS, BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS, BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE]));

/**
 * Maps each bootstrap phase to its index in the cleanup order.
 */
const PHASE_TO_CLEANUP_INDEX = Object.freeze(stryMutAct_9fa48("26440") ? {} : (stryCov_9fa48("26440"), {
  [BOOTSTRAP_PHASE.CACHE_HYDRATION]: 0,
  [BOOTSTRAP_PHASE.REGISTRATION]: 1,
  [BOOTSTRAP_PHASE.PARTITIONS]: 2,
  [BOOTSTRAP_PHASE.MESSAGE_GROUPS]: 3,
  [BOOTSTRAP_PHASE.INFRASTRUCTURE]: 4
}));

/**
 * Handles bootstrap failure cleanup and graceful shutdown.
 */
class SeedCleanupHandler {
  /**
   * @param {Object} options
   * @param {Object} options.delegates - Callbacks into the bootstrap
   *   service for accessing mutable state.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("26441")) {
      {}
    } else {
      stryCov_9fa48("26441");
      this.delegates = stryMutAct_9fa48("26444") ? options.delegates && {} : stryMutAct_9fa48("26443") ? false : stryMutAct_9fa48("26442") ? true : (stryCov_9fa48("26442", "26443", "26444"), options.delegates || {});
    }
  }

  /**
   * Handle bootstrap failure.
   * @param {Error} error
   * @return {Object}
   */
  async handleBootstrapFailure(error) {
    if (stryMutAct_9fa48("26445")) {
      {}
    } else {
      stryCov_9fa48("26445");
      const d = this.delegates;
      const logger = d.getLogger();
      const failedPhase = d.getPhase();
      d.setPhase(BOOTSTRAP_PHASE.FAILED);
      d.setLastError(error);
      const duration = stryMutAct_9fa48("26446") ? Date.now() + d.getStartTime() : (stryCov_9fa48("26446"), Date.now() - d.getStartTime());
      logger.error(BOOTSTRAP_LOG_MSG.BOOTSTRAP_FAILED, stryMutAct_9fa48("26447") ? {} : (stryCov_9fa48("26447"), {
        nodeId: d.getNodeId(),
        phase: failedPhase,
        duration,
        error: error.message,
        stack: error.stack,
        servicesCreated: d.getServicesCreated()
      }));
      const cleanupContext = stryMutAct_9fa48("26448") ? {} : (stryCov_9fa48("26448"), {
        failedPhase,
        createdPartitions: stryMutAct_9fa48("26449") ? [] : (stryCov_9fa48("26449"), [...d.getPartitionServices().keys()]),
        createdServices: stryMutAct_9fa48("26450") ? [] : (stryCov_9fa48("26450"), [...d.getMessageGroupServices().keys(), ...d.getPartitionServices().keys()]),
        createdMessageGroups: (stryMutAct_9fa48("26454") ? d.getMessageGroupsCreated() <= NUM.ZERO : stryMutAct_9fa48("26453") ? d.getMessageGroupsCreated() >= NUM.ZERO : stryMutAct_9fa48("26452") ? false : stryMutAct_9fa48("26451") ? true : (stryCov_9fa48("26451", "26452", "26453", "26454"), d.getMessageGroupsCreated() > NUM.ZERO)) ? stryMutAct_9fa48("26455") ? [] : (stryCov_9fa48("26455"), [d.getInitialMessageGroupId()]) : stryMutAct_9fa48("26456") ? ["Stryker was here"] : (stryCov_9fa48("26456"), []),
        registeredNodeId: d.getNodeId()
      });
      await this.cleanupFailedBootstrap(failedPhase, cleanupContext);
      d.emit(BOOTSTRAP_EVENT.FAILED, stryMutAct_9fa48("26457") ? {} : (stryCov_9fa48("26457"), {
        nodeId: d.getNodeId(),
        phase: failedPhase,
        duration,
        error: error.message,
        servicesCreated: d.getServicesCreated()
      }));
      return stryMutAct_9fa48("26458") ? {} : (stryCov_9fa48("26458"), {
        success: stryMutAct_9fa48("26459") ? true : (stryCov_9fa48("26459"), false),
        nodeId: d.getNodeId(),
        duration,
        error: error.message,
        phase: failedPhase,
        servicesCreated: d.getServicesCreated()
      });
    }
  }

  /**
   * Clean up a failed bootstrap in reverse phase order.
   * @param {string} failedPhase
   * @param {Object} cleanupContext
   * @return {Promise<void>}
   */
  async cleanupFailedBootstrap(failedPhase, cleanupContext) {
    if (stryMutAct_9fa48("26460")) {
      {}
    } else {
      stryCov_9fa48("26460");
      const d = this.delegates;
      const logger = d.getLogger();
      logger.info(BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_START, stryMutAct_9fa48("26461") ? {} : (stryCov_9fa48("26461"), {
        nodeId: d.getNodeId(),
        failedPhase,
        createdPartitions: cleanupContext.createdPartitions.length,
        createdServices: cleanupContext.createdServices.length,
        createdMessageGroups: cleanupContext.createdMessageGroups.length
      }));
      const startIndex = PHASE_TO_CLEANUP_INDEX[failedPhase];
      const effectiveStart = (stryMutAct_9fa48("26464") ? startIndex === undefined : stryMutAct_9fa48("26463") ? false : stryMutAct_9fa48("26462") ? true : (stryCov_9fa48("26462", "26463", "26464"), startIndex !== undefined)) ? startIndex : NUM.ZERO;
      const stepsToRun = stryMutAct_9fa48("26465") ? CLEANUP_STEPS_REVERSE_ORDER : (stryCov_9fa48("26465"), CLEANUP_STEPS_REVERSE_ORDER.slice(effectiveStart));
      const stepResults = {};
      for (const step of stepsToRun) {
        if (stryMutAct_9fa48("26466")) {
          {}
        } else {
          stryCov_9fa48("26466");
          stepResults[step] = await this._executeCleanupStep(step, cleanupContext);
        }
      }
      const lifecycleStateMachine = d.getLifecycleStateMachine();
      const currentState = lifecycleStateMachine.getState();
      if (stryMutAct_9fa48("26469") ? currentState === NodeState.STOPPED : stryMutAct_9fa48("26468") ? false : stryMutAct_9fa48("26467") ? true : (stryCov_9fa48("26467", "26468", "26469"), currentState !== NodeState.STOPPED)) {
        if (stryMutAct_9fa48("26470")) {
          {}
        } else {
          stryCov_9fa48("26470");
          try {
            if (stryMutAct_9fa48("26471")) {
              {}
            } else {
              stryCov_9fa48("26471");
              lifecycleStateMachine.transition(NodeState.STOPPED);
            }
          } catch (err) {
            if (stryMutAct_9fa48("26472")) {
              {}
            } else {
              stryCov_9fa48("26472");
              logger.warn(BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_COMPLETE, stryMutAct_9fa48("26473") ? {} : (stryCov_9fa48("26473"), {
                nodeId: d.getNodeId(),
                transitionError: err.message
              }));
            }
          }
        }
      }
      logger.info(BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_SUMMARY, stryMutAct_9fa48("26474") ? {} : (stryCov_9fa48("26474"), {
        nodeId: d.getNodeId(),
        failedPhase,
        stepResults
      }));
    }
  }

  /**
   * Execute a single cleanup step.
   * @param {string} step
   * @param {Object} cleanupContext
   * @return {Promise<string>}
   */
  async _executeCleanupStep(step, cleanupContext) {
    if (stryMutAct_9fa48("26475")) {
      {}
    } else {
      stryCov_9fa48("26475");
      switch (step) {
        case BOOTSTRAP_CLEANUP_STEP.CACHE_HYDRATION:
          if (stryMutAct_9fa48("26476")) {} else {
            stryCov_9fa48("26476");
            return this._cleanupCacheHydration();
          }
        case BOOTSTRAP_CLEANUP_STEP.REGISTRATION:
          if (stryMutAct_9fa48("26477")) {} else {
            stryCov_9fa48("26477");
            return this._cleanupRegistration(cleanupContext);
          }
        case BOOTSTRAP_CLEANUP_STEP.PARTITIONS:
          if (stryMutAct_9fa48("26478")) {} else {
            stryCov_9fa48("26478");
            return this._cleanupPartitions();
          }
        case BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS:
          if (stryMutAct_9fa48("26479")) {} else {
            stryCov_9fa48("26479");
            return this._cleanupMessageGroups();
          }
        case BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE:
          if (stryMutAct_9fa48("26480")) {} else {
            stryCov_9fa48("26480");
            return this._cleanupInfrastructure();
          }
        default:
          if (stryMutAct_9fa48("26481")) {} else {
            stryCov_9fa48("26481");
            return CLEANUP_RESULT.SKIPPED;
          }
      }
    }
  }

  /**
   * Cleanup step: clear the system table cache.
   * @return {Promise<string>}
   */
  async _cleanupCacheHydration() {
    if (stryMutAct_9fa48("26482")) {
      {}
    } else {
      stryCov_9fa48("26482");
      const d = this.delegates;
      const logger = d.getLogger();
      try {
        if (stryMutAct_9fa48("26483")) {
          {}
        } else {
          stryCov_9fa48("26483");
          logger.info(BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_CACHE, stryMutAct_9fa48("26484") ? {} : (stryCov_9fa48("26484"), {
            nodeId: d.getNodeId()
          }));
          const cache = stryMutAct_9fa48("26487") ? d.getSystemTableCacheRef() && d.getSystemTableCacheSafe() : stryMutAct_9fa48("26486") ? false : stryMutAct_9fa48("26485") ? true : (stryCov_9fa48("26485", "26486", "26487"), d.getSystemTableCacheRef() || d.getSystemTableCacheSafe());
          if (stryMutAct_9fa48("26490") ? cache || cache.clear : stryMutAct_9fa48("26489") ? false : stryMutAct_9fa48("26488") ? true : (stryCov_9fa48("26488", "26489", "26490"), cache && cache.clear)) {
            if (stryMutAct_9fa48("26491")) {
              {}
            } else {
              stryCov_9fa48("26491");
              cache.clear();
            }
          }
          d.setSystemTableCacheRef(null);
          logger.info(BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_CACHE_DONE, stryMutAct_9fa48("26492") ? {} : (stryCov_9fa48("26492"), {
            nodeId: d.getNodeId()
          }));
          return CLEANUP_RESULT.SUCCESS;
        }
      } catch (err) {
        if (stryMutAct_9fa48("26493")) {
          {}
        } else {
          stryCov_9fa48("26493");
          logger.warn(BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_CACHE_ERROR, stryMutAct_9fa48("26494") ? {} : (stryCov_9fa48("26494"), {
            nodeId: d.getNodeId(),
            error: err.message,
            stack: err.stack
          }));
          return CLEANUP_RESULT.ERROR;
        }
      }
    }
  }

  /**
   * Cleanup step: remove partial registration entries.
   * @param {Object} cleanupContext
   * @return {Promise<string>}
   */
  async _cleanupRegistration(cleanupContext) {
    if (stryMutAct_9fa48("26495")) {
      {}
    } else {
      stryCov_9fa48("26495");
      const d = this.delegates;
      const logger = d.getLogger();
      try {
        if (stryMutAct_9fa48("26496")) {
          {}
        } else {
          stryCov_9fa48("26496");
          logger.info(BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_REGISTRATION, stryMutAct_9fa48("26497") ? {} : (stryCov_9fa48("26497"), {
            nodeId: d.getNodeId(),
            registeredNodeId: cleanupContext.registeredNodeId,
            serviceCount: cleanupContext.createdServices.length,
            partitionCount: cleanupContext.createdPartitions.length,
            messageGroupCount: cleanupContext.createdMessageGroups.length
          }));
          await this.quiesceRebalancers();
          d.stopUnifiedLifecycleOwners();
          const systemTableWriter = d.getSystemTableWriter();
          if (stryMutAct_9fa48("26500") ? systemTableWriter || systemTableWriter.disable : stryMutAct_9fa48("26499") ? false : stryMutAct_9fa48("26498") ? true : (stryCov_9fa48("26498", "26499", "26500"), systemTableWriter && systemTableWriter.disable)) {
            if (stryMutAct_9fa48("26501")) {
              {}
            } else {
              stryCov_9fa48("26501");
              systemTableWriter.disable();
            }
          }
          d.setSystemTableWriter(null);
          await LatencyTopologySetup.stop(d.getLatencyTopology());
          d.setLatencyTopology(null);
          d.clearCdcIntegrationService();
          await d.clearRuntimeServiceHandler();
          d.stopAndClearControlPlaneServices();
          await d.clearRpcClient();
          d.clearReplicaStateMachine();
          d.clearEpochManager();
          await d.clearReplicaHandler();
          d.clearTablePolicyService();
          d.clearRebalanceCoordinator();
          d.clearNodeReadyRebalanceState();
          logger.info(BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_REGISTRATION_DONE, stryMutAct_9fa48("26502") ? {} : (stryCov_9fa48("26502"), {
            nodeId: d.getNodeId()
          }));
          return CLEANUP_RESULT.SUCCESS;
        }
      } catch (err) {
        if (stryMutAct_9fa48("26503")) {
          {}
        } else {
          stryCov_9fa48("26503");
          logger.warn(BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_REGISTRATION_ERROR, stryMutAct_9fa48("26504") ? {} : (stryCov_9fa48("26504"), {
            nodeId: d.getNodeId(),
            error: err.message,
            stack: err.stack
          }));
          return CLEANUP_RESULT.ERROR;
        }
      }
    }
  }

  /**
   * Cleanup step: stop and destroy partition services.
   * @return {Promise<string>}
   */
  async _cleanupPartitions() {
    if (stryMutAct_9fa48("26505")) {
      {}
    } else {
      stryCov_9fa48("26505");
      const d = this.delegates;
      const logger = d.getLogger();
      try {
        if (stryMutAct_9fa48("26506")) {
          {}
        } else {
          stryCov_9fa48("26506");
          logger.info(BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_PARTITIONS, stryMutAct_9fa48("26507") ? {} : (stryCov_9fa48("26507"), {
            nodeId: d.getNodeId(),
            partitionCount: d.getPartitionServices().size
          }));
          for (const [replicaId, partition] of d.getPartitionServices()) {
            if (stryMutAct_9fa48("26508")) {
              {}
            } else {
              stryCov_9fa48("26508");
              try {
                if (stryMutAct_9fa48("26509")) {
                  {}
                } else {
                  stryCov_9fa48("26509");
                  if (stryMutAct_9fa48("26511") ? false : stryMutAct_9fa48("26510") ? true : (stryCov_9fa48("26510", "26511"), partition.shutdown)) {
                    if (stryMutAct_9fa48("26512")) {
                      {}
                    } else {
                      stryCov_9fa48("26512");
                      await partition.shutdown();
                    }
                  }
                }
              } catch (err) {
                if (stryMutAct_9fa48("26513")) {
                  {}
                } else {
                  stryCov_9fa48("26513");
                  logger.warn(BOOTSTRAP_LOG_MSG.PARTITION_CLEANUP_FAILED, stryMutAct_9fa48("26514") ? {} : (stryCov_9fa48("26514"), {
                    replicaId,
                    error: err.message
                  }));
                }
              }
            }
          }
          const messageRouter = d.getMessageRouter();
          if (stryMutAct_9fa48("26516") ? false : stryMutAct_9fa48("26515") ? true : (stryCov_9fa48("26515", "26516"), messageRouter)) {
            if (stryMutAct_9fa48("26517")) {
              {}
            } else {
              stryCov_9fa48("26517");
              for (const [replicaId, partition] of d.getPartitionServices()) {
                if (stryMutAct_9fa48("26518")) {
                  {}
                } else {
                  stryCov_9fa48("26518");
                  const address = (stryMutAct_9fa48("26519") ? partition.getUnifiedAddress : (stryCov_9fa48("26519"), partition?.getUnifiedAddress)) ? partition.getUnifiedAddress() : (stryMutAct_9fa48("26520") ? `` : (stryCov_9fa48("26520"), `${d.getNodeId()}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("26521") ? `` : (stryCov_9fa48("26521"), `${ENTITY_TYPE.PARTITION}`)) + (stryMutAct_9fa48("26522") ? `` : (stryCov_9fa48("26522"), `${ADDRESS.SEPARATOR}${replicaId}`));
                  messageRouter.unregister(address);
                }
              }
            }
          }
          d.getPartitionServices().clear();
          d.resetPartitionReplicas();
          logger.info(BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_PARTITIONS_DONE, stryMutAct_9fa48("26523") ? {} : (stryCov_9fa48("26523"), {
            nodeId: d.getNodeId()
          }));
          return CLEANUP_RESULT.SUCCESS;
        }
      } catch (err) {
        if (stryMutAct_9fa48("26524")) {
          {}
        } else {
          stryCov_9fa48("26524");
          logger.warn(BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_PARTITIONS_ERROR, stryMutAct_9fa48("26525") ? {} : (stryCov_9fa48("26525"), {
            nodeId: d.getNodeId(),
            error: err.message,
            stack: err.stack
          }));
          return CLEANUP_RESULT.ERROR;
        }
      }
    }
  }

  /**
   * Cleanup step: stop and destroy message group services.
   * @return {Promise<string>}
   */
  async _cleanupMessageGroups() {
    if (stryMutAct_9fa48("26526")) {
      {}
    } else {
      stryCov_9fa48("26526");
      const d = this.delegates;
      const logger = d.getLogger();
      try {
        if (stryMutAct_9fa48("26527")) {
          {}
        } else {
          stryCov_9fa48("26527");
          logger.info(BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_MESSAGE_GROUPS, stryMutAct_9fa48("26528") ? {} : (stryCov_9fa48("26528"), {
            nodeId: d.getNodeId(),
            messageGroupCount: d.getMessageGroupServices().size
          }));
          for (const [replicaId, messageGroup] of d.getMessageGroupServices()) {
            if (stryMutAct_9fa48("26529")) {
              {}
            } else {
              stryCov_9fa48("26529");
              try {
                if (stryMutAct_9fa48("26530")) {
                  {}
                } else {
                  stryCov_9fa48("26530");
                  if (stryMutAct_9fa48("26532") ? false : stryMutAct_9fa48("26531") ? true : (stryCov_9fa48("26531", "26532"), messageGroup.shutdown)) {
                    if (stryMutAct_9fa48("26533")) {
                      {}
                    } else {
                      stryCov_9fa48("26533");
                      await messageGroup.shutdown();
                    }
                  }
                }
              } catch (err) {
                if (stryMutAct_9fa48("26534")) {
                  {}
                } else {
                  stryCov_9fa48("26534");
                  logger.warn(BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_CLEANUP_FAILED, stryMutAct_9fa48("26535") ? {} : (stryCov_9fa48("26535"), {
                    replicaId,
                    error: err.message
                  }));
                }
              }
            }
          }
          const messageRouter = d.getMessageRouter();
          if (stryMutAct_9fa48("26537") ? false : stryMutAct_9fa48("26536") ? true : (stryCov_9fa48("26536", "26537"), messageRouter)) {
            if (stryMutAct_9fa48("26538")) {
              {}
            } else {
              stryCov_9fa48("26538");
              for (const [replicaId] of d.getMessageGroupServices()) {
                if (stryMutAct_9fa48("26539")) {
                  {}
                } else {
                  stryCov_9fa48("26539");
                  const address = (stryMutAct_9fa48("26540") ? `` : (stryCov_9fa48("26540"), `${d.getNodeId()}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("26541") ? `` : (stryCov_9fa48("26541"), `${ENTITY_TYPE.MESSAGE_GROUP}`)) + (stryMutAct_9fa48("26542") ? `` : (stryCov_9fa48("26542"), `${ADDRESS.SEPARATOR}${replicaId}`));
                  messageRouter.unregister(address);
                }
              }
            }
          }
          d.getMessageGroupServices().clear();
          d.resetMessageGroupReplicas();
          logger.info(BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_MESSAGE_GROUPS_DONE, stryMutAct_9fa48("26543") ? {} : (stryCov_9fa48("26543"), {
            nodeId: d.getNodeId()
          }));
          return CLEANUP_RESULT.SUCCESS;
        }
      } catch (err) {
        if (stryMutAct_9fa48("26544")) {
          {}
        } else {
          stryCov_9fa48("26544");
          logger.warn(BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_MESSAGE_GROUPS_ERROR, stryMutAct_9fa48("26545") ? {} : (stryCov_9fa48("26545"), {
            nodeId: d.getNodeId(),
            error: err.message,
            stack: err.stack
          }));
          return CLEANUP_RESULT.ERROR;
        }
      }
    }
  }

  /**
   * Cleanup step: stop the message router and transport.
   * @return {Promise<string>}
   */
  async _cleanupInfrastructure() {
    if (stryMutAct_9fa48("26546")) {
      {}
    } else {
      stryCov_9fa48("26546");
      const d = this.delegates;
      const logger = d.getLogger();
      try {
        if (stryMutAct_9fa48("26547")) {
          {}
        } else {
          stryCov_9fa48("26547");
          logger.info(BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_INFRASTRUCTURE, stryMutAct_9fa48("26548") ? {} : (stryCov_9fa48("26548"), {
            nodeId: d.getNodeId()
          }));
          d.stopUnifiedLifecycleOwners();
          const messageRouter = d.getMessageRouter();
          if (stryMutAct_9fa48("26551") ? messageRouter || messageRouter.shutdown : stryMutAct_9fa48("26550") ? false : stryMutAct_9fa48("26549") ? true : (stryCov_9fa48("26549", "26550", "26551"), messageRouter && messageRouter.shutdown)) {
            if (stryMutAct_9fa48("26552")) {
              {}
            } else {
              stryCov_9fa48("26552");
              await messageRouter.shutdown();
              d.setMessageRouter(null);
            }
          }
          const transport = d.getTransport();
          if (stryMutAct_9fa48("26555") ? transport && transport.shutdown || transport !== messageRouter : stryMutAct_9fa48("26554") ? false : stryMutAct_9fa48("26553") ? true : (stryCov_9fa48("26553", "26554", "26555"), (stryMutAct_9fa48("26557") ? transport || transport.shutdown : stryMutAct_9fa48("26556") ? true : (stryCov_9fa48("26556", "26557"), transport && transport.shutdown)) && (stryMutAct_9fa48("26559") ? transport === messageRouter : stryMutAct_9fa48("26558") ? true : (stryCov_9fa48("26558", "26559"), transport !== messageRouter)))) {
            if (stryMutAct_9fa48("26560")) {
              {}
            } else {
              stryCov_9fa48("26560");
              await transport.shutdown();
            }
          }
          d.setTransport(null);
          logger.info(BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_INFRASTRUCTURE_DONE, stryMutAct_9fa48("26561") ? {} : (stryCov_9fa48("26561"), {
            nodeId: d.getNodeId()
          }));
          return CLEANUP_RESULT.SUCCESS;
        }
      } catch (err) {
        if (stryMutAct_9fa48("26562")) {
          {}
        } else {
          stryCov_9fa48("26562");
          logger.warn(BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_INFRASTRUCTURE_ERROR, stryMutAct_9fa48("26563") ? {} : (stryCov_9fa48("26563"), {
            nodeId: d.getNodeId(),
            error: err.message,
            stack: err.stack
          }));
          return CLEANUP_RESULT.ERROR;
        }
      }
    }
  }

  /**
   * Stop all rebalancer and coordinator activity.
   * @return {Promise<void>}
   */
  async quiesceRebalancers() {
    if (stryMutAct_9fa48("26564")) {
      {}
    } else {
      stryCov_9fa48("26564");
      const d = this.delegates;
      const logger = d.getLogger();
      const partitionTasks = (stryMutAct_9fa48("26565") ? [] : (stryCov_9fa48("26565"), [...d.getPartitionServices().entries()])).map(async ([replicaId, partition]) => {
        if (stryMutAct_9fa48("26566")) {
          {}
        } else {
          stryCov_9fa48("26566");
          if (stryMutAct_9fa48("26569") ? !partition && typeof partition.quiesceRebalancing !== TYPEOF.FUNCTION : stryMutAct_9fa48("26568") ? false : stryMutAct_9fa48("26567") ? true : (stryCov_9fa48("26567", "26568", "26569"), (stryMutAct_9fa48("26570") ? partition : (stryCov_9fa48("26570"), !partition)) || (stryMutAct_9fa48("26572") ? typeof partition.quiesceRebalancing === TYPEOF.FUNCTION : stryMutAct_9fa48("26571") ? false : (stryCov_9fa48("26571", "26572"), typeof partition.quiesceRebalancing !== TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("26573")) {
              {}
            } else {
              stryCov_9fa48("26573");
              return;
            }
          }
          try {
            if (stryMutAct_9fa48("26574")) {
              {}
            } else {
              stryCov_9fa48("26574");
              await partition.quiesceRebalancing();
            }
          } catch (error) {
            if (stryMutAct_9fa48("26575")) {
              {}
            } else {
              stryCov_9fa48("26575");
              logger.warn(BOOTSTRAP_LOG_MSG.PARTITION_CLEANUP_FAILED, stryMutAct_9fa48("26576") ? {} : (stryCov_9fa48("26576"), {
                replicaId,
                error: error.message
              }));
            }
          }
        }
      });
      const messageGroupTasks = (stryMutAct_9fa48("26577") ? [] : (stryCov_9fa48("26577"), [...d.getMessageGroupServices().entries()])).map(async ([replicaId, messageGroup]) => {
        if (stryMutAct_9fa48("26578")) {
          {}
        } else {
          stryCov_9fa48("26578");
          if (stryMutAct_9fa48("26581") ? !messageGroup && typeof messageGroup.quiesceRebalancing !== TYPEOF.FUNCTION : stryMutAct_9fa48("26580") ? false : stryMutAct_9fa48("26579") ? true : (stryCov_9fa48("26579", "26580", "26581"), (stryMutAct_9fa48("26582") ? messageGroup : (stryCov_9fa48("26582"), !messageGroup)) || (stryMutAct_9fa48("26584") ? typeof messageGroup.quiesceRebalancing === TYPEOF.FUNCTION : stryMutAct_9fa48("26583") ? false : (stryCov_9fa48("26583", "26584"), typeof messageGroup.quiesceRebalancing !== TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("26585")) {
              {}
            } else {
              stryCov_9fa48("26585");
              return;
            }
          }
          try {
            if (stryMutAct_9fa48("26586")) {
              {}
            } else {
              stryCov_9fa48("26586");
              await messageGroup.quiesceRebalancing();
            }
          } catch (error) {
            if (stryMutAct_9fa48("26587")) {
              {}
            } else {
              stryCov_9fa48("26587");
              logger.warn(BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_CLEANUP_FAILED, stryMutAct_9fa48("26588") ? {} : (stryCov_9fa48("26588"), {
                replicaId,
                error: error.message
              }));
            }
          }
        }
      });
      await Promise.all(stryMutAct_9fa48("26589") ? [] : (stryCov_9fa48("26589"), [...partitionTasks, ...messageGroupTasks]));
      const rebalanceCoordinator = d.getRebalanceCoordinator();
      if (stryMutAct_9fa48("26591") ? false : stryMutAct_9fa48("26590") ? true : (stryCov_9fa48("26590", "26591"), rebalanceCoordinator)) {
        if (stryMutAct_9fa48("26592")) {
          {}
        } else {
          stryCov_9fa48("26592");
          try {
            if (stryMutAct_9fa48("26593")) {
              {}
            } else {
              stryCov_9fa48("26593");
              await rebalanceCoordinator.shutdown();
            }
          } catch (error) {
            if (stryMutAct_9fa48("26594")) {
              {}
            } else {
              stryCov_9fa48("26594");
              logger.warn(BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_REGISTRATION_ERROR, stryMutAct_9fa48("26595") ? {} : (stryCov_9fa48("26595"), {
                nodeId: d.getNodeId(),
                error: error.message
              }));
            }
          }
          d.clearRebalanceCoordinator();
        }
      }
    }
  }

  /**
   * Clean up partially initialized services (graceful shutdown).
   * @return {Promise<void>}
   */
  async cleanup() {
    if (stryMutAct_9fa48("26596")) {
      {}
    } else {
      stryCov_9fa48("26596");
      const d = this.delegates;
      const logger = d.getLogger();
      d.setIsShuttingDown(stryMutAct_9fa48("26597") ? false : (stryCov_9fa48("26597"), true));
      logger.info(BOOTSTRAP_LOG_MSG.CLEANUP_START, stryMutAct_9fa48("26598") ? {} : (stryCov_9fa48("26598"), {
        nodeId: d.getNodeId(),
        messageGroupServices: d.getMessageGroupServices().size,
        partitionServices: d.getPartitionServices().size
      }));
      d.clearNodeReadyRebalanceState();
      d.stopUnifiedLifecycleOwners();
      await this.quiesceRebalancers();
      await LatencyTopologySetup.stop(d.getLatencyTopology());
      d.setLatencyTopology(null);
      await d.clearRuntimeServiceHandler();
      d.stopAndClearControlPlaneServices();
      await d.clearRpcClient();
      d.clearReplicaStateMachine();
      const systemTableWriter = d.getSystemTableWriter();
      if (stryMutAct_9fa48("26601") ? systemTableWriter || systemTableWriter.disable : stryMutAct_9fa48("26600") ? false : stryMutAct_9fa48("26599") ? true : (stryCov_9fa48("26599", "26600", "26601"), systemTableWriter && systemTableWriter.disable)) {
        if (stryMutAct_9fa48("26602")) {
          {}
        } else {
          stryCov_9fa48("26602");
          systemTableWriter.disable();
        }
      }
      d.setSystemTableWriter(null);
      d.clearEpochManager();
      await d.clearReplicaHandler();

      // Shutdown partition services
      for (const [replicaId, partition] of d.getPartitionServices()) {
        if (stryMutAct_9fa48("26603")) {
          {}
        } else {
          stryCov_9fa48("26603");
          try {
            if (stryMutAct_9fa48("26604")) {
              {}
            } else {
              stryCov_9fa48("26604");
              if (stryMutAct_9fa48("26606") ? false : stryMutAct_9fa48("26605") ? true : (stryCov_9fa48("26605", "26606"), partition.shutdown)) {
                if (stryMutAct_9fa48("26607")) {
                  {}
                } else {
                  stryCov_9fa48("26607");
                  await partition.shutdown();
                }
              }
              logger.debug(BOOTSTRAP_LOG_MSG.PARTITION_CLEANED, stryMutAct_9fa48("26608") ? {} : (stryCov_9fa48("26608"), {
                replicaId
              }));
            }
          } catch (err) {
            if (stryMutAct_9fa48("26609")) {
              {}
            } else {
              stryCov_9fa48("26609");
              logger.warn(BOOTSTRAP_LOG_MSG.PARTITION_CLEANUP_FAILED, stryMutAct_9fa48("26610") ? {} : (stryCov_9fa48("26610"), {
                replicaId,
                error: err.message
              }));
            }
          }
        }
      }
      const messageRouter = d.getMessageRouter();
      if (stryMutAct_9fa48("26612") ? false : stryMutAct_9fa48("26611") ? true : (stryCov_9fa48("26611", "26612"), messageRouter)) {
        if (stryMutAct_9fa48("26613")) {
          {}
        } else {
          stryCov_9fa48("26613");
          for (const [replicaId, partition] of d.getPartitionServices()) {
            if (stryMutAct_9fa48("26614")) {
              {}
            } else {
              stryCov_9fa48("26614");
              const address = (stryMutAct_9fa48("26615") ? partition.getUnifiedAddress : (stryCov_9fa48("26615"), partition?.getUnifiedAddress)) ? partition.getUnifiedAddress() : (stryMutAct_9fa48("26616") ? `` : (stryCov_9fa48("26616"), `${d.getNodeId()}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("26617") ? `` : (stryCov_9fa48("26617"), `${ENTITY_TYPE.PARTITION}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("26618") ? `` : (stryCov_9fa48("26618"), `${replicaId}`));
              messageRouter.unregister(address);
            }
          }
        }
      }
      d.getPartitionServices().clear();
      d.resetPartitionReplicas();

      // Shutdown message group services
      for (const [replicaId, messageGroup] of d.getMessageGroupServices()) {
        if (stryMutAct_9fa48("26619")) {
          {}
        } else {
          stryCov_9fa48("26619");
          try {
            if (stryMutAct_9fa48("26620")) {
              {}
            } else {
              stryCov_9fa48("26620");
              if (stryMutAct_9fa48("26622") ? false : stryMutAct_9fa48("26621") ? true : (stryCov_9fa48("26621", "26622"), messageGroup.shutdown)) {
                if (stryMutAct_9fa48("26623")) {
                  {}
                } else {
                  stryCov_9fa48("26623");
                  await messageGroup.shutdown();
                }
              }
              logger.debug(BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_CLEANED, stryMutAct_9fa48("26624") ? {} : (stryCov_9fa48("26624"), {
                replicaId
              }));
            }
          } catch (err) {
            if (stryMutAct_9fa48("26625")) {
              {}
            } else {
              stryCov_9fa48("26625");
              logger.warn(BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_CLEANUP_FAILED, stryMutAct_9fa48("26626") ? {} : (stryCov_9fa48("26626"), {
                replicaId,
                error: err.message
              }));
            }
          }
        }
      }
      if (stryMutAct_9fa48("26628") ? false : stryMutAct_9fa48("26627") ? true : (stryCov_9fa48("26627", "26628"), messageRouter)) {
        if (stryMutAct_9fa48("26629")) {
          {}
        } else {
          stryCov_9fa48("26629");
          for (const [replicaId] of d.getMessageGroupServices()) {
            if (stryMutAct_9fa48("26630")) {
              {}
            } else {
              stryCov_9fa48("26630");
              const address = (stryMutAct_9fa48("26631") ? `` : (stryCov_9fa48("26631"), `${d.getNodeId()}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("26632") ? `` : (stryCov_9fa48("26632"), `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("26633") ? `` : (stryCov_9fa48("26633"), `${replicaId}`));
              messageRouter.unregister(address);
            }
          }
        }
      }
      d.getMessageGroupServices().clear();
      d.resetMessageGroupReplicas();

      // Shutdown message router
      if (stryMutAct_9fa48("26636") ? messageRouter || messageRouter.shutdown : stryMutAct_9fa48("26635") ? false : stryMutAct_9fa48("26634") ? true : (stryCov_9fa48("26634", "26635", "26636"), messageRouter && messageRouter.shutdown)) {
        if (stryMutAct_9fa48("26637")) {
          {}
        } else {
          stryCov_9fa48("26637");
          await messageRouter.shutdown();
          d.setMessageRouter(null);
        }
      }

      // Shutdown transport
      const transport = d.getTransport();
      if (stryMutAct_9fa48("26640") ? transport && transport.shutdown || transport !== messageRouter : stryMutAct_9fa48("26639") ? false : stryMutAct_9fa48("26638") ? true : (stryCov_9fa48("26638", "26639", "26640"), (stryMutAct_9fa48("26642") ? transport || transport.shutdown : stryMutAct_9fa48("26641") ? true : (stryCov_9fa48("26641", "26642"), transport && transport.shutdown)) && (stryMutAct_9fa48("26644") ? transport === messageRouter : stryMutAct_9fa48("26643") ? true : (stryCov_9fa48("26643", "26644"), transport !== messageRouter)))) {
        if (stryMutAct_9fa48("26645")) {
          {}
        } else {
          stryCov_9fa48("26645");
          await transport.shutdown();
        }
      }
      d.setTransport(null);
      logger.info(BOOTSTRAP_LOG_MSG.CLEANUP_COMPLETE, stryMutAct_9fa48("26646") ? {} : (stryCov_9fa48("26646"), {
        nodeId: d.getNodeId()
      }));
    }
  }
}
export { SeedCleanupHandler };