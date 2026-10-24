// The committed application of a partition's transaction commands (TX1 design
// revision 10, sections 2.3, 2.4, 3.2, 4, 6.1, 6.2 and 0.0.13): the one owner
// of what a committed PARTICIPANT_PREPARE, PARTICIPANT_DECISION and
// PARTICIPANT_GENERATION_ORIGIN do on every replica, and of the reservation a PREPARED row
// places on every other committed write.
//
// It runs inside the committed-entry application's callback, in the one
// SQLite transaction that also writes the rs-raft applied state
// (raft-rs-application-transaction-owner.js: store.transaction, the callback,
// then putAppliedState): a row, the operations, their per-operation outcomes,
// the write generation g and the applied index commit together or not at all.
// Every disposition is a deterministic function of the committed prefix and
// the command's bytes, the same on every replica; an environmental failure is
// the group's host failure, records nothing and the command applies again
// when the host recovers. The apply never classifies a statement: a committed
// command runs its operations as carried, through the statement-admission
// owner's committed hook (its kind and rowid rules and the post-statement
// ceiling, identical on every replica).
//
// What applyCommittedEntry returns for a transaction command
// (PARTITION_COMMITTED_COMMAND_OUTCOME): APPLIED when it wrote its row (a
// PREPARED, REFUSED or TOMBSTONE row, or a decided transition), REPLAYED for
// an idempotent repeat answered from the row, RESERVED_REFUSED for a PREPARE
// that met another transaction's reservation, RECORDED_ONLY for a typed
// refusal consumed without a write.
//
// Every PREPARE and decision first compares its carried execution envelope
// with this replica's build and applies as carried either way (a mismatch is
// a counted diagnostic, design 2.3 step 0). A decision that moves a PREPARED
// row re-admits, after its commit, the writes the leader parked while the
// partition was reserved (design 7, decision X); a write this leader
// proposed that meets the reservation at apply is parked again under its
// entryId instead of answered.

import {ERRORS} from '../constants/errors.js';
import {TABLES} from '../constants/tables.js';
import {installTransactionSchemaEnforcement} from
  '../query/distributed/distributed-transaction-schema-enforcement.js';
import {
  PARTITION_COMMITTED_COMMAND_OUTCOME as OUTCOME,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_OPERATION as OPERATION,
} from './partition-service-constants.js';
import {
  PARTITION_STATEMENT_REFUSAL_CODE,
  PARTITION_STATEMENT_REFUSAL_LAYER,
} from './partition-statement-admission-constants.js';
import {runCommittedPartitionStatement} from './partition-statement-admission.js';
import {
  isDeterministicStatementFailure,
  readCommittedStatementOutcome,
  recordCommittedStatementOutcome,
  statementEnvironmentFailure,
} from './partition-committed-statement-outcome.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from './partition-write-kernel.js';
import {
  readmitReservedWrites,
  reparkReservedWrite,
} from './partition-service-raft-write-commit.js';
import {captureCommittedOperationCdc, recordCommittedOperationCdc} from
  './partition-cdc-obligation.js';
import {noteExecutionEnvelope} from './partition-transaction-execution-envelope.js';
import {
  carriedOriginIndexOf,
  decisionBindingRefusalOf,
  decisionMatchesPreparedRow,
  identityRefusalOf,
  operationOutcomeKeyOf,
  operationsOf,
  preparedDigestOf,
  validationTextOf,
} from './partition-participant-transaction-bytes.js';
import {
  advancePartitionWriteGeneration,
  insertParticipantTransactionRow,
  isPartitionReserved,
  participantOutcomeOf,
  readParticipantTransactionRow,
  readPartitionWriteGeneration,
  readPartitionWriteOrigin,
  recordPartitionWriteOrigin,
  updateParticipantTransactionDecided,
} from './partition-participant-transaction-store.js';
import {
  PARTICIPANT_TRANSACTION_COMMAND as COMMAND,
  PARTICIPANT_TRANSACTION_DECISION as DECISION,
  PARTICIPANT_TRANSACTION_FAILURE_CODE as CODE,
  PARTICIPANT_TRANSACTION_LOG_MSG as LOG_MSG,
  PARTICIPANT_TRANSACTION_MESSAGE as MESSAGE,
  PARTICIPANT_TRANSACTION_REFUSAL_CAUSE as CAUSE,
  PARTICIPANT_TRANSACTION_STATE as STATE,
} from './partition-participant-transaction-constants.js';
import {recordCommittedWriteTraffic} from './partition-write-traffic.js';

