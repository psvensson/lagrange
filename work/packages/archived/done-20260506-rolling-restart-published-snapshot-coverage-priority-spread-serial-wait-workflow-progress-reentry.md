# Rolling Restart Published Snapshot Coverage Priority Spread Serial-Wait Workflow Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-serial-wait-source-dominance-20260506T230547Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-serial-wait-source-dominance-20260506T230547Z/rolling-restart/",
  "owner": "Publication recovery gate over priority spread convergence and workflow-owned serial wait / coordination-mismatch progress",
  "boundary": "Published snapshot coverage priority spread serial-wait workflow progress",
  "dominantReason": "BOOTSTRAP_PHASE_INCOMPLETE",
  "currentState": "The serial-wait owner seam is closed. Supporting serial-wait carriers no longer outrank their direct source blockers, and the representative rerun no longer leaves published priority-spread workflow debt as the terminal owner. The live blocker migrated to startup recovery: selected snapshot node 11601... times out on admin snapshot queries, active-gate progress stalls with only 2/5 ACTIVE and 2/5 snapshot coverage retained, and three fresh-join nodes remain bootstrap-incomplete.",
  "nextAction": "Continue in work/packages/active-20260506-rolling-restart-startup-active-gate-snapshot-coverage-selected-snapshot-timeout-bootstrap-readiness-reentry.md to decide whether the canonical startup owner is selected-snapshot query timeout, fresh-join bootstrap readiness stall, or no-progress summary retention between them.",
  "proof": [
    "Focused direct-source-versus-serial-wait carrier regression",
    "Failure-bundle canonical-owner regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "test/distributed/harness/priority-recovery-summary-normalization.js",
    "test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js",
    "test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-startup-published-snapshot-coverage-control-plane-source-removal-workflow-progress-reentry.md",
  "closed": "2026-05-06",
  "successor": "work/packages/active-20260506-rolling-restart-startup-active-gate-snapshot-coverage-selected-snapshot-timeout-bootstrap-readiness-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Startup Published Snapshot Coverage Control Plane Source-Removal Workflow Progress Reentry](./done-20260506-rolling-restart-startup-published-snapshot-coverage-control-plane-source-removal-workflow-progress-reentry.md)
closed by migration. Closed the same day by migration into
[Rolling Restart Startup Active Gate Snapshot Coverage Selected-Snapshot Timeout Bootstrap Readiness Reentry](./active-20260506-rolling-restart-startup-active-gate-snapshot-coverage-selected-snapshot-timeout-bootstrap-readiness-reentry.md).

## Closure Summary

1. Added focused harness regressions proving a supporting serial-wait carrier
   must remain subordinate to its direct source-partition blocker when the
   source already has stronger current owner evidence.
2. Repaired
   `test/distributed/harness/priority-recovery-summary-normalization.js`
   so serial-wait carriers cannot outrank the source partition they explicitly
   wait on.
3. Focused owner proof, failure-bundle proof, full failure-bundle suite, and
   touched-file guardrails passed after the repair.
4. The representative rerun
   `rolling-restart-after-serial-wait-source-dominance-20260506T230547Z`
   closed the published priority-spread workflow boundary and exposed an
   earlier startup selected-snapshot timeout / bootstrap-readiness blocker.

## Final Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-serial-wait-source-dominance-20260506T230547Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-serial-wait-source-dominance-20260506T230547Z/rolling-restart/`.
3. Result: failed after `131.4s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification now reports root cause class `startup`, failure
   class `startup_recovery_blocked`, dominant reason
   `BOOTSTRAP_PHASE_INCOMPLETE`, and signal `startupMode=fresh_join`.
6. Top-level publication convergence reaches epoch `4`, status `PUBLISHED`,
   pending ACK count `0`, blocked-node count `0`, missing-published count
   `0`, and gate reason `snapshot_coverage=2/5`.
7. Terminal startup no-progress retention keeps the last meaningful state at
   active `2/5`, snapshot coverage `2/5`, selected snapshot
   `11601fe0-72d6-5853-8590-ec2881853e72`, and selected missing published
   nodes `35a891...`, `8be8...`, and `ebc4...`.
8. That last meaningful state still records
   `priority_recovery_progress_class=eligible_but_no_operation_created` on
   `sql_transactions-p1` and `sql_write_operations-p1`, but terminal current
   progress and the top-level failure bundle no longer keep published
   priority-spread workflow debt as the live owner.
9. The terminal readiness failure is instead
   `selectedSnapshotError`: admin snapshot and default-lane queries on
   `11601...` both time out after `100ms`, and terminal current progress
   collapses to blocker signature
   `inactive_nodes=3|snapshot_coverage=0/5|snapshot_error`.
10. Startup reason counts now dominate the remaining debt:
    `BOOTSTRAP_PHASE_INCOMPLETE`, `SQL_ENGINE_UNAVAILABLE`,
    `LEADER_METADATA_INCOMPLETE`, `BOOTSTRAP_NOT_READY`, and
    `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` each appear three times across
    the inactive fresh-join nodes. Seed `7493...` also contributes a
    readiness-probe timeout fallback as supporting evidence.

## Residual Closure Inventory

- [x] Extract the `224415Z` published priority-spread fixture.
- [x] Decide the owner boundary: workflow-owned serial wait, coordinator
      exclusion, or stronger pressure/visibility consumer disagreement.
- [x] Add the focused regression and repair the selected owner path.
- [x] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.
- [x] Split the follow-on startup selected-snapshot timeout / bootstrap
      readiness blocker into a new active package before closure.

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

May 6 migration from the startup source-removal package:

1. The representative rerun after the stale local `MOVE_REPLICA` refresh repair
   already removed startup source-removal ownership and narrowed the active
   blocker to published priority-spread workflow progress.
2. Added a focused summary-normalization regression proving direct source
   blockers outrank supporting serial-wait carriers.
3. Added a failure-bundle regression proving canonical blocker presentation must
   keep the direct workflow blocker instead of promoting its supporting
   carrier.
4. Repaired the harness normalization seam so the summary cannot promote
   `priority_operation_serial_wait` above the direct source partition it
   depends on.
5. Representative rerun
   `rolling-restart-after-serial-wait-source-dominance-20260506T230547Z`
   failed by migration: published priority-spread workflow debt is closed as
   the terminal owner, and the live blocker moved to startup selected-snapshot
   timeout plus fresh-join bootstrap readiness stall.

## Validation

1. `./node_modules/.bin/tap test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`
2. `./node_modules/.bin/tap test/distributed/harness/__tests__/failure-bundle.test.js -g "direct workflow blockers canonical over supporting serial-wait carriers"`
3. `./node_modules/.bin/tap test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js test/distributed/harness/__tests__/failure-bundle.test.js`
4. `node scripts/check-guideline-literals.js test/distributed/harness/priority-recovery-summary-normalization.js test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`
5. `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/priority-recovery-summary-normalization.js`
6. `node scripts/check-runtime-grammar-contracts.js test/distributed/harness/priority-recovery-summary-normalization.js`
7. `git diff --check`
8. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-serial-wait-source-dominance-20260506T230547Z.report.json --fast-local --verbose`

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the published priority-spread workflow boundary with replayable
   evidence.
2. Sprint bookkeeping points to the successor startup selected-snapshot timeout
   package as the sole current representative owner.

## Migration

This package closes by migration. The repaired boundary was the harness owner
decision that allowed a supporting serial-wait carrier to outrank the direct
source blocker in published priority-spread summaries. The successor package is
[Rolling Restart Startup Active Gate Snapshot Coverage Selected-Snapshot Timeout Bootstrap Readiness Reentry](./active-20260506-rolling-restart-startup-active-gate-snapshot-coverage-selected-snapshot-timeout-bootstrap-readiness-reentry.md),
which now owns the `230547Z` startup selected-snapshot timeout and fresh-join
bootstrap-readiness evidence.
