import {applySplitDescriptorStatement} from './partition-split-descriptor-apply.js';
import {decodeSplitDescriptorCommand,
  SPLIT_DESCRIPTOR_ERROR, usesSplitDescriptorIdentity} from './partition-split-descriptor-command.js';
import {requestPlacementRepairPreparation} from './partition-placement-repair-preparation.js';
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {assertReplicaHandlerServing} from '../node/replica-transport-handler-identity.js';
import {HLCTimestamp} from '../hlc/hlc-timestamp.js';
import {PartitionServiceRaftInitBase} from './partition-service-raft-init-base.js';
import {
  PARTITION_COMMITTED_COMMAND_ERROR_CODE, PARTITION_COMMITTED_COMMAND_HOST_FAILURE_REASON,
  PARTITION_COMMITTED_COMMAND_OUTCOME,
  PARTITION_SERVICE_MESSAGE_TYPE as SERVICE_MSG_TYPE,
} from './partition-service-constants.js';
import {isCommittedCommandType, isCommittedSqlCommandType} from
  './partition-committed-command-admission.js';
import {hasObsoleteMirrorCustodyField} from './partition-mirror-custody-codec.js';
import {MIRROR_RETENTION_CUSTODY_COMMAND_ERROR, PARTITION_COMMITTED_STATEMENT_RECORD_STATE} from
  './partition-committed-statement-outcome-constants.js';
import {
  applyMirrorRetentionCustodyCommand,
  isCommittedStatementKeyed, readCommittedStatementOutcome, recordCommittedStatementOutcome,
  registerMirrorRetentionRaftHooks,
  settleFailedCommittedStatement, settleLockingReadRefusedCommittedStatement,
  settleRecordedCommittedStatement,
} from './partition-committed-statement-outcome.js';
import {runCommittedPartitionStatement} from './partition-statement-admission.js';
import {invalidateParticipantDeterminismSelfCheck} from
  './partition-participant-transaction-self-check.js';
import {
  advancePartitionWriteGeneration, isPartitionReserved,
  readPartitionWriteGeneration, readPartitionWriteOrigin,
} from './partition-participant-transaction-store.js';
import {recordCommittedAutocommitRowKeys, resetParticipantRowKeyHistory} from
  './partition-participant-transaction-session.js';
import {assertTransactionSchemaWriteEnforced} from
  '../query/distributed/distributed-transaction-schema-enforcement.js';
import {applyCommittedTransactionCommand, settleReservedCommittedStatement} from
  './partition-participant-transaction-apply.js';
import {requestCoordinatorSettlement, applyCoordinatorSettlement} from
  './partition-coordinator-settlement.js';
import {
  handleRemoteLiveQueryCdcSubscribe,
  handleRemoteLiveQueryCdcUnsubscribe,
} from './partition-live-query-cdc-remote.js';
import {COORDINATOR_SETTLEMENT_TYPE} from './partition-coordinator-settlement-constants.js';
import {requestPlacementRepair, applyPlacementCommand, requestPlacementAdmission} from
  './partition-placement-admission.js';
import {
  PLACEMENT_REPAIR_PREPARE_TYPE, PLACEMENT_REPAIR_TYPE, PLACEMENT_ADMIT_TYPE,
  PLACEMENT_COMMAND_TYPES,
} from './partition-placement-admission-constants.js';
import {FORMATION_TRANSITION_TYPE, requestFormationTransition} from
  '../control-plane/membership-publication-formation-record.js';
import {applyFormationTransitionCommand, registerFormationPartitionApplyHooks} from
  '../control-plane/membership-publication-formation-transition-command.js';
import {admitsParticipantSessionQueryDuringRemoval, routeParticipantTransactionRequest} from
  './partition-participant-transaction-request.js';
import {
  applyCdcAcknowledgementCommand, isCdcCommandType,
  recordCommittedOperationCdc, recordCommittedStatementCdc,
} from './partition-cdc-obligation.js';
import {PARTITION_CDC_ADMISSION_STATE, admitCdcOwedWork, settleCdcOwedRefusal} from
  './partition-cdc-owed-admission.js';
import {partitionWriteLeadershipRefusalOf, startPartitionRaftWriteCommit} from
  './partition-service-raft-write-commit.js';
