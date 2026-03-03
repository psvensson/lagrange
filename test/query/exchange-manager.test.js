/**
 * Unit tests for ExchangeManager.
 *
 * Requirements: 7.2, 7.3
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  ExchangeManager,
  hashKey,
} from '../../src/query/distributed/exchange-manager.js';
import {
  EXCHANGE_MODE,
  EXCHANGE_ERROR_MSG,
  EXCHANGE_FIELD,
  DEFAULT_EXCHANGE_PARTITION_COUNT,
} from '../../src/query/runtime-constants.js';

describe('ExchangeManager', () => {
  describe('LOCAL mode', () => {
    it('should buffer entries locally', () => {
      const mgr = new ExchangeManager({
        mode: EXCHANGE_MODE.LOCAL,
      });
      mgr.route('k1', 'v1');
      mgr.route('k2', 'v2');
      const buf = mgr.getLocalBuffer();
      assert.equal(buf.length, 2);
      assert.equal(buf[0][EXCHANGE_FIELD.KEY], 'k1');
      assert.equal(buf[0][EXCHANGE_FIELD.VALUE], 'v1');
      assert.equal(buf[1][EXCHANGE_FIELD.KEY], 'k2');
      assert.equal(buf[1][EXCHANGE_FIELD.VALUE], 'v2');
    });

    it('should not populate partition buffers', () => {
      const mgr = new ExchangeManager({
        mode: EXCHANGE_MODE.LOCAL,
      });
      mgr.route('k1', 'v1');
      assert.equal(mgr.getPartitionBuffers().size, 0);
    });

    it('should include meta when provided', () => {
      const mgr = new ExchangeManager({
        mode: EXCHANGE_MODE.LOCAL,
      });
      mgr.route('k1', 'v1', {dedupeKey: 'd1'});
      const entry = mgr.getLocalBuffer()[0];
      assert.equal(entry[EXCHANGE_FIELD.META].dedupeKey, 'd1');
    });

    it('should omit meta field when not provided', () => {
      const mgr = new ExchangeManager({
        mode: EXCHANGE_MODE.LOCAL,
      });
      mgr.route('k1', 'v1');
      const entry = mgr.getLocalBuffer()[0];
      assert.equal(
        Object.hasOwn(entry, EXCHANGE_FIELD.META), false,
      );
    });
  });

  describe('KEY mode', () => {
    it('should route entries to partition buffers', () => {
      const mgr = new ExchangeManager({
        mode: EXCHANGE_MODE.KEY,
        partitionCount: 4,
      });
      mgr.route('k1', 'v1');
      const bufs = mgr.getPartitionBuffers();
      assert.ok(bufs.size > 0);
      let total = 0;
      for (const entries of bufs.values()) {
        total += entries.length;
      }
      assert.equal(total, 1);
    });

    it('should not populate local buffer', () => {
      const mgr = new ExchangeManager({
        mode: EXCHANGE_MODE.KEY,
      });
      mgr.route('k1', 'v1');
      assert.equal(mgr.getLocalBuffer().length, 0);
    });

    it('should route same key to same partition', () => {
      const mgr = new ExchangeManager({
        mode: EXCHANGE_MODE.KEY,
        partitionCount: 8,
      });
      mgr.route('stable-key', 'v1');
      mgr.route('stable-key', 'v2');
      const bufs = mgr.getPartitionBuffers();
      // Both entries must be in the same partition buffer
      let found = false;
      for (const entries of bufs.values()) {
        if (entries.length === 2) {
          assert.equal(
            entries[0][EXCHANGE_FIELD.KEY], 'stable-key',
          );
          assert.equal(
            entries[1][EXCHANGE_FIELD.KEY], 'stable-key',
          );
          found = true;
        }
      }
      assert.ok(found, 'Both entries should be in one buffer');
    });

    it('should attach partitionIndex to entries', () => {
      const mgr = new ExchangeManager({
        mode: EXCHANGE_MODE.KEY,
        partitionCount: 4,
      });
      mgr.route('k1', 'v1');
      const bufs = mgr.getPartitionBuffers();
      for (const [idx, entries] of bufs) {
        for (const entry of entries) {
          assert.equal(
            entry[EXCHANGE_FIELD.PARTITION_INDEX], idx,
          );
        }
      }
    });

    it('should accept duplicate emits (at-least-once)',
      () => {
        const mgr = new ExchangeManager({
          mode: EXCHANGE_MODE.KEY,
          partitionCount: 4,
        });
        mgr.route('k1', 'v1');
        mgr.route('k1', 'v1');
        mgr.route('k1', 'v1');
        let total = 0;
        for (const entries of mgr.getPartitionBuffers()
          .values()) {
          total += entries.length;
        }
        assert.equal(total, 3);
      });

    it('should use default partition count', () => {
      const mgr = new ExchangeManager({
        mode: EXCHANGE_MODE.KEY,
      });
      assert.equal(
        mgr.getPartitionCount(),
        DEFAULT_EXCHANGE_PARTITION_COUNT,
      );
    });
  });

  describe('key validation', () => {
    it('should reject non-string key', () => {
      const mgr = new ExchangeManager();
      assert.throws(
        () => mgr.route(42, 'v'),
        (err) => err.message ===
          EXCHANGE_ERROR_MSG.EMIT_KEY_REQUIRED,
      );
    });

    it('should reject null key', () => {
      const mgr = new ExchangeManager();
      assert.throws(
        () => mgr.route(null, 'v'),
        (err) => err.message ===
          EXCHANGE_ERROR_MSG.EMIT_KEY_REQUIRED,
      );
    });

    it('should reject undefined key', () => {
      const mgr = new ExchangeManager();
      assert.throws(
        () => mgr.route(undefined, 'v'),
        (err) => err.message ===
          EXCHANGE_ERROR_MSG.EMIT_KEY_REQUIRED,
      );
    });
  });

  describe('close', () => {
    it('should reject routing after close', () => {
      const mgr = new ExchangeManager();
      mgr.close();
      assert.throws(
        () => mgr.route('k', 'v'),
        (err) => err.message ===
          EXCHANGE_ERROR_MSG.EXCHANGE_CLOSED,
      );
    });

    it('should report closed state', () => {
      const mgr = new ExchangeManager();
      assert.equal(mgr.isClosed(), false);
      mgr.close();
      assert.equal(mgr.isClosed(), true);
    });
  });

  describe('flush', () => {
    it('should clear local buffer', () => {
      const mgr = new ExchangeManager({
        mode: EXCHANGE_MODE.LOCAL,
      });
      mgr.route('k1', 'v1');
      mgr.flush();
      assert.equal(mgr.getLocalBuffer().length, 0);
    });

    it('should clear partition buffers', () => {
      const mgr = new ExchangeManager({
        mode: EXCHANGE_MODE.KEY,
      });
      mgr.route('k1', 'v1');
      mgr.flush();
      assert.equal(mgr.getPartitionBuffers().size, 0);
    });
  });

  describe('hashKey', () => {
    it('should return a non-negative integer', () => {
      const h = hashKey('test');
      assert.ok(h >= 0);
      assert.equal(h, Math.floor(h));
    });

    it('should be deterministic', () => {
      assert.equal(hashKey('abc'), hashKey('abc'));
    });
  });

  describe('property: same key always routes to same ' +
    'partition', () => {
    /**
     * **Validates: Requirements 7.2**
     *
     * For any string key and any partition count, the same
     * key always routes to the same partition index.
     */
    it('key routing is deterministic', () => {
      fc.assert(
        fc.property(
          fc.string({minLength: 1}),
          fc.integer({min: 1, max: 64}),
          (key, partitionCount) => {
            const mgr1 = new ExchangeManager({
              mode: EXCHANGE_MODE.KEY,
              partitionCount,
            });
            const mgr2 = new ExchangeManager({
              mode: EXCHANGE_MODE.KEY,
              partitionCount,
            });
            mgr1.route(key, 'v');
            mgr2.route(key, 'v');
            const idx1 = [...mgr1.getPartitionBuffers()
              .keys()][0];
            const idx2 = [...mgr2.getPartitionBuffers()
              .keys()][0];
            return idx1 === idx2;
          },
        ),
        {numRuns: 10},
      );
    });
  });

  describe('property: partition index is within bounds',
    () => {
      /**
       * **Validates: Requirements 7.2**
       *
       * For any key and partition count, the assigned
       * partition index is in [0, partitionCount).
       */
      it('partition index stays in range', () => {
        fc.assert(
          fc.property(
            fc.string({minLength: 1}),
            fc.integer({min: 1, max: 128}),
            (key, partitionCount) => {
              const mgr = new ExchangeManager({
                mode: EXCHANGE_MODE.KEY,
                partitionCount,
              });
              mgr.route(key, 'v');
              for (const idx of mgr.getPartitionBuffers()
                .keys()) {
                if (idx < 0 || idx >= partitionCount) {
                  return false;
                }
              }
              return true;
            },
          ),
          {numRuns: 10},
        );
      });
    });
});
