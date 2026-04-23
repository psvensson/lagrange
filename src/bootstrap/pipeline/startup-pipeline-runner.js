/**
 * Shared startup pipeline runner for seed bootstrap and node join.
 *
 * Cleanup is NOT managed by this runner. Cleanup ownership belongs to
 * dedicated handler modules (SeedCleanupHandler, JoinCleanupHandler)
 * that are invoked by the orchestrator's error handling path. This
 * ensures exactly one active cleanup execution path per flow (D3.2).
 */

const STARTUP_PIPELINE_EVENT = Object.freeze({
  PHASE_START: 'phaseStart',
  PHASE_COMPLETE: 'phaseComplete',
  PHASE_FAILED: 'phaseFailed',
  CHECKPOINT_START: 'checkpointStart',
  CHECKPOINT_COMPLETE: 'checkpointComplete',
  CHECKPOINT_SKIPPED: 'checkpointSkipped',
  CHECKPOINT_FAILED: 'checkpointFailed',
});

const STARTUP_WORKFLOW_DEFAULT_ERROR_CODE = 'STARTUP_WORKFLOW_STEP_FAILED';

function validateWorkflowSessionStore(sessionStore) {
  const hasSessionStore =
    sessionStore &&
    typeof sessionStore.createOrLoadSession === 'function' &&
    typeof sessionStore.advanceCheckpoint === 'function' &&
    typeof sessionStore.recordFailure === 'function';
  if (!hasSessionStore) {
    throw new Error('startup workflow requires a durable session store');
  }
}

function defaultExtractErrorCode(error) {
  if (typeof error?.code === 'string' && error.code.length > 0) {
    return error.code;
  }
  if (typeof error?.message === 'string' && error.message.length > 0) {
    return error.message;
  }
  return STARTUP_WORKFLOW_DEFAULT_ERROR_CODE;
}

function defaultIsRetryableFailure(error) {
  return error?.retryable !== false;
}

