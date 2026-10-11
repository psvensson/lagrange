import {
  STARTUP_WORKFLOW_ERROR,
  StartupWorkflowStore,
} from './startup-workflow-store.js';
import {randomBytes} from 'node:crypto';
import {readDataDirectoryProcessOwnerEvidence} from
  '../storage/data-directory-process-owner.js';

const SEED_STARTUP_CHECKPOINT = Object.freeze({
  SESSION_CREATED: 'SESSION_CREATED',
  INFRASTRUCTURE_READY: 'INFRASTRUCTURE_READY',
  MESSAGE_GROUPS_READY: 'MESSAGE_GROUPS_READY',
  PARTITIONS_READY: 'PARTITIONS_READY',
  REGISTRATION_READY: 'REGISTRATION_READY',
  CACHE_HYDRATED: 'CACHE_HYDRATED',
  CONTROL_PLANE_READY: 'CONTROL_PLANE_READY',
  RUNTIME_READY: 'RUNTIME_READY',
  FINALIZED: 'FINALIZED',
});

const SEED_STARTUP_CHECKPOINT_SEQUENCE = Object.freeze([
  SEED_STARTUP_CHECKPOINT.SESSION_CREATED,
  SEED_STARTUP_CHECKPOINT.INFRASTRUCTURE_READY,
  SEED_STARTUP_CHECKPOINT.MESSAGE_GROUPS_READY,
  SEED_STARTUP_CHECKPOINT.PARTITIONS_READY,
  SEED_STARTUP_CHECKPOINT.REGISTRATION_READY,
  SEED_STARTUP_CHECKPOINT.CACHE_HYDRATED,
  SEED_STARTUP_CHECKPOINT.CONTROL_PLANE_READY,
  SEED_STARTUP_CHECKPOINT.RUNTIME_READY,
  SEED_STARTUP_CHECKPOINT.FINALIZED,
]);

const SEED_STARTUP_SESSION_PHASE = Object.freeze({
  SESSION_CREATED: 'seed_session:session_created',
  INFRASTRUCTURE_READY: 'seed_session:infrastructure_ready',
  MESSAGE_GROUPS_READY: 'seed_session:message_groups_ready',
  PARTITIONS_READY: 'seed_session:partitions_ready',
  REGISTRATION_READY: 'seed_session:registration_ready',
  CACHE_HYDRATED: 'seed_session:cache_hydrated',
  CONTROL_PLANE_READY: 'seed_session:control_plane_ready',
  RUNTIME_READY: 'seed_session:runtime_ready',
  FINALIZED: 'seed_session:finalized',
});

const SEED_STARTUP_SESSION_ID = Object.freeze({
  DEFAULT: 'seed-startup',
});

const SEED_STARTUP_WORKFLOW_KIND = 'seed';
const SEED_STORAGE_BIRTH_KIND = 'seed_storage_birth_v1';
const PARTICIPANT_RELEASE_SCOPE = 'participant_release';
const AUTHORIZATION_CAPABILITIES = new WeakMap();

function validPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0 && !Object.is(value, -0);
}

function validateStoredAuthorization(record, options, ownerEvidence) {
  const authority = record?.immutableAuthorization;
  return authority?.kind === SEED_STORAGE_BIRTH_KIND &&
    authority.activationScope === PARTICIPANT_RELEASE_SCOPE &&
    authority.authorityId === ownerEvidence.authorityId &&
    authority.canonicalDataDir === ownerEvidence.canonicalDataDir &&
    authority.nodeId === options.nodeId &&
    authority.sessionId === SEED_STARTUP_SESSION_ID.DEFAULT &&
    validPositiveInteger(authority.firstBootIncarnation);
}

