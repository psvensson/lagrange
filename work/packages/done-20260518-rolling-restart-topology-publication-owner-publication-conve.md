# Rolling Restart Publication Convergence After Rebalancer Handoff Classification

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-18",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Focused producer-consumer proof records no missing handoff edge, a present publication_active_gate_handoff_contract, and resultClassification publication_active_gate_handoff_not_detected because the active-gate consumer is deferred rather than the current handoff frontier. The probe still points nextOwnerPath to startup_active_gate_owner / snapshot_coverage with requiredAction reconcile_owner_membership_publication, pendingReconcileCount=1, pendingReconcileNodeIds=35a891b8-c1a0-5064-9c6e-2acfba61c2a7, and runtimePromotionAllowed=false while rebalancer_handoff remains satisfied.",
  "nextAction": "Parent review may close this package as classification-only after validation. Do not reopen rebalancer_handoff, publication runtime, startup active-gate runtime, startup readiness runtime, harness timeout policy, or timeout budgets unless fresh canonical evidence changes owner, boundary, or next required action.",
  "proof": [
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260518-rolling-restart-topology-publication-owner-publication-conve.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260518-priority-recovery-rebalancer-handoff-after-publication-count-only-classification.md",
    "work/packages/done-20260518-topology-publication-convergence-after-startup-readiness-classification.md",
    "test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260518-rolling-restart-topology-publication-owner-publication-conve.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/frontier-oscillation",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "runtime ownership changes",
      "representative scenario evidence changes",
      "frontier oscillates without a producer-consumer proof"
    ]
  },
  "representativeResidual": {
    "status": "classification-only-focused-proof",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Focused proof classifies the concrete OPEN epoch-1 publication_pending edge as bounded by the active-gate owner reconcile handoff contract; no publication runtime edit was made."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "operation_workflow_owner",
    "fromBoundary": "rebalancer_handoff",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "The immediate successor classified the priority residual selected by analyze:priority-recovery-residuals. After that bounded proof, the same representative artifact still routes through publication_ack_convergence in work:scenario-route, work:evidence-summary, analyze:topology-convergence, and analyze:causal-model.",
    "evidence": [
      "work/packages/done-20260518-priority-recovery-rebalancer-handoff-after-publication-count-only-classification.md",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If topology_publication_owner / publication_convergence owns the post-rebalancer frontier, focused proof should distinguish producer-side publication debt from bounded active-gate owner reconcile or migrate to a narrower owner boundary without reopening rebalancer_handoff, startup readiness, active-gate runtime, or timeout budgets.",
    "stopConditionCheck": "Use scenario-route, evidence-summary, topology-convergence, npm run analyze:causal-model, owner-files, and work:advance before runtime edits. Runtime or test implementation requires clean review/fix proof and a fresh implementation subagent.",
    "expectedCausalModelChange": "Focused proof records no missing handoff edge and a concrete nextOwnerPath to startup_active_gate_owner / snapshot_coverage: the publication owner stream is still publishing, while active-gate has owner_reconcile_pending with one pending reconcile node and runtime promotion disallowed.",
    "representativeOutcome": "classification-only",
    "causalDebt": "Publication remains OPEN with publishedActive=1/5, missingPublishedCount=4, prioritySpreadPending=true, and active-gate snapshot coverage deferred at 2/5 with owner_reconcile_pending. This package did not change publication, rebalancer_handoff, active-gate runtime, startup readiness, harness timeout policy, or timeout budgets.",
    "crossBoundaryReview": "Required before implementation because the frontier oscillated back to a recently reduced publication boundary after a cross-owner residual classification."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "fresh rolling-restart representative after publication count-only UNKNOWN classification and rebalancer_handoff bounded proof",
    "phaseChain": [
      "startup readiness support reduced selected snapshot timeout to inherited active-gate evidence",
      "publication convergence reduced UNKNOWN/no-epoch/no-node-list count-only publication debt",
      "fresh representative reported concrete OPEN epoch-1 publication evidence",
      "priority residual extraction selected operation_workflow_owner / rebalancer_handoff",
      "rebalancer_handoff proof classified five retry-scheduled witnesses as four bounded remote handoff retries",
      "scenario-route still selects topology_publication_owner / publication_convergence / publication_pending"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending is again the selected scenario route after the rebalancer_handoff residual is classified. Evidence is concrete OPEN epoch-1 publication, not the earlier UNKNOWN/no-epoch/no-node-list count-only shape.",
    "knownDownstreamBlockers": [
      "publicationStatus is OPEN at publicationEpoch=1",
      "publishedActiveNodeIds contains only one active seed node",
      "missingPublishedCount is 4 in topology convergence",
      "prioritySpreadPending is true",
      "active_gate_snapshot_coverage remains deferred with owner_reconcile_pending and snapshot_repair_deferred",
      "readiness_startup_support remains inherited active-gate no progress"
    ],
    "missingCausalEdge": "Determine whether concrete OPEN epoch-1 publication_pending is producer-side publication-owner debt, bounded by active-gate owner reconcile, or a narrower owner-boundary handoff.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "boundedProgressProof": "Classification-only proof: analyze:topology-convergence --handoff-probe reports missingEdge=null, contractEdge=publication_active_gate_handoff_contract, resultClassification=publication_active_gate_handoff_not_detected, requiredProgressMechanism=reconcile, and nextOwnerPath startup_active_gate_owner / snapshot_coverage with requiredAction reconcile_owner_membership_publication. Producer evidence is publicationOwnerStreamOutcome=publishing / recoveryOutcome=waiting_for_publication; consumer evidence carries owner_reconcile_pending, pendingReconcileCount=1, pendingReconcileNodeIds=35a891b8-c1a0-5064-9c6e-2acfba61c2a7, and runtimePromotionAllowed=false.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "expectedObservableTransition": "Observed focused transition: concrete OPEN epoch-1 publication_pending now has an explicit no-missing-edge handoff probe with active-gate reconcile as the next owner path and no local runtime change.",
    "maxProgressBound": "one focused topology_publication_owner / publication_convergence slice",
    "sameFrontierFallback": "Applied: canonical scenario-route and causal-model still select publication_ack_convergence on the unchanged representative artifact, but the focused handoff probe records no missing edge and an active-gate reconcile next owner path. Stop classification-only instead of widening into startup, rebalancer, active-gate runtime, or timeout work.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage if a fresh representative rerun observes the bounded owner reconcile handoff as the selected frontier",
    "resultClassification": "classification-only",
    "stopCondition": "classification-only-stop",
    "recentFrontierHistory": [
      "work/packages/done-20260518-topology-publication-convergence-after-startup-readiness-classification.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260518-priority-recovery-rebalancer-handoff-after-publication-count-only-classification.md / operation_workflow_owner / rebalancer_handoff / classification-only",
      "work/packages/done-20260518-startup-readiness-snapshot-timeout-after-fresh-evidence.md / startup_readiness_owner / startup_support_evidence / migrated"
    ],
    "oscillationCheck": "Allowed only as a causal-escalation package because the selected frontier returned to a recently reduced publication boundary after the intervening priority residual was classified as bounded.",
    "handoffInvariant": "Do not edit publication runtime until review/fix/implementation proof is clean; do not reopen rebalancer_handoff, startup active-gate runtime, startup readiness runtime, harness timeout policy, or timeout budgets unless fresh canonical evidence reselects that owner."
  },
  "architectureDecisionGate": {
    "status": "not-required",
    "trigger": "none",
    "triggerEvidence": [],
    "choices": [],
    "selectedChoice": null,
    "nextAction": "No architecture gate is required before the focused producer-consumer publication proof."
  },
  "predecessor": "work/packages/done-20260518-priority-recovery-rebalancer-handoff-after-publication-count-only-classification.md",
  "closed": "2026-05-18",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The rebalancer handoff successor closed as classification-only: its five
retry-scheduled witnesses reduce to four bounded remote handoff retries. After
that proof, the same representative artifact still routes to
`publication_ack_convergence` with concrete `OPEN` epoch-1 publication evidence.

This package owns that publication-convergence proof. It must not absorb
startup active-gate runtime, startup readiness runtime, rebalancer handoff
runtime, harness timeout policy, or timeout-budget work.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: rolling-restart topology workflow
stabilization and production guarantees for the AGPL runtime.

## Core Logic Brief

Canonical outcome: one producer-consumer decision for concrete OPEN epoch-1
publication evidence: reduce publication_pending, classify bounded publication
backpressure, migrate to a narrower owner boundary, or stop as same-frontier
with proof.

Inputs/signals: publication status, epoch, published active node ids, missing
published node ids, pending ACK counts, priority spread state, active-gate owner
reconcile state, publication owner stream state, and causal route output.

State model or invariant: normalize one publication evidence snapshot before
deciding whether the producer is still publishing, the consumer is waiting on
owner reconcile, or the frontier belongs to a different owner.

Non-goals and forbidden interpretations: do not reinterpret the classified
rebalancer_handoff retry witnesses, startup readiness support, active-gate
runtime, harness timeout policy, or timeout budgets inside this package.

Proof mapping: scenario-route and causal-model identify the selected route;
topology-convergence provides the concrete OPEN epoch-1 evidence; focused owner
tests or extractor proof must show reduction, classification, or migration.

Wrong-slice trigger: if proof requires operation workflow runtime, startup
readiness runtime, active-gate runtime, timeout-budget changes, or a non-
publication owner boundary, stop and migrate instead of editing locally.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the frontier oscillated back to a recently reduced
  publication boundary after a cross-owner residual classification.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package. Run review, fix if needed, and implementation
subagents sequentially before editing runtime or test files.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Codex (019e3a3b-622e-7700-bfb5-4c5deacd2137) reviewed work/packages/done-20260518-rolling-restart-topology-publication-owner-publication-conve.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Codex (019e3a3f-90e2-7372-b300-2f3aff1072f9) fixed work/packages/done-20260518-rolling-restart-topology-publication-owner-publication-conve.md.
- [x] Implementation subagent recorded: Agent Codex (019e3a45-9ece-7681-be2c-6ae8201f3e6f) implemented work/packages/done-20260518-rolling-restart-topology-publication-owner-publication-conve.md; result classification-only bounded active-gate owner reconcile proof, runtime-edit-not-needed.

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

1. work/packages/done-20260518-rolling-restart-topology-publication-owner-publication-conve.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/control-plane/publication-owner-evidence.js
7. src/control-plane/publication-owner-decision.js
8. src/control-plane/publication-recovery-gate.js
9. src/control-plane/publication-recovery-evidence.js
10. test/control-plane/publication-owner-stream.test.js
11. test/control-plane/publication-recovery-gate.test.js
12. test/control-plane/publication-recovery-evidence.test.js

## Out Of Scope

1. operation_workflow_owner/runtime
2. startup_active_gate_owner/runtime
3. startup_readiness_owner/runtime
4. harness-timeout-increase
5. timeout-budget-policy

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/frontier-oscillation`
- Output profile: `medium`
- Owned files: `work/packages/done-20260518-rolling-restart-topology-publication-owner-publication-conve.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-owner-evidence.js`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/publication-recovery-gate.js`, `src/control-plane/publication-recovery-evidence.js`, `test/control-plane/publication-owner-stream.test.js`, `test/control-plane/publication-recovery-gate.test.js`, `test/control-plane/publication-recovery-evidence.test.js`
- Forbidden files: `operation_workflow_owner/runtime`, `startup_active_gate_owner/runtime`, `startup_readiness_owner/runtime`, `harness-timeout-increase`, `timeout-budget-policy`
- Frozen decisions: rebalancer_handoff retry witnesses remain classified; package scope and lane stay bounded unless canonical evidence reselects a different owner.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, representative scenario evidence changes, or frontier oscillates without producer-consumer proof.
- Focused proof: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json`, `npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json
5. npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown

## Commit And Push Ledger

1. Focused package commit: `bc5efab3`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
