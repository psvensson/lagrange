/**
 * Unit tests verifying the exchange manager provides no
 * global ordering guarantee across partition buffers.
 *
 * Requirements: 7.4
 */
// @ts-nocheck

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  ExchangeManager,
} from '../../src/query/distributed/exchange-manager.js';
import {
  EXCHANGE_MODE,
  EXCHANGE_FIELD,
  EXCHANGE_NO_ORDERING_GUARANTEE,
} from '../../src/query/runtime-constants.js';

describe('Exchange no-global-ordering guarantee', () => {
  it('should export the no-ordering guarantee constant',
    () => {
      assert.equal(
        typeof EXCHANGE_NO_ORDERING_GUARANTEE, 'string',
      );
      assert.ok(EXCHANGE_NO_ORDERING_GUARANTEE.length > 0);
    });

  it('records emitted to different partitions can be ' +
    'consumed in any order', () => {
    // Use a small partition count so keys land in
    // different buckets.
    const partitionCount = 4;
    const mgr = new ExchangeManager({
      mode: EXCHANGE_MODE.KEY,
      partitionCount,
    });

    // Emit several keys that hash to different partitions.
    const keys = ['alpha', 'beta', 'gamma', 'delta',
      'epsilon', 'zeta', 'eta', 'theta'];
    for (let i = 0; i < keys.length; i++) {
      mgr.route(keys[i], i);
    }

    const bufs = mgr.getPartitionBuffers();

    // At least two distinct partitions must be populated
    // for the test to be meaningful.
    assert.ok(
      bufs.size >= 2,
      'Need records in at least 2 partitions to verify ' +
      'cross-partition ordering is not guaranteed',
    );

    // Collect all records by iterating partitions in an
    // arbitrary order (Map iteration order is insertion
    // order, but consumers may read partitions in any
    // sequence). Verify that the concatenated sequence
    // does NOT have to match the original emission order.
    const consumedKeys = [];
    for (const entries of bufs.values()) {
      for (const entry of entries) {
        consumedKeys.push(entry[EXCHANGE_FIELD.KEY]);
      }
    }

    // All emitted records must be present (completeness).
    assert.equal(consumedKeys.length, keys.length);

    // The consumed order is NOT required to match the
    // emission order — this is the no-ordering guarantee.
    // We verify that the system does not enforce ordering
    // by checking that records are spread across multiple
    // independent partition buffers, each of which can be
    // consumed independently.
    const partitionIndices = new Set();
    for (const entries of bufs.values()) {
      for (const entry of entries) {
        partitionIndices.add(
          entry[EXCHANGE_FIELD.PARTITION_INDEX],
        );
      }
    }
    assert.ok(
      partitionIndices.size >= 2,
      'Records must span multiple partitions, proving ' +
      'no single global order exists',
    );
  });

  it('within a single partition buffer, insertion order ' +
    'is preserved', () => {
    const partitionCount = 4;
    const mgr = new ExchangeManager({
      mode: EXCHANGE_MODE.KEY,
      partitionCount,
    });

    // Emit the same key multiple times so all entries
    // land in the same partition buffer.
    const key = 'same-key';
    const values = [10, 20, 30, 40, 50];
    for (const v of values) {
      mgr.route(key, v);
    }

    const bufs = mgr.getPartitionBuffers();
    // Exactly one partition should have all entries.
    let found = false;
    for (const entries of bufs.values()) {
      if (entries.length === values.length) {
        for (let i = 0; i < values.length; i++) {
          assert.equal(
            entries[i][EXCHANGE_FIELD.VALUE], values[i],
          );
        }
        found = true;
      }
    }
    assert.ok(
      found,
      'All entries for the same key should be in one ' +
      'buffer in insertion order',
    );
  });

  it('partition buffers are independent collections ' +
    'with no cross-buffer ordering', () => {
    const partitionCount = 2;
    const mgr = new ExchangeManager({
      mode: EXCHANGE_MODE.KEY,
      partitionCount,
    });

    // Emit enough distinct keys to populate both
    // partitions.
    const emitted = [];
    for (let i = 0; i < 20; i++) {
      const key = `key-${i}`;
      mgr.route(key, i);
      emitted.push(key);
    }

    const bufs = mgr.getPartitionBuffers();
    assert.equal(bufs.size, 2,
      'With 20 distinct keys and 2 partitions, both ' +
      'should be populated');

    // Each buffer is an independent array — there is no
    // interleaving or global sequence number linking them.
    // Verify each buffer only contains entries assigned
    // to its own partition index.
    for (const [idx, entries] of bufs) {
      for (const entry of entries) {
        assert.equal(
          entry[EXCHANGE_FIELD.PARTITION_INDEX], idx,
          'Entry partition index must match buffer key',
        );
      }
    }
  });
});
