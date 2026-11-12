import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';

import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';
import {SQLITE_RAFT_STATE_KEY} from '../../src/raft/sqlite-raft-state-constants.js';
import {PartitionRaftStorage} from '../../src/partition/partition-raft-storage.js';
import {RAFT_CHECKPOINT_PAYLOAD_FILE} from '../../src/raft/snapshot-checkpoint-constants.js';
import {
  createSqliteStateMachineCheckpoint,
} from '../../src/raft/snapshot-checkpoint-store.js';
import {
  inspectSnapshotInstallArtifactsForGeneration,
  removeSnapshotInstallArtifactsForGeneration,
  requestSnapshotInstall,
  resolvePendingSnapshotInstall,
} from '../../src/raft/snapshot-install.js';
import {
  RAFT_SNAPSHOT_BOUNDARY_STATE_KEY,
  RAFT_SNAPSHOT_INSTALL_DETAIL,
  RAFT_SNAPSHOT_INSTALL_SIDECAR_SUFFIXES,
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
  writeAtomicDurable,
} from '../../src/runtime/oci-host-agent-durable-files.js';

import {markerValue, readMarker} from '../../src/raft/snapshot-install-marker.js';
import {removeReplicaStorageArtifacts} from '../../src/node/replica-storage-artifacts.js';

// Canonical marker transition: unknown or unbound crash debris is preserved.
// raft-snapshot-atomic-install (R3): restart SHALL distinguish no install,
// partial staging, complete uninstalled, installed, and rejected — every
// crash point resolves idempotently via the install-nonce decision
// procedure. Each subtest fabricates one exact durable crash state and
// asserts the typed resolution.

const REPLICA = 'restart-states-r2';
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

function markerFile(fixture) {
  return path.join(fixture.installDir, RAFT_SNAPSHOT_INSTALL_MARKER_FILE);
}

function stagingFilePath(fixture) {
  return path.join(fixture.installDir, RAFT_SNAPSHOT_INSTALL_STAGING_FILE);
}

function writeMarker(fixture, state, binding, reason = RAFT_SNAPSHOT_INSTALL_NO_REJECTION) {
  fs.mkdirSync(fixture.installDir, {recursive: true});
  writeAtomicDurable(markerFile(fixture), markerValue(state, binding.installId,
    binding.generationIndex, reason, binding));
}

function resolve(fixture) {
  return resolvePendingSnapshotInstall({replicaDbPath: fixture.targetDbPath,
    checkpointsRoot: fixture.checkpointsRoot,
    expectedReplicaIdentity: REPLICA, expectedRaftGroupId: PARTITION_ID});
}

function cleanup(fixture) {
  return {checkpointsRoot: fixture.checkpointsRoot, replicaId: REPLICA,
    partitionId: PARTITION_ID, replicaCreatedAt: 1, attemptToken: 'cleanup-attempt'};
}

async function installedFixture(t) {
  const fixture = await createFixture();
  t.teardown(() => fixture.close());
  const installed = await requestSnapshotInstall({replicaDbPath: fixture.targetDbPath,
    checkpointsRoot: fixture.checkpointsRoot, generationIndex: fixture.generationIndex,
    expectedIdentity: IDENTITY, expectedReplicaIdentity: REPLICA});
  t.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
    'production SQL install succeeds with explicit receiver identity');
  const db = new Database(fixture.targetDbPath, {readonly: true});
  try {
    fixture.binding = JSON.parse(db.prepare('SELECT value FROM _raft_state WHERE key = ?')
      .pluck().get(RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.INSTALL_BINDING));
  } finally {
    db.close();
  }
  return fixture;
}

function preserved(t, file, before) {
  t.ok(fs.existsSync(file), 'artifact remains');
  t.equal(fs.readFileSync(file).equals(before), true, 'exact bytes remain');
}

test('no install artifacts resolves without side effects', async (t) => {
  const fixture = await createFixture();
  t.teardown(() => fixture.close());
  t.equal(resolve(fixture).outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.NO_INSTALL);
});

