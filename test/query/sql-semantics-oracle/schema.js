/**
 * The differential oracle's tables, declared through the real catalog path:
 * SQLParser -> TableCreationService.buildSchemaDefinition -> the partition DDL
 * renderer (renderTableDefinitionSql, src/query/sql-table-definition.js). The partitions create their table from
 * that schema themselves; the single-database oracle executes the same
 * rendered DDL, so both sides hold exactly the tables the product creates.
 * Whether the rendered DDL keeps the user's declared affinity and collation is
 * the round-trip layer's question (sql-render-round-trip-fidelity), not an
 * assumption made here.
 */

import Database from 'better-sqlite3';

import {generateCreateIndexSQL} from '../../../src/bootstrap/system-table-schema-sql.js';
import {SQLParser} from '../../../src/query/sql-parser.js';
import {TableCreationService} from '../../../src/query/table-creation-service.js';
import {renderTableDefinitionSql} from '../../../src/query/sql-table-definition.js';

// §4.1 declares `a` and `v` without a type. The front end refuses a column
// without a type (an untyped TypeError, kept as the round-trip golden cases
// DDL-design-schema-t/u), so the executable schema declares them BLOB: a declared
// type containing "BLOB" and an absent type give the identical BLOB affinity
// (sqlite.org/datatype3.html §3.1 rule 3), so mixed storage classes survive.
// w is family F11's table: declared type names the catalog rewrites
// (normalizeDataType). §4.1 also lists UNSIGNED BIG INT and a bare untyped
// column; the front end refuses both, so they are F11 DDL golden cases
// (golden-divergences.json) rather than columns every layout must create.
// s has a TEXT primary key: its rowid is not its key, so scan order and key
// order can differ (design re-review 2026-11-17).
const ORACLE_SCHEMA_DDL = Object.freeze({
  t: 'CREATE TABLE t (id INTEGER PRIMARY KEY, i INTEGER, r REAL, n NUMERIC, ' +
    'x TEXT, c TEXT COLLATE NOCASE, z TEXT COLLATE RTRIM, b BLOB, a BLOB)',
  u: 'CREATE TABLE u (k INTEGER PRIMARY KEY, tk TEXT COLLATE NOCASE, v BLOB)',
  w: 'CREATE TABLE w (id INTEGER PRIMARY KEY, nu NUMERIC, de DECIMAL(10,2), ' +
    'bo BOOLEAN, d DATE, ts TIMESTAMP, vc VARCHAR(20))',
  s: 'CREATE TABLE s (sk TEXT PRIMARY KEY, sn INTEGER, sv BLOB, sc TEXT COLLATE NOCASE)',
});

const TABLE_NAMES = Object.freeze(['t', 'u', 'w', 's']);
const KEY_KIND = Object.freeze({INTEGER: 'INTEGER', TEXT: 'TEXT'});
const TABLE_KEY_KIND = Object.freeze({t: KEY_KIND.INTEGER, u: KEY_KIND.INTEGER,
  w: KEY_KIND.INTEGER, s: KEY_KIND.TEXT});
const TEXT_KEY_WIDTH = 3;

// Secondary indexes (design re-review 2026-11-17): an index-driven scan can
// change an order-dependent result. The partitions create them from the
// schema's `indices` through the product's index renderer
// (generateCreateIndexSQL); the indexed reference runs the same statements.
const SECONDARY_INDEXES = Object.freeze({
  t: Object.freeze([{name: 't_c', columns: ['c']}, {name: 't_a', columns: ['a']}]),
  s: Object.freeze([{name: 's_sn', columns: ['sn']}]),
});

// Partition layouts (§4.1). Keys live in KEY_SPACE; a layout of n partitions
// splits it at 1 + floor(span * i / n), so rows placed at 10, 30, 50, 70 and
// 90 land in distinct partitions for every layout of two or more.
const LAYOUTS = Object.freeze([1, 2, 3, 5]);
const KEY_SPACE = Object.freeze({min: 1, max: 100});

function layoutSplitKeys(partitionCount) {
  const span = KEY_SPACE.max - KEY_SPACE.min + 1;
  const splits = [];
  for (let index = 1; index < partitionCount; index += 1) {
    splits.push(KEY_SPACE.min + Math.floor(span * index / partitionCount));
  }
  return splits;
}

/**
 * The TEXT key at a position of the key space ('k001' .. 'k100'); their
 * ASCII order is the key-space order.
 * @param {number} position
 * @return {string}
 */
function textKey(position) {
  return `k${String(position).padStart(TEXT_KEY_WIDTH, '0')}`;
}

function layoutRanges(partitionCount, keyKind = KEY_KIND.INTEGER) {
  const asKey = (split) => (keyKind === KEY_KIND.TEXT ? textKey(split) : split);
  const splits = layoutSplitKeys(partitionCount).map(asKey);
  const bounds = [null, ...splits, null];
  return splits.concat([null]).map((_split, index) => ({
    start: bounds[index],
    end: bounds[index + 1],
  }));
}

function declareCatalogTable(tableName, ddl) {
  const ast = new SQLParser(ddl).parse();
  const schema = TableCreationService.prototype.buildSchemaDefinition(
    ast.columns, ast);
  const indices = SECONDARY_INDEXES[tableName] || [];
  if (indices.length > 0) Object.assign(schema, {tableName, indices});
  return Object.freeze({
    tableName,
    declaredDdl: ddl,
    schema,
    renderedDdl: renderTableDefinitionSql(tableName, schema),
    columns: Object.freeze(schema.columns.map((column) => column.name)),
    primaryKey: schema.primaryKey[0],
    keyKind: TABLE_KEY_KIND[tableName] ?? KEY_KIND.INTEGER,
    indexDdl: Object.freeze(generateCreateIndexSQL({tableName, indices})),
  });
}

