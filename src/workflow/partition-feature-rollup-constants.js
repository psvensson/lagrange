/**
 * Constants for Scenario C In-Partition Feature Rollup & Epoch-Lazy Backfill.
 */

export const ROLLUP_RESOLUTION_MS = Object.freeze({
  ONE_SECOND: 1000,
  ONE_MINUTE: 60000,
});

export const ROLLUP_DEFAULT_CONFIG = Object.freeze({
  DEFAULT_WINDOW_MS: 900000,
  EXTENDED_WINDOW_MS: 1800000,
  INITIAL_RULE_EPOCH: 1,
  DEFAULT_BATCH_SIZE: 32,
  RISK_DECISION_THRESHOLD: 100,
  SKETCH_MODULUS: 31,
});

export const ROLLUP_DEFAULT_WEIGHTS = Object.freeze({
  COUNT_WEIGHT: 10,
  AMOUNT_CENTS_DIVISOR: 100,
  MAX_AMOUNT_DIVISOR: 200,
  DEVICE_CARDINALITY_WEIGHT: 15,
  MERCHANT_CARDINALITY_WEIGHT: 12,
  CUSTOM_ATTRIBUTE_WEIGHT: 25,
});

export const ROLLUP_DECISION_OUTCOME = Object.freeze({
  ALLOW: 'allow',
  REVIEW: 'review',
});

export const ROLLUP_ERROR_MSG = Object.freeze({
  ENTITY_ID_REQUIRED: 'PartitionFeatureRollupStore requires a non-empty entityId',
  INVALID_RULE_EPOCH: 'Rule epoch must be a positive integer >= activeRuleEpoch',
  STORE_REQUIRED: 'EpochLazyFeatureBackfillCoordinator requires a rollupStore',
});
