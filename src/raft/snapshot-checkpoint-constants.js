// Raft snapshot checkpoint vocabulary (quest raft-snapshot-checkpoint-format,
// spec solve/specs/raft-snapshot-transfer-install/ R1). This file owns the
// envelope version, descriptor field sets, payload-kind compatibility matrix,
// applied-watermark state keys, and every typed creation/validation outcome.
// Transfer (S3), install (S2), and retention (S5) own their own vocabulary.

const RAFT_CHECKPOINT_ENVELOPE_VERSION = 1;

// Directory + file layout of one sealed checkpoint generation:
// {checkpointsRoot}/{lastIncludedIndex}/payload.db + checkpoint.json.
// The descriptor is the publication token: it is written (atomic + durable)
// only after the payload bytes are durable, so payload-without-descriptor is
// always a typed PARTIAL, never recovery progress.
const RAFT_CHECKPOINT_DESCRIPTOR_FILE = 'checkpoint.json';
const RAFT_CHECKPOINT_PAYLOAD_FILE = 'payload.db';

// SQLite sidecar names whose presence next to a sealed payload means the
// payload bytes on disk do not equal the effective database content.
const RAFT_CHECKPOINT_PAYLOAD_SIDECAR_SUFFIXES = Object.freeze(['-wal', '-shm']);

// Payload-kind compatibility matrix (S1 authoring bar): every kind and its
// state-machine include/exclude rule. One raft group == one SQLite file, so
// the rule is table-name-based. `_transaction_outcomes` is applied
// state-machine state (2PC outcome memoization) and MUST survive the scrub;
// an exclude built as `_%` would silently break exactly-once after install.
// Adapters with no durable state-machine/consensus separation (the in-memory
// log adapter, and SQLiteLogAdapter over a `:memory:` database as used by the
// message-group worker) are typed UNSUPPORTED_ADAPTER at creation.
const RAFT_CHECKPOINT_PAYLOAD_KIND = Object.freeze({
  SQLITE_STATE_MACHINE_IMAGE: 'sqlite_state_machine_image',
});

const RAFT_CHECKPOINT_PAYLOAD_VERSION = Object.freeze({
  [RAFT_CHECKPOINT_PAYLOAD_KIND.SQLITE_STATE_MACHINE_IMAGE]: 1,
});

// Follower-local consensus tables that never cross replicas inside a payload.
const RAFT_CHECKPOINT_EXCLUDED_TABLES = Object.freeze([
  '_raft_log',
  '_raft_state',
]);

// `_raft_state` keys for the durable applied watermark introduced by this
// protocol. The raft commit path records LAST_APPLIED_INDEX after a
// successful apply; the single-replica direct-apply path records
// DIRECT_APPLY_MARKER (its writes bypass raft commit, so no committed
// watermark can certify the image). Both keys live in `_raft_state` and are
// therefore scrubbed from payloads by the exclude set above.
const RAFT_CHECKPOINT_APPLIED_STATE_KEY = Object.freeze({
  LAST_APPLIED_INDEX: 'lastAppliedIndex',
  DIRECT_APPLY_MARKER: 'directApplyMarker',
  APPLIED_GAP_MARKER: 'appliedGapMarker',
});

const RAFT_CHECKPOINT_DIRECT_APPLY_MARKER_VALUE = 'direct_apply';
const RAFT_CHECKPOINT_APPLIED_GAP_MARKER_VALUE = 'applied_gap';

// Typed creation outcomes. CREATED is the only success; every other outcome
// must never be advertised as recovery progress.
const RAFT_CHECKPOINT_CREATION_OUTCOME = Object.freeze({
  CREATED: 'created',
  UNSUPPORTED_ADAPTER: 'unsupported_adapter',
  APPLY_WATERMARK_DIVERGENCE: 'apply_watermark_divergence',
  PREPARED_TRANSACTIONS_PENDING: 'prepared_transactions_pending',
});

// Typed validation outcomes (R1: partial, corrupt, unsupported, stale, and
// foreign checkpoints SHALL be typed and never advertised as progress).
const RAFT_CHECKPOINT_VALIDATION_OUTCOME = Object.freeze({
  VALID: 'valid',
  PARTIAL: 'partial',
  CORRUPT_DESCRIPTOR: 'corrupt_descriptor',
  CORRUPT_PAYLOAD: 'corrupt_payload',
  UNSUPPORTED_ENVELOPE_VERSION: 'unsupported_envelope_version',
  UNSUPPORTED_PAYLOAD_KIND: 'unsupported_payload_kind',
  FOREIGN_CLUSTER: 'foreign_cluster',
  FOREIGN_GROUP: 'foreign_group',
  FOREIGN_ENTITY: 'foreign_entity',
  STALE_EPOCH: 'stale_epoch',
});

// Descriptor shape (exact-object: unknown or missing fields are typed
// CORRUPT_DESCRIPTOR). Identity fields are supplied by the creating owner;
// the authoritative production sources for clusterId and membershipEpoch are
// pinned when S2/S3 wire real callers (recorded in the design note).
const RAFT_CHECKPOINT_DESCRIPTOR_FIELDS = Object.freeze([
  'envelopeVersion',
  'clusterId',
  'raftGroupId',
  'entity',
  'membershipEpoch',
  'lastIncludedIndex',
  'lastIncludedTerm',
  'maxCommittedHlc',
  'payloadKind',
  'payloadVersion',
  'payloadByteLength',
  'payloadDigest',
]);

const RAFT_CHECKPOINT_ENTITY_FIELDS = Object.freeze(['kind', 'id']);

export {
  RAFT_CHECKPOINT_APPLIED_GAP_MARKER_VALUE,
  RAFT_CHECKPOINT_APPLIED_STATE_KEY,
  RAFT_CHECKPOINT_CREATION_OUTCOME,
  RAFT_CHECKPOINT_DESCRIPTOR_FIELDS,
  RAFT_CHECKPOINT_DESCRIPTOR_FILE,
  RAFT_CHECKPOINT_DIRECT_APPLY_MARKER_VALUE,
  RAFT_CHECKPOINT_ENTITY_FIELDS,
  RAFT_CHECKPOINT_ENVELOPE_VERSION,
  RAFT_CHECKPOINT_EXCLUDED_TABLES,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_CHECKPOINT_PAYLOAD_KIND,
  RAFT_CHECKPOINT_PAYLOAD_SIDECAR_SUFFIXES,
  RAFT_CHECKPOINT_PAYLOAD_VERSION,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
};
