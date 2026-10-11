/**
 * TX1 (quest replicated-transaction-decision-and-apply) participant increment
 * 2: witnesses of the statement-admission owner
 * (src/partition/partition-statement-admission.js) beyond the sealed sibling
 * file's W6p/W6r/W6r-b (partition-transaction-replay-cursor-v4.test.js).
 *
 * A1: the leader-side ceiling check before a proposal reads committed state
 * only. HEAD's session staging holds a SQLite transaction across requests on
 * the shared connection, so its staged rows are uncommitted state there: an
 * early refusal from them would refuse a write the committed state admits.
 * The apply-side checks (the ceiling before and after the statement) stay
 * the authority on every replica. The precondition is HEAD's staging; the
 * session increment that replaces it re-expresses this witness.
 *
 * A2: a committed statement's outcome row retains no connection state. The
 * connection's last insert rowid is whatever last inserted on it: an rs-raft
 * log append on the shared connection, an unreplicated local write, a
 * rolled-back allocation. Only a statement that inserted rows retains it.
 *
 * A3-A11 answer the independent review of increment 2 (its B1-B4, O1-O3 and
 * N1), each on the ordinary path, on the request path and identically at
 * apply on two replicas: single-quoted names, a repeated key column and
 * compound VALUES sources (A3, and on a real three-replica group A4); the
 * function rule (A5) and the own-table rule (A6); a settled re-delivery
 * answered before admission (A7); OR ROLLBACK (A8); every R1/R2 branch (A9)
 * and every routed path (A10); the apply-side refusal layer (A11).
 */
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {RAFT_OPERATION_PORT_REQUEST} from '../../src/raft/raft-operation-port-request.js';
import {PARTITION_SERVICE_OPERATION} from '../../src/partition/partition-service-constants.js';
import {readAdmittedPartitionRows} from '../../src/partition/partition-statement-admission.js';
import Database from 'better-sqlite3';
import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {
  INSERT_SQL,
  INT64_MAX,
  IPK_SCHEMA,
  REPLICAS,
  TABLE,
  V3,
  alterCommandOf,
  applyCommitted,
  awaitProposal,
  beginMessage,
  committedQueryOf,
  connectionFlag,
  durableAppliedIndex,
  hasEntryId,
  onTwoReplicas,
  identityOf,
  pick,
  queryMessage,
  rowidsOf,
  send,
  settleTicks,
  shutdownAll,
  startLeader,
  startReplica,
  statementOutcomeOf,
  track,
} from '../test-helpers/participant-transaction-fixture.js';

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

const CEILING = 2n ** 62n;
const TOP_THEN_ALLOCATE = `INSERT INTO ${TABLE} (id, value) ` +
  `VALUES (${INT64_MAX}, 'top'), (NULL, 'x')`;
const KEYED_REPLACE = `INSERT OR REPLACE INTO ${TABLE} (id, value) VALUES (?, ?)`;
const REFUSED_AT_APPLY = Object.freeze({outcome: 'statement_failed',
  failureCode: V3.CODE.WRITE_STATEMENT_REFUSED});
const APPLIED = Object.freeze({outcome: 'applied', failureCode: null});
const LAYER = V3.CLASSIFIER_LAYER;

// What the leader answered within the settle window: 'proposed' while the
// write awaits its commit, else the typed refusal.
async function leaderAnswer(leader, [entryId, sql, params]) {
  const answer = track(leader.executeQuery(sql, params, {entryId}));
  await settleTicks();
  return answer.settled ?
    pick(answer.value, ['failureCode', 'refusalLayer']) : 'proposed';
}

