// Application-image content of a copied partition database. The checkpoint
// owner never mutates the live database. Consensus and lifecycle facts are
// read before scrub; only the replicated schema/rows and peer reservations
// survive, together with a manifest that cannot contain its own digest.
import {RAFT_RS_TABLE} from './raft-rs-durable-store-constants.js';
import {RAFT_RS_CHECKPOINT_MANIFEST_TABLE as MANIFEST_TABLE,
  RAFT_RS_APPLICATION_IMAGE_VERSION as VERSION,
  RAFT_RS_SNAPSHOT_JSON_LIMITS as LIMIT,
  RAFT_RS_CHECKPOINT_REASON as REASON,
  RAFT_CHECKPOINT_PAYLOAD_KIND as KIND} from './snapshot-checkpoint-constants.js';
import {canonicalSnapshotJsonBytes, parseCanonicalSnapshotJson,
  codecFailure} from './snapshot-checkpoint-json.js';

const LOCAL_TABLES = Object.freeze([...Object.values(RAFT_RS_TABLE),
  '_raft_rs_replica_lifecycle', '_raft_snapshot_install_binding',
  '_raft_log', '_raft_state', 'raft_rs_peer_identity']);
const OUTCOME_TABLES = Object.freeze([
  '_transaction_outcomes', '_partition_statement_outcomes',
]);
const PEER_TABLE = 'raft_rs_peer_identity';
const SCHEMA_SQL = 'SELECT type, name, tbl_name AS tableName, sql ' +
  'FROM sqlite_schema ORDER BY type, name';
const MANIFEST_SQL = `CREATE TABLE ${MANIFEST_TABLE} (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  manifest_json TEXT NOT NULL
)`;

function quote(name) {
  return '"' + name.replaceAll('"', '""') + '"';
}

function isLocal(name) {
  return LOCAL_TABLES.includes(name) || name === MANIFEST_TABLE;
}

function contentFailure() {
  return codecFailure(REASON.APPLICATION_SCHEMA);
}

function boundedRows(statement, limit = LIMIT.MAX_ARRAY_ELEMENTS) {
  const rows = [];
  for (const row of statement.iterate()) {
    if (rows.length >= limit) throw codecFailure(REASON.JSON_LIMIT_EXCEEDED);
    rows.push(row);
  }
  return rows;
}

function applicationInventory(db) {
  const schema = [];
  let stringBytes = 0;
  // Bound individual text at SQL before materializing its JS value. Count
  // and cumulative codec budgets are separate; rows are never a JSON limit.
  const oversized = db.prepare('SELECT 1 FROM sqlite_schema WHERE ' +
    'length(CAST(sql AS BLOB)) > ? OR length(CAST(name AS BLOB)) > ? ' +
    'OR length(CAST(tbl_name AS BLOB)) > ? LIMIT 1')
    .get(LIMIT.MAX_CANONICAL_BYTES, LIMIT.MAX_CANONICAL_BYTES,
      LIMIT.MAX_CANONICAL_BYTES);
  if (oversized) throw codecFailure(REASON.JSON_LIMIT_EXCEEDED);
  for (const row of db.prepare(SCHEMA_SQL).iterate()) {
    if (isLocal(row.tableName) || row.tableName === PEER_TABLE ||
        row.tableName.startsWith('sqlite_')) continue;
    if (row.tableName.startsWith('_') &&
        !OUTCOME_TABLES.includes(row.tableName)) throw contentFailure();
    if (!['table', 'index', 'trigger', 'view'].includes(row.type)) {
      throw contentFailure();
    }
    if (schema.length >= LIMIT.MAX_ARRAY_ELEMENTS) {
      throw codecFailure(REASON.JSON_LIMIT_EXCEEDED);
    }
    for (const value of Object.values(row)) {
      if (typeof value !== 'string') continue;
      stringBytes += Buffer.byteLength(value, 'utf8');
      if (value.length > LIMIT.MAX_STRING_CODE_UNITS ||
          stringBytes > LIMIT.MAX_TOTAL_STRING_UTF8_BYTES) {
        throw codecFailure(REASON.JSON_LIMIT_EXCEEDED);
      }
    }
    schema.push(row);
  }
  return schema;
}

function sequenceInventory(db) {
  const exists = db.prepare(
    'SELECT 1 FROM sqlite_schema WHERE name = ?').get('sqlite_sequence');
  if (!exists) return [];
  return boundedRows(db.prepare('SELECT name AS tableName, ' +
    'CAST(seq AS TEXT) AS sequence FROM sqlite_sequence ORDER BY name'));
}

function validateCompiledGraph(db, sql, roots) {
  for (const instruction of db.prepare('EXPLAIN ' + sql).iterate()) {
    if (['OpenRead', 'OpenWrite', 'ReopenIdx'].includes(instruction.opcode) &&
        (instruction.p3 !== 0 || !roots.has(instruction.p2))) {
      throw contentFailure();
    }
    if (instruction.opcode === 'VOpen') throw contentFailure();
  }
}