// The private value that ends a PREPARE's dry run: thrown inside its
// savepoint, so better-sqlite3 rolls every carried operation back.
const DRY_RUN_COMPLETE = Object.freeze({dryRunComplete: true});
const DRY_RUN_PASSED = Object.freeze({passed: true});
const PREPARE_CAUSES = Object.freeze({
  statement: CAUSE.STATEMENT_FAILED,
  ceiling: CAUSE.ROWID_CEILING,
});
// A failure while a COMMIT applies the operations its PREPARE dry-ran over the
// same reserved state is unreachable on consistent replicas (design 6.2): any
// such failure is the one alarm cause.
const COMMIT_CAUSES = Object.freeze({
  statement: CAUSE.COMMIT_STATEMENT_FAILED,
  ceiling: CAUSE.COMMIT_STATEMENT_FAILED,
});

function messageOf(text, code) {
  return `${text}${MESSAGE.CODE_SEPARATOR}${code}`;
}

// The proposer's answer (resolved after the transaction commits; a replica
// with no pending write answers no one).
function answerProposer(service, committed, answer) {
  const {command} = committed;
  committed.afterCommit(() => service.resolveCommittedWrite(command.entryId, {
    partitionId: service.partitionId,
    transactionId: command.transactionId ?? null,
    participantId: command.participantId ?? null,
    ...answer,
  }));
}

function consumedRefusal(service, committed, failureCode, fields = {}) {
  service.logger.debug(LOG_MSG.COMMAND_REFUSED, {
    partitionId: service.partitionId,
    entryId: committed.command.entryId,
    commandType: committed.command.type,
    failureCode,
  });
  answerProposer(service, committed, {success: false,
    error: messageOf(MESSAGE.COMMAND_REFUSED, failureCode), failureCode,
    ...fields});
  return OUTCOME.RECORDED_ONLY;
}

// A state consistent replicas never reach: consumed alike everywhere, and
// raised as an alarm.
function alarmRefusal(service, committed, failureCode, fields) {
  service.logger.error(LOG_MSG.ATOMICITY_ALARM, {
    partitionId: service.partitionId,
    entryId: committed.command.entryId,
    failureCode,
    refusalCause: fields.refusalCause ?? null,
  });
  return consumedRefusal(service, committed, failureCode, fields);
}

function rowAnswer(service, identity) {
  return participantOutcomeOf(readParticipantTransactionRow(service.db,
    identity));
}

// The conflict evidence of this replica now, as a PREPARE carries it (design
// 3.2, 0.0.13): g counted from the recorded generation origin; null while no
// origin has applied here.
function validationTextHereOf(service) {
  const origin = readPartitionWriteOrigin(service.db);
  return origin === null ? null : validationTextOf(
    readPartitionWriteGeneration(service.db), service.partitionId,
    origin.originIndex);
}

// --- the dry run and the operations ---

function runCarriedOperation(service, operation) {
  return runCommittedPartitionStatement(service, {
    type: OPERATION.QUERY,
    sql: operation.sql,
    params: operation.params,
  });
}

/**
 * The refusal a deterministic statement failure is settled with, identical
 * on every replica; an environmental failure is thrown as the host failure.
 * @param {Object} service - The partition.
 * @param {*} error - What the operation threw.
 * @param {{statement: string, ceiling: string}} causes - The refusal causes.
 * @return {{cause: string, detail: string}} The refusal.
 */
