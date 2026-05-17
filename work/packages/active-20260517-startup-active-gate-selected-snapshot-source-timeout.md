# Startup Active Gate Selected Snapshot Source Timeout

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-publication-handoff-full-target-20260517T032823Z/rolling-restart/",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "selected_snapshot_source_timeout",
  "currentState": "Representative rolling-restart after the publication handoff slice selected selected_snapshot_source_timeout on source 11601fe0-72d6-5853-8590-ec2881853e72: snapshotCoverage=0/5, discovery_node_coverage_gap absent, handoff contract absent, and causal-model outcome migrate_owner_boundary.",
  "nextAction": "Build the narrow selected snapshot-source fixture for source 11601fe0-72d6-5853-8590-ec2881853e72 admin snapshot query timeout, prove whether source selection should choose a usable snapshot source before forced repair or readiness inheritance, then edit only the selected startup active-gate snapshot-source owner path.",
  "proof": [
    "npm run work:validate -- --entry work/packages/active-20260517-startup-active-gate-selected-snapshot-source-timeout.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260517-startup-active-gate-selected-snapshot-source-timeout.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260517-topology-publication-convergence-reopened-missing-publication.md",
    "test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json",
    "test-output/reports/.playback/rolling-restart-publication-handoff-full-target-20260517T032823Z/rolling-restart/"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "test/admin/admin-control-snapshot.test.js",
    "src/diagnostics/topology-convergence-graph.js"
  ],
  "commitScope": [
    "work/packages/active-20260517-startup-active-gate-selected-snapshot-source-timeout.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "cross-boundary-causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "oscillation-handoff/selected-snapshot-source",
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
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "selected_snapshot_source_timeout",
    "nextAction": "Build the replayable selected snapshot-source timeout fixture for source 11601fe0-72d6-5853-8590-ec2881853e72 before any local runtime edit."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "The publication handoff package removed the owner_reconcile_pending/discovery gap decision and the representative rerun selected selected_snapshot_source_timeout on source 11601fe0-72d6-5853-8590-ec2881853e72.",
    "evidence": [
      "work/packages/done-20260517-topology-publication-convergence-reopened-missing-publication.md",
      "test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json --replay-fixture",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The representative edge now belongs to selected snapshot-source selection: the chosen source 11601fe0-72d6-5853-8590-ec2881853e72 is admin-health reachable but its snapshot-lane admin query times out, leaving snapshotCoverage=0/5 before publication handoff evidence can form.",
    "stopConditionCheck": "Use npm run work:evidence-summary, topology handoff/replay fixture, npm run analyze:causal-model, owner-files, and a focused selected-source fixture to prove whether bad snapshot-source selection, forced repair stall, authoritative nodes query pressure, or inherited readiness support owns the edge before runtime edits.",
    "expectedCausalModelChange": "snapshotCoverage improves above 2/5, discovery_node_coverage_gap stays absent while selected_snapshot_source_timeout disappears, the frontier migrates to a genuinely new owner boundary, or representative rolling-restart turns green.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "This is an oscillation back to startup_active_gate_owner / snapshot_coverage after a publication migration. The package may continue only as a causal-escalation handoff that proves the selected snapshot-source timeout edge before editing runtime.",
    "crossBoundaryReview": "Do not reopen timeout budgets, active-gate admission, publication ACK, priority recovery, CDC fallback, reconnect delivery, query routing, or inactive participant routing unless the replay fixture selects them again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart selected snapshot-source timeout after publication handoff migration",
    "phaseChain": [
      "consume publication handoff migration proof",
      "use evidence summary, handoff probe, replay fixture, causal model, and owner-files to classify selected_snapshot_source_timeout",
      "build or reuse the narrow selected snapshot-source fixture for source 11601fe0-72d6-5853-8590-ec2881853e72",
      "run review/fix/implementation subagents before runtime edits",
      "edit only the selected owner path if the fixture selects bad source selection",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or contradictory"
    ],
    "currentFirstFrontier": "publication_ack_convergence remains the topology first frontier, but active_gate_snapshot_coverage is the selected downstream owner edge with selected_snapshot_source_timeout on source 11601fe0-72d6-5853-8590-ec2881853e72.",
    "knownDownstreamBlockers": [
      "snapshotCoverage=0/5",
      "selectedSnapshotNodeId=11601fe0-72d6-5853-8590-ec2881853e72",
      "selectedSnapshotTimeoutMs=3000",
      "selectedSnapshotSourceCause=selected_snapshot_source_timeout",
      "activeGateSnapshotOwnerEdge=selected_snapshot_source_selection",
      "readinessDelayCause=snapshot_timeout",
      "publicationActiveGateHandoff absent",
      "discovery_node_coverage_gap absent"
    ],
    "missingCausalEdge": "Separate bad snapshot-source selection from forced repair stall, authoritative control snapshot query pressure, and inherited readiness support for the selected 11601fe0 snapshot timeout.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json --replay-fixture",
    "boundedProgressProof": "Pending bounded timeout/retry proof: selected_snapshot_source_timeout must disappear, snapshotCoverage must improve above 2/5, discovery_node_coverage_gap must stay absent with a new owner boundary, or representative rolling-restart must turn green.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json",
    "expectedObservableTransition": "A selected owner fix should choose or recover a usable active-gate snapshot source without timeout budget increases, active-gate admission relaxation, CDC fallback, reconnect-delivery, query routing, or inactive participant routing changes.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage causal-escalation slice",
    "sameFrontierFallback": "If focused tests pass but representative evidence keeps selected_snapshot_source_timeout without metric movement, stop and record same-frontier instead of widening into frozen edges.",
    "expectedNextFrontier": "selected_snapshot_source_timeout gone, snapshotCoverage above 2/5, representative green, or a new owner boundary selected by canonical evidence",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260517-topology-publication-convergence-reopened-missing-publication.md / topology_publication_owner / publication_convergence / migrated"
    ],
    "oscillationCheck": "This package is causal-escalation because canonical evidence returned to startup_active_gate_owner / snapshot_coverage after the publication handoff package.",
    "handoffInvariant": "Timeout budgets, active-gate admission, publication ACK, priority recovery, CDC fallback, reconnect delivery, query participant routing, and inactive participant routing remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260517-topology-publication-convergence-reopened-missing-publication.md"
}
-->

