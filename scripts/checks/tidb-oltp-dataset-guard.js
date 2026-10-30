#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  buildOltpBaselineDataset,
  hashOltpBaselineDataset,
  summarizeOltpBaselineDataset,
} from '../../test/distributed/harness/oltp-baseline-dataset.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayMap = Function.call.bind(Array.prototype.map);

const ZERO = 0;
const ONE = 1;
const PASS_LINE = 'tidb-oltp-dataset-guard: PASS\n';

const TEST_SEED = 24680;
const CHANGED_SEED = 24681;
const WAREHOUSE_COUNT = 3;
const DISTRICTS_PER_WAREHOUSE = 4;
const CUSTOMERS_PER_DISTRICT = 25;
const ITEM_COUNT = 120;
const DISTRICT_COUNT = 12;
const CUSTOMER_COUNT = 300;
const STOCK_COUNT = 360;
const MIN_PRICE_CENTS = 100;
const MAX_PRICE_CENTS = 10000;
const MIN_STOCK_QUANTITY = 10;
const MAX_STOCK_QUANTITY = 100;

const DATASET_OPTIONS = Object.freeze({
  seed: TEST_SEED,
  warehouseCount: WAREHOUSE_COUNT,
  districtsPerWarehouse: DISTRICTS_PER_WAREHOUSE,
  customersPerDistrict: CUSTOMERS_PER_DISTRICT,
  itemCount: ITEM_COUNT,
});

const EXPECTED_SUMMARY = Object.freeze({
  warehouseCount: WAREHOUSE_COUNT,
  districtCount: DISTRICT_COUNT,
  customerCount: CUSTOMER_COUNT,
  itemCount: ITEM_COUNT,
  stockCount: STOCK_COUNT,
});

function main() {
  const first = buildOltpBaselineDataset(DATASET_OPTIONS);
  const second = buildOltpBaselineDataset(DATASET_OPTIONS);
  assert.deepEqual(first, second);

  const firstHash = hashOltpBaselineDataset(first);
  assert.equal(firstHash, hashOltpBaselineDataset(second));
  assert.match(firstHash, /^[a-f0-9]{64}$/u);

  const changed = buildOltpBaselineDataset({
    ...DATASET_OPTIONS,
    seed: CHANGED_SEED,
  });
  assert.notEqual(firstHash, hashOltpBaselineDataset(changed));

  assert.deepEqual(summarizeOltpBaselineDataset(first), EXPECTED_SUMMARY);
  assert.equal(arrayEvery(first.warehouses, (row) => row.ytdCents === ZERO), true);
  assert.equal(arrayEvery(first.districts, (row) => row.nextOrderId === ONE), true);
  assert.equal(arrayEvery(first.customers, (row) =>
    row.balanceCents === ZERO &&
    row.paymentCount === ZERO &&
    row.deliveryCount === ZERO), true);
  assert.equal(arrayEvery(first.items, (row) =>
    row.priceCents >= MIN_PRICE_CENTS && row.priceCents <= MAX_PRICE_CENTS), true);
  assert.equal(arrayEvery(first.stock, (row) =>
    row.quantity >= MIN_STOCK_QUANTITY && row.quantity <= MAX_STOCK_QUANTITY), true);

  const stockKeys = new Set(arrayMap(first.stock, (row) =>
    `${row.warehouseId}:${row.itemId}`));
  assert.equal(stockKeys.size, first.stock.length);

  process.stdout.write(PASS_LINE);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
}
