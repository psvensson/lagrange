# Rolling Restart Publication Active Gate Handoff Oscillation After Fresh Evidence

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-18",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Focused implementation proof classified the renewed publication-active-gate oscillation as same-frontier metadata-only. Fresh evidence, scenario-route, evidence-summary, and causal-model still select publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending as the visible first frontier. Priority recovery has zero residual witnesses. The handoff probe reports missingEdge=null and contractEdge=publication_active_gate_handoff_contract, so this is not an architecture handoff gap; active-gate remains a deferred nextOwnerPath with runtimePromotionAllowed=false and three pending reconcile nodes.",
  "nextAction": "Do not edit runtime in this package. Close or hand off this gate as same-frontier and open a bounded topology_publication_owner / publication_convergence package only if continuing local runtime work; keep active-gate consumer runtime, readiness, operation workflow, active-gate admission, and timeout budgets frozen unless fresh canonical evidence reselects them.",
  "proof": [
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260518-rolling-restart-publication-active-gate-handoff-oscillation-after-fresh-evidence.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260518-startup-active-gate-snapshot-coverage-after-publication-handoff-classification.md",
    "work/packages/done-20260518-publication-operation-active-gate-handoff-contract-architecture.md",
    "test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/scripts/analyze-topology-convergence.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260518-rolling-restart-publication-active-gate-handoff-oscillation-after-fresh-evidence.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "architecture-gap-analysis",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "cross-boundary-causal-gate",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "fresh evidence selects a different owner boundary",
      "focused proof cannot represent the publication-active-gate handoff",
      "runtime ownership changes",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "same-frontier",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Same-frontier: the existing handoff contract represents the deferred active-gate leg, while publication_convergence remains the visible blocked owner. No runtime edit is justified inside this handoff package."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "The predecessor classified the one-node active-gate owner reconcile handoff without runtime edits. A fresh representative rerun reselected publication_ack_convergence as the visible first frontier, kept priority recovery satisfied, and widened active-gate handoff pendingReconcileCount to 3 with runtimePromotionAllowed=false.",
    "evidence": [
      "work/packages/done-20260518-startup-active-gate-snapshot-coverage-after-publication-handoff-classification.md",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json --handoff-probe"
    ]
  },
  "causalGovernance": {
    "hypothesis": "Focused implementation proof selected same-frontier: the existing publication-active-gate handoff contract represents the widened reconcile set, active-gate remains deferred with runtimePromotionAllowed=false, and the visible first frontier remains topology_publication_owner / publication_convergence.",
    "stopConditionCheck": "Ran scenario-route, evidence-summary, topology handoff probe, npm run analyze:causal-model, priority residual extraction, owner-files, package doctor, and pre-implementation validation before runtime edits. Runtime and test implementation are not justified inside this handoff package.",
    "expectedCausalModelChange": "Selected same-frontier. Future runtime work, if any, must be opened as a bounded topology_publication_owner / publication_convergence package from the same canonical route or from fresh representative evidence.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "The latest rerun remains red with active=0/5, snapshotCoverage=2/5, publication_ack_convergence visible first, priority residual witnesses at zero, and active-gate owner_reconcile_pending widened to three nodes: 11601fe0-72d6-5853-8590-ec2881853e72, 35a891b8-c1a0-5064-9c6e-2acfba61c2a7, and ebc4aa0b-06c6-506d-93ea-1dd2deca3f58.",
    "crossBoundaryReview": "Review/fix proof is recorded. Implementation proof recorded same-frontier and no runtime/test edits for this cross-boundary handoff package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "fresh rolling-restart rerun after active-gate handoff classification",
    "phaseChain": [
      "publication count-only UNKNOWN evidence was reduced to concrete OPEN epoch-1 publication evidence",
      "rebalancer_handoff retry witnesses were classified as bounded",
      "publication handoff probe recorded no missing publication-active-gate edge",
      "active-gate handoff classification accepted one pending reconcile node with runtimePromotionAllowed=false",
      "fresh rerun reselected publication_ack_convergence while active-gate pending reconcile widened to three nodes"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending is the visible first frontier in the fresh artifact; active_gate_snapshot_coverage remains the deferred next owner path with owner_reconcile_pending and runtimePromotionAllowed=false.",
    "knownDownstreamBlockers": [
      "fresh run failed 0/1 at active=0/5 and snapshotCoverage=2/5",
      "publicationStatus is OPEN at publicationEpoch=1 with publishedActive=1/5",
      "topology publication reports missingPublishedCount=4 and prioritySpreadPending=true",
      "priority residual extraction reports zero witnesses",
      "active-gate handoff pendingReconcileCount widened to 3 for nodes 11601fe0-72d6-5853-8590-ec2881853e72, 35a891b8-c1a0-5064-9c6e-2acfba61c2a7, and ebc4aa0b-06c6-506d-93ea-1dd2deca3f58",
      "selected snapshot observation remains repair_deferred / deferred_refresh / retry with retryAfterMs=1000"
    ],
    "missingCausalEdge": "Resolved: the renewed publication-active-gate oscillation is not a missing architecture handoff contract. The handoff probe reports missingEdge=null and contractEdge=publication_active_gate_handoff_contract; active-gate consumer evidence is deferred, while topology_publication_owner / publication_convergence remains the first frontier.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json --handoff-probe",
    "boundedProgressProof": "Focused proof complete: scenario-route, evidence-summary, and causal-model select publication_ack_convergence first; priority residual extraction has zero witnesses; the handoff probe has missingEdge=null and contractEdge=publication_active_gate_handoff_contract; active-gate reconcile remains deferred with three pending nodes and runtimePromotionAllowed=false.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json",
    "expectedObservableTransition": "Observed same-frontier metadata-only classification. Runtime implementation is not selected from this handoff package; the next concrete runtime slice must be a bounded topology_publication_owner / publication_convergence package or fresh representative evidence.",
    "maxProgressBound": "one focused cross-boundary publication-active-gate oscillation proof",
    "sameFrontierFallback": "Same-frontier selected. Do not open another handoff gate from the unchanged artifact; either close this gate and open a concrete topology_publication_owner / publication_convergence package, rerun representative evidence, or escalate if the next proof cannot reduce the publication frontier.",
    "expectedNextFrontier": "bounded topology_publication_owner / publication_convergence successor or fresh representative evidence after this metadata-only gate closes",
    "resultClassification": "same-frontier",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260518-priority-recovery-rebalancer-handoff-after-publication-count-only-classification.md / operation_workflow_owner / rebalancer_handoff / classification-only",
      "work/packages/done-20260518-rolling-restart-topology-publication-owner-publication-conve.md / topology_publication_owner / publication_convergence / classification-only",
      "work/packages/done-20260518-startup-active-gate-snapshot-coverage-after-publication-handoff-classification.md / startup_active_gate_owner / snapshot_coverage / classification-only",
      "test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json / topology_publication_owner / publication_convergence / same-frontier"
    ],
    "oscillationCheck": "Fresh evidence returned to publication after an active-gate handoff classification and widened the active-gate reconcile set instead of reducing it, so this package must classify the cross-boundary handoff before any local runtime package.",
    "handoffInvariant": "Publication runtime, active-gate runtime, rebalancer_handoff runtime, startup readiness runtime, active-gate admission, harness timeout policy, and timeout budgets remain frozen unless this package selects that owner boundary from canonical proof."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "Fresh rolling-restart artifact test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json reselects publication_ack_convergence after active-gate classification-only proof.",
      "Priority residual extraction reports zero witnesses, so operation workflow is not the current successor.",
      "The handoff probe reports missingEdge=null while active-gate reconcile widened to three pending nodes with runtimePromotionAllowed=false."
    ],
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Close this handoff gate as same-frontier because the existing handoff contract is adequate and no runtime patch is needed in this package.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json --handoff-probe"
        ]
      },
      {
        "id": "owner-boundary-migration",
        "summary": "Migrate only if canonical proof names topology_publication_owner or startup_active_gate_owner as the selected owner with a concrete next required action.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown",
          "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
        ]
      },
      {
        "id": "architecture-package",
        "summary": "Promote to architecture-gap if the existing publication-active-gate handoff contract cannot represent the widened reconcile set without another local patch.",
        "route": "architecture-package",
        "proof": [
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json --handoff-probe"
        ]
      }
    ],
    "selectedChoice": "continue-local-proof",
    "nextAction": "Selected continue-local-proof. Record same-frontier, keep runtime and tests untouched in this package, then hand off to a bounded topology_publication_owner / publication_convergence package or fresh representative evidence."
  },
  "predecessor": "work/packages/done-20260518-startup-active-gate-snapshot-coverage-after-publication-handoff-classification.md",
  "closed": "2026-05-18",
  "commitAndPushLedgerRequired": true
}
-->

