# Tell-Tale Scenario Suite Promotion Gate

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-25",
  "lane": "scenario-release-gate",
  "scenario": "tell-tale-suite",
  "artifact": "test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
  "playback": "none",
  "owner": "release_gate_owner",
  "boundary": "tell_tale_suite_repeatability",
  "dominantReason": "tell_tale_suite_repeatability_required",
  "currentState": "Active because the broader tell-tale suite cannot be promoted while the latest rolling-restart representative artifact still routes to startup_active_gate_owner / snapshot_coverage / active_gate_timed_out.",
  "nextAction": "Do not run the broader tell-tale suite yet; preserve the failed rolling-restart route evidence and keep one bounded active-gate snapshot coverage successor before suite promotion.",
  "proof": [
    "falsifier: contract transition fixture npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
    "regression: affected consumer proof npm run work:evidence-summary -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
    "supporting: npm run summarize:harness -- --report-dir test-output/reports"
  ],
  "theoryLedgerRefs": [
    "theory-20260513-rolling-restart-preflight-green-gate-confirmation",
    "theory-20260523-rolling-restart-recovery-reconcile-recursion-fix"
  ],
  "writeScope": [
    "work/packages/done-20260525-tell-tale-scenario-suite-promotion-gate.md"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-tell-tale-green-gate.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/done-20260525-tell-tale-scenario-suite-promotion-gate.md",
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
  "stabilityCredit": "local-proof-only",
  "representativeResidual": {
    "status": "same-frontier",
    "scenario": "tell-tale-suite",
    "artifact": "test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Keep one bounded active-gate snapshot coverage successor before suite promotion."
  },
  "representativeRerunCadence": "architecture-stop-reason",
  "observablePrediction": {
    "metric": "tell-tale suite promotion eligibility",
    "predicted": "blocked while rolling-restart is not representative green",
    "observed": "blocked while rolling-restart is not representative green",
    "accuracy": "matched",
    "evidence": "test-output/reports/rolling-restart-tell-tale-suite.report.json"
  },
  "causalGovernance": {
    "hypothesis": "The active sprint goal cannot promote the tell-tale suite until the representative rolling-restart gate stops routing to active-gate snapshot coverage.",
    "stopConditionCheck": "Use work:scenario-route, work:evidence-summary, npm run analyze:causal-model, and summarize:harness on the latest rolling-restart representative artifact before running broader tell-tale scenarios.",
    "expectedCausalModelChange": "The current package should block suite promotion and preserve the active-gate snapshot coverage successor as the first frontier.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "rolling-restart remains blocked at startup_active_gate_owner / snapshot_coverage / active_gate_timed_out.",
    "crossBoundaryReview": "Suite promotion stays under release_gate_owner; runtime changes remain in the active-gate successor boundary."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "tell-tale-suite-promotion-gate",
    "phaseChain": [
      "rolling-restart representative gate rerun completed",
      "route evidence selected startup_active_gate_owner / snapshot_coverage",
      "tell-tale suite promotion remains blocked until rolling-restart is green"
    ],
    "currentFirstFrontier": "release_gate_owner/tell_tale_suite_repeatability blocked by startup_active_gate_owner/snapshot_coverage",
    "knownDownstreamBlockers": [
      "tell-tale-suite-repeatability"
    ],
    "missingCausalEdge": "Rolling-restart representative-green evidence is missing.",
    "missingCausalEdgeProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
    "boundedProgressProof": "The package records that suite promotion is blocked by same-frontier rolling-restart evidence and preserves the active-gate reconcile/repair/timer successor before running unrelated scenarios.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
    "expectedObservableTransition": "suite promotion remains blocked until active_gate_snapshot_coverage clears or migrates",
    "maxProgressBound": "one classification gate",
    "sameFrontierFallback": "Keep the active-gate successor as the first frontier.",
    "expectedNextFrontier": "active_gate_snapshot_coverage",
    "resultClassification": "same-frontier",
    "stopCondition": "architecture-gap-stop",
    "recentFrontierHistory": [
      "done-20260525-rolling-restart-representative-green-gate.md / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out"
    ],
    "oscillationCheck": "The suite gate does not open another runtime patch; it preserves the selected active-gate successor.",
    "handoffInvariant": "Broader tell-tale scenarios are downstream of rolling-restart representative-green."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "selectedChoice": "open-architecture-package",
    "nextAction": "Keep the selected active-gate snapshot coverage architecture/runtime successor before broader tell-tale suite promotion.",
    "triggerEvidence": [
      "Fresh rolling-restart representative route selected startup_active_gate_owner / snapshot_coverage / active_gate_timed_out.",
      "The broader tell-tale suite is downstream of rolling-restart representative-green.",
      "Same-frontier rolling-restart evidence must stop suite promotion and preserve the active-gate successor."
    ],
    "choices": [
      {
        "id": "open-architecture-package",
        "summary": "Keep the active-gate snapshot coverage successor as the first frontier before suite promotion.",
        "route": "architecture-package",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
          "npm run work:evidence-summary -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json"
        ]
      }
    ]
  },
  "whyHighestLeverageNow": "This package protects the active sprint goal by preventing suite promotion while the representative gate still routes to the current first frontier.",
  "boundedExperiment": {
    "hypothesis": "A real stabilization result should keep rolling-restart green before node-join-under-load and admin-query-smoke are used for promotion.",
    "hypothesisDiscriminator": "If rolling-restart still routes to a first frontier, this package blocks broader suite promotion and preserves that owner/boundary.",
    "expectedMetric": "tell-tale scenario exit status, route outcome per artifact, and absence of unresolved first frontier",
    "inheritsFrom": "work/packages/done-20260525-rolling-restart-representative-green-gate.md",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence"
  },
  "validationTier": "release-gate",
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "architecture-gap-stop",
    "nextLane": "experiment",
    "expectedDelta": "Block broader tell-tale suite promotion until rolling-restart active-gate snapshot coverage clears, reduces, or migrates.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-tell-tale-green-gate.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
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
  "closed": "2026-05-25",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260525-rolling-restart-operation-workflow-owner-workflow-progress.md"
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

