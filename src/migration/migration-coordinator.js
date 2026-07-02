import {randomUUID} from 'node:crypto';
import {TABLES} from '../constants/index.js';
import {DurableWorkflowCoordinator} from '../workflow/durable-workflow-coordinator.js';
import {OperationLane} from '../workflow/operation-lane.js';
import {TimeoutPolicy} from '../workflow/timeout-policy.js';
import {WorkflowStepRunner} from '../workflow/workflow-step-runner.js';
import {
  createMigrationCoordinatorLifecycleMethods,
} from './migration-coordinator-lifecycle-methods.js';
import {
  createMigrationCoordinatorStageMethods,
} from './migration-coordinator-stage-methods.js';
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

const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_AU1TP = '"';
const LOCAL_STR_1YZ14 = '""';
const LOCAL_STR_NUMBER = 'number';
const LOCAL_STR_BOOLEAN = 'boolean';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_SCHEMA_MIGRATION = 'schema-migration';
const LOCAL_STR_SCHEMA_MIGRATION_2 = 'schema_migration';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_1G5VR = 'MigrationCoordinator requires sqlCore.queryExecutor';
const LOCAL_STR_1S4LL = 'Migration tableId is required';
const LOCAL_STR_18RRO = 'Migration alter SQL is required for dual-write stage';
const LOCAL_STR_1S5V1 = 'Partition ALTER TABLE failed';
const LOCAL_STR_1A9V5 = 'Missing migration_id for rollback';
const LOCAL_STR_1H4U6 = 'Partition rollback ALTER TABLE failed';
const LOCAL_STR_1D25J = 'Invalid partition retry operation context';
const LOCAL_STR_1UZWJ = 'Missing migration backfill context';
const LOCAL_STR_16VMA = 'Backfill scan failed';
const LOCAL_STR_9U4IH = 'Backfill update failed';
const LOCAL_STR_16VZX = 'Missing migration_id for cutover';
const LOCAL_STR_BEGIN = 'BEGIN';
const LOCAL_STR_COMMIT = 'COMMIT';
const LOCAL_STR_ROLLBACK = 'ROLLBACK';
const LOCAL_STR_15T8X = 'WHERE rowid > ? AND rowid <= ?';

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
  if (typeof value !== LOCAL_STR_STRING || value.length === LOCAL_NUM_ZERO) {
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
  return `"${String(identifier || LOCAL_STR_EMPTY).replaceAll(LOCAL_STR_AU1TP, LOCAL_STR_1YZ14)}"`;
}

function normalizeInteger(value, fallback = LOCAL_NUM_ZERO) {
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
  if (!Number.isFinite(parsed) || parsed < LOCAL_NUM_ZERO) {
    return LOCAL_NUM_ZERO;
  }
  return parsed;
}

function resolvePartitionIdList(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .map((row) => String(row?.[MIGRATION_COLUMN.PARTITION_ID] || LOCAL_STR_EMPTY).trim())
    .filter((partitionId) => partitionId.length > LOCAL_NUM_ZERO);
}

function mapStageIndex(status) {
  return MIGRATION_STAGE_ORDER.indexOf(status);
}

function resolveDefaultLiteral(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === LOCAL_STR_NUMBER) {
    return value;
  }
  if (typeof value === LOCAL_STR_BOOLEAN) {
    return value ? LOCAL_NUM_ONE : LOCAL_NUM_ZERO;
  }
  return String(value);
}

const MIGRATION_COORDINATOR_LIFECYCLE_METHODS =
  createMigrationCoordinatorLifecycleMethods({
    LOCAL_NUM_ZERO,
    LOCAL_STR_EMPTY,
    MIGRATION_CANCELLABLE_STAGES,
    MIGRATION_ERROR_MSG,
    MIGRATION_LOG_MSG,
    MIGRATION_SQL,
    MIGRATION_STAGE_REASON,
    MIGRATION_STATUS,
    MIGRATION_TERMINAL_STATUSES,
    TABLES,
    resolvePartitionIdList,
  });

