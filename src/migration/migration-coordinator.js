import {randomUUID} from 'node:crypto';
import {TABLES} from '../constants/index.js';
import {DurableWorkflowCoordinator} from '../workflow/durable-workflow-coordinator.js';
import {OperationLane} from '../workflow/operation-lane.js';
import {TimeoutPolicy} from '../workflow/timeout-policy.js';
import {WorkflowStepRunner} from '../workflow/workflow-step-runner.js';
import {
  MIGRATION_CANCELLABLE_STAGES,
  MIGRATION_COLUMN,
  MIGRATION_DEFAULT,
  MIGRATION_ERROR_MSG,
  MIGRATION_LOG_MSG,
  MIGRATION_PARTITION_OPERATION,
  MIGRATION_STAGE_ORDER,
  MIGRATION_STATUS,
  MIGRATION_TERMINAL_STATUSES,
  MIGRATION_TYPE,
} from './migration-constants.js';

const PARTITION_WRITE_DEFAULT_OPTIONS = Object.freeze({
  FOR_READ: false,
  PREFER_LEADER: true,
  PREFER_SAME_LATENCY_GROUP: false,
});

const PARTITION_READ_DEFAULT_OPTIONS = Object.freeze({
  FOR_READ: true,
  PREFER_LEADER: true,
  PREFER_SAME_LATENCY_GROUP: false,
});

const MIGRATION_STAGE_REASON = Object.freeze({
  INITIATE: 'migration_initiated',
  DUAL_WRITE_START: 'dual_write_start',
  DUAL_WRITE_COMPLETE: 'dual_write_complete',
  BACKFILL_START: 'backfill_start',
  BACKFILL_COMPLETE: 'backfill_complete',
  CUTOVER_PENDING: 'cutover_pending',
  CUTOVER_COMPLETE: 'cutover_complete',
  FAILURE: 'migration_failed',
  CANCELLING: 'migration_cancelling',
  CANCELLED: 'migration_cancelled',
});

