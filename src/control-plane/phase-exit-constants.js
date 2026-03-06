/**
 * Constants for migration phase exit criteria.
 *
 * Defines the migration phases from the control-plane predictability
 * and determinism spec (Requirement 10), their measurable exit gates,
 * and rollback notes for each phase.
 *
 * Requirements: 10.1, 10.2
 */

/**
 * Migration phase identifiers.
 * Each phase represents a distinct stage of the control-plane
 * migration with one owner path per phase.
 * @enum {string}
 */
const MIGRATION_PHASE = Object.freeze({
  QUEUE_OWNER_PATH: 'queue_owner_path',
  WORKFLOW_TRANSACTION: 'workflow_transaction',
  READ_MODEL_READINESS: 'read_model_readiness',
  TIMEOUT_INVARIANT: 'timeout_invariant',
  DUAL_PATH_REMOVAL: 'dual_path_removal',
});

/**
 * Ordered list of migration phases for sequential evaluation.
 * @type {ReadonlyArray<string>}
 */
const MIGRATION_PHASE_ORDER = Object.freeze([
  MIGRATION_PHASE.QUEUE_OWNER_PATH,
  MIGRATION_PHASE.WORKFLOW_TRANSACTION,
  MIGRATION_PHASE.READ_MODEL_READINESS,
  MIGRATION_PHASE.TIMEOUT_INVARIANT,
  MIGRATION_PHASE.DUAL_PATH_REMOVAL,
]);

/**
 * Exit gate identifiers. Each gate is a measurable condition
 * that must be satisfied before a phase is considered complete.
 * @enum {string}
 */
const EXIT_GATE = Object.freeze({
  NO_DIRECT_PROGRESSION_IN_HANDLERS: 'no_direct_progression_in_handlers',
  SINGLE_INFLIGHT_PER_OWNER_KEY: 'single_inflight_per_owner_key',
  NO_ADHOC_MULTI_ROW_COMMITS: 'no_adhoc_multi_row_commits',
  WORKFLOW_HISTORY_MONOTONIC: 'workflow_history_monotonic',
  SINGLE_READ_MODEL_PER_DECISION: 'single_read_model_per_decision',
  DIVERGENCE_EVENTS_TYPED: 'divergence_events_typed',
  TIMEOUT_CLASSES_EMITTED: 'timeout_classes_emitted',
  HARD_INVARIANT_GATES_ENFORCED: 'hard_invariant_gates_enforced',
  NO_DUAL_PROGRESSION_PATHS: 'no_dual_progression_paths',
  DOCUMENTATION_MATCHES_IMPLEMENTATION: 'documentation_matches_implementation',
});

/**
 * Phase exit gate definitions. Maps each phase to its required
 * exit gates with human-readable descriptions.
 * @type {Object<string, ReadonlyArray<Object>>}
 */
