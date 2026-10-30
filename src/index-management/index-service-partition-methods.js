import {INDEX_LOG_MSG} from './index-constants.js';

function isUniqueRequested(options) {
  if (!options || typeof options !== 'object') return false;
  return Boolean(options.unique || options.is_unique || options.isUnique);
}

function buildIndexDdl(options, indexName, tableName, columnNames) {
  const uniquePrefix = isUniqueRequested(options) ? 'UNIQUE ' : '';
  const columns = (columnNames || []).join(', ');
  return `CREATE ${uniquePrefix}INDEX IF NOT EXISTS ${indexName} ON ${tableName}(${columns})`;
}

function normalizeSQLiteIndexArgs(arg1, arg2, arg3, ...rest) {
  const isFive = Array.isArray(rest[0]);
  return {
    tableId: isFive ? arg1 : (Array.isArray(arg3) ? arg2 : arg1),
    tableName: isFive ? (arg2 || arg1) : (Array.isArray(arg3) ? arg2 : arg1),
    indexName: isFive ? arg3 : (Array.isArray(arg3) ? arg1 : arg2),
    columnNames: isFive ? rest[0] : arg3,
    options: (isFive ? rest[1] : rest[0]) || {},
  };
}

function normalizePartitionIndexArgs(partitionId, indexMetadataOrName, ...rest) {
  const isPositional = typeof indexMetadataOrName === 'string';
  return {
    partitionId,
    indexName: isPositional ? indexMetadataOrName : indexMetadataOrName?.indexName,
    tableId: isPositional ? rest[0] :
      (indexMetadataOrName?.tableId || indexMetadataOrName?.tableName),
    columnNames: isPositional ? rest[1] : indexMetadataOrName?.columnNames,
    options: isPositional ? (rest[2] || {}) : (indexMetadataOrName || {}),
  };
}

function executeOnPartitionServiceTarget(target, sql, params) {
  if (target?.db?.prepare) {
    return target.db.prepare(sql).run();
  }
  if (typeof target?.executeQuery === 'function') {
    return target.executeQuery(sql, params);
  }
  return undefined;
}

function resolvePartitionFromService(service, partitionId) {
  if (!service) return null;
  if (service.partitionId === partitionId) return service;
  if (typeof service.getPartition === 'function') {
    return service.getPartition(partitionId) || null;
  }
  return null;
}

function resolveEnginePartitionTarget(engine, partitionId) {
  if (!engine) return null;
  if (typeof engine.partitionServicesProvider === 'function') {
    const provided = engine.partitionServicesProvider(partitionId);
    return (provided instanceof Map || typeof provided?.get === 'function') ?
      provided.get(partitionId) : provided;
  }
  if (typeof engine.getPartitionService === 'function') {
    return engine.getPartitionService(partitionId);
  }
  return null;
}

function hasHandleExecutor(partition) {
  return Boolean(
    partition?.db?.prepare ||
    partition?.storage?.getDatabase ||
    typeof partition?.executeQuery === 'function',
  );
}

function hasServiceExecutor(service) {
  if (!service) return false;
  return Boolean(
    service.db?.prepare ||
    typeof service.getPartition === 'function' ||
    typeof service.executeQuery === 'function' ||
    typeof service.executePartitionQuery === 'function' ||
    typeof service.executeOnPartition === 'function',
  );
}

function hasEngineExecutor(engine) {
  if (!engine) return false;
  return Boolean(
    typeof engine.partitionServicesProvider === 'function' ||
    typeof engine.getPartitionService === 'function' ||
    typeof engine.queryExecutor?.executeOnPartition === 'function',
  );
}

function extractPartitionId(partition) {
  if (!partition || typeof partition !== 'object') {
    return partition;
  }
  return partition.partition_id || partition.partitionId || partition;
}

function assertPartitionExecutionSuccess(result) {
  if (result && typeof result === 'object' && result.success === false) {
    const message = result.error || result.errorMessage || result.message ||
      'Partition SQL execution failed';
    const error = new Error(message);
    if (result.errorCode || result.code) {
      error.code = result.errorCode || result.code;
    }
    throw error;
  }
}

