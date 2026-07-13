import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {
  classifySystemPartition,
} from '../bootstrap/system-partition-classification.js';

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

const AUTHORITATIVE_ROUTING_OVERLAY_PARTITION_FIELD = Object.freeze({
  REPLICA_COUNT: 'replica_count',
  REPLICA_COUNT_CAMEL: 'replicaCount',
});


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

    if (typeof this.systemCache.has === LOCAL_STR_FUNCTION) {
      if (this.systemCache.has(TABLES.SERVICES, replicaId)) {
        return true;
      }
    }

    if (typeof this.systemCache.get === LOCAL_STR_FUNCTION) {
      if (this.systemCache.get(TABLES.SERVICES, replicaId)) {
        return true;
      }
    }

    if (typeof this.systemCache.filter === LOCAL_STR_FUNCTION) {
      const matches = this.systemCache.filter(
        TABLES.SERVICES,
        (row) => row.service_id === replicaId || row.replica_id === replicaId,
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

  /**
   * Resolve one explicit authoritative overlay entry state.
   * @param {string} partitionId
   * @return {Object}
   * @private
   */
  getAuthoritativeRoutingOverlayEntryState(partitionId) {
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
    const partitionReplicaCount =
      partitionRow?.[
        AUTHORITATIVE_ROUTING_OVERLAY_PARTITION_FIELD.REPLICA_COUNT
      ] ??
      partitionRow?.[
        AUTHORITATIVE_ROUTING_OVERLAY_PARTITION_FIELD.REPLICA_COUNT_CAMEL
      ];
    const expectedReplicaCount = Number(
      partitionReplicaCount,
    );
    if (
      !Number.isFinite(expectedReplicaCount) ||
      expectedReplicaCount <= 0
    ) {
      return Object.freeze({
        state: AUTHORITATIVE_ROUTING_OVERLAY_SERVICE_COVERAGE_STATE.UNKNOWN,
        expectedReplicaCount: 0,
        observedServiceCount,
      });
    }
    const normalizedExpectedReplicaCount = Math.floor(expectedReplicaCount);
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

    const [partitionResult, serviceResult] = await Promise.all([
      authoritativeControlPlaneView.readRows(
        TABLES.PARTITIONS,
        `SELECT * FROM ${TABLES.PARTITIONS} WHERE ${COLUMN.PARTITION_ID} = ?`,
        [partitionId],
        {
          allowSqlFallback: false,
          replicaFallbackConsistency:
            LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
          queryTimeoutMs,
        },
      ),
      authoritativeControlPlaneView.readRows(
        TABLES.SERVICES,
        `SELECT * FROM ${TABLES.SERVICES} WHERE ${COLUMN.PARTITION_ID} = ? ` +
          `AND ${COLUMN.SERVICE_TYPE} = ?`,
        [partitionId, SERVICE_TYPE.PARTITION],
        {
          allowSqlFallback: false,
          replicaFallbackConsistency:
            LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
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
        };

    this.authoritativeRoutingOverlayEntries.set(partitionId, overlayEntry);

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
