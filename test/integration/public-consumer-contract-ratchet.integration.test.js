/**
 * Public consumer-contract ratchet: the runtime half (ONE embedded runtime).
 *
 * NOT lagrange-images-owned semantics: this ratchets exactly the PUBLIC
 * capabilities that consumer depends on (its Lagrange backend sends only
 * strings and safe integers, creates `id TEXT PRIMARY KEY` tables, reads by
 * PK and by bounded `id` ranges, does compare-and-set UPDATEs judged by
 * `affectedRows`, and read-then-write inside `db.transaction`), so a core
 * change that would break it fails here first. Expectations come from the
 * owner contract architecture/application-database-sessions.md (and the
 * routing/partitioning docs it names), never from the code under test. The
 * node-free half and the list of coverage referenced instead of duplicated:
 * test/release/public-consumer-contract-ratchet.test.js.
 *
 * The consumer is the public-entry-only application process of Track A's
 * harness (test/integration/helpers/embedded-node-worker.js); every value it
 * receives is checked with the shared topology-leak helper.
 *
 * Scope and named gaps:
 * - I5.5 is COORDINATOR-VISIBLE transaction semantics on one runtime only.
 *   Distributed durability of a committed transaction is BLOCKED (finding
 *   F-TX-REPLICATED-APPLY, quest distributed-transaction-replicated-apply)
 *   and is not claimed.
 * - The byte case of I5.3 is a WITNESS of F-BLOB-ROUTED-BYTES: the contract
 *   accepts Buffer/Uint8Array binds and expects the bytes back; today the
 *   write is refused even with a local leader. It flips to the exact round
 *   trip when the codec owner lands. (Bytes cross the harness IPC as a
 *   Buffer, so a Uint8Array bind is not separately exercised here.)
 * - I5.6 records that Binding invocation is NOT part of the embedded facade:
 *   lifecycle SQL is classified only on the authenticated request path. When
 *   owner decision D (an embedded Binding invocation adapter) lands, that
 *   subtest is replaced by the positive contract.
 */

import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {test} from '../../src/test-helpers/tap.js';
import {findTopologyLeaks} from '../../src/test-helpers/topology-leak-check.js';
import {
  EMBEDDED_STEP_OUTCOME as OUTCOME,
  EMBEDDED_WORKER_OP,
  createEmbeddedCluster,
  exposedProperty,
  fulfilledRows,
  mustQuery,
} from './helpers/embedded-cluster-harness.js';

// Lab-derived budget, see the header of the progress record in the hand-back.
const CONSUMER_CONTRACT_TEST_TIMEOUT_MS = 300000;
const SINGLE_RUNTIME = 1;
const APPLICATION_ID = 'lagrange-images';
const CODE = Object.freeze({
  DISTRIBUTED_PARTICIPANT_FAILURE: 'DISTRIBUTED_PARTICIPANT_FAILURE',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  RUNTIME_ACTIVE: 'RUNTIME_ACTIVE',
  RUNTIME_STOPPED: 'RUNTIME_STOPPED',
  SYNTAX_ERROR: 'SYNTAX_ERROR',
});
const ERROR_PROTOTYPE = 'ApplicationDatabaseError';
const PUBLIC_RESULT_KEYS = Object.freeze(['affectedRows', 'rows']);
const LARGE_TEXT_BYTES = 1024 * 1024;
const SQL = Object.freeze({
  CREATE_VALUES: 'CREATE TABLE IF NOT EXISTS consumer_values ' +
    '(id TEXT PRIMARY KEY, text_value TEXT, int_value INTEGER, body BLOB)',
  INSERT_VALUE: 'INSERT INTO consumer_values (id, text_value, int_value) ' +
    'VALUES (?, ?, ?)',
  INSERT_BYTES: 'INSERT INTO consumer_values (id, body) VALUES (?, ?)',
  READ_VALUE: 'SELECT id, text_value, int_value FROM consumer_values WHERE id = ?',
  CREATE_OBJECTS: 'CREATE TABLE IF NOT EXISTS consumer_objects (id TEXT PRIMARY KEY, ' +
    'record_key TEXT NOT NULL, version INTEGER NOT NULL, payload TEXT NOT NULL)',
  INSERT_OBJECT: 'INSERT INTO consumer_objects (id, record_key, version, payload) ' +
    'VALUES (?, ?, ?, ?)',
  READ_OBJECT: 'SELECT id, record_key, version, payload FROM consumer_objects ' +
    'WHERE id = ?',
  CAS_UPDATE: 'UPDATE consumer_objects SET payload = ?, version = ? ' +
    'WHERE id = ? AND version = ?',
  HALF_OPEN: 'SELECT id FROM consumer_objects WHERE id >= ? AND id < ? ORDER BY id',
  HALF_OPEN_AFTER: 'SELECT id FROM consumer_objects ' +
    'WHERE id >= ? AND id < ? AND version > ? ORDER BY id',
  BETWEEN: 'SELECT id FROM consumer_objects WHERE id BETWEEN ? AND ? ORDER BY id',
  LIMITED: 'SELECT id FROM consumer_objects WHERE id >= ? AND id < ? ' +
    'ORDER BY id LIMIT 2',
  SCAN: 'SELECT id FROM consumer_objects ORDER BY id',
  CALL_BINDING: 'CALL BINDING $1',
  BROKEN: 'SELEC broken',
  PARTITIONS: 'SELECT partition_id FROM partitions WHERE table_name IN (?, ?)',
});

