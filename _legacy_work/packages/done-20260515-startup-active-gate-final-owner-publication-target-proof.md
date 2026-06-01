# Startup Active Gate Final Owner Publication Target Proof

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Implemented the active-gate-observation selector fix so authoritative handoff reconcile fallback can override stale readiness owner-recovery publication only when it covers the handoff target. The representative rerun reduced startup state: all five nodes reached ACTIVE, but active_gate_snapshot_coverage remains red with snapshot coverage 2/5, selected producer membership still seed-only, repair_deferred/deferred_refresh, and the handoff narrowed to pendingReconcileCount=1 for 11601fe0-72d6-5853-8590-ec2881853e72.",
  "nextAction": "Close this package as reduced, commit and push the focused slice, then open a successor package on the remaining startup_active_gate_owner / snapshot_coverage publication visibility target for 11601fe0-72d6-5853-8590-ec2881853e72.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:package:doctor -- --suggest work/packages/done-20260515-startup-active-gate-final-owner-publication-target-proof.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --markdown",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "node scripts/check-guideline-literals.js src/admin/admin-control-snapshot-class-part-5.js src/admin/admin-control-snapshot-readiness-diagnostics-methods.js test/admin/admin-control-snapshot.test.js",
    "node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-readiness-diagnostics-methods.js",
    "npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-5.js src/admin/admin-control-snapshot-readiness-diagnostics-methods.js",
    "npx tap --grep \"keeps priority recovery readiness ahead|uses authoritative handoff reconcile fallback|uses authoritative published fallback|carries authoritative published fallback\" test/admin/admin-control-snapshot.test.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --markdown",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json"
  ],
  "writeScope": [
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-readiness-diagnostics-methods.js",
    "test/admin/admin-control-snapshot.test.js",
    "work/packages/done-20260515-startup-active-gate-final-owner-publication-target-proof.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md"
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
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-readiness-diagnostics-methods.js",
    "test/admin/admin-control-snapshot.test.js",
    "work/packages/done-20260515-startup-active-gate-final-owner-publication-target-proof.md",
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
      "runtime ownership changes",
      "representative scenario evidence changes"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Open the successor active-gate snapshot coverage slice on the remaining publication visibility target 11601fe0-72d6-5853-8590-ec2881853e72."
  },
  "causalGovernance": {
    "hypothesis": "The final pending owner publication target remains red because either producer durable publication truth is still seed-only, active-gate observation samples a stale projection despite durable truth, or the subordinate workflow_progress witness blocks publication visibility and must be promoted with owner-boundary proof.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
    "expectedCausalModelChange": "Focused proof either makes rolling-restart green, drains pendingReconcileCount to 0, reduces producer missingPublishedCount or snapshotCoverage debt, migrates to topology_publication_owner/publication_convergence or operation_workflow_owner/workflow_progress with owner-boundary proof, or records a same-frontier causal table that names the next bounded owner.",
    "representativeOutcome": "reduced",
    "causalDebt": "This slice proved the stale readiness owner-recovery masking edge and reduced startup progress to all five nodes ACTIVE, but selected producer membership remains seed-only, snapshot coverage remains 2/5, and the remaining handoff reconcile target is 11601fe0-72d6-5853-8590-ec2881853e72.",
    "crossBoundaryReview": "Review/fix proof is clean. Runtime promotion is active-gate-observation: the selected diagnostics still prefer stale readiness over the carried authoritative handoff reconcile publication when readiness has owner recovery evidence."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / final pending owner publication target after diagnostics fallback proof",
    "phaseChain": [
      "consume diagnostics fallback reduced proof",
      "rerun canonical evidence on the latest artifact",
      "complete the causal edge table for producer truth, active-gate observation, and workflow_progress",
      "promote exact runtime files only after review/fix proof and owner selection",
      "prove focused owner behavior and representative rolling-restart"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage remains the first representative frontier in test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "producer publication convergence still reports publishedActiveNodeIds as seed-only and missingPublishedCount=4",
      "consumer handoff contract is narrowed to pendingReconcileCount=1 for 11601fe0-72d6-5853-8590-ec2881853e72 and runtimePromotionAllowed=false",
      "selected snapshot coverage remains 2/5 with repair_deferred/deferred_refresh/deferred/deferred/retry and cache_stale_watermark|discovery_node_coverage_gap|stale_replica_operations_in_flight",
      "priority-recovery residual extraction reports three subordinate operation_workflow_owner / workflow_progress witnesses on control_plane_publications-p1, replica_operations-p1, and sql_transaction_participants-p1"
    ],
    "missingCausalEdge": "This package must prove whether the final pending owner reconcile target is caused by producer publication durable truth, active-gate snapshot observation, or promoted workflow progress before any runtime edit.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --handoff-probe",
    "boundedProgressProof": "Implemented the active-gate-observation selector path and proved a same-frontier reconcile reduction; the successor must continue with the bounded owner reconcile retry while active-gate admission remains strict and runtimePromotionAllowed=false.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
    "expectedObservableTransition": "Representative evidence moved from active=2/5 to active=5/5 and changed the single handoff pending target from 35a891b8-c1a0-5064-9c6e-2acfba61c2a7 to 11601fe0-72d6-5853-8590-ec2881853e72; producer missingPublishedCount remains 4 and snapshotCoverage remains 2/5.",
    "maxProgressBound": "one startup_active_gate_owner / snapshot_coverage package slice unless the causal edge table records owner-boundary migration proof; no timeout increases, active-gate admission relaxation, diagnostics-only success path, or workflow-progress implementation without canonical promotion",
    "sameFrontierFallback": "active_gate_snapshot_coverage remains red after a focused reduction; the next package must start from test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json and prove why 11601fe0-72d6-5853-8590-ec2881853e72 is still outside selected publication coverage.",
    "expectedNextFrontier": "readiness_startup_support after active-gate coverage improves, otherwise same-frontier active-gate evidence or a canonical owner-boundary migration",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260515-publication-active-gate-reconcile-bridge-simplification.md / startup_active_gate_owner / publication_reconcile_bridge / same-frontier-reduced"
    ],
    "oscillationCheck": "workflow_progress is visible as three subordinate residual witnesses but is not first frontier in topology or causal summaries; do not implement it without ownerBoundaryMigrationProof.",
    "handoffInvariant": "Active-gate admission stays strict while runtimePromotionAllowed=false; publication handoff truth remains owned by the canonical contract."
  },
  "predecessor": "work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md",
  "closed": "2026-05-15",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The active-gate observation selector package made a real reduction, but the
