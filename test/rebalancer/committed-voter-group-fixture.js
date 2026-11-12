/**
 * A partition's raft group as its replicas' own ports answer it: the test
 * double behind the REPLACE witness read (READ_REPLICA_MEMBERSHIP) when the
 * subject is the committed-voter evidence itself - the completion authority
 * and the remove-safety floor's committed-voter credit.
 *
 * Unlike the fixture-world witness (test-helpers.js, a leader that names
 * itself alone), every replica answers for itself: the committed voters, the
 * leader it follows, its term and its participation gate. A replica can be
 * silent (its process is gone: the delivery fails, nothing answers), below
 * its gate, or absent from the committed voters although a services row
 * still names it. Nothing here is derived from rows.
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

const GROUP_TRANSFER_WINDOW_MS = 1_000;
const GROUP_COMMIT_INDEX = 10;
const GROUP_TERM = 1;
const PORT_OUTCOME_PROPOSED = 'PROPOSED';
const SILENT_REPLICA_ERROR = 'committed voter group: replica is silent';

/**
 * @param {Object} options
 * @param {string[]} options.voterReplicaIds - The committed voters.
 * @param {string} options.leaderReplicaId - The leader every live replica
 *   follows (and the leader's own answer).
 * @param {function(string): boolean} [options.isSilent] - Whether a
 *   replica's process is gone (asked at every read).
 * @param {string[]} [options.gateClosedReplicaIds] - Replicas below their
 *   participation gate.
 * @param {string[]} [options.votersOutgoingReplicaIds] - The outgoing voters
 *   of a joint configuration (none: the configuration is not joint).
 * @return {Object} The group double.
 */
export function createCommittedVoterGroup(options) {
  const group = {
    voterReplicaIds: [...options.voterReplicaIds],
    leaderReplicaId: options.leaderReplicaId,
    isSilent: options.isSilent || (() => false),
    gateClosedReplicaIds: new Set(options.gateClosedReplicaIds || []),
    votersOutgoingReplicaIds: [...(options.votersOutgoingReplicaIds || [])],
    reads: [],
    /**
     * The addressed replica's answer to a witness message; undefined for any
     * other message; throws when the addressed replica is silent.
     * @param {Object} payload
     * @return {Object|undefined}
     */
    answer(payload) {
      const type = payload?.[ReplicaOperationField.TYPE];
      if (type === ReplicaOperationMessageType.RETIRE_REPLICA_PEER) {
        return {
          status: ReplicaOperationResponseStatus.INITIATED,
          [ReplicaOperationField.PROPOSAL]: {outcome: PORT_OUTCOME_PROPOSED},
        };
      }
      if (type !== ReplicaOperationMessageType.READ_REPLICA_MEMBERSHIP) {
        return undefined;
      }
      const addressed = payload[ReplicaOperationField.REPLICA_ID];
      group.reads.push(addressed);
      if (group.isSilent(addressed)) {
        throw new Error(SILENT_REPLICA_ERROR);
      }
      const sourceVoter = group.voterReplicaIds.includes(
        payload[ReplicaOperationField.SOURCE_REPLICA_ID]);
      return {
        status: ReplicaOperationResponseStatus.COMPLETED,
        [ReplicaOperationField.MEMBERSHIP]: {
          state: sourceVoter ?
            PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER :
            PARTITION_REPLICA_MEMBERSHIP_STATE.ABSENT,
          replicaId: addressed,
          partitionId: payload[ReplicaOperationField.PARTITION_ID],
          term: GROUP_TERM,
          commitIndex: GROUP_COMMIT_INDEX,
          appliedIndex: GROUP_COMMIT_INDEX,
          gateOpen: !group.gateClosedReplicaIds.has(addressed),
          leaderReplicaId: group.leaderReplicaId,
          voterReplicaIds: [...group.voterReplicaIds],
          votersOutgoingReplicaIds: [...group.votersOutgoingReplicaIds],
          transferWindowMaxMs: GROUP_TRANSFER_WINDOW_MS,
        },
      };
    },
  };
  return group;
}

/**
 * A router whose witness messages the group's replicas answer; every other
 * message reaches the test's own router unchanged. A silent replica's read
 * fails as a delivery failure, never as an application answer.
 * @param {Object} router - A message router with deliver().
 * @param {Object} group - createCommittedVoterGroup result.
 * @return {Object} The same router.
 */
export function withCommittedVoterGroup(router, group) {
  const deliver = router.deliver.bind(router);
  router.deliver = async (target, payload, deliverOptions) => {
    const answered = group.answer(payload);
    return answered === undefined ?
      deliver(target, payload, deliverOptions) :
      buildDeliveryEnvelope({acknowledged: true}, answered);
  };
  return router;
}
