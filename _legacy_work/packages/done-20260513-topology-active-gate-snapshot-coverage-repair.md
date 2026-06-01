# Topology Active Gate Snapshot Coverage Repair

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-13",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6/rolling-restart/",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "snapshot_coverage_incomplete",
  "currentState": "Focused snapshot-coverage proof widened the selected active-gate snapshot from 1/5 to 3/5 and completed the setup active stage. The latest representative no longer reports startup_active_gate_owner / snapshot_coverage as first frontier; canonical evidence now reports publication_ack_convergence with priority-recovery residual extraction naming operation_workflow_owner / workflow_progress.",
  "nextAction": "Close this package as migrated and continue in the operation_workflow_owner / workflow_progress successor named by priority recovery residual evidence.",
  "proof": [
    "npx tap --disable-coverage --reporter=terse test/control-plane/membership-publication-coordinator-main-stage-3.js -g \"active-gate best progress\"",
    "npx tap --disable-coverage --reporter=terse test/admin/admin-control-snapshot.test.js -g \"connected active heartbeat|recovery-eligible readiness|publication owner-truth\"",
    "npx tap --disable-coverage --reporter=terse test/distributed/harness/__tests__/cluster.test-part-5.js -g \"stringified publication diagnostics\"",
    "node scripts/check-guideline-literals.js src/control-plane/active-node-projection.js test/admin/admin-control-snapshot.test.js",
    "node scripts/check-guideline-decision-boundaries.js src/control-plane/active-node-projection.js test/admin/admin-control-snapshot.test.js",
    "npm run audit:runtime-grammar:file -- src/control-plane/active-node-projection.js src/admin/admin-control-snapshot-class-part-3.js src/control-plane/membership-publication-planning.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260513-topology-active-gate-snapshot-coverage-repair.md",
    "work/packages/done-20260513-topology-active-gate-owner-truth.md",
    "work/packages/done-20260513-topology-readiness-stalled-support.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/control-plane/active-node-projection.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-planning.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/admin/admin-control-snapshot-response-contract.test.js",
    "test/control-plane/membership-publication-coordinator-tail-final-test-cases.js",
    "test/control-plane/membership-publication-coordinator-tail-more-test-cases.js",
    "test/control-plane/membership-publication-coordinator-main-stage-1.js",
    "test/control-plane/membership-publication-coordinator-main-stage-3.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-active-gate-owner-truth.md",
    "work/packages/done-20260513-topology-readiness-stalled-support.md",
    "test-output/reports/rolling-restart-green-gate-after-readiness-stalled-support.report.json",
    "test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/control-plane/active-node-projection.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-planning.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js"
  ],
  "commitScope": [
    "work/packages/done-20260513-topology-active-gate-snapshot-coverage-repair.md",
    "work/packages/done-20260513-topology-active-gate-owner-truth.md",
    "work/packages/done-20260513-topology-readiness-stalled-support.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/control-plane/active-node-projection.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-planning.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/admin/admin-control-snapshot-response-contract.test.js",
    "test/control-plane/membership-publication-coordinator-tail-final-test-cases.js",
    "test/control-plane/membership-publication-coordinator-tail-more-test-cases.js",
    "test/control-plane/membership-publication-coordinator-main-stage-1.js",
    "test/control-plane/membership-publication-coordinator-main-stage-3.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If active-gate snapshot coverage owns the current frontier, selected control snapshots must include owner truth for durable published, locally projected, and recently admitted active nodes instead of collapsing coverage to one durable publication row.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json",
    "expectedCausalModelChange": "active_gate_snapshot_coverage either converges, reduces to a bounded startup_active_gate_owner sub-boundary, or migrates to a fresh publication/membership owner boundary with canonical evidence instead of remaining snapshotCoverage=1/5 from presentation publication only.",
    "representativeOutcome": "migrated",
    "causalDebt": "The latest representative remains red, but this package moved the first frontier off startup_active_gate_owner / snapshot_coverage. Snapshot coverage widened from 1/5 to 3/5 and the setup active stage completed; canonical evidence now fronts publication_ack_convergence with missing active publication coverage and priority recovery workflow progress.",
    "crossBoundaryReview": "Review subagent Curie (019e2348-bb34-72a2-80cd-febb1473fb0c) found predecessor metadata fixes. Fix subagent Averroes (019e234a-71d7-7780-b605-8d3d4682fc7e) repaired the predecessor commit ledger and current-blocker handoff before implementation. Implementation subagent Carson (019e2351-fd7a-7301-8688-94d7dd9e5a19) implemented this package. Explorers Euclid (019e237c-ee2a-73f3-9b33-b62ec4fe71b8) and Locke (019e2393-e7e9-7661-a0ab-e3694c1ffb4c) confirmed the smallest follow-up owner boundary from the latest residual evidence."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart representative report after readiness support reduction",
    "phaseChain": [
      "startup active-gate snapshot coverage",
      "membership publication projection/convergence",
      "startup readiness support evidence"
    ],
    "currentFirstFrontier": "publication_ack_convergence under topology_publication_owner / publication_convergence after focused snapshot-coverage proof; priority recovery is the residual/next expected owner-boundary, not the first frontier.",
    "knownDownstreamBlockers": [
      "publication convergence is blocked by missing active nodes while priority spread is pending",
      "priority recovery residuals name operation_workflow_owner / workflow_progress for sql_transactions-p1 and sql_write_operations-p1",
      "membership epoch, durable failure repair intents, post-rejoin reconciliation, partition descriptor epoch, placement capacity, anti-entropy, bounded budgets, and failure gates remain queued behind the current representative frontier"
    ],
    "missingCausalEdge": "Active-gate selected snapshot coverage must derive coverage from canonical owner truth that includes durable publication plus projected/locally eligible or recently admitted members, or name the exact publication/membership owner blocker that prevents that truth from widening.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Focused admin, membership-publication reconcile, projection, and harness tests pass; representative rolling-restart widened active-gate snapshot coverage from 1/5 to 3/5 and moved the first frontier to publication_ack_convergence.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json",
    "expectedObservableTransition": "Observed: selected snapshot coverage includes more owner-truth nodes, setup active completed, and canonical evidence migrated to topology_publication_owner / publication_convergence.",
    "maxProgressBound": "one review subagent, one fix subagent because review found fixes, one implementation subagent, focused owner proof, and representative rerun",
    "sameFrontierFallback": "not used; active_gate_snapshot_coverage no longer owns the first representative frontier.",
    "expectedNextFrontier": "topology_publication_owner / publication_convergence remains the first frontier; operation_workflow_owner / workflow_progress is the legitimate successor because the publication evidence delegates the blocked missing-active-node progress to priority recovery residual witnesses in sql_transactions-p1 and sql_write_operations-p1.",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "workflow_progress",
    "reason": "Focused snapshot-coverage repair widened active-gate snapshot coverage from 1/5 to 3/5; the latest representative first frontier moved to topology_publication_owner / publication_convergence, and canonical priority-recovery residual extraction names operation_workflow_owner / workflow_progress as the residual implementation owner that publication convergence is waiting on.",
    "evidence": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --explain active_gate_snapshot_coverage",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --markdown"
    ]
  },
  "predecessor": "work/packages/done-20260513-topology-readiness-stalled-support.md",
  "closed": "2026-05-13",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md"
}
-->