## Why

The representative rerun after the publication handoff package selected
`selected_snapshot_source_timeout` on source
`11601fe0-72d6-5853-8590-ec2881853e72`. This is a return to the recently
closed startup active-gate snapshot boundary, so the package is causal
escalation: it must decide the selected-source timeout edge before any local
runtime patch.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: canonical evidence returned to the recently closed
  startup active-gate snapshot boundary after a publication migration.
- Escalation trigger to a heavier lane: the selected-source fixture chooses a
  frozen edge such as timeout budgets, active-gate admission, reconnect
  delivery, query routing, or publication ACK.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven causal
escalation package that may edit a runtime owner boundary.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Banach (019e3404-bacd-7f63-ac1e-3e9a78ea10c3) reviewed work/packages/active-20260517-startup-active-gate-selected-snapshot-source-timeout.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Dirac (019e3407-6a79-76e2-886b-ab9f3b042874) fixed work/packages/active-20260517-startup-active-gate-selected-snapshot-source-timeout.md.
- [ ] Implementation subagent recorded: pending-before-implementation.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260517-startup-active-gate-selected-snapshot-source-timeout.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

## Out Of Scope

1. timeout_budgets
2. active_gate_admission
3. CDC_fallback
4. query_message_router_owner/reconnect_delivery
5. query_participant_failure/inactive_participant_routing
6. topology_publication_owner/publication_convergence

## Model Fit

- Package class: `cross-boundary-causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `oscillation-handoff/selected-snapshot-source`
- Output profile: `medium`
- Owned files: `work/packages/active-20260517-startup-active-gate-selected-snapshot-source-timeout.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `timeout_budgets`, `active_gate_admission`, `CDC_fallback`, `query_message_router_owner/reconnect_delivery`, `query_participant_failure/inactive_participant_routing`, `topology_publication_owner/publication_convergence`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:validate -- --entry work/packages/active-20260517-startup-active-gate-selected-snapshot-source-timeout.md`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:validate -- --entry work/packages/active-20260517-startup-active-gate-selected-snapshot-source-timeout.md
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json --handoff-probe
4. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json --replay-fixture
5. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-handoff-full-target-20260517T032823Z.report.json
6. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
