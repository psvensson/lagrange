import LifeRaft from '@markwylde/liferaft';
import {NUM, TYPEOF} from '../constants/index.js';

const LIFERAFT_PROVIDER_ERROR_MSG = Object.freeze({
  MISSING_COMMAND_API: 'raft node does not support command()',
  MISSING_FORWARD_HANDLER:
    'proposeWithLeaderRouting requires forwardToLeader() when not leader',
  PROPOSE_TIMEOUT: 'raft command timed out',
});

const LIFERAFT_ROUTE_MODE = Object.freeze({
  PROPOSE: 'propose',
  FORWARD: 'forward',
});

const LIFERAFT_PROPOSE_TIMEOUT_DEFAULT_MS = 1200;

function resolveProposeTimeoutMs(options = {}) {
  const timeoutMs = Number.isFinite(options.proposeTimeoutMs) &&
    options.proposeTimeoutMs > NUM.ZERO ?
    Math.floor(options.proposeTimeoutMs) :
    LIFERAFT_PROPOSE_TIMEOUT_DEFAULT_MS;
  return timeoutMs;
}

function awaitWithTimeout(promise, timeoutMs, timeoutMessage) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= NUM.ZERO) {
    return Promise.resolve(promise);
  }
  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timeoutHandle);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
  });
}

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
    try {
      const proposalPromise = Promise.resolve(raftNode.command(command));
      if (typeof callback === TYPEOF.FUNCTION) {
        proposalPromise
          .then(() => callback(null))
          .catch((error) => callback(error));
      }
      return proposalPromise;
    } catch (error) {
      if (typeof callback === TYPEOF.FUNCTION) {
        callback(error);
      }
      throw error;
    }
  }

  /**
   * Propose one command with built-in leader routing and bounded retries.
   * When the local raft node is leader, command() is used directly.
   * Otherwise, command forwarding is delegated through forwardToLeader().
   * @param {Object} raftNode
   * @param {*} command
   * @param {Object} [options]
   * @param {Function} [options.forwardToLeader] - async (command, meta) => void
   * @param {number} [options.maxAttempts=1]
   * @param {Function} [options.computeRetryDelayMs] - (attempt) => ms
   * @param {Function} [options.onRetry] - ({attempt, mode, retryDelayMs, error}) => void
   * @param {number} [options.proposeTimeoutMs] - Max time for one command() call.
   * @return {Promise<{attempt:number, mode:string}>}
   */
  async proposeWithLeaderRouting(raftNode, command, options = {}) {
    const maxAttempts = Number.isInteger(options.maxAttempts) &&
      options.maxAttempts > NUM.ZERO ?
      options.maxAttempts :
      NUM.ONE;
    const proposeTimeoutMs = resolveProposeTimeoutMs(options);
    let attempt = NUM.ONE;
    let lastError = null;
    let lastMode = LIFERAFT_ROUTE_MODE.PROPOSE;

    while (attempt <= maxAttempts) {
      const isLeader = raftNode && raftNode.state === LifeRaft.LEADER;
      const mode = isLeader ?
        LIFERAFT_ROUTE_MODE.PROPOSE :
        LIFERAFT_ROUTE_MODE.FORWARD;
      lastMode = mode;
      try {
        if (mode === LIFERAFT_ROUTE_MODE.PROPOSE) {
          const timeoutMessage =
            `${LIFERAFT_PROVIDER_ERROR_MSG.PROPOSE_TIMEOUT} after ${proposeTimeoutMs}ms`;
          await awaitWithTimeout(
            this.propose(raftNode, command),
            proposeTimeoutMs,
            timeoutMessage,
          );
        } else {
          if (typeof options.forwardToLeader !== TYPEOF.FUNCTION) {
            throw new Error(LIFERAFT_PROVIDER_ERROR_MSG.MISSING_FORWARD_HANDLER);
          }
          await options.forwardToLeader(command, {
            attempt,
            mode,
          });
        }
        return {
          attempt,
          mode,
        };
      } catch (error) {
        lastError = error;
        if (error?.retryable === false) {
          throw error;
        }
      }

      if (attempt >= maxAttempts) {
        break;
      }

      const retryDelayMsRaw =
        typeof options.computeRetryDelayMs === TYPEOF.FUNCTION ?
          options.computeRetryDelayMs(attempt) :
          NUM.ZERO;
      const retryDelayMs = Number.isFinite(retryDelayMsRaw) && retryDelayMsRaw > NUM.ZERO ?
        Math.floor(retryDelayMsRaw) :
        NUM.ZERO;
      if (typeof options.onRetry === TYPEOF.FUNCTION) {
        options.onRetry({
          attempt,
          mode: lastMode,
          retryDelayMs,
          error: lastError,
        });
      }
      if (retryDelayMs > NUM.ZERO) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
      attempt += NUM.ONE;
    }

    if (lastError) {
      throw lastError;
    }
    throw new Error(
      LIFERAFT_PROVIDER_ERROR_MSG.MISSING_COMMAND_API,
    );
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
