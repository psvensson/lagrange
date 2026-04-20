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
import {
  isPriorityControlPlanePartition,
} from '../system-partition-classification.js';
import {
  resolveCanonicalLeaderIdentitySnapshot,
} from '../../query/canonical-leader-routing.js';

const BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SOURCE = Object.freeze({
  CACHE: 'cache',
  AUTHORITATIVE_LOCAL_PARTITION: 'authoritative_local_partition',
});

const BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_STABILIZATION_STATE = Object.freeze({
  AUTHORITATIVE: 'authoritative',
  RETAINED_CACHE_OWNER: 'retained_cache_owner',
  AUTHORITATIVE_OWNER_MISSING: 'authoritative_owner_missing',
});

const BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SELECTION_REASON = Object.freeze({
  NO_LOCAL_ROWSETS: 'no_local_rowsets',
  EMPTY_LOCAL_AUTHORITATIVE_ROWS: 'empty_local_authoritative_rows',
  AUTHORITATIVE_ROWS_AVAILABLE: 'authoritative_rows_available',
});

const BOOTSTRAP_TOPOLOGY_SNAPSHOT_LOG = Object.freeze({
  NO_PARTITION_LEADERS_FOUND_IN_SYSTEM_CACHE:
    'No partition leaders found in system cache',
  SNAPSHOT_DIVERGED_FROM_LOCAL_AUTHORITATIVE_PARTITION_STATE:
    'Bootstrap snapshot diverged from local authoritative partition state',
  AUTHORITATIVE_PARTITION_OWNER_MISSING_DURING_CONVERGENCE:
    'Bootstrap authoritative partition snapshot preserved missing leader ownership while local rows converge',
  RETAINED_CACHED_PARTITION_OWNER_DURING_CONVERGENCE:
    'Bootstrap authoritative partition snapshot retained cached leader ownership for a priority control-plane partition while local rows converge',
  EMPTY_LOCAL_AUTHORITATIVE_SNAPSHOT_RETAINING_CACHE:
    'Bootstrap authoritative snapshot was empty; retaining cached system-table rows',
  FAILED_TO_READ_AUTHORITATIVE_SNAPSHOT_ROWS_FROM_LOCAL_PARTITION:
    'Failed to read authoritative snapshot rows from local partition',
});

const BOOTSTRAP_TOPOLOGY_SNAPSHOT_PARTITION_FIELD = Object.freeze({
  LEADER_NODE_ID: COLUMN.LEADER_NODE_ID,
});

const BOOTSTRAP_TOPOLOGY_SNAPSHOT_PARTITION_STABILIZATION_PAYLOAD =
  Object.freeze({
    PARTITION_COUNT: 'partitionCount',
    PARTITION_IDS: 'partitionIds',
  });

const BOOTSTRAP_TOPOLOGY_SNAPSHOT_PARTITION_STABILIZATION_MAX_IDS = NUM.FIVE;
const BOOTSTRAP_TOPOLOGY_SNAPSHOT_CACHE = Object.freeze({
  AUTHORITATIVE_SNAPSHOT_TTL_MS: 250,
  WARNING_THROTTLE_MS: 5000,
});
const BOOTSTRAP_TOPOLOGY_SNAPSHOT_WARNING_KEY = Object.freeze({
  NO_PARTITION_LEADERS_FOUND_IN_SYSTEM_CACHE:
    'no_partition_leaders_found_in_system_cache',
  EMPTY_LOCAL_AUTHORITATIVE_SNAPSHOT_RETAINING_CACHE:
    'empty_local_authoritative_snapshot_retaining_cache',
  SNAPSHOT_DIVERGED_FROM_LOCAL_AUTHORITATIVE_PARTITION_STATE:
    'snapshot_diverged_from_local_authoritative_partition_state',
  AUTHORITATIVE_PARTITION_OWNER_MISSING_DURING_CONVERGENCE:
    'authoritative_partition_owner_missing_during_convergence',
  RETAINED_CACHED_PARTITION_OWNER_DURING_CONVERGENCE:
    'retained_cached_partition_owner_during_convergence',
  FAILED_TO_READ_AUTHORITATIVE_SNAPSHOT_ROWS_FROM_LOCAL_PARTITION:
    'failed_to_read_authoritative_snapshot_rows_from_local_partition',
});