## Why

Readiness support has been reduced to inherited active-gate no-progress. The
remaining representative frontier is active-gate snapshot coverage: the selected
snapshot is admin-ready but only exposes one observed/published node while the
harness expects five. This package owns the active-gate coverage repair or the
fresh owner-boundary migration if coverage is blocked by publication or
membership truth.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees. This package belongs to
`work/sprints/active-2026-q2-topology-convergence-ship-shape.md`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `Agent Curie (019e2348-bb34-72a2-80cd-febb1473fb0c) reviewed
      work/packages/done-20260513-topology-readiness-stalled-support.md;
      result fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      `Agent Averroes (019e234a-71d7-7780-b605-8d3d4682fc7e) fixed
      work/packages/done-20260513-topology-readiness-stalled-support.md`.
- [x] Implementation subagent recorded:
      `Agent Carson (019e2351-fd7a-7301-8688-94d7dd9e5a19) implemented
      work/packages/done-20260513-topology-active-gate-snapshot-coverage-repair.md`.

## In Scope

1. work/packages/done-20260513-topology-active-gate-snapshot-coverage-repair.md
2. work/packages/done-20260513-topology-active-gate-owner-truth.md
3. work/packages/done-20260513-topology-readiness-stalled-support.md
4. work/sprints/active-2026-q2-topology-convergence-ship-shape.md
5. work/sprints/current-blocker.json
6. work/sprints/current-blocker.md
7. src/admin/admin-control-snapshot-class-part-1.js
8. src/admin/admin-control-snapshot-class-part-3.js
9. src/admin/admin-control-snapshot-class-part-5.js
10. src/control-plane/active-node-projection.js
11. src/control-plane/membership-publication-coordinator-class-stage-2.js
12. src/control-plane/membership-publication-planning.js
13. test/admin/admin-control-snapshot.test.js
14. test/admin/admin-control-snapshot-response-contract.test.js
15. test/control-plane/membership-publication-coordinator-tail-final-test-cases.js
16. test/control-plane/membership-publication-coordinator-tail-more-test-cases.js
17. test/control-plane/membership-publication-coordinator-main-stage-1.js
18. test/control-plane/membership-publication-coordinator-main-stage-3.js
19. test/distributed/harness/cluster-segment-7-class-4.js
20. test/distributed/harness/cluster-segment-7-class-5.js
21. test/distributed/harness/__tests__/cluster.test-part-5.js

## Out Of Scope

1. harness timeout increases
2. priority-recovery runtime changes without fresh first-frontier evidence
3. publication-convergence implementation without fresh first-frontier evidence
4. Pro behavior
5. Enterprise behavior

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/done-20260513-topology-active-gate-snapshot-coverage-repair.md`, `work/packages/done-20260513-topology-active-gate-owner-truth.md`, `work/packages/done-20260513-topology-readiness-stalled-support.md`, `work/sprints/active-2026-q2-topology-convergence-ship-shape.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, `src/admin/admin-control-snapshot-class-part-1.js`, `src/admin/admin-control-snapshot-class-part-3.js`, `src/admin/admin-control-snapshot-class-part-5.js`, `src/control-plane/active-node-projection.js`, `src/control-plane/membership-publication-coordinator-class-stage-2.js`, `src/control-plane/membership-publication-planning.js`, `test/admin/admin-control-snapshot.test.js`, `test/admin/admin-control-snapshot-response-contract.test.js`, `test/control-plane/membership-publication-coordinator-tail-final-test-cases.js`, `test/control-plane/membership-publication-coordinator-tail-more-test-cases.js`, `test/control-plane/membership-publication-coordinator-main-stage-1.js`, `test/control-plane/membership-publication-coordinator-main-stage-3.js`, `test/distributed/harness/cluster-segment-7-class-4.js`, `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/__tests__/cluster.test-part-5.js`
- Forbidden files: `harness timeout increases`, `priority-recovery runtime changes without fresh first-frontier evidence`, `publication-convergence implementation without fresh first-frontier evidence`, `Pro behavior`, `Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npx tap --disable-coverage --reporter=terse test/control-plane/membership-publication-coordinator-main-stage-3.js -g "active-gate best progress"`, `npx tap --disable-coverage --reporter=terse test/admin/admin-control-snapshot.test.js -g "connected active heartbeat|recovery-eligible readiness|publication owner-truth"`, `npx tap --disable-coverage --reporter=terse test/distributed/harness/__tests__/cluster.test-part-5.js -g "stringified publication diagnostics"`, `node scripts/check-guideline-literals.js src/control-plane/active-node-projection.js test/admin/admin-control-snapshot.test.js`, `node scripts/check-guideline-decision-boundaries.js src/control-plane/active-node-projection.js test/admin/admin-control-snapshot.test.js`, `npm run audit:runtime-grammar:file -- src/control-plane/active-node-projection.js src/admin/admin-control-snapshot-class-part-3.js src/control-plane/membership-publication-planning.js`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --fast-local --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --explain active_gate_snapshot_coverage`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npx tap --disable-coverage --reporter=terse test/control-plane/membership-publication-coordinator-main-stage-3.js -g "active-gate best progress"
2. npx tap --disable-coverage --reporter=terse test/admin/admin-control-snapshot.test.js -g "connected active heartbeat|recovery-eligible readiness|publication owner-truth"
3. npx tap --disable-coverage --reporter=terse test/distributed/harness/__tests__/cluster.test-part-5.js -g "stringified publication diagnostics"
4. node scripts/check-guideline-literals.js src/control-plane/active-node-projection.js test/admin/admin-control-snapshot.test.js
5. node scripts/check-guideline-decision-boundaries.js src/control-plane/active-node-projection.js test/admin/admin-control-snapshot.test.js
6. npm run audit:runtime-grammar:file -- src/control-plane/active-node-projection.js src/admin/admin-control-snapshot-class-part-3.js src/control-plane/membership-publication-planning.js
7. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --fast-local --verbose
8. npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json
9. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --explain active_gate_snapshot_coverage
10. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json
11. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --markdown