const MIGRATION_COORDINATOR_STAGE_METHODS =
  createMigrationCoordinatorStageMethods({
    LOCAL_NUM_ONE,
    LOCAL_NUM_ZERO,
    LOCAL_STR_15T8X,
    LOCAL_STR_16VMA,
    LOCAL_STR_16VZX,
    LOCAL_STR_18RRO,
    LOCAL_STR_1A9V5,
    LOCAL_STR_1D25J,
    LOCAL_STR_1H4U6,
    LOCAL_STR_1S5V1,
    LOCAL_STR_1UZWJ,
    LOCAL_STR_9U4IH,
    LOCAL_STR_BEGIN,
    LOCAL_STR_COMMIT,
    LOCAL_STR_EMPTY,
    LOCAL_STR_NUMBER,
    LOCAL_STR_ROLLBACK,
    MIGRATION_COLUMN,
    MIGRATION_DEFAULT,
    MIGRATION_ERROR_MSG,
    MIGRATION_LOG_MSG,
    MIGRATION_PARTITION_OPERATION,
    MIGRATION_SQL,
    MIGRATION_STAGE_REASON,
    MIGRATION_STATUS,
    MIGRATION_TERMINAL_STATUSES,
    MIGRATION_TYPE,
    formatBackfillCursor,
    mapStageIndex,
    normalizeInteger,
    parseBackfillCursor,
    parseJsonSafe,
    quoteIdentifier,
    resolveDefaultLiteral,
    sleep,
  });

class MigrationCoordinator {
  constructor(options = {}) {
    this.sqlCore = options.sqlCore || null;
    if (!this.sqlCore || typeof this.sqlCore.executeQuery !== LOCAL_STR_FUNCTION) {
      throw new Error(MIGRATION_ERROR_MSG.SQL_CORE_REQUIRED);
    }

    this.systemTableCache = options.systemTableCache || null;
    if (!this.systemTableCache) {
      throw new Error(MIGRATION_ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED);
    }

    this.transactionCoordinator = options.transactionCoordinator || null;
    this.logger = options.logger || console;
    this.now = typeof options.now === LOCAL_STR_FUNCTION ?
      options.now :
      () => Date.now();
    this.workflowCoordinator = options.workflowCoordinator ||
      new DurableWorkflowCoordinator({now: this.now});

    this.migrationOperationLane = new OperationLane({
      name: LOCAL_STR_SCHEMA_MIGRATION,
      workflowCoordinator: this.workflowCoordinator,
      ownerKeyFactory: ({migrationId, ownerKey}) =>
        String(ownerKey || migrationId || LOCAL_STR_EMPTY),
    });
    this.migrationTimeoutPolicy = new TimeoutPolicy({
      operationName: LOCAL_STR_SCHEMA_MIGRATION_2,
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
    if (byId.rows.length > LOCAL_NUM_ZERO) {
      return byId.rows[LOCAL_NUM_ZERO];
    }

    const byName = await this.executeSql(
      MIGRATION_SQL.SELECT_TABLE_BY_NAME,
      [normalized],
      {},
      true,
    );
    return byName.rows[LOCAL_NUM_ZERO] || null;
  }

  async findActiveMigrationByTableId(tableId) {
    const result = await this.executeSql(
      MIGRATION_SQL.SELECT_MIGRATIONS_BY_TABLE,
      [tableId],
      {},
      true,
    );
    return result.rows.find((row) => {
      return !MIGRATION_TERMINAL_STATUSES.has(String(row.status || LOCAL_STR_EMPTY));
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
    return result.rows[LOCAL_NUM_ZERO] || null;
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
    if (previousIndex < LOCAL_NUM_ZERO || nextIndex < LOCAL_NUM_ZERO) {
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
    if (alterSpec && typeof alterSpec === LOCAL_STR_OBJECT) {
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
    if (!queryExecutor || typeof queryExecutor.executeOnPartition !== LOCAL_STR_FUNCTION) {
      throw new Error(LOCAL_STR_1G5VR);
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
    return this.cancellationRequestedByMigrationId.has(String(migrationId || LOCAL_STR_EMPTY));
  }
}

Object.assign(
  MigrationCoordinator.prototype,
  MIGRATION_COORDINATOR_LIFECYCLE_METHODS,
  MIGRATION_COORDINATOR_STAGE_METHODS,
);

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
