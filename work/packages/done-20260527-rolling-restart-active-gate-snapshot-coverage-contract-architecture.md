# Rolling Restart Active Gate Snapshot Coverage Contract Architecture

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-27",
    "lane": "experiment",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage_contract_gap",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Representative evidence selects startup_active_gate_owner / snapshot_coverage at active_gate_snapshot_coverage; the package records the bounded next decision before runtime edits.",
    "nextAction": "Define the missing active-gate snapshot coverage progress contract across selected-source owner recovery, active-gate retry cadence, and alternative witness selection, then select one implementable successor or architecture stop.",
    "closed": "2026-05-27"
  },
  "scope": {
    "writeScope": [
      "work/packages/todo-20260527-rolling-restart-active-gate-snapshot-coverage-contract-architecture.md",
      "work/packages/active-20260527-rolling-restart-active-gate-snapshot-coverage-contract-architecture.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "test/distributed/harness/cluster-control-snapshot-recovery.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
      "test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js"
    ],
    "commitScope": [
      "work/packages/todo-20260527-rolling-restart-active-gate-snapshot-coverage-contract-architecture.md",
      "work/packages/active-20260527-rolling-restart-active-gate-snapshot-coverage-contract-architecture.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal with focused proof."
  },
  "modelFit": {
    "packageClass": "experiment",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260526-rolling-restart-selected-snapshot-source-staleness",
      "theory-20260526-rolling-restart-selected-view-best-view-evidence-gap",
      "theory-20260526-rolling-restart-active-gate-evidence-capture-gap",
      "theory-20260522-snapshot-watch-handoff-contract"
    ],
    "theoryLedger": "no-ledger-update",
    "proof": {
      "commands": [
        "falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
        "regression: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --handoff-probe",
        "supporting: npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "work/packages/active-20260527-rolling-restart-active-gate-snapshot-coverage-contract-architecture.md",
        "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
        "work/sprints/current-blocker.md",
        "work/sprints/current-blocker.json"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    }
  },
  "boundedExperiment": {
    "hypothesis": "Same-frontier active_gate_snapshot_coverage persists because the owner contract does not define how selected-source timeout, wait_owner_recovery owner queue state, retry cadence, and alternative witness evidence converge into bounded progress.",
    "hypothesisDiscriminator": "H1 retry-cadence contract if active_gate_attempts stay 1/8 while retryAfterMs consumes the active gate budget; H2 owner-recovery contract if selectedControlPlaneOwnerQueuePendingWrites=1 and requiredProgressMechanism=reconcile remain dominant; H3 witness-selection contract if alternativeSnapshotWitnessAvailable=true can replace the timed-out selected source; H4 architecture-gap stop if no single contract can be selected.",
    "expectedMetric": "One selected contract with route owner/boundary, active_gate_attempts, selectedSnapshotObservationRetryAfterMs, selectedControlPlaneOwnerQueuePendingWrites, alternativeSnapshotWitnessAvailable, snapshotCoverageNodeCount, and proof command.",
    "inheritsFrom": "work/packages/done-20260527-rolling-restart-active-gate-wait-owner-recovery-selected-source-runtime.md",
    "timebox": "24h",
    "mergeRequirement": "scenario route, topology handoff probe, causal model, and one selected implementable successor or architecture stop",
    "killRule": "Do not edit runtime files in this architecture experiment; if evidence cannot select one contract, stop as architecture-gap rather than opening a runtime package."
  },
  "validationTier": "cross-owner",
  "observablePrediction": {
    "metric": "One selected contract with route owner/boundary, active_gate_attempts, selectedSnapshotObservationRetryAfterMs, selectedControlPlaneOwnerQueuePendingWrites, alternativeSnapshotWitnessAvailable, snapshotCoverageNodeCount, and proof command.",
    "predicted": "One selected contract with route owner/boundary, active_gate_attempts, selectedSnapshotObservationRetryAfterMs, selectedControlPlaneOwnerQueuePendingWrites, alternativeSnapshotWitnessAvailable, snapshotCoverageNodeCount, and proof command.",
    "observed": "H2 selected: topology handoff reports requiredProgressMechanism=reconcile, selectedControlPlaneOwnerQueuePendingWrites=1, handoffOutcome=write_deferred, pendingRecoveryCount=1, runtimePromotionAllowed=false, while priority-recovery residuals remain zero and the route stays startup_active_gate_owner / snapshot_coverage.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json"
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
      "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --handoff-probe",
      "npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "causalGovernance": {
    "hypothesis": "The repeated same-frontier active_gate_snapshot_coverage failure is an architecture contract gap inside startup_active_gate_owner: selected snapshot timeout, wait_owner_recovery owner queue state, retry cadence, and alternative witness availability are observed but not yet reduced into one bounded progress contract.",
    "stopConditionCheck": "Run npm run analyze:causal-model, scenario-route, and topology handoff probe on test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json before any runtime edits.",
    "expectedCausalModelChange": "The experiment selected the selected-source owner-recovery reconcile contract as the implementable successor; runtime files remain frozen in this package.",
    "representativeOutcome": "classification-only",
    "causalDebt": "Fresh representative evidence has active_gate_timeout exhausted at one attempt, selectedSnapshotObservationRetryAfterMs=15000, selectedControlPlaneOwnerQueuePendingWrites=1, requiredProgressMechanism=reconcile, alternativeSnapshotWitnessAvailable=true, snapshotCoverageNodeCount=1/5, and zero priority-recovery residuals.",
    "crossBoundaryReview": "Do not change readiness, publication, operation workflow, timeout budgets, diagnostics capture, or runtime files in this package; only classify the active-gate contract gap."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate snapshot coverage contract architecture gap",
    "phaseChain": [
      "priority recovery residuals remain zero after stale-cache scheduling work",
      "fresh rolling-restart rerun stayed on active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
      "handoff evidence shows wait_owner_recovery with one pending selected owner recovery node and selectedControlPlaneOwnerQueuePendingWrites=1",
      "active-gate attempts remain one of eight while selected snapshot retryAfterMs=15000 consumes the terminal active-gate budget"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage_contract_gap / active_gate_timed_out (source route: snapshot_coverage)",
    "knownDownstreamBlockers": [
      "startup readiness remains downstream of active-gate snapshot coverage",
      "operation workflow and priority recovery are not first blockers because residual witnesses are zero"
    ],
    "missingCausalEdge": "The system lacks one owner-owned active-gate snapshot coverage contract that chooses between retry cadence, selected-source owner recovery reconcile progress, and alternative witness selection.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --handoff-probe",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Architecture proof must select one retry, reconcile, witness-selection, owner-boundary migration, or architecture-gap outcome before runtime edits resume.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json",
    "expectedObservableTransition": "Selected-source owner-recovery reconcile contract is recorded without runtime edits.",
    "maxProgressBound": "one architecture experiment only; no runtime edits in this package",
    "sameFrontierFallback": "If canonical proof cannot select one contract from the current evidence, close as architecture-gap and do not open a runtime-owner-boundary package.",
    "expectedNextFrontier": "selected retry-cadence contract, selected-source owner recovery reconcile contract, alternative witness selection contract, owner-boundary migration, or architecture-gap stop",
    "resultClassification": "classification-only",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260527-rolling-restart-active-gate-snapshot-coverage-post-stale-cache-route.md / startup_active_gate_owner / snapshot_coverage / classification-only",
      "done-20260527-rolling-restart-active-gate-wait-owner-recovery-selected-source-runtime.md / startup_active_gate_owner / snapshot_coverage / same-frontier"
    ],
    "oscillationCheck": "This package exists because same-frontier active-gate evidence repeated without metric reduction; runtime edits remain frozen.",
    "handoffInvariant": "The experiment may select a contract but must not promote runtime coverage, mutate publication/readiness ownership, or edit runtime files."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "architecture-gap",
    "triggerEvidence": [
      "fresh representative rerun stayed same-frontier at active_gate_snapshot_coverage with no metric reduction",
      "validator rejected another same-frontier runtime successor before an autonomous architecture experiment",
      "current evidence exposes selectedSnapshotObservationRetryAfterMs=15000, selectedControlPlaneOwnerQueuePendingWrites=1, requiredProgressMechanism=reconcile, and alternativeSnapshotWitnessAvailable=true"
    ],
    "selectedChoice": "owner-recovery-reconcile-contract",
    "choices": [
      {
        "id": "retry-cadence-contract",
        "summary": "Select a runtime successor that re-arms active-gate retry cadence when selected snapshot retryAfterMs consumes the active gate budget.",
        "route": "continue-local-proof",
        "proof": [
          "npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json"
        ]
      },
      {
        "id": "owner-recovery-reconcile-contract",
        "summary": "Select a runtime successor that reconciles selected-source owner recovery when owner queue pending writes remain bounded but coverage cannot progress.",
        "route": "continue-local-proof",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --handoff-probe"
        ]
      },
      {
        "id": "alternative-witness-selection-contract",
        "summary": "Select a runtime successor that defines when an available alternative snapshot witness replaces the timed-out selected source.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage"
        ]
      },
      {
        "id": "architecture-gap-stop",
        "summary": "Close as architecture-gap if canonical evidence cannot distinguish one implementable contract.",
        "route": "architecture-package",
        "proof": [
          "npm run work:advance -- --check"
        ]
      }
    ],
    "nextAction": "Open the selected-source owner-recovery reconcile runtime successor."
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H2",
    "decision": "open-runtime-owner-boundary",
    "nextOwner": "startup_active_gate_owner",
    "nextBoundary": "snapshot_coverage",
    "evidence": "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --handoff-probe; npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json"
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage_contract_gap",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage_contract_gap --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "theoryLedger": "no-ledger-update",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "work/packages/active-20260527-rolling-restart-active-gate-snapshot-coverage-contract-architecture.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package owns startup_active_gate_owner / snapshot_coverage_contract_gap because the selected evidence routes active_gate_timed_out there. It must either move that owner contract or preserve the classification before downstream symptoms are patched.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json`.

## Workflow Lane

- Selected lane: `experiment`
- Why this lane is sufficient: success criterion is information from a bounded hypothesis discriminator, not runtime metric movement.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.



## Bounded Experiment

- Hypothesis: Same-frontier active_gate_snapshot_coverage persists because the owner contract does not define how selected-source timeout, wait_owner_recovery owner queue state, retry cadence, and alternative witness evidence converge into bounded progress.
- Hypothesis discriminator: H1 retry-cadence contract if active_gate_attempts stay 1/8 while retryAfterMs consumes the active gate budget; H2 owner-recovery contract if selectedControlPlaneOwnerQueuePendingWrites=1 and requiredProgressMechanism=reconcile remain dominant; H3 witness-selection contract if alternativeSnapshotWitnessAvailable=true can replace the timed-out selected source; H4 architecture-gap stop if no single contract can be selected.
- Expected metric: One selected contract with route owner/boundary, active_gate_attempts, selectedSnapshotObservationRetryAfterMs, selectedControlPlaneOwnerQueuePendingWrites, alternativeSnapshotWitnessAvailable, snapshotCoverageNodeCount, and proof command.
- Inherits from: `work/packages/done-20260527-rolling-restart-active-gate-wait-owner-recovery-selected-source-runtime.md`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: scenario route, topology handoff probe, causal model, and one selected implementable successor or architecture stop
- Kill rule: Do not edit runtime files in this architecture experiment; if evidence cannot select one contract, stop as architecture-gap rather than opening a runtime package.
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.

## Observable Prediction

- Metric: One selected contract with route owner/boundary, active_gate_attempts, selectedSnapshotObservationRetryAfterMs, selectedControlPlaneOwnerQueuePendingWrites, alternativeSnapshotWitnessAvailable, snapshotCoverageNodeCount, and proof command.
- Predicted: One selected contract with route owner/boundary, active_gate_attempts, selectedSnapshotObservationRetryAfterMs, selectedControlPlaneOwnerQueuePendingWrites, alternativeSnapshotWitnessAvailable, snapshotCoverageNodeCount, and proof command.
- Observed: pending-before-observation
- Accuracy: pending-before-observation
- Evidence: pending-before-observation
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage_contract_gap`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-runtime-owner-boundary`
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/todo-20260527-rolling-restart-active-gate-snapshot-coverage-contract-architecture.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/todo-20260527-rolling-restart-active-gate-snapshot-coverage-contract-architecture.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage_contract_gap`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role review --package work/packages/todo-20260527-rolling-restart-active-gate-snapshot-coverage-contract-architecture.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. work/packages/todo-20260527-rolling-restart-active-gate-snapshot-coverage-contract-architecture.md
2. work/packages/active-20260527-rolling-restart-active-gate-snapshot-coverage-contract-architecture.md
3. work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md
4. work/sprints/current-blocker.md
5. work/sprints/current-blocker.json

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `experiment`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/packages/todo-20260527-rolling-restart-active-gate-snapshot-coverage-contract-architecture.md`, `work/packages/active-20260527-rolling-restart-active-gate-snapshot-coverage-contract-architecture.md`, `work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: one probe that distinguishes hypotheses; success is information, not runtime metric movement
- Safe to execute when:
1. owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Keep runtime behavior frozen until the probe distinguishes competing hypotheses.
2. Promote only the discriminated owner/boundary into a follow-on runtime or architecture package.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: workflow_tooling_owner; files-changed: work/packages/active-20260527-rolling-restart-active-gate-snapshot-coverage-contract-architecture.md, work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md, work/sprints/current-blocker.md, work/sprints/current-blocker.json; validation: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --handoff-probe; npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: none; validation: verified selected H2 architecture route from handoff probe; parent revalidated focused proof: yes; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: npm run work:repair before closure; parent revalidated focused proof: yes; outcome: validated.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json
2. npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --markdown
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --markdown

## Commit And Push Ledger

1. Focused package commit: 86f308431e0a7fba193eca0fcfdb9183e5985d03
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
