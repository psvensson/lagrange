import mysql from 'mysql2/promise';

const ONE = 1;
const MAX_PORT = 65535;

function normalizeEndpoint(value = {}) {
  const host = String(value.host || '').trim();
  const port = Number(value.port);
  if (!host) throw new Error('TiDB delivery observer requires endpoint.host');
  if (!Number.isInteger(port) || port < ONE || port > MAX_PORT) {
    throw new Error('TiDB delivery observer requires a valid endpoint.port');
  }
  return Object.freeze({host, port});
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

function requireSingleRow(rows, label) {
  if (!Array.isArray(rows) || rows.length !== ONE) {
    throw new Error(`TiDB delivery observer expected one ${label} row`);
  }
  return rows[0];
}

async function observeDistrict(connection, warehouseId, expected) {
  const [orderRows] = await connection.execute(
    'SELECT customer_id, carrier_id FROM orders ' +
      'WHERE warehouse_id = ? AND district_id = ? AND order_id = ?',
    [warehouseId, expected.districtId, expected.orderId],
  );
  const order = requireSingleRow(orderRows, 'order');

  const [newOrderRows] = await connection.execute(
    'SELECT COUNT(*) AS row_count FROM new_order ' +
      'WHERE warehouse_id = ? AND district_id = ? AND order_id = ?',
    [warehouseId, expected.districtId, expected.orderId],
  );
  const newOrder = requireSingleRow(newOrderRows, 'new_order count');

  const [lineRows] = await connection.execute(
    'SELECT line_number, amount_cents, delivered FROM order_line ' +
      'WHERE warehouse_id = ? AND district_id = ? AND order_id = ? ' +
      'ORDER BY line_number',
    [warehouseId, expected.districtId, expected.orderId],
  );
  if (!Array.isArray(lineRows)) {
    throw new Error('TiDB delivery observer expected order-line rows');
  }

  const [customerRows] = await connection.execute(
    'SELECT balance_cents, delivery_count FROM customer ' +
      'WHERE warehouse_id = ? AND district_id = ? AND customer_id = ?',
    [warehouseId, expected.districtId, order.customer_id],
  );
  const customer = requireSingleRow(customerRows, 'customer');

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

async function observeTiDbDeliveryState(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint);
  const databaseName = String(options.databaseName || '').trim();
  if (!databaseName) throw new Error('TiDB delivery observer requires databaseName');
  const warehouseId = Number(options.warehouseId);
  if (!Number.isInteger(warehouseId) || warehouseId < ONE) {
    throw new Error('TiDB delivery observer requires warehouseId');
  }
  if (!Array.isArray(options.districts) || options.districts.length === 0) {
    throw new Error('TiDB delivery observer requires districts');
  }
  const connect = options.createConnection || mysql.createConnection;
  const connection = await connect(connectionOptions(endpoint, databaseName));
  try {
    const districts = [];
    for (const expected of options.districts) {
      districts.push(await observeDistrict(connection, warehouseId, expected));
    }
    return Object.freeze({districts: Object.freeze(districts)});
  } finally {
    await connection.end();
  }
}

export {
  observeTiDbDeliveryState,
};
