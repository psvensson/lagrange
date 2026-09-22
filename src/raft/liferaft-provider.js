import LifeRaft from './liferaft.js';
import {
  RAFT_COMMIT_APPLY_ROLLBACK_EVENT,
} from './liferaft-commit-scheduler.js';
import {
  RAFT_PARTITION_NODE_REQUEST,
} from './raft-provider-contract-constants.js';
import {createRaftOperationPort, deepFreeze} from './raft-operation-port.js';
import {
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from './raft-operation-port-constants.js';
import {RAFT_EVENT, RAFT_ROLE} from './constants.js';

// The liferaft option keys a partition group's node is constructed with. They
// are liferaft's own names; the request the provider receives uses none of
// them, which is what makes the request backend-neutral.
const LIFERAFT_NODE_OPTION = Object.freeze({
  HEARTBEAT: 'heartbeat',
  ELECTION_MIN: 'election min',
  ELECTION_MAX: 'election max',
  LOG: 'Log',
  SNAPSHOT_CATCHUP_NEEDED: 'onSnapshotCatchupNeeded',
  TIME_SOURCE: 'timeSource',
  RANDOM_SOURCE: 'randomSource',
});

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
const LIFERAFT_EMPTY_LOG_INDEX = 0;
const UNSUPPORTED_CONFIGURATION_CHANGE_ERROR =
  'unsupported liferaft configuration change';

const LIFERAFT_ROLE_BY_STATE = Object.freeze({
  [LifeRaft.LEADER]: RAFT_ROLE.LEADER,
  [LifeRaft.FOLLOWER]: RAFT_ROLE.FOLLOWER,
  [LifeRaft.CANDIDATE]: RAFT_ROLE.CANDIDATE,
});

function resolveLiferaftRole(state) {
  return LIFERAFT_ROLE_BY_STATE[state] || null;
}

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
    (typeof raftNode.propose === 'function' ||
      typeof raftNode.command === 'function'),
  );
}

function shouldProposeLocally(raftNode, options = {}) {
  if (typeof options.shouldProposeLocally === 'function') {
    return options.shouldProposeLocally() === true &&
      hasCommandApi(raftNode);
  }
  const semanticRole = raftNode?.readStatus?.().role;
  const leader = semanticRole === RAFT_ROLE.LEADER ||
    raftNode?.state === LifeRaft.LEADER;
  return Boolean(raftNode && leader && hasCommandApi(raftNode));
}

function resolveRouteMode(raftNode, options = {}) {
  return shouldProposeLocally(raftNode, options) ?
    LIFERAFT_ROUTE_MODE.PROPOSE :
    LIFERAFT_ROUTE_MODE.FORWARD;
}

