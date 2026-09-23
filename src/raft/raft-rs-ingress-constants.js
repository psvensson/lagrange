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
});

// The message types the binding's own `num_to_msg_type` maps. A number
// outside this range cannot be decoded at all, so refusing it is schema
// validation and not a Raft decision.
const RAFT_RS_MESSAGE_TYPE_RANGE = Object.freeze({
  MIN: 0,
  MAX: 18,
});

// The message fields the binding parses as a 64-bit decimal string.
const RAFT_RS_POSITION_FIELDS = Object.freeze([
  'term', 'logTerm', 'index', 'commit', 'rejectHint',
]);

// The peer-identity fields on a message.
const RAFT_RS_PEER_ID_FIELDS = Object.freeze(['from', 'to']);

// The 64-bit fields the binding parses on one ENTRY a message carries.
const RAFT_RS_ENTRY_POSITION_FIELDS = Object.freeze(['term', 'index']);

export {
  RAFT_RS_ENTRY_POSITION_FIELDS,
  RAFT_RS_INGRESS_OUTCOME,
  RAFT_RS_INGRESS_REFUSAL,
  RAFT_RS_MESSAGE_TYPE_RANGE,
  RAFT_RS_PEER_ID_FIELDS,
  RAFT_RS_POSITION_FIELDS,
  RAFT_RS_TRANSPORT_PROTOCOL,
};