function normalizeBootstrapTopologySnapshotRowKey(value) {
  if (typeof value === TYPEOF.UNDEFINED || value === null) {
    return null;
  }
  const normalizedValue = String(value).trim();
  return normalizedValue.length > NUM.ZERO ? normalizedValue : null;
}

function readBootstrapTopologySnapshotRowKey(tableName, row) {
  const keyField = getSystemCachePrimaryKeyFieldOrFallback(tableName, 'id');
  return normalizeBootstrapTopologySnapshotRowKey(row?.[keyField] ?? row?.id);
}

function readBootstrapTopologySnapshotPartitionLeaderNodeId(row) {
  return normalizeBootstrapTopologySnapshotRowKey(
    row?.[BOOTSTRAP_TOPOLOGY_SNAPSHOT_PARTITION_FIELD.LEADER_NODE_ID] ??
      row?.leaderNodeId,
  );
}

function readBootstrapTopologySnapshotPartitionId(row) {
  return normalizeBootstrapTopologySnapshotRowKey(
    row?.[COLUMN.PARTITION_ID] ??
      row?.partition_id ??
      row?.partitionId,
  );
}

function readBootstrapTopologySnapshotServicePartitionId(row) {
  return normalizeBootstrapTopologySnapshotRowKey(
    row?.[COLUMN.PARTITION_ID] ??
      row?.partition_id ??
      row?.partitionId,
  );
}

function readBootstrapTopologySnapshotServiceNodeId(row) {
  return normalizeBootstrapTopologySnapshotRowKey(
    row?.[COLUMN.NODE_ID] ??
      row?.node_id ??
      row?.nodeId,
  );
}

function readBootstrapTopologySnapshotServiceType(row) {
  const serviceType =
    row?.[COLUMN.SERVICE_TYPE] ??
    row?.service_type ??
    row?.serviceType ??
    null;
  return typeof serviceType === TYPEOF.STRING &&
    serviceType.length > NUM.ZERO ?
    serviceType :
    null;
}

function readBootstrapTopologySnapshotServiceStatus(row) {
  const status =
    row?.[COLUMN.STATUS] ??
    row?.status ??
    null;
  return typeof status === TYPEOF.STRING &&
    status.length > NUM.ZERO ?
    status :
    null;
}

function readBootstrapTopologySnapshotServiceRaftRole(row) {
  const raftRole =
    row?.[COLUMN.RAFT_ROLE] ??
    row?.raft_role ??
    row?.raftRole ??
    null;
  return typeof raftRole === TYPEOF.STRING &&
    raftRole.length > NUM.ZERO ?
    raftRole.toLowerCase() :
    null;
}

function resolveAuthoritativeSystemTableRowSourceSelection(options = {}) {
  const cacheRows = Array.isArray(options.cacheRows) ? options.cacheRows : [];
  const localRowSets = Array.isArray(options.localRowSets) ?
    options.localRowSets :
    [];
  const mergedRows = Array.isArray(options.mergedRows) ? options.mergedRows : [];

  if (localRowSets.length === NUM.ZERO) {
    return Object.freeze({
      source: BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SOURCE.CACHE,
      reason:
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SELECTION_REASON.NO_LOCAL_ROWSETS,
      rows: cacheRows,
    });
  }

  if (mergedRows.length === NUM.ZERO && cacheRows.length > NUM.ZERO) {
    return Object.freeze({
      source: BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SOURCE.CACHE,
      reason:
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SELECTION_REASON
          .EMPTY_LOCAL_AUTHORITATIVE_ROWS,
      rows: cacheRows,
    });
  }

  return Object.freeze({
    source:
      BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SOURCE.AUTHORITATIVE_LOCAL_PARTITION,
    reason:
      BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SELECTION_REASON
        .AUTHORITATIVE_ROWS_AVAILABLE,
    rows: mergedRows,
  });
}

