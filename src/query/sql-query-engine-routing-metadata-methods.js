import {readReplicaLeaderRoute} from '../raft/replica-leadership-state.js';
import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {
  REPLICATION_TARGET_SOURCE,
  resolveDesiredReplicationFactor,
} from '../bootstrap/replication-target-authority.js';
import {
  classifySystemPartition,
} from '../bootstrap/system-partition-classification.js';
import {buildControlPlaneReadAuthority} from
  '../control-plane/control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../control-plane/control-plane-system-table-gateway-constants.js';
import {isPartitionCleanupServiceRow} from '../constants/service.js';
import {readStateField} from '../utils/state-field-read.js';
import {CACHE_CDC_OPERATIONS} from '../cache/cache-constants.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_AVAILABLE = 'available';
const LOCAL_STR_OBJECT = 'object';

const {
  COLUMN,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} = SQL_QUERY_ENGINE_SHARED;

const AUTHORITATIVE_ROUTING_OVERLAY_STATE = Object.freeze({
  AVAILABLE: 'available',
  AUTHORITATIVE_MISSING: 'authoritative_missing',
  MISSING: 'missing',
});

const AUTHORITATIVE_ROUTING_OVERLAY_READ_AUTHORITY = buildControlPlaneReadAuthority({
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
  replicaFallbackConsistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
});

const AUTHORITATIVE_ROUTING_OVERLAY_PARTITION_STATE = Object.freeze({
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
});

const AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE = Object.freeze({
  ELIGIBLE: 'eligible',
  MASKED: 'masked',
});

const AUTHORITATIVE_ROUTING_OVERLAY_SERVICE_COVERAGE_STATE = Object.freeze({
  COMPLETE: 'complete',
  INCOMPLETE: 'incomplete',
  UNKNOWN: 'unknown',
});

const PARTITION_VERSION_COL = 'partition_version';
const REPLICA_COUNT_COL = 'replica_count';
const PARTITION_COMPARE_FIELDS = Object.freeze([
  PARTITION_VERSION_COL, REPLICA_COUNT_COL, COLUMN.LEADER_NODE_ID, COLUMN.STATE,
]);
const SERVICE_COMPARE_FIELDS = Object.freeze([
  COLUMN.NODE_ID, COLUMN.STATUS, COLUMN.RAFT_ROLE, COLUMN.ADDRESS,
]);
const normalizeText = (v) => (typeof v === 'string' && v.length > 0 ? v : null);
const normalizeNumber = (v) =>
  v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const isRegressiveTs = (cand, ref) => cand !== null && ref !== null && cand < ref;
const isNewerTs = (cand, ref) => cand !== null && ref !== null && cand > ref;
const resolveOverlayServiceKey = (svc) => !svc || typeof svc !== 'object' ? null :
  normalizeText(svc[COLUMN.SERVICE_ID]) ?? normalizeText(svc[COLUMN.REPLICA_ID]) ??
  normalizeText(svc[COLUMN.ADDRESS]);
const snapshotPartitionBaseline = (row) => !row || typeof row !== 'object' ? null : Object.freeze({
  [PARTITION_VERSION_COL]: normalizeNumber(row[PARTITION_VERSION_COL]),
  [REPLICA_COUNT_COL]: normalizeNumber(row[REPLICA_COUNT_COL]),
  [COLUMN.LEADER_NODE_ID]: normalizeText(row[COLUMN.LEADER_NODE_ID]),
  [COLUMN.STATE]: normalizeText(row[COLUMN.STATE]),
  [COLUMN.UPDATED_AT]: normalizeNumber(row[COLUMN.UPDATED_AT]),
});
const snapshotServicesBaseline = (rows) => !Array.isArray(rows) ? Object.freeze({}) :
  Object.freeze(Object.fromEntries(rows.flatMap((row) => {
    const key = resolveOverlayServiceKey(row);
    return key === null ? [] : [[key, Object.freeze({
      [COLUMN.NODE_ID]: normalizeText(row[COLUMN.NODE_ID]),
      [COLUMN.STATUS]: readStateField(row[COLUMN.STATUS]),
      [COLUMN.RAFT_ROLE]: readStateField(row[COLUMN.RAFT_ROLE]),
      [COLUMN.ADDRESS]: normalizeText(row[COLUMN.ADDRESS]),
      [COLUMN.UPDATED_AT]: normalizeNumber(row[COLUMN.UPDATED_AT]),
    })]];
  })));
