# Publication Active-Gate Reconcile Bridge Simplification

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "publication_reconcile_bridge",
  "dominantReason": "duplicate_handoff_reconcile_projection",
  "currentState": "Implemented the publication-active-gate reconcile bridge simplification. Canonical handoff target selection now lives in the handoff contract, broad repair-deferred snapshot rebuild catch-up is replaced by a narrow owner publication reconcile path, and awaited direct owner reconcile is preferred when the coordinator exposes it with enqueue fallback only when direct reconcile is absent. Focused bridge/admin tests pass. The representative rolling-restart run remains red on active_gate_snapshot_coverage; the handoff probe reduced pendingReconcileCount from 4 to 3 after bridge simplification and to 1 after awaited direct reconcile, with runtimePromotionAllowed=false.",
  "nextAction": "Treat the bridge package as same-frontier-reduced evidence. The next bounded owner boundary remains startup_active_gate_owner / snapshot_coverage, with publication handoff still pending for one reconcile target and priority-recovery residual extraction reporting zero witnesses; do not expand into workflow_progress unless canonical extractors promote it.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:package:doctor -- --suggest work/packages/active-20260515-publication-active-gate-reconcile-bridge-simplification.md",
    "npm run work:validate -- --entry work/packages/active-20260515-publication-active-gate-reconcile-bridge-simplification.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner publication_reconcile_bridge --markdown",
    "node --test test/control-plane/membership-publication-coordinator-main-stage-2.js test/control-plane/publication-active-gate-handoff-contract.test.js",
    "npx tap --grep \"AdminControlSnapshot (forced authoritative membership observation stays read-only without handoff target|build snapshot keeps broad authoritative membership observation read-only|build snapshot forwards handoff pending reconcile target|repair-deferred shared owner attempts publication catch-up before returning|repair-deferred no-attempt path still attempts publication catch-up|repair-deferred shared owner skips publication catch-up for owner recovery waits|repair-deferred shared owner skips publication catch-up without pending reconcile evidence)\" test/admin/admin-control-snapshot.test.js",
    "node --test test/admin/admin-control-snapshot.test.js # known pre-existing priority-recovery failures remain outside bridge scope",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-reconcile-bridge-simplification-20260515-codex.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-reconcile-bridge-simplification-20260515-codex.report.json",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json --markdown",
    "npm run work:validate -- --closure work/packages/active-20260515-publication-active-gate-reconcile-bridge-simplification.md"
  ],
  "writeScope": [
    "work/packages/active-20260515-publication-active-gate-reconcile-bridge-simplification.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/tracks/topology-convergence.md",
    "work/releases/0.1-dependency-map.md",
    "work/releases/0.1-stabilization.md",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-rolling-restart-canonical-frontier-steering-repair.md",
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md",
    "work/packages/done-20260515-topology-publication-active-gate-handoff-contract-consolidation.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-stage-2.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js"
  ],
  "commitScope": [
    "work/packages/active-20260515-publication-active-gate-reconcile-bridge-simplification.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/tracks/topology-convergence.md",
    "work/releases/0.1-dependency-map.md",
    "work/releases/0.1-stabilization.md",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary-simplification",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/follow-on",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Continue with startup_active_gate_owner / snapshot_coverage. The reconcile bridge was narrowed and direct owner reconcile reduced the handoff to one pending target, but canonical evidence still reports publication_active_gate_handoff_contract_pending with pendingReconcileCount=1 and runtimePromotionAllowed=false."
  },
  "causalGovernance": {
    "hypothesis": "The representative blocker remains active-gate snapshot coverage, but the handoff probe names reconcile_owner_membership_publication as the missing bounded progress mechanism; this package must prove whether the publication_reconcile_bridge is the cross-boundary causal edge before another local runtime patch.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json",
    "expectedCausalModelChange": "Focused bridge proof either reduces active_gate_snapshot_coverage, migrates to a narrower startup active-gate owner boundary, or keeps the blocker on snapshot_coverage with the bridge proven non-causal.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Starting bridge runtime edits without a causal handoff would continue the recent oscillation between publication and active-gate boundaries.",
    "crossBoundaryReview": "Do not edit runtime files until review subagent proof, owner-file evidence, and exact runtime write scope promotion are recorded."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "publication_reconcile_bridge",
    "reason": "Fresh handoff probe keeps active_gate_snapshot_coverage as the first frontier but names reconcile_owner_membership_publication as the required progress mechanism; this activates the bridge as a bounded startup-active-gate implementation slice, not the parked workflow-progress dependency.",
    "evidence": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --handoff-probe reports missingEdge=null, contractEdge=publication_active_gate_handoff_contract, nextAction=reconcile_owner_membership_publication, pendingReconcileCount=4, and runtimePromotionAllowed=false."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / publication active-gate handoff probe",
    "phaseChain": [
      "consume canonical frontier steering repair",
      "confirm workflow_progress remains subordinate evidence",
      "inspect startup active-gate publication reconcile bridge owner files",
      "promote exact runtime files only after review subagent proof",
      "prove focused bridge/admin tests and representative rolling-restart"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage remains the first representative frontier in test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "handoff contract is pending with pendingReconcileCount=1 and runtimePromotionAllowed=false after awaited direct reconcile",
      "selected snapshot observation remains repair_deferred with stale_replica_operations_in_flight",
      "priority-recovery residual extraction reports zero witnesses, so workflow_progress remains parked until canonical extractors promote it"
    ],
    "missingCausalEdge": "The package must prove whether the bridge already has one canonical reconcile target path or still reconstructs handoff truth through admin snapshot repair-deferred catch-up.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --handoff-probe",
    "boundedProgressProof": "Focused bridge work must make reconcile target selection canonical without relaxing active-gate admission or using broad snapshot rebuild as the mechanism.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json",
    "expectedObservableTransition": "Bridge proof either reduces the active-gate snapshot coverage blocker, migrates to a narrower startup active-gate owner path, or closes as reduced if the duplicate bridge has already been removed.",
    "maxProgressBound": "one publication_reconcile_bridge package slice; no timeout increases, active-gate admission relaxation, publication handoff rewrite, or workflow-progress implementation",
    "sameFrontierFallback": "If active_gate_snapshot_coverage remains red after focused bridge proof, record whether the blocker is still reconcile bridge, snapshot coverage, or a promoted workflow-progress dependency before another runtime patch.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage unless bridge proof promotes a narrower owner boundary",
    "resultClassification": "same-frontier",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md / operation_workflow_owner / rebalancer_handoff / reduced",
      "work/packages/done-20260515-rolling-restart-canonical-frontier-steering-repair.md / startup_active_gate_owner / snapshot_coverage / classification-only"
    ],
    "oscillationCheck": "The package records a bounded bridge activation from the same startup_active_gate_owner evidence and keeps workflow_progress parked unless canonical evidence promotes it.",
    "handoffInvariant": "Active-gate admission stays strict while runtimePromotionAllowed=false; publication handoff truth remains owned by the canonical contract."
  }
}
-->

