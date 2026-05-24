import {NUM, TYPEOF} from '../constants/index.js';
import {
  STORAGE_PLACEMENT_CONSTRAINT,
} from '../rebalancer/storage-capacity-constants.js';
import {
  DEFAULT_MESSAGE_GROUP_POLICY,
  DEFAULT_TABLE_POLICY,
  MESSAGE_GROUP_POLICY_FIELD_TYPES,
  POLICY_ERROR_MSG,
  POLICY_FIELD_TYPES,
} from './policy-constants.js';

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
  if (typeof minFree === TYPEOF.NUMBER && minFree < NUM.ZERO) {
    errors.push(POLICY_ERROR_MSG.PLACEMENT_MIN_FREE_NONNEGATIVE);
  }

  const maxUtil = placementConstraints[
    STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT
  ];
  if (typeof maxUtil === TYPEOF.NUMBER &&
      (maxUtil < NUM.ZERO || maxUtil > NUM.HUNDRED)) {
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
    }
  }

  if (policy.replicaCount !== undefined) {
    if (policy.replicaCount < NUM.ONE) {
      errors.push(POLICY_ERROR_MSG.REPLICA_COUNT_MIN);
    }
    if (policy.replicaCount % NUM.TWO === NUM.ZERO) {
      errors.push(POLICY_ERROR_MSG.REPLICA_COUNT_ODD);
    }
  }

  if (policy.minReplicaCount !== undefined) {
    if (policy.minReplicaCount < NUM.ONE) {
      errors.push(POLICY_ERROR_MSG.MIN_REPLICA_COUNT_MIN);
    }
    if (policy.minReplicaCount % NUM.TWO === NUM.ZERO) {
      errors.push(POLICY_ERROR_MSG.MIN_REPLICA_COUNT_ODD);
    }
  }

  if (policy.maxReplicaCount !== undefined) {
    if (policy.maxReplicaCount < NUM.ONE) {
      errors.push(POLICY_ERROR_MSG.MAX_REPLICA_COUNT_MIN);
    }
    if (policy.maxReplicaCount % NUM.TWO === NUM.ZERO) {
      errors.push(POLICY_ERROR_MSG.MAX_REPLICA_COUNT_ODD);
    }
  }

  const min = policy.minReplicaCount || DEFAULT_TABLE_POLICY.minReplicaCount;
  const max = policy.maxReplicaCount || DEFAULT_TABLE_POLICY.maxReplicaCount;
  const replica = policy.replicaCount || DEFAULT_TABLE_POLICY.replicaCount;

  if (min > max) {
    errors.push(POLICY_ERROR_MSG.MIN_GT_MAX);
  }
  if (replica < min || replica > max) {
    errors.push(POLICY_ERROR_MSG.REPLICA_BETWEEN);
  }

  if (policy.splitStorageThreshold !== undefined &&
      policy.splitStorageThreshold < NUM.ZERO) {
    errors.push(POLICY_ERROR_MSG.SPLIT_STORAGE_NONNEGATIVE);
  }
  if (policy.splitTrafficThreshold !== undefined &&
      policy.splitTrafficThreshold < NUM.ZERO) {
    errors.push(POLICY_ERROR_MSG.SPLIT_TRAFFIC_NONNEGATIVE);
  }
  if (policy.mergeStorageThreshold !== undefined &&
      policy.mergeStorageThreshold < NUM.ZERO) {
    errors.push(POLICY_ERROR_MSG.MERGE_STORAGE_NONNEGATIVE);
  }
  if (policy.mergeTrafficThreshold !== undefined &&
      policy.mergeTrafficThreshold < NUM.ZERO) {
    errors.push(POLICY_ERROR_MSG.MERGE_TRAFFIC_NONNEGATIVE);
  }

  if (policy.placementConstraints !== undefined &&
      policy.placementConstraints &&
      typeof policy.placementConstraints === TYPEOF.OBJECT) {
    errors.push(...validatePlacement(policy.placementConstraints));
  }

  return {
    valid: errors.length === NUM.ZERO,
    errors,
  };
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
    }
  }

  if (policy.targetReplicaCount !== undefined) {
    if (policy.targetReplicaCount < NUM.ONE) {
      errors.push(POLICY_ERROR_MSG.REPLICA_COUNT_MIN);
    }
    if (policy.targetReplicaCount % NUM.TWO === NUM.ZERO) {
      errors.push(POLICY_ERROR_MSG.REPLICA_COUNT_ODD);
    }
  }

  if (policy.maxReplicaCount !== undefined) {
    if (policy.maxReplicaCount < NUM.ONE) {
      errors.push(POLICY_ERROR_MSG.MAX_REPLICA_COUNT_MIN);
    }
    if (policy.maxReplicaCount % NUM.TWO === NUM.ZERO) {
      errors.push(POLICY_ERROR_MSG.MAX_REPLICA_COUNT_ODD);
    }
  }

  const target = policy.targetReplicaCount ||
    DEFAULT_MESSAGE_GROUP_POLICY.targetReplicaCount;
  const max = policy.maxReplicaCount ||
    DEFAULT_MESSAGE_GROUP_POLICY.maxReplicaCount;
  if (target > max) {
    errors.push(POLICY_ERROR_MSG.REPLICA_BETWEEN);
  }

  if (policy.placementConstraints !== undefined &&
      policy.placementConstraints &&
      typeof policy.placementConstraints === TYPEOF.OBJECT) {
    errors.push(
      ...validatePlacement(
        policy.placementConstraints,
      ),
    );
  }

  return {
    valid: errors.length === NUM.ZERO,
    errors,
  };
}

export {
  extractStorageConstraints,
  validateMessageGroupPolicy,
  validatePlacementConstraints,
  validateTablePolicy,
};