test('TX1 admission A1: while a session holds staged rows at 2^62 and 2^63-1 on the ' +
  'leader\'s connection, sessionless allocating writes are proposed (the leader-side ' +
  'ceiling check reads committed state only) and the text rules still refuse; the ' +
  'apply-side checks refuse an allocating statement at the ceiling on every replica',
async () => {
  // The last proposal would fail its own key constraint if it ran: at a
  // committed ceiling the apply refuses it before it runs.
  const writes = [['adm-a1-replace', KEYED_REPLACE, [8, 'eight']],
    ['adm-a1-top', TOP_THEN_ALLOCATE, []],
    ['adm-a1-replace-text', KEYED_REPLACE, ['9', 'nine']],
    ['adm-a1-dup', INSERT_SQL, [8, 'again']],
    ['adm-a1-null', KEYED_REPLACE, [null, 'null']]];
  const atCeiling = ['adm-a1-replace-text', 'adm-a1-dup'];
  const {leader, proposed} = await startLeader({schema: IPK_SCHEMA});
  const facts = {staged: [], wire: []};
  try {
    const tx = identityOf('adm-a1');
    await send(leader, beginMessage(tx));
    for (const key of [2 ** 62, String(INT64_MAX)]) {
      facts.staged.push((await send(leader, queryMessage(tx, INSERT_SQL,
        [key, 'staged']))).success);
    }
    facts.sessionHoldsConnection = leader.db.inTransaction;
    for (const write of writes) {
      facts.wire.push(await leaderAnswer(leader, write));
    }
  } finally {
    await shutdownAll(leader);
  }
  const entries = new Map(proposed.map((entry) => [entry.entryId, entry]));
  facts.proposed = [...entries.keys()];
  facts.applied = [];
  for (const replicaId of [REPLICAS[1], REPLICAS[2]]) {
    const replica = await startReplica(replicaId, {schema: IPK_SCHEMA});
    try {
      const applies = ['adm-a1-replace', 'adm-a1-top'].map((entryId) =>
        applyCommitted(replica, entries.get(entryId)));
      // Committed state at the ceiling (legacy state the pre-check refuses).
      replica.db.prepare(`INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`)
        .run(CEILING, 'committed');
      applies.push(...atCeiling.map((entryId) =>
        applyCommitted(replica, entries.get(entryId))));
      facts.applied.push({applies, rowids: rowidsOf(replica), outcomes:
        ['adm-a1-replace', 'adm-a1-top', ...atCeiling].map((entryId) =>
          statementOutcomeOf(replica, entryId))});
    } finally {
      await shutdownAll(replica);
    }
  }
  const atApply = {applies: [null, null, null, null], rowids: ['8', String(CEILING)],
    outcomes: [APPLIED, REFUSED_AT_APPLY, REFUSED_AT_APPLY, REFUSED_AT_APPLY]};
  assert.deepEqual(facts, {staged: [true, true], sessionHoldsConnection: true,
    wire: ['proposed', 'proposed', 'proposed', 'proposed', {
      failureCode: V3.CODE.WRITE_STATEMENT_REFUSED,
      refusalLayer: LAYER.ROWID_ALLOCATION}],
    proposed: ['adm-a1-replace', 'adm-a1-top', ...atCeiling],
    applied: [atApply, atApply]},
  'uncommitted session rows never refuse a proposal; committed state and the ' +
  'statement\'s own effect decide at apply, identically');
});

// The outcome rows a replica retains, every column, exact integers as text.
const outcomeRows = (replica) => replica.db.prepare(
  'SELECT * FROM _partition_statement_outcomes ORDER BY log_index')
  .safeIntegers(true).all().map((row) => Object.fromEntries(Object.entries(row)
    .map(([column, value]) => [column, value === null ? null : String(value)])));

// A different non-replicated insert on each replica's connection: on the
// first, the owner's own rolled-back allocation on the local path (a random
// rowid); on the second, an rs-raft log append (the durable store shares the
// partition connection).
async function disturbConnection(replica, which, ordinal) {
  if (which === 0) {
    return (await replica.executeLocalQuery(TOP_THEN_ALLOCATE, [])).refusalLayer;
  }
  const groupId = replica.controllablePort.request[RAFT_OPERATION_PORT_REQUEST.GROUP_ID];
  new RaftRsDurableStore(replica.db).appendEntries(groupId,
    [{index: String(1000 + ordinal), term: '1', entryType: 0, data: null}]);
  return 'log_append';
}

test('TX1 admission A2: a ceiling refusal and non-replicated inserts on each replica\'s ' +
  'connection, followed by an UPDATE, a DELETE and an ignored INSERT, leave ' +
  'byte-identical outcome rows on two replicas; an INSERT outcome still carries its ' +
  'own rowid', async () => {
  const statements = [['a2-seed', `INSERT INTO ${TABLE} (id, value) VALUES (1, 'a'), (2, 'b')`],
    ['a2-ceiling', TOP_THEN_ALLOCATE], ['a2-update', `UPDATE ${TABLE} SET value = 'u' WHERE id = 1`],
    ['a2-delete', `DELETE FROM ${TABLE} WHERE id = 2`],
    ['a2-ignored', `INSERT OR IGNORE INTO ${TABLE} (id, value) VALUES (1, 'dup')`],
    ['a2-later', `INSERT INTO ${TABLE} (id, value) VALUES (3, 'c')`]];
  const disturbedBefore = new Set(['a2-update', 'a2-delete', 'a2-ignored']);
  const perReplica = [];
  for (const [which, replicaId] of [REPLICAS[1], REPLICAS[2]].entries()) {
    const replica = await startReplica(replicaId, {schema: IPK_SCHEMA});
    try {
      const facts = {applies: [], disturbed: []};
      for (const [entryId, sql] of statements) {
        if (disturbedBefore.has(entryId)) {
          facts.disturbed.push(await disturbConnection(replica, which, facts.applies.length));
        }
        facts.applies.push(applyCommitted(replica, committedQueryOf(entryId, sql)));
      }
      facts.rows = outcomeRows(replica);
      perReplica.push(facts);
    } finally {
      await shutdownAll(replica);
    }
  }
  const [first, second] = perReplica;
  assert.deepEqual({
    disturbed: perReplica.map((facts) => facts.disturbed),
    applies: perReplica.map((facts) => facts.applies),
    identicalRows: JSON.stringify(first.rows) === JSON.stringify(second.rows),
    retained: first.rows.map((row) => [row.entry_key, row.changes, row.last_insert_rowid]),
  }, {
    disturbed: [Array(3).fill(LAYER.ROWID_CEILING), Array(3).fill('log_append')],
    applies: [Array(6).fill(null), Array(6).fill(null)],
    identicalRows: true,
    retained: [['entry:a2-seed', '2', '2'], ['entry:a2-ceiling', null, null],
      ['entry:a2-update', '1', null], ['entry:a2-delete', '1', null],
      ['entry:a2-ignored', '0', null], ['entry:a2-later', '1', '3']],
  }, 'a statement retains its own result, never what last inserted on the connection');
});