## Why

The current green-gate implementation direction is sound: the canonical
publication-to-active-gate handoff contract should drive the owner membership
publication reconcile. The in-progress shape, however, risks adding another
layer of handoff interpretation around that contract.

This package owns the follow-on simplification after the owner-reconcile
closure and canonical steering packages landed. It should remove duplicated
bridge logic without losing the intent of the current fix: pending reconcile
node IDs become one explicit publication owner target, active-gate admission
remains strict while `runtimePromotionAllowed=false`, and admin diagnostics
keep their existing meaning.

The package is active because the simplification is directly coupled to the
current `rolling-restart` blocker, but it must not start runtime implementation
until the required review/fix subagent sequence is recorded.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, especially topology workflow
stabilization and production guarantees.

Edition scope: Community / AGPL repo only. No Pro or Enterprise behavior is in
scope.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the package is the cross-boundary handoff before
  runtime bridge work resumes. It must prove whether the active-gate handoff
  probe's `reconcile_owner_membership_publication` action is owned by the
  publication reconcile bridge, snapshot coverage, or a promoted dependency.
- Escalation trigger to a heavier lane: fresh representative evidence changes
  the first owner boundary, the package needs to reopen publication handoff
  semantics beyond helper extraction, or `rolling-restart` remains red on the
  same first frontier after focused bridge proof.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Centralize handoff selection and reconcile-target projection in
   `src/control-plane/publication-active-gate-handoff-contract.js`, so admin
   code consumes one canonical helper instead of reconstructing handoff
   semantics.
