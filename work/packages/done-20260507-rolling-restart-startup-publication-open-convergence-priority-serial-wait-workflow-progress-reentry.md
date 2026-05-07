# Rolling Restart Startup Publication Open Convergence Priority Serial-Wait Workflow Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-recovery-visibility-wakeup-20260507T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-priority-recovery-visibility-wakeup-20260507T000000Z/rolling-restart/",
  "owner": "Priority recovery operation scheduling after failed/removed visibility wake-up repair and same-artifact owner reconciliation",
  "boundary": "Rebalancer leader / operation_scheduling / startup active gate support",
  "dominantReason": "priority_recovery_operation_scheduling_event_driven",
  "currentState": "The failed/removed same-partition visibility wake-up repair is now proved, the same-artifact owner split is closed across frontier, explain, and graph metadata, and the direct lower-owner target-reservation seam is closed as well. The representative rerun no longer terminates on rebalancer_leader / operation_scheduling create_recovery_operation; it migrates to operation_workflow_owner / workflow_progress in epoch 4 PUBLISHED, where sql_write_operations-p1 is blocked by priority_operation_serial_wait / wait_for_operation_progress with sql_transaction_participants-p1 supporting in-flight context.",
  "nextAction": "Continue in work/packages/active-20260507-rolling-restart-topology-priority-recovery-workflow-progress-serial-wait-reentry.md for the migrated operation_workflow_owner / workflow_progress serial-wait transition seam.",
  "proof": [
    "Focused epoch-3 PUBLISHED create_recovery_operation witness for sql_write_operations-p1 with replica_operations-p1 retained as supporting context",
    "Focused lower-owner regression for the selected operation-scheduling seam",
    "Focused lower-owner regression for the selected canonical seam",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and active-gate frontier analysis"
  ],
  "touchedFiles": [
    "src/diagnostics/topology-convergence-graph.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/__fixtures__/topology-convergence/priority-dominant-witness-owner-boundary.fixture.json",
    "work/packages/done-20260507-rolling-restart-startup-publication-open-convergence-priority-serial-wait-workflow-progress-reentry.md",
    "src/rebalancer/replica-operation-repository.js",
    "src/rebalancer/replica-operation-repository-read-methods.js",
    "test/rebalancer/replica-operation-repository.test.js",
    "test/distributed/harness/priority-recovery-summary-normalization.js",
    "test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js",
    "test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js",
    "src/rebalancer/operation-workflow-owner-segment-5-stage-5.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "src/rebalancer/unified-rebalancer-segment-1.js",
    "src/rebalancer/unified-rebalancer-segment-4-stage-3.js",
    "test/rebalancer/priority-follow-up-target-readiness.test.js",
    "test/rebalancer/priority-recovery-visibility-wakeup.test.js",
    "work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-priority-recovery-operation-scheduling-post-publication-closure-reentry.md",
  "closed": "2026-05-07",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260507-rolling-restart-topology-priority-recovery-workflow-progress-serial-wait-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Priority Recovery Operation Scheduling Post-Publication Closure Reentry](./done-20260507-rolling-restart-topology-priority-recovery-operation-scheduling-post-publication-closure-reentry.md)
closed by migration. The observer-only authoritative-visibility repair no
longer leaves the representative blocker on post-publication rebalancer
scheduling. The follow-on same-artifact owner split is now closed as well:
the report, playback failure bundle, and topology-convergence graph all agree
that the live epoch `3` `PUBLISHED` blocker sits on
`rebalancer_leader / operation_scheduling` for
`sql_write_operations-p1 -> create_recovery_operation`, while
`replica_operations-p1` remains supporting
`operation_workflow_owner / workflow_progress`
`recovering_in_flight -> wait_for_operation_progress` context only. The next
worker should keep the closed diagnostics reclassification intact and reduce
the remaining event-driven no-operation seam at the lower owner.

## Current Evidence

Items `1` through `17` below record the closed migration path into the current
frontier. Items `18` through `22` are the live handoff for the next worker.