representative gate is still red. The latest artifact keeps
`active_gate_snapshot_coverage` as the first frontier with snapshot coverage
`2/5`, producer published membership still seed-only, all five nodes active,
and one remaining consumer handoff reconcile target:
`11601fe0-72d6-5853-8590-ec2881853e72`.

This package proved the active-gate-observation edge and reduced the
representative state. The remaining red state must continue in a successor
package so this package can close with focused proof and commit containment.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, especially topology workflow
stabilization and production guarantees.

Edition scope: Community / AGPL repo only. No Pro or Enterprise behavior is in
scope.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the representative scenario remains red on the
  same first frontier after a focused reduction, and this package must prove
  the next causal edge before runtime scope expands.
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

1. work/packages/done-20260515-startup-active-gate-final-owner-publication-target-proof.md
2. src/admin/admin-control-snapshot-class-part-5.js
3. src/admin/admin-control-snapshot-readiness-diagnostics-methods.js
4. test/admin/admin-control-snapshot.test.js
5. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
6. work/sprints/current-blocker.md
7. work/sprints/current-blocker.json
8. work/model-ledger.jsonl

## Out Of Scope

1. timeout increases
2. active-gate admission relaxation while runtimePromotionAllowed=false
3. workflow-progress implementation unless canonical extractors promote it
4. broad diagnostics-only success path
5. Pro or Enterprise behavior

## Subagent Sequencing Ledger

Required before implementation because this is a causal-escalation runtime
owner-boundary package.

