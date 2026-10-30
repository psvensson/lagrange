import pg from 'pg';

import {
  buildOltpBaselineDataset,
  hashOltpBaselineDataset,
  summarizeOltpBaselineDataset,
} from '../harness/oltp-baseline-dataset.js';
import {
  resolveOltpBaselineConfig,
} from '../harness/oltp-baseline-workload.js';
import {
  OLTP_SQL_STATEMENT,
  executeOltpBaselineTransaction,
} from '../harness/oltp-baseline-transaction-executor.js';

const {Client} = pg;
const ZERO = 0;
const ONE = 1;
const INSERT_BATCH_SIZE = 100;
const DEFAULT_CONNECT_TIMEOUT_MS = 10000;
const PUBLIC_PROTOCOL = 'postgresql';
const PUBLIC_EXECUTION_PATH = 'public-sql';
const LOCKING_READ_MODE = 'snapshot-write-conflict';

const SQL = Object.freeze({
  [OLTP_SQL_STATEMENT.DISTRICT_NEXT_ORDER_FOR_UPDATE]:
    'SELECT next_order_id FROM district ' +
    'WHERE warehouse_id = $1 AND district_id = $2',
  [OLTP_SQL_STATEMENT.DISTRICT_SET_NEXT_ORDER]:
    'UPDATE district SET next_order_id = $1 ' +
    'WHERE warehouse_id = $2 AND district_id = $3',
  [OLTP_SQL_STATEMENT.ORDER_INSERT]:
    'INSERT INTO orders ' +
    '(warehouse_id, district_id, order_id, customer_id, carrier_id, ' +
    'line_count, all_local) VALUES ($1, $2, $3, $4, NULL, $5, $6)',
  [OLTP_SQL_STATEMENT.NEW_ORDER_INSERT]:
    'INSERT INTO new_order (warehouse_id, district_id, order_id) ' +
    'VALUES ($1, $2, $3)',
  [OLTP_SQL_STATEMENT.ITEM_PRICE]:
    'SELECT price_cents FROM item WHERE item_id = $1',
  [OLTP_SQL_STATEMENT.STOCK_QUANTITY_FOR_UPDATE]:
    'SELECT quantity FROM stock ' +
    'WHERE warehouse_id = $1 AND item_id = $2',
  [OLTP_SQL_STATEMENT.STOCK_UPDATE]:
    'UPDATE stock SET quantity = $1, ytd_quantity = ytd_quantity + $2, ' +
    'order_count = order_count + 1, remote_count = remote_count + $3 ' +
    'WHERE warehouse_id = $4 AND item_id = $5',
  [OLTP_SQL_STATEMENT.ORDER_LINE_INSERT]:
    'INSERT INTO order_line ' +
    '(warehouse_id, district_id, order_id, line_number, item_id, ' +
    'supply_warehouse_id, quantity, amount_cents, delivered) ' +
    'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)',
  [OLTP_SQL_STATEMENT.WAREHOUSE_PAYMENT]:
    'UPDATE warehouse SET ytd_cents = ytd_cents + $1 WHERE id = $2',
  [OLTP_SQL_STATEMENT.DISTRICT_PAYMENT]:
    'UPDATE district SET ytd_cents = ytd_cents + $1 ' +
    'WHERE warehouse_id = $2 AND district_id = $3',
  [OLTP_SQL_STATEMENT.CUSTOMER_PAYMENT]:
    'UPDATE customer SET balance_cents = balance_cents - $1, ' +
    'ytd_payment_cents = ytd_payment_cents + $2, ' +
    'payment_count = payment_count + 1 ' +
    'WHERE warehouse_id = $3 AND district_id = $4 AND customer_id = $5',
  [OLTP_SQL_STATEMENT.HISTORY_INSERT]:
    'INSERT INTO history ' +
    '(phase, worker_id, sequence_id, customer_warehouse_id, ' +
    'customer_district_id, customer_id, home_warehouse_id, ' +
    'home_district_id, amount_cents) ' +
    'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
  [OLTP_SQL_STATEMENT.ORDER_STATUS_LATEST]:
    'SELECT order_id, carrier_id FROM orders ' +
    'WHERE warehouse_id = $1 AND district_id = $2 AND customer_id = $3 ' +
    'ORDER BY order_id DESC LIMIT 1',
  [OLTP_SQL_STATEMENT.ORDER_STATUS_LINES]:
    'SELECT line_number, item_id, supply_warehouse_id, quantity, ' +
    'amount_cents, delivered FROM order_line ' +
    'WHERE warehouse_id = $1 AND district_id = $2 AND order_id = $3 ' +
    'ORDER BY line_number',
  [OLTP_SQL_STATEMENT.DELIVERY_OLDEST_NEW_ORDER_FOR_UPDATE]:
    'SELECT order_id FROM new_order ' +
    'WHERE warehouse_id = $1 AND district_id = $2 ' +
    'ORDER BY order_id ASC LIMIT 1',
  [OLTP_SQL_STATEMENT.DELIVERY_DELETE_NEW_ORDER]:
    'DELETE FROM new_order ' +
    'WHERE warehouse_id = $1 AND district_id = $2 AND order_id = $3',
  [OLTP_SQL_STATEMENT.DELIVERY_ORDER_FOR_UPDATE]:
    'SELECT customer_id FROM orders ' +
    'WHERE warehouse_id = $1 AND district_id = $2 AND order_id = $3',
  [OLTP_SQL_STATEMENT.DELIVERY_SET_CARRIER]:
    'UPDATE orders SET carrier_id = $1 ' +
    'WHERE warehouse_id = $2 AND district_id = $3 AND order_id = $4',
  [OLTP_SQL_STATEMENT.DELIVERY_LINES_FOR_UPDATE]:
    'SELECT amount_cents FROM order_line ' +
    'WHERE warehouse_id = $1 AND district_id = $2 AND order_id = $3 ' +
    'ORDER BY line_number',
  [OLTP_SQL_STATEMENT.DELIVERY_MARK_LINES]:
    'UPDATE order_line SET delivered = 1 ' +
    'WHERE warehouse_id = $1 AND district_id = $2 AND order_id = $3',
  [OLTP_SQL_STATEMENT.DELIVERY_CUSTOMER_UPDATE]:
    'UPDATE customer SET balance_cents = balance_cents + $1, ' +
    'delivery_count = delivery_count + 1 ' +
    'WHERE warehouse_id = $2 AND district_id = $3 AND customer_id = $4',
  [OLTP_SQL_STATEMENT.STOCK_LEVEL_DISTRICT]:
    'SELECT next_order_id FROM district ' +
    'WHERE warehouse_id = $1 AND district_id = $2',
  [OLTP_SQL_STATEMENT.STOCK_LEVEL_COUNT]:
    'SELECT COUNT(DISTINCT ol.item_id) AS low_stock ' +
    'FROM order_line AS ol JOIN stock AS s ' +
    'ON s.warehouse_id = $1 AND s.item_id = ol.item_id ' +
    'WHERE ol.warehouse_id = $2 AND ol.district_id = $3 ' +
    'AND ol.order_id >= $4 AND ol.order_id < $5 AND s.quantity < $6',
});

