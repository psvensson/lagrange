import assert from 'node:assert/strict';

import {
  observeTiDbDeliveryState,
} from '../../test/distributed/reference-client/tidb-delivery-observer.js';

const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const DEFAULT_PORT = 4000;
const ENDPOINT = Object.freeze({host: '127.0.0.1', port: DEFAULT_PORT});
const DATABASE_NAME = 'delivery_observer_guard';
const DISTRICTS = Object.freeze([
  Object.freeze({districtId: 1, orderId: 301}),
  Object.freeze({districtId: 2, orderId: 302}),
]);

const SQL_PREFIX_ORDERS = 'SELECT customer_id, carrier_id FROM orders ';
const SQL_PREFIX_NEW_ORDER = 'SELECT COUNT(*) AS row_count FROM new_order ';
const SQL_PREFIX_ORDER_LINE =
  'SELECT line_number, amount_cents, delivered FROM order_line ';
const SQL_PREFIX_CUSTOMER =
  'SELECT balance_cents, delivery_count FROM customer ';

const MOCK_CARRIER_ID = 7;
const MOCK_LINE_1_FACTOR = 100;
const MOCK_LINE_2_FACTOR = 200;
const MOCK_BASE_BALANCE_CENTS = 1000;
const MOCK_BALANCE_FACTOR = 300;
const EXPECTED_CALLS = 8;
const PASS_MESSAGE = 'tidb-delivery-observer-guard: PASS';

const EXPECTED_DISTRICTS = Object.freeze([
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

function responseFor(sql, parameters) {
  const districtId = Number(parameters[1]);
  if (stringStartsWith(sql, SQL_PREFIX_ORDERS)) {
    return [[{customer_id: districtId, carrier_id: MOCK_CARRIER_ID}]];
  }
  if (stringStartsWith(sql, SQL_PREFIX_NEW_ORDER)) {
    return [[{row_count: 0}]];
  }
  if (stringStartsWith(sql, SQL_PREFIX_ORDER_LINE)) {
    return [[
      {line_number: 1, amount_cents: MOCK_LINE_1_FACTOR * districtId, delivered: 1},
      {line_number: 2, amount_cents: MOCK_LINE_2_FACTOR * districtId, delivered: 1},
    ]];
  }
  if (stringStartsWith(sql, SQL_PREFIX_CUSTOMER)) {
    return [[{
      balance_cents: MOCK_BASE_BALANCE_CENTS + MOCK_BALANCE_FACTOR * districtId,
      delivery_count: 1,
    }]];
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
assert.equal(trace.calls.length, EXPECTED_CALLS);
assert.equal(trace.closed, 1);
assert.deepEqual(observation.districts, EXPECTED_DISTRICTS);

await assert.rejects(
  observeTiDbDeliveryState({
    endpoint: {host: '', port: DEFAULT_PORT},
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

console.log(PASS_MESSAGE);
