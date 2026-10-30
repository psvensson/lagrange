#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  OLTP_OPERATION_KIND,
} from '../../test/distributed/harness/oltp-baseline-workload.js';
import {
  OLTP_SQL_STATEMENT,
  executeOltpBaselineTransaction,
} from '../../test/distributed/harness/oltp-baseline-transaction-executor.js';

const objectFreeze = Object.freeze;
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFind = Function.call.bind(Array.prototype.find);

const ONE = 1;
const TWO = 2;
const PASS_LINE = 'oltp-baseline-transaction-executor-guard: PASS\n';
const PHASE_MEASUREMENT = 'measurement';
const UNKNOWN_OPERATION_KIND = 'unknown';

const DISTRICTS_PER_WAREHOUSE_TEN = 10;
const DISTRICTS_PER_WAREHOUSE_ONE = 1;
const CONFIG_TEN_DISTRICTS = objectFreeze({districtsPerWarehouse: DISTRICTS_PER_WAREHOUSE_TEN});
const CONFIG_ONE_DISTRICT = objectFreeze({districtsPerWarehouse: DISTRICTS_PER_WAREHOUSE_ONE});

const ORDER_ID_301 = 301;
const TOTAL_CENTS_500 = 500;
const PAID_CENTS_900 = 900;
const AMOUNT_CENTS_100 = 100;
const ORDER_ID_44 = 44;
const AMOUNT_CENTS_450 = 450;
const AMOUNT_CENTS_800 = 800;
const LOW_STOCK_COUNT_SIX = 6;
const DELIVERED_CUSTOMER_UPDATE_AMOUNT = 350;
const DELIVERED_CUSTOMER_ID = 77;
const STOCK_LEVEL_START_ORDER_ID = 21;
const STOCK_LEVEL_NEXT_ORDER_ID = 41;
const STOCK_LEVEL_THRESHOLD = 15;

const EXPECTED_NEW_ORDER_RESULT = objectFreeze({
  orderId: ORDER_ID_301,
  totalCents: TOTAL_CENTS_500,
});
const EXPECTED_PAYMENT_RESULT = objectFreeze({paidCents: PAID_CENTS_900});
const EXPECTED_EMPTY_ORDER_STATUS_RESULT = objectFreeze({orderId: null, lineCount: 0, lines: []});
const EXPECTED_POPULATED_ORDER_STATUS_RESULT = objectFreeze({
  orderId: ORDER_ID_44,
  lineCount: 2,
  lines: [
    {
      lineNumber: 1,
      itemId: 7,
      supplyWarehouseId: 1,
      quantity: 3,
      amountCents: AMOUNT_CENTS_450,
      delivered: 0,
    },
    {
      lineNumber: 2,
      itemId: 8,
      supplyWarehouseId: 2,
      quantity: 4,
      amountCents: AMOUNT_CENTS_800,
      delivered: 1,
    },
  ],
});

const EXPECTED_DELIVERY_RESULT = objectFreeze({deliveredOrders: 1});
const EXPECTED_STOCK_LEVEL_RESULT = objectFreeze({lowStock: LOW_STOCK_COUNT_SIX});

const EXPECTED_NEW_ORDER_STATEMENTS = objectFreeze([
  OLTP_SQL_STATEMENT.DISTRICT_NEXT_ORDER_FOR_UPDATE,
  OLTP_SQL_STATEMENT.DISTRICT_SET_NEXT_ORDER,
  OLTP_SQL_STATEMENT.ORDER_INSERT,
  OLTP_SQL_STATEMENT.NEW_ORDER_INSERT,
  OLTP_SQL_STATEMENT.ITEM_PRICE,
  OLTP_SQL_STATEMENT.STOCK_QUANTITY_FOR_UPDATE,
  OLTP_SQL_STATEMENT.STOCK_UPDATE,
  OLTP_SQL_STATEMENT.ORDER_LINE_INSERT,
]);

const EXPECTED_CUSTOMER_UPDATE_PARAMS = objectFreeze([
  DELIVERED_CUSTOMER_UPDATE_AMOUNT,
  1,
  1,
  DELIVERED_CUSTOMER_ID,
]);

