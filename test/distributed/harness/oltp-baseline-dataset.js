import {createHash} from 'node:crypto';

import {resolveOltpBaselineConfig} from './oltp-baseline-workload.js';

const ZERO = 0;
const ONE = 1;
const UINT32_MAX_PLUS_ONE = 0x100000000;
const ITEM_PRICE_MIN_CENTS = 100;
const ITEM_PRICE_MAX_CENTS = 10000;
const STOCK_QUANTITY_MIN = 10;
const STOCK_QUANTITY_MAX = 100;

function mix32(seed, values) {
  let value = seed >>> ZERO;
  for (const input of values) {
    value ^= Math.imul((Number(input) >>> ZERO) + 0x9e3779b9, 0x85ebca6b);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    value ^= value >>> 16;
  }
  return value >>> ZERO;
}

function deterministicInteger(seed, values, minimum, maximum) {
  const width = maximum - minimum + ONE;
  const mixed = mix32(seed, values);
  const fraction = mixed / UINT32_MAX_PLUS_ONE;
  return minimum + Math.floor(fraction * width);
}

function buildWarehouses(scale) {
  return Array.from({length: scale.warehouseCount}, (_unused, index) => ({
    id: index + ONE,
    ytdCents: ZERO,
  }));
}

function buildDistricts(scale) {
  const rows = [];
  for (let warehouseId = ONE;
    warehouseId <= scale.warehouseCount;
    warehouseId += ONE) {
    for (let districtId = ONE;
      districtId <= scale.districtsPerWarehouse;
      districtId += ONE) {
      rows.push({
        warehouseId,
        districtId,
        ytdCents: ZERO,
        nextOrderId: ONE,
      });
    }
  }
  return rows;
}

function buildCustomers(scale) {
  const rows = [];
  for (let warehouseId = ONE;
    warehouseId <= scale.warehouseCount;
    warehouseId += ONE) {
    for (let districtId = ONE;
      districtId <= scale.districtsPerWarehouse;
      districtId += ONE) {
      for (let customerId = ONE;
        customerId <= scale.customersPerDistrict;
        customerId += ONE) {
        rows.push({
          warehouseId,
          districtId,
          customerId,
          balanceCents: ZERO,
          ytdPaymentCents: ZERO,
          paymentCount: ZERO,
          deliveryCount: ZERO,
        });
      }
    }
  }
  return rows;
}

function buildItems(seed, scale) {
  return Array.from({length: scale.itemCount}, (_unused, index) => {
    const itemId = index + ONE;
    return {
      itemId,
      priceCents: deterministicInteger(
        seed,
        [0x11, itemId],
        ITEM_PRICE_MIN_CENTS,
        ITEM_PRICE_MAX_CENTS,
      ),
    };
  });
}

function buildStock(seed, scale) {
  const rows = [];
  for (let warehouseId = ONE;
    warehouseId <= scale.warehouseCount;
    warehouseId += ONE) {
    for (let itemId = ONE; itemId <= scale.itemCount; itemId += ONE) {
      rows.push({
        warehouseId,
        itemId,
        quantity: deterministicInteger(
          seed,
          [0x22, warehouseId, itemId],
          STOCK_QUANTITY_MIN,
          STOCK_QUANTITY_MAX,
        ),
        ytdQuantity: ZERO,
        orderCount: ZERO,
        remoteCount: ZERO,
      });
    }
  }
  return rows;
}

function buildOltpBaselineDataset(rawOptions = {}) {
  const config = resolveOltpBaselineConfig(rawOptions);
  const dataset = {
    version: 1,
    seed: config.seed,
    scale: config.scale,
    warehouses: buildWarehouses(config.scale),
    districts: buildDistricts(config.scale),
    customers: buildCustomers(config.scale),
    items: buildItems(config.seed, config.scale),
    stock: buildStock(config.seed, config.scale),
  };
  return Object.freeze(dataset);
}

function hashOltpBaselineDataset(dataset) {
  const payload = {
    version: dataset.version,
    seed: dataset.seed,
    scale: dataset.scale,
    warehouses: dataset.warehouses,
    districts: dataset.districts,
    customers: dataset.customers,
    items: dataset.items,
    stock: dataset.stock,
  };
  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

function summarizeOltpBaselineDataset(dataset) {
  return Object.freeze({
    warehouseCount: dataset.warehouses.length,
    districtCount: dataset.districts.length,
    customerCount: dataset.customers.length,
    itemCount: dataset.items.length,
    stockCount: dataset.stock.length,
  });
}

export {
  buildOltpBaselineDataset,
  hashOltpBaselineDataset,
  summarizeOltpBaselineDataset,
};
