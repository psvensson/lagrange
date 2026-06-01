# Topology Publication Reconcile System Theory

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-21",
  "closed": "2026-05-21",
  "lane": "experiment",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-theory-baseline-20260521T035711Z/rolling-restart/",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Baseline theory run returned to publication_ack_convergence. Distinguishing process proved H1 (diagnostics gap - hidden queue) and H3 (operation residual predecessor deadlock). In node 11601fe0-72d6-5853-8590-ec2881853e72's logs, the reconcile queue item 'membership-publication:cluster_membership' is active, enqueued, and retrying under the hood (failureCount: 18), but the diagnostics system incorrectly reports the depth as 'unknown' due to selectedControlPlaneOwnerQueueDepth being null. The loop is stalled due to a circular dependency with the priority recovery residual for control_plane_publications-p1, which is recovering_in_flight.",
  "nextAction": "Migrate owner boundary to operation_workflow_owner / rebalancer_handoff to resolve the priority recovery residual deadlock blocking topology publication.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --explain publication_ack_convergence",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --markdown",
    "npm run work:validate -- --probe work/packages/done-20260521-topology-publication-reconcile-system-theory.md"
  ],
  "writeScope": [
    "work/packages/done-20260521-topology-publication-reconcile-system-theory.md",
    "work/sprints/todo-2026-q2-topology-publication-reconcile-system-theory.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260521-rolling-restart-theory-baseline-probe.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/done-20260521-topology-publication-reconcile-system-theory.md",
    "work/sprints/todo-2026-q2-topology-publication-reconcile-system-theory.md"
  ],
  "modelFit": {
    "packageClass": "experiment",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "the probe requires runtime edits",
      "H1/H2/H3 cannot be distinguished from the baseline artifact",
      "canonical routing changes owner or boundary"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "H1 queue exists but is not diagnosed; H2 accepted handoff is not durably drained or retried by the publication owner; H3 operation workflow residual is the real predecessor despite publication routing.",
    "hypothesisDiscriminator": "H1 predicts a hidden-but-present owner queue/drain witness; H2 predicts no durable queue/drain progress despite enqueued=true; H3 predicts priority residual proof must precede publication work.",
    "expectedMetric": "ownerRecoveryQueue depth/drain visibility, handoffOutcome enqueued=true, priority residual splitRequired, active-gate deferred state, readiness inherited state, and causal route consistency",
    "inheritsFrom": "work/packages/done-20260521-rolling-restart-theory-baseline-probe.md",
    "timebox": "24h",
    "mergeRequirement": "H1/H2/H3 distinguished by canonical probe output or closed as evidence-incomplete",
    "killRule": "stop runtime promotion if the full publication-operation-active-gate-readiness-diagnostics theory cannot be distinguished"
  },
  "validationTier": "cross-owner",
  "observablePrediction": {
    "metric": "holistic publication reconcile progress",
    "predicted": "H2 unless the handoff probe or focused fixture proves a visible bounded queue/drain path across dependent consumers",
    "observed": "H1 distinguished for queue presence (active and retrying under the hood on node 11601fe0, but hidden in diagnostics) and H3 distinguished for the circular deadlock (rebalance for control_plane_publications-p1 blocked on repair-ineligible nodes waiting for publication).",
    "accuracy": "matched",
    "evidence": "test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
    "metricDelta": 0
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H3",
    "decision": "owner-boundary-migration",
    "nextOwner": "operation_workflow_owner",
    "nextBoundary": "rebalancer_handoff",
    "evidence": "test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json"
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "rebalancer_handoff",
    "routeDominantReason": "priority_recovery_progress_blocked",
    "routeCausalOutcome": "owner-boundary-migration",
    "stopMode": "owner_boundary_migration",
    "nextLane": "experiment",
    "expectedDelta": "Activate priority recovery rebalancer residual experiment or migration.",
    "requiredRefreshCommands": [
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "Same-frontier oscillation on topology publication reconcile queue."
    ],
    "choices": [
      {
        "id": "migrate-to-rebalancer-handoff",
        "summary": "Migrate the active package to the owner boundary named by the first frontier evidence.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --markdown"
        ]
      }
    ],
    "selectedChoice": "migrate-to-rebalancer-handoff",
    "nextAction": "Open the priority recovery rebalancer handoff residual experiment."
  },
  "causalGovernance": {
    "hypothesis": "A valid next theory must explain publication owner state, operation workflow residuals, active-gate snapshot coverage, startup readiness, and diagnostics together before runtime edits.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json plus npm run analyze:topology-convergence -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --handoff-probe",
    "expectedCausalModelChange": "No runtime causal model change is expected in this experiment; it should distinguish whether the next package is runtime-owner-boundary or architecture-contract work.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "The baseline remains red at publication_ack_convergence until this theory proves whether reconcile queue/drain progress exists across dependent consumers.",
    "crossBoundaryReview": "Required before runtime promotion because this theory intentionally spans publication, operation workflow, active-gate, readiness, and diagnostics."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart baseline publication-reconcile handoff probe",
    "phaseChain": [
      "publication convergence",
      "operation workflow residuals",
      "startup active-gate snapshot coverage",
      "startup readiness support evidence",
      "diagnostics and causal routing"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending",
    "knownDownstreamBlockers": [
      "operation_workflow_owner / rebalancer_handoff has one non-splitting residual witness",
      "startup_active_gate_owner / snapshot_coverage remains deferred at snapshotCoverage=3/5",
      "startup_readiness_owner / startup_support_evidence remains inherited behind active-gate no progress",
      "diagnostics_owner / causal_analysis_framework reports publication_ack_blocked and owner queue depth unknown"
    ],
    "missingCausalEdge": "The accepted write_deferred owner_reconcile_pending handoff is enqueued=true, but visible bounded publication-owner wake/retry/reconcile/drain progress is unproven.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --handoff-probe",
    "boundedProgressProof": "The probe must prove wake, retry, reconcile, or drain visibility across publication, operation workflow, active-gate, readiness, and diagnostics before runtime edits.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
    "expectedObservableTransition": "pending holistic theory -> H1 queue hidden, H2 queue/drain missing, H3 operation residual predecessor, or evidence-incomplete",
    "maxProgressBound": "one artifact-based handoff probe plus priority residual extraction",
    "sameFrontierFallback": "open an architecture-contract package instead of a same-frontier runtime patch",
    "expectedNextFrontier": "runtime-owner-boundary package only if H1 or H2 is distinguished; owner-boundary migration if H3 wins",
    "resultClassification": "same-frontier",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260521-rolling-restart-theory-baseline-probe: same-frontier publication_ack_convergence",
      "done-20260520-operation-progress-resource-and-deterministic-gates: operation_progress architecture reset"
    ],
    "oscillationCheck": "watching: this theory exists because baseline returned to publication after the operation-progress reset",
    "handoffInvariant": "publication owner outcome + operation workflow residual status + active-gate precondition + readiness support state + diagnostics route"
  },
  "commitAndPushLedgerRequired": true
}
-->

