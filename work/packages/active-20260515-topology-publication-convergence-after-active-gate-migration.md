# Topology Publication Convergence After Active Gate Migration

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Successor package opened from the migrated active-gate snapshot coverage package. Canonical evidence on test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json now selects publication_ack_convergence under topology_publication_owner / publication_convergence with publication_pending; active_gate_snapshot_coverage is downstream with snapshotCoverage=0/5 and selected snapshot forced-repair error.",
  "nextAction": "Analyze publication_pending in the new representative artifact with canonical topology and causal extractors, then repair or classify topology_publication_owner / publication_convergence without reopening active-gate snapshot coverage unless fresh evidence promotes it back to first frontier.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json --explain publication_ack_convergence",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260515-topology-publication-convergence-after-active-gate-migration.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-owner-state.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/membership-publication-planning.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js"
  ],
  "commitScope": [
    "work/packages/active-20260515-topology-publication-convergence-after-active-gate-migration.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "scenario-causal-escalation",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Analyze why the publication owner stream is unavailable/no_revision/not_started in the migrated representative artifact before active-gate snapshot coverage can converge."
  },
  "causalGovernance": {
    "hypothesis": "topology_publication_owner / publication_convergence must publish or classify the usable owner stream before active-gate forced snapshot repair can select a converged snapshot source.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json",
    "expectedCausalModelChange": "publication_ack_convergence becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The active-gate package migrated the representative residual to publication_ack_convergence / publication_pending. Active-gate snapshot coverage is downstream with snapshotCoverage=0/5 and selected snapshot forced-repair error.",
    "crossBoundaryReview": "Review and fix subagent proof are recorded for the causal-escalation handoff; implementation proof is required before runtime changes."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / topology_publication_owner / publication_convergence after active-gate migration",
    "phaseChain": [
      "active-gate bounded retry proof",
      "representative rerun classification",
      "publication convergence extraction",
      "successor publication owner analysis"
    ],
    "currentFirstFrontier": "publication_ack_convergence under topology_publication_owner / publication_convergence with publication_pending",
    "knownDownstreamBlockers": [
      "active_gate_snapshot_coverage remains downstream with snapshotCoverage=0/5 and selected snapshot forced-repair error",
      "readiness_startup_support remains deferred through inherited_active_gate_no_progress",
      "scenario_duration and active_gate_timeout budgets are exhausted in the migrated artifact"
    ],
    "missingCausalEdge": "publication convergence did not produce a usable owner stream before active-gate forced repair selected the snapshot source.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json --explain publication_ack_convergence",
    "boundedProgressProof": "Pending implementation; expected proof must show bounded retry, timeout classification, reconcile, or advance behavior for topology_publication_owner / publication_convergence.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json",
    "expectedObservableTransition": "publication_pending resolves to green evidence, reduced residual, same-frontier proof, migrated owner-boundary proof, or classification-only stop.",
    "maxProgressBound": "one focused publication-convergence package slice with canonical extractors, owner-file proof, focused validation, and representative result classification",
    "sameFrontierFallback": "keep topology_publication_owner / publication_convergence active and do not absorb active-gate, operation workflow, or generic harness timeout changes without canonical promotion.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage after publication convergence improves, or a narrower publication owner boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260514-topology-publication-convergence-final-blocker.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/active-20260515-topology-publication-convergence-after-active-gate-migration.md / topology_publication_owner / publication_convergence / pending-before-probe"
    ],
    "oscillationCheck": "The first frontier returned to topology_publication_owner / publication_convergence after active-gate bounded retry proof, so this package uses the causal-escalation lane before another local runtime patch.",
    "handoffInvariant": "Prove the producer-consumer missing edge with canonical evidence before patching publication runtime; keep active-gate snapshot coverage downstream unless fresh extraction promotes it back to first frontier."
  },
  "predecessor": "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md"
}
-->

## Why

The active-gate snapshot coverage package migrated the representative
rolling-restart residual instead of closing it. Focused active-gate proof now
sustains forced snapshot repair after the no-progress threshold and preserves
selected snapshot owner-observation evidence, but the representative rerun
stops earlier at `publication_ack_convergence` under
`topology_publication_owner / publication_convergence` with
`publication_pending`.

This successor package owns that producer-side publication frontier. It must
explain, repair, or classify why the publication owner stream is unavailable,
`no_revision`, or `not_started` in the migrated artifact before active-gate
snapshot coverage can be treated as the live first blocker again.

## Scope Basis

AGPL topology convergence release-gate closure. The sprint ship criteria still
require `active=5/5`, `snapshotCoverage=5/5`, and `missingPublished=0`, and
the current canonical representative artifact now names
`topology_publication_owner / publication_convergence` as the first frontier.
This package is bounded to that owner boundary and the canonical extractor
proof listed in the package metadata.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the frontier has oscillated between
  publication convergence and active-gate snapshot coverage, so this package
  must prove the cross-boundary producer-consumer edge before another local
  runtime patch.
- Escalation trigger to a heavier lane: representative evidence changes first
  frontier again or the missing edge spans more than publication convergence
  and active-gate snapshot coverage.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260515-topology-publication-convergence-after-active-gate-migration.md
2. work/sprints/active-2026-q2-topology-convergence-residual-closure.md
3. work/model-ledger.jsonl

## Out Of Scope

1. startup_active_gate_owner/runtime
2. operation_workflow_owner/runtime
3. scenario_timeout_defaults

## Subagent Sequencing Ledger

Required before implementation because this is a runtime owner-boundary
package.

- [x] Review subagent recorded:
      Agent Raman (019e2a69-d7c7-79e0-84a6-7c235fa43a19) reviewed work/packages/active-20260515-topology-publication-convergence-after-active-gate-migration.md; result fixes-required
- [x] Fix subagent recorded or explicitly not needed:
      Agent Mencius (019e2a6c-0251-71c2-931c-78d9db26f551) fixed work/packages/active-20260515-topology-publication-convergence-after-active-gate-migration.md
- [ ] Implementation subagent recorded:
      pending-before-implementation-resumes

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `scenario-causal-escalation`
- Owned files: `work/packages/active-20260515-topology-publication-convergence-after-active-gate-migration.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `work/model-ledger.jsonl`
- Forbidden files: `startup_active_gate_owner/runtime`, `operation_workflow_owner/runtime`, `scenario_timeout_defaults`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json --explain publication_ack_convergence`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json`, `npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json --explain publication_ack_convergence
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json
4. npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown
