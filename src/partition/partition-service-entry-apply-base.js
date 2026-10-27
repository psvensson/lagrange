import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {assertReplicaHandlerServing} from '../node/replica-transport-handler-identity.js';
import {HLCTimestamp} from '../hlc/hlc-timestamp.js';
import {PartitionServiceSchemaMigrationBase} from './partition-service-schema-migration-base.js';
import {
  PARTITION_COMMITTED_COMMAND_ERROR_CODE,
  PARTITION_COMMITTED_COMMAND_HOST_FAILURE_REASON,
  PARTITION_COMMITTED_COMMAND_OUTCOME,
} from './partition-service-constants.js';
import {
  REPLICA_OPERATION_MESSAGE_GROUP_MEMBERSHIP_COLUMNS,
} from '../bootstrap/replica-operation-message-group-membership-schema-constants.js';
import {
  isCommittedCommandType,
  isCommittedSqlCommandType,
} from './partition-committed-command-admission.js';
import {PARTITION_COMMITTED_STATEMENT_RECORD_STATE} from
  './partition-committed-statement-outcome-constants.js';
import {
  isCommittedStatementKeyed,
  readCommittedStatementOutcome,
  recordCommittedStatementOutcome,
  settleFailedCommittedStatement,
  settleRecordedCommittedStatement,
} from './partition-committed-statement-outcome.js';
import {runCommittedPartitionStatement} from './partition-statement-admission.js';
import {advancePartitionWriteGeneration, isPartitionReserved, readPartitionWriteOrigin} from
  './partition-participant-transaction-store.js';
import {assertTransactionSchemaWriteEnforced} from
  '../query/distributed/distributed-transaction-schema-enforcement.js';
import {applyCommittedTransactionCommand, settleReservedCommittedStatement} from
  './partition-participant-transaction-apply.js';
import {requestCoordinatorSettlement, applyCoordinatorSettlement} from
  './partition-coordinator-settlement.js';
import {COORDINATOR_SETTLEMENT_TYPE} from './partition-coordinator-settlement-constants.js';
import {ensureSqlTransactionsDecisionColumns} from
  './partition-coordinator-table-columns.js';
import {admitsParticipantSessionQueryDuringRemoval,
  routeParticipantTransactionRequest} from
  './partition-participant-transaction-request.js';
import {
  applyCdcAcknowledgementCommand,
  isCdcCommandType,
  recordCommittedStatementCdc,
} from './partition-cdc-obligation.js';
import {PARTITION_CDC_ADMISSION_STATE, admitCdcOwedWork, settleCdcOwedRefusal} from
  './partition-cdc-owed-admission.js';
import {recordCommittedWriteTraffic} from './partition-write-traffic.js';
const COMMIT_APPLY_EFFECT_PHASE = Object.freeze({
  COMMIT: 'afterCommit',
  ROLLBACK: 'afterRollback',
});

const {
  PARTITION_SERVICE_COLUMN,
  PARTITION_SERVICE_COLUMN_SQL,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SERVICE_OPERATION,
  buildDurableCommitWitness,
  SYSTEM_TABLE_NAME,
  isRaftRsTransportEnvelope,
} = PARTITION_SERVICE_SHARED;

// A refusal of the committed-command gate: the application fails closed,
// typed. The group's host failure names the reason, the index and the type;
// the applied index does not advance and the restart is refused with it.
function committedCommandRefusal(service, {command, index, rollback}, refusal) {
  const commandType = command?.type;
  const error = new Error(`${refusal.message}: ` +
    `${JSON.stringify(commandType)} at index ${index}`);
  error.code = refusal.code;
  error.outcome = refusal.outcome;
  error.reason = refusal.reason;
  error.detail = Object.freeze({index, commandType: commandType ?? null,
    code: refusal.code});
  rollback(() => service.rejectCommittedWrite(command?.entryId, error));
  return error;
}

