import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {join as joinPath} from 'node:path';
import {NUM, TYPEOF} from '../constants/index.js';

const STARTUP_WORKFLOW_STATUS = Object.freeze({
  ACTIVE: 'active',
  FAILED_RETRYABLE: 'failed_retryable',
  FAILED_TERMINAL: 'failed_terminal',
  COMPLETED: 'completed',
});

const STARTUP_WORKFLOW_ERROR = Object.freeze({
  NODE_ID_REQUIRED: 'nodeId is required',
  SESSION_ID_REQUIRED: 'sessionId is required',
  WORKFLOW_KIND_REQUIRED: 'workflowKind is required',
  INVALID_CHECKPOINT: 'invalid startup workflow checkpoint',
  CHECKPOINT_REGRESSION: 'checkpoint regression',
  SESSION_NOT_FOUND: 'startup workflow session not found',
});

const STARTUP_WORKFLOW_STORAGE_DIRNAME = 'startup-workflows';
const STARTUP_WORKFLOW_FILE_SUFFIX = '.json';
const STARTUP_WORKFLOW_TEMP_SUFFIX = '.tmp';
const STARTUP_WORKFLOW_UTF8 = 'utf8';
const STARTUP_WORKFLOW_JSON_INDENT = 2;
const STARTUP_WORKFLOW_JSON_LINE_SUFFIX = '\n';
const STARTUP_WORKFLOW_DEFAULT_RETRY_AFTER_MS = NUM.ZERO;
const STARTUP_WORKFLOW_DEFAULT_FAILURE_MESSAGE = null;
const STARTUP_WORKFLOW_DEFAULT_LAST_ERROR_CODE = null;
const STARTUP_WORKFLOW_DEFAULT_COMPLETED_AT = null;
const STARTUP_WORKFLOW_DEFAULT_PLAN_VERSION = 'v1';
const STARTUP_WORKFLOW_DEFAULT_STORAGE = 'memory';

function normalizeNonEmptyString(value) {
  if (typeof value !== TYPEOF.STRING) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > NUM.ZERO ?
    normalized :
    null;
}

