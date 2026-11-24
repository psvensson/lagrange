import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';

import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {
  requestSnapshotInstall,
  resolvePendingSnapshotInstall,
} from '../../src/raft/snapshot-install.js';
import {
  RAFT_SNAPSHOT_INSTALL_DIRNAME,
  RAFT_SNAPSHOT_INSTALL_MARKER_FILE,
  RAFT_SNAPSHOT_INSTALL_MARKER_KIND,
  RAFT_SNAPSHOT_INSTALL_NO_REJECTION,
  RAFT_SNAPSHOT_INSTALL_OUTCOME,
  RAFT_SNAPSHOT_INSTALL_REJECTION,
  RAFT_SNAPSHOT_INSTALL_STAGING_FILE,
  RAFT_SNAPSHOT_INSTALL_STATE,
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

// raft-snapshot-atomic-install (R3): restart SHALL distinguish no install,
// partial staging, complete uninstalled, installed, and rejected on the
// canonical raft-rs follower-catchup marker layout — and reject obsolete
// legacy marker shapes fail-closed.

const PARTITION_ID = 'replica_operations-p1';
const STATE_TABLE = 'replica_operations';
const FOLLOWER_REPLICA = defaultFollowerReplicaId(PARTITION_ID);
const TERM = 2;
const SEALED_EPOCH = 1;
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-42',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: SEALED_EPOCH,
});
const FOLLOWER_AUTHORITY = Object.freeze({
  entityId: STATE_TABLE,
  entityType: 'partition',
  partitionId: PARTITION_ID,
  replicaId: FOLLOWER_REPLICA,
});

