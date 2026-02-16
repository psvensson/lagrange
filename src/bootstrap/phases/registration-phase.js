/**
 * Registration Phase - Delegation adapter with compatibility helpers.
 *
 * Legacy phase entry point retained for API compatibility.
 * Canonical phase execution logic is owned by bootstrap phase owners.
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../../logging/logging-service.js';
import {assertCritical} from '../../utils/assert.js';
import {
  NUM,
  TYPEOF,
} from '../../constants/index.js';
import {
  BOOTSTRAP_SUBSYSTEM,
  BOOTSTRAP_LOG_MSG,
} from '../bootstrap-constants.js';
import {
  SystemTableName,
  SERVICE_DEFINITIONS_SCHEMA,
  generateCreateTableSQL,
  generateCreateIndexSQL,
} from '../system-table-schemas-constants.js';
import {
  SD_COL,
  SERVICE_DEFINITION_COLUMN_LIST,
} from '../../wasm-service/wasm-service-models.js';
import {
  registerBuiltInMetaServiceDefinitions,
} from '../shared/meta-service-definition-registration.js';

/**
 * Phase constants for registration.
 */
const REGISTRATION_PHASE = Object.freeze({
  NAME: 'registration',
  EVENT_START: 'registration:start',
  EVENT_COMPLETE: 'registration:complete',
  EVENT_FAILED: 'registration:failed',
});

const REGISTRATION_SQL = Object.freeze({
  BEGIN_TRANSACTION: 'BEGIN IMMEDIATE',
  COMMIT_TRANSACTION: 'COMMIT',
  ROLLBACK_TRANSACTION: 'ROLLBACK',
  NOW_MS_EXPR: 'CAST(strftime(\'%s\', \'now\') AS INTEGER) * 1000',
});

const SERVICE_DEFINITION_MIGRATION = Object.freeze({
  TEMP_TABLE_SUFFIX: '__migrating',
});

const PHASE_ERROR = Object.freeze({
  EXECUTE_OWNER_REQUIRED:
    'RegistrationPhase requires executeOwner delegation function',
});

/**
 * RegistrationPhase delegation adapter.
 *
 * Note: helper methods used by compatibility tests remain here and are
 * considered part of the registration compatibility surface.
 */
class RegistrationPhase extends EventEmitter {
  /**
   * @param {Object} options - Phase options.
   * @param {string} options.nodeId - Node ID (required).
   * @param {Map} options.partitionServices - Partition services (required).
   * @param {Map} options.messageGroupServices - Message group services (required).
   * @param {Object} options.cdcIntegrationService - CDC integration service (required).
   * @param {Function} options.getLeaderMessageGroupService - Leader resolver (required).
   * @param {Function} options.getSystemTableCache - Cache resolver (required).
   * @param {Function} [options.executeOwner] - Canonical owner execute function.
   * @param {Function} [options.cleanupOwner] - Canonical owner cleanup function.
   */
  constructor(options = {}) {
    super();

    this.nodeId = assertCritical(
      options.nodeId,
      'nodeId is required for RegistrationPhase',
    );
    this.partitionServices = assertCritical(
      options.partitionServices,
      'partitionServices is required for RegistrationPhase',
    );
    this.messageGroupServices = assertCritical(
      options.messageGroupServices,
      'messageGroupServices is required for RegistrationPhase',
    );
    this.cdcIntegrationService = assertCritical(
      options.cdcIntegrationService,
      'cdcIntegrationService is required for RegistrationPhase',
    );
    this.getLeaderMessageGroupService = assertCritical(
      options.getLeaderMessageGroupService,
      'getLeaderMessageGroupService is required for RegistrationPhase',
    );
    this.getSystemTableCache = assertCritical(
      options.getSystemTableCache,
      'getSystemTableCache is required for RegistrationPhase',
    );

    this.executeOwner = typeof options.executeOwner === TYPEOF.FUNCTION ?
      options.executeOwner :
      null;
    this.cleanupOwner = typeof options.cleanupOwner === TYPEOF.FUNCTION ?
      options.cleanupOwner :
      null;

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(BOOTSTRAP_SUBSYSTEM.SERVICE) :
      console;
  }

