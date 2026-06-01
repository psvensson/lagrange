# Topology Publication ACK Pending After Active Gate Drain Migration

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "pending_acks_present",
  "currentState": "Focused failure-bundle projection now trusts the open publishing recovery-gate normalization for stale count-only ACK evidence. Focused regression, adjacent publication owner/recovery tests, static guardrails, and package validation pass. The representative rolling-restart rerun in test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json is still red, but publication_ack_convergence is satisfied with publicationStatus=PUBLISHED, pendingAckCount=0, pendingAckNodeIds=[], and priority recovery residual extraction reports zero witnesses. Canonical evidence migrated the first frontier to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with active_gate_timed_out, snapshotCoverageNodeCount=6/7, owner_reconcile_pending, snapshot_repair_deferred, and publicationActiveGateHandoffPendingReconcileCount=5.",
  "nextAction": "Close this package as migrated and activate a focused startup_active_gate_owner / snapshot_coverage successor using test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json. Do not continue active-gate owner-reconcile work inside this publication ACK package.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
    "node --test --test-name-pattern \"trusts open publishing gate normalization\" test/distributed/harness/__tests__/failure-bundle.test.js",
    "node --test test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js",
    "node --check test/distributed/harness/failure-bundle-segment-4.js",
    "node --check test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js",
    "node scripts/check-guideline-literals.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js",
    "node scripts/check-guideline-decision-boundaries.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js",
    "node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario rolling-restart",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "test/distributed/harness/failure-bundle-segment-4.js",
    "test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js"
  ],
  "commitScope": [
    "work/packages/done-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "test/distributed/harness/failure-bundle-segment-4.js",
    "test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js"
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
    "artifact": "test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Activate a focused startup_active_gate_owner / snapshot_coverage successor for owner_reconcile_pending with snapshotCoverageNodeCount=6/7 and publicationActiveGateHandoffPendingReconcileCount=5."
  },
  "causalGovernance": {
    "hypothesis": "The selected publication ACK/open blocker was stale count-only failure-bundle projection: explicit empty pending ACK node ids plus publishing owner-stream recovery-gate state must not be promoted to pending_acks_present.",
    "stopConditionCheck": "Use work:evidence-summary, topology convergence handoff probe, replay fixture, npm run analyze:causal-model, priority recovery residuals, distributed-failure, and owner-files before runtime edits; then run required review/fix/implementation subagents before changing promoted runtime files.",
    "expectedCausalModelChange": "Achieved for this package: publication_ack_convergence is satisfied, priority recovery residuals are zero, and the representative first frontier migrated to startup_active_gate_owner / snapshot_coverage.",
    "representativeOutcome": "migrated",
    "causalDebt": "Active-gate snapshot coverage is selected again by canonical evidence with owner_reconcile_pending and snapshotCoverageNodeCount=6/7. Timeout budgets, active-gate admission, selected-source selection, forced repair timeout handling, authoritative query-pressure fallback, and readiness support remain frozen unless selected by the successor evidence.",
    "crossBoundaryReview": "This package stops at the migrated frontier instead of reopening startup_active_gate_owner / snapshot_coverage inside the publication ACK slice."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate drained handoff rerun",
    "phaseChain": [
      "consume the migrated active-gate handoff selector proof",
      "use evidence-summary, handoff probe, replay fixture, causal model, priority residual extraction, distributed failure summary, and owner-files on the drained-handoff artifact",
      "classify the publication ACK/open edge before runtime edits",
      "run review, fix if required, and implementation subagents before runtime edits",
      "edit only the selected owner path after exact runtime files are promoted",
      "rerun focused owner tests and one representative rolling-restart run"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json, owned by startup_active_gate_owner / snapshot_coverage with active_gate_timed_out, owner_reconcile_pending, snapshotCoverageNodeCount=6/7, and publicationActiveGateHandoffPendingReconcileCount=5.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied with publicationStatus=PUBLISHED and pendingAckCount=0",
      "priority_recovery_partition_progress is satisfied and priority residual extraction reports zero witnesses",
      "active_gate_snapshot_coverage is blocked with snapshotCoverageNodeCount=6/7 and pendingReconcileCount=5",
      "selectedSnapshotObservationMode is repair_deferred with state deferred_refresh and nextAction retry",
      "selectedSnapshotObservationReasonCodes include cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight",
      "readiness_startup_support remains deferred as inherited active-gate no progress"
    ],
    "missingCausalEdge": "Publication ACK/open count-only projection is closed for this package. The remaining missing edge is active-gate owner reconciliation for five pending publication handoff nodes.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json --handoff-probe plus npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json",
    "boundedProgressProof": "Focused harness proof drained the stale count-only ACK projection locally, and representative evidence now satisfies publication ACK with zero priority residual witnesses before selecting owner reconcile pending as the next active-gate mechanism.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json",
    "expectedObservableTransition": "Successor should reduce pending owner reconciliation, improve snapshot coverage, drain active-gate handoff, migrate to a new owner boundary, or turn rolling-restart green.",
    "maxProgressBound": "one focused topology_publication_owner / publication_convergence successor slice",
    "sameFrontierFallback": "If focused tests pass but representative evidence remains on publication_ack_convergence with pendingAckCount=1 and no publication owner or priority witness movement, stop as same-frontier instead of widening into active-gate, timeout, or readiness edges.",
    "expectedNextFrontier": "publication_ack_convergence satisfied, operation_workflow_owner / workflow_progress promoted, representative green, or canonical migration to a successor owner boundary",
    "resultClassification": "migrated",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "Allowed because the immediate predecessor produced a focused active-gate selector proof and fresh representative evidence selected a different first frontier.",
    "handoffInvariant": "Active-gate snapshot coverage, timeout budgets, active-gate admission, selected-source selection, forced repair timeout handling, authoritative query-pressure fallback, and readiness support remain frozen unless canonical evidence selects them again."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "Focused publication ACK count-only harness proof closed the selected ACK-lag projection locally, and the representative rerun selected active_gate_snapshot_coverage as the first frontier with active_gate_timed_out and owner_reconcile_pending.",
    "evidence": [
      "node --test --test-name-pattern \"trusts open publishing gate normalization\" test/distributed/harness/__tests__/failure-bundle.test.js",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json --handoff-probe",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json"
    ]
  },
  "predecessor": "work/packages/done-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md",
  "closed": "2026-05-17",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260517-startup-active-gate-snapshot-coverage-owner-reconcile-after-ack-drain.md"
}
-->

