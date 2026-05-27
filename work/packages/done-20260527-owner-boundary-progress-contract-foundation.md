# Owner Boundary Progress Contract Foundation

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-27",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "playback": "none",
    "owner": "diagnostics_owner",
    "boundary": "progress_contract_foundation",
    "dominantReason": "stranded_progress_contract_missing",
    "currentState": "Created todo package for the first owner-boundary progress-contract slice; runtime behavior is not authorized before vocabulary and diagnostics helpers are proven.",
    "nextAction": "Define the canonical progress contract vocabulary and minimal helpers for rolling-restart owner-boundary blockers."
  },
  "scope": {
    "writeScope": [
      "src/diagnostics/topology-convergence-constants.js",
      "src/diagnostics/topology-convergence-normalizers.js",
      "test/diagnostics/topology-convergence-graph.test.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "src/diagnostics/topology-convergence-constants.js",
      "src/diagnostics/topology-convergence-normalizers.js",
      "test/diagnostics/topology-convergence-graph.test.js",
      "work/packages/active-20260527-owner-boundary-progress-contract-foundation.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Advances this sprint goal by proving the shared contract vocabulary before runtime owners adopt it.",
    "representativeRerunCadence": "scheduled-rerun-command"
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
      "theory-20260526-rolling-restart-snapshot-viewpoint-backpressure"
    ],
    "theoryLedger": "no ledger update: This progress contract foundation package only defined the canonical vocabulary and diagnostics helpers; no reusable theory was added here.",
    "proof": {
      "commands": [
        "falsifier: npm test -- test/diagnostics/topology-convergence-graph.test.js # proof of progress-contract and topology-convergence-graph",
        "supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json # consumer-proof and contract-fixture",
        "regression: npm run audit:runtime-grammar:file -- src/diagnostics/topology-convergence-constants.js src/diagnostics/topology-convergence-normalizers.js # state and outcome grammar"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "src/diagnostics/topology-convergence-constants.js",
        "src/diagnostics/topology-convergence-owner-witness.js",
        "test/diagnostics/topology-convergence-graph.test.js"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    }
  },
  "boundedExperiment": {
    "hypothesis": "A minimal owner-boundary progress contract can describe rolling-restart stranded progress without changing runtime behavior.",
    "hypothesisDiscriminator": "H1 if diagnostics tests can normalize all required fields from constants/helpers; H2 if owner-local state requires per-boundary custom envelopes before shared vocabulary; H3 if existing fields already cover the contract with no new helpers.",
    "expectedMetric": "Topology convergence contract fixtures cover owner, boundary, state, reason, nextAction, wakeSource, retryAfterMs, terminalState, evidencePath, and blockingDependency.",
    "inheritsFrom": "none",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence"
  },
  "representativeResidual": {
    "status": "pending-before-rerun",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "frontier": "diagnostics_owner / progress_contract_foundation",
    "owner": "diagnostics_owner",
    "boundary": "progress_contract_foundation",
    "dominantReason": "stranded_progress_contract_missing",
    "nextAction": "Define the canonical progress contract vocabulary and minimal helpers for rolling-restart owner-boundary blockers."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "routeOwner": "diagnostics_owner",
    "routeBoundary": "progress_contract_foundation",
    "routeDominantReason": "stranded_progress_contract_missing",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "migrate-owner-boundary",
    "nextLane": "causal-escalation",
    "expectedDelta": "Diagnostics constants and normalizers successfully expose owner, boundary, state, reason, nextAction, wakeSource, retryAfterMs, terminalState, evidencePath, and blockingDependency.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --owner diagnostics_owner --boundary progress_contract_foundation --dominant-reason stranded_progress_contract_missing",
      "Update Sprint Strategy Brief and Current Edge Card to reflect the route result",
      "npm run work:repair or npm run work:current-blocker --write to sync blocker state",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "A minimal owner-boundary progress contract can describe rolling-restart stranded progress without changing runtime behavior.",
    "stopConditionCheck": "Use npm run analyze:causal-model on the latest representative artifact; latest: npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json.",
    "expectedCausalModelChange": "The diagnostics_owner / progress_contract_foundation progress contract vocabulary is established for diagnostics, focused topology tests, and future runtime-owner-boundary packages.",
    "representativeOutcome": "migrated",
    "causalDebt": "Recent rolling-restart priority recovery, active-gate coverage, and startup readiness work showed stranded progress because runtime boundaries lacked a shared contract for next actions, wake/retry, and terminal outcomes.",
    "crossBoundaryReview": "Do not edit runtime files or change runtime behavior from this package; keep changes limited to diagnostics constants, normalizers, and focused topology tests."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart",
    "phaseChain": [
      "established the first sprint active-sprint work package active-20260527-owner-boundary-progress-contract-foundation",
      "defining the canonical owner-boundary progress contract vocabulary",
      "verifying diagnostics constants and normalizers with focused topology tests"
    ],
    "currentFirstFrontier": "diagnostics_owner / progress_contract_foundation / stranded_progress_contract_missing",
    "knownDownstreamBlockers": [
      "stranded pending/retryable/deferred progress states without explicit contracts in subsequent owner boundaries"
    ],
    "missingCausalEdge": "The rolling-restart diagnostics and topology convergence must define the canonical progress contract vocabulary.",
    "missingCausalEdgeProbe": "npm test -- test/diagnostics/topology-convergence-graph.test.js",
    "falsifyingProbe": "npm test -- test/diagnostics/topology-convergence-graph.test.js",
    "boundedProgressProof": "Focused diagnostics tests prove that constants and normalizers express the canonical progress contract without runtime behavior changes, enabling a bounded progress advance or reconcile mechanism.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "expectedObservableTransition": "Diagnostics constants and normalizers successfully expose owner, boundary, state, reason, nextAction, wakeSource, retryAfterMs, terminalState, evidencePath, and blockingDependency.",
    "maxProgressBound": "one diagnostics foundation slice before diagnostics cutoff",
    "sameFrontierFallback": "If focused tests fail to normalize the contract fields, stop/reopen the foundation experiment instead of adding local patches.",
    "expectedNextFrontier": "workflow_tooling_owner / progress_contract_guardrails",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260527-rolling-restart-startup-readiness-admin-reachability-support.md",
      "done-20260527-rolling-restart-startup-readiness-owner-startup-support-evid.md"
    ],
    "oscillationCheck": "Escalated to causal-escalation lane to prove the shared progress contract foundation and escape adjacent startup-readiness oscillation.",
    "handoffInvariant": "This package is diagnostics-only and behavior-neutral; no runtime owner files or logic are modified."
  },
  "validationTier": "cross-owner",
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "single owner-boundary execution after higher-model route selection",
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
    "childPackageCandidates": [
      "Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.",
      "Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.",
      "Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.",
      "Keep cross-file owner runtime integration in this package unless it contracts to one runtime file."
    ]
  },
  "theoryLedger": "no ledger update: This progress contract foundation package only defined the canonical vocabulary and diagnostics helpers; no reusable theory was added here."
}
-->

