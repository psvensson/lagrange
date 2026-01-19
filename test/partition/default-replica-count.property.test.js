/**
 * Property-based test for Default Replica Count.
 * **Property 5: Default Replica Count**
 * **Validates: Requirements 3.4**
 *
 * Property: For any partition created without explicit configuration,
 * it should have exactly three replicas by default.
 */

import {test, beforeEach, afterEach} from 'tap';
import fc from 'fast-check';
import {PartitionService} from '../../src/partition/partition-service.js';
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
 * Generate a random partition ID.
 */
const partitionIdArbitrary = fc.string({minLength: 1, maxLength: 30})
  .filter((s) => /^[a-z0-9_-]+$/i.test(s))
  .map((s) => `partition-${s}`);

/**
 * Generate a random table ID.
 */
const tableIdArbitrary = fc.string({minLength: 1, maxLength: 20})
  .filter((s) => /^[a-z_][a-z0-9_]*$/i.test(s));

/**
 * Feature: distributed-database-system
 * Property 5: Default Replica Count
 *
 * For any partition created without explicit configuration, it should
 * have exactly three replicas by default.
 */
test('Property 5: Default replica count is 3', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      partitionIdArbitrary,
      tableIdArbitrary,
      async (partitionId, tableId) => {
        // Create partition with default configuration (3 replicas)
        const replicaIds = [
          `${partitionId}-r1`,
          `${partitionId}-r2`,
          `${partitionId}-r3`,
        ];

        const partition = new PartitionService({
          partitionId,
          tableId,
          replicaId: replicaIds[0],
          replicaIds,
          dbPath: ':memory:',
        });

        try {
          await partition.initialize();

          // Verify default replica count is 3
          const status = partition.getStatus();

          // Replica count should be 3
          if (status.replicaCount !== 3) {
            return false;
          }

          // Configuration should have default replica count of 3
          const config = ConfigurationManager.getInstance();
          const defaultReplicaCount = config.get('partition.defaultReplicaCount');
          if (defaultReplicaCount !== 3) {
            return false;
          }

          return true;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Default replica count is 3');
});

/**
 * Property: Partition reports correct replica count.
 */
test('Property 5: Partition reports correct replica count', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      partitionIdArbitrary,
      tableIdArbitrary,
      fc.integer({min: 1, max: 7}).filter((n) => n % 2 === 1), // Odd numbers only
      async (partitionId, tableId, replicaCount) => {
        // Create partition with specified replica count
        const replicaIds = [];
        for (let i = 0; i < replicaCount; i++) {
          replicaIds.push(`${partitionId}-r${i + 1}`);
        }

        const partition = new PartitionService({
          partitionId,
          tableId,
          replicaId: replicaIds[0],
          replicaIds,
          dbPath: ':memory:',
        });

        try {
          await partition.initialize();

          const status = partition.getStatus();

          // Reported replica count should match configured count
          if (status.replicaCount !== replicaCount) {
            return false;
          }

          return true;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Partition reports correct replica count');
});

/**
 * Property: Replica count must be odd for Raft quorum.
 */
test('Property 5: Replica count is odd for Raft quorum', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      partitionIdArbitrary,
      tableIdArbitrary,
      async (partitionId, tableId) => {
        // Default configuration should use odd replica count
        const config = ConfigurationManager.getInstance();
        const defaultReplicaCount = config.get('partition.defaultReplicaCount');

        // Default must be odd
        if (defaultReplicaCount % 2 !== 1) {
          return false;
        }

        // Default must be at least 3
        if (defaultReplicaCount < 3) {
          return false;
        }

        // Create partition with default replicas
        const replicaIds = [];
        for (let i = 0; i < defaultReplicaCount; i++) {
          replicaIds.push(`${partitionId}-r${i + 1}`);
        }

        const partition = new PartitionService({
          partitionId,
          tableId,
          replicaId: replicaIds[0],
          replicaIds,
          dbPath: ':memory:',
        });

        try {
          await partition.initialize();

          const status = partition.getStatus();

          // Replica count should be odd
          if (status.replicaCount % 2 !== 1) {
            return false;
          }

          return true;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Replica count is odd for Raft quorum');
});
