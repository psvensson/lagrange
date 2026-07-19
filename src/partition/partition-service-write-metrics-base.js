import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {PartitionServiceTransactionBase} from './partition-service-transaction-base.js';
import {
  startPartitionRaftWriteCommit,
} from './partition-service-raft-write-commit.js';


const {
  ERRORS,
  LifeRaft,
  METRICS_LOG_TAG,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_SQL_FRAGMENT,
  PARTITION_SERVICE_VALUE,
  PARTITION_WRITE_COMMIT_MODE,
  RaftRole,
  SQL,
  TABLES,
  WRITE_PHASE_FIELD_APPLY_WRITE_MS,
  WRITE_PHASE_FIELD_ENTRY_BUILD_MS,
  WRITE_PHASE_FIELD_FORWARD_DELIVER_MS,
  WRITE_PHASE_FIELD_LOG_APPEND_MS,
  WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS,
  WRITE_PHASE_FIELD_SQLITE_RUN_MS,
  WRITE_PHASE_FIELD_TOTAL_MS,
  buildPartitionWriteEntry,
  buildPartitionWriteFailureResult,
  buildPartitionWriteSideEffectPlan,
  executePartitionWriteStatement,
  getSystemCachePrimaryKeyFieldOrFallback,
  resolvePartitionWriteCommitMode,
} = PARTITION_SERVICE_SHARED;