// --- the review of increment 2 (B1-B4, O1-O3, N1) ---

// The three rules the repair adds (pinned values).
const RULE = Object.freeze({FUNCTION: 'statement_function', TABLE: 'statement_table',
  CONFLICT: 'statement_conflict'});
const refusedAs = (refusalLayer) => ({failureCode: V3.CODE.WRITE_STATEMENT_REFUSED,
  refusalLayer});
const SEED_A = ['seed-a', `INSERT INTO ${TABLE} (id, value) VALUES ('a', 'seed')`];
const keyRow = (key, value) => `${key}|${key}|${value}`;

// Every row a replica holds as `rowid|id|value`, exact integers as text.
const rowsOf = (replica) => replica.db.prepare(
  `SELECT rowid AS r, id, value FROM ${TABLE} ORDER BY rowid`).safeIntegers(true).all()
  .map((row) => `${row.r}|${row.id}|${row.value}`);

// Each case ({entryId, schema, seed, sql, params, layer, rows}) on the request
// path of a leader of its schema (nothing committed there), and committed
// after its seed on two fresh replicas: the answer, then per replica the
// case's outcome and the rows left. `layer` null means admitted.
async function caseFacts(cases) {
  const leaders = new Map();
  const facts = [];
  try {
    for (const c of cases) {
      if (!leaders.has(c.schema)) {
        leaders.set(c.schema, (await startLeader(c.schema ? {schema: c.schema} : {})).leader);
      }
      const wire = await leaderAnswer(leaders.get(c.schema),
        [`${c.entryId}-wire`, c.sql, c.params ?? []]);
      const replicas = [];
      for (const replicaId of [REPLICAS[1], REPLICAS[2]]) {
        const replica = await startReplica(replicaId, c.schema ? {schema: c.schema} : {});
        try {
          for (const [entryId, sql, params = []] of [...(c.seed ?? []),
            [c.entryId, c.sql, c.params ?? []]]) {
            applyCommitted(replica, {...committedQueryOf(entryId, sql), params});
          }
          replicas.push({outcome: statementOutcomeOf(replica, c.entryId), rows: rowsOf(replica)});
        } finally {
          await shutdownAll(replica);
        }
      }
      facts.push({entryId: c.entryId, wire, replicas});
    }
  } finally {
    await shutdownAll(...leaders.values());
  }
  return facts;
}
const expectedFacts = (cases) => cases.map((c) => {
  const atApply = {outcome: c.layer ? REFUSED_AT_APPLY : APPLIED, rows: c.rows};
  return {entryId: c.entryId, wire: c.layer ? refusedAs(c.layer) : 'proposed',
    replicas: [atApply, atApply]};
});