const isPartitionRegressive = (cand, ref) => Boolean(cand && ref) && (
  (cand[PARTITION_VERSION_COL] !== null && ref[PARTITION_VERSION_COL] !== null &&
    cand[PARTITION_VERSION_COL] < ref[PARTITION_VERSION_COL]) ||
  isRegressiveTs(cand[COLUMN.UPDATED_AT], ref[COLUMN.UPDATED_AT]));
const hasSnapshotChanged = (left, right, fields) => left !== right &&
  (!left || !right || fields.some((f) => left[f] !== right[f]) ||
    left[COLUMN.UPDATED_AT] !== right[COLUMN.UPDATED_AT]);
const haveServicesMapChanged = (leftMap, rightMap) => {
  const leftKeys = Object.keys(leftMap);
  return leftKeys.length !== Object.keys(rightMap).length || leftKeys.some((k) =>
    !Object.hasOwn(rightMap, k) ||
    hasSnapshotChanged(leftMap[k], rightMap[k], SERVICE_COMPARE_FIELDS));
};
const resolveOverlayRefTs = (overPart, overServices) =>
  Object.values(overServices).reduce((maxTs, svc) =>
    svc[COLUMN.UPDATED_AT] !== null && (maxTs === null || svc[COLUMN.UPDATED_AT] > maxTs) ?
      svc[COLUMN.UPDATED_AT] : maxTs, overPart ? overPart[COLUMN.UPDATED_AT] : null);
function hasPartitionAdvanced(basePart, currPart, overPart) {
  if (!currPart || !hasSnapshotChanged(basePart, currPart, PARTITION_COMPARE_FIELDS) ||
      isPartitionRegressive(currPart, basePart) || isPartitionRegressive(currPart, overPart)) {
    return false;
  }
  if (!overPart) return true;
  const cv = currPart[PARTITION_VERSION_COL];
  const ov = overPart[PARTITION_VERSION_COL];
  return (cv !== null && ov !== null && cv > ov) ||
    isNewerTs(currPart[COLUMN.UPDATED_AT], overPart[COLUMN.UPDATED_AT]) ||
    PARTITION_COMPARE_FIELDS.some((f) =>
      currPart[f] !== (basePart ? basePart[f] : null) && currPart[f] !== overPart[f]);
}

function isCurrentServiceEntryAdvanced(key, currSvc, baseServices, overServices, overRefTs) {
  const ts = currSvc[COLUMN.UPDATED_AT];
  if (Object.hasOwn(baseServices, key)) {
    const baseSvc = baseServices[key];
    if (!hasSnapshotChanged(baseSvc, currSvc, SERVICE_COMPARE_FIELDS) ||
        isRegressiveTs(ts, baseSvc[COLUMN.UPDATED_AT])) return false;
    if (!Object.hasOwn(overServices, key)) {
      return !isRegressiveTs(ts, overRefTs) && (overRefTs === null || isNewerTs(ts, overRefTs));
    }
    const overSvc = overServices[key];
    return !isRegressiveTs(ts, overSvc[COLUMN.UPDATED_AT]) &&
      (isNewerTs(ts, overSvc[COLUMN.UPDATED_AT]) ||
        SERVICE_COMPARE_FIELDS.some((f) => currSvc[f] !== baseSvc[f] && currSvc[f] !== overSvc[f]));
  }
  if (!Object.hasOwn(overServices, key)) return !isRegressiveTs(ts, overRefTs);
  const overSvc = overServices[key];
  return !isRegressiveTs(ts, overSvc[COLUMN.UPDATED_AT]) &&
    (isNewerTs(ts, overSvc[COLUMN.UPDATED_AT]) ||
      SERVICE_COMPARE_FIELDS.some((f) => overSvc[f] !== null && currSvc[f] !== overSvc[f]));
}
const haveServicesAdvanced = (baseServices, currServices, overServices, overRefTs) =>
  Object.entries(currServices).some(([key, currSvc]) =>
    isCurrentServiceEntryAdvanced(key, currSvc, baseServices, overServices, overRefTs)) ||
  Object.keys(overServices).some((k) =>
    Object.hasOwn(baseServices, k) && !Object.hasOwn(currServices, k));