## Why

The drained active-gate handoff run moved the representative first frontier
back to `publication_ack_convergence`. Publication is still `OPEN` with
`pendingAckCount=1`, no concrete pending ACK node ids, and priority spread
pending.

This package owns that publication ACK/open classification. The single
`operation_workflow_owner / workflow_progress` witness is recorded as
subordinate evidence and may be promoted only if canonical extractors select it.

## Scope Basis

Continuation of the rolling-restart green-gate closure sprint after the
active-gate handoff selector package closed as migrated.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative release gate remains red and
  the first frontier selected by canonical evidence is a runtime owner boundary.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Codex (019e3571-f9bb-7932-a111-9df604a60821) reviewed work/packages/done-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md; result clean.
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [x] Implementation subagent recorded: Agent Codex (019e357a-4503-7dc1-86c8-066e880f0144) implemented work/packages/done-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/control-plane/publication-owner-evidence.js
7. src/control-plane/publication-owner-decision.js
8. src/control-plane/publication-recovery-gate.js
9. src/control-plane/publication-recovery-evidence.js
10. test/distributed/harness/failure-bundle-segment-4.js
11. test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js
12. test/control-plane/publication-owner-stream.test.js
13. test/control-plane/publication-recovery-gate.test.js
14. test/control-plane/publication-recovery-evidence.test.js

## Out Of Scope

1. timeout_budgets
2. active_gate_admission
3. selected_snapshot_source_selection
4. forced_repair_timeout_handling
5. authoritative_query_pressure_fallback
6. readiness_support

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-owner-evidence.js`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/publication-recovery-gate.js`, `src/control-plane/publication-recovery-evidence.js`, `test/distributed/harness/failure-bundle-segment-4.js`, `test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`, `test/control-plane/publication-owner-stream.test.js`, `test/control-plane/publication-recovery-gate.test.js`, `test/control-plane/publication-recovery-evidence.test.js`
- Forbidden files: `timeout_budgets`, `active_gate_admission`, `selected_snapshot_source_selection`, `forced_repair_timeout_handling`, `authoritative_query_pressure_fallback`, `readiness_support`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --handoff-probe
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --replay-fixture
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json
6. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json
7. PASS - `npm run work:validate -- --pre-impl work/packages/done-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md`
8. PASS - `node --test --test-name-pattern "trusts open publishing gate normalization" test/distributed/harness/__tests__/failure-bundle.test.js`
9. PASS - `node --check test/distributed/harness/failure-bundle-segment-4.js`
10. PASS - `node --check test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`
11. PASS - `node scripts/check-guideline-literals.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`
12. PASS - `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`
13. PASS - `node --test test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js`
14. RED/MIGRATED - `node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario rolling-restart` wrote `test-output/report.json`; copied to `test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json`.
15. PASS/MIGRATED - `npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json` reports `publication_ack_convergence` satisfied and first frontier `active_gate_snapshot_coverage`.
16. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json --handoff-probe`
17. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json --replay-fixture`
18. PASS - `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json`
19. PASS - `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json`
20. PASS - `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json`
21. PASS - `git diff --check`

