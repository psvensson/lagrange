/**
 * Index Service Global Methods.
 * Extension methods for IndexService managing Global Secondary Index delegation,
 * lifecycle coordination, and cached metadata translation.
 * Requirements: 12.1, 12.2, J5 (RM-0.3-qs-non-unique-gsi)
 */

import {TABLES, STRING} from '../constants/index.js';
import {
  GLOBAL_INDEX_STATE,
  INDEX_ERROR_MSG,
  INDEX_LOG_MSG,
  INDEX_READABLE_STATE,
  INDEX_TYPE,
} from './index-constants.js';
import {
  GlobalIndexLifecycleCoordinator,
  parseGlobalIndexDdl,
} from './global-index-lifecycle-coordinator.js';
import {OwnerKeyReconcileQueue} from '../workflow/owner-key-reconcile-queue.js';
import {isTransientGlobalIndexError} from './global-index-catalog-contract.js';
import {buildProductionCoordinatorOptions} from './global-index-production-wiring.js';

const DEFAULT_INDEX_TYPE = INDEX_TYPE.BTREE;
const DEFAULT_READABLE_STATE = INDEX_READABLE_STATE.READY;
const GSI_RECOVERY_QUEUE_NAME = 'gsi-completion-recovery';
const GSI_RECOVERY_REASON = 'gsi_schema_succeeded_recovery';
const MAX_GSI_RECOVERY_ATTEMPTS = 20;
const DEFAULT_GSI_RECOVERY_RETRY_DELAY_MS = 40;
const MIN_GSI_RECOVERY_RETRY_DELAY_MS = 15;

function isGlobalIndexRequest(input, options = {}) {
  if (input?.isGlobal === true || input?.global === true) {
    return true;
  }
  if (options?.isGlobal === true || options?.global === true) {
    return true;
  }
  if (typeof input === 'string' &&
      /^\s*CREATE\s+(?:UNIQUE\s+|CONCURRENTLY\s+)*GLOBAL\s+INDEX\b/iu.test(input)) {
    return true;
  }
  return false;
}

function resolveGlobalIndexName(result, input, options) {
  if (result.indexName) return result.indexName;
  if (input?.indexName) return input.indexName;
  return options?.indexName || null;
}

function resolveGlobalIndexTableName(cat, input, options) {
  return cat?.table_name || cat?.tableName || input?.tableName || options?.tableName || null;
}

function resolveGlobalIndexColumns(cat, input, options) {
  return cat?.column_names || cat?.columnNames ||
    input?.columnNames || input?.columns || options?.columnNames || [];
}

function resolveMetadataIndexId(result, cat, indexName) {
  if (result.indexId) return result.indexId;
  if (cat?.indexId) return cat.indexId;
  if (cat?.index_id) return cat.index_id;
  return `idx-${indexName}`;
}

function resolveMetadataCreatedAt(cat) {
  if (cat?.createdAt !== undefined) return cat.createdAt;
  if (cat?.created_at !== undefined) return cat.created_at;
  return Date.now();
}

function applyInterruptedMetadataFields(result, metadata) {
  if (!result.interrupted) return;
  metadata.interrupted = true;
  metadata.cursorPartitionId = result.cursorPartitionId;
  metadata.cursorPk = result.cursorPk;
  metadata.totalRows = result.totalRows;
}

function applyDeferredMetadataFields(result, metadata) {
  if (!result.deferred) return;
  metadata.deferred = true;
  const deferredKeys = [
    'contractState',
    'failureCode',
    'nextAction',
    'jobId',
    'retryAfterMs',
  ];
  for (const key of deferredKeys) {
    if (result[key] !== undefined && result[key] !== null) {
      metadata[key] = result[key];
    }
  }
}

function buildGlobalIndexMetadata(result, cat, tableId, fields) {
  const metadata = {
    indexId: resolveMetadataIndexId(result, cat, fields.indexName),
    tableId,
    tableName: fields.tableName,
    indexName: fields.indexName,
    columnNames: fields.columnNames,
    indexType: INDEX_TYPE.BTREE,
    unique: false,
    isGlobal: true,
    global: true,
    state: result.state || cat?.state || GLOBAL_INDEX_STATE.READ_WRITE,
    createdAt: resolveMetadataCreatedAt(cat),
    generation: result.generation || cat?.index_generation || 1,
  };
  applyInterruptedMetadataFields(result, metadata);
  applyDeferredMetadataFields(result, metadata);
  return metadata;
}

