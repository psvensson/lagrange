// Raft snapshot checkpoint vocabulary (quest raft-snapshot-checkpoint-format,
// spec solve/specs/raft-snapshot-transfer-install/ R1). This file owns the
// envelope version, descriptor field sets, payload-kind compatibility matrix,
// applied-watermark state keys, and every typed creation/validation outcome.
// Transfer (S3), install (S2), and retention (S5) own their own vocabulary.

import {ENTITY_TYPE} from '../constants/addresses.js';
import {SERVICE_TYPE} from '../constants/service.js';

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
// the rule is table-name-based; an exclude built as `_%` would silently
// discard application state after install.
// Adapters with no durable state-machine/consensus separation (the in-memory
// log adapter, and SQLiteLogAdapter over a `:memory:` database as used by the
// message-group worker) are typed UNSUPPORTED_ADAPTER at creation.
const RAFT_CHECKPOINT_PAYLOAD_KIND = Object.freeze({
  SQLITE_STATE_MACHINE_IMAGE: 'sqlite_state_machine_image',
  RAFT_RS_REPLICA_IMAGE: 'raft_rs_replica_image',
});

const RAFT_CHECKPOINT_PAYLOAD_VERSION = Object.freeze({
  [RAFT_CHECKPOINT_PAYLOAD_KIND.SQLITE_STATE_MACHINE_IMAGE]: 1,
  [RAFT_CHECKPOINT_PAYLOAD_KIND.RAFT_RS_REPLICA_IMAGE]: 2,
});

const RAFT_RS_CHECKPOINT_DESCRIPTOR_FIELDS = Object.freeze([
  'groupId', 'appliedIndex', 'appliedTerm', 'membershipGenerationIndex',
  'confState', 'peerReservations',
]);
const RAFT_RS_CHECKPOINT_CONF_STATE_FIELDS = Object.freeze([
  'voters', 'learners', 'votersOutgoing', 'learnersNext', 'autoLeave',
]);
const RAFT_RS_CHECKPOINT_PEER_RESERVATION_FIELDS = Object.freeze([
  'replicaIdentity', 'peerId',
]);
// The two recorded facts a reservation may carry, each present exactly when
// recorded: the committed node identity and the committed learner origin.
const RAFT_RS_CHECKPOINT_PEER_RESERVATION_OPTIONAL_FIELDS = Object.freeze([
  'nodeId', 'learnerAdmission',
]);
const RAFT_RS_CHECKPOINT_REASON = Object.freeze({
  DESCRIPTOR: 'raftRs',
  BOUNDARY: 'raft_rs_boundary',
  PAYLOAD_KIND_REQUIRED: 'raft_rs_payload_kind_required',
  ENTITY_KIND: 'raft_rs_entity_kind',
  PEER_RESERVATIONS: 'peer_reservations',
  PAYLOAD_TABLES: 'raft_rs_payload_tables',
  PREPARED_TRANSACTIONS: 'prepared_participant_transactions',
  LOCAL_TRANSACTION_OPEN: 'local_transaction_open',
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
  // The sealed generation was read back through the checkpoint reader and
  // refused: it was removed, and the result carries the reader's outcome.
  IMAGE_REJECTED: 'image_rejected',
  // Answered by a generation sealer that owns a standing refusal (a
  // partition's checkpoint cadence) instead of building an image: it is
  // holding the image after a refusal nothing has lifted, it is already
  // building one, or its attempt failed before the creation owner answered.
  SEALER_HELD: 'sealer_held_after_refusal',
  SEALER_BUSY: 'sealer_busy',
  SEALER_FAILED: 'sealer_failed',
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
const RAFT_RS_CHECKPOINT_ENVELOPE_FIELDS = Object.freeze([
  ...RAFT_CHECKPOINT_DESCRIPTOR_FIELDS, 'raftRs',
]);

const RAFT_CHECKPOINT_ENTITY_FIELDS = Object.freeze(['kind', 'id']);

// The CLOSED table of entity kinds a raft-rs replica image may describe,
// and the two rules that differ by kind. It is the one statement of both:
// the envelope (snapshot-checkpoint-format.js) reads `epoch`, the payload
// owner (snapshot-application-content.js) reads `content`, and a kind the
// table does not name is no raft-rs image for either.
//  - epoch: `membershipEpoch` is supplied by the identity owner of the kind.
//    A partition's is the cluster's membership-publication epoch, unrelated
//    to the group's Raft log and OPAQUE to the envelope. A message group's
//    identity owner DEFINES it as the image's own raft-rs configuration
//    generation (message-group-learner-join.js seals a learner image at the
//    committed stamp's membershipGenerationIndex), and is held to that.
//  - content: a partition image carries the partition's state tables; a
//    message-group image carries the peer identity table and nothing else.
const RAFT_RS_IMAGE_EPOCH_RULE = Object.freeze({
  OPAQUE: 'opaque',
  CONFIGURATION_GENERATION: 'configuration_generation',
});
const RAFT_RS_IMAGE_CONTENT_RULE = Object.freeze({
  PARTITION_STATE: 'partition_state',
  PEER_IDENTITY_ONLY: 'peer_identity_only',
});
const RAFT_RS_IMAGE_ENTITY_KINDS = Object.freeze({
  [ENTITY_TYPE.PARTITION]: Object.freeze({
    epoch: RAFT_RS_IMAGE_EPOCH_RULE.OPAQUE,
    content: RAFT_RS_IMAGE_CONTENT_RULE.PARTITION_STATE,
  }),
  [SERVICE_TYPE.MESSAGE_GROUP]: Object.freeze({
    epoch: RAFT_RS_IMAGE_EPOCH_RULE.CONFIGURATION_GENERATION,
    content: RAFT_RS_IMAGE_CONTENT_RULE.PEER_IDENTITY_ONLY,
  }),
});
// What the table answers for a kind it does not name.
const NOT_A_RAFT_RS_IMAGE_ENTITY_KIND = null;

/**
 * The rules of one raft-rs image entity kind.
 * @param {*} kind descriptor entity kind
 * @return {Object|null} frozen {epoch, content}, or
 *   NOT_A_RAFT_RS_IMAGE_ENTITY_KIND
 */
function raftRsImageEntityKindRules(kind) {
  return typeof kind === 'string' &&
    Object.hasOwn(RAFT_RS_IMAGE_ENTITY_KINDS, kind) ?
    RAFT_RS_IMAGE_ENTITY_KINDS[kind] : NOT_A_RAFT_RS_IMAGE_ENTITY_KIND;
}

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
  RAFT_RS_CHECKPOINT_CONF_STATE_FIELDS,
  RAFT_RS_CHECKPOINT_DESCRIPTOR_FIELDS,
  RAFT_RS_CHECKPOINT_ENVELOPE_FIELDS,
  RAFT_RS_CHECKPOINT_PEER_RESERVATION_FIELDS,
  RAFT_RS_CHECKPOINT_PEER_RESERVATION_OPTIONAL_FIELDS,
  RAFT_RS_CHECKPOINT_REASON,
  RAFT_RS_IMAGE_CONTENT_RULE,
  RAFT_RS_IMAGE_EPOCH_RULE,
  NOT_A_RAFT_RS_IMAGE_ENTITY_KIND,
  raftRsImageEntityKindRules,
};
