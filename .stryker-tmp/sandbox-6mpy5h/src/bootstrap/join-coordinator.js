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
import { JOIN_SESSION_ERROR, JoinSessionStore } from './join-session-store.js';

/**
 * JoinCoordinator executes checkpointed join steps idempotently.
 */
class JoinCoordinator {
  constructor(options = {}) {
    if (stryMutAct_9fa48("13695")) {
      {}
    } else {
      stryCov_9fa48("13695");
      this.joinSessionStore = options.joinSessionStore instanceof JoinSessionStore ? options.joinSessionStore : new JoinSessionStore();
    }
  }

  /**
   * Run join steps with durable checkpointing.
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {string} options.sessionId
   * @param {Array<Object>} options.steps
   * @return {Promise<Object>}
   */
  async run(options = {}) {
    if (stryMutAct_9fa48("13696")) {
      {}
    } else {
      stryCov_9fa48("13696");
      const steps = Array.isArray(options.steps) ? options.steps : stryMutAct_9fa48("13697") ? ["Stryker was here"] : (stryCov_9fa48("13697"), []);
      let session = await this.joinSessionStore.createOrLoadSession(stryMutAct_9fa48("13698") ? {} : (stryCov_9fa48("13698"), {
        nodeId: options.nodeId,
        sessionId: options.sessionId
      }));
      for (const step of steps) {
        if (stryMutAct_9fa48("13699")) {
          {}
        } else {
          stryCov_9fa48("13699");
          this.assertValidStep(step);
          const checkpointSatisfied = this.joinSessionStore.isCheckpointSatisfied(session.checkpoint, step.checkpoint);
          const shouldRerun = stryMutAct_9fa48("13702") ? checkpointSatisfied && typeof step.shouldRerun === 'function' || step.shouldRerun(session) === true : stryMutAct_9fa48("13701") ? false : stryMutAct_9fa48("13700") ? true : (stryCov_9fa48("13700", "13701", "13702"), (stryMutAct_9fa48("13704") ? checkpointSatisfied || typeof step.shouldRerun === 'function' : stryMutAct_9fa48("13703") ? true : (stryCov_9fa48("13703", "13704"), checkpointSatisfied && (stryMutAct_9fa48("13706") ? typeof step.shouldRerun !== 'function' : stryMutAct_9fa48("13705") ? true : (stryCov_9fa48("13705", "13706"), typeof step.shouldRerun === (stryMutAct_9fa48("13707") ? "" : (stryCov_9fa48("13707"), 'function')))))) && (stryMutAct_9fa48("13709") ? step.shouldRerun(session) !== true : stryMutAct_9fa48("13708") ? true : (stryCov_9fa48("13708", "13709"), step.shouldRerun(session) === (stryMutAct_9fa48("13710") ? false : (stryCov_9fa48("13710"), true)))));
          if (stryMutAct_9fa48("13713") ? checkpointSatisfied || !shouldRerun : stryMutAct_9fa48("13712") ? false : stryMutAct_9fa48("13711") ? true : (stryCov_9fa48("13711", "13712", "13713"), checkpointSatisfied && (stryMutAct_9fa48("13714") ? shouldRerun : (stryCov_9fa48("13714"), !shouldRerun)))) {
            if (stryMutAct_9fa48("13715")) {
              {}
            } else {
              stryCov_9fa48("13715");
              continue;
            }
          }
          const rerunningSatisfiedStep = stryMutAct_9fa48("13718") ? checkpointSatisfied || shouldRerun : stryMutAct_9fa48("13717") ? false : stryMutAct_9fa48("13716") ? true : (stryCov_9fa48("13716", "13717", "13718"), checkpointSatisfied && shouldRerun);
          try {
            if (stryMutAct_9fa48("13719")) {
              {}
            } else {
              stryCov_9fa48("13719");
              await step.run(session);
            }
          } catch (error) {
            if (stryMutAct_9fa48("13720")) {
              {}
            } else {
              stryCov_9fa48("13720");
              session = await this.joinSessionStore.recordFailure(stryMutAct_9fa48("13721") ? {} : (stryCov_9fa48("13721"), {
                nodeId: options.nodeId,
                sessionId: options.sessionId,
                phase: step.phase,
                errorCode: this.extractErrorCode(error),
                retryAfterMs: stryMutAct_9fa48("13722") ? error.retryAfterMs : (stryCov_9fa48("13722"), error?.retryAfterMs),
                retryable: stryMutAct_9fa48("13725") ? error?.retryable === false : stryMutAct_9fa48("13724") ? false : stryMutAct_9fa48("13723") ? true : (stryCov_9fa48("13723", "13724", "13725"), (stryMutAct_9fa48("13726") ? error.retryable : (stryCov_9fa48("13726"), error?.retryable)) !== (stryMutAct_9fa48("13727") ? true : (stryCov_9fa48("13727"), false)))
              }));
              throw error;
            }
          }
          if (stryMutAct_9fa48("13730") ? rerunningSatisfiedStep || this.joinSessionStore.getCheckpointIndex(step.checkpoint) < this.joinSessionStore.getCheckpointIndex(session.checkpoint) : stryMutAct_9fa48("13729") ? false : stryMutAct_9fa48("13728") ? true : (stryCov_9fa48("13728", "13729", "13730"), rerunningSatisfiedStep && (stryMutAct_9fa48("13733") ? this.joinSessionStore.getCheckpointIndex(step.checkpoint) >= this.joinSessionStore.getCheckpointIndex(session.checkpoint) : stryMutAct_9fa48("13732") ? this.joinSessionStore.getCheckpointIndex(step.checkpoint) <= this.joinSessionStore.getCheckpointIndex(session.checkpoint) : stryMutAct_9fa48("13731") ? true : (stryCov_9fa48("13731", "13732", "13733"), this.joinSessionStore.getCheckpointIndex(step.checkpoint) < this.joinSessionStore.getCheckpointIndex(session.checkpoint))))) {
            if (stryMutAct_9fa48("13734")) {
              {}
            } else {
              stryCov_9fa48("13734");
              continue;
            }
          }
          session = await this.joinSessionStore.advanceCheckpoint(stryMutAct_9fa48("13735") ? {} : (stryCov_9fa48("13735"), {
            nodeId: options.nodeId,
            sessionId: options.sessionId,
            checkpoint: step.checkpoint,
            phase: step.phase
          }));
        }
      }
      return session;
    }
  }
  assertValidStep(step) {
    if (stryMutAct_9fa48("13736")) {
      {}
    } else {
      stryCov_9fa48("13736");
      if (stryMutAct_9fa48("13739") ? !step && typeof step !== 'object' : stryMutAct_9fa48("13738") ? false : stryMutAct_9fa48("13737") ? true : (stryCov_9fa48("13737", "13738", "13739"), (stryMutAct_9fa48("13740") ? step : (stryCov_9fa48("13740"), !step)) || (stryMutAct_9fa48("13742") ? typeof step === 'object' : stryMutAct_9fa48("13741") ? false : (stryCov_9fa48("13741", "13742"), typeof step !== (stryMutAct_9fa48("13743") ? "" : (stryCov_9fa48("13743"), 'object')))))) {
        if (stryMutAct_9fa48("13744")) {
          {}
        } else {
          stryCov_9fa48("13744");
          throw new Error(stryMutAct_9fa48("13745") ? "" : (stryCov_9fa48("13745"), 'join step must be an object'));
        }
      }
      if (stryMutAct_9fa48("13748") ? typeof step.run === 'function' : stryMutAct_9fa48("13747") ? false : stryMutAct_9fa48("13746") ? true : (stryCov_9fa48("13746", "13747", "13748"), typeof step.run !== (stryMutAct_9fa48("13749") ? "" : (stryCov_9fa48("13749"), 'function')))) {
        if (stryMutAct_9fa48("13750")) {
          {}
        } else {
          stryCov_9fa48("13750");
          throw new Error(stryMutAct_9fa48("13751") ? "" : (stryCov_9fa48("13751"), 'join step run must be a function'));
        }
      }
      if (stryMutAct_9fa48("13754") ? step.shouldRerun !== undefined || typeof step.shouldRerun !== 'function' : stryMutAct_9fa48("13753") ? false : stryMutAct_9fa48("13752") ? true : (stryCov_9fa48("13752", "13753", "13754"), (stryMutAct_9fa48("13756") ? step.shouldRerun === undefined : stryMutAct_9fa48("13755") ? true : (stryCov_9fa48("13755", "13756"), step.shouldRerun !== undefined)) && (stryMutAct_9fa48("13758") ? typeof step.shouldRerun === 'function' : stryMutAct_9fa48("13757") ? true : (stryCov_9fa48("13757", "13758"), typeof step.shouldRerun !== (stryMutAct_9fa48("13759") ? "" : (stryCov_9fa48("13759"), 'function')))))) {
        if (stryMutAct_9fa48("13760")) {
          {}
        } else {
          stryCov_9fa48("13760");
          throw new Error(stryMutAct_9fa48("13761") ? "" : (stryCov_9fa48("13761"), 'join step shouldRerun must be a function'));
        }
      }
      if (stryMutAct_9fa48("13764") ? typeof step.checkpoint !== 'string' && step.checkpoint.length === 0 : stryMutAct_9fa48("13763") ? false : stryMutAct_9fa48("13762") ? true : (stryCov_9fa48("13762", "13763", "13764"), (stryMutAct_9fa48("13766") ? typeof step.checkpoint === 'string' : stryMutAct_9fa48("13765") ? false : (stryCov_9fa48("13765", "13766"), typeof step.checkpoint !== (stryMutAct_9fa48("13767") ? "" : (stryCov_9fa48("13767"), 'string')))) || (stryMutAct_9fa48("13769") ? step.checkpoint.length !== 0 : stryMutAct_9fa48("13768") ? false : (stryCov_9fa48("13768", "13769"), step.checkpoint.length === 0)))) {
        if (stryMutAct_9fa48("13770")) {
          {}
        } else {
          stryCov_9fa48("13770");
          throw new Error(JOIN_SESSION_ERROR.INVALID_CHECKPOINT);
        }
      }
    }
  }
  extractErrorCode(error) {
    if (stryMutAct_9fa48("13771")) {
      {}
    } else {
      stryCov_9fa48("13771");
      if (stryMutAct_9fa48("13774") ? typeof error?.code === 'string' || error.code.length > 0 : stryMutAct_9fa48("13773") ? false : stryMutAct_9fa48("13772") ? true : (stryCov_9fa48("13772", "13773", "13774"), (stryMutAct_9fa48("13776") ? typeof error?.code !== 'string' : stryMutAct_9fa48("13775") ? true : (stryCov_9fa48("13775", "13776"), typeof (stryMutAct_9fa48("13777") ? error.code : (stryCov_9fa48("13777"), error?.code)) === (stryMutAct_9fa48("13778") ? "" : (stryCov_9fa48("13778"), 'string')))) && (stryMutAct_9fa48("13781") ? error.code.length <= 0 : stryMutAct_9fa48("13780") ? error.code.length >= 0 : stryMutAct_9fa48("13779") ? true : (stryCov_9fa48("13779", "13780", "13781"), error.code.length > 0)))) {
        if (stryMutAct_9fa48("13782")) {
          {}
        } else {
          stryCov_9fa48("13782");
          return error.code;
        }
      }
      if (stryMutAct_9fa48("13785") ? typeof error?.message === 'string' || error.message.length > 0 : stryMutAct_9fa48("13784") ? false : stryMutAct_9fa48("13783") ? true : (stryCov_9fa48("13783", "13784", "13785"), (stryMutAct_9fa48("13787") ? typeof error?.message !== 'string' : stryMutAct_9fa48("13786") ? true : (stryCov_9fa48("13786", "13787"), typeof (stryMutAct_9fa48("13788") ? error.message : (stryCov_9fa48("13788"), error?.message)) === (stryMutAct_9fa48("13789") ? "" : (stryCov_9fa48("13789"), 'string')))) && (stryMutAct_9fa48("13792") ? error.message.length <= 0 : stryMutAct_9fa48("13791") ? error.message.length >= 0 : stryMutAct_9fa48("13790") ? true : (stryCov_9fa48("13790", "13791", "13792"), error.message.length > 0)))) {
        if (stryMutAct_9fa48("13793")) {
          {}
        } else {
          stryCov_9fa48("13793");
          return error.message;
        }
      }
      return stryMutAct_9fa48("13794") ? "" : (stryCov_9fa48("13794"), 'JOIN_COORDINATOR_STEP_FAILED');
    }
  }
}
export { JoinCoordinator };