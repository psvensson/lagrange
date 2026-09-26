/**
 * Public Application Database through embedded processes (I1).
 *
 * Each embedded runtime is its own OS process running the application code in
 * test/integration/helpers/embedded-node-worker.js, which imports only the
 * public package entry (createEmbeddedLagrange -> start ->
 * openApplicationDatabase) and nothing else under src/. The parent drives the
 * sessions over IPC and asserts on exactly what the application received.
 *
 * SHAPE. The suite is written for a seed plus joiners (session A on the seed,
 * session B on the last process) and takes its size from
 * helpers/public-application-database-shape.js. The COMMITTED size is ONE
 * runtime: on three processes the lab showed application writes intermittently
 * not served after formation (F-FORMATION-WRITE-READINESS) and committed
 * transactional rows existing only on the staging replica
 * (F-TX-REPLICATED-APPLY, see the transaction facade suite), both owned outside
 * this seam. On three processes (lab, 2026-09-26) the TEXT write, cross-node
 * PK read (64 ms), cross-node update visibility (33 ms), F1, F2, EXPLAIN
 * refusal and every leak check passed; that run is recorded, not asserted.
 *
 * What this proves at the committed shape, and what it does not:
 * - The application names rows ONLY by its own PRIMARY KEY value (composite
 *   string ids such as `img:<sha>:blob`); statements go through the canonical
 *   SqlCore (`src/query/application-database.js` -> SqlCore.executeQuery).
 *   The row id is sufficient routing identity for the application: no
 *   application-specific physical locator (node, partition, replica, address)
 *   is required or accepted (F1, F2). Cross-node routing is NOT proven here.
 * - Reads poll within a bounded window and report it; there is no
 *   linearizability or cross-node read-your-writes claim.
 * - Range reads use lexicographic (SQLite TEXT) ordering. The table is one
 *   partition (asserted harness-side): no public API splits a table on one
 *   runtime (the public `WITH (split_storage_threshold = N)` policy split a
 *   table on three processes within 13 s on the lab, but not on one in 91 s),
 *   so the range proof is single-partition.
 * - The public result shape is the facade projection `{rows, affectedRows}`;
 *   no value the application receives (results, rows, errors, cause chains)
 *   carries topology (I1.4, reusable helper src/test-helpers/topology-leak-check.js), and
 *   EXPLAIN DISTRIBUTED is refused (DIAGNOSTIC_STATEMENT_RESERVED).
 * - F-BLOB-ROUTED-BYTES is a witness of a current defect, not a guarantee.
 *
 * The product-facing PostgreSQL-wire client is NOT exercised: `sys-postgres-
 * wire` ships replica_count 0 and was not placed within a bounded window on a
 * small embedded cluster. Recorded as a finding, not asserted.
 */

import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {test} from '../../src/test-helpers/tap.js';
import {
  EMBEDDED_STEP_OUTCOME,
  createEmbeddedCluster,
  exposedProperty,
  fulfilledRows,
  mustQuery,
  readUntil,
} from './helpers/embedded-cluster-harness.js';
import {
  MULTINODE_CLUSTER_SIZE,
  MULTINODE_TEST_TIMEOUT_MS,
} from './helpers/public-application-database-shape.js';
import {findTopologyLeaks} from '../../src/test-helpers/topology-leak-check.js';

const APPLICATION_ID = 'public-seam-acceptance';
const TABLE = 'acceptance_objects';
const HINT_TABLE = 'acceptance_hints';
// better-sqlite3's refusal to bind a non-byte object (the JSON-decoded
// {type:'Buffer',data:[...]}).
const SQLITE_BIND_ERROR_PATTERN =
  /can only bind numbers, strings, bigints, buffers, and null/;
const BLOB_LOG_CONTEXT_LINES = 6;
const RANGE_LOW = 'img:';
const RANGE_HIGH = 'img;';
const PUBLIC_RESULT_KEYS = ['affectedRows', 'rows'];
const ERROR_CODE = Object.freeze({
  DIAGNOSTIC_STATEMENT_RESERVED: 'DIAGNOSTIC_STATEMENT_RESERVED',
  DISTRIBUTED_PARTICIPANT_FAILURE: 'DISTRIBUTED_PARTICIPANT_FAILURE',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
});

