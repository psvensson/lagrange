import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {PartitionServiceCdcStreamBase} from './partition-service-cdc-stream-base.js';
import {
  assertSplitRoutingDescriptorEpochForService,
  isSameSplitReplicationMetadata,
  normalizeSplitTransitionMetadataForService,
  reconstructSplitExecutionStateForService,
  resolveSplitDescriptorEpochEvidenceForService,
} from './partition-service-split-replication-state.js';

const {
  CONTROL_PLANE_MUTATION_OPERATION,
  Database,
  PARTICIPANT_ACK_FIELD,
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_TYPE,
  PARTITION_SPLIT_MIRROR_ORIGIN,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  PRESSURE_WORK_CLASS,
  RaftRole,
  SPLIT_ACK_CHECKPOINT_FIELD,
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
  TABLES,
  assertCritical,
  cloneSplitRoutingEntry,
  extractPartitionSplitRoutingKey,
  replayPartitionSplitEntry,
  resolvePartitionSplitSnapshotBatchRowLimit,
  resolvePartitionSplitTargetPartitionId,
  routePartitionSplitMirroredWrite,
  routePartitionSplitSnapshotBatch,
  runRetryableControlPlaneWrite,
} = PARTITION_SERVICE_SHARED;

class PartitionServiceSplitAccessorBase extends PartitionServiceCdcStreamBase {
  getSize() {
    return this.sizeBytes;
  }
  /**
   * Persist leader-owned size_bytes updates into the partitions system table.
   * @param {number} sizeBytes - Latest measured size.
   * @return {Promise<void>}
   * @private
   */
  async persistPartitionSize(sizeBytes) {
    if (
      !this.isLeader ||
      !this.systemTableCache ||
      !this.cdcIntegrationService ||
      !this.isPartitionsLeaderAvailable()
    ) {
      return;
    }
    const cachedPartition =
      this.systemTableCache.get?.(TABLES.PARTITIONS, this.partitionId) || null;
    if (!cachedPartition) {
      return;
    }
    const cachedSize = Number(
      cachedPartition.size_bytes ?? cachedPartition.sizeBytes,
    );
    if (Number.isFinite(cachedSize) && cachedSize === sizeBytes) {
      return;
    }
    try {
      const gateway =
        this.rebalancer?.controlPlaneSystemTableGateway ||
        this.controlPlaneSystemTableGateway;
      const result = await runRetryableControlPlaneWrite(
        () =>
          gateway.submitMutation(
            {
              operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
              tableName: TABLES.PARTITIONS,
              whereClause: {partition_id: this.partitionId},
              data: {size_bytes: sizeBytes, updated_at: Date.now()},
            },
            {
              workClass: PRESSURE_WORK_CLASS.BACKGROUND,
              deliveryPriority: 'background',
              coalescingKey: `partitions:size:${this.partitionId}`,
            },
          ),
        {
          timeoutMs: PARTITION_SERVICE_DEFAULT.SIZE_PERSIST_RETRY_TIMEOUT_MS,
          baseDelayMs:
            PARTITION_SERVICE_DEFAULT.SIZE_PERSIST_RETRY_BASE_DELAY_MS,
          maxDelayMs: PARTITION_SERVICE_DEFAULT.SIZE_PERSIST_RETRY_MAX_DELAY_MS,
        },
      );
      if (result?.success === false) {
        throw new Error(
          result.error ||
            result.message ||
            PARTITION_SERVICE_LITERAL.SIZE_PERSISTENCE_FAILED,
        );
      }
    } catch (error) {
      this.logger.warn(
        PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_SIZE_PERSIST_FAILED,
        {partitionId: this.partitionId, sizeBytes, error: error.message},
      );
    }
  }
  /**
   * Normalize split transition metadata from table/control-plane payloads.
   * @param {Object|string|null} rawMetadata - Metadata payload.
   * @return {Object|null} Normalized metadata.
   * @private
   */
  normalizeSplitTransitionMetadata(rawMetadata) {
    return normalizeSplitTransitionMetadataForService(this, rawMetadata);
  }
  /**
   * Build descriptor-epoch evidence for split mirror routing when the
   * system-table cache can see the table and target partition rows.
   * @param {Object} metadata - Normalized split transition metadata.
   * @return {Object|null} Descriptor epoch evidence.
   * @private
   */
  resolveSplitDescriptorEpochEvidence(metadata) {
    return resolveSplitDescriptorEpochEvidenceForService(this, metadata);
  }
  /**
   * Assert split routing still matches the descriptor epoch visible in
   * system-table metadata.
   * @param {Object} metadata - Normalized split transition metadata.
   * @return {Object|null} Descriptor epoch decision when evidence exists.
   * @private
   */
  assertSplitRoutingDescriptorEpoch(metadata) {
    return assertSplitRoutingDescriptorEpochForService(this, metadata);
  }
  /**
   * Determine whether two split-replication descriptors refer to the same split.
   * @param {Object|null} left - Existing metadata.
   * @param {Object|null} right - Incoming metadata.
   * @return {boolean} True when both describe the same split.
   * @private
   */
  isSameSplitReplication(left, right) {
    return isSameSplitReplicationMetadata(left, right);
  }
  /**
   * Reconstruct the transient split execution handle from durable
   * workflow state after a process restart.
   *
   * The canonical split phase and participant state are owned by
   * ManagedSplitWorkflow via DurableWorkflowCoordinator. This method
   * rebuilds the local execution context so that
   * handleSplitReplicationAfterWrite can route writes correctly while
   * the workflow resumes.
   *
   * @param {Object} durableState - Durable workflow state.
   * @param {string} durableState.phase - Canonical workflow phase from
   *   PARTITION_TRANSITION_STATE.
   * @param {Object} durableState.metadata - Normalized split
   *   transition metadata (recoverable from the tables row).
   * @return {Object|null} Reconstructed transient execution handle,
   *   or null if the durable state is not an active split.
   */
  reconstructSplitExecutionState(durableState) {
    return reconstructSplitExecutionStateForService(this, durableState);
  }
  /**
   * Run snapshot backfill and queued-delta catch-up for the active split.
   * @return {Promise<void>}
   * @private
   */
  async runSplitReplicationWorkflow() {
    const splitReplication = this.splitReplication;
    const metadata = splitReplication?.metadata || null;
    if (!metadata) {
      throw new Error(
        PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED,
      );
    }
    this.logger.info(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_STARTED, {
      partitionId: this.partitionId,
      targetPartitionIds: metadata.targetPartitionIds,
      targetPartitionVersion: metadata.targetPartitionVersion,
    });
    await this.emitSplitSourceAck(metadata, SPLIT_ACK_STATUS.SNAPSHOT_STARTED);
    const snapshot = this.openSplitSnapshotDatabase();
    try {
      await this.backfillSplitSnapshot(snapshot, metadata);
      splitReplication.phase = PARTITION_TRANSITION_STATE.SPLIT_CATCHUP;
      await this.emitSplitSourceAck(metadata, SPLIT_ACK_STATUS.CATCHUP_READY);
      await this.flushSplitReplicationQueue();
      await this.markSplitCutoverActive(metadata);
      splitReplication.phase = PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE;
      await this.flushSplitReplicationQueue();
      await this.emitSplitSourceAck(
        metadata,
        SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
        {[SPLIT_ACK_CHECKPOINT_FIELD.SOURCE_MIRROR_REMOVED]: false},
      );
      this.logger.info(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_COMPLETED, {
        partitionId: this.partitionId,
        targetPartitionIds: metadata.targetPartitionIds,
        targetPartitionVersion: metadata.targetPartitionVersion,
      });
    } finally {
      snapshot?.close?.();
    }
  }
  /**
   * Emit a typed source-side split acknowledgement to the workflow owner.
   *
   * Builds a canonical PARTICIPANT_ACK_FIELD payload and routes it
   * through ManagedSplitWorkflow.acknowledgeSourceParticipant so the
   * durable workflow coordinator persists participant state.
   *
   * @param {Object} metadata - Normalized split transition metadata.
   * @param {string} ackStatus - SPLIT_ACK_STATUS value.
   * @param {Object} [checkpoint] - Optional checkpoint data.
   * @return {Promise<Object>} Acknowledgement result.
   * @private
   */
  async emitSplitSourceAck(metadata, ackStatus, checkpoint) {
    const splitWorkflow = this.sqlQueryEngine?.managedSplitWorkflow;
    if (
      !splitWorkflow ||
      typeof splitWorkflow.acknowledgeSourceParticipant !==
        PARTITION_SERVICE_TYPE.FUNCTION
    ) {
      throw new Error(
        PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED,
      );
    }
    const workflowId = metadata.workflowId;
    if (!workflowId) {
      throw new Error(
        PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED,
      );
    }
    const ack = {
      [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
        SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
      [PARTICIPANT_ACK_FIELD.STATUS]: ackStatus,
      [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: Date.now(),
    };
    if (checkpoint) {
      ack[PARTICIPANT_ACK_FIELD.CHECKPOINT] = checkpoint;
    }
    const result = await splitWorkflow.acknowledgeSourceParticipant(
      workflowId,
      ack,
    );
    this.logger.info(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_ACK_EMITTED, {
      partitionId: this.partitionId,
      workflowId,
      ackStatus,
      result: result?.result,
    });
    return result;
  }
  /**
   * Open a snapshot reader pinned to the current source-partition state.
   * Falls back to the live connection for in-memory test databases.
   * @return {Database|Object} Snapshot database handle.
   * @private
   */
  openSplitSnapshotDatabase() {
    if (
      !this.dbPath ||
      this.dbPath === PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH
    ) {
      return {prepare: (...args) => this.db.prepare(...args), close() {}};
    }
    const snapshotDb = new Database(this.dbPath, {
      readonly: true,
      fileMustExist: true,
    });
    snapshotDb.exec(PARTITION_SERVICE_LITERAL.BEGIN);
    return snapshotDb;
  }
  /**
   * Yield one event-loop turn during source snapshot backfill so a split does
   * not monopolize unrelated partitions on the same node.
   * @return {Promise<void>}
   * @private
   */
  async yieldSplitBackfillTurn() {
    await new Promise((resolve) => {
      if (typeof setImmediate === 'function') {
        setImmediate(resolve);
        return;
      }
      setTimeout(resolve, 0);
    });
  }
  /**
   * Create a row iterator for split snapshot backfill.
   * Prefer iterate() so large source snapshots are streamed.
   * @param {Database|Object} snapshotDb - Snapshot handle.
   * @param {Object} metadata - Normalized split metadata.
   * @return {Iterable<Object>}
   * @private
   */
  createSplitSnapshotRowIterator(snapshotDb, metadata) {
    const sql = `SELECT * FROM ${this.tableName} ORDER BY ${metadata.primaryKeyColumn}`;
    const statement = snapshotDb.prepare(sql);
    if (statement && typeof statement.iterate === 'function') {
      return statement.iterate();
    }
    if (statement && typeof statement.all === 'function') {
      return statement.all();
    }
    return [];
  }
  /**
   * Copy the source snapshot into child partitions using idempotent upserts.
   * @param {Database|Object} snapshotDb - Snapshot handle.
   * @param {Object} metadata - Normalized split metadata.
   * @return {Promise<void>}
   * @private
   */
  async backfillSplitSnapshot(snapshotDb, metadata) {
    const columns = snapshotDb
      .prepare(`PRAGMA table_info(${this.tableName})`)
      .all()
      .map((column) => column.name);
    const rows = this.createSplitSnapshotRowIterator(snapshotDb, metadata);
    const batchSize = resolvePartitionSplitSnapshotBatchRowLimit(
      columns,
      this.splitSnapshotBackfillYieldEveryRows,
    );
    let batch = [];
    for (const row of rows) {
      batch.push(row);
      if (batch.length === batchSize) {
        await this.applySplitSnapshotBatch(batch, columns, metadata);
        batch = [];
      }
      if (batch.length === 0 && this.splitSnapshotBackfillYieldEveryRows > 0) {
        await this.yieldSplitBackfillTurn();
      }
    }
    if (batch.length > 0) {
      await this.applySplitSnapshotBatch(batch, columns, metadata);
    }
  }
  /**
   * Apply one bounded snapshot batch to the child partitions.
   * @param {Array<Object>} rows - Source rows.
   * @param {Array<string>} columns - Column list.
   * @param {Object} metadata - Split metadata.
   * @return {Promise<void>}
   * @private
   */
  async applySplitSnapshotBatch(rows, columns, metadata) {
    await this.routeSplitSnapshotBatch(rows, columns, metadata);
  }
  /**
   * Route a bounded snapshot batch through the standard partition query path.
   * @param {Array<Object>} rows - Source rows.
   * @param {Array<string>} columns - Column list.
   * @param {Object} metadata - Split metadata.
   * @return {Promise<void>}
   * @private
   */
  async routeSplitSnapshotBatch(rows, columns, metadata) {
    return routePartitionSplitSnapshotBatch(rows, columns, metadata, {
      queryExecutor: this.sqlQueryEngine?.queryExecutor || null,
      tableName: this.tableName,
      resolveDescriptorEpochEvidence: () =>
        this.resolveSplitDescriptorEpochEvidence(metadata),
    });
  }
  /**
   * Update table metadata so routing flips to the new partition version.
   * @param {Object} metadata - Split metadata.
   * @return {Promise<void>}
   * @private
   */
  async markSplitCutoverActive(metadata) {
    const splitWorkflow = this.sqlQueryEngine?.managedSplitWorkflow;
    if (
      !splitWorkflow ||
      typeof splitWorkflow.advanceSplitPhase !== 'function'
    ) {
      throw new Error(
        PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED,
      );
    }
    const workflowId = metadata.workflowId;
    if (!workflowId) {
      throw new Error(
        PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED,
      );
    }
    await splitWorkflow.advanceSplitPhase(
      workflowId,
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
      {[PARTITION_TRANSITION_METADATA_FIELD.CUTOVER_APPLIED_AT]: Date.now()},
    );
    this.logger.info(
      PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_CUTOVER_UPDATED,
      {
        partitionId: this.partitionId,
        tableId: this.tableId,
        targetPartitionVersion: metadata.targetPartitionVersion,
        targetPartitionIds: metadata.targetPartitionIds,
      },
    );
  }
  /**
   * Handle source-partition writes while a split is in progress.
   * Backfilling queues ordered deltas; cutover-active mirrors immediately.
   * @param {Object} entry - Applied source write entry.
   * @return {Promise<void>}
   * @private
   */
  async handleSplitReplicationAfterWrite(entry) {
    const splitReplication = this.splitReplication;
    if (
      !splitReplication ||
      !splitReplication.metadata ||
      this.partitionId !== splitReplication.metadata.sourcePartitionId
    ) {
      return;
    }
    if (entry.splitMirrorOrigin === PARTITION_SPLIT_MIRROR_ORIGIN.TARGET) {
      return;
    }
    if (
      splitReplication.phase === PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING ||
      splitReplication.phase === PARTITION_TRANSITION_STATE.SPLIT_CATCHUP
    ) {
      splitReplication.pendingEntries.push(this.cloneSplitEntry(entry));
      return;
    }
    if (
      splitReplication.phase !== PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE
    ) {
      return;
    }
    try {
      await this.replaySplitEntry(entry, splitReplication.metadata);
    } catch (error) {
      splitReplication.pendingEntries.push(this.cloneSplitEntry(entry));
      splitReplication.lastError = error.message;
      this.logger.warn(
        PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_MIRROR_FAILED,
        {partitionId: this.partitionId, error: error.message},
      );
      this.flushSplitReplicationQueue().catch((flushError) => {
        splitReplication.lastError = flushError.message;
        this.logger.warn(
          PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_MIRROR_FAILED,
          {partitionId: this.partitionId, error: flushError.message},
        );
      });
    }
  }
  /**
   * Flush queued post-snapshot deltas in source order.
   * @return {Promise<void>}
   * @private
   */
  async flushSplitReplicationQueue() {
    const splitReplication = this.splitReplication;
    if (!splitReplication || splitReplication.flushInFlight) {
      return;
    }
    splitReplication.flushInFlight = true;
    try {
      while (splitReplication.pendingEntries.length > 0) {
        const entry = splitReplication.pendingEntries.shift();
        try {
          await this.replaySplitEntry(entry, splitReplication.metadata);
        } catch (error) {
          splitReplication.pendingEntries.unshift(entry);
          throw error;
        }
      }
    } finally {
      splitReplication.flushInFlight = false;
    }
  }
  /**
   * Clone a write entry before placing it in the split catch-up queue.
   * @param {Object} entry - Applied write entry.
   * @return {Object} Safe queued copy.
   * @private
   */
  cloneSplitEntry(entry) {
    return cloneSplitRoutingEntry(entry);
  }
  /**
   * Replay one queued source write against the correct child partition.
   * @param {Object} entry - Applied source write entry.
   * @param {Object} metadata - Split metadata.
   * @return {Promise<void>}
   * @private
   */
  async replaySplitEntry(entry, metadata) {
    await replayPartitionSplitEntry(entry, metadata, {
      queryExecutor: this.sqlQueryEngine?.queryExecutor || null,
      tableName: this.tableName,
      descriptorEpochEvidence:
        this.resolveSplitDescriptorEpochEvidence(metadata),
    });
  }
  /**
   * Route one mirrored write through the standard partition query path.
   * @param {string} partitionId - Child partition ID.
   * @param {string} sql - SQL statement.
   * @param {Array} params - Statement parameters.
   * @return {Promise<void>}
   * @private
   */
  async routeSplitMirroredWrite(partitionId, sql, params) {
    return routePartitionSplitMirroredWrite(partitionId, sql, params, {
      queryExecutor: this.sqlQueryEngine?.queryExecutor || null,
    });
  }
  /**
   * Resolve the child partition ID for one partition-key value.
   * @param {*} value - Primary-key value.
   * @param {Object} metadata - Split metadata.
   * @return {string} Target child partition ID.
   * @private
   */
  resolveSplitTargetPartitionId(value, metadata) {
    return resolvePartitionSplitTargetPartitionId(value, metadata);
  }
  /**
   * Extract the partition routing key from an applied write entry.
   * @param {Object} entry - Applied source write entry.
   * @param {string} primaryKeyColumn - Partition key column.
   * @return {*} Routing key.
   * @private
   */
  extractSplitRoutingKey(entry, primaryKeyColumn) {
    return extractPartitionSplitRoutingKey(entry, primaryKeyColumn, {
      tableName: this.tableName,
    });
  }
  /**
   * Get the partition key range.
   * @return {Object} Key range {start, end}.
   */
  getKeyRange() {
    return {...this.keyRange};
  }
  /**
   * Set the partition key range.
   * @param {Object} keyRange - New key range {start, end}.
   */
  setKeyRange(keyRange) {
    this.keyRange = {...keyRange};
    this.emit(PARTITION_SERVICE_EVENT.KEY_RANGE_CHANGED, {
      partitionId: this.partitionId,
      keyRange: this.keyRange,
    });
  }
  /**
   * Check if a key falls within this partition's range.
   * @param {*} key - Key to check.
   * @return {boolean} True if key is in range.
   */
  isKeyInRange(key) {
    const {start, end} = this.keyRange;
    if (start === null && end === null) {
      return true;
    }
    if (start === null) {
      return key < end;
    }
    if (end === null) {
      return key >= start;
    }
    return key >= start && key < end;
  }
  /**
   * Check if this replica is the leader.
   * @return {boolean} True if leader.
   */
  isLeaderReplica() {
    return this.role === RaftRole.LEADER;
  }
  /**
   * Get the current leader ID.
   * @return {string|null} Leader replica ID.
   */
  getLeaderId() {
    return this.leaderId;
  }
  /**
   * Get the current Raft role.
   * @return {string} Current role.
   */
  getRole() {
    return this.role;
  }
  /**
   * Get the current term.
   * @return {number} Current term.
   */
  getCurrentTerm() {
    return this.storage?.currentTerm || 0;
  }
  /**
   * Get the partition state.
   * @return {string} Partition state.
   */
  getState() {
    return this.state;
  }
  /**
   * Get service status.
   * @return {Object} Service status.
   */
  getStatus() {
    return {
      partitionId: this.partitionId,
      tableId: this.tableId,
      tableName: this.tableName,
      replicaId: this.replicaId,
      nodeId: this.nodeId,
      role: this.role,
      isLeader: this.isLeader,
      leaderId: this.leaderId,
      term: this.storage?.currentTerm || 0,
      logLength: this.storage?.getLogLength() || 0,
      state: this.state,
      keyRange: this.keyRange,
      sizeBytes: this.sizeBytes,
      replicaCount: this.replicaIds.length,
      cdcSubscribers: this.cdcSubscribers.size,
      initialized: this.initialized,
    };
  }
  /**
   * Set the system table cache for the rebalancer.
   * Called after cache hydration is complete.
   * @param {Object} systemTableCache - Read-only system table cache.
   */
  setSystemTableCache(systemTableCache) {
    this.systemTableCache = systemTableCache;
    if (this.rebalancer) {
      this.rebalancer.systemTableCache = systemTableCache;
    }
    if (this.rebalanceCoordinator) {
      this.rebalanceCoordinator.systemTableCache = systemTableCache;
    }
    this.maybeInitializeRebalancer();
  }
  /**
   * Set the CDC integration service for system table writes.
   * Called after cache hydration is complete.
   * Required for rebalancer to delete service rows after REMOVE_REPLICA.
   * @param {Object} cdcIntegrationService - CDC integration service.
   */
  setCdcIntegrationService(cdcIntegrationService) {
    this.cdcIntegrationService = cdcIntegrationService;
    if (this.rebalancer) {
      this.rebalancer.cdcIntegrationService = cdcIntegrationService;
    }
    if (this.rebalanceCoordinator) {
      this.rebalanceCoordinator.cdcIntegrationService = cdcIntegrationService;
    }
    this.maybeInitializeRebalancer();
    this.flushRoleUpdate().catch((error) => {
      this.logger.warn(
        PARTITION_SERVICE_ERROR_MSG.PERSIST_ROLE_AFTER_CDC_FAILED,
        {
          partitionId: this.partitionId,
          replicaId: this.replicaId,
          error: error.message,
        },
      );
    });
    this.flushLeaderNodeUpdate().catch((error) => {
      this.logger.warn(
        PARTITION_SERVICE_ERROR_MSG.PERSIST_LEADER_AFTER_CDC_FAILED,
        {
          partitionId: this.partitionId,
          replicaId: this.replicaId,
          error: error.message,
        },
      );
    });
  }
  /**
   * Set table policy service for rebalancing decisions.
   * @param {Object} tablePolicyService - Table policy service instance.
   */
  setTablePolicyService(tablePolicyService) {
    this.tablePolicyService = tablePolicyService;
    if (this.rebalancer) {
      this.rebalancer.tablePolicyService = tablePolicyService;
    }
    if (this.rebalanceCoordinator) {
      this.rebalanceCoordinator.tablePolicyService = tablePolicyService;
    }
    this.maybeInitializeRebalancer();
  }
  /**
   * Set rebalance coordinator for partition rebalancing.
   * Allows partitions to bind to the shared control-plane coordinator.
   * @param {Object} rebalanceCoordinator - Rebalance coordinator.
   */
  setRebalanceCoordinator(rebalanceCoordinator) {
    if (!rebalanceCoordinator) {
      return;
    }
    this.rebindCoordinator(rebalanceCoordinator);
  }
  /**
   * Canonical rebind API for coordinator replacement.
   *
   * This is the single path for updating the coordinator reference,
   * propagating the change to the rebalancer, and emitting a
   * diagnostic log. All coordinator replacement MUST route here.
   *
   * Validates: Requirements 7.2, 7.3
   * Design: D8.2, D8.3
   *
   * @param {Object} newCoordinator - The new coordinator instance.
   */
  rebindCoordinator(newCoordinator) {
    const previousCoordinator = this.rebalanceCoordinator;
    const hadPrevious = !!previousCoordinator;
    const isReplacement = hadPrevious && previousCoordinator !== newCoordinator;
    const shouldShutdownPrevious =
      this.ownsRebalanceCoordinator &&
      isReplacement &&
      typeof previousCoordinator.shutdown === PARTITION_SERVICE_TYPE.FUNCTION;
    this.rebalanceCoordinator = newCoordinator;
    this.ownsRebalanceCoordinator = false;
    if (this.rebalancer) {
      const setCoordinator = assertCritical(
        typeof this.rebalancer.setRebalanceCoordinator ===
          PARTITION_SERVICE_TYPE.FUNCTION ?
          this.rebalancer.setRebalanceCoordinator.bind(this.rebalancer) :
          null,
        PARTITION_SERVICE_ERROR_MSG.REBALANCER_SET_COORDINATOR_REQUIRED,
      );
      setCoordinator(newCoordinator);
    }
    this.logger.info(PARTITION_SERVICE_LOG_MSG.COORDINATOR_REBOUND, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
      hadPrevious,
      isReplacement,
    });
    if (shouldShutdownPrevious) {
      previousCoordinator.shutdown().catch((error) => {
        this.logger.warn(
          PARTITION_SERVICE_ERROR_MSG.REBALANCE_COORDINATOR_SHUTDOWN_FAILED,
          {
            partitionId: this.partitionId,
            replicaId: this.replicaId,
            error: error.message,
          },
        );
      });
    }
    this.maybeInitializeRebalancer();
  }
  /**
   * Set SQL query engine for rebalancer operations.
   * @param {Object} sqlQueryEngine - SQL query engine instance.
   */
  setSqlQueryEngine(sqlQueryEngine) {
    this.sqlQueryEngine = sqlQueryEngine;
    if (this.rebalanceCoordinator) {
      this.rebalanceCoordinator.sqlQueryEngine = sqlQueryEngine;
      const bundle = this.buildRebalancerDependencyBundle();
      if (
        bundle &&
        typeof this.rebalanceCoordinator.syncOwnerDependencies ===
          PARTITION_SERVICE_TYPE.FUNCTION
      ) {
        this.rebalanceCoordinator.syncOwnerDependencies(bundle);
      }
    }
    this.maybeInitializeRebalancer();
  }
}
export {PartitionServiceSplitAccessorBase};
