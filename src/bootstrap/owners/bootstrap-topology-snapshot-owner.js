import {ConfigurationManager} from '../../config/configuration-manager.js';
import {CONFIG_KEY} from '../../config/config-constants.js';
import {assertCritical} from '../../utils/assert.js';
import {
  COLUMN,
  NUM,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
  TYPEOF,
} from '../../constants/index.js';
import {RAFT_ROLE} from '../../raft/constants.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../../cache/system-cache-key-descriptor.js';
import {
  buildBootstrapTopologySnapshotEnvelope,
} from '../bootstrap-topology-snapshot.js';
import {
  BOOTSTRAP_API_ERROR,
} from '../bootstrap-api-constants.js';

class BootstrapTopologySnapshotOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
  }

  getSystemTableCache() {
    return this.delegates.getSystemTableCache?.() || null;
  }

  getPartitionServices() {
    return this.delegates.getPartitionServices?.() || null;
  }

  getSeedNodeId() {
    return this.delegates.getSeedNodeId?.() || null;
  }

  getLogger() {
    return this.delegates.getLogger?.() || console;
  }

  getCurrentEpoch() {
    return this.delegates.getCurrentEpoch?.() || null;
  }

  getBootstrapAuthoritativeTableRows(tableName) {
    const systemTableCache = assertCritical(
      this.getSystemTableCache(),
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const cacheRows = systemTableCache.getAll(tableName) || [];
    const rows = this.resolveAuthoritativeSystemTableSnapshotRows(
      tableName,
      cacheRows,
    );
    return Array.isArray(rows) ? rows : [];
  }

  buildSystemTableSnapshots() {
    return this.buildBootstrapTopologySnapshotEnvelope()
      .systemTableSnapshots;
  }

  buildBootstrapTopologySnapshotEnvelope(options = {}) {
    const currentEpoch =
      options.currentEpoch === undefined ?
        this.getCurrentEpoch() :
        options.currentEpoch;
    const envelope = buildBootstrapTopologySnapshotEnvelope({
      systemTableCache: assertCritical(
        this.getSystemTableCache(),
        BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
      ),
      currentEpoch,
      resolveSnapshotRows: (tableName, cacheRows) =>
        this.resolveAuthoritativeSystemTableSnapshotRows(
          tableName,
          cacheRows,
        ),
    });

    const serviceSnapshot = envelope.systemTableSnapshots[TABLES.SERVICES] || [];
    const leaders = serviceSnapshot.filter((service) =>
      service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
      service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
      service[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE,
    );

    if (leaders.length === NUM.ZERO) {
      this.getLogger().warn('No partition leaders found in system cache', {
        seedNodeId: this.getSeedNodeId(),
        totalServices: serviceSnapshot.length,
      });
    }

    return envelope;
  }

  resolveBootstrapTopologySnapshotMeta(topologySnapshotMeta = null) {
    if (topologySnapshotMeta && typeof topologySnapshotMeta === TYPEOF.OBJECT) {
      return topologySnapshotMeta;
    }
    return this.buildBootstrapTopologySnapshotEnvelope().topologySnapshotMeta ||
      null;
  }

  resolveBootstrapTopologySnapshotActiveNodeIds(topologySnapshotMeta = null) {
    const resolvedMeta =
      this.resolveBootstrapTopologySnapshotMeta(topologySnapshotMeta);
    if (!Array.isArray(resolvedMeta?.activeNodeIds)) {
      return [];
    }
    return [...new Set(resolvedMeta.activeNodeIds.filter((nodeId) =>
      typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO,
    ))];
  }

  resolveBootstrapTopologySnapshotEpoch(topologySnapshotMeta = null) {
    const resolvedMeta =
      this.resolveBootstrapTopologySnapshotMeta(topologySnapshotMeta);
    if (Number.isFinite(resolvedMeta?.topologyEpoch)) {
      return Math.max(NUM.ZERO, Math.floor(resolvedMeta.topologyEpoch));
    }
    const currentEpoch = this.getCurrentEpoch();
    if (Number.isFinite(currentEpoch?.epoch)) {
      return Math.max(NUM.ZERO, Math.floor(currentEpoch.epoch));
    }
    return null;
  }

  getBootstrapPartitionSnapshotRow(partitionId) {
    if (typeof partitionId !== TYPEOF.STRING ||
        partitionId.length === NUM.ZERO) {
      return null;
    }
    const partitionRows =
      this.getBootstrapAuthoritativeTableRows(TABLES.PARTITIONS);
    return partitionRows.find((row) => {
      return row?.[COLUMN.PARTITION_ID] === partitionId ||
        row?.partition_id === partitionId ||
        row?.partitionId === partitionId;
    }) || null;
  }

  resolveCanonicalPartitionLeaderNodeId(partitionId) {
    const partition =
      this.getBootstrapPartitionSnapshotRow(partitionId);
    const leaderNodeId =
      partition?.[COLUMN.LEADER_NODE_ID] ??
      partition?.leader_node_id ??
      partition?.leaderNodeId ??
      null;
    return typeof leaderNodeId === TYPEOF.STRING &&
      leaderNodeId.length > NUM.ZERO ?
      leaderNodeId :
      null;
  }

  isBootstrapRoutingGraceWindow(partition) {
    if (!partition) {
      return false;
    }
    const createdAt =
      partition?.[COLUMN.CREATED_AT] ??
      partition?.created_at ??
      partition?.createdAt ??
      null;
    const updatedAt =
      partition?.[COLUMN.UPDATED_AT] ??
      partition?.updated_at ??
      partition?.updatedAt ??
      null;
    return Number.isFinite(createdAt) &&
      Number.isFinite(updatedAt) &&
      createdAt === updatedAt;
  }

  isFreshPartitionBootstrapWindow(partitionOrId) {
    const partition =
      partitionOrId && typeof partitionOrId === TYPEOF.OBJECT ?
        partitionOrId :
        this.getBootstrapPartitionSnapshotRow(partitionOrId);
    if (!this.isBootstrapRoutingGraceWindow(partition)) {
      return false;
    }
    return this.resolveCanonicalPartitionLeaderNodeId(
      partition?.[COLUMN.PARTITION_ID] ??
      partition?.partition_id ??
      partition?.partitionId ??
      null,
    ) === null;
  }

  getFreshBootstrapLeaderServices(partitionId, services = []) {
    const partition =
      this.getBootstrapPartitionSnapshotRow(partitionId);
    if (!this.isFreshPartitionBootstrapWindow(partition)) {
      return [];
    }

    const leaderServices = services.filter((service) =>
      String(service?.raft_role || '').toLowerCase() ===
        String(RAFT_ROLE.LEADER).toLowerCase(),
    );
    if (leaderServices.length === NUM.ONE) {
      return leaderServices;
    }

    return services.length === NUM.ONE ? [services[NUM.ZERO]] : [];
  }

  resolveAuthoritativeSystemTableSnapshotRows(tableName, cacheRows = []) {
    const localRowSets = this.queryLocalAuthoritativePartitionRowSets(tableName);
    if (localRowSets.length === NUM.ZERO) {
      return cacheRows;
    }

    const mergedRows = this.mergeAuthoritativeSystemTableRowSets(
      tableName,
      localRowSets,
    );
    if (mergedRows.length !== cacheRows.length) {
      this.getLogger().warn(
        'Bootstrap snapshot diverged from local authoritative partition state',
        {
          seedNodeId: this.getSeedNodeId(),
          tableName,
          cacheRowCount: cacheRows.length,
          authoritativeRowCount: mergedRows.length,
          replicaCount: localRowSets.length,
        },
      );
    }

    return mergedRows;
  }

  queryLocalAuthoritativePartitionRowSets(tableName) {
    const systemTableCache = assertCritical(
      this.getSystemTableCache(),
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const partitionServices = this.getPartitionServices();
    if (!partitionServices || partitionServices.size === NUM.ZERO) {
      return [];
    }

    const partitionRows =
      typeof systemTableCache.filter === TYPEOF.FUNCTION ?
        systemTableCache.filter(TABLES.PARTITIONS, (row) => {
          const rowTableName = row?.[COLUMN.TABLE_NAME] || row?.table_name || row?.tableName;
          const rowTableId = row?.[COLUMN.TABLE_ID] || row?.table_id || row?.tableId;
          return rowTableName === tableName || rowTableId === tableName;
        }) :
        [];
    const partitionIds = [...new Set(partitionRows
      .map((row) => row?.[COLUMN.PARTITION_ID] || row?.partition_id || row?.partitionId)
      .filter((value) => typeof value === TYPEOF.STRING && value.length > NUM.ZERO),
    )];
    if (partitionIds.length === NUM.ZERO) {
      return [];
    }

    const rowSets = [];
    const sql = `SELECT * FROM ${tableName}`;
    for (const partitionId of partitionIds) {
      for (const service of partitionServices.values()) {
        if (service?.partitionId !== partitionId ||
            service?.initialized !== true ||
            typeof service?.db?.prepare !== TYPEOF.FUNCTION) {
          continue;
        }
        try {
          const rows = service.db.prepare(sql).all();
          rowSets.push(Array.isArray(rows) ? rows : []);
        } catch (error) {
          this.getLogger().warn(
            'Failed to read authoritative snapshot rows from local partition',
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
  }

  mergeAuthoritativeSystemTableRowSets(tableName, rowSets) {
    const keyField = getSystemCachePrimaryKeyFieldOrFallback(tableName, 'id');
    const mergedRows = new Map();

    for (const rowSet of rowSets) {
      const rows = Array.isArray(rowSet) ? rowSet : [];
      for (const row of rows) {
        const key = row?.[keyField] ?? row?.id;
        if (typeof key === TYPEOF.UNDEFINED || key === null) {
          continue;
        }
        const existing = mergedRows.get(key);
        if (!existing || this.isAuthoritativeSnapshotRowNewer(row, existing)) {
          mergedRows.set(key, row);
        }
      }
    }

    return [...mergedRows.values()];
  }

  isAuthoritativeSnapshotRowNewer(candidate, existing) {
    const candidateUpdatedAt =
      Number(candidate?.[COLUMN.UPDATED_AT] ?? candidate?.updated_at ?? candidate?.updatedAt);
    const existingUpdatedAt =
      Number(existing?.[COLUMN.UPDATED_AT] ?? existing?.updated_at ?? existing?.updatedAt);
    if (Number.isFinite(candidateUpdatedAt) && Number.isFinite(existingUpdatedAt)) {
      return candidateUpdatedAt > existingUpdatedAt;
    }
    if (Number.isFinite(candidateUpdatedAt) && !Number.isFinite(existingUpdatedAt)) {
      return true;
    }

    const candidateCreatedAt =
      Number(candidate?.[COLUMN.CREATED_AT] ?? candidate?.created_at ?? candidate?.createdAt);
    const existingCreatedAt =
      Number(existing?.[COLUMN.CREATED_AT] ?? existing?.created_at ?? existing?.createdAt);
    if (Number.isFinite(candidateCreatedAt) && Number.isFinite(existingCreatedAt)) {
      return candidateCreatedAt > existingCreatedAt;
    }
    if (Number.isFinite(candidateCreatedAt) && !Number.isFinite(existingCreatedAt)) {
      return true;
    }

    return JSON.stringify(candidate).length > JSON.stringify(existing).length;
  }

  getLatencyTopologyHints(nodeId) {
    const systemTableCache = assertCritical(
      this.getSystemTableCache(),
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const config = ConfigurationManager.getInstance();
    const propagationMode = config.get(CONFIG_KEY.LATENCY_PROPAGATION_MODE) || null;
    const joiningNode = systemTableCache.get(TABLES.NODES, nodeId) || null;
    const groups = systemTableCache.getAll(TABLES.LATENCY_GROUPS) || [];
    const interGroupLatencies =
      systemTableCache.getAll(TABLES.INTER_GROUP_LATENCIES) || [];

    return {
      suggestedGroupId: joiningNode?.[COLUMN.LATENCY_GROUP_ID] || null,
      groupCount: groups.length,
      interGroupEdgeCount: interGroupLatencies.length,
      propagationMode,
      timestamp: Date.now(),
    };
  }
}

export {BootstrapTopologySnapshotOwner};