  /**
   * Execute via canonical owner callback.
   * @return {Promise<Object>} Phase result.
   */
  async execute() {
    const startTime = Date.now();

    this.emit(REGISTRATION_PHASE.EVENT_START, {
      nodeId: this.nodeId,
    });

    try {
      if (typeof this.executeOwner !== TYPEOF.FUNCTION) {
        throw new Error(PHASE_ERROR.EXECUTE_OWNER_REQUIRED);
      }

      const ownerResult = await this.executeOwner(this);
      const result = ownerResult && typeof ownerResult === TYPEOF.OBJECT ?
        ownerResult :
        {};

      const phaseResult = {
        phaseName: result.phaseName || REGISTRATION_PHASE.NAME,
        duration: typeof result.duration === TYPEOF.NUMBER ?
          result.duration :
          Date.now() - startTime,
        services: result.services || {},
        metadata: result.metadata || {},
      };

      this.emit(REGISTRATION_PHASE.EVENT_COMPLETE, phaseResult);
      return phaseResult;
    } catch (error) {
      this.emit(REGISTRATION_PHASE.EVENT_FAILED, {
        phaseName: REGISTRATION_PHASE.NAME,
        duration: Date.now() - startTime,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Ensure service_definitions schema matches the canonical contract.
   * @param {Object} leaderPartition - Leader partition service.
   * @return {Promise<void>}
   */
  async ensureServiceDefinitionsSchema(leaderPartition) {
    const tableInfo = await this.loadServiceDefinitionTableInfo(
      leaderPartition,
    );
    const existingColumns = new Set(tableInfo.map((row) => row.name));
    const missingColumns = SERVICE_DEFINITION_COLUMN_LIST.filter(
      (columnName) => !existingColumns.has(columnName),
    );
    const handlerColumn = tableInfo.find(
      (row) => row.name === SD_COL.HANDLER_FUNCTION_ID,
    );
    const handlerIsNotNull = Boolean(
      handlerColumn && handlerColumn.notNull === NUM.ONE,
    );

    if (missingColumns.length === NUM.ZERO && !handlerIsNotNull) {
      return;
    }

    this.logger.info(
      BOOTSTRAP_LOG_MSG.SERVICE_DEFINITIONS_SCHEMA_MIGRATING,
      {
        nodeId: this.nodeId,
        tableName: SystemTableName.SERVICE_DEFINITIONS,
        missingColumns,
        handlerIsNotNull,
      },
    );

    await this.migrateServiceDefinitionsTable(
      leaderPartition,
      existingColumns,
    );
  }

  /**
   * Read service_definitions table-info metadata.
   * @param {Object} leaderPartition - Leader partition service.
   * @return {Promise<Array<Object>>} Column metadata rows.
   */
  async loadServiceDefinitionTableInfo(leaderPartition) {
    const tableName = SystemTableName.SERVICE_DEFINITIONS;
    const sql = 'SELECT name, "notnull" AS notNull FROM ' +
      `pragma_table_info('${tableName}')`;
    const result = await leaderPartition.executeLocalQuery(sql, []);
    if (!result || result.success === false || !Array.isArray(result.rows)) {
      const errorMsg = result?.error || 'Unknown error';
      throw new Error(
        `Failed to inspect ${tableName} schema: ${errorMsg}`,
      );
    }
    return result.rows || [];
  }

  /**
   * Migrate service_definitions table to the canonical schema.
   * @param {Object} leaderPartition - Leader partition service.
   * @param {Set<string>} existingColumns - Current column-name set.
   * @return {Promise<void>}
   */
  async migrateServiceDefinitionsTable(leaderPartition, existingColumns) {
    const sourceTable = SystemTableName.SERVICE_DEFINITIONS;
    const tempTable = `${sourceTable}` +
      `${SERVICE_DEFINITION_MIGRATION.TEMP_TABLE_SUFFIX}`;
    const tempSchema = {
      ...SERVICE_DEFINITIONS_SCHEMA,
      tableName: tempTable,
    };
    const insertColumns = SERVICE_DEFINITION_COLUMN_LIST.join(', ');
    const selectColumns = SERVICE_DEFINITION_COLUMN_LIST
      .map(
        (columnName) => this.buildServiceDefinitionSelectColumn(
          columnName,
          existingColumns,
        ),
      )
      .join(', ');
    const copySql = `INSERT INTO ${tempTable} (${insertColumns}) ` +
      `SELECT ${selectColumns} FROM ${sourceTable}`;
    const dropSql = `DROP TABLE ${sourceTable}`;
    const renameSql = `ALTER TABLE ${tempTable} RENAME TO ${sourceTable}`;

    await this.executeMigrationSql(
      leaderPartition,
      REGISTRATION_SQL.BEGIN_TRANSACTION,
      'begin transaction',
    );
    try {
      await this.executeMigrationSql(
        leaderPartition,
        generateCreateTableSQL(tempSchema),
        'create temporary service_definitions table',
      );
      await this.executeMigrationSql(
        leaderPartition,
        copySql,
        'copy rows into temporary service_definitions table',
      );
      await this.executeMigrationSql(
        leaderPartition,
        dropSql,
        'drop legacy service_definitions table',
      );
      await this.executeMigrationSql(
        leaderPartition,
        renameSql,
        'rename migrated service_definitions table',
      );

      const indexStatements = generateCreateIndexSQL(
        SERVICE_DEFINITIONS_SCHEMA,
      );
      for (const indexSql of indexStatements) {
        await this.executeMigrationSql(
          leaderPartition,
          indexSql,
          'create service_definitions index',
        );
      }

      await this.executeMigrationSql(
        leaderPartition,
        REGISTRATION_SQL.COMMIT_TRANSACTION,
        'commit transaction',
      );
    } catch (error) {
      try {
        await leaderPartition.executeLocalQuery(
          REGISTRATION_SQL.ROLLBACK_TRANSACTION,
          [],
        );
      } catch {
        // Best effort rollback.
      }
      throw error;
    }

    this.logger.info(
      BOOTSTRAP_LOG_MSG.SERVICE_DEFINITIONS_SCHEMA_MIGRATED,
      {
        nodeId: this.nodeId,
        tableName: sourceTable,
      },
    );
  }

  /**
   * Build SELECT projection SQL for service_definitions migration copy.
   * @param {string} columnName - Canonical destination column name.
   * @param {Set<string>} existingColumns - Current source columns.
   * @return {string} SQL projection expression with alias.
   */
  buildServiceDefinitionSelectColumn(columnName, existingColumns) {
    if (existingColumns.has(columnName)) {
      return columnName;
    }

    const defaultSql = this.getServiceDefinitionColumnDefaultSql(
      columnName,
    );
    return `${defaultSql} AS ${columnName}`;
  }

  /**
   * Resolve default SQL expression for a missing service_definitions column.
   * @param {string} columnName - Missing column name.
   * @return {string} SQL expression for migration backfill.
   */
  getServiceDefinitionColumnDefaultSql(columnName) {
    const schemaColumn = SERVICE_DEFINITIONS_SCHEMA.columns.find(
      (column) => column.name === columnName,
    );
    if (schemaColumn && schemaColumn.defaultValue !== undefined) {
      return `${schemaColumn.defaultValue}`;
    }

    if (columnName === SD_COL.CREATED_AT ||
        columnName === SD_COL.UPDATED_AT) {
      return REGISTRATION_SQL.NOW_MS_EXPR;
    }

    if (columnName === SD_COL.HANDLER_FUNCTION_ID ||
        columnName === SD_COL.RUNTIME_KIND ||
        columnName === SD_COL.RUNTIME_REF ||
        columnName === SD_COL.RUNTIME_CONFIG) {
      return 'NULL';
    }

    throw new Error(
      `No default SQL expression available for column: ${columnName}`,
    );
  }

  /**
   * Execute migration SQL and fail-fast on unsuccessful query results.
   * @param {Object} leaderPartition - Leader partition service.
   * @param {string} sql - SQL statement to execute.
   * @param {string} context - Human-readable operation context.
   * @return {Promise<void>}
   */
  async executeMigrationSql(leaderPartition, sql, context) {
    const result = await leaderPartition.executeLocalQuery(sql, []);
    if (!result || result.success === false) {
      const errorMsg = result?.error || 'Unknown error';
      throw new Error(
        `service_definitions migration failed (${context}): ${errorMsg}`,
      );
    }
  }

  /**
   * Register built-in meta-service definitions.
   * @param {number} _now - Unused timestamp parameter retained for compatibility.
   * @return {Promise<void>}
   */
  async registerMetaServiceDefinitions(_now) {
    const metaServices = await registerBuiltInMetaServiceDefinitions({
      upsertRow: async (tableName, row) => {
        await this.cdcIntegrationService.upsertSystemTableRow(tableName, row);
      },
    });

    this.logger.debug(BOOTSTRAP_LOG_MSG.SERVICES_REGISTERED, {
      metaServices,
    });
  }

  /**
   * Cleanup via canonical owner callback.
   * @return {Promise<void>}
   */
  async cleanup() {
    if (typeof this.cleanupOwner === TYPEOF.FUNCTION) {
      await this.cleanupOwner(this);
    }
  }
}

export {RegistrationPhase, REGISTRATION_PHASE};
