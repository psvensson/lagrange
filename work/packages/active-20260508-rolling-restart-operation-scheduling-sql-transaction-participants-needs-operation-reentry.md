# Rolling Restart Operation Scheduling Sql Transaction Participants Needs Operation Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_partitions_not_spread",
  "currentState": "The sql_transactions-p1 no-serial-wait operation-scheduling gap is now covered by a focused regression and the representative rerun created recovery operation ab74c173-78e1-4227-a15c-580c22a97930, leaving sql_transactions-p1 as spread_satisfied_in_flight. The representative rolling-restart run still failed after 137324ms with 4/5 nodes ACTIVE and migrated the frontier to operation_workflow_owner / workflow_progress: sql_write_operations-p1 is recovering_in_flight with actuationState persisted_not_dispatched, nextRequiredAction advance_existing_operation, waitMode event_driven, workflowProgressPhaseId dispatch_pending, operationId 04b9e396-00b4-4ad7-abee-b9fac1c16f5d, and stepAgeMs 88969 over stepTimeoutMs 30000.",
  "nextAction": "Continue with a workflow-progress package or blocker probe for sql_write_operations-p1 persisted_not_dispatched dispatch_pending operation 04b9e396-00b4-4ad7-abee-b9fac1c16f5d, tracing why the workflow owner does not advance or timeout-reconcile the pending operation.",
  "proof": [
    "npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-remote-handoff-retry-stale-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-remote-handoff-retry-stale-fix.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-after-remote-handoff-retry-stale-fix.report.json",
    "Focused owner-decision regression for sql_transaction_participants-p1 create_recovery_operation scheduling",
    "Focused owner-decision regression for sql_transactions-p1 no-serial-wait create_recovery_operation scheduling",
    "Touched-file literal, decision-boundary, runtime-grammar, syntax, and diff hygiene guardrails",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix.report.json --fast-local --verbose",
    "npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix.report.json"
  ],
  "touchedFiles": [
    "src/rebalancer/unified-rebalancer-segment-4-stage-1.js",
    "src/rebalancer/unified-rebalancer-segment-4-stage-2.js",
    "src/rebalancer/unified-rebalancer-segment-4-stage-3.js",
    "src/rebalancer/unified-rebalancer-segment-4-stage-shared.js",
    "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
    "work/packages/active-20260508-rolling-restart-operation-scheduling-sql-transaction-participants-needs-operation-reentry.md",
    "work/packages/done-20260508-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260508-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md"
}
-->

Opened on May 8, 2026 after the stale remote-handoff retry package moved the
representative `rolling-restart` gate from
`operation_workflow_owner / rebalancer_handoff` to
`rebalancer_leader / operation_scheduling`.

## Current Evidence

1. Initial representative report:
   `test-output/reports/rolling-restart-current-release-gate-after-remote-handoff-retry-stale-fix.report.json`.
2. Initial playback directory:
   `test-output/reports/.playback/rolling-restart-current-release-gate-after-remote-handoff-retry-stale-fix/rolling-restart/`.
3. Result: failed after approximately `131751ms`.
4. Active gate: `3/5` nodes reached ACTIVE within `120000ms`.
5. Publication is `PUBLISHED`, `pendingAckCount=0`, and priority recovery
   invariants passed.
6. Frontier edge: `priority_recovery_partition_progress`.
7. Owner and boundary:
   `rebalancer_leader / operation_scheduling`.
8. Dominant reason:
   `priority_recovery_operation_scheduling_event_driven`.
9. Dominant witness:
   `sql_transaction_participants-p1`.
10. Dominant semantic state:
    `needs_operation`.
11. Dominant next required action:
    `create_recovery_operation`.
12. Dominant actuation state and wait mode:
    `action_required / event_driven`.
13. Dominant operation ids:
    none.
14. Dominant eligible node ids:
    `7493b0ab-a054-5fad-a91b-5e331db29304` and
    `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
15. Supporting blocked partition:
    `sql_write_operations-p1`, currently classified under
    `recovering_in_flight` with `advance_existing_operation`.

Latest representative rerun:

1. Representative report:
   `test-output/reports/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix/rolling-restart/`.
3. Result: failed after approximately `137324ms`.
4. Active gate: `4/5` nodes reached ACTIVE within `120000ms`.
5. Frontier edge: `priority_recovery_partition_progress`.
6. Owner and boundary migrated to:
   `operation_workflow_owner / workflow_progress`.
7. Dominant reason:
   `priority_partitions_not_spread`.
8. Dominant witness:
   `sql_write_operations-p1`.
9. Dominant semantic state:
   `recovering_in_flight`.
10. Dominant next required action:
    `advance_existing_operation`.
11. Dominant actuation state and wait mode:
    `persisted_not_dispatched / event_driven`.
12. Dominant workflow progress phase:
    `dispatch_pending`.
13. Dominant operation id:
    `04b9e396-00b4-4ad7-abee-b9fac1c16f5d`.
14. Dominant eligible node ids:
    `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` and
    `7493b0ab-a054-5fad-a91b-5e331db29304`.
15. Dominant operation age:
    `stepAgeMs=88969` over `stepTimeoutMs=30000`.
16. The prior `sql_transactions-p1` witness now has created operation
    `ab74c173-78e1-4227-a15c-580c22a97930` and is classified as
    `spread_satisfied_in_flight`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` under AGPL-owned rows:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Preserve the exact current artifact and operation-scheduling witness.
