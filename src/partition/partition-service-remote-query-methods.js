// Remote QUERY routing preserves the partition's ordinary read/write gates and
// delegates current transaction identity and staging to the participant owner.
import {QUERY_ERROR_CODE} from '../query/query-constants.js';
import {
  STATEMENT_INGRESS_FIELD,
  refuseRoutedClientSystemTableWrite,
  refuseSystemTableSchemaMutation,
} from '../query/sql-statement-ingress.js';
import {
  answerParticipantQueryIdentityRefusal,
  answerParticipantSessionQuery,
} from './partition-participant-transaction-request.js';
import {PARTICIPANT_TRANSACTION_FAILURE_CODE as PARTICIPANT_CODE} from
  './partition-participant-transaction-constants.js';
import {
  findParticipantSession,
  notifyRowKeySettlementWaiters,
  waitForConflictingRowKeyHolderToSettle,
} from './partition-participant-transaction-session.js';
import {
  bindRowKeyWaitServiceNotifier,
  classifyRowKeyReevaluationAnswer,
  completeRowKeyWaitReevaluation,
  decorateParticipantRowKeyWaitFailure,
  ensureRowKeyReevaluationReceipt,
  finishAttemptsExhaustedRowKeyWaitReevaluation,
  finishRebaseRefusedRowKeyWaitReevaluation,
  finishTerminalRowKeyWaitReevaluation,
  prepareSessionRowKeyWaitBudget,
} from './partition-row-key-waiters.js';
import {prepareWaitingRowKeySessionForReevaluation} from
  './partition-participant-transaction-staging.js';
import {coordinatorTableSchemaRefusal} from
  '../query/distributed/distributed-transaction-schema-enforcement.js';
import {QUERY_RESULT_REQUEST_FIELD} from '../query/query-result-budget.js';
import {decodeTypedParams} from '../query/sql-value-codec.js';
import {
  admitPartitionStatement,
  classifyPartitionStatementHead,
  partitionStatementRefusalAnswer,
} from './partition-statement-admission.js';
import {
  PARTITION_STATEMENT_KIND,
  PARTITION_STATEMENT_PATH,
} from './partition-statement-admission-constants.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL, pickTypedWriteAnswer} from
  './partition-write-kernel.js';
import {checkPartitionWriteLockingReadConflict} from
  './partition-locking-read-write-check.js';
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {readStateField} from '../utils/state-field-read.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {
  LEADER_READ_KIND,
  LEADER_READ_REQUEST_FIELD,
  LEADER_READ_REQUEST_MALFORMED,
  OWNER_FACT_UNAVAILABLE_REASON as LEADER_READ_REFUSAL,
  leaderReadOf,
  leaderReadWitnessRefusal,
} from '../control-plane/control-plane-owner-fact-read-contract.js';

const READ_AUTHORITY_WITNESS_STATE = Object.freeze({
  NOT_APPLICABLE: 'not_applicable',
  OBSERVED: 'observed',
});

const DDL_STATEMENT_HEADS = new Set(['CREATE', 'ALTER', 'DROP']);
const DEFAULT_PARTICIPANT_CONFLICT_WAIT_MS = 15000; // ends-on: conflicting row-key holder settlement
const MAX_PARTICIPANT_CONFLICT_REEVAL_ATTEMPTS = 16;

function resolveParticipantConflictWaitBudgetMs(service) {
  if (Number.isFinite(service?.conflictSettleWaitMs) &&
      service.conflictSettleWaitMs > 0) {
    return Math.min(
      Math.floor(service.conflictSettleWaitMs),
      DEFAULT_PARTICIPANT_CONFLICT_WAIT_MS,
    );
  }
  return DEFAULT_PARTICIPANT_CONFLICT_WAIT_MS;
}

function decorateSessionAnswer(service, payload, answer) {
  return decorateParticipantRowKeyWaitFailure(
    service, findParticipantSession(service, payload), answer);
}

function reevaluateWaitingRowKeyQuery(service, payload, participantAnswer, receipt) {
  if (!prepareWaitingRowKeySessionForReevaluation(service, payload)) {
    const session = findParticipantSession(service, payload);
    return {
      done: true,
      answer: finishRebaseRefusedRowKeyWaitReevaluation(
        service, session, receipt, participantAnswer),
    };
  }
  const reevaluated = answerParticipantSessionQuery(service, payload);
  const classified = classifyRowKeyReevaluationAnswer(reevaluated);
  completeRowKeyWaitReevaluation(service, receipt, classified.outcome);
  return {
    done: classified.done,
    answer: classified.done ? decorateSessionAnswer(service, payload, reevaluated) : reevaluated,
  };
}

