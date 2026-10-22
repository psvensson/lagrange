// The rs-raft durable store's read-only readers: the applied proposals and the
// applied index, the reads every consumer of the durable log (HLC warm-up, the
// mirror replay cursor, prepared-state reconstruction) asks instead of the
// legacy log.
//
// The store is written only through its own write API, the calls the runtime
// owner makes when the core hands it a Ready and when an entry is applied
// (appendEntries, putHardState, putAppliedState). Payloads are what the
// runtime persists for a proposal: the base64 text of the bytes the proposal
// codec encoded. Expectations are the inputs read back through the readers;
// the boundaries are the hard and applied state the test wrote.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {
  decodeCommittedProposal,
  encodeProposal,
} from '../../../src/raft/raft-rs-proposal-codec.js';
import {RAFT_RS_PROPOSAL_CODEC_ERROR} from
  '../../../src/raft/raft-rs-proposal-codec-constants.js';
import {RAFT_RS_ENTRY_TYPE} from
  '../../../src/raft/raft-rs-ready-loop-constants.js';
import {RAFT_RS_RETAINED_ENTRY_KIND as KIND, RAFT_RS_RETAINED_ENTRY_PHASE as PHASE,
  RAFT_RS_RETAINED_HISTORY_COVERAGE as COVERAGE, RAFT_RS_STORE_ERROR_CODE as ERROR,
  RAFT_RS_TABLE as TABLE} from '../../../src/raft/raft-rs-durable-store-constants.js';

const GROUP_ID = 'committed-entries-group';
const OTHER_GROUP_ID = 'another-group';
const TERM = '3';
const VOTE = '1';
const NO_MEMBERS = Object.freeze({});
const SCHEMA_TABLES_SQL =
  'SELECT name FROM sqlite_master WHERE type = \'table\' ORDER BY name';
const BASE64 = 'base64';
const COMMANDS = Object.freeze([
  Object.freeze({type: 'INSERT', sql: 'INSERT INTO t VALUES (?)', params: [1]}),
  Object.freeze({type: 'UPDATE', sql: 'UPDATE t SET v = ?', params: ['x']}),
  Object.freeze({type: 'DELETE', sql: 'DELETE FROM t', params: []}),
]);
const NOT_JSON = 'this is not a JSON proposal';

function payloadOf(command) {
  return Buffer.from(encodeProposal(command)).toString(BASE64);
}

function normalEntry(index, command) {
  return {
    index: String(index),
    term: TERM,
    entryType: RAFT_RS_ENTRY_TYPE.NORMAL,
    data: payloadOf(command),
  };
}

function withStore(work) {
  const db = new Database(':memory:');
  try {
    return work(new RaftRsDurableStore(db), db);
  } finally {
    db.close();
  }
}

function commitAt(store, groupId, commit) {
  store.putHardState(groupId, {term: TERM, vote: VOTE, commit: String(commit)});
}

function applyAt(store, groupId, applied) {
  store.putAppliedState(groupId, String(applied), NO_MEMBERS);
}

test('the readers are DDL-free: a database without the record has no ' +
  'applied proposals and no applied index, and gains no table', () => {
  const db = new Database(':memory:');
  try {
    const before = db.prepare(SCHEMA_TABLES_SQL).all();
    assert.deepEqual(
      RaftRsDurableStore.readCommittedEntriesIn(db, GROUP_ID), []);
    assert.equal(RaftRsDurableStore.readAppliedIndexIn(db, GROUP_ID), null);
    assert.deepEqual(db.prepare(SCHEMA_TABLES_SQL).all(), before,
      'no reader created a table');
  } finally {
    db.close();
  }
});

test('a group with no applied state has no applied proposals', () => {
  withStore((store, db) => {
    assert.deepEqual(
      RaftRsDurableStore.readCommittedEntriesIn(db, GROUP_ID), []);
    // Entries committed but never applied are not in the state machine.
    store.appendEntries(GROUP_ID, [normalEntry(1, COMMANDS[0])]);
    commitAt(store, GROUP_ID, 1);
    assert.deepEqual(
      RaftRsDurableStore.readCommittedEntriesIn(db, GROUP_ID), []);
    assert.equal(RaftRsDurableStore.readAppliedIndexIn(db, GROUP_ID), null);
  });
});

