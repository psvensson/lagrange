/**
 * Property Test: Transaction Durability via Raft
 * Property 48: For any committed transaction, the system should ensure durability
 * through Raft replication before acknowledging the commit to the client.
 * Validates: Requirements 21.6
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {PartitionService} from '../../src/partition/partition-service.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

/**
 * Generate a valid value for insertion.
 */
const valueArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'),
  {minLength: 1, maxLength: 20},
);

/**
 * Generate a list of operations to perform in a transaction.
 * Ensures unique IDs within each operation set to avoid UNIQUE constraint violations.
 */
const operationsArb = fc.array(
  fc.record({
    id: fc.integer({min: 1, max: 1000}),
    value: valueArb,
  }),
  {minLength: 1, maxLength: 3},
).map((ops) => {
  // Ensure unique IDs by using index-based IDs
  return ops.map((op, index) => ({
    ...op,
    id: op.id * 1000 + index, // Make IDs unique within the set
  }));
});

test('Property 48: Committed transactions are replicated to Raft log', async (t) => {
  /**
   * Property: For any committed transaction, the operations should be
   * appended to the Raft log for durability.
   */
  await fc.assert(
    fc.asyncProperty(
      operationsArb,
      async (ops) => {
        const partition = new PartitionService({
          partitionId: `test-partition-${Date.now()}-${Math.random()}`,
          tableId: 'test_table',
          tableName: 'test_table',
          replicaId: 'replica-1',
          schema: {
            columns: [
              {name: 'id', type: 'INTEGER', primaryKey: true},
              {name: 'value', type: 'TEXT'},
            ],
          },
          dbPath: ':memory:',
        });

        await partition.initialize();

        try {
          // Get initial log length
          const initialLogLength = partition.storage.getLogLength();

          // Begin transaction
          await partition.beginTransaction();

          // Execute operations
          for (const op of ops) {
            await partition.executeQuery(
              `INSERT INTO test_table (id, value) VALUES (${op.id}, '${op.value}')`,
            );
          }

          // Commit transaction
          const commitResult = await partition.commitTransaction();

          // Verify commit was successful
          if (!commitResult.success) {
            return false;
          }

          // Verify Raft log has grown (transaction commit entry added)
          const finalLogLength = partition.storage.getLogLength();

          // Log should have at least one new entry for the transaction commit
          return finalLogLength > initialLogLength;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Raft log replication property holds');
});

test('Property 48: Commit returns Raft log index', async (t) => {
  /**
   * Property: For any committed transaction, the commit result should
   * include the Raft log index for tracking durability.
   */
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 100}),
      valueArb,
      async (id, value) => {
        const partition = new PartitionService({
          partitionId: `test-partition-${Date.now()}-${Math.random()}`,
          tableId: 'test_table',
          tableName: 'test_table',
          replicaId: 'replica-1',
          schema: {
            columns: [
              {name: 'id', type: 'INTEGER', primaryKey: true},
              {name: 'value', type: 'TEXT'},
            ],
          },
          dbPath: ':memory:',
        });

        await partition.initialize();

        try {
          // Begin transaction
          await partition.beginTransaction();

          // Execute operation
          await partition.executeQuery(
            `INSERT INTO test_table (id, value) VALUES (${id}, '${value}')`,
          );

          // Commit transaction
          const commitResult = await partition.commitTransaction();

          // Verify commit was successful and has raft log index
          return commitResult.success === true &&
                 commitResult.committed === true &&
                 commitResult.raftLogIndex !== undefined;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Raft log index in commit result property holds');
});

test('Property 48: Data persists after commit', async (t) => {
  /**
   * Property: For any committed transaction, the data should be
   * queryable immediately after commit.
   */
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 100}),
      valueArb,
      async (id, value) => {
        const partition = new PartitionService({
          partitionId: `test-partition-${Date.now()}-${Math.random()}`,
          tableId: 'test_table',
          tableName: 'test_table',
          replicaId: 'replica-1',
          schema: {
            columns: [
              {name: 'id', type: 'INTEGER', primaryKey: true},
              {name: 'value', type: 'TEXT'},
            ],
          },
          dbPath: ':memory:',
        });

        await partition.initialize();

        try {
          // Begin transaction
          await partition.beginTransaction();

          // Insert data
          await partition.executeQuery(
            `INSERT INTO test_table (id, value) VALUES (${id}, '${value}')`,
          );

          // Commit transaction
          await partition.commitTransaction();

          // Query the data - should be visible after commit
          const result = await partition.executeQuery(
            `SELECT * FROM test_table WHERE id = ${id}`,
          );

          return result.rows.length === 1 && result.rows[0].value === value;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Data persistence after commit property holds');
});

test('Property 48: Rolled back transactions are not in Raft log', async (t) => {
  /**
   * Property: For any rolled back transaction, the operations should
   * NOT be committed to the Raft log.
   */
  await fc.assert(
    fc.asyncProperty(
      operationsArb,
      async (ops) => {
        const partition = new PartitionService({
          partitionId: `test-partition-${Date.now()}-${Math.random()}`,
          tableId: 'test_table',
          tableName: 'test_table',
          replicaId: 'replica-1',
          schema: {
            columns: [
              {name: 'id', type: 'INTEGER', primaryKey: true},
              {name: 'value', type: 'TEXT'},
            ],
          },
          dbPath: ':memory:',
        });

        await partition.initialize();

        try {
          // Get initial log length
          const initialLogLength = partition.storage.getLogLength();

          // Begin transaction
          await partition.beginTransaction();

          // Execute operations
          for (const op of ops) {
            await partition.executeQuery(
              `INSERT INTO test_table (id, value) VALUES (${op.id}, '${op.value}')`,
            );
          }

          // Rollback transaction
          await partition.rollbackTransaction();

          // Verify Raft log has NOT grown (no commit entry)
          const finalLogLength = partition.storage.getLogLength();

          // Log should be the same (no transaction commit entry)
          return finalLogLength === initialLogLength;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Rollback does not add to Raft log property holds');
});

test('Property 48: Multiple commits create multiple Raft entries', async (t) => {
  /**
   * Property: For multiple committed transactions, each commit should
   * add an entry to the Raft log.
   */
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 2, max: 5}),
      async (numTransactions) => {
        const partition = new PartitionService({
          partitionId: `test-partition-${Date.now()}-${Math.random()}`,
          tableId: 'test_table',
          tableName: 'test_table',
          replicaId: 'replica-1',
          schema: {
            columns: [
              {name: 'id', type: 'INTEGER', primaryKey: true},
              {name: 'value', type: 'TEXT'},
            ],
          },
          dbPath: ':memory:',
        });

        await partition.initialize();

        try {
          const initialLogLength = partition.storage.getLogLength();

          // Execute multiple transactions
          for (let i = 0; i < numTransactions; i++) {
            await partition.beginTransaction();
            await partition.executeQuery(
              `INSERT INTO test_table (id, value) VALUES (${i + 1}, 'value${i}')`,
            );
            await partition.commitTransaction();
          }

          const finalLogLength = partition.storage.getLogLength();

          // Each transaction should add at least one entry
          return finalLogLength >= initialLogLength + numTransactions;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Multiple commits create multiple Raft entries property holds');
});
