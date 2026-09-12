import mysql from 'mysql2/promise';

const ONE = 1;
const MAX_PORT = 65535;

function normalizeEndpoint(value = {}) {
  const host = String(value.host || '').trim();
  const port = Number(value.port);
  if (!host) throw new Error('TiDB contention observer requires endpoint.host');
  if (!Number.isInteger(port) || port < ONE || port > MAX_PORT) {
    throw new Error('TiDB contention observer requires a valid endpoint.port');
  }
  return {host, port};
}

function normalizeDatabaseName(value) {
  const databaseName = String(value || '').trim();
  if (!databaseName) {
    throw new Error('TiDB contention observer requires databaseName');
  }
  return databaseName;
}

function normalizeItemIds(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('TiDB contention observer requires itemIds');
  }
  const itemIds = values.map(Number);
  if (itemIds.some((value) => !Number.isInteger(value) || value < ONE)) {
    throw new Error('TiDB contention observer itemIds must be positive integers');
  }
  return [...new Set(itemIds)].sort((left, right) => left - right);
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

function oneRow(rows, label) {
  if (!Array.isArray(rows) || rows.length !== ONE) {
    throw new Error(`TiDB contention observer expected one ${label} row`);
  }
  return rows[0];
}

async function observeTiDbNewOrderContentionState(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint);
  const databaseName = normalizeDatabaseName(options.databaseName);
  const itemIds = normalizeItemIds(options.itemIds);
  const connect = options.createConnection || mysql.createConnection;
  const connection = await connect(connectionOptions(endpoint, databaseName));
  try {
    const [districtRows] = await connection.execute(
      'SELECT next_order_id FROM district ' +
      'WHERE warehouse_id = ? AND district_id = ?',
      [1, 1],
    );
    const [orderRows] = await connection.execute(
      'SELECT order_id FROM orders ' +
      'WHERE warehouse_id = ? AND district_id = ? ORDER BY order_id',
      [1, 1],
    );
    const [newOrderRows] = await connection.execute(
      'SELECT order_id FROM new_order ' +
      'WHERE warehouse_id = ? AND district_id = ? ORDER BY order_id',
      [1, 1],
    );
    const [orderLineRows] = await connection.execute(
      'SELECT order_id, COUNT(*) AS line_count FROM order_line ' +
      'WHERE warehouse_id = ? AND district_id = ? ' +
      'GROUP BY order_id ORDER BY order_id',
      [1, 1],
    );
    const placeholders = itemIds.map(() => '?').join(',');
    const [stockRows] = await connection.execute(
      'SELECT warehouse_id, item_id, quantity, ytd_quantity, order_count, ' +
      'remote_count FROM stock WHERE warehouse_id = ? ' +
      `AND item_id IN (${placeholders}) ORDER BY item_id`,
      [1, ...itemIds],
    );
    return Object.freeze({
      districtNextOrderId: Number(
        oneRow(districtRows, 'district').next_order_id,
      ),
      orderIds: orderRows.map(({order_id: orderId}) => Number(orderId)),
      newOrderIds: newOrderRows.map(({order_id: orderId}) => Number(orderId)),
      orderLineCountByOrderId: Object.fromEntries(
        orderLineRows.map((row) => [
          String(Number(row.order_id)),
          Number(row.line_count),
        ]),
      ),
      stockRows: stockRows.map((row) => ({
        warehouseId: Number(row.warehouse_id),
        itemId: Number(row.item_id),
        quantity: Number(row.quantity),
        ytdQuantity: Number(row.ytd_quantity),
        orderCount: Number(row.order_count),
        remoteCount: Number(row.remote_count),
      })),
    });
  } finally {
    await connection.end();
  }
}

export {
  observeTiDbNewOrderContentionState,
};
