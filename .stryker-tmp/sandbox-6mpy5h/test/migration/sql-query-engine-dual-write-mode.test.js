// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {MIGRATION_STATUS} from '../../src/migration/migration-constants.js';
import {TABLES} from '../../src/constants/tables.js';

const config = ConfigurationManager.getInstance();
config.initialize();

function createSystemCache(options = {}) {
  const tableId = options.tableId || 'table-1';
  const tableName = options.tableName || 'users';
  const migrationRows = Array.isArray(options.migrationRows) ?
    options.migrationRows :
    [];
  const rowsByTable = {
    [TABLES.TABLES]: [
      {
        table_id: tableId,
        table_name: tableName,
      },
    ],
    [TABLES.PARTITIONS]: [
      {
        partition_id: `${tableId}-p1`,
        table_id: tableId,
        table_name: tableName,
        leader_node_id: 'node-1',
      },
    ],
    [TABLES.SERVICES]: [
      {
        service_id: `${tableId}-p1-r1`,
        partition_id: `${tableId}-p1`,
        service_type: 'partition',
        node_id: 'node-1',
        address: 'node-1/partition/test',
        status: 'active',
        raft_role: 'leader',
      },
    ],
    [TABLES.SCHEMA_MIGRATIONS]: migrationRows,
  };

  return {
    get(table, key) {
      const rows = rowsByTable[table] || [];
      if (table === TABLES.TABLES) {
        return rows.find((row) => row.table_id === key || row.table_name === key) || null;
      }
      if (table === TABLES.PARTITIONS) {
        return rows.find((row) => row.partition_id === key) || null;
      }
      if (table === TABLES.SCHEMA_MIGRATIONS) {
        return rows.find((row) => row.migration_id === key) || null;
      }
      return null;
    },
    find(table, predicate) {
      const rows = rowsByTable[table] || [];
      return rows.find(predicate) || null;
    },
    filter(table, predicate) {
      const rows = rowsByTable[table] || [];
      return rows.filter(predicate);
    },
    getAll(table) {
      return rowsByTable[table] || [];
    },
  };
}

function createEngineHarness(options = {}) {
  const capture = {
    executionOptions: null,
  };
  const systemCache = createSystemCache({
    migrationRows: options.migrationRows,
  });
  const distributedQueryPlanner = {
    planInsert(ast) {
      return {
        statementType: ast.type,
        tablePlans: new Map([
          [ast.table, {partitions: ['table-1-p1']}],
        ]),
        diagnostics: {},
      };
    },
  };
  const distributedWriteCoordinator = {
    createWritePlan() {
      return {
        operationId: 'op-1',
        idempotencyKey: 'idem-1',
        statementType: 'INSERT',
        partitionStatements: new Map([
          ['table-1-p1', {ast: {}, role: 'primary', executionOptions: {}}],
        ]),
      };
    },
    async executePlan(_plan, _params, executionOptions = {}) {
      capture.executionOptions = executionOptions;
      return {
        success: true,
        affectedRows: 1,
        rows: [],
        retryCount: 0,
      };
    },
    addMirrorParticipant() {},
  };

  const engine = new SQLQueryEngine({
    systemCache,
    messageRouter: {
      async deliver() {
        return {acknowledged: true, success: true, rows: [], changes: 1};
      },
    },
    distributedQueryPlanner,
    distributedWriteCoordinator,
    nodeId: 'node-1',
  });

  return {engine, capture};
}

function createInsertAst() {
  return {
    type: 'INSERT',
    table: 'users',
    columns: ['id', 'name'],
    values: [[
      {type: 'number', value: 1},
      {type: 'single_quote_string', value: 'alice'},
    ]],
  };
}

function createExpandedInsertAst() {
  return {
    type: 'INSERT',
    table: 'users',
    columns: ['id', 'name', 'age'],
    values: [[
      {type: 'number', value: 1},
      {type: 'single_quote_string', value: 'alice'},
      {type: 'number', value: 42},
    ]],
  };
}

test('SqlCore marks dual-write mode from schema_migrations cache rows', async (t) => {
  const {engine, capture} = createEngineHarness({
    migrationRows: [{
      migration_id: 'migration-1',
      table_id: 'table-1',
      table_name: 'users',
      status: MIGRATION_STATUS.DUAL_WRITE,
      current_stage: MIGRATION_STATUS.DUAL_WRITE,
    }],
  });

  const result = await engine.executeInsert(
    createInsertAst(),
    [],
    'session-1',
    {},
  );

  t.equal(result.success, true);
  t.equal(result.dualWriteMode, true);
  t.equal(capture.executionOptions.dualWriteMode, true);
  t.equal(capture.executionOptions.migrationId, 'migration-1');
});

test('SqlCore keeps dual-write mode disabled when no active dual_write migration exists',
  async (t) => {
    const {engine, capture} = createEngineHarness({
      migrationRows: [{
        migration_id: 'migration-2',
        table_id: 'table-1',
        table_name: 'users',
        status: MIGRATION_STATUS.BACKFILL,
        current_stage: MIGRATION_STATUS.BACKFILL,
      }],
    });

    const result = await engine.executeInsert(
      createInsertAst(),
      [],
      'session-2',
      {},
    );

    t.equal(result.success, true);
    t.equal(result.dualWriteMode, false);
    t.equal(capture.executionOptions.dualWriteMode, undefined);
    t.equal(capture.executionOptions.migrationId, undefined);
  });

test('SqlCore uses post-cutover schema without dual-write mode', async (t) => {
  const {engine, capture} = createEngineHarness({
    migrationRows: [{
      migration_id: 'migration-3',
      table_id: 'table-1',
      table_name: 'users',
      status: MIGRATION_STATUS.COMPLETED,
      current_stage: MIGRATION_STATUS.COMPLETED,
    }],
  });

  const result = await engine.executeInsert(
    createExpandedInsertAst(),
    [],
    'session-3',
    {},
  );

  t.equal(result.success, true);
  t.equal(result.dualWriteMode, false);
  t.equal(capture.executionOptions.dualWriteMode, undefined);
  t.equal(capture.executionOptions.migrationId, undefined);
});
