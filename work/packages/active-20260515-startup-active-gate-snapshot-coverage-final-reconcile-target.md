# Startup Active Gate Snapshot Coverage Final Reconcile Target

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Implemented the narrowed admin publication-owner reconcile readback fix. Focused admin tests and static guardrails are green, but the representative rolling-restart rerun remains same-frontier red: active_gate_snapshot_coverage is still first, snapshot coverage is 2/5, publication owner visibility remains seed-only with missingPublished=4, handoff nextAction=reconcile_owner_membership_publication has pendingReconcileCount=4, runtimePromotionAllowed=false, and priority-recovery residual extraction now reports three subordinate workflow_progress witnesses.",
  "nextAction": "Treat this package as same-frontier evidence: the admin readback contract is tightened, but durable publication visibility still does not advance in the representative gate. Continue only with a new bounded proof of why publication owner visibility remains seed-only or why workflow_progress should be promoted; do not implement workflow-progress from this package.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:package:doctor -- --suggest work/packages/active-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json --markdown",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "npm run work:subagent-prompt -- --role implementation --package work/packages/active-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md",
    "npx tap --grep \"AdminControlSnapshot (build snapshot forwards handoff pending reconcile target|repair-deferred shared owner attempts publication catch-up before returning|repair-deferred no-attempt path still attempts publication catch-up|repair-deferred shared owner skips publication catch-up for owner recovery waits|repair-deferred shared owner skips publication catch-up without pending reconcile evidence)\" test/admin/admin-control-snapshot.test.js",
    "npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-6.js",
    "node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-class-part-6.js",
    "git diff --check -- src/admin/admin-control-snapshot-class-part-6.js test/admin/admin-control-snapshot.test.js work/packages/active-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md",
    "npm run work:validate -- --pre-impl work/packages/active-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-publication-active-gate-reconcile-bridge-simplification.md",
    "work/packages/done-20260515-rolling-restart-canonical-frontier-steering-repair.md",
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-stage-2.js",
    "src/control-plane/owners/control-plane-publications-owner.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js"
  ],
  "commitScope": [
    "work/packages/active-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/admin/admin-control-snapshot-class-part-6.js",
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
    "artifact": "test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Same-frontier red after focused fix: publication owner visibility remains seed-only, pendingReconcileCount is 4, and the next proof must explain durable publication owner visibility before workflow_progress is implemented."
  },
  "causalGovernance": {
    "hypothesis": "After the bridge slice, startup_active_gate_owner / snapshot_coverage remains the first frontier because one durable membership publication target or selected snapshot coverage path still does not advance within the active-gate budget.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json",
    "expectedCausalModelChange": "Focused proof did not make rolling-restart green, reduce pendingReconcileCount, or migrate the first frontier. The package records same-frontier evidence and the next bounded proof must explain seed-only publication owner visibility.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "The admin catch-up path now requests publication write readback for handoff reconcile, but representative evidence still shows seed-only durable publication visibility and active-gate snapshot coverage 2/5. Another local patch in this package would widen beyond the proven mechanism.",
    "crossBoundaryReview": "Do not edit runtime files until review subagent proof, owner-file evidence, and exact runtime write-scope promotion are recorded."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / startup_active_gate_owner snapshot coverage after bridge simplification",
    "phaseChain": [
      "consume bridge same-frontier-reduced proof",
      "re-run canonical evidence and handoff probe on the latest artifact",
      "review final pending reconcile target and selected snapshot coverage owner files",
      "promote admin publication-owner reconcile readback files after focused proof",
      "prove focused owner behavior and representative rolling-restart"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage remains the first representative frontier in test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "publication handoff remains pending with pendingReconcileCount=4 for nodes 11601fe0-72d6-5853-8590-ec2881853e72, 35a891b8-c1a0-5064-9c6e-2acfba61c2a7, 8be8d30f-4499-5eed-865c-71b4d529a67a, and ebc4aa0b-06c6-506d-93ea-1dd2deca3f58 while runtimePromotionAllowed=false",
      "selected snapshot coverage is 2/5 with repair_deferred/deferred_refresh/deferred/deferred/retry",
      "selected snapshot observation reasons include cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight",
      "priority-recovery residual extraction reports three workflow_progress witnesses, but work:evidence-summary and causal-model still keep active_gate_snapshot_coverage as the first frontier"
    ],
    "missingCausalEdge": "The package must prove whether the final pending reconcile target is blocked by the startup active-gate snapshot owner, durable membership publication visibility, or a newly promoted owner boundary.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json --handoff-probe",
    "boundedProgressProof": "The handoff probe names reconcile_owner_membership_publication as the required progress mechanism. Focused source proof shows the admin repair-deferred catch-up passes the exact target and disables pressure deferral, but previously skipped publication write readback; the fix requires diagnostics-grade publication owner readback for that awaited reconcile while active-gate admission remains strict.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json",
    "expectedObservableTransition": "Not achieved in this package. PendingReconcileCount stayed non-zero, snapshotCoverage stayed 2/5, and canonical extraction did not migrate the first frontier.",
    "maxProgressBound": "one startup_active_gate_owner / snapshot_coverage package slice; no timeout increases, active-gate admission relaxation, diagnostics-only success path, or workflow-progress implementation without canonical promotion",
    "sameFrontierFallback": "active_gate_snapshot_coverage remains red after focused proof with pendingReconcileCount=4, snapshotCoverage=2/5, seed-only publishedActive, and subordinate workflow_progress witnesses; do not continue workflow-progress implementation from this package.",
    "expectedNextFrontier": "readiness_startup_support after active-gate coverage improves, otherwise same-frontier active-gate evidence",
    "resultClassification": "same-frontier",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260515-rolling-restart-canonical-frontier-steering-repair.md / startup_active_gate_owner / snapshot_coverage / classification-only",
      "work/packages/done-20260515-publication-active-gate-reconcile-bridge-simplification.md / startup_active_gate_owner / publication_reconcile_bridge / same-frontier-reduced"
    ],
    "oscillationCheck": "The package starts only after the bridge slice reduced the handoff; workflow_progress remains parked because canonical priority-recovery extraction reports zero witnesses.",
    "handoffInvariant": "Active-gate admission stays strict while runtimePromotionAllowed=false; publication handoff truth remains owned by the canonical contract."
  },
  "predecessor": "work/packages/done-20260515-publication-active-gate-reconcile-bridge-simplification.md"
}
-->

