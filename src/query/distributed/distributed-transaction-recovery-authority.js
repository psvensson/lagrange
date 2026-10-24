/** A discovered ID is an obligation, not an execution snapshot. Restore its
 * authority from the existing transaction row under the request FIFO. */
import {isCanonicalTransactionEpoch, PARTICIPANT_SET_STATE} from
  '../../constants/transactions.js';
import {readParticipantSet} from './distributed-transaction-participant-set.js';
import {decisionRecordOfRow, RECORDED_DECISION_STATE, isRecordedDecision} from
  './distributed-transaction-decision.js';
import {validateRecoveredTransactionDecision} from
  './distributed-transaction-recovery-validation.js';
import {PARTICIPANT_STATUS, TRANSACTION_STATUS, TRANSACTION_DECISION_RECORDING} from
  './distributed-transaction-coordinator-constants.js';
import {PARTICIPANT_TRANSACTION_DECISION as DECISION} from
  '../../partition/partition-participant-transaction-constants.js';
import {QUERY_OPERATION} from '../query-constants.js';
import {completePrepareEvidenceOf} from
  './distributed-transaction-prepare-evidence.js';

const RECOVERY_AUTHORITY_LOG_MSG = Object.freeze({
  READ_UNAVAILABLE: 'Transaction authority read unavailable',
  FREEZE_UNRESOLVED: 'Transaction recovery freeze unresolved',
});

const TRANSACTION_AUTHORITY_STATE = Object.freeze({
  AVAILABLE: 'available', MISSING: 'missing', UNAVAILABLE: 'unavailable',
  INVALID: 'invalid', LEGACY: 'legacy_participant_set',
  // No authoritative read has answered for this obligation yet.
  NOT_READ: 'not_read',
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
    const evidence = completePrepareEvidenceOf({
      preparedDigest: row?.prepared_digest,
      prepareIndex: row?.prepare_index,
      prepareTerm: row?.prepare_term,
    });
    const retained = row?.status === PARTICIPANT_STATUS.PREPARED &&
      evidence !== null;
    return [partitionId, {workflowId: tx.workflowId, transactionId: tx.transactionId,
      participantId, partitionKey: partitionId, participantKey: partitionId, partitionId,
      // A progress hint never suppresses an exact decision re-drive.
      status: retained ? PARTICIPANT_STATUS.PREPARED : PARTICIPANT_STATUS.FAILED,
      preparedDigest: retained ? evidence.preparedDigest : null,
      prepareIndex: retained ? evidence.prepareIndex : null,
      prepareTerm: retained ? evidence.prepareTerm : null,
      prepareEvidenceRetained: retained,
      createdAt: row?.created_at ?? tx.createdAt, updatedAt: row?.updated_at ?? tx.updatedAt}];
  }));
}

// What an AVAILABLE authoritative read establishes: the restored candidate,
// or the named state that holds it (a row without the admitted-set column is
// legacy authority, any other refusal is invalid).
function authorityCandidate(tx, payload) {
  const row = payload.transaction;
  const refused = {state: row?.participant_set_text == null ?
    TRANSACTION_AUTHORITY_STATE.LEGACY : TRANSACTION_AUTHORITY_STATE.INVALID};
  if (row?.transaction_id !== tx.transactionId || row.session_id !== tx.sessionId ||
      !isCanonicalTransactionEpoch(row.transaction_epoch) ||
      !Number.isFinite(row.timeout_deadline) || row.timeout_deadline < 0) return refused;
  const pairs = readParticipantSet(tx.transactionId, row.participant_set_text);
  const participants = pairs && restoredParticipants(tx, pairs, payload.participants);
  if (!participants) return refused;
  const frozen = row.participant_set_state === PARTICIPANT_SET_STATE.FROZEN;
  const record = decisionRecordOfRow(row, tx.transactionId);
  if (record.state === RECORDED_DECISION_STATE.INVALID ||
      (isRecordedDecision(record) && !frozen) || (tx.decision &&
        (!isRecordedDecision(record) || tx.decision.decisionText !== record.decisionText ||
          tx.decision.decisionDigest !== record.decisionDigest))) return refused;
  const candidate = {...tx, participants, transactionEpoch: row.transaction_epoch,
    transactionMode: row.transaction_mode, timeoutDeadline: row.timeout_deadline,
    participantSetState: row.participant_set_state, participantSetText: row.participant_set_text,
    commitMode: row.commit_mode, frozenParticipantCount: row.frozen_participant_count,
    decision: isRecordedDecision(record) ? record : null, decisionReadState: record.state,
    status: frozen ? TRANSACTION_STATUS.PREPARING : TRANSACTION_STATUS.ACTIVE};
  try {
    validateRecoveredTransactionDecision(candidate, row);
  } catch {
    // The one recovered-decision validator refuses the restored state.
    return refused;
  }
  return {state: TRANSACTION_AUTHORITY_STATE.AVAILABLE, candidate};
}

async function readRecoveryAuthority(coordinator, tx) {
  let payload;
  try {
    payload = await coordinator.readTransactionRecoveryState?.(tx.transactionId);
  } catch (error) {
    coordinator.logger?.warn?.(RECOVERY_AUTHORITY_LOG_MSG.READ_UNAVAILABLE, {
      transactionId: tx.transactionId, error: error?.message});
  }
  return payload?.state === TRANSACTION_AUTHORITY_STATE.AVAILABLE ?
    authorityCandidate(tx, payload) :
    {state: payload?.state ?? TRANSACTION_AUTHORITY_STATE.UNAVAILABLE};
}

async function refreshRecoveryAuthority(coordinator, tx) {
  const authority = await readRecoveryAuthority(coordinator, tx);
  if (authority.state !== TRANSACTION_AUTHORITY_STATE.AVAILABLE) {
    tx.decisionReadState = authority.state;
    return false;
  }
  Object.assign(tx, authority.candidate);
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
      coordinator.logger?.warn?.(RECOVERY_AUTHORITY_LOG_MSG.FREEZE_UNRESOLVED, {
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
