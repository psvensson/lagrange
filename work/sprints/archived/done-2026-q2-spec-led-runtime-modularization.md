# Spec-Led Runtime Modularization Sprint

Status: done. This sprint was activated by human direction on May 9, 2026 after
the prior rolling-restart package closed. It advanced one representative
rolling-restart frontier at a time until the active-gate publication-lag package
reduced its owner witness and migrated the remaining representative blocker to a
fresh publication ACK convergence package.

## Current Package Snapshot

Closed package:
`work/packages/done-20260510-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag-frontier.md`.

**Package status: DONE; REPRESENTATIVE FRONTIER MIGRATED**

Owner boundary:
`startup_active_gate_owner / snapshot_coverage`.

Current state: the CL-006 startup publication-lag owner path is reduced by the
focused package fixture and runtime repair. The latest representative rerun is
still non-green, but the first critical path moved to
`publication_ack_convergence / publication_ack_blocked`; the active-gate witness
is now downstream. The fresh blocker is recorded as a successor package in the
follow-up sprint.

Active and queued work:
Closed frontier package:
`work/packages/done-20260510-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag-frontier.md`
(active-gate snapshot coverage publication lag frontier).

Follow-up successor package:
`work/packages/todo-20260511-spec-led-runtime-modularization-publication-ack-convergence-publication-published-frontier.md`
(publication ACK convergence publication-published frontier).

Recently completed workflow-progress package:
`work/packages/done-20260510-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight-frontier.md`.

Recently completed active-gate architecture-gap package:
`work/packages/done-20260510-spec-led-runtime-modularization-active-gate-snapshot-coverage-architecture-gap.md`.

Latest closed causal-analysis package:
`work/packages/done-20260510-spec-led-runtime-modularization-high-level-causal-analysis-infrastructure.md`.

Most recent classification closure:
`work/packages/done-20260510-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability-frontier.md`.

Deferred companion cleanup:
`work/packages/todo-20260509-spec-led-runtime-modularization-active-gate-report-schema-alias-deletion.md`
(remains deferred to the follow-up sprint because the representative gate is a
runtime publication frontier, not diagnostics schema aliases).

Latest closed proof package:
`work/packages/done-20260510-spec-led-runtime-modularization-representative-green-proof-or-next-blocker.md`.

Next proof surface: activate the publication ACK convergence successor only
after a fresh review subagent reviews the closed active-gate publication-lag
package. Do not repeat the completed `sql_write_operations-p1` dispatch-pending
workflow-progress repair. Diagnostics schema alias cleanup remains deferred.

## Goal

Rewrite the next layer of troublesome runtime logic from sound specifications,
not by patching old branches. The sprint creates modular owner contracts first,
then replaces runtime logic owner by owner, and deletes compatibility paths once
the contract and proof ladder are stable.

## Scope Basis

1. Roadmap Phase `0.1 - Internal Coherence` release-gate closure and runtime
   coherence scope.
2. Core topology control-plane rewrite follow-on:
   `work/sprints/archived/done-2026-q2-core-topology-control-plane-rewrite.md`.
3. Specification pack:
   `.kiro/specs/spec-led-runtime-modularization/overview.md`.
4. Edition scope: Community / AGPL repo only.

## Rewrite Doctrine

1. Specifications become executable module contracts before runtime code moves.
2. Each semantic owner is split into evidence, state, decision, effects, ports,
   adapter, and diagnostics modules.
3. Decisions are pure and table-driven; effects are canonical commands emitted
   from those decisions.
4. Diagnostics, harnesses, analyzers, and admin surfaces observe owner
   decisions. They do not classify from raw runtime traces.
5. Deletion is part of every runtime package, not a cleanup afterthought.

## Best-Of-Breed Tactics To Borrow

1. Kubernetes controllers: reconcile desired and observed state, write status
   through the owning controller, and make conditions stable for consumers.
2. Temporal and Cadence: keep workflow history durable, deterministic, and
   replayable; workers execute commands but do not reinterpret workflow state.
3. Raft and KRaft controllers: order metadata transitions through one owner log
   instead of allowing scattered publication side effects.
4. Kubernetes Scheduler and CockroachDB allocator: separate filter, score,
   reserve, and commit intent phases.
5. etcd and Kubernetes watches: expose revisioned streams and freshness fences,
   not cache-presence guesses.
6. SRE diagnostic pipelines: derive one dominant witness from canonical signals
   and keep diagnostics read-only.

## Package Queue

