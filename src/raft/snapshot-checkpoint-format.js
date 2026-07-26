// Raft snapshot checkpoint envelope: build, structurally validate, and
// identity-match versioned checkpoint descriptors (quest
// raft-snapshot-checkpoint-format, R1). Pure functions over descriptor
// values; durable IO lives in snapshot-checkpoint-store.js. Every rejection
// is one typed outcome from RAFT_CHECKPOINT_VALIDATION_OUTCOME with reasons —
// a checkpoint that fails any check here is never recovery progress.

import {exactKeys, validHex256} from '../runtime/oci-host-agent-durable-files.js';

import {
  RAFT_CHECKPOINT_DESCRIPTOR_FIELDS,
  RAFT_CHECKPOINT_ENTITY_FIELDS,
  RAFT_CHECKPOINT_ENVELOPE_VERSION,
  RAFT_CHECKPOINT_PAYLOAD_KIND,
  RAFT_CHECKPOINT_PAYLOAD_VERSION,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from './snapshot-checkpoint-constants.js';

const DIGEST_PREFIX = 'sha256:';
const OUTCOME = RAFT_CHECKPOINT_VALIDATION_OUTCOME;
const SUPPORTED_PAYLOAD_KINDS = Object.freeze(
  Object.values(RAFT_CHECKPOINT_PAYLOAD_KIND),
);

function checkpointResult(outcome, reasons = []) {
  return Object.freeze({outcome, reasons: Object.freeze([...reasons])});
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPayloadDigest(value) {
  return isNonEmptyString(value) &&
    value.startsWith(DIGEST_PREFIX) &&
    validHex256(value.slice(DIGEST_PREFIX.length));
}

/**
 * Build a sealed checkpoint descriptor value. Callers supply identity and
 * payload facts; this owner stamps the envelope version. The returned value
 * is frozen and canonical-JSON-serializable.
 * @param {Object} facts identity + payload facts for one sealed generation
 * @return {Object} frozen descriptor value
 */
function buildCheckpointDescriptor(facts) {
  return Object.freeze({
    envelopeVersion: RAFT_CHECKPOINT_ENVELOPE_VERSION,
    clusterId: facts.clusterId,
    raftGroupId: facts.raftGroupId,
    entity: Object.freeze({
      kind: facts.entity.kind,
      id: facts.entity.id,
    }),
    membershipEpoch: facts.membershipEpoch,
    lastIncludedIndex: facts.lastIncludedIndex,
    lastIncludedTerm: facts.lastIncludedTerm,
    maxCommittedHlc: facts.maxCommittedHlc,
    payloadKind: facts.payloadKind,
    payloadVersion: facts.payloadVersion,
    payloadByteLength: facts.payloadByteLength,
    payloadDigest: facts.payloadDigest,
  });
}

// Structural field checks beyond exact-object shape, evaluated as one table:
// every row failing contributes a reason, and the single canonical outcome is
// decided once below (no branch pile).
const DESCRIPTOR_FIELD_RULES = Object.freeze([
  Object.freeze({
    field: 'clusterId',
    holds: (d) => isNonEmptyString(d.clusterId),
  }),
  Object.freeze({
    field: 'raftGroupId',
    holds: (d) => isNonEmptyString(d.raftGroupId),
  }),
  Object.freeze({
    field: 'entity',
    holds: (d) => exactKeys(d.entity, RAFT_CHECKPOINT_ENTITY_FIELDS) &&
      isNonEmptyString(d.entity.kind) && isNonEmptyString(d.entity.id),
  }),
  Object.freeze({
    field: 'membershipEpoch',
    holds: (d) => isNonNegativeInteger(d.membershipEpoch),
  }),
  Object.freeze({
    field: 'lastIncludedIndex',
    holds: (d) => isNonNegativeInteger(d.lastIncludedIndex),
  }),
  Object.freeze({
    field: 'lastIncludedTerm',
    holds: (d) => isNonNegativeInteger(d.lastIncludedTerm),
  }),
  Object.freeze({
    field: 'maxCommittedHlc',
    holds: (d) => isNonEmptyString(d.maxCommittedHlc),
  }),
  Object.freeze({
    field: 'payloadByteLength',
    holds: (d) => isNonNegativeInteger(d.payloadByteLength),
  }),
  Object.freeze({
    field: 'payloadDigest',
    holds: (d) => isPayloadDigest(d.payloadDigest),
  }),
]);

/**
 * Structurally validate a parsed descriptor value: exact-object shape, field
 * types, envelope version, payload kind/version support.
 * @param {*} descriptor parsed descriptor value
 * @return {{outcome: string, reasons: string[]}} typed structural outcome
 */
function validateCheckpointDescriptor(descriptor) {
  if (!exactKeys(descriptor, RAFT_CHECKPOINT_DESCRIPTOR_FIELDS)) {
    return checkpointResult(OUTCOME.CORRUPT_DESCRIPTOR, ['descriptor_shape']);
  }
  const fieldReasons = DESCRIPTOR_FIELD_RULES
    .filter((rule) => !rule.holds(descriptor))
    .map((rule) => `field:${rule.field}`);
  if (fieldReasons.length > 0) {
    return checkpointResult(OUTCOME.CORRUPT_DESCRIPTOR, fieldReasons);
  }
  if (descriptor.envelopeVersion !== RAFT_CHECKPOINT_ENVELOPE_VERSION) {
    return checkpointResult(
      OUTCOME.UNSUPPORTED_ENVELOPE_VERSION,
      [`envelopeVersion:${descriptor.envelopeVersion}`],
    );
  }
  if (!SUPPORTED_PAYLOAD_KINDS.includes(descriptor.payloadKind)) {
    return checkpointResult(
      OUTCOME.UNSUPPORTED_PAYLOAD_KIND,
      [`payloadKind:${descriptor.payloadKind}`],
    );
  }
  if (descriptor.payloadVersion !==
      RAFT_CHECKPOINT_PAYLOAD_VERSION[descriptor.payloadKind]) {
    return checkpointResult(
      OUTCOME.UNSUPPORTED_PAYLOAD_KIND,
      [`payloadVersion:${descriptor.payloadVersion}`],
    );
  }
  return checkpointResult(OUTCOME.VALID);
}

// Identity dimensions matched in declared order; the first mismatch names the
// canonical foreign outcome. Epoch staleness is directional: a descriptor
// sealed under an OLDER epoch than the receiver expects is stale.
const IDENTITY_RULES = Object.freeze([
  Object.freeze({
    outcome: OUTCOME.FOREIGN_CLUSTER,
    matches: (d, e) => d.clusterId === e.clusterId,
    reason: 'clusterId',
  }),
  Object.freeze({
    outcome: OUTCOME.FOREIGN_GROUP,
    matches: (d, e) => d.raftGroupId === e.raftGroupId,
    reason: 'raftGroupId',
  }),
  Object.freeze({
    outcome: OUTCOME.FOREIGN_ENTITY,
    matches: (d, e) => d.entity.kind === e.entity.kind &&
      d.entity.id === e.entity.id,
    reason: 'entity',
  }),
  Object.freeze({
    outcome: OUTCOME.STALE_EPOCH,
    matches: (d, e) => d.membershipEpoch >= e.membershipEpoch,
    reason: 'membershipEpoch',
  }),
]);

/**
 * Match a structurally valid descriptor against the receiver's expected
 * identity. Any mismatch is a typed foreign/stale rejection.
 * @param {Object} descriptor structurally valid descriptor
 * @param {Object} expected receiver identity
 *   ({clusterId, raftGroupId, entity: {kind, id}, membershipEpoch})
 * @return {{outcome: string, reasons: string[]}} typed identity outcome
 */
function matchCheckpointIdentity(descriptor, expected) {
  for (const rule of IDENTITY_RULES) {
    if (!rule.matches(descriptor, expected)) {
      return checkpointResult(rule.outcome, [rule.reason]);
    }
  }
  return checkpointResult(OUTCOME.VALID);
}

export {
  buildCheckpointDescriptor,
  checkpointResult,
  matchCheckpointIdentity,
  validateCheckpointDescriptor,
};
