# Rolling Restart Progress Contract Representative Proof

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-27",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-progress-contract-proof.report.json",
    "playback": "none",
    "owner": "release_gate_owner",
    "boundary": "rolling_restart_progress_contract_gate",
    "dominantReason": "representative_contract_proof",
    "currentState": "Created todo package for the representative release-gate checkpoint after contract conversions; further local patching is not authorized until rolling-restart is routed.",
    "nextAction": "Run rolling-restart after converted owner boundaries and route the artifact to green, reduced, migrated, or architecture-gap.",
    "closed": "2026-05-27",
    "successor": "work/packages/active-20260527-rolling-restart-startup-active-gate-owner-snapshot-coverage.md"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260527-rolling-restart-progress-contract-representative-proof.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-progress-contract-proof.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/active-20260527-rolling-restart-progress-contract-representative-proof.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Advances this sprint goal by checking the full representative gate after conversions before any new local patches.",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "modelFit": {
    "packageClass": "scenario-release-gate",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "release-gate/progress-contract",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "fresh rolling-restart artifact is red and routes to an unconverted owner boundary",
      "representative evidence is contradictory or unavailable"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "theoryLedger": "no-ledger-update",
    "proof": {
      "commands": [
        "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-progress-contract-proof.report.json --verbose",
        "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-progress-contract-proof.report.json"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": []
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    }
  },
  "representativeResidual": {
    "status": "classification-only",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-progress-contract-proof.report.json",
    "frontier": "rolling_restart_progress_contract_gate",
    "owner": "release_gate_owner",
    "boundary": "rolling_restart_progress_contract_gate",
    "dominantReason": "representative_contract_proof",
    "nextAction": "Run rolling-restart after converted owner boundaries and route the artifact to green, reduced, migrated, or architecture-gap."
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-progress-contract-proof.report.json --verbose",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-progress-contract-proof.report.json"
    ],
    "decisionRecord": "Keep classification inside the package unless route truth changes.",
    "successorAction": "update-current-package",
    "runtimePromotionRule": "Stable owner/boundary routes move to runtime-owner-boundary work."
  },
  "causalGovernance": {
    "hypothesis": "After converted owner boundaries, rolling-restart evidence should be green or route to one explicit progress-contract frontier instead of an ambiguous stranded state.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-progress-contract-proof.report.json",
    "expectedCausalModelChange": "The representative rolling-restart proof is green, reduced, migrated to one concrete frontier, or classified as an architecture gap.",
    "representativeOutcome": "migrated",
    "causalDebt": "Rolling restart pre-restart/restart sequencing stranded progress without explicit contracts.",
    "crossBoundaryReview": "Review with all transformed boundaries: workflow progress, snapshot coverage, and startup readiness."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart progress contract representative proof",
    "phaseChain": [
      "diagnostics cutover",
      "startup readiness conversion",
      "workflow progress conversion",
      "active-gate snapshot coverage conversion"
    ],
    "currentFirstFrontier": "release_gate_owner / rolling_restart_progress_contract_gate",
    "knownDownstreamBlockers": [
      "representative scenario progress-contract validation"
    ],
    "missingCausalEdge": "rolling-restart scenario uses progress contracts",
    "missingCausalEdgeProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-progress-contract-proof.report.json --verbose",
    "falsifyingProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-progress-contract-proof.report.json --verbose",
    "boundedProgressProof": "Running the representative rolling-restart scenario proves the system either reaches green or terminates cleanly at a progress contract edge with bounded retry and timeout controls.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-progress-contract-proof.report.json",
    "expectedObservableTransition": "Ambiguous stranded progress states are resolved into progress contracts.",
    "maxProgressBound": "representative scenario release gate run",
    "sameFrontierFallback": "autonomous architecture experiment",
    "expectedNextFrontier": "release_gate_owner / rolling_restart_progress_contract_gate",
    "resultClassification": "pending-before-probe",
    "stopCondition": "representative-green",
    "recentFrontierHistory": [
      "done-20260527-diagnostics-progress-contract-consumer-cutover.md / diagnostics_owner / topology_convergence_progress_contract / migrated",
      "done-20260527-startup-readiness-progress-contract-conversion.md / startup_readiness_owner / startup_support_evidence / migrated",
      "done-20260527-operation-workflow-progress-contract-conversion.md / operation_workflow_owner / workflow_progress / migrated",
      "done-20260527-active-gate-snapshot-coverage-progress-contract-conversion.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "oscillations are guarded by transformed progress contracts",
    "handoffInvariant": "no implementation edits are allowed under scenario-release-gate without a child package"
  },
  "progressContract": {
    "owner": "release_gate_owner",
    "boundary": "rolling_restart_progress_contract_gate",
    "state": "representative_proof",
    "reason": "Run rolling-restart after converted owner boundaries and route the artifact to green, reduced, migrated, or architecture-gap.",
    "nextAction": "run representative proof",
    "wakeSource": "release-gate",
    "retryAfterMs": 1000,
    "terminalState": "satisfied",
    "evidencePath": "test-output/reports/rolling-restart-progress-contract-proof.report.json",
    "blockingDependency": "no other blocking dependencies"
  },
  "observablePrediction": {
    "falsificationCondition": "The representative rerun returns an ambiguous stranded progress state or fails to show progress-contract routing.",
    "metric": "ambiguous stranded progress states",
    "predicted": "zero ambiguous stranded states; all states are green or progress-contract-routed",
    "observed": "zero ambiguous stranded states; all states are green or progress-contract-routed",
    "accuracy": "matched",
    "evidence": "test-output/reports/rolling-restart-progress-contract-proof.report.json"
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-progress-contract-proof.report.json",
    "routeOwner": "release_gate_owner",
    "routeBoundary": "rolling_restart_progress_contract_gate",
    "routeDominantReason": "representative_contract_proof",
    "routeCausalOutcome": "pending-before-rerun",
    "stopMode": "pending-before-rerun",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.",
    "nextLane": "causal-escalation",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-progress-contract-proof.report.json --owner release_gate_owner --boundary rolling_restart_progress_contract_gate --dominant-reason representative_contract_proof",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "After converted owner boundaries, rolling-restart evidence should be green or route to one explicit progress-contract frontier instead of an ambiguous stranded state.",
    "hypothesisDiscriminator": "H1 if the artifact is green or contract-routed; H2 if an unconverted boundary appears; H3 if the run exposes an architecture gap rather than implementation debt.",
    "expectedMetric": "Representative route is green, reduced, migrated to one contract edge, or classified architecture-gap with no ambiguous stranded progress state.",
    "inheritsFrom": "none",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence"
  },
  "validationTier": "release-gate",
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
    "childPackageCandidates": [
      "Use this package for route selection, owner/boundary decisions, and stop rules.",
      "Create Spark-safe mechanical or test-only children once execution is unambiguous.",
      "Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected."
    ]
  },
  "theoryLedger": "not-applicable: no existing ledger theory directly covers the representative progress-contract gate; add or cite a durable theory at closure if this package creates one.",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": []
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package owns the representative checkpoint for the sprint. It prevents
additional local owner patches until converted progress contracts are tested
against a fresh rolling-restart artifact and routed through the normal release
gate.

