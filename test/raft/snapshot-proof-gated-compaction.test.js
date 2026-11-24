import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';

import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {
  RAFT_COMPACTION_OUTCOME,
  unsupportedRaftCompactionResult,
} from '../../src/raft/compaction-policy.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {
  RaftRsPeerIdentityRegistry,
} from '../../src/raft/raft-rs-peer-identity.js';
import {
  compactRaftRsCommittedEntries,
} from '../../src/raft/snapshot-compaction.js';
import {createSealedSourceGeneration} from './snapshot-catchup-fixture.js';

// S5 proof-gated compaction decision table for RaftRsDurableStore (quest
// raft-snapshot-retention-compaction): the proofless call returns the
// byte-identical frozen snapshot_protocol_unavailable refusal (asserted by
// IDENTITY and by deep equality against the two-field literal); every other
// row of the table is a typed refusal that removes nothing; and the single
// COMPACT path round-trips — prefix gone, suffix intact, snapshot boundary
// advanced from the pre-deletion term, watermarks untouched, maxCommittedHlc
// folded from the deleted rows.
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

function seedRaftRsRows(db, options) {
  const {entryCount, commitIndex, appliedIndex, term} = options;
  const registry = new RaftRsPeerIdentityRegistry(db);
  const leaderPeer = registry.registerReplica(`${PARTITION_ID}-r1`);
  const followerPeer = registry.registerReplica(`${PARTITION_ID}-r2`);
  const confState = {
    voters: [leaderPeer, followerPeer],
    learners: [],
    votersOutgoing: [],
    learnersNext: [],
    autoLeave: false,
  };
  const store = new RaftRsDurableStore(db);
  db.exec(`CREATE TABLE IF NOT EXISTS ${STATE_TABLE} ` +
    '(id TEXT PRIMARY KEY, payload TEXT)');
  const entries = [];
  for (let ordinal = 1; ordinal <= entryCount; ordinal += 1) {
    db.prepare(
      `INSERT INTO ${STATE_TABLE} (id, payload) VALUES (?, ?)`,
    ).run(`row-${ordinal}`, `payload-${ordinal}`);
    entries.push({
      index: String(ordinal),
      term: String(term),
      entryType: 0,
      data: Buffer.from(JSON.stringify({
        sql: `row-${ordinal}`,
        timestamp: rowHlc(ordinal).toString(),
      })).toString('base64'),
    });
  }
  store.transaction(() => {
    store.putBootstrapAppliedState(PARTITION_ID, confState, {
      bootstrapIndex: '0',
      admissionIndex: '0',
      membershipGenerationIndex: '0',
    });
    store.appendEntries(PARTITION_ID, entries);
    store.putAppliedState(
      PARTITION_ID,
      String(appliedIndex),
      confState,
      undefined,
      String(IDENTITY.membershipEpoch),
    );
    store.putHardState(PARTITION_ID, {
      term: String(term),
      vote: '0',
      commit: String(commitIndex),
    });
  });
}