const B1_CASES = [
  {entryId: 'b1-string-rowid-column', sql: `INSERT OR REPLACE INTO ${TABLE} ('rowid', id, ` +
    `value) VALUES (${INT64_MAX}, 'a', 'top'), (NULL, 'n', 'new'), (5, 'a', 'low')`,
  layer: LAYER.ROWID_ALIAS, rows: []},
  {entryId: 'b1-string-rowid-target', seed: [SEED_A], sql: `INSERT INTO ${TABLE} (id, value) ` +
    'VALUES (\'a\', \'top\'), (\'n\', \'new\'), (\'a\', \'low\') ON CONFLICT (id) DO UPDATE ' +
    `SET 'rowid' = CASE WHEN excluded.value = 'top' THEN ${INT64_MAX} ELSE 5 END`,
  layer: LAYER.ROWID_ALIAS, rows: ['1|a|seed']},
  {entryId: 'b1-string-key-target', schema: IPK_SCHEMA, sql: `INSERT INTO ${TABLE} (id, value) ` +
    `VALUES (${INT64_MAX}, 'top'), (NULL, 'new'), (${INT64_MAX}, 'low') ON CONFLICT (id) ` +
    'DO UPDATE SET \'id\' = 5', layer: LAYER.ROWID_ALLOCATION, rows: []},
  {entryId: 'b1-repeated-key-column', schema: IPK_SCHEMA, sql: `INSERT INTO ${TABLE} (id, ` +
    `value, id) VALUES (0, 'top', ${INT64_MAX}), (0, 'new', NULL), (0, 'low', ${INT64_MAX}) ` +
    'ON CONFLICT (id) DO UPDATE SET id = 5', layer: LAYER.ROWID_ALLOCATION, rows: []},
  {entryId: 'b1-string-rowid-update', seed: [SEED_A], sql: `UPDATE ${TABLE} SET 'rowid' = ` +
    `${INT64_MAX} WHERE id = 'a'`, layer: LAYER.ROWID_ALIAS, rows: ['1|a|seed']},
  {entryId: 'b1-qualified-string-insert', seed: [SEED_A], sql: `INSERT INTO ${TABLE} (id, ` +
    `value) SELECT 'q', ${TABLE}.'rowid' FROM ${TABLE}`, layer: LAYER.ROWID_ALIAS,
  rows: ['1|a|seed']},
  {entryId: 'b1-qualified-string-update', seed: [SEED_A], sql: `UPDATE ${TABLE} SET value = ` +
    `${TABLE}.'oid' WHERE id = 'a'`, layer: LAYER.ROWID_ALIAS, rows: ['1|a|seed']},
  {entryId: 'b1-compound-values', schema: IPK_SCHEMA, sql: `INSERT INTO ${TABLE} (id, value) ` +
    `VALUES (${INT64_MAX}, 'top') UNION ALL VALUES (NULL, 'new') UNION ALL VALUES ` +
    `(${INT64_MAX}, 'low') ON CONFLICT (id) DO UPDATE SET id = 5`,
  layer: LAYER.ROWID_ALLOCATION, rows: []},
  {entryId: 'b1-compound-select', schema: IPK_SCHEMA, sql: `INSERT OR REPLACE INTO ${TABLE} ` +
    '(id, value) VALUES (5, \'a\') UNION ALL SELECT NULL, \'b\'',
  layer: LAYER.ROWID_ALLOCATION, rows: []},
  {entryId: 'b1-last-mention-null', schema: IPK_SCHEMA, sql: `INSERT OR REPLACE INTO ${TABLE} ` +
    '(id, value, id) VALUES (5, \'x\', NULL)', layer: LAYER.ROWID_ALLOCATION, rows: []},
  // SQLite keys the row by the key's LAST mention: an explicit one.
  {entryId: 'b1-last-mention-explicit', schema: IPK_SCHEMA, sql: 'INSERT OR REPLACE INTO ' +
    `${TABLE} (id, value, id) VALUES (NULL, 'x', 5)`, layer: null, rows: [keyRow(5, 'x')]},
];

test('TX1 admission A3: single-quoted names (a column list, an UPDATE or DO UPDATE ' +
  'target), a repeated key column and compound VALUES sources are read as SQLite reads ' +
  'them: each is refused on the request path and identically at apply on two replicas; ' +
  'the key\'s explicit last mention applies', async () => {
  assert.deepEqual(await caseFacts(B1_CASES), expectedFacts(B1_CASES),
    'no replica allocates a random rowid or key through a name SQLite reads differently');
});

// The real group's applied index, read from a replica's database file.
function appliedIndexOf(group, member, partitionId) {
  const db = new Database(group.dbFileOf(member), {readonly: true});
  try {
    return Number(RaftRsDurableStore.readAppliedIndexIn(db, partitionId));
  } finally {
    db.close();
  }
}
// A replica's rows and outcome rows, read from its database file.
function groupStateOf(group, member) {
  const db = new Database(group.dbFileOf(member), {readonly: true});
  try {
    return {rows: rowsOf({db}), outcomes: outcomeRows({db})};
  } finally {
    db.close();
  }
}

test('TX1 admission A4: on a real three-replica group the B1 shapes are refused on the ' +
  'leader\'s request path (nothing proposed) and, delivered through the forward-write ' +
  'ingress, refused identically at apply on every replica; an explicit-key REPLACE ' +
  'applies identically', {timeout: 120000}, async () => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'admission-group'},
    raft: {heartbeatIntervalMs: 20, electionTimeoutMinMs: 150, electionTimeoutMaxMs: 300}});
  LoggingService.getInstance().initialize({level: 'error'});
  const partitionId = 'adm-a4';
  const members = [1, 2, 3].map((n) => [`${partitionId}-r${n}`, `node-${n}`]);
  const group = await formAdmittedGroup({partitionId, members, tempPrefix: 'tx1-admission-',
    serviceOptions: {tableId: TABLE, tableName: TABLE, schema: IPK_SCHEMA}, budgetMs: 8000});
  const shapes = [...B1_CASES.filter((c) => c.schema === IPK_SCHEMA && c.layer !== null),
    {entryId: 'a4-string-rowid', sql: `INSERT OR REPLACE INTO ${TABLE} ('rowid', value) ` +
      `VALUES (${INT64_MAX}, 'top'), (NULL, 'new')`, layer: LAYER.ROWID_ALIAS}];
  const fields = ['success', 'failureCode', 'refusalLayer'];
  const facts = {wire: [], ingress: []};
  try {
    const leader = group.services[0];
    const before = appliedIndexOf(group, members[0], partitionId);
    for (const shape of shapes) {
      facts.wire.push(pick(await leader.executeQuery(shape.sql, [],
        {entryId: `${shape.entryId}-wire`}), fields));
    }
    facts.proposedByWire = appliedIndexOf(group, members[0], partitionId) - before;
    for (const shape of shapes) {
      facts.ingress.push(pick(await leader.applyWrite({type: PARTITION_SERVICE_OPERATION.QUERY,
        sql: shape.sql, params: [], entryId: shape.entryId}), fields));
    }
    facts.explicit = pick(await leader.executeQuery(KEYED_REPLACE, [5, 'five'],
      {entryId: 'a4-explicit'}), ['success']);
    const target = appliedIndexOf(group, members[0], partitionId);
    facts.settled = await group.waitFor(() => members.every((member) =>
      appliedIndexOf(group, member, partitionId) >= target));
    const states = members.map((member) => groupStateOf(group, member));
    facts.identical = states.every((state) => JSON.stringify(state) === JSON.stringify(states[0]));
    facts.rows = states[0].rows;
    facts.refusedRows = states[0].outcomes.filter((row) =>
      row.failure_code === V3.CODE.WRITE_STATEMENT_REFUSED).length;
  } finally {
    await group.dispose();
  }
  const refusals = shapes.map((shape) => ({success: false, ...refusedAs(shape.layer)}));
  assert.deepEqual(facts, {wire: refusals, proposedByWire: 0, ingress: refusals,
    explicit: {success: true}, settled: true, identical: true, rows: [keyRow(5, 'five')],
    refusedRows: shapes.length},
  'every replica refuses alike and holds the same rows and outcome rows');
});