1. [Spec And Reference Pattern Rebaseline](../packages/done-20260509-spec-led-runtime-modularization-spec-and-reference-patterns.md)
2. [Operation Owner Decision Kernel](../packages/done-20260509-spec-led-runtime-modularization-operation-owner-kernel.md)
3. [Priority Recovery Observation Contract](../packages/done-20260509-spec-led-runtime-modularization-priority-recovery-observation-contract.md)
4. [Workflow Owner Adapter Cutover](../packages/done-20260509-spec-led-runtime-modularization-workflow-owner-adapter-cutover.md)
5. [Placement Owner Policy Kernel](../packages/done-20260509-spec-led-runtime-modularization-placement-owner-kernel.md)
6. [Publication Owner Stream Contract](../packages/done-20260509-spec-led-runtime-modularization-publication-owner-stream.md)
7. [Projection Readiness Contract](../packages/done-20260509-spec-led-runtime-modularization-projection-readiness-contract.md)
8. [Diagnostics And Harness Consumer Rewrite](../packages/done-20260509-spec-led-runtime-modularization-diagnostics-harness-consumer.md)
9. [Legacy Deletion And Representative Proof](../packages/done-20260509-spec-led-runtime-modularization-legacy-deletion-proof.md)
10. [Publication ACK Convergence Frontier](../packages/done-20260509-spec-led-runtime-modularization-publication-ack-convergence-frontier.md)
11. [Active Gate Snapshot Coverage Frontier](../packages/done-20260509-spec-led-runtime-modularization-active-gate-snapshot-coverage-frontier.md)
12. [Operation Workflow Timeout Frontier](../packages/done-20260509-spec-led-runtime-modularization-operation-workflow-timeout-frontier.md)
13. [Publication Convergence Frontier](../packages/done-20260509-spec-led-runtime-modularization-publication-convergence-frontier.md)
14. [Operation Workflow Rebalancer Handoff Frontier](../packages/done-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-frontier.md)
15. [Operation Workflow Timeout Transition-Deferred Frontier](../packages/done-20260509-spec-led-runtime-modularization-operation-workflow-timeout-transition-deferred-frontier.md)
16. [Operation Workflow Progress Event-Driven Frontier](../packages/done-20260509-spec-led-runtime-modularization-operation-workflow-progress-event-driven-frontier.md)
17. [Operation Scheduling Event-Driven Frontier](../packages/done-20260509-spec-led-runtime-modularization-operation-scheduling-event-driven-frontier.md)
18. [Operation Workflow Rebalancer Handoff Retry-Scheduled Frontier](../packages/done-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-retry-scheduled-frontier.md)
19. [Operation Workflow Progress Dispatch-Pending Frontier](../packages/done-20260509-spec-led-runtime-modularization-operation-workflow-progress-dispatch-pending-frontier.md)
20. [Operation Scheduling SQL Write Operations Frontier](../packages/done-20260509-spec-led-runtime-modularization-operation-scheduling-sql-write-operations-frontier.md)
21. [Representative Green Proof Or Next Blocker Classification](../packages/done-20260510-spec-led-runtime-modularization-representative-green-proof-or-next-blocker.md)
22. [Operation Workflow Progress SQL Transactions Dispatch-Pending Frontier](../packages/done-20260510-spec-led-runtime-modularization-operation-workflow-progress-sql-transactions-dispatch-pending-frontier.md)
23. [Active Gate Snapshot Coverage Reachability Frontier](../packages/done-20260510-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability-frontier.md)
24. [High-Level Causal-Analysis Infrastructure](../packages/done-20260510-spec-led-runtime-modularization-high-level-causal-analysis-infrastructure.md)
25. [Active Gate Report Schema Alias Deletion](../packages/todo-20260509-spec-led-runtime-modularization-active-gate-report-schema-alias-deletion.md)
26. [Operation Workflow Progress Recovering-In-Flight Frontier](../packages/done-20260510-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight-frontier.md)
27. [Active Gate Snapshot Coverage Publication Lag Frontier](../packages/done-20260510-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag-frontier.md)
28. [Publication ACK Convergence Publication-Published Frontier](../packages/todo-20260511-spec-led-runtime-modularization-publication-ack-convergence-publication-published-frontier.md)

## Model Fit Strategy

The sprint now separates broad orchestration from Spark-safe leaf work.

1. `Legacy Deletion And Representative Proof` is `escalation-required` because
   it spans runtime owner closure and representative proof. Its intended
   minimum model is `gpt-5.3-codex`.
2. `Active Gate Report Schema Alias Deletion` is a bounded implementation leaf
   slice intended for `gpt-5.3-codex-spark`. It may rename/remove diagnostics
   artifact schema aliases only within its owned files.
3. `Publication ACK Convergence Frontier` is a representative frontier closure
   package intended for `gpt-5.3-codex`. It owns the publication convergence
   boundary and must not expand into active-gate schema cleanup.
4. `Operation Scheduling Event-Driven Frontier` is a representative frontier
   closure package intended for `gpt-5.3-codex`. It owns the rebalancer leader
   operation-scheduling boundary and must not reopen operation workflow
   progress handling unless the focused fixture proves regression.
5. `Operation Workflow Rebalancer Handoff Retry-Scheduled Frontier` is a
   representative frontier closure package intended for `gpt-5.3-codex`. It
   owns the operation workflow handoff boundary and must not reopen operation
   scheduling unless the focused fixture proves regression.
6. `Operation Workflow Progress Dispatch-Pending Frontier` is a representative
   frontier closure package intended for `gpt-5.3-codex`. It owns the operation
   workflow progress boundary and must not reopen handoff retry-log summary
   shadowing unless the focused fixture proves regression.
