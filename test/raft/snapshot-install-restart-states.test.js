import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';

import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';
import {SQLITE_RAFT_STATE_KEY} from '../../src/raft/sqlite-log-adapter-callback-api.js';
import {PartitionRaftStorage} from '../../src/partition/partition-raft-storage.js';
import {
  createSqliteStateMachineCheckpoint,
} from '../../src/raft/snapshot-checkpoint-store.js';
import {
  requestSnapshotInstall,
  resolvePendingSnapshotInstall,
} from '../../src/raft/snapshot-install.js';
import {
  RAFT_SNAPSHOT_BOUNDARY_STATE_KEY,
  RAFT_SNAPSHOT_INSTALL_DIRNAME,
  RAFT_SNAPSHOT_INSTALL_MARKER_FILE,
  RAFT_SNAPSHOT_INSTALL_NO_REJECTION,
  RAFT_SNAPSHOT_INSTALL_OUTCOME,
  RAFT_SNAPSHOT_INSTALL_REJECTION,
  RAFT_SNAPSHOT_INSTALL_STAGING_FILE,
  RAFT_SNAPSHOT_INSTALL_STATE,
} from '../../src/raft/snapshot-install-constants.js';
import {
  writeAtomicDurable,
} from '../../src/runtime/oci-host-agent-durable-files.js';

// raft-snapshot-atomic-install (R3): restart SHALL distinguish no install,
// partial staging, complete uninstalled, installed, and rejected — every
// crash point resolves idempotently via the install-nonce decision
// procedure. Each subtest fabricates one exact durable crash state and
// asserts the typed resolution.

const PARTITION_ID = 'replica_operations-p1';
const STATE_TABLE = 'replica_operations';
const TERM = 2;
const SEALED_EPOCH = 3;
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-42',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: SEALED_EPOCH,
});

async function createFixture() {
  const workDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'raft-install-restart-'));
  const sourceDb = new Database(path.join(workDir, 'source.db'));
  const adapter = new SQLiteLogAdapter(
    sourceDb, {address: PARTITION_ID, term: TERM});
  const storage = new PartitionRaftStorage(sourceDb, PARTITION_ID, adapter);
  sourceDb.exec(`CREATE TABLE IF NOT EXISTS ${STATE_TABLE} ` +
    '(id TEXT PRIMARY KEY, payload TEXT)');
  const entry = adapter.saveCommand({sql: 'row'}, TERM);
  adapter.commit(entry.index);
  sourceDb.prepare(
    `INSERT INTO ${STATE_TABLE} (id, payload) VALUES (?, ?)`,
  ).run('row', 'payload');
  storage.recordAppliedAdvance();
  const checkpointsRoot = path.join(workDir, 'checkpoints');
  const created = await createSqliteStateMachineCheckpoint({
    db: sourceDb,
    identity: IDENTITY,
    checkpointsRoot,
  });
  sourceDb.close();
  return {
    workDir,
    checkpointsRoot,
    created,
    generationIndex: entry.index,
    targetDbPath: path.join(workDir, 'target.db'),
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
    {rejectionReason: RAFT_SNAPSHOT_INSTALL_NO_REJECTION, ...marker});
}

function markerExists(fixture) {
  return fs.existsSync(
    path.join(fixture.installDir, RAFT_SNAPSHOT_INSTALL_MARKER_FILE));
}

function stagingFilePath(fixture) {
  return path.join(fixture.installDir, RAFT_SNAPSHOT_INSTALL_STAGING_FILE);
}

