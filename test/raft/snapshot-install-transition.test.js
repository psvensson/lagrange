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
  resolveDurableElectionRule,
} from '../../src/raft/snapshot-install.js';
import {
  RAFT_SNAPSHOT_BOUNDARY_STATE_KEY,
  RAFT_SNAPSHOT_INSTALL_OUTCOME,
  RAFT_SNAPSHOT_INSTALL_REJECTION,
} from '../../src/raft/snapshot-install-constants.js';
import {
  RAFT_CHECKPOINT_APPLIED_STATE_KEY,
} from '../../src/raft/snapshot-checkpoint-constants.js';

// raft-snapshot-atomic-install (R3) transition attacks: a full install round
// trip, the durable term/votedFor rule (higher local term preserved; prior
// vote retained iff term unchanged; sender rows never imported), foreign
// identity and stale epoch rejected at install, worker-path typed refusal,
// and no commit watermark observable ahead of installed state.

const PARTITION_ID = 'sql_transactions-p1';
const STATE_TABLE = 'sql_transactions';
const SOURCE_TERM = 4;
const SEALED_EPOCH = 7;
const ENTRY_COUNT = 3;
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-1234',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: SEALED_EPOCH,
});

// Build a SOURCE replica with committed+applied entries, checkpoint it, and
// return the sealed generation plus a pristine TARGET replica db path.
async function createInstallFixture() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-install-'));
  const sourceDb = new Database(path.join(workDir, 'source.db'));
  const adapter = new SQLiteLogAdapter(
    sourceDb, {address: PARTITION_ID, term: SOURCE_TERM});
  const storage = new PartitionRaftStorage(sourceDb, PARTITION_ID, adapter);
  sourceDb.exec(`CREATE TABLE IF NOT EXISTS ${STATE_TABLE} ` +
    '(id TEXT PRIMARY KEY, payload TEXT)');
  let lastEntry = null;
  for (let ordinal = 1; ordinal <= ENTRY_COUNT; ordinal += 1) {
    lastEntry = adapter.saveCommand({sql: `row-${ordinal}`}, SOURCE_TERM);
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
  return {
    workDir,
    checkpointsRoot,
    created,
    lastIndex: lastEntry.index,
    targetDbPath: path.join(workDir, 'target.db'),
    close() {
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

function readTargetState(dbPath, key) {
  const db = new Database(dbPath, {readonly: true});
  try {
    const row = db.prepare(
      'SELECT value FROM _raft_state WHERE key = ?').get(key);
    return row ? row.value : null;
  } finally {
    db.close();
  }
}

function seedTargetElectionState(dbPath, currentTerm, votedFor) {
  const db = new Database(dbPath);
  try {
    db.exec('CREATE TABLE IF NOT EXISTS _raft_state ' +
      '(key TEXT PRIMARY KEY, value TEXT)');
    const upsert = db.prepare(
      'INSERT OR REPLACE INTO _raft_state (key, value) VALUES (?, ?)');
    upsert.run(SQLITE_RAFT_STATE_KEY.CURRENT_TERM, String(currentTerm));
    if (votedFor) {
      upsert.run(SQLITE_RAFT_STATE_KEY.VOTED_FOR, votedFor);
    }
  } finally {
    db.close();
  }
}

test('a fresh install reconstructs every follower-local row at the boundary',
  async (t) => {
    const fixture = await createInstallFixture();
    try {
      const installed = await requestSnapshotInstall({
        replicaDbPath: fixture.targetDbPath,
        checkpointsRoot: fixture.checkpointsRoot,
        generationIndex: fixture.lastIndex,
        expectedIdentity: IDENTITY,
      });
      t.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
        'install completes');
      const db = new Database(fixture.targetDbPath, {readonly: true});
      try {
        const boundaryIndex = Number(readTargetState(
          fixture.targetDbPath,
          RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.LAST_INCLUDED_INDEX));
        t.equal(boundaryIndex, fixture.lastIndex,
          'boundary index equals the sealed generation');
        t.equal(
          Number(readTargetState(fixture.targetDbPath,
            SQLITE_RAFT_STATE_KEY.COMMITTED_INDEX)),
          fixture.lastIndex,
          'committedIndex reconstructs at the boundary');
        t.equal(
          Number(readTargetState(fixture.targetDbPath,
            RAFT_CHECKPOINT_APPLIED_STATE_KEY.LAST_APPLIED_INDEX)),
          fixture.lastIndex,
          'lastAppliedIndex aligns with committedIndex (no gap marker trap)');
        t.equal(
          readTargetState(fixture.targetDbPath,
            RAFT_CHECKPOINT_APPLIED_STATE_KEY.APPLIED_GAP_MARKER),
          null,
          'no applied gap marker is written by install');
        t.equal(
          db.prepare(`SELECT COUNT(*) AS n FROM ${STATE_TABLE}`).get().n,
          ENTRY_COUNT,
          'state-machine rows arrive intact');
        t.equal(
          db.prepare('SELECT COUNT(*) AS n FROM _raft_log').get().n, 0,
          'the raft log is compacted-empty — sender log rows never imported');
      } finally {
        db.close();
      }
    } finally {
      fixture.close();
    }
  });

test('the durable term/votedFor rule holds under attack', async (t) => {
  await t.test('higher local term and its vote are preserved', async (t) => {
    const fixture = await createInstallFixture();
    try {
      const higherTerm = SOURCE_TERM + 5;
      seedTargetElectionState(fixture.targetDbPath, higherTerm, 'node-x');
      const installed = await requestSnapshotInstall({
        replicaDbPath: fixture.targetDbPath,
        checkpointsRoot: fixture.checkpointsRoot,
        generationIndex: fixture.lastIndex,
        expectedIdentity: IDENTITY,
      });
      t.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
        'install completes over a higher-term local db');
      t.equal(
        Number(readTargetState(fixture.targetDbPath,
          SQLITE_RAFT_STATE_KEY.CURRENT_TERM)),
        higherTerm,
        'a higher local durable term is preserved, never regressed');
      t.equal(
        readTargetState(fixture.targetDbPath,
          SQLITE_RAFT_STATE_KEY.VOTED_FOR),
        'node-x',
        'the prior vote is retained because the term was unchanged');
    } finally {
      fixture.close();
    }
  });

  await t.test('a raised term clears the prior vote', async (t) => {
    const fixture = await createInstallFixture();
    try {
      seedTargetElectionState(fixture.targetDbPath, 1, 'node-y');
      const installed = await requestSnapshotInstall({
        replicaDbPath: fixture.targetDbPath,
        checkpointsRoot: fixture.checkpointsRoot,
        generationIndex: fixture.lastIndex,
        expectedIdentity: IDENTITY,
      });
      t.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
        'install completes over a lower-term local db');
      t.equal(
        Number(readTargetState(fixture.targetDbPath,
          SQLITE_RAFT_STATE_KEY.CURRENT_TERM)),
        SOURCE_TERM,
        'the durable term rises to the snapshot included term');
      t.equal(
        readTargetState(fixture.targetDbPath,
          SQLITE_RAFT_STATE_KEY.VOTED_FOR),
        null,
        'a raised term has no vote yet — votedFor is cleared');
    } finally {
      fixture.close();
    }
  });

  await t.test('the pure rule function matches the durable behavior',
    async (t) => {
      t.same(
        resolveDurableElectionRule(
          {currentTerm: 9, votedFor: 'node-z'}, 4),
        {currentTerm: 9, votedFor: 'node-z'},
        'higher local term retains term and vote');
      t.same(
        resolveDurableElectionRule({currentTerm: 2, votedFor: 'node-z'}, 4),
        {currentTerm: 4, votedFor: null},
        'raised term clears the vote');
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
      const fixture = await createInstallFixture();
      try {
        const refused = await requestSnapshotInstall({
          replicaDbPath: fixture.targetDbPath,
          checkpointsRoot: fixture.checkpointsRoot,
          generationIndex: fixture.lastIndex,
          expectedIdentity: identity,
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

test('worker-path (memory-backed) install requests are a typed refusal',
  async (t) => {
    const fixture = await createInstallFixture();
    try {
      const refused = await requestSnapshotInstall({
        replicaDbPath: ':memory:',
        checkpointsRoot: fixture.checkpointsRoot,
        generationIndex: fixture.lastIndex,
        expectedIdentity: IDENTITY,
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
