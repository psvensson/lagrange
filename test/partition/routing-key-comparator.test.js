/**
 * Numeric key routing: an integer key against a text boundary routes by
 * number, one comparator owns routing order everywhere, and mixed key spaces
 * are refused with the typed outcome instead of coerced.
 *
 * Why a text boundary: the partitions system table declares
 * partition_key_start/end as TEXT, so a split's numeric median comes back as
 * '500' after any round trip through the table, while the routed key is the
 * JavaScript number the SQL AST carries. Before this quest both comparators
 * fell through to String(a).localeCompare(String(b)), so 1000 sorted left of
 * '500' and high integer keys were silently mis-routed.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KeyRange} from '../../src/partition/key-range-manager.js';
import {PartitionResolver} from '../../src/query/partition-resolver.js';
import {QueryGroup} from '../../src/live-query/live-query-group.js';
import {
  compareRoutingKeys,
} from '../../src/partition/split-key-comparator.js';

const TABLE = 'items';
const TEXT_BOUNDARY = '500';
// better-sqlite3 binds every JavaScript number as REAL, so the TEXT column
// hands the boundary back in this shape after a parameter-bound write.
const STORED_TEXT_BOUNDARY = '500.0';
const LEFT_KEY = 250;
const RIGHT_KEY = 1000;
const NON_NUMERIC_TEXT = 'abc';
const MISMATCH_PATTERN = /type mismatch|mixed|mismatch/iu;

function splitPartitions(boundary = TEXT_BOUNDARY) {
  return [
    {partition_id: 'p1', partition_key_start: null, partition_key_end: boundary},
    {partition_id: 'p2', partition_key_start: boundary, partition_key_end: null},
  ];
}

test('an integer key routes numerically against a text boundary', async () => {
  const resolver = new PartitionResolver();
  assert.equal(resolver.resolvePartitionForKey(TABLE, LEFT_KEY, splitPartitions()),
    'p1', '250 sorts left of the boundary 500');
  assert.equal(resolver.resolvePartitionForKey(TABLE, RIGHT_KEY, splitPartitions()),
    'p2', '1000 sorts right of the boundary 500, not left of "5"');
  for (const boundary of [TEXT_BOUNDARY, STORED_TEXT_BOUNDARY]) {
    assert.equal(resolver.resolvePartitionForKey(TABLE, RIGHT_KEY,
      splitPartitions(boundary)), 'p2', `1000 sorts right of '${boundary}'`);
    assert.equal(resolver.resolvePartitionForKey(TABLE, LEFT_KEY,
      splitPartitions(boundary)), 'p1', `250 sorts left of '${boundary}'`);
  }
  const right = new KeyRange(TEXT_BOUNDARY, null);
  assert.equal(right.contains(RIGHT_KEY), true, 'the right range contains 1000');
  assert.equal(right.contains(LEFT_KEY), false, 'the right range excludes 250');
});

test('one comparator owns routing order for ranges, the resolver and live queries', async () => {
  const range = new KeyRange(null, null);
  const resolver = new PartitionResolver();
  const group = new QueryGroup({});
  const pairs = [
    [RIGHT_KEY, TEXT_BOUNDARY],
    ['b', 'a'],
    [7, 9],
    [null, 'a'],
  ];
  for (const [left, right] of pairs) {
    const expected = Math.sign(compareRoutingKeys(left, right));
    assert.equal(Math.sign(range.compareKeys(left, right)), expected,
      `KeyRange agrees with the owner on ${String(left)} vs ${String(right)}`);
    assert.equal(Math.sign(resolver.compareValues(left, right)), expected,
      `PartitionResolver agrees with the owner on ${String(left)} vs ${String(right)}`);
    assert.equal(Math.sign(group.compareValues(left, right)), expected,
      `QueryGroup agrees with the owner on ${String(left)} vs ${String(right)}`);
  }
});

test('a mixed key space that is not a text-encoded number is refused, never coerced', async () => {
  assert.throws(() => compareRoutingKeys(RIGHT_KEY, NON_NUMERIC_TEXT), MISMATCH_PATTERN,
    'the owner refuses number vs non-numeric text');
  assert.throws(() => new KeyRange(NON_NUMERIC_TEXT, null).contains(RIGHT_KEY),
    MISMATCH_PATTERN, 'KeyRange surfaces the same typed outcome');
  assert.throws(() => new PartitionResolver().compareValues(RIGHT_KEY, NON_NUMERIC_TEXT),
    MISMATCH_PATTERN, 'PartitionResolver surfaces the same typed outcome');
});
