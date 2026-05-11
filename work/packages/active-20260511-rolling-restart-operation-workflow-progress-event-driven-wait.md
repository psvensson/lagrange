# Rolling Restart Operation Workflow Progress Event Driven Wait

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-11",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-event-driven-wait-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-event-driven-wait-fix/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "rebalancer_handoff",
  "dominantReason": "priority_recovery_event_driven_wait",
  "currentState": "The package added owner-lane-held dispatch-pending re-entry coverage and changed priority recovery re-entry scheduling so a held operation-owner lane arms a bounded remote handoff follow-up instead of dropping the wake. Focused tests, touched-file guardrails, work validation, and diff hygiene passed. The representative rolling-restart rerun still failed 0/1, but the first frontier migrated from operation_workflow_owner / workflow_progress to operation_workflow_owner / rebalancer_handoff with dominant source reason priority_recovery_rebalancer_handoff_retry_scheduled for control_plane_publications-p1 and sql_transaction_participants-p1.",
  "nextAction": "Open the next focused package on operation_workflow_owner / rebalancer_handoff to explain, repair, or classify the priority_recovery_rebalancer_handoff_retry_scheduled retry frontier exposed by the event-driven-wait fix.",
  "proof": [
    "npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix-v2.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix-v2.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix-v2.report.json",
    "node --test test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner*.js src/control-plane/priority-recovery-snapshot*.js",
    "node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner*.js src/control-plane/priority-recovery-snapshot*.js",
    "npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-7-stage-5.js src/rebalancer/operation-workflow-owner.js",
    "npm run work:current-blocker",
    "npm run work:validate",
    "git diff --check",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-event-driven-wait-fix.report.json --fast-local --verbose",
    "npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-event-driven-wait-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-event-driven-wait-fix.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-after-event-driven-wait-fix.report.json",
    "npm run work:model-ledger -- record --package work/packages/active-20260511-rolling-restart-operation-workflow-progress-event-driven-wait.md --model gpt-5.3-codex --reasoning-effort high --task-class implementation --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/cross-boundary-causal-edge --escalated false --bailout-reason none --outcome migrated --validation-status passed --correction-loops 1 --review-findings 0 --notes ..."
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "work/packages/active-20260511-rolling-restart-operation-workflow-progress-event-driven-wait.md",
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
      "event-driven wait evidence requires changes outside operation_workflow_owner or priority recovery snapshots",
      "representative proof restores topology_publication_owner or startup_active_gate_owner as the direct blocker",
      "runtime implementation would need Pro or Enterprise features"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If retryable event-driven workflow progress is repaired or classified, priority_recovery_partition_progress should reduce, converge, or migrate away from operation_workflow_owner / workflow_progress before startup active-gate snapshot coverage is treated as direct.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix-v2.report.json",
    "expectedCausalModelChange": "The recovering_in_flight event-driven wait either advances, becomes a non-frontier retryable state, or migrates to a new named owner boundary.",
    "representativeOutcome": "migrated",
    "causalDebt": "The workflow_progress event-driven wait seam now has focused owner-lane-held re-entry coverage and no longer remains the representative boundary. The remaining rolling-restart debt belongs to operation_workflow_owner / rebalancer_handoff, where a remote handoff retry remains scheduled for control_plane_publications-p1 and sql_transaction_participants-p1.",
    "crossBoundaryReview": "Required before implementing the successor because the representative rerun migrated from workflow_progress event-driven wait to operation_workflow_owner / rebalancer_handoff retry scheduling."
  },
  "predecessor": "work/packages/done-20260511-rolling-restart-topology-publication-convergence-published-pending.md"
}
-->

Opened after the publication-convergence package made `publication_ack_convergence`
satisfied/non-frontier and exposed retryable `priority_recovery_partition_progress`
as the first topology frontier.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix-v2.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-current-release-gate-after-publication-convergence-fix-v2/rolling-restart/`.
3. Baseline frontier edge: `priority_recovery_partition_progress`.
4. Baseline owner and boundary: `operation_workflow_owner / workflow_progress`.
5. Baseline frontier state: `retryable`.
6. Baseline dominant reason: `priority_recovery_event_driven_wait`.
7. Baseline unresolved semantic state: `recovering_in_flight`.
8. Baseline blocked partitions: `replica_operations-p1` and `sql_write_operations-p1`.
9. Closure report:
   `test-output/reports/rolling-restart-current-release-gate-after-event-driven-wait-fix.report.json`.
10. Closure frontier edge: `priority_recovery_partition_progress`.
11. Closure owner and boundary: `operation_workflow_owner / rebalancer_handoff`.
12. Closure state: `retryable` / migrated.
13. Closure source reason: `priority_recovery_rebalancer_handoff_retry_scheduled`.
14. Closure blocked partitions: `control_plane_publications-p1` and
    `sql_transaction_participants-p1`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` under AGPL-owned rows:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Edition matrix status: Community / AGPL repo.