1. Representative report:
   `test-output/reports/rolling-restart-after-priority-recovery-observer-visibility-20260507T000000Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-priority-recovery-observer-visibility-20260507T000000Z/rolling-restart/`.
3. Result: failed after `133.3s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Publication convergence initially carried the direct blocker: epoch `3` `OPEN`,
   `pendingAck=1` on `ebc4...`, missing-published node ids
   `11601...|8be8...`, snapshot coverage `3/5`, and recovery protocol state
   `publication_pending`.
6. Active-gate readiness reports `35a...` degraded under
   `OBSERVABILITY_BACKLOG` and
   `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`, while `7493...` falls back to a
   readiness-probe-timeout witness.
7. Focused owner-read witness extraction showed the canonical source split:
   the selected publication convergence diagnostics still carried same-epoch
   `requiredAckNodeIds` for `35a...|7493...|ebc4...`, but the owner-read
   publication convergence answer dropped them to empty-list count-only ACK
   debt before startup/readiness consumers observed the gate.
8. The selected lower owner boundary is therefore publication ACK persistence
   in the owner-read merge, not generic degraded readiness or startup active
   gate reachability.
9. Lower priority-recovery evidence is now supporting only:
   `sql_write_operations-p1` sits in semantic state `needs_operation`, but it
   no longer owns `create_recovery_operation`; it waits on
   `priority_operation_serial_wait` behind `sql_transactions-p1` operation
   `6d1346a9-2655-427e-8d80-31fbc193919d`.
10. The publication ACK repair preserves the stronger same-epoch required-ACK node
    list through owner-read planning answers and keeps the adjacent count-only
    ACK semantics unchanged when the provided witness only offers an empty ACK
    list.
11. The fresh representative rerun in
    `test-output/reports/rolling-restart-after-publication-ack-owner-read-required-ack-upgrade-20260507T000000Z.report.json`
    no longer reports epoch `3` `OPEN` `pendingAck=1`; it regresses to epoch
    `2` `PUBLISHED`, snapshot coverage `2/5`, missingPublished=`3`, inactive
    node `11601...`, and topology frontier ownership on
    `operation_workflow_owner / workflow_progress` with
    `priority_recovery_workflow_timeout_transition_deferred`.
12. The latest representative rerun in
    `test-output/reports/rolling-restart-after-entity-visibility-timeout-progress-20260507T000000Z.report.json`
    preserves the epoch `2` `PUBLISHED` frontier but changes the lower witness
    shape: `sql_transactions-p1` remains `eligible_but_no_operation_created`,
    while `sql_write_operations-p1` now holds operation
    `d72a4fa3-c936-4a58-8a09-753e13041472` in workflow step `PENDING` / status
    `pending`, visible from `system_table_cache`, even though the replay logs
    show `replica_operations` row fetch by that `operation_id` returning `No row
    found for CDC update`.
13. The stale creating-row seam is therefore reduced, but the direct boundary
    stays on workflow-progress because one mixed stalled carrier still survives
    beside the no-operation-create path.
14. The latest representative rerun in
    `test-output/reports/rolling-restart-after-entity-visibility-authoritative-reconcile-20260507T000000Z.report.json`
    failed after `135.2s`, but it closes the cache-visible `PENDING`
    authoritative-visibility seam by migration. The fresh frontier remains on
    `operation_workflow_owner / workflow_progress` at epoch `2` `PUBLISHED`
    with snapshot coverage `3/5`, pending ACK count `0`, and dominant reason
    `priority_recovery_rebalancer_handoff_stalled`.
15. The normalized progress classes now narrow the live blocker further:
    `sql_transactions-p1` is the only partition still classified under
    `operation_created_but_no_step_transitions`, paired with
    `publication_recovery_eligible_but_coordinator_excludes_node`, while
    `sql_write_operations-p1` has moved to supporting
    `blocked_unclassified` evidence.
16. The next focused proof surface is therefore the rebalancer handoff /
    no-step-transition seam around operation
    `d94a9991-08ec-4d27-9817-9e33d8fd8baf` on `sql_transactions-p1`, with
    operation `857380c7-3701-4d7d-a97f-3dcc90d7886e` on `sql_write_operations-p1`
    retained as adjacent supporting context rather than the primary repair
    target.
17. The dominant-witness selector and failure-bundle presentation now preserve
    direct workflow blockers ahead of terminal rebalancer follow-up carriers in
    focused harness proof.
18. The fresh representative rerun in
    `test-output/reports/rolling-restart-after-priority-recovery-visibility-wakeup-20260507T000000Z.report.json`
    proves the failed/removed same-partition visibility wake-up repair without
    reopening the earlier authoritative-read or dominant-witness seams.
19. The new artifact fails after `132.5s` at epoch `3` `PUBLISHED` with
    snapshot coverage `4/5`, missing-published count `2`, pending ACK count
    `0`, and downstream startup active-gate timeout support only.
20. `npm run analyze:distributed-failure` selects normalized dominant reason
    `priority_recovery_operation_scheduling_event_driven`, with
    `sql_write_operations-p1` the only remaining
    `eligible_but_no_operation_created` partition under semantic state
    `needs_operation`, current owner `rebalancer_leader`, boundary
    `operation_scheduling`, wait mode `event_driven`, and next action
    `create_recovery_operation`.
21. The focused topology-convergence diagnostics regression closes the same-
    artifact owner split by making frontier, explain, and graph metadata all
    inherit `priorityRecoveryProgressSummary(.dominantWitness)` when it
    supplies the canonical owner/boundary override. The report and matching
    playback now also select `rebalancer_leader / operation_scheduling` as
    the first frontier, and the focused fixture covers the live nested report
    shape rather than the earlier root-level fallback.
22. The next focused proof surface is therefore the epoch `3` `PUBLISHED`
    lower-owner `create_recovery_operation` seam for
    `sql_write_operations-p1`, with `replica_operations-p1` retained as
    supporting `recovering_in_flight -> wait_for_operation_progress`
    context rather than the primary repair target.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Preserve the closed same-artifact owner reconciliation and dominant-witness
   diagnostics regression from this package.
2. Add one focused regression for the selected canonical
   `rebalancer_leader / operation_scheduling` seam.
3. Repair or reclassify that selected seam without reopening the closed
   operation-scheduling visibility wake-up path.
4. Preserve the closed authoritative-read, dominant-witness, and failed/removed
   visibility wake-up repairs from the predecessor steps in this package.
5. Rerun focused tests, touched-file guardrails, and one representative
   `rolling-restart` scenario.

## Out Of Scope

1. Reopening the predecessor post-publication rebalancer scheduling package as
   a separate slice while this package still owns the remaining
   `sql_write_operations-p1 -> create_recovery_operation` repair.
2. Broad matrix continuation before this five-node representative blocker
   closes or migrates again.
3. Harness-only timeout increases or blocker relabeling that hide the current
   startup/publication convergence debt.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `rebalancer_leader / operation_scheduling` now owns the direct boundary for
   the live epoch `3` `PUBLISHED`
   `sql_write_operations-p1 -> create_recovery_operation` seam.
2. `operation_workflow_owner / workflow_progress` remains supporting evidence
   only for `replica_operations-p1`
   `recovering_in_flight -> wait_for_operation_progress` unless a fresh
   representative artifact again promotes it above the selected
   operation-scheduling witness.
3. `startup_active_gate_owner / snapshot_coverage` remains supporting evidence
   while active-gate timeout still depends on unresolved priority-recovery
   partitions and does not itself become the earliest frontier.
4. `topology publication convergence / startup active gate` stays closed
   unless a fresh representative artifact again restores
   `publication_epoch_pending` or direct ACK convergence ownership.

Canonical contract shape:

1. For the live epoch `3` `PUBLISHED` artifact,
   `sql_write_operations-p1` must either create the required recovery
   operation or surface one canonical `rebalancer_leader` reason why creation
   remains deferred.
2. `replica_operations-p1` remains supporting
   `recovering_in_flight -> wait_for_operation_progress` context only unless a
   fresh representative artifact again promotes it to the direct frontier.
3. Priority-recovery blockers must not preserve competing owner and boundary
   claims for the same representative artifact once the witness extraction and
   diagnostics reclassification are complete.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent `Popper` (`019e0321-b06b-7af1-adbd-4392b6fd5f94`) reviewed
      `work/packages/done-20260507-rolling-restart-topology-priority-recovery-operation-scheduling-post-publication-closure-reentry.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent `Parfit` (`019e032b-28af-7f21-9a13-7042d194cfff`) fixed
      `work/packages/done-20260507-rolling-restart-topology-priority-recovery-operation-scheduling-post-publication-closure-reentry.md`.
