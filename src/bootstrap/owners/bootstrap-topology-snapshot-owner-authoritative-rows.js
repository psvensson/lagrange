import {assertCritical} from '../../utils/assert.js';
import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../constants/index.js';
import {RAFT_ROLE} from '../../raft/constants.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../../cache/system-cache-key-descriptor.js';
import {
  BOOTSTRAP_API_ERROR,
} from '../bootstrap-api-constants.js';
import {
  isPriorityControlPlanePartition,
} from '../system-partition-classification.js';
import {
  BOOTSTRAP_TOPOLOGY_SNAPSHOT_LOG,
  BOOTSTRAP_TOPOLOGY_SNAPSHOT_PARTITION_STABILIZATION_MAX_IDS,
  BOOTSTRAP_TOPOLOGY_SNAPSHOT_PARTITION_STABILIZATION_PAYLOAD,
  BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SELECTION_REASON,
  BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SOURCE,
  BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_STABILIZATION_STATE,
  BOOTSTRAP_TOPOLOGY_SNAPSHOT_WARNING_KEY,
  readBootstrapTopologySnapshotPartitionId,
  readBootstrapTopologySnapshotPartitionLeaderNodeId,
  readBootstrapTopologySnapshotRowKey,
  readBootstrapTopologySnapshotServiceNodeId,
  readBootstrapTopologySnapshotServicePartitionId,
  readBootstrapTopologySnapshotServiceRaftRole,
  readBootstrapTopologySnapshotServiceStatus,
  readBootstrapTopologySnapshotServiceType,
  resolveAuthoritativeSystemTableRowSourceSelection,
} from './bootstrap-topology-snapshot-owner-contract.js';

function resolvePartitionOwnerStabilizationCacheRow(options = {}) {
  const cacheRow = options.cacheRow || null;
  const retainedSnapshotRow = options.retainedSnapshotRow || null;
  const cacheLeaderNodeId =
    readBootstrapTopologySnapshotPartitionLeaderNodeId(cacheRow);
  if (cacheLeaderNodeId !== null || retainedSnapshotRow === null) {
    return cacheRow || retainedSnapshotRow;
  }
  const retainedSnapshotLeaderNodeId =
    readBootstrapTopologySnapshotPartitionLeaderNodeId(retainedSnapshotRow);
  if (retainedSnapshotLeaderNodeId !== null) {
    return retainedSnapshotRow;
  }
  return cacheRow || retainedSnapshotRow;
}

function isAuthoritativeSnapshotRowNewer(candidate, existing) {
  const candidateUpdatedAt = Number(
    candidate?.[COLUMN.UPDATED_AT] ??
      candidate?.updated_at ??
      candidate?.updatedAt,
  );
  const existingUpdatedAt = Number(
    existing?.[COLUMN.UPDATED_AT] ??
      existing?.updated_at ??
      existing?.updatedAt,
  );
  if (
    Number.isFinite(candidateUpdatedAt) &&
    Number.isFinite(existingUpdatedAt)
  ) {
    return candidateUpdatedAt > existingUpdatedAt;
  }
  if (
    Number.isFinite(candidateUpdatedAt) &&
    !Number.isFinite(existingUpdatedAt)
  ) {
    return true;
  }

  const candidateCreatedAt = Number(
    candidate?.[COLUMN.CREATED_AT] ??
      candidate?.created_at ??
      candidate?.createdAt,
  );
  const existingCreatedAt = Number(
    existing?.[COLUMN.CREATED_AT] ??
      existing?.created_at ??
      existing?.createdAt,
  );
  if (
    Number.isFinite(candidateCreatedAt) &&
    Number.isFinite(existingCreatedAt)
  ) {
    return candidateCreatedAt > existingCreatedAt;
  }
  if (
    Number.isFinite(candidateCreatedAt) &&
    !Number.isFinite(existingCreatedAt)
  ) {
    return true;
  }

  return JSON.stringify(candidate).length > JSON.stringify(existing).length;
}

