/**
 * RaftGroup - Composable Raft lifecycle management.
 * Encapsulates liferaft instance creation, event wiring, peer joining,
 * election management, and shutdown in a single reusable class.
 * All dependencies are injected via constructor — no singleton imports.
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 6.1, 6.2, 6.3
 */

import {EventEmitter} from 'events';
import {isRaftPacket} from './raft-packet-utils.js';
import {ADDRESS, NUM, STRING, TYPEOF} from '../constants/index.js';
import {assertRaftProviderContract} from './raft-provider-contract.js';
import {LiferaftProvider} from './liferaft-provider.js';
import {LeaderActivationGate} from './leader-activation-gate.js';
import {LeaderActivationScheduler} from './leader-activation-scheduler.js';
import {resolveRaftTransportDeliveryOptions} from './constants.js';
import {
  deliverRaftPacketWithBackpressureMute,
} from './raft-peer-backpressure-mute.js';
import {
  RAFT_GROUP_ADDRESS,
  RAFT_GROUP_DEFAULT,
  RAFT_GROUP_ERROR_MSG,
  RAFT_GROUP_EVENT,
  RAFT_GROUP_LIFERAFT_EVENT,
  RAFT_GROUP_LIFERAFT_TIMER,
  RAFT_GROUP_LOG_MSG,
  RAFT_GROUP_ROLE,
} from './raft-group-constants.js';

const LOCAL_STR_SHARED_NODE = 'shared-node';

/**
 * Hash modulo for fallback replica index calculation.
 * @type {number}
 */
const HASH_MODULO = NUM.TEN;

/**
 * Liferaft timer name used to clear heartbeat and election timers.
 * @type {string}
 */
const HEARTBEAT_ELECTION_TIMER = 'heartbeat, election';

/**
 * Liferaft internal event name for incoming data packets.
 * @type {string}
 */
const LIFERAFT_DATA_EVENT = 'data';

function resolveActivationNodeId(options = {}) {
  if (typeof options.nodeId === TYPEOF.STRING &&
      options.nodeId.length > NUM.ZERO) {
    return options.nodeId;
  }
  if (typeof options.unifiedAddress !== TYPEOF.STRING ||
      options.unifiedAddress.length === NUM.ZERO) {
    return LOCAL_STR_SHARED_NODE;
  }
  const [nodeId] = options.unifiedAddress.split(RAFT_GROUP_ADDRESS.SEPARATOR);
  return typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO ?
    nodeId :
    LOCAL_STR_SHARED_NODE;
}

/**
 * Composable class that encapsulates the complete liferaft lifecycle.
 * Used by partition and message group services via composition.
 * @extends EventEmitter
 */
