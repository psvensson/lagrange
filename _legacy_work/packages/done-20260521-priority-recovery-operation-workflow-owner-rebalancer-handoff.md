# Priority Recovery operation_workflow_owner rebalancer_handoff Residual

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-21",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "rebalancer_handoff",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "New package scaffolded from the shared work-package schema.",
  "nextAction": "Fix restarted node eligibility check in control plane readiness service.",
  "proof": [
    "test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --markdown",
    "npm test -- test/control-plane/control-plane-readiness-service.test.js"
  ],
  "writeScope": [
    "src/control-plane/control-plane-readiness-service-segment-2.js"
  ],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/control-plane/control-plane-readiness-service-segment-2.js"
  ],
  "commitScope": [
    "src/control-plane/control-plane-readiness-service-segment-2.js"
  ],
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
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "planning and route selection; split executable children before implementation",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared",
      "the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence",
      "the first focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond the declared lower-model lane",
      "proof requires forbidden scope, cross-owner reasoning, or architecture route selection",
      "the implementation needs to decide system behavior instead of executing a named local mechanism"
    ],
    "childPackageCandidates": [
      "Use this package for route selection, owner/boundary decisions, and stop rules.",
      "Create Spark-safe mechanical or test-only children once execution is unambiguous.",
      "Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected."
    ]
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "rebalancer_handoff",
    "routeDominantReason": "priority_recovery_progress_blocked",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "continue_local_fix",
    "nextLane": "scenario-release-gate",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs a bounded successor before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_progress_blocked",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The priority recovery residual rebalancing is deadlocked due to circular node_not_ready states.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
    "expectedCausalModelChange": "No runtime causal model change is expected in this experiment; it should distinguish whether the next package is runtime-owner-boundary or architecture-contract work.",
    "representativeOutcome": "reduced",
    "causalDebt": "The baseline remains red at publication_ack_convergence until this experiment proves whether the priority recovery rebalancer residual can progress or if split/recovery logic must bypass the publication wait.",
    "crossBoundaryReview": "Required before runtime promotion because this experiment spans operation workflow, active-gate, readiness, and diagnostics."
  },
  "scenarioCausalClosure": {
    "falsifyingProbe": "npm test -- test/control-plane/control-plane-readiness-service.test.js",
    "referenceScenarioOrProbe": "rolling-restart priority recovery rebalancer residual probe",
    "phaseChain": [
      "publication convergence",
      "operation workflow residuals",
      "startup active-gate snapshot coverage",
      "startup readiness support evidence",
      "diagnostics and causal routing"
    ],
    "currentFirstFrontier": "priority_recovery_progress_blocked / operation_workflow_owner / rebalancer_handoff / recovering_in_flight",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner / snapshot_coverage remains deferred at snapshotCoverage=3/5",
      "startup_readiness_owner / startup_support_evidence remains inherited behind active-gate no progress",
      "diagnostics_owner / causal_analysis_framework reports publication_ack_blocked and owner queue depth unknown"
    ],
    "missingCausalEdge": "The control_plane_publications-p1 priority recovery residual is recovering_in_flight but rebalancer skips it due to node_not_ready (repair_ineligible).",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --markdown",
    "boundedProgressProof": "The probe must analyze the rebalancer reconcile, wake, and drain progression to distinguish whether priority recovery residual can progress or if partition split/recovery logic must bypass the wait.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
    "expectedObservableTransition": "recovering_in_flight -> rebalance progress or explicit deadlock bypass route",
    "maxProgressBound": "one priority recovery residual analysis probe",
    "sameFrontierFallback": "open an architecture-contract package instead of a same-frontier runtime patch",
    "expectedNextFrontier": "runtime-owner-boundary package or architecture-contract package based on discriminator",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260521-topology-publication-reconcile-system-theory: same-frontier publication_ack_convergence",
      "done-20260521-rolling-restart-theory-baseline-probe: same-frontier publication_ack_convergence"
    ],
    "oscillationCheck": "watching: this package exists because H3 distinguished the priority recovery residual as the true predecessor blocking publication",
    "handoffInvariant": "publication owner outcome + operation workflow residual status + active-gate precondition + readiness support state + diagnostics route"
  }
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: operation_workflow_owner / rebalancer_handoff emits the package outcome for priority_recovery_progress_blocked.
- Inputs/signals: test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json; npm test -- test/control-plane/control-plane-readiness-service.test.js.
- State model or invariant: The operation_workflow_owner / rebalancer_handoff decision table in the Causal Decision Contract maps priority_recovery_progress_blocked and route evidence to one emitted outcome: pending-before-rerun.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the operation_workflow_owner / rebalancer_handoff invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | operation_workflow_owner / rebalancer_handoff / priority_recovery_progress_blocked | operation_workflow_owner owns this decision before downstream consumers reinterpret it | Fix restarted node eligibility check in control plane readiness service. | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs a bounded successor before runtime promotion. | npm test -- test/control-plane/control-plane-readiness-service.test.js |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies operation_workflow_owner / rebalancer_handoff directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm test -- test/control-plane/control-plane-readiness-service.test.js`
- Competing explanations: At minimum compare priority_recovery_progress_blocked against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does operation_workflow_owner / rebalancer_handoff still own priority_recovery_progress_blocked, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: priority_recovery_progress_blocked is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/control-plane/control-plane-readiness-service.test.js`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs a bounded successor before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_progress_blocked`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs a bounded successor before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `rebalancer_handoff`
- Route dominant reason: `priority_recovery_progress_blocked`
- Route causal outcome: `continue_local_fix`
- Stop mode: `continue_local_fix`
- Next lane: `scenario-release-gate`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `not-needed-inline-gate`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Keep classification inside the package unless route truth changes.
- Successor action: `update-current-package`
- Runtime promotion rule: Stable owner/boundary routes move to runtime-owner-boundary work.

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
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. src/control-plane/control-plane-readiness-service-segment-2.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/control-plane/control-plane-readiness-service-segment-2.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/control-plane/control-plane-readiness-service.test.js`
- Model ledger advisory: `escalate`

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
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: `node test/control-plane/control-plane-readiness-service.test.js` passed all 101 tests (100% pass rate); parent revalidated focused proof: yes; next: closure or successor action.
- [x] verification-fix: status: validated; evidence: `npm run work:validate -- --pre-impl` and other checks like `check-guideline-literals.js`, `check-guideline-decision-boundaries.js`, and `audit:runtime-grammar:file` passed completely with no violations; changed files: `src/control-plane/control-plane-readiness-service-segment-2.js`; parent revalidated focused proof: yes; next: closure or successor action.
- [x] repair: status: validated; evidence: `npm run work:repair` ran successfully and current-blocker was refreshed; next: validation.

## Validation

1. npm test -- test/control-plane/control-plane-readiness-service.test.js

