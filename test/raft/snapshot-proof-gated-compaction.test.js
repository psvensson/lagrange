import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';

import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {PartitionRaftStorage} from
  '../../src/partition/partition-raft-storage.js';
import {
  RAFT_COMPACTION_OUTCOME,
  unsupportedRaftCompactionResult,
} from '../../src/raft/compaction-policy.js';
import {readSnapshotBoundary} from '../../src/raft/snapshot-boundary.js';
import {
  RAFT_SNAPSHOT_BOUNDARY_STATE_KEY,
} from '../../src/raft/snapshot-install-constants.js';
import {
  createSqliteStateMachineCheckpoint,
} from '../../src/raft/snapshot-checkpoint-store.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';

// S5 proof-gated compaction decision table (quest
// raft-snapshot-retention-compaction): the proofless call returns the
// byte-identical frozen snapshot_protocol_unavailable refusal (asserted by
// IDENTITY and by deep equality against the two-field literal); every other
// row of the table is a typed refusal that removes nothing; and the single
// COMPACT path round-trips — prefix gone, suffix intact, boundary advanced
// from the pre-deletion term, watermarks untouched, maxCommittedHlc folded
// from the deleted rows, and the SAME facade answering correctly afterwards.
// Red direction: no combination of arguments lacking a valid proof removes
// any row (the CL-040-class loss is structurally unreachable).

const PARTITION_ID = 'compaction_rows-p1';
const STATE_TABLE = 'compaction_rows';
const TERM = 6;
const FOREIGN_TERM = TERM + 2;
const ENTRY_COUNT = 5;
const COMPACT_AT = 3;
const HLC_BASE_MS = 1700000000000;
const HLC_STEP_MS = 1000;
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-compaction',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: 2,
});
const UNSUPPORTED_LITERAL = Object.freeze({
  outcome: RAFT_COMPACTION_OUTCOME.SNAPSHOT_PROTOCOL_UNAVAILABLE,
  changed: false,
});
const INVALID_COMPACTION_INDEXES = Object.freeze([
  '1', null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, 0,
]);

// Row i carries a DESCENDING HLC (row 1 the largest) so the compaction fold
// is provably max-over-deleted-rows, not just the last row's clock.
function rowHlc(ordinal) {
  return new HLCTimestamp(
    HLC_BASE_MS - (ordinal * HLC_STEP_MS), ordinal, 'compaction-node');
}

function seedCommittedAppliedRows(context, options) {
  const {db, adapter, storage} = context;
  const {from, to, term} = options;
  for (let ordinal = from; ordinal <= to; ordinal += 1) {
    const entry = adapter.saveCommand({
      sql: `row-${ordinal}`,
      timestamp: rowHlc(ordinal).toString(),
    }, term);
    adapter.commit(entry.index);
    db.prepare(
      `INSERT INTO ${STATE_TABLE} (id, payload) VALUES (?, ?)`,
    ).run(`row-${ordinal}`, `payload-${ordinal}`);
    storage.recordAppliedAdvance();
  }
}

