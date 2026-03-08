import {QUERY_AST_TYPE, QUERY_OPERATION} from '../query/query-constants.js';
import {
  MIGRATION_ERROR_MSG,
  MIGRATION_STATUS,
  MIGRATION_TYPE,
} from './migration-constants.js';

const ALTER_ACTION = Object.freeze({
  ADD: 'add',
  DROP: 'drop',
  RENAME: 'rename',
  ALTER: 'alter',
});

const MIGRATION_PIPELINE_ERROR_MSG = Object.freeze({
  MIGRATION_COORDINATOR_REQUIRED:
    'MigrationPipeline requires migrationCoordinator',
  INVALID_ALTER_TABLE_AST: 'Invalid ALTER TABLE AST',
  ALTER_TABLE_TARGET_REQUIRED: 'ALTER TABLE target table is required',
  UNSUPPORTED_ALTER_RESOURCE_PREFIX: 'Unsupported ALTER TABLE resource: ',
  COLUMN_NAME_REQUIRED: 'ALTER TABLE column name is required',
  NEW_COLUMN_NAME_REQUIRED: 'ALTER TABLE new column name is required',
  DATA_TYPE_REQUIRED: 'ALTER TABLE data type is required',
  TABLE_NOT_FOUND_PREFIX: 'Table not found for ALTER TABLE: ',
});

class MigrationPipeline {
  constructor(options = {}) {
    this.migrationCoordinator = options.migrationCoordinator || null;
    if (!this.migrationCoordinator) {
      throw new Error(MIGRATION_PIPELINE_ERROR_MSG.MIGRATION_COORDINATOR_REQUIRED);
    }
    this.logger = options.logger || console;
  }

  resolveMigrationType(operation = {}) {
    const action = String(operation.action || '').toLowerCase();
    if (action === ALTER_ACTION.ADD) {
      return MIGRATION_TYPE.ADD_COLUMN;
    }
    if (action === ALTER_ACTION.DROP) {
      return MIGRATION_TYPE.DROP_COLUMN;
    }
    if (action === ALTER_ACTION.RENAME) {
      return MIGRATION_TYPE.RENAME_COLUMN;
    }
    if (action === ALTER_ACTION.ALTER) {
      return MIGRATION_TYPE.ALTER_COLUMN_TYPE;
    }
    return null;
  }

  buildAlterSpec(ast) {
    if (!ast || ast.type !== QUERY_AST_TYPE.ALTER_TABLE || !ast.operation) {
      throw new Error(MIGRATION_PIPELINE_ERROR_MSG.INVALID_ALTER_TABLE_AST);
    }
    const tableName = String(ast.table || '').trim();
    if (!tableName) {
      throw new Error(MIGRATION_PIPELINE_ERROR_MSG.ALTER_TABLE_TARGET_REQUIRED);
    }

    const operationResource = String(ast.operation.resource || '').toLowerCase();
    if (operationResource && operationResource !== 'column') {
      throw new Error(
        `${MIGRATION_PIPELINE_ERROR_MSG.UNSUPPORTED_ALTER_RESOURCE_PREFIX}` +
        `${operationResource}`,
      );
    }

    const migrationType = this.resolveMigrationType(ast.operation);
    if (!migrationType || !Object.values(MIGRATION_TYPE).includes(migrationType)) {
      throw new Error(`${MIGRATION_ERROR_MSG.UNSUPPORTED_MIGRATION_TYPE_PREFIX}${ast.operation.action}`);
    }

    const baseSpec = {
      migrationType,
      sql: String(ast.rawSql || '').trim(),
    };
    const columnName = String(ast.operation.columnName || '').trim();
    const dataType = ast.operation.dataType || null;

    if (migrationType === MIGRATION_TYPE.ADD_COLUMN) {
      if (!columnName) {
        throw new Error(MIGRATION_PIPELINE_ERROR_MSG.COLUMN_NAME_REQUIRED);
      }
      if (!dataType) {
        throw new Error(MIGRATION_PIPELINE_ERROR_MSG.DATA_TYPE_REQUIRED);
      }
      return {
        ...baseSpec,
        columnName,
        dataType,
        defaultValue: ast.operation.defaultValue ?? null,
      };
    }

    if (migrationType === MIGRATION_TYPE.DROP_COLUMN) {
      if (!columnName) {
        throw new Error(MIGRATION_PIPELINE_ERROR_MSG.COLUMN_NAME_REQUIRED);
      }
      return {
        ...baseSpec,
        columnName,
      };
    }

    if (migrationType === MIGRATION_TYPE.RENAME_COLUMN) {
      const newColumnName = String(ast.operation.newColumnName || '').trim();
      if (!columnName) {
        throw new Error(MIGRATION_PIPELINE_ERROR_MSG.COLUMN_NAME_REQUIRED);
      }
      if (!newColumnName) {
        throw new Error(MIGRATION_PIPELINE_ERROR_MSG.NEW_COLUMN_NAME_REQUIRED);
      }
      return {
        ...baseSpec,
        columnName,
        newColumnName,
      };
    }

    if (!columnName) {
      throw new Error(MIGRATION_PIPELINE_ERROR_MSG.COLUMN_NAME_REQUIRED);
    }
    if (!dataType) {
      throw new Error(MIGRATION_PIPELINE_ERROR_MSG.DATA_TYPE_REQUIRED);
    }
    return {
      ...baseSpec,
      columnName,
      dataType,
    };
  }

  async handleAlterTable(ast, sessionId = null) {
    const alterSpec = this.buildAlterSpec(ast);
    const tableRef = String(ast.table || '').trim();
    const tableMetadata = await this.migrationCoordinator.resolveTableMetadata(
      tableRef,
    );
    if (!tableMetadata) {
      throw new Error(`${MIGRATION_PIPELINE_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableRef}`);
    }

    const activeMigration =
      await this.migrationCoordinator.findActiveMigrationByTableId(
        tableMetadata.table_id,
      );
    if (activeMigration) {
      throw new Error(
        `${MIGRATION_ERROR_MSG.ACTIVE_MIGRATION_CONFLICT_PREFIX}` +
        `${activeMigration.migration_id}`,
      );
    }

    const migrationId = await this.migrationCoordinator.initiateMigration(
      tableMetadata.table_id,
      alterSpec,
    );

    return {
      success: true,
      operation: QUERY_OPERATION.ALTER_TABLE,
      migrationId,
      tableId: tableMetadata.table_id,
      tableName: tableMetadata.table_name,
      status: MIGRATION_STATUS.PENDING,
      sessionId,
    };
  }
}

export {MigrationPipeline, MIGRATION_PIPELINE_ERROR_MSG};