const PHASE_EXIT_GATES = Object.freeze({
  [MIGRATION_PHASE.QUEUE_OWNER_PATH]: Object.freeze([
    Object.freeze({
      gateId: EXIT_GATE.NO_DIRECT_PROGRESSION_IN_HANDLERS,
      description:
        'No direct long-running progression remains in event handlers',
    }),
    Object.freeze({
      gateId: EXIT_GATE.SINGLE_INFLIGHT_PER_OWNER_KEY,
      description:
        'Per-owner-key single in-flight contract is enforced by tests',
    }),
  ]),
  [MIGRATION_PHASE.WORKFLOW_TRANSACTION]: Object.freeze([
    Object.freeze({
      gateId: EXIT_GATE.NO_ADHOC_MULTI_ROW_COMMITS,
      description:
        'No ad-hoc multi-row progression commits remain in target paths',
    }),
    Object.freeze({
      gateId: EXIT_GATE.WORKFLOW_HISTORY_MONOTONIC,
      description:
        'Workflow transition history is complete and monotonic',
    }),
  ]),
  [MIGRATION_PHASE.READ_MODEL_READINESS]: Object.freeze([
    Object.freeze({
      gateId: EXIT_GATE.SINGLE_READ_MODEL_PER_DECISION,
      description:
        'Each decision path declares one read-model contract',
    }),
    Object.freeze({
      gateId: EXIT_GATE.DIVERGENCE_EVENTS_TYPED,
      description:
        'Divergence events are typed and visible in diagnostics',
    }),
  ]),
  [MIGRATION_PHASE.TIMEOUT_INVARIANT]: Object.freeze([
    Object.freeze({
      gateId: EXIT_GATE.TIMEOUT_CLASSES_EMITTED,
      description:
        'Timeout classes are emitted for all control-plane timeout outcomes',
    }),
    Object.freeze({
      gateId: EXIT_GATE.HARD_INVARIANT_GATES_ENFORCED,
      description:
        'Hard invariant violations fail regression tests',
    }),
  ]),
  [MIGRATION_PHASE.DUAL_PATH_REMOVAL]: Object.freeze([
    Object.freeze({
      gateId: EXIT_GATE.NO_DUAL_PROGRESSION_PATHS,
      description:
        'No remaining dual progression paths for migrated concerns',
    }),
    Object.freeze({
      gateId: EXIT_GATE.DOCUMENTATION_MATCHES_IMPLEMENTATION,
      description:
        'Documentation matches implementation owner boundaries',
    }),
  ]),
});

/**
 * Rollback notes per phase. Documents what to revert if a phase
 * must be rolled back, and any risks associated with rollback.
 * @type {Object<string, Readonly<{description: string, risks: string}>>}
 */
const PHASE_ROLLBACK_NOTES = Object.freeze({
  [MIGRATION_PHASE.QUEUE_OWNER_PATH]: Object.freeze({
    description:
      'Re-enable direct progression in event handlers and remove ' +
      'owner-key reconcile queue enforcement',
    risks:
      'Parallel progression may resume for the same owner key',
  }),
  [MIGRATION_PHASE.WORKFLOW_TRANSACTION]: Object.freeze({
    description:
      'Revert to local step-transition side channels and remove ' +
      'distributed transaction boundaries from step commits',
    risks:
      'Non-atomic multi-row transitions may leave partial state',
  }),
  [MIGRATION_PHASE.READ_MODEL_READINESS]: Object.freeze({
    description:
      'Restore cache/SQL fallback paths and component-local ' +
      'readiness heuristics',
    risks:
      'Decisions may silently use competing data sources',
  }),
  [MIGRATION_PHASE.TIMEOUT_INVARIANT]: Object.freeze({
    description:
      'Remove canonical timeout-budget tree and disable hard ' +
      'invariant gate checks in test layers',
    risks:
      'Timeout clusters revert to unclassified noise and ' +
      'invariant breaches go undetected',
  }),
  [MIGRATION_PHASE.DUAL_PATH_REMOVAL]: Object.freeze({
    description:
      'Restore temporary migration toggles and duplicate ' +
      'progression branches',
    risks:
      'Dual owner paths re-emerge for migrated concerns',
  }),
});

/**
 * Phase evaluation result status values.
 * @enum {string}
 */
const PHASE_STATUS = Object.freeze({
  PASSED: 'passed',
  FAILED: 'failed',
  UNKNOWN_PHASE: 'unknown_phase',
});

/**
 * Subsystem identifier for phase exit criteria diagnostics.
 * @type {string}
 */
const PHASE_EXIT_SUBSYSTEM = 'phase-exit-criteria';

export {
  EXIT_GATE,
  MIGRATION_PHASE,
  MIGRATION_PHASE_ORDER,
  PHASE_EXIT_GATES,
  PHASE_EXIT_SUBSYSTEM,
  PHASE_ROLLBACK_NOTES,
  PHASE_STATUS,
};
