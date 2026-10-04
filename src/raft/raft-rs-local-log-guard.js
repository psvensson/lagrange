// The local-log precondition guard at the single raft-rs ingress: one pure
// decision, asked by the runtime owner in its inbound drain immediately
// before a delivered envelope is stepped, over the envelope and the
// receiving group's own positions. Nothing here enters the core, a store or
// a row; the runtime owner hands in what it already holds.
//
// These are not Raft's protocol checks (raft-rs owns those). They are
// raft-rs's panicking preconditions - the core assumes no peer lost its
// history and traps the whole shared instance when one did - plus the O1
// participation gate applied at the authoritative ingress (M5):
//   - a heartbeat whose commit lies beyond this replica's persisted log
//     (crate raft_log.rs commit_to). A correct leader never sends it: its
//     heartbeat commit is min(matched, committed), matched is acknowledged
//     only after this replica persisted the entries, and committed entries
//     are never truncated. It therefore proves this replica lost history the
//     leader holds it to have: the group is held for a reseed (O4), never
//     dropped and stepped on (a dropped heartbeat never resets the election
//     timer, so the amnesic replica would campaign the leader away);
//   - an append carrying an entry at or below this replica's commit index
//     while its own index is not below it (crate raft_log.rs maybe_append's
//     committed-conflict fatal). A correct leader sends entries contiguous
//     from index + 1, and the crate answers an index below commit without
//     reading its entries: only a malformed or amnesic sender produces it, so
//     the message is refused and this replica is not held;
//   - an empty proposal forwarded by a peer (crate raft.rs "stepped empty
//     MsgProp"). A forwarded proposal with entries is legitimate (proposal
//     forwarding is on) and is stepped;
//   - an accepting append response whose index lies beyond this replica's
//     persisted log. A correct follower acknowledges only what the leader
//     sent, and the leader persists before it sends, so only an amnesic
//     peer's answer exceeds it (a follower whose commit runs past an empty
//     leader answers index = its commit). Stepped, it would set the peer's
//     matched past the log: replication to it is skipped and the next
//     heartbeat carries a commit the peer may not hold. Refused, not held;
//   - while the participation gate is closed, a MsgTimeoutNow: a replica
//     that may not take part may not campaign on a peer's word (O1, M5). A
//     MsgTransferLeader is never refused here: a transfer named at a
//     follower is forwarded to the leader as exactly that peer message.
//
// A held group never reaches this guard: the runtime owner answers every
// delivery and operation of a held group with its hold, votes included, and
// the core is not entered for it again. A vote request to a gated replica
// that is not held is stepped: the candidate counts it only if the candidate applied the
// AddNode that made it a voter, and refusing it locks a group out for good
// when that replica's vote is the one a quorum needs (it opens its gate only
// by applying entries from a leader that then cannot be elected - witnessed
// by evidence-o1-restart-equivalence, H1 + self). Whether the gate should
// refuse votes at all is an owner decision this guard does not take.

import {RAFT_RS_MESSAGE_TYPE} from './raft-rs-ingress-constants.js';
import {PARTICIPATION_GATE} from './raft-committed-membership-constants.js';
import {RAFT_RS_LOCAL_LOG_REFUSAL} from
  './raft-rs-runtime-owner-constants.js';

const ZERO = 0n;

function positionOf(value) {
  return value === undefined ? ZERO : BigInt(value);
}

function refusal(reason, holds = false) {
  return {reason, holds};
}

// An append whose own index is not below the local commit but whose first
// entry is at or below it: the crate's committed-conflict precondition. The
// first entry of a well-formed append is its lowest (entries run contiguous
// from index + 1); entries out of order after it are the entry-contiguity
// schema check left to admitRaftRsMessage (recorded follow-up), so one
// compare keeps the decision O(1) per envelope.
function appendBelowLocalCommit(message, committed) {
  const entries = message.entries;
  return Array.isArray(entries) && entries.length > 0 &&
    positionOf(message.index) >= committed &&
    positionOf(entries[0].index) <= committed;
}

const POSITION_CHECKS = Object.freeze({
  [RAFT_RS_MESSAGE_TYPE.HEARTBEAT]: (message, local) =>
    positionOf(message.commit) > local.lastIndex ?
      refusal(RAFT_RS_LOCAL_LOG_REFUSAL.PEER_COMMIT_BEYOND_LOCAL_LOG, true) :
      null,
  [RAFT_RS_MESSAGE_TYPE.APPEND]: (message, local) =>
    appendBelowLocalCommit(message, positionOf(local.commit)) ?
      refusal(RAFT_RS_LOCAL_LOG_REFUSAL.APPEND_BELOW_LOCAL_COMMIT) : null,
  [RAFT_RS_MESSAGE_TYPE.PROPOSE]: (message) =>
    !Array.isArray(message.entries) || message.entries.length === 0 ?
      refusal(RAFT_RS_LOCAL_LOG_REFUSAL.EMPTY_FORWARDED_PROPOSAL) : null,
  [RAFT_RS_MESSAGE_TYPE.APPEND_RESPONSE]: (message, local) =>
    message.reject !== true && positionOf(message.index) > local.lastIndex ?
      refusal(RAFT_RS_LOCAL_LOG_REFUSAL.APPEND_RESPONSE_BEYOND_LOCAL_LOG) :
      null,
});

/**
 * Whether a delivered message may be stepped into this group's core.
 * @param {Object} message - The raft message on an admitted envelope.
 * @param {Object} local - The receiving group's own positions, read without
 *   entering the core: {gateOpen, lastIndex (bigint, the persisted
 *   last index: the last entry or the snapshot written), commit (the
 *   core's commit index as last observed, a decimal string)}.
 * @return {Object|null} null to step it, or {reason, holds}: the typed
 *   refusal, and whether it proves this replica's own history lost (the
 *   group is then held for a reseed).
 */
function inboundStepRefusal(message, local) {
  const type = message.msgType;
  if (!local.gateOpen && type === RAFT_RS_MESSAGE_TYPE.TIMEOUT_NOW) {
    return refusal(PARTICIPATION_GATE.GATE_CLOSED);
  }
  const check = POSITION_CHECKS[type];
  return check === undefined ? null : check(message, local);
}

/**
 * The persisted last index after one Ready's durable writes: the snapshot
 * resets it, appended entries set it to their last index (an append replaces
 * any conflicting suffix first, so it can move down), and a Ready that wrote
 * neither leaves it unchanged.
 * @param {bigint} previous - The persisted last index before the Ready.
 * @param {Object} ready - The Ready the store persisted.
 * @return {bigint}
 */
function persistedLastIndexAfter(previous, ready) {
  const entries = ready.entries || [];
  if (entries.length > 0) {
    return positionOf(entries[entries.length - 1].index);
  }
  return ready.snapshot ? positionOf(ready.snapshot.metadata?.index) :
    previous;
}

/**
 * The persisted last index of a group opened from its durable record (the
 * last entry, or the snapshot when the log holds nothing after it), or of a
 * group created from a bootstrap (zero).
 * @param {Object|null} record - The durable record, or null when created.
 * @return {bigint}
 */
function openedLastIndex(record) {
  if (record === null) {
    return ZERO;
  }
  const lastEntry = record.entries.length === 0 ? ZERO :
    positionOf(record.entries[record.entries.length - 1].index);
  const snapshotIndex = positionOf(record.snapshot?.metadata?.index);
  return lastEntry > snapshotIndex ? lastEntry : snapshotIndex;
}

export {inboundStepRefusal, openedLastIndex, persistedLastIndexAfter};
