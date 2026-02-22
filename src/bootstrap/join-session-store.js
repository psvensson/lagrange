import {NUM} from '../constants/index.js';

const JOIN_CHECKPOINT = Object.freeze({
  SESSION_CREATED: 'SESSION_CREATED',
  MEMBERSHIP_WRITTEN: 'MEMBERSHIP_WRITTEN',
  LEASE_ASSIGNED: 'LEASE_ASSIGNED',
  HANDSHAKE_COMPLETED: 'HANDSHAKE_COMPLETED',
  FINALIZED: 'FINALIZED',
});

const JOIN_CHECKPOINT_SEQUENCE = Object.freeze([
  JOIN_CHECKPOINT.SESSION_CREATED,
  JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
  JOIN_CHECKPOINT.LEASE_ASSIGNED,
  JOIN_CHECKPOINT.HANDSHAKE_COMPLETED,
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
});

const JOIN_SESSION_ERROR = Object.freeze({
  NODE_ID_REQUIRED: 'nodeId is required',
  SESSION_ID_REQUIRED: 'sessionId is required',
  INVALID_CHECKPOINT: 'invalid join checkpoint',
  CHECKPOINT_REGRESSION: 'checkpoint regression',
});

/**
 * Durable join-session store keyed by nodeId + sessionId.
 */
class JoinSessionStore {
  constructor(options = {}) {
    this._storage = options.storage instanceof Map ?
      options.storage :
      new Map();
    this._now = typeof options.now === 'function' ?
      options.now :
      () => Date.now();
  }

  /**
   * Load one session record.
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {string} options.sessionId
   * @return {Promise<Object|null>}
   */
  async loadSession(options = {}) {
    const compositeKey = this.buildCompositeKey(options);
    const record = this._storage.get(compositeKey) || null;
    return record ? this.cloneRecord(record) : null;
  }

  /**
   * Create or load a session. Existing sessions increment attempt count.
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {string} options.sessionId
   * @return {Promise<Object>}
   */
  async createOrLoadSession(options = {}) {
    const compositeKey = this.buildCompositeKey(options);
    const now = this._now();
    const existing = this._storage.get(compositeKey);
    if (existing) {
      const updated = {
        ...existing,
        attemptCount: existing.attemptCount + 1,
        updatedAt: now,
      };
      this._storage.set(compositeKey, updated);
      return this.cloneRecord(updated);
    }

    const created = {
      nodeId: options.nodeId,
      sessionId: options.sessionId,
      checkpoint: JOIN_CHECKPOINT.SESSION_CREATED,
      phase: JOIN_SESSION_DEFAULT.PHASE,
      attemptCount: 1,
      lastErrorCode: null,
      retryAfterMs: JOIN_SESSION_DEFAULT.RETRY_AFTER_MS,
      terminal: false,
      retryable: true,
      createdAt: now,
      updatedAt: now,
    };
    this._storage.set(compositeKey, created);
    return this.cloneRecord(created);
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
    const compositeKey = this.buildCompositeKey(options);
    const nextCheckpoint = this.normalizeCheckpoint(options.checkpoint);
    const existing = this._storage.get(compositeKey);
    if (!existing) {
      throw new Error('join session not found: ' + compositeKey);
    }

    const currentIndex = this.getCheckpointIndex(existing.checkpoint);
    const nextIndex = this.getCheckpointIndex(nextCheckpoint);
    if (nextIndex < currentIndex) {
      throw new Error(
        JOIN_SESSION_ERROR.CHECKPOINT_REGRESSION +
        ` (${existing.checkpoint} -> ${nextCheckpoint})`,
      );
    }
    if (nextIndex === currentIndex) {
      return this.cloneRecord(existing);
    }

    const updated = {
      ...existing,
      checkpoint: nextCheckpoint,
      phase: typeof options.phase === 'string' && options.phase.length > NUM.ZERO ?
        options.phase :
        existing.phase,
      lastErrorCode: null,
      retryAfterMs: JOIN_SESSION_DEFAULT.RETRY_AFTER_MS,
      terminal: false,
      retryable: true,
      updatedAt: this._now(),
    };
    this._storage.set(compositeKey, updated);
    return this.cloneRecord(updated);
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
    const compositeKey = this.buildCompositeKey(options);
    const existing = this._storage.get(compositeKey);
    if (!existing) {
      throw new Error('join session not found: ' + compositeKey);
    }
    const updated = {
      ...existing,
      phase: typeof options.phase === 'string' && options.phase.length > NUM.ZERO ?
        options.phase :
        existing.phase,
      lastErrorCode: typeof options.errorCode === 'string' ?
        options.errorCode :
        existing.lastErrorCode,
      retryAfterMs: Number.isFinite(options.retryAfterMs) ?
        Math.max(NUM.ZERO, Math.floor(options.retryAfterMs)) :
        existing.retryAfterMs,
      retryable: options.retryable !== false,
      terminal: options.retryable === false,
      updatedAt: this._now(),
    };
    this._storage.set(compositeKey, updated);
    return this.cloneRecord(updated);
  }

  /**
   * Determine whether one checkpoint is already satisfied.
   * @param {string} currentCheckpoint
   * @param {string} targetCheckpoint
   * @return {boolean}
   */
  isCheckpointSatisfied(currentCheckpoint, targetCheckpoint) {
    return this.getCheckpointIndex(currentCheckpoint) >=
      this.getCheckpointIndex(targetCheckpoint);
  }

  buildCompositeKey(options = {}) {
    if (typeof options.nodeId !== 'string' || options.nodeId.length === 0) {
      throw new Error(JOIN_SESSION_ERROR.NODE_ID_REQUIRED);
    }
    if (typeof options.sessionId !== 'string' || options.sessionId.length === 0) {
      throw new Error(JOIN_SESSION_ERROR.SESSION_ID_REQUIRED);
    }
    return options.nodeId + '::' + options.sessionId;
  }

  normalizeCheckpoint(checkpoint) {
    if (!Object.prototype.hasOwnProperty.call(JOIN_CHECKPOINT_INDEX, checkpoint)) {
      throw new Error(JOIN_SESSION_ERROR.INVALID_CHECKPOINT + ': ' + String(checkpoint));
    }
    return checkpoint;
  }

  getCheckpointIndex(checkpoint) {
    const normalized = this.normalizeCheckpoint(checkpoint);
    return JOIN_CHECKPOINT_INDEX[normalized];
  }

  cloneRecord(record) {
    return {
      nodeId: record.nodeId,
      sessionId: record.sessionId,
      checkpoint: record.checkpoint,
      phase: record.phase,
      attemptCount: record.attemptCount,
      lastErrorCode: record.lastErrorCode,
      retryAfterMs: record.retryAfterMs,
      retryable: record.retryable,
      terminal: record.terminal,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

export {
  JOIN_CHECKPOINT,
  JOIN_CHECKPOINT_INDEX,
  JOIN_CHECKPOINT_SEQUENCE,
  JOIN_SESSION_ERROR,
  JoinSessionStore,
};
