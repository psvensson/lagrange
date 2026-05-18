# Priority Recovery Rebalancer Handoff After Publication Count Only Classification

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-18",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "rebalancer_handoff",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Focused implementation proof is green for the fresh publication-count-only retry-scheduled rebalancer_handoff group. The five residual witnesses normalize to four unique operation retries: duplicate control_plane_publications-p1 witnesses preserve one timer, the other partition witnesses each preserve one bounded remote handoff retry, and no duplicate remote wake is emitted.",
  "nextAction": "Stop local rebalancer_handoff runtime edits for this residual unless fresh canonical evidence changes owner, boundary, or next required action. Publication convergence, startup active-gate snapshot coverage, startup readiness support, harness timeout policy, and timeout budgets remain frozen.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260518-priority-recovery-rebalancer-handoff-after-publication-count-only-classification.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "src/control-plane/topology-operator-witness.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260518-topology-publication-convergence-after-startup-readiness-classification.md",
    "test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "work/packages/done-20260517-priority-recovery-rebalancer-handoff-after-workflow-progress-bounded-proof.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "src/control-plane/topology-operator-witness.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260518-priority-recovery-rebalancer-handoff-after-publication-count-only-classification.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "src/control-plane/topology-operator-witness.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "classification-only-focused-proof",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_progress_blocked",
    "nextAction": "Focused proof shows the retry-scheduled handoff group is bounded by existing remote handoff retry behavior without duplicate wake or duplicate timer state."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "rebalancer_handoff",
    "reason": "The predecessor reduced the stale count-only UNKNOWN publication debt. Fresh work:evidence-summary, analyze:topology-convergence, and analyze:causal-model keep publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending visible as producer context, while analyze:priority-recovery-residuals is the only extractor that selects an actionable successor: one operation_workflow_owner / rebalancer_handoff residual group with five retry-scheduled dispatched_waiting_progress witnesses and nextRequiredAction wait_for_operation_progress.",
    "evidence": [
      "work/packages/done-20260518-topology-publication-convergence-after-startup-readiness-classification.md",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If operation_workflow_owner / rebalancer_handoff owns the fresh retry-scheduled residual group, focused proof should show the witnesses drain, remain bounded by an existing retry, split to a narrower operation workflow owner edge, or migrate without reopening publication, startup active-gate, readiness, or timeout budgets.",
    "stopConditionCheck": "Use work:evidence-summary, analyze:priority-recovery-residuals, analyze:topology-convergence, npm run analyze:causal-model, owner-files, and work:advance before implementation. Runtime or test implementation requires clean review/fix proof and a fresh implementation subagent.",
    "expectedCausalModelChange": "Focused proof classifies the rebalancer_handoff residual as bounded retry-scheduled backpressure. Representative rolling-restart was not rerun because this package only added focused test proof and did not change runtime code.",
    "representativeOutcome": "classification-only",
    "causalDebt": "Publication_ack_convergence remains visible first with OPEN epoch-1 evidence in work:evidence-summary, analyze:topology-convergence, and analyze:causal-model; active_gate_snapshot_coverage remains deferred at 2/5 with owner_reconcile_pending; readiness_startup_support remains inherited active-gate no progress. The successor owns residual proof only because analyze:priority-recovery-residuals selects operation_workflow_owner / rebalancer_handoff, so publication, active-gate, readiness, and timeout work stay frozen in this package.",
    "crossBoundaryReview": "Required before implementation because this is a scenario-driven runtime owner-boundary package following a publication-convergence predecessor."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "fresh rolling-restart representative after publication count-only UNKNOWN classification",
    "phaseChain": [
      "startup readiness support reduced to inherited active-gate evidence",
      "publication convergence predecessor reduced UNKNOWN/no-epoch/no-node-list count-only publication debt",
      "fresh representative reports concrete OPEN epoch-1 publication evidence",
      "priority residual extraction reports one operation_workflow_owner / rebalancer_handoff group with five retry-scheduled witnesses",
      "this package owns the rebalancer_handoff proof only"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending remains visible in work:evidence-summary, analyze:topology-convergence, and analyze:causal-model. Only analyze:priority-recovery-residuals selects operation_workflow_owner / rebalancer_handoff with retry_scheduled waitMode and wait_for_operation_progress nextRequiredAction, so this package owns the five residual witnesses rather than publication, active-gate, readiness, or timeout repair.",
    "knownDownstreamBlockers": [
      "control_plane_publications-p1 has duplicate recovering_in_flight retry-scheduled witnesses for operation 4c6da3d9-3dc9-4288-81d8-d0730df1657d",
      "replica_operations-p1 has operation 84f3d14d-b26a-4702-b7c4-4821eaf7acac waiting for operation progress",
      "sql_transaction_participants-p1 has operation c56129f4-fbc9-4ccc-8e72-c625ae9259a4 waiting for operation progress",
      "sql_transactions-p1 has operation 36b42a1f-bba3-487d-a7f4-c7cbc06c0c3e waiting for operation progress",
      "publication remains OPEN with publishedActive=1/5 and prioritySpreadPending=true",
      "active-gate snapshot coverage remains deferred at 2/5 with owner_reconcile_pending"
    ],
    "missingCausalEdge": "Determine whether the retry-scheduled rebalancer_handoff witness group is already bounded by existing remote handoff retry behavior, needs a focused drain/re-entry repair, or splits to a narrower operation workflow owner boundary.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json",
    "boundedProgressProof": "Focused proof added in test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js: the five publication-count-only retry-scheduled witnesses normalize to four unique operation handoff retries, duplicate control_plane_publications-p1 evidence does not duplicate remote wake state, and each unique operation preserves exactly one bounded remote handoff retry timer.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json plus npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "expectedObservableTransition": "Focused observable transition: retry-scheduled rebalancer_handoff evidence classifies to bounded existing remote handoff retry state without changing publication-owner, active-gate, readiness, or timeout-budget code. Representative transition is classification-only because no runtime change was made and no representative rerun was required.",
    "maxProgressBound": "one focused operation_workflow_owner / rebalancer_handoff slice",
    "sameFrontierFallback": "Applied: rebalancer_handoff remains selected in the reference artifact, but focused proof shows bounded retry-scheduled backpressure. Stop as classification-only instead of widening into publication ACK, active-gate snapshot coverage, readiness, or timeout budgets.",
    "expectedNextFrontier": "operation_workflow_owner / rebalancer_handoff until focused proof reduces, classifies, or migrates it",
    "resultClassification": "classification-only",
    "stopCondition": "classification-only-stop",
    "recentFrontierHistory": [
      "work/packages/done-20260518-topology-publication-convergence-after-startup-readiness-classification.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260517-priority-recovery-rebalancer-handoff-after-workflow-progress-bounded-proof.md / operation_workflow_owner / rebalancer_handoff / classification-only",
      "work/packages/done-20260518-priority-recovery-operation-workflow-advance-after-handoff-probe.md / operation_workflow_owner / workflow_progress / migrated"
    ],
    "oscillationCheck": "Allowed because the predecessor changed the publication evidence shape and fresh priority residual extraction now reports a concrete rebalancer_handoff group.",
    "handoffInvariant": "Publication runtime, startup active-gate runtime, startup readiness runtime, timeout budgets, and harness timeout policy remain frozen unless canonical evidence reselects them; visible publication context from summary/topology/causal extractors is not enough to reopen those owners while priority residual extraction selects rebalancer_handoff."
  },
  "architectureDecisionGate": {
    "status": "not-required",
    "trigger": "none",
    "triggerEvidence": [],
    "choices": [],
    "selectedChoice": null,
    "nextAction": "No architecture decision gate is required before this bounded rebalancer_handoff proof."
  },
  "predecessor": "work/packages/done-20260518-topology-publication-convergence-after-startup-readiness-classification.md"
}
-->

