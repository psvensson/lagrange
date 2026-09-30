/**
 * ReplicaHandler leader-handoff methods.
 *
 * Owns the two STEP_DOWN_REPLICA handoffs a tracked partition replica is
 * asked for: the source-side handoff (leadership leaves the replica being
 * removed) and the replacement-target election (leadership moves to the
 * replica asked). Both are one leadership transfer, asked of the partition's
 * one issuer (PartitionService.requestLeadershipTransfer): the source hands
 * leadership to its most caught-up voter, the target names itself.
 *
 * Every handoff resolves to a typed result naming the branch taken and the
 * tracked role it judged, so a role-gated no-op (COMPLETED without asking
 * anything) is observable at the caller and in the step-down response -
 * run 20260810T221340Z proved a silent no-op is otherwise indistinguishable
 * from a real handoff (quest user-table-leader-handoff-demotion-pairing). A
 * transfer the port refused carries its typed reason, and nothing changed.
 *
 * Requirements: 10.2, 3.1
 */
import {RAFT_ROLE} from '../raft/constants.js';
import {
  RAFT_LEADERSHIP_TRANSFER_REASON,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_OPERATION_OUTCOME,
} from '../raft/raft-operation-port-constants.js';
import {ReplicaOperationReason} from '../rebalancer/replica-operation-constants.js';
import {REPLICA_HANDLER_TYPEOF} from './replica-handler-constants.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const REPLICA_HANDLER_LEADER_HANDOFF_STATE = Object.freeze({
  COMPLETED: 'completed',
  NOT_APPLICABLE: 'not_applicable',
  NOT_SUPPORTED: 'not_supported',
  REFUSED: 'refused',
});
const REPLICA_HANDLER_LEADER_HANDOFF_BRANCH = Object.freeze({
  TRANSFER_REQUESTED: 'transfer_requested',
  TRANSFER_FORWARDED: 'transfer_forwarded',
  ALREADY_LEADER: 'already_leader',
  TRANSFER_REFUSED: 'transfer_refused',
  PROVIDER_UNSUPPORTED: 'provider_unsupported',
  REPLICA_NOT_TRACKED: 'replica_not_tracked',
  SOURCE_DEMOTION_ROLE_NO_OP: 'source_demotion_role_no_op',
  TARGET_ELECTION_ROLE_NO_OP: 'target_election_role_no_op',
});
// The branch each accepted transfer answer names.
const ACCEPTED_TRANSFER_BRANCH = Object.freeze({
  [RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_REQUESTED]:
    REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TRANSFER_REQUESTED,
  [RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_FORWARDED]:
    REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TRANSFER_FORWARDED,
  [RAFT_LEADERSHIP_TRANSFER_REASON.ALREADY_LEADER]:
    REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.ALREADY_LEADER,
});

function buildLeaderHandoffResult(state, branch, trackedRole, transfer = null) {
  return Object.freeze({
    branch,
    state,
    trackedRole: typeof trackedRole === 'string' ? trackedRole : null,
    ...(transfer === null ? {} : {transfer}),
  });
}

// What the port answered, as a handoff: an accepted transfer is COMPLETED on
// the branch its reason names (acceptance, not completion - the leader rows
// stay the completion authority); anything else is REFUSED with the port's
// own record, and nothing changed.
function handoffOfTransferAnswer(answer, trackedRole) {
  const accepted = answer?.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
    Object.hasOwn(ACCEPTED_TRANSFER_BRANCH, answer.reason);
  return accepted ?
    buildLeaderHandoffResult(
      REPLICA_HANDLER_LEADER_HANDOFF_STATE.COMPLETED,
      ACCEPTED_TRANSFER_BRANCH[answer.reason], trackedRole, answer) :
    buildLeaderHandoffResult(
      REPLICA_HANDLER_LEADER_HANDOFF_STATE.REFUSED,
      REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TRANSFER_REFUSED, trackedRole,
      answer ?? null);
}

// The transfer each handoff reason asks for, from the role the replica is
// tracked in; null when the role makes the handoff a named no-op.
function transferRequestOf(reason, replicaId, trackedRole) {
  if (reason === ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION) {
    // The replacement election names the replica that SHOULD lead. When it
    // already leads (an ambient election won the race with this request),
    // the goal is achieved; a mid-election candidate is left to finish
    // seeking the leadership this request asks for.
    return trackedRole === RAFT_ROLE.FOLLOWER ? {
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: replicaId,
    } : null;
  }
  return trackedRole === RAFT_ROLE.LEADER ? {
    successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.MOST_CAUGHT_UP,
  } : null;
}

function roleNoOpBranchOf(reason) {
  return reason === ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION ?
    REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TARGET_ELECTION_ROLE_NO_OP :
    REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.SOURCE_DEMOTION_ROLE_NO_OP;
}

function assignReplicaHandlerLeaderHandoffMethods(ReplicaHandler) {
  class ReplicaHandlerLeaderHandoffMethods {
    /**
     * Hand a tracked partition replica's leadership on, as the step-down
     * reason asks: to the replica itself for the replacement-target
     * election, away from it (to its most caught-up voter) otherwise.
     * @param {string} replicaId - Replica asked.
     * @param {string|null} reason - The STEP_DOWN_REPLICA reason.
     * @return {Promise<Object>} Frozen typed leader-handoff result.
     * @private
     */
    async requestTrackedPartitionLeaderHandoff(replicaId, reason = null) {
      const service = this.getTrackedService(replicaId);
      if (!service) {
        return buildLeaderHandoffResult(
          REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_APPLICABLE,
          REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.REPLICA_NOT_TRACKED,
          null,
        );
      }
      const trackedRole = this.getTrackedReplicaRole(replicaId);
      const transferRequest = transferRequestOf(reason, replicaId, trackedRole);
      if (transferRequest === null) {
        return buildLeaderHandoffResult(
          REPLICA_HANDLER_LEADER_HANDOFF_STATE.COMPLETED,
          roleNoOpBranchOf(reason),
          trackedRole,
        );
      }
      if (typeof service.requestLeadershipTransfer !==
          REPLICA_HANDLER_TYPEOF.FUNCTION) {
        return buildLeaderHandoffResult(
          REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_SUPPORTED,
          REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.PROVIDER_UNSUPPORTED,
          trackedRole,
        );
      }
      return handoffOfTransferAnswer(
        await service.requestLeadershipTransfer(transferRequest),
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