class RaftGroup extends EventEmitter {
  /**
   * @param {Object} options - Configuration options.
   * @param {string} options.replicaId - This replica's ID.
   * @param {Array<string>} [options.replicaIds] - All replica IDs in group.
   * @param {Object} options.transport - MessageRouter for Raft communication.
   * @param {string} options.entityType - Entity type (partition/message-group).
   * @param {Object} options.peerAddressResolver - PeerAddressResolver instance.
   * @param {string} [options.unifiedAddress] - Pre-computed unified address.
   * @param {Array<string>} [options.peerAddresses] - Known peer addresses.
   * @param {Object} [options.logAdapter] - Log adapter for liferaft.
   * @param {boolean} [options.deferElection] - Defer election start.
   * @param {number} [options.heartbeatMs] - Heartbeat interval.
   * @param {number} [options.electionMinMs] - Min election timeout.
   * @param {number} [options.electionMaxMs] - Max election timeout.
   * @param {number} [options.electionJitterPerReplicaMs] - Jitter per replica.
   * @param {Object} [options.raftProvider] - Provider implementing raft node contract.
   * @param {Object} [options.logger] - Logger instance.
   */
  constructor(options = {}) {
    super();
    this.validateOptions(options);

    this.raftProvider = options.raftProvider || new LiferaftProvider();
    assertRaftProviderContract(this.raftProvider);

    this.replicaId = options.replicaId;
    this.replicaIds = options.replicaIds || [this.replicaId];
    this.transport = options.transport;
    this.entityType = options.entityType;
    this.peerAddressResolver = options.peerAddressResolver;
    this.unifiedAddress = options.unifiedAddress || this.replicaId;
    this.peerAddresses = options.peerAddresses || [];
    this.logAdapter = options.logAdapter || null;
    this.deferElection = options.deferElection || false;
    this.shouldJoinPeer = typeof options.shouldJoinPeer === TYPEOF.FUNCTION ?
      options.shouldJoinPeer :
      null;

    // Timing configuration
    this.heartbeatMs = options.heartbeatMs ||
      RAFT_GROUP_DEFAULT.HEARTBEAT_MS;
    this.electionMinMs = options.electionMinMs ||
      RAFT_GROUP_DEFAULT.ELECTION_MIN_MS;
    this.electionMaxMs = options.electionMaxMs ||
      RAFT_GROUP_DEFAULT.ELECTION_MAX_MS;
    this.electionJitterPerReplicaMs = options.electionJitterPerReplicaMs ||
      RAFT_GROUP_DEFAULT.ELECTION_JITTER_PER_REPLICA_MS;

    this.logger = options.logger || console;
    this.activationNodeId = resolveActivationNodeId(options);
    this.leaderActivationStabilizationMs =
      Number.isFinite(options.leaderActivationStabilizationMs) &&
      options.leaderActivationStabilizationMs >= NUM.ZERO ?
        Math.floor(options.leaderActivationStabilizationMs) :
        RAFT_GROUP_DEFAULT.LEADER_ACTIVATION_STABILIZATION_MS;
    this.leaderActivationNodeSpacingMs =
      Number.isFinite(options.leaderActivationNodeSpacingMs) &&
      options.leaderActivationNodeSpacingMs >= NUM.ZERO ?
        Math.floor(options.leaderActivationNodeSpacingMs) :
        RAFT_GROUP_DEFAULT.LEADER_ACTIVATION_NODE_SPACING_MS;
    this.leaderActivationScheduler = options.leaderActivationScheduler ||
      LeaderActivationScheduler.getShared({
        nodeId: this.activationNodeId,
        spacingMs: this.leaderActivationNodeSpacingMs,
      });
    this.leaderActivationGate = new LeaderActivationGate({
      holdoffMs: this.leaderActivationStabilizationMs,
      activationScheduler: this.leaderActivationScheduler,
    });

    // Raft state
    this.raft = null;
    this.role = RAFT_GROUP_ROLE.FOLLOWER;
    this.leaderId = null;
    this.isLeader = false;
    this.initialized = false;
    this.electionStarted = false;
  }

  /**
   * Validate required constructor options.
   * @param {Object} options - Constructor options.
   * @throws {Error} If required options are missing.
   * @private
   */
  validateOptions(options) {
    if (!options.replicaId) {
      throw new Error(RAFT_GROUP_ERROR_MSG.MISSING_REPLICA_ID);
    }
    if (!options.entityType) {
      throw new Error(RAFT_GROUP_ERROR_MSG.MISSING_ENTITY_TYPE);
    }
    if (!options.transport) {
      throw new Error(RAFT_GROUP_ERROR_MSG.MISSING_TRANSPORT);
    }
    if (!options.peerAddressResolver) {
      throw new Error(RAFT_GROUP_ERROR_MSG.MISSING_PEER_ADDRESS_RESOLVER);
    }
  }

  /**
   * Create liferaft instance and wire events.
   * Must be called before joinPeers() or startElection().
   */
  initialize() {
    if (this.initialized) {
      throw new Error(RAFT_GROUP_ERROR_MSG.ALREADY_INITIALIZED);
    }

    this.logger.info(RAFT_GROUP_LOG_MSG.INITIALIZING, {
      replicaId: this.replicaId,
      replicaCount: this.replicaIds.length,
      deferElection: this.deferElection,
    });

    this.createRaftInstance();
    this.wireRaftEvents();

    if (this.deferElection && this.raft) {
      this.raftProvider.clearTimers(this.raft, HEARTBEAT_ELECTION_TIMER);
      this.logger.debug(RAFT_GROUP_LOG_MSG.CLEARED_LIFERAFT_TIMERS, {
        replicaId: this.replicaId,
      });
    }

    this.initialized = true;

    this.logger.info(RAFT_GROUP_LOG_MSG.INITIALIZED, {
      replicaId: this.replicaId,
    });
  }

