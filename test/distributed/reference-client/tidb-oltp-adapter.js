import mysql from 'mysql2/promise';

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

const ZERO = 0;
const ONE = 1;
const DEFAULT_DATABASE_NAME = 'lagrange_tidb_oltp';
const DEFAULT_CONNECT_TIMEOUT_MS = 10000;
const INSERT_BATCH_SIZE = 250;
const DATABASE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/u;

const SQL = Object.freeze({
  [OLTP_SQL_STATEMENT.DISTRICT_NEXT_ORDER_FOR_UPDATE]:
    'SELECT next_order_id FROM district ' +
    'WHERE warehouse_id = ? AND district_id = ? FOR UPDATE',
  [OLTP_SQL_STATEMENT.DISTRICT_SET_NEXT_ORDER]:
    'UPDATE district SET next_order_id = ? ' +
    'WHERE warehouse_id = ? AND district_id = ?',
  [OLTP_SQL_STATEMENT.ORDER_INSERT]:
    'INSERT INTO orders ' +
    '(warehouse_id, district_id, order_id, customer_id, carrier_id, ' +
    'line_count, all_local) VALUES (?, ?, ?, ?, NULL, ?, ?)',
  [OLTP_SQL_STATEMENT.NEW_ORDER_INSERT]:
    'INSERT INTO new_order (warehouse_id, district_id, order_id) ' +
    'VALUES (?, ?, ?)',
  [OLTP_SQL_STATEMENT.ITEM_PRICE]:
    'SELECT price_cents FROM item WHERE item_id = ?',
  [OLTP_SQL_STATEMENT.STOCK_QUANTITY_FOR_UPDATE]:
    'SELECT quantity FROM stock ' +
    'WHERE warehouse_id = ? AND item_id = ? FOR UPDATE',
  [OLTP_SQL_STATEMENT.STOCK_UPDATE]:
    'UPDATE stock SET quantity = ?, ytd_quantity = ytd_quantity + ?, ' +
    'order_count = order_count + 1, remote_count = remote_count + ? ' +
    'WHERE warehouse_id = ? AND item_id = ?',
  [OLTP_SQL_STATEMENT.ORDER_LINE_INSERT]:
    'INSERT INTO order_line ' +
    '(warehouse_id, district_id, order_id, line_number, item_id, ' +
    'supply_warehouse_id, quantity, amount_cents, delivered) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)',
  [OLTP_SQL_STATEMENT.WAREHOUSE_PAYMENT]:
    'UPDATE warehouse SET ytd_cents = ytd_cents + ? WHERE id = ?',
  [OLTP_SQL_STATEMENT.DISTRICT_PAYMENT]:
    'UPDATE district SET ytd_cents = ytd_cents + ? ' +
    'WHERE warehouse_id = ? AND district_id = ?',
  [OLTP_SQL_STATEMENT.CUSTOMER_PAYMENT]:
    'UPDATE customer SET balance_cents = balance_cents - ?, ' +
    'ytd_payment_cents = ytd_payment_cents + ?, ' +
    'payment_count = payment_count + 1 ' +
    'WHERE warehouse_id = ? AND district_id = ? AND customer_id = ?',
  [OLTP_SQL_STATEMENT.HISTORY_INSERT]:
    'INSERT INTO history ' +
    '(phase, worker_id, sequence_id, customer_warehouse_id, ' +
    'customer_district_id, customer_id, home_warehouse_id, ' +
    'home_district_id, amount_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  [OLTP_SQL_STATEMENT.ORDER_STATUS_LATEST]:
    'SELECT order_id, carrier_id FROM orders ' +
    'WHERE warehouse_id = ? AND district_id = ? AND customer_id = ? ' +
    'ORDER BY order_id DESC LIMIT 1',
  [OLTP_SQL_STATEMENT.ORDER_STATUS_LINES]:
    'SELECT line_number, item_id, supply_warehouse_id, quantity, ' +
    'amount_cents, delivered FROM order_line ' +
    'WHERE warehouse_id = ? AND district_id = ? AND order_id = ? ' +
    'ORDER BY line_number',
  [OLTP_SQL_STATEMENT.DELIVERY_OLDEST_NEW_ORDER_FOR_UPDATE]:
    'SELECT order_id FROM new_order ' +
    'WHERE warehouse_id = ? AND district_id = ? ' +
    'ORDER BY order_id ASC LIMIT 1 FOR UPDATE',
  [OLTP_SQL_STATEMENT.DELIVERY_DELETE_NEW_ORDER]:
    'DELETE FROM new_order ' +
    'WHERE warehouse_id = ? AND district_id = ? AND order_id = ?',
  [OLTP_SQL_STATEMENT.DELIVERY_ORDER_FOR_UPDATE]:
    'SELECT customer_id FROM orders ' +
    'WHERE warehouse_id = ? AND district_id = ? AND order_id = ? FOR UPDATE',
  [OLTP_SQL_STATEMENT.DELIVERY_SET_CARRIER]:
    'UPDATE orders SET carrier_id = ? ' +
    'WHERE warehouse_id = ? AND district_id = ? AND order_id = ?',
  [OLTP_SQL_STATEMENT.DELIVERY_LINES_FOR_UPDATE]:
    'SELECT amount_cents FROM order_line ' +
    'WHERE warehouse_id = ? AND district_id = ? AND order_id = ? ' +
    'ORDER BY line_number FOR UPDATE',
  [OLTP_SQL_STATEMENT.DELIVERY_MARK_LINES]:
    'UPDATE order_line SET delivered = 1 ' +
    'WHERE warehouse_id = ? AND district_id = ? AND order_id = ?',
  [OLTP_SQL_STATEMENT.DELIVERY_CUSTOMER_UPDATE]:
    'UPDATE customer SET balance_cents = balance_cents + ?, ' +
    'delivery_count = delivery_count + 1 ' +
    'WHERE warehouse_id = ? AND district_id = ? AND customer_id = ?',
  [OLTP_SQL_STATEMENT.STOCK_LEVEL_DISTRICT]:
    'SELECT next_order_id FROM district ' +
    'WHERE warehouse_id = ? AND district_id = ?',
  [OLTP_SQL_STATEMENT.STOCK_LEVEL_COUNT]:
    'SELECT COUNT(DISTINCT ol.item_id) AS low_stock ' +
    'FROM order_line AS ol JOIN stock AS s ' +
    'ON s.warehouse_id = ? AND s.item_id = ol.item_id ' +
    'WHERE ol.warehouse_id = ? AND ol.district_id = ? ' +
    'AND ol.order_id >= ? AND ol.order_id < ? AND s.quantity < ?',
});

