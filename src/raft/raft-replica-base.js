/**
 * RaftReplicaBase - Abstract base class for Raft-based replica services.
 * Provides common functionality shared between PartitionService and MessageGroupService.
 * Requirements: 1.4, 5.1, 5.2, 5.3, 5.4, 5.5
 */

import {EventEmitter} from 'events';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {LoggingService} from '../logging/logging-service.js';
import {NodeService} from '../node/node-service.js';
import {AddressManager} from '../address/address-manager.js';
import {emitInvariant} from '../invariants/invariant-emitter.js';
import {INVARIANT_ID} from '../invariants/invariant-catalog.js';
import {isRaftPacket} from './raft-packet-utils.js';
import {NUM, STRING, TABLES} from '../constants/index.js';
import {ensureLiferaftProviderForRuntime} from './raft-provider-control.js';
import {assertRaftProviderContract} from './raft-provider-contract.js';
import {LiferaftProvider} from './liferaft-provider.js';
import {
  applyReplicaDemotion,
  clearReplicaLeaderUpdateState,
  reconcileReplicaLeaderChange,
} from './replica-leadership-state.js';
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
   * @param {Object} [options.raftProvider] - Provider implementing raft node contract.
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
    this.raftProvider = options.raftProvider || new LiferaftProvider();
    assertRaftProviderContract(this.raftProvider);

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
   * @return {Object} The raft provider node instance.
   * @protected
   */
  createRaftInstance(logAdapter) {
    ensureLiferaftProviderForRuntime();

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

    const RaftNode = this.raftProvider.createNodeClass({
      deferElection: this.deferElection,
      logger: this.logger,
      replicaId: this.replicaId,
      resolvePeerAddress: (peerId) => this.buildPeerAddress(peerId),
      deliverPacket: (peerAddress, packet) =>
        this.transport.deliver(peerAddress, packet),
    });

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
    if (this.deferElection && this.raft) {
      this.raftProvider.clearTimers(
        this.raft,
        RAFT_REPLICA_BASE_LIFERAFT_TIMER.HEARTBEAT_ELECTION,
      );
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
      const term = this.raftProvider.getCurrentTerm(this.raft);

      this.logger.info(RAFT_REPLICA_BASE_LOG_MSG.BECAME_LEADER, {
        term,
        replicaId: this.replicaId,
      });

      this.emitLeadershipInvariant(true, {
        leaderId: this.replicaId,
        term,
      });
      this.emitReadinessRoleInvariant(true, {
        role: this.role,
      });
      this.onBecameLeader();
      this.emit(RAFT_REPLICA_BASE_EVENT.LEADER_ELECTED, {
        leaderId: this.replicaId,
        term,
      });
    });

    this.raft.on(RAFT_REPLICA_BASE_LIFERAFT_EVENT.FOLLOWER, () => {
      if (isSingleReplica && this.isLeader) {
        return;
      }
      applyReplicaDemotion(this, RaftRole.FOLLOWER);
      this.emitReadinessRoleInvariant(true, {
        role: this.role,
      });
      this.onBecameFollower();
    });

    this.raft.on(RAFT_REPLICA_BASE_LIFERAFT_EVENT.CANDIDATE, () => {
      if (isSingleReplica && this.isLeader) {
        return;
      }
      applyReplicaDemotion(this, RaftRole.CANDIDATE);
      this.emitReadinessRoleInvariant(false, {
        role: this.role,
      });
      this.onBecameCandidate();
    });

    this.raft.on(RAFT_REPLICA_BASE_LIFERAFT_EVENT.COMMIT, (command) => {
      this.onCommit(command);
    });

    this.raft.on(RAFT_REPLICA_BASE_LIFERAFT_EVENT.LEADER_CHANGE, (to) => {
      this.handleLeaderChange(to);
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
        this.raftProvider.joinPeer(this.raft, peerAddress);
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

      this.emitLeadershipInvariant(true, {
        leaderId: this.replicaId,
        singleReplica: true,
      });
      this.emitReadinessRoleInvariant(true, {
        role: this.role,
      });
      this.onBecameLeader();
      this.emit(RAFT_REPLICA_BASE_EVENT.LEADER_ELECTED, {
        leaderId: this.replicaId,
        term: this.raftProvider.getCurrentTerm(this.raft),
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
      this.raftProvider.startElectionTimer(this.raft);
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
          const validation = this.addressManager.validate(senderAddress);
          if (!validation.valid) {
            return;
          }
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
    clearReplicaLeaderUpdateState(this);
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
    return this.raftProvider.getCurrentTerm(this.raft);
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
   * Called when the replica observes a leader change.
   * @param {string|null} _leaderId - New leader replica ID.
   * @param {Object} _context - Transition context.
   * @protected
   */
  onLeaderChanged(_leaderId, _context) {
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
   * Reconcile a leader-change event through the shared runtime path.
   * @param {string|null} nextLeaderId - New leader replica ID.
   * @return {boolean} True when the replica was demoted locally.
   * @protected
   */
  handleLeaderChange(nextLeaderId) {
    const previousLeaderId = this.leaderId;
    const demoted = reconcileReplicaLeaderChange(
      this,
      nextLeaderId,
      RaftRole.FOLLOWER,
    );
    this.logger.debug(RAFT_REPLICA_BASE_LOG_MSG.LEADER_CHANGED, {
      newLeader: nextLeaderId,
      previousLeader: previousLeaderId,
      replicaId: this.replicaId,
      demoted,
    });
    if (demoted) {
      this.onBecameFollower();
    }
    const leaderId = this.leaderId;
    const context = {
      previousLeaderId,
      demoted,
    };
    this.emitLeadershipInvariant(
      typeof leaderId === 'string' && leaderId.length > 0,
      {
        leaderId,
        ...context,
      },
    );
    this.onLeaderChanged(leaderId, context);
    this.emit(RAFT_REPLICA_BASE_EVENT.LEADER_CHANGED, {
      leaderId,
      replicaId: this.replicaId,
      ...context,
    });
    return demoted;
  }

  emitLeadershipInvariant(passed, observed = {}) {
    return emitInvariant(this, {
      invariantId: INVARIANT_ID.PARTITION_SINGLE_CANONICAL_LEADER,
      passed,
      entityId: this.replicaId,
      owningSubsystem: this.subsystemName,
      observed: {
        replicaId: this.replicaId,
        nodeId: this.nodeId,
        ...observed,
      },
    });
  }

  emitReadinessRoleInvariant(passed, observed = {}) {
    return emitInvariant(this, {
      invariantId: INVARIANT_ID.REPLICA_LOCAL_ROLE_IS_STABLE_FOR_READINESS,
      passed,
      entityId: this.replicaId,
      owningSubsystem: this.subsystemName,
      observed: {
        replicaId: this.replicaId,
        nodeId: this.nodeId,
        ...observed,
      },
    });
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
      this.raftProvider.shutdownNode(this.raft);
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