test('applied NORMAL entries with a payload are decoded in log order; ' +
  'entries committed but not applied, entries above the commit index, ' +
  'empty entries, configuration changes and other groups are excluded', () => {
  withStore((store, db) => {
    store.appendEntries(GROUP_ID, [
      // The empty entry a new leader appends carries no payload.
      {index: '1', term: TERM, entryType: RAFT_RS_ENTRY_TYPE.NORMAL},
      normalEntry(2, COMMANDS[0]),
      // A configuration change belongs to the runtime, not the application;
      // its bytes are not a proposal and must never be decoded as one.
      {
        index: '3',
        term: TERM,
        entryType: RAFT_RS_ENTRY_TYPE.CONF_CHANGE_V2,
        data: Buffer.from(NOT_JSON).toString(BASE64),
      },
      normalEntry(4, COMMANDS[1]),
      normalEntry(5, COMMANDS[2]),
    ]);
    store.appendEntries(OTHER_GROUP_ID, [normalEntry(2, COMMANDS[2])]);
    commitAt(store, OTHER_GROUP_ID, 2);
    applyAt(store, OTHER_GROUP_ID, 2);
    // Committed through 5, applied through 4: entry 5 is committed but the
    // state machine does not hold it yet.
    commitAt(store, GROUP_ID, 5);
    applyAt(store, GROUP_ID, 4);

    const applied = RaftRsDurableStore.readCommittedEntriesIn(db, GROUP_ID);
    assert.deepEqual(applied, [
      {index: '2', term: TERM, command: COMMANDS[0]},
      {index: '4', term: TERM, command: COMMANDS[1]},
    ]);
    assert.equal(Object.isFrozen(applied[0]), true,
      'each applied entry is a frozen record');
    assert.equal(RaftRsDurableStore.readAppliedIndexIn(db, GROUP_ID), '4');

    applyAt(store, GROUP_ID, 5);
    assert.deepEqual(
      RaftRsDurableStore.readCommittedEntriesIn(db, GROUP_ID)
        .map((entry) => entry.command),
      COMMANDS.slice(0, 3));
    assert.equal(RaftRsDurableStore.readAppliedIndexIn(db, GROUP_ID), '5');
  });
});

test('an undecodable applied entry fails closed with a typed error', () => {
  withStore((store, db) => {
    store.appendEntries(GROUP_ID, [
      normalEntry(1, COMMANDS[0]),
      {
        index: '2',
        term: TERM,
        entryType: RAFT_RS_ENTRY_TYPE.NORMAL,
        data: Buffer.from(NOT_JSON).toString(BASE64),
      },
    ]);
    commitAt(store, GROUP_ID, 2);
    applyAt(store, GROUP_ID, 1);
    assert.equal(
      RaftRsDurableStore.readCommittedEntriesIn(db, GROUP_ID).length, 1,
      'the undecodable entry above the applied index is not read');
    applyAt(store, GROUP_ID, 2);
    assert.throws(() => RaftRsDurableStore.readCommittedEntriesIn(db, GROUP_ID),
      (error) => error instanceof Error &&
        error.code === RAFT_RS_PROPOSAL_CODEC_ERROR.UNDECODABLE);
  });
});

test('the proposal codec is JSON only: what it encodes decodes, and bytes ' +
  'that are not a proposal fail closed', () => {
  for (const command of COMMANDS) {
    assert.deepEqual(decodeCommittedProposal(encodeProposal(command)), command);
  }
  const INVALID_UTF8 = Uint8Array.of(0xff, 0xfe);
  for (const bytes of [Buffer.from(NOT_JSON), INVALID_UTF8]) {
    assert.throws(() => decodeCommittedProposal(bytes),
      (error) => error.code === RAFT_RS_PROPOSAL_CODEC_ERROR.UNDECODABLE);
  }
  assert.throws(() => encodeProposal(undefined),
    (error) => error.code === RAFT_RS_PROPOSAL_CODEC_ERROR.UNENCODABLE);
});

// These are storage-owner fixtures, including intentional corruptions. The
// companion participant integration witness supplies real native histories.
function coherentHistory(store) {
  store.appendEntries(GROUP_ID, COMMANDS.map((command, index) => normalEntry(index + 1, command)));
  commitAt(store, GROUP_ID, 2);
  applyAt(store, GROUP_ID, 1);
}

