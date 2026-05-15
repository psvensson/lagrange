# Startup Active Gate Remaining Publication Lag Proof

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The seed publication visibility slice is pushed as reduced evidence. The latest representative artifact still selects active_gate_snapshot_coverage with snapshot coverage 2/5 and producer seed-only published membership; the consumer handoff is narrowed to pendingReconcileCount=3, runtimePromotionAllowed=false, and priority-recovery residual extraction reports zero workflow_progress witnesses.",
  "nextAction": "Prove the remaining durable publication lag: explain why producer publishedActiveNodeIds remains seed-only while the consumer handoff has three pending reconcile nodes after awaited readback carry, then promote exact runtime files only after review/fix proof.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:package:doctor -- --suggest work/packages/active-20260515-startup-active-gate-remaining-publication-lag-proof.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --markdown",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260515-startup-active-gate-remaining-publication-lag-proof.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/owners/control-plane-publications-owner.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-stage-2.js",
    "src/control-plane/membership-publication-planning.js",
    "src/control-plane/control-plane-system-table-gateway.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260515-startup-active-gate-remaining-publication-lag-proof.md",
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
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Prove the remaining durable publication lag after the seed visibility slice reduced consumer pendingReconcileCount to 3 and cleared workflow-progress witnesses."
  },
  "causalGovernance": {
    "hypothesis": "The active-gate owner still observes seed-only producer publication visibility because the final publication owner surface selected by topology convergence is not the same durable row returned by the awaited reconcile, or because a snapshot observation path is still sampling stale publication history after the carried readback.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json",
    "expectedCausalModelChange": "Focused proof either makes rolling-restart green, reduces remaining pendingReconcileCount or producer missingPublishedCount, migrates to a narrower durable publication visibility boundary, or records why the producer/consumer publication surfaces disagree.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The prior slice proved durable readback can be carried to admin observation and reduced consumer handoff debt, but producer publication convergence still reports seed-only durable membership.",
    "crossBoundaryReview": "Do not edit runtime files until review/fix proof is clean and exact runtime write-scope promotion is recorded."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / remaining active-gate publication lag after seed visibility proof",
    "phaseChain": [
      "consume seed publication visibility reduced proof",
      "rerun canonical evidence on the latest artifact",
      "prove the producer seed-only publication surface versus the consumer three-node pending reconcile surface",
      "promote exact runtime files only after review/fix proof",
      "prove focused owner behavior and representative rolling-restart"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage remains the first representative frontier in test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "producer publication convergence still reports publishedActiveNodeIds as seed-only and missingPublishedCount=4",
      "consumer handoff contract is narrowed to pendingReconcileCount=3 and runtimePromotionAllowed=false",
      "selected snapshot coverage remains 2/5 with repair_deferred/deferred_refresh/deferred/deferred/retry",
      "priority-recovery residual extraction reports zero workflow_progress witnesses, so the parked workflow package remains inactive"
    ],
    "missingCausalEdge": "The package must prove why the producer publication convergence surface remains seed-only after the awaited handoff reconcile readback path can return and carry a widened publication row.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --handoff-probe",
    "boundedProgressProof": "Use focused source and owner-file evidence to trace the durable producer publication reconcile visibility mechanism before another runtime edit; active-gate admission remains strict while runtimePromotionAllowed=false.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json",
    "expectedObservableTransition": "pendingReconcileCount reaches 0 or below 3, producer missingPublishedCount drops below 4, snapshotCoverage moves toward 5/5, durable published membership includes more of the active cohort, or canonical extraction migrates to a narrower owner boundary with concrete next action.",
    "maxProgressBound": "one startup_active_gate_owner / snapshot_coverage package slice; no timeout increases, active-gate admission relaxation, diagnostics-only success path, or workflow-progress implementation without canonical promotion",
    "sameFrontierFallback": "If active_gate_snapshot_coverage remains red after focused proof, record whether producer seed-only publication visibility, consumer handoff reconcile debt, or snapshot observation remains local before opening another runtime slice.",
    "expectedNextFrontier": "readiness_startup_support after active-gate coverage improves, otherwise same-frontier active-gate evidence",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md / startup_active_gate_owner / snapshot_coverage / same-frontier",
      "work/packages/done-20260515-publication-active-gate-reconcile-bridge-simplification.md / startup_active_gate_owner / publication_reconcile_bridge / same-frontier-reduced"
    ],
    "oscillationCheck": "workflow_progress is parked because the latest priority-recovery residual extraction reports zero witnesses and topology/causal summaries keep active_gate_snapshot_coverage first.",
    "handoffInvariant": "Active-gate admission stays strict while runtimePromotionAllowed=false; publication handoff truth remains owned by the canonical contract."
  },
  "predecessor": "work/packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md"
}
-->

## Why

The seed publication visibility proof made a real reduction, but it did not
make the representative gate green. The latest artifact still has a seed-only
producer publication convergence surface and active-gate snapshot coverage
`2/5`, while the consumer handoff contract now shows only three pending
reconcile nodes and no workflow-progress residual witnesses.

This package owns the remaining same-frontier proof. It must identify why the
producer publication surface remains seed-only after the owner readback path can
return and carry a widened publication row, without relaxing active-gate
admission or shifting to workflow-progress work without canonical promotion.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, especially topology workflow
stabilization and production guarantees.

Edition scope: Community / AGPL repo only. No Pro or Enterprise behavior is in
scope.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the original representative scenario remains
  red after a focused reduction, and this package must prove the next causal
  edge before widening runtime scope.
- Escalation trigger to a heavier lane: canonical evidence promotes workflow
  progress, publication convergence, readiness support, or an architecture stop
  ahead of startup active-gate snapshot coverage.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260515-startup-active-gate-remaining-publication-lag-proof.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

## Out Of Scope

1. timeout increases
2. active-gate admission relaxation while runtimePromotionAllowed=false
3. workflow-progress implementation unless canonical extractors promote it
4. broad diagnostics-only success path
5. Pro or Enterprise behavior

## Subagent Sequencing Ledger

Required before implementation because this is a causal-escalation runtime
owner-boundary package.

- [ ] Review subagent recorded: pending-before-implementation-resumes
- [ ] Fix subagent recorded or explicitly not needed: pending-on-review-result
- [ ] Implementation subagent recorded: pending-on-clean-review

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260515-startup-active-gate-remaining-publication-lag-proof.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `timeout increases`, `active-gate admission relaxation while runtimePromotionAllowed=false`, `workflow-progress implementation unless canonical extractors promote it`, `broad diagnostics-only success path`, `Pro or Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:llm-start`, `npm run work:package:doctor -- --suggest work/packages/active-20260515-startup-active-gate-remaining-publication-lag-proof.md`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --markdown`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:llm-start
3. npm run work:package:doctor -- --suggest work/packages/active-20260515-startup-active-gate-remaining-publication-lag-proof.md
4. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json
5. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --handoff-probe
6. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json
7. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --markdown
8. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
