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
 * second time after the decision and must be mirrored exactly once; revision 7
 * (round-6 N6-5) puts an applied write between the decision and the re-parked
 * entry, so only a cursor bound to the outcome row's log index passes.
 *
 * Also here, because the participant file is at jscpd's 1000-line cap: the
 * statement-classifier witnesses W6n, W6s, W6p and W6r (design revision 7,
 * section 3.3), named with the participant prefix 'TX1 v3', and the four
 * positive controls (controllable port), green on the sealed head.
 */
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {loadDurableDeltasBehindWatermark} from
  '../../src/partition/partition-mirror-replay-cursor.js';
import {restartOverCommittedCommands} from './partition-rs-raft-restart-fixture.js';
import {
  INSERT_SQL,
  OTHER_ROW,
  REPLICAS,
  ROW,
  SCRATCH_TABLE,
  TABLE as FIXTURE_TABLE,
  V3,
  applyCommitted,
  awaitProposal,
  beginMessage,
  classifierRefusalCases,
  committedQueryOf,
  connectionFlag,
  decisionCommandOf,
  durableAppliedIndex,
  hasEntryId,
  identityOf,
  isOrdinaryWrite,
  isPrepareCommand,
  onTwoReplicas,
  ordinaryWriteOf,
  pick,
  plantAppliedStateFailure,
  plantRowidCeiling,
  plantStorageFault,
  prepareCommandOf,
  prepareMessage,
  queryMessage,
  removeAppliedStateFailure,
  removeStorageFault,
  rowCount,
  rowidRefusalCases,
  send,
  settleTicks,
  shutdownAll,
  startLeader,
  startReplica,
  statementOutcomeOf,
  statementState,
  tableExists,
  track,
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
    decisionCommandOf(tx, V3.DECISION.ROLLBACK, prepare.preparedDigest), insertCommand('c'),
    insertCommand('r', 'reserved-r')]);
  assert.deepEqual(facts, {setupFailure: null, mirrored: ['insert-c', 'reserved-r']},
    'the cursor binds an APPLIED outcome to its own log index (round-5 N-J): the refused ' +
    'entry under the same entryId is not mirrored');
});

// --- the statement classifier (moved here from the participant file in revision 7, which
// adds W6p and W6r; the names keep the participant prefix 'TX1 v3') ---
const LAYER = V3.CLASSIFIER_LAYER;
const refusalOf = (answer) => pick(answer, ['failureCode', 'refusalLayer']);
// A request answered within the settle window, or 'pending' (nothing is ever committed
// here, so a proposed write stays pending).
async function answeredOrPending(promise) {
  const tracked = track(promise);
  await settleTicks();
  return tracked.settled ? refusalOf(tracked.value) : 'pending';
}

test('TX1 v3 W6n: the staging classifier refuses by default, each case at its own layer: ' +
  'date/time, random and unknown functions, implicit keys, non-JSON params, and replica-local ' +
  'state read through no function (pragmas, virtual tables, rs-raft, schema and temporary ' +
  'tables, PRAGMA and VALUES heads) never stage', async () => {
  const tx = identityOf('a11n');
  const {leader, proposed} = await startLeader();
  try {
    leader.db.exec(`CREATE TEMP TABLE ${SCRATCH_TABLE} (id TEXT, value TEXT)`);
    await send(leader, beginMessage(tx));
    const refusals = [];
    for (const [sql, params] of classifierRefusalCases()) {
      refusals.push(refusalOf(await send(leader, queryMessage(tx, sql, params))));
    }
    const blob = pick(await send(leader, queryMessage(tx, INSERT_SQL, ['n12', Buffer.from('b')])),
      ['failureCode']);
    const allowed = await send(leader, queryMessage(tx,
      `INSERT INTO ${FIXTURE_TABLE} (id, value) VALUES (?, upper(?))`, ['up', 'x']));
    await send(leader, queryMessage(tx, INSERT_SQL, [ROW.id, ROW.value]));
    track(send(leader, prepareMessage(tx)));
    const prepareCommand = await awaitProposal(proposed, isPrepareCommand);
    assert.deepEqual({refusals, blob, allowed: allowed?.success === true,
      reverseUnorderedSelects: connectionFlag(leader),
      sealedOperations: prepareCommand ? JSON.parse(prepareCommand.operationsText).length : null},
    {refusals: classifierRefusalCases().map(([, , layer]) =>
      ({failureCode: V3.CODE.SESSION_WRITE_NONDETERMINISTIC, refusalLayer: layer})),
    blob: {failureCode: V3.CODE.SESSION_WRITE_PARAM_UNSUPPORTED}, allowed: true,
    reverseUnorderedSelects: 0, sealedOperations: 2},
    'only allow-listed programs over the partition\'s own table with JSON scalars stage');
  } finally {
    await shutdownAll(leader);
  }
});