## Why

Fresh representative evidence after the publication classifier still fails
rolling-restart. The stale publication shape is gone, and the concrete residual
now sits in retry-scheduled rebalancer handoff witnesses. This package owns that
bounded operation workflow boundary only.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: rolling-restart topology workflow
stabilization and production guarantees for the AGPL runtime.

## Core Logic Brief

Canonical outcome: one rebalancer_handoff decision for the fresh witness group:
bounded existing retry, focused drain/re-entry repair, narrower owner split, or
same-frontier proof.

Inputs/signals: priority residual witnesses, operation ids, partition ids,
semanticStateId, actuationState, waitMode, nextRequiredAction, owner files, and
the prior bounded rebalancer_handoff proof.

State model or invariant: normalize the five witnesses into one owner-boundary
snapshot before making a decision. Duplicate control_plane_publications-p1
witnesses must not create duplicate scheduling or duplicate remote wake state.

Non-goals and forbidden interpretations: do not reinterpret publication
convergence, startup active-gate snapshot coverage, startup readiness support,
harness timeout policy, or timeout budgets inside this package.

Proof mapping: residual extractor output identifies the owner-boundary group;
focused rebalancer tests prove the bounded retry/drain behavior; scenario route
or causal-model output records whether the representative frontier reduces,
migrates, or remains same-frontier.