## Why

This package owns the contract vocabulary that all later sprint packages depend
on. It is deliberately diagnostics-owned and behavior-neutral so the first move
proves the language before runtime owners adopt it.

## Scope Basis

Sprint package 1 in
`work/sprints/done-2026-q2-owner-boundary-progress-contract-transformation.md`;
scope is limited to diagnostics constants, normalizers, and focused topology
contract tests.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: diagnostics_owner / progress_contract_foundation emits the shared contract vocabulary for stranded_progress_contract_missing.
- Inputs/signals: npm test -- test/diagnostics/topology-convergence-graph.test.js; npm run audit:runtime-grammar:file -- src/diagnostics/topology-convergence-constants.js src/diagnostics/topology-convergence-normalizers.js.
- State model or invariant: The diagnostics_owner / progress_contract_foundation decision table in the Causal Decision Contract maps stranded_progress_contract_missing and route evidence to one emitted outcome: Define the canonical progress contract vocabulary and minimal helpers for rolling-restart owner-boundary blockers..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the diagnostics_owner / progress_contract_foundation invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | diagnostics_owner / progress_contract_foundation / stranded_progress_contract_missing | diagnostics_owner owns this decision before downstream consumers reinterpret it | Define the canonical progress contract vocabulary and minimal helpers for rolling-restart owner-boundary blockers. | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | npm test -- test/diagnostics/topology-convergence-graph.test.js |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies diagnostics_owner / progress_contract_foundation directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `npm test -- test/diagnostics/topology-convergence-graph.test.js`
- Competing explanations: At minimum compare stranded_progress_contract_missing against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does diagnostics_owner / progress_contract_foundation still own stranded_progress_contract_missing, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: stranded_progress_contract_missing is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/diagnostics/topology-convergence-graph.test.js`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --owner diagnostics_owner --boundary progress_contract_foundation --dominant-reason stranded_progress_contract_missing`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: A minimal owner-boundary progress contract can describe rolling-restart stranded progress without changing runtime behavior.
- Hypothesis discriminator: H1 if diagnostics tests can normalize all required fields from constants/helpers; H2 if owner-local state requires per-boundary custom envelopes before shared vocabulary; H3 if existing fields already cover the contract with no new helpers.
- Expected metric: Topology convergence contract fixtures cover owner, boundary, state, reason, nextAction, wakeSource, retryAfterMs, terminalState, evidencePath, and blockingDependency.
- Inherits from: `none`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: focused test plus canonical route or evidence command
- Kill rule: same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json`
- Route owner: `diagnostics_owner`
- Route boundary: `progress_contract_foundation`
- Route dominant reason: `stranded_progress_contract_missing`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `not-needed-inline-gate`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Keep classification inside the package unless route truth changes.
- Successor action: `update-current-package`
- Runtime promotion rule: Stable owner/boundary routes move to runtime-owner-boundary work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/todo-20260527-owner-boundary-progress-contract-foundation.md` or `npm run work:package:schema`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json`.
3. Owner discovery: `npm run analyze:owner-files -- diagnostics_owner progress_contract_foundation`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role verifier-fixer --package work/packages/todo-20260527-owner-boundary-progress-contract-foundation.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to the commands in the Validation section plus `npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json` when representative context is needed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. src/diagnostics/topology-convergence-constants.js
2. src/diagnostics/topology-convergence-normalizers.js
3. test/diagnostics/topology-convergence-graph.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/diagnostics/topology-convergence-constants.js`, `src/diagnostics/topology-convergence-normalizers.js`, `test/diagnostics/topology-convergence-graph.test.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/diagnostics/topology-convergence-graph.test.js`, `npm run audit:runtime-grammar:file -- src/diagnostics/topology-convergence-constants.js src/diagnostics/topology-convergence-normalizers.js`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: single owner-boundary execution after higher-model route selection
- Safe to execute when:
1. owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.
2. Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.
3. Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.
4. Keep cross-file owner runtime integration in this package unless it contracts to one runtime file.

## Execution Evidence

theory-ledger: not-needed

no ledger update: This progress contract foundation package only defined the canonical vocabulary and diagnostics helpers; no reusable theory was added here.

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: diagnostics_owner; files-changed: src/diagnostics/topology-convergence-constants.js, src/diagnostics/topology-convergence-owner-witness.js, test/diagnostics/topology-convergence-graph.test.js; validation: npm test -- test/diagnostics/topology-convergence-graph.test.js; outcome: passed focused proof plus parent revalidated focused proof: yes.
- [x] action: verification-fix; owner: diagnostics_owner; files-changed: none; validation: npm test -- test/diagnostics/topology-convergence-graph.test.js; outcome: passed verification proof plus parent revalidated focused proof: yes.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/packages/active-20260527-owner-boundary-progress-contract-foundation.md; validation: `npm run work:repair`; outcome: passed.

## Validation

1. npm test -- test/diagnostics/topology-convergence-graph.test.js
2. npm run audit:runtime-grammar:file -- src/diagnostics/topology-convergence-constants.js src/diagnostics/topology-convergence-normalizers.js
