import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {PartitionServiceEntryApplyBase} from './partition-service-entry-apply-base.js';
import {unreplicatedLocalMutationRefusal} from './partition-local-mutation-admission.js';
import {
  startAdmittedPartitionWrite,
} from './partition-service-raft-write-commit.js';
import {collectBoundedSqliteRows} from
  '../query/query-result-budget.js';
import {
  admitPartitionStatement,
  classifyPartitionStatementHead,
  partitionStatementRefusalAnswer,
  runAdmittedPartitionStatement,
} from './partition-statement-admission.js';
import {
  PARTITION_STATEMENT_KIND,
  PARTITION_STATEMENT_PATH,
} from './partition-statement-admission-constants.js';
import {
  answerSettledStatement,
  readCommittedStatementOutcome,
} from './partition-committed-statement-outcome.js';
import {PARTITION_COMMITTED_STATEMENT_RECORD_STATE} from
  './partition-committed-statement-outcome-constants.js';
import {
  PARTITION_COMMITTED_COMMAND_ORIGIN,
  admitCommittedCommand,
  committedCommandRefusalResult,
} from './partition-committed-command-admission.js';
import {readPartitionWriteOrigin} from './partition-participant-transaction-store.js';
import {deliveryTransportOf, forwardedDeliveryAnswer, isDeliveredTransportDeliveryOutcome} from
  '../transport/transport-semantic-outcome.js';
import {transactionSchemaWriteRefusal} from
  '../query/distributed/distributed-transaction-schema-enforcement.js';
import {refuseRoutedClientSystemTableWrite} from
  '../query/sql-statement-ingress.js';


const {
  ERRORS,
  METRICS_LOG_TAG,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_SQL_FRAGMENT,
  PARTITION_SERVICE_VALUE,
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
  getSystemCachePrimaryKeyFieldOrFallback,
} = PARTITION_SERVICE_SHARED;

function buildQueryOperation(sql, params, options) {
  return {
    type: PARTITION_SERVICE_OPERATION.QUERY,
    sql,
    params,
    // As supplied: the admission owner decides whether it is valid.
    entryId: options.entryId ?? null,
    operationId: options.operationId || null,
    idempotencyKey: options.idempotencyKey || null,
    splitMirrorOrigin: options.splitMirrorOrigin || null,
  };
}

function resolveNonReadQueryRefusal(service, sql, options) {
  const statementKind = classifyPartitionStatementHead(sql).kind;
  if (statementKind === PARTITION_STATEMENT_KIND.READ) {
    return null;
  }
  const ingressRefusal = refuseRoutedClientSystemTableWrite(
    options, service.tableName);
  if (ingressRefusal !== null) {
    return {...ingressRefusal, partitionId: service.partitionId};
  }
  const schemaRefusal = transactionSchemaWriteRefusal(
    service.db, service.tableName, readPartitionWriteOrigin(service.db) !== null);
  return schemaRefusal !== null ?
    {...schemaRefusal, partitionId: service.partitionId} :
    null;
}

function buildWriteConfirmationTarget(service, result, operation, entry) {
  const tableName = operation.tableName || service.tableName;
  const pkField = getSystemCachePrimaryKeyFieldOrFallback(tableName);
  const whereClause = operation.whereClause || {};
  const data = operation.data || {};
  const pkValue = whereClause[pkField] ?? data[pkField];
  if (pkValue === void 0 || pkValue === null) {
    return null;
  }
  const isDelete = operation.type === PARTITION_SERVICE_OPERATION.DELETE;
  const expectedFields = !isDelete && Object.keys(data).length > 0 ? {...data} : null;
  return {
    tableName,
    pkValue,
    options: {
      originHlc: result?.originHlc || entry?.timestamp || null,
      expectedFields,
      operation: operation.type || null,
      inferredFromWrite: true,
    },
  };
}

function executeAdmittedReadQuery(service, admission, params, options) {
  const sqliteStartMs = service.timeSource.now();
  const visibleRows = collectBoundedSqliteRows(admission.statement, params, {
    cancellationToken: options.cancellationToken || null,
    deadlineMs: options.resultDeadlineMs,
    maxBytes: options.resultMaxBytes,
    maxRows: options.resultMaxRows,
  });
  const durationMs = service.timeSource.now() - sqliteStartMs;
  try {
    service.logger.info(METRICS_LOG_TAG.PARTITION_SQLITE, {
      partitionId: service.partitionId,
      operation: PARTITION_SERVICE_LITERAL.SELECT,
      durationMs,
      rowCount: visibleRows.length,
    });
  } catch (metricsErr) {
    void metricsErr;
  }
  return {
    success: true,
    rows: visibleRows,
    count: visibleRows.length,
    partitionId: service.partitionId,
  };
}

