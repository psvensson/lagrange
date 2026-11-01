// Product-content verification of the canonical OLTP dataset and the
// post-run reconciliation of committed requests against observed state.
// Both read the product through the one state-snapshot owner
// (oltp-state-snapshot-shared.js, all nine tables) on a separate connection.
// The dataset check compares the product's content digest with the digest
// of the generator's canonical rows in the same snapshot shape; never the
// generator against itself.
import {
  TABLES as OLTP_SNAPSHOT_TABLES,
  collectOltpStateSnapshot,
} from '../reference-client/oltp-state-snapshot-shared.js';
import {
  OPERATION_OUTCOME,
  benchmarkCanonicalDigest,
} from './benchmark-operation-outcome.js';
import {
  OLTP_MAX_NEW_ORDER_LINES,
  OLTP_OPERATION_KIND,
} from './oltp-baseline-workload.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);

const INTEGER_TEXT = /^-?\d+$/u;
const LOGICAL_CHECKSUM_METHOD = 'oltp-state-snapshot-integer-normalized-v1';

const VERIFICATION_STATUS = Object.freeze({
  VERIFIED: 'verified',
  MISMATCH: 'mismatch',
  UNOBSERVED: 'unobserved',
});

const RECONCILIATION_STATUS = Object.freeze({
  RECONCILED: 'reconciled',
  // State moved by more than the committed requests explain, and every
  // excess is within what the unresolved requests could have applied.
  UNRESOLVED_EFFECTS_OBSERVED: 'unresolved-effects-observed',
  MISMATCH: 'mismatch',
  UNOBSERVED: 'unobserved',
});

// Generator rows by snapshot table, in the snapshot's column order.
const GENERATOR_ROWS = Object.freeze({
  warehouse: (dataset) => arrayMap(dataset.warehouses, (row) => [row.id, row.ytdCents]),
  district: (dataset) => arrayMap(dataset.districts, (row) =>
    [row.warehouseId, row.districtId, row.ytdCents, row.nextOrderId]),
  customer: (dataset) => arrayMap(dataset.customers, (row) => [
    row.warehouseId, row.districtId, row.customerId, row.balanceCents,
    row.ytdPaymentCents, row.paymentCount, row.deliveryCount,
  ]),
  item: (dataset) => arrayMap(dataset.items, (row) => [row.itemId, row.priceCents]),
  stock: (dataset) => arrayMap(dataset.stock, (row) => [
    row.warehouseId, row.itemId, row.quantity, row.ytdQuantity, row.orderCount,
    row.remoteCount,
  ]),
});

function normalizeCell(value) {
  return typeof value === 'string' && INTEGER_TEXT.test(value) ? Number(value) : value;
}

// The integer-normalised content digest: pg returns BIGINT as text, mysql2
// as numbers; the logical content is the same.
function logicalChecksum(snapshot) {
  return benchmarkCanonicalDigest(arrayMap(snapshot.state, (table) => ({
    table: table.table,
    rows: arrayMap(table.rows, (row) => arrayMap(row, normalizeCell)),
  })));
}

async function expectedDatasetSnapshot(dataset) {
  return collectOltpStateSnapshot({
    tables: OLTP_SNAPSHOT_TABLES,
    queryRowsForTable: async (table) => {
      const rowsOf = GENERATOR_ROWS[table.name];
      return rowsOf ? rowsOf(dataset) : [];
    },
  });
}

async function verifyLoadedDataset(dataset, observed) {
  const expected = await expectedDatasetSnapshot(dataset);
  const expectedChecksum = logicalChecksum(expected);
  if (!observed.snapshot) {
    return Object.freeze({
      status: VERIFICATION_STATUS.UNOBSERVED,
      method: LOGICAL_CHECKSUM_METHOD,
      expectedLogicalChecksum: expectedChecksum,
      observedLogicalChecksum: null,
      error: observed.error,
    });
  }
  const observedChecksum = logicalChecksum(observed.snapshot);
  return Object.freeze({
    status: observedChecksum === expectedChecksum ?
      VERIFICATION_STATUS.VERIFIED : VERIFICATION_STATUS.MISMATCH,
    method: LOGICAL_CHECKSUM_METHOD,
    expectedLogicalChecksum: expectedChecksum,
    observedLogicalChecksum: observedChecksum,
    expectedTableRows: expected.rowCounts,
    observedTableRows: observed.snapshot.rowCounts,
  });
}

async function observeSnapshot(takeSnapshot) {
  try {
    return {snapshot: await takeSnapshot(), error: null};
  } catch (error) {
    return {snapshot: null, error: String(error?.message || error)};
  }
}

