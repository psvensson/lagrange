# Priority Recovery operation_workflow_owner workflow_progress Residual

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Closed as reduced. Dispatch-pending workflow re-entry now schedules from the normalized operation-owner snapshot and selected witness operation. Fresh rolling-restart evidence reduced the workflow_progress residual from three spread_satisfied_in_flight witnesses to one remaining control_plane_publications-p1 PENDING persisted_not_dispatched witness.",
  "nextAction": "Open the next bounded operation_workflow_owner / workflow_progress package for the single remaining control_plane_publications-p1 operation 0a3b14cf-b731-4279-a07b-3a755ead1a17, without relaxing active-gate admission, rewriting publication handoff truth, or increasing timeouts.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown",
    "node - <<'NODE' ... priorityRecoveryDecisionSnapshots witness extraction ... NODE",
    "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json --markdown"
  ],
  "writeScope": [
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "work/packages/done-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md",
    "work/packages/done-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md",
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/replica-dispatch-service-segment-1.js",
    "src/control-plane/replica-dispatch-service-segment-2.js",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/replica-operation-repository-mutation-methods.js",
    "test/rebalancer/rebalance-coordinator-outcome-routing.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js"
  ],
  "commitScope": [
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "work/packages/done-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
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
    "status": "live-red-scenario-release-gate-reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "workflow_progress_reduced_to_single_control_plane_publications_pending",
    "nextAction": "Close this package as reduced and activate a narrower workflow_progress residual for the remaining control_plane_publications-p1 PENDING witness."
  },
  "causalGovernance": {
    "hypothesis": "The prior startup active-gate slice proved the visible snapshot-coverage timeout is gated by unresolved workflow progress. Three spread_satisfied_in_flight workflow-progress witnesses remain long enough for active-gate snapshot repair to defer on stale replica operation progress.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
    "expectedCausalModelChange": "rolling-restart becomes representative-green, active-gate snapshot coverage or producer publication coverage improves after workflow drain, the residual reduces to fewer workflow-progress witnesses, or fresh evidence splits to a narrower workflow/repository/dispatch owner.",
    "representativeOutcome": "reduced",
    "causalDebt": "This package reduced the three spread_satisfied_in_flight workflow witnesses to one control_plane_publications-p1 witness. The remaining active-gate owner still depends on stale operation progress and cannot publish the four missing active nodes until that final workflow-progress witness drains or splits.",
    "crossBoundaryReview": "Do not relax active-gate admission or rewrite publication handoff truth. This package may only promote runtime files after focused owner evidence shows workflow progress, repository mutation, or dispatch progress is the relevant local boundary."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / priority recovery operation workflow workflow_progress residual",
    "phaseChain": [
      "consume startup active-gate owner-boundary migration proof",
      "prepare subagent sequencing ledger with real review/fix/implementation agents",
      "inspect workflow_progress owner files and the three current witnesses",
      "implement one bounded workflow progress fix if evidence stays local",
      "prove focused owner tests and static guardrails",
      "rerun representative rolling-restart until green, reduced, migrated, or split"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage remains the outer topology frontier in test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json, while owner-boundary migration proof selects operation_workflow_owner / workflow_progress as the active implementation boundary.",
    "knownDownstreamBlockers": [
      "priority-recovery residual extraction reports split required false with one workflow_progress group and three witnesses",
      "the witness partitions are control_plane_publications-p1, replica_operations-p1, and sql_transaction_participants-p1 with semantic state spread_satisfied_in_flight",
      "raw witness fallback shows control_plane_publications-p1 operation 096de242-36cd-492c-a5f0-501914999846 is PENDING, persisted_not_dispatched, timeoutReconcileDue=true, stepAgeMs=33560, stepTimeoutMs=30000, target 11601fe0-72d6-5853-8590-ec2881853e72, targetVisibilityState=absent",
      "raw witness fallback shows replica_operations-p1 and sql_transaction_participants-p1 are also PENDING/persisted_not_dispatched, while sql_transaction_participants-p1 serially waits on the first two operation IDs",
      "topology convergence handoff probe reports pendingReconcileCount=1 for 11601fe0-72d6-5853-8590-ec2881853e72 and runtimePromotionAllowed=false",
      "active-gate snapshot observation remains repair_deferred with stale_replica_operations_in_flight",
      "producer publication visibility remains seed-only until workflow progress drains or splits"
    ],
    "missingCausalEdge": "The operation workflow owner must advance the dispatch-pending persisted-not-dispatched operations, starting with the timeout-due control_plane_publications-p1 root witness, or split the remaining red evidence to a narrower workflow/repository/dispatch owner with concrete operation evidence.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --markdown",
    "boundedProgressProof": "The package must prove bounded workflow-owner dispatch-pending re-entry through dispatch, persistence, retry, completion, or a canonical non-frontier classification for the control_plane_publications-p1, replica_operations-p1, and sql_transaction_participants-p1 witnesses.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json",
    "expectedObservableTransition": "Fresh rolling-restart evidence reduced the workflow_progress witnesses from three to one. The remaining witness is control_plane_publications-p1 operation 0a3b14cf-b731-4279-a07b-3a755ead1a17, still PENDING/persisted_not_dispatched with timeoutReconcileDue=true.",
    "maxProgressBound": "one workflow_progress owner package slice; no timeout increases, active-gate admission relaxation, publication handoff rewrites, or bridge simplification implementation inside this package",
    "sameFrontierFallback": "If workflow_progress remains, record whether dispatch, repository mutation, completion persistence, retry wake-up, or diagnostics classification failed before broadening scope.",
    "expectedNextFrontier": "a narrower operation_workflow_owner / workflow_progress package for the single remaining control_plane_publications-p1 dispatch-pending witness; startup active-gate snapshot coverage remains the outer red gate until it drains",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md / operation_workflow_owner / rebalancer_handoff / reduced",
      "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260515-topology-publication-active-gate-handoff-contract-consolidation.md / topology_publication_owner / publication_active_gate_handoff_contract / reduced"
    ],
    "oscillationCheck": "This package is the parked paired split that became eligible only after rebalancer_handoff drained. It must not reopen the active-gate bridge unless focused evidence proves workflow progress is non-frontier.",
    "handoffInvariant": "Active-gate admission stays strict while runtimePromotionAllowed=false; publication handoff truth remains owned by the canonical contract."
  },
  "predecessor": "work/packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md"
}
-->

