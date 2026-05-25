# Topology Load Stabilization Route Selection

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-25",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "diagnostics_owner",
    "boundary": "causal_analysis_framework",
    "dominantReason": "representative_gate_route_selection_needed",
    "currentState": "Route selection is complete: the latest rolling-restart artifact selects operation_workflow_owner / workflow_progress with priority_recovery_event_driven_wait, while the heavy-load baseline has no topology frontier and migrates the deferred load-readiness concern to startup_readiness_owner / startup_support_evidence.",
    "nextAction": "Open the operation_workflow_owner / workflow_progress successor first; it must split or prove the rebalancer_handoff residual group before runtime edits, then rerun representative evidence before promoting startup_readiness_owner / startup_support_evidence.",
    "closed": "2026-05-25"
  },
  "scope": {
    "writeScope": [
      "work/packages/done-20260525-topology-load-stabilization-route-selection.md",
      "work/tracks/topology-convergence.md",
      "work/releases/0.1-dependency-map.md"
    ],
    "handoffFiles": [
      "test-output/reports/topology-load-baseline.report.json",
      "test-output/reports/rolling-restart-rerun-4.report.json",
      "test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/done-20260525-topology-load-stabilization-route-selection.md",
      "work/tracks/topology-convergence.md",
      "work/releases/0.1-dependency-map.md"
    ]
  },
  "gates": {
    "stabilityCredit": "instrumentation-only",
    "whyHighestLeverageNow": "This advances the rolling-restart and heavy-load representative stabilization gates by selecting one shared successor boundary from the latest route evidence before runtime work resumes."
  },
  "modelFit": {
    "packageClass": "discovery-framing",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": [
      "falsifier: npm run work:scenario-route -- test-output/reports/topology-load-baseline.report.json",
      "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-rerun-4.report.json",
      "supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The next stabilization package should follow the freshest rolling-restart representative route unless heavy-load evidence names the same or a higher-priority owner boundary.",
    "stopConditionCheck": "Canonical route proof plus npm run analyze:causal-model -- test-output/reports/topology-load-baseline.report.json distinguish the rolling-restart and heavy-load routes without runtime edits.",
    "expectedCausalModelChange": "None; this package repairs durable route truth and selects the next owner boundary.",
    "representativeOutcome": "migrated",
    "causalDebt": "Heavy-load evidence still names startup readiness support after active-gate snapshot timeout, but rolling-restart currently fronts operation workflow progress with split priority-recovery residual groups.",
    "crossBoundaryReview": "Do not collapse operation workflow and startup readiness into one runtime patch. Operation workflow backpressure is the immediate representative route; startup readiness remains the deferred load route after a fresh rerun."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart and seven-node-read-write-load-transaction-recovery",
    "phaseChain": [
      "rolling-restart routes to priority_recovery_partition_progress",
      "priority residuals split across operation_workflow_owner / rebalancer_handoff and operation_workflow_owner / workflow_progress",
      "heavy-load topology convergence reports publication, priority recovery, active gate, and readiness witnesses satisfied but causal taxonomy selects startup_readiness_blocked",
      "prior rolling-restart load-readiness evidence still shows active_gate_snapshot_coverage as the producer prerequisite for startup readiness"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "operation_workflow_owner / rebalancer_handoff has four priority-recovery residual witnesses",
      "operation_workflow_owner / workflow_progress has two priority-recovery residual witnesses",
      "startup_readiness_owner / startup_support_evidence remains deferred for heavy-load snapshot_timeout evidence"
    ],
    "missingCausalEdge": "The next package must prove whether operation workflow backpressure is bounded by rebalancer handoff or workflow progress before runtime promotion.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-4.report.json --markdown",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/topology-load-baseline.report.json",
    "boundedProgressProof": "Route-selection proof identifies no shared runtime boundary; priority residuals are recovering_in_flight and require the successor to prove a wake, retry, dispatch, or advance mechanism before runtime promotion.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-rerun-4.report.json; test-output/reports/topology-load-baseline.report.json",
    "expectedObservableTransition": "The successor package either proves/splits operation-workflow residuals or reruns representative evidence to expose startup readiness as the next frontier.",
    "maxProgressBound": "route selection only; no runtime edits",
    "sameFrontierFallback": "If the successor rerun returns the same priority_recovery_event_driven_wait shape with no split reduction, open an architecture experiment instead of another local operation-workflow patch.",
    "expectedNextFrontier": "operation_workflow_owner / workflow_progress, with rebalancer_handoff residual split checked first",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260525-topology-load-convergence-discovery.md / startup_readiness_owner / startup_support_evidence / migrated",
      "done-20260525-rolling-restart-operation-workflow-owner-workflow-progress.md / operation_workflow_owner / workflow_progress / reduced",
      "done-20260522-rolling-restart-load-readiness-snapshot-force-repair.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "no single shared runtime route; priority order recorded to avoid bouncing between operation workflow and startup readiness",
    "handoffInvariant": "runtime promotion requires one stable owner boundary plus a fresh rerun after the selected proof"
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-rerun-4.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "workflow_progress",
    "routeDominantReason": "priority_recovery_event_driven_wait",
    "routeCausalOutcome": "accept_classified_backpressure",
    "stopMode": "classified_backpressure",
    "nextLane": "scenario-release-gate",
    "expectedDelta": "Prove or split the operation-workflow priority-recovery residual groups, then rerun representative evidence before promoting startup readiness work.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-rerun-4.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair for current-blocker refresh",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "separate-package-approved",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:scenario-route -- test-output/reports/rolling-restart-rerun-4.report.json",
      "npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-4.report.json --markdown",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-4.report.json --markdown"
    ],
    "decisionRecord": "Select operation_workflow_owner / workflow_progress as the immediate successor because it is the current rolling-restart representative route. Defer startup_readiness_owner / startup_support_evidence until operation-workflow backpressure clears or fresh evidence makes startup readiness first frontier.",
    "successorAction": "open-causal-escalation",
    "runtimePromotionRule": "The successor must prove/split priority-recovery residual groups before runtime edits; startup readiness work requires a fresh rerun or route-after-rerun that makes it first frontier."
  }
}
-->

