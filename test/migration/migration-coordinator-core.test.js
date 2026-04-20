import fc from 'fast-check';
import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {
  MIGRATION_SQL,
  MigrationCoordinator,
} from '../../src/migration/migration-coordinator.js';
import {
  MIGRATION_CANCELLABLE_STAGES,
  MIGRATION_DEFAULT,
  MIGRATION_LOG_MSG,
  MIGRATION_STAGE_ORDER,
  MIGRATION_STATUS,
  MIGRATION_TERMINAL_STATUSES,
  MIGRATION_TYPE,
} from '../../src/migration/migration-constants.js';
import {TABLES} from '../../src/constants/tables.js';
import {
  createTopLevelOperationBudget,
  getRemainingBudgetMs,
} from '../../src/control-plane/timeout-budget.js';

function createInitialSchema() {
  return {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'name', type: 'TEXT'},
    ],
  };
}

function createAlterSpec(migrationType, index = 1) {
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

function createSqlitePartitionExecution(options = {}) {
  const database = new Database(':memory:');
  const tableName = options.tableName || 'users';
  database.exec(
    `CREATE TABLE ${tableName} (` +
    'id INTEGER PRIMARY KEY, ' +
    'name TEXT' +
    ')',
  );

  const executeOnPartition = async (_partitionId, sql, params = [], forRead = false) => {
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

function createCoordinatorHarness(options = {}) {
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
    tables: options.tables || [{
      table_id: tableId,
      table_name: tableName,
      schema_definition: JSON.stringify(initialSchema),
    }],
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
    if (transactionState.active &&
        isCutoverSession(queryOptions) &&
        queryOptions?.sessionId === transactionState.sessionId) {
      return transactionState.tablesSnapshot;
    }
    return state.tables;
  }

  function getWritablePartitionMigrations(queryOptions) {
    if (transactionState.active &&
        isCutoverSession(queryOptions) &&
        queryOptions?.sessionId === transactionState.sessionId) {
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
            rows: [
              {row_id: cursor + 1},
              {row_id: cursor + 2},
            ],
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
        const table = state.tables.find((row) => row.table_id === params[0]) || null;
        return {success: true, rows: table ? [{...table}] : []};
      }
      if (sql === MIGRATION_SQL.SELECT_TABLE_BY_NAME) {
        const table = state.tables.find((row) => row.table_name === params[0]) || null;
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
        const row = state.migrations.find((entry) => entry.migration_id === params[0]);
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
        const writableRows = getWritablePartitionMigrations(queryOptions);
        if (transactionState.active &&
            isCutoverSession(queryOptions) &&
            queryOptions.sessionId === transactionState.sessionId &&
            cutoverFailOnPartitionIndex !== null &&
            transactionState.partitionUpdateCount === cutoverFailOnPartitionIndex) {
          return {success: false, error: 'cutover partition update failure'};
        }
        transactionState.partitionUpdateCount += 1;
        const row = writableRows.find((entry) => {
          return entry.migration_id === params[5] && entry.partition_id === params[6];
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
          state.tables = transactionState.tablesSnapshot.map((row) => ({...row}));
          state.partitionMigrations =
            transactionState.partitionMigrationsSnapshot.map((row) => ({...row}));
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

function expectedTransitionAllowed(fromStage, toStage) {
  if (fromStage === toStage) {
    return true;
  }
  if (toStage === MIGRATION_STATUS.FAILED || toStage === MIGRATION_STATUS.CANCELLING) {
    return !MIGRATION_TERMINAL_STATUSES.has(fromStage);
  }
  if (fromStage === MIGRATION_STATUS.CANCELLING && toStage === MIGRATION_STATUS.CANCELLED) {
    return true;
  }
  const fromIndex = MIGRATION_STAGE_ORDER.indexOf(fromStage);
  const toIndex = MIGRATION_STAGE_ORDER.indexOf(toStage);
  if (fromIndex < 0 || toIndex < 0) {
    return false;
  }
  return toIndex > fromIndex;
}

function harnessTableId(stage) {
  return `table-${String(stage).replaceAll('_', '-')}`;
}

function harnessTableName(stage) {
  return `users_${String(stage).replaceAll('_', '-')}`;
}
test('Property 1: Migration record creation completeness', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom(...Object.values(MIGRATION_TYPE)),
      fc.integer({min: 1, max: 1000}),
      async (migrationType, seed) => {
        const harness = createCoordinatorHarness({
          tableId: `table-${seed}`,
          tableName: `users_${seed}`,
          partitions: [{partition_id: `table-${seed}-p1`, table_id: `table-${seed}`}],
        });
        const alterSpec = createAlterSpec(migrationType, seed);
        const migrationId = await harness.coordinator.initiateMigration(
          harness.tableId,
          alterSpec,
        );
        const row = harness.state.migrations.find((entry) => entry.migration_id === migrationId);
        return row &&
          row.table_id === harness.tableId &&
          row.migration_type === migrationType &&
          row.status === MIGRATION_STATUS.PENDING &&
          row.current_stage === MIGRATION_STATUS.PENDING &&
          Number.isFinite(row.created_at) &&
          Number.isFinite(row.updated_at) &&
          typeof row.source_schema === 'string' &&
          typeof row.target_schema === 'string';
      },
    ),
    {numRuns: 10},
  );
  t.pass('migration record creation includes required fields');
});
test('Property 2: Active migration exclusion', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      async (tableId) => {
        const conflictingMigrationId = `m-${tableId}`;
        const harness = createCoordinatorHarness({
          tableId,
          tableName: `users_${tableId.slice(0, 6)}`,
          migrations: [{
            migration_id: conflictingMigrationId,
            table_id: tableId,
            table_name: `users_${tableId.slice(0, 6)}`,
            migration_type: MIGRATION_TYPE.ADD_COLUMN,
            source_schema: JSON.stringify(createInitialSchema()),
            target_schema: JSON.stringify({schema: createInitialSchema()}),
            status: MIGRATION_STATUS.DUAL_WRITE,
            current_stage: MIGRATION_STATUS.DUAL_WRITE,
            error_message: null,
            created_at: 1,
            updated_at: 1,
            completed_at: null,
          }],
        });

        try {
          await harness.coordinator.initiateMigration(
            tableId,
            createAlterSpec(MIGRATION_TYPE.ADD_COLUMN, 1),
          );
          return false;
        } catch (error) {
          return String(error.message || '').includes(conflictingMigrationId);
        }
      },
    ),
    {numRuns: 10},
  );
  t.pass('active migrations are rejected with conflict id');
});
test('Property 3: Partition migration record enumeration', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 20}),
      async (partitionCount) => {
        const tableId = `table-${partitionCount}`;
        const partitions = [];
        for (let index = 0; index < partitionCount; index++) {
          partitions.push({partition_id: `${tableId}-p${index + 1}`, table_id: tableId});
        }
        const harness = createCoordinatorHarness({
          tableId,
          tableName: `users_${partitionCount}`,
          partitions,
        });

        const migrationId = await harness.coordinator.initiateMigration(
          tableId,
          createAlterSpec(MIGRATION_TYPE.ADD_COLUMN, partitionCount),
        );
        const count = harness.state.partitionMigrations.filter((row) => {
          return row.migration_id === migrationId;
        }).length;
        return count === partitionCount;
      },
    ),
    {numRuns: 10},
  );
  t.pass('partition rows are created for every table partition');
});
test('Property 18: Monotonic stage transitions', async (t) => {
  const harness = createCoordinatorHarness();
  await fc.assert(
    fc.property(
      fc.constantFrom(...Object.values(MIGRATION_STATUS)),
      fc.constantFrom(...Object.values(MIGRATION_STATUS)),
      (fromStage, toStage) => {
        const expected = expectedTransitionAllowed(fromStage, toStage);
        return harness.coordinator.isMonotonicTransitionAllowed(fromStage, toStage) === expected;
      },
    ),
    {numRuns: 10},
  );
  t.pass('transition validation enforces monotonic ordering with terminal exceptions');
});
test('Property 20: Timeout budget derivation', async (t) => {
  await fc.assert(
    fc.property(
      fc.integer({min: 100, max: 5000}),
      fc.integer({min: 0, max: 4000}),
      (configuredBudgetMs, elapsedMs) => {
        const nowMs = 100000;
        const startedAtMs = nowMs - elapsedMs;
        const parentBudget = createTopLevelOperationBudget({
          configuredBudgetMs,
          operationName: 'migration_parent',
          startedAtMs,
          now: () => nowMs,
        });

        const harness = createCoordinatorHarness({
          nowValues: [nowMs, nowMs, nowMs],
        });
        const allocation = harness.coordinator.migrationTimeoutPolicy.allocate({
          timeoutBudget: parentBudget,
          now: () => nowMs,
        });
        const childBudget = allocation.budget;

        const remainingBudgetMs = getRemainingBudgetMs(parentBudget, {now: () => nowMs});
        if (!allocation.allowed || !childBudget) {
          return remainingBudgetMs <= 0;
        }
        return childBudget.configuredBudgetMs <= remainingBudgetMs &&
          childBudget.configuredBudgetMs <= configuredBudgetMs;
      },
    ),
    {numRuns: 10},
  );
  t.pass('child budget is derived from remaining parent time');
});
test('Property 4: Dual-write schema shape acceptance', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.boolean(), {minLength: 1, maxLength: 12}),
      async (includeNewColumnFlags) => {
        const sqlite = createSqlitePartitionExecution({tableName: 'users'});
        const harness = createCoordinatorHarness({
          executeOnPartition: sqlite.executeOnPartition,
        });

        try {
          const alterSpec = {
            migrationType: MIGRATION_TYPE.ADD_COLUMN,
            columnName: 'age',
            dataType: 'INTEGER',
            defaultValue: 5,
            sql: 'ALTER TABLE users ADD COLUMN age INTEGER DEFAULT 5',
          };
          const migrationId = await harness.coordinator.initiateMigration(
            harness.tableId,
            alterSpec,
          );
          await harness.coordinator.transitionMigrationStage(
            migrationId,
            MIGRATION_STATUS.DUAL_WRITE,
            'test_dual_write_stage',
          );
          await harness.coordinator.executePartitionSql(
            harness.state.partitions[0].partition_id,
            alterSpec.sql,
            [],
            {forRead: false},
          );

          let nextId = 1;
          for (const includeNewColumn of includeNewColumnFlags) {
            if (includeNewColumn) {
              await harness.coordinator.executePartitionSql(
                harness.state.partitions[0].partition_id,
                'INSERT INTO users (id, name, age) VALUES (?, ?, ?)',
                [nextId, `user_${nextId}`, 50 + nextId],
                {forRead: false},
              );
            } else {
              await harness.coordinator.executePartitionSql(
                harness.state.partitions[0].partition_id,
                'INSERT INTO users (id, name) VALUES (?, ?)',
                [nextId, `user_${nextId}`],
                {forRead: false},
              );
            }
            nextId += 1;
          }

          const queryResult = await harness.coordinator.executePartitionSql(
            harness.state.partitions[0].partition_id,
            'SELECT id, name, age FROM users ORDER BY id',
            [],
            {forRead: true},
          );
          return queryResult.success === true &&
            queryResult.rows.length === includeNewColumnFlags.length;
        } finally {
          sqlite.close();
        }
      },
    ),
    {numRuns: 10},
  );
  t.pass('dual-write accepts both legacy and expanded write shapes');
});
test('Property 5: Dual-write default application and query inclusion', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 20}),
      fc.integer({min: 0, max: 500}),
      async (rowCount, defaultValue) => {
        const sqlite = createSqlitePartitionExecution({tableName: 'users'});
        const harness = createCoordinatorHarness({
          executeOnPartition: sqlite.executeOnPartition,
        });

        try {
          const alterSpec = {
            migrationType: MIGRATION_TYPE.ADD_COLUMN,
            columnName: 'age',
            dataType: 'INTEGER',
            defaultValue,
            sql: `ALTER TABLE users ADD COLUMN age INTEGER DEFAULT ${defaultValue}`,
          };
          const migrationId = await harness.coordinator.initiateMigration(
            harness.tableId,
            alterSpec,
          );
          await harness.coordinator.transitionMigrationStage(
            migrationId,
            MIGRATION_STATUS.DUAL_WRITE,
            'test_dual_write_stage',
          );
          await harness.coordinator.executePartitionSql(
            harness.state.partitions[0].partition_id,
            alterSpec.sql,
            [],
            {forRead: false},
          );

          for (let rowId = 1; rowId <= rowCount; rowId++) {
            await harness.coordinator.executePartitionSql(
              harness.state.partitions[0].partition_id,
              'INSERT INTO users (id, name) VALUES (?, ?)',
              [rowId, `u_${rowId}`],
              {forRead: false},
            );
          }

          const queryResult = await harness.coordinator.executePartitionSql(
            harness.state.partitions[0].partition_id,
            'SELECT age FROM users ORDER BY id',
            [],
            {forRead: true},
          );

          if (queryResult.success !== true || queryResult.rows.length !== rowCount) {
            return false;
          }
          return queryResult.rows.every((row) => row.age === defaultValue);
        } finally {
          sqlite.close();
        }
      },
    ),
    {numRuns: 10},
  );
  t.pass('dual-write writes without new columns persist defaults and remain queryable');
});
test('Property 7: Partition operation retry with backoff and recording', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 0, max: MIGRATION_DEFAULT.MAX_RETRY_COUNT + 2}),
      async (failureCount) => {
        const harness = createCoordinatorHarness();
        harness.coordinator.buildExponentialBackoffDelay = () => 0;

        const migrationId = await harness.coordinator.initiateMigration(
          harness.tableId,
          createAlterSpec(MIGRATION_TYPE.ADD_COLUMN, 1),
        );
        const partitionId = harness.state.partitions[0].partition_id;
        let attempt = 0;
        const operation = async () => {
          attempt += 1;
          if (attempt <= failureCount) {
            throw new Error(`simulated failure ${attempt}`);
          }
          return {success: true};
        };

        let operationSucceeded = false;
        try {
          await harness.coordinator.runPartitionOperationWithRetry({
            migrationId,
            partitionId,
            statusOnFailure: MIGRATION_STATUS.DUAL_WRITE,
            timeoutBudget: null,
            operation,
          });
          operationSucceeded = true;
        } catch (_error) {
          operationSucceeded = false;
        }

        const partitionRow = harness.state.partitionMigrations.find((row) => {
          return row.migration_id === migrationId && row.partition_id === partitionId;
        });
        const expectedFailureAttempts = Math.min(
          failureCount,
          MIGRATION_DEFAULT.MAX_RETRY_COUNT + 1,
        );
        const expectedSuccess = failureCount <= MIGRATION_DEFAULT.MAX_RETRY_COUNT;
        return operationSucceeded === expectedSuccess &&
          partitionRow.retry_count === expectedFailureAttempts;
      },
    ),
    {numRuns: 10},
  );
  t.pass('retry path records retry_count and respects retry budget');
});
test('Property 8: Aggregate partition completion triggers parent transition', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 20}),
      async (partitionCount) => {
        const tableId = `table-parent-${partitionCount}`;
        const partitions = [];
        for (let index = 0; index < partitionCount; index++) {
          partitions.push({partition_id: `${tableId}-p${index + 1}`, table_id: tableId});
        }
        const harness = createCoordinatorHarness({
          tableId,
          tableName: `users_${partitionCount}`,
          partitions,
          executeOnPartition: async (_partitionId, sql, _params, forRead) => {
            if (forRead && /SELECT rowid AS row_id/i.test(sql)) {
              return {success: true, rows: []};
            }
            return {success: true, rows: []};
          },
        });
        const migrationId = await harness.coordinator.initiateMigration(
          tableId,
          createAlterSpec(MIGRATION_TYPE.ADD_COLUMN, partitionCount),
        );
        const createdRow = harness.state.migrations.find(
          (row) => row.migration_id === migrationId,
        );
        await harness.coordinator.executeDualWriteStage(createdRow, null);
        const afterDualWrite = harness.state.migrations.find(
          (row) => row.migration_id === migrationId,
        );
        if (afterDualWrite.status !== MIGRATION_STATUS.DUAL_WRITE_COMPLETE) {
          return false;
        }
        await harness.coordinator.executeBackfillStage(afterDualWrite, null);
        const afterBackfill = harness.state.migrations.find(
          (row) => row.migration_id === migrationId,
        );
        return afterBackfill.status === MIGRATION_STATUS.BACKFILL_COMPLETE;
      },
    ),
    {numRuns: 10},
  );
  t.pass('parent transitions complete once all partition rows reach completion stage');
});
test('Property 9: Backfill batch size enforcement', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 0, max: 600}),
      async (totalRows) => {
        const observedBatchLimits = [];
        const observedBatchSizes = [];
        const harness = createCoordinatorHarness({
          executeOnPartition: async (_partitionId, sql, params, forRead) => {
            if (forRead && /SELECT rowid AS row_id/i.test(sql)) {
              const cursor = Number(params?.[0] || 0);
              const limit = Number(params?.[1] || 0);
              const remaining = Math.max(0, totalRows - cursor);
              const emittedRows = Math.min(remaining, limit);
              observedBatchLimits.push(limit);
              observedBatchSizes.push(emittedRows);
              const rows = [];
              for (let offset = 1; offset <= emittedRows; offset++) {
                rows.push({row_id: cursor + offset});
              }
              return {success: true, rows};
            }
            return {success: true, rows: []};
          },
        });

        const migrationId = await harness.coordinator.initiateMigration(
          harness.tableId,
          createAlterSpec(MIGRATION_TYPE.ADD_COLUMN, 9),
        );
        const migrationRow = harness.state.migrations.find(
          (row) => row.migration_id === migrationId,
        );
        migrationRow.status = MIGRATION_STATUS.DUAL_WRITE_COMPLETE;
        migrationRow.current_stage = MIGRATION_STATUS.DUAL_WRITE_COMPLETE;

        await harness.coordinator.executeBackfillStage(migrationRow, null);

        return observedBatchLimits.every((limit) =>
          limit <= MIGRATION_DEFAULT.BACKFILL_BATCH_SIZE,
        ) && observedBatchSizes.every((size) =>
          size <= MIGRATION_DEFAULT.BACKFILL_BATCH_SIZE,
        );
      },
    ),
    {numRuns: 10},
  );
  t.pass('backfill scan requests and batches respect configured batch size');
});
test('Property 10: Backfill cursor resumption round trip', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 300}),
      fc.integer({min: 0, max: 6}),
      async (totalRows, interruptionBatch) => {
        const buildExecution = (state) => {
          return async (_partitionId, sql, params, forRead) => {
            if (forRead && /SELECT rowid AS row_id/i.test(sql)) {
              if (!state.interrupted &&
                state.completedBatches === interruptionBatch) {
                state.interrupted = true;
                throw new Error('simulated interruption');
              }
              const cursor = Number(params?.[0] || 0);
              const limit = Number(params?.[1] || MIGRATION_DEFAULT.BACKFILL_BATCH_SIZE);
              const remaining = Math.max(0, totalRows - cursor);
              const emittedRows = Math.min(remaining, limit);
              const rows = [];
              for (let offset = 1; offset <= emittedRows; offset++) {
                rows.push({row_id: cursor + offset});
              }
              return {success: true, rows};
            }

            if (/^\s*UPDATE\b/i.test(sql)) {
              const cursor = Number(params[params.length - 2] || 0);
              const lastRowId = Number(params[params.length - 1] || 0);
              for (let rowId = cursor + 1; rowId <= lastRowId; rowId++) {
                state.updatedRowIds.add(rowId);
              }
              state.completedBatches += 1;
            }
            return {success: true, rows: []};
          };
        };

        const uninterruptedState = {
          updatedRowIds: new Set(),
          completedBatches: 0,
          interrupted: true,
        };
        const uninterruptedHarness = createCoordinatorHarness({
          executeOnPartition: buildExecution(uninterruptedState),
        });
        const interruptedState = {
          updatedRowIds: new Set(),
          completedBatches: 0,
          interrupted: false,
        };
        const interruptedHarness = createCoordinatorHarness({
          executeOnPartition: buildExecution(interruptedState),
        });

        const alterSpec = createAlterSpec(MIGRATION_TYPE.ADD_COLUMN, 10);
        const migrationIdA = await uninterruptedHarness.coordinator.initiateMigration(
          uninterruptedHarness.tableId,
          alterSpec,
        );
        const migrationRowA = uninterruptedHarness.state.migrations.find(
          (row) => row.migration_id === migrationIdA,
        );
        const partitionRowA = uninterruptedHarness.state.partitionMigrations.find(
          (row) => row.migration_id === migrationIdA,
        );
        await uninterruptedHarness.coordinator.runBackfillPartitionLoop(
          migrationRowA,
          partitionRowA,
          null,
        );

        const migrationIdB = await interruptedHarness.coordinator.initiateMigration(
          interruptedHarness.tableId,
          alterSpec,
        );
        const migrationRowB = interruptedHarness.state.migrations.find(
          (row) => row.migration_id === migrationIdB,
        );
        let partitionRowB = interruptedHarness.state.partitionMigrations.find(
          (row) => row.migration_id === migrationIdB,
        );

        try {
          await interruptedHarness.coordinator.runBackfillPartitionLoop(
            migrationRowB,
            partitionRowB,
            null,
          );
        } catch (_error) {
          // Expected interruption path.
        }

        partitionRowB = interruptedHarness.state.partitionMigrations.find(
          (row) => row.migration_id === migrationIdB,
        );
        await interruptedHarness.coordinator.runBackfillPartitionLoop(
          migrationRowB,
          partitionRowB,
          null,
        );

        const uninterruptedRows = [...uninterruptedState.updatedRowIds].sort((a, b) => a - b);
        const resumedRows = [...interruptedState.updatedRowIds].sort((a, b) => a - b);
        return JSON.stringify(uninterruptedRows) === JSON.stringify(resumedRows);
      },
    ),
    {numRuns: 10},
  );
  t.pass('backfill cursor resumption converges to uninterrupted final row set');
});
test('Property 12: Atomic cutover via distributed transaction', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 10}),
      fc.boolean(),
      async (partitionCount, injectPartitionFailure) => {
        const tableId = `table-cutover-${partitionCount}-${injectPartitionFailure ? 1 : 0}`;
        const tableName = `users_cutover_${partitionCount}`;
        const partitions = [];
        for (let index = 0; index < partitionCount; index++) {
          partitions.push({
            partition_id: `${tableId}-p${index + 1}`,
            table_id: tableId,
          });
        }
        const alterSpec = createAlterSpec(MIGRATION_TYPE.ADD_COLUMN, 12);
        const targetSchema = {
          columns: [
            {name: 'id', type: 'TEXT', primaryKey: true},
            {name: 'name', type: 'TEXT'},
            {name: alterSpec.columnName, type: alterSpec.dataType},
          ],
        };
        const migrationId = `migration-cutover-${partitionCount}`;
        const harness = createCoordinatorHarness({
          tableId,
          tableName,
          partitions,
          migrations: [{
            migration_id: migrationId,
            table_id: tableId,
            table_name: tableName,
            migration_type: alterSpec.migrationType,
            source_schema: JSON.stringify(createInitialSchema()),
            target_schema: JSON.stringify({
              schema: targetSchema,
              alterSpec,
            }),
            status: MIGRATION_STATUS.BACKFILL_COMPLETE,
            current_stage: MIGRATION_STATUS.BACKFILL_COMPLETE,
            error_message: null,
            created_at: 1,
            updated_at: 1,
            completed_at: null,
          }],
          partitionMigrations: partitions.map((partition) => ({
            migration_id: migrationId,
            partition_id: partition.partition_id,
            status: MIGRATION_STATUS.BACKFILL_COMPLETE,
            backfill_cursor: '8',
            retry_count: 0,
            error_message: null,
            updated_at: 1,
          })),
          cutoverFailOnPartitionIndex: injectPartitionFailure ?
            Math.floor(partitionCount / 2) :
            null,
        });

        const migrationRow = harness.state.migrations[0];
        const originalTableSchema = harness.state.tables[0].schema_definition;

        try {
          await harness.coordinator.executeCutoverTransaction(
            migrationRow,
            harness.state.partitionMigrations,
          );
          if (injectPartitionFailure) {
            return false;
          }
        } catch (_error) {
          if (!injectPartitionFailure) {
            return false;
          }
          return harness.state.tables[0].schema_definition === originalTableSchema &&
            harness.state.partitionMigrations.every((row) =>
              row.status === MIGRATION_STATUS.BACKFILL_COMPLETE,
            ) &&
            harness.state.rollbackCount >= 1;
        }

        return harness.state.tables[0].schema_definition ===
          JSON.stringify(targetSchema) &&
          harness.state.partitionMigrations.every((row) =>
            row.status === MIGRATION_STATUS.COMPLETED,
          ) &&
          harness.state.commitCount === 1;
      },
    ),
    {numRuns: 10},
  );
  t.pass('cutover updates table schema and partition rows atomically');
});
test('Property 21: Cancellation transitions and stops new work', async (t) => {
  const cancellableStages = [...MIGRATION_CANCELLABLE_STAGES];
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom(...cancellableStages),
      async (stage) => {
        const migrationId = `migration-cancel-${stage}`;
        const alterSpec = createAlterSpec(MIGRATION_TYPE.ADD_COLUMN, 21);
        let scanCount = 0;
        const harness = createCoordinatorHarness({
          migrations: [{
            migration_id: migrationId,
            table_id: 'table-1',
            table_name: 'users',
            migration_type: alterSpec.migrationType,
            source_schema: JSON.stringify(createInitialSchema()),
            target_schema: JSON.stringify({
              schema: createInitialSchema(),
              alterSpec,
            }),
            status: stage,
            current_stage: stage,
            error_message: null,
            created_at: 1,
            updated_at: 1,
            completed_at: null,
          }],
          partitionMigrations: [{
            migration_id: migrationId,
            partition_id: 'table-1-p1',
            status: MIGRATION_STATUS.BACKFILL,
            backfill_cursor: null,
            retry_count: 0,
            error_message: null,
            updated_at: 1,
          }],
          executeOnPartition: async (_partitionId, sql, _params, forRead) => {
            if (forRead && /SELECT rowid AS row_id/i.test(sql)) {
              scanCount += 1;
              return {success: true, rows: [{row_id: 1}]};
            }
            return {success: true, rows: []};
          },
        });

        harness.coordinator.cancellationRequestedByMigrationId.add(migrationId);
        const backfillResult = await harness.coordinator.runBackfillPartitionLoop(
          harness.state.migrations[0],
          harness.state.partitionMigrations[0],
          null,
        );
        harness.coordinator.cancellationRequestedByMigrationId.delete(migrationId);

        const cancelResult = await harness.coordinator.cancelMigration(migrationId);
        const migrationRow = harness.state.migrations.find(
          (row) => row.migration_id === migrationId,
        );
        const workflow =
          harness.coordinator.workflowCoordinator.getWorkflowById(migrationId);
        const hasCancellingTransition =
          Array.isArray(workflow?.transitionHistory) &&
          workflow.transitionHistory.some((entry) =>
            entry.nextStep === MIGRATION_STATUS.CANCELLING,
          );

        return backfillResult?.cancelled === true &&
          scanCount === 0 &&
          cancelResult.success === true &&
          migrationRow?.status === MIGRATION_STATUS.CANCELLED &&
          hasCancellingTransition;
      },
    ),
    {numRuns: 10},
  );
  t.pass('cancellation transitions and prevents new backfill batch scans');
});
test('Property 23: Cancel rejection for post-cutover migrations', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom(
        MIGRATION_STATUS.CUTOVER_PENDING,
        MIGRATION_STATUS.COMPLETED,
      ),
      async (stage) => {
        const migrationId = `migration-post-cutover-${stage}`;
        const alterSpec = createAlterSpec(MIGRATION_TYPE.ADD_COLUMN, 23);
        const harness = createCoordinatorHarness({
          migrations: [{
            migration_id: migrationId,
            table_id: 'table-1',
            table_name: 'users',
            migration_type: alterSpec.migrationType,
            source_schema: JSON.stringify(createInitialSchema()),
            target_schema: JSON.stringify({
              schema: createInitialSchema(),
              alterSpec,
            }),
            status: stage,
            current_stage: stage,
            error_message: null,
            created_at: 1,
            updated_at: 1,
            completed_at: stage === MIGRATION_STATUS.COMPLETED ? 2 : null,
          }],
          partitionMigrations: [{
            migration_id: migrationId,
            partition_id: 'table-1-p1',
            status: stage,
            backfill_cursor: null,
            retry_count: 0,
            error_message: null,
            updated_at: 1,
          }],
        });

        try {
          await harness.coordinator.cancelMigration(migrationId);
          return false;
        } catch (error) {
          return String(error.message || '').includes(stage);
        }
      },
    ),
    {numRuns: 10},
  );
  t.pass('cancel requests reject once migrations reach post-cutover stages');
});
test('initiation supports all migration types', async (t) => {
  for (const migrationType of Object.values(MIGRATION_TYPE)) {
    const harness = createCoordinatorHarness({
      tableId: `table-${migrationType}`,
      tableName: `users_${migrationType}`,
      partitions: [{partition_id: `table-${migrationType}-p1`, table_id: `table-${migrationType}`}],
    });
    const migrationId = await harness.coordinator.initiateMigration(
      harness.tableId,
      createAlterSpec(migrationType, 1),
    );
    t.ok(migrationId, `initiated migration type ${migrationType}`);
  }
});

