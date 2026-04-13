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
import { TYPEOF } from '../constants/index.js';
import { OperationLane } from './operation-lane.js';
import { WORKFLOW_ERROR_MSG } from './workflow-constants.js';
class WorkflowStepRunner {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("167285")) {
      {}
    } else {
      stryCov_9fa48("167285");
      this.workflowCoordinator = stryMutAct_9fa48("167288") ? options.workflowCoordinator && null : stryMutAct_9fa48("167287") ? false : stryMutAct_9fa48("167286") ? true : (stryCov_9fa48("167286", "167287", "167288"), options.workflowCoordinator || null);
      if (stryMutAct_9fa48("167291") ? (!this.workflowCoordinator || typeof this.workflowCoordinator.getWorkflowById !== TYPEOF.FUNCTION || typeof this.workflowCoordinator.transitionStep !== TYPEOF.FUNCTION) && typeof this.workflowCoordinator.updateWorkflow !== TYPEOF.FUNCTION : stryMutAct_9fa48("167290") ? false : stryMutAct_9fa48("167289") ? true : (stryCov_9fa48("167289", "167290", "167291"), (stryMutAct_9fa48("167293") ? (!this.workflowCoordinator || typeof this.workflowCoordinator.getWorkflowById !== TYPEOF.FUNCTION) && typeof this.workflowCoordinator.transitionStep !== TYPEOF.FUNCTION : stryMutAct_9fa48("167292") ? false : (stryCov_9fa48("167292", "167293"), (stryMutAct_9fa48("167295") ? !this.workflowCoordinator && typeof this.workflowCoordinator.getWorkflowById !== TYPEOF.FUNCTION : stryMutAct_9fa48("167294") ? false : (stryCov_9fa48("167294", "167295"), (stryMutAct_9fa48("167296") ? this.workflowCoordinator : (stryCov_9fa48("167296"), !this.workflowCoordinator)) || (stryMutAct_9fa48("167298") ? typeof this.workflowCoordinator.getWorkflowById === TYPEOF.FUNCTION : stryMutAct_9fa48("167297") ? false : (stryCov_9fa48("167297", "167298"), typeof this.workflowCoordinator.getWorkflowById !== TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("167300") ? typeof this.workflowCoordinator.transitionStep === TYPEOF.FUNCTION : stryMutAct_9fa48("167299") ? false : (stryCov_9fa48("167299", "167300"), typeof this.workflowCoordinator.transitionStep !== TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("167302") ? typeof this.workflowCoordinator.updateWorkflow === TYPEOF.FUNCTION : stryMutAct_9fa48("167301") ? false : (stryCov_9fa48("167301", "167302"), typeof this.workflowCoordinator.updateWorkflow !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("167303")) {
          {}
        } else {
          stryCov_9fa48("167303");
          throw new Error(WORKFLOW_ERROR_MSG.WORKFLOW_COORDINATOR_REQUIRED);
        }
      }
      this.operationLane = stryMutAct_9fa48("167306") ? options.operationLane && new OperationLane({
        name: options.name || 'workflow-step-runner',
        workflowCoordinator: this.workflowCoordinator,
        timeoutPolicy: options.timeoutPolicy || null,
        ownerKeyFactory: ({
          workflowId
        }) => {
          return this.workflowCoordinator.getWorkflowById(workflowId)?.ownerKey || '';
        }
      }) : stryMutAct_9fa48("167305") ? false : stryMutAct_9fa48("167304") ? true : (stryCov_9fa48("167304", "167305", "167306"), options.operationLane || new OperationLane(stryMutAct_9fa48("167307") ? {} : (stryCov_9fa48("167307"), {
        name: stryMutAct_9fa48("167310") ? options.name && 'workflow-step-runner' : stryMutAct_9fa48("167309") ? false : stryMutAct_9fa48("167308") ? true : (stryCov_9fa48("167308", "167309", "167310"), options.name || (stryMutAct_9fa48("167311") ? "" : (stryCov_9fa48("167311"), 'workflow-step-runner'))),
        workflowCoordinator: this.workflowCoordinator,
        timeoutPolicy: stryMutAct_9fa48("167314") ? options.timeoutPolicy && null : stryMutAct_9fa48("167313") ? false : stryMutAct_9fa48("167312") ? true : (stryCov_9fa48("167312", "167313", "167314"), options.timeoutPolicy || null),
        ownerKeyFactory: ({
          workflowId
        }) => {
          if (stryMutAct_9fa48("167315")) {
            {}
          } else {
            stryCov_9fa48("167315");
            return stryMutAct_9fa48("167318") ? this.workflowCoordinator.getWorkflowById(workflowId)?.ownerKey && '' : stryMutAct_9fa48("167317") ? false : stryMutAct_9fa48("167316") ? true : (stryCov_9fa48("167316", "167317", "167318"), (stryMutAct_9fa48("167319") ? this.workflowCoordinator.getWorkflowById(workflowId).ownerKey : (stryCov_9fa48("167319"), this.workflowCoordinator.getWorkflowById(workflowId)?.ownerKey)) || (stryMutAct_9fa48("167320") ? "Stryker was here!" : (stryCov_9fa48("167320"), '')));
          }
        }
      })));
      this.now = (stryMutAct_9fa48("167323") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("167322") ? false : stryMutAct_9fa48("167321") ? true : (stryCov_9fa48("167321", "167322", "167323"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("167324") ? () => undefined : (stryCov_9fa48("167324"), () => Date.now());
    }
  }

  /**
   * Run one workflow step through the canonical owner lane.
   * @param {Object} options
   * @return {Promise<*>}
   */
  async runStep(options = {}) {
    if (stryMutAct_9fa48("167325")) {
      {}
    } else {
      stryCov_9fa48("167325");
      const workflowId = String(stryMutAct_9fa48("167328") ? options.workflowId && '' : stryMutAct_9fa48("167327") ? false : stryMutAct_9fa48("167326") ? true : (stryCov_9fa48("167326", "167327", "167328"), options.workflowId || (stryMutAct_9fa48("167329") ? "Stryker was here!" : (stryCov_9fa48("167329"), ''))));
      if (stryMutAct_9fa48("167332") ? false : stryMutAct_9fa48("167331") ? true : stryMutAct_9fa48("167330") ? workflowId : (stryCov_9fa48("167330", "167331", "167332"), !workflowId)) {
        if (stryMutAct_9fa48("167333")) {
          {}
        } else {
          stryCov_9fa48("167333");
          throw new Error(WORKFLOW_ERROR_MSG.WORKFLOW_ID_REQUIRED);
        }
      }
      const initialWorkflow = this.workflowCoordinator.getWorkflowById(workflowId);
      if (stryMutAct_9fa48("167336") ? false : stryMutAct_9fa48("167335") ? true : stryMutAct_9fa48("167334") ? initialWorkflow : (stryCov_9fa48("167334", "167335", "167336"), !initialWorkflow)) {
        if (stryMutAct_9fa48("167337")) {
          {}
        } else {
          stryCov_9fa48("167337");
          throw new Error(WORKFLOW_ERROR_MSG.workflowNotFound(workflowId));
        }
      }
      const ownerKey = String(stryMutAct_9fa48("167340") ? (options.ownerKey || initialWorkflow.ownerKey) && '' : stryMutAct_9fa48("167339") ? false : stryMutAct_9fa48("167338") ? true : (stryCov_9fa48("167338", "167339", "167340"), (stryMutAct_9fa48("167342") ? options.ownerKey && initialWorkflow.ownerKey : stryMutAct_9fa48("167341") ? false : (stryCov_9fa48("167341", "167342"), options.ownerKey || initialWorkflow.ownerKey)) || (stryMutAct_9fa48("167343") ? "Stryker was here!" : (stryCov_9fa48("167343"), ''))));
      return this.operationLane.run(stryMutAct_9fa48("167344") ? {} : (stryCov_9fa48("167344"), {
        ...options,
        workflowId,
        ownerKey
      }), async ({
        timeoutBudget
      }) => {
        if (stryMutAct_9fa48("167345")) {
          {}
        } else {
          stryCov_9fa48("167345");
          const workflow = this.workflowCoordinator.getWorkflowById(workflowId);
          if (stryMutAct_9fa48("167348") ? false : stryMutAct_9fa48("167347") ? true : stryMutAct_9fa48("167346") ? workflow : (stryCov_9fa48("167346", "167347", "167348"), !workflow)) {
            if (stryMutAct_9fa48("167349")) {
              {}
            } else {
              stryCov_9fa48("167349");
              throw new Error(WORKFLOW_ERROR_MSG.workflowNotFound(workflowId));
            }
          }
          try {
            if (stryMutAct_9fa48("167350")) {
              {}
            } else {
              stryCov_9fa48("167350");
              const stepResult = await options.execute(stryMutAct_9fa48("167351") ? {} : (stryCov_9fa48("167351"), {
                workflow,
                ownerKey,
                stepName: stryMutAct_9fa48("167354") ? options.stepName && null : stryMutAct_9fa48("167353") ? false : stryMutAct_9fa48("167352") ? true : (stryCov_9fa48("167352", "167353", "167354"), options.stepName || null),
                timeoutBudget
              }));
              await this.persistStepResult(workflowId, stepResult);
              return (stryMutAct_9fa48("167357") ? stepResult || Object.prototype.hasOwnProperty.call(stepResult, 'result') : stryMutAct_9fa48("167356") ? false : stryMutAct_9fa48("167355") ? true : (stryCov_9fa48("167355", "167356", "167357"), stepResult && Object.prototype.hasOwnProperty.call(stepResult, stryMutAct_9fa48("167358") ? "" : (stryCov_9fa48("167358"), 'result')))) ? stepResult.result : stepResult;
            }
          } catch (error) {
            if (stryMutAct_9fa48("167359")) {
              {}
            } else {
              stryCov_9fa48("167359");
              error.workflowStepContext = Object.freeze(stryMutAct_9fa48("167360") ? {} : (stryCov_9fa48("167360"), {
                workflowId,
                ownerKey,
                stepName: stryMutAct_9fa48("167363") ? options.stepName && null : stryMutAct_9fa48("167362") ? false : stryMutAct_9fa48("167361") ? true : (stryCov_9fa48("167361", "167362", "167363"), options.stepName || null),
                observedAt: this.now()
              }));
              if (stryMutAct_9fa48("167366") ? typeof options.onError !== TYPEOF.FUNCTION : stryMutAct_9fa48("167365") ? false : stryMutAct_9fa48("167364") ? true : (stryCov_9fa48("167364", "167365", "167366"), typeof options.onError === TYPEOF.FUNCTION)) {
                if (stryMutAct_9fa48("167367")) {
                  {}
                } else {
                  stryCov_9fa48("167367");
                  return options.onError(stryMutAct_9fa48("167368") ? {} : (stryCov_9fa48("167368"), {
                    error,
                    ownerKey,
                    stepName: stryMutAct_9fa48("167371") ? options.stepName && null : stryMutAct_9fa48("167370") ? false : stryMutAct_9fa48("167369") ? true : (stryCov_9fa48("167369", "167370", "167371"), options.stepName || null),
                    timeoutBudget,
                    workflow
                  }));
                }
              }
              throw error;
            }
          }
        }
      });
    }
  }

  /**
   * Persist one step result.
   * @param {string} workflowId
   * @param {*|Object} stepResult
   * @return {Promise<void>}
   * @private
   */
  async persistStepResult(workflowId, stepResult) {
    if (stryMutAct_9fa48("167372")) {
      {}
    } else {
      stryCov_9fa48("167372");
      if (stryMutAct_9fa48("167375") ? !stepResult && typeof stepResult !== TYPEOF.OBJECT : stryMutAct_9fa48("167374") ? false : stryMutAct_9fa48("167373") ? true : (stryCov_9fa48("167373", "167374", "167375"), (stryMutAct_9fa48("167376") ? stepResult : (stryCov_9fa48("167376"), !stepResult)) || (stryMutAct_9fa48("167378") ? typeof stepResult === TYPEOF.OBJECT : stryMutAct_9fa48("167377") ? false : (stryCov_9fa48("167377", "167378"), typeof stepResult !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("167379")) {
          {}
        } else {
          stryCov_9fa48("167379");
          return;
        }
      }
      if (stryMutAct_9fa48("167382") ? stepResult.nextStep || stepResult.reason : stryMutAct_9fa48("167381") ? false : stryMutAct_9fa48("167380") ? true : (stryCov_9fa48("167380", "167381", "167382"), stepResult.nextStep && stepResult.reason)) {
        if (stryMutAct_9fa48("167383")) {
          {}
        } else {
          stryCov_9fa48("167383");
          await this.workflowCoordinator.transitionStep(workflowId, stryMutAct_9fa48("167384") ? {} : (stryCov_9fa48("167384"), {
            nextStep: stepResult.nextStep,
            reason: stepResult.reason,
            metadata: stepResult.transitionMetadata,
            fenceToken: stepResult.fenceToken
          }), stryMutAct_9fa48("167387") ? stepResult.updates && {} : stryMutAct_9fa48("167386") ? false : stryMutAct_9fa48("167385") ? true : (stryCov_9fa48("167385", "167386", "167387"), stepResult.updates || {}));
          return;
        }
      }
      if (stryMutAct_9fa48("167390") ? stepResult.updates || typeof stepResult.updates === TYPEOF.OBJECT : stryMutAct_9fa48("167389") ? false : stryMutAct_9fa48("167388") ? true : (stryCov_9fa48("167388", "167389", "167390"), stepResult.updates && (stryMutAct_9fa48("167392") ? typeof stepResult.updates !== TYPEOF.OBJECT : stryMutAct_9fa48("167391") ? true : (stryCov_9fa48("167391", "167392"), typeof stepResult.updates === TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("167393")) {
          {}
        } else {
          stryCov_9fa48("167393");
          await this.workflowCoordinator.updateWorkflow(workflowId, stepResult.updates);
        }
      }
    }
  }
}
export { WorkflowStepRunner };