## Why

The previous startup active-gate proof selected
`workflow-progress-migration`. Fresh representative evidence is still red on
the visible active-gate surface, but the bounded implementation owner is now
`operation_workflow_owner / workflow_progress`.

This package reduced the unsplit group of three
`spread_satisfied_in_flight` witnesses to one remaining
`control_plane_publications-p1` workflow-progress witness. The next package
owns that single PENDING, persisted-not-dispatched operation.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, under topology workflow
stabilization, failure simulations, and production guarantees.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: canonical residual evidence names one owner
  boundary and one semantic state.
- Escalation trigger to a heavier lane: the fix needs publication handoff
  semantics, active-gate admission changes, timeout changes, or broad bridge
  simplification.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Raw Evidence Fallback

Canonical extractors were run first:
`npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json`,
`npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --markdown`,
`npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --handoff-probe`,
and `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json`.

Focused raw JSON extraction was used only after those tools identified the
owner, boundary, semantic state, and witness partitions but did not expose the
operation ids, source and target nodes, workflow step/status, timeout-due
state, or serial wait operation ids needed to choose the exact runtime files.
The fallback selected `control_plane_publications-p1` operation
`096de242-36cd-492c-a5f0-501914999846` as the timeout-due root witness:
`PENDING`, `persisted_not_dispatched`, `dispatch_pending`,
`timeoutReconcileDue=true`, target node
`11601fe0-72d6-5853-8590-ec2881853e72`, with
`replica_operations-p1` and `sql_transaction_participants-p1` also
`PENDING`/`persisted_not_dispatched`; `sql_transaction_participants-p1`
serially waits on the first two operation ids.

## In Scope

1. Inspect the remaining workflow progress witness with canonical extractors.
2. Promote exact runtime/test files into `writeScope` only after focused owner
   evidence confirms the boundary.
3. Implement one bounded workflow progress fix, or split/migrate with concrete
   operation, repository, dispatch, or diagnostics evidence.
4. Rerun focused tests, static guardrails, and representative
   `rolling-restart`.

## Out Of Scope

1. Timeout increases.
2. Active-gate admission relaxation.
3. Publication handoff contract rewrites.
4. Publication-active-gate bridge simplification implementation.
5. Pro or Enterprise behavior.

