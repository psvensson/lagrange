import {assignAdminServiceDiscoveryReadinessContextMethods} from './admin-service-discovery-readiness-context-methods.js';
import {assignAdminServiceDiscoveryReplicaReadinessMethods} from './admin-service-discovery-replica-readiness-methods.js';
import {assignAdminServiceDiscoveryTableReadinessMethods} from './admin-service-discovery-table-readiness-methods.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignAdminServiceDiscoveryReadinessMethods(
  AdminServiceDiscovery,
  options = {},
) {
  const {
    ADMIN_CACHE_DUMP,
    AUTHORITATIVE_DISCOVERY_CACHE_GAP_REASON_CODES,
    AUTHORITATIVE_DISCOVERY_REPAIR,
    EMPTY_STRING,
    NUM,
    TABLES,
    TYPEOF,
    evaluateAuthoritativeRepairPolicy,
    evaluateSharedMetadataNodeCoverage,
    normalizeDiscoveryTableId,
    normalizeIdentifier,
  } = options;

  class AdminServiceDiscoveryReadinessMethods {
    /**
     * Determine whether discovery snapshot warrants authoritative
     * cache repair.
     * @param {Object} snapshot
     * @param {Object} [options={}]
     * @return {boolean}
     */
    evaluateAuthoritativeDiscoveryRepair(snapshot, options = {}) {
      if (!this.canEvaluateAuthoritativeDiscoveryRepairSnapshot(snapshot)) {
        return null;
      }
      const freshness = this.resolveAuthoritativeDiscoveryRepairFreshness();
      const readinessSummary =
        this.collectAuthoritativeDiscoveryReplicaReadiness(snapshot.services);
      return evaluateAuthoritativeRepairPolicy({
        cacheStalenessMs: freshness.stalenessMs,
        staleThresholdMs: AUTHORITATIVE_DISCOVERY_REPAIR.STALE_THRESHOLD_MS,
        cacheRepairEligible: freshness.cacheRepairEligible,
        scopedQuery: this.isScopedAuthoritativeDiscoveryRepair(options),
        serviceCount: snapshot.serviceCount,
        replicaCount: snapshot.replicaCount,
        readyReplicaCount: readinessSummary.readyReplicaCount,
        selectedNodeCount: readinessSummary.selectedNodeIds.size,
        serviceEndpointsCount: this.resolveDiscoveryServiceEndpointsCount(),
        nodeCoverageGap:
          this.resolveDiscoveryMetadataNodeCoverage().hasCoverageGap,
        staleReplicaOpsInFlightCount: Number(
          snapshot?.replicaOperations?.staleInFlightCount,
        ),
        hasCacheGapReasons: readinessSummary.hasCacheGapReasons,
      });
    }

    canEvaluateAuthoritativeDiscoveryRepairSnapshot(snapshot) {
      return Boolean(
        this.systemTableCache &&
          this.cacheMutationTarget &&
          typeof this.cacheMutationTarget.applySystemTableChange ===
            TYPEOF.FUNCTION &&
          this.canReadAuthoritativeDiscoveryRows() &&
          snapshot &&
          typeof snapshot === TYPEOF.OBJECT,
      );
    }

    resolveAuthoritativeDiscoveryRepairFreshness() {
      const freshness = this.buildPreflightCacheFreshnessSummary ?
        this.buildPreflightCacheFreshnessSummary({
          capturedAtMs: Date.now(),
        }) :
        null;
      const stalenessMs = Number(freshness?.stalenessMs);
      return {
        stalenessMs,
        cacheRepairEligible:
          !Number.isFinite(stalenessMs) ||
          stalenessMs >= AUTHORITATIVE_DISCOVERY_REPAIR.STALE_THRESHOLD_MS,
      };
    }

    isScopedAuthoritativeDiscoveryRepair(options = {}) {
      return (
        normalizeIdentifier(options.tableName) !== null ||
        normalizeDiscoveryTableId(options.tableId) !== null
      );
    }

    collectAuthoritativeDiscoveryReplicaReadiness(services = []) {
      const readinessSummary = {
        readyReplicaCount: NUM.ZERO,
        selectedNodeIds: new Set(),
        hasCacheGapReasons: false,
      };
      for (const service of Array.isArray(services) ?
        services :
        ADMIN_CACHE_DUMP.EMPTY) {
        this.collectAuthoritativeDiscoveryReplicaReadinessForService(
          readinessSummary,
          service,
        );
      }
      return readinessSummary;
    }

    collectAuthoritativeDiscoveryReplicaReadinessForService(
      readinessSummary,
      service,
    ) {
      const replicas = Array.isArray(service?.replicas) ?
        service.replicas :
        ADMIN_CACHE_DUMP.EMPTY;
      for (const replica of replicas) {
        const readiness = replica?.readiness || null;
        if (!readiness || typeof readiness !== TYPEOF.OBJECT) {
          continue;
        }
        const reasons = Array.isArray(readiness.reasons) ?
          readiness.reasons :
          ADMIN_CACHE_DUMP.EMPTY;
        this.recordAuthoritativeDiscoveryReplicaReadiness(
          readinessSummary,
          replica,
          readiness,
          reasons,
        );
      }
    }

    recordAuthoritativeDiscoveryReplicaReadiness(
      readinessSummary,
      replica,
      readiness,
      reasons,
    ) {
      if (readiness.benchmarkReady === true || reasons.length === NUM.ZERO) {
        readinessSummary.readyReplicaCount += NUM.ONE;
        const nodeId = String(replica?.nodeId || EMPTY_STRING);
        if (nodeId) {
          readinessSummary.selectedNodeIds.add(nodeId);
        }
      }
      if (this.hasAuthoritativeDiscoveryCacheGapReason(reasons)) {
        readinessSummary.hasCacheGapReasons = true;
      }
    }

    hasAuthoritativeDiscoveryCacheGapReason(reasons = []) {
      for (const reason of Array.isArray(reasons) ?
        reasons :
        ADMIN_CACHE_DUMP.EMPTY) {
        const code = String(reason?.code || EMPTY_STRING);
        if (AUTHORITATIVE_DISCOVERY_CACHE_GAP_REASON_CODES.has(code)) {
          return true;
        }
      }
      return false;
    }

    resolveDiscoveryServiceEndpointsCount() {
      if (typeof this.systemTableCache.count === TYPEOF.FUNCTION) {
        return this.systemTableCache.count(TABLES.SERVICE_ENDPOINTS);
      }
      return this.systemTableCache.getAll(TABLES.SERVICE_ENDPOINTS).length;
    }

    resolveDiscoveryMetadataNodeCoverage() {
      return evaluateSharedMetadataNodeCoverage({
        nodeRows: this.systemTableCache.getAll(TABLES.NODES),
        serviceRows: this.systemTableCache.getAll(TABLES.SERVICES),
        partitionRows: this.systemTableCache.getAll(TABLES.PARTITIONS),
        nodeEndpointRows: this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS),
      });
    }
  }

  for (const methodName of Object.getOwnPropertyNames(
    AdminServiceDiscoveryReadinessMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      AdminServiceDiscovery.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        AdminServiceDiscoveryReadinessMethods.prototype,
        methodName,
      ),
    );
  }

  assignAdminServiceDiscoveryReadinessContextMethods(
    AdminServiceDiscovery,
    options,
  );
  assignAdminServiceDiscoveryTableReadinessMethods(
    AdminServiceDiscovery,
    options,
  );
  assignAdminServiceDiscoveryReplicaReadinessMethods(
    AdminServiceDiscovery,
    options,
  );
}

export {assignAdminServiceDiscoveryReadinessMethods};