function deterministicRefusalOf(service, error, causes) {
  if (error?.code === PARTITION_STATEMENT_REFUSAL_CODE) {
    return {cause: error.refusalLayer ===
      PARTITION_STATEMENT_REFUSAL_LAYER.ROWID_CEILING ?
      causes.ceiling : causes.statement, detail: String(error.message)};
  }
  if (isDeterministicStatementFailure(error, service.db)) {
    return {cause: causes.statement,
      detail: messageOf(String(error?.message), error?.code ?? error?.name)};
  }
  throw statementEnvironmentFailure(error);
}

function dryRunCarriedOperations(service, operationsText) {
  const operations = operationsOf(operationsText);
  if (operations === null) {
    return {cause: CAUSE.STATEMENT_FAILED,
      detail: MESSAGE.OPERATIONS_UNREADABLE};
  }
  let outcome = DRY_RUN_PASSED;
  try {
    service.db.transaction(() => {
      for (const operation of operations) {
        runCarriedOperation(service, operation);
      }
      throw DRY_RUN_COMPLETE;
    })();
  } catch (stopped) {
    outcome = stopped === DRY_RUN_COMPLETE ? DRY_RUN_PASSED :
      deterministicRefusalOf(service, stopped, PREPARE_CAUSES);
  }
  return outcome;
}

// --- PARTICIPANT_PREPARE (design 2.3, check order steps 1-8) ---

function preparedRowOf(committed, fields) {
  const {command, index, term} = committed;
  return {
    transactionId: command.transactionId,
    participantId: command.participantId,
    sessionId: command.sessionId,
    commitMode: command.commitMode,
    transactionEpoch: command.transactionEpoch,
    operationsText: command.operationsText,
    validationText: command.validationText,
    preparedDigest: command.preparedDigest,
    prepareEntryId: command.entryId,
    prepareIndex: index,
    prepareTerm: term,
    ...fields,
  };
}

// Steps 3, 6 and 7: a REFUSED row, a control row that never moves g.
function refusePrepare(service, committed, {cause, detail}) {
  insertParticipantTransactionRow(service.db, preparedRowOf(committed,
    {state: STATE.REFUSED, refusalCause: cause, refusalDetail: detail}));
  service.logger.warn(LOG_MSG.ROW_REFUSED, {
    partitionId: service.partitionId,
    transactionId: committed.command.transactionId,
    refusalCause: cause,
  });
  answerProposer(service, committed, {success: false,
    error: messageOf(MESSAGE.COMMAND_REFUSED, CODE.PREPARE_REFUSED),
    failureCode: CODE.PREPARE_REFUSED,
    ...rowAnswer(service, committed.command)});
  return OUTCOME.APPLIED;
}

// Step 2: the row of this identity, looked up before the digest is judged;
// whatever it is, nothing is written and the entry is consumed.
function prepareOverRow(service, committed, row) {
  const {command} = committed;
  if (row.state !== STATE.PREPARED) {
    return consumedRefusal(service, committed, CODE.TERMINAL,
      participantOutcomeOf(row));
  }
  const digest = preparedDigestOf(command.operationsText,
    command.validationText);
  if (digest !== command.preparedDigest) {
    return consumedRefusal(service, committed, CODE.PREPARE_REFUSED,
      {...participantOutcomeOf(row), refusalCause: CAUSE.DIGEST_INVALID});
  }
  if (digest !== row.preparedDigest) {
    return consumedRefusal(service, committed, CODE.PREPARE_CONTENT_CONFLICT,
      participantOutcomeOf(row));
  }
  answerProposer(service, committed, {success: true, idempotent: true,
    ...participantOutcomeOf(row)});
  return OUTCOME.REPLAYED;
}