import {pausedWriteAnswerOf} from './partition-participant-transaction-pause.js';
import {recordCommittedWriteTraffic} from './partition-write-traffic.js';
import {applyLockingReadReservationCommand, requestLockingReadReservation} from
  './partition-locking-read-service.js';
import {checkOperationsLockingReadConflict} from './partition-locking-read-write-check.js';
import {LOCKING_READ_RESERVATION_TYPE} from './partition-locking-read-command-constants.js';
import {
  PARTITION_MEMBERSHIP_RECOVERY_FENCE_NOTICE_TYPE,
  PARTITION_MEMBERSHIP_RECOVERY_TYPE,
} from './partition-membership-recovery-constants.js';
import {
  applyPartitionMembershipRecoveryCommand,
  checkExcludedMemberEnvelopeFence,
  handleMembershipRecoveryFenceNotice,
  stagePartitionMembershipRecoveryIntent,
} from './partition-membership-recovery.js';
registerFormationPartitionApplyHooks({
  partitionWriteLeadershipRefusalOf, pausedWriteAnswerOf, recordCommittedOperationCdc,
  settleReservedCommittedStatement, startPartitionRaftWriteCommit,
});
registerMirrorRetentionRaftHooks({
  partitionWriteLeadershipRefusalOf,
  startPartitionRaftWriteCommit,
});
const COMMIT_APPLY_EFFECT_PHASE = Object.freeze({
  COMMIT: 'afterCommit',
  ROLLBACK: 'afterRollback',
});

const OWNER_COMMITTED_COMMAND_HANDLERS = Object.freeze({
  [COORDINATOR_SETTLEMENT_TYPE]: requestCoordinatorSettlement,
  [PLACEMENT_ADMIT_TYPE]: requestPlacementAdmission,
  [PLACEMENT_REPAIR_TYPE]: requestPlacementRepair,
  [PLACEMENT_REPAIR_PREPARE_TYPE]: requestPlacementRepairPreparation,
  [FORMATION_TRANSITION_TYPE]: requestFormationTransition,
  [PARTITION_MEMBERSHIP_RECOVERY_TYPE]: stagePartitionMembershipRecoveryIntent,
  [PARTITION_MEMBERSHIP_RECOVERY_FENCE_NOTICE_TYPE]:
    handleMembershipRecoveryFenceNotice,
  [SERVICE_MSG_TYPE.LIVE_QUERY_CDC_SUBSCRIBE]: handleRemoteLiveQueryCdcSubscribe,
  [SERVICE_MSG_TYPE.LIVE_QUERY_CDC_UNSUBSCRIBE]: handleRemoteLiveQueryCdcUnsubscribe,
  [LOCKING_READ_RESERVATION_TYPE]: requestLockingReadReservation,
});

const NON_SQL_COMMITTED_APPLIERS = Object.freeze([
  [(type) => type === COORDINATOR_SETTLEMENT_TYPE, applyCoordinatorSettlement],
  [(type) => PLACEMENT_COMMAND_TYPES.includes(type), applyPlacementCommand],
  [(type) => type === FORMATION_TRANSITION_TYPE, applyFormationTransitionCommand],
  [
    (type) => type === PARTITION_MEMBERSHIP_RECOVERY_TYPE,
    applyPartitionMembershipRecoveryCommand,
  ],
  [(type) => type === LOCKING_READ_RESERVATION_TYPE, applyLockingReadReservationCommand],
  [
    (type) => type ===
      PARTITION_SERVICE_SHARED.PARTITION_SERVICE_OPERATION.MIRROR_RETENTION_CUSTODY,
    applyMirrorRetentionCustodyCommand,
  ],
  [isCdcCommandType, applyCdcAcknowledgementCommand],
  [(type) => !isCommittedSqlCommandType(type), applyCommittedTransactionCommand],
]);

function findNonSqlCommittedEntryApplier(commandType) {
  return NON_SQL_COMMITTED_APPLIERS.find(([matches]) => matches(commandType))?.[1];
}

