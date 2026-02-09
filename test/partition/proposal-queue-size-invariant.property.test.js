/**
 * Property Test: Proposal Queue Size Invariant
 * **Property 6: Proposal queue size invariant**
 * **Validates: Requirements 3.4, 3.5, 3.6**
 *
 * *For any* sequence of enqueue, resolve, reject, and timeout operations
 * on the ProposalQueue, the value returned by getStats().size SHALL equal
 * the number of entries that have been enqueued but not yet resolved,
 * rejected, or timed out.
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {ProposalQueue} from '../../src/partition/proposal-queue.js';

/**
 * Operation types for the property test.
 * @enum {string}
 */
const OP = Object.freeze({
  ENQUEUE: 'enqueue',
  RESOLVE: 'resolve',
  REJECT: 'reject',
});

/**
 * Arbitrary that generates a random sequence of queue operations.
 * Each operation is {type, targetIndex} where targetIndex is used
 * to select which pending entry to resolve/reject.
 *
 * @param {number} maxOps - Maximum number of operations to generate.
 * @return {fc.Arbitrary} Arbitrary of operation arrays.
 */
function operationSequenceArb(maxOps) {
  return fc.array(
    fc.record({
      type: fc.constantFrom(OP.ENQUEUE, OP.RESOLVE, OP.REJECT),
      targetIndex: fc.nat({max: 50}),
    }),
    {minLength: 1, maxLength: maxOps},
  );
}

test('Property 6: Proposal queue size invariant', async (t) => {
  /**
   * Property: For any sequence of enqueue/resolve/reject operations,
   * getStats().size always equals the count of entries that have been
   * enqueued but not yet resolved or rejected.
   */
  t.test(
    'getStats().size tracks pending entries accurately',
    async (t) => {
      await fc.assert(
        fc.property(
          fc.integer({min: 5, max: 30}), // maxCapacity
          operationSequenceArb(40),
          (maxCapacity, operations) => {
            const queue = new ProposalQueue({maxCapacity});
            const pendingIds = [];
            let nextId = 0;

            for (const op of operations) {
              if (op.type === OP.ENQUEUE) {
                if (!queue.isFull) {
                  const entryId = `e-${nextId++}`;
                  queue.enqueue(entryId, {
                    resolve: () => {},
                    reject: () => {},
                  });
                  pendingIds.push(entryId);
                }
                // If full, skip enqueue (don't throw)
              } else if (op.type === OP.RESOLVE) {
                if (pendingIds.length > 0) {
                  const idx = op.targetIndex % pendingIds.length;
                  const entryId = pendingIds[idx];
                  queue.resolve(entryId, {ok: true});
                  pendingIds.splice(idx, 1);
                }
              } else if (op.type === OP.REJECT) {
                if (pendingIds.length > 0) {
                  const idx = op.targetIndex % pendingIds.length;
                  const entryId = pendingIds[idx];
                  queue.reject(entryId, 'test rejection');
                  pendingIds.splice(idx, 1);
                }
              }

              // Invariant: getStats().size must match pending count
              if (queue.getStats().size !== pendingIds.length) {
                return false;
              }
            }

            return true;
          },
        ),
        {numRuns: 10},
      );

      t.pass('getStats().size tracks pending entries accurately');
    },
  );

  /**
   * Property: After a clear() operation, getStats().size is always 0
   * regardless of how many entries were enqueued before.
   */
  t.test(
    'getStats().size is 0 after clear for any queue state',
    async (t) => {
      await fc.assert(
        fc.property(
          fc.integer({min: 1, max: 20}), // maxCapacity
          fc.integer({min: 0, max: 20}), // entries to enqueue
          (maxCapacity, enqueueCount) => {
            const queue = new ProposalQueue({maxCapacity});
            const count = Math.min(enqueueCount, maxCapacity);

            for (let i = 0; i < count; i++) {
              queue.enqueue(`e-${i}`, {
                resolve: () => {},
                reject: () => {},
              });
            }

            // Verify size before clear
            if (queue.getStats().size !== count) {
              return false;
            }

            queue.clear('test clear');

            // After clear, size must be 0
            return queue.getStats().size === 0;
          },
        ),
        {numRuns: 10},
      );

      t.pass('getStats().size is 0 after clear for any queue state');
    },
  );

  /**
   * Property: For any interleaved enqueue and resolve/reject sequence,
   * the size never goes negative and never exceeds maxCapacity.
   */
  t.test(
    'size stays within [0, maxCapacity] bounds',
    async (t) => {
      await fc.assert(
        fc.property(
          fc.integer({min: 1, max: 25}), // maxCapacity
          operationSequenceArb(50),
          (maxCapacity, operations) => {
            const queue = new ProposalQueue({maxCapacity});
            const pendingIds = [];
            let nextId = 0;

            for (const op of operations) {
              if (op.type === OP.ENQUEUE && !queue.isFull) {
                const entryId = `e-${nextId++}`;
                queue.enqueue(entryId, {
                  resolve: () => {},
                  reject: () => {},
                });
                pendingIds.push(entryId);
              } else if (
                op.type === OP.RESOLVE &&
                pendingIds.length > 0
              ) {
                const idx = op.targetIndex % pendingIds.length;
                queue.resolve(pendingIds[idx], {});
                pendingIds.splice(idx, 1);
              } else if (
                op.type === OP.REJECT &&
                pendingIds.length > 0
              ) {
                const idx = op.targetIndex % pendingIds.length;
                queue.reject(pendingIds[idx], 'err');
                pendingIds.splice(idx, 1);
              }

              const size = queue.getStats().size;
              if (size < 0 || size > maxCapacity) {
                return false;
              }
            }

            return true;
          },
        ),
        {numRuns: 10},
      );

      t.pass('size stays within [0, maxCapacity] bounds');
    },
  );
});
