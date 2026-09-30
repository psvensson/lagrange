import {deepFreeze} from '../raft/raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from
  '../raft/raft-operation-port-constants.js';

// The one partition-side issuer of a leadership transfer. Whoever asks a
// replica to hand its partition's leadership on - the replica handler's
// source-side handoff and its replacement-target election - asks through
// here, and here only the replica's own consensus port is asked: a request
// in the port's canonical shape ({successor: 'named', replicaIdentity} or
// {successor: 'most-caught-up'}), answered with the port's frozen outcome
// record. Completion is never implied by the answer; it is the port's role
// and leader events. A replica with no port (not yet initialized, or shut
// down) answers a typed, retryable refusal rather than nothing.
const PARTITION_LEADERSHIP_TRANSFER_REFUSAL = Object.freeze({
  NO_CONSENSUS_PORT: 'no-consensus-port',
});

// What a write still deferred by a running transfer when its deferral
// budget runs out is answered with (the write path's retryable deferral).
const PARTITION_LEADERSHIP_TRANSFER_MESSAGE = Object.freeze({
  WRITE_DEFERRED: 'Write deferred: a leadership transfer is in progress',
});

const NO_CONSENSUS_PORT_ANSWER = deepFreeze({
  outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
  reason: PARTITION_LEADERSHIP_TRANSFER_REFUSAL.NO_CONSENSUS_PORT,
  retryable: true,
  recoveryRequired: false,
});

class PartitionServiceLeadershipTransferMethods {
  /**
   * Ask this replica's consensus port to transfer the partition's
   * leadership.
   * @param {Object} successor - {successor, replicaIdentity?}, the port's
   *   canonical transfer request.
   * @return {Object|Promise<Object>} The port's frozen outcome record.
   */
  requestLeadershipTransfer(successor) {
    if (!this.raft) {
      return NO_CONSENSUS_PORT_ANSWER;
    }
    return this.raft.transferLeadership(successor);
  }
}

function createPartitionServiceLeadershipTransferMethods() {
  return {
    requestLeadershipTransfer:
      PartitionServiceLeadershipTransferMethods.prototype
        .requestLeadershipTransfer,
  };
}

export {
  PARTITION_LEADERSHIP_TRANSFER_MESSAGE,
  createPartitionServiceLeadershipTransferMethods,
};