Wrong-slice trigger: if the proof requires publication ACK runtime, startup
active-gate runtime, readiness runtime, timeout changes, or a non-rebalancer
operation workflow boundary, stop and migrate instead of editing locally.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative release gate remains red and
  canonical residual extraction selects a runtime owner boundary.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package. Run review, fix if needed, and implementation
subagents sequentially before editing runtime or test files.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Codex (019e3a1f-5c2f-7cb2-b9b1-bd7be023dcd2) reviewed work/packages/done-20260518-topology-publication-convergence-after-startup-readiness-classification.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Codex (019e3a21-ff60-7b83-89e5-2024e10569c4) fixed work/packages/done-20260518-topology-publication-convergence-after-startup-readiness-classification.md.
- [x] Implementation subagent recorded: Agent Codex (019e3a28-ae3d-75b1-9dc2-1058708bc32d) implemented work/packages/active-20260518-priority-recovery-rebalancer-handoff-after-publication-count-only-classification.md.

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
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or present a human gate.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.

## In Scope

1. work/packages/active-20260518-priority-recovery-rebalancer-handoff-after-publication-count-only-classification.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/rebalancer/operation-workflow-owner.js
7. src/rebalancer/operation-workflow-owner-segment-7-stage-5.js
8. src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js
9. src/control-plane/priority-recovery-snapshot-stage-10.js
10. src/control-plane/topology-operator-witness.js
11. test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
12. test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js
13. test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js

## Out Of Scope

1. topology_publication_owner/runtime
2. startup_active_gate_owner/runtime
3. startup_readiness_owner/runtime
4. harness-timeout-increase

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260518-priority-recovery-rebalancer-handoff-after-publication-count-only-classification.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/rebalancer/operation-workflow-owner.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js`, `src/control-plane/priority-recovery-snapshot-stage-10.js`, `src/control-plane/topology-operator-witness.js`, `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`, `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`, `test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
- Forbidden files: `topology_publication_owner/runtime`, `startup_active_gate_owner/runtime`, `startup_readiness_owner/runtime`, `harness-timeout-increase`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json`, `npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json
2. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-count-only-unknown-20260518T074802Z.report.json
5. npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff --markdown
6. npm run work:advance -- --check
7. npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
8. node scripts/check-guideline-literals.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
9. node scripts/check-guideline-decision-boundaries.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js

## Focused Proof Result

Classification-only focused proof. The publication-count-only residual has five
retry-scheduled `rebalancer_handoff` witnesses, but they normalize to four
unique operation handoff retries. The duplicate `control_plane_publications-p1`
operation preserves one bounded retry timer and emits no duplicate remote wake;
the other three unique operations each preserve one bounded remote handoff
retry timer.

No runtime file was changed. Representative rolling-restart was not rerun
because this package added focused proof only; the reference artifact remains
same-artifact evidence while this boundary stops as bounded retry-scheduled
backpressure.
