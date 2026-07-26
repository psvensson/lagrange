import {test} from '../../src/test-helpers/tap.js';

import {
  RAFT_CHECKPOINT_ENVELOPE_VERSION,
  RAFT_CHECKPOINT_PAYLOAD_KIND,
  RAFT_CHECKPOINT_PAYLOAD_VERSION,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from '../../src/raft/snapshot-checkpoint-constants.js';
import {
  buildCheckpointDescriptor,
  matchCheckpointIdentity,
  validateCheckpointDescriptor,
} from '../../src/raft/snapshot-checkpoint-format.js';

// raft-snapshot-checkpoint-format S1 (R1): the envelope must bind every
// identity dimension, reject unknown/missing fields exactly, and type every
// foreign/stale mismatch — a checkpoint failing any check is never progress.

const SEALED_INDEX = 42;
const SEALED_TERM = 7;
const SEALED_EPOCH = 5;
const PAYLOAD_BYTES = 4096;
const VALID_DIGEST = `sha256:${'ab'.repeat(32)}`;
const SEALED_MAX_HLC = '1750000000000-3-node-a';
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-1234',
  raftGroupId: 'sql_transactions-p1',
  entity: Object.freeze({kind: 'partition', id: 'sql_transactions'}),
  membershipEpoch: SEALED_EPOCH,
});

function sealedDescriptor(overrides = {}) {
  return {
    ...buildCheckpointDescriptor({
      clusterId: IDENTITY.clusterId,
      raftGroupId: IDENTITY.raftGroupId,
      entity: IDENTITY.entity,
      membershipEpoch: IDENTITY.membershipEpoch,
      lastIncludedIndex: SEALED_INDEX,
      lastIncludedTerm: SEALED_TERM,
      maxCommittedHlc: SEALED_MAX_HLC,
      payloadKind: RAFT_CHECKPOINT_PAYLOAD_KIND.SQLITE_STATE_MACHINE_IMAGE,
      payloadVersion: RAFT_CHECKPOINT_PAYLOAD_VERSION[
        RAFT_CHECKPOINT_PAYLOAD_KIND.SQLITE_STATE_MACHINE_IMAGE],
      payloadByteLength: PAYLOAD_BYTES,
      payloadDigest: VALID_DIGEST,
    }),
    ...overrides,
  };
}

test('a sealed descriptor round-trips structural validation and identity match',
  async (t) => {
    const descriptor = sealedDescriptor();
    t.equal(descriptor.envelopeVersion, RAFT_CHECKPOINT_ENVELOPE_VERSION,
      'the owner stamps the envelope version');
    const structural = validateCheckpointDescriptor(descriptor);
    t.equal(structural.outcome, RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
      'structural validation passes for a sealed descriptor');
    const identity = matchCheckpointIdentity(descriptor, IDENTITY);
    t.equal(identity.outcome, RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
      'identity match passes against the sealing identity');
  });

test('exact-object validation rejects unknown and missing descriptor fields',
  async (t) => {
    const extra = {...sealedDescriptor(), smuggled: true};
    t.equal(validateCheckpointDescriptor(extra).outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_DESCRIPTOR,
      'an unknown field is a typed corrupt descriptor');
    const missing = sealedDescriptor();
    delete missing.payloadDigest;
    t.equal(validateCheckpointDescriptor(missing).outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_DESCRIPTOR,
      'a missing field is a typed corrupt descriptor');
    t.equal(validateCheckpointDescriptor(null).outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_DESCRIPTOR,
      'a non-object is a typed corrupt descriptor');
  });

test('field-type violations are typed corrupt descriptors with named reasons',
  async (t) => {
    const badDigest = sealedDescriptor({payloadDigest: 'sha256:xyz'});
    const digestResult = validateCheckpointDescriptor(badDigest);
    t.equal(digestResult.outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_DESCRIPTOR,
      'a malformed digest is corrupt');
    t.ok(digestResult.reasons.includes('field:payloadDigest'),
      'the failing field is named in reasons');
    const negativeIndex = sealedDescriptor({lastIncludedIndex: -1});
    t.equal(validateCheckpointDescriptor(negativeIndex).outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_DESCRIPTOR,
      'a negative last-included index is corrupt');
    const badEntity = sealedDescriptor({entity: {kind: 'partition'}});
    t.equal(validateCheckpointDescriptor(badEntity).outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_DESCRIPTOR,
      'an entity missing its id is corrupt');
  });

test('unsupported envelope versions and payload kinds are typed, not progress',
  async (t) => {
    const futureEnvelope = sealedDescriptor({
      envelopeVersion: RAFT_CHECKPOINT_ENVELOPE_VERSION + 1,
    });
    t.equal(validateCheckpointDescriptor(futureEnvelope).outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.UNSUPPORTED_ENVELOPE_VERSION,
      'a future envelope version is typed unsupported');
    const alienKind = sealedDescriptor({payloadKind: 'tar_archive'});
    t.equal(validateCheckpointDescriptor(alienKind).outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.UNSUPPORTED_PAYLOAD_KIND,
      'an unknown payload kind is typed unsupported');
    const futurePayload = sealedDescriptor({
      payloadVersion: RAFT_CHECKPOINT_PAYLOAD_VERSION[
        RAFT_CHECKPOINT_PAYLOAD_KIND.SQLITE_STATE_MACHINE_IMAGE] + 1,
    });
    t.equal(validateCheckpointDescriptor(futurePayload).outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.UNSUPPORTED_PAYLOAD_KIND,
      'a future payload version is typed unsupported');
  });

test('every foreign identity dimension is rejected with its own typed outcome',
  async (t) => {
    const descriptor = sealedDescriptor();
    const cases = [
      {
        expected: {...IDENTITY, clusterId: 'cluster-incarnation-9999'},
        outcome: RAFT_CHECKPOINT_VALIDATION_OUTCOME.FOREIGN_CLUSTER,
      },
      {
        expected: {...IDENTITY, raftGroupId: 'sql_transactions-p2'},
        outcome: RAFT_CHECKPOINT_VALIDATION_OUTCOME.FOREIGN_GROUP,
      },
      {
        expected: {
          ...IDENTITY,
          entity: {kind: 'partition', id: 'replica_operations'},
        },
        outcome: RAFT_CHECKPOINT_VALIDATION_OUTCOME.FOREIGN_ENTITY,
      },
      {
        expected: {...IDENTITY, membershipEpoch: SEALED_EPOCH + 1},
        outcome: RAFT_CHECKPOINT_VALIDATION_OUTCOME.STALE_EPOCH,
      },
    ];
    for (const {expected, outcome} of cases) {
      t.equal(matchCheckpointIdentity(descriptor, expected).outcome, outcome,
        `mismatch is typed ${outcome}`);
    }
    const newerEpochReceiver = {...IDENTITY, membershipEpoch: SEALED_EPOCH - 1};
    t.equal(matchCheckpointIdentity(descriptor, newerEpochReceiver).outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
      'a descriptor sealed under a NEWER epoch than expected is not stale');
  });