const MIGRATION_SQL = Object.freeze({
  SELECT_TABLE_BY_ID:
    `SELECT table_id, table_name, schema_definition FROM ${TABLES.TABLES} ` +
    'WHERE table_id = ? LIMIT 1',
  SELECT_TABLE_BY_NAME:
    `SELECT table_id, table_name, schema_definition FROM ${TABLES.TABLES} ` +
    'WHERE table_name = ? LIMIT 1',
  SELECT_MIGRATION_BY_ID:
    `SELECT * FROM ${TABLES.SCHEMA_MIGRATIONS} ` +
    'WHERE migration_id = ? LIMIT 1',
  SELECT_MIGRATIONS_BY_TABLE:
    `SELECT migration_id, status, current_stage FROM ${TABLES.SCHEMA_MIGRATIONS} ` +
    'WHERE table_id = ?',
  SELECT_PARTITIONS_BY_TABLE:
    `SELECT partition_id FROM ${TABLES.PARTITIONS} WHERE table_id = ?`,
  SELECT_PARTITION_MIGRATIONS:
    `SELECT * FROM ${TABLES.SCHEMA_MIGRATION_PARTITIONS} ` +
    'WHERE migration_id = ? ORDER BY partition_id',
  SELECT_NON_TERMINAL_MIGRATIONS:
    `SELECT * FROM ${TABLES.SCHEMA_MIGRATIONS} ` +
    'WHERE status NOT IN (?, ?, ?)',
  INSERT_MIGRATION:
    `INSERT INTO ${TABLES.SCHEMA_MIGRATIONS} ` +
    '(migration_id, table_id, table_name, migration_type, source_schema, target_schema, ' +
    'status, current_stage, error_message, created_at, updated_at, completed_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  INSERT_PARTITION_MIGRATION:
    `INSERT INTO ${TABLES.SCHEMA_MIGRATION_PARTITIONS} ` +
    '(migration_id, partition_id, status, backfill_cursor, retry_count, error_message, updated_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?)',
  UPDATE_MIGRATION_BY_ID:
    `UPDATE ${TABLES.SCHEMA_MIGRATIONS} ` +
    'SET status = ?, current_stage = ?, error_message = ?, updated_at = ?, completed_at = ? ' +
    'WHERE migration_id = ?',
  UPDATE_PARTITION_MIGRATION_BY_PK:
    `UPDATE ${TABLES.SCHEMA_MIGRATION_PARTITIONS} ` +
    'SET status = ?, backfill_cursor = ?, retry_count = ?, error_message = ?, updated_at = ? ' +
    'WHERE migration_id = ? AND partition_id = ?',
  UPDATE_TABLE_SCHEMA_BY_ID:
    `UPDATE ${TABLES.TABLES} ` +
    'SET schema_definition = ?, updated_at = ? WHERE table_id = ?',
});

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function parseJsonSafe(value, fallback) {
  if (typeof value !== 'string' || value.length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function cloneJson(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function quoteIdentifier(identifier) {
  return `"${String(identifier || '').replaceAll('"', '""')}"`;
}

function normalizeInteger(value, fallback = 0) {
  return Number.isFinite(value) ?
    Math.floor(value) :
    fallback;
}

function formatBackfillCursor(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return String(Math.floor(value));
}

function parseBackfillCursor(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function resolvePartitionIdList(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .map((row) => String(row?.[MIGRATION_COLUMN.PARTITION_ID] || '').trim())
    .filter((partitionId) => partitionId.length > 0);
}

function mapStageIndex(status) {
  return MIGRATION_STAGE_ORDER.indexOf(status);
}

function resolveDefaultLiteral(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return String(value);
}

class MigrationCoordinator {
  constructor(options = {}) {
    this.sqlCore = options.sqlCore || null;
    if (!this.sqlCore || typeof this.sqlCore.executeQuery !== 'function') {
      throw new Error(MIGRATION_ERROR_MSG.SQL_CORE_REQUIRED);
    }

    this.systemTableCache = options.systemTableCache || null;
    if (!this.systemTableCache) {
      throw new Error(MIGRATION_ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED);
    }

    this.transactionCoordinator = options.transactionCoordinator || null;
    this.logger = options.logger || console;
    this.now = typeof options.now === 'function' ?
      options.now :
      () => Date.now();
    this.workflowCoordinator = options.workflowCoordinator ||
      new DurableWorkflowCoordinator({now: this.now});

    this.migrationOperationLane = new OperationLane({
      name: 'schema-migration',
      workflowCoordinator: this.workflowCoordinator,
      ownerKeyFactory: ({migrationId, ownerKey}) =>
        String(ownerKey || migrationId || ''),
    });
    this.migrationTimeoutPolicy = new TimeoutPolicy({
      operationName: 'schema_migration',
      configuredBudgetMs: MIGRATION_DEFAULT.TIMEOUT_BUDGET_MS,
      now: this.now,
    });
    this.workflowStepRunner = new WorkflowStepRunner({
      workflowCoordinator: this.workflowCoordinator,
      operationLane: this.migrationOperationLane,
      timeoutPolicy: this.migrationTimeoutPolicy,
      now: this.now,
    });

    this.inflightByMigrationId = new Map();
    this.cancellationRequestedByMigrationId = new Set();
  }

  async resolveTableMetadata(tableIdOrName) {
    const normalized = String(tableIdOrName || '');
    if (!normalized) {
      return null;
    }

    const byId = await this.executeSql(
      MIGRATION_SQL.SELECT_TABLE_BY_ID,
      [normalized],
      {},
      true,
    );
    if (byId.rows.length > 0) {
      return byId.rows[0];
    }

    const byName = await this.executeSql(
      MIGRATION_SQL.SELECT_TABLE_BY_NAME,
      [normalized],
      {},
      true,
    );
    return byName.rows[0] || null;
  }

  async findActiveMigrationByTableId(tableId) {
    const result = await this.executeSql(
      MIGRATION_SQL.SELECT_MIGRATIONS_BY_TABLE,
      [tableId],
      {},
      true,
    );
    return result.rows.find((row) => {
      return !MIGRATION_TERMINAL_STATUSES.has(String(row.status || ''));
    }) || null;
  }

  async hasActiveMigrationForTable(tableId) {
    const activeMigration = await this.findActiveMigrationByTableId(tableId);
    return activeMigration !== null;
  }

  async getMigrationById(migrationId) {
    const result = await this.executeSql(
      MIGRATION_SQL.SELECT_MIGRATION_BY_ID,
      [migrationId],
      {},
      true,
    );
    return result.rows[0] || null;
  }

  async getPartitionMigrationRows(migrationId) {
    const result = await this.executeSql(
      MIGRATION_SQL.SELECT_PARTITION_MIGRATIONS,
      [migrationId],
      {},
      true,
    );
    return result.rows;
  }

  async executeSql(sql, params = [], options = {}, allowReadFailure = false) {
    const result = await this.sqlCore.executeQuery(sql, params, options);
    if (!allowReadFailure && result?.success !== true) {
      throw new Error(result?.error || MIGRATION_ERROR_MSG.RETRY_EXHAUSTED);
    }
    if (allowReadFailure && result?.success !== true) {
      return {
        success: false,
        rows: [],
        error: result?.error || null,
      };
    }
    return result;
  }

  async ensureWorkflowRegistered(migrationRow) {
    const migrationId = String(migrationRow?.migration_id || '');
    if (!migrationId) {
      return null;
    }

    const existing = this.workflowCoordinator.getWorkflowById(migrationId);
    if (existing) {
      return existing;
    }

    return this.workflowCoordinator.registerWorkflow({
      workflowId: migrationId,
      ownerKey: migrationId,
      step: migrationRow.current_stage || migrationRow.status,
      status: migrationRow.status,
      tableId: migrationRow.table_id,
      tableName: migrationRow.table_name,
      metadata: {
        migrationType: migrationRow.migration_type,
      },
      createdAt: normalizeInteger(migrationRow.created_at, this.now()),
      updatedAt: normalizeInteger(migrationRow.updated_at, this.now()),
      transitionHistory: [],
    });
  }

  generateMigrationId() {
    return randomUUID();
  }

  isMonotonicTransitionAllowed(previousStatus, nextStatus) {
    const normalizedPrevious = String(previousStatus || '');
    const normalizedNext = String(nextStatus || '');

    if (normalizedPrevious === normalizedNext) {
      return true;
    }

    if (normalizedNext === MIGRATION_STATUS.FAILED ||
        normalizedNext === MIGRATION_STATUS.CANCELLING) {
      return !MIGRATION_TERMINAL_STATUSES.has(normalizedPrevious);
    }

    if (normalizedPrevious === MIGRATION_STATUS.CANCELLING &&
        normalizedNext === MIGRATION_STATUS.CANCELLED) {
      return true;
    }

    const previousIndex = mapStageIndex(normalizedPrevious);
    const nextIndex = mapStageIndex(normalizedNext);
    if (previousIndex < 0 || nextIndex < 0) {
      return false;
    }
    return nextIndex > previousIndex;
  }

  buildTargetSchema(sourceSchemaDefinition, alterSpec) {
    const sourceSchema = parseJsonSafe(sourceSchemaDefinition, {});
    const sourceColumns = Array.isArray(sourceSchema?.columns) ?
      sourceSchema.columns.map((column) => ({...column})) :
      [];
    const nextSchema = {
      ...sourceSchema,
      columns: sourceColumns,
    };

    const operation = alterSpec || {};
    if (operation.migrationType === MIGRATION_TYPE.ADD_COLUMN) {
      nextSchema.columns.push({
        name: operation.columnName,
        type: operation.dataType,
        default: operation.defaultValue ?? null,
      });
    } else if (operation.migrationType === MIGRATION_TYPE.DROP_COLUMN) {
      nextSchema.columns = nextSchema.columns.filter(
        (column) => column.name !== operation.columnName,
      );
    } else if (operation.migrationType === MIGRATION_TYPE.RENAME_COLUMN) {
      nextSchema.columns = nextSchema.columns.map((column) => {
        if (column.name !== operation.columnName) {
          return column;
        }
        return {
          ...column,
          name: operation.newColumnName,
        };
      });
    } else if (operation.migrationType === MIGRATION_TYPE.ALTER_COLUMN_TYPE) {
      nextSchema.columns = nextSchema.columns.map((column) => {
        if (column.name !== operation.columnName) {
          return column;
        }
        return {
          ...column,
          type: operation.dataType,
        };
      });
    }

    return {
      schema: nextSchema,
      alterSpec: cloneJson(operation),
    };
  }

  resolveAlterSpecFromMigration(migrationRow) {
    const targetPayload = parseJsonSafe(migrationRow?.target_schema, {});
    const alterSpec = targetPayload?.alterSpec || null;
    if (alterSpec && typeof alterSpec === 'object') {
      return alterSpec;
    }
    return {
      migrationType: migrationRow?.migration_type || null,
      sql: null,
    };
  }

  async transitionMigrationStage(migrationId, nextStage, reason, options = {}) {
    const migrationRow = await this.getMigrationById(migrationId);
    if (!migrationRow) {
      throw new Error(`${MIGRATION_ERROR_MSG.MIGRATION_NOT_FOUND}: ${migrationId}`);
    }

    const previousStage = String(
      migrationRow[MIGRATION_COLUMN.CURRENT_STAGE] ||
      migrationRow[MIGRATION_COLUMN.STATUS] ||
      '',
    );
    if (!this.isMonotonicTransitionAllowed(previousStage, nextStage)) {
      throw new Error(
        `${MIGRATION_ERROR_MSG.INVALID_STAGE_TRANSITION_PREFIX}` +
        `${previousStage} -> ${nextStage}`,
      );
    }

    await this.ensureWorkflowRegistered(migrationRow);
    await this.workflowCoordinator.transitionStep(
      migrationId,
      {
        nextStep: nextStage,
        reason,
        metadata: {
          previous_stage: previousStage,
          next_stage: nextStage,
          reason,
          timestamp: this.now(),
        },
      },
      {
        status: nextStage,
      },
    );

    const updatedAt = this.now();
    const completedAt = options.completedAt !== undefined ?
      options.completedAt :
      (nextStage === MIGRATION_STATUS.COMPLETED ? updatedAt : null);
    const errorMessage = Object.prototype.hasOwnProperty.call(
      options,
      'errorMessage',
    ) ? options.errorMessage : null;

    await this.executeSql(
      MIGRATION_SQL.UPDATE_MIGRATION_BY_ID,
      [
        nextStage,
        nextStage,
        errorMessage,
        updatedAt,
        completedAt,
        migrationId,
      ],
    );

    this.logger.info(MIGRATION_LOG_MSG.STAGE_TRANSITION, {
      migration_id: migrationId,
      previous_stage: previousStage,
      next_stage: nextStage,
      reason,
    });
  }

  async updatePartitionMigration(migrationId, partitionId, updates = {}) {
    const row = await this.getPartitionMigrationRow(migrationId, partitionId);
    const status = updates.status || row?.status || MIGRATION_STATUS.PENDING;
    const backfillCursor = Object.prototype.hasOwnProperty.call(
      updates,
      'backfill_cursor',
    ) ? updates.backfill_cursor : (row?.backfill_cursor || null);
    const retryCount = Object.prototype.hasOwnProperty.call(
      updates,
      'retry_count',
    ) ? updates.retry_count : normalizeInteger(row?.retry_count, 0);
    const errorMessage = Object.prototype.hasOwnProperty.call(
      updates,
      'error_message',
    ) ? updates.error_message : (row?.error_message || null);

    await this.executeSql(
      MIGRATION_SQL.UPDATE_PARTITION_MIGRATION_BY_PK,
      [
        status,
        backfillCursor,
        retryCount,
        errorMessage,
        this.now(),
        migrationId,
        partitionId,
      ],
    );
  }

  async getPartitionMigrationRow(migrationId, partitionId) {
    const rows = await this.getPartitionMigrationRows(migrationId);
    return rows.find((row) => String(row.partition_id) === String(partitionId)) || null;
  }

  async executePartitionSql(partitionId, sql, params = [], options = {}) {
    const queryExecutor = this.sqlCore?.queryExecutor || null;
    if (!queryExecutor || typeof queryExecutor.executeOnPartition !== 'function') {
      throw new Error('MigrationCoordinator requires sqlCore.queryExecutor');
    }

    const forRead = options.forRead === true;
    const defaultOptions = forRead ?
      PARTITION_READ_DEFAULT_OPTIONS :
      PARTITION_WRITE_DEFAULT_OPTIONS;
    return queryExecutor.executeOnPartition(
      partitionId,
      sql,
      params,
      defaultOptions.FOR_READ,
      defaultOptions.PREFER_LEADER,
      defaultOptions.PREFER_SAME_LATENCY_GROUP,
      options.executionOptions || {},
    );
  }

  buildExponentialBackoffDelay(retryCount) {
    const boundedRetryCount = Math.max(0, normalizeInteger(retryCount, 0));
    const delay = MIGRATION_DEFAULT.RETRY_BASE_DELAY_MS *
      (2 ** boundedRetryCount);
    return Math.min(delay, MIGRATION_DEFAULT.RETRY_MAX_DELAY_MS);
  }

  shouldStopForCancellation(migrationId) {
    return this.cancellationRequestedByMigrationId.has(String(migrationId || ''));
  }

  async initiateMigration(tableId, alterSpec) {
    const normalizedTableId = String(tableId || '').trim();
    if (!normalizedTableId) {
      throw new Error('Migration tableId is required');
    }

    const activeMigration = await this.findActiveMigrationByTableId(
      normalizedTableId,
    );
    if (activeMigration) {
      throw new Error(
        `${MIGRATION_ERROR_MSG.ACTIVE_MIGRATION_CONFLICT_PREFIX}` +
        `${activeMigration.migration_id}`,
      );
    }

    const tableMetadata = await this.resolveTableMetadata(normalizedTableId);
    if (!tableMetadata) {
      throw new Error(`Table not found for migration: ${normalizedTableId}`);
    }

    const sourceSchema = String(tableMetadata.schema_definition || '{}');
    const targetPayload = this.buildTargetSchema(sourceSchema, alterSpec);
    const migrationId = this.generateMigrationId();
    const createdAt = this.now();

    await this.executeSql(
      MIGRATION_SQL.INSERT_MIGRATION,
      [
        migrationId,
        tableMetadata.table_id,
        tableMetadata.table_name,
        alterSpec.migrationType,
        sourceSchema,
        JSON.stringify(targetPayload),
        MIGRATION_STATUS.PENDING,
        MIGRATION_STATUS.PENDING,
        null,
        createdAt,
        createdAt,
        null,
      ],
    );

    const partitionRowsFromCache =
      typeof this.systemTableCache.filter === 'function' ?
        this.systemTableCache.filter(TABLES.PARTITIONS, (row) =>
          String(row?.table_id || '') === String(tableMetadata.table_id || ''),
        ) :
        [];
    let partitionIds = resolvePartitionIdList(partitionRowsFromCache);
    if (partitionIds.length === 0) {
      const partitionQueryResult = await this.executeSql(
        MIGRATION_SQL.SELECT_PARTITIONS_BY_TABLE,
        [tableMetadata.table_id],
      );
      partitionIds = resolvePartitionIdList(partitionQueryResult.rows);
    }

    for (const partitionId of partitionIds) {
      await this.executeSql(
        MIGRATION_SQL.INSERT_PARTITION_MIGRATION,
        [
          migrationId,
          partitionId,
          MIGRATION_STATUS.PENDING,
          null,
          0,
          null,
          createdAt,
        ],
      );
    }

    await this.workflowCoordinator.registerWorkflow({
      workflowId: migrationId,
      ownerKey: migrationId,
      step: MIGRATION_STATUS.PENDING,
      status: MIGRATION_STATUS.PENDING,
      tableId: tableMetadata.table_id,
      tableName: tableMetadata.table_name,
      metadata: {
        migrationType: alterSpec.migrationType,
      },
      createdAt,
      updatedAt: createdAt,
      transitionHistory: [],
    });

    this.logger.info(MIGRATION_LOG_MSG.MIGRATION_INITIATED, {
      migration_id: migrationId,
      table_id: tableMetadata.table_id,
      table_name: tableMetadata.table_name,
      migration_type: alterSpec.migrationType,
      partition_count: partitionIds.length,
    });

    return migrationId;
  }

  async advanceMigration(migrationId, options = {}) {
    const normalizedMigrationId = String(migrationId || '').trim();
    if (!normalizedMigrationId) {
      throw new Error(`${MIGRATION_ERROR_MSG.MIGRATION_NOT_FOUND}: ${migrationId}`);
    }

    if (this.inflightByMigrationId.has(normalizedMigrationId)) {
      return this.inflightByMigrationId.get(normalizedMigrationId);
    }

    const executionPromise = (async () => {
      const migrationRow = await this.getMigrationById(normalizedMigrationId);
      if (!migrationRow) {
        throw new Error(`${MIGRATION_ERROR_MSG.MIGRATION_NOT_FOUND}: ${migrationId}`);
      }
      await this.ensureWorkflowRegistered(migrationRow);

      return this.workflowStepRunner.runStep({
        workflowId: normalizedMigrationId,
        ownerKey: normalizedMigrationId,
        stepName: 'advance_migration',
        timeoutBudget: options.timeoutBudget || null,
        execute: async ({timeoutBudget}) => {
          let activeMigration = await this.getMigrationById(normalizedMigrationId);
          if (!activeMigration) {
            throw new Error(
              `${MIGRATION_ERROR_MSG.MIGRATION_NOT_FOUND}: ${normalizedMigrationId}`,
            );
          }

          if (MIGRATION_TERMINAL_STATUSES.has(String(activeMigration.status || ''))) {
            return {
              result: {
                migrationId: normalizedMigrationId,
                status: activeMigration.status,
              },
            };
          }
          if (String(activeMigration.status || '') === MIGRATION_STATUS.CANCELLING) {
            return {
              result: {
                migrationId: normalizedMigrationId,
                status: activeMigration.status,
              },
            };
          }

          try {
            if (activeMigration.status === MIGRATION_STATUS.PENDING ||
                activeMigration.status === MIGRATION_STATUS.DUAL_WRITE) {
              await this.executeDualWriteStage(activeMigration, timeoutBudget);
              activeMigration = await this.getMigrationById(normalizedMigrationId);
            }

            if (activeMigration?.status === MIGRATION_STATUS.DUAL_WRITE_COMPLETE ||
                activeMigration?.status === MIGRATION_STATUS.BACKFILL) {
              await this.executeBackfillStage(activeMigration, timeoutBudget);
              activeMigration = await this.getMigrationById(normalizedMigrationId);
            }

            if (activeMigration?.status === MIGRATION_STATUS.BACKFILL_COMPLETE ||
                activeMigration?.status === MIGRATION_STATUS.CUTOVER_PENDING) {
              await this.executeCutoverStage(activeMigration, timeoutBudget);
              activeMigration = await this.getMigrationById(normalizedMigrationId);
            }
          } catch (error) {
            const latestMigration = await this.getMigrationById(normalizedMigrationId);
            if (latestMigration &&
                String(latestMigration.status || '') !== MIGRATION_STATUS.CANCELLING &&
                !MIGRATION_TERMINAL_STATUSES.has(String(latestMigration.status || ''))) {
              await this.transitionMigrationStage(
                normalizedMigrationId,
                MIGRATION_STATUS.FAILED,
                MIGRATION_STAGE_REASON.FAILURE,
                {
                  errorMessage: error?.message || MIGRATION_ERROR_MSG.RETRY_EXHAUSTED,
                },
              );
            }
            activeMigration = await this.getMigrationById(normalizedMigrationId);
          }

          return {
            result: {
              migrationId: normalizedMigrationId,
              status: activeMigration?.status || null,
            },
          };
        },
      });
    })()
      .finally(() => {
        this.inflightByMigrationId.delete(normalizedMigrationId);
      });

    this.inflightByMigrationId.set(normalizedMigrationId, executionPromise);
    return executionPromise;
  }

  async cancelMigration(migrationId) {
    const normalizedMigrationId = String(migrationId || '').trim();
    if (!normalizedMigrationId) {
      throw new Error(`${MIGRATION_ERROR_MSG.MIGRATION_NOT_FOUND}: ${migrationId}`);
    }

    const migrationRow = await this.getMigrationById(normalizedMigrationId);
    if (!migrationRow) {
      throw new Error(`${MIGRATION_ERROR_MSG.MIGRATION_NOT_FOUND}: ${normalizedMigrationId}`);
    }
    const currentStage = String(
      migrationRow.current_stage ||
      migrationRow.status ||
      '',
    );
    if (!MIGRATION_CANCELLABLE_STAGES.has(currentStage)) {
      throw new Error(`${MIGRATION_ERROR_MSG.NOT_CANCELLABLE_PREFIX}${currentStage}`);
    }

    this.cancellationRequestedByMigrationId.add(normalizedMigrationId);
    try {
      await this.transitionMigrationStage(
        normalizedMigrationId,
        MIGRATION_STATUS.CANCELLING,
        MIGRATION_STAGE_REASON.CANCELLING,
      );

      if (this.inflightByMigrationId.has(normalizedMigrationId)) {
        await this.inflightByMigrationId.get(normalizedMigrationId);
      }

      const latestMigrationRow = await this.getMigrationById(normalizedMigrationId);
      if (!latestMigrationRow) {
        throw new Error(
          `${MIGRATION_ERROR_MSG.MIGRATION_NOT_FOUND}: ${normalizedMigrationId}`,
        );
      }
      await this.rollbackMigration(latestMigrationRow);
      await this.transitionMigrationStage(
        normalizedMigrationId,
        MIGRATION_STATUS.CANCELLED,
        MIGRATION_STAGE_REASON.CANCELLED,
        {
          errorMessage: null,
          completedAt: this.now(),
        },
      );
      this.logger.info(MIGRATION_LOG_MSG.MIGRATION_CANCELLED, {
        migration_id: normalizedMigrationId,
      });
      return {
        success: true,
        migrationId: normalizedMigrationId,
        status: MIGRATION_STATUS.CANCELLED,
      };
    } finally {
      this.cancellationRequestedByMigrationId.delete(normalizedMigrationId);
    }
  }

  async recoverMigrations() {
    const result = await this.executeSql(
      MIGRATION_SQL.SELECT_NON_TERMINAL_MIGRATIONS,
      [
        MIGRATION_STATUS.COMPLETED,
        MIGRATION_STATUS.CANCELLED,
        MIGRATION_STATUS.FAILED,
      ],
      {},
      true,
    );
    const rows = Array.isArray(result.rows) ? result.rows : [];
    const recoveredMigrationIds = [];

    for (const row of rows) {
      const migrationId = String(row.migration_id || '');
      if (!migrationId) {
        continue;
      }
      await this.ensureWorkflowRegistered(row);
      this.logger.info(MIGRATION_LOG_MSG.MIGRATION_RECOVERED, {
        migration_id: migrationId,
        stage: row.current_stage || row.status,
      });
      await this.advanceMigration(migrationId);
      recoveredMigrationIds.push(migrationId);
    }

    return {
      success: true,
      recovered: recoveredMigrationIds.length,
      migrationIds: recoveredMigrationIds,
    };
  }

  async executeDualWriteStage(migrationRow, timeoutBudget) {
    if (!migrationRow) {
      return;
    }

    const migrationId = String(migrationRow.migration_id || '');
    if (!migrationId) {
      return;
    }

    const currentStatus = String(
      migrationRow[MIGRATION_COLUMN.STATUS] ||
      migrationRow[MIGRATION_COLUMN.CURRENT_STAGE] ||
      '',
    );
    if (currentStatus === MIGRATION_STATUS.PENDING) {
      await this.transitionMigrationStage(
        migrationId,
        MIGRATION_STATUS.DUAL_WRITE,
        MIGRATION_STAGE_REASON.DUAL_WRITE_START,
      );
    }

    const activeMigrationRow = await this.getMigrationById(migrationId);
    const alterSpec = this.resolveAlterSpecFromMigration(activeMigrationRow);
    const alterSql = String(alterSpec?.sql || '').trim();
    if (!alterSql) {
      throw new Error('Migration alter SQL is required for dual-write stage');
    }

    const partitionRows = await this.getPartitionMigrationRows(migrationId);
    for (const partitionRow of partitionRows) {
      const partitionId = String(partitionRow.partition_id || '');
      if (!partitionId) {
        continue;
      }

      const partitionStatus = String(partitionRow.status || '');
      const partitionStageIndex = mapStageIndex(partitionStatus);
      const dualWriteStageIndex = mapStageIndex(MIGRATION_STATUS.DUAL_WRITE);
      if (partitionStageIndex >= dualWriteStageIndex) {
        continue;
      }

      await this.runPartitionOperationWithRetry({
        migrationId,
        partitionId,
        statusOnFailure: MIGRATION_STATUS.DUAL_WRITE,
        timeoutBudget,
        operation: async (_childTimeoutBudget) => {
          const result = await this.executePartitionSql(
            partitionId,
            alterSql,
            [],
            {
              forRead: false,
              executionOptions: {
                migrationOperation: MIGRATION_PARTITION_OPERATION.ALTER_TABLE,
                migrationId,
              },
            },
          );
          if (result?.success !== true) {
            throw new Error(result?.error || 'Partition ALTER TABLE failed');
          }
          await this.updatePartitionMigration(migrationId, partitionId, {
            status: MIGRATION_STATUS.DUAL_WRITE,
            error_message: null,
            retry_count: normalizeInteger(partitionRow.retry_count, 0),
          });
          return result;
        },
      });
    }

    const refreshedPartitionRows = await this.getPartitionMigrationRows(migrationId);
    const allInDualWrite = refreshedPartitionRows.every((row) => {
      const status = String(row.status || '');
      if (MIGRATION_TERMINAL_STATUSES.has(status)) {
        return true;
      }
      return mapStageIndex(status) >= mapStageIndex(MIGRATION_STATUS.DUAL_WRITE);
    });
    if (allInDualWrite) {
      await this.transitionMigrationStage(
        migrationId,
        MIGRATION_STATUS.DUAL_WRITE_COMPLETE,
        MIGRATION_STAGE_REASON.DUAL_WRITE_COMPLETE,
      );
    }
  }

  async executeBackfillStage(migrationRow, timeoutBudget) {
    if (!migrationRow) {
      return;
    }
    const migrationId = String(migrationRow.migration_id || '');
    if (!migrationId) {
      return;
    }

    if (String(migrationRow.status || '') === MIGRATION_STATUS.DUAL_WRITE_COMPLETE) {
      await this.transitionMigrationStage(
        migrationId,
        MIGRATION_STATUS.BACKFILL,
        MIGRATION_STAGE_REASON.BACKFILL_START,
      );
    }

    const refreshedMigrationRow = await this.getMigrationById(migrationId);
    const partitionRows = await this.getPartitionMigrationRows(migrationId);
    const backfillCompleteStageIndex =
      mapStageIndex(MIGRATION_STATUS.BACKFILL_COMPLETE);

    for (const partitionRow of partitionRows) {
      const partitionId = String(partitionRow.partition_id || '');
      if (!partitionId) {
        continue;
      }

      const partitionStageIndex = mapStageIndex(String(partitionRow.status || ''));
      if (partitionStageIndex >= backfillCompleteStageIndex) {
        continue;
      }

      await this.runPartitionOperationWithRetry({
        migrationId,
        partitionId,
        statusOnFailure: MIGRATION_STATUS.BACKFILL,
        timeoutBudget,
        operation: async (_childTimeoutBudget) => {
          return this.runBackfillPartitionLoop(
            refreshedMigrationRow,
            partitionRow,
            timeoutBudget,
          );
        },
      });
    }

    const finalPartitionRows = await this.getPartitionMigrationRows(migrationId);
    const allBackfilled = finalPartitionRows.every((row) => {
      const status = String(row.status || '');
      if (MIGRATION_TERMINAL_STATUSES.has(status)) {
        return true;
      }
      return mapStageIndex(status) >= backfillCompleteStageIndex;
    });
    if (allBackfilled) {
      await this.transitionMigrationStage(
        migrationId,
        MIGRATION_STATUS.BACKFILL_COMPLETE,
        MIGRATION_STAGE_REASON.BACKFILL_COMPLETE,
      );
    }
  }

  async executeCutoverStage(migrationRow, _timeoutBudget) {
    if (!migrationRow) {
      return;
    }

    const migrationId = String(migrationRow.migration_id || '');
    if (!migrationId) {
      return;
    }

    if (String(migrationRow.status || '') === MIGRATION_STATUS.BACKFILL_COMPLETE) {
      await this.transitionMigrationStage(
        migrationId,
        MIGRATION_STATUS.CUTOVER_PENDING,
        MIGRATION_STAGE_REASON.CUTOVER_PENDING,
      );
    }

    const refreshedMigrationRow = await this.getMigrationById(migrationId);
    const partitionRows = await this.getPartitionMigrationRows(migrationId);
    let lastError = null;
    for (let attempt = 0; attempt <= MIGRATION_DEFAULT.MAX_RETRY_COUNT; attempt++) {
      try {
        await this.executeCutoverTransaction(refreshedMigrationRow, partitionRows);
        await this.transitionMigrationStage(
          migrationId,
          MIGRATION_STATUS.COMPLETED,
          MIGRATION_STAGE_REASON.CUTOVER_COMPLETE,
          {
            completedAt: this.now(),
            errorMessage: null,
          },
        );
        return;
      } catch (error) {
        lastError = error;
        if (attempt >= MIGRATION_DEFAULT.MAX_RETRY_COUNT) {
          break;
        }
        const delayMs = this.buildExponentialBackoffDelay(attempt);
        this.logger.info(MIGRATION_LOG_MSG.CUTOVER_RETRY, {
          migration_id: migrationId,
          retry_count: attempt + 1,
          delay_ms: delayMs,
          error: error?.message || null,
        });
        await sleep(delayMs);
      }
    }

    await this.transitionMigrationStage(
      migrationId,
      MIGRATION_STATUS.FAILED,
      MIGRATION_STAGE_REASON.FAILURE,
      {
        errorMessage: lastError?.message || MIGRATION_ERROR_MSG.RETRY_EXHAUSTED,
      },
    );
  }

  async rollbackMigration(migrationRow) {
    const migrationId = String(migrationRow?.migration_id || '');
    if (!migrationId) {
      throw new Error('Missing migration_id for rollback');
    }

    const rollbackSql = this.resolveRollbackSql(migrationRow);
    if (!rollbackSql) {
      return {
        success: true,
        migrationId,
        skipped: true,
      };
    }

    const partitionRows = await this.getPartitionMigrationRows(migrationId);
    for (const partitionRow of partitionRows) {
      const partitionId = String(partitionRow.partition_id || '');
      if (!partitionId) {
        continue;
      }
      await this.runPartitionOperationWithRetry({
        migrationId,
        partitionId,
        statusOnFailure: MIGRATION_STATUS.CANCELLING,
        timeoutBudget: null,
        operation: async () => {
          const result = await this.executePartitionSql(
            partitionId,
            rollbackSql,
            [],
            {
              forRead: false,
              executionOptions: {
                migrationOperation: MIGRATION_PARTITION_OPERATION.ALTER_TABLE,
                migrationId,
              },
            },
          );
          if (result?.success !== true) {
            throw new Error(result?.error || 'Partition rollback ALTER TABLE failed');
          }
          await this.updatePartitionMigration(migrationId, partitionId, {
            status: MIGRATION_STATUS.CANCELLED,
            error_message: null,
          });
          return result;
        },
      });
    }

    return {
      success: true,
      migrationId,
      rollbackSql,
      partitionCount: partitionRows.length,
    };
  }

  async runPartitionOperationWithRetry(options = {}) {
    const migrationId = String(options.migrationId || '');
    const partitionId = String(options.partitionId || '');
    const statusOnFailure = options.statusOnFailure || MIGRATION_STATUS.FAILED;
    const operation = typeof options.operation === 'function' ?
      options.operation :
      null;
    if (!migrationId || !partitionId || !operation) {
      throw new Error('Invalid partition retry operation context');
    }

    let lastError = null;
    for (let attempt = 0; attempt <= MIGRATION_DEFAULT.MAX_RETRY_COUNT; attempt++) {
      const childBudget = this.migrationTimeoutPolicy.allocateOrThrow({
        timeoutBudget: options.timeoutBudget || null,
        nestedOperation: `partition_${partitionId}_attempt_${attempt}`,
      });
      try {
        return await operation(childBudget);
      } catch (error) {
        lastError = error;
        const retryCount = attempt + 1;
        await this.updatePartitionMigration(migrationId, partitionId, {
          status: statusOnFailure,
          retry_count: retryCount,
          error_message: error?.message || null,
        });
        if (attempt >= MIGRATION_DEFAULT.MAX_RETRY_COUNT) {
          break;
        }
        const delayMs = this.buildExponentialBackoffDelay(attempt);
        this.logger.info(MIGRATION_LOG_MSG.PARTITION_RETRY, {
          migration_id: migrationId,
          partition_id: partitionId,
          retry_count: retryCount,
          delay_ms: delayMs,
          error: error?.message || null,
        });
        await sleep(delayMs);
      }
    }

    throw lastError || new Error(MIGRATION_ERROR_MSG.RETRY_EXHAUSTED);
  }

  async runBackfillPartitionLoop(migrationRow, partitionRow, timeoutBudget) {
    const migrationId = String(migrationRow?.migration_id || '');
    const partitionId = String(partitionRow?.partition_id || '');
    const tableName = String(migrationRow?.table_name || '');
    if (!migrationId || !partitionId || !tableName) {
      throw new Error('Missing migration backfill context');
    }

    let cursor = parseBackfillCursor(partitionRow?.backfill_cursor);
    const quotedTableName = quoteIdentifier(tableName);
    const selectSql = `SELECT rowid AS row_id FROM ${quotedTableName} ` +
      'WHERE rowid > ? ORDER BY rowid LIMIT ?';
    const backfillUpdateSqlContext = this.resolveBackfillUpdateSql(migrationRow);

    while (true) {
      if (this.shouldStopForCancellation(migrationId)) {
        return {
          cancelled: true,
          partitionId,
          cursor,
        };
      }

      const readBudget = this.migrationTimeoutPolicy.allocateOrThrow({
        timeoutBudget,
        nestedOperation: `backfill_scan_${partitionId}`,
      });
      const scanResult = await this.executePartitionSql(
        partitionId,
        selectSql,
        [cursor, MIGRATION_DEFAULT.BACKFILL_BATCH_SIZE],
        {
          forRead: true,
          executionOptions: {timeoutBudget: readBudget},
        },
      );
      if (scanResult?.success !== true) {
        throw new Error(scanResult?.error || 'Backfill scan failed');
      }

      const rows = Array.isArray(scanResult.rows) ? scanResult.rows : [];
      if (rows.length === 0) {
        await this.updatePartitionMigration(migrationId, partitionId, {
          status: MIGRATION_STATUS.BACKFILL_COMPLETE,
          backfill_cursor: formatBackfillCursor(cursor),
          error_message: null,
        });
        return {
          completed: true,
          partitionId,
          cursor,
        };
      }

      const lastRow = rows[rows.length - 1];
      const lastRowId = normalizeInteger(lastRow?.row_id, cursor);

      if (backfillUpdateSqlContext) {
        const updateBudget = this.migrationTimeoutPolicy.allocateOrThrow({
          timeoutBudget,
          nestedOperation: `backfill_update_${partitionId}`,
        });
        const updateParams = [
          ...backfillUpdateSqlContext.params,
          cursor,
          lastRowId,
        ];
        const updateResult = await this.executePartitionSql(
          partitionId,
          backfillUpdateSqlContext.sql,
          updateParams,
          {
            forRead: false,
            executionOptions: {timeoutBudget: updateBudget},
          },
        );
        if (updateResult?.success !== true) {
          throw new Error(updateResult?.error || 'Backfill update failed');
        }
      }

      cursor = lastRowId;
      await this.updatePartitionMigration(migrationId, partitionId, {
        status: MIGRATION_STATUS.BACKFILL,
        backfill_cursor: formatBackfillCursor(cursor),
        error_message: null,
      });
    }
  }

  async executeCutoverTransaction(migrationRow, partitionRows) {
    const migrationId = String(migrationRow?.migration_id || '');
    if (!migrationId) {
      throw new Error('Missing migration_id for cutover');
    }
    const sessionId = `schema-migration-cutover-${migrationId}`;
    const updatedAt = this.now();

    const targetPayload = parseJsonSafe(migrationRow?.target_schema, {});
    const targetSchema = targetPayload?.schema || targetPayload || {};

    try {
      await this.executeSql('BEGIN', [], {sessionId});
      await this.executeSql(
        MIGRATION_SQL.UPDATE_TABLE_SCHEMA_BY_ID,
        [
          JSON.stringify(targetSchema),
          updatedAt,
          migrationRow.table_id,
        ],
        {sessionId},
      );

      for (const row of partitionRows || []) {
        await this.executeSql(
          MIGRATION_SQL.UPDATE_PARTITION_MIGRATION_BY_PK,
          [
            MIGRATION_STATUS.COMPLETED,
            row?.backfill_cursor || null,
            normalizeInteger(row?.retry_count, 0),
            null,
            updatedAt,
            migrationId,
            row?.partition_id,
          ],
          {sessionId},
        );
      }

      await this.executeSql('COMMIT', [], {sessionId});
    } catch (error) {
      try {
        await this.executeSql('ROLLBACK', [], {sessionId}, true);
      } catch (_rollbackError) {
        // Intentionally ignored; rollback errors are secondary to cutover failure.
      }
      throw error;
    }
  }

  resolveRollbackSql(migrationRow) {
    const alterSpec = this.resolveAlterSpecFromMigration(migrationRow);
    const tableName = quoteIdentifier(migrationRow?.table_name || '');
    const sourceSchema = parseJsonSafe(migrationRow?.source_schema, {});

    if (alterSpec?.migrationType === MIGRATION_TYPE.ADD_COLUMN) {
      const columnName = quoteIdentifier(alterSpec?.columnName || '');
      return `ALTER TABLE ${tableName} DROP COLUMN ${columnName}`;
    }

    if (alterSpec?.migrationType === MIGRATION_TYPE.RENAME_COLUMN) {
      const fromColumn = quoteIdentifier(alterSpec?.newColumnName || '');
      const toColumn = quoteIdentifier(alterSpec?.columnName || '');
      return `ALTER TABLE ${tableName} RENAME COLUMN ${fromColumn} TO ${toColumn}`;
    }

    if (alterSpec?.migrationType === MIGRATION_TYPE.ALTER_COLUMN_TYPE) {
      const sourceColumn = Array.isArray(sourceSchema?.columns) ?
        sourceSchema.columns.find((column) => column.name === alterSpec.columnName) :
        null;
      if (!sourceColumn || !sourceColumn.type) {
        return null;
      }
      const columnName = quoteIdentifier(alterSpec?.columnName || '');
      return `ALTER TABLE ${tableName} ALTER COLUMN ${columnName} TYPE ${sourceColumn.type}`;
    }

    if (alterSpec?.migrationType === MIGRATION_TYPE.DROP_COLUMN) {
      const sourceColumn = Array.isArray(sourceSchema?.columns) ?
        sourceSchema.columns.find((column) => column.name === alterSpec.columnName) :
        null;
      if (!sourceColumn || !sourceColumn.type) {
        return null;
      }
      const columnName = quoteIdentifier(sourceColumn.name);
      const dataType = String(sourceColumn.type);
      let sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${dataType}`;
      if (sourceColumn.default !== undefined && sourceColumn.default !== null) {
        const defaultLiteral = resolveDefaultLiteral(sourceColumn.default);
        if (typeof defaultLiteral === 'number') {
          sql += ` DEFAULT ${defaultLiteral}`;
        } else {
          const escaped = String(defaultLiteral).replaceAll('\'', '\'\'');
          sql += ` DEFAULT '${escaped}'`;
        }
      }
      return sql;
    }

    return null;
  }

  resolveBackfillUpdateSql(migrationRow) {
    const alterSpec = this.resolveAlterSpecFromMigration(migrationRow);
    if (alterSpec?.migrationType !== MIGRATION_TYPE.ADD_COLUMN) {
      return null;
    }

    const tableName = quoteIdentifier(migrationRow?.table_name || '');
    const columnName = quoteIdentifier(alterSpec?.columnName || '');
    const params = [];
    const defaultValue = resolveDefaultLiteral(alterSpec?.defaultValue);
    if (defaultValue !== null && defaultValue !== undefined) {
      params.push(defaultValue);
      return {
        sql:
          `UPDATE ${tableName} ` +
          `SET ${columnName} = COALESCE(${columnName}, ?) ` +
          'WHERE rowid > ? AND rowid <= ?',
        params,
      };
    }

    return {
      sql:
        `UPDATE ${tableName} ` +
        `SET ${columnName} = NULL ` +
        `WHERE ${columnName} IS NULL AND rowid > ? AND rowid <= ?`,
      params,
    };
  }
}

export {
  MIGRATION_STAGE_REASON,
  MIGRATION_SQL,
  MigrationCoordinator,
  formatBackfillCursor,
  normalizeInteger,
  parseBackfillCursor,
  parseJsonSafe,
  quoteIdentifier,
  resolveDefaultLiteral,
  resolvePartitionIdList,
  sleep,
};