## Implementation Result

- Implemented selected-snapshot owner-truth widening in
  `src/admin/admin-control-snapshot-class-part-3.js` without changing durable
  `publishedNodes`: diagnostic `nodes`, `projectedNodes`, and suspected active
  cohorts can include recovery-eligible readiness and fresh connected heartbeat
  evidence while publication-scoped consumers still see durable publication
  membership only.
- Extended `src/control-plane/active-node-projection.js` so active,
  connected, fresh-heartbeat rows can be projected for control-plane recovery
  diagnostics when readiness rows are absent, and so readiness-only recovery
  projections are not discarded solely for missing canonical service or
  websocket endpoint rows.
- Updated `src/control-plane/membership-publication-planning.js` and
  `src/control-plane/membership-publication-coordinator-class-stage-2.js` so
  stale lifecycle metadata is replaced when projection advances, while durable
  publication targets stay on the published baseline until widened nodes have
  node-row evidence.
- Hardened harness snapshot summarization in
  `test/distributed/harness/cluster-segment-7-class-4.js` so stringified
  publication diagnostics from persisted snapshot rows are parsed before
  active-gate coverage is evaluated.
- Added focused tests across admin snapshot projection, membership
  publication best-progress metadata refresh, and harness stringified
  diagnostics.

## Validation Log

