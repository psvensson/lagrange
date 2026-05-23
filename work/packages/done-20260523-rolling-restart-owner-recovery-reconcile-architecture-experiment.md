# Rolling Restart Owner Recovery Reconcile Architecture Experiment

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-23",
  "lane": "experiment",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Closed as H2 selected. Canonical handoff evidence still reports a queue projection, but direct report progress has selectedControlPlaneOwnerQueueDepth=null and no membership handoff outcome while the causal model reports exhausted active_gate_timeout and active_gate_attempts; selectedSnapshotObservationRetryAfterMs collapsed to the late retry floor of 50ms.",
  "nextAction": "Open a runtime-owner-boundary package for startup_active_gate_owner / selected_snapshot_late_retry_floor_contract so selected-source retry does not halve the late active-gate floor before coverage can observe.",
  "stabilityCredit": "local-proof-only",
  "representativeRerunCadence": "architecture-stop-reason",
  "whyHighestLeverageNow": "The active-gate probe budget contract now has focused proof, but the fresh representative stayed same-frontier with snapshotCoverageNodeCount 0/5. The package kill rule blocks another local runtime patch until an architecture experiment distinguishes the remaining owner recovery reconcile/write_deferred edge, active-gate retry cadence, owner-boundary migration, or architecture-gap.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260523-rolling-restart-owner-recovery-reconcile-architecture-experiment.md"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js"
  ],
  "commitScope": [
    "work/packages/done-20260523-rolling-restart-owner-recovery-reconcile-architecture-experiment.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "modelFit": {
    "packageClass": "experiment",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "H1 owner-recovery reconcile/wake debt: after the probe-budget proof, the selected snapshot observation still returns repair_deferred with retryAfterMs=50 because write_deferred owner recovery evidence is observed but not enqueued or woken. H2 active-gate retry-cadence debt: the gate only makes two active attempts and reaches terminal selected-source retry before a bounded reconcile retry can observe. H3 owner-boundary migration: a publication/readiness owner owns the next edge despite current active-gate routing.",
    "hypothesisDiscriminator": "H1 is selected if canonical handoff evidence shows owner queue observed pendingWrites=1, handoff outcome write_deferred/enqueued=false/retryAfterMs=0, pendingRecoveryCount=1, requiredProgressMechanism=reconcile, and no positive wake/drain action. H2 is selected if active_gate_attempts or active_gate_timeout budget state explains the no-movement independently of queue state. H3 is selected only if evidence summary or causal model migrates the first frontier owner/boundary.",
    "expectedMetric": "owner queue depth/outcome, handoff enqueue/retryAfterMs, requiredProgressMechanism, active_gate_attempts budget state, active_gate_timeout budget state, snapshotCoverageNodeCount, and route owner/boundary",
    "inheritsFrom": "work/packages/done-20260522-rolling-restart-active-gate-probe-budget-contract.md",
    "timebox": "24h",
    "mergeRequirement": "Canonical proof selects one concrete runtime owner proof, owner-boundary migration, or architecture-gap stop before runtime edits.",
    "killRule": "Do not open another local startup_active_gate_owner / snapshot_coverage runtime patch unless this experiment names the missing reconcile, wake, retry-cadence, or migrated-owner contract from canonical evidence."
  },
  "validationTier": "cross-owner",
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Open the selected_snapshot_late_retry_floor_contract runtime successor."
  },
  "causalGovernance": {
    "hypothesis": "After the active-gate probe budget ordering proof, the remaining rolling-restart blocker is a missing owner-selected contract for write_deferred recovery progress: either owner recovery reconcile/wake must be scheduled, the active-gate retry cadence must reserve another bounded observation attempt, or the first executable edge must migrate.",
    "stopConditionCheck": "Run npm run work:evidence-summary, npm run analyze:topology-convergence -- --handoff-probe, and npm run analyze:causal-model on test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json before any runtime edits.",
    "expectedCausalModelChange": "This experiment changes no runtime behavior; it selected the selected-source late retry floor contract as the next owner path before implementation resumes.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh representative evidence remains active_gate_snapshot_coverage with snapshotCoverageNodeCount 0/5 and selectedSnapshotObservationRetryAfterMs=50. Handoff probe projects owner recovery reconcile evidence, but the direct report progress has selectedControlPlaneOwnerQueueDepth=null, membershipPublicationHandoffOutcomeState=null, membershipPublicationHandoffOutcomeEnqueued=false, activeGateOwnerCohortPendingRecoveryCount=1, active_gate_timeout exhausted, and active_gate_attempts exhausted.",
    "crossBoundaryReview": "Keep publication convergence, priority recovery, readiness support semantics, runtime promotion safety, and product/scenario timeout ceilings frozen; this package only classifies the next owner contract."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate_snapshot_coverage after active_gate_probe_budget_contract focused proof",
    "phaseChain": [
      "publication convergence is satisfied",
      "priority recovery residuals are absent",
      "active-gate probe budget ordering focused proof passed",
      "fresh representative rerun stayed same-frontier with snapshotCoverageNodeCount 0/5",
      "handoff probe reports write_deferred owner recovery evidence with requiredProgressMechanism=reconcile"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness support remains inherited from active-gate no progress",
      "load-readiness is not reached",
      "runtime promotion remains unsafe while snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "The active gate does not yet expose which bounded progress mechanism should convert write_deferred owner recovery evidence into reconcile progress after the budget-ordering proof.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json --handoff-probe",
    "falsifyingProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json --handoff-probe",
    "boundedProgressProof": "The experiment must select owner recovery reconcile/wake, active-gate retry cadence, owner-boundary migration, or architecture-gap from canonical evidence before runtime edits resume.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json",
    "expectedObservableTransition": "Canonical proof plus narrow raw fallback selects startup_active_gate_owner / selected_snapshot_late_retry_floor_contract as the runtime successor.",
    "maxProgressBound": "architecture experiment only; no runtime edits in this package",
    "sameFrontierFallback": "If the discriminator cannot name one contract, close as architecture-gap instead of opening another same-frontier runtime patch.",
    "expectedNextFrontier": "selected_snapshot_late_retry_floor_contract runtime successor",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260522-rolling-restart-startup-active-gate-owner-snapshot-coverage / startup_active_gate_owner / snapshot_coverage / migrated to active_gate_probe_budget_contract",
      "done-20260522-rolling-restart-active-gate-probe-budget-contract / startup_active_gate_owner / active_gate_probe_budget_contract / same-frontier no representative movement"
    ],
    "oscillationCheck": "same-frontier/no movement after the selected local active-gate budget proof satisfies the kill rule for an autonomous architecture experiment",
    "handoffInvariant": "Typed wait_owner_recovery and write_deferred evidence may only advance through a named bounded progress mechanism; runtime promotion remains blocked while snapshot coverage is incomplete."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "The previous architecture experiment selected active_gate_probe_budget_contract and that focused proof passed.",
      "Fresh representative evidence stayed same-frontier with snapshotCoverageNodeCount 0/5 and selectedSnapshotObservationRetryAfterMs=50.",
      "Canonical handoff evidence shows owner queue pendingWrites=1 and write_deferred/enqueued=false/retryAfterMs=0 with requiredProgressMechanism=reconcile."
    ],
    "selectedChoice": "open-architecture-package",
    "choices": [
      {
        "id": "open-architecture-package",
        "summary": "Run this owner recovery reconcile architecture experiment before runtime implementation resumes.",
        "route": "architecture-package",
        "proof": [
          "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json --handoff-probe",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json"
        ]
      },
      {
        "id": "continue-local-proof",
        "summary": "Open only after this experiment names one runtime owner contract and focused proof surface.",
        "route": "continue-local-proof",
        "proof": [
          "focused owner proof selected by this experiment"
        ]
      },
      {
        "id": "human-escalation",
        "summary": "Use only for contradictory evidence, missing artifacts, or blocked tooling.",
        "route": "human-escalation",
        "proof": [
          "canonical evidence contradiction or tool failure evidence"
        ]
      }
    ],
    "nextAction": "Execute the architecture discriminator and then open the selected successor package."
  },
  "observablePrediction": {
    "metric": "owner queue depth/outcome, handoff enqueue/retryAfterMs, requiredProgressMechanism, active_gate_attempts budget state, active_gate_timeout budget state, snapshotCoverageNodeCount, and route owner/boundary",
    "predicted": "Canonical evidence will select owner recovery reconcile/write_deferred wake debt if pendingWrites=1, enqueued=false, retryAfterMs=0, pendingRecoveryCount=1, and requiredProgressMechanism=reconcile remain the only concrete progress mechanism after the budget-ordering proof.",
    "observed": "Canonical handoff probe projected reconcile evidence, but raw report progress did not carry selected queue/outcome fields; causal model selected active_gate_timeout and active_gate_attempts exhaustion, and direct progress showed selectedSnapshotObservationRetryAfterMs=50.",
    "accuracy": "missed",
    "evidence": "test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json",
    "metricDelta": 0
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H2",
    "decision": "open-runtime-owner-boundary",
    "nextOwner": "startup_active_gate_owner",
    "nextBoundary": "selected_snapshot_late_retry_floor_contract",
    "evidence": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json"
  },
  "inheritsContext": {
    "owner": true,
    "boundary": true,
    "forbiddenScope": true,
    "proofCommands": true,
    "stopRule": true
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex-spark",
    "allowedDecisionDepth": "one probe that distinguishes hypotheses; success is information, not runtime metric movement",
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
      "Keep runtime behavior frozen until the probe distinguishes competing hypotheses.",
      "Promote only the discriminated owner/boundary into a follow-on runtime or architecture package."
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json --handoff-probe",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Selected-source retry preserves the late active-gate timeout floor instead of halving it to 50ms; fresh representative increases selectedSnapshotObservationRetryAfterMs, increases snapshotCoverageNodeCount, migrates owner/boundary, or passes rolling-restart.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json --owner startup_active_gate_owner --boundary selected_snapshot_late_retry_floor_contract --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-23",
  "successor": "work/packages/active-20260523-rolling-restart-selected-snapshot-late-retry-floor-contract.md"
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `experiment`
- Why this lane is sufficient: success criterion is information from a bounded hypothesis discriminator, not runtime metric movement.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.



## Bounded Experiment

- Hypothesis: H1 owner-recovery reconcile/wake debt: after the probe-budget proof, the selected snapshot observation still returns repair_deferred with retryAfterMs=50 because write_deferred owner recovery evidence is observed but not enqueued or woken. H2 active-gate retry-cadence debt: the gate only makes two active attempts and reaches terminal selected-source retry before a bounded reconcile retry can observe. H3 owner-boundary migration: a publication/readiness owner owns the next edge despite current active-gate routing.
- Hypothesis discriminator: H1 is selected if canonical handoff evidence shows owner queue observed pendingWrites=1, handoff outcome write_deferred/enqueued=false/retryAfterMs=0, pendingRecoveryCount=1, requiredProgressMechanism=reconcile, and no positive wake/drain action. H2 is selected if active_gate_attempts or active_gate_timeout budget state explains the no-movement independently of queue state. H3 is selected only if evidence summary or causal model migrates the first frontier owner/boundary.
- Expected metric: owner queue depth/outcome, handoff enqueue/retryAfterMs, requiredProgressMechanism, active_gate_attempts budget state, active_gate_timeout budget state, snapshotCoverageNodeCount, and route owner/boundary
- Inherits from: `work/packages/done-20260522-rolling-restart-active-gate-probe-budget-contract.md`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: Canonical proof selects one concrete runtime owner proof, owner-boundary migration, or architecture-gap stop before runtime edits.
- Kill rule: Do not open another local startup_active_gate_owner / snapshot_coverage runtime patch unless this experiment names the missing reconcile, wake, retry-cadence, or migrated-owner contract from canonical evidence.
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.

## Observable Prediction

- Metric: owner queue depth/outcome, handoff enqueue/retryAfterMs, requiredProgressMechanism, active_gate_attempts budget state, active_gate_timeout budget state, snapshotCoverageNodeCount, and route owner/boundary
- Predicted: owner queue depth/outcome, handoff enqueue/retryAfterMs, requiredProgressMechanism, active_gate_attempts budget state, active_gate_timeout budget state, snapshotCoverageNodeCount, and route owner/boundary
- Observed: Canonical handoff probe projected reconcile evidence, but raw report progress did not carry selected queue/outcome fields; causal model selected active_gate_timeout and active_gate_attempts exhaustion, and direct progress showed `selectedSnapshotObservationRetryAfterMs=50`.
- Accuracy: `missed`
- Evidence: `test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json`
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json`
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

1. work/packages/done-20260523-rolling-restart-owner-recovery-reconcile-architecture-experiment.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `experiment`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/packages/done-20260523-rolling-restart-owner-recovery-reconcile-architecture-experiment.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: one probe that distinguishes hypotheses; success is information, not runtime metric movement
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Keep runtime behavior frozen until the probe distinguishes competing hypotheses.
2. Promote only the discriminated owner/boundary into a follow-on runtime or architecture package.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json`, and a narrow raw fallback on activeGate.progress selected the late retry floor successor; parent revalidated focused proof: yes; next: open runtime successor.
- [x] verification-fix: status: superseded; evidence: pure classification fast path only changed package/tracker truth and runtime files stayed candidates; changed files: none; parent revalidated focused proof: yes; next: open runtime successor.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card when needed; next: validation.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json --handoff-probe
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json
