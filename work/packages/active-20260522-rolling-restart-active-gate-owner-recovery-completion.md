# Rolling Restart Active Gate Owner Recovery Completion

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-22",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "owner_recovery_completion",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Pending-recovery projection is now canonical: the fresh rolling-restart handoff probe exposes wait_owner_recovery, pendingRecoveryCount=1, pendingRecoveryNodeIds=[11601fe0-72d6-5853-8590-ec2881853e72], runtimePromotionAllowed=false, owner queue pendingWrites=1, and handoffOutcome write_deferred/enqueued=false while snapshotCoverage remains 0/5.",
  "nextAction": "Make wait_owner_recovery pendingRecoveryCount/nodeIds actionable for the owner recovery completion path so the selected snapshot owner can enqueue, complete, or explicitly classify recovery progress instead of remaining write_deferred/enqueued=false.",
  "stabilityCredit": "local-proof-only",
  "representativeRerunCadence": "scheduled-rerun-command",
  "whyHighestLeverageNow": "The previous package made pendingRecovery visible through the canonical handoff grammar; the fresh representative artifact now shows the exact recovery debt but the owner command outcome remains write_deferred/enqueued=false. Making that visible debt actionable is the next smallest local edge before another representative rerun.",
  "proof": [
    "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js # focused contract fixture and affected consumer proof",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json --handoff-probe",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json",
    "npm run audit:guideline:literals -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js ./test/control-plane/publication-active-gate-handoff-contract.test.js ./test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js ./test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "npm run audit:guideline:decision-boundaries -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js",
    "npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js"
  ],
  "writeScope": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js",
    "test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "scripts/analyze-topology-convergence.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js"
  ],
  "commitScope": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js",
    "test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "work/packages/active-20260522-rolling-restart-active-gate-owner-recovery-completion.md",
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
      "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json --handoff-probe",
      "npm run audit:guideline:literals -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js ./test/control-plane/publication-active-gate-handoff-contract.test.js ./test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js ./test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "owner_recovery_completion",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Owner recovery pending evidence becomes actionable owner-command progress: wait_owner_recovery with pendingRecoveryCount=1 should enqueue or complete the owner recovery path instead of remaining write_deferred/enqueued=false.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json --owner startup_active_gate_owner --boundary owner_recovery_completion --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "Rolling-restart remains blocked because wait_owner_recovery pendingRecoveryNodeIds are now visible through the canonical handoff/report grammar, but the owner recovery command path does not treat that pending recovery debt as an actionable completion/progress intent.",
    "stopConditionCheck": "Run npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json, focused contract and affected consumer proof, representative routing, static guardrails, and a fresh representative rerun before closure; do not reinterpret pending recovery debt as ready or runtime-promotable.",
    "expectedCausalModelChange": "The handoff outcome should move from write_deferred/enqueued=false toward an enqueued, completed, or explicitly classified owner recovery outcome while runtimePromotionAllowed remains false until snapshot coverage improves.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh artifact has snapshotCoverage=0/5, selected timeout after 1116ms, repair_deferred/retry, wait_owner_recovery, activeGateOwnerCohortPendingRecoveryCount=1, selectedControlPlaneOwnerQueuePendingWrites=1, and membershipPublicationHandoffOutcome write_deferred/enqueued=false.",
    "crossBoundaryReview": "Keep selected-source retry budgets, startup readiness, load-readiness, and runtime promotion gates frozen while owner recovery completion is made actionable."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate_snapshot_coverage owner recovery completion",
    "phaseChain": [
      "publication convergence is ready",
      "pendingRecoveryCount/nodeIds are visible on the selected handoff contract and active-gate progress",
      "selected source is admin_health ready but selected snapshot observation is repair_deferred/retry",
      "owner command outcome remains write_deferred/enqueued=false",
      "snapshotCoverage remains 0/5 and runtimePromotionAllowed=false"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / owner_recovery_completion / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness support remains inherited from active-gate no progress",
      "load-readiness is not reached",
      "runtime promotion remains unsafe while snapshotCoverage=0/5"
    ],
    "missingCausalEdge": "wait_owner_recovery pendingRecoveryNodeIds must become actionable owner recovery completion progress instead of remaining a write_deferred/enqueued=false handoff outcome.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json --handoff-probe",
    "falsifyingProbe": "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js # focused contract fixture and affected consumer proof",
    "boundedProgressProof": "Focused proof must show wait_owner_recovery pending recovery debt causes an owner recovery reconcile/enqueue/drain/classification outcome without allowing runtime promotion.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json",
    "expectedObservableTransition": "handoffOutcome changes from write_deferred/enqueued=false to an actionable owner recovery progress outcome, or the owner emits a distinct terminal/deferred recovery-completion classification.",
    "maxProgressBound": "one runtime-owner-boundary owner recovery completion package before representative rerun",
    "sameFrontierFallback": "If fresh representative evidence remains same-frontier with no outcome or metric movement, stop for an autonomous architecture experiment instead of another adjacent local patch.",
    "expectedNextFrontier": "snapshot coverage movement, recovery completion, or architecture-gap classification",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  },
  "observablePrediction": {
    "metric": "handoffOutcome state/enqueued and pendingRecoveryCount for wait_owner_recovery",
    "predicted": "wait_owner_recovery with pendingRecoveryCount=1 moves from write_deferred/enqueued=false to an actionable owner recovery reconcile/enqueue/drain/classification outcome while runtimePromotionAllowed remains false.",
    "observed": "pending-before-observation",
    "accuracy": "pending-before-observation",
    "evidence": "pending-before-observation"
  }
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

