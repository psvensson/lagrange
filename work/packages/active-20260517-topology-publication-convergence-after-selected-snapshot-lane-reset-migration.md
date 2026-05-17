# Topology Publication Convergence After Selected Snapshot Lane Reset Migration

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Successor from the selected snapshot lane reset package. Fresh canonical evidence selects publication_ack_convergence under topology_publication_owner / publication_convergence with publicationStatus=OPEN, publicationPending=true, publicationOwnerStream publishing/waiting_for_publication, only the seed node in publishedActiveNodeIds, missingPublishedCount=4, active gate deferred at snapshotCoverageNodeCount=2/5, owner_reconcile_pending count=3, and priority residual witness count=0.",
  "nextAction": "Run the required review/fix/implementation subagent sequence, then build the focused publication-convergence proof for OPEN/publishing and waiting_for_publication after active-gate lane reset. Do not reopen selected-source timeout, active-gate admission, timeout budgets, readiness, priority recovery, or closed handoff proof unless canonical evidence selects them again.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence",
    "git diff --check"
  ],
  "writeScope": [
    "work/packages/active-20260517-topology-publication-convergence-after-selected-snapshot-lane-reset-migration.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-publication-migration.md",
    "work/packages/done-20260517-topology-publication-convergence-after-startup-reconcile-migration.md",
    "test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-owner-state.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-recovery-gate.js",
    "test/distributed/harness/publication-evidence-contract.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/control-plane/publication-recovery-gate.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260517-topology-publication-convergence-after-selected-snapshot-lane-reset-migration.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened",
      "canonical evidence changes first frontier owner or boundary"
    ]
  },
  "representativeResidual": {
    "status": "live-red",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Prove or repair the publication owner path that remains OPEN/publishing and waiting_for_publication while missing four published active nodes."
  },
  "causalGovernance": {
    "hypothesis": "The selected snapshot lane reset moved active_gate_snapshot_coverage out of first frontier, but publication convergence is still OPEN because the publication owner stream remains publishing/waiting_for_publication with only the seed node published as active and four active nodes missing from the published set.",
    "stopConditionCheck": "Use work:evidence-summary, topology handoff/replay probes, npm run analyze:causal-model, priority residual extraction, distributed-failure summary, and owner-files before runtime edits. Runtime edits require clean review/fix subagent proof and a real implementation subagent.",
    "expectedCausalModelChange": "Either close/reduce the publication_ack_convergence edge with a focused publication owner proof or classify the edge as same-frontier/architecture-gap without reopening frozen active-gate, priority, timeout-budget, admission, readiness, or closed handoff work.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "This is a re-entry into topology_publication_owner / publication_convergence after a focused active-gate migration. Treat that as causal-escalation scope: identify the missing publication owner causal edge before another runtime patch.",
    "crossBoundaryReview": "Review work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-publication-migration.md and the prior publication-convergence package before implementation starts."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart publication convergence after selected snapshot lane reset",
    "phaseChain": [
      "consume the selected snapshot lane reset closure package",
      "refresh evidence-summary, topology handoff/replay probes, causal model, priority residuals, distributed-failure summary, and owner-files on the latest representative artifact",
      "run a fresh review subagent against the most recently executed package on this sprint boundary",
      "run a fix subagent if review finds fixes",
      "run a separate implementation subagent for this publication-convergence package",
      "build the narrowest replayable publication owner proof before runtime edits",
      "rerun focused publication tests and one representative rolling-restart run with a real timestamp"
    ],
    "currentFirstFrontier": "publication_ack_convergence in test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json, owned by topology_publication_owner / publication_convergence with dominant reason publication_pending.",
    "knownDownstreamBlockers": [
      "publicationStatus is OPEN",
      "publicationPending is true",
      "publicationOwnerStream freshnessFence is publishing",
      "publicationOwnerStream recoveryOutcome is waiting_for_publication",
      "publishedActiveNodeIds contains only 7493b0ab-a054-5fad-a91b-5e331db29304",
      "missingPublishedCount is 4",
      "priority residual extraction reports zero witnesses",
      "active gate is deferred with snapshotCoverageNodeCount 2 of expectedNodeCount 5",
      "publicationActiveGateHandoff is pending owner_reconcile_pending with count 3"
    ],
    "missingCausalEdge": "The publication owner remains publishing/waiting_for_publication without publishing the full active cohort after the selected snapshot lane reset moved the prior active-gate selected-source timeout out of first frontier.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json --replay-fixture",
    "boundedProgressProof": "pending-before-probe: identify the publication owner reconcile/publish advance mechanism before runtime edits, then prove one bounded publication convergence retry, reconcile, drain, or advance path.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json plus pending focused publication owner probe",
    "expectedObservableTransition": "Publication convergence should either close or reduce missingPublishedCount/publishedActiveNodeIds under topology_publication_owner before active-gate snapshot coverage becomes first frontier again.",
    "maxProgressBound": "one focused topology_publication_owner / publication_convergence slice",
    "sameFrontierFallback": "If focused publication proof passes but the representative remains publication_ack_convergence with OPEN/publishing and no movement in published active cohort, stop as same-frontier or architecture-gap instead of widening into active-gate, priority, timeout-budget, admission, readiness, or terminal-progress work.",
    "expectedNextFrontier": "active_gate_snapshot_coverage only after publication convergence closes; otherwise same topology_publication_owner / publication_convergence edge",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-topology-publication-convergence-after-startup-reconcile-migration.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-publication-migration.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "This is an allowed successor because the immediately prior active-gate package changed the first frontier back to publication_ack_convergence after moving selected_snapshot_source_timeout out of first frontier; continued runtime work must first identify the missing publication owner causal edge.",
    "handoffInvariant": "Selected-source timeout handling, active-gate admission, timeout budgets, readiness support, priority recovery, terminal-progress selection, and closed handoff proof remain frozen unless canonical evidence selects them again."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "Focused selected snapshot lane reset moved active_gate_snapshot_coverage out of first frontier; fresh canonical evidence selects publication_ack_convergence with publication_pending and priority residual witness count 0.",
    "evidence": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json --replay-fixture",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json"
    ]
  },
  "predecessor": "work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-publication-migration.md"
}
-->

