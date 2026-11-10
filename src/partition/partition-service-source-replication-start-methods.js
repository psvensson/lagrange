import {ERRORS} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {PARTICIPANT_ACK_RESULT} from '../workflow/workflow-constants.js';
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {forwardSourceReplicationStart} from './managed-source-replication-start-delivery.js';
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
const REPLICATION_FAMILY = Object.freeze({SPLIT: 'split', MERGE: 'merge'});
const RECOVERED_SPLIT_PHASES = /* @__PURE__ */ new Set([
  PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
  PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
]);
const RECOVERED_MERGE_PHASES = /* @__PURE__ */ new Set([
  PARTITION_TRANSITION_STATE.MERGE_CATCHUP,
  PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
]);
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
    // A forwarding hop answers with the leader's answer (or its refusal).
    return forwardSourceReplicationStart(service.transport, leaderAddress, {
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
  return {success: false, error};
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

function isSameSplitReplication(service, left, right) {
  return startIdentityMatches(left, right) &&
    left.primaryKeyColumn === right.primaryKeyColumn &&
    left.sourcePartitionId === right.sourcePartitionId &&
    left.splitKey === right.splitKey &&
    left.targetPartitionVersion === right.targetPartitionVersion &&
    sameArray(left.targetPartitionIds, right.targetPartitionIds);
}

function isSameMergeReplication(service, left, right) {
  return startIdentityMatches(left, right) &&
    left.primaryKeyColumn === right.primaryKeyColumn &&
    left.targetPartitionId === right.targetPartitionId &&
    left.targetPartitionVersion === right.targetPartitionVersion &&
    sameArray(left.sourcePartitionIds, right.sourcePartitionIds);
}

async function handleStartSplitReplication(service, payload) {
  const request = payload || {};
  const transitionMetadata = request.transitionMetadata;
  const metadata = service.normalizeSplitTransitionMetadata(transitionMetadata);
  if (!metadata || !requestTableMatches(service, request)) {
    return rejected(PARTITION_SERVICE_ERROR_MSG.INVALID_SPLIT_REPLICATION);
  }
  service.logger.info(PARTITION_SERVICE_LOG_MSG.START_SPLIT_REPLICATION_REQUEST,
    {partitionId: service.partitionId,
      tableId: request.tableId || service.tableId,
      tableName: request.tableName || service.tableName,
      targetPartitionIds: metadata.targetPartitionIds,
      targetPartitionVersion: metadata.targetPartitionVersion});
  const followerResponse = forwardSplitStartIfFollower(
    service, request, transitionMetadata);
  if (followerResponse) return followerResponse;
  if (splitStartIsDuplicate(service, metadata)) {
    return waitForSplitReplicationStart(service, service.splitReplication);
  }
  const predecessors = captureAdmissiblePredecessors(service, metadata);
  if (!predecessors) {
    return rejected(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED);
  }
  const handle = createExecutionHandle(metadata,
    PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING, service.timeSource.now());
  handle.predecessors = predecessors;
  service.splitReplication = handle;
  return startSplitReplicationHandle(service, handle);
}

function startSplitReplicationHandle(service, handle) {
  prepareSourceReplicationHandle(service, handle);
  if (!handle.startPromise) {
    handle.startPromise = authorizeAndRunSplitReplication(service, handle);
  }
  return waitForSplitReplicationStart(service, handle);
}

async function authorizeAndRunSplitReplication(service, handle) {
  const {metadata} = handle;
  handle.authorizationPromise = service.emitSplitSourceAck(
    metadata, SPLIT_ACK_STATUS.SNAPSHOT_STARTED);
  let authorization;
  try {
    authorization = await handle.authorizationPromise;
  } catch (error) {
    discardProvisionalSplitReplication(service, handle);
    throw error;
  }
  if (!authorizationAccepted(authorization) || service.isShutdown === true ||
      service.role !== RaftRole.LEADER || service.splitReplication !== handle) {
    discardProvisionalSplitReplication(service, handle);
    return rejected(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED);
  }
  try {
    refreshAuthorizedReplayQueue(service, handle, RECOVERED_SPLIT_PHASES,
      PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED);
  } catch (error) {
    discardProvisionalSplitReplication(service, handle);
    throw error;
  }
  handle.authorized = true;
  consumeAuthorizedPredecessors(service, handle, REPLICATION_FAMILY.SPLIT);
  const run = service.runSplitReplicationWorkflow({startAuthorized: true})
    .catch((error) => {
      handle.terminal = true;
      if (service.splitReplication === handle) {
        handle.lastError = error.message;
        handle.phase = PARTITION_TRANSITION_STATE.FAILED;
      }
      service.logger.error(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_FAILED,
        {partitionId: service.partitionId, error: error.message});
    }).finally(() => handle.terminal === true ?
      quiesceSourceReplicationHandle(service, handle) : undefined);
  handle.runPromise = run;
  service.splitReplicationRun = run;
  return {success: true};
}

async function waitForSplitReplicationStart(service, handle) {
  const response = handle.startPromise ? await handle.startPromise : null;
  return response?.success === true && handle.authorized === true &&
    handle.runPromise && service.splitReplication === handle &&
    service.isShutdown !== true && service.role === RaftRole.LEADER ? response :
    rejected(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED);
}

function discardProvisionalSplitReplication(service, handle) {
  handle.terminal = true;
  handle.quiesced = true;
  if (service.splitReplication === handle) {
    service.splitReplication = handle.predecessors?.split || null;
  }
  handle.predecessors = null;
}

async function handleStartMergeReplication(service, payload) {
  const request = payload || {};
  const transitionMetadata = request.transitionMetadata;
  const metadata = service.normalizeMergeTransitionMetadata(transitionMetadata);
  if (!metadata || !requestTableMatches(service, request)) {
    return rejected(PARTITION_SERVICE_ERROR_MSG.INVALID_MERGE_REPLICATION);
  }
  service.logger.info(PARTITION_SERVICE_LOG_MSG.START_MERGE_REPLICATION_REQUEST,
    {partitionId: service.partitionId,
      tableId: request.tableId || service.tableId,
      tableName: request.tableName || service.tableName,
      targetPartitionId: metadata.targetPartitionId,
      targetPartitionVersion: metadata.targetPartitionVersion});
  if (service.role !== RAFT_ROLE.LEADER) {
    return service.forwardStartMergeReplicationToLeader(
      request, transitionMetadata);
  }
  if (mergeStartIsDuplicate(service, metadata)) {
    return waitForMergeReplicationStart(service, service.mergeReplication);
  }
  const predecessors = captureAdmissiblePredecessors(service, metadata);
  if (!predecessors) {
    return rejected(PARTITION_SERVICE_ERROR_MSG.MERGE_REPLICATION_STATE_REQUIRED);
  }
  const handle = createExecutionHandle(metadata,
    PARTITION_TRANSITION_STATE.MERGE_BACKFILLING, Date.now());
  handle.predecessors = predecessors;
  service.mergeReplication = handle;
  return startMergeReplicationHandle(service, handle);
}

function startMergeReplicationHandle(service, handle) {
  prepareSourceReplicationHandle(service, handle);
  if (!handle.startPromise) {
    handle.startPromise = authorizeAndRunMergeReplication(service, handle);
  }
  return waitForMergeReplicationStart(service, handle);
}

async function authorizeAndRunMergeReplication(service, handle) {
  const {metadata} = handle;
  handle.authorizationPromise = service.emitMergeSourceAck(
    metadata, MERGE_ACK_STATUS.SNAPSHOT_STARTED);
  let authorization;
  try {
    authorization = await handle.authorizationPromise;
  } catch (error) {
    discardProvisionalMergeReplication(service, handle);
    throw error;
  }
  if (!authorizationAccepted(authorization) || service.isShutdown === true ||
      service.role !== RAFT_ROLE.LEADER || service.mergeReplication !== handle) {
    discardProvisionalMergeReplication(service, handle);
    return rejected(PARTITION_SERVICE_ERROR_MSG.MERGE_REPLICATION_STATE_REQUIRED);
  }
  try {
    refreshAuthorizedReplayQueue(service, handle, RECOVERED_MERGE_PHASES,
      PARTITION_SERVICE_ERROR_MSG.MERGE_REPLICATION_STATE_REQUIRED);
  } catch (error) {
    discardProvisionalMergeReplication(service, handle);
    throw error;
  }
  handle.authorized = true;
  consumeAuthorizedPredecessors(service, handle, REPLICATION_FAMILY.MERGE);
  const run = service.runMergeReplicationWorkflow({startAuthorized: true})
    .catch((error) => service.handleMergeReplicationRunFailure(
      metadata, error, handle).finally(() => {
      handle.terminal = true;
    }))
    .finally(() => handle.terminal === true ?
      quiesceSourceReplicationHandle(service, handle) : undefined);
  handle.runPromise = run;
  service.mergeReplicationRun = run;
  return {success: true};
}

async function waitForMergeReplicationStart(service, handle) {
  const response = handle.startPromise ? await handle.startPromise : null;
  return response?.success === true && handle.authorized === true &&
    handle.runPromise && service.mergeReplication === handle &&
    service.isShutdown !== true && service.role === RAFT_ROLE.LEADER ? response :
    rejected(PARTITION_SERVICE_ERROR_MSG.MERGE_REPLICATION_STATE_REQUIRED);
}

function discardProvisionalMergeReplication(service, handle) {
  handle.terminal = true;
  handle.quiesced = true;
  if (service.mergeReplication === handle) {
    service.mergeReplication = handle.predecessors?.merge || null;
  }
  handle.predecessors = null;
}

function prepareSourceReplicationHandle(service, handle) {
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

function beginSourceReplicationActivity(service, handle) {
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

function finishSourceReplicationActivity(service, handle, activity) {
  if (!activity) return;
  handle.activities.delete(activity);
  activity.finish();
}

async function quiesceSourceReplicationHandle(service, handle) {
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

export {
  authorizeAndRunMergeReplication,
  authorizeAndRunSplitReplication,
  beginSourceReplicationActivity,
  discardProvisionalMergeReplication,
  discardProvisionalSplitReplication,
  finishSourceReplicationActivity,
  handleStartMergeReplication,
  handleStartSplitReplication,
  isSameMergeReplication,
  isSameSplitReplication,
  prepareSourceReplicationHandle,
  quiesceSourceReplicationHandle,
  startMergeReplicationHandle,
  startSplitReplicationHandle,
  waitForMergeReplicationStart,
  waitForSplitReplicationStart,
};
