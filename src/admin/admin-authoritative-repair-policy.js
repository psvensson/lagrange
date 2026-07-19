import {TABLES} from '../constants/index.js';

const LOCAL_STR_STRING = 'string';

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
  PRIORITY_PLACEMENT_COMPLETION_HANDOFF_GAP:
    'priority_placement_completion_handoff_gap',
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
  COMPLETED_PLACEMENT_HANDOFF: Object.freeze([
    TABLES.PARTITIONS,
    TABLES.SERVICES,
    TABLES.TABLES,
    TABLES.REPLICA_OPERATIONS,
  ]),
});

const DISCOVERY_REPAIR_TRIGGERS = new Set([
  AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP,
  AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_EMPTY_WITH_SERVICES_PRESENT,
  AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_ZERO_SCOPED_REPLICAS,
  AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NO_READY_REPLICAS,
  AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_CACHE_GAP_REASON,
]);

const AUTHORITATIVE_REPAIR_TABLE_GROUP_BY_TRIGGER = Object.freeze({
  [AUTHORITATIVE_REPAIR_TRIGGER.STALE_REPLICA_OPERATIONS_IN_FLIGHT]:
    AUTHORITATIVE_REPAIR_TABLE_GROUP.REPLICA_OPERATIONS,
  [AUTHORITATIVE_REPAIR_TRIGGER.PARTITION_TOPOLOGY_GAP]:
    AUTHORITATIVE_REPAIR_TABLE_GROUP.TOPOLOGY,
  [AUTHORITATIVE_REPAIR_TRIGGER
    .PRIORITY_PLACEMENT_COMPLETION_HANDOFF_GAP]:
      AUTHORITATIVE_REPAIR_TABLE_GROUP.COMPLETED_PLACEMENT_HANDOFF,
});

function normalizeNonNegativeInteger(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function isCacheStalenessOverThreshold(stalenessMs, staleThresholdMs) {
  if (!Number.isFinite(staleThresholdMs) || staleThresholdMs <= 0) {
    return false;
  }
  const normalizedStalenessMs = Number(stalenessMs);
  if (!Number.isFinite(normalizedStalenessMs)) {
    return true;
  }
  return normalizedStalenessMs >= Math.floor(staleThresholdMs);
}

function resolveCacheStaleWatermark(options = {}) {
  if (typeof options.cacheStaleWatermark === 'boolean') {
    return options.cacheStaleWatermark;
  }
  return isCacheStalenessOverThreshold(
    options.cacheStalenessMs,
    options.staleThresholdMs,
  );
}

function hasDiscoverySelectionGap(selectedNodeCount, serviceEndpointsCount) {
  const normalizedSelectedNodeCount =
    normalizeNonNegativeInteger(selectedNodeCount);
  const normalizedServiceEndpointsCount =
    normalizeNonNegativeInteger(serviceEndpointsCount);
  return normalizedSelectedNodeCount === 0 &&
    normalizedServiceEndpointsCount > 0;
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
    if (typeof tableName === LOCAL_STR_STRING &&
        tableName.length > 0) {
      normalizedTargetTableNames.add(tableName);
    }
  }
  return normalizedTargetTableNames;
}

function resolveAuthoritativeRepairTableGroup(triggerCode, scopedQuery) {
  if (DISCOVERY_REPAIR_TRIGGERS.has(triggerCode)) {
    return scopedQuery ?
      AUTHORITATIVE_REPAIR_TABLE_GROUP.SCOPED_DISCOVERY :
      AUTHORITATIVE_REPAIR_TABLE_GROUP.DISCOVERY;
  }
  return AUTHORITATIVE_REPAIR_TABLE_GROUP_BY_TRIGGER[triggerCode] || null;
}

function normalizeAuthoritativeRepairTriggerCodes(triggerCodes) {
  return [
    ...new Set(
      (Array.isArray(triggerCodes) ? triggerCodes : [])
        .map((triggerCode) => String(triggerCode || ''))
        .filter(Boolean),
    ),
  ];
}

function resolveCacheStaleWatermarkTableName(options = {}) {
  return typeof options.cacheStaleWatermarkTableName === LOCAL_STR_STRING &&
    DEFAULT_AUTHORITATIVE_REPAIR_TABLES.includes(
      options.cacheStaleWatermarkTableName,
    ) ?
    options.cacheStaleWatermarkTableName :
    null;
}