function resolveCatalogTableId(cat, tableName) {
  if (cat.tableId !== undefined) return cat.tableId;
  if (cat.table_id !== undefined) return cat.table_id;
  return tableName;
}

function resolveCatalogColumnNames(cat) {
  if (Array.isArray(cat.columnNames)) return cat.columnNames;
  if (Array.isArray(cat.column_names)) return cat.column_names;
  if (typeof cat.column_names === 'string') {
    const raw = cat.column_names ? cat.column_names : STRING.EMPTY_JSON_ARRAY;
    return JSON.parse(raw);
  }
  return [];
}

function resolveCatalogUniqueFlag(cat) {
  if (cat.isUnique !== undefined) return Boolean(cat.isUnique);
  return Boolean(cat.unique || cat.is_unique);
}

function isGlobalIndexName(metadata, coordinator, indexName) {
  if (metadata?.isGlobal || metadata?.global) return true;
  if (coordinator?.getIndex?.(indexName)) return true;
  if (coordinator?.getCatalogRecord?.(indexName)) return true;
  return false;
}

function throwIndexNotFound(indexName, tableId) {
  throw new Error(
    `${INDEX_ERROR_MSG.INDEX_NOT_FOUND_PREFIX}${indexName}` +
    (tableId ? `${INDEX_ERROR_MSG.INDEX_NOT_FOUND_MIDDLE}${tableId}` : '') +
    INDEX_ERROR_MSG.INDEX_NOT_FOUND_SUFFIX,
  );
}

const INCOMPLETE_GSI_STATES = new Set([
  GLOBAL_INDEX_STATE.CREATING,
  GLOBAL_INDEX_STATE.WRITE_ONLY,
  GLOBAL_INDEX_STATE.BACKFILLING,
]);

function collectIncompleteFromEntryPairs(entries, names, requireGlobal) {
  if (!entries) return;
  for (const [indexName, item] of entries) {
    const matchesGlobal = !requireGlobal || Boolean(item?.isGlobal || item?.global);
    if (matchesGlobal && INCOMPLETE_GSI_STATES.has(item?.state)) {
      names.add(indexName);
    }
  }
}

function collectIncompleteGlobalIndexNames(indexService) {
  const names = new Set();
  collectIncompleteFromEntryPairs(
    indexService.globalIndexCoordinator?.catalog?.entries(),
    names,
    false,
  );
  collectIncompleteFromEntryPairs(indexService.indices?.entries(), names, true);
  return names;
}

function resolveGsiRecoveryRetryDelayMs(indexService) {
  const configured = indexService.sqlQueryEngine?.tableCreationService?.
    schemaProvisioningJobOwner?.retryAfterMs;
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(
      MIN_GSI_RECOVERY_RETRY_DELAY_MS,
      Math.min(configured, DEFAULT_GSI_RECOVERY_RETRY_DELAY_MS),
    );
  }
  return DEFAULT_GSI_RECOVERY_RETRY_DELAY_MS;
}

async function runRecoveredGsiProvisioningOnce(indexService, intent) {
  const globalIndex = intent?.globalIndex;
  if (!indexService.initialized && indexService.initialize) {
    await indexService.initialize({skipSchemaJobRecovery: true});
  }
  const coordinator = indexService.getGlobalIndexCoordinator();
  const outcome = await coordinator.completeRecoveredProvisioning({
    ...globalIndex,
    tableId: intent.tableId,
    partitionId: intent.partitionId,
  });
  if (!outcome?.fenced && !outcome?.deferred) {
    indexService.sqlQueryEngine?.resetPreparedStatements?.();
  }
  return outcome;
}

function ensureGsiRecoveryQueue(indexService) {
  if (!indexService._gsiRecoveryQueue || indexService._gsiRecoveryQueue.stopped) {
    indexService._gsiRecoveryQueue = new OwnerKeyReconcileQueue({
      name: GSI_RECOVERY_QUEUE_NAME,
      reconcileFn: (_ownerKey, _reasons, intent) =>
        runRecoveredGsiProvisioningOnce(indexService, intent),
      retryPolicy: {
        isRetryableError: isTransientGlobalIndexError,
        getRetryAfterMs: () => resolveGsiRecoveryRetryDelayMs(indexService),
        maxAttempts: MAX_GSI_RECOVERY_ATTEMPTS,
      },
    });
  }
  return indexService._gsiRecoveryQueue;
}

