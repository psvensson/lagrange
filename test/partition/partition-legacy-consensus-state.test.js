// The legacy partition consensus-state detector
// (src/partition/partition-legacy-consensus-state.js).
//
// Every database here is written by production owners: the retired backend's
// own log adapter and raft storage write the legacy state, and the rs-raft
// durable store writes the rs-raft record. The detector's verdict on whether
// an rs-raft record exists is checked against the store's own instance
// predicate, read after the detector has run. Only the inputs (rows, a term,
// a vote) are spelled here.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {
  detectLegacyPartitionConsensusState,
  legacyPartitionConsensusStateError,
} from '../../src/partition/partition-legacy-consensus-state.js';
import {
  LEGACY_PARTITION_CONSENSUS_OUTCOME,
  LEGACY_PARTITION_CONSENSUS_REASON,
} from '../../src/partition/partition-legacy-consensus-state-constants.js';
import {PartitionRaftStorage} from
  '../../src/partition/partition-raft-storage.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';

const PARTITION_ID = 'legacy-detector-p1';
const OTHER_GROUP_ID = 'legacy-detector-p2';
const LEGACY_TERM = 3;
const LEGACY_VOTE = 'legacy-detector-p1-r2';
const COMMANDS = Object.freeze([
  Object.freeze({sql: 'INSERT INTO t (id) VALUES (?)', params: ['a']}),
  Object.freeze({sql: 'INSERT INTO t (id) VALUES (?)', params: ['b']}),
]);
// An rs-raft hard state as the core hands it to the store: decimal strings.
const RS_HARD_STATE = Object.freeze({term: '2', vote: '1', commit: '1'});
const SELECT_SCHEMA =
  'SELECT type, name, sql FROM sqlite_master ORDER BY type, name';

function schemaOf(db) {
  return db.prepare(SELECT_SCHEMA).all();
}

function withDatabase(work) {
  const db = new Database(':memory:');
  try {
    return work(db);
  } finally {
    db.close();
  }
}

// The detector's decision, with proof that asking wrote nothing.
function detect(db, partitionId = PARTITION_ID) {
  const schemaBefore = schemaOf(db);
  const changesBefore = db.prepare('SELECT total_changes() AS n').get().n;
  const decision = detectLegacyPartitionConsensusState({db, partitionId});
  assert.deepEqual(schemaOf(db), schemaBefore,
    'the detector creates no table');
  assert.equal(db.prepare('SELECT total_changes() AS n').get().n,
    changesBefore, 'the detector writes no row');
  return decision;
}

// Whether the rs-raft store itself says the group has a record; opening the
// store runs its DDL, so this is read only after the detector has decided.
function storeHasRecord(db, groupId = PARTITION_ID) {
  return new RaftRsDurableStore(db).hasDurableRecord(groupId);
}

function seedLegacyLog(db) {
  const adapter = new SQLiteLogAdapter(db);
  let last = null;
  for (const command of COMMANDS) {
    last = adapter.saveCommand(command, LEGACY_TERM);
  }
  adapter.commit(last.index);
  return adapter;
}

function seedRsRecord(db, groupId) {
  new RaftRsDurableStore(db).persistReady(groupId, {
    entries: [], hardState: RS_HARD_STATE,
  });
}

test('a fresh database has no legacy consensus state', () => {
  withDatabase((db) => {
    const decision = detect(db);
    assert.deepEqual(decision, {
      outcome: LEGACY_PARTITION_CONSENSUS_OUTCOME.ABSENT, reasons: [],
    });
    assert.deepEqual(schemaOf(db), [], 'still no table at all');
  });
});

test('the legacy tables alone are not legacy consensus state', () => {
  withDatabase((db) => {
    const adapter = new SQLiteLogAdapter(db);
    const storage = new PartitionRaftStorage(db, PARTITION_ID, adapter);
    // The empty defaults the legacy owners persist for a group that never
    // held consensus: term 0 and no vote.
    storage.persistTerm();
    storage.persistVotedFor();
    adapter.close();
    const decision = detect(db);
    assert.equal(decision.outcome, LEGACY_PARTITION_CONSENSUS_OUTCOME.ABSENT,
      `tables and empty defaults are not state: ${JSON.stringify(decision)}`);
    assert.deepEqual(decision.reasons, []);
  });
});

