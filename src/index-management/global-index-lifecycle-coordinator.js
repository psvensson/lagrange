/**
 * Global Secondary Index lifecycle coordinator.
 * Integrates catalog state machine, physical dataset manager, resumable
 * fail-closed backfill, TX1 synchronous write maintenance, and Stage 2
 * current-owner read routing into a cohesive coordinator for Release 0.3.
 *
 * Requirements: J5 (RM-0.3-qs-non-unique-gsi).
 */

import {
  GLOBAL_INDEX_STATE,
  assertSupportedGlobalIndexDefinition,
  checkIndexExistence,
  createGlobalIndexRecord,
  findCatalogTarget,
  normalizeGlobalIndexRecord,
  resolveBackfillOutcome,
  resolveGlobalCreateSchemaContext,
} from './global-index-catalog-contract.js';
import {GlobalIndexDatasetManager} from './global-index-dataset-manager.js';
import {GlobalIndexBackfillCoordinator} from './global-index-backfill-coordinator.js';
import {GlobalIndexWriteMaintenance} from './global-index-write-maintenance.js';
import {sortRowsByOrderBy} from './global-index-production-wiring.js';
import {
  GLOBAL_INDEX_ACCESS_PATH,
  GlobalIndexReadRouter,
} from './global-index-read-router.js';

const LOCAL_STR_COMMA = ',';
const LOCAL_STR_ID = 'id';
const LOCAL_STR_COLON_COLON = '::';

const SQL_DML_VERB = Object.freeze({
  INSERT: 'INSERT',
  DELETE: 'DELETE',
  UPDATE: 'UPDATE',
  UNKNOWN: 'UNKNOWN',
});

const SQL_TX_COMMAND = Object.freeze({
  BEGIN_IMMEDIATE: 'BEGIN IMMEDIATE',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
});

const LIFECYCLE_ERROR_MSG = Object.freeze({
  TX1_TEST_ABORT: 'TX1 transaction aborted by test injection',
  PARTICIPANT_UNAVAILABLE: 'Index participant database unavailable',
});

const ERROR_CODE_PARTICIPANT_UNAVAILABLE = 'INDEX_PARTICIPANT_UNAVAILABLE';

/**
 * Parse a CREATE GLOBAL INDEX DDL statement into definition components.
 * @param {string} ddl - SQL DDL statement.
 * @return {Object} Parsed definition.
 */
