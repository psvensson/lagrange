/**
 * Tests for nested ctx.call classifier.
 *
 * Requirements: 8.1, 8.2
 */

import {test} from '../../src/test-helpers/tap.js';
import {classifyNestedCall} from '../../src/query/nested-call-classifier.js';
import {
  NESTED_CALL_CLASSIFICATION as CLS,
  NESTED_CALL_REASON as REASON,
  NESTED_CALL_ERROR_MSG as ERR,
} from '../../src/query/runtime-constants.js';

// ─── BOUNDED: PK point lookup ────────────────────────────────

test('PK point lookup → BOUNDED', (t) => {
  const result = classifyNestedCall(
    'SELECT * FROM users WHERE id = ?',
  );
  t.equal(result.classification, CLS.BOUNDED);
  t.equal(result.reason, REASON.PK_POINT_LOOKUP);
  t.end();
});

test('PK equality with named column → BOUNDED', (t) => {
  const result = classifyNestedCall(
    'SELECT name FROM orders WHERE order_id = ?',
  );
  t.equal(result.classification, CLS.BOUNDED);
  t.equal(result.reason, REASON.PK_POINT_LOOKUP);
  t.end();
});

// ─── BOUNDED: IN clause with bounded params ──────────────────

test('IN clause with bounded params → BOUNDED', (t) => {
  const result = classifyNestedCall(
    'SELECT * FROM users WHERE id IN (?, ?, ?)',
  );
  t.equal(result.classification, CLS.BOUNDED);
  t.equal(result.reason, REASON.BOUNDED_IN_CLAUSE);
  t.end();
});

test('IN clause with single param → BOUNDED', (t) => {
  const result = classifyNestedCall(
    'SELECT * FROM users WHERE id IN (?)',
  );
  t.equal(result.classification, CLS.BOUNDED);
  t.equal(result.reason, REASON.BOUNDED_IN_CLAUSE);
  t.end();
});

test('ANY clause → BOUNDED', (t) => {
  const result = classifyNestedCall(
    'SELECT * FROM users WHERE id = ANY(?)',
  );
  t.equal(result.classification, CLS.BOUNDED);
  t.equal(result.reason, REASON.BOUNDED_IN_CLAUSE);
  t.end();
});

// ─── BOUNDED: LIMIT query with WHERE ─────────────────────────

test('LIMIT query with WHERE and range → BOUNDED', (t) => {
  const result = classifyNestedCall(
    'SELECT * FROM logs WHERE ts > ? LIMIT 10',
  );
  t.equal(result.classification, CLS.BOUNDED);
  t.equal(result.reason, REASON.INDEXED_LIMIT_QUERY);
  t.end();
});

test('LIMIT with BETWEEN → BOUNDED', (t) => {
  const result = classifyNestedCall(
    'SELECT * FROM events WHERE ts BETWEEN ? AND ? LIMIT 5',
  );
  t.equal(result.classification, CLS.BOUNDED);
  t.equal(result.reason, REASON.INDEXED_LIMIT_QUERY);
  t.end();
});

// ─── UNBOUNDED: Full scan (no WHERE) ─────────────────────────

test('Full scan no WHERE → UNBOUNDED', (t) => {
  const result = classifyNestedCall(
    'SELECT * FROM users',
  );
  t.equal(result.classification, CLS.UNBOUNDED);
  t.equal(result.reason, REASON.FULL_TABLE_SCAN);
  t.end();
});

test('Full scan with LIMIT but no WHERE → UNBOUNDED', (t) => {
  const result = classifyNestedCall(
    'SELECT * FROM users LIMIT 10',
  );
  t.equal(result.classification, CLS.UNBOUNDED);
  t.equal(result.reason, REASON.FULL_TABLE_SCAN);
  t.end();
});

// ─── UNBOUNDED: Range scan without LIMIT ─────────────────────