function sanitizeFileToken(value) {
  const normalized = normalizeNonEmptyString(value);
  if (normalized === null) {
    return null;
  }
  return normalized.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function cloneWorkflowRecord(record) {
  return {
    workflowKind: record.workflowKind,
    nodeId: record.nodeId,
    sessionId: record.sessionId,
    planVersion: record.planVersion,
    checkpoint: record.checkpoint,
    phase: record.phase,
    attemptCount: record.attemptCount,
    lastErrorCode: record.lastErrorCode,
    failureMessage: record.failureMessage,
    retryAfterMs: record.retryAfterMs,
    retryable: record.retryable,
    status: record.status,
    terminal: record.terminal,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
  };
}

class MemoryStartupWorkflowStorage {
  constructor(storage) {
    this.storage = storage instanceof Map ?
      storage :
      new Map();
  }

  async loadRecord(key) {
    const record = this.storage.get(key) || null;
    return record ? cloneWorkflowRecord(record) : null;
  }

  async saveRecord(key, record) {
    this.storage.set(key, cloneWorkflowRecord(record));
    return cloneWorkflowRecord(record);
  }
}

class FileStartupWorkflowStorage {
  constructor(options = {}) {
    this.dataDir = normalizeNonEmptyString(options.dataDir);
  }

  buildRecordPath(key) {
    return this.dataDir === null ?
      null :
      joinPath(
        this.dataDir,
        STARTUP_WORKFLOW_STORAGE_DIRNAME,
        `${key}${STARTUP_WORKFLOW_FILE_SUFFIX}`,
      );
  }

  async loadRecord(key) {
    const recordPath = this.buildRecordPath(key);
    if (recordPath === null) {
      return null;
    }
    try {
      const raw = await readFile(recordPath, STARTUP_WORKFLOW_UTF8);
      return JSON.parse(raw);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async saveRecord(key, record) {
    const recordPath = this.buildRecordPath(key);
    if (recordPath === null) {
      return cloneWorkflowRecord(record);
    }
    await mkdir(joinPath(this.dataDir, STARTUP_WORKFLOW_STORAGE_DIRNAME), {
      recursive: true,
    });
    const tempPath = `${recordPath}${STARTUP_WORKFLOW_TEMP_SUFFIX}.` +
      `${process.pid}.${Date.now()}`;
    await writeFile(
      tempPath,
      JSON.stringify(record, null, STARTUP_WORKFLOW_JSON_INDENT) +
        STARTUP_WORKFLOW_JSON_LINE_SUFFIX,
      STARTUP_WORKFLOW_UTF8,
    );
    await rename(tempPath, recordPath);
    return cloneWorkflowRecord(record);
  }
}

class StartupWorkflowStore {
  constructor(options = {}) {
    this.workflowKind = normalizeNonEmptyString(options.workflowKind);
    if (this.workflowKind === null) {
      throw new Error(STARTUP_WORKFLOW_ERROR.WORKFLOW_KIND_REQUIRED);
    }
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now();
    this.initialCheckpoint = normalizeNonEmptyString(
      options.initialCheckpoint,
    );
    this.initialPhase = normalizeNonEmptyString(options.initialPhase);
    this.planVersion = normalizeNonEmptyString(options.planVersion) ||
      STARTUP_WORKFLOW_DEFAULT_PLAN_VERSION;
    this.restartTerminalSession = options.restartTerminalSession === true;
    this.checkpointSequence = Object.freeze(
      Array.isArray(options.checkpointSequence) ?
        [...options.checkpointSequence] :
        [],
    );
    this.checkpointIndex = Object.freeze(
      this.checkpointSequence.reduce((accumulator, checkpoint, index) => {
        accumulator[checkpoint] = index;
        return accumulator;
      }, {}),
    );

    if (options.storage instanceof Map) {
      this.storage = new MemoryStartupWorkflowStorage(options.storage);
    } else if (options.storage &&
        typeof options.storage.loadRecord === TYPEOF.FUNCTION &&
        typeof options.storage.saveRecord === TYPEOF.FUNCTION) {
      this.storage = options.storage;
    } else if (normalizeNonEmptyString(options.dataDir) !== null) {
      this.storage = new FileStartupWorkflowStorage({
        dataDir: options.dataDir,
      });
    } else {
      this.storage = new MemoryStartupWorkflowStorage(
        new Map(),
      );
    }
  }

  buildStorageKey(options = {}) {
    const nodeId = normalizeNonEmptyString(options.nodeId);
    if (nodeId === null) {
      throw new Error(STARTUP_WORKFLOW_ERROR.NODE_ID_REQUIRED);
    }
    const sanitizedWorkflowKind = sanitizeFileToken(this.workflowKind);
    const sanitizedNodeId = sanitizeFileToken(nodeId);
    return `${sanitizedWorkflowKind || STARTUP_WORKFLOW_DEFAULT_STORAGE}-` +
      `${sanitizedNodeId || STARTUP_WORKFLOW_DEFAULT_STORAGE}`;
  }

  normalizeCheckpoint(checkpoint) {
    const normalized = normalizeNonEmptyString(checkpoint);
    if (normalized === null ||
        !Object.prototype.hasOwnProperty.call(
          this.checkpointIndex,
          normalized,
        )) {
      throw new Error(
        STARTUP_WORKFLOW_ERROR.INVALID_CHECKPOINT +
          ': ' +
          String(checkpoint),
      );
    }
    return normalized;
  }

  getCheckpointIndex(checkpoint) {
    return this.checkpointIndex[this.normalizeCheckpoint(checkpoint)];
  }

  isCheckpointSatisfied(currentCheckpoint, targetCheckpoint) {
    return this.getCheckpointIndex(currentCheckpoint) >=
      this.getCheckpointIndex(targetCheckpoint);
  }

  async loadLatestSession(options = {}) {
    const storageKey = this.buildStorageKey(options);
    const record = await this.storage.loadRecord(storageKey);
    return record ? cloneWorkflowRecord(record) : null;
  }

  async loadSession(options = {}) {
    const sessionId = normalizeNonEmptyString(options.sessionId);
    if (sessionId === null) {
      throw new Error(STARTUP_WORKFLOW_ERROR.SESSION_ID_REQUIRED);
    }
    const record = await this.loadLatestSession(options);
    if (!record || record.sessionId !== sessionId) {
      return null;
    }
    return record;
  }

  async resolveSessionId(options = {}) {
    const explicitSessionId = normalizeNonEmptyString(options.sessionId);
    if (explicitSessionId !== null) {
      return explicitSessionId;
    }
    if (options.allowResumeLatest !== true) {
      return null;
    }
    const record = await this.loadLatestSession(options);
    if (!record || record.terminal === true) {
      return null;
    }
    return record.sessionId;
  }

  async createOrLoadSession(options = {}) {
    const nodeId = normalizeNonEmptyString(options.nodeId);
    if (nodeId === null) {
      throw new Error(STARTUP_WORKFLOW_ERROR.NODE_ID_REQUIRED);
    }
    const sessionId = normalizeNonEmptyString(options.sessionId);
    if (sessionId === null) {
      throw new Error(STARTUP_WORKFLOW_ERROR.SESSION_ID_REQUIRED);
    }
    const storageKey = this.buildStorageKey({nodeId});
    const now = this.now();
    const planVersion = normalizeNonEmptyString(options.planVersion) ||
      this.planVersion;
    const existing = await this.storage.loadRecord(storageKey);

    if (existing &&
        existing.sessionId === sessionId &&
        !(existing.terminal === true && this.restartTerminalSession === true)) {
      const updated = {
        ...existing,
        planVersion,
        attemptCount: existing.attemptCount + NUM.ONE,
        updatedAt: now,
      };
      await this.storage.saveRecord(storageKey, updated);
      return cloneWorkflowRecord(updated);
    }

    const created = {
      workflowKind: this.workflowKind,
      nodeId,
      sessionId,
      planVersion,
      checkpoint: this.initialCheckpoint,
      phase: this.initialPhase,
      attemptCount: NUM.ONE,
      lastErrorCode: STARTUP_WORKFLOW_DEFAULT_LAST_ERROR_CODE,
      failureMessage: STARTUP_WORKFLOW_DEFAULT_FAILURE_MESSAGE,
      retryAfterMs: STARTUP_WORKFLOW_DEFAULT_RETRY_AFTER_MS,
      retryable: true,
      status: STARTUP_WORKFLOW_STATUS.ACTIVE,
      terminal: false,
      createdAt: now,
      updatedAt: now,
      completedAt: STARTUP_WORKFLOW_DEFAULT_COMPLETED_AT,
    };
    await this.storage.saveRecord(storageKey, created);
    return cloneWorkflowRecord(created);
  }

  async advanceCheckpoint(options = {}) {
    const nodeId = normalizeNonEmptyString(options.nodeId);
    if (nodeId === null) {
      throw new Error(STARTUP_WORKFLOW_ERROR.NODE_ID_REQUIRED);
    }
    const sessionId = normalizeNonEmptyString(options.sessionId);
    if (sessionId === null) {
      throw new Error(STARTUP_WORKFLOW_ERROR.SESSION_ID_REQUIRED);
    }
    const storageKey = this.buildStorageKey({nodeId});
    const existing = await this.storage.loadRecord(storageKey);
    if (!existing || existing.sessionId !== sessionId) {
      throw new Error(
        STARTUP_WORKFLOW_ERROR.SESSION_NOT_FOUND +
          ': ' +
          `${nodeId}::${sessionId}`,
      );
    }

    const nextCheckpoint = this.normalizeCheckpoint(options.checkpoint);
    const currentIndex = this.getCheckpointIndex(existing.checkpoint);
    const nextIndex = this.getCheckpointIndex(nextCheckpoint);
    if (nextIndex < currentIndex) {
      throw new Error(
        STARTUP_WORKFLOW_ERROR.CHECKPOINT_REGRESSION +
          ` (${existing.checkpoint} -> ${nextCheckpoint})`,
      );
    }
    if (nextIndex === currentIndex && existing.terminal === options.terminal) {
      return cloneWorkflowRecord(existing);
    }

    const terminal = options.terminal === true;
    const updated = {
      ...existing,
      checkpoint: nextCheckpoint,
      phase: normalizeNonEmptyString(options.phase) || existing.phase,
      lastErrorCode: STARTUP_WORKFLOW_DEFAULT_LAST_ERROR_CODE,
      failureMessage: STARTUP_WORKFLOW_DEFAULT_FAILURE_MESSAGE,
      retryAfterMs: STARTUP_WORKFLOW_DEFAULT_RETRY_AFTER_MS,
      retryable: terminal ? false : true,
      status: terminal ?
        STARTUP_WORKFLOW_STATUS.COMPLETED :
        STARTUP_WORKFLOW_STATUS.ACTIVE,
      terminal,
      updatedAt: this.now(),
      completedAt: terminal ?
        this.now() :
        STARTUP_WORKFLOW_DEFAULT_COMPLETED_AT,
    };
    await this.storage.saveRecord(storageKey, updated);
    return cloneWorkflowRecord(updated);
  }

  async recordFailure(options = {}) {
    const nodeId = normalizeNonEmptyString(options.nodeId);
    if (nodeId === null) {
      throw new Error(STARTUP_WORKFLOW_ERROR.NODE_ID_REQUIRED);
    }
    const sessionId = normalizeNonEmptyString(options.sessionId);
    if (sessionId === null) {
      throw new Error(STARTUP_WORKFLOW_ERROR.SESSION_ID_REQUIRED);
    }
    const storageKey = this.buildStorageKey({nodeId});
    const existing = await this.storage.loadRecord(storageKey);
    if (!existing || existing.sessionId !== sessionId) {
      throw new Error(
        STARTUP_WORKFLOW_ERROR.SESSION_NOT_FOUND +
          ': ' +
          `${nodeId}::${sessionId}`,
      );
    }
    const retryable = options.retryable !== false;
    const terminal = retryable !== true;
    const updated = {
      ...existing,
      phase: normalizeNonEmptyString(options.phase) || existing.phase,
      lastErrorCode: normalizeNonEmptyString(options.errorCode) ||
        existing.lastErrorCode,
      failureMessage: normalizeNonEmptyString(options.failureMessage) ||
        existing.failureMessage,
      retryAfterMs: Number.isFinite(options.retryAfterMs) ?
        Math.max(NUM.ZERO, Math.floor(options.retryAfterMs)) :
        existing.retryAfterMs,
      retryable,
      status: retryable ?
        STARTUP_WORKFLOW_STATUS.FAILED_RETRYABLE :
        STARTUP_WORKFLOW_STATUS.FAILED_TERMINAL,
      terminal,
      updatedAt: this.now(),
      completedAt: terminal ?
        this.now() :
        STARTUP_WORKFLOW_DEFAULT_COMPLETED_AT,
    };
    await this.storage.saveRecord(storageKey, updated);
    return cloneWorkflowRecord(updated);
  }
}

export {
  STARTUP_WORKFLOW_ERROR,
  STARTUP_WORKFLOW_STATUS,
  StartupWorkflowStore,
};