function validateDatabaseName(value) {
  const databaseName = value || DEFAULT_DATABASE_NAME;
  if (!DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(
      'TiDB OLTP database name must start with a letter and contain only ' +
      'letters, digits, and underscores',
    );
  }
  return databaseName;
}

function quoteIdentifier(value) {
  return `\`${value}\``;
}

function normalizeEndpoint(endpoint = {}) {
  const host = String(endpoint.host || '').trim();
  const port = Number(endpoint.port);
  if (!host) throw new Error('TiDB OLTP adapter requires endpoint.host');
  if (!Number.isInteger(port) || port < ONE || port > 65535) {
    throw new Error('TiDB OLTP adapter requires a valid endpoint.port');
  }
  return {host, port};
}

function connectionOptions(endpoint, database = null) {
  return {
    host: endpoint.host,
    port: endpoint.port,
    user: 'root',
    password: '',
    ...(database ? {database} : {}),
    connectTimeout: DEFAULT_CONNECT_TIMEOUT_MS,
    decimalNumbers: true,
    multipleStatements: false,
  };
}

async function closeConnections(connections) {
  const failures = [];
  for (const connection of connections) {
    try {
      await connection.end();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > ZERO) {
    throw new AggregateError(failures, 'TiDB OLTP connection cleanup failed');
  }
}

function normalizeResult(result) {
  if (Array.isArray(result)) {
    return {rows: result, rowCount: result.length};
  }
  return {
    rows: [],
    rowCount: Number.isFinite(result?.affectedRows) ?
      Number(result.affectedRows) : ZERO,
  };
}

function createTiDbSession(connection) {
  const session = {
    async transaction(callback) {
      await connection.beginTransaction();
      try {
        const result = await callback(session);
        await connection.commit();
        return result;
      } catch (error) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            'TiDB OLTP transaction and rollback both failed',
          );
        }
        throw error;
      }
    },
    async execute(statementId, parameters = []) {
      const sql = SQL[statementId];
      if (!sql) throw new Error(`TiDB OLTP unknown statement ${statementId}`);
      const [result] = await connection.execute(sql, parameters);
      return normalizeResult(result);
    },
  };
  return session;
}

function requireRow(rows, description) {
  if (!Array.isArray(rows) || rows.length !== ONE) {
    throw new Error(`TiDB OLTP expected one ${description} row`);
  }
  return rows[ZERO];
}