function isCacheConvergedWithOverlay(entry, currPart, currServices, overPart, overServices) {
  const masksCache = entry.cacheServiceState !==
    AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE.ELIGIBLE;
  if (masksCache && Object.keys(currServices).some((k) => !Object.hasOwn(overServices, k))) {
    return false;
  }
  if (overPart && (!currPart || isPartitionRegressive(currPart, overPart) ||
      PARTITION_COMPARE_FIELDS.some((f) => overPart[f] !== null && currPart[f] !== overPart[f]))) {
    return false;
  }
  return Object.entries(overServices).every(([k, overSvc]) => Object.hasOwn(currServices, k) &&
    !isRegressiveTs(currServices[k][COLUMN.UPDATED_AT], overSvc[COLUMN.UPDATED_AT]) &&
    SERVICE_COMPARE_FIELDS.every((f) => overSvc[f] === null || currServices[k][f] === overSvc[f]));
}
const isAuthoritativeMissingSuperseded = (basePart, baseServices, currPart, currServices) =>
  (currPart !== null && hasSnapshotChanged(basePart, currPart, PARTITION_COMPARE_FIELDS) &&
    !isPartitionRegressive(currPart, basePart)) ||
  Object.entries(currServices).some(([k, currSvc]) => !Object.hasOwn(baseServices, k) ||
    (hasSnapshotChanged(baseServices[k], currSvc, SERVICE_COMPARE_FIELDS) &&
      !isRegressiveTs(currSvc[COLUMN.UPDATED_AT], baseServices[k][COLUMN.UPDATED_AT]))) ||
  (currPart === null && Object.keys(currServices).length === 0);

const hasUndeletedStaleServices = (baseServices, currServices, overServices, overRefTs) =>
  Object.entries(currServices).some(([id, currSvc]) =>
    !Object.hasOwn(overServices, id) &&
    (Object.hasOwn(baseServices, id) || !isNewerTs(currSvc[COLUMN.UPDATED_AT], overRefTs)) &&
    !isNewerTs(currSvc[COLUMN.UPDATED_AT], overRefTs));

const isAvailableOverlayOutdated = (entry, base, curr, partChanged, svcsChanged) => {
  const overPart = snapshotPartitionBaseline(entry.partition);
  const overServices = snapshotServicesBaseline(entry.services);
  const overRefTs = resolveOverlayRefTs(overPart, overServices);
  const masksCache = entry.cacheServiceState !==
    AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE.ELIGIBLE;
  if (masksCache && hasUndeletedStaleServices(base.svcs, curr.svcs, overServices, overRefTs)) {
    return false;
  }
  return (partChanged && hasPartitionAdvanced(base.part, curr.part, overPart)) ||
    (svcsChanged && haveServicesAdvanced(base.svcs, curr.svcs, overServices, overRefTs)) ||
    isCacheConvergedWithOverlay(entry, curr.part, curr.svcs, overPart, overServices);
};
function isAuthoritativeOverlayOutdated(entry, currPartitionRow, currServiceRows) {
  const baseline = entry?.capturedCacheBaseline;
  if (!baseline || typeof baseline !== 'object') return false;
  const base = {part: baseline.partition ?? null, svcs: baseline.services ?? {}};
  const curr = {part: snapshotPartitionBaseline(currPartitionRow),
    svcs: snapshotServicesBaseline(currServiceRows)};
  const partChanged = hasSnapshotChanged(base.part, curr.part, PARTITION_COMPARE_FIELDS);
  const svcsChanged = haveServicesMapChanged(base.svcs, curr.svcs);
  if (!partChanged && !svcsChanged) return false;
  if (curr.part === null && Object.keys(curr.svcs).length === 0 && base.part !== null) {
    return true;
  }
  return entry.state === AUTHORITATIVE_ROUTING_OVERLAY_STATE.AUTHORITATIVE_MISSING ?
    isAuthoritativeMissingSuperseded(base.part, base.svcs, curr.part, curr.svcs) :
    isAvailableOverlayOutdated(entry, base, curr, partChanged, svcsChanged);
}

const updateOverlayServiceRow = (overSvc, currServiceRows) => {
  const key = resolveOverlayServiceKey(overSvc);
  if (key === null) return {service: overSvc, updated: false};
  const currSvc = currServiceRows.find((row) => resolveOverlayServiceKey(row) === key);
  if (!currSvc) return {service: overSvc, updated: false};
  const currTs = normalizeNumber(currSvc[COLUMN.UPDATED_AT]);
  const overTs = normalizeNumber(overSvc[COLUMN.UPDATED_AT]);
  if (isNewerTs(currTs, overTs) ||
      (currTs === overTs && SERVICE_COMPARE_FIELDS.some((f) => currSvc[f] !== overSvc[f]))) {
    return {service: currSvc, updated: true};
  }
  return {service: overSvc, updated: false};
};

