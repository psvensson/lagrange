import {createHash} from 'node:crypto';

import mysql from 'mysql2/promise';

const ONE = 1;
const MAX_PORT = 65535;

const TABLES = Object.freeze([
  Object.freeze({
    name: 'warehouse',
    columns: Object.freeze(['id', 'ytd_cents']),
    orderBy: Object.freeze(['id']),
  }),
  Object.freeze({
    name: 'district',
    columns: Object.freeze([
      'warehouse_id',
      'district_id',
      'ytd_cents',
      'next_order_id',
    ]),
    orderBy: Object.freeze(['warehouse_id', 'district_id']),
  }),
  Object.freeze({
    name: 'customer',
    columns: Object.freeze([
      'warehouse_id',
      'district_id',
      'customer_id',
      'balance_cents',
      'ytd_payment_cents',
      'payment_count',
      'delivery_count',
    ]),
    orderBy: Object.freeze(['warehouse_id', 'district_id', 'customer_id']),
  }),
  Object.freeze({
    name: 'item',
    columns: Object.freeze(['item_id', 'price_cents']),
    orderBy: Object.freeze(['item_id']),
  }),
  Object.freeze({
    name: 'stock',
    columns: Object.freeze([
      'warehouse_id',
      'item_id',
      'quantity',
      'ytd_quantity',
      'order_count',
      'remote_count',
    ]),
    orderBy: Object.freeze(['warehouse_id', 'item_id']),
  }),
  Object.freeze({
    name: 'orders',
    columns: Object.freeze([
      'warehouse_id',
      'district_id',
      'order_id',
      'customer_id',
      'carrier_id',
      'line_count',
      'all_local',
    ]),
    orderBy: Object.freeze(['warehouse_id', 'district_id', 'order_id']),
  }),
  Object.freeze({
    name: 'new_order',
    columns: Object.freeze(['warehouse_id', 'district_id', 'order_id']),
    orderBy: Object.freeze(['warehouse_id', 'district_id', 'order_id']),
  }),
  Object.freeze({
    name: 'order_line',
    columns: Object.freeze([
      'warehouse_id',
      'district_id',
      'order_id',
      'line_number',
      'item_id',
      'supply_warehouse_id',
      'quantity',
      'amount_cents',
      'delivered',
    ]),
    orderBy: Object.freeze([
      'warehouse_id',
      'district_id',
      'order_id',
      'line_number',
    ]),
  }),
  Object.freeze({
    name: 'history',
    columns: Object.freeze([
      'phase',
      'worker_id',
      'sequence_id',
      'customer_warehouse_id',
      'customer_district_id',
      'customer_id',
      'home_warehouse_id',
      'home_district_id',
      'amount_cents',
    ]),
    orderBy: Object.freeze(['phase', 'worker_id', 'sequence_id']),
  }),
]);

function normalizeEndpoint(value = {}) {
  const host = String(value.host || '').trim();
  const port = Number(value.port);
  if (!host) throw new Error('TiDB OLTP state snapshot requires endpoint.host');
  if (!Number.isInteger(port) || port < ONE || port > MAX_PORT) {
    throw new Error('TiDB OLTP state snapshot requires a valid endpoint.port');
  }
  return Object.freeze({host, port});
}

function connectionOptions(endpoint, databaseName) {
  return {
    host: endpoint.host,
    port: endpoint.port,
    user: 'root',
    password: '',
    database: databaseName,
    decimalNumbers: true,
    multipleStatements: false,
  };
}

function normalizeValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return value.toString('hex');
  if (value instanceof Date) return value.toISOString();
  return value;
}

function canonicalRows(rows, columns) {
  if (!Array.isArray(rows)) {
    throw new Error('TiDB OLTP state snapshot expected row array');
  }
  return Object.freeze(rows.map((row) => Object.freeze(
    columns.map((column) => normalizeValue(row[column])),
  )));
}

function stateDigest(state) {
  return createHash('sha256')
    .update(JSON.stringify(state))
    .digest('hex');
}

async function observeTiDbOltpStateSnapshot(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint);
  const databaseName = String(options.databaseName || '').trim();
  if (!databaseName) {
    throw new Error('TiDB OLTP state snapshot requires databaseName');
  }
  const connect = options.createConnection || mysql.createConnection;
  const connection = await connect(connectionOptions(endpoint, databaseName));
  try {
    const state = [];
    const rowCounts = {};
    for (const table of TABLES) {
      const sql = `SELECT ${table.columns.join(', ')} FROM ${table.name} ` +
        `ORDER BY ${table.orderBy.join(', ')}`;
      const [rows] = await connection.query(sql);
      const canonical = canonicalRows(rows, table.columns);
      state.push(Object.freeze({
        table: table.name,
        columns: table.columns,
        rows: canonical,
      }));
      rowCounts[table.name] = canonical.length;
    }
    const frozenState = Object.freeze(state);
    return Object.freeze({
      stateSha256: stateDigest(frozenState),
      rowCounts: Object.freeze(rowCounts),
      state: frozenState,
    });
  } finally {
    await connection.end();
  }
}

export {
  TABLES as TIDB_OLTP_SNAPSHOT_TABLES,
  observeTiDbOltpStateSnapshot,
};