function isWaitableRowKeyConflictAnswer(answer) {
  return answer?.failureCode === PARTICIPANT_CODE.ALREADY_ACTIVE &&
    typeof answer.detail === 'string';
}

async function runOneConflictWaitStep(service, payload, participantAnswer, originalDeadlineMs) {
  const session = findParticipantSession(service, payload);
  const remainingMs = prepareSessionRowKeyWaitBudget(service, session, originalDeadlineMs);
  if (remainingMs <= 0) {
    return {
      done: true,
      answer: finishTerminalRowKeyWaitReevaluation(
        service, session, session?.lastWaitReceipt ?? null, null, participantAnswer),
    };
  }
  const waitOutcome = await waitForConflictingRowKeyHolderToSettle(
    service, payload, participantAnswer.detail, remainingMs);
  const activeReceipt = ensureRowKeyReevaluationReceipt(
    service, session, participantAnswer.detail, originalDeadlineMs, waitOutcome?.receipt);
  if (!waitOutcome.settled) {
    return {
      done: true,
      answer: finishTerminalRowKeyWaitReevaluation(
        service, session, activeReceipt, null, participantAnswer),
    };
  }
  return reevaluateWaitingRowKeyQuery(
    service, payload, participantAnswer, activeReceipt);
}

async function resolveParticipantRemoteQueryAnswer(service, payload) {
  bindRowKeyWaitServiceNotifier(service, notifyRowKeySettlementWaiters);
  let participantAnswer = answerParticipantSessionQuery(service, payload);
  if (participantAnswer === null) return null;
  let originalDeadlineMs = null;
  for (let attempt = 0; attempt < MAX_PARTICIPANT_CONFLICT_REEVAL_ATTEMPTS; attempt += 1) {
    if (!isWaitableRowKeyConflictAnswer(participantAnswer)) {
      return decorateSessionAnswer(service, payload, participantAnswer);
    }
    if (originalDeadlineMs === null) {
      originalDeadlineMs =
        service.timeSource.now() + resolveParticipantConflictWaitBudgetMs(service);
    }
    const step = await runOneConflictWaitStep(
      service, payload, participantAnswer, originalDeadlineMs);
    if (step.done) return step.answer;
    participantAnswer = step.answer;
  }
  const session = findParticipantSession(service, payload);
  return finishAttemptsExhaustedRowKeyWaitReevaluation(
    service, session, session?.lastWaitReceipt ?? null, participantAnswer);
}

