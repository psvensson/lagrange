/**
 * ReplicaHandler leader-handoff methods.
 *
 * Owns demotion of a tracked leader replica before safe source removal and
 * the explicit replacement-leader election request path.
 *
 * Requirements: 10.2, 3.1
 */
import {RAFT_ROLE} from '../raft/constants.js';
import {performTrackedLeaderDemotion} from '../raft/tracked-leader-demotion.js';
import {ReplicaOperationReason} from '../rebalancer/replica-operation-constants.js';
import {REPLICA_HANDLER_TYPEOF} from './replica-handler-constants.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const REPLICA_HANDLER_LEADER_HANDOFF_STATE = Object.freeze({
  COMPLETED: 'completed',
  NOT_APPLICABLE: 'not_applicable',
  NOT_SUPPORTED: 'not_supported',
});
function assignReplicaHandlerLeaderHandoffMethods(ReplicaHandler) {
  class ReplicaHandlerLeaderHandoffMethods {
    /**
     * Request replacement ownership through the explicit election capability.
     * Older provider doubles can still use the timer path, but real runtime
     * providers must expose requestElectionNow via the Raft provider contract.
     * @param {Object|null} raftProvider
     * @param {Object|null} raft
     * @return {string} Canonical leader handoff state.
     * @private
     */
    requestTrackedReplacementLeaderElection(raftProvider, raft) {
      if (!raftProvider || !raft) {
        return REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_SUPPORTED;
      }
      if (
        typeof raftProvider.requestElectionNow ===
        REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        raftProvider.requestElectionNow(raft);
        return REPLICA_HANDLER_LEADER_HANDOFF_STATE.COMPLETED;
      }
      if (
        typeof raftProvider.startElectionTimer !==
        REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        return REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_SUPPORTED;
      }
      raftProvider.startElectionTimer(raft);
      return REPLICA_HANDLER_LEADER_HANDOFF_STATE.COMPLETED;
    }

    /**
     * Demote a tracked leader replica before safe source removal.
     * @param {string} replicaId - Replica ID to demote.
     * @return {string} Canonical leader handoff state.
     * @private
     */
    requestTrackedPartitionLeaderHandoff(replicaId, reason = null) {
      const service = this.getTrackedService(replicaId);
      if (!service) {
        return REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_APPLICABLE;
      }
      const trackedRole = this.getTrackedReplicaRole(replicaId);
      const raft = service.raft || null;
      const raftProvider = service.raftProvider || null;
      if (
        reason === ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION
      ) {
        // The replacement election names the replica that SHOULD lead. When
        // it already leads (an ambient election won the race with this
        // request), the goal is achieved — falling through to the demotion
        // branch would step down the very replica being elected and hand
        // leadership back to the drained node. A mid-election candidate is
        // likewise left to finish seeking the leadership this request asks
        // for.
        if (trackedRole === RAFT_ROLE.FOLLOWER) {
          return this.requestTrackedReplacementLeaderElection(
            raftProvider,
            raft,
          );
        }
        return REPLICA_HANDLER_LEADER_HANDOFF_STATE.COMPLETED;
      }
      if (trackedRole !== RAFT_ROLE.LEADER) {
        return REPLICA_HANDLER_LEADER_HANDOFF_STATE.COMPLETED;
      }
      if (
        !raft ||
        typeof raft.change !== REPLICA_HANDLER_TYPEOF.FUNCTION ||
        !raftProvider ||
        typeof raftProvider.startElectionTimer !==
          REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        return REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_SUPPORTED;
      }
      // The demotion sequence itself is shared with the partition-level
      // durability-fitness detector (src/raft/tracked-leader-demotion.js) —
      // one owner for the flap-safe ordering.
      performTrackedLeaderDemotion(service);
      return REPLICA_HANDLER_LEADER_HANDOFF_STATE.COMPLETED;
    }
  }
  for (const methodName of Object.getOwnPropertyNames(
    ReplicaHandlerLeaderHandoffMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaHandler.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerLeaderHandoffMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaHandlerLeaderHandoffMethods};
