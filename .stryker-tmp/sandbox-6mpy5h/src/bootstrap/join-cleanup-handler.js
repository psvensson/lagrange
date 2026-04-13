/**
 * Join Cleanup Handler — handles failure cleanup and resource teardown
 * for a joining node.
 *
 * Extracted from NodeJoiningService to keep the orchestrator thin.
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
import { NodeState } from '../node/node-lifecycle-state-machine.js';
import { LatencyTopologySetup } from './shared/latency-topology-setup.js';
import { BOOTSTRAP_EVENT, CLEANUP_RESULT, JOINING_PHASE } from './bootstrap-constants.js';
import { JOINING_CLEANUP_STEP, JOINING_LOG_MSG } from './node-joining-constants.js';
import { ADDRESS, ENTITY_TYPE, NUM, STATE, TYPEOF } from '../constants/index.js';

/**
 * Maps each JOINING_PHASE to its index in the cleanup steps array.
 * Phases that completed before the failed phase need cleanup.
 * The failed phase itself also gets cleanup.
 * @type {Object<string, number>}
 */
const JOINING_PHASE_TO_CLEANUP_INDEX = Object.freeze(stryMutAct_9fa48("13515") ? {} : (stryCov_9fa48("13515"), {
  [JOINING_PHASE.QUERYING_STATE]: NUM.ZERO,
  [JOINING_PHASE.WAITING_LEADERSHIP]: NUM.ONE,
  [JOINING_PHASE.CREATING_MESSAGE_GROUP]: NUM.TWO,
  [JOINING_PHASE.JOINING_MESSAGE_GROUP]: NUM.TWO,
  [JOINING_PHASE.CONNECTING_WEBSOCKET]: NUM.THREE,
  [JOINING_PHASE.CONTACTING_SEED]: NUM.FOUR
}));

/**
 * Cleanup steps in reverse phase order.
 * Each step undoes the work of the corresponding join phase.
 * @type {string[]}
 */
const JOINING_CLEANUP_STEPS_REVERSE = Object.freeze(stryMutAct_9fa48("13516") ? [] : (stryCov_9fa48("13516"), [JOINING_CLEANUP_STEP.QUERYING_STATE, JOINING_CLEANUP_STEP.WAITING_LEADERSHIP, JOINING_CLEANUP_STEP.MESSAGE_GROUP, JOINING_CLEANUP_STEP.CONNECTING_WEBSOCKET]));

/**
 * Handles failure cleanup and resource teardown for a joining node.
 */