export function parseGlobalIndexDdl(ddl) {
  const match = String(ddl).match(
    /CREATE\s+(UNIQUE\s+)?GLOBAL\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s]+)\s+ON\s+([^\s(]+)\s*\(([^)]+)\)/i,
  );
  if (!match) {
    throw new Error(`Invalid CREATE GLOBAL INDEX DDL statement: ${ddl}`);
  }
  const isUnique = Boolean(match[1]);
  const ifNotExists = /CREATE\s+(?:UNIQUE\s+)?GLOBAL\s+INDEX\s+IF\s+NOT\s+EXISTS\b/i.test(ddl);
  const indexName = match[2].trim().replace(/^[`"']|[`"']$/g, '');
  const tableName = match[3].trim().replace(/^[`"']|[`"']$/g, '');
  const columnNames = match[4].split(LOCAL_STR_COMMA).map((c) => {
    return c.trim().replace(/^[`"']|[`"']$/g, '');
  });

  return {
    indexName,
    tableName,
    columnNames,
    isGlobal: true,
    isUnique,
    ifNotExists,
  };
}

function inferWriteType(statementType, beforeCount, afterCount) {
  if (statementType) {
    return statementType.toUpperCase();
  }
  if (beforeCount === 0 && afterCount > 0) return SQL_DML_VERB.INSERT;
  if (beforeCount > 0 && afterCount === 0) return SQL_DML_VERB.DELETE;
  if (beforeCount > 0 && afterCount > 0) return SQL_DML_VERB.UPDATE;
  return SQL_DML_VERB.UNKNOWN;
}

function buildRowPkKey(row, pkCols) {
  return pkCols.map((c) => String(row[c])).join(LOCAL_STR_COLON_COLON);
}

function planMultiRowDelete(maintenance, context) {
  const {tableName, basePartitionId, beforeRows, basePrimaryKeyColumns} = context;
  const rows = Array.isArray(beforeRows) ? beforeRows : [beforeRows];
  const operations = [];
  const enlistedSet = new Set();
  for (const deletedRow of rows) {
    const plan = maintenance.planDeleteMaintenance({
      tableName,
      basePartitionId,
      deletedRow,
      basePrimaryKeyColumns,
    });
    operations.push(...plan.operations);
    for (const p of plan.enlistedIndexPartitions) enlistedSet.add(p);
  }
  return {operations, enlistedIndexPartitions: Array.from(enlistedSet).sort()};
}

function planMultiRowUpdate(maintenance, context) {
  const {tableName, basePartitionId, beforeRows, afterRows, basePrimaryKeyColumns} = context;
  const oldList = Array.isArray(beforeRows) ? beforeRows : [beforeRows];
  const newList = Array.isArray(afterRows) ? afterRows : [afterRows];
  const pkCols = basePrimaryKeyColumns || [LOCAL_STR_ID];

  const newRowMap = new Map();
  for (const row of newList) {
    newRowMap.set(buildRowPkKey(row, pkCols), row);
  }

  const operations = [];
  const enlistedSet = new Set();
  for (const oldRow of oldList) {
    const pkKey = buildRowPkKey(oldRow, pkCols);
    const newRow = newRowMap.get(pkKey);
    if (!newRow) continue;
    const plan = maintenance.planUpdateMaintenance({
      tableName,
      basePartitionId,
      oldRow,
      newRow,
      basePrimaryKeyColumns: pkCols,
    });
    operations.push(...plan.operations);
    for (const p of plan.enlistedIndexPartitions) enlistedSet.add(p);
  }
  return {operations, enlistedIndexPartitions: Array.from(enlistedSet).sort()};
}

export function planGlobalIndexWriteOperations(maintenance, context) {
  const beforeCount = Array.isArray(context.beforeRows) ? context.beforeRows.length : 0;
  const afterCount = Array.isArray(context.afterRows) ? context.afterRows.length : 0;
  const opType = inferWriteType(context.statementType, beforeCount, afterCount);

  if (opType === SQL_DML_VERB.INSERT) {
    return maintenance.planInsertMaintenance({
      tableName: context.tableName,
      basePartitionId: context.basePartitionId,
      insertedRows: context.afterRows,
      basePrimaryKeyColumns: context.basePrimaryKeyColumns,
    });
  }
  if (opType === SQL_DML_VERB.DELETE) {
    return planMultiRowDelete(maintenance, context);
  }
  if (opType === SQL_DML_VERB.UPDATE) {
    return planMultiRowUpdate(maintenance, context);
  }
  return {operations: [], enlistedIndexPartitions: []};
}

function normalizeGlobalIndexDefinition(ddlOrAst, options) {
  const rawDef = typeof ddlOrAst === 'string' ?
    parseGlobalIndexDdl(ddlOrAst) :
    ddlOrAst;
  const isUnique = Boolean(
    rawDef.isUnique || rawDef.unique || options.isUnique || options.unique,
  );
  const isGlobal = rawDef.isGlobal !== false && rawDef.global !== false;
  const columnNames =
    rawDef.columnNames || rawDef.columns || options.columnNames || options.columns;
  return {
    ...rawDef,
    isUnique,
    isGlobal,
    columnNames,
  };
}

/**
 * End-to-end coordinator for Global Secondary Index lifecycle.
 */
export class GlobalIndexLifecycleCoordinator {
  /**
   * @param {Object} [options={}]
   */
  constructor(options = {}) {
    this.catalog = new Map();
    this.generations = new Map();
    this.basePartitionsByTable = new Map();
    this.indexPartitionsByName = new Map();
    this.partitionDatabases = new Map();
    this.logger = options.logger || console;
    this.externalGetBaseTablePartitions = options.getBaseTablePartitions || null;
    this.externalGetIndexPartitions = options.getIndexPartitions || null;
    this.resolvePartitionDatabase = options.resolvePartitionDatabase || null;
    this.resolveTableSchema = options.resolveTableSchema || null;
    this.refreshCatalogPartitions = options.refreshCatalogPartitions || null;
    this.onCatalogInsert = options.onCatalogInsert || null;
    this.onCatalogUpdate = options.onCatalogUpdate || null;
    this.onCatalogDelete = options.onCatalogDelete || null;

    this.metrics = {
      totalWrites: 0,
      writesByActiveIndexCount: {},
      fanoutByActiveIndexCount: {},
      latencyHistory: [],
    };
    this.suppressedRollbackErrors = 0;

    this._initializeComponents(options);
    if (options.bindCoordinator) {
      options.bindCoordinator(this);
    }
  }

  _initializeComponents(options) {
    this.datasetManager = options.datasetManager || new GlobalIndexDatasetManager({
      getIndexPartitions: (idx) => this.getIndexPartitions(idx),
    });

    this.backfillCoordinator = options.backfillCoordinator || new GlobalIndexBackfillCoordinator({
      batchSize: options.batchSize,
      getBaseTablePartitions: (tbl) => this.getBaseTablePartitions(tbl),
      getIndexPartitions: (idx) => this.getIndexPartitions(idx),
      fetchBasePartitionBatch: options.fetchBasePartitionBatch,
      verifyBaseRowImage: options.verifyBaseRowImage,
      writeIndexBatch: options.writeIndexBatch,
      updateIndexCheckpoint: async (update) => this._updateCatalogRecord(update),
      logger: this.logger,
    });

    this.writeMaintenance = options.writeMaintenance || new GlobalIndexWriteMaintenance({
      getIndexCatalog: (tbl) => this.getIndexesForTable(tbl),
      getIndexPartitions: (idx) => this.getIndexPartitions(idx),
      logger: this.logger,
    });

    this.readRouter = options.readRouter || new GlobalIndexReadRouter({
      getIndexCatalog: (tbl) => this.getIndexesForTable(tbl),
      getIndexPartitions: (idx) => this.getIndexPartitions(idx),
      getBaseTablePartitions: (tbl) => this.getBaseTablePartitions(tbl),
      resolveBasePartitionId: options.resolveBasePartitionId || null,
      executeIndexScan: options.executeIndexScan,
      executeBaseFetch: options.executeBaseFetch,
      executeScatterGather: options.executeScatterGather,
      logger: this.logger,
    });
  }

  /**
   * Register partitions for a base table.
   * @param {string} tableName
   * @param {Object[]} partitions
   */
  registerBasePartitions(tableName, partitions) {
    this.basePartitionsByTable.set(tableName, Array.isArray(partitions) ? [...partitions] : []);
  }

  /**
   * Register partitions for an index.
   * @param {string} indexName
   * @param {Object[]} partitions
   */
  registerIndexPartitions(indexName, partitions) {
    const list = Array.isArray(partitions) ? [...partitions] : [];
    this.indexPartitionsByName.set(indexName, list);
    this.datasetManager.registerIndexPartitions(indexName, list);
  }

  /**
   * Register an SQLite database handle for a partition ID.
   * @param {string} partitionId
   * @param {Object} db
   */
  registerPartitionDatabase(partitionId, db) {
    this.partitionDatabases.set(partitionId, db);
  }

  /**
   * Get registered base partitions for a table.
   * @param {string} tableName
   * @return {Object[]}
   */
  getBaseTablePartitions(tableName) {
    if (this.basePartitionsByTable.has(tableName)) {
      return this.basePartitionsByTable.get(tableName);
    }
    if (this.externalGetBaseTablePartitions) {
      return this.externalGetBaseTablePartitions(tableName);
    }
    return [];
  }

  /**
   * Get registered index partitions for an index name.
   * @param {string} indexName
   * @return {Object[]}
   */
  getIndexPartitions(indexName) {
    if (this.indexPartitionsByName.has(indexName)) {
      return this.indexPartitionsByName.get(indexName);
    }
    if (this.externalGetIndexPartitions) {
      return this.externalGetIndexPartitions(indexName);
    }
    return [];
  }

  /**
   * Get normalized catalog records for all indexes on a table.
   * @param {string} tableName
   * @return {Object[]}
   */
  getIndexesForTable(tableName) {
    const results = [];
    for (const record of this.catalog.values()) {
      const normalized = normalizeGlobalIndexRecord(record);
      if (normalized.tableName === tableName || normalized.tableId === tableName) {
        results.push(normalized);
      }
    }
    return results;
  }

  /**
   * Get catalog record for an index by name.
   * @param {string} indexName
   * @return {Object|null}
   */
  getCatalogRecord(indexName) {
    const record = this.catalog.get(indexName);
    if (!record) return null;
    const normalized = normalizeGlobalIndexRecord(record);
    normalized.basePrimaryKeyColumns = record.basePrimaryKeyColumns ||
      record.base_primary_key_columns ||
      [LOCAL_STR_ID];
    normalized.index_generation = record.index_generation;
    return normalized;
  }

  /**
   * Get index catalog record by index name.
   * @param {string} indexName
   * @return {Object|null}
   */
  getIndex(indexName) {
    return this.getCatalogRecord(indexName);
  }

  async _saveCatalogRecord(record) {
    this.catalog.set(record.index_name || record.indexName, record);
    if (this.onCatalogInsert) {
      await this.onCatalogInsert(record);
    }
  }

  async _updateCatalogRecord(update) {
    const target = findCatalogTarget(this.catalog, update);
    if (!target) return;
    const activeId = target.index_id || target.indexId;
    if (update.indexId && activeId !== update.indexId) {
      return;
    }
    Object.assign(target, update);
    target.updated_at = update.updatedAt || Date.now();
    if (this.onCatalogUpdate) {
      await this.onCatalogUpdate(activeId, update, target);
    }
  }

  _provisionIndexDatasets(tableName, indexName, columnNames, basePrimaryKeyColumns, options) {
    const partitions = this.getIndexPartitions(indexName);
    if (this.resolvePartitionDatabase && partitions.length === 0) {
      throw new Error(`No index partitions available for global index '${indexName}'`);
    }
    for (const p of partitions) {
      const pId = p.partition_id || p.partitionId;
      const db = this._getPartitionDb(pId);
      if (db) {
        this.datasetManager.createIndexDataset(db, {
          tableName,
          indexName,
          columnNames,
          basePrimaryKeyColumns,
          columnTypes: options.columnTypes || {},
        });
      } else if (this.resolvePartitionDatabase) {
        const error = new Error(`${LIFECYCLE_ERROR_MSG.PARTICIPANT_UNAVAILABLE}: ${pId}`);
        error.code = ERROR_CODE_PARTICIPANT_UNAVAILABLE;
        throw error;
      }
    }
  }

  _dropIndexDatasets(tableName, indexName) {
    const partitions = this.getIndexPartitions(indexName);
    for (const p of partitions) {
      const pId = p.partition_id || p.partitionId;
      const db = this._getPartitionDb(pId);
      if (db) {
        this.datasetManager.dropIndexDataset(db, tableName, indexName);
      }
    }
  }

  _isGenerationCurrent(indexName, currentGen, indexId) {
    const liveGen = this.generations.get(indexName);
    if (liveGen !== currentGen) return false;
    const active = this.catalog.get(indexName);
    if (!active) return false;
    const activeId = active.index_id || active.indexId;
    return activeId === indexId;
  }

  async _runBackfillToCompletion(record, currentGen, options) {
    const indexId = record.indexId || record.index_id;
    const indexName = record.indexName || record.index_name;

    if (!this._isGenerationCurrent(indexName, currentGen, indexId)) {
      return {indexId, indexName, generation: currentGen, fenced: true};
    }

    const userYield = options.backfillOptions?.shouldYield;
    let resolvedBatchSize = options.batchSize;
    if (options.backfillOptions?.batchSize !== undefined) {
      resolvedBatchSize = options.backfillOptions.batchSize;
    }
    const backfillOptions = {
      ...options.backfillOptions,
      batchSize: resolvedBatchSize,
      shouldYield: (progress) => {
        if (!this._isGenerationCurrent(indexName, currentGen, indexId)) {
          return true;
        }
        return typeof userYield === 'function' ? userYield(progress) : false;
      },
    };

    try {
      const result = await this.backfillCoordinator.executeBackfill(
        record,
        backfillOptions,
      );
      const isCurrent = this._isGenerationCurrent(indexName, currentGen, indexId);
      const isInterrupted = Boolean(result?.interrupted);
      if (isCurrent && !isInterrupted) {
        await this._updateCatalogRecord({indexId, state: GLOBAL_INDEX_STATE.READ_WRITE});
      }
      return resolveBackfillOutcome({
        isCurrent,
        isInterrupted,
        indexId,
        indexName,
        currentGen,
        result,
      });
    } catch (err) {
      if (this._isGenerationCurrent(indexName, currentGen, indexId)) {
        await this._updateCatalogRecord({
          indexId,
          state: GLOBAL_INDEX_STATE.FAILED,
          errorMessage: err.message,
          lastError: err.message,
          last_error: err.message,
        });
      }
      throw err;
    }
  }

  /**
   * Create a global secondary index from DDL or AST object.
   * @param {string|Object} ddlOrAst
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async createGlobalIndex(ddlOrAst, options = {}) {
    if (this.refreshCatalogPartitions) await this.refreshCatalogPartitions();
    const def = normalizeGlobalIndexDefinition(ddlOrAst, options);
    assertSupportedGlobalIndexDefinition(def);

    if (checkIndexExistence(this.catalog, def, options)) {
      return this.getCatalogRecord(def.indexName);
    }

    const {indexName, tableName, columnNames} = def;
    const currentGen = this.generations.has(indexName) ? this.generations.get(indexName) : 1;
    this.generations.set(indexName, currentGen);

    const schemaInfo = this.resolveTableSchema ? this.resolveTableSchema(tableName) : null;
    const schemaCtx = resolveGlobalCreateSchemaContext(def, options, schemaInfo);
    const basePrimaryKeyColumns = schemaCtx.basePrimaryKeyColumns.length > 0 ?
      schemaCtx.basePrimaryKeyColumns :
      [LOCAL_STR_ID];
    const columnTypes = schemaCtx.columnTypes;
    const indexId = options.indexId || `${indexName}-gen${currentGen}`;

    const record = createGlobalIndexRecord({
      indexId,
      tableName,
      indexName,
      columnNames,
      state: GLOBAL_INDEX_STATE.CREATING,
      ...options,
    });
    record.index_generation = currentGen;
    record.basePrimaryKeyColumns = basePrimaryKeyColumns;
    await this._saveCatalogRecord(record);

    try {
      this._provisionIndexDatasets(
        tableName,
        indexName,
        columnNames,
        basePrimaryKeyColumns,
        {...options, columnTypes},
      );
    } catch (err) {
      await this._updateCatalogRecord({
        indexId,
        state: GLOBAL_INDEX_STATE.FAILED,
        errorMessage: err.message,
      });
      throw err;
    }

    await this._updateCatalogRecord({indexId, state: GLOBAL_INDEX_STATE.WRITE_ONLY});
    await this._updateCatalogRecord({indexId, state: GLOBAL_INDEX_STATE.BACKFILLING});

    if (options.deferBackfill === true) {
      return {
        indexId,
        indexName,
        generation: currentGen,
        state: GLOBAL_INDEX_STATE.BACKFILLING,
        deferred: true,
      };
    }

    return this._runBackfillToCompletion(record, currentGen, options);
  }

  /**
   * Resume an interrupted backfill from its durable checkpoint.
   * @param {string} indexName
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async resumeBackfill(indexName, options = {}) {
    if (this.refreshCatalogPartitions) await this.refreshCatalogPartitions();
    const record = this.getCatalogRecord(indexName);
    if (!record) throw new Error(`Index '${indexName}' not found`);
    if (options.basePrimaryKeyColumns) {
      record.basePrimaryKeyColumns = options.basePrimaryKeyColumns;
    } else if (this.resolveTableSchema) {
      const schemaInfo = this.resolveTableSchema(record.tableName);
      if (schemaInfo?.basePrimaryKeyColumns?.length > 0) {
        record.basePrimaryKeyColumns = schemaInfo.basePrimaryKeyColumns;
      }
    }
    const currentGen = this.generations.get(indexName) || record.index_generation || 1;
    return this._runBackfillToCompletion(record, currentGen, options);
  }

  /**
   * Drop a global secondary index, fencing any stale in-flight work.
   * @param {string} indexName
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async dropGlobalIndex(indexName, options = {}) {
    if (this.refreshCatalogPartitions) await this.refreshCatalogPartitions();
    const rawRecord = this.catalog.get(indexName);
    if (!rawRecord) {
      if (options.ifExists) return {dropped: false, indexName};
      throw new Error(`Index '${indexName}' not found`);
    }

    const indexId = rawRecord.index_id || rawRecord.indexId;
    await this._updateCatalogRecord({indexId, state: GLOBAL_INDEX_STATE.DROPPING});

    const currentGen = this.generations.get(indexName) || 1;
    this.generations.set(indexName, currentGen + 1);

    const tableName = rawRecord.table_name || rawRecord.tableName;
    this._dropIndexDatasets(tableName, indexName);

    this.catalog.delete(indexName);
    if (this.onCatalogDelete) await this.onCatalogDelete(rawRecord);
    return {dropped: true, indexName, priorGeneration: currentGen};
  }

  _getPartitionDb(partitionId, txContext) {
    if (txContext?.getDatabase) {
      const db = txContext.getDatabase(partitionId);
      if (db) return db;
    }
    if (this.partitionDatabases.has(partitionId)) {
      return this.partitionDatabases.get(partitionId);
    }
    if (this.resolvePartitionDatabase) {
      return this.resolvePartitionDatabase(partitionId);
    }
    return null;
  }

  _recordWriteMetric(tableName, activeIndexCount, participantFanout, latencyMs) {
    this.metrics.totalWrites++;
    this.metrics.writesByActiveIndexCount[activeIndexCount] =
      (this.metrics.writesByActiveIndexCount[activeIndexCount] || 0) + 1;
    this.metrics.fanoutByActiveIndexCount[activeIndexCount] = participantFanout;
    this.metrics.latencyHistory.push({
      tableName,
      activeIndexCount,
      participantFanout,
      latencyMs,
    });
  }

  _beginTransactions(participants, txContext) {
    const openDbs = [];
    for (const pId of participants) {
      const db = this._getPartitionDb(pId, txContext);
      if (!db || typeof db.exec !== 'function') {
        const error = new Error(`${LIFECYCLE_ERROR_MSG.PARTICIPANT_UNAVAILABLE}: ${pId}`);
        error.code = ERROR_CODE_PARTICIPANT_UNAVAILABLE;
        throw error;
      }
      db.exec(SQL_TX_COMMAND.BEGIN_IMMEDIATE);
      openDbs.push(db);
    }
    return openDbs;
  }

  _commitTransactions(openDbs) {
    for (const db of openDbs) {
      db.exec(SQL_TX_COMMAND.COMMIT);
    }
  }

  _rollbackTransactions(openDbs) {
    for (const db of openDbs) {
      try {
        db.exec(SQL_TX_COMMAND.ROLLBACK);
      } catch (_rbErr) {
        this.suppressedRollbackErrors = (this.suppressedRollbackErrors || 0) + 1;
      }
    }
  }

  _executeOperations(operations, txContext) {
    for (const op of operations) {
      const db = this._getPartitionDb(op.indexPartitionId, txContext);
      if (!db || typeof db.prepare !== 'function') {
        const error = new Error(
          `${LIFECYCLE_ERROR_MSG.PARTICIPANT_UNAVAILABLE}: ${op.indexPartitionId}`,
        );
        error.code = ERROR_CODE_PARTICIPANT_UNAVAILABLE;
        throw error;
      }
      db.prepare(op.sql).run(...op.params);
    }
  }

  async _executeParticipantWrite({participants, baseWriteFn, operations, txContext}) {
    let openDbs = [];
    try {
      openDbs = this._beginTransactions(participants, txContext);

      if (typeof baseWriteFn === 'function') {
        await baseWriteFn();
      }

      this._executeOperations(operations, txContext);

      if (txContext?.shouldFail) {
        throw new Error(LIFECYCLE_ERROR_MSG.TX1_TEST_ABORT);
      }

      this._commitTransactions(openDbs);
    } catch (err) {
      this._rollbackTransactions(openDbs);
      throw err;
    }
  }

  /**
   * Execute transactional write with synchronous global index maintenance.
   * Enlists affected base and index partitions and commits/aborts atomically.
   * @param {Object} writeContext
   * @return {Promise<Object>}
   */
  async executeTransactionalWrite(writeContext) {
    if (this.refreshCatalogPartitions) await this.refreshCatalogPartitions();
    const startTimeNs = process.hrtime.bigint();
    const {tableName, basePartitionId, baseWriteFn, txContext} = writeContext;
    let effectiveContext = writeContext;
    if (!writeContext.basePrimaryKeyColumns && this.resolveTableSchema) {
      const schemaInfo = this.resolveTableSchema(tableName);
      if (schemaInfo?.basePrimaryKeyColumns?.length > 0) {
        effectiveContext = {
          ...writeContext,
          basePrimaryKeyColumns: schemaInfo.basePrimaryKeyColumns,
        };
      }
    }

    const activeIndexes = this.writeMaintenance.getActiveIndexesForTable(tableName);
    const plan = planGlobalIndexWriteOperations(this.writeMaintenance, effectiveContext);
    const participants = Array.from(new Set([basePartitionId, ...plan.enlistedIndexPartitions]));
    const participantFanout = participants.length;

    await this._executeParticipantWrite({
      participants,
      baseWriteFn,
      operations: plan.operations,
      txContext,
    });

    const latencyMs = Number(process.hrtime.bigint() - startTimeNs) / 1e6;
    this._recordWriteMetric(tableName, activeIndexes.length, participantFanout, latencyMs);

    return {
      success: true,
      participantFanout,
      latencyMs,
      enlistedPartitions: participants,
    };
  }

  /**
   * Plan and execute read query via global secondary index or scatter-gather.
   * @param {Object} readContext
   * @return {Promise<Object[]>}
   */
  async planAndExecuteRead(readContext) {
    if (this.refreshCatalogPartitions) await this.refreshCatalogPartitions();
    const {
      tableName,
      where,
      whereClause,
      projectedColumns,
      executeScatterGatherRead,
      orderBy,
      params = [],
    } = readContext;

    const effectiveWhere = whereClause || where;
    const schemaInfo = this.resolveTableSchema ? this.resolveTableSchema(tableName) : null;
    const plan = this.readRouter.planAccessPath({
      tableName,
      whereClause: effectiveWhere,
      projectedColumns,
      params,
      basePrimaryKeyColumns: schemaInfo?.basePrimaryKeyColumns,
    });

    let rows;
    if (plan.accessPath === GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX) {
      rows = await this.readRouter.executeTwoStageIndexQuery(
        {tableName, whereClause: effectiveWhere, projectedColumns, params},
        plan,
      );
    } else if (typeof executeScatterGatherRead === 'function') {
      rows = await executeScatterGatherRead(readContext);
    } else {
      rows = await this.readRouter.executeScatterGather({
        tableName,
        whereClause: effectiveWhere,
        projectedColumns,
        params,
      });
    }

    const resultRows = Array.isArray(rows) ? rows : [];
    return orderBy ? sortRowsByOrderBy(resultRows, orderBy) : resultRows;
  }

  /**
   * Get recorded write overhead and fanout metrics.
   * @return {Object}
   */
  getMetrics() {
    return {
      totalWrites: this.metrics.totalWrites,
      writesByActiveIndexCount: {...this.metrics.writesByActiveIndexCount},
      fanoutByActiveIndexCount: {...this.metrics.fanoutByActiveIndexCount},
      latencyHistory: [...this.metrics.latencyHistory],
    };
  }
}