test('TX1 v3 W6s: the leader\'s self-check refuses random(), an rs-raft table read, a ' +
  'table-valued pragma, a PRAGMA statement, a temporary-schema read and an implicit-key insert, ' +
  'each at its own layer; a failed self-check refuses every transaction, typed', async () => {
  const determinism = await import(V3.DETERMINISM_MODULE).catch(() => null);
  const {leader} = await startLeader();
  const failing = await startLeader({determinismSelfCheck: () => ({passed: false, cases: []})});
  try {
    const selfCheck = (classify) => determinism?.runDeterminismSelfCheck?.(leader.db,
      {tableName: FIXTURE_TABLE, ...(classify ? {classify} : {})}) ?? null;
    const passing = selfCheck();
    const facts = {module: determinism ? 'present' : 'absent', passed: passing?.passed ?? null,
      cases: passing?.cases?.map((entry) => pick(entry, ['name', 'admitted', 'layer'])) ?? null,
      admitAll: selfCheck(() => ({admitted: true, layer: null}))?.passed ?? null,
      begin: pick(await send(failing.leader, beginMessage(identityOf('a11s'))),
        ['success', 'failureCode'])};
    const refused = (name, at) => ({name, admitted: false, layer: at});
    assert.deepEqual(facts, {module: 'present', passed: true, cases: [
      refused('random', LAYER.FUNCTION), refused('raft_log_read', LAYER.ROOT_PAGE),
      refused('pragma_table_valued', LAYER.OPCODE),
      refused('pragma_statement', LAYER.STATEMENT_KIND),
      refused('temp_schema_read', LAYER.DATABASE),
      refused('implicit_key_insert', LAYER.IMPLICIT_KEY),
      {name: 'partition_table_read', admitted: true, layer: null}], admitAll: false,
    begin: {success: false, failureCode: V3.CODE.DETERMINISM_SELF_CHECK_FAILED}},
    'each probed layer refuses at its own place on the running binary before anything stages');
  } finally {
    await shutdownAll(leader, failing.leader);
  }
});