// File-backed raft-rs replica with committed+applied rows and (optionally) a
// sealed raft-rs proof generation created at `checkpointAt`.
async function createCompactionFixture(options = {}) {
  const term = options.term ?? TERM;
  const entryCount = options.entryCount ?? ENTRY_COUNT;
  const commitIndex = options.commitIndex ?? entryCount;
  const appliedIndex = options.appliedIndex ?? commitIndex;
  const checkpointAt = options.checkpointAt ?? null;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-compaction-'));
  const checkpointsRoot = path.join(workDir, 'checkpoints');
  const dbPath = path.join(workDir, 'replica.db');
  const db = new Database(dbPath);
  seedRaftRsRows(db, {entryCount, commitIndex, appliedIndex, term});
  let created = null;
  if (checkpointAt !== null) {
    const proofDir = path.join(workDir, 'proof-source');
    fs.mkdirSync(proofDir, {recursive: true});
    ({created} = await createSealedSourceGeneration({
      workDir: proofDir,
      checkpointsRoot,
      partitionId: PARTITION_ID,
      stateTable: STATE_TABLE,
      term,
      identity: IDENTITY,
      entryCount: checkpointAt,
      entryTimestamp: (ordinal) => rowHlc(ordinal).toString(),
    }));
  }
  return {
    workDir,
    checkpointsRoot,
    dbPath,
    db,
    checkpointDir: created ? created.checkpointDir : null,
    close() {
      db.close();
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

function logRowCount(db) {
  return db.prepare(
    'SELECT COUNT(*) AS n FROM _raft_rs_log WHERE group_id = ?',
  ).get(PARTITION_ID).n;
}

function snapshotIndex(db) {
  return Number(RaftRsDurableStore.readSnapshotIndexIn(db, PARTITION_ID));
}

function assertRefusal(t, fixture, request, outcome, label) {
  const rowsBefore = logRowCount(fixture.db);
  const boundaryBefore = snapshotIndex(fixture.db);
  const result = compactRaftRsCommittedEntries(
    fixture.db, PARTITION_ID, request);
  t.equal(result.outcome, outcome, `${label}: typed ${outcome}`);
  t.equal(result.changed, false, `${label}: reports no change`);
  t.equal(logRowCount(fixture.db), rowsBefore,
    `${label}: removes no row`);
  t.equal(snapshotIndex(fixture.db), boundaryBefore,
    `${label}: snapshot boundary untouched`);
}

test('the proofless call returns the byte-identical frozen refusal',
  async (t) => {
    const fixture = await createCompactionFixture(
      {checkpointAt: COMPACT_AT});
    try {
      const bare = compactRaftRsCommittedEntries(fixture.db, PARTITION_ID);
      t.equal(bare, unsupportedRaftCompactionResult(),
        'no-argument call returns the shared frozen result by IDENTITY');
      t.same(bare, UNSUPPORTED_LITERAL,
        'the result is byte-compatible with the two-field literal');
      const empty = compactRaftRsCommittedEntries(fixture.db, PARTITION_ID, {});
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
      t.equal(snapshotIndex(fixture.db), 0,
        'red direction: the snapshot boundary never moved');
    } finally {
      foreign.close();
      fixture.close();
    }
  });

test('beyond-committed and unresolvable-term requests are typed refusals',
  async (t) => {
    // Target: five rows but only three committed/applied. Proof: a sibling
    // replica of the SAME term sealed at five, so the proof itself is valid
    // and anchored — only the durable watermark refuses the removal.
    const proofSource = await createCompactionFixture(
      {checkpointAt: ENTRY_COUNT});
    const target = await createCompactionFixture({
      entryCount: ENTRY_COUNT,
      commitIndex: COMPACT_AT,
      appliedIndex: COMPACT_AT,
    });
    try {
      assertRefusal(t, target, {
        toIndex: COMPACT_AT + 1,
        proof: {checkpointDir: proofSource.checkpointDir},
      }, RAFT_COMPACTION_OUTCOME.BEYOND_COMMITTED_REFUSAL,
      'physical removal never outruns the durable watermark');
      // A hole at the requested boundary index: the pre-deletion term is
      // unresolvable and the request is refused, never guessed.
      target.db.prepare(
        'DELETE FROM _raft_rs_log WHERE group_id = ? AND log_index = ?',
      ).run(PARTITION_ID, 2);
      assertRefusal(t, target, {
        toIndex: 2,
        proof: {checkpointDir: proofSource.checkpointDir},
      }, RAFT_COMPACTION_OUTCOME.BOUNDARY_TERM_UNRESOLVABLE,
      'a genuinely absent boundary term is a typed refusal');
    } finally {
      target.close();
      proofSource.close();
    }
  });

test('a valid local proof compacts in one transaction and round-trips',
  async (t) => {
    const fixture = await createCompactionFixture(
      {checkpointAt: COMPACT_AT});
    try {
      const {db} = fixture;
      const expectedMaxHlc = rowHlc(1).toString();
      t.equal(RaftRsDurableStore.readCompactedMaxHlcIn(db, PARTITION_ID), null,
        'anti-vacuous: no compacted max HLC exists before compaction');

      const result = compactRaftRsCommittedEntries(db, PARTITION_ID, {
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
        'SELECT COUNT(*) AS n FROM _raft_rs_log ' +
        'WHERE group_id = ? AND log_index <= ?',
      ).get(PARTITION_ID, COMPACT_AT).n, 0,
      'rows at or below K are physically gone');
      t.equal(logRowCount(db), ENTRY_COUNT - COMPACT_AT,
        'the suffix above K is intact');
      const record = RaftRsDurableStore.readDurableRecordIn(db, PARTITION_ID);
      t.equal(Number(record.entries[0].index), COMPACT_AT + 1,
        'the first surviving row is exactly K+1');
      t.equal(snapshotIndex(db), COMPACT_AT,
        'the durable snapshot boundary advanced to K');
      t.equal(Number(record.hardState.commit), ENTRY_COUNT,
        'commit index is untouched');
      t.equal(Number(record.appliedIndex), ENTRY_COUNT,
        'applied index is untouched');
      t.equal(RaftRsDurableStore.readCompactedMaxHlcIn(db, PARTITION_ID),
        expectedMaxHlc,
        'maxCommittedHlc folds the max HLC over the deleted rows');

      assertRefusal(t, fixture, {
        toIndex: COMPACT_AT,
        proof: {checkpointDir: fixture.checkpointDir},
      }, RAFT_COMPACTION_OUTCOME.ALREADY_COMPACTED,
      'repeating the request at K is a monotonic no-op');
      assertRefusal(t, fixture, {
        toIndex: COMPACT_AT - 1,
        proof: {checkpointDir: fixture.checkpointDir},
      }, RAFT_COMPACTION_OUTCOME.ALREADY_COMPACTED,
      'a below-boundary request can never move the boundary downward');
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
        const result = compactRaftRsCommittedEntries(
          fixture.db, PARTITION_ID, request);
        t.not(result.outcome, RAFT_COMPACTION_OUTCOME.COMPACTED,
          `attack ${JSON.stringify(request) ?? 'undefined'} never compacts`);
        t.equal(logRowCount(fixture.db), ENTRY_COUNT,
          'every row survives the attack');
      }
      t.equal(snapshotIndex(fixture.db), 0,
        'the snapshot boundary never moved under attack');
      const record = RaftRsDurableStore.readDurableRecordIn(
        fixture.db, PARTITION_ID);
      t.equal(Number(record.hardState.commit), ENTRY_COUNT,
        'the committed watermark never moved under attack');
    } finally {
      fixture.close();
    }
  });
