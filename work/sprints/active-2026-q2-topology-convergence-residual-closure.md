# Topology Convergence Residual Closure Sprint

Status: active. This is the successor sprint for
`done-2026-q2-topology-convergence-ship-shape.md`.

## Goal

Close the gap between focused topology contracts and ship evidence. The prior
sprint proved many owner contracts in isolation, but it did not prove the
release criteria. This sprint treats those focused-only contracts as incomplete
until representative rolling-restart and promoted failure gates prove durable
convergence.

The sprint is successful only when:

1. The representative `rolling-restart` gate reaches `active=5/5`,
   `snapshotCoverage=5/5`, and `missingPublished=0`.
2. No critical topology recovery state closes as
   `priority_recovery_event_driven_wait`, event-only delivery, cache-only
   publication, or unbounded timeout.
3. The promoted topology failure gates execute and either pass with durable
   owner convergence or split to a narrower active owner-boundary blocker with
   canonical evidence.
4. `work:sprints/current-blocker.*` points at the live active package or a
   fresh narrower blocker. It must not point at a completed coverage-only
   package while ship criteria are unmet.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, especially:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Edition matrix status: Community / AGPL repo. This sprint must not implement
Pro or Enterprise behavior.

## Current Evidence Snapshot

Source sprint:
`work/sprints/done-2026-q2-topology-convergence-ship-shape.md`.

Latest representative artifact:
`test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`.

Canonical extractor state on sprint creation:

1. `work:evidence-summary` reports first frontier
   `active_gate_snapshot_coverage`.
2. Owner: `startup_active_gate_owner`.
3. Boundary: `snapshot_coverage`.
4. Dominant reason: `snapshot_coverage_incomplete`.
5. `analyze:topology-convergence` reports `snapshotCoverageNodeCount=2`,
   `expectedNodeCount=5`, active gate `stalled`, and blockers
   `inactive_nodes=5,snapshot_coverage=2/5`.
6. Publication convergence is satisfied only at the publication ACK edge:
   `publicationStatus=PUBLISHED`, `pendingAckCount=0`,
   `publishedActive=1/5`, and `missingPublishedCount=4`.
7. Priority recovery is not the first frontier, but
   `analyze:priority-recovery-residuals` still reports one non-frontier
   `operation_workflow_owner / workflow_progress` witness for
   `control_plane_publications-p1` in `spread_satisfied_in_flight`.
8. `analyze:causal-model` reports `active_gate_timeout` as `unbounded` under
   `startup_active_gate_owner / snapshot_coverage` with next action
   `reduce_startup_active_gate_budget_contract`.
9. `scenario_duration` remains `unbounded` under
   `diagnostics_owner / causal_analysis_framework`.
10. The topology failure-gate matrix exists, but no failure-gate execution
    artifact is recorded.
11. Residual inventory decision: the next runtime package is
    [Topology Active Gate Budget Closure](../packages/done-20260514-topology-active-gate-budget-closure.md),
    followed by
    [Topology Active Gate Owner Cohort Convergence](../packages/done-20260514-topology-active-gate-owner-cohort-convergence.md)
    after active-gate timeout, attempts, and next-attempt/terminal semantics are
    bounded or explicitly classified.

## Residual Inventory

These are the residuals this sprint must close or split explicitly:

1. **Workflow closure residual**:
   the previous sprint reached `done` with focused proof and coverage-only
   proof while representative green was not claimed.
2. **Evidence inventory residual**:
   the current residual list must be produced from canonical extractors before
   runtime changes start.
3. **Active-gate budget residual**:
   `active_gate_timeout` has no bounded budget, no next-attempt timestamp, and
   no terminal degraded classification in the latest artifact.
4. **Active-gate cohort residual**:
   active-gate owner truth sees only `2/5` snapshot coverage while the ship
   criterion requires `5/5`.
5. **Publication/projection residual**:
   `PUBLISHED` with `pendingAckCount=0` still coexists with
   `publishedActive=1/5` and `missingPublished=4`.
6. **Priority recovery tail residual**:
   one non-frontier workflow-progress witness remains and must not reappear as
   a final live event-driven state.