const {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SERVICE_OPERATION,
  buildDurableCommitWitness,
  isRaftRsTransportEnvelope,
  stepRaftEnvelope,
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
// each refusal fails the application closed:
// - an unrecognised type;
// - an SQL command without an entryId: it has no outcome-row key and no
//   CDC-obligation key, so its statement never runs;
// - a SQL or custody entry carrying obsolete mirror-retention fields.
function committedCommandGate(service, committed) {
  const commandType = committed.command?.type;
  if (!isCommittedCommandType(commandType)) {
    throw committedCommandRefusal(service, committed, {
      message: PARTITION_SERVICE_ERROR_MSG.COMMITTED_COMMAND_UNRECOGNISED,
      code: PARTITION_COMMITTED_COMMAND_ERROR_CODE.UNRECOGNISED,
      outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.UNRECOGNISED,
      reason: PARTITION_COMMITTED_COMMAND_HOST_FAILURE_REASON.COMMAND_UNKNOWN});
  }
  if ((isCommittedSqlCommandType(commandType) ||
      commandType === PARTITION_SERVICE_OPERATION.MIRROR_RETENTION_CUSTODY) &&
      hasObsoleteMirrorCustodyField(committed.command)) {
    const code = MIRROR_RETENTION_CUSTODY_COMMAND_ERROR.BYTES;
    throw committedCommandRefusal(service, committed, {message: code, code, reason: code,
      outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.CUSTODY_BYTES_REFUSED});
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

function buildSingleStatementLockCheckOperation(command) {
  return {
    sql: command.sql,
    params: command.params || [],
    ...(command.typedParams ? {typedParams: command.typedParams} : {}),
  };
}

function buildAppliedStatementResolutionAnswer(info, identity) {
  return {
    success: true,
    changes: info.changes,
    lastInsertRowid: info.lastInsertRowid,
    ...(typeof info.mutationKind === 'string' ? {mutationKind: info.mutationKind} : {}),
    ...(info.typedEffects ? {typedEffects: info.typedEffects} : {}),
    ...(Array.isArray(info.affectedRows) ? {affectedRows: info.affectedRows} : {}),
    ...identity,
  };
}

class PartitionServiceEntryApplyBase extends PartitionServiceRaftInitBase {
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
      const fenceRefusal = checkExcludedMemberEnvelopeFence(this, envelope, payload);
      if (fenceRefusal !== null) {
        return fenceRefusal;
      }
      return stepRaftEnvelope(this.raft, payload);
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
    return type === PARTITION_SERVICE_MESSAGE_TYPE.FORWARD_WRITE ||
      type === PARTITION_SERVICE_MESSAGE_TYPE.SYSTEM_TABLE_WRITE ||
      type === PARTITION_SERVICE_MESSAGE_TYPE.QUERY ||
      type === PARTITION_SERVICE_MESSAGE_TYPE.TRANSACTION ||
      type === COORDINATOR_SETTLEMENT_TYPE ||
      type === PLACEMENT_REPAIR_PREPARE_TYPE ||
      type === PLACEMENT_REPAIR_TYPE ||
      type === PLACEMENT_ADMIT_TYPE ||
      type === FORMATION_TRANSITION_TYPE ||
      type === LOCKING_READ_RESERVATION_TYPE;
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
    const ownerCommandHandler = OWNER_COMMITTED_COMMAND_HANDLERS[payload.type];
    if (ownerCommandHandler) {
      return ownerCommandHandler(this, payload);
    }
    switch (payload.type) {
    case PARTITION_SERVICE_MESSAGE_TYPE.FORWARD_WRITE:
      return payload.operation ?
        this.applyWrite(payload.operation) :
        {success: false, error: PARTITION_SERVICE_ERROR_MSG.INVALID_FORWARD_WRITE};
    case PARTITION_SERVICE_MESSAGE_TYPE.SYSTEM_TABLE_WRITE:
      return this.handleSystemTableWrite(payload);
    case PARTITION_SERVICE_MESSAGE_TYPE.QUERY:
      return this.handleRemoteQuery(payload);
    case PARTITION_SERVICE_MESSAGE_TYPE.TRANSACTION:
      return this.handleTransactionMessage(payload);
    case PARTITION_SERVICE_MESSAGE_TYPE.START_SPLIT_REPLICATION:
      return this.handleStartSplitReplication(payload);
    case PARTITION_SERVICE_MESSAGE_TYPE.START_MERGE_REPLICATION:
      return this.handleStartMergeReplication(payload);
    case PARTITION_SERVICE_MESSAGE_TYPE.LEARNER_PROMOTION_PROOF:
      return this.handleLearnerPromotionProofRequest(payload);
    case PARTITION_SERVICE_MESSAGE_TYPE.ADMIT_REPLICA:
      return this.handleReplicaAdmissionRequest(payload);
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
    const descriptor = usesSplitDescriptorIdentity(command) ? decodeSplitDescriptorCommand(this, command) : null;
    if (usesSplitDescriptorIdentity(command) && descriptor === null) {
      const code = SPLIT_DESCRIPTOR_ERROR.BYTES;
      throw committedCommandRefusal(this, {command, index, rollback: (effect) =>
        scheduleEffect(COMMIT_APPLY_EFFECT_PHASE.ROLLBACK, effect)},
      {message: code, code, outcome: code, reason: code});
    }
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
    const nonSqlApplier = findNonSqlCommittedEntryApplier(commandType);
    if (nonSqlApplier) {
      return nonSqlApplier(this, {command, index, term,
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
      const lockConflict = checkOperationsLockingReadConflict(this, {
        operations: [buildSingleStatementLockCheckOperation(command)],
        transactionId: command.transactionId ?? null,
        deterministic: true,
      });
      if (lockConflict !== null) {
        if (descriptor) {
          afterCommit(() => this.resolveCommittedWrite(command.entryId,
            {...lockConflict, success: false, failureCode: lockConflict.errorCode, retryable: true, deferRetry: true}));
          return PARTITION_COMMITTED_COMMAND_OUTCOME.RECORDED_ONLY;
        }
        return settleLockingReadRefusedCommittedStatement(
          this, {lockConflict, command, entryKey, index, term, identity, afterCommit});
      }
      let info;
      let receipt;
      try {
        if (descriptor) {
          const effect = applySplitDescriptorStatement(this, command, descriptor);
          if (effect.refusal) {
            afterCommit(() => this.resolveCommittedWrite(command.entryId, effect.refusal));
            return PARTITION_COMMITTED_COMMAND_OUTCOME.RECORDED_ONLY;
          }
          info = effect.result;
          receipt = effect.receipt;
        } else {
          info = runCommittedPartitionStatement(this, command);
        }
      } catch (error) {
        if (descriptor) {
          scheduleEffect(COMMIT_APPLY_EFFECT_PHASE.ROLLBACK, () => this.rejectCommittedWrite(command.entryId, error));
          throw error;
        }
        return settleFailedCommittedStatement(this, {
          error, command, entryKey, index, term, identity, afterCommit,
          afterRollback: (effect) =>
            scheduleEffect(COMMIT_APPLY_EFFECT_PHASE.ROLLBACK, effect),
        });
      }
      recordCommittedStatementOutcome(this, {
        ...(descriptor ? {ownerResultText: JSON.stringify(receipt), commandDigest: descriptor.digest} : {}),
        entryKey,
        outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED,
        index,
        term,
        result: info,
        command,
      });
      if (!descriptor || info.changes > 0) {
        recordCommittedStatementCdc(this, {command, index, term, afterCommit},
          {entryKey, result: info});
        advancePartitionWriteGeneration(this.db);
        const committedGeneration = readPartitionWriteGeneration(this.db);
        recordCommittedAutocommitRowKeys(this, command, committedGeneration);
        scheduleEffect(COMMIT_APPLY_EFFECT_PHASE.ROLLBACK, () =>
          resetParticipantRowKeyHistory(this));
        recordCommittedWriteTraffic(this, afterCommit, 1);
      }
      if (command.type === PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE ||
          /^\s*(?:CREATE|DROP)\s+TABLE\b/iu.test(String(command.sql || ''))) {
        afterCommit(() => invalidateParticipantDeterminismSelfCheck(this.db));
      }
      if (command.type === PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE) {
        afterCommit(() => this.registerMigrationDefaultFromAlterSql(command.sql));
      }
      afterCommit(() => {
        this.resolveCommittedWrite(
          command.entryId,
          {...buildAppliedStatementResolutionAnswer(info, identity),
            ...(receipt ? {splitDescriptorReceipt: receipt, committed: true, term} : {})},
          descriptor?.digest,
        );
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