2. Tighten publication catch-up signal detection to the reconcile case:
   `nextAction=reconcile_owner_membership_publication`, non-empty
   `pendingReconcileNodeIds`, or the equivalent normalized owner-reconcile
   reason. Do not treat `wait_owner_recovery` as a publication reconcile
   target.
3. Replace broad repair-deferred snapshot rebuild catch-up with a narrow owner
   publication reconcile path. Rebuilding the admin control snapshot may
   observe the result, but it must not be the mechanism that decides or
   performs the publication reconcile.
4. Make explicit membership publication targets named and intentional instead
   of inferred from the coincidental presence of multiple node ID arrays.
5. Preserve existing priority-recovery and admin diagnostic semantics. The
   focused admin snapshot test suite must not change unrelated
   `priorityRecoveryObservation` or blocker-bucket meaning as a side effect.
6. Update package/sprint/release tracking and model-ledger evidence if this
   package is activated and implemented.
7. If the previous active packages already removed the duplicated bridge shape,
   close this package as reduced with proof rather than reworking the same
   boundary again.

## Out Of Scope

1. timeout increases
2. active-gate admission relaxation while runtimePromotionAllowed=false
3. new diagnostics-only success path
4. broad admin snapshot rebuild as the reconcile mechanism
5. Reopening the completed owner-key reconcile package.
6. Reopening the completed handoff-contract semantics except for extracting or
   reusing canonical helper APIs.
7. Broad priority-recovery, operation-workflow, or readiness behavior changes.

## Activation Gate

This package is active. Before runtime implementation starts:

1. The owner-reconcile closure and canonical steering packages must be done.
2. A fresh `work:context` / `work:llm-start` pass must confirm that this
   package is still the next bounded concern.
3. Exact runtime files must be promoted from `candidateRuntimeFiles` into
   `writeScope` and `commitScope` before editing.
4. Required runtime-owner-boundary subagent sequencing must be recorded in this
   package.

## Subagent Sequencing Ledger

Required before implementation because this is a causal-escalation package.

- [x] Review subagent recorded:
      `Agent Codex Review (019e2cce-0817-74f3-873f-e0631aec7735) reviewed work/packages/active-20260515-publication-active-gate-reconcile-bridge-simplification.md; result clean`
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [x] Implementation subagent recorded:
      `Agent Codex Implementation (6e08407b-e675-44b8-bc48-c844b1016cdf) implemented work/packages/active-20260515-publication-active-gate-reconcile-bridge-simplification.md`

## Model Fit

- Package class: `runtime-owner-boundary-simplification`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/follow-on`
- Output profile: `medium`
- Owned files: `work/packages/active-20260515-publication-active-gate-reconcile-bridge-simplification.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/tracks/topology-convergence.md`, `work/releases/0.1-dependency-map.md`, `work/releases/0.1-stabilization.md`, `work/model-ledger.jsonl`, `src/control-plane/publication-active-gate-handoff-contract.js`, `src/admin/admin-control-snapshot-class-part-2.js`, `src/admin/admin-control-snapshot-class-part-6.js`, `test/admin/admin-control-snapshot.test.js`
- Forbidden files: `timeout increases`, `active-gate admission relaxation while runtimePromotionAllowed=false`, `new diagnostics-only success path`, `broad admin snapshot rebuild as the reconcile mechanism`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:llm-start`, `npm run work:package:doctor -- --suggest work/packages/active-20260515-publication-active-gate-reconcile-bridge-simplification.md`, `npm run work:validate -- --entry work/packages/active-20260515-publication-active-gate-reconcile-bridge-simplification.md`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner publication_reconcile_bridge --markdown`, `node --test test/control-plane/membership-publication-coordinator-main-stage-2.js test/control-plane/publication-active-gate-handoff-contract.test.js`, `npx tap --grep "AdminControlSnapshot (forced authoritative membership observation stays read-only without handoff target|build snapshot keeps broad authoritative membership observation read-only|build snapshot forwards handoff pending reconcile target|repair-deferred shared owner attempts publication catch-up before returning|repair-deferred no-attempt path still attempts publication catch-up|repair-deferred shared owner skips publication catch-up for owner recovery waits|repair-deferred shared owner skips publication catch-up without pending reconcile evidence)" test/admin/admin-control-snapshot.test.js`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-reconcile-bridge-simplification-20260515-codex.report.json --fast-local --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-reconcile-bridge-simplification-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-reconcile-bridge-simplification-20260515-codex.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-reconcile-bridge-simplification-20260515-codex.report.json`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json --fast-local --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json --markdown`, `npm run work:validate -- --closure work/packages/active-20260515-publication-active-gate-reconcile-bridge-simplification.md`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:llm-start
3. npm run work:package:doctor -- --suggest work/packages/active-20260515-publication-active-gate-reconcile-bridge-simplification.md
4. npm run work:validate -- --entry work/packages/active-20260515-publication-active-gate-reconcile-bridge-simplification.md
5. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json
6. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --handoff-probe
7. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json
8. npm run analyze:owner-files -- startup_active_gate_owner publication_reconcile_bridge --markdown
9. node --test test/control-plane/membership-publication-coordinator-main-stage-2.js
10. npx tap --grep "AdminControlSnapshot (forced authoritative membership observation stays read-only without handoff target|build snapshot keeps broad authoritative membership observation read-only|build snapshot forwards handoff pending reconcile target|repair-deferred shared owner attempts publication catch-up before returning|repair-deferred no-attempt path still attempts publication catch-up|repair-deferred shared owner skips publication catch-up for owner recovery waits|repair-deferred shared owner skips publication catch-up without pending reconcile evidence)" test/admin/admin-control-snapshot.test.js
11. node --test test/admin/admin-control-snapshot.test.js
12. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-reconcile-bridge-simplification-20260515-codex.report.json --fast-local --verbose
13. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-reconcile-bridge-simplification-20260515-codex.report.json
14. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json --fast-local --verbose
15. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json
16. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json --handoff-probe
17. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json
18. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json --markdown
19. npm run work:validate -- --closure work/packages/active-20260515-publication-active-gate-reconcile-bridge-simplification.md

## Implementation Evidence

- Centralized handoff selection and membership publication target projection in `src/control-plane/publication-active-gate-handoff-contract.js`.
- Replaced admin repair-deferred snapshot rebuild catch-up with a narrow owner publication reconcile path in `src/admin/admin-control-snapshot-class-part-6.js`; awaited direct `reconcileClusterMembership` is preferred when available, enqueue fallback is used only when direct reconcile is absent, and the follow-up rebuild in `src/admin/admin-control-snapshot-class-part-2.js` is now observation-only.
- Focused bridge/admin tests pass under `npx tap --grep`, including read-only broad authoritative membership observation, handoff pending reconcile forwarding, and repair-deferred owner publication catch-up.
- `node --test test/control-plane/membership-publication-coordinator-main-stage-2.js test/control-plane/publication-active-gate-handoff-contract.test.js` passes.
- Full `node --test test/admin/admin-control-snapshot.test.js` remains red on pre-existing priority-recovery expectations called out before this package began; the bridge-focused admin tests pass and no priority-recovery behavior was widened.
- Representative `rolling-restart` remains red in `test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json`.
- Normalized evidence: `work:evidence-summary` still selects `active_gate_snapshot_coverage`; `analyze:topology-convergence --handoff-probe` reports `publication_active_gate_handoff_contract_pending`, `pendingReconcileCount=1`, pending node `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, and `runtimePromotionAllowed=false`; `analyze:causal-model` returns `continue_local_fix`; `analyze:priority-recovery-residuals --markdown` reports zero witnesses and `split required: false`.
- Result classification: `same-frontier-reduced`. The duplicate bridge projection is narrowed, but the next owner boundary remains `startup_active_gate_owner / snapshot_coverage`.

## Raw Fallback Evidence

Canonical extractors tried first: `work:evidence-summary`,
`analyze:topology-convergence --handoff-probe`, `analyze:causal-model`, and
`analyze:priority-recovery-residuals --markdown` on
`test-output/reports/rolling-restart-after-awaited-reconcile-bridge-20260515-codex.report.json`.
They identify the remaining owner and pending target but do not explain why the
final target remains pending.

Narrow raw fallback over the matching playback logs/events showed repeated
`repair_deferred` admin observations with `cache_stale_watermark`,
`discovery_node_coverage_gap`, and `stale_replica_operations_in_flight`; the
publication-control partition `control_plane_publications-p1` is initially
`repair_ineligible` and only moves to dispatch late in the active-gate budget.
Because the canonical priority residual extractor reports no promoted
workflow-progress witness, this package records the raw observation as
subordinate evidence rather than activating workflow-progress work here.
