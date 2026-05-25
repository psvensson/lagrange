# Tell-Tale Scenario Reliability Sprint

Status: active. Created on May 25, 2026.

## Goal

Make the tell-tale distributed scenarios, starting with representative
`rolling-restart`, repeatedly succeed without timeout increases, admission
relaxation, or diagnostics-only green results.

The sprint is not done until `rolling-restart` has a clean representative pass
and the same proof ladder is promoted to the tell-tale scenario set.

## Sprint Strategy Brief

- Goal state: `rolling-restart` is representative-green with
  `active=5/5`, `snapshotCoverage=5/5`, `missingPublished=0`, final
  adjudication completes, and the tell-tale suite has repeatable route
  evidence.
- Current causal thesis: operation-workflow residuals are cleared, but the
  first frontier migrated back to
  `startup_active_gate_owner / snapshot_coverage / active_gate_timed_out`.
  The latest artifact reports `snapshotCoverageNodeCount=1/5`,
  `owner_reconcile_pending`, `selected_snapshot_source_timeout`,
  `snapshot_repair_deferred`, `wait_owner_recovery`, and one selected owner
  queue pending write. Prior local reducers already covered these shapes, so
  another same-frontier runtime patch is forbidden until a higher-level
  active-gate snapshot coverage contract is selected.
- Competing hypotheses: H1 the missing contract is owner-reconcile wake debt;
  H2 the selected snapshot source must refresh before repair can advance; H3
  snapshot repair execution is runnable but deferred behind an owner/projection
  ambiguity; H4 the coverage projection contract cannot prove the active cohort
  even when owner evidence is present; H5 final adjudication is an independent
  harness bug that must be fixed before clean pass/fail interpretation.
- Confidence and evidence: high that priority-recovery operation-workflow
  residual witnesses are zero in the fresh rerun; high that the visible first
  frontier is active-gate snapshot coverage; high that the scenario process
  still has an independent `runFinalAdjudication is not defined` exit defect;
  medium on which active-gate mechanism is the actual missing edge.
- Expected green path: first select the active-gate snapshot coverage contract,
  then implement exactly that contract, then repair final adjudication if still
  blocking clean pass/fail, then run the representative green gate, then promote
  the proof ladder to the tell-tale suite.
- Wrong direction signals: editing startup readiness, publication, operation
  workflow, timeout budgets, or admission rules before the active-gate contract
  package selects a concrete edge; opening another
  `startup_active_gate_owner / snapshot_coverage` runtime patch from the
  unchanged artifact; declaring green from a routed failure where final
  adjudication did not complete.
- Next best package:
  `work/packages/done-20260525-tell-tale-active-gate-snapshot-coverage-runtime-successor.md`.
- Stop or escalate rule: if the active-gate contract package cannot name one
  executable wake, timeout, repair, or projection contract, close as
  architecture-stop and require fresh representative evidence or a higher-level
  architecture decision before runtime promotion.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json
Visible first frontier: distributed_harness_verdict_owner/timeout_core_state_adjudication
Active package: work/packages/done-20260525-rolling-restart-final-adjudication-harness-fix.md
Active package owner: distributed_harness_verdict_owner
Active package boundary: timeout_core_state_adjudication
Selected cause: run_final_adjudication_not_defined
Required action: Repair the harness final-adjudication binding/import path without changing runtime topology behavior, then prove the final adjudication tests and a fresh scenario report can complete adjudication.
Representative status: architecture-gap
Causal outcome: pending-before-rerun
Architecture gate: not-required / unknown
Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
Current state: Queued because the fresh rolling-restart report produced useful route evidence but the scenario process exited failed when final adjudication raised runFinalAdjudication is not defined.
Allowed edits: work/packages/done-20260525-rolling-restart-final-adjudication-harness-fix.md, test/distributed/harness/cluster-segment-7.js, work/tracks/topology-convergence.md, src/logging/logs-table-service-constants.js, test/logging/logs-table-service.test.js
Candidate runtime files: test/distributed/harness/assertions-segment-2.js, test/distributed/harness/cluster-segment-7.js, test/distributed/harness/cluster-segment-7-alpha-load-readiness.js, test/distributed/harness/__tests__/consistency-evaluator.test.js
Forbidden edits: Startup readiness is green, final adjudication is the last remaining gate.
Required latest proof: falsifier: contract transition fixture npm test -- test/distributed/harness/__tests__/consistency-evaluator.test.js, regression: representative routing evidence npm run work:scenario-route -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json # test/distributed/run.js, supporting: affected consumer proof npm test -- test/distributed/harness/__tests__/cluster.test-part-6.js
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Package Queue

1. [Tell-Tale Active Gate Snapshot Coverage Contract](../packages/done-20260525-tell-tale-active-gate-snapshot-coverage-contract.md)
   - Lane: `experiment`
   - Purpose: select the authoritative active-gate snapshot coverage contract
     before any new runtime patch.
   - First-run reason: fresh rolling-restart moved past operation-workflow
     residuals but returned to the repeated active-gate snapshot coverage
     architecture gap.

2. [Tell-Tale Active Gate Snapshot Coverage Runtime Successor](../packages/done-20260525-tell-tale-active-gate-snapshot-coverage-runtime-successor.md)
   - Lane: `causal-escalation`
   - Purpose: implement only the concrete wake, timeout, repair, or projection
     contract selected by the active package.
   - First-run reason: runtime work is required for green only after the
     contract package names an executable owner edge and write scope.

3. [Rolling Restart Final Adjudication Harness Fix](../packages/done-20260525-rolling-restart-final-adjudication-harness-fix.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: repair the `runFinalAdjudication is not defined` harness defect
     so representative failures and passes can complete clean adjudication.
   - First-run reason: the latest rolling-restart report routed useful
     evidence but the scenario process exited through final adjudication.

4. [Rolling Restart Representative Green Gate](../packages/todo-20260525-rolling-restart-representative-green-gate.md)
   - Lane: `scenario-release-gate`
   - Purpose: run fresh rolling-restart evidence and close as
     representative-green, reduced, migrated, or same-frontier with one
     successor.
   - First-run reason: tell-tale stabilization must be proven by fresh
     representative evidence after the current first frontier is handled.

5. [Tell-Tale Scenario Suite Promotion Gate](../packages/todo-20260525-tell-tale-scenario-suite-promotion-gate.md)
   - Lane: `scenario-release-gate`
   - Purpose: promote the rolling-restart proof ladder to the tell-tale
     scenarios and require repeatable route evidence.
   - First-run reason: a stabilization sprint should end with repeated
     scenario proof, not one lucky green run.

## Tell-Tale Suite

Initial suite:

1. `rolling-restart`
2. `node-join-under-load`
3. `admin-query-smoke`

Add scenarios only when they are already used as representative stability
signals or when a package explicitly promotes them through canonical route
evidence.

## Definition Of Done

1. `rolling-restart` exits successfully with final adjudication complete.
2. Canonical route evidence reports no unresolved first frontier for
   `rolling-restart`.
3. Active-gate snapshot coverage is complete or emits a deliberately accepted
   bounded owner contract.
4. The tell-tale suite has a repeatable command sequence and recorded pass
   evidence.
5. Any remaining failure opens one bounded package with a single owner,
   boundary, dominant reason, and proof ladder.