- [x] Implementation subagent recorded:
      Agent `Franklin` (`019e0339-ff2c-7d11-a84a-5ea86966a96c`) implemented
      `work/packages/done-20260507-rolling-restart-startup-publication-open-convergence-priority-serial-wait-workflow-progress-reentry.md`.
- [x] Review subagent recorded:
      Agent `Zeno` (`019e0383-07c6-7910-b574-554e54b07f3d`) reviewed
      `work/packages/done-20260507-rolling-restart-startup-publication-open-convergence-priority-serial-wait-workflow-progress-reentry.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent `Archimedes` (`019e0386-3b4c-7572-8108-5f91fb77135c`) fixed
      `work/packages/done-20260507-rolling-restart-startup-publication-open-convergence-priority-serial-wait-workflow-progress-reentry.md`.
- [x] Implementation subagent recorded:
      Agent `Bacon` (`019e0391-21dc-73a1-a4f5-3958e197fe16`) implemented
      `work/packages/done-20260507-rolling-restart-startup-publication-open-convergence-priority-serial-wait-workflow-progress-reentry.md`.
- [x] Review subagent recorded:
      Agent `Dewey` (`019e0398-ec25-7f42-9fde-55d3006ba98d`) reviewed
      `work/packages/done-20260507-rolling-restart-startup-publication-open-convergence-priority-serial-wait-workflow-progress-reentry.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent `Jason` (`019e039e-e4bd-72a2-a960-f6fcaa7a3f14`) fixed
      `work/packages/done-20260507-rolling-restart-startup-publication-open-convergence-priority-serial-wait-workflow-progress-reentry.md`.
