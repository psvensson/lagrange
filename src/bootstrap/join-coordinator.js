import {JOIN_SESSION_ERROR, JoinSessionStore} from './join-session-store.js';

/**
 * JoinCoordinator executes checkpointed join steps idempotently.
 */
class JoinCoordinator {
  constructor(options = {}) {
    this.joinSessionStore = options.joinSessionStore instanceof JoinSessionStore ?
      options.joinSessionStore :
      new JoinSessionStore();
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
    let session = await this.joinSessionStore.createOrLoadSession({
      nodeId: options.nodeId,
      sessionId: options.sessionId,
    });

    for (const step of steps) {
      this.assertValidStep(step);

      if (this.joinSessionStore.isCheckpointSatisfied(
        session.checkpoint,
        step.checkpoint,
      )) {
        continue;
      }

      try {
        await step.run(session);
      } catch (error) {
        session = await this.joinSessionStore.recordFailure({
          nodeId: options.nodeId,
          sessionId: options.sessionId,
          phase: step.phase,
          errorCode: this.extractErrorCode(error),
          retryAfterMs: error?.retryAfterMs,
          retryable: error?.retryable !== false,
        });
        throw error;
      }

      session = await this.joinSessionStore.advanceCheckpoint({
        nodeId: options.nodeId,
        sessionId: options.sessionId,
        checkpoint: step.checkpoint,
        phase: step.phase,
      });
    }

    return session;
  }

  assertValidStep(step) {
    if (!step || typeof step !== 'object') {
      throw new Error('join step must be an object');
    }
    if (typeof step.run !== 'function') {
      throw new Error('join step run must be a function');
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