const DROP_TABLES = Object.freeze([
  'history',
  'order_line',
  'new_order',
  'orders',
  'stock',
  'item',
  'customer',
  'district',
  'warehouse',
]);

const CREATE_SCHEMA = Object.freeze([
  'CREATE TABLE warehouse (' +
    'id INTEGER PRIMARY KEY, ytd_cents BIGINT NOT NULL)',
  'CREATE TABLE district (' +
    'warehouse_id INTEGER NOT NULL, district_id INTEGER NOT NULL, ' +
    'ytd_cents BIGINT NOT NULL, next_order_id INTEGER NOT NULL, ' +
    'PRIMARY KEY (warehouse_id, district_id))',
  'CREATE TABLE customer (' +
    'warehouse_id INTEGER NOT NULL, district_id INTEGER NOT NULL, ' +
    'customer_id INTEGER NOT NULL, balance_cents BIGINT NOT NULL, ' +
    'ytd_payment_cents BIGINT NOT NULL, payment_count INTEGER NOT NULL, ' +
    'delivery_count INTEGER NOT NULL, ' +
    'PRIMARY KEY (warehouse_id, district_id, customer_id))',
  'CREATE TABLE item (' +
    'item_id INTEGER PRIMARY KEY, price_cents INTEGER NOT NULL)',
  'CREATE TABLE stock (' +
    'warehouse_id INTEGER NOT NULL, item_id INTEGER NOT NULL, quantity INTEGER NOT NULL, ' +
    'ytd_quantity BIGINT NOT NULL, order_count BIGINT NOT NULL, ' +
    'remote_count BIGINT NOT NULL, ' +
    'PRIMARY KEY (warehouse_id, item_id))',
  'CREATE TABLE orders (' +
    'warehouse_id INTEGER NOT NULL, district_id INTEGER NOT NULL, ' +
    'order_id INTEGER NOT NULL, customer_id INTEGER NOT NULL, ' +
    'carrier_id INTEGER, line_count INTEGER NOT NULL, all_local INTEGER NOT NULL, ' +
    'PRIMARY KEY (warehouse_id, district_id, order_id))',
  'CREATE TABLE new_order (' +
    'warehouse_id INTEGER NOT NULL, district_id INTEGER NOT NULL, ' +
    'order_id INTEGER NOT NULL, ' +
    'PRIMARY KEY (warehouse_id, district_id, order_id))',
  'CREATE TABLE order_line (' +
    'warehouse_id INTEGER NOT NULL, district_id INTEGER NOT NULL, ' +
    'order_id INTEGER NOT NULL, line_number INTEGER NOT NULL, item_id INTEGER NOT NULL, ' +
    'supply_warehouse_id INTEGER NOT NULL, quantity INTEGER NOT NULL, ' +
    'amount_cents BIGINT NOT NULL, delivered INTEGER NOT NULL DEFAULT 0, ' +
    'PRIMARY KEY (warehouse_id, district_id, order_id, line_number))',
  'CREATE TABLE history (' +
    'phase TEXT NOT NULL, worker_id INTEGER NOT NULL, sequence_id INTEGER NOT NULL, ' +
    'customer_warehouse_id INTEGER NOT NULL, customer_district_id INTEGER NOT NULL, ' +
    'customer_id INTEGER NOT NULL, home_warehouse_id INTEGER NOT NULL, ' +
    'home_district_id INTEGER NOT NULL, amount_cents BIGINT NOT NULL, ' +
    'PRIMARY KEY (phase, worker_id, sequence_id))',
]);