- [x] Implementation subagent recorded:
      Agent `Singer` (`019e03a7-1b35-7e32-b0e9-9cd8af71e34c`) implemented
      `work/packages/done-20260507-rolling-restart-startup-publication-open-convergence-priority-serial-wait-workflow-progress-reentry.md`.

## Commit And Push Ledger

- Focused package commit: `061a2815`
- Pushed to: `origin/codex/pending-ack-eligibility-filter`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`

## Residual Closure Inventory

- [x] Extract the epoch `3` `OPEN` publication/startup witness fixture in
      package form.
- [x] Decide the direct lower owner: publication ACK persistence inside the
      owner-read merge.
- [x] Add the focused regression for the selected owner path.
- [x] Repair the selected convergence boundary.
- [x] Rerun focused tests and touched-file static guardrails.
- [x] Rerun one representative `rolling-restart` scenario and record whether
      the blocker closes or migrates again.
- [x] Extract the epoch `2` `PUBLISHED` workflow-progress witness for the
      migrated frontier.
- [x] Add the focused regression for the selected workflow-progress timeout
      seam around cache-visible `PENDING` create witnesses with no
      authoritative row.
- [x] Repair the selected workflow-progress boundary and confirm whether the
      representative blocker closes or migrates again with proof.
- [x] Extract the focused rebalancer-handoff witness for
      `sql_transactions-p1` `operation_created_but_no_step_transitions` and
      `publication_recovery_eligible_but_coordinator_excludes_node`, with
      `sql_write_operations-p1` retained only as supporting
      `blocked_unclassified` context.
- [x] Add the focused workflow-progress regression for the selected
      `priority_recovery_rebalancer_handoff_stalled` seam.
- [x] Repair the selected rebalancer-handoff workflow-progress boundary and
      rerun representative proof.
- [x] Extract the focused epoch-5 `PUBLISHED` operation-scheduling witness for
      `replica_operations-p1` `eligible_but_no_operation_created`, with
      `sql_transactions-p1` and `sql_write_operations-p1` retained as
      supporting no-operation carriers.
- [x] Add the focused priority-recovery operation-scheduling regression for
      the selected `create_recovery_operation` seam.
- [x] Repair the selected operation-scheduling boundary or migrate again with
      proof.
- [x] Extract the focused epoch-3 `PUBLISHED` owner-split witness for
      `sql_write_operations-p1`
      `eligible_but_no_operation_created -> create_recovery_operation` and
      `replica_operations-p1`
      `recovering_in_flight -> wait_for_operation_progress`.
- [x] Decide one canonical direct owner, boundary, wait mode, and next action
      for the same representative artifact.
- [x] Add the focused lower-owner regression for the selected
      `create_recovery_operation` seam.
- [x] Repair the selected canonical boundary or migrate again with proof.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [x] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [x] Any out-of-scope inherited violation has a linked follow-on package.

## Validation

1. `npx tap test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
   passed.
