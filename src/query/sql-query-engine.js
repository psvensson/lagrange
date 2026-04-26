import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {SQLQueryEngineSegment7} from './sql-query-engine-segment-7.js';

const {
  ACTIVE_PARTITION_STATE,
  BACKGROUND_SYSTEM_TABLE_DELIVERY_PRIORITY_TABLES,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_READINESS_DIMENSION,
  DEFAULT_PARTITION_VERSION,
  DUAL_WRITE_ACTIVE_STATUSES,
  PARTITION_SPLIT_MIRROR_ORIGIN,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  PRESSURE_WORK_CLASS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_OPERATION,
  QUERY_SESSION,
  SQLParser,
  SYSTEM_TABLE_NAME,
  TABLES,
  WRITE_OPERATION_STATUS,
  createHash,
  isPriorityControlPlanePartition,
  isRetryableControlPlaneError,
} = SQL_QUERY_ENGINE_SHARED;

const PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_PRIORITY = 'critical';
const PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_TIMEOUT_MS = 15000;
const NON_TRANSACTIONAL_WRITE_TRACKING_DISPOSITION = Object.freeze({
  PERSIST: 'persist',
  SKIP_RETRYABLE_CONTROL_PLANE_FAILURE:
    'skip_retryable_control_plane_failure',
});

