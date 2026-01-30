/**
 * Property-based test for Cache Epoch Rejection.
 * Feature: simplified-cluster-architecture, Property 13: Cache Rejects Old Epochs
 *
 * **Validates: Requirements 7.5**
 *
 * Property 13: Cache Rejects Old Epochs
 * For any epoch update where the incoming epoch number is less than or equal
 * to the current cached epoch, the update SHALL be rejected.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

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

/**
 * Generate a valid AssignmentEpoch object with a specific epoch number.
 */
const epochArbitrary = (epochNumber) => fc.record({
  epoch: fc.constant(epochNumber),
  assignments: fc.dictionary(
    fc.string({minLength: 1, maxLength: 20}),
    fc.array(fc.string({minLength: 1, maxLength: 10}), {minLength: 1, maxLength: 3}),
  ),
  timestamp: fc.date().map((d) => d.toISOString()),
  proposedBy: fc.string({minLength: 1, maxLength: 20}),
});

/**
 * Generate a valid AssignmentEpoch object with any epoch number.
 */
const anyEpochArbitrary = fc.nat({max: 1000}).chain((epochNum) => epochArbitrary(epochNum));

/**
 * Feature: simplified-cluster-architecture
 * Property 13: Cache Rejects Old Epochs
 *
 * For any epoch update where the incoming epoch number is less than or equal
 * to the current cached epoch, the update SHALL be rejected.
 */
