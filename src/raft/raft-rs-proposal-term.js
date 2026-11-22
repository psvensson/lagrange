// A proposal enters the core only under the leadership it was submitted
// under. When the port is asked to propose, the proposal records the core's
// term as last announced - the status every consumer's leadership tenure is
// derived from; the propose step itself, after its turn's inbound drain,
// reads the core: a core that does not lead, or leads another term, never
// proposes. The proposal is answered with the port's one named refusal
// (RAFT_PROPOSAL_REFUSAL.SUBMITTING_LEADERSHIP_ENDED) and nothing enters the
// log. raft-rs 0.7 would otherwise forward a follower's proposal to the
// leader it knows (raft.rs step_follower, MsgPropose; the binding has no
// switch for it), where it commits under that leader's term after its
// term-start entry. Nothing in this system relies on that forwarding:
// partition writes, message groups and WASM services propose only while they
// lead and route to the leader themselves.

import {deepFreeze} from './raft-operation-port.js';
import {
  RAFT_OPERATION_OUTCOME,
  RAFT_PROPOSAL_REFUSAL,
} from './raft-operation-port-constants.js';
import {ROLE, ROLE_LEADER} from './raft-rs-runtime-owner-constants.js';

// The runtime command, and the core primitive, that proposes an entry.
const PROPOSE_COMMAND = 'propose';
const CORE_STATUS = 'status';
const NO_SUBMITTED_TERM = null;

/**
 * The port's one answer to a proposal whose submitting leadership does not
 * hold at its propose step. Nothing was proposed or forwarded: a definite
 * outcome (proposed: false), not a host failure, and not the core's dropped
 * proposal - so never a leadership-transfer deferral. The submission's
 * authority is gone: its submitter decides again under the leadership it
 * observes now and never re-sends this proposal on this answer
 * (retryable: false).
 * @param {Object} proposal - {submittedTerm}.
 * @param {Object} status - The core's status read at the propose step.
 * @return {Object} The core entry's {ok: false, result}.
 */
function submittingLeadershipEnded(proposal, status) {
  return {ok: false, result: deepFreeze({
    outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
    reason: RAFT_PROPOSAL_REFUSAL.SUBMITTING_LEADERSHIP_ENDED,
    phase: PROPOSE_COMMAND,
    proposed: false,
    retryable: false,
    recoveryRequired: false,
    submittedTerm: proposal.submittedTerm === NO_SUBMITTED_TERM ? null :
      Number(proposal.submittedTerm),
    term: Number(status.term),
    role: ROLE[status.raftState],
  })};
}

/**
 * A command as the port submits it: a proposal carries the term of the
 * leadership it is submitted under (none before the group's first
 * announcement); any other command is unchanged.
 * @param {Object} group - The runtime group.
 * @param {Object} command - The runtime command.
 * @return {Object} The command to queue or perform.
 */
function withSubmittedTerm(group, command) {
  if (command.type !== PROPOSE_COMMAND) return command;
  return {...command, submittedTerm: group.lastStatus === null ?
    NO_SUBMITTED_TERM : group.lastStatus.term};
}

/**
 * Propose one submitted proposal through the core, in the turn's own core
 * entry, or refuse it by name.
 * @param {Function} core - (operation, ...args): the runtime owner's core
 *   entry for this group and generation.
 * @param {Object} proposal - {bytes, submittedTerm}.
 * @return {Object} The core entry's {ok, value|result}.
 */
function proposeUnderSubmittedTerm(core, proposal) {
  const status = core(CORE_STATUS);
  if (!status.ok) return status;
  if (ROLE[status.value.raftState] !== ROLE_LEADER ||
      status.value.term !== proposal.submittedTerm) {
    return submittingLeadershipEnded(proposal, status.value);
  }
  return core(PROPOSE_COMMAND, proposal.bytes);
}

export {PROPOSE_COMMAND, proposeUnderSubmittedTerm, withSubmittedTerm};
