# Startup Active Gate Seed Publication Visibility Proof

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Implemented the focused seed publication visibility slice. The coordinator now returns the durable publication readback row for explicit handoff targets, and admin snapshots carry an awaited published handoff reconcile observation ahead of stale diagnostics reads. Focused tests and guardrails are green. The representative rolling-restart rerun remains red on active_gate_snapshot_coverage, but the handoff probe reduced pendingReconcileCount from 4 to 3 and priority-recovery residual witnesses from 3 to 0.",
  "nextAction": "Close this package as same-frontier-reduced evidence. Continue with a new bounded startup_active_gate_owner / snapshot_coverage slice on the remaining active-gate publication lag: producer publication visibility still reports seed-only durable published membership and missingPublishedCount=4, while the consumer handoff now has pendingReconcileCount=3 and runtimePromotionAllowed=false.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:package:doctor -- --suggest work/packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json --markdown",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "npx tap test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "npx tap --grep \"AdminControlSnapshot (build snapshot forwards handoff pending reconcile target|preserves awaited handoff reconcile observation before stale diagnostics reads)\" test/admin/admin-control-snapshot.test.js",
    "node scripts/check-guideline-literals.js src/control-plane/membership-publication-coordinator-class-stage-2.js src/admin/admin-control-snapshot-class-part-6.js",
    "node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-coordinator-class-stage-2.js src/admin/admin-control-snapshot-class-part-6.js",
    "npm run audit:runtime-grammar:file -- src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-6.js",
    "git diff --check -- src/control-plane/membership-publication-coordinator-class-stage-2.js src/admin/admin-control-snapshot-class-part-6.js test/control-plane/membership-publication-coordinator-main-stage-2.js test/admin/admin-control-snapshot.test.js work/packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md work/sprints/current-blocker.md work/sprints/current-blocker.json",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --markdown",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md",
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-publication-active-gate-reconcile-bridge-simplification.md"
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
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md",
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/admin/admin-control-snapshot.test.js"
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
    "nextAction": "Continue with startup_active_gate_owner / snapshot_coverage. Focused publication readback observation carry reduced the consumer handoff to pendingReconcileCount=3 and removed workflow_progress residual witnesses, but durable published membership is still seed-only and runtimePromotionAllowed=false."
  },
  "causalGovernance": {
    "hypothesis": "The active-gate owner still observes seed-only durable published membership because the reconciled publication target is not becoming consumer-visible before the active-gate snapshot owner samples coverage, or because canonical evidence should now promote the subordinate workflow-progress witness.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json",
    "expectedCausalModelChange": "Focused proof reduced the handoff consumer debt but did not make rolling-restart green or migrate the first frontier. The next package must explain the remaining seed-only producer visibility versus three-node consumer reconcile debt.",
    "representativeOutcome": "reduced",
    "causalDebt": "The awaited publication readback row is now returned and carried through the admin observation bridge, but the representative producer surface still reports seed-only durable published membership and active-gate snapshot coverage 2/5.",
    "crossBoundaryReview": "Do not edit runtime files until review/fix proof is clean and exact runtime write-scope promotion is recorded."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / seed-only durable membership publication visibility after final reconcile readback",
    "phaseChain": [
      "consume final reconcile readback same-frontier proof",
      "rerun canonical evidence on the final readback artifact",
      "prove whether publication owner write visibility, active-gate snapshot observation, or workflow_progress owns the next progress edge",
      "promote exact runtime files only after review/fix proof",
      "prove focused owner behavior and representative rolling-restart"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage remains the first representative frontier in test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "publication handoff remains pending with pendingReconcileCount=3 and runtimePromotionAllowed=false on the consumer handoff contract",
      "publishedActiveNodeIds remains seed-only while missingPublishedCount=4",
      "selected snapshot coverage is 2/5 with repair_deferred/deferred_refresh/deferred/deferred/retry",
      "priority-recovery residual extraction reports zero workflow_progress witnesses, so the parked workflow package remains inactive"
    ],
    "missingCausalEdge": "The package must prove whether awaited publication reconcile writes are not durable-visible, active-gate snapshot observation is sampling the wrong publication surface, or workflow_progress has become the true promoted owner boundary.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json --handoff-probe",
    "boundedProgressProof": "Focused source proof returned the durable readback publication row from the coordinator and carried the awaited admin reconcile observation ahead of stale diagnostics reads; active-gate admission remained strict while runtimePromotionAllowed=false.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json",
    "expectedObservableTransition": "Partially achieved: pendingReconcileCount reduced from 4 to 3 and workflow_progress residual witnesses dropped from 3 to 0, but snapshotCoverage stayed 2/5 and producer durable published membership stayed seed-only.",
    "maxProgressBound": "one startup_active_gate_owner / snapshot_coverage package slice; no timeout increases, active-gate admission relaxation, diagnostics-only success path, or workflow-progress implementation without canonical promotion",
    "sameFrontierFallback": "active_gate_snapshot_coverage remains red after focused proof with consumer pendingReconcileCount=3, producer missingPublishedCount=4, snapshotCoverage=2/5, seed-only publishedActive, and zero workflow_progress residual witnesses.",
    "expectedNextFrontier": "readiness_startup_support after active-gate coverage improves, otherwise same-frontier active-gate evidence",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md / startup_active_gate_owner / snapshot_coverage / same-frontier",
      "work/packages/done-20260515-publication-active-gate-reconcile-bridge-simplification.md / startup_active_gate_owner / publication_reconcile_bridge / same-frontier-reduced",
      "work/packages/done-20260515-rolling-restart-canonical-frontier-steering-repair.md / startup_active_gate_owner / snapshot_coverage / classification-only"
    ],
    "oscillationCheck": "workflow_progress is no longer visible in priority-recovery residual extraction; do not implement it from this package without a future canonical owner-boundary migration.",
    "handoffInvariant": "Active-gate admission stays strict while runtimePromotionAllowed=false; publication handoff truth remains owned by the canonical contract."
  },
  "predecessor": "work/packages/done-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md",
  "closed": "2026-05-15",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The final reconcile readback package tightened the admin catch-up bridge, but
