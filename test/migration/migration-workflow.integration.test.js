import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {
  MIGRATION_SQL,
  MigrationCoordinator,
} from '../../src/migration/migration-coordinator.js';
import {
  MIGRATION_STATUS,
  MIGRATION_TYPE,
} from '../../src/migration/migration-constants.js';
import {TABLES} from '../../src/constants/tables.js';

function createInitialSchema() {
  return {
    columns: [
      {name: 'id', type: 'INTEGER', primaryKey: true},
      {name: 'name', type: 'TEXT'},
    ],
  };
}

function createAddColumnSpec(defaultValue = 7) {
  return {
    migrationType: MIGRATION_TYPE.ADD_COLUMN,
    columnName: 'age',
    dataType: 'INTEGER',
    defaultValue,
    sql: `ALTER TABLE users ADD COLUMN age INTEGER DEFAULT ${defaultValue}`,
  };
}

function createSqlitePartitionExecution(rowCount = 6) {
  const database = new Database(':memory:');
  database.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
  for (let id = 1; id <= rowCount; id++) {
    database.prepare(
      'INSERT INTO users (id, name) VALUES (?, ?)',
    ).run(id, `user_${id}`);
  }

  return {
    database,
    async executeOnPartition(_partitionId, sql, params = [], forRead = false) {
      const statement = database.prepare(sql);
      if (forRead || /^\s*SELECT\b/i.test(sql)) {
        return {
          success: true,
          rows: statement.all(...params),
        };
      }
      const info = statement.run(...params);
      return {
        success: true,
        rows: [],
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
      };
    },
    close() {
      database.close();
    },
  };
}