// Conflict evidence that counts g from another generation origin than this
// replica's, or from none applied here, can never be judged: REFUSED durably,
// alike on every replica (the origin is a committed entry every replica applies
// before the PREPARE), and raised as an alarm: only a bug reaches it.
function refuseOriginMismatch(service, committed) {
  service.logger.error(LOG_MSG.ORIGIN_MISMATCH, {
    partitionId: service.partitionId,
    entryId: committed.command.entryId,
    carriedOriginIndex: carriedOriginIndexOf(committed.command.validationText),
  });
  return refusePrepare(service, committed,
    {cause: CAUSE.ORIGIN_MISMATCH, detail: null});
}

function applyParticipantPrepare(service, committed) {
  const {command} = committed;
  const identityRefusal = identityRefusalOf(command, service.partitionId);
  if (identityRefusal !== null) {
    return consumedRefusal(service, committed, identityRefusal);
  }
  const row = readParticipantTransactionRow(service.db, command);
  if (row !== null) {
    return prepareOverRow(service, committed, row);
  }
  if (preparedDigestOf(command.operationsText, command.validationText) !==
      command.preparedDigest) {
    return refusePrepare(service, committed,
      {cause: CAUSE.DIGEST_INVALID, detail: null});
  }
  if (carriedOriginIndexOf(command.validationText) !==
      readPartitionWriteOrigin(service.db)?.originIndex) {
    return refuseOriginMismatch(service, committed);
  }
  if (isPartitionReserved(service.db)) {
    consumedRefusal(service, committed, CODE.RESERVED,
      {deferRetry: true, ...participantOutcomeOf(null)});
    return OUTCOME.RESERVED_REFUSED;
  }
  if (command.validationText !== validationTextHereOf(service)) {
    return refusePrepare(service, committed,
      {cause: CAUSE.CONFLICT, detail: null});
  }
  const dryRun = dryRunCarriedOperations(service, command.operationsText);
  if (dryRun !== DRY_RUN_PASSED) {
    return refusePrepare(service, committed, dryRun);
  }
  insertParticipantTransactionRow(service.db,
    preparedRowOf(committed, {state: STATE.PREPARED}));
  answerProposer(service, committed, {success: true,
    ...rowAnswer(service, command)});
  return OUTCOME.APPLIED;
}

// --- PARTICIPANT_DECISION (design 2.4 and the decision columns of 4) ---

function decidedOf(committed, state, refusal = null) {
  const {command, index, term} = committed;
  return {
    transactionId: command.transactionId,
    participantId: command.participantId,
    state,
    decision: command.decision,
    decisionDigest: command.decisionDigest,
    decisionEntryId: command.entryId,
    decisionIndex: index,
    decisionTerm: term,
    refusalCause: refusal?.cause ?? null,
    refusalDetail: refusal?.detail ?? null,
  };
}

/**
 * The results a COMMIT's operations retained in their outcome rows
 * (txop:<participantId>:<ordinal>), in order: what a COMMIT answers, first
 * and on every replay.
 * @param {Object} service - The partition.
 * @param {Object} row - The transaction's row.
 * @return {Array<{changes: *, lastInsertRowid: *}>} The results.
 */
function operationResultsOf(service, row) {
  return (operationsOf(row.operationsText) ?? []).map((_operation, ordinal) => {
    const recorded = readCommittedStatementOutcome(service,
      operationOutcomeKeyOf(row.participantId, ordinal));
    return {changes: recorded.changes ?? null,
      lastInsertRowid: recorded.lastInsertRowid ?? null};
  });
}

// After the COMMIT commits: the proposer's answer and the size update. The
// CDC events of the applied operations are not emitted here: they are
// recorded as owed obligations inside this same application transaction by
// the committed-entry CDC hook (partition-cdc-obligation.js, design 8.3 and
// section 8.3), and the leader's CDC delivery owner drives them after the commit.
function scheduleCommitEffects(service, committed, operations, events) {
  recordCommittedOperationCdc(service, committed, events);
  committed.afterCommit(() => {
    if (operations.length > 0) {
      service.scheduleSizeUpdate();
    }
  });
}

