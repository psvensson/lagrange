/**
 * Message Group Service - raft runtime lifecycle: initialization, event wiring,
 * peer reconciliation against the authoritative cache, and join-phase election
 * suppression / convergence release.
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3, 7.4
 */
import {
  COLUMN,
  ENTITY_TYPE,
  NUM,
  SERVICE_TYPE,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {
  RAFT_ELECTION_TIMING,
  RAFT_EVENT,
} from '../raft/constants.js';
import {computeReplicaElectionTimeouts} from '../raft/raft-timing-utils.js';
import {RaftGroup} from '../raft/raft-group.js';
import {wireReplicaLifecycleEvents} from '../raft/replica-leadership-state.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {RAFT_ROLE as RaftRole} from './constants.js';
import {MESSAGE_GROUP_SERVICE_LITERAL} from './message-group-service-runtime-support.js';

/**
 * Attach raft runtime lifecycle methods to the MessageGroupService prototype.
 * @param {Function} serviceClass - The MessageGroupService class.
 * @return {void}
 */
function assignRaftLifecycle(serviceClass) {
  Object.assign(serviceClass.prototype, {
    /**
     * Join newly visible peers and replace moved peer addresses using the
     * authoritative services cache. Missing rows are ignored conservatively.
     * @private
     */
    reconcileRaftPeersFromCache() {
      if (
        !this.raft ||
        !this.systemTableCache ||
        typeof this.systemTableCache.filter !== TYPEOF.FUNCTION
      ) {
        return;
      }
      const services = this.systemTableCache.filter(
        TABLES.SERVICES,
        (service) => {
          return (
            (service?.[COLUMN.GROUP_ID] || service?.group_id) ===
              this.groupId &&
            (service?.[COLUMN.SERVICE_TYPE] || service?.service_type) ===
              SERVICE_TYPE.MESSAGE_GROUP
          );
        },
      );
      if (services.length === NUM.ZERO) {
        return;
      }
      const expectedAddressesByReplicaId = new Map();
      for (const service of services) {
        const replicaId =
          service?.[COLUMN.SERVICE_ID] ||
          service?.service_id ||
          service?.[COLUMN.REPLICA_ID] ||
          service?.replica_id;
        if (!replicaId) {
          continue;
        }
        const status =
          service?.[COLUMN.STATUS] || service?.status || ReplicaStatus.ACTIVE;
        if (
          status === ReplicaStatus.FAILED ||
          status === ReplicaStatus.REMOVING ||
          status === ReplicaStatus.REMOVED
        ) {
          continue;
        }
        const serviceAddress = service?.[COLUMN.ADDRESS] || service?.address;
        const serviceNodeId = service?.[COLUMN.NODE_ID] || service?.node_id;
        const peerAddress =
          typeof serviceAddress === TYPEOF.STRING &&
          serviceAddress.length > NUM.ZERO ?
            serviceAddress :
            typeof serviceNodeId === TYPEOF.STRING &&
                serviceNodeId.length > NUM.ZERO ?
              this.addressManager.format(
                serviceNodeId,
                ENTITY_TYPE.MESSAGE_GROUP,
                replicaId,
              ) :
              null;
        if (!peerAddress || this.isLocalForwardTarget(replicaId, peerAddress)) {
          continue;
        }
        expectedAddressesByReplicaId.set(replicaId, peerAddress);
        if (!this.replicaIds.includes(replicaId)) {
          this.replicaIds.push(replicaId);
        }
      }
      const currentNodes = Array.isArray(this.raft.nodes) ?
        [...this.raft.nodes] :
        [];
      const currentAddresses = new Set(
        currentNodes
          .map((node) => node?.address)
          .filter(
            (address) =>
              typeof address === TYPEOF.STRING && address.length > NUM.ZERO,
          ),
      );
      for (const [
        replicaId,
        expectedAddress,
      ] of expectedAddressesByReplicaId.entries()) {
        const staleAddresses = currentNodes
          .map((node) => node?.address)
          .filter((address) => {
            if (
              typeof address !== TYPEOF.STRING ||
              address.length === NUM.ZERO ||
              address === expectedAddress
            ) {
              return false;
            }
            try {
              const parsed = this.addressManager.parse(address);
              return (
                parsed.serviceType === ENTITY_TYPE.MESSAGE_GROUP &&
                parsed.serviceId === replicaId
              );
            } catch (_error) {
              return false;
            }
          });
        if (typeof this.raft.leave === TYPEOF.FUNCTION) {
          for (const staleAddress of staleAddresses) {
            this.raft.leave(staleAddress);
            currentAddresses.delete(staleAddress);
          }
        }
        if (!currentAddresses.has(expectedAddress)) {
          this.raftProvider.joinPeer(this.raft, expectedAddress);
          currentAddresses.add(expectedAddress);
        }
      }
    },
    /**
     * Initialize the message group service.
     * Creates liferaft instance and wires up events.
     * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3, 7.4
     * @return {Promise<void>}
     */
    async initialize() {
      if (this.initialized) {
        return;
      }
      this.logger.info(
        MESSAGE_GROUP_SERVICE_LITERAL.INITIALIZING_MESSAGE_GROUP_SERVICE,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
          nodeId: this.nodeId,
          replicaCount: this.replicaIds.length,
        },
      );
      // Get Raft configuration from ConfigurationManager
      // Requirements: 7.1, 7.2, 7.3, 7.4
      const config = ConfigurationManager.getInstance();
      const heartbeatMs =
        config.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS) ||
        RAFT_ELECTION_TIMING.HEARTBEAT_DEFAULT_MS;
      const baseElectionMinMs =
        config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS) ||
        RAFT_ELECTION_TIMING.ELECTION_MIN_DEFAULT_MS;
      const baseElectionMaxMs =
        config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS) ||
        RAFT_ELECTION_TIMING.ELECTION_MAX_DEFAULT_MS;
      const tickIntervalMs = config.get(CONFIG_KEY.RAFT_TICK_INTERVAL_MS);
      const {electionMinMs, electionMaxMs} = computeReplicaElectionTimeouts({
        replicaId: this.replicaId,
        replicaIds: this.replicaIds,
        partitionRotationKey: this.groupId,
        baseElectionMinMs,
        baseElectionMaxMs,
        electionJitterPerReplicaMs: RAFT_ELECTION_TIMING.JITTER_PER_REPLICA_MS,
      });
      this.raftTimingConfig = {
        heartbeatMs,
        baseElectionMinMs,
        baseElectionMaxMs,
        electionMinMs,
        electionMaxMs,
        tickIntervalMs: Number.isFinite(tickIntervalMs) ? tickIntervalMs : null,
      };
      this.raftRuntime = new RaftGroup({
        replicaId: this.replicaId,
        replicaIds: this.replicaIds,
        transport: this.transport,
        entityType: ENTITY_TYPE.MESSAGE_GROUP,
        peerAddressResolver: this.createRaftPeerAddressResolver(),
        unifiedAddress: this.unifiedAddress,
        peerAddresses: this.peerAddresses,
        logAdapter: this.logAdapter,
        deferElection: this.deferElection,
        heartbeatMs,
        electionMinMs: baseElectionMinMs,
        electionMaxMs: baseElectionMaxMs,
        electionJitterPerReplicaMs: RAFT_ELECTION_TIMING.JITTER_PER_REPLICA_MS,
        raftProvider: this.raftProvider,
        logger: this.logger,
        shouldJoinPeer: (peerId, peerAddress) =>
          this.shouldJoinRaftPeer(peerId, peerAddress),
      });
      try {
        this.raftRuntime.initialize();
        this.raft = this.raftRuntime.getRaftInstance();
        this.armJoinExistingGroupElectionSuppression();
        this.wireRaftEvents();
        this.raftRuntime.joinPeers();
        this.reconcileRaftPeersFromCache();
        if (Number.isFinite(this.raftTimingConfig.tickIntervalMs)) {
          this.applyRuntimeTickInterval(this.raftTimingConfig.tickIntervalMs);
        }
        if (this.replicaIds.length === NUM.ONE) {
          this.raftRuntime.startElection();
          this.electionStarted = true;
        }
      } catch (error) {
        this.logger.error(
          MESSAGE_GROUP_SERVICE_LITERAL.FAILED_DURING_INITIALIZE_CLEANING_UP_RAFT,
          {
            groupId: this.groupId,
            replicaId: this.replicaId,
            error: error.message,
          },
        );
        if (this.raftRuntime) {
          await this.raftRuntime.shutdown();
          this.raftRuntime = null;
        }
        this.raft = null;
        throw error;
      }
      this.cdcHandler.initialize();
      this.initialized = true;
      this.maybeInitializeRebalancer();
      this.logger.info(
        MESSAGE_GROUP_SERVICE_LITERAL.MESSAGE_GROUP_SERVICE_INITIALIZED,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
          role: this.role,
        },
      );
      this.emit(MESSAGE_GROUP_SERVICE_LITERAL.INITIALIZED, {
        groupId: this.groupId,
        replicaId: this.replicaId,
      });
    },
    /**
     * Wire up liferaft event handlers for role changes, commits, etc.
     * Extracted from initialize() for clarity and safe cleanup on failure.
     * Requirements: 5.1, 5.2, 5.3, 5.4
     * @private
     */
    wireRaftEvents() {
      const shouldIgnoreLeaderEvent = () => {
        if (!this.shouldSuppressJoinPhaseRaftParticipation()) {
          return false;
        }
        this.clearJoinExistingGroupTimers();
        return true;
      };
      const shouldIgnoreDemotionEvent = (eventName) => {
        if (!this.shouldSuppressJoinPhaseRaftParticipation()) {
          return false;
        }
        if (
          eventName !== RAFT_EVENT.FOLLOWER &&
          eventName !== RAFT_EVENT.CANDIDATE
        ) {
          return false;
        }
        if (this.raft) {
          this.raftProvider.clearTimers(this.raft, 'heartbeat, election');
        }
        return true;
      };
      wireReplicaLifecycleEvents(this, {
        events: RAFT_EVENT,
        roles: RaftRole,
        getCurrentTerm: () => this.raftProvider.getCurrentTerm(this.raft),
        normalizeLeaderId: (candidate) =>
          this.normalizeLeaderReplicaId(candidate),
        shouldIgnoreLeaderEvent,
        shouldIgnoreDemotionEvent,
        onLeader: ({term}) => {
          this.operationLedger.currentTerm = term;
          this.scheduleLeaderOwnedActivation(term);
        },
        onFollower: ({term}) => {
          this.cancelLeaderOwnedActivation();
          this.updateRebalancerLeadership();
          this.operationLedger.currentTerm = term;
          this.lastLeaderCdcResubscribeTerm = undefined;
        },
        onCandidate: ({term}) => {
          this.cancelLeaderOwnedActivation();
          this.updateRebalancerLeadership();
          this.operationLedger.currentTerm = term;
          this.lastLeaderCdcResubscribeTerm = undefined;
        },
        onCommit: (command) => {
          this.applyCommittedEntry(command);
        },
        onLeaderChange: ({leaderId}) => {
          this.logger.debug(MESSAGE_GROUP_SERVICE_LITERAL.LEADER_CHANGED, {
            newLeader: leaderId,
            groupId: this.groupId,
          });
        },
        onTermChange: ({term}) => {
          this.operationLedger.currentTerm = term;
        },
      });
    },
    /**
     * Join peer nodes in the Raft group.
     * Resolves peer addresses and joins them via liferaft.
     * @private
     * Delegate peer joins to the shared raft runtime owner.
     * @return {void}
     * @private
     */
    joinPeerNodes() {
      if (this.raftRuntime) {
        this.raftRuntime.joinPeers();
        return;
      }
      if (!this.raft) {
        return;
      }
      for (const peerId of this.replicaIds) {
        const joinTarget = this.resolveRaftJoinTarget(peerId);
        if (
          joinTarget.shouldJoin !== true ||
          typeof joinTarget.address !== TYPEOF.STRING ||
          joinTarget.address.length === NUM.ZERO
        ) {
          continue;
        }
        this.raftProvider.joinPeer(this.raft, joinTarget.address);
      }
    },
    /**
     * Delegate single-replica promotion to the shared raft runtime owner.
     * @return {void}
     * @private
     */
    promoteIfSingleReplica() {
      if (this.replicaIds.length !== NUM.ONE) {
        return;
      }
      this.startElection();
    },
    /**
     * Start the Raft election timer.
     * Call this after all replicas in the group have been created and registered.
     * This prevents election storms when multiple replicas are created on the same node.
     * If deferElection was false, this is a no-op (election already started).
     */
    startElection() {
      if (!this.raftRuntime) {
        return;
      }
      this.raftRuntime.startElection();
      this.electionStarted = true;
    },
    clearJoinExistingGroupTimers() {
      if (!this.raft) {
        return;
      }
      this.raftProvider.clearTimers(
        this.raft,
        MESSAGE_GROUP_SERVICE_LITERAL.HEARTBEAT_ELECTION,
      );
    },
    shouldSuppressJoinPhaseRaftParticipation() {
      return (
        this.isJoiningExistingGroup === true ||
        this.deferElectionUntilJoinConvergence === true
      );
    },
    armJoinExistingGroupElectionSuppression() {
      if (
        !this.raft ||
        !this.shouldSuppressJoinPhaseRaftParticipation() ||
        this.joinSuppressedHeartbeat
      ) {
        return;
      }
      const originalHeartbeat = this.raft.heartbeat;
      if (typeof originalHeartbeat !== TYPEOF.FUNCTION) {
        return;
      }
      const boundHeartbeat = originalHeartbeat.bind(this.raft);
      this.joinSuppressedHeartbeat = boundHeartbeat;
      this.raft.heartbeat = (duration) => {
        if (this.shouldSuppressJoinPhaseRaftParticipation()) {
          this.clearJoinExistingGroupTimers();
          return this.raft;
        }
        return boundHeartbeat(duration);
      };
      this.clearJoinExistingGroupTimers();
    },
    releaseJoinExistingGroupElectionSuppression() {
      if (!this.raft || !this.joinSuppressedHeartbeat) {
        return;
      }
      this.raft.heartbeat = this.joinSuppressedHeartbeat;
      this.joinSuppressedHeartbeat = null;
    },
    /**
     * Release join-time election suppression once the local node has completed
     * convergence and may participate normally in control-plane leadership.
     * @return {void}
     */
    completeJoinConvergence() {
      const wasJoiningExistingGroup = this.isJoiningExistingGroup === true;
      const shouldReleaseDeferredElection =
        this.deferElectionUntilJoinConvergence === true;
      if (!wasJoiningExistingGroup && !shouldReleaseDeferredElection) {
        return;
      }
      this.deferElection = false;
      this.releaseJoinExistingGroupElectionSuppression();
      if (wasJoiningExistingGroup) {
        this.isJoiningExistingGroup = false;
        if (this.role !== RaftRole.LEADER) {
          this.role = RaftRole.FOLLOWER;
          this.isLeader = false;
          if (this.leaderId === this.replicaId) {
            this.leaderId = null;
          }
          this.queueRoleUpdate(this.role);
        }
      }
      if (shouldReleaseDeferredElection) {
        this.deferElectionUntilJoinConvergence = false;
      }
      this.startElection();
    },
  });
}

export {assignRaftLifecycle};
