import {ERRORS, SQL} from '../constants/index.js';
import {forwardSourceReplicationStart} from './managed-source-replication-start-delivery.js';
import {
  PARTICIPANT_ACK_FIELD,
  PARTICIPANT_ACK_RESULT,
} from '../workflow/workflow-constants.js';
import {
  PARTITION_SPLIT_MIRROR_ORIGIN,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {
  assertMergeRoutingDescriptorEpochForService,
  isMergeCutoverActiveForService,
  isMergeTransitionAbortedForService,
  normalizeMergeTransitionMetadataForService,
  resolveLocalTableDescriptorForService,
  resolveMergeDescriptorEpochEvidenceForService,
} from './partition-service-merge-replication-state.js';
import {
  extractSplitMirrorIdentity,
  resolveSplitSnapshotBatchRowLimit,
} from './partition-split-routing.js';
import {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SERVICE_SQL_FRAGMENT,
} from './partition-service-constants.js';
import {
  MERGE_ACK_CHECKPOINT_FIELD,
  MERGE_ACK_STATUS,
  buildMergeSourceParticipantKey,
} from './merge-ack-constants.js';
import {
  buildReplayCursorCheckpoint,
  resolveSnapshotBarrierIndex,
} from './partition-mirror-replay-cursor.js';
import {reportMergeCutoverWaitSpent} from './merge-cutover-wait-report.js';
import {
  beginSourceReplicationActivity,
  finishSourceReplicationActivity,
} from './partition-service-source-replication-start-methods.js';

/**
 * Failure acknowledgement per local phase at the moment a merge
 * replication run fails. The owner aborts the merge fail-safe on any of
 * these before cutover.
 * @type {ReadonlyMap<string, string>}
 */
const MERGE_FAILURE_ACK_STATUS_BY_PHASE = Object.freeze(new Map([
  [
    PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
    MERGE_ACK_STATUS.BACKFILL_FAILED,
  ],
  [
    PARTITION_TRANSITION_STATE.MERGE_CATCHUP,
    MERGE_ACK_STATUS.BACKFILL_FAILED,
  ],
  [
    PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
    MERGE_ACK_STATUS.CUTOVER_FAILED,
  ],
]));

async function authorizeMergeSnapshotStart(owner, metadata, options) {
  if (options.startAuthorized === true) return;
  const start = await owner.emitMergeSourceAck(
    metadata, MERGE_ACK_STATUS.SNAPSHOT_STARTED);
  const accepted = start?.result === PARTICIPANT_ACK_RESULT.ACCEPTED;
  const duplicate = start?.result === PARTICIPANT_ACK_RESULT.DUPLICATE;
  if (!accepted && !duplicate) {
    throw new Error(
      PARTITION_SERVICE_ERROR_MSG.MERGE_REPLICATION_STATE_REQUIRED);
  }
}

function mergeHandleAcceptsAfterWrite(owner, mergeReplication) {
  const metadata = mergeReplication?.metadata;
  return Boolean(metadata) &&
    metadata.sourcePartitionIds.includes(owner.partitionId) &&
    !mergeReplication.quiescing && !mergeReplication.quiesced &&
    mergeReplication.authorized === true;
}

async function runMergeBackfillPhase(owner, handle, metadata) {
  if (handle.phase !== PARTITION_TRANSITION_STATE.MERGE_BACKFILLING) return;
  handle.snapshotBarrierIndex = resolveSnapshotBarrierIndex(owner);
  handle.replayWatermarkIndex = handle.snapshotBarrierIndex;
  const snapshot = owner.openSplitSnapshotDatabase();
  try {
    await owner.backfillMergeSnapshot(snapshot, metadata);
  } finally {
    snapshot?.close?.();
  }
  handle.phase = PARTITION_TRANSITION_STATE.MERGE_CATCHUP;
}

async function runMergeCatchupPhase(owner, handle, metadata) {
  if (handle.phase !== PARTITION_TRANSITION_STATE.MERGE_CATCHUP) return;
  await owner.flushMergeReplicationQueue();
  const catchupAck = await owner.emitMergeSourceAck(
    metadata,
    MERGE_ACK_STATUS.CATCHUP_READY,
    buildReplayCursorCheckpoint(
      MERGE_ACK_CHECKPOINT_FIELD,
      handle.snapshotBarrierIndex,
      handle.replayWatermarkIndex,
    ),
  );
  if (catchupAck?.mergeCutoverApplied !== true) {
    await owner.waitForMergeCutoverActivation(metadata);
  }
  handle.phase = PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE;
}

async function runMergeCutoverPhase(owner, handle, metadata) {
  if (handle.phase !==
      PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE) return;
  await owner.flushMergeReplicationQueue();
  await owner.emitMergeSourceAck(metadata, MERGE_ACK_STATUS.CUTOVER_APPLIED);
  const mirrorRemoved = await owner.emitMergeSourceAck(
    metadata,
    MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED,
    {
      [MERGE_ACK_CHECKPOINT_FIELD.SOURCE_MIRROR_REMOVED]: true,
      ...buildReplayCursorCheckpoint(
        MERGE_ACK_CHECKPOINT_FIELD,
        handle.snapshotBarrierIndex,
        handle.replayWatermarkIndex,
      ),
    },
  );
  handle.terminal =
    mirrorRemoved?.result === PARTICIPANT_ACK_RESULT.ACCEPTED ||
    mirrorRemoved?.result === PARTICIPANT_ACK_RESULT.DUPLICATE;
}

/**
 * Normalize merge transition metadata for this source partition.
 * @param {Object|string|null} rawMetadata
 * @return {Object|null}
 * @private
 */
function normalizeMergeTransitionMetadata(service, rawMetadata) {
  return normalizeMergeTransitionMetadataForService(service, rawMetadata);
}

/**
 * Handle one failed merge replication run: mark the local handle FAILED
 * and emit the matching failure acknowledgement so the workflow owner
 * can abort the merge fail-safe BEFORE any cutover.
 * @param {Object} metadata - Normalized merge transition metadata.
 * @param {Error} error - Run failure.
 * @return {Promise<void>}
 * @private
 */
async function handleMergeReplicationRunFailure(service, metadata, error,
  mergeReplication = service.mergeReplication) {
  const failureAckStatus = service.resolveMergeFailureAckStatus();
  if (service.mergeReplication === mergeReplication) {
    mergeReplication.lastError = error.message;
    mergeReplication.phase = PARTITION_TRANSITION_STATE.FAILED;
  }
  service.logger.error(
    PARTITION_SERVICE_LOG_MSG.MERGE_REPLICATION_FAILED,
    {
      partitionId: service.partitionId,
      error: error.message,
      failureAckStatus,
    },
  );
  try {
    await service.emitMergeSourceAck(metadata, failureAckStatus);
  } catch (ackError) {
    service.logger.error(
      PARTITION_SERVICE_LOG_MSG.MERGE_REPLICATION_FAILURE_ACK_FAILED,
      {
        partitionId: service.partitionId,
        failureAckStatus,
        error: ackError?.message || ackError,
      },
    );
  }
}

/**
 * Resolve the failure acknowledgement matching the local phase at the
 * moment the run failed.
 * @return {string} MERGE_ACK_STATUS failure value.
 * @private
 */
function resolveMergeFailureAckStatus(service) {
  return MERGE_FAILURE_ACK_STATUS_BY_PHASE.get(
    service.mergeReplication?.phase,
  ) || MERGE_ACK_STATUS.SNAPSHOT_FAILED;
}

/**
 * Forward one merge replication request to the current raft leader.
 * @param {Object} payload - Merge replication request.
 * @param {Object|string} transitionMetadata - Raw transition metadata.
 * @return {Promise<Object>} Leader response or a no-leader error.
 * @private
 */
function forwardStartMergeReplicationToLeader(service, payload, transitionMetadata) {
  const leaderAddress = service.resolveLeaderAddress();
  if (leaderAddress && service.transport) {
    // A forwarding hop answers with the leader's answer (or its refusal).
    return forwardSourceReplicationStart(service.transport, leaderAddress, {
      type: PARTITION_SERVICE_MESSAGE_TYPE.START_MERGE_REPLICATION,
      partitionId: payload?.partitionId || service.partitionId,
      tableId: payload?.tableId || service.tableId,
      tableName: payload?.tableName || service.tableName,
      transitionMetadata,
    });
  }
  return Promise.resolve({
    success: false,
    error: ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
  });
}

/**
 * Run snapshot backfill, catch-up, cutover observation, and mirror
 * removal for the active merge on this source partition.
 * @return {Promise<void>}
 * @private
 */
async function runMergeReplicationWorkflow(service, options = {}) {
  const mergeReplication = service.mergeReplication;
  const metadata = mergeReplication?.metadata || null;
  if (!metadata) {
    throw new Error(
      PARTITION_SERVICE_ERROR_MSG.MERGE_REPLICATION_STATE_REQUIRED,
    );
  }
  service.logger.info(PARTITION_SERVICE_LOG_MSG.MERGE_REPLICATION_STARTED, {
    partitionId: service.partitionId,
    targetPartitionId: metadata.targetPartitionId,
    targetPartitionVersion: metadata.targetPartitionVersion,
  });
  await authorizeMergeSnapshotStart(service, metadata, options);
  await runMergeBackfillPhase(service, mergeReplication, metadata);
  await runMergeCatchupPhase(service, mergeReplication, metadata);
  await runMergeCutoverPhase(service, mergeReplication, metadata);
  if (mergeReplication.phase ===
      PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE) {
    service.logger.info(
      PARTITION_SERVICE_LOG_MSG.MERGE_REPLICATION_COMPLETED,
      {
        partitionId: service.partitionId,
        targetPartitionId: metadata.targetPartitionId,
        targetPartitionVersion: metadata.targetPartitionVersion,
      },
    );
  }
}

/**
 * Emit a typed source-side merge acknowledgement to the workflow owner.
 * @param {Object} metadata - Normalized merge transition metadata.
 * @param {string} ackStatus - MERGE_ACK_STATUS value.
 * @param {Object} [checkpoint] - Optional checkpoint data.
 * @return {Promise<Object>} Acknowledgement result.
 * @private
 */
async function emitMergeSourceAck(service, metadata, ackStatus, checkpoint) {
  const mergeWorkflow = service.sqlQueryEngine?.managedMergeWorkflow;
  if (!mergeWorkflow) {
    throw new Error(
      PARTITION_SERVICE_ERROR_MSG.MERGE_REPLICATION_STATE_REQUIRED,
    );
  }
  const workflowId = metadata.workflowId;
  if (!workflowId) {
    throw new Error(
      PARTITION_SERVICE_ERROR_MSG.MERGE_REPLICATION_STATE_REQUIRED,
    );
  }
  const ack = {
    [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
      buildMergeSourceParticipantKey(service.partitionId),
    [PARTICIPANT_ACK_FIELD.STATUS]: ackStatus,
    [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: Date.now(),
  };
  // Every source ack carries the workflow fence epoch it was started
  // under (mirrors the split source); the owner rejects a superseded
  // epoch as STALE_FENCE.
  if (Number.isInteger(metadata.workflowFenceToken)) {
    ack[PARTICIPANT_ACK_FIELD.FENCE_TOKEN] = metadata.workflowFenceToken;
  }
  // The attempt it was started under (an ack of another attempt is stale).
  ack[PARTICIPANT_ACK_FIELD.ATTEMPT] = metadata.workflowAttempt ?? 0;
  if (checkpoint) {
    ack[PARTICIPANT_ACK_FIELD.CHECKPOINT] = checkpoint;
  }
  const result = await mergeWorkflow.acknowledgeMergeSourceParticipant(
    workflowId,
    ack,
    {metadata, tableId: service.tableId, tableName: service.tableName},
  );
  service.logger.info(PARTITION_SERVICE_LOG_MSG.MERGE_REPLICATION_ACK_EMITTED, {
    partitionId: service.partitionId,
    workflowId,
    ackStatus,
    result: result?.result,
  });
  return result;
}

/**
 * Build descriptor-epoch evidence for merge mirror routing.
 * @param {Object} metadata - Normalized merge transition metadata.
 * @return {Object|null} Descriptor epoch evidence.
 * @private
 */
function resolveMergeDescriptorEpochEvidence(service, metadata) {
  return resolveMergeDescriptorEpochEvidenceForService(service, metadata);
}

/**
 * Assert merge routing still matches the descriptor epoch visible in
 * system-table metadata.
 * @param {Object} metadata - Normalized merge transition metadata.
 * @return {Object|null} Descriptor epoch decision when evidence exists.
 * @private
 */
function assertMergeRoutingDescriptorEpoch(service, metadata) {
  return assertMergeRoutingDescriptorEpochForService(service, metadata);
}

/**
 * Copy the source snapshot into the merged target partition using
 * idempotent upserts. All rows of this source's range fan in to the
 * single merged target.
 * @param {Database|Object} snapshotDb - Snapshot handle.
 * @param {Object} metadata - Normalized merge metadata.
 * @return {Promise<void>}
 * @private
 */
async function backfillMergeSnapshot(service, snapshotDb, metadata) {
  const columns = snapshotDb
    .prepare(`PRAGMA table_info(${service.tableName})`)
    .all()
    .map((column) => column.name);
  const sql =
    `SELECT * FROM ${service.tableName} ORDER BY ${metadata.primaryKeyColumn}`;
  // A better-sqlite3 statement (openSplitSnapshotDatabase): streamed.
  const rows = snapshotDb.prepare(sql).iterate();
  const batchSize = resolveSplitSnapshotBatchRowLimit(
    columns,
    service.splitSnapshotBackfillYieldEveryRows,
  );
  let batch = [];
  for (const row of rows) {
    batch.push(row);
    if (batch.length === batchSize) {
      await service.applyMergeSnapshotBatch(batch, columns, metadata);
      batch = [];
    }
    if (batch.length === 0 && service.splitSnapshotBackfillYieldEveryRows > 0) {
      await service.yieldSplitBackfillTurn();
    }
  }
  if (batch.length > 0) {
    await service.applyMergeSnapshotBatch(batch, columns, metadata);
  }
}

/**
 * Apply one bounded snapshot batch to the merged target partition as a
 * single multi-row INSERT OR REPLACE, asserting the descriptor epoch
 * once per batch (mirrors the split snapshot batch path).
 * @param {Array<Object>} rows - Source rows in primary-key order.
 * @param {Array<string>} columns - Column list.
 * @param {Object} metadata - Merge metadata.
 * @return {Promise<void>}
 * @private
 */
async function applyMergeSnapshotBatch(service, rows, columns, metadata) {
  service.assertMergeRoutingDescriptorEpoch(metadata);
  const joinedColumns = columns.join(
    PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE,
  );
  const placeholders = columns
    .map(() => PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK)
    .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
  const values = rows
    .map(() => `(${placeholders})`)
    .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
  const sql =
    `${SQL.INSERT_OR_REPLACE_INTO} ${service.tableName} (${joinedColumns}) ` +
    `${SQL.VALUES} ${values}`;
  const params = rows.flatMap(
    (row) => columns.map((column) => row[column]),
  );
  await service.routeMergeMirroredWrite(metadata, sql, params, {
    splitMirrorOrigin: PARTITION_SPLIT_MIRROR_ORIGIN.SNAPSHOT,
  });
}

/**
 * Route one mirrored merge write to the merged target partition.
 * @param {Object} metadata - Merge metadata.
 * @param {string} sql - SQL statement.
 * @param {Array} params - Statement parameters.
 * @param {Object} [options] - Mirrored write identity/routing options.
 * @return {Promise<void>}
 * @private
 */
async function routeMergeMirroredWrite(service, metadata, sql, params, options = {}) {
  return service.routeSplitMirroredWrite(
    metadata.targetPartitionId,
    sql,
    params,
    options,
  );
}

/**
 * Enqueue one merge delta under the queue bound: the durable replay
 * source is the Raft log, so the in-memory array only holds
 * post-snapshot live writes; at capacity the write path applies
 * backpressure.
 * @param {Object} mergeReplication - Active merge replication handle.
 * @param {Object} entry - Applied source write entry.
 * @return {void}
 * @private
 */
function enqueueMergeDeltaBounded(service, mergeReplication, entry) {
  if (mergeReplication.pendingEntries.length >=
      PARTITION_SERVICE_DEFAULT.MIRROR_DELTA_QUEUE_CAPACITY) {
    throw new Error(
      PARTITION_SERVICE_ERROR_MSG.MIRROR_DELTA_QUEUE_AT_CAPACITY,
    );
  }
  mergeReplication.pendingEntries.push(service.cloneSplitEntry(entry));
}

/**
 * Handle source-partition writes while a merge is in progress.
 * Backfilling/catch-up queues ordered deltas; cutover-active mirrors
 * immediately. Mirror-origin-tagged entries are skipped to prevent loops.
 * @param {Object} entry - Applied source write entry.
 * @return {Promise<void>}
 * @private
 */
async function handleMergeReplicationAfterWrite(service, entry) {
  const mergeReplication = service.mergeReplication;
  if (!mergeHandleAcceptsAfterWrite(service, mergeReplication)) {
    return;
  }
  const activity = beginSourceReplicationActivity(
    service, mergeReplication);
  if (!activity) return;
  try {
    if (entry.splitMirrorOrigin) {
      return;
    }
    if (
      mergeReplication.phase ===
        PARTITION_TRANSITION_STATE.MERGE_BACKFILLING ||
      mergeReplication.phase === PARTITION_TRANSITION_STATE.MERGE_CATCHUP
    ) {
      service.enqueueMergeDeltaBounded(mergeReplication, entry);
      return;
    }
    if (mergeReplication.phase === PARTITION_TRANSITION_STATE.FAILED) {
      // Fail closed, loudly: an acknowledged write is never silently
      // dropped from mirroring after a run failure — it is retained in the
      // queue for the aborted-merge diagnosis trail.
      service.enqueueMergeDeltaBounded(mergeReplication, entry);
      service.logger.warn(
        PARTITION_SERVICE_LOG_MSG
          .MERGE_REPLICATION_WRITE_RETAINED_AFTER_FAILURE,
        {
          partitionId: service.partitionId,
          pendingEntries: mergeReplication.pendingEntries.length,
          lastError: mergeReplication.lastError,
        },
      );
      return;
    }
    if (
      mergeReplication.phase !==
        PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE
    ) {
      return;
    }
    await service.mirrorCutoverActiveMergeWrite(entry, mergeReplication);
  } finally {
    finishSourceReplicationActivity(
      service, mergeReplication, activity);
  }
}

/**
 * Mirror one live write while the cutover is active. While older queued
 * entries remain undelivered (or a flush is draining), the new write
 * routes through the queue so source order is preserved; direct replay
 * happens only on an empty, idle queue.
 * @param {Object} entry - Applied source write entry.
 * @param {Object} mergeReplication - Active merge replication handle.
 * @return {Promise<void>}
 * @private
 */
async function mirrorCutoverActiveMergeWrite(service, entry, mergeReplication) {
  if (mergeReplication.pendingEntries.length > 0 ||
      mergeReplication.flushPromise !== null) {
    service.enqueueMergeDeltaBounded(mergeReplication, entry);
    await service.drainMergeReplicationQueueQuietly(mergeReplication);
    return;
  }
  try {
    await service.replayMergeEntry(entry, mergeReplication.metadata);
  } catch (error) {
    service.enqueueMergeDeltaBounded(mergeReplication, entry);
    mergeReplication.lastError = error.message;
    service.logger.warn(
      PARTITION_SERVICE_LOG_MSG.MERGE_REPLICATION_MIRROR_FAILED,
      {partitionId: service.partitionId, error: error.message},
    );
    await service.drainMergeReplicationQueueQuietly(mergeReplication);
  }
}

/**
 * Drain the merge queue, recording (not throwing) delivery failures so
 * the write ack path is never poisoned by a transient mirror error.
 * @param {Object} mergeReplication - Active merge replication handle.
 * @return {Promise<void>}
 * @private
 */
async function drainMergeReplicationQueueQuietly(service, mergeReplication) {
  try {
    await service.flushMergeReplicationQueue();
  } catch (flushError) {
    mergeReplication.lastError = flushError.message;
    service.logger.warn(
      PARTITION_SERVICE_LOG_MSG.MERGE_REPLICATION_MIRROR_FAILED,
      {partitionId: service.partitionId, error: flushError.message},
    );
  }
}

/**
 * Flush queued post-snapshot merge deltas in source order. The
 * in-flight flush is exposed as a joinable promise so concurrent
 * callers await the SAME drain instead of returning while entries
 * remain queued.
 * @return {Promise<void>}
 * @private
 */
function flushMergeReplicationQueue(service) {
  const mergeReplication = service.mergeReplication;
  if (!mergeReplication) {
    return Promise.resolve();
  }
  if (mergeReplication.flushPromise !== null) {
    return mergeReplication.flushPromise;
  }
  const flushPromise = service.drainMergeReplicationQueue(mergeReplication)
    .finally(() => {
      if (mergeReplication.flushPromise === flushPromise) {
        mergeReplication.flushPromise = null;
      }
    });
  mergeReplication.flushPromise = flushPromise;
  return flushPromise;
}

/**
 * Drain queued merge entries in source order, re-queueing the head
 * entry on failure so ordering is preserved for the next flush.
 * @param {Object} mergeReplication - Active merge replication handle.
 * @return {Promise<void>}
 * @private
 */
async function drainMergeReplicationQueue(service, mergeReplication) {
  while (mergeReplication.pendingEntries.length > 0) {
    const entry = mergeReplication.pendingEntries.shift();
    try {
      await service.replayMergeEntry(entry, mergeReplication.metadata);
    } catch (error) {
      mergeReplication.pendingEntries.unshift(entry);
      throw error;
    }
    // Advance the durable replay watermark behind each delivered
    // delta (mirrors the split drain).
    if (Number.isSafeInteger(entry.logIndex) && entry.logIndex > 0) {
      mergeReplication.replayWatermarkIndex = Math.max(
        Number(mergeReplication.replayWatermarkIndex) || 0,
        entry.logIndex,
      );
    }
  }
}

/**
 * Replay one queued source write against the merged target partition.
 * Merge fan-in needs no key routing: every source write goes to the
 * single merged target.
 * @param {Object} entry - Applied source write entry.
 * @param {Object} metadata - Merge metadata.
 * @return {Promise<void>}
 * @private
 */
async function replayMergeEntry(service, entry, metadata) {
  service.assertMergeRoutingDescriptorEpoch(metadata);
  await service.routeMergeMirroredWrite(
    metadata,
    entry.sql,
    entry.params || [],
    extractSplitMirrorIdentity(entry),
  );
}

/**
 * Wait for the workflow owner's durable merge cutover to become visible
 * in the local system-table cache. Owner decides; this source observes.
 * @param {Object} metadata - Merge metadata.
 * @return {Promise<void>}
 * @private
 */
async function waitForMergeCutoverActivation(service, metadata) {
  const intervalMs = PARTITION_SERVICE_DEFAULT.MERGE_CUTOVER_WAIT_INTERVAL_MS;
  const timeoutMs = PARTITION_SERVICE_DEFAULT.MERGE_CUTOVER_WAIT_TIMEOUT_MS;
  const startedAtMs = Date.now();
  const deadline = startedAtMs + timeoutMs;
  let polls = 0;
  while (Date.now() < deadline) {
    polls += 1;
    if (service.isShutdown) {
      throw new Error(
        PARTITION_SERVICE_ERROR_MSG.MERGE_CUTOVER_WAIT_TIMEOUT,
      );
    }
    if (service.isMergeCutoverActive(metadata)) {
      service.logger.info(
        PARTITION_SERVICE_LOG_MSG.MERGE_REPLICATION_CUTOVER_OBSERVED,
        {
          partitionId: service.partitionId,
          targetPartitionVersion: metadata.targetPartitionVersion,
        },
      );
      return;
    }
    if (service.isMergeTransitionAborted()) {
      // The owner aborted the merge fail-safe (peer source failure):
      // stop waiting immediately instead of polling to timeout.
      throw new Error(
        PARTITION_SERVICE_ERROR_MSG.MERGE_CUTOVER_WAIT_ABORTED,
      );
    }
    // Awaited sleep: intentionally NOT unref'd — an unref'd awaited
    // timer lets the event loop drain mid-wait. Shutdown-awareness is
    // handled by the isShutdown check at the top of each iteration.
    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }
  reportMergeCutoverWaitSpent(service, metadata, {startedAtMs, polls});
  throw new Error(PARTITION_SERVICE_ERROR_MSG.MERGE_CUTOVER_WAIT_TIMEOUT);
}

/**
 * Resolve whether the durable transition observed locally is an
 * aborted (FAILED) merge.
 * @return {boolean}
 * @private
 */
function isMergeTransitionAborted(service) {
  return isMergeTransitionAbortedForService(service);
}

/**
 * Resolve the local system-table cache's tables row for this
 * partition's table.
 * @return {Object|null}
 * @private
 */
function resolveLocalTableDescriptor(service) {
  return resolveLocalTableDescriptorForService(service);
}

/**
 * Resolve whether the durable merge cutover is visible locally.
 * @param {Object} metadata - Merge metadata.
 * @return {boolean}
 * @private
 */
function isMergeCutoverActive(service, metadata) {
  return isMergeCutoverActiveForService(service, metadata);
}

export {
  applyMergeSnapshotBatch,
  assertMergeRoutingDescriptorEpoch,
  backfillMergeSnapshot,
  drainMergeReplicationQueue,
  drainMergeReplicationQueueQuietly,
  emitMergeSourceAck,
  enqueueMergeDeltaBounded,
  flushMergeReplicationQueue,
  forwardStartMergeReplicationToLeader,
  handleMergeReplicationAfterWrite,
  handleMergeReplicationRunFailure,
  isMergeCutoverActive,
  isMergeTransitionAborted,
  mirrorCutoverActiveMergeWrite,
  normalizeMergeTransitionMetadata,
  replayMergeEntry,
  resolveLocalTableDescriptor,
  resolveMergeDescriptorEpochEvidence,
  resolveMergeFailureAckStatus,
  routeMergeMirroredWrite,
  runMergeReplicationWorkflow,
  waitForMergeCutoverActivation,
};