## Why

Fresh rolling-restart evidence reselected `topology_publication_owner /
publication_convergence` immediately after the active-gate handoff package
classified the one-node owner reconcile edge. Priority recovery is satisfied,
but active-gate owner reconcile widened to three pending nodes with
`runtimePromotionAllowed=false`.

This package owns that publication-to-active-gate oscillation classification.
Focused proof selected `same-frontier`: the handoff contract is adequate, the
active-gate leg is deferred, and no runtime patch is justified in this package.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: rolling-restart topology workflow
stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: fresh representative evidence returned to
  publication after a classified active-gate handoff and widened the
  active-gate reconcile set instead of reducing it.
- Escalation trigger to a heavier lane: focused proof cannot select a bounded
  owner route, runtime ownership changes, shared contract changes, or
  representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: one cross-boundary outcome for the renewed
  publication-active-gate oscillation: architecture-gap, bounded
  owner-boundary migration, classification-only stop, same-frontier, or
  representative-green.
- Inputs/signals: fresh representative artifact
  `test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json`;
  scenario-route; evidence-summary; topology handoff probe; causal-model;
  priority residual extraction; owner-files for publication and active-gate.
- State model or invariant: normalize the publication producer, satisfied
  operation workflow leg, active-gate consumer, and handoff contract into one
  snapshot before choosing one outcome. Counts alone do not select a runtime
  owner unless the required action also changes.
