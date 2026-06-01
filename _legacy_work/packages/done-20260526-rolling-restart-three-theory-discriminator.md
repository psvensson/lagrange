# Rolling Restart Three Theory Discriminator

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-26",
    "lane": "experiment",
    "scenario": "none",
    "artifact": "test-output/reports/rolling-restart-three-theory-recovery.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Fresh rolling-restart after the load-mode selected snapshot owner-recovery projection fix has snapshotCoverageNodeCount=5/5, selectedSnapshotError=null, active_gate_snapshot_coverage satisfied, and first frontier priority_recovery_partition_progress.",
    "nextAction": "Treat this package as reduced/migrated; continue from operation_workflow_owner/workflow_progress/priority_recovery_event_driven_wait in a successor package if more runtime fixing is requested.",
    "closed": "2026-05-26",
    "successor": "work/packages/done-20260526-rolling-restart-operation-workflow-three-theory-recovery.md"
  },
  "scope": {
    "writeScope": [
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js",
      "test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
      "work/packages/done-20260526-rolling-restart-operation-workflow-three-theory-recovery.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "test/distributed/harness/cluster-control-snapshot-recovery.js",
      "test/distributed/harness/cluster-segment-7-class-4.js",
      "test/distributed/harness/cluster-active-wait-publication-gate.js",
      "test/distributed/harness/cluster-segment-7-alpha-active-wait.js"
    ],
    "commitScope": [
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js",
      "test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
      "work/packages/active-20260526-rolling-restart-three-theory-discriminator.md",
      "work/packages/done-20260526-rolling-restart-operation-workflow-three-theory-recovery.md"
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
      "theory-20260522-snapshot-watch-handoff-contract"
    ],
    "theoryLedger": "no-ledger-update",
    "proof": {
      "commands": [
        "falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
        "regression: npm run analyze:topology-convergence -- test-output/reports/rolling-restart.report.json --explain active_gate_snapshot_coverage",
        "supporting: node test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
        "representative: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-three-theory-recovery.report.json --verbose",
        "fresh-route: npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-recovery.report.json"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
        "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js",
        "test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    },
    "repair": {
      "validationCommand": "npm run work:repair"
    }
  },
  "boundedExperiment": {
    "hypothesis": "H1 selected snapshot source timeout: admin_health reachable sources can still block snapshot coverage when snapshot-lane queries time out. H2 deferred owner-recovery enqueue: owner_reconcile_pending write_deferred with enqueued=false loses bounded retry progress. H3 unreachable-node readiness pressure: a fully unhealthy node masks or starves snapshot coverage progress under load.",
    "hypothesisDiscriminator": "H1 is selected if selectedSnapshotSourceCause is selected_snapshot_source_timeout with repair_deferred and a reachable selected source; H2 is selected if membershipPublicationHandoffOutcome is write_deferred/enqueued=false with pendingWrites>0 and no queue growth; H3 is selected if the unreachable node is the only root blocker and snapshot handoff is otherwise enqueued or draining.",
    "expectedMetric": "One selected successor route plus concrete evidence for snapshotCoverageNodeCount, selected snapshot source state, owner-recovery enqueue/drain state, and unreachable-node probe state.",
    "inheritsFrom": "none",
    "timebox": "24h",
    "mergeRequirement": "canonical scenario route, topology explain, focused discriminator probe, and selected successor package or architecture-gap stop",
    "killRule": "Do not patch runtime until one theory is selected; if the fresh rerun returns unchanged active_gate_snapshot_coverage without metric reduction, open architecture-gap instead of another local runtime patch."
  },
  "validationTier": "cross-owner",
  "observablePrediction": {
    "metric": "One selected successor route plus concrete evidence for snapshotCoverageNodeCount, selected snapshot source state, owner-recovery enqueue/drain state, and unreachable-node probe state.",
    "predicted": "One selected successor route plus concrete evidence for snapshotCoverageNodeCount, selected snapshot source state, owner-recovery enqueue/drain state, and unreachable-node probe state.",
    "observed": "Focused proof selected the load-mode selected snapshot timeout owner-recovery path: the new regression failed before the projection fix and passed after it. Fresh rolling-restart moved snapshotCoverageNodeCount from 1/5 to 5/5, cleared selectedSnapshotError, and satisfied active_gate_snapshot_coverage; the representative failure migrated to priority_recovery_partition_progress.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-three-theory-recovery.report.json; npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-recovery.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-recovery.report.json; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-three-theory-recovery.report.json"
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
      "npm run work:scenario-route -- test-output/reports/rolling-restart.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart.report.json --explain active_gate_snapshot_coverage",
      "node test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-three-theory-recovery.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "workflow_progress",
    "routeDominantReason": "priority_recovery_event_driven_wait",
    "routeCausalOutcome": "accept_classified_backpressure",
    "stopMode": "classified_backpressure",
    "nextLane": "diagnostic-classification",
    "expectedDelta": "Snapshot coverage blocker reduced and migrated; continue with priority recovery workflow progress if pursuing representative green.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-three-theory-recovery.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "experimentOutcome": {
    "decision": "owner-boundary-migration",
    "distinguishedHypothesis": "H1",
    "baselineArtifact": "test-output/reports/rolling-restart.report.json",
    "representativeArtifact": "test-output/reports/rolling-restart-three-theory-recovery.report.json",
    "metricDelta": "snapshotCoverageNodeCount 1/5 -> 5/5; selectedSnapshotError timeout -> null; active_gate_snapshot_coverage satisfied; first frontier migrated to priority_recovery_partition_progress",
    "nextOwner": "operation_workflow_owner",
    "nextBoundary": "workflow_progress",
    "nextDominantReason": "priority_recovery_event_driven_wait",
    "evidence": "test-output/reports/rolling-restart-three-theory-recovery.report.json"
  },
  "theoryLedger": "no-ledger-update",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js",
      "test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "repair": {
    "validationCommand": "npm run work:repair"
  },
  "commitAndPushLedgerRequired": true
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

- Status: `implemented` - load-mode active-gate projection now accepts selected snapshot timeout owner-recovery evidence only when the publication gate is ready, the selected source is admin-reachable, the canonical node state is active, and there is no publication disagreement.
- Canonical outcome: a load-mode node with timeout-shaped traffic readiness can project active from selected snapshot owner-recovery evidence when publication convergence and published-active evidence are already canonical.
- Inputs/signals: publication gate readiness, snapshot coverage completeness, selected snapshot admin readiness, selected snapshot timeout owner-recovery projection readiness, traffic readiness source, canonical active state, diagnostic error, and publication disagreement.
- State model or invariant: the projection is a bounded load-mode convergence projection; it must not override publication disagreement, missing publication gate readiness, non-active canonical state, or a selected source that is not admin-reachable.
- Non-goals and forbidden interpretations: do not raise timeouts, bypass priority recovery, or mark a node active from timeout evidence alone.
- Proof mapping: the new focused test constructs the exact timeout-plus-owner-recovery shape; adjacent projection and handoff tests prove existing startup and selected transport-closed paths still hold; the representative rerun proves snapshot coverage moved from `1/5` to `5/5`.
- Wrong-slice trigger: if the fresh artifact keeps `active_gate_snapshot_coverage` unsatisfied, stay in startup active-gate ownership; if coverage is satisfied and the first frontier moves, stop widening this package and open the routed successor.



## Bounded Experiment

- Hypothesis: H1 selected snapshot source timeout: admin_health reachable sources can still block snapshot coverage when snapshot-lane queries time out. H2 deferred owner-recovery enqueue: owner_reconcile_pending write_deferred with enqueued=false loses bounded retry progress. H3 unreachable-node readiness pressure: a fully unhealthy node masks or starves snapshot coverage progress under load.
- Hypothesis discriminator: H1 is selected if selectedSnapshotSourceCause is selected_snapshot_source_timeout with repair_deferred and a reachable selected source; H2 is selected if membershipPublicationHandoffOutcome is write_deferred/enqueued=false with pendingWrites>0 and no queue growth; H3 is selected if the unreachable node is the only root blocker and snapshot handoff is otherwise enqueued or draining.
- Expected metric: One selected successor route plus concrete evidence for snapshotCoverageNodeCount, selected snapshot source state, owner-recovery enqueue/drain state, and unreachable-node probe state.
- Inherits from: `none`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: canonical scenario route, topology explain, focused discriminator probe, and selected successor package or architecture-gap stop
- Kill rule: Do not patch runtime until one theory is selected; if the fresh rerun returns unchanged active_gate_snapshot_coverage without metric reduction, open architecture-gap instead of another local runtime patch.
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.

## Observable Prediction

- Metric: One selected successor route plus concrete evidence for snapshotCoverageNodeCount, selected snapshot source state, owner-recovery enqueue/drain state, and unreachable-node probe state.
- Predicted: One selected successor route plus concrete evidence for snapshotCoverageNodeCount, selected snapshot source state, owner-recovery enqueue/drain state, and unreachable-node probe state.
- Observed: Focused proof selected the load-mode selected snapshot timeout owner-recovery path: the new regression failed before the projection fix and passed after it. Fresh `rolling-restart` moved snapshot coverage from `1/5` to `5/5`, cleared the selected snapshot timeout, and satisfied `active_gate_snapshot_coverage`.
- Accuracy: `partial`
- Evidence: `test-output/reports/rolling-restart-three-theory-recovery.report.json`, `npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-recovery.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-recovery.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-three-theory-recovery.report.json`
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart.report.json`
- Expected delta: Select exactly one concrete runtime fix route or close as architecture-gap if all three theories remain indistinguishable.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-three-theory-recovery.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `workflow_progress`
- Route dominant reason: `priority_recovery_event_driven_wait`
- Route causal outcome: `accept_classified_backpressure`
- Stop mode: `classified_backpressure`
- Next lane: `diagnostic-classification`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.
- Observed rerun route: `operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait`
- Observed stop mode: `classified_backpressure`
- Observed successor action: open successor package from `test-output/reports/rolling-restart-three-theory-recovery.report.json` if continuing beyond this package.

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

1. test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js
2. test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js
3. test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js

## Out Of Scope

1. src/

## Model Fit

- Package class: `experiment`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js`, `test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js`, `test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:scenario-route -- test-output/reports/rolling-restart.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart.report.json --explain active_gate_snapshot_coverage`, `node test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js`
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
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: startup_active_gate_owner; files-changed: `test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js`, `test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js`, `test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js`; validation: focused proof; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: none; validation: `node test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js`, `node test/distributed/harness/__tests__/cluster-active-gate-admin-probe-timeout-projection.test.js`, `node test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js`, `node test/control-plane/publication-active-gate-handoff-contract.test.js`; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`; validation: `npm run work:repair`; outcome: validated.

## Commit And Push Ledger

1. Focused package commit: c8b5596d6fa1ff8442f68ff28d8797f931aa2a08
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. npm run work:scenario-route -- test-output/reports/rolling-restart.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart.report.json --explain active_gate_snapshot_coverage
3. node test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js
4. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-three-theory-recovery.report.json --verbose
5. npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-recovery.report.json
6. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-recovery.report.json
7. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-three-theory-recovery.report.json