7. `Operation Scheduling SQL Write Operations Frontier` is a representative
   frontier closure package intended for `gpt-5.3-codex`. It owns the
   rebalancer leader operation-scheduling boundary and must not reopen
   workflow progress unless the focused fixture proves regression.
8. `Representative Green Proof Or Next Blocker Classification` is a
   proof-only leaf package intended for `gpt-5.3-codex-spark`. It may run and
   analyze the representative scenario, update tracker truth, and activate one
   new owner-boundary package if the normalized evidence moved. It must not
   edit runtime, tests, diagnostics, analyzers, or harness behavior.
9. `Operation Workflow Progress SQL Transactions Dispatch-Pending Frontier` is
    a representative frontier closure package intended for `gpt-5.3-codex`.
    It owns the migrated `operation_workflow_owner / workflow_progress`
    boundary for the `sql_transactions-p1` persisted-not-dispatched
    dispatch-pending witness and must not reopen the closed operation scheduling
    package unless the focused fixture proves regression.
10. `Active Gate Snapshot Coverage Reachability Frontier` is a representative
    frontier closure package intended for `gpt-5.3-codex`. It owns the migrated
    `startup_active_gate_owner / snapshot_coverage` boundary and must not reopen
    workflow progress, publication convergence, or priority recovery unless the
    focused fixture proves regression.
11. A package intended for `gpt-5.3-codex-spark` must keep `Scope shape:
     leaf-slice`, list owned and forbidden files, freeze decisions, name
     escalation triggers, and provide focused proof.
12. `Operation Workflow Progress Recovering-In-Flight Frontier` was a
    representative frontier closure package intended for `gpt-5.3-codex`. It
    closed the reduced `operation_workflow_owner / workflow_progress` residual
    for recovering-in-flight dispatch-pending priority work and must not be
    repeated unless a focused fixture proves direct regression.
13. Representative proof may classify a leaf slice as closed, reduced,
    migrated, or same-frontier. It must not expand implementation scope inside
    the leaf package.
14. `Active Gate Snapshot Coverage Publication Lag Frontier` is a
     representative frontier closure package intended for `gpt-5.3-codex`. It
     owns the fresh `startup_active_gate_owner / snapshot_coverage` residual with
     closure witness class `startup_active_publication_lag` and must not repeat
     completed workflow-progress repair work unless a focused fixture proves
     direct regression.
15. `Publication ACK Convergence Publication-Published Frontier` is the successor
    representative frontier closure package intended for `gpt-5.3-codex`. It is
    deferred to the follow-up sprint and owns the migrated
    `topology_publication_owner / publication_convergence` residual.

## Activation Rules

1. Activate only one package at a time.
2. Before runtime implementation starts, move the selected package to `active`
   and record real review, fix if needed, and implementation subagent proof.
3. Active metadata-bearing packages must carry a `## Model Fit` section before
   implementation starts.
4. Runtime packages must freeze one filled module contract before production or
   test edits begin.
5. Keep the parked rolling-restart sprint as predecessor evidence unless a
   fresh owner-boundary package explicitly reopens it.
6. Each runtime package starts with a decision-contract fixture or structural
   guard that fails for the old behavior.
7. Each runtime package ends with explicit deletion, downgrade, or quarantine of
   superseded paths.
8. After the active runtime frontier package closes, activate the representative
   proof/classification package before companion cleanup, schema cleanup, or
   any broad successor runtime work.
9. If representative proof still fails on the same owner boundary, update the
   active package snapshot instead of creating a new package. If it fails on a
   new owner boundary, activate exactly one successor frontier with a generated
   evidence block.

## Cross-Package Invariants

1. Runtime state cannot be encoded with `null`, `undefined`, missing rows, raw
   elapsed time, or cache presence.
2. Owner modules do not import diagnostics, harnesses, or admin presentation
   code.
3. Consumers cannot choose a new owner-boundary label unless the owner decision
   contract emits it.
4. Best-of-breed inspiration is tactical only. Do not import a foreign system's
   vocabulary when the local specification already owns the domain language.
5. No Pro or Enterprise feature work enters this sprint.

## Exit Criteria

1. All packages in the queue are closed, superseded with a named replacement, or
   explicitly deferred in a new sprint.
2. Operation, priority recovery, placement, publication, projection/readiness,
   and diagnostics consumers all read from owner contracts.
3. Legacy compatibility branches, shadow grammars, and fallback decisions named
   by the migration map are deleted or guarded as unreachable.
4. Representative rolling-restart proof is green or has migrated to a fresh
   owner-boundary package with a canonical evidence block.
5. No companion cleanup package starts while the representative proof gate is
   unclassified.

## Closure Notes

1. The active-gate publication-lag package is closed as migrated after focused
   owner-path proof and latest representative evidence moved the first critical
   path to `publication_ack_convergence / publication_ack_blocked`.
2. The fresh publication ACK convergence frontier is deferred to
   `work/sprints/todo-2026-q2-spec-led-runtime-modularization-publication-ack-followup.md`.
3. The active-gate report schema alias deletion package remains deferred to that
   follow-up sprint and must not start before the representative publication
   frontier is classified.
4. No Pro or Enterprise work entered the sprint.
