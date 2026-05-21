# Rolling Restart Theory Baseline Probe

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-21",
  "lane": "experiment",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-theory-baseline-20260521T035711Z/rolling-restart/",
  "owner": "diagnostics_owner",
  "boundary": "rolling_restart_theory_baseline",
  "dominantReason": "theory_baseline_needed",
  "currentState": "The fresh post-reset rolling-restart baseline is red and routes to publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending.",
  "nextAction": "Seed the next holistic publication-reconcile theory across publication, operation workflow, active-gate, readiness, and diagnostics before any runtime package.",
  "proof": [
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
    "npm run work:scenario-route -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --explain publication_ack_convergence",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --markdown",
    "npm run work:validate -- --probe work/packages/done-20260521-rolling-restart-theory-baseline-probe.md"
  ],
  "writeScope": [
    "work/packages/done-20260521-rolling-restart-theory-baseline-probe.md",
    "work/sprints/active-2026-q2-topology-convergence-theory-ladder.md",
    "work/tracks/topology-convergence.md",
    "work/sprints/todo-2026-q2-topology-publication-reconcile-system-theory.md",
    "work/packages/active-20260521-topology-publication-reconcile-system-theory.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260520-operation-progress-resource-and-deterministic-gates.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/done-20260521-rolling-restart-theory-baseline-probe.md",
    "work/sprints/active-2026-q2-topology-convergence-theory-ladder.md",
    "work/tracks/topology-convergence.md",
    "work/sprints/todo-2026-q2-topology-publication-reconcile-system-theory.md",
    "work/packages/active-20260521-topology-publication-reconcile-system-theory.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "modelFit": {
    "packageClass": "experiment",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "baseline artifact cannot be produced",
      "canonical routing contradicts the theory ladder metadata",
      "runtime edits become necessary before observation"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "H1 rolling-restart is green after the operation-progress reset; H2 the first frontier migrates to a narrower owner boundary; H3 publication, operation-progress, and active-gate still oscillate without a changed hypothesis.",
    "hypothesisDiscriminator": "H1 predicts representative green; H2 predicts canonical routing selects a new first owner/boundary; H3 predicts same-frontier or oscillating topology-convergence evidence with no metric reduction.",
    "expectedMetric": "representative status and canonical first frontier from work:evidence-summary plus work:scenario-route",
    "inheritsFrom": "work/sprints/active-2026-q2-topology-convergence-theory-ladder.md",
    "timebox": "24h",
    "mergeRequirement": "baseline report exists and canonical routing distinguishes H1/H2/H3 or records evidence-incomplete",
    "killRule": "stop runtime edits if no fresh artifact and canonical route exist"
  },
  "validationTier": "release-gate",
  "observablePrediction": {
    "metric": "rolling-restart representative route",
    "predicted": "H2: fresh evidence selects a concrete first owner/boundary or H1 representative green; H3 is accepted only if same-frontier oscillation is explicit",
    "observed": "H3 matched: red baseline routes to publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending; handoff outcome is write_deferred owner_reconcile_pending enqueued=true with owner queue depth unknown, active-gate deferred at snapshotCoverage=3/5, and one non-splitting operation workflow residual.",
    "accuracy": "partial",
    "evidence": "npm run work:evidence-summary -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json plus npm run work:scenario-route -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json plus npm run analyze:topology-convergence -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --handoff-probe",
    "metricDelta": 0
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H3",
    "decision": "open-architecture-contract",
    "nextOwner": "topology_publication_owner",
    "nextBoundary": "publication_convergence",
    "evidence": "test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json routed by work:evidence-summary, work:scenario-route, handoff probe, priority residual extractor, and causal model"
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "architecture_gap",
    "nextLane": "experiment",
    "expectedDelta": "Activate a holistic publication-reconcile system theory that covers publication owner, operation workflow, active-gate, readiness, and diagnostics before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --handoff-probe",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair # current-blocker refresh",
      "npm run work:validate -- --pre-impl # pre-implementation validation"
    ]
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "diagnostics_owner",
    "fromBoundary": "rolling_restart_theory_baseline",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "This baseline probe owned diagnostic observation only; canonical route selected topology_publication_owner / publication_convergence for the next holistic theory.",
    "evidence": "npm run work:scenario-route -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "Fresh baseline returned to publication_ack_convergence after the operation-progress architecture reset.",
      "Handoff probe reports write_deferred owner_reconcile_pending enqueued=true while owner queue depth is unknown.",
      "Active-gate, readiness, operation workflow residuals, and diagnostics all remain relevant to the next theory."
    ],
    "choices": [
      {
        "id": "holistic-publication-reconcile-theory",
        "summary": "Open a holistic experiment before runtime promotion.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --handoff-probe",
          "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --markdown"
        ]
      },
      {
        "id": "direct-publication-runtime",
        "summary": "Open a direct publication runtime package.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence"
        ]
      }
    ],
    "selectedChoice": "holistic-publication-reconcile-theory",
    "nextAction": "Activate work/packages/active-20260521-topology-publication-reconcile-system-theory.md before runtime implementation."
  },
  "causalGovernance": {
    "hypothesis": "If the theory-ladder restart is useful, one fresh rolling-restart run should distinguish green, migrated frontier, same-frontier oscillation, architecture-gap, or evidence-incomplete before runtime edits.",
    "stopConditionCheck": "npm run work:scenario-route -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json plus npm run analyze:causal-model -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
    "expectedCausalModelChange": "No runtime causal model change is expected; the package should create a current representative route for the next theory decision.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "The representative gate remains red at publication_ack_convergence. The next theory must account for publication owner state, operation workflow residuals, active-gate snapshot coverage, startup readiness, and diagnostics before runtime promotion.",
    "crossBoundaryReview": "Required before runtime promotion because the baseline returned to the publication/operation/active-gate oscillation class."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart baseline probe",
    "phaseChain": [
      "publication convergence",
      "operation workflow residuals",
      "startup active-gate snapshot coverage",
      "startup readiness support evidence",
      "diagnostics and causal routing"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner / snapshot_coverage remains deferred with owner_reconcile_pending and snapshotCoverage=3/5",
      "startup_readiness_owner / startup_support_evidence remains inherited behind active-gate no progress",
      "operation_workflow_owner / rebalancer_handoff has one non-splitting residual witness",
      "diagnostics_owner / causal_analysis_framework classifies publication_ack_blocked and local_runtime_owner_fix"
    ],
    "missingCausalEdge": "write_deferred owner_reconcile_pending is enqueued=true, but the owner recovery queue depth and publication-owner drain/retry progress remain unknown across publication, operation workflow, active-gate, readiness, and diagnostics.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --handoff-probe",
    "boundedProgressProof": "handoff probe shows reconcile is the required progress mechanism; the successor theory must prove wake, retry, reconcile, or drain visibility across the full publication-to-active-gate path before runtime edits.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
    "expectedObservableTransition": "no-current-artifact -> same-frontier publication_ack_convergence with holistic publication-reconcile system theory queued",
    "maxProgressBound": "one rolling-restart baseline run",
    "sameFrontierFallback": "activate the holistic publication-reconcile system theory instead of a same-frontier runtime patch",
    "expectedNextFrontier": "topology_publication_owner / publication_convergence reconcile queue visibility across dependent consumers",
    "resultClassification": "same-frontier",
    "stopCondition": "architecture-gap-stop",
    "recentFrontierHistory": [
      "operation_workflow_owner / operation_progress / architecture-gap closed",
      "topology_publication_owner and startup_active_gate_owner oscillation before reset"
    ],
    "oscillationCheck": "triggered: fresh baseline returned to publication_ack_convergence after operation-progress reset",
    "handoffInvariant": "producer outcome + consumer precondition + freshness/revision/ack edge"
  },
  "closed": "2026-05-21",
  "commitAndPushLedgerRequired": true
}
-->