## In Scope

1. Freeze the current retryable workflow-progress witness and explain output.
2. Add or extend the smallest operation-workflow owner regression or blocker
   probe for `recovering_in_flight` / `event_driven` retryability remaining a
   frontier.
3. Repair or classify why retryable workflow progress remains first frontier
   after publication convergence is satisfied.
4. Preserve publication convergence as satisfied/non-frontier unless fresh
   topology evidence restores it as direct.
5. Record or repair raw distributed-failure presentation residuals only if they
   affect the canonical owner-boundary handoff.
6. Rerun representative `rolling-restart --fast-local`.

## Out Of Scope

1. Reopening publication convergence, workflow timeout, rebalancer handoff,
   operation scheduling, or startup active-gate packages unless fresh evidence
   restores one as the first frontier.
2. Harness timeout increases or presentation-only relabeling that hides owner
   evidence.
3. Phase `0.5`, Phase `1.0`, Pro, or Enterprise work.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/cross-boundary-causal-edge`
- Owned files: operation workflow owner workflow-progress logic, priority
  recovery snapshot evidence, focused rebalancer tests, affected failure-bundle
  presentation if required, this package file, sprint/current-blocker handoff
  files, and model-ledger evidence.
- Forbidden files: startup active-gate owner implementation, harness timeout
  configuration, unrelated archived rolling-restart packages, Pro or Enterprise
  surfaces.
- Frozen decisions: this package targets the retryable workflow-progress
  event-driven frontier only; startup snapshot coverage remains downstream until
  priority progress closes or migrates.
- Escalation triggers: event-driven wait evidence requires changes outside
  `operation_workflow_owner` or priority recovery snapshots; representative
  proof restores topology publication or startup active-gate ownership as the
  direct blocker; runtime implementation would need Pro or Enterprise features.
- Focused proof: topology explain for `priority_recovery_partition_progress`,
  distributed-failure analysis, focused operation-workflow owner regression,
  touched-file guardrails, and one representative rolling-restart rerun.

## Causal Governance

- Causal hypothesis: if retryable event-driven workflow progress is repaired or
  classified, `priority_recovery_partition_progress` should reduce, converge, or
  migrate away from `operation_workflow_owner / workflow_progress` before startup
  active-gate snapshot coverage is treated as direct.
- Stop-condition check:
  `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix-v2.report.json`.
- Expected causal-model change: the `recovering_in_flight` event-driven wait
  advances, becomes a non-frontier retryable state, or migrates to a new named
  owner boundary.
- Representative outcome: `migrated`.
- Causal debt: workflow-progress event-driven wait now has focused owner-lane
  held re-entry coverage; remaining rolling-restart debt belongs to
  `operation_workflow_owner / rebalancer_handoff`.
- Cross-boundary review: required before implementing the successor because the
  representative rerun migrated from workflow-progress event-driven wait to
  rebalancer handoff retry scheduling.

## Hotspots

1. `src/rebalancer/operation-workflow-owner*.js`
2. `src/control-plane/priority-recovery-snapshot*.js`
3. `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
4. `test/distributed/harness/failure-bundle-segment-4.js`
5. `test/distributed/harness/__tests__/failure-bundle-core-10-test-cases.js`
6. `scripts/analyze-topology-convergence.js` only if presentation evidence is
   proven stale.

## Boundary Contract

Baseline semantic owner:
`operation_workflow_owner / workflow_progress`.

Closure semantic owner:
`operation_workflow_owner / rebalancer_handoff`.

Baseline canonical evidence:
`priority_recovery_partition_progress`, `recovering_in_flight`,
`priority_recovery_event_driven_wait`, blocked partitions
`replica_operations-p1` and `sql_write_operations-p1`, and next action evidence
from the priority recovery summary.

