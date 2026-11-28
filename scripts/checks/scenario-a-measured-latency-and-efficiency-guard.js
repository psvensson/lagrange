#!/usr/bin/env node
/**
 * Probe of epic scenario-a-measured-latency-and-efficiency: the number of
 * unmet rows of a small commit-path budget, measured deterministically in
 * process. The measurement is the one owner shared with the quest
 * transaction-redundant-progress-writes (measureTransactionShape in
 * test/query/transaction-progress-write-witness-support.js): the real
 * SQLQueryEngine and coordinator over the coordinator-table gateway double
 * and the participant double, with every consensus round (a
 * coordinator-table mutation, a participant PREPARE or decision proposal)
 * taking one tick of a virtual round clock. It counts R1's quantities
 * (reports/r1-commit-path.md section 2): consensus rounds in sequence and
 * proposals per write transaction, one partition per table.
 *
 *   row 1 new_order-shaped transaction (reads item, writes five tables):
 *         sequential consensus rounds <= 14 (unchanged tree: 19 = 9 + 2P)
 *   row 2 payment-shaped transaction (writes four tables):
 *         sequential consensus rounds <= 13 (unchanged tree: 17)
 *   row 3 proposals per transaction: new_order <= 31 and payment <= 26
 *         (unchanged tree: 36 and 30 = 6 + 6P)
 *
 * It reads the tree only and starts nothing (no cluster, no network). It
 * measures no latency: latency claims come only from measured runs on the
 * substrate ladder. When it cannot measure (a transaction does not commit,
 * the round clock stalls, an exception), it prints no number and exits 2.
 * --metric prints the unmet-row count (target 0); --json prints the rows.
 */
import {
  TRANSACTION_SHAPE,
  measureTransactionShape,
} from '../../test/query/transaction-progress-write-witness-support.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);

const ZERO = 0;
const ONE = 1;
const NOT_MEASURED_EXIT = 2;
const ARGV_OFFSET = 2;
const JSON_INDENT = 2;
const METRIC_FLAG = '--metric';
const JSON_FLAG = '--json';
const NEWLINE = '\n';
const NOT_MEASURED_PREFIX =
  'scenario-a-measured-latency-and-efficiency-guard: not measured: ';
const NOT_COMMITTED = 'a measured transaction did not commit: ';
const ROW_LINE_SEPARATOR = ' ';
const ROW_MET = 'met';
const ROW_UNMET = 'UNMET';
const ROW = Object.freeze({
  NEW_ORDER_ROUNDS: 'new-order-sequential-rounds',
  PAYMENT_ROUNDS: 'payment-sequential-rounds',
  PROPOSALS: 'proposals-per-transaction',
});
const TARGET = Object.freeze({
  NEW_ORDER_ROUNDS: 14,
  PAYMENT_ROUNDS: 13,
  NEW_ORDER_PROPOSALS: 31,
  PAYMENT_PROPOSALS: 26,
});

async function measuredShapes() {
  const newOrder = await measureTransactionShape(TRANSACTION_SHAPE.NEW_ORDER);
  const payment = await measureTransactionShape(TRANSACTION_SHAPE.PAYMENT);
  for (const [shape, measured] of [[TRANSACTION_SHAPE.NEW_ORDER, newOrder],
    [TRANSACTION_SHAPE.PAYMENT, payment]]) {
    if (measured.committed !== true) {
      throw new Error(`${NOT_COMMITTED}${shape.name}`);
    }
  }
  return {newOrder, payment};
}

function budgetRows({newOrder, payment}) {
  return [
    {row: ROW.NEW_ORDER_ROUNDS, measured: newOrder.rounds,
      target: TARGET.NEW_ORDER_ROUNDS,
      met: newOrder.rounds <= TARGET.NEW_ORDER_ROUNDS},
    {row: ROW.PAYMENT_ROUNDS, measured: payment.rounds,
      target: TARGET.PAYMENT_ROUNDS,
      met: payment.rounds <= TARGET.PAYMENT_ROUNDS},
    {row: ROW.PROPOSALS,
      measured: {newOrder: newOrder.proposals, payment: payment.proposals},
      target: {newOrder: TARGET.NEW_ORDER_PROPOSALS,
        payment: TARGET.PAYMENT_PROPOSALS},
      met: newOrder.proposals <= TARGET.NEW_ORDER_PROPOSALS &&
        payment.proposals <= TARGET.PAYMENT_PROPOSALS},
  ];
}

const args = process.argv.slice(ARGV_OFFSET);
let rows;
try {
  rows = budgetRows(await measuredShapes());
} catch (error) {
  process.stderr.write(`${NOT_MEASURED_PREFIX}${error?.message || String(error)}` +
    `${NEWLINE}`);
  process.exit(NOT_MEASURED_EXIT);
}
let metric = ZERO;
for (const entry of rows) {
  if (entry.met !== true) metric += ONE;
}
const exitCode = metric === ZERO ? ZERO : ONE;
if (arrayIncludes(args, METRIC_FLAG)) {
  process.stdout.write(`${metric}${NEWLINE}`);
  process.exit(exitCode);
}
if (arrayIncludes(args, JSON_FLAG)) {
  process.stdout.write(`${JSON.stringify({metric, rows}, null, JSON_INDENT)}` +
    `${NEWLINE}`);
  process.exit(exitCode);
}
for (const entry of rows) {
  process.stdout.write([entry.met ? ROW_MET : ROW_UNMET, entry.row,
    JSON.stringify(entry.measured), JSON.stringify(entry.target)]
    .join(ROW_LINE_SEPARATOR) + NEWLINE);
}
process.exit(exitCode);