2. Trace the event-driven `create_recovery_operation` path for the selected
   `needs_operation` witness.
3. Add the narrowest focused owner-decision regression or blocker probe that
   reproduces the missing recovery-operation creation.
4. Repair only the rebalancer leader operation-scheduling boundary required to
   schedule that recovery operation.
5. Continue inside this package while the same
   `rebalancer_leader / operation_scheduling` owner boundary dominates and the
   next action remains `create_recovery_operation`.
6. Rerun focused owner tests, touched-file guardrails, and the representative
   `rolling-restart --fast-local` gate.

## Out Of Scope

1. Reopening `operation_workflow_owner / rebalancer_handoff` unless a fresh
   rerun restores it as the first frontier.
2. Reopening older `sql_write_operations-p1` stale-planning packages unless the
   current artifact proves the same stale-visibility witness still dominates
   after this package's direct scheduling proof.
3. Harness timeout increases or presentation-only relabeling.
4. Broad startup, publication, workflow-progress, transport, Pro, or Enterprise
   work.

## Boundary Contract

Semantic owner:
`rebalancer_leader / operation_scheduling`.

Canonical operation:
`create_recovery_operation` for a `needs_operation` priority-recovery witness.

Initial canonical partition:
`sql_transaction_participants-p1`.

Current canonical partition:
`sql_transactions-p1`.

Remaining representative blocker after this package:
`sql_write_operations-p1` under
`operation_workflow_owner / workflow_progress`.

Allowed consumers:
priority recovery diagnostics, topology convergence analysis, distributed
failure summary, and focused rebalancer owner tests.

Forbidden reinterpretations:

1. Do not treat `needs_operation` plus empty `operationIds` as workflow-owner
   progress debt.
2. Do not convert the missing operation into a harness timeout or readiness
   presentation issue while the owner witness still names operation scheduling.
3. Do not use supporting `sql_write_operations-p1` workflow-progress evidence
   to skip the dominant `sql_transaction_participants-p1` scheduling gap.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Meitner (`019e09df-ff04-7df2-a16b-edae73c5ad24`) reviewed
      `work/packages/done-20260508-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Chandrasekhar (`019e09e1-ef11-7fb1-a9c9-29f9866fd2ee`) fixed
      `work/packages/done-20260508-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md`.
- [x] Implementation subagent recorded:
      Agent Laplace (`019e09e7-0f65-7d20-93a4-100d7b6b5da0`) implemented
      `work/packages/active-20260508-rolling-restart-operation-scheduling-sql-transaction-participants-needs-operation-reentry.md`.
- [x] Continuation review subagent recorded:
      Agent Poincare (`019e09f5-5d8c-7f33-b94d-066fbba5269d`) reviewed
      `work/packages/active-20260508-rolling-restart-operation-scheduling-sql-transaction-participants-needs-operation-reentry.md`;
      result `fixes-required`.
- [x] Continuation fix subagent recorded:
      Agent Hypatia (`019e09f7-46c4-7a11-a7fd-a563c326784a`) fixed
      `work/packages/active-20260508-rolling-restart-operation-scheduling-sql-transaction-participants-needs-operation-reentry.md`.
- [x] Continuation implementation subagent recorded:
      Agent Linnaeus (019e09fa-3b86-7263-81cc-2e6a0d0aa952) implemented work/packages/active-20260508-rolling-restart-operation-scheduling-sql-transaction-participants-needs-operation-reentry.md.
- [x] Post-implementation review subagent recorded:
      Agent Nash (`019e0a15-fbd1-7543-8448-67563b3aaab9`) reviewed
      `work/packages/active-20260508-rolling-restart-operation-scheduling-sql-transaction-participants-needs-operation-reentry.md`;
      result `fixes-required`.
- [x] Review-fix subagent recorded:
      Agent Hilbert (`019e0a19-f014-73c1-8c8f-7a6565de2bb9`) fixed
      `work/packages/active-20260508-rolling-restart-operation-scheduling-sql-transaction-participants-needs-operation-reentry.md`.

## Residual Closure Inventory

- [x] Package is activated and the implementation subagent is recorded.
- [x] Current artifact evidence is preserved in the package and current-blocker
      snapshot.
- [x] The `sql_transaction_participants-p1` owner-decision fixture or blocker
      probe exists.
- [x] The `sql_transactions-p1` owner-decision fixture or blocker probe exists.
- [x] The operation-scheduling gap is fixed or the representative rerun
      migrates to one named owner boundary.
- [x] Nash's post-implementation review findings for the no-serial-wait bypass
      are fixed locally and await parent commit/push.
- [x] Touched-file static guardrails pass.
- [x] Representative `rolling-restart --fast-local` rerun passes or migrates
      to one named owner boundary.

## Static Drift Ledger

Preflight:

- [x] Relevant touched-file guardrails selected before runtime edits.
- [x] File-scoped baseline recorded for the selected source and test files.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No new touched-file decision-boundary, literal-owner, runtime-grammar, or
      diff hygiene violation remains.
- [x] Commit/push status is explicitly recorded below; the Nash review-fix
      slice is not committed or pushed by this session.

## Validation

Required implementation validation:

1. Focused owner-decision regressions or blocker probes for the
   `sql_transaction_participants-p1` and `sql_transactions-p1`
   `needs_operation` scheduling witnesses.
2. Focused rebalancer test file selected by the implementation subagent.
3. Touched-file literal, decision-boundary, runtime-grammar, syntax, and diff
   hygiene guardrails.
4. `npm run work:current-blocker`
5. `npm run work:validate`
6. Representative
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix.report.json --fast-local --verbose`