function normalizeEndpoint(endpoint = {}) {
  const host = String(endpoint.host || '').trim();
  const port = Number(endpoint.port);
  if (!host) throw new Error('Lagrange OLTP adapter requires endpoint.host');
  if (!Number.isInteger(port) || port < ONE || port > 65535) {
    throw new Error('Lagrange OLTP adapter requires a valid endpoint.port');
  }
  return Object.freeze({host, port});
}

function normalizeConnection(connection = {}) {
  const user = String(connection.user || '').trim();
  const database = String(connection.database || '').trim();
  if (!user) throw new Error('Lagrange OLTP adapter requires connection.user');
  if (!database) {
    throw new Error('Lagrange OLTP adapter requires connection.database');
  }
  return Object.freeze({
    user,
    database,
    ...(connection.password === undefined ? {} : {password: connection.password}),
    ...(connection.ssl === undefined ? {} : {ssl: connection.ssl}),
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
    connectionTimeoutMillis: DEFAULT_CONNECT_TIMEOUT_MS,
  };
}

function defaultClientFactory(options) {
  return new Client(options);
}

async function openClient(createClient, options) {
  const client = createClient(options);
  if (!client || typeof client.connect !== 'function' ||
      typeof client.query !== 'function' || typeof client.end !== 'function') {
    throw new Error('Lagrange OLTP client factory returned an invalid client');
  }
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
  if (failures.length > ZERO) {
    throw new AggregateError(failures, 'Lagrange OLTP connection cleanup failed');
  }
}

function createLagrangeSession(client) {
  const session = {
    async transaction(callback) {
      await client.query('BEGIN');
      try {
        const result = await callback(session);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            'Lagrange OLTP transaction and rollback both failed',
          );
        }
        throw error;
      }
    },
    async execute(statementId, parameters = []) {
      const sql = SQL[statementId];
      if (!sql) throw new Error(`Lagrange OLTP unknown statement ${statementId}`);
      const result = await client.query(sql, parameters);
      return {
        rows: Array.isArray(result?.rows) ? result.rows : [],
        rowCount: Number.isFinite(result?.rowCount) ? Number(result.rowCount) : ZERO,
      };
    },
  };
  return session;
}