function sha(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

const SHA_ONE = sha('first image');
const SHA_TWO = sha('second image');
const TEXT_ROW = Object.freeze({
  id: `img:${SHA_ONE}:meta`,
  body: null,
  note: 'first image metadata',
});
const BLOB_BYTES = Buffer.from([0x00, 0xff, 0x10, 0x80, 0x7f, 0x01, 0xfe, 0x00]);
const BLOB_ROW_ID = `img:${SHA_ONE}:blob`;
const RANGE_IDS = Object.freeze([
  `img:${SHA_TWO}:blob`,
  `img:${SHA_TWO}:meta`,
  'doc:readme:meta',
  'zz:last:meta',
]);

function rowIds(rows) {
  return rows.map((row) => row.id);
}

test('public application database routes by primary key through embedded processes', {
  timeout: MULTINODE_TEST_TIMEOUT_MS,
}, async (t) => {
  const cluster = createEmbeddedCluster(t);
  const formation = await cluster.formCluster(MULTINODE_CLUSTER_SIZE);
  t.comment(`formation (${MULTINODE_CLUSTER_SIZE} processes): ` +
    JSON.stringify(formation));
  const seed = cluster.nodes[0];
  const joiner = cluster.nodes[cluster.nodes.length - 1];
  t.equal(cluster.nodes.length, MULTINODE_CLUSTER_SIZE);

  const sessionA = await seed.openApplicationDatabase(APPLICATION_ID);
  const sessionB = await joiner.openApplicationDatabase(APPLICATION_ID);
  // Everything the application receives is kept for the leak check (I1.4).
  const received = [];
  const keep = (label, outcome) => {
    received.push({label, outcome: outcome.outcome, value: outcome.value});
    return outcome;
  };

  await t.test('I1.1 create and write on node A, exact PK read on node B', async (t) => {
    keep('create table', await mustQuery(seed, sessionA,
      `CREATE TABLE ${TABLE} (id TEXT PRIMARY KEY, body BLOB, note TEXT)`));
    keep('insert text row', await mustQuery(seed, sessionA,
      `INSERT INTO ${TABLE} (id, body, note) VALUES (?, ?, ?)`,
      [TEXT_ROW.id, TEXT_ROW.body, TEXT_ROW.note]));

    const onB = await readUntil(t, joiner, sessionB,
      `SELECT id, body, note FROM ${TABLE} WHERE id = ?`, [TEXT_ROW.id],
      (rows) => rows.length === 1);
    keep('select text row on B', onB.outcome);
    t.same(onB.rows, [{...TEXT_ROW}], 'node B returns the exact TEXT row by its PK');
    t.comment(`cross-node visibility window (insert): ${onB.windowMs} ms`);
  });

  // FINDING F-BLOB-ROUTED-BYTES (witness, asserts the CURRENT defect; flips
  // when the owner fixes it): a BLOB bind value does not survive the routed
  // write. Mechanism (census, see the track report): every partition hop and
  // the Raft log are ad hoc JSON with no byte codec, so the participant binds
  // {type:'Buffer',data:[...]} into SQLite. The same statement with a TEXT or
  // NULL body succeeds (I1.1). When bytes are carried, replace this witness
  // with the exact Buffer round-trip it currently cannot make.
  await t.test('F-BLOB-ROUTED-BYTES witness: a BLOB bind is rejected on the routed write', async (t) => {
    const blobInsert = keep('F-BLOB insert', await seed.query(sessionA,
      `INSERT INTO ${TABLE} (id, body, note) VALUES (?, ?, ?)`,
      [BLOB_ROW_ID, BLOB_BYTES, 'blob']));
    if (blobInsert.outcome !== EMBEDDED_STEP_OUTCOME.REJECTED) {
      t.comment(`F-BLOB flipped: ${JSON.stringify(blobInsert.outcome)}`);
    }
    t.equal(blobInsert.outcome, EMBEDDED_STEP_OUTCOME.REJECTED,
      'observed today: the BLOB insert is rejected');
    t.equal(exposedProperty(blobInsert.value, 'code'),
      ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
      'as a participant failure (the SQLite bind of the JSON-decoded value)');
    const absent = await mustQuery(joiner, sessionB,
      `SELECT id FROM ${TABLE} WHERE id = ?`, [BLOB_ROW_ID]);
    t.same(fulfilledRows(absent), [], 'and nothing was written');
    // The public code cannot tell byte loss from participant unavailability;
    // the harness-side node log names the mechanism (never consumer code).
    const tableLines = cluster.nodes.flatMap((node) =>
      cluster.nodeLogLines(node, TABLE));
    const bindErrors = tableLines.filter((line) =>
      SQLITE_BIND_ERROR_PATTERN.test(line));
    if (bindErrors.length === 0) {
      t.comment(`F-BLOB log lines naming ${TABLE}:\n` +
        tableLines.slice(-BLOB_LOG_CONTEXT_LINES).join('\n'));
    }
    t.ok(bindErrors.length > 0,
      'the node log shows the SQLite bind refusal of the decoded value ' +
      '(bytes lost in JSON, not an unavailable participant)');
  });

  await t.test('I1.2 update on node A becomes visible on node B', async (t) => {
    const updated = keep('update', await mustQuery(seed, sessionA,
      `UPDATE ${TABLE} SET note = ? WHERE id = ?`,
      ['first image metadata v2', TEXT_ROW.id]));
    t.equal(exposedProperty(updated.value, 'affectedRows'), 1,
      'the update reports one affected row');
    const onB = await readUntil(t, joiner, sessionB,
      `SELECT note FROM ${TABLE} WHERE id = ?`, [TEXT_ROW.id],
      (rows) => rows.length === 1 && rows[0].note === 'first image metadata v2');
    keep('select updated row on B', onB.outcome);
    t.same(onB.rows, [{note: 'first image metadata v2'}]);
    t.comment(`cross-node visibility window (update): ${onB.windowMs} ms ` +
      '(eventual follower-local visibility; no linearizability claim)');
  });

  await t.test('I1.3 bounded key and range reads over string ids', async (t) => {
    keep('insert blob-id row without bytes', await mustQuery(seed, sessionA,
      `INSERT INTO ${TABLE} (id, body, note) VALUES (?, ?, ?)`,
      [BLOB_ROW_ID, null, 'blob placeholder (see F-BLOB-ROUTED-BYTES)']));
    for (const id of RANGE_IDS) {
      keep(`insert ${id}`, await mustQuery(seed, sessionA,
        `INSERT INTO ${TABLE} (id, body, note) VALUES (?, ?, ?)`,
        [id, null, `note for ${id}`]));
    }
    const expectedImg = [BLOB_ROW_ID, TEXT_ROW.id, ...RANGE_IDS.slice(0, 2)]
      .sort();
    const halfOpen = await readUntil(t, joiner, sessionB,
      `SELECT id FROM ${TABLE} WHERE id >= ? AND id < ? ORDER BY id`,
      [RANGE_LOW, RANGE_HIGH], (rows) => rows.length === expectedImg.length);
    keep('half-open range on B', halfOpen.outcome);
    t.same(rowIds(halfOpen.rows), expectedImg,
      'id >= img: AND id < img; returns exactly the img: prefix, lexicographic');

    const between = keep('between on B', await mustQuery(joiner, sessionB,
      `SELECT id FROM ${TABLE} WHERE id BETWEEN ? AND ? ORDER BY id`,
      [`img:${SHA_ONE}:`, `img:${SHA_ONE}:~`]));
    t.same(rowIds(fulfilledRows(between)), [BLOB_ROW_ID, TEXT_ROW.id].sort(),
      'BETWEEN over one image prefix returns its two rows');

    const limited = keep('order by limit on B', await mustQuery(joiner, sessionB,
      `SELECT id FROM ${TABLE} WHERE id >= ? AND id < ? ORDER BY id LIMIT 2`,
      [RANGE_LOW, RANGE_HIGH]));
    t.same(rowIds(fulfilledRows(limited)), expectedImg.slice(0, 2),
      'ORDER BY id LIMIT 2 within the range');

    const exact = keep('exact pk on B', await mustQuery(joiner, sessionB,
      `SELECT id FROM ${TABLE} WHERE id = ?`, [RANGE_IDS[2]]));
    t.same(rowIds(fulfilledRows(exact)), [RANGE_IDS[2]], 'exact PK lookup');

    const tablePartitions = (await cluster.seedQueryRows(
      'SELECT partition_id FROM partitions WHERE table_name = ?', [TABLE]));
    t.equal(tablePartitions.length, 1,
      'harness view: the unsplit table is one partition (single-partition range proof)');
  });

  await t.test('the application process refuses session work before start', async (t) => {
    t.equal(seed.preStartReply.ok, false, 'openApplicationDatabase before start is refused');
    t.match(exposedProperty(seed.preStartReply.error, 'message'), /not started/);
  });

  await t.test('F1 the consumer cannot select a node', async (t) => {
    const refused = await seed.openSession({applicationId: APPLICATION_ID,
      nodeId: joiner.nodeId});
    t.equal(refused.ok, false, 'openApplicationDatabase({applicationId, nodeId}) is refused');
    t.equal(exposedProperty(refused.error, 'code'), ERROR_CODE.INVALID_ARGUMENT);
    received.push({label: 'F1 open refusal',
      outcome: EMBEDDED_STEP_OUTCOME.REJECTED, value: refused.error});

    const withOptions = keep('F1 query with node option', await joiner.query(
      sessionB, `SELECT id FROM ${TABLE} WHERE id = ?`, [RANGE_IDS[2]],
      [{nodeId: seed.nodeId}]));
    t.equal(withOptions.outcome, EMBEDDED_STEP_OUTCOME.FULFILLED,
      'a third db.query argument is not an options channel');
    t.same(rowIds(fulfilledRows(withOptions)), [RANGE_IDS[2]],
      'the extra argument is ignored: same PK-routed answer');
  });

  await t.test('F2 a partition hint or partition_id column cannot override routing', async (t) => {
    const hinted = keep('F2 comment hint', await mustQuery(joiner, sessionB,
      `SELECT id FROM ${TABLE} /*+ partition ${TABLE}-p9 */ WHERE id = ?`,
      [RANGE_IDS[2]]));
    t.same(rowIds(fulfilledRows(hinted)), [RANGE_IDS[2]],
      'a SQL comment "hint" is inert');

    const [realPartition] = await cluster.seedQueryRows(
      'SELECT partition_id FROM partitions WHERE table_name = ?', [TABLE]);
    await mustQuery(seed, sessionA,
      `CREATE TABLE ${HINT_TABLE} (id TEXT PRIMARY KEY, partition_id TEXT)`);
    await mustQuery(seed, sessionA,
      `INSERT INTO ${HINT_TABLE} (id, partition_id) VALUES (?, ?)`,
      ['hint:1', realPartition.partition_id]);
    await mustQuery(seed, sessionA,
      `INSERT INTO ${HINT_TABLE} (id, partition_id) VALUES (?, ?)`,
      ['hint:2', 'user-value']);
    const byColumn = await readUntil(t, joiner, sessionB,
      `SELECT id, partition_id FROM ${HINT_TABLE} WHERE partition_id = ?`,
      ['user-value'], (rows) => rows.length === 1);
    t.same(byColumn.rows, [{id: 'hint:2', partition_id: 'user-value'}],
      'partition_id on a user table is an ordinary column predicate');
  });

  await t.test('I1.4 no value the application receives carries topology', async (t) => {
    keep('duplicate pk insert', await seed.query(sessionA,
      `INSERT INTO ${TABLE} (id, body, note) VALUES (?, ?, ?)`,
      [TEXT_ROW.id, null, 'dup']));
    keep('unknown table', await joiner.query(sessionB,
      'SELECT id FROM acceptance_missing WHERE id = ?', ['x']));
    keep('syntax error', await joiner.query(sessionB, 'SELEC nonsense', []));
    const explained = keep('explain distributed', await joiner.query(sessionB,
      `EXPLAIN DISTRIBUTED SELECT id FROM ${TABLE} WHERE id = ?`, [TEXT_ROW.id]));
    t.equal(exposedProperty(explained.value, 'code'),
      ERROR_CODE.DIAGNOSTIC_STATEMENT_RESERVED,
      'EXPLAIN DISTRIBUTED (the planner) is refused to application sessions');

    const partitionIds = (await cluster.seedQueryRows(
      'SELECT partition_id FROM partitions WHERE table_name = ?', [TABLE]))
      .map((row) => row.partition_id);
    const forbiddenValues = [seed.nodeId, joiner.nodeId, ...partitionIds];
    t.ok(partitionIds.length > 0, 'the harness knows the table partition ids');
    for (const {label, value} of received) {
      t.same(findTopologyLeaks(value, {forbiddenValues}), [],
        `${label}: no topology key or identity`);
    }
    for (const {label, outcome, value} of received) {
      if (outcome !== EMBEDDED_STEP_OUTCOME.FULFILLED) continue;
      t.equal(value.prototype, null, `${label}: null-prototype public result`);
      t.equal(value.frozen, true, `${label}: frozen public result`);
      t.same(Object.keys(value.properties).sort(), PUBLIC_RESULT_KEYS,
        `${label}: exactly {rows, affectedRows}`);
    }
  });
});