## Why

The stabilization plan had two current representative signals: rolling-restart
still selects operation workflow progress, while the heavy-load baseline has no
topology frontier and migrates its deferred load-readiness concern to startup
readiness support evidence. This package owns the durable route decision so the
next implementation package starts from one boundary instead of reopening a
cross-track stabilization discussion.

## Scope Basis

Roadmap and release-map truth repair for the 0.1 topology-convergence
stabilization path. Scope is limited to this package, the topology-convergence
track, and the 0.1 dependency map.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: bounded package, track, and release-map truth repair with no runtime, test, script, or scenario implementation changes.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.

## Discovery Gate

- Symptom / decision question: Which owner boundary should finish the
  stabilization plan after the latest rolling-restart and heavy-load evidence?
- Current evidence: `rolling-restart-rerun-4.report.json` routes to
  `operation_workflow_owner / workflow_progress`; `topology-load-baseline.report.json`
  has no topology frontier and migrates to
  `startup_readiness_owner / startup_support_evidence`; the prior
  load-readiness force-repair report still shows
  `startup_active_gate_owner / snapshot_coverage` as producer-side support.
- Candidate owners / boundaries:
  `operation_workflow_owner / workflow_progress`,
  `operation_workflow_owner / rebalancer_handoff`,
  `startup_readiness_owner / startup_support_evidence`, and
  `startup_active_gate_owner / snapshot_coverage`.
- Competing hypotheses: rolling-restart backpressure is the immediate release
  blocker; heavy-load startup readiness is the next blocker only after
  operation workflow backpressure clears or fresh evidence promotes it.
- Cheapest discriminator:
  `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-4.report.json --markdown`.
- Do not edit yet: runtime, tests, scripts, and scenario harness files.
- Selected route: open the `operation_workflow_owner / workflow_progress`
  successor first, with required residual split/proof for
  `operation_workflow_owner / rebalancer_handoff`.
- Promotion rule: startup readiness work needs a fresh rerun or route result
  that makes startup readiness the first frontier.



## Expected Representative Delta

- Baseline artifact:
  `test-output/reports/rolling-restart-rerun-4.report.json`.
