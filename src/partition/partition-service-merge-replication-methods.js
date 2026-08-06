import {ERRORS, SQL} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {PARTICIPANT_ACK_FIELD} from '../workflow/workflow-constants.js';
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
  PARTITION_SERVICE_TYPE,
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

const LOCAL_STR_CONSTRUCTOR = 'constructor';

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

class PartitionServiceMergeReplicationMethods {
  /**
   * Normalize merge transition metadata for this source partition.
   * @param {Object|string|null} rawMetadata
   * @return {Object|null}
   * @private
   */
  normalizeMergeTransitionMetadata(rawMetadata) {
    return normalizeMergeTransitionMetadataForService(this, rawMetadata);
  }

  /**
   * Determine whether two merge-replication descriptors describe the
   * same merge.
   * @param {Object|null} left
   * @param {Object|null} right
   * @return {boolean}
   * @private
   */
  isSameMergeReplication(left, right) {
    if (!left || !right) {
      return false;
    }
    return (
      left.primaryKeyColumn === right.primaryKeyColumn &&
      left.targetPartitionId === right.targetPartitionId &&
      left.targetPartitionVersion === right.targetPartitionVersion &&
      Array.isArray(left.sourcePartitionIds) &&
      Array.isArray(right.sourcePartitionIds) &&
      left.sourcePartitionIds.length === right.sourcePartitionIds.length &&
      left.sourcePartitionIds.every(
        (partitionId, index) =>
          partitionId === right.sourcePartitionIds[index],
      )
    );
  }