## Why

The selected snapshot lane reset package moved the active-gate selected-source
timeout out of the first frontier. The latest representative artifact is still
red, but the canonical blocker has migrated back to publication convergence:
`publication_ack_convergence` is blocked by `publication_pending` while the
publication owner stream remains publishing/waiting_for_publication.

## Current Edge Card

```text
Input artifact: test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json
Current first frontier: publication_ack_convergence
Owner: topology_publication_owner
Boundary: publication_convergence
Dominant reason: publication_pending
Publication status: OPEN
Publication owner stream: publishing / waiting_for_publication
Published active nodes: 1/5, seed only
Missing published nodes: 4
Priority residual witnesses: 0
Active-gate state: deferred, snapshotCoverageNodeCount=2/5, owner_reconcile_pending count=3
Allowed stop modes: representative-green, reduced, same-frontier, migrated, classification-only, architecture-gap, human-escalation
Next role: real review subagent before implementation
```

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically rolling-restart topology
workflow stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative release gate remains red after
  adjacent active-gate and publication-convergence migrations, and canonical
  evidence selects a runtime owner boundary that has recently re-entered.
- Escalation trigger to a heavier lane: runtime ownership expands beyond the
  publication owner boundary, shared contracts change, or representative
  evidence changes owner/boundary again without monotonic progress.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package. Run review, fix if needed, and implementation subagents
sequentially before editing runtime files.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Wegener (019e36ce-607e-7782-9690-bd8666f2a9c1) reviewed work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-publication-migration.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Mill (019e36d2-24dc-7cb3-a758-d11706b541cd) fixed work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-publication-migration.md.
- [ ] Implementation subagent recorded: pending-before-implementation.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc
`jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which
canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260517-topology-publication-convergence-after-selected-snapshot-lane-reset-migration.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

## Out Of Scope

1. startup_active_gate_owner implementation
2. operation_workflow_owner implementation
3. selected_source_timeout
4. timeout_budgets
5. active_gate_admission
6. priority_recovery
7. readiness_support
8. terminal_progress
9. closed active-gate lane reset proof

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260517-topology-publication-convergence-after-selected-snapshot-lane-reset-migration.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `startup_active_gate_owner implementation`, `operation_workflow_owner implementation`, `selected_source_timeout`, `timeout_budgets`, `active_gate_admission`, `priority_recovery`, `readiness_support`, `terminal_progress`, `closed active-gate lane reset proof`
- Frozen decisions: selected snapshot lane reset is closed; active-gate coverage is deferred; priority residual witnesses are `0`; publication recovery must be proven in the publication owner boundary before reopening downstream gates.
- Escalation triggers: owned files expand beyond this package, a frozen decision must be reopened, or canonical evidence changes first frontier owner or boundary.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json`, `npm run analyze:owner-files -- topology_publication_owner publication_convergence`, `git diff --check`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json --handoff-probe
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json --replay-fixture
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json
6. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json
7. npm run analyze:owner-files -- topology_publication_owner publication_convergence
8. git diff --check
