import mysql from 'mysql2/promise';

const ONE = 1;
const MAX_PORT = 65535;

function normalizeEndpoint(value = {}) {
  const host = String(value.host || '').trim();
  const port = Number(value.port);
  if (!host) throw new Error('TiDB payment observer requires endpoint.host');
  if (!Number.isInteger(port) || port < ONE || port > MAX_PORT) {
    throw new Error('TiDB payment observer requires a valid endpoint.port');
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

function requireOne(rows, label) {
  if (!Array.isArray(rows) || rows.length !== ONE) {
    throw new Error(`TiDB payment observer expected one ${label} row`);
  }
  return rows[0];
}

async function observeTiDbPaymentState(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint);
  const databaseName = String(options.databaseName || '').trim();
  if (!databaseName) throw new Error('TiDB payment observer requires databaseName');
  const operation = options.operation;
  if (!operation || typeof operation !== 'object') {
    throw new Error('TiDB payment observer requires operation');
  }
  const connect = options.createConnection || mysql.createConnection;
  const connection = await connect(connectionOptions(endpoint, databaseName));
  try {
    const [warehouseRows] = await connection.execute(
      'SELECT ytd_cents FROM warehouse WHERE id = ?',
      [operation.warehouseId],
    );
    const [districtRows] = await connection.execute(
      'SELECT ytd_cents FROM district WHERE warehouse_id = ? AND district_id = ?',
      [operation.warehouseId, operation.districtId],
    );
    const [customerRows] = await connection.execute(
      'SELECT balance_cents, ytd_payment_cents, payment_count FROM customer ' +
        'WHERE warehouse_id = ? AND district_id = ? AND customer_id = ?',
      [
        operation.customerWarehouseId,
        operation.customerDistrictId,
        operation.customerId,
      ],
    );
    const [historyRows] = await connection.execute(
      'SELECT amount_cents FROM history ' +
        'WHERE phase = ? AND worker_id = ? AND sequence_id = ?',
      [operation.phase, operation.workerId, operation.sequence],
    );
    const warehouse = requireOne(warehouseRows, 'warehouse');
    const district = requireOne(districtRows, 'district');
    const customer = requireOne(customerRows, 'customer');
    const history = requireOne(historyRows, 'history');
    return Object.freeze({
      warehouseYtdCents: Number(warehouse.ytd_cents),
      districtYtdCents: Number(district.ytd_cents),
      customerBalanceCents: Number(customer.balance_cents),
      customerYtdPaymentCents: Number(customer.ytd_payment_cents),
      customerPaymentCount: Number(customer.payment_count),
      historyCount: historyRows.length,
      historyAmountCents: Number(history.amount_cents),
    });
  } finally {
    await connection.end();
  }
}

export {
  observeTiDbPaymentState,
};