  /**
   * Create the liferaft instance with jitter-based election timeouts.
   * @private
   */
  createRaftInstance() {
    const {electionMinMs, electionMaxMs} =
      this.computeElectionTimeouts();
    const logAdapter = this.logAdapter;

    const RaftNode = this.raftProvider.createNodeClass({
      deferElection: this.deferElection,
      logger: this.logger,
      replicaId: this.replicaId,
      resolvePeerAddress: (peerId) => this.peerAddressResolver.resolve(
        peerId,
        this.peerAddresses,
      ),
      deliverPacket: (peerAddress, packet) =>
        deliverRaftPacketWithBackpressureMute(
          this.transport,
          peerAddress,
          packet,
        ),
    });

    const raftOptions = {
      [RAFT_GROUP_LIFERAFT_TIMER.HEARTBEAT]: this.heartbeatMs,
      [RAFT_GROUP_LIFERAFT_TIMER.ELECTION_MIN]: electionMinMs,
      [RAFT_GROUP_LIFERAFT_TIMER.ELECTION_MAX]: electionMaxMs,
    };

    if (logAdapter) {
      raftOptions[RAFT_GROUP_LIFERAFT_TIMER.LOG] =
        typeof logAdapter === TYPEOF.FUNCTION ?
          logAdapter :
          function() {
            return logAdapter;
          };
    }

    this.raft = new RaftNode(this.unifiedAddress, raftOptions);
  }

  /**
   * Compute election timeouts with replica-index-based jitter.
   * @return {{electionMinMs: number, electionMaxMs: number}}
   * @private
   */
  computeElectionTimeouts() {
    let replicaIndex = this.replicaIds.indexOf(this.replicaId);
    if (replicaIndex < NUM.ZERO) {
      const hashCode = this.replicaId.split(STRING.EMPTY).reduce(
        (acc, char) => acc + char.charCodeAt(NUM.ZERO), NUM.ZERO,
      );
      replicaIndex = this.replicaIds.length +
        (hashCode % HASH_MODULO);
    }
    const jitterMs = replicaIndex * this.electionJitterPerReplicaMs;
    return {
      electionMinMs: this.electionMinMs + jitterMs,
      electionMaxMs: this.electionMaxMs + jitterMs,
    };
  }

  /**
   * Wire all six liferaft events to RaftGroup events.
   * @private
   */
  wireRaftEvents() {
    const isSingleReplica = this.replicaIds.length === NUM.ONE;

    this.raft.on(RAFT_GROUP_LIFERAFT_EVENT.LEADER, () => {
      this.role = RAFT_GROUP_ROLE.LEADER;
      this.isLeader = true;
      this.leaderId = this.replicaId;
      const term = this.raftProvider.getCurrentTerm(this.raft);
      this.scheduleLeaderActivation(term, {immediate: isSingleReplica});
    });

    this.raft.on(RAFT_GROUP_LIFERAFT_EVENT.FOLLOWER, () => {
      if (isSingleReplica && this.isLeader) {
        return;
      }
      this.role = RAFT_GROUP_ROLE.FOLLOWER;
      this.isLeader = false;
      this.cancelLeaderActivation();
      this.emit(RAFT_GROUP_EVENT.FOLLOWER);
    });

    this.raft.on(RAFT_GROUP_LIFERAFT_EVENT.CANDIDATE, () => {
      if (isSingleReplica && this.isLeader) {
        return;
      }
      this.role = RAFT_GROUP_ROLE.CANDIDATE;
      this.isLeader = false;
      this.cancelLeaderActivation();
      this.emit(RAFT_GROUP_EVENT.CANDIDATE);
    });

    this.raft.on(RAFT_GROUP_LIFERAFT_EVENT.COMMIT, (command) => {
      this.emit(RAFT_GROUP_EVENT.COMMIT, command);
    });

    this.raft.on(RAFT_GROUP_LIFERAFT_EVENT.LEADER_CHANGE, (to) => {
      this.leaderId = to;
      this.logger.debug(RAFT_GROUP_LOG_MSG.LEADER_CHANGED, {
        newLeader: to,
        replicaId: this.replicaId,
      });
      this.emit(RAFT_GROUP_EVENT.LEADER_CHANGE, to);
    });

    this.raft.on(RAFT_GROUP_LIFERAFT_EVENT.TERM_CHANGE, (term) => {
      this.emit(RAFT_GROUP_EVENT.TERM_CHANGE, term);
    });
  }

