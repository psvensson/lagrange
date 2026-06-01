# Rolling Restart Representative Green Gate

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-25",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
  "playback": "none",
  "owner": "release_gate_owner",
  "boundary": "rolling_restart_green_gate_confirmation",
  "dominantReason": "representative_rerun_required",
  "currentState": "Queued after the active-gate contract/runtime and final-adjudication packages. This package owns the representative rerun and route decision rather than another local symptom patch.",
  "nextAction": "Run fresh rolling-restart, route the artifact, and close as representative-green, reduced, migrated, or same-frontier with exactly one successor package.",
  "proof": [
    "falsifier: contract transition fixture node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-tell-tale-green-gate.report.json --verbose",
    "regression: representative routing evidence npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json # test/distributed/run.js",
    "supporting: affected consumer proof npm run work:evidence-summary -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json"
  ],
  "theoryLedgerRefs": [
    "theory-20260513-rolling-restart-preflight-green-gate-confirmation",
    "theory-20260523-rolling-restart-recovery-reconcile-recursion-fix"
  ],
  "causalGovernance": {
    "hypothesis": "After the active-gate contract/runtime and final-adjudication packages, rolling-restart should either pass cleanly or route to one narrower first frontier.",
    "stopConditionCheck": "Run fresh rolling-restart, route the artifact, and run npm run analyze:causal-model before closure.",
    "expectedCausalModelChange": "Representative rerun completes cleanly and routes either to green or a narrower first frontier.",
    "representativeOutcome": "representative-green",
    "causalDebt": "Representative rerun and routing confirmation is needed.",
    "crossBoundaryReview": "Release gate confirmation is aligned with the release owner boundary."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart-representative-green-gate",
    "phaseChain": [
      "run fresh rolling-restart",
      "route the artifact",
      "verify final adjudication completes"
    ],
    "currentFirstFrontier": "release_gate_owner/rolling_restart_green_gate_confirmation",
    "knownDownstreamBlockers": [
      "representative-green-gate"
    ],
    "missingCausalEdge": "Representative rerun and routing confirmation",
    "missingCausalEdgeProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-tell-tale-green-gate.report.json --verbose",
    "falsifyingProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-tell-tale-green-gate.report.json --verbose",
    "boundedProgressProof": "The final adjudication drain mechanism successfully concludes the scenario execution.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
    "expectedObservableTransition": "rolling-restart executes cleanly and routes successfully",
    "maxProgressBound": "one representative rerun",
    "sameFrontierFallback": "Stop for autonomous architecture experiment if same-frontier.",
    "expectedNextFrontier": "green",
    "resultClassification": "classified_local_blocker",
    "stopCondition": "classified_local_blocker",
    "recentFrontierHistory": [
      "done-20260525-rolling-restart-final-adjudication-harness-fix.md / distributed_harness_verdict_owner / timeout_core_state_adjudication / run_final_adjudication_not_defined"
    ],
    "oscillationCheck": "no oscillation",
    "handoffInvariant": "Harness final adjudication is bound and resolved."
  },
  "writeScope": [
    "work/packages/active-20260525-rolling-restart-representative-green-gate.md"
  ],
  "handoffFiles": [],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/active-20260525-rolling-restart-representative-green-gate.md",
    "work/sprints/active-2026-q2-tell-tale-scenario-reliability.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/tracks/topology-convergence.md"
  ],
  "modelFit": {
    "packageClass": "scenario-release-gate",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ],
    "ambiguityScore": 1
  },
  "stabilityCredit": "representative-green",
  "observablePrediction": {
    "metric": "rolling-restart exit status, route outcome, active=5/5, snapshotCoverage=5/5, missingPublished=0",
    "predicted": "scenario executes cleanly and routes successfully to green",
    "observed": "active_gate_timed_out",
    "accuracy": "missed",
    "evidence": "test-output/reports/rolling-restart-tell-tale-green-gate.report.json"
  },
  "whyHighestLeverageNow": "This package is the release-gate proof that converts active-gate contract/runtime work into a routeable rolling-restart result instead of relying on local proof.",
  "boundedExperiment": {
    "hypothesis": "After the active-gate contract/runtime and final-adjudication packages, rolling-restart should either pass cleanly or route to one narrower first frontier.",
    "hypothesisDiscriminator": "Representative-green requires clean scenario exit and route evidence without unresolved first frontier; otherwise the route command selects the next bounded owner/boundary.",
    "expectedMetric": "rolling-restart exit status, route outcome, active=5/5, snapshotCoverage=5/5, missingPublished=0",
    "inheritsFrom": "work/packages/todo-20260525-tell-tale-active-gate-snapshot-coverage-runtime-successor.md",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence"
  },
  "validationTier": "release-gate",
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
    "sourceArtifact": "test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
    "routeOwner": "release_gate_owner",
    "routeBoundary": "rolling_restart_green_gate_confirmation",
    "routeDominantReason": "representative_rerun_required",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-tell-tale-green-gate.report.json --owner release_gate_owner --boundary rolling_restart_green_gate_confirmation --dominant-reason representative_rerun_required",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-25",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md"
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