- Falsifying load artifact:
  `test-output/reports/topology-load-baseline.report.json`.
- Supporting prior load-readiness artifact:
  `test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json`.
- Expected delta: durable tracker state selects
  `operation_workflow_owner / workflow_progress` as the immediate successor and
  records startup readiness support as deferred load-route debt.
- Local proof class: canonical route and focused causal extractor proof only;
  no representative-green claim is made.
- Representative proof class: the successor package must rerun or route
  representative evidence after residual split/proof.
- Stop if unchanged: if the successor rerun returns the same
  `priority_recovery_event_driven_wait` shape with no residual split reduction,
  open an architecture experiment instead of another local operation-workflow
  patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-rerun-4.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `workflow_progress`
- Route dominant reason: `priority_recovery_event_driven_wait`
- Route causal outcome: `accept_classified_backpressure`
- Stop mode: `classified_backpressure`
- Next lane: `scenario-release-gate`
- Required after rerun: route-after-rerun or representative proof, priority
  residual split/proof, current-blocker refresh, and pre-implementation
  validation for the successor package.

## Classification Efficiency

- Default mode: `separate-package-approved`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands` for the
  selected rolling-restart classifier. The load artifacts are recorded in the
  package proof ladder as falsifier/supporting evidence, not as extra classifier
  budget.
- Decision record: Select `operation_workflow_owner / workflow_progress` as the
  immediate successor because it is the latest rolling-restart representative
  route. Defer `startup_readiness_owner / startup_support_evidence` until
  operation-workflow backpressure clears or fresh evidence makes startup
  readiness first frontier.
- Successor action: `open-causal-escalation`
- Runtime promotion rule: The successor must prove or split priority-recovery
  residual groups before runtime edits; startup readiness work requires fresh
  route evidence.

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
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. work/packages/done-20260525-topology-load-stabilization-route-selection.md
2. work/tracks/topology-convergence.md
3. work/releases/0.1-dependency-map.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `discovery-framing`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/packages/done-20260525-topology-load-stabilization-route-selection.md`, `work/tracks/topology-convergence.md`, `work/releases/0.1-dependency-map.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npm run work:scenario-route -- test-output/reports/topology-load-baseline.report.json`, `regression: npm run work:scenario-route -- test-output/reports/rolling-restart-rerun-4.report.json`, `supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: bounded local edit after owner, scope, proof, and forbidden files are named
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Prefer mechanical-maintenance for docs/templates/schema-only edits.
2. Prefer test-only-proof for tests that do not change runtime behavior.
3. Prefer bounded-experiment for one same-owner hypothesis with inherited context.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: diagnostics_owner; files-changed: work/packages/done-20260525-topology-load-stabilization-route-selection.md, work/tracks/topology-convergence.md, work/releases/0.1-dependency-map.md; validation: `npm run work:scenario-route -- test-output/reports/topology-load-baseline.report.json`; `npm run work:scenario-route -- test-output/reports/rolling-restart-rerun-4.report.json`; `npm run work:evidence-summary -- test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json`; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: diagnostics_owner; files-changed: work/packages/done-20260525-topology-load-stabilization-route-selection.md; validation: `npm run work:validate -- --entry work/packages/done-20260525-topology-load-stabilization-route-selection.md`; `npm run work:validate -- --pre-impl work/packages/done-20260525-topology-load-stabilization-route-selection.md`; `npm --silent run analyze:causal-model -- test-output/reports/topology-load-baseline.report.json`; `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-4.report.json --markdown`; `npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-4.report.json --markdown`; `git diff --check -- work/packages/done-20260525-topology-load-stabilization-route-selection.md work/tracks/topology-convergence.md work/releases/0.1-dependency-map.md`; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

theory ledger: no ledger update; reason: route truth is recorded in this
package, the topology-convergence track, and the 0.1 dependency map. No durable
theory entry is needed.

## Validation

1. falsifier: npm run work:scenario-route -- test-output/reports/topology-load-baseline.report.json
2. regression: npm run work:scenario-route -- test-output/reports/rolling-restart-rerun-4.report.json
3. supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json