function declareOracleTables() {
  return Object.freeze(Object.fromEntries(TABLE_NAMES.map((name) =>
    [name, declareCatalogTable(name, ORACLE_SCHEMA_DDL[name])])));
}

// Fixture values in JSON (golden-divergences.json) name their storage class:
// a JSON number binds REAL (better-sqlite3 binds every JS number as REAL),
// {"int": "<decimal>"} binds INTEGER (BigInt), {"blob": "<base64>"} BLOB,
// {"real": "-0" | "Infinity" | "-Infinity"} the reals JSON cannot spell, a
// string TEXT and null NULL.
function fixtureValue(json) {
  if (json === null || typeof json === 'string' || typeof json === 'number' ||
      typeof json === 'bigint' || Buffer.isBuffer(json)) {
    return json;
  }
  if (typeof json.int === 'string') return BigInt(json.int);
  if (typeof json.blob === 'string') return Buffer.from(json.blob, 'base64');
  if (typeof json.real === 'string') return Number(json.real);
  throw new Error(`unknown fixture value ${JSON.stringify(json)}`);
}

function fixtureRows(rowsByTable) {
  const rows = {};
  for (const name of TABLE_NAMES) {
    rows[name] = (rowsByTable?.[name] || []).map((row) => Object.fromEntries(
      Object.entries(row).map(([column, value]) => [column, fixtureValue(value)])));
  }
  return rows;
}

// ---- column behaviour, decided by SQLite --------------------------------------

// Values whose stored class and text reveal a column's affinity
// (sqlite.org/datatype3.html §3): each affinity stores a different subset of
// them differently.
const AFFINITY_PROBES = Object.freeze([1n, 1.0, 2.5, '1', '1.0', ' 2', '3e0', 'abc', '0x10',
  Buffer.from('A'), null, '2024-01-01', 'true', '9223372036854775808']);

function quoteIdentifier(name) {
  return `"${name.replaceAll('"', '""')}"`;
}

function collationOf(db, tableName, column, primaryKey) {
  const table = quoteIdentifier(tableName);
  db.prepare(`DELETE FROM ${table}`).run();
  db.prepare(`INSERT INTO ${table} (${quoteIdentifier(primaryKey)}, ${quoteIdentifier(column)}) ` +
    'VALUES (1, \'a\')').run();
  const probe = db.prepare(`SELECT ${quoteIdentifier(column)} = 'A' AS nocase, ` +
    `${quoteIdentifier(column)} = 'a  ' AS rtrim FROM ${table}`).get();
  return probe.nocase === 1 ? 'NOCASE' : probe.rtrim === 1 ? 'RTRIM' : 'BINARY';
}

function affinityOf(db, tableName, column, primaryKey) {
  const table = quoteIdentifier(tableName);
  db.prepare(`DELETE FROM ${table}`).run();
  const insert = db.prepare(`INSERT INTO ${table} (${quoteIdentifier(primaryKey)}, ` +
    `${quoteIdentifier(column)}) VALUES (?, ?)`);
  AFFINITY_PROBES.forEach((value, index) => insert.run(BigInt(index + 1), value));
  return db.prepare(`SELECT typeof(${quoteIdentifier(column)}) || ':' || ` +
    `quote(${quoteIdentifier(column)}) FROM ${table} ORDER BY ${quoteIdentifier(primaryKey)}`)
    .pluck().all().join(' ');
}

/**
 * How SQLite stores and compares each column of one CREATE TABLE: the
 * observable behaviour of its declared affinity and collation.
 * @param {string} ddl - CREATE TABLE statement.
 * @param {string} tableName
 * @param {string} primaryKey
 * @return {Object} column -> {affinity, collation}
 */
function columnBehaviour(ddl, tableName, primaryKey) {
  const db = new Database(':memory:');
  try {
    db.exec(ddl);
    const columns = db.prepare('SELECT name FROM pragma_table_info(?)').pluck().all(tableName);
    return Object.fromEntries(columns.map((column) => [column, {
      affinity: column === primaryKey ? 'primary-key' :
        affinityOf(db, tableName, column, primaryKey),
      collation: column === primaryKey ? 'primary-key' :
        collationOf(db, tableName, column, primaryKey),
    }]));
  } finally {
    db.close();
  }
}

/**
 * The collations SQLite applies to t's columns, under the rendered DDL the
 * partitions run and under the DDL as declared.
 * @param {Object} tables - declareOracleTables().
 * @return {{rendered: Object, declared: Object}} column -> collation
 */
function effectiveCollations(tables) {
  const collationsOf = (ddl) => Object.fromEntries(Object.entries(
    columnBehaviour(ddl, 't', tables.t.primaryKey)).map(([column, behaviour]) =>
    [column, behaviour.collation === 'BINARY' || behaviour.collation === 'primary-key' ?
      null : behaviour.collation]));
  return {
    rendered: collationsOf(tables.t.renderedDdl),
    declared: collationsOf(ORACLE_SCHEMA_DDL.t),
  };
}

export {
  KEY_KIND,
  KEY_SPACE,
  LAYOUTS,
  ORACLE_SCHEMA_DDL,
  TABLE_NAMES,
  columnBehaviour,
  declareCatalogTable,
  declareOracleTables,
  effectiveCollations,
  fixtureRows,
  fixtureValue,
  layoutRanges,
  textKey,
};