for (const state of [RAFT_SNAPSHOT_INSTALL_STATE.STAGED,
  RAFT_SNAPSHOT_INSTALL_STATE.INSTALLED]) {
  test(`${state} after rename recognizes the production binding idempotently`, async (t) => {
    const fixture = await installedFixture(t);
    writeMarker(fixture, state, fixture.binding);
    const before = fs.readFileSync(fixture.targetDbPath);
    t.equal(resolve(fixture).outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED);
    preserved(t, fixture.targetDbPath, before);
    t.notOk(fs.existsSync(markerFile(fixture)));
    t.equal(resolve(fixture).outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.NO_INSTALL);
  });
}

test('a bound STAGED image completes its interrupted rename', async (t) => {
  const fixture = await installedFixture(t);
  fs.renameSync(fixture.targetDbPath, stagingFilePath(fixture));
  writeMarker(fixture, RAFT_SNAPSHOT_INSTALL_STATE.STAGED, fixture.binding);
  const before = fs.readFileSync(stagingFilePath(fixture));
  t.equal(resolve(fixture).outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED);
  preserved(t, fixture.targetDbPath, before);
  t.notOk(fs.existsSync(stagingFilePath(fixture)));
});

test('unbound partial staging preserves all bytes with typed conflict', async (t) => {
  const fixture = await installedFixture(t);
  fs.rmSync(fixture.targetDbPath);
  writeMarker(fixture, RAFT_SNAPSHOT_INSTALL_STATE.STAGING, fixture.binding);
  fs.writeFileSync(stagingFilePath(fixture), 'partial bytes');
  const before = fs.readFileSync(markerFile(fixture));
  t.equal(resolve(fixture).outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALL_STATE_CONFLICT);
  preserved(t, markerFile(fixture), before);
  preserved(t, stagingFilePath(fixture), Buffer.from('partial bytes'));
});

test('a canonical marker with lost staging reports staging_lost without inventing bytes',
  async (t) => {
    const fixture = await installedFixture(t);
    fs.rmSync(fixture.targetDbPath);
    writeMarker(fixture, RAFT_SNAPSHOT_INSTALL_STATE.STAGED, fixture.binding);
    const result = resolve(fixture);
    t.equal(result.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.REJECTED);
    t.equal(result.reason, RAFT_SNAPSHOT_INSTALL_REJECTION.STAGING_LOST);
    t.equal(readMarker(fixture.checkpointsRoot).state, RAFT_SNAPSHOT_INSTALL_STATE.REJECTED);
    t.equal(resolve(fixture).detail, RAFT_SNAPSHOT_INSTALL_DETAIL.PRIOR_REJECTION_CONSUMED);
  });

for (const state of [RAFT_SNAPSHOT_INSTALL_STATE.STAGING, RAFT_SNAPSHOT_INSTALL_STATE.REJECTED]) {
  test(`${state} consumes only its bound staging and leaves the prior target absent`, async (t) => {
    const fixture = await installedFixture(t);
    fs.renameSync(fixture.targetDbPath, stagingFilePath(fixture));
    writeMarker(fixture, state, fixture.binding, state === RAFT_SNAPSHOT_INSTALL_STATE.REJECTED ?
      RAFT_SNAPSHOT_INSTALL_REJECTION.STAGING_LOST : RAFT_SNAPSHOT_INSTALL_NO_REJECTION);
    t.equal(resolve(fixture).outcome, state === RAFT_SNAPSHOT_INSTALL_STATE.STAGING ?
      RAFT_SNAPSHOT_INSTALL_OUTCOME.NO_INSTALL : RAFT_SNAPSHOT_INSTALL_OUTCOME.REJECTED);
    t.notOk(fs.existsSync(fixture.targetDbPath));
    t.notOk(fs.existsSync(stagingFilePath(fixture)));
    t.notOk(fs.existsSync(markerFile(fixture)));
  });
}

for (const field of ['kind', 'generationIndex', 'preInstallDigest', 'createAuthority']) {
  test(`binding refuses a substituted ${field} without deleting staging`, async (t) => {
    const fixture = await installedFixture(t);
    fs.renameSync(fixture.targetDbPath, stagingFilePath(fixture));
    const substitutions = {
      kind: RAFT_SNAPSHOT_INSTALL_MARKER_KIND.RAFT_RS_FOLLOWER_CATCHUP,
      generationIndex: fixture.binding.generationIndex + 1,
      preInstallDigest: `sha256:${'0'.repeat(64)}`,
      createAuthority: {...fixture.binding.createAuthority, entityId: 'another-table'},
    };
    writeMarker(fixture, RAFT_SNAPSHOT_INSTALL_STATE.STAGED,
      {...fixture.binding, [field]: substitutions[field]});
    const before = fs.readFileSync(stagingFilePath(fixture));
    t.equal(resolve(fixture).outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALL_STATE_CONFLICT);
    preserved(t, stagingFilePath(fixture), before);
    t.equal(inspectSnapshotInstallArtifactsForGeneration(cleanup(fixture)).owned, false);
  });
}

