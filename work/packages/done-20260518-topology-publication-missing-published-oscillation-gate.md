# Topology Publication Missing Published Oscillation Gate

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-18",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "missing_published_nodes_present",
  "currentState": "Post-implementation representative evidence stayed on publication_ack_convergence / topology_publication_owner / publication_convergence and returned to missing_published_nodes_present after a focused UNKNOWN/no-debt runtime slice passed locally.",
  "nextAction": "Human direction selected the canonical continue_local_fix route from route-after-rerun; close this gate and open a bounded runtime-owner-boundary successor before any runtime edits.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json",
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present --explain publication_ack_convergence --markdown",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260518-topology-publication-missing-published-oscillation-gate.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260518-topology-publication-unknown-no-debt-pending-runtime.md",
    "test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/done-20260518-topology-publication-missing-published-oscillation-gate.md"
  ],
  "modelFit": {
    "packageClass": "causal-escalation-owner-handoff",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "same-frontier",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "missing_published_nodes_present",
    "nextAction": "Open a bounded runtime-owner-boundary successor for topology_publication_owner / publication_convergence / missing_published_nodes_present using the fresh route-after-rerun result."
  },
  "causalGovernance": {
    "hypothesis": "The sprint is oscillating inside topology_publication_owner / publication_convergence: focused owner slices reduce one representative shape, but the next representative run reopens a prior missing-published frontier without priority residual witnesses or active-gate runtime promotion.",
    "stopConditionCheck": "Use route-after-rerun, evidence-summary, scenario-route, npm run analyze:causal-model, priority residual extraction, and the predecessor package proof to decide whether this is architecture/human escalation, a replayable handoff fixture need, or an allowed bounded runtime successor.",
    "expectedCausalModelChange": "This package should not change runtime; it should classify the same-frontier oscillation and decide whether another local runtime package is allowed.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Fresh artifact test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json reports active=0/5, snapshotCoverage=0/5, pendingAckCount=0, missingPublishedCount=5, priority residual witnesses=0, active-gate runtimePromotionAllowed=false, and first frontier publication_ack_convergence / topology_publication_owner / publication_convergence.",
    "crossBoundaryReview": "Required before any new runtime-owner-boundary implementation package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart same-frontier publication oscillation after UNKNOWN/no-debt runtime slice",
    "phaseChain": [
      "predecessor reduced missingPublishedCount from 5 to 0",
      "focused UNKNOWN/no-debt runtime slice passed local owner tests",
      "post-implementation representative returned to missingPublishedCount=5",
      "priority residual witnesses remained zero",
      "active-gate runtime promotion remained false"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / missing_published_nodes_present in test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json.",
    "knownDownstreamBlockers": [
      "startup active-gate snapshot coverage remains deferred on selected_snapshot_source_timeout",
      "operation workflow priority residual witnesses are zero",
      "startup readiness inherits active-gate no-progress evidence"
    ],
    "missingCausalEdge": "The sprint lacks a stable causal explanation for why same-owner publication runtime slices reduce one artifact shape but the next representative reopens a prior missing-published shape.",
    "missingCausalEdgeProbe": "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present",
    "boundedProgressProof": "Bounded progress mechanism is stopped local patching after one runtime slice and representative rerun; the next progress mechanism must be architecture or human classification before another runtime implementation.",
    "boundedProgressProofArtifact": "work/packages/done-20260518-topology-publication-unknown-no-debt-pending-runtime.md and test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json",
    "expectedObservableTransition": "This package should classify the oscillation as human-escalation, architecture-gap, rerun-needed, or explicitly approved bounded runtime successor.",
    "maxProgressBound": "one causal-escalation handoff package before any runtime successor",
    "sameFrontierFallback": "If no concrete architecture or human route is selected, do not open another local runtime package.",
    "expectedNextFrontier": "human/architecture direction or an explicitly approved bounded runtime successor",
    "resultClassification": "same-frontier",
    "stopCondition": "human-escalation",
    "recentFrontierHistory": [
      "work/packages/done-20260518-topology-publication-unknown-missing-published-nodes-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md / topology_publication_owner / publication_convergence / same-frontier",
      "work/packages/done-20260518-topology-publication-owner-publishing-visibility.md / topology_publication_owner / publication_convergence / reduced"
    ],
    "oscillationCheck": "Frontier returned to a recently reduced missing-published publication shape after the UNKNOWN/no-debt publication_pending slice.",
    "handoffInvariant": "No startup active-gate, operation workflow, readiness, admission, handoff architecture, or timeout runtime edit may start from this package without an explicit selected route."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "same owner and boundary reselected after focused runtime proof",
      "dominant reason returned to missing_published_nodes_present",
      "priority residual witnesses are zero",
      "active-gate runtime promotion remains false"
    ],
    "choices": [
      {
        "id": "human-directed-runtime-successor",
        "summary": "Human direction selected the canonical continue_local_fix route; open a bounded runtime-owner-boundary successor while keeping non-publication owners frozen.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present",
          "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json"
        ]
      }
    ],
    "selectedChoice": "human-directed-runtime-successor",
    "nextAction": "Close this causal gate and open the bounded runtime-owner-boundary successor before runtime implementation starts."
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present --explain publication_ack_convergence --markdown",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "missing_published_nodes_present",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Open one bounded topology publication owner runtime successor for the reselected missing-published publication frontier; representative proof should then reduce, migrate, close, or trigger a renewed architecture/human gate.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-18",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260518-topology-publication-missing-published-runtime-after-oscillation.md"
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: topology_publication_owner / publication_convergence emits the package outcome for missing_published_nodes_present.
- Inputs/signals: test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json; npm run work:scenario-route -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present --explain publication_ack_convergence --markdown; npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --markdown.
- State model or invariant: Collect evidence, normalize one topology_publication_owner / publication_convergence snapshot, then use one explicit state model, decision table, or invariant to emit one canonical outcome and reasons.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / publication_convergence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs a bounded successor before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json`
- Route owner: `topology_publication_owner`
- Route boundary: `publication_convergence`
- Route dominant reason: `missing_published_nodes_present`
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

1. work/packages/done-20260518-topology-publication-missing-published-oscillation-gate.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `causal-escalation-owner-handoff`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260518-topology-publication-missing-published-oscillation-gate.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json`, `npm run work:scenario-route -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present --explain publication_ack_convergence --markdown`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Subagent Progress Ledger

Required when subagent sequencing is required. Each real subagent appends one checked update after every completed subtask; the Sequencing Ledger remains the role-completion proof.

- [x] not-needed causal-escalation handoff: no runtime, test, script, or report
  write scope is active; evidence: `npm run work:advance -- --check` reports
  next required subagent role `none`; next: real subagent sequencing resumes if
  the selected route promotes this gate into implementation scope.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json
2. npm run work:scenario-route -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present --explain publication_ack_convergence --markdown
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json
4. npm run work:scenario-triage -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --markdown
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --markdown

## Commit And Push Ledger

1. Focused package commit: c8db7e05
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
