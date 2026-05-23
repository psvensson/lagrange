# Rolling Restart Selected Snapshot Timeout Repair Deferred Owner Recovery

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-23",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Fresh rolling-restart representative evidence remains at active_gate_snapshot_coverage after publication blocker projection. Publication and priority recovery are satisfied, but active-gate progress has snapshotCoverage=1/5, selected_snapshot_source_timeout after 15000ms on an admin_health-ready selected node, selected snapshot observation repair_deferred/retry, alternativeSnapshotWitnessAvailable=true, and wait_owner_recovery pendingRecoveryCount=1.",
  "nextAction": "Use canonical evidence from the fresh representative to implement the smallest startup_active_gate_owner snapshot_coverage fix for selected snapshot source timeout and repair-deferred owner recovery without widening timeouts or runtime promotion.",
  "stabilityCredit": "local-proof-only",
  "representativeRerunCadence": "scheduled-rerun-command",
  "whyHighestLeverageNow": "The previous package removed the stale publication_gate blocker family and left a narrower startup active-gate snapshot coverage blocker. The remaining canonical evidence names one selected-source timeout and repair-deferred owner recovery path with an available alternate witness, so the next highest-leverage action is a bounded startup_active_gate_owner / snapshot_coverage proof before another representative rerun.",
  "theoryLedgerRefs": [
    "theory-20260522-snapshot-watch-handoff-contract"
  ],
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json --explain active_gate_snapshot_coverage",
    "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js # focused contract fixture and affected consumer proof for selected snapshot timeout repair-deferred owner recovery",
    "npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-snapshot-timeout-repair-deferred-owner-recovery-20260523T061500Z.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-timeout-repair-deferred-owner-recovery-20260523T061500Z.report.json"
  ],
  "writeScope": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js"
  ],
  "commitScope": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "work/packages/active-20260523-rolling-restart-selected-snapshot-timeout-repair-deferred-owner-recovery.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "modelFit": {
    "packageClass": "causal-escalation",
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
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json",
      "npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json --markdown",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json --markdown"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Focused proof should turn selected_snapshot_source_timeout plus repair_deferred wait_owner_recovery evidence into bounded owner-recovery progress, alternate snapshot selection, count movement, owner/boundary migration, or rolling-restart green.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Implement the selected snapshot timeout and repair-deferred owner recovery path so snapshot coverage can make bounded progress or migrate."
  },
  "causalGovernance": {
    "hypothesis": "Snapshot coverage remains blocked because selected snapshot timeout evidence is classified as repair_deferred/retry even when admin_health reachability and an alternate snapshot witness are available, so active-gate owner recovery keeps waiting instead of making bounded selected-source recovery progress.",
    "stopConditionCheck": "Run canonical evidence summary, active_gate_snapshot_coverage explain, focused snapshot timeout repair proof, static guardrails, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-timeout-repair-deferred-owner-recovery-20260523T061500Z.report.json`, a fresh rolling-restart representative rerun, and evidence summary before closure.",
    "expectedCausalModelChange": "Focused proof should show selected_snapshot_source_timeout plus repair_deferred/wait_owner_recovery emits bounded owner recovery or alternate witness progress without runtime promotion. Fresh representative should move snapshotCoverage above 1/5, clear selected snapshot timeout, migrate owner/boundary, or pass.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh artifact has publication_ack_convergence satisfied, priority recovery satisfied, activeGateOwnerCohortMissingPublishedCount=0, but active-gate progress is timed_out with snapshotCoverage=1/5, selectedSnapshotSourceCause=selected_snapshot_source_timeout, selectedSnapshotObservationMode=repair_deferred, selectedSnapshotObservationNextAction=retry, alternativeSnapshotWitnessAvailable=true, pendingRecoveryCount=1, and runtimePromotionAllowed=false.",
    "crossBoundaryReview": "Keep publication ownership, priority recovery, startup readiness support, timeout budgets, and runtime promotion frozen. This package may only change harness startup active-gate snapshot coverage selection/recovery behavior and focused proof."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart selected snapshot timeout repair deferred owner recovery",
    "phaseChain": [
      "publication ACK convergence is satisfied",
      "priority recovery is satisfied with no residuals",
      "stale publication_gate blockers are removed",
      "active gate times out with snapshotCoverage=1/5",
      "selected snapshot source is admin_health-ready but snapshot lane times out after 15000ms",
      "selected snapshot observation is repair_deferred/retry with wait_owner_recovery pendingRecoveryCount=1"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness support remains inherited from active-gate no progress",
      "runtime promotion remains unsafe while snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "Selected snapshot timeout with repair_deferred, available alternate witness, and wait_owner_recovery must produce bounded snapshot coverage progress or an explicit owner-recovery outcome instead of retrying the same selected source until active-gate timeout.",
    "missingCausalEdgeProbe": "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "falsifyingProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Focused proof must show selected_snapshot_source_timeout plus repair_deferred/wait_owner_recovery either selects a bounded alternate witness path or records bounded owner recovery progress while runtimePromotionAllowed remains false.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json",
    "expectedObservableTransition": "Fresh representative should clear selected_snapshot_source_timeout, move snapshotCoverage above 1/5, produce owner/boundary migration, or pass.",
    "maxProgressBound": "one runtime-owner-boundary package before representative rerun",
    "sameFrontierFallback": "If fresh representative remains active_gate_snapshot_coverage with selected_snapshot_source_timeout, repair_deferred, and no metric movement, stop for an autonomous architecture experiment instead of another local snapshot_coverage patch.",
    "expectedNextFrontier": "snapshot coverage count movement, selected snapshot timeout cleared, owner/boundary migration, or rolling-restart green",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-active-gate-publication-blocker-projection / startup_active_gate_owner / publication_gate_blocker_projection_contract / reduced",
      "done-20260523-rolling-restart-publication-handoff-selected-coverage-projection / topology_publication_owner / publication_convergence / migrated",
      "done-20260523-rolling-restart-wait-owner-recovery-selected-source-timeout-contract / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "Allowed because the immediate predecessor reduced the blocker family and this package targets the remaining selected snapshot timeout and repair-deferred owner recovery path with a concrete alternate-witness signal.",
    "handoffInvariant": "wait_owner_recovery may drive bounded recovery or source selection progress but must not imply runtime promotion while snapshot coverage is incomplete."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "Doctor detected return to recently closed startup_active_gate_owner / snapshot_coverage packages.",
      "Immediate predecessor reduced the stale publication_gate blocker family, so this is not unchanged same-frontier evidence.",
      "Fresh explain evidence contains a narrower selected snapshot timeout plus repair_deferred/wait_owner_recovery path with alternativeSnapshotWitnessAvailable=true."
    ],
    "selectedChoice": "continue-local-proof",
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Implement the selected snapshot timeout repair-deferred owner recovery proof inside the declared harness files.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js # focused contract fixture and affected consumer proof"
        ]
      },
      {
        "id": "architecture-package",
        "summary": "Use if focused proof cannot separate selected-source recovery from broader snapshot coverage ownership.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json --explain active_gate_snapshot_coverage"
        ]
      },
      {
        "id": "human-escalation",
        "summary": "Use only for contradictory canonical evidence or blocked tooling.",
        "route": "human-escalation",
        "proof": [
          "blocked or contradictory tool evidence"
        ]
      }
    ],
    "nextAction": "Run the focused proof, then implement only the selected startup active-gate snapshot recovery edge."
  },
  "observablePrediction": {
    "metric": "selected_snapshot_source_timeout presence and snapshotCoverageNodeCount",
    "predicted": "Focused proof will convert selected_snapshot_source_timeout plus repair_deferred/wait_owner_recovery into bounded owner recovery or alternate witness progress while keeping runtimePromotionAllowed=false; fresh representative will clear selected_snapshot_source_timeout, move snapshotCoverageNodeCount above 1, migrate owner/boundary, or pass.",
    "observed": "pending-before-probe",
    "accuracy": "pending-before-observation",
    "evidence": "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js # focused contract fixture and affected consumer proof",
    "metricDelta": 0
  }
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the frontier returned to a recent startup_active_gate_owner / snapshot_coverage boundary, and this package records the selected missing edge before another local proof.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits the package outcome for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json --markdown.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Use canonical evidence from the fresh representative to implement the smallest startup_active_gate_owner snapshot_coverage fix for selected snapshot source timeout and repair-deferred owner recovery without widening timeouts or runtime promotion. | Focused proof should turn selected_snapshot_source_timeout plus repair_deferred wait_owner_recovery evidence into bounded owner-recovery progress, alternate snapshot selection, count movement, owner/boundary migration, or rolling-restart green. | npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json`
- Success metrics: Focused proof should turn selected_snapshot_source_timeout plus repair_deferred wait_owner_recovery evidence into bounded owner-recovery progress, alternate snapshot selection, count movement, owner/boundary migration, or rolling-restart green.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json`
- Expected delta: Focused proof should turn selected_snapshot_source_timeout plus repair_deferred wait_owner_recovery evidence into bounded owner-recovery progress, alternate snapshot selection, count movement, owner/boundary migration, or rolling-restart green.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
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

1. test/distributed/harness/cluster-segment-7-class-4.js
2. test/distributed/harness/cluster-segment-7-class-5.js
3. test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `test/distributed/harness/cluster-segment-7-class-4.js`, `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json --markdown`
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

- [ ] implementation: status: validated; evidence: <focused proof commands and results>; parent revalidated focused proof: yes; next: closure or successor action.
- [ ] verification-fix: status: validated; evidence: <verification/fix commands and results>; changed files: <paths or none>; parent revalidated focused proof: yes; next: closure or successor action.
- [ ] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card when needed; next: validation.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json
2. npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json --markdown
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json --markdown
