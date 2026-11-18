// The leader's port's answer to a configuration-change proposal the core
// must not be handed, decided in the proposal's own queued turn.
//
// The refusal is the admission's (raft-rs-conf-change-admission.js), read
// from the core's status and configuration in this turn (verification V2,
// round 2 F-1). One refusal is not answered alone: a change that removes or
// demotes the leader itself (REMOVES_LEADER) is the next leader's to make,
// so the leader hands its leadership to the most caught-up voter in the same
// turn - the transfer the runtime owner steps and drains - and answers the
// refusal once that Ready drained. A transfer the core would not act on
// leaves the refusal as the answer; a failed drain is the answer instead.
//
// The core is entered only through the runtime owner's injected functions.

import {confChangeProposalRefusal} from './raft-rs-conf-change-admission.js';
import {deepFreeze} from './raft-operation-port.js';
import {
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_OPERATION_OUTCOME,
} from './raft-operation-port-constants.js';
import {CORE_OPERATION} from './raft-rs-runtime-owner-constants.js';
import {continueTurn, settledTurn} from './raft-rs-turn-answer.js';

const {CORE_OK, CORE_REFUSED} = RAFT_OPERATION_OUTCOME;

// The transfer a leader steps when it refuses a change that takes the
// leader itself out.
const LEADER_REMOVAL_HANDOFF = deepFreeze({
  successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.MOST_CAUGHT_UP});

/**
 * The admission's refusal of a conf-change proposal, read from the core in
 * this turn, or null when the core takes it.
 * @param {Object} context
 * @param {Object} context.group - The runtime group.
 * @param {number} context.expectedGeneration - The runtime it runs in.
 * @param {Object} context.change - The normalized ConfChangeV2.
 * @param {Function} context.invokeCoreAt - The owner's core invocation.
 * @param {Function} context.leaderReplicaIdOf - (group, lead) => the
 *   leader's replica identity, or null.
 * @return {Object|null} The refusal, a failed core read, or null.
 */
function refusedConfChange({group, expectedGeneration, change, invokeCoreAt,
  leaderReplicaIdOf}) {
  const status = invokeCoreAt(group, expectedGeneration,
    CORE_OPERATION.STATUS);
  if (!status.ok) {
    return status.result;
  }
  const conf = invokeCoreAt(group, expectedGeneration,
    CORE_OPERATION.CONF_STATE);
  if (!conf.ok) {
    return conf.result;
  }
  return confChangeProposalRefusal({status: status.value,
    confState: conf.value, change,
    leaderReplicaIdOf: (lead) => leaderReplicaIdOf(group, lead)});
}

/**
 * The turn that answers an immediate conf-change outcome: REMOVES_LEADER
 * after the leadership hand-off its refusal requires, anything else as it is.
 * @param {Object} answer - The refusal (or another immediate outcome).
 * @param {Function} transferLeadership - (transfer) => the owner's turn
 *   that steps the transfer and drains its Ready.
 * @return {Object} The turn (raft-rs-turn-answer.js).
 */
function answerConfChangeRefusal(answer, transferLeadership) {
  if (answer.outcome !== CORE_REFUSED ||
      answer.reason !== RAFT_MEMBERSHIP_CHANGE_REFUSAL.REMOVES_LEADER) {
    return settledTurn(answer);
  }
  return continueTurn(transferLeadership(LEADER_REMOVAL_HANDOFF),
    (handed) => settledTurn(
      handed.outcome === CORE_OK || handed.outcome === CORE_REFUSED ?
        answer : handed));
}

export {answerConfChangeRefusal, refusedConfChange};
