/**
 * TX1 (quest replicated-transaction-decision-and-apply) design revision 4,
 * section 8.1 item 2: the durable split/merge replay cursor mirrors only
 * entries whose committed-statement outcome is APPLIED. Measured over a real
 * rs-raft log (a lone-leader partition restarted over commands committed
 * through its own operation port, partition-rs-raft-restart-fixture.js), the
 * same surface durable-replay-cursor.test.js witnesses.
 *
 * RC1 is red on the sealed head through the existing mechanism (finding
 * F-MIR: loadDurableDeltasBehindWatermark returns a STATEMENT_FAILED entry).
 * RC2 is a new-surface red: the revision-4 transaction commands fail closed as
 * unrecognised before the reserved disposition can be observed. Revision 6
 * (round-5 nit N-J) adds the re-parked write: the same entryId is committed a
 * second time after the decision and must be mirrored exactly once.
 *
 * The four positive controls of the participant witnesses (controllable
 * port) live here since revision 6; they are green on the sealed head.
 */
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {loadDurableDeltasBehindWatermark} from
  '../../src/partition/partition-mirror-replay-cursor.js';
import {restartOverCommittedCommands} from './partition-rs-raft-restart-fixture.js';
import {
  INSERT_SQL,
  REPLICAS,
  ROW,
  TABLE as FIXTURE_TABLE,
  V3,
  applyCommitted,
  awaitProposal,
  decisionCommandOf,
  durableAppliedIndex,
  hasEntryId,
  identityOf,
  isOrdinaryWrite,
  ordinaryWriteOf,
  plantAppliedStateFailure,
  plantStorageFault,
  prepareCommandOf,
  removeAppliedStateFailure,
  removeStorageFault,
  rowCount,
  shutdownAll,
  startLeader,
  startReplica,
  statementState,
} from '../test-helpers/participant-transaction-fixture.js';

const PARTITION = 'users-p1';
const TABLE = 'users';
const SCHEMA = Object.freeze({columns: [
  {name: 'id', type: 'TEXT', primaryKey: true},
  {name: 'value', type: 'TEXT'},
]});
const INSERT = `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`;

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});
afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function insertCommand(id, entryId = `insert-${id}`) {
  return {entryId, type: PARTITION_SERVICE_OPERATION.INSERT, sql: INSERT,
    params: [id, `value-${id}`]};
}

// The entryIds the replay cursor would mirror after the first committed entry.
async function mirroredAfterFirst(commands) {
  let source = null;
  try {
    source = await restartOverCommittedCommands({partitionId: PARTITION, tableId: TABLE,
      tableName: TABLE, schema: SCHEMA}, commands);
    return {setupFailure: null, mirrored: loadDurableDeltasBehindWatermark(
      source.restarted, source.committed[0].index).map((delta) => delta.entryId)};
  } catch (error) {
    return {setupFailure: error?.message ?? String(error), mirrored: null};
  } finally {
    await source?.dispose();
  }
}

test('TX1 v4 RC1: a source entry whose statement failed deterministically is never mirrored',
  async () => {
    const facts = await mirroredAfterFirst([insertCommand('a'),
      insertCommand('a', 'dup-a'), insertCommand('b')]);
    assert.deepEqual(facts, {setupFailure: null, mirrored: ['insert-b']},
      'only entries with an APPLIED outcome row are mirrorable (finding F-MIR)');
  });

test('TX1 v4 RC2: a write refused by the reservation and the transaction commands are never ' +
  'mirrored; the re-parked write is mirrored once, from its applied entry', async () => {
  const tx = identityOf('rc2', {partitionId: PARTITION});
  // The write generation after the first applied insert is 1 (design 3.2).
  const prepare = prepareCommandOf(tx, [{entryId: 'op-x', sql: INSERT, params: ['x', 'v-x']}],
    1, PARTITION);
  const facts = await mirroredAfterFirst([insertCommand('a'), prepare,
    insertCommand('r', 'reserved-r'),
    decisionCommandOf(tx, V3.DECISION.ROLLBACK, prepare.preparedDigest),
    insertCommand('r', 'reserved-r'), insertCommand('c')]);
  assert.deepEqual(facts, {setupFailure: null, mirrored: ['reserved-r', 'insert-c']},
    'the cursor binds an APPLIED outcome to its own log index (round-5 N-J): the refused ' +
    'entry under the same entryId is not mirrored');
});

