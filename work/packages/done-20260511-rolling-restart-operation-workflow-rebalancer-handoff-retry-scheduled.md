# Rolling Restart Operation Workflow Rebalancer Handoff Retry Scheduled

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-11",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-rebalancer-handoff-fix/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_workflow_progress_event_driven",
  "currentState": "The implementation classified active coordinator-created remote handoff retry timers as bounded owner-internal retry state instead of reclassifying otherwise event-driven dispatch-pending priority recovery snapshots to rebalancer_handoff. The representative rolling-restart rerun still fails 0/1, but the first frontier migrated from operation_workflow_owner / rebalancer_handoff to operation_workflow_owner / workflow_progress with dominant source reason priority_recovery_workflow_progress_event_driven, recovering_in_flight, blocked partitions control_plane_publications-p1, replica_operations-p1, sql_transaction_participants-p1, sql_transactions-p1, and sql_write_operations-p1, active progress 2/5, and snapshot coverage 2/5.",
  "nextAction": "Activate `work/packages/active-20260511-rolling-restart-operation-workflow-progress-event-driven-priority-recovery.md` for the migrated workflow-progress event-driven priority recovery frontier.",
  "proof": [
    "npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "work/packages/done-20260511-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md",
    "work/packages/done-20260511-rolling-restart-operation-workflow-progress-event-driven-wait.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/cross-boundary-causal-edge",
    "escalationTriggers": [
      "rebalancer handoff evidence requires changes outside operation_workflow_owner, RebalanceCoordinator handoff contracts, or priority recovery diagnostics",
      "representative proof restores topology_publication_owner or startup_active_gate_owner as the direct blocker",
      "runtime implementation would need Pro or Enterprise features"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If rebalancer handoff retry scheduling is repaired or classified, priority_recovery_partition_progress should reduce, converge, or migrate away from operation_workflow_owner / rebalancer_handoff before startup active-gate snapshot coverage is treated as direct.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-event-driven-wait-fix.report.json",
    "expectedCausalModelChange": "The remote handoff retry either advances, becomes a bounded non-frontier retryable state, or migrates to a new named owner boundary.",
    "representativeOutcome": "migrated",
    "causalDebt": "The remote handoff retry scheduling seam is reduced to bounded owner-internal retry state; remaining rolling-restart debt migrated back to operation_workflow_owner / workflow_progress event-driven priority recovery progress.",
    "crossBoundaryReview": "completed-before-package-open; predecessor review found metadata fixes that were fixed and pushed before this package opened."
  },
  "predecessor": "work/packages/done-20260511-rolling-restart-operation-workflow-progress-event-driven-wait.md",
  "closed": "2026-05-11",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260511-rolling-restart-operation-workflow-progress-event-driven-priority-recovery.md"
}
-->

Opened after the event-driven wait package moved the first representative
frontier from `operation_workflow_owner / workflow_progress` to
`operation_workflow_owner / rebalancer_handoff`.

## Current Evidence

1. Baseline representative report:
   `test-output/reports/rolling-restart-current-release-gate-after-event-driven-wait-fix.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-current-release-gate-after-event-driven-wait-fix/rolling-restart/`.
3. Implementation representative report:
   `test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json`.
4. Implementation playback directory:
   `test-output/reports/.playback/rolling-restart-current-release-gate-after-rebalancer-handoff-fix/rolling-restart/`.
5. Baseline frontier edge: `priority_recovery_partition_progress`.
6. Baseline owner and boundary: `operation_workflow_owner / rebalancer_handoff`.
7. Baseline frontier state: `retryable`.
8. Baseline dominant source reason:
   `priority_recovery_rebalancer_handoff_retry_scheduled`.
9. Implementation rerun frontier edge: `priority_recovery_partition_progress`.
10. Implementation rerun owner and boundary:
    `operation_workflow_owner / workflow_progress`.
11. Implementation rerun dominant source reason:
    `priority_recovery_workflow_progress_event_driven`.
12. Topology owner reason: `priority_recovery_event_driven_wait`.
13. Unresolved semantic state: `recovering_in_flight`.
14. Baseline blocked partitions: `control_plane_publications-p1` and
   `sql_transaction_participants-p1`.
15. Implementation rerun blocked partitions: `control_plane_publications-p1`,
    `replica_operations-p1`, `sql_transaction_participants-p1`,
    `sql_transactions-p1`, and `sql_write_operations-p1`.