function isSingleTableStaleWatermarkRepair(
  triggerCodes,
  cacheStaleWatermarkTableName,
) {
  return triggerCodes.length === 1 &&
    triggerCodes[0] ===
      AUTHORITATIVE_REPAIR_TRIGGER.CACHE_STALE_WATERMARK &&
    Boolean(cacheStaleWatermarkTableName);
}

function hasCoupledStaleOperationRepair(triggerCodes) {
  return triggerCodes.includes(
    AUTHORITATIVE_REPAIR_TRIGGER.CACHE_STALE_WATERMARK,
  ) && triggerCodes.includes(
    AUTHORITATIVE_REPAIR_TRIGGER.STALE_REPLICA_OPERATIONS_IN_FLIGHT,
  );
}

function selectEffectiveAuthoritativeRepairTriggerCodes(triggerCodes) {
  const narrowedTriggerCodes = triggerCodes.filter((triggerCode) =>
    triggerCode !== AUTHORITATIVE_REPAIR_TRIGGER.CACHE_STALE_WATERMARK);
  return narrowedTriggerCodes.length > 0 ?
    narrowedTriggerCodes :
    triggerCodes;
}

function deriveAuthoritativeRepairTables(options = {}) {
  const scopedQuery = options.scopedQuery === true;
  const triggerCodes = normalizeAuthoritativeRepairTriggerCodes(
    options.triggerCodes,
  );
  const cacheStaleWatermarkTableName =
    resolveCacheStaleWatermarkTableName(options);
  if (isSingleTableStaleWatermarkRepair(
    triggerCodes,
    cacheStaleWatermarkTableName,
  )) {
    return [cacheStaleWatermarkTableName];
  }
  if (hasCoupledStaleOperationRepair(triggerCodes)) {
    return [...DEFAULT_AUTHORITATIVE_REPAIR_TABLES];
  }
  const effectiveTriggerCodes =
    selectEffectiveAuthoritativeRepairTriggerCodes(triggerCodes);
  if (effectiveTriggerCodes.length === 0) {
    return [...DEFAULT_AUTHORITATIVE_REPAIR_TABLES];
  }

  const repairTables = new Set();
  for (const triggerCode of effectiveTriggerCodes) {
    const tableGroup = resolveAuthoritativeRepairTableGroup(
      triggerCode,
      scopedQuery,
    );
    if (!tableGroup) {
      return [...DEFAULT_AUTHORITATIVE_REPAIR_TABLES];
    }
    addRepairTables(repairTables, tableGroup);
  }

  if (repairTables.size === 0) {
    return [...DEFAULT_AUTHORITATIVE_REPAIR_TABLES];
  }
  return DEFAULT_AUTHORITATIVE_REPAIR_TABLES
    .filter((tableName) => repairTables.has(tableName));
}

function appendAuthoritativeRepairTrigger(
  triggerCodes,
  shouldAppend,
  triggerCode,
) {
  if (shouldAppend) {
    triggerCodes.push(triggerCode);
  }
}

function evaluateAuthoritativeRepairPolicy(options = {}) {
  const triggerCodes = [];
  const scopedQuery = options.scopedQuery === true;
  const allowScopedStaleWatermarkRepair =
    options.allowScopedStaleWatermarkRepair === true;
  const cacheStaleWatermark = resolveCacheStaleWatermark(options);
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

  appendAuthoritativeRepairTrigger(
    triggerCodes,
    options.priorityPlacementCompletionHandoffGap === true,
    AUTHORITATIVE_REPAIR_TRIGGER
      .PRIORITY_PLACEMENT_COMPLETION_HANDOFF_GAP,
  );

  if (normalizeNonNegativeInteger(
    options.staleReplicaOpsInFlightCount,
  ) > 0) {
    triggerCodes.push(
      AUTHORITATIVE_REPAIR_TRIGGER
        .STALE_REPLICA_OPERATIONS_IN_FLIGHT,
    );
  }

  const serviceCount = normalizeNonNegativeInteger(options.serviceCount);
  const replicaCount = normalizeNonNegativeInteger(options.replicaCount);
  if (scopedQuery &&
      (serviceCount === 0 || replicaCount === 0)) {
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
      readyReplicaCount === 0) {
    triggerCodes.push(
      AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NO_READY_REPLICAS,
    );
  }

  return Object.freeze({
    shouldRepair: triggerCodes.length > 0,
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
