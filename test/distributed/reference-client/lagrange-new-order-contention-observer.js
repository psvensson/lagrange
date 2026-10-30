import pg from 'pg';

const {Client} = pg;
const ONE = 1;
const MAX_PORT = 65535;

function normalizeEndpoint(value = {}) {
  const host = String(value.host || '').trim();
  const port = Number(value.port);
  if (!host) throw new Error('Lagrange contention observer requires endpoint.host');
  if (!Number.isInteger(port) || port < ONE || port > MAX_PORT) {
    throw new Error('Lagrange contention observer requires a valid endpoint.port');
  }
  return Object.freeze({host, port});
}

function normalizeConnection(value = {}) {
  const user = String(value.user || '').trim();
  const database = String(value.database || '').trim();
  if (!user) throw new Error('Lagrange contention observer requires connection.user');
  if (!database) {
    throw new Error('Lagrange contention observer requires connection.database');
  }
  return Object.freeze({
    user,
    database,
    ...(value.password === undefined ? {} : {password: value.password}),
    ...(value.ssl === undefined ? {} : {ssl: value.ssl}),
  });
}

function normalizeItemIds(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Lagrange contention observer requires itemIds');
  }
  const itemIds = values.map(Number);
  if (itemIds.some((value) => !Number.isInteger(value) || value < ONE)) {
    throw new Error(
      'Lagrange contention observer itemIds must be positive integers',
    );
  }
  return Object.freeze([...new Set(itemIds)].sort((left, right) => left - right));
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

function requireOneRow(rows, label) {
  if (!Array.isArray(rows) || rows.length !== ONE) {
    throw new Error(`Lagrange contention observer expected one ${label} row`);
  }
  return rows[0];
}

async function observeLagrangeNewOrderContentionState(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint);
  const connection = normalizeConnection(options.connection);
  const itemIds = normalizeItemIds(options.itemIds);
  const createClient = options.createClient || ((clientConfig) =>
    new Client(clientConfig));
  const client = createClient(clientOptions(endpoint, connection));
  await client.connect();
  try {
    const district = await client.query(
      'SELECT next_order_id FROM district ' +
      'WHERE warehouse_id = $1 AND district_id = $2',
      [1, 1],
    );
    const orders = await client.query(
      'SELECT order_id FROM orders ' +
      'WHERE warehouse_id = $1 AND district_id = $2 ORDER BY order_id',
      [1, 1],
    );
    const newOrders = await client.query(
      'SELECT order_id FROM new_order ' +
      'WHERE warehouse_id = $1 AND district_id = $2 ORDER BY order_id',
      [1, 1],
    );
    const orderLines = await client.query(
      'SELECT order_id, COUNT(*) AS line_count FROM order_line ' +
      'WHERE warehouse_id = $1 AND district_id = $2 ' +
      'GROUP BY order_id ORDER BY order_id',
      [1, 1],
    );
    const placeholders = itemIds.map((_value, index) => `$${index + 2}`).join(',');
    const stock = await client.query(
      'SELECT warehouse_id, item_id, quantity, ytd_quantity, order_count, ' +
      'remote_count FROM stock WHERE warehouse_id = $1 ' +
      `AND item_id IN (${placeholders}) ORDER BY item_id`,
      [1, ...itemIds],
    );
    return Object.freeze({
      districtNextOrderId: Number(
        requireOneRow(district.rows, 'district').next_order_id,
      ),
      orderIds: orders.rows.map(({order_id: orderId}) => Number(orderId)),
      newOrderIds: newOrders.rows.map(({order_id: orderId}) => Number(orderId)),
      orderLineCountByOrderId: Object.fromEntries(
        orderLines.rows.map((row) => [
          String(Number(row.order_id)),
          Number(row.line_count),
        ]),
      ),
      stockRows: stock.rows.map((row) => ({
        warehouseId: Number(row.warehouse_id),
        itemId: Number(row.item_id),
        quantity: Number(row.quantity),
        ytdQuantity: Number(row.ytd_quantity),
        orderCount: Number(row.order_count),
        remoteCount: Number(row.remote_count),
      })),
    });
  } finally {
    await client.end();
  }
}

export {
  observeLagrangeNewOrderContentionState,
};
