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

const AUTHORITATIVE_ROUTING_OVERLAY_READ_AUTHORITY =
  buildControlPlaneReadAuthority({
    authoritativeReadMode:
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
    replicaFallbackConsistency:
      LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
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
const isAvailableOverlayOutdated = (entry, base, curr, partChanged, svcsChanged) => {
  const overPart = snapshotPartitionBaseline(entry.partition);
  const overServices = snapshotServicesBaseline(entry.services);
  const overRefTs = resolveOverlayRefTs(overPart, overServices);
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
  return entry.state === AUTHORITATIVE_ROUTING_OVERLAY_STATE.AUTHORITATIVE_MISSING ?
    isAuthoritativeMissingSuperseded(base.part, base.svcs, curr.part, curr.svcs) :
    isAvailableOverlayOutdated(entry, base, curr, partChanged, svcsChanged);
}


class SQLQueryEngineRoutingMetadataMethods {
  /**
   * Check whether one partition service row is available in local cache.
   * @param {string} replicaId - Partition service replica ID.
   * @return {boolean} True when service row exists in cache.
   * @private
   */
  hasServiceMetadata(replicaId) {
    if (!replicaId || !this.systemCache) {
      return false;
    }

    if (typeof this.systemCache.get === LOCAL_STR_FUNCTION) {
      const row = this.systemCache.get(TABLES.SERVICES, replicaId);
      if (row && !isPartitionCleanupServiceRow(row)) {
        return true;
      }
    }

    if (typeof this.systemCache.filter === LOCAL_STR_FUNCTION) {
      const matches = this.systemCache.filter(
        TABLES.SERVICES,
        (row) => !isPartitionCleanupServiceRow(row) &&
          (row.service_id === replicaId || row.replica_id === replicaId),
      );
      if (Array.isArray(matches) && matches.length > 0) {
        return true;
      }
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
    if (!replicaId || !this.systemCache) {
      return false;
    }

    const isRoutableService = (service) => {
      if (!service || typeof service !== 'object') {
        return false;
      }
      if (
        this.queryExecutor &&
        typeof this.queryExecutor.isRoutablePartitionService === 'function'
      ) {
        return this.queryExecutor.isRoutablePartitionService(service);
      }
      return false;
    };
    const matchesReplicaId = (row) =>
      row?.service_id === replicaId || row?.replica_id === replicaId;

    if (typeof this.systemCache.get === LOCAL_STR_FUNCTION) {
      const row = this.systemCache.get(TABLES.SERVICES, replicaId);
      if (isRoutableService(row)) {
        return true;
      }
    }

    if (typeof this.systemCache.filter === LOCAL_STR_FUNCTION) {
      const matches = this.systemCache.filter(
        TABLES.SERVICES,
        (row) => matchesReplicaId(row) && isRoutableService(row),
      );
      return Array.isArray(matches) && matches.length > 0;
    }

    if (typeof this.systemCache.getAll === LOCAL_STR_FUNCTION) {
      const rows = this.systemCache.getAll(TABLES.SERVICES);
      if (!Array.isArray(rows)) {
        return false;
      }
      return rows.some(
        (row) => matchesReplicaId(row) && isRoutableService(row),
      );
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
  getRoutablePartitionServiceNodeIds(
    partitionId,
    routingReadinessDimension = undefined,
  ) {
    if (
      !this.queryExecutor ||
      typeof this.queryExecutor.getRoutablePartitionServices !== LOCAL_STR_FUNCTION
    ) {
      return [];
    }
    const services = this.queryExecutor.getRoutablePartitionServices(
      partitionId,
      routingReadinessDimension,
    );
    const nodeIds = new Set();
    for (const service of services) {
      const nodeId = service?.node_id || service?.nodeId || null;
      if (typeof nodeId === LOCAL_STR_STRING && nodeId.length > 0) {
        nodeIds.add(nodeId);
      }
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
    if (!primaryOverlay && !secondaryOverlay) {
      return null;
    }
    if (!primaryOverlay) {
      return secondaryOverlay;
    }
    if (!secondaryOverlay) {
      return primaryOverlay;
    }

    const mergeServices = (partitionId) => {
      const mergedServices = [];
      const seenServiceKeys = new Set();
      for (const overlay of [primaryOverlay, secondaryOverlay]) {
        if (!overlay || typeof overlay.getServicesForPartition !== 'function') {
          continue;
        }
        const services = overlay.getServicesForPartition(partitionId);
        if (!Array.isArray(services)) {
          continue;
        }
        for (const service of services) {
          const serviceKey =
            service?.service_id ||
            service?.replica_id ||
            service?.address ||
            null;
          if (
            typeof serviceKey !== 'string' ||
            serviceKey.length === 0 ||
            seenServiceKeys.has(serviceKey)
          ) {
            continue;
          }
          seenServiceKeys.add(serviceKey);
          mergedServices.push(service);
        }
      }
      return mergedServices;
    };

    return {
      getPartitionById: (partitionId) => {
        const primaryPartition =
          typeof primaryOverlay.getPartitionById === 'function' ?
            primaryOverlay.getPartitionById(partitionId) :
            null;
        if (primaryPartition) {
          return primaryPartition;
        }
        return typeof secondaryOverlay.getPartitionById === LOCAL_STR_FUNCTION ?
          secondaryOverlay.getPartitionById(partitionId) :
          null;
      },
      getServicesForPartition: (partitionId) => mergeServices(partitionId),
      shouldMaskCacheServicesForPartition: (partitionId) => {
        for (const overlay of [primaryOverlay, secondaryOverlay]) {
          if (
            !overlay ||
            typeof overlay.shouldMaskCacheServicesForPartition !== LOCAL_STR_FUNCTION
          ) {
            continue;
          }
          if (overlay.shouldMaskCacheServicesForPartition(partitionId) === true) {
            return true;
          }
        }
        return false;
      },
      refreshPartitionRouting: async (partitionId, options = {}) => {
        for (const overlay of [primaryOverlay, secondaryOverlay]) {
          if (
            !overlay ||
            typeof overlay.refreshPartitionRouting !== LOCAL_STR_FUNCTION
          ) {
            continue;
          }
          const refreshed = await overlay.refreshPartitionRouting(
            partitionId,
            options,
          );
          if (refreshed === true) {
            return true;
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
    const overlayState =
      this.getAuthoritativeRoutingOverlayEntryState(partitionId);
    return overlayState.partitionState === LOCAL_STR_AVAILABLE ?
      overlayState.partition :
      null;
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

  /**
   * Resolve local runtime partition services that are safe to expose while
   * priority control-plane service-row publication is retrying.
   * @param {string} partitionId
   * @return {Array<Object>}
   * @private
   */
  getLocalRuntimeRoutingOverlayServices(partitionId) {
    if (
      typeof partitionId !== LOCAL_STR_STRING ||
      partitionId.length === 0 ||
      typeof this.partitionServicesProvider !== LOCAL_STR_FUNCTION
    ) {
      return [];
    }
    const partitionRow =
      typeof this.getCachedPartitionRecord === LOCAL_STR_FUNCTION ?
        this.getCachedPartitionRecord(partitionId) :
        null;
    if (!classifySystemPartition({
      partitionId,
      partitionRow,
    }).priorityControlPlane) {
      return [];
    }
    const partitionServices = this.partitionServicesProvider();
    if (
      !partitionServices ||
      typeof partitionServices.values !== LOCAL_STR_FUNCTION
    ) {
      return [];
    }
    const serviceRows = [];
    for (const service of partitionServices.values()) {
      if (
        !service ||
        service.partitionId !== partitionId ||
        service.initialized !== true
      ) {
        continue;
      }
      const replicaId =
        typeof service.replicaId === LOCAL_STR_STRING &&
        service.replicaId.length > 0 ?
          service.replicaId :
          null;
      const nodeId =
        typeof service.nodeId === LOCAL_STR_STRING &&
        service.nodeId.length > 0 ?
          service.nodeId :
          this.nodeId;
      const address =
        typeof service.unifiedAddress === LOCAL_STR_STRING &&
        service.unifiedAddress.length > 0 ?
          service.unifiedAddress :
          typeof service.address === LOCAL_STR_STRING &&
          service.address.length > 0 ?
            service.address :
            null;
      if (!replicaId || !nodeId || !address) {
        continue;
      }
      const raftRole =
        typeof service.getRole === LOCAL_STR_FUNCTION ?
          service.getRole() :
          service.role;
      const now = Date.now();
      serviceRows.push({
        [COLUMN.SERVICE_ID]: replicaId,
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
        [COLUMN.NODE_ID]: nodeId,
        [COLUMN.PARTITION_ID]: partitionId,
        [COLUMN.REPLICA_ID]: replicaId,
        [COLUMN.RAFT_ROLE]:
          typeof raftRole === LOCAL_STR_STRING &&
          raftRole.length > 0 ?
            raftRole :
            null,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.ADDRESS]: address,
        [COLUMN.CREATED_AT]: now,
        [COLUMN.UPDATED_AT]: now,
      });
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
    return (
      this.getAuthoritativeRoutingOverlayEntryState(partitionId)
        .cacheServiceState ===
      AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE.MASKED
    );
  }

  evictOutdatedAuthoritativeRoutingOverlayEntry(partitionId) {
    const entry = this.authoritativeRoutingOverlayEntries.get(partitionId);
    if (entry && typeof entry === LOCAL_STR_OBJECT && isAuthoritativeOverlayOutdated(
      entry, this.getCachedPartitionRecord(partitionId), this.getPartitionServiceRows(partitionId),
    )) this.authoritativeRoutingOverlayEntries.delete(partitionId);
  }

  handleAuthoritativeRoutingOverlayCacheApplyChange(tableName, _operation, record) {
    if ((tableName !== TABLES.PARTITIONS && tableName !== TABLES.SERVICES) ||
        this.authoritativeRoutingOverlayEntries.size === 0) return;
    const partitionId = normalizeText(record?.[COLUMN.PARTITION_ID]);
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
        partitionState:
          AUTHORITATIVE_ROUTING_OVERLAY_PARTITION_STATE.UNAVAILABLE,
        cacheServiceState:
          AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE.ELIGIBLE,
        services: Object.freeze([]),
      });
    }
    const services = Object.freeze(
      Array.isArray(entry.services) ? entry.services : [],
    );
    if (entry.state === AUTHORITATIVE_ROUTING_OVERLAY_STATE.AUTHORITATIVE_MISSING) {
      return Object.freeze({
        state: AUTHORITATIVE_ROUTING_OVERLAY_STATE.AUTHORITATIVE_MISSING,
        partitionState:
          AUTHORITATIVE_ROUTING_OVERLAY_PARTITION_STATE.UNAVAILABLE,
        cacheServiceState:
          AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE.MASKED,
        services,
      });
    }
    if (entry.partition && typeof entry.partition === LOCAL_STR_OBJECT) {
      return Object.freeze({
        state: AUTHORITATIVE_ROUTING_OVERLAY_STATE.AVAILABLE,
        partitionState:
          AUTHORITATIVE_ROUTING_OVERLAY_PARTITION_STATE.AVAILABLE,
        partition: entry.partition,
        cacheServiceState:
          entry.cacheServiceState ||
          AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE.MASKED,
        services,
      });
    }
    return Object.freeze({
      state: AUTHORITATIVE_ROUTING_OVERLAY_STATE.AVAILABLE,
      partitionState:
        AUTHORITATIVE_ROUTING_OVERLAY_PARTITION_STATE.UNAVAILABLE,
      cacheServiceState:
        entry.cacheServiceState ||
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
  resolveAuthoritativeRoutingOverlayServiceCoverage(
    partitionRow,
    serviceRows,
  ) {
    const observedServiceCount = Array.isArray(serviceRows) ?
      serviceRows.length :
      0;
    // Row decode is owned by the single policy authority; an undeclared
    // policy keeps this overlay's explicit UNKNOWN coverage state.
    const desiredTarget = resolveDesiredReplicationFactor(partitionRow);
    if (desiredTarget.source === REPLICATION_TARGET_SOURCE.UNDECLARED) {
      return Object.freeze({
        state: AUTHORITATIVE_ROUTING_OVERLAY_SERVICE_COVERAGE_STATE.UNKNOWN,
        expectedReplicaCount: 0,
        observedServiceCount,
      });
    }
    const normalizedExpectedReplicaCount = desiredTarget.replicationFactor;
    if (observedServiceCount >= normalizedExpectedReplicaCount) {
      return Object.freeze({
        state: AUTHORITATIVE_ROUTING_OVERLAY_SERVICE_COVERAGE_STATE.COMPLETE,
        expectedReplicaCount: normalizedExpectedReplicaCount,
        observedServiceCount,
      });
    }
    return Object.freeze({
      state: AUTHORITATIVE_ROUTING_OVERLAY_SERVICE_COVERAGE_STATE.INCOMPLETE,
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
  resolveAuthoritativeRoutingOverlayCacheServiceState(
    partitionRow,
    serviceRows,
  ) {
    const serviceCoverage =
      this.resolveAuthoritativeRoutingOverlayServiceCoverage(
        partitionRow,
        serviceRows,
      );
    if (
      serviceCoverage.state ===
      AUTHORITATIVE_ROUTING_OVERLAY_SERVICE_COVERAGE_STATE.INCOMPLETE
    ) {
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
    if (typeof partitionId !== LOCAL_STR_STRING || partitionId.length === 0) {
      return false;
    }

    const authoritativeControlPlaneView =
      this.getAuthoritativeControlPlaneView();
    if (!authoritativeControlPlaneView) {
      return false;
    }

    const queryTimeoutMs =
      Number.isFinite(options.queryTimeoutMs) && options.queryTimeoutMs > 0 ?
        options.queryTimeoutMs :
        this.queryTimeoutMs;

    const capturedCacheBaseline = Object.freeze({
      partition: snapshotPartitionBaseline(this.getCachedPartitionRecord(partitionId)),
      services: snapshotServicesBaseline(this.getPartitionServiceRows(partitionId)),
    });

    const [partitionResult, serviceResult] = await Promise.all([
      authoritativeControlPlaneView.readRows(
        TABLES.PARTITIONS,
        `SELECT * FROM ${TABLES.PARTITIONS} WHERE ${COLUMN.PARTITION_ID} = ?`,
        [partitionId],
        {
          readAuthority: AUTHORITATIVE_ROUTING_OVERLAY_READ_AUTHORITY,
          queryTimeoutMs,
        },
      ),
      authoritativeControlPlaneView.readRows(
        TABLES.SERVICES,
        `SELECT * FROM ${TABLES.SERVICES} WHERE ${COLUMN.PARTITION_ID} = ? ` +
          `AND ${COLUMN.SERVICE_TYPE} = ?`,
        [partitionId, SERVICE_TYPE.PARTITION],
        {
          readAuthority: AUTHORITATIVE_ROUTING_OVERLAY_READ_AUTHORITY,
          queryTimeoutMs,
        },
      ),
    ]);

    const partitionRows = Array.isArray(partitionResult?.rows) ?
      partitionResult.rows :
      [];
    const partitionReadAvailable = partitionResult?.success !== false;
    const serviceRows = Array.isArray(serviceResult?.rows) ?
      serviceResult.rows.filter(
        (service) => service?.service_type === SERVICE_TYPE.PARTITION,
      ) :
      [];
    const serviceReadAvailable = serviceResult?.success !== false;

    if (!partitionReadAvailable || !serviceReadAvailable) {
      return false;
    }

    const overlayEntry =
      partitionRows.length === 0 && serviceRows.length === 0 ?
        {
          state:
              AUTHORITATIVE_ROUTING_OVERLAY_STATE.AUTHORITATIVE_MISSING,
          partition: null,
          services: Object.freeze([]),
          capturedCacheBaseline,
        } :
        {
          state: AUTHORITATIVE_ROUTING_OVERLAY_STATE.AVAILABLE,
          partition: partitionRows[0] || null,
          services: serviceRows,
          cacheServiceState:
            this.resolveAuthoritativeRoutingOverlayCacheServiceState(
              partitionRows[0] || null,
              serviceRows,
            ),
          capturedCacheBaseline,
        };

    if (isAuthoritativeOverlayOutdated(
      overlayEntry,
      this.getCachedPartitionRecord(partitionId),
      this.getPartitionServiceRows(partitionId),
    )) {
      this.authoritativeRoutingOverlayEntries.delete(partitionId);
    } else {
      this.authoritativeRoutingOverlayEntries.set(partitionId, overlayEntry);
    }

    return true;
  }
}

function createSQLQueryEngineRoutingMetadataMethods() {
  return Object.fromEntries(
    Object.entries(Object.getOwnPropertyDescriptors(SQLQueryEngineRoutingMetadataMethods.prototype))
      .filter(([name]) => name !== 'constructor'),
  );
}

export {createSQLQueryEngineRoutingMetadataMethods};