- Canonical outcome: release_gate_owner / rolling_restart_green_gate_confirmation emits the package outcome for representative_rerun_required.
- Inputs/signals: falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-tell-tale-green-gate.report.json --verbose; regression: npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json; supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json.
- State model or invariant: The release_gate_owner / rolling_restart_green_gate_confirmation decision table in the Causal Decision Contract maps representative_rerun_required and route evidence to one emitted outcome: Run fresh rolling-restart, route the artifact, and close as representative-green, reduced, migrated, or same-frontier with exactly one successor package..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the release_gate_owner / rolling_restart_green_gate_confirmation invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | release_gate_owner / rolling_restart_green_gate_confirmation / representative_rerun_required | release_gate_owner owns this decision before downstream consumers reinterpret it | Run fresh rolling-restart, route the artifact, and close as representative-green, reduced, migrated, or same-frontier with exactly one successor package. | representative-green or one selected first frontier for successor packaging | falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-tell-tale-green-gate.report.json --verbose |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies release_gate_owner / rolling_restart_green_gate_confirmation directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-tell-tale-green-gate.report.json --verbose`
- Competing explanations: At minimum compare representative_rerun_required against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does release_gate_owner / rolling_restart_green_gate_confirmation still own representative_rerun_required, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: representative_rerun_required is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-tell-tale-green-gate.report.json --verbose`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact none --owner release_gate_owner --boundary rolling_restart_green_gate_confirmation --dominant-reason representative_rerun_required`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: After the active-gate contract/runtime and final-adjudication packages, rolling-restart should either pass cleanly or route to one narrower first frontier.
- Hypothesis discriminator: Representative-green requires clean scenario exit and route evidence without unresolved first frontier; otherwise the route command selects the next bounded owner/boundary.
- Expected metric: rolling-restart exit status, route outcome, active=5/5, snapshotCoverage=5/5, missingPublished=0.
- Inherits from: `work/packages/todo-20260525-tell-tale-active-gate-snapshot-coverage-runtime-successor.md`
- Timebox: `24h`
- Validation tier: `release-gate`
- Merge requirement: focused test plus canonical route or evidence command
- Kill rule: same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.


## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `release_gate_owner`
- Route boundary: `rolling_restart_green_gate_confirmation`
- Route dominant reason: `representative_rerun_required`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
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
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. work/packages/todo-20260525-rolling-restart-representative-green-gate.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/todo-20260525-rolling-restart-representative-green-gate.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:advance -- --check`
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
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: release_gate_owner; files-changed: work/packages/active-20260525-rolling-restart-representative-green-gate.md; validation: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-tell-tale-green-gate.report.json --verbose and parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: release_gate_owner; files-changed: none; validation: npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json and parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

## Validation

1. falsifier: contract transition fixture node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-tell-tale-green-gate.report.json --verbose
2. regression: representative routing evidence npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json # test/distributed/run.js
3. supporting: affected consumer proof npm run work:evidence-summary -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json
