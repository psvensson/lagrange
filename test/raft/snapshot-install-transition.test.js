import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';

import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {
  RAFT_CHECKPOINT_DESCRIPTOR_FILE,
  RAFT_CHECKPOINT_ENVELOPE_VERSION,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_CHECKPOINT_PAYLOAD_KIND,
  RAFT_CHECKPOINT_PAYLOAD_VERSION,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from '../../src/raft/snapshot-checkpoint-constants.js';
import {requestSnapshotInstall} from '../../src/raft/snapshot-install.js';
import {
  RAFT_SNAPSHOT_INSTALL_OUTCOME,
  RAFT_SNAPSHOT_INSTALL_REJECTION,
} from '../../src/raft/snapshot-install-constants.js';
import {
  sha256Digest,
  writeAtomicDurable,
} from '../../src/runtime/oci-host-agent-durable-files.js';
import {
  createSealedSourceGeneration,
  defaultFollowerReplicaId,
  seedEstablishedFollowerReceiver,
} from './snapshot-catchup-fixture.js';

// raft-snapshot-atomic-install (R3) transition attacks on the canonical
// raft-rs replica-image pipeline: full follower-catchup install round trip,
// durable hard-state term/vote preservation rule, foreign identity and stale
// epoch rejections, worker-path refusal, and explicit rejection of obsolete
// non-raft-rs SQLITE_STATE_MACHINE_IMAGE checkpoints.

const PARTITION_ID = 'sql_transactions-p1';
const STATE_TABLE = 'sql_transactions';
const FOLLOWER_REPLICA = defaultFollowerReplicaId(PARTITION_ID);
const SOURCE_TERM = 4;
const SEALED_EPOCH = 3;
const ENTRY_COUNT = 3;
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-1234',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: SEALED_EPOCH,
});

async function createInstallFixture(localHardState = {}) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-install-'));
  const checkpointsRoot = path.join(workDir, 'checkpoints');
  const generation = await createSealedSourceGeneration({
    workDir,
    checkpointsRoot,
    partitionId: PARTITION_ID,
    stateTable: STATE_TABLE,
    term: SOURCE_TERM,
    identity: IDENTITY,
    entryCount: ENTRY_COUNT,
    followerReplicaId: FOLLOWER_REPLICA,
  });
  const targetDbPath = path.join(workDir, 'target.db');
  if (localHardState.seedTarget !== false) {
    seedEstablishedFollowerReceiver({
      replicaDbPath: targetDbPath,
      partitionId: PARTITION_ID,
      replicaId: FOLLOWER_REPLICA,
      term: localHardState.term ?? 1,
      vote: localHardState.vote ?? 0,
    });
  }
  return {
    workDir,
    checkpointsRoot,
    created: generation.created,
    lastIndex: generation.boundaryIndex,
    targetDbPath,
    close() {
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

function readTargetRecord(dbPath) {
  const db = new Database(dbPath, {readonly: true});
  try {
    return RaftRsDurableStore.readDurableRecordIn(db, PARTITION_ID);
  } finally {
    db.close();
  }
}

test('a follower-catchup install reconstructs canonical raft-rs durable state',
  async (t) => {
    const fixture = await createInstallFixture();
    try {
      const installed = await requestSnapshotInstall({
        replicaDbPath: fixture.targetDbPath,
        checkpointsRoot: fixture.checkpointsRoot,
        generationIndex: fixture.lastIndex,
        expectedIdentity: IDENTITY,
        expectedReplicaIdentity: FOLLOWER_REPLICA,
      });
      t.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
        'install completes');
      const record = readTargetRecord(fixture.targetDbPath);
      t.equal(record.appliedIndex, String(fixture.lastIndex),
        'appliedIndex reconstructs at the sealed generation');
      t.equal(record.hardState.commit, String(fixture.lastIndex),
        'hardState.commit reconstructs at the boundary');
      t.equal(record.hardState.term, String(SOURCE_TERM),
        'hardState.term rises to the sealed term');
      t.equal(record.entries.length, 0,
        'the raft-rs log is compacted-empty — sender log rows never imported');
      const db = new Database(fixture.targetDbPath, {readonly: true});
      try {
        t.equal(
          db.prepare(`SELECT COUNT(*) AS n FROM ${STATE_TABLE}`).get().n,
          ENTRY_COUNT,
          'state-machine rows arrive intact');
      } finally {
        db.close();
      }
    } finally {
      fixture.close();
    }
  });

test('the durable term/vote rule holds under follower-catchup install',
  async (t) => {
    await t.test('higher local term and its vote are preserved', async (t) => {
      const higherTerm = SOURCE_TERM + 5;
      const fixture = await createInstallFixture({term: higherTerm, vote: 2});
      try {
        const installed = await requestSnapshotInstall({
          replicaDbPath: fixture.targetDbPath,
          checkpointsRoot: fixture.checkpointsRoot,
          generationIndex: fixture.lastIndex,
          expectedIdentity: IDENTITY,
          expectedReplicaIdentity: FOLLOWER_REPLICA,
        });
        t.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
          'install completes over a higher-term local db');
        const record = readTargetRecord(fixture.targetDbPath);
        t.equal(record.hardState.term, String(higherTerm),
          'a higher local durable term is preserved, never regressed');
        t.equal(record.hardState.vote, '2',
          'the prior vote is retained because the term was unchanged');
      } finally {
        fixture.close();
      }
    });

    await t.test('a raised term clears the prior vote', async (t) => {
      const fixture = await createInstallFixture({term: 1, vote: 2});
      try {
        const installed = await requestSnapshotInstall({
          replicaDbPath: fixture.targetDbPath,
          checkpointsRoot: fixture.checkpointsRoot,
          generationIndex: fixture.lastIndex,
          expectedIdentity: IDENTITY,
          expectedReplicaIdentity: FOLLOWER_REPLICA,
        });
        t.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
          'install completes over a lower-term local db');
        const record = readTargetRecord(fixture.targetDbPath);
        t.equal(record.hardState.term, String(SOURCE_TERM),
          'the durable term rises to the snapshot included term');
        t.equal(record.hardState.vote, '0',
          'a raised term clears any prior vote');
      } finally {
        fixture.close();
      }
    });
  });

