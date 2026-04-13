/**
 * Property Test: Proposal Queue Capacity Enforcement
 * **Property 5: Proposal queue capacity enforcement**
 * **Validates: Requirements 3.2, 3.3**
 *
 * *For any* sequence of write proposals, the ProposalQueue SHALL accept
 * proposals when its size is below maxCapacity and reject proposals with
 * a backpressure error when its size equals maxCapacity.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {ProposalQueue} from '../../src/partition/proposal-queue.js';
import {
  PROPOSAL_QUEUE_ERROR_MSG,
} from '../../src/partition/proposal-queue-constants.js';

test('Property 5: Proposal queue capacity enforcement', async (t) => {
  /**
   * Property: For any maxCapacity and sequence of proposals up to that
   * capacity, all enqueues succeed. The next enqueue beyond capacity
   * throws a backpressure error.
   */
  t.test('accepts below capacity, rejects at capacity', async (t) => {
    await fc.assert(
      fc.property(
        fc.integer({min: 1, max: 20}), // maxCapacity
        fc.integer({min: 0, max: 20}), // number of proposals to attempt
        (maxCapacity, proposalCount) => {
          const queue = new ProposalQueue({maxCapacity});

          for (let i = 0; i < proposalCount; i++) {
            const entryId = `entry-${i}`;
            const entry = {resolve: () => {}, reject: () => {}};

            if (i < maxCapacity) {
              // Below capacity: enqueue must succeed
              queue.enqueue(entryId, entry);
              if (queue.size !== i + 1) {
                return false;
              }
            } else {
              // At or beyond capacity: enqueue must throw backpressure
              let threw = false;
              let errorMsg = '';
              try {
                queue.enqueue(entryId, entry);
              } catch (err) {
                threw = true;
                errorMsg = err.message;
              }
              if (!threw) {
                return false;
              }
              if (errorMsg !== PROPOSAL_QUEUE_ERROR_MSG.BACKPRESSURE) {
                return false;
              }
              // Size must remain at maxCapacity
              if (queue.size !== maxCapacity) {
                return false;
              }
            }
          }
          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('accepts below capacity, rejects at capacity');
  });

  /**
   * Property: For any capacity and sequence of enqueue-then-resolve
   * operations, resolving an entry frees capacity so a new enqueue
   * succeeds.
   */
  t.test('capacity freed after resolve allows new enqueue', async (t) => {
    await fc.assert(
      fc.property(
        fc.integer({min: 1, max: 15}), // maxCapacity
        fc.integer({min: 1, max: 10}), // extra proposals after freeing
        (maxCapacity, extraCount) => {
          const queue = new ProposalQueue({maxCapacity});

          // Fill the queue to capacity
          for (let i = 0; i < maxCapacity; i++) {
            queue.enqueue(`fill-${i}`, {
              resolve: () => {},
              reject: () => {},
            });
          }

          if (!queue.isFull) {
            return false;
          }

          // Resolve entries and enqueue new ones
          for (let i = 0; i < extraCount; i++) {
            // Resolve one entry to free capacity
            const resolveId = `fill-${i % maxCapacity}`;
            if (queue.has(resolveId)) {
              queue.resolve(resolveId, {});
            }

            // Now enqueue should succeed since we freed a slot
            if (queue.size < maxCapacity) {
              const newId = `new-${i}`;
              queue.enqueue(newId, {
                resolve: () => {},
                reject: () => {},
              });
            }
          }

          // Size must never exceed maxCapacity
          return queue.size <= maxCapacity;
        },
      ),
      {numRuns: 10},
    );

    t.pass('capacity freed after resolve allows new enqueue');
  });

  /**
   * Property: For any capacity and sequence of enqueue-then-reject
   * operations, rejecting an entry frees capacity so a new enqueue
   * succeeds.
   */
  t.test('capacity freed after reject allows new enqueue', async (t) => {
    await fc.assert(
      fc.property(
        fc.integer({min: 1, max: 15}), // maxCapacity
        fc.integer({min: 1, max: 10}), // extra proposals after freeing
        (maxCapacity, extraCount) => {
          const queue = new ProposalQueue({maxCapacity});

          // Fill the queue to capacity
          for (let i = 0; i < maxCapacity; i++) {
            queue.enqueue(`fill-${i}`, {
              resolve: () => {},
              reject: () => {},
            });
          }

          if (!queue.isFull) {
            return false;
          }

          // Reject entries and enqueue new ones
          for (let i = 0; i < extraCount; i++) {
            const rejectId = `fill-${i % maxCapacity}`;
            if (queue.has(rejectId)) {
              queue.reject(rejectId, 'test rejection');
            }

            if (queue.size < maxCapacity) {
              const newId = `new-${i}`;
              queue.enqueue(newId, {
                resolve: () => {},
                reject: () => {},
              });
            }
          }

          // Size must never exceed maxCapacity
          return queue.size <= maxCapacity;
        },
      ),
      {numRuns: 10},
    );

    t.pass('capacity freed after reject allows new enqueue');
  });
});
