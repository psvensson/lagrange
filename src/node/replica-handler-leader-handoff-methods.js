/**
 * ReplicaHandler leader-handoff methods.
 *
 * Owns demotion of a tracked leader replica before safe source removal and
 * the explicit replacement-leader election request path.
 *
 * Every handoff resolves to a typed result naming the branch taken and the
 * tracked role it judged, so a role-gated no-op (COMPLETED without arming
 * anything) is observable at the caller and in the step-down response —
 * run 20260810T221340Z proved a silent no-op is otherwise indistinguishable
 * from an armed election (quest user-table-leader-handoff-demotion-pairing).
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
const REPLICA_HANDLER_LEADER_HANDOFF_BRANCH = Object.freeze({
  ARMED_DIRECTED_ELECTION: 'armed_directed_election',
  ARMED_ELECTION_TIMER: 'armed_election_timer',
  DEMOTED_LEADER: 'demoted_leader',
  PROVIDER_UNSUPPORTED: 'provider_unsupported',
  REPLICA_NOT_TRACKED: 'replica_not_tracked',
  SOURCE_DEMOTION_ROLE_NO_OP: 'source_demotion_role_no_op',
  TARGET_ELECTION_ROLE_NO_OP: 'target_election_role_no_op',
});

function buildLeaderHandoffResult(state, branch, trackedRole) {
  return Object.freeze({
    branch,
    state,
    trackedRole: typeof trackedRole === 'string' ? trackedRole : null,
  });
}

function assignReplicaHandlerLeaderHandoffMethods(ReplicaHandler) {
  class ReplicaHandlerLeaderHandoffMethods {
    /**
     * Request replacement ownership through the explicit election capability.
     * Older provider doubles can still use the timer path, but real runtime
     * providers must expose requestElectionNow via the Raft provider contract.
     * @param {Object|null} raftProvider
     * @param {Object|null} raft
     * @param {string|null} trackedRole
     * @return {Object} Frozen typed leader-handoff result.
     * @private
     */
    requestTrackedReplacementLeaderElection(raftProvider, raft, trackedRole) {
      if (!raftProvider || !raft) {
        return buildLeaderHandoffResult(
          REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_SUPPORTED,
          REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.PROVIDER_UNSUPPORTED,
          trackedRole,
        );
      }
      if (
        typeof raftProvider.requestElectionNow ===
        REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        raftProvider.requestElectionNow(raft);
        return buildLeaderHandoffResult(
          REPLICA_HANDLER_LEADER_HANDOFF_STATE.COMPLETED,
          REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.ARMED_DIRECTED_ELECTION,
          trackedRole,
        );
      }
      if (
        typeof raftProvider.startElectionTimer !==
        REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        return buildLeaderHandoffResult(
          REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_SUPPORTED,
          REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.PROVIDER_UNSUPPORTED,
          trackedRole,
        );
      }
      raftProvider.startElectionTimer(raft);
      return buildLeaderHandoffResult(
        REPLICA_HANDLER_LEADER_HANDOFF_STATE.COMPLETED,
        REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.ARMED_ELECTION_TIMER,
        trackedRole,
      );
    }

    /**
     * Demote a tracked leader replica before safe source removal.
     * @param {string} replicaId - Replica ID to demote.
     * @return {Object} Frozen typed leader-handoff result.
     * @private
     */
    requestTrackedPartitionLeaderHandoff(replicaId, reason = null) {
      const service = this.getTrackedService(replicaId);
      if (!service) {
        return buildLeaderHandoffResult(
          REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_APPLICABLE,
          REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.REPLICA_NOT_TRACKED,
          null,
        );
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
            trackedRole,
          );
        }
        return buildLeaderHandoffResult(
          REPLICA_HANDLER_LEADER_HANDOFF_STATE.COMPLETED,
          REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TARGET_ELECTION_ROLE_NO_OP,
          trackedRole,
        );
      }
      if (trackedRole !== RAFT_ROLE.LEADER) {
        return buildLeaderHandoffResult(
          REPLICA_HANDLER_LEADER_HANDOFF_STATE.COMPLETED,
          REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.SOURCE_DEMOTION_ROLE_NO_OP,
          trackedRole,
        );
      }
      if (
        !raft ||
        typeof raft.change !== REPLICA_HANDLER_TYPEOF.FUNCTION ||
        !raftProvider ||
        typeof raftProvider.startElectionTimer !==
          REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        return buildLeaderHandoffResult(
          REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_SUPPORTED,
          REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.PROVIDER_UNSUPPORTED,
          trackedRole,
        );
      }
      // The demotion sequence itself is shared with the partition-level
      // durability-fitness detector (src/raft/tracked-leader-demotion.js) —
      // one owner for the flap-safe ordering.
      performTrackedLeaderDemotion(service);
      return buildLeaderHandoffResult(
        REPLICA_HANDLER_LEADER_HANDOFF_STATE.COMPLETED,
        REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.DEMOTED_LEADER,
        trackedRole,
      );
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

export {
  REPLICA_HANDLER_LEADER_HANDOFF_BRANCH,
  REPLICA_HANDLER_LEADER_HANDOFF_STATE,
  assignReplicaHandlerLeaderHandoffMethods,
};
