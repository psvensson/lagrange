/**
 * Numeric key routing: typed partition boundaries, single comparator owner everywhere,
 * zero legacy fallback or coercion, declared primary keys with no 'id' fallback,
 * and compound primary key routing and predicate intersection.
 *
 * Emits test-output/release-0-3-queryable-core/a1-receipt.json with 8 required receipts:
 * 1. sqlite-binary-text-order
 * 2. finite-numeric-comparison-bounds
 * 3. unsupported-and-absent-key-validation
 * 4. merge-evaluation-partition-key-delegation
 * 5. typed-boundary-representation-and-bigint-precision
 * 6. no-legacy-boundary-or-text-number-fallback
 * 7. declared-primary-key-resolution-no-id-fallback
 * 8. compound-primary-key-routing-and-predicate-intersection
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {KeyRange} from '../../src/partition/key-range-manager.js';
import {PartitionResolver} from '../../src/query/partition-resolver.js';
import {QueryGroup} from '../../src/live-query/live-query-group.js';
import {
  compareRoutingKeys,
  compareSplitKey,
} from '../../src/partition/split-key-comparator.js';
import {
  PARTITION_BOUNDARY_KEY_TYPE,
  decodePartitionBoundaryValue,
  resolveDeclaredPrimaryKeyColumns,
} from '../../src/partition/partition-boundary-representation.js';
import {
  PartitionSplitMergeManagerCoreMethods,
} from '../../src/partition/partition-split-merge-manager-core-methods.js';
import {
  DistributedWriteCoordinator,
} from '../../src/query/distributed/distributed-write-coordinator.js';

const TABLE = 'items';
const TEXT_BOUNDARY = '500';
const STORED_TEXT_BOUNDARY = '500.0';
const LEFT_KEY = 250;
const RIGHT_KEY = 1000;
const NON_NUMERIC_TEXT = 'abc';
const MISMATCH_PATTERN = /type mismatch|mixed|mismatch/iu;

const RECEIPT_FILE = 'test-output/release-0-3-queryable-core/a1-receipt.json';
const receipts = new Map();

function recordReceipt(id, passed) {
  receipts.set(id, passed);
  flushReceipts();
}

function flushReceipts() {
  const dir = path.dirname(RECEIPT_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true});
  }
  const receiptList = Array.from(receipts.entries()).map(([id, passed]) => ({
    id,
    passed,
  }));
  const allPassed =
    receiptList.length === 8 && receiptList.every((r) => r.passed === true);
  fs.writeFileSync(
    RECEIPT_FILE,
    JSON.stringify(
      {
        schema: 'test-receipt/1',
        status: allPassed ? 'pass' : 'fail',
        receipts: receiptList,
      },
      null,
      2,
    ) + '\n',
  );
}

function splitPartitions(boundary = TEXT_BOUNDARY) {
  return [
    {
      partition_id: 'p1',
      partition_key_start: null,
      partition_key_end: boundary,
      partition_key_type: 'INTEGER',
    },
    {
      partition_id: 'p2',
      partition_key_start: boundary,
      partition_key_end: null,
      partition_key_type: 'INTEGER',
    },
  ];
}

test('an integer key routes numerically against typed boundary metadata', async () => {
  const resolver = new PartitionResolver();
  assert.equal(
    resolver.resolvePartitionForKey(TABLE, LEFT_KEY, splitPartitions()),
    'p1',
    '250 sorts left of the boundary 500',
  );
  assert.equal(
    resolver.resolvePartitionForKey(TABLE, RIGHT_KEY, splitPartitions()),
    'p2',
    '1000 sorts right of the boundary 500',
  );
  for (const boundary of [TEXT_BOUNDARY, STORED_TEXT_BOUNDARY]) {
    assert.equal(
      resolver.resolvePartitionForKey(TABLE, RIGHT_KEY, splitPartitions(boundary)),
      'p2',
      `1000 sorts right of '${boundary}'`,
    );
    assert.equal(
      resolver.resolvePartitionForKey(TABLE, LEFT_KEY, splitPartitions(boundary)),
      'p1',
      `250 sorts left of '${boundary}'`,
    );
  }
  const right = new KeyRange(500n, null);
  assert.equal(right.contains(RIGHT_KEY), true, 'the right range contains 1000');
  assert.equal(right.contains(LEFT_KEY), false, 'the right range excludes 250');
});

test('one comparator owns routing order for ranges, resolver and live queries', async () => {
  const range = new KeyRange(null, null);
  const resolver = new PartitionResolver();
  const group = new QueryGroup({});
  const pairs = [
    [RIGHT_KEY, 500],
    ['b', 'a'],
    [7, 9],
    [null, 'a'],
  ];
  for (const [left, right] of pairs) {
    const expected = Math.sign(compareRoutingKeys(left, right));
    assert.equal(
      Math.sign(range.compareKeys(left, right)),
      expected,
      `KeyRange agrees with owner on ${String(left)} vs ${String(right)}`,
    );
    assert.equal(
      Math.sign(resolver.compareValues(left, right)),
      expected,
      `PartitionResolver agrees with owner on ${String(left)} vs ${String(right)}`,
    );
    assert.equal(
      Math.sign(group.compareValues(left, right)),
      expected,
      `QueryGroup agrees with owner on ${String(left)} vs ${String(right)}`,
    );
  }
});

test('mixed key spaces are refused, never coerced', async () => {
  assert.throws(
    () => compareRoutingKeys(RIGHT_KEY, NON_NUMERIC_TEXT),
    MISMATCH_PATTERN,
    'the owner refuses number vs non-numeric text',
  );
  assert.throws(
    () => compareRoutingKeys(RIGHT_KEY, TEXT_BOUNDARY),
    MISMATCH_PATTERN,
    'the owner refuses number vs string without legacy coercion',
  );
  assert.throws(
    () => new KeyRange(NON_NUMERIC_TEXT, null).contains(RIGHT_KEY),
    MISMATCH_PATTERN,
    'KeyRange surfaces the same typed outcome',
  );
  assert.throws(
    () => new PartitionResolver().compareValues(RIGHT_KEY, NON_NUMERIC_TEXT),
    MISMATCH_PATTERN,
    'PartitionResolver surfaces the same typed outcome',
  );
});

// --- RECEIPT 1: sqlite-binary-text-order ---
test('Receipt 1: sqlite-binary-text-order verifies utf8 binary collation', () => {
  assert.equal(compareRoutingKeys('a', 'b'), -1);
  assert.equal(compareRoutingKeys('b', 'a'), 1);
  assert.equal(compareRoutingKeys('a', 'a'), 0);
  // In SQLite BINARY collation (byte-by-byte UTF-8): 'B' (0x42) < 'a' (0x61)
  assert.equal(compareRoutingKeys('B', 'a'), -1);
  assert.equal(compareRoutingKeys('a', 'B'), 1);
  // UTF-8 multibyte ordering
  assert.equal(compareRoutingKeys('café', 'cafe'), 1);
  recordReceipt('sqlite-binary-text-order', true);
});

// --- RECEIPT 2: finite-numeric-comparison-bounds ---
test('Receipt 2: finite-numeric-comparison-bounds avoids subtraction overflow', () => {
  assert.equal(
    compareRoutingKeys(Number.MAX_VALUE, -Number.MAX_VALUE),
    1,
    'MAX_VALUE vs -MAX_VALUE must not overflow to Infinity',
  );
  assert.equal(
    compareRoutingKeys(-Number.MAX_VALUE, Number.MAX_VALUE),
    -1,
    '-MAX_VALUE vs MAX_VALUE must not underflow',
  );
  assert.equal(
    compareRoutingKeys(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    -1,
  );
  assert.equal(compareRoutingKeys(-0, 0), 0);
  assert.equal(compareRoutingKeys(0.1 + 0.2, 0.30000000000000004), 0);
  recordReceipt('finite-numeric-comparison-bounds', true);
});

// --- RECEIPT 3: unsupported-and-absent-key-validation ---
test('Receipt 3: unsupported-and-absent-key-validation fails closed before equality', () => {
  assert.throws(() => compareRoutingKeys(NaN, NaN), MISMATCH_PATTERN);
  assert.throws(() => compareRoutingKeys(Infinity, Infinity), MISMATCH_PATTERN);
  assert.throws(() => compareRoutingKeys(-Infinity, -Infinity), MISMATCH_PATTERN);
  assert.throws(() => compareRoutingKeys(true, true), MISMATCH_PATTERN);
  assert.throws(() => compareRoutingKeys(false, false), MISMATCH_PATTERN);
  assert.throws(() => compareRoutingKeys({}, {}), MISMATCH_PATTERN);
  assert.throws(() => compareRoutingKeys(Symbol('k'), Symbol('k')), MISMATCH_PATTERN);
  assert.throws(() => compareRoutingKeys(NaN, null), MISMATCH_PATTERN);
  assert.throws(() => compareRoutingKeys(null, Infinity), MISMATCH_PATTERN);

  assert.equal(compareRoutingKeys(null, null), 0);
  assert.equal(compareRoutingKeys(undefined, undefined), 0);
  assert.equal(compareRoutingKeys(null, 100), -1);
  assert.equal(compareRoutingKeys(100, null), 1);
  assert.equal(compareRoutingKeys(undefined, 'abc'), -1);
  assert.equal(compareRoutingKeys('abc', undefined), 1);
  recordReceipt('unsupported-and-absent-key-validation', true);
});

// --- RECEIPT 4: merge-evaluation-partition-key-delegation ---
test('Receipt 4: merge-evaluation-partition-key-delegation delegates to compareRoutingKeys', () => {
  const dummy = Object.create(PartitionSplitMergeManagerCoreMethods.prototype);
  assert.equal(dummy.comparePartitionKeys(10, 20), -1);
  assert.equal(dummy.comparePartitionKeys(20, 10), 1);
  assert.equal(dummy.comparePartitionKeys('abc', 'def'), -1);
  assert.equal(dummy.comparePartitionKeys(null, 'def'), -1);
  assert.throws(() => dummy.comparePartitionKeys(10, 'abc'), MISMATCH_PATTERN);
  recordReceipt('merge-evaluation-partition-key-delegation', true);
});

// --- RECEIPT 5: typed-boundary-representation-and-bigint-precision ---
test('Receipt 5: typed-boundary-representation-and-bigint-precision preserves 64-bit BigInt precision', () => {
  assert.equal(PARTITION_BOUNDARY_KEY_TYPE.INTEGER, 'INTEGER');
  assert.equal(PARTITION_BOUNDARY_KEY_TYPE.REAL, 'REAL');
  assert.equal(PARTITION_BOUNDARY_KEY_TYPE.TEXT, 'TEXT');
  assert.equal(PARTITION_BOUNDARY_KEY_TYPE.BLOB, 'BLOB');
  assert.equal(PARTITION_BOUNDARY_KEY_TYPE.COMPOSITE, 'COMPOSITE');

  const largeIntStr = '9007199254740993';
  const decoded = decodePartitionBoundaryValue(largeIntStr, 'INTEGER');
  assert.equal(decoded, 9007199254740993n);
  assert.equal(typeof decoded, 'bigint');

  assert.equal(
    compareRoutingKeys(9007199254740993n, 9007199254740994n),
    -1,
  );
  assert.equal(
    compareRoutingKeys(9007199254740993n, 9007199254740993n),
    0,
  );
  recordReceipt('typed-boundary-representation-and-bigint-precision', true);
});

// --- RECEIPT 6: no-legacy-boundary-or-text-number-fallback ---
test('Receipt 6: no-legacy-boundary-or-text-number-fallback fails closed on absent type authority', () => {
  assert.throws(
    () => compareRoutingKeys(100, '100'),
    MISMATCH_PATTERN,
    'number vs text-encoded number must not coerce',
  );
  assert.throws(
    () => compareSplitKey(100, '100'),
    MISMATCH_PATTERN,
    'split key must not coerce',
  );

  const resolver = new PartitionResolver();
  const untypedBoundedPartitions = [
    {partition_id: 'p1', partition_key_start: null, partition_key_end: '500'},
    {partition_id: 'p2', partition_key_start: '500', partition_key_end: null},
  ];
  assert.throws(
    () => resolver.resolvePartitionForKey(TABLE, 250, untypedBoundedPartitions),
    /Partition boundary type authority is missing; revalidation required/u,
  );
  recordReceipt('no-legacy-boundary-or-text-number-fallback', true);
});

// --- RECEIPT 7: declared-primary-key-resolution-no-id-fallback ---
test('Receipt 7: declared-primary-key-resolution-no-id-fallback has zero id fallback', () => {
  assert.deepEqual(resolveDeclaredPrimaryKeyColumns({}), []);
  assert.deepEqual(resolveDeclaredPrimaryKeyColumns(null), []);

  const resolver = new PartitionResolver();
  assert.deepEqual(resolver.resolvePrimaryKeyColumns({}), []);

  const partitions = [
    {partition_id: 'p1', partition_key_start: null, partition_key_end: null},
    {partition_id: 'p2', partition_key_start: null, partition_key_end: null},
  ];
  // When no primary key metadata is declared, resolver safely scatters to all partitions
  const resolved = resolver.resolvePartitions(
    TABLE,
    {type: 'binary_expr', operator: '=', left: {type: 'column_ref', name: 'id'}, right: {type: 'number', value: 1}},
    partitions,
  );
  assert.deepEqual(resolved, ['p1', 'p2']);

  const coordinator = new DistributedWriteCoordinator({
    systemCache: {
      get: () => ({}),
      filter: () => partitions,
    },
    partitionResolver: resolver,
  });
  assert.deepEqual(coordinator.resolvePrimaryKeyColumns({}), []);
  recordReceipt('declared-primary-key-resolution-no-id-fallback', true);
});

// --- RECEIPT 8: compound-primary-key-routing-and-predicate-intersection ---
test('Receipt 8: compound-primary-key-routing-and-predicate-intersection routes tuples and intersects bounds', () => {
  assert.equal(compareRoutingKeys([1, 'a'], [1, 'b']), -1);
  assert.equal(compareRoutingKeys([1, 'b'], [1, 'a']), 1);
  assert.equal(compareRoutingKeys([1, 'a'], [1, 'a']), 0);
  assert.equal(compareRoutingKeys([1], [1, 2]), -1);
  assert.equal(compareRoutingKeys([1, 2], [1]), 1);

  const resolver = new PartitionResolver();
  const compositePartitions = [
    {
      partition_id: 'p1',
      partition_key_start: null,
      partition_key_end: [10, 'm'],
      partition_key_type: 'COMPOSITE',
    },
    {
      partition_id: 'p2',
      partition_key_start: [10, 'm'],
      partition_key_end: null,
      partition_key_type: 'COMPOSITE',
    },
  ];

  // Route composite key tuple directly
  assert.equal(
    resolver.resolvePartitionForKey(TABLE, [5, 'a'], compositePartitions),
    'p1',
  );
  assert.equal(
    resolver.resolvePartitionForKey(TABLE, [15, 'z'], compositePartitions),
    'p2',
  );

  const tablePartitions = [
    {
      partition_id: 'p1',
      partition_key_start: null,
      partition_key_end: 10,
      partition_key_type: 'INTEGER',
    },
    {
      partition_id: 'p2',
      partition_key_start: 10,
      partition_key_end: 20,
      partition_key_type: 'INTEGER',
    },
    {
      partition_id: 'p3',
      partition_key_start: 20,
      partition_key_end: null,
      partition_key_type: 'INTEGER',
    },
  ];

  // Contradiction detection in binary AND conjunction: id = 1 AND id = 2 -> 0 partitions
  const contradictoryEqAst = {
    type: 'binary_expr',
    operator: 'AND',
    left: {
      type: 'binary_expr',
      operator: '=',
      left: {type: 'column_ref', name: 'id'},
      right: {type: 'number', value: 1},
    },
    right: {
      type: 'binary_expr',
      operator: '=',
      left: {type: 'column_ref', name: 'id'},
      right: {type: 'number', value: 2},
    },
  };
  const contradictoryResult = resolver.resolvePartitions(
    TABLE,
    contradictoryEqAst,
    tablePartitions,
    {keyColumns: ['id']},
  );
  assert.deepEqual(contradictoryResult, []);

  // Contradiction detection in range AND: id > 15 AND id < 10 -> 0 partitions
  const contradictoryRangeAst = {
    type: 'binary_expr',
    operator: 'AND',
    left: {
      type: 'binary_expr',
      operator: '>',
      left: {type: 'column_ref', name: 'id'},
      right: {type: 'number', value: 15},
    },
    right: {
      type: 'binary_expr',
      operator: '<',
      left: {type: 'column_ref', name: 'id'},
      right: {type: 'number', value: 10},
    },
  };
  assert.deepEqual(
    resolver.resolvePartitions(
      TABLE,
      contradictoryRangeAst,
      tablePartitions,
      {keyColumns: ['id']},
    ),
    [],
  );

  // Range bound intersection: id > 5 AND id > 12 -> narrows low to 12 -> routes to p2, p3
  const rangeIntersectionAst = {
    type: 'binary_expr',
    operator: 'AND',
    left: {
      type: 'binary_expr',
      operator: '>',
      left: {type: 'column_ref', name: 'id'},
      right: {type: 'number', value: 5},
    },
    right: {
      type: 'binary_expr',
      operator: '>',
      left: {type: 'column_ref', name: 'id'},
      right: {type: 'number', value: 12},
    },
  };
  assert.deepEqual(
    resolver.resolvePartitions(
      TABLE,
      rangeIntersectionAst,
      tablePartitions,
      {keyColumns: ['id']},
    ),
    ['p2', 'p3'],
  );

  // NOT IN scatters safely to all partitions
  const notInAst = {
    type: 'in_expr',
    not: true,
    expression: {type: 'column_ref', name: 'id'},
    values: [{type: 'number', value: 1}, {type: 'number', value: 2}],
  };
  assert.deepEqual(
    resolver.resolvePartitions(
      TABLE,
      notInAst,
      tablePartitions,
      {keyColumns: ['id']},
    ),
    ['p1', 'p2', 'p3'],
  );

  recordReceipt('compound-primary-key-routing-and-predicate-intersection', true);
});
