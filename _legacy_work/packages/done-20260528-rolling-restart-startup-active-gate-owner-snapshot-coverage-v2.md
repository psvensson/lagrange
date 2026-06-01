# Rolling Restart Startup Active Gate Owner Snapshot Coverage v2

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-28",
    "closed": "2026-05-28",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-check-success-20260528T0722.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Representative evidence selects startup_active_gate_owner / snapshot_coverage at active_gate_snapshot_coverage; the package records the bounded next decision before runtime edits.",
    "nextAction": "Triage active_gate_snapshot_coverage with combined scenario evidence before runtime edits."
  },
  "scope": {
    "writeScope": [
      "work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v2.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-check-success-20260528T0722.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v2.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal with focused proof."
  },
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260526-rolling-restart-selected-snapshot-source-staleness",
      "theory-20260522-snapshot-watch-fixture",
      "theory-20260522-snapshot-watch-handoff-contract"
    ],
    "proof": {
      "commands": [
        "falsifier: npm run work:evidence-summary -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json",
        "regression: npm run work:scenario-triage -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json --markdown",
        "supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json --markdown"
      ]
    }
  },
  "representativeResidual": {
    "status": "same-frontier",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-check-success-20260528T0722.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Triage active_gate_snapshot_coverage with combined scenario evidence before runtime edits."
  },
  "causalGovernance": {
    "hypothesis": "The prefiltering patch cleared the active gate snapshot timeout but revealed a downstream event driven priority wait; we must triage active gate snapshot coverage in the new representative evidence.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json",
    "expectedCausalModelChange": "The causal triage identifies whether the active gate snapshot timeout remains the critical bottleneck or a different cause is dominant.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Fresh representative evidence reports active gate snapshot coverage timeout under the new prefiltering logic.",
    "crossBoundaryReview": "Do not edit runtime files before the causal triage and decision experiment are closed."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active gate snapshot triage",
    "phaseChain": [
      "owner-reconcile admission runtime successfully admitted reconcile progress",
      "prefiltering runtime patch bypassed stale snapshots successfully",
      "fresh representative rerun still failed active_gate_snapshot_coverage with active_gate_timed_out dominant reason"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness inherits active-gate snapshot coverage failure",
      "priority recovery event driven wait remains downstream"
    ],
    "missingCausalEdge": "We need to identify why active gate snapshot coverage is still incomplete after prefiltering bypassed stale snapshots.",
    "missingCausalEdgeProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json",
    "falsifyingProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json",
    "boundedProgressProof": "Causal triage determines the precise state, facts, and next owner-boundary action to reconcile and retry.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-check-success-20260528T0722.report.json",
    "expectedObservableTransition": "Triage selects the next runtime owner or boundary action.",
    "maxProgressBound": "one classification package before further runtime edits",
    "sameFrontierFallback": "If triage cannot determine a concrete path, stop as architecture-gap.",
    "expectedNextFrontier": "selected runtime-owner-boundary successor",
    "resultClassification": "same-frontier",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260528-rolling-restart-owner-reconcile-admission-runtime.md / startup_active_gate_owner / snapshot_coverage_owner_reconcile_retry_contract / migrated",
      "done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / startup_active_gate_owner / snapshot_coverage / continue-local-fix"
    ],
    "oscillationCheck": "This causal triage package ensures we do not patch runtime without clear evidence-driven routing.",
    "handoffInvariant": "Runtime promotion remains blocked while snapshot coverage is incomplete."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "fresh representative rerun is same-frontier active gate snapshot coverage timeout"
    ],
    "selectedChoice": "open-architecture-package",
    "choices": [
      {
        "id": "open-architecture-package",
        "summary": "Use this package as the autonomous architecture experiment before choosing the next runtime successor.",
        "route": "architecture-package",
        "proof": [
          "npm run work:evidence-summary -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json",
          "npm run work:scenario-triage -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json --markdown",
          "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json --markdown"
        ]
      }
    ],
    "nextAction": "Open the autonomous architecture experiment package before runtime implementation resumes."
  },
  "mechanismCard": {
    "failureMechanism": "transition_gap",
    "stableFacts": "owner_reconcile_pending resolved; active_gate_snapshot_coverage incomplete observed",
    "changedFacts": "none",
    "rejectedAlternatives": "observation_gap",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "triage active gate snapshot coverage",
    "missingTransitionOrObservation": "none",
    "smallestFalsifyingProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json",
    "expectedMovement": "none",
    "negativeResultMeans": "none",
    "escalationRule": "none"
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "planning and route selection; split executable children before implementation",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared",
      "the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence",
      "the first focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond the declared lower-model lane",
      "proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection",
      "the implementation needs to decide system behavior instead of executing a named local mechanism"
    ],
    "childCandidates": [
      "Use this package for route selection, owner/boundary decisions, and stop rules.",
      "Create Spark-safe mechanical or test-only children once execution is unambiguous.",
      "Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected."
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json",
      "npm run work:scenario-triage -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json --markdown",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json --markdown"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-check-success-20260528T0722.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-check-success-20260528T0722.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  }
}
-->

## Why

This package owns startup_active_gate_owner / snapshot_coverage because the selected evidence routes active_gate_timed_out there. It must either move that owner contract or preserve the classification before downstream symptoms are patched.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-check-success-20260528T0722.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits Triage active_gate_snapshot_coverage with combined scenario evidence before runtime edits. for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-check-success-20260528T0722.report.json; Triage active_gate_snapshot_coverage with combined scenario evidence before runtime edits..
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: Triage active_gate_snapshot_coverage with combined scenario evidence before runtime edits..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Triage active_gate_snapshot_coverage with combined scenario evidence before runtime edits. | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | npm run work:evidence-summary -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-check-success-20260528T0722.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-check-success-20260528T0722.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-check-success-20260528T0722.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-runtime-owner-boundary`
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v2.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v2.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role review --package work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v2.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. Focused package-owned edit.

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v2.md`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json --markdown`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: planning and route selection; split executable children before implementation
- Safe to execute when:
1. owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Use this package for route selection, owner/boundary decisions, and stop rules.
2. Create Spark-safe mechanical or test-only children once execution is unambiguous.
3. Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: startup_active_gate_owner; files-changed: none; validation: npm run work:evidence-summary -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json and parent revalidated focused proof: yes; outcome: same-frontier.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: none; validation: verifier reruns focused proof and parent revalidated focused proof: yes; outcome: same-frontier.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: npm run work:repair; outcome: success.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json
2. npm run work:scenario-triage -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json --markdown
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json --markdown

## High-Risk Acknowledgment

This package operates as an autonomous architecture experiment; traditional local runtime theories are not-applicable.
Planned-new-theory will be recorded if triage uncovers a fresh mechanism.