function isMatchingRecoverableGsiIntent(coordinator, incompleteNames, intent) {
  const gsi = intent?.globalIndex;
  if (!gsi?.indexName || !incompleteNames.has(gsi.indexName)) {
    return false;
  }
  const record = coordinator.catalog.get(gsi.indexName);
  if (!record || !INCOMPLETE_GSI_STATES.has(record.state)) {
    return false;
  }
  return !gsi.indexId || record.index_id === gsi.indexId;
}

const indexServiceGlobalMethods = {
  /**
   * Get or lazily create GlobalIndexLifecycleCoordinator.
   * @return {GlobalIndexLifecycleCoordinator}
   */
  getGlobalIndexCoordinator() {
    if (!this.globalIndexCoordinator) {
      this.globalIndexCoordinator = new GlobalIndexLifecycleCoordinator(
        buildProductionCoordinatorOptions(this),
      );
      this._attachSystemTableCacheListener?.();
      this.syncGlobalIndexesFromCache?.();
    }
    return this.globalIndexCoordinator;
  },

  /**
   * Set the GlobalIndexLifecycleCoordinator.
   * @param {GlobalIndexLifecycleCoordinator} coordinator
   */
  setGlobalIndexCoordinator(coordinator) {
    this.globalIndexCoordinator = coordinator;
  },

  /**
   * Check whether an index creation request is for a global index.
   * @param {Object|string} input - DDL or AST.
   * @param {Object} [options={}] - Options.
   * @return {boolean}
   */
  _isGlobalIndexCreation(input, options = {}) {
    return isGlobalIndexRequest(input, options);
  },

  /**
   * Check whether an index drop request targets a global index.
   * @param {Object|null} indexMetadata - Metadata or null.
   * @param {string} indexName - Index name.
   * @return {boolean}
   */
  _isGlobalIndexDrop(indexMetadata, indexName) {
    return isGlobalIndexName(indexMetadata, this.globalIndexCoordinator, indexName);
  },

  /**
   * Resolve table ID for a global index table.
   * @param {string} tableName - Table name.
   * @return {Promise<string>}
   */
  async _resolveGlobalIndexTableId(tableName) {
    if (!tableName) return null;
    return (await this.getTableIdForTableName(tableName)) || tableName;
  },

  /**
   * Record a created global index into cached maps.
   * @param {Object} indexMetadata - Index metadata.
   */
  _recordGlobalIndex(indexMetadata) {
    this._cacheIndexMetadata(indexMetadata);
  },

  /**
   * Delegate global index creation to GlobalIndexLifecycleCoordinator.
   * @param {Object|string} input - DDL or AST.
   * @param {Object} [options={}] - Options.
   * @return {Promise<Object>} Created index metadata.
   */
  async _createGlobalIndexEntry(input, options = {}) {
    const coordinator = this.getGlobalIndexCoordinator();
    let rawTableName = null;
    if (input && typeof input === 'object' && input.tableName) {
      rawTableName = input.tableName;
    } else if (options.tableName) {
      rawTableName = options.tableName;
    } else if (typeof input === 'string') {
      rawTableName = parseGlobalIndexDdl(input).tableName;
    }
    const resolvedInputTableId = rawTableName ?
      await this._resolveGlobalIndexTableId(rawTableName) :
      null;
    const createOptions = resolvedInputTableId && !options.tableId ?
      {...options, tableId: resolvedInputTableId} :
      options;
    const result = await coordinator.createGlobalIndex(input, createOptions);

    const indexName = resolveGlobalIndexName(result, input, options);
    const cat = coordinator.getCatalogRecord?.(indexName);
    const tableName = resolveGlobalIndexTableName(cat, input, options);
    const tableId = await this._resolveGlobalIndexTableId(tableName);
    const columnNames = resolveGlobalIndexColumns(cat, input, options);

    const indexMetadata = buildGlobalIndexMetadata(result, cat, tableId, {
      indexName,
      tableName,
      columnNames,
    });

    this._recordGlobalIndex(indexMetadata);
    return indexMetadata;
  },

  /**
   * Delegate global index drop to GlobalIndexLifecycleCoordinator.
   * @param {string} indexName - Index name.
   * @param {Object|null} indexMetadata - Cached index metadata.
   * @param {string|null} tableId - Table ID.
   * @param {Object} options - Drop options.
   * @return {Promise<boolean>} True if dropped.
   */
  async _dropGlobalIndexEntry(indexName, indexMetadata, tableId, {ifExists}) {
    const coordinator = this.getGlobalIndexCoordinator();
    const dropOutcome = await coordinator.dropGlobalIndex(indexName, {ifExists});
    const resolvedTableId = indexMetadata?.tableId || tableId;
    this._removeIndexFromCache(indexName, resolvedTableId);
    if (indexMetadata && (!coordinator.onCatalogDelete || !dropOutcome?.dropped)) {
      await this.deleteIndexMetadata(indexMetadata, resolvedTableId, indexName);
    }
    this.logger.info(INDEX_LOG_MSG.INDEX_DROPPED, {
      indexId: indexMetadata?.indexId,
      tableId: resolvedTableId,
      indexName,
    });
    return true;
  },

  /**
   * Execute transactional write with synchronous global index maintenance.
   * @param {Object} writeContext - Write context.
   * @return {Promise<Object>}
   */
  async executeTransactionalWrite(writeContext) {
    return this.getGlobalIndexCoordinator().executeTransactionalWrite(writeContext);
  },

  /**
   * Plan and execute read query via global secondary index or scatter-gather.
   * @param {Object} readContext - Read context.
   * @return {Promise<Object[]>}
   */
  async planAndExecuteRead(readContext) {
    return this.getGlobalIndexCoordinator().planAndExecuteRead(readContext);
  },

  /**
   * Resume an interrupted global index backfill from its durable checkpoint.
   * @param {string} indexName - Index name.
   * @param {Object} [options={}] - Resume options.
   * @return {Promise<Object>}
   */
  async resumeGlobalIndexBackfill(indexName, options = {}) {
    return this.getGlobalIndexCoordinator().resumeBackfill(indexName, options);
  },

  /**
   * Initialize index service caches and recover incomplete SUCCEEDED GSIs.
   * @param {Object} [options={}] - Init options.
   * @return {Promise<void>}
   */
  async _initializeIndexService(options = {}) {
    this.shuttingDown = false;
    if (!this.initialized) {
      const initPromise = this._initializePromise || (this._initializePromise = (async () => {
        this.logger.info(INDEX_LOG_MSG.SERVICE_INITIALIZING);
        this._attachSystemTableCacheListener();
        await this.loadIndicesFromCache();
        this.syncGlobalIndexesFromCache();
        this.initialized = true;
        this.logger.info(INDEX_LOG_MSG.SERVICE_INITIALIZED, {
          indexCount: this.getTotalIndexCount(),
        });
      })());
      try {
        await initPromise;
      } finally {
        if (this._initializePromise === initPromise) {
          this._initializePromise = null;
        }
      }
    }
    if (this.initialized && options?.skipSchemaJobRecovery !== true) {
      await this.recoverIncompleteGlobalIndexesFromSchemaJobs?.();
    }
  },

  _shutdownGsiRecoveryQueue() {
    this._gsiRecoveryQueue?.shutdown();
    this._gsiRecoveryQueue = null;
  },

  /**
   * Complete recovered or retried GSI creation after durable schema job SUCCEEDED.
   * @param {Object} intent - Schema provisioning intent carrying globalIndex metadata.
   * @return {Promise<Object|null>}
   */
  async completeRecoveredGlobalIndexProvisioning(intent) {
    const globalIndex = intent?.globalIndex;
    if (!globalIndex?.indexName || this.shuttingDown) {
      return null;
    }
    const queue = ensureGsiRecoveryQueue(this);
    const recoveryKey = globalIndex.indexId || globalIndex.indexName;
    return queue.enqueueAndWait(recoveryKey, GSI_RECOVERY_REASON, intent);
  },

  /**
   * Resume incomplete GSIs whose durable schema_operations job already SUCCEEDED.
   * @param {Object} [options={}]
   * @return {Promise<Array>}
   */
  async recoverIncompleteGlobalIndexesFromSchemaJobs(options = {}) {
    const jobOwner =
      this.sqlQueryEngine?.tableCreationService?.schemaProvisioningJobOwner;
    if (!jobOwner?.listSucceededGlobalIndexIntents) {
      return [];
    }
    if (!this.initialized && this.initialize) {
      await this.initialize({skipSchemaJobRecovery: true});
    }
    const incompleteNames = collectIncompleteGlobalIndexNames(this);
    if (incompleteNames.size === 0) {
      return [];
    }
    const coordinator = this.getGlobalIndexCoordinator();
    const intents = Array.isArray(options?.intents) ?
      options.intents :
      await jobOwner.listSucceededGlobalIndexIntents();
    const matchingIntents = intents.filter(
      (intent) => isMatchingRecoverableGsiIntent(coordinator, incompleteNames, intent),
    );
    return Promise.all(
      matchingIntents.map((intent) => this.completeRecoveredGlobalIndexProvisioning(intent)),
    );
  },

  /**
   * Cache index metadata in both indices map and indexCache by table.
   * @param {Object} metadata - Index metadata.
   */
  _cacheIndexMetadata(metadata) {
    if (!this.indices) {
      this.indices = new Map();
    }
    this.indices.set(metadata.indexName, metadata);

    const {tableId, indexName} = metadata;
    if (tableId) {
      if (!this.indexCache.has(tableId)) {
        this.indexCache.set(tableId, new Map());
      }
      this.indexCache.get(tableId).set(indexName, metadata);
    }
  },

  /**
   * Remove index from both indices map and indexCache.
   * @param {string} indexName - Index name.
   * @param {string} [tableId] - Table ID.
   */
  _removeIndexFromCache(indexName, tableId) {
    if (this.indices) {
      this.indices.delete(indexName);
    }
    if (tableId && this.indexCache.has(tableId)) {
      this.indexCache.get(tableId).delete(indexName);
    }
  },

  /**
   * Convert global index catalog record to index metadata format.
   * @param {Object} cat - Catalog record.
   * @return {Object} Index metadata.
   */
  _catalogToMetadata(cat) {
    const indexName = cat.index_name || cat.indexName;
    const tableName = cat.table_name || cat.tableName || null;
    return {
      indexId: cat.index_id || cat.indexId,
      tableId: resolveCatalogTableId(cat, tableName),
      tableName,
      indexName,
      columnNames: resolveCatalogColumnNames(cat),
      indexType: cat.index_type !== undefined ? cat.index_type : DEFAULT_INDEX_TYPE,
      unique: resolveCatalogUniqueFlag(cat),
      isGlobal: true,
      global: true,
      state: cat.state !== undefined ? cat.state : DEFAULT_READABLE_STATE,
      createdAt: cat.created_at || cat.createdAt || Date.now(),
    };
  },

  /**
   * Find index metadata by name across memory cache and persistent system table.
   * @param {string} indexName - Index name.
   * @return {Promise<Object|null>} Index metadata or null.
   */
  async findIndexByName(indexName) {
    const cached = this.getIndexByName(indexName);
    if (cached) return cached;
    if (this.canReadMetadata()) {
      try {
        const result = await this.getControlPlaneSystemTableGateway().readRows(
          TABLES.INDICES,
          'SELECT * FROM indices WHERE index_name = ?',
          [indexName],
        );
        const row = result.rows?.[0];
        if (row) {
          return {
            indexId: row.index_id,
            tableId: row.table_id,
            tableName: row.table_name || null,
            indexName: row.index_name,
            columnNames: JSON.parse(row.column_names || STRING.EMPTY_JSON_ARRAY),
            indexType: row.index_type || INDEX_TYPE.BTREE,
            unique: Boolean(row.unique || row.is_unique),
            state: row.state || INDEX_READABLE_STATE.READY,
            createdAt: row.created_at,
          };
        }
      } catch (err) {
        this.logger.debug(INDEX_LOG_MSG.FIND_INDEX_FAILED, {
          indexName,
          error: err?.message,
        });
      }
    }
    return null;
  },

  /**
   * Throw typed index not found error.
   * @param {string} indexName - Index name.
   * @param {string|null} tableId - Table ID.
   */
  _throwIndexNotFound(indexName, tableId) {
    throwIndexNotFound(indexName, tableId);
  },
};

export {indexServiceGlobalMethods};