  /**
   * Validate and start one source-partition merge replication workflow.
   * The request is acknowledged once accepted; backfill/catch-up continues
   * asynchronously on the source leader.
   * @param {Object} payload - Merge replication request.
   * @return {Promise<Object>} ACK response.
   * @private
   */
  async handleStartMergeReplication(payload) {
    const transitionMetadata = payload?.transitionMetadata;
    const metadata = this.normalizeMergeTransitionMetadata(transitionMetadata);
    if (!metadata) {
      return {
        acknowledged: false,
        error: PARTITION_SERVICE_ERROR_MSG.INVALID_MERGE_REPLICATION,
      };
    }
    this.logger.info(
      PARTITION_SERVICE_LOG_MSG.START_MERGE_REPLICATION_REQUEST,
      {
        partitionId: this.partitionId,
        tableId: payload?.tableId || this.tableId,
        tableName: payload?.tableName || this.tableName,
        targetPartitionId: metadata.targetPartitionId,
        targetPartitionVersion: metadata.targetPartitionVersion,
      },
    );
    if (this.role !== RAFT_ROLE.LEADER) {
      return this.forwardStartMergeReplicationToLeader(
        payload,
        transitionMetadata,
      );
    }
    const inFlightResponse =
      this.resolveInFlightMergeReplicationResponse(metadata);
    if (inFlightResponse) {
      return inFlightResponse;
    }
    this.mergeReplication = {
      metadata,
      phase: PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
      pendingEntries: [],
      flushPromise: null,
      startedAt: Date.now(),
      lastError: null,
    };
    this.mergeReplicationRun = this.runMergeReplicationWorkflow().catch(
      (error) => this.handleMergeReplicationRunFailure(metadata, error),
    );
    return {acknowledged: true, success: true};
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
  async handleMergeReplicationRunFailure(metadata, error) {
    const failureAckStatus = this.resolveMergeFailureAckStatus();
    if (this.mergeReplication) {
      this.mergeReplication.lastError = error.message;
      this.mergeReplication.phase = PARTITION_TRANSITION_STATE.FAILED;
    }
    this.logger.error(
      PARTITION_SERVICE_LOG_MSG.MERGE_REPLICATION_FAILED,
      {
        partitionId: this.partitionId,
        error: error.message,
        failureAckStatus,
      },
    );
    try {
      await this.emitMergeSourceAck(metadata, failureAckStatus);
    } catch (ackError) {
      this.logger.error(
        PARTITION_SERVICE_LOG_MSG.MERGE_REPLICATION_FAILURE_ACK_FAILED,
        {
          partitionId: this.partitionId,
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
  resolveMergeFailureAckStatus() {
    return MERGE_FAILURE_ACK_STATUS_BY_PHASE.get(
      this.mergeReplication?.phase,
    ) || MERGE_ACK_STATUS.SNAPSHOT_FAILED;
  }

  /**
   * Forward one merge replication request to the current raft leader.
   * @param {Object} payload - Merge replication request.
   * @param {Object|string} transitionMetadata - Raw transition metadata.
   * @return {Promise<Object>} Leader response or a no-leader error.
   * @private
   */
  forwardStartMergeReplicationToLeader(payload, transitionMetadata) {
    const leaderAddress = this.resolveLeaderAddress();
    if (leaderAddress && this.transport) {
      return this.transport.deliver(leaderAddress, {
        type: PARTITION_SERVICE_MESSAGE_TYPE.START_MERGE_REPLICATION,
        partitionId: payload?.partitionId || this.partitionId,
        tableId: payload?.tableId || this.tableId,
        tableName: payload?.tableName || this.tableName,
        transitionMetadata,
      });
    }
    return Promise.resolve({
      acknowledged: false,
      error: ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
    });
  }

  /**
   * Resolve the idempotency/conflict response for one merge replication
   * request while a replication handle is already installed.
   * @param {Object} metadata - Normalized merge transition metadata.
   * @return {Object|null} Response to return, or null to proceed.
   * @private
   */
  resolveInFlightMergeReplicationResponse(metadata) {
    if (
      this.mergeReplication &&
      this.isSameMergeReplication(this.mergeReplication.metadata, metadata)
    ) {
      return {acknowledged: true, success: true};
    }
    if (this.mergeReplication || this.splitReplication) {
      return {
        acknowledged: false,
        error: PARTITION_SERVICE_ERROR_MSG.MERGE_REPLICATION_STATE_REQUIRED,
      };
    }
    return null;
  }

  /**
   * Run snapshot backfill, catch-up, cutover observation, and mirror
   * removal for the active merge on this source partition.
   * @return {Promise<void>}
   * @private
   */
  async runMergeReplicationWorkflow() {
    const mergeReplication = this.mergeReplication;
    const metadata = mergeReplication?.metadata || null;
    if (!metadata) {
      throw new Error(
        PARTITION_SERVICE_ERROR_MSG.MERGE_REPLICATION_STATE_REQUIRED,
      );
    }
    this.logger.info(PARTITION_SERVICE_LOG_MSG.MERGE_REPLICATION_STARTED, {
      partitionId: this.partitionId,
      targetPartitionId: metadata.targetPartitionId,
      targetPartitionVersion: metadata.targetPartitionVersion,
    });
    await this.emitMergeSourceAck(metadata, MERGE_ACK_STATUS.SNAPSHOT_STARTED);
    // The snapshot barrier: every Raft log entry up to and including
    // this index is covered by the backfill, so the replay watermark
    // starts here and a restarted source replays from the durable log.
    mergeReplication.snapshotBarrierIndex =
      resolveSnapshotBarrierIndex(this);
    mergeReplication.replayWatermarkIndex =
      mergeReplication.snapshotBarrierIndex;
    const snapshot = this.openSplitSnapshotDatabase();
    try {
      await this.backfillMergeSnapshot(snapshot, metadata);
      mergeReplication.phase = PARTITION_TRANSITION_STATE.MERGE_CATCHUP;
      // Drain every queued live write BEFORE acknowledging catch-up
      // readiness: the owner may apply the durable cutover on this ack,
      // and it must never fire while this source holds a known
      // undelivered delta.
      await this.flushMergeReplicationQueue();
      const catchupAck = await this.emitMergeSourceAck(
        metadata,
        MERGE_ACK_STATUS.CATCHUP_READY,
        buildReplayCursorCheckpoint(
          MERGE_ACK_CHECKPOINT_FIELD,
          mergeReplication.snapshotBarrierIndex,
          mergeReplication.replayWatermarkIndex,
        ),
      );
      if (catchupAck?.mergeCutoverApplied !== true) {
        await this.waitForMergeCutoverActivation(metadata);
      }
      mergeReplication.phase =
        PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE;
      await this.flushMergeReplicationQueue();
      await this.emitMergeSourceAck(
        metadata,
        MERGE_ACK_STATUS.CUTOVER_APPLIED,
      );
      this.mergeReplication = null;
      this.mergeReplicationRun = null;
      await this.emitMergeSourceAck(
        metadata,
        MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED,
        {
          [MERGE_ACK_CHECKPOINT_FIELD.SOURCE_MIRROR_REMOVED]: true,
          ...buildReplayCursorCheckpoint(
            MERGE_ACK_CHECKPOINT_FIELD,
            mergeReplication.snapshotBarrierIndex,
            mergeReplication.replayWatermarkIndex,
          ),
        },
      );
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG.MERGE_REPLICATION_COMPLETED,
        {
          partitionId: this.partitionId,
          targetPartitionId: metadata.targetPartitionId,
          targetPartitionVersion: metadata.targetPartitionVersion,
        },
      );
    } finally {
      snapshot?.close?.();
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
  async emitMergeSourceAck(metadata, ackStatus, checkpoint) {
    const mergeWorkflow = this.sqlQueryEngine?.managedMergeWorkflow;
    if (
      !mergeWorkflow ||
      typeof mergeWorkflow.acknowledgeMergeSourceParticipant !==
        PARTITION_SERVICE_TYPE.FUNCTION
    ) {
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
        buildMergeSourceParticipantKey(this.partitionId),
      [PARTICIPANT_ACK_FIELD.STATUS]: ackStatus,
      [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: Date.now(),
    };
    // Every source ack carries the workflow fence epoch it was started
    // under (mirrors the split source); the owner rejects a superseded
    // epoch as STALE_FENCE.
    if (Number.isInteger(metadata.workflowFenceToken)) {
      ack[PARTICIPANT_ACK_FIELD.FENCE_TOKEN] = metadata.workflowFenceToken;
    }
    if (checkpoint) {
      ack[PARTICIPANT_ACK_FIELD.CHECKPOINT] = checkpoint;
    }
    const result = await mergeWorkflow.acknowledgeMergeSourceParticipant(
      workflowId,
      ack,
    );
    this.logger.info(PARTITION_SERVICE_LOG_MSG.MERGE_REPLICATION_ACK_EMITTED, {
      partitionId: this.partitionId,
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
  resolveMergeDescriptorEpochEvidence(metadata) {
    return resolveMergeDescriptorEpochEvidenceForService(this, metadata);
  }

  /**
   * Assert merge routing still matches the descriptor epoch visible in
   * system-table metadata.
   * @param {Object} metadata - Normalized merge transition metadata.
   * @return {Object|null} Descriptor epoch decision when evidence exists.
   * @private
   */
  assertMergeRoutingDescriptorEpoch(metadata) {
    return assertMergeRoutingDescriptorEpochForService(this, metadata);
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
  async backfillMergeSnapshot(snapshotDb, metadata) {
    const columns = snapshotDb
      .prepare(`PRAGMA table_info(${this.tableName})`)
      .all()
      .map((column) => column.name);
    const sql =
      `SELECT * FROM ${this.tableName} ORDER BY ${metadata.primaryKeyColumn}`;
    const statement = snapshotDb.prepare(sql);
    const rows =
      statement && typeof statement.iterate ===
        PARTITION_SERVICE_TYPE.FUNCTION ?
        statement.iterate() :
        (statement && typeof statement.all ===
          PARTITION_SERVICE_TYPE.FUNCTION ?
          statement.all() :
          []);
    const batchSize = resolveSplitSnapshotBatchRowLimit(
      columns,
      this.splitSnapshotBackfillYieldEveryRows,
    );
    let batch = [];
    for (const row of rows) {
      batch.push(row);
      if (batch.length === batchSize) {
        await this.applyMergeSnapshotBatch(batch, columns, metadata);
        batch = [];
      }
      if (batch.length === 0 && this.splitSnapshotBackfillYieldEveryRows > 0) {
        await this.yieldSplitBackfillTurn();
      }
    }
    if (batch.length > 0) {
      await this.applyMergeSnapshotBatch(batch, columns, metadata);
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
  async applyMergeSnapshotBatch(rows, columns, metadata) {
    this.assertMergeRoutingDescriptorEpoch(metadata);
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
      `${SQL.INSERT_OR_REPLACE_INTO} ${this.tableName} (${joinedColumns}) ` +
      `${SQL.VALUES} ${values}`;
    const params = rows.flatMap(
      (row) => columns.map((column) => row[column]),
    );
    await this.routeMergeMirroredWrite(metadata, sql, params, {
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
  async routeMergeMirroredWrite(metadata, sql, params, options = {}) {
    return this.routeSplitMirroredWrite(
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
  enqueueMergeDeltaBounded(mergeReplication, entry) {
    if (mergeReplication.pendingEntries.length >=
        PARTITION_SERVICE_DEFAULT.MIRROR_DELTA_QUEUE_CAPACITY) {
      throw new Error(
        PARTITION_SERVICE_ERROR_MSG.MIRROR_DELTA_QUEUE_AT_CAPACITY,
      );
    }
    mergeReplication.pendingEntries.push(this.cloneSplitEntry(entry));
  }

  /**
   * Handle source-partition writes while a merge is in progress.
   * Backfilling/catch-up queues ordered deltas; cutover-active mirrors
   * immediately. Mirror-origin-tagged entries are skipped to prevent loops.
   * @param {Object} entry - Applied source write entry.
   * @return {Promise<void>}
   * @private
   */
  async handleMergeReplicationAfterWrite(entry) {
    const mergeReplication = this.mergeReplication;
    if (
      !mergeReplication ||
      !mergeReplication.metadata ||
      !mergeReplication.metadata.sourcePartitionIds.includes(this.partitionId)
    ) {
      return;
    }
    if (entry.splitMirrorOrigin) {
      return;
    }
    if (
      mergeReplication.phase ===
        PARTITION_TRANSITION_STATE.MERGE_BACKFILLING ||
      mergeReplication.phase === PARTITION_TRANSITION_STATE.MERGE_CATCHUP
    ) {
      this.enqueueMergeDeltaBounded(mergeReplication, entry);
      return;
    }
    if (mergeReplication.phase === PARTITION_TRANSITION_STATE.FAILED) {
      // Fail closed, loudly: an acknowledged write is never silently
      // dropped from mirroring after a run failure — it is retained in the
      // queue for the aborted-merge diagnosis trail.
      this.enqueueMergeDeltaBounded(mergeReplication, entry);
      this.logger.warn(
        PARTITION_SERVICE_LOG_MSG
          .MERGE_REPLICATION_WRITE_RETAINED_AFTER_FAILURE,
        {
          partitionId: this.partitionId,
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
    await this.mirrorCutoverActiveMergeWrite(entry, mergeReplication);
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
  async mirrorCutoverActiveMergeWrite(entry, mergeReplication) {
    if (mergeReplication.pendingEntries.length > 0 ||
        mergeReplication.flushPromise !== null) {
      this.enqueueMergeDeltaBounded(mergeReplication, entry);
      await this.drainMergeReplicationQueueQuietly(mergeReplication);
      return;
    }
    try {
      await this.replayMergeEntry(entry, mergeReplication.metadata);
    } catch (error) {
      this.enqueueMergeDeltaBounded(mergeReplication, entry);
      mergeReplication.lastError = error.message;
      this.logger.warn(
        PARTITION_SERVICE_LOG_MSG.MERGE_REPLICATION_MIRROR_FAILED,
        {partitionId: this.partitionId, error: error.message},
      );
      await this.drainMergeReplicationQueueQuietly(mergeReplication);
    }
  }

  /**
   * Drain the merge queue, recording (not throwing) delivery failures so
   * the write ack path is never poisoned by a transient mirror error.
   * @param {Object} mergeReplication - Active merge replication handle.
   * @return {Promise<void>}
   * @private
   */
  async drainMergeReplicationQueueQuietly(mergeReplication) {
    try {
      await this.flushMergeReplicationQueue();
    } catch (flushError) {
      mergeReplication.lastError = flushError.message;
      this.logger.warn(
        PARTITION_SERVICE_LOG_MSG.MERGE_REPLICATION_MIRROR_FAILED,
        {partitionId: this.partitionId, error: flushError.message},
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
  flushMergeReplicationQueue() {
    const mergeReplication = this.mergeReplication;
    if (!mergeReplication) {
      return Promise.resolve();
    }
    if (mergeReplication.flushPromise !== null) {
      return mergeReplication.flushPromise;
    }
    const flushPromise = this.drainMergeReplicationQueue(mergeReplication)
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
  async drainMergeReplicationQueue(mergeReplication) {
    while (mergeReplication.pendingEntries.length > 0) {
      const entry = mergeReplication.pendingEntries.shift();
      try {
        await this.replayMergeEntry(entry, mergeReplication.metadata);
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
  async replayMergeEntry(entry, metadata) {
    this.assertMergeRoutingDescriptorEpoch(metadata);
    await this.routeMergeMirroredWrite(
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
  async waitForMergeCutoverActivation(metadata) {
    const intervalMs = PARTITION_SERVICE_DEFAULT.MERGE_CUTOVER_WAIT_INTERVAL_MS;
    const timeoutMs = PARTITION_SERVICE_DEFAULT.MERGE_CUTOVER_WAIT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.isShutdown) {
        throw new Error(
          PARTITION_SERVICE_ERROR_MSG.MERGE_CUTOVER_WAIT_TIMEOUT,
        );
      }
      if (this.isMergeCutoverActive(metadata)) {
        this.logger.info(
          PARTITION_SERVICE_LOG_MSG.MERGE_REPLICATION_CUTOVER_OBSERVED,
          {
            partitionId: this.partitionId,
            targetPartitionVersion: metadata.targetPartitionVersion,
          },
        );
        return;
      }
      if (this.isMergeTransitionAborted()) {
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
    throw new Error(PARTITION_SERVICE_ERROR_MSG.MERGE_CUTOVER_WAIT_TIMEOUT);
  }

  /**
   * Resolve whether the durable transition observed locally is an
   * aborted (FAILED) merge.
   * @return {boolean}
   * @private
   */
  isMergeTransitionAborted() {
    return isMergeTransitionAbortedForService(this);
  }

  /**
   * Resolve the local system-table cache's tables row for this
   * partition's table.
   * @return {Object|null}
   * @private
   */
  resolveLocalTableDescriptor() {
    return resolveLocalTableDescriptorForService(this);
  }

  /**
   * Resolve whether the durable merge cutover is visible locally.
   * @param {Object} metadata - Merge metadata.
   * @return {boolean}
   * @private
   */
  isMergeCutoverActive(metadata) {
    return isMergeCutoverActiveForService(this, metadata);
  }
}

function createPartitionServiceMergeReplicationMethods() {
  const methods = {};
  const prototypeNames = Object.getOwnPropertyNames(
    PartitionServiceMergeReplicationMethods.prototype,
  );
  for (const name of prototypeNames) {
    if (name !== LOCAL_STR_CONSTRUCTOR) {
      methods[name] =
        PartitionServiceMergeReplicationMethods.prototype[name];
    }
  }
  return methods;
}

export {
  createPartitionServiceMergeReplicationMethods,
};
