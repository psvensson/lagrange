# Rolling Restart Owner Recovery Queue Outcome Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-22",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "owner_recovery_queue_outcome_contract",
  "dominantReason": "owner_recovery_queue_absent",
  "currentState": "Focused diagnostic contract implemented: the handoff probe now observes ownerRecoveryQueue.depth.state=observed, pendingWrites=1, ownerRecoveryQueue.handoffOutcome.state=write_deferred, and runtimePromotionAllowed=false for wait_owner_recovery evidence.",
  "nextAction": "Run verifier-fixer, refresh generated blocker state, close this reduced evidence-fidelity package, then route the next rolling-restart frontier because active_gate_snapshot_coverage remains blocked.",
  "stabilityCredit": "representative-reduced",
  "whyHighestLeverageNow": "The architecture experiment distinguished H2: typed wait_owner_recovery evidence is emitted, pendingRecoveryCount=1 is visible, runtimePromotionAllowed=false is preserved, and no owner-recovery queue/outcome consumes the handoff. This contract is the narrowest next move toward rolling-restart success because more same-frontier timeout or retry patches would leave the owner boundary porous.",
  "proof": [
    "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js",
    "node scripts/check-guideline-literals.js src/control-plane/control-plane-snapshot-owner.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js",
    "node scripts/check-guideline-decision-boundaries.js src/control-plane/control-plane-snapshot-owner.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js",
    "npm run audit:runtime-grammar:file -- src/control-plane/control-plane-snapshot-owner.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json --handoff-probe"
  ],
  "writeScope": [
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "test/scripts/analyze-topology-convergence.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "work/packages/done-20260522-rolling-restart-owner-recovery-queue-outcome-contract.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "The queue/outcome absence is evidence-shape debt in the startup active-gate handoff probe, not permission to promote degraded snapshot coverage.",
    "hypothesisDiscriminator": "H1: wait_owner_recovery plus pendingRecoveryCount yields observed ownerRecoveryQueue depth/outcome while runtimePromotionAllowed remains false. H2: the probe still reports unknown/absent, meaning the contract belongs elsewhere. H3: runtime promotion flips true, meaning the implementation violated the active-gate safety boundary.",
    "expectedMetric": "ownerRecoveryQueue.depth.state changes from unknown to observed or ownerRecoveryQueue.handoffOutcome.state changes from absent to write_deferred for the representative handoff probe.",
    "inheritsFrom": "none",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence"
  },
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_timeout",
    "nextAction": "The absent queue/outcome edge is reduced to observed diagnostic evidence; the next package must route the remaining active_gate_snapshot_coverage block without allowing promotion from degraded coverage."
  },
  "causalGovernance": {
    "hypothesis": "Rolling-restart remains blocked because wait_owner_recovery evidence is produced but the startup_active_gate_owner has no named owner-recovery queue/outcome contract to consume pendingRecoveryCount=1 into a bounded recovery decision.",
    "stopConditionCheck": "Run npm run analyze:causal-model -- test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json plus focused proof; proof must show a named owner-recovery queue/outcome contract in the owner path while preserving runtimePromotionAllowed=false for degraded snapshot coverage, then representative proof must move active_gate_snapshot_coverage, migrate owner/boundary, or stop with a new architecture result.",
    "expectedCausalModelChange": "The owner handoff changes from pending evidence with absent queue/outcome to an explicit owner-recovery queue/outcome contract with a bounded recovery result or a falsifiable next owner boundary.",
    "representativeOutcome": "reduced",
    "causalDebt": "The latest representative still records publication convergence ready, selectedSnapshotAdminReady=true via admin_health, selectedSnapshotError=snapshot_timeout, selectedSnapshotObservation=repair_deferred/retry, snapshotCoverage=0/5, publicationActiveGateHandoffState=pending, reasonCode=owner_reconcile_pending, nextAction=wait_owner_recovery, activeGateOwnerCohortPendingRecoveryCount=1, and runtimePromotionAllowed=false. This package reduced the missing diagnostic edge: the handoff probe now reports ownerRecoveryQueue.depth.state=observed, pendingWrites=1, and ownerRecoveryQueue.handoffOutcome.state=write_deferred; detected remains false and resultClassification remains publication_active_gate_handoff_not_detected.",
    "crossBoundaryReview": "Keep the contract inside startup_active_gate_owner unless focused evidence proves snapshot/watch ownership, publication handoff, admin snapshot projection, or readiness support owns the next recovery outcome."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart selected_timeout/admin_health owner recovery after typed handoff",
    "phaseChain": [
      "load-readiness force-repair proof moved the representative past publication convergence",
      "selected-timeout handoff contract proof emitted typed non-promoting wait_owner_recovery evidence",
      "architecture experiment distinguished H2 because ownerRecoveryQueue depth is unknown and handoffOutcome is absent while pendingRecoveryCount=1 remains visible",
      "this package implements the missing owner-recovery queue/outcome contract before another same-frontier runtime patch"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / snapshot_timeout",
    "knownDownstreamBlockers": [
      "startup readiness support remains inherited from active-gate no progress",
      "load-readiness is not reached in the fresh representative",
      "runtime promotion remains unsafe while snapshotCoverage=0/5"
    ],
    "missingCausalEdge": "The owner path that consumes wait_owner_recovery and pendingRecoveryCount=1 into an owner-recovery queue/outcome is not named or visible.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json --handoff-probe",
    "boundedProgressProof": "Focused tests and handoff probe must prove the reconcile mechanism consumes pending handoff evidence into an owner-recovery queue/outcome contract without allowing runtime promotion from degraded snapshot coverage.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json",
    "expectedObservableTransition": "ownerRecoveryQueue.depth.state becomes known or handoffOutcome becomes present for wait_owner_recovery evidence while runtimePromotionAllowed remains false until snapshot coverage is safe.",
    "maxProgressBound": "one owner-recovery queue/outcome contract package before another startup_active_gate_owner / snapshot_coverage symptom patch",
    "sameFrontierFallback": "If focused and representative proof still show no owner-recovery queue/outcome contract, stop for a new architecture result instead of widening timeouts or retries.",
    "expectedNextFrontier": "owner-recovery queue/outcome contract observed; next route must address the remaining active_gate_snapshot_coverage block or classifier gap.",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix"
  },
  "observablePrediction": {
    "metric": "ownerRecoveryQueue.depth.state, ownerRecoveryQueue.handoffOutcome.state, publicationActiveGateHandoffState, runtimePromotionAllowed, and active_gate_snapshot_coverage route",
    "predicted": "After the contract implementation, focused proof will expose a named owner-recovery queue/outcome for pending wait_owner_recovery evidence while preserving runtimePromotionAllowed=false for degraded snapshot coverage.",
    "observed": "The handoff probe reports ownerRecoveryQueue.depth.state=observed, pendingWrites=1, ownerRecoveryQueue.handoffOutcome.state=write_deferred, reasonCode=owner_reconcile_pending, enqueued=false, retryAfterMs=0, and runtimePromotionAllowed=false. The representative remains blocked at active_gate_snapshot_coverage and resultClassification remains publication_active_gate_handoff_not_detected.",
    "accuracy": "partial",
    "evidence": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json --handoff-probe",
    "metricDelta": 1
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "owner_recovery_queue_outcome_contract",
    "reason": "The architecture experiment showed the first frontier remains snapshot_coverage, but the missing causal edge is the same owner's queue/outcome contract that consumes wait_owner_recovery and pendingRecoveryCount=1.",
    "evidence": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json --handoff-probe reported ownerRecoveryQueue.depth.state=unknown and ownerRecoveryQueue.handoffOutcome.state=absent while runtimePromotionAllowed=false."
  },
  "validationTier": "cross-owner",
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
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js",
      "node scripts/check-guideline-literals.js src/control-plane/control-plane-snapshot-owner.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js",
      "node scripts/check-guideline-decision-boundaries.js src/control-plane/control-plane-snapshot-owner.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "owner_recovery_queue_outcome_contract",
    "routeDominantReason": "owner_recovery_queue_absent",
    "routeCausalOutcome": "widen_architecture_work",
    "stopMode": "architecture-gap-stop",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "The representative names an owner-recovery queue/outcome contract and either moves past active_gate_snapshot_coverage or produces a falsifiable local runtime fix without allowing active-gate promotion from degraded snapshot coverage.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json --owner startup_active_gate_owner --boundary owner_recovery_queue_outcome_contract --dominant-reason owner_recovery_queue_absent",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-22",
  "commitAndPushLedgerRequired": true
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / owner_recovery_queue_outcome_contract emits the package outcome for owner_recovery_queue_absent.
- Inputs/signals: test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json; npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js; node scripts/check-guideline-literals.js src/control-plane/control-plane-snapshot-owner.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js; node scripts/check-guideline-decision-boundaries.js src/control-plane/control-plane-snapshot-owner.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js; npm run audit:runtime-grammar:file -- src/control-plane/control-plane-snapshot-owner.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js; npm run work:evidence-summary -- test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json --markdown.
- State model or invariant: The startup_active_gate_owner / owner_recovery_queue_outcome_contract decision table in the Causal Decision Contract maps owner_recovery_queue_absent and route evidence to one emitted outcome: widen_architecture_work.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / owner_recovery_queue_outcome_contract invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / owner_recovery_queue_outcome_contract / owner_recovery_queue_absent | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Define the owner-recovery queue/outcome contract that consumes wait_owner_recovery evidence, then implement the smallest runtime owner path needed to move rolling-restart past active_gate_snapshot_coverage without runtime promotion from degraded coverage. | The representative names an owner-recovery queue/outcome contract and either moves past active_gate_snapshot_coverage or produces a falsifiable local runtime fix without allowing active-gate promotion from degraded snapshot coverage. | npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / owner_recovery_queue_outcome_contract directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`
- Competing explanations: At minimum compare owner_recovery_queue_absent against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / owner_recovery_queue_outcome_contract still own owner_recovery_queue_absent, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: owner_recovery_queue_absent is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`
- Success metrics: The representative names an owner-recovery queue/outcome contract and either moves past active_gate_snapshot_coverage or produces a falsifiable local runtime fix without allowing active-gate promotion from degraded snapshot coverage.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json --owner startup_active_gate_owner --boundary owner_recovery_queue_outcome_contract --dominant-reason owner_recovery_queue_absent`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: State the experiment hypothesis before implementation.
- Hypothesis discriminator: Predict the different observable under H1 vs H2 vs H3 before implementation.
- Expected metric: Name the count, frontier, route, or representative result expected to move.
- Inherits from: `none`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: focused test plus canonical route or evidence command
- Kill rule: same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json`
- Expected delta: The representative names an owner-recovery queue/outcome contract and either moves past active_gate_snapshot_coverage or produces a falsifiable local runtime fix without allowing active-gate promotion from degraded snapshot coverage.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `owner_recovery_queue_outcome_contract`
- Route dominant reason: `owner_recovery_queue_absent`
- Route causal outcome: `widen_architecture_work`
- Stop mode: `architecture-gap-stop`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-runtime-owner-boundary`
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work.

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

1. src/control-plane/control-plane-snapshot-owner.js
2. src/control-plane/publication-active-gate-handoff-contract.js
3. src/admin/admin-control-snapshot-class-part-2.js
4. src/diagnostics/topology-convergence-graph.js
5. test/control-plane/publication-active-gate-handoff-contract.test.js
6. test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js
7. test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js
8. test/scripts/analyze-topology-convergence.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/control-plane/control-plane-snapshot-owner.js`, `src/control-plane/publication-active-gate-handoff-contract.js`, `src/admin/admin-control-snapshot-class-part-2.js`, `src/diagnostics/topology-convergence-graph.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`, `test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`, `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`, `test/scripts/analyze-topology-convergence.test.js`
- Forbidden files: none beyond package scope.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js`, `node scripts/check-guideline-literals.js src/control-plane/control-plane-snapshot-owner.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js`, `node scripts/check-guideline-decision-boundaries.js src/control-plane/control-plane-snapshot-owner.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js`, `npm run audit:runtime-grammar:file -- src/control-plane/control-plane-snapshot-owner.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json --handoff-probe`
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

- [x] implementation: status: validated; evidence: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js` passed with total=166 pass=166; `node scripts/check-guideline-literals.js src/control-plane/control-plane-snapshot-owner.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js` found 0 new literal violations and 0 inherited; `node scripts/check-guideline-decision-boundaries.js src/control-plane/control-plane-snapshot-owner.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js` found 0 new decision-boundary violations and 7 inherited baseline matches; `npm run audit:runtime-grammar:file -- src/control-plane/control-plane-snapshot-owner.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js` found 0 runtime grammar violations; `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json --handoff-probe` reported ownerRecoveryQueue.depth.state=observed, pendingWrites=1, handoffOutcome.state=write_deferred, and runtimePromotionAllowed=false; parent revalidated focused proof: yes; next: verifier-fixer then closure or successor action.
- [x] verification-fix: status: validated; evidence: Linnaeus (019e516d-3740-7443-9259-151b8a9123df) verified `wait_owner_recovery` plus pending recovery evidence surfaces ownerRecoveryQueue depth/outcome while keeping runtimePromotionAllowed=false; verifier ran `npm run work:context`, focused TAP proof, guideline literal check, decision-boundary check, runtime grammar audit, and handoff probe, all passing; changed files: none; parent revalidated focused proof: yes; next: closure or successor action.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card after package evidence updates; next: validation.

## Validation

1. npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js
2. node scripts/check-guideline-literals.js src/control-plane/control-plane-snapshot-owner.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js
3. node scripts/check-guideline-decision-boundaries.js src/control-plane/control-plane-snapshot-owner.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js
4. npm run audit:runtime-grammar:file -- src/control-plane/control-plane-snapshot-owner.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js
5. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json --handoff-probe
6. npm run work:scenario-triage -- test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json --markdown
7. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-local-first-snapshot-repair-20260522T194728Z.report.json --markdown