- [x] Review subagent recorded: Agent Averroes (019e2d5a-46a5-7fd3-b3d9-5818a941ddc2) reviewed work/packages/done-20260515-startup-active-gate-final-owner-publication-target-proof.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Huygens (019e2d5e-5e21-75a2-8bc2-a60e899323ab) fixed work/packages/done-20260515-startup-active-gate-final-owner-publication-target-proof.md.
- [x] Implementation subagent recorded: Agent Dalton (019e2d64-0544-7640-8654-5179dea00413) implemented work/packages/done-20260515-startup-active-gate-final-owner-publication-target-proof.md.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `src/admin/admin-control-snapshot-class-part-5.js`, `src/admin/admin-control-snapshot-readiness-diagnostics-methods.js`, `test/admin/admin-control-snapshot.test.js`, `work/packages/done-20260515-startup-active-gate-final-owner-publication-target-proof.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `timeout increases`, `active-gate admission relaxation while runtimePromotionAllowed=false`, `workflow-progress implementation unless canonical extractors promote it`, `broad diagnostics-only success path`, `Pro or Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: canonical evidence on `test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json`; focused guideline/runtime checks and targeted admin tests; representative rerun to `test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json`; canonical evidence on the new artifact.
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:llm-start
3. npm run work:package:doctor -- --suggest work/packages/done-20260515-startup-active-gate-final-owner-publication-target-proof.md
4. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json
5. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --handoff-probe
6. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json
7. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --markdown
8. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json
9. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
10. node scripts/check-guideline-literals.js src/admin/admin-control-snapshot-class-part-5.js src/admin/admin-control-snapshot-readiness-diagnostics-methods.js test/admin/admin-control-snapshot.test.js
11. node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-readiness-diagnostics-methods.js
12. npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-5.js src/admin/admin-control-snapshot-readiness-diagnostics-methods.js
13. npx tap --grep "keeps priority recovery readiness ahead|uses authoritative handoff reconcile fallback|uses authoritative published fallback|carries authoritative published fallback" test/admin/admin-control-snapshot.test.js
14. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --fast-local --verbose
15. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json
16. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --handoff-probe
17. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json
18. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --markdown
19. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json

## Causal Edge Table

Complete this table before promoting runtime files from `candidateRuntimeFiles`
into `writeScope`.

| Surface | Expected truth | Observed truth | Owner / boundary | Evidence command | Runtime promotion rule |
| --- | --- | --- | --- | --- | --- |
| Producer durable publication truth | Published active membership includes the owner target and expected active cohort. | Still `publishedActiveNodeIds` seed-only with `missingPublishedCount=4`; representative reduction proves selected admin observation advanced startup activity but not final publication coverage. | `topology_publication_owner / publication_convergence` | `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --handoff-probe` | Leave publication owner files for the successor slice; this slice is complete as an admin-observation reduction. |
| Active-gate observation | Active-gate consumes durable truth and reaches full snapshot coverage. | All five nodes active; `pendingReconcileCount=1`, pending node `11601fe0-72d6-5853-8590-ec2881853e72`, snapshot coverage `2/5`, repair deferred retry. | `startup_active_gate_owner / snapshot_coverage` | `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json` | Reduced by `src/admin/admin-control-snapshot-class-part-5.js`, `src/admin/admin-control-snapshot-readiness-diagnostics-methods.js`, and `test/admin/admin-control-snapshot.test.js`; successor remains same owner/boundary. |
| Workflow progress | Workflow progress remains subordinate unless it blocks publication visibility or active-gate observation. | Three `operation_workflow_owner / workflow_progress` witnesses on `control_plane_publications-p1`, `replica_operations-p1`, and `sql_transaction_participants-p1`. | `operation_workflow_owner / workflow_progress` | `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --markdown` | Promote workflow files only with owner-boundary migration proof. |

## Runtime Promotion Gate

Selected outcome: `active-gate-observation`.

The canonical extractors prove the active-gate handoff is narrowed to one
pending reconcile target while the selected producer diagnostics remain
seed-only. A focused report/source fallback was needed because the canonical
extractors do not expose the publication row-selection decision inside admin
snapshot assembly. That review found the carried handoff reconcile publication
is available as the durable fallback, but the diagnostics selector still
prefers readiness whenever readiness has owner-recovery evidence. This slice
therefore promotes only the admin observation files needed to make the
authoritative handoff reconcile fallback win for that read path.

The review/fix/implementation sequence must refresh the evidence commands
above and record one of these outcomes before closure:

1. `producer-publication-truth`: promote only publication-owner files and fix
   durable membership publication write/read visibility.
2. `active-gate-observation`: promote only active-gate/admin observation files
   and fix stale or partial snapshot sampling after producer truth is proven
   correct.
3. `workflow-progress-migration`: record `ownerBoundaryMigrationProof` and move
   the work to the parked workflow-progress package or a narrower successor.
4. `architecture-gap`: stop runtime edits and open a causal handoff package
   when the table cannot identify a single owner.

No bridge, diagnostics, or admin projection patch is allowed unless the table
selects that path as the canonical owner mechanism.

## Commit And Push Ledger

1. Focused package commit: 1047df0c
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