async function createFixture() {
  const workDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'raft-install-restart-'));
  const checkpointsRoot = path.join(workDir, 'checkpoints');
  const generation = await createSealedSourceGeneration({
    workDir,
    checkpointsRoot,
    partitionId: PARTITION_ID,
    stateTable: STATE_TABLE,
    term: TERM,
    identity: IDENTITY,
    entryCount: 1,
    followerReplicaId: FOLLOWER_REPLICA,
  });
  const targetDbPath = path.join(workDir, 'target.db');
  seedEstablishedFollowerReceiver({
    replicaDbPath: targetDbPath,
    partitionId: PARTITION_ID,
    replicaId: FOLLOWER_REPLICA,
    term: 1,
    vote: 0,
  });
  return {
    workDir,
    checkpointsRoot,
    created: generation.created,
    generationIndex: generation.boundaryIndex,
    targetDbPath,
    preInstallDigest: sha256Digest(fs.readFileSync(targetDbPath)),
    installDir: path.join(checkpointsRoot, RAFT_SNAPSHOT_INSTALL_DIRNAME),
    close() {
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

function writeMarker(fixture, marker) {
  fs.mkdirSync(fixture.installDir, {recursive: true});
  writeAtomicDurable(
    path.join(fixture.installDir, RAFT_SNAPSHOT_INSTALL_MARKER_FILE),
    {
      rejectionReason: RAFT_SNAPSHOT_INSTALL_NO_REJECTION,
      kind: RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FOLLOWER_CATCHUP,
      createAuthority: FOLLOWER_AUTHORITY,
      preInstallDigest: fixture.preInstallDigest,
      ...marker,
    },
  );
}

function markerExists(fixture) {
  return fs.existsSync(
    path.join(fixture.installDir, RAFT_SNAPSHOT_INSTALL_MARKER_FILE));
}

function stagingFilePath(fixture) {
  return path.join(fixture.installDir, RAFT_SNAPSHOT_INSTALL_STAGING_FILE);
}

function readTargetAppliedIndex(fixture) {
  if (!fs.existsSync(fixture.targetDbPath)) return null;
  const db = new Database(fixture.targetDbPath, {readonly: true});
  try {
    return RaftRsDurableStore.readDurableRecordIn(db, PARTITION_ID).appliedIndex;
  } finally {
    db.close();
  }
}

test('no marker resolves to no_install with zero side effects', async (t) => {
  const fixture = await createFixture();
  try {
    const resolution = resolvePendingSnapshotInstall({
      replicaDbPath: fixture.targetDbPath,
      checkpointsRoot: fixture.checkpointsRoot,
    });
    t.equal(resolution.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.NO_INSTALL,
      'absence of the marker is the no-install state');
  } finally {
    fixture.close();
  }
});

test('a partial staging crash is discarded when no mismatched binding exists',
  async (t) => {
    const fixture = await createFixture();
    try {
      writeMarker(fixture, {
        state: RAFT_SNAPSHOT_INSTALL_STATE.STAGING,
        installId: 'crashed-mid-staging',
        generationIndex: fixture.generationIndex,
      });
      const resolution = resolvePendingSnapshotInstall({
        replicaDbPath: fixture.targetDbPath,
        checkpointsRoot: fixture.checkpointsRoot,
      });
      t.equal(resolution.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.NO_INSTALL,
        'partial staging without staging payload never installs');
      t.notOk(markerExists(fixture), 'the marker is cleared');
    } finally {
      fixture.close();
    }
  });

test('the staged-marker decision procedure on raft-rs follower catchup',
  async (t) => {
    await t.test('staged with staging present completes the swap (crash before rename)',
      async (t) => {
        const fixture = await createFixture();
        try {
          const originalBytes = fs.readFileSync(fixture.targetDbPath);
          const installed = await requestSnapshotInstall({
            replicaDbPath: fixture.targetDbPath,
            checkpointsRoot: fixture.checkpointsRoot,
            generationIndex: fixture.generationIndex,
            expectedIdentity: IDENTITY,
            expectedReplicaIdentity: FOLLOWER_REPLICA,
          });
          t.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
            'precondition: a full install succeeded');
          // Rewind: move installed db to staging slot, restore pre-install
          // receiver db, and write STAGED marker.
          fs.mkdirSync(fixture.installDir, {recursive: true});
          fs.renameSync(fixture.targetDbPath, stagingFilePath(fixture));
          fs.writeFileSync(fixture.targetDbPath, originalBytes);
          writeMarker(fixture, {
            state: RAFT_SNAPSHOT_INSTALL_STATE.STAGED,
            installId: installed.installId,
            generationIndex: fixture.generationIndex,
          });
          const resolution = resolvePendingSnapshotInstall({
            replicaDbPath: fixture.targetDbPath,
            checkpointsRoot: fixture.checkpointsRoot,
          });
          t.equal(resolution.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
            'the swap suffix completes the install');
          t.equal(readTargetAppliedIndex(fixture), String(fixture.generationIndex),
            'the installed database carries the sealed raft-rs boundary');
          t.notOk(markerExists(fixture), 'the marker is cleared');
        } finally {
          fixture.close();
        }
      });

    await t.test('staged after rename (marker update lost) is recognized by binding',
      async (t) => {
        const fixture = await createFixture();
        try {
          const installed = await requestSnapshotInstall({
            replicaDbPath: fixture.targetDbPath,
            checkpointsRoot: fixture.checkpointsRoot,
            generationIndex: fixture.generationIndex,
            expectedIdentity: IDENTITY,
            expectedReplicaIdentity: FOLLOWER_REPLICA,
          });
          writeMarker(fixture, {
            state: RAFT_SNAPSHOT_INSTALL_STATE.STAGED,
            installId: installed.installId,
            generationIndex: fixture.generationIndex,
          });
          const resolution = resolvePendingSnapshotInstall({
            replicaDbPath: fixture.targetDbPath,
            checkpointsRoot: fixture.checkpointsRoot,
          });
          t.equal(resolution.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
            'matching image + binding means the rename already happened');
          t.notOk(markerExists(fixture), 'the marker is cleared');
        } finally {
          fixture.close();
        }
      });

    await t.test('staged with staging lost and no rename is a typed rejection',
      async (t) => {
        const fixture = await createFixture();
        try {
          writeMarker(fixture, {
            state: RAFT_SNAPSHOT_INSTALL_STATE.STAGED,
            installId: 'never-renamed',
            generationIndex: fixture.generationIndex,
          });
          const resolution = resolvePendingSnapshotInstall({
            replicaDbPath: fixture.targetDbPath,
            checkpointsRoot: fixture.checkpointsRoot,
          });
          t.equal(resolution.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.REJECTED,
            'lost staging with no rename cannot install');
          t.equal(resolution.reason,
            RAFT_SNAPSHOT_INSTALL_REJECTION.STAGING_LOST,
            'the typed staging_lost reason is recorded');
          t.ok(markerExists(fixture),
            'the rejected marker is retained for diagnosis');
        } finally {
          fixture.close();
        }
      });

    await t.test('target match WITH staging present is the fail-closed conflict',
      async (t) => {
        const fixture = await createFixture();
        try {
          const installed = await requestSnapshotInstall({
            replicaDbPath: fixture.targetDbPath,
            checkpointsRoot: fixture.checkpointsRoot,
            generationIndex: fixture.generationIndex,
            expectedIdentity: IDENTITY,
            expectedReplicaIdentity: FOLLOWER_REPLICA,
          });
          writeMarker(fixture, {
            state: RAFT_SNAPSHOT_INSTALL_STATE.STAGED,
            installId: installed.installId,
            generationIndex: fixture.generationIndex,
          });
          fs.writeFileSync(stagingFilePath(fixture), 'impossible-leftover');
          const resolution = resolvePendingSnapshotInstall({
            replicaDbPath: fixture.targetDbPath,
            checkpointsRoot: fixture.checkpointsRoot,
          });
          t.equal(resolution.outcome,
            RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALL_STATE_CONFLICT,
            'the unreachable-under-atomic-rename state fails closed');
          t.ok(markerExists(fixture), 'nothing is healed silently');
        } finally {
          fixture.close();
        }
      });
  });

test('installed and rejected markers resolve per the state machine',
  async (t) => {
    await t.test('installed marker with matching binding clears', async (t) => {
      const fixture = await createFixture();
      try {
        const installed = await requestSnapshotInstall({
          replicaDbPath: fixture.targetDbPath,
          checkpointsRoot: fixture.checkpointsRoot,
          generationIndex: fixture.generationIndex,
          expectedIdentity: IDENTITY,
          expectedReplicaIdentity: FOLLOWER_REPLICA,
        });
        writeMarker(fixture, {
          state: RAFT_SNAPSHOT_INSTALL_STATE.INSTALLED,
          installId: installed.installId,
          generationIndex: fixture.generationIndex,
        });
        const resolution = resolvePendingSnapshotInstall({
          replicaDbPath: fixture.targetDbPath,
          checkpointsRoot: fixture.checkpointsRoot,
        });
        t.equal(resolution.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
          'a completed install is recognized');
        t.notOk(markerExists(fixture), 'the marker is cleared');
      } finally {
        fixture.close();
      }
    });

    await t.test('installed marker with foreign nonce is the conflict',
      async (t) => {
        const fixture = await createFixture();
        try {
          await requestSnapshotInstall({
            replicaDbPath: fixture.targetDbPath,
            checkpointsRoot: fixture.checkpointsRoot,
            generationIndex: fixture.generationIndex,
            expectedIdentity: IDENTITY,
            expectedReplicaIdentity: FOLLOWER_REPLICA,
          });
          writeMarker(fixture, {
            state: RAFT_SNAPSHOT_INSTALL_STATE.INSTALLED,
            installId: 'foreign-nonce',
            generationIndex: fixture.generationIndex,
          });
          const resolution = resolvePendingSnapshotInstall({
            replicaDbPath: fixture.targetDbPath,
            checkpointsRoot: fixture.checkpointsRoot,
          });
          t.equal(resolution.outcome,
            RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALL_STATE_CONFLICT,
            'an installed marker the database does not corroborate fails closed');
        } finally {
          fixture.close();
        }
      });

    await t.test('a rejected marker boots the old state and is retained',
      async (t) => {
        const fixture = await createFixture();
        try {
          writeMarker(fixture, {
            state: RAFT_SNAPSHOT_INSTALL_STATE.REJECTED,
            installId: 'was-rejected',
            generationIndex: fixture.generationIndex,
            rejectionReason:
              RAFT_SNAPSHOT_INSTALL_REJECTION.IDENTITY_MISMATCH,
          });
          const resolution = resolvePendingSnapshotInstall({
            replicaDbPath: fixture.targetDbPath,
            checkpointsRoot: fixture.checkpointsRoot,
          });
          t.equal(resolution.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.REJECTED,
            'a prior rejection boots the old state');
          t.equal(resolution.reason,
            RAFT_SNAPSHOT_INSTALL_REJECTION.IDENTITY_MISMATCH,
            'the recorded typed reason is surfaced');
          t.ok(markerExists(fixture), 'the marker is retained for diagnosis');
        } finally {
          fixture.close();
        }
      });
  });

test('obsolete legacy install marker shapes fail closed', async (t) => {
  const fixture = await createFixture();
  try {
    fs.mkdirSync(fixture.installDir, {recursive: true});
    writeAtomicDurable(
      path.join(fixture.installDir, RAFT_SNAPSHOT_INSTALL_MARKER_FILE),
      {
        state: RAFT_SNAPSHOT_INSTALL_STATE.STAGING,
        installId: 'legacy-4-field',
        generationIndex: fixture.generationIndex,
        rejectionReason: RAFT_SNAPSHOT_INSTALL_NO_REJECTION,
      },
    );
    t.throws(
      () => resolvePendingSnapshotInstall({
        replicaDbPath: fixture.targetDbPath,
        checkpointsRoot: fixture.checkpointsRoot,
      }),
      {code: 'RAFT_SNAPSHOT_INSTALL_MARKER_CORRUPT'},
      'legacy 4-field marker is rejected fail-closed');
  } finally {
    fixture.close();
  }
});

test('no commit watermark is observable ahead of installed state', async (t) => {
  const fixture = await createFixture();
  try {
    const beforeRecord = (() => {
      const db = new Database(fixture.targetDbPath, {readonly: true});
      try {
        return RaftRsDurableStore.readDurableRecordIn(db, PARTITION_ID);
      } finally {
        db.close();
      }
    })();
    const refused = await requestSnapshotInstall({
      replicaDbPath: fixture.targetDbPath,
      checkpointsRoot: fixture.checkpointsRoot,
      generationIndex: fixture.generationIndex,
      expectedIdentity: {...IDENTITY, membershipEpoch: SEALED_EPOCH + 1},
      expectedReplicaIdentity: FOLLOWER_REPLICA,
    });
    t.equal(refused.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.REJECTED,
      'the stale-epoch install is rejected');
    const afterRecord = (() => {
      const db = new Database(fixture.targetDbPath, {readonly: true});
      try {
        return RaftRsDurableStore.readDurableRecordIn(db, PARTITION_ID);
      } finally {
        db.close();
      }
    })();
    t.equal(afterRecord.hardState.commit, beforeRecord.hardState.commit,
      'the old commit watermark is untouched by the rejected install');
  } finally {
    fixture.close();
  }
});
