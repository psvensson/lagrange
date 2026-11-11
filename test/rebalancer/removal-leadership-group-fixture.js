/**
 * A partition group as a test double for the removal leadership gate: what
 * each member's replica handler answers to READ_REPLICA_MEMBERSHIP (its own
 * committed configuration, term and leader, past its participation gate) and
 * to STEP_DOWN_REPLICA (a named transfer the member forwards to its leader).
 * The group's leadership is the fixture's state - a test moves it the way
 * raft would (an election, a completed transfer); nothing here derives it
 * from rows. Rows are produced only as routes (the gate's route read).
 */
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {
  PARTITION_REPLICA_MEMBERSHIP_STATE,
} from '../../src/partition/partition-replica-membership-constants.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  REPLICA_HANDLER_LEADER_HANDOFF_BRANCH,
} from '../../src/node/replica-handler-leader-handoff-methods.js';

const DEFAULT_COMMIT_INDEX = 10;
const DEFAULT_TRANSFER_WINDOW_MS = 1_000;

/**
 * @param {Object} options
 * @param {string} options.partitionId
 * @param {Object[]} options.members - {replicaId, nodeId, gateOpen?,
 *   appliedIndex?, voter?} per member; voter defaults to true.
 * @param {string|null} options.leaderReplicaId - Who leads (null: nobody).
 * @param {number} [options.term=1]
 * @param {boolean} [options.transferOnStepDown=false] - A STEP_DOWN to a
 *   member makes it the leader at the next term (the transfer completes).
 * @return {Object} The group double.
 */
export function createLeadershipGroup(options) {
  const group = {
    partitionId: options.partitionId,
    members: options.members.map((member) => ({
      voter: true, gateOpen: true, appliedIndex: DEFAULT_COMMIT_INDEX,
      ...member,
    })),
    leaderReplicaId: options.leaderReplicaId ?? null,
    term: options.term ?? 1,
    commitIndex: DEFAULT_COMMIT_INDEX,
    transferOnStepDown: options.transferOnStepDown === true,
    // Members whose node does not answer (dead or unreachable).
    downReplicaIds: new Set(options.downReplicaIds ?? []),
    // Members whose own view differs ({leaderReplicaId, term}): stale views.
    viewByReplicaId: options.viewByReplicaId ?? {},
    reads: [],
    stepDowns: [],
    rows() {
      return group.members.map((member) => ({
        replica_id: member.replicaId,
        service_id: member.replicaId,
        partition_id: group.partitionId,
        node_id: member.nodeId,
        service_type: 'partition',
        status: 'active',
      }));
    },
    member(replicaId) {
      return group.members.find((member) => member.replicaId === replicaId) ??
        null;
    },
    elect(replicaId) {
      group.leaderReplicaId = replicaId;
      group.term += 1;
    },
    answer(payload) {
      const type = payload?.[ReplicaOperationField.TYPE];
      const addressed = payload?.[ReplicaOperationField.REPLICA_ID];
      const member = group.member(addressed);
      const reachable = member !== null && !group.downReplicaIds.has(addressed);
      if (type === ReplicaOperationMessageType.READ_REPLICA_MEMBERSHIP) {
        group.reads.push(addressed);
        if (!reachable) {
          return {status: ReplicaOperationResponseStatus.ERROR,
            error: 'member unavailable'};
        }
        return answerMembership(group, member, payload);
      }
      if (type === ReplicaOperationMessageType.STEP_DOWN_REPLICA) {
        group.stepDowns.push(addressed);
        if (!reachable) {
          return {status: ReplicaOperationResponseStatus.NOT_FOUND};
        }
        // The named transfer is forwarded to the leader: a dead or absent
        // leader cannot transfer (the port refuses typed, nothing changed).
        if (group.leaderReplicaId === null ||
            group.downReplicaIds.has(group.leaderReplicaId)) {
          return {status: ReplicaOperationResponseStatus.ERROR,
            error: 'transfer refused: no live leader'};
        }
        if (group.transferOnStepDown) {
          group.elect(addressed);
        }
        return {
          status: ReplicaOperationResponseStatus.COMPLETED,
          handoffBranch: REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TRANSFER_FORWARDED,
          [ReplicaOperationField.ATTEMPT_SEQ]:
            payload?.[ReplicaOperationField.ATTEMPT_SEQ],
        };
      }
      return undefined;
    },
    router() {
      return {
        deliver: async (_target, payload) => {
          const answered = group.answer(payload);
          return answered === undefined ?
            buildDeliveryEnvelope({acknowledged: true},
              {status: ReplicaOperationResponseStatus.INITIATED}) :
            buildDeliveryEnvelope({acknowledged: true}, answered);
        },
      };
    },
  };
  return group;
}

function answerMembership(group, member, payload) {
  const view = group.viewByReplicaId[member.replicaId] ?? {};
  const voters = group.members.filter((candidate) => candidate.voter)
    .map((candidate) => candidate.replicaId);
  const subject = payload[ReplicaOperationField.SOURCE_REPLICA_ID];
  return {
    status: ReplicaOperationResponseStatus.COMPLETED,
    [ReplicaOperationField.MEMBERSHIP]: {
      state: voters.includes(subject) ?
        PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER :
        PARTITION_REPLICA_MEMBERSHIP_STATE.ABSENT,
      replicaId: member.replicaId,
      partitionId: group.partitionId,
      term: view.term ?? group.term,
      commitIndex: group.commitIndex,
      appliedIndex: member.replicaId === group.leaderReplicaId ?
        group.commitIndex : member.appliedIndex,
      gateOpen: member.gateOpen,
      leaderReplicaId: Object.hasOwn(view, 'leaderReplicaId') ?
        view.leaderReplicaId : group.leaderReplicaId,
      voterReplicaIds: voters,
      votersOutgoingReplicaIds: [],
      transferWindowMaxMs: DEFAULT_TRANSFER_WINDOW_MS,
    },
  };
}