class PartitionServiceWriteMetricsBase extends PartitionServiceEntryApplyBase {
  async executeQuery(sql, params = [], options = {}) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXECUTING_QUERY, {
      partitionId: this.partitionId,
      sql: sql.substring(0, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
    });
    try {
      const operation = buildQueryOperation(sql, params, options);
      const nonReadRefusal = resolveNonReadQueryRefusal(this, sql, options);
      if (nonReadRefusal !== null) {
        return nonReadRefusal;
      }
      // A re-delivery of a write whose entry key is settled is answered from
      // its outcome row by applyWrite (nothing is proposed), before any
      // admission rule or the ceiling pre-check: state that changed after the
      // write committed never turns its outcome into a refusal.
      if (this.isSettledRedelivery(operation)) {
        return this.proposeWrite(operation);
      }
      // The statement-admission owner decides what a statement may prepare,
      // ordinary statements: a
      // refused head (a PRAGMA, TEMP DDL) is never prepared on the shared
      // connection. A participant session statement never reaches here (its
      // staging owner answers it).
      const admission = admitPartitionStatement(this, sql, params);
      if (!admission.admitted) {
        return partitionStatementRefusalAnswer(this, sql, admission);
      }
      return admission.kind === PARTITION_STATEMENT_KIND.READ ?
        executeAdmittedReadQuery(this, admission, params, options) :
        this.proposeWrite(operation);
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.QUERY_FAILED, {
        partitionId: this.partitionId,
        sql: sql.substring(0, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
        error: error.message,
      });
      throw error;
    }
  }
  // Whether a request re-delivers a write whose entry key is settled (a
  // SELECT has no committed outcome, so it is never looked up).
  isSettledRedelivery(operation) {
    const entryKey = typeof operation.entryId === 'string' &&
      operation.entryId.length > 0 ? this.getCommittedEntryKey(operation) : null;
    return entryKey !== null && classifyPartitionStatementHead(operation.sql).kind !==
      PARTITION_STATEMENT_KIND.READ && readCommittedStatementOutcome(this,
      entryKey).state === PARTITION_COMMITTED_STATEMENT_RECORD_STATE.SETTLED;
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
      sql: sql.substring(0, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
      bootstrap: true,
    });
    try {
      // The same owner as executeQuery: a refused head is never prepared, a
      // write passes R1-R3, and an allocating write is rolled back and
      // refused when it leaves the own table at the rowid ceiling.
      const admission = admitPartitionStatement(this, sql, params,
        PARTITION_STATEMENT_PATH.LOCAL);
      if (!admission.admitted) {
        return partitionStatementRefusalAnswer(this, sql, admission);
      }
      if (admission.kind === PARTITION_STATEMENT_KIND.READ) {
        const rows = admission.statement.all(...params);
        return {
          success: true,
          rows,
          count: rows.length,
          partitionId: this.partitionId,
        };
      }
      const fenced = unreplicatedLocalMutationRefusal(this);
      if (fenced !== null) {
        return fenced;
      }
      const outcome = runAdmittedPartitionStatement(this, admission, params);
      if (!outcome.admitted) {
        return partitionStatementRefusalAnswer(this, sql, outcome);
      }
      this.scheduleSizeUpdate();
      return {
        success: true,
        changes: outcome.info.changes,
        lastInsertRowid: outcome.info.lastInsertRowid,
        partitionId: this.partitionId,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.QUERY_FAILED, {
        partitionId: this.partitionId,
        sql: sql.substring(0, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
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
        String(entry?.proposedAt || this.timeSource.now());
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
    const durationMs = Math.max(0, this.timeSource.now() - startedAtMs);
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
    const proposeStartMs = this.timeSource.now();
    const timestamp = this.hlcClock.now();
    const entryBuildStartMs = this.timeSource.now();
    const entry = buildPartitionWriteEntry(operation, {
      timestamp,
      proposedBy: this.replicaId,
      proposedAt: this.timeSource.now(),
    });
    const entryBuildMs = Math.max(0, this.timeSource.now() - entryBuildStartMs);
    const correlation = this.resolveWriteMetricCorrelation(entry);
    const isLeader = this.role === RaftRole.LEADER;
    if (isLeader) {
      const phaseTimings = {};
      const result = await this.applyWrite(entry, phaseTimings);
      const durationMs = this.timeSource.now() - proposeStartMs;
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
      this._attachCdcConfirmation(result, operation, options, entry);
      return result;
    }
    if (this.leaderId && this.transport) {
      const phaseTimings = {};
      const forwardDeliverStartMs = this.timeSource.now();
      try {
        const leaderAddress = this.resolveLeaderAddress();
        if (!leaderAddress) {
          throw new Error(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
        }
        const delivery = await this.transport.deliver(leaderAddress, {
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
        const durationMs = this.timeSource.now() - proposeStartMs;
        const forwardOutcome = deliveryTransportOf(delivery);
        // A forwarding hop answers with the leader's answer, or its typed
        // refusal when the leader was not reached; never the leader's
        // transport outcome.
        const result = forwardedDeliveryAnswer(delivery);
        try {
          this.logger.info(METRICS_LOG_TAG.PARTITION_RAFT_PROPOSE, {
            partitionId: this.partitionId,
            durationMs,
            isLeader: false,
            forwarded: true,
            operationId: correlation.operationId,
            requestId: correlation.requestId,
            correlationId: correlation.correlationId,
            deliveryState: forwardOutcome.deliveryState,
            error: isDeliveredTransportDeliveryOutcome(forwardOutcome) ?
              null :
              forwardOutcome.error || null,
            writePhaseTimingMs: this.buildWritePhaseTimingPayload(
              phaseTimings,
              durationMs,
              entryBuildMs,
            ),
          });
        } catch (_metricsErr) {
          // Ignore metrics emission failures on the forwarded path.
        }
        this._attachCdcConfirmation(result, operation, options, entry);
        return result;
      } catch (error) {
        this.recordWritePhaseDuration(
          phaseTimings,
          WRITE_PHASE_FIELD_FORWARD_DELIVER_MS,
          forwardDeliverStartMs,
        );
        const durationMs = this.timeSource.now() - proposeStartMs;
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
  _attachCdcConfirmation(result, operation, options, entry = null) {
    if (!options?.awaitCDCConfirmation || !this.cdcConfirmationTracker) {
      return;
    }
    const target = buildWriteConfirmationTarget(this, result, operation, entry);
    if (target) {
      result.cdcConfirmation = this.cdcConfirmationTracker.awaitConfirmation(
        target.tableName,
        target.pkValue,
        target.options,
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
   * The answer to a write whose entry key is already settled, from its
   * durable outcome row; undefined when the key is unsettled (or the entry
   * carries no statement) and the write must be proposed.
   * @param {Object} entry - The write entry.
   * @param {string|null} entryKey - Its committed entry key.
   * @return {Object|undefined} The write result, acknowledged by this node
   *   when it is a success.
   * @private
   */
  answerSettledWrite(entry, entryKey) {
    if (typeof entryKey !== 'string') {
      return undefined;
    }
    const recorded = readCommittedStatementOutcome(this, entryKey);
    if (recorded.state !== PARTITION_COMMITTED_STATEMENT_RECORD_STATE.SETTLED) {
      return undefined;
    }
    const answer = answerSettledStatement(this, {recorded, command: entry});
    return answer.success ? {
      ...answer,
      acceptingNodeId: this.nodeId,
      acknowledgedAtMs: this.timeSource.now(),
    } : answer;
  }
  /**
   * Apply a write operation (leader only).
   * @param {Object} entry - Write entry.
   * @param {Object|null} phaseTimings - Optional phase timing collector.
   * @return {Promise<Object>} Operation result.
   * @private
   */
  async applyWrite(entry, phaseTimings = null) {
    const applyStartMs = this.timeSource.now();
    entry = buildPartitionWriteEntry(entry, {
      timestamp: entry?.timestamp,
      proposedBy: entry?.proposedBy || this.replicaId,
      proposedAt: entry?.proposedAt,
    });
    const schemaRefusal = transactionSchemaWriteRefusal(this.db, this.tableName,
      readPartitionWriteOrigin(this.db) !== null);
    if (schemaRefusal !== null) {
      return {...schemaRefusal, partitionId: this.partitionId};
    }
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
    // A command the application would refuse, or consume without answering
    // its proposer, is refused before it enters consensus (the admission
    // owner decides; a forwarded write arrives here too).
    const admission = admitCommittedCommand(entry, {
      origin: PARTITION_COMMITTED_COMMAND_ORIGIN.WRITE_PATH});
    if (!admission.admitted) {
      this.recordWritePhaseDuration(
        phaseTimings,
        WRITE_PHASE_FIELD_APPLY_WRITE_MS,
        applyStartMs,
      );
      return committedCommandRefusalResult(admission, this.partitionId);
    }
    // A settled entry key is answered from its durable outcome row, before
    // anything is proposed: a retry never adds a log entry, and its answer is
    // the same in process and after a restart.
    const settledAnswer = this.answerSettledWrite(entry, entryKey);
    if (settledAnswer !== undefined) {
      this.recordWritePhaseDuration(
        phaseTimings,
        WRITE_PHASE_FIELD_APPLY_WRITE_MS,
        applyStartMs,
      );
      return settledAnswer;
    }
    // The write commit owner: parked unproposed while a prepared participant
    // transaction reserves the partition (re-admitted by its decision);
    // otherwise only the consensus leader proposes, once, through the port,
    // and the committed-entry application answers it with its durable commit
    // witness.
    return startAdmittedPartitionWrite(this, {
      entry,
      phaseTimings,
      applyStartMs,
    });
  }
  async applyWriteSideEffectPlan({
    entry,
    result,
    sideEffectPlan,
    commitPromise,
  }) {
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
