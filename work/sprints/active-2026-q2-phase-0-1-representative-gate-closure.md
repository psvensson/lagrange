# Phase 0.1 Representative Gate Closure Sprint

## Goal

Close Phase `0.1 - Internal Coherence` by making the representative gates
green rather than accumulating more reactive one-off packages.

The immediate representative gate remains `rolling-restart`. The latest representative artifact moved the first frontier off
`rebalancer_leader / operation_scheduling` and back onto operation workflow
progress:

1. owner: `operation_workflow_owner`
2. boundary: `workflow_progress / transition_deferred`
3. dominant reason: `priority_recovery_workflow_progress_transition_deferred`
4. evidence: tracked summary selection keeps operation-bearing spread progress
   canonical over later synthetic planning rows, clearing the
   `eligible_but_no_operation_created` bucket; blocked partitions are
   `sql_transaction_participants-p1`, `sql_transactions-p1`, and
   `sql_write_operations-p1`

## Current Blocker Snapshot

Active package:

1. [Rolling Restart Topology Publication Convergence ACK Pending Missing Published Reentry](../packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md)

Latest representative artifact:

1. `test-output/reports/rolling-restart-tracked-summary-selection-20260508T151500Z.report.json`

Latest playback:

1. `test-output/reports/.playback/rolling-restart-tracked-summary-selection-20260508T151500Z/rolling-restart/`

The active package is the first package in this sprint, so predecessor review
is recorded as `not-needed` with reason `first-package-in-sprint`. The first
implementation subagent proof is recorded; the next runtime slice must begin
with the normal review/fix/implementation sequencing unless explicitly waived.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` under AGPL-owned rows:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Edition matrix status: Community / AGPL repo.

## In Scope

1. Keep `rolling-restart` as the primary representative gate until it passes or
   migrates to a new named owner boundary.
2. Execute the active representative-gate package first, including its
   migrated operation-workflow blocker.
3. Preserve the closed priority-recovery workflow contract as predecessor
   proof, not as the current owner.
4. Keep sustained throughput and 7-node stress as blocked behind the current
   `rolling-restart` gate until the representative path is green.
5. Update roadmap and tracker truth with each package migration or closure.

## Out Of Scope

1. Phase `0.5` deployment, CLI, package naming, or service-platform work.
2. Phase `1.0` service manifest, catalog, lifecycle, or platform API work.
3. Broad startup/rebalancer middle-layer rewrite before a fresh artifact
   promotes that owner boundary above operation workflow progress.
4. Continuing old priority-recovery workflow-timeout residual edits inside the
   publication-convergence package without explicitly adopting them.
5. Harness timeout increases or presentation-only relabeling.

## Execution Order

1. Complete tracker and roadmap alignment for the current 0.1 gate.
2. Record the required implementation subagent proof for the active package;
   predecessor review is not needed because this is the first package in the
   sprint.
3. Freeze each migrated representative witness and write focused proof.
4. Rerun `rolling-restart --fast-local`.
5. If `rolling-restart` passes, run the 0.1 confirmation ladder for sustained
   throughput and 7-node stress.
6. If the blocker migrates to a new owner boundary, create or activate exactly
   one package for that named boundary.

## Deferred Queues

The startup/rebalancer middle-layer sprint remains queued:

1. [Startup And Rebalancer Middle-Layer Closure Sprint](./todo-2026-q2-startup-and-rebalancer-middle-layer-closure.md)

These Phase 0.5 or Phase 1.0 packages remain below 0.1 gate closure:

1. `work/packages/todo-20260416-local-cluster-bootstrap-and-getting-started-path.md`
2. `work/packages/todo-20260416-wasm-service-publish-deploy-scale-cli.md`
3. `work/packages/todo-20260416-service-manifest-schema-and-validation-contract.md`
4. `work/packages/todo-20260416-service-catalog-and-installation-reconciler.md`
5. `work/packages/todo-20260416-kernel-platform-lifecycle-state-and-cdc-context-v0.md`
6. `work/packages/todo-20260416-kernel-platform-capability-admin-topology-and-events-v0.md`

The LLM tooling package is no longer active and remains queued until focused
closure proof is separated from the 0.1 gate:

1. `work/packages/todo-20260507-work-model-ledger-and-steering-policy.md`

## Validation Ladder

1. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-tracked-summary-selection-20260508T151500Z.report.json`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-tracked-summary-selection-20260508T151500Z.report.json`
3. Focused operation-workflow progress regression or classification proof.
4. Touched-file static guardrails.
5. `git diff --check`.
6. Representative `rolling-restart --fast-local` rerun.
7. Sustained throughput and 7-node stress confirmation after
   `rolling-restart` passes.

## Done When

1. `rolling-restart` passes or migrates to one new named owner boundary with a
   focused successor package.
2. Publication convergence no longer reports unresolved `ACK_PENDING` evidence
   without an owner-classified reason.
3. Roadmap 0.1 rebaseline points at the current representative package and does
   not reference archived active sprint paths.
4. Current-blocker handoff is generated from the active package, not a manual
   closed-sprint note.
5. No Phase 0.5, Phase 1.0, or LLM-tooling queue item is allowed to outrank the
   active 0.1 representative gate.
