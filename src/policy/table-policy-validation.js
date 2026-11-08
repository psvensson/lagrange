import {NUM} from '../constants/index.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {
  REPLICATION_TARGET_SOURCE,
  resolveDesiredReplicationFactor,
} from '../bootstrap/replication-target-authority.js';
import {
  STORAGE_PLACEMENT_CONSTRAINT,
} from '../rebalancer/storage-capacity-constants.js';
import {
  DEFAULT_MESSAGE_GROUP_POLICY,
  DEFAULT_TABLE_POLICY,
  MESSAGE_GROUP_POLICY_FIELD_TYPES,
  POLICY_AUTHORITY_STATE,
  POLICY_ERROR_CODE,
  POLICY_ERROR_MSG,
  POLICY_FIELD_TYPES,
  POLICY_READ_REASON,
  TABLE_POLICY_TARGET_FIELDS,
} from './policy-constants.js';

const POLICY_OBJECT_TYPE = 'object';
const POLICY_NUMBER_TYPE = 'number';
const POLICY_ERROR_SEPARATOR = ', ';
const LOCAL_STR_MIN_REPLICA_COUNT = 'minReplicaCount';
const LOCAL_STR_PLACEMENT_CONSTRAINTS = 'placementConstraints';
const LOCAL_STR_REPLICA_COUNT = 'replica_count';
const LOCAL_STR_REPLICA_COUNT_CAMEL = 'replicaCount';
const LOCAL_STR_TARGET_REPLICA_COUNT = 'targetReplicaCount';

function buildPolicyRefusal(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function buildPolicyAuthorityDecision(state, details = {}) {
  return Object.freeze({
    state,
    policy: details.policy ?? null,
    minReplicaCount: details.minReplicaCount ?? null,
    targetReplicaCount: details.targetReplicaCount ?? null,
    rowSetComplete: details.rowSetComplete === true,
    readAuthorityWitness: details.readAuthorityWitness ?? null,
    partitionReadAuthorityWitness: details.partitionReadAuthorityWitness ?? null,
    tableReadAuthorityWitness: details.tableReadAuthorityWitness ?? null,
    reason: details.reason ?? null,
    cause: details.cause ?? null,
  });
}

function hasOwnRawReplicaCount(row) {
  if (!row || typeof row !== POLICY_OBJECT_TYPE || Array.isArray(row)) {
    return false;
  }
  const hasSnake = Object.hasOwn(row, LOCAL_STR_REPLICA_COUNT) &&
    row.replica_count !== undefined && row.replica_count !== null;
  const hasCamel = Object.hasOwn(row, LOCAL_STR_REPLICA_COUNT_CAMEL) &&
    row.replicaCount !== undefined && row.replicaCount !== null;
  return hasSnake || hasCamel;
}

function hasInvalidMessageGroupRowTarget(
  group,
  storedPolicy,
  hasStoredTarget,
  rowTarget,
  hasRowTarget,
) {
  if (
    hasOwnRawReplicaCount(group) &&
    (!hasRowTarget || rowTarget.replicationFactor % 2 === 0)
  ) {
    return true;
  }
  return hasStoredTarget &&
    hasRowTarget &&
    storedPolicy.targetReplicaCount !== rowTarget.replicationFactor;
}

function evaluateMessageGroupTargetDeclaration(group, storedPolicy, prov = {}) {
  const hasStoredTarget =
    Object.hasOwn(storedPolicy, LOCAL_STR_TARGET_REPLICA_COUNT) &&
    storedPolicy.targetReplicaCount !== undefined;
  const rowTarget = resolveDesiredReplicationFactor(group);
  const hasRowTarget =
    rowTarget.source === REPLICATION_TARGET_SOURCE.PARTITION_ROW;

  if (
    hasInvalidMessageGroupRowTarget(
      group,
      storedPolicy,
      hasStoredTarget,
      rowTarget,
      hasRowTarget,
    )
  ) {
    return {
      decision: buildPolicyAuthorityDecision(
        POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
        {reason: POLICY_READ_REASON.TARGET_INVALID},
      ),
    };
  } else if (!hasStoredTarget && !hasRowTarget) {
    return {
      decision: buildPolicyAuthorityDecision(
        POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE,
        {
          reason: POLICY_READ_REASON.MESSAGE_GROUP_TARGET_UNDECLARED,
          rowSetComplete: Boolean(prov.rowSetComplete),
          readAuthorityWitness: prov.readAuthorityWitness,
        },
      ),
    };
  }
  return {
    declaredTarget: hasStoredTarget ?
      storedPolicy.targetReplicaCount :
      rowTarget.replicationFactor,
  };
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
    placementConstraints: {...DEFAULT_TABLE_POLICY.placementConstraints},
  };
}

