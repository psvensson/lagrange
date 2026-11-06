import {CONFIG_KEY} from '../config/config-constants.js';
import {
  DEFAULT_TABLE_POLICY,
  POLICY_ERROR_CODE,
  POLICY_READ_REASON,
} from './policy-constants.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_PLACEMENT_CONSTRAINTS = 'placementConstraints';
const LOCAL_STR_FUNCTION = 'function';

function buildPolicyRefusal(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// A failed policy observation retains retry custody at the existing consumer.
// A mutation refusal uses buildPolicyRefusal and is deliberately not retryable.
function policyReadUnavailable(reason, context = {}) {
  if (context.cause?.code === POLICY_ERROR_CODE.READ_UNAVAILABLE) {
    return context.cause;
  }
  const error = new Error(`Table policy unavailable: ${reason}`, {
    cause: context.cause,
  });
  error.code = POLICY_ERROR_CODE.READ_UNAVAILABLE;
  error.reason = reason;
  error.deferRetry = true;
  error.tableId = context.tableId ?? null;
  error.partitionId = context.partitionId ?? null;
  return error;
}

async function readPolicyForPartition(owner, partitionId) {
  if (typeof owner?.getPolicyForPartition !== LOCAL_STR_FUNCTION) {
    throw policyReadUnavailable(POLICY_READ_REASON.OWNER_UNAVAILABLE, {
      partitionId,
    });
  }
  try {
    const policy = await owner.getPolicyForPartition(partitionId);
    if (!policy || typeof policy !== LOCAL_STR_OBJECT || Array.isArray(policy)) {
      throw policyReadUnavailable(POLICY_READ_REASON.POLICY_INVALID, {partitionId});
    }
    requirePolicyTargetReplicaCount(policy);
    requirePolicyMinimumReplicaCount(policy);
    return policy;
  } catch (cause) {
    throw policyReadUnavailable(POLICY_READ_REASON.READ_FAILED, {
      cause, partitionId,
    });
  }
}

function requirePolicyTargetReplicaCount(policy, allowZero = false) {
  const target = policy?.targetReplicaCount;
  if (!Number.isSafeInteger(target) || target < (allowZero ? 0 : 1)) {
    throw policyReadUnavailable(POLICY_READ_REASON.TARGET_INVALID);
  }
  return target;
}

function requirePolicyMinimumReplicaCount(policy) {
  const minimum = policy?.minReplicaCount;
  if (!Number.isSafeInteger(minimum) || minimum < 1) {
    throw policyReadUnavailable(POLICY_READ_REASON.MINIMUM_INVALID);
  }
  return minimum;
}

function resolveConfiguredTablePolicyDefaults(config) {
  return {
    ...DEFAULT_TABLE_POLICY,
    splitStorageThreshold:
      config.get(CONFIG_KEY.PARTITION_SPLIT_THRESHOLD_BYTES) ??
      DEFAULT_TABLE_POLICY.splitStorageThreshold,
    splitTrafficThreshold:
      config.get(CONFIG_KEY.PARTITION_SPLIT_THRESHOLD_QPM) ??
      DEFAULT_TABLE_POLICY.splitTrafficThreshold,
    mergeStorageThreshold:
      config.get(CONFIG_KEY.PARTITION_MERGE_THRESHOLD_BYTES) ??
      DEFAULT_TABLE_POLICY.mergeStorageThreshold,
    mergeTrafficThreshold:
      config.get(CONFIG_KEY.PARTITION_MERGE_THRESHOLD_QPM) ??
      DEFAULT_TABLE_POLICY.mergeTrafficThreshold,
    placementConstraints: {
      ...DEFAULT_TABLE_POLICY.placementConstraints,
    },
  };
}

function mergeStoredTablePolicyOverrides(storedPolicy, policyUpdates) {
  const stored = storedPolicy && typeof storedPolicy === LOCAL_STR_OBJECT ?
    storedPolicy : {};
  const merged = {...stored, ...policyUpdates};
  const placementUpdates = policyUpdates?.[LOCAL_STR_PLACEMENT_CONSTRAINTS];

  if (placementUpdates && typeof placementUpdates === LOCAL_STR_OBJECT) {
    const storedPlacement =
      stored[LOCAL_STR_PLACEMENT_CONSTRAINTS] &&
      typeof stored[LOCAL_STR_PLACEMENT_CONSTRAINTS] === LOCAL_STR_OBJECT ?
        stored[LOCAL_STR_PLACEMENT_CONSTRAINTS] : {};
    merged[LOCAL_STR_PLACEMENT_CONSTRAINTS] = {
      ...storedPlacement,
      ...placementUpdates,
    };
  }

  return merged;
}

export {
  buildPolicyRefusal,
  mergeStoredTablePolicyOverrides,
  policyReadUnavailable,
  readPolicyForPartition,
  requirePolicyMinimumReplicaCount,
  requirePolicyTargetReplicaCount,
  resolveConfiguredTablePolicyDefaults,
};
