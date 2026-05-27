# Reconnect Handoff Architecture Experiment

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-26",
    "lane": "experiment",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "playback": "none",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_event_driven_wait",
    "currentState": "Architecture experiment selected startup_readiness_owner / startup_support_evidence from admin_reachability_refused and startup_recovery_blocked source evidence.",
    "nextAction": "Open or activate the startup_readiness_owner / startup_support_evidence successor before rebalancer or message-router runtime edits resume.",
    "predecessor": "work/packages/done-20260526-rolling-restart-operation-workflow-owner-rebalancer-handoff.md",
    "closed": "2026-05-27",
    "successor": "work/packages/active-20260527-rolling-restart-startup-readiness-admin-reachability-support.md"
  },
  "scope": {
    "writeScope": [],
    "handoffFiles": [
      "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "test/distributed/harness/cluster-segment-7-class-4.js",
      "src/bootstrap/node-joining-ready-signal-readiness.js",
      "src/bootstrap/traffic-readiness-utils.js"
    ],
    "commitScope": [
      "work/packages/active-20260526-reconnect-handoff-architecture-experiment.md",
      "work/packages/done-20260526-rolling-restart-operation-workflow-owner-rebalancer-handoff.md",
      "work/packages/active-20260527-rolling-restart-startup-readiness-admin-reachability-support.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package stops same-frontier runtime patching and selects the architecture decision route required by closure validation."
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
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": []
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    },
    "theoryLedgerRefs": [],
    "theoryLedger": "no-ledger-update",
    "proof": {
      "commands": [
        "falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
        "regression: npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
        "supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --markdown"
      ]
    }
  },
  "boundedExperiment": {
    "hypothesis": "H1: message-router reconnect failure prevents operation_workflow_owner rebalancer_handoff from observing bounded progress. H2: startup readiness/admin reachability owns the supporting evidence gap under the rebalancer handoff witness. H3: the same-frontier shape is stale instrumentation.",
    "hypothesisDiscriminator": "Canonical route, topology convergence, distributed failure, and causal evidence must distinguish reconnect delivery failure from startup readiness/admin reachability and stale instrumentation without editing runtime files first.",
    "expectedMetric": "Architecture decision selected with a concrete next owner, proof command, and no additional same-frontier local patch.",
    "inheritsFrom": "work/packages/done-20260526-rolling-restart-operation-workflow-owner-rebalancer-handoff.md",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence"
  },
  "validationTier": "single-owner",
  "observablePrediction": {
    "metric": "Architecture decision selected with a concrete next owner, proof command, and no additional same-frontier local patch.",
    "predicted": "Architecture decision selected with a concrete next owner, proof command, and no additional same-frontier local patch.",
    "observed": "Architecture decision selected with a concrete next owner, proof command, and no additional same-frontier local patch.",
    "accuracy": "matched",
    "evidence": "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json"
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H2",
    "decision": "owner-boundary-migration",
    "nextOwner": "startup_readiness_owner",
    "nextBoundary": "startup_support_evidence",
    "evidence": "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json"
  },
  "inheritsContext": {
    "owner": true,
    "boundary": true,
    "forbiddenScope": true,
    "proofCommands": true,
    "stopRule": true
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "The predecessor representative rerun stayed at operation_workflow_owner / rebalancer_handoff with priority_recovery_event_driven_wait after local runtime fixes.",
      "Closure validation required architectureDecisionGate route=architecture-package before another same-frontier implementation package.",
      "The architecture experiment proof selected startup_readiness_owner / startup_support_evidence from admin_reachability_refused and startup_recovery_blocked source evidence."
    ],
    "choices": [
      {
        "id": "migrate-owner-boundary",
        "summary": "Migrate the next package to startup readiness support because admin reachability is the supporting evidence gap under the rebalancer handoff witness.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json"
        ]
      },
      {
        "id": "open-architecture-package",
        "summary": "Use this autonomous architecture experiment to decide the reconnect-to-handoff owner contract before runtime work resumes.",
        "route": "architecture-package",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress"
        ]
      }
    ],
    "selectedChoice": "migrate-owner-boundary",
    "nextAction": "Execute the selected owner-boundary migration to startup_readiness_owner / startup_support_evidence before runtime implementation resumes."
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
      "npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --markdown"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-architecture-experiment",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "rebalancer_handoff",
    "routeDominantReason": "priority_recovery_event_driven_wait",
    "routeCausalOutcome": "same-frontier",
    "stopMode": "architecture-gap",
    "nextLane": "experiment",
    "expectedDelta": "Select an architecture route before runtime implementation resumes; no more same-frontier local patches without concrete reduction.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "same-frontier",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "frontier": "rebalancer_handoff",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Open or activate startup_readiness_owner / startup_support_evidence for admin reachability support."
  },
  "causalGovernance": {
    "hypothesis": "WebSocket transport reconnection hang under load prevents node bootstrap join convergence.",
    "stopConditionCheck": "Use npm run analyze:causal-model on the latest representative artifact.",
    "expectedCausalModelChange": "Select the startup readiness support owner boundary before runtime implementation resumes.",
    "representativeOutcome": "migrated",
    "causalDebt": "The priority recovery witness is still first frontier, but its source evidence names admin_reachability_refused and startup_recovery_blocked; startup readiness support must own the admin availability evidence before another rebalancer or message-router patch.",
    "crossBoundaryReview": "Transport and rebalancer runtime remain frozen because canonical evidence did not distinguish message routing as the next owner."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart",
    "phaseChain": [
      "rolling-restart representative gate rerun completed",
      "route evidence stayed at operation_workflow_owner / rebalancer_handoff",
      "topology convergence source classified the handoff witness as admin_reachability_refused and startup_recovery_blocked",
      "architecture experiment selected startup_readiness_owner / startup_support_evidence before another same-frontier runtime patch"
    ],
    "currentFirstFrontier": "operation_workflow_owner/rebalancer_handoff with startup_readiness_owner/startup_support_evidence selected as owner-boundary migration",
    "knownDownstreamBlockers": [
      "priority-recovery-reconnection"
    ],
    "missingCausalEdge": "Startup readiness/admin reachability support must explain admin_reachability_refused before rebalancer handoff or message-router runtime work resumes.",
    "missingCausalEdgeProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
    "boundedProgressProof": "Decide the startup readiness support contract before dispatch or delivery runtime edits resume.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "expectedObservableTransition": "Architecture decision selected with a concrete next owner, proof command, and no additional same-frontier local patch.",
    "maxProgressBound": "one architecture experiment",
    "sameFrontierFallback": "Open an autonomous architecture experiment rather than another local patch.",
    "expectedNextFrontier": "startup_readiness_owner / startup_support_evidence",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260526-rolling-restart-operation-workflow-owner-rebalancer-handoff.md"
    ],
    "oscillationCheck": "Same-frontier evidence after local runtime fixes selected startup readiness support as the next owner contract.",
    "handoffInvariant": "Rebalancer and message-router runtime implementation remains frozen until startup readiness/admin reachability support is proven or falsified."
  },
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": []
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "theoryLedger": "no-ledger-update",
  "commitAndPushLedgerRequired": true
}
-->

