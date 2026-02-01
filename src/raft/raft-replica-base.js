/**
 * RaftReplicaBase - Abstract base class for Raft-based replica services.
 * Provides common functionality shared between PartitionService and MessageGroupService.
 * Requirements: 1.4, 5.1, 5.2, 5.3, 5.4, 5.5
 */

import {EventEmitter} from 'events';
import LifeRaft from '@markwylde/liferaft';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {LoggingService} from '../logging/logging-service.js';
import {NodeService} from '../node/node-service.js';
import {AddressManager} from '../address/address-manager.js';
import {isRaftPacket} from './raft-packet-utils.js';
import {NUM, STRING, TABLES} from '../constants/index.js';
import {
  RAFT_REPLICA_BASE_ADDRESS,
  RAFT_REPLICA_BASE_DEFAULT,
  RAFT_REPLICA_BASE_ERROR_MSG,
  RAFT_REPLICA_BASE_EVENT,
  RAFT_REPLICA_BASE_LIFERAFT_EVENT,
  RAFT_REPLICA_BASE_LIFERAFT_TIMER,
  RAFT_REPLICA_BASE_LOG_MSG,
  RAFT_REPLICA_BASE_ROLE,
  RAFT_REPLICA_BASE_VALUE,
} from './raft-replica-base-constants.js';

const RaftRole = RAFT_REPLICA_BASE_ROLE;

/**
 * Abstract base class for Raft-based replica services.
 * Provides common Raft consensus functionality for both MessageGroupService and PartitionService.
 * @abstract
 */
class RaftReplicaBase extends EventEmitter {
  /**
   * Create a new RaftReplicaBase.
   * @param {Object} options - Configuration options.
   * @param {string} options.replicaId - This replica's ID.
   * @param {string} options.nodeId - Node ID hosting this replica.
   * @param {Array<string>} options.replicaIds - All replica IDs in the group.
   * @param {Object} options.transport - MessageRouter for Raft communication.
   * @param {string} options.entityType - Entity type (partition or message-group).
   * @param {string} options.subsystemName - Logging subsystem name.
   * @param {Array<string>} [options.peerAddresses] - Peer addresses for cross-node joining.
   * @param {boolean} [options.deferElection] - Defer election start until startElection().
   * @param {boolean} [options.isJoiningExistingGroup] - True if joining existing group.
   */
  constructor(options = {}) {
    super();

    if (!options.replicaId) {
      throw new Error('RaftReplicaBase requires replicaId');
    }
    if (!options.entityType) {
      throw new Error('RaftReplicaBase requires entityType');
    }

    this.replicaId = options.replicaId;
    this.nodeId = options.nodeId || RAFT_REPLICA_BASE_DEFAULT.NODE_ID;
    this.replicaIds = options.replicaIds || [this.replicaId];
    this.transport = options.transport || null;
    this.entityType = options.entityType;
    this.subsystemName = options.subsystemName || STRING.UNKNOWN;

    // Unified address format: {nodeId}/{entityType}/{replicaId}
    this.addressManager = AddressManager.getInstance();
    this.unifiedAddress = this.addressManager.format(
      this.nodeId,
      this.entityType,
      this.replicaId,
    );

    // Peer addresses for cross-node communication
    this.peerAddresses = options.peerAddresses || [];

    // Raft state
    this.raft = null;
    this.role = RaftRole.FOLLOWER;
    this.leaderId = null;
    this.isLeader = false;

    // Role persistence state
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.pendingRoleUpdate = this.role;
    this.persistedRole = null;
    this.roleUpdateInFlight = false;
    this.roleUpdateRetryTimer = null;
    this.pendingLeaderNodeUpdate = null;
    this.persistedLeaderNodeId = null;
    this.leaderNodeUpdateInFlight = false;
    this.leaderNodeUpdateRetryTimer = null;

    // System table cache - use shared cache from NodeService singleton
    const nodeService = NodeService.getInstance();
    this.systemTableCache = options.systemTableCache || nodeService.getSystemTableCache();

    // Deferred election support
    this.deferElection = options.deferElection || options.isJoiningExistingGroup || false;
    this.electionStarted = false;
    this.isJoiningExistingGroup = options.isJoiningExistingGroup || false;

    // Learner phase support
    this.learnerPromotionDelayMs = options.learnerPromotionDelayMs ||
      RAFT_REPLICA_BASE_DEFAULT.LEARNER_PROMOTION_DELAY_MS;
    this.learnerCatchUpCheckIntervalMs = options.learnerCatchUpCheckIntervalMs ||
      RAFT_REPLICA_BASE_DEFAULT.LEARNER_CATCH_UP_CHECK_INTERVAL_MS;
    this.learnerPromotionTimer = null;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(this.subsystemName) : console;

    // State
    this.initialized = false;
  }

