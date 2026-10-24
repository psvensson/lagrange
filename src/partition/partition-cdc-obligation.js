// The committed-entry CDC hook and the committed CDC_DELIVERED application
// (TX1 design revision 10, section 8.3; receipt 8). Two things
// run here, both inside the application transaction of a committed entry
// (raft-rs-application-transaction-owner.js), on every replica alike:
//
// - recordCommittedOperationCdc: the CDC events of a committed participant
//   decision's data effects are built as of this commit, by the CDC
//   generator over the rows the operations just wrote, and recorded as owed
//   obligations in the ledger (partition-cdc-obligation-ledger.js) in the
//   SAME transaction as the rows, the per-operation outcomes, the row's move
//   to COMMITTED and the applied index. Nothing is emitted here: after the
//   commit the leader's CDC delivery owner drives the owed obligations. This
//   replaces the after-commit emission a crash could lose (design 8.3,
//   "Today").
// - applyCdcAcknowledgementCommand: a committed CDC_DELIVERED marks the owed
//   events it names delivered, idempotently, then reclaims the delivered
//   prefix into the ledger's compact progress (decision D1); a position at or
//   below that prefix is a replay of a delivered event (answered as such,
//   never as unknown), while an event the ledger never recorded, or filed
//   under another entry than the one that owes it, refuses the whole command
//   without a write and raises an alarm (a bug path, since the delivery owner
//   acknowledges only what it read from this ledger). The command moves
//   neither g nor any outcome row.
//
// It also composes the acknowledgement proposer for the delivery lane (see
// partition-cdc-obligation-delivery.js): a CDC_DELIVERED is proposed under
// its deterministic entryId through the write commit owner, exactly as a
// participant command is, and never parked by a reservation.

import {
  PARTITION_COMMITTED_COMMAND_OUTCOME as OUTCOME,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_OPERATION as OPERATION,
} from './partition-service-constants.js';
import {
  partitionWriteLeadershipRefusalOf,
  startPartitionRaftWriteCommit,
} from './partition-service-raft-write-commit.js';
import {PARTITION_SPLIT_MIRROR_ORIGIN} from './partition-constants.js';
import {operationOutcomeKeyOf} from './partition-participant-transaction-bytes.js';
import {PARTITION_CDC_EVENT_BUILD_STATE} from './partition-cdc-generator.js';
import {
  PARTITION_CDC_COMMAND_TYPES,
  PARTITION_CDC_OBLIGATION_FAILURE_CODE as CODE,
  PARTITION_CDC_OBLIGATION_LOG_MSG as LOG_MSG,
  PARTITION_CDC_OBLIGATION_MESSAGE as MESSAGE,
  PARTITION_CDC_OBLIGATION_REASON as REASON,
  PARTITION_CDC_OBLIGATION_STANDING as STANDING,
} from './partition-cdc-obligation-constants.js';
import {
  acknowledgedGroupsOf,
  cdcObligationEventKeyDigest,
  ensureCdcObligationLedger,
  insertCdcObligation,
  markCdcObligationDelivered,
  readCdcObligationProgress,
  readCdcObligationStanding,
  reclaimDeliveredCdcObligations,
} from './partition-cdc-obligation-ledger.js';
import {registerCdcAcknowledgementProposer} from
  './partition-cdc-obligation-delivery.js';
import {eventCdcSourceScope} from '../cdc/cdc-source-scope-evidence.js';
import {CDC_PIPELINE_METRIC} from '../constants/cdc-lifecycle-constants.js';
import {isTableCdcObligationRecorded} from '../cache/cdc-table-policy.js';

/**
 * @param {*} type - A command's type.
 * @return {boolean} Whether it is this owner's committed command.
 */
function isCdcCommandType(type) {
  return PARTITION_CDC_COMMAND_TYPES.includes(type);
}

// --- the committed-entry CDC hook ---

// Whether a committed write on this partition owes a CDC obligation at all:
// the policy owner's recording rule over the table the partition holds
// (owner decision D2). It is a pure function of code and the partition's
// table identity, so every replica records the same rows at the same entry;
// no event is built and no row is read for a table that owes nothing.
function partitionOwesCdc(service) {
  return isTableCdcObligationRecorded(service.tableName);
}

// The write entry the CDC generator reads one applied operation as: the
// operation's statement and params, the decision's stamp (its HLC is the
// event's timestamp, part of the command bytes) and the operation's result.
function operationEntryOf(command, operation, result) {
  return {
    type: OPERATION.QUERY,
    sql: operation.sql,
    params: operation.params,
    entryId: operation.entryId,
    sessionId: command.sessionId,
    timestamp: command.timestamp,
    proposedBy: command.proposedBy,
    proposedAt: command.proposedAt,
    changes: result?.changes,
  };
}

/**
 * Capture one operation before a later operation can replace its row version.
 * This is synchronous application work; no subscriber or after-commit effect
 * is scheduled until all operations and their application transaction succeed.
 * @param {Object} service - The partition.
 * @param {Object} committed - The exact committed decision.
 * @param {Object} applied - {operation, result, ordinal}.
 * @return {Object|null} Immutable owed row, or no event for a no-op.
 */