const syncOverlayPartitionIfAdvanced = (entry, currPart) => {
  if (!currPart || !entry.partition) return;
  const overPart = snapshotPartitionBaseline(entry.partition);
  const basePart = entry.capturedCacheBaseline?.partition ?? null;
  const currPartSnapshot = snapshotPartitionBaseline(currPart);
  if (hasPartitionAdvanced(basePart, currPartSnapshot, overPart)) entry.partition = currPart;
};

const appendNewerServices = (nextServices, currServiceRows, overServices, overRefTs) => {
  let mutated = false;
  for (const currSvc of currServiceRows) {
    const key = resolveOverlayServiceKey(currSvc);
    if (key === null || Object.hasOwn(overServices, key)) continue;
    const currTs = normalizeNumber(currSvc[COLUMN.UPDATED_AT]);
    const isMissing = !nextServices.some((s) => resolveOverlayServiceKey(s) === key);
    if (isNewerTs(currTs, overRefTs) && isMissing) {
      nextServices.push(currSvc);
      mutated = true;
    }
  }
  return mutated;
};

const extractRows = (result) => Array.isArray(result?.rows) ? result.rows : [];
const isPartitionService = (s) => s?.service_type === SERVICE_TYPE.PARTITION;
const isInitializedLocalPartition = (service, partitionId) =>
  service != null && service.partitionId === partitionId && service.initialized === true;

const buildRefreshedOverlayEntry = (
  partitionResult, serviceResult, capturedCacheBaseline, resolver,
) => {
  if (partitionResult?.success === false || serviceResult?.success === false) return null;
  const pRows = extractRows(partitionResult);
  const sRows = extractRows(serviceResult).filter(isPartitionService);
  if (pRows.length === 0 && sRows.length === 0) {
    return {
      state: AUTHORITATIVE_ROUTING_OVERLAY_STATE.AUTHORITATIVE_MISSING,
      partition: null,
      services: Object.freeze([]),
      capturedCacheBaseline,
    };
  }
  return {
    state: AUTHORITATIVE_ROUTING_OVERLAY_STATE.AVAILABLE,
    partition: pRows[0] || null,
    services: sRows,
    cacheServiceState: resolver(pRows[0] || null, sRows),
    capturedCacheBaseline,
  };
};

class SQLQueryEngineRoutingMetadataMethods {
  /**
   * Check whether one partition service row is available in local cache.
   * @param {string} replicaId - Partition service replica ID.
   * @return {boolean} True when service row exists in cache.
   * @private
   */
  hasServiceMetadata(replicaId) {
    if (!replicaId || !this.systemCache) return false;
    if (typeof this.systemCache.get === LOCAL_STR_FUNCTION) {
      const row = this.systemCache.get(TABLES.SERVICES, replicaId);
      if (row && !isPartitionCleanupServiceRow(row)) return true;
    }
    if (typeof this.systemCache.filter === LOCAL_STR_FUNCTION) {
      const matches = this.systemCache.filter(
        TABLES.SERVICES,
        (row) => !isPartitionCleanupServiceRow(row) &&
          (row.service_id === replicaId || row.replica_id === replicaId),
      );
      if (Array.isArray(matches) && matches.length > 0) return true;
    }
    return false;
  }

  /**
   * Check whether one partition service row is available and routable.
   * @param {string} replicaId - Partition service replica ID.
   * @return {boolean} True when service row is routable in local cache.
   * @private
   */
  hasRoutableServiceMetadata(replicaId) {
    if (!replicaId || !this.systemCache) return false;
    const isRoutableService = (service) => {
      if (!service || typeof service !== 'object') return false;
      const qe = this.queryExecutor;
      return typeof qe?.isRoutablePartitionService === LOCAL_STR_FUNCTION &&
        qe.isRoutablePartitionService(service);
    };
    const matches = (r) => r?.service_id === replicaId || r?.replica_id === replicaId;
    if (typeof this.systemCache.get === LOCAL_STR_FUNCTION) {
      const row = this.systemCache.get(TABLES.SERVICES, replicaId);
      if (isRoutableService(row)) return true;
    }
    if (typeof this.systemCache.filter === LOCAL_STR_FUNCTION) {
      const filtered = this.systemCache.filter(
        TABLES.SERVICES, (r) => matches(r) && isRoutableService(r),
      );
      return Array.isArray(filtered) && filtered.length > 0;
    }
    if (typeof this.systemCache.getAll === LOCAL_STR_FUNCTION) {
      const rows = this.systemCache.getAll(TABLES.SERVICES);
      return Array.isArray(rows) && rows.some((r) => matches(r) && isRoutableService(r));
    }
    return false;
  }

