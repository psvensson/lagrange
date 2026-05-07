# Rolling Restart Topology Publication Missing-Active Publication Convergence Open Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-retryable-create-handoff-preserve-20260507T053417Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-retryable-create-handoff-preserve-20260507T053417Z/rolling-restart/",
  "owner": "Topology publication missing-active node over OPEN publication convergence and startup/join witness disagreement",
  "boundary": "Topology publication missing-active node / publication convergence owner",
  "dominantReason": "publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72",
  "currentState": "The rebalancer handoff terminal-failed seam is closed. The representative rerun now fails at epoch 5 OPEN publication convergence with pendingAckCount 1 on ebc4..., missingPublishedCount 2 on 11601... and 8be8..., priority spread still pending across replica_operations-p1, sql_transactions-p1, and sql_write_operations-p1, and startup evidence split between fresh joiners stalled in contacting_seed and active nodes timing out on reconnect/query work.",
  "nextAction": "Extract the 053417Z publication-convergence witness set for missing-active nodes 11601... and 8be8..., pending-ack node ebc4..., control_plane_publications-p1 source-removal deferral, and the supporting workflow-progress witnesses on replica_operations-p1, sql_transactions-p1, and sql_write_operations-p1; decide whether the direct owner is startup contacting-seed reachability, publication ACK persistence, or operation_workflow_owner / workflow_progress serial wait; add a focused regression for the selected boundary; and rerun one representative rolling-restart scenario.",
  "proof": [
    "Focused 053417Z publication-convergence witness fixture",
    "Focused publication missing-active owner-path regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/bootstrap/phases/contact-seed-phase.js",
    "src/bootstrap/node-joining-service-segment-2.js",
    "src/control-plane/control-plane-publication-merge.js",
    "src/control-plane/owners/control-plane-publications-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "test/bootstrap/bootstrap-api.test-part-4.js",
    "test/distributed/harness/__tests__/publication-evidence-replay.test.js",
    "work/packages/active-20260507-rolling-restart-topology-publication-missing-active-publication-convergence-open-reentry.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-priority-recovery-rebalancer-handoff-terminal-failed-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Priority Recovery Rebalancer Handoff Terminal-Failed Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-priority-recovery-rebalancer-handoff-terminal-failed-reentry.md)
closed by migration. The representative rerun no longer supports
`priority_recovery_rebalancer_handoff_terminal_failed`; the live blocker is now
epoch `5` `OPEN` publication convergence with two missing-published nodes and
one pending-ack node.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-retryable-create-handoff-preserve-20260507T053417Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-retryable-create-handoff-preserve-20260507T053417Z/rolling-restart/`.
3. Result: failed after `132.9s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Triage summary now reports root cause class `topology`, dominant reason
   `publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`, and
   failure class `publication_convergence_blocked`.
6. Publication convergence is epoch `5` `OPEN` with pending ACK count `1`,
   pending-ack node `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`,
   missing-published nodes
   `11601fe0-72d6-5853-8590-ec2881853e72|8be8d30f-4499-5eed-865c-71b4d529a67a`,
   and recovery protocol state `publication_pending`.
7. Publication gate reasons are
   `priority_partitions_not_spread`,
   `publication_epoch_pending`,
   `snapshot_coverage=2/5`,
   `publication_missing_active_node=11601...`, and
   `publication_missing_active_node=8be8...`.
8. Current active-gate progress agrees on the same stalled shape: active
   `2/5`, snapshot coverage `2/5`, pending ACK count `1`, missing-published
   count `2`, priority spread pending with gap `9`, and no meaningful progress
   for `4` coordinator cycles.
9. Supporting node witnesses diverge:
   `8be8...` fails join in `contacting_seed` with
   `Failed to contact seed node: fetch failed`,
   while `11601...` restarts into `contacting_seed`/`bootstrapping` and shows
   repeated message-router reconnect timeouts plus query timeouts instead of a
   clean join completion witness.
10. The pending-ack node `ebc4...` stays active but records authoritative
    discovery repair failures, repeated reconnect timeouts to `7493...`, and
    query timeouts while publication remains `OPEN`.
11. Supporting priority-recovery evidence still names three blocked partitions:
    `replica_operations-p1` stays `recovering_in_flight` with latest workflow
    step `SENDING`, `sql_write_operations-p1` stays
    `recovering_in_flight` with latest workflow step `PENDING`, and
    `sql_transactions-p1` reports semantic state `needs_operation` with
    progress class `priority_operation_serial_wait`.
12. `control_plane_publications-p1` is supporting publication evidence rather
    than the selected owner so far: `35a...` logs
    `replace_remove_safety_blocked` because the source leader cannot be removed
    while publication status is `OPEN`.

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

- [ ] Extract the `053417Z` publication-convergence witness fixture.
- [ ] Decide the direct owner boundary: startup contacting-seed reachability,
      publication ACK persistence, or workflow-progress serial wait.
- [ ] Add the focused regression and repair the selected owner path.
- [ ] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.

## Static Drift Ledger

Preflight:

- [ ] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [ ] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [ ] Same guardrails rerun after implementation.
- [ ] No relevant guardrail count increased.
- [ ] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [ ] Any out-of-scope inherited violation has a linked follow-on package.

## Validation

1. Focused `053417Z` publication-convergence witness fixture passes.
2. Focused owner-path regression passes.
3. Touched-file guardrails are rerun and recorded.
4. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit pass or blocker migration notes.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the topology publication missing-active / publication convergence
   `OPEN` boundary with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