test('duplicate active migration on same table is rejected', async (t) => {
  const harness = createCoordinatorHarness();
  await harness.coordinator.initiateMigration(
    harness.tableId,
    createAlterSpec(MIGRATION_TYPE.ADD_COLUMN, 1),
  );
  await t.rejects(
    harness.coordinator.initiateMigration(
      harness.tableId,
      createAlterSpec(MIGRATION_TYPE.ADD_COLUMN, 2),
    ),
  );
});

test('cancel accepts each cancellable stage', async (t) => {
  const alterSpec = createAlterSpec(MIGRATION_TYPE.ADD_COLUMN, 31);
  for (const stage of MIGRATION_CANCELLABLE_STAGES) {
    const migrationId = `migration-cancellable-${stage}`;
    const harness = createCoordinatorHarness({
      migrations: [{
        migration_id: migrationId,
        table_id: harnessTableId(stage),
        table_name: harnessTableName(stage),
        migration_type: alterSpec.migrationType,
        source_schema: JSON.stringify(createInitialSchema()),
        target_schema: JSON.stringify({
          schema: createInitialSchema(),
          alterSpec,
        }),
        status: stage,
        current_stage: stage,
        error_message: null,
        created_at: 1,
        updated_at: 1,
        completed_at: null,
      }],
      tables: [{
        table_id: harnessTableId(stage),
        table_name: harnessTableName(stage),
        schema_definition: JSON.stringify(createInitialSchema()),
      }],
      partitions: [{
        partition_id: `${harnessTableId(stage)}-p1`,
        table_id: harnessTableId(stage),
      }],
      partitionMigrations: [{
        migration_id: migrationId,
        partition_id: `${harnessTableId(stage)}-p1`,
        status: stage,
        backfill_cursor: null,
        retry_count: 0,
        error_message: null,
        updated_at: 1,
      }],
    });
    const result = await harness.coordinator.cancelMigration(migrationId);
    t.equal(result.success, true, `cancel succeeds for stage ${stage}`);
    const row = harness.state.migrations.find(
      (entry) => entry.migration_id === migrationId,
    );
    t.equal(row.status, MIGRATION_STATUS.CANCELLED);
  }
});

