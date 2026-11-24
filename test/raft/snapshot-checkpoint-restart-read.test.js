import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';

import {writeAtomicDurable} from '../../src/runtime/oci-host-agent-durable-files.js';
import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
  RAFT_CHECKPOINT_DESCRIPTOR_FILE,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from '../../src/raft/snapshot-checkpoint-constants.js';
import {
  readCheckpoint,
} from '../../src/raft/snapshot-checkpoint-store.js';
import {createSealedSourceGeneration} from './snapshot-catchup-fixture.js';

// raft-snapshot-checkpoint-format S1 (R1): a sealed checkpoint must be
// restart-readable purely from disk, and every corruption/truncation/partial
// attack must produce its typed non-progress outcome. Each attack mutates a
// FRESHLY created checkpoint, and the pre-attack read is asserted VALID so no
// rejection can pass vacuously.

const PARTITION_ID = 'replica_operations-p1';
const STATE_TABLE = 'replica_operations';
const TERM = 3;
const SEALED_EPOCH = 1;
const FLIP_XOR_MASK = 0xff;
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-5678',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: SEALED_EPOCH,
});

async function createSealedFixture() {
  const workDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'raft-checkpoint-restart-'));
  const checkpointsRoot = path.join(workDir, 'checkpoints');
  const {created} = await createSealedSourceGeneration({
    workDir,
    checkpointsRoot,
    partitionId: PARTITION_ID,
    stateTable: STATE_TABLE,
    term: TERM,
    identity: IDENTITY,
    entryCount: 1,
  });
  return {
    workDir,
    created,
    close() {
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

function assertPreAttackValid(t, fixture) {
  t.equal(fixture.created.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
    'fixture checkpoint was created');
  const preAttack = readCheckpoint({
    checkpointDir: fixture.created.checkpointDir,
    expectedIdentity: IDENTITY,
  });
  t.equal(preAttack.outcome, RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
    'anti-vacuous: the checkpoint reads VALID before the attack');
}

test('a sealed checkpoint is restart-readable purely from disk', async (t) => {
  const fixture = await createSealedFixture();
  try {
    // The creating db handle is already closed; this read sees only disk.
    const reread = readCheckpoint({
      checkpointDir: fixture.created.checkpointDir,
      expectedIdentity: IDENTITY,
    });
    t.equal(reread.outcome, RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
      'cold read of a sealed generation is VALID');
    t.same(reread.descriptor, fixture.created.descriptor,
      'the cold-read descriptor equals the sealed descriptor');
  } finally {
    fixture.close();
  }
});

test('payload corruption attacks are typed corrupt_payload', async (t) => {
  await t.test('flipped payload byte breaks the digest', async (t) => {
    const fixture = await createSealedFixture();
    try {
      assertPreAttackValid(t, fixture);
      const payloadPath = path.join(
        fixture.created.checkpointDir, RAFT_CHECKPOINT_PAYLOAD_FILE);
      const bytes = fs.readFileSync(payloadPath);
      bytes[bytes.length - 1] ^= FLIP_XOR_MASK;
      fs.writeFileSync(payloadPath, bytes);
      const attacked = readCheckpoint({
        checkpointDir: fixture.created.checkpointDir,
        expectedIdentity: IDENTITY,
      });
      t.equal(attacked.outcome,
        RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_PAYLOAD,
        'a flipped byte is typed corrupt_payload');
      t.ok(attacked.reasons.includes('digest'), 'the digest names the reason');
    } finally {
      fixture.close();
    }
  });

  await t.test('truncated payload breaks the byte length', async (t) => {
    const fixture = await createSealedFixture();
    try {
      assertPreAttackValid(t, fixture);
      const payloadPath = path.join(
        fixture.created.checkpointDir, RAFT_CHECKPOINT_PAYLOAD_FILE);
      const bytes = fs.readFileSync(payloadPath);
      fs.writeFileSync(payloadPath, bytes.subarray(0, bytes.length - 1));
      const attacked = readCheckpoint({
        checkpointDir: fixture.created.checkpointDir,
        expectedIdentity: IDENTITY,
      });
      t.equal(attacked.outcome,
        RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_PAYLOAD,
        'truncation is typed corrupt_payload');
      t.ok(attacked.reasons.includes('byte_length'),
        'the byte length names the reason');
    } finally {
      fixture.close();
    }
  });

  await t.test('a stray WAL sidecar invalidates the sealed bytes', async (t) => {
    const fixture = await createSealedFixture();
    try {
      assertPreAttackValid(t, fixture);
      const payloadPath = path.join(
        fixture.created.checkpointDir, RAFT_CHECKPOINT_PAYLOAD_FILE);
      fs.writeFileSync(`${payloadPath}-wal`, 'stray');
      const attacked = readCheckpoint({
        checkpointDir: fixture.created.checkpointDir,
        expectedIdentity: IDENTITY,
      });
      t.equal(attacked.outcome,
        RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_PAYLOAD,
        'a WAL sidecar changes effective content without changing payload ' +
        'bytes, so it is typed corrupt_payload');
      t.ok(attacked.reasons.includes('stale_sidecar'),
        'the sidecar names the reason');
    } finally {
      fixture.close();
    }
  });
});

test('descriptor attacks are typed corrupt_descriptor or partial', async (t) => {
  await t.test('non-canonical descriptor bytes', async (t) => {
    const fixture = await createSealedFixture();
    try {
      assertPreAttackValid(t, fixture);
      const descriptorPath = path.join(
        fixture.created.checkpointDir, RAFT_CHECKPOINT_DESCRIPTOR_FILE);
      fs.appendFileSync(descriptorPath, ' ');
      const attacked = readCheckpoint({
        checkpointDir: fixture.created.checkpointDir,
        expectedIdentity: IDENTITY,
      });
      t.equal(attacked.outcome,
        RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_DESCRIPTOR,
        'mangled descriptor bytes are typed corrupt_descriptor');
    } finally {
      fixture.close();
    }
  });

  await t.test('deleted descriptor is a partial checkpoint', async (t) => {
    const fixture = await createSealedFixture();
    try {
      assertPreAttackValid(t, fixture);
      fs.rmSync(path.join(
        fixture.created.checkpointDir, RAFT_CHECKPOINT_DESCRIPTOR_FILE));
      const attacked = readCheckpoint({
        checkpointDir: fixture.created.checkpointDir,
        expectedIdentity: IDENTITY,
      });
      t.equal(attacked.outcome, RAFT_CHECKPOINT_VALIDATION_OUTCOME.PARTIAL,
        'payload without descriptor is typed partial, never progress');
    } finally {
      fixture.close();
    }
  });

  await t.test('deleted payload is a partial checkpoint', async (t) => {
    const fixture = await createSealedFixture();
    try {
      assertPreAttackValid(t, fixture);
      fs.rmSync(path.join(
        fixture.created.checkpointDir, RAFT_CHECKPOINT_PAYLOAD_FILE));
      const attacked = readCheckpoint({
        checkpointDir: fixture.created.checkpointDir,
        expectedIdentity: IDENTITY,
      });
      t.equal(attacked.outcome, RAFT_CHECKPOINT_VALIDATION_OUTCOME.PARTIAL,
        'descriptor without payload is typed partial, never progress');
    } finally {
      fixture.close();
    }
  });

  await t.test('a duplicated descriptor under a foreign identity is rejected',
    async (t) => {
      const fixture = await createSealedFixture();
      try {
        assertPreAttackValid(t, fixture);
        // Duplicate attack: reseal the same descriptor bytes under a foreign
        // receiver identity — the identity match, not file plumbing, rejects.
        const foreignReceiver = {
          ...IDENTITY,
          clusterId: 'cluster-incarnation-other',
        };
        const attacked = readCheckpoint({
          checkpointDir: fixture.created.checkpointDir,
          expectedIdentity: foreignReceiver,
        });
        t.equal(attacked.outcome,
          RAFT_CHECKPOINT_VALIDATION_OUTCOME.FOREIGN_CLUSTER,
          'a duplicated checkpoint from another cluster is typed foreign');
      } finally {
        fixture.close();
      }
    });

  await t.test('a stale-epoch descriptor is rejected on read', async (t) => {
    const fixture = await createSealedFixture();
    try {
      assertPreAttackValid(t, fixture);
      const advancedReceiver = {
        ...IDENTITY,
        membershipEpoch: SEALED_EPOCH + 1,
      };
      const attacked = readCheckpoint({
        checkpointDir: fixture.created.checkpointDir,
        expectedIdentity: advancedReceiver,
      });
      t.equal(attacked.outcome,
        RAFT_CHECKPOINT_VALIDATION_OUTCOME.STALE_EPOCH,
        'an epoch-advanced receiver types the old checkpoint stale');
    } finally {
      fixture.close();
    }
  });

  await t.test('a hand-forged unsupported envelope is typed on read',
    async (t) => {
      const fixture = await createSealedFixture();
      try {
        assertPreAttackValid(t, fixture);
        const descriptorPath = path.join(
          fixture.created.checkpointDir, RAFT_CHECKPOINT_DESCRIPTOR_FILE);
        writeAtomicDurable(descriptorPath, {
          ...fixture.created.descriptor,
          envelopeVersion: fixture.created.descriptor.envelopeVersion + 1,
        });
        const attacked = readCheckpoint({
          checkpointDir: fixture.created.checkpointDir,
          expectedIdentity: IDENTITY,
        });
        t.equal(attacked.outcome,
          RAFT_CHECKPOINT_VALIDATION_OUTCOME.UNSUPPORTED_ENVELOPE_VERSION,
          'a future envelope version is typed unsupported on read');
      } finally {
        fixture.close();
      }
    });
});