// The reservation is released with the row's move out of PREPARED: the
// writes the leader parked meanwhile are re-admitted after the commit.
function releaseReservation(service, committed) {
  committed.afterCommit(() => readmitReservedWrites(service));
}

// An atomicity alarm: the row is settled REFUSED alike on every replica.
function refuseCommit(service, committed, refusal) {
  updateParticipantTransactionDecided(service.db,
    decidedOf(committed, STATE.REFUSED, refusal));
  releaseReservation(service, committed);
  alarmRefusal(service, committed, CODE.COMMIT_REFUSED,
    rowAnswer(service, committed.command));
  return OUTCOME.APPLIED;
}

function runCommittedOperations(service, committed, operations) {
  const {command, index, term} = committed;
  const events = [];
  const results = service.db.transaction(() => operations.map((operation, ordinal) => {
    const result = runCarriedOperation(service, operation);
    recordCommittedStatementOutcome(service, {
      entryKey: operationOutcomeKeyOf(command.participantId, ordinal),
      outcome: OUTCOME.APPLIED, index, term, result});
    const event = captureCommittedOperationCdc(service, committed,
      {operation, result, ordinal});
    if (event !== null) events.push(event);
    return result;
  }))();
  return {results, events};
}

// The COMMIT of a PREPARED row (design 6.1): re-check g, run the operations in
// order with their outcomes, move the row to COMMITTED, advance g once when an
// operation applied (a zero-operation COMMIT moves no g, W19).
function commitPrepared(service, committed, row) {
  if (row.validationText !== validationTextHereOf(service)) {
    return refuseCommit(service, committed,
      {cause: CAUSE.COMMIT_BASE_MOVED, detail: null});
  }
  const operations = operationsOf(row.operationsText);
  if (operations === null) {
    return refuseCommit(service, committed, {cause: CAUSE.COMMIT_STATEMENT_FAILED,
      detail: MESSAGE.OPERATIONS_UNREADABLE});
  }
  let applied;
  try {
    applied = runCommittedOperations(service, committed, operations);
  } catch (failed) {
    return refuseCommit(service, committed,
      deterministicRefusalOf(service, failed, COMMIT_CAUSES));
  }
  updateParticipantTransactionDecided(service.db,
    decidedOf(committed, STATE.COMMITTED));
  releaseReservation(service, committed);
  if (operations.length > 0) {
    advancePartitionWriteGeneration(service.db);
  }
  recordCommittedWriteTraffic(service, committed.afterCommit, operations.length);
  answerProposer(service, committed, {success: true, results: applied.results,
    ...rowAnswer(service, committed.command)});
  scheduleCommitEffects(service, committed, operations, applied.events);
  return OUTCOME.APPLIED;
}

function decideOverPrepared(service, committed, row) {
  const {command} = committed;
  if (!decisionMatchesPreparedRow(command, row)) {
    return consumedRefusal(service, committed, CODE.DECISION_DIGEST_MISMATCH,
      participantOutcomeOf(row));
  }
  if (command.decision === DECISION.COMMIT) {
    return commitPrepared(service, committed, row);
  }
  updateParticipantTransactionDecided(service.db,
    decidedOf(committed, STATE.ROLLED_BACK));
  releaseReservation(service, committed);
  answerProposer(service, committed, {success: true,
    ...rowAnswer(service, command)});
  return OUTCOME.APPLIED;
}

function replayDecision(service, committed, row) {
  answerProposer(service, committed, {success: true, replayed: true,
    ...participantOutcomeOf(row),
    ...(row.state === STATE.COMMITTED ?
      {results: operationResultsOf(service, row)} : {})});
  return OUTCOME.REPLAYED;
}

// A ROLLBACK of a transaction its PREPARE refused: answered not committed from
// the row, which stays REFUSED.
function answerRefusedRollback(service, committed, row) {
  answerProposer(service, committed, {success: true,
    ...participantOutcomeOf(row)});
  return OUTCOME.RECORDED_ONLY;
}