test('cancel rejects cutover_pending and completed stages', async (t) => {
  const alterSpec = createAlterSpec(MIGRATION_TYPE.ADD_COLUMN, 32);
  for (const stage of [MIGRATION_STATUS.CUTOVER_PENDING, MIGRATION_STATUS.COMPLETED]) {
    const migrationId = `migration-noncancellable-${stage}`;
    const harness = createCoordinatorHarness({
      migrations: [{
        migration_id: migrationId,
        table_id: 'table-1',
        table_name: 'users',
        migration_type: alterSpec.migrationType,
        source_schema: JSON.stringify(createInitialSchema()),
        target_schema: JSON.stringify({
          schema: createInitialSchema(),
          alterSpec,
        }),
        status: stage,
        current_stage: stage,
        error_message: null,
        created_at: 1,
        updated_at: 1,
        completed_at: stage === MIGRATION_STATUS.COMPLETED ? 2 : null,
      }],
      partitionMigrations: [{
        migration_id: migrationId,
        partition_id: 'table-1-p1',
        status: stage,
        backfill_cursor: null,
        retry_count: 0,
        error_message: null,
        updated_at: 1,
      }],
    });

    await t.rejects(
      harness.coordinator.cancelMigration(migrationId),
      `rejects stage ${stage}`,
    );
  }
});

