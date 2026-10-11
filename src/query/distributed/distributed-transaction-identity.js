/**
 * The identity of a coordinator-managed transaction and of each of its
 * participants (TX1 design revision 10, section 2.1; seam items A and B/S).
 *
 * A transactionId is 128 random bits (32 lowercase hex characters) minted by
 * the coordinator. Nothing in it comes from the node, the boot incarnation,
 * a sequence, the session or a clock: two coordinators on one node mint
 * distinct identities, and a collision of the random bits is refused by the
 * insert-once row's primary key, never assumed impossible. Only that
 * confirmed collision re-mints.
 *
 * A participant is `<transactionId>:<partitionId>` (the participant's own
 * identity rule; its separator is the participant owner's). Every request to
 * a participant - BEGIN, a session statement, PREPARE, a decision and an
 * outcome read - carries the same identity fields: the sessionId is routing
 * context only, never the selector.
 *
 * @module query/distributed/distributed-transaction-identity
 */

import {randomBytes} from 'node:crypto';
import {COMMIT_MODE} from '../../constants/index.js';
import {participantIdOf} from
  '../../partition/partition-participant-transaction-bytes.js';
import {TRANSACTION_ID_COLLISION_CODE} from
  './distributed-transaction-coordinator-constants.js';

const TRANSACTION_ID_BYTES = 16;
const TRANSACTION_ID_ENCODING = 'hex';

/**
 * Mint one transaction identity: 128 random bits.
 * @return {string} 32 lowercase hex characters.
 */
function mintTransactionId() {
  return randomBytes(TRANSACTION_ID_BYTES).toString(TRANSACTION_ID_ENCODING);
}

/**
 * The identity fields one request to a participant carries.
 * @param {Object} tx - The transaction ({sessionId, transactionId,
 *   transactionEpoch, commitMode}).
 * @param {string} partitionId - The participant partition.
 * @param {string} [commitMode] - The mode the request names (BEGIN and
 *   session statements name NOT_SELECTED; PREPARE, a decision and an outcome
 *   read the selected mode).
 * @return {Object} {sessionId, transactionId, participantId, commitMode,
 *   transactionEpoch}.
 */
function participantIdentityOf(tx, partitionId, commitMode = tx?.commitMode) {
  return Object.freeze({
    sessionId: tx?.sessionId ?? null,
    transactionId: tx?.transactionId,
    participantId: participantIdOf(tx?.transactionId, partitionId),
    commitMode,
    transactionEpoch: tx?.transactionEpoch,
  });
}

/**
 * The identity a session statement of an open transaction carries to every
 * participant partition it reaches; the request builder adds the
 * participantId of the partition it builds the request for.
 * @param {Object} tx - The transaction.
 * @return {Object} {transactionId, commitMode, transactionEpoch}.
 */
function statementTransactionIdentityOf(tx) {
  return Object.freeze({
    transactionId: tx.transactionId,
    commitMode: COMMIT_MODE.NOT_SELECTED,
    transactionEpoch: tx.transactionEpoch,
  });
}

/**
 * The participant identity fields of a session statement for one partition.
 * @param {Object} statementIdentity - statementTransactionIdentityOf().
 * @param {string} partitionId - The partition the statement reaches.
 * @return {Object} {transactionId, participantId, commitMode,
 *   transactionEpoch}.
 */
function statementParticipantFieldsOf(statementIdentity, partitionId) {
  return {
    transactionId: statementIdentity.transactionId,
    participantId: participantIdOf(statementIdentity.transactionId,
      partitionId),
    commitMode: statementIdentity.commitMode,
    transactionEpoch: statementIdentity.transactionEpoch,
  };
}

/**
 * Whether a failed insert-once write of the transaction row is the
 * confirmed primary-key collision of its minted identity (the one class
 * that re-mints).
 * @param {*} error - What the persistence callback threw.
 * @return {boolean}
 */
function isTransactionIdCollision(error) {
  return (error?.code ?? error?.errorCode) === TRANSACTION_ID_COLLISION_CODE;
}

export {
  isTransactionIdCollision,
  mintTransactionId,
  participantIdOf,
  participantIdentityOf,
  statementParticipantFieldsOf,
  statementTransactionIdentityOf,
};