7. **Failure-gate execution residual**:
   the matrix has seven named gates, but they are not executed release gates.
8. **Focused-contract integration residual**:
   membership epoch, failure repair intents, post-rejoin reconciliation,
   partition descriptor epoch, capacity admission, anti-entropy, and bounded
   progress were proven in focused packages but not as one integrated release
   gate chain.

## Residual Inventory Decision

Canonical extractor run set:
`work:evidence-summary`, `analyze:topology-convergence`,
`analyze:priority-recovery-residuals --markdown`, `analyze:causal-model`, and
`analyze:distributed-failure` against
`test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`.

The sprint representative first frontier remains
`startup_active_gate_owner / snapshot_coverage` with edge
`active_gate_snapshot_coverage` and dominant reason
`snapshot_coverage_incomplete`. `rolling-restart` failed after `149490ms`.
Topology convergence reports `nodeCount=5`, `edgeCount=5`,
`frontierCount=1`, `activeGateState=stalled`,
`snapshotCoverageComplete=false`, `snapshotCoverageNodeCount=2`,
`expectedNodeCount=5`, and blockers
`inactive_nodes=5,snapshot_coverage=2/5`.

Publication ACK convergence is satisfied, not first frontier:
`publicationStatus=PUBLISHED`, `pendingAckCount=0`, and
`pendingAckNodeIds=[]`. That ACK witness coexists with incomplete active
cohort evidence: `publishedActive=1/5`, `missingPublishedCount=4`,
`publicationPending=true`, and missing nodes
`11601fe0-72d6-5853-8590-ec2881853e72`,
`35a891b8-c1a0-5064-9c6e-2acfba61c2a7`,
`8be8d30f-4499-5eed-865c-71b4d529a67a`, and
`ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.

The legacy distributed-failure dominant reason
`publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72` is
reconciled as a symptom of active-gate snapshot/active-cohort incompleteness,
not as a replacement for the causal first frontier. The non-frontier priority
recovery residue remains one `operation_workflow_owner / workflow_progress`
witness for partition `control_plane_publications-p1` in
`spread_satisfied_in_flight`, `splitRequired=false`.

Budget accounting selects package order. `active_gate_timeout` is unbounded
under `startup_active_gate_owner / snapshot_coverage` (`87249ms`, no limit),
`active_gate_attempts` is exhausted at `9/8`, `readiness_retry_window` is
exhausted at `8/8`, `workflow_step_timeout` is within budget at `1269/30000`,
and `scenario_duration` remains unbounded under
`diagnostics_owner / causal_analysis_framework` (`149490ms`, no limit).
Therefore the next package is active-gate budget closure first, active-gate
owner cohort convergence second, publication projection reconciliation only if
missing active publication persists after cohort evidence no longer dominates,
and priority recovery residual drain after active-gate/publication no longer
hide or explain the tail witness.

Implementation note for active-gate budget closure: local causal-model proof
against the same representative artifact now classifies `active_gate_timeout`
as exhausted terminal active-gate accounting with `observed=87249`,
`limit=87249`, and `terminalState=terminal_degraded`. The representative first
frontier remains `startup_active_gate_owner / snapshot_coverage` for incomplete
snapshot coverage, so the follow-on cohort convergence package still owns the
remaining runtime blocker.

Failure-gate matrix status remains unexecuted. The seven promoted gates map to
the sprint packages already queued: failure detection repair, killed join,
killed rejoin, remote coordinator handoff, missed handoff ACK, stale
publication durable truth, and rebalance disruption recovery. The failure-gate
execution harness package owns making those gates runnable before individual
gate packages claim release proof.

## Working Rules

1. Work one active package at a time.
2. Start every package with `npm run work:context`.
3. Use `npm run work:llm-start` after activation when the package needs
   package-doctor, dirty-scope, model-ledger, or representative evidence
   context.
4. Use canonical extractors before raw JSON, broad search, or logs:
   `work:evidence-summary`, `analyze:topology-convergence`,
   `analyze:priority-recovery-residuals`, `analyze:distributed-failure`,
   `analyze:owner-files`, and `analyze:causal-model`.
5. Runtime owner-boundary, scenario-release-gate, and causal-escalation
   packages must run required subagents sequentially unless the package records
   an allowed waiver state.
6. Every package must close with focused proof, static guardrails for touched
   runtime files, package validation, focused commit, and push.
7. Representative reruns are checkpoints, not the first debugging tool. Run
   `rolling-restart` after active-gate completion, after failure-gate repair
   closure, and at final sprint closure.
8. A package may close as `migrated` only when the new owner, boundary,
   artifact, evidence path, and next active package are recorded.
9. A package may close as `coverage-only` or `classification-only` only when
   the sprint and `current-blocker` continue to point at the live runtime
   residual.
10. The sprint may not close with unbounded critical topology budgets, unresolved
    event-only waits, or a matrix-only failure-gate status.
11. Queued runtime, scenario-release-gate, and causal-escalation packages must
    keep `causalGovernance`, `scenarioCausalClosure`, Model Fit, activation
    contract, subagent ledger, and commit ledger concrete before activation.
12. `candidateRuntimeFiles` are read/owner-discovery candidates only. A package
    may edit one only after owner-file proof promotes the exact path into
    `writeScope` and `commitScope`.
13. `current-blocker` must show any live representative residual separately
    from the active package when the active package is workflow, diagnostics,
    or classification work.

## Activation Contract For Queued Packages

Before any package in this sprint moves from `todo` to `active`:

1. Run `npm run work:package:doctor -- --fix-dry-run <package>` and repair
   metadata before implementation starts.
2. Confirm `causalGovernance.stopConditionCheck` cites
   `npm --silent run analyze:causal-model -- <artifact>`.
3. Confirm `scenarioCausalClosure` names the package-local owner/boundary,
   known downstream blockers, missing edge probe, bounded progress proof,
   same-frontier fallback, and result classification.
4. Promote exact runtime/harness candidates into `writeScope` and `commitScope`
   only after canonical owner-file or focused probe evidence names them.
5. Replace subagent placeholders with real review/fix/implementation proof, or
   an allowed waiver, before pre-implementation validation.
6. Preserve the named artifact path. If fresh evidence changes owner,
   boundary, or dominant reason, classify the package as `migrated`,
   `same-frontier`, or split to a narrower successor.
7. Add static guardrails and final deep-dive proof to the package validation
   ladder before closure.
8. Use `## Commit And Push Ledger` for closure proof. `## Closure Commit Proof`
   is legacy-only and must not be used in new sprint packages.

