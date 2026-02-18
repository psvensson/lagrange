import LifeRaft from '@markwylde/liferaft';
import {NUM, TYPEOF} from '../constants/index.js';

const LIFERAFT_PROVIDER_ERROR_MSG = Object.freeze({
  MISSING_COMMAND_API: 'raft node does not support command()',
});

/**
 * Liferaft-backed provider implementation for Raft node creation.
 */
class LiferaftProvider {
  /**
   * @param {Object} context
   * @param {boolean} context.deferElection
   * @param {Object} context.logger
   * @param {string} context.replicaId
   * @param {Function} context.resolvePeerAddress
   * @param {Function} context.deliverPacket
   * @return {Function}
   */
  createNodeClass(context) {
    const resolvePeerAddress = context.resolvePeerAddress;
    const deliverPacket = context.deliverPacket;

    class ProviderRaftNode extends LifeRaft {
      /**
       * @param {*} _options
       * @param {Function} callback
       */
      initialize(_options, callback) {
        if (callback) {
          callback();
        }
      }

      /**
       * @param {Object} packet
       * @param {Function} callback
       */
      write(packet, callback) {
        const peerAddress = resolvePeerAddress(this.address);
        deliverPacket(peerAddress, packet)
          .then((result) => callback(null, result))
          .catch((error) => callback(error));
      }
    }

    return ProviderRaftNode;
  }

  /**
   * Propose a command on the raft node.
   * @param {Object} raftNode
   * @param {*} command
   * @param {Function} callback
   */
  propose(raftNode, command, callback) {
    if (!raftNode || typeof raftNode.command !== TYPEOF.FUNCTION) {
      throw new Error(LIFERAFT_PROVIDER_ERROR_MSG.MISSING_COMMAND_API);
    }
    raftNode.command(command, callback);
  }

  /**
   * Join one peer address to the raft node.
   * @param {Object} raftNode
   * @param {string} peerAddress
   */
  joinPeer(raftNode, peerAddress) {
    if (!raftNode || typeof raftNode.join !== TYPEOF.FUNCTION) {
      return;
    }
    raftNode.join(peerAddress);
  }

  /**
   * Start election timer for multi-replica groups.
   * @param {Object} raftNode
   */
  startElectionTimer(raftNode) {
    if (!raftNode ||
      typeof raftNode.heartbeat !== TYPEOF.FUNCTION ||
      typeof raftNode.timeout !== TYPEOF.FUNCTION) {
      return;
    }
    raftNode.heartbeat(raftNode.timeout());
  }

  /**
   * Clear liferaft timers.
   * @param {Object} raftNode
   * @param {string} [timerName]
   */
  clearTimers(raftNode, timerName) {
    if (!raftNode ||
      !raftNode.timers ||
      typeof raftNode.timers.clear !== TYPEOF.FUNCTION) {
      return;
    }
    if (typeof timerName === TYPEOF.STRING) {
      raftNode.timers.clear(timerName);
      return;
    }
    raftNode.timers.clear();
  }

  /**
   * Shutdown raft node and clear timers.
   * @param {Object} raftNode
   */
  shutdownNode(raftNode) {
    this.clearTimers(raftNode);
    if (raftNode && typeof raftNode.end === TYPEOF.FUNCTION) {
      raftNode.end();
    }
  }

  /**
   * Get current raft term from node.
   * @param {Object} raftNode
   * @return {number}
   */
  getCurrentTerm(raftNode) {
    const term = raftNode ? raftNode.term : null;
    return Number.isFinite(term) ? term : NUM.ZERO;
  }

  /**
   * Get committed index from raft node log.
   * @param {Object} raftNode
   * @return {number}
   */
  getCommittedIndex(raftNode) {
    const committedIndex = raftNode?.log?.committedIndex;
    return Number.isFinite(committedIndex) ? committedIndex : NUM.ZERO;
  }
}

export {LiferaftProvider};
