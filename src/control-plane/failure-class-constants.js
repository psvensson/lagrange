/**
 * Constants for the failure-class registry.
 *
 * The failure-class registry maps harness-discovered failure classes
 * to deterministic test IDs, enforcing the closure policy from
 * Requirement 8: a failure class cannot be closed until a
 * deterministic reproduction exists below full harness scale.
 */

/**
 * Failure class categories discovered by distributed harness runs.
 * Each category represents a distinct class of control-plane failure.
 * @enum {string}
 */
const FAILURE_CLASS = Object.freeze({
  DUAL_LEADER: 'dual_leader',
  BACKWARD_STEP: 'backward_step',
  STALE_CLAIM: 'stale_claim',
  ORPHAN_OPERATION: 'orphan_operation',
  TIMEOUT_BOUNDARY: 'timeout_boundary',
  CDC_DIVERGENCE: 'cdc_divergence',
});

/**
 * Status values for failure class lifecycle.
 * - open: failure discovered, no deterministic reproduction yet
 * - reproduced: deterministic test exists but fix not yet verified
 * - closed: deterministic repro + owner-path regression + invariant
 * @enum {string}
 */
const FAILURE_CLASS_STATUS = Object.freeze({
  OPEN: 'open',
  REPRODUCED: 'reproduced',
  CLOSED: 'closed',
});

/**
 * Field names used in failure class entries.
 * @enum {string}
 */
const FAILURE_CLASS_FIELD = Object.freeze({
  FAILURE_CLASS_ID: 'failureClassId',
  INVARIANT_ID: 'invariantId',
  DETERMINISTIC_TEST_ID: 'deterministicTestId',
  STATUS: 'status',
  DESCRIPTION: 'description',
});

/**
 * Subsystem identifier for the failure-class registry.
 * @type {string}
 */
const FAILURE_CLASS_SUBSYSTEM = 'failure-class-registry';

/**
 * Reasons returned by closure-evidence validation.
 * - VALID: deterministic reproduction exists, class is eligible
 * - MISSING_DETERMINISTIC_REPRO: no deterministic test ID attached
 * - HARNESS_ONLY_EVIDENCE: only harness-level evidence, no
 *   deterministic repro below full harness scale
 * - UNKNOWN_FAILURE_CLASS: failure class ID not found in registry
 * @enum {string}
 */
const CLOSURE_VALIDATION_REASON = Object.freeze({
  VALID: 'valid',
  MISSING_DETERMINISTIC_REPRO: 'missing_deterministic_repro',
  HARNESS_ONLY_EVIDENCE: 'harness_only_evidence',
  UNKNOWN_FAILURE_CLASS: 'unknown_failure_class',
});


export {
  CLOSURE_VALIDATION_REASON,
  FAILURE_CLASS,
  FAILURE_CLASS_FIELD,
  FAILURE_CLASS_STATUS,
  FAILURE_CLASS_SUBSYSTEM,
};
