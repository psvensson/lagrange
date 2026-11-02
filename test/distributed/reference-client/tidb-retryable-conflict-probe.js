import {runRetryableConflictProbe} from './retryable-conflict-probe.js';

const ZERO = 0;
const ONE = 1;
const MAX_PORT = 65535;
const DEFAULT_WRITE_DELTA_CENTS = 100;

async function defaultCreateConnection(options) {
  const mysql = await import('mysql2/promise');
  return (mysql.default || mysql).createConnection(options);
}

function normalizeEndpoint(value = {}) {
  const host = String(value.host || '').trim();
  const port = Number(value.port);
  if (!host) throw new Error('TiDB conflict probe requires endpoint.host');
  if (!Number.isInteger(port) || port < ONE || port > MAX_PORT) {
    throw new Error('TiDB conflict probe requires a valid endpoint.port');
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

function normalizeError(error, side) {
  return Object.freeze({
    side,
    code: String(error?.code || ''),
    errno: Number(error?.errno || ZERO),
    sqlState: String(error?.sqlState || '').trim().toUpperCase(),
    sqlMessage: String(error?.sqlMessage || error?.message || ''),
  });
}

// A mysql session for the shared probe, in TiDB's pessimistic mode.
async function tidbSession(connect, endpoint, databaseName) {
  const connection = await connect(connectionOptions(endpoint, databaseName));
  await connection.query('SET SESSION tidb_txn_mode = \'pessimistic\'');
  return {
    query: async (sql, parameters) => (await connection.execute(sql, parameters))[ZERO],
    begin: () => connection.beginTransaction(),
    commit: () => connection.commit(),
    rollback: () => connection.rollback(),
    end: () => connection.end(),
  };
}

/**
 * The shared retryable-conflict probe (retryable-conflict-probe.js) over the
 * TiDB mysql wire: the same two conflicting logical requests and the same
 * observable contract as every other arm.
 */
async function induceTiDbRetryableConflict(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint);
  const databaseName = String(options.databaseName || '').trim();
  if (!databaseName) throw new Error('TiDB conflict probe requires databaseName');
  const connect = options.createConnection || defaultCreateConnection;
  return runRetryableConflictProbe({
    openSession: () => tidbSession(connect, endpoint, databaseName),
    statements: {read: 'SELECT ytd_cents FROM warehouse WHERE id = ?',
      update: 'UPDATE warehouse SET ytd_cents = ytd_cents + ? WHERE id = ?'},
    describeError: normalizeError,
    warehouseId: Number.isInteger(options.warehouseId) ? options.warehouseId : ONE,
    delta: Number.isInteger(options.writeDeltaCents) ? options.writeDeltaCents :
      DEFAULT_WRITE_DELTA_CENTS,
    retrySleep: options.retrySleep,
  });
}

export {
  induceTiDbRetryableConflict,
};
