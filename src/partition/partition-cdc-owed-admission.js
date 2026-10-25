// Admission of work that can add durable CDC debt. The ledger supplies the
// count; preflight and committed application ask the same predicate. Committed
// pressure is consumed without SQL effects so later acknowledgements can drain.
import {ERRORS} from '../constants/errors.js';
import {isTableCdcObligationRecorded} from '../cache/cdc-table-policy.js';
import {PARTITION_SPLIT_MIRROR_ORIGIN} from './partition-constants.js';
import {isCommittedSqlCommandType} from './partition-committed-command-admission.js';
import {PARTITION_COMMITTED_COMMAND_OUTCOME as OUTCOME,
  PARTITION_SERVICE_OPERATION} from './partition-service-constants.js';
import {PARTITION_CDC_COMMAND, PARTITION_CDC_OBLIGATION_BOUND as BOUND} from
  './partition-cdc-obligation-constants.js';
import {countCdcObligations} from './partition-cdc-obligation-ledger.js';
import {PARTICIPANT_TRANSACTION_COMMAND, PARTICIPANT_TRANSACTION_STATE} from './partition-participant-transaction-constants.js';
import {decisionMatchesPreparedRow, operationsOf} from './partition-participant-transaction-bytes.js';
import {readParticipantTransactionRow} from './partition-participant-transaction-store.js';
import {PROPOSAL_QUEUE_ADMISSION_CLASS} from './proposal-queue-constants.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from './partition-write-kernel.js';

const PARTITION_CDC_ADMISSION_STATE = Object.freeze({ADMITTED: 'admitted', REFUSED: 'refused'});
const ADMITTED = Object.freeze({state: PARTITION_CDC_ADMISSION_STATE.ADMITTED});

const CAPACITY_REFUSAL = Object.freeze({
  TEMPORARY: Object.freeze({failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.CDC_CAPACITY,
    error: ERRORS.WRITE_CDC_CAPACITY, deferRetry: true}),
  UNSATISFIABLE: Object.freeze({
    failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.CDC_DEMAND_EXCEEDS_CAPACITY,
    error: ERRORS.WRITE_CDC_DEMAND_EXCEEDS_CAPACITY, deferRetry: false}),
});

const DRAIN_CLASS = Object.freeze({ACKNOWLEDGEMENT: 'cdc-acknowledgement',
  PREPARED_DECISION: 'prepared-decision'});
const PARTITION_DRAIN_CAPACITIES = Object.freeze({
  [DRAIN_CLASS.ACKNOWLEDGEMENT]: BOUND.ACK_MAX_OUTSTANDING_BATCHES,
  [DRAIN_CLASS.PREPARED_DECISION]: 1,
});

// Existing participant state is authoritative even at capacity. A new PREPARE
// reserves the whole batch through the existing exclusive PREPARED reservation.
function requiredCdcSlots(service, command) {
  if (!isTableCdcObligationRecorded(service.tableName)) return 0;
  if (command.type === PARTICIPANT_TRANSACTION_COMMAND.PREPARE) {
    if (readParticipantTransactionRow(service.db, command) !== null) return 0;
    // Malformed operations remain the participant validation owner's refusal.
    return operationsOf(command.operationsText)?.length ?? 0;
  }
  if (!isCommittedSqlCommandType(command.type) ||
      command.type === PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE ||
      command.splitMirrorOrigin === PARTITION_SPLIT_MIRROR_ORIGIN.SNAPSHOT) return 0;
  return 1;
}

function capacityRefusal(service, command, refusal) {
  return {state: PARTITION_CDC_ADMISSION_STATE.REFUSED, answer: {success: false, ...refusal,
    entryId: command.entryId, partitionId: service.partitionId}};
}

/** The same conservative ledger budget before proposal and before data effects. */
function admitCdcOwedWork(service, command) {
  const required = requiredCdcSlots(service, command);
  if (required === 0) return ADMITTED;
  if (required > BOUND.OWED_MAX_EVENTS) {
    return capacityRefusal(service, command, CAPACITY_REFUSAL.UNSATISFIABLE);
  }
  const {owed} = countCdcObligations(service.db);
  return owed + required <= BOUND.OWED_MAX_EVENTS ? ADMITTED :
    capacityRefusal(service, command, CAPACITY_REFUSAL.TEMPORARY);
}

/** Consume pressure without settling the entry identity or blocking Raft apply. */
function settleCdcOwedRefusal(service, {command, afterCommit}, refusal) {
  afterCommit(() => service.resolveCommittedWrite(command.entryId, {
    ...refusal,
    outcome: OUTCOME.RECORDED_ONLY,
  }));
  return OUTCOME.RECORDED_ONLY;
}

/** Only ACKs and a decision bound to the exact held PREPARED row may drain. */
function cdcDrainAdmissionClass(service, command) {
  if (command.type === PARTITION_CDC_COMMAND.DELIVERED) return DRAIN_CLASS.ACKNOWLEDGEMENT;
  if (command.type !== PARTICIPANT_TRANSACTION_COMMAND.DECISION) {
    return PROPOSAL_QUEUE_ADMISSION_CLASS.ORDINARY;
  }
  const row = readParticipantTransactionRow(service.db, command);
  return row?.state === PARTICIPANT_TRANSACTION_STATE.PREPARED &&
    decisionMatchesPreparedRow(command, row) ? DRAIN_CLASS.PREPARED_DECISION :
    PROPOSAL_QUEUE_ADMISSION_CLASS.ORDINARY;
}

export {PARTITION_CDC_ADMISSION_STATE, PARTITION_DRAIN_CAPACITIES, admitCdcOwedWork,
  cdcDrainAdmissionClass,
  settleCdcOwedRefusal};
