# Rolling Restart Startup Active Gate Snapshot Coverage Selected-Snapshot Timeout Bootstrap Readiness Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-serial-wait-source-dominance-20260506T230547Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-serial-wait-source-dominance-20260506T230547Z/rolling-restart/",
  "owner": "Startup active-gate selected-snapshot timeout over fresh-join bootstrap readiness and snapshot-coverage reentry",
  "boundary": "Startup active-gate snapshot coverage / selected-snapshot timeout bootstrap readiness",
  "dominantReason": "BOOTSTRAP_PHASE_INCOMPLETE",
  "currentState": "The published priority-spread workflow seam is closed. The representative rerun now fails as startup_recovery_blocked: selected snapshot node 11601... times out on admin snapshot queries after progress reached epoch 4 PUBLISHED with active 2/5 and snapshot coverage 2/5, while 35a..., 8be8..., and ebc4... remain fresh_join bootstrap-incomplete with SQL engine, leader-metadata, and control-plane recovery reasons still open.",
  "nextAction": "Extract the 230547Z startup fixture for selectedSnapshotError, lastMeaningfulProgress, and fresh-join readiness reason counts; decide whether the canonical owner is selected-snapshot query timeout, join bootstrap/runtime readiness stall, or no-progress summary retention between them; then repair only that startup owner path.",
  "proof": [
    "Focused 230547Z selected-snapshot timeout / bootstrap-readiness fixture",
    "Owner regression for terminal snapshot timeout versus retained last-meaningful progress",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "test/distributed/harness/cluster-segment-1.js",
    "test/distributed/harness/failure-bundle-segment-4.js",
    "test/distributed/harness/__tests__/cluster.test-part-3.js",
    "test/distributed/harness/__tests__/failure-bundle.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-published-snapshot-coverage-priority-spread-serial-wait-workflow-progress-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Published Snapshot Coverage Priority Spread Serial-Wait Workflow Progress Reentry](./done-20260506-rolling-restart-published-snapshot-coverage-priority-spread-serial-wait-workflow-progress-reentry.md)
closed by migration. The representative rerun no longer terminates on
published priority-spread workflow progress. Priority recovery now survives
only as last-meaningful predecessor context while startup times out on selected
snapshot visibility and inactive fresh joins.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-serial-wait-source-dominance-20260506T230547Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-serial-wait-source-dominance-20260506T230547Z/rolling-restart/`.
3. Result: failed after `131.4s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification is now `startup_recovery_blocked` with root cause
   class `startup`, dominant reason `BOOTSTRAP_PHASE_INCOMPLETE`, confidence
   `medium`, and signal `startupMode=fresh_join`.
6. Top-level publication convergence already reaches epoch `4`, status
   `PUBLISHED`, pending ACK count `0`, blocked-node count `0`,
   missing-published count `0`, and gate reason `snapshot_coverage=2/5`.
7. Active-gate no-progress shows `attemptsSinceProgress=3`,
   `lastMeaningfulProgressAttempt=9`, and the last meaningful state still has
   active `2/5`, snapshot coverage `2/5`, selected snapshot `11601...`, and
   selected missing published nodes `35a891...`, `8be8...`, and `ebc4...`.
8. That last meaningful state still records unresolved
   `eligible_but_no_operation_created` on `sql_transactions-p1` and
   `sql_write_operations-p1`, but terminal current progress and the top-level
   failure bundle no longer keep published priority-spread workflow debt as the
   live owner.
9. Terminal current progress collapses to blocker signature
   `inactive_nodes=3|snapshot_coverage=0/5|snapshot_error`, and
   `readinessFailure` points to `selectedSnapshotError`: admin snapshot and
   default-lane queries on `11601...` both time out after `100ms`.
10. Failure reason counts across the startup debt are:
    `BOOTSTRAP_PHASE_INCOMPLETE=3`, `SQL_ENGINE_UNAVAILABLE=3`,
    `LEADER_METADATA_INCOMPLETE=3`, `BOOTSTRAP_NOT_READY=3`, and
    `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING=3`.
11. Decision artifacts keep the inactive nodes `35a891...`, `8be8...`, and
    `ebc4...` in `startupMode=fresh_join`. The operator recommendation is:
    inspect snapshot query latency, admin readiness, and host/network
    stability before rerun.

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

- [ ] Extract the `230547Z` selected-snapshot timeout / bootstrap-readiness
      fixture.
- [ ] Decide the owner boundary: terminal snapshot timeout, bootstrap/runtime
      readiness stall, or no-progress retention crossover.
- [ ] Add the focused regression and repair the selected startup path.
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
4. The new owner probe must decide whether `selectedSnapshotError` on
   `11601...` is the direct startup boundary or a terminal presentation of the
   three fresh-join nodes that never complete bootstrap, SQL readiness, and
   leader-metadata recovery.

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
   from the startup selected-snapshot timeout / bootstrap-readiness boundary
   with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