test('cutover failure keeps migration in cutover_pending for retry', async (t) => {
  const alterSpec = createAlterSpec(MIGRATION_TYPE.ADD_COLUMN, 33);
  const migrationId = 'migration-cutover-retry';
  const harness = createCoordinatorHarness({
    cutoverCommitFailures: 1,
    migrations: [{
      migration_id: migrationId,
      table_id: 'table-1',
      table_name: 'users',
      migration_type: alterSpec.migrationType,
      source_schema: JSON.stringify(createInitialSchema()),
      target_schema: JSON.stringify({
        schema: {
          columns: [
            {name: 'id', type: 'TEXT', primaryKey: true},
            {name: 'name', type: 'TEXT'},
            {name: alterSpec.columnName, type: alterSpec.dataType},
          ],
        },
        alterSpec,
      }),
      status: MIGRATION_STATUS.BACKFILL_COMPLETE,
      current_stage: MIGRATION_STATUS.BACKFILL_COMPLETE,
      error_message: null,
      created_at: 1,
      updated_at: 1,
      completed_at: null,
    }],
    partitionMigrations: [{
      migration_id: migrationId,
      partition_id: 'table-1-p1',
      status: MIGRATION_STATUS.BACKFILL_COMPLETE,
      backfill_cursor: '4',
      retry_count: 0,
      error_message: null,
      updated_at: 1,
    }],
  });
  const migrationRow = harness.state.migrations[0];

  await harness.coordinator.executeCutoverStage(migrationRow, null);

  const finalRow = harness.state.migrations[0];
  const workflow =
    harness.coordinator.workflowCoordinator.getWorkflowById(migrationId);
  const failedTransition = workflow.transitionHistory.find((entry) =>
    entry.nextStep === MIGRATION_STATUS.FAILED,
  );
  t.equal(finalRow.status, MIGRATION_STATUS.COMPLETED);
  t.equal(harness.state.rollbackCount, 1);
  t.equal(harness.state.commitCount, 2);
  t.equal(Boolean(failedTransition), false);
});

