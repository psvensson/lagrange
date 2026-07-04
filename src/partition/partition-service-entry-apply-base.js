import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {HLCTimestamp} from '../hlc/hlc-timestamp.js';
import {PartitionServiceSchemaMigrationBase} from './partition-service-schema-migration-base.js';
import {
  createPartitionServiceTransactionSessionMethods,
} from './partition-service-transaction-session-methods.js';

const {
  ERRORS,
  PARTITION_SERVICE_COLUMN,
  PARTITION_SERVICE_COLUMN_SQL,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SERVICE_MIGRATION_OPERATION,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_RESPONSE,
  PARTITION_SERVICE_VALUE,
  PARTITION_TRANSITION_STATE,
  QUERY_PAYLOAD_FIELD_MIGRATION_ID,
  QUERY_PAYLOAD_FIELD_MIGRATION_OPERATION,
  RaftRole,
  SYSTEM_TABLE_NAME,
  isRaftPacket,
  resolveRaftTransportDeliveryOptions,
} = PARTITION_SERVICE_SHARED;

class PartitionServiceEntryApplyBase extends PartitionServiceSchemaMigrationBase {
  ensureSqlTransactionsTableColumns() {
    if (this.tableName !== SYSTEM_TABLE_NAME.SQL_TRANSACTIONS) {
      return;
    }
    const columns = this.db
      .prepare(`PRAGMA table_info(${this.tableName})`)
      .all();
    const hasTransactionEpoch = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.TRANSACTION_EPOCH,
    );
    const hasTimeoutDeadline = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.TIMEOUT_DEADLINE,
    );
    if (!hasTransactionEpoch) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_TRANSACTION_EPOCH,
      );
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG.ADDED_SQL_TRANSACTIONS_TRANSACTION_EPOCH,
        {tableName: this.tableName, partitionId: this.partitionId},
      );
    }
    if (!hasTimeoutDeadline) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_TIMEOUT_DEADLINE,
      );
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG.ADDED_SQL_TRANSACTIONS_TIMEOUT_DEADLINE,
        {tableName: this.tableName, partitionId: this.partitionId},
      );
    }
  }
  /**
   * Handle incoming transport message.
   * Detects Raft packets using isRaftPacket() and routes them directly to liferaft.
   * Handles non-Raft messages as application messages.
   * Requirements: 8.3, 8.4, 13.1, 13.2, 13.3, 13.4
   * @param {Object} envelope - Message envelope.
   * @return {Promise<Object>} Response.
   * @private
   */
  async handleTransportMessage(envelope) {
    const payload = envelope.payload || envelope;
    if (isRaftPacket(payload)) {
      if (this.raft) {
        this.logger.trace(PARTITION_SERVICE_LOG_MSG.RECEIVED_RAFT_PACKET, {
          type: payload.type,
          term: payload.term,
          address: payload.address,
          replicaId: this.replicaId,
          partitionId: this.partitionId,
        });
        const senderAddress = payload.address;
        const write = (responsePacket) => {
          if (responsePacket) {
            this.logger.trace(PARTITION_SERVICE_LOG_MSG.SENDING_RAFT_RESPONSE, {
              type: responsePacket.type,
              destination: senderAddress,
              term: responsePacket.term,
            });
            this.transport
              .deliver(
                senderAddress,
                responsePacket,
                resolveRaftTransportDeliveryOptions({
                  ...responsePacket,
                  targetAddress: senderAddress,
                }),
              )
              .catch((err) => {
                this.logger.error(
                  PARTITION_SERVICE_LOG_MSG.FAILED_RAFT_RESPONSE,
                  {error: err.message, destination: senderAddress},
                );
              });
          }
        };
        this.raft.emit(PARTITION_SERVICE_EVENT.DATA, payload, write);
      }
      return {acknowledged: true};
    }
    return this.handleApplicationMessage(envelope);
  }
  /**
   * Handle application messages (non-Raft messages).
   * Raft packets are handled by handleTransportMessage() using isRaftPacket().
   * This method only handles application-level messages like FORWARD_WRITE.
   * Requirements: 13.3, 13.4
   * @param {Object} message - Application message
   * @return {Promise<Object>} Processing result
   */
  async handleApplicationMessage(message) {
    const payload = this.extractApplicationPayload(message);
    if (!payload || !payload.type) {
      return {
        acknowledged: false,
        error: PARTITION_SERVICE_ERROR_MSG.INVALID_MESSAGE,
      };
    }
    switch (payload.type) {
    case PARTITION_SERVICE_MESSAGE_TYPE.FORWARD_WRITE:
      if (payload.operation) {
        return this.applyWrite(payload.operation);
      }
      return {
        acknowledged: false,
        error: PARTITION_SERVICE_ERROR_MSG.INVALID_FORWARD_WRITE,
      };
    case PARTITION_SERVICE_MESSAGE_TYPE.SYSTEM_TABLE_WRITE:
      return this.handleSystemTableWrite(payload);
    case PARTITION_SERVICE_MESSAGE_TYPE.QUERY:
      return this.handleRemoteQuery(payload);
    case PARTITION_SERVICE_MESSAGE_TYPE.TRANSACTION:
      return this.handleTransactionMessage(payload);
    case PARTITION_SERVICE_MESSAGE_TYPE.START_SPLIT_REPLICATION:
      return this.handleStartSplitReplication(payload);
    default:
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.UNKNOWN_MESSAGE_TYPE, {
        type: payload.type,
        partitionId: this.partitionId,
      });
      return {
        acknowledged: false,
        error: PARTITION_SERVICE_ERROR_MSG.unknownMessage(payload.type),
      };
    }
  }
  /**
   * Handle remote transaction control operations.
   * @param {Object} payload - Transaction message payload.
   * @return {Promise<Object>} Transaction operation response.
   * @private
   */
  async handleTransactionMessage(payload) {
    const operation = payload?.operation;
    const sessionId = payload?.sessionId || null;
    const transactionEpoch = Number.isFinite(payload?.transactionEpoch) ?
      Math.floor(payload.transactionEpoch) :
      null;
    try {
      let result;
      switch (operation) {
      case PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION:
      case PARTITION_SERVICE_LITERAL.BEGIN:
        result = await this.beginTransaction(sessionId, transactionEpoch);
        break;
      case PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION:
      case PARTITION_SERVICE_LITERAL.PREPARE:
        result = await this.prepareTransaction(sessionId);
        break;
      case PARTITION_SERVICE_OPERATION.COMMIT:
        result = await this.commitTransaction(sessionId);
        break;
      case PARTITION_SERVICE_OPERATION.ROLLBACK:
        result = await this.rollbackTransaction(sessionId);
        break;
      default:
        return {
          acknowledged: false,
          success: false,
          error: PARTITION_SERVICE_ERROR_MSG.unknownOperation(operation),
        };
      }
      return {
        acknowledged: true,
        success: result?.success === true,
        ...result,
      };
    } catch (error) {
      return {acknowledged: true, success: false, error: error.message};
    }
  }
  /**
   * Extract canonical application payload from transport envelopes.
   * Message-group direct deliveries wrap payloads as:
   * {messageId, payload, sourceGroup, sourceReplica}.
   * @param {Object} message - Incoming transport message/envelope.
   * @return {Object|null} Canonical payload.
   * @private
   */
  extractApplicationPayload(message) {
    const directPayload = message?.payload || message;
    if (
      directPayload &&
      typeof directPayload === PARTITION_SERVICE_LITERAL.OBJECT &&
      !directPayload.type &&
      directPayload.payload &&
      typeof directPayload.payload === PARTITION_SERVICE_LITERAL.OBJECT
    ) {
      return directPayload.payload;
    }
    return directPayload || null;
  }
  /**
   * Handle system table write operations from remote nodes.
   * This allows joining nodes to update system tables via CDC routing.
   * @param {Object} payload - Write operation payload.
   * @param {string} payload.operation - Operation type (INSERT, UPDATE, DELETE).
   * @param {string} payload.tableName - Target table name.
   * @param {Object} payload.data - Data for INSERT/UPDATE.
   * @param {Object} payload.whereClause - WHERE clause for UPDATE/DELETE.
   * @return {Promise<Object>} Operation result.
   * @private
   */
  async handleSystemTableWrite(payload) {
    const {operation, tableName, data, whereClause} = payload;
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.HANDLING_SYSTEM_TABLE_WRITE, {
      operation,
      tableName,
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });
    try {
      let result;
      switch (operation) {
      case PARTITION_SERVICE_OPERATION.INSERT:
        result = await this.insertData(tableName, data);
        break;
      case PARTITION_SERVICE_OPERATION.UPDATE:
        result = await this.updateData(tableName, whereClause, data);
        break;
      case PARTITION_SERVICE_OPERATION.DELETE:
        result = await this.deleteData(tableName, whereClause);
        break;
      case PARTITION_SERVICE_OPERATION.UPSERT:
        result = await this.upsertData(tableName, data);
        break;
      default:
        return {
          acknowledged: false,
          error: PARTITION_SERVICE_ERROR_MSG.unknownOperation(operation),
        };
      }
      return {
        acknowledged: true,
        success: result.success,
        changes: result.changes || 0,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.SYSTEM_TABLE_WRITE_FAILED, {
        operation,
        tableName,
        error: error.message,
        partitionId: this.partitionId,
      });
      throw error;
    }
  }
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
  async handleRemoteQuery(payload) {
    const {
      sql,
      params,
      splitMirrorOrigin,
      sessionId,
      [QUERY_PAYLOAD_FIELD_MIGRATION_OPERATION]: migrationOperation,
      [QUERY_PAYLOAD_FIELD_MIGRATION_ID]: migrationId,
    } = payload;
    if (!sql) {
      return {
        acknowledged: false,
        error: PARTITION_SERVICE_ERROR_MSG.MISSING_SQL_QUERY,
      };
    }
    const isWriteOperation = this.isWriteQuery(sql);
    if (isWriteOperation && this.role !== RaftRole.LEADER) {
      const leaderAddress = this.resolveLeaderAddress();
      if (leaderAddress) {
        this.logger.debug(
          PARTITION_SERVICE_LOG_MSG.REDIRECTING_WRITE_TO_LEADER,
          {
            partitionId: this.partitionId,
            replicaId: this.replicaId,
            leaderAddress,
          },
        );
        return {
          acknowledged: true,
          success: false,
          redirect: PARTITION_SERVICE_RESPONSE.LEADER_REDIRECT,
          leaderAddress,
          partitionId: this.partitionId,
        };
      }
      return {
        acknowledged: true,
        success: false,
        error: ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
        partitionId: this.partitionId,
      };
    }
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.HANDLING_REMOTE_QUERY, {
      sql: sql.substring(
        0,
        PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS,
      ),
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });
    try {
      let result = null;
      if (
        migrationOperation === PARTITION_SERVICE_MIGRATION_OPERATION.ALTER_TABLE
      ) {
        result = await this.executeMigrationAlterQuery(sql, params || [], {
          migrationId: migrationId || null,
          sessionId: sessionId || null,
        });
      } else {
        result = await this.executeQuery(sql, params || [], {
          splitMirrorOrigin: splitMirrorOrigin || null,
          sessionId: sessionId || null,
        });
      }
      // A routed write can come back rejected without throwing (for example
      // NO_LEADER when a stale-topology commit guard refuses a unilateral
      // apply). The envelope must carry that outcome — collapsing it to
      // success acks a write that never landed and the coordinator stops
      // re-routing to the true leader.
      const resultSuccess = result?.success !== false;
      return {
        acknowledged: true,
        success: resultSuccess,
        ...(resultSuccess || !result?.error ? {} : {error: result.error}),
        rows: result.rows,
        changes: result.changes,
        count: result.count,
        partitionId: this.partitionId,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.REMOTE_QUERY_FAILED, {
        sql: sql.substring(
          0,
          PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS,
        ),
        error: error.message,
        partitionId: this.partitionId,
      });
      throw error;
    }
  }
  /**
   * Validate and start one source-partition split replication workflow.
   * The request is acknowledged once accepted; backfill/cutover continues
   * asynchronously on the source leader.
   * @param {Object} payload - Split replication request.
   * @return {Promise<Object>} ACK response.
   * @private
   */
  async handleStartSplitReplication(payload) {
    const transitionMetadata = payload?.transitionMetadata;
    const metadata = this.normalizeSplitTransitionMetadata(transitionMetadata);
    if (!metadata) {
      return {
        acknowledged: false,
        error: PARTITION_SERVICE_ERROR_MSG.INVALID_SPLIT_REPLICATION,
      };
    }
    this.logger.info(
      PARTITION_SERVICE_LOG_MSG.START_SPLIT_REPLICATION_REQUEST,
      {
        partitionId: this.partitionId,
        tableId: payload?.tableId || this.tableId,
        tableName: payload?.tableName || this.tableName,
        targetPartitionIds: metadata.targetPartitionIds,
        targetPartitionVersion: metadata.targetPartitionVersion,
      },
    );
    if (this.role !== RaftRole.LEADER) {
      const leaderAddress = this.resolveLeaderAddress();
      if (leaderAddress && this.transport) {
        return this.transport.deliver(leaderAddress, {
          type: PARTITION_SERVICE_MESSAGE_TYPE.START_SPLIT_REPLICATION,
          partitionId: payload?.partitionId || this.partitionId,
          tableId: payload?.tableId || this.tableId,
          tableName: payload?.tableName || this.tableName,
          transitionMetadata,
        });
      }
      return {
        acknowledged: false,
        error: ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
      };
    }
    if (
      this.splitReplication &&
      this.isSameSplitReplication(this.splitReplication.metadata, metadata)
    ) {
      return {acknowledged: true, success: true};
    }
    if (this.splitReplication) {
      return {
        acknowledged: false,
        error: PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED,
      };
    }
    this.splitReplication = {
      metadata,
      phase: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
      pendingEntries: [],
      flushInFlight: false,
      startedAt: Date.now(),
      lastError: null,
    };
    this.splitReplicationRun = this.runSplitReplicationWorkflow().catch(
      (error) => {
        if (this.splitReplication) {
          this.splitReplication.lastError = error.message;
          this.splitReplication.phase = PARTITION_TRANSITION_STATE.FAILED;
        }
        this.logger.error(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_FAILED, {
          partitionId: this.partitionId,
          error: error.message,
        });
      },
    );
    return {acknowledged: true, success: true};
  }
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
    this.registerMigrationDefaultFromAlterSql(sql);
    return this.proposeWrite({
      type: PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE,
      sql,
      params,
      migrationId: options.migrationId || null,
      sessionId: options.sessionId || null,
    });
  }
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
  }
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
  }
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
  }
  /**
   * Advance the partition HLC to witness a committed entry's timestamp.
   * Idempotent (the clock takes the max), guarded against a missing/unparseable
   * timestamp (some committed command types legitimately carry none), and never
   * allowed to throw out of the apply path.
   * @param {Object} command - The committed command (may carry a `timestamp` HLC).
   */
  witnessCommandHlc(command) {
    try {
      const witnessed = HLCTimestamp.tryFromString(command?.timestamp);
      if (witnessed) {
        this.hlcClock.update(witnessed);
      }
    } catch (_error) {
      // Witnessing the clock must never break entry application.
    }
  }

  /**
   * Apply a committed entry to the state machine.
   * This is called by liferaft when an entry is committed.
   * Requirements: 10.5
   * @param {Object} command - The committed command
   */
  applyCommittedEntry(command) {
    if (!command) {
      return;
    }
    // Witness the committed entry's HLC on EVERY replica (leader and follower),
    // before any branch/early-return, so this clock advances past every entry it
    // applies. Without this, a new leader whose wall clock lags the old leader
    // could stamp a later write (e.g. a DELETE) with a LOWER HLC than an earlier
    // committed write, breaking cross-leader monotonicity used as an LWW fence.
    this.witnessCommandHlc(command);
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.APPLYING_COMMITTED_ENTRY, {
      partitionId: this.partitionId,
      commandType: command.type,
    });
    if (
      command.type === PARTITION_SERVICE_OPERATION.WRITE ||
      command.type === PARTITION_SERVICE_OPERATION.INSERT ||
      command.type === PARTITION_SERVICE_OPERATION.UPDATE ||
      command.type === PARTITION_SERVICE_OPERATION.DELETE ||
      command.type === PARTITION_SERVICE_OPERATION.UPSERT ||
      command.type === PARTITION_SERVICE_OPERATION.QUERY ||
      command.type === PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE
    ) {
      if (command.sql) {
        if (
          command.type === PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE
        ) {
          this.registerMigrationDefaultFromAlterSql(command.sql);
        }
        const entryKey = this.getCommittedEntryKey(command);
        if (entryKey && this.recentlyAppliedEntryKeys.has(entryKey)) {
          this.logger.debug(
            PARTITION_SERVICE_LOG_MSG.APPLYING_COMMITTED_ENTRY,
            {
              partitionId: this.partitionId,
              commandType: command.type,
              skippedReplay: true,
            },
          );
          this.resolveCommittedWrite(command.entryId);
          this.emit(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, {
            partitionId: this.partitionId,
            command,
          });
          return;
        }
        try {
          const stmt = this.db.prepare(command.sql);
          const info = stmt.run(...(command.params || []));
          this.trackAppliedEntryKey(entryKey);
          this.resolveCommittedWrite(command.entryId, {
            success: true,
            changes: info.changes,
            lastInsertRowid: info.lastInsertRowid,
            partitionId: this.partitionId,
          });
          if (this.isLeader) {
            this.trackPendingCDCEvent(
              this.generateCDCEvent(command).catch((err) => {
                if (this.isShutdown) {
                  return;
                }
                this.logger.error(
                  PARTITION_SERVICE_ERROR_MSG.CDC_EVENT_FAILED,
                  {partitionId: this.partitionId, error: err.message},
                );
              }),
            );
          }
        } catch (error) {
          if (this.isIdempotentInsertReplayConstraint(error, command)) {
            this.trackAppliedEntryKey(entryKey);
            this.logger.warn(
              PARTITION_SERVICE_LOG_MSG.APPLYING_COMMITTED_ENTRY,
              {
                partitionId: this.partitionId,
                commandType: command.type,
                skippedReplay: true,
                replayConstraintSuppressed: true,
                error: error.message,
              },
            );
            this.resolveCommittedWrite(command.entryId, {
              success: true,
              changes: 0,
              partitionId: this.partitionId,
            });
            this.emit(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, {
              partitionId: this.partitionId,
              command,
            });
            return;
          }
          this.rejectCommittedWrite(command.entryId, error);
          this.logger.error(
            PARTITION_SERVICE_ERROR_MSG.APPLY_COMMITTED_FAILED,
            {
              partitionId: this.partitionId,
              error: error.message,
              sql: command.sql ?
                command.sql.substring(
                  0,
                  PARTITION_SERVICE_VALUE.CDC_REDACTION_LIMIT,
                ) :
                null,
              params: command.params || [],
            },
          );
          throw error;
        }
      }
    } else if (
      command.type === PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT
    ) {
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.TRANSACTION_COMMIT_APPLIED, {
        partitionId: this.partitionId,
        operationCount: command.operations?.length || 0,
      });
      this.resolveCommittedWrite(command.entryId, {
        success: true,
        partitionId: this.partitionId,
      });
    }
    this.emit(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, {
      partitionId: this.partitionId,
      command,
    });
  }
}
Object.assign(
  PartitionServiceEntryApplyBase.prototype,
  createPartitionServiceTransactionSessionMethods(),
);
export {PartitionServiceEntryApplyBase};
