import {ERRORS} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {PARTICIPANT_ACK_RESULT} from '../workflow/workflow-constants.js';
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_MESSAGE_TYPE,
} from './partition-service-constants.js';
import {PARTITION_TRANSITION_STATE} from './partition-constants.js';
import {MERGE_ACK_STATUS} from './merge-ack-constants.js';
import {loadDurableDeltasBehindWatermark} from
  './partition-mirror-replay-cursor.js';

const {RaftRole, SPLIT_ACK_STATUS} = PARTITION_SERVICE_SHARED;
const LOCAL_STR_CONSTRUCTOR = 'constructor';
const REPLICATION_FAMILY = Object.freeze({SPLIT: 'split', MERGE: 'merge'});
const RECOVERED_SPLIT_PHASES = /* @__PURE__ */ new Set([
  PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
  PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
]);
const RECOVERED_MERGE_PHASES = /* @__PURE__ */ new Set([
  PARTITION_TRANSITION_STATE.MERGE_CATCHUP,
  PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
]);
const START_METHOD = Object.freeze({
  AUTHORIZE_MERGE: 'authorizeAndRunMergeReplication',
  AUTHORIZE_SPLIT: 'authorizeAndRunSplitReplication',
  BEGIN_ACTIVITY: 'beginSourceReplicationActivity',
  DISCARD_MERGE: 'discardProvisionalMergeReplication',
  DISCARD_SPLIT: 'discardProvisionalSplitReplication',
  FINISH_ACTIVITY: 'finishSourceReplicationActivity',
  PREPARE_HANDLE: 'prepareSourceReplicationHandle',
  QUIESCE_HANDLE: 'quiesceSourceReplicationHandle',
  START_MERGE: 'startMergeReplicationHandle',
  START_SPLIT: 'startSplitReplicationHandle',
  WAIT_MERGE: 'waitForMergeReplicationStart',
  WAIT_SPLIT: 'waitForSplitReplicationStart',
});

function authorizationAccepted(result) {
  return result?.result === PARTICIPANT_ACK_RESULT.ACCEPTED ||
    result?.result === PARTICIPANT_ACK_RESULT.DUPLICATE;
}

function sameArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function startIdentityMatches(left, right) {
  return Boolean(left && right) && left.workflowId === right.workflowId &&
    left.workflowAttempt === right.workflowAttempt &&
    left.workflowFenceToken === right.workflowFenceToken;
}

function requestTableMatches(service, payload) {
  return (!payload?.tableId || payload.tableId === service.tableId) &&
    (!payload?.tableName || payload.tableName === service.tableName);
}