// The first applied terminal stands: the same decision again is replayed from
// the row, any other is a typed conflict; a COMMIT for a refused transaction
// was never prepared, and a ROLLBACK of it is answered not committed.
const DECISION_OVER_STATE = Object.freeze({
  [STATE.PREPARED]: decideOverPrepared,
  [STATE.COMMITTED]: (service, committed, row) =>
    committed.command.decision === DECISION.COMMIT &&
    committed.command.decisionDigest === row.decisionDigest ?
      replayDecision(service, committed, row) :
      consumedRefusal(service, committed, CODE.DECISION_CONFLICT,
        participantOutcomeOf(row)),
  [STATE.ROLLED_BACK]: (service, committed, row) =>
    committed.command.decision === DECISION.ROLLBACK &&
    committed.command.decisionDigest === row.decisionDigest ?
      replayDecision(service, committed, row) :
      consumedRefusal(service, committed, CODE.DECISION_CONFLICT,
        participantOutcomeOf(row)),
  [STATE.REFUSED]: (service, committed, row) =>
    committed.command.decision === DECISION.ROLLBACK ?
      answerRefusedRollback(service, committed, row) :
      alarmRefusal(service, committed, CODE.NOT_PREPARED,
        participantOutcomeOf(row)),
});

// A bound ROLLBACK for a transaction this partition never prepared writes its
// TOMBSTONE (a ROLLED_BACK row with no operations), so a later PREPARE of it
// is terminal; a COMMIT for one is never prepared and writes nothing.
function decideAbsent(service, committed) {
  const {command, index, term} = committed;
  if (command.decision === DECISION.COMMIT) {
    return alarmRefusal(service, committed, CODE.NOT_PREPARED,
      participantOutcomeOf(null));
  }
  insertParticipantTransactionRow(service.db, {
    transactionId: command.transactionId,
    participantId: command.participantId,
    sessionId: command.sessionId,
    commitMode: command.commitMode,
    transactionEpoch: command.transactionEpoch,
    state: STATE.ROLLED_BACK,
    preparedDigest: command.preparedDigest,
    decision: command.decision,
    decisionDigest: command.decisionDigest,
    decisionEntryId: command.entryId,
    decisionIndex: index,
    decisionTerm: term,
  });
  answerProposer(service, committed, {success: true,
    ...rowAnswer(service, command)});
  return OUTCOME.APPLIED;
}

function applyParticipantDecision(service, committed) {
  const {command} = committed;
  const refused = identityRefusalOf(command, service.partitionId) ??
    decisionBindingRefusalOf(command);
  if (refused !== null) {
    return consumedRefusal(service, committed, refused);
  }
  const row = readParticipantTransactionRow(service.db, command);
  if (row === null) {
    return decideAbsent(service, committed);
  }
  if (row.commitMode !== command.commitMode ||
      row.transactionEpoch !== command.transactionEpoch) {
    return consumedRefusal(service, committed, CODE.IDENTITY_MISMATCH,
      participantOutcomeOf(row));
  }
  return DECISION_OVER_STATE[row.state](service, committed, row);
}

// --- PARTICIPANT_GENERATION_ORIGIN (design 0.0.13) ---

// The first origin applied on the partition starts g at 0 at its own log
// position, on every replica alike, whatever any build counted before it; a
// later origin changes nothing (g never revisits a value).
function applyGenerationOrigin(service, committed) {
  const {command, index, term} = committed;
  if (command.partitionId !== service.partitionId) {
    return consumedRefusal(service, committed, CODE.IDENTITY_MISMATCH);
  }
  // The query row owner is installed by the same application transaction as
  // the origin and applied index. A replay repairs a missing enforcer without
  // changing the original origin or write generation.
  if (service.tableName === TABLES.SQL_TRANSACTIONS) {
    installTransactionSchemaEnforcement(service.db);
  }
  const recorded = readPartitionWriteOrigin(service.db);
  if (recorded !== null) {
    answerProposer(service, committed, {success: true, idempotent: true,
      ...recorded});
    return OUTCOME.REPLAYED;
  }
  recordPartitionWriteOrigin(service.db, {index, term});
  committed.afterCommit(() => {
    service.logger.info(LOG_MSG.ORIGIN_RECORDED, {
      partitionId: service.partitionId, originIndex: index, originTerm: term});
  });
  answerProposer(service, committed, {success: true, originIndex: index,
    originTerm: term});
  return OUTCOME.APPLIED;
}

