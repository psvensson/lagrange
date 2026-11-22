import {STRING, TABLES} from '../constants/index.js';
import {CACHE_CDC_OPERATIONS} from '../cache/cache-constants.js';
import {
  hydrateGlobalIndexFromRow,
  syncGlobalIndexesForService,
} from './global-index-production-wiring.js';
import {extractPartitionIdFromRow} from './global-index-partition-discovery.js';
import {INDEX_LOG_MSG, INDEX_TYPE} from './index-constants.js';

const LOCAL_STR_INSERT = CACHE_CDC_OPERATIONS.INSERT;
const LOCAL_STR_UPDATE = CACHE_CDC_OPERATIONS.UPDATE;
const LOCAL_STR_UPSERT = CACHE_CDC_OPERATIONS.UPSERT;
const LOCAL_STR_DELETE = CACHE_CDC_OPERATIONS.DELETE;

function isGlobalCdcRow(data) {
  return Boolean(
    data && (data.is_global === 1 || data.is_global === true || data.isGlobal === true),
  );
}

function applyGlobalIndexCdcChange(indexService, operation, data) {
  if (!data?.index_name) return;
  const coordinator = indexService.getGlobalIndexCoordinator();
  if (operation === LOCAL_STR_DELETE) {
    coordinator?.catalog?.delete(data.index_name);
    indexService._removeIndexFromCache(data.index_name, data.table_id || data.table_name);
    return;
  }
  const meta = hydrateGlobalIndexFromRow(indexService, coordinator, data);
  if (meta) {
    indexService._cacheIndexMetadata(meta);
  }
}

function applyPartitionCdcChange(indexService, operation, data) {
  const pid = extractPartitionIdFromRow(data);
  if (!pid) return;
  const state = indexService.globalIndexWiringState;
  if (state && Array.isArray(state.partitionRows)) {
    const idx = state.partitionRows.findIndex((r) => extractPartitionIdFromRow(r) === pid);
    if (operation === LOCAL_STR_DELETE) {
      if (idx >= 0) state.partitionRows.splice(idx, 1);
    } else if (idx >= 0) {
      state.partitionRows[idx] = {...state.partitionRows[idx], ...data};
    } else {
      state.partitionRows.push({...data});
    }
  }
  const coord = indexService.globalIndexCoordinator;
  if (coord && operation === LOCAL_STR_INSERT) {
    coord.indexPartitionsByName?.clear();
  }
}

const indexServiceCdcHandler = {
  syncGlobalIndexesFromCache() {
    syncGlobalIndexesForService(this);
  },

  _detachSystemTableCacheListener() {
    if (this._cacheApplyListener && this._subscribedSystemCache?.offCacheApplyChange) {
      this._subscribedSystemCache.offCacheApplyChange(this._cacheApplyListener);
    }
    this._cacheApplyListener = null;
    this._subscribedSystemCache = null;
  },

  _attachSystemTableCacheListener() {
    const cache = this.systemTableCache;
    if (!cache || !cache.onCacheApplyChange) {
      return;
    }
    if (this._subscribedSystemCache === cache && this._cacheApplyListener) {
      return;
    }
    this._detachSystemTableCacheListener();
    const listener = (tableName, operation, record) => {
      if (tableName === TABLES.INDICES && isGlobalCdcRow(record)) {
        applyGlobalIndexCdcChange(this, operation, record);
      } else if (tableName === TABLES.PARTITIONS && record) {
        applyPartitionCdcChange(this, operation, record);
      }
    };
    cache.onCacheApplyChange(listener);
    this._cacheApplyListener = listener;
    this._subscribedSystemCache = cache;
  },

  async handleCDCEvent(cdcEvent) {
    if (cdcEvent.tableName === TABLES.INDICES) {
      await this.handleIndicesCDCEvent(cdcEvent);
      return;
    }
    if (cdcEvent.tableName === TABLES.PARTITIONS) {
      await this.handlePartitionsCDCEvent(cdcEvent);
      return;
    }
  },

  async handleIndicesCDCEvent(cdcEvent) {
    const {operation, data} = cdcEvent;
    if (isGlobalCdcRow(data)) {
      applyGlobalIndexCdcChange(this, operation, data);
      return;
    }

    switch (operation) {
    case LOCAL_STR_INSERT:
    case LOCAL_STR_UPDATE:
    case LOCAL_STR_UPSERT: {
      const tableId = data.table_id;
      if (!this.indexCache.has(tableId)) {
        this.indexCache.set(tableId, new Map());
      }

      const indexMetadata = {
        indexId: data.index_id,
        tableId: data.table_id,
        indexName: data.index_name,
        columnNames: JSON.parse(data.column_names || STRING.EMPTY_JSON_ARRAY),
        indexType: data.index_type || INDEX_TYPE.BTREE,
        createdAt: data.created_at,
      };

      this.indexCache.get(tableId).set(data.index_name, indexMetadata);
      this.logger.debug(INDEX_LOG_MSG.INDEX_ADDED_FROM_CDC, {
        indexId: data.index_id,
        indexName: data.index_name,
      });
      break;
    }

    case LOCAL_STR_DELETE: {
      const tableId = data.table_id;
      this.globalIndexCoordinator?.catalog?.delete(data.index_name);
      this._removeIndexFromCache(data.index_name, tableId);
      this.logger.debug(INDEX_LOG_MSG.INDEX_REMOVED_FROM_CDC, {
        indexId: data.index_id,
        indexName: data.index_name,
      });
      break;
    }

    default:
      break;
    }
  },

  async handlePartitionsCDCEvent(cdcEvent) {
    const {operation, data} = cdcEvent;
    applyPartitionCdcChange(this, operation, data);

    if (operation !== LOCAL_STR_INSERT) {
      return;
    }

    const tableId = data.table_id;
    const partitionId = data.partition_id;

    const indices = this.getIndicesForTable(tableId);
    if (indices.length === 0) {
      return;
    }

    this.logger.info(INDEX_LOG_MSG.CREATING_INDICES_FOR_PARTITION, {
      tableId,
      partitionId,
      indexCount: indices.length,
    });

    for (const index of indices) {
      await this.createIndexOnPartition(partitionId, index);
    }
  },
};

export {indexServiceCdcHandler};
