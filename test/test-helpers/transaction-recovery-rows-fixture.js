/**
 * The one fixture for durable transaction recovery rows: the
 * sql_transactions row of a FROZEN two-phase transaction and its participant
 * rows, built through the owners (participant identity, admitted-set
 * manifest, decision record), plus the authoritative reader a recovering
 * coordinator re-reads them through. Tests vary the shape with `overrides`;
 * they never restate it.
 */
import {buildTransactionDecisionRecord} from
  '../../src/query/distributed/distributed-transaction-decision.js';
import {participantSetTextOf} from
  '../../src/query/distributed/distributed-transaction-participant-manifest.js';
import {participantIdOf} from
  '../../src/query/distributed/distributed-transaction-identity.js';

const RECOVERY_PREPARE_EVIDENCE = Object.freeze({preparedDigest: 'b'.repeat(64),
  prepareIndex: 3, prepareTerm: 1});

/**
 * The decision columns of a recorded decision over `partitions`, each
 * prepared with RECOVERY_PREPARE_EVIDENCE.
 * @param {string} transactionId
 * @param {string[]} partitions
 * @param {string} [decision]
 * @return {{decision: string, decision_text: string, decision_digest: string}}
 */
function recoveryDecisionColumns(transactionId, partitions, decision = 'COMMIT') {
  const record = buildTransactionDecisionRecord({transactionId,
    participants: new Map(partitions.map((partitionId) => [partitionId,
      {partitionId, ...RECOVERY_PREPARE_EVIDENCE}]))}, decision);
  return {decision: record.decision, decision_text: record.decisionText,
    decision_digest: record.decisionDigest};
}

/**
 * Recovery rows of one transaction: FROZEN, prepared and undecided unless
 * `overrides` say otherwise.
 * @param {Object} spec - {transactionId, sessionId, partitions,
 *   participantPartitions, participantStatus, prepared, overrides}.
 * @return {{transactions: Object[], participants: Object[],
 *   writeOperations: Object[]}}
 */
function recoveryRowsOf({transactionId, sessionId, partitions = ['p1'],
  participantPartitions = partitions, participantStatus = 'PREPARED',
  prepared = true, overrides = {}}) {
  return {
    transactions: [{transaction_id: transactionId, session_id: sessionId,
      status: 'PREPARED', transaction_epoch: 7, timeout_deadline: 1,
      transaction_mode: 'EXPLICIT', participant_set_state: 'FROZEN',
      participant_set_text: participantSetTextOf(transactionId, partitions),
      commit_mode: 'TWO_PHASE_COMMIT', frozen_participant_count: partitions.length,
      created_at: 1, updated_at: 2, ...overrides}],
    participants: participantPartitions.map((partitionId) => ({
      transaction_id: transactionId,
      participant_id: participantIdOf(transactionId, partitionId),
      partition_id: partitionId, status: participantStatus,
      prepared_digest: prepared ? RECOVERY_PREPARE_EVIDENCE.preparedDigest : null,
      prepare_index: prepared ? RECOVERY_PREPARE_EVIDENCE.prepareIndex : null,
      prepare_term: prepared ? RECOVERY_PREPARE_EVIDENCE.prepareTerm : null,
      created_at: 1, updated_at: 1})),
    writeOperations: [],
  };
}

/**
 * Wire `coordinator.readTransactionRecoveryState` to answer from a durable
 * copy of `authority` (the discovery rows and the authoritative row are
 * distinct inputs), then discover `rows`.
 * @param {Object} coordinator - A DistributedTransactionCoordinator.
 * @param {Object} rows - Discovery rows (recoveryRowsOf).
 * @param {Object} [authority] - The authoritative rows (default `rows`).
 * @return {void}
 */
function discoverWithAuthority(coordinator, rows, authority = rows) {
  const durable = structuredClone(authority);
  coordinator.readTransactionRecoveryState = async (id) => {
    const transaction = durable.transactions.find((row) =>
      row.transaction_id === id);
    return transaction ? {state: 'available', transaction,
      participants: durable.participants.filter((row) =>
        row.transaction_id === id)} : {state: 'missing'};
  };
  coordinator.recoverFromSystemTables(rows);
}

export {
  RECOVERY_PREPARE_EVIDENCE,
  discoverWithAuthority,
  recoveryDecisionColumns,
  recoveryRowsOf,
};