- Canonical outcome: startup_active_gate_owner / owner_recovery_completion emits the package outcome for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json --handoff-probe; npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js; npm run audit:guideline:literals -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js ./test/control-plane/publication-active-gate-handoff-contract.test.js ./test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js ./test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js; npm run audit:guideline:decision-boundaries -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js; npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js.
- State model or invariant: The startup_active_gate_owner / owner_recovery_completion decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / owner_recovery_completion invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / owner_recovery_completion / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Make wait_owner_recovery pendingRecoveryCount/nodeIds actionable for the owner recovery completion path so the selected snapshot owner can enqueue, complete, or explicitly classify recovery progress instead of remaining write_deferred/enqueued=false. | Owner recovery pending evidence becomes actionable owner-command progress: wait_owner_recovery with pendingRecoveryCount=1 should enqueue or complete the owner recovery path instead of remaining write_deferred/enqueued=false. | npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / owner_recovery_completion directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / owner_recovery_completion still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`
- Success metrics: Owner recovery pending evidence becomes actionable owner-command progress: wait_owner_recovery with pendingRecoveryCount=1 should enqueue or complete the owner recovery path instead of remaining write_deferred/enqueued=false.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json --owner startup_active_gate_owner --boundary owner_recovery_completion --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json`
- Expected delta: Owner recovery pending evidence becomes actionable owner-command progress: wait_owner_recovery with pendingRecoveryCount=1 should enqueue or complete the owner recovery path instead of remaining write_deferred/enqueued=false.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `owner_recovery_completion`
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
3. src/admin/admin-control-snapshot-class-part-6.js
4. test/control-plane/publication-active-gate-handoff-contract.test.js
5. test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js
6. test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/control-plane/publication-active-gate-handoff-contract.js`, `src/admin/admin-control-snapshot-class-part-2.js`, `src/admin/admin-control-snapshot-class-part-6.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`, `test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js`, `test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`
- Forbidden files: none beyond declared scope.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`, `npm test -- test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json --handoff-probe`, `npm run audit:guideline:literals -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js ./test/control-plane/publication-active-gate-handoff-contract.test.js ./test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js ./test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`, `npm run audit:guideline:decision-boundaries -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js`, `npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js`
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

- [x] implementation falsification: status: validated; wrong-slice evidence would be wait_owner_recovery requiring publication target widening, runtime promotion while recovery debt remains, or owner/boundary migration; evidence: pre-edit `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js` failed in existing flat-coverage refresh proof, then implementation kept recovery debt out of publication targets and made it a handoff-only owner wake; next: run full proof ladder.
- [x] implementation: status: validated; evidence: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js` passed after edits; files: `src/control-plane/publication-active-gate-handoff-contract.js`, `src/admin/admin-control-snapshot-class-part-2.js`, `src/admin/admin-control-snapshot-class-part-6.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`, `test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js`; parent revalidated focused proof: yes; next: full proof ladder and representative rerun.
- [x] verification-fix: status: validated; evidence: Lovelace verifier-fixer made no edits and reported `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js` pass 230/230, handoff probe pass with `wait_owner_recovery` and pendingRecoveryCount=1, evidence-summary pass, literal/decision-boundary/runtime-grammar audits pass; changed files: none; parent revalidated focused proof: yes with the same 230/230 command; next: closure or successor action.
- [x] representative rerun: status: validated; evidence: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --fast-local --verbose` failed 0/1 with active=4/5 and snapshotCoverage=0/5, but the old owner recovery edge moved out of evidence: handoff probe reports detected=false, handoffContract absent, pendingRecoveryCount=0, owner queue unknown, and canonical route is `startup_active_gate_owner / snapshot_coverage / active_gate_timed_out`; `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out` selected a runtime-owner-boundary successor; next: migrate to snapshot_coverage successor.
- [x] repair: status: superseded; evidence: `npm run work:repair` ran after activating the successor and exposed the expected interim two-active-package ambiguity (`current-blocker` recorded no active package); the required route-after-rerun migration transaction will refresh the generated blocker after the predecessor moves to done; next: migration validation.

## Validation

1. npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js
2. npm test -- test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-pending-recovery-projection-20260522T223745Z.report.json --handoff-probe
4. npm run audit:guideline:literals -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js ./test/control-plane/publication-active-gate-handoff-contract.test.js ./test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js ./test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js
5. npm run audit:guideline:decision-boundaries -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js
6. npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js