const {
  ERRORS,
  PARTITION_SERVICE_ERROR_MSG,
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

function isDdlRemoteQuery(payload, sql) {
  if (payload?.[QUERY_PAYLOAD_FIELD_MIGRATION_OPERATION] ===
      PARTITION_SERVICE_MIGRATION_OPERATION.ALTER_TABLE) {
    return true;
  }
  const classified = classifyPartitionStatementHead(sql);
  return classified.kind === PARTITION_STATEMENT_KIND.INDEX_DDL ||
    DDL_STATEMENT_HEADS.has(classified.head);
}

function resolveSystemTableSchemaRefusal(service, options = null) {
  const clientRefusal = refuseRoutedClientSystemTableWrite(
    options, service.tableName);
  if (clientRefusal !== null) {
    return {...clientRefusal, partitionId: service.partitionId};
  }
  const protectedSchema = coordinatorTableSchemaRefusal(service.tableName);
  if (protectedSchema !== null) {
    return {...protectedSchema, partitionId: service.partitionId};
  }
  const systemSchemaRefusal = refuseSystemTableSchemaMutation(
    service.tableName);
  return systemSchemaRefusal !== null ?
    {...systemSchemaRefusal, partitionId: service.partitionId} :
    null;
}

// A write reached a replica that does not lead and has no live leader at a
// committed address to redirect to: typed NOT_LEADER, the address owner's
// refusal attached.
function noLeaderWriteRefusal(service, refusal) {
  return {success: false,
    error: ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
    failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER,
    leaderAddressRefusal: refusal.code ?? null,
    partitionId: service.partitionId};
}

function writeRoutingRefusal(service, payload, isWriteOperation) {
  if (!isWriteOperation) return null;
  const epochRejection = service.rejectStalePartitionEpochWrite(
    payload[QUERY_PAYLOAD_FIELD_EXPECTED_PARTITION_VERSION]);
  if (epochRejection !== null) return epochRejection;
  if (service.role === RaftRole.LEADER) return null;
  let leaderAddress;
  try {
    leaderAddress = service.resolveLeaderAddress();
  } catch (refusal) {
    return noLeaderWriteRefusal(service, refusal);
  }
  service.logger.debug(PARTITION_SERVICE_LOG_MSG.REDIRECTING_WRITE_TO_LEADER, {
    partitionId: service.partitionId,
    replicaId: service.replicaId,
    leaderAddress,
  });
  return {success: false,
    redirect: PARTITION_SERVICE_RESPONSE.LEADER_REDIRECT, leaderAddress,
    partitionId: service.partitionId};
}

// appliedPositionRead: an owner fact's read at the store's applied position.
async function executeRemoteQuery(service, payload, appliedPositionRead) {
  const sql = payload.sql;
  const params = payload.typedParams !== undefined && payload.typedParams !== null ?
    decodeTypedParams(payload.typedParams) :
    (payload.params || []);
  if (payload[QUERY_PAYLOAD_FIELD_MIGRATION_OPERATION] ===
      PARTITION_SERVICE_MIGRATION_OPERATION.ALTER_TABLE) {
    return service.executeMigrationAlterQuery(sql, params, {
      migrationId: payload[QUERY_PAYLOAD_FIELD_MIGRATION_ID] || null,
      sessionId: payload.sessionId || null,
      [STATEMENT_INGRESS_FIELD]: payload[STATEMENT_INGRESS_FIELD] || null,
    });
  }
  return service.executeQuery(sql, params, {
    entryId: payload[QUERY_PAYLOAD_FIELD_ENTRY_ID] || null,
    operationId: payload[QUERY_PAYLOAD_FIELD_OPERATION_ID] || null,
    idempotencyKey: payload[QUERY_PAYLOAD_FIELD_IDEMPOTENCY_KEY] || null,
    splitMirrorOrigin: payload.splitMirrorOrigin || null,
    sessionId: payload.sessionId || null,
    [STATEMENT_INGRESS_FIELD]: payload[STATEMENT_INGRESS_FIELD] || null,
    resultDeadlineMs: payload[QUERY_RESULT_REQUEST_FIELD.DEADLINE_MS],
    resultMaxBytes: payload[QUERY_RESULT_REQUEST_FIELD.MAX_BYTES],
    resultMaxRows: payload[QUERY_RESULT_REQUEST_FIELD.MAX_ROWS],
    wireRead: true,
    appliedPositionRead,
  });
}

function remoteQueryAnswer(service, result, readAuthorityWitness) {
  const success = result?.success === true;
  const hasRowSet = Boolean(result?.rowSet);
  const rowSetComplete = success &&
    (hasRowSet || Array.isArray(result?.rows)) &&
    result?.partial !== true &&
    result?.rowSetComplete === true;
  const answer = {
    success,
    ...(hasRowSet ? {rowSet: result.rowSet} : {rows: result.rows}),
    ...(result?.executionEnvelope ? {executionEnvelope: result.executionEnvelope} : {}),
    changes: result.changes,
    count: result.count, partitionId: service.partitionId,
    rowSetComplete,
    ...(result?.partial === true ? {partial: true} : {}),
    durableCommitWitness: result.durableCommitWitness,
    originHlc: result.originHlc, acceptingNodeId: result.acceptingNodeId,
    acknowledgedAtMs: result.acknowledgedAtMs, readAuthorityWitness,
    ...(Number.isSafeInteger(result?.readGeneration) ?
      {readGeneration: result.readGeneration} : {}),
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
  return {success: false, error: error.message,
    errorCode: error.code || null, partitionId: service.partitionId};
}

function safeIndexOf(value) {
  return Number.isSafeInteger(value) ? value : null;
}

// The store's applied index as the statement owner read it (a decimal
// string), as a witness index.
function storePositionOf(value) {
  return typeof value === 'string' ? safeIndexOf(Number(value)) : null;
}

// The serving replica described from one raft observation: for a
// leader-qualified read the raft owner's current authority observation
// (observeOwnAuthority), for any other read the status its runtime reports
// (readOwnRaftStatus). Role, term, the commit and applied index and whether
// it has applied an entry of its own term (raft-rs commits an earlier
// leader's entries only through one, so such a leader has applied every
// entry an earlier leader committed) come from that observation, never from
// the event-derived service role.
function readAuthorityWitnessOf(service, status, read = undefined) {
  return {
    state: READ_AUTHORITY_WITNESS_STATE.OBSERVED,
    partitionId: service.partitionId,
    servingNodeId: service.nodeId,
    servingReplicaId: service.replicaId,
    term: safeIndexOf(status?.term),
    appliedIndex: safeIndexOf(status?.appliedIndex),
    commitIndex: safeIndexOf(status?.commitIndex),
    currentTermApplied: status?.currentTermApplied === true,
    // A replica whose core gave no usable observation claims no role.
    role: readStateField(status?.role),
    // The leader-qualified read this receiver decided, echoed to its caller.
    ...(read === undefined ? {} : {leaderRead: read}),
    // The witness records WHEN THIS REPLICA observed its own authority, so
    // it reads this replica's clock. This is the owner decision the metered
    // oracle's knownAmbientSiteOutsideProofCone reserved: the site had no
    // clock owner when it was recorded, and the composed formation reaching
    // it is what supplied one.
    observedAtMs: service.timeSource.now(),
  };
}

function logRemoteQueryHandling(service, sql) {
  service.logger.debug(PARTITION_SERVICE_LOG_MSG.HANDLING_REMOTE_QUERY, {
    sql: sql.substring(0, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
    partitionId: service.partitionId,
    replicaId: service.replicaId,
  });
}

// The replica's raft core as it is now (the raft owner's current authority
// observation: never a turn, never cached, never driving), when it is a usable
// observation of this replica in this group; else null. A leader that has not
// applied an entry of its own term while a turn pends reports NOT_SETTLED,
// which is not LEADER.
function observeOwnAuthority(service) {
  const observation = service.raft.observeCurrentAuthority();
  return observation?.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
    observation.groupId === service.partitionId &&
    observation.replicaIdentity === service.replicaId ? observation : null;
}

// A replica that does not lead names the live leader its own core knows, at
// its committed address; with none it says so (an explicit unavailable).
function unaddressedLeaderOf(refusal) {
  return {leaderAddressRefusal: readStateField(refusal?.code)};
}

function leaderRedirectOf(service) {
  try {
    return {redirect: PARTITION_SERVICE_RESPONSE.LEADER_REDIRECT,
      leaderAddress: service.resolveLeaderAddress()};
  } catch (refusal) {
    return unaddressedLeaderOf(refusal);
  }
}

function requestsLeaderQualifiedRead(payload, isWriteOperation) {
  return !isWriteOperation && payload[LEADER_READ_REQUEST_FIELD] !== undefined;
}

// A refused leader-qualified read carries no rows: only the typed reason, the
// witness the decision was made on and, for a non-leader, its known leader.
function leaderReadRefusal(service, reason, witness) {
  const refusal = {success: false, error: reason, failureCode: reason,
    partitionId: service.partitionId,
    readAuthorityWitness: Object.freeze(witness)};
  return reason === LEADER_READ_REFUSAL.NOT_LEADER ?
    {...refusal, ...leaderRedirectOf(service)} : refusal;
}

// After the read: the replica still leads in the same term with the same
// runtime (observeOwnAuthority also re-checks group and replica identity).
function leaderReadRefusalAfter(service, before) {
  const after = observeOwnAuthority(service);
  return after?.role !== RaftRole.LEADER || after.term !== before.term ||
    after.lifecycleIncarnation !== before.lifecycleIncarnation ||
    after.runtimeGeneration !== before.runtimeGeneration ?
    LEADER_READ_REFUSAL.NOT_LEADER : null;
}

// An owner fact is never read through a connection inside a transaction this
// receiver did not open (it would see that transaction's staged rows). No
// path holds one across requests today (participant staging rolls back in
// the same synchronous run); this is the one synchronous check that keeps it
// so for owner facts.
function foreignTransactionRefusal(service, read) {
  return read.kind === LEADER_READ_KIND.OWNER_FACT && service.db.inTransaction === true ?
    LEADER_READ_REFUSAL.FOREIGN_TRANSACTION : null;
}

// An owner fact's witness names the applied position its rows were read at:
// the store's applied index, read in the statement's own read transaction.
function witnessAtReadPosition(witness, read, result) {
  return Object.freeze(read.kind === LEADER_READ_KIND.OWNER_FACT ?
    {...witness, appliedIndex: storePositionOf(result?.appliedPosition)} : witness);
}

/**
 * Answer a leader-qualified read (the request's leaderRead field) as its
 * receiver: decided here, by the leader-read predicate, on its raft core's
 * current observation, with nothing awaited between that observation and the
 * statement. An owner fact's rows and the applied position its witness names
 * are read in one read transaction (the statement owner's applied-position
 * read), on a connection no foreign transaction holds. The witness echoes the
 * read decided. A refused read executes nothing and ships no rows.
 * @param {Object} service - The receiving PartitionService.
 * @param {Object} payload - The QUERY payload.
 * @param {string} sql - Its statement.
 * @return {Promise<Object>} The answer or the typed refusal.
 */
async function answerLeaderQualifiedRead(service, payload, sql) {
  const read = leaderReadOf(payload[LEADER_READ_REQUEST_FIELD]);
  if (read === null) {
    return {success: false, error: LEADER_READ_REQUEST_MALFORMED,
      failureCode: LEADER_READ_REQUEST_MALFORMED,
      partitionId: service.partitionId};
  }
  const before = observeOwnAuthority(service);
  const witness = readAuthorityWitnessOf(service, before, read);
  const refusal = leaderReadWitnessRefusal(witness,
    {partitionId: service.partitionId, read}) ?? foreignTransactionRefusal(service, read);
  if (refusal !== null) return leaderReadRefusal(service, refusal, witness);
  logRemoteQueryHandling(service, sql);
  let result;
  try {
    result = await executeRemoteQuery(service, payload,
      read.kind === LEADER_READ_KIND.OWNER_FACT);
  } catch (error) {
    return remoteQueryFailure(service, sql, error);
  }
  const after = leaderReadRefusalAfter(service, before);
  return after === null ?
    remoteQueryAnswer(service, result, witnessAtReadPosition(witness, read, result)) :
    leaderReadRefusal(service, after, witness);
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
    return readAuthorityWitnessOf(this, observeOwnAuthority(this));
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
        success: false,
        error: PARTITION_SERVICE_ERROR_MSG.MISSING_SQL_QUERY,
      };
    }
    const isWriteOperation = this.isWriteQuery(sql);
    const requiresLeaderRouting =
      isWriteOperation || Boolean(payload?.transactionId);
    const routingRefusal = writeRoutingRefusal(
      this,
      payload,
      requiresLeaderRouting,
    );
    if (routingRefusal !== null) return routingRefusal;
    const ingressRefusal = isWriteOperation ?
      refuseRoutedClientSystemTableWrite(payload, this.tableName) : null;
    if (ingressRefusal !== null) {
      return {...ingressRefusal, partitionId: this.partitionId};
    }
    const ddlSchemaRefusal = isDdlRemoteQuery(payload, sql) ?
      resolveSystemTableSchemaRefusal(this, payload) : null;
    if (ddlSchemaRefusal !== null) return ddlSchemaRefusal;
    const participantAnswer = await resolveParticipantRemoteQueryAnswer(
      this,
      payload,
    );
    if (participantAnswer !== null) return participantAnswer;
    if (requestsLeaderQualifiedRead(payload, isWriteOperation)) {
      return answerLeaderQualifiedRead(this, payload, sql);
    }
    const lockingConflict = isWriteOperation ?
      checkPartitionWriteLockingReadConflict(this, payload) : null;
    if (lockingConflict !== null) return lockingConflict;
    const readAuthorityWitness =
      this.buildRemoteReadAuthorityWitness(isWriteOperation);
    logRemoteQueryHandling(this, sql);
    try {
      const result = await executeRemoteQuery(this, payload, false);
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
    const protectedSchema = resolveSystemTableSchemaRefusal(this, options);
    if (protectedSchema !== null) {
      return protectedSchema;
    }
    const admission = admitPartitionStatement(
      this, sql, params, PARTITION_STATEMENT_PATH.MIGRATION);
    if (!admission.admitted) {
      return partitionStatementRefusalAnswer(this, sql, admission);
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
    if (typeof sql !== 'string' || sql.trim().length === 0) return false;
    return classifyPartitionStatementHead(sql).kind !==
      PARTITION_STATEMENT_KIND.READ;
  },
});

export {PARTITION_SERVICE_REMOTE_QUERY_METHODS};
