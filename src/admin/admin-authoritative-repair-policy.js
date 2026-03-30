import {NUM, TABLES} from '../constants/index.js';

const AUTHORITATIVE_REPAIR_TRIGGER = Object.freeze({
  CACHE_STALE_WATERMARK: 'cache_stale_watermark',
  DISCOVERY_EMPTY_WITH_SERVICES_PRESENT:
    'discovery_empty_with_services_present',
  DISCOVERY_NODE_COVERAGE_GAP:
    'discovery_node_coverage_gap',
  DISCOVERY_ZERO_SCOPED_REPLICAS: 'discovery_zero_scoped_replicas',
  DISCOVERY_NO_READY_REPLICAS: 'discovery_no_ready_replicas',
  DISCOVERY_CACHE_GAP_REASON: 'discovery_cache_gap_reason',
  STALE_REPLICA_OPERATIONS_IN_FLIGHT:
    'stale_replica_operations_in_flight',
  PARTITION_TOPOLOGY_GAP: 'partition_topology_gap',
});

const DEFAULT_AUTHORITATIVE_REPAIR_TABLES = Object.freeze([
  TABLES.NODES,
  TABLES.PARTITIONS,
  TABLES.SERVICES,
  TABLES.TABLES,
  TABLES.CONTROL_PLANE_PUBLICATIONS,
  TABLES.NODE_ENDPOINTS,
  TABLES.SERVICE_DEFINITIONS,
  TABLES.SERVICE_ENDPOINTS,
  TABLES.REPLICA_OPERATIONS,
]);

const AUTHORITATIVE_REPAIR_TABLE_GROUP = Object.freeze({
  TOPOLOGY: Object.freeze([
    TABLES.PARTITIONS,
    TABLES.SERVICES,
    TABLES.TABLES,
  ]),
  DISCOVERY: Object.freeze([
    TABLES.NODES,
    TABLES.PARTITIONS,
    TABLES.SERVICES,
    TABLES.TABLES,
    TABLES.CONTROL_PLANE_PUBLICATIONS,
    TABLES.NODE_ENDPOINTS,
    TABLES.SERVICE_DEFINITIONS,
    TABLES.SERVICE_ENDPOINTS,
  ]),
  SCOPED_DISCOVERY: Object.freeze([
    TABLES.NODES,
    TABLES.PARTITIONS,
    TABLES.SERVICES,
    TABLES.TABLES,
    TABLES.SERVICE_DEFINITIONS,
    TABLES.SERVICE_ENDPOINTS,
  ]),
  REPLICA_OPERATIONS: Object.freeze([
    TABLES.REPLICA_OPERATIONS,
  ]),
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

function addRepairTables(targetTableNames, tableNames) {
  const normalizedTargetTableNames =
    targetTableNames instanceof Set ?
      targetTableNames :
      new Set();
  const normalizedTableNames = Array.isArray(tableNames) ?
    tableNames :
    DEFAULT_AUTHORITATIVE_REPAIR_TABLES;
  for (const tableName of normalizedTableNames) {
    if (typeof tableName === 'string' &&
        tableName.length > NUM.ZERO) {
      normalizedTargetTableNames.add(tableName);
    }
  }
  return normalizedTargetTableNames;
}

function deriveAuthoritativeRepairTables(options = {}) {
  const scopedQuery = options.scopedQuery === true;
  const triggerCodes = Array.isArray(options.triggerCodes) ?
    options.triggerCodes
      .map((triggerCode) => String(triggerCode || ''))
      .filter(Boolean) :
    [];
  const uniqueTriggerCodes = [...new Set(triggerCodes)];
  const narrowedTriggerCodes = uniqueTriggerCodes.filter((triggerCode) =>
    triggerCode !== AUTHORITATIVE_REPAIR_TRIGGER.CACHE_STALE_WATERMARK);
  const effectiveTriggerCodes = narrowedTriggerCodes.length > NUM.ZERO ?
    narrowedTriggerCodes :
    uniqueTriggerCodes;
  if (effectiveTriggerCodes.length === NUM.ZERO) {
    return [...DEFAULT_AUTHORITATIVE_REPAIR_TABLES];
  }

  const repairTables = new Set();
  for (const triggerCode of effectiveTriggerCodes) {
    if (triggerCode ===
        AUTHORITATIVE_REPAIR_TRIGGER.STALE_REPLICA_OPERATIONS_IN_FLIGHT) {
      addRepairTables(
        repairTables,
        AUTHORITATIVE_REPAIR_TABLE_GROUP.REPLICA_OPERATIONS,
      );
      continue;
    }
    if (triggerCode ===
        AUTHORITATIVE_REPAIR_TRIGGER.PARTITION_TOPOLOGY_GAP) {
      addRepairTables(
        repairTables,
        AUTHORITATIVE_REPAIR_TABLE_GROUP.TOPOLOGY,
      );
      continue;
    }
    if (triggerCode ===
        AUTHORITATIVE_REPAIR_TRIGGER
          .DISCOVERY_NODE_COVERAGE_GAP ||
        triggerCode ===
        AUTHORITATIVE_REPAIR_TRIGGER
          .DISCOVERY_EMPTY_WITH_SERVICES_PRESENT ||
        triggerCode ===
          AUTHORITATIVE_REPAIR_TRIGGER
            .DISCOVERY_ZERO_SCOPED_REPLICAS ||
        triggerCode ===
          AUTHORITATIVE_REPAIR_TRIGGER
            .DISCOVERY_NO_READY_REPLICAS ||
        triggerCode ===
          AUTHORITATIVE_REPAIR_TRIGGER
            .DISCOVERY_CACHE_GAP_REASON) {
      addRepairTables(
        repairTables,
        scopedQuery === true ?
          AUTHORITATIVE_REPAIR_TABLE_GROUP.SCOPED_DISCOVERY :
          AUTHORITATIVE_REPAIR_TABLE_GROUP.DISCOVERY,
      );
      continue;
    }

    return [...DEFAULT_AUTHORITATIVE_REPAIR_TABLES];
  }

  if (repairTables.size === NUM.ZERO) {
    return [...DEFAULT_AUTHORITATIVE_REPAIR_TABLES];
  }
  return DEFAULT_AUTHORITATIVE_REPAIR_TABLES
    .filter((tableName) => repairTables.has(tableName));
}

function evaluateAuthoritativeRepairPolicy(options = {}) {
  const triggerCodes = [];
  const scopedQuery = options.scopedQuery === true;
  const allowScopedStaleWatermarkRepair =
    options.allowScopedStaleWatermarkRepair === true;
  const cacheStaleWatermark = isCacheStalenessOverThreshold(
    options.cacheStalenessMs,
    options.staleThresholdMs,
  );
  const shouldTriggerStaleWatermarkRepair = cacheStaleWatermark &&
    (!scopedQuery || allowScopedStaleWatermarkRepair);
  if (shouldTriggerStaleWatermarkRepair) {
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

  if (options.nodeCoverageGap === true) {
    triggerCodes.push(
      AUTHORITATIVE_REPAIR_TRIGGER
        .DISCOVERY_NODE_COVERAGE_GAP,
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
  DEFAULT_AUTHORITATIVE_REPAIR_TABLES,
  deriveAuthoritativeRepairTables,
  evaluateAuthoritativeRepairPolicy,
  hasDiscoverySelectionGap,
  isCacheStalenessOverThreshold,
};
