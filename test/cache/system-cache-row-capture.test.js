import assert from 'node:assert/strict';
import {test} from 'node:test';
import {captureSystemTableRows} from '../../src/cache/system-cache-key-descriptor.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';

const TABLE = SYSTEM_TABLE_NAME.NODES;
const ROW = Object.freeze({node_id: 'captured-node', status: 'active'});

test('system row capture retains canonical keys and deeply owned immutable membership', () => {
  const row = Object.assign(Object.create(null), ROW, {detail: {values: [1, 2]}});
  const rows = [row];
  const captured = captureSystemTableRows(TABLE, rows);
  row.node_id = 'retargeted';
  row.detail.values[0] = 9;
  rows.length = 0;
  assert.deepEqual(captured, {rows: [{...ROW, detail: {values: [1, 2]}}], keys: [ROW.node_id]});
  assert.equal(Object.isFrozen(captured), true);
  assert.equal(Object.isFrozen(captured.rows), true);
  assert.equal(Object.isFrozen(captured.rows[0]), true);
  assert.equal(Object.isFrozen(captured.rows[0].detail.values), true);
  assert.equal(Object.isFrozen(captured.keys), true);
  assert.deepEqual(captureSystemTableRows(TABLE, []), {rows: [], keys: []});
});

test('system row capture refuses undeclared descriptor names before key coercion or row access', () => {
  let callbacks = 0;
  const table = {[Symbol.toPrimitive]() {callbacks += 1; return TABLE;}};
  const rows = new Proxy([ROW], {get() {callbacks += 1; throw new Error('row proxy read');}});
  for (const name of ['constructor', '__proto__', 'toString', 'missing-table', null, table]) {
    assert.equal(captureSystemTableRows(name, rows), null);
  }
  assert.equal(callbacks, 0);
  assert.deepEqual(captureSystemTableRows(TABLE, [ROW]), {rows: [ROW], keys: [ROW.node_id]});
});

test('system row capture refuses the whole vector when any key or descendant is invalid', () => {
  const cycle = {};
  cycle.self = cycle;
  const invalidRows = [
    [{id: ROW.node_id}], [{...ROW, node_id: ' \t '}], [{...ROW, node_id: 1}],
    [ROW, {...ROW}], [ROW, {status: 'active'}], [{...ROW, detail: cycle}],
  ];
  for (const rows of invalidRows) assert.equal(captureSystemTableRows(TABLE, rows), null);
  assert.deepEqual(captureSystemTableRows(TABLE, [ROW]), {rows: [ROW], keys: [ROW.node_id]});
});

test('system row capture never delegates key validation to a mutable string intrinsic', () => {
  const original = String.prototype.trim;
  let callbacks = 0;
  let valid;
  let invalid;
  String.prototype.trim = function() {callbacks += 1; return 'rewritten';};
  try {
    valid = captureSystemTableRows(TABLE, [ROW]);
    invalid = captureSystemTableRows(TABLE, [{...ROW, node_id: ' \t '}]);
  } finally {
    String.prototype.trim = original;
  }
  assert.equal(callbacks, 0);
  assert.deepEqual(valid, {rows: [ROW], keys: [ROW.node_id]});
  assert.equal(invalid, null);
});
