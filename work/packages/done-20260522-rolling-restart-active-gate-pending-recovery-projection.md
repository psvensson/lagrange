# Rolling Restart Active Gate Pending Recovery Projection

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-22",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "publication_active_gate_handoff_pending_recovery_projection",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Architecture analysis selected the pending-recovery projection successor. Rolling-restart remains blocked at active_gate_snapshot_coverage with wait_owner_recovery pending, runtimePromotionAllowed=false, activeGateOwnerCohortPendingRecoveryCount=1, and handoffContract/progress grammar exposing only pendingReconcile fields.",
  "nextAction": "Project wait_owner_recovery pendingRecoveryNodeIds through the publication active-gate handoff contract, progress report, admin snapshot, and topology analyzer surfaces while preserving runtimePromotionAllowed=false.",
  "stabilityCredit": "local-proof-only",
  "representativeRerunCadence": "scheduled-rerun-command",
  "whyHighestLeverageNow": "This is the named runtime-owner-boundary successor from the architecture experiment: the active gate already sees owner-recovery evidence, but it is not projected through the canonical handoff/report grammar that downstream consumers use before the rolling-restart active-gate budget expires.",
  "proof": [
    "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js # focused contract fixture and affected consumer proof",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json",
    "npm run audit:guideline:literals -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/distributed/harness/cluster-segment-7-class-5.js ./test/control-plane/publication-active-gate-handoff-contract.test.js ./test/scripts/analyze-topology-convergence.test.js ./test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "npm run audit:guideline:decision-boundaries -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/distributed/harness/cluster-segment-7-class-5.js",
    "npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/distributed/harness/cluster-segment-7-class-5.js"
  ],
  "writeScope": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json",
    "test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-7-class-4.js"
  ],
  "commitScope": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "work/packages/done-20260522-rolling-restart-active-gate-pending-recovery-projection.md",
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
      "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
      "npm run audit:guideline:literals -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/distributed/harness/cluster-segment-7-class-5.js ./test/control-plane/publication-active-gate-handoff-contract.test.js ./test/scripts/analyze-topology-convergence.test.js ./test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
      "npm run audit:guideline:decision-boundaries -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/distributed/harness/cluster-segment-7-class-5.js"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "publication_active_gate_handoff_pending_recovery_projection",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Focused proof shows handoffContract and flattened progress carry pendingRecoveryCount/nodeIds for wait_owner_recovery; representative rerun should move snapshot coverage, reduce the same frontier, migrate to owner recovery completion, or stay same-frontier with new canonical recovery evidence.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json --owner startup_active_gate_owner --boundary publication_active_gate_handoff_pending_recovery_projection --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "requiredPreImplProbe": {
    "command": "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js # focused contract fixture and affected consumer proof",
    "artifact": "test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json",
    "reason": "focused contract fixture and affected consumer proof for wait_owner_recovery pending-recovery projection"
  },
  "observablePrediction": {
    "metric": "handoffContract and flattened active-gate progress pendingRecoveryCount/nodeIds for wait_owner_recovery",
    "predicted": "Focused proof exposes pendingRecoveryCount=1 and pendingRecoveryNodeIds for wait_owner_recovery through the selected handoff contract, admin snapshot, harness progress, and topology handoff probe while runtimePromotionAllowed remains false.",
    "observed": "Focused proof and fresh representative handoff probe expose pendingRecoveryCount=1 and pendingRecoveryNodeIds=[11601fe0-72d6-5853-8590-ec2881853e72] for wait_owner_recovery while runtimePromotionAllowed=false.",
    "accuracy": "partial",
    "evidence": "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json --handoff-probe"
  },
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "publication_active_gate_handoff_pending_recovery_projection",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Project wait_owner_recovery pendingRecoveryNodeIds through the canonical handoff/report grammar and rerun focused proof before a representative rerun."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "publication_active_gate_handoff_pending_recovery_projection",
    "reason": "Architecture experiment narrowed the active_gate_snapshot_coverage residual to the canonical wait_owner_recovery pending-recovery projection path.",
    "evidence": "test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json"
  },
  "causalGovernance": {
    "hypothesis": "Rolling-restart remains blocked because wait_owner_recovery pendingRecoveryNodeIds are visible through activeGateOwnerCohort evidence but not through the selected publication active-gate handoff contract/progress grammar consumed by reports and diagnostics.",
    "stopConditionCheck": "Run npm run analyze:causal-model -- test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json, focused contract fixture and affected consumer proof, static guardrails, and representative evidence routing before closure; do not widen timeouts or allow runtime promotion from degraded recovery evidence.",
    "expectedCausalModelChange": "The focused proof should make pendingRecoveryCount/nodeIds observable through the canonical handoff/report grammar, after which representative evidence can either move coverage or expose the next named recovery-completion edge.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Baseline artifact has snapshotCoverage=0/5, selected timeout after 50ms, repair_deferred/retry, wait_owner_recovery, activeGateOwnerCohortPendingRecoveryCount=1, and handoffContract pending-reconcile only.",
    "crossBoundaryReview": "Keep selected-source retry budgets, owner recovery completion, startup readiness, load-readiness, and runtime promotion gates frozen until pending-recovery projection is canonical."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate_snapshot_coverage wait_owner_recovery projection",
    "phaseChain": [
      "publication convergence is ready",
      "selected source is admin_health ready but selected snapshot observation is repair_deferred/retry",
      "wait_owner_recovery is pending with activeGateOwnerCohortPendingRecoveryCount=1",
      "handoffContract and flattened progress expose pendingReconcile fields only",
      "snapshotCoverage remains 0/5 and runtimePromotionAllowed=false"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage migrated to publication_active_gate_handoff_pending_recovery_projection / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness support remains inherited from active-gate no progress",
      "load-readiness is not reached",
      "runtime promotion remains unsafe while snapshotCoverage=0/5"
    ],
    "missingCausalEdge": "wait_owner_recovery pendingRecoveryNodeIds must be projected through the publication active-gate handoff contract, admin snapshot, harness progress, and topology analyzer surfaces.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json --handoff-probe",
    "falsifyingProbe": "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js # focused contract fixture and affected consumer proof",
    "boundedProgressProof": "Focused proof must show the reconcile/wait_owner_recovery progress mechanism carries pendingRecoveryCount/nodeIds on the selected handoff contract and flattened progress/report views while runtimePromotionAllowed remains false.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json",
    "expectedObservableTransition": "handoffContract, selected admin snapshot projection, and topology handoff probe agree on pendingRecoveryCount/nodeIds for wait_owner_recovery.",
    "maxProgressBound": "one runtime-owner-boundary projection package before representative rerun",
    "sameFrontierFallback": "If fresh representative evidence remains same-frontier with no canonical recovery projection or metric reduction, stop for architecture instead of another local patch.",
    "expectedNextFrontier": "snapshot coverage movement, owner recovery completion, or same-frontier with canonical recovery evidence",
    "resultClassification": "same-frontier",
    "stopCondition": "continue-local-fix"
  },
  "closed": "2026-05-22",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260522-rolling-restart-active-gate-owner-recovery-completion.md"
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