test('legacy log entries and a committed index without an rs-raft record ' +
  'refuse with typed reasons', () => {
  withDatabase((db) => {
    seedLegacyLog(db).close();
    const decision = detect(db);
    assert.deepEqual(decision, {
      outcome: LEGACY_PARTITION_CONSENSUS_OUTCOME.DETECTED,
      reasons: [
        LEGACY_PARTITION_CONSENSUS_REASON.LOG_ENTRIES,
        LEGACY_PARTITION_CONSENSUS_REASON.COMMITTED_INDEX,
      ],
    });
    assert.equal(storeHasRecord(db), false,
      'the rs-raft store agrees there is no record');
    const error = legacyPartitionConsensusStateError(decision, PARTITION_ID);
    assert.ok(error instanceof Error);
    assert.equal(error.code, LEGACY_PARTITION_CONSENSUS_OUTCOME.DETECTED);
    assert.deepEqual(error.reasons, decision.reasons);
    assert.ok(error.message.includes(PARTITION_ID),
      `the refusal names the partition: ${error.message}`);
  });
});

test('a persisted legacy term alone refuses', () => {
  withDatabase((db) => {
    const storage = new PartitionRaftStorage(db, PARTITION_ID);
    storage.currentTerm = LEGACY_TERM;
    storage.persistTerm();
    storage.logAdapter.close();
    assert.deepEqual(detect(db), {
      outcome: LEGACY_PARTITION_CONSENSUS_OUTCOME.DETECTED,
      reasons: [LEGACY_PARTITION_CONSENSUS_REASON.CURRENT_TERM],
    });
  });
});

test('a recorded legacy vote alone refuses', () => {
  withDatabase((db) => {
    const storage = new PartitionRaftStorage(db, PARTITION_ID);
    storage.votedFor = LEGACY_VOTE;
    storage.persistVotedFor();
    storage.logAdapter.close();
    assert.deepEqual(detect(db), {
      outcome: LEGACY_PARTITION_CONSENSUS_OUTCOME.DETECTED,
      reasons: [LEGACY_PARTITION_CONSENSUS_REASON.VOTED_FOR],
    });
  });
});

test('legacy content beside an rs-raft record of the same partition is ' +
  'tolerated', () => {
  withDatabase((db) => {
    seedLegacyLog(db).close();
    seedRsRecord(db, PARTITION_ID);
    const decision = detect(db);
    assert.equal(decision.outcome,
      LEGACY_PARTITION_CONSENSUS_OUTCOME.BESIDE_RS_RAFT_RECORD,
      JSON.stringify(decision));
    assert.equal(decision.reasons.length > 0, true,
      'the legacy content is still reported');
    assert.equal(storeHasRecord(db), true,
      'the rs-raft store agrees the record exists');
  });
});

test('an rs-raft record of another partition does not excuse legacy state',
  () => {
    withDatabase((db) => {
      seedLegacyLog(db).close();
      seedRsRecord(db, OTHER_GROUP_ID);
      assert.equal(detect(db).outcome,
        LEGACY_PARTITION_CONSENSUS_OUTCOME.DETECTED);
      assert.equal(storeHasRecord(db, PARTITION_ID), false);
      assert.equal(storeHasRecord(db, OTHER_GROUP_ID), true);
    });
  });

test('the read-only rs-raft record question agrees with the store and ' +
  'creates nothing', () => {
  withDatabase((db) => {
    assert.equal(RaftRsDurableStore.hasDurableRecordIn(db, PARTITION_ID),
      false, 'no tables: no record');
    assert.deepEqual(schemaOf(db), [], 'asking created no table');
    new RaftRsDurableStore(db);
    assert.equal(RaftRsDurableStore.hasDurableRecordIn(db, PARTITION_ID),
      storeHasRecord(db), 'empty tables: same answer as the store');
    seedRsRecord(db, PARTITION_ID);
    assert.equal(RaftRsDurableStore.hasDurableRecordIn(db, PARTITION_ID),
      storeHasRecord(db), 'a record: same answer as the store');
    assert.equal(RaftRsDurableStore.hasDurableRecordIn(db, PARTITION_ID),
      true);
  });
});
