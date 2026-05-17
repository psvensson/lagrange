# Topology Publication Convergence Reopened Missing Publication

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-17",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-publication-handoff-full-target-20260517T032823Z/rolling-restart/",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "The publication slice moved the replay decision: the representative rerun no longer reports discovery_node_coverage_gap or an active-gate owner handoff reconcile target. Fresh evidence still has publication_ack_convergence as the first frontier, but the selected actionable blocker is selected_snapshot_source_timeout on snapshot source 11601fe0-72d6-5853-8590-ec2881853e72 with snapshotCoverage=0/5 and causal-model outcome migrate_owner_boundary.",
  "nextAction": "Close this package as migrated and continue in the successor startup_active_gate_owner / snapshot_coverage package for selected_snapshot_source_selection; do not widen publication ACK, timeout budgets, active-gate admission, CDC fallback, reconnect delivery, or query routing in this package.",
  "proof": [
    "npm run work:validate -- --entry work/packages/done-20260517-topology-publication-convergence-reopened-missing-publication.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --explain publication_ack_convergence",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260517-topology-publication-convergence-reopened-missing-publication.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-owner-decision.js",
    "test/control-plane/publication-owner-stream.test.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md",
    "test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json",
    "test-output/reports/.playback/rolling-restart-active-gate-reference-projection-20260517T023552Z/rolling-restart/",
    "test-output/reports/rolling-restart-publication-open-missing-publishing-20260517T030128Z.report.json",
    "test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json"
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
    "src/control-plane/membership-publication-planning.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/distributed/harness/publication-evidence-contract.js",
    "test/distributed/harness/failure-bundle-segment-4.js",
    "src/diagnostics/topology-convergence-graph.js"
  ],
  "commitScope": [
    "work/packages/done-20260517-topology-publication-convergence-reopened-missing-publication.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-owner-decision.js",
    "test/control-plane/publication-owner-stream.test.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js"
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
    "artifact": "test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "The bounded publication handoff proof migrated: selected_snapshot_source_timeout on source 11601fe0-72d6-5853-8590-ec2881853e72 now owns the next metric-moving fixture under startup_active_gate_owner / snapshot_coverage."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "The bounded publication owner slice improved the decision surface, then the representative rerun selected selected_snapshot_source_timeout on source 11601fe0-72d6-5853-8590-ec2881853e72. The handoff contract is absent, discovery_node_coverage_gap is absent, and the causal model outcome is migrate_owner_boundary with startup readiness/snapshot timeout evidence.",
    "evidence": [
      "test-output/reports/rolling-restart-publication-open-missing-publishing-20260517T030128Z.report.json",
      "test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json --handoff-probe",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The publication owner path was hiding the next actionable snapshot-source selection edge; once the handoff target preserved full convergence context, the representative gate selected selected_snapshot_source_timeout on the chosen snapshot source instead of discovery_node_coverage_gap or owner_reconcile_pending.",
    "stopConditionCheck": "Run entry validation, handoff/snapshot probe, focused admin snapshot tests, focused owner tests, static guardrails, npm run analyze:causal-model, and one representative rolling-restart rerun; classify the result as green, reduced, migrated, or same-frontier before any wider edit.",
    "expectedCausalModelChange": "publication_ack_convergence disappears, snapshotCoverage improves above 2/5, the frontier migrates to a genuinely new owner boundary, or representative rolling-restart turns green.",
    "representativeOutcome": "migrated",
    "causalDebt": "The first fix moved publicationOwnerStream from stale/consumer_lag to waiting_for_ack/ack_lag. The second fix preserved full publicationConvergence context when activeGateOwnerCohort narrows diagnostics. The representative rerun then selected selected_snapshot_source_timeout on 11601fe0-72d6-5853-8590-ec2881853e72, with handoff contract absent, discovery_node_coverage_gap absent, and snapshotCoverage=0/5. That selects the startup active-gate snapshot-source owner next.",
    "crossBoundaryReview": "Publication ACK was reopened only because canonical evidence selected it, and this package does not reopen timeout budgets, active-gate admission, CDC fallback, reconnect delivery, or query participant routing. Startup active-gate snapshot source selection is now canonical successor evidence, not a local widening of this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after active-gate forced repair fallback migration",
    "phaseChain": [
      "consume the active-gate forced repair fallback migration proof",
      "use evidence summary, topology explain, handoff probe, causal model, and priority residual extraction to classify the reopened publication frontier",
      "build or reuse the narrowest publication-convergence fixture for OPEN publication with missing active publication",
      "edit only the selected topology_publication_owner / publication_convergence path after review/fix/implementation subagent proof is clean",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or contradictory"
    ],
    "currentFirstFrontier": "publication_ack_convergence in test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json, owned by topology_publication_owner / publication_convergence with reason publication_pending; actionable successor evidence is active_gate_snapshot_coverage / selected_snapshot_source_timeout on source 11601fe0-72d6-5853-8590-ec2881853e72.",
    "knownDownstreamBlockers": [
      "publicationStatus=OPEN",
      "publishedActiveNodeIds=[]",
      "missingPublishedCount=5",
      "pendingAckCount=0",
      "publicationOwnerFreshnessFence=publishing",
      "publicationOwnerRecoveryOutcome=waiting_for_publication",
      "publicationOwnerStreamOutcome=publishing",
      "priority recovery residual witnessCount=0",
      "active_gate_snapshot_coverage is deferred with selected_snapshot_source_timeout, selectedSnapshotNodeId=11601fe0-72d6-5853-8590-ec2881853e72, selectedSnapshotTimeoutMs=3000, and snapshotCoverageNodeCount=0/5"
    ],
    "missingCausalEdge": "Selected: bad snapshot-source selection / selected source admin snapshot query timeout. Forced repair timeout, authoritative control snapshot nodes query pressure, and inherited readiness support are not selected by the latest handoff replay.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json --replay-fixture",
    "boundedProgressProof": "Satisfied by migration through a bounded timeout mechanism: discovery_node_coverage_gap disappeared and causal-model outcome is migrate_owner_boundary with selected_snapshot_source_timeout on source 11601fe0-72d6-5853-8590-ec2881853e72.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json",
    "expectedObservableTransition": "The selected owner fix should choose or recover a usable active-gate snapshot source without timeout budget increases, active-gate admission relaxation, CDC fallback, reconnect-delivery, query routing, or inactive participant routing changes.",
    "maxProgressBound": "one focused topology_publication_owner / publication_convergence package slice",
    "sameFrontierFallback": "If focused tests pass but representative evidence keeps the same publication frontier without metric movement, stop and record same-frontier instead of widening into frozen edges.",
    "expectedNextFrontier": "publication_ack_convergence gone, snapshotCoverage above 2/5, representative green, or a new owner boundary selected by canonical evidence",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260517-priority-recovery-operation-workflow-owner-workflow-progress.md / operation_workflow_owner / workflow_progress / migrated",
      "work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "This package is allowed because fresh canonical evidence reselected publication_ack_convergence after the active-gate package, not because publication ACK was reopened manually.",
    "handoffInvariant": "Timeout budget increases, active-gate admission relaxation, CDC fallback, message-router reconnect delivery, query participant routing, inactive participant routing, and priority recovery workflow progress remain frozen. Startup active-gate snapshot source selection is reopened only because canonical evidence selected selected_snapshot_source_timeout on 11601fe0-72d6-5853-8590-ec2881853e72."
  },
  "predecessor": "work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md",
  "closed": "2026-05-17",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260517-startup-active-gate-selected-snapshot-source-timeout.md"
}
-->

