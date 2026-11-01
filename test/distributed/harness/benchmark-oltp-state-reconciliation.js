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
  // The product refused the canonical dataset load (setup failed).
  FAILED: 'failed',
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

async function verifyLoadedDataset(dataset, observed, setupFailure = null) {
  const expected = await expectedDatasetSnapshot(dataset);
  const expectedChecksum = logicalChecksum(expected);
  if (setupFailure) {
    return Object.freeze({
      status: VERIFICATION_STATUS.FAILED,
      method: LOGICAL_CHECKSUM_METHOD,
      expectedLogicalChecksum: expectedChecksum,
      observedLogicalChecksum: null,
      failure: setupFailure,
    });
  }
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

// The sum of one effect count over the committed requests of a kind. An effect
// that is not a count cannot be reconciled: it is a defect of the record.
function committedSum(records, kind, field) {
  let sum = 0;
  for (const record of arrayFilter(records, (entry) =>
    entry.outcome === OPERATION_OUTCOME.COMMITTED && entry.operationKind === kind)) {
    const count = record.effectSummary[field];
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`committed ${kind} effect ${field} is not a count`);
    }
    sum += count;
  }
  return sum;
}

function expectationsOf(records) {
  const committed = OPERATION_OUTCOME.COMMITTED;
  const unresolved = OPERATION_OUTCOME.UNRESOLVED;
  return {
    committed: {
      newOrders: countBy(records, committed, OLTP_OPERATION_KIND.NEW_ORDER),
      payments: countBy(records, committed, OLTP_OPERATION_KIND.PAYMENT),
      deliveredOrders: committedSum(records, OLTP_OPERATION_KIND.DELIVERY, 'deliveredOrders'),
      orderLines: committedSum(records, OLTP_OPERATION_KIND.NEW_ORDER, 'lineCount'),
    },
    unresolved: {
      newOrders: countBy(records, unresolved, OLTP_OPERATION_KIND.NEW_ORDER),
      payments: countBy(records, unresolved, OLTP_OPERATION_KIND.PAYMENT),
      deliveries: countBy(records, unresolved, OLTP_OPERATION_KIND.DELIVERY),
    },
  };
}

/**
 * The table deltas the committed requests explain exactly:
 * Δorders == committed new-orders, Δhistory == committed payments,
 * Δnew_order == committed new-orders − Σ delivered, Δorder_line == Σ lines.
 * @param {Array<Object>} records request records with outcome, kind, effectSummary
 * @return {{orders: number, history: number, new_order: number, order_line: number}}
 */
function committedTableDeltas(records) {
  const {committed} = expectationsOf(records);
  return {
    orders: committed.newOrders,
    history: committed.payments,
    new_order: committed.newOrders - committed.deliveredOrders,
    order_line: committed.orderLines,
  };
}

// One check: the observed delta minus the committed expectation must be zero,
// or lie in [-maxDeficit, maxExcess], the effects the unresolved requests could
// have applied at most once each. A committed effect missing from the state is
// never explained by an unresolved request (maxDeficit is 0 except where an
// unresolved delivery may have removed new_order rows).
function check(name, observed, expected, maxExcess, maxDeficit) {
  const difference = observed - expected;
  return Object.freeze({
    name,
    observedDelta: observed,
    expectedDelta: expected,
    exact: difference === 0,
    explainedByUnresolved: difference !== 0 && difference <= maxExcess &&
      difference >= -maxDeficit,
  });
}

function rowCount(rows, table, side) {
  const count = rows[table];
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`final-state ${side} row count of ${table} is not a count`);
  }
  return count;
}

/**
 * The one final-state reconciliation formula, over the row counts before and
 * after the window. The run records its verdict with it; admission recomputes
 * the verdict from the record with it.
 * @param {Array<Object>} records request records
 * @param {Object<string, number>} beforeRows table -> row count
 * @param {Object<string, number>} afterRows table -> row count
 * @param {{districtsPerWarehouse: number}} scale the executed workload's scale
 * @return {Object} status, deltas, committedEffects, unresolvedRequests, checks
 */
function reconcileTableRows(records, beforeRows, afterRows, scale) {
  const delta = (table) => rowCount(afterRows, table, 'after') -
    rowCount(beforeRows, table, 'before');
  const {committed, unresolved} = expectationsOf(records);
  const expected = committedTableDeltas(records);
  const checks = Object.freeze([
    check('orders', delta('orders'), expected.orders, unresolved.newOrders, 0),
    check('history', delta('history'), expected.history, unresolved.payments, 0),
    check('new_order', delta('new_order'), expected.new_order, unresolved.newOrders,
      unresolved.deliveries * scale.districtsPerWarehouse),
    check('order_line', delta('order_line'), expected.order_line,
      unresolved.newOrders * OLTP_MAX_NEW_ORDER_LINES, 0),
  ]);
  let status = RECONCILIATION_STATUS.MISMATCH;
  if (arrayEvery(checks, (entry) => entry.exact)) status = RECONCILIATION_STATUS.RECONCILED;
  else if (arrayEvery(checks, (entry) => entry.exact || entry.explainedByUnresolved)) {
    status = RECONCILIATION_STATUS.UNRESOLVED_EFFECTS_OBSERVED;
  }
  return Object.freeze({
    status,
    committedEffects: Object.freeze(committed),
    unresolvedRequests: Object.freeze(unresolved),
    checks,
  });
}

function reconcileFinalState(records, before, after, scale) {
  if (!before.snapshot || !after.snapshot) {
    return Object.freeze({
      status: RECONCILIATION_STATUS.UNOBSERVED,
      before: snapshotSummary(before),
      after: snapshotSummary(after),
      checks: null,
    });
  }
  const verdict = reconcileTableRows(records, before.snapshot.rowCounts,
    after.snapshot.rowCounts, scale);
  return Object.freeze({
    status: verdict.status,
    before: snapshotSummary(before),
    after: snapshotSummary(after),
    deltas: Object.freeze(Object.fromEntries(arrayMap(OLTP_SNAPSHOT_TABLES, (table) =>
      [table.name, after.snapshot.rowCounts[table.name] - before.snapshot.rowCounts[table.name]]))),
    committedEffects: verdict.committedEffects,
    unresolvedRequests: verdict.unresolvedRequests,
    checks: verdict.checks,
  });
}

export {
  LOGICAL_CHECKSUM_METHOD as OLTP_LOGICAL_CHECKSUM_METHOD,
  RECONCILIATION_STATUS as OLTP_RECONCILIATION_STATUS,
  VERIFICATION_STATUS as OLTP_DATASET_VERIFICATION_STATUS,
  committedTableDeltas as committedOltpTableDeltas,
  observeSnapshot as observeOltpStateSnapshot,
  reconcileFinalState as reconcileOltpFinalState,
  reconcileTableRows as reconcileOltpTableRows,
  verifyLoadedDataset as verifyOltpLoadedDataset,
};