function forwardSplitStartIfFollower(service, payload, transitionMetadata) {
  if (service.role === RaftRole.LEADER) return null;
  const leaderAddress = service.resolveLeaderAddress();
  if (leaderAddress && service.transport) {
    return service.transport.deliver(leaderAddress, {
      type: PARTITION_SERVICE_MESSAGE_TYPE.START_SPLIT_REPLICATION,
      partitionId: payload.partitionId || service.partitionId,
      tableId: payload.tableId || service.tableId,
      tableName: payload.tableName || service.tableName,
      transitionMetadata,
    });
  }
  return rejected(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
}

function splitStartIsDuplicate(service, metadata) {
  const current = service.splitReplication;
  return Boolean(current) &&
    service.isSameSplitReplication(current.metadata, metadata);
}

function mergeStartIsDuplicate(service, metadata) {
  const current = service.mergeReplication;
  return Boolean(current) &&
    service.isSameMergeReplication(current.metadata, metadata);
}

function predecessorAllowsStart(previous, metadata) {
  if (!previous) return true;
  if (previous.terminal !== true || previous.quiesced !== true) return false;
  if (previous.metadata.workflowId !== metadata.workflowId) return true;
  return metadata.workflowAttempt > previous.metadata.workflowAttempt ||
    (metadata.workflowAttempt === previous.metadata.workflowAttempt &&
     metadata.workflowFenceToken > previous.metadata.workflowFenceToken);
}

function captureAdmissiblePredecessors(service, metadata) {
  const predecessors = {
    split: service.splitReplication,
    merge: service.mergeReplication,
  };
  return predecessorAllowsStart(predecessors.split, metadata) &&
    predecessorAllowsStart(predecessors.merge, metadata) ? predecessors : null;
}

function consumeAuthorizedPredecessors(service, handle, family) {
  const predecessors = handle.predecessors || {};
  if (family === REPLICATION_FAMILY.SPLIT &&
      service.mergeReplication === predecessors.merge) {
    service.mergeReplication = null;
  }
  if (family === REPLICATION_FAMILY.MERGE &&
      service.splitReplication === predecessors.split) {
    service.splitReplication = null;
  }
  handle.predecessors = null;
}

function rejected(error) {
  return {acknowledged: false, error};
}

function snapshotExecutionMetadata(metadata) {
  return Object.freeze({...metadata,
    ...(Array.isArray(metadata?.targetPartitionIds) ?
      {targetPartitionIds: Object.freeze([...metadata.targetPartitionIds])} :
      {}),
    ...(Array.isArray(metadata?.sourcePartitionIds) ?
      {sourcePartitionIds: Object.freeze([...metadata.sourcePartitionIds])} :
      {})});
}

function createExecutionHandle(metadata, phase, startedAt) {
  return {metadata: snapshotExecutionMetadata(metadata), phase,
    pendingEntries: [], flushPromise: null, startedAt,
    lastError: null, authorized: false, terminal: false,
    quiescing: false, quiesced: false,
    authorizationPromise: null, startPromise: null, runPromise: null,
    activities: new Set()};
}

function refreshAuthorizedReplayQueue(service, handle, recoveredPhases,
  errorMessage) {
  if (!recoveredPhases.has(handle.phase)) {
    handle.pendingEntries = [];
    return;
  }
  if (!Number.isSafeInteger(handle.replayWatermarkIndex) ||
      handle.replayWatermarkIndex < 1 || !service.db?.open) {
    throw new Error(errorMessage);
  }
  // Reconstruction first reads the log while START is still unauthorized.
  // Read it again at the exact acceptance turn so writes committed during the
  // awaited owner decision are included before live mirroring is enabled.
  handle.pendingEntries = loadDurableDeltasBehindWatermark(
    service, handle.replayWatermarkIndex);
}

function invokeStartMethod(service, name, ...args) {
  return PartitionServiceSourceReplicationStartMethods.prototype[name]
    .call(service, ...args);
}

class PartitionServiceSourceReplicationStartMethods {
  isSameSplitReplication(left, right) {
    return startIdentityMatches(left, right) &&
      left.primaryKeyColumn === right.primaryKeyColumn &&
      left.sourcePartitionId === right.sourcePartitionId &&
      left.splitKey === right.splitKey &&
      left.targetPartitionVersion === right.targetPartitionVersion &&
      sameArray(left.targetPartitionIds, right.targetPartitionIds);
  }

  isSameMergeReplication(left, right) {
    return startIdentityMatches(left, right) &&
      left.primaryKeyColumn === right.primaryKeyColumn &&
      left.targetPartitionId === right.targetPartitionId &&
      left.targetPartitionVersion === right.targetPartitionVersion &&
      sameArray(left.sourcePartitionIds, right.sourcePartitionIds);
  }

  async handleStartSplitReplication(payload) {
    const request = payload || {};
    const transitionMetadata = request.transitionMetadata;
    const metadata = this.normalizeSplitTransitionMetadata(transitionMetadata);
    if (!metadata || !requestTableMatches(this, request)) {
      return rejected(PARTITION_SERVICE_ERROR_MSG.INVALID_SPLIT_REPLICATION);
    }
    this.logger.info(PARTITION_SERVICE_LOG_MSG.START_SPLIT_REPLICATION_REQUEST,
      {partitionId: this.partitionId,
        tableId: request.tableId || this.tableId,
        tableName: request.tableName || this.tableName,
        targetPartitionIds: metadata.targetPartitionIds,
        targetPartitionVersion: metadata.targetPartitionVersion});
    const followerResponse = forwardSplitStartIfFollower(
      this, request, transitionMetadata);
    if (followerResponse) return followerResponse;
    if (splitStartIsDuplicate(this, metadata)) {
      return invokeStartMethod(this, START_METHOD.WAIT_SPLIT,
        this.splitReplication);
    }
    const predecessors = captureAdmissiblePredecessors(this, metadata);
    if (!predecessors) {
      return rejected(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED);
    }
    const handle = createExecutionHandle(metadata,
      PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING, this.timeSource.now());
    handle.predecessors = predecessors;
    this.splitReplication = handle;
    return invokeStartMethod(this, START_METHOD.START_SPLIT, handle);
  }

  startSplitReplicationHandle(handle) {
    invokeStartMethod(this, START_METHOD.PREPARE_HANDLE, handle);
    if (!handle.startPromise) {
      handle.startPromise = invokeStartMethod(this,
        START_METHOD.AUTHORIZE_SPLIT, handle);
    }
    return invokeStartMethod(this, START_METHOD.WAIT_SPLIT, handle);
  }

  async authorizeAndRunSplitReplication(handle) {
    const {metadata} = handle;
    handle.authorizationPromise = this.emitSplitSourceAck(
      metadata, SPLIT_ACK_STATUS.SNAPSHOT_STARTED);
    let authorization;
    try {
      authorization = await handle.authorizationPromise;
    } catch (error) {
      invokeStartMethod(this, START_METHOD.DISCARD_SPLIT, handle);
      throw error;
    }
    if (!authorizationAccepted(authorization) || this.isShutdown === true ||
        this.role !== RaftRole.LEADER || this.splitReplication !== handle) {
      invokeStartMethod(this, START_METHOD.DISCARD_SPLIT, handle);
      return rejected(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED);
    }
    try {
      refreshAuthorizedReplayQueue(this, handle, RECOVERED_SPLIT_PHASES,
        PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED);
    } catch (error) {
      invokeStartMethod(this, START_METHOD.DISCARD_SPLIT, handle);
      throw error;
    }
    handle.authorized = true;
    consumeAuthorizedPredecessors(this, handle, REPLICATION_FAMILY.SPLIT);
    const run = this.runSplitReplicationWorkflow({startAuthorized: true})
      .catch((error) => {
        handle.terminal = true;
        if (this.splitReplication === handle) {
          handle.lastError = error.message;
          handle.phase = PARTITION_TRANSITION_STATE.FAILED;
        }
        this.logger.error(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_FAILED,
          {partitionId: this.partitionId, error: error.message});
      }).finally(() => handle.terminal === true ? invokeStartMethod(this,
        START_METHOD.QUIESCE_HANDLE, handle) : undefined);
    handle.runPromise = run;
    this.splitReplicationRun = run;
    return {acknowledged: true, success: true};
  }

  async waitForSplitReplicationStart(handle) {
    const response = handle.startPromise ? await handle.startPromise : null;
    return response?.acknowledged === true && handle.authorized === true &&
      handle.runPromise && this.splitReplication === handle &&
      this.isShutdown !== true && this.role === RaftRole.LEADER ? response :
      rejected(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED);
  }

  discardProvisionalSplitReplication(handle) {
    handle.terminal = true;
    handle.quiesced = true;
    if (this.splitReplication === handle) {
      this.splitReplication = handle.predecessors?.split || null;
    }
    handle.predecessors = null;
  }

  async handleStartMergeReplication(payload) {
    const request = payload || {};
    const transitionMetadata = request.transitionMetadata;
    const metadata = this.normalizeMergeTransitionMetadata(transitionMetadata);
    if (!metadata || !requestTableMatches(this, request)) {
      return rejected(PARTITION_SERVICE_ERROR_MSG.INVALID_MERGE_REPLICATION);
    }
    this.logger.info(PARTITION_SERVICE_LOG_MSG.START_MERGE_REPLICATION_REQUEST,
      {partitionId: this.partitionId,
        tableId: request.tableId || this.tableId,
        tableName: request.tableName || this.tableName,
        targetPartitionId: metadata.targetPartitionId,
        targetPartitionVersion: metadata.targetPartitionVersion});
    if (this.role !== RAFT_ROLE.LEADER) {
      return this.forwardStartMergeReplicationToLeader(
        request, transitionMetadata);
    }
    if (mergeStartIsDuplicate(this, metadata)) {
      return invokeStartMethod(this, START_METHOD.WAIT_MERGE,
        this.mergeReplication);
    }
    const predecessors = captureAdmissiblePredecessors(this, metadata);
    if (!predecessors) {
      return rejected(PARTITION_SERVICE_ERROR_MSG.MERGE_REPLICATION_STATE_REQUIRED);
    }
    const handle = createExecutionHandle(metadata,
      PARTITION_TRANSITION_STATE.MERGE_BACKFILLING, Date.now());
    handle.predecessors = predecessors;
    this.mergeReplication = handle;
    return invokeStartMethod(this, START_METHOD.START_MERGE, handle);
  }

  startMergeReplicationHandle(handle) {
    invokeStartMethod(this, START_METHOD.PREPARE_HANDLE, handle);
    if (!handle.startPromise) {
      handle.startPromise = invokeStartMethod(this,
        START_METHOD.AUTHORIZE_MERGE, handle);
    }
    return invokeStartMethod(this, START_METHOD.WAIT_MERGE, handle);
  }

  async authorizeAndRunMergeReplication(handle) {
    const {metadata} = handle;
    handle.authorizationPromise = this.emitMergeSourceAck(
      metadata, MERGE_ACK_STATUS.SNAPSHOT_STARTED);
    let authorization;
    try {
      authorization = await handle.authorizationPromise;
    } catch (error) {
      invokeStartMethod(this, START_METHOD.DISCARD_MERGE, handle);
      throw error;
    }
    if (!authorizationAccepted(authorization) || this.isShutdown === true ||
        this.role !== RAFT_ROLE.LEADER || this.mergeReplication !== handle) {
      invokeStartMethod(this, START_METHOD.DISCARD_MERGE, handle);
      return rejected(PARTITION_SERVICE_ERROR_MSG.MERGE_REPLICATION_STATE_REQUIRED);
    }
    try {
      refreshAuthorizedReplayQueue(this, handle, RECOVERED_MERGE_PHASES,
        PARTITION_SERVICE_ERROR_MSG.MERGE_REPLICATION_STATE_REQUIRED);
    } catch (error) {
      invokeStartMethod(this, START_METHOD.DISCARD_MERGE, handle);
      throw error;
    }
    handle.authorized = true;
    consumeAuthorizedPredecessors(this, handle, REPLICATION_FAMILY.MERGE);
    const run = this.runMergeReplicationWorkflow({startAuthorized: true})
      .catch((error) => this.handleMergeReplicationRunFailure(
        metadata, error, handle).finally(() => {
        handle.terminal = true;
      }))
      .finally(() => handle.terminal === true ? invokeStartMethod(this,
        START_METHOD.QUIESCE_HANDLE, handle) : undefined);
    handle.runPromise = run;
    this.mergeReplicationRun = run;
    return {acknowledged: true, success: true};
  }

  async waitForMergeReplicationStart(handle) {
    const response = handle.startPromise ? await handle.startPromise : null;
    return response?.acknowledged === true && handle.authorized === true &&
      handle.runPromise && this.mergeReplication === handle &&
      this.isShutdown !== true && this.role === RAFT_ROLE.LEADER ? response :
      rejected(PARTITION_SERVICE_ERROR_MSG.MERGE_REPLICATION_STATE_REQUIRED);
  }

  discardProvisionalMergeReplication(handle) {
    handle.terminal = true;
    handle.quiesced = true;
    if (this.mergeReplication === handle) {
      this.mergeReplication = handle.predecessors?.merge || null;
    }
    handle.predecessors = null;
  }

  prepareSourceReplicationHandle(handle) {
    handle.metadata = snapshotExecutionMetadata(handle.metadata);
    handle.authorized = handle.authorized === true;
    handle.terminal = handle.terminal === true;
    handle.quiescing = false;
    handle.quiesced = false;
    handle.authorizationPromise = null;
    handle.startPromise = null;
    handle.runPromise = null;
    handle.activities = new Set();
    handle.predecessors = handle.predecessors || null;
    return handle;
  }

  beginSourceReplicationActivity(handle) {
    if (!handle?.authorized || handle.quiescing || handle.quiesced) {
      return null;
    }
    let finish;
    const activity = {done: new Promise((resolve) => {
      finish = resolve;
    })};
    activity.finish = finish;
    handle.activities.add(activity);
    return activity;
  }

  finishSourceReplicationActivity(handle, activity) {
    if (!activity) return;
    handle.activities.delete(activity);
    activity.finish();
  }

  async quiesceSourceReplicationHandle(handle) {
    handle.quiescing = true;
    while (handle.activities.size > 0) {
      await Promise.allSettled([...handle.activities]
        .map((activity) => activity.done));
    }
    if (handle.flushPromise) {
      await Promise.allSettled([handle.flushPromise]);
    }
    handle.quiesced = true;
  }
}

function createPartitionServiceSourceReplicationStartMethods() {
  const methods = {};
  for (const name of Object.getOwnPropertyNames(
    PartitionServiceSourceReplicationStartMethods.prototype)) {
    if (name !== LOCAL_STR_CONSTRUCTOR) {
      methods[name] = PartitionServiceSourceReplicationStartMethods.prototype[name];
    }
  }
  return methods;
}

function startSplitReplicationHandleForService(service, handle) {
  return invokeStartMethod(service, START_METHOD.START_SPLIT, handle);
}

function startMergeReplicationHandleForService(service, handle) {
  return invokeStartMethod(service, START_METHOD.START_MERGE, handle);
}

function beginSourceReplicationActivityForService(service, handle) {
  return invokeStartMethod(service, START_METHOD.BEGIN_ACTIVITY, handle);
}

function finishSourceReplicationActivityForService(service, handle, activity) {
  return invokeStartMethod(service, START_METHOD.FINISH_ACTIVITY,
    handle, activity);
}

export {
  beginSourceReplicationActivityForService,
  createPartitionServiceSourceReplicationStartMethods,
  finishSourceReplicationActivityForService,
  startMergeReplicationHandleForService,
  startSplitReplicationHandleForService,
};
