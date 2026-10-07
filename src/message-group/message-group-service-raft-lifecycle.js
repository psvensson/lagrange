/**
 * Message Group Service - consensus lifecycle on the raft-rs operation port:
 * initialization, role/leader/term publication from the port's
 * announcements, peer admission from the authoritative services cache, and
 * join-phase scheduling suppression / convergence release.
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3, 7.4
 */
import {
  COLUMN,
  ENTITY_TYPE,
  SERVICE_TYPE,
  TABLES,
} from '../constants/index.js';
import {RAFT_EVENT} from '../raft/raft-operation-port-constants.js';
import {
  reserveAndAdmitGroupPeer,
  takeGroupAdmissionsInFlight,
} from '../raft/raft-rs-group-membership-admission.js';
import {wireReplicaLifecycleEvents} from '../raft/replica-leadership-state.js';
import {resolveReplicaRaftTiming} from '../raft/replica-raft-timing.js';
import {isPeerRowStatusAdmissible} from '../rebalancer/replica-status.js';
import {
  MESSAGE_GROUP_SERVICE_LOG_MSG,
  RAFT_ROLE as RaftRole,
} from './constants.js';
import {
  closeMessageGroupConsensus,
  leadLoneMessageGroup,
  openMessageGroupConsensusPort,
  readMessageGroupCommittedMembership,
} from './message-group-consensus-port.js';
import {MESSAGE_GROUP_SERVICE_LITERAL} from
  './message-group-service-runtime-support.js';

function isThisGroupsServiceRow(service, row) {
  return (row?.[COLUMN.GROUP_ID] || row?.group_id) === service.groupId &&
    (row?.[COLUMN.SERVICE_TYPE] || row?.service_type) ===
      SERVICE_TYPE.MESSAGE_GROUP;
}

function replicaIdOfServiceRow(row) {
  return row?.[COLUMN.SERVICE_ID] || row?.service_id ||
    row?.[COLUMN.REPLICA_ID] || row?.replica_id || null;
}

// The address a services row places its replica at: the row's own address,
// or the unified address of the replica on the row's node.
function peerAddressOfServiceRow(service, row, replicaId) {
  const serviceAddress = row?.[COLUMN.ADDRESS] || row?.address;
  if (typeof serviceAddress === 'string' && serviceAddress.length > 0) {
    return serviceAddress;
  }
  const serviceNodeId = row?.[COLUMN.NODE_ID] || row?.node_id;
  if (typeof serviceNodeId !== 'string' || serviceNodeId.length === 0) {
    return null;
  }
  return service.addressManager.format(
    serviceNodeId, ENTITY_TYPE.MESSAGE_GROUP, replicaId);
}

/**
 * The peers the authoritative services cache names for this group (all of
 * them, or only those named), by replica identity: live rows only, never
 * this replica itself - neither its own identity, wherever a row places it
 * (a move convergence names it on another node), nor its own address.
 * @param {Object} service - The message-group replica.
 * @param {Set<string>|null} onlyReplicaIds - The identities to consider.
 * @return {Map<string, string>} Replica identity to peer address.
 */
function expectedPeersFromServicesCache(service, onlyReplicaIds) {
  const expected = new Map();
  const rows = service.systemTableCache.filter(
    TABLES.SERVICES, (row) => isThisGroupsServiceRow(service, row));
  for (const row of rows) {
    const replicaId = replicaIdOfServiceRow(row);
    // The partition's peer-admission rule (F1): neither a retiring row nor
    // one that has not recorded its replica's identity fact names a peer.
    const status = row?.[COLUMN.STATUS] || row?.status;
    if (!replicaId || replicaId === service.replicaId ||
        !isPeerRowStatusAdmissible(status) ||
        (onlyReplicaIds !== null && !onlyReplicaIds.has(replicaId))) {
      continue;
    }
    const peerAddress = peerAddressOfServiceRow(service, row, replicaId);
    if (peerAddress && !service.isLocalForwardTarget(replicaId, peerAddress)) {
      expected.set(replicaId, peerAddress);
    }
  }
  return expected;
}

/**
 * Re-drive the admissions this replica proposed or deferred whenever a
 * configuration change settles and whenever it gains leadership: each is
 * re-evaluated once from its services row (the partition's re-drive,
 * verification V2).
 * @param {Object} service - The message-group replica (current port).
 * @return {void}
 */
function redriveMessageGroupAdmissions(service) {
  const redrive = () => {
    const taken = takeGroupAdmissionsInFlight(service.raft);
    if (taken.size > 0) {
      queueMicrotask(() =>
        service.reconcileRaftPeersFromCache({onlyReplicaIds: taken}));
    }
  };
  service.raft.subscribe(RAFT_EVENT.CONF_CHANGE_APPLIED, redrive);
  service.raft.subscribe(RAFT_EVENT.LEADER, redrive);
}

/**
 * Attach consensus lifecycle methods to the MessageGroupService prototype.
 * @param {Function} serviceClass - The MessageGroupService class.
 * @return {void}
 */