test('foreign identity and stale epoch are rejected at install time',
  async (t) => {
    const cases = [
      {
        label: 'foreign cluster',
        identity: {...IDENTITY, clusterId: 'cluster-incarnation-other'},
      },
      {
        label: 'foreign group',
        identity: {...IDENTITY, raftGroupId: 'sql_transactions-p9'},
      },
      {
        label: 'foreign entity',
        identity: {
          ...IDENTITY,
          entity: {kind: 'partition', id: 'replica_operations'},
        },
      },
      {
        label: 'stale epoch (epoch advanced past the sealed one)',
        identity: {...IDENTITY, membershipEpoch: SEALED_EPOCH + 1},
      },
    ];
    for (const {label, identity} of cases) {
      const fixture = await createInstallFixture({seedTarget: false});
      try {
        const refused = await requestSnapshotInstall({
          replicaDbPath: fixture.targetDbPath,
          checkpointsRoot: fixture.checkpointsRoot,
          generationIndex: fixture.lastIndex,
          expectedIdentity: identity,
          expectedReplicaIdentity: FOLLOWER_REPLICA,
        });
        t.equal(refused.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.REJECTED,
          `${label} is rejected`);
        t.equal(refused.reason,
          RAFT_SNAPSHOT_INSTALL_REJECTION.IDENTITY_MISMATCH,
          `${label} carries the typed identity reason`);
        t.notOk(fs.existsSync(fixture.targetDbPath),
          `${label}: the target replica db is never created by a rejection`);
      } finally {
        fixture.close();
      }
    }
  });

test('obsolete non-raft-rs sqlite_state_machine_image checkpoints are rejected',
  async (t) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-legacy-cp-'));
    try {
      const checkpointsRoot = path.join(workDir, 'checkpoints');
      const generationDir = path.join(checkpointsRoot, String(ENTRY_COUNT));
      fs.mkdirSync(generationDir, {recursive: true});
      const payloadPath = path.join(generationDir, RAFT_CHECKPOINT_PAYLOAD_FILE);
      const payloadDb = new Database(payloadPath);
      payloadDb.exec(`CREATE TABLE ${STATE_TABLE} (id TEXT PRIMARY KEY)`);
      payloadDb.close();
      const payloadBytes = fs.readFileSync(payloadPath);
      writeAtomicDurable(
        path.join(generationDir, RAFT_CHECKPOINT_DESCRIPTOR_FILE),
        {
          envelopeVersion: RAFT_CHECKPOINT_ENVELOPE_VERSION,
          clusterId: IDENTITY.clusterId,
          raftGroupId: IDENTITY.raftGroupId,
          entity: IDENTITY.entity,
          membershipEpoch: IDENTITY.membershipEpoch,
          lastIncludedIndex: ENTRY_COUNT,
          lastIncludedTerm: SOURCE_TERM,
          maxCommittedHlc: '0',
          payloadKind: RAFT_CHECKPOINT_PAYLOAD_KIND.SQLITE_STATE_MACHINE_IMAGE,
          payloadVersion: RAFT_CHECKPOINT_PAYLOAD_VERSION[
            RAFT_CHECKPOINT_PAYLOAD_KIND.SQLITE_STATE_MACHINE_IMAGE],
          payloadByteLength: payloadBytes.length,
          payloadDigest: sha256Digest(payloadBytes),
        },
      );
      const targetDbPath = path.join(workDir, 'target.db');
      const refused = await requestSnapshotInstall({
        replicaDbPath: targetDbPath,
        checkpointsRoot,
        generationIndex: ENTRY_COUNT,
        expectedIdentity: IDENTITY,
        expectedReplicaIdentity: FOLLOWER_REPLICA,
      });
      t.equal(refused.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.REJECTED,
        'legacy non-raft-rs checkpoint is rejected');
      t.equal(refused.reason, RAFT_SNAPSHOT_INSTALL_REJECTION.CHECKPOINT_INVALID,
        'refusal carries checkpoint_invalid');
      t.equal(refused.validationOutcome,
        RAFT_CHECKPOINT_VALIDATION_OUTCOME.UNSUPPORTED_PAYLOAD_KIND,
        'refusal names unsupported_payload_kind');
      t.notOk(fs.existsSync(targetDbPath),
        'rejected legacy checkpoint never creates a target db');
    } finally {
      fs.rmSync(workDir, {recursive: true, force: true});
    }
  });

test('worker-path (memory-backed) install requests are a typed refusal',
  async (t) => {
    const fixture = await createInstallFixture({seedTarget: false});
    try {
      const refused = await requestSnapshotInstall({
        replicaDbPath: ':memory:',
        checkpointsRoot: fixture.checkpointsRoot,
        generationIndex: fixture.lastIndex,
        expectedIdentity: IDENTITY,
        expectedReplicaIdentity: FOLLOWER_REPLICA,
      });
      t.equal(refused.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.REJECTED,
        'a memory-backed replica path cannot install');
      t.equal(refused.reason,
        RAFT_SNAPSHOT_INSTALL_REJECTION.WORKER_PATH_UNSUPPORTED,
        'the refusal is the typed worker-path reason');
    } finally {
      fixture.close();
    }
  });
