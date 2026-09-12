import assert from 'node:assert/strict';

import {
  TIDB_OLTP_SNAPSHOT_TABLES,
  observeTiDbOltpStateSnapshot,
} from '../../test/distributed/reference-client/tidb-oltp-state-snapshot.js';

const ENDPOINT = Object.freeze({host: '127.0.0.1', port: 4000});
const DATABASE_NAME = 'snapshot_guard';

function tableNameFromSql(sql) {
  const match = String(sql).match(/\bFROM\s+([a-z_]+)\b/u);
  if (!match) throw new Error(`snapshot guard could not parse query: ${sql}`);
  return match[1];
}

function rowFor(table, variant) {
  return Object.fromEntries(table.columns.map((column, index) => [
    column,
    column.includes('id') || column.endsWith('_count') ||
      column.endsWith('_cents') || column === 'quantity' ||
      column === 'delivered' || column === 'all_local' ?
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
        const table = TIDB_OLTP_SNAPSHOT_TABLES.find(
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

assert.equal(TIDB_OLTP_SNAPSHOT_TABLES.length, 9);
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
  first.snapshot.state.map(({table}) => table),
  TIDB_OLTP_SNAPSHOT_TABLES.map(({name}) => name),
);

assert.throws(
  () => observeTiDbOltpStateSnapshot({
    endpoint: {host: '', port: 4000},
    databaseName: DATABASE_NAME,
    createConnection: createConnectionFactory(1, {options: [], queries: []}),
  }),
  /requires endpoint.host/u,
);

console.log('tidb-oltp-state-snapshot-guard: PASS');