class JoinCleanupHandler {
  /**
   * @param {Object} options
   * @param {string} options.nodeId - This node's ID.
   * @param {Object} options.delegates - Callbacks into the joining
   *   service for accessing mutable state.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("13517")) {
      {}
    } else {
      stryCov_9fa48("13517");
      this.nodeId = options.nodeId;
      this.delegates = stryMutAct_9fa48("13520") ? options.delegates && {} : stryMutAct_9fa48("13519") ? false : stryMutAct_9fa48("13518") ? true : (stryCov_9fa48("13518", "13519", "13520"), options.delegates || {});
    }
  }

  /**
   * Handle a joining failure: log, cleanup, emit event, return result.
   * @param {Error} error - The error that caused the failure.
   * @return {Promise<Object>} Joining failure result.
   */
  async handleJoiningFailure(error) {
    if (stryMutAct_9fa48("13521")) {
      {}
    } else {
      stryCov_9fa48("13521");
      const failedPhase = this.delegates.getPhase();
      this.delegates.setPhase(JOINING_PHASE.FAILED);
      this.delegates.setLastError(error);
      const duration = stryMutAct_9fa48("13522") ? this.delegates.getNow()() + this.delegates.getStartTime() : (stryCov_9fa48("13522"), this.delegates.getNow()() - this.delegates.getStartTime());
      const logger = this.delegates.getLogger();
      logger.error(JOINING_LOG_MSG.JOIN_FAILED, stryMutAct_9fa48("13523") ? {} : (stryCov_9fa48("13523"), {
        nodeId: this.nodeId,
        phase: failedPhase,
        duration,
        error: error.message,
        stack: error.stack
      }));

      // Execute structured reverse-order cleanup before generic cleanup
      const bootstrapResponse = this.delegates.getBootstrapResponse();
      const messageGroupServices = this.delegates.getMessageGroupServices();
      const cleanupContext = stryMutAct_9fa48("13524") ? {} : (stryCov_9fa48("13524"), {
        registeredNodeId: stryMutAct_9fa48("13527") ? this.delegates.getRegisteredJoinNodeId?.() && null : stryMutAct_9fa48("13526") ? false : stryMutAct_9fa48("13525") ? true : (stryCov_9fa48("13525", "13526", "13527"), (stryMutAct_9fa48("13528") ? this.delegates.getRegisteredJoinNodeId() : (stryCov_9fa48("13528"), this.delegates.getRegisteredJoinNodeId?.())) || null),
        createdServiceIds: Array.from(messageGroupServices.keys()),
        createdMessageGroupIds: (stryMutAct_9fa48("13530") ? bootstrapResponse.messageGroupAssignment?.groupId : stryMutAct_9fa48("13529") ? bootstrapResponse?.messageGroupAssignment.groupId : (stryCov_9fa48("13529", "13530"), bootstrapResponse?.messageGroupAssignment?.groupId)) ? stryMutAct_9fa48("13531") ? [] : (stryCov_9fa48("13531"), [bootstrapResponse.messageGroupAssignment.groupId]) : stryMutAct_9fa48("13532") ? ["Stryker was here"] : (stryCov_9fa48("13532"), [])
      });
      await this.cleanupFailedJoin(failedPhase, cleanupContext);

      // Clean up partially initialized services
      await this.cleanup();
      this.delegates.emit(BOOTSTRAP_EVENT.FAILED, stryMutAct_9fa48("13533") ? {} : (stryCov_9fa48("13533"), {
        nodeId: this.nodeId,
        phase: failedPhase,
        duration,
        error: error.message
      }));
      return stryMutAct_9fa48("13534") ? {} : (stryCov_9fa48("13534"), {
        success: stryMutAct_9fa48("13535") ? true : (stryCov_9fa48("13535"), false),
        nodeId: this.nodeId,
        duration,
        error: error.message,
        phase: failedPhase,
        retryable: stryMutAct_9fa48("13538") ? error?.retryable !== true : stryMutAct_9fa48("13537") ? false : stryMutAct_9fa48("13536") ? true : (stryCov_9fa48("13536", "13537", "13538"), (stryMutAct_9fa48("13539") ? error.retryable : (stryCov_9fa48("13539"), error?.retryable)) === (stryMutAct_9fa48("13540") ? false : (stryCov_9fa48("13540"), true))),
        retryAfterMs: Number.isFinite(stryMutAct_9fa48("13541") ? error.retryAfterMs : (stryCov_9fa48("13541"), error?.retryAfterMs)) ? stryMutAct_9fa48("13542") ? Math.min(NUM.ZERO, Math.floor(error.retryAfterMs)) : (stryCov_9fa48("13542"), Math.max(NUM.ZERO, Math.floor(error.retryAfterMs))) : NUM.ZERO
      });
    }
  }