- Canonical outcome: startup_active_gate_owner / publication_active_gate_handoff_pending_recovery_projection emits the package outcome for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json; test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json; npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js; npm run audit:guideline:literals -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/distributed/harness/cluster-segment-7-class-5.js ./test/control-plane/publication-active-gate-handoff-contract.test.js ./test/scripts/analyze-topology-convergence.test.js ./test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js; npm run audit:guideline:decision-boundaries -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/distributed/harness/cluster-segment-7-class-5.js; npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/distributed/harness/cluster-segment-7-class-5.js; git diff --check -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/control-plane/publication-active-gate-handoff-contract.test.js test/scripts/analyze-topology-convergence.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js work/packages/done-20260522-rolling-restart-active-gate-pending-recovery-projection.md work/sprints/current-blocker.md work/sprints/current-blocker.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json; npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json --handoff-probe.
- State model or invariant: The startup_active_gate_owner / publication_active_gate_handoff_pending_recovery_projection decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / publication_active_gate_handoff_pending_recovery_projection invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / publication_active_gate_handoff_pending_recovery_projection / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Project wait_owner_recovery pendingRecoveryNodeIds through the publication active-gate handoff contract, progress report, admin snapshot, and topology analyzer surfaces while preserving runtimePromotionAllowed=false. | Focused proof shows handoffContract and flattened progress carry pendingRecoveryCount/nodeIds for wait_owner_recovery; representative rerun should move snapshot coverage, reduce the same frontier, migrate to owner recovery completion, or stay same-frontier with new canonical recovery evidence. | npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / publication_active_gate_handoff_pending_recovery_projection directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / publication_active_gate_handoff_pending_recovery_projection still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`
- Success metrics: Focused proof shows handoffContract and flattened progress carry pendingRecoveryCount/nodeIds for wait_owner_recovery; representative rerun should move snapshot coverage, reduce the same frontier, migrate to owner recovery completion, or stay same-frontier with new canonical recovery evidence.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json --owner startup_active_gate_owner --boundary publication_active_gate_handoff_pending_recovery_projection --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json`
- Expected delta: Focused proof shows handoffContract and flattened progress carry pendingRecoveryCount/nodeIds for wait_owner_recovery; representative rerun should move snapshot coverage, reduce the same frontier, migrate to owner recovery completion, or stay same-frontier with new canonical recovery evidence.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-owner-recovery-consumer-fix-20260522T215121Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `publication_active_gate_handoff_pending_recovery_projection`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
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

