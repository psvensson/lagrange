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
  createGlobalIndexRecord,
  normalizeGlobalIndexRecord,
} from './global-index-catalog-contract.js';
import {GlobalIndexDatasetManager} from './global-index-dataset-manager.js';
import {GlobalIndexBackfillCoordinator} from './global-index-backfill-coordinator.js';
import {GlobalIndexWriteMaintenance} from './global-index-write-maintenance.js';
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

function resolveWriteOperations(maintenance, context) {
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

function resolveBackfillOutcome(context) {
  const {isCurrent, isInterrupted, indexId, indexName, currentGen, result} = context;
  if (!isCurrent) {
    return {indexId, indexName, generation: currentGen, fenced: true};
  } else if (isInterrupted) {
    return {
      indexId,
      indexName,
      generation: currentGen,
      state: GLOBAL_INDEX_STATE.BACKFILLING,
      interrupted: true,
      ...result,
    };
  } else {
    return {
      indexId,
      indexName,
      generation: currentGen,
      state: GLOBAL_INDEX_STATE.READ_WRITE,
      completed: true,
    };
  }
}

function applySorting(rows, orderBy) {
  if (!orderBy || !Array.isArray(rows) || rows.length <= 1) {
    return rows;
  }
  const orderList = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const ord of orderList) {
      const col = typeof ord === 'string' ? ord.split(/\s+/)[0] : ord.column;
      const desc = typeof ord === 'string' ?
        /desc/i.test(ord) :
        String(ord.direction).toUpperCase() === 'DESC';
      if (a[col] < b[col]) return desc ? 1 : -1;
      if (a[col] > b[col]) return desc ? -1 : 1;
    }
    return 0;
  });
}