## Why

Fresh representative evidence reselected `publication_ack_convergence` after
the active-gate forced-repair fallback slice. This is a reopened frozen edge,
but the reopening is canonical: publication is `OPEN`, no active nodes are
published, `missingPublishedCount=5`, `pendingAckCount=0`, and priority
recovery remains drained.

This package owns the narrow publication-convergence decision before any
runtime edit. It must prove whether the edge belongs to publication owner
evidence/planning, membership publication coordinator progress, or only a
deferred active-gate selected snapshot timeout.

The package result is migrated, not green. Focused publication fixes moved the
decision surface through the handoff contract, and the representative rerun now
selects `selected_snapshot_source_timeout` on source
`11601fe0-72d6-5853-8590-ec2881853e72`. `discovery_node_coverage_gap`
disappeared, the handoff contract is absent, and the causal model returned
`migrate_owner_boundary`.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is required: the representative release gate is still red and
  canonical evidence selected a reopened publication-convergence runtime owner.
- Escalation trigger to a heavier lane: the replay fixture selects multiple
  runtime owners, a non-publication frozen edge, or a timeout/admission policy.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Mencius (019e33d7-616c-7fb0-ac5e-2c017011d0e9) reviewed work/packages/done-20260517-topology-publication-convergence-reopened-missing-publication.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Schrodinger (019e33da-dadf-7481-902e-caca50729475) fixed work/packages/done-20260517-topology-publication-convergence-reopened-missing-publication.md.
