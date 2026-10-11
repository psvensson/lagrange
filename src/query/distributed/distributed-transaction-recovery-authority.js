/** A discovered ID is an obligation, not an execution snapshot. Restore its
 * authority from the existing transaction row under the request FIFO. */
import {COMMIT_MODE, PARTICIPANT_SET_STATE, TRANSACTION_MODE} from '../../constants/transactions.js';
import {readParticipantSet} from './distributed-transaction-participant-set.js';
import {decisionRecordOfRow, RECORDED_DECISION_STATE, isRecordedDecision} from
  './distributed-transaction-decision.js';
import {hasExactDecisionParticipants} from './distributed-transaction-recovery-validation.js';
import {PARTICIPANT_STATUS, TRANSACTION_STATUS, TRANSACTION_DECISION_RECORDING} from
  './distributed-transaction-coordinator-constants.js';
import {PARTICIPANT_TRANSACTION_DECISION as DECISION} from
  '../../partition/partition-participant-transaction-constants.js';
import {QUERY_OPERATION} from '../query-constants.js';

const TRANSACTION_AUTHORITY_STATE = Object.freeze({
  AVAILABLE: 'available', MISSING: 'missing', UNAVAILABLE: 'unavailable',
  INVALID: 'invalid', LEGACY: 'legacy_participant_set',
});

function restoredParticipants(tx, pairs, rows) {
  if (!Array.isArray(rows)) return null;
  const byId = new Map();
  for (const row of rows) {
    if (row.transaction_id !== tx.transactionId || byId.has(row.participant_id) ||
        !pairs.some(([id, partition]) => id === row.participant_id &&
          partition === row.partition_id)) return null;
    byId.set(row.participant_id, row);
  }
  return new Map(pairs.map(([participantId, partitionId]) => {
    const row = byId.get(participantId);
    const retained = row?.status === PARTICIPANT_STATUS.PREPARED &&
      typeof row.prepared_digest === 'string' && row.prepared_digest.length > 0 &&
      Number.isSafeInteger(row.prepare_index) && row.prepare_index > 0 &&
      Number.isSafeInteger(row.prepare_term) && row.prepare_term > 0;
    return [partitionId, {workflowId: tx.workflowId, transactionId: tx.transactionId,
      participantId, partitionKey: partitionId, participantKey: partitionId, partitionId,
      // A progress hint never suppresses an exact decision re-drive.
      status: retained ? PARTICIPANT_STATUS.PREPARED : PARTICIPANT_STATUS.FAILED,
      preparedDigest: retained ? row.prepared_digest : null,
      prepareIndex: retained ? row.prepare_index : null,
      prepareTerm: retained ? row.prepare_term : null,
      prepareEvidenceRetained: retained,
      createdAt: row?.created_at ?? tx.createdAt, updatedAt: row?.updated_at ?? tx.updatedAt}];
  }));
}

function authorityCandidate(tx, payload) {
  const row = payload?.transaction;
  if (row?.transaction_id !== tx.transactionId || row.session_id !== tx.sessionId ||
      !Number.isSafeInteger(row.transaction_epoch) || row.transaction_epoch < 0 ||
      !Number.isFinite(row.timeout_deadline) || row.timeout_deadline < 0 ||
      !Object.values(TRANSACTION_MODE).includes(row.transaction_mode)) return null;
  const pairs = readParticipantSet(tx.transactionId, row.participant_set_text);
  const participants = pairs && restoredParticipants(tx, pairs, payload.participants);
  if (!participants) return null;
  const frozen = row.participant_set_state === PARTICIPANT_SET_STATE.FROZEN;
  if ((!frozen && row.participant_set_state !== PARTICIPANT_SET_STATE.OPEN) ||
      row.commit_mode !== (frozen ? COMMIT_MODE.TWO_PHASE_COMMIT : COMMIT_MODE.NOT_SELECTED) ||
      row.frozen_participant_count !== (frozen ? pairs.length : 0)) return null;
  const record = decisionRecordOfRow(row, tx.transactionId);
  if (record.state === RECORDED_DECISION_STATE.INVALID ||
      (isRecordedDecision(record) && !frozen) || (tx.decision &&
        (!isRecordedDecision(record) || tx.decision.decisionText !== record.decisionText ||
          tx.decision.decisionDigest !== record.decisionDigest))) return null;
  const candidate = {...tx, participants, transactionEpoch: row.transaction_epoch,
    transactionMode: row.transaction_mode, timeoutDeadline: row.timeout_deadline,
    participantSetState: row.participant_set_state, participantSetText: row.participant_set_text,
    commitMode: row.commit_mode, frozenParticipantCount: row.frozen_participant_count,
    decision: isRecordedDecision(record) ? record : null, decisionReadState: record.state,
    status: frozen ? TRANSACTION_STATUS.PREPARING : TRANSACTION_STATUS.ACTIVE};
  return candidate.decision && !hasExactDecisionParticipants(candidate, candidate.decision) ?
    null : candidate;
}

async function refreshRecoveryAuthority(coordinator, tx) {
  let payload;
  try {
    payload = await coordinator.readTransactionRecoveryState?.(tx.transactionId);
  } catch (error) {
    coordinator.logger?.warn?.('Transaction authority read unavailable', {
      transactionId: tx.transactionId, error: error?.message});
  }
  if (payload?.state !== TRANSACTION_AUTHORITY_STATE.AVAILABLE) {
    tx.decisionReadState = payload?.state ?? TRANSACTION_AUTHORITY_STATE.UNAVAILABLE;
    return false;
  }
  const candidate = authorityCandidate(tx, payload);
  if (!candidate) {
    tx.decisionReadState = payload.transaction?.participant_set_text == null ?
      TRANSACTION_AUTHORITY_STATE.LEGACY : TRANSACTION_AUTHORITY_STATE.INVALID;
    return false;
  }
  Object.assign(tx, candidate);
  return true;
}

async function redriveAuthoritativeRecovery(coordinator, tx) {
  const held = () => ({path: null, result: coordinator.buildDecisionInDoubtResult(tx)});
  if (!await refreshRecoveryAuthority(coordinator, tx)) return held();
  if (!tx.decision) {
    const prepared = tx.participantSetState === PARTICIPANT_SET_STATE.FROZEN &&
      Array.from(tx.participants.values()).every((participant) =>
        participant.prepareEvidenceRetained === true);
    if (!prepared && !coordinator.isTransactionBudgetExceeded(tx)) return held();
    try {
      await coordinator.freezeParticipantSet(tx);
    } catch (error) {
      coordinator.logger?.warn?.('Transaction recovery freeze unresolved', {
        transactionId: tx.transactionId, error: error?.message});
      return held();
    }
    if (await coordinator.recordTransactionDecision(tx, prepared ? DECISION.COMMIT :
      DECISION.ROLLBACK) !== TRANSACTION_DECISION_RECORDING.RECORDED) return held();
  }
  const commit = tx.decision.decision === DECISION.COMMIT;
  const result = commit ? await coordinator.completeCommitDecision(tx) :
    await coordinator.completeRollbackDecision(tx);
  if (result.success === true) {
    tx.recoveryDiscovered = false;
    coordinator.recoveredTransactionIds.delete(tx.transactionId);
  }
  return {path: commit ? QUERY_OPERATION.COMMIT : QUERY_OPERATION.ROLLBACK, result};
}

export {TRANSACTION_AUTHORITY_STATE, redriveAuthoritativeRecovery};
