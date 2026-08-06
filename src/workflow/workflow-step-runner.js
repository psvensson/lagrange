import {OperationLane} from './operation-lane.js';
import {WORKFLOW_ERROR_MSG} from './workflow-constants.js';

const LOCAL_STR_WORKFLOW_STEP_RUNNER = 'workflow-step-runner';
const LOCAL_STR_RESULT = 'result';

class WorkflowStepRunner {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    this.workflowCoordinator = options.workflowCoordinator || null;
    if (!this.workflowCoordinator ||
        typeof this.workflowCoordinator.getWorkflowById !== 'function' ||
        typeof this.workflowCoordinator.transitionStep !== 'function' ||
        typeof this.workflowCoordinator.updateWorkflow !== 'function') {
      throw new Error(WORKFLOW_ERROR_MSG.WORKFLOW_COORDINATOR_REQUIRED);
    }
    this.operationLane = options.operationLane ||
      new OperationLane({
        name: options.name || LOCAL_STR_WORKFLOW_STEP_RUNNER,
        workflowCoordinator: this.workflowCoordinator,
        timeoutPolicy: options.timeoutPolicy || null,
        ownerKeyFactory: ({workflowId}) => {
          return this.workflowCoordinator.getWorkflowById(workflowId)?.ownerKey ||
            '';
        },
      });
    this.now = typeof options.now === 'function' ?
      options.now :
      () => Date.now();
  }

  /**
   * Run one workflow step through the canonical owner lane.
   * @param {Object} options
   * @return {Promise<*>}
   */
  async runStep(options = {}) {
    const workflowId = String(options.workflowId || '');
    if (!workflowId) {
      throw new Error(WORKFLOW_ERROR_MSG.WORKFLOW_ID_REQUIRED);
    }

    const initialWorkflow = this.workflowCoordinator.getWorkflowById(workflowId);
    if (!initialWorkflow) {
      throw new Error(WORKFLOW_ERROR_MSG.workflowNotFound(workflowId));
    }

    const ownerKey = String(options.ownerKey || initialWorkflow.ownerKey || '');

    return this.operationLane.run(
      {
        ...options,
        workflowId,
        ownerKey,
      },
      async ({timeoutBudget}) => {
        const workflow = this.workflowCoordinator.getWorkflowById(workflowId);
        if (!workflow) {
          throw new Error(WORKFLOW_ERROR_MSG.workflowNotFound(workflowId));
        }

        try {
          const stepResult = await options.execute({
            workflow,
            ownerKey,
            stepName: options.stepName || null,
            timeoutBudget,
          });
          await this.persistStepResult(workflowId, stepResult);
          return stepResult &&
            Object.prototype.hasOwnProperty.call(stepResult, LOCAL_STR_RESULT) ?
            stepResult.result :
            stepResult;
        } catch (error) {
          error.workflowStepContext = Object.freeze({
            workflowId,
            ownerKey,
            stepName: options.stepName || null,
            observedAt: this.now(),
          });
          if (typeof options.onError === 'function') {
            return options.onError({
              error,
              ownerKey,
              stepName: options.stepName || null,
              timeoutBudget,
              workflow,
            });
          }
          throw error;
        }
      },
    );
  }

  /**
   * Persist one step result.
   * @param {string} workflowId
   * @param {*|Object} stepResult
   * @return {Promise<void>}
   * @private
   */
  async persistStepResult(workflowId, stepResult) {
    if (!stepResult || typeof stepResult !== 'object') {
      return;
    }

    if (stepResult.nextStep && stepResult.reason) {
      await this.workflowCoordinator.transitionStep(
        workflowId,
        {
          nextStep: stepResult.nextStep,
          reason: stepResult.reason,
          metadata: stepResult.transitionMetadata,
          fenceToken: stepResult.fenceToken,
          ownerId: stepResult.ownerId,
        },
        stepResult.updates || {},
      );
      return;
    }

    if (stepResult.updates &&
        typeof stepResult.updates === 'object') {
      await this.workflowCoordinator.updateWorkflow(
        workflowId,
        stepResult.updates,
      );
    }
  }
}

export {WorkflowStepRunner};
