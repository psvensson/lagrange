// Storage-owner fixtures test read-only correspondence. Actual native ENABLE,
// held application and replay are measured in the companion integration file.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {encodeProposal} from '../../src/raft/raft-rs-proposal-codec.js';
import {RAFT_RS_ENTRY_TYPE} from '../../src/raft/raft-rs-ready-loop-constants.js';
import {RAFT_RS_TABLE, RAFT_RS_STORE_ERROR_CODE} from
  '../../src/raft/raft-rs-durable-store-constants.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {buildGenerationOriginCommand} from
  '../../src/partition/partition-participant-transaction-bytes.js';
import {openParticipantTransactionStore, readPartitionWriteOriginHistory,
  recordPartitionWriteOrigin, advancePartitionWriteGeneration} from
  '../../src/partition/partition-participant-transaction-store.js';
import {PARTICIPANT_ORIGIN_HISTORY_STATE as STATE,
  PARTICIPANT_ORIGIN_HISTORY_REASON as REASON,
  PARTICIPANT_TRANSACTION_COMMAND as COMMAND} from
  '../../src/partition/partition-participant-transaction-constants.js';

const PARTITION = 'retained-origin-unit';
const GENERATION_TABLE = '_partition_write_generation';
const TERM = '3';
const STAMP = Object.freeze({timestamp: new HLCTimestamp(1234, 0, 'node-a').toString(),
  proposedBy: 'origin-r1', proposedAt: 1234});
const ORIGIN = Object.freeze(buildGenerationOriginCommand(PARTITION, STAMP));

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  const store = new RaftRsDurableStore(db);
  openParticipantTransactionStore(db);
  store.putBootstrapAppliedState(PARTITION, {voters: ['1']},
    {bootstrapIndex: '0', admissionIndex: '0'});
  store.putHardState(PARTITION, {term: TERM, vote: '1', commit: '0'});
  return {db, store};
}

function history(store, commands, applied, commit) {
  store.appendEntries(PARTITION, commands.map((command, ordinal) => ({
    index: String(ordinal + 1), term: TERM, entryType: RAFT_RS_ENTRY_TYPE.NORMAL,
    ...(command === undefined ? {} :
      {data: Buffer.from(encodeProposal(command)).toString('base64')}),
  })));
  store.putHardState(PARTITION, {term: TERM, vote: '1', commit: String(commit)});
  store.putAppliedState(PARTITION, String(applied), {voters: ['1']});
}

function observe(db, partitionId = PARTITION) {
  const before = db.serialize();
  const result = readPartitionWriteOriginHistory(db, partitionId);
  assert.deepEqual(db.serialize(), before, 'observation performs no DDL, repair, apply or writes');
  assert.equal(db.inTransaction, false);
  assert.equal(Object.isFrozen(result), true);
  return result;
}

test('pre-origin is distinguished from committed-pending and locally uncommitted origin', async (t) => {
  const cases = [
    {name: 'pre-origin permits an existing legacy write count', commands: [undefined],
      applied: 1, commit: 1, state: STATE.PRE_ORIGIN, committed: [], local: []},
    {name: 'local proposal is not committed authority', commands: [undefined, ORIGIN],
      applied: 1, commit: 1, state: STATE.LOCAL_PENDING, committed: [], local: ['2']},
    {name: 'committed origin has not applied', commands: [undefined, ORIGIN],
      applied: 1, commit: 2, state: STATE.COMMITTED_PENDING, committed: ['2'], local: []},
    {name: 'committed and local repeats coexist', commands: [undefined, ORIGIN, ORIGIN],
      applied: 1, commit: 2, state: STATE.COMMITTED_PENDING, committed: ['2'], local: ['3']},
  ];
  for (const entry of cases) {
    await t.test(entry.name, (t) => {
      const {db, store} = fixture(t);
      history(store, entry.commands, entry.applied, entry.commit);
      advancePartitionWriteGeneration(db);
      const result = observe(db);
      assert.equal(result.state, entry.state);
      assert.equal(result.appliedOrigin, null);
      assert.equal(result.generation, '1', 'inspection never resets legacy generation');
      assert.deepEqual(result.committedPending.map(({index}) => index), entry.committed);
      assert.deepEqual(result.locallyUncommitted.map(({index}) => index), entry.local);
      assert.deepEqual(result.appliedCommands, []);
    });
  }
});

test('first applied origin survives legitimate repeated ENABLE commands in every range', (t) => {
  const {db, store} = fixture(t);
  const repeated = buildGenerationOriginCommand(PARTITION, {...STAMP, proposedAt: 1250});
  history(store, [ORIGIN, repeated, repeated, repeated], 2, 3);
  recordPartitionWriteOrigin(db, {index: 1, term: Number(TERM)});
  advancePartitionWriteGeneration(db);
  advancePartitionWriteGeneration(db);
  const result = observe(db);
  assert.equal(result.state, STATE.APPLIED);
  assert.deepEqual(result.appliedOrigin, {originIndex: '1', originTerm: TERM});
  assert.equal(result.generation, '2');
  assert.deepEqual(result.appliedCommands.map(({index}) => index), ['1', '2']);
  assert.deepEqual(result.committedPending.map(({index}) => index), ['3']);
  assert.deepEqual(result.locallyUncommitted.map(({index}) => index), ['4']);
  assert.throws(() => result.appliedOrigin.originIndex = '2', TypeError);
  assert.throws(() => result.committedPending[0].command.partitionId = 'other', TypeError);
});

