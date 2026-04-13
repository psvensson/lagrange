/**
 * Constants for migration phase exit criteria.
 *
 * Defines the migration phases from the control-plane predictability
 * and determinism spec (Requirement 10), their measurable exit gates,
 * and rollback notes for each phase.
 *
 * Requirements: 10.1, 10.2
 */
// @ts-nocheck


/**
 * Migration phase identifiers.
 * Each phase represents a distinct stage of the control-plane
 * migration with one owner path per phase.
 * @enum {string}
 */function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
const MIGRATION_PHASE = Object.freeze(stryMutAct_9fa48("69905") ? {} : (stryCov_9fa48("69905"), {
  QUEUE_OWNER_PATH: stryMutAct_9fa48("69906") ? "" : (stryCov_9fa48("69906"), 'queue_owner_path'),
  WORKFLOW_TRANSACTION: stryMutAct_9fa48("69907") ? "" : (stryCov_9fa48("69907"), 'workflow_transaction'),
  READ_MODEL_READINESS: stryMutAct_9fa48("69908") ? "" : (stryCov_9fa48("69908"), 'read_model_readiness'),
  TIMEOUT_INVARIANT: stryMutAct_9fa48("69909") ? "" : (stryCov_9fa48("69909"), 'timeout_invariant'),
  DUAL_PATH_REMOVAL: stryMutAct_9fa48("69910") ? "" : (stryCov_9fa48("69910"), 'dual_path_removal')
}));

/**
 * Ordered list of migration phases for sequential evaluation.
 * @type {ReadonlyArray<string>}
 */
const MIGRATION_PHASE_ORDER = Object.freeze(stryMutAct_9fa48("69911") ? [] : (stryCov_9fa48("69911"), [MIGRATION_PHASE.QUEUE_OWNER_PATH, MIGRATION_PHASE.WORKFLOW_TRANSACTION, MIGRATION_PHASE.READ_MODEL_READINESS, MIGRATION_PHASE.TIMEOUT_INVARIANT, MIGRATION_PHASE.DUAL_PATH_REMOVAL]));

/**
 * Exit gate identifiers. Each gate is a measurable condition
 * that must be satisfied before a phase is considered complete.
 * @enum {string}
 */
const EXIT_GATE = Object.freeze(stryMutAct_9fa48("69912") ? {} : (stryCov_9fa48("69912"), {
  NO_DIRECT_PROGRESSION_IN_HANDLERS: stryMutAct_9fa48("69913") ? "" : (stryCov_9fa48("69913"), 'no_direct_progression_in_handlers'),
  SINGLE_INFLIGHT_PER_OWNER_KEY: stryMutAct_9fa48("69914") ? "" : (stryCov_9fa48("69914"), 'single_inflight_per_owner_key'),
  NO_ADHOC_MULTI_ROW_COMMITS: stryMutAct_9fa48("69915") ? "" : (stryCov_9fa48("69915"), 'no_adhoc_multi_row_commits'),
  WORKFLOW_HISTORY_MONOTONIC: stryMutAct_9fa48("69916") ? "" : (stryCov_9fa48("69916"), 'workflow_history_monotonic'),
  SINGLE_READ_MODEL_PER_DECISION: stryMutAct_9fa48("69917") ? "" : (stryCov_9fa48("69917"), 'single_read_model_per_decision'),
  DIVERGENCE_EVENTS_TYPED: stryMutAct_9fa48("69918") ? "" : (stryCov_9fa48("69918"), 'divergence_events_typed'),
  TIMEOUT_CLASSES_EMITTED: stryMutAct_9fa48("69919") ? "" : (stryCov_9fa48("69919"), 'timeout_classes_emitted'),
  HARD_INVARIANT_GATES_ENFORCED: stryMutAct_9fa48("69920") ? "" : (stryCov_9fa48("69920"), 'hard_invariant_gates_enforced'),
  NO_DUAL_PROGRESSION_PATHS: stryMutAct_9fa48("69921") ? "" : (stryCov_9fa48("69921"), 'no_dual_progression_paths'),
  DOCUMENTATION_MATCHES_IMPLEMENTATION: stryMutAct_9fa48("69922") ? "" : (stryCov_9fa48("69922"), 'documentation_matches_implementation')
}));

/**
 * Phase exit gate definitions. Maps each phase to its required
 * exit gates with human-readable descriptions.
 * @type {Object<string, ReadonlyArray<Object>>}
 */