test('TX1 v3 W6p: the statement-kind layer runs before any prepare on the query wire: a ' +
  'sessionless PRAGMA or DROP proposes nothing and leaves the connection unchanged, index DDL ' +
  'still proposes, and a committed PRAGMA or DROP is refused identically at apply',
async () => {
  const {leader, proposed} = await startLeader();
  try {
    const wire = (sql) => send(leader, {type: PARTITION_SERVICE_MESSAGE_TYPE.QUERY, sql,
      params: []});
    const facts = {pragma: await answeredOrPending(wire('PRAGMA reverse_unordered_selects = 1')),
      drop: await answeredOrPending(leader.executeQuery(`DROP TABLE ${FIXTURE_TABLE}`, [])),
      index: await answeredOrPending(leader.executeQuery(
        `CREATE INDEX IF NOT EXISTS tx1_w6p_value ON ${FIXTURE_TABLE}(value)`, []))};
    facts.leader = {flag: connectionFlag(leader), table: tableExists(leader),
      proposed: proposed.map((entry) => String(entry.sql).split(' ')[0])};
    facts.applied = await onTwoReplicas(async (replica) => {
      const applies = [applyCommitted(replica,
        committedQueryOf('w6p-pragma', 'PRAGMA reverse_unordered_selects = 1')),
      applyCommitted(replica, committedQueryOf('w6p-drop', `DROP TABLE ${FIXTURE_TABLE}`))];
      return {applies, flag: connectionFlag(replica), table: tableExists(replica),
        outcomes: [statementOutcomeOf(replica, 'w6p-pragma'),
          statementOutcomeOf(replica, 'w6p-drop')]};
    });
    const refusedKind = {failureCode: V3.CODE.WRITE_STATEMENT_REFUSED,
      refusalLayer: LAYER.STATEMENT_KIND};
    const refusedAtApply = {outcome: 'statement_failed',
      failureCode: V3.CODE.WRITE_STATEMENT_REFUSED};
    const applied = {applies: [null, null], flag: 0, table: 1,
      outcomes: [refusedAtApply, refusedAtApply]};
    assert.deepEqual(facts, {pragma: refusedKind, drop: refusedKind, index: 'pending',
      leader: {flag: 0, table: 1, proposed: ['CREATE']}, applied: [applied, applied]},
    'nothing but an admitted head is ever prepared on the shared connection, on any path');
  } finally {
    await shutdownAll(leader);
  }
});

test('TX1 v3 W6r: rowid-alias writes, order-dependent session writes and writes at the rowid ' +
  'ceiling are refused typed on the session and ordinary paths, and an ordinary insert at the ' +
  'ceiling is refused identically at apply', async () => {
  const tx = identityOf('a11r');
  const {leader, proposed} = await startLeader();
  try {
    await send(leader, beginMessage(tx));
    const session = async (sql, params) =>
      refusalOf(await send(leader, queryMessage(tx, sql, params)));
    const facts = {session: []};
    for (const [sql, params] of rowidRefusalCases()) {
      facts.session.push(await session(sql, params));
    }
    const [aliasInsert, aliasParams] = rowidRefusalCases()[0];
    facts.ordinaryAlias = await answeredOrPending(leader.executeQuery(aliasInsert, aliasParams,
      {entryId: 'w6r-alias'}));
    plantRowidCeiling(leader);
    facts.sessionCeiling = await session(INSERT_SQL, [ROW.id, ROW.value]);
    facts.ordinaryCeiling = await answeredOrPending(leader.executeQuery(INSERT_SQL,
      [OTHER_ROW.id, OTHER_ROW.value], {entryId: 'w6r-ceiling'}));
    facts.proposed = proposed.filter((entry) => /^w6r-/u.test(String(entry.entryId))).length;
    facts.applied = await onTwoReplicas(async (replica) => {
      plantRowidCeiling(replica);
      const apply = applyCommitted(replica, ordinaryWriteOf('w6r-apply', ROW));
      return {apply, outcome: statementOutcomeOf(replica, 'w6r-apply'),
        rows: rowCount(replica, ROW.id)};
    });
    const nondeterministic = (layer) => ({failureCode: V3.CODE.SESSION_WRITE_NONDETERMINISTIC,
      refusalLayer: layer});
    const ordinary = (layer) => ({failureCode: V3.CODE.WRITE_STATEMENT_REFUSED,
      refusalLayer: layer});
    const applied = {apply: null, outcome: {outcome: 'statement_failed',
      failureCode: V3.CODE.WRITE_STATEMENT_REFUSED}, rows: 0};
    assert.deepEqual(facts, {session: rowidRefusalCases().map(([, , layer]) =>
      nondeterministic(layer)), ordinaryAlias: ordinary(LAYER.ROWID_ALIAS),
    sessionCeiling: nondeterministic(LAYER.ROWID_CEILING),
    ordinaryCeiling: ordinary(LAYER.ROWID_CEILING), proposed: 0, applied: [applied, applied]},
    'no replicated write can assign a rowid or reach the random-rowid fallback');
  } finally {
    await shutdownAll(leader);
  }
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