test('durable transition persistence records previous/next stage, reason, timestamp',
  async (t) => {
    const harness = createCoordinatorHarness();
    const migrationId = await harness.coordinator.initiateMigration(
      harness.tableId,
      createAlterSpec(MIGRATION_TYPE.ADD_COLUMN, 34),
    );

    await harness.coordinator.transitionMigrationStage(
      migrationId,
      MIGRATION_STATUS.DUAL_WRITE,
      'test_transition_reason',
    );

    const workflow =
      harness.coordinator.workflowCoordinator.getWorkflowById(migrationId);
    const transition = workflow.transitionHistory[0];
    t.equal(transition.previousStep, MIGRATION_STATUS.PENDING);
    t.equal(transition.nextStep, MIGRATION_STATUS.DUAL_WRITE);
    t.equal(transition.reason, 'test_transition_reason');
    t.equal(Number.isFinite(transition.timestamp), true);
    t.equal(transition.previous_stage, MIGRATION_STATUS.PENDING);
    t.equal(transition.next_stage, MIGRATION_STATUS.DUAL_WRITE);
  });

test('stage transition emits structured migration log entry', async (t) => {
  const logEntries = [];
  const harness = createCoordinatorHarness({
    logger: {
      info(message, payload) {
        logEntries.push({message, payload});
      },
      warn() {},
      error() {},
      debug() {},
    },
  });
  const migrationId = await harness.coordinator.initiateMigration(
    harness.tableId,
    createAlterSpec(MIGRATION_TYPE.ADD_COLUMN, 35),
  );

  await harness.coordinator.transitionMigrationStage(
    migrationId,
    MIGRATION_STATUS.DUAL_WRITE,
    'log_test_transition',
  );

  const transitionLog = logEntries.find((entry) =>
    entry.message === MIGRATION_LOG_MSG.STAGE_TRANSITION &&
    entry.payload?.migration_id === migrationId &&
    entry.payload?.previous_stage === MIGRATION_STATUS.PENDING &&
    entry.payload?.next_stage === MIGRATION_STATUS.DUAL_WRITE &&
    entry.payload?.reason === 'log_test_transition',
  );
  t.equal(Boolean(transitionLog), true);
});

