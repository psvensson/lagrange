import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';

import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';
import {PartitionRaftStorage} from '../../src/partition/partition-raft-storage.js';
import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
  RAFT_CHECKPOINT_EXCLUDED_TABLES,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_CHECKPOINT_PAYLOAD_KIND,
} from '../../src/raft/snapshot-checkpoint-constants.js';
import {
  createSqliteStateMachineCheckpoint,
  listCheckpointGenerations,
} from '../../src/raft/snapshot-checkpoint-store.js';

// raft-snapshot-checkpoint-format S1 (R1) SQLite evidence bar: SEED the
// follower-local consensus tables and state-machine tables FIRST
// (anti-vacuous-assertion), create a checkpoint from a real file-backed DB
// through the REAL adapter commit path, then inspect the sealed payload and
// prove _raft_log/_raft_state are absent while _transaction_outcomes and
// state-machine rows survive with the exact committed image.

const PARTITION_ID = 'sql_transactions-p1';
const STATE_TABLE = 'sql_transactions';
const ENTRY_COUNT = 3;
const SEALED_EPOCH = 5;
const TERM = 2;
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-1234',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: SEALED_EPOCH,
});
const SELECT_TABLE_NAMES =
  'SELECT name FROM sqlite_master WHERE type = \'table\' ORDER BY name';
const OUTCOME_ROW = Object.freeze({
  sessionId: 'session-a',
  epoch: 1,
  outcome: 'committed',
});

