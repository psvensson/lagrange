import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';

import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';
import {PartitionRaftStorage} from '../../src/partition/partition-raft-storage.js';
import {
  COMMITTED_ENTRY_WRITE_OUTCOME,
  guardCommittedEntryWrite,
} from '../../src/raft/committed-entry-guard.js';
import {
  createSqliteStateMachineCheckpoint,
} from '../../src/raft/snapshot-checkpoint-store.js';
import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
} from '../../src/raft/snapshot-checkpoint-constants.js';
import {requestSnapshotInstall} from '../../src/raft/snapshot-install.js';
import {
  RAFT_SNAPSHOT_INSTALL_OUTCOME,
} from '../../src/raft/snapshot-install-constants.js';
import {warmHlcFromDurableWitnesses} from '../../src/partition/partition-hlc-warmup.js';

// raft-snapshot-atomic-install (R3): after an install the adapters must
// OBSERVE the reconstructed boundary — last-log identity, compacted lineage,
// witness-silent truncation clamps, the COMPACTED idempotent write outcome,
// re-checkpointability at the boundary, and HLC warm-up from the sealed
// witness — while genuinely virgin logs keep the CL-042 zero.

const PARTITION_ID = 'sql_transactions-p1';
const STATE_TABLE = 'sql_transactions';
const TERM = 3;
const SEALED_EPOCH = 2;
const ENTRY_COUNT = 2;
const SEALED_HLC = '1750000009999-7-node-src';
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-b',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: SEALED_EPOCH,
});

