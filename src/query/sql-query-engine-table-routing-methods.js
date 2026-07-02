import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_BACKGROUND = 'background';
const LOCAL_STR_CRITICAL = 'critical';

const {
  ACTIVE_PARTITION_STATE,
  BACKGROUND_SYSTEM_TABLE_DELIVERY_PRIORITY_TABLES,
  DEFAULT_PARTITION_VERSION,
  DUAL_WRITE_ACTIVE_STATUSES,
  PARTITION_SPLIT_MIRROR_ORIGIN,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  QUERY_ERROR_MSG,
  SYSTEM_TABLE_NAME,
  TABLES,
} = SQL_QUERY_ENGINE_SHARED;

class SQLQueryEngineTableRoutingMethods {
  /**
   * Get partitions for a table.
   *
   * System Cache Lookup:
   * - Uses the raw observed system cache for partition enumeration
   * - No fallbacks or bootstrap directories
   * - System cache populated from bootstrap snapshots
   * - CDC events keep cache synchronized
   * - Canonical leader stabilization, when needed, happens later in the
   *   routing stack
   * - Throws error if cache not available
   *
   * Requirements: 3.1, 5.1
   * @param {string} tableName - Table name.
   * @return {Array} Array of partition objects.
   * @throws {Error} If system cache is not available.
   * @private
   */
  getTablePartitions(tableName) {
    if (!this.systemCache) {
      throw new Error(`${QUERY_ERROR_MSG.SYSTEM_CACHE_NOT_AVAILABLE}: ${tableName}`);
    }

    const tableInfo = this.getTableInfo(tableName);
    const tableId = tableInfo?.table_id || tableInfo?.tableId || null;
    const activePartitionVersion =
      this.resolveActivePartitionVersion(tableInfo);

    // Get partitions from the raw observed system cache.
    if (typeof this.systemCache.filter === LOCAL_STR_FUNCTION) {
      const directMatches =
        this.systemCache.filter(TABLES.PARTITIONS, (partition) =>
          this.partitionMatchesTableRef(partition, tableName),
        ) || [];
      const visibleDirectMatches = directMatches.filter((partition) =>
        this.isPartitionVisibleForRouting(partition, activePartitionVersion),
      );
      if (directMatches.length > 0) {
        return visibleDirectMatches;
      }
      const overlayDirectMatches =
        this.getBootstrapRoutingOverlayPartitionsForTable(
          tableName,
          activePartitionVersion,
        );
      if (
        overlayDirectMatches.length > 0 ||
        !tableId ||
        tableId === tableName
      ) {
        return overlayDirectMatches;
      }

      const tableIdMatches =
        this.systemCache.filter(TABLES.PARTITIONS, (partition) =>
          this.partitionMatchesTableRef(partition, tableId),
        ) || [];
      const visibleTableIdMatches = tableIdMatches.filter((partition) =>
        this.isPartitionVisibleForRouting(partition, activePartitionVersion),
      );
      if (visibleTableIdMatches.length > 0) {
        return visibleTableIdMatches;
      }
      return this.getBootstrapRoutingOverlayPartitionsForTable(
        tableId,
        activePartitionVersion,
      );
    }

    if (typeof this.systemCache.getAll === LOCAL_STR_FUNCTION) {
      const all = this.systemCache.getAll(TABLES.PARTITIONS) || [];
      const directMatches = all.filter((partition) =>
        this.partitionMatchesTableRef(partition, tableName),
      );
      const visibleDirectMatches = directMatches.filter((partition) =>
        this.isPartitionVisibleForRouting(partition, activePartitionVersion),
      );
      if (directMatches.length > 0) {
        return visibleDirectMatches;
      }
      const overlayDirectMatches =
        this.getBootstrapRoutingOverlayPartitionsForTable(
          tableName,
          activePartitionVersion,
        );
      if (
        overlayDirectMatches.length > 0 ||
        !tableId ||
        tableId === tableName
      ) {
        return overlayDirectMatches;
      }

      const visibleTableIdMatches = all.filter((partition) =>
        this.partitionMatchesTableRef(partition, tableId),
      ).filter((partition) =>
        this.isPartitionVisibleForRouting(partition, activePartitionVersion),
      );
      if (visibleTableIdMatches.length > 0) {
        return visibleTableIdMatches;
      }
      return this.getBootstrapRoutingOverlayPartitionsForTable(
        tableId,
        activePartitionVersion,
      );
    }

    throw new Error(`${QUERY_ERROR_MSG.SYSTEM_CACHE_UNSUPPORTED}: ${tableName}`);
  }

  /**
   * Determine whether one partition row belongs to a table reference.
   * @param {Object|null} partition
   * @param {string|null} tableRef
   * @return {boolean}
   * @private
   */
  partitionMatchesTableRef(partition, tableRef) {
    if (
      !partition ||
      typeof partition !== LOCAL_STR_OBJECT ||
      typeof tableRef !== LOCAL_STR_STRING ||
      tableRef.length === 0
    ) {
      return false;
    }
    return partition.table_name === tableRef ||
      partition.tableName === tableRef ||
      partition.table_id === tableRef ||
      partition.tableId === tableRef;
  }