// File-backed replica with committed+applied rows and (optionally) a sealed
// proof generation created at `checkpointAt`, then grown to `entryCount`.
async function createCompactionFixture(options = {}) {
  const term = options.term ?? TERM;
  const entryCount = options.entryCount ?? ENTRY_COUNT;
  const checkpointAt = options.checkpointAt ?? null;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-compaction-'));
  const checkpointsRoot = path.join(workDir, 'checkpoints');
  const dbPath = path.join(workDir, 'replica.db');
  const db = new Database(dbPath);
  const adapter = new SQLiteLogAdapter(db, {address: PARTITION_ID, term});
  const storage = new PartitionRaftStorage(db, PARTITION_ID, adapter);
  db.exec(`CREATE TABLE IF NOT EXISTS ${STATE_TABLE} ` +
    '(id TEXT PRIMARY KEY, payload TEXT)');
  const context = {db, adapter, storage};
  let created = null;
  if (checkpointAt !== null) {
    seedCommittedAppliedRows(context, {from: 1, to: checkpointAt, term});
    created = await createSqliteStateMachineCheckpoint(
      {db, identity: IDENTITY, checkpointsRoot});
    seedCommittedAppliedRows(
      context, {from: checkpointAt + 1, to: entryCount, term});
  } else {
    seedCommittedAppliedRows(context, {from: 1, to: entryCount, term});
  }
  return {
    workDir,
    checkpointsRoot,
    dbPath,
    db,
    adapter,
    storage,
    checkpointDir: created ? created.checkpointDir : null,
    close() {
      db.close();
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

function logRowCount(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM _raft_log').get().n;
}

function readStateValue(db, key) {
  const row = db.prepare(
    'SELECT value FROM _raft_state WHERE key = ?').get(key);
  return row ? row.value : null;
}

function assertRefusal(t, fixture, request, outcome, label) {
  const rowsBefore = logRowCount(fixture.db);
  const boundaryBefore = readSnapshotBoundary(fixture.db);
  const result = fixture.adapter.compactCommittedEntries(request);
  t.equal(result.outcome, outcome, `${label}: typed ${outcome}`);
  t.equal(result.changed, false, `${label}: reports no change`);
  t.equal(logRowCount(fixture.db), rowsBefore,
    `${label}: removes no row`);
  t.same(readSnapshotBoundary(fixture.db), boundaryBefore,
    `${label}: boundary keys untouched`);
}

test('the proofless call returns the byte-identical frozen refusal',
  async (t) => {
    const fixture = await createCompactionFixture(
      {checkpointAt: COMPACT_AT});
    try {
      const bare = fixture.adapter.compactCommittedEntries();
      t.equal(bare, unsupportedRaftCompactionResult(),
        'no-argument call returns the shared frozen result by IDENTITY');
      t.same(bare, UNSUPPORTED_LITERAL,
        'the result is byte-compatible with the two-field literal');
      const empty = fixture.adapter.compactCommittedEntries({});
      t.equal(empty, unsupportedRaftCompactionResult(),
        'a request naming neither toIndex nor proof draws the same identity');
      t.equal(logRowCount(fixture.db), ENTRY_COUNT,
        'the proofless refusals remove nothing');
    } finally {
      fixture.close();
    }
  });

test('every non-COMPACT decision-table row is a typed removing-nothing refusal',
  async (t) => {
    const fixture = await createCompactionFixture(
      {checkpointAt: COMPACT_AT});
    const foreign = await createCompactionFixture(
      {term: FOREIGN_TERM, checkpointAt: ENTRY_COUNT});
    try {
      const proof = {checkpointDir: fixture.checkpointDir};
      for (const invalidIndex of INVALID_COMPACTION_INDEXES) {
        assertRefusal(t, fixture, {toIndex: invalidIndex, proof},
          RAFT_COMPACTION_OUTCOME.INVALID_COMPACTION_INDEX,
          `invalid index ${String(invalidIndex)}`);
      }
      assertRefusal(t, fixture, {toIndex: COMPACT_AT},
        RAFT_COMPACTION_OUTCOME.SNAPSHOT_PROOF_MISSING, 'absent proof');
      assertRefusal(t, fixture, {toIndex: COMPACT_AT, proof: {}},
        RAFT_COMPACTION_OUTCOME.SNAPSHOT_PROOF_MISSING, 'empty proof');
      assertRefusal(t, fixture, {
        toIndex: COMPACT_AT,
        proof: {checkpointDir: path.join(fixture.workDir, 'nowhere')},
      }, RAFT_COMPACTION_OUTCOME.SNAPSHOT_PROOF_MISSING,
      'nonexistent checkpoint dir');
      // Structurally broken proof: payload present, descriptor gone.
      const partialDir = path.join(fixture.workDir, 'partial-proof');
      fs.cpSync(fixture.checkpointDir, partialDir, {recursive: true});
      fs.rmSync(path.join(partialDir, 'checkpoint.json'), {force: true});
      assertRefusal(t, fixture,
        {toIndex: COMPACT_AT, proof: {checkpointDir: partialDir}},
        RAFT_COMPACTION_OUTCOME.SNAPSHOT_PROOF_MISSING,
        'descriptor-less proof dir');
      // Proof sealed BELOW the requested index.
      assertRefusal(t, fixture, {toIndex: COMPACT_AT + 1, proof},
        RAFT_COMPACTION_OUTCOME.SNAPSHOT_PROOF_STALE, 'stale proof');
      // Foreign checkpoint: its descriptor term disagrees with the live row.
      assertRefusal(t, fixture, {
        toIndex: COMPACT_AT,
        proof: {checkpointDir: foreign.checkpointDir},
      }, RAFT_COMPACTION_OUTCOME.SNAPSHOT_PROOF_TERM_CONFLICT,
      'foreign proof term-anchor conflict');
      t.equal(logRowCount(fixture.db), ENTRY_COUNT,
        'red direction: the full refusal battery removed no row');
      t.same(readSnapshotBoundary(fixture.db),
        {lastIncludedIndex: 0, lastIncludedTerm: 0},
        'red direction: the boundary never moved');
    } finally {
      foreign.close();
      fixture.close();
    }
  });

test('beyond-committed and unresolvable-term requests are typed refusals',
  async (t) => {
    // Target: five rows but only three committed. Proof: a sibling replica
    // of the SAME term sealed at five, so the proof itself is valid and
    // anchored — only the durable watermark refuses the removal.
    const proofSource = await createCompactionFixture(
      {checkpointAt: ENTRY_COUNT});
    const workDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'raft-compaction-target-'));
    const db = new Database(path.join(workDir, 'replica.db'));
    const adapter = new SQLiteLogAdapter(db, {address: PARTITION_ID, term: TERM});
    try {
      for (let ordinal = 1; ordinal <= ENTRY_COUNT; ordinal += 1) {
        adapter.saveCommand({
          sql: `row-${ordinal}`,
          timestamp: rowHlc(ordinal).toString(),
        }, TERM);
      }
      adapter.commit(COMPACT_AT);
      const target = {db, adapter};
      assertRefusal(t, target, {
        toIndex: COMPACT_AT + 1,
        proof: {checkpointDir: proofSource.checkpointDir},
      }, RAFT_COMPACTION_OUTCOME.BEYOND_COMMITTED_REFUSAL,
      'physical removal never outruns the durable watermark');
      // A hole at the requested boundary index: the pre-deletion term is
      // unresolvable and the request is refused, never guessed.
      db.prepare('DELETE FROM _raft_log WHERE log_index = ?').run(2);
      assertRefusal(t, target, {
        toIndex: 2,
        proof: {checkpointDir: proofSource.checkpointDir},
      }, RAFT_COMPACTION_OUTCOME.BOUNDARY_TERM_UNRESOLVABLE,
      'a genuinely absent boundary term is a typed refusal');
    } finally {
      db.close();
      fs.rmSync(workDir, {recursive: true, force: true});
      proofSource.close();
    }
  });

test('a valid local proof compacts in one transaction and round-trips',
  async (t) => {
    const fixture = await createCompactionFixture(
      {checkpointAt: COMPACT_AT});
    try {
      const {adapter, db} = fixture;
      const expectedMaxHlc = rowHlc(1).toString();
      t.equal(adapter.getCommittedIndex(), ENTRY_COUNT,
        'anti-vacuous: the head sits above the compaction point');
      t.equal(readStateValue(
        db, RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.MAX_COMMITTED_HLC), null,
      'anti-vacuous: no maxCommittedHlc key exists before compaction');

      const result = adapter.compactCommittedEntries({
        toIndex: COMPACT_AT,
        proof: {checkpointDir: fixture.checkpointDir},
      });
      t.equal(result.outcome, RAFT_COMPACTION_OUTCOME.COMPACTED,
        'the proof-gated request compacts');
      t.equal(result.changed, true, 'the result reports the change');
      t.equal(result.removedEntryCount, COMPACT_AT,
        'exactly the prefix rows are counted removed');
      t.same(result.boundary,
        {lastIncludedIndex: COMPACT_AT, lastIncludedTerm: TERM},
        'the result carries the advanced boundary');
      t.ok(Object.isFrozen(result), 'the result is frozen');

      t.equal(db.prepare(
        'SELECT COUNT(*) AS n FROM _raft_log WHERE log_index <= ?',
      ).get(COMPACT_AT).n, 0, 'rows at or below K are physically gone');
      t.equal(logRowCount(db), ENTRY_COUNT - COMPACT_AT,
        'the suffix above K is intact');
      t.same(adapter.get(COMPACT_AT + 1).command.sql, `row-${COMPACT_AT + 1}`,
        'the first surviving row is exactly K+1 with its payload');
      t.same(readSnapshotBoundary(db),
        {lastIncludedIndex: COMPACT_AT, lastIncludedTerm: TERM},
        'the durable boundary keys advanced from the pre-deletion term');
      t.equal(adapter.getCommittedIndex(), ENTRY_COUNT,
        'committedIndex is untouched');
      t.equal(readStateValue(db, 'lastAppliedIndex'), String(ENTRY_COUNT),
        'lastAppliedIndex is untouched');
      t.equal(readStateValue(
        db, RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.MAX_COMMITTED_HLC),
      expectedMaxHlc,
      'maxCommittedHlc folds the max HLC over the DELETED rows');

      t.same(adapter.getLastInfo(), {
        index: ENTRY_COUNT,
        term: TERM,
        committedIndex: ENTRY_COUNT,
      }, 'getLastInfo answers from the surviving suffix on the same facade');
      t.equal(adapter.has(1), true,
        'has() answers compacted lineage below K on the same facade');
      t.equal(adapter.has(COMPACT_AT), true, 'has(K) is compacted lineage');
      t.equal(adapter.has(0), false, 'has(0) stays the virgin false');
      t.equal(adapter.getEntriesAfter(0).length, ENTRY_COUNT - COMPACT_AT,
        'entry reads see exactly the suffix');

      assertRefusal(t, fixture, {
        toIndex: COMPACT_AT,
        proof: {checkpointDir: fixture.checkpointDir},
      }, RAFT_COMPACTION_OUTCOME.ALREADY_COMPACTED,
      'repeating the request at K is a monotonic no-op');
      assertRefusal(t, fixture, {
        toIndex: COMPACT_AT - 1,
        proof: {checkpointDir: fixture.checkpointDir},
      }, RAFT_COMPACTION_OUTCOME.ALREADY_COMPACTED,
      'a below-boundary request can never write the keys downward');
    } finally {
      fixture.close();
    }
  });

test('red direction: without a valid proof no argument shape removes a row',
  async (t) => {
    const fixture = await createCompactionFixture(
      {checkpointAt: COMPACT_AT});
    try {
      const attacks = [
        undefined,
        {},
        {toIndex: COMPACT_AT},
        {proof: {checkpointDir: fixture.checkpointDir}},
        {toIndex: COMPACT_AT, proof: {}},
        {toIndex: COMPACT_AT, proof: {checkpointDir: ''}},
        {toIndex: COMPACT_AT, proof: {checkpointDir: fixture.workDir}},
        {toIndex: ENTRY_COUNT, proof: {checkpointDir: fixture.checkpointDir}},
        {toIndex: Number.MAX_SAFE_INTEGER,
          proof: {checkpointDir: fixture.checkpointDir}},
        {toIndex: '3', proof: {checkpointDir: fixture.checkpointDir}},
      ];
      for (const request of attacks) {
        const result = fixture.adapter.compactCommittedEntries(request);
        t.not(result.outcome, RAFT_COMPACTION_OUTCOME.COMPACTED,
          `attack ${JSON.stringify(request) ?? 'undefined'} never compacts`);
        t.equal(logRowCount(fixture.db), ENTRY_COUNT,
          'every row survives the attack');
      }
      t.same(readSnapshotBoundary(fixture.db),
        {lastIncludedIndex: 0, lastIncludedTerm: 0},
        'the boundary never moved under attack');
      t.equal(fixture.adapter.getCommittedIndex(), ENTRY_COUNT,
        'the committed watermark never moved under attack');
    } finally {
      fixture.close();
    }
  });