  /**
   * Clean up a failed join in reverse phase order.
   * Each cleanup step undoes the work of the corresponding join phase.
   * Errors are logged but never thrown — cleanup is best-effort.
   * @param {string} failedPhase - The JOINING_PHASE that failed.
   * @param {Object} cleanupContext - Tracking info for cleanup.
   * @param {string} cleanupContext.registeredNodeId - Node ID if
   *   registered before failure.
   * @param {string[]} cleanupContext.createdServiceIds - Service IDs
   *   created before failure.
   * @param {string[]} cleanupContext.createdMessageGroupIds - Message
   *   group IDs created before failure.
   * @return {Promise<void>}
   */
  async cleanupFailedJoin(failedPhase, cleanupContext) {
    if (stryMutAct_9fa48("13543")) {
      {}
    } else {
      stryCov_9fa48("13543");
      const logger = this.delegates.getLogger();
      logger.info(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_START, stryMutAct_9fa48("13544") ? {} : (stryCov_9fa48("13544"), {
        nodeId: this.nodeId,
        failedPhase,
        createdServiceIds: cleanupContext.createdServiceIds.length,
        createdMessageGroupIds: cleanupContext.createdMessageGroupIds.length
      }));
      const startIndex = JOINING_PHASE_TO_CLEANUP_INDEX[failedPhase];
      const effectiveStart = (stryMutAct_9fa48("13547") ? startIndex === undefined : stryMutAct_9fa48("13546") ? false : stryMutAct_9fa48("13545") ? true : (stryCov_9fa48("13545", "13546", "13547"), startIndex !== undefined)) ? startIndex : NUM.ZERO;
      const stepsToRun = stryMutAct_9fa48("13548") ? JOINING_CLEANUP_STEPS_REVERSE : (stryCov_9fa48("13548"), JOINING_CLEANUP_STEPS_REVERSE.slice(effectiveStart));
      const stepResults = {};
      for (const step of stepsToRun) {
        if (stryMutAct_9fa48("13549")) {
          {}
        } else {
          stryCov_9fa48("13549");
          stepResults[step] = await this._executeJoinCleanupStep(step, cleanupContext);
        }
      }

      // Transition lifecycle state machine to STOPPED
      const lifecycleStateMachine = this.delegates.getLifecycleStateMachine();
      const currentState = lifecycleStateMachine.getState();
      if (stryMutAct_9fa48("13552") ? currentState === NodeState.STOPPED : stryMutAct_9fa48("13551") ? false : stryMutAct_9fa48("13550") ? true : (stryCov_9fa48("13550", "13551", "13552"), currentState !== NodeState.STOPPED)) {
        if (stryMutAct_9fa48("13553")) {
          {}
        } else {
          stryCov_9fa48("13553");
          try {
            if (stryMutAct_9fa48("13554")) {
              {}
            } else {
              stryCov_9fa48("13554");
              lifecycleStateMachine.transition(NodeState.STOPPED);
            }
          } catch (err) {
            if (stryMutAct_9fa48("13555")) {
              {}
            } else {
              stryCov_9fa48("13555");
              logger.warn(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_COMPLETE, stryMutAct_9fa48("13556") ? {} : (stryCov_9fa48("13556"), {
                nodeId: this.nodeId,
                transitionError: err.message
              }));
            }
          }
        }
      }
      logger.info(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_SUMMARY, stryMutAct_9fa48("13557") ? {} : (stryCov_9fa48("13557"), {
        nodeId: this.nodeId,
        failedPhase,
        stepResults
      }));
    }
  }