const EXPECTED_STOCK_LEVEL_PARAMS = objectFreeze([
  1,
  1,
  2,
  STOCK_LEVEL_START_ORDER_ID,
  STOCK_LEVEL_NEXT_ORDER_ID,
  STOCK_LEVEL_THRESHOLD,
]);

function fakeSession(responses = {}) {
  const calls = [];
  let transactions = 0;
  const session = {
    calls,
    get transactions() {
      return transactions;
    },
    async transaction(callback) {
      transactions += 1;
      return callback(session);
    },
    async execute(statementId, parameters) {
      calls.push({statementId, parameters});
      const response = responses[statementId];
      if (typeof response === 'function') {
        return response(parameters, calls);
      }
      return response || {rows: [], rowCount: 1};
    },
  };
  return session;
}

async function assertNewOrder() {
  const session = fakeSession({
    [OLTP_SQL_STATEMENT.DISTRICT_NEXT_ORDER_FOR_UPDATE]: {
      rows: [{next_order_id: ORDER_ID_301}], rowCount: 1,
    },
    [OLTP_SQL_STATEMENT.ITEM_PRICE]: {
      rows: [{price_cents: 125}], rowCount: 1,
    },
    [OLTP_SQL_STATEMENT.STOCK_QUANTITY_FOR_UPDATE]: {
      rows: [{quantity: 50}], rowCount: 1,
    },
  });
  const result = await executeOltpBaselineTransaction(session, {
    kind: OLTP_OPERATION_KIND.NEW_ORDER,
    phase: PHASE_MEASUREMENT,
    workerId: 1,
    sequence: 1,
    warehouseId: 1,
    districtId: 2,
    customerId: 3,
    lines: [{itemId: 9, quantity: 4, supplyWarehouseId: 1}],
  }, CONFIG_TEN_DISTRICTS);

  assert.deepEqual(result, EXPECTED_NEW_ORDER_RESULT);
  assert.equal(session.transactions, 1);
  assert.deepEqual(
    arrayMap(session.calls, ({statementId}) => statementId),
    EXPECTED_NEW_ORDER_STATEMENTS,
  );
}

async function assertPayment() {
  const session = fakeSession({
    [OLTP_SQL_STATEMENT.CUSTOMER_PAYMENT]: {rows: [], rowCount: 1},
  });
  const result = await executeOltpBaselineTransaction(session, {
    kind: OLTP_OPERATION_KIND.PAYMENT,
    phase: PHASE_MEASUREMENT,
    workerId: 2,
    sequence: 7,
    warehouseId: 1,
    districtId: 4,
    customerWarehouseId: 1,
    customerDistrictId: 4,
    customerId: 12,
    amountCents: PAID_CENTS_900,
  }, CONFIG_TEN_DISTRICTS);
  assert.deepEqual(result, EXPECTED_PAYMENT_RESULT);
  assert.equal(session.transactions, 1);

  const refused = fakeSession({
    [OLTP_SQL_STATEMENT.CUSTOMER_PAYMENT]: {rows: [], rowCount: 0},
  });
  await assert.rejects(
    executeOltpBaselineTransaction(refused, {
      kind: OLTP_OPERATION_KIND.PAYMENT,
      phase: PHASE_MEASUREMENT,
      workerId: 1,
      sequence: 1,
      warehouseId: 1,
      districtId: 1,
      customerWarehouseId: 1,
      customerDistrictId: 1,
      customerId: 1,
      amountCents: AMOUNT_CENTS_100,
    }, CONFIG_TEN_DISTRICTS),
    /did not update exactly one customer/u,
  );
}