function awaitWithTimeout(promise, timeoutMs, timeoutMessage, timeSource) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.resolve(promise);
  }
  // The deadline belongs to the node proposing, so it is armed on that
  // node's clock when one is supplied.
  const timers = timeSource || {setTimeout, clearTimeout};
  return new Promise((resolve, reject) => {
    const timeoutHandle = timers.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    Promise.resolve(promise)
      .then((value) => {
        timers.clearTimeout(timeoutHandle);
        resolve(value);
      })
      .catch((error) => {
        timers.clearTimeout(timeoutHandle);
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
   * Build the node one partition group runs on.
   *
   * This is the backend boundary: the caller hands over the group's own
   * requirements (`RAFT_PARTITION_NODE_REQUEST`) and gets back a running
   * node. Nothing liferaft-shaped crosses inward - the option names below
   * are liferaft's, and translating the request into them is this backend's
   * job, not the partition service's.
   * @param {Object} request - The partition group's requirements.
   * @return {Object} A liferaft node for this group.
   */
  createPartitionPort(request) {
    const durableLog = request[RAFT_PARTITION_NODE_REQUEST.DURABLE_LOG];
    const sendToPeer = request[RAFT_PARTITION_NODE_REQUEST.SEND_TO_PEER];
    const resolvePeerAddress =
      request[RAFT_PARTITION_NODE_REQUEST.RESOLVE_PEER_ADDRESS];
    const applyCommittedEntry =
      request[RAFT_PARTITION_NODE_REQUEST.APPLY_COMMITTED_ENTRY];
    const snapshotCatchupNeeded =
      request[RAFT_PARTITION_NODE_REQUEST.SNAPSHOT_CATCHUP_NEEDED];
    const timing = request[RAFT_PARTITION_NODE_REQUEST.TIMING];
    const protocolDiagnostics = {
      peerWrites: Object.create(null),
      inbound: Object.create(null),
      replies: Object.create(null),
      sendFailures: Object.create(null),
    };
    const countProtocolPacket = (bucket, packet) => {
      const type = String(packet?.type || 'unknown');
      bucket[type] = (bucket[type] || 0) + 1;
    };

    class PartitionGroupRaftNode extends LifeRaft {
      /**
       * liferaft's own initialize arms its timers. The partition group owns
       * when its election starts, so the node is built inert and the caller
       * arms it.
       * @param {Object} _options - liferaft's options.
       * @param {Function} [callback] - liferaft's completion callback.
       */
      initialize(_options, callback) {
        if (callback) {
          callback();
        }
      }

      /**
       * @param {*} command - The committed command.
       * @param {*} effects - What applying it produced.
       */
      prepareCommitApply(command, effects) {
        applyCommittedEntry(command, effects);
      }

      /**
       * liferaft calls this on the CLONED node standing for the peer, so
       * `this.address` is the destination.
       * @param {Object} packet - The raft packet.
       * @param {Function} callback - liferaft's completion callback.
       */
      write(packet, callback) {
        const peerAddress = resolvePeerAddress(this.address);
        countProtocolPacket(protocolDiagnostics.peerWrites, packet);
        sendToPeer(peerAddress, packet)
          .then((result) => callback(null, result))
          .catch((error) => {
            countProtocolPacket(protocolDiagnostics.sendFailures, packet);
            callback(error);
          });
      }
    }

    const node = new PartitionGroupRaftNode(
      request[RAFT_PARTITION_NODE_REQUEST.PEER_ADDRESS],
      {
        [LIFERAFT_NODE_OPTION.HEARTBEAT]: timing.heartbeatMs,
        [LIFERAFT_NODE_OPTION.ELECTION_MIN]: timing.electionMinMs,
        [LIFERAFT_NODE_OPTION.ELECTION_MAX]: timing.electionMaxMs,
        [LIFERAFT_NODE_OPTION.LOG]: function() {
          return durableLog;
        },
        [LIFERAFT_NODE_OPTION.SNAPSHOT_CATCHUP_NEEDED]: snapshotCatchupNeeded,
        ...request[RAFT_PARTITION_NODE_REQUEST.SUBSTRATE],
      },
    );
    // liferaft says an apply transaction rolled back with an event of its
    // own. The group is told the fact, not the name: the event stays inside
    // the backend that emits it.
    node.on(
      RAFT_COMMIT_APPLY_ROLLBACK_EVENT,
      request[RAFT_PARTITION_NODE_REQUEST.APPLY_TRANSACTION_ROLLED_BACK],
    );
    const initialTerm = request[RAFT_PARTITION_NODE_REQUEST.INITIAL_TERM];
    if (Number.isSafeInteger(initialTerm) && initialTerm > 0) {
      node.term = initialTerm;
    }
    const subscribe = (eventName, listener) => {
      node.on(eventName, listener);
      return Object.freeze(() => node.removeListener(eventName, listener));
    };
    const status = () => deepFreeze({
      term: Number.isSafeInteger(node.term) ? node.term : 0,
      commitIndex: Number.isSafeInteger(node.log?.committedIndex) ?
        node.log.committedIndex : 0,
      role: resolveLiferaftRole(node.state),
      leaderId: node.leader || null,
      leaderAddress: node.leader || null,
      peerCount: Array.isArray(node.nodes) ? node.nodes.length : 0,
      peers: Array.isArray(node.nodes) ? node.nodes.map((peer) => ({
        address: peer?.address || null,
      })) : [],
      followerProgress: node._followerMatchIndexByAddress instanceof Map ?
        Object.fromEntries(node._followerMatchIndexByAddress) : {},
      protocolDiagnostics: {
        peerWrites: {...protocolDiagnostics.peerWrites},
        inbound: {...protocolDiagnostics.inbound},
        replies: {...protocolDiagnostics.replies},
        sendFailures: {...protocolDiagnostics.sendFailures},
      },
    });
    return createRaftOperationPort({
      subscribe,
      step: (envelope) => {
        const payload = envelope?.payload ?? envelope;
        countProtocolPacket(protocolDiagnostics.inbound, payload);
        const reply = typeof envelope?.reply === 'function' ?
          (responsePacket) => {
            countProtocolPacket(protocolDiagnostics.replies, responsePacket);
            return envelope.reply(responsePacket);
          } :
          envelope?.reply;
        return node.emit(RAFT_EVENT.DATA, payload, reply);
      },
      propose: (command) => Promise.resolve(node.command(command)),
      proposeConfChange: (change) => {
        if (change?.type === RAFT_MEMBERSHIP_OPERATION.ADD_PEER &&
            typeof change.peerAddress === 'string') {
          node.join(change.peerAddress);
          return deepFreeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK});
        }
        if (change?.type === RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER &&
            typeof change.peerAddress === 'string') {
          node.leave(change.peerAddress);
          return deepFreeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK});
        }
        throw new Error(UNSUPPORTED_CONFIGURATION_CHANGE_ERROR);
      },
      probePeerProgress: async (peerAddress) => {
        if (!node.log || typeof peerAddress !== 'string' ||
            peerAddress.length === 0) {
          return deepFreeze({
            outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
            reason: 'progress-probe-not-applicable',
          });
        }
        const lastInfo = await node.log.getLastInfo();
        const lastIndex = Number.isInteger(lastInfo?.index) ?
          lastInfo.index :
          LIFERAFT_EMPTY_LOG_INDEX;
        if (lastIndex <= LIFERAFT_EMPTY_LOG_INDEX) {
          return deepFreeze({
            outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
            reason: 'progress-probe-empty-log',
          });
        }
        const lastEntry = await node.log.get(lastIndex);
        if (!lastEntry) {
          return deepFreeze({
            outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
            reason: 'progress-probe-entry-missing',
          });
        }
        const probePacket = await node.appendPacket(lastEntry);
        await Promise.resolve(node.message(peerAddress, probePacket));
        return deepFreeze({
          outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
          reason: 'progress-probe-sent',
        });
      },
      tick: () => {
        if (typeof node.tick === 'function') {
          node.tick();
        }
        return deepFreeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK});
      },
      campaign: () => {
        node.change({state: LifeRaft.LEADER});
        node.leader = request[RAFT_PARTITION_NODE_REQUEST.PEER_ADDRESS];
        return deepFreeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK});
      },
      readStatus: status,
      configureTick: (timing = {}) => {
        if (Number.isFinite(timing.heartbeatMs)) {
          node.beat = timing.heartbeatMs;
        }
        if (!node.election || typeof node.election !== 'object') {
          node.election = {};
        }
        if (Number.isFinite(timing.electionMinMs)) {
          node.election.min = timing.electionMinMs;
        }
        if (Number.isFinite(timing.electionMaxMs)) {
          node.election.max = timing.electionMaxMs;
        }
        if (Number.isFinite(timing.tickIntervalMs)) {
          node.tickIntervalMs = timing.tickIntervalMs;
        }
        if (timing.rearmTimer === true) {
          node.heartbeat(node.state === LifeRaft.LEADER ?
            node.beat : node.timeout());
        }
        return true;
      },
      startScheduling: () => {
        node.heartbeat(node.timeout());
        return deepFreeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK});
      },
      stopScheduling: (timerName) => {
        if (typeof timerName === 'string') {
          node.timers.clear(timerName);
        } else {
          node.timers.clear();
        }
        return deepFreeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK});
      },
      close: () => {
        node.timers.clear();
        node.end();
        return deepFreeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK});
      },
    });
  }

  /**
   * Propose a command on the raft node.
   * @param {Object} raftNode
   * @param {*} command
   * @param {Function} callback
   */
  propose(raftNode, command, callback) {
    if (!hasCommandApi(raftNode)) {
      throw new Error(LIFERAFT_PROVIDER_ERROR_MSG.MISSING_COMMAND_API);
    }
    try {
      const proposalPromise = Promise.resolve(
        typeof raftNode.propose === 'function' ?
          raftNode.propose(command) : raftNode.command(command),
      );
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
            options.timeSource,
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
        const timers = options.timeSource || {setTimeout};
        await new Promise((resolve) => timers.setTimeout(resolve, retryDelayMs));
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
    if (typeof raftNode?.proposeConfChange === 'function') {
      return raftNode.proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.ADD_PEER,
        peerAddress,
      });
    }
    if (!raftNode || typeof raftNode.join !== 'function') {
      return;
    }
    return raftNode.join(peerAddress);
  }

  /**
   * Start election timer for multi-replica groups.
   * @param {Object} raftNode
   */
  startElectionTimer(raftNode) {
    if (typeof raftNode?.startScheduling === 'function') {
      return raftNode.startScheduling();
    }
    if (typeof raftNode?.heartbeat === 'function' &&
        typeof raftNode?.timeout === 'function') {
      return raftNode.heartbeat(raftNode.timeout());
    }
  }

  /**
   * Request the next follower election without waiting for the randomized
   * election timeout. Replacement leader handoff uses this when safe source
   * removal is blocked on explicit replacement ownership.
   * @param {Object} raftNode
   */
  requestElectionNow(raftNode) {
    if (typeof raftNode?.campaign === 'function') {
      return raftNode.campaign({timeoutMs: LIFERAFT_IMMEDIATE_ELECTION_TIMEOUT_MS});
    }
    if (typeof raftNode?.heartbeat === 'function') {
      return raftNode.heartbeat(LIFERAFT_IMMEDIATE_ELECTION_TIMEOUT_MS);
    }
  }

  /**
   * Clear liferaft timers.
   * @param {Object} raftNode
   * @param {string} [timerName]
   */
  clearTimers(raftNode, timerName) {
    if (typeof raftNode?.stopScheduling === 'function') {
      return raftNode.stopScheduling(timerName);
    }
    if (typeof raftNode?.timers?.clear === 'function') {
      return typeof timerName === 'string' ?
        raftNode.timers.clear(timerName) : raftNode.timers.clear();
    }
  }

  /**
   * Shutdown raft node and clear timers.
   * @param {Object} raftNode
   */
  shutdownNode(raftNode) {
    if (raftNode && typeof raftNode.close === 'function') {
      return raftNode.close();
    }
    this.clearTimers(raftNode);
    return raftNode?.end?.();
  }

  /**
   * Get current raft term from node.
   * @param {Object} raftNode
   * @return {number}
   */
  getCurrentTerm(raftNode) {
    const term = raftNode?.readStatus?.().term ?? raftNode?.term;
    return Number.isFinite(term) ? term : 0;
  }

  /**
   * Get committed index from raft node log.
   * @param {Object} raftNode
   * @return {number}
   */
  getCommittedIndex(raftNode) {
    const committedIndex = raftNode?.readStatus?.().commitIndex ??
      raftNode?.log?.committedIndex;
    return Number.isFinite(committedIndex) ? committedIndex : 0;
  }
}

export {LiferaftProvider};
