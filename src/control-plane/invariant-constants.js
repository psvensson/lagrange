/**
 * Constants for the control-plane invariant engine.
 *
 * The invariant engine evaluates a canonical set of control-plane
 * correctness invariants at bounded checkpoints. Each invariant
 * produces a typed result tagged with hard/soft severity.
 *
 * Requirements: 7.1, 7.2, 7.3
 */

/**
 * Severity levels for invariant outcomes.
 * Hard invariants must fail deterministic test gates.
 * Soft invariants are diagnostic warnings.
 * @enum {string}
 */
const INVARIANT_OUTCOME_SEVERITY = Object.freeze({
  HARD: 'hard',
  SOFT: 'soft',
});

/**
 * Typed reason codes for invariant evaluation outcomes.
 * @enum {string}
 */
const INVARIANT_REASON = Object.freeze({
  /** Leader uniqueness: multiple leaders found for same entity. */
  DUPLICATE_LEADER_DETECTED: 'duplicate_leader_detected',
  /** Leader uniqueness: all entities have at most one leader. */
  LEADER_UNIQUE: 'leader_unique',

  /** Monotonic steps: backward transition detected. */
  BACKWARD_STEP_DETECTED: 'backward_step_detected',
  /** Monotonic steps: all transitions are monotonic. */
  STEPS_MONOTONIC: 'steps_monotonic',

  /** Claim exclusivity: duplicate active claim detected. */
  DUPLICATE_CLAIM_DETECTED: 'duplicate_claim_detected',
  /** Claim exclusivity: all claims are exclusive. */
  CLAIMS_EXCLUSIVE: 'claims_exclusive',

  /** Orphan in-flight: operation without owner key detected. */
  ORPHAN_DETECTED: 'orphan_detected',
  /** Orphan in-flight: all in-flight operations have owner keys. */
  NO_ORPHANS: 'no_orphans',
});

/**
 * Subsystem identifier for the invariant engine.
 * @type {string}
 */
const INVARIANT_ENGINE_SUBSYSTEM = 'invariant-engine';

/**
 * Field names for invariant diagnostics bundles.
 * @enum {string}
 */
const INVARIANT_BUNDLE_FIELD = Object.freeze({
  SUMMARY: 'summary',
  BREACHES: 'breaches',
  TIMESTAMP: 'timestamp',
  TOTAL: 'total',
  PASSED: 'passed',
  FAILED: 'failed',
  HARD_FAILURES: 'hardFailures',
  SOFT_FAILURES: 'softFailures',
});

/**
 * Error message for the invariant gate when hard invariants fail.
 * @type {string}
 */
const INVARIANT_GATE_ERROR_MESSAGE =
  'Hard invariant gate failed: one or more hard invariants breached';

export {
  INVARIANT_BUNDLE_FIELD,
  INVARIANT_ENGINE_SUBSYSTEM,
  INVARIANT_GATE_ERROR_MESSAGE,
  INVARIANT_OUTCOME_SEVERITY,
  INVARIANT_REASON,
};