function readTargetInstallId(fixture) {
  if (!fs.existsSync(fixture.targetDbPath)) return null;
  const db = new Database(fixture.targetDbPath, {readonly: true});
  try {
    const row = db.prepare('SELECT value FROM _raft_state WHERE key = ?')
      .get(RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.INSTALL_ID);
    return row ? row.value : null;
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

test('a partial staging crash is discarded and boots the old state',
  async (t) => {
    const fixture = await createFixture();
    try {
      writeMarker(fixture, {
        state: RAFT_SNAPSHOT_INSTALL_STATE.STAGING,
        installId: 'crashed-mid-staging',
        generationIndex: fixture.generationIndex,
      });
      fs.writeFileSync(stagingFilePath(fixture), 'partial-bytes');
      const resolution = resolvePendingSnapshotInstall({
        replicaDbPath: fixture.targetDbPath,
        checkpointsRoot: fixture.checkpointsRoot,
      });
      t.equal(resolution.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.NO_INSTALL,
        'partial staging never installs');
      t.notOk(fs.existsSync(stagingFilePath(fixture)),
        'the partial staging file is discarded');
      t.notOk(markerExists(fixture), 'the marker is cleared');
    } finally {
      fixture.close();
    }
  });

test('the staged-marker nonce decision procedure', async (t) => {
  // A REAL completed install provides the durable artifacts the crash
  // states are fabricated from.
  await t.test('staged with staging present completes the swap (crash before rename)',
    async (t) => {
      const fixture = await createFixture();
      try {
        // Run a full install, then rewind: move the installed db back into
        // the staging slot and reset the marker to staged — byte-identical
        // to a crash after reconstruction, before the rename.
        const installed = await requestSnapshotInstall({
          replicaDbPath: fixture.targetDbPath,
          checkpointsRoot: fixture.checkpointsRoot,
          generationIndex: fixture.generationIndex,
          expectedIdentity: IDENTITY,
        });
        t.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
          'precondition: a full install succeeded');
        fs.renameSync(fixture.targetDbPath, stagingFilePath(fixture));
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
        t.equal(readTargetInstallId(fixture), installed.installId,
          'the installed database carries the marker nonce');
        t.notOk(markerExists(fixture), 'the marker is cleared');
      } finally {
        fixture.close();
      }
    });

  await t.test('staged after rename (marker update lost) is recognized by nonce',
    async (t) => {
      const fixture = await createFixture();
      try {
        const installed = await requestSnapshotInstall({
          replicaDbPath: fixture.targetDbPath,
          checkpointsRoot: fixture.checkpointsRoot,
          generationIndex: fixture.generationIndex,
          expectedIdentity: IDENTITY,
        });
        // Crash simulation: rename happened (target carries the nonce) but
        // the marker still says staged and staging is gone.
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
          'nonce match means the rename already happened');
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

  await t.test('nonce match WITH staging present is the fail-closed conflict',
    async (t) => {
      const fixture = await createFixture();
      try {
        const installed = await requestSnapshotInstall({
          replicaDbPath: fixture.targetDbPath,
          checkpointsRoot: fixture.checkpointsRoot,
          generationIndex: fixture.generationIndex,
          expectedIdentity: IDENTITY,
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
    await t.test('installed marker with matching nonce clears', async (t) => {
      const fixture = await createFixture();
      try {
        const installed = await requestSnapshotInstall({
          replicaDbPath: fixture.targetDbPath,
          checkpointsRoot: fixture.checkpointsRoot,
          generationIndex: fixture.generationIndex,
          expectedIdentity: IDENTITY,
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

test('no commit watermark is observable ahead of installed state', async (t) => {
  const fixture = await createFixture();
  try {
    // Fabricate an OLD target replica with its own committed history.
    const oldDb = new Database(fixture.targetDbPath);
    const oldAdapter = new SQLiteLogAdapter(
      oldDb, {address: PARTITION_ID, term: 1});
    const oldEntry = oldAdapter.saveCommand({sql: 'old-row'}, 1);
    oldAdapter.commit(oldEntry.index);
    oldDb.close();
    // A rejected install (stale epoch) must leave the old watermark intact.
    const refused = await requestSnapshotInstall({
      replicaDbPath: fixture.targetDbPath,
      checkpointsRoot: fixture.checkpointsRoot,
      generationIndex: fixture.generationIndex,
      expectedIdentity: {...IDENTITY, membershipEpoch: SEALED_EPOCH + 1},
    });
    t.equal(refused.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.REJECTED,
      'the stale-epoch install is rejected');
    const db = new Database(fixture.targetDbPath, {readonly: true});
    try {
      const row = db.prepare('SELECT value FROM _raft_state WHERE key = ?')
        .get(SQLITE_RAFT_STATE_KEY.COMMITTED_INDEX);
      t.equal(Number(row.value), oldEntry.index,
        'the old commit watermark is untouched by the rejected install');
    } finally {
      db.close();
    }
  } finally {
    fixture.close();
  }
});