16. Implementation rerun active-gate terminal progress: `2/5`.
17. Snapshot coverage: `2/5`.
18. Priority recovery invariants: `passed`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` under AGPL-owned rows:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Edition matrix status: Community / AGPL repo.

## In Scope

1. Freeze the current rebalancer-handoff retry witness and explain output.
2. Trace why the priority recovery partitions remain in remote handoff retry
   instead of making owner-visible progress.
3. Add or extend the smallest operation-workflow owner regression or blocker
   probe for `priority_recovery_rebalancer_handoff_retry_scheduled`.
4. Repair or classify the retry frontier without reopening workflow-progress
   event-driven wait unless fresh evidence restores it as first frontier.
5. Keep publication convergence as presentation residual only unless topology
   evidence restores `topology_publication_owner` as the canonical owner.
6. Rerun representative `rolling-restart --fast-local`.

## Out Of Scope

1. Harness timeout increases or presentation-only relabeling that hides owner
   evidence.
2. Startup active-gate snapshot coverage until priority recovery handoff is
   green, non-frontier, or migrated by fresh evidence.
3. Phase `0.5`, Phase `1.0`, Pro, or Enterprise work.
4. Reopening historical rolling-restart packages unless fresh representative
   evidence restores their owner boundary as the first frontier.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/cross-boundary-causal-edge`
- Owned files: operation workflow owner rebalancer-handoff logic, affected
  RebalanceCoordinator handoff contract if required, priority recovery
  diagnostics, focused rebalancer tests, this package file, sprint/current
  blocker handoff files, and model-ledger evidence.
- Forbidden files: startup active-gate owner implementation, harness timeout
  configuration, unrelated archived rolling-restart packages, Pro or Enterprise
  surfaces.
- Frozen decisions: this package targets the rebalancer-handoff retry frontier
  only; startup snapshot coverage remains downstream until priority recovery
  handoff closes or migrates.
- Escalation triggers: handoff evidence requires changes outside the declared
  owner boundary; representative proof restores topology publication or startup
  active-gate ownership as the direct blocker; runtime implementation would need
  Pro or Enterprise features.
- Focused proof: topology explain for `priority_recovery_partition_progress`,
  distributed-failure analysis, causal-model summary, focused owner-path
  regression, touched-file guardrails, and one representative rolling-restart
  rerun.

## Causal Governance

- Causal hypothesis: if rebalancer handoff retry scheduling is repaired or
  classified, `priority_recovery_partition_progress` should reduce, converge, or
  migrate away from `operation_workflow_owner / rebalancer_handoff` before
  startup active-gate snapshot coverage is treated as direct.
- Stop-condition check:
  `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-event-driven-wait-fix.report.json`.
- Expected causal-model change: the remote handoff retry advances, becomes a
  bounded non-frontier retryable state, or migrates to a new named owner
  boundary.
- Representative outcome: migrated to `operation_workflow_owner /
  workflow_progress` with event-driven priority recovery progress.
- Causal debt: the remote handoff retry scheduling seam is reduced to bounded
  owner-internal retry state; remaining rolling-restart debt migrated back to
  `operation_workflow_owner / workflow_progress` event-driven priority recovery
  progress.
- Cross-boundary review: completed before package open; predecessor review found
  metadata fixes that were fixed and pushed before this package opened.

## Hotspots

1. `src/rebalancer/operation-workflow-owner*.js`
2. `src/rebalancer/rebalance-coordinator*.js` only if the handoff contract
   itself is proven stale.
3. `src/control-plane/priority-recovery-snapshot*.js`
4. `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
5. `scripts/analyze-topology-convergence.js` only if canonical owner evidence is
   proven stale.

## Boundary Contract

Baseline semantic owner:
`operation_workflow_owner / rebalancer_handoff`.

Baseline canonical evidence:
`priority_recovery_partition_progress`, `recovering_in_flight`,
`priority_recovery_rebalancer_handoff_retry_scheduled`, blocked partitions
`control_plane_publications-p1` and `sql_transaction_participants-p1`, active
progress `3/5`, and snapshot coverage `2/5`.

Allowed consumers:
operation workflow owner, rebalancer coordinator handoff contracts, priority
recovery diagnostics, topology convergence analysis, distributed failure
summary, failure-bundle/reporting surfaces, and the rolling-restart release
gate.

Forbidden reinterpretations:

1. Do not treat a scheduled handoff retry as startup active-gate snapshot
   coverage while priority recovery remains the frontier.
2. Do not restore publication convergence as first frontier unless topology
   evidence names it directly.
3. Do not hide the blocker with a harness timeout or presentation relabel.
4. Do not implement Pro or Enterprise behavior.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent code-review (`019e0c86-a3d4-712d-9f2a-8fec16a82d15`) reviewed
      `work/packages/done-20260511-rolling-restart-operation-workflow-progress-event-driven-wait.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent copilot-cli-fix (`1f950b37-3f89-4f31-98f5-28e3ae39faad`) fixed
      `work/packages/done-20260511-rolling-restart-operation-workflow-progress-event-driven-wait.md`.
