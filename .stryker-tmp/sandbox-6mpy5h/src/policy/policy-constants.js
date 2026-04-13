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
import { NUM, STRING, TYPEOF } from '../constants/index.js';
import { STORAGE_PLACEMENT_CONSTRAINT, STORAGE_PLACEMENT_DEFAULT } from '../rebalancer/storage-capacity-constants.js';
import { RAFT_ROLE } from '../raft/constants.js';
const POLICY_SUBSYSTEM = Object.freeze(stryMutAct_9fa48("107716") ? {} : (stryCov_9fa48("107716"), {
  TABLE_POLICY: stryMutAct_9fa48("107717") ? "" : (stryCov_9fa48("107717"), 'table-policy'),
  RAFT_ROLE_TRACKER: stryMutAct_9fa48("107718") ? "" : (stryCov_9fa48("107718"), 'raft-role-tracker')
}));
const POLICY_EVENT = Object.freeze(stryMutAct_9fa48("107719") ? {} : (stryCov_9fa48("107719"), {
  ROLE_CHANGED: stryMutAct_9fa48("107720") ? "" : (stryCov_9fa48("107720"), 'roleChanged'),
  POLICY_UPDATED: stryMutAct_9fa48("107721") ? "" : (stryCov_9fa48("107721"), 'policyUpdated')
}));
const POLICY_LOG_MSG = Object.freeze(stryMutAct_9fa48("107722") ? {} : (stryCov_9fa48("107722"), {
  RAFT_TRACKER_INITIALIZED: stryMutAct_9fa48("107723") ? "" : (stryCov_9fa48("107723"), 'RaftRoleTracker initialized'),
  SERVICE_ALREADY_REGISTERED: stryMutAct_9fa48("107724") ? "" : (stryCov_9fa48("107724"), 'Service already registered'),
  SERVICE_REGISTERED: stryMutAct_9fa48("107725") ? "" : (stryCov_9fa48("107725"), 'Service registered for role tracking'),
  SERVICE_UNREGISTERED: stryMutAct_9fa48("107726") ? "" : (stryCov_9fa48("107726"), 'Service unregistered from role tracking'),
  INVALID_RAFT_ROLE: stryMutAct_9fa48("107727") ? "" : (stryCov_9fa48("107727"), 'Invalid Raft role'),
  ROLE_CHANGED: stryMutAct_9fa48("107728") ? "" : (stryCov_9fa48("107728"), 'Raft role changed'),
  UPDATE_SKIPPED_NO_CDC: stryMutAct_9fa48("107729") ? "" : (stryCov_9fa48("107729"), 'CDC integration service not available, skipping role update'),
  UPDATED_SERVICE_ROLE: stryMutAct_9fa48("107730") ? "" : (stryCov_9fa48("107730"), 'Updated service Raft role'),
  UPDATE_SERVICE_ROLE_FAILED: stryMutAct_9fa48("107731") ? "" : (stryCov_9fa48("107731"), 'Failed to update service Raft role'),
  TRACKER_SHUTDOWN: stryMutAct_9fa48("107732") ? "" : (stryCov_9fa48("107732"), 'RaftRoleTracker shutdown'),
  TABLE_POLICY_INITIALIZED: stryMutAct_9fa48("107733") ? "" : (stryCov_9fa48("107733"), 'TablePolicyService initialized'),
  TABLE_NOT_FOUND_DEFAULT: stryMutAct_9fa48("107734") ? "" : (stryCov_9fa48("107734"), 'Table not found, using default policy'),
  PARTITION_NOT_FOUND_DEFAULT: stryMutAct_9fa48("107735") ? "" : (stryCov_9fa48("107735"), 'Partition not found, using default policy'),
  MESSAGE_GROUP_NOT_FOUND_DEFAULT: stryMutAct_9fa48("107736") ? "" : (stryCov_9fa48("107736"), 'Message group not found, using default policy'),
  POLICY_PARSE_FAILED: stryMutAct_9fa48("107737") ? "" : (stryCov_9fa48("107737"), 'Failed to parse table policy, using defaults'),
  UPDATE_TABLE_POLICY: stryMutAct_9fa48("107738") ? "" : (stryCov_9fa48("107738"), 'Updating table policy'),
  UPDATE_TABLE_POLICY_FAILED: stryMutAct_9fa48("107739") ? "" : (stryCov_9fa48("107739"), 'Failed to update table policy'),
  POLICY_CACHE_CLEARED: stryMutAct_9fa48("107740") ? "" : (stryCov_9fa48("107740"), 'Policy cache cleared'),
  POLICY_CACHE_INVALIDATED: stryMutAct_9fa48("107741") ? "" : (stryCov_9fa48("107741"), 'Policy cache invalidated'),
  TABLE_POLICY_SHUTDOWN: stryMutAct_9fa48("107742") ? "" : (stryCov_9fa48("107742"), 'TablePolicyService shutdown')
}));
const POLICY_ERROR_MSG = Object.freeze(stryMutAct_9fa48("107743") ? {} : (stryCov_9fa48("107743"), {
  SERVICE_ID_REQUIRED: stryMutAct_9fa48("107744") ? "" : (stryCov_9fa48("107744"), 'serviceId is required'),
  TABLE_ID_REQUIRED: stryMutAct_9fa48("107745") ? "" : (stryCov_9fa48("107745"), 'tableId is required'),
  CDC_REQUIRED_FOR_UPDATE: stryMutAct_9fa48("107746") ? "" : (stryCov_9fa48("107746"), 'CDCIntegrationService is required for policy updates'),
  SYSTEM_TABLE_CACHE_REQUIRED: stryMutAct_9fa48("107747") ? "" : (stryCov_9fa48("107747"), 'System table cache not available'),
  INVALID_RAFT_ROLE_PREFIX: stryMutAct_9fa48("107748") ? "" : (stryCov_9fa48("107748"), 'Invalid Raft role: '),
  INVALID_POLICY_PREFIX: stryMutAct_9fa48("107749") ? "" : (stryCov_9fa48("107749"), 'Invalid policy: '),
  INVALID_MERGED_POLICY_PREFIX: stryMutAct_9fa48("107750") ? "" : (stryCov_9fa48("107750"), 'Invalid merged policy: '),
  fieldTypeMismatch: stryMutAct_9fa48("107751") ? () => undefined : (stryCov_9fa48("107751"), (field, expectedType, actualType) => stryMutAct_9fa48("107752") ? `` : (stryCov_9fa48("107752"), `${field} must be ${expectedType}, got ${actualType}`)),
  REPLICA_COUNT_MIN: stryMutAct_9fa48("107753") ? "" : (stryCov_9fa48("107753"), 'replicaCount must be at least 1'),
  REPLICA_COUNT_ODD: stryMutAct_9fa48("107754") ? "" : (stryCov_9fa48("107754"), 'replicaCount must be odd for Raft quorum'),
  MIN_REPLICA_COUNT_MIN: stryMutAct_9fa48("107755") ? "" : (stryCov_9fa48("107755"), 'minReplicaCount must be at least 1'),
  MIN_REPLICA_COUNT_ODD: stryMutAct_9fa48("107756") ? "" : (stryCov_9fa48("107756"), 'minReplicaCount must be odd for Raft quorum'),
  MAX_REPLICA_COUNT_MIN: stryMutAct_9fa48("107757") ? "" : (stryCov_9fa48("107757"), 'maxReplicaCount must be at least 1'),
  MAX_REPLICA_COUNT_ODD: stryMutAct_9fa48("107758") ? "" : (stryCov_9fa48("107758"), 'maxReplicaCount must be odd for Raft quorum'),
  MIN_GT_MAX: stryMutAct_9fa48("107759") ? "" : (stryCov_9fa48("107759"), 'minReplicaCount cannot be greater than maxReplicaCount'),
  REPLICA_BETWEEN: stryMutAct_9fa48("107760") ? "" : (stryCov_9fa48("107760"), 'replicaCount must be between minReplicaCount and maxReplicaCount'),
  SPLIT_STORAGE_NONNEGATIVE: stryMutAct_9fa48("107761") ? "" : (stryCov_9fa48("107761"), 'splitStorageThreshold must be non-negative'),
  SPLIT_TRAFFIC_NONNEGATIVE: stryMutAct_9fa48("107762") ? "" : (stryCov_9fa48("107762"), 'splitTrafficThreshold must be non-negative'),
  MERGE_STORAGE_NONNEGATIVE: stryMutAct_9fa48("107763") ? "" : (stryCov_9fa48("107763"), 'mergeStorageThreshold must be non-negative'),
  MERGE_TRAFFIC_NONNEGATIVE: stryMutAct_9fa48("107764") ? "" : (stryCov_9fa48("107764"), 'mergeTrafficThreshold must be non-negative'),
  PLACEMENT_MIN_FREE_NONNEGATIVE: stryMutAct_9fa48("107765") ? "" : (stryCov_9fa48("107765"), 'minFreeBytesPerNode must be non-negative'),
  PLACEMENT_MAX_UTIL_RANGE: stryMutAct_9fa48("107766") ? "" : (stryCov_9fa48("107766"), 'maxBudgetUtilizationPercent must be between 0 and 100')
}));
const POLICY_DEFAULT = Object.freeze(stryMutAct_9fa48("107767") ? {} : (stryCov_9fa48("107767"), {
  REPLICA_COUNT: NUM.THREE,
  MIN_REPLICA_COUNT: NUM.THREE,
  MAX_REPLICA_COUNT: NUM.SEVEN,
  BYTES_PER_GIB: stryMutAct_9fa48("107768") ? NUM.BYTES_PER_MIB / NUM.BYTES_PER_KIB : (stryCov_9fa48("107768"), NUM.BYTES_PER_MIB * NUM.BYTES_PER_KIB),
  SPLIT_STORAGE_GIB: NUM.TEN,
  MERGE_STORAGE_GIB: NUM.TWO,
  SPLIT_TRAFFIC_THRESHOLD: NUM.THOUSAND,
  MERGE_TRAFFIC_THRESHOLD: stryMutAct_9fa48("107769") ? NUM.TWO / NUM.HUNDRED : (stryCov_9fa48("107769"), NUM.TWO * NUM.HUNDRED),
  CACHE_TTL_MS: stryMutAct_9fa48("107770") ? NUM.THOUSAND / NUM.THIRTY : (stryCov_9fa48("107770"), NUM.THOUSAND * NUM.THIRTY)
}));
const DEFAULT_TABLE_POLICY = Object.freeze(stryMutAct_9fa48("107771") ? {} : (stryCov_9fa48("107771"), {
  replicaCount: POLICY_DEFAULT.REPLICA_COUNT,
  minReplicaCount: POLICY_DEFAULT.MIN_REPLICA_COUNT,
  maxReplicaCount: POLICY_DEFAULT.MAX_REPLICA_COUNT,
  splitStorageThreshold: stryMutAct_9fa48("107772") ? POLICY_DEFAULT.SPLIT_STORAGE_GIB / POLICY_DEFAULT.BYTES_PER_GIB : (stryCov_9fa48("107772"), POLICY_DEFAULT.SPLIT_STORAGE_GIB * POLICY_DEFAULT.BYTES_PER_GIB),
  splitTrafficThreshold: POLICY_DEFAULT.SPLIT_TRAFFIC_THRESHOLD,
  mergeStorageThreshold: stryMutAct_9fa48("107773") ? POLICY_DEFAULT.MERGE_STORAGE_GIB / POLICY_DEFAULT.BYTES_PER_GIB : (stryCov_9fa48("107773"), POLICY_DEFAULT.MERGE_STORAGE_GIB * POLICY_DEFAULT.BYTES_PER_GIB),
  mergeTrafficThreshold: POLICY_DEFAULT.MERGE_TRAFFIC_THRESHOLD,
  placementConstraints: stryMutAct_9fa48("107774") ? {} : (stryCov_9fa48("107774"), {
    spreadAcrossNodes: stryMutAct_9fa48("107775") ? false : (stryCov_9fa48("107775"), true),
    considerDiskSpace: stryMutAct_9fa48("107776") ? false : (stryCov_9fa48("107776"), true),
    considerCpuLoad: stryMutAct_9fa48("107777") ? false : (stryCov_9fa48("107777"), true),
    considerMemoryLoad: stryMutAct_9fa48("107778") ? false : (stryCov_9fa48("107778"), true),
    [STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE]: STORAGE_PLACEMENT_DEFAULT.MIN_FREE_BYTES_PER_NODE,
    [STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT]: STORAGE_PLACEMENT_DEFAULT.MAX_BUDGET_UTILIZATION_PERCENT,
    [STORAGE_PLACEMENT_CONSTRAINT.RESERVE_EMERGENCY_HEADROOM]: STORAGE_PLACEMENT_DEFAULT.RESERVE_EMERGENCY_HEADROOM
  })
}));
const DEFAULT_MESSAGE_GROUP_POLICY = Object.freeze(stryMutAct_9fa48("107779") ? {} : (stryCov_9fa48("107779"), {
  targetReplicaCount: NUM.THREE,
  maxReplicaCount: NUM.FIVE,
  ensureLocalAccess: stryMutAct_9fa48("107780") ? false : (stryCov_9fa48("107780"), true),
  placementConstraints: stryMutAct_9fa48("107781") ? {} : (stryCov_9fa48("107781"), {
    spreadAcrossNodes: stryMutAct_9fa48("107782") ? false : (stryCov_9fa48("107782"), true),
    preferNearbyNodes: stryMutAct_9fa48("107783") ? false : (stryCov_9fa48("107783"), true),
    [STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE]: STORAGE_PLACEMENT_DEFAULT.MIN_FREE_BYTES_PER_NODE,
    [STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT]: STORAGE_PLACEMENT_DEFAULT.MAX_BUDGET_UTILIZATION_PERCENT,
    [STORAGE_PLACEMENT_CONSTRAINT.RESERVE_EMERGENCY_HEADROOM]: STORAGE_PLACEMENT_DEFAULT.RESERVE_EMERGENCY_HEADROOM
  })
}));
const POLICY_FIELD_TYPES = Object.freeze(stryMutAct_9fa48("107784") ? {} : (stryCov_9fa48("107784"), {
  replicaCount: TYPEOF.NUMBER,
  minReplicaCount: TYPEOF.NUMBER,
  maxReplicaCount: TYPEOF.NUMBER,
  splitStorageThreshold: TYPEOF.NUMBER,
  splitTrafficThreshold: TYPEOF.NUMBER,
  mergeStorageThreshold: TYPEOF.NUMBER,
  mergeTrafficThreshold: TYPEOF.NUMBER,
  placementConstraints: TYPEOF.OBJECT
}));
const MESSAGE_GROUP_POLICY_FIELD_TYPES = Object.freeze(stryMutAct_9fa48("107785") ? {} : (stryCov_9fa48("107785"), {
  targetReplicaCount: TYPEOF.NUMBER,
  maxReplicaCount: TYPEOF.NUMBER,
  ensureLocalAccess: TYPEOF.BOOLEAN,
  placementConstraints: TYPEOF.OBJECT
}));
const POLICY_RESULT_REASON = Object.freeze(stryMutAct_9fa48("107786") ? {} : (stryCov_9fa48("107786"), {
  NO_CDC_SERVICE: stryMutAct_9fa48("107787") ? "" : (stryCov_9fa48("107787"), 'no_cdc_service')
}));
const POLICY_VALUE = Object.freeze(stryMutAct_9fa48("107788") ? {} : (stryCov_9fa48("107788"), {
  EMPTY_POLICY: {}
}));
export { DEFAULT_MESSAGE_GROUP_POLICY, DEFAULT_TABLE_POLICY, MESSAGE_GROUP_POLICY_FIELD_TYPES, POLICY_DEFAULT, POLICY_ERROR_MSG, POLICY_EVENT, POLICY_FIELD_TYPES, POLICY_LOG_MSG, POLICY_RESULT_REASON, POLICY_SUBSYSTEM, POLICY_VALUE, RAFT_ROLE, STRING, TYPEOF };