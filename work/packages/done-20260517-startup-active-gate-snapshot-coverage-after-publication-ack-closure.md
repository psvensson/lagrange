# Startup Active Gate Snapshot Coverage After Publication ACK Closure

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Focused joined pending reconcile proof is green: flattened joined pending reconcile node ids are preserved when publication ACK is already closed. The representative rerun remains red at active_gate_snapshot_coverage, but it reduced snapshot coverage from 3/5 to 4/5 while publication ACK stayed satisfied with pendingAckCount=0. The active-gate handoff is still pending with owner_reconcile_pending, pendingReconcileCount=3, runtimePromotionAllowed=false, and nextAction=reconcile_owner_membership_publication.",
  "nextAction": "Close this package as reduced and activate work/packages/active-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md for the remaining startup_active_gate_owner / snapshot_coverage handoff: coverage 4/5 with pendingReconcileCount=3 while publication ACK and priority recovery remain frozen.",
  "proof": [
    "node --test test/control-plane/publication-active-gate-handoff-contract.test.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
    "node --check src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/membership-publication-planning.js test/control-plane/publication-active-gate-handoff-contract.test.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
    "node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/membership-publication-planning.js test/control-plane/publication-active-gate-handoff-contract.test.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
    "node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/membership-publication-planning.js test/control-plane/publication-active-gate-handoff-contract.test.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
    "npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/membership-publication-planning.js",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json",
    "git diff --check"
  ],
  "writeScope": [
    "work/packages/active-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md",
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md",
    "work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md",
    "work/packages/active-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/membership-publication-planning.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/distributed/harness/__tests__/active-gate-closure-classification.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json",
    "test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json",
    "work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/membership-publication-planning.js",
    "src/diagnostics/topology-convergence-graph.js"
  ],
  "commitScope": [
    "work/packages/active-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md",
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md",
    "work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md",
    "work/packages/active-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/membership-publication-planning.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/distributed/harness/__tests__/active-gate-closure-classification.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Activate the joined-reconcile residual package for the same startup_active_gate_owner / snapshot_coverage frontier with snapshot coverage 4/5 and pendingReconcileCount=3."
  },
  "causalGovernance": {
    "hypothesis": "Publication ACK remains satisfied, and this package proved one active-gate handoff data-loss edge: joined pending reconcile node id lists are now preserved after ACK closure. The representative blocker remains active-gate snapshot coverage with snapshotCoverageNodeCount=4/5, activeGateState=timed_out, publicationActiveGateHandoffState=pending, owner_reconcile_pending, pendingReconcileCount=3, runtimePromotionAllowed=false, and nextAction=reconcile_owner_membership_publication.",
    "stopConditionCheck": "Use work:evidence-summary, topology convergence handoff probe, replay fixture, npm run analyze:causal-model, distributed-failure, and owner-files before runtime edits; then run required review/fix/implementation subagents before changing promoted runtime files.",
    "expectedCausalModelChange": "Achieved as bounded reduction: snapshotCoverageNodeCount improved from 3/5 to 4/5 while publication ACK stayed satisfied. The same active_gate_snapshot_coverage owner remains selected with pendingReconcileCount=3, so the successor continues locally.",
    "representativeOutcome": "reduced",
    "causalDebt": "Publication ACK and priority recovery are satisfied in the causal graph and remain frozen unless canonical evidence selects them again. Timeout budgets, active-gate admission, selected-source selection, forced repair timeout handling, authoritative query-pressure fallback, and readiness support remain frozen unless selected.",
    "crossBoundaryReview": "Do not absorb publication ACK or priority workflow evidence into this package; this package owns only the selected startup active-gate snapshot coverage handoff."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate joined reconcile rerun",
    "phaseChain": [
      "consume the migrated publication ACK closure proof",
      "use evidence-summary, handoff probe, replay fixture, causal model, distributed failure summary, and owner-files on the new representative artifact",
      "build or reuse the narrowest active-gate owner-reconcile fixture for pendingReconcileCount=3 and runtimePromotionAllowed=false",
      "run review, fix if required, and implementation subagents before runtime edits",
      "edit only the selected active-gate owner path after exact runtime files are promoted",
      "rerun focused active-gate owner tests and one representative rolling-restart run",
      "close as reduced when the representative rerun improves snapshot coverage but remains on the same owner boundary"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json, owned by startup_active_gate_owner / snapshot_coverage with active_gate_timed_out, snapshotCoverageNodeCount=4/5, and pendingReconcileCount=3.",
    "knownDownstreamBlockers": [
      "readiness_startup_support is deferred behind active_gate_snapshot_coverage as inherited active-gate no progress",
      "publication_ack_convergence is satisfied with publicationStatus=PUBLISHED and pendingAckCount=0",
      "priority_recovery_partition_progress is satisfied and must remain frozen unless reselected",
      "selectedSnapshotObservationMode is repair_deferred with state deferred_refresh and nextAction retry",
      "selectedSnapshotObservationReasonCodes include cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight"
    ],
    "missingCausalEdge": "The selected edge is still the active-gate owner-reconcile handoff: pending owner membership publication reconcile remains for three nodes while runtime promotion is not allowed.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json --handoff-probe",
    "boundedProgressProof": "Metric-moving bounded reconcile proof achieved: flattened joined pending reconcile node ids are preserved and the representative rerun improved snapshotCoverageNodeCount from 3 to 4 while publication ACK remained satisfied.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json",
    "expectedObservableTransition": "Successor should satisfy active_gate_snapshot_coverage, reduce pendingReconcileCount, improve snapshot coverage to 5/5, migrate to a canonical successor owner, or turn representative rolling-restart green.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage owner-reconcile slice",
    "sameFrontierFallback": "If focused tests pass but representative evidence remains on the same active_gate_snapshot_coverage frontier with no metric or evidence movement, stop as same-frontier instead of widening into frozen publication, priority, timeout, or readiness edges.",
    "expectedNextFrontier": "active_gate_snapshot_coverage satisfied, reduced to narrower owner-reconcile evidence, representative green, or canonical migration to a successor owner boundary",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "Allowed because fresh representative evidence satisfied publication ACK and selected active_gate_snapshot_coverage as the first frontier with monotonic snapshot coverage improvement from 3/5 to 4/5 while preserving joined pending reconcile ids.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, active-gate admission, selected-source selection, forced repair timeout handling, authoritative query-pressure fallback, and readiness support remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md",
  "successor": "work/packages/active-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md",
  "closed": "2026-05-17",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The publication ACK package satisfied `publication_ack_convergence` in the
fresh representative run. This package then proved the joined pending reconcile
id preservation edge in the active-gate handoff contract.

The representative rerun remains red at `active_gate_snapshot_coverage`, but
it moved the metric: `snapshotCoverageNodeCount` improved from `3/5` to `4/5`
while publication ACK stayed satisfied with `pendingAckCount=0`. The remaining
handoff is still `owner_reconcile_pending` with `pendingReconcileCount=3`.

This package owns only that startup active-gate snapshot coverage handoff.
Publication ACK, priority recovery, timeout budgets, active-gate admission,
selected-source selection, forced repair timeout handling, authoritative
query-pressure fallback, and readiness support stay frozen unless canonical
evidence selects them again.

## Scope Basis

Continuation of the active rolling-restart green-gate closure sprint after
canonical evidence migrated from `topology_publication_owner /
publication_convergence` back to `startup_active_gate_owner /
snapshot_coverage`. This slice closes as reduced and hands the same owner
boundary to the joined-reconcile residual package.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative release gate remains red and
  the first frontier selected by canonical evidence is a runtime owner boundary.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Parfit (019e352b-f116-7f92-a165-fb59ed9284f1) reviewed work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md; result clean.
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [x] Implementation subagent recorded: Agent Aristotle (019e352f-51c4-7be3-97fe-47d0b5f05225) implemented work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md
2. work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md
3. work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md
4. work/packages/active-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md
5. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
6. work/sprints/current-blocker.md
7. work/sprints/current-blocker.json
8. work/model-ledger.jsonl
9. src/control-plane/publication-active-gate-handoff-contract.js
10. src/control-plane/membership-publication-planning.js
11. test/control-plane/publication-active-gate-handoff-contract.test.js
12. test/admin/admin-control-snapshot.test.js
13. test/distributed/harness/__tests__/active-gate-closure-classification.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md`, `work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md`, `work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md`, `work/packages/active-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-active-gate-handoff-contract.js`, `src/control-plane/membership-publication-planning.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`, `test/admin/admin-control-snapshot.test.js`, `test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `node --test test/control-plane/publication-active-gate-handoff-contract.test.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js`, `node --check src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/membership-publication-planning.js test/control-plane/publication-active-gate-handoff-contract.test.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js`, `node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/membership-publication-planning.js test/control-plane/publication-active-gate-handoff-contract.test.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js`, `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/membership-publication-planning.js test/control-plane/publication-active-gate-handoff-contract.test.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js`, `npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/membership-publication-planning.js`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json`, `git diff --check`
- Model ledger advisory: `escalate`

## Validation

1. PASS - `node --test test/control-plane/publication-active-gate-handoff-contract.test.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
2. PASS - `node --check src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/membership-publication-planning.js test/control-plane/publication-active-gate-handoff-contract.test.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
3. PASS - `node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/membership-publication-planning.js test/control-plane/publication-active-gate-handoff-contract.test.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
4. PASS - `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/membership-publication-planning.js test/control-plane/publication-active-gate-handoff-contract.test.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
5. PASS - `npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/membership-publication-planning.js`
6. PASS - `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json`
7. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json --handoff-probe`
8. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json --replay-fixture`
9. PASS - `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json`
10. RED/REDUCED - `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json`
11. PASS - `git diff --check`

Representative result: red but reduced. `publication_ack_convergence` remains
satisfied with `publicationStatus=PUBLISHED` and `pendingAckCount=0`; the first
frontier remains `active_gate_snapshot_coverage` under
`startup_active_gate_owner / snapshot_coverage` with snapshot coverage improved
to `4/5`, `pendingReconcileCount=3`, and next action
`reconcile_owner_membership_publication`.
