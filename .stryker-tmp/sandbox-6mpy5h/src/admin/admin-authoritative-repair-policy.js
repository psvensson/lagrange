// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { NUM, TABLES } from '../constants/index.js';
const AUTHORITATIVE_REPAIR_TRIGGER = Object.freeze(stryMutAct_9fa48("434") ? {} : (stryCov_9fa48("434"), {
  CACHE_STALE_WATERMARK: stryMutAct_9fa48("435") ? "" : (stryCov_9fa48("435"), 'cache_stale_watermark'),
  DISCOVERY_EMPTY_WITH_SERVICES_PRESENT: stryMutAct_9fa48("436") ? "" : (stryCov_9fa48("436"), 'discovery_empty_with_services_present'),
  DISCOVERY_NODE_COVERAGE_GAP: stryMutAct_9fa48("437") ? "" : (stryCov_9fa48("437"), 'discovery_node_coverage_gap'),
  DISCOVERY_ZERO_SCOPED_REPLICAS: stryMutAct_9fa48("438") ? "" : (stryCov_9fa48("438"), 'discovery_zero_scoped_replicas'),
  DISCOVERY_NO_READY_REPLICAS: stryMutAct_9fa48("439") ? "" : (stryCov_9fa48("439"), 'discovery_no_ready_replicas'),
  DISCOVERY_CACHE_GAP_REASON: stryMutAct_9fa48("440") ? "" : (stryCov_9fa48("440"), 'discovery_cache_gap_reason'),
  STALE_REPLICA_OPERATIONS_IN_FLIGHT: stryMutAct_9fa48("441") ? "" : (stryCov_9fa48("441"), 'stale_replica_operations_in_flight'),
  PARTITION_TOPOLOGY_GAP: stryMutAct_9fa48("442") ? "" : (stryCov_9fa48("442"), 'partition_topology_gap')
}));
const DEFAULT_AUTHORITATIVE_REPAIR_TABLES = Object.freeze(stryMutAct_9fa48("443") ? [] : (stryCov_9fa48("443"), [TABLES.NODES, TABLES.PARTITIONS, TABLES.SERVICES, TABLES.TABLES, TABLES.CONTROL_PLANE_PUBLICATIONS, TABLES.NODE_ENDPOINTS, TABLES.SERVICE_DEFINITIONS, TABLES.SERVICE_ENDPOINTS, TABLES.REPLICA_OPERATIONS]));
const AUTHORITATIVE_REPAIR_TABLE_GROUP = Object.freeze(stryMutAct_9fa48("444") ? {} : (stryCov_9fa48("444"), {
  TOPOLOGY: Object.freeze(stryMutAct_9fa48("445") ? [] : (stryCov_9fa48("445"), [TABLES.PARTITIONS, TABLES.SERVICES, TABLES.TABLES])),
  DISCOVERY: Object.freeze(stryMutAct_9fa48("446") ? [] : (stryCov_9fa48("446"), [TABLES.NODES, TABLES.PARTITIONS, TABLES.SERVICES, TABLES.TABLES, TABLES.CONTROL_PLANE_PUBLICATIONS, TABLES.NODE_ENDPOINTS, TABLES.SERVICE_DEFINITIONS, TABLES.SERVICE_ENDPOINTS])),
  SCOPED_DISCOVERY: Object.freeze(stryMutAct_9fa48("447") ? [] : (stryCov_9fa48("447"), [TABLES.NODES, TABLES.PARTITIONS, TABLES.SERVICES, TABLES.TABLES, TABLES.SERVICE_DEFINITIONS, TABLES.SERVICE_ENDPOINTS])),
  REPLICA_OPERATIONS: Object.freeze(stryMutAct_9fa48("448") ? [] : (stryCov_9fa48("448"), [TABLES.REPLICA_OPERATIONS]))
}));
function normalizeNonNegativeInteger(value) {
  if (stryMutAct_9fa48("449")) {
    {}
  } else {
    stryCov_9fa48("449");
    if (stryMutAct_9fa48("452") ? false : stryMutAct_9fa48("451") ? true : stryMutAct_9fa48("450") ? Number.isFinite(value) : (stryCov_9fa48("450", "451", "452"), !Number.isFinite(value))) {
      if (stryMutAct_9fa48("453")) {
        {}
      } else {
        stryCov_9fa48("453");
        return NUM.ZERO;
      }
    }
    return stryMutAct_9fa48("454") ? Math.min(NUM.ZERO, Math.floor(value)) : (stryCov_9fa48("454"), Math.max(NUM.ZERO, Math.floor(value)));
  }
}
function isCacheStalenessOverThreshold(stalenessMs, staleThresholdMs) {
  if (stryMutAct_9fa48("455")) {
    {}
  } else {
    stryCov_9fa48("455");
    if (stryMutAct_9fa48("458") ? !Number.isFinite(staleThresholdMs) && staleThresholdMs <= NUM.ZERO : stryMutAct_9fa48("457") ? false : stryMutAct_9fa48("456") ? true : (stryCov_9fa48("456", "457", "458"), (stryMutAct_9fa48("459") ? Number.isFinite(staleThresholdMs) : (stryCov_9fa48("459"), !Number.isFinite(staleThresholdMs))) || (stryMutAct_9fa48("462") ? staleThresholdMs > NUM.ZERO : stryMutAct_9fa48("461") ? staleThresholdMs < NUM.ZERO : stryMutAct_9fa48("460") ? false : (stryCov_9fa48("460", "461", "462"), staleThresholdMs <= NUM.ZERO)))) {
      if (stryMutAct_9fa48("463")) {
        {}
      } else {
        stryCov_9fa48("463");
        return stryMutAct_9fa48("464") ? true : (stryCov_9fa48("464"), false);
      }
    }
    const normalizedStalenessMs = Number(stalenessMs);
    if (stryMutAct_9fa48("467") ? false : stryMutAct_9fa48("466") ? true : stryMutAct_9fa48("465") ? Number.isFinite(normalizedStalenessMs) : (stryCov_9fa48("465", "466", "467"), !Number.isFinite(normalizedStalenessMs))) {
      if (stryMutAct_9fa48("468")) {
        {}
      } else {
        stryCov_9fa48("468");
        return stryMutAct_9fa48("469") ? false : (stryCov_9fa48("469"), true);
      }
    }
    return stryMutAct_9fa48("473") ? normalizedStalenessMs < Math.floor(staleThresholdMs) : stryMutAct_9fa48("472") ? normalizedStalenessMs > Math.floor(staleThresholdMs) : stryMutAct_9fa48("471") ? false : stryMutAct_9fa48("470") ? true : (stryCov_9fa48("470", "471", "472", "473"), normalizedStalenessMs >= Math.floor(staleThresholdMs));
  }
}
function hasDiscoverySelectionGap(selectedNodeCount, serviceEndpointsCount) {
  if (stryMutAct_9fa48("474")) {
    {}
  } else {
    stryCov_9fa48("474");
    const normalizedSelectedNodeCount = normalizeNonNegativeInteger(selectedNodeCount);
    const normalizedServiceEndpointsCount = normalizeNonNegativeInteger(serviceEndpointsCount);
    return stryMutAct_9fa48("477") ? normalizedSelectedNodeCount === NUM.ZERO || normalizedServiceEndpointsCount > NUM.ZERO : stryMutAct_9fa48("476") ? false : stryMutAct_9fa48("475") ? true : (stryCov_9fa48("475", "476", "477"), (stryMutAct_9fa48("479") ? normalizedSelectedNodeCount !== NUM.ZERO : stryMutAct_9fa48("478") ? true : (stryCov_9fa48("478", "479"), normalizedSelectedNodeCount === NUM.ZERO)) && (stryMutAct_9fa48("482") ? normalizedServiceEndpointsCount <= NUM.ZERO : stryMutAct_9fa48("481") ? normalizedServiceEndpointsCount >= NUM.ZERO : stryMutAct_9fa48("480") ? true : (stryCov_9fa48("480", "481", "482"), normalizedServiceEndpointsCount > NUM.ZERO)));
  }
}
function addRepairTables(targetTableNames, tableNames) {
  if (stryMutAct_9fa48("483")) {
    {}
  } else {
    stryCov_9fa48("483");
    const normalizedTargetTableNames = targetTableNames instanceof Set ? targetTableNames : new Set();
    const normalizedTableNames = Array.isArray(tableNames) ? tableNames : DEFAULT_AUTHORITATIVE_REPAIR_TABLES;
    for (const tableName of normalizedTableNames) {
      if (stryMutAct_9fa48("484")) {
        {}
      } else {
        stryCov_9fa48("484");
        if (stryMutAct_9fa48("487") ? typeof tableName === 'string' || tableName.length > NUM.ZERO : stryMutAct_9fa48("486") ? false : stryMutAct_9fa48("485") ? true : (stryCov_9fa48("485", "486", "487"), (stryMutAct_9fa48("489") ? typeof tableName !== 'string' : stryMutAct_9fa48("488") ? true : (stryCov_9fa48("488", "489"), typeof tableName === (stryMutAct_9fa48("490") ? "" : (stryCov_9fa48("490"), 'string')))) && (stryMutAct_9fa48("493") ? tableName.length <= NUM.ZERO : stryMutAct_9fa48("492") ? tableName.length >= NUM.ZERO : stryMutAct_9fa48("491") ? true : (stryCov_9fa48("491", "492", "493"), tableName.length > NUM.ZERO)))) {
          if (stryMutAct_9fa48("494")) {
            {}
          } else {
            stryCov_9fa48("494");
            normalizedTargetTableNames.add(tableName);
          }
        }
      }
    }
    return normalizedTargetTableNames;
  }
}
function deriveAuthoritativeRepairTables(options = {}) {
  if (stryMutAct_9fa48("495")) {
    {}
  } else {
    stryCov_9fa48("495");
    const scopedQuery = stryMutAct_9fa48("498") ? options.scopedQuery !== true : stryMutAct_9fa48("497") ? false : stryMutAct_9fa48("496") ? true : (stryCov_9fa48("496", "497", "498"), options.scopedQuery === (stryMutAct_9fa48("499") ? false : (stryCov_9fa48("499"), true)));
    const triggerCodes = Array.isArray(options.triggerCodes) ? stryMutAct_9fa48("500") ? options.triggerCodes.map(triggerCode => String(triggerCode || '')) : (stryCov_9fa48("500"), options.triggerCodes.map(stryMutAct_9fa48("501") ? () => undefined : (stryCov_9fa48("501"), triggerCode => String(stryMutAct_9fa48("504") ? triggerCode && '' : stryMutAct_9fa48("503") ? false : stryMutAct_9fa48("502") ? true : (stryCov_9fa48("502", "503", "504"), triggerCode || (stryMutAct_9fa48("505") ? "Stryker was here!" : (stryCov_9fa48("505"), '')))))).filter(Boolean)) : stryMutAct_9fa48("506") ? ["Stryker was here"] : (stryCov_9fa48("506"), []);
    const uniqueTriggerCodes = stryMutAct_9fa48("507") ? [] : (stryCov_9fa48("507"), [...new Set(triggerCodes)]);
    const narrowedTriggerCodes = stryMutAct_9fa48("508") ? uniqueTriggerCodes : (stryCov_9fa48("508"), uniqueTriggerCodes.filter(stryMutAct_9fa48("509") ? () => undefined : (stryCov_9fa48("509"), triggerCode => stryMutAct_9fa48("512") ? triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.CACHE_STALE_WATERMARK : stryMutAct_9fa48("511") ? false : stryMutAct_9fa48("510") ? true : (stryCov_9fa48("510", "511", "512"), triggerCode !== AUTHORITATIVE_REPAIR_TRIGGER.CACHE_STALE_WATERMARK))));
    const effectiveTriggerCodes = (stryMutAct_9fa48("516") ? narrowedTriggerCodes.length <= NUM.ZERO : stryMutAct_9fa48("515") ? narrowedTriggerCodes.length >= NUM.ZERO : stryMutAct_9fa48("514") ? false : stryMutAct_9fa48("513") ? true : (stryCov_9fa48("513", "514", "515", "516"), narrowedTriggerCodes.length > NUM.ZERO)) ? narrowedTriggerCodes : uniqueTriggerCodes;
    if (stryMutAct_9fa48("519") ? effectiveTriggerCodes.length !== NUM.ZERO : stryMutAct_9fa48("518") ? false : stryMutAct_9fa48("517") ? true : (stryCov_9fa48("517", "518", "519"), effectiveTriggerCodes.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("520")) {
        {}
      } else {
        stryCov_9fa48("520");
        return stryMutAct_9fa48("521") ? [] : (stryCov_9fa48("521"), [...DEFAULT_AUTHORITATIVE_REPAIR_TABLES]);
      }
    }
    const repairTables = new Set();
    for (const triggerCode of effectiveTriggerCodes) {
      if (stryMutAct_9fa48("522")) {
        {}
      } else {
        stryCov_9fa48("522");
        if (stryMutAct_9fa48("525") ? triggerCode !== AUTHORITATIVE_REPAIR_TRIGGER.STALE_REPLICA_OPERATIONS_IN_FLIGHT : stryMutAct_9fa48("524") ? false : stryMutAct_9fa48("523") ? true : (stryCov_9fa48("523", "524", "525"), triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.STALE_REPLICA_OPERATIONS_IN_FLIGHT)) {
          if (stryMutAct_9fa48("526")) {
            {}
          } else {
            stryCov_9fa48("526");
            addRepairTables(repairTables, AUTHORITATIVE_REPAIR_TABLE_GROUP.REPLICA_OPERATIONS);
            continue;
          }
        }
        if (stryMutAct_9fa48("529") ? triggerCode !== AUTHORITATIVE_REPAIR_TRIGGER.PARTITION_TOPOLOGY_GAP : stryMutAct_9fa48("528") ? false : stryMutAct_9fa48("527") ? true : (stryCov_9fa48("527", "528", "529"), triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.PARTITION_TOPOLOGY_GAP)) {
          if (stryMutAct_9fa48("530")) {
            {}
          } else {
            stryCov_9fa48("530");
            addRepairTables(repairTables, AUTHORITATIVE_REPAIR_TABLE_GROUP.TOPOLOGY);
            continue;
          }
        }
        if (stryMutAct_9fa48("533") ? (triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP || triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_EMPTY_WITH_SERVICES_PRESENT || triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_ZERO_SCOPED_REPLICAS || triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NO_READY_REPLICAS) && triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_CACHE_GAP_REASON : stryMutAct_9fa48("532") ? false : stryMutAct_9fa48("531") ? true : (stryCov_9fa48("531", "532", "533"), (stryMutAct_9fa48("535") ? (triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP || triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_EMPTY_WITH_SERVICES_PRESENT || triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_ZERO_SCOPED_REPLICAS) && triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NO_READY_REPLICAS : stryMutAct_9fa48("534") ? false : (stryCov_9fa48("534", "535"), (stryMutAct_9fa48("537") ? (triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP || triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_EMPTY_WITH_SERVICES_PRESENT) && triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_ZERO_SCOPED_REPLICAS : stryMutAct_9fa48("536") ? false : (stryCov_9fa48("536", "537"), (stryMutAct_9fa48("539") ? triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP && triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_EMPTY_WITH_SERVICES_PRESENT : stryMutAct_9fa48("538") ? false : (stryCov_9fa48("538", "539"), (stryMutAct_9fa48("541") ? triggerCode !== AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP : stryMutAct_9fa48("540") ? false : (stryCov_9fa48("540", "541"), triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP)) || (stryMutAct_9fa48("543") ? triggerCode !== AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_EMPTY_WITH_SERVICES_PRESENT : stryMutAct_9fa48("542") ? false : (stryCov_9fa48("542", "543"), triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_EMPTY_WITH_SERVICES_PRESENT)))) || (stryMutAct_9fa48("545") ? triggerCode !== AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_ZERO_SCOPED_REPLICAS : stryMutAct_9fa48("544") ? false : (stryCov_9fa48("544", "545"), triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_ZERO_SCOPED_REPLICAS)))) || (stryMutAct_9fa48("547") ? triggerCode !== AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NO_READY_REPLICAS : stryMutAct_9fa48("546") ? false : (stryCov_9fa48("546", "547"), triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NO_READY_REPLICAS)))) || (stryMutAct_9fa48("549") ? triggerCode !== AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_CACHE_GAP_REASON : stryMutAct_9fa48("548") ? false : (stryCov_9fa48("548", "549"), triggerCode === AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_CACHE_GAP_REASON)))) {
          if (stryMutAct_9fa48("550")) {
            {}
          } else {
            stryCov_9fa48("550");
            addRepairTables(repairTables, (stryMutAct_9fa48("553") ? scopedQuery !== true : stryMutAct_9fa48("552") ? false : stryMutAct_9fa48("551") ? true : (stryCov_9fa48("551", "552", "553"), scopedQuery === (stryMutAct_9fa48("554") ? false : (stryCov_9fa48("554"), true)))) ? AUTHORITATIVE_REPAIR_TABLE_GROUP.SCOPED_DISCOVERY : AUTHORITATIVE_REPAIR_TABLE_GROUP.DISCOVERY);
            continue;
          }
        }
        return stryMutAct_9fa48("555") ? [] : (stryCov_9fa48("555"), [...DEFAULT_AUTHORITATIVE_REPAIR_TABLES]);
      }
    }
    if (stryMutAct_9fa48("558") ? repairTables.size !== NUM.ZERO : stryMutAct_9fa48("557") ? false : stryMutAct_9fa48("556") ? true : (stryCov_9fa48("556", "557", "558"), repairTables.size === NUM.ZERO)) {
      if (stryMutAct_9fa48("559")) {
        {}
      } else {
        stryCov_9fa48("559");
        return stryMutAct_9fa48("560") ? [] : (stryCov_9fa48("560"), [...DEFAULT_AUTHORITATIVE_REPAIR_TABLES]);
      }
    }
    return stryMutAct_9fa48("561") ? DEFAULT_AUTHORITATIVE_REPAIR_TABLES : (stryCov_9fa48("561"), DEFAULT_AUTHORITATIVE_REPAIR_TABLES.filter(stryMutAct_9fa48("562") ? () => undefined : (stryCov_9fa48("562"), tableName => repairTables.has(tableName))));
  }
}
function evaluateAuthoritativeRepairPolicy(options = {}) {
  if (stryMutAct_9fa48("563")) {
    {}
  } else {
    stryCov_9fa48("563");
    const triggerCodes = stryMutAct_9fa48("564") ? ["Stryker was here"] : (stryCov_9fa48("564"), []);
    const scopedQuery = stryMutAct_9fa48("567") ? options.scopedQuery !== true : stryMutAct_9fa48("566") ? false : stryMutAct_9fa48("565") ? true : (stryCov_9fa48("565", "566", "567"), options.scopedQuery === (stryMutAct_9fa48("568") ? false : (stryCov_9fa48("568"), true)));
    const allowScopedStaleWatermarkRepair = stryMutAct_9fa48("571") ? options.allowScopedStaleWatermarkRepair !== true : stryMutAct_9fa48("570") ? false : stryMutAct_9fa48("569") ? true : (stryCov_9fa48("569", "570", "571"), options.allowScopedStaleWatermarkRepair === (stryMutAct_9fa48("572") ? false : (stryCov_9fa48("572"), true)));
    const cacheStaleWatermark = isCacheStalenessOverThreshold(options.cacheStalenessMs, options.staleThresholdMs);
    const shouldTriggerStaleWatermarkRepair = stryMutAct_9fa48("575") ? cacheStaleWatermark || !scopedQuery || allowScopedStaleWatermarkRepair : stryMutAct_9fa48("574") ? false : stryMutAct_9fa48("573") ? true : (stryCov_9fa48("573", "574", "575"), cacheStaleWatermark && (stryMutAct_9fa48("577") ? !scopedQuery && allowScopedStaleWatermarkRepair : stryMutAct_9fa48("576") ? true : (stryCov_9fa48("576", "577"), (stryMutAct_9fa48("578") ? scopedQuery : (stryCov_9fa48("578"), !scopedQuery)) || allowScopedStaleWatermarkRepair)));
    if (stryMutAct_9fa48("580") ? false : stryMutAct_9fa48("579") ? true : (stryCov_9fa48("579", "580"), shouldTriggerStaleWatermarkRepair)) {
      if (stryMutAct_9fa48("581")) {
        {}
      } else {
        stryCov_9fa48("581");
        triggerCodes.push(AUTHORITATIVE_REPAIR_TRIGGER.CACHE_STALE_WATERMARK);
      }
    }
    const selectionGap = hasDiscoverySelectionGap(options.selectedNodeCount, options.serviceEndpointsCount);
    if (stryMutAct_9fa48("583") ? false : stryMutAct_9fa48("582") ? true : (stryCov_9fa48("582", "583"), selectionGap)) {
      if (stryMutAct_9fa48("584")) {
        {}
      } else {
        stryCov_9fa48("584");
        triggerCodes.push(AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_EMPTY_WITH_SERVICES_PRESENT);
      }
    }
    if (stryMutAct_9fa48("587") ? options.nodeCoverageGap !== true : stryMutAct_9fa48("586") ? false : stryMutAct_9fa48("585") ? true : (stryCov_9fa48("585", "586", "587"), options.nodeCoverageGap === (stryMutAct_9fa48("588") ? false : (stryCov_9fa48("588"), true)))) {
      if (stryMutAct_9fa48("589")) {
        {}
      } else {
        stryCov_9fa48("589");
        triggerCodes.push(AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP);
      }
    }
    if (stryMutAct_9fa48("592") ? options.topologyGap !== true : stryMutAct_9fa48("591") ? false : stryMutAct_9fa48("590") ? true : (stryCov_9fa48("590", "591", "592"), options.topologyGap === (stryMutAct_9fa48("593") ? false : (stryCov_9fa48("593"), true)))) {
      if (stryMutAct_9fa48("594")) {
        {}
      } else {
        stryCov_9fa48("594");
        triggerCodes.push(AUTHORITATIVE_REPAIR_TRIGGER.PARTITION_TOPOLOGY_GAP);
      }
    }
    if (stryMutAct_9fa48("598") ? normalizeNonNegativeInteger(options.staleReplicaOpsInFlightCount) <= NUM.ZERO : stryMutAct_9fa48("597") ? normalizeNonNegativeInteger(options.staleReplicaOpsInFlightCount) >= NUM.ZERO : stryMutAct_9fa48("596") ? false : stryMutAct_9fa48("595") ? true : (stryCov_9fa48("595", "596", "597", "598"), normalizeNonNegativeInteger(options.staleReplicaOpsInFlightCount) > NUM.ZERO)) {
      if (stryMutAct_9fa48("599")) {
        {}
      } else {
        stryCov_9fa48("599");
        triggerCodes.push(AUTHORITATIVE_REPAIR_TRIGGER.STALE_REPLICA_OPERATIONS_IN_FLIGHT);
      }
    }
    const serviceCount = normalizeNonNegativeInteger(options.serviceCount);
    const replicaCount = normalizeNonNegativeInteger(options.replicaCount);
    if (stryMutAct_9fa48("602") ? scopedQuery || serviceCount === NUM.ZERO || replicaCount === NUM.ZERO : stryMutAct_9fa48("601") ? false : stryMutAct_9fa48("600") ? true : (stryCov_9fa48("600", "601", "602"), scopedQuery && (stryMutAct_9fa48("604") ? serviceCount === NUM.ZERO && replicaCount === NUM.ZERO : stryMutAct_9fa48("603") ? true : (stryCov_9fa48("603", "604"), (stryMutAct_9fa48("606") ? serviceCount !== NUM.ZERO : stryMutAct_9fa48("605") ? false : (stryCov_9fa48("605", "606"), serviceCount === NUM.ZERO)) || (stryMutAct_9fa48("608") ? replicaCount !== NUM.ZERO : stryMutAct_9fa48("607") ? false : (stryCov_9fa48("607", "608"), replicaCount === NUM.ZERO)))))) {
      if (stryMutAct_9fa48("609")) {
        {}
      } else {
        stryCov_9fa48("609");
        triggerCodes.push(AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_ZERO_SCOPED_REPLICAS);
      }
    }
    if (stryMutAct_9fa48("612") ? options.hasCacheGapReasons === true || options.cacheRepairEligible === true || cacheStaleWatermark === true : stryMutAct_9fa48("611") ? false : stryMutAct_9fa48("610") ? true : (stryCov_9fa48("610", "611", "612"), (stryMutAct_9fa48("614") ? options.hasCacheGapReasons !== true : stryMutAct_9fa48("613") ? true : (stryCov_9fa48("613", "614"), options.hasCacheGapReasons === (stryMutAct_9fa48("615") ? false : (stryCov_9fa48("615"), true)))) && (stryMutAct_9fa48("617") ? options.cacheRepairEligible === true && cacheStaleWatermark === true : stryMutAct_9fa48("616") ? true : (stryCov_9fa48("616", "617"), (stryMutAct_9fa48("619") ? options.cacheRepairEligible !== true : stryMutAct_9fa48("618") ? false : (stryCov_9fa48("618", "619"), options.cacheRepairEligible === (stryMutAct_9fa48("620") ? false : (stryCov_9fa48("620"), true)))) || (stryMutAct_9fa48("622") ? cacheStaleWatermark !== true : stryMutAct_9fa48("621") ? false : (stryCov_9fa48("621", "622"), cacheStaleWatermark === (stryMutAct_9fa48("623") ? false : (stryCov_9fa48("623"), true)))))))) {
      if (stryMutAct_9fa48("624")) {
        {}
      } else {
        stryCov_9fa48("624");
        triggerCodes.push(AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_CACHE_GAP_REASON);
      }
    }
    const readyReplicaCount = normalizeNonNegativeInteger(options.readyReplicaCount);
    if (stryMutAct_9fa48("627") ? !scopedQuery && options.cacheRepairEligible === true || readyReplicaCount === NUM.ZERO : stryMutAct_9fa48("626") ? false : stryMutAct_9fa48("625") ? true : (stryCov_9fa48("625", "626", "627"), (stryMutAct_9fa48("629") ? !scopedQuery || options.cacheRepairEligible === true : stryMutAct_9fa48("628") ? true : (stryCov_9fa48("628", "629"), (stryMutAct_9fa48("630") ? scopedQuery : (stryCov_9fa48("630"), !scopedQuery)) && (stryMutAct_9fa48("632") ? options.cacheRepairEligible !== true : stryMutAct_9fa48("631") ? true : (stryCov_9fa48("631", "632"), options.cacheRepairEligible === (stryMutAct_9fa48("633") ? false : (stryCov_9fa48("633"), true)))))) && (stryMutAct_9fa48("635") ? readyReplicaCount !== NUM.ZERO : stryMutAct_9fa48("634") ? true : (stryCov_9fa48("634", "635"), readyReplicaCount === NUM.ZERO)))) {
      if (stryMutAct_9fa48("636")) {
        {}
      } else {
        stryCov_9fa48("636");
        triggerCodes.push(AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NO_READY_REPLICAS);
      }
    }
    return Object.freeze(stryMutAct_9fa48("637") ? {} : (stryCov_9fa48("637"), {
      shouldRepair: stryMutAct_9fa48("641") ? triggerCodes.length <= NUM.ZERO : stryMutAct_9fa48("640") ? triggerCodes.length >= NUM.ZERO : stryMutAct_9fa48("639") ? false : stryMutAct_9fa48("638") ? true : (stryCov_9fa48("638", "639", "640", "641"), triggerCodes.length > NUM.ZERO),
      triggerCodes: Object.freeze(triggerCodes)
    }));
  }
}
export { AUTHORITATIVE_REPAIR_TRIGGER, DEFAULT_AUTHORITATIVE_REPAIR_TABLES, deriveAuthoritativeRepairTables, evaluateAuthoritativeRepairPolicy, hasDiscoverySelectionGap, isCacheStalenessOverThreshold };