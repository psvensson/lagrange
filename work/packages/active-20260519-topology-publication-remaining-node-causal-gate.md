# Topology Publication Remaining Node Causal Gate

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-19",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Fresh reduced representative evidence still selects publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending, with active-gate handoff pendingReconcileCount=1, activeGateOwnerCohortMissingPublishedCount=1, runtimePromotionAllowed=false, priority residual witnesses=0, and an oscillation guard requiring causal classification before another local runtime patch.",
  "nextAction": "Classify the remaining one-node publication target as local runtime, owner-boundary migration, architecture gap, or human route before another runtime patch.",
  "proof": [
    "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json",
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json"
  ],
  "writeScope": [
    "work/packages/active-20260519-topology-publication-remaining-node-causal-gate.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260519-topology-publication-multi-node-reconcile-runtime.md",
    "test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/active-node-projection.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js"
  ],
  "commitScope": [
    "work/packages/active-20260519-topology-publication-remaining-node-causal-gate.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/active-node-projection.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js"
  ],
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "cross-boundary-architecture-gate/fresh-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Classify the remaining one-node publication target before another local runtime patch."
  },
  "causalGovernance": {
    "hypothesis": "The remaining one-node publication_pending shape may still be topology_publication_owner / publication_convergence debt, but repeated same-boundary packages require a causal gate before another local runtime patch. Fresh evidence reduced pendingReconcileCount to 1, activeGateOwnerCohortMissingPublishedCount to 1, priority residual witnesses to 0, and kept runtimePromotionAllowed=false.",
    "stopConditionCheck": "Before selecting runtime work, use route-after-rerun, handoff probe, npm run analyze:causal-model, scenario-route, and priority residuals to decide local runtime, owner-boundary migration, architecture gap, or human route.",
    "expectedCausalModelChange": "The causal gate should select one falsifiable successor route for the remaining one-node publication target before implementation scope is promoted.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh artifact test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json remains red at publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending with active-gate handoff pendingReconcileCount=1, activeGateOwnerCohortMissingPublishedCount=1, runtimePromotionAllowed=false, priority residual witnesses=0, and causal outcome continue_local_fix.",
    "crossBoundaryReview": "Required before implementation; this causal gate must compare publication owner, active-gate consumer, operation workflow residuals, and stale-evidence explanations before selecting a runtime successor."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart remaining one-node publication target after multi-node reduction",
    "phaseChain": [
      "multi-node owner reconcile runtime reduced pendingReconcileCount from 4 to 1",
      "priority residual witnesses reduced from 3 to 0",
      "publication_ack_convergence remains first frontier",
      "oscillation guard requires causal route selection before another local runtime patch"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json.",
    "knownDownstreamBlockers": [
      "activeGateState=stalled",
      "snapshotCoverageNodeCount=2/5",
      "handoffContract.state=pending",
      "pendingReconcileCount=1",
      "activeGateOwnerCohortMissingPublishedCount=1",
      "runtimePromotionAllowed=false",
      "priority recovery residual witnesses=0 with splitRequired=false"
    ],
    "missingCausalEdge": "The sprint must decide whether the remaining one-node publication target is a local publication owner runtime gap, a consumer handoff contract gap, stale evidence, owner-boundary migration, or architecture stop before another local patch.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --handoff-probe plus npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json",
    "boundedProgressProof": "Causal gate proof must select one successor route and record whether the remaining target needs a publication owner reconcile mechanism, owner-boundary migration, architecture package, or human escalation before another runtime patch.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json",
    "expectedObservableTransition": "Selected route becomes local runtime, owner-boundary migration, architecture-gap, human route, or representative-green if a rerun greens without code.",
    "maxProgressBound": "one causal gate before any further runtime owner-boundary package",
    "sameFrontierFallback": "If the causal gate cannot identify a falsifiable local runtime edge, stop for architecture or human escalation instead of local patching.",
    "expectedNextFrontier": "selected runtime successor, owner-boundary migration, architecture/human stop, or representative green",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260519-topology-publication-same-frontier-architecture-gate.md / topology_publication_owner / publication_convergence / same-frontier",
      "work/packages/done-20260519-topology-publication-operation-residual-decision-gate.md / topology_publication_owner / publication_convergence / successor-selected",
      "work/packages/done-20260519-topology-publication-open-owner-reconcile-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260519-topology-publication-multi-node-reconcile-runtime.md / topology_publication_owner / publication_convergence / reduced"
    ],
    "oscillationCheck": "The same owner boundary has returned across related packages; this package is a causal-escalation guard before another local runtime patch.",
    "handoffInvariant": "Operation workflow, startup active-gate runtime, startup readiness, admission, and timeout budgets remain frozen unless this causal gate selects them from canonical evidence."
  },
  "architectureDecisionGate": {
    "status": "required",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "fresh reduced artifact still selects publication_ack_convergence first",
      "pendingReconcileCount and activeGateOwnerCohortMissingPublishedCount are reduced to 1 but not cleared",
      "priority residual witnesses are 0 and splitRequired=false",
      "active-gate runtimePromotionAllowed=false",
      "tracker oscillation guard rejects another immediate runtime package"
    ],
    "choices": [
      {
        "id": "remaining-node-local-runtime",
        "summary": "Select one bounded topology publication owner runtime successor for the remaining one-node publication target.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --handoff-probe",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json"
        ]
      },
      {
        "id": "architecture-or-human-stop",
        "summary": "Stop local runtime patching if the remaining target cannot be tied to a falsifiable publication owner edge.",
        "route": "architecture-package",
        "proof": [
          "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json",
          "npm run work:scenario-route -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence"
        ]
      }
    ],
    "selectedChoice": "pending",
    "nextAction": "Run causal gate proof and select a successor route before runtime implementation."
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json",
      "npm run work:scenario-triage -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --markdown",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --markdown"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Clear pendingReconcileCount=1 and activeGateOwnerCohortMissingPublishedCount=1 for the remaining publication target, migrate the owner boundary, turn rolling-restart green, or trigger architecture/human stop.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --pre-impl"
    ]
  }
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: topology_publication_owner / publication_convergence emits the package outcome for publication_pending.
- Inputs/signals: test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --markdown.
- State model or invariant: The topology_publication_owner / publication_convergence decision table in the Causal Decision Contract maps publication_pending and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: src/rebalancer/operation-workflow-owner.js; startup-active-gate-runtime; startup-readiness-runtime; admission-runtime; timeout-runtime.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / publication_convergence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_pending | topology_publication_owner owns this decision before downstream consumers reinterpret it | Run required review/fix/implementation subagent sequencing, then implement one bounded topology publication owner runtime slice for the remaining one-node OPEN epoch-2 publication_pending target. | Clear pendingReconcileCount=1 and activeGateOwnerCohortMissingPublishedCount=1 for the remaining publication target, migrate the owner boundary, turn rolling-restart green, or trigger architecture/human stop. | npm run work:evidence-summary -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json |
| scope boundary | src/rebalancer/operation-workflow-owner.js; startup-active-gate-runtime; startup-readiness-runtime; admission-runtime; timeout-runtime | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies topology_publication_owner / publication_convergence directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json`
- Competing explanations: At minimum compare publication_pending against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does topology_publication_owner / publication_convergence still own publication_pending, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: publication_pending is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json`
- Success metrics: Clear pendingReconcileCount=1 and activeGateOwnerCohortMissingPublishedCount=1 for the remaining publication target, migrate the owner boundary, turn rolling-restart green, or trigger architecture/human stop.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json`
- Expected delta: Clear pendingReconcileCount=1 and activeGateOwnerCohortMissingPublishedCount=1 for the remaining publication target, migrate the owner boundary, turn rolling-restart green, or trigger architecture/human stop.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json`
- Route owner: `topology_publication_owner`
- Route boundary: `publication_convergence`
- Route dominant reason: `publication_pending`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
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