function mergeStoredTablePolicyOverrides(storedPolicy, policyUpdates) {
  const stored = storedPolicy && typeof storedPolicy === POLICY_OBJECT_TYPE ?
    storedPolicy : {};
  const merged = {...stored, ...policyUpdates};
  const placementUpdates = policyUpdates?.[LOCAL_STR_PLACEMENT_CONSTRAINTS];
  if (placementUpdates && typeof placementUpdates === POLICY_OBJECT_TYPE) {
    const storedPlacement =
      stored[LOCAL_STR_PLACEMENT_CONSTRAINTS] &&
      typeof stored[LOCAL_STR_PLACEMENT_CONSTRAINTS] === POLICY_OBJECT_TYPE ?
        stored[LOCAL_STR_PLACEMENT_CONSTRAINTS] : {};
    merged[LOCAL_STR_PLACEMENT_CONSTRAINTS] = {
      ...storedPlacement,
      ...placementUpdates,
    };
  }
  return merged;
}

/**
 * Extract storage-related placement constraints from a constraints object.
 * @param {Object} constraints - Full placement constraints.
 * @return {Object} Storage-only constraint values.
 */
function extractStorageConstraints(constraints) {
  const pc = constraints || {};
  return {
    [STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE]:
      pc[STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE],
    [STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT]:
      pc[STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT],
    [STORAGE_PLACEMENT_CONSTRAINT.RESERVE_EMERGENCY_HEADROOM]:
      pc[STORAGE_PLACEMENT_CONSTRAINT.RESERVE_EMERGENCY_HEADROOM],
  };
}

/**
 * Validate placement constraints in the policy.
 * @param {Object} placementConstraints - Placement constraints.
 * @return {string[]} Array of validation error messages.
 */
function validatePlacementConstraints(placementConstraints) {
  const errors = [];

  for (const [field, defaultValue] of Object.entries(
    DEFAULT_TABLE_POLICY.placementConstraints,
  )) {
    if (placementConstraints[field] !== undefined) {
      const expectedType = typeof defaultValue;
      const actualType = typeof placementConstraints[field];
      if (actualType !== expectedType) {
        errors.push(POLICY_ERROR_MSG.fieldTypeMismatch(
          field,
          expectedType,
          actualType,
        ));
      }
    }
  }

  const minFree = placementConstraints[
    STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE
  ];
  if (typeof minFree === 'number' && minFree < 0) {
    errors.push(POLICY_ERROR_MSG.PLACEMENT_MIN_FREE_NONNEGATIVE);
  }

  const maxUtil = placementConstraints[
    STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT
  ];
  if (typeof maxUtil === 'number' &&
      (maxUtil < 0 || maxUtil > NUM.HUNDRED)) {
    errors.push(POLICY_ERROR_MSG.PLACEMENT_MAX_UTIL_RANGE);
  }

  return errors;
}

/**
 * Validate a table policy object.
 * @param {Object} policy - Policy to validate.
 * @param {Function} validatePlacement - Placement constraint validator.
 * @return {Object} Validation result {valid, errors}.
 */
