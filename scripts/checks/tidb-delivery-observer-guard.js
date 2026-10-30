import assert from 'node:assert/strict';

import {
  observeTiDbDeliveryState,
} from '../../test/distributed/reference-client/tidb-delivery-observer.js';

const ENDPOINT = Object.freeze({host: '127.0.0.1', port: 4000});
const DATABASE_NAME = 'delivery_observer_guard';
const DISTRICTS = Object.freeze([
  Object.freeze({districtId: 1, orderId: 301}),
  Object.freeze({districtId: 2, orderId: 302}),
]);

function responseFor(sql, parameters) {
  const districtId = Number(parameters[1]);
  if (sql.startsWith('SELECT customer_id, carrier_id FROM orders ')) {
    return [[{customer_id: districtId, carrier_id: 7}]];
  }
  if (sql.startsWith('SELECT COUNT(*) AS row_count FROM new_order ')) {
    return [[{row_count: 0}]];
  }
  if (sql.startsWith('SELECT line_number, amount_cents, delivered FROM order_line ')) {
    return [[
      {line_number: 1, amount_cents: 100 * districtId, delivered: 1},
      {line_number: 2, amount_cents: 200 * districtId, delivered: 1},
    ]];
  }
  if (sql.startsWith('SELECT balance_cents, delivery_count FROM customer ')) {
    return [[{balance_cents: 1000 + 300 * districtId, delivery_count: 1}]];
  }
  throw new Error(`unexpected delivery observer query: ${sql}`);
}

const trace = {options: [], calls: [], closed: 0};
const observation = await observeTiDbDeliveryState({
  endpoint: ENDPOINT,
  databaseName: DATABASE_NAME,
  warehouseId: 1,
  districts: DISTRICTS,
  createConnection: async (options) => {
    trace.options.push(options);
    return {
      async execute(sql, parameters) {
        trace.calls.push({sql, parameters});
        return responseFor(sql, parameters);
      },
      async end() {
        trace.closed += 1;
      },
    };
  },
});

assert.equal(trace.options.length, 1);
assert.equal(trace.options[0].database, DATABASE_NAME);
assert.equal(trace.options[0].multipleStatements, false);
assert.equal(trace.calls.length, 8);
assert.equal(trace.closed, 1);
assert.deepEqual(observation.districts, [
  {
    districtId: 1,
    orderId: 301,
    customerId: 1,
    newOrderCount: 0,
    carrierId: 7,
    deliveredLineCount: 2,
    lineCount: 2,
    lineTotalCents: 300,
    customerBalanceCents: 1300,
    customerDeliveryCount: 1,
  },
  {
    districtId: 2,
    orderId: 302,
    customerId: 2,
    newOrderCount: 0,
    carrierId: 7,
    deliveredLineCount: 2,
    lineCount: 2,
    lineTotalCents: 600,
    customerBalanceCents: 1600,
    customerDeliveryCount: 1,
  },
]);

await assert.rejects(
  observeTiDbDeliveryState({
    endpoint: {host: '', port: 4000},
    databaseName: DATABASE_NAME,
    warehouseId: 1,
    districts: DISTRICTS,
  }),
  /requires endpoint.host/u,
);
await assert.rejects(
  observeTiDbDeliveryState({
    endpoint: ENDPOINT,
    databaseName: DATABASE_NAME,
    warehouseId: 1,
    districts: [],
  }),
  /requires districts/u,
);

console.log('tidb-delivery-observer-guard: PASS');