the representative gate still observed seed-only durable publication
visibility. This package proved the next bounded edge: the publication
coordinator must return the durable write/readback row for explicit handoff
targets, and the admin snapshot owner must carry that awaited reconcile
observation before consulting stale diagnostics reads.

The focused proof reduced the representative handoff debt from four pending
reconcile nodes to three and removed the parked workflow-progress witnesses.
The gate remains red on the same first frontier, so the remaining work belongs
in the next startup-active-gate snapshot-coverage slice.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, especially topology workflow
stabilization and production guarantees.

Edition scope: Community / AGPL repo only. No Pro or Enterprise behavior is in
scope.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the original representative scenario remains
  red after a focused same-frontier package, and this package must prove the
  next causal edge before widening runtime scope.
- Escalation trigger to a heavier lane: canonical evidence promotes
  workflow_progress, publication convergence, readiness support, or an
  architecture stop ahead of startup active-gate snapshot coverage.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md
2. work/packages/done-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md
3. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
4. work/sprints/current-blocker.md
5. work/sprints/current-blocker.json
6. work/model-ledger.jsonl
7. `src/control-plane/membership-publication-coordinator-class-stage-2.js`,
   promoted after the proof localized the awaited reconcile result to the
   owner publication write/readback path.
8. `src/admin/admin-control-snapshot-class-part-6.js`, promoted after the
   proof localized the stale seed-only observation to the admin publication
   observation bridge after handoff reconcile.
9. `test/control-plane/membership-publication-coordinator-main-stage-2.js`,
   promoted for the focused owner-path regression around returning the
   persisted publication row.
10. `test/admin/admin-control-snapshot.test.js`, promoted for the focused
   consumer regression around preserving the awaited handoff reconcile
   observation across the deferred snapshot rebuild.

## Out Of Scope

1. timeout increases
2. active-gate admission relaxation while runtimePromotionAllowed=false
3. workflow-progress implementation unless canonical extractors promote it
4. broad diagnostics-only success path
5. Pro or Enterprise behavior

## Subagent Sequencing Ledger

Required before implementation because this is a causal-escalation runtime
owner-boundary package.

- [x] Review subagent recorded: Agent Laplace (019e2d18-978d-7f11-ae07-752c58250da3) reviewed work/packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Codex (019e2d1a-6841-7060-82f7-7de60ca8846c) fixed work/packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md.
- [x] Implementation subagent recorded: Agent Codex (019e2d25-e2c8-7da1-89e7-430ff3852147) implemented work/packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md`, `work/packages/done-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/membership-publication-coordinator-class-stage-2.js`, `src/admin/admin-control-snapshot-class-part-6.js`, `test/control-plane/membership-publication-coordinator-main-stage-2.js`, `test/admin/admin-control-snapshot.test.js`
- Forbidden files: `timeout increases`, `active-gate admission relaxation while runtimePromotionAllowed=false`, `workflow-progress implementation unless canonical extractors promote it`, `broad diagnostics-only success path`, `Pro or Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:llm-start`, `npm run work:package:doctor -- --suggest work/packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json --markdown`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:llm-start
3. npm run work:package:doctor -- --suggest work/packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md
4. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json
5. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json --handoff-probe
6. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json
7. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json --markdown
8. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
9. npx tap test/control-plane/membership-publication-coordinator-main-stage-2.js
10. npx tap --grep "AdminControlSnapshot (build snapshot forwards handoff pending reconcile target|preserves awaited handoff reconcile observation before stale diagnostics reads)" test/admin/admin-control-snapshot.test.js
11. node scripts/check-guideline-literals.js src/control-plane/membership-publication-coordinator-class-stage-2.js src/admin/admin-control-snapshot-class-part-6.js
12. node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-coordinator-class-stage-2.js src/admin/admin-control-snapshot-class-part-6.js
13. npm run audit:runtime-grammar:file -- src/control-plane/membership-publication-coordinator-class-stage-2.js
14. npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-6.js
15. git diff --check -- src/control-plane/membership-publication-coordinator-class-stage-2.js src/admin/admin-control-snapshot-class-part-6.js test/control-plane/membership-publication-coordinator-main-stage-2.js test/admin/admin-control-snapshot.test.js work/packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md work/sprints/current-blocker.md work/sprints/current-blocker.json
16. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --fast-local --verbose
17. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json
18. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --handoff-probe
19. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json
20. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --markdown
21. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json

## Evidence

Focused owner proof is green. The coordinator test proves explicit handoff
targets are persisted and returned from diagnostics-grade owner readback. The
admin snapshot test proves the awaited handoff reconcile observation is
consumed before stale publication list reads. Runtime grammar, literal, and
decision-boundary guardrails pass for the touched runtime files.

Representative proof is same-frontier-reduced, not green. The rerun artifact
`test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json`
still selects `active_gate_snapshot_coverage`, with snapshot coverage `2/5`,
producer published membership still seed-only, and producer
`missingPublishedCount=4`. The consumer handoff narrowed from four pending
reconcile nodes to three, and `analyze:priority-recovery-residuals` now reports
zero workflow-progress witnesses.

## Commit And Push Ledger

Required at closure.

1. [x] Focused package commit: 3299310dd1d267372223c8998b26f3a103187fe8.
2. [x] Pushed to: origin/codex/pending-ack-eligibility-filter.
3. [x] Commit contains only package-owned files/package-status/allowed sprint handoff: yes.
