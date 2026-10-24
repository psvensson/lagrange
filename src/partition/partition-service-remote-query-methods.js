// Remote QUERY routing preserves the partition's ordinary read/write gates and
// delegates current transaction identity and staging to the participant owner.
import {QUERY_ERROR_CODE} from '../query/query-constants.js';
import {refuseRoutedClientSystemTableWrite} from
  '../query/sql-statement-ingress.js';
import {
  answerParticipantQueryIdentityRefusal,
  answerParticipantSessionQuery,
} from './partition-participant-transaction-request.js';
import {coordinatorTableSchemaRefusal} from
  '../query/distributed/distributed-transaction-schema-enforcement.js';
import {QUERY_RESULT_REQUEST_FIELD} from '../query/query-result-budget.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL, pickTypedWriteAnswer} from
  './partition-write-kernel.js';
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const READ_AUTHORITY_WITNESS_STATE = Object.freeze({
  NOT_APPLICABLE: 'not_applicable',
  OBSERVED: 'observed',
});

const {
  ERRORS,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_MIGRATION_OPERATION,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_RESPONSE,
  PARTITION_SERVICE_VALUE,
  PARTITION_TRANSITION_STATE,
  QUERY_PAYLOAD_FIELD_ENTRY_ID,
  QUERY_PAYLOAD_FIELD_EXPECTED_PARTITION_VERSION,
  QUERY_PAYLOAD_FIELD_IDEMPOTENCY_KEY,
  QUERY_PAYLOAD_FIELD_MIGRATION_ID,
  QUERY_PAYLOAD_FIELD_MIGRATION_OPERATION,
  QUERY_PAYLOAD_FIELD_OPERATION_ID,
  RaftRole,
  TABLES,
} = PARTITION_SERVICE_SHARED;

function writeRoutingRefusal(service, payload, isWriteOperation) {
  if (!isWriteOperation) return null;
  const epochRejection = service.rejectStalePartitionEpochWrite(
    payload[QUERY_PAYLOAD_FIELD_EXPECTED_PARTITION_VERSION]);
  if (epochRejection !== null) return epochRejection;
  if (service.role === RaftRole.LEADER) return null;
  const leaderAddress = service.resolveLeaderAddress();
  if (leaderAddress) {
    service.logger.debug(PARTITION_SERVICE_LOG_MSG.REDIRECTING_WRITE_TO_LEADER, {
      partitionId: service.partitionId,
      replicaId: service.replicaId,
      leaderAddress,
    });
    return {acknowledged: true, success: false,
      redirect: PARTITION_SERVICE_RESPONSE.LEADER_REDIRECT, leaderAddress,
      partitionId: service.partitionId};
  }
  return {acknowledged: true, success: false,
    error: ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
    failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER,
    partitionId: service.partitionId};
}

async function executeRemoteQuery(service, payload) {
  const sql = payload.sql;
  const params = payload.params || [];
  if (payload[QUERY_PAYLOAD_FIELD_MIGRATION_OPERATION] ===
      PARTITION_SERVICE_MIGRATION_OPERATION.ALTER_TABLE) {
    return service.executeMigrationAlterQuery(sql, params, {
      migrationId: payload[QUERY_PAYLOAD_FIELD_MIGRATION_ID] || null,
      sessionId: payload.sessionId || null,
    });
  }
  return service.executeQuery(sql, params, {
    entryId: payload[QUERY_PAYLOAD_FIELD_ENTRY_ID] || null,
    operationId: payload[QUERY_PAYLOAD_FIELD_OPERATION_ID] || null,
    idempotencyKey: payload[QUERY_PAYLOAD_FIELD_IDEMPOTENCY_KEY] || null,
    splitMirrorOrigin: payload.splitMirrorOrigin || null,
    sessionId: payload.sessionId || null,
    resultDeadlineMs: payload[QUERY_RESULT_REQUEST_FIELD.DEADLINE_MS],
    resultMaxBytes: payload[QUERY_RESULT_REQUEST_FIELD.MAX_BYTES],
    resultMaxRows: payload[QUERY_RESULT_REQUEST_FIELD.MAX_ROWS],
  });
}