function captureCommittedOperationCdc(service, committed, {operation, result, ordinal}) {
  if (!partitionOwesCdc(service)) return null;
  const {command, index, term} = committed;
  const built = service.syncCDCGeneratorDependencies().buildEvent(
    operationEntryOf(command, operation, result),
    {suppressNoOpWrite: true, sourceReplica: command.proposedBy});
  if (built.state !== PARTITION_CDC_EVENT_BUILD_STATE.BUILT) {
    return null;
  }
  const sourceScope = eventCdcSourceScope(service);
  return Object.freeze({
    eventKey: operationOutcomeKeyOf(command.participantId, ordinal),
    logIndex: index,
    term,
    ordinal,
    entryId: command.entryId,
    eventJson: JSON.stringify({...built.cdcEvent,
      ...(sourceScope === null ? {} : {sourceScope})}),
  });
}

/**
 * Record an ordinary statement's notification at its own committed position.
 * Physical snapshot rows transfer state and are not new logical mutations.
 * @param {Object} service - The partition.
 * @param {Object} committed - {command, index, term, afterCommit}.
 * @param {Object} applied - {entryKey, result}.
 * @return {number} Number of notifications retained.
 */
function recordCommittedStatementCdc(service, committed, {entryKey, result}) {
  const {command, index, term} = committed;
  if (command.splitMirrorOrigin === PARTITION_SPLIT_MIRROR_ORIGIN.SNAPSHOT) return 0;
  if (!partitionOwesCdc(service)) return 0;
  const built = service.syncCDCGeneratorDependencies().buildEvent(
    {...command, changes: result.changes},
    {suppressNoOpWrite: true, sourceReplica: command.proposedBy});
  if (built.state !== PARTITION_CDC_EVENT_BUILD_STATE.BUILT) return 0;
  const sourceScope = eventCdcSourceScope(service);
  return recordCommittedOperationCdc(service, committed, [{eventKey: entryKey,
    logIndex: index, term, ordinal: 0, entryId: command.entryId,
    eventJson: JSON.stringify({...built.cdcEvent,
      ...(sourceScope === null ? {} : {sourceScope})})}]);
}

/**
 * Retain captured payloads in the same application transaction and schedule
 * their delivery only after it commits. A rolled-back operation batch never
 * calls this function or leaves an observable effect behind.
 * @param {Object} service - The partition.
 * @param {Object} committed - {command, index, afterCommit}.
 * @param {Array<Object>} events - The successfully captured obligation rows.
 * @return {number} Number of obligations recorded.
 */
function recordCommittedOperationCdc(service, committed, events) {
  const {command, index} = committed;
  const recorded = partitionOwesCdc(service) ? events.length : 0;
  if (recorded === 0) {
    return recorded;
  }
  ensureCdcObligationLedger(service.db);
  for (const event of events) insertCdcObligation(service.db, event);
  committed.afterCommit(() => {
    for (let ordinal = 0; ordinal < recorded; ordinal += 1) {
      service.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_GENERATED);
    }
    service.logger.debug(LOG_MSG.RECORDED, {
      partitionId: service.partitionId,
      entryId: command.entryId,
      logIndex: index,
      obligations: recorded,
    });
    if (service.isLeader && !service.isShutdown) {
      service.trackPendingCDCEvent(
        service.cdcDelivery.driveCdcObligations(REASON.COMMITTED_ENTRY));
    }
  });
  return recorded;
}

// --- the committed CDC_DELIVERED ---

function answerProposer(service, committed, answer) {
  const {command} = committed;
  committed.afterCommit(() => service.resolveCommittedWrite(command.entryId, {
    partitionId: service.partitionId,
    entryId: command.entryId,
    ...answer,
  }));
}

// Consumed without a write, alike on every replica, and raised as an alarm.
function refuseAcknowledgement(service, committed, failureCode, fields = {}) {
  service.logger.error(LOG_MSG.ACKNOWLEDGEMENT_ALARM, {
    partitionId: service.partitionId,
    entryId: committed.command.entryId,
    failureCode,
    ...fields,
  });
  answerProposer(service, committed, {
    success: false,
    error: `${MESSAGE.COMMAND_REFUSED}${MESSAGE.CODE_SEPARATOR}${failureCode}`,
    failureCode,
    ...fields,
  });
  return OUTCOME.RECORDED_ONLY;
}