- [x] Implementation subagent recorded:
      Agent copilot-cli-implementation (`19990eef-56e9-4705-b3bb-0fe702c62cf7`) implemented
      `work/packages/done-20260511-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md`.

## Static Drift Ledger

Preflight:

1. Baseline artifact analysis confirms the current frontier is retryable
   `operation_workflow_owner / rebalancer_handoff`.
2. Review subagent found stale dominant-reason metadata in the predecessor
   package and current-blocker handoff.
3. Fix subagent repaired the dominant-reason handoff and validation passed.
4. Runtime/test touched-file guardrails must be run before and after any runtime
   implementation.

Closure:

1. Active handoff retry regression added and failed before runtime change:
   active retry reclassified event-driven owner progress to
   `rebalancer_handoff / retry_scheduled`.
2. Runtime change removed active remote handoff retry timers from the owner
   snapshot re-entry allowed-state set. The existing bounded retry timer remains
   armed, but it no longer rewrites event-driven priority recovery progress to
   the rebalancer-handoff frontier.
3. Focused regression passed after the runtime change.
4. Representative rerun migrated the first frontier to
   `operation_workflow_owner / workflow_progress` with
   `priority_recovery_workflow_progress_event_driven`.

## Commit And Push Ledger

1. Focused package commit: `7198e5d3c175e931a213bb6fa0b247b5a8f999c7`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

Required implementation validation:

1. Baseline evidence:
   `npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-event-driven-wait-fix.report.json`.
2. Baseline topology explain:
   `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-event-driven-wait-fix.report.json --explain priority_recovery_partition_progress`.
3. Baseline distributed-failure analysis:
   `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-after-event-driven-wait-fix.report.json`.
4. Causal-model summary:
   `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-event-driven-wait-fix.report.json`.
5. Focused operation-workflow or rebalancer-handoff regression/blocker probe.
6. Touched-file syntax, literal, decision-boundary, runtime-grammar, and diff
   hygiene guardrails.
7. `npm run work:current-blocker`.
8. `npm run work:validate`.
9. Representative
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json --fast-local --verbose`.

Validation results:

1. Baseline evidence/topology/distributed-failure/causal-model commands passed
   for `rolling-restart-current-release-gate-after-event-driven-wait-fix`.
2. Focused failing probe:
   `npx tap test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js --timeout=120`
   showed the new active handoff retry snapshot assertions failing before the
   runtime change.
3. Focused owner regression:
   `npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
   passed after the runtime change (`71/71` assertions).
4. Touched-file guardrails passed:
   `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js src/rebalancer/operation-workflow-owner.js`,
   `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js src/rebalancer/operation-workflow-owner.js`,
   and
   `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-7-stage-5.js src/rebalancer/operation-workflow-owner.js`.
5. Representative rerun:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json --fast-local --verbose`
   failed `0/1`, but migrated the first frontier to
   `operation_workflow_owner / workflow_progress`.
6. Representative evidence summary:
   `npm --silent run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json`
   selected `priority_recovery_partition_progress` under
   `operation_workflow_owner / workflow_progress`, frontier `retryable`,
   dominant reason `priority_recovery_event_driven_wait`.
7. Topology explain:
   `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json --explain priority_recovery_partition_progress`
   named source dominant reason
   `priority_recovery_workflow_progress_event_driven` and blocked partitions
   `control_plane_publications-p1`, `replica_operations-p1`,
   `sql_transaction_participants-p1`, `sql_transactions-p1`, and
   `sql_write_operations-p1`.
8. Causal model:
   `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json`
   reported `accept_classified_backpressure`,
   `dominantFailureClass=priority_recovery_event_wait`.
9. Tracker and diff hygiene passed:
   `npm run work:current-blocker`,
   `npm run work:validate -- --all`, `npm run work:package:doctor -- work/packages/done-20260511-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md`,
   and `git diff --check`.

## Done When

1. The rebalancer-handoff retry witness has a focused regression or replayable
   blocker probe.
2. `operation_workflow_owner / rebalancer_handoff` either converges, emits one
   canonical reason it remains retryable/blocked, or migrates to a new named
   owner boundary.
3. Representative `rolling-restart --fast-local` is rerun and the outcome is
   recorded as green, same-frontier, or migrated.
4. Required focused tests, static guardrails, work validation, and diff hygiene
   pass.
5. The package has a truthful Commit And Push Ledger before closure.