const PHASE_EXIT_GATES = Object.freeze(stryMutAct_9fa48("69923") ? {} : (stryCov_9fa48("69923"), {
  [MIGRATION_PHASE.QUEUE_OWNER_PATH]: Object.freeze(stryMutAct_9fa48("69924") ? [] : (stryCov_9fa48("69924"), [Object.freeze(stryMutAct_9fa48("69925") ? {} : (stryCov_9fa48("69925"), {
    gateId: EXIT_GATE.NO_DIRECT_PROGRESSION_IN_HANDLERS,
    description: stryMutAct_9fa48("69926") ? "" : (stryCov_9fa48("69926"), 'No direct long-running progression remains in event handlers')
  })), Object.freeze(stryMutAct_9fa48("69927") ? {} : (stryCov_9fa48("69927"), {
    gateId: EXIT_GATE.SINGLE_INFLIGHT_PER_OWNER_KEY,
    description: stryMutAct_9fa48("69928") ? "" : (stryCov_9fa48("69928"), 'Per-owner-key single in-flight contract is enforced by tests')
  }))])),
  [MIGRATION_PHASE.WORKFLOW_TRANSACTION]: Object.freeze(stryMutAct_9fa48("69929") ? [] : (stryCov_9fa48("69929"), [Object.freeze(stryMutAct_9fa48("69930") ? {} : (stryCov_9fa48("69930"), {
    gateId: EXIT_GATE.NO_ADHOC_MULTI_ROW_COMMITS,
    description: stryMutAct_9fa48("69931") ? "" : (stryCov_9fa48("69931"), 'No ad-hoc multi-row progression commits remain in target paths')
  })), Object.freeze(stryMutAct_9fa48("69932") ? {} : (stryCov_9fa48("69932"), {
    gateId: EXIT_GATE.WORKFLOW_HISTORY_MONOTONIC,
    description: stryMutAct_9fa48("69933") ? "" : (stryCov_9fa48("69933"), 'Workflow transition history is complete and monotonic')
  }))])),
  [MIGRATION_PHASE.READ_MODEL_READINESS]: Object.freeze(stryMutAct_9fa48("69934") ? [] : (stryCov_9fa48("69934"), [Object.freeze(stryMutAct_9fa48("69935") ? {} : (stryCov_9fa48("69935"), {
    gateId: EXIT_GATE.SINGLE_READ_MODEL_PER_DECISION,
    description: stryMutAct_9fa48("69936") ? "" : (stryCov_9fa48("69936"), 'Each decision path declares one read-model contract')
  })), Object.freeze(stryMutAct_9fa48("69937") ? {} : (stryCov_9fa48("69937"), {
    gateId: EXIT_GATE.DIVERGENCE_EVENTS_TYPED,
    description: stryMutAct_9fa48("69938") ? "" : (stryCov_9fa48("69938"), 'Divergence events are typed and visible in diagnostics')
  }))])),
  [MIGRATION_PHASE.TIMEOUT_INVARIANT]: Object.freeze(stryMutAct_9fa48("69939") ? [] : (stryCov_9fa48("69939"), [Object.freeze(stryMutAct_9fa48("69940") ? {} : (stryCov_9fa48("69940"), {
    gateId: EXIT_GATE.TIMEOUT_CLASSES_EMITTED,
    description: stryMutAct_9fa48("69941") ? "" : (stryCov_9fa48("69941"), 'Timeout classes are emitted for all control-plane timeout outcomes')
  })), Object.freeze(stryMutAct_9fa48("69942") ? {} : (stryCov_9fa48("69942"), {
    gateId: EXIT_GATE.HARD_INVARIANT_GATES_ENFORCED,
    description: stryMutAct_9fa48("69943") ? "" : (stryCov_9fa48("69943"), 'Hard invariant violations fail regression tests')
  }))])),
  [MIGRATION_PHASE.DUAL_PATH_REMOVAL]: Object.freeze(stryMutAct_9fa48("69944") ? [] : (stryCov_9fa48("69944"), [Object.freeze(stryMutAct_9fa48("69945") ? {} : (stryCov_9fa48("69945"), {
    gateId: EXIT_GATE.NO_DUAL_PROGRESSION_PATHS,
    description: stryMutAct_9fa48("69946") ? "" : (stryCov_9fa48("69946"), 'No remaining dual progression paths for migrated concerns')
  })), Object.freeze(stryMutAct_9fa48("69947") ? {} : (stryCov_9fa48("69947"), {
    gateId: EXIT_GATE.DOCUMENTATION_MATCHES_IMPLEMENTATION,
    description: stryMutAct_9fa48("69948") ? "" : (stryCov_9fa48("69948"), 'Documentation matches implementation owner boundaries')
  }))]))
}));

/**
 * Rollback notes per phase. Documents what to revert if a phase
 * must be rolled back, and any risks associated with rollback.
 * @type {Object<string, Readonly<{description: string, risks: string}>>}
 */
