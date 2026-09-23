/**
 * Partition HLC cross-leader / cross-restart monotonicity.
 *
 * Quest: hlc-cross-leader-monotonicity.
 *  - Fix 1 (merge-on-apply): applyCommittedEntry advances the applying replica's
 *    HLC to >= the committed entry's HLC, so a new leader's next write exceeds the
 *    last entry it applied (cross-leader monotonicity).
 *  - Fix 2 (restart high-water-mark): on init the clock is warmed from the max
 *    committed HLC in the rs-raft durable store (the only durable log), so a
 *    restarted node never emits an HLC below one it previously committed.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {
  restartOverCommittedCommands,
} from './partition-rs-raft-restart-fixture.js';
import {warmHlcFromDurableWitnesses} from
  '../../src/partition/partition-hlc-warmup.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {RAFT_RS_PROPOSAL_CODEC_ERROR} from
  '../../src/raft/raft-rs-proposal-codec-constants.js';
import {RAFT_RS_ENTRY_TYPE} from
  '../../src/raft/raft-rs-ready-loop-constants.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';

const SCHEMA = {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]};

function buildPartition(overrides = {}) {
  return new PartitionService({
    partitionId: 'hlc-mono-partition',
    tableId: 't',
    tableName: 't',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema: SCHEMA,
    deferElection: true,
    dbPath: ':memory:',
    ...overrides,
  });
}

test('Fix 1: applyCommittedEntry witnesses a remote HLC so the next local ' +
  'timestamp exceeds it (cross-leader monotonicity)', async (t) => {
  const partition = buildPartition();
  await partition.initialize();

  // A remote leader's write stamped with an HLC far ahead of this node's wall
  // clock — the exact skew case that previously let a new leader regress.
  const remote = `${Date.now() + 1_000_000}-7-remote-node`;
  const remoteTs = HLCTimestamp.fromString(remote);

  // Committed through the partition's own port: a lone rs-raft leader
  // commits and applies its proposal before propose() returns.
  const proposed = await partition.raft.propose({
    entryId: 'e-remote',
    type: 'INSERT',
    sql: 'INSERT INTO t (id) VALUES (?)',
    params: ['a'],
    timestamp: remote,
  });
  t.equal(proposed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    'the remote write commits and applies');

  const next = partition.hlcClock.now();
  t.ok(next.compare(remoteTs) > 0,
    'local now() after witnessing must be strictly greater than the remote HLC');

  await partition.shutdown();
});

test('Fix 1: a missing/unparseable timestamp is skipped, never fatal',
  async (t) => {
    const partition = buildPartition();
    await partition.initialize();

    const before = partition.hlcClock.current();
    const proposed = await partition.raft.propose({
      entryId: 'e-no-ts',
      type: 'INSERT',
      sql: 'INSERT INTO t (id) VALUES (?)',
      params: ['b'],
      // no timestamp field
    });
    t.equal(proposed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      'applying an entry without an HLC must not fail its application');
    t.equal(partition.db.prepare('SELECT COUNT(*) AS count FROM t').get()
      .count, 1, 'the entry without an HLC is applied');

    const after = partition.hlcClock.now();
    t.ok(after.compare(before) >= 0, 'clock must not regress');

    await partition.shutdown();
  });

// The committed command reaches the rs-raft durable store through the
// partition's own operation port (see the fixture); the legacy log is never
// written, so a warm-up that still reads it finds no witness.
test('Fix 2: restart warms the HLC from the max committed rs-raft command',
  async (t) => {
    const highHlc = `${Date.now() + 1_000_000}-3-remote-node`;
    const {restarted, committed, dispose} = await restartOverCommittedCommands(
      {
        partitionId: 'hlc-mono-partition',
        tableId: 't',
        tableName: 't',
        schema: SCHEMA,
      },
      [{
        entryId: 'e-committed',
        type: PARTITION_SERVICE_OPERATION.INSERT,
        sql: 'INSERT INTO t (id) VALUES (?)',
        params: ['x'],
        timestamp: highHlc,
      }],
    );
    try {
      // Restart on the same durable DB: a fresh HLC clock seeded from wall
      // time would be ~16 minutes behind the committed HLC; the warm-up must
      // lift it above what the rs-raft store holds.
      const committedHlc = HLCTimestamp.fromString(
        committed[committed.length - 1].command.timestamp);
      const next = restarted.hlcClock.now();
      t.ok(next.compare(committedHlc) > 0,
        'restarted now() must exceed the max committed HLC in the rs-raft ' +
        `store (now ${next.toString()}, committed ${committedHlc.toString()})`);
    } finally {
      await dispose();
    }
  });

// A durable log whose applied prefix holds bytes that are not a proposal, as
// a corrupted entry would: written through the store's own write API.
function writeUndecodableAppliedEntry(db, groupId) {
  const store = new RaftRsDurableStore(db);
  store.appendEntries(groupId, [{
    index: '1',
    term: '1',
    entryType: RAFT_RS_ENTRY_TYPE.NORMAL,
    data: Buffer.from('not a proposal').toString('base64'),
  }]);
  store.putHardState(groupId, {term: '1', vote: '0', commit: '1'});
  store.putAppliedState(groupId, '1', {});
}

const SCHEMA_TABLES_SQL =
  'SELECT name FROM sqlite_master WHERE type = \'table\' ORDER BY name';

test('Fix 2: warm-up is a no-op without an rs-raft record and fails closed ' +
  'on an undecodable applied command', async (t) => {
  const db = new Database(':memory:');
  try {
    const updates = [];
    const hlcClock = {update: (hlc) => updates.push(hlc)};
    const service = {db, partitionId: 'hlc-mono-partition'};
    warmHlcFromDurableWitnesses({service, hlcClock});
    t.strictSame({updates, tables: db.prepare(SCHEMA_TABLES_SQL).all()},
      {updates: [], tables: []},
      'no record: nothing to warm from, and the warm-up created no table');

    writeUndecodableAppliedEntry(db, service.partitionId);
    t.throws(() => warmHlcFromDurableWitnesses({service, hlcClock}),
      {code: RAFT_RS_PROPOSAL_CODEC_ERROR.UNDECODABLE},
      'an undecodable applied command propagates the typed codec error');
  } finally {
    db.close();
  }
});

test('Fix 2: an undecodable applied command fails partition init closed',
  async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hlc-mono-'));
    const dbPath = path.join(dir, 'replica-1.db');
    let partition = null;
    try {
      const seeded = new Database(dbPath);
      writeUndecodableAppliedEntry(seeded, 'hlc-mono-partition');
      seeded.close();
      partition = buildPartition({dbPath});
      await t.rejects(partition.initialize(),
        {code: RAFT_RS_PROPOSAL_CODEC_ERROR.UNDECODABLE},
        'init rejects with the typed codec error instead of warning and ' +
        'serving with an unwarmed clock');
    } finally {
      try {
        partition?.db?.close();
      } catch {
        // The assertion under test already recorded what mattered.
      }
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
