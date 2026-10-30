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
} from './global-index-lifecycle-coordinator.js';

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

function buildGlobalIndexMetadata(result, cat, tableId, fields) {
  return {
    indexId: result.indexId || cat?.index_id || `idx-${fields.indexName}`,
    tableId,
    tableName: fields.tableName,
    indexName: fields.indexName,
    columnNames: fields.columnNames,
    indexType: INDEX_TYPE.BTREE,
    unique: false,
    isGlobal: true,
    global: true,
    state: result.state || cat?.state || GLOBAL_INDEX_STATE.READ_WRITE,
    createdAt: cat?.created_at || Date.now(),
    generation: result.generation || cat?.index_generation || 1,
  };
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

const indexServiceGlobalMethods = {
  /**
   * Get or lazily create GlobalIndexLifecycleCoordinator.
   * @return {GlobalIndexLifecycleCoordinator}
   */
  getGlobalIndexCoordinator() {
    if (!this.globalIndexCoordinator) {
      this.globalIndexCoordinator = new GlobalIndexLifecycleCoordinator({
        logger: this.logger,
      });
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
    const result = await coordinator.createGlobalIndex(input, options);

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
    if (this.globalIndexCoordinator) {
      await this.globalIndexCoordinator.dropGlobalIndex(indexName, {ifExists});
    }
    const resolvedTableId = indexMetadata?.tableId || tableId;
    this._removeIndexFromCache(indexName, resolvedTableId);
    if (indexMetadata) {
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
      tableId: tableName,
      tableName,
      indexName,
      columnNames: cat.column_names || cat.columnNames || [],
      indexType: cat.index_type || INDEX_TYPE.BTREE,
      unique: Boolean(cat.unique || cat.is_unique),
      isGlobal: true,
      global: true,
      state: cat.state || INDEX_READABLE_STATE.READY,
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
