// A proposal enters the core only under the leadership it was submitted
// under. When the port is asked to propose, the proposal records the core's
// term as last announced - the status every consumer's leadership tenure is
// derived from; the propose step itself, after its turn's inbound drain,
// reads the core: a core that does not lead, or leads another term, never
// proposes. The proposal is answered with the core's own dropped-proposal
// refusal and nothing enters the log. raft-rs 0.7 would otherwise forward a
// follower's proposal to the leader it knows (raft.rs step_follower,
// MsgPropose; the binding has no switch for it), where it commits under that
// leader's term after its term-start entry. Nothing in this system relies on
// that forwarding: partition writes, message groups and WASM services propose
// only while they lead and route to the leader themselves.

import {RAFT_RS_CORE_REFUSAL_TEXT} from './raft-rs-core-constants.js';
import {
  CORE_REFUSAL_KIND,
  ROLE,
  ROLE_LEADER,
} from './raft-rs-runtime-owner-constants.js';

// The runtime command, and the core primitive, that proposes an entry.
const PROPOSE_COMMAND = 'propose';
const CORE_STATUS = 'status';
const NO_SUBMITTED_TERM = null;

// The binding's own refusal of a dropped proposal: its primitive's prefix
// and raft-rs's Error::ProposalDropped text.
function droppedProposal() {
  return Object.assign(new Error(
    `${PROPOSE_COMMAND}: ${RAFT_RS_CORE_REFUSAL_TEXT.PROPOSAL_DROPPED}`),
  {kind: CORE_REFUSAL_KIND});
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
 * entry, or refuse it as the core refuses a dropped proposal.
 * @param {Function} core - (operation, ...args): the runtime owner's core
 *   entry for this group and generation.
 * @param {Function} refuse - (error): the runtime owner's answer to a core
 *   refusal.
 * @param {Object} proposal - {bytes, submittedTerm}.
 * @return {Object} The core entry's {ok, value|result}.
 */
function proposeUnderSubmittedTerm(core, refuse, proposal) {
  const status = core(CORE_STATUS);
  if (!status.ok) return status;
  if (ROLE[status.value.raftState] !== ROLE_LEADER ||
      status.value.term !== proposal.submittedTerm) {
    return refuse(droppedProposal());
  }
  return core(PROPOSE_COMMAND, proposal.bytes);
}

export {PROPOSE_COMMAND, proposeUnderSubmittedTerm, withSubmittedTerm};