const PARTICIPANT_COMMAND_APPLIERS = Object.freeze({
  [COMMAND.PREPARE]: applyParticipantPrepare,
  [COMMAND.DECISION]: applyParticipantDecision,
  [COMMAND.GENERATION_ORIGIN]: applyGenerationOrigin,
});

function applyParticipantCommand(service, committed) {
  const {command} = committed;
  try {
    if (command.type !== COMMAND.GENERATION_ORIGIN) {
      noteExecutionEnvelope(service, committed);
    }
    return PARTICIPANT_COMMAND_APPLIERS[command.type](service, committed);
  } catch (failure) {
    committed.afterRollback(() =>
      service.rejectCommittedWrite(command.entryId, failure));
    throw failure;
  }
}

/**
 * Apply one committed transaction command inside its application transaction:
 * a participant transaction command; then, as for every applied command,
 * the committed-entry event after the commit. A
 * throw (an environmental failure, a broken invariant) rejects the proposer
 * after the rollback (the write kernel answers it as an unknown outcome) and
 * fails the application closed.
 * @param {Object} service - The partition.
 * @param {Object} committed - {command, index, term, afterCommit,
 *   afterRollback}: the committed record and its effect schedulers.
 * @return {string} A PARTITION_COMMITTED_COMMAND_OUTCOME.
 */
function applyCommittedTransactionCommand(service, committed) {
  const {command} = committed;
  const applied = applyParticipantCommand(service, committed);
  committed.afterCommit(() => service.emit(
    PARTITION_SERVICE_EVENT.ENTRY_COMMITTED,
    {partitionId: service.partitionId, command}));
  return applied;
}

/**
 * The reservation's disposition of a committed SQL statement on a reserved
 * partition (isPartitionReserved; design 4): while some transaction is
 * PREPARED here no other committed statement runs - no statement, no outcome
 * row, g unchanged, the applied index advances. The entry key stays
 * unsettled: when this replica proposed the write it parks it again under
 * the same entryId, re-proposed after the decision; any other proposer
 * waiting here is answered PARTITION_WRITE_LEADERSHIP_REFUSAL.RESERVED, a
 * retryable deferral, so its retry applies once the decision has applied.
 * @param {Object} service - The partition.
 * @param {{command: Object, afterCommit: Function}} committed - The command.
 * @return {string} RESERVED_REFUSED.
 */
function settleReservedCommittedStatement(service, {command, afterCommit}) {
  service.logger.debug(LOG_MSG.WRITE_RESERVED, {
    partitionId: service.partitionId,
    entryId: command.entryId,
    commandType: command.type,
  });
  afterCommit(() => reparkReservedWrite(service, command.entryId) ||
    service.resolveCommittedWrite(command.entryId, {
      success: false,
      error: `${ERRORS.WRITE_RESERVED}${MESSAGE.CODE_SEPARATOR}` +
        MESSAGE.WRITE_RESERVED_DETAIL,
      failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.RESERVED,
      deferRetry: true,
      outcome: OUTCOME.RESERVED_REFUSED,
      entryId: command.entryId,
      partitionId: service.partitionId,
    }));
  return OUTCOME.RESERVED_REFUSED;
}

export {
  applyCommittedTransactionCommand,
  operationResultsOf,
  settleReservedCommittedStatement,
};