async function insertRows(connection, table, columns, rows) {
  for (let offset = ZERO; offset < rows.length; offset += INSERT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + INSERT_BATCH_SIZE);
    const rowPlaceholder = `(${columns.map(() => '?').join(',')})`;
    const placeholders = batch.map(() => rowPlaceholder).join(',');
    const values = batch.flat();
    await connection.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders}`,
      values,
    );
  }
}

async function createSchema(connection) {
  const statements = [
    'CREATE TABLE warehouse (' +
      'id INT PRIMARY KEY, ytd_cents BIGINT NOT NULL)',
    'CREATE TABLE district (' +
      'warehouse_id INT NOT NULL, district_id INT NOT NULL, ' +
      'ytd_cents BIGINT NOT NULL, next_order_id INT NOT NULL, ' +
      'PRIMARY KEY (warehouse_id, district_id))',
    'CREATE TABLE customer (' +
      'warehouse_id INT NOT NULL, district_id INT NOT NULL, ' +
      'customer_id INT NOT NULL, balance_cents BIGINT NOT NULL, ' +
      'ytd_payment_cents BIGINT NOT NULL, payment_count INT NOT NULL, ' +
      'delivery_count INT NOT NULL, ' +
      'PRIMARY KEY (warehouse_id, district_id, customer_id))',
    'CREATE TABLE item (' +
      'item_id INT PRIMARY KEY, price_cents INT NOT NULL)',
    'CREATE TABLE stock (' +
      'warehouse_id INT NOT NULL, item_id INT NOT NULL, quantity INT NOT NULL, ' +
      'ytd_quantity BIGINT NOT NULL, order_count BIGINT NOT NULL, ' +
      'remote_count BIGINT NOT NULL, ' +
      'PRIMARY KEY (warehouse_id, item_id))',
    'CREATE TABLE orders (' +
      'warehouse_id INT NOT NULL, district_id INT NOT NULL, ' +
      'order_id INT NOT NULL, customer_id INT NOT NULL, ' +
      'carrier_id INT NULL, line_count INT NOT NULL, all_local TINYINT NOT NULL, ' +
      'PRIMARY KEY (warehouse_id, district_id, order_id), ' +
      'KEY customer_order_lookup ' +
      '(warehouse_id, district_id, customer_id, order_id))',
    'CREATE TABLE new_order (' +
      'warehouse_id INT NOT NULL, district_id INT NOT NULL, order_id INT NOT NULL, ' +
      'PRIMARY KEY (warehouse_id, district_id, order_id))',
    'CREATE TABLE order_line (' +
      'warehouse_id INT NOT NULL, district_id INT NOT NULL, order_id INT NOT NULL, ' +
      'line_number INT NOT NULL, item_id INT NOT NULL, ' +
      'supply_warehouse_id INT NOT NULL, quantity INT NOT NULL, ' +
      'amount_cents BIGINT NOT NULL, delivered TINYINT NOT NULL DEFAULT 0, ' +
      'PRIMARY KEY (warehouse_id, district_id, order_id, line_number))',
    'CREATE TABLE history (' +
      'phase VARCHAR(16) NOT NULL, worker_id INT NOT NULL, sequence_id INT NOT NULL, ' +
      'customer_warehouse_id INT NOT NULL, customer_district_id INT NOT NULL, ' +
      'customer_id INT NOT NULL, home_warehouse_id INT NOT NULL, ' +
      'home_district_id INT NOT NULL, amount_cents BIGINT NOT NULL, ' +
      'PRIMARY KEY (phase, worker_id, sequence_id))',
  ];
  for (const statement of statements) await connection.query(statement);
}

async function loadDataset(connection, dataset) {
  await insertRows(
    connection,
    'warehouse',
    ['id', 'ytd_cents'],
    dataset.warehouses.map((row) => [row.id, row.ytdCents]),
  );
  await insertRows(
    connection,
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
    connection,
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
    connection,
    'item',
    ['item_id', 'price_cents'],
    dataset.items.map((row) => [row.itemId, row.priceCents]),
  );
  await insertRows(
    connection,
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

async function recreateAndLoadDatabase(connect, endpoint, databaseName, dataset) {
  const admin = await connect(connectionOptions(endpoint));
  try {
    const quoted = quoteIdentifier(databaseName);
    await admin.query(`DROP DATABASE IF EXISTS ${quoted}`);
    await admin.query(`CREATE DATABASE ${quoted}`);
    await admin.query(`USE ${quoted}`);
    await createSchema(admin);
    await loadDataset(admin, dataset);
  } finally {
    await admin.end();
  }
}

async function queryConnectionId(connection) {
  const [rows] = await connection.query('SELECT CONNECTION_ID() AS connection_id');
  return Number(requireRow(rows, 'connection id').connection_id);
}

async function queryStateCounts(connection) {
  const [rows] = await connection.query(
    'SELECT ' +
    '(SELECT COUNT(*) FROM orders) AS orders_count, ' +
    '(SELECT COUNT(*) FROM new_order) AS new_order_count, ' +
    '(SELECT COUNT(*) FROM order_line) AS order_line_count, ' +
    '(SELECT COUNT(*) FROM history) AS history_count',
  );
  const row = requireRow(rows, 'state counts');
  return {
    orders: Number(row.orders_count),
    newOrders: Number(row.new_order_count),
    orderLines: Number(row.order_line_count),
    history: Number(row.history_count),
  };
}

async function dropDatabase(connect, endpoint, databaseName) {
  const admin = await connect(connectionOptions(endpoint));
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
  } finally {
    await admin.end();
  }
}

async function createTiDbOltpAdapter(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint);
  const config = resolveOltpBaselineConfig(options.workload || {});
  const databaseName = validateDatabaseName(options.databaseName);
  const connect = options.createConnection || mysql.createConnection;
  const dataset = buildOltpBaselineDataset(options.workload || {});
  const datasetSha256 = hashOltpBaselineDataset(dataset);
  const datasetSummary = summarizeOltpBaselineDataset(dataset);
  const workerConnections = [];
  const workerSessions = [];
  const initialConnectionIds = [];
  const busyWorkers = new Set();
  let closed = false;
  let databaseCreated = false;

  try {
    await recreateAndLoadDatabase(connect, endpoint, databaseName, dataset);
    databaseCreated = true;
    for (let index = ZERO; index < config.workers; index += ONE) {
      const connection = await connect(connectionOptions(endpoint, databaseName));
      workerConnections.push(connection);
      workerSessions.push(createTiDbSession(connection));
      initialConnectionIds.push(await queryConnectionId(connection));
    }
  } catch (error) {
    const failures = [error];
    try {
      await closeConnections(workerConnections);
    } catch (cleanupError) {
      failures.push(cleanupError);
    }
    if (databaseCreated) {
      try {
        await dropDatabase(connect, endpoint, databaseName);
      } catch (cleanupError) {
        failures.push(cleanupError);
      }
    }
    if (failures.length > ONE) {
      throw new AggregateError(failures, 'TiDB OLTP adapter startup failed');
    }
    throw error;
  }

  return {
    databaseName,
    datasetSha256,
    datasetSummary,
    workerConnectionIds: Object.freeze([...initialConnectionIds]),
    async executeTransaction(operation) {
      if (closed) throw new Error('TiDB OLTP adapter is closed');
      const workerIndex = Number(operation?.workerId) - ONE;
      if (!Number.isInteger(workerIndex) ||
          workerIndex < ZERO ||
          workerIndex >= workerSessions.length) {
        throw new Error('TiDB OLTP operation has invalid workerId');
      }
      if (busyWorkers.has(workerIndex)) {
        throw new Error(
          `TiDB OLTP worker ${operation.workerId} received overlapping work`,
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
      if (closed) throw new Error('TiDB OLTP adapter is closed');
      const currentConnectionIds = [];
      for (const connection of workerConnections) {
        currentConnectionIds.push(await queryConnectionId(connection));
      }
      return {
        databaseName,
        datasetSha256,
        datasetSummary,
        initialConnectionIds: [...initialConnectionIds],
        currentConnectionIds,
        stateCounts: await queryStateCounts(workerConnections[ZERO]),
      };
    },
    async close(closeOptions = {}) {
      if (closed) return;
      closed = true;
      const failures = [];
      try {
        await closeConnections(workerConnections);
      } catch (error) {
        failures.push(error);
      }
      if (closeOptions.dropDatabase !== false) {
        try {
          await dropDatabase(connect, endpoint, databaseName);
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length > ZERO) {
        throw new AggregateError(failures, 'TiDB OLTP adapter cleanup failed');
      }
    },
  };
}

export {
  DEFAULT_DATABASE_NAME as TIDB_OLTP_DEFAULT_DATABASE_NAME,
  createTiDbOltpAdapter,
};