## Ship Criteria

Final closure requires fresh evidence proving all of the following:

1. `rolling-restart` succeeds or reaches a canonical green release-gate report.
2. Active nodes: `5/5`.
3. Active-gate snapshot coverage: `5/5`.
4. Missing published nodes: `0`.
5. Publication ACK convergence: satisfied with no hidden missing active cohort.
6. Priority recovery: no critical `priority_recovery_event_driven_wait`.
7. Budget accounting: `active_gate_timeout` and `scenario_duration` are
   bounded, terminally classified, or migrated to a narrower active blocker.
8. Failure gates: failure detection, killed join, killed rejoin, remote
   coordinator handoff, missed handoff ACK, stale publication, and
   split/rebalance recovery all pass or split to narrower active packages.
9. Closure handoff: `current-blocker` names final green evidence or the fresh
   narrower active blocker. It cannot name a done package as the live blocker
   when ship criteria are unmet.

## Package Queue

### Phase 0 - Working Contract And Evidence

1. [Topology Residual Closure Workflow Hardening](../packages/done-20260514-topology-residual-closure-workflow-hardening.md)
   - Lane: `lightweight-maintenance`
   - Owner boundary: `work_tracker / sprint_closure_semantics`
   - Purpose: harden tracker and sprint closure semantics so focused proof,
     coverage-only proof, representative migration, and representative green
     cannot be confused.
   - Entry condition: previous sprint closed while latest representative
     evidence remained red.
   - Acceptance: tracker and sprint handoff language preserve the live
     representative residual until green evidence or a narrower active blocker
     exists.

