# Startup Active Gate Remaining Publication Lag Proof

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Implemented the focused diagnostics fallback selector. Stale seed-only readiness publication diagnostics no longer override a newer or wider durable published fallback when readiness has no owner recovery evidence. Focused admin tests and static guardrails pass. The representative rolling-restart rerun remains red on active_gate_snapshot_coverage, but the consumer handoff is reduced from pendingReconcileCount=3 to pendingReconcileCount=1 for 35a891b8-c1a0-5064-9c6e-2acfba61c2a7; producer publishedActiveNodeIds remains seed-only with missingPublishedCount=4, snapshot coverage stays 2/5, and priority-recovery residual extraction reports one subordinate workflow_progress witness.",
  "nextAction": "Close this package as reduced evidence after committing and pushing the focused slice. The next bounded startup_active_gate_owner / snapshot_coverage package must start by completing the causal edge table for the final pending owner reconcile target before any runtime file is promoted.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:package:doctor -- --suggest work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --markdown",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "npm run work:validate -- --pre-impl work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md",
    "node scripts/check-guideline-literals.js src/admin/admin-control-snapshot-readiness-diagnostics-methods.js test/admin/admin-control-snapshot.test.js",
    "node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-readiness-diagnostics-methods.js",
    "npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-readiness-diagnostics-methods.js",
    "npx tap --grep \"AdminControlSnapshot (uses authoritative published fallback when readiness has stale seed-only publication|carries authoritative published fallback through local snapshot diagnostics|keeps the latest published membership when readiness surfaces a newer open publication|preserves awaited handoff reconcile observation before stale diagnostics reads)\" test/admin/admin-control-snapshot.test.js",
    "git diff --check -- src/admin/admin-control-snapshot-readiness-diagnostics-methods.js test/admin/admin-control-snapshot.test.js work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --markdown",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/admin/admin-control-snapshot-readiness-diagnostics-methods.js",
    "test/admin/admin-control-snapshot.test.js"
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
    "src/admin/admin-control-snapshot-readiness-diagnostics-methods.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/admin/admin-control-snapshot-readiness-diagnostics-methods.js",
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
    "artifact": "test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Continue with startup_active_gate_owner / snapshot_coverage. The diagnostics fallback selector reduced consumer pendingReconcileCount from 3 to 1, but producer publishedActiveNodeIds remains seed-only with missingPublishedCount=4 and runtimePromotionAllowed=false."
  },
  "causalGovernance": {
    "hypothesis": "The active-gate owner still observes seed-only producer publication visibility because the final publication owner surface selected by topology convergence is not the same durable row returned by the awaited reconcile, and the remaining pending target is the owner/snapshot-source node rather than a stale diagnostics fallback selection.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json",
    "expectedCausalModelChange": "Focused proof reduced consumer pendingReconcileCount from 3 to 1 but did not make rolling-restart green or migrate the first frontier. The next package must explain why the final pending owner reconcile target remains outside durable publication and selected snapshot coverage.",
    "representativeOutcome": "reduced",
    "causalDebt": "The diagnostics selector now prefers the authoritative published fallback over stale seed-only readiness diagnostics when readiness has no owner recovery evidence, but the producer publication convergence surface still reports seed-only durable membership and active-gate snapshot coverage 2/5.",
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
    "currentFirstFrontier": "active_gate_snapshot_coverage remains the first representative frontier in test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "producer publication convergence still reports publishedActiveNodeIds as seed-only and missingPublishedCount=4",
      "consumer handoff contract is narrowed to pendingReconcileCount=1 for 35a891b8-c1a0-5064-9c6e-2acfba61c2a7 and runtimePromotionAllowed=false",
      "selected snapshot coverage remains 2/5 with repair_deferred/stale_usable/pending/idle/wait and cache_stale_watermark",
      "priority-recovery residual extraction reports one subordinate operation_workflow_owner / workflow_progress witness, but work:evidence-summary and causal-model still keep active_gate_snapshot_coverage as first frontier"
    ],
    "missingCausalEdge": "The next package must use the causal edge table to prove whether the final pending owner reconcile target remains outside durable publication, active-gate snapshot observation samples the wrong surface, or workflow_progress has become causal after stale readiness publication diagnostics no longer win over a newer or wider durable fallback.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --handoff-probe",
    "boundedProgressProof": "Focused source proof moved publication diagnostic selection to one explicit decision table and preserved readiness-owned priority recovery evidence. The representative rerun reduced the reconcile mechanism from pendingReconcileCount=3 to pendingReconcileCount=1; active-gate admission remained strict while runtimePromotionAllowed=false.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json",
    "expectedObservableTransition": "Partially achieved: consumer pendingReconcileCount reduced from 3 to 1, but producer missingPublishedCount stayed 4, snapshotCoverage stayed 2/5, and durable published membership stayed seed-only.",
    "maxProgressBound": "one startup_active_gate_owner / snapshot_coverage package slice; no timeout increases, active-gate admission relaxation, diagnostics-only success path, or workflow-progress implementation without canonical promotion",
    "sameFrontierFallback": "active_gate_snapshot_coverage remains red after focused proof with consumer pendingReconcileCount=1, pending node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7, producer missingPublishedCount=4, snapshotCoverage=2/5, and seed-only publishedActive membership. The next package must classify producer truth, active-gate observation, and workflow_progress in one causal edge table before runtime edits.",
    "expectedNextFrontier": "readiness_startup_support after active-gate coverage improves, otherwise same-frontier active-gate evidence",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md / startup_active_gate_owner / snapshot_coverage / same-frontier",
      "work/packages/done-20260515-publication-active-gate-reconcile-bridge-simplification.md / startup_active_gate_owner / publication_reconcile_bridge / same-frontier-reduced"
    ],
    "oscillationCheck": "workflow_progress reappears as one subordinate residual witness, but topology and causal summaries still keep active_gate_snapshot_coverage first; do not implement workflow_progress from this package without owner-boundary migration proof.",
    "handoffInvariant": "Active-gate admission stays strict while runtimePromotionAllowed=false; publication handoff truth remains owned by the canonical contract."
  },
  "predecessor": "work/packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md",
  "closed": "2026-05-15",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The seed publication visibility proof made a real reduction, but it did not