## Why

Stop same-frontier runtime patching and decide the reconnect-to-handoff owner contract before message-router or rebalancer runtime work resumes.

## Workflow Lane

- Selected lane: `experiment`
- Why this lane is sufficient: success is a selected architecture route, not a runtime metric movement.
- Escalation trigger to a heavier lane: runtime ownership or shared contract changes.

## Bounded Experiment

- Hypothesis: startup readiness/admin reachability owns the supporting evidence gap under the rebalancer handoff witness.
- Discriminator: topology convergence and distributed failure must distinguish startup readiness/admin reachability from message-router reconnect delivery failure before runtime edits.
- Proof: run the three commands in the validation ladder.

## Execution Evidence

- [x] action: implementation; owner: operation_workflow_owner; files-changed: none; validation: `npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress` pass, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json` pass, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --markdown` pass, supporting `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json` selected admin_reachability_refused/startup_recovery_blocked source evidence; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: operation_workflow_owner; files-changed: none; validation: `npm run work:validate -- --entry work/packages/active-20260526-reconnect-handoff-architecture-experiment.md` pass, `npm run work:validate -- --pre-impl work/packages/active-20260526-reconnect-handoff-architecture-experiment.md` pass, proof ladder re-run locally with same owner-boundary migration result and topology support evidence; parent revalidated focused proof: yes; outcome: validated.

Theory ledger: `not-applicable` - no new theory update; this experiment selects a successor owner boundary from existing representative evidence.

## Commit And Push Ledger

1. Focused package commit: f649c76a3270f33fdde73bc3c6b22098dae3bbef
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress
2. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --markdown
