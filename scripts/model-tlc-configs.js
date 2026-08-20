import path from 'node:path';

const CONFIGS = [
  {
    id: 'operation-ledger-self-move-waiter-fairness-fixed',
    mode: 'operation-ledger-self-move-waiter-fairness-fixed',
    module: path.resolve(
      'models', 'operation-ledger-self-move-waiter-fairness',
      'OperationLedgerSelfMoveWaiterFairness.tla',
    ),
    cfg: path.resolve(
      'models', 'operation-ledger-self-move-waiter-fairness',
      'OperationLedgerSelfMoveWaiterFairness_fixed.cfg',
    ),
    expectConverged: true,
    report:
      'operation-ledger-self-move-waiter-fairness-fixed.model.report.json',
    scenario: 'operation-ledger-self-move-waiter-fairness',
    owner: 'operation_ledger_self_move_workflow_owner',
    boundary: 'durable_waiter_to_authoritative_idle_dispatch',
  },
  {
    id: 'operation-ledger-self-move-waiter-fairness-admission-only',
    mode: 'operation-ledger-self-move-waiter-fairness-admission-only',
    module: path.resolve(
      'models', 'operation-ledger-self-move-waiter-fairness',
      'OperationLedgerSelfMoveWaiterFairness.tla',
    ),
    cfg: path.resolve(
      'models', 'operation-ledger-self-move-waiter-fairness',
      'OperationLedgerSelfMoveWaiterFairness_admission_only_bug.cfg',
    ),
    expectConverged: false,
    report:
      'operation-ledger-self-move-waiter-fairness-admission-only.' +
      'model.report.json',
    scenario: 'operation-ledger-self-move-waiter-fairness',
    owner: 'operation_ledger_self_move_workflow_owner',
    boundary: 'admission_only_writer_starvation_counterexample',
    expectedFailurePattern:
      'Temporal property EventuallySelfMoveCompletes was violated',
  },
  {
    id: 'versioned-readiness-planning-fixed',
    mode: 'versioned-readiness-planning-fixed',
    module: path.resolve(
      'models', 'readiness-starvation', 'VersionedReadinessPlanning.tla',
    ),
    cfg: path.resolve(
      'models', 'readiness-starvation',
      'VersionedReadinessPlanning_fixed.cfg',
    ),
    expectConverged: true,
    report: 'versioned-readiness-planning-fixed.model.report.json',
    scenario: 'publication-readiness-churn-liveness-closure',
    owner: 'control_plane_readiness_owner',
    boundary: 'versioned_planning_snapshot',
  },
  {
    id: 'versioned-readiness-planning-raw-event-mutant',
    mode: 'versioned-readiness-planning-raw-event-mutant',
    module: path.resolve(
      'models', 'readiness-starvation', 'VersionedReadinessPlanning.tla',
    ),
    cfg: path.resolve(
      'models', 'readiness-starvation',
      'VersionedReadinessPlanning_raw_event_bug.cfg',
    ),
    expectConverged: false,
    report: 'versioned-readiness-planning-raw-event-mutant.model.report.json',
    scenario: 'publication-readiness-churn-liveness-closure',
    owner: 'control_plane_readiness_owner',
    boundary: 'versioned_planning_snapshot',
    expectedFailurePattern: 'Invariant HeavyWorkTurnBounded is violated',
  },
  {
    id: 'versioned-readiness-planning-recursion-mutant',
    mode: 'versioned-readiness-planning-recursion-mutant',
    module: path.resolve(
      'models', 'readiness-starvation', 'VersionedReadinessPlanning.tla',
    ),
    cfg: path.resolve(
      'models', 'readiness-starvation',
      'VersionedReadinessPlanning_recursion_bug.cfg',
    ),
    expectConverged: false,
    report: 'versioned-readiness-planning-recursion-mutant.model.report.json',
    scenario: 'publication-readiness-churn-liveness-closure',
    owner: 'control_plane_readiness_owner',
    boundary: 'readiness_internal_owner_read',
    expectedFailurePattern: 'Invariant OwnerReadNonAmplifying is violated',
  },
  {
    id: 'versioned-readiness-planning-stale-positive-mutant',
    mode: 'versioned-readiness-planning-stale-positive-mutant',
    module: path.resolve(
      'models', 'readiness-starvation', 'VersionedReadinessPlanning.tla',
    ),
    cfg: path.resolve(
      'models', 'readiness-starvation',
      'VersionedReadinessPlanning_stale_positive_bug.cfg',
    ),
    expectConverged: false,
    report:
      'versioned-readiness-planning-stale-positive-mutant.model.report.json',
    scenario: 'publication-readiness-churn-liveness-closure',
    owner: 'control_plane_readiness_owner',
    boundary: 'versioned_planning_snapshot',
    expectedFailurePattern: 'Invariant NoStalePositive is violated',
  },
  {
    id: 'versioned-readiness-planning-undeclared-dependency-mutant',
    mode: 'versioned-readiness-planning-undeclared-dependency-mutant',
    module: path.resolve(
      'models', 'readiness-starvation', 'VersionedReadinessPlanning.tla',
    ),
    cfg: path.resolve(
      'models', 'readiness-starvation',
      'VersionedReadinessPlanning_undeclared_dependency_bug.cfg',
    ),
    expectConverged: false,
    report:
      'versioned-readiness-planning-undeclared-dependency-mutant.model.report.json',
    scenario: 'publication-readiness-churn-liveness-closure',
    owner: 'control_plane_readiness_owner',
    boundary: 'versioned_planning_snapshot',
    expectedFailurePattern: 'Invariant NoStalePositive is violated',
  },
  {
    id: 'versioned-readiness-planning-formation-priority-starvation-mutant',
    mode: 'versioned-readiness-planning-formation-priority-starvation-mutant',
    module: path.resolve(
      'models', 'readiness-starvation', 'VersionedReadinessPlanning.tla',
    ),
    cfg: path.resolve(
      'models', 'readiness-starvation',
      'VersionedReadinessPlanning_formation_priority_starvation_bug.cfg',
    ),
    expectConverged: false,
    report:
      'versioned-readiness-planning-formation-priority-starvation-mutant.' +
      'model.report.json',
    scenario: 'publication-readiness-churn-liveness-closure',
    owner: 'control_plane_planning_scheduler_owner',
    boundary: 'macrotask_bounded_round_robin',
    expectedFailurePattern:
      'Temporal property EventuallyAllOwnersServed was violated',
  },
  {
    id: 'active-gate-route',
    mode: 'route',
    module: path.resolve('models', 'active-gate', 'ActiveGate.tla'),
    cfg: path.resolve('models', 'active-gate', 'ActiveGate_route.cfg'),
    expectConverged: true,
    report: 'active-gate-tlc-route.model.report.json',
    scenario: 'rolling-restart-active-gate-convergence',
    owner: 'active_gate_owner',
    boundary: 'snapshot_coverage',
  },
  {
    id: 'active-gate-stall',
    mode: 'stall',
    module: path.resolve('models', 'active-gate', 'ActiveGate.tla'),
    cfg: path.resolve('models', 'active-gate', 'ActiveGate_stall.cfg'),
    expectConverged: false,
    report: 'active-gate-tlc-stall.model.report.json',
    scenario: 'rolling-restart-active-gate-convergence',
    owner: 'active_gate_owner',
    boundary: 'snapshot_coverage',
    expectedFailurePattern: 'Temporal property EventuallyConverged was violated',
  },
  {
    id: 'readiness-handoff-route',
    mode: 'readiness-route',
    module: path.resolve('models', 'readiness-handoff', 'ReadinessHandoff.tla'),
    cfg: path.resolve('models', 'readiness-handoff', 'ReadinessHandoff_route.cfg'),
    expectConverged: true,
    report: 'readiness-handoff-tlc-route.model.report.json',
    scenario: 'startup-readiness-handoff-liveness',
    owner: 'startup_runtime_handoff_owner',
    boundary: 'readiness_handoff',
  },
  {
    id: 'readiness-handoff-unsafe',
    mode: 'readiness-unsafe',
    module: path.resolve('models', 'readiness-handoff', 'ReadinessHandoff.tla'),
    cfg: path.resolve('models', 'readiness-handoff', 'ReadinessHandoff_unsafe.cfg'),
    expectConverged: false,
    report: 'readiness-handoff-tlc-unsafe.model.report.json',
    scenario: 'startup-readiness-handoff-liveness',
    owner: 'startup_runtime_handoff_owner',
    boundary: 'readiness_handoff',
    expectedFailurePattern:
      'Invariant ReadyRequiresCanonicalServiceability is violated',
  },
  {
    id: 'readiness-handoff-lost-wake',
    mode: 'readiness-lost-wake',
    module: path.resolve('models', 'readiness-handoff', 'ReadinessHandoff.tla'),
    cfg: path.resolve('models', 'readiness-handoff', 'ReadinessHandoff_lost_wake.cfg'),
    expectConverged: false,
    report: 'readiness-handoff-tlc-lost-wake.model.report.json',
    scenario: 'startup-readiness-handoff-liveness',
    owner: 'startup_runtime_handoff_owner',
    boundary: 'readiness_handoff',
    expectedFailurePattern:
      'Invariant DeferredOutcomeHasRecoverableWake is violated',
  },
  {
    id: 'durable-rejoin-formation-barrier-fixed',
    mode: 'durable-rejoin-formation-barrier-fixed',
    module: path.resolve(
      'models', 'durable-rejoin-formation-barrier',
      'DurableRejoinFormationBarrier.tla',
    ),
    cfg: path.resolve(
      'models', 'durable-rejoin-formation-barrier',
      'DurableRejoinFormationBarrier_fixed.cfg',
    ),
    expectConverged: true,
    report: 'durable-rejoin-formation-barrier-fixed.model.report.json',
    scenario: 'rolling-restart-durable-rejoin-formation-barrier-model',
    owner: 'node_joining_operation_ledger_formation_owner',
    boundary: 'ready_lease_publication',
  },
  {
    id: 'durable-rejoin-formation-barrier-mode-blind',
    mode: 'durable-rejoin-formation-barrier-mode-blind',
    module: path.resolve(
      'models', 'durable-rejoin-formation-barrier',
      'DurableRejoinFormationBarrier.tla',
    ),
    cfg: path.resolve(
      'models', 'durable-rejoin-formation-barrier',
      'DurableRejoinFormationBarrier_mode_blind_bug.cfg',
    ),
    expectConverged: false,
    report: 'durable-rejoin-formation-barrier-mode-blind.model.report.json',
    scenario: 'rolling-restart-durable-rejoin-formation-barrier-model',
    owner: 'node_joining_operation_ledger_formation_owner',
    boundary: 'ready_lease_publication',
    expectedFailurePattern:
      'Invariant DurableRejoinNeverWaitsOnFormation is violated',
  },
  {
    id: 'durable-rejoin-formation-barrier-fresh',
    mode: 'durable-rejoin-formation-barrier-fresh',
    module: path.resolve(
      'models', 'durable-rejoin-formation-barrier',
      'DurableRejoinFormationBarrier.tla',
    ),
    cfg: path.resolve(
      'models', 'durable-rejoin-formation-barrier',
      'DurableRejoinFormationBarrier_fresh.cfg',
    ),
    expectConverged: true,
    report: 'durable-rejoin-formation-barrier-fresh.model.report.json',
    scenario: 'rolling-restart-durable-rejoin-formation-barrier-model',
    owner: 'node_joining_operation_ledger_formation_owner',
    boundary: 'ready_lease_publication',
  },
  {
    id: 'terminal-operation-entity-observation-fixed',
    mode: 'terminal-operation-entity-observation-fixed',
    module: path.resolve(
      'models', 'terminal-operation-entity-observation',
      'TerminalOperationEntityObservation.tla',
    ),
    cfg: path.resolve(
      'models', 'terminal-operation-entity-observation',
      'TerminalOperationEntityObservation_fixed.cfg',
    ),
    expectConverged: true,
    report: 'terminal-operation-entity-observation-fixed.model.report.json',
    scenario: 'rolling-restart-fresh-formation-terminal-add-observation-model',
    owner: 'replica_operation_visibility_owner',
    boundary: 'terminal_add_to_formation_surplus_drain',
  },
  {
    id: 'terminal-operation-entity-observation-stale-sql-fallback',
    mode: 'terminal-operation-entity-observation-stale-sql-fallback',
    module: path.resolve(
      'models', 'terminal-operation-entity-observation',
      'TerminalOperationEntityObservation.tla',
    ),
    cfg: path.resolve(
      'models', 'terminal-operation-entity-observation',
      'TerminalOperationEntityObservation_stale_sql_fallback_bug.cfg',
    ),
    expectConverged: false,
    report:
      'terminal-operation-entity-observation-stale-sql-fallback.model.report.json',
    scenario: 'rolling-restart-fresh-formation-terminal-add-observation-model',
    owner: 'replica_operation_visibility_owner',
    boundary: 'terminal_add_to_formation_surplus_drain',
    expectedFailurePattern:
      'Invariant ConfirmedTerminalNeverReentersCreating is violated',
  },
  {
    id: 'node-authority-dispatch-fallback-fixed',
    mode: 'node-authority-dispatch-fallback-fixed',
    module: path.resolve(
      'models', 'node-authority-dispatch-fallback',
      'NodeAuthorityDispatchFallback.tla',
    ),
    cfg: path.resolve(
      'models', 'node-authority-dispatch-fallback',
      'NodeAuthorityDispatchFallback_fixed.cfg',
    ),
    expectConverged: true,
    report: 'node-authority-dispatch-fallback-fixed.model.report.json',
    scenario: 'rolling-restart-node-authority-dispatch-fallback-model',
    owner: 'nodes_metadata_read_owner',
    boundary: 'authoritative_node_read_to_replica_dispatch_readiness',
  },
  {
    id: 'node-authority-dispatch-fallback-failure-as-missing',
    mode: 'node-authority-dispatch-fallback-failure-as-missing',
    module: path.resolve(
      'models', 'node-authority-dispatch-fallback',
      'NodeAuthorityDispatchFallback.tla',
    ),
    cfg: path.resolve(
      'models', 'node-authority-dispatch-fallback',
      'NodeAuthorityDispatchFallback_failure_as_missing_bug.cfg',
    ),
    expectConverged: false,
    report:
      'node-authority-dispatch-fallback-failure-as-missing.model.report.json',
    scenario: 'rolling-restart-node-authority-dispatch-fallback-model',
    owner: 'nodes_metadata_read_owner',
    boundary: 'authoritative_node_read_to_replica_dispatch_readiness',
    expectedFailurePattern:
      'Temporal property EventuallyPriorityRecoveryDispatch was violated',
  },
  {
    id: 'coupled-admission-reconciled',
    mode: 'coupled-reconciled',
    module: path.resolve('models', 'readiness-starvation', 'CoupledAdmission.tla'),
    cfg: path.resolve('models', 'readiness-starvation', 'CoupledAdmission_fixed.cfg'),
    expectConverged: true,
    report: 'coupled-admission-tlc-reconciled.model.report.json',
    scenario: 'rolling-restart-coupled-admission-oscillation',
    owner: 'priority_recovery_admission_owner',
    boundary: 'coupled_invariant_admission',
  },
  {
    id: 'coupled-admission-oscillation',
    mode: 'coupled-oscillation',
    module: path.resolve('models', 'readiness-starvation', 'CoupledAdmission.tla'),
    cfg: path.resolve('models', 'readiness-starvation', 'CoupledAdmission_bug.cfg'),
    expectConverged: false,
    report: 'coupled-admission-tlc-oscillation.model.report.json',
    scenario: 'rolling-restart-coupled-admission-oscillation',
    owner: 'priority_recovery_admission_owner',
    boundary: 'coupled_invariant_admission',
    expectedFailurePattern: 'Temporal property EventuallySteady was violated',
  },
  {
    id: 'publication-convergence-reconciled',
    mode: 'publication-convergence-reconciled',
    module: path.resolve(
      'models',
      'readiness-starvation',
      'PublicationConvergence.tla',
    ),
    cfg: path.resolve(
      'models',
      'readiness-starvation',
      'PublicationConvergence_fixed.cfg',
    ),
    expectConverged: true,
    report: 'publication-convergence-tlc-reconciled.model.report.json',
    scenario: 'rolling-restart-publication-convergence',
    owner: 'membership_publication_owner',
    boundary: 'publication_convergence',
  },
  {
    id: 'publication-convergence-lost-wake',
    mode: 'publication-convergence-lost-wake',
    module: path.resolve(
      'models',
      'readiness-starvation',
      'PublicationConvergence.tla',
    ),
    cfg: path.resolve(
      'models',
      'readiness-starvation',
      'PublicationConvergence_bug.cfg',
    ),
    expectConverged: false,
    report: 'publication-convergence-tlc-lost-wake.model.report.json',
    scenario: 'rolling-restart-publication-convergence',
    owner: 'membership_publication_owner',
    boundary: 'publication_convergence',
    expectedFailurePattern: 'Temporal property EventuallySteady was violated',
  },
  {
    id: 'priority-spread-coverage-count-aware',
    mode: 'priority-spread-coverage-count-aware',
    module: path.resolve(
      'models',
      'priority-spread-coverage',
      'PrioritySpreadCoverage.tla',
    ),
    cfg: path.resolve(
      'models',
      'priority-spread-coverage',
      'PrioritySpreadCoverage_fixed.cfg',
    ),
    expectConverged: true,
    report: 'priority-spread-coverage-tlc-count-aware.model.report.json',
    scenario: 'movielens-priority-spread-gap-coverage-authority-model',
    owner: 'priority_recovery_publication_closure_owner',
    boundary: 'numeric_spread_gap_operation_coverage',
  },
  {
    id: 'priority-spread-coverage-boolean-collapse',
    mode: 'priority-spread-coverage-boolean-collapse',
    module: path.resolve(
      'models',
      'priority-spread-coverage',
      'PrioritySpreadCoverage.tla',
    ),
    cfg: path.resolve(
      'models',
      'priority-spread-coverage',
      'PrioritySpreadCoverage_bug.cfg',
    ),
    expectConverged: false,
    report: 'priority-spread-coverage-tlc-boolean-collapse.model.report.json',
    scenario: 'movielens-priority-spread-gap-coverage-counterexample',
    owner: 'priority_recovery_publication_closure_owner',
    boundary: 'numeric_spread_gap_operation_coverage',
    expectedFailurePattern:
      'Invariant PublicationRequiresCoveredSpread is violated',
  },
  {
    id: 'priority-spread-schema-admission-bypass',
    mode: 'priority-spread-schema-admission-bypass',
    module: path.resolve(
      'models',
      'priority-spread-coverage',
      'PrioritySpreadCoverage.tla',
    ),
    cfg: path.resolve(
      'models',
      'priority-spread-coverage',
      'PrioritySpreadCoverage_schema_bypass.cfg',
    ),
    expectConverged: false,
    report: 'priority-spread-schema-admission-bypass.model.report.json',
    scenario: 'movielens-pre-schema-priority-spread-admission-counterexample',
    owner: 'movielens_pre_schema_admission_owner',
    boundary: 'published_priority_spread_summary_admission',
    expectedFailurePattern:
      'Invariant SchemaAdmissionRequiresCoveredSpread is violated',
  },
  {
    id: 'leadership-failback-reconciled',
    mode: 'leadership-failback-reconciled',
    module: path.resolve(
      'models',
      'leadership-failback',
      'LeadershipFailback.tla',
    ),
    cfg: path.resolve(
      'models',
      'leadership-failback',
      'LeadershipFailback_fixed.cfg',
    ),
    expectConverged: true,
    report: 'leadership-failback-tlc-reconciled.model.report.json',
    scenario: 'rolling-restart-leadership-failback',
    owner: 'membership_publication_owner',
    boundary: 'publication_write_leadership',
  },
  {
    id: 'leadership-failback-stranded',
    mode: 'leadership-failback-stranded',
    module: path.resolve(
      'models',
      'leadership-failback',
      'LeadershipFailback.tla',
    ),
    cfg: path.resolve(
      'models',
      'leadership-failback',
      'LeadershipFailback_bug.cfg',
    ),
    expectConverged: false,
    report: 'leadership-failback-tlc-stranded.model.report.json',
    scenario: 'rolling-restart-leadership-failback',
    owner: 'membership_publication_owner',
    boundary: 'publication_write_leadership',
    expectedFailurePattern: 'Temporal property EventuallyClosed was violated',
  },
  {
    id: 'ledger-selfmove-remint-idempotent',
    mode: 'ledger-selfmove-remint-idempotent',
    module: path.resolve(
      'models',
      'ledger-selfmove-remint',
      'LedgerSelfMoveRemint.tla',
    ),
    cfg: path.resolve(
      'models',
      'ledger-selfmove-remint',
      'LedgerSelfMoveRemint_fixed.cfg',
    ),
    expectConverged: true,
    report: 'ledger-selfmove-remint-tlc-idempotent.model.report.json',
    scenario: 'formation-ledger-self-move-blocks-cluster-ops',
    owner: 'rebalance_coordinator',
    boundary: 'ledger_self_move_serialization',
  },
  {
    id: 'ledger-selfmove-remint-flap',
    mode: 'ledger-selfmove-remint-flap',
    module: path.resolve(
      'models',
      'ledger-selfmove-remint',
      'LedgerSelfMoveRemint.tla',
    ),
    cfg: path.resolve(
      'models',
      'ledger-selfmove-remint',
      'LedgerSelfMoveRemint_bug.cfg',
    ),
    expectConverged: false,
    report: 'ledger-selfmove-remint-tlc-flap.model.report.json',
    scenario: 'formation-ledger-self-move-blocks-cluster-ops',
    owner: 'rebalance_coordinator',
    boundary: 'ledger_self_move_serialization',
    expectedFailurePattern: 'Temporal property EventuallySettled was violated',
  },
  {
    id: 'incremental-replace-spread-nonregression',
    mode: 'incremental-replace-spread-nonregression',
    module: path.resolve(
      'models',
      'incremental-replace-spread',
      'IncrementalReplaceSpread.tla',
    ),
    cfg: path.resolve(
      'models',
      'incremental-replace-spread',
      'IncrementalReplaceSpread_fixed.cfg',
    ),
    expectConverged: true,
    report:
      'incremental-replace-spread-nonregression.model.report.json',
    scenario: 'movielens-incremental-replace-spread-nonregression-model',
    owner: 'operation_workflow_remove_safety_owner',
    boundary: 'serialized_replace_spread_nonregression',
  },
  {
    id: 'incremental-replace-spread-final-target-deadlock',
    mode: 'incremental-replace-spread-final-target-deadlock',
    module: path.resolve(
      'models',
      'incremental-replace-spread',
      'IncrementalReplaceSpread.tla',
    ),
    cfg: path.resolve(
      'models',
      'incremental-replace-spread',
      'IncrementalReplaceSpread_final_target_bug.cfg',
    ),
    expectConverged: false,
    report:
      'incremental-replace-spread-final-target-deadlock.model.report.json',
    scenario: 'movielens-incremental-replace-spread-final-target-counterexample',
    owner: 'operation_workflow_remove_safety_owner',
    boundary: 'serialized_replace_spread_nonregression',
    expectedFailurePattern:
      'Invariant OpenGapRetainsSerializedProgressOwner is violated',
  },
  {
    id: 'incremental-replace-spread-regression',
    mode: 'incremental-replace-spread-regression',
    module: path.resolve(
      'models',
      'incremental-replace-spread',
      'IncrementalReplaceSpread.tla',
    ),
    cfg: path.resolve(
      'models',
      'incremental-replace-spread',
      'IncrementalReplaceSpread_regression_bug.cfg',
    ),
    expectConverged: false,
    report: 'incremental-replace-spread-regression.model.report.json',
    scenario: 'movielens-incremental-replace-spread-regression-counterexample',
    owner: 'operation_workflow_remove_safety_owner',
    boundary: 'serialized_replace_spread_nonregression',
    expectedFailurePattern: 'Invariant SpreadNeverRegresses is violated',
  },
  {
    id: 'local-leader-row-visibility-fixed',
    mode: 'local-leader-row-visibility-fixed',
    module: path.resolve(
      'models', 'local-leader-row-visibility', 'LocalLeaderRowVisibility.tla',
    ),
    cfg: path.resolve(
      'models', 'local-leader-row-visibility',
      'LocalLeaderRowVisibility_fixed.cfg',
    ),
    expectConverged: true,
    report: 'local-leader-row-visibility-fixed.model.report.json',
    scenario: 'movielens-local-leader-row-visibility-model',
    owner: 'partition_metadata_publication_owner',
    boundary: 'raft_local_row_durable_row_composition',
  },
  {
    id: 'local-leader-row-visibility-missing-seed',
    mode: 'local-leader-row-visibility-missing-seed',
    module: path.resolve(
      'models', 'local-leader-row-visibility', 'LocalLeaderRowVisibility.tla',
    ),
    cfg: path.resolve(
      'models', 'local-leader-row-visibility',
      'LocalLeaderRowVisibility_missing_seed_bug.cfg',
    ),
    expectConverged: false,
    report: 'local-leader-row-visibility-missing-seed.model.report.json',
    scenario: 'movielens-local-leader-row-visibility-counterexample',
    owner: 'partition_metadata_publication_owner',
    boundary: 'raft_local_row_durable_row_composition',
    expectedFailurePattern:
      'Invariant LocalLeaderHasImmediateEvidence is violated',
  },
  {
    id: 'local-leader-row-visibility-stale-publish',
    mode: 'local-leader-row-visibility-stale-publish',
    module: path.resolve(
      'models', 'local-leader-row-visibility', 'LocalLeaderRowVisibility.tla',
    ),
    cfg: path.resolve(
      'models', 'local-leader-row-visibility',
      'LocalLeaderRowVisibility_stale_publish_bug.cfg',
    ),
    expectConverged: false,
    report: 'local-leader-row-visibility-stale-publish.model.report.json',
    scenario: 'movielens-local-leader-row-stale-publish-counterexample',
    owner: 'partition_metadata_publication_owner',
    boundary: 'raft_local_row_durable_row_composition',
    expectedFailurePattern:
      'Invariant DemotedLeaderCannotAuthorizeRemoval is violated',
  },
  {
    id: 'local-leader-row-visibility-timestamp-bump',
    mode: 'local-leader-row-visibility-timestamp-bump',
    module: path.resolve(
      'models', 'local-leader-row-visibility', 'LocalLeaderRowVisibility.tla',
    ),
    cfg: path.resolve(
      'models', 'local-leader-row-visibility',
      'LocalLeaderRowVisibility_timestamp_bump_bug.cfg',
    ),
    expectConverged: false,
    report: 'local-leader-row-visibility-timestamp-bump.model.report.json',
    scenario: 'movielens-local-leader-row-timestamp-bump-counterexample',
    owner: 'partition_metadata_publication_owner',
    boundary: 'local_projection_successor_lww_composition',
    expectedFailurePattern:
      'Invariant SuccessorPublicationWins is violated',
  },
  {
    id: 'local-leader-row-visibility-demoted-replay',
    mode: 'local-leader-row-visibility-demoted-replay',
    module: path.resolve(
      'models', 'local-leader-row-visibility', 'LocalLeaderRowVisibility.tla',
    ),
    cfg: path.resolve(
      'models', 'local-leader-row-visibility',
      'LocalLeaderRowVisibility_demoted_replay_bug.cfg',
    ),
    expectConverged: false,
    report: 'local-leader-row-visibility-demoted-replay.model.report.json',
    scenario: 'movielens-local-leader-row-demoted-replay-counterexample',
    owner: 'partition_metadata_publication_owner',
    boundary: 'demotion_durable_self_replay_composition',
    expectedFailurePattern:
      'Invariant DemotedLeaderCannotAuthorizeRemoval is violated',
  },
  {
    id: 'exact-election-evidence-same-turn-fixed',
    mode: 'exact-election-evidence-same-turn-fixed',
    module: path.resolve(
      'models', 'exact-election-evidence-same-turn',
      'ExactElectionEvidenceSameTurn.tla',
    ),
    cfg: path.resolve(
      'models', 'exact-election-evidence-same-turn',
      'ExactElectionEvidenceSameTurn_fixed.cfg',
    ),
    expectConverged: true,
    report: 'exact-election-evidence-same-turn-fixed.model.report.json',
    scenario: 'movielens-exact-election-evidence-same-turn-model',
    owner: 'operation_workflow_remove_safety_owner',
    boundary: 'election_evidence_continuation_remove_safety_composition',
  },
  {
    id: 'exact-election-evidence-delayed-continuation',
    mode: 'exact-election-evidence-delayed-continuation',
    module: path.resolve(
      'models', 'exact-election-evidence-same-turn',
      'ExactElectionEvidenceSameTurn.tla',
    ),
    cfg: path.resolve(
      'models', 'exact-election-evidence-same-turn',
      'ExactElectionEvidenceSameTurn_delayed_continuation_bug.cfg',
    ),
    expectConverged: false,
    report:
      'exact-election-evidence-delayed-continuation.model.report.json',
    scenario: 'movielens-exact-election-evidence-retarget-counterexample',
    owner: 'operation_workflow_remove_safety_owner',
    boundary: 'election_evidence_continuation_retry_expiry_composition',
    expectedFailurePattern:
      'Invariant ExactCompletedEvidenceCannotBeRetargeted is violated',
  },
  {
    id: 'exact-election-evidence-continuation-authority',
    mode: 'exact-election-evidence-continuation-authority',
    module: path.resolve(
      'models', 'exact-election-evidence-same-turn',
      'ExactElectionEvidenceSameTurn.tla',
    ),
    cfg: path.resolve(
      'models', 'exact-election-evidence-same-turn',
      'ExactElectionEvidenceSameTurn_continuation_authority_bug.cfg',
    ),
    expectConverged: false,
    report:
      'exact-election-evidence-continuation-authority.model.report.json',
    scenario: 'movielens-exact-election-evidence-owner-counterexample',
    owner: 'operation_workflow_remove_safety_owner',
    boundary: 'continuation_remove_authorization_interlock_composition',
    expectedFailurePattern:
      'Invariant ContinuationCannotAuthorizeRemoval is violated',
  },
  {
    id: 'operation-ledger-terminal-hold-fixed',
    mode: 'operation-ledger-terminal-hold-fixed',
    module: path.resolve(
      'models', 'operation-ledger-terminal-hold',
      'OperationLedgerTerminalHold.tla',
    ),
    cfg: path.resolve(
      'models', 'operation-ledger-terminal-hold',
      'OperationLedgerTerminalHold_fixed.cfg',
    ),
    expectConverged: true,
    report: 'operation-ledger-terminal-hold-fixed.model.report.json',
    scenario: 'movielens-operation-ledger-terminal-hold-model',
    owner: 'operation_workflow_lifecycle_owner',
    boundary: 'ledger_self_move_hold_admission_snapshot_composition',
  },
  {
    id: 'operation-ledger-terminal-hold-timeout-release',
    mode: 'operation-ledger-terminal-hold-timeout-release',
    module: path.resolve(
      'models', 'operation-ledger-terminal-hold',
      'OperationLedgerTerminalHold.tla',
    ),
    cfg: path.resolve(
      'models', 'operation-ledger-terminal-hold',
      'OperationLedgerTerminalHold_timeout_release_bug.cfg',
    ),
    expectConverged: false,
    report:
      'operation-ledger-terminal-hold-timeout-release.model.report.json',
    scenario: 'movielens-operation-ledger-timeout-release-counterexample',
    owner: 'operation_workflow_lifecycle_owner',
    boundary: 'durable_timeout_serialization_release_composition',
    expectedFailurePattern:
      'Invariant SerializationHoldReleaseRequiresAuthoritativeTerminal is violated',
  },
  {
    id: 'authoritative-observation-watermark-fixed',
    mode: 'authoritative-observation-watermark-fixed',
    module: path.resolve(
      'models', 'authoritative-observation-watermark',
      'AuthoritativeObservationWatermark.tla',
    ),
    cfg: path.resolve(
      'models', 'authoritative-observation-watermark',
      'AuthoritativeObservationWatermark_fixed.cfg',
    ),
    expectConverged: true,
    report: 'authoritative-observation-watermark-fixed.model.report.json',
    scenario: 'movielens-authoritative-observation-watermark-model',
    owner: 'control_plane_authoritative_reconcile_owner',
    boundary: 'authoritative_observation_cache_freshness_admission_composition',
  },
  {
    id: 'authoritative-observation-watermark-mutation-only',
    mode: 'authoritative-observation-watermark-mutation-only',
    module: path.resolve(
      'models', 'authoritative-observation-watermark',
      'AuthoritativeObservationWatermark.tla',
    ),
    cfg: path.resolve(
      'models', 'authoritative-observation-watermark',
      'AuthoritativeObservationWatermark_mutation_only_bug.cfg',
    ),
    expectConverged: false,
    report:
      'authoritative-observation-watermark-mutation-only.model.report.json',
    scenario: 'movielens-mutation-only-freshness-counterexample',
    owner: 'control_plane_authoritative_reconcile_owner',
    boundary: 'mutation_watermark_snapshot_admission_composition',
    expectedFailurePattern:
      'Temporal property EventuallySchemaAdmitted was violated',
  },
  {
    id: 'local-leader-tenure-claim-tenure-bound',
    mode: 'local-leader-tenure-claim-tenure-bound',
    module: path.resolve(
      'models', 'local-leader-tenure-claim', 'LocalLeaderTenureClaim.tla',
    ),
    cfg: path.resolve(
      'models', 'local-leader-tenure-claim',
      'LocalLeaderTenureClaim_tenure_bound.cfg',
    ),
    expectConverged: true,
    report: 'local-leader-tenure-claim-tenure-bound.model.report.json',
    scenario: 'local-leadership-tenure-bound-safety-evidence-model',
    owner: 'partition_metadata_publication_owner',
    boundary: 'local_leader_claim_safety_read_merge_composition',
  },
  {
    id: 'local-leader-tenure-claim-content-based',
    mode: 'local-leader-tenure-claim-content-based',
    module: path.resolve(
      'models', 'local-leader-tenure-claim', 'LocalLeaderTenureClaim.tla',
    ),
    cfg: path.resolve(
      'models', 'local-leader-tenure-claim',
      'LocalLeaderTenureClaim_content_based_bug.cfg',
    ),
    expectConverged: false,
    report: 'local-leader-tenure-claim-content-based.model.report.json',
    scenario: 'local-leadership-content-based-fossil-counterexample',
    owner: 'partition_metadata_publication_owner',
    boundary: 'local_leader_claim_safety_read_merge_composition',
    expectedFailurePattern:
      'Invariant MergeNeverTrustsDeadTenure is violated',
  },
  {
    id: 'authoritative-observation-watermark-exact-equality',
    mode: 'authoritative-observation-watermark-exact-equality',
    module: path.resolve(
      'models', 'authoritative-observation-watermark',
      'AuthoritativeObservationWatermark.tla',
    ),
    cfg: path.resolve(
      'models', 'authoritative-observation-watermark',
      'AuthoritativeObservationWatermark_exact_equality_bug.cfg',
    ),
    expectConverged: false,
    report:
      'authoritative-observation-watermark-exact-equality.model.report.json',
    scenario: 'movielens-exact-equality-reconcile-counterexample',
    owner: 'control_plane_authoritative_reconcile_owner',
    boundary: 'authoritative_observation_cache_freshness_admission_composition',
    expectedFailurePattern:
      'Temporal property EventuallySchemaAdmitted was violated',
  },
  {
    id: 'acknowledged-write-durability-visibility-fixed',
    mode: 'acknowledged-write-durability-visibility-fixed',
    module: path.resolve(
      'models', 'acknowledged-write-durability-visibility',
      'AcknowledgedWriteDurabilityVisibility.tla',
    ),
    cfg: path.resolve(
      'models', 'acknowledged-write-durability-visibility',
      'AcknowledgedWriteDurabilityVisibility_fixed.cfg',
    ),
    expectConverged: true,
    report:
      'acknowledged-write-durability-visibility-fixed.model.report.json',
    scenario: 'rolling-restart-acknowledged-write-durability-visibility-model',
    owner: 'partition_write_commit_and_visibility_oracle_owner',
    boundary: 'requested_durable_acknowledged_recovered_visible',
  },
  {
    id: 'acknowledged-write-ack-before-durable-mutant',
    mode: 'acknowledged-write-ack-before-durable-mutant',
    module: path.resolve(
      'models', 'acknowledged-write-durability-visibility',
      'AcknowledgedWriteDurabilityVisibility.tla',
    ),
    cfg: path.resolve(
      'models', 'acknowledged-write-durability-visibility',
      'AcknowledgedWriteDurabilityVisibility_ack_before_durable_mutant.cfg',
    ),
    expectConverged: false,
    report:
      'acknowledged-write-ack-before-durable-mutant.model.report.json',
    scenario: 'rolling-restart-ack-before-durable-counterexample',
    owner: 'partition_write_commit_and_visibility_oracle_owner',
    boundary: 'requested_durable_acknowledged_recovered_visible',
    expectedFailurePattern:
      'Invariant AcknowledgedRequiresDurability is violated',
  },
  {
    id: 'planner-retention-admission-hold-cure-exemption',
    mode: 'planner-retention-admission-hold-cure-exemption',
    module: path.resolve(
      'models', 'planner-retention-admission-hold',
      'PlannerRetentionAdmissionHold.tla',
    ),
    cfg: path.resolve(
      'models', 'planner-retention-admission-hold',
      'PlannerRetentionAdmissionHold_fixed.cfg',
    ),
    expectConverged: true,
    report: 'planner-retention-admission-hold-cure-exemption.model.report.json',
    scenario: 'planner-retention-admission-hold-model',
    owner: 'priority_recovery_admission_owner',
    boundary: 'planner_retention_over_target_admission_composition',
  },
  {
    id: 'planner-retention-admission-hold-unconditional-hold',
    mode: 'planner-retention-admission-hold-unconditional-hold',
    module: path.resolve(
      'models', 'planner-retention-admission-hold',
      'PlannerRetentionAdmissionHold.tla',
    ),
    cfg: path.resolve(
      'models', 'planner-retention-admission-hold',
      'PlannerRetentionAdmissionHold_unconditional_hold_bug.cfg',
    ),
    expectConverged: false,
    report:
      'planner-retention-admission-hold-unconditional-hold.model.report.json',
    scenario: 'planner-retention-admission-hold-model',
    owner: 'priority_recovery_admission_owner',
    boundary: 'planner_retention_over_target_admission_composition',
    expectedFailurePattern: 'Temporal property EventuallySettled was violated',
  },
  {
    id: 'priority-service-publication-census-fixed',
    mode: 'priority-service-publication-census-fixed',
    module: path.resolve(
      'models', 'priority-service-publication-census',
      'PriorityServicePublicationCensus.tla',
    ),
    cfg: path.resolve(
      'models', 'priority-service-publication-census',
      'PriorityServicePublicationCensus_fixed.cfg',
    ),
    expectConverged: true,
    report: 'priority-service-publication-census-fixed.model.report.json',
    scenario: 'priority-service-publication-census-model',
    owner: 'priority_service_publication_census_contract_owner',
    boundary: 'services_row_lifecycle_publication_to_priority_census',
  },
  {
    id: 'priority-service-publication-census-role-wipe',
    mode: 'priority-service-publication-census-role-wipe',
    module: path.resolve(
      'models', 'priority-service-publication-census',
      'PriorityServicePublicationCensus.tla',
    ),
    cfg: path.resolve(
      'models', 'priority-service-publication-census',
      'PriorityServicePublicationCensus_role_wipe_bug.cfg',
    ),
    expectConverged: false,
    report: 'priority-service-publication-census-role-wipe.model.report.json',
    scenario: 'priority-service-publication-census-model',
    owner: 'priority_service_publication_census_contract_owner',
    boundary: 'services_row_lifecycle_publication_to_priority_census',
    expectedFailurePattern:
      'Temporal property EventuallyStableCensusSatisfied was violated',
  },
];

export {CONFIGS};