2. [Topology Residual Evidence Inventory](../packages/done-20260514-topology-residual-evidence-inventory.md)
   - Lane: `causal-escalation`
   - Owner boundary: `diagnostics_owner / residual_inventory`
   - Purpose: produce the canonical residual ledger before runtime work starts.
   - Entry condition: workflow closure semantics are sharpened.
   - Acceptance: residual ledger names current first frontier, non-frontier
     tails, unbounded budgets, unexecuted gates, and the exact next package.

### Phase 1 - Current Representative Runtime Frontier

3. [Topology Active Gate Budget Closure](../packages/done-20260514-topology-active-gate-budget-closure.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `startup_active_gate_owner / snapshot_coverage_budget`
   - Purpose: make active-gate elapsed time, retry, next-attempt, and terminal
     degraded classification bounded.
   - Entry condition: residual inventory confirms `active_gate_timeout` remains
     unbounded.
   - Acceptance: causal-model budget accounting no longer reports
     `active_gate_timeout` as unbounded for the current active-gate residual.

4. [Topology Active Gate Owner Cohort Convergence](../packages/done-20260514-topology-active-gate-owner-cohort-convergence.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `startup_active_gate_owner / snapshot_coverage`
   - Purpose: complete the active-gate owner-truth cohort.
   - Entry condition: budget semantics are bounded or explicitly terminal.
   - Acceptance: active gate derives expected nodes, ready leased nodes,
     published active nodes, missing nodes, pending repairs, and topology epoch
     from owner truth; representative evidence reaches `snapshotCoverage=5/5`
     or migrates to a narrower owner boundary.

5. [Topology Publication Projection Reconciliation](../packages/done-20260514-topology-publication-projection-reconciliation.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `topology_publication_owner / publication_projection_cohort`
   - Purpose: classify and expose the gap where `PUBLISHED` can coexist with
     `publishedActive=1/5` and `missingPublished=4`.
   - Entry condition: active-gate cohort work shows publication/projection
     still contributes to missing active coverage, or residual inventory keeps
     `missingPublished` ahead of projection.
   - Acceptance: classification-only observability closure. Failure bundles and
     causal analysis now surface publication-owner debt as
     `publication_ack_blocked / continue_local_fix`; fresh evidence remains red
     and no rolling-restart runtime repair is claimed.

6. [Topology Priority Recovery Residual Drain](../packages/todo-20260514-topology-priority-recovery-residual-drain.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `operation_workflow_owner / workflow_progress`
   - Purpose: drain or classify the non-frontier
     `control_plane_publications-p1` witness.
   - Entry condition: active-gate and publication work no longer dominate the
     first frontier, or final evidence still shows workflow-progress tails.
   - Acceptance: final evidence has no critical event-driven wait and no
     ambiguous priority recovery residual that can become the next blocker.

### Phase 2 - Failure Gate Execution And Repair

7. [Topology Failure Gate Execution Harness](../packages/done-20260514-topology-failure-gate-execution-harness.md)
   - Lane: `scenario-release-gate`
   - Owner boundary: `distributed_test_harness / failure_gate_execution`
   - Purpose: turn the existing failure-gate matrix into executable release
     gates with artifact naming and split rules.
   - Entry condition: user re-scoped the sprint segment to tools and
     observability; runtime rolling-restart fixes are explicitly out of scope.
   - Acceptance: done. Each matrix gate has a runnable command, expected
     durable outcome, artifact path, owner-boundary split rule, and assertion
     surface. Runtime behavior was not changed.

8. [Topology Failure Detection Repair Gate](../packages/done-20260514-topology-failure-detection-repair-gate.md)
   - Lane: `scenario-release-gate`
   - Owner boundary: `failure_detector / durable_repair_intent_release_gate`
   - Purpose: prove failure detection causes durable owner-key repair, not only
     status writes and events.
   - Acceptance: migrated by observe/classify artifact. Focused
     failure-detector tests pass, but the rolling-restart gate first frontier
     is `topology_publication_owner / publication_convergence` with
     `publication_pending`; no runtime behavior was changed.

9. [Topology Killed Join Gate](../packages/todo-20260514-topology-killed-join-gate.md)
   - Lane: `scenario-release-gate`
   - Owner boundary: `topology_join_owner / join_admission_rebalance_gate`
   - Purpose: prove a node killed during join converges through durable join
     intent, epoch fencing, and rebalance repair.
   - Acceptance: joining member is admitted, fenced, or terminally classified
     by owner truth without degraded evidence promoting readiness.

10. [Topology Killed Rejoin Gate](../packages/todo-20260514-topology-killed-rejoin-gate.md)
    - Lane: `scenario-release-gate`
    - Owner boundary: `topology_rejoin_owner / post_restore_reconciliation_gate`
    - Purpose: prove killed-rejoin recovery performs post-restore
      reconciliation before active placement.
    - Acceptance: local services, durable topology truth, coordinated
      operations, and active admission reconcile through owner outcomes.

11. [Topology Remote Coordinator Handoff Gate](../packages/todo-20260514-topology-remote-coordinator-handoff-gate.md)
    - Lane: `scenario-release-gate`
    - Owner boundary: `operation_workflow_owner / replica_operation_coordinator_handoff_gate`
    - Purpose: prove killed coordinator-created operations reach dispatch,
      delivery, ACK, timeout, reconcile, or terminal workflow status.
    - Acceptance: no coordinator-created operation waits only on event delivery.

12. [Topology Missed Handoff ACK Gate](../packages/done-20260514-topology-missed-handoff-ack-gate.md)
    - Lane: `scenario-release-gate`
    - Owner boundary: `topology_publication_owner / remote_handoff_ack_closure_gate`
    - Purpose: prove missed ACKs retry or terminally classify before
      publication closure.
    - Acceptance: observe/classify-only activation after the failure-detection
      gate migrated to publication convergence. Runtime fixes remain out of
      scope unless explicitly re-scoped.

13. [Topology Stale Publication Durable Truth Gate](../packages/active-20260514-topology-stale-publication-durable-truth-gate.md)
    - Lane: `scenario-release-gate`
    - Owner boundary: `topology_publication_owner / publication_truth_projection_gate`
    - Purpose: prove durable acknowledged truth outranks stale projection.
    - Acceptance: stale cache publication schedules owner-key reconcile or
      emits a typed degraded reason.

14. [Topology Rebalance Disruption Recovery Gate](../packages/todo-20260514-topology-rebalance-disruption-recovery-gate.md)
    - Lane: `scenario-release-gate`
    - Owner boundary: `topology_rebalance_owner / split_rebalance_recovery_gate`
    - Purpose: prove split/rebalance during recovery drains and converges
      durable placement under descriptor epoch and capacity admission.
    - Acceptance: placement does not succeed from unknown capacity, stale
      routing, or cache-only ownership.

### Phase 3 - Integrated Closure

15. [Topology Contract Integration Reconciliation](../packages/todo-20260514-topology-contract-integration-reconciliation.md)
    - Lane: `causal-escalation`
    - Owner boundary: `topology_control_plane / contract_integration_reconcile`
    - Purpose: verify the focused contracts from the prior sprint compose as
      one topology control-plane system.
    - Acceptance: membership epoch, failure repair, rejoin reconciliation,
      descriptor epoch, capacity admission, anti-entropy, and budgets produce
      one coherent owner-key reconciliation chain without local fallback repair.

16. [Topology Ship Gate Final Confirmation](../packages/todo-20260514-topology-ship-gate-final-confirmation.md)
    - Lane: `scenario-release-gate`
    - Owner boundary: `distributed_test_harness / rolling_restart_and_failure_gate_closure`
    - Purpose: run final representative confirmation.
    - Acceptance: `rolling-restart` reaches the ship criteria and promoted
      failure gates are green, or the sprint stops with a fresh active package
      for a narrower canonical blocker.

## Dependency Order

1. Harden workflow closure semantics before runtime fixes resume.
2. Produce residual inventory from canonical extractors.
3. Bound active-gate budget before changing active-gate cohort semantics.
4. Complete active-gate cohort and publication/projection classification before
   treating the representative gate as ready for broad failure-gate execution.
5. Drain or classify non-frontier priority recovery before final confirmation.
6. Implement the executable failure-gate harness before running individual
   gate packages.
7. Run individual gates and split runtime failures by owner boundary.
8. Run integration reconciliation after gate-specific fixes.
9. Run final rolling-restart and failure-gate confirmation last.

## Proof Ladder

1. `npm run work:context`
2. `npm run work:llm-start`
3. `npm run work:package:doctor -- --suggest <package>`
4. `npm run work:package:doctor -- --fix-dry-run <package>`
5. `npm run work:evidence-summary -- <artifact>`
6. `npm run analyze:topology-convergence -- <artifact>`
7. `npm run analyze:priority-recovery-residuals -- <artifact> --markdown`
8. `npm --silent run analyze:causal-model -- <artifact>`
9. `npm run analyze:distributed-failure -- --report <artifact>`
10. `npm run analyze:owner-files -- <owner> [boundary] --markdown`
11. Focused owner tests selected by the package.
12. Static guardrails on touched runtime, diagnostics, harness, and tracker
    files.
13. `git diff --check -- <commitScope>`
14. Final deep-dive review across the affected owner boundary and direct
    collaborators.
15. `npm run work:validate -- --entry <package>`
16. `npm run work:validate -- --pre-impl <package>`
17. `npm run work:validate -- --closure <package>`
18. Focused commit and push for each closed package.
19. Representative and gate reruns only at package-defined checkpoints.

## Closure Rules

1. The sprint cannot close on package-queue drain alone.
2. The sprint cannot close on failure-gate matrix existence alone.
3. The sprint cannot close while `active_gate_timeout`,
   `scenario_duration`, or any critical topology workflow budget is unbounded
   unless a narrower active blocker owns that residual.
4. The sprint cannot close while active-gate snapshot coverage is below `5/5`
   without a fresh narrower active blocker.
5. The sprint cannot close while publication reports `PUBLISHED` with hidden
   missing active cohort evidence.
6. The sprint cannot close while any critical operation remains only in
   `priority_recovery_event_driven_wait`.
7. The sprint cannot close unless failure gates are executed or each failed
   gate has a successor runtime package with owner, boundary, artifact, and
   next action.
8. The sprint closure note must state whether each focused contract from the
   prior sprint is now release-gate proven, still focused-only, or split to a
   successor blocker.
9. Historical proof must not be invented. Use current artifacts and package
   ledgers only.

## Current Next Action

Active-gate budget closure is done as reduced evidence: `active_gate_timeout`
is terminally classified. Active-gate owner cohort convergence is done as
migrated evidence: the admin owner snapshot names expected nodes, ready leases,
published active nodes, missing nodes, pending owner work, topology epoch, and
active-gate budget, but the representative residual is not green. Publication
projection reconciliation is done as classification-only observability:
`PUBLISHED` plus missing active publication is now a
`topology_publication_owner` blocker instead of healthy evidence.

The current action is now
[Topology Stale Publication Durable Truth Gate](../packages/active-20260514-topology-stale-publication-durable-truth-gate.md).
The predecessor
[Topology Missed Handoff ACK Gate](../packages/done-20260514-topology-missed-handoff-ack-gate.md)
migrated: `write-ack-visibility` failed after `173275ms`, but canonical
evidence did not implicate ACK absence. `pendingAckCount=0`,
`publicationStatus=PUBLISHED`, and the first frontier is
`topology_publication_owner / publication_convergence` with
`missing_published_nodes_present`, `missingPublishedCount=2`, and
`publicationPending=true`; priority recovery residual extraction reported zero
witnesses.

Observed stale-publication gate result:
`test-output/reports/topology-stale-publication-durable-truth-gate.report.json`
failed after `125041ms` and confirmed classification-only publication
truth/projection debt. `publicationStatus=PUBLISHED`, `pendingAckCount=0`,
`missingPublishedCount=2`, `publicationPending=true`, active gate was `ready`
with snapshot coverage `2/3`, and priority recovery residual extraction again
reported zero witnesses. Close the stale-publication gate as
classification-only observability and continue the remaining failure-gate
packages. Do not fix `rolling-restart` runtime behavior in this sprint segment.