function placeholders(rowWidth, rowCount) {
  let parameter = ONE;
  return Array.from({length: rowCount}, () => {
    const row = Array.from({length: rowWidth}, () => `$${parameter++}`);
    return `(${row.join(',')})`;
  }).join(',');
}

async function insertRows(client, table, columns, rows) {
  for (let offset = ZERO; offset < rows.length; offset += INSERT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + INSERT_BATCH_SIZE);
    await client.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ` +
        placeholders(columns.length, batch.length),
      batch.flat(),
    );
  }
}

// Lagrange's SQL engine does not execute DROP TABLE yet (the statement parses
// and the executor refuses it as an unsupported statement type). The proof
// runs against a freshly formed cluster, so the reset drops only tables that
// actually exist: a fresh cluster skips every drop honestly, and a reused
// cluster that still holds the schema fails loudly on the product gap rather
// than silently loading on top of stale rows.
const TABLE_NOT_FOUND_MARKER = 'Table not found';
const DROP_TABLE_UNSUPPORTED_MARKER = 'Unsupported statement type: DROP_TABLE';

async function tableExists(client, table) {
  try {
    await client.query(`SELECT COUNT(*) AS row_count FROM ${table}`);
    return true;
  } catch (error) {
    if (String(error?.message || '').includes(TABLE_NOT_FOUND_MARKER)) {
      return false;
    }
    throw error;
  }
}

async function dropExistingTables(client, {tolerateUnsupportedDrop = false} = {}) {
  const skipped = [];
  for (const table of DROP_TABLES) {
    if (!(await tableExists(client, table))) continue;
    try {
      await client.query(`DROP TABLE IF EXISTS ${table}`);
    } catch (error) {
      const unsupported =
        String(error?.message || '').includes(DROP_TABLE_UNSUPPORTED_MARKER);
      if (unsupported && tolerateUnsupportedDrop) {
        skipped.push(table);
        continue;
      }
      throw error;
    }
  }
  return Object.freeze(skipped);
}

// CREATE TABLE on Lagrange is a durable provisioning job. When the job
// outlives the statement's provisioning deadline the wire handler answers
// 55P03 (lock_not_available) "Schema provisioning remains active" with the
// job id and a retry_after_ms hint instead of blocking the connection. The
// schema load honours that contract: it waits the hinted interval and polls
// the table's existence until the provisioning settles or the bounded wait
// expires. The CREATE statement is not re-issued (the job already owns it).
const SCHEMA_PROVISIONING_ACTIVE_SQLSTATE = '55P03';
const SCHEMA_PROVISIONING_ACTIVE_MARKER = 'Schema provisioning remains active';
const SCHEMA_PROVISIONING_DEFAULT_RETRY_MS = 500;
const SCHEMA_PROVISIONING_WAIT_BUDGET_MS = 120000;
const CREATE_TABLE_NAME_PATTERN = /^\s*CREATE\s+TABLE\s+([A-Za-z0-9_]+)/iu;

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSchemaProvisioningActive(error) {
  return error?.code === SCHEMA_PROVISIONING_ACTIVE_SQLSTATE ||
    String(error?.message || '').includes(SCHEMA_PROVISIONING_ACTIVE_MARKER);
}

function resolveSchemaProvisioningRetryMs(error) {
  const detail = error?.detail;
  let parsed = null;
  if (detail && typeof detail === 'object') parsed = detail;
  else if (typeof detail === 'string') {
    try {
      parsed = JSON.parse(detail);
    } catch {
      parsed = null;
    }
  }
  const hinted = Number(parsed?.retry_after_ms);
  return Number.isFinite(hinted) && hinted > ZERO ?
    hinted : SCHEMA_PROVISIONING_DEFAULT_RETRY_MS;
}

async function createSchemaStatement(client, statement) {
  try {
    await client.query(statement);
    return;
  } catch (error) {
    if (!isSchemaProvisioningActive(error)) throw error;
    const table = CREATE_TABLE_NAME_PATTERN.exec(statement)?.[1];
    if (!table) throw error;
    const deadline = Date.now() + SCHEMA_PROVISIONING_WAIT_BUDGET_MS;
    const retryMs = resolveSchemaProvisioningRetryMs(error);
    while (Date.now() < deadline) {
      await sleepMs(retryMs);
      if (await tableExists(client, table)) return;
    }
    throw error;
  }
}

async function createSchema(client) {
  for (const statement of CREATE_SCHEMA) {
    await createSchemaStatement(client, statement);
  }
}

async function loadDataset(client, dataset) {
  await insertRows(
    client,
    'warehouse',
    ['id', 'ytd_cents'],
    dataset.warehouses.map((row) => [row.id, row.ytdCents]),
  );
  await insertRows(
    client,
    'district',
    ['warehouse_id', 'district_id', 'ytd_cents', 'next_order_id'],
    dataset.districts.map((row) => [
      row.warehouseId,
      row.districtId,
      row.ytdCents,
      row.nextOrderId,
    ]),
  );
  await insertRows(
    client,
    'customer',
    [
      'warehouse_id',
      'district_id',
      'customer_id',
      'balance_cents',
      'ytd_payment_cents',
      'payment_count',
      'delivery_count',
    ],
    dataset.customers.map((row) => [
      row.warehouseId,
      row.districtId,
      row.customerId,
      row.balanceCents,
      row.ytdPaymentCents,
      row.paymentCount,
      row.deliveryCount,
    ]),
  );
  await insertRows(
    client,
    'item',
    ['item_id', 'price_cents'],
    dataset.items.map((row) => [row.itemId, row.priceCents]),
  );
  await insertRows(
    client,
    'stock',
    [
      'warehouse_id',
      'item_id',
      'quantity',
      'ytd_quantity',
      'order_count',
      'remote_count',
    ],
    dataset.stock.map((row) => [
      row.warehouseId,
      row.itemId,
      row.quantity,
      row.ytdQuantity,
      row.orderCount,
      row.remoteCount,
    ]),
  );
}

async function prepareDataset(createClient, options, dataset) {
  const client = await openClient(createClient, options);
  try {
    await dropExistingTables(client);
    await createSchema(client);
    await loadDataset(client, dataset);
  } finally {
    await client.end();
  }
}

async function countRows(client, table) {
  const result = await client.query(`SELECT COUNT(*) AS row_count FROM ${table}`);
  if (!Array.isArray(result?.rows) || result.rows.length !== ONE) {
    throw new Error(`Lagrange OLTP expected one count row for ${table}`);
  }
  return Number(result.rows[ZERO].row_count);
}

async function queryStateCounts(client) {
  return Object.freeze({
    orders: await countRows(client, 'orders'),
    newOrders: await countRows(client, 'new_order'),
    orderLines: await countRows(client, 'order_line'),
    history: await countRows(client, 'history'),
  });
}

// Cleanup is best effort: the harness destroys the cluster after the proof,
// so a schema the engine cannot drop is reported, not fatal.
async function cleanupDataset(createClient, options) {
  const client = await openClient(createClient, options);
  try {
    return await dropExistingTables(client, {tolerateUnsupportedDrop: true});
  } finally {
    await client.end();
  }
}

async function createLagrangeOltpAdapter(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint);
  const connection = normalizeConnection(options.connection);
  const config = resolveOltpBaselineConfig(options.workload || {});
  const dataset = buildOltpBaselineDataset(options.workload || {});
  const datasetSha256 = hashOltpBaselineDataset(dataset);
  const datasetSummary = summarizeOltpBaselineDataset(dataset);
  const createClient = options.createClient || defaultClientFactory;
  const resolvedClientOptions = clientOptions(endpoint, connection);
  const workerClients = [];
  const workerSessions = [];
  const busyWorkers = new Set();
  let closed = false;
  let datasetPrepared = false;

  try {
    await prepareDataset(createClient, resolvedClientOptions, dataset);
    datasetPrepared = true;
    for (let index = ZERO; index < config.workers; index += ONE) {
      const client = await openClient(createClient, resolvedClientOptions);
      workerClients.push(client);
      workerSessions.push(createLagrangeSession(client));
    }
  } catch (error) {
    const failures = [error];
    try {
      await closeClients(workerClients);
    } catch (cleanupError) {
      failures.push(cleanupError);
    }
    if (datasetPrepared) {
      try {
        await cleanupDataset(createClient, resolvedClientOptions);
      } catch (cleanupError) {
        failures.push(cleanupError);
      }
    }
    if (failures.length > ONE) {
      throw new AggregateError(failures, 'Lagrange OLTP adapter setup failed');
    }
    throw error;
  }

  const workerSessionIds = Object.freeze(
    workerSessions.map((_session, index) => `pgwire-worker-${index + ONE}`),
  );

  return Object.freeze({
    protocol: PUBLIC_PROTOCOL,
    executionPath: PUBLIC_EXECUTION_PATH,
    lockingReadMode: LOCKING_READ_MODE,
    datasetSha256,
    datasetSummary,
    workerSessionIds,
    async executeTransaction(operation) {
      if (closed) throw new Error('Lagrange OLTP adapter is closed');
      const workerIndex = Number(operation?.workerId) - ONE;
      if (!Number.isInteger(workerIndex) ||
          workerIndex < ZERO || workerIndex >= workerSessions.length) {
        throw new Error('Lagrange OLTP operation has invalid workerId');
      }
      if (busyWorkers.has(workerIndex)) {
        throw new Error(
          `Lagrange OLTP worker ${operation.workerId} received overlapping work`,
        );
      }
      busyWorkers.add(workerIndex);
      try {
        return await executeOltpBaselineTransaction(
          workerSessions[workerIndex],
          operation,
          config.scale,
        );
      } finally {
        busyWorkers.delete(workerIndex);
      }
    },
    async getEvidence() {
      if (closed) throw new Error('Lagrange OLTP adapter is closed');
      return Object.freeze({
        protocol: PUBLIC_PROTOCOL,
        executionPath: PUBLIC_EXECUTION_PATH,
        lockingReadMode: LOCKING_READ_MODE,
        datasetSha256,
        datasetSummary,
        workerSessionIds,
        stateCounts: await queryStateCounts(workerClients[ZERO]),
      });
    },
    async close(closeOptions = {}) {
      if (closed) return;
      closed = true;
      const failures = [];
      try {
        await closeClients(workerClients);
      } catch (error) {
        failures.push(error);
      }
      if (closeOptions.dropTables !== false) {
        try {
          await cleanupDataset(createClient, resolvedClientOptions);
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length > ZERO) {
        throw new AggregateError(failures, 'Lagrange OLTP adapter cleanup failed');
      }
    },
  });
}

export {
  SQL as LAGRANGE_OLTP_SQL,
  createLagrangeOltpAdapter,
};
