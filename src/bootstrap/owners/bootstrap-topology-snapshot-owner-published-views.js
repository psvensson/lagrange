import {ConfigurationManager} from '../../config/configuration-manager.js';
import {CONFIG_KEY} from '../../config/config-constants.js';
import {assertCritical} from '../../utils/assert.js';
import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../constants/index.js';
import {RAFT_ROLE} from '../../raft/constants.js';
import {
  buildBootstrapTopologySnapshotEnvelope as buildBootstrapTopologySnapshotEnvelopeValue,
} from '../bootstrap-topology-snapshot.js';
import {
  BOOTSTRAP_API_ERROR,
} from '../bootstrap-api-constants.js';
import {
  BOOTSTRAP_TOPOLOGY_SNAPSHOT_LOG,
  BOOTSTRAP_TOPOLOGY_SNAPSHOT_WARNING_KEY,
} from './bootstrap-topology-snapshot-owner-contract.js';

const bootstrapTopologySnapshotOwnerPublishedViewsMethods = {
  readPublishedAuthoritativeSystemTableSnapshotRows(tableName) {
    const publishedEntry =
      this.readPublishedAuthoritativeSystemTableSnapshotEntry(tableName);
    return publishedEntry?.rows || null;
  },
  readObservedAuthoritativeSystemTableSnapshotRows(tableName) {
    return this.readPublishedAuthoritativeSystemTableSnapshotRows(tableName);
  },
  readCachedAuthoritativeSystemTableSnapshotRows(tableName) {
    return this.readPublishedAuthoritativeSystemTableSnapshotRows(tableName);
  },
  readRetainedAuthoritativeSystemTableSnapshotRows(tableName) {
    if (typeof tableName !== 'string' || tableName.length === 0) {
      return null;
    }
    const cachedEntry =
      this.authoritativeSnapshotCacheByTableName.get(tableName) || null;
    if (Array.isArray(cachedEntry?.retainedRows)) {
      return cachedEntry.retainedRows;
    }
    return Array.isArray(cachedEntry?.rows) ? cachedEntry.rows : null;
  },
  readPublishedAuthoritativeSystemTableSnapshotEntry(tableName) {
    if (typeof tableName !== 'string' || tableName.length === 0) {
      return null;
    }
    const publishedEntry =
      this.authoritativeSnapshotCacheByTableName.get(tableName) || null;
    if (!publishedEntry) {
      return null;
    }
    if (publishedEntry.expiresAtMs <= this.getNowMs()) {
      return null;
    }
    return publishedEntry;
  },
  readObservedAuthoritativeSystemTableSnapshotEntry(tableName) {
    return this.readPublishedAuthoritativeSystemTableSnapshotEntry(tableName);
  },
  readCachedAuthoritativeSystemTableSnapshotEntry(tableName) {
    return this.readPublishedAuthoritativeSystemTableSnapshotEntry(tableName);
  },
  readLatestObservedAuthoritativeSystemTableSnapshotRows(tableName) {
    const publishedEntry =
      this.readPublishedAuthoritativeSystemTableSnapshotEntry(tableName);
    if (!publishedEntry) {
      return null;
    }
    return Array.isArray(publishedEntry.rawRows) ? publishedEntry.rawRows :
      publishedEntry.rows;
  },
  readObservedRawAuthoritativeSystemTableSnapshotRows(tableName) {
    return this.readLatestObservedAuthoritativeSystemTableSnapshotRows(
      tableName,
    );
  },
  readCachedRawAuthoritativeSystemTableSnapshotRows(tableName) {
    return this.readLatestObservedAuthoritativeSystemTableSnapshotRows(
      tableName,
    );
  },
  cacheAuthoritativeSystemTableSnapshotRows(
    tableName,
    rows = [],
    options = {},
  ) {
    if (typeof tableName !== 'string' || tableName.length === 0) {
      return rows;
    }
    const cachedEntry =
      this.authoritativeSnapshotCacheByTableName.get(tableName) || null;
    const retainedSnapshotRows =
      Array.isArray(cachedEntry?.retainedRows) ?
        cachedEntry.retainedRows :
        (
          Array.isArray(cachedEntry?.rows) ?
            cachedEntry.rows :
            []
        );
    const publishedRows = this.stabilizeAuthoritativeSystemTableSnapshotRows({
      tableName,
      cacheRows: rows,
      mergedRows: rows,
      retainedSnapshotRows,
    });
    this.authoritativeSnapshotCacheByTableName.set(tableName, {
      rows: publishedRows,
      retainedRows: publishedRows,
      rawRows: Array.isArray(options.rawRows) ? options.rawRows : rows,
      expiresAtMs: this.getNowMs() + this.authoritativeSnapshotCacheTtlMs,
    });
    return publishedRows;
  },
  invalidateAuthoritativeSystemTableSnapshotRows(tableName = null) {
    if (typeof tableName === 'string' && tableName.length > 0) {
      this.authoritativeSnapshotCacheByTableName.delete(tableName);
      return;
    }
    this.authoritativeSnapshotCacheByTableName.clear();
  },
  getPublishedBootstrapAuthoritativeTableRows(tableName) {
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
  },
  getBootstrapAuthoritativeTableRows(tableName) {
    return this.getPublishedBootstrapAuthoritativeTableRows(tableName);
  },
  buildSystemTableSnapshots() {
    return this.buildBootstrapTopologySnapshotEnvelope()
      .systemTableSnapshots;
  },
  resolveBootstrapResponseTopologySnapshotRows(
    tableName,
    observedSystemCacheRows = [],
  ) {
    const observedPublishedRows =
      this.readPublishedAuthoritativeSystemTableSnapshotRows(tableName);
    if (Array.isArray(observedPublishedRows)) {
      return observedPublishedRows;
    }
    const retainedSnapshotRows =
      this.readRetainedAuthoritativeSystemTableSnapshotRows(tableName);
    return this.resolvePublishedAuthoritativeSystemTableSnapshotRows({
      tableName,
      observedRows: observedSystemCacheRows,
      retainedSnapshotRows,
    });
  },
  buildBootstrapResponseTopologySnapshotEnvelope(options = {}) {
    const currentEpoch =
      options.currentEpoch === undefined ?
        this.getCurrentEpoch() :
        options.currentEpoch;
    return buildBootstrapTopologySnapshotEnvelopeValue({
      systemTableCache: assertCritical(
        this.getSystemTableCache(),
        BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
      ),
      currentEpoch,
      resolveSnapshotRows: (tableName, cacheRows) =>
        this.resolveBootstrapResponseTopologySnapshotRows(
          tableName,
          cacheRows,
        ),
    });
  },
  buildBootstrapTopologySnapshotEnvelope(options = {}) {
    const currentEpoch =
      options.currentEpoch === undefined ?
        this.getCurrentEpoch() :
        options.currentEpoch;
    const envelope = buildBootstrapTopologySnapshotEnvelopeValue({
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

    if (leaders.length === 0) {
      this.warnBootstrapTopologySnapshot(
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_WARNING_KEY
          .NO_PARTITION_LEADERS_FOUND_IN_SYSTEM_CACHE,
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_LOG
          .NO_PARTITION_LEADERS_FOUND_IN_SYSTEM_CACHE,
        {
          seedNodeId: this.getSeedNodeId(),
          totalServices: serviceSnapshot.length,
        },
      );
    }

    return envelope;
  },
  resolveBootstrapTopologySnapshotMeta(topologySnapshotMeta = null) {
    if (topologySnapshotMeta && typeof topologySnapshotMeta === 'object') {
      return topologySnapshotMeta;
    }
    return this.buildBootstrapTopologySnapshotEnvelope().topologySnapshotMeta ||
      null;
  },
  resolveBootstrapTopologySnapshotActiveNodeIds(
    topologySnapshotMeta = null,
  ) {
    const resolvedMeta =
      this.resolveBootstrapTopologySnapshotMeta(topologySnapshotMeta);
    if (!Array.isArray(resolvedMeta?.activeNodeIds)) {
      return [];
    }
    return [...new Set(resolvedMeta.activeNodeIds.filter((nodeId) =>
      typeof nodeId === 'string' && nodeId.length > 0,
    ))];
  },
  resolveBootstrapTopologySnapshotEpoch(topologySnapshotMeta = null) {
    const resolvedMeta =
      this.resolveBootstrapTopologySnapshotMeta(topologySnapshotMeta);
    if (Number.isFinite(resolvedMeta?.topologyEpoch)) {
      return Math.max(0, Math.floor(resolvedMeta.topologyEpoch));
    }
    const currentEpoch = this.getCurrentEpoch();
    if (Number.isFinite(currentEpoch?.epoch)) {
      return Math.max(0, Math.floor(currentEpoch.epoch));
    }
    return null;
  },
  getPublishedBootstrapPartitionSnapshotRow(partitionId) {
    if (
      typeof partitionId !== 'string' ||
      partitionId.length === 0
    ) {
      return null;
    }
    const partitionRows =
      this.getPublishedBootstrapAuthoritativeTableRows(TABLES.PARTITIONS);
    return partitionRows.find((row) => {
      return row?.[COLUMN.PARTITION_ID] === partitionId ||
        row?.partition_id === partitionId ||
        row?.partitionId === partitionId;
    }) || null;
  },
  getBootstrapPartitionSnapshotRow(partitionId) {
    return this.getPublishedBootstrapPartitionSnapshotRow(partitionId);
  },
  getLatestObservedBootstrapPartitionSnapshotRow(partitionId) {
    if (
      typeof partitionId !== 'string' ||
      partitionId.length === 0
    ) {
      return null;
    }
    const cachedRawRows =
      this.readLatestObservedAuthoritativeSystemTableSnapshotRows(
        TABLES.PARTITIONS,
      );
    if (Array.isArray(cachedRawRows)) {
      return cachedRawRows.find((row) => {
        return row?.[COLUMN.PARTITION_ID] === partitionId ||
          row?.partition_id === partitionId ||
          row?.partitionId === partitionId;
      }) || null;
    }
    const systemTableCache = assertCritical(
      this.getSystemTableCache(),
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    this.resolveAuthoritativeSystemTableSnapshotRows(
      TABLES.PARTITIONS,
      systemTableCache.getAll(TABLES.PARTITIONS) || [],
    );
    return this.getLatestObservedBootstrapPartitionSnapshotRow(partitionId);
  },
  getBootstrapRawAuthoritativePartitionSnapshotRow(partitionId) {
    return this.getLatestObservedBootstrapPartitionSnapshotRow(partitionId);
  },
  getCachedPartitionRow(partitionId) {
    if (
      typeof partitionId !== 'string' ||
      partitionId.length === 0
    ) {
      return null;
    }
    const systemTableCache = this.getSystemTableCache();
    if (typeof systemTableCache?.get === 'function') {
      const row = systemTableCache.get(TABLES.PARTITIONS, partitionId);
      if (row) {
        return row;
      }
    }
    if (typeof systemTableCache?.filter !== 'function') {
      return null;
    }
    return (
      systemTableCache.filter(TABLES.PARTITIONS, (row) => {
        return row?.[COLUMN.PARTITION_ID] === partitionId ||
          row?.partition_id === partitionId ||
          row?.partitionId === partitionId;
      }) || []
    )[0] || null;
  },
  getRetainedBootstrapPartitionSnapshotRow(partitionId) {
    if (
      typeof partitionId !== 'string' ||
      partitionId.length === 0
    ) {
      return null;
    }
    const retainedRows =
      this.readRetainedAuthoritativeSystemTableSnapshotRows(TABLES.PARTITIONS);
    if (!Array.isArray(retainedRows)) {
      return null;
    }
    return retainedRows.find((row) => {
      return row?.[COLUMN.PARTITION_ID] === partitionId ||
        row?.partition_id === partitionId ||
        row?.partitionId === partitionId;
    }) || null;
  },
  getRetainedAuthoritativePartitionSnapshotRow(partitionId) {
    return this.getRetainedBootstrapPartitionSnapshotRow(partitionId);
  },
  getLatencyTopologyHints(nodeId) {
    const systemTableCache = assertCritical(
      this.getSystemTableCache(),
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const config = ConfigurationManager.getInstance();
    const propagationMode = config.get(CONFIG_KEY.LATENCY_PROPAGATION_MODE) ||
      null;
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
  },
};

const {
  readPublishedAuthoritativeSystemTableSnapshotRows,
  readObservedAuthoritativeSystemTableSnapshotRows,
  readCachedAuthoritativeSystemTableSnapshotRows,
  readRetainedAuthoritativeSystemTableSnapshotRows,
  readPublishedAuthoritativeSystemTableSnapshotEntry,
  readObservedAuthoritativeSystemTableSnapshotEntry,
  readCachedAuthoritativeSystemTableSnapshotEntry,
  readLatestObservedAuthoritativeSystemTableSnapshotRows,
  readObservedRawAuthoritativeSystemTableSnapshotRows,
  readCachedRawAuthoritativeSystemTableSnapshotRows,
  cacheAuthoritativeSystemTableSnapshotRows,
  invalidateAuthoritativeSystemTableSnapshotRows,
  getPublishedBootstrapAuthoritativeTableRows,
  getBootstrapAuthoritativeTableRows,
  buildSystemTableSnapshots,
  resolveBootstrapResponseTopologySnapshotRows,
  buildBootstrapResponseTopologySnapshotEnvelope,
  buildBootstrapTopologySnapshotEnvelope,
  resolveBootstrapTopologySnapshotMeta,
  resolveBootstrapTopologySnapshotActiveNodeIds,
  resolveBootstrapTopologySnapshotEpoch,
  getPublishedBootstrapPartitionSnapshotRow,
  getBootstrapPartitionSnapshotRow,
  getLatestObservedBootstrapPartitionSnapshotRow,
  getBootstrapRawAuthoritativePartitionSnapshotRow,
  getCachedPartitionRow,
  getRetainedBootstrapPartitionSnapshotRow,
  getRetainedAuthoritativePartitionSnapshotRow,
  getLatencyTopologyHints,
} = bootstrapTopologySnapshotOwnerPublishedViewsMethods;

export {
  buildBootstrapResponseTopologySnapshotEnvelope,
  buildBootstrapTopologySnapshotEnvelope,
  buildSystemTableSnapshots,
  cacheAuthoritativeSystemTableSnapshotRows,
  getBootstrapAuthoritativeTableRows,
  getBootstrapPartitionSnapshotRow,
  getBootstrapRawAuthoritativePartitionSnapshotRow,
  getCachedPartitionRow,
  getLatencyTopologyHints,
  getLatestObservedBootstrapPartitionSnapshotRow,
  getPublishedBootstrapAuthoritativeTableRows,
  getPublishedBootstrapPartitionSnapshotRow,
  getRetainedAuthoritativePartitionSnapshotRow,
  getRetainedBootstrapPartitionSnapshotRow,
  invalidateAuthoritativeSystemTableSnapshotRows,
  readCachedAuthoritativeSystemTableSnapshotEntry,
  readCachedAuthoritativeSystemTableSnapshotRows,
  readCachedRawAuthoritativeSystemTableSnapshotRows,
  readLatestObservedAuthoritativeSystemTableSnapshotRows,
  readObservedAuthoritativeSystemTableSnapshotEntry,
  readObservedAuthoritativeSystemTableSnapshotRows,
  readObservedRawAuthoritativeSystemTableSnapshotRows,
  readPublishedAuthoritativeSystemTableSnapshotEntry,
  readPublishedAuthoritativeSystemTableSnapshotRows,
  readRetainedAuthoritativeSystemTableSnapshotRows,
  resolveBootstrapResponseTopologySnapshotRows,
  resolveBootstrapTopologySnapshotActiveNodeIds,
  resolveBootstrapTopologySnapshotEpoch,
  resolveBootstrapTopologySnapshotMeta,
};