test('TX1 admission A5: a table-valued pragma function and a connection-state function are ' +
  'refused on every path before anything runs, reads included; after the refused ' +
  'pragma_optimize read the review\'s p5/p19 schedules leave identical rows on two ' +
  'replicas and no statistics table anywhere', async () => {
  const seed = Array.from({length: 3000}, (_, i) =>
    `('k${String(i).padStart(5, '0')}', 'v${i % 3}')`).join(', ');
  const committed = [['a5-seed', `INSERT INTO ${TABLE} (id, value) VALUES ${seed}`],
    ['a5-index', `CREATE INDEX IF NOT EXISTS a5_value ON ${TABLE} (value)`]];
  const later = [['a5-delete-limit', `DELETE FROM ${TABLE} WHERE value >= 'v1' AND ` +
    'id >= \'k02990\' LIMIT 1'], ['a5-copy', `INSERT INTO ${TABLE} (id, value) SELECT ` +
    `'c-' || id, value FROM ${TABLE} WHERE value >= 'v1' AND id >= 'k02990'`]];
  const reads = [['SELECT * FROM pragma_optimize(0x10002)', []],
    ['SELECT * FROM \'pragma_optimize\'(0x10002)', []],
    [`SELECT * FROM ${TABLE}, 'pragma_optimize'`, []],
    [`SELECT name FROM pragma_table_info('${TABLE}')`, []],
    ['SELECT fts3_tokenizer(?) AS p', ['simple']], ['SELECT load_extension(?)', ['x']]];
  // Each read's answer, a throw recorded as a fact (the schedule goes on).
  const answerOf = async (read) => {
    try {
      return await read();
    } catch (error) {
      return {thrown: error.message};
    }
  };
  const perReplica = [];
  for (const [which, replicaId] of [REPLICAS[1], REPLICAS[2]].entries()) {
    const replica = await startReplica(replicaId);
    try {
      committed.forEach(([entryId, sql]) =>
        applyCommitted(replica, committedQueryOf(entryId, sql)));
      const answers = [];
      for (const [sql, params] of which === 0 ? reads : []) {
        answers.push(await answerOf(() => replica.executeQuery(sql, params)),
          await answerOf(() => replica.executeLocalQuery(sql, params)),
          await answerOf(() => readAdmittedPartitionRows(replica, sql, params)));
      }
      later.forEach(([entryId, sql]) => applyCommitted(replica, committedQueryOf(entryId, sql)));
      perReplica.push({refusals: answers.map((answer) => pick(answer, ['failureCode',
        'refusalLayer'])), stats: replica.db.prepare('SELECT name FROM sqlite_master WHERE ' +
        'name LIKE \'sqlite_stat%\'').all().length, rows: rowsOf(replica).filter((row) =>
        row.includes('|c-') || row.includes('|k0299'))});
    } finally {
      await shutdownAll(replica);
    }
  }
  assert.deepEqual({refusals: perReplica[0].refusals, stats: perReplica.map((r) => r.stats),
    identicalRows: JSON.stringify(perReplica[0].rows) === JSON.stringify(perReplica[1].rows)},
  {refusals: Array(reads.length * 3).fill(refusedAs(RULE.FUNCTION)), stats: [0, 0],
    identicalRows: true}, 'no read changes what a later committed write computes');
});