function createIntegrationHarness(options = {}) {
  const sqlite = createSqlitePartitionExecution(options.rowCount || 6);
  const state = {
    tables: [{
      table_id: 'table-1',
      table_name: 'users',
      schema_definition: JSON.stringify(createInitialSchema()),
    }],
    partitions: [{
      partition_id: 'table-1-p1',
      table_id: 'table-1',
    }],
    migrations: [],
    partitionMigrations: [],
    beginCount: 0,
    commitCount: 0,
    rollbackCount: 0,
    cutoverCommitFailuresRemaining: Math.max(
      0,
      Number.isInteger(options.cutoverCommitFailures) ?
        options.cutoverCommitFailures :
        0,
    ),
  };

  const transactionState = {
    active: false,
    sessionId: null,
    tablesSnapshot: [],
    partitionMigrationsSnapshot: [],
  };

  function resetTransactionState() {
    transactionState.active = false;
    transactionState.sessionId = null;
    transactionState.tablesSnapshot = [];
    transactionState.partitionMigrationsSnapshot = [];
  }

  function useTransactionSnapshots(queryOptions) {
    return transactionState.active &&
      queryOptions?.sessionId &&
      queryOptions.sessionId === transactionState.sessionId;
  }

  const sqlCore = {
    queryExecutor: {
      executeOnPartition: async (...args) => sqlite.executeOnPartition(...args),
    },
    async executeQuery(sql, params = [], queryOptions = {}) {
      if (sql === MIGRATION_SQL.SELECT_TABLE_BY_ID) {
        return {success: true, rows: state.tables.filter((row) => row.table_id === params[0])};
      }
      if (sql === MIGRATION_SQL.SELECT_TABLE_BY_NAME) {
        return {success: true, rows: state.tables.filter((row) => row.table_name === params[0])};
      }
      if (sql === MIGRATION_SQL.SELECT_MIGRATIONS_BY_TABLE) {
        return {
          success: true,
          rows: state.migrations
            .filter((row) => row.table_id === params[0])
            .map((row) => ({
              migration_id: row.migration_id,
              status: row.status,
              current_stage: row.current_stage,
            })),
        };
      }
      if (sql === MIGRATION_SQL.SELECT_MIGRATION_BY_ID) {
        return {
          success: true,
          rows: state.migrations.filter((row) => row.migration_id === params[0]),
        };
      }
      if (sql === MIGRATION_SQL.SELECT_PARTITIONS_BY_TABLE) {
        return {
          success: true,
          rows: state.partitions
            .filter((row) => row.table_id === params[0])
            .map((row) => ({partition_id: row.partition_id})),
        };
      }
      if (sql === MIGRATION_SQL.SELECT_PARTITION_MIGRATIONS) {
        return {
          success: true,
          rows: state.partitionMigrations
            .filter((row) => row.migration_id === params[0])
            .map((row) => ({...row})),
        };
      }
      if (sql === MIGRATION_SQL.SELECT_NON_TERMINAL_MIGRATIONS) {
        const terminal = new Set(params.map((value) => String(value || '')));
        return {
          success: true,
          rows: state.migrations
            .filter((row) => !terminal.has(String(row.status || '')))
            .map((row) => ({...row})),
        };
      }
      if (sql === MIGRATION_SQL.INSERT_MIGRATION) {
        state.migrations.push({
          migration_id: params[0],
          table_id: params[1],
          table_name: params[2],
          migration_type: params[3],
          source_schema: params[4],
          target_schema: params[5],
          status: params[6],
          current_stage: params[7],
          error_message: params[8],
          created_at: params[9],
          updated_at: params[10],
          completed_at: params[11],
        });
        return {success: true, changes: 1};
      }
      if (sql === MIGRATION_SQL.INSERT_PARTITION_MIGRATION) {
        state.partitionMigrations.push({
          migration_id: params[0],
          partition_id: params[1],
          status: params[2],
          backfill_cursor: params[3],
          retry_count: params[4],
          error_message: params[5],
          updated_at: params[6],
        });
        return {success: true, changes: 1};
      }
      if (sql === MIGRATION_SQL.UPDATE_MIGRATION_BY_ID) {
        const row = state.migrations.find((entry) => entry.migration_id === params[5]);
        if (!row) {
          return {success: false, error: 'migration missing'};
        }
        row.status = params[0];
        row.current_stage = params[1];
        row.error_message = params[2];
        row.updated_at = params[3];
        row.completed_at = params[4];
        return {success: true, changes: 1};
      }
      if (sql === MIGRATION_SQL.UPDATE_PARTITION_MIGRATION_BY_PK) {
        const writableRows = useTransactionSnapshots(queryOptions) ?
          transactionState.partitionMigrationsSnapshot :
          state.partitionMigrations;
        const row = writableRows.find((entry) =>
          entry.migration_id === params[5] && entry.partition_id === params[6],
        );
        if (!row) {
          return {success: false, error: 'partition migration missing'};
        }
        row.status = params[0];
        row.backfill_cursor = params[1];
        row.retry_count = params[2];
        row.error_message = params[3];
        row.updated_at = params[4];
        return {success: true, changes: 1};
      }
      if (sql === MIGRATION_SQL.UPDATE_TABLE_SCHEMA_BY_ID) {
        const writableRows = useTransactionSnapshots(queryOptions) ?
          transactionState.tablesSnapshot :
          state.tables;
        const row = writableRows.find((entry) => entry.table_id === params[2]);
        if (!row) {
          return {success: false, error: 'table missing'};
        }
        row.schema_definition = params[0];
        return {success: true, changes: 1};
      }
      if (sql === 'BEGIN') {
        state.beginCount += 1;
        transactionState.active = true;
        transactionState.sessionId = queryOptions.sessionId || null;
        transactionState.tablesSnapshot = state.tables.map((row) => ({...row}));
        transactionState.partitionMigrationsSnapshot =
          state.partitionMigrations.map((row) => ({...row}));
        return {success: true};
      }
      if (sql === 'COMMIT') {
        state.commitCount += 1;
        if (state.cutoverCommitFailuresRemaining > 0) {
          state.cutoverCommitFailuresRemaining -= 1;
          return {success: false, error: 'cutover commit failure'};
        }
        if (transactionState.active) {
          state.tables = transactionState.tablesSnapshot.map((row) => ({...row}));
          state.partitionMigrations =
            transactionState.partitionMigrationsSnapshot.map((row) => ({...row}));
        }
        resetTransactionState();
        return {success: true};
      }
      if (sql === 'ROLLBACK') {
        state.rollbackCount += 1;
        resetTransactionState();
        return {success: true};
      }
      return {success: false, error: `Unhandled SQL: ${sql}`};
    },
  };

  const systemTableCache = {
    filter(tableNameArg, predicate) {
      if (tableNameArg === TABLES.PARTITIONS) {
        return state.partitions.filter(predicate).map((row) => ({...row}));
      }
      return [];
    },
  };

  const coordinator = new MigrationCoordinator({
    sqlCore,
    systemTableCache,
    transactionCoordinator: null,
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
    },
    now: () => Date.now(),
  });

  return {
    coordinator,
    sqlite,
    state,
  };
}

