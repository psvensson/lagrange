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

  /** Single-writer: non-owner wrote owner-managed workflow fields. */
  REPLICA_OPERATION_MULTI_WRITER_DETECTED:
    'replica_operation_multi_writer_detected',
  /** Single-writer: only canonical owner wrote owner-managed fields. */
  REPLICA_OPERATION_SINGLE_WRITER:
    'replica_operation_single_writer',

  /** Ack-before-advance: phase advanced without durable acknowledgement. */
  PHASE_ADVANCED_WITHOUT_ACK: 'phase_advanced_without_ack',
  /** Ack-before-advance: phase advancement followed acknowledgement rules. */
  ACK_BEFORE_ADVANCE_ENFORCED: 'ack_before_advance_enforced',

  /** Split resume: resumable workflow metadata is incomplete. */
  SPLIT_RESUME_INCOMPLETE: 'split_resume_incomplete',
  /** Split resume: resumable workflow metadata is complete. */
  SPLIT_RESUME_COMPLETE: 'split_resume_complete',

  /** Readiness: a consumer used the wrong readiness dimension. */
  READINESS_DIMENSION_INCORRECT: 'readiness_dimension_incorrect',
  /** Readiness: dimensions and derived outcomes are correct. */
  READINESS_DIMENSION_CORRECT: 'readiness_dimension_correct',

  /** Transaction: required transaction coordinator was absent. */
  TRANSACTION_COORDINATOR_MISSING: 'transaction_coordinator_missing',
  /** Transaction: required transaction coordinator was available. */
  TRANSACTION_COORDINATOR_AVAILABLE: 'transaction_coordinator_available',

  /** Operation progress: dispatched operations exceeded bounded steps. */
  OPERATION_PROGRESS_BOUND_EXCEEDED:
    'operation_progress_bound_exceeded',
  /** Operation progress: dispatched operations reached terminal state. */
  OPERATION_PROGRESS_BOUNDED:
    'operation_progress_bounded',

  /** Publication: accepted publication is neither visible nor retained. */
  ACCEPTED_PUBLICATION_WITHOUT_VISIBILITY_OR_RETRY:
    'accepted_publication_without_visibility_or_retry',
  /** Publication: accepted publications are visible or explicitly retained. */
  PUBLICATION_VISIBLE_OR_RETAINED:
    'publication_visible_or_retained',

  /** Snapshot coverage: coverage regressed while no failure was declared. */
  SNAPSHOT_COVERAGE_REGRESSED:
    'snapshot_coverage_regressed',
  /** Snapshot coverage: coverage monotonically advanced. */
  SNAPSHOT_COVERAGE_MONOTONIC:
    'snapshot_coverage_monotonic',
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
  ARTIFACT_RECORDS: 'artifactRecords',
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
