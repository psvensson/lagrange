import Database from 'better-sqlite3';
import {
  MIGRATION_SQL,
  MigrationCoordinator,
} from '../../src/migration/migration-coordinator.js';
import {
  MIGRATION_STAGE_ORDER,
  MIGRATION_STATUS,
  MIGRATION_TERMINAL_STATUSES,
  MIGRATION_TYPE,
} from '../../src/migration/migration-constants.js';
import {TABLES} from '../../src/constants/tables.js';

export function createInitialSchema() {
  return {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'name', type: 'TEXT'},
    ],
  };
}

export function createAlterSpec(migrationType, index = 1) {
  const columnName = `col_${index}`;
  if (migrationType === MIGRATION_TYPE.ADD_COLUMN) {
    return {
      migrationType,
      columnName,
      dataType: 'TEXT',
      defaultValue: `v_${index}`,
      sql: `ALTER TABLE users ADD COLUMN ${columnName} TEXT`,
    };
  }
  if (migrationType === MIGRATION_TYPE.DROP_COLUMN) {
    return {
      migrationType,
      columnName: 'name',
      sql: 'ALTER TABLE users DROP COLUMN name',
    };
  }
  if (migrationType === MIGRATION_TYPE.RENAME_COLUMN) {
    return {
      migrationType,
      columnName: 'name',
      newColumnName: `renamed_${index}`,
      sql: `ALTER TABLE users RENAME COLUMN name TO renamed_${index}`,
    };
  }
  return {
    migrationType,
    columnName: 'name',
    dataType: 'INTEGER',
    sql: 'ALTER TABLE users ALTER COLUMN name TYPE INTEGER',
  };
}

export function createSqlitePartitionExecution(options = {}) {
  const database = new Database(':memory:');
  const tableName = options.tableName || 'users';
  database.exec(
    `CREATE TABLE ${tableName} (` +
      'id INTEGER PRIMARY KEY, ' +
      'name TEXT' +
      ')',
  );

  const executeOnPartition = async (
    _partitionId,
    sql,
    params = [],
    forRead = false,
  ) => {
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
  };

  return {
    database,
    executeOnPartition,
    close: () => database.close(),
  };
}

