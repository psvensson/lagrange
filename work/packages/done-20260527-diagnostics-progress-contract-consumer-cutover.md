# Diagnostics Progress Contract Consumer Cutover

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
    "boundary": "topology_convergence_progress_contract",
    "dominantReason": "scattered_progress_inference",
    "currentState": "Created todo package for the diagnostics cutover after contract vocabulary exists; topology convergence must consume owner-emitted progress contracts.",
    "nextAction": "Make topology convergence and causal routing prefer explicit progress contracts over scattered inferred fields."
  },
  "scope": {
    "writeScope": [
      "src/diagnostics/topology-convergence-graph.js",
      "src/diagnostics/topology-convergence-edge-resolvers.js",
      "src/diagnostics/topology-convergence-normalizers.js",
      "scripts/analyze-topology-convergence.js",
      "test/diagnostics/topology-convergence-graph.test.js",
      "src/diagnostics/causal-graph-builder.js",
      "src/diagnostics/topology-convergence-owner-witness.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "src/diagnostics/topology-convergence-graph.js",
      "src/diagnostics/topology-convergence-edge-resolvers.js",
      "src/diagnostics/topology-convergence-normalizers.js",
      "scripts/analyze-topology-convergence.js",
      "test/diagnostics/topology-convergence-graph.test.js",
      "work/packages/done-20260527-diagnostics-progress-contract-consumer-cutover.md",
      "src/diagnostics/causal-graph-builder.js",
      "src/diagnostics/topology-convergence-owner-witness.js"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Advances this sprint goal by cutting over the consumer that selects first frontiers so diagnostics stop inferring owner state from symptoms.",
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
    "theoryLedger": "no ledger update: This diagnostics cutover package only modified consumer logic and routing to prefer progress contracts; no new durable theory was added here.",
    "proof": {
      "commands": [
        "falsifier: npm test -- test/diagnostics/topology-convergence-graph.test.js test/diagnostics/stop-condition-decision.test.js",
        "regression: npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "src/diagnostics/topology-convergence-graph.js",
        "src/diagnostics/topology-convergence-normalizers.js",
        "src/diagnostics/topology-convergence-owner-witness.js",
        "src/diagnostics/causal-graph-builder.js",
        "test/diagnostics/topology-convergence-graph.test.js"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    }
  },
  "boundedExperiment": {
    "hypothesis": "Topology convergence can select first frontiers from explicit progress contracts rather than scattered symptom fields.",
    "hypothesisDiscriminator": "H1 if contract-backed fixtures produce same or narrower routes; H2 if missing owner fields force runtime conversion first; H3 if current inference already produces all contract fields.",
    "expectedMetric": "Diagnostic route selection no longer depends on unrelated downstream symptoms for converted progress states.",
    "inheritsFrom": "none",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence"
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
  "theoryLedger": "no ledger update: This diagnostics cutover package only modified consumer logic and routing to prefer progress contracts; no new durable theory was added here.",
  "causalGovernance": {
    "hypothesis": "Topology convergence diagnostics must consume explicit progress contracts to prevent scattered ping-pong symptom fixes.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "expectedCausalModelChange": "Diagnostics convergence selects first frontiers based on owner progress contract instead of inferred symptoms.",
    "representativeOutcome": "migrated",
    "causalDebt": "Diagnostics routing initially relies on ad-hoc inferred fields which are now cuts over to the explicit contract.",
    "crossBoundaryReview": "Review with topology convergence and progress contract foundation definitions."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart seed-contact-bounded-progress",
    "phaseChain": [
      "diagnostics cutover"
    ],
    "currentFirstFrontier": "diagnostics_owner / topology_convergence_progress_contract",
    "knownDownstreamBlockers": [
      "startup readiness remaining retryable state"
    ],
    "missingCausalEdge": "diagnostics consumes explicit progress contract",
    "missingCausalEdgeProbe": "npm test -- test/diagnostics/topology-convergence-graph.test.js",
    "falsifyingProbe": "npm test -- test/diagnostics/topology-convergence-graph.test.js",
    "boundedProgressProof": "The topology convergence graph consumes progress contracts with explicit retry, wake, timeout, and terminal status to advance the routing.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "expectedObservableTransition": "diagnostics prefers progress contract",
    "maxProgressBound": "one diagnostics cutover slice",
    "sameFrontierFallback": "autonomous architecture experiment",
    "expectedNextFrontier": "diagnostics_owner / topology_convergence_progress_contract",
    "resultClassification": "pending-before-probe",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260527-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "diagnostics consumes progress contract to prevent oscillating symptom-only fixes on the same artifact.",
    "handoffInvariant": "diagnostics changes prefer progress contract and do not invent runtime behaviors."
  },
  "progressContract": {
    "owner": "diagnostics_owner",
    "boundary": "topology_convergence_progress_contract",
    "state": "progress_contract_cutover",
    "reason": "Make topology convergence and causal routing prefer explicit progress contracts over scattered inferred fields.",
    "nextAction": "prefer progress contract",
    "wakeSource": "diagnostics",
    "retryAfterMs": 1000,
    "terminalState": "satisfied",
    "evidencePath": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "blockingDependency": "no other blocking dependencies"
  },
  "representativeResidual": {
    "status": "live",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "frontier": "diagnostics_owner / topology_convergence_progress_contract -> startup_readiness_owner / startup_support_evidence",
    "owner": "diagnostics_owner",
    "boundary": "topology_convergence_progress_contract",
    "dominantReason": "scattered_progress_inference",
    "nextAction": "Cutover topology convergence to consume progress contracts."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "routeOwner": "diagnostics_owner",
    "routeBoundary": "topology_convergence_progress_contract",
    "routeDominantReason": "scattered_progress_inference",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "migrate-owner-boundary",
    "nextLane": "causal-escalation",
    "expectedDelta": "Diagnostics convergence selects first frontiers based on owner progress contract instead of inferred symptoms.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --owner diagnostics_owner --boundary topology_convergence_progress_contract --dominant-reason scattered_progress_inference",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "src/diagnostics/topology-convergence-graph.js",
      "src/diagnostics/topology-convergence-normalizers.js",
      "src/diagnostics/topology-convergence-owner-witness.js",
      "src/diagnostics/causal-graph-builder.js",
      "test/diagnostics/topology-convergence-graph.test.js"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  }
}
-->

## Why

This package owns the consumer side of the contract. It prevents diagnostics
from reintroducing narrow ping-pong fixes by requiring first-frontier selection
to prefer owner-emitted progress evidence over scattered symptom inference.

## Scope Basis

Sprint package 3 in
`work/sprints/todo-2026-q2-owner-boundary-progress-contract-transformation.md`;
scope is limited to topology convergence diagnostics, edge resolution,
normalization, and focused diagnostic tests.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: diagnostics_owner / topology_convergence_progress_contract emits contract-backed first-frontier routing for scattered_progress_inference.
- Inputs/signals: npm test -- test/diagnostics/topology-convergence-graph.test.js test/diagnostics/stop-condition-decision.test.js; npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json.
- State model or invariant: The diagnostics_owner / topology_convergence_progress_contract decision table in the Causal Decision Contract maps scattered_progress_inference and route evidence to one emitted outcome: Make topology convergence and causal routing prefer explicit progress contracts over scattered inferred fields..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the diagnostics_owner / topology_convergence_progress_contract invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | diagnostics_owner / topology_convergence_progress_contract / scattered_progress_inference | diagnostics_owner owns this decision before downstream consumers reinterpret it | Make topology convergence and causal routing prefer explicit progress contracts over scattered inferred fields. | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | npm test -- test/diagnostics/topology-convergence-graph.test.js test/diagnostics/stop-condition-decision.test.js |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies diagnostics_owner / topology_convergence_progress_contract directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `npm test -- test/diagnostics/topology-convergence-graph.test.js test/diagnostics/stop-condition-decision.test.js`
- Competing explanations: At minimum compare scattered_progress_inference against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does diagnostics_owner / topology_convergence_progress_contract still own scattered_progress_inference, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: scattered_progress_inference is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/diagnostics/topology-convergence-graph.test.js test/diagnostics/stop-condition-decision.test.js`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --owner diagnostics_owner --boundary topology_convergence_progress_contract --dominant-reason scattered_progress_inference`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: Topology convergence can select first frontiers from explicit progress contracts rather than scattered symptom fields.
- Hypothesis discriminator: H1 if contract-backed fixtures produce same or narrower routes; H2 if missing owner fields force runtime conversion first; H3 if current inference already produces all contract fields.
- Expected metric: Diagnostic route selection no longer depends on unrelated downstream symptoms for converted progress states.
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
- Route boundary: `topology_convergence_progress_contract`
- Route dominant reason: `scattered_progress_inference`
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

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/todo-20260527-diagnostics-progress-contract-consumer-cutover.md` or `npm run work:package:schema`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json`.
3. Owner discovery: `npm run analyze:owner-files -- diagnostics_owner topology_convergence_progress_contract`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role verifier-fixer --package work/packages/todo-20260527-diagnostics-progress-contract-consumer-cutover.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to the commands in the Validation section plus `npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json` when representative context is needed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. src/diagnostics/topology-convergence-graph.js
2. src/diagnostics/topology-convergence-edge-resolvers.js
3. src/diagnostics/topology-convergence-normalizers.js
4. scripts/analyze-topology-convergence.js
5. test/diagnostics/topology-convergence-graph.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/diagnostics/topology-convergence-graph.js`, `src/diagnostics/topology-convergence-edge-resolvers.js`, `src/diagnostics/topology-convergence-normalizers.js`, `scripts/analyze-topology-convergence.js`, `test/diagnostics/topology-convergence-graph.test.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/diagnostics/topology-convergence-graph.test.js test/diagnostics/stop-condition-decision.test.js`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json`
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

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: diagnostics_owner; files-changed: src/diagnostics/topology-convergence-graph.js, src/diagnostics/topology-convergence-normalizers.js, src/diagnostics/topology-convergence-owner-witness.js, src/diagnostics/causal-graph-builder.js, test/diagnostics/topology-convergence-graph.test.js; validation: npm test -- test/diagnostics/topology-convergence-graph.test.js test/diagnostics/stop-condition-decision.test.js; parent revalidated focused proof: yes; outcome: pass.
- [x] action: verification-fix; owner: diagnostics_owner; files-changed: none; validation: npm run analyze:causal-model -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json; parent revalidated focused proof: yes; outcome: pass.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: none; validation: npm run work:repair; parent revalidated focused proof: yes; outcome: pass.

## Validation

1. npm test -- test/diagnostics/topology-convergence-graph.test.js test/diagnostics/stop-condition-decision.test.js
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json