- Canonical outcome: release_gate_owner / tell_tale_suite_repeatability emits the package outcome for tell_tale_suite_repeatability_required.
- Inputs/signals: falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-tell-tale-suite.report.json --verbose; regression: node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --output test-output/reports/node-join-under-load-tell-tale-suite.report.json --verbose; supporting: node test/distributed/run.js --config test/distributed/config/local.json --scenario admin-query-smoke --output test-output/reports/admin-query-smoke-tell-tale-suite.report.json --verbose; supporting: npm run summarize:harness -- --report-dir test-output/reports.
- State model or invariant: The release_gate_owner / tell_tale_suite_repeatability decision table in the Causal Decision Contract maps tell_tale_suite_repeatability_required and route evidence to one emitted outcome: Run the tell-tale scenarios, require repeated clean route evidence, and open one bounded successor package for any remaining first frontier..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the release_gate_owner / tell_tale_suite_repeatability invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | release_gate_owner / tell_tale_suite_repeatability / tell_tale_suite_repeatability_required | release_gate_owner owns this decision before downstream consumers reinterpret it | Run the tell-tale scenarios, require repeated clean route evidence, and open one bounded successor package for any remaining first frontier. | repeated tell-tale pass evidence or one selected first frontier for successor packaging | falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-tell-tale-suite.report.json --verbose |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies release_gate_owner / tell_tale_suite_repeatability directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-tell-tale-suite.report.json --verbose`
- Competing explanations: At minimum compare tell_tale_suite_repeatability_required against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does release_gate_owner / tell_tale_suite_repeatability still own tell_tale_suite_repeatability_required, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: tell_tale_suite_repeatability_required is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-tell-tale-suite.report.json --verbose`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact none --owner release_gate_owner --boundary tell_tale_suite_repeatability --dominant-reason tell_tale_suite_repeatability_required`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: A real stabilization result should keep rolling-restart green and produce routeable pass evidence for node-join-under-load and admin-query-smoke.
- Hypothesis discriminator: Any tell-tale scenario failure must route to one owner/boundary successor rather than reopening broad stabilization work.
- Expected metric: tell-tale scenario exit status, route outcome per artifact, and absence of unresolved first frontier.
- Inherits from: `work/packages/todo-20260525-rolling-restart-representative-green-gate.md`
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
- Route boundary: `tell_tale_suite_repeatability`
- Route dominant reason: `tell_tale_suite_repeatability_required`
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

1. work/packages/done-20260525-tell-tale-scenario-suite-promotion-gate.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260525-tell-tale-scenario-suite-promotion-gate.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `supporting: npm run summarize:harness -- --report-dir test-output/reports`
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

- [x] action: implementation; owner: release_gate_owner; files-changed: none; validation: rerun scenario; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: release_gate_owner; files-changed: none; validation: rerun scenario; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

## Validation

1. falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-tell-tale-suite.report.json --verbose
2. regression: node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --output test-output/reports/node-join-under-load-tell-tale-suite.report.json --verbose
3. supporting: node test/distributed/run.js --config test/distributed/config/local.json --scenario admin-query-smoke --output test-output/reports/admin-query-smoke-tell-tale-suite.report.json --verbose
4. supporting: npm run summarize:harness -- --report-dir test-output/reports

<!-- Theory ledger update: no ledger update -->

## Commit And Push Ledger

1. Focused package commit: 13b07d163a72f5fb8e114a45ea9530d24c362369
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