- [x] Implementation subagent recorded: Agent Parfit (019e33dd-a3fd-7711-ab6b-04ef8290e66c) implemented work/packages/done-20260517-topology-publication-convergence-reopened-missing-publication.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260517-topology-publication-convergence-reopened-missing-publication.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/control-plane/publication-owner-decision.js
7. test/control-plane/publication-owner-stream.test.js
8. src/control-plane/membership-publication-coordinator-class-stage-2.js
9. test/control-plane/membership-publication-coordinator-main-stage-2.js
10. src/control-plane/publication-active-gate-handoff-contract.js
11. test/control-plane/publication-active-gate-handoff-contract.test.js

## Out Of Scope

1. timeout_budgets
2. active_gate_admission
3. CDC_fallback
4. query_message_router_owner/reconnect_delivery
5. query_participant_failure/inactive_participant_routing
6. startup_active_gate_owner/snapshot_coverage

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260517-topology-publication-convergence-reopened-missing-publication.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-owner-decision.js`, `test/control-plane/publication-owner-stream.test.js`, `src/control-plane/membership-publication-coordinator-class-stage-2.js`, `test/control-plane/membership-publication-coordinator-main-stage-2.js`, `src/control-plane/publication-active-gate-handoff-contract.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`
- Forbidden files: `timeout_budgets`, `active_gate_admission`, `CDC_fallback`, `query_message_router_owner/reconnect_delivery`, `query_participant_failure/inactive_participant_routing`, `startup_active_gate_owner/snapshot_coverage`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:validate -- --entry work/packages/done-20260517-topology-publication-convergence-reopened-missing-publication.md`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --explain publication_ack_convergence`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json`, `npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:validate -- --entry work/packages/done-20260517-topology-publication-convergence-reopened-missing-publication.md
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --explain publication_ack_convergence
4. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --handoff-probe
5. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --replay-fixture
6. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json
7. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json
8. npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown

Pre-implementation and replay proof:

1. `npm run work:validate -- --entry work/packages/done-20260517-topology-publication-convergence-reopened-missing-publication.md` - passed.
2. `npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-open-missing-publishing-20260517T030128Z.report.json` - selected `publication_ack_convergence`, `pending_acks_present`, `snapshotCoverage=2/5`, and handoff next action `reconcile_owner_membership_publication`.
3. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-missing-publishing-20260517T030128Z.report.json --handoff-probe` - selected `owner_reconcile_pending` with pending reconcile node `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`.
4. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-missing-publishing-20260517T030128Z.report.json --replay-fixture` - produced the replayable handoff fixture.
5. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-open-missing-publishing-20260517T030128Z.report.json` - outcome `continue_local_fix`.