- Non-goals and forbidden interpretations: do not treat visible publication
  context alone as permission to patch publication runtime; do not patch
  active-gate runtime from deferred consumer evidence alone; do not reopen
  rebalancer_handoff, startup readiness, active-gate admission, harness timeout
  policy, or timeout budgets.
- Proof mapping: canonical extractors must agree on the visible frontier and
  handoff state; focused proof must name the selected owner/architecture route
  before runtime implementation or closure.
- Wrong-slice trigger: stop as architecture-gap or human-escalation if the
  proof cannot distinguish producer debt, consumer handoff debt, or shared
  handoff contract debt without widening scope.

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

1. work/packages/done-20260518-rolling-restart-publication-active-gate-handoff-oscillation-after-fresh-evidence.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

## Out Of Scope

1. publication convergence runtime
2. startup active-gate runtime
3. operation workflow / rebalancer_handoff runtime
4. startup readiness runtime
5. active-gate admission relaxation
6. harness timeout increases or timeout budget policy

## Model Fit

- Package class: `architecture-gap-analysis`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `cross-boundary-causal-gate`
- Output profile: `medium`
- Owned files: `work/packages/done-20260518-rolling-restart-publication-active-gate-handoff-oscillation-after-fresh-evidence.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `publication convergence runtime`, `startup active-gate runtime`, `operation workflow / rebalancer_handoff runtime`, `startup readiness runtime`, `active-gate admission`, `timeout budgets`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, fresh evidence selects a different owner boundary, focused proof cannot represent the handoff, runtime ownership changes, or a frozen decision must be reopened.
- Focused proof: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Kierkegaard (019e3a83-9a79-7061-ba6a-4d74e19078bb) reviewed work/packages/done-20260518-rolling-restart-publication-active-gate-handoff-oscillation-after-fresh-evidence.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Codex (019e3a85-a147-7303-b85b-d05b0a7fbf07) fixed work/packages/done-20260518-rolling-restart-publication-active-gate-handoff-oscillation-after-fresh-evidence.md.
- [x] Implementation subagent recorded: Agent Codex (019e3a88-703b-7cc3-9c30-7b7061b4feed) implemented work/packages/done-20260518-rolling-restart-publication-active-gate-handoff-oscillation-after-fresh-evidence.md; result same-frontier metadata-only handoff classification, no runtime/test edits justified.

## Implementation Result

- Result classification: `same-frontier`.
- Selected gate route: `continue-local-proof`.
- Decision: the oscillation is not an architecture handoff gap because the
  probe reports `missingEdge=null` and
  `contractEdge=publication_active_gate_handoff_contract`.
- Decision: this is not a startup active-gate migration because the consumer is
  deferred with `runtimePromotionAllowed=false`.
- Decision: this is not representative-green because the fresh run remains red
  at `active=0/5` and `snapshotCoverage=2/5`.
- Runtime/test result: no runtime, test, template, script, steering, timeout,
  admission, publication, active-gate, readiness, or operation workflow edits
  are justified in this package.
- Handoff: close this gate as same-frontier, then open a concrete bounded
  `topology_publication_owner / publication_convergence` package or rerun fresh
  representative evidence before any local runtime implementation.

## Validation

1. npm run work:scenario-route -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json --handoff-probe
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json --markdown

## Commit And Push Ledger

1. Focused package commit: `d33b4146`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
