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
