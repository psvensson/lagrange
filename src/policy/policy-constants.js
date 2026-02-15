import {NUM, STRING, TYPEOF} from '../constants/index.js';
import {
  STORAGE_PLACEMENT_CONSTRAINT,
  STORAGE_PLACEMENT_DEFAULT,
} from '../rebalancer/storage-capacity-constants.js';
import {RAFT_ROLE} from '../raft/constants.js';

const POLICY_SUBSYSTEM = Object.freeze({
  TABLE_POLICY: 'table-policy',
  RAFT_ROLE_TRACKER: 'raft-role-tracker',
});

const POLICY_EVENT = Object.freeze({
  ROLE_CHANGED: 'roleChanged',
  POLICY_UPDATED: 'policyUpdated',
});

const POLICY_LOG_MSG = Object.freeze({
  RAFT_TRACKER_INITIALIZED: 'RaftRoleTracker initialized',
  SERVICE_ALREADY_REGISTERED: 'Service already registered',
  SERVICE_REGISTERED: 'Service registered for role tracking',
  SERVICE_UNREGISTERED: 'Service unregistered from role tracking',
  INVALID_RAFT_ROLE: 'Invalid Raft role',
  ROLE_CHANGED: 'Raft role changed',
  UPDATE_SKIPPED_NO_CDC: 'CDC integration service not available, skipping role update',
  UPDATED_SERVICE_ROLE: 'Updated service Raft role',
  UPDATE_SERVICE_ROLE_FAILED: 'Failed to update service Raft role',
  TRACKER_SHUTDOWN: 'RaftRoleTracker shutdown',
  TABLE_POLICY_INITIALIZED: 'TablePolicyService initialized',
  TABLE_NOT_FOUND_DEFAULT: 'Table not found, using default policy',
  PARTITION_NOT_FOUND_DEFAULT: 'Partition not found, using default policy',
  MESSAGE_GROUP_NOT_FOUND_DEFAULT:
    'Message group not found, using default policy',
  POLICY_PARSE_FAILED: 'Failed to parse table policy, using defaults',
  UPDATE_TABLE_POLICY: 'Updating table policy',
  UPDATE_TABLE_POLICY_FAILED: 'Failed to update table policy',
  POLICY_CACHE_CLEARED: 'Policy cache cleared',
  POLICY_CACHE_INVALIDATED: 'Policy cache invalidated',
  TABLE_POLICY_SHUTDOWN: 'TablePolicyService shutdown',
});

const POLICY_ERROR_MSG = Object.freeze({
  SERVICE_ID_REQUIRED: 'serviceId is required',
  TABLE_ID_REQUIRED: 'tableId is required',
  CDC_REQUIRED_FOR_UPDATE: 'CDCIntegrationService is required for policy updates',
  SYSTEM_TABLE_CACHE_REQUIRED: 'System table cache not available',
  INVALID_RAFT_ROLE_PREFIX: 'Invalid Raft role: ',
  INVALID_POLICY_PREFIX: 'Invalid policy: ',
  INVALID_MERGED_POLICY_PREFIX: 'Invalid merged policy: ',
  fieldTypeMismatch: (field, expectedType, actualType) =>
    `${field} must be ${expectedType}, got ${actualType}`,
  REPLICA_COUNT_MIN: 'replicaCount must be at least 1',
  REPLICA_COUNT_ODD: 'replicaCount must be odd for Raft quorum',
  MIN_REPLICA_COUNT_MIN: 'minReplicaCount must be at least 1',
  MIN_REPLICA_COUNT_ODD: 'minReplicaCount must be odd for Raft quorum',
  MAX_REPLICA_COUNT_MIN: 'maxReplicaCount must be at least 1',
  MAX_REPLICA_COUNT_ODD: 'maxReplicaCount must be odd for Raft quorum',
  MIN_GT_MAX: 'minReplicaCount cannot be greater than maxReplicaCount',
  REPLICA_BETWEEN: 'replicaCount must be between minReplicaCount and maxReplicaCount',
  SPLIT_STORAGE_NONNEGATIVE: 'splitStorageThreshold must be non-negative',
  SPLIT_TRAFFIC_NONNEGATIVE: 'splitTrafficThreshold must be non-negative',
  MERGE_STORAGE_NONNEGATIVE: 'mergeStorageThreshold must be non-negative',
  MERGE_TRAFFIC_NONNEGATIVE: 'mergeTrafficThreshold must be non-negative',
  PLACEMENT_MIN_FREE_NONNEGATIVE:
    'minFreeBytesPerNode must be non-negative',
  PLACEMENT_MAX_UTIL_RANGE:
    'maxBudgetUtilizationPercent must be between 0 and 100',
});

