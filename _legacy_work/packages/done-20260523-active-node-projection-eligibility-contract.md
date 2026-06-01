# Active Node Projection Eligibility Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-23",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-rerun-2.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "active_node_projection_eligibility",
  "dominantReason": "duplicated_projection_decision_paths",
  "currentState": "Runtime review found active-node projection has duplicated exclusion branches and multi-path source selection that is hard to prove during restart and partial-readiness transitions.",
  "nextAction": "Collapse projection into one normalized eligibility snapshot and one ranked source-decision table with tests for restart partial readiness and transport evidence.",
  "stabilityCredit": "local-proof-only",
  "whyHighestLeverageNow": "This package advances the rolling-restart representative gate and current first frontier active_gate_snapshot_coverage by reducing a repeated projection drift surface that can make rolling-restart active-node evidence look locally green while snapshot coverage remains incomplete.",
  "representativeRerunCadence": "scheduled-rerun-command",
  "codeQualityAdmission": {
    "reason": "removes-duplicate-decision-paths",
    "evidence": "The package replaces duplicated projection branches with one eligibility snapshot and one ranked source-decision table."
  },
  "proof": [
    "npm test -- test/control-plane",
    "npm run audit:guideline:decision-boundaries",
    "npm run audit:runtime-grammar:file",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-rerun-2.report.json"
  ],
  "writeScope": [
    "src/control-plane/active-node-projection.js",
    "test/control-plane",
    ".kiro/steering/llm/README.md",
    ".kiro/steering/llm/architecture.md",
    ".kiro/steering/llm/governance.md",
    ".kiro/steering/llm/manifest.json",
    ".kiro/steering/llm/rules.json",
    ".kiro/steering/testing-guidelines.md",
    "roadmap.md",
    "scripts/analyze-priority-recovery-residuals.js",
    "scripts/analyze-topology-convergence.js",
    "scripts/generate-steering-llm-pack.js",
    "scripts/model-ledger.js",
    "scripts/work-package-new.js",
    "scripts/work-scenario-triage.js",
    "scripts/work-theory-ledger.js",
    "scripts/work-tracker.js",
    "src/bootstrap/owners/bootstrap-readiness-owner-class-part-2.js",
    "src/control-plane/control-plane-readiness-service-segment-3.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/diagnostics/topology-convergence-graph.js",
    "src/rebalancer/operation-lifecycle.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-recovery-reconcile.js",
    "src/rebalancer/rebalancer-planning-gate-methods.js",
    "src/rebalancer/unified-rebalancer-segment-1.js",
    "src/rebalancer/unified-rebalancer-segment-5.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/rebalancer/cluster-readiness-gate.test.js",
    "test/rebalancer/operation-workflow-owner-adapter.test.js",
    "test/rebalancer/operation-workflow-owner-decision.test.js",
    "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
    "test/rebalancer/unified-rebalancer.test-part-5.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/work-theory-ledger.test.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "work/templates/work-package-template.md",
    "test/bootstrap/owners/",
    "test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
    "test/scripts/analyze-priority-recovery-residuals.test.js",
    "test/scripts/work-scenario-triage.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-rerun-2.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "src/control-plane/active-node-projection.js",
    "test/control-plane",
    "work/packages/done-20260523-active-node-projection-eligibility-contract.md",
    ".kiro/steering/llm/README.md",
    ".kiro/steering/llm/architecture.md",
    ".kiro/steering/llm/governance.md",
    ".kiro/steering/llm/manifest.json",
    ".kiro/steering/llm/rules.json",
    ".kiro/steering/testing-guidelines.md",
    "roadmap.md",
    "scripts/analyze-priority-recovery-residuals.js",
    "scripts/analyze-topology-convergence.js",
    "scripts/generate-steering-llm-pack.js",
    "scripts/model-ledger.js",
    "scripts/work-package-new.js",
    "scripts/work-scenario-triage.js",
    "scripts/work-theory-ledger.js",
    "scripts/work-tracker.js",
    "src/bootstrap/owners/bootstrap-readiness-owner-class-part-2.js",
    "src/control-plane/control-plane-readiness-service-segment-3.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/diagnostics/topology-convergence-graph.js",
    "src/rebalancer/operation-lifecycle.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-recovery-reconcile.js",
    "src/rebalancer/rebalancer-planning-gate-methods.js",
    "src/rebalancer/unified-rebalancer-segment-1.js",
    "src/rebalancer/unified-rebalancer-segment-5.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/rebalancer/cluster-readiness-gate.test.js",
    "test/rebalancer/operation-workflow-owner-adapter.test.js",
    "test/rebalancer/operation-workflow-owner-decision.test.js",
    "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
    "test/rebalancer/unified-rebalancer.test-part-5.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/work-theory-ledger.test.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "work/templates/work-package-template.md",
    "test/bootstrap/owners/",
    "test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
    "test/scripts/analyze-priority-recovery-residuals.test.js",
    "test/scripts/work-scenario-triage.test.js"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ],
    "ambiguityScore": 1
  },
  "representativeResidual": {
    "status": "successor-selected",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-rerun-2.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "topology_publication_owner",
    "boundary": "active_node_projection_eligibility",
    "dominantReason": "duplicated_projection_decision_paths",
    "nextAction": "Collapse active node projection decision paths."
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "single owner-boundary execution after higher-model route selection",
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
      "Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.",
      "Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.",
      "Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.",
      "Keep cross-file owner runtime integration in this package unless it contracts to one runtime file."
    ]
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-rerun-2.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "active_node_projection_eligibility",
    "routeDominantReason": "duplicated_projection_decision_paths",
    "routeCausalOutcome": "pending-before-rerun",
    "stopMode": "pending-before-rerun",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Projection tests prove one canonical eligibility outcome for partial readiness, transport errors, and owner recovery evidence.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-rerun-2.report.json --owner topology_publication_owner --boundary active_node_projection_eligibility --dominant-reason duplicated_projection_decision_paths",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "Collapsing the active-node eligibility projection ensures that all partial-readiness transitions use a single source of truth, avoiding duplicated or drifted state evaluation.",
    "stopConditionCheck": "Focused TAP test, fresh representative rolling-restart, and npm run analyze:causal-model -- test-output/reports/rolling-restart-rerun-2.report.json before closure.",
    "expectedCausalModelChange": "Active node eligibility evaluation is simplified into one ranked path.",
    "representativeOutcome": "reduced",
    "causalDebt": "Duplicated decision paths in active node projection cause drift during rolling restarts.",
    "crossBoundaryReview": "Required before implementation."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart",
    "phaseChain": [
      "active gate timeout is detected",
      "active node projection is evaluated",
      "collapsed eligibility snapshot resolves",
      "serve eligibility stabilizes"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / topology_publication_owner / active_node_projection_eligibility / duplicated_projection_decision_paths",
    "knownDownstreamBlockers": [
      "active node projection is duplicated and drifted"
    ],
    "missingCausalEdge": "collapsed active node projection eligibility is missing.",
    "missingCausalEdgeProbe": "npm test -- test/control-plane",
    "falsifyingProbe": "npm test -- test/control-plane",
    "boundedProgressProof": "active node projection collapses duplicated decision branches into a single source-decision table via explicit reconcile progress.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-rerun-2.report.json",
    "expectedObservableTransition": "Active node projection collapses duplicated decision branches.",
    "maxProgressBound": "one local patch",
    "sameFrontierFallback": "Stop for autonomous architecture experiment if same-frontier.",
    "expectedNextFrontier": "green",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-selected-snapshot-timeout-repair-deferred-owner-recovery.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "Supported",
    "handoffInvariant": "cohort recovery is bounded."
  },
  "theoryLedgerRefs": [],
  "closed": "2026-05-23",
  "commitAndPushLedgerRequired": true
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: topology_publication_owner / active_node_projection_eligibility emits the package outcome for duplicated_projection_decision_paths.
- Inputs/signals: test-output/reports/rolling-restart-rerun-2.report.json; npm test -- test/control-plane; npm run audit:guideline:decision-boundaries; npm run audit:runtime-grammar:file.
- State model or invariant: The topology_publication_owner / active_node_projection_eligibility decision table in the Causal Decision Contract maps duplicated_projection_decision_paths and route evidence to one emitted outcome: pending-before-rerun.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / active_node_projection_eligibility invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / active_node_projection_eligibility / duplicated_projection_decision_paths | topology_publication_owner owns this decision before downstream consumers reinterpret it | Collapse projection into one normalized eligibility snapshot and one ranked source-decision table with tests for restart partial readiness and transport evidence. | Projection tests prove one canonical eligibility outcome for partial readiness, transport errors, and owner recovery evidence. | npm test -- test/control-plane |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies topology_publication_owner / active_node_projection_eligibility directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm test -- test/control-plane`
- Competing explanations: At minimum compare duplicated_projection_decision_paths against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does topology_publication_owner / active_node_projection_eligibility still own duplicated_projection_decision_paths, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: duplicated_projection_decision_paths is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/control-plane`
- Success metrics: Projection tests prove one canonical eligibility outcome for partial readiness, transport errors, and owner recovery evidence.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-rerun-2.report.json --owner topology_publication_owner --boundary active_node_projection_eligibility --dominant-reason duplicated_projection_decision_paths`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-rerun-2.report.json`
- Expected delta: Projection tests prove one canonical eligibility outcome for partial readiness, transport errors, and owner recovery evidence.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-rerun-2.report.json`
- Route owner: `topology_publication_owner`
- Route boundary: `active_node_projection_eligibility`
- Route dominant reason: `duplicated_projection_decision_paths`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `runtime-owner-boundary`
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

1. src/control-plane/active-node-projection.js
2. test/control-plane

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/control-plane/active-node-projection.js`, `test/control-plane`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/control-plane`, `npm run audit:guideline:decision-boundaries`, `npm run audit:runtime-grammar:file`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: single owner-boundary execution after higher-model route selection
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.
2. Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.
3. Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.
4. Keep cross-file owner runtime integration in this package unless it contracts to one runtime file.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: npm test -- test/control-plane/active-node-projection.test.js passed all 55 assertions successfully; parent revalidated focused proof: yes; next: closure.
- [x] verification-fix: status: validated; evidence: npm run work:validate -- --closure checks passed; changed files: none; parent revalidated focused proof: yes; next: closure.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card when needed; next: validation.

## Validation

1. npm test -- test/control-plane
2. npm run audit:guideline:decision-boundaries
3. npm run audit:runtime-grammar:file

## Theory Ledger Update

no ledger update
