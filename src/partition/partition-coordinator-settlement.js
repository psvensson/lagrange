// Transport/admission/application of the query owner's fixed existing-row
// commands. The query predicate and fixed CAS remain owned in query; this
// owner supplies consensus ordering, reservation, atomic outcomes and retry.
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {observeTransactionSettlement, applyTransactionSettlement, canonicalTransactionSettlementResult,
  TRANSACTION_SETTLEMENT_OUTCOME as SETTLEMENT} from
  '../query/distributed/distributed-transaction-settlement.js';
import {buildCoordinatorSettlementCommand, isPinnedCoordinatorSettlementCommand} from
  './partition-coordinator-settlement-command.js';
import {COORDINATOR_SETTLEMENT_RESULT as RESULT, COORDINATOR_SETTLEMENT_ERROR as ERROR} from
  './partition-coordinator-settlement-constants.js';
import {admitCommittedCommand, PARTITION_COMMITTED_COMMAND_ORIGIN,
  committedCommandRefusalResult} from './partition-committed-command-admission.js';
import {partitionWriteLeadershipRefusalOf, startPartitionRaftWriteCommit} from
  './partition-service-raft-write-commit.js';
import {readSettledOwnerCommandIn, recordCommittedStatementOutcome} from
  './partition-committed-statement-outcome.js';
import {PARTITION_SETTLED_COMMAND_STATE as SETTLED, committedCommandDigest} from
  './partition-committed-statement-outcome-constants.js';
import {PARTITION_COMMITTED_COMMAND_OUTCOME as APPLY} from './partition-service-constants.js';
import {advancePartitionWriteGeneration, isPartitionReserved} from
  './partition-participant-transaction-store.js';
import {settleReservedCommittedStatement} from './partition-participant-transaction-apply.js';

function refusal(service, failureCode) {
  return {success: false, admitted: false,
    partitionId: service.partitionId, failureCode};
}

function settlementAnswer(service, result, fields = {}) {
  return {success: ![SETTLEMENT.REFUSED, SETTLEMENT.UNAVAILABLE]
    .includes(result.outcome), partitionId: service.partitionId, [RESULT]: result, ...fields};
}

function retainedResult(recorded) {
  if (typeof recorded.ownerResultText !== 'string') throw new Error(ERROR.RESULT);
  const result = canonicalTransactionSettlementResult(JSON.parse(recorded.ownerResultText));
  if (result === null) throw new Error(ERROR.RESULT);
  return result;
}

function recordedAnswer(service, recorded) {
  return settlementAnswer(service, retainedResult(recorded), {committed: true,
    logIndex: recorded.logIndex, term: recorded.term});
}

// The settlement's identity in its outcome record (the outcome owner's digest):
// a record under its entry key settles it only when it carries this digest.
function settlementDigestOf(command) {
  return committedCommandDigest(command.type, command.settlementText);
}

function settledSettlementOf(service, command) {
  return readSettledOwnerCommandIn(service.db,
    {entryId: command.entryId, commandDigest: settlementDigestOf(command)});
}

function requestCoordinatorSettlement(service, payload) {
  if (service.tableName !== SYSTEM_TABLE_NAME.SQL_TRANSACTIONS) {
    return refusal(service, ERROR.TARGET);
  }
  const command = buildCoordinatorSettlementCommand(service, payload.settlement);
  if (command === null) return refusal(service, ERROR.BYTES);
  const leadership = partitionWriteLeadershipRefusalOf(service);
  if (leadership !== null) return leadership;
  const admission = admitCommittedCommand(command,
    {origin: PARTITION_COMMITTED_COMMAND_ORIGIN.COORDINATOR_OWNER});
  if (!admission.admitted) {
    return committedCommandRefusalResult(admission, service.partitionId);
  }
  const settled = settledSettlementOf(service, command);
  if (settled.state === SETTLED.SAME_COMMAND) return recordedAnswer(service, settled.recorded);
  if (settled.state === SETTLED.OTHER_RECORD) return refusal(service, ERROR.BYTES);
  const pending = service.getPendingCommittedWriteOutcome(command.entryId);
  if (pending !== null) return pending;
  const observed = observeTransactionSettlement(service.db, command.settlement);
  if (observed.outcome !== SETTLEMENT.READY) {
    return settlementAnswer(service, observed, {admitted: false});
  }
  return startPartitionRaftWriteCommit(service, {entry: command, phaseTimings: null,
    applyStartMs: service.timeSource.now(), park: isPartitionReserved(service.db)});
}

function applyCoordinatorSettlement(service, committed) {
  const {command, index, term, afterCommit, afterRollback} = committed;
  if (service.tableName !== SYSTEM_TABLE_NAME.SQL_TRANSACTIONS ||
      command.partitionId !== service.partitionId ||
      !isPinnedCoordinatorSettlementCommand(command)) {
    throw new Error(ERROR.BYTES);
  }
  const entryKey = service.getCommittedEntryKey(command);
  const settled = settledSettlementOf(service, command);
  // Another record under this entry: fails the application closed, the same
  // verdict on every replica (the record is replicated state).
  if (settled.state === SETTLED.OTHER_RECORD) throw new Error(ERROR.BYTES);
  if (settled.state === SETTLED.SAME_COMMAND) {
    const answer = recordedAnswer(service, settled.recorded);
    afterCommit(() => service.resolveCommittedWrite(command.entryId, answer));
    return APPLY.REPLAYED;
  }
  if (isPartitionReserved(service.db)) {
    return settleReservedCommittedStatement(service, {command, afterCommit});
  }
  try {
    const result = canonicalTransactionSettlementResult(
      applyTransactionSettlement(service.db, command.settlement));
    if (result === null) throw new Error(ERROR.RESULT);
    recordCommittedStatementOutcome(service, {entryKey, outcome: APPLY.APPLIED, index, term,
      ownerResultText: JSON.stringify(result), commandDigest: settlementDigestOf(command)});
    if (result.outcome === SETTLEMENT.APPLIED) advancePartitionWriteGeneration(service.db);
    afterCommit(() => service.resolveCommittedWrite(command.entryId,
      settlementAnswer(service, result, {committed: true, logIndex: index, term})));
    return APPLY.APPLIED;
  } catch (error) {
    afterRollback(() => service.rejectCommittedWrite(command.entryId, error));
    throw error;
  }
}

export {requestCoordinatorSettlement, applyCoordinatorSettlement};