const POLICY_DEFAULT = Object.freeze({
  REPLICA_COUNT: NUM.THREE,
  MIN_REPLICA_COUNT: NUM.THREE,
  MAX_REPLICA_COUNT: NUM.SEVEN,
  BYTES_PER_GIB: NUM.BYTES_PER_MIB * NUM.BYTES_PER_KIB,
  SPLIT_STORAGE_GIB: NUM.TEN,
  MERGE_STORAGE_GIB: NUM.TWO,
  SPLIT_TRAFFIC_THRESHOLD: NUM.THOUSAND,
  MERGE_TRAFFIC_THRESHOLD: NUM.TWO * NUM.HUNDRED,
  CACHE_TTL_MS: NUM.THOUSAND * NUM.THIRTY,
});

const DEFAULT_TABLE_POLICY = Object.freeze({
  replicaCount: POLICY_DEFAULT.REPLICA_COUNT,
  minReplicaCount: POLICY_DEFAULT.MIN_REPLICA_COUNT,
  maxReplicaCount: POLICY_DEFAULT.MAX_REPLICA_COUNT,
  splitStorageThreshold: POLICY_DEFAULT.SPLIT_STORAGE_GIB * POLICY_DEFAULT.BYTES_PER_GIB,
  splitTrafficThreshold: POLICY_DEFAULT.SPLIT_TRAFFIC_THRESHOLD,
  mergeStorageThreshold: POLICY_DEFAULT.MERGE_STORAGE_GIB * POLICY_DEFAULT.BYTES_PER_GIB,
  mergeTrafficThreshold: POLICY_DEFAULT.MERGE_TRAFFIC_THRESHOLD,
  placementConstraints: {
    spreadAcrossNodes: true,
    considerDiskSpace: true,
    considerCpuLoad: true,
    considerMemoryLoad: true,
    [STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE]:
      STORAGE_PLACEMENT_DEFAULT.MIN_FREE_BYTES_PER_NODE,
    [STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT]:
      STORAGE_PLACEMENT_DEFAULT.MAX_BUDGET_UTILIZATION_PERCENT,
    [STORAGE_PLACEMENT_CONSTRAINT.RESERVE_EMERGENCY_HEADROOM]:
      STORAGE_PLACEMENT_DEFAULT.RESERVE_EMERGENCY_HEADROOM,
  },
});

const DEFAULT_MESSAGE_GROUP_POLICY = Object.freeze({
  targetReplicaCount: NUM.THREE,
  maxReplicaCount: NUM.FIVE,
  ensureLocalAccess: true,
  placementConstraints: {
    spreadAcrossNodes: true,
    preferNearbyNodes: true,
    [STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE]:
      STORAGE_PLACEMENT_DEFAULT.MIN_FREE_BYTES_PER_NODE,
    [STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT]:
      STORAGE_PLACEMENT_DEFAULT.MAX_BUDGET_UTILIZATION_PERCENT,
    [STORAGE_PLACEMENT_CONSTRAINT.RESERVE_EMERGENCY_HEADROOM]:
      STORAGE_PLACEMENT_DEFAULT.RESERVE_EMERGENCY_HEADROOM,
  },
});

const POLICY_FIELD_TYPES = Object.freeze({
  replicaCount: TYPEOF.NUMBER,
  minReplicaCount: TYPEOF.NUMBER,
  maxReplicaCount: TYPEOF.NUMBER,
  splitStorageThreshold: TYPEOF.NUMBER,
  splitTrafficThreshold: TYPEOF.NUMBER,
  mergeStorageThreshold: TYPEOF.NUMBER,
  mergeTrafficThreshold: TYPEOF.NUMBER,
  placementConstraints: TYPEOF.OBJECT,
});

const MESSAGE_GROUP_POLICY_FIELD_TYPES = Object.freeze({
  targetReplicaCount: TYPEOF.NUMBER,
  maxReplicaCount: TYPEOF.NUMBER,
  ensureLocalAccess: TYPEOF.BOOLEAN,
  placementConstraints: TYPEOF.OBJECT,
});

const POLICY_RESULT_REASON = Object.freeze({
  NO_CDC_SERVICE: 'no_cdc_service',
});

const POLICY_VALUE = Object.freeze({
  EMPTY_POLICY: {},
});

export {
  DEFAULT_MESSAGE_GROUP_POLICY,
  DEFAULT_TABLE_POLICY,
  MESSAGE_GROUP_POLICY_FIELD_TYPES,
  POLICY_DEFAULT,
  POLICY_ERROR_MSG,
  POLICY_EVENT,
  POLICY_FIELD_TYPES,
  POLICY_LOG_MSG,
  POLICY_RESULT_REASON,
  POLICY_SUBSYSTEM,
  POLICY_VALUE,
  RAFT_ROLE,
  STRING,
  TYPEOF,
};
