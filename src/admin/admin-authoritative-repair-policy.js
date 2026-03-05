import {NUM} from '../constants/index.js';

const AUTHORITATIVE_REPAIR_TRIGGER = Object.freeze({
  CACHE_STALE_WATERMARK: 'cache_stale_watermark',
  DISCOVERY_EMPTY_WITH_SERVICES_PRESENT:
    'discovery_empty_with_services_present',
  DISCOVERY_ZERO_SCOPED_REPLICAS: 'discovery_zero_scoped_replicas',
  DISCOVERY_NO_READY_REPLICAS: 'discovery_no_ready_replicas',
  DISCOVERY_CACHE_GAP_REASON: 'discovery_cache_gap_reason',
  STALE_REPLICA_OPERATIONS_IN_FLIGHT:
    'stale_replica_operations_in_flight',
  PARTITION_TOPOLOGY_GAP: 'partition_topology_gap',
});

function normalizeNonNegativeInteger(value) {
  if (!Number.isFinite(value)) {
    return NUM.ZERO;
  }
  return Math.max(NUM.ZERO, Math.floor(value));
}

function isCacheStalenessOverThreshold(stalenessMs, staleThresholdMs) {
  if (!Number.isFinite(staleThresholdMs) || staleThresholdMs <= NUM.ZERO) {
    return false;
  }
  const normalizedStalenessMs = Number(stalenessMs);
  if (!Number.isFinite(normalizedStalenessMs)) {
    return true;
  }
  return normalizedStalenessMs >= Math.floor(staleThresholdMs);
}

function hasDiscoverySelectionGap(selectedNodeCount, serviceEndpointsCount) {
  const normalizedSelectedNodeCount =
    normalizeNonNegativeInteger(selectedNodeCount);
  const normalizedServiceEndpointsCount =
    normalizeNonNegativeInteger(serviceEndpointsCount);
  return normalizedSelectedNodeCount === NUM.ZERO &&
    normalizedServiceEndpointsCount > NUM.ZERO;
}

function evaluateAuthoritativeRepairPolicy(options = {}) {
  const triggerCodes = [];
  const cacheStaleWatermark = isCacheStalenessOverThreshold(
    options.cacheStalenessMs,
    options.staleThresholdMs,
  );
  if (cacheStaleWatermark) {
    triggerCodes.push(
      AUTHORITATIVE_REPAIR_TRIGGER.CACHE_STALE_WATERMARK,
    );
  }

  const selectionGap = hasDiscoverySelectionGap(
    options.selectedNodeCount,
    options.serviceEndpointsCount,
  );
  if (selectionGap) {
    triggerCodes.push(
      AUTHORITATIVE_REPAIR_TRIGGER
        .DISCOVERY_EMPTY_WITH_SERVICES_PRESENT,
    );
  }

  if (options.topologyGap === true) {
    triggerCodes.push(
      AUTHORITATIVE_REPAIR_TRIGGER.PARTITION_TOPOLOGY_GAP,
    );
  }

  if (normalizeNonNegativeInteger(
    options.staleReplicaOpsInFlightCount,
  ) > NUM.ZERO) {
    triggerCodes.push(
      AUTHORITATIVE_REPAIR_TRIGGER
        .STALE_REPLICA_OPERATIONS_IN_FLIGHT,
    );
  }

  const serviceCount = normalizeNonNegativeInteger(options.serviceCount);
  const replicaCount = normalizeNonNegativeInteger(options.replicaCount);
  const scopedQuery = options.scopedQuery === true;
  if (scopedQuery &&
      (serviceCount === NUM.ZERO || replicaCount === NUM.ZERO)) {
    triggerCodes.push(
      AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_ZERO_SCOPED_REPLICAS,
    );
  }

  if (options.hasCacheGapReasons === true &&
      (options.cacheRepairEligible === true ||
        cacheStaleWatermark === true)) {
    triggerCodes.push(
      AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_CACHE_GAP_REASON,
    );
  }

  const readyReplicaCount =
    normalizeNonNegativeInteger(options.readyReplicaCount);
  if (!scopedQuery &&
      options.cacheRepairEligible === true &&
      readyReplicaCount === NUM.ZERO) {
    triggerCodes.push(
      AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NO_READY_REPLICAS,
    );
  }

  return Object.freeze({
    shouldRepair: triggerCodes.length > NUM.ZERO,
    triggerCodes: Object.freeze(triggerCodes),
  });
}

export {
  AUTHORITATIVE_REPAIR_TRIGGER,
  evaluateAuthoritativeRepairPolicy,
  hasDiscoverySelectionGap,
  isCacheStalenessOverThreshold,
};
