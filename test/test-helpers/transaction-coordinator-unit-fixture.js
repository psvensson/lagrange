/**
 * Coordinator unit fixture with the real PREPARED answer shape. An optional
 * prepare hook observes or fails the request; a successful hook returning no
 * answer still represents a positive PREPARE and gets complete evidence.
 * Wire rejection tests use the engine/participant fixtures instead.
 */
import {DistributedTransactionCoordinator} from
  '../../src/query/distributed/distributed-transaction-coordinator.js';
import {buildDecisionRecord} from
  '../../src/partition/partition-participant-transaction-bytes.js';
import {answerParticipantTransactionRequest, preparedDigestOf} from
  './participant-protocol-double.js';

function createTestTransactionCoordinator(options = {}) {
  return new DistributedTransactionCoordinator({...options,
    prepareParticipant: async (...args) => {
      const answer = await options.prepareParticipant?.(...args);
      return answer ?? answerParticipantTransactionRequest({operation: 'PREPARE',
        ...args[2]});
    }});
}

function recordedCommit(transactionId, partitionIds) {
  return buildDecisionRecord(transactionId, 'COMMIT',
    partitionIds.map((partitionId) => {
      const participantId = `${transactionId}:${partitionId}`;
      return [participantId, preparedDigestOf(participantId)];
    }));
}

export {createTestTransactionCoordinator, recordedCommit};