class SQLQueryEngine extends SQLQueryEngineSegment7 {
  async persistDistributedTransactionRow(record) {
    if (!this.canPersistDistributedTransactionState()) {
      return;
    }
    const transactionId = String(record?.transactionId || '').trim();
    await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
      tableName: TABLES.SQL_TRANSACTIONS,
      row: {
        transaction_id: transactionId,
        session_id: record.sessionId,
        status: record.status,
        transaction_epoch: record.transactionEpoch,
        timeout_deadline: record.timeoutDeadline,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    }, this.buildDistributedTransactionMutationOptions(
      TABLES.SQL_TRANSACTIONS,
      {
        // Durable transaction state must bypass interactive admission
        // pressure and retain critical delivery priority so recovery metadata
        // does not stall behind background control-plane backlog.
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
        coalescingKey: transactionId.length > 0 ?
          `sql-transaction:${transactionId}` :
          null,
      },
    ));
  }

  /**
   * Persist one distributed transaction participant row.
   * @param {Object} record - Participant persistence payload.
   * @return {Promise<void>}
   * @private
   */
  async persistDistributedTransactionParticipantRow(record) {
    if (!this.canPersistDistributedTransactionState()) {
      return;
    }
    const participantId = String(record?.participantId || '').trim();
    const transactionId = String(record?.transactionId || '').trim();
    await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
      tableName: TABLES.SQL_TRANSACTION_PARTICIPANTS,
      row: {
        participant_id: participantId,
        transaction_id: transactionId,
        partition_id: record.partitionId,
        status: record.status,
        last_error: record.lastError,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    }, this.buildDistributedTransactionMutationOptions(
      TABLES.SQL_TRANSACTION_PARTICIPANTS,
      {
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
        coalescingKey: participantId.length > 0 ?
          `sql-transaction-participant:${participantId}` :
          null,
      },
    ));
  }

  /**
   * Persist one distributed write operation row.
   * @param {Object} record - Write operation persistence payload.
   * @return {Promise<void>}
   * @private
   */
  async persistDistributedWriteOperationRow(record) {
    if (!this.canPersistDistributedTransactionState()) {
      return;
    }
    const operationId = String(record?.operationId || '').trim();
    const transactionId = String(record?.transactionId || '').trim();
    const workClass =
      typeof record?.workClass === 'string' &&
        record.workClass.length > 0 ?
        record.workClass :
        PRESSURE_WORK_CLASS.INTERACTIVE;
    await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
      tableName: TABLES.SQL_WRITE_OPERATIONS,
      row: {
        operation_id: operationId,
        transaction_id: transactionId || null,
        statement_type: record.statementType,
        status: record.status,
        idempotency_key: record.idempotencyKey,
        payload_hash: record.payloadHash,
        retry_count: record.retryCount || 0,
        last_error: record.lastError || null,
        partition_ids: JSON.stringify(record.partitionIds || []),
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    }, this.buildDistributedTransactionMutationOptions(
      TABLES.SQL_WRITE_OPERATIONS,
      {
        workClass,
        coalescingKey: operationId.length > 0 ?
          `sql-write-operation:${operationId}` :
          null,
      },
    ));
  }

  /**
   * Persist a distributed write operation not associated with a transaction.
   * @param {Object} writePlan - DistributedWritePlan.
   * @param {string} statementType - SQL AST statement type.
   * @return {Promise<void>}
   * @private
   */
  /**
   * Fire-and-forget: persist only failed non-transactional distributed writes.
   * Successful non-transactional writes are not used by recovery and would
   * otherwise convert high-throughput user traffic into extra control-plane
   * replication on sql_write_operations.
   * @param {Object} writePlan - DistributedWritePlan.
   * @param {string} statementType - SQL AST statement type.
   * @param {Object} result - Write result.
   * @private
   */
  fireNonTransactionalWriteResult(writePlan, statementType, result) {
    if (result?.success === true) {
      return;
    }
    const trackingDisposition =
      this.resolveNonTransactionalWriteTrackingDisposition(result);
    if (
      trackingDisposition !==
      NON_TRANSACTIONAL_WRITE_TRACKING_DISPOSITION.PERSIST
    ) {
      return;
    }
    const now = Date.now();
    this.persistDistributedWriteOperationRow({
      operationId: writePlan.operationId,
      transactionId: null,
      statementType,
      status: WRITE_OPERATION_STATUS.FAILED,
      idempotencyKey: writePlan.idempotencyKey,
      payloadHash: this.createWriteOperationPayloadHash(
        writePlan,
        statementType,
      ),
      partitionIds: Array.from(writePlan.partitionStatements.keys()),
      retryCount: this.resolveWriteResultRetryCount(result),
      lastError: result?.error || null,
      createdAt: now,
      updatedAt: now,
    }).catch((error) => {
      this.logger.warn(QUERY_LOG_MSG.WRITE_OP_PERSIST_FAILED, {
        operationId: writePlan.operationId,
        statementType,
        status: WRITE_OPERATION_STATUS.FAILED,
        error: error.message,
      });
    });
  }

  /**
   * Classify whether one non-transactional write failure should be persisted
   * into sql_write_operations.
   *
   * Retryable control-plane failures remain transient admission/routing
   * observations, not terminal write results. Recording those defers as
   * durable write-operation rows feeds more load into the same recovering
   * priority partition without improving transaction recovery.
   *
   * @param {Object} result - Write result.
   * @return {string}
   * @private
   */
  resolveNonTransactionalWriteTrackingDisposition(result) {
    return isRetryableControlPlaneError(result) ?
      NON_TRANSACTIONAL_WRITE_TRACKING_DISPOSITION
        .SKIP_RETRYABLE_CONTROL_PLANE_FAILURE :
      NON_TRANSACTIONAL_WRITE_TRACKING_DISPOSITION.PERSIST;
  }

  /**
   * Build deterministic payload hash for distributed write persistence.
   * @param {Object} writePlan - DistributedWritePlan.
   * @param {string} statementType - SQL AST statement type.
   * @return {string} Payload hash.
   * @private
   */
  createWriteOperationPayloadHash(writePlan, statementType) {
    const payload = JSON.stringify({
      operationId: writePlan.operationId,
      statementType,
      partitionIds: Array.from(writePlan.partitionStatements.keys()).sort(),
    });
    return createHash('sha1')
      .update(payload)
      .digest('hex');
  }

  /**
   * Resolve total retry count from a write result payload.
   * @param {Object} result - Distributed write result.
   * @return {number} Retry count.
   * @private
   */
  resolveWriteResultRetryCount(result) {
    if (Number.isInteger(result?.retryCount)) {
      return result.retryCount;
    }
    if (!Array.isArray(result?.participantResults)) {
      return 0;
    }
    return result.participantResults.reduce((sum, entry) => {
      const attempts = Number.isInteger(entry.attempts) ? entry.attempts : 1;
      return sum + Math.max(attempts - 1, 0);
    }, 0);
  }

  /**
   * Handle BEGIN TRANSACTION.
   * @param {string} sessionId - Session ID for tracking.
   * @return {Object} Transaction result.
   * @private
   */
  handleBeginTransaction(sessionId = QUERY_SESSION.DEFAULT) {
    this.logger.debug(QUERY_LOG_MSG.BEGIN_TRANSACTION, {sessionId});
    return this.transactionCoordinator.begin(sessionId);
  }

  /**
   * Handle COMMIT.
   * Routes through message router to the bound partition.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Commit result.
   * @private
   */
  async handleCommit(sessionId = QUERY_SESSION.DEFAULT) {
    const txState = this.transactionCoordinator.getTransaction(sessionId);
    this.logger.debug(QUERY_LOG_MSG.COMMIT, {
      sessionId,
      participants: txState?.participants || [],
    });

    const result = await this.transactionCoordinator.commit(sessionId);
    if (!result.success && !result.errorCode) {
      return {
        ...result,
        errorCode: QUERY_ERROR_CODE.COMMIT_FAILED,
        error: QUERY_ERROR_MSG.COMMIT_FAILED,
      };
    }
    return result;
  }

  /**
   * Handle ROLLBACK.
   * Routes through message router to the bound partition.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Rollback result.
   * @private
   */
  async handleRollback(sessionId = QUERY_SESSION.DEFAULT) {
    const txState = this.transactionCoordinator.getTransaction(sessionId);
    this.logger.debug(QUERY_LOG_MSG.ROLLBACK, {
      sessionId,
      participants: txState?.participants || [],
    });

    const result = await this.transactionCoordinator.rollback(sessionId);
    if (!result.success && !result.errorCode) {
      return {
        ...result,
        errorCode: QUERY_ERROR_CODE.ROLLBACK_FAILED,
        error: QUERY_ERROR_MSG.ROLLBACK_FAILED,
      };
    }
    return result;
  }

  /**
   * Check if a session has an active transaction.
   * @param {string} sessionId - Session ID.
   * @return {boolean} True if transaction is active.
   */
  hasActiveTransaction(sessionId = QUERY_SESSION.DEFAULT) {
    return this.transactionCoordinator.hasActiveTransaction(sessionId);
  }

  /**
   * Get the partition bound to a transaction.
   * @param {string} sessionId - Session ID.
   * @return {string|null} Partition ID or null.
   */
  getTransactionPartition(sessionId = QUERY_SESSION.DEFAULT) {
    const txState = this.transactionCoordinator.getTransaction(sessionId);
    return txState?.participants?.[0] || null;
  }

  /**
   * Bind a transaction to a partition (on first write).
   * Transactions are routed through message router like all other operations.
   * @param {string} sessionId - Session ID.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<void>}
   * @private
   */
  async bindTransactionToPartition(sessionId, partitionId) {
    const result = await this.transactionCoordinator.enlistParticipants(
      sessionId,
      [partitionId],
    );
    if (!result.success) {
      throw new Error(result.error || QUERY_ERROR_MSG.BEGIN_FAILED);
    }
  }

  /**
   * Resolve the routing readiness dimension for transaction control delivery.
   * Priority control-plane partitions must stay routable during recovery so
   * distributed transaction replay can complete even while normal serve traffic
   * is still blocked.
   * @param {string} partitionId - Partition ID.
   * @return {string}
   * @private
   */
  resolveTransactionOperationRoutingReadinessDimension(partitionId) {
    if (isPriorityControlPlanePartition({partitionId})) {
      return CONTROL_PLANE_READINESS_DIMENSION
        .CONTROL_PLANE_RECOVERY_ELIGIBLE;
    }
    return this.queryExecutor?.defaultRoutingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
  }

  /**
   * Resolve the routed delivery profile for one transaction-control message.
   * Priority control-plane recovery must not reuse the generic background
   * query lane while the transaction tables that own recovery still converge.
   *
   * @param {string} partitionId
   * @return {Object}
   * @private
   */
  buildTransactionOperationDeliveryProfile(partitionId) {
    const priorityControlPlanePartition =
      isPriorityControlPlanePartition({partitionId});
    return Object.freeze({
      routingReadinessDimension:
        this.resolveTransactionOperationRoutingReadinessDimension(partitionId),
      deliveryPriority:
        priorityControlPlanePartition ?
          PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_PRIORITY :
          undefined,
      timeoutMs:
        priorityControlPlanePartition ?
          PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_TIMEOUT_MS :
          undefined,
    });
  }

  /**
   * Resolve the canonical routing readiness dimension for one table-scoped
   * SQL operation.
   *
   * System-table traffic must stay on the control-plane recovery lane unless a
   * caller explicitly asks for a narrower dimension. Otherwise plain SQL can
   * diverge from the system-metadata owners and reintroduce `serveEligible`
   * filtering while priority recovery is still converging.
   *
   * @param {string|null} tableName
   * @param {string|undefined|null} routingReadinessDimension
   * @return {string}
   * @private
   */
  resolveTableRoutingReadinessDimension(
    tableName,
    routingReadinessDimension,
  ) {
    if (
      typeof routingReadinessDimension === 'string' &&
      routingReadinessDimension.length > 0
    ) {
      return routingReadinessDimension;
    }
    if (this.isSystemTable(tableName)) {
      return CONTROL_PLANE_READINESS_DIMENSION
        .CONTROL_PLANE_RECOVERY_ELIGIBLE;
    }
    return this.defaultRoutingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
  }

  /**
   * Deliver one transaction control operation to a partition service.
   * @param {string} sessionId - Session ID.
   * @param {string} partitionId - Partition ID.
   * @param {string} operation - Transaction operation.
   * @param {Object} [options] - Delivery options.
   * @param {number} [options.transactionEpoch] - Snapshot epoch.
   * @return {Promise<void>}
   * @private
   */
  async deliverTransactionOperation(sessionId, partitionId, operation, options = {}) {
    const deliveryProfile =
      this.buildTransactionOperationDeliveryProfile(partitionId);
    const payload = {
      type: QUERY_OPERATION.TRANSACTION,
      operation,
      sessionId,
    };
    if (Number.isFinite(options.transactionEpoch)) {
      payload.transactionEpoch = Math.floor(options.transactionEpoch);
    }
    const result = await this.queryExecutor.executeOnPartition(
      partitionId,
      '',
      [],
      false,
      false,
      false,
      {
        buildRequest: () => ({...payload}),
        buildSuccessResult: () => ({success: true}),
        isSuccessfulResponse: (response) =>
          response?.acknowledged === true &&
          response?.success === true,
        routingReadinessDimension:
          deliveryProfile.routingReadinessDimension,
        deliveryPriority: deliveryProfile.deliveryPriority,
        timeoutMs: deliveryProfile.timeoutMs,
        clearSessionPartitionAffinityOnSuccess:
          operation === QUERY_OPERATION.COMMIT ||
          operation === QUERY_OPERATION.ROLLBACK,
      },
    );
    if (!result.success) {
      if (operation === QUERY_OPERATION.BEGIN) {
        throw new Error(result.error || QUERY_ERROR_MSG.BEGIN_FAILED);
      }
      if (operation === QUERY_OPERATION.PREPARE) {
        throw new Error(result.error || QUERY_ERROR_MSG.PREPARE_FAILED);
      }
      if (operation === QUERY_OPERATION.COMMIT) {
        throw new Error(result.error || QUERY_ERROR_MSG.COMMIT_FAILED);
      }
      throw new Error(result.error || QUERY_ERROR_MSG.ROLLBACK_FAILED);
    }
  }

  /**
   * Get partitions for a table.
   *
   * System Cache Lookup:
   * - Uses the raw observed system cache for partition enumeration
   * - No fallbacks or bootstrap directories
   * - System cache populated from bootstrap snapshots
   * - CDC events keep cache synchronized
   * - Canonical leader stabilization, when needed, happens later in the
   *   routing stack
   * - Throws error if cache not available
   *
   * Requirements: 3.1, 5.1
   * @param {string} tableName - Table name.
   * @return {Array} Array of partition objects.
   * @throws {Error} If system cache is not available.
   * @private
   */
  getTablePartitions(tableName) {
    if (!this.systemCache) {
      throw new Error(`${QUERY_ERROR_MSG.SYSTEM_CACHE_NOT_AVAILABLE}: ${tableName}`);
    }

    const tableInfo = this.getTableInfo(tableName);
    const tableId = tableInfo?.table_id || tableInfo?.tableId || null;
    const activePartitionVersion = this.resolveActivePartitionVersion(tableInfo);

    // Get partitions from the raw observed system cache.
    if (typeof this.systemCache.filter === 'function') {
      const directMatches =
        this.systemCache.filter(TABLES.PARTITIONS, (partition) =>
          this.partitionMatchesTableRef(partition, tableName),
        ) || [];
      const visibleDirectMatches = directMatches.filter((partition) =>
        this.isPartitionVisibleForRouting(partition, activePartitionVersion),
      );
      if (directMatches.length > 0) {
        return visibleDirectMatches;
      }
      const overlayDirectMatches = this.getBootstrapRoutingOverlayPartitionsForTable(
        tableName,
        activePartitionVersion,
      );
      if (overlayDirectMatches.length > 0 || !tableId || tableId === tableName) {
        return overlayDirectMatches;
      }

      const tableIdMatches = this.systemCache.filter(TABLES.PARTITIONS, (partition) =>
        this.partitionMatchesTableRef(partition, tableId),
      ) || [];
      const visibleTableIdMatches = tableIdMatches.filter((partition) =>
        this.isPartitionVisibleForRouting(partition, activePartitionVersion),
      );
      if (visibleTableIdMatches.length > 0) {
        return visibleTableIdMatches;
      }
      return this.getBootstrapRoutingOverlayPartitionsForTable(
        tableId,
        activePartitionVersion,
      );
    }

    if (typeof this.systemCache.getAll === 'function') {
      const all = this.systemCache.getAll(TABLES.PARTITIONS) || [];
      const directMatches = all.filter((partition) =>
        this.partitionMatchesTableRef(partition, tableName),
      );
      const visibleDirectMatches = directMatches.filter((partition) =>
        this.isPartitionVisibleForRouting(partition, activePartitionVersion),
      );
      if (directMatches.length > 0) {
        return visibleDirectMatches;
      }
      const overlayDirectMatches = this.getBootstrapRoutingOverlayPartitionsForTable(
        tableName,
        activePartitionVersion,
      );
      if (overlayDirectMatches.length > 0 || !tableId || tableId === tableName) {
        return overlayDirectMatches;
      }

      const visibleTableIdMatches = all.filter((partition) =>
        this.partitionMatchesTableRef(partition, tableId),
      ).filter((partition) =>
        this.isPartitionVisibleForRouting(partition, activePartitionVersion),
      );
      if (visibleTableIdMatches.length > 0) {
        return visibleTableIdMatches;
      }
      return this.getBootstrapRoutingOverlayPartitionsForTable(
        tableId,
        activePartitionVersion,
      );
    }

    throw new Error(`${QUERY_ERROR_MSG.SYSTEM_CACHE_UNSUPPORTED}: ${tableName}`);
  }

  /**
   * Determine whether one partition row belongs to a table reference.
   * @param {Object|null} partition
   * @param {string|null} tableRef
   * @return {boolean}
   * @private
   */
  partitionMatchesTableRef(partition, tableRef) {
    if (!partition || typeof partition !== 'object' ||
        typeof tableRef !== 'string' || tableRef.length === 0) {
      return false;
    }
    return partition.table_name === tableRef ||
      partition.tableName === tableRef ||
      partition.table_id === tableRef ||
      partition.tableId === tableRef;
  }

  /**
   * Get table information.
   * @param {string} tableName - Table name.
   * @return {Object|null} Table info or null.
   * @private
   */
  getTableInfo(tableName) {
    if (!this.systemCache) {
      return null;
    }

    try {
      if (typeof this.systemCache.get === 'function') {
        const byPrimaryKey = this.systemCache.get(TABLES.TABLES, tableName);
        if (byPrimaryKey) {
          return byPrimaryKey;
        }
      }
      if (typeof this.systemCache.find === 'function') {
        const found = this.systemCache.find(TABLES.TABLES, (t) =>
          t.table_name === tableName || t.tableName === tableName,
        );
        if (found) {
          return found;
        }
      }
      if (typeof this.systemCache.getAll === 'function') {
        const tables = this.systemCache.getAll(TABLES.TABLES) || [];
        return tables.find((table) =>
          table.table_name === tableName ||
          table.tableName === tableName ||
          table.table_id === tableName ||
          table.tableId === tableName,
        ) || null;
      }
    } catch (_cacheErr) {
      // Cache not available
    }

    return null;
  }

  /**
   * Read schema-migration rows for one table from system cache.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {Object[]} Matching migration rows.
   * @private
   */
  getTableMigrationsFromCache(tableInfo) {
    if (!tableInfo || !this.systemCache) {
      return [];
    }

    const tableId = tableInfo.table_id || tableInfo.tableId || null;
    const tableName = tableInfo.table_name || tableInfo.tableName || null;
    const matchesTable = (row) => {
      const rowTableId = row?.table_id || row?.tableId || null;
      const rowTableName = row?.table_name || row?.tableName || null;
      return (tableId && rowTableId === tableId) ||
        (tableName && rowTableName === tableName);
    };

    if (typeof this.systemCache.filter === 'function') {
      return this.systemCache.filter(
        TABLES.SCHEMA_MIGRATIONS,
        matchesTable,
      ) || [];
    }

    if (typeof this.systemCache.getAll === 'function') {
      const rows = this.systemCache.getAll(TABLES.SCHEMA_MIGRATIONS) || [];
      return rows.filter(matchesTable);
    }

    return [];
  }

  /**
   * Resolve one active dual-write migration row for a table.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {Object|null} Active migration row.
   * @private
   */
  getActiveDualWriteMigration(tableInfo) {
    const rows = this.getTableMigrationsFromCache(tableInfo);
    for (const row of rows) {
      const status = String(
        row?.status ||
        row?.current_stage ||
        '',
      ).trim();
      if (DUAL_WRITE_ACTIVE_STATUSES.has(status)) {
        return row;
      }
    }
    return null;
  }

  /**
   * Resolve whether a table is currently in dual-write mode.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {boolean} True when dual-write migration is active.
   * @private
   */
  isDualWriteModeActiveForTable(tableInfo) {
    return this.getActiveDualWriteMigration(tableInfo) !== null;
  }

  /**
   * Resolve one partition metadata row by partition ID.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null} Partition metadata row.
   * @private
   */
  getPartitionInfo(partitionId) {
    if (!partitionId || !this.systemCache) {
      return null;
    }

    try {
      if (typeof this.systemCache.get === 'function') {
        const direct = this.systemCache.get(TABLES.PARTITIONS, partitionId);
        if (direct) {
          return direct;
        }
      }
      if (typeof this.systemCache.find === 'function') {
        const found = this.systemCache.find(TABLES.PARTITIONS, (partition) =>
          partition.partition_id === partitionId ||
          partition.partitionId === partitionId,
        );
        if (found) {
          return found;
        }
      }
      if (typeof this.systemCache.getAll === 'function') {
        const partitions = this.systemCache.getAll(TABLES.PARTITIONS) || [];
        return partitions.find((partition) =>
          partition.partition_id === partitionId ||
          partition.partitionId === partitionId,
        ) || null;
      }
    } catch (_cacheErr) {
      // Cache not available
    }

    return null;
  }

  /**
   * Determine whether the local node is the persisted leader for one partition.
   * @param {Object|null} partitionInfo - Partition metadata row.
   * @return {boolean} True when the local node owns split orchestration.
   * @private
   */
  isLocalManagedSplitLeader(partitionInfo) {
    if (!partitionInfo || !this.nodeId) {
      return false;
    }
    const leaderNodeId =
      partitionInfo.leader_node_id ?? partitionInfo.leaderNodeId;
    return Boolean(leaderNodeId) && leaderNodeId === this.nodeId;
  }

  /**
   * Parse partition transition metadata from a table row.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {Object|null} Parsed transition metadata.
   * @private
   */
  parsePartitionTransition(tableInfo) {
    if (!tableInfo) {
      return null;
    }

    const state = tableInfo.partition_transition_state ??
      tableInfo.partitionTransitionState ??
      null;
    const rawMetadata = tableInfo.partition_transition_metadata ??
      tableInfo.partitionTransitionMetadata ??
      null;
    if (!state || !rawMetadata) {
      return null;
    }

    try {
      const metadata = typeof rawMetadata === 'string' ?
        JSON.parse(rawMetadata) :
        rawMetadata;
      return metadata && typeof metadata === 'object' ?
        {
          state,
          metadata,
        } :
        null;
    } catch (_parseErr) {
      return null;
    }
  }

  /**
   * Add post-cutover mirror participants so writes keep the source
   * partition current while caches converge to the new partition set.
   * @param {Object} writePlan - Distributed write plan.
   * @param {Object} ast - Statement AST.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {Object} The mutated write plan.
   * @private
   */
  addTransitionMirrorParticipants(writePlan, ast, tableInfo) {
    const transition = this.parsePartitionTransition(tableInfo);
    if (!transition ||
        transition.state !== PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE) {
      return writePlan;
    }

    const metadata = transition.metadata || {};
    const activeVersion = this.resolveActivePartitionVersion(tableInfo);
    const targetVersion = Number(
      metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION],
    );
    const sourcePartitionId =
      metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID];
    if (!sourcePartitionId ||
        !Number.isInteger(targetVersion) ||
        targetVersion !== activeVersion) {
      return writePlan;
    }

    this.distributedWriteCoordinator.addMirrorParticipant(
      writePlan,
      sourcePartitionId,
      ast,
      {splitMirrorOrigin: PARTITION_SPLIT_MIRROR_ORIGIN.TARGET},
    );
    return writePlan;
  }

  /**
   * Resolve active partition version from table metadata.
   * Missing values default to version 1 for compatibility.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {number} Active partition-set version.
   * @private
   */
  resolveActivePartitionVersion(tableInfo) {
    const value = tableInfo?.active_partition_version ??
      tableInfo?.activePartitionVersion;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < DEFAULT_PARTITION_VERSION) {
      return DEFAULT_PARTITION_VERSION;
    }
    return parsed;
  }

  /**
   * Determine whether a partition row should participate in normal routing.
   * Hidden or non-normal child partitions remain invisible until cutover.
   * @param {Object} partition - Partition metadata row.
   * @param {number} activePartitionVersion - Active partition-set version.
   * @return {boolean} True when the partition is routable for table traffic.
   * @private
   */
  isPartitionVisibleForRouting(partition, activePartitionVersion) {
    const partitionVersion = Number(
      partition?.partition_version ?? partition?.partitionVersion,
    );
    const normalizedVersion = Number.isInteger(partitionVersion) &&
      partitionVersion >= DEFAULT_PARTITION_VERSION ?
      partitionVersion :
      DEFAULT_PARTITION_VERSION;
    if (normalizedVersion !== activePartitionVersion) {
      return false;
    }

    const state = String(
      partition?.state ?? ACTIVE_PARTITION_STATE,
    ).toUpperCase();
    return state === ACTIVE_PARTITION_STATE;
  }

  /**
   * Check if a table is a system table.
   * @param {string} tableName - Table name.
   * @return {boolean} True if system table.
   * @private
   */
  isSystemTable(tableName) {
    return Object.values(SYSTEM_TABLE_NAME).includes(tableName);
  }

  /**
   * Resolve router delivery priority for one routed table operation.
   * Topology/control-plane tables default to the critical lane. High-volume
   * transaction bookkeeping tables use the background lane so they cannot
   * starve replica operations or startup/rebalance progress.
   * @param {string|null} tableName
   * @param {string|undefined|null} deliveryPriority
   * @return {string|undefined}
   * @private
   */
  resolveRoutedDeliveryPriority(tableName, deliveryPriority) {
    if (typeof deliveryPriority === 'string' &&
        deliveryPriority.length > 0) {
      return deliveryPriority;
    }
    if (!this.isSystemTable(tableName)) {
      return undefined;
    }
    return BACKGROUND_SYSTEM_TABLE_DELIVERY_PRIORITY_TABLES.has(tableName) ?
      'background' :
      'critical';
  }

  /**
   * Get error code from error.
   * @param {Error} error - Error object.
   * @return {string} Error code.
   * @private
   */
  getErrorCode(error) {
    if (typeof error?.errorCode === 'string' &&
        error.errorCode.length > 0) {
      return error.errorCode;
    }
    if (typeof error?.code === 'string' &&
        error.code.length > 0) {
      return error.code;
    }
    const message = error.message.toLowerCase();

    if (message.includes('parse') || message.includes('syntax')) {
      return QUERY_ERROR_CODE.SYNTAX_ERROR;
    }
    if (message.includes('table not found')) {
      return QUERY_ERROR_CODE.TABLE_NOT_FOUND;
    }
    if (message.includes('timeout')) {
      return QUERY_ERROR_CODE.TIMEOUT;
    }

    return QUERY_ERROR_CODE.INTERNAL_ERROR;
  }

  /**
   * Preserve structured retry metadata when execution surfaces a typed error
   * from a lower layer instead of returning a normalized result object.
   * @param {Error|Object} error
   * @return {Object}
   * @private
   */
  buildCaughtQueryExecutionFailure(error) {
    const result = {
      success: false,
      error: error?.message || 'Query execution failed',
      errorCode: this.getErrorCode(error),
    };
    if (error?.deferRetry === true) {
      result.deferRetry = true;
    }
    if (Number.isFinite(error?.retryAfterMs) &&
        error.retryAfterMs > 0) {
      result.retryAfterMs = Math.floor(error.retryAfterMs);
    }
    if (typeof error?.pressureAction === 'string' &&
        error.pressureAction.length > 0) {
      result.pressureAction = error.pressureAction;
    }
    if (typeof error?.pressureReason === 'string' &&
        error.pressureReason.length > 0) {
      result.pressureReason = error.pressureReason;
    }
    if (error?.pressureSummary &&
        typeof error.pressureSummary === 'object') {
      result.pressureSummary = {...error.pressureSummary};
    }
    if (Array.isArray(error?.participantFailures)) {
      result.participantFailures = error.participantFailures
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({...entry}));
    }
    if (error?.firstFailedParticipant &&
        typeof error.firstFailedParticipant === 'object') {
      result.firstFailedParticipant = {
        ...error.firstFailedParticipant,
      };
    } else if (Array.isArray(result.participantFailures) &&
        result.participantFailures.length > 0) {
      result.firstFailedParticipant = result.participantFailures[0];
    }
    if (typeof error?.reasonCode === 'string' &&
        error.reasonCode.length > 0) {
      result.reasonCode = error.reasonCode;
    }
    if (typeof error?.participationKind === 'string' &&
        error.participationKind.length > 0) {
      result.participationKind = error.participationKind;
    }
    if (typeof error?.tableName === 'string' &&
        error.tableName.length > 0) {
      result.tableName = error.tableName;
    }
    if (typeof error?.failedTable === 'string' &&
        error.failedTable.length > 0) {
      result.failedTable = error.failedTable;
    }
    if (typeof error?.outcome === 'string' &&
        error.outcome.length > 0) {
      result.outcome = error.outcome;
    }
    if (typeof error?.contractState === 'string' &&
        error.contractState.length > 0) {
      result.contractState = error.contractState;
    }
    if (typeof error?.nextAction === 'string' &&
        error.nextAction.length > 0) {
      result.nextAction = error.nextAction;
    }
    if (typeof error?.visibilityState === 'string' &&
        error.visibilityState.length > 0) {
      result.visibilityState = error.visibilityState;
    }
    if (error?.authoritativeVisibilityConfirmed === true) {
      result.authoritativeVisibilityConfirmed = true;
    }
    if (typeof error?.backpressured === 'boolean') {
      result.backpressured = error.backpressured;
    }
    if (Array.isArray(error?.reasonCodes)) {
      result.reasonCodes = [...error.reasonCodes];
    }
    if (Array.isArray(error?.failedDimensions)) {
      result.failedDimensions = [...error.failedDimensions];
    }
    if (error?.runtimeAuthority &&
        typeof error.runtimeAuthority === 'object') {
      result.runtimeAuthority = error.runtimeAuthority;
    }
    if (error?.details && typeof error.details === 'object') {
      result.details = {...error.details};
    }
    return result;
  }

  /**
   * Parse a SQL statement without executing.
   * @param {string} sql - SQL string.
   * @return {Object} Parsed AST.
   */
  parse(sql) {
    const parser = new SQLParser(sql);
    return parser.parse();
  }

  /**
   * Resolve partitions for a query without executing.
   * @param {string} tableName - Table name.
   * @param {Object} whereClause - WHERE clause AST.
   * @return {Array} Partition IDs.
   */
  resolvePartitions(tableName, whereClause) {
    const partitions = this.getTablePartitions(tableName);
    return this.partitionResolver.resolvePartitions(
      tableName,
      whereClause,
      partitions,
    );
  }
}
export {SQLQueryEngine};