1. src/control-plane/publication-active-gate-handoff-contract.js
2. src/admin/admin-control-snapshot-class-part-2.js
3. src/diagnostics/topology-convergence-graph.js
4. scripts/analyze-topology-convergence.js
5. test/control-plane/publication-active-gate-handoff-contract.test.js
6. test/scripts/analyze-topology-convergence.test.js
7. test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js
8. test/distributed/harness/cluster-segment-7-class-5.js
9. test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/control-plane/publication-active-gate-handoff-contract.js`, `src/admin/admin-control-snapshot-class-part-2.js`, `src/diagnostics/topology-convergence-graph.js`, `scripts/analyze-topology-convergence.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`, `test/scripts/analyze-topology-convergence.test.js`, `test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`, `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`
- Forbidden files: none beyond declared scope.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json --handoff-probe`, `npm run audit:guideline:literals -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/distributed/harness/cluster-segment-7-class-5.js ./test/control-plane/publication-active-gate-handoff-contract.test.js ./test/scripts/analyze-topology-convergence.test.js ./test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`, `npm run audit:guideline:decision-boundaries -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/distributed/harness/cluster-segment-7-class-5.js`, `npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/distributed/harness/cluster-segment-7-class-5.js`
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

- [x] implementation: status: validated; evidence: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js` passed 169/169; `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json --handoff-probe` detected pendingRecoveryCount=1 and wait_owner_recovery with runtimePromotionAllowed=false; representative rerun `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json --fast-local --verbose` stayed red/same frontier with canonical recovery projection; static guardrails passed; parent revalidated focused proof: yes; next: verifier-fixer then successor action.
- [x] verification-fix: status: validated; evidence: Carver verified the projection package, reran focused proof after fixing the bounded retry drift in `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`, confirmed the fresh handoff probe exposes wait_owner_recovery pendingRecoveryCount=1 with runtimePromotionAllowed=false, and confirmed static guardrails pass; parent reran `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js` with 169/169 passing and `npm run work:package:doctor -- --suggest work/packages/done-20260522-rolling-restart-active-gate-pending-recovery-projection.md` clean; changed files: `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`; parent revalidated focused proof: yes; next: close package and open successor `startup_active_gate_owner / snapshot_coverage / owner_recovery_completion`.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card; next: closure validation.

## Validation

1. npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json --handoff-probe
3. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json --fast-local --verbose
4. npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json
5. npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json
6. npm run audit:guideline:literals -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/distributed/harness/cluster-segment-7-class-5.js ./test/control-plane/publication-active-gate-handoff-contract.test.js ./test/scripts/analyze-topology-convergence.test.js ./test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js
7. npm run audit:guideline:decision-boundaries -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/distributed/harness/cluster-segment-7-class-5.js
8. npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/distributed/harness/cluster-segment-7-class-5.js
9. git diff --check -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/control-plane/publication-active-gate-handoff-contract.test.js test/scripts/analyze-topology-convergence.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js work/packages/done-20260522-rolling-restart-active-gate-pending-recovery-projection.md work/sprints/current-blocker.md work/sprints/current-blocker.json

## Commit And Push Ledger

1. Focused package commit: 61083bd1a560c1962187ff165cfd9986870f53a6
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
