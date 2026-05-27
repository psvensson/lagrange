# Active Gate Snapshot Coverage Progress Contract Conversion

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
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_coverage_incomplete",
    "currentState": "Created todo package for active-gate snapshot coverage conversion; coverage shortfalls must expose bounded progress or an upstream blocking dependency.",
    "nextAction": "Convert active-gate snapshot coverage to explicit bounded progress, retry, and terminal contract evidence.",
    "closed": "2026-05-27"
  },
  "scope": {
    "writeScope": [
      "src/diagnostics/topology-convergence-normalizers.js",
      "test/distributed/harness/startup-readiness-evidence.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "test/diagnostics/topology-convergence-graph.test.js",
      "test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
      "src/diagnostics/topology-convergence-graph.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "src/diagnostics/topology-convergence-normalizers.js",
      "test/distributed/harness/startup-readiness-evidence.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "test/diagnostics/topology-convergence-graph.test.js",
      "test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
      "work/packages/active-20260527-active-gate-snapshot-coverage-progress-contract-conversion.md",
      "src/diagnostics/topology-convergence-graph.js"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Prevent active-gate snapshot coverage from masking upstream owner debt as local retry work.",
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
    "theoryLedgerRefs": [],
    "theoryLedger": "no ledger update: This package only converted active-gate snapshot coverage to explicit bounded progress-contract formats.",
    "proof": {
      "commands": [
        "falsifier: npm test -- test/diagnostics/topology-convergence-graph.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
        "regression: npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "src/diagnostics/topology-convergence-graph.js",
        "src/diagnostics/topology-convergence-normalizers.js",
        "test/diagnostics/topology-convergence-graph.test.js"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    }
  },
  "boundedExperiment": {
    "hypothesis": "Active-gate snapshot coverage should expose bounded progress while preserving upstream owner debt instead of masking it as coverage lag.",
    "hypothesisDiscriminator": "H1 if active-gate tests emit one bounded next action or upstream dependency; H2 if startup readiness/admission owns the first frontier; H3 if diagnostics only need to preserve existing active-gate evidence.",
    "expectedMetric": "Snapshot coverage evidence names bounded nextAction or blockingDependency without converting upstream owner debt into local retry.",
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
  "causalGovernance": {
    "hypothesis": "Active-gate snapshot coverage should expose bounded progress while preserving upstream owner debt instead of masking it as coverage lag.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "expectedCausalModelChange": "Convert active-gate snapshot coverage to explicit bounded progress, retry, and terminal contract evidence.",
    "representativeOutcome": "migrated",
    "causalDebt": "snapshot coverage is inferred from lag without progress contract format.",
    "crossBoundaryReview": "Review with startup active gate owner and progress contract foundation definitions."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart seed-contact-bounded-progress",
    "phaseChain": [
      "active-gate snapshot coverage conversion"
    ],
    "currentFirstFrontier": "startup_active_gate_owner / snapshot_coverage",
    "knownDownstreamBlockers": [
      "rolling restart progress contract representative proof"
    ],
    "missingCausalEdge": "active-gate snapshot coverage progress contract conversion",
    "missingCausalEdgeProbe": "npm test -- test/diagnostics/topology-convergence-graph.test.js",
    "falsifyingProbe": "npm test -- test/diagnostics/topology-convergence-graph.test.js",
    "boundedProgressProof": "Active-gate snapshot coverage emits progress contracts with explicit retry, wake, timeout, and terminal status.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "expectedObservableTransition": "active-gate snapshot coverage prefers progress contract",
    "maxProgressBound": "one active-gate snapshot coverage conversion slice",
    "sameFrontierFallback": "autonomous architecture experiment",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage",
    "resultClassification": "pending-before-probe",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260527-operation-workflow-progress-contract-conversion.md / operation_workflow_owner / workflow_progress / migrated"
    ],
    "oscillationCheck": "active-gate snapshot coverage conversion to prevent oscillating symptom-only fixes on the same artifact.",
    "handoffInvariant": "active-gate changes prefer progress contract and do not invent runtime behaviors."
  },
  "progressContract": {
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "state": "progress_contract_conversion",
    "reason": "Convert active-gate snapshot coverage to explicit bounded progress, retry, and terminal contract evidence.",
    "nextAction": "convert progress contract",
    "wakeSource": "active-gate",
    "retryAfterMs": 1000,
    "terminalState": "satisfied",
    "evidencePath": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "blockingDependency": "no other blocking dependencies"
  },
  "representativeResidual": {
    "status": "live",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "frontier": "startup_active_gate_owner / snapshot_coverage -> release_gate_owner / rolling_restart_progress_contract_gate",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_coverage_incomplete",
    "nextAction": "Convert active-gate snapshot coverage to explicit bounded progress."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "snapshot_coverage_incomplete",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "migrate-owner-boundary",
    "nextLane": "causal-escalation",
    "expectedDelta": "active-gate snapshot coverage emits one next action with wake source, retry timing, terminal state, and evidence path.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "theoryLedger": "not-applicable: no existing ledger theory directly covers active-gate snapshot coverage as a bounded progress-contract conversion; add or cite a durable theory at closure if this package creates one.",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "src/diagnostics/topology-convergence-graph.js",
      "src/diagnostics/topology-convergence-normalizers.js",
      "test/diagnostics/topology-convergence-graph.test.js"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package owns the active-gate conversion because snapshot coverage has been
a recurring rolling-restart frontier. It must preserve upstream owner debt as a
blocking dependency instead of treating every shortfall as local active-gate
retry work.

## Scope Basis

Sprint package 6 in
`work/sprints/todo-2026-q2-owner-boundary-progress-contract-transformation.md`;
scope is limited to active-gate snapshot coverage owner files, diagnostics
adapters, and focused active-gate tests.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits bounded coverage progress or an upstream blocking dependency for snapshot_coverage_incomplete.
- Inputs/signals: npm test -- test/diagnostics/topology-convergence-graph.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js; npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps snapshot_coverage_incomplete and route evidence to one emitted outcome: Convert active-gate snapshot coverage to explicit bounded progress, retry, and terminal contract evidence..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / snapshot_coverage_incomplete | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Convert active-gate snapshot coverage to explicit bounded progress, retry, and terminal contract evidence. | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | npm test -- test/diagnostics/topology-convergence-graph.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `npm test -- test/diagnostics/topology-convergence-graph.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js`
- Competing explanations: At minimum compare snapshot_coverage_incomplete against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own snapshot_coverage_incomplete, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: snapshot_coverage_incomplete is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/diagnostics/topology-convergence-graph.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: Active-gate snapshot coverage should expose bounded progress while preserving upstream owner debt instead of masking it as coverage lag.
- Hypothesis discriminator: H1 if active-gate tests emit one bounded next action or upstream dependency; H2 if startup readiness/admission owns the first frontier; H3 if diagnostics only need to preserve existing active-gate evidence.
- Expected metric: Snapshot coverage evidence names bounded nextAction or blockingDependency without converting upstream owner debt into local retry.
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
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `snapshot_coverage_incomplete`
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

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/todo-20260527-active-gate-snapshot-coverage-progress-contract-conversion.md` or `npm run work:package:schema`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json`.
3. Owner discovery: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role verifier-fixer --package work/packages/todo-20260527-active-gate-snapshot-coverage-progress-contract-conversion.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to the commands in the Validation section plus `npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json` when representative context is needed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. src/diagnostics/topology-convergence-normalizers.js
2. test/distributed/harness/startup-readiness-evidence.js
3. test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js
4. test/diagnostics/topology-convergence-graph.test.js
5. test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/diagnostics/topology-convergence-normalizers.js`, `test/distributed/harness/startup-readiness-evidence.js`, `test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js`, `test/diagnostics/topology-convergence-graph.test.js`, `test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/diagnostics/topology-convergence-graph.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json`
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

- [x] action: implementation; owner: startup_active_gate_owner; files-changed: src/diagnostics/topology-convergence-graph.js, src/diagnostics/topology-convergence-normalizers.js, test/diagnostics/topology-convergence-graph.test.js; validation: node test/diagnostics/topology-convergence-graph.test.js and node test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js passed; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: none; validation: all validation tests verified clean; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json and work/sprints/current-blocker.md only if repair changes tracker state; validation: `npm run work:repair`; parent revalidated focused proof: yes; outcome: pending-or-not-needed.

## Validation

1. npm test -- test/diagnostics/topology-convergence-graph.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json

## Commit And Push Ledger

1. Focused package commit: e895819109dc984898f5827b45f2277e30b86b31
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