  /**
   * Get table information.
   * @param {string} tableName - Table name.
   * @return {Object|null} Table info or null.
   * @private
   */
  getTableInfo(tableName) {
    if (!this.systemCache) {
      return null;
    }

    try {
      if (typeof this.systemCache.get === LOCAL_STR_FUNCTION) {
        const byPrimaryKey = this.systemCache.get(TABLES.TABLES, tableName);
        if (byPrimaryKey) {
          return byPrimaryKey;
        }
      }
      if (typeof this.systemCache.find === LOCAL_STR_FUNCTION) {
        const found = this.systemCache.find(TABLES.TABLES, (t) =>
          t.table_name === tableName || t.tableName === tableName,
        );
        if (found) {
          return found;
        }
      }
      if (typeof this.systemCache.getAll === LOCAL_STR_FUNCTION) {
        const tables = this.systemCache.getAll(TABLES.TABLES) || [];
        return tables.find((table) =>
          table.table_name === tableName ||
          table.tableName === tableName ||
          table.table_id === tableName ||
          table.tableId === tableName,
        ) || null;
      }
    } catch (_cacheErr) {
      // Cache not available
    }

    return null;
  }

  /**
   * Read schema-migration rows for one table from system cache.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {Object[]} Matching migration rows.
   * @private
   */
  getTableMigrationsFromCache(tableInfo) {
    if (!tableInfo || !this.systemCache) {
      return [];
    }

    const tableId = tableInfo.table_id || tableInfo.tableId || null;
    const tableName = tableInfo.table_name || tableInfo.tableName || null;
    const matchesTable = (row) => {
      const rowTableId = row?.table_id || row?.tableId || null;
      const rowTableName = row?.table_name || row?.tableName || null;
      return (tableId && rowTableId === tableId) ||
        (tableName && rowTableName === tableName);
    };

    if (typeof this.systemCache.filter === LOCAL_STR_FUNCTION) {
      return this.systemCache.filter(
        TABLES.SCHEMA_MIGRATIONS,
        matchesTable,
      ) || [];
    }

    if (typeof this.systemCache.getAll === LOCAL_STR_FUNCTION) {
      const rows = this.systemCache.getAll(TABLES.SCHEMA_MIGRATIONS) || [];
      return rows.filter(matchesTable);
    }

    return [];
  }

  /**
   * Resolve one active dual-write migration row for a table.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {Object|null} Active migration row.
   * @private
   */
  getActiveDualWriteMigration(tableInfo) {
    const rows = this.getTableMigrationsFromCache(tableInfo);
    for (const row of rows) {
      const status = String(
        row?.status ||
        row?.current_stage ||
        '',
      ).trim();
      if (DUAL_WRITE_ACTIVE_STATUSES.has(status)) {
        return row;
      }
    }
    return null;
  }

  /**
   * Resolve whether a table is currently in dual-write mode.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {boolean} True when dual-write migration is active.
   * @private
   */
  isDualWriteModeActiveForTable(tableInfo) {
    return this.getActiveDualWriteMigration(tableInfo) !== null;
  }

  /**
   * Resolve one partition metadata row by partition ID.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null} Partition metadata row.
   * @private
   */
  getPartitionInfo(partitionId) {
    if (!partitionId || !this.systemCache) {
      return null;
    }

    try {
      if (typeof this.systemCache.get === LOCAL_STR_FUNCTION) {
        const direct = this.systemCache.get(TABLES.PARTITIONS, partitionId);
        if (direct) {
          return direct;
        }
      }
      if (typeof this.systemCache.find === LOCAL_STR_FUNCTION) {
        const found = this.systemCache.find(TABLES.PARTITIONS, (partition) =>
          partition.partition_id === partitionId ||
          partition.partitionId === partitionId,
        );
        if (found) {
          return found;
        }
      }
      if (typeof this.systemCache.getAll === LOCAL_STR_FUNCTION) {
        const partitions = this.systemCache.getAll(TABLES.PARTITIONS) || [];
        return partitions.find((partition) =>
          partition.partition_id === partitionId ||
          partition.partitionId === partitionId,
        ) || null;
      }
    } catch (_cacheErr) {
      // Cache not available
    }

    return null;
  }

  /**
   * Determine whether the local node is the persisted leader for one partition.
   * @param {Object|null} partitionInfo - Partition metadata row.
   * @return {boolean} True when the local node owns split orchestration.
   * @private
   */
  isLocalManagedSplitLeader(partitionInfo) {
    if (!partitionInfo || !this.nodeId) {
      return false;
    }
    const leaderNodeId =
      partitionInfo.leader_node_id ?? partitionInfo.leaderNodeId;
    return Boolean(leaderNodeId) && leaderNodeId === this.nodeId;
  }