  /**
   * Get the unified address for this service.
   * Format: ${nodeId}/${entityType}/${replicaId}
   * @return {string} Unified address.
   */
  getUnifiedAddress() {
    return this.unifiedAddress;
  }

  /**
   * Build a unified address for a peer replica.
   * Looks up the address from peerAddresses array or system table cache.
   * @param {string} peerId - Peer replica ID.
   * @return {string} Unified address for the peer.
   */
  buildPeerAddress(peerId) {
    // If peerId is already in unified format, validate and return as-is
    if (peerId.includes(RAFT_REPLICA_BASE_ADDRESS.SEPARATOR)) {
      const validation = this.addressManager.validate(peerId);
      if (validation.valid) {
        return peerId;
      }
      this.logger.error(RAFT_REPLICA_BASE_LOG_MSG.PEER_ADDRESS_NOT_UNIFIED, {
        peerId,
        replicaId: this.replicaId,
        error: validation.error,
      });
      throw new Error(RAFT_REPLICA_BASE_ERROR_MSG.peerAddressNotUnified(peerId));
    }

    // Check peerAddresses array (provided during cross-node joining)
    if (this.peerAddresses && this.peerAddresses.length > NUM.ZERO) {
      for (const addr of this.peerAddresses) {
        const validation = this.addressManager.validate(addr);
        if (!validation.valid) {
          this.logger.error(RAFT_REPLICA_BASE_LOG_MSG.PEER_ADDRESS_NOT_UNIFIED, {
            peerId: addr,
            replicaId: this.replicaId,
            error: validation.error,
          });
          throw new Error(RAFT_REPLICA_BASE_ERROR_MSG.peerAddressNotUnified(addr));
        }
        const parsed = this.addressManager.parse(addr);
        if (parsed.serviceId === peerId) {
          this.logger.debug(RAFT_REPLICA_BASE_LOG_MSG.PEER_ADDRESS_FROM_LIST, {
            peerId,
            address: addr,
            replicaId: this.replicaId,
          });
          return addr;
        }
      }
    }

    // Try to look up nodeId from system table cache
    if (this.systemTableCache) {
      const service = this.systemTableCache.get(TABLES.SERVICES, peerId);
      if (service && service.node_id) {
        const address = this.addressManager.format(
          service.node_id,
          this.entityType,
          peerId,
        );
        this.logger.debug(RAFT_REPLICA_BASE_LOG_MSG.PEER_ADDRESS_FROM_CACHE, {
          peerId,
          nodeId: service.node_id,
          address,
          replicaId: this.replicaId,
        });
        return address;
      }
    }

    throw new Error(RAFT_REPLICA_BASE_ERROR_MSG.peerAddressUnresolved(peerId));
  }

