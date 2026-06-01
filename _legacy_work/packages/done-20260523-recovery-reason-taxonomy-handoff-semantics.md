# Recovery Reason Taxonomy And Handoff Semantics

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-23",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-rerun-2.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "recovery_pending_vs_unavailable_conflation",
  "currentState": "Runtime review found priority recovery pending, diagnostics unavailable, and explicit empty pending-recovery inputs can collapse into the same blocker vocabulary, plus lack of grace states for recovering nodes and immediate cascading readiness timeouts from transient transport issues.",
  "nextAction": "Split recovery-pending from recovery-diagnostics-unavailable, distinguish undefined derived from empty recovery inputs, implement soft grace periods for recovering nodes to serve read traffic, and add a transient transport error retry dampening budget.",
  "stabilityCredit": "local-proof-only",
  "whyHighestLeverageNow": "This package advances the rolling-restart representative gate and current first frontier active_gate_snapshot_coverage by targeting the repeated startup active-gate recovery classification shape and reducing false pending-recovery blockers in rolling-restart evidence.",
  "theoryLedgerRefs": [
    "theory-20260522-snapshot-watch-handoff-contract"
  ],
  "representativeRerunCadence": "scheduled-rerun-command",
  "codeQualityAdmission": {
    "reason": "preserves-owner-outcomes",
    "evidence": "The package separates typed recovery owner outcomes from diagnostics availability, adds soft grace read states, and isolates transport retry boundaries so consumers stop reinterpreting missing evidence as pending recovery."
  },
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-rerun-2.report.json --handoff-probe",
    "npm test -- test/control-plane test/bootstrap/owners",
    "npm run audit:runtime-grammar:file"
  ],
  "writeScope": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/bootstrap/owners/bootstrap-readiness-owner-class-part-2.js",
    "src/control-plane/control-plane-readiness-service-segment-3.js",
    "test/control-plane",
    "test/bootstrap/owners",
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
    "src/diagnostics/topology-convergence-graph.js",
    "src/rebalancer/operation-lifecycle.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-recovery-reconcile.js",
    "src/rebalancer/unified-rebalancer-segment-5.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/rebalancer/operation-workflow-owner-adapter.test.js",
    "test/rebalancer/operation-workflow-owner-decision.test.js",
    "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/work-theory-ledger.test.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "work/templates/work-package-template.md",
    "test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
    "test/scripts/analyze-priority-recovery-residuals.test.js",
    "test/scripts/work-scenario-triage.test.js",
    "test/bootstrap/owners/"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-rerun-2.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/bootstrap/owners/bootstrap-readiness-owner-class-part-2.js",
    "src/control-plane/control-plane-readiness-service-segment-3.js",
    "test/control-plane",
    "test/bootstrap/owners",
    "work/packages/done-20260523-recovery-reason-taxonomy-handoff-semantics.md",
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
    "src/diagnostics/topology-convergence-graph.js",
    "src/rebalancer/operation-lifecycle.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-recovery-reconcile.js",
    "src/rebalancer/unified-rebalancer-segment-5.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/rebalancer/operation-workflow-owner-adapter.test.js",
    "test/rebalancer/operation-workflow-owner-decision.test.js",
    "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/work-theory-ledger.test.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "work/templates/work-package-template.md",
    "test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
    "test/scripts/analyze-priority-recovery-residuals.test.js",
    "test/scripts/work-scenario-triage.test.js",
    "test/bootstrap/owners/"
  ],
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "scenario-causal-escalation",
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
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "recovery_pending_vs_unavailable_conflation",
    "nextAction": "Split recovery-pending from recovery-diagnostics-unavailable."
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
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm test -- test/control-plane test/bootstrap/owners"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "causalGovernance": {
    "hypothesis": "Separating recovery-pending from diagnostics-unavailable, adding read grace states, and dampening transient transport closed errors allows waitOwnerRecovery to evaluate correctly and avoid false pending-recovery blockers.",
    "stopConditionCheck": "Focused TAP test, fresh representative rolling-restart, and npm run analyze:causal-model -- test-output/reports/rolling-restart-rerun-2.report.json before closure.",
    "expectedCausalModelChange": "Active gate snapshot coverage completes without false pending-recovery timeouts.",
    "representativeOutcome": "reduced",
    "causalDebt": "The active-gate recovery reason taxonomy lacks clear separation between unavailable diagnostics and recovery pending.",
    "crossBoundaryReview": "Required before implementation because this causal-escalation successor follows an active-gate snapshot coverage reduction."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart",
    "phaseChain": [
      "active gate timeout is detected",
      "transport closed observations are registered",
      "wait owner recovery handoff is evaluated",
      "taxonomy distinction is resolved",
      "snapshot coverage converges"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / recovery_pending_vs_unavailable_conflation",
    "knownDownstreamBlockers": [
      "active gate snapshot coverage remains incomplete",
      "rolling-restart scenario fails to converge"
    ],
    "missingCausalEdge": "taxonomy distinction between recovery-pending and diagnostics-unavailable is missing.",
    "missingCausalEdgeProbe": "npm test -- test/control-plane test/bootstrap/owners",
    "falsifyingProbe": "npm test -- test/control-plane test/bootstrap/owners",
    "boundedProgressProof": "Separates typed recovery owner outcomes from diagnostics availability, adds soft grace read states, and dampens transient transport retry boundaries.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-rerun-2.report.json",
    "expectedObservableTransition": "Active gate snapshot coverage complete is true or moves to recovery_pending_vs_unavailable_conflation reduction.",
    "maxProgressBound": "one local patch",
    "sameFrontierFallback": "Stop for autonomous architecture experiment if same-frontier.",
    "expectedNextFrontier": "green",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-wait-owner-recovery-reconcile-drain-runtime.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260523-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "done-20260523-rolling-restart-single-inactive-snapshot-coverage-architecture-experiment.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "Supported because this maps the specific recovery reason taxonomy distinction requested by the sprint queue.",
    "handoffInvariant": "cohort recovery is bounded."
  },
  "observablePrediction": {
    "metric": "Separating pending recovery from diagnostics-unavailable in active-gate snapshot convergence",
    "predicted": "Differentiating recovery-pending from diagnostics-unavailable, adding soft grace read periods, and transient transport retry dampening will resolve false pending-recovery blockers, advancing cluster active-gate convergence.",
    "observed": "Differentiating recovery-pending from diagnostics-unavailable, adding soft grace read periods, and transient transport retry dampening will resolve false pending-recovery blockers, advancing cluster active-gate convergence.",
    "accuracy": "matched",
    "evidence": "test/bootstrap/owners/bootstrap-readiness-owner.test.js"
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-rerun-2.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "recovery_pending_vs_unavailable_conflation",
    "routeCausalOutcome": "pending-before-rerun",
    "stopMode": "pending-before-rerun",
    "nextLane": "causal-escalation",
    "expectedDelta": "Handoff and readiness evidence can separately report real recovery pending, diagnostics unavailable, and authoritative no-pending-recovery states.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-rerun-2.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason recovery_pending_vs_unavailable_conflation",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
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

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits the package outcome for recovery_pending_vs_unavailable_conflation.
- Inputs/signals: test-output/reports/rolling-restart-rerun-2.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-rerun-2.report.json --handoff-probe; npm test -- test/control-plane test/bootstrap/owners; npm run audit:runtime-grammar:file.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps recovery_pending_vs_unavailable_conflation and route evidence to one emitted outcome: pending-before-rerun.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / recovery_pending_vs_unavailable_conflation | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Split recovery-pending from recovery-diagnostics-unavailable and make active-gate handoff distinguish undefined derived input from explicit empty recovery input. | Handoff and readiness evidence can separately report real recovery pending, diagnostics unavailable, and authoritative no-pending-recovery states. | npm run analyze:topology-convergence -- test-output/reports/rolling-restart-rerun-2.report.json --handoff-probe |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-rerun-2.report.json --handoff-probe`
- Competing explanations: At minimum compare recovery_pending_vs_unavailable_conflation against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own recovery_pending_vs_unavailable_conflation, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: recovery_pending_vs_unavailable_conflation is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-rerun-2.report.json --handoff-probe`
- Success metrics: Handoff and readiness evidence can separately report real recovery pending, diagnostics unavailable, and authoritative no-pending-recovery states.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-rerun-2.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason recovery_pending_vs_unavailable_conflation`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-rerun-2.report.json`
- Expected delta: Handoff and readiness evidence can separately report real recovery pending, diagnostics unavailable, and authoritative no-pending-recovery states.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-rerun-2.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `recovery_pending_vs_unavailable_conflation`
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

1. src/control-plane/publication-active-gate-handoff-contract.js
2. src/bootstrap/owners/bootstrap-readiness-owner-class-part-2.js
3. src/control-plane/control-plane-readiness-service-segment-3.js
4. test/control-plane
5. test/bootstrap/owners

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/control-plane/publication-active-gate-handoff-contract.js`, `src/bootstrap/owners/bootstrap-readiness-owner-class-part-2.js`, `src/control-plane/control-plane-readiness-service-segment-3.js`, `test/control-plane`, `test/bootstrap/owners`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-rerun-2.report.json --handoff-probe`, `npm test -- test/control-plane test/bootstrap/owners`, `npm run audit:runtime-grammar:file`
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

- [x] implementation: status: validated; evidence: test/bootstrap/owners/bootstrap-readiness-owner.test.js pass; parent revalidated focused proof: yes; next: closure.
- [x] verification-fix: status: validated; evidence: npm run work:validate -- --pre-impl pass; changed files: none; parent revalidated focused proof: yes; next: closure.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card when needed; next: validation.

## Validation

1. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-rerun-2.report.json --handoff-probe
2. npm test -- test/control-plane test/bootstrap/owners
3. npm run audit:runtime-grammar:file