test('TX1 admission A6: an ordinary write may target only the partition\'s own table: ' +
  'writes to _raft_rs_log, _partition_statement_outcomes, sqlite_master, a temporary table ' +
  'and through a WITH head are refused on the request path and identically at apply, ' +
  'leaving those tables unchanged; an own-table write applies', async () => {
  const foreign = [['a6-raft-log', 'INSERT INTO _raft_rs_log (group_id, log_index, term, ' +
    'entry_type, data) VALUES (\'g\', \'999\', \'1\', 0, NULL)'],
  ['a6-outcomes', 'DELETE FROM _partition_statement_outcomes'],
  ['a6-schema', 'UPDATE sqlite_master SET sql = NULL WHERE name = \'x\''],
  ['a6-temp', `INSERT INTO temp.${TABLE} (id, value) VALUES ('t', 'x')`],
  ['a6-with', 'WITH c(k) AS (VALUES (\'w\')) INSERT INTO _partition_statement_outcomes ' +
    '(entry_key, outcome, log_index, term) SELECT k, \'applied\', 1, 1 FROM c']];
  const own = ['a6-own', `INSERT INTO main.${TABLE} (id, value) VALUES ('own', 'x')`];
  // The own table named the ways SQLite names it: main-qualified, single-quoted.
  const cases = [...foreign.map(([entryId, sql]) => ({entryId, sql, seed: [own],
    layer: RULE.TABLE, rows: ['1|own|x']})),
  {entryId: own[0], sql: own[1], layer: null, rows: ['1|own|x']},
  {entryId: 'a6-string-into', sql: `INSERT INTO '${TABLE}' (id, value) VALUES ('s', 'x')`,
    layer: null, rows: ['1|s|x']},
  {entryId: 'a6-string-update', seed: [own], sql: `UPDATE '${TABLE}' SET value = 'y' ` +
    'WHERE id = \'own\'', layer: null, rows: ['1|own|y']},
  {entryId: 'a6-string-delete', seed: [own], sql: `DELETE FROM 'main'.'${TABLE}' WHERE ` +
    'id = \'own\'', layer: null, rows: []}];
  const facts = await caseFacts(cases);
  const replicaTables = await onTwoReplicas(async (replica) => {
    [...foreign, own].forEach(([entryId, sql]) =>
      applyCommitted(replica, committedQueryOf(entryId, sql)));
    return {raftLog: replica.db.prepare('SELECT COUNT(*) AS c FROM _raft_rs_log ' +
      'WHERE log_index = \'999\'').get().c, outcomes: outcomeRows(replica).length};
  });
  assert.deepEqual({facts, replicaTables}, {facts: expectedFacts(cases),
    replicaTables: Array(2).fill({raftLog: 0, outcomes: foreign.length + 1})},
  'no ordinary write reaches a table but the own one');
});

test('TX1 admission A7: a re-delivery of a settled write is answered from its outcome row ' +
  'before any admission rule: after a later committed UPDATE moves the table to the ' +
  'ceiling, the retry of the applied insert answers its applied outcome and proposes ' +
  'nothing, while a fresh insert is refused', async () => {
  const {leader, proposed} = await startLeader({schema: IPK_SCHEMA});
  const fields = ['success', 'changes', 'lastInsertRowid', 'settledReplay', 'failureCode',
    'refusalLayer'];
  try {
    const first = track(leader.executeQuery(INSERT_SQL, [1, 'a'], {entryId: 'a7-e1'}));
    applyCommitted(leader, await awaitProposal(proposed, hasEntryId('a7-e1')));
    await settleTicks();
    const ceiling = applyCommitted(leader, committedQueryOf('a7-up',
      `UPDATE ${TABLE} SET id = ${CEILING} WHERE id = 1`));
    const proposals = proposed.length;
    const retry = await leader.executeQuery(INSERT_SQL, [1, 'a'], {entryId: 'a7-e1'});
    const fresh = await leader.executeQuery(INSERT_SQL, [2, 'b'], {entryId: 'a7-e2'});
    assert.deepEqual({first: pick(first.value, ['success', 'changes', 'lastInsertRowid']),
      ceiling, retry: pick(retry, fields), proposedAfter: proposed.length - proposals,
      fresh: pick(fresh, ['failureCode', 'refusalLayer'])}, {
      first: {success: true, changes: 1, lastInsertRowid: 1}, ceiling: null,
      retry: {success: true, changes: 1, lastInsertRowid: 1,
        settledReplay: 'applied-outcome-retained', failureCode: null, refusalLayer: null},
      proposedAfter: 0, fresh: refusedAs(LAYER.ROWID_CEILING)},
    'a committed write\'s retry answers its outcome, never a refusal by later state');
  } finally {
    await shutdownAll(leader);
  }
});