class StartupPipelineRunner {
  /**
   * @param {Object} options
   * @param {Object} [options.logger]
   * @param {Object} [options.eventSink] - Optional EventEmitter-like sink.
   */
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.eventSink = options.eventSink || null;
  }

  /**
   * Run ordered startup phases. On failure the error propagates to
   * the caller which owns cleanup orchestration through the
   * canonical handler (SeedCleanupHandler / JoinCleanupHandler).
   * @param {Object} options
   * @param {Array<{name: string, run: Function}>} options.phases
   * @return {Promise<{completedPhases: string[]}>}
   */
  async run(options = {}) {
    const phases = Array.isArray(options.phases) ? options.phases : [];
    const completedPhases = [];

    for (const phase of phases) {
      this.emit(STARTUP_PIPELINE_EVENT.PHASE_START, {
        phase: phase.name,
      });

      try {
        await phase.run();
        completedPhases.push(phase.name);
        this.emit(STARTUP_PIPELINE_EVENT.PHASE_COMPLETE, {
          phase: phase.name,
        });
      } catch (error) {
        this.emit(STARTUP_PIPELINE_EVENT.PHASE_FAILED, {
          phase: phase.name,
          error: error.message,
        });

        throw error;
      }
    }

    return {
      completedPhases,
    };
  }

  /**
   * Run ordered startup checkpoints against one durable workflow store.
   * Cleanup remains caller-owned, but retryability, terminal outcomes, and
   * checkpoint advancement are normalized here.
   *
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {string} options.sessionId
   * @param {boolean} [options.allowResumeLatest]
   * @param {string} [options.planVersion]
   * @param {Object} options.sessionStore
   * @param {Array<Object>} options.steps
   * @param {Function} [options.extractErrorCode]
   * @param {Function} [options.isRetryableFailure]
   * @return {Promise<{sessionId: string, session: Object}>}
  */
  async runWorkflow(options = {}) {
    const sessionStore = options.sessionStore || null;
    validateWorkflowSessionStore(sessionStore);
    const resolvedSessionId = await this.resolveWorkflowSessionId(
      sessionStore,
      options,
    );
    const steps = Array.isArray(options.steps) ? options.steps : [];
    const extractErrorCode =
      typeof options.extractErrorCode === 'function' ?
        options.extractErrorCode :
        defaultExtractErrorCode;
    const isRetryableFailure =
      typeof options.isRetryableFailure === 'function' ?
        options.isRetryableFailure :
        defaultIsRetryableFailure;

    let session = await sessionStore.createOrLoadSession({
      nodeId: options.nodeId,
      sessionId: resolvedSessionId,
      planVersion: options.planVersion,
    });

    for (const step of steps) {
      this.assertValidCheckpointStep(step);
      const rerunningSatisfiedStep = this.shouldRerunSatisfiedStep(
        sessionStore,
        session,
        step,
      );
      if (this.shouldSkipCheckpoint(sessionStore, session, step)) {
        this.emitCheckpointSkipped(step, resolvedSessionId);
        continue;
      }
      this.emitCheckpointStart(step, resolvedSessionId);
      try {
        await step.run(session);
      } catch (error) {
        session = await this.recordWorkflowFailure({
          error,
          extractErrorCode,
          isRetryableFailure,
          nodeId: options.nodeId,
          phase: step.phase,
          sessionId: resolvedSessionId,
          sessionStore,
        });
        this.emitCheckpointFailed(step, resolvedSessionId, error);
        throw error;
      }

      if (this.hasLaterSatisfiedCheckpoint(sessionStore, session, step) &&
          rerunningSatisfiedStep) {
        this.emitCheckpointComplete(step, resolvedSessionId, {
          rerun: true,
          advanced: false,
        });
        continue;
      }

      session = await sessionStore.advanceCheckpoint({
        nodeId: options.nodeId,
        sessionId: resolvedSessionId,
        checkpoint: step.checkpoint,
        phase: step.phase,
        terminal: step.terminal === true,
      });
      this.emitCheckpointComplete(step, resolvedSessionId, {
        rerun: rerunningSatisfiedStep,
        advanced: true,
      });
    }

    return {
      sessionId: resolvedSessionId,
      session,
    };
  }

  /**
   * Emit pipeline event on event sink when available.
   * @param {string} eventName
   * @param {Object} payload
   */
  emit(eventName, payload) {
    if (!this.eventSink || typeof this.eventSink.emit !== 'function') {
      return;
    }
    this.eventSink.emit(`pipeline:${eventName}`, payload);
  }

  async resolveWorkflowSessionId(sessionStore, options) {
    const explicitSessionId =
      typeof options.sessionId === 'string' && options.sessionId.length > 0 ?
        options.sessionId :
        null;
    if (explicitSessionId) {
      return explicitSessionId;
    }
    const resolvedSessionId = await sessionStore.resolveSessionId?.({
      nodeId: options.nodeId,
      allowResumeLatest: options.allowResumeLatest === true,
    });
    if (typeof resolvedSessionId !== 'string' || resolvedSessionId.length === 0) {
      throw new Error('startup workflow sessionId is required');
    }
    return resolvedSessionId;
  }

  isCheckpointSatisfied(sessionStore, session, step) {
    return sessionStore.isCheckpointSatisfied(
      session.checkpoint,
      step.checkpoint,
    );
  }

  shouldRerunSatisfiedStep(sessionStore, session, step) {
    return this.isCheckpointSatisfied(sessionStore, session, step) &&
      typeof step.shouldRerun === 'function' &&
      step.shouldRerun(session) === true;
  }

  shouldSkipCheckpoint(sessionStore, session, step) {
    return this.isCheckpointSatisfied(sessionStore, session, step) &&
      !this.shouldRerunSatisfiedStep(sessionStore, session, step);
  }

  hasLaterSatisfiedCheckpoint(sessionStore, session, step) {
    return sessionStore.getCheckpointIndex(step.checkpoint) <
      sessionStore.getCheckpointIndex(session.checkpoint);
  }

  async recordWorkflowFailure(options) {
    const {error, extractErrorCode, isRetryableFailure, sessionStore} = options;
    return sessionStore.recordFailure({
      nodeId: options.nodeId,
      sessionId: options.sessionId,
      phase: options.phase,
      errorCode: extractErrorCode(error),
      failureMessage:
        typeof error?.message === 'string' && error.message.length > 0 ?
          error.message :
          null,
      retryAfterMs: error?.retryAfterMs,
      retryable: isRetryableFailure(error),
    });
  }

  emitCheckpointSkipped(step, sessionId) {
    this.emit(STARTUP_PIPELINE_EVENT.CHECKPOINT_SKIPPED, {
      checkpoint: step.checkpoint,
      phase: step.phase,
      sessionId,
    });
  }

  emitCheckpointStart(step, sessionId) {
    this.emit(STARTUP_PIPELINE_EVENT.CHECKPOINT_START, {
      checkpoint: step.checkpoint,
      phase: step.phase,
      sessionId,
    });
  }

  emitCheckpointFailed(step, sessionId, error) {
    this.emit(STARTUP_PIPELINE_EVENT.CHECKPOINT_FAILED, {
      checkpoint: step.checkpoint,
      phase: step.phase,
      sessionId,
      error: error?.message || String(error),
    });
  }

  emitCheckpointComplete(step, sessionId, options = {}) {
    this.emit(STARTUP_PIPELINE_EVENT.CHECKPOINT_COMPLETE, {
      checkpoint: step.checkpoint,
      phase: step.phase,
      sessionId,
      rerun: options.rerun === true,
      advanced: options.advanced === true,
    });
  }

  /**
   * Validate one checkpoint step.
   * @param {Object} step
   * @return {void}
   */
  assertValidCheckpointStep(step) {
    if (!step || typeof step !== 'object') {
      throw new Error('startup workflow step must be an object');
    }
    if (typeof step.run !== 'function') {
      throw new Error('startup workflow step run must be a function');
    }
    if (step.shouldRerun !== undefined &&
        typeof step.shouldRerun !== 'function') {
      throw new Error('startup workflow step shouldRerun must be a function');
    }
    if (typeof step.checkpoint !== 'string' || step.checkpoint.length === 0) {
      throw new Error('startup workflow step checkpoint must be a string');
    }
  }
}

export {StartupPipelineRunner, STARTUP_PIPELINE_EVENT};