function applyPostProcessing(rows, {orderBy, limit}) {
  let result = Array.isArray(rows) ? rows : [];
  if (orderBy) {
    result = applySorting(result, orderBy);
  }
  if (typeof limit === 'number' && limit >= 0) {
    result = result.slice(0, limit);
  }
  return result;
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

function findCatalogTarget(catalog, update) {
  const targetName = update.indexName || update.index_name;
  if (targetName && catalog.has(targetName)) {
    return catalog.get(targetName);
  }
  if (!update.indexId) {
    return null;
  }
  for (const rec of catalog.values()) {
    if ((rec.index_id || rec.indexId) === update.indexId) {
      return rec;
    }
  }
  return null;
}

function checkIndexExistence(catalog, def, options) {
  const indexName = def.indexName;
  if (catalog.has(indexName)) {
    if (def.ifNotExists || options.ifNotExists) {
      return true;
    }
    throw new Error(`Index '${indexName}' already exists`);
  }
  return false;
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

    this.metrics = {
      totalWrites: 0,
      writesByActiveIndexCount: {},
      fanoutByActiveIndexCount: {},
      latencyHistory: [],
    };
    this.suppressedRollbackErrors = 0;

    this._initializeComponents(options);
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
    return this.basePartitionsByTable.get(tableName) || [];
  }

  /**
   * Get registered index partitions for an index name.
   * @param {string} indexName
   * @return {Object[]}
   */
  getIndexPartitions(indexName) {
    return this.indexPartitionsByName.get(indexName) || [];
  }

  /**
   * Get normalized catalog records for all indexes on a table.
   * @param {string} tableName
   * @return {Object[]}
   */
  getIndexesForTable(tableName) {
    const results = [];
    for (const record of this.catalog.values()) {
      if ((record.table_name || record.tableName) === tableName) {
        results.push(normalizeGlobalIndexRecord(record));
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

  _saveCatalogRecord(record) {
    this.catalog.set(record.index_name || record.indexName, record);
  }

  _updateCatalogRecord(update) {
    const target = findCatalogTarget(this.catalog, update);
    if (!target) return;
    const activeId = target.index_id || target.indexId;
    if (update.indexId && activeId !== update.indexId) {
      return;
    }
    Object.assign(target, update);
    target.updated_at = update.updatedAt || Date.now();
  }

  _provisionIndexDatasets(tableName, indexName, columnNames, basePrimaryKeyColumns, options) {
    const partitions = this.getIndexPartitions(indexName);
    for (const p of partitions) {
      const pId = p.partition_id || p.partitionId;
      const db = this.partitionDatabases.get(pId);
      if (db) {
        this.datasetManager.createIndexDataset(db, {
          tableName,
          indexName,
          columnNames,
          basePrimaryKeyColumns,
          columnTypes: options.columnTypes || {},
        });
      }
    }
  }

  _dropIndexDatasets(tableName, indexName) {
    const partitions = this.getIndexPartitions(indexName);
    for (const p of partitions) {
      const pId = p.partition_id || p.partitionId;
      const db = this.partitionDatabases.get(pId);
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
    const backfillOptions = {
      ...options.backfillOptions,
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
        this._updateCatalogRecord({indexId, state: GLOBAL_INDEX_STATE.READ_WRITE});
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
        this._updateCatalogRecord({
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
    const def = normalizeGlobalIndexDefinition(ddlOrAst, options);
    assertSupportedGlobalIndexDefinition(def);

    const exists = checkIndexExistence(this.catalog, def, options);
    if (exists) {
      return this.getCatalogRecord(def.indexName);
    }

    const {indexName, tableName, columnNames} = def;

    const currentGen = this.generations.has(indexName) ?
      this.generations.get(indexName) :
      1;
    this.generations.set(indexName, currentGen);

    const indexId = options.indexId || `${indexName}-gen${currentGen}`;
    const basePrimaryKeyColumns = def.basePrimaryKeyColumns ||
      options.basePrimaryKeyColumns ||
      [LOCAL_STR_ID];

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
    this._saveCatalogRecord(record);

    this._provisionIndexDatasets(
      tableName,
      indexName,
      columnNames,
      basePrimaryKeyColumns,
      options,
    );

    this._updateCatalogRecord({indexId, state: GLOBAL_INDEX_STATE.WRITE_ONLY});
    this._updateCatalogRecord({indexId, state: GLOBAL_INDEX_STATE.BACKFILLING});

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
    const record = this.getCatalogRecord(indexName);
    if (!record) {
      throw new Error(`Index '${indexName}' not found`);
    }
    if (options.basePrimaryKeyColumns) {
      record.basePrimaryKeyColumns = options.basePrimaryKeyColumns;
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
    const record = this.getCatalogRecord(indexName);
    if (!record) {
      if (options.ifExists) {
        return {dropped: false, indexName};
      }
      throw new Error(`Index '${indexName}' not found`);
    }

    const indexId = record.index_id || record.indexId;
    this._updateCatalogRecord({indexId, state: GLOBAL_INDEX_STATE.DROPPING});

    const currentGen = this.generations.get(indexName) || 1;
    this.generations.set(indexName, currentGen + 1);

    const tableName = record.table_name || record.tableName;
    this._dropIndexDatasets(tableName, indexName);

    this.catalog.delete(indexName);
    return {dropped: true, indexName, priorGeneration: currentGen};
  }

  _getPartitionDb(partitionId, txContext) {
    if (txContext?.getDatabase) {
      const db = txContext.getDatabase(partitionId);
      if (db) return db;
    }
    return this.partitionDatabases.get(partitionId) || null;
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
    const startTimeNs = process.hrtime.bigint();
    const {tableName, basePartitionId, baseWriteFn, txContext} = writeContext;

    const activeIndexes = this.writeMaintenance.getActiveIndexesForTable(tableName);
    const plan = resolveWriteOperations(this.writeMaintenance, writeContext);
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
    const {
      tableName,
      where,
      whereClause,
      orderBy,
      limit,
      projectedColumns,
      executeScatterGatherRead,
    } = readContext;

    const effectiveWhere = whereClause || where;
    const plan = this.readRouter.planAccessPath({
      tableName,
      whereClause: effectiveWhere,
      projectedColumns,
    });

    let rows;
    if (plan.accessPath === GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX) {
      rows = await this.readRouter.executeTwoStageIndexQuery(
        {tableName, whereClause: effectiveWhere, projectedColumns},
        plan,
      );
    } else if (typeof executeScatterGatherRead === 'function') {
      rows = await executeScatterGatherRead(readContext);
    } else {
      rows = await this.readRouter.executeScatterGather({
        tableName,
        whereClause: effectiveWhere,
        projectedColumns,
      });
    }

    return applyPostProcessing(rows, {orderBy, limit});
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
