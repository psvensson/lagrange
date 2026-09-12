import mysql from 'mysql2/promise';

const ONE = 1;
const MAX_PORT = 65535;

function normalizeEndpoint(value = {}) {
  const host = String(value.host || '').trim();
  const port = Number(value.port);
  if (!host) throw new Error('TiDB visibility probe requires endpoint.host');
  if (!Number.isInteger(port) || port < ONE || port > MAX_PORT) {
    throw new Error('TiDB visibility probe requires a valid endpoint.port');
  }
  return Object.freeze({host, port});
}

function normalizeDatabaseName(value) {
  const databaseName = String(value || '').trim();
  if (!databaseName) throw new Error('TiDB visibility probe requires databaseName');
  return databaseName;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < ONE) {
    throw new Error(`${label} must be a positive integer`);
  }
  return number;
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

async function readWarehouseYtd(connection, warehouseId) {
  const [rows] = await connection.execute(
    'SELECT ytd_cents FROM warehouse WHERE id = ?',
    [warehouseId],
  );
  if (!Array.isArray(rows) || rows.length !== ONE) {
    throw new Error('TiDB visibility probe expected one warehouse row');
  }
  return Number(rows[0].ytd_cents);
}

async function closeConnections(connections) {
  const failures = [];
  for (const connection of connections) {
    if (!connection) continue;
    try {
      await connection.end();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'TiDB visibility probe cleanup failed');
  }
}

async function runTiDbVisibilityProbe(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint);
  const databaseName = normalizeDatabaseName(options.databaseName);
  const warehouseId = positiveInteger(options.warehouseId, 'warehouseId');
  const writeDeltaCents = positiveInteger(
    options.writeDeltaCents,
    'writeDeltaCents',
  );
  const connect = options.createConnection || mysql.createConnection;
  let writer = null;
  let observer = null;
  let writerTransactionOpen = false;
  let primaryError = null;
  let result = null;

  try {
    writer = await connect(connectionOptions(endpoint, databaseName));
    observer = await connect(connectionOptions(endpoint, databaseName));
    const initialWriterValue = await readWarehouseYtd(writer, warehouseId);
    const initialObserverValue = await readWarehouseYtd(observer, warehouseId);

    await writer.beginTransaction();
    writerTransactionOpen = true;
    await writer.execute(
      'UPDATE warehouse SET ytd_cents = ytd_cents + ? WHERE id = ?',
      [writeDeltaCents, warehouseId],
    );
    const writerOwnWriteValue = await readWarehouseYtd(writer, warehouseId);
    const observerUncommittedValue = await readWarehouseYtd(observer, warehouseId);
    await writer.rollback();
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
      await writer.rollback();
    } catch (rollbackError) {
      primaryError = primaryError ?
        new AggregateError(
          [primaryError, rollbackError],
          'TiDB visibility probe and rollback both failed',
        ) :
        rollbackError;
    }
  }

  let cleanupError = null;
  try {
    await closeConnections([writer, observer]);
  } catch (error) {
    cleanupError = error;
  }
  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      'TiDB visibility probe and cleanup both failed',
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return result;
}

export {
  runTiDbVisibilityProbe,
};
