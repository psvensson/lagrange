# Startup Active Gate Snapshot Coverage After Publication Handoff Classification

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-18",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "owner_reconcile_pending",
  "currentState": "The publication handoff proof closed as classification-only with missingEdge=null and contractEdge=publication_active_gate_handoff_contract. The same representative artifact still routes first to publication_ack_convergence, but evidence-summary and the handoff probe expose the bounded next owner path as active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage: snapshot coverage is 2/5, the selected snapshot is repair_deferred/deferred_refresh/retry, runtimePromotionAllowed=false, and one pending reconcile node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7 blocks owner membership publication.",
  "nextAction": "Run review/fix/implementation subagents before runtime edits. First prove whether the one-node owner_reconcile_pending active-gate snapshot coverage edge drains, needs a focused startup_active_gate_owner repair, or must migrate without reopening publication, rebalancer_handoff, startup readiness, harness timeout policy, or timeout budgets.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260518-startup-active-gate-snapshot-coverage-after-publication-handoff-classification.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/admin/admin-control-snapshot.test.js",
    "scripts/analyze-topology-convergence.js",
    "test/scripts/analyze-topology-convergence.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260518-rolling-restart-topology-publication-owner-publication-conve.md",
    "work/packages/done-20260518-priority-recovery-rebalancer-handoff-after-publication-count-only-classification.md",
    "work/packages/todo-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md",
    "test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/admin/admin-control-snapshot.test.js",
    "scripts/analyze-topology-convergence.js",
    "test/scripts/analyze-topology-convergence.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260518-startup-active-gate-snapshot-coverage-after-publication-handoff-classification.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/admin/admin-control-snapshot.test.js",
    "scripts/analyze-topology-convergence.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/next-owner-handoff",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "next-owner-handoff-open",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "owner_reconcile_pending",
    "nextAction": "Use the publication handoff probe and active-gate owner evidence to prove whether one pending reconcile node drains, needs a focused startup_active_gate_owner repair, or migrates without reopening publication or timeout scope."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "The predecessor classified concrete OPEN epoch-1 publication_pending as a no-missing-edge publication_active_gate_handoff_contract. The same artifact still routes first to publication, but evidence-summary and analyze:topology-convergence --handoff-probe expose active_gate_snapshot_coverage as the bounded nextOwnerPath with requiredAction reconcile_owner_membership_publication.",
    "evidence": [
      "work/packages/done-20260518-rolling-restart-topology-publication-owner-publication-conve.md",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json --handoff-probe"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If the publication handoff proof is correct, startup_active_gate_owner / snapshot_coverage now owns the bounded one-node owner reconcile edge: pendingReconcileCount=1 for node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7, snapshot coverage is 2/5, selected snapshot repair is deferred, and runtime promotion is not allowed until owner membership publication reconciles.",
    "stopConditionCheck": "Use evidence-summary, topology-convergence --handoff-probe, topology-convergence --explain active_gate_snapshot_coverage, npm run analyze:causal-model, owner-files, and work:advance before runtime edits. Runtime or test implementation requires clean review/fix proof and a fresh implementation subagent.",
    "expectedCausalModelChange": "Focused proof should either reduce active-gate snapshot coverage by draining the one pending owner reconcile node, classify it as bounded deferred progress, migrate to a narrower owner boundary, or stop before touching publication, operation workflow, readiness, or timeout policy.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Canonical scenario-route and causal-model still select publication_ack_convergence on the unchanged artifact, but the predecessor's focused handoff probe records no missing publication edge and identifies startup_active_gate_owner / snapshot_coverage as the next owner path. Active-gate evidence remains deferred with snapshotCoverageNodeCount=2/5, owner_reconcile_pending, selectedSnapshotRepairDeferred=true, retryAfterMs=1000, and runtimePromotionAllowed=false.",
    "crossBoundaryReview": "Required before implementation because this package follows a cross-owner publication-to-active-gate handoff after recent publication, rebalancer_handoff, and startup readiness classifications."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart publication handoff probe after publication convergence classification",
    "phaseChain": [
      "startup readiness support reduced selected snapshot timeout to inherited active-gate evidence",
      "publication count-only UNKNOWN evidence was reduced to concrete OPEN epoch-1 publication evidence",
      "rebalancer_handoff priority residuals were classified as bounded remote handoff retries",
      "publication convergence proof recorded no missing publication-active-gate handoff edge",
      "handoff probe points nextOwnerPath to startup_active_gate_owner / snapshot_coverage with one pending reconcile node"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending is the bounded next-owner handoff path from the publication probe. The unchanged representative scenario-route still selects publication_ack_convergence first, so this package must prove the active-gate handoff edge before any runtime edit.",
    "knownDownstreamBlockers": [
      "snapshotCoverageNodeCount is 2/5 while expectedNodeCount is 5",
      "selected snapshot observation is repair_deferred / deferred_refresh / deferred / retry with retryAfterMs=1000",
      "publicationActiveGateHandoffState is pending with reason owner_reconcile_pending",
      "pendingReconcileCount is 1 for node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7",
      "runtimePromotionAllowed is false",
      "readiness_startup_support remains inherited active-gate no progress"
    ],
    "missingCausalEdge": "Determine whether the one pending owner reconcile node can advance durable membership publication into active-gate snapshot coverage, whether startup_active_gate_owner needs a focused repair, or whether the handoff must migrate without reopening publication runtime or timeout budgets.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json --handoff-probe",
    "boundedProgressProof": "Pending: current proof only classifies the predecessor handoff. This package must use the handoff probe, active-gate explain output, owner files, and any focused runtime/test evidence to prove drain, classification, or migration for startup_active_gate_owner / snapshot_coverage.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "expectedObservableTransition": "The one pending reconcile node drains or becomes a focused local blocker; expected evidence movement is pendingReconcileCount=0, owner_reconcile_pending removed, snapshot coverage improving beyond 2/5, or a narrower owner-boundary migration with publication still treated as a classified predecessor.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage slice",
    "sameFrontierFallback": "If focused proof cannot move or classify the one-node active-gate reconcile edge, stop as same-frontier or migrate; do not widen into publication, operation workflow, startup readiness, harness timeout policy, or timeout budgets.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage drains to readiness_startup_support, representative green, or a narrower owner-boundary successor",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260518-topology-publication-convergence-after-startup-readiness-classification.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260518-priority-recovery-rebalancer-handoff-after-publication-count-only-classification.md / operation_workflow_owner / rebalancer_handoff / classification-only",
      "work/packages/done-20260518-rolling-restart-topology-publication-owner-publication-conve.md / topology_publication_owner / publication_convergence / classification-only"
    ],
    "oscillationCheck": "Allowed only as a bounded handoff successor. If publication and active-gate alternate again without metric reduction, open a causal or architecture handoff package instead of another local runtime patch.",
    "handoffInvariant": "Do not edit publication runtime, rebalancer_handoff runtime, startup readiness runtime, harness timeout policy, or timeout budgets unless fresh canonical evidence changes owner, boundary, or required action."
  },
  "architectureDecisionGate": {
    "status": "not-required",
    "trigger": "none",
    "triggerEvidence": [],
    "choices": [],
    "selectedChoice": null,
    "nextAction": "No architecture gate is required before the focused active-gate owner reconcile proof."
  },
  "predecessor": "work/packages/done-20260518-rolling-restart-topology-publication-owner-publication-conve.md"
}
-->

## Why

The publication handoff predecessor closed as classification-only: it found no
missing publication-to-active-gate handoff edge and identified the bounded next
owner path as `startup_active_gate_owner / snapshot_coverage`.

This package owns that active-gate handoff proof. The current evidence is one
pending owner-reconcile node, `snapshotCoverageNodeCount=2/5`,
`selectedSnapshotRepairDeferred=true`, and `runtimePromotionAllowed=false`. It
must not reopen publication runtime, rebalancer handoff, startup readiness,
harness timeout policy, or timeout budgets.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: rolling-restart topology workflow
stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: this package follows a cross-owner publication to
  active-gate handoff after repeated adjacent-boundary classifications.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits the package outcome for owner_reconcile_pending.
- Inputs/signals: test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json --handoff-probe; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json --explain active_gate_snapshot_coverage; npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json; npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown.
- State model or invariant: Collect evidence, normalize one startup_active_gate_owner / snapshot_coverage snapshot, then use one explicit state model, decision table, or invariant to emit one canonical outcome and reasons.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: operation_workflow_owner/runtime; topology_publication_owner/publication_convergence_runtime; startup_readiness_owner/runtime; harness-timeout-increase; timeout-budget-policy.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package. Run review, fix if needed, and implementation
subagents sequentially before editing runtime or test files.

## Subagent Sequencing Ledger

- [ ] Review subagent recorded: pending before implementation starts.
- [ ] Fix subagent recorded or explicitly not needed: pending review result.
- [ ] Implementation subagent recorded: pending review/fix proof.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- <artifact>` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or present a human gate.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.

## In Scope

1. work/packages/active-20260518-startup-active-gate-snapshot-coverage-after-publication-handoff-classification.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/control-plane/control-plane-snapshot-owner.js
7. src/admin/admin-control-snapshot-class-part-2.js
8. src/admin/admin-control-snapshot-class-part-3.js
9. src/admin/admin-control-snapshot-class-part-5.js
10. src/admin/admin-control-snapshot-class-part-6.js
11. src/diagnostics/topology-convergence-graph.js
12. test/admin/admin-control-snapshot.test.js
13. scripts/analyze-topology-convergence.js
14. test/scripts/analyze-topology-convergence.test.js

## Out Of Scope

1. operation_workflow_owner/runtime
2. topology_publication_owner/publication_convergence_runtime
3. startup_readiness_owner/runtime
4. harness-timeout-increase
5. timeout-budget-policy

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/next-owner-handoff`
- Output profile: `medium`
- Owned files: `work/packages/active-20260518-startup-active-gate-snapshot-coverage-after-publication-handoff-classification.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/control-plane-snapshot-owner.js`, `src/admin/admin-control-snapshot-class-part-2.js`, `src/admin/admin-control-snapshot-class-part-3.js`, `src/admin/admin-control-snapshot-class-part-5.js`, `src/admin/admin-control-snapshot-class-part-6.js`, `src/diagnostics/topology-convergence-graph.js`, `test/admin/admin-control-snapshot.test.js`, `scripts/analyze-topology-convergence.js`, `test/scripts/analyze-topology-convergence.test.js`
- Forbidden files: `operation_workflow_owner/runtime`, `topology_publication_owner/publication_convergence_runtime`, `startup_readiness_owner/runtime`, `harness-timeout-increase`, `timeout-budget-policy`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json --explain active_gate_snapshot_coverage`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json --handoff-probe
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json --explain active_gate_snapshot_coverage
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json
5. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