test('Range scan without LIMIT → UNBOUNDED', (t) => {
  const result = classifyNestedCall(
    'SELECT * FROM orders WHERE amount > ?',
  );
  t.equal(result.classification, CLS.UNBOUNDED);
  t.equal(result.reason, REASON.RANGE_SCAN_NO_LIMIT);
  t.end();
});

test('BETWEEN without LIMIT → UNBOUNDED', (t) => {
  const result = classifyNestedCall(
    'SELECT * FROM events WHERE ts BETWEEN ? AND ?',
  );
  t.equal(result.classification, CLS.UNBOUNDED);
  t.equal(result.reason, REASON.RANGE_SCAN_NO_LIMIT);
  t.end();
});

test('Less-than without LIMIT → UNBOUNDED', (t) => {
  const result = classifyNestedCall(
    'SELECT * FROM items WHERE price < ?',
  );
  t.equal(result.classification, CLS.UNBOUNDED);
  t.equal(result.reason, REASON.RANGE_SCAN_NO_LIMIT);
  t.end();
});

// ─── UNBOUNDED: JOIN query ───────────────────────────────────

test('JOIN query → UNBOUNDED', (t) => {
  const result = classifyNestedCall(
    'SELECT * FROM users JOIN orders ON users.id = orders.uid',
  );
  t.equal(result.classification, CLS.UNBOUNDED);
  t.equal(result.reason, REASON.JOIN_DETECTED);
  t.end();
});

test('LEFT JOIN query → UNBOUNDED', (t) => {
  const result = classifyNestedCall(
    'SELECT * FROM a LEFT JOIN b ON a.id = b.aid WHERE a.x = ?',
  );
  t.equal(result.classification, CLS.UNBOUNDED);
  t.equal(result.reason, REASON.JOIN_DETECTED);
  t.end();
});

// ─── UNBOUNDED: Subquery ─────────────────────────────────────

test('Subquery → UNBOUNDED', (t) => {
  const result = classifyNestedCall(
    'SELECT * FROM users WHERE id IN (SELECT uid FROM orders)',
  );
  t.equal(result.classification, CLS.UNBOUNDED);
  t.equal(result.reason, REASON.SUBQUERY_DETECTED);
  t.end();
});

test('Correlated subquery → UNBOUNDED', (t) => {
  const result = classifyNestedCall(
    'SELECT * FROM users WHERE EXISTS (SELECT 1 FROM orders)',
  );
  t.equal(result.classification, CLS.UNBOUNDED);
  t.equal(result.reason, REASON.SUBQUERY_DETECTED);
  t.end();
});

// ─── Error handling ──────────────────────────────────────────

test('throws on empty string', (t) => {
  t.throws(
    () => classifyNestedCall(''),
    {message: ERR.QUERY_REQUIRED},
  );
  t.end();
});

test('throws on non-string input', (t) => {
  t.throws(
    () => classifyNestedCall(null),
    {message: ERR.QUERY_REQUIRED},
  );
  t.end();
});

test('throws on undefined input', (t) => {
  t.throws(
    () => classifyNestedCall(undefined),
    {message: ERR.QUERY_REQUIRED},
  );
  t.end();
});

// ─── Edge cases ──────────────────────────────────────────────

test('whitespace-padded query still classified', (t) => {
  const result = classifyNestedCall(
    '  SELECT * FROM users WHERE id = ?  ',
  );
  t.equal(result.classification, CLS.BOUNDED);
  t.end();
});

test('case-insensitive keywords', (t) => {
  const result = classifyNestedCall(
    'select * from users where id = ?',
  );
  t.equal(result.classification, CLS.BOUNDED);
  t.end();
});

test('multiple equality conditions → BOUNDED', (t) => {
  const result = classifyNestedCall(
    'SELECT * FROM users WHERE id = ? AND status = ?',
  );
  t.equal(result.classification, CLS.BOUNDED);
  t.equal(result.reason, REASON.PK_POINT_LOOKUP);
  t.end();
});
