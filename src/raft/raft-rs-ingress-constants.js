// What the host can refuse a raft-rs message for, and the two schema ranges
// the binding itself defines.
//
// Every name here is a transport or envelope fault. There is deliberately no
// name for "the sender is not a member of my configuration": the round-3
// verifier measured that rule dropping legitimate membership-transition
// traffic, and §6 of the binding direction corrects it. If a refusal name for
// that ever appears here, the boundary has taken back a decision raft-rs owns.

// The admission outcome when nothing is wrong with the envelope. It is a
// named state, so a caller never reads admission out of the absence of a
// refusal.
const RAFT_RS_TRANSPORT_PROTOCOL = 'raft-rs';

const RAFT_RS_INGRESS_OUTCOME = Object.freeze({
  ADMITTED: 'admitted',
});

const RAFT_RS_INGRESS_REFUSAL = Object.freeze({
  // The verifier found the group check failing open when no group id was on
  // the envelope: a same-id cross-group heartbeat then moved term and leader.
  MISSING_GROUP_ID: 'missing-group-id',
  GROUP_MISMATCH: 'group-mismatch',
  MISSING_RECIPIENT: 'missing-recipient',
  RECIPIENT_MISMATCH: 'recipient-mismatch',
  MALFORMED_ENVELOPE: 'malformed-envelope',
  MALFORMED_MESSAGE_TYPE: 'malformed-message-type',
  MALFORMED_PEER_ID: 'malformed-peer-id',
  MALFORMED_POSITION: 'malformed-position',
  MALFORMED_ENTRY: 'malformed-entry',
  // The shapes below are what raft-rs's own sender never produces and its
  // receiver traps on (each one found by the ingress fuzz witness on the
  // real core, raft-rs-ingress-fuzz.test.js): they are encodings no peer of
  // this binding writes, not decisions about the sender.
  //   - a term on a message raft-rs forwards as a local one (MsgPropose),
  //     or no term on one raft-rs always sends with its term (raft.rs send()
  //     is fatal on either when the receiver forwards or answers it);
  TERM_PRESENCE_MISMATCH: 'term-presence-mismatch',
  //   - append entries that do not run contiguous from index + 1 with
  //     non-decreasing terms between logTerm and the message's term
  //     (raft_log.rs maybe_append slices and commits on that assumption);
  NON_CONTIGUOUS_ENTRIES: 'non-contiguous-entries',
  //   - a message type this binding never sends: MsgSnapshot (it exports no
  //     compaction, so a leader never answers a lagging peer with one) and
  //     MsgReadIndex / MsgReadIndexResp (it exports no read_index).
  MESSAGE_TYPE_WITHOUT_PRODUCER: 'message-type-without-producer',
  //   - a forwarded proposal carrying anything but what a port proposes: a
  //     NORMAL entry whose data is canonical base64 of a JSON proposal. A
  //     configuration change is proposed only at the leader's own port and
  //     never forwarded; bytes that are not a proposal would commit and then
  //     fail every apply of that entry, on every replica, for good.
  FORWARDED_ENTRY_NOT_A_PROPOSAL: 'forwarded-entry-not-a-proposal',
});

// The message types the binding's own `num_to_msg_type` maps. A number
// outside this range cannot be decoded at all, so refusing it is schema
// validation and not a Raft decision.
const RAFT_RS_MESSAGE_TYPE_RANGE = Object.freeze({
  MIN: 0,
  MAX: 18,
});

// The message types the host itself steps into its own core, by the number
// the binding's `num_to_msg_type` maps them from. MsgTransferLeader is what
// raft-rs's own RawNode::transfer_leader steps (from = the transferee); the
// binding exports no transfer call, so the runtime owner steps this message.
const RAFT_RS_MESSAGE_TYPE = Object.freeze({
  HUP: 0,
  BEAT: 1,
  PROPOSE: 2,
  APPEND: 3,
  APPEND_RESPONSE: 4,
  REQUEST_VOTE: 5,
  REQUEST_VOTE_RESPONSE: 6,
  SNAPSHOT: 7,
  HEARTBEAT: 8,
  HEARTBEAT_RESPONSE: 9,
  UNREACHABLE: 10,
  SNAPSHOT_STATUS: 11,
  CHECK_QUORUM: 12,
  TRANSFER_LEADER: 13,
  TIMEOUT_NOW: 14,
  READ_INDEX: 15,
  READ_INDEX_RESPONSE: 16,
  REQUEST_PRE_VOTE: 17,
  REQUEST_PRE_VOTE_RESPONSE: 18,
});

// The message fields the binding parses as a 64-bit decimal string.
const RAFT_RS_POSITION_FIELDS = Object.freeze([
  'term', 'logTerm', 'index', 'commit', 'rejectHint',
]);

// The peer-identity fields on a message.
const RAFT_RS_PEER_ID_FIELDS = Object.freeze(['from', 'to']);

// The largest position (term, index, commit, hint) a host value carries
// exactly: the runtime reads positions as JavaScript numbers in places, and
// raft-rs increments a term without an overflow check (a term at u64::MAX
// wraps to 0 on the next campaign and traps the core). Peer ids are not
// positions and keep the full 64 bits.
const RAFT_RS_POSITION_MAX = BigInt(Number.MAX_SAFE_INTEGER);

// The 64-bit fields the binding parses on one ENTRY a message carries.
const RAFT_RS_ENTRY_POSITION_FIELDS = Object.freeze(['term', 'index']);

export {
  RAFT_RS_ENTRY_POSITION_FIELDS,
  RAFT_RS_POSITION_MAX,
  RAFT_RS_INGRESS_OUTCOME,
  RAFT_RS_INGRESS_REFUSAL,
  RAFT_RS_MESSAGE_TYPE,
  RAFT_RS_MESSAGE_TYPE_RANGE,
  RAFT_RS_PEER_ID_FIELDS,
  RAFT_RS_POSITION_FIELDS,
  RAFT_RS_TRANSPORT_PROTOCOL,
};