test('Property 13: Cache rejects epochs with number <= current epoch', async (t) => {
  fc.assert(
    fc.property(
      fc.nat({max: 100}).filter((n) => n > 0), // Initial epoch (1-100)
      fc.nat({max: 100}), // Offset for incoming epoch (0-100)
      fc.boolean(), // Whether incoming should be less than or equal
      anyEpochArbitrary, // Template for epoch structure
      (initialEpoch, offset, shouldReject, epochTemplate) => {
        const cache = new SystemTableCache();

        // Set up initial epoch by applying a valid epoch first
        const setupEpoch = {
          ...epochTemplate,
          epoch: initialEpoch,
        };
        const setupResult = cache.updateFromEpoch(setupEpoch);

        // Setup should succeed (epoch > 0 which is initial cache epoch)
        if (!setupResult) {
          return false;
        }

        // Verify initial epoch was set
        if (cache.getEpoch() !== initialEpoch) {
          return false;
        }

        // Calculate incoming epoch based on whether it should be rejected
        let incomingEpochNum;
        if (shouldReject) {
          // Incoming epoch <= current epoch (should be rejected)
          // Use offset to determine how much less (0 means equal)
          incomingEpochNum = Math.max(0, initialEpoch - offset);
        } else {
          // Incoming epoch > current epoch (should be accepted)
          incomingEpochNum = initialEpoch + offset + 1;
        }

        const incomingEpoch = {
          ...epochTemplate,
          epoch: incomingEpochNum,
        };

        const result = cache.updateFromEpoch(incomingEpoch);

        if (shouldReject || incomingEpochNum <= initialEpoch) {
          // Should be rejected - result should be false
          // and current epoch should remain unchanged
          return result === false && cache.getEpoch() === initialEpoch;
        } else {
          // Should be accepted - result should be true
          // and current epoch should be updated
          return result === true && cache.getEpoch() === incomingEpochNum;
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Cache rejects epochs with number <= current epoch');
});

/**
 * Property 13: Epochs equal to current epoch are rejected.
 */
test('Property 13: Cache rejects epochs equal to current epoch', async (t) => {
  fc.assert(
    fc.property(
      fc.nat({max: 100}).filter((n) => n > 0), // Current epoch (1-100)
      anyEpochArbitrary, // Template for epoch structure
      (currentEpoch, epochTemplate) => {
        const cache = new SystemTableCache();

        // Set up initial epoch
        const setupEpoch = {...epochTemplate, epoch: currentEpoch};
        cache.updateFromEpoch(setupEpoch);

        // Try to apply epoch with same number
        const sameEpoch = {...epochTemplate, epoch: currentEpoch};
        const result = cache.updateFromEpoch(sameEpoch);

        // Should be rejected and epoch unchanged
        return result === false && cache.getEpoch() === currentEpoch;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Cache rejects epochs equal to current epoch');
});

/**
 * Property 13: Epochs less than current epoch are rejected.
 */
test('Property 13: Cache rejects epochs less than current epoch', async (t) => {
  fc.assert(
    fc.property(
      fc.nat({max: 100}).filter((n) => n > 1), // Current epoch (2-100)
      fc.nat({max: 99}), // How much less (0-99)
      anyEpochArbitrary, // Template for epoch structure
      (currentEpoch, lessBy, epochTemplate) => {
        const cache = new SystemTableCache();

        // Set up initial epoch
        const setupEpoch = {...epochTemplate, epoch: currentEpoch};
        cache.updateFromEpoch(setupEpoch);

        // Calculate older epoch (at least 1 less, but not negative)
        const olderEpochNum = Math.max(0, currentEpoch - lessBy - 1);

        // Try to apply older epoch
        const olderEpoch = {...epochTemplate, epoch: olderEpochNum};
        const result = cache.updateFromEpoch(olderEpoch);

        // Should be rejected and epoch unchanged
        return result === false && cache.getEpoch() === currentEpoch;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Cache rejects epochs less than current epoch');
});

/**
 * Property 13: Epochs greater than current epoch are accepted.
 */
test('Property 13: Cache accepts epochs greater than current epoch', async (t) => {
  fc.assert(
    fc.property(
      fc.nat({max: 100}), // Current epoch (0-100)
      fc.nat({max: 100}).filter((n) => n > 0), // How much greater (1-100)
      anyEpochArbitrary, // Template for epoch structure
      (currentEpoch, greaterBy, epochTemplate) => {
        const cache = new SystemTableCache();

        // Set up initial epoch (if > 0)
        if (currentEpoch > 0) {
          const setupEpoch = {...epochTemplate, epoch: currentEpoch};
          cache.updateFromEpoch(setupEpoch);
        }

        const initialCacheEpoch = cache.getEpoch();

        // Calculate newer epoch
        const newerEpochNum = initialCacheEpoch + greaterBy;

        // Try to apply newer epoch
        const newerEpoch = {...epochTemplate, epoch: newerEpochNum};
        const result = cache.updateFromEpoch(newerEpoch);

        // Should be accepted and epoch updated
        return result === true && cache.getEpoch() === newerEpochNum;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Cache accepts epochs greater than current epoch');
});

/**
 * Property 13: Sequence of epoch updates maintains monotonic ordering.
 */
test('Property 13: Sequence of epoch updates respects ordering', async (t) => {
  fc.assert(
    fc.property(
      fc.array(fc.nat({max: 50}), {minLength: 1, maxLength: 20}), // Sequence of epochs
      anyEpochArbitrary, // Template for epoch structure
      (epochSequence, epochTemplate) => {
        const cache = new SystemTableCache();
        let highestAccepted = 0;

        for (const epochNum of epochSequence) {
          const epoch = {...epochTemplate, epoch: epochNum};
          const result = cache.updateFromEpoch(epoch);

          if (epochNum > highestAccepted) {
            // Should be accepted
            if (result !== true) {
              return false;
            }
            if (cache.getEpoch() !== epochNum) {
              return false;
            }
            highestAccepted = epochNum;
          } else {
            // Should be rejected
            if (result !== false) {
              return false;
            }
            if (cache.getEpoch() !== highestAccepted) {
              return false;
            }
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Sequence of epoch updates respects ordering');
});

/**
 * Property 13: After rejection, cache epoch remains unchanged.
 */
test('Property 13: Rejected epoch does not modify cache state', async (t) => {
  fc.assert(
    fc.property(
      fc.nat({max: 100}).filter((n) => n > 0), // Current epoch
      fc.nat({max: 100}), // Rejected epoch offset
      anyEpochArbitrary, // Template for epoch structure
      (currentEpoch, offset, epochTemplate) => {
        const cache = new SystemTableCache();

        // Set up initial epoch
        const setupEpoch = {...epochTemplate, epoch: currentEpoch};
        cache.updateFromEpoch(setupEpoch);

        // Record state before rejection attempt
        const epochBefore = cache.getEpoch();

        // Calculate rejected epoch (less than or equal to current)
        const rejectedEpochNum = Math.max(0, currentEpoch - offset);
        const rejectedEpoch = {...epochTemplate, epoch: rejectedEpochNum};

        // Attempt to apply rejected epoch
        cache.updateFromEpoch(rejectedEpoch);

        // Verify epoch unchanged
        return cache.getEpoch() === epochBefore;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Rejected epoch does not modify cache state');
});