test('partition migration record count matches 1/3/5 partitions', async (t) => {
  for (const partitionCount of [1, 3, 5]) {
    const partitions = [];
    for (let index = 0; index < partitionCount; index++) {
      partitions.push({partition_id: `table-${partitionCount}-p${index + 1}`, table_id: `table-${partitionCount}`});
    }
    const harness = createCoordinatorHarness({
      tableId: `table-${partitionCount}`,
      tableName: `users_${partitionCount}`,
      partitions,
    });

    const migrationId = await harness.coordinator.initiateMigration(
      harness.tableId,
      createAlterSpec(MIGRATION_TYPE.ADD_COLUMN, partitionCount),
    );
    const rows = harness.state.partitionMigrations.filter((row) => row.migration_id === migrationId);
    t.equal(rows.length, partitionCount, `created ${partitionCount} partition rows`);
  }
});

test('recovery resumes from persisted stage without re-running completed stages', async (t) => {
  const harness = createCoordinatorHarness({
    migrations: [{
      migration_id: 'migration-1',
      table_id: 'table-1',
      table_name: 'users',
      migration_type: MIGRATION_TYPE.ADD_COLUMN,
      source_schema: JSON.stringify(createInitialSchema()),
      target_schema: JSON.stringify({
        schema: createInitialSchema(),
        alterSpec: createAlterSpec(MIGRATION_TYPE.ADD_COLUMN, 1),
      }),
      status: MIGRATION_STATUS.BACKFILL_COMPLETE,
      current_stage: MIGRATION_STATUS.BACKFILL_COMPLETE,
      error_message: null,
      created_at: 1,
      updated_at: 1,
      completed_at: null,
    }],
    partitionMigrations: [{
      migration_id: 'migration-1',
      partition_id: 'table-1-p1',
      status: MIGRATION_STATUS.BACKFILL_COMPLETE,
      backfill_cursor: '10',
      retry_count: 0,
      error_message: null,
      updated_at: 1,
    }],
  });

  let dualWriteCalled = 0;
  let backfillCalled = 0;
  let cutoverCalled = 0;
  harness.coordinator.executeDualWriteStage = async () => {
    dualWriteCalled += 1;
  };
  harness.coordinator.executeBackfillStage = async () => {
    backfillCalled += 1;
  };
  harness.coordinator.executeCutoverStage = async () => {
    cutoverCalled += 1;
  };

  const recoveryResult = await harness.coordinator.recoverMigrations();
  t.equal(recoveryResult.recovered, 1);
  t.equal(dualWriteCalled, 0);
  t.equal(backfillCalled, 0);
  t.equal(cutoverCalled, 1);
});

test('retry exhaustion transitions migration to failed with error', async (t) => {
  const harness = createCoordinatorHarness({
    executeOnPartition: async () => ({
      success: false,
      error: 'partition apply failed',
    }),
  });
  const migrationId = await harness.coordinator.initiateMigration(
    harness.tableId,
    createAlterSpec(MIGRATION_TYPE.ADD_COLUMN, 1),
  );

  await harness.coordinator.advanceMigration(migrationId);
  const row = harness.state.migrations.find((entry) => entry.migration_id === migrationId);
  t.equal(row.status, MIGRATION_STATUS.FAILED);
  t.match(row.error_message, /partition apply failed|retry/i);
  t.ok(row.updated_at >= row.created_at);
});
