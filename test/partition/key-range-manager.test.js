/**
 * Unit tests for KeyRangeManager.
 * Tests partition key range management.
 * Requirements: 20.3, 20.5, 20.9
 */

import {test, beforeEach, afterEach} from 'tap';
import {KeyRange, KeyRangeManager} from '../../src/partition/key-range-manager.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

// KeyRange tests
test('KeyRange - full range contains all keys', async (t) => {
  const range = KeyRange.fullRange();

  t.equal(range.contains('a'), true);
  t.equal(range.contains('z'), true);
  t.equal(range.contains(0), true);
  t.equal(range.contains(1000), true);
  t.equal(range.contains(null), true);
  t.equal(range.isFullRange(), true);
});

test('KeyRange - bounded range contains correct keys', async (t) => {
  const range = new KeyRange('b', 'f');

  t.equal(range.contains('a'), false);
  t.equal(range.contains('b'), true); // start is inclusive
  t.equal(range.contains('c'), true);
  t.equal(range.contains('e'), true);
  t.equal(range.contains('f'), false); // end is exclusive
  t.equal(range.contains('g'), false);
});

test('KeyRange - unbounded start', async (t) => {
  const range = new KeyRange(null, 'm');

  t.equal(range.contains('a'), true);
  t.equal(range.contains('l'), true);
  t.equal(range.contains('m'), false);
  t.equal(range.contains('z'), false);
});

test('KeyRange - unbounded end', async (t) => {
  const range = new KeyRange('m', null);

  t.equal(range.contains('a'), false);
  t.equal(range.contains('l'), false);
  t.equal(range.contains('m'), true);
  t.equal(range.contains('z'), true);
});

test('KeyRange - numeric keys', async (t) => {
  const range = new KeyRange(10, 20);

  t.equal(range.contains(5), false);
  t.equal(range.contains(10), true);
  t.equal(range.contains(15), true);
  t.equal(range.contains(20), false);
  t.equal(range.contains(25), false);
});

test('KeyRange - isAdjacentTo', async (t) => {
  const range1 = new KeyRange('a', 'm');
  const range2 = new KeyRange('m', 'z');
  const range3 = new KeyRange('n', 'z');

  t.equal(range1.isAdjacentTo(range2), true);
  t.equal(range1.isAdjacentTo(range3), false);
  t.equal(range2.isAdjacentTo(range1), false); // Order matters
});

test('KeyRange - overlaps', async (t) => {
  const range1 = new KeyRange('a', 'm');
  const range2 = new KeyRange('m', 'z');
  const range3 = new KeyRange('f', 'p');

  t.equal(range1.overlaps(range2), false); // Adjacent, not overlapping
  t.equal(range1.overlaps(range3), true);
  t.equal(range2.overlaps(range3), true);
});

test('KeyRange - clone and toObject', async (t) => {
  const range = new KeyRange('a', 'z');
  const cloned = range.clone();
  const obj = range.toObject();

  t.equal(cloned.start, 'a');
  t.equal(cloned.end, 'z');
  t.same(obj, {start: 'a', end: 'z'});

  const fromObj = KeyRange.fromObject(obj);
  t.equal(fromObj.start, 'a');
  t.equal(fromObj.end, 'z');
});

// KeyRangeManager tests
test('KeyRangeManager - add and get partition', async (t) => {
  const manager = new KeyRangeManager('test-table');

  manager.addPartition('p1', new KeyRange(null, null));

  const range = manager.getRange('p1');
  t.ok(range);
  t.equal(range.start, null);
  t.equal(range.end, null);
});

test('KeyRangeManager - find partition for key', async (t) => {
  const manager = new KeyRangeManager('test-table');

  manager.addPartition('p1', new KeyRange(null, 'm'));
  manager.addPartition('p2', new KeyRange('m', null));

  t.equal(manager.findPartitionForKey('a'), 'p1');
  t.equal(manager.findPartitionForKey('l'), 'p1');
  t.equal(manager.findPartitionForKey('m'), 'p2');
  t.equal(manager.findPartitionForKey('z'), 'p2');
});

test('KeyRangeManager - detect overlapping ranges', async (t) => {
  const manager = new KeyRangeManager('test-table');

  manager.addPartition('p1', new KeyRange('a', 'm'));

  t.throws(() => {
    manager.addPartition('p2', new KeyRange('f', 'z')); // Overlaps with p1
  }, /overlap/i);
});

test('KeyRangeManager - validate contiguous ranges', async (t) => {
  const manager = new KeyRangeManager('test-table');

  manager.addPartition('p1', new KeyRange(null, 'm'));
  manager.addPartition('p2', new KeyRange('m', null));

  const result = manager.validateRanges();
  t.equal(result.valid, true);
  t.equal(result.errors.length, 0);
});