  /**
   * Create the liferaft instance with common configuration.
   * Subclasses should call this during initialization.
   * @param {Object} logAdapter - Log adapter for liferaft.
   * @return {LifeRaft} The liferaft instance.
   * @protected
   */
  createRaftInstance(logAdapter) {
    const config = ConfigurationManager.getInstance();
    const heartbeatMs = config.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS) ||
      RAFT_REPLICA_BASE_DEFAULT.HEARTBEAT_DEFAULT_MS;
    const baseElectionMinMs = config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS) ||
      RAFT_REPLICA_BASE_DEFAULT.ELECTION_MIN_DEFAULT_MS;
    const baseElectionMaxMs = config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS) ||
      RAFT_REPLICA_BASE_DEFAULT.ELECTION_MAX_DEFAULT_MS;

    // Add replica-index-based jitter to election timeouts
    let replicaIndex = this.replicaIds.indexOf(this.replicaId);
    if (replicaIndex < NUM.ZERO) {
      const hashCode = this.replicaId.split(STRING.EMPTY).reduce(
        (acc, char) => acc + char.charCodeAt(NUM.ZERO), NUM.ZERO,
      );
      replicaIndex = this.replicaIds.length +
        (hashCode % RAFT_REPLICA_BASE_VALUE.HASH_MODULO);
    }
    const jitterMs = replicaIndex * RAFT_REPLICA_BASE_DEFAULT.ELECTION_JITTER_PER_REPLICA_MS;
    const electionMinMs = baseElectionMinMs + jitterMs;
    const electionMaxMs = baseElectionMaxMs + jitterMs;

    const self = this;
    const deferElection = this.deferElection;

    /**
     * Custom Raft node class that extends LifeRaft with our transport.
     */
    class RaftNode extends LifeRaft {
      /**
       * Override initialize to support deferred election start.
       * @param {Object} _options - Initialization options.
       * @param {Function} callback - Completion callback.
       */
      initialize(_options, callback) {
        if (deferElection) {
          self.logger.debug(RAFT_REPLICA_BASE_LOG_MSG.DEFERRING_ELECTION_START, {
            replicaId: self.replicaId,
          });
          if (callback) callback();
        } else {
          if (callback) callback();
        }
      }

      /**
       * Write method for sending Raft messages to peers.
       * @param {Object} packet - Raft protocol packet.
       * @param {Function} callback - Completion callback.
       */
      write(packet, callback) {
        const peerAddress = self.buildPeerAddress(this.address);
        self.transport.deliver(peerAddress, packet)
          .then((result) => callback(null, result))
          .catch((err) => callback(err));
      }
    }

    const raftOptions = {
      [RAFT_REPLICA_BASE_LIFERAFT_TIMER.HEARTBEAT]: heartbeatMs,
      [RAFT_REPLICA_BASE_LIFERAFT_TIMER.ELECTION_MIN]: electionMinMs,
      [RAFT_REPLICA_BASE_LIFERAFT_TIMER.ELECTION_MAX]: electionMaxMs,
    };

    if (logAdapter) {
      raftOptions[RAFT_REPLICA_BASE_LIFERAFT_TIMER.LOG] = function() {
        return logAdapter;
      };
    }

    this.raft = new RaftNode(this.unifiedAddress, raftOptions);

    // Clear timers if deferring election
    if (this.deferElection && this.raft.timers) {
      this.raft.timers.clear(RAFT_REPLICA_BASE_LIFERAFT_TIMER.HEARTBEAT_ELECTION);
      this.logger.debug(RAFT_REPLICA_BASE_LOG_MSG.CLEARED_LIFERAFT_TIMERS, {
        replicaId: this.replicaId,
      });
    }

    return this.raft;
  }

  /**
   * Wire up common liferaft events.
   * Subclasses can override onBecameLeader, onBecameFollower, etc. for custom behavior.
   * @protected
   */
  wireRaftEvents() {
    const isSingleReplica = this.replicaIds.length === NUM.ONE;

    this.raft.on(RAFT_REPLICA_BASE_LIFERAFT_EVENT.LEADER, () => {
      this.role = RaftRole.LEADER;
      this.isLeader = true;
      this.leaderId = this.replicaId;
      this.queueRoleUpdate(this.role);
      this.queueLeaderNodeUpdate(this.nodeId);

      this.logger.info(RAFT_REPLICA_BASE_LOG_MSG.BECAME_LEADER, {
        term: this.raft.term,
        replicaId: this.replicaId,
      });

      this.onBecameLeader();
      this.emit(RAFT_REPLICA_BASE_EVENT.LEADER_ELECTED, {
        leaderId: this.replicaId,
        term: this.raft.term,
      });
    });

    this.raft.on(RAFT_REPLICA_BASE_LIFERAFT_EVENT.FOLLOWER, () => {
      if (isSingleReplica && this.isLeader) {
        return;
      }
      this.role = RaftRole.FOLLOWER;
      this.isLeader = false;
      this.queueRoleUpdate(this.role);
      this.clearLeaderNodeUpdateState();
      this.onBecameFollower();
    });

    this.raft.on(RAFT_REPLICA_BASE_LIFERAFT_EVENT.CANDIDATE, () => {
      if (isSingleReplica && this.isLeader) {
        return;
      }
      this.role = RaftRole.CANDIDATE;
      this.isLeader = false;
      this.queueRoleUpdate(this.role);
      this.clearLeaderNodeUpdateState();
      this.onBecameCandidate();
    });

    this.raft.on(RAFT_REPLICA_BASE_LIFERAFT_EVENT.COMMIT, (command) => {
      this.onCommit(command);
    });

    this.raft.on(RAFT_REPLICA_BASE_LIFERAFT_EVENT.LEADER_CHANGE, (to) => {
      this.leaderId = to;
      this.logger.debug(RAFT_REPLICA_BASE_LOG_MSG.LEADER_CHANGED, {
        newLeader: to,
        replicaId: this.replicaId,
      });
    });

    this.raft.on(RAFT_REPLICA_BASE_LIFERAFT_EVENT.TERM_CHANGE, (_term) => {
      this.onTermChange();
    });
  }

  /**
   * Join peer nodes to the Raft cluster.
   * @protected
   */
  joinPeers() {
    for (const peerId of this.replicaIds) {
      if (peerId !== this.replicaId) {
        const peerAddress = this.buildPeerAddress(peerId);
        this.logger.info(RAFT_REPLICA_BASE_LOG_MSG.JOINING_PEER_ADDRESS, {
          peerId,
          peerAddress,
          replicaId: this.replicaId,
        });
        this.raft.join(peerAddress);
      }
    }
  }

  /**
   * Handle single-replica group leadership.
   * For single-replica groups, become leader immediately.
   * @protected
   */
  handleSingleReplicaLeadership() {
    if (this.replicaIds.length === NUM.ONE) {
      this.role = RaftRole.LEADER;
      this.isLeader = true;
      this.leaderId = this.replicaId;
      this.queueRoleUpdate(this.role);
      this.queueLeaderNodeUpdate(this.nodeId);

      this.logger.info(RAFT_REPLICA_BASE_LOG_MSG.SINGLE_REPLICA_LEADER, {
        replicaId: this.replicaId,
      });

      this.onBecameLeader();
      this.emit(RAFT_REPLICA_BASE_EVENT.LEADER_ELECTED, {
        leaderId: this.replicaId,
        term: this.raft ? this.raft.term : NUM.ZERO,
      });
    }
  }

  /**
   * Start the Raft election timer.
   * Call this after all replicas in the group have been created and registered.
   */
  startElection() {
    if (this.electionStarted) {
      return;
    }

    if (this.replicaIds.length === NUM.ONE) {
      this.electionStarted = true;
      return;
    }

    this.electionStarted = true;

    if (this.raft) {
      this.logger.info(RAFT_REPLICA_BASE_LOG_MSG.STARTING_ELECTION_TIMER, {
        replicaId: this.replicaId,
        peerCount: this.replicaIds.length - NUM.ONE,
      });
      this.raft.heartbeat(this.raft.timeout());
    }
  }

  /**
   * Handle incoming Raft packets.
   * Routes Raft protocol messages to liferaft.
   * @param {Object} message - Incoming message.
   * @return {Object} Processing result.
   * @protected
   */
  handleRaftPacket(message) {
    const payload = message.payload || message;

    if (!isRaftPacket(payload)) {
      return null;
    }

    if (this.raft) {
      this.logger.trace(RAFT_REPLICA_BASE_LOG_MSG.RECEIVED_RAFT_PACKET, {
        type: payload.type,
        term: payload.term,
        address: payload.address,
        replicaId: this.replicaId,
      });

      const senderAddress = payload.address;
      const write = (responsePacket) => {
        if (responsePacket) {
          this.logger.trace(RAFT_REPLICA_BASE_LOG_MSG.SENDING_RAFT_RESPONSE, {
            type: responsePacket.type,
            term: responsePacket.term,
          });
          this.transport.deliver(senderAddress, responsePacket)
            .catch((err) => {
              this.logger.error(RAFT_REPLICA_BASE_LOG_MSG.FAILED_RAFT_RESPONSE, {
                error: err.message,
                destination: senderAddress,
              });
            });
        }
      };

      this.raft.emit(RAFT_REPLICA_BASE_EVENT.DATA, payload, write);
    }
    return {acknowledged: true};
  }

  /**
   * Schedule learner promotion check.
   * @protected
   */
  scheduleLearnerPromotion() {
    if (this.learnerPromotionTimer) {
      return;
    }

    this.logger.info(RAFT_REPLICA_BASE_LOG_MSG.LEARNER_PROMOTION_SCHEDULED, {
      replicaId: this.replicaId,
      delayMs: this.learnerPromotionDelayMs,
    });

    this.learnerPromotionTimer = setTimeout(() => {
      this.checkLearnerPromotion();
    }, this.learnerPromotionDelayMs);
  }

  /**
   * Check if learner can be promoted to follower.
   * @protected
   */
  checkLearnerPromotion() {
    this.learnerPromotionTimer = null;

    if (this.role !== RaftRole.LEARNER) {
      return;
    }

    this.logger.info(RAFT_REPLICA_BASE_LOG_MSG.LEARNER_PROMOTION_CHECK, {
      replicaId: this.replicaId,
    });

    // Promote to follower and start participating in elections
    this.role = RaftRole.FOLLOWER;
    this.isJoiningExistingGroup = false;
    this.deferElection = false;

    this.logger.info(RAFT_REPLICA_BASE_LOG_MSG.LEARNER_PROMOTED_TO_FOLLOWER, {
      replicaId: this.replicaId,
    });

    this.startElection();
  }

  /**
   * Queue a raft role update for persistence.
   * @param {string} role - New raft role.
   * @protected
   */
  queueRoleUpdate(role) {
    if (!role || role === this.persistedRole) {
      return;
    }

    this.pendingRoleUpdate = role;
    if (!this.cdcIntegrationService) {
      return;
    }

    this.flushRoleUpdate().catch((error) => {
      this.logger.warn(RAFT_REPLICA_BASE_ERROR_MSG.PERSIST_ROLE_FAILED, {
        replicaId: this.replicaId,
        role,
        error: error.message,
      });
    });
  }

  /**
   * Queue a leader node update for persistence.
   * @param {string} leaderNodeId - Leader node ID.
   * @protected
   */
  queueLeaderNodeUpdate(leaderNodeId) {
    if (!leaderNodeId || leaderNodeId === this.persistedLeaderNodeId) {
      return;
    }

    this.pendingLeaderNodeUpdate = leaderNodeId;
    if (!this.cdcIntegrationService) {
      return;
    }

    this.flushLeaderNodeUpdate().catch((error) => {
      this.logger.warn(RAFT_REPLICA_BASE_ERROR_MSG.PERSIST_LEADER_FAILED, {
        replicaId: this.replicaId,
        leaderNodeId,
        error: error.message,
      });
    });
  }

  /**
   * Clear leader node update state.
   * @protected
   */
  clearLeaderNodeUpdateState() {
    this.pendingLeaderNodeUpdate = null;
    this.persistedLeaderNodeId = null;
    if (this.leaderNodeUpdateRetryTimer) {
      clearTimeout(this.leaderNodeUpdateRetryTimer);
      this.leaderNodeUpdateRetryTimer = null;
    }
  }

  /**
   * Persist the latest pending raft role update.
   * Subclasses must implement this method.
   * @return {Promise<void>}
   * @abstract
   * @protected
   */
  async flushRoleUpdate() {
    throw new Error('flushRoleUpdate must be implemented by subclass');
  }

  /**
   * Persist the latest pending leader node update.
   * Subclasses must implement this method.
   * @return {Promise<void>}
   * @abstract
   * @protected
   */
  async flushLeaderNodeUpdate() {
    throw new Error('flushLeaderNodeUpdate must be implemented by subclass');
  }

  /**
   * Set the CDC integration service for raft role updates.
   * @param {Object} cdcIntegrationService - CDC integration service.
   */
  setCdcIntegrationService(cdcIntegrationService) {
    this.cdcIntegrationService = cdcIntegrationService;
    this.flushRoleUpdate().catch((error) => {
      this.logger.warn(RAFT_REPLICA_BASE_ERROR_MSG.PERSIST_ROLE_FAILED, {
        replicaId: this.replicaId,
        error: error.message,
      });
    });
    this.flushLeaderNodeUpdate().catch((error) => {
      this.logger.warn(RAFT_REPLICA_BASE_ERROR_MSG.PERSIST_LEADER_FAILED, {
        replicaId: this.replicaId,
        error: error.message,
      });
    });
  }

  /**
   * Check if this replica is the leader.
   * @return {boolean} True if leader.
   */
  isLeaderReplica() {
    return this.role === RaftRole.LEADER;
  }

  /**
   * Get the current leader ID.
   * @return {string|null} Leader replica ID.
   */
  getLeaderId() {
    return this.leaderId;
  }

  /**
   * Get the current Raft role.
   * @return {string} Current role.
   */
  getRole() {
    return this.role;
  }

  /**
   * Get the current term.
   * @return {number} Current term.
   */
  getCurrentTerm() {
    return this.raft ? this.raft.term : NUM.ZERO;
  }

  /**
   * Check if initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  // ============================================================================
  // Lifecycle hooks - subclasses can override these for custom behavior
  // ============================================================================

  /**
   * Called when this replica becomes leader.
   * @protected
   */
  onBecameLeader() {
    // Subclasses can override
  }

  /**
   * Called when this replica becomes follower.
   * @protected
   */
  onBecameFollower() {
    // Subclasses can override
  }

  /**
   * Called when this replica becomes candidate.
   * @protected
   */
  onBecameCandidate() {
    // Subclasses can override
  }

  /**
   * Called when a command is committed.
   * @param {Object} _command - The committed command.
   * @protected
   */
  onCommit(_command) {
    // Subclasses can override
  }

  /**
   * Called when the term changes.
   * @protected
   */
  onTermChange() {
    // Subclasses can override
  }

  /**
   * Shutdown the replica service.
   * Clears timers and ends liferaft instance.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.logger.info('Shutting down raft replica', {
      replicaId: this.replicaId,
    });

    // End liferaft instance - clear all timers first
    if (this.raft) {
      if (this.raft.timers) {
        this.raft.timers.clear();
      }
      this.raft.end();
      this.raft = null;
    }

    // Clear timers
    if (this.roleUpdateRetryTimer) {
      clearTimeout(this.roleUpdateRetryTimer);
      this.roleUpdateRetryTimer = null;
    }
    if (this.leaderNodeUpdateRetryTimer) {
      clearTimeout(this.leaderNodeUpdateRetryTimer);
      this.leaderNodeUpdateRetryTimer = null;
    }
    if (this.learnerPromotionTimer) {
      clearTimeout(this.learnerPromotionTimer);
      this.learnerPromotionTimer = null;
    }

    this.initialized = false;
    this.emit(RAFT_REPLICA_BASE_EVENT.SHUTDOWN, {replicaId: this.replicaId});
  }

  /**
   * Sleep for a specified duration.
   * @param {number} ms - Milliseconds to sleep.
   * @return {Promise<void>}
   * @protected
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export {
  RaftReplicaBase,
  RaftRole,
};