// Source with committed entries whose commands carry HLC timestamps, sealed
// checkpoint, installed into a target; returns an OPEN adapter over the
// installed target (caller closes).
async function createInstalledFixture() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-boundary-'));
  const sourceDb = new Database(path.join(workDir, 'source.db'));
  const adapter = new SQLiteLogAdapter(
    sourceDb, {address: PARTITION_ID, term: TERM});
  const storage = new PartitionRaftStorage(sourceDb, PARTITION_ID, adapter);
  sourceDb.exec(`CREATE TABLE IF NOT EXISTS ${STATE_TABLE} ` +
    '(id TEXT PRIMARY KEY, payload TEXT)');
  let lastEntry = null;
  for (let ordinal = 1; ordinal <= ENTRY_COUNT; ordinal += 1) {
    lastEntry = adapter.saveCommand(
      {sql: `row-${ordinal}`, timestamp: SEALED_HLC}, TERM);
    adapter.commit(lastEntry.index);
    sourceDb.prepare(
      `INSERT INTO ${STATE_TABLE} (id, payload) VALUES (?, ?)`,
    ).run(`row-${ordinal}`, `payload-${ordinal}`);
    storage.recordAppliedAdvance();
  }
  const checkpointsRoot = path.join(workDir, 'checkpoints');
  const created = await createSqliteStateMachineCheckpoint({
    db: sourceDb,
    identity: IDENTITY,
    checkpointsRoot,
  });
  sourceDb.close();
  const targetDbPath = path.join(workDir, 'target.db');
  const installed = await requestSnapshotInstall({
    replicaDbPath: targetDbPath,
    checkpointsRoot,
    generationIndex: lastEntry.index,
    expectedIdentity: IDENTITY,
  });
  const targetDb = new Database(targetDbPath);
  const targetAdapter = new SQLiteLogAdapter(
    targetDb, {address: PARTITION_ID, term: TERM});
  return {
    workDir,
    created,
    installed,
    boundaryIndex: lastEntry.index,
    checkpointsRoot,
    targetDb,
    targetDbPath,
    targetAdapter,
    close() {
      targetDb.close();
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

test('the installed boundary is observable through the adapter', async (t) => {
  const fixture = await createInstalledFixture();
  try {
    t.equal(fixture.installed.outcome,
      RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED, 'precondition: installed');
    const adapter = fixture.targetAdapter;
    t.same(
      {...adapter.getLastInfo()},
      {
        index: fixture.boundaryIndex,
        term: TERM,
        committedIndex: fixture.boundaryIndex,
      },
      'getLastInfo answers the boundary identity on a compacted-empty log');
    t.same(
      {index: adapter.getLastEntry().index, term: adapter.getLastEntry().term},
      {index: fixture.boundaryIndex, term: TERM},
      'getLastEntry answers the boundary identity');
    t.equal(adapter.has(fixture.boundaryIndex), true,
      'a compacted index is known-present lineage');
    t.equal(adapter.has(0), false, 'has(0) stays false (CL-042 discipline)');
    t.equal(adapter.has(fixture.boundaryIndex + 1), false,
      'an index above the boundary with no row is genuinely absent');
    t.same(
      adapter.getEntryInfoBefore({index: fixture.boundaryIndex + 1}),
      {
        index: fixture.boundaryIndex,
        term: TERM,
        committedIndex: fixture.boundaryIndex,
      },
      'getEntryInfoBefore floors at the boundary instead of degrading to ' +
      '{0,0} (which would silently disable the prev-log check)');
  } finally {
    fixture.close();
  }
});

test('a virgin log keeps the CL-042 zero everywhere', async (t) => {
  const db = new Database(':memory:');
  try {
    const adapter = new SQLiteLogAdapter(db, {address: 'virgin', term: 9});
    t.same({...adapter.getLastInfo()}, {index: 0, term: 0, committedIndex: 0},
      'virgin getLastInfo stays {0,0} — the CL-042 zero is load-bearing');
    t.equal(adapter.has(1), false, 'virgin has(1) is false');
  } finally {
    db.close();
  }
});

test('truncation at or below the boundary is witness-silent and lossless',
  async (t) => {
    const fixture = await createInstalledFixture();
    try {
      const adapter = fixture.targetAdapter;
      // Append + commit one live entry above the boundary, then attack.
      const liveEntry = adapter.saveCommand({sql: 'live-row'}, TERM);
      adapter.commit(liveEntry.index);
      adapter.removeFrom(1);
      t.equal(adapter.committedTruncationBlockedCount, 0,
        'a truncation aimed below the boundary does not trip the ' +
        'committed-truncation raft-safety witness');
      t.equal(adapter.has(liveEntry.index), true,
        'the committed live entry above the boundary survives');
      adapter.removeEntriesAfter(fixture.boundaryIndex);
      t.equal(adapter.has(liveEntry.index), true,
        'removeEntriesAfter at the boundary cannot reach committed entries');
    } finally {
      fixture.close();
    }
  });

test('writes at compacted indexes are the typed COMPACTED idempotent no-op',
  async (t) => {
    const fixture = await createInstalledFixture();
    try {
      const adapter = fixture.targetAdapter;
      const replayed = adapter.put({
        index: 1,
        term: TERM,
        command: {sql: 'row-1'},
      });
      t.ok(replayed, 'a replayed write at a compacted index does not throw');
      t.equal(
        fixture.targetDb.prepare(
          'SELECT COUNT(*) AS n FROM _raft_log WHERE log_index = 1').get().n,
        0,
        'the compacted no-op writes nothing');
      const guard = guardCommittedEntryWrite(
        null, {index: 1, term: TERM, command: {}}, fixture.boundaryIndex,
        fixture.boundaryIndex);
      t.equal(guard.outcome, COMMITTED_ENTRY_WRITE_OUTCOME.COMPACTED,
        'the guard names the typed COMPACTED outcome');
      t.throws(
        () => guardCommittedEntryWrite(
          null, {index: 1, term: TERM, command: {}}, fixture.boundaryIndex, 0),
        'a missing committed entry with NO boundary stays a conflict — real ' +
        'committed-history loss is still refused');
    } finally {
      fixture.close();
    }
  });

test('an installed replica can re-checkpoint at its own boundary', async (t) => {
  const fixture = await createInstalledFixture();
  try {
    const recheck = await createSqliteStateMachineCheckpoint({
      db: fixture.targetDb,
      identity: IDENTITY,
      checkpointsRoot: path.join(fixture.workDir, 'recheckpoints'),
    });
    t.equal(recheck.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
      'readLastIncludedTerm falls back to the boundary keys');
    t.equal(recheck.descriptor.lastIncludedIndex, fixture.boundaryIndex,
      'the re-checkpoint seals the same boundary');
    t.equal(recheck.descriptor.lastIncludedTerm, TERM,
      'the boundary term is sealed from the boundary keys');
    t.equal(recheck.descriptor.maxCommittedHlc, SEALED_HLC,
      'the sealed max HLC survives via the installed key (no regression)');
  } finally {
    fixture.close();
  }
});

test('HLC warm-up reads the sealed witness on a compacted-empty log',
  async (t) => {
    const fixture = await createInstalledFixture();
    try {
      let warmed = null;
      warmHlcFromDurableWitnesses({
        logAdapter: fixture.targetAdapter,
        hlcClock: {
          update: (hlc) => {
            warmed = hlc;
          },
        },
      });
      t.ok(warmed, 'the clock is warmed despite the empty log');
      t.equal(warmed.toString(), SEALED_HLC,
        'the warm value is the sealed maxCommittedHlc witness');
    } finally {
      fixture.close();
    }
  });

test('creation refuses prepared-but-undecided transactions at the boundary',
  async (t) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-prepared-'));
    try {
      const db = new Database(path.join(workDir, 'source.db'));
      const adapter = new SQLiteLogAdapter(
        db, {address: PARTITION_ID, term: TERM});
      const storage = new PartitionRaftStorage(db, PARTITION_ID, adapter);
      db.exec(`CREATE TABLE IF NOT EXISTS ${STATE_TABLE} ` +
        '(id TEXT PRIMARY KEY, payload TEXT)');
      const prepare = adapter.saveCommand({
        type: 'PREPARE_TRANSACTION',
        sessionId: 'session-open',
        writeSet: [],
      }, TERM);
      adapter.commit(prepare.index);
      storage.recordAppliedAdvance();
      const refused = await createSqliteStateMachineCheckpoint({
        db,
        identity: IDENTITY,
        checkpointsRoot: path.join(workDir, 'checkpoints'),
      });
      t.equal(refused.outcome,
        RAFT_CHECKPOINT_CREATION_OUTCOME.PREPARED_TRANSACTIONS_PENDING,
        'a prepared-undecided session below the boundary refuses creation');
      const commit = adapter.saveCommand({
        type: 'TRANSACTION_COMMIT',
        sessionId: 'session-open',
      }, TERM);
      adapter.commit(commit.index);
      storage.recordAppliedAdvance();
      const created = await createSqliteStateMachineCheckpoint({
        db,
        identity: IDENTITY,
        checkpointsRoot: path.join(workDir, 'checkpoints'),
      });
      t.equal(created.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
        'a terminal outcome below the boundary releases the refusal');
      db.close();
    } finally {
      fs.rmSync(workDir, {recursive: true, force: true});
    }
  });