export function createCoordinatorHarness(options = {}) {
  const initialSchema = options.initialSchema || createInitialSchema();
  const tableId = options.tableId || 'table-1';
  const tableName = options.tableName || 'users';
  const partitions = options.partitions || [
    {partition_id: `${tableId}-p1`, table_id: tableId},
  ];
  const nowValues = Array.isArray(options.nowValues) ? options.nowValues : null;
  let nowCallCount = 0;
  const now = () => {
    if (nowValues && nowCallCount < nowValues.length) {
      return nowValues[nowCallCount++];
    }
    return 1000 + nowCallCount++;
  };

  const state = {
    tables: options.tables || [
      {
        table_id: tableId,
        table_name: tableName,
        schema_definition: JSON.stringify(initialSchema),
      },
    ],
    migrations: options.migrations ?
      options.migrations.map((row) => ({...row})) :
      [],
    partitionMigrations: options.partitionMigrations ?
      options.partitionMigrations.map((row) => ({...row})) :
      [],
    partitions: partitions.map((row) => ({...row})),
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
  const cutoverFailOnPartitionIndex =
    Number.isInteger(options.cutoverFailOnPartitionIndex) &&
    options.cutoverFailOnPartitionIndex >= 0 ?
      options.cutoverFailOnPartitionIndex :
      null;
  const transactionState = {
    active: false,
    sessionId: null,
    tablesSnapshot: [],
    partitionMigrationsSnapshot: [],
    partitionUpdateCount: 0,
  };

  function resetTransactionState() {
    transactionState.active = false;
    transactionState.sessionId = null;
    transactionState.tablesSnapshot = [];
    transactionState.partitionMigrationsSnapshot = [];
    transactionState.partitionUpdateCount = 0;
  }

  function isCutoverSession(queryOptions) {
    const sessionId = String(queryOptions?.sessionId || '');
    return sessionId.startsWith('schema-migration-cutover-');
  }

  function getWritableTables(queryOptions) {
    if (
      transactionState.active &&
      isCutoverSession(queryOptions) &&
      queryOptions?.sessionId === transactionState.sessionId
    ) {
      return transactionState.tablesSnapshot;
    }
    return state.tables;
  }

  function getWritablePartitionMigrations(queryOptions) {
    if (
      transactionState.active &&
      isCutoverSession(queryOptions) &&
      queryOptions?.sessionId === transactionState.sessionId
    ) {
      return transactionState.partitionMigrationsSnapshot;
    }
    return state.partitionMigrations;
  }

  const partitionExecution =
    typeof options.executeOnPartition === 'function' ?
      options.executeOnPartition :
      async (_partitionId, sql, params, forRead) => {
        if (forRead && /SELECT rowid AS row_id/i.test(sql)) {
          const cursor = Number(params?.[0] || 0);
          if (cursor >= 3) {
            return {success: true, rows: []};
          }
          return {
            success: true,
            rows: [{row_id: cursor + 1}, {row_id: cursor + 2}],
          };
        }
        return {success: true, rows: []};
      };

  const sqlCore = {
    queryExecutor: {
      executeOnPartition: (...args) => partitionExecution(...args),
    },
    async executeQuery(sql, params = [], queryOptions = {}) {
      if (sql === MIGRATION_SQL.SELECT_TABLE_BY_ID) {
        const table =
          state.tables.find((row) => row.table_id === params[0]) || null;
        return {success: true, rows: table ? [{...table}] : []};
      }
      if (sql === MIGRATION_SQL.SELECT_TABLE_BY_NAME) {
        const table =
          state.tables.find((row) => row.table_name === params[0]) || null;
        return {success: true, rows: table ? [{...table}] : []};
      }
      if (sql === MIGRATION_SQL.SELECT_MIGRATIONS_BY_TABLE) {
        const rows = state.migrations
          .filter((row) => row.table_id === params[0])
          .map((row) => ({
            migration_id: row.migration_id,
            status: row.status,
            current_stage: row.current_stage,
          }));
        return {success: true, rows};
      }
      if (sql === MIGRATION_SQL.SELECT_MIGRATION_BY_ID) {
        const row = state.migrations.find(
          (entry) => entry.migration_id === params[0],
        );
        return {success: true, rows: row ? [{...row}] : []};
      }
      if (sql === MIGRATION_SQL.SELECT_PARTITIONS_BY_TABLE) {
        const rows = state.partitions
          .filter((row) => row.table_id === params[0])
          .map((row) => ({partition_id: row.partition_id}));
        return {success: true, rows};
      }
      if (sql === MIGRATION_SQL.SELECT_PARTITION_MIGRATIONS) {
        const rows = state.partitionMigrations
          .filter((row) => row.migration_id === params[0])
          .sort((a, b) => (a.partition_id < b.partition_id ? -1 : 1))
          .map((row) => ({...row}));
        return {success: true, rows};
      }
      if (sql === MIGRATION_SQL.SELECT_NON_TERMINAL_MIGRATIONS) {
        const terminal = new Set(params.map((value) => String(value || '')));
        const rows = state.migrations
          .filter((row) => !terminal.has(String(row.status || '')))
          .map((row) => ({...row}));
        return {success: true, rows};
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
        const row = state.migrations.find(
          (entry) => entry.migration_id === params[5],
        );
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
        const writableRows = getWritablePartitionMigrations(queryOptions);
        if (
          transactionState.active &&
          isCutoverSession(queryOptions) &&
          queryOptions.sessionId === transactionState.sessionId &&
          cutoverFailOnPartitionIndex !== null &&
          transactionState.partitionUpdateCount === cutoverFailOnPartitionIndex
        ) {
          return {success: false, error: 'cutover partition update failure'};
        }
        transactionState.partitionUpdateCount += 1;
        const row = writableRows.find((entry) => {
          return (
            entry.migration_id === params[5] && entry.partition_id === params[6]
          );
        });
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
        const writableRows = getWritableTables(queryOptions);
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
        transactionState.partitionUpdateCount = 0;
        return {success: true};
      }
      if (sql === 'COMMIT') {
        state.commitCount += 1;
        if (state.cutoverCommitFailuresRemaining > 0) {
          state.cutoverCommitFailuresRemaining -= 1;
          return {success: false, error: 'cutover commit failure'};
        }
        if (transactionState.active) {
          state.tables = transactionState.tablesSnapshot.map((row) => ({
            ...row,
          }));
          state.partitionMigrations =
            transactionState.partitionMigrationsSnapshot.map((row) => ({
              ...row,
            }));
          resetTransactionState();
        }
        return {success: true};
      }
      if (sql === 'ROLLBACK') {
        state.rollbackCount += 1;
        resetTransactionState();
        return {success: true};
      }
      return {success: false, error: `Unhandled SQL in test harness: ${sql}`};
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

  const logger = options.logger || {
    info() {},
    warn() {},
    error() {},
    debug() {},
  };

  const coordinator = new MigrationCoordinator({
    sqlCore,
    systemTableCache,
    transactionCoordinator: null,
    logger,
    now,
  });

  return {
    coordinator,
    state,
    tableId,
    tableName,
    now,
  };
}

export function expectedTransitionAllowed(fromStage, toStage) {
  if (fromStage === toStage) {
    return true;
  }
  if (
    toStage === MIGRATION_STATUS.FAILED ||
    toStage === MIGRATION_STATUS.CANCELLING
  ) {
    return !MIGRATION_TERMINAL_STATUSES.has(fromStage);
  }
  if (
    fromStage === MIGRATION_STATUS.CANCELLING &&
    toStage === MIGRATION_STATUS.CANCELLED
  ) {
    return true;
  }
  const fromIndex = MIGRATION_STAGE_ORDER.indexOf(fromStage);
  const toIndex = MIGRATION_STAGE_ORDER.indexOf(toStage);
  if (fromIndex < 0 || toIndex < 0) {
    return false;
  }
  return toIndex > fromIndex;
}

export function harnessTableId(stage) {
  return `table-${String(stage).replaceAll('_', '-')}`;
}

export function harnessTableName(stage) {
  return `users_${String(stage).replaceAll('_', '-')}`;
}
