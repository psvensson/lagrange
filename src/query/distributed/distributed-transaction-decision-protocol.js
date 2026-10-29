/**
 * The decision protocol of the distributed transaction coordinator (TX1
 * design revision 10, sections 2.3, 2.4, 4 and 11.2; owner decisions
 * 2026-10-10: prepare-first, query retains persistence, decisions, wire
 * behaviour and recovery).
 *
 * Every coordinator-managed transaction prepares before its decision, a
 * single participant included (the ONE_PHASE_COMMIT fast path is retired).
 * Each participant's positive PREPARE evidence (prepared digest, index,
 * term) is retained on its durable participant row before the decision is
 * recorded. The decision is one insert-once record written before any
 * decision fanout; a coordinator that does not land it follows the decision
 * recorded first, and with neither it fans out nothing (in doubt).
 *
 * After a COMMIT decision the transaction only moves forward: no budget,
 * lost answer or participant failure rolls it back, it never becomes FAILED
 * and it is never prepared again; the caller learns the commit point was
 * reached and recovery completes it. A ROLLBACK reaches a participant bound
 * to its recorded decision whenever a PREPARE may have been sent to the
 * transaction; an unbound ROLLBACK only discards volatile staging that no
 * PREPARE was sent for.
 *
 * @module query/distributed/distributed-transaction-decision-protocol
 */

import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_OPERATION,
} from '../query-constants.js';
import {
  PARTICIPANT_TRANSACTION_DECISION,
  PARTICIPANT_TRANSACTION_REFUSAL_CAUSE,
} from '../../partition/partition-participant-transaction-constants.js';
import {releaseTransactionReservations} from
  '../../partition/partition-locking-read-reservation.js';
import {
  PARTICIPANT_STATUS,
  TRANSACTION_DECISION_LOG_MSG,
  TRANSACTION_DECISION_RECORDING,
  TRANSACTION_STATUS,
} from './distributed-transaction-coordinator-constants.js';
import {
  adoptRecordedTransactionDecision,
  participantDecisionBindingOf,
  recordTransactionDecision,
} from './distributed-transaction-decision.js';
import {participantIdentityOf} from './distributed-transaction-identity.js';
import {COMMIT_POINT_REACHED_FIELD} from
  './distributed-transaction-commit-point.js';
import {reportTransactionBudgetSpent} from
  './distributed-transaction-protocol.js';
import {completePrepareEvidenceOf} from
  './distributed-transaction-prepare-evidence.js';

const {COMMIT, ROLLBACK} = PARTICIPANT_TRANSACTION_DECISION;
const PREPARE_SENT_TRANSACTION_STATUS = Object.freeze(new Set([
  TRANSACTION_STATUS.PREPARING,
  TRANSACTION_STATUS.PREPARED,
]));

/**
 * Retain what a participant's PREPARE resolved with on its participant
 * record (persisted with the PREPARED status, before any decision).
 * @param {Object} participant - The participant record.
 * @param {*} answer - The participant's PREPARE evidence.
 */
function retainPrepareEvidence(participant, answer) {
  const evidence = completePrepareEvidenceOf(answer);
  if (evidence === null) {
    const error = new Error(QUERY_ERROR_MSG.PARTICIPANT_ANSWER_UNTYPED);
    error.errorCode = QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE;
    throw error;
  }
  Object.assign(participant, evidence);
  participant.prepareEvidenceRetained = false;
}

function rolledBackCommitFailure(preparation) {
  if (preparation?.timedOut === true) {
    return {errorCode: QUERY_ERROR_CODE.TIMEOUT,
      error: QUERY_ERROR_MSG.QUERY_TIMEOUT};
  }
  const conflicted = (preparation?.failedParticipants || []).some((entry) =>
    entry.refusalCause === PARTICIPANT_TRANSACTION_REFUSAL_CAUSE.CONFLICT);
  return conflicted ?
    {errorCode: QUERY_ERROR_CODE.TRANSACTION_CONFLICT,
      error: QUERY_ERROR_MSG.TRANSACTION_CONFLICT} :
    {errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
      error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE};
}

function endTransaction(coordinator, tx) {
  if (coordinator.transactionsBySession.get(tx.sessionId) === tx) {
    coordinator.transactionsBySession.delete(tx.sessionId);
    coordinator.endedTransactions?.record(tx);
  }
  releaseTransactionReservations(tx.transactionId);
}