## Why

The bridge simplification package removed duplicate handoff target projection
and proved awaited direct owner reconcile reduces the handoff debt. The
representative gate is still red at the same first frontier:
`startup_active_gate_owner / snapshot_coverage`.

This package owns the next bounded proof surface: why one pending reconcile
target remains outside durable publication and selected snapshot coverage after
the bridge became canonical. Focused proof localized the bounded progress
mechanism to the admin repair-deferred publication-owner catch-up path: it
already selects the canonical pending reconcile target and disables pressure
deferral, but it was opting out of publication write readback. It must not
relax active-gate admission or switch to workflow-progress work unless the
canonical extractors promote that owner boundary.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, especially topology workflow
stabilization and production guarantees.

Edition scope: Community / AGPL repo only. No Pro or Enterprise behavior is in
scope.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the original representative scenario remains
  red after a focused bridge reduction, and this package must prove the next
  local owner-boundary edge before more runtime changes.
- Escalation trigger to a heavier lane: canonical evidence promotes workflow
  progress, publication convergence, readiness support, or an architecture
  stop ahead of startup active-gate snapshot coverage.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. `src/admin/admin-control-snapshot-class-part-6.js`, promoted after the
   handoff probe named `reconcile_owner_membership_publication` and focused
   source proof identified skipped publication write readback in the admin
   catch-up bridge.
7. `test/admin/admin-control-snapshot.test.js`, promoted as the direct
   consumer proof for that bridge.

## Out Of Scope

1. timeout increases
2. active-gate admission relaxation while runtimePromotionAllowed=false
3. workflow-progress implementation unless canonical extractors promote it
4. broad diagnostics-only success path

## Subagent Sequencing Ledger

Required before implementation because this is a causal-escalation runtime
owner-boundary package.

- [x] Review subagent recorded: Agent Plato (019e2cf9-e5f5-7821-a676-a56879a594f6) reviewed work/packages/active-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Peirce (019e2cfc-afdc-7310-b678-a428a0ddf964) fixed work/packages/active-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md.
- [x] Implementation subagent recorded: Agent Noether (3072b5ff-d20a-438a-ac20-ce15f3c87db1) implemented work/packages/active-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/admin/admin-control-snapshot-class-part-6.js`, `test/admin/admin-control-snapshot.test.js`
- Forbidden files: `timeout increases`, `active-gate admission relaxation while runtimePromotionAllowed=false`, `workflow-progress implementation unless canonical extractors promote it`, `broad diagnostics-only success path`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:llm-start`, `npm run work:package:doctor -- --suggest work/packages/active-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json --markdown`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Evidence

Canonical extractors were sufficient to keep the first frontier on
`startup_active_gate_owner / snapshot_coverage`: `work:evidence-summary`
selects `active_gate_snapshot_coverage`, the handoff probe reports
`requiredProgressMechanism=reconcile`, and causal model returns
`continue_local_fix`.

The representative rerun
`test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json`
is same-frontier red. It reports snapshot coverage `2/5`, published active
membership still seed-only, pending reconcile count `4`, runtime promotion
still disallowed, and priority-recovery residual extraction with three
`operation_workflow_owner / workflow_progress` witnesses. Those witnesses are
recorded as subordinate because the topology summary and causal model still
select active-gate snapshot coverage as the first frontier.

Raw fallback reason: `analyze:owner-files -- startup_active_gate_owner
snapshot_coverage --markdown` identified the historical owner boundary but did
not rank the exact runtime file for the final pending node because the relevant
owner terms are concentrated in package and sprint files. Focused source reads
inside the recorded `candidateRuntimeFiles` were needed after the canonical
extractor to identify the bounded admin catch-up readback mechanism. A focused
raw report field extraction was used after the representative rerun because the
canonical extractors did not expose the full `publicationOwnerStream` object
that proves `pendingAckEvidenceState=count_only`,
`freshnessFence=consumer_lag`, and seed-only published membership.

Promoted runtime/test files:

1. `src/admin/admin-control-snapshot-class-part-6.js`
2. `test/admin/admin-control-snapshot.test.js`

## Validation

1. npm run work:context
2. npm run work:llm-start
3. npm run work:package:doctor -- --suggest work/packages/active-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md
4. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json
5. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json --handoff-probe
6. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json
7. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json --markdown
8. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
