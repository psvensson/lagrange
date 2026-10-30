import pg from 'pg';

const {Client} = pg;
const ONE = 1;
const MAX_PORT = 65535;

function normalizeEndpoint(value = {}) {
  const host = String(value.host || '').trim();
  const port = Number(value.port);
  if (!host) throw new Error('Lagrange delivery observer requires endpoint.host');
  if (!Number.isInteger(port) || port < ONE || port > MAX_PORT) {
    throw new Error('Lagrange delivery observer requires a valid endpoint.port');
  }
  return Object.freeze({host, port});
}

function normalizeConnection(value = {}) {
  const user = String(value.user || '').trim();
  const database = String(value.database || '').trim();
  if (!user) throw new Error('Lagrange delivery observer requires connection.user');
  if (!database) {
    throw new Error('Lagrange delivery observer requires connection.database');
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

function requireSingleRow(rows, label) {
  if (!Array.isArray(rows) || rows.length !== ONE) {
    throw new Error(`Lagrange delivery observer expected one ${label} row`);
  }
  return rows[0];
}

async function observeDistrict(client, warehouseId, expected) {
  const orderResult = await client.query(
    'SELECT customer_id, carrier_id FROM orders ' +
      'WHERE warehouse_id = $1 AND district_id = $2 AND order_id = $3',
    [warehouseId, expected.districtId, expected.orderId],
  );
  const order = requireSingleRow(orderResult?.rows, 'order');

  const newOrderResult = await client.query(
    'SELECT COUNT(*) AS row_count FROM new_order ' +
      'WHERE warehouse_id = $1 AND district_id = $2 AND order_id = $3',
    [warehouseId, expected.districtId, expected.orderId],
  );
  const newOrder = requireSingleRow(newOrderResult?.rows, 'new_order count');

  const lineResult = await client.query(
    'SELECT line_number, amount_cents, delivered FROM order_line ' +
      'WHERE warehouse_id = $1 AND district_id = $2 AND order_id = $3 ' +
      'ORDER BY line_number',
    [warehouseId, expected.districtId, expected.orderId],
  );
  const lineRows = lineResult?.rows;
  if (!Array.isArray(lineRows)) {
    throw new Error('Lagrange delivery observer expected order-line rows');
  }

  const customerResult = await client.query(
    'SELECT balance_cents, delivery_count FROM customer ' +
      'WHERE warehouse_id = $1 AND district_id = $2 AND customer_id = $3',
    [warehouseId, expected.districtId, order.customer_id],
  );
  const customer = requireSingleRow(customerResult?.rows, 'customer');

  return Object.freeze({
    districtId: expected.districtId,
    orderId: expected.orderId,
    customerId: Number(order.customer_id),
    newOrderCount: Number(newOrder.row_count),
    carrierId: Number(order.carrier_id),
    deliveredLineCount: lineRows.filter(({delivered}) => Number(delivered) === ONE).length,
    lineCount: lineRows.length,
    lineTotalCents: lineRows.reduce(
      (sum, row) => sum + Number(row.amount_cents),
      0,
    ),
    customerBalanceCents: Number(customer.balance_cents),
    customerDeliveryCount: Number(customer.delivery_count),
  });
}

async function observeLagrangeDeliveryState(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint);
  const connection = normalizeConnection(options.connection);
  const warehouseId = Number(options.warehouseId);
  if (!Number.isInteger(warehouseId) || warehouseId < ONE) {
    throw new Error('Lagrange delivery observer requires warehouseId');
  }
  if (!Array.isArray(options.districts) || options.districts.length === 0) {
    throw new Error('Lagrange delivery observer requires districts');
  }
  const createClient = options.createClient || ((config) => new Client(config));
  const client = createClient(clientOptions(endpoint, connection));
  await client.connect();
  try {
    const districts = [];
    for (const expected of options.districts) {
      districts.push(await observeDistrict(client, warehouseId, expected));
    }
    return Object.freeze({districts: Object.freeze(districts)});
  } finally {
    await client.end();
  }
}

export {
  observeLagrangeDeliveryState,
};