const distributedTransactionDecisionProtocolMethods = {
  /**
   * Record the transaction's decision once (see
   * distributed-transaction-decision.js).
   * @param {Object} tx - Transaction state.
   * @param {string} decision - COMMIT or ROLLBACK.
   * @return {Promise<string>} A TRANSACTION_DECISION_RECORDING state.
   */
  async recordTransactionDecision(tx, decision) {
    return recordTransactionDecision(this, tx, decision);
  },

  /**
   * Run the prepare stage over every participant whose PREPARE evidence is
   * not retained, retaining what each answered.
   * @param {Object} tx - Transaction state.
   * @param {Object} options - {skipBudgetEnforcement}.
   * @return {Promise<Object[]>} Failed participant entries.
   */
  async runPrepareStage(tx, options = {}) {
    const participantKeys = this.getPrepareParticipantKeys(tx);
    if (participantKeys.length === 0 && tx.participants.size > 0) {
      return [];
    }
    return this.executeParticipantStage(
      tx,
      PARTICIPANT_STATUS.PREPARING,
      PARTICIPANT_STATUS.PREPARED,
      async (partitionId, participant) => retainPrepareEvidence(participant,
        await this.prepareParticipant(tx.sessionId, partitionId,
          participantIdentityOf(tx, partitionId))),
      {
        participantKeys,
        skipBudgetEnforcement: options.skipBudgetEnforcement === true,
      },
    );
  },

  /**
   * Prepare every participant and say which decision the evidence allows:
   * COMMIT only when every participant's PREPARE resolved, ROLLBACK when any
   * failed or the budget is spent before the decision.
   * @param {Object} tx - Transaction state.
   * @param {Object} options - {recovering}.
   * @return {Promise<Object>} {decision, stage, failedParticipants,
   *   timedOut}.
   */
  async prepareForDecision(tx, options = {}) {
    const recovering = options.recovering === true;
    const timedOut = () => {
      reportTransactionBudgetSpent(this, tx, tx.status);
      return {decision: ROLLBACK, stage: tx.status, failedParticipants: [],
        timedOut: true};
    };
    if (!recovering && this.isTransactionBudgetExceeded(tx)) {
      return timedOut();
    }
    if (!PREPARE_SENT_TRANSACTION_STATUS.has(tx.status)) {
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.PREPARING);
    }
    const failedParticipants = await this.runPrepareStage(tx,
      {skipBudgetEnforcement: recovering});
    if (failedParticipants.length > 0) {
      return {decision: ROLLBACK, stage: TRANSACTION_STATUS.PREPARING,
        failedParticipants,
        timedOut: this.hasTimeoutFailure(failedParticipants)};
    }
    if (!recovering && this.isTransactionBudgetExceeded(tx)) {
      return timedOut();
    }
    if (tx.status !== TRANSACTION_STATUS.PREPARED) {
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.PREPARED);
    }
    return {decision: COMMIT, stage: TRANSACTION_STATUS.PREPARED,
      failedParticipants: [], timedOut: false};
  },

  /**
   * Drive one transaction through the commit protocol: prepare-first, the
   * insert-once decision, then the decision's fanout. A transaction that
   * already holds a recorded decision only drives it.
   * @param {Object} tx - Transaction state.
   * @param {Object} [options] - {allowTimedOutCommitStatuses}: recovery's
   *   re-drive, whose budget is already spent.
   * @return {Promise<Object>} Commit result.
   */
  async runCommitProtocol(tx, options = {}) {
    const recovering = options.allowTimedOutCommitStatuses === true;
    if (!tx.decision && (tx.status === TRANSACTION_STATUS.COMMITTING ||
        tx[COMMIT_POINT_REACHED_FIELD])) {
      // COMMITTING proves a decision may exist, never what it contains.
      if (await adoptRecordedTransactionDecision(this, tx) !==
          TRANSACTION_DECISION_RECORDING.RECORDED) {
        return this.buildDecisionInDoubtResult(tx);
      }
    }
    if (tx.decision) {
      return this.driveTransactionDecision(tx, null);
    }
    const preparation = await this.prepareForDecision(tx, {recovering});
    if (await this.recordTransactionDecision(tx, preparation.decision) !==
        TRANSACTION_DECISION_RECORDING.RECORDED) {
      return this.buildDecisionInDoubtResult(tx);
    }
    return this.driveTransactionDecision(tx, preparation);
  },

  /**
   * Fan out the recorded decision.
   * @param {Object} tx - Transaction state (its recorded decision).
   * @param {Object|null} preparation - What prepareForDecision found, when
   *   this coordinator prepared the transaction.
   * @return {Promise<Object>} Commit result.
   */
  async driveTransactionDecision(tx, preparation) {
    if (tx.decision.decision === COMMIT) {
      return this.completeCommitDecision(tx);
    }
    const rollback = await this.completeRollbackDecision(tx);
    return {
      success: false,
      operation: QUERY_OPERATION.COMMIT,
      transactionId: tx.transactionId,
      participants: this.getOrderedParticipantIds(tx),
      failedParticipants: preparation?.failedParticipants || [],
      rollbackFailedParticipants: rollback.failedParticipants || [],
      stage: preparation?.stage ?? tx.status,
      ...rolledBackCommitFailure(preparation),
    };
  },

  /**
   * Complete a recorded COMMIT: the commit point is reached, every
   * participant not yet COMMITTED is sent the COMMIT bound to the decision,
   * and a failure leaves the transaction COMMITTING for recovery.
   * @param {Object} tx - Transaction state.
   * @return {Promise<Object>} Commit result.
   */
  async completeCommitDecision(tx) {
    if (tx.status !== TRANSACTION_STATUS.COMMITTING) {
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.COMMITTING);
    }
    const participantKeys = this.getCommitParticipantKeys(tx);
    const failedParticipants =
      participantKeys.length === 0 && tx.participants.size > 0 ? [] :
        await this.executeParticipantStage(
          tx,
          PARTICIPANT_STATUS.COMMITTING,
          PARTICIPANT_STATUS.COMMITTED,
          (partitionId) => this.commitParticipant(tx.sessionId, partitionId, {
            ...participantIdentityOf(tx, partitionId),
            ...participantDecisionBindingOf(tx, partitionId),
          }),
          {participantKeys, skipBudgetEnforcement: true},
        );
    if (failedParticipants.length > 0) {
      this.reportRefusedCommitDecision(tx, failedParticipants);
      return {
        ...this.buildParticipantFailureResult(
          tx,
          QUERY_OPERATION.COMMIT,
          TRANSACTION_STATUS.COMMITTING,
          failedParticipants,
        ),
        deferred: true,
        commitMode: tx.commitMode,
      };
    }
    await this.setTransactionStatus(tx, TRANSACTION_STATUS.COMMITTED);
    endTransaction(this, tx);
    return {
      success: true,
      operation: QUERY_OPERATION.COMMIT,
      transactionId: tx.transactionId,
      participants: this.getOrderedParticipantIds(tx),
      transactionMode: tx.transactionMode,
      commitMode: tx.commitMode,
      decisionTrace: tx.decisionTrace.map((entry) => ({...entry})),
    };
  },

  /**
   * A participant that answered a recorded COMMIT with a definitive refusal
   * is an atomicity alarm: it is reported, and the transaction stays
   * COMMITTING (the decision stands).
   * @param {Object} tx - Transaction state.
   * @param {Object[]} failedParticipants - The commit stage's failures.
   */
  reportRefusedCommitDecision(tx, failedParticipants) {
    const refused = failedParticipants.filter((entry) =>
      typeof entry.failureCode === 'string' && entry.failureCode.length > 0);
    if (refused.length > 0) {
      this.logger?.error?.(
        TRANSACTION_DECISION_LOG_MSG.COMMIT_REFUSED_BY_PARTICIPANT, {
          transactionId: tx.transactionId,
          refused,
        });
    }
  },

  /**
   * Complete a recorded ROLLBACK: every participant not yet ROLLED_BACK is
   * sent the ROLLBACK bound to the decision.
   * @param {Object} tx - Transaction state.
   * @return {Promise<Object>} Rollback result.
   */
  async completeRollbackDecision(tx) {
    return this.runRollbackStage(tx, (partitionId) => ({
      ...participantIdentityOf(tx, partitionId),
      ...participantDecisionBindingOf(tx, partitionId),
    }));
  },

  /**
   * Roll back across every participant not yet ROLLED_BACK.
   * @param {Object} tx - Transaction state.
   * @param {Function} requestOf - The request one participant's ROLLBACK
   *   carries.
   * @return {Promise<Object>} Rollback result.
   */
  async runRollbackStage(tx, requestOf) {
    if (tx.status !== TRANSACTION_STATUS.ROLLING_BACK) {
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.ROLLING_BACK);
    }
    const rollbackFailures = await this.executeParticipantStage(
      tx,
      PARTICIPANT_STATUS.ROLLING_BACK,
      PARTICIPANT_STATUS.ROLLED_BACK,
      (partitionId) => this.rollbackParticipant(tx.sessionId, partitionId,
        requestOf(partitionId)),
      {participantKeys: this.getRollbackParticipantKeys(tx)},
    );
    if (rollbackFailures.length > 0) {
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.ROLLING_BACK);
    } else {
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.ROLLED_BACK);
      endTransaction(this, tx);
    }
    return {
      success: rollbackFailures.length === 0,
      operation: QUERY_OPERATION.ROLLBACK,
      transactionId: tx.transactionId,
      participants: this.getOrderedParticipantIds(tx),
      failedParticipants: rollbackFailures,
      errorCode:
        rollbackFailures.length > 0 ?
          QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE :
          undefined,
      error:
        rollbackFailures.length > 0 ?
          QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE :
          undefined,
    };
  },

  /**
   * Roll one transaction back. A transaction whose COMMIT is decided is
   * never rolled back. The exact admitted set is frozen and ROLLBACK is
   * recorded insert-once before its fanout (a COMMIT recorded first is
   * followed instead). Bound rollback tombstones late admitted requests.
   * @param {Object} tx - Transaction state.
   * @return {Promise<Object>} Rollback result.
   */
  async runRollbackProtocol(tx) {
    if (!tx.decision && (tx.status === TRANSACTION_STATUS.COMMITTING ||
        tx[COMMIT_POINT_REACHED_FIELD]) &&
        await adoptRecordedTransactionDecision(this, tx) !==
          TRANSACTION_DECISION_RECORDING.RECORDED) {
      return {...this.buildDecisionInDoubtResult(tx),
        operation: QUERY_OPERATION.ROLLBACK};
    }
    if (!tx.decision) await this.freezeParticipantSet(tx);
    if (!tx.decision &&
        await this.recordTransactionDecision(tx, ROLLBACK) !==
          TRANSACTION_DECISION_RECORDING.RECORDED) {
      return {...this.buildDecisionInDoubtResult(tx),
        operation: QUERY_OPERATION.ROLLBACK};
    }
    if (tx.decision?.decision === COMMIT) {
      await this.completeCommitDecision(tx);
      return {
        success: false,
        operation: QUERY_OPERATION.ROLLBACK,
        transactionId: tx.transactionId,
        participants: this.getOrderedParticipantIds(tx),
        failedParticipants: [],
        errorCode: QUERY_ERROR_CODE.TRANSACTION_COMMIT_DECIDED,
        error: QUERY_ERROR_MSG.TRANSACTION_COMMIT_DECIDED,
      };
    }
    if (tx.decision) {
      return this.completeRollbackDecision(tx);
    }
    return this.runRollbackStage(tx, (partitionId) =>
      participantIdentityOf(tx, partitionId));
  },

  /**
   * The answer when no decision could be established: nothing was fanned
   * out, the transaction keeps its status for recovery, and the caller
   * cannot be told it did not commit.
   * @param {Object} tx - Transaction state.
   * @return {Object} The failure result.
   */
  buildDecisionInDoubtResult(tx) {
    return {
      success: false,
      operation: QUERY_OPERATION.COMMIT,
      transactionId: tx.transactionId,
      participants: this.getOrderedParticipantIds(tx),
      failedParticipants: [],
      stage: tx.status,
      deferred: true,
      decisionReadState: tx.decisionReadState,
      errorCode: QUERY_ERROR_CODE.TRANSACTION_DECISION_IN_DOUBT,
      error: QUERY_ERROR_MSG.TRANSACTION_DECISION_IN_DOUBT,
    };
  },
};

export {distributedTransactionDecisionProtocolMethods};
