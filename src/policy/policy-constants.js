import {NUM, STRING, TYPEOF} from '../constants/index.js';
import {
  STORAGE_PLACEMENT_CONSTRAINT,
  STORAGE_PLACEMENT_DEFAULT,
} from '../rebalancer/storage-capacity-constants.js';
import {RAFT_ROLE} from '../raft/constants.js';

const POLICY_SUBSYSTEM = Object.freeze({
  TABLE_POLICY: 'table-policy',
});

const POLICY_EVENT = Object.freeze({
  ROLE_CHANGED: 'roleChanged',
  POLICY_UPDATED: 'policyUpdated',
});

const POLICY_LOG_MSG = Object.freeze({
  TABLE_POLICY_INITIALIZED: 'TablePolicyService initialized',
  MESSAGE_GROUP_NOT_FOUND_DEFAULT:
    'Message group not found, using default policy',
  POLICY_PARSE_FAILED: 'Failed to parse policy',
  UPDATE_TABLE_POLICY: 'Updating table policy',
  UPDATE_TABLE_POLICY_FAILED: 'Failed to update table policy',
  POLICY_CACHE_CLEARED: 'Policy cache cleared',
  POLICY_CACHE_INVALIDATED: 'Policy cache invalidated',
  TABLE_POLICY_SHUTDOWN: 'TablePolicyService shutdown',
});

// Validation and mutation observation outcomes owned by table policy.
// An unconfirmed outcome does not prove that no write occurred.
const POLICY_ERROR_CODE = Object.freeze({
  TABLE_ID_REQUIRED: 'TABLE_ID_REQUIRED',
  POLICY_INVALID: 'TABLE_POLICY_INVALID',
  TARGET_UPDATE_UNSUPPORTED: 'TABLE_POLICY_TARGET_UPDATE_UNSUPPORTED',
  READ_UNAVAILABLE: 'TABLE_POLICY_READ_UNAVAILABLE',
  OBSERVATION_CHANGED: 'TABLE_POLICY_MUTATION_OBSERVATION_CHANGED',
  OUTCOME_UNCONFIRMED: 'TABLE_POLICY_MUTATION_OUTCOME_UNCONFIRMED',
  // No committed base for the conditional policy write could be read.
  BASE_UNAVAILABLE: 'TABLE_POLICY_BASE_UNAVAILABLE',
});

const POLICY_READ_REASON = Object.freeze({
  TABLE_UNAVAILABLE: 'table_unavailable',
  PARTITION_UNAVAILABLE: 'partition_unavailable',
  TARGET_UNDECLARED: 'partition_target_undeclared',
  POLICY_INVALID: 'policy_invalid',
  TARGET_INVALID: 'policy_target_invalid',
  MINIMUM_INVALID: 'policy_minimum_invalid',
  OWNER_UNAVAILABLE: 'policy_owner_unavailable',
  READ_FAILED: 'policy_read_failed',
});

const TABLE_POLICY_TARGET_FIELDS = Object.freeze([
  'replicaCount', 'targetReplicaCount',
]);

const POLICY_ERROR_MSG = Object.freeze({
  SERVICE_ID_REQUIRED: 'serviceId is required',
  TABLE_ID_REQUIRED: 'tableId is required',
  CDC_REQUIRED_FOR_UPDATE: 'CDCIntegrationService is required for policy updates',
  SYSTEM_TABLE_CACHE_REQUIRED: 'System table cache not available',
  INVALID_RAFT_ROLE_PREFIX: 'Invalid Raft role: ',
  INVALID_POLICY_PREFIX: 'Invalid policy: ',
  INVALID_MERGED_POLICY_PREFIX: 'Invalid merged policy: ',
  POLICY_OBJECT_REQUIRED: 'Table policy must be an object',
  TARGET_UPDATE_UNSUPPORTED:
    'Table policy cannot set replication targets; partitions declare their targets',
  fieldFiniteRequired: (field) => `${field} must be finite`,
  fieldTypeMismatch: (field, expectedType, actualType) =>
    `${field} must be ${expectedType}, got ${actualType}`,
  REPLICA_COUNT_MIN: 'replicaCount must be at least 1',
  REPLICA_COUNT_ODD: 'replicaCount must be odd for Raft quorum',
  MIN_REPLICA_COUNT_MIN: 'minReplicaCount must be a positive safe integer',
  MIN_REPLICA_COUNT_ODD: 'minReplicaCount must be odd for Raft quorum',
  MAX_REPLICA_COUNT_MIN: 'maxReplicaCount must be a positive safe integer',
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
  MIN_REPLICA_COUNT: NUM.THREE,
  MAX_REPLICA_COUNT: NUM.SEVEN,
  BYTES_PER_GIB: NUM.BYTES_PER_MIB * NUM.BYTES_PER_KIB,
  SPLIT_STORAGE_GIB: NUM.TEN,
  MERGE_STORAGE_GIB: 2,
  SPLIT_TRAFFIC_THRESHOLD: NUM.THOUSAND,
  MERGE_TRAFFIC_THRESHOLD: 2 * NUM.HUNDRED,
  CACHE_TTL_MS: NUM.THOUSAND * NUM.THIRTY,
});

const DEFAULT_TABLE_POLICY = Object.freeze({
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

const POLICY_VALUE = Object.freeze({
  EMPTY_POLICY: {},
});

export {
  DEFAULT_MESSAGE_GROUP_POLICY,
  DEFAULT_TABLE_POLICY,
  MESSAGE_GROUP_POLICY_FIELD_TYPES,
  POLICY_DEFAULT,
  POLICY_ERROR_CODE,
  POLICY_ERROR_MSG,
  POLICY_EVENT,
  POLICY_FIELD_TYPES,
  POLICY_LOG_MSG,
  POLICY_READ_REASON,
  POLICY_SUBSYSTEM,
  POLICY_VALUE,
  RAFT_ROLE,
  STRING,
  TABLE_POLICY_TARGET_FIELDS,
};
