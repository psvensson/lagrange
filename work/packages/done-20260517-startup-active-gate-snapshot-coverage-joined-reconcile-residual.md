# Startup Active Gate Snapshot Coverage Joined Reconcile Residual

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Focused handoff selector proof is implemented: explicit drained publicationActiveGateHandoff state now outranks stale flattened pending progress when selecting the active-gate handoff contract. Focused tests and static guardrails pass. The representative rolling-restart rerun in test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json stayed red but migrated the first frontier to publication_ack_convergence under topology_publication_owner / publication_convergence with pending_acks_present; active-gate snapshot coverage is deferred behind publication ACK.",
  "nextAction": "Stop this package at the canonical migrated frontier. Open or continue a successor for topology_publication_owner / publication_convergence if pursuing the representative gate; do not widen this package into publication ACK handling.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "node --test --test-name-pattern \"prefers drained explicit handoff\" test/control-plane/publication-active-gate-handoff-contract.test.js",
    "node --test test/control-plane/publication-active-gate-handoff-contract.test.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
    "node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario rolling-restart",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md",
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md",
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
    "test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
    "test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json",
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md"
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
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md",
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md",
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
    "artifact": "test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "pending_acks_present",
    "nextAction": "Open or continue a successor for topology_publication_owner / publication_convergence. Publication ACK is selected again by canonical representative evidence after this active-gate handoff selector package migrated."
  },
  "causalGovernance": {
    "hypothesis": "The remaining blocker is active-gate snapshot coverage after joined pending reconcile ids are preserved: snapshotCoverageNodeCount=4/5, activeGateState=timed_out, publicationActiveGateHandoffState=pending, owner_reconcile_pending, pendingReconcileCount=3, runtimePromotionAllowed=false, and nextAction=reconcile_owner_membership_publication.",
    "stopConditionCheck": "Use work:evidence-summary, topology convergence handoff probe, replay fixture, npm run analyze:causal-model, distributed-failure, and owner-files before runtime edits; then run required review/fix/implementation subagents before changing promoted runtime files.",
    "expectedCausalModelChange": "Achieved for this package: the focused stale-flattened-progress selector proof is green and representative evidence migrated the first frontier to publication_ack_convergence / topology_publication_owner / publication_convergence.",
    "representativeOutcome": "migrated",
    "causalDebt": "Publication ACK is selected again by canonical evidence in the new representative artifact. Priority recovery, timeout budgets, active-gate admission, selected-source selection, forced repair timeout handling, authoritative query-pressure fallback, and readiness support remain frozen unless canonical evidence selects them again.",
    "crossBoundaryReview": "This package stops at the migrated frontier instead of reopening publication ACK or priority workflow evidence inside the active-gate handoff selector slice."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate joined reconcile rerun",
    "phaseChain": [
      "consume the reduced joined pending reconcile id proof",
      "use evidence-summary, handoff probe, replay fixture, causal model, distributed failure summary, and owner-files on the latest representative artifact",
      "build or reuse the narrowest active-gate owner-reconcile fixture for pendingReconcileCount=3 and runtimePromotionAllowed=false",
      "run review, fix if required, and implementation subagents before runtime edits",
      "edit only the selected active-gate owner path after exact runtime files are promoted",
      "rerun focused active-gate owner tests and one representative rolling-restart run"
    ],
    "currentFirstFrontier": "publication_ack_convergence in test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json, owned by topology_publication_owner / publication_convergence with publicationStatus=OPEN and pending_acks_present.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is selected again by canonical representative evidence with pendingAckCount=1",
      "active_gate_snapshot_coverage is deferred behind publication_ack_convergence with coverage 2/7 and pendingReconcileCount=5",
      "priority_recovery_partition_progress remains frozen unless canonical evidence selects it again",
      "selectedSnapshotObservationMode is repair_deferred with state deferred_refresh and nextAction retry",
      "selectedSnapshotObservationReasonCodes include cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight",
      "readiness_startup_support remains deferred as inherited active-gate no progress"
    ],
    "missingCausalEdge": "The stale flattened pending progress selector edge is fixed; the remaining representative edge is publication ACK pending.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --handoff-probe",
    "boundedProgressProof": "Focused publication active-gate handoff contract proof is green: explicit drain-complete handoff state outranks stale flattened pending progress, and representative rolling-restart migrated to topology_publication_owner / publication_convergence.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
    "expectedObservableTransition": "Successor should target publication_ack_convergence because canonical evidence selected it again.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage joined-reconcile residual slice",
    "sameFrontierFallback": "If focused tests pass but representative evidence remains on the same active_gate_snapshot_coverage frontier with no metric or evidence movement, stop as same-frontier instead of widening into frozen publication, priority, timeout, or readiness edges.",
    "expectedNextFrontier": "topology_publication_owner / publication_convergence",
    "resultClassification": "migrated",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "Allowed because the predecessor made monotonic metric movement on the same owner boundary: snapshot coverage improved from 3/5 to 4/5 while publication ACK remained satisfied.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, active-gate admission, selected-source selection, forced repair timeout handling, authoritative query-pressure fallback, and readiness support remain frozen unless canonical evidence selects them again."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "Focused handoff selector proof closed the stale flattened pending-progress selection edge locally, and the representative rerun selected publication_ack_convergence as the first frontier with pending_acks_present.",
    "evidence": [
      "node --test --test-name-pattern \"prefers drained explicit handoff\" test/control-plane/publication-active-gate-handoff-contract.test.js",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --handoff-probe",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json"
    ]
  },
  "predecessor": "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md",
  "closed": "2026-05-17",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md"
}
-->