test('TX1 admission A8: an OR ROLLBACK conflict clause is refused on the request path and, ' +
  'committed, refused at apply inside the apply\'s own transaction: the entry is consumed, ' +
  'the applied index advances by one, and the next entry applies at its own index', async () => {
  const rollback = `INSERT OR ROLLBACK INTO ${TABLE} (id, value) VALUES ('a', 'y')`;
  const wire = (await caseFacts([{entryId: 'a8-update', sql: `UPDATE OR ROLLBACK ${TABLE} ` +
    'SET value = \'x\' WHERE id = \'a\'', layer: RULE.CONFLICT, rows: []}]))[0].wire;
  const replica = await startReplica(REPLICAS[1]);
  try {
    const base = durableAppliedIndex(replica);
    const steps = [['a8-a', `INSERT INTO ${TABLE} (id, value) VALUES ('a', 'x')`],
      ['a8-rollback', rollback], ['a8-b', `INSERT INTO ${TABLE} (id, value) VALUES ('b', 'z')`]]
      .map(([entryId, sql]) => ({apply: applyCommitted(replica, committedQueryOf(entryId, sql)),
        advance: durableAppliedIndex(replica) - base,
        outcome: statementOutcomeOf(replica, entryId)}));
    assert.deepEqual({wire, steps, inTransaction: replica.db.inTransaction,
      rows: rowsOf(replica)}, {wire: refusedAs(RULE.CONFLICT), steps: [
      {apply: null, advance: 1, outcome: APPLIED},
      {apply: null, advance: 2, outcome: REFUSED_AT_APPLY},
      {apply: null, advance: 3, outcome: APPLIED}], inTransaction: false,
    rows: ['1|a|x', '2|b|z']}, 'no statement ends the apply\'s transaction');
  } finally {
    await shutdownAll(replica);
  }
});

const B4_CASES = [
  {entryId: 'b4-double-quoted', seed: [SEED_A], sql: `UPDATE ${TABLE} SET "rowid" = 7 ` +
    'WHERE id = \'a\'', layer: LAYER.ROWID_ALIAS, rows: ['1|a|seed']},
  {entryId: 'b4-backtick', sql: `INSERT INTO ${TABLE} (\`rowid\`, id, value) VALUES ` +
    '(8, \'b\', \'v\')', layer: LAYER.ROWID_ALIAS, rows: []},
  {entryId: 'b4-bracket', sql: `INSERT INTO ${TABLE} ([rowid], id, value) VALUES ` +
    '(9, \'c\', \'v\')', layer: LAYER.ROWID_ALIAS, rows: []},
  {entryId: 'b4-set-reads-rowid', seed: [SEED_A], sql: `UPDATE ${TABLE} SET value = rowid ` +
    'WHERE id = \'a\'', layer: LAYER.ROWID_ALIAS, rows: ['1|a|seed']},
  {entryId: 'b4-returning-oid', seed: [SEED_A], sql: `DELETE FROM ${TABLE} WHERE id = 'zz' ` +
    'RETURNING oid', layer: LAYER.ROWID_ALIAS, rows: ['1|a|seed']},
  {entryId: 'b4-backfill-where', seed: [SEED_A], sql: `UPDATE ${TABLE} SET value = ` +
    'COALESCE(value, ?) WHERE rowid > ? AND rowid <= ?', params: ['d', 0, 100], layer: null,
  rows: ['1|a|seed']},
  {entryId: 'b4-key-do-update', schema: IPK_SCHEMA, sql: `INSERT INTO ${TABLE} (id, value) ` +
    'VALUES (NULL, \'x\') ON CONFLICT (id) DO UPDATE SET id = 5',
  layer: LAYER.ROWID_ALLOCATION, rows: []},
  {entryId: 'b4-second-row-null', schema: IPK_SCHEMA, sql: `INSERT OR REPLACE INTO ${TABLE} ` +
    '(id, value) VALUES (5, \'a\'), (NULL, \'b\')', layer: LAYER.ROWID_ALLOCATION, rows: []},
  {entryId: 'b4-select-source', schema: IPK_SCHEMA, sql: `INSERT OR REPLACE INTO ${TABLE} ` +
    '(id, value) SELECT 5, \'a\'', layer: LAYER.ROWID_ALLOCATION, rows: []},
  ...['011', ' 12', '+5'].map((key) => ({entryId: `b4-key-${key.trim()}`, schema: IPK_SCHEMA,
    sql: KEYED_REPLACE, params: [key, 'x'], layer: LAYER.ROWID_ALLOCATION, rows: []})),
  {entryId: 'b4-key-canonical', schema: IPK_SCHEMA, sql: KEYED_REPLACE, params: ['5', 'x'],
    layer: null, rows: [keyRow(5, 'x')]},
];

test('TX1 admission A9: every ordinary-path R1/R2 branch refuses on the request path and ' +
  'identically at apply (quoted aliases, an alias read outside an UPDATE or DELETE WHERE, a ' +
  'key-assigning DO UPDATE, a later NULL row, a SELECT source, non-canonical key text) and ' +
  'admits its positive (the backfill WHERE, a canonical key)', async () => {
  assert.deepEqual(await caseFacts(B4_CASES), expectedFacts(B4_CASES),
    'each branch decides on the request path and at apply alike');
});