  /**
   * Resolve one canonical join snapshot for a peer.
   * Custom resolvers may provide an explicit join target snapshot when
   * self/same-id join eligibility depends on authoritative runtime
   * location rather than replica id alone.
   * @param {string} peerId
   * @return {{peerAddress: string|null, shouldJoin: boolean}}
   * @private
   */
  resolveJoinPeerTarget(peerId) {
    if (typeof this.peerAddressResolver.resolveJoinTarget ===
        TYPEOF.FUNCTION) {
      const joinTarget = this.peerAddressResolver.resolveJoinTarget(
        peerId,
        this.peerAddresses,
      ) || {};
      const peerAddress =
        typeof joinTarget.address === TYPEOF.STRING &&
          joinTarget.address.length > NUM.ZERO ?
          joinTarget.address :
          null;
      return {
        peerAddress,
        shouldJoin: joinTarget.shouldJoin === true,
      };
    }

    if (peerId === this.replicaId && !this.shouldJoinPeer) {
      return {
        peerAddress: null,
        shouldJoin: false,
      };
    }

    const peerAddress = this.peerAddressResolver.resolve(
      peerId,
      this.peerAddresses,
    );
    const shouldJoin = this.shouldJoinPeer ?
      this.shouldJoinPeer(peerId, peerAddress) === true :
      peerId !== this.replicaId;

    return {
      peerAddress,
      shouldJoin,
    };
  }

  /**
   * Join all peer replicas to the Raft cluster.
   * Resolves each peer via PeerAddressResolver, skipping self.
   */
  joinPeers() {
    for (const peerId of this.replicaIds) {
      const {peerAddress, shouldJoin} = this.resolveJoinPeerTarget(peerId);
      if (!shouldJoin) {
        continue;
      }
      if (typeof peerAddress !== TYPEOF.STRING ||
          peerAddress.length === NUM.ZERO) {
        throw new Error(RAFT_GROUP_ERROR_MSG.peerJoinFailed(peerId));
      }
      this.logger.info(RAFT_GROUP_LOG_MSG.JOINING_PEER_ADDRESS, {
        peerId,
        peerAddress,
        replicaId: this.replicaId,
      });
      this.raftProvider.joinPeer(this.raft, peerAddress);
    }
  }

  /**
   * Start election timer (multi-replica) or promote to leader (single).
   * Idempotent — calling multiple times has no additional effect.
   */
  startElection() {
    if (this.electionStarted) {
      this.logger.debug(RAFT_GROUP_LOG_MSG.ELECTION_ALREADY_STARTED, {
        replicaId: this.replicaId,
      });
      return;
    }

    this.electionStarted = true;

    if (this.replicaIds.length === NUM.ONE) {
      this.handleSingleReplicaPromotion();
      return;
    }

    if (this.raft) {
      this.logger.info(RAFT_GROUP_LOG_MSG.STARTING_ELECTION_TIMER, {
        replicaId: this.replicaId,
        peerCount: this.replicaIds.length - NUM.ONE,
      });
      this.raftProvider.startElectionTimer(this.raft);
    }
  }

  /**
   * Immediately promote single-replica group to leader.
   * @private
   */
  handleSingleReplicaPromotion() {
    if (!this.raft ||
        typeof this.raft.change !== TYPEOF.FUNCTION) {
      throw new Error(RAFT_GROUP_ERROR_MSG.SINGLE_REPLICA_CHANGE_REQUIRED);
    }
    const leaderState = this.raft?.constructor?.LEADER;
    if (!Number.isFinite(leaderState)) {
      throw new Error(
        RAFT_GROUP_ERROR_MSG.SINGLE_REPLICA_LEADER_STATE_REQUIRED,
      );
    }
    this.raft.change({state: leaderState});
    this.raft.leader = this.unifiedAddress;

    this.logger.info(RAFT_GROUP_LOG_MSG.SINGLE_REPLICA_LEADER, {
      replicaId: this.replicaId,
    });
  }

