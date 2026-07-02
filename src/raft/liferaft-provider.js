import LifeRaft from './liferaft.js';

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
const LIFERAFT_IMMEDIATE_ELECTION_TIMEOUT_MS = 1;

function resolveProposeTimeoutMs(options = {}) {
  const timeoutMs = Number.isFinite(options.proposeTimeoutMs) &&
    options.proposeTimeoutMs > 0 ?
    Math.floor(options.proposeTimeoutMs) :
    LIFERAFT_PROPOSE_TIMEOUT_DEFAULT_MS;
  return timeoutMs;
}

function resolveRetryDelayMs(options = {}, attempt, error = null) {
  const configuredRetryDelayMsRaw =
    typeof options.computeRetryDelayMs === 'function' ?
      options.computeRetryDelayMs(attempt) :
      0;
  const configuredRetryDelayMs =
    Number.isFinite(configuredRetryDelayMsRaw) &&
      configuredRetryDelayMsRaw > 0 ?
      Math.floor(configuredRetryDelayMsRaw) :
      0;
  const errorRetryAfterMs = Number.isFinite(error?.retryAfterMs) &&
    error.retryAfterMs > 0 ?
    Math.floor(error.retryAfterMs) :
    0;
  return Math.max(configuredRetryDelayMs, errorRetryAfterMs);
}

function hasCommandApi(raftNode) {
  return Boolean(
    raftNode &&
    typeof raftNode.command === 'function',
  );
}

function shouldProposeLocally(raftNode, options = {}) {
  if (typeof options.shouldProposeLocally === 'function') {
    return options.shouldProposeLocally() === true &&
      hasCommandApi(raftNode);
  }
  return Boolean(
    raftNode &&
    raftNode.state === LifeRaft.LEADER &&
    hasCommandApi(raftNode),
  );
}

function resolveRouteMode(raftNode, options = {}) {
  return shouldProposeLocally(raftNode, options) ?
    LIFERAFT_ROUTE_MODE.PROPOSE :
    LIFERAFT_ROUTE_MODE.FORWARD;
}

function awaitWithTimeout(promise, timeoutMs, timeoutMessage) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
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
    if (!raftNode || typeof raftNode.command !== 'function') {
      throw new Error(LIFERAFT_PROVIDER_ERROR_MSG.MISSING_COMMAND_API);
    }
    try {
      const proposalPromise = Promise.resolve(raftNode.command(command));
      if (typeof callback === 'function') {
        proposalPromise
          .then(() => callback(null))
          .catch((error) => callback(error));
      }
      return proposalPromise;
    } catch (error) {
      if (typeof callback === 'function') {
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
   * @param {Function} [options.shouldProposeLocally] - () => boolean
   * @param {number} [options.maxAttempts=1]
   * @param {Function} [options.computeRetryDelayMs] - (attempt) => ms
   * @param {Function} [options.onRetry] - ({attempt, mode, retryDelayMs, error}) => void
   * @param {number} [options.proposeTimeoutMs] - Max time for one command() call.
   * @return {Promise<{attempt:number, mode:string}>}
   */
  async proposeWithLeaderRouting(raftNode, command, options = {}) {
    const maxAttempts = Number.isInteger(options.maxAttempts) &&
      options.maxAttempts > 0 ?
      options.maxAttempts :
      1;
    const proposeTimeoutMs = resolveProposeTimeoutMs(options);
    let attempt = 1;
    let lastError = null;
    let lastMode = LIFERAFT_ROUTE_MODE.PROPOSE;

    while (attempt <= maxAttempts) {
      const mode = resolveRouteMode(raftNode, options);
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
          if (typeof options.forwardToLeader !== 'function') {
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

      const retryDelayMs = resolveRetryDelayMs(
        options,
        attempt,
        lastError,
      );
      if (typeof options.onRetry === 'function') {
        options.onRetry({
          attempt,
          mode: lastMode,
          retryDelayMs,
          error: lastError,
        });
      }
      if (retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
      attempt += 1;
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
    if (!raftNode || typeof raftNode.join !== 'function') {
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
      typeof raftNode.heartbeat !== 'function' ||
      typeof raftNode.timeout !== 'function') {
      return;
    }
    raftNode.heartbeat(raftNode.timeout());
  }

  /**
   * Request the next follower election without waiting for the randomized
   * election timeout. Replacement leader handoff uses this when safe source
   * removal is blocked on explicit replacement ownership.
   * @param {Object} raftNode
   */
  requestElectionNow(raftNode) {
    if (!raftNode || typeof raftNode.heartbeat !== 'function') {
      return;
    }
    raftNode.heartbeat(LIFERAFT_IMMEDIATE_ELECTION_TIMEOUT_MS);
  }

  /**
   * Clear liferaft timers.
   * @param {Object} raftNode
   * @param {string} [timerName]
   */
  clearTimers(raftNode, timerName) {
    if (!raftNode ||
      !raftNode.timers ||
      typeof raftNode.timers.clear !== 'function') {
      return;
    }
    if (typeof timerName === 'string') {
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
    if (raftNode && typeof raftNode.end === 'function') {
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
    return Number.isFinite(term) ? term : 0;
  }

  /**
   * Get committed index from raft node log.
   * @param {Object} raftNode
   * @return {number}
   */
  getCommittedIndex(raftNode) {
    const committedIndex = raftNode?.log?.committedIndex;
    return Number.isFinite(committedIndex) ? committedIndex : 0;
  }
}

export {LiferaftProvider};
