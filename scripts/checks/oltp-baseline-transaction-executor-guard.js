#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  OLTP_OPERATION_KIND,
} from '../../test/distributed/harness/oltp-baseline-workload.js';
import {
  OLTP_SQL_STATEMENT,
  executeOltpBaselineTransaction,
} from '../../test/distributed/harness/oltp-baseline-transaction-executor.js';

const PASS_LINE = 'oltp-baseline-transaction-executor-guard: PASS\n';

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
      rows: [{next_order_id: 301}], rowCount: 1,
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
    phase: 'measurement',
    workerId: 1,
    sequence: 1,
    warehouseId: 1,
    districtId: 2,
    customerId: 3,
    lines: [{itemId: 9, quantity: 4, supplyWarehouseId: 1}],
  }, {districtsPerWarehouse: 10});

  assert.deepEqual(result, {orderId: 301, totalCents: 500});
  assert.equal(session.transactions, 1);
  assert.deepEqual(
    session.calls.map(({statementId}) => statementId),
    [
      OLTP_SQL_STATEMENT.DISTRICT_NEXT_ORDER_FOR_UPDATE,
      OLTP_SQL_STATEMENT.DISTRICT_SET_NEXT_ORDER,
      OLTP_SQL_STATEMENT.ORDER_INSERT,
      OLTP_SQL_STATEMENT.NEW_ORDER_INSERT,
      OLTP_SQL_STATEMENT.ITEM_PRICE,
      OLTP_SQL_STATEMENT.STOCK_QUANTITY_FOR_UPDATE,
      OLTP_SQL_STATEMENT.STOCK_UPDATE,
      OLTP_SQL_STATEMENT.ORDER_LINE_INSERT,
    ],
  );
}

async function assertPayment() {
  const session = fakeSession({
    [OLTP_SQL_STATEMENT.CUSTOMER_PAYMENT]: {rows: [], rowCount: 1},
  });
  const result = await executeOltpBaselineTransaction(session, {
    kind: OLTP_OPERATION_KIND.PAYMENT,
    phase: 'measurement',
    workerId: 2,
    sequence: 7,
    warehouseId: 1,
    districtId: 4,
    customerWarehouseId: 1,
    customerDistrictId: 4,
    customerId: 12,
    amountCents: 900,
  }, {districtsPerWarehouse: 10});
  assert.deepEqual(result, {paidCents: 900});
  assert.equal(session.transactions, 1);

  const refused = fakeSession({
    [OLTP_SQL_STATEMENT.CUSTOMER_PAYMENT]: {rows: [], rowCount: 0},
  });
  await assert.rejects(
    executeOltpBaselineTransaction(refused, {
      kind: OLTP_OPERATION_KIND.PAYMENT,
      phase: 'measurement',
      workerId: 1,
      sequence: 1,
      warehouseId: 1,
      districtId: 1,
      customerWarehouseId: 1,
      customerDistrictId: 1,
      customerId: 1,
      amountCents: 100,
    }, {districtsPerWarehouse: 10}),
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
  }, {districtsPerWarehouse: 10});
  assert.deepEqual(emptyResult, {orderId: null, lineCount: 0});

  const populated = fakeSession({
    [OLTP_SQL_STATEMENT.ORDER_STATUS_LATEST]: {
      rows: [{order_id: 44, carrier_id: null}], rowCount: 1,
    },
    [OLTP_SQL_STATEMENT.ORDER_STATUS_LINES]: {
      rows: [{line_number: 1}, {line_number: 2}], rowCount: 2,
    },
  });
  const result = await executeOltpBaselineTransaction(populated, {
    kind: OLTP_OPERATION_KIND.ORDER_STATUS,
    warehouseId: 1,
    districtId: 1,
    customerId: 1,
  }, {districtsPerWarehouse: 10});
  assert.deepEqual(result, {orderId: 44, lineCount: 2});
}

async function assertDelivery() {
  const session = fakeSession({
    [OLTP_SQL_STATEMENT.DELIVERY_OLDEST_NEW_ORDER_FOR_UPDATE]: {
      rows: [{order_id: 88}], rowCount: 1,
    },
    [OLTP_SQL_STATEMENT.DELIVERY_ORDER_FOR_UPDATE]: {
      rows: [{customer_id: 77}], rowCount: 1,
    },
    [OLTP_SQL_STATEMENT.DELIVERY_LINES_FOR_UPDATE]: {
      rows: [{amount_cents: 100}, {amount_cents: 250}], rowCount: 2,
    },
  });
  const result = await executeOltpBaselineTransaction(session, {
    kind: OLTP_OPERATION_KIND.DELIVERY,
    warehouseId: 1,
    carrierId: 5,
  }, {districtsPerWarehouse: 1});
  assert.deepEqual(result, {deliveredOrders: 1});
  const customerUpdate = session.calls.find(({statementId}) =>
    statementId === OLTP_SQL_STATEMENT.DELIVERY_CUSTOMER_UPDATE);
  assert.deepEqual(customerUpdate.parameters, [350, 1, 1, 77]);
}

async function assertStockLevel() {
  const session = fakeSession({
    [OLTP_SQL_STATEMENT.STOCK_LEVEL_DISTRICT]: {
      rows: [{next_order_id: 41}], rowCount: 1,
    },
    [OLTP_SQL_STATEMENT.STOCK_LEVEL_COUNT]: {
      rows: [{low_stock: 6}], rowCount: 1,
    },
  });
  const result = await executeOltpBaselineTransaction(session, {
    kind: OLTP_OPERATION_KIND.STOCK_LEVEL,
    warehouseId: 1,
    districtId: 2,
    threshold: 15,
  }, {districtsPerWarehouse: 10});
  assert.deepEqual(result, {lowStock: 6});
  const countCall = session.calls.at(-1);
  assert.deepEqual(countCall.parameters, [1, 1, 2, 21, 41, 15]);
}

async function main() {
  await assertNewOrder();
  await assertPayment();
  await assertOrderStatus();
  await assertDelivery();
  await assertStockLevel();
  await assert.rejects(
    executeOltpBaselineTransaction(fakeSession(), {kind: 'unknown'}, {
      districtsPerWarehouse: 1,
    }),
    /Unsupported OLTP operation kind/u,
  );
  process.stdout.write(PASS_LINE);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