Raw fallback:

1. Canonical extractors exposed the handoff state and selected next action but not the per-node publication IDs behind the write deferral.
2. Playback log search was used only after those extractors: different nodes attempted different `membership-publication:1:*` publication IDs and failed routed participant writes.
3. The fallback selected the contract bug where `activeGateOwnerCohort` narrowed the target and lost the full `publicationConvergence` cohort.

Focused tests:

1. `npx tap test/admin/admin-control-snapshot.test.js -g "forced participant repair failure returns a usable fallback snapshot|forced publication read failure preserves a metric-moving local fallback|forced query timeout preserves metric-moving local snapshot|forced repair failures preserve authoritative nodes query timeout replay evidence"` - passed.
2. `node test/control-plane/publication-active-gate-handoff-contract.test.js` - passed, 14/14.
3. `node test/control-plane/membership-publication-coordinator-main-stage-2.js` - passed, 98/98.
4. `node test/control-plane/publication-owner-stream.test.js` - passed, 66/66.
5. `node test/control-plane/publication-recovery-gate.test.js` - passed, 118/118.

Static guardrails:

1. `node --check src/control-plane/publication-owner-decision.js test/control-plane/publication-owner-stream.test.js src/control-plane/publication-active-gate-handoff-contract.js test/control-plane/publication-active-gate-handoff-contract.test.js` - passed.
2. `node scripts/check-guideline-literals.js src/control-plane/publication-owner-decision.js test/control-plane/publication-owner-stream.test.js src/control-plane/publication-active-gate-handoff-contract.js test/control-plane/publication-active-gate-handoff-contract.test.js` - passed, 0 new violations.
3. `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-owner-decision.js test/control-plane/publication-owner-stream.test.js src/control-plane/publication-active-gate-handoff-contract.js test/control-plane/publication-active-gate-handoff-contract.test.js` - passed, 0 violations.
4. `npm run audit:runtime-grammar:file -- src/control-plane/publication-owner-decision.js test/control-plane/publication-owner-stream.test.js src/control-plane/publication-active-gate-handoff-contract.js test/control-plane/publication-active-gate-handoff-contract.test.js` - passed, 0 violations.
5. `npm run test:metrics:scoped -- src/control-plane/publication-owner-decision.js test/control-plane/publication-owner-stream.test.js src/control-plane/publication-active-gate-handoff-contract.js test/control-plane/publication-active-gate-handoff-contract.test.js` - passed, 0 cyclomatic and 0 cognitive violations after a mechanical helper extraction in the already-promoted handoff contract file.
6. `git diff --check -- src/control-plane/publication-owner-decision.js test/control-plane/publication-owner-stream.test.js src/control-plane/publication-active-gate-handoff-contract.js test/control-plane/publication-active-gate-handoff-contract.test.js work/packages/done-20260517-topology-publication-convergence-reopened-missing-publication.md` - passed.

Representative rerun:

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json --verbose` - red, 0/1 passed.
2. `npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json` - `publication_ack_convergence` remains first frontier, but active-gate progress selected `selected_snapshot_source_timeout`, source `11601fe0-72d6-5853-8590-ec2881853e72`, `snapshotCoverage=0/5`, and no `discovery_node_coverage_gap`.
3. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json --handoff-probe` - handoff contract absent; next owner path requires a replayable snapshot-source fixture.
4. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json --replay-fixture` - selected source timeout fixture with `selectedSnapshotNodeId=11601fe0-72d6-5853-8590-ec2881853e72`.
5. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json` - outcome `migrate_owner_boundary`.
6. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json` - `witnessCount=0`.

## Commit And Push Ledger

1. Focused package commit: pending-before-focused-commit
2. Pushed to: pending-before-focused-push
3. Commit contains only package-owned files/package-status/allowed sprint handoff: pending-before-focused-commit