function resolveRebuildTarget(service, tableId, indexName) {
  if (tableId && indexName) {
    const meta = service.getIndex(tableId, indexName);
    if (meta) return {tableId, indexName, metadata: meta};
  }
  const byName = service.getIndexByName(tableId);
  if (byName) {
    return {tableId: byName.tableId, indexName: byName.indexName, metadata: byName};
  }
  const byId = service.getAllIndices().find((idx) => idx.indexId === tableId);
  if (byId) {
    return {tableId: byId.tableId, indexName: byId.indexName, metadata: byId};
  }
  return null;
}

const indexServicePartitionMethods = {
  executeOnPartitionHandle(partition, sql, params) {
    if (partition?.db?.prepare) {
      return partition.db.prepare(sql).run();
    }
    if (partition?.storage?.getDatabase) {
      const db = partition.storage.getDatabase();
      if (db?.prepare) {
        return db.prepare(sql).run();
      }
    }
    if (typeof partition?.executeQuery === 'function') {
      return partition.executeQuery(sql, params);
    }
    return undefined;
  },

  executeViaPartitionService(partitionId, sql, params) {
    if (!this.partitionService) return undefined;
    const target = resolvePartitionFromService(this.partitionService, partitionId);
    const directResult = executeOnPartitionServiceTarget(target, sql, params);
    if (directResult !== undefined) {
      return directResult;
    }
    if (typeof this.partitionService.executePartitionQuery === 'function') {
      return this.partitionService.executePartitionQuery(partitionId, sql, params);
    }
    if (typeof this.partitionService.executeOnPartition === 'function') {
      return this.partitionService.executeOnPartition(partitionId, sql, params);
    }
    return undefined;
  },

  executeViaSqlQueryEngine(partitionId, sql, params) {
    if (!this.sqlQueryEngine) return undefined;
    const target = resolveEnginePartitionTarget(this.sqlQueryEngine, partitionId);
    const directResult = executeOnPartitionServiceTarget(target, sql, params);
    if (directResult !== undefined) {
      return directResult;
    }
    const executor = this.sqlQueryEngine.queryExecutor;
    if (typeof executor?.executeOnPartition === 'function') {
      return executor.executeOnPartition(partitionId, sql, params, false, true);
    }
    return undefined;
  },

  hasPartitionExecutor(partition) {
    if (hasHandleExecutor(partition)) return true;
    if (hasServiceExecutor(this.partitionService)) return true;
    return hasEngineExecutor(this.sqlQueryEngine);
  },

  async dispatchPartitionSql(partition, sql, params) {
    const handleResult = this.executeOnPartitionHandle(partition, sql, params);
    if (handleResult !== undefined) {
      return handleResult;
    }
    const partitionId = extractPartitionId(partition);
    const serviceResult = this.executeViaPartitionService(partitionId, sql, params);
    if (serviceResult !== undefined) {
      return serviceResult;
    }
    return this.executeViaSqlQueryEngine(partitionId, sql, params);
  },

  /**
   * Execute SQL on a partition using any available interface.
   * @param {Object} partition - Partition handle or record.
   * @param {string} sql - SQL statement.
   * @param {Array} [params] - Bound parameters.
   * @return {Promise<Object>} Execution outcome.
   */
  async executePartitionSql(partition, sql, params = []) {
    const rawResult = await this.dispatchPartitionSql(partition, sql, params);
    if (rawResult === undefined || rawResult === null) {
      if (this.requirePartitionMaterialization || this.hasPartitionExecutor(partition)) {
        const id = extractPartitionId(partition);
        throw new Error(`No executor available for partition '${id}'`);
      }
      return null;
    }
    assertPartitionExecutionSuccess(rawResult);
    return rawResult;
  },

  assertPartitionsExist(partitions, tableId, tableName, indexName) {
    if (partitions.length > 0) return true;
    if (this.requirePartitionMaterialization ||
        this.isRealTableConfigured(tableId, tableName)) {
      throw new Error(
        `No partitions found for table '${tableName || tableId}' to materialize index '${indexName}'`,
      );
    }
    this.logger.warn(INDEX_LOG_MSG.NO_PARTITIONS_FOR_TABLE, {tableId, tableName});
    return false;
  },

  /**
   * Create SQLite index on all partitions for a table.
   * Requirements: 12.5
   * @param {string} arg1 - Table ID or index name.
   * @param {string} arg2 - Table name or table ID.
   * @param {string|Array<string>} arg3 - Index name or column names.
   * @return {Promise<void>}
   */
  async createSQLiteIndex(arg1, arg2, arg3, ...rest) {
    const parsed = normalizeSQLiteIndexArgs(arg1, arg2, arg3, ...rest);
    const {tableId, tableName, indexName, columnNames, options} = parsed;
    const partitions = await this.getPartitionsForTable(tableId);

    if (!this.assertPartitionsExist(partitions, tableId, tableName, indexName)) {
      return;
    }

    const sql = buildIndexDdl(options, indexName, tableName, columnNames);
    try {
      for (const partition of partitions) {
        await this.executePartitionSql(partition, sql, []);
      }
    } catch (error) {
      this.logger.error(INDEX_LOG_MSG.PARTITION_INDEX_FAILED, {indexName, error: error.message});
      await this.dropSQLiteIndex(tableId, indexName).catch(() => {});
      throw error;
    }

    this.logger.debug(INDEX_LOG_MSG.SQLITE_INDEX_COMPLETED, {
      indexName,
      successCount: partitions.length,
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

    for (const partition of partitions) {
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
    }
  },

  /**
   * Create an index on a specific partition.
   * Requirements: 12.3, 12.5
   * @param {string} partitionId - Partition ID.
   * @param {Object|string} indexMetadataOrName - Index metadata or index name.
   * @return {Promise<boolean>} True if successful.
   */
  async createIndexOnPartition(partitionId, indexMetadataOrName, ...rest) {
    const parsed = normalizePartitionIndexArgs(partitionId, indexMetadataOrName, ...rest);
    const {indexName, tableId, columnNames, options} = parsed;
    const partition = await this.getPartition(partitionId);

    if (!partition) {
      this.logger.warn(INDEX_LOG_MSG.PARTITION_NOT_FOUND, {partitionId, indexName});
      return false;
    }

    const tableName = partition.table_name || partition.tableName ||
      options?.tableName || tableId;
    const sql = buildIndexDdl(options, indexName, tableName, columnNames);

    try {
      await this.executePartitionSql(partition, sql, []);
      this.logger.debug(INDEX_LOG_MSG.INDEX_CREATED_ON_PARTITION, {
        partitionId,
        indexName,
        unique: isUniqueRequested(options),
      });
      return true;
    } catch (error) {
      this.logger.error(INDEX_LOG_MSG.PARTITION_INDEX_FAILED, {
        partitionId,
        indexName,
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

  async rebuildPartitionIndex(partition, target, sql) {
    const dropSql = `DROP INDEX IF EXISTS ${target.indexName}`;
    await this.executePartitionSql(partition, dropSql, []);
    await this.executePartitionSql(partition, sql, []);
  },

  /**
   * Rebuild an index on all partitions for a table.
   * Useful for maintenance or after schema changes.
   * @param {string} tableId - Table ID.
   * @param {string} [indexName] - Index name.
   * @return {Promise<Object>} Rebuild result.
   */
  async rebuildIndex(tableId, indexName) {
    const target = resolveRebuildTarget(this, tableId, indexName);
    if (!target) {
      throw new Error(`Index '${indexName || tableId}' not found on table '${tableId}'`);
    }

    this.logger.info(INDEX_LOG_MSG.REBUILDING_INDEX, target);
    const partitions = await this.getPartitionsForTable(target.tableId);
    const prefix = isUniqueRequested(target.metadata) ? 'UNIQUE ' : '';
    const cols = (target.metadata.columnNames || []).join(', ');

    for (const partition of partitions) {
      const tableName = partition.table_name || partition.tableName ||
        target.metadata.tableName || target.tableId;
      const createSql = `CREATE ${prefix}INDEX ${target.indexName} ON ${tableName}(${cols})`;
      try {
        await this.rebuildPartitionIndex(partition, target, createSql);
      } catch (error) {
        this.logger.error(INDEX_LOG_MSG.INDEX_REBUILD_FAILED, {
          indexName: target.indexName,
          error: error.message,
        });
        throw error;
      }
    }

    return {
      indexName: target.indexName,
      tableId: target.tableId,
      totalPartitions: partitions.length,
      successCount: partitions.length,
      failCount: 0,
    };
  },
};

export {indexServicePartitionMethods};
