// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {QUERY_ERROR_MSG} from '../../src/query/query-constants.js';
import {
  MIGRATION_ERROR_MSG,
  MIGRATION_STATUS,
  MIGRATION_TYPE,
} from '../../src/migration/migration-constants.js';
import {MigrationPipeline} from '../../src/migration/migration-pipeline.js';

const config = ConfigurationManager.getInstance();
config.initialize();

function createAddColumnAst() {
  return new SQLParser(
    'ALTER TABLE users ADD COLUMN age INTEGER DEFAULT 5',
  ).parse();
}

function createRenameTableAst() {
  return new SQLParser(
    'ALTER TABLE users RENAME TO users_v2',
  ).parse();
}

function createCoordinatorDouble(overrides = {}) {
  return {
    async resolveTableMetadata() {
      return {
        table_id: 'table-1',
        table_name: 'users',
      };
    },
    async findActiveMigrationByTableId() {
      return null;
    },
    async initiateMigration() {
      return 'migration-1';
    },
    ...overrides,
  };
}

test('MigrationPipeline rejects unsupported ALTER TABLE types', async (t) => {
  const pipeline = new MigrationPipeline({
    migrationCoordinator: createCoordinatorDouble(),
  });

  await t.rejects(
    pipeline.handleAlterTable(createRenameTableAst(), 'session-unsupported'),
  );
});

test('MigrationPipeline delegates supported ALTER TABLE to coordinator', async (t) => {
  const calls = [];
  const pipeline = new MigrationPipeline({
    migrationCoordinator: createCoordinatorDouble({
      async initiateMigration(tableId, alterSpec) {
        calls.push({tableId, alterSpec});
        return 'migration-22';
      },
    }),
  });

  const result = await pipeline.handleAlterTable(
    createAddColumnAst(),
    'session-ok',
  );

  t.equal(result.success, true);
  t.equal(result.migrationId, 'migration-22');
  t.equal(result.tableId, 'table-1');
  t.equal(result.tableName, 'users');
  t.equal(result.status, MIGRATION_STATUS.PENDING);
  t.equal(calls.length, 1);
  t.equal(calls[0].alterSpec.migrationType, MIGRATION_TYPE.ADD_COLUMN);
  t.equal(calls[0].alterSpec.columnName, 'age');
  t.equal(calls[0].alterSpec.defaultValue, 5);
});

test('MigrationPipeline rejects ALTER TABLE when active migration exists', async (t) => {
  const pipeline = new MigrationPipeline({
    migrationCoordinator: createCoordinatorDouble({
      async findActiveMigrationByTableId() {
        return {migration_id: 'migration-conflict'};
      },
    }),
  });

  await t.rejects(
    pipeline.handleAlterTable(createAddColumnAst(), 'session-conflict'),
    new RegExp(
      `${MIGRATION_ERROR_MSG.ACTIVE_MIGRATION_CONFLICT_PREFIX}` +
      'migration-conflict',
    ),
  );
});

test('SqlCore delegates ALTER TABLE to configured migration pipeline', async (t) => {
  const captured = {
    ast: null,
    sessionId: null,
  };
  const engine = new SQLQueryEngine({});
  engine.setMigrationPipeline({
    async handleAlterTable(ast, sessionId) {
      captured.ast = ast;
      captured.sessionId = sessionId;
      return {
        success: true,
        migrationId: 'migration-99',
      };
    },
  });

  const result = await engine.executeQuery(
    'ALTER TABLE users ADD COLUMN age INTEGER',
    [],
    {sessionId: 'session-alter'},
  );

  t.equal(result.success, true);
  t.equal(result.migrationId, 'migration-99');
  t.equal(captured.ast.type, 'ALTER_TABLE');
  t.equal(captured.sessionId, 'session-alter');
});

test('SqlCore returns migration pipeline unavailable for ALTER TABLE without pipeline',
  async (t) => {
    const engine = new SQLQueryEngine({});
    engine.setMigrationPipeline(null);

    const result = await engine.executeQuery(
      'ALTER TABLE users ADD COLUMN age INTEGER',
      [],
      {sessionId: 'session-missing-pipeline'},
    );

    t.equal(result.success, false);
    t.equal(result.error, QUERY_ERROR_MSG.MIGRATION_PIPELINE_UNAVAILABLE);
  });