// --- positive controls (green on the sealed head; moved here from the participant file in
// revision 6 to keep that file inside jscpd's 1000-line cap) ---
test('control: an ordinary committed write applies exactly once and advances the applied index',
  async () => {
    const {leader, proposed} = await startLeader();
    try {
      const appliedBefore = durableAppliedIndex(leader);
      const pending = leader.insertData(FIXTURE_TABLE, {...ROW});
      const entry = await awaitProposal(proposed, isOrdinaryWrite);
      assert.ok(entry, 'the write is proposed while its request is pending');
      assert.equal(rowCount(leader), 0, 'an ordinary write is not visible before its commit');
      leader.controllablePort.commit(entry);
      assert.equal((await pending).success, true, 'the proposer is answered after application');
      assert.equal(rowCount(leader), 1, 'the committed write applies once');
      assert.equal(durableAppliedIndex(leader), appliedBefore + 1, 'the applied index advances');
    } finally {
      await shutdownAll(leader);
    }
  });

test('control: a planted applied-state failure leaves an ordinary write unapplied, unrecorded ' +
  'and the applied index unchanged', async () => {
  const replica = await startReplica(REPLICAS[1]);
  try {
    const appliedBefore = durableAppliedIndex(replica);
    plantAppliedStateFailure(replica.db);
    const failed = applyCommitted(replica, ordinaryWriteOf('control-planted', ROW));
    removeAppliedStateFailure(replica.db);
    assert.deepEqual({failed, rows: rowCount(replica),
      statement: statementState(replica, 'control-planted'),
      appliedAdvance: durableAppliedIndex(replica) - appliedBefore},
    {failed: 'SQLITE_CONSTRAINT_TRIGGER', rows: 0, statement: 'unsettled', appliedAdvance: 0},
    'the statement and its outcome row roll back with the applied state');
  } finally {
    await shutdownAll(replica);
  }
});

test('control: a single-replica storage failure on an ordinary write is the host failure: ' +
  'nothing recorded, applied index unchanged', async () => {
  const replica = await startReplica(REPLICAS[1]);
  try {
    const appliedBefore = durableAppliedIndex(replica);
    plantStorageFault(replica.db);
    const failed = applyCommitted(replica, ordinaryWriteOf('control-storage', ROW));
    removeStorageFault(replica.db);
    const facts = {failed, statement: statementState(replica, 'control-storage'),
      appliedAdvance: durableAppliedIndex(replica) - appliedBefore};
    facts.redelivered = applyCommitted(replica, ordinaryWriteOf('control-storage', ROW));
    facts.rows = rowCount(replica);
    assert.deepEqual(facts, {failed: 'partition_committed_statement_environment_failed',
      statement: 'unsettled', appliedAdvance: 0, redelivered: null, rows: 1},
    'an environmental failure fails the application closed and re-applies once');
  } finally {
    await shutdownAll(replica);
  }
});

test('control: an ordinary write carries its SQL verbatim and answers the lastInsertRowid of ' +
  'its own committed apply (the class transaction operations inherit)', async () => {
  const {leader, proposed} = await startLeader();
  try {
    const pending = leader.executeQuery(INSERT_SQL, [ROW.id, ROW.value],
      {entryId: 'control-parity'});
    const entry = await awaitProposal(proposed, hasEntryId('control-parity'));
    assert.deepEqual({sql: entry?.sql, params: entry?.params},
      {sql: INSERT_SQL, params: [ROW.id, ROW.value]}, 'the entry carries the statement verbatim');
    leader.controllablePort.commit(entry);
    const answer = await pending;
    const appliedRowid = leader.db.prepare('SELECT rowid AS rowid FROM test_table WHERE id = ?')
      .get(ROW.id).rowid;
    assert.deepEqual({rowid: answer.lastInsertRowid === appliedRowid,
      statement: statementState(leader, 'control-parity')}, {rowid: true, statement: 'settled'},
    'the answer is the apply\'s own result and its outcome row is settled for a replay');
  } finally {
    await shutdownAll(leader);
  }
});
