import {JOIN_SESSION_ERROR, JoinSessionStore} from './join-session-store.js';
import {StartupPipelineRunner} from './pipeline/startup-pipeline-runner.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_JOIN_STEP_MUST_BE_AN_OBJECT = 'join step must be an object';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_JOIN_STEP_RUN_MUST_BE_A_FUNCTION = 'join step run must be a function';
const LOCAL_STR_JOIN_STEP_SHOULDRERUN_MUST_BE_A_FUNCTION = 'join step shouldRerun must be a function';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_JOIN_COORDINATOR_STEP_FAILED = 'JOIN_COORDINATOR_STEP_FAILED';

/**
 * JoinCoordinator executes checkpointed join steps idempotently.
 */
class JoinCoordinator {
  constructor(options = {}) {
    this.joinSessionStore = options.joinSessionStore instanceof JoinSessionStore ?
      options.joinSessionStore :
      new JoinSessionStore();
    this.workflowRunner =
      options.workflowRunner instanceof StartupPipelineRunner ?
        options.workflowRunner :
        new StartupPipelineRunner({
          logger: options.logger,
          eventSink: options.eventSink || null,
        });
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
    const steps = Array.isArray(options.steps) ? options.steps : [];
    for (const step of steps) {
      this.assertValidStep(step);
    }
    const result = await this.workflowRunner.runWorkflow({
      nodeId: options.nodeId,
      sessionId: options.sessionId,
      allowResumeLatest: options.allowResumeLatest === true,
      planVersion: options.planVersion,
      sessionStore: this.joinSessionStore,
      steps,
      extractErrorCode: (error) => this.extractErrorCode(error),
      isRetryableFailure: (error) => error?.retryable !== false,
    });
    return result.session;
  }

  assertValidStep(step) {
    if (!step || typeof step !== LOCAL_STR_OBJECT) {
      throw new Error(LOCAL_STR_JOIN_STEP_MUST_BE_AN_OBJECT);
    }
    if (typeof step.run !== LOCAL_STR_FUNCTION) {
      throw new Error(LOCAL_STR_JOIN_STEP_RUN_MUST_BE_A_FUNCTION);
    }
    if (step.shouldRerun !== undefined &&
        typeof step.shouldRerun !== LOCAL_STR_FUNCTION) {
      throw new Error(LOCAL_STR_JOIN_STEP_SHOULDRERUN_MUST_BE_A_FUNCTION);
    }
    if (typeof step.checkpoint !== LOCAL_STR_STRING || step.checkpoint.length === 0) {
      throw new Error(JOIN_SESSION_ERROR.INVALID_CHECKPOINT);
    }
  }

  extractErrorCode(error) {
    if (typeof error?.code === LOCAL_STR_STRING && error.code.length > 0) {
      return error.code;
    }
    if (typeof error?.message === LOCAL_STR_STRING && error.message.length > 0) {
      return error.message;
    }
    return LOCAL_STR_JOIN_COORDINATOR_STEP_FAILED;
  }
}

export {JoinCoordinator};