## Durable Implementation Instructions

These instructions are part of the package handoff and should survive this
session. Keep them with the package evidence until the package closes as green,
migrated, reduced, same-frontier, or accepted backpressure.

### Working Rule

Do not treat the representative red run as a broad implementation request. The
only selected edge is `topology_publication_owner / publication_convergence`.
Classify that edge first, then edit only the selected publication owner path.
Keep `operation_workflow_owner / workflow_progress` subordinate unless
`work:evidence-summary`, `analyze:causal-model`, `analyze:topology-convergence`,
or `analyze:priority-recovery-residuals` explicitly promotes it.

Do not reopen these frozen decisions inside this package:

1. `timeout_budgets`
2. `active_gate_admission`
3. `selected_snapshot_source_selection`
4. `forced_repair_timeout_handling`
5. `authoritative_query_pressure_fallback`
6. `readiness_support`
7. `active_gate_snapshot_coverage`, unless canonical evidence selects it again

### Central Logic Target

Publication convergence should be represented as one normalized state model, not
as scattered checks over `publicationStatus`, `pendingAckCount`,
`pendingAckNodeIds`, `prioritySpreadPending`, stream state, freshness state, and
recovery state.

Implement or preserve this shape:

1. Collect raw publication evidence at the boundary.
2. Normalize it into one snapshot with named fields.
3. Evaluate that snapshot through one explicit state table or state model.
4. Emit one canonical owner outcome, dominant reason, and reason list.

The intended classification rules are:

1. Concrete pending ACK node ids are authoritative ACK lag evidence.
2. A raw `pendingAckCount > 0` with empty `pendingAckNodeIds` is count-only
   evidence. It must not by itself emit `pending_acks_present`.
3. `publicationStatus=OPEN` with owner stream/freshness/recovery state still in
   a publishing or waiting-for-publication phase should remain a publication
   pending/backpressure outcome, not be rewritten as ACK lag from count-only
   evidence.
4. `prioritySpreadPending=true` may explain why publication remains open, but it
   does not promote `operation_workflow_owner / workflow_progress` unless the
   canonical extractors promote that owner boundary.
5. If publication ACK becomes satisfied, let the representative rerun choose the
   next frontier. Do not preemptively patch active-gate coverage.

### Code Quality Constraints

Follow the critical generation contract:

1. No inline domain/runtime strings, numbers, `null`, or `undefined` in runtime
   logic. Use canonical constants or file-private top-level named constants.
2. Do not encode runtime state with `null` or `undefined`.
3. Do not add a pile of independent `if` branches around publication readiness,
   ACK lag, stream state, or recovery state. If multiple signals determine the
   outcome, collect evidence once and select through the normalized decision
   model.
4. Keep helpers owner-local unless the package evidence proves a shared runtime
   owner is needed.

### Required Focused Proof

Before a representative rerun, the focused proof should include the exact
current shape from the drained handoff report:

1. `publicationStatus=OPEN`
2. `pendingAckCount=1`
3. `pendingAckNodeIds=[]`
4. `prioritySpreadPending=true`
5. `publicationOwnerAckState=unavailable`
6. `publicationOwnerFreshnessFence=publishing`
7. `publicationOwnerRecoveryOutcome=waiting_for_publication`
8. `publicationOwnerStreamOutcome=publishing`

The focused assertion should prove that the raw count-only ACK signal does not
become the dominant `pending_acks_present` reason when the normalized owner gate
is still publishing/waiting. If the focused test already passes, do not keep
adding equivalent fixtures; move to the missing runtime or failure-bundle edge
that explains why the representative artifact still reports the old frontier.

### Validation And Stop Conditions

Run the package proof ladder after focused tests:

1. `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --handoff-probe`
3. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json`
4. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json`
5. The focused node tests for changed owner and failure-bundle files.
6. One representative `rolling-restart` rerun.

After the representative rerun, stop in exactly one of these states:

1. `green`: rolling-restart passes.
2. `migrated`: canonical evidence promotes a new first frontier, including
   `operation_workflow_owner / workflow_progress` if it becomes selected.
3. `reduced`: publication convergence remains first frontier but has a clear
   bounded improvement recorded in the package.
4. `same-frontier`: focused proof passes but representative evidence remains on
   the same `publication_ack_convergence` shape with no owner movement.
5. `accepted-backpressure`: canonical causal evidence classifies this as
   expected publication/priority backpressure rather than an implementation bug.

Do not continue by widening the package after a stop condition. Record the
result, update the sprint/current-blocker handoff, run closure validation, then
make a focused commit and push containing only package-owned files, generated
sprint handoff files, and ledger updates.

## Commit And Push Ledger

1. Focused package commit: `589e6e6f88e956f899c6754d0f98a5fa99be829d`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
