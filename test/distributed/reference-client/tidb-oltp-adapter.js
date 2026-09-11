import mysql from 'mysql2/promise';

import {
  buildOltpBaselineDataset,
  hashOltpBaselineDataset,
  summarizeOltpBaselineDataset,
} from '../harness/oltp-baseline-dataset.js';
import {
  OLTP_OPERATION_KIND,
  resolveOltpBaselineConfig,
} from '../harness/oltp-baseline-workload.js';

const ZERO = 0;
const ONE = 1;
const DEFAULT_DATABASE_NAME = 'lagrange_tidb_oltp';
const DEFAULT_CONNECT_TIMEOUT_MS = 10000;
const INSERT_BATCH_SIZE = 250;
const DATABASE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/u;

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

async function withTransaction(connection, callback) {
  await connection.beginTransaction();
  try {
    const result = await callback();
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

async function recreateAndLoadDatabase(
  connect,
  endpoint,
  databaseName,
  dataset,
) {
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

async function executeNewOrder(connection, operation) {
  return withTransaction(connection, async () => {
    const [districtRows] = await connection.execute(
      'SELECT next_order_id FROM district ' +
      'WHERE warehouse_id = ? AND district_id = ? FOR UPDATE',
      [operation.warehouseId, operation.districtId],
    );
    const district = requireRow(districtRows, 'district');
    const orderId = Number(district.next_order_id);
    await connection.execute(
      'UPDATE district SET next_order_id = ? ' +
      'WHERE warehouse_id = ? AND district_id = ?',
      [orderId + ONE, operation.warehouseId, operation.districtId],
    );
    const allLocal = operation.lines.every((line) =>
      line.supplyWarehouseId === operation.warehouseId) ? ONE : ZERO;
    await connection.execute(
      'INSERT INTO orders ' +
      '(warehouse_id, district_id, order_id, customer_id, carrier_id, ' +
      'line_count, all_local) VALUES (?, ?, ?, ?, NULL, ?, ?)',
      [
        operation.warehouseId,
        operation.districtId,
        orderId,
        operation.customerId,
        operation.lines.length,
        allLocal,
      ],
    );
    await connection.execute(
      'INSERT INTO new_order (warehouse_id, district_id, order_id) ' +
      'VALUES (?, ?, ?)',
      [operation.warehouseId, operation.districtId, orderId],
    );

    let totalCents = ZERO;
    for (let index = ZERO; index < operation.lines.length; index += ONE) {
      const line = operation.lines[index];
      const [itemRows] = await connection.execute(
        'SELECT price_cents FROM item WHERE item_id = ?',
        [line.itemId],
      );
      const item = requireRow(itemRows, 'item');
      const [stockRows] = await connection.execute(
        'SELECT quantity FROM stock ' +
        'WHERE warehouse_id = ? AND item_id = ? FOR UPDATE',
        [line.supplyWarehouseId, line.itemId],
      );
      const stock = requireRow(stockRows, 'stock');
      const currentQuantity = Number(stock.quantity);
      const nextQuantity = currentQuantity >= line.quantity + 10 ?
        currentQuantity - line.quantity :
        currentQuantity + 91 - line.quantity;
      const remote = line.supplyWarehouseId === operation.warehouseId ?
        ZERO : ONE;
      await connection.execute(
        'UPDATE stock SET quantity = ?, ytd_quantity = ytd_quantity + ?, ' +
        'order_count = order_count + 1, remote_count = remote_count + ? ' +
        'WHERE warehouse_id = ? AND item_id = ?',
        [
          nextQuantity,
          line.quantity,
          remote,
          line.supplyWarehouseId,
          line.itemId,
        ],
      );
      const amountCents = Number(item.price_cents) * line.quantity;
      totalCents += amountCents;
      await connection.execute(
        'INSERT INTO order_line ' +
        '(warehouse_id, district_id, order_id, line_number, item_id, ' +
        'supply_warehouse_id, quantity, amount_cents, delivered) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)',
        [
          operation.warehouseId,
          operation.districtId,
          orderId,
          index + ONE,
          line.itemId,
          line.supplyWarehouseId,
          line.quantity,
          amountCents,
        ],
      );
    }
    return {orderId, totalCents};
  });
}

async function executePayment(connection, operation) {
  return withTransaction(connection, async () => {
    await connection.execute(
      'UPDATE warehouse SET ytd_cents = ytd_cents + ? WHERE id = ?',
      [operation.amountCents, operation.warehouseId],
    );
    await connection.execute(
      'UPDATE district SET ytd_cents = ytd_cents + ? ' +
      'WHERE warehouse_id = ? AND district_id = ?',
      [operation.amountCents, operation.warehouseId, operation.districtId],
    );
    const [customerUpdate] = await connection.execute(
      'UPDATE customer SET balance_cents = balance_cents - ?, ' +
      'ytd_payment_cents = ytd_payment_cents + ?, ' +
      'payment_count = payment_count + 1 ' +
      'WHERE warehouse_id = ? AND district_id = ? AND customer_id = ?',
      [
        operation.amountCents,
        operation.amountCents,
        operation.customerWarehouseId,
        operation.customerDistrictId,
        operation.customerId,
      ],
    );
    if (customerUpdate.affectedRows !== ONE) {
      throw new Error('TiDB OLTP payment did not update exactly one customer');
    }
    await connection.execute(
      'INSERT INTO history ' +
      '(phase, worker_id, sequence_id, customer_warehouse_id, ' +
      'customer_district_id, customer_id, home_warehouse_id, ' +
      'home_district_id, amount_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        operation.phase,
        operation.workerId,
        operation.sequence,
        operation.customerWarehouseId,
        operation.customerDistrictId,
        operation.customerId,
        operation.warehouseId,
        operation.districtId,
        operation.amountCents,
      ],
    );
    return {paidCents: operation.amountCents};
  });
}

async function executeOrderStatus(connection, operation) {
  return withTransaction(connection, async () => {
    const [orderRows] = await connection.execute(
      'SELECT order_id, carrier_id FROM orders ' +
      'WHERE warehouse_id = ? AND district_id = ? AND customer_id = ? ' +
      'ORDER BY order_id DESC LIMIT 1',
      [operation.warehouseId, operation.districtId, operation.customerId],
    );
    if (!Array.isArray(orderRows) || orderRows.length === ZERO) {
      return {orderId: null, lineCount: ZERO};
    }
    const order = orderRows[ZERO];
    const [lineRows] = await connection.execute(
      'SELECT line_number, item_id, supply_warehouse_id, quantity, ' +
      'amount_cents, delivered FROM order_line ' +
      'WHERE warehouse_id = ? AND district_id = ? AND order_id = ? ' +
      'ORDER BY line_number',
      [operation.warehouseId, operation.districtId, order.order_id],
    );
    return {orderId: Number(order.order_id), lineCount: lineRows.length};
  });
}

async function executeDelivery(connection, operation, scale) {
  return withTransaction(connection, async () => {
    let deliveredOrders = ZERO;
    for (let districtId = ONE;
      districtId <= scale.districtsPerWarehouse;
      districtId += ONE) {
      const [newOrderRows] = await connection.execute(
        'SELECT order_id FROM new_order ' +
        'WHERE warehouse_id = ? AND district_id = ? ' +
        'ORDER BY order_id ASC LIMIT 1 FOR UPDATE',
        [operation.warehouseId, districtId],
      );
      if (!Array.isArray(newOrderRows) || newOrderRows.length === ZERO) continue;
      const orderId = Number(newOrderRows[ZERO].order_id);
      await connection.execute(
        'DELETE FROM new_order ' +
        'WHERE warehouse_id = ? AND district_id = ? AND order_id = ?',
        [operation.warehouseId, districtId, orderId],
      );
      const [orderRows] = await connection.execute(
        'SELECT customer_id FROM orders ' +
        'WHERE warehouse_id = ? AND district_id = ? AND order_id = ?',
        [operation.warehouseId, districtId, orderId],
      );
      const order = requireRow(orderRows, 'delivery order');
      await connection.execute(
        'UPDATE orders SET carrier_id = ? ' +
        'WHERE warehouse_id = ? AND district_id = ? AND order_id = ?',
        [operation.carrierId, operation.warehouseId, districtId, orderId],
      );
      const [sumRows] = await connection.execute(
        'SELECT COALESCE(SUM(amount_cents), 0) AS amount_cents FROM order_line ' +
        'WHERE warehouse_id = ? AND district_id = ? AND order_id = ?',
        [operation.warehouseId, districtId, orderId],
      );
      const amountCents = Number(requireRow(sumRows, 'delivery total').amount_cents);
      await connection.execute(
        'UPDATE order_line SET delivered = 1 ' +
        'WHERE warehouse_id = ? AND district_id = ? AND order_id = ?',
        [operation.warehouseId, districtId, orderId],
      );
      await connection.execute(
        'UPDATE customer SET balance_cents = balance_cents + ?, ' +
        'delivery_count = delivery_count + 1 ' +
        'WHERE warehouse_id = ? AND district_id = ? AND customer_id = ?',
        [amountCents, operation.warehouseId, districtId, order.customer_id],
      );
      deliveredOrders += ONE;
    }
    return {deliveredOrders};
  });
}

async function executeStockLevel(connection, operation) {
  return withTransaction(connection, async () => {
    const [districtRows] = await connection.execute(
      'SELECT next_order_id FROM district ' +
      'WHERE warehouse_id = ? AND district_id = ?',
      [operation.warehouseId, operation.districtId],
    );
    const nextOrderId = Number(
      requireRow(districtRows, 'stock-level district').next_order_id,
    );
    const firstOrderId = Math.max(ONE, nextOrderId - 20);
    const [rows] = await connection.execute(
      'SELECT COUNT(DISTINCT ol.item_id) AS low_stock ' +
      'FROM order_line AS ol JOIN stock AS s ' +
      'ON s.warehouse_id = ? AND s.item_id = ol.item_id ' +
      'WHERE ol.warehouse_id = ? AND ol.district_id = ? ' +
      'AND ol.order_id >= ? AND ol.order_id < ? AND s.quantity < ?',
      [
        operation.warehouseId,
        operation.warehouseId,
        operation.districtId,
        firstOrderId,
        nextOrderId,
        operation.threshold,
      ],
    );
    return {lowStock: Number(requireRow(rows, 'stock-level count').low_stock)};
  });
}

async function executeOperation(connection, operation, scale) {
  switch (operation.kind) {
    case OLTP_OPERATION_KIND.NEW_ORDER:
      return executeNewOrder(connection, operation);
    case OLTP_OPERATION_KIND.PAYMENT:
      return executePayment(connection, operation);
    case OLTP_OPERATION_KIND.ORDER_STATUS:
      return executeOrderStatus(connection, operation);
    case OLTP_OPERATION_KIND.DELIVERY:
      return executeDelivery(connection, operation, scale);
    case OLTP_OPERATION_KIND.STOCK_LEVEL:
      return executeStockLevel(connection, operation);
    default:
      throw new Error(`Unsupported TiDB OLTP operation kind: ${operation.kind}`);
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
  const initialConnectionIds = [];
  const busyWorkers = new Set();
  let closed = false;
  let databaseCreated = false;

  try {
    await recreateAndLoadDatabase(
      connect,
      endpoint,
      databaseName,
      dataset,
    );
    databaseCreated = true;
    for (let index = ZERO; index < config.workers; index += ONE) {
      const connection = await connect(
        connectionOptions(endpoint, databaseName),
      );
      workerConnections.push(connection);
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
          workerIndex >= workerConnections.length) {
        throw new Error('TiDB OLTP operation has invalid workerId');
      }
      if (busyWorkers.has(workerIndex)) {
        throw new Error(
          `TiDB OLTP worker ${operation.workerId} received overlapping work`,
        );
      }
      busyWorkers.add(workerIndex);
      try {
        return await executeOperation(
          workerConnections[workerIndex],
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