test('installed nonce plus a second staging file is a preserved conflict', async (t) => {
  const fixture = await installedFixture(t);
  writeMarker(fixture, RAFT_SNAPSHOT_INSTALL_STATE.STAGED, fixture.binding);
  fs.copyFileSync(fixture.targetDbPath, stagingFilePath(fixture));
  const before = fs.readFileSync(stagingFilePath(fixture));
  t.equal(resolve(fixture).outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALL_STATE_CONFLICT);
  preserved(t, stagingFilePath(fixture), before);
});

test('private observation supports a clean WAL-mode main without changing its bytes', async (t) => {
  const fixture = await installedFixture(t);
  const db = new Database(fixture.targetDbPath);
  db.pragma('journal_mode = WAL');
  db.close();
  const before = fs.readFileSync(fixture.targetDbPath);
  t.equal(before[18], 2, 'real SQLite close leaves WAL format in the main header');
  for (const suffix of RAFT_SNAPSHOT_INSTALL_SIDECAR_SUFFIXES) {
    t.notOk(fs.existsSync(`${fixture.targetDbPath}${suffix}`));
  }
  writeMarker(fixture, RAFT_SNAPSHOT_INSTALL_STATE.INSTALLED, fixture.binding);
  t.equal(resolve(fixture).outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED);
  preserved(t, fixture.targetDbPath, before);
});

test('invalid SQLite format bytes remain unowned even with a canonical marker', async (t) => {
  const fixture = await installedFixture(t);
  const bytes = fs.readFileSync(fixture.targetDbPath);
  bytes[18] = 3;
  fs.writeFileSync(fixture.targetDbPath, bytes);
  writeMarker(fixture, RAFT_SNAPSHOT_INSTALL_STATE.INSTALLED, fixture.binding);
  t.equal(resolve(fixture).outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALL_STATE_CONFLICT);
  preserved(t, fixture.targetDbPath, bytes);
});

for (const state of Object.values(RAFT_SNAPSHOT_INSTALL_STATE)) {
  test(`exact cleanup owns canonical bound ${state} staging`, async (t) => {
    const fixture = await installedFixture(t);
    fs.renameSync(fixture.targetDbPath, stagingFilePath(fixture));
    writeMarker(fixture, state, fixture.binding, state === RAFT_SNAPSHOT_INSTALL_STATE.REJECTED ?
      RAFT_SNAPSHOT_INSTALL_REJECTION.STAGING_LOST : RAFT_SNAPSHOT_INSTALL_NO_REJECTION);
    const foreign = {...cleanup(fixture), partitionId: 'foreign-group'};
    t.equal((await removeSnapshotInstallArtifactsForGeneration(foreign)).allAbsent, false);
    t.equal((await removeSnapshotInstallArtifactsForGeneration(cleanup(fixture))).allAbsent, true);
    t.equal((await removeSnapshotInstallArtifactsForGeneration(cleanup(fixture))).allAbsent, true);
  });
}

test('install artifact cleanup rechecks marker after asynchronous callback', async (t) => {
  const fixture = await installedFixture(t);
  fs.renameSync(fixture.targetDbPath, stagingFilePath(fixture));
  writeMarker(fixture, RAFT_SNAPSHOT_INSTALL_STATE.STAGED, fixture.binding);
  const before = fs.readFileSync(stagingFilePath(fixture));
  await t.rejects(removeSnapshotInstallArtifactsForGeneration({...cleanup(fixture),
    beforeRemove: async () => {
      queueMicrotask(() => writeAtomicDurable(markerFile(fixture), {successor: true}));
    }}), {code: RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALL_STATE_CONFLICT});
  preserved(t, stagingFilePath(fixture), before);
});

