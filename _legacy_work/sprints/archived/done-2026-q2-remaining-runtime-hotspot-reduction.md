# Coherence Closure Before Harness Sprint (AGPL)

## Goal

Finish the remaining coherence work before spending more time on expensive
distributed-harness reruns.

The rule for this sprint is simple:

1. simplify the runtime boundary first
2. prove the simplified boundary with focused owner-path tests
3. run named harness scenarios once the boundary is coherent

Harness runs are confirmation for a coherent system. They are not the primary
tool for discovering architecture.

## Why This Sprint Exists

The system has already seen the failure mode where a slow or expensive harness
rerun exposes a bug in a boundary that is still semantically split. That pushes
the next fix toward another compatibility branch, another local fallback, or
another shadow grammar.

This sprint exists to prevent that. The remaining work is now closure and
coherence work, not broad new foundational delivery.

## Current Status

As of 2026-04-23:

1. The broad `20260413` hotspot umbrellas are no longer active implementation
   packages. Their implementation splits are archived done.
2. The admin observability/discovery slice is closed and archived.
3. Authoritative observation, membership publication, publication recovery
   gating, partition-leader convergence, transport semantic isolation, and
   shadow-grammar deletion are structurally landed and archived after focused
   proof.
4. `Canonical Readiness Ladder And Admission Closure` is now closed and
   archived after the readiness/admission projection cutover, focused proof,
   and repo metrics pass.
5. `Distributed harness failure-bundle confirmation path repair` is now closed
   after focused harness proof, `npm run test:metrics`, and reruns of
   `node-join-under-load` and `rolling-restart` that record scenario/run
   bundles instead of crashing in teardown.
6. The convergence-assertion and restart-boundary blocker packages are now
   closed after focused proof, `npm run test:metrics`, and scenario reruns that
   remove the false blocker signatures.
7. The convergence-assertion, stop/start boundary, and learner-promotion crash
   blockers are removed.
8. The original shared startup/rejoin under-load boundary has been moved
   forward enough to split cleanly:
   `rolling-restart` now closes `restart_recovery`,
   while `node-join-under-load` now fails later on priority-recovery
   convergence and remove-safety under load.
9. `Oversized Runtime Decomposition Tranche 2` is deferred to `todo` status.
   It is valid hygiene work, but it is not the current critical path.
10. The successor startup/rebalancer middle-layer sprint remains `todo` until
   the sprint-level scenario confirmation pass completes or opens a narrow
   follow-up bug.
11. The latest `node-join-under-load` confirmation artifact still points at the
    same later priority-recovery/remove-safety boundary, but the recorded
    report path drops key progress, witness, and per-partition reasoning into
    `null`/`0` summaries.
12. The sprint therefore now makes diagnostics/reporting closure explicit as
    sequenced packages instead of leaving admin/harness/reporting tails inside
    the active runtime package as implicit residuals.
13. Focused non-harness proof has now closed the STOPPING visibility,
    deferred-observation, and retry-metadata slice on the priority-recovery
    runtime path.
14. One deferred `node-join-under-load` confirmation rerun narrowed the
    remaining blocker to duplicate or incorrectly admitted node incarnation
    state contaminating publication, projection, and priority-recovery
    eligibility.
15. The remaining critical path is therefore no longer broad priority-recovery
    completion grammar. It is cluster-incarnation fencing and admitted-cohort
    cutover on the existing startup-authority, readiness, publication, and
    reintegration owners.
16. The cluster-incarnation fence, admitted-cohort cutover, canonical
    priority-recovery observation snapshot, and reporting tail-consumer
    cutovers are now implemented on focused non-harness proof.
17. The deferred sprint-level harness confirmation pass was executed once the
    active implementation lane was coherent enough to stop hiding the blocker
    behind shadow grammar.
18. The only red non-harness gate in the current dirty worktree is the
    repo-wide cognitive-complexity ratchet: the script baseline is `144`,
    while the current worktree reports `149` violations.
19. The latest deferred `node-join-under-load` rerun narrowed the remaining
    runtime blocker further: publication still reports five blocked priority
    partitions, but the runtime decision snapshot reduces unresolved work to
    one partition, `sql_transaction_participants-p1`.
20. The dominant reason is now
    `priority_recovery_workflow_progress_event_driven`, owned by
    `operation_workflow_owner` at the `workflow_progress` boundary while the
    latest in-flight operation remains at `CREATING`.
21. That rerun proves the reporting grammar cutover worked, but it also
    exposes a second liveness gap: the shared snapshot still does not reuse
    the existing workflow-owner timeout and stale-operation evidence, so an
    overdue in-flight step can still look like generic event-driven waiting.
22. The new critical path is therefore explicit workflow-progress liveness on
    the existing owner path:
    one canonical answer for phase,
    age versus timeout,
    reconcile-due versus still-fresh wait,
    and the mandatory owner action before another harness pass.
