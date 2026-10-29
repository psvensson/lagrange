import {STRING, TABLES} from '../constants/index.js';
import {INDEX_LOG_MSG, INDEX_TYPE} from './index-constants.js';

const LOCAL_STR_INSERT = 'INSERT';
const LOCAL_STR_DELETE = 'DELETE';

const indexServiceCdcHandler = {
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

    switch (operation) {
    case LOCAL_STR_INSERT: {
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
      if (this.indexCache.has(tableId)) {
        this.indexCache.get(tableId).delete(data.index_name);
        this.logger.debug(INDEX_LOG_MSG.INDEX_REMOVED_FROM_CDC, {
          indexId: data.index_id,
          indexName: data.index_name,
        });
      }
      break;
    }

    default:
      break;
    }
  },

  async handlePartitionsCDCEvent(cdcEvent) {
    const {operation, data} = cdcEvent;

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