function issueAuthorizationCapability(store, record, ownerEvidence) {
  const token = Object.freeze(Object.create(null));
  AUTHORIZATION_CAPABILITIES.set(token, Object.freeze({
    authorityId: record.immutableAuthorization.authorityId,
    bootIncarnation: record.startupInvocation.currentBootIncarnation,
    canonicalDataDir: ownerEvidence.canonicalDataDir,
    deadlineAtMs: record.startupInvocation.deadlineAtMs,
    invocationId: record.startupInvocation.invocationId,
    nodeId: record.nodeId,
    store,
    targetBuildDigest: record.startupInvocation.targetBuildDigest,
  }));
  return token;
}

function readSeedStartupAuthorization(token) {
  return AUTHORIZATION_CAPABILITIES.get(token) || null;
}

class SeedStartupSessionStore {
  constructor(options = {}) {
    this.workflowStore = options.workflowStore instanceof StartupWorkflowStore ?
      options.workflowStore :
      new StartupWorkflowStore({
        workflowKind: SEED_STARTUP_WORKFLOW_KIND,
        checkpointSequence: SEED_STARTUP_CHECKPOINT_SEQUENCE,
        initialCheckpoint: SEED_STARTUP_CHECKPOINT.SESSION_CREATED,
        initialPhase: SEED_STARTUP_SESSION_PHASE.SESSION_CREATED,
        planVersion: options.planVersion,
        now: options.now,
        dataDir: options.dataDir,
        storage: options.storage,
        restartTerminalSession: false,
      });
    this.dataDir = options.dataDir || null;
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
  }

  async resolveSessionId(options = {}) {
    if (options.allowResumeLatest === true) {
      const resumed = await this.workflowStore.resolveSessionId({
        nodeId: options.nodeId,
        allowResumeLatest: true,
      });
      if (resumed) {
        return resumed;
      }
    }
    return SEED_STARTUP_SESSION_ID.DEFAULT;
  }

  async loadLatestSession(options = {}) {
    return this.workflowStore.loadLatestSession(options);
  }

  async loadSession(options = {}) {
    return this.workflowStore.loadSession(options);
  }

  async createOrLoadSession(options = {}) {
    return this.workflowStore.createOrLoadSession({
      ...options,
      sessionId: options.sessionId || SEED_STARTUP_SESSION_ID.DEFAULT,
    });
  }

  async prepareDurableAuthority(options = {}) {
    const ownerEvidence = readDataDirectoryProcessOwnerEvidence(
      options.dataDirectoryProcessOwner, this.dataDir);
    if (ownerEvidence === null ||
        !validPositiveInteger(options.bootIncarnation) ||
        typeof options.nodeId !== 'string' || options.nodeId.length === 0) {
      const error = new Error('Seed startup durable authority unavailable');
      error.code = 'SEED_STARTUP_AUTHORITY_UNAVAILABLE';
      throw error;
    }
    let record = await this.loadLatestSession({nodeId: options.nodeId});
    const startedAt = this.now();
    if (record === null) {
      if (ownerEvidence.createdAndOwned !== true ||
          typeof ownerEvidence.authorityId !== 'string') {
        const error = new Error('Existing data directory requires seed authority');
        error.code = 'SEED_STARTUP_OPERATOR_REQUIRED';
        throw error;
      }
      const immutableAuthorization = Object.freeze({
        activationScope: PARTICIPANT_RELEASE_SCOPE,
        authorityId: ownerEvidence.authorityId,
        canonicalDataDir: ownerEvidence.canonicalDataDir,
        createdAt: startedAt,
        firstBootIncarnation: options.bootIncarnation,
        kind: SEED_STORAGE_BIRTH_KIND,
        nodeId: options.nodeId,
        sessionId: SEED_STARTUP_SESSION_ID.DEFAULT,
      });
      record = await this.workflowStore.createOrLoadSession({
        immutableAuthorization,
        nodeId: options.nodeId,
        planVersion: options.planVersion,
        sessionId: SEED_STARTUP_SESSION_ID.DEFAULT,
        startupInvocation: null,
      });
    } else {
      if (!validateStoredAuthorization(record, options, ownerEvidence)) {
        const error = new Error('Seed startup durable authority conflicts');
        error.code = 'SEED_STARTUP_AUTHORITY_CONFLICT';
        throw error;
      }
    }
    return Object.freeze({record, ownerEvidence});
  }