test('storage unlink rechecks marker after the callback promise settles', async (t) => {
  const fixture = await installedFixture(t);
  writeMarker(fixture, RAFT_SNAPSHOT_INSTALL_STATE.INSTALLED, fixture.binding);
  const inspection = inspectSnapshotInstallArtifactsForGeneration(cleanup(fixture));
  const before = fs.readFileSync(fixture.targetDbPath);
  await t.rejects(removeReplicaStorageArtifacts(fs, fixture.targetDbPath, async () => {
    queueMicrotask(() => writeAtomicDurable(markerFile(fixture), {successor: true}));
  }, inspection.assertUnchanged), {code: RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALL_STATE_CONFLICT});
  preserved(t, fixture.targetDbPath, before);
});

test('a rejected checkpoint neither creates a marker nor changes the old watermark', async (t) => {
  const fixture = await installedFixture(t);
  const before = fs.readFileSync(fixture.targetDbPath);
  const rejected = await requestSnapshotInstall({replicaDbPath: fixture.targetDbPath,
    checkpointsRoot: fixture.checkpointsRoot, generationIndex: fixture.generationIndex,
    expectedReplicaIdentity: REPLICA,
    expectedIdentity: {...IDENTITY, membershipEpoch: SEALED_EPOCH + 1}});
  t.equal(rejected.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.REJECTED);
  preserved(t, fixture.targetDbPath, before);
  t.notOk(fs.existsSync(markerFile(fixture)));
  const db = new Database(fixture.targetDbPath, {readonly: true});
  t.equal(Number(db.prepare('SELECT value FROM _raft_state WHERE key = ?')
    .pluck().get(SQLITE_RAFT_STATE_KEY.COMMITTED_INDEX)), fixture.generationIndex);
  db.close();
});

for (const suffix of RAFT_SNAPSHOT_INSTALL_SIDECAR_SUFFIXES) {
  test(`install cleanup preserves a new staging ${suffix} after its awaited callback`, async (t) => {
    const fixture = await installedFixture(t);
    fs.renameSync(fixture.targetDbPath, stagingFilePath(fixture));
    writeMarker(fixture, RAFT_SNAPSHOT_INSTALL_STATE.STAGED, fixture.binding);
    const before = fs.readFileSync(stagingFilePath(fixture));
    const sidecar = `${stagingFilePath(fixture)}${suffix}`;
    const bytes = Buffer.from(`new-${suffix}`);
    await t.rejects(removeSnapshotInstallArtifactsForGeneration({...cleanup(fixture),
      beforeRemove: async () => {
        queueMicrotask(() => fs.writeFileSync(sidecar, bytes));
      }}), {code: RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALL_STATE_CONFLICT});
    preserved(t, stagingFilePath(fixture), before);
    preserved(t, sidecar, bytes);
  });
}

test('immutable binding equality is independent of authority property order', async (t) => {
  const fixture = await installedFixture(t);
  const authority = fixture.binding.createAuthority;
  writeMarker(fixture, RAFT_SNAPSHOT_INSTALL_STATE.INSTALLED, {...fixture.binding,
    createAuthority: {replicaId: authority.replicaId, partitionId: authority.partitionId,
      entityType: authority.entityType, entityId: authority.entityId}});
  t.equal(resolve(fixture).outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED);
});

test('a subsequent SQL checkpoint excludes the local install binding', async (t) => {
  const fixture = await installedFixture(t);
  const db = new Database(fixture.targetDbPath);
  let created;
  try {
    created = await createSqliteStateMachineCheckpoint({db, identity: IDENTITY,
      checkpointsRoot: path.join(fixture.workDir, 'next-checkpoints')});
  } finally {
    db.close();
  }
  const payload = new Database(path.join(created.checkpointDir, RAFT_CHECKPOINT_PAYLOAD_FILE),
    {readonly: true});
  try {
    t.equal(payload.prepare('SELECT name FROM sqlite_master WHERE name = ?')
      .get('_raft_state'), undefined, 'local nonce, binding and boundary state are all scrubbed');
    t.equal(payload.prepare(`SELECT count(*) FROM ${STATE_TABLE}`).pluck().get(), 1);
  } finally {
    payload.close();
  }
});