const digest = (text) => createHash('sha256').update(text).digest('hex')
  .slice(0, 16);
const SHA_A = digest('image a');
const SHA_B = digest('image b');
const PREFIX = Object.freeze({LOW: 'img:', HIGH: 'img;'});

// [id, text_value, int_value bound, int_value expected back]
const VALUE_CASES = Object.freeze([
  ['v:empty', '', 0, 0],
  // -0 becomes 0 in the JSON IPC before the facade sees it; the facade's own
  // -0 normalization is covered by reference (node-free half).
  ['v:unicode', 'åäö 画像 🖼️ é "q" \\ \n\t', -1, -1],
  ['v:max', 'max', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  ['v:min', 'min', Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER],
  ['v:null', null, null, null],
  ['v:true', 'documented as 1', true, 1],
  ['v:false', 'documented as 0', false, 0],
  ['v:large', JSON.stringify({pad: 'p'.repeat(LARGE_TEXT_BYTES)}), 7, 7],
]);
// Composite string ids, ASCII only: SQLite BINARY collation and the JS
// default sort agree on them, so the JS sort is the lexicographic oracle.
const OBJECT_IDS = Object.freeze([
  `img:${SHA_A}:blob`, `img:${SHA_A}:meta`, `img:${SHA_B}:blob`,
  `img:${SHA_B}:meta`, 'img:', 'img:Z:upper', 'img;', 'doc:1:meta', 'zz:last',
]);

const sortedIds = (ids) => [...ids].sort();
const ids = (outcome) => fulfilledRows(outcome).map((row) => row.id);
const inRange = (low, high) => (id) => id >= low && id < high;
const objectRow = (id, version) =>
  ({id, record_key: id.split(':').at(-1), version, payload: `{"v":${version}}`});
const objectParams = (row) => [row.id, row.record_key, row.version, row.payload];
const casParams = (id, fromVersion) =>
  [`{"v":${fromVersion + 1}}`, fromVersion + 1, id, fromVersion];

function isPublicResult(snapshot) {
  return snapshot?.prototype === null && snapshot.frozen === true &&
    JSON.stringify(Object.keys(snapshot.properties).sort()) ===
      JSON.stringify(PUBLIC_RESULT_KEYS);
}

test('I5 public consumer-contract ratchet (one embedded runtime)', {
  timeout: CONSUMER_CONTRACT_TEST_TIMEOUT_MS,
}, async (t) => {
  const cluster = createEmbeddedCluster(t);
  const formation = await cluster.formCluster(SINGLE_RUNTIME);
  t.comment(`formation: ${JSON.stringify(formation)}`);
  const [node] = cluster.nodes;
  const session = await node.openApplicationDatabase(APPLICATION_ID);
  const received = [];
  const keep = (label, value) => {
    received.push({label, value});
    return value;
  };
  const query = async (label, sql, params = []) => {
    const outcome = await node.query(session, sql, params);
    keep(label, outcome.value);
    return outcome;
  };
  const must = async (label, sql, params = []) =>
    keep(label, await mustQuery(node, session, sql, params));
  const affected = (outcome) => exposedProperty(outcome.value, 'affectedRows');

  await t.test('I5.3 bind values round-trip through the runtime (strict input contract)', async (t) => {
    await must('create values', SQL.CREATE_VALUES);
    for (const [id, text, bound, expected] of VALUE_CASES) {
      const written = await must(`insert ${id}`, SQL.INSERT_VALUE, [id, text, bound]);
      t.equal(affected(written), 1, `${id}: affectedRows 1`);
      const read = await must(`read ${id}`, SQL.READ_VALUE, [id]);
      t.ok(isPublicResult(read.value), `${id}: public {rows, affectedRows}`);
      t.same(fulfilledRows(read), [{id, text_value: text, int_value: expected}],
        `${id}: exact value back`);
    }
    const unsafe = await query('unsafe integer', SQL.READ_VALUE,
      [Number.MAX_SAFE_INTEGER + 1]);
    t.equal(exposedProperty(unsafe.value, 'code'), CODE.INVALID_ARGUMENT,
      'a non-safe integer is INVALID_ARGUMENT');
    const record = await query('object param', SQL.READ_VALUE, [{id: 'v:max'}]);
    t.equal(exposedProperty(record.value, 'code'), CODE.INVALID_ARGUMENT,
      'an object param is INVALID_ARGUMENT');
  });

  // WITNESS F-BLOB-ROUTED-BYTES. Contract: bytes are accepted and come back
  // exactly. Observed: the write is refused (the committed Raft entry is
  // applied from its JSON copy, so SQLite is handed {type:'Buffer',...}).
  // Flip this to the exact Buffer round trip when the codec quest lands.
  await t.test('F-BLOB-ROUTED-BYTES witness: a Buffer bind is refused on one runtime', async (t) => {
    const blobId = `img:${SHA_A}:blob`;
    const write = await query('F-BLOB insert', SQL.INSERT_BYTES,
      [blobId, Buffer.from([0x00, 0xff, 0x10, 0x80])]);
    t.equal(write.outcome, OUTCOME.REJECTED, 'observed today: refused');
    t.equal(exposedProperty(write.value, 'code'),
      CODE.DISTRIBUTED_PARTICIPANT_FAILURE, 'as a participant failure');
    t.same(fulfilledRows(await must('F-BLOB absent', SQL.READ_VALUE, [blobId])),
      [], 'nothing was written (never a corrupted value)');
  });

  await t.test('I5.4 TEXT primary key: PK lookup, bounded ranges, CAS by affectedRows', async (t) => {
    await must('create objects', SQL.CREATE_OBJECTS);
    for (const id of OBJECT_IDS) {
      await must(`insert ${id}`, SQL.INSERT_OBJECT, objectParams(objectRow(id, 1)));
    }
    const target = OBJECT_IDS[1];
    t.same(fulfilledRows(await must('pk', SQL.READ_OBJECT, [target])),
      [objectRow(target, 1)], 'exact PK lookup returns the whole row');
    const range = sortedIds(OBJECT_IDS).filter(inRange(PREFIX.LOW, PREFIX.HIGH));
    t.same(ids(await must('half-open', SQL.HALF_OPEN, [PREFIX.LOW, PREFIX.HIGH])),
      range, 'id >= ? AND id < ?: lexicographic, low bound in, high bound out');
    t.same(ids(await must('limit', SQL.LIMITED, [PREFIX.LOW, PREFIX.HIGH])),
      range.slice(0, 2), 'ORDER BY id LIMIT 2');
    t.same(ids(await must('between', SQL.BETWEEN,
      [`img:${SHA_A}:`, `img:${SHA_A}:~`])),
    [`img:${SHA_A}:blob`, `img:${SHA_A}:meta`], 'BETWEEN is inclusive');
    t.same(ids(await must('scan', SQL.SCAN)), sortedIds(OBJECT_IDS),
      'ORDER BY id without a key predicate scans every row in order');

    t.equal(affected(await must('cas', SQL.CAS_UPDATE, casParams(target, 1))), 1,
      'CAS on the current version: affectedRows 1');
    t.equal(affected(await must('stale cas', SQL.CAS_UPDATE, casParams(target, 1))),
      0, 'CAS on a stale version: affectedRows 0');
    t.same(fulfilledRows(await must('after cas', SQL.READ_OBJECT, [target])),
      [objectRow(target, 2)], 'the row holds the one successful CAS');
    t.same(ids(await must('range after', SQL.HALF_OPEN_AFTER,
      [PREFIX.LOW, PREFIX.HIGH, 1])), [target],
    'a range with a further column predicate');
  });

  await t.test('I5.5 transactions on ONE runtime: coordinator-visible commit and rollback (not distributed durability)', async (t) => {
    const committed = await node.transaction(session, [
      {sql: SQL.INSERT_OBJECT, params: objectParams(objectRow('tx:1', 1))},
      {sql: SQL.READ_OBJECT, params: ['tx:1']},
      {sql: SQL.CAS_UPDATE, params: casParams('tx:1', 1)},
    ]);
    keep('commit', committed.transaction.value);
    committed.steps.forEach((step, index) => keep(`commit ${index}`, step.value));
    t.equal(committed.transaction.outcome, OUTCOME.FULFILLED, 'commits');
    t.same(fulfilledRows(committed.steps[1]), [objectRow('tx:1', 1)],
      'read-your-writes inside the callback');
    t.equal(affected(committed.steps[2]), 1, 'CAS inside the callback');
    t.same(fulfilledRows(await must('committed', SQL.READ_OBJECT, ['tx:1'])),
      [objectRow('tx:1', 2)], 'visible to autocommit reads after commit');

    const rolledBack = await node.transaction(session, [
      {sql: SQL.INSERT_OBJECT, params: objectParams(objectRow('tx:2', 1))},
      {sql: SQL.CAS_UPDATE, params: casParams('tx:1', 2)},
      {sql: SQL.BROKEN, params: []},
    ]);
    keep('rollback', rolledBack.transaction.value);
    t.equal(rolledBack.transaction.outcome, OUTCOME.REJECTED, 'rejects');
    t.equal(rolledBack.transaction.value.prototype, ERROR_PROTOTYPE);
    t.same(fulfilledRows(await must('rolled back insert', SQL.READ_OBJECT,
      ['tx:2'])), [], 'the staged insert is not readable');
    t.same(fulfilledRows(await must('rolled back cas', SQL.READ_OBJECT,
      ['tx:1'])), [objectRow('tx:1', 2)], 'the staged CAS is not readable');
  });

  // Named expectation, not a capability: replaced by the positive contract
  // when owner decision D (embedded Binding invocation adapter) lands.
  await t.test('I5.6 CALL BINDING is not part of the embedded facade today', async (t) => {
    const call = await query('call binding', SQL.CALL_BINDING, ['consumer.binding']);
    t.equal(call.outcome, OUTCOME.REJECTED, 'refused');
    t.equal(exposedProperty(call.value, 'code'), CODE.SYNTAX_ERROR,
      'by the canonical parser on the application path');
  });

  await t.test('I5.4 no value the consumer received carries topology', async (t) => {
    const partitionIds = (await cluster.seedQueryRows(SQL.PARTITIONS,
      ['consumer_values', 'consumer_objects'])).map((row) => row.partition_id);
    t.ok(partitionIds.length >= 2, 'the harness knows the partition ids');
    for (const {label, value} of received) {
      t.same(findTopologyLeaks(value, {forbiddenValues: [node.nodeId,
        ...partitionIds]}), [], `${label}: no topology`);
    }
  });

  await t.test('I5.2 after stop every stale handle fails per the lifecycle contract', async (t) => {
    t.equal((await node.channel.request(EMBEDDED_WORKER_OP.STOP)).ok, true,
      'stop() resolves without exiting the host process');
    const staleQuery = await node.query(session, SQL.READ_OBJECT, ['tx:1']);
    t.equal(exposedProperty(staleQuery.value, 'code'), CODE.RUNTIME_STOPPED,
      'query on a stale handle: RUNTIME_STOPPED');
    const staleTransaction = await node.transaction(session,
      [{sql: SQL.READ_OBJECT, params: ['tx:1']}]);
    t.equal(exposedProperty(staleTransaction.transaction.value, 'code'),
      CODE.RUNTIME_STOPPED, 'transaction on a stale handle: RUNTIME_STOPPED');
    const reopen = await node.openSession({applicationId: APPLICATION_ID});
    t.equal(exposedProperty(reopen.error, 'code'), CODE.RUNTIME_STOPPED,
      'openApplicationDatabase after stop: RUNTIME_STOPPED');
    const restart = await node.channel.request(
      EMBEDDED_WORKER_OP.RESTART_SAME_HANDLE);
    t.equal(exposedProperty(restart.error, 'code'), CODE.RUNTIME_STOPPED,
      'a second start() of the stopped handle is refused');
    const another = await node.channel.request(EMBEDDED_WORKER_OP.START,
      {configuration: {}});
    t.equal(exposedProperty(another.error, 'code'), CODE.RUNTIME_ACTIVE,
      'a new handle in the same process is refused');
    for (const [label, value] of [['stale query', staleQuery.value],
      ['stale transaction', staleTransaction.transaction.value],
      ['reopen', reopen.error], ['restart', restart.error],
      ['another', another.error]]) {
      t.same(findTopologyLeaks(value, {forbiddenValues: [node.nodeId]}), [],
        `${label}: no topology`);
    }
  });
});