function validateTablePolicy(
  policy,
  validatePlacement = validatePlacementConstraints,
) {
  const errors = [];

  if (!policy || typeof policy !== POLICY_OBJECT_TYPE || Array.isArray(policy)) {
    return {valid: false, errors: [POLICY_ERROR_MSG.POLICY_OBJECT_REQUIRED]};
  }
  if (TABLE_POLICY_TARGET_FIELDS.some((field) => Object.hasOwn(policy, field))) {
    return {
      valid: false,
      errors: [POLICY_ERROR_MSG.TARGET_UPDATE_UNSUPPORTED],
      code: POLICY_ERROR_CODE.TARGET_UPDATE_UNSUPPORTED,
    };
  }

  for (const [field, expectedType] of Object.entries(POLICY_FIELD_TYPES)) {
    if (policy[field] !== undefined) {
      const actualType = typeof policy[field];
      if (actualType !== expectedType) {
        errors.push(POLICY_ERROR_MSG.fieldTypeMismatch(
          field,
          expectedType,
          actualType,
        ));
      }
      if (actualType === POLICY_NUMBER_TYPE && !Number.isFinite(policy[field])) {
        errors.push(POLICY_ERROR_MSG.fieldFiniteRequired(field));
      }
    }
  }

  if (policy.minReplicaCount !== undefined) {
    if (!Number.isSafeInteger(policy.minReplicaCount) || policy.minReplicaCount < 1) {
      errors.push(POLICY_ERROR_MSG.MIN_REPLICA_COUNT_MIN);
    }
    if (policy.minReplicaCount % 2 === 0) {
      errors.push(POLICY_ERROR_MSG.MIN_REPLICA_COUNT_ODD);
    }
  }

  if (policy.maxReplicaCount !== undefined) {
    if (!Number.isSafeInteger(policy.maxReplicaCount) || policy.maxReplicaCount < 1) {
      errors.push(POLICY_ERROR_MSG.MAX_REPLICA_COUNT_MIN);
    }
    if (policy.maxReplicaCount % 2 === 0) {
      errors.push(POLICY_ERROR_MSG.MAX_REPLICA_COUNT_ODD);
    }
  }

  const min = policy.minReplicaCount ?? DEFAULT_TABLE_POLICY.minReplicaCount;
  const max = policy.maxReplicaCount ?? DEFAULT_TABLE_POLICY.maxReplicaCount;

  if (min > max) {
    errors.push(POLICY_ERROR_MSG.MIN_GT_MAX);
  }

  if (policy.splitStorageThreshold !== undefined &&
      policy.splitStorageThreshold < 0) {
    errors.push(POLICY_ERROR_MSG.SPLIT_STORAGE_NONNEGATIVE);
  }
  if (policy.splitTrafficThreshold !== undefined &&
      policy.splitTrafficThreshold < 0) {
    errors.push(POLICY_ERROR_MSG.SPLIT_TRAFFIC_NONNEGATIVE);
  }
  if (policy.mergeStorageThreshold !== undefined &&
      policy.mergeStorageThreshold < 0) {
    errors.push(POLICY_ERROR_MSG.MERGE_STORAGE_NONNEGATIVE);
  }
  if (policy.mergeTrafficThreshold !== undefined &&
      policy.mergeTrafficThreshold < 0) {
    errors.push(POLICY_ERROR_MSG.MERGE_TRAFFIC_NONNEGATIVE);
  }

  if (policy.placementConstraints !== undefined &&
      policy.placementConstraints &&
      typeof policy.placementConstraints === 'object') {
    errors.push(...validatePlacement(policy.placementConstraints));
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function assertValidTablePolicy(policy) {
  const validation = validateTablePolicy(policy);
  if (!validation.valid) {
    throw buildPolicyRefusal(
      validation.code || POLICY_ERROR_CODE.POLICY_INVALID,
      `${POLICY_ERROR_MSG.INVALID_POLICY_PREFIX}${validation.errors.join(POLICY_ERROR_SEPARATOR)}`,
    );
  }
  return policy;
}

/**
 * Validate a message group policy object.
 * @param {Object} policy - Policy to validate.
 * @param {Function} validatePlacement - Placement constraint validator.
 * @return {Object} Validation result {valid, errors}.
 */
function validateMessageGroupPolicy(
  policy,
  validatePlacement = validatePlacementConstraints,
) {
  const errors = [];

  if (!policy || typeof policy !== POLICY_OBJECT_TYPE || Array.isArray(policy)) {
    return {valid: false, errors: [POLICY_ERROR_MSG.POLICY_OBJECT_REQUIRED]};
  }

  for (const [field, expectedType] of Object.entries(
    MESSAGE_GROUP_POLICY_FIELD_TYPES,
  )) {
    if (policy[field] !== undefined) {
      const actualType = typeof policy[field];
      if (actualType !== expectedType) {
        errors.push(POLICY_ERROR_MSG.fieldTypeMismatch(
          field, expectedType, actualType,
        ));
      }
      if (actualType === POLICY_NUMBER_TYPE && !Number.isFinite(policy[field])) {
        errors.push(POLICY_ERROR_MSG.fieldFiniteRequired(field));
      }
    }
  }

  if (policy.minReplicaCount !== undefined) {
    if (typeof policy.minReplicaCount !== POLICY_NUMBER_TYPE) {
      errors.push(POLICY_ERROR_MSG.fieldTypeMismatch(
        LOCAL_STR_MIN_REPLICA_COUNT,
        POLICY_NUMBER_TYPE,
        typeof policy.minReplicaCount,
      ));
    } else {
      if (!Number.isSafeInteger(policy.minReplicaCount) ||
          policy.minReplicaCount < 1) {
        errors.push(POLICY_ERROR_MSG.MIN_REPLICA_COUNT_MIN);
      }
      if (policy.minReplicaCount % 2 === 0) {
        errors.push(POLICY_ERROR_MSG.MIN_REPLICA_COUNT_ODD);
      }
    }
  }

  if (policy.targetReplicaCount !== undefined) {
    if (!Number.isSafeInteger(policy.targetReplicaCount) ||
        policy.targetReplicaCount < 1) {
      errors.push(POLICY_ERROR_MSG.REPLICA_COUNT_MIN);
    }
    if (policy.targetReplicaCount % 2 === 0) {
      errors.push(POLICY_ERROR_MSG.REPLICA_COUNT_ODD);
    }
  }

  if (policy.maxReplicaCount !== undefined) {
    if (!Number.isSafeInteger(policy.maxReplicaCount) ||
        policy.maxReplicaCount < 1) {
      errors.push(POLICY_ERROR_MSG.MAX_REPLICA_COUNT_MIN);
    }
    if (policy.maxReplicaCount % 2 === 0) {
      errors.push(POLICY_ERROR_MSG.MAX_REPLICA_COUNT_ODD);
    }
  }

  const target = policy.targetReplicaCount ??
    DEFAULT_MESSAGE_GROUP_POLICY.targetReplicaCount;
  const max = policy.maxReplicaCount ??
    DEFAULT_MESSAGE_GROUP_POLICY.maxReplicaCount;
  const min = policy.minReplicaCount ?? target;
  if (min > max) {
    errors.push(POLICY_ERROR_MSG.MIN_GT_MAX);
  }
  if (target < min || target > max) {
    errors.push(POLICY_ERROR_MSG.REPLICA_BETWEEN);
  }

  if (policy.placementConstraints !== undefined &&
      policy.placementConstraints &&
      typeof policy.placementConstraints === 'object') {
    errors.push(
      ...validatePlacement(
        policy.placementConstraints,
      ),
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function assertValidMessageGroupPolicy(policy) {
  const validation = validateMessageGroupPolicy(policy);
  if (!validation.valid) {
    throw buildPolicyRefusal(
      validation.code || POLICY_ERROR_CODE.POLICY_INVALID,
      `${POLICY_ERROR_MSG.INVALID_POLICY_PREFIX}${validation.errors.join(POLICY_ERROR_SEPARATOR)}`,
    );
  }
  return policy;
}

export {
  assertValidMessageGroupPolicy,
  assertValidTablePolicy,
  buildPolicyAuthorityDecision,
  buildPolicyRefusal,
  evaluateMessageGroupTargetDeclaration,
  extractStorageConstraints,
  hasOwnRawReplicaCount,
  mergeStoredTablePolicyOverrides,
  resolveConfiguredTablePolicyDefaults,
  validateMessageGroupPolicy,
  validatePlacementConstraints,
  validateTablePolicy,
};