function validateSchemaGraph(db, schema) {
  const tables = new Set(schema.filter(({type}) => type === 'table')
    .map(({name}) => name));
  const names = new Set(schema.map(({name}) => name));
  // SQLite's own compiler exposes every referenced table/index root in the
  // EXPLAIN program, including nested trigger programs. No SQL is executed
  // and no second parser guesses references from SQL text.
  const roots = new Set();
  for (const row of db.prepare('SELECT name, rootpage FROM sqlite_schema').iterate()) {
    if (names.has(row.name) || row.name === 'sqlite_sequence') roots.add(row.rootpage);
  }
  const tableList = boundedRows(db.prepare('PRAGMA table_list'));
  if (tableList.some(({type}) => type === 'virtual' || type === 'shadow')) {
    throw contentFailure();
  }
  for (const row of schema) {
    if (row.type === 'view') {
      // Preparing does not execute the SELECT or any application function.
      validateCompiledGraph(db, `SELECT * FROM ${quote(row.name)} LIMIT 0`, roots);
    } else if (!tables.has(row.tableName)) {
      throw contentFailure();
    }
    if (row.sql === null && (row.type !== 'index' ||
        !row.name.startsWith('sqlite_autoindex_'))) throw contentFailure();
  }
  for (const table of tables) {
    const foreignKeys = boundedRows(db.prepare(
      `PRAGMA foreign_key_list(${quote(table)})`));
    if (foreignKeys.some((key) => !tables.has(key.table))) throw contentFailure();
    const columns = boundedRows(db.prepare(`PRAGMA table_info(${quote(table)})`));
    // Compile every mutation so all trigger programs (including false WHEN
    // branches and UPDATE OF columns) resolve against the scrubbed graph.
    // EXPLAIN is prepared, never stepped, and cannot mutate rows/sequences.
    validateCompiledGraph(db, `INSERT INTO ${quote(table)} DEFAULT VALUES`, roots);
    validateCompiledGraph(db, `DELETE FROM ${quote(table)}`, roots);
    for (const {name} of columns) {
      validateCompiledGraph(db, `UPDATE ${quote(table)} SET ${quote(name)} = ` +
        quote(name), roots);
    }
  }
}

function buildApplicationManifest(db, identity, raftRs, maxCommittedHlc) {
  if (!/^(0|[1-9][0-9]*)$/.test(raftRs.appliedIndex) ||
      !/^(0|[1-9][0-9]*)$/.test(raftRs.appliedTerm) ||
      BigInt(raftRs.appliedIndex) > BigInt(Number.MAX_SAFE_INTEGER) ||
      BigInt(raftRs.appliedTerm) > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw codecFailure(REASON.BOUNDARY);
  }
  return {
    manifestVersion: 1, clusterId: identity.clusterId,
    raftGroupId: identity.raftGroupId, entity: identity.entity,
    lastIncludedIndex: Number(raftRs.appliedIndex),
    lastIncludedTerm: Number(raftRs.appliedTerm), maxCommittedHlc,
    payloadKind: KIND.RAFT_RS_REPLICA_IMAGE, payloadVersion: VERSION,
    raftRs, applicationSchema: applicationInventory(db),
    sqliteSequences: sequenceInventory(db),
  };
}

function sealApplicationContent(db, identity, raftRs, maxCommittedHlc) {
  const manifest = buildApplicationManifest(db, identity, raftRs, maxCommittedHlc);
  const bytes = canonicalSnapshotJsonBytes(manifest);
  // Scrubbing uses an explicit local-state list, never a wildcard that can
  // discard outcomes or arbitrary application rows.
  db.pragma('foreign_keys = OFF');
  for (const table of [...LOCAL_TABLES, MANIFEST_TABLE]) {
    db.exec(`DROP TABLE IF EXISTS ${quote(table)}`);
  }
  validateSchemaGraph(db, manifest.applicationSchema);
  db.exec(MANIFEST_SQL);
  db.prepare(`INSERT INTO ${MANIFEST_TABLE} VALUES (1, ?)`).run(bytes.toString('utf8'));
  db.pragma('journal_mode = DELETE');
  db.exec('VACUUM');
  return manifest;
}

function readApplicationManifest(db) {
  const columns = boundedRows(db.prepare(`PRAGMA table_info(${MANIFEST_TABLE})`));
  if (columns.length !== 2 || columns[0].name !== 'singleton' ||
      columns[1].name !== 'manifest_json') throw codecFailure(REASON.MANIFEST);
  const facts = db.prepare(`SELECT count(*) AS count,
    max(length(CAST(manifest_json AS BLOB))) AS bytes FROM ${MANIFEST_TABLE}`).get();
  if (facts.count !== 1) throw codecFailure(REASON.MANIFEST);
  if (facts.bytes > LIMIT.MAX_CANONICAL_BYTES) {
    throw codecFailure(REASON.JSON_LIMIT_EXCEEDED);
  }
  const row = db.prepare(`SELECT singleton, manifest_json FROM ${MANIFEST_TABLE}`).get();
  if (row.singleton !== 1 || typeof row.manifest_json !== 'string') {
    throw codecFailure(REASON.MANIFEST);
  }
  return parseCanonicalSnapshotJson(Buffer.from(row.manifest_json, 'utf8'));
}

function validateApplicationContent(db, descriptor) {
  const manifest = readApplicationManifest(db);
  if (manifest.raftRs.membershipGenerationIndex !==
      descriptor.raftRs.membershipGenerationIndex) {
    throw codecFailure(REASON.MANIFEST_GENERATION_MISMATCH);
  }
  const expected = buildApplicationManifest(db, descriptor,
    descriptor.raftRs, descriptor.maxCommittedHlc);
  if (!canonicalSnapshotJsonBytes(manifest).equals(canonicalSnapshotJsonBytes(expected))) {
    throw codecFailure(REASON.MANIFEST);
  }
  const local = db.prepare('SELECT name FROM sqlite_schema WHERE type = ?');
  if (boundedRows(local.bind('table')).some(({name}) => LOCAL_TABLES.includes(name))) {
    throw codecFailure(REASON.PAYLOAD_TABLES);
  }
  validateSchemaGraph(db, manifest.applicationSchema);
}

export {sealApplicationContent, validateApplicationContent};
