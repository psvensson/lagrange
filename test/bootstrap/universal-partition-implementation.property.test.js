/**
 * Property-based test for Universal Partition Implementation.
 * **Property 32: Universal Partition Implementation**
 * **Validates: Requirements 3.2**
 *
 * Property: For any table in the system (system table or user table),
 * it should be implemented as one or more partitions with no distinction
 * in infrastructure.
 */

import {test, beforeEach, afterEach} from 'tap';
import fc from 'fast-check';
import {
  SystemTableName,
  SYSTEM_TABLE_SCHEMAS,
  INITIAL_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
} from '../../src/bootstrap/system-table-schemas.js';
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
 * Generate a random user table schema.
 */
const userSchemaArbitrary = fc.record({
  columns: fc.array(
    fc.record({
      name: fc.string({minLength: 1, maxLength: 20})
        .filter((s) => /^[a-z_][a-z0-9_]*$/i.test(s))
        .filter((s) => !SQL_RESERVED_KEYWORDS.has(s.toLowerCase())),
      type: fc.constantFrom('TEXT', 'INTEGER', 'REAL'),
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
 * Generate a random user table ID.
 */
const userTableIdArbitrary = fc.string({minLength: 3, maxLength: 20})
  .filter((s) => /^[a-z_][a-z0-9_]*$/i.test(s))
  .filter((s) => !SQL_RESERVED_KEYWORDS.has(s.toLowerCase()))
  .filter((s) => !Object.values(SystemTableName).includes(s));

/**
 * Feature: distributed-database-system
 * Property 32: Universal Partition Implementation
 *
 * For any table in the system (system table or user table), it should be
 * implemented as one or more partitions with no distinction in infrastructure.
 */
test('Property 32: System tables use same PartitionService as user tables', async (t) => {
  // Test that all system tables can be created using PartitionService
  for (const schema of SYSTEM_TABLE_SCHEMAS) {
    const tableName = schema.tableName;
    const partitionId = INITIAL_PARTITION_IDS[tableName];
    const replicaIds = INITIAL_REPLICA_IDS[tableName];
    const replicaId = replicaIds[0];

    const partition = new PartitionService({
      partitionId,
      tableId: tableName,
      tableName,
      schema,
      replicaId,
      replicaIds: [replicaId],
      dbPath: ':memory:',
    });

    try {
      await partition.initialize();
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify partition is initialized
      t.ok(partition.initialized, `System table ${tableName} partition initialized`);

      // Verify table exists in SQLite
      const result = await partition.executeQuery(
        'SELECT name FROM sqlite_master WHERE type=\'table\' AND name=?',
        [tableName],
      );
      t.ok(result.success, `System table ${tableName} query succeeded`);
      t.equal(result.rows.length, 1, `System table ${tableName} exists in SQLite`);
    } finally {
      await partition.shutdown();
    }
  }
});

test('Property 32: User tables use same PartitionService as system tables', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      userTableIdArbitrary,
      userSchemaArbitrary,
      async (tableId, schema) => {
        const partitionId = `${tableId}-p1`;
        const replicaId = `${partitionId}-r1`;

        const partition = new PartitionService({
          partitionId,
          tableId,
          tableName: tableId,
          schema,
          replicaId,
          replicaIds: [replicaId],
          dbPath: ':memory:',
        });

        try {
          await partition.initialize();
          await new Promise((resolve) => setTimeout(resolve, 300));

          // Verify partition is initialized (same as system tables)
          if (!partition.initialized) {
            return false;
          }

          // Verify table exists in SQLite (same as system tables)
          const result = await partition.executeQuery(
            'SELECT name FROM sqlite_master WHERE type=\'table\' AND name=?',
            [tableId],
          );

          if (!result.success || result.rows.length !== 1) {
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

  t.pass('User tables use same PartitionService infrastructure as system tables');
});

test('Property 32: No infrastructure distinction between system and user tables', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom(...SYSTEM_TABLE_SCHEMAS),
      userTableIdArbitrary,
      userSchemaArbitrary,
      async (systemSchema, userTableId, userSchema) => {
        const systemTableName = systemSchema.tableName;
        const systemPartitionId = INITIAL_PARTITION_IDS[systemTableName];
        const systemReplicaId = INITIAL_REPLICA_IDS[systemTableName][0];

        const userPartitionId = `${userTableId}-p1`;
        const userReplicaId = `${userPartitionId}-r1`;

        // Create system table partition
        const systemPartition = new PartitionService({
          partitionId: systemPartitionId,
          tableId: systemTableName,
          tableName: systemTableName,
          schema: systemSchema,
          replicaId: systemReplicaId,
          replicaIds: [systemReplicaId],
          dbPath: ':memory:',
        });

        // Create user table partition
        const userPartition = new PartitionService({
          partitionId: userPartitionId,
          tableId: userTableId,
          tableName: userTableId,
          schema: userSchema,
          replicaId: userReplicaId,
          replicaIds: [userReplicaId],
          dbPath: ':memory:',
        });

        try {
          await systemPartition.initialize();
          await userPartition.initialize();
          await new Promise((resolve) => setTimeout(resolve, 300));

          // Both should be initialized - same infrastructure
          if (!systemPartition.initialized || !userPartition.initialized) {
            return false;
          }

          // Both should have same Raft capabilities - same infrastructure
          const systemRole = systemPartition.getRole();
          const userRole = userPartition.getRole();

          // Both should be leaders (single replica) - same Raft behavior
          if (systemRole !== 'leader' || userRole !== 'leader') {
            return false;
          }

          // Both should have same key range capabilities - same infrastructure
          const systemRange = systemPartition.getKeyRange();
          const userRange = userPartition.getKeyRange();

          // Both should have full key range by default
          if (systemRange.start !== null || systemRange.end !== null) {
            return false;
          }
          if (userRange.start !== null || userRange.end !== null) {
            return false;
          }

          // Both should support CDC subscription (same API) - same infrastructure
          let systemCDCSubscribed = false;
          let userCDCSubscribed = false;

          try {
            systemPartition.subscribeToCDC(() => {});
            systemCDCSubscribed = true;
          } catch (_e) {
            // CDC subscription failed
          }

          try {
            userPartition.subscribeToCDC(() => {});
            userCDCSubscribed = true;
          } catch (_e) {
            // CDC subscription failed
          }

          // Both should support CDC subscription - same infrastructure
          if (!systemCDCSubscribed || !userCDCSubscribed) {
            return false;
          }

          // Both should have same status structure - same infrastructure
          const systemStatus = systemPartition.getStatus();
          const userStatus = userPartition.getStatus();

          // Both should have same status properties
          const requiredProps = [
            'partitionId', 'tableId', 'role', 'initialized',
            'replicaCount', 'cdcSubscribers',
          ];
          for (const prop of requiredProps) {
            if (!(prop in systemStatus) || !(prop in userStatus)) {
              return false;
            }
          }

          // Both should support executeQuery - same infrastructure
          const systemQueryResult = await systemPartition.executeQuery(
            `SELECT COUNT(*) as cnt FROM ${systemTableName}`,
          );
          const userQueryResult = await userPartition.executeQuery(
            `SELECT COUNT(*) as cnt FROM ${userTableId}`,
          );

          // Both should succeed with same result structure
          if (!systemQueryResult.success || !userQueryResult.success) {
            return false;
          }

          // Both should have rows array
          if (!Array.isArray(systemQueryResult.rows) ||
              !Array.isArray(userQueryResult.rows)) {
            return false;
          }

          return true;
        } finally {
          await systemPartition.shutdown();
          await userPartition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('No infrastructure distinction between system and user tables');
});