Implementation validation notes:

1. `node test/rebalancer/unified-rebalancer-part-5-2-stage-2.js` failed before
   the runtime fix on the new stale serial-wait current
   `sql_transaction_participants-p1` regression because no recovery operation
   was persisted.
2. `node test/rebalancer/unified-rebalancer-part-5-2-stage-2.js` passed after
   the runtime fix with `19/19` assertions.
3. `node --check src/rebalancer/unified-rebalancer-segment-4-stage-2.js`
   passed.
4. `node --check test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
   passed.
5. `node scripts/check-guideline-literals.js src/rebalancer/unified-rebalancer-segment-4-stage-2.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
   passed with `0` new literal-guideline violations and `0` inherited
   baseline violations.
6. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/unified-rebalancer-segment-4-stage-2.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
   passed with `0` decision-boundary guideline violations.
7. `npm run audit:runtime-grammar:file -- src/rebalancer/unified-rebalancer-segment-4-stage-2.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
   passed with `0` runtime-grammar-contract violations.
8. `git diff --check -- src/rebalancer/unified-rebalancer-segment-4-stage-2.js test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
   passed.
9. `npm run work:current-blocker` passed and regenerated
   `work/sprints/current-blocker.json` and `work/sprints/current-blocker.md`.
10. `npm run work:validate` passed after Agent Laplace was recorded as the
    implementation subagent and the focused commit/push ledger proof was added.
11. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix.report.json --fast-local --verbose`
    failed. The representative blocker stayed on
    `rebalancer_leader / operation_scheduling` and moved the dominant witness
    from `sql_transaction_participants-p1` to `sql_transactions-p1`.
12. `node test/rebalancer/unified-rebalancer-part-5-2-stage-2.js` failed
    before the continuation runtime fix on the new `sql_transactions-p1`
    no-serial-wait regression because no recovery operation was persisted when
    an unrelated ordinary priority recovery operation was already in flight.
13. `node test/rebalancer/unified-rebalancer-part-5-2-stage-2.js` passed after
    the continuation runtime fix with `21/21` assertions.
14. `node test/rebalancer/unified-rebalancer.test-part-2.js` passed with
    `38/38` assertions, preserving ordinary priority recovery serial gating for
    generic ordinary moves.
15. `node --check src/rebalancer/unified-rebalancer-segment-4-stage-1.js`,
    `node --check src/rebalancer/unified-rebalancer-segment-4-stage-3.js`,
    `node --check src/rebalancer/unified-rebalancer-segment-4-stage-shared.js`,
    and
    `node --check test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
    passed.
16. `node scripts/check-guideline-literals.js src/rebalancer/unified-rebalancer-segment-4-stage-1.js src/rebalancer/unified-rebalancer-segment-4-stage-2.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
    passed with `0` new literal-guideline violations and `0` inherited
    baseline violations.
17. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/unified-rebalancer-segment-4-stage-1.js src/rebalancer/unified-rebalancer-segment-4-stage-2.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
    passed with `0` decision-boundary guideline violations.
18. `npm run audit:runtime-grammar:file -- src/rebalancer/unified-rebalancer-segment-4-stage-1.js src/rebalancer/unified-rebalancer-segment-4-stage-2.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
    passed with `0` runtime-grammar-contract violations.
