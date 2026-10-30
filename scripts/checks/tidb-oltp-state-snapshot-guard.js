import assert from 'node:assert/strict';

import {
  TIDB_OLTP_SNAPSHOT_TABLES,
  observeTiDbOltpStateSnapshot,
} from '../../test/distributed/reference-client/tidb-oltp-state-snapshot.js';

const arrayFind = Function.call.bind(Array.prototype.find);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringIncludes = Function.call.bind(String.prototype.includes);

const DEFAULT_PORT = 4000;
const ENDPOINT = Object.freeze({host: '127.0.0.1', port: DEFAULT_PORT});
const DATABASE_NAME = 'snapshot_guard';
const COLUMN_ID = 'id';
const SUFFIX_COUNT = '_count';
const SUFFIX_CENTS = '_cents';
const COLUMN_QUANTITY = 'quantity';
const COLUMN_DELIVERED = 'delivered';
const COLUMN_ALL_LOCAL = 'all_local';
const EXPECTED_TABLE_COUNT = 9;
const PASS_MESSAGE = 'tidb-oltp-state-snapshot-guard: PASS';

function tableNameFromSql(sql) {
  const match = String(sql).match(/\bFROM\s+([a-z_]+)\b/u);
  if (!match) throw new Error(`snapshot guard could not parse query: ${sql}`);
  return match[1];
}

function rowFor(table, variant) {
  return Object.fromEntries(arrayMap(table.columns, (column, index) => [
    column,
    stringIncludes(column, COLUMN_ID) ||
      stringEndsWith(column, SUFFIX_COUNT) ||
      stringEndsWith(column, SUFFIX_CENTS) ||
      column === COLUMN_QUANTITY ||
      column === COLUMN_DELIVERED ||
      column === COLUMN_ALL_LOCAL ?
      index + variant :
      `${column}-${variant}`,
  ]));
}

function createConnectionFactory(variant, trace) {
  return async (options) => {
    trace.options.push(options);
    return {
      async query(sql) {
        trace.queries.push(sql);
        const tableName = tableNameFromSql(sql);
        const table = arrayFind(
          TIDB_OLTP_SNAPSHOT_TABLES,
          ({name}) => name === tableName,
        );
        if (!table) throw new Error(`unexpected snapshot table ${tableName}`);
        return [[rowFor(table, variant)]];
      },
      async end() {
        trace.closed += 1;
      },
    };
  };
}

async function takeSnapshot(variant) {
  const trace = {options: [], queries: [], closed: 0};
  const snapshot = await observeTiDbOltpStateSnapshot({
    endpoint: ENDPOINT,
    databaseName: DATABASE_NAME,
    createConnection: createConnectionFactory(variant, trace),
  });
  return {snapshot, trace};
}

const first = await takeSnapshot(1);
const repeated = await takeSnapshot(1);
const changed = await takeSnapshot(2);

assert.equal(TIDB_OLTP_SNAPSHOT_TABLES.length, EXPECTED_TABLE_COUNT);
assert.match(first.snapshot.stateSha256, /^[0-9a-f]{64}$/u);
assert.equal(first.snapshot.stateSha256, repeated.snapshot.stateSha256);
assert.notEqual(first.snapshot.stateSha256, changed.snapshot.stateSha256);
assert.equal(first.trace.queries.length, TIDB_OLTP_SNAPSHOT_TABLES.length);
assert.equal(first.trace.closed, 1);
assert.equal(first.trace.options.length, 1);
assert.equal(first.trace.options[0].database, DATABASE_NAME);
assert.equal(first.trace.options[0].multipleStatements, false);

for (const table of TIDB_OLTP_SNAPSHOT_TABLES) {
  assert.equal(first.snapshot.rowCounts[table.name], 1);
}
assert.deepEqual(
  arrayMap(first.snapshot.state, ({table}) => table),
  arrayMap(TIDB_OLTP_SNAPSHOT_TABLES, ({name}) => name),
);

await assert.rejects(
  observeTiDbOltpStateSnapshot({
    endpoint: {host: '', port: DEFAULT_PORT},
    databaseName: DATABASE_NAME,
    createConnection: createConnectionFactory(1, {options: [], queries: []}),
  }),
  /requires endpoint.host/u,
);

console.log(PASS_MESSAGE);