function snapshotSummary(observed) {
  if (!observed.snapshot) return Object.freeze({observed: false, error: observed.error});
  return Object.freeze({
    observed: true,
    stateSha256: observed.snapshot.stateSha256,
    logicalChecksum: logicalChecksum(observed.snapshot),
    tableRows: observed.snapshot.rowCounts,
  });
}

function countBy(records, outcome, kind) {
  return arrayFilter(records, (record) =>
    record.outcome === outcome && record.operationKind === kind).length;
}

function committedSum(records, kind, field) {
  return arrayFilter(records, (record) =>
    record.outcome === OPERATION_OUTCOME.COMMITTED && record.operationKind === kind)
    .reduce((sum, record) => sum + record.effectSummary[field], 0);
}

function expectationsOf(records) {
  const committed = OPERATION_OUTCOME.COMMITTED;
  const unresolved = OPERATION_OUTCOME.UNRESOLVED;
  const newOrders = countBy(records, committed, OLTP_OPERATION_KIND.NEW_ORDER);
  const delivered = committedSum(records, OLTP_OPERATION_KIND.DELIVERY, 'deliveredOrders');
  return {
    committed: {
      newOrders,
      payments: countBy(records, committed, OLTP_OPERATION_KIND.PAYMENT),
      deliveredOrders: delivered,
      orderLines: committedSum(records, OLTP_OPERATION_KIND.NEW_ORDER, 'lineCount'),
    },
    unresolved: {
      newOrders: countBy(records, unresolved, OLTP_OPERATION_KIND.NEW_ORDER),
      payments: countBy(records, unresolved, OLTP_OPERATION_KIND.PAYMENT),
      deliveries: countBy(records, unresolved, OLTP_OPERATION_KIND.DELIVERY),
    },
  };
}

function check(name, observed, expected, maxExplainedExcess) {
  return Object.freeze({
    name,
    observedDelta: observed,
    expectedDelta: expected,
    exact: observed === expected,
    explainedByUnresolved: observed !== expected && maxExplainedExcess !== null &&
      Math.abs(observed - expected) <= maxExplainedExcess,
  });
}

// Δorders == committed new-orders, Δhistory == committed payments,
// Δnew_order == committed new-orders − Σ delivered, Δorder_line == Σ lines.
function reconcileFinalState(records, before, after, scale) {
  if (!before.snapshot || !after.snapshot) {
    return Object.freeze({
      status: RECONCILIATION_STATUS.UNOBSERVED,
      before: snapshotSummary(before),
      after: snapshotSummary(after),
      checks: null,
    });
  }
  const delta = (table) => after.snapshot.rowCounts[table] - before.snapshot.rowCounts[table];
  const {committed, unresolved} = expectationsOf(records);
  const checks = Object.freeze([
    check('orders', delta('orders'), committed.newOrders, unresolved.newOrders),
    check('history', delta('history'), committed.payments, unresolved.payments),
    check('new_order', delta('new_order'), committed.newOrders - committed.deliveredOrders,
      unresolved.newOrders + unresolved.deliveries * scale.districtsPerWarehouse),
    check('order_line', delta('order_line'), committed.orderLines,
      unresolved.newOrders * OLTP_MAX_NEW_ORDER_LINES),
  ]);
  const allExact = arrayEvery(checks, (entry) => entry.exact);
  const allExplained = arrayEvery(checks, (entry) => entry.exact || entry.explainedByUnresolved);
  let status = RECONCILIATION_STATUS.MISMATCH;
  if (allExact) status = RECONCILIATION_STATUS.RECONCILED;
  else if (allExplained) status = RECONCILIATION_STATUS.UNRESOLVED_EFFECTS_OBSERVED;
  return Object.freeze({
    status,
    before: snapshotSummary(before),
    after: snapshotSummary(after),
    deltas: Object.freeze(Object.fromEntries(arrayMap(OLTP_SNAPSHOT_TABLES,
      (table) => [table.name, delta(table.name)]))),
    committedEffects: Object.freeze(committed),
    unresolvedRequests: Object.freeze(unresolved),
    checks,
  });
}

export {
  LOGICAL_CHECKSUM_METHOD as OLTP_LOGICAL_CHECKSUM_METHOD,
  RECONCILIATION_STATUS as OLTP_RECONCILIATION_STATUS,
  VERIFICATION_STATUS as OLTP_DATASET_VERIFICATION_STATUS,
  observeSnapshot as observeOltpStateSnapshot,
  reconcileFinalState as reconcileOltpFinalState,
  verifyLoadedDataset as verifyOltpLoadedDataset,
};
