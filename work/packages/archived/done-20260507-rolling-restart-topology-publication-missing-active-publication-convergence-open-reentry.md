# Rolling Restart Topology Publication Missing-Active Publication Convergence Open Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-bounded-retryable-seed-contact-probe-20260507T072145Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-bounded-retryable-seed-contact-probe-20260507T072145Z/rolling-restart/",
  "owner": "Startup join contacting-seed timeout no-progress behind topology publication missing-active ACK_PENDING convergence",
  "boundary": "Startup join / contacting-seed timeout no-progress",
  "dominantReason": "publication_missing_active_node=8be8d30f-4499-5eed-865c-71b4d529a67a",
  "currentState": "The bounded retryable seed-contact probe repair closes the direct join-side no-progress seam. The new representative rerun brings 35a... to active, closes publication at epoch 4 PUBLISHED with pending ACK count 0, and migrates the live blocker to priority recovery workflow progress on sql_write_operations-p1, where operation 0e957d74-4bae-4a33-90b0-ccf53e765d01 remains durable PENDING on target 35a... with no step transitions.",
  "nextAction": "Continue in work/packages/active-20260507-rolling-restart-topology-priority-recovery-workflow-progress-event-driven-reentry.md for the current operation_workflow_owner / workflow_progress event-driven seam.",
  "proof": [
    "Focused 065418Z publication-convergence witness fixture",
    "Focused bounded retryable seed-contact probe regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/bootstrap/phases/contact-seed-phase.js",
    "src/bootstrap/node-joining-service-segment-5.js",
    "test/bootstrap/node-joining-service.test.js",
    "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-publication-convergence-open-reentry.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-priority-recovery-rebalancer-handoff-terminal-failed-reentry.md",
  "closed": "2026-05-07",
  "successor": "work/packages/active-20260507-rolling-restart-topology-priority-recovery-workflow-progress-event-driven-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Priority Recovery Rebalancer Handoff Terminal-Failed Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-priority-recovery-rebalancer-handoff-terminal-failed-reentry.md)
closed by migration. The representative rerun no longer supports
`priority_recovery_rebalancer_handoff_terminal_failed`; the live blocker is now
epoch `5` `OPEN` publication convergence with two missing-published nodes and
one pending-ack node.

Progress update on May 7, 2026: the extracted `053417Z` playback witness set
now selects startup `contacting_seed` reachability as the direct lower owner.
The failing shape is retryable seed-contact authority collapse: a joiner can
see retryable bootstrap evidence and then terminate on a later transport
`fetch failed`, which drops same-process auto-resume even though the seed had
already emitted canonical retryable authority. This slice now preserves that
retryable authority inside `ContactSeedPhase`, adds a focused
`NodeJoiningService` regression for the retryable-then-transport-failure path,
and reruns the touched-file guardrails cleanly. The remaining open proof step
is one representative `rolling-restart --fast-local` rerun.

Representative rerun update on May 7, 2026: the cross-attempt retryable
seed-contact evidence repair now proves out in the distributed scenario. Node
`8be8...` completes join successfully in the new rerun
`rolling-restart-after-contact-seed-cross-attempt-retry-authority-20260507T061810Z`,
so the repaired retryable-authority seam is closed. The live blocker migrates
to node `35a...`, which remains in `contacting_seed` and surfaces retryable
`Seed bootstrap not ready` at the end of the scenario window while publication
stalls at epoch `4` `ACK_PENDING` with two pending-ack nodes and two
missing-published nodes.

Representative rerun update on May 7, 2026: bounding repeated stale
`MOVE_REPLICA` assignment-token retries now closes the local no-progress seam
inside message-group registration. The new rerun
`rolling-restart-after-assignment-token-bounded-surface-20260507T070601Z`
brings nodes `35a...` and `11601...` to active, so the prior stale-token
witness is no longer the direct lower owner. The live blocker migrates again to
epoch `5` `ACK_PENDING` publication convergence with missing-active nodes
`8be8...` and `ebc4...`, while seed-side priority recovery now reports
terminal failed actuation on `replica_operations-p1` and
`sql_transaction_participants-p1`.

Closure update on May 7, 2026: bounding repeated retryable seed-contact probes
closes the direct join-side timeout seam as well. The representative rerun
`rolling-restart-after-bounded-retryable-seed-contact-probe-20260507T072145Z`
no longer supports startup `contacting_seed` timeout no-progress as the direct
owner. Node `35a...` now reaches active, publication closes at epoch `4`
`PUBLISHED` with pending ACK count `0`, and the live blocker migrates to
`operation_workflow_owner / workflow_progress`: `sql_write_operations-p1`
creates recovery operation `0e957d74-4bae-4a33-90b0-ccf53e765d01` on
`7493...`, but the durable row remains `PENDING` with target visibility absent
and no workflow-step transitions. This package therefore closes by migration
into the next priority-recovery workflow-progress package.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-bounded-retryable-seed-contact-probe-20260507T072145Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-bounded-retryable-seed-contact-probe-20260507T072145Z/rolling-restart/`.
3. Result: failed after `131.8s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Triage summary now reports root cause class `topology`, dominant reason
   `priority_recovery_workflow_progress_event_driven`, and failure class
   `priority_recovery_progress_blocked`.
6. Publication convergence is epoch `4` `PUBLISHED` with pending ACK count
   `0`, blocked partition count `1`, unresolved partition count `1`, and
   recovery protocol state `priority_spread_pending`.
7. Publication gate reasons are now only
   `priority_partitions_not_spread` and `snapshot_coverage=2/5`; the previous
   epoch-pending and missing-active publication ownership signals are no longer
   direct.
8. Current active-gate progress reaches active `2/5`, coverage `2/5`,
   published active `2/5`, pending ACK count `0`, and selected
   missing-published node ids
   `11601fe0-72d6-5853-8590-ec2881853e72|8be8d30f-4499-5eed-865c-71b4d529a67a|ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
9. Node `35a...` now reaches active readiness in the playback, so the prior
   startup `contacting_seed` witness set is no longer the direct lower owner.
10. Priority-recovery evidence now selects a single blocked partition,
    `sql_write_operations-p1`, with owner `operation_workflow_owner`,
    boundary `workflow_progress`, wait mode `event_driven`, next action
    `wait_for_operation_progress`, and actuation state
    `persisted_not_dispatched`.
11. The selected recovery operation is
    `0e957d74-4bae-4a33-90b0-ccf53e765d01`, created on `7493...` for target
    `35a...`; the durable row remains `PENDING`, step age `2570ms`, target
    visibility `absent`, and no workflow-step transitions are present in the
    report snapshot.
12. The bounded seed-contact probe repair is therefore closed enough to stop
    being the representative owner. The new playback no longer selects startup
    timeout no-progress as the direct lower seam; the blocker has migrated into
    remote-owned priority REPLACE progression after publication closure.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract the focused `053417Z` publication-convergence witness set for the
   two missing-published nodes, the one pending-ack node, and the supporting
   blocked priority partitions.
2. Decide whether the direct owner is startup contacting-seed reachability,
   publication ACK persistence, or `operation_workflow_owner /
   workflow_progress`.
3. Add a focused regression for the selected owner path before the next
   representative rerun.
4. Preserve the closed rebalancer handoff retry-lane regression from the
   predecessor package.

## Out Of Scope

1. Reopening the closed retryable-create handoff package unless a new
   representative rerun again selects terminal `REPLICA_CREATE_FAILED`.
2. Relaxing publication/remove-safety rules for `control_plane_publications-p1`
   without a direct owner proof.
3. Harness-only timeout increases or transport exemptions that only hide the
   named publication convergence debt.
4. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
5. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Explicit `publication_missing_active_node` owns the boundary when
   publication convergence and active-gate progress agree on the same
   missing-published node set under one `OPEN` publication epoch and no lower
   owner path directly explains why those nodes stay missing.
2. Startup joining/contacting-seed owns the boundary if the selected missing
   nodes cannot leave `contacting_seed` or bootstrap readiness and that join
   failure directly explains publication non-convergence.
3. Publication ACK persistence owns the boundary if the selected pending-ack
   node remains active but cannot complete the same `OPEN` epoch because
   authoritative control-plane or transport evidence does not converge.
4. `operation_workflow_owner / workflow_progress` is supporting evidence unless
   the blocked priority partitions directly explain why the named
   missing-published nodes or pending-ack node cannot converge.

Canonical contract shape:

1. Triage summary, failure bundle, active-gate progress, and node witnesses
   must converge on one explicit owner for the same epoch `5` `OPEN`
   publication state.
2. Missing-published nodes and the pending-ack node must have one canonical
   causal path each, rather than an unresolved mix of startup, publication,
   and workflow explanations.
3. If a lower owner path is selected, explicit
   `publication_missing_active_node=<node>` becomes scenario carrier only and
   the selected lower owner must explain the same convergence stall.

## Residual Closure Inventory

- [x] Extract the `053417Z` publication-convergence witness fixture.
- [x] Decide the direct owner boundary: startup contacting-seed reachability,
      publication ACK persistence, or workflow-progress serial wait.
- [x] Add the focused regression and repair the selected owner path.
- [x] Record one representative `rolling-restart` scenario rerun against the
      repaired contacting-seed owner path.

## Static Drift Ledger

Historical preflight notes:

- Boundary guardrails used for this closed slice were literal ownership,
  decision-boundary audit, runtime grammar, and diff whitespace, as reflected
  in the validation evidence below.
- A separate file-scoped preflight checkbox is not retained in this migrated
  historical package; the surviving closure evidence records no increased
  touched-file guardrail count.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [x] No out-of-scope inherited touched-file guardrail violation is recorded in
      the surviving closure evidence; the live scenario blocker is linked to
      the successor package above.

## Validation

1. Focused `053417Z` publication-convergence witness fixture selected startup
   `joining/contacting_seed` as the direct lower owner.
2. `npx tap test/bootstrap/node-joining-service.test.js`
   passed.
3. `node scripts/check-guideline-literals.js src/bootstrap/phases/contact-seed-phase.js`
   passed with `0 new literal-guideline violations`.
4. `node scripts/check-guideline-decision-boundaries.js src/bootstrap/phases/contact-seed-phase.js`
   passed with `0 decision-boundary guideline violations`.
5. `node scripts/check-runtime-grammar-contracts.js src/bootstrap/phases/contact-seed-phase.js`
   passed with `0 runtime-grammar-contract violations`.
6. `git diff --check -- src/bootstrap/phases/contact-seed-phase.js test/bootstrap/node-joining-service.test.js`
   passed.
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-contact-seed-retry-authority-20260507T060902Z.report.json --fast-local --verbose`
   failed after `134.3s`, but moved the dominant reason to
   `publication_missing_active_node=8be8d30f-4499-5eed-865c-71b4d529a67a`
   and selected the cross-attempt `contacting_seed` retryability gap.
8. `npx tap test/bootstrap/node-joining-service.test.js -g "retained retryable seed-contact evidence|retryable seed-contact bootstrap authority survives a later transport failure|surfaces retryable bootstrap authority after one bounded in-call retry"`
   passed.
9. `npx tap test/bootstrap/node-joining-service.test.js`
   passed with `121/121`.
10. `node scripts/check-guideline-literals.js src/bootstrap/phases/contact-seed-phase.js src/bootstrap/node-joining-service-segment-5.js`
    passed with `0 new literal-guideline violations`.
11. `node scripts/check-guideline-decision-boundaries.js src/bootstrap/phases/contact-seed-phase.js src/bootstrap/node-joining-service-segment-5.js`
    and
    `node scripts/check-runtime-grammar-contracts.js src/bootstrap/phases/contact-seed-phase.js src/bootstrap/node-joining-service-segment-5.js`
    both passed with `0` new violations.
12. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-bounded-retryable-seed-contact-probe-20260507T072145Z.report.json --fast-local --verbose`
    failed after `131.8s`, but closed the startup `contacting_seed`
    no-progress seam and moved the dominant blocker to
    `priority_recovery_workflow_progress_event_driven`.
8. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-contact-seed-cross-attempt-retry-authority-20260507T061810Z.report.json --fast-local --verbose`
   failed after `122.6s`, but `8be8...` joined successfully and the dominant
   reason moved to `publication_missing_active_node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7`.
9. `npx tap test/bootstrap/node-joining-service.test.js -g "retries register-service on assignment token unknown|surfaces repeated assignment token unknown for outer retryable resume"`
   passed.
10. `npx tap test/bootstrap/node-joining-service.test.js`
    passed with `# { total: 119, pass: 119 }`.
11. `node scripts/check-guideline-literals.js src/bootstrap/phases/create-message-group-phase.js`
    passed with `0 new literal-guideline violations`.
12. `node scripts/check-guideline-decision-boundaries.js src/bootstrap/phases/create-message-group-phase.js`
    passed with `0 decision-boundary guideline violations`.
13. `node scripts/check-runtime-grammar-contracts.js src/bootstrap/phases/create-message-group-phase.js`
    passed with `0 runtime-grammar-contract violations`.
14. `git diff --check -- src/bootstrap/phases/create-message-group-phase.js test/bootstrap/node-joining-service.test.js`
    passed.
15. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-assignment-token-bounded-surface-20260507T070601Z.report.json --fast-local --verbose`
    failed after `135.6s`, but the stale assignment-token loop no longer owns
    the representative blocker: `35a...` and `11601...` reach active, and the
    live missing-active set migrates to `8be8...` and `ebc4...` under epoch `5`
    `ACK_PENDING` convergence.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the topology publication missing-active / publication convergence
   `OPEN` boundary with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