function assignRaftLifecycle(serviceClass) {
  Object.assign(serviceClass.prototype, {
    /**
     * Admit the peers the authoritative services cache names into the
     * group's configuration, through the group-neutral admission owner:
     * only the leader proposes; a follower records NOT_LEADER and is
     * re-driven if it gains leadership. Each replica the rows name is kept
     * in the group's hint list (replicaIds), as the partition keeps its
     * own: the lone-replica shortcuts and the forward targets read it, but
     * it is never the membership.
     * @param {Object} [options]
     * @param {Set<string>} [options.onlyReplicaIds] - Re-evaluate only these.
     * @return {void}
     */
    reconcileRaftPeersFromCache(options = {}) {
      if (
        !this.raft ||
        !this.systemTableCache ||
        typeof this.systemTableCache.filter !== 'function'
      ) {
        return;
      }
      const expected = expectedPeersFromServicesCache(
        this, options.onlyReplicaIds ?? null);
      for (const [replicaIdentity, peerAddress] of expected) {
        if (!this.replicaIds.includes(replicaIdentity)) {
          this.replicaIds.push(replicaIdentity);
        }
        reserveAndAdmitGroupPeer(this.raft, {
          groupId: this.groupId,
          localReplicaIdentity: this.replicaId,
          logger: this.logger,
        }, {replicaIdentity, peerAddress});
      }
    },
    /**
     * This replica's own committed configuration (a witness read through
     * its port): the voters and learners its applied ConfState names.
     * @return {Object} The port's frozen COMMITTED or REFUSED answer.
     */
    readCommittedMembership() {
      return readMessageGroupCommittedMembership(this);
    },
    /**
     * Initialize the message group service: open the replica's durable
     * consensus database and its raft-rs operation port, publish role,
     * leader and term from the port's announcements, admit the peers the
     * services cache names, and lead a lone replica's group.
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
      this.raftTimingConfig = resolveReplicaRaftTiming(this);
      try {
        await this.openConsensus();
      } catch (error) {
        this.logger.error(
          MESSAGE_GROUP_SERVICE_LITERAL.FAILED_DURING_INITIALIZE_CLEANING_UP_RAFT,
          {
            groupId: this.groupId,
            replicaId: this.replicaId,
            error: error.message,
          },
        );
        await closeMessageGroupConsensus(this);
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
     * Open the port and wire everything that follows it.
     * @return {Promise<void>}
     * @private
     */
    async openConsensus() {
      openMessageGroupConsensusPort(this);
      if (this.deferElection || this.shouldSuppressJoinPhaseRaftParticipation()) {
        this.logger.debug(
          MESSAGE_GROUP_SERVICE_LITERAL.DEFERRING_ELECTION_START,
          {groupId: this.groupId, replicaId: this.replicaId},
        );
      }
      this.wireRaftEvents();
      redriveMessageGroupAdmissions(this);
      this.raft.subscribe(
        RAFT_EVENT.COMMITTED_PREFIX_DIVERGENCE,
        (observation) => {
          this.logger.error(
            MESSAGE_GROUP_SERVICE_LOG_MSG.COMMITTED_PREFIX_DIVERGENCE,
            {groupId: this.groupId, replicaId: this.replicaId, ...observation},
          );
        },
      );
      this.reconcileRaftPeersFromCache();
      if (this.replicaIds.length === 1) {
        await leadLoneMessageGroup(this);
        this.electionStarted = true;
      }
    },
    /**
     * Publish role, leader and term from the port's announcements. The term
     * is the core's own (readStatus().term); committed entries reach the
     * state machine only through the port's committed-entry application,
     * which is why no commit event is wired.
     * Requirements: 5.1, 5.2, 5.3, 5.4
     * @private
     */
    wireRaftEvents() {
      wireReplicaLifecycleEvents(this, {
        events: RAFT_EVENT,
        roles: RaftRole,
        getCurrentTerm: () => this.getCurrentTerm(),
        normalizeLeaderId: (candidate) =>
          this.normalizeLeaderReplicaId(candidate),
        // A joining replica takes no part until its join converged: it
        // never leads, its published role stays a follower, and its port
        // stops scheduling (as the partition's joining learner keeps its
        // role).
        shouldIgnoreLeaderEvent: () => this.ignoreJoinPhaseRoleEvent(),
        shouldIgnoreDemotionEvent: () => this.ignoreJoinPhaseRoleEvent(),
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
     * Start this replica's scheduling (its election timer).
     * Call this after all replicas in the group have been created and
     * registered: it prevents election storms when multiple replicas are
     * created on the same node. A joining replica starts only once its join
     * converged (completeJoinConvergence); a lone replica already leads.
     * @return {void}
     */
    startElection() {
      if (this.shouldSuppressJoinPhaseRaftParticipation() ||
          this.electionStarted) {
        return;
      }
      this.electionStarted = true;
      if (!this.raft || this.replicaIds.length === 1) {
        return;
      }
      this.logger.debug(
        MESSAGE_GROUP_SERVICE_LITERAL.STARTING_RAFT_ELECTION_TIMER,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
          peerCount: this.replicaIds.length - 1,
        },
      );
      this.raft.startScheduling();
    },
    clearJoinExistingGroupTimers() {
      this.raft?.stopScheduling();
    },
    /**
     * Whether a role announcement of the port is ignored because the
     * replica is still joining; an ignored one stops the port's scheduling.
     * @return {boolean} True while join-phase participation is suppressed.
     * @private
     */
    ignoreJoinPhaseRoleEvent() {
      if (!this.shouldSuppressJoinPhaseRaftParticipation()) {
        return false;
      }
      this.clearJoinExistingGroupTimers();
      return true;
    },
    shouldSuppressJoinPhaseRaftParticipation() {
      return (
        this.isJoiningExistingGroup === true ||
        this.deferElectionUntilJoinConvergence === true
      );
    },
    /**
     * Release join-time participation suppression once the local node has
     * completed convergence and may participate normally in control-plane
     * leadership.
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
