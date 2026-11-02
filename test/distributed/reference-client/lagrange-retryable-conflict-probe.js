import {createPgWireClient} from './pg-wire-client.js';
import {runRetryableConflictProbe} from './retryable-conflict-probe.js';

const ONE = 1;
const DEFAULT_WAREHOUSE_ID = 1;
const DEFAULT_WRITE_DELTA_CENTS = 100;
const MAX_PORT = 65535;

function normalizeEndpoint(value = {}) {
  const host = String(value.host || '').trim();
  const port = Number(value.port);
  if (!host) throw new Error('Lagrange conflict probe requires endpoint.host');
  if (!Number.isInteger(port) || port < ONE || port > MAX_PORT) {
    throw new Error('Lagrange conflict probe requires a valid endpoint.port');
  }
  return Object.freeze({host, port});
}

function normalizeConnection(value = {}) {
  const user = String(value.user || '').trim();
  const database = String(value.database || '').trim();
  if (!user) throw new Error('Lagrange conflict probe requires connection.user');
  if (!database) {
    throw new Error('Lagrange conflict probe requires connection.database');
  }
  return Object.freeze({
    user,
    database,
    ...(value.password === undefined ? {} : {password: value.password}),
    ...(value.ssl === undefined ? {} : {ssl: value.ssl}),
  });
}

function clientOptions(endpoint, connection) {
  return {
    host: endpoint.host,
    port: endpoint.port,
    user: connection.user,
    database: connection.database,
    ...(connection.password === undefined ? {} : {password: connection.password}),
    ...(connection.ssl === undefined ? {} : {ssl: connection.ssl}),
    connectionTimeoutMillis: 10000,
  };
}

function normalizeError(error, side) {
  const code = String(error?.code || '');
  const sqlState = String(error?.sqlState || (code === '40001' ? '40001' : code || ''))
    .trim().toUpperCase();
  return Object.freeze({
    side,
    code,
    sqlState,
    message: String(error?.message || ''),
  });
}

// A pg-wire session for the shared probe.
function pgWireSession(client) {
  return {
    query: async (sql, parameters) => (await client.query(sql, parameters)).rows,
    begin: () => client.query('BEGIN'),
    commit: () => client.query('COMMIT'),
    rollback: () => client.query('ROLLBACK'),
    end: () => client.end(),
  };
}

/**
 * The shared retryable-conflict probe (retryable-conflict-probe.js) over the
 * public PostgreSQL wire (Lagrange, PostgreSQL).
 */
async function induceLagrangeRetryableConflict(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint);
  const connection = normalizeConnection(options.connection);
  const createClient = options.createClient || createPgWireClient;
  return runRetryableConflictProbe({
    openSession: async () => {
      const client = createClient(clientOptions(endpoint, connection));
      await client.connect();
      return pgWireSession(client);
    },
    statements: {read: 'SELECT ytd_cents FROM warehouse WHERE id = $1',
      update: 'UPDATE warehouse SET ytd_cents = ytd_cents + $1 WHERE id = $2'},
    describeError: normalizeError,
    warehouseId: Number.isInteger(options.warehouseId) ? options.warehouseId :
      DEFAULT_WAREHOUSE_ID,
    delta: Number.isInteger(options.writeDeltaCents) ? options.writeDeltaCents :
      DEFAULT_WRITE_DELTA_CENTS,
    retrySleep: options.retrySleep,
  });
}

export {
  induceLagrangeRetryableConflict,
};