Closure canonical evidence:
`priority_recovery_partition_progress`, `operation_workflow_owner /
rebalancer_handoff`, `priority_recovery_rebalancer_handoff_retry_scheduled`,
blocked partitions `control_plane_publications-p1` and
`sql_transaction_participants-p1`, with retryable event-driven recovery still
in flight.

Allowed consumers:
operation workflow owner, priority recovery diagnostics, topology convergence
analysis, distributed failure summary, failure-bundle/reporting surfaces, and
the rolling-restart release gate.

Forbidden reinterpretations:

1. Do not treat retryable operation workflow progress or handoff retry
   scheduling as startup active-gate snapshot coverage while priority recovery
   remains the frontier.
2. Do not restore publication convergence as the first frontier unless topology
   evidence names it directly.
3. Do not hide the blocker with a harness timeout or presentation relabel.
4. Do not implement Pro or Enterprise behavior.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent workflow-event-review (`019e0c68-e8c8-7439-af9f-26ec2e9ef1d0`) reviewed
      `work/packages/done-20260511-rolling-restart-topology-publication-convergence-published-pending.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent workflow-event-fix (`019e0c6c-15ef-75a4-aec9-2acdc00dd915`) fixed
      `work/packages/done-20260511-rolling-restart-topology-publication-convergence-published-pending.md`.
- [x] Implementation subagent recorded:
      Agent workflow-event-implement (`019e0c70-28e5-7850-9de6-a76d00a9db94`) implemented
      `work/packages/active-20260511-rolling-restart-operation-workflow-progress-event-driven-wait.md`.

## Static Drift Ledger

Preflight:

1. Baseline artifact analysis confirms the current frontier is retryable
   `operation_workflow_owner / workflow_progress`.
2. Review subagent required predecessor metadata and residual presentation repair
   before this package started.
3. Fix subagent recorded the raw distributed-failure classification residual as
   presentation-only debt.
4. Runtime/test touched-file guardrails must be run before and after any runtime
   implementation.

Closure:

1. Focused owner regression passed.
2. Touched-file guardrails passed for the changed operation-workflow owner
   files.
3. Representative `rolling-restart --fast-local` migrated to
   `operation_workflow_owner / rebalancer_handoff`.

## Validation

Required implementation validation:

1. Baseline evidence:
   `npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix-v2.report.json`.
2. Baseline topology explain:
   `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix-v2.report.json --explain priority_recovery_partition_progress`.
3. Baseline distributed-failure analysis:
   `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix-v2.report.json`.
4. Focused operation-workflow progress event-driven regression or blocker probe.
5. Touched-file syntax, literal, decision-boundary, runtime-grammar, and diff
   hygiene guardrails.
6. `npm run work:current-blocker`.
7. `npm run work:validate`.
8. Representative
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-event-driven-wait-fix.report.json --fast-local --verbose`.


## Closure Evidence

1. Focused regression:
   `node --test test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
   passed with 65 tests.
2. Runtime owner-path guardrails passed for touched operation-workflow owner
   files, including literal, decision-boundary, and runtime-grammar checks.
3. `npm run work:current-blocker`, `npm run work:validate`, and
   `git diff --check` passed before the representative rerun.
4. Representative rerun command:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-event-driven-wait-fix.report.json --fast-local --verbose`.
   Result: failed `0/1` after `127998ms`, but migrated from
   `operation_workflow_owner / workflow_progress` to
   `operation_workflow_owner / rebalancer_handoff`.
5. Closure topology explain names `priority_recovery_partition_progress`, owner
   `operation_workflow_owner`, boundary `rebalancer_handoff`, state `retryable`,
   and dominant source reason
   `priority_recovery_rebalancer_handoff_retry_scheduled`.
6. Closure distributed-failure analysis reports active progress `3/5`, snapshot
   coverage `2/5`, priority recovery `needs_operation|recovering_in_flight`,
   and dominant reason `priority_recovery_rebalancer_handoff_retry_scheduled`.

## Done When

1. The event-driven workflow-progress witness has a focused regression or
   replayable blocker probe.
2. `operation_workflow_owner / workflow_progress` either converges, emits one
   canonical reason it remains retryable/blocked, or migrates to a new named
   owner boundary.
3. Representative `rolling-restart --fast-local` is rerun and the outcome is
   recorded as green, same-frontier, or migrated.
4. Required focused tests, static guardrails, work validation, and diff hygiene
   pass.
5. The package has a truthful Commit And Push Ledger before closure.
