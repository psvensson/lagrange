import {readReplicaRoleAndTerm, readReplicaServiceRole, isReplicaServiceLeader} from '../raft/replica-leadership-state.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';

const MESSAGE_GROUP_SERVICE_LEADERSHIP_STATE_RUNTIME_LITERAL = {
  CONSTRUCTOR: 'constructor',
};

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
      if (!this.isLeaderReplica()) return false;
      const read = this.raft.readRoleAndTerm();
      return read.outcome === RAFT_OPERATION_OUTCOME.CORE_OK && read.role === RaftRole.LEADER;
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
      return this.isLeader === true && this.leadershipTenure != null &&
      isReplicaServiceLeader(this);
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
      return readReplicaServiceRole(this);
    }
    /**
     * Get the core's current term, or throw with the exact refused Raft answer.
     * No committed ledger projection can substitute for current authority.
     * @return {number} Current term.
     */
    getCurrentTerm() {
      return readReplicaRoleAndTerm(this).term;
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
