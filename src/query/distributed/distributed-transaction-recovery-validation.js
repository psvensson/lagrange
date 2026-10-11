/**
 * Validation of distributed transaction recovery rows before any coordinator
 * state changes: every non-terminal row must carry a complete, consistent
 * decision state (transaction mode, participant set state, commit mode and
 * frozen participant count) or the recovery is refused typed
 * (TRANSACTION_RECOVERY_INCOMPLETE), never installed. A legacy row naming the
 * retired ONE_PHASE_COMMIT mode fails the commit-mode check like any unknown
 * mode (TX1 prepare-first; its disposition is the cutover's L6 precondition).
 *
 * @module query/distributed/distributed-transaction-recovery-validation
 */

import {
  COMMIT_MODE,
  PARTICIPANT_SET_STATE,
  TRANSACTION_MODE,
} from '../../constants/index.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
} from '../query-constants.js';
import {
  TERMINAL_TRANSACTION_STATUS,
  TRANSACTION_STATUS,
} from './distributed-transaction-coordinator-constants.js';

import {participantIdOf} from './distributed-transaction-identity.js';
import {readParticipantSet} from './distributed-transaction-participant-manifest.js';
import {decisionRecordOfRow, RECORDED_DECISION_STATE} from
  './distributed-transaction-decision-record.js';
import {isCanonicalTransactionEpoch} from '../../constants/transactions.js';

const TRANSACTION_RECOVERY_DIMENSION = Object.freeze({
  DECISION_RECORD: 'decision_record',
  DECISION_PARTICIPANTS: 'decision_participants',
});

const LOCAL_STR_TRANSACTION_MODE = 'transaction_mode';
const LOCAL_STR_TRANSACTIONMODE = 'transactionMode';
const LOCAL_STR_PARTICIPANT_SET_STATE = 'participant_set_state';
const LOCAL_STR_PARTICIPANTSETSTATE = 'participantSetState';
const LOCAL_STR_COMMIT_MODE = 'commit_mode';
const LOCAL_STR_COMMITMODE = 'commitMode';
const LOCAL_STR_FROZEN_PARTICIPANT_COUNT = 'frozen_participant_count';
const LOCAL_STR_FROZENPARTICIPANTCOUNT = 'frozenParticipantCount';

function readTransactionDecisionField(row, snakeKey, camelKey) {
  return Object.prototype.hasOwnProperty.call(row, snakeKey) ?
    row[snakeKey] :
    row[camelKey];
}

function readTransactionDecisionFieldWithActiveLegacyDefault(
  row,
  snakeKey,
  camelKey,
  status,
  legacyDefault,
) {
  const value = readTransactionDecisionField(row, snakeKey, camelKey);
  return value === undefined && status === TRANSACTION_STATUS.ACTIVE ?
    legacyDefault :
    value;
}

function buildRecoveredTransactionDecisionState(row, status) {
  return {
    transactionMode: readTransactionDecisionFieldWithActiveLegacyDefault(
      row,
      LOCAL_STR_TRANSACTION_MODE,
      LOCAL_STR_TRANSACTIONMODE,
      status,
      TRANSACTION_MODE.EXPLICIT,
    ),
    participantSetState:
      readTransactionDecisionFieldWithActiveLegacyDefault(
        row,
        LOCAL_STR_PARTICIPANT_SET_STATE,
        LOCAL_STR_PARTICIPANTSETSTATE,
        status,
        PARTICIPANT_SET_STATE.OPEN,
      ),
    commitMode: readTransactionDecisionFieldWithActiveLegacyDefault(
      row,
      LOCAL_STR_COMMIT_MODE,
      LOCAL_STR_COMMITMODE,
      status,
      COMMIT_MODE.NOT_SELECTED,
    ),
    frozenParticipantCount: Number(
      readTransactionDecisionFieldWithActiveLegacyDefault(
        row,
        LOCAL_STR_FROZEN_PARTICIPANT_COUNT,
        LOCAL_STR_FROZENPARTICIPANTCOUNT,
        status,
        0,
      )),
  };
}