  async prepareAuthorizedInvocation(options = {}) {
    if (typeof options.targetBuildDigest !== 'string' ||
        options.targetBuildDigest.length === 0 ||
        !validPositiveInteger(options.timeoutMs)) {
      const error = new Error('Seed startup invocation is invalid');
      error.code = 'SEED_STARTUP_INVOCATION_INVALID';
      throw error;
    }
    const prepared = await this.prepareDurableAuthority(options);
    let {record} = prepared;
    const {ownerEvidence} = prepared;
    if (record.startupInvocation?.currentBootIncarnation ===
        options.bootIncarnation &&
        record.startupInvocation?.state === 'pending') {
      return Object.freeze({record,
        authorization: issueAuthorizationCapability(this, record, ownerEvidence)});
    }
    const startedAt = this.now();
    const deadlineAtMs = startedAt + options.timeoutMs;
    if (!Number.isSafeInteger(deadlineAtMs) || deadlineAtMs <= startedAt) {
      const error = new Error('Seed startup deadline is invalid');
      error.code = 'SEED_STARTUP_DEADLINE_INVALID';
      throw error;
    }
    {
      record = await this.workflowStore.updateSession({
        nodeId: options.nodeId,
        sessionId: SEED_STARTUP_SESSION_ID.DEFAULT,
        update: (current) => {
          const restartedWorkflow = current.terminal === true ||
            (current.startupInvocation !== null &&
              current.startupInvocation?.currentBootIncarnation !==
                options.bootIncarnation);
          return {
            ...current,
            attemptCount: current.attemptCount + 1,
            checkpoint: restartedWorkflow ?
              SEED_STARTUP_CHECKPOINT.SESSION_CREATED : current.checkpoint,
            completedAt: null,
            failureMessage: null,
            lastErrorCode: null,
            phase: restartedWorkflow ?
              SEED_STARTUP_SESSION_PHASE.SESSION_CREATED : current.phase,
            retryAfterMs: 0,
            retryable: true,
            startupInvocation: {
              currentBootIncarnation: options.bootIncarnation,
              deadlineAtMs,
              invocationId: randomBytes(24).toString('hex'),
              seedStartupHoldStartedAtMs: startedAt,
              state: 'pending',
              targetBuildDigest: options.targetBuildDigest,
            },
            status: 'active',
            terminal: false,
          };
        },
      });
    }
    return Object.freeze({record,
      authorization: issueAuthorizationCapability(this, record, ownerEvidence)});
  }

  async advanceCheckpoint(options = {}) {
    return this.workflowStore.advanceCheckpoint(options);
  }

  async recordFailure(options = {}) {
    return this.workflowStore.recordFailure(options);
  }

  validatesAuthorization(token, options = {}) {
    const capability = readSeedStartupAuthorization(token);
    return capability?.store === this &&
      capability.nodeId === options.nodeId &&
      capability.bootIncarnation === options.bootIncarnation &&
      capability.targetBuildDigest === options.targetBuildDigest &&
      capability.deadlineAtMs === options.deadlineAtMs;
  }

  isCheckpointSatisfied(currentCheckpoint, targetCheckpoint) {
    return this.workflowStore.isCheckpointSatisfied(
      currentCheckpoint,
      targetCheckpoint,
    );
  }

  getCheckpointIndex(checkpoint) {
    return this.workflowStore.getCheckpointIndex(checkpoint);
  }

  normalizeCheckpoint(checkpoint) {
    return this.workflowStore.normalizeCheckpoint(checkpoint);
  }
}

export {
  SEED_STARTUP_CHECKPOINT,
  SEED_STARTUP_CHECKPOINT_SEQUENCE,
  SEED_STARTUP_SESSION_ID,
  SEED_STARTUP_SESSION_PHASE,
  STARTUP_WORKFLOW_ERROR,
  SeedStartupSessionStore,
  readSeedStartupAuthorization,
};
