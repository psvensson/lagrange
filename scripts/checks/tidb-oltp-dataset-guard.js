#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  buildOltpBaselineDataset,
  hashOltpBaselineDataset,
  summarizeOltpBaselineDataset,
} from '../../test/distributed/harness/oltp-baseline-dataset.js';

const ZERO = 0;
const PASS_LINE = 'tidb-oltp-dataset-guard: PASS\n';

function main() {
  const options = {
    seed: 24680,
    warehouseCount: 3,
    districtsPerWarehouse: 4,
    customersPerDistrict: 25,
    itemCount: 120,
  };
  const first = buildOltpBaselineDataset(options);
  const second = buildOltpBaselineDataset(options);
  assert.deepEqual(first, second);

  const firstHash = hashOltpBaselineDataset(first);
  assert.equal(firstHash, hashOltpBaselineDataset(second));
  assert.match(firstHash, /^[a-f0-9]{64}$/u);

  const changed = buildOltpBaselineDataset({...options, seed: 24681});
  assert.notEqual(firstHash, hashOltpBaselineDataset(changed));

  assert.deepEqual(summarizeOltpBaselineDataset(first), {
    warehouseCount: 3,
    districtCount: 12,
    customerCount: 300,
    itemCount: 120,
    stockCount: 360,
  });
  assert.equal(first.warehouses.every((row) => row.ytdCents === ZERO), true);
  assert.equal(first.districts.every((row) => row.nextOrderId === 1), true);
  assert.equal(first.customers.every((row) =>
    row.balanceCents === ZERO &&
    row.paymentCount === ZERO &&
    row.deliveryCount === ZERO), true);
  assert.equal(first.items.every((row) =>
    row.priceCents >= 100 && row.priceCents <= 10000), true);
  assert.equal(first.stock.every((row) =>
    row.quantity >= 10 && row.quantity <= 100), true);

  const stockKeys = new Set(first.stock.map((row) =>
    `${row.warehouseId}:${row.itemId}`));
  assert.equal(stockKeys.size, first.stock.length);

  process.stdout.write(PASS_LINE);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
}