function retainedView(db) {
  const before = db.serialize();
  const history = RaftRsDurableStore.readRetainedHistoryIn(db, GROUP_ID);
  assert.deepEqual(db.serialize(), before, 'inspection preserves all native/application bytes');
  assert.equal(db.inTransaction, false);
  return history;
}

test('retained history preserves all three exact ranges and freezes its owned observation', () => {
  withStore((store, db) => {
    coherentHistory(store);
    const history = retainedView(db);
    assert.equal(history.coverage, COVERAGE.COMPLETE);
    assert.equal(history.appliedIndex, '1');
    assert.equal(history.commitIndex, '2');
    assert.equal(history.lastIndex, '3');
    assert.deepEqual(history.entries.map(({phase}) => phase),
      [PHASE.APPLIED, PHASE.COMMITTED_PENDING, PHASE.LOCAL_UNCOMMITTED]);
    assert.deepEqual(history.entries.map(({command}) => command), COMMANDS);
    assert.deepEqual(history.record, store.readDurableRecord(GROUP_ID));
    assert.throws(() => history.record.entries.pop(), TypeError);
    assert.throws(() => history.entries[1].command.params.push('changed'), TypeError);
  });
});

test('retained zero-progress founder permits no hard-state row', () => {
  withStore((store, db) => {
    store.putBootstrapAppliedState(GROUP_ID, {voters: ['1']},
      {bootstrapIndex: '0', admissionIndex: '0'});
    const history = retainedView(db);
    assert.equal(history.record.hardState, null);
    assert.equal(history.coverage, COVERAGE.COMPLETE);
    assert.equal(history.appliedIndex, '0');
    assert.equal(history.commitIndex, '0');
    assert.equal(history.lastIndex, '0');
  });
});

test('retained snapshot positions above Number precision remain exact with named prefix coverage',
  () => {
    withStore((store, db) => {
      const snapshotIndex = 9007199254740993n;
      store.putSnapshot(GROUP_ID, {metadata: {index: String(snapshotIndex), term: TERM}});
      store.appendEntries(GROUP_ID, [normalEntry(snapshotIndex + 1n, COMMANDS[0]),
        normalEntry(snapshotIndex + 2n, COMMANDS[1])]);
      commitAt(store, GROUP_ID, snapshotIndex + 1n);
      applyAt(store, GROUP_ID, snapshotIndex);
      const history = retainedView(db);
      assert.equal(history.coverage, COVERAGE.SNAPSHOT_PREFIX);
      assert.equal(history.appliedIndex, '9007199254740993');
      assert.equal(history.commitIndex, '9007199254740994');
      assert.equal(history.lastIndex, '9007199254740995');
      assert.deepEqual(history.entries.map(({phase}) => phase),
        [PHASE.COMMITTED_PENDING, PHASE.LOCAL_UNCOMMITTED]);
    });
  });

test('retained native no-ops and configuration bytes are distinct from application proposals', () => {
  withStore((store, db) => {
    store.appendEntries(GROUP_ID, [
      {index: '1', term: TERM, entryType: RAFT_RS_ENTRY_TYPE.NORMAL},
      {index: '2', term: TERM, entryType: RAFT_RS_ENTRY_TYPE.NORMAL, data: ''},
      {index: '3', term: TERM, entryType: RAFT_RS_ENTRY_TYPE.CONF_CHANGE_V2,
        data: Buffer.from(NOT_JSON).toString(BASE64)},
      normalEntry(4, null),
    ]);
    commitAt(store, GROUP_ID, 3);
    applyAt(store, GROUP_ID, 2);
    const history = retainedView(db);
    assert.deepEqual(history.entries.map(({kind}) => kind),
      [KIND.NOOP, KIND.NOOP, KIND.CONFIGURATION, KIND.COMMAND]);
    assert.equal(Object.hasOwn(history.entries[2], 'command'), false,
      'the reader never substitutes a membership parser');
    assert.equal(history.entries[3].command, null,
      'valid JSON is observed, without claiming application permission');
  });
});

