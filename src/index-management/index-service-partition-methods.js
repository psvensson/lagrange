import {INDEX_LOG_MSG} from './index-constants.js';

const indexServicePartitionMethods = {
  executeOnPartitionHandle(partition, sql, params) {
    if (typeof partition?.executeQuery === 'function') {
      return partition.executeQuery(sql, params);
    }
    if (partition?.db?.prepare) {
      return partition.db.prepare(sql).run();
    }
    if (partition?.storage?.getDatabase) {
      const db = partition.storage.getDatabase();
      if (db?.prepare) {
        return db.prepare(sql).run();
      }
    }
    return undefined;
  },

  executeViaPartitionService(partitionId, sql, params) {
    if (!this.partitionService) return undefined;
    if (typeof this.partitionService.executePartitionQuery === 'function') {
      return this.partitionService.executePartitionQuery(partitionId, sql, params);
    }
    if (typeof this.partitionService.executeOnPartition === 'function') {
      return this.partitionService.executeOnPartition(partitionId, sql, params);
    }
    if (typeof this.partitionService.getPartition === 'function') {
      const p = this.partitionService.getPartition(partitionId);
      if (typeof p?.executeQuery === 'function') {
        return p.executeQuery(sql, params);
      }
    }
    if (this.partitionService.partitionId === partitionId &&
        typeof this.partitionService.executeQuery === 'function') {
      return this.partitionService.executeQuery(sql, params);
    }
    return undefined;
  },

  executeViaSqlQueryEngine(partitionId, sql, params) {
    if (!this.sqlQueryEngine) return undefined;
    if (typeof this.sqlQueryEngine.partitionServicesProvider === 'function') {
      const p = this.sqlQueryEngine.partitionServicesProvider(partitionId);
      if (typeof p?.executeQuery === 'function') {
        return p.executeQuery(sql, params);
      }
    }
    if (this.sqlQueryEngine.queryExecutor &&
        typeof this.sqlQueryEngine.queryExecutor.executeOnPartition === 'function') {
      return this.sqlQueryEngine.queryExecutor.executeOnPartition(
        partitionId,
        sql,
        params,
        false,
        true,
      );
    }
    return undefined;
  },

  /**
   * Execute SQL on a partition using any available interface.
   * @param {Object} partition - Partition handle or record.
   * @param {string} sql - SQL statement.
   * @param {Array} [params] - Bound parameters.
   * @return {Promise<Object>} Execution outcome.
   */
  async executePartitionSql(partition, sql, params = []) {
    const handleResult = this.executeOnPartitionHandle(partition, sql, params);
    if (handleResult !== undefined) {
      return handleResult;
    }
    const partitionId = partition?.partition_id ?? partition?.partitionId ?? partition;
    const serviceResult = this.executeViaPartitionService(partitionId, sql, params);
    if (serviceResult !== undefined) {
      return serviceResult;
    }
    const engineResult = this.executeViaSqlQueryEngine(partitionId, sql, params);
    if (engineResult !== undefined) {
      return engineResult;
    }
    return null;
  },

  /**
   * Create SQLite index on all partitions for a table.
   * Requirements: 12.5
   * @param {string} tableId - Table ID.
   * @param {string} tableName - Table name.
   * @param {string} indexName - Index name.
   * @param {Array<string>} columnNames - Column names.
   * @param {Object} [_options] - Creation options.
   * @return {Promise<void>}
   */
  async createSQLiteIndex(tableId, tableName, indexName, columnNames, _options = {}) {
    const partitions = await this.getPartitionsForTable(tableId);

    if (partitions.length === 0) {
      this.logger.warn(INDEX_LOG_MSG.NO_PARTITIONS_FOR_TABLE, {tableId, tableName});
      return;
    }

    const columns = columnNames.join(', ');
    const sql = `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName}(${columns})`;

    this.logger.debug(INDEX_LOG_MSG.CREATING_SQLITE_INDEX, {
      tableId,
      indexName,
      partitionCount: partitions.length,
    });

    const results = await Promise.allSettled(
      partitions.map(async (partition) => {
        try {
          await this.executePartitionSql(partition, sql, []);
          return {
            partitionId: partition.partition_id || partition.partitionId,
            success: true,
          };
        } catch (error) {
          this.logger.error(INDEX_LOG_MSG.PARTITION_INDEX_FAILED, {
            partitionId: partition.partition_id || partition.partitionId,
            indexName,
            error: error.message,
          });
          throw error;
        }
      }),
    );

    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected) {
      throw rejected.reason;
    }

    const successCount = results.filter((r) =>
      r.status === 'fulfilled' && r.value.success,
    ).length;

    this.logger.debug(INDEX_LOG_MSG.SQLITE_INDEX_COMPLETED, {
      indexName,
      successCount,
      totalPartitions: partitions.length,
    });
  },

  /**
   * Drop SQLite index from all partitions for a table.
   * @param {string} tableId - Table ID.
   * @param {string} indexName - Index name.
   * @return {Promise<void>}
   */
  async dropSQLiteIndex(tableId, indexName) {
    const partitions = await this.getPartitionsForTable(tableId);
    const sql = `DROP INDEX IF EXISTS ${indexName}`;

    const results = await Promise.allSettled(
      partitions.map(async (partition) => {
        try {
          await this.executePartitionSql(partition, sql, []);
        } catch (error) {
          this.logger.error(INDEX_LOG_MSG.INDEX_DROP_FAILED, {
            partitionId: partition.partition_id || partition.partitionId,
            indexName,
            error: error.message,
          });
          throw error;
        }
      }),
    );

    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected) {
      throw rejected.reason;
    }
  },

  /**
   * Create an index on a specific partition.
   * Requirements: 12.3, 12.5
   * @param {string} partitionId - Partition ID.
   * @param {Object} indexMetadata - Index metadata.
   * @return {Promise<boolean>} True if successful.
   */
  async createIndexOnPartition(partitionId, indexMetadata) {
    const partition = await this.getPartition(partitionId);

    if (!partition) {
      this.logger.warn(INDEX_LOG_MSG.PARTITION_NOT_FOUND, {
        partitionId,
        indexName: indexMetadata.indexName,
      });
      return false;
    }

    const tableName = partition.table_name ?? partition.tableName ?? indexMetadata?.tableName;
    const columns = indexMetadata.columnNames.join(', ');
    const sql = `CREATE INDEX IF NOT EXISTS ${indexMetadata.indexName} ` +
                `ON ${tableName}(${columns})`;

    try {
      await this.executePartitionSql(partition, sql, []);
      this.logger.debug(INDEX_LOG_MSG.INDEX_CREATED_ON_PARTITION, {
        partitionId,
        indexName: indexMetadata.indexName,
      });
      return true;
    } catch (error) {
      this.logger.error(INDEX_LOG_MSG.PARTITION_INDEX_FAILED, {
        partitionId,
        indexName: indexMetadata.indexName,
        error: error.message,
      });
      throw error;
    }
  },

  /**
   * Ensure all indices exist on a partition.
   * Called when a partition is registered or becomes available.
   * Requirements: 12.3, 12.5
   * @param {string} partitionId - Partition ID.
   * @param {string} tableId - Table ID.
   * @return {Promise<number>} Number of indices created.
   */
  async ensureIndicesOnPartition(partitionId, tableId) {
    const indices = this.getIndicesForTable(tableId);

    if (indices.length === 0) {
      return 0;
    }

    this.logger.debug(INDEX_LOG_MSG.ENSURING_INDICES, {
      partitionId,
      tableId,
      indexCount: indices.length,
    });

    let createdCount = 0;
    for (const index of indices) {
      const success = await this.createIndexOnPartition(partitionId, index);
      if (success) {
        createdCount++;
      }
    }

    return createdCount;
  },

  /**
   * Rebuild an index on all partitions for a table.
   * Useful for maintenance or after schema changes.
   * @param {string} tableId - Table ID.
   * @param {string} indexName - Index name.
   * @return {Promise<Object>} Rebuild result.
   */
  async rebuildIndex(tableId, indexName) {
    const indexMetadata = this.getIndex(tableId, indexName);

    if (!indexMetadata) {
      throw new Error(
        `Index '${indexName}' not found on table '${tableId}'`,
      );
    }

    this.logger.info(INDEX_LOG_MSG.REBUILDING_INDEX, {tableId, indexName});

    const partitions = await this.getPartitionsForTable(tableId);
    let successCount = 0;
    const failCount = 0;

    for (const partition of partitions) {
      const tableName = partition.table_name ?? partition.tableName ?? indexMetadata?.tableName;
      const columns = indexMetadata.columnNames.join(', ');

      try {
        await this.executePartitionSql(partition, `DROP INDEX IF EXISTS ${indexName}`, []);
        await this.executePartitionSql(
          partition,
          `CREATE INDEX ${indexName} ON ${tableName}(${columns})`,
          [],
        );
        successCount++;
      } catch (error) {
        this.logger.error(INDEX_LOG_MSG.INDEX_REBUILD_FAILED, {
          partitionId: partition.partition_id || partition.partitionId,
          indexName,
          error: error.message,
        });
        throw error;
      }
    }

    return {
      indexName,
      tableId,
      totalPartitions: partitions.length,
      successCount,
      failCount,
    };
  },
};

export {indexServicePartitionMethods};
