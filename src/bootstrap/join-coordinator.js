import {JOIN_SESSION_ERROR, JoinSessionStore} from './join-session-store.js';
import {StartupPipelineRunner} from './pipeline/startup-pipeline-runner.js';

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
    if (!step || typeof step !== 'object') {
      throw new Error('join step must be an object');
    }
    if (typeof step.run !== 'function') {
      throw new Error('join step run must be a function');
    }
    if (step.shouldRerun !== undefined &&
        typeof step.shouldRerun !== 'function') {
      throw new Error('join step shouldRerun must be a function');
    }
    if (typeof step.checkpoint !== 'string' || step.checkpoint.length === 0) {
      throw new Error(JOIN_SESSION_ERROR.INVALID_CHECKPOINT);
    }
  }

  extractErrorCode(error) {
    if (typeof error?.code === 'string' && error.code.length > 0) {
      return error.code;
    }
    if (typeof error?.message === 'string' && error.message.length > 0) {
      return error.message;
    }
    return 'JOIN_COORDINATOR_STEP_FAILED';
  }
}

export {JoinCoordinator};