function buildTransactionRecoveryIncompleteError({decisionDimension, row}) {
  const error = new Error(QUERY_ERROR_MSG.TRANSACTION_RECOVERY_INCOMPLETE);
  error.errorCode = QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE;
  const evidenceFields = {
    decisionDimension,
    transactionId: row?.transaction_id ?? row?.transactionId,
    sessionId: row?.session_id ?? row?.sessionId,
  };
  for (const [fieldName, value] of Object.entries(evidenceFields)) {
    if (typeof value === 'string' && value.length > 0) {
      error[fieldName] = value;
    }
  }
  return error;
}

function hasExactDecisionParticipants(tx, decision) {
  const actual = Array.from(tx.participants.keys(), (partitionId) =>
    participantIdOf(tx.transactionId, partitionId)).sort();
  const recorded = decision.participants.map(([id]) => id);
  return actual.length === recorded.length &&
    actual.every((id, index) => id === recorded[index]);
}

function validateRecordedDecisionParticipants(tx, row) {
  if (tx.decision && !hasExactDecisionParticipants(tx, tx.decision)) {
    throw buildTransactionRecoveryIncompleteError({
      decisionDimension: TRANSACTION_RECOVERY_DIMENSION.DECISION_PARTICIPANTS, row});
  }
}

function isOpenDecisionState(tx) {
  return tx.participantSetState === PARTICIPANT_SET_STATE.OPEN &&
    tx.commitMode === COMMIT_MODE.NOT_SELECTED && tx.frozenParticipantCount === 0 &&
    [TRANSACTION_STATUS.ACTIVE, TRANSACTION_STATUS.ROLLING_BACK,
      TRANSACTION_STATUS.FAILED].includes(tx.status);
}

function isFrozenDecisionState(tx) {
  return tx.participantSetState === PARTICIPANT_SET_STATE.FROZEN &&
    tx.commitMode !== COMMIT_MODE.NOT_SELECTED &&
    tx.frozenParticipantCount === tx.participants.size;
}

function validateRecoveredTransactionDecision(tx, row = null) {
  validateRecordedDecisionParticipants(tx, row);
  const transactionModeValid =
    Object.values(TRANSACTION_MODE).includes(tx.transactionMode);
  const participantSetStateValid =
    Object.values(PARTICIPANT_SET_STATE).includes(tx.participantSetState);
  const commitModeValid = Object.values(COMMIT_MODE).includes(tx.commitMode);
  const frozenCountValid = Number.isInteger(tx.frozenParticipantCount) &&
    tx.frozenParticipantCount >= 0;
  if (
    transactionModeValid &&
    participantSetStateValid &&
    commitModeValid &&
    frozenCountValid &&
    (isOpenDecisionState(tx) || isFrozenDecisionState(tx))
  ) {
    return;
  }
  const failedDecisionDimension = !transactionModeValid ?
    LOCAL_STR_TRANSACTION_MODE :
    !participantSetStateValid ?
      LOCAL_STR_PARTICIPANT_SET_STATE :
      !commitModeValid ?
        LOCAL_STR_COMMIT_MODE :
        LOCAL_STR_FROZEN_PARTICIPANT_COUNT;
  throw buildTransactionRecoveryIncompleteError({
    decisionDimension: failedDecisionDimension,
    row,
  });
}

function canonicalNonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
}

function hasCanonicalPersistedTransactionIdentity(row, transactionId) {
  return row.transaction_id === transactionId &&
    typeof row.session_id === 'string' && row.session_id.length > 0 &&
    isCanonicalTransactionEpoch(row.transaction_epoch) &&
    canonicalNonnegativeInteger(row.timeout_deadline) &&
    Object.values(TRANSACTION_MODE).includes(row.transaction_mode) &&
    canonicalNonnegativeInteger(row.created_at) &&
    canonicalNonnegativeInteger(row.updated_at) &&
    row.timeout_deadline >= row.created_at && row.updated_at >= row.created_at;
}