  /**
   * Parse partition transition metadata from a table row.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {Object|null} Parsed transition metadata.
   * @private
   */
  parsePartitionTransition(tableInfo) {
    if (!tableInfo) {
      return null;
    }

    const state = tableInfo.partition_transition_state ??
      tableInfo.partitionTransitionState ??
      null;
    const rawMetadata = tableInfo.partition_transition_metadata ??
      tableInfo.partitionTransitionMetadata ??
      null;
    if (!state || !rawMetadata) {
      return null;
    }

    try {
      const metadata = typeof rawMetadata === 'string' ?
        JSON.parse(rawMetadata) :
        rawMetadata;
      return metadata && typeof metadata === LOCAL_STR_OBJECT ?
        {
          state,
          metadata,
        } :
        null;
    } catch (_parseErr) {
      return null;
    }
  }

  /**
   * Add post-cutover mirror participants so writes keep the source
   * partition current while caches converge to the new partition set.
   * @param {Object} writePlan - Distributed write plan.
   * @param {Object} ast - Statement AST.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {Object} The mutated write plan.
   * @private
   */
  addTransitionMirrorParticipants(writePlan, ast, tableInfo) {
    const transition = this.parsePartitionTransition(tableInfo);
    if (
      !transition ||
      transition.state !== PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE
    ) {
      return writePlan;
    }

    const metadata = transition.metadata || {};
    const activeVersion = this.resolveActivePartitionVersion(tableInfo);
    const targetVersion = Number(
      metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION],
    );
    const sourcePartitionId =
      metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID];
    if (
      !sourcePartitionId ||
      !Number.isInteger(targetVersion) ||
      targetVersion !== activeVersion
    ) {
      return writePlan;
    }

    this.distributedWriteCoordinator.addMirrorParticipant(
      writePlan,
      sourcePartitionId,
      ast,
      {splitMirrorOrigin: PARTITION_SPLIT_MIRROR_ORIGIN.TARGET},
    );
    return writePlan;
  }

  /**
   * Resolve active partition version from table metadata.
   * Missing values default to version 1 for compatibility.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {number} Active partition-set version.
   * @private
   */
  resolveActivePartitionVersion(tableInfo) {
    const value = tableInfo?.active_partition_version ??
      tableInfo?.activePartitionVersion;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < DEFAULT_PARTITION_VERSION) {
      return DEFAULT_PARTITION_VERSION;
    }
    return parsed;
  }

  /**
   * Determine whether a partition row should participate in normal routing.
   * Hidden or non-normal child partitions remain invisible until cutover.
   * @param {Object} partition - Partition metadata row.
   * @param {number} activePartitionVersion - Active partition-set version.
   * @return {boolean} True when the partition is routable for table traffic.
   * @private
   */
  isPartitionVisibleForRouting(partition, activePartitionVersion) {
    const partitionVersion = Number(
      partition?.partition_version ?? partition?.partitionVersion,
    );
    const normalizedVersion = Number.isInteger(partitionVersion) &&
      partitionVersion >= DEFAULT_PARTITION_VERSION ?
      partitionVersion :
      DEFAULT_PARTITION_VERSION;
    if (normalizedVersion !== activePartitionVersion) {
      return false;
    }

    const state = String(
      partition?.state ?? ACTIVE_PARTITION_STATE,
    ).toUpperCase();
    return state === ACTIVE_PARTITION_STATE;
  }

  /**
   * Check if a table is a system table.
   * @param {string} tableName - Table name.
   * @return {boolean} True if system table.
   * @private
   */
  isSystemTable(tableName) {
    return Object.values(SYSTEM_TABLE_NAME).includes(tableName);
  }

  /**
   * Resolve router delivery priority for one routed table operation.
   * Topology/control-plane tables default to the critical lane. High-volume
   * transaction bookkeeping tables use the background lane so they cannot
   * starve replica operations or startup/rebalance progress.
   * @param {string|null} tableName
   * @param {string|undefined|null} deliveryPriority
   * @return {string|undefined}
   * @private
   */
  resolveRoutedDeliveryPriority(tableName, deliveryPriority) {
    if (
      typeof deliveryPriority === LOCAL_STR_STRING &&
      deliveryPriority.length > 0
    ) {
      return deliveryPriority;
    }
    if (!this.isSystemTable(tableName)) {
      return undefined;
    }
    return BACKGROUND_SYSTEM_TABLE_DELIVERY_PRIORITY_TABLES.has(tableName) ?
      LOCAL_STR_BACKGROUND :
      LOCAL_STR_CRITICAL;
  }
}

function createSQLQueryEngineTableRoutingMethods() {
  return Object.fromEntries(
    Object.entries(
      Object.getOwnPropertyDescriptors(
        SQLQueryEngineTableRoutingMethods.prototype,
      ),
    ).filter(([name]) => name !== 'constructor'),
  );
}

export {createSQLQueryEngineTableRoutingMethods};
