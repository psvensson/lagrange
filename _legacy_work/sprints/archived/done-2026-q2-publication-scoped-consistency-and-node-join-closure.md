# Operation Workflow And Priority Recovery Contract Rewrite Sprint

## Goal

Stop the reactive `rolling-restart` blocker chase and replace the recurring
priority-recovery operation-workflow seams with one explicit contract:

1. one normalized evidence snapshot
2. one progress/timeout state model
3. one decision table
4. one canonical outcome and reason vocabulary
5. one presentation path for failure bundles and topology convergence

The sprint keeps the old filename for branch and tooling continuity. The
execution scope is no longer publication-scoped bug chasing; it is a bounded
contract rewrite for the surfaces that kept generating new blockers.

## Exit Result

This sprint is complete as of May 8, 2026.

Exit proof:

1. The shared priority-recovery workflow contract cutover landed and the
   focused owner, consumer, and presentation proof is green.
2. The representative `rolling-restart --fast-local` rerun no longer stops on
   `operation_workflow_owner / priority_recovery_progress /
   workflow_progress_timeout_contract`.
3. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-recovery-workflow-contract-rewrite-20260508T095320Z.report.json`
   selects `topology_publication_owner / publication_convergence` as the first
   frontier with dominant reason `publication_pending`.
4. The sprint `Done When` condition is therefore satisfied by migration to a
   new named owner boundary that is not caused by priority-recovery
   operation-workflow reinterpretation.

## Stop Decision

The previous runtime-stability sprint is stopped as of May 8, 2026.

Reason:

1. The representative gate repeatedly migrated through small and medium bugs.
2. The migrations clustered around priority recovery, operation scheduling,
   workflow progress, workflow timeout, dispatch-pending actuation, startup
   active-gate support, and failure-bundle classification.
3. The pattern indicates a porous contract, not isolated local defects.
4. Continuing with one-off repairs is likely to spend more time exposing the
   next nearby seam than reducing the boundary.

The stopped reactive package is retained as dormant residual context:

1. [Rolling Restart Topology Priority Recovery Workflow Timeout Sql Transaction Participants Dispatch Pending Reentry](../packages/todo-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-sql-transaction-participants-dispatch-pending-reentry.md)

## Closure Handoff

The active contract-rewrite package closes by migration to a queued
publication-convergence follow-on:

1. [Priority Recovery Operation Workflow Contract Rewrite](../packages/done-20260508-priority-recovery-operation-workflow-contract-rewrite.md)
2. [Rolling Restart Topology Publication Convergence ACK Pending Missing Published Reentry](../packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md)

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Freeze representative evidence from the recent `rolling-restart` blocker
   chain as owner-decision fixtures.
2. Rewrite the priority-recovery operation-workflow contract around one
   normalized evidence snapshot.
3. Model operation scheduling, workflow progress, workflow timeout,
   dispatch-pending actuation, and stale planning visibility as one decision
   table instead of separate presentation-selected blocker classes.
4. Cut priority recovery dominant-witness selection over to the contract.
5. Cut failure-bundle and topology-convergence presentation over to the
   contract.
6. Keep startup active-gate and publication as consumers unless the new
   contract proves they are the direct owner.
7. Rerun `rolling-restart` only after contract-backed focused proof is green.

## Out Of Scope

1. A full runtime rewrite.
2. Rewriting startup active-gate or publication owners first.
3. Harness-only timeout increases or classification shortcuts.
4. Broad matrix continuation while the representative path is unstable.
5. Pro or Enterprise behavior.

## Scenario Target

Primary:

1. `rolling-restart` with `test/distributed/config/local.json`

Historical proof retained:

1. `node-join-under-load` passed once and passed a no-code confirmation rerun.

Secondary after the primary path is stable:

1. `seven-node-read-write-load-transaction-recovery`
2. `seven-node-load-during-partitioning`

## Executed Package

The sprint’s structural rewrite package is:

1. [Priority Recovery Operation Workflow Contract Rewrite](../packages/done-20260508-priority-recovery-operation-workflow-contract-rewrite.md)

## Contract Surfaces

Primary owner boundary:

1. `operation_workflow_owner / priority_recovery_progress /
   workflow_progress_timeout_contract`

Surfaces to unify:

1. operation scheduling evidence
2. workflow progress evidence
3. workflow timeout evidence
4. dispatch-pending actuation evidence
5. stale planning visibility evidence
6. priority recovery dominant-witness selection
7. failure-bundle classification
8. topology-convergence frontier selection

Consumers that must not reconstruct the decision:

1. startup active-gate support
2. publication convergence presentation
3. distributed failure summaries
4. diagnostics and replay tooling

## Strategy

1. Freeze evidence first.
   Build golden owner-decision fixtures from the recent representative
   artifacts before changing runtime behavior.
2. Define the contract.
   Create one normalized evidence snapshot with named owner fields, one
   state model, one decision table, and one canonical reason vocabulary.
3. Adapt existing paths.
   Keep public entrypoints stable while routing runtime and presentation code
   through the contract.
4. Remove ambiguity.
   Delete or fence branch piles that independently classify scheduling,
   progress, timeout, and startup support.
5. Rerun the representative gate.
   `rolling-restart` is rerun only after focused owner and presentation tests
   prove the contract.

## Evidence Fixture Candidates

1. `test-output/reports/rolling-restart-after-priority-recovery-dominant-witness-reclassify-20260507T000000Z.report.json`
2. `test-output/reports/rolling-restart-after-priority-recovery-visibility-wakeup-20260507T000000Z.report.json`
3. `test-output/reports/rolling-restart-after-publication-ack-pending-canonicalization-20260508T000000Z.report.json`
4. `test-output/reports/rolling-restart-after-priority-recovery-timeout-authoritative-observation-20260508T000000Z.report.json`
5. `test-output/reports/rolling-restart-after-stale-priority-planning-visibility-20260508T000000Z.report.json`

## Queued Residuals

These are valid residuals, but they should not preempt the structural package
unless the representative evidence returns to their named boundary:

1. [Rolling Restart Topology Priority Recovery Workflow Timeout Sql Transaction Participants Dispatch Pending Reentry](../packages/todo-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-sql-transaction-participants-dispatch-pending-reentry.md)
2. [Rolling restart operation transition pressure and over-target trim](../packages/todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md)
3. [Rolling restart post-active convergence timeout](../packages/todo-20260424-rolling-restart-post-active-convergence-timeout.md)
4. [Admin observation owner cutover and repair fencing](../packages/todo-20260424-admin-observation-owner-cutover-and-repair-fencing.md)
5. [Critical pressure workload taxonomy audit](../packages/todo-20260424-critical-pressure-workload-taxonomy-audit.md)
6. [Critical replace operation lifecycle convergence owner](../packages/todo-20260424-critical-replace-operation-lifecycle-convergence-owner.md)
7. [Rolling restart in-flight operation drain and CDC pressure](../packages/todo-20260425-rolling-restart-inflight-operation-drain-and-cdc-pressure.md)
8. [Structural bookkeeping semantic source names](../packages/todo-20260429-structural-bookkeeping-semantic-source-names.md)
9. [Rolling Restart Topology Publication Convergence ACK Pending Missing Published Reentry](../packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md)

## Validation Ladder

1. Golden owner-decision fixtures.
2. Focused operation-workflow progress/timeout decision-table tests.
3. Priority recovery dominant-witness tests.
4. Failure-bundle and topology-convergence presentation tests.
5. Touched-file static guardrails.
6. Representative `rolling-restart --fast-local` rerun.

## Done When

1. The reactive blocker chain is represented by fixture-backed contract cases.
2. Operation scheduling, progress, timeout, and dispatch-pending actuation
   produce one canonical priority-recovery outcome.
3. Failure bundles and topology convergence consume that outcome instead of
   reconstructing blocker class from partial evidence.
4. Startup active-gate and publication remain downstream consumers unless the
   contract closes and they become the direct frontier.
5. `rolling-restart` either passes or migrates to a new named owner boundary
   that is not caused by priority-recovery operation-workflow
   reinterpretation.