1. work/packages/active-20260519-topology-publication-remaining-node-causal-gate.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

## Out Of Scope

1. src/rebalancer/operation-workflow-owner.js
2. startup-active-gate-runtime
3. startup-readiness-runtime
4. admission-runtime
5. timeout-runtime

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260519-topology-publication-remaining-node-causal-gate.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `src/rebalancer/operation-workflow-owner.js`, `startup-active-gate-runtime`, `startup-readiness-runtime`, `admission-runtime`, `timeout-runtime`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Subagent Progress And Attempt Ledger

Required when subagent sequencing is required. Each real subagent appends one checked checkpoint after every completed subtask; this combined ledger satisfies both Progress and Attempt proof when the item includes status, last checkpoint, parent action, evidence, and next or blocker.
Review agents may directly fix metadata-only package, sprint, tracker, current-blocker, ledger, or handoff findings and record `review-fixed-metadata-only`; runtime, test, script, report, or non-metadata fixes still require a separate fix subagent.

- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: started; last checkpoint: context loaded; parent action: pending; evidence: package, sprint, and handoff files read; next: first focused probe.
- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: running; last checkpoint: probe complete; parent action: pending; evidence: command and result; next: edit, validate, or blocker handoff.
- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: validated; last checkpoint: package proof refreshed; parent action: revalidated; evidence: commands and results; next: final handoff or successor action.
- [ ] Agent <name> (<agent-id>) <role> recovery: status: superseded; last checkpoint: replaced interrupted or partial-unvalidated attempt; parent action: superseded; evidence: superseding proof; next: continue from clean checkpoint.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json
2. npm run work:scenario-triage -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --markdown
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --markdown