23. Focused non-harness proof is now green for the workflow-progress liveness
    contract on the shared snapshot, admin control-snapshot, and
    harness/failure-bundle consumer paths.
24. The remaining pre-harness runtime closure is now explicitly narrowed to
    the workflow-owner state-machine / timeout-reconcile path, and is split as
    its own sequenced package instead of being patched inside the grammar
    package.
25. The runtime-grammar hierarchy and actuation closure sprint was reopened as
    an amendment on 2026-04-23, then closed after focused proof and the
    deferred `node-join-under-load` confirmation rerun.
26. That rerun confirms the grammar contradiction is gone:
    `sql_write_operations-p1` now reports
    `actuationState = persist_blocked_by_pressure` with
    `nextRequiredAction = create_recovery_operation`,
    not `completed`.
27. The scenario still fails, but the dominant blocker has migrated again:
    `sql_write_operations-p1`,
    owner `rebalancer_leader`,
    boundary `operation_scheduling`,
    dominant reason
    `priority_recovery_operation_scheduling_persist_blocked_by_pressure`.
28. A secondary unresolved witness remains on `sql_transactions-p1` at
    `workflow_progress`,
    owner `operation_workflow_owner`,
    latest visible step `CREATING`,
    so the workflow-owner timeout/state-machine package stays sequenced but is
    no longer the first blocker.
29. The next critical path is therefore explicit follow-up operation creation
    under control-plane write pressure on the existing rebalancer-leader path,
    and that blocker is split as its own package before another harness rerun.
30. Focused proof is now green for the follow-up visibility closure on the
    shared priority-recovery snapshot and admin control-snapshot consumer path.
31. Focused proof is now green for the workflow-owner timeout-reconcile closure
    on the owner-lane retry path, the shared snapshot, and the atomic
    transition regressions.
32. `npm run test:metrics` is green again with the cognitive-complexity ratchet
    back at `144/144`.
33. No active or sequenced package remains in this sprint; the sprint closes on
    focused proof and tracker closure without another harness rerun in this
    work cycle.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

`roadmap.md` already marks the core Phase `0.1` topology and failure-simulation
rows as complete. This sprint therefore owns closure and simplification of the
remaining hot-path boundaries, not new roadmap capability delivery.

## Active Packages

No `active-...` or `todo-...` package remains in this sprint.

## Final Closures In This Sprint

1. [Priority-recovery operation-scheduling pressure and follow-up creation closure](../../packages/done-20260423-priority-recovery-operation-scheduling-pressure-and-followup-creation-closure.md)
2. [Priority-recovery workflow-owner progress state-machine and timeout-reconcile closure](../../packages/archived/done-20260422-priority-recovery-workflow-owner-progress-state-machine-and-timeout-reconcile-closure.md)

## Closed In This Sprint

1. [Admin observability and discovery predictability](../../packages/archived/done-20260413-admin-control-snapshot-follow-on-cognitive-complexity-reduction.md)
2. [Control-plane readiness and message delivery predictability](../../packages/archived/done-20260413-control-plane-and-transport-cognitive-complexity-reduction.md)
3. [Partition and query routing predictability](../../packages/archived/done-20260413-partition-and-query-cognitive-complexity-reduction.md)
4. [Authoritative observation and topology blocker cutover](../../packages/archived/done-20260419-authoritative-observation-and-topology-blocker-cutover.md)
5. [Membership publication runtime owner unification](../../packages/archived/done-20260419-membership-publication-runtime-owner-unification.md)
6. [Publication acknowledgement and recovery-gate single-owner cutover](../../packages/archived/done-20260419-publication-acknowledgement-and-recovery-gate-single-owner-cutover.md)
7. [Partition leader owner-row convergence hardening](../../packages/archived/done-20260419-partition-leader-owner-row-convergence-hardening.md)
8. [Transport semantic isolation from readiness and workflow](../../packages/archived/done-20260419-transport-semantic-isolation-from-readiness-and-workflow.md)
9. [Shadow-grammar deletion across readiness, bootstrap, and rebalancer](../../packages/archived/done-20260419-shadow-grammar-deletion-across-readiness-bootstrap-and-rebalancer.md)
10. [Canonical readiness ladder and admission closure](../../packages/archived/done-20260419-canonical-readiness-ladder-and-admission-closure.md)
11. [Distributed harness failure-bundle confirmation path repair](../../packages/archived/done-20260420-distributed-harness-failure-bundle-confirmation-path-repair.md)
12. [Distributed scenario confirmation follow-up repair](../../packages/archived/done-20260420-distributed-scenario-confirmation-follow-up-repair.md)
13. [Node-join convergence assertion boundary repair](../../packages/archived/done-20260421-node-join-convergence-assertion-boundary-repair.md)
14. [Rolling-restart stop/start boundary repair](../../packages/archived/done-20260421-rolling-restart-stop-start-boundary-repair.md)
15. [Priority-recovery runtime decision-snapshot owner cutover](../../packages/archived/done-20260421-priority-recovery-runtime-decision-snapshot-owner-cutover.md)
16. [Priority-recovery progress handoff contract](../../packages/archived/done-20260422-priority-recovery-progress-handoff-contract.md)
17. [Admitted participation cohort cutover for projection, publication, and priority recovery](../../packages/archived/done-20260422-admitted-participation-cohort-cutover-for-projection-publication-and-priority-recovery.md)
18. [Priority-recovery workflow, visibility, and convergence contract unification](../../packages/archived/done-20260421-priority-recovery-workflow-visibility-and-convergence-contract-unification.md)
19. [Priority-recovery observation contract and state grammar closure](../../packages/archived/done-20260421-priority-recovery-observation-contract-and-state-grammar-closure.md)
20. [Priority-recovery harness, reporting, and tail-consumer cutover](../../packages/archived/done-20260421-priority-recovery-harness-reporting-and-tail-consumer-cutover.md)
21. [Priority-recovery progress consumer cutover](../../packages/archived/done-20260422-priority-recovery-progress-consumer-cutover.md)
22. [Priority-recovery completion and remove-safety under load closure](../../packages/archived/done-20260421-priority-recovery-completion-and-remove-safety-under-load-closure.md)
23. [Cluster-incarnation fence and existing-owner admission cutover](../../packages/archived/done-20260422-cluster-incarnation-fence-and-existing-owner-admission-cutover.md)
24. [Priority-recovery workflow-progress liveness and timeout cutover](../../packages/archived/done-20260422-priority-recovery-workflow-progress-liveness-and-timeout-cutover.md)