function remoteQueryAnswer(service, result, readAuthorityWitness) {
  const success = result?.success !== false;
  const answer = {
    acknowledged: true, success, rows: result.rows, changes: result.changes,
    count: result.count, partitionId: service.partitionId,
    durableCommitWitness: result.durableCommitWitness,
    originHlc: result.originHlc, acceptingNodeId: result.acceptingNodeId,
    acknowledgedAtMs: result.acknowledgedAtMs, readAuthorityWitness,
  };
  if (!success) Object.assign(answer, pickTypedWriteAnswer(result));
  if (!success && result.error) answer.error = result.error;
  if (!success && result.errorCode) answer.errorCode = result.errorCode;
  if (result.settledReplay !== undefined) {
    answer.settledReplay = result.settledReplay;
  }
  return answer;
}

function remoteQueryFailure(service, sql, error) {
  service.logger.error(PARTITION_SERVICE_ERROR_MSG.REMOTE_QUERY_FAILED, {
    sql: sql.substring(0, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
    error: error.message,
    partitionId: service.partitionId,
  });
  return {acknowledged: true, success: false, error: error.message,
    errorCode: error.code || null, partitionId: service.partitionId};
}

const PARTITION_SERVICE_REMOTE_QUERY_METHODS = Object.freeze({
  /**
   * Describe the replica that actually served a successful read.
   * @param {boolean} isWriteOperation
   * @return {Object}
   * @private
   */
  buildRemoteReadAuthorityWitness(isWriteOperation) {
    if (isWriteOperation) {
      return {state: READ_AUTHORITY_WITNESS_STATE.NOT_APPLICABLE};
    }
    // The term is the consensus core's own, read through the port.
    const status = this.raft?.readStatus();
    return {
      state: READ_AUTHORITY_WITNESS_STATE.OBSERVED,
      partitionId: this.partitionId,
      servingNodeId: this.nodeId,
      servingReplicaId: this.replicaId,
      term: status?.term ?? null,
      role: this.role,
      // The witness records WHEN THIS REPLICA observed its own authority, so
      // it reads this replica's clock. This is the owner decision the metered
      // oracle's knownAmbientSiteOutsideProofCone reserved: the site had no
      // clock owner when it was recorded, and the composed formation reaching
      // it is what supplied one.
      observedAtMs: this.timeSource.now(),
    };
  },
  /**
   * Handle remote SQL query execution.
   * Enables transparent query routing - any node can execute queries on any partition.
   * For write operations on non-leaders, returns a redirect response with leader address.
   * @param {Object} payload - Query payload.
   * @param {string} payload.sql - SQL query string.
   * @param {Array} payload.params - Query parameters.
   * @return {Promise<Object>} Query result or redirect response.
   * @private
   */
  /**
   * Write-path epoch fencing at the partition boundary: reject a write
   * whose expectedPartitionVersion mismatches the locally authoritative
   * partition epoch with a typed stale-epoch outcome. Epoch evidence
   * never fails OPEN: when the local tables row is unavailable (cold
   * cache after restart) but the payload carries an expectation, the
   * write defers pre-cutover / fails closed post-cutover instead of
   * silently skipping validation. Returns the rejection envelope or
   * null when the write may proceed.
   * @param {*} expectedVersion - Payload epoch expectation.
   * @return {Object|null}
   * @private
   */
  rejectStalePartitionEpochWrite(expectedVersion) {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion <= 0) {
      return null;
    }
    const localVersion = this.resolveLocalActivePartitionVersion();
    if (localVersion === null) {
      return this.resolveEpochEvidenceGapOutcome(expectedVersion);
    }
    if (localVersion !== expectedVersion) {
      this.logger.warn(
        PARTITION_SERVICE_LOG_MSG.STALE_PARTITION_EPOCH_REJECTED,
        {
          partitionId: this.partitionId,
          expectedVersion,
          localVersion,
        },
      );
      return {
        acknowledged: true,
        success: false,
        error: PARTITION_SERVICE_ERROR_MSG.STALE_PARTITION_EPOCH_WRITE,
        errorCode: QUERY_ERROR_CODE.STALE_PARTITION_EPOCH,
        partitionId: this.partitionId,
      };
    }
    return null;
  },

  /**
   * Resolve the locally authoritative active partition version from the
   * cached tables row; null when the row is unavailable.
   * @return {number|null}
   * @private
   */
  resolveLocalActivePartitionVersion() {
    const row =
      this.systemTableCache?.get?.(TABLES.TABLES, this.tableId) ||
      this.systemTableCache?.get?.(TABLES.TABLES, this.tableName) ||
      null;
    const version = Number(
      row?.active_partition_version ?? row?.activePartitionVersion,
    );
    return Number.isSafeInteger(version) && version > 0 ? version : null;
  },

  /**
   * Epoch evidence gap (cold cache): a write carrying an epoch
   * expectation must never fail open. Pre-cutover it defers (the
   * evidence will hydrate and the retry re-validates); post-cutover it
   * fails closed (a withdrawn epoch must never accept writes).
   * @param {number} expectedVersion - Payload epoch expectation.
   * @return {Object} Rejection/defer envelope.
   * @private
   */
  resolveEpochEvidenceGapOutcome(expectedVersion) {
    const cutoverActive =
      this.splitReplication?.phase ===
        PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE ||
      this.mergeReplication?.phase ===
        PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE;
    if (cutoverActive) {
      this.logger.warn(
        PARTITION_SERVICE_LOG_MSG.STALE_PARTITION_EPOCH_REJECTED,
        {partitionId: this.partitionId, expectedVersion, evidenceGap: true},
      );
      return {
        acknowledged: true,
        success: false,
        error: PARTITION_SERVICE_ERROR_MSG.STALE_PARTITION_EPOCH_WRITE,
        errorCode: QUERY_ERROR_CODE.STALE_PARTITION_EPOCH,
        partitionId: this.partitionId,
      };
    }
    this.logger.info(
      PARTITION_SERVICE_LOG_MSG.PARTITION_EPOCH_EVIDENCE_DEFERRED,
      {partitionId: this.partitionId, expectedVersion},
    );
    return {
      acknowledged: true,
      success: false,
      error: PARTITION_SERVICE_ERROR_MSG.PARTITION_EPOCH_EVIDENCE_MISSING,
      errorCode: QUERY_ERROR_CODE.PARTITION_EPOCH_EVIDENCE_DEFERRED,
      deferRetry: true,
      partitionId: this.partitionId,
    };
  },

  async handleRemoteQuery(payload) {
    const {sql} = payload;
    const participantIdentityRefusal =
      answerParticipantQueryIdentityRefusal(this, payload);
    if (participantIdentityRefusal !== null) return participantIdentityRefusal;
    if (!sql) {
      return {
        acknowledged: false,
        error: PARTITION_SERVICE_ERROR_MSG.MISSING_SQL_QUERY,
      };
    }
    const isWriteOperation = this.isWriteQuery(sql);
    const routingRefusal = writeRoutingRefusal(this, payload, isWriteOperation);
    if (routingRefusal !== null) return routingRefusal;
    const ingressRefusal = isWriteOperation ?
      refuseRoutedClientSystemTableWrite(payload, this.tableName) : null;
    if (ingressRefusal !== null) {
      return {acknowledged: true, ...ingressRefusal,
        partitionId: this.partitionId};
    }
    const participantAnswer = answerParticipantSessionQuery(this, payload);
    if (participantAnswer !== null) return participantAnswer;
    const readAuthorityWitness =
      this.buildRemoteReadAuthorityWitness(isWriteOperation);
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.HANDLING_REMOTE_QUERY, {
      sql: sql.substring(
        0,
        PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS,
      ),
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });
    try {
      const result = await executeRemoteQuery(this, payload);
      return remoteQueryAnswer(this, result, readAuthorityWitness);
    } catch (error) {
      return remoteQueryFailure(this, sql, error);
    }
  },
  /**
   * Execute one migration ALTER TABLE request through the Raft write path.
   * @param {string} sql - ALTER TABLE SQL.
   * @param {Array} params - SQL params.
   * @param {Object} options - Migration context.
   * @return {Promise<Object>} Execution result.
   * @private
   */
  async executeMigrationAlterQuery(sql, params = [], options = {}) {
    if (!sql) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.MIGRATION_ALTER_MISSING_SQL);
    }
    const protectedSchema = coordinatorTableSchemaRefusal(this.tableName);
    if (protectedSchema !== null) {
      return {...protectedSchema, partitionId: this.partitionId};
    }
    this.registerMigrationDefaultFromAlterSql(sql);
    return this.proposeWrite({
      type: PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE,
      sql,
      params,
      migrationId: options.migrationId || null,
      sessionId: options.sessionId || null,
    });
  },
  /**
   * Parse and register one column default from ALTER TABLE ADD COLUMN SQL.
   * @param {string} sql - ALTER TABLE SQL.
   * @return {void}
   * @private
   */
  registerMigrationDefaultFromAlterSql(sql) {
    const parsed = this.parseAddColumnDefaultFromAlterSql(sql);
    if (!parsed || !parsed.columnName || !parsed.hasDefault) {
      return;
    }
    const tableKey = String(this.tableName || this.tableId || '');
    if (!tableKey) {
      return;
    }
    let columnDefaults = this.migrationColumnDefaultsByTable.get(tableKey);
    if (!columnDefaults) {
      columnDefaults = /* @__PURE__ */ new Map();
      this.migrationColumnDefaultsByTable.set(tableKey, columnDefaults);
    }
    columnDefaults.set(parsed.columnName, parsed.defaultLiteral);
    this.logger.info(PARTITION_SERVICE_LOG_MSG.MIGRATION_DEFAULT_REGISTERED, {
      partitionId: this.partitionId,
      tableName: tableKey,
      columnName: parsed.columnName,
    });
  },
  /**
   * Extract one default literal from ALTER TABLE ... ADD COLUMN SQL.
   * @param {string} sql - ALTER TABLE SQL.
   * @return {Object|null} Parsed default metadata.
   * @private
   */
  parseAddColumnDefaultFromAlterSql(sql) {
    const normalizedSql = String(sql || '');
    const addColumnMatch = normalizedSql.match(
      /^\s*ALTER\s+TABLE\s+.+?\s+ADD\s+COLUMN\s+([^\s]+)\s+([\s\S]+)$/i,
    );
    if (!addColumnMatch) {
      return null;
    }
    const columnName = String(addColumnMatch[1] || '').replace(
      /^["'`]|["'`]$/g,
      '',
    );
    const definitionTail = String(addColumnMatch[2] || '');
    const defaultMatch = definitionTail.match(
      /\bDEFAULT\s+((?:'[^']*'|"[^"]*"|`[^`]*`|[^\s,]+))/i,
    );
    return {
      columnName,
      hasDefault: defaultMatch !== null,
      defaultLiteral: defaultMatch ? defaultMatch[1] : null,
    };
  },
  /**
   * Check if a SQL query is a write operation.
   * @param {string} sql - SQL query string.
   * @return {boolean} True if write operation.
   * @private
   */
  isWriteQuery(sql) {
    if (!sql) return false;
    const trimmed = sql.trim().toUpperCase();
    return (
      trimmed.startsWith(PARTITION_SERVICE_LITERAL.INSERT) ||
      trimmed.startsWith(PARTITION_SERVICE_LITERAL.UPDATE) ||
      trimmed.startsWith(PARTITION_SERVICE_LITERAL.DELETE) ||
      trimmed.startsWith(PARTITION_SERVICE_LITERAL.CREATE) ||
      trimmed.startsWith(PARTITION_SERVICE_LITERAL.DROP) ||
      trimmed.startsWith(PARTITION_SERVICE_LITERAL.ALTER)
    );
  },
});

export {PARTITION_SERVICE_REMOTE_QUERY_METHODS};
