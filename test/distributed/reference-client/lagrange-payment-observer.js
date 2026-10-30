import pg from 'pg';

const {Client} = pg;
const ONE = 1;
const MAX_PORT = 65535;

function normalizeEndpoint(value = {}) {
  const host = String(value.host || '').trim();
  const port = Number(value.port);
  if (!host) throw new Error('Lagrange payment observer requires endpoint.host');
  if (!Number.isInteger(port) || port < ONE || port > MAX_PORT) {
    throw new Error('Lagrange payment observer requires a valid endpoint.port');
  }
  return Object.freeze({host, port});
}

function normalizeConnection(value = {}) {
  const user = String(value.user || '').trim();
  const database = String(value.database || '').trim();
  if (!user) throw new Error('Lagrange payment observer requires connection.user');
  if (!database) {
    throw new Error('Lagrange payment observer requires connection.database');
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

function requireOneRow(rows, label) {
  if (!Array.isArray(rows) || rows.length !== ONE) {
    throw new Error(`Lagrange payment observer expected one ${label} row`);
  }
  return rows[0];
}

async function observeLagrangePaymentState(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint);
  const connection = normalizeConnection(options.connection);
  const operation = options.operation;
  if (!operation || typeof operation !== 'object') {
    throw new Error('Lagrange payment observer requires operation');
  }
  const createClient = options.createClient || ((config) => new Client(config));
  const client = createClient(clientOptions(endpoint, connection));
  await client.connect();
  try {
    const warehouseResult = await client.query(
      'SELECT ytd_cents FROM warehouse WHERE id = $1',
      [operation.warehouseId],
    );
    const districtResult = await client.query(
      'SELECT ytd_cents FROM district WHERE warehouse_id = $1 AND district_id = $2',
      [operation.warehouseId, operation.districtId],
    );
    const customerResult = await client.query(
      'SELECT balance_cents, ytd_payment_cents, payment_count FROM customer ' +
        'WHERE warehouse_id = $1 AND district_id = $2 AND customer_id = $3',
      [
        operation.customerWarehouseId,
        operation.customerDistrictId,
        operation.customerId,
      ],
    );
    const historyResult = await client.query(
      'SELECT amount_cents FROM history ' +
        'WHERE phase = $1 AND worker_id = $2 AND sequence_id = $3',
      [operation.phase, operation.workerId, operation.sequence],
    );
    const warehouse = requireOneRow(warehouseResult.rows, 'warehouse');
    const district = requireOneRow(districtResult.rows, 'district');
    const customer = requireOneRow(customerResult.rows, 'customer');
    const historyRows = Array.isArray(historyResult.rows) ? historyResult.rows : [];
    const historyCount = historyRows.length;
    const historyAmountCents = historyCount === ONE ?
      Number(historyRows[0]?.amount_cents) : null;
    return Object.freeze({
      warehouseYtdCents: Number(warehouse.ytd_cents),
      districtYtdCents: Number(district.ytd_cents),
      customerBalanceCents: Number(customer.balance_cents),
      customerYtdPaymentCents: Number(customer.ytd_payment_cents),
      customerPaymentCount: Number(customer.payment_count),
      historyCount,
      historyAmountCents,
    });
  } finally {
    await client.end();
  }
}

export {
  observeLagrangePaymentState,
};