## Why

The predecessor proved a bounded reduction at the active-gate handoff: joined
pending reconcile node ids now survive ACK-closed handoff selection, and the
representative rerun improved snapshot coverage from `3/5` to `4/5`.

The focused implementation fixes the selected handoff selector residual:
drained explicit handoff state now outranks stale flattened pending progress
when selecting the active-gate handoff contract.

The representative rerun is still red, but canonical evidence moved the first
frontier to `topology_publication_owner / publication_convergence` with
`pending_acks_present`. This package stops at that migration and does not
absorb publication ACK work.

## Scope Basis

Continuation of the active rolling-restart green-gate closure sprint after a
metric-moving reduction at the same owner boundary.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative release gate remains red and
  the first frontier selected by canonical evidence is a runtime owner boundary.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Dirac (019e354f-8606-7322-9e25-e8d47c7189b2) reviewed work/packages/done-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Ohm (019e3551-b27d-70e0-9b9f-233565a5b6e2) fixed work/packages/done-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md.
- [x] Implementation subagent recorded: Agent Cicero (019e3553-f91f-7630-8f3c-735a03f73139) implemented work/packages/done-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md
2. work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/control-plane/publication-active-gate-handoff-contract.js
7. src/control-plane/membership-publication-planning.js
8. test/control-plane/publication-active-gate-handoff-contract.test.js
9. test/admin/admin-control-snapshot.test.js
10. test/distributed/harness/__tests__/active-gate-closure-classification.test.js

## Out Of Scope

1. Runtime ownership changes.
2. Publication ACK handling.
3. Priority recovery handling.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md`, `work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-active-gate-handoff-contract.js`, `src/control-plane/membership-publication-planning.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`, `test/admin/admin-control-snapshot.test.js`, `test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
- Forbidden files: `src/` paths outside this package's explicitly named owned or candidate runtime files; runtime ownership changes remain frozen.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `node --test --test-name-pattern "prefers drained explicit handoff" test/control-plane/publication-active-gate-handoff-contract.test.js`, `node --test test/control-plane/publication-active-gate-handoff-contract.test.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js`, `node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/membership-publication-planning.js test/control-plane/publication-active-gate-handoff-contract.test.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js`, `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/membership-publication-planning.js test/control-plane/publication-active-gate-handoff-contract.test.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js`, `npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/membership-publication-planning.js`
- Model ledger advisory: `escalate`

## Validation

1. PASS - `npm run work:context`
2. PASS - `npm run work:llm-start`
3. PASS - `npm run work:package:doctor -- --suggest work/packages/done-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md`
4. PASS - `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
5. PASS - `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json`
6. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json --handoff-probe`
7. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json --replay-fixture`
8. PASS - `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json`
9. PASS - `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json`
10. PASS - `node --test --test-name-pattern "prefers drained explicit handoff" test/control-plane/publication-active-gate-handoff-contract.test.js`
11. PASS - `node --test test/control-plane/publication-active-gate-handoff-contract.test.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
12. PASS - `node --check src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/membership-publication-planning.js test/control-plane/publication-active-gate-handoff-contract.test.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
13. PASS - `node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/membership-publication-planning.js test/control-plane/publication-active-gate-handoff-contract.test.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
14. PASS - `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/membership-publication-planning.js test/control-plane/publication-active-gate-handoff-contract.test.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
15. PASS - `npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/membership-publication-planning.js`
16. RED - `node --test test/admin/admin-control-snapshot.test.js` still has the pre-existing bounded snapshot rebuild expectation failure at `test/admin/admin-control-snapshot.test.js:5061`; this would require admin runtime edits outside the selected implementation path.
17. MIGRATED - `node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario rolling-restart` wrote `test-output/report.json`; canonical evidence moved first frontier to `publication_ack_convergence` under `topology_publication_owner / publication_convergence` with `pending_acks_present`.
18. PASS - `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json`
19. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --handoff-probe`
20. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --replay-fixture`
21. PASS - `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json`
22. PASS - `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json`
23. PASS - `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json`
24. PASS - `git diff --check`

## Commit And Push Ledger

1. Focused package commit: `3287008febd4c8681df87fe6bc0fdec577ece852`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
