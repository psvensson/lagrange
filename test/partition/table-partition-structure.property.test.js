/**
 * Property-based test for Table Partition Structure.
 * **Property 4: Table Partition Structure**
 * **Validates: Requirements 3.2, 3.3**
 *
 * Property: For any table created in the system, it should be implemented
 * as one or more partitions, each using SQLite with Raft consensus.
 */

import {test, beforeEach, afterEach} from 'tap';
import fc from 'fast-check';
import {
  PartitionService,
  RaftRole,
} from '../../src/partition/partition-service.js';
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
 * Generate a random table schema.
 */
const schemaArbitrary = fc.record({
  columns: fc.array(
    fc.record({
      name: fc.string({minLength: 1, maxLength: 20})
        .filter((s) => /^[a-z_][a-z0-9_]*$/i.test(s))
        .filter((s) => !SQL_RESERVED_KEYWORDS.has(s.toLowerCase())),
      type: fc.constantFrom('TEXT', 'INTEGER', 'REAL', 'BLOB'),
      notNull: fc.boolean(),
    }),
    {minLength: 1, maxLength: 5},
  ).map((cols) => {
    // Ensure unique column names
    const seen = new Set();
    const uniqueCols = cols.filter((c) => {
      if (seen.has(c.name.toLowerCase())) return false;
      seen.add(c.name.toLowerCase());
      return true;
    });

    // Make only the first column the primary key
    return uniqueCols.map((col, idx) => ({
      ...col,
      primaryKey: idx === 0,
    }));
  }),
});

/**
 * SQL reserved keywords to avoid in table names.
 */
const SQL_RESERVED_KEYWORDS = new Set([
  'add', 'all', 'alter', 'and', 'as', 'asc', 'between', 'by', 'case', 'check',
  'column', 'constraint', 'create', 'cross', 'current', 'default', 'delete',
  'desc', 'distinct', 'drop', 'else', 'end', 'escape', 'except', 'exists',
  'for', 'foreign', 'from', 'full', 'group', 'having', 'if', 'in', 'index',
  'inner', 'insert', 'intersect', 'into', 'is', 'join', 'key', 'left', 'like',
  'limit', 'not', 'null', 'on', 'or', 'order', 'outer', 'primary', 'references',
  'right', 'select', 'set', 'table', 'then', 'to', 'union', 'unique', 'update',
  'using', 'values', 'when', 'where', 'with',
]);

/**
 * Generate a random table ID.
 */
const tableIdArbitrary = fc.string({minLength: 1, maxLength: 20})
  .filter((s) => /^[a-z_][a-z0-9_]*$/i.test(s))
  .filter((s) => !SQL_RESERVED_KEYWORDS.has(s.toLowerCase()));

/**
 * Feature: distributed-database-system
 * Property 4: Table Partition Structure
 *
 * For any table created in the system, it should be implemented as one or
 * more partitions, each using SQLite with Raft consensus.
 */
test('Property 4: Tables are implemented as SQLite-backed Raft partitions', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      tableIdArbitrary,
      schemaArbitrary,
      async (tableId, schema) => {
        const partitionId = `${tableId}-p1`;
        const replicaId = `${partitionId}-r1`;

        const partition = new PartitionService({
          partitionId,
          tableId,
          tableName: tableId,
          replicaId,
          replicaIds: [replicaId],
          schema,
          dbPath: ':memory:',
        });

        try {
          await partition.initialize();

          // Wait for leader election
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Verify partition is initialized
          if (!partition.initialized) {
            return false;
          }

          // Verify partition uses Raft (has role)
          const role = partition.getRole();
          if (![RaftRole.LEADER, RaftRole.FOLLOWER, RaftRole.CANDIDATE]
            .includes(role)) {
            return false;
          }

          // Verify partition has SQLite storage (can execute queries)
          const result = await partition.executeQuery(
            'SELECT name FROM sqlite_master WHERE type=\'table\' AND name=?',
            [tableId],
          );

          // Table should exist in SQLite
          if (!result.success || result.rows.length === 0) {
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

  t.pass('All tables are implemented as SQLite-backed Raft partitions');
});

/**
 * Property: Each partition maintains Raft consensus state.
 */
test('Property 4: Partitions maintain Raft consensus state', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      tableIdArbitrary,
      async (tableId) => {
        const partitionId = `${tableId}-p1`;
        const replicaId = `${partitionId}-r1`;

        const partition = new PartitionService({
          partitionId,
          tableId,
          replicaId,
          replicaIds: [replicaId],
          dbPath: ':memory:',
        });

        try {
          await partition.initialize();

          // Wait for leader election
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Verify Raft state is maintained
          const term = partition.getCurrentTerm();
          const role = partition.getRole();
          const leaderId = partition.getLeaderId();

          // Term should be non-negative
          if (term < 0) {
            return false;
          }

          // Role should be valid
          if (![RaftRole.LEADER, RaftRole.FOLLOWER, RaftRole.CANDIDATE]
            .includes(role)) {
            return false;
          }

          // Single replica should become leader
          if (role !== RaftRole.LEADER) {
            return false;
          }

          // Leader ID should be set
          if (leaderId !== replicaId) {
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

  t.pass('Partitions maintain Raft consensus state');
});

/**
 * Property: Partition data is persisted in SQLite.
 */
test('Property 4: Partition data is persisted in SQLite', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      tableIdArbitrary,
      fc.array(
        fc.record({
          id: fc.uuid(),
          value: fc.integer({min: 0, max: 10000}),
        }),
        {minLength: 1, maxLength: 5},
      ),
      async (tableId, records) => {
        const schema = {
          columns: [
            {name: 'id', type: 'TEXT', primaryKey: true},
            {name: 'value', type: 'INTEGER'},
          ],
        };

        const partition = new PartitionService({
          partitionId: `${tableId}-p1`,
          tableId,
          tableName: tableId,
          replicaId: `${tableId}-p1-r1`,
          replicaIds: [`${tableId}-p1-r1`],
          schema,
          dbPath: ':memory:',
        });

        try {
          await partition.initialize();
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Insert records
          for (const record of records) {
            await partition.insertData(tableId, record);
          }

          // Query records back
          const result = await partition.executeQuery(
            `SELECT * FROM ${tableId}`,
          );

          // All records should be persisted
          if (result.count !== records.length) {
            return false;
          }

          // Verify each record exists
          for (const record of records) {
            const found = result.rows.find((r) => r.id === record.id);
            if (!found || found.value !== record.value) {
              return false;
            }
          }

          return true;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Partition data is persisted in SQLite');
});