test('other application commands stay unclassified beside a valid applied origin', (t) => {
  const {db, store} = fixture(t);
  const other = [{type: 'SQL', sql: 'UPDATE foundation SET value = 1'},
    {type: COMMAND.PREPARE, transactionId: 'unclassified-transaction'},
    {type: 'BATCH', events: [{operation: 'INSERT'}]}];
  history(store, [ORIGIN, ...other], 2, 3);
  recordPartitionWriteOrigin(db, {index: 1, term: Number(TERM)});
  const result = observe(db);
  assert.equal(result.state, STATE.APPLIED);
  assert.deepEqual(result.unclassifiedEntries.map(({command}) => command), other);
  assert.equal(Object.hasOwn(result, 'historyAccepted'), false);
});

test('canonical origin identity and exact producer fields are required', async (t) => {
  const corruptions = [
    ['foreign partition', {...ORIGIN, partitionId: 'foreign'}],
    ['foreign entry id', {...ORIGIN, entryId: 'foreign'}],
    ['extra SQL effect', {...ORIGIN, sql: 'DELETE FROM t'}],
    ['extra transaction field', {...ORIGIN, transactionId: 'foreign'}],
    ['missing stamp', {type: COMMAND.GENERATION_ORIGIN, partitionId: PARTITION,
      entryId: ORIGIN.entryId}],
    ['invalid HLC stamp', {...ORIGIN, timestamp: 'not-an-hlc'}],
    ['invalid proposed time', {...ORIGIN, proposedAt: -1}],
  ];
  for (const [name, command] of corruptions) {
    await t.test(name, (t) => {
      const {db, store} = fixture(t);
      history(store, [command], 0, 1);
      const result = observe(db);
      assert.equal(result.state, STATE.CONTRARY);
      assert.equal(result.reason, REASON.COMMAND);
    });
  }
});

test('applied native history and origin row must agree at the first exact position', async (t) => {
  const cases = [
    ['applied origin command without row', null, 1, [ORIGIN]],
    ['row before command applied', {index: 1, term: 3}, 0, [ORIGIN]],
    ['wrong native term', {index: 1, term: 2}, 1, [ORIGIN]],
    ['row names an idempotent repeat', {index: 2, term: 3}, 2, [ORIGIN, ORIGIN]],
    ['row without origin command', {index: 1, term: 3}, 1, [undefined]],
  ];
  for (const [name, row, applied, commands] of cases) {
    await t.test(name, (t) => {
      const {db, store} = fixture(t);
      history(store, commands, applied, commands.length);
      if (row !== null) recordPartitionWriteOrigin(db, row);
      const result = observe(db);
      assert.equal(result.state, STATE.CONTRARY);
      assert.equal(result.reason, REASON.POSITION);
    });
  }
});

test('half-null and malformed origin rows are contrary, not pre-origin', async (t) => {
  for (const mutation of ['origin_index = 1', 'origin_term = 3',
    'origin_index = 0, origin_term = 3', 'origin_index = 1, origin_term = 0',
    'origin_index = 1.5, origin_term = 3', 'generation = -1', 'generation = 1.5']) {
    await t.test(mutation, (t) => {
      const {db} = fixture(t);
      db.exec(`UPDATE ${GENERATION_TABLE} SET ${mutation}`);
      const result = observe(db);
      assert.equal(result.state, STATE.CONTRARY);
      assert.equal(result.reason, REASON.ROW);
    });
  }
});

test('missing origin observations stay unavailable and their cause is retained', async (t) => {
  for (const mutation of [`DROP TABLE ${GENERATION_TABLE}`,
    `DELETE FROM ${GENERATION_TABLE}`,
    `ALTER TABLE ${GENERATION_TABLE} DROP COLUMN origin_term`]) {
    await t.test(mutation, (t) => {
      const {db} = fixture(t);
      db.exec(mutation);
      const result = observe(db);
      assert.equal(result.state, STATE.UNAVAILABLE);
      assert.equal(result.reason, REASON.OBSERVATION);
      assert.ok(result.cause instanceof Error);
    });
  }
});

test('uncovered snapshot provenance and an open caller transaction cannot establish origin', (t) => {
  const {db, store} = fixture(t);
  history(store, [ORIGIN], 1, 1);
  recordPartitionWriteOrigin(db, {index: 1, term: Number(TERM)});
  store.putSnapshot(PARTITION, {metadata: {index: '1', term: TERM, confState: {voters: ['1']}}});
  assert.equal(observe(db).state, STATE.UNAVAILABLE);
  assert.equal(observe(db).reason, REASON.SNAPSHOT);
  db.transaction(() => {
    const before = db.serialize();
    assert.deepEqual(readPartitionWriteOriginHistory(db, PARTITION),
      {state: STATE.UNAVAILABLE, reason: REASON.TRANSACTION});
    assert.deepEqual(db.serialize(), before);
    assert.equal(db.inTransaction, true, 'the caller still owns its transaction');
  })();
});

test('native invalidity and a foreign group are explicit and retain their causes', (t) => {
  const {db, store} = fixture(t);
  history(store, [ORIGIN], 0, 1);
  const foreign = observe(db, 'foreign-group');
  assert.equal(foreign.state, STATE.UNAVAILABLE);
  assert.equal(foreign.cause.code, RAFT_RS_STORE_ERROR_CODE.RETAINED_HISTORY_UNAVAILABLE);
  db.exec(`UPDATE ${RAFT_RS_TABLE.HARD_STATE} SET commit_index = 2`);
  const invalid = observe(db);
  assert.equal(invalid.state, STATE.CONTRARY);
  assert.equal(invalid.cause.code, RAFT_RS_STORE_ERROR_CODE.RETAINED_HISTORY_INVALID);
});