  /**
   * Check whether a partition currently has a routable service row.
   * @param {string} partitionId - Partition ID.
   * @return {boolean} True when routable.
   * @private
   */
  hasRoutablePartitionService(partitionId) {
    return this.getRoutablePartitionServiceNodeIds(partitionId).length > 0;
  }

  /**
   * Get unique node IDs with routable partition services.
   * @param {string} partitionId - Partition ID.
   * @return {Array<string>} Unique node IDs.
   * @private
   */
  getRoutablePartitionServiceNodeIds(partitionId, routingReadinessDimension = undefined) {
    if (!this.queryExecutor ||
        typeof this.queryExecutor.getRoutablePartitionServices !== LOCAL_STR_FUNCTION) {
      return [];
    }
    const services = this.queryExecutor.getRoutablePartitionServices(
      partitionId, routingReadinessDimension,
    );
    const nodeIds = new Set();
    for (const service of services) {
      const nodeId = service?.node_id || service?.nodeId || null;
      if (typeof nodeId === LOCAL_STR_STRING && nodeId.length > 0) nodeIds.add(nodeId);
    }
    return [...nodeIds];
  }

  /**
   * Compose an optional caller-supplied routing overlay with the local
   * bootstrap overlay used to bridge cache publication gaps after partition
   * creation.
   * @param {Object|null} primaryOverlay
   * @param {Object|null} secondaryOverlay
   * @return {Object|null}
   * @private
   */
  composeRoutingMetadataOverlay(primaryOverlay, secondaryOverlay) {
    if (!primaryOverlay && !secondaryOverlay) return null;
    if (!primaryOverlay) return secondaryOverlay;
    if (!secondaryOverlay) return primaryOverlay;

    const mergeServices = (partitionId) => {
      const merged = [];
      const seen = new Set();
      for (const overlay of [primaryOverlay, secondaryOverlay]) {
        if (!overlay || typeof overlay.getServicesForPartition !== LOCAL_STR_FUNCTION) continue;
        const services = overlay.getServicesForPartition(partitionId);
        if (!Array.isArray(services)) continue;
        for (const s of services) {
          const key = resolveOverlayServiceKey(s);
          if (key && !seen.has(key)) {
            seen.add(key);
            merged.push(s);
          }
        }
      }
      return merged;
    };

    return {
      getPartitionById: (partitionId) => {
        const primaryPartition = typeof primaryOverlay.getPartitionById === LOCAL_STR_FUNCTION ?
          primaryOverlay.getPartitionById(partitionId) : null;
        if (primaryPartition) return primaryPartition;
        return typeof secondaryOverlay.getPartitionById === LOCAL_STR_FUNCTION ?
          secondaryOverlay.getPartitionById(partitionId) : null;
      },
      getServicesForPartition: (partitionId) => mergeServices(partitionId),
      shouldMaskCacheServicesForPartition: (partitionId) => {
        for (const overlay of [primaryOverlay, secondaryOverlay]) {
          const fn = overlay?.shouldMaskCacheServicesForPartition;
          if (typeof fn === LOCAL_STR_FUNCTION &&
              overlay.shouldMaskCacheServicesForPartition(partitionId) === true) {
            return true;
          }
        }
        return false;
      },
      refreshPartitionRouting: async (partitionId, options = {}) => {
        for (const overlay of [primaryOverlay, secondaryOverlay]) {
          if (overlay && typeof overlay.refreshPartitionRouting === LOCAL_STR_FUNCTION) {
            const refreshed = await overlay.refreshPartitionRouting(partitionId, options);
            if (refreshed === true) return true;
          }
        }
        return false;
      },
    };
  }

  /**
   * Resolve authoritative overlay partition metadata by ID.
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  getAuthoritativeRoutingOverlayPartition(partitionId) {
    const overlayState = this.getAuthoritativeRoutingOverlayEntryState(partitionId);
    return overlayState.partitionState === LOCAL_STR_AVAILABLE ? overlayState.partition : null;
  }

  /**
   * Resolve authoritative overlay service rows by partition ID.
   * @param {string} partitionId
   * @return {Array<Object>}
   * @private
   */
  getAuthoritativeRoutingOverlayServices(partitionId) {
    return this.getAuthoritativeRoutingOverlayEntryState(partitionId).services;
  }

