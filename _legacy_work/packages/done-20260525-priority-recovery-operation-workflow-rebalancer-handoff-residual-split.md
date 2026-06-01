# Priority Recovery Rebalancer Handoff Residual Split

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-25",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-rerun-4.report.json",
    "playback": "none",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_progress_blocked",
    "currentState": "Focused proof is green after repairing the operation-workflow owner retry-deferral and dispatch-pending re-entry paths. Retryable local claim pressure preserves owner progress, stale remote snapshot re-entry schedules bounded handoff verification without inline remote wake, owner-lane-held re-entry defers to one timer, and duplicate handoff witnesses preserve one active retry.",
    "nextAction": "Close this rebalancer_handoff package as focused bounded proof, then activate the workflow_progress successor package.",
    "closed": "2026-05-25"
  },
  "scope": {
    "writeScope": [
      "work/packages/done-20260525-priority-recovery-operation-workflow-rebalancer-handoff-residual-split.md",
      "work/packages/done-20260525-priority-recovery-operation-workflow-workflow-progress-residual-successor.md",
      "work/packages/done-20260525-rolling-restart-operation-workflow-route-rerun.md",
      "work/sprints/active-2026-q2-topology-operation-workflow-residual-closure.md",
      "work/tracks/topology-convergence.md",
      "work/releases/0.1-dependency-map.md",
      "src/rebalancer/operation-workflow-owner.js",
      "src/rebalancer/operation-workflow-owner-segment-2.js",
      "src/rebalancer/operation-workflow-owner-segment-3.js",
      "src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-rerun-4.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [
      "src/rebalancer/operation-workflow-owner.js",
      "src/rebalancer/operation-workflow-owner-segment-2.js",
      "src/rebalancer/operation-workflow-owner-segment-3.js",
      "src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js"
    ],
    "commitScope": [
      "work/packages/done-20260525-priority-recovery-operation-workflow-rebalancer-handoff-residual-split.md",
      "work/packages/done-20260525-priority-recovery-operation-workflow-workflow-progress-residual-successor.md",
      "work/packages/done-20260525-rolling-restart-operation-workflow-route-rerun.md",
      "work/sprints/active-2026-q2-topology-operation-workflow-residual-closure.md",
      "work/tracks/topology-convergence.md",
      "work/releases/0.1-dependency-map.md",
      "src/rebalancer/operation-workflow-owner.js",
      "src/rebalancer/operation-workflow-owner-segment-2.js",
      "src/rebalancer/operation-workflow-owner-segment-3.js",
      "src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package is the first package in the active operation-workflow residual closure sprint and blocks workflow-progress runtime promotion until the larger rebalancer_handoff residual group is proven or split.",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
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
      "falsifier: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-4.report.json --markdown",
      "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-rerun-4.report.json",
      "supporting: npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff",
      "focused: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The operation-workflow residual closure sprint should prove or split the rebalancer_handoff sibling group before workflow_progress runtime promotion.",
    "stopConditionCheck": "Use npm run analyze:causal-model -- test-output/reports/rolling-restart-rerun-4.report.json with residual extraction and scenario routing before runtime edits.",
    "expectedCausalModelChange": "Focused proof either proves rebalancer_handoff backpressure is bounded, splits the residual to a narrower package, or prevents workflow_progress promotion.",
    "representativeOutcome": "reduced",
    "causalDebt": "Latest residual extraction reports four rebalancer_handoff witnesses and two workflow_progress witnesses, all recovering_in_flight.",
    "crossBoundaryReview": "Do not edit startup readiness, active gate, publication, or workflow_progress runtime from this package while the rebalancer_handoff sibling group is unresolved. The only runtime exception is the focused operation workflow owner retry-deferral and dispatch-pending re-entry path exposed by the handoff proof."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart",
    "phaseChain": [
      "rolling-restart routes to priority_recovery_partition_progress",
      "residual extraction splits operation workflow witnesses across rebalancer_handoff and workflow_progress",
      "rebalancer_handoff residual proof must run before workflow_progress runtime promotion",
      "fresh representative route after operation workflow decides whether startup readiness can activate"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait with sibling operation_workflow_owner / rebalancer_handoff residual split",
    "knownDownstreamBlockers": [
      "operation_workflow_owner / rebalancer_handoff has four recovering_in_flight witnesses",
      "operation_workflow_owner / workflow_progress has two recovering_in_flight witnesses",
      "startup_readiness_owner / startup_support_evidence remains deferred until fresh route evidence promotes it"
    ],
    "missingCausalEdge": "Whether the four rebalancer_handoff witnesses are bounded backpressure or the next missing wake, retry, dispatch, or advance mechanism.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-4.report.json --markdown",
    "falsifyingProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-4.report.json --markdown",
    "boundedProgressProof": "Focused proof shows retryable coordinator-created transition failures preserve the owner-progress outcome, stale remote snapshot re-entry arms bounded handoff verification without inline wake, owner-lane-held re-entry defers to one timer, and duplicate handoff witnesses preserve one retry without duplicate wakeups.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-rerun-4.report.json",
    "expectedObservableTransition": "The rebalancer_handoff residual group is proven bounded, split to a narrower owner boundary, reduced, or escalated before workflow_progress activates.",
    "maxProgressBound": "one residual split/proof package before workflow_progress promotion",
    "sameFrontierFallback": "If residual extraction returns the same 4/2 split with no causal reduction, open an autonomous architecture experiment instead of another local operation-workflow patch.",
    "expectedNextFrontier": "operation_workflow_owner / workflow_progress after rebalancer_handoff is resolved, or architecture-gap if the split cannot be reduced",
    "resultClassification": "reduced",
    "stopCondition": "bounded-non-frontier",
    "recentFrontierHistory": [
      "done-20260525-topology-load-stabilization-route-selection.md / operation_workflow_owner / workflow_progress / migrated",
      "done-20260525-rolling-restart-operation-workflow-owner-workflow-progress.md / operation_workflow_owner / workflow_progress / reduced"
    ],
    "oscillationCheck": "The sprint orders the sibling residual groups explicitly to avoid bouncing between rebalancer_handoff and workflow_progress.",
    "handoffInvariant": "workflow_progress runtime promotion requires rebalancer_handoff residual proof or split first."
  },
  "representativeResidual": {
    "status": "active-split-proof",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-rerun-4.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_progress_blocked",
    "nextAction": "Close focused bounded proof and activate the workflow_progress successor."
  },
  "observablePrediction": {
    "metric": "priority recovery residual owner-boundary group count and rebalancer_handoff witness count",
    "predicted": "Focused proof will either reduce the rebalancer_handoff witness count below four, classify the four witnesses as bounded backpressure, or split them to a narrower owner boundary before workflow_progress runtime promotion.",
    "observed": "Focused proof passed: retryable local claim pressure preserves owner progress, stale remote snapshot re-entry schedules bounded handoff verification without inline wake, owner-lane-held re-entry defers to one timer, and duplicate handoff witnesses preserve one active retry.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-rerun-4.report.json",
    "metricDelta": 0
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-rerun-4.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "rebalancer_handoff",
    "routeDominantReason": "priority_recovery_progress_blocked",
    "routeCausalOutcome": "accept_classified_backpressure",
    "stopMode": "classified_backpressure",
    "nextLane": "causal-escalation",
    "expectedDelta": "Retryable transition deferral preserves the dispatch_local_owner outcome, stale remote snapshot re-entry arms bounded handoff verification without inline wake, and workflow_progress activation is now unblocked by focused rebalancer_handoff proof.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-rerun-4.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_progress_blocked",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "falsifier: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-4.report.json --markdown",
      "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-rerun-4.report.json",
      "focused: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-causal-escalation",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  }
}
-->

## Why

This is the first executable package in the new operation-workflow residual
closure sprint. It owns the precondition that the four-witness
`rebalancer_handoff` sibling group must be proven bounded, split away, or
escalated before `workflow_progress` runtime work can safely continue.

## Scope Basis

The prior route-selection package selected the operation-workflow successor and
deferred startup readiness. This package turns that decision into an active
sprint queue and validates the first residual split package.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: operation_workflow_owner / rebalancer_handoff emits the package outcome for priority_recovery_progress_blocked.
- Inputs/signals: test-output/reports/rolling-restart-rerun-4.report.json; falsifier: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-4.report.json --markdown; regression: npm run work:scenario-route -- test-output/reports/rolling-restart-rerun-4.report.json; supporting: npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff.
- State model or invariant: The operation_workflow_owner / rebalancer_handoff decision table in the Causal Decision Contract maps priority_recovery_progress_blocked and route evidence to one emitted outcome: accept_classified_backpressure.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the operation_workflow_owner / rebalancer_handoff invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | operation_workflow_owner / rebalancer_handoff / priority_recovery_progress_blocked | operation_workflow_owner owns this decision before downstream consumers reinterpret it | Prove or split the rebalancer_handoff residual group before any workflow_progress runtime promotion. | Either rebalancer_handoff residuals are proven bounded/split away, or the successor escalates before workflow_progress runtime edits. | falsifier: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-4.report.json --markdown |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies operation_workflow_owner / rebalancer_handoff directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `falsifier: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-4.report.json --markdown`
- Competing explanations: At minimum compare priority_recovery_progress_blocked against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does operation_workflow_owner / rebalancer_handoff still own priority_recovery_progress_blocked, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: priority_recovery_progress_blocked is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-4.report.json --markdown`
- Success metrics: Either rebalancer_handoff residuals are proven bounded/split away, or the successor escalates before workflow_progress runtime edits.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-rerun-4.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_progress_blocked`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-rerun-4.report.json`
- Expected delta: Either rebalancer_handoff residuals are proven bounded/split away, or the successor escalates before workflow_progress runtime edits.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-rerun-4.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `rebalancer_handoff`
- Route dominant reason: `priority_recovery_progress_blocked`
- Route causal outcome: `accept_classified_backpressure`
- Stop mode: `classified_backpressure`
- Next lane: `scenario-release-gate`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-causal-escalation`
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work.

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

1. work/packages/done-20260525-priority-recovery-operation-workflow-rebalancer-handoff-residual-split.md
2. work/packages/done-20260525-priority-recovery-operation-workflow-workflow-progress-residual-successor.md
3. work/packages/done-20260525-rolling-restart-operation-workflow-route-rerun.md
4. work/sprints/active-2026-q2-topology-operation-workflow-residual-closure.md
5. work/tracks/topology-convergence.md
6. work/releases/0.1-dependency-map.md
7. src/rebalancer/operation-workflow-owner.js
8. src/rebalancer/operation-workflow-owner-segment-2.js
9. src/rebalancer/operation-workflow-owner-segment-3.js
10. src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js

## Out Of Scope

1. Runtime ownership changes outside the operation workflow owner retry-deferral path.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260525-priority-recovery-operation-workflow-rebalancer-handoff-residual-split.md`, `work/packages/done-20260525-priority-recovery-operation-workflow-workflow-progress-residual-successor.md`, `work/packages/done-20260525-rolling-restart-operation-workflow-route-rerun.md`, `work/sprints/active-2026-q2-topology-operation-workflow-residual-closure.md`, `work/tracks/topology-convergence.md`, `work/releases/0.1-dependency-map.md`, `src/rebalancer/operation-workflow-owner.js`, `src/rebalancer/operation-workflow-owner-segment-2.js`, `src/rebalancer/operation-workflow-owner-segment-3.js`, `src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js`
- Forbidden files: runtime files outside `src/rebalancer/operation-workflow-owner.js`, `src/rebalancer/operation-workflow-owner-segment-2.js`, `src/rebalancer/operation-workflow-owner-segment-3.js`, and `src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-4.report.json --markdown`, `regression: npm run work:scenario-route -- test-output/reports/rolling-restart-rerun-4.report.json`, `supporting: npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff`, `focused: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
- Model ledger advisory: `escalate`
- Theory ledger: `not-applicable` - this sprint activation records package
  order and a falsifiable residual split; it does not add durable theory beyond
  the route-selection package and topology track.

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: planning and route selection; split executable children before implementation
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Use this package for route selection, owner/boundary decisions, and stop rules.
2. Create Spark-safe mechanical or test-only children once execution is unambiguous.
3. Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: operation_workflow_owner; files-changed: `src/rebalancer/operation-workflow-owner.js`, `src/rebalancer/operation-workflow-owner-segment-2.js`, `src/rebalancer/operation-workflow-owner-segment-3.js`, `src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js`, `work/packages/done-20260525-priority-recovery-operation-workflow-rebalancer-handoff-residual-split.md`; validation: `npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js` (230 pass) and parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: operation_workflow_owner; files-changed: `src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js`, `work/packages/done-20260525-priority-recovery-operation-workflow-rebalancer-handoff-residual-split.md`; validation: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-4.report.json --markdown`; `npm run work:scenario-route -- test-output/reports/rolling-restart-rerun-4.report.json`; `npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff`; `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-rerun-4.report.json`; `npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.
- theory ledger: no ledger update.

## Validation

1. falsifier: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-4.report.json --markdown
2. regression: npm run work:scenario-route -- test-output/reports/rolling-restart-rerun-4.report.json
3. supporting: npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff
4. focused: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
