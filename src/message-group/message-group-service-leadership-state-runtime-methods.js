const MESSAGE_GROUP_SERVICE_LEADERSHIP_STATE_RUNTIME_LITERAL = {
  CONSTRUCTOR: 'constructor',
};

function createMessageGroupServiceLeadershipStateRuntimeMethods(deps = {}) {
  const {
    LifeRaft,
    MESSAGE_GROUP_SERVICE_LITERAL,
    MESSAGE_GROUP_SERVICE_LOG_MSG,
    RaftRole,
    normalizePublishedRaftRole,
  } = deps;

  class MessageGroupServiceLeadershipStateRuntimeMethods {
    normalizeLeaderReplicaId(candidate) {
      return this.forwardingOwner.normalizeLeaderReplicaId(candidate);
    }
    resolveLivePeerAddressFromRaftNodes(peerId) {
      return this.forwardingOwner.resolveLivePeerAddressFromRaftNodes(peerId);
    }
    resolveCDCForwardSelection(logContext = {}) {
      return this.forwardingOwner.resolveCDCForwardSelection(logContext);
    }
    /**
     * Determine whether this replica is currently the active Raft leader.
     * @return {boolean}
     * @private
     */
    isCurrentRaftLeader() {
      return Boolean(
        this.raft &&
        this.raft.state === LifeRaft.LEADER &&
        this.isLeaderReplica(),
      );
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
     * Get the current term.
     * @return {number} Current term.
     */
    getCurrentTerm() {
      return this.raft ?
        this.raftProvider.getCurrentTerm(this.raft) :
        this.operationLedger.currentTerm;
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