class PartitionServiceWriteMetricsBase extends PartitionServiceTransactionBase {
  async executeQuery(sql, params = [], options = {}) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXECUTING_QUERY, {
      partitionId: this.partitionId,
      sql: sql.substring(
        0,
        PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS,
      ),
    });
    try {
      const stmt = this.db.prepare(sql);
      const isSelect = sql.trim().toUpperCase().startsWith(SQL.SELECT);
      if (isSelect) {
        const sqliteStartMs = Date.now();
        const rows = stmt.all(...params);
        const transaction = this.resolveActiveTransactionState(
          options.sessionId || null,
        );
        const visibleRows = transaction ?
          this.applySnapshotReadFilter(rows, transaction.state) :
          rows;
        const durationMs = Date.now() - sqliteStartMs;
        try {
          this.logger.info(METRICS_LOG_TAG.PARTITION_SQLITE, {
            partitionId: this.partitionId,
            operation: PARTITION_SERVICE_LITERAL.SELECT,
            durationMs,
            rowCount: visibleRows.length,
          });
        } catch (_metricsErr) {
          // Ignore metrics emission failures on the read path.
        }
        return {
          success: true,
          rows: visibleRows,
          count: visibleRows.length,
          partitionId: this.partitionId,
        };
      } else {
        const transaction = this.resolveActiveTransactionState(
          options.sessionId || null,
        );
        const operation = {
          type: PARTITION_SERVICE_OPERATION.QUERY,
          sql,
          params,
          entryId: options.entryId || null,
          operationId: options.operationId || null,
          idempotencyKey: options.idempotencyKey || null,
          splitMirrorOrigin: options.splitMirrorOrigin || null,
        };
        if (transaction) {
          return this.executeTransactionWrite(
            operation,
            transaction.sessionId,
          );
        }
        return this.proposeWrite(operation);
      }
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.QUERY_FAILED, {
        partitionId: this.partitionId,
        sql: sql.substring(
          0,
          PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS,
        ),
        error: error.message,
      });
      throw error;
    }
  }
  /**
   * Execute a SQL query directly on the local SQLite database.
   * Bootstrap-only helper: bypasses Raft and does not replicate.
   * @param {string} sql - SQL query string.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Query result.
   */
  async executeLocalQuery(sql, params = []) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXECUTING_QUERY, {
      partitionId: this.partitionId,
      sql: sql.substring(
        0,
        PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS,
      ),
      bootstrap: true,
    });
    try {
      const stmt = this.db.prepare(sql);
      const isSelect = sql.trim().toUpperCase().startsWith(SQL.SELECT);
      if (isSelect) {
        const rows = stmt.all(...params);
        return {
          success: true,
          rows,
          count: rows.length,
          partitionId: this.partitionId,
        };
      }
      const info = stmt.run(...params);
      this.scheduleSizeUpdate();
      return {
        success: true,
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
        partitionId: this.partitionId,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.QUERY_FAILED, {
        partitionId: this.partitionId,
        sql: sql.substring(
          0,
          PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS,
        ),
        error: error.message,
      });
      throw error;
    }
  }
  /**
   * Execute a write operation within an active transaction.
   * @param {Object} operation - Write operation.
   * @param {string|null} sessionId - Transaction session ID.
   * @return {Promise<Object>} Operation result.
   * @private
   */
  async executeTransactionWrite(operation, sessionId = null) {
    const transaction = this.resolveActiveTransactionState(sessionId);
    if (!transaction) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION);
    }
    const {sessionId: transactionSessionId, state: transactionState} =
      transaction;
    const timestamp = this.hlcClock.now();
    const entry = buildPartitionWriteEntry(
      {
        ...operation,
        sessionId: transactionSessionId,
      },
      {
        timestamp,
        proposedBy: this.replicaId,
        proposedAt: Date.now(),
      },
    );
    try {
      const stmt = this.db.prepare(entry.sql);
      const info = stmt.run(...(entry.params || []));
      const trackedEntry = {...entry, changes: info.changes};
      transactionState.operations.push(trackedEntry);
      this.trackTransactionWriteSetKey(transactionState, trackedEntry);
      this.syncLegacyTransactionAliases();
      return {
        success: true,
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
        partitionId: this.partitionId,
        inTransaction: true,
        sessionId: transactionSessionId,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_WRITE_FAILED, {
        partitionId: this.partitionId,
        error: error.message,
      });
      throw error;
    }
  }
  /**
   * Insert data into the partition.
   * @param {string} tableName - Table name.
   * @param {Object} data - Data to insert.
   * @return {Promise<Object>} Insert result.
   */
  async insertData(tableName, data, options) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }
    const columns = Object.keys(data);
    const values = Object.values(data);
    const joinedColumns = columns.join(
      PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE,
    );
    const placeholders = columns
      .map(() => PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK)
      .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
    const sql =
      `${SQL.INSERT_INTO} ${tableName} (${joinedColumns}) ` +
      `${SQL.VALUES} (${placeholders})`;
    return this.proposeWrite(
      {
        type: PARTITION_SERVICE_OPERATION.INSERT,
        tableName,
        data,
        sql,
        params: values,
      },
      options,
    );
  }
  /**
   * Update data in the partition.
   * @param {string} tableName - Table name.
   * @param {Object} whereClause - WHERE clause conditions.
   * @param {Object} data - Data to update.
   * @return {Promise<Object>} Update result.
   */
  async updateData(tableName, whereClause, data, options) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }
    const setClauses = Object.keys(data)
      .map((k) => `${k} = ${PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK}`)
      .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
    const whereClauses = Object.keys(whereClause)
      .map((k) => `${k} = ${PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK}`)
      .join(PARTITION_SERVICE_SQL_FRAGMENT.AND);
    const sql = `${SQL.UPDATE} ${tableName} ${SQL.SET} ${setClauses} ${SQL.WHERE} ${whereClauses}`;
    const params = [...Object.values(data), ...Object.values(whereClause)];
    return this.proposeWrite(
      {
        type: PARTITION_SERVICE_OPERATION.UPDATE,
        tableName,
        data,
        whereClause,
        sql,
        params,
      },
      options,
    );
  }
  /**
   * Delete data from the partition.
   * @param {string} tableName - Table name.
   * @param {Object} whereClause - WHERE clause conditions.
   * @return {Promise<Object>} Delete result.
   */
  async deleteData(tableName, whereClause, options) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }
    const whereClauses = Object.keys(whereClause)
      .map((k) => `${k} = ${PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK}`)
      .join(PARTITION_SERVICE_SQL_FRAGMENT.AND);
    const sql = `${SQL.DELETE_FROM} ${tableName} ${SQL.WHERE} ${whereClauses}`;
    const params = Object.values(whereClause);
    return this.proposeWrite(
      {
        type: PARTITION_SERVICE_OPERATION.DELETE,
        tableName,
        whereClause,
        sql,
        params,
      },
      options,
    );
  }
  /**
   * Upsert data in the partition (insert or replace on conflict).
   * @param {string} tableName - Table name.
   * @param {Object} data - Data to upsert.
   * @return {Promise<Object>} Upsert result.
   */
  async upsertData(tableName, data, options) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }
    const columns = Object.keys(data);
    const values = Object.values(data);
    const joinedColumns = columns.join(
      PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE,
    );
    const placeholders = columns
      .map(() => PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK)
      .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
    const sql =
      `${SQL.INSERT_OR_REPLACE_INTO} ${tableName} (${joinedColumns}) ` +
      `${SQL.VALUES} (${placeholders})`;
    return this.proposeWrite(
      {
        type: PARTITION_SERVICE_OPERATION.UPSERT,
        tableName,
        data,
        sql,
        params: values,
      },
      options,
    );
  }
  /**
   * Resolve write-correlation identifiers for metrics payloads.
   * @param {Object} entry - Write entry.
   * @return {Object}
   * @private
   */
  resolveWriteMetricCorrelation(entry) {
    const requestId = this.normalizeMetricIdentifier(
      entry?.requestId || entry?.request_id,
    );
    const correlationId = this.normalizeMetricIdentifier(
      entry?.correlationId || entry?.correlation_id,
    );
    const operationId =
      this.normalizeMetricIdentifier(
        entry?.operationId || entry?.operation_id || entry?.id,
      ) ||
      requestId ||
      correlationId ||
      this.partitionId +
        ':' +
        this.replicaId +
        ':' +
        String(entry?.proposedAt || Date.now());
    return {
      operationId,
      requestId,
      correlationId: correlationId || requestId || operationId,
    };
  }
  /**
   * Normalize identifier-like values for metric payload fields.
   * @param {*} value - Candidate value.
   * @return {string|null}
   * @private
   */
  normalizeMetricIdentifier(value) {
    if (value === null || value === void 0) {
      return null;
    }
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
  }
  /**
   * Record a write phase timing duration.
   * @param {Object|null} phaseTimings - Target phase timing object.
   * @param {string} field - Phase field name.
   * @param {number} startedAtMs - Phase start timestamp.
   * @private
   */
  recordWritePhaseDuration(phaseTimings, field, startedAtMs) {
    if (!phaseTimings || !Number.isFinite(startedAtMs)) {
      return;
    }
    const durationMs = Math.max(0, Date.now() - startedAtMs);
    phaseTimings[field] = durationMs;
  }
  /**
   * Merge baseline and measured write phase timings for metric payloads.
   * @param {Object} phaseTimings - Measured phase timings.
   * @param {number} totalDurationMs - End-to-end write duration.
   * @param {number} entryBuildMs - Entry-construction duration.
   * @return {Object}
   * @private
   */
  buildWritePhaseTimingPayload(phaseTimings, totalDurationMs, entryBuildMs) {
    return {
      [WRITE_PHASE_FIELD_ENTRY_BUILD_MS]: entryBuildMs,
      [WRITE_PHASE_FIELD_FORWARD_DELIVER_MS]:
        phaseTimings?.[WRITE_PHASE_FIELD_FORWARD_DELIVER_MS] || 0,
      [WRITE_PHASE_FIELD_LOG_APPEND_MS]:
        phaseTimings?.[WRITE_PHASE_FIELD_LOG_APPEND_MS] || 0,
      [WRITE_PHASE_FIELD_SQLITE_RUN_MS]:
        phaseTimings?.[WRITE_PHASE_FIELD_SQLITE_RUN_MS] || 0,
      [WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS]:
        phaseTimings?.[WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS] || 0,
      [WRITE_PHASE_FIELD_APPLY_WRITE_MS]:
        phaseTimings?.[WRITE_PHASE_FIELD_APPLY_WRITE_MS] || 0,
      [WRITE_PHASE_FIELD_TOTAL_MS]: Math.max(0, totalDurationMs),
    };
  }
  /**
   * Propose a write operation through Raft.
   * @param {Object} operation - Write operation.
   * @return {Promise<Object>} Operation result.
   * @private
   */
  async proposeWrite(operation, options) {
    const proposeStartMs = Date.now();
    const timestamp = this.hlcClock.now();
    const entryBuildStartMs = Date.now();
    const entry = buildPartitionWriteEntry(operation, {
      timestamp,
      proposedBy: this.replicaId,
      proposedAt: Date.now(),
    });
    const entryBuildMs = Math.max(0, Date.now() - entryBuildStartMs);
    const correlation = this.resolveWriteMetricCorrelation(entry);
    const isLeader = this.role === RaftRole.LEADER;
    if (isLeader) {
      const phaseTimings = {};
      const result = await this.applyWrite(entry, phaseTimings);
      const durationMs = Date.now() - proposeStartMs;
      try {
        this.logger.info(METRICS_LOG_TAG.PARTITION_RAFT_PROPOSE, {
          partitionId: this.partitionId,
          durationMs,
          isLeader: true,
          forwarded: false,
          operationId: correlation.operationId,
          requestId: correlation.requestId,
          correlationId: correlation.correlationId,
          acknowledged: result?.success === true,
          error: result?.success === true ? null : result?.error || null,
          writePhaseTimingMs: this.buildWritePhaseTimingPayload(
            phaseTimings,
            durationMs,
            entryBuildMs,
          ),
        });
      } catch (_metricsErr) {
        // Ignore metrics emission failures on the leader-local path.
      }
      this._attachCdcConfirmation(result, operation, options);
      return result;
    }
    if (this.leaderId && this.transport) {
      const phaseTimings = {};
      const forwardDeliverStartMs = Date.now();
      try {
        const leaderAddress = this.resolveLeaderAddress();
        if (!leaderAddress) {
          throw new Error(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
        }
        const result = await this.transport.deliver(leaderAddress, {
          type: PARTITION_SERVICE_MESSAGE_TYPE.FORWARD_WRITE,
          operation: entry,
          operationId: correlation.operationId,
          requestId: correlation.requestId,
          correlationId: correlation.correlationId,
        });
        this.recordWritePhaseDuration(
          phaseTimings,
          WRITE_PHASE_FIELD_FORWARD_DELIVER_MS,
          forwardDeliverStartMs,
        );
        const durationMs = Date.now() - proposeStartMs;
        try {
          this.logger.info(METRICS_LOG_TAG.PARTITION_RAFT_PROPOSE, {
            partitionId: this.partitionId,
            durationMs,
            isLeader: false,
            forwarded: true,
            operationId: correlation.operationId,
            requestId: correlation.requestId,
            correlationId: correlation.correlationId,
            acknowledged: result?.acknowledged === true,
            error: result?.acknowledged === true ? null : result?.error || null,
            writePhaseTimingMs: this.buildWritePhaseTimingPayload(
              phaseTimings,
              durationMs,
              entryBuildMs,
            ),
          });
        } catch (_metricsErr) {
          // Ignore metrics emission failures on the forwarded path.
        }
        this._attachCdcConfirmation(result, operation, options);
        return result;
      } catch (error) {
        this.recordWritePhaseDuration(
          phaseTimings,
          WRITE_PHASE_FIELD_FORWARD_DELIVER_MS,
          forwardDeliverStartMs,
        );
        const durationMs = Date.now() - proposeStartMs;
        try {
          this.logger.info(METRICS_LOG_TAG.PARTITION_RAFT_PROPOSE, {
            partitionId: this.partitionId,
            durationMs,
            isLeader: false,
            forwarded: true,
            operationId: correlation.operationId,
            requestId: correlation.requestId,
            correlationId: correlation.correlationId,
            acknowledged: false,
            error: error?.message || null,
            writePhaseTimingMs: this.buildWritePhaseTimingPayload(
              phaseTimings,
              durationMs,
              entryBuildMs,
            ),
          });
        } catch (_metricsErr) {
          // Ignore metrics emission failures on the error path.
        }
        throw new Error(
          PARTITION_SERVICE_ERROR_MSG.forwardWriteFailed(error.message),
        );
      }
    }
    throw new Error(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
  }
  /**
   * Attach a CDC confirmation promise to the write result when the
   * caller requested awaitable CDC confirmation.
   *
   * @param {Object} result - Write result to augment.
   * @param {Object} operation - Write operation with tableName and data.
   * @param {Object} [options] - Write options.
   * @private
   */
  _attachCdcConfirmation(result, operation, options) {
    if (!options?.awaitCDCConfirmation || !this.cdcConfirmationTracker) {
      return;
    }
    const tableName = operation.tableName || this.tableName;
    const pkField = getSystemCachePrimaryKeyFieldOrFallback(tableName);
    const whereClause = operation.whereClause || {};
    const data = operation.data || {};
    const pkValue = whereClause[pkField] ?? data[pkField];
    if (pkValue !== void 0 && pkValue !== null) {
      result.cdcConfirmation = this.cdcConfirmationTracker.awaitConfirmation(
        tableName,
        pkValue,
      );
    }
  }
  /**
   * Resolve whether ACTUAL evidence names a leader for this partition
   * somewhere other than this replica: the raft-observed leader id (set by
   * received append traffic / leader-change events) or the published
   * partitions-row leader pointer on another node. Both are actuals; a
   * target such as replica_count must never be used here — it legitimately
   * exceeds placed membership on single-node and degraded clusters.
   * @return {boolean}
   * @private
   */
  hasKnownRemoteLeaderWitness() {
    if (
      typeof this.leaderId === 'string' &&
      this.leaderId.length > 0 &&
      this.leaderId !== this.replicaId
    ) {
      return true;
    }
    const partitionRow = this.systemTableCache?.get?.(
      TABLES.PARTITIONS,
      this.partitionId,
    );
    const publishedLeaderNodeId = partitionRow?.leader_node_id;
    return (
      typeof publishedLeaderNodeId === 'string' &&
      publishedLeaderNodeId.length > 0 &&
      typeof this.nodeId === 'string' &&
      this.nodeId.length > 0 &&
      publishedLeaderNodeId !== this.nodeId
    );
  }

  /**
   * Apply a write operation (leader only).
   * @param {Object} entry - Write entry.
   * @param {Object|null} phaseTimings - Optional phase timing collector.
   * @return {Promise<Object>} Operation result.
   * @private
   */
  async applyWrite(entry, phaseTimings = null) {
    const applyStartMs = Date.now();
    entry = buildPartitionWriteEntry(entry, {
      timestamp: entry?.timestamp,
      proposedBy: entry?.proposedBy || this.replicaId,
      proposedAt: entry?.proposedAt,
    });
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.APPLY_WRITE_CALLED, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
      tableName: this.tableName,
      isLeader: this.isLeader,
      cdcSubscribers: this.cdcSubscribers.size,
      entryType: entry.type,
    });
    const entryKey = this.getCommittedEntryKey(entry);
    const pendingOutcome = this.getPendingCommittedWriteOutcome(entry.entryId);
    if (pendingOutcome) {
      return pendingOutcome;
    }
    if (entryKey && this.recentlyAppliedEntryKeys.has(entryKey)) {
      this.recordWritePhaseDuration(
        phaseTimings,
        WRITE_PHASE_FIELD_APPLY_WRITE_MS,
        applyStartMs,
      );
      return {
        success: true,
        changes: 0,
        partitionId: this.partitionId,
        idempotentReplay: true,
      };
    }
    const commitMode = resolvePartitionWriteCommitMode({
      replicaIds: this.replicaIds,
      raftState: this.raft?.state,
      raftLeaderState: LifeRaft.LEADER,
      hasKnownRemoteLeader: this.hasKnownRemoteLeaderWitness(),
    });
    // Rejected writes must not touch the local raft log: an appended entry
    // at a self-assigned index conflicts with the index space the true
    // leader is committing into.
    if (commitMode === PARTITION_WRITE_COMMIT_MODE.REJECTED) {
      this.recordWritePhaseDuration(
        phaseTimings,
        WRITE_PHASE_FIELD_APPLY_WRITE_MS,
        applyStartMs,
      );
      return {
        success: false,
        error: ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
        partitionId: this.partitionId,
      };
    }
    const logAppendStartMs = Date.now();
    const logEntry = this.storage.appendEntry(entry);
    this.recordWritePhaseDuration(
      phaseTimings,
      WRITE_PHASE_FIELD_LOG_APPEND_MS,
      logAppendStartMs,
    );
    if (commitMode === PARTITION_WRITE_COMMIT_MODE.RAFT) {
      return startPartitionRaftWriteCommit(this, {
        entry,
        entryKey,
        logEntry,
        phaseTimings,
        applyStartMs,
      });
    }
    let result;
    const sqliteRunStartMs = Date.now();
    try {
      if (entry.type === PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE) {
        this.registerMigrationDefaultFromAlterSql(entry.sql);
      }
      result = executePartitionWriteStatement(
        this.db,
        entry,
        this.partitionId,
        logEntry.index,
      );
      this.recordWritePhaseDuration(
        phaseTimings,
        WRITE_PHASE_FIELD_SQLITE_RUN_MS,
        sqliteRunStartMs,
      );
      const sideEffectPlan = buildPartitionWriteSideEffectPlan(entry, result);
      await this.applyWriteSideEffectPlan({
        entry,
        entryKey,
        result,
        sideEffectPlan,
        commitPromise: null,
      });
      if (entry.type === PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE) {
        this.logger.info(
          PARTITION_SERVICE_LOG_MSG.MIGRATION_ALTER_TABLE_APPLIED,
          {
            partitionId: this.partitionId,
            tableName: this.tableName,
            migrationId: entry.migrationId || null,
          },
        );
      }
    } catch (error) {
      this.recordWritePhaseDuration(
        phaseTimings,
        WRITE_PHASE_FIELD_SQLITE_RUN_MS,
        sqliteRunStartMs,
      );
      result = buildPartitionWriteFailureResult(error, this.partitionId);
    }
    if (!result.success) {
      this.recordWritePhaseDuration(
        phaseTimings,
        WRITE_PHASE_FIELD_APPLY_WRITE_MS,
        applyStartMs,
      );
      return result;
    }
    this.recordWritePhaseDuration(
      phaseTimings,
      WRITE_PHASE_FIELD_APPLY_WRITE_MS,
      applyStartMs,
    );
    return result;
  }
  async applyWriteSideEffectPlan({
    entry,
    entryKey,
    result,
    sideEffectPlan,
    commitPromise,
  }) {
    this.trackAppliedEntryKey(entryKey);
    if (commitPromise) {
      this.setPendingCommittedWriteResult(entry.entryId, result);
    }
    if (sideEffectPlan.emitCdcEntry) {
      this.trackPendingCDCEvent(
        this.generateCDCEvent(sideEffectPlan.emitCdcEntry).catch((error) => {
          if (this.isShutdown) {
            return;
          }
          this.logger.error(PARTITION_SERVICE_ERROR_MSG.CDC_EVENT_FAILED, {
            partitionId: this.partitionId,
            error: error.message,
          });
        }),
      );
    }
    if (sideEffectPlan.splitReplicationEntry) {
      await this.handleSplitReplicationAfterWrite(
        sideEffectPlan.splitReplicationEntry,
      );
      // Only awaited while a merge mirror is active: an unconditional await
      // would add a microtask tick to every hot-path write ack.
      if (this.mergeReplication) {
        await this.handleMergeReplicationAfterWrite(
          sideEffectPlan.splitReplicationEntry,
        );
      }
    }
    if (sideEffectPlan.scheduleSizeUpdate) {
      this.scheduleSizeUpdate();
    }
    if (sideEffectPlan.requestManagedSplitEvaluation) {
      this.requestManagedSplitEvaluationAfterWrite(entry);
    }
  }
}
export {PartitionServiceWriteMetricsBase};