## Deferred After Closure

1. [Oversized runtime decomposition tranche 2](../../packages/todo-20260419-oversized-runtime-decomposition-tranche-2.md)
2. [Startup and rebalancer middle-layer closure sprint](../todo-2026-q2-startup-and-rebalancer-middle-layer-closure.md)
3. [Rolling-restart load-pressure follow-up](../../packages/todo-20260421-rolling-restart-load-pressure-follow-up.md)
4. [Test and harness file decomposition](../../packages/todo-20260419-test-and-harness-file-decomposition.md)
5. [File-hygiene exemption policy and enforcement](../../packages/todo-20260419-file-hygiene-exemption-policy-and-enforcement.md)

## Validation Model

1. Package closure requires one owner contract, deletion of touched
   compatibility paths, focused proof, and `npm run test:metrics`.
2. Named harness reruns are not per-package closure gates for structural
   simplification work.
3. Shared-boundary closure on this sprint is not complete until the runtime
   package, runtime decision-snapshot owner package, observation-contract
   package, and harness/reporting package all preserve one priority-recovery
   snapshot vocabulary across the touched path.
4. Once no active coherence package remains, run one sprint-level scenario
   confirmation pass for:
   `node-join-under-load`,
   `rolling-restart`,
   `seed-restart-under-load`,
   `seven-node-load-during-partitioning`, and
   `seven-node-postgres-baseline-partition-split`.
5. If that sprint-level pass exposes defects, open narrow bug packages against
   the coherent boundary instead of reopening broad architecture umbrellas.

## Execution Order

1. Execute the sequenced operation-scheduling pressure and follow-up creation
   closure package.
2. Execute the sequenced workflow-owner progress state-machine and
   timeout-reconcile closure package once the dominant scheduling blocker is
   reduced or if focused proof shows the workflow seam has become primary
   again.
3. Defer the next `node-join-under-load` rerun to the next operator work cycle;
   this sprint closes on focused proof and tracker closure without another
   harness pass.
4. If `rolling-restart` still fails after restart-recovery closure, activate
   the narrow load-pressure follow-up package.
5. Resume the remaining sprint-level scenario confirmation pass for
   `seed-restart-under-load`,
   `seven-node-load-during-partitioning`, and
   `seven-node-postgres-baseline-partition-split`.
6. If another genuinely separate blocker appears, isolate it in its own
   package rather than splitting one shared boundary back into scenario-local
   symptom packages.
7. Use the completed sprint-level confirmation pass to unblock the successor
   middle-layer sprint.

## Exit Check

1. No active package remains open only because a named harness rerun has not
   been executed.
2. No active package duplicates one shared runtime boundary across multiple
   scenarios as separate symptom work.
3. The readiness/admission boundary uses one canonical staged contract without
   tail consumer reinterpretation on the touched path.
4. Remaining deferred work is explicitly `todo`, not silently mixed into the
   active coherence lane.
5. The priority-recovery observation contract is identical across runtime,
   admin, harness, and reporting surfaces on the touched path.
6. The sprint-level scenario confirmation pass completes on recorded scenario
   results rather than crashing in the harness teardown/reporting path or
   hiding the remaining blocker behind null/zero summaries.