  /**
   * Handle incoming Raft packet.
   * Validates sender address format and emits to liferaft.
   * @param {Object} message - Incoming message (raw or wrapped).
   * @return {Object|null} Processing result or null if not a Raft packet.
   */
  handleRaftPacket(message) {
    const payload = message.payload || message;

    if (!isRaftPacket(payload)) {
      return null;
    }

    if (!this.raft) {
      return null;
    }

    this.logger.trace(RAFT_GROUP_LOG_MSG.RECEIVED_RAFT_PACKET, {
      type: payload.type,
      term: payload.term,
      address: payload.address,
      replicaId: this.replicaId,
    });

    const senderAddress = payload.address;
    const isValidSenderAddress = senderAddress &&
      typeof senderAddress === TYPEOF.STRING &&
      senderAddress.includes(ADDRESS.SEPARATOR);

    if (!isValidSenderAddress) {
      this.logger.error(RAFT_GROUP_LOG_MSG.INVALID_SENDER_ADDRESS, {
        senderAddress,
        expectedFormat: RAFT_GROUP_ADDRESS.SEPARATOR,
        packetType: payload.type,
        term: payload.term,
        replicaId: this.replicaId,
      });
    }

    const transport = this.transport;
    const logger = this.logger;

    const write = (responsePacket) => {
      Promise.resolve(responsePacket)
        .then((resolvedPacket) => {
          if (!resolvedPacket) {
            return null;
          }

          if (!isValidSenderAddress) {
            logger.warn(RAFT_GROUP_LOG_MSG.SKIPPING_RAFT_RESPONSE, {
              type: resolvedPacket.type,
              destination: senderAddress,
              term: resolvedPacket.term,
            });
            return null;
          }

          logger.trace(RAFT_GROUP_LOG_MSG.SENDING_RAFT_RESPONSE, {
            type: resolvedPacket.type,
            term: resolvedPacket.term,
          });

          return transport.deliver(
            senderAddress,
            resolvedPacket,
            resolveRaftTransportDeliveryOptions({
              ...resolvedPacket,
              targetAddress: senderAddress,
            }),
          );
        })
        .catch((err) => {
          logger.error(RAFT_GROUP_LOG_MSG.FAILED_RAFT_RESPONSE, {
            error: err.message,
            destination: senderAddress,
          });
        });
    };

    this.raft.emit(LIFERAFT_DATA_EVENT, payload, write);
    return {acknowledged: true};
  }

  /**
   * Shutdown: clear all timers, end liferaft, emit shutdown event.
   * Safe to call on uninitialized groups.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.logger.info(RAFT_GROUP_LOG_MSG.SHUTDOWN_START, {
      replicaId: this.replicaId,
    });
    this.leaderActivationGate.shutdown();

    if (this.raft) {
      this.raftProvider.shutdownNode(this.raft);
      this.raft = null;
    }

    this.initialized = false;
    this.electionStarted = false;

    this.emit(RAFT_GROUP_EVENT.SHUTDOWN, {
      replicaId: this.replicaId,
    });

    this.logger.info(RAFT_GROUP_LOG_MSG.SHUTDOWN_COMPLETE, {
      replicaId: this.replicaId,
    });
  }

  /**
   * Get the current Raft role.
   * @return {string} Current role.
   */
  getRole() {
    return this.role;
  }

  /**
   * Check if this replica is the leader.
   * @return {boolean} True if leader.
   */
  isLeaderReplica() {
    return this.role === RAFT_GROUP_ROLE.LEADER;
  }

  /**
   * Get the current leader ID.
   * @return {string|null} Leader replica ID.
   */
  getLeaderId() {
    return this.leaderId;
  }

  /**
   * Get the current Raft term.
   * @return {number} Current term.
   */
  getCurrentTerm() {
    return this.raftProvider.getCurrentTerm(this.raft);
  }

  /**
   * Get the raw raft provider node instance.
   * @return {Object|null} The raft node instance.
   */
  getRaftInstance() {
    return this.raft;
  }

  cancelLeaderActivation() {
    this.leaderActivationGate.cancel({clearActivatedTerm: true});
  }

  scheduleLeaderActivation(term, options = {}) {
    this.leaderActivationGate.schedule(term, () => {
      if (!this.isLeaderReplica()) {
        return;
      }
      this.logger.info(RAFT_GROUP_LOG_MSG.BECAME_LEADER, {
        term,
        replicaId: this.replicaId,
      });
      this.emit(RAFT_GROUP_EVENT.LEADER, {
        leaderId: this.replicaId,
        term,
      });
    }, {
      immediate: options.immediate === true,
      shouldActivate: () => this.isLeaderReplica(),
    });
  }
}

export {RaftGroup};