  /**
   * Execute a single join cleanup step. Each step is wrapped in
   * try/catch so that cleanup errors are logged but never thrown.
   * @param {string} step - The cleanup step to execute.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _executeJoinCleanupStep(step, cleanupContext) {
    if (stryMutAct_9fa48("13558")) {
      {}
    } else {
      stryCov_9fa48("13558");
      switch (step) {
        case JOINING_CLEANUP_STEP.QUERYING_STATE:
          if (stryMutAct_9fa48("13559")) {} else {
            stryCov_9fa48("13559");
            return this._cleanupQueryingState(cleanupContext);
          }
        case JOINING_CLEANUP_STEP.WAITING_LEADERSHIP:
          if (stryMutAct_9fa48("13560")) {} else {
            stryCov_9fa48("13560");
            return this._cleanupWaitingLeadership();
          }
        case JOINING_CLEANUP_STEP.MESSAGE_GROUP:
          if (stryMutAct_9fa48("13561")) {} else {
            stryCov_9fa48("13561");
            return this._cleanupMessageGroup(cleanupContext);
          }
        case JOINING_CLEANUP_STEP.CONNECTING_WEBSOCKET:
          if (stryMutAct_9fa48("13562")) {} else {
            stryCov_9fa48("13562");
            return this._cleanupConnectingWebSocket();
          }
        default:
          if (stryMutAct_9fa48("13563")) {} else {
            stryCov_9fa48("13563");
            return CLEANUP_RESULT.SKIPPED;
          }
      }
    }
  }

  /**
   * Cleanup step: remove self from nodes table and remove
   * service entries created during join.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupQueryingState(cleanupContext) {
    if (stryMutAct_9fa48("13564")) {
      {}
    } else {
      stryCov_9fa48("13564");
      const logger = this.delegates.getLogger();
      try {
        if (stryMutAct_9fa48("13565")) {
          {}
        } else {
          stryCov_9fa48("13565");
          logger.info(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_QUERYING_STATE, stryMutAct_9fa48("13566") ? {} : (stryCov_9fa48("13566"), {
            nodeId: this.nodeId,
            registeredNodeId: cleanupContext.registeredNodeId,
            serviceCount: cleanupContext.createdServiceIds.length
          }));

          // Withdraw the node through the canonical control-plane owner path
          // instead of deleting rows directly from a half-joined node.
          if (stryMutAct_9fa48("13569") ? cleanupContext.registeredNodeId || typeof this.delegates.sendControlPlaneNodeStateUpdate === TYPEOF.FUNCTION : stryMutAct_9fa48("13568") ? false : stryMutAct_9fa48("13567") ? true : (stryCov_9fa48("13567", "13568", "13569"), cleanupContext.registeredNodeId && (stryMutAct_9fa48("13571") ? typeof this.delegates.sendControlPlaneNodeStateUpdate !== TYPEOF.FUNCTION : stryMutAct_9fa48("13570") ? true : (stryCov_9fa48("13570", "13571"), typeof this.delegates.sendControlPlaneNodeStateUpdate === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("13572")) {
              {}
            } else {
              stryCov_9fa48("13572");
              try {
                if (stryMutAct_9fa48("13573")) {
                  {}
                } else {
                  stryCov_9fa48("13573");
                  await this.delegates.sendControlPlaneNodeStateUpdate(stryMutAct_9fa48("13574") ? {} : (stryCov_9fa48("13574"), {
                    state: STATE.DISCONNECTED,
                    heartbeatAt: this.delegates.getNow()()
                  }));
                }
              } catch (nodeErr) {
                if (stryMutAct_9fa48("13575")) {
                  {}
                } else {
                  stryCov_9fa48("13575");
                  logger.warn(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_QUERYING_STATE_ERROR, stryMutAct_9fa48("13576") ? {} : (stryCov_9fa48("13576"), {
                    nodeId: this.nodeId,
                    detail: stryMutAct_9fa48("13577") ? "" : (stryCov_9fa48("13577"), 'node withdrawal'),
                    error: nodeErr.message
                  }));
                }
              }
            }
          }
          logger.info(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_QUERYING_STATE_DONE, stryMutAct_9fa48("13578") ? {} : (stryCov_9fa48("13578"), {
            nodeId: this.nodeId
          }));
          return CLEANUP_RESULT.SUCCESS;
        }
      } catch (err) {
        if (stryMutAct_9fa48("13579")) {
          {}
        } else {
          stryCov_9fa48("13579");
          logger.warn(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_QUERYING_STATE_ERROR, stryMutAct_9fa48("13580") ? {} : (stryCov_9fa48("13580"), {
            nodeId: this.nodeId,
            error: err.message,
            stack: err.stack
          }));
          return CLEANUP_RESULT.ERROR;
        }
      }
    }
  }

  /**
   * Cleanup step: stop message group services that were
   * waiting for leadership.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupWaitingLeadership() {
    if (stryMutAct_9fa48("13581")) {
      {}
    } else {
      stryCov_9fa48("13581");
      const logger = this.delegates.getLogger();
      const messageGroupServices = this.delegates.getMessageGroupServices();
      try {
        if (stryMutAct_9fa48("13582")) {
          {}
        } else {
          stryCov_9fa48("13582");
          logger.info(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_WAITING_LEADERSHIP, stryMutAct_9fa48("13583") ? {} : (stryCov_9fa48("13583"), {
            nodeId: this.nodeId,
            messageGroupCount: messageGroupServices.size
          }));
          for (const [replicaId, messageGroup] of messageGroupServices) {
            if (stryMutAct_9fa48("13584")) {
              {}
            } else {
              stryCov_9fa48("13584");
              try {
                if (stryMutAct_9fa48("13585")) {
                  {}
                } else {
                  stryCov_9fa48("13585");
                  if (stryMutAct_9fa48("13587") ? false : stryMutAct_9fa48("13586") ? true : (stryCov_9fa48("13586", "13587"), messageGroup.shutdown)) {
                    if (stryMutAct_9fa48("13588")) {
                      {}
                    } else {
                      stryCov_9fa48("13588");
                      await messageGroup.shutdown();
                    }
                  }
                }
              } catch (mgErr) {
                if (stryMutAct_9fa48("13589")) {
                  {}
                } else {
                  stryCov_9fa48("13589");
                  logger.warn(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_WAITING_LEADERSHIP_ERROR, stryMutAct_9fa48("13590") ? {} : (stryCov_9fa48("13590"), {
                    nodeId: this.nodeId,
                    replicaId,
                    error: mgErr.message
                  }));
                }
              }
            }
          }
          logger.info(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_WAITING_LEADERSHIP_DONE, stryMutAct_9fa48("13591") ? {} : (stryCov_9fa48("13591"), {
            nodeId: this.nodeId
          }));
          return CLEANUP_RESULT.SUCCESS;
        }
      } catch (err) {
        if (stryMutAct_9fa48("13592")) {
          {}
        } else {
          stryCov_9fa48("13592");
          logger.warn(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_WAITING_LEADERSHIP_ERROR, stryMutAct_9fa48("13593") ? {} : (stryCov_9fa48("13593"), {
            nodeId: this.nodeId,
            error: err.message,
            stack: err.stack
          }));
          return CLEANUP_RESULT.ERROR;
        }
      }
    }
  }

  /**
   * Cleanup step: stop message group replicas and remove
   * their service entries.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupMessageGroup(cleanupContext) {
    if (stryMutAct_9fa48("13594")) {
      {}
    } else {
      stryCov_9fa48("13594");
      const logger = this.delegates.getLogger();
      const messageGroupServices = this.delegates.getMessageGroupServices();
      const messageRouter = this.delegates.getMessageRouter();
      try {
        if (stryMutAct_9fa48("13595")) {
          {}
        } else {
          stryCov_9fa48("13595");
          logger.info(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_MESSAGE_GROUP, stryMutAct_9fa48("13596") ? {} : (stryCov_9fa48("13596"), {
            nodeId: this.nodeId,
            messageGroupCount: messageGroupServices.size,
            serviceCount: cleanupContext.createdServiceIds.length
          }));

          // Stop message group replicas
          for (const [replicaId, messageGroup] of messageGroupServices) {
            if (stryMutAct_9fa48("13597")) {
              {}
            } else {
              stryCov_9fa48("13597");
              try {
                if (stryMutAct_9fa48("13598")) {
                  {}
                } else {
                  stryCov_9fa48("13598");
                  if (stryMutAct_9fa48("13600") ? false : stryMutAct_9fa48("13599") ? true : (stryCov_9fa48("13599", "13600"), messageGroup.shutdown)) {
                    if (stryMutAct_9fa48("13601")) {
                      {}
                    } else {
                      stryCov_9fa48("13601");
                      await messageGroup.shutdown();
                    }
                  }
                }
              } catch (mgErr) {
                if (stryMutAct_9fa48("13602")) {
                  {}
                } else {
                  stryCov_9fa48("13602");
                  logger.warn(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_MESSAGE_GROUP_ERROR, stryMutAct_9fa48("13603") ? {} : (stryCov_9fa48("13603"), {
                    nodeId: this.nodeId,
                    replicaId,
                    error: mgErr.message
                  }));
                }
              }
            }
          }

          // Unregister from message router
          if (stryMutAct_9fa48("13605") ? false : stryMutAct_9fa48("13604") ? true : (stryCov_9fa48("13604", "13605"), messageRouter)) {
            if (stryMutAct_9fa48("13606")) {
              {}
            } else {
              stryCov_9fa48("13606");
              for (const [replicaId] of messageGroupServices) {
                if (stryMutAct_9fa48("13607")) {
                  {}
                } else {
                  stryCov_9fa48("13607");
                  const address = (stryMutAct_9fa48("13608") ? `` : (stryCov_9fa48("13608"), `${this.nodeId}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("13609") ? `` : (stryCov_9fa48("13609"), `${ENTITY_TYPE.MESSAGE_GROUP}`)) + (stryMutAct_9fa48("13610") ? `` : (stryCov_9fa48("13610"), `${ADDRESS.SEPARATOR}${replicaId}`));
                  messageRouter.unregister(address);
                }
              }
            }
          }
          logger.info(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_MESSAGE_GROUP_DONE, stryMutAct_9fa48("13611") ? {} : (stryCov_9fa48("13611"), {
            nodeId: this.nodeId
          }));
          return CLEANUP_RESULT.SUCCESS;
        }
      } catch (err) {
        if (stryMutAct_9fa48("13612")) {
          {}
        } else {
          stryCov_9fa48("13612");
          logger.warn(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_MESSAGE_GROUP_ERROR, stryMutAct_9fa48("13613") ? {} : (stryCov_9fa48("13613"), {
            nodeId: this.nodeId,
            error: err.message,
            stack: err.stack
          }));
          return CLEANUP_RESULT.ERROR;
        }
      }
    }
  }

  /**
   * Cleanup step: disconnect from seed node and stop
   * the message router.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupConnectingWebSocket() {
    if (stryMutAct_9fa48("13614")) {
      {}
    } else {
      stryCov_9fa48("13614");
      const logger = this.delegates.getLogger();
      const messageRouter = this.delegates.getMessageRouter();
      const transport = this.delegates.getTransport();
      try {
        if (stryMutAct_9fa48("13615")) {
          {}
        } else {
          stryCov_9fa48("13615");
          logger.info(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_WEBSOCKET, stryMutAct_9fa48("13616") ? {} : (stryCov_9fa48("13616"), {
            nodeId: this.nodeId,
            hasRouter: stryMutAct_9fa48("13617") ? !messageRouter : (stryCov_9fa48("13617"), !(stryMutAct_9fa48("13618") ? messageRouter : (stryCov_9fa48("13618"), !messageRouter)))
          }));
          this.delegates.stopJoiningLifecycleOwners();
          if (stryMutAct_9fa48("13621") ? messageRouter || messageRouter.shutdown : stryMutAct_9fa48("13620") ? false : stryMutAct_9fa48("13619") ? true : (stryCov_9fa48("13619", "13620", "13621"), messageRouter && messageRouter.shutdown)) {
            if (stryMutAct_9fa48("13622")) {
              {}
            } else {
              stryCov_9fa48("13622");
              await messageRouter.shutdown();
            }
          }
          if (stryMutAct_9fa48("13625") ? transport && transport.shutdown || transport !== messageRouter : stryMutAct_9fa48("13624") ? false : stryMutAct_9fa48("13623") ? true : (stryCov_9fa48("13623", "13624", "13625"), (stryMutAct_9fa48("13627") ? transport || transport.shutdown : stryMutAct_9fa48("13626") ? true : (stryCov_9fa48("13626", "13627"), transport && transport.shutdown)) && (stryMutAct_9fa48("13629") ? transport === messageRouter : stryMutAct_9fa48("13628") ? true : (stryCov_9fa48("13628", "13629"), transport !== messageRouter)))) {
            if (stryMutAct_9fa48("13630")) {
              {}
            } else {
              stryCov_9fa48("13630");
              await transport.shutdown();
            }
          }
          logger.info(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_WEBSOCKET_DONE, stryMutAct_9fa48("13631") ? {} : (stryCov_9fa48("13631"), {
            nodeId: this.nodeId
          }));
          return CLEANUP_RESULT.SUCCESS;
        }
      } catch (err) {
        if (stryMutAct_9fa48("13632")) {
          {}
        } else {
          stryCov_9fa48("13632");
          logger.warn(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_WEBSOCKET_ERROR, stryMutAct_9fa48("13633") ? {} : (stryCov_9fa48("13633"), {
            nodeId: this.nodeId,
            error: err.message,
            stack: err.stack
          }));
          return CLEANUP_RESULT.ERROR;
        }
      }
    }
  }

  /**
   * Clean up partially initialized services.
   * @return {Promise<void>}
   */
  async cleanup() {
    if (stryMutAct_9fa48("13634")) {
      {}
    } else {
      stryCov_9fa48("13634");
      const logger = this.delegates.getLogger();
      const messageGroupServices = this.delegates.getMessageGroupServices();
      const partitionServices = this.delegates.getPartitionServices();
      logger.info(JOINING_LOG_MSG.CLEANUP_START, stryMutAct_9fa48("13635") ? {} : (stryCov_9fa48("13635"), {
        nodeId: this.nodeId,
        messageGroupServices: messageGroupServices.size,
        partitionServices: partitionServices.size
      }));
      this.delegates.stopJoiningLifecycleOwners();
      const rebalanceCoordinator = this.delegates.getRebalanceCoordinator();
      if (stryMutAct_9fa48("13637") ? false : stryMutAct_9fa48("13636") ? true : (stryCov_9fa48("13636", "13637"), rebalanceCoordinator)) {
        if (stryMutAct_9fa48("13638")) {
          {}
        } else {
          stryCov_9fa48("13638");
          try {
            if (stryMutAct_9fa48("13639")) {
              {}
            } else {
              stryCov_9fa48("13639");
              await rebalanceCoordinator.shutdown();
            }
          } catch (error) {
            if (stryMutAct_9fa48("13640")) {
              {}
            } else {
              stryCov_9fa48("13640");
              logger.warn(JOINING_LOG_MSG.CLEANUP_STEP_FAILED, stryMutAct_9fa48("13641") ? {} : (stryCov_9fa48("13641"), {
                nodeId: this.nodeId,
                step: stryMutAct_9fa48("13642") ? "" : (stryCov_9fa48("13642"), 'rebalanceCoordinator.shutdown'),
                error: error.message
              }));
            }
          }
          this.delegates.setRebalanceCoordinator(null);
        }
      }
      const latencyTopology = this.delegates.getLatencyTopology();
      await LatencyTopologySetup.stop(latencyTopology);
      this.delegates.setLatencyTopology(null);

      // Shutdown replica state machine
      const replicaStateMachine = this.delegates.getReplicaStateMachine();
      if (stryMutAct_9fa48("13644") ? false : stryMutAct_9fa48("13643") ? true : (stryCov_9fa48("13643", "13644"), replicaStateMachine)) {
        if (stryMutAct_9fa48("13645")) {
          {}
        } else {
          stryCov_9fa48("13645");
          replicaStateMachine.stopTimeoutChecker();
          replicaStateMachine.clear();
          this.delegates.setReplicaStateMachine(null);
        }
      }

      // Shutdown RPC client to cancel pending requests
      const rpcClient = this.delegates.getRpcClient();
      if (stryMutAct_9fa48("13647") ? false : stryMutAct_9fa48("13646") ? true : (stryCov_9fa48("13646", "13647"), rpcClient)) {
        if (stryMutAct_9fa48("13648")) {
          {}
        } else {
          stryCov_9fa48("13648");
          await rpcClient.shutdown();
          this.delegates.setRpcClient(null);
        }
      }

      // Shutdown control plane services
      const heartbeatService = this.delegates.getHeartbeatService();
      if (stryMutAct_9fa48("13650") ? false : stryMutAct_9fa48("13649") ? true : (stryCov_9fa48("13649", "13650"), heartbeatService)) {
        if (stryMutAct_9fa48("13651")) {
          {}
        } else {
          stryCov_9fa48("13651");
          heartbeatService.stop();
          this.delegates.setHeartbeatService(null);
        }
      }
      const leaseService = this.delegates.getLeaseService();
      if (stryMutAct_9fa48("13653") ? false : stryMutAct_9fa48("13652") ? true : (stryCov_9fa48("13652", "13653"), leaseService)) {
        if (stryMutAct_9fa48("13654")) {
          {}
        } else {
          stryCov_9fa48("13654");
          leaseService.stop();
          this.delegates.setLeaseService(null);
        }
      }
      const endpointService = this.delegates.getEndpointService();
      if (stryMutAct_9fa48("13656") ? false : stryMutAct_9fa48("13655") ? true : (stryCov_9fa48("13655", "13656"), endpointService)) {
        if (stryMutAct_9fa48("13657")) {
          {}
        } else {
          stryCov_9fa48("13657");
          endpointService.stop();
          this.delegates.setEndpointService(null);
        }
      }
      const dispatchService = this.delegates.getDispatchService();
      if (stryMutAct_9fa48("13659") ? false : stryMutAct_9fa48("13658") ? true : (stryCov_9fa48("13658", "13659"), dispatchService)) {
        if (stryMutAct_9fa48("13660")) {
          {}
        } else {
          stryCov_9fa48("13660");
          dispatchService.stop();
          this.delegates.setDispatchService(null);
        }
      }

      // Shutdown replica handler
      const replicaHandler = this.delegates.getReplicaHandler();
      const messageRouter = this.delegates.getMessageRouter();
      if (stryMutAct_9fa48("13662") ? false : stryMutAct_9fa48("13661") ? true : (stryCov_9fa48("13661", "13662"), replicaHandler)) {
        if (stryMutAct_9fa48("13663")) {
          {}
        } else {
          stryCov_9fa48("13663");
          replicaHandler.unregisterFromRouter(messageRouter);
          await replicaHandler.shutdown();
          this.delegates.setReplicaHandler(null);
        }
      }

      // Shutdown partition services
      for (const [replicaId, partition] of partitionServices) {
        if (stryMutAct_9fa48("13664")) {
          {}
        } else {
          stryCov_9fa48("13664");
          try {
            if (stryMutAct_9fa48("13665")) {
              {}
            } else {
              stryCov_9fa48("13665");
              if (stryMutAct_9fa48("13667") ? false : stryMutAct_9fa48("13666") ? true : (stryCov_9fa48("13666", "13667"), partition.shutdown)) {
                if (stryMutAct_9fa48("13668")) {
                  {}
                } else {
                  stryCov_9fa48("13668");
                  await partition.shutdown();
                }
              }
              logger.debug(JOINING_LOG_MSG.PARTITION_CLEANED, stryMutAct_9fa48("13669") ? {} : (stryCov_9fa48("13669"), {
                replicaId
              }));
            }
          } catch (err) {
            if (stryMutAct_9fa48("13670")) {
              {}
            } else {
              stryCov_9fa48("13670");
              logger.warn(JOINING_LOG_MSG.PARTITION_CLEAN_FAILED, stryMutAct_9fa48("13671") ? {} : (stryCov_9fa48("13671"), {
                replicaId,
                error: err.message
              }));
              // Continue best-effort cleanup to avoid leaving services
              // running.
            }
          }
        }
      }
      partitionServices.clear();

      // Shutdown message group services
      for (const [replicaId, messageGroup] of messageGroupServices) {
        if (stryMutAct_9fa48("13672")) {
          {}
        } else {
          stryCov_9fa48("13672");
          try {
            if (stryMutAct_9fa48("13673")) {
              {}
            } else {
              stryCov_9fa48("13673");
              if (stryMutAct_9fa48("13675") ? false : stryMutAct_9fa48("13674") ? true : (stryCov_9fa48("13674", "13675"), messageGroup.shutdown)) {
                if (stryMutAct_9fa48("13676")) {
                  {}
                } else {
                  stryCov_9fa48("13676");
                  await messageGroup.shutdown();
                }
              }
              logger.debug(JOINING_LOG_MSG.MESSAGE_GROUP_CLEANED, stryMutAct_9fa48("13677") ? {} : (stryCov_9fa48("13677"), {
                replicaId
              }));
            }
          } catch (err) {
            if (stryMutAct_9fa48("13678")) {
              {}
            } else {
              stryCov_9fa48("13678");
              logger.warn(JOINING_LOG_MSG.MESSAGE_GROUP_CLEAN_FAILED, stryMutAct_9fa48("13679") ? {} : (stryCov_9fa48("13679"), {
                replicaId,
                error: err.message
              }));
              // Continue best-effort cleanup to avoid leaving services
              // running.
            }
          }
        }
      }
      messageGroupServices.clear();

      // Clear transport
      const transport = this.delegates.getTransport();
      if (stryMutAct_9fa48("13682") ? transport && transport.shutdown || transport !== messageRouter : stryMutAct_9fa48("13681") ? false : stryMutAct_9fa48("13680") ? true : (stryCov_9fa48("13680", "13681", "13682"), (stryMutAct_9fa48("13684") ? transport || transport.shutdown : stryMutAct_9fa48("13683") ? true : (stryCov_9fa48("13683", "13684"), transport && transport.shutdown)) && (stryMutAct_9fa48("13686") ? transport === messageRouter : stryMutAct_9fa48("13685") ? true : (stryCov_9fa48("13685", "13686"), transport !== messageRouter)))) {
        if (stryMutAct_9fa48("13687")) {
          {}
        } else {
          stryCov_9fa48("13687");
          await transport.shutdown();
        }
      }
      this.delegates.setTransport(null);

      // Clear messageRouter
      if (stryMutAct_9fa48("13689") ? false : stryMutAct_9fa48("13688") ? true : (stryCov_9fa48("13688", "13689"), messageRouter)) {
        if (stryMutAct_9fa48("13690")) {
          {}
        } else {
          stryCov_9fa48("13690");
          if (stryMutAct_9fa48("13692") ? false : stryMutAct_9fa48("13691") ? true : (stryCov_9fa48("13691", "13692"), messageRouter.shutdown)) {
            if (stryMutAct_9fa48("13693")) {
              {}
            } else {
              stryCov_9fa48("13693");
              await messageRouter.shutdown();
            }
          }
          this.delegates.setMessageRouter(null);
        }
      }
      this.delegates.setCdcIntegrationService(null);
      logger.info(JOINING_LOG_MSG.CLEANUP_COMPLETE, stryMutAct_9fa48("13694") ? {} : (stryCov_9fa48("13694"), {
        nodeId: this.nodeId
      }));
    }
  }
}
export { JoinCleanupHandler };