test('TX1 admission A10: every routed path holds its rule: the committed apply refuses a ' +
  'read; the migration apply admits ALTER TABLE only; the read-only path admits reads only; ' +
  'the sessionless pre-check refuses at a committed ceiling; the local path refuses before ' +
  'it runs; a temporary index is never dropped; a WITH-headed insert retains its rowid',
async () => {
  const atApply = await onTwoReplicas(async (replica) => {
    const commands = [committedQueryOf('a10-seed', SEED_A[1]),
      committedQueryOf('a10-read', `SELECT * FROM ${TABLE}`),
      alterCommandOf('a10-pragma', 'PRAGMA reverse_unordered_selects = 1'),
      alterCommandOf('a10-alter', `ALTER TABLE ${TABLE} ADD COLUMN a10_extra TEXT`)];
    commands.forEach((command) => applyCommitted(replica, command));
    const readOnly = [readAdmittedPartitionRows(replica, `DELETE FROM ${TABLE}`),
      readAdmittedPartitionRows(replica, `SELECT COUNT(*) AS c FROM ${TABLE}`)];
    // A committed ceiling row, then a local write that would fail its key if it ran.
    replica.db.prepare(`INSERT INTO ${TABLE} (rowid, id, value) VALUES (?, ?, ?)`)
      .run(CEILING, 'ceiling', 'c');
    const local = await replica.executeLocalQuery(`INSERT INTO ${TABLE} (id, value) ` +
      'VALUES (\'a\', \'dup\')', []);
    return {outcomes: commands.slice(1).map((command) =>
      statementOutcomeOf(replica, command.entryId)), flag: connectionFlag(replica),
    readOnly: [pick(readOnly[0], ['failureCode', 'refusalLayer']), readOnly[1].rows],
    local: pick(local, ['failureCode', 'refusalLayer'])};
  });
  const {leader, proposed} = await startLeader();
  const onLeader = {};
  try {
    leader.db.prepare(`INSERT INTO ${TABLE} (rowid, id, value) VALUES (?, ?, ?)`)
      .run(CEILING, 'ceiling', 'c');
    onLeader.ceiling = await leaderAnswer(leader, ['a10-ceiling', INSERT_SQL, ['n', 'v']]);
    leader.db.exec(`CREATE TEMP TABLE ${TABLE} (id TEXT, value TEXT)`);
    leader.db.exec(`CREATE INDEX temp.a10_temp_value ON ${TABLE} (value)`);
    onLeader.tempDrop = await leaderAnswer(leader, ['a10-drop', 'DROP INDEX a10_temp_value', []]);
    onLeader.tempIndex = leader.db.prepare('SELECT COUNT(*) AS c FROM temp.sqlite_master ' +
      'WHERE name = \'a10_temp_value\'').get().c;
    onLeader.proposed = proposed.length;
  } finally {
    await shutdownAll(leader);
  }
  // A WITH-headed insert is of an inserting kind: its outcome row retains its rowid.
  const ipk = await startReplica(REPLICAS[1], {schema: IPK_SCHEMA});
  let withRowid;
  try {
    applyCommitted(ipk, committedQueryOf('a10-with', 'WITH v(k, x) AS (VALUES (7, \'w\')) ' +
      `INSERT INTO ${TABLE} (id, value) SELECT k, x FROM v`));
    withRowid = outcomeRows(ipk).map((row) => row.last_insert_rowid);
  } finally {
    await shutdownAll(ipk);
  }
  const replicaFacts = {outcomes: [REFUSED_AT_APPLY, REFUSED_AT_APPLY, APPLIED], flag: 0,
    readOnly: [refusedAs(LAYER.STATEMENT_KIND), [{c: 1}]],
    local: refusedAs(LAYER.ROWID_CEILING)};
  assert.deepEqual({atApply, onLeader, withRowid}, {atApply: [replicaFacts, replicaFacts],
    onLeader: {ceiling: refusedAs(LAYER.ROWID_CEILING),
      tempDrop: refusedAs(LAYER.STATEMENT_KIND), tempIndex: 1, proposed: 0},
    withRowid: ['7']}, 'each path refuses what it must');
});

test('TX1 admission A11: an apply-side refusal answers its refusal layer to the proposer, ' +
  'and a settled replay answers the same layer', async () => {
  const {leader, proposed} = await startLeader({schema: IPK_SCHEMA});
  const fields = ['success', 'failureCode', 'refusalLayer', 'outcome'];
  try {
    const first = track(leader.executeQuery(TOP_THEN_ALLOCATE, [], {entryId: 'a11-top'}));
    const apply = applyCommitted(leader, await awaitProposal(proposed, hasEntryId('a11-top')));
    await settleTicks();
    const replay = await leader.executeQuery(TOP_THEN_ALLOCATE, [], {entryId: 'a11-top'});
    const answer = {success: false, ...refusedAs(LAYER.ROWID_CEILING),
      outcome: 'statement_failed'};
    assert.deepEqual({apply, first: pick(first.value, fields), replay: pick(replay, fields),
      replayed: Number.isInteger(replay.replayOfLogIndex)}, {apply: null, first: answer,
      replay: answer, replayed: true}, 'the layer is a field of the answer, first and replayed');
  } finally {
    await shutdownAll(leader);
  }
});