  _buildLocalRuntimeServiceRow(service, partitionId, rawRole) {
    if (!isInitializedLocalPartition(service, partitionId)) {
      return null;
    }
    const replicaId = normalizeText(service.replicaId);
    const nodeId = normalizeText(service.nodeId) ?? this.nodeId;
    const address = normalizeText(service.unifiedAddress) ?? normalizeText(service.address);
    if (!replicaId || !nodeId || !address) return null;
    const raftRole = normalizeText(rawRole);
    const now = Date.now();
    return {
      [COLUMN.SERVICE_ID]: replicaId,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.PARTITION_ID]: partitionId,
      [COLUMN.REPLICA_ID]: replicaId,
      [COLUMN.RAFT_ROLE]: raftRole,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: address,
      [COLUMN.CREATED_AT]: now,
      [COLUMN.UPDATED_AT]: now,
    };
  }

  /**
   * Resolve local runtime partition services that are safe to expose while
   * priority control-plane service-row publication is retrying.
   * @param {string} partitionId
   * @return {Array<Object>}
   * @private
   */
  getLocalRuntimeRoutingOverlayServices(partitionId) {
    if (typeof partitionId !== LOCAL_STR_STRING || !partitionId ||
        typeof this.partitionServicesProvider !== LOCAL_STR_FUNCTION) return [];
    const partitionRow = typeof this.getCachedPartitionRecord === LOCAL_STR_FUNCTION ?
      this.getCachedPartitionRecord(partitionId) : null;
    if (!classifySystemPartition({partitionId, partitionRow}).priorityControlPlane) return [];
    const partitionServices = this.partitionServicesProvider();
    if (!partitionServices || typeof partitionServices.values !== LOCAL_STR_FUNCTION) return [];
    const serviceRows = [];
    for (const service of partitionServices.values()) {
      if (!isInitializedLocalPartition(service, partitionId)) continue;
      const route = readReplicaLeaderRoute(service);
      const row = this._buildLocalRuntimeServiceRow(service, partitionId, route.role);
      if (row) serviceRows.push(row);
    }
    return serviceRows;
  }

  /**
   * Resolve whether authoritative overlay state should suppress cached service
   * rows for one partition.
   * @param {string} partitionId
   * @return {boolean}
   * @private
   */
  shouldAuthoritativeRoutingOverlayMaskCacheServices(partitionId) {
    return this.getAuthoritativeRoutingOverlayEntryState(partitionId).cacheServiceState ===
      AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE.MASKED;
  }

  syncAuthoritativeRoutingOverlaySurvivingServices(entry, currPart, currServiceRows) {
    if (!entry) return;
    syncOverlayPartitionIfAdvanced(entry, currPart);
    if (!Array.isArray(entry.services) || !Array.isArray(currServiceRows)) return;
    const overServices = snapshotServicesBaseline(entry.services);
    const overRefTs = resolveOverlayRefTs(snapshotPartitionBaseline(entry.partition), overServices);
    let mutated = false;
    const nextServices = entry.services.map((overSvc) => {
      const {service, updated} = updateOverlayServiceRow(overSvc, currServiceRows);
      if (updated) mutated = true;
      return service;
    });
    if (appendNewerServices(nextServices, currServiceRows, overServices, overRefTs)) mutated = true;
    if (mutated) entry.services = nextServices;
  }

  evictOutdatedAuthoritativeRoutingOverlayEntry(partitionId) {
    const entry = this.authoritativeRoutingOverlayEntries.get(partitionId);
    if (!entry || typeof entry !== LOCAL_STR_OBJECT) return;
    const currPart = this.getCachedPartitionRecord(partitionId);
    const currServices = this.getPartitionServiceRows(partitionId);
    if (isAuthoritativeOverlayOutdated(entry, currPart, currServices)) {
      this.authoritativeRoutingOverlayEntries.delete(partitionId);
      return;
    }
    this.syncAuthoritativeRoutingOverlaySurvivingServices(entry, currPart, currServices);
  }

  handleAuthoritativeRoutingOverlayCacheApplyChange(tableName, operation, record) {
    if ((tableName !== TABLES.PARTITIONS && tableName !== TABLES.SERVICES) ||
        this.authoritativeRoutingOverlayEntries.size === 0) return;
    const partitionId = normalizeText(record?.[COLUMN.PARTITION_ID]);
    if (tableName === TABLES.PARTITIONS && operation === CACHE_CDC_OPERATIONS.DELETE &&
        partitionId !== null && this.authoritativeRoutingOverlayEntries.has(partitionId)) {
      this.authoritativeRoutingOverlayEntries.delete(partitionId);
      return;
    }
    if (partitionId !== null && this.authoritativeRoutingOverlayEntries.has(partitionId)) {
      this.evictOutdatedAuthoritativeRoutingOverlayEntry(partitionId);
      return;
    }
    for (const id of this.authoritativeRoutingOverlayEntries.keys()) {
      this.evictOutdatedAuthoritativeRoutingOverlayEntry(id);
    }
  }

  /**
   * Resolve one explicit authoritative overlay entry state.
   * @param {string} partitionId
   * @return {Object}
   * @private
   */
  getAuthoritativeRoutingOverlayEntryState(partitionId) {
    this.evictOutdatedAuthoritativeRoutingOverlayEntry(partitionId);
    const entry = this.authoritativeRoutingOverlayEntries.get(partitionId);
    if (!entry || typeof entry !== LOCAL_STR_OBJECT) {
      return Object.freeze({
        state: AUTHORITATIVE_ROUTING_OVERLAY_STATE.MISSING,
        partitionState: AUTHORITATIVE_ROUTING_OVERLAY_PARTITION_STATE.UNAVAILABLE,
        cacheServiceState: AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE.ELIGIBLE,
        services: Object.freeze([]),
      });
    }
    const services = Object.freeze(Array.isArray(entry.services) ? entry.services : []);
    if (entry.state === AUTHORITATIVE_ROUTING_OVERLAY_STATE.AUTHORITATIVE_MISSING) {
      return Object.freeze({
        state: AUTHORITATIVE_ROUTING_OVERLAY_STATE.AUTHORITATIVE_MISSING,
        partitionState: AUTHORITATIVE_ROUTING_OVERLAY_PARTITION_STATE.UNAVAILABLE,
        cacheServiceState: AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE.MASKED,
        services,
      });
    }
    const hasPart = Boolean(entry.partition && typeof entry.partition === LOCAL_STR_OBJECT);
    return Object.freeze({
      state: AUTHORITATIVE_ROUTING_OVERLAY_STATE.AVAILABLE,
      partitionState: hasPart ? AUTHORITATIVE_ROUTING_OVERLAY_PARTITION_STATE.AVAILABLE :
        AUTHORITATIVE_ROUTING_OVERLAY_PARTITION_STATE.UNAVAILABLE,
      ...(hasPart ? {partition: entry.partition} : {}),
      cacheServiceState: entry.cacheServiceState ||
        AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE.MASKED,
      services,
    });
  }

  /**
   * Resolve whether an authoritative service snapshot is complete enough to
   * mask cached service rows for the same partition.
   * @param {Object|null} partitionRow
   * @param {Array<Object>} serviceRows
   * @return {{state:string, expectedReplicaCount:number|null,
   *   observedServiceCount:number}}
   * @private
   */
  resolveAuthoritativeRoutingOverlayServiceCoverage(partitionRow, serviceRows) {
    const observedServiceCount = Array.isArray(serviceRows) ? serviceRows.length : 0;
    const desiredTarget = resolveDesiredReplicationFactor(partitionRow);
    if (desiredTarget.source === REPLICATION_TARGET_SOURCE.UNDECLARED) {
      return Object.freeze({
        state: AUTHORITATIVE_ROUTING_OVERLAY_SERVICE_COVERAGE_STATE.UNKNOWN,
        expectedReplicaCount: 0,
        observedServiceCount,
      });
    }
    const normalizedExpectedReplicaCount = desiredTarget.replicationFactor;
    const isComplete = observedServiceCount >= normalizedExpectedReplicaCount;
    return Object.freeze({
      state: isComplete ? AUTHORITATIVE_ROUTING_OVERLAY_SERVICE_COVERAGE_STATE.COMPLETE :
        AUTHORITATIVE_ROUTING_OVERLAY_SERVICE_COVERAGE_STATE.INCOMPLETE,
      expectedReplicaCount: normalizedExpectedReplicaCount,
      observedServiceCount,
    });
  }

  /**
   * Resolve the cache masking state for one authoritative routing refresh.
   * @param {Object|null} partitionRow
   * @param {Array<Object>} serviceRows
   * @return {string}
   * @private
   */
  resolveAuthoritativeRoutingOverlayCacheServiceState(partitionRow, serviceRows) {
    const serviceCoverage = this.resolveAuthoritativeRoutingOverlayServiceCoverage(
      partitionRow, serviceRows,
    );
    if (serviceCoverage.state === AUTHORITATIVE_ROUTING_OVERLAY_SERVICE_COVERAGE_STATE.INCOMPLETE) {
      return AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE.ELIGIBLE;
    }
    return AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE.MASKED;
  }

  /**
   * Refresh one partition's routing metadata through the authoritative
   * control-plane view so stale cache service rows can be bypassed after a
   * runtime no-handler witness.
   * @param {string} partitionId
   * @param {Object} [options]
   * @return {Promise<boolean>}
   * @private
   */
  async refreshAuthoritativeRoutingOverlay(partitionId, options = {}) {
    if (typeof partitionId !== LOCAL_STR_STRING || !partitionId || this.isShutDown === true) {
      return false;
    }
    if (!this.inFlightAuthoritativeRoutingRefreshes) {
      this.inFlightAuthoritativeRoutingRefreshes = new Map();
    }
    if (this.inFlightAuthoritativeRoutingRefreshes.has(partitionId)) {
      return this.inFlightAuthoritativeRoutingRefreshes.get(partitionId);
    }

    const capturedSystemCache = this.systemCache;
    const executeRefresh = async () => {
      try {
        const authoritativeControlPlaneView = this.getAuthoritativeControlPlaneView();
        if (!authoritativeControlPlaneView || this.isShutDown === true) return false;
        const queryTimeoutMs =
          Number.isFinite(options.queryTimeoutMs) && options.queryTimeoutMs > 0 ?
            options.queryTimeoutMs : this.queryTimeoutMs;
        const capturedCacheBaseline = Object.freeze({
          partition: snapshotPartitionBaseline(this.getCachedPartitionRecord(partitionId)),
          services: snapshotServicesBaseline(this.getPartitionServiceRows(partitionId)),
        });
        const readOpts = {
          readAuthority: AUTHORITATIVE_ROUTING_OVERLAY_READ_AUTHORITY, queryTimeoutMs,
        };
        const partSql = `SELECT * FROM ${TABLES.PARTITIONS} WHERE ${COLUMN.PARTITION_ID} = ?`;
        const svcSql = `SELECT * FROM ${TABLES.SERVICES} WHERE ` +
          `${COLUMN.PARTITION_ID} = ? AND ${COLUMN.SERVICE_TYPE} = ?`;
        const [partitionResult, serviceResult] = await Promise.all([
          authoritativeControlPlaneView.readRows(
            TABLES.PARTITIONS, partSql, [partitionId], readOpts,
          ),
          authoritativeControlPlaneView.readRows(
            TABLES.SERVICES, svcSql, [partitionId, SERVICE_TYPE.PARTITION], readOpts,
          ),
        ]);
        if (this.isShutDown === true || this.systemCache !== capturedSystemCache) return false;
        const overlayEntry = buildRefreshedOverlayEntry(
          partitionResult, serviceResult, capturedCacheBaseline,
          (part, svcs) => this.resolveAuthoritativeRoutingOverlayCacheServiceState(part, svcs),
        );
        if (!overlayEntry || this.isShutDown === true || this.systemCache !== capturedSystemCache) {
          return false;
        }
        const currPart = this.getCachedPartitionRecord(partitionId);
        const currSvcs = this.getPartitionServiceRows(partitionId);
        if (isAuthoritativeOverlayOutdated(overlayEntry, currPart, currSvcs)) {
          this.authoritativeRoutingOverlayEntries.delete(partitionId);
        } else {
          this.authoritativeRoutingOverlayEntries.set(partitionId, overlayEntry);
        }
        return true;
      } finally {
        this.inFlightAuthoritativeRoutingRefreshes.delete(partitionId);
      }
    };

    const promise = executeRefresh();
    this.inFlightAuthoritativeRoutingRefreshes.set(partitionId, promise);
    return promise;
  }
}

function createSQLQueryEngineRoutingMetadataMethods() {
  return Object.fromEntries(
    Object.entries(Object.getOwnPropertyDescriptors(SQLQueryEngineRoutingMetadataMethods.prototype))
      .filter(([name]) => name !== 'constructor'),
  );
}

export {createSQLQueryEngineRoutingMetadataMethods};