async function assertOrderStatus() {
  const empty = fakeSession({
    [OLTP_SQL_STATEMENT.ORDER_STATUS_LATEST]: {rows: [], rowCount: 0},
  });
  const emptyResult = await executeOltpBaselineTransaction(empty, {
    kind: OLTP_OPERATION_KIND.ORDER_STATUS,
    warehouseId: 1,
    districtId: 1,
    customerId: 1,
  }, CONFIG_TEN_DISTRICTS);
  assert.deepEqual(emptyResult, EXPECTED_EMPTY_ORDER_STATUS_RESULT);

  const populated = fakeSession({
    [OLTP_SQL_STATEMENT.ORDER_STATUS_LATEST]: {
      rows: [{order_id: ORDER_ID_44, carrier_id: null}], rowCount: 1,
    },
    [OLTP_SQL_STATEMENT.ORDER_STATUS_LINES]: {
      rows: [
        {
          line_number: 1,
          item_id: 7,
          supply_warehouse_id: 1,
          quantity: 3,
          amount_cents: AMOUNT_CENTS_450,
          delivered: 0,
        },
        {
          line_number: 2,
          item_id: 8,
          supply_warehouse_id: 2,
          quantity: 4,
          amount_cents: AMOUNT_CENTS_800,
          delivered: 1,
        },
      ],
      rowCount: TWO,
    },
  });
  const result = await executeOltpBaselineTransaction(populated, {
    kind: OLTP_OPERATION_KIND.ORDER_STATUS,
    warehouseId: 1,
    districtId: 1,
    customerId: 1,
  }, CONFIG_TEN_DISTRICTS);
  assert.deepEqual(result, EXPECTED_POPULATED_ORDER_STATUS_RESULT);
}

async function assertDelivery() {
  const session = fakeSession({
    [OLTP_SQL_STATEMENT.DELIVERY_OLDEST_NEW_ORDER_FOR_UPDATE]: {
      rows: [{order_id: 88}], rowCount: 1,
    },
    [OLTP_SQL_STATEMENT.DELIVERY_ORDER_FOR_UPDATE]: {
      rows: [{customer_id: DELIVERED_CUSTOMER_ID}], rowCount: 1,
    },
    [OLTP_SQL_STATEMENT.DELIVERY_LINES_FOR_UPDATE]: {
      rows: [{amount_cents: AMOUNT_CENTS_100}, {amount_cents: 250}], rowCount: TWO,
    },
  });
  const result = await executeOltpBaselineTransaction(session, {
    kind: OLTP_OPERATION_KIND.DELIVERY,
    warehouseId: 1,
    carrierId: 5,
  }, CONFIG_ONE_DISTRICT);
  assert.deepEqual(result, EXPECTED_DELIVERY_RESULT);
  const customerUpdate = arrayFind(session.calls, ({statementId}) =>
    statementId === OLTP_SQL_STATEMENT.DELIVERY_CUSTOMER_UPDATE);
  assert.deepEqual(customerUpdate.parameters, EXPECTED_CUSTOMER_UPDATE_PARAMS);
}

async function assertStockLevel() {
  const session = fakeSession({
    [OLTP_SQL_STATEMENT.STOCK_LEVEL_DISTRICT]: {
      rows: [{next_order_id: STOCK_LEVEL_NEXT_ORDER_ID}], rowCount: 1,
    },
    [OLTP_SQL_STATEMENT.STOCK_LEVEL_COUNT]: {
      rows: [{low_stock: LOW_STOCK_COUNT_SIX}], rowCount: 1,
    },
  });
  const result = await executeOltpBaselineTransaction(session, {
    kind: OLTP_OPERATION_KIND.STOCK_LEVEL,
    warehouseId: 1,
    districtId: 2,
    threshold: STOCK_LEVEL_THRESHOLD,
  }, CONFIG_TEN_DISTRICTS);
  assert.deepEqual(result, EXPECTED_STOCK_LEVEL_RESULT);
  const countCall = session.calls.at(-1);
  assert.deepEqual(countCall.parameters, EXPECTED_STOCK_LEVEL_PARAMS);
}

async function main() {
  await assertNewOrder();
  await assertPayment();
  await assertOrderStatus();
  await assertDelivery();
  await assertStockLevel();
  await assert.rejects(
    executeOltpBaselineTransaction(
      fakeSession(),
      {kind: UNKNOWN_OPERATION_KIND},
      CONFIG_ONE_DISTRICT,
    ),
    /Unsupported OLTP operation kind/u,
  );
  process.stdout.write(PASS_LINE);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
});