2. `npx tap test/rebalancer/priority-follow-up-target-readiness.test.js`
   passed.
3. `npx tap test/rebalancer/unified-rebalancer-part-5-2-stage-4.js` passed.
4. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-5-stage-4.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
   returned `0 decision-boundary guideline violations`.
5. `node scripts/check-runtime-grammar-contracts.js src/rebalancer/operation-workflow-owner-segment-5-stage-4.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
   returned `0 runtime-grammar-contract violations`.
6. `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-5-stage-4.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
   returned `0 new literal-guideline violations` and matched `0` inherited
   baseline violations.
7. `git diff --check -- src/rebalancer/operation-workflow-owner-segment-5-stage-4.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
   passed.
8. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-priority-recovery-observer-visibility-20260507T000000Z.report.json --fast-local --verbose`
   failed after `133.3s`, but moved the representative blocker away from
   post-publication rebalancer scheduling to startup/publication convergence
   at epoch `3` `OPEN`.
9. `npx tap test/control-plane/control-plane-readiness-service-owner-read-count-only-ack-upgrade.test.js test/control-plane/control-plane-readiness-service-part-4-stage-2.js test/control-plane/control-plane-readiness-service-part-4-stage-3.js`
   passed.
10. `node scripts/check-guideline-decision-boundaries.js src/control-plane/control-plane-readiness-service-segment-4-stage-1.js src/control-plane/control-plane-readiness-service-segment-4-stage-3.js test/control-plane/control-plane-readiness-service-owner-read-count-only-ack-upgrade.test.js`
    returned `0 decision-boundary guideline violations`.
11. `node scripts/check-runtime-grammar-contracts.js src/control-plane/control-plane-readiness-service-segment-4-stage-1.js src/control-plane/control-plane-readiness-service-segment-4-stage-3.js test/control-plane/control-plane-readiness-service-owner-read-count-only-ack-upgrade.test.js`
    returned `0 runtime-grammar-contract violations`.
12. `node scripts/check-guideline-literals.js src/control-plane/control-plane-readiness-service-segment-4-stage-1.js src/control-plane/control-plane-readiness-service-segment-4-stage-3.js test/control-plane/control-plane-readiness-service-owner-read-count-only-ack-upgrade.test.js`
    returned `0 new literal-guideline violations` and matched `0` inherited
    baseline violations.
13. `git diff --check -- src/control-plane/control-plane-readiness-service-segment-4-stage-1.js src/control-plane/control-plane-readiness-service-segment-4-stage-3.js test/control-plane/control-plane-readiness-service-owner-read-count-only-ack-upgrade.test.js`
    passed.
14. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-publication-ack-owner-read-required-ack-upgrade-20260507T000000Z.report.json --fast-local --verbose`
    failed after `134.3s`, but removed the epoch `3` `OPEN` pending-ACK seam
    and migrated the direct owner to `operation_workflow_owner /
    workflow_progress` at epoch `2` `PUBLISHED`.
15. `npx tap test/rebalancer/replica-operation-repository.test.js` passed.
16. `npx tap test/control-plane/priority-recovery-snapshot.test.js` passed.
17. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/replica-operation-repository.js src/rebalancer/replica-operation-repository-read-methods.js test/rebalancer/replica-operation-repository.test.js`
    returned `0 decision-boundary guideline violations`.
18. `node scripts/check-runtime-grammar-contracts.js src/rebalancer/replica-operation-repository.js src/rebalancer/replica-operation-repository-read-methods.js test/rebalancer/replica-operation-repository.test.js`
    returned `0 runtime-grammar-contract violations`.
19. `git diff --check -- src/rebalancer/replica-operation-repository.js src/rebalancer/replica-operation-repository-read-methods.js test/rebalancer/replica-operation-repository.test.js`
    passed.
20. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-entity-visibility-timeout-progress-20260507T000000Z.report.json --fast-local --verbose`
    failed after `131.2s`, but the epoch `2` `PUBLISHED` witness now narrows
    the surviving stalled carrier to cache-visible `PENDING` operation
    `d72a4fa3-c936-4a58-8a09-753e13041472` on `sql_write_operations-p1` while
    `sql_transactions-p1` remains `eligible_but_no_operation_created`.
21. `npx tap test/rebalancer/replica-operation-repository.test.js` passed with
    the entity-visibility authoritative-reconcile regression and repository
    boundary changes.
22. `node scripts/check-guideline-literals.js src/rebalancer/replica-operation-repository.js src/rebalancer/replica-operation-repository-read-methods.js test/rebalancer/replica-operation-repository.test.js`
    returned `0 new literal-guideline violations` and matched `0` inherited
    baseline violations.
23. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/replica-operation-repository.js src/rebalancer/replica-operation-repository-read-methods.js test/rebalancer/replica-operation-repository.test.js`
    returned `0 decision-boundary guideline violations`.
24. `node scripts/check-runtime-grammar-contracts.js src/rebalancer/replica-operation-repository.js src/rebalancer/replica-operation-repository-read-methods.js`
    returned `0 runtime-grammar-contract violations`.
25. `git diff --check -- work/packages/done-20260507-rolling-restart-startup-publication-open-convergence-priority-serial-wait-workflow-progress-reentry.md src/rebalancer/replica-operation-repository.js src/rebalancer/replica-operation-repository-read-methods.js test/rebalancer/replica-operation-repository.test.js work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md`
    passed.
26. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-entity-visibility-authoritative-reconcile-20260507T000000Z.report.json --fast-local --verbose`
    failed after `135.2s`, but it removed the cache-visible `PENDING`
    authoritative-visibility seam and migrated the dominant blocker to
    `priority_recovery_rebalancer_handoff_stalled` at epoch `2`
    `PUBLISHED`.
27. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-entity-visibility-authoritative-reconcile-20260507T000000Z.report.json`
    selected `priority_recovery_rebalancer_handoff_stalled` as the normalized
    dominant reason.
28. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-entity-visibility-authoritative-reconcile-20260507T000000Z.report.json`
    and the matching playback failure bundle both kept the direct frontier on
    `operation_workflow_owner / workflow_progress`, with
    `sql_transactions-p1` classified under
    `operation_created_but_no_step_transitions` and
    `sql_write_operations-p1` reduced to supporting
    `blocked_unclassified`.
29. `node --test test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`
    passed, including the regression that keeps direct workflow blockers ahead
    of terminal rebalancer follow-up carriers.
30. `node --test --test-name-pattern "(direct workflow blockers canonical over supporting serial-wait carriers|direct workflow blockers canonical over terminal rebalancer follow-up carriers)" test/distributed/harness/__tests__/failure-bundle.test.js`
    passed.
31. `node scripts/check-guideline-literals.js test/distributed/harness/priority-recovery-summary-normalization.js test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`
    returned `0 new literal-guideline violations` and matched `0` inherited
    baseline violations.
32. `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/priority-recovery-summary-normalization.js test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`
    returned `0 decision-boundary guideline violations`.
33. `node scripts/check-runtime-grammar-contracts.js test/distributed/harness/priority-recovery-summary-normalization.js test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`
    returned `0 runtime-grammar-contract violations`.
34. `git diff --check -- test/distributed/harness/priority-recovery-summary-normalization.js test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`
    passed.
35. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-priority-recovery-dominant-witness-reclassify-20260507T000000Z.report.json --fast-local --verbose`
    failed after `131.5s`, but materially migrated the runtime blocker to
    epoch `5` `PUBLISHED` `eligible_but_no_operation_created`.
36. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-recovery-dominant-witness-reclassify-20260507T000000Z.report.json`
    selected `priority_recovery_operation_scheduling_event_driven` as the
    normalized dominant reason.
37. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-recovery-dominant-witness-reclassify-20260507T000000Z.report.json`
    and the matching playback failure bundle both preserved the same
    representative restart-recovery frontier while surfacing the new
    `eligible_but_no_operation_created` class and `4/5` snapshot-coverage
    state.
38. `npx tap test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js -g "workflowOwner priority recovery partition snapshots"`
    passed, including the deferred authoritative-read preservation regression.
39. `npx tap test/rebalancer/priority-recovery-visibility-wakeup.test.js`
    passed, including the failed/removed same-partition visibility wake-up
    regression.
40. `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js src/rebalancer/unified-rebalancer-segment-1.js test/rebalancer/priority-recovery-visibility-wakeup.test.js`,
    `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js src/rebalancer/unified-rebalancer-segment-1.js test/rebalancer/priority-recovery-visibility-wakeup.test.js`,
    and `node scripts/check-runtime-grammar-contracts.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js src/rebalancer/unified-rebalancer-segment-1.js test/rebalancer/priority-recovery-visibility-wakeup.test.js`
    all returned `0` violations.
41. `git diff --check -- src/rebalancer/operation-workflow-owner-segment-5-stage-5.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js src/rebalancer/unified-rebalancer-segment-1.js test/rebalancer/priority-recovery-visibility-wakeup.test.js`
    passed.
42. `npm run work:validate -- work/packages/done-20260507-rolling-restart-startup-publication-open-convergence-priority-serial-wait-workflow-progress-reentry.md`
    passed after the real-agent Subagent Sequencing Ledger rewrite.
43. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-priority-recovery-visibility-wakeup-20260507T000000Z.report.json --fast-local --verbose`
    failed after `132.5s`, but proved the failed/removed visibility wake-up
    repair and moved the representative artifact to epoch `3` `PUBLISHED`
    with snapshot coverage `4/5`, pending ACK count `0`, and a remaining
    priority-recovery owner split.
44. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-recovery-visibility-wakeup-20260507T000000Z.report.json`
    selected `priority_recovery_operation_scheduling_event_driven` as the
    normalized dominant reason, with `sql_write_operations-p1` still the only
    `eligible_but_no_operation_created` partition under
    `rebalancer_leader / operation_scheduling`.
45. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-recovery-visibility-wakeup-20260507T000000Z.report.json`
    and the matching playback failure bundle both promoted
    `operation_workflow_owner / workflow_progress` on
    `replica_operations-p1` `recovering_in_flight`, while
    `sql_write_operations-p1` remained the only
    `eligible_but_no_operation_created` partition; the representative artifact
    therefore still needed same-artifact owner reconciliation before runtime
    implementation resumed.
46. `node --test test/scripts/analyze-topology-convergence.test.js`
    passed, including the focused regression that makes the priority edge use
    `priorityRecoveryProgressSummary.dominantWitness` owner and boundary when
    the same artifact provides a more precise owner cut than aggregate
    progress classes alone.
47. `node scripts/check-guideline-literals.js src/diagnostics/topology-convergence-graph.js test/scripts/analyze-topology-convergence.test.js`
    returned `0 new literal-guideline violations` and matched `0` inherited
    baseline violations.
48. `node scripts/check-guideline-decision-boundaries.js src/diagnostics/topology-convergence-graph.js test/scripts/analyze-topology-convergence.test.js`
    returned `0 decision-boundary guideline violations`.
49. `node scripts/check-runtime-grammar-contracts.js src/diagnostics/topology-convergence-graph.js test/scripts/analyze-topology-convergence.test.js`
    returned `0 runtime-grammar-contract violations`.
50. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-recovery-visibility-wakeup-20260507T000000Z.report.json`
    and the matching playback failure bundle now both select
    `rebalancer_leader / operation_scheduling` as the first frontier, aligning
    topology-convergence with the report-level dominant witness while keeping
    the aggregate blockage evidence unchanged.
51. `node scripts/analyze-topology-convergence.js test/scripts/__fixtures__/topology-convergence/priority-dominant-witness-owner-boundary.fixture.json --explain priority`
    now reports `rebalancer_leader / operation_scheduling` consistently across
    `evidenceSnapshot`, `decisionOutcome`, and `decisionTable`, with evidence
    anchored at
    `report.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary.dominantWitness`.
52. `node --test test/scripts/analyze-topology-convergence.test.js`
    passed again after the focused follow-up fix, including the live nested
    summary fixture, the consistent explain/decision-table assertion, and the
    direct graph-node owner/boundary assertion for `priority_recovery_progress`.
53. `node scripts/check-guideline-literals.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/scripts/analyze-topology-convergence.test.js`,
    `node scripts/check-guideline-decision-boundaries.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/scripts/analyze-topology-convergence.test.js`,
    and `node scripts/check-runtime-grammar-contracts.js src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/scripts/analyze-topology-convergence.test.js`
    all returned `0` violations.
54. `git diff --check -- src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/scripts/analyze-topology-convergence.test.js test/scripts/__fixtures__/topology-convergence/priority-dominant-witness-owner-boundary.fixture.json`
    passed.
55. `node --test test/rebalancer/priority-follow-up-target-readiness.test.js`
    passed, including the new regression that keeps explicit
    other-partition in-flight target reservations from suppressing direct
    `sql_write_operations-p1` follow-up creation while preserving
    unknown-partition safety.
56. `node --test test/rebalancer/unified-rebalancer-part-5-2-stage-4.js`
    and `node --test test/rebalancer/unified-rebalancer-part-5-2-stage-3.js`
    both passed after the runtime seam repair.
57. `node scripts/check-guideline-literals.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js test/rebalancer/priority-follow-up-target-readiness.test.js`,
    `node scripts/check-guideline-decision-boundaries.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js test/rebalancer/priority-follow-up-target-readiness.test.js`,
    and `node scripts/check-runtime-grammar-contracts.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js test/rebalancer/priority-follow-up-target-readiness.test.js`
    all returned `0` violations.
58. `git diff --check -- src/rebalancer/unified-rebalancer-segment-4-stage-3.js test/rebalancer/priority-follow-up-target-readiness.test.js`
    passed.
59. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-priority-recovery-other-partition-target-reservation-20260507T000000Z.report.json --fast-local --verbose`
    failed after `131.7s`, but closed the direct lower-owner
    `create_recovery_operation` seam and migrated the representative blocker
    to epoch `4` `PUBLISHED` `operation_workflow_owner / workflow_progress`.
60. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-recovery-other-partition-target-reservation-20260507T000000Z.report.json`
    selected `priority_recovery_workflow_progress_transition_deferred` as the
    normalized dominant reason.
61. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-recovery-other-partition-target-reservation-20260507T000000Z.report.json`
    and the matching playback failure bundle both selected
    `operation_workflow_owner / workflow_progress` as the first frontier,
    with `sql_write_operations-p1` the canonical dominant witness under
    `priority_operation_serial_wait`.