// What the application refuses of a committed command before anything of it
// runs, decided from the command alone. Only a bug or version skew commits
// one (the admission owner never proposes it; every proposer builds its
// entry with an entryId); consuming it would drop a committed command, so
// both refusals fail the application closed with one disposition:
// - an unrecognised type;
// - an SQL command without an entryId: it has no outcome-row key and no
//   CDC-obligation key, so its statement never runs.
function committedCommandGate(service, committed) {
  const commandType = committed.command?.type;
  if (!isCommittedCommandType(commandType)) {
    throw committedCommandRefusal(service, committed, {
      message: PARTITION_SERVICE_ERROR_MSG.COMMITTED_COMMAND_UNRECOGNISED,
      code: PARTITION_COMMITTED_COMMAND_ERROR_CODE.UNRECOGNISED,
      outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.UNRECOGNISED,
      reason: PARTITION_COMMITTED_COMMAND_HOST_FAILURE_REASON.COMMAND_UNKNOWN});
  }
  if (isCommittedSqlCommandType(commandType) &&
      !isCommittedStatementKeyed(committed.command)) {
    throw committedCommandRefusal(service, committed, {
      message: PARTITION_SERVICE_ERROR_MSG.COMMITTED_STATEMENT_ENTRY_ID_MISSING,
      code: PARTITION_COMMITTED_COMMAND_ERROR_CODE.ENTRY_ID_MISSING,
      outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.ENTRY_ID_MISSING_REFUSED,
      reason: PARTITION_COMMITTED_COMMAND_HOST_FAILURE_REASON.ENTRY_ID_MISSING});
  }
}

