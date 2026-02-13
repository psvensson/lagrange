/**
 * Tests for ResultStream — result streaming with per-query
 * result budget enforcement.
 *
 * Requirements: 4.4, 9.1
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  ResultStream,
  estimateRowBytes,
  STREAM_STATE,
  STREAM_ERROR_MSG,
} from '../../src/query/result-stream.js';
import {
  QUERY_BUDGET_ERROR_MSG,
} from '../../src/wasm-service/query-budget-constants.js';

// --- estimateRowBytes ---

test('estimateRowBytes - returns 0 for null/undefined', (t) => {
  t.equal(estimateRowBytes(null), 0);
  t.equal(estimateRowBytes(undefined), 0);
  t.end();
});

test('estimateRowBytes - returns length for strings', (t) => {
  t.equal(estimateRowBytes('hello'), 5);
  t.end();
});

test('estimateRowBytes - returns JSON length for objects', (t) => {
  const row = {id: 1, name: 'a'};
  const expected = JSON.stringify(row).length;
  t.equal(estimateRowBytes(row), expected);
  t.end();
});

// --- ResultStream construction ---

test('ResultStream - starts in OPEN state', (t) => {
  const stream = new ResultStream();
  t.equal(stream.state, STREAM_STATE.OPEN);
  t.equal(stream.totalRows, 0);
  t.equal(stream.totalBytes, 0);
  t.end();
});

test('ResultStream - accepts budget overrides', (t) => {
  const stream = new ResultStream({RESULT_MAX_ROWS: 5});
  t.equal(stream.maxRows, 5);
  t.end();
});

// --- push ---

test('ResultStream - push accepts rows', (t) => {
  const stream = new ResultStream();
  const result = stream.push([{id: 1}, {id: 2}]);

  t.equal(result.accepted, 2);
  t.equal(result.totalRows, 2);
  t.ok(result.totalBytes > 0);
  t.notOk(result.exceeded);
  t.equal(stream.getRows().length, 2);
  t.end();
});

test('ResultStream - push enforces max rows', (t) => {
  const stream = new ResultStream({RESULT_MAX_ROWS: 2});

  stream.push([{id: 1}, {id: 2}]);
  const result = stream.push([{id: 3}]);

  t.equal(result.accepted, 0);
  t.ok(result.exceeded);
  t.equal(stream.state, STREAM_STATE.BUDGET_EXCEEDED);
  t.equal(
    stream.budgetError,
    QUERY_BUDGET_ERROR_MSG.RESULT_MAX_ROWS_EXCEEDED,
  );
  t.end();
});

test('ResultStream - push enforces max bytes', (t) => {
  // Each row is ~10 bytes as JSON; set limit to 15
  const stream = new ResultStream({
    RESULT_MAX_ROWS: 1000,
    RESULT_MAX_BYTES: 15,
  });

  const result = stream.push([{id: 1}, {id: 2}, {id: 3}]);

  // Should accept some but not all
  t.ok(result.accepted < 3);
  t.ok(result.exceeded);
  t.equal(
    stream.budgetError,
    QUERY_BUDGET_ERROR_MSG.RESULT_MAX_BYTES_EXCEEDED,
  );
  t.end();
});

test('ResultStream - push throws on closed stream', (t) => {
  const stream = new ResultStream();
  stream.close();

  t.throws(
    () => stream.push([{id: 1}]),
    /Cannot push to a closed result stream/,
  );
  t.end();
});

test('ResultStream - push throws on non-array', (t) => {
  const stream = new ResultStream();
  t.throws(
    () => stream.push('not-array'),
    /Pushed rows must be an array/,
  );
  t.end();
});

test('ResultStream - push partial accept on budget edge', (t) => {
  const stream = new ResultStream({RESULT_MAX_ROWS: 3});

  stream.push([{id: 1}]);
  const result = stream.push([{id: 2}, {id: 3}, {id: 4}]);

  // Should accept 2 more (total 3) then exceed
  t.equal(result.accepted, 2);
  t.ok(result.exceeded);
  t.equal(stream.totalRows, 3);
  t.end();
});

// --- close ---

test('ResultStream - close returns summary', (t) => {
  const stream = new ResultStream();
  stream.push([{id: 1}]);
  const summary = stream.close();

  t.equal(summary.totalRows, 1);
  t.ok(summary.totalBytes > 0);
  t.equal(summary.state, STREAM_STATE.CLOSED);
  t.end();
});

test('ResultStream - close preserves budget_exceeded state', (t) => {
  const stream = new ResultStream({RESULT_MAX_ROWS: 1});
  stream.push([{id: 1}, {id: 2}]);
  const summary = stream.close();

  t.equal(summary.state, STREAM_STATE.BUDGET_EXCEEDED);
  t.end();
});

// --- onData listener ---

test('ResultStream - onData notifies on push', (t) => {
  const stream = new ResultStream();
  const received = [];
  stream.onData((batch, meta) => {
    received.push({batch, meta});
  });

  stream.push([{id: 1}, {id: 2}]);

  t.equal(received.length, 1);
  t.equal(received[0].batch.length, 2);
  t.equal(received[0].meta.totalRows, 2);
  t.end();
});

test('ResultStream - onData throws on non-function', (t) => {
  const stream = new ResultStream();
  t.throws(
    () => stream.onData('not-fn'),
    /Stream listener must be a function/,
  );
  t.end();
});

// --- getRows ---

test('ResultStream - getRows returns all collected rows', (t) => {
  const stream = new ResultStream();
  stream.push([{id: 1}]);
  stream.push([{id: 2}]);

  const rows = stream.getRows();
  t.equal(rows.length, 2);
  t.equal(rows[0].id, 1);
  t.equal(rows[1].id, 2);
  t.end();
});