const bootstrapTopologySnapshotOwnerAuthoritativeRowsMethods = {
  resolvePublishedAuthoritativeSystemTableSnapshotRows(options = {}) {
    const tableName = options.tableName;
    const observedRows = Array.isArray(options.observedRows) ?
      options.observedRows :
      [];
    const retainedSnapshotRows = Array.isArray(options.retainedSnapshotRows) ?
      options.retainedSnapshotRows :
      [];
    return this.stabilizeAuthoritativeSystemTableSnapshotRows({
      tableName,
      cacheRows: observedRows,
      mergedRows: observedRows,
      retainedSnapshotRows,
    });
  },
  resolveAuthoritativeSystemTableSnapshotRows(
    tableName,
    observedSystemCacheRows = [],
  ) {
    const retainedSnapshotRows =
      this.readRetainedAuthoritativeSystemTableSnapshotRows(tableName);
    const observedPublishedRows =
      this.readPublishedAuthoritativeSystemTableSnapshotRows(tableName);
    if (Array.isArray(observedPublishedRows)) {
      return observedPublishedRows;
    }
    const localRowSets = this.queryLocalAuthoritativePartitionRowSets(tableName);
    const mergedRows = this.mergeAuthoritativeSystemTableRowSets(
      tableName,
      localRowSets,
    );
    const stabilizedRows = this.stabilizeAuthoritativeSystemTableSnapshotRows({
      tableName,
      cacheRows: observedSystemCacheRows,
      mergedRows,
      retainedSnapshotRows,
    });
    const rowSourceSelection = resolveAuthoritativeSystemTableRowSourceSelection({
      cacheRows: observedSystemCacheRows,
      localRowSets,
      mergedRows: stabilizedRows,
    });
    let publishedRows = rowSourceSelection.rows;
    let observedRawRows = mergedRows;

    if (
      rowSourceSelection.reason ===
      BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SELECTION_REASON
        .EMPTY_LOCAL_AUTHORITATIVE_ROWS
    ) {
      this.warnBootstrapTopologySnapshot(
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_WARNING_KEY
          .EMPTY_LOCAL_AUTHORITATIVE_SNAPSHOT_RETAINING_CACHE,
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_LOG
          .EMPTY_LOCAL_AUTHORITATIVE_SNAPSHOT_RETAINING_CACHE,
        {
          seedNodeId: this.getSeedNodeId(),
          tableName,
          cacheRowCount: observedSystemCacheRows.length,
          authoritativeRowCount: stabilizedRows.length,
          replicaCount: localRowSets.length,
        },
      );
      publishedRows = this.resolvePublishedAuthoritativeSystemTableSnapshotRows({
        tableName,
        observedRows: rowSourceSelection.rows,
        retainedSnapshotRows,
      });
      observedRawRows = rowSourceSelection.rows;
    }

    if (
      rowSourceSelection.source ===
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SOURCE.AUTHORITATIVE_LOCAL_PARTITION &&
      stabilizedRows.length !== observedSystemCacheRows.length
    ) {
      this.warnBootstrapTopologySnapshot(
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_WARNING_KEY
          .SNAPSHOT_DIVERGED_FROM_LOCAL_AUTHORITATIVE_PARTITION_STATE,
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_LOG
          .SNAPSHOT_DIVERGED_FROM_LOCAL_AUTHORITATIVE_PARTITION_STATE,
        {
          seedNodeId: this.getSeedNodeId(),
          tableName,
          cacheRowCount: observedSystemCacheRows.length,
          authoritativeRowCount: stabilizedRows.length,
          replicaCount: localRowSets.length,
        },
      );
    }

    return this.cacheAuthoritativeSystemTableSnapshotRows(
      tableName,
      publishedRows,
      {
        rawRows: observedRawRows,
      },
    );
  },
  stabilizeAuthoritativeSystemTableSnapshotRows(options = {}) {
    const tableName = options.tableName;
    const cacheRows = Array.isArray(options.cacheRows) ? options.cacheRows : [];
    const mergedRows = Array.isArray(options.mergedRows) ? options.mergedRows : [];
    const retainedSnapshotRows = Array.isArray(options.retainedSnapshotRows) ?
      options.retainedSnapshotRows :
      [];
    if (tableName !== TABLES.PARTITIONS || mergedRows.length === 0) {
      return mergedRows;
    }

    const cacheRowByKey = new Map();
    for (const cacheRow of cacheRows) {
      const cacheKey = readBootstrapTopologySnapshotRowKey(tableName, cacheRow);
      if (cacheKey) {
        cacheRowByKey.set(cacheKey, cacheRow);
      }
    }
    const retainedSnapshotRowByKey = new Map();
    for (const retainedSnapshotRow of retainedSnapshotRows) {
      const retainedSnapshotKey =
        readBootstrapTopologySnapshotRowKey(tableName, retainedSnapshotRow);
      if (retainedSnapshotKey) {
        retainedSnapshotRowByKey.set(retainedSnapshotKey, retainedSnapshotRow);
      }
    }

    const serviceRows = this.getBootstrapAuthoritativeTableRows(TABLES.SERVICES);
    const retainedCacheOwnerPartitionIds = [];
    const stabilizedPartitionIds = [];
    const stabilizedRows = mergedRows.map((authoritativeRow) => {
      const authoritativeKey =
        readBootstrapTopologySnapshotRowKey(tableName, authoritativeRow);
      const cacheRow = authoritativeKey ?
        this.resolvePartitionOwnerStabilizationCacheRow({
          cacheRow: cacheRowByKey.get(authoritativeKey) || null,
          retainedSnapshotRow:
            retainedSnapshotRowByKey.get(authoritativeKey) || null,
        }) :
        null;
      const stabilization = this.resolvePartitionOwnerFieldStabilization({
        authoritativeRow,
        cacheRow,
        serviceRows,
      });
      if (
        stabilization.state ===
          BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_STABILIZATION_STATE
            .RETAINED_CACHE_OWNER &&
        authoritativeKey
      ) {
        retainedCacheOwnerPartitionIds.push(authoritativeKey);
      }
      if (
        stabilization.state ===
          BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_STABILIZATION_STATE
            .AUTHORITATIVE_OWNER_MISSING &&
        authoritativeKey
      ) {
        stabilizedPartitionIds.push(authoritativeKey);
      }
      return stabilization.row;
    });

    if (retainedCacheOwnerPartitionIds.length > 0) {
      this.warnBootstrapTopologySnapshot(
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_WARNING_KEY
          .RETAINED_CACHED_PARTITION_OWNER_DURING_CONVERGENCE,
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_LOG
          .RETAINED_CACHED_PARTITION_OWNER_DURING_CONVERGENCE,
        {
          seedNodeId: this.getSeedNodeId(),
          tableName,
          [BOOTSTRAP_TOPOLOGY_SNAPSHOT_PARTITION_STABILIZATION_PAYLOAD
            .PARTITION_COUNT]: retainedCacheOwnerPartitionIds.length,
          [BOOTSTRAP_TOPOLOGY_SNAPSHOT_PARTITION_STABILIZATION_PAYLOAD
            .PARTITION_IDS]: retainedCacheOwnerPartitionIds
            .slice(
              0,
              BOOTSTRAP_TOPOLOGY_SNAPSHOT_PARTITION_STABILIZATION_MAX_IDS,
            ),
        },
      );
    }

    if (stabilizedPartitionIds.length > 0) {
      this.warnBootstrapTopologySnapshot(
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_WARNING_KEY
          .AUTHORITATIVE_PARTITION_OWNER_MISSING_DURING_CONVERGENCE,
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_LOG
          .AUTHORITATIVE_PARTITION_OWNER_MISSING_DURING_CONVERGENCE,
        {
          seedNodeId: this.getSeedNodeId(),
          tableName,
          [BOOTSTRAP_TOPOLOGY_SNAPSHOT_PARTITION_STABILIZATION_PAYLOAD
            .PARTITION_COUNT]: stabilizedPartitionIds.length,
          [BOOTSTRAP_TOPOLOGY_SNAPSHOT_PARTITION_STABILIZATION_PAYLOAD
            .PARTITION_IDS]: stabilizedPartitionIds
            .slice(
              0,
              BOOTSTRAP_TOPOLOGY_SNAPSHOT_PARTITION_STABILIZATION_MAX_IDS,
            ),
        },
      );
    }

    return stabilizedRows;
  },
  resolvePartitionOwnerFieldStabilization(options = {}) {
    const authoritativeRow = options.authoritativeRow || null;
    const cacheRow = options.cacheRow || null;
    const serviceRows = Array.isArray(options.serviceRows) ?
      options.serviceRows :
      [];
    const authoritativeLeaderNodeId =
      readBootstrapTopologySnapshotPartitionLeaderNodeId(authoritativeRow);
    const cacheLeaderNodeId =
      readBootstrapTopologySnapshotPartitionLeaderNodeId(cacheRow);

    if (!authoritativeRow) {
      if (
        cacheLeaderNodeId !== null &&
        this.shouldRetainCachedPartitionOwner({
          authoritativeRow: cacheRow,
          cacheLeaderNodeId,
          serviceRows,
        })
      ) {
        return Object.freeze({
          state:
            BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_STABILIZATION_STATE
              .RETAINED_CACHE_OWNER,
          row: cacheRow,
        });
      }
      return Object.freeze({
        state:
          BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_STABILIZATION_STATE
            .AUTHORITATIVE_OWNER_MISSING,
        row: cacheRow,
      });
    }

    if (authoritativeLeaderNodeId !== null || cacheLeaderNodeId === null) {
      return Object.freeze({
        state: BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_STABILIZATION_STATE.AUTHORITATIVE,
        row: authoritativeRow,
      });
    }

    if (this.shouldRetainCachedPartitionOwner({
      authoritativeRow,
      cacheLeaderNodeId,
      serviceRows,
    })) {
      return Object.freeze({
        state:
          BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_STABILIZATION_STATE
            .RETAINED_CACHE_OWNER,
        row: {
          ...authoritativeRow,
          [COLUMN.LEADER_NODE_ID]: cacheLeaderNodeId,
        },
      });
    }

    return Object.freeze({
      state:
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_STABILIZATION_STATE
          .AUTHORITATIVE_OWNER_MISSING,
      row: authoritativeRow,
    });
  },
  shouldRetainCachedPartitionOwner(options = {}) {
    const authoritativeRow = options.authoritativeRow || null;
    const cacheLeaderNodeId = options.cacheLeaderNodeId || null;
    const serviceRows = Array.isArray(options.serviceRows) ?
      options.serviceRows :
      [];
    const partitionId = readBootstrapTopologySnapshotPartitionId(
      authoritativeRow,
    );
    if (
      !partitionId ||
      !cacheLeaderNodeId ||
      !isPriorityControlPlanePartition({
        partitionId,
        partitionRow: authoritativeRow,
      })
    ) {
      return false;
    }
    return this.hasActivePartitionServiceOnNode(
      partitionId,
      cacheLeaderNodeId,
      serviceRows,
      authoritativeRow,
    );
  },
  resolveRetainablePartitionLeaderServices(partitionRow, services = []) {
    const explicitLeaderServices = services.filter((serviceRow) => {
      return readBootstrapTopologySnapshotServiceRaftRole(serviceRow) ===
        String(RAFT_ROLE.LEADER).toLowerCase();
    });
    if (explicitLeaderServices.length === 1) {
      return explicitLeaderServices;
    }
    if (!this.isBootstrapRoutingGraceWindow(partitionRow)) {
      return [];
    }
    return services.length === 1 ? [services[0]] : [];
  },
  hasActivePartitionServiceOnNode(
    partitionId,
    nodeId,
    serviceRows = [],
    partitionRow = null,
  ) {
    if (
      typeof partitionId !== 'string' ||
      partitionId.length === 0 ||
      typeof nodeId !== 'string' ||
      nodeId.length === 0
    ) {
      return false;
    }
    const activePartitionServices = serviceRows.filter((serviceRow) => {
      return readBootstrapTopologySnapshotServicePartitionId(serviceRow) ===
          partitionId &&
        readBootstrapTopologySnapshotServiceType(serviceRow) ===
          SERVICE_TYPE.PARTITION &&
        String(readBootstrapTopologySnapshotServiceStatus(serviceRow) || '')
          .toLowerCase() === String(SERVICE_STATUS.ACTIVE).toLowerCase();
    });
    const retainableLeaderServices =
      this.resolveRetainablePartitionLeaderServices(
        partitionRow,
        activePartitionServices,
      );
    return retainableLeaderServices.some((serviceRow) => {
      return readBootstrapTopologySnapshotServiceNodeId(serviceRow) === nodeId;
    });
  },
  queryLocalAuthoritativePartitionRowSets(tableName) {
    const systemTableCache = assertCritical(
      this.getSystemTableCache(),
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const partitionServices = this.getPartitionServices();
    if (!partitionServices || partitionServices.size === 0) {
      return [];
    }

    const partitionRows =
      typeof systemTableCache.filter === 'function' ?
        systemTableCache.filter(TABLES.PARTITIONS, (row) => {
          const rowTableName =
            row?.[COLUMN.TABLE_NAME] || row?.table_name || row?.tableName;
          const rowTableId =
            row?.[COLUMN.TABLE_ID] || row?.table_id || row?.tableId;
          return rowTableName === tableName || rowTableId === tableName;
        }) :
        [];
    const partitionIds = [...new Set(partitionRows
      .map((row) =>
        row?.[COLUMN.PARTITION_ID] || row?.partition_id || row?.partitionId,
      )
      .filter((value) =>
        typeof value === 'string' && value.length > 0,
      ),
    )];
    if (partitionIds.length === 0) {
      return [];
    }

    const rowSets = [];
    const sql = `SELECT * FROM ${tableName}`;
    for (const partitionId of partitionIds) {
      for (const service of partitionServices.values()) {
        if (
          service?.partitionId !== partitionId ||
          service?.initialized !== true ||
          typeof service?.db?.prepare !== 'function'
        ) {
          continue;
        }
        try {
          const rows = service.db.prepare(sql).all();
          rowSets.push(Array.isArray(rows) ? rows : []);
        } catch (error) {
          this.warnBootstrapTopologySnapshot(
            BOOTSTRAP_TOPOLOGY_SNAPSHOT_WARNING_KEY
              .FAILED_TO_READ_AUTHORITATIVE_SNAPSHOT_ROWS_FROM_LOCAL_PARTITION,
            BOOTSTRAP_TOPOLOGY_SNAPSHOT_LOG
              .FAILED_TO_READ_AUTHORITATIVE_SNAPSHOT_ROWS_FROM_LOCAL_PARTITION,
            {
              seedNodeId: this.getSeedNodeId(),
              tableName,
              partitionId,
              replicaId: service?.replicaId || service?.service_id || null,
              error: error.message,
            },
          );
        }
      }
    }

    return rowSets;
  },
  mergeAuthoritativeSystemTableRowSets(tableName, rowSets) {
    const keyField = getSystemCachePrimaryKeyFieldOrFallback(tableName, 'id');
    const mergedRows = new Map();

    for (const rowSet of rowSets) {
      const rows = Array.isArray(rowSet) ? rowSet : [];
      for (const row of rows) {
        const key = row?.[keyField] ?? row?.id;
        if (typeof key === 'undefined' || key === null) {
          continue;
        }
        const existing = mergedRows.get(key);
        if (!existing || this.isAuthoritativeSnapshotRowNewer(row, existing)) {
          mergedRows.set(key, row);
        }
      }
    }

    return [...mergedRows.values()];
  },
};

const {
  resolvePublishedAuthoritativeSystemTableSnapshotRows,
  resolveAuthoritativeSystemTableSnapshotRows,
  stabilizeAuthoritativeSystemTableSnapshotRows,
  resolvePartitionOwnerFieldStabilization,
  shouldRetainCachedPartitionOwner,
  resolveRetainablePartitionLeaderServices,
  hasActivePartitionServiceOnNode,
  queryLocalAuthoritativePartitionRowSets,
  mergeAuthoritativeSystemTableRowSets,
} = bootstrapTopologySnapshotOwnerAuthoritativeRowsMethods;

export {
  hasActivePartitionServiceOnNode,
  isAuthoritativeSnapshotRowNewer,
  mergeAuthoritativeSystemTableRowSets,
  queryLocalAuthoritativePartitionRowSets,
  resolveAuthoritativeSystemTableSnapshotRows,
  resolvePartitionOwnerFieldStabilization,
  resolvePartitionOwnerStabilizationCacheRow,
  resolvePublishedAuthoritativeSystemTableSnapshotRows,
  resolveRetainablePartitionLeaderServices,
  shouldRetainCachedPartitionOwner,
  stabilizeAuthoritativeSystemTableSnapshotRows,
};