class PartitionServiceEntryApplyBase extends PartitionServiceSchemaMigrationBase {
  ensureReplicaOperationsTableColumns() {
    if (this.tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
      return;
    }
    const columns = this.db
      .prepare(`PRAGMA table_info(${this.tableName})`)
      .all();
    const hasTargetClaimKey = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.TARGET_CLAIM_KEY,
    );
    const hasMembershipPublicationEpoch = columns.some(
      (col) => col.name ===
        PARTITION_SERVICE_COLUMN.MEMBERSHIP_PUBLICATION_EPOCH,
    );
    const admissionColumns = [
      [PARTITION_SERVICE_COLUMN.CREATE_ADMISSION_STATE,
        PARTITION_SERVICE_COLUMN_SQL.ADD_CREATE_ADMISSION_STATE],
      [PARTITION_SERVICE_COLUMN.CREATE_ADMISSION_TOKEN,
        PARTITION_SERVICE_COLUMN_SQL.ADD_CREATE_ADMISSION_TOKEN],
      [PARTITION_SERVICE_COLUMN.CREATE_ADMISSION_REPLICA_CREATED_AT,
        PARTITION_SERVICE_COLUMN_SQL.ADD_CREATE_ADMISSION_REPLICA_CREATED_AT],
      [PARTITION_SERVICE_COLUMN.CREATE_ADMISSION_ATTEMPT_TOKEN,
        PARTITION_SERVICE_COLUMN_SQL.ADD_CREATE_ADMISSION_ATTEMPT_TOKEN],
      [PARTITION_SERVICE_COLUMN.CREATE_ADMISSION_PREVIOUS_ATTEMPT_TOKEN,
        PARTITION_SERVICE_COLUMN_SQL
          .ADD_CREATE_ADMISSION_PREVIOUS_ATTEMPT_TOKEN],
      [PARTITION_SERVICE_COLUMN.CREATE_ADMISSION_ATTEMPT_SEQ,
        PARTITION_SERVICE_COLUMN_SQL.ADD_CREATE_ADMISSION_ATTEMPT_SEQ],
      [PARTITION_SERVICE_COLUMN.CREATE_ADMISSION_WORKFLOW_UPDATED_AT,
        PARTITION_SERVICE_COLUMN_SQL
          .ADD_CREATE_ADMISSION_WORKFLOW_UPDATED_AT],
      [PARTITION_SERVICE_COLUMN.CREATE_ADMISSION_OWNER_INCARNATION,
        PARTITION_SERVICE_COLUMN_SQL
          .ADD_CREATE_ADMISSION_OWNER_INCARNATION],
    ];
    const membershipColumns =
      REPLICA_OPERATION_MESSAGE_GROUP_MEMBERSHIP_COLUMNS.map((column) => [
        column.name,
        `ADD COLUMN ${column.name} ${column.type}`,
      ]);
    if (!hasTargetClaimKey) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_TARGET_CLAIM_KEY,
      );
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG
          .ADDED_REPLICA_OPERATIONS_TARGET_CLAIM_KEY,
        {tableName: this.tableName, partitionId: this.partitionId},
      );
    }
    if (!hasMembershipPublicationEpoch) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_MEMBERSHIP_PUBLICATION_EPOCH,
      );
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG
          .ADDED_REPLICA_OPERATIONS_MEMBERSHIP_PUBLICATION_EPOCH,
        {tableName: this.tableName, partitionId: this.partitionId},
      );
    }
    for (const [columnName, addColumnSql] of admissionColumns) {
      if (columns.some((column) => column.name === columnName)) continue;
      this.db.exec(`ALTER TABLE ${this.tableName} ${addColumnSql}`);
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG
          .ADDED_REPLICA_OPERATIONS_CREATE_ADMISSION_COLUMN,
        {tableName: this.tableName, partitionId: this.partitionId, columnName},
      );
    }
    for (const [columnName, addColumnSql] of membershipColumns) {
      if (columns.some((column) => column.name === columnName)) continue;
      this.db.exec(`ALTER TABLE ${this.tableName} ${addColumnSql}`);
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG
          .ADDED_REPLICA_OPERATIONS_MESSAGE_GROUP_MEMBERSHIP_COLUMN,
        {tableName: this.tableName, partitionId: this.partitionId, columnName},
      );
    }
  }

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
    const hasTransactionMode = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.TRANSACTION_MODE,
    );
    const hasParticipantSetState = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.PARTICIPANT_SET_STATE,
    );
    const hasCommitMode = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.COMMIT_MODE,
    );
    const hasFrozenParticipantCount = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.FROZEN_PARTICIPANT_COUNT,
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
    if (!hasTransactionMode) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_TRANSACTION_MODE,
      );
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG.ADDED_SQL_TRANSACTIONS_TRANSACTION_MODE,
        {tableName: this.tableName, partitionId: this.partitionId},
      );
    }
    if (!hasParticipantSetState) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_PARTICIPANT_SET_STATE,
      );
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG
          .ADDED_SQL_TRANSACTIONS_PARTICIPANT_SET_STATE,
        {tableName: this.tableName, partitionId: this.partitionId},
      );
    }
    if (!hasCommitMode) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_COMMIT_MODE,
      );
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG.ADDED_SQL_TRANSACTIONS_COMMIT_MODE,
        {tableName: this.tableName, partitionId: this.partitionId},
      );
    }
    if (!hasFrozenParticipantCount) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_FROZEN_PARTICIPANT_COUNT,
      );
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG
          .ADDED_SQL_TRANSACTIONS_FROZEN_PARTICIPANT_COUNT,
        {tableName: this.tableName, partitionId: this.partitionId},
      );
    }
    // The coordinator's insert-once decision record (TX1 seam C): the
    // participant vocabulary names the columns and their DDL.
    ensureSqlTransactionsDecisionColumns(this);
  }
  /**
   * Handle incoming transport message.
   * A raft-rs semantic envelope is stepped into the replica's operation
   * port; anything else is an application message.
   * Requirements: 8.3, 8.4, 13.1, 13.2, 13.3, 13.4
   * @param {Object} envelope - Message envelope.
   * @return {Promise<Object>} Response.
   * @private
   */
  async handleTransportMessage(envelope) {
    const payload = this.extractApplicationPayload(envelope);
    if (payload === null) {
      return {
        success: false,
        error: PARTITION_SERVICE_ERROR_MSG.INVALID_MESSAGE,
      };
    }
    if (isRaftRsTransportEnvelope(payload)) {
      // A shut-down or no-longer-registered incarnation refuses the envelope
      // it would drop, so the sender never records it as taken (F1).
      assertReplicaHandlerServing(this);
      if (this.raft) {
        await Promise.resolve(this.raft.step(payload));
      }
      return null;
    }
    return this.handleCanonicalApplicationPayload(payload);
  }
  /**
   * Handle application messages (non-Raft messages).
   * Consensus envelopes are handled by handleTransportMessage().
   * This method only handles application-level messages like FORWARD_WRITE.
   * Requirements: 13.3, 13.4
   * @param {Object} message - Application message
   * @return {Promise<Object>} Processing result
   */
  async handleApplicationMessage(message) {
    const payload = this.extractApplicationPayload(message);
    return this.handleCanonicalApplicationPayload(payload);
  }
  /**
   * Dispatch one strict own-data application payload.
   * @param {Object|null} payload - Canonical application payload.
   * @return {Promise<Object>} Processing result.
   * @private
   */
  async handleCanonicalApplicationPayload(payload) {
    if (!payload || !payload.type) {
      return {
        success: false,
        error: PARTITION_SERVICE_ERROR_MSG.INVALID_MESSAGE,
      };
    }
    const admission = this.resolveRemovalServingAdmission(payload);
    if (admission.allowed !== true) {
      return {

        success: false,
        error: PARTITION_SERVICE_ERROR_MSG.SERVING_ADMISSION_FENCED_FOR_REMOVAL,
        deferRetry: true,
        partitionId: this.partitionId,
      };
    }
    if (admission.servingRequest) {
      this.activeServingRequestCount += 1;
    }
    try {
      return await this.handleAdmittedApplicationMessage(payload);
    } finally {
      if (admission.servingRequest) {
        this.activeServingRequestCount -= 1;
      }
    }
  }

  /**
   * Classify the complete serving ingress set in one place. Transaction
   * controls remain admitted so an existing owner can finish; BEGIN is then
   * rejected by the transaction owner when no session already exists.
   * @param {Object} payload
   * @return {{allowed: boolean, servingRequest: boolean}}
   * @private
   */
  resolveRemovalServingAdmission(payload) {
    const servingRequest = this.isRemovalServingRequestType(payload.type);
    if (!servingRequest || this.removalServingAdmissionFenced !== true) {
      return {allowed: true, servingRequest};
    }
    if (payload.type === PARTITION_SERVICE_MESSAGE_TYPE.TRANSACTION ||
        payload.type === COORDINATOR_SETTLEMENT_TYPE) {
      return {allowed: true, servingRequest};
    }
    return {allowed: payload.type === PARTITION_SERVICE_MESSAGE_TYPE.QUERY &&
      admitsParticipantSessionQueryDuringRemoval(this, payload), servingRequest};
  }

  /**
   * @param {string} type
   * @return {boolean}
   * @private
   */
  isRemovalServingRequestType(type) {
    switch (type) {
    case PARTITION_SERVICE_MESSAGE_TYPE.FORWARD_WRITE:
    case PARTITION_SERVICE_MESSAGE_TYPE.SYSTEM_TABLE_WRITE:
    case PARTITION_SERVICE_MESSAGE_TYPE.QUERY:
    case PARTITION_SERVICE_MESSAGE_TYPE.TRANSACTION:
    case COORDINATOR_SETTLEMENT_TYPE:
      return true;
    default:
      return false;
    }
  }

  /**
   * Dispatch one application message after the removal-serving owner admits
   * it. Keeping the switch behind that single gate prevents new ingress paths
   * from accidentally bypassing removal drain accounting.
   * @param {Object} payload
   * @return {Promise<Object>}
   * @private
   */
  async handleAdmittedApplicationMessage(payload) {
    switch (payload.type) {
    case PARTITION_SERVICE_MESSAGE_TYPE.FORWARD_WRITE:
      if (payload.operation) {
        return this.applyWrite(payload.operation);
      }
      return {
        success: false,
        error: PARTITION_SERVICE_ERROR_MSG.INVALID_FORWARD_WRITE,
      };
    case PARTITION_SERVICE_MESSAGE_TYPE.SYSTEM_TABLE_WRITE:
      return this.handleSystemTableWrite(payload);
    case PARTITION_SERVICE_MESSAGE_TYPE.QUERY:
      return this.handleRemoteQuery(payload);
    case PARTITION_SERVICE_MESSAGE_TYPE.TRANSACTION:
      return this.handleTransactionMessage(payload);
    case COORDINATOR_SETTLEMENT_TYPE:
      return requestCoordinatorSettlement(this, payload);
    case PARTITION_SERVICE_MESSAGE_TYPE.START_SPLIT_REPLICATION:
      return this.handleStartSplitReplication(payload);
    case PARTITION_SERVICE_MESSAGE_TYPE.START_MERGE_REPLICATION:
      return this.handleStartMergeReplication(payload);
    case PARTITION_SERVICE_MESSAGE_TYPE.LEARNER_PROMOTION_PROOF:
      return this.handleLearnerPromotionProofRequest(payload);
    default:
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.UNKNOWN_MESSAGE_TYPE, {
        type: payload.type,
        partitionId: this.partitionId,
      });
      return {
        success: false,
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
    try {
      const result = await routeParticipantTransactionRequest(this, payload);
      if (!result) {
        return {
          success: false,
          error: PARTITION_SERVICE_ERROR_MSG.unknownOperation(operation),
        };
      }
      return {

        success: result?.success === true,
        ...result,
      };
    } catch (error) {
      return {

        success: false,
        error: error.message,
        deferRetry: error?.deferRetry === true,
      };
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
    const outer = copyStrictOwnDataRecord(message);
    if (outer === null) return null;
    const directPayload = outer.payload === undefined ? outer :
      copyStrictOwnDataRecord(outer.payload);
    if (
      directPayload &&
      typeof directPayload === PARTITION_SERVICE_LITERAL.OBJECT &&
      !directPayload.type &&
      directPayload.payload &&
      typeof directPayload.payload === PARTITION_SERVICE_LITERAL.OBJECT
    ) {
      return copyStrictOwnDataRecord(directPayload.payload);
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
          success: false,
          error: PARTITION_SERVICE_ERROR_MSG.unknownOperation(operation),
        };
      }
      return {

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
   * The proposer's commit identity for one committed write: its position in
   * the log and, on the replica that proposed it (the only one holding the
   * pending write), the durable commit witness built from the committed
   * entry itself.
   * @param {Object} command - The committed command.
   * @param {number} index - The committed entry's index.
   * @param {number} term - The committed entry's term.
   * @return {Object} Fields merged into the resolved write result.
   * @private
   */
  buildCommittedWriteIdentity(command, index, term) {
    const originHlc =
      typeof command?.timestamp === 'string' && command.timestamp.length > 0 ?
        command.timestamp : null;
    if (command.proposedBy !== this.replicaId) {
      return {
        partitionId: this.partitionId,
        logIndex: index,
        ...(originHlc ? {originHlc} : {}),
      };
    }
    return {
      partitionId: this.partitionId,
      logIndex: index,
      ...(originHlc ? {originHlc} : {}),
      durableCommitWitness: buildDurableCommitWitness({
        partitionId: this.partitionId,
        leaderNodeId: this.nodeId,
        leaderReplicaId: command.proposedBy,
        logEntry: {term, index, data: command},
      }),
    };
  }

  /**
   * Apply one committed entry to the state machine. The consensus port calls
   * this inside the SQLite transaction that also advances its applied state;
   * every observable effect is deferred to `effects.afterCommit` (or
   * `effects.afterRollback`) so nothing escapes a rolled-back apply.
   * @param {Object} committed - The frozen committed record.
   * @param {Object} committed.command - The decoded committed command.
   * @param {number} committed.index - The entry's log index.
   * @param {number} committed.term - The entry's term.
   * @param {{afterCommit: Array, afterRollback: Array}} committed.effects
   * @return {string} A PARTITION_COMMITTED_COMMAND_OUTCOME.
   */
  applyCommittedEntry({command, index, term, effects}) {
    const scheduleEffect = (phase, effect) => {
      effects[phase].push(() => {
        try {
          effect();
        } catch (error) {
          this.logger.error(
            PARTITION_SERVICE_ERROR_MSG.COMMITTED_ENTRY_EFFECT_FAILED,
            {partitionId: this.partitionId, logIndex: index, phase,
              error: error.message},
          );
        }
      });
    };
    committedCommandGate(this, {command, index,
      rollback: (effect) => scheduleEffect(COMMIT_APPLY_EFFECT_PHASE.ROLLBACK,
        effect)});
    const commandType = command.type;
    // Witness the committed entry's HLC on EVERY replica (leader and follower),
    // before any branch/early-return, so this clock advances past every entry it
    // applies. Without this, a new leader whose wall clock lags the old leader
    // could stamp a later write (e.g. a DELETE) with a LOWER HLC than an earlier
    // committed write, breaking cross-leader monotonicity used as an LWW fence.
    scheduleEffect(COMMIT_APPLY_EFFECT_PHASE.COMMIT, () =>
      this.witnessCommandHlc(command),
    );
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.APPLYING_COMMITTED_ENTRY, {
      partitionId: this.partitionId,
      commandType,
    });
    if (commandType === COORDINATOR_SETTLEMENT_TYPE) {
      return applyCoordinatorSettlement(this, {command, index, term,
        afterCommit: (effect) => scheduleEffect(COMMIT_APPLY_EFFECT_PHASE.COMMIT, effect),
        afterRollback: (effect) => scheduleEffect(COMMIT_APPLY_EFFECT_PHASE.ROLLBACK, effect)});
    }
    if (isCdcCommandType(commandType)) {
      // The CDC delivery owner's committed acknowledgement: its owner.
      return applyCdcAcknowledgementCommand(this, {command, index, term,
        afterCommit: (effect) => scheduleEffect(COMMIT_APPLY_EFFECT_PHASE.COMMIT, effect),
        afterRollback: (effect) => scheduleEffect(COMMIT_APPLY_EFFECT_PHASE.ROLLBACK, effect)});
    }
    if (!isCommittedSqlCommandType(commandType)) {
      // The gate has admitted a participant transaction command: its owner.
      return applyCommittedTransactionCommand(this, {command, index, term,
        afterCommit: (effect) => scheduleEffect(COMMIT_APPLY_EFFECT_PHASE.COMMIT, effect),
        afterRollback: (effect) => scheduleEffect(COMMIT_APPLY_EFFECT_PHASE.ROLLBACK, effect)});
    }
    if (command.sql) {
      assertTransactionSchemaWriteEnforced(this.db, this.tableName,
        readPartitionWriteOrigin(this.db) !== null);
      const entryKey = this.getCommittedEntryKey(command);
      const identity = this.buildCommittedWriteIdentity(command, index, term);
      const afterCommit = (effect) =>
        scheduleEffect(COMMIT_APPLY_EFFECT_PHASE.COMMIT, effect);
      // The recorded outcome of this entry key decides whether the
      // statement runs: a settled key is never executed again, on any
      // replica, before or after a restart.
      const recorded = readCommittedStatementOutcome(this, entryKey);
      if (recorded.state ===
          PARTITION_COMMITTED_STATEMENT_RECORD_STATE.SETTLED) {
        return settleRecordedCommittedStatement(this, {
          recorded, command, afterCommit});
      }
      // A PREPARED participant transaction holds every other statement.
      if (isPartitionReserved(this.db)) {
        return settleReservedCommittedStatement(this, {command, afterCommit});
      }
      const cdcAdmission = admitCdcOwedWork(this, command);
      if (cdcAdmission.state === PARTITION_CDC_ADMISSION_STATE.REFUSED) {
        return settleCdcOwedRefusal(this, {command, afterCommit}, cdcAdmission.answer);
      }
      let info;
      try {
        info = runCommittedPartitionStatement(this, command);
      } catch (error) {
        return settleFailedCommittedStatement(this, {
          error, command, entryKey, index, term, identity, afterCommit,
          afterRollback: (effect) =>
            scheduleEffect(COMMIT_APPLY_EFFECT_PHASE.ROLLBACK, effect),
        });
      }
      recordCommittedStatementOutcome(this, {
        entryKey,
        outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED,
        index,
        term,
        result: info,
      });
      recordCommittedStatementCdc(this, {command, index, term, afterCommit},
        {entryKey, result: info});
      advancePartitionWriteGeneration(this.db);
      recordCommittedWriteTraffic(this, afterCommit, 1);
      if (command.type === PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE) {
        afterCommit(() => this.registerMigrationDefaultFromAlterSql(command.sql));
      }
      afterCommit(() => {
        this.resolveCommittedWrite(command.entryId, {
          success: true,
          changes: info.changes,
          lastInsertRowid: info.lastInsertRowid,
          ...identity,
        });
      });
    }
    scheduleEffect(COMMIT_APPLY_EFFECT_PHASE.COMMIT, () =>
      this.emit(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, {
        partitionId: this.partitionId,
        command,
      }),
    );
    // A statement was applied; a write type without a statement is recorded
    // in the log only.
    return command.sql ? PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED :
      PARTITION_COMMITTED_COMMAND_OUTCOME.RECORDED_ONLY;
  }
}
export {PartitionServiceEntryApplyBase};
