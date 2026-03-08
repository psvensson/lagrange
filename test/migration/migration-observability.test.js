import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {TABLES} from '../../src/constants/tables.js';

const config = ConfigurationManager.getInstance();
config.initialize();

function createSystemCache() {
  const rowsByTable = {
    [TABLES.TABLES]: [
      {
        table_id: 'schema-migrations-table',
        table_name: TABLES.SCHEMA_MIGRATIONS,
      },
      {
        table_id: 'schema-migration-partitions-table',
        table_name: TABLES.SCHEMA_MIGRATION_PARTITIONS,
      },
    ],
    [TABLES.PARTITIONS]: [
      {
        partition_id: 'schema-migrations-p1',
        table_id: 'schema-migrations-table',
        table_name: TABLES.SCHEMA_MIGRATIONS,
        leader_node_id: 'node-1',
      },
      {
        partition_id: 'schema-migration-partitions-p1',
        table_id: 'schema-migration-partitions-table',
        table_name: TABLES.SCHEMA_MIGRATION_PARTITIONS,
        leader_node_id: 'node-1',
      },
    ],
    [TABLES.SERVICES]: [
      {
        service_id: 'schema-migrations-service',
        partition_id: 'schema-migrations-p1',
        service_type: 'partition',
        node_id: 'node-1',
        address: 'node-1/partition/schema-migrations',
        status: 'active',
        raft_role: 'leader',
      },
      {
        service_id: 'schema-migration-partitions-service',
        partition_id: 'schema-migration-partitions-p1',
        service_type: 'partition',
        node_id: 'node-1',
        address: 'node-1/partition/schema-migration-partitions',
        status: 'active',
        raft_role: 'leader',
      },
    ],
  };

  return {
    get(tableName, key) {
      const rows = rowsByTable[tableName] || [];
      if (tableName === TABLES.TABLES) {
        return rows.find((row) =>
          row.table_id === key || row.table_name === key,
        ) || null;
      }
      if (tableName === TABLES.PARTITIONS) {
        return rows.find((row) => row.partition_id === key) || null;
      }
      return null;
    },
    find(tableName, predicate) {
      const rows = rowsByTable[tableName] || [];
      return rows.find(predicate) || null;
    },
    filter(tableName, predicate) {
      const rows = rowsByTable[tableName] || [];
      return rows.filter(predicate);
    },
    getAll(tableName) {
      return rowsByTable[tableName] || [];
    },
  };
}

function createMessageRouter() {
  return {
    async deliver(_address, payload) {
      const sql = String(payload?.sql || '').toLowerCase();
      if (sql.includes(`from ${TABLES.SCHEMA_MIGRATIONS}`)) {
        return {
          acknowledged: true,
          success: true,
          rows: [{
            migration_id: 'migration-1',
            table_name: 'users',
            current_stage: 'backfill',
            created_at: 1000,
            updated_at: 2000,
          }],
        };
      }
      if (sql.includes(`from ${TABLES.SCHEMA_MIGRATION_PARTITIONS}`)) {
        return {
          acknowledged: true,
          success: true,
          rows: [{
            partition_id: 'table-1-p1',
            status: 'backfill',
            backfill_cursor: '42',
            retry_count: 2,
            error_message: null,
          }],
        };
      }
      return {
        acknowledged: true,
        success: true,
        rows: [],
      };
    },
  };
}

test('schema_migrations is queryable through SqlCore', async (t) => {
  const engine = new SQLQueryEngine({
    systemCache: createSystemCache(),
    messageRouter: createMessageRouter(),
    nodeId: 'node-1',
  });

  const result = await engine.executeQuery(
    `SELECT migration_id, table_name, current_stage, created_at, updated_at ` +
    `FROM ${TABLES.SCHEMA_MIGRATIONS}`,
    [],
    {sessionId: 'obs-1'},
  );

  t.equal(result.success, true);
  t.equal(result.rows.length, 1);
  t.equal(result.rows[0].migration_id, 'migration-1');
  t.equal(result.rows[0].table_name, 'users');
  t.equal(result.rows[0].current_stage, 'backfill');
  t.equal(result.rows[0].created_at, 1000);
  t.equal(result.rows[0].updated_at, 2000);
});

test('schema_migration_partitions is queryable through SqlCore', async (t) => {
  const engine = new SQLQueryEngine({
    systemCache: createSystemCache(),
    messageRouter: createMessageRouter(),
    nodeId: 'node-1',
  });

  const result = await engine.executeQuery(
    `SELECT partition_id, status, backfill_cursor, retry_count, error_message ` +
    `FROM ${TABLES.SCHEMA_MIGRATION_PARTITIONS}`,
    [],
    {sessionId: 'obs-2'},
  );

  t.equal(result.success, true);
  t.equal(result.rows.length, 1);
  t.equal(result.rows[0].partition_id, 'table-1-p1');
  t.equal(result.rows[0].status, 'backfill');
  t.equal(result.rows[0].backfill_cursor, '42');
  t.equal(result.rows[0].retry_count, 2);
  t.equal(result.rows[0].error_message, null);
});