const PHASE_ROLLBACK_NOTES = Object.freeze(stryMutAct_9fa48("69949") ? {} : (stryCov_9fa48("69949"), {
  [MIGRATION_PHASE.QUEUE_OWNER_PATH]: Object.freeze(stryMutAct_9fa48("69950") ? {} : (stryCov_9fa48("69950"), {
    description: (stryMutAct_9fa48("69951") ? "" : (stryCov_9fa48("69951"), 'Re-enable direct progression in event handlers and remove ')) + (stryMutAct_9fa48("69952") ? "" : (stryCov_9fa48("69952"), 'owner-key reconcile queue enforcement')),
    risks: stryMutAct_9fa48("69953") ? "" : (stryCov_9fa48("69953"), 'Parallel progression may resume for the same owner key')
  })),
  [MIGRATION_PHASE.WORKFLOW_TRANSACTION]: Object.freeze(stryMutAct_9fa48("69954") ? {} : (stryCov_9fa48("69954"), {
    description: (stryMutAct_9fa48("69955") ? "" : (stryCov_9fa48("69955"), 'Revert to local step-transition side channels and remove ')) + (stryMutAct_9fa48("69956") ? "" : (stryCov_9fa48("69956"), 'distributed transaction boundaries from step commits')),
    risks: stryMutAct_9fa48("69957") ? "" : (stryCov_9fa48("69957"), 'Non-atomic multi-row transitions may leave partial state')
  })),
  [MIGRATION_PHASE.READ_MODEL_READINESS]: Object.freeze(stryMutAct_9fa48("69958") ? {} : (stryCov_9fa48("69958"), {
    description: (stryMutAct_9fa48("69959") ? "" : (stryCov_9fa48("69959"), 'Restore cache/SQL fallback paths and component-local ')) + (stryMutAct_9fa48("69960") ? "" : (stryCov_9fa48("69960"), 'readiness heuristics')),
    risks: stryMutAct_9fa48("69961") ? "" : (stryCov_9fa48("69961"), 'Decisions may silently use competing data sources')
  })),
  [MIGRATION_PHASE.TIMEOUT_INVARIANT]: Object.freeze(stryMutAct_9fa48("69962") ? {} : (stryCov_9fa48("69962"), {
    description: (stryMutAct_9fa48("69963") ? "" : (stryCov_9fa48("69963"), 'Remove canonical timeout-budget tree and disable hard ')) + (stryMutAct_9fa48("69964") ? "" : (stryCov_9fa48("69964"), 'invariant gate checks in test layers')),
    risks: (stryMutAct_9fa48("69965") ? "" : (stryCov_9fa48("69965"), 'Timeout clusters revert to unclassified noise and ')) + (stryMutAct_9fa48("69966") ? "" : (stryCov_9fa48("69966"), 'invariant breaches go undetected'))
  })),
  [MIGRATION_PHASE.DUAL_PATH_REMOVAL]: Object.freeze(stryMutAct_9fa48("69967") ? {} : (stryCov_9fa48("69967"), {
    description: (stryMutAct_9fa48("69968") ? "" : (stryCov_9fa48("69968"), 'Restore temporary migration toggles and duplicate ')) + (stryMutAct_9fa48("69969") ? "" : (stryCov_9fa48("69969"), 'progression branches')),
    risks: stryMutAct_9fa48("69970") ? "" : (stryCov_9fa48("69970"), 'Dual owner paths re-emerge for migrated concerns')
  }))
}));

/**
 * Phase evaluation result status values.
 * @enum {string}
 */
const PHASE_STATUS = Object.freeze(stryMutAct_9fa48("69971") ? {} : (stryCov_9fa48("69971"), {
  PASSED: stryMutAct_9fa48("69972") ? "" : (stryCov_9fa48("69972"), 'passed'),
  FAILED: stryMutAct_9fa48("69973") ? "" : (stryCov_9fa48("69973"), 'failed'),
  UNKNOWN_PHASE: stryMutAct_9fa48("69974") ? "" : (stryCov_9fa48("69974"), 'unknown_phase')
}));

/**
 * Subsystem identifier for phase exit criteria diagnostics.
 * @type {string}
 */
const PHASE_EXIT_SUBSYSTEM = stryMutAct_9fa48("69975") ? "" : (stryCov_9fa48("69975"), 'phase-exit-criteria');
export { EXIT_GATE, MIGRATION_PHASE, MIGRATION_PHASE_ORDER, PHASE_EXIT_GATES, PHASE_EXIT_SUBSYSTEM, PHASE_ROLLBACK_NOTES, PHASE_STATUS };