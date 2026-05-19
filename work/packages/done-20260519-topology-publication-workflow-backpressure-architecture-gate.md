# Topology Publication Workflow Backpressure Architecture Gate

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-19",
  "lane": "diagnostic-classification",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Closed as classification-only successor selection. The capped proof keeps publication_ack_convergence / topology_publication_owner / publication_convergence first, classifies the operation_workflow_owner residual as backpressure, and selects a bounded publication-convergence runtime successor before further local patching.",
  "nextAction": "Continue work/packages/active-20260519-topology-publication-classified-backpressure-runtime.md with required runtime-owner-boundary subagent sequencing before runtime edits.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json",
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260519-topology-publication-workflow-backpressure-architecture-gate.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/active-node-projection.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/control-plane/publication-owner-stream.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260519-topology-publication-workflow-backpressure-architecture-gate.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "diagnostic-classification",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "diagnostic-owner-evidence/current-artifact",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "separate-package-approved",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "accept_classified_backpressure",
    "stopMode": "classified_backpressure",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Open a bounded topology_publication_owner / publication_convergence successor that resolves or correctly defers publication_ack_convergence while priority recovery is classified backpressure.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "classification-only",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Open topology_publication_owner / publication_convergence runtime successor before runtime edits."
  },
  "causalGovernance": {
    "hypothesis": "Fresh representative evidence after a bounded operation-workflow proof returned the same workflow residual, but causal analysis classifies that residual as backpressure while publication_ack_convergence remains the failed invariant.",
    "stopConditionCheck": "Use evidence summary, scenario route, priority residual extraction, topology handoff probe, and `npm run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json` before selecting another runtime owner.",
    "expectedCausalModelChange": "Capped proof selected one concrete runtime successor: topology_publication_owner / publication_convergence.",
    "representativeOutcome": "classification-only",
    "causalDebt": "Fresh artifact has publicationStatus=OPEN, missingPublishedCount=4, pendingAckCount=0, one operation_workflow_owner / workflow_progress persisted_not_dispatched witness, active-gate owner_reconcile_pending, and causal stop classified_backpressure.",
    "crossBoundaryReview": "Runtime edits remain frozen in this package; the successor owns publication convergence and must run required review/fix/implementation sequencing before code changes."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after operation workflow progress proof",
    "phaseChain": [
      "selected-source retry improved snapshot coverage and selected operation_workflow_owner / workflow_progress",
      "bounded operation-workflow proof passed locally",
      "fresh representative rerun returned one persisted_not_dispatched workflow witness",
      "causal analysis classified priority recovery as backpressure while publication_ack_convergence stayed the failed invariant"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending is the visible first frontier; priority recovery reports one operation_workflow_owner / workflow_progress witness classified as backpressure.",
    "knownDownstreamBlockers": [
      "control_plane_publications-p1 recovering_in_flight",
      "actuationState=persisted_not_dispatched",
      "waitMode=event_driven",
      "nextRequiredAction=advance_existing_operation",
      "active-gate owner_reconcile_pending with runtimePromotionAllowed=false"
    ],
    "missingCausalEdge": "The sprint must decide whether publication convergence owns the next move, operation workflow is a bounded non-frontier backpressure witness, or the publication/workflow handoff contract needs architecture work.",
    "missingCausalEdgeProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence",
    "boundedProgressProof": "Diagnostic classification only; the bounded progress mechanism under test is whether classified backpressure should defer, advance, or hand off before a runtime patch is allowed.",
    "boundedProgressProofArtifact": "work/packages/done-20260519-topology-publication-workflow-backpressure-architecture-gate.md and test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json",
    "expectedObservableTransition": "topology_publication_owner / publication_convergence runtime successor selected",
    "maxProgressBound": "one diagnostic classification gate",
    "sameFrontierFallback": "If classification cannot name one concrete owner-boundary successor with a falsifiable proof surface, stop as architecture-gap instead of opening a local runtime patch.",
    "expectedNextFrontier": "topology_publication_owner / publication_convergence runtime successor",
    "resultClassification": "classification-only",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260519-topology-publication-open-owner-reconcile-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260519-startup-active-gate-selected-snapshot-source-timeout-runtime.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260519-operation-workflow-progress-advance-existing-operation-runtime.md / operation_workflow_owner / workflow_progress / same-frontier"
    ],
    "oscillationCheck": "Required because fresh evidence returned to publication_ack_convergence after a bounded operation-workflow proof without reducing the priority residual witness.",
    "handoffInvariant": "Do not patch publication, operation workflow, active-gate, readiness, admission, handoff, or timeout runtime until this gate selects the owner and proof surface."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "bounded operation-workflow proof passed locally",
      "fresh representative rerun stayed red with one workflow residual",
      "causal model outcome is accept_classified_backpressure",
      "visible first frontier is publication_ack_convergence"
    ],
    "choices": [
      {
        "id": "publication-convergence-successor",
        "summary": "Select a bounded topology_publication_owner / publication_convergence successor if classification proves publication convergence owns the next causal move.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence"
        ]
      },
      {
        "id": "architecture-gap-stop",
        "summary": "Record architecture-gap if the publication/workflow handoff contract cannot select one owner from the fresh evidence.",
        "route": "architecture-package",
        "proof": [
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json"
        ]
      }
    ],
    "selectedChoice": "publication-convergence-successor",
    "nextAction": "Open and continue the bounded topology_publication_owner / publication_convergence runtime successor."
  }
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `diagnostic-classification`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json`
- Expected delta: Select a bounded topology_publication_owner / publication_convergence runtime successor while keeping the operation-workflow residual classified as backpressure.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json`
- Route owner: `topology_publication_owner`
- Route boundary: `publication_convergence`
- Route dominant reason: `publication_pending`
- Route causal outcome: `accept_classified_backpressure`
- Stop mode: `classified_backpressure`
- Next lane: `diagnostic-classification`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `separate-package-approved`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-runtime-owner-boundary`
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them.

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

1. Focused package-owned edit.

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `diagnostic-classification`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `diagnostic-owner-evidence/current-artifact`
- Output profile: `medium`
- Owned files: `work/packages/done-20260519-topology-publication-workflow-backpressure-architecture-gate.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json`, `npm run work:scenario-route -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json`
- Model ledger advisory: `escalate`

## Subagent Progress And Attempt Ledger

- [x] not-needed for classification-only package: status: validated; last checkpoint: capped proof complete; parent action: accepted; evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json`, `npm run work:scenario-route -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence`, and `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json`; next: active runtime successor handles required subagent sequencing.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json
2. npm run work:scenario-route -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json

## Commit And Push Ledger

- [x] Focused package commit: `031f3e98`
- [x] Pushed to: `origin/codex/pending-ack-eligibility-filter`
- [x] Commit contains only package-owned files/package-status/allowed sprint handoff: yes