make the representative gate green. This package proved the next bounded edge:
when readiness diagnostics are stale and seed-only, active-gate publication
diagnostics should choose a newer or wider durable published fallback unless
readiness carries owner recovery evidence.

The focused proof reduces the representative handoff debt from three pending
reconcile nodes to one. The gate remains red on the same first frontier, so the
remaining work belongs in the next startup-active-gate snapshot-coverage slice.

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

1. work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/admin/admin-control-snapshot-readiness-diagnostics-methods.js
7. test/admin/admin-control-snapshot.test.js

## Out Of Scope

1. timeout increases
2. active-gate admission relaxation while runtimePromotionAllowed=false
3. workflow-progress implementation unless canonical extractors promote it
4. broad diagnostics-only success path
5. Pro or Enterprise behavior

## Subagent Sequencing Ledger

Required before implementation because this is a causal-escalation runtime
owner-boundary package.

- [x] Review subagent recorded: Agent Codex (019e2d39-60a4-7572-aa7e-a8bcb390519d) reviewed work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md; result fixes-required
- [x] Fix subagent recorded or explicitly not needed: Agent Bacon (019e2d3c-166f-7fe0-b415-765a5075347d) fixed work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md
- [x] Implementation subagent recorded: Agent Codex (019e2d3f-3bf2-7ca3-8953-898c94880bf7) implemented work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/admin/admin-control-snapshot-readiness-diagnostics-methods.js`, `test/admin/admin-control-snapshot.test.js`
- Forbidden files: `timeout increases`, `active-gate admission relaxation while runtimePromotionAllowed=false`, `workflow-progress implementation unless canonical extractors promote it`, `broad diagnostics-only success path`, `Pro or Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:llm-start`, `npm run work:package:doctor -- --suggest work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --markdown`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`, `npx tap --grep "AdminControlSnapshot (uses authoritative published fallback when readiness has stale seed-only publication|carries authoritative published fallback through local snapshot diagnostics|keeps the latest published membership when readiness surfaces a newer open publication|preserves awaited handoff reconcile observation before stale diagnostics reads)" test/admin/admin-control-snapshot.test.js`, `node scripts/check-guideline-literals.js src/admin/admin-control-snapshot-readiness-diagnostics-methods.js test/admin/admin-control-snapshot.test.js`, `node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-readiness-diagnostics-methods.js`, `npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-readiness-diagnostics-methods.js`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --fast-local --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --markdown`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:llm-start
3. npm run work:package:doctor -- --suggest work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md
4. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json
5. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --handoff-probe
6. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json
7. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-seed-publication-visibility-proof-20260515-codex.report.json --markdown
8. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
9. npm run work:validate -- --pre-impl work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md
10. node scripts/check-guideline-literals.js src/admin/admin-control-snapshot-readiness-diagnostics-methods.js test/admin/admin-control-snapshot.test.js
11. node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-readiness-diagnostics-methods.js
12. npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-readiness-diagnostics-methods.js
13. npx tap --grep "AdminControlSnapshot (uses authoritative published fallback when readiness has stale seed-only publication|carries authoritative published fallback through local snapshot diagnostics|keeps the latest published membership when readiness surfaces a newer open publication|preserves awaited handoff reconcile observation before stale diagnostics reads)" test/admin/admin-control-snapshot.test.js
14. git diff --check -- src/admin/admin-control-snapshot-readiness-diagnostics-methods.js test/admin/admin-control-snapshot.test.js work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
15. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --fast-local --verbose
16. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json
17. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --handoff-probe
18. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json
19. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --markdown
20. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json

## Evidence

Focused owner proof is green. The admin snapshot selector now chooses the
authoritative durable published fallback when readiness has stale seed-only
publication diagnostics and no owner recovery evidence, and it preserves
readiness-owned priority recovery evidence when that owner signal exists.

Representative proof is reduced, not green. The rerun artifact
`test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json`
still selects `active_gate_snapshot_coverage`, with producer published
membership seed-only, producer `missingPublishedCount=4`, and snapshot coverage
`2/5`. The consumer handoff narrowed from three pending reconcile nodes to one
pending node, `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`.

Full `npx tap test/admin/admin-control-snapshot.test.js` remains red on
pre-existing priority-recovery expectation drift outside this package's owner
path. The focused admin tests and static guardrails for the touched files pass.

## Causal Edge Table

This table is the handoff for the next package. It prevents another local
bridge patch by forcing the next runtime edit to name one causal owner before
promoting files from `candidateRuntimeFiles`.

| Surface | Expected truth | Observed truth | Owner / boundary | Fresh or stale | Evidence command | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| Producer publication durable truth | Published active membership includes the expected active cohort. | `publishedActiveNodeIds` remains seed-only; `missingPublishedCount=4`. | `topology_publication_owner / publication_convergence` | unresolved; producer surface is still seed-only after consumer reduction | `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --handoff-probe` | If this surface is the source of truth, fix publication owner write/read visibility rather than active-gate observation. |
| Active-gate observation | Active-gate consumes the same durable cohort and reaches `snapshotCoverage=5/5`. | `snapshotCoverage=2/5`; consumer `pendingReconcileCount=1` for `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`; `runtimePromotionAllowed=false`. | `startup_active_gate_owner / snapshot_coverage` | partially fresh; consumer debt reduced but final target remains pending | `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json` | If producer truth is correct but this surface is stale, fix active-gate sampling or projection. |
| Workflow progress | Workflow evidence remains subordinate unless it blocks publication visibility or active-gate sampling. | One `operation_workflow_owner / workflow_progress` witness on `control_plane_publications-p1`, semantic state `spread_satisfied_in_flight`. | `operation_workflow_owner / workflow_progress` | subordinate in canonical topology and causal summaries | `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --markdown` | Keep parked unless the next package records `ownerBoundaryMigrationProof` showing workflow progress is causal. |

## Next Package Gate

The next runtime package may promote runtime files only after it completes the
causal edge table with fresh evidence from its entry artifact.

Decision rules:

1. If durable publication truth is seed-only, fix publication owner write or
   read visibility.
2. If durable publication truth is correct but active-gate sees seed-only or
   pending state, fix active-gate sampling or projection.
3. If workflow progress blocks either visibility path, record
   `ownerBoundaryMigrationProof` before activating workflow-progress work.
4. If the three surfaces cannot identify one causal owner, stop runtime edits
   and open a causal handoff or architecture package.

Runtime `writeScope` in the next package must match the owner selected by this
table. No package should patch another admin/diagnostic bridge unless the table
proves that bridge is the canonical owner path.

## Commit And Push Ledger

Required at closure.

1. [x] Focused package commit: fdaa5fcee9e3a56e71a22c7805f3b5e7840d6c84.
2. [x] Pushed to: origin/codex/pending-ack-eligibility-filter.
3. [x] Commit contains only package-owned files/package-status/allowed sprint handoff: yes.