function resolveBootstrapTopologySnapshotPositiveInteger(
  value,
  fallbackValue,
) {
  if (!Number.isFinite(value)) {
    return fallbackValue;
  }
  const normalizedValue = Math.floor(value);
  if (normalizedValue <= NUM.ZERO) {
    return fallbackValue;
  }
  return normalizedValue;
}

/**
 * Canonical authority owner for bootstrap topology views.
 *
 * View contract:
 * 1. raw observed rows: last local convergence input from `systemTableCache`
 * 2. published authority rows: current stabilized answer for production use
 * 3. retained authority rows: last published stable answer kept for bounded
 *    owner-internal stabilization
 *
 * Consumer contract:
 * 1. production routing, readiness, and bootstrap admission must use the
 *    published authority view or canonical helpers built on top of it
 * 2. diagnostics may compare published authority against raw observed rows
 * 3. retained rows are not a second public cache; new production consumers
 *    must not branch on them directly
 */
class BootstrapTopologySnapshotOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
    this.nowFn = typeof options.nowFn === TYPEOF.FUNCTION ?
      options.nowFn :
      Date.now;
    this.authoritativeSnapshotCacheTtlMs =
      resolveBootstrapTopologySnapshotPositiveInteger(
        options.authoritativeSnapshotCacheTtlMs,
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_CACHE.AUTHORITATIVE_SNAPSHOT_TTL_MS,
      );
    this.warningThrottleMs =
      resolveBootstrapTopologySnapshotPositiveInteger(
        options.warningThrottleMs,
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_CACHE.WARNING_THROTTLE_MS,
      );
    this.authoritativeSnapshotCacheByTableName = new Map();
    this.warningLedgerByKey = new Map();
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

  getNowMs() {
    return this.nowFn();
  }

  resolveBootstrapTopologySnapshotWarningLedgerKey(
    warningKey,
    payload = {},
  ) {
    const tableName = typeof payload?.tableName === TYPEOF.STRING ?
      payload.tableName :
      '';
    const partitionId = typeof payload?.partitionId === TYPEOF.STRING ?
      payload.partitionId :
      '';
    const partitionIds = Array.isArray(payload?.partitionIds) ?
      payload.partitionIds
        .filter((value) => typeof value === TYPEOF.STRING && value.length > 0)
        .join('|') :
      '';
    return [
      String(warningKey || ''),
      tableName,
      partitionId,
      partitionIds,
    ].join(':');
  }

  warnBootstrapTopologySnapshot(warningKey, message, payload = {}) {
    const ledgerKey = this.resolveBootstrapTopologySnapshotWarningLedgerKey(
      warningKey,
      payload,
    );
    const nowMs = this.getNowMs();
    if (this.warningLedgerByKey.has(ledgerKey)) {
      const previousWarnedAtMs = this.warningLedgerByKey.get(ledgerKey);
      if (nowMs - previousWarnedAtMs < this.warningThrottleMs) {
        return;
      }
    }
    this.warningLedgerByKey.set(ledgerKey, nowMs);
    this.getLogger().warn(message, payload);
  }

  /**
   * Read the current published authority snapshot for one system table.
   * Routing, readiness, and critical recovery consumers must use this view or
   * the higher-level canonical leader helpers built on top of it.
   * @param {string} tableName
   * @return {Object[]|null}
   */
  readPublishedAuthoritativeSystemTableSnapshotRows(tableName) {
    const publishedEntry =
      this.readPublishedAuthoritativeSystemTableSnapshotEntry(tableName);
    return publishedEntry?.rows || null;
  }

  /**
   * Compatibility wrapper for older call sites. This returns the published
   * authority view, not raw system-cache rows. The name is misleading and is
   * retained only for backward compatibility.
   * @deprecated Use readPublishedAuthoritativeSystemTableSnapshotRows.
   * @param {string} tableName
   * @return {Object[]|null}
   */
  readObservedAuthoritativeSystemTableSnapshotRows(tableName) {
    return this.readPublishedAuthoritativeSystemTableSnapshotRows(tableName);
  }

  /**
   * Compatibility wrapper for older call sites. This returns the published
   * authority view, not raw system-cache rows. The name is misleading and is
   * retained only for backward compatibility.
   * @deprecated Use readPublishedAuthoritativeSystemTableSnapshotRows.
   * @param {string} tableName
   * @return {Object[]|null}
   */
  readCachedAuthoritativeSystemTableSnapshotRows(tableName) {
    return this.readPublishedAuthoritativeSystemTableSnapshotRows(tableName);
  }

  /**
   * Read the last published authority snapshot even after the active view TTL
   * expires. This view exists for owner-internal stabilization and bounded
   * diagnostics; external production consumers should not branch on it
   * directly.
   * @param {string} tableName
   * @return {Object[]|null}
   */
  readRetainedAuthoritativeSystemTableSnapshotRows(tableName) {
    if (typeof tableName !== TYPEOF.STRING || tableName.length === NUM.ZERO) {
      return null;
    }
    const cachedEntry =
      this.authoritativeSnapshotCacheByTableName.get(tableName) || null;
    if (Array.isArray(cachedEntry?.retainedRows)) {
      return cachedEntry.retainedRows;
    }
    return Array.isArray(cachedEntry?.rows) ? cachedEntry.rows : null;
  }

  /**
   * Read the current published authority entry for one system table.
   * @param {string} tableName
   * @return {Object|null}
   */
  readPublishedAuthoritativeSystemTableSnapshotEntry(tableName) {
    if (typeof tableName !== TYPEOF.STRING || tableName.length === NUM.ZERO) {
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
  }

  /**
   * Compatibility wrapper for older call sites. This returns the current
   * published authority entry.
   * @deprecated Use readPublishedAuthoritativeSystemTableSnapshotEntry.
   * @param {string} tableName
   * @return {Object|null}
   */
  readObservedAuthoritativeSystemTableSnapshotEntry(tableName) {
    return this.readPublishedAuthoritativeSystemTableSnapshotEntry(tableName);
  }

  /**
   * Compatibility wrapper for older call sites. This returns the current
   * published authority entry.
   * @deprecated Use readPublishedAuthoritativeSystemTableSnapshotEntry.
   * @param {string} tableName
   * @return {Object|null}
   */
  readCachedAuthoritativeSystemTableSnapshotEntry(tableName) {
    return this.readPublishedAuthoritativeSystemTableSnapshotEntry(tableName);
  }

  /**
   * Read the latest raw observed rows captured during the last authority
   * publish cycle. Diagnostics may inspect this view to explain regressions,
   * but canonical production decisions must not use it directly.
   * @param {string} tableName
   * @return {Object[]|null}
   */
  readLatestObservedAuthoritativeSystemTableSnapshotRows(tableName) {
    const publishedEntry =
      this.readPublishedAuthoritativeSystemTableSnapshotEntry(tableName);
    if (!publishedEntry) {
      return null;
    }
    return Array.isArray(publishedEntry.rawRows) ? publishedEntry.rawRows :
      publishedEntry.rows;
  }

  /**
   * Compatibility wrapper for older call sites. This returns the latest raw
   * observed rows from the last publish cycle.
   * @deprecated Use readLatestObservedAuthoritativeSystemTableSnapshotRows.
   * @param {string} tableName
   * @return {Object[]|null}
   */
  readObservedRawAuthoritativeSystemTableSnapshotRows(tableName) {
    return this.readLatestObservedAuthoritativeSystemTableSnapshotRows(
      tableName,
    );
  }

  /**
   * Compatibility wrapper for older call sites. This returns the latest raw
   * observed rows from the last publish cycle.
   * @deprecated Use readLatestObservedAuthoritativeSystemTableSnapshotRows.
   * @param {string} tableName
   * @return {Object[]|null}
   */
  readCachedRawAuthoritativeSystemTableSnapshotRows(tableName) {
    return this.readLatestObservedAuthoritativeSystemTableSnapshotRows(
      tableName,
    );
  }

  cacheAuthoritativeSystemTableSnapshotRows(tableName, rows = [], options = {}) {
    if (typeof tableName !== TYPEOF.STRING || tableName.length === NUM.ZERO) {
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
  }

  invalidateAuthoritativeSystemTableSnapshotRows(tableName = null) {
    if (typeof tableName === TYPEOF.STRING && tableName.length > NUM.ZERO) {
      this.authoritativeSnapshotCacheByTableName.delete(tableName);
      return;
    }
    this.authoritativeSnapshotCacheByTableName.clear();
  }

  /**
   * Read the published bootstrap authority snapshot for one system table.
   * Consumers that need one canonical topology answer must use this view
   * instead of raw system-cache rows.
   * @param {string} tableName
   * @return {Object[]}
   */
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
  }

  /**
   * Compatibility wrapper for existing callers.
   * @deprecated Use getPublishedBootstrapAuthoritativeTableRows.
   * @param {string} tableName
   * @return {Object[]}
   */
  getBootstrapAuthoritativeTableRows(tableName) {
    return this.getPublishedBootstrapAuthoritativeTableRows(tableName);
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

  /**
   * Read one published partition row from the bootstrap authority snapshot.
   * Routing and readiness consumers must use this view for canonical owner
   * state.
   * @param {string} partitionId
   * @return {Object|null}
   */
  getPublishedBootstrapPartitionSnapshotRow(partitionId) {
    if (typeof partitionId !== TYPEOF.STRING ||
        partitionId.length === NUM.ZERO) {
      return null;
    }
    const partitionRows =
      this.getPublishedBootstrapAuthoritativeTableRows(TABLES.PARTITIONS);
    return partitionRows.find((row) => {
      return row?.[COLUMN.PARTITION_ID] === partitionId ||
        row?.partition_id === partitionId ||
        row?.partitionId === partitionId;
    }) || null;
  }

  /**
   * Compatibility wrapper for existing callers.
   * This returns the published authority row, not a raw cache row.
   * @deprecated Use getPublishedBootstrapPartitionSnapshotRow.
   * @param {string} partitionId
   * @return {Object|null}
   */
  getBootstrapPartitionSnapshotRow(partitionId) {
    return this.getPublishedBootstrapPartitionSnapshotRow(partitionId);
  }

  /**
   * Read one raw observed partition row from the last publish cycle.
   * Diagnostics may inspect this view, but canonical production consumers
   * must not use it as authority.
   * @param {string} partitionId
   * @return {Object|null}
   */
  getLatestObservedBootstrapPartitionSnapshotRow(partitionId) {
    if (typeof partitionId !== TYPEOF.STRING ||
        partitionId.length === NUM.ZERO) {
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
  }

  /**
   * Compatibility wrapper for existing callers.
   * @deprecated Use getLatestObservedBootstrapPartitionSnapshotRow.
   * @param {string} partitionId
   * @return {Object|null}
   */
  getBootstrapRawAuthoritativePartitionSnapshotRow(partitionId) {
    return this.getLatestObservedBootstrapPartitionSnapshotRow(partitionId);
  }

  getCachedPartitionRow(partitionId) {
    if (typeof partitionId !== TYPEOF.STRING ||
        partitionId.length === NUM.ZERO) {
      return null;
    }
    const systemTableCache = this.getSystemTableCache();
    if (typeof systemTableCache?.get === TYPEOF.FUNCTION) {
      const row = systemTableCache.get(TABLES.PARTITIONS, partitionId);
      if (row) {
        return row;
      }
    }
    if (typeof systemTableCache?.filter !== TYPEOF.FUNCTION) {
      return null;
    }
    return (
      systemTableCache.filter(TABLES.PARTITIONS, (row) => {
        return row?.[COLUMN.PARTITION_ID] === partitionId ||
          row?.partition_id === partitionId ||
          row?.partitionId === partitionId;
      }) || []
    )[NUM.ZERO] || null;
  }

  /**
   * Read one retained published partition row. This view is for owner-internal
   * stabilization and bounded diagnostics, not direct production branching.
   * @param {string} partitionId
   * @return {Object|null}
   */
  getRetainedBootstrapPartitionSnapshotRow(partitionId) {
    if (typeof partitionId !== TYPEOF.STRING ||
        partitionId.length === NUM.ZERO) {
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
  }

  /**
   * Compatibility wrapper for existing callers.
   * This returns the retained owner-internal row, not a second public
   * authority contract.
   * @deprecated Use getRetainedBootstrapPartitionSnapshotRow.
   * @param {string} partitionId
   * @return {Object|null}
   */
  getRetainedAuthoritativePartitionSnapshotRow(partitionId) {
    return this.getRetainedBootstrapPartitionSnapshotRow(partitionId);
  }

  /**
   * Resolve one canonical partition-leader identity by combining the three
   * authority views explicitly:
   * 1. latest observed raw row for current convergence evidence
   * 2. published authority row for the current canonical answer
   * 3. retained published row for bounded stabilization when observed input
   *    regresses
   * @param {string} partitionId
   * @param {Object[]} [serviceRows=[]]
   * @return {Object}
   */
  resolveCanonicalPartitionLeaderIdentity(partitionId, serviceRows = []) {
    const rawAuthoritativeRow =
      this.getLatestObservedBootstrapPartitionSnapshotRow(partitionId);
    const publishedAuthoritativeRow =
      this.getPublishedBootstrapPartitionSnapshotRow(partitionId);
    const authoritativeRow =
      publishedAuthoritativeRow ||
      rawAuthoritativeRow;
    const cacheRow = this.resolvePartitionOwnerStabilizationCacheRow({
      cacheRow: this.getCachedPartitionRow(partitionId),
      retainedSnapshotRow:
        this.getRetainedBootstrapPartitionSnapshotRow(partitionId),
    });
    const resolvedServiceRows =
      Array.isArray(serviceRows) && serviceRows.length > NUM.ZERO ?
        serviceRows :
        this.getPublishedBootstrapAuthoritativeTableRows(TABLES.SERVICES)
          .filter((serviceRow) => {
            return readBootstrapTopologySnapshotServicePartitionId(serviceRow) ===
              partitionId;
          });
    const stabilization =
      this.resolvePartitionOwnerFieldStabilization({
        authoritativeRow,
        cacheRow,
        serviceRows: resolvedServiceRows,
      });
    const stabilizedLeaderNodeId =
      readBootstrapTopologySnapshotPartitionLeaderNodeId(
        stabilization.row,
      );
    const identity = resolveCanonicalLeaderIdentitySnapshot({
      partition: authoritativeRow || rawAuthoritativeRow,
      partitionPresent:
        authoritativeRow !== null || cacheRow !== null,
      ownerLeaderNodeId:
        stabilization.state ===
          BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_STABILIZATION_STATE.AUTHORITATIVE ?
          stabilizedLeaderNodeId :
          null,
      retainedLeaderNodeId:
        stabilization.state ===
          BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_STABILIZATION_STATE
            .RETAINED_CACHE_OWNER ?
          stabilizedLeaderNodeId :
          null,
      serviceRows: resolvedServiceRows,
    });
    return Object.freeze({
      ...identity,
      bootstrapLeaderStabilizationState: stabilization.state,
    });
  }

  resolveCanonicalPartitionLeaderNodeId(partitionId) {
    return this.resolveCanonicalPartitionLeaderIdentity(
      partitionId,
    ).leaderNodeId;
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
        this.getPublishedBootstrapPartitionSnapshotRow(partitionOrId);
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
      this.getPublishedBootstrapPartitionSnapshotRow(partitionId);
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
  }

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
    const rowSourceSelection = resolveAuthoritativeSystemTableRowSourceSelection(
      {
        cacheRows: observedSystemCacheRows,
        localRowSets,
        mergedRows: stabilizedRows,
      },
    );
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
      publishedRows = this.resolvePublishedAuthoritativeSystemTableSnapshotRows(
        {
          tableName,
          observedRows: rowSourceSelection.rows,
          retainedSnapshotRows,
        },
      );
      observedRawRows = rowSourceSelection.rows;
    }

    if (
      rowSourceSelection.source ===
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SOURCE
          .AUTHORITATIVE_LOCAL_PARTITION &&
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
  }

  stabilizeAuthoritativeSystemTableSnapshotRows(options = {}) {
    const tableName = options.tableName;
    const cacheRows = Array.isArray(options.cacheRows) ? options.cacheRows : [];
    const mergedRows = Array.isArray(options.mergedRows) ? options.mergedRows : [];
    const retainedSnapshotRows = Array.isArray(options.retainedSnapshotRows) ?
      options.retainedSnapshotRows :
      [];
    if (tableName !== TABLES.PARTITIONS || mergedRows.length === NUM.ZERO) {
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
        retainedSnapshotRowByKey.set(
          retainedSnapshotKey,
          retainedSnapshotRow,
        );
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

    if (retainedCacheOwnerPartitionIds.length > NUM.ZERO) {
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
              NUM.ZERO,
              BOOTSTRAP_TOPOLOGY_SNAPSHOT_PARTITION_STABILIZATION_MAX_IDS,
          ),
        },
      );
    }

    if (stabilizedPartitionIds.length > NUM.ZERO) {
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
              NUM.ZERO,
              BOOTSTRAP_TOPOLOGY_SNAPSHOT_PARTITION_STABILIZATION_MAX_IDS,
          ),
        },
      );
    }

    return stabilizedRows;
  }

  resolvePartitionOwnerStabilizationCacheRow(options = {}) {
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

  resolvePartitionOwnerFieldStabilization(options = {}) {
    const authoritativeRow = options.authoritativeRow || null;
    const cacheRow = options.cacheRow || null;
    const serviceRows = Array.isArray(options.serviceRows) ? options.serviceRows : [];
    const authoritativeLeaderNodeId =
      readBootstrapTopologySnapshotPartitionLeaderNodeId(authoritativeRow);
    const cacheLeaderNodeId =
      readBootstrapTopologySnapshotPartitionLeaderNodeId(cacheRow);

    if (!authoritativeRow) {
      if (cacheLeaderNodeId !== null &&
          this.shouldRetainCachedPartitionOwner({
            authoritativeRow: cacheRow,
            cacheLeaderNodeId,
            serviceRows,
          })) {
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

    if (authoritativeLeaderNodeId !== null ||
        cacheLeaderNodeId === null) {
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
  }

  shouldRetainCachedPartitionOwner(options = {}) {
    const authoritativeRow = options.authoritativeRow || null;
    const cacheLeaderNodeId = options.cacheLeaderNodeId || null;
    const serviceRows = Array.isArray(options.serviceRows) ? options.serviceRows : [];
    const partitionId = readBootstrapTopologySnapshotPartitionId(authoritativeRow);
    if (!partitionId ||
        !cacheLeaderNodeId ||
        !isPriorityControlPlanePartition({
          partitionId,
          partitionRow: authoritativeRow,
        })) {
      return false;
    }
    return this.hasActivePartitionServiceOnNode(
      partitionId,
      cacheLeaderNodeId,
      serviceRows,
      authoritativeRow,
    );
  }

  resolveRetainablePartitionLeaderServices(partitionRow, services = []) {
    const explicitLeaderServices = services.filter((serviceRow) => {
      return readBootstrapTopologySnapshotServiceRaftRole(serviceRow) ===
        String(RAFT_ROLE.LEADER).toLowerCase();
    });
    if (explicitLeaderServices.length === NUM.ONE) {
      return explicitLeaderServices;
    }
    if (!this.isBootstrapRoutingGraceWindow(partitionRow)) {
      return [];
    }
    return services.length === NUM.ONE ? [services[NUM.ZERO]] : [];
  }

  hasActivePartitionServiceOnNode(
    partitionId,
    nodeId,
    serviceRows = [],
    partitionRow = null,
  ) {
    if (typeof partitionId !== TYPEOF.STRING ||
        partitionId.length === NUM.ZERO ||
        typeof nodeId !== TYPEOF.STRING ||
        nodeId.length === NUM.ZERO) {
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
