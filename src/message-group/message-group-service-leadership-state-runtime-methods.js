import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';

const MESSAGE_GROUP_SERVICE_LEADERSHIP_STATE_RUNTIME_LITERAL = {
  CONSTRUCTOR: 'constructor',
};

// The core's own status through this replica's port; null without a port or
// while the port does not answer CORE_OK.
function readCoreStatus(service) {
  const status = service.raft?.readStatus();
  return status?.outcome === RAFT_OPERATION_OUTCOME.CORE_OK ? status : null;
}

function createMessageGroupServiceLeadershipStateRuntimeMethods(deps = {}) {
  const {
    MESSAGE_GROUP_SERVICE_LITERAL,
    MESSAGE_GROUP_SERVICE_LOG_MSG,
    RaftRole,
    normalizePublishedRaftRole,
  } = deps;

  class MessageGroupServiceLeadershipStateRuntimeMethods {
    normalizeLeaderReplicaId(candidate) {
      return this.forwardingOwner.normalizeLeaderReplicaId(candidate);
    }
    resolveLivePeerAddressFromConsensus(peerId) {
      return this.forwardingOwner.resolveLivePeerAddressFromConsensus(peerId);
    }
    resolveCDCForwardSelection(logContext = {}) {
      return this.forwardingOwner.resolveCDCForwardSelection(logContext);
    }
    /**
     * Determine whether this replica is currently the active Raft leader:
     * it published leadership and its core still leads.
     * @return {boolean}
     * @private
     */
    isCurrentRaftLeader() {
      return this.isLeaderReplica() &&
        readCoreStatus(this)?.role === RaftRole.LEADER;
    }
    cancelLeaderOwnedActivation() {
      this.leaderActivationGate.cancel({clearActivatedTerm: true});
    }
    scheduleLeaderOwnedActivation(term) {
      this.leaderActivationGate.schedule(
        term,
        () => {
          if (!this.raft || !this.isLeaderReplica()) {
            return;
          }
          this.updateRebalancerLeadership();
          const existingSubscriptions = this.cdcHandler.getSubscriptions();
          if (
            existingSubscriptions.length > 0 &&
            this.lastLeaderCdcResubscribeTerm !== term
          ) {
            this.lastLeaderCdcResubscribeTerm = term;
            this.logger.info(
              MESSAGE_GROUP_SERVICE_LOG_MSG.CDC_RESUBSCRIBE_ON_LEADER,
              {
                term,
                replicaId: this.replicaId,
                groupId: this.groupId,
                tableCount: existingSubscriptions.length,
              },
            );
            for (const tableName of existingSubscriptions) {
              this.subscribeToCDC(tableName);
            }
            this.logger.info(
              MESSAGE_GROUP_SERVICE_LOG_MSG.CDC_RESUBSCRIBE_ON_LEADER_COMPLETE,
              {
                term,
                replicaId: this.replicaId,
                groupId: this.groupId,
                tableCount: existingSubscriptions.length,
              },
            );
          }
          this.logger.info(MESSAGE_GROUP_SERVICE_LITERAL.BECAME_LEADER, {
            term,
            replicaId: this.replicaId,
            groupId: this.groupId,
          });
          this.emit(MESSAGE_GROUP_SERVICE_LITERAL.LEADERELECTED, {
            leaderId: this.replicaId,
            term,
            groupId: this.groupId,
          });
        },
        {
          immediate: this.replicaIds.length === 1,
          shouldActivate: () => this.raft !== null && this.isLeaderReplica(),
        },
      );
    }
    /**
     * Queue a raft role update for persistence.
     * @param {string} role - New raft role.
     * @private
     */
    queueRoleUpdate(role) {
      this.roleMutationHelper.queue(
        normalizePublishedRaftRole(role, {collapseLeaderToFollower: true}),
      );
    }
    /**
     * Queue a message group leader update for persistence.
     * @param {string} leaderNodeId - Leader node ID.
     * @private
     */
    queueLeaderNodeUpdate(leaderNodeId) {
      this.leaderNodeMutationHelper.queue(leaderNodeId);
    }
    /**
     * Persist the latest pending raft role update.
     * @return {Promise<void>}
     * @private
     */
    async flushRoleUpdate() {
      return this.roleMutationHelper.flush();
    }
    /**
     * Persist the latest pending message group leader update.
     * @return {Promise<void>}
     * @private
     */
    async flushLeaderNodeUpdate() {
      return this.leaderNodeMutationHelper.flush();
    }
    /**
     * Check if this replica is the leader.
     * Requirements: 5.5
     * @return {boolean} True if leader.
     */
    isLeaderReplica() {
      return this.role === RaftRole.LEADER;
    }
    /**
     * Get the current leader ID.
     * Requirements: 5.4
     * @return {string|null} Leader replica ID.
     */
    getLeaderId() {
      return this.leaderId;
    }
    /**
     * Get the current Raft role.
     * Requirements: 5.5
     * @return {string} Current role.
     */
    getRole() {
      return this.role;
    }
    /**
     * Get the current term: the core's own, or the last term this replica
     * published while it has no readable core.
     * @return {number} Current term.
     */
    getCurrentTerm() {
      const term = readCoreStatus(this)?.term;
      return Number.isFinite(term) ? term : this.operationLedger.currentTerm;
    }
  }

  return MessageGroupServiceLeadershipStateRuntimeMethods;
}

function defineMessageGroupServiceLeadershipStateRuntimeMethods(
  prototype,
  deps = {},
) {
  const MessageGroupServiceLeadershipStateRuntimeMethods =
    createMessageGroupServiceLeadershipStateRuntimeMethods(deps);
  const descriptors = Object.getOwnPropertyDescriptors(
    MessageGroupServiceLeadershipStateRuntimeMethods.prototype,
  );
  delete descriptors[
    MESSAGE_GROUP_SERVICE_LEADERSHIP_STATE_RUNTIME_LITERAL.CONSTRUCTOR
  ];
  Object.defineProperties(prototype, descriptors);
}

export {defineMessageGroupServiceLeadershipStateRuntimeMethods};
