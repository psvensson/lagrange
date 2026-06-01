# Rolling Restart Selected Transport Closed Architecture Experiment

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-23",
  "lane": "experiment",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Architecture discriminator selected H2 observation normalization / selected transport-closed owner contract debt. Canonical evidence reports selectedSnapshotSourceCause=selected_transport_closed and final selectedSnapshotError=connection closed before response, but report progress still emits selectedSnapshotObservationReasonCodes=[selected_timeout] while owner queue bounded-defer evidence is already explicit.",
  "nextAction": "Close this experiment as migrated/successor-selected and activate a runtime-owner-boundary successor for startup_active_gate_owner / selected_transport_closed_observation_contract.",
  "stabilityCredit": "local-proof-only",
  "representativeRerunCadence": "architecture-stop-reason",
  "whyHighestLeverageNow": "The workflow rejected a third same owner/boundary runtime package after repeated active_gate_snapshot_coverage crossings. This package is the required bounded architecture experiment: it freezes runtime edits and names the selected_transport_closed owner contract before implementation resumes.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260523-rolling-restart-selected-transport-closed-architecture-experiment.md"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js"
  ],
  "commitScope": [
    "work/packages/done-20260523-rolling-restart-selected-transport-closed-architecture-experiment.md",
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
    "hypothesis": "H1 transport lifecycle debt: the selected admin query connection closes before response after the owner queue bounded defer, and the next runtime edge is lane/session retry or selected-source reselection. H2 observation normalization debt: the selected source cause is selected_transport_closed but selectedSnapshotObservation reasonCodes still collapse to selected_timeout, hiding the needed transport-closed path. H3 retry cadence debt: the active-gate budget reaches terminal selected-source closure before the bounded retryAfterMs=100 defer can observe progress. H4 owner-boundary migration: a transport/admin query owner owns the next edge despite the active-gate route.",
    "hypothesisDiscriminator": "H1 is selected if canonical evidence shows selected_transport_closed with lane snapshot connection close and no conflicting timeout budget as the concrete failure. H2 is selected if reasonCodes or report grammar misclassify the selected transport closure as selected_timeout while retryAfterMs=100 is available. H3 is selected if causal budgets explain closure independently of transport state. H4 is selected only if owner-files or canonical route names a different owner boundary.",
    "expectedMetric": "The experiment names one runtime owner contract, owner-boundary migration, or architecture-gap stop for selected_transport_closed with proof commands, while runtime files stay frozen.",
    "inheritsFrom": "work/packages/done-20260523-rolling-restart-wait-owner-recovery-reconcile-drain-runtime.md",
    "timebox": "24h",
    "mergeRequirement": "canonical evidence summary, topology handoff probe, causal model, and focused architecture conclusion before runtime edits",
    "killRule": "Do not open another startup_active_gate_owner / snapshot_coverage runtime patch until this experiment names the selected_transport_closed owner contract or closes as architecture-gap."
  },
  "validationTier": "cross-owner",
  "representativeResidual": {
    "status": "successor-selected",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Activate the selected_transport_closed_observation_contract runtime successor."
  },
  "causalGovernance": {
    "hypothesis": "After owner queue bounded-defer evidence became explicit, the remaining rolling-restart blocker is not another blind wait_owner_recovery queue patch. The next edge is one of transport lifecycle retry/reselection, selected observation reason normalization, active-gate retry cadence, or owner-boundary migration.",
    "stopConditionCheck": "Run npm run work:evidence-summary, npm run analyze:topology-convergence -- --handoff-probe, and npm --silent run analyze:causal-model on the fresh representative before runtime edits. Use owner-file analysis or focused source reads only after canonical evidence leaves ambiguity.",
    "expectedCausalModelChange": "The experiment changes no runtime behavior; it selected the selected_transport_closed_observation_contract successor because final transport-closed evidence is mis-normalized as selected_timeout after a bounded retry while non-promoting wait_owner_recovery handoff evidence remains required.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh evidence has snapshotCoverageNodeCount=1/5, activeNodeCount=4/5, selectedSnapshotSourceCause=selected_transport_closed, final selectedSnapshotError=Admin API query connection closed before response on lane snapshot, selectedSnapshotObservation reasonCodes still reported as selected_timeout, selectedControlPlaneOwnerQueuePendingWrites=1, membershipPublicationHandoffOutcome=write_deferred/enqueued=false/retryAfterMs=100, pendingWriteGrowthCount=0, and runtimePromotionAllowed=false.",
    "crossBoundaryReview": "Keep owner queue bounded-defer behavior, publication convergence, priority recovery, readiness support semantics, runtime promotion safety, and product/scenario timeout ceilings frozen; this package only classifies the selected_transport_closed owner contract."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate_snapshot_coverage after wait_owner_recovery owner queue bounded-defer reduction",
    "phaseChain": [
      "selected-source retry floor proof passed",
      "reconcile_owner_membership_publication reduced pendingReconcileCount to 0",
      "wait_owner_recovery progress raised snapshotCoverageNodeCount from 0/5 to 1/5",
      "owner queue bounded-defer evidence now reports write_deferred/enqueued=false/retryAfterMs=100 and pendingWriteGrowthCount=0",
      "fresh representative still fails at active_gate_snapshot_coverage with selectedSnapshotSourceCause=selected_transport_closed"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness support remains inherited from active-gate no progress",
      "runtime promotion remains unsafe while snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "The selected transport-closed snapshot source path must identify whether lane/session retry, selected-source reselection, observation reason normalization, active-gate retry cadence, or owner-boundary migration owns the next executable contract.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json --handoff-probe",
    "falsifyingProbe": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json",
    "boundedProgressProof": "The experiment must select one bounded progress mechanism before runtime edits resume: transport retry/reselection, observation normalization with bounded retry, active-gate timer/cadence advance, owner-boundary migration, or architecture-gap stop.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json",
    "expectedObservableTransition": "Canonical proof selected startup_active_gate_owner / selected_transport_closed_observation_contract: terminal transport-closed retry evidence must emit selected_transport_closed while preserving the non-promoting wait_owner_recovery handoff and bounded owner queue defer.",
    "maxProgressBound": "architecture experiment only; no runtime edits in this package",
    "sameFrontierFallback": "If no single owner path can be named, close as architecture-gap instead of opening another same-frontier runtime patch.",
    "expectedNextFrontier": "startup_active_gate_owner / selected_transport_closed_observation_contract runtime successor",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-wait-owner-recovery-selected-source-timeout-contract / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260523-rolling-restart-wait-owner-recovery-queue-drain-runtime / causal-escalation / selected continue-local-proof",
      "active-20260523-rolling-restart-wait-owner-recovery-reconcile-drain-runtime / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "The workflow rejected a third same owner/boundary runtime package; this active package is the required autonomous architecture experiment.",
    "handoffInvariant": "selected_transport_closed evidence may not imply startup readiness or runtime promotion until snapshot coverage completes."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "The previous runtime package reduced owner queue handoff evidence but stayed at startup_active_gate_owner / snapshot_coverage.",
      "work:advance rejected a third same owner/boundary runtime package.",
      "Fresh evidence exposes selected_transport_closed while bounded owner queue defer is already visible."
    ],
    "selectedChoice": "continue-local-proof",
    "choices": [
      {
        "id": "open-architecture-package",
        "summary": "Run this selected_transport_closed architecture experiment before runtime implementation resumes.",
        "route": "architecture-package",
        "proof": [
          "npm run work:evidence-summary -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json --handoff-probe",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json"
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
    "nextAction": "Open the selected_transport_closed_observation_contract runtime successor."
  },
  "observablePrediction": {
    "metric": "The experiment names one runtime owner contract, owner-boundary migration, or architecture-gap stop for selected_transport_closed with proof commands, while runtime files stay frozen.",
    "predicted": "The experiment names one runtime owner contract, owner-boundary migration, or architecture-gap stop for selected_transport_closed with proof commands, while runtime files stay frozen.",
    "observed": "Canonical proof selected H2: final selectedSnapshotError is transport closed and topology reports selectedSnapshotSourceCause=selected_transport_closed, but report progress emits selectedSnapshotObservationReasonCodes=[selected_timeout]. H1 was not selected because no clean alternate snapshot witness is named by canonical evidence; H3 was not selected because budget exhaustion is a consequence of the repeated mis-normalized selected-source retry; H4 was not selected because route and owner-files stay under startup_active_gate_owner.",
    "accuracy": "partial",
    "evidence": "npm run work:evidence-summary -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json --handoff-probe; npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json; npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage"
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H2",
    "decision": "open-runtime-owner-boundary",
    "nextOwner": "startup_active_gate_owner",
    "nextBoundary": "selected_transport_closed_observation_contract",
    "evidence": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json --handoff-probe reports selectedSnapshotSourceCause=selected_transport_closed and selectedSnapshotError=Admin API query connection closed before response on lane snapshot, while selectedSnapshotObservationReasonCodes remains selected_timeout and the non-promoting wait_owner_recovery handoff remains pending with bounded owner queue defer."
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
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Focused proof should normalize terminal selected transport-closed retry evidence to selected_transport_closed while preserving non-promoting wait_owner_recovery handoff and bounded owner queue defer; fresh representative should increase snapshotCoverageNodeCount beyond 1/5, migrate owner/boundary, or pass rolling-restart.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-23",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260523-rolling-restart-selected-transport-closed-observation-contract.md"
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

- Hypothesis: H1 transport lifecycle debt: the selected admin query connection closes before response after the owner queue bounded defer, and the next runtime edge is lane/session retry or selected-source reselection. H2 observation normalization debt: the selected source cause is selected_transport_closed but selectedSnapshotObservation reasonCodes still collapse to selected_timeout, hiding the needed transport-closed path. H3 retry cadence debt: the active-gate budget reaches terminal selected-source closure before the bounded retryAfterMs=100 defer can observe progress. H4 owner-boundary migration: a transport/admin query owner owns the next edge despite the active-gate route.
- Hypothesis discriminator: H1 is selected if canonical evidence shows selected_transport_closed with lane snapshot connection close and no conflicting timeout budget as the concrete failure. H2 is selected if reasonCodes or report grammar misclassify the selected transport closure as selected_timeout while retryAfterMs=100 is available. H3 is selected if causal budgets explain closure independently of transport state. H4 is selected only if owner-files or canonical route names a different owner boundary.
- Expected metric: The experiment names one runtime owner contract, owner-boundary migration, or architecture-gap stop for selected_transport_closed with proof commands, while runtime files stay frozen.
- Inherits from: `work/packages/done-20260523-rolling-restart-wait-owner-recovery-reconcile-drain-runtime.md`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: canonical evidence summary, topology handoff probe, causal model, and focused architecture conclusion before runtime edits
- Kill rule: Do not open another startup_active_gate_owner / snapshot_coverage runtime patch until this experiment names the selected_transport_closed owner contract or closes as architecture-gap.
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.

## Observable Prediction

- Metric: The experiment names one runtime owner contract, owner-boundary migration, or architecture-gap stop for selected_transport_closed with proof commands, while runtime files stay frozen.
- Predicted: The experiment names one runtime owner contract, owner-boundary migration, or architecture-gap stop for selected_transport_closed with proof commands, while runtime files stay frozen.
- Observed: pending-before-observation
- Accuracy: pending-before-observation
- Evidence: pending-before-observation
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `experiment`
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

1. work/packages/done-20260523-rolling-restart-selected-transport-closed-architecture-experiment.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `experiment`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/packages/done-20260523-rolling-restart-selected-transport-closed-architecture-experiment.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json`
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

- [x] implementation: status: validated; evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json` PASS; `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json --handoff-probe` PASS and reports selectedSnapshotSourceCause=selected_transport_closed, selectedSnapshotError=connection closed before response, selectedSnapshotObservationReasonCodes=selected_timeout, ownerQueue pendingWrites=1, handoffOutcome=write_deferred/enqueued=false/retryAfterMs=100; `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json` PASS; `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage` PASS; focused raw fallback after canonical tools confirmed report progress carries the final transport-closed error but still records selected_timeout as the observation reason; parent revalidated focused proof: yes; next: closure or successor action.
- [x] verification-fix: status: validated; evidence: `npm run work:context` PASS; `npm run work:evidence-summary -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json` PASS (dominant reasons include selected_transport_closed); `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json --handoff-probe` PASS (selectedSnapshotSourceCause=selected_transport_closed while selectedSnapshotObservationReasonCodes=selected_timeout and bounded owner queue defer remains visible); `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json` PASS (classified_local_blocker/continue_local_fix under startup_active_gate_owner); `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage` PASS; `npm run work:package:doctor -- --suggest work/packages/done-20260523-rolling-restart-selected-transport-closed-architecture-experiment.md` PASS; changed files: `work/packages/done-20260523-rolling-restart-selected-transport-closed-architecture-experiment.md`; parent revalidated focused proof: yes; next: close this experiment and open the selected runtime successor boundary.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card from the selected runtime successor metadata; next: validation.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json --handoff-probe
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json

## Commit And Push Ledger

1. Focused package commit: 899123964649ae70d8b85498157a00068c574f8b
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