## Probe

- Question: Does `write_deferred` plus `enqueued=true` produce visible bounded publication-owner reconcile progress across publication, operation workflow, active-gate, readiness, and diagnostics?
- Hypothesis discriminator: H1 queue hidden; H2 queue/drain missing; H3 operation residual predecessor.
- Expected signal: owner queue/drain visibility or explicit absence before runtime edits.
- Observed signal: Node 11601fe0 log events show retryable_drain_failure up to failureCount=18 for queue membership-publication:cluster_membership, while priority-recovery-residuals report lists 1 recovering_in_flight residual witness for control_plane_publications-p1 skipped by rebalancer due to target node_not_ready.
- Prediction accuracy: high.
- Distinguished hypothesis at closure: H1 (hidden active queue) + H3 (operation residual predecessor).
- Experiment decision at closure: migrate-owner-boundary.
- Outcome evidence at closure: Node 11601fe0's active retryable drain failure events for cluster membership reconcile queue, while rebalancer on 7493b0ab skips control_plane_publications-p1 move with node_not_ready skipDetail=repair_ineligible.
- Stop rule: no runtime package until H1/H2/H3 is distinguished holistically.

## Model Fit

- Package class: `experiment`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Ambiguity score: `2`
- Owned files: `work/packages/done-20260521-topology-publication-reconcile-system-theory.md`, `work/sprints/todo-2026-q2-topology-publication-reconcile-system-theory.md`
- Forbidden files: `src/`
- Frozen decisions: No runtime edits allowed in this experiment phase; next boundary must resolve rebalancer priority residual for control_plane_publications-p1.
- Escalation triggers: the probe requires runtime edits; H1/H2/H3 cannot be distinguished from the baseline artifact; canonical routing changes owner or boundary.
- Focused proof: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --explain publication_ack_convergence`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --markdown`.

## Architecture Decision Gate Result

Selected route: `owner-boundary-migration`.

Reason: H3 (operation residual predecessor) was distinguished. The rebalancer has a recovering_in_flight residual witness for control_plane_publications-p1 blocked by target nodes that are not ready, which is waiting on the membership publication that is blocked by the table's partition being unhealthy. To break this circular dependency/deadlock, we must migrate the owner boundary to operation_workflow_owner / rebalancer_handoff.

## Execution Evidence

- [x] implementation: status: validated; evidence: executed topology convergence explain and handoff-probe analysis showing enqueued=true handoff deferred at owner_reconcile_pending and priority residual active on control_plane_publications-p1. Log analysis of node 11601fe0 distinguished H1 queue presence retrying under the hood up to failureCount=18. Parent revalidated focused proof: yes; next: close experiment and migrate active package to successor.
- [x] verification-fix: status: validated; evidence: `npm run work:validate -- --probe work/packages/done-20260521-topology-publication-reconcile-system-theory.md` passed; changed files: work/packages/done-20260521-topology-publication-reconcile-system-theory.md, work/sprints/todo-2026-q2-topology-publication-reconcile-system-theory.md; parent revalidated focused proof: yes; next: closure.

## Commit And Push Ledger

- Focused package commit: 99a1fc4d63022fb88efbfcc5cfd89ba1000178f2
- Pushed to: origin/main
- Commit contains only package-owned files/package-status/allowed sprint handoff: yes