function createFixture() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-checkpoint-'));
  const dbPath = path.join(workDir, 'replica.db');
  const db = new Database(dbPath);
  const adapter = new SQLiteLogAdapter(db, {address: PARTITION_ID, term: TERM});
  const storage = new PartitionRaftStorage(db, PARTITION_ID, adapter);
  db.exec(`CREATE TABLE IF NOT EXISTS ${STATE_TABLE} ` +
    '(id TEXT PRIMARY KEY, payload TEXT)');
  return {
    workDir,
    db,
    adapter,
    storage,
    checkpointsRoot: path.join(workDir, 'checkpoints'),
    close() {
      db.close();
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

// Drive the REAL commit + applied-watermark sequence for one entry: adapter
// commit advances the durable committed watermark, the state-machine row is
// applied, and the applied watermark advances densely by one — the
// production ordering from partition-service-raft-lifecycle-wiring.js.
function commitAndApplyEntry(fixture, ordinal) {
  const entry = fixture.adapter.saveCommand(
    {sql: `row-${ordinal}`}, TERM);
  fixture.adapter.commit(entry.index);
  fixture.db.prepare(
    `INSERT INTO ${STATE_TABLE} (id, payload) VALUES (?, ?)`,
  ).run(`row-${ordinal}`, `payload-${ordinal}`);
  fixture.storage.recordAppliedAdvance();
  return entry;
}

function seedCommittedFixture(fixture) {
  let lastEntry = null;
  for (let ordinal = 1; ordinal <= ENTRY_COUNT; ordinal += 1) {
    lastEntry = commitAndApplyEntry(fixture, ordinal);
  }
  fixture.db.prepare(
    'INSERT INTO _transaction_outcomes ' +
    '(session_id, transaction_epoch, outcome, updated_at) ' +
    'VALUES (?, ?, ?, ?)',
  ).run(OUTCOME_ROW.sessionId, OUTCOME_ROW.epoch, OUTCOME_ROW.outcome, 1);
  return lastEntry;
}

function tableNames(db) {
  return db.prepare(SELECT_TABLE_NAMES).all().map((row) => row.name);
}

test('a sealed payload excludes consensus tables and keeps the committed image',
  async (t) => {
    const fixture = createFixture();
    try {
      const lastEntry = seedCommittedFixture(fixture);
      const sourceTables = tableNames(fixture.db);
      for (const excluded of RAFT_CHECKPOINT_EXCLUDED_TABLES) {
        t.ok(sourceTables.includes(excluded),
          `anti-vacuous: source database really contains ${excluded}`);
      }
      t.ok(sourceTables.includes('_transaction_outcomes'),
        'anti-vacuous: source database really contains _transaction_outcomes');

      const created = await createSqliteStateMachineCheckpoint({
        db: fixture.db,
        identity: IDENTITY,
        checkpointsRoot: fixture.checkpointsRoot,
      });
      t.equal(created.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
        'creation succeeds on an aligned file-backed replica');
      t.equal(created.descriptor.lastIncludedIndex, lastEntry.index,
        'lastIncludedIndex equals the sealed image\'s own committed watermark');
      t.equal(created.descriptor.lastIncludedTerm, TERM,
        'lastIncludedTerm is read from the sealed image\'s own log');
      t.equal(created.descriptor.payloadKind,
        RAFT_CHECKPOINT_PAYLOAD_KIND.SQLITE_STATE_MACHINE_IMAGE,
        'the payload kind comes from the compatibility matrix');

      const payload = new Database(
        path.join(created.checkpointDir, RAFT_CHECKPOINT_PAYLOAD_FILE),
        {readonly: true},
      );
      try {
        const payloadTables = tableNames(payload);
        for (const excluded of RAFT_CHECKPOINT_EXCLUDED_TABLES) {
          t.notOk(payloadTables.includes(excluded),
            `sealed payload proves ${excluded} is absent`);
        }
        t.same(
          payload.prepare(
            'SELECT session_id, transaction_epoch, outcome ' +
            'FROM _transaction_outcomes',
          ).all(),
          [{
            session_id: OUTCOME_ROW.sessionId,
            transaction_epoch: OUTCOME_ROW.epoch,
            outcome: OUTCOME_ROW.outcome,
          }],
          '_transaction_outcomes (applied state-machine state) survives');
        t.equal(
          payload.prepare(
            `SELECT COUNT(*) AS rows FROM ${STATE_TABLE}`).get().rows,
          ENTRY_COUNT,
          'state-machine rows equal the committed image');
      } finally {
        payload.close();
      }
      t.same(listCheckpointGenerations(fixture.checkpointsRoot),
        [lastEntry.index],
        'the generation is listed under its lastIncludedIndex');
    } finally {
      fixture.close();
    }
  });

test('creation fails closed on every applied-watermark divergence', async (t) => {
  await t.test('absent applied watermark', async (t) => {
    const fixture = createFixture();
    try {
      const entry = fixture.adapter.saveCommand({sql: 'row'}, TERM);
      fixture.adapter.commit(entry.index);
      const created = await createSqliteStateMachineCheckpoint({
        db: fixture.db,
        identity: IDENTITY,
        checkpointsRoot: fixture.checkpointsRoot,
      });
      t.equal(created.outcome,
        RAFT_CHECKPOINT_CREATION_OUTCOME.APPLY_WATERMARK_DIVERGENCE,
        'a committed image without an applied watermark is refused');
      t.ok(created.reasons.includes('applied_watermark_absent'),
        'the divergence reason is named');
    } finally {
      fixture.close();
    }
  });

  await t.test('applied behind committed (apply-throw skew)', async (t) => {
    const fixture = createFixture();
    try {
      commitAndApplyEntry(fixture, 1);
      const behind = fixture.adapter.saveCommand({sql: 'row-behind'}, TERM);
      fixture.adapter.commit(behind.index);
      const created = await createSqliteStateMachineCheckpoint({
        db: fixture.db,
        identity: IDENTITY,
        checkpointsRoot: fixture.checkpointsRoot,
      });
      t.equal(created.outcome,
        RAFT_CHECKPOINT_CREATION_OUTCOME.APPLY_WATERMARK_DIVERGENCE,
        'a watermark ahead of applied state is refused');
      t.ok(created.reasons.includes('applied_committed_mismatch'),
        'the divergence reason is named');
    } finally {
      fixture.close();
    }
  });

  await t.test('multi-entry commit batch with a lost tail apply (MF-1)',
    async (t) => {
      // The adapter's committed watermark reaches the BATCH END before the
      // first apply runs (liferaft commitEntries), so a checkpoint gate that
      // copied committedIndex would seal a payload missing the batch tail.
      // The dense advance keeps the applied watermark at the truth.
      const fixture = createFixture();
      try {
        const first = fixture.adapter.saveCommand({sql: 'row-first'}, TERM);
        const second = fixture.adapter.saveCommand({sql: 'row-second'}, TERM);
        fixture.adapter.commit(first.index);
        fixture.adapter.commit(second.index);
        fixture.db.prepare(
          `INSERT INTO ${STATE_TABLE} (id, payload) VALUES (?, ?)`,
        ).run('row-first', 'payload-first');
        fixture.storage.recordAppliedAdvance();
        const created = await createSqliteStateMachineCheckpoint({
          db: fixture.db,
          identity: IDENTITY,
          checkpointsRoot: fixture.checkpointsRoot,
        });
        t.equal(created.outcome,
          RAFT_CHECKPOINT_CREATION_OUTCOME.APPLY_WATERMARK_DIVERGENCE,
          'a batch whose tail apply is missing can never seal a checkpoint');
        t.ok(created.reasons.includes('applied_committed_mismatch'),
          'the divergence reason is named');
      } finally {
        fixture.close();
      }
    });

  await t.test('crash gap detected at restart is a sticky refusal', async (t) => {
    const fixture = createFixture();
    try {
      const first = fixture.adapter.saveCommand({sql: 'row-first'}, TERM);
      const second = fixture.adapter.saveCommand({sql: 'row-second'}, TERM);
      fixture.adapter.commit(first.index);
      fixture.db.prepare(
        `INSERT INTO ${STATE_TABLE} (id, payload) VALUES (?, ?)`,
      ).run('row-first', 'payload-first');
      fixture.storage.recordAppliedAdvance();
      fixture.adapter.commit(second.index);
      // Simulated crash: committed reached the batch end, the tail apply
      // never ran. Restart constructs a fresh storage over the same db.
      const restarted = new PartitionRaftStorage(
        fixture.db, PARTITION_ID, fixture.adapter);
      t.ok(restarted instanceof PartitionRaftStorage, 'storage restarted');
      const created = await createSqliteStateMachineCheckpoint({
        db: fixture.db,
        identity: IDENTITY,
        checkpointsRoot: fixture.checkpointsRoot,
      });
      t.equal(created.outcome,
        RAFT_CHECKPOINT_CREATION_OUTCOME.APPLY_WATERMARK_DIVERGENCE,
        'a restart over a crash gap refuses checkpoint creation');
      t.ok(created.reasons.includes('applied_gap_marker'),
        'the sticky gap marker names the reason');
    } finally {
      fixture.close();
    }
  });

  await t.test('direct-apply marker (single-replica path)', async (t) => {
    const fixture = createFixture();
    try {
      commitAndApplyEntry(fixture, 1);
      fixture.storage.recordDirectApplyMarker();
      const created = await createSqliteStateMachineCheckpoint({
        db: fixture.db,
        identity: IDENTITY,
        checkpointsRoot: fixture.checkpointsRoot,
      });
      t.equal(created.outcome,
        RAFT_CHECKPOINT_CREATION_OUTCOME.APPLY_WATERMARK_DIVERGENCE,
        'a direct-apply-marked database can never certify its image');
      t.ok(created.reasons.includes('direct_apply_marker'),
        'the divergence reason is named');
    } finally {
      fixture.close();
    }
  });
});

test('memory-backed databases are typed unsupported adapters', async (t) => {
  const memoryDb = new Database(':memory:');
  try {
    const created = await createSqliteStateMachineCheckpoint({
      db: memoryDb,
      identity: IDENTITY,
      checkpointsRoot: path.join(os.tmpdir(), 'raft-checkpoint-memory'),
    });
    t.equal(created.outcome,
      RAFT_CHECKPOINT_CREATION_OUTCOME.UNSUPPORTED_ADAPTER,
      'SQLiteLogAdapter over :memory: (message-group worker path) is refused');
  } finally {
    memoryDb.close();
  }
  const missingDb = await createSqliteStateMachineCheckpoint({
    db: null,
    identity: IDENTITY,
    checkpointsRoot: path.join(os.tmpdir(), 'raft-checkpoint-none'),
  });
  t.equal(missingDb.outcome,
    RAFT_CHECKPOINT_CREATION_OUTCOME.UNSUPPORTED_ADAPTER,
    'an adapter with no database (in-memory log adapter) is refused');
});
