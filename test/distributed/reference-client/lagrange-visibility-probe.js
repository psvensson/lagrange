import pg from 'pg';

const {Client} = pg;
const ONE = 1;
const MAX_PORT = 65535;
const CONNECT_TIMEOUT_MS = 10000;
const QUERY_TIMEOUT_MS = 10000;
const INTEGER_TEXT_PATTERN = /^-?\d+$/u;

function normalizeEndpoint(value = {}) {
  const host = String(value.host || '').trim();
  const port = Number(value.port);
  if (!host) throw new Error('Lagrange visibility probe requires endpoint.host');
  if (!Number.isInteger(port) || port < ONE || port > MAX_PORT) {
    throw new Error('Lagrange visibility probe requires a valid endpoint.port');
  }
  return Object.freeze({host, port});
}

function normalizeConnection(value = {}) {
  const user = String(value.user || '').trim();
  const database = String(value.database || '').trim();
  if (!user) throw new Error('Lagrange visibility probe requires connection.user');
  if (!database) {
    throw new Error('Lagrange visibility probe requires connection.database');
  }
  return Object.freeze({
    user,
    database,
    ...(value.password === undefined ? {} : {password: value.password}),
    ...(value.ssl === undefined ? {} : {ssl: value.ssl}),
  });
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < ONE) {
    throw new Error(`${label} must be a positive integer`);
  }
  return number;
}

function clientOptions(endpoint, connection) {
  return {
    host: endpoint.host,
    port: endpoint.port,
    ...connection,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
  };
}

async function readWarehouseYtd(client, warehouseId) {
  const result = await client.query(
    'SELECT ytd_cents FROM warehouse WHERE id = $1',
    [warehouseId],
  );
  if (!Array.isArray(result?.rows) || result.rows.length !== ONE) {
    throw new Error('Lagrange visibility probe expected one warehouse row');
  }
  const raw = result.rows[0].ytd_cents;
  if (typeof raw !== 'number' &&
      !(typeof raw === 'string' && INTEGER_TEXT_PATTERN.test(raw))) {
    throw new Error('Lagrange visibility probe expected an integer warehouse ytd');
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error('Lagrange visibility probe expected an integer warehouse ytd');
  }
  return value;
}

async function openClient(createClient, options, clients) {
  const client = createClient(options);
  if (!client || typeof client.connect !== 'function' ||
      typeof client.query !== 'function' || typeof client.end !== 'function') {
    throw new Error('Lagrange visibility probe client factory returned an invalid client');
  }
  clients.push(client);
  await client.connect();
  return client;
}

async function closeClients(clients) {
  const failures = [];
  for (const client of clients) {
    try {
      await client.end();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Lagrange visibility probe cleanup failed');
  }
}

async function observeTransactionVisibility(writer, observer, warehouseId, writeDeltaCents) {
  let writerTransactionOpen = false;
  let primaryError = null;
  let result = null;
  try {
    await writer.query('BEGIN');
    writerTransactionOpen = true;
    const initialWriterValue = await readWarehouseYtd(writer, warehouseId);
    const initialObserverValue = await readWarehouseYtd(observer, warehouseId);

    const update = await writer.query(
      'UPDATE warehouse SET ytd_cents = ytd_cents + $1 WHERE id = $2',
      [writeDeltaCents, warehouseId],
    );
    if (update?.rowCount !== ONE) {
      throw new Error('Lagrange visibility probe update must affect one warehouse');
    }
    const writerOwnWriteValue = await readWarehouseYtd(writer, warehouseId);
    const observerUncommittedValue = await readWarehouseYtd(observer, warehouseId);
    await writer.query('ROLLBACK');
    writerTransactionOpen = false;

    result = Object.freeze({
      initialWriterValue,
      initialObserverValue,
      writerOwnWriteValue,
      observerUncommittedValue,
      writerAfterRollbackValue: await readWarehouseYtd(writer, warehouseId),
      observerAfterRollbackValue: await readWarehouseYtd(observer, warehouseId),
    });
  } catch (error) {
    primaryError = error;
  }

  if (writerTransactionOpen && writer) {
    try {
      await writer.query('ROLLBACK');
    } catch (rollbackError) {
      primaryError = primaryError ?
        new AggregateError(
          [primaryError, rollbackError],
          'Lagrange visibility probe and rollback both failed',
        ) :
        rollbackError;
    }
  }
  if (primaryError) throw primaryError;
  return result;
}

async function runLagrangeVisibilityProbe(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint);
  const connection = normalizeConnection(options.connection);
  const warehouseId = positiveInteger(options.warehouseId, 'warehouseId');
  const writeDeltaCents = positiveInteger(options.writeDeltaCents, 'writeDeltaCents');
  const createClient = options.createClient || ((config) => new Client(config));
  const config = clientOptions(endpoint, connection);
  const clients = [];
  let primaryError = null;
  let result = null;

  try {
    const writer = await openClient(createClient, config, clients);
    const observer = await openClient(createClient, config, clients);
    result = await observeTransactionVisibility(
      writer,
      observer,
      warehouseId,
      writeDeltaCents,
    );
  } catch (error) {
    primaryError = error;
  }
  let cleanupError = null;
  try {
    await closeClients(clients);
  } catch (error) {
    cleanupError = error;
  }
  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      'Lagrange visibility probe and cleanup both failed',
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return result;
}

export {
  runLagrangeVisibilityProbe,
};