function validatePersistedTransactionRow(row, transactionId) {
  if (!hasCanonicalPersistedTransactionIdentity(row, transactionId) ||
      !Object.values(TRANSACTION_STATUS).includes(row.status) ||
      !Object.values(PARTICIPANT_SET_STATE).includes(row.participant_set_state) ||
      !Object.values(COMMIT_MODE).includes(row.commit_mode) ||
      !canonicalNonnegativeInteger(row.frozen_participant_count)) return null;
  const participantPairs = readParticipantSet(transactionId,
    row.participant_set_text);
  if (participantPairs === null) return null;
  const decision = decisionRecordOfRow(row, transactionId);
  if (decision.state === RECORDED_DECISION_STATE.INVALID) return null;
  const open = row.participant_set_state === PARTICIPANT_SET_STATE.OPEN;
  if (open && (row.commit_mode !== COMMIT_MODE.NOT_SELECTED ||
      row.frozen_participant_count !== 0 ||
      decision.state !== RECORDED_DECISION_STATE.ABSENT ||
      ![TRANSACTION_STATUS.ACTIVE, TRANSACTION_STATUS.ROLLING_BACK,
        TRANSACTION_STATUS.ROLLED_BACK, TRANSACTION_STATUS.FAILED]
        .includes(row.status))) return null;
  if (!open && (row.commit_mode === COMMIT_MODE.NOT_SELECTED ||
      row.frozen_participant_count !== participantPairs.length)) return null;
  if (decision.state === RECORDED_DECISION_STATE.RECORDED &&
      (open || decision.participants.length !== participantPairs.length ||
       decision.participants.some(([participantId], index) =>
         participantId !== participantPairs[index][0]))) return null;
  return Object.freeze({decision, participantPairs});
}

function buildRecoveredParticipantKeysByTransaction(participantRows) {
  const participantKeysByTransaction = new Map();
  for (const row of participantRows) {
    const transactionId = row.transaction_id || row.transactionId;
    const partitionId = row.partition_id || row.partitionId;
    if (!transactionId || !partitionId) {
      continue;
    }
    const keys = participantKeysByTransaction.get(transactionId) || new Set();
    keys.add(partitionId);
    participantKeysByTransaction.set(transactionId, keys);
  }
  return participantKeysByTransaction;
}

function validateRecoveryRowsBeforeMutation(
  coordinator,
  transactionRows,
  participantRows,
  decisionsByTransaction = new Map(),
) {
  const participantKeysByTransaction =
    buildRecoveredParticipantKeysByTransaction(participantRows);
  for (const row of transactionRows) {
    const status = row.status || TRANSACTION_STATUS.FAILED;
    if (TERMINAL_TRANSACTION_STATUS.has(status)) {
      continue;
    }
    const sessionId = row.session_id || row.sessionId;
    const transactionId = row.transaction_id || row.transactionId;
    if (!sessionId || !transactionId) {
      throw buildTransactionRecoveryIncompleteError({
        decisionDimension: null,
        row,
      });
    }
    if (coordinator.workflowCoordinator.getWorkflowById(transactionId)) {
      continue;
    }
    const participantKeys =
      participantKeysByTransaction.get(transactionId) || new Set();
    validateRecoveredTransactionDecision(
      {
        ...buildRecoveredTransactionDecisionState(row, status),
        transactionId,
        decision: decisionsByTransaction.get(transactionId),
        status,
        participants: new Map(
          Array.from(participantKeys, (partitionId) => [partitionId, true]),
        ),
      },
      row,
    );
  }
}

export {
  TRANSACTION_RECOVERY_DIMENSION,
  hasExactDecisionParticipants,
  buildTransactionRecoveryIncompleteError,
  buildRecoveredTransactionDecisionState,
  validateRecoveredTransactionDecision,
  validatePersistedTransactionRow,
  validateRecoveryRowsBeforeMutation,
};