- `npx tap --disable-coverage --reporter=terse test/control-plane/membership-publication-coordinator-main-stage-3.js -g "active-gate best progress"`
  - pass; focused membership-publication best-progress metadata proof is green.
- `npx tap --disable-coverage --reporter=terse test/admin/admin-control-snapshot.test.js -g "connected active heartbeat|recovery-eligible readiness|publication owner-truth"`
  - pass; admin snapshots keep durable publication scoped while widening
    diagnostic active coverage from readiness and fresh heartbeat evidence.
- `npx tap --disable-coverage --reporter=terse test/control-plane/membership-publication-coordinator-main-stage-3.js`
  - pass; 219 assertions pass across the broader stage-3 coordinator file.
- `npx tap --disable-coverage --reporter=terse test/distributed/harness/__tests__/cluster.test-part-5.js -g "stringified publication diagnostics"`
  - pass; harness selected-snapshot summary parses stringified persisted
    publication diagnostics.
- `node scripts/check-guideline-literals.js src/control-plane/active-node-projection.js test/admin/admin-control-snapshot.test.js`
  - pass; `0` new literal-guideline violations.
- `node scripts/check-guideline-decision-boundaries.js src/control-plane/active-node-projection.js test/admin/admin-control-snapshot.test.js`
  - pass; decision-boundary guard is clean for the latest projection patch and
    focused admin tests.
- `npm run audit:runtime-grammar:file -- src/control-plane/active-node-projection.js src/admin/admin-control-snapshot-class-part-3.js src/control-plane/membership-publication-planning.js`
  - pass; runtime grammar audit is clean for the touched runtime owner files.
- `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --fast-local --verbose`
  - fail after 264.2s, but migrated: setup active completed, selected
    snapshot coverage increased to 3/5, and the first frontier moved to
    `publication_ack_convergence`.
- `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json`
  - pass; first frontier is `publication_ack_convergence` under
    `topology_publication_owner / publication_convergence`, with next expected
    priority recovery progress under `operation_workflow_owner /
    workflow_progress`.
- `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --explain active_gate_snapshot_coverage`
  - pass; active-gate snapshot coverage is no longer the first frontier and is
    now deferred by publication and priority recovery spread evidence.
- `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json`
  - pass; canonical first critical path is
    `topology:publication_ack_convergence`.
- `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --markdown`
  - pass; residuals identify `operation_workflow_owner / workflow_progress`
    for `sql_transactions-p1` and `sql_write_operations-p1` with
    `priority_operation_serial_wait`.

## Guardrail Ledger

- Literal guardrail:
  `node scripts/check-guideline-literals.js src/control-plane/active-node-projection.js test/admin/admin-control-snapshot.test.js`
  passed with `0` new literal-guideline violations.
- Decision-boundary guardrail:
  `node scripts/check-guideline-decision-boundaries.js src/control-plane/active-node-projection.js test/admin/admin-control-snapshot.test.js`
  passed for the projection patch and focused admin tests.
- Runtime-grammar guardrail:
  `npm run audit:runtime-grammar:file -- src/control-plane/active-node-projection.js src/admin/admin-control-snapshot-class-part-3.js src/control-plane/membership-publication-planning.js`
  passed for the touched runtime owner files.

## Representative Rerun

Latest representative artifact:
`test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json`.

The run is still red, but this package achieved the bounded transition it
owned: active-gate snapshot coverage moved from `1/5` to `3/5`, the setup
active stage completed, and startup active-gate snapshot coverage is no longer
the first frontier. The next canonical handoff context is publication
convergence, and the focused residual extractor names
`operation_workflow_owner / workflow_progress` as the narrowed implementation
owner for the next package.

## LLM Tool-First Fallbacks

Canonical extractors were used first:
`work:evidence-summary`, `analyze:topology-convergence`,
`analyze:causal-model`, `analyze:distributed-failure`, and
`analyze:priority-recovery-residuals`. Raw replay-event inspection was used
only because those extractors did not expose the selected snapshot's nested
stringified lifecycle/projection payloads or the individual selected readiness
rows needed to determine whether the active-gate coverage failure was a
serializer, publication metadata, or projection input problem.

## Commit And Push Ledger

1. Focused package commit: 27c0d8dfc5518f5beaf7237e2e1d0dc39040b3ff
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