test('KeyRangeManager - detect gap in ranges', async (t) => {
  const manager = new KeyRangeManager('test-table');

  manager.addPartition('p1', new KeyRange(null, 'f'));
  manager.addPartition('p2', new KeyRange('m', null)); // Gap between f and m

  const result = manager.validateRanges();
  t.equal(result.valid, false);
  t.ok(result.errors.some((e) => e.includes('Gap')));
});

test('KeyRangeManager - split partition', async (t) => {
  const manager = new KeyRangeManager('test-table');

  manager.addPartition('p1', new KeyRange(null, null));

  const {left, right} = manager.splitPartition('p1', 'm', 'p1-left', 'p1-right');

  t.equal(left.start, null);
  t.equal(left.end, 'm');
  t.equal(right.start, 'm');
  t.equal(right.end, null);

  t.equal(manager.getRange('p1'), null); // Original removed
  t.ok(manager.getRange('p1-left'));
  t.ok(manager.getRange('p1-right'));

  // Validate ranges are still contiguous
  const result = manager.validateRanges();
  t.equal(result.valid, true);
});

test('KeyRangeManager - merge partitions', async (t) => {
  const manager = new KeyRangeManager('test-table');

  manager.addPartition('p1', new KeyRange(null, 'm'));
  manager.addPartition('p2', new KeyRange('m', null));

  const merged = manager.mergePartitions('p1', 'p2', 'p-merged');

  t.equal(merged.start, null);
  t.equal(merged.end, null);
  t.equal(merged.isFullRange(), true);

  t.equal(manager.getRange('p1'), null);
  t.equal(manager.getRange('p2'), null);
  t.ok(manager.getRange('p-merged'));
});

test('KeyRangeManager - cannot merge non-adjacent partitions', async (t) => {
  const manager = new KeyRangeManager('test-table');

  manager.addPartition('p1', new KeyRange(null, 'f'));
  manager.addPartition('p2', new KeyRange('f', 'm'));
  manager.addPartition('p3', new KeyRange('m', null));

  t.throws(() => {
    manager.mergePartitions('p1', 'p3', 'p-merged'); // Not adjacent
  }, /not adjacent/i);
});

test('KeyRangeManager - find partitions in range', async (t) => {
  const manager = new KeyRangeManager('test-table');

  manager.addPartition('p1', new KeyRange(null, 'f'));
  manager.addPartition('p2', new KeyRange('f', 'm'));
  manager.addPartition('p3', new KeyRange('m', null));

  const result1 = manager.findPartitionsInRange(new KeyRange('a', 'g'));
  t.same(result1.sort(), ['p1', 'p2'].sort());

  const result2 = manager.findPartitionsInRange(new KeyRange('g', 'z'));
  t.same(result2.sort(), ['p2', 'p3'].sort());

  const result3 = manager.findPartitionsInRange(KeyRange.fullRange());
  t.same(result3.sort(), ['p1', 'p2', 'p3'].sort());
});

test('KeyRangeManager - find adjacent partition', async (t) => {
  const manager = new KeyRangeManager('test-table');

  manager.addPartition('p1', new KeyRange(null, 'm'));
  manager.addPartition('p2', new KeyRange('m', null));

  t.equal(manager.findAdjacentPartition('p1'), 'p2');
  t.equal(manager.findAdjacentPartition('p2'), null); // No partition after p2
});

test('KeyRangeManager - getSortedPartitions', async (t) => {
  const manager = new KeyRangeManager('test-table');

  manager.addPartition('p3', new KeyRange('m', null));
  manager.addPartition('p1', new KeyRange(null, 'f'));
  manager.addPartition('p2', new KeyRange('f', 'm'));

  const sorted = manager.getSortedPartitions();

  t.equal(sorted[0].partitionId, 'p1');
  t.equal(sorted[1].partitionId, 'p2');
  t.equal(sorted[2].partitionId, 'p3');
});

test('KeyRangeManager - getPartitionCount', async (t) => {
  const manager = new KeyRangeManager('test-table');

  t.equal(manager.getPartitionCount(), 0);

  manager.addPartition('p1', new KeyRange(null, null));
  t.equal(manager.getPartitionCount(), 1);

  manager.splitPartition('p1', 'm', 'p1-left', 'p1-right');
  t.equal(manager.getPartitionCount(), 2);
});

test('KeyRangeManager - remove partition', async (t) => {
  const manager = new KeyRangeManager('test-table');

  manager.addPartition('p1', new KeyRange(null, null));
  t.equal(manager.getPartitionCount(), 1);

  manager.removePartition('p1');
  t.equal(manager.getPartitionCount(), 0);
  t.equal(manager.getRange('p1'), null);
});
