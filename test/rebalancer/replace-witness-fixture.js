/**
 * The REPLACE witness replica as a test double (quest
 * replace-source-removal-owner, amendment-1 steps 2-3): what the target
 * replica's handler answers to READ_REPLICA_MEMBERSHIP (its own committed
 * configuration, commit index and leader) and to RETIRE_REPLICA_PEER (a
 * REMOVE_PEER proposed through its port). The committed configuration is
 * the fixture's state - a test moves it the way raft would (a removal commits
 * only when the test says so); nothing here derives it from rows.
 */
import {
  PARTITION_REPLICA_MEMBERSHIP_STATE,
} from '../../src/partition/partition-replica-membership-constants.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';

const DEFAULT_TRANSFER_WINDOW_MS = 1_000;
const DEFAULT_COMMIT_INDEX = 10;
const PORT_OUTCOME_PROPOSED = 'PROPOSED';

/**
 * @param {Object} options
 * @param {string|null} [options.leaderReplicaId] - Who the witness sees
 *   leading.
 * @param {boolean} [options.addressedLeads=false] - The addressed replica
 *   answers as the group's leader (F1: the completion authority is the
 *   leader's answer) when the test does not know the target id up front.
 * @param {boolean} [options.sourceVoter=true] - Whether the source is in the
 *   witness's committed voters.
 * @param {boolean} [options.available=true] - Whether the witness answers.
 * @param {number} [options.appliedLag=0] - How far the answered applied
 *   index trails the commit index (F-3: a configuration applied below the
 *   commit index).
 * @param {string[]|null} [options.voters] - The committed voters the answer
 *   carries (fix-f7 corroboration). Without it the answer names the leader
 *   alone: the double has no group, so its leader corroborates itself; the
 *   real-group harness is the corroboration witness.
 * @return {Object} The witness double.
 */
export function createReplaceWitness(options = {}) {
  const witness = {
    leaderReplicaId: options.leaderReplicaId ?? null,
    addressedLeads: options.addressedLeads === true,
    sourceVoter: options.sourceVoter !== false,
    available: options.available !== false,
    commitIndex: options.commitIndex ?? DEFAULT_COMMIT_INDEX,
    appliedLag: options.appliedLag ?? 0,
    voters: options.voters ?? null,
    // The witness's participation gate (O1): open unless a test holds it
    // below its gate.
    gateOpen: options.gateOpen !== false,
    term: options.term ?? 1,
    transferWindowMaxMs:
      options.transferWindowMaxMs ?? DEFAULT_TRANSFER_WINDOW_MS,
    // What RETIRE_REPLICA_PEER does to the configuration: nothing until the
    // test commits it (commitRemoval), unless commitOnRetire is set.
    commitOnRetire: options.commitOnRetire === true,
    reads: [],
    retirements: [],
    commitRemoval() {
      witness.sourceVoter = false;
      witness.commitIndex += 1;
    },
    /**
     * The handler's answer to a witness message, or undefined for any other
     * message (the caller's router answers those).
     * @param {Object} payload
     * @return {Object|undefined}
     */
    answer(payload) {
      const type = payload?.[ReplicaOperationField.TYPE];
      if (type === ReplicaOperationMessageType.READ_REPLICA_MEMBERSHIP) {
        witness.reads.push(payload);
        if (!witness.available) {
          return {status: ReplicaOperationResponseStatus.ERROR,
            error: 'witness unavailable'};
        }
        const leaderReplicaId = witness.addressedLeads ?
          payload[ReplicaOperationField.REPLICA_ID] :
          witness.leaderReplicaId;
        return {
          status: ReplicaOperationResponseStatus.COMPLETED,
          [ReplicaOperationField.MEMBERSHIP]: {
            state: witness.sourceVoter ?
              PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER :
              PARTITION_REPLICA_MEMBERSHIP_STATE.ABSENT,
            replicaId: payload[ReplicaOperationField.REPLICA_ID],
            partitionId: payload[ReplicaOperationField.PARTITION_ID],
            term: witness.term,
            commitIndex: witness.commitIndex,
            appliedIndex: witness.commitIndex - witness.appliedLag,
            gateOpen: witness.gateOpen,
            leaderReplicaId,
            voterReplicaIds: witness.voters ??
              (leaderReplicaId ? [leaderReplicaId] : []),
            votersOutgoingReplicaIds: [],
            transferWindowMaxMs: witness.transferWindowMaxMs,
          },
        };
      }
      if (type === ReplicaOperationMessageType.RETIRE_REPLICA_PEER) {
        witness.retirements.push(payload);
        if (witness.commitOnRetire) {
          witness.commitRemoval();
        }
        return {
          status: ReplicaOperationResponseStatus.INITIATED,
          [ReplicaOperationField.PROPOSAL]: {outcome: PORT_OUTCOME_PROPOSED},
        };
      }
      return undefined;
    },
  };
  return witness;
}

/**
 * One witness double per REPLACE operation behind a router: witness messages
 * are answered by the operation's own witness, every other message by the
 * router. A harness that simulates a REPLACE's physical effects commits the
 * source's removal on the operation's witness when it simulates it.
 * @param {Object} router - A message router with deliver().
 * @param {Object} [options] - createReplaceWitness options for each witness.
 * @return {Object} {witnessFor(operationId)}.
 */
export function installReplaceWitnesses(router, options = {}) {
  const witnesses = new Map();
  const witnessFor = (operationId) => {
    if (!witnesses.has(operationId)) {
      witnesses.set(operationId, createReplaceWitness(options));
    }
    return witnesses.get(operationId);
  };
  const baseDeliver = router.deliver.bind(router);
  router.deliver = async (target, payload, deliverOptions) => {
    const operationId = payload?.[ReplicaOperationField.OPERATION_ID];
    const answered = typeof operationId === 'string' ?
      witnessFor(operationId).answer(payload) : undefined;
    return answered === undefined ?
      baseDeliver(target, payload, deliverOptions) :
      deliveredReplaceWitnessResponse(answered);
  };
  return {witnessFor};
}

/**
 * Model the router facet only after a fixture handler produced an application
 * answer. Transport-negative tests bypass this helper and supply their own
 * delivery outcome, so an application-looking body cannot manufacture ACK.
 * @param {Object} answered - The invoked fixture handler's response.
 * @return {Object} A production-shaped delivered router response.
 */
export function deliveredReplaceWitnessResponse(answered) {
  return {acknowledged: true, noHandler: false, deliveryState: 'delivered',
    deferRetry: false, errorCode: null, retryAfterMs: null, ...answered};
}

/**
 * A fixture that models the REPLACE owner's STOPPING write directly on an
 * operation row records what that write records (quest
 * replace-source-removal-owner, C0): the removal intent with the witness
 * commit index it was read at, on a STOPPING step entry.
 * @param {Object} row - The replica_operations row (steps_history JSON).
 * @param {Object} witness - The operation's witness double.
 */
export function recordModelledRemovalIntent(row, witness) {
  let history = [];
  try {
    history = JSON.parse(row.steps_history || '[]');
  } catch {
    history = [];
  }
  const sourceReplicaId = history.find((entry) =>
    typeof entry?.sourceReplicaId === 'string')?.sourceReplicaId ||
    row.source_replica_id || null;
  history.push({
    step: 'STOPPING',
    timestamp: Date.now(),
    ...(sourceReplicaId ? {sourceReplicaId} : {}),
    replaceRemovalIntent: true,
    replaceWitnessCommitIndex: witness.commitIndex,
  });
  row.steps_history = JSON.stringify(history);
}
