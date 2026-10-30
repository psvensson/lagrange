import pg from 'pg';

const {Client} = pg;
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

async function safeRollback(client) {
  if (!client) return;
  try {
    await client.query('ROLLBACK');
  } catch {
    // Transaction may already be aborted
  }
}

async function safeEnd(client) {
  if (!client) return;
  try {
    await client.end();
  } catch {
    // Preserving semantic result
  }
}

async function induceLagrangeRetryableConflict(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint);
  const connection = normalizeConnection(options.connection);
  const warehouseId = Number.isInteger(options.warehouseId) ?
    options.warehouseId : DEFAULT_WAREHOUSE_ID;
  const writeDeltaCents = Number.isInteger(options.writeDeltaCents) ?
    options.writeDeltaCents : DEFAULT_WRITE_DELTA_CENTS;
  const createClient = options.createClient || ((config) => new Client(config));

  let left = null;
  let right = null;

  try {
    left = createClient(clientOptions(endpoint, connection));
    right = createClient(clientOptions(endpoint, connection));
    await left.connect();
    await right.connect();

    await left.query('BEGIN');
    await right.query('BEGIN');

    await left.query(
      'SELECT ytd_cents FROM warehouse WHERE id = $1',
      [warehouseId],
    );
    await right.query(
      'SELECT ytd_cents FROM warehouse WHERE id = $1',
      [warehouseId],
    );

    await left.query(
      'UPDATE warehouse SET ytd_cents = ytd_cents + $1 WHERE id = $2',
      [writeDeltaCents, warehouseId],
    );
    await left.query('COMMIT');

    let rightError = null;
    try {
      await right.query(
        'UPDATE warehouse SET ytd_cents = ytd_cents + $1 WHERE id = $2',
        [writeDeltaCents, warehouseId],
      );
      await right.query('COMMIT');
    } catch (error) {
      rightError = error;
    }

    if (!rightError) {
      throw new Error(
        'Lagrange conflict probe expected conflict error, but both transactions succeeded',
      );
    }

    const victim = normalizeError(rightError, 'right');
    const results = Object.freeze([
      Object.freeze({side: 'left', succeeded: true, error: null}),
      Object.freeze({side: 'right', succeeded: false, error: victim}),
    ]);
    return Object.freeze({victim, results});
  } finally {
    await Promise.all([safeRollback(left), safeRollback(right)]);
    await Promise.all([safeEnd(left), safeEnd(right)]);
  }
}

export {
  induceLagrangeRetryableConflict,
};
