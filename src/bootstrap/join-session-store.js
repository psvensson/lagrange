import {
  STARTUP_WORKFLOW_ERROR,
  StartupWorkflowStore,
} from './startup-workflow-store.js';

const JOIN_CHECKPOINT = Object.freeze({
  SESSION_CREATED: 'SESSION_CREATED',
  SEED_CONTACTED: 'SEED_CONTACTED',
  JOIN_INFRASTRUCTURE_READY: 'JOIN_INFRASTRUCTURE_READY',
  MEMBERSHIP_WRITTEN: 'MEMBERSHIP_WRITTEN',
  READY_LEASE_ASSIGNED: 'READY_LEASE_ASSIGNED',
  FINALIZED: 'FINALIZED',
});

const JOIN_CHECKPOINT_SEQUENCE = Object.freeze([
  JOIN_CHECKPOINT.SESSION_CREATED,
  JOIN_CHECKPOINT.SEED_CONTACTED,
  JOIN_CHECKPOINT.JOIN_INFRASTRUCTURE_READY,
  JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
  JOIN_CHECKPOINT.READY_LEASE_ASSIGNED,
  JOIN_CHECKPOINT.FINALIZED,
]);

const JOIN_CHECKPOINT_INDEX = Object.freeze(
  JOIN_CHECKPOINT_SEQUENCE.reduce((accumulator, checkpoint, index) => {
    accumulator[checkpoint] = index;
    return accumulator;
  }, {}),
);

const JOIN_SESSION_DEFAULT = Object.freeze({
  PHASE: 'session_created',
  RETRY_AFTER_MS: 0,
  PLAN_VERSION: 'join-startup-plan/v1',
});

const JOIN_SESSION_ERROR = Object.freeze({
  NODE_ID_REQUIRED: STARTUP_WORKFLOW_ERROR.NODE_ID_REQUIRED,
  SESSION_ID_REQUIRED: STARTUP_WORKFLOW_ERROR.SESSION_ID_REQUIRED,
  INVALID_CHECKPOINT: STARTUP_WORKFLOW_ERROR.INVALID_CHECKPOINT,
  CHECKPOINT_REGRESSION: STARTUP_WORKFLOW_ERROR.CHECKPOINT_REGRESSION,
});

/**
 * Durable join-session store keyed by nodeId + sessionId.
 */
class JoinSessionStore {
  constructor(options = {}) {
    this.workflowStore = options.workflowStore instanceof StartupWorkflowStore ?
      options.workflowStore :
      new StartupWorkflowStore({
        workflowKind: 'join',
        checkpointSequence: JOIN_CHECKPOINT_SEQUENCE,
        initialCheckpoint: JOIN_CHECKPOINT.SESSION_CREATED,
        initialPhase: JOIN_SESSION_DEFAULT.PHASE,
        planVersion: options.planVersion || JOIN_SESSION_DEFAULT.PLAN_VERSION,
        now: options.now,
        dataDir: options.dataDir,
        storage: options.storage,
        restartTerminalSession: false,
      });
  }

  /**
   * Load one session record.
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {string} options.sessionId
   * @return {Promise<Object|null>}
   */
  async loadSession(options = {}) {
    return this.workflowStore.loadSession(options);
  }

  /**
   * Load the latest session for one node regardless of session id.
   * @param {Object} options
   * @param {string} options.nodeId
   * @return {Promise<Object|null>}
   */
  async loadLatestSession(options = {}) {
    return this.workflowStore.loadLatestSession(options);
  }

  /**
   * Resolve the effective session identity.
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {string} [options.sessionId]
   * @param {boolean} [options.allowResumeLatest]
   * @return {Promise<string|null>}
   */
  async resolveSessionId(options = {}) {
    return this.workflowStore.resolveSessionId(options);
  }

  /**
   * Create or load a session. Existing sessions increment attempt count.
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {string} options.sessionId
   * @return {Promise<Object>}
   */
  async createOrLoadSession(options = {}) {
    return this.workflowStore.createOrLoadSession(options);
  }

  /**
   * Advance checkpoint monotonically.
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {string} options.sessionId
   * @param {string} options.checkpoint
   * @param {string} [options.phase]
   * @return {Promise<Object>}
   */
  async advanceCheckpoint(options = {}) {
    return this.workflowStore.advanceCheckpoint({
      ...options,
      terminal: options.terminal === true,
    });
  }

  /**
   * Record failed attempt metadata without losing checkpoint.
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {string} options.sessionId
   * @param {string} [options.errorCode]
   * @param {number} [options.retryAfterMs]
   * @param {boolean} [options.retryable]
   * @param {string} [options.phase]
   * @return {Promise<Object>}
   */
  async recordFailure(options = {}) {
    return this.workflowStore.recordFailure(options);
  }

  /**
   * Determine whether one checkpoint is already satisfied.
   * @param {string} currentCheckpoint
   * @param {string} targetCheckpoint
   * @return {boolean}
   */
  isCheckpointSatisfied(currentCheckpoint, targetCheckpoint) {
    return this.workflowStore.isCheckpointSatisfied(
      currentCheckpoint,
      targetCheckpoint,
    );
  }

  normalizeCheckpoint(checkpoint) {
    return this.workflowStore.normalizeCheckpoint(checkpoint);
  }

  getCheckpointIndex(checkpoint) {
    return this.workflowStore.getCheckpointIndex(checkpoint);
  }
}

export {
  JOIN_CHECKPOINT,
  JOIN_CHECKPOINT_INDEX,
  JOIN_CHECKPOINT_SEQUENCE,
  JOIN_SESSION_ERROR,
  JoinSessionStore,
};