19. `git diff --check -- src/rebalancer/unified-rebalancer-segment-4-stage-1.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
    passed.
20. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix.report.json --fast-local --verbose`
    failed after `137324ms`. The `sql_transactions-p1` recovery operation was
    created and classified as `spread_satisfied_in_flight`; the remaining
    blocker migrated to `operation_workflow_owner / workflow_progress` on
    `sql_write_operations-p1` with `persisted_not_dispatched` /
    `advance_existing_operation`.
21. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix.report.json --explain priority_recovery_partition_progress`
    reported frontier `operation_workflow_owner / workflow_progress` with
    dominant reason `priority_partitions_not_spread` and blocked partition
    `sql_write_operations-p1`.
22. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix.report.json`
    summarized the representative failure as `0/1` passed,
    `rootCauseClass=topology`, and dominant reason
    `priority_partitions_not_spread`.
23. `npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix.report.json`
    reported current semantic owner `operation_workflow_owner`, current
    boundary `workflow_progress`, and dominant reason
    `priority_partitions_not_spread`.
24. `npm run work:current-blocker` passed and regenerated
    `work/sprints/current-blocker.json` and `work/sprints/current-blocker.md`
    with the migrated workflow-progress blocker.
25. `npm run work:validate` passed with
    `Work tracker validation OK for 12 file(s).`
26. `git diff --check -- src/rebalancer/unified-rebalancer-segment-4-stage-1.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js test/rebalancer/unified-rebalancer-part-5-2-stage-2.js work/packages/active-20260508-rolling-restart-operation-scheduling-sql-transaction-participants-needs-operation-reentry.md work/sprints/current-blocker.json work/sprints/current-blocker.md`
    passed.
27. Agent Nash (`019e0a15-fbd1-7543-8448-67563b3aaab9`) reviewed this
    package and found the no-serial-wait bypass still promoted absent
    coordinator serial-wait evidence to explicit empty evidence.
28. `node test/rebalancer/unified-rebalancer-part-5-2-stage-2.js` failed
    before the Nash review-fix runtime change on the new missing serial-wait
    evidence assertion: expected `0` created operations, actual `1`.
29. `node test/rebalancer/unified-rebalancer-part-5-2-stage-2.js` passed
    after the Nash review-fix runtime change with `22/22` assertions. The
    focused regression now proves missing serial-wait evidence waits behind an
    ordinary priority operation, while explicit empty `serialWaitOperationIds`
    still schedules `sql_transactions-p1`.
30. `node test/rebalancer/unified-rebalancer.test-part-2.js` passed with
    `38/38` assertions.
31. `node --check src/rebalancer/unified-rebalancer-segment-4-stage-1.js`,
    `node --check src/rebalancer/unified-rebalancer-segment-4-stage-3.js`, and
    `node --check test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
    passed.
32. `node scripts/check-guideline-literals.js src/rebalancer/unified-rebalancer-segment-4-stage-1.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
    passed with `0` new literal-guideline violations and `0` inherited
    baseline violations.
33. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/unified-rebalancer-segment-4-stage-1.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
    passed with `0` decision-boundary guideline violations.
34. `npm run audit:runtime-grammar:file -- src/rebalancer/unified-rebalancer-segment-4-stage-1.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
    passed with `0` runtime-grammar-contract violations.
35. `git diff --check -- src/rebalancer/unified-rebalancer-segment-4-stage-1.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js test/rebalancer/unified-rebalancer-part-5-2-stage-2.js work/packages/active-20260508-rolling-restart-operation-scheduling-sql-transaction-participants-needs-operation-reentry.md`
    passed.
36. `npm run work:validate` passed with
    `Work tracker validation OK for 13 file(s).`

## Commit And Push Ledger

Prior implementation slice ledger before the Nash review-fix:

- Focused package commit: 1236436a
- Pushed to: origin/codex/pending-ack-eligibility-filter
- Commit contains only package-owned files/package-status/allowed sprint handoff: yes

Current Nash review-fix slice: pending parent commit and push after
verification.

## Done When

1. The current artifact's `sql_transaction_participants-p1` missing operation
   has a focused reproduction and a fixed owner path, or the representative
   rerun migrates to a different named owner boundary.
2. The package records whether the representative scenario passed, stayed on
   `rebalancer_leader / operation_scheduling`, or migrated.
3. The package has a truthful Commit And Push Ledger before closure.