## Scope Basis

Sprint package 7 in
`work/sprints/todo-2026-q2-owner-boundary-progress-contract-transformation.md`;
scope is limited to producing and routing the representative rolling-restart
artifact plus updating this package.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: release_gate_owner / rolling_restart_progress_contract_gate emits green, reduced, migrated, or architecture-gap routing for representative_contract_proof.
- Inputs/signals: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-progress-contract-proof.report.json --verbose; npm run work:scenario-route -- test-output/reports/rolling-restart-progress-contract-proof.report.json.
- State model or invariant: The release_gate_owner / rolling_restart_progress_contract_gate decision table in the Causal Decision Contract maps representative_contract_proof and route evidence to one emitted outcome: Run rolling-restart after converted owner boundaries and route the artifact to green, reduced, migrated, or architecture-gap..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the release_gate_owner / rolling_restart_progress_contract_gate invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | release_gate_owner / rolling_restart_progress_contract_gate / representative_contract_proof | release_gate_owner owns this decision before downstream consumers reinterpret it | Run rolling-restart after converted owner boundaries and route the artifact to green, reduced, migrated, or architecture-gap. | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-progress-contract-proof.report.json --verbose |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies release_gate_owner / rolling_restart_progress_contract_gate directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-progress-contract-proof.report.json --verbose`
- Competing explanations: At minimum compare representative_contract_proof against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does release_gate_owner / rolling_restart_progress_contract_gate still own representative_contract_proof, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: representative_contract_proof is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-progress-contract-proof.report.json --verbose`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-progress-contract-proof.report.json --owner release_gate_owner --boundary rolling_restart_progress_contract_gate --dominant-reason representative_contract_proof`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: After converted owner boundaries, rolling-restart evidence should be green or route to one explicit progress-contract frontier instead of an ambiguous stranded state.
- Hypothesis discriminator: H1 if the artifact is green or contract-routed; H2 if an unconverted boundary appears; H3 if the run exposes an architecture gap rather than implementation debt.
- Expected metric: Representative route is green, reduced, migrated to one contract edge, or classified architecture-gap with no ambiguous stranded progress state.
- Inherits from: `none`
- Timebox: `24h`
- Validation tier: `release-gate`
- Merge requirement: focused test plus canonical route or evidence command
- Kill rule: same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-progress-contract-proof.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-progress-contract-proof.report.json`
- Route owner: `release_gate_owner`
- Route boundary: `rolling_restart_progress_contract_gate`
- Route dominant reason: `representative_contract_proof`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `scenario-release-gate`
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

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/active-20260527-rolling-restart-progress-contract-representative-proof.md` or `npm run work:package:schema`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-progress-contract-proof.report.json`.
3. Owner discovery: `npm run analyze:owner-files -- release_gate_owner rolling_restart_progress_contract_gate`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role verifier-fixer --package work/packages/active-20260527-rolling-restart-progress-contract-representative-proof.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to the commands in the Validation section plus `npm run work:scenario-route -- test-output/reports/rolling-restart-progress-contract-proof.report.json` for representative routing.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. work/packages/active-20260527-rolling-restart-progress-contract-representative-proof.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260527-rolling-restart-progress-contract-representative-proof.md`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-progress-contract-proof.report.json --verbose`, `npm run work:scenario-route -- test-output/reports/rolling-restart-progress-contract-proof.report.json`
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

- [x] action: implementation; owner: release_gate_owner; files-changed: none; validation: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-progress-contract-proof.report.json --verbose; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: release_gate_owner; files-changed: none; validation: npm run work:validate -- --pre-impl; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: none; validation: `npm run work:repair`; outcome: validated.

## Commit And Push Ledger

1. Focused package commit: aef3c42e8bd76d237056dceffb3cef1189085b4c
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-progress-contract-proof.report.json --verbose
2. npm run work:scenario-route -- test-output/reports/rolling-restart-progress-contract-proof.report.json

