# Priority Recovery Operation Workflow Contract Rewrite

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-stale-priority-planning-visibility-20260508T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-stale-priority-planning-visibility-20260508T000000Z/rolling-restart/",
  "owner": "Priority recovery operation workflow contract rewrite",
  "boundary": "operation_workflow_owner / priority_recovery_progress / workflow_progress_timeout_contract",
  "dominantReason": "reactive_blocker_migration_from_porous_progress_contract",
  "currentState": "The shared priority-recovery workflow contract cutover is now implemented and locally proved. The representative rolling-restart rerun no longer fails on operation_workflow_owner / priority_recovery_progress / workflow_progress_timeout_contract; the first frontier migrated to topology_publication_owner / publication_convergence with publicationStatus=ACK_PENDING, pendingAckCount=1, and missingPublishedCount=2.",
  "nextAction": "Close this package and sprint by migration. Queue follow-on work on topology_publication_owner / publication_convergence while keeping the contract rewrite recorded as the closure that moved the representative gate off the old priority-recovery workflow boundary.",
  "proof": [
    "Golden owner-decision fixtures from the latest representative rolling-restart artifacts",
    "Focused operation-workflow progress/timeout decision-table tests",
    "Priority recovery dominant-witness selection tests",
    "Failure-bundle and topology-convergence presentation tests",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun only after contract cutover"
  ],
  "touchedFiles": [
    "work/packages/done-20260508-priority-recovery-operation-workflow-contract-rewrite.md",
    "work/packages/done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-priority-recovery-stale-planning-visibility-reentry.md",
    "work/packages/todo-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md",
    "work/packages/todo-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-sql-transaction-participants-dispatch-pending-reentry.md",
    "work/sprints/archived/done-2026-q2-publication-scoped-consistency-and-node-join-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/model-ledger.jsonl",
    "src/control-plane/priority-recovery-snapshot-stage-8.js",
    "src/control-plane/priority-recovery-snapshot-stage-9.js",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "src/control-plane/priority-recovery-snapshot.js",
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/rebalancer/operation-workflow-owner-segment-5-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-2.js",
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "test/control-plane/priority-recovery-snapshot-core-02-test-cases.js",
    "test/control-plane/priority-recovery-snapshot.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js"
  ],
  "predecessor": "work/packages/todo-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-sql-transaction-participants-dispatch-pending-reentry.md",
  "closed": "2026-05-08",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/todo-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md"
}
-->

## Why

The previous sprint made steady progress, but it remained reactive. Each
representative rerun moved the blocker through a nearby seam:

1. operation scheduling
2. workflow progress
3. workflow timeout
4. dispatch-pending actuation
5. stale planning visibility
6. startup active-gate support
7. failure-bundle and topology-convergence presentation

The repeated migration pattern indicates that the shared operation workflow
and priority recovery evidence contract is too porous. More local patches are
likely to keep exposing the next misclassified seam.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

This package changes the current strategy from symptom repair to a bounded
contract rewrite. It does not implement Pro or Enterprise behavior.

## In Scope

1. Build a frozen fixture set from the latest representative artifacts before
   changing runtime behavior.
2. Define one normalized priority-recovery operation-workflow evidence
   snapshot.
3. Define one explicit state model and decision table for operation workflow
   progress and timeout outcomes.
4. Define one canonical outcome and reason vocabulary consumed by priority
   recovery, failure bundles, topology convergence, and diagnostics.
5. Adapt existing runtime and presentation surfaces to the new contract behind
   existing entrypoints.
6. Retire duplicate branch piles only after contract-backed tests are green.
7. Rerun `rolling-restart` only after the focused contract cutover is proven.

## Out Of Scope

1. A full runtime rewrite.
2. Rewriting startup active-gate or publication owners first.
3. Harness timeout increases or classification shortcuts.
4. Broad matrix re-entry before the representative contract proof is stable.
5. Opportunistic cleanup outside the priority-recovery operation-workflow
   contract boundary.

## Boundary Contract

Semantic owner:

1. `operation_workflow_owner` owns workflow progress and workflow timeout
   interpretation for operation-backed priority recovery.
2. `priority_recovery_progress` consumes that interpretation and selects the
   dominant witness.
3. Failure bundles, topology convergence, startup active-gate support, and
   diagnostics consume the canonical outcome; they do not reconstruct it.

Canonical evidence snapshot:

1. partition id
2. operation ids and owner locality
3. workflow phase and step
4. operation status
5. actuation state
6. step age and timeout budget
7. dispatch ownership and retry evidence
8. planning and scheduling evidence
9. supporting lower-priority or downstream evidence

Canonical outcome vocabulary:

1. `satisfied`
2. `blocked`
3. `deferred`
4. `retryable`
5. `terminal_failed`
6. `unknown`

Canonical reason families:

1. operation scheduling needed
2. remote owner dispatch pending
3. operation progress wait
4. timeout reconcile due
5. stale planning visibility
6. terminal operation history
7. downstream startup coverage support
8. evidence missing or contradictory

Forbidden reinterpretations:

1. Presentation code must not outrank the owner-selected witness by replaying
   stale evidence.
2. Startup active-gate support must not become the direct owner while an
   operation workflow frontier remains blocked.
3. Supporting partitions must not outrank the selected operation-workflow
   witness unless normalized evidence changes the semantic owner or boundary.
4. Event-driven waiting and timeout reconciliation must not be represented as
   unrelated blocker classes when they are one workflow contract decision.

## Closure Result

This package closes the porous priority-recovery workflow seam rather than the
whole `rolling-restart` scenario:

1. `src/control-plane/priority-recovery-snapshot-stage-10.js` now owns the
   planning-backed `dispatch_pending` normalization through the shared
   priority-recovery snapshot contract.
2. `src/control-plane/priority-recovery-snapshot.js` exports that shared
   normalization so consumers stay on one owner path.
3. `src/rebalancer/operation-workflow-owner-segment-5-stage-5.js` no longer
   owns an independent semantic reclassification table for this seam.
4. Focused tests and touched-file guardrails now prove the shared contract
   path.
5. The representative `rolling-restart --fast-local` rerun moved the first
   frontier to `topology_publication_owner / publication_convergence`, so the
   active blocker is no longer caused by local priority-recovery workflow
   reinterpretation.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent `Curie` (`019e06c2-faf3-72e3-a1ae-68c6f898efc7`) reviewed
      `work/packages/todo-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-sql-transaction-participants-dispatch-pending-reentry.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent `Beauvoir` (`019e06c5-d6be-7fd3-8922-8c63d605801e`) fixed
      `work/packages/todo-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-sql-transaction-participants-dispatch-pending-reentry.md`.
- [x] Implementation subagent recorded:
      Agent `Chandrasekhar` (`019e06ed-e8f7-7471-9b72-b56b0c550bb0`) implemented
      `work/packages/done-20260508-priority-recovery-operation-workflow-contract-rewrite.md`.

## Commit And Push Ledger

- Focused package commit: `293f2c7d`
- Pushed to: `origin/codex/pending-ack-eligibility-filter`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`

## Residual Closure Inventory

- [x] Previous reactive workflow-timeout package is retained as todo residual
      context, not active execution.
- [x] Representative artifact set is frozen into owner-decision fixtures.
- [x] Operation workflow evidence snapshot is defined with named fields and
      owners.
- [x] Progress/timeout decision table is implemented and tested.
- [x] Priority recovery dominant-witness selection consumes the decision table.
- [x] Failure-bundle and topology-convergence presentation consume the
      canonical outcome.
- [x] Startup active-gate support remains downstream unless the operation
      workflow frontier closes.
- [x] Duplicate branch piles are removed or fenced behind the new contract.
- [x] Representative `rolling-restart` rerun records pass or one new named
      owner boundary.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary.
- [x] File-scoped baseline recorded for touched source and focused tests.
- [x] Existing dirty runtime/test edits are classified as package-owned or
      explicitly excluded before implementation continues.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file decision-boundary, literal-owner, runtime-grammar,
      or diff hygiene violation remains.
- [x] Representative rerun proof completed before package closure.

## Validation

1. `node --test test/control-plane/priority-recovery-snapshot.test.js`
   passed after the shared contract helper and the focused stale-progress
   normalization tests landed.
2. `node --test test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
   passed after the local stage-5 rewrite was removed in favor of the shared
   contract helper.
3. `node --test test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`
   passed with the canonical outcome still selected in harness summaries.
4. `node --test test/scripts/analyze-topology-convergence.test.js`
   passed with topology convergence still consuming the canonical witness.
5. `node scripts/check-guideline-literals.js src/control-plane/priority-recovery-snapshot-stage-10.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js src/diagnostics/topology-convergence-graph.js`
   passed with `0` new literal-guideline violations.
6. `node scripts/check-guideline-decision-boundaries.js src/control-plane/priority-recovery-snapshot-stage-10.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js src/diagnostics/topology-convergence-graph.js`
   passed with `0` decision-boundary violations.
7. `npm run audit:runtime-grammar:file -- src/control-plane/priority-recovery-snapshot-stage-10.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js src/diagnostics/topology-convergence-graph.js`
   passed with `0` runtime-grammar violations.
8. `git diff --check -- work/packages/done-20260508-priority-recovery-operation-workflow-contract-rewrite.md work/packages/todo-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-sql-transaction-participants-dispatch-pending-reentry.md work/sprints/current-blocker.json work/sprints/current-blocker.md src/control-plane/priority-recovery-snapshot-stage-10.js src/control-plane/priority-recovery-snapshot.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js test/control-plane/priority-recovery-snapshot-core-02-test-cases.js test/control-plane/priority-recovery-snapshot.test.js`
   passed.
9. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-priority-recovery-workflow-contract-rewrite-20260508T095320Z.report.json --fast-local --verbose`
   failed after `136.2s`, but the direct frontier no longer belongs to
   `operation_workflow_owner / priority_recovery_progress /
   workflow_progress_timeout_contract`.
10. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-recovery-workflow-contract-rewrite-20260508T095320Z.report.json`
    selected root cause class `startup` and dominant reason
    `pending_ack_nodes`.
11. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-recovery-workflow-contract-rewrite-20260508T095320Z.report.json`
    selected `topology_publication_owner / publication_convergence` as the
    first frontier with dominant reason `publication_pending`.
12. `npm run analyze:topology-convergence -- test-output/reports/.playback/rolling-restart-after-priority-recovery-workflow-contract-rewrite-20260508T095320Z/rolling-restart/failure-bundle.json`
    matched the report-level publication frontier and left the old
    priority-recovery workflow boundary downstream only.

## Done When

1. One normalized operation-workflow evidence snapshot feeds the direct owner,
   priority recovery, failure bundles, topology convergence, and diagnostics.
2. One decision table emits canonical progress/timeout outcomes and reasons.
3. The latest reactive blocker is either closed by the contract or represented
   as one fixture-backed canonical outcome.
4. `rolling-restart` either passes the representative gate or migrates to a
   new named owner boundary not caused by operation-workflow/priority-recovery
   reinterpretation.
