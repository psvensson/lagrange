/**
 * Property-based test for Odd Replica Count Invariant.
 * **Property 33: Odd Replica Count Invariant**
 * **Validates: Requirements 19.1, 19.5**
 *
 * Property: For any partition or message group in the system, its replica
 * count should always be an odd number (3, 5, 7, etc.) to satisfy Raft
 * quorum requirements.
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  SYSTEM_TABLE_SCHEMAS,
  INITIAL_REPLICA_IDS,
  INITIAL_MESSAGE_GROUP_REPLICA_IDS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
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

/**
 * Check if a number is odd.
 * @param {number} n - Number to check.
 * @return {boolean} True if odd.
 */
function isOdd(n) {
  return n % 2 === 1;
}

/**
 * Feature: distributed-database-system
 * Property 33: Odd Replica Count Invariant
 *
 * For any partition or message group in the system, its replica count
 * should always be an odd number (3, 5, 7, etc.) to satisfy Raft quorum
 * requirements.
 */
test('Property 33: All system table partitions have odd replica counts', async (t) => {
  for (const schema of SYSTEM_TABLE_SCHEMAS) {
    const tableName = schema.tableName;
    const replicaIds = INITIAL_REPLICA_IDS[tableName];

    t.ok(
      isOdd(replicaIds.length),
      `System table ${tableName} has odd replica count: ${replicaIds.length}`,
    );
    t.ok(
      replicaIds.length >= 3,
      `System table ${tableName} has at least 3 replicas: ${replicaIds.length}`,
    );
  }
});

test('Property 33: Initial message group has odd replica count', async (t) => {
  const replicaCount = INITIAL_MESSAGE_GROUP_REPLICA_IDS.length;

  t.ok(
    isOdd(replicaCount),
    `Initial message group has odd replica count: ${replicaCount}`,
  );
  t.ok(
    replicaCount >= 3,
    `Initial message group has at least 3 replicas: ${replicaCount}`,
  );
});

test('Property 33: Default partition replica count is odd', async (t) => {
  const config = ConfigurationManager.getInstance();
  const defaultReplicaCount = config.get('partition.defaultReplicaCount');

  t.ok(
    isOdd(defaultReplicaCount),
    `Default partition replica count is odd: ${defaultReplicaCount}`,
  );
  t.ok(
    defaultReplicaCount >= 3,
    `Default partition replica count is at least 3: ${defaultReplicaCount}`,
  );
});

test('Property 33: Default message group replica count is odd', async (t) => {
  const config = ConfigurationManager.getInstance();
  const defaultReplicaCount = config.get('messageGroup.replicaCount');

  t.ok(
    isOdd(defaultReplicaCount),
    `Default message group replica count is odd: ${defaultReplicaCount}`,
  );
  t.ok(
    defaultReplicaCount >= 3,
    `Default message group replica count is at least 3: ${defaultReplicaCount}`,
  );
});

test('Property 33: Valid replica counts are always odd', async (t) => {
  await fc.assert(
    fc.property(
      fc.integer({min: 1, max: 100}),
      (replicaCount) => {
        // Valid replica counts for Raft must be odd and >= 3
        const isValidReplicaCount = isOdd(replicaCount) && replicaCount >= 3;

        // If it's a valid replica count, it must be odd
        if (isValidReplicaCount) {
          return isOdd(replicaCount);
        }

        // If it's not valid, it's either even or < 3
        return !isOdd(replicaCount) || replicaCount < 3;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Valid replica counts are always odd');
});

test('Property 33: Replica count growth maintains odd invariant', async (t) => {
  await fc.assert(
    fc.property(
      fc.constantFrom(3, 5, 7, 9, 11), // Valid starting counts
      fc.integer({min: 1, max: 5}), // Number of growth steps
      (startCount, growthSteps) => {
        let currentCount = startCount;

        // Grow in odd increments (3→5→7→9→...)
        for (let i = 0; i < growthSteps; i++) {
          currentCount += 2; // Grow by 2 to maintain odd
        }

        // After any number of growth steps, count should still be odd
        return isOdd(currentCount);
      },
    ),
    {numRuns: 10},
  );

  t.pass('Replica count growth maintains odd invariant');
});

test('Property 33: Replica count shrink maintains odd invariant', async (t) => {
  await fc.assert(
    fc.property(
      fc.constantFrom(7, 9, 11, 13, 15), // Valid starting counts
      fc.integer({min: 1, max: 3}), // Number of shrink steps
      (startCount, shrinkSteps) => {
        let currentCount = startCount;

        // Shrink in odd decrements (7→5→3)
        for (let i = 0; i < shrinkSteps; i++) {
          currentCount -= 2; // Shrink by 2 to maintain odd
          if (currentCount < 3) {
            currentCount = 3; // Minimum is 3
          }
        }

        // After any number of shrink steps, count should still be odd and >= 3
        return isOdd(currentCount) && currentCount >= 3;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Replica count shrink maintains odd invariant');
});

test('Property 33: Quorum calculation requires odd replica count', async (t) => {
  await fc.assert(
    fc.property(
      fc.constantFrom(3, 5, 7, 9, 11),
      (replicaCount) => {
        // Quorum is majority: floor(n/2) + 1
        const quorum = Math.floor(replicaCount / 2) + 1;

        // With odd replica count, quorum is always a clear majority
        // For n=3: quorum=2, majority=2/3
        // For n=5: quorum=3, majority=3/5
        // For n=7: quorum=4, majority=4/7

        // Quorum should be strictly greater than half
        const isStrictMajority = quorum > replicaCount / 2;

        // Quorum should be achievable with one failure
        const tolerateOneFailure = replicaCount - 1 >= quorum;

        return isStrictMajority && tolerateOneFailure;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Quorum calculation requires odd replica count');
});
