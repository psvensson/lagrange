# Rolling Restart Startup Join Contacting Seed Bootstrap Readiness Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-bootstrap-join-admission-recovery-projection-20260506T213144Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-bootstrap-join-admission-recovery-projection-20260506T213144Z/rolling-restart/",
  "owner": "Startup join contacting-seed bootstrap readiness stall and stale selected-snapshot coverage",
  "boundary": "Startup join / contacting-seed bootstrap readiness",
  "dominantReason": "BOOTSTRAP_PHASE_INCOMPLETE",
  "currentState": "Bootstrap request startup admission now honors the recovery-authorized bootstrap-join projection, so the representative rerun no longer selects startup bootstrap admission as the live owner. Joiner ebc4... reaches ACTIVE, and the fresh rerun migrates to epoch 4 ACK_PENDING publication convergence with pending ACK node 11601..., selected snapshot coverage 2/5 on ebc4..., and narrowed priority workflow debt on sql_transactions-p1 priority_operation_serial_wait plus sql_transaction_participants-p1 recovering_in_flight.",
  "nextAction": "Continue in work/packages/active-20260506-rolling-restart-publication-ack-pending-priority-serial-wait-workflow-progress-reentry.md to repair the epoch 4 ACK_PENDING / priority serial-wait workflow-progress boundary.",
  "proof": [
    "Focused bootstrap request startup-admission regression",
    "Bootstrap API readiness/request contract suite",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/bootstrap/bootstrap-api.js",
    "src/bootstrap/owners/bootstrap-request-owner.js",
    "test/bootstrap/bootstrap-api.test-part-3.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-startup-active-gate-priority-recovery-rebalancer-handoff-stall-reentry.md",
  "closed": "2026-05-06",
  "successor": "work/packages/active-20260506-rolling-restart-publication-ack-pending-priority-serial-wait-workflow-progress-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Startup Active Gate Priority Recovery Rebalancer Handoff Stall Reentry](./done-20260506-rolling-restart-startup-active-gate-priority-recovery-rebalancer-handoff-stall-reentry.md)
closed by migration. The representative rerun no longer terminates on
priority-recovery handoff or stale retained no-progress debt. Publication now
reaches epoch `3` `PUBLISHED` with steady-published recovery, but startup
still times out because two late joiners stay pinned before runtime
infrastructure becomes available.

Closure update on May 6, 2026: the bootstrap request startup gate now honors
the same recovery-authorized bootstrap-join projection already used by
`/bootstrap/ready`. The representative rerun
`test-output/reports/rolling-restart-after-bootstrap-join-admission-recovery-projection-20260506T213144Z.report.json`
therefore moved `ebc4...` into `ACTIVE`, closed the startup bootstrap-admission
owner seam, and migrated the live blocker to epoch `4` `ACK_PENDING`
publication convergence with pending ACK node `11601...` and narrowed
priority workflow debt on `sql_transactions-p1`.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-bootstrap-join-admission-recovery-projection-20260506T213144Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-bootstrap-join-admission-recovery-projection-20260506T213144Z/rolling-restart/`.
3. Result: failed after `132.8s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification is now `publication_convergence_blocked` with
   confidence `high`, root cause class `topology`, and dominant reason
   `pending_ack_nodes`.
6. Startup bootstrap-admission is closed predecessor context for this
   boundary: `ebc4...` reaches `ACTIVE`, and the representative seam is no
   longer `BOOTSTRAP_PHASE_INCOMPLETE`.
7. Publication convergence is the new owner: epoch `4`, status `ACK_PENDING`,
   pending ACK node `11601...`, blocked node count `0`, missing published
   count `0`, and recovery protocol state `publication_pending`.
8. Active-gate best progress reaches active `3/5` with selected snapshot
   coverage `2/5` on `ebc4...`; terminal current progress regresses to
   active `2/5`, coverage `2/5`, with blocker signature
   `inactive_nodes=3|snapshot_coverage=2/5|priority_recovery_progress_class=priority_operation_serial_wait`.
9. Priority recovery narrows to two workflow witnesses:
   `sql_transaction_participants-p1` is `recovering_in_flight` under
   `operation_workflow_owner / workflow_progress`, while `sql_transactions-p1`
   is `needs_operation` with blocker class `priority_operation_serial_wait`
   behind serial-wait operation `4cd0c9fd-2e25-43aa-b9c0-ac80bd82d575` on
   `sql_write_operations-p1`.
10. Selected snapshot disagreement and inactive joiners remain supporting
    evidence only while failure classification keeps `blockedNodeCount=0`,
    `missingPublishedCount=0`, and `pendingAckCount=1` as the dominant
    publication owner contract.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract a focused `211047Z` startup fixture for the joiners that never move
   beyond `contacting_seed` / bootstrap `INIT`.
2. Decide whether the live owner is seed bootstrap request timeout,
   infrastructure/connect-websocket stall, or stale selected-snapshot
   coverage consumption in active-gate reporting.
3. Repair only the selected startup owner path.
4. Preserve the closed retained-terminal serial-wait carrier regression.

## Out Of Scope

1. Reopening the closed priority-recovery handoff package unless the same
   `priority_recovery_rebalancer_handoff_stalled` contradiction re-enters.
2. Harness-only timeout increases or startup-readiness exemptions.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. The current startup blocker is owned by the join/bootstrap path for nodes
   that never advance past `contacting_seed` and never bring up local admin or
   SQL runtime.
2. Selected stale-usable snapshot coverage may preserve disagreement evidence,
   but it must not replace a newer direct startup stall when two joiners never
   progress into runtime infrastructure.
3. Priority recovery remains supporting evidence only while its unresolved
   blocker-class set stays empty.

Canonical contract shape:

1. Active-gate progress and failure classification must agree that the current
   representative owner is startup join/bootstrap debt rather than
   priority-recovery handoff.
2. If the seed-contact/bootstrap path is the true owner, the replayable proof
   must show which bounded phase does not complete: bootstrap HTTP contact,
   websocket infrastructure, or membership/query handoff.
3. If stale selected-snapshot coverage becomes the true owner instead, the
   proof must show that the joiners actually advanced beyond the blocked
   startup phase and only the consumer view remained stale.

## Residual Closure Inventory

- [x] Extract the `211047Z` join/contacting-seed fixture.
- [x] Decide the owner boundary: bootstrap request timeout,
      connect-websocket/infrastructure stall, or stale selected snapshot.
- [x] Add the focused regression and repair the selected startup path.
- [x] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.

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

## Progress Notes

May 6 migration from the priority-recovery handoff package:

1. The retained terminal serial-wait carrier regression now keeps removed
   follower snapshots subordinate to the source workflow instead of allowing a
   stale `rebalancer_handoff` fallback.
2. Focused owner proof, failure-bundle proof, and touched-file guardrails
   passed after the stage-3 repair.
3. Representative rerun
   `rolling-restart-after-terminal-serial-wait-carrier-normalization-20260506T211047Z`
   failed by migration: startup active-gate progress no longer exposes
   unresolved priority-recovery blocker classes, but the live representative
   seam moved earlier into join/bootstrap readiness.
4. The new contraction package must decide whether the joiners are blocked by
   seed bootstrap request timing, websocket/infrastructure setup, or stale
   selected-snapshot coverage consumption.

## Validation

1. Focused bootstrap request startup-admission regression passes.
2. Bootstrap API request/readiness suites pass.
3. Touched-file guardrails are rerun and recorded.
4. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit blocker migration notes.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the startup join/contacting-seed bootstrap-readiness boundary with
   replayable evidence.
2. Sprint bookkeeping points to the successor publication ACK-pending
   serial-wait package as the sole current representative owner.

## Migration

This package closes by migration. The repaired boundary was the bootstrap
request startup gate that rejected recovery-authorized join admission before
the seed could return a bounded bootstrap response. The successor package is
[Rolling Restart Publication ACK-Pending Priority Serial-Wait Workflow Progress Reentry](./active-20260506-rolling-restart-publication-ack-pending-priority-serial-wait-workflow-progress-reentry.md),
which owns the `213144Z` epoch `4` `ACK_PENDING` publication-convergence
evidence.