// Every positional member is judged before any row moves, by the ledger's one
// delivered predicate: a position at or below the reclaimed prefix is a
// replay of a delivered event; otherwise exactly one retained row at that
// position with the named fixed-size key digest, or the first refusal. The
// UNIQUE position constraint makes resolution deterministic; no caller-sized
// durable ID enters the ACK.
function acknowledgementJudgementOf(service, groups) {
  const owed = [];
  const deliveredEarlier = [];
  let reclaimedEarlier = 0;
  for (const group of groups) {
    for (const event of group.events) {
      const {standing, row} = readCdcObligationStanding(service.db,
        {logIndex: group.logIndex, ordinal: event.ordinal});
      if (standing === STANDING.RECLAIMED) {
        reclaimedEarlier += 1;
        continue;
      }
      if (standing === STANDING.UNKNOWN) {
        return {refusal: {failureCode: CODE.UNKNOWN_EVENT, logIndex: group.logIndex,
          ordinal: event.ordinal, positionMatches: 0}};
      }
      if (cdcObligationEventKeyDigest(row.eventKey) !== event.eventKeyDigest) {
        return {refusal: {failureCode: CODE.POSITION_MISMATCH,
          logIndex: group.logIndex, ordinal: event.ordinal}};
      }
      (standing === STANDING.DELIVERED ? deliveredEarlier : owed).push(row.eventKey);
    }
  }
  return {owed, alreadyDelivered: deliveredEarlier, reclaimedEarlier};
}

/**
 * Apply one committed CDC_DELIVERED inside its application transaction:
 * every owed event it names is marked delivered at this entry's position;
 * one already delivered, retained or reclaimed, is left as it is (a replay is
 * idempotent); then the delivered prefix is reclaimed into the compact
 * progress. A command naming another partition, an unknown position above the
 * reclaimed prefix or the wrong event digest at a position is refused whole,
 * typed, without a write.
 * @param {Object} service - The partition.
 * @param {Object} committed - {command, index, term, afterCommit,
 *   afterRollback}.
 * @return {string} A PARTITION_COMMITTED_COMMAND_OUTCOME: APPLIED when a
 *   flag moved, REPLAYED when every named event was already delivered,
 *   RECORDED_ONLY when refused.
 */
function applyCdcAcknowledgementCommand(service, committed) {
  const {command, index, term} = committed;
  committed.afterCommit(() => service.emit(
    PARTITION_SERVICE_EVENT.ENTRY_COMMITTED,
    {partitionId: service.partitionId, command}));
  if (command.partitionId !== service.partitionId) {
    return refuseAcknowledgement(service, committed, CODE.IDENTITY_MISMATCH);
  }
  const groups = acknowledgedGroupsOf(command);
  if (groups === null) {
    return refuseAcknowledgement(service, committed, CODE.BYTES_INVALID);
  }
  const judged = acknowledgementJudgementOf(service, groups);
  if (judged.refusal) {
    return refuseAcknowledgement(service, committed,
      judged.refusal.failureCode, judged.refusal);
  }
  for (const eventKey of judged.owed) {
    markCdcObligationDelivered(service.db, eventKey, {index, term});
  }
  const reclaimed = reclaimDeliveredCdcObligations(service.db, {index, term});
  const settled = [...judged.owed, ...judged.alreadyDelivered];
  const progress = readCdcObligationProgress(service.db);
  committed.afterCommit(() => {
    service.cdcDelivery.settleAcknowledgedObligations(settled, progress);
    service.logger.debug(LOG_MSG.ACKNOWLEDGEMENT_APPLIED, {
      partitionId: service.partitionId,
      entryId: command.entryId,
      logIndex: index,
      delivered: judged.owed.length,
      alreadyDelivered: judged.alreadyDelivered.length,
      alreadyReclaimed: judged.reclaimedEarlier,
      reclaimed,
    });
  });
  answerProposer(service, committed, {
    success: true,
    delivered: judged.owed.length,
    alreadyDelivered: judged.alreadyDelivered.length + judged.reclaimedEarlier,
    alreadyReclaimed: judged.reclaimedEarlier,
    reclaimed,
    logIndex: index,
    ...(judged.owed.length === 0 ? {idempotent: true} : {}),
  });
  return judged.owed.length === 0 ? OUTCOME.REPLAYED : OUTCOME.APPLIED;
}

// --- the acknowledgement proposer (the delivery lane's) ---

// A CDC_DELIVERED is proposed on the leader, under its deterministic entryId,
// through the write commit owner (a retry of the same batch joins its pending
// answer); a replica that may not propose answers the write kernel's typed
// leadership refusal and proposes nothing.
async function proposeCdcAcknowledgement(service, command) {
  const refusal = partitionWriteLeadershipRefusalOf(service);
  if (refusal !== null) {
    return refusal;
  }
  const pending = service.getPendingCommittedWriteOutcome(command.entryId);
  if (pending !== null) {
    return pending;
  }
  return startPartitionRaftWriteCommit(service, {
    entry: command,
    phaseTimings: null,
    applyStartMs: service.timeSource.now(),
  });
}

registerCdcAcknowledgementProposer(proposeCdcAcknowledgement);

export {
  applyCdcAcknowledgementCommand,
  captureCommittedOperationCdc,
  isCdcCommandType,
  proposeCdcAcknowledgement,
  recordCommittedOperationCdc,
  recordCommittedStatementCdc,
};
