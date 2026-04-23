import {
  STARTUP_WORKFLOW_ERROR,
  StartupWorkflowStore,
} from './startup-workflow-store.js';

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
        restartTerminalSession: true,
      });
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

  async advanceCheckpoint(options = {}) {
    return this.workflowStore.advanceCheckpoint(options);
  }

  async recordFailure(options = {}) {
    return this.workflowStore.recordFailure(options);
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
};
