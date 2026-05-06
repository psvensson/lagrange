# Rolling Restart Startup Active Gate Snapshot Coverage Selected-Snapshot Timeout Bootstrap Readiness Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-startup-guidance-owner-alignment-20260506T232850Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-startup-guidance-owner-alignment-20260506T232850Z/rolling-restart/",
  "owner": "Startup active-gate selected-snapshot timeout over fresh-join bootstrap readiness and snapshot-coverage reentry",
  "boundary": "Startup active-gate snapshot coverage / selected-snapshot timeout bootstrap readiness",
  "dominantReason": "pending_ack_nodes",
  "currentState": "The startup timeout guidance seam is closed. The representative rerun no longer fails as startup_recovery_blocked on selected snapshot timeout; instead it migrates to epoch 5 ACK_PENDING publication convergence where the normalized summary stays on pending_ack_nodes while the selected snapshot still carries two missing-published nodes and the last meaningful progress retains priority-recovery no-operation debt.",
  "nextAction": "Continue in work/packages/active-20260506-rolling-restart-publication-ack-pending-selected-membership-deficit-owner-reentry.md to extract the 232850Z selected-membership deficit / pending-ACK fixture and repair only that publication owner path.",
  "proof": [
    "Focused startup timeout guidance regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Successor package split for the ACK-pending selected-membership deficit seam"
  ],
  "touchedFiles": [
    "test/distributed/harness/failure-bundle-segment-5.js",
    "test/distributed/harness/__tests__/failure-bundle-publication-closure-tail-test-cases.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-published-snapshot-coverage-priority-spread-serial-wait-workflow-progress-reentry.md",
  "closed": "2026-05-06",
  "successor": "work/packages/active-20260506-rolling-restart-publication-ack-pending-selected-membership-deficit-owner-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Published Snapshot Coverage Priority Spread Serial-Wait Workflow Progress Reentry](./done-20260506-rolling-restart-published-snapshot-coverage-priority-spread-serial-wait-workflow-progress-reentry.md)
closed by migration. Closed the same day by migration into
[Rolling Restart Publication ACK-Pending Selected Membership Deficit Owner Reentry](./active-20260506-rolling-restart-publication-ack-pending-selected-membership-deficit-owner-reentry.md).

## Closure Summary

1. Added a focused regression proving startup-owned failure guidance must win
   when the terminal readiness observation is a snapshot timeout but the
   canonical failure class remains `startup_recovery_blocked` on bootstrap
   incompleteness.
2. Repaired
   `test/distributed/harness/failure-bundle-segment-5.js`
   so startup failure guidance no longer collapses back to generic
   snapshot-timeout triage when timeout is only observation debt.
3. Focused proof passed, the full
   `test/distributed/harness/__tests__/failure-bundle.test.js`
   suite passed, and the touched-file test literal count returned to its
   pre-edit baseline.
4. The representative rerun
   `rolling-restart-after-startup-guidance-owner-alignment-20260506T232850Z`
   closed the startup selected-snapshot timeout ownership seam and exposed a
   new epoch-5 `ACK_PENDING` publication boundary.

## Final Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-startup-guidance-owner-alignment-20260506T232850Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-startup-guidance-owner-alignment-20260506T232850Z/rolling-restart/`.
3. Result: failed after `132.9s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification moved to `publication_convergence_blocked` with root
   cause class `topology` and dominant reason `pending_ack_nodes`.
6. Publication convergence is now epoch `5` `ACK_PENDING` with pending ACK
   node `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, pending ACK count `1`,
   blocked-node count `0`, missing-published count `0`, and recovery protocol
   state `publication_pending`.
7. Current active-gate progress reaches active `3/5`, snapshot coverage `2/5`,
   selected snapshot node `ebc4...`, and blocker signature
   `inactive_nodes=2|snapshot_coverage=2/5`.
8. The startup timeout seam is closed: `selectedSnapshotError` is gone,
   readiness failure is now `no_progress_terminal`, and the failure bundle no
   longer recommends snapshot-timeout triage.
9. The new owner inconsistency is inside publication evidence: the summary
   error string still records `publicationConvergence=blocked#status=ACK_PENDING#recovery=publication_pending#pendingAck=1#missingPublished=2`,
   while normalized `publicationConvergence.missingPublishedCount` and failure
   signals drop that back to `0`.
10. The selected snapshot still carries missing-published nodes
    `11601...` and `8be8...`, while last meaningful progress retains
    `eligible_but_no_operation_created` and current progress retains
    `recovering_in_flight` / `blocked_unclassified` semantic-state debt for
    the three blocked priority partitions.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract a focused `230547Z` startup fixture for terminal
   `selectedSnapshotError`, last meaningful progress, and fresh-join readiness
   reason counts.
2. Decide whether the canonical owner is selected-snapshot query timeout,
   inactive bootstrap/runtime readiness, or no-progress retention between
   terminal and last-meaningful states.
3. Repair only the selected startup owner path.
4. Preserve the closed direct-source-over-carrier serial-wait regression.

## Out Of Scope

1. Reopening the closed published priority-spread workflow package unless that
   exact owner signature re-enters the representative blocker.
2. Harness-only timeout increases or startup-readiness exemptions.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Selected-snapshot timeout owns the boundary when admin snapshot and default
   lanes on the chosen node time out at the terminal barrier and directly erase
   current coverage visibility.
2. Fresh-join bootstrap readiness owns the boundary when the inactive nodes
   never progress beyond startup readiness reasons and the selected-snapshot
   timeout is only a consequence or observation of that stall.
3. Last meaningful priority-recovery progress may remain predecessor context,
   but it must not reopen the closed published priority-spread workflow seam
   once terminal unresolved priority classes clear.

Canonical contract shape:

1. Failure classification, active-gate current progress, and
   last-meaningful-progress retention must agree whether the live owner is the
   terminal selected-snapshot timeout or the earlier startup readiness stall.
2. `selectedSnapshotError` must preserve both the terminal timeout and the last
   meaningful pre-timeout progress when root-cause selection depends on both.
3. If bootstrap readiness is the owner, the proof must surface the exact three
   inactive fresh-join nodes plus the bounded reason set that keeps them from
   becoming ACTIVE.

## Residual Closure Inventory

- [x] Extract the `230547Z` selected-snapshot timeout / bootstrap-readiness
      fixture.
- [x] Decide the owner boundary: terminal snapshot timeout, bootstrap/runtime
      readiness stall, or no-progress retention crossover.
- [x] Add the focused regression and repair the selected startup path.
- [x] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.
- [x] Split the follow-on ACK-pending selected-membership deficit blocker into
      a new active package before closure.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [x] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, runtime-grammar, or metadata-gateway
      violation remains.
- [x] `failure-bundle-segment-5.js` still matches the inherited literal and
      decision-boundary counts from `HEAD`.

## Progress Notes

May 6 migration from the published priority-spread workflow package:

1. The serial-wait summary normalization now keeps supporting carriers
   subordinate to the direct source partition when the source already has a
   stronger current blocker.
2. Focused owner proof, failure-bundle proof, full failure-bundle suite, and
   touched-file guardrails passed after that harness repair.
3. Representative rerun
   `rolling-restart-after-serial-wait-source-dominance-20260506T230547Z`
   failed by migration: terminal ownership moved out of published
   priority-spread workflow progress and into startup selected-snapshot timeout
   / bootstrap-readiness debt.
4. The new owner probe had to decide whether `selectedSnapshotError` on
   `11601...` was the direct startup boundary or a terminal presentation of
   the three fresh-join nodes that never completed bootstrap, SQL readiness,
   and leader-metadata recovery.

May 6 startup guidance follow-up:

1. Added startup-specific failure guidance so the failure bundle keeps
   bootstrap-readiness triage when timeout is only the terminal observation.
2. Focused startup guidance proof passed, the full failure-bundle suite
   passed, and the touched-file test literal count returned to baseline after
   converting the new regression literals to suite-local owners.
3. Representative rerun
   `rolling-restart-after-startup-guidance-owner-alignment-20260506T232850Z`
   failed by migration: the live owner moved again to epoch-5 `ACK_PENDING`
   publication convergence with a selected-membership deficit inconsistency.

## Validation

1. `./node_modules/.bin/tap test/distributed/harness/__tests__/failure-bundle.test.js -g "prefers startup readiness guidance over timeout guidance when timeout is only terminal observation debt"`
2. `./node_modules/.bin/tap test/distributed/harness/__tests__/failure-bundle.test.js`
3. `node scripts/check-guideline-literals.js test/distributed/harness/failure-bundle-segment-5.js`
4. `node scripts/check-guideline-literals.js --include-tests test/distributed/harness/__tests__/failure-bundle-publication-closure-tail-test-cases.js`
5. `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/failure-bundle-segment-5.js`
6. `git diff --check`
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-startup-guidance-owner-alignment-20260506T232850Z.report.json --fast-local --verbose`

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the startup selected-snapshot timeout / bootstrap-readiness boundary
   with replayable evidence.
2. Sprint bookkeeping points to the successor package as the sole current
   representative owner.