test('single-partition migration completes end-to-end', async (t) => {
  const harness = createIntegrationHarness({rowCount: 10});
  try {
    const migrationId = await harness.coordinator.initiateMigration(
      'table-1',
      createAddColumnSpec(11),
    );
    await harness.coordinator.advanceMigration(migrationId);

    const migrationRow = harness.state.migrations.find(
      (row) => row.migration_id === migrationId,
    );
    t.equal(migrationRow.status, MIGRATION_STATUS.COMPLETED);
    t.equal(
      harness.state.partitionMigrations[0].status,
      MIGRATION_STATUS.COMPLETED,
    );

    const rows = harness.sqlite.database.prepare(
      'SELECT age FROM users ORDER BY id',
    ).all();
    t.equal(rows.length, 10);
    t.equal(rows.every((row) => row.age === 11), true);
  } finally {
    harness.sqlite.close();
  }
});

test('concurrent migration on same table is rejected with conflict', async (t) => {
  const harness = createIntegrationHarness({rowCount: 4});
  try {
    await harness.coordinator.initiateMigration(
      'table-1',
      createAddColumnSpec(5),
    );
    await t.rejects(
      harness.coordinator.initiateMigration(
        'table-1',
        createAddColumnSpec(8),
      ),
    );
  } finally {
    harness.sqlite.close();
  }
});

test('migration cancellation succeeds while backfill is active', async (t) => {
  const harness = createIntegrationHarness({rowCount: 120});
  try {
    const migrationId = await harness.coordinator.initiateMigration(
      'table-1',
      createAddColumnSpec(9),
    );
    let scanCount = 0;
    let cancelPromise = null;
    const baseExecute = harness.sqlite.executeOnPartition;
    harness.coordinator.sqlCore.queryExecutor.executeOnPartition =
      async (partitionId, sql, params, forRead) => {
        if (forRead && /SELECT rowid AS row_id/i.test(sql)) {
          scanCount += 1;
          if (scanCount === 1) {
            cancelPromise = harness.coordinator.cancelMigration(migrationId);
          }
        }
        return baseExecute(partitionId, sql, params, forRead);
      };

    await harness.coordinator.advanceMigration(migrationId);
    if (cancelPromise) {
      await cancelPromise;
    }

    const migrationRow = harness.state.migrations.find(
      (row) => row.migration_id === migrationId,
    );
    t.equal(migrationRow.status, MIGRATION_STATUS.CANCELLED);
    t.equal(scanCount > 0, true);
  } finally {
    harness.sqlite.close();
  }
});

test('cutover transaction failure retries and eventually completes', async (t) => {
  const harness = createIntegrationHarness({
    rowCount: 3,
    cutoverCommitFailures: 1,
  });
  try {
    const migrationId = await harness.coordinator.initiateMigration(
      'table-1',
      createAddColumnSpec(13),
    );
    await harness.coordinator.advanceMigration(migrationId);

    const migrationRow = harness.state.migrations.find(
      (row) => row.migration_id === migrationId,
    );
    t.equal(migrationRow.status, MIGRATION_STATUS.COMPLETED);
    t.equal(harness.state.rollbackCount, 1);
    t.equal(harness.state.commitCount, 2);
  } finally {
    harness.sqlite.close();
  }
});