## Activation Evidence

This package is active because
`work/packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md`
records owner-boundary migration proof from
`startup_active_gate_owner / snapshot_coverage` to
`operation_workflow_owner / workflow_progress`.

Before runtime editing:

1. Run a real review subagent and record the result.
2. Record a fix subagent or explicit not-needed result.
3. Promote exact runtime/test files from `candidateRuntimeFiles` into
   `writeScope` and `commitScope`.
4. Run a real implementation subagent for the selected bounded slice.

## Subagent Sequencing Ledger

Required on activation because this is a causal-escalation runtime package.
The user has explicitly authorized delegation, so placeholder environment
blocks are not valid closure proof for this package.

- [x] Review subagent recorded: Agent Halley (019e2d81-5432-7271-8a65-b2669b0c6e78) reviewed work/packages/done-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md; result fixes-required
- [x] Fix subagent recorded or explicitly not needed: Agent Lovelace (019e2d83-3bbc-7af1-adb3-ee4b2bec86b0) fixed work/packages/done-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md
- [x] Implementation subagent recorded: Agent Epicurus (019e2d89-600b-75c3-86e6-37598613a364) implemented work/packages/done-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `src/rebalancer/operation-workflow-owner.js`,
  `src/rebalancer/operation-workflow-owner-segment-7-stage-3.js`,
  `src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`,
  `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`,
  `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`,
  `work/packages/done-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md`,
  `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`,
  `work/sprints/current-blocker.md`, and `work/sprints/current-blocker.json`.
- Forbidden files: timeout increases, active-gate admission relaxation,
  publication handoff contract rewrites, bridge simplification implementation,
  Pro or Enterprise behavior.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:llm-start`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --markdown`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json`, `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:llm-start
3. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json
4. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --markdown
5. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --handoff-probe
6. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json
7. npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown

## Implementation Result

- Runtime result: dispatch-pending priority recovery re-entry now schedules
  from the normalized operation-owner snapshot and the selected operation
  witness. This keeps bounded wake/retry work rooted in the owner decision
  that converted the `spread_satisfied_in_flight` dispatch-pending witness
  into the workflow-owner progress contract.
- Bounded witness coverage: the timeout-due
  `control_plane_publications-p1` PENDING root, the
  `replica_operations-p1` PENDING witness, and the
  `sql_transaction_participants-p1` PENDING serial-wait witness all stay on
  the workflow-owner dispatch-pending re-entry path; no active-gate admission,
  publication handoff truth, bridge simplification, or timeout budget changed.
- Runtime files changed: `src/rebalancer/operation-workflow-owner.js` and
  `src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`.
- Representative rerun: `rolling-restart` stayed red but reduced the
  workflow-progress residual from three witnesses to one
  `control_plane_publications-p1` witness. The outer active-gate surface
  remains red with snapshot coverage `2/5` and four pending reconcile nodes.

## Validation Evidence

- `npm run work:context`: passed.
- `npm run work:llm-start`: passed; package doctor validation phase
  `pre-impl` ok.
- `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json`:
  passed; outer evidence remains `active_gate_snapshot_coverage` with this
  package owning the workflow-progress migration proof.
- `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --markdown`:
  passed; three witnesses under `operation_workflow_owner / workflow_progress`,
  split required `false`.
- `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown`:
  passed.
- `npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`:
  passed, `134/134`.
- `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`:
  passed, `0` new literal-guideline violations.
- `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`:
  passed, `0` decision-boundary guideline violations.
- `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`:
  passed, `0` runtime-grammar-contract violations.
- `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json --fast-local --verbose`:
  failed `0/1` after `136.4s`; reduced workflow-progress residuals from
  three witnesses to one remaining `control_plane_publications-p1` witness.
- `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json --markdown`:
  passed; split required `false`; one remaining
  `operation_workflow_owner / workflow_progress` witness on
  `control_plane_publications-p1`.
- `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json --handoff-probe`:
  passed; active-gate handoff remains pending with `pendingReconcileCount=4`
  and `runtimePromotionAllowed=false`.
- `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json`:
  passed; outcome `continue_local_fix`, dominant failure class
  `active_gate_snapshot_coverage_incomplete`.
- `git diff --check -- src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js work/packages/done-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md work/sprints/current-blocker.md work/sprints/current-blocker.json`:
  passed.