const RAW_CORRUPTIONS = [
  ['non-integer applied index', `UPDATE ${TABLE.APPLIED_STATE} SET applied_index = 1.5`],
  ['unknown native entry type', `UPDATE ${TABLE.LOG} SET entry_type = 0.5 WHERE log_index = 2`],
  ['negative hard state', `UPDATE ${TABLE.HARD_STATE} SET term = -1`],
  ['zero-term vote', `UPDATE ${TABLE.HARD_STATE} SET term = 0, vote = 1`],
  ['non-boolean raw auto leave', `UPDATE ${TABLE.APPLIED_STATE} SET auto_leave = 2`],
  ['noncanonical peer text', `UPDATE ${TABLE.APPLIED_STATE} SET voters = '["01"]'`],
  ['non-string peer', `UPDATE ${TABLE.APPLIED_STATE} SET voters = '[1]'`],
  ['duplicate peer', `UPDATE ${TABLE.APPLIED_STATE} SET voters = '["1","1"]'`],
  ['invalid configuration JSON', `UPDATE ${TABLE.APPLIED_STATE} SET voters = '{'`],
  ['membership generation beyond coverage',
    `UPDATE ${TABLE.APPLIED_STATE} SET membership_generation_index = 9`],
  ['invalid payload base64', `UPDATE ${TABLE.LOG} SET data = '%%%%' WHERE log_index = 2`],
  ['noncanonical payload base64', `UPDATE ${TABLE.LOG} SET data = 'e30' WHERE log_index = 2`],
  ['invalid UTF8 proposal', `UPDATE ${TABLE.LOG} SET data = '//4=' WHERE log_index = 2`],
];

test('raw retained corruption cannot be normalized into a coherent observation', async (t) => {
  for (const [name, sql] of RAW_CORRUPTIONS) {
    await t.test(name, () => withStore((store, db) => {
      coherentHistory(store);
      db.exec(sql);
      const before = db.serialize();
      assert.throws(() => retainedView(db), {code: ERROR.RETAINED_HISTORY_INVALID});
      assert.deepEqual(db.serialize(), before);
      assert.equal(db.inTransaction, false);
    }));
  }
});

test('missing required native observations remain unavailable and never create schema', async (t) => {
  for (const sql of [
    `DROP TABLE ${TABLE.HARD_STATE}`,
    `DELETE FROM ${TABLE.APPLIED_STATE}`,
    `ALTER TABLE ${TABLE.APPLIED_STATE} DROP COLUMN membership_generation_index`,
  ]) {
    await t.test(sql, () => withStore((store, db) => {
      coherentHistory(store);
      db.exec(sql);
      const before = db.serialize();
      assert.throws(() => retainedView(db), {code: ERROR.RETAINED_HISTORY_UNAVAILABLE});
      assert.deepEqual(db.serialize(), before);
      assert.equal(db.inTransaction, false);
    }));
  }
});

test('snapshot overlap and effective suffix boundaries are validated without deleting old entries',
  async (t) => {
    const corruptions = [
      ['snapshot beyond commit', `UPDATE ${TABLE.SNAPSHOT} SET snapshot_index = 3`],
      ['overlap term disagreement', `UPDATE ${TABLE.SNAPSHOT} SET snapshot_term = 2`],
      ['term beyond hard state', `UPDATE ${TABLE.SNAPSHOT} SET snapshot_term = 4`],
      ['suffix gap', `DELETE FROM ${TABLE.LOG} WHERE log_index = 3`],
    ];
    for (const [name, mutation] of [['valid overlap', null], ...corruptions]) {
      await t.test(name, () => withStore((store, db) => {
        coherentHistory(store);
        store.appendEntries(GROUP_ID, [normalEntry(4, COMMANDS[0])]);
        store.putSnapshot(GROUP_ID, {metadata: {index: '2', term: TERM}});
        if (mutation !== null) {
          db.exec(mutation);
          const before = db.serialize();
          assert.throws(() => retainedView(db), {code: ERROR.RETAINED_HISTORY_INVALID});
          assert.deepEqual(db.serialize(), before);
        } else {
          const history = retainedView(db);
          assert.equal(history.coverage, COVERAGE.SNAPSHOT_PREFIX);
          assert.equal(history.record.entries.length, 4);
          assert.deepEqual(history.record.entries, store.readDurableRecord(GROUP_ID).entries);
        }
      }));
    }
  });
