/** Exact admitted participants in the existing sql_transactions owner row.
 * Append-only while OPEN; the same exact-text CAS closes it before decisions.
 * NULL is unknown legacy authority, never an empty set. */
import {PARTICIPANT_SET_STATE} from '../../constants/index.js';
import {QUERY_ERROR_CODE, QUERY_ERROR_MSG} from '../query-constants.js';
import {participantIdentityOf} from './distributed-transaction-identity.js';
import {buildFrozenTransactionDecision} from './distributed-transaction-commit-mode.js';
import {PARTICIPANT_STATUS} from './distributed-transaction-coordinator-constants.js';

import {participantSetTextOf, readParticipantSet} from
  './distributed-transaction-participant-manifest.js';

function incompleteParticipantSet() {
  const error = new Error(QUERY_ERROR_MSG.TRANSACTION_RECOVERY_INCOMPLETE);
  error.errorCode = QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE;
  return error;
}

const distributedTransactionParticipantSetMethods = {
  async persistAdmittedParticipantSet(tx, intended) {
    try {
      this.noteMetadataMutation?.(tx);
      await this.persistTransactionParticipantSet(intended, tx.participantSetText);
    } catch (error) {
      // Another admission/freeze or a lost answer may own the row. Keep this
      // exact ID on the existing authoritative recovery path, never old bytes.
      tx.recoveryDiscovered = true;
      this.recoveredTransactionIds.add(tx.transactionId);
      throw error;
    }
  },

  async retainParticipantSet(tx, partitionIds) {
    const prior = readParticipantSet(tx.transactionId, tx.participantSetText);
    if (!prior) throw incompleteParticipantSet();
    const text = participantSetTextOf(tx.transactionId,
      [...prior.map((pair) => pair[1]), ...partitionIds]);
    await this.persistAdmittedParticipantSet(tx, {...tx, participantSetText: text});
    tx.participantSetText = text;
    // An admitted identity must survive even if BEGIN or progress persistence
    // fails. Its durable manifest precedes every possible participant request.
    for (const [participantId, partitionId] of readParticipantSet(tx.transactionId, text)) {
      if (!tx.participants.has(partitionId)) {
        tx.participants.set(partitionId, {workflowId: tx.workflowId,
          transactionId: tx.transactionId, participantId, participantKey: partitionId,
          partitionId, status: PARTICIPANT_STATUS.FAILED,
          createdAt: this.now(), updatedAt: this.now()});
      }
    }
  },

  async freezeParticipantSet(tx) {
    const pairs = readParticipantSet(tx.transactionId, tx.participantSetText);
    if (!pairs || pairs.length !== tx.participants.size ||
        pairs.some((pair) => !tx.participants.has(pair[1]))) throw incompleteParticipantSet();
    if (tx.participantSetState === PARTICIPANT_SET_STATE.FROZEN) return;
    const frozen = buildFrozenTransactionDecision({transactionMode: tx.transactionMode,
      participantCount: pairs.length, decidedAt: this.now()});
    await this.persistAdmittedParticipantSet(tx, {...tx, ...frozen});
    Object.assign(tx, frozen);
  },

  async enlistParticipantsOwned(sessionId, partitionIds) {
    const tx = this.transactionsBySession.get(sessionId);
    if (!tx) {
      return {success: false, error: QUERY_ERROR_MSG.NO_ACTIVE_TRANSACTION,
        errorCode: QUERY_ERROR_CODE.NO_TRANSACTION};
    }
    const held = this.recoveryObligationStageRefusal(tx, null);
    if (held) return held;
    if (tx.participantSetState !== PARTICIPANT_SET_STATE.OPEN) {
      return {success: false, error: QUERY_ERROR_MSG.TRANSACTION_PARTICIPANTS_FROZEN,
        errorCode: QUERY_ERROR_CODE.TRANSACTION_PARTICIPANTS_FROZEN};
    }
    const requested = Array.from(new Set(partitionIds || []));
    await this.retainParticipantSet(tx, requested);
    const newlyEnlisted = requested.filter((partitionId) =>
      tx.participants.get(partitionId)?.status !== PARTICIPANT_STATUS.ACTIVE);
    await Promise.all(newlyEnlisted.map(async (partitionId) => {
      const participant = tx.participants.get(partitionId);
      await this.beginParticipant(sessionId, partitionId, participantIdentityOf(tx, partitionId));
      await this.workflowCoordinator.upsertParticipant(tx.workflowId, {
        ...participant, status: PARTICIPANT_STATUS.ACTIVE, lastError: null,
        updatedAt: this.now()});
    }));
    tx.updatedAt = this.now();
    return {success: true, participants: this.getOrderedParticipantIds(tx), newlyEnlisted};
  },
};

export {readParticipantSet, incompleteParticipantSet,
  distributedTransactionParticipantSetMethods};
