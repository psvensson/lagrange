import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';

import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';
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
import {
  RAFT_SNAPSHOT_BOUNDARY_STATE_KEY,
  RAFT_SNAPSHOT_INSTALL_OUTCOME,
} from '../../src/raft/snapshot-install-constants.js';
import {
  createSealedSourceGeneration,
  installSealedGeneration,
} from './snapshot-catchup-fixture.js';

// raft-snapshot-atomic-install (R3): boundary observability on SQLiteLogAdapter
// and re-checkpointability of a canonical raft-rs snapshot-installed replica
// at its own installed boundary without HLC regression.

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

function createCompactedAdapterFixture() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-boundary-'));
  const targetDbPath = path.join(workDir, 'target.db');
  const targetDb = new Database(targetDbPath);
  const targetAdapter = new SQLiteLogAdapter(
    targetDb, {address: PARTITION_ID, term: TERM});
  const upsert = targetDb.prepare(
    'INSERT OR REPLACE INTO _raft_state (key, value) VALUES (?, ?)');
  upsert.run(
    RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.LAST_INCLUDED_INDEX,
    String(ENTRY_COUNT),
  );
  upsert.run(
    RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.LAST_INCLUDED_TERM,
    String(TERM),
  );
  upsert.run('committedIndex', String(ENTRY_COUNT));
  return {
    workDir,
    boundaryIndex: ENTRY_COUNT,
    targetDb,
    targetDbPath,
    targetAdapter,
    close() {
      targetDb.close();
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

test('the compacted boundary is observable through the adapter', async (t) => {
  const fixture = createCompactedAdapterFixture();
  try {
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
    const fixture = createCompactedAdapterFixture();
    try {
      const adapter = fixture.targetAdapter;
      const liveEntry = adapter.saveCommand({sql: 'live-row'}, TERM);
      adapter.commit(liveEntry.index);
      adapter.removeFrom(1);
      t.equal(adapter.committedTruncationBlockedCount, 0,
        'a truncation aimed below the boundary does not trip the ' +
        'committed-truncation raft-safety witness');
      t.equal(adapter.has(liveEntry.index), true,
        'the committed live entry above the boundary survives');
      adapter.removeFrom(fixture.boundaryIndex);
      t.equal(adapter.has(liveEntry.index), true,
        'removeFrom at the boundary cannot reach committed entries');
    } finally {
      fixture.close();
    }
  });

test('writes at compacted indexes are the typed COMPACTED idempotent no-op',
  async (t) => {
    const fixture = createCompactedAdapterFixture();
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

test('an installed raft-rs replica can re-checkpoint at its own boundary',
  async (t) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-recheck-'));
    let targetDb = null;
    try {
      const checkpointsRoot = path.join(workDir, 'checkpoints');
      const generation = await createSealedSourceGeneration({
        workDir,
        checkpointsRoot,
        partitionId: PARTITION_ID,
        stateTable: STATE_TABLE,
        term: TERM,
        identity: IDENTITY,
        entryCount: ENTRY_COUNT,
        entryTimestamp: SEALED_HLC,
      });
      const targetDbPath = path.join(workDir, 'target.db');
      const installed = await installSealedGeneration({
        replicaDbPath: targetDbPath,
        checkpointsRoot,
        generationIndex: generation.boundaryIndex,
        identity: IDENTITY,
      });
      t.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
        'precondition: raft-rs follower catchup installed');
      targetDb = new Database(targetDbPath);
      const recheck = await createSqliteStateMachineCheckpoint({
        db: targetDb,
        identity: IDENTITY,
        checkpointsRoot: path.join(workDir, 'recheckpoints'),
        raftRsGroupId: PARTITION_ID,
      });
      t.equal(recheck.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
        're-checkpointing at the installed raft-rs boundary succeeds');
      t.equal(recheck.descriptor.lastIncludedIndex, generation.boundaryIndex,
        'the re-checkpoint seals the same boundary');
      t.equal(recheck.descriptor.lastIncludedTerm, TERM,
        'the boundary term is sealed from the installed snapshot metadata');
      t.equal(recheck.descriptor.maxCommittedHlc, SEALED_HLC,
        'the sealed max HLC survives via the installed snapshot witness');
    } finally {
      if (targetDb) targetDb.close();
      fs.rmSync(workDir, {recursive: true, force: true});
    }
  });
