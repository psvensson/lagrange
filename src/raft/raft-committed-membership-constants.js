// The vocabulary of the committed-membership boundary (owner decision O1,
// committed-read amendment 1, 2026-09-26): services rows are discovery and
// desired topology; the group's committed Raft configuration is the only
// consensus participation authority.
//
// One module owns every name the boundary uses, so the creation owner, the
// replica handler, the operation port and the runtime owner import the same
// values and none of them hand-lists another's:
//   - the stamp a creator puts on a new replica, and the bootstrap source a
//     replica opens its group from;
//   - the one read of the committed configuration (its purpose, the frozen
//     answer's fields, and every refusal it or its consumers answer);
//   - the participation gate (its typed refusal and the event of its
//     opening).
//
// Values only: nothing here reaches the core, a store or a row.

// What a creator stamps on a new replica: the group's committed
// configuration as its leader answered it (a join: ADD, REPLACE, formation),
// or the founding set of a partition no group exists for yet.
const COMMITTED_MEMBERSHIP_STAMP_KIND = Object.freeze({
  COMMITTED: 'committed',
  GENESIS: 'genesis',
});

// What a replica opens its group from. A stamp (above), or - a restart or a
// rejoin - its own durable record and nothing else: a replica that must
// restore and holds no record is refused, never bootstrapped from rows
// (owner decision O4).
const BOOTSTRAP_MEMBERSHIP_SOURCE = Object.freeze({
  ...COMMITTED_MEMBERSHIP_STAMP_KIND,
  DURABLE_RECORD: 'durable-record',
});

// The kind of an answer to the committed-membership read: the committed
// configuration, or a typed refusal.
const COMMITTED_MEMBERSHIP_ANSWER_KIND = Object.freeze({
  COMMITTED: COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED,
  REFUSED: 'refused',
});

// Who asks, which decides what the read refuses. A bootstrap read (the
// creation owner asking the group for a new replica's stamp) is answered by
// the leader alone and refuses a joint configuration and any identity the
// leader never reserved; a witness read (the REPLACE owner asking its target
// replica for its own applied configuration) is answered by whichever
// replica is asked.
const COMMITTED_MEMBERSHIP_READ_PURPOSE = Object.freeze({
  BOOTSTRAP: 'bootstrap',
  WITNESS: 'witness',
});

// Every typed refusal of the boundary, one enumeration:
//   NOT_LEADER            a bootstrap read reached a replica that does not
//                         lead (answered with the leader's address when it
//                         resolves);
//   JOINT                 the configuration is joint;
//   IDENTITY_UNRESOLVED   an id of the configuration has no reserved replica
//                         identity where it was read (fail closed);
//   HELD                  the replica's group is held by its host failure;
//   NOT_HOSTED            the node hosts no replica of the partition;
//   MEMBERSHIP_UNREADABLE no leader answered (no hint to redirect to, a
//                         second NOT_LEADER, a timeout, a delivery failure);
//   STAMP_INVALID         a dispatched stamp failed the target's validation;
//   GENESIS_REFUSED_GROUP_EXISTS
//                         a GENESIS stamp reached a replica with no durable
//                         record while discovery shows a replica of the
//                         partition outside the founders (a replica that
//                         holds a record is restored from it instead);
//   DURABLE_RECORD_MISSING
//                         a replica that must restore (a rejoin, or a
//                         COMMITTED stamp that already names it a voter, or
//                         a GENESIS stamp on a replica joining an existing
//                         group) holds no durable record;
//   RESEED_REQUIRED       a replica's own history is proven lost while it
//                         runs (a peer holds it to a commit beyond its
//                         persisted log): held durably, never reopened,
//                         replaced under a fresh identity.
const COMMITTED_MEMBERSHIP_REFUSAL = Object.freeze({
  NOT_LEADER: 'membership-read-not-leader',
  JOINT: 'membership-in-joint-transition',
  IDENTITY_UNRESOLVED: 'membership-identity-unresolved',
  HELD: 'membership-replica-held',
  NOT_HOSTED: 'membership-replica-not-hosted',
  MEMBERSHIP_UNREADABLE: 'membership-unreadable',
  STAMP_INVALID: 'membership-stamp-invalid',
  GENESIS_REFUSED_GROUP_EXISTS: 'membership-genesis-refused-group-exists',
  DURABLE_RECORD_MISSING: 'durable-record-missing',
  RESEED_REQUIRED: 'reseed-required',
});

// Why a dispatched stamp is STAMP_INVALID (the refusal's detail).
const COMMITTED_MEMBERSHIP_STAMP_DEFECT = Object.freeze({
  MISSING: 'stamp-missing',
  UNKNOWN_KIND: 'stamp-unknown-kind',
  // The value is not the exact own-data schema: inherited/accessor fields,
  // exotic arrays, coercing values, unsafe numerics and oversized payloads
  // all fail as one distributed-input class.
  MALFORMED: 'stamp-malformed',
  NO_BOOTSTRAP_INDEX: 'stamp-without-committed-index',
  JOINT: 'stamp-joint',
  NO_VOTERS: 'stamp-without-voters',
  IDENTITY_MISMATCH: 'stamp-identity-mismatch',
  IDENTITY_UNRESOLVED: 'stamp-identity-unresolved',
  NO_FOUNDERS: 'stamp-without-founders',
});

// A membership answer is control-plane data, not an allocation surface.
// This is deliberately far above supported replica factors while bounding
// all validation and canonicalization work at the distributed boundary.
const COMMITTED_MEMBERSHIP_MAX_PEERS = 1024;

// The frozen answer of a COMMITTED read, field by field. Ids are raft peer
// ids as decimal strings; `identities` maps each of them to its Lagrange
// replica identity (null where the replica read never reserved it, which a
// bootstrap read refuses instead of answering). `appliedIndex` is the
// applied index of the same recorded observation whose configuration is
// answered - never the core's own `applied`.
const COMMITTED_MEMBERSHIP_ANSWER_FIELD = Object.freeze({
  KIND: 'kind',
  VOTERS: 'voters',
  VOTERS_OUTGOING: 'votersOutgoing',
  LEARNERS: 'learners',
  APPLIED_INDEX: 'appliedIndex',
  COMMIT_INDEX: 'commitIndex',
  TERM: 'term',
  LEADER_ID: 'leaderId',
  GATE_OPEN: 'gateOpen',
  IDENTITIES: 'identities',
});

// The participation gate: until a replica's applied index reaches
// max(bootstrapIndex, admissionIndex) it does not campaign, lead, commit or
// claim quorum membership. GATE_CLOSED is the typed refusal of every such
// request (never a generic unavailability); GATE_OPENED is the event the
// runtime owner emits in the drain whose application crosses the gate.
const PARTICIPATION_GATE = Object.freeze({
  GATE_CLOSED: 'participation-gate-closed',
  GATE_OPENED: 'participation gate opened',
});

// Where a refusal of the gate was decided (its phase).
const PARTICIPATION_GATE_PHASE = 'participation-gate';

export {
  BOOTSTRAP_MEMBERSHIP_SOURCE,
  COMMITTED_MEMBERSHIP_ANSWER_FIELD,
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
  COMMITTED_MEMBERSHIP_REFUSAL,
  COMMITTED_MEMBERSHIP_STAMP_DEFECT,
  COMMITTED_MEMBERSHIP_STAMP_KIND,
  COMMITTED_MEMBERSHIP_MAX_PEERS,
  PARTICIPATION_GATE,
  PARTICIPATION_GATE_PHASE,
};
