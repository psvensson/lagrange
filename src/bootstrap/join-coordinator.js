import {JOIN_SESSION_ERROR, JoinSessionStore} from './join-session-store.js';
import {StartupPipelineRunner} from './pipeline/startup-pipeline-runner.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_1UXGP = 'join step must be an object';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_UBGC0 = 'join step run must be a function';
const LOCAL_STR_15XRI = 'join step shouldRerun must be a function';
const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_FTIWW = 'JOIN_COORDINATOR_STEP_FAILED';

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
      throw new Error(LOCAL_STR_1UXGP);
    }
    if (typeof step.run !== LOCAL_STR_FUNCTION) {
      throw new Error(LOCAL_STR_UBGC0);
    }
    if (step.shouldRerun !== undefined &&
        typeof step.shouldRerun !== LOCAL_STR_FUNCTION) {
      throw new Error(LOCAL_STR_15XRI);
    }
    if (typeof step.checkpoint !== LOCAL_STR_STRING || step.checkpoint.length === LOCAL_NUM_ZERO) {
      throw new Error(JOIN_SESSION_ERROR.INVALID_CHECKPOINT);
    }
  }

  extractErrorCode(error) {
    if (typeof error?.code === LOCAL_STR_STRING && error.code.length > LOCAL_NUM_ZERO) {
      return error.code;
    }
    if (typeof error?.message === LOCAL_STR_STRING && error.message.length > LOCAL_NUM_ZERO) {
      return error.message;
    }
    return LOCAL_STR_FTIWW;
  }
}

export {JoinCoordinator};