## Probe

- Question: What does one fresh post-reset `rolling-restart` run prove before any runtime edit?
- Hypothesis discriminator: H1 green vs H2 migrated owner boundary vs H3 same oscillation.
- Expected signal: representative green or a canonical first frontier from `work:evidence-summary` and `work:scenario-route`.
- Observed signal: red baseline; first frontier `publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending`.
- Prediction accuracy: matched H3.
- Distinguished hypothesis at closure: H3.
- Experiment decision at closure: open-architecture-contract.
- Outcome evidence at closure: `test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json`.
- Stop rule: no runtime package until the baseline artifact is produced and routed.

## Model Fit

- Package class: `experiment`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Ambiguity score: `2`
- Owned files: `work/packages/done-20260521-rolling-restart-theory-baseline-probe.md`, `work/sprints/active-2026-q2-topology-convergence-theory-ladder.md`, `work/tracks/topology-convergence.md`, `work/sprints/todo-2026-q2-topology-publication-reconcile-system-theory.md`, `work/packages/active-20260521-topology-publication-reconcile-system-theory.md`
- Forbidden files: `src/`
- Frozen decisions: baseline package stays diagnostic/experiment-only; runtime promotion waits for the holistic publication-reconcile system theory.
- Escalation triggers: baseline artifact cannot be produced; canonical routing contradicts metadata; runtime edits become necessary before observation.
- Focused proof: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --fast-local --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json`, `npm run work:scenario-route -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json`.

## Architecture Decision Gate Result

Selected route: `holistic-publication-reconcile-theory`.

Reason: the baseline returned to the publication/operation/active-gate
oscillation class. A direct runtime patch would be under-scoped unless the next
theory first accounts for publication owner state, operation workflow residuals,
active-gate snapshot coverage, readiness, and diagnostics.

## Execution Evidence

- [x] implementation: status: validated; evidence: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --fast-local --verbose` wrote the baseline report and failed red as expected; `npm run work:evidence-summary -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json`, `npm run work:scenario-route -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --handoff-probe`, and `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --markdown` selected the holistic successor theory; parent revalidated focused proof: yes; next: close baseline and activate holistic successor.
- [x] verification-fix: status: validated; evidence: `npm run work:validate -- --probe work/packages/done-20260521-rolling-restart-theory-baseline-probe.md` and `npm run work:validate -- --probe work/packages/active-20260521-topology-publication-reconcile-system-theory.md` passed after recording the successor; changed files: work/packages/done-20260521-rolling-restart-theory-baseline-probe.md, work/sprints/active-2026-q2-topology-convergence-theory-ladder.md, work/tracks/topology-convergence.md, work/sprints/todo-2026-q2-topology-publication-reconcile-system-theory.md, work/packages/active-20260521-topology-publication-reconcile-system-theory.md; parent revalidated focused proof: yes; next: closure.
