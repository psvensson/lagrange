# Rolling Restart Publication ACK-Pending Selected Membership Deficit Owner Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-publication-membership-open-selected-cohort-20260507T002638Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-publication-membership-open-selected-cohort-20260507T002638Z/rolling-restart/",
  "owner": "Publication recovery gate selected-membership deficit over pending ACK convergence and priority-recovery no-progress retention",
  "boundary": "Publication ACK-pending selected-membership deficit / pending-ACK owner",
  "dominantReason": "readiness_probe_timeout_fallback",
  "currentState": "The pending-ACK selected-membership seam is closed. The representative rerun now reaches epoch 3 steady_published with pending ACK count 0, but startup failure classification falls back to readiness_probe_timeout_fallback on 7493... while current active-gate progress and priorityRecoveryObservation still carry a four-node selected-membership deficit and last meaningful progress collapses missingPublishedCount back to 0.",
  "nextAction": "Continue in work/packages/active-20260506-rolling-restart-startup-steady-published-selected-membership-deficit-readiness-timeout-reentry.md to extract the 002638Z steady-published selected-membership deficit / readiness-timeout fixture and repair only that owner path.",
  "proof": [
    "Focused 232850Z selected-membership deficit / pending-ACK fixture",
    "Owner regression for current selected missing-published evidence versus pending ACK dominance",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Successor package split for the steady-published startup selected-membership deficit seam"
  ],
  "touchedFiles": [
    "src/control-plane/priority-recovery-observation-snapshot-stage-1.js",
    "src/control-plane/priority-recovery-observation-snapshot-stage-2.js",
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/priority-recovery-snapshot-core-04-test-cases.js",
    "test/control-plane/publication-recovery-evidence-open-membership.test.js",
    "test/distributed/harness/publication-evidence-contract.js",
    "test/distributed/harness/__tests__/publication-evidence-open-membership.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-startup-active-gate-snapshot-coverage-selected-snapshot-timeout-bootstrap-readiness-reentry.md",
  "closed": "2026-05-06",
  "successor": "work/packages/active-20260506-rolling-restart-startup-steady-published-selected-membership-deficit-readiness-timeout-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Startup Active Gate Snapshot Coverage Selected-Snapshot Timeout Bootstrap Readiness Reentry](./done-20260506-rolling-restart-startup-active-gate-snapshot-coverage-selected-snapshot-timeout-bootstrap-readiness-reentry.md)
closed by migration into
[Rolling Restart Startup Steady-Published Selected Membership Deficit Readiness Timeout Reentry](./active-20260506-rolling-restart-startup-steady-published-selected-membership-deficit-readiness-timeout-reentry.md).

## Closure Summary

1. Added a same-epoch witness-selection repair so priority recovery snapshots
   prefer the current explicit `needs_operation` snapshot over stale terminal
   follow-up rows.
2. Repaired canonical publication evidence so open publication recovery keeps a
   full selected-membership deficit visible when the selected snapshot closes
   the expected membership accounting even if authoritative publication
   membership still lags behind it.
3. Added dedicated runtime and harness regressions for the open selected
   publication-membership case, reran the focused suites, and cleared the
   touched-file guardrails.
4. The representative rerun
   `rolling-restart-after-publication-membership-open-selected-cohort-20260507T002638Z`
   closed the `ACK_PENDING` owner seam and exposed a new startup
   `steady_published` blocker.

## Final Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-publication-membership-open-selected-cohort-20260507T002638Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-publication-membership-open-selected-cohort-20260507T002638Z/rolling-restart/`.
3. Result: failed after `126.9s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification moved to `startup_recovery_blocked` with root cause
   class `startup`, dominant reason
   `readiness_probe_timeout_fallback=Node readiness probe timed out for 7493...`,
   and signal `startupMode=fresh_join`.
6. Publication convergence now reaches epoch `3` `PUBLISHED` with
   `pendingAckCount=0`, `blockedNodeCount=0`, `missingPublishedCount=0`, and
   recovery protocol state `steady_published`.
7. The closed `ACK_PENDING` seam is gone: the top-level canonical owner no
   longer reports pending ACK debt or open publication recovery.
8. Current active-gate progress on selected snapshot `35a...` still reports
   selected published active count `1`, selected missing-published nodes
   `11601...`, `35a...`, `8be8...`, and `ebc4...`, plus
   `missingPublishedCount=4`.
9. `priorityRecoveryObservation` agrees with that current steady-published
   four-node deficit, but `lastMeaningfulProgress` collapses
   `missingPublishedCount` back to `0` while retaining the same selected
   missing-published node ids.
10. The new owner question is therefore narrow: whether the live blocker is the
    current steady-published selected-membership deficit itself, the startup
    readiness-timeout fallback on `7493...`, or the stale last-meaningful
    normalization that erases current publication debt between them.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract a focused `232850Z` publication fixture for current selected
   missing-published node ids, selected published-active membership, pending
   ACK node ids, and last meaningful priority-recovery progress.
2. Decide whether the canonical owner is current selected
   publication-membership deficit, pending ACK convergence, or stale
   authoritative-membership filtering between them.
3. Repair only the selected publication owner path.
4. Preserve the closed startup timeout guidance regression.

## Out Of Scope

1. Reopening the closed startup selected-snapshot timeout guidance package
   unless that exact owner signature re-enters the representative blocker.
2. Harness-only timeout increases or publication exemptions that hide runtime
   disagreement.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Selected-membership deficit owns the boundary when the current selected
   snapshot explicitly names missing-published nodes and closes the full
   membership accounting for the expected cluster size.
2. Pending ACK convergence owns the boundary when required-ack evidence remains
   open without an explicit current selected missing-published deficit.
3. Last meaningful priority-recovery no-operation debt may remain predecessor
   context, but it must not erase or reopen the live publication owner once
   current publication-membership evidence is stronger.

Canonical contract shape:

1. `publicationConvergence.missingPublishedCount`,
   `publicationConvergence.missingPublishedNodeIds`, summary error text, and
   failure-class signals must agree whether current selected
   publication-membership deficit is present.
2. Active-gate selected missing-published node ids must survive authoritative
   filtering when the selected snapshot itself closes the expected membership
   accounting and the top-level publication summary is lagging.
3. If pending ACK remains the owner, the proof must show why the current
   selected missing-published nodes are stale or non-authoritative.

## Residual Closure Inventory

- [x] Extract the `232850Z` selected-membership deficit / pending-ACK fixture.
- [x] Decide the owner boundary: selected-membership deficit, pending ACK
      convergence, or stale authoritative-membership filtering.
- [x] Add the focused regression and repair the selected publication path.
- [x] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.
- [x] Split the follow-on steady-published startup blocker into a new active
      package before closure.

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
- [x] The new blocker is recorded in a successor package before broader work
      resumes.

## Progress Notes

May 6 migration from startup timeout guidance:

1. Startup guidance now keeps bootstrap-readiness triage when timeout is only
   the terminal observation, and the representative rerun no longer fails on
   `selectedSnapshotError`.
2. The fresh `232850Z` rerun moved again to epoch `5` `ACK_PENDING`
   publication convergence with pending ACK node `35a...`.
3. The selected snapshot on `ebc4...` still reports missing-published nodes
   `11601...` and `8be8...`, but normalized publication convergence drops that
   current deficit back to `missingPublishedCount=0`.
4. The next slice had to decide whether that filtered-away selected-membership
   deficit was the canonical publication owner or only supporting evidence
   under pending ACK debt.

May 6 open selected-membership repair:

1. Priority recovery witness selection now prefers the current same-epoch
   explicit semantic-state snapshot instead of a stale terminal follow-up row
   when both describe the same partition.
2. Canonical publication evidence and the distributed harness now widen the
   effective publication membership cohort while publication recovery remains
   open and the selected snapshot fully accounts for expected membership.
3. Focused runtime proofs, the full priority recovery snapshot suite, the full
   failure-bundle suite, and touched-file guardrails passed after the repair.
4. Representative rerun
   `rolling-restart-after-publication-membership-open-selected-cohort-20260507T002638Z`
   failed by migration: pending ACK debt is gone, but startup steady-published
   evidence now disagrees over whether the current four-node selected
   membership deficit remains live.

## Validation

1. `./node_modules/.bin/tap test/control-plane/publication-recovery-evidence.test.js test/control-plane/publication-recovery-evidence-open-membership.test.js`
2. `./node_modules/.bin/tap test/distributed/harness/__tests__/failure-bundle.test.js`
3. `./node_modules/.bin/tap test/distributed/harness/__tests__/publication-evidence-open-membership.test.js`
4. `./node_modules/.bin/tap test/control-plane/priority-recovery-snapshot.test.js`
5. `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-recovery-evidence.js src/control-plane/priority-recovery-observation-snapshot-stage-1.js src/control-plane/priority-recovery-observation-snapshot-stage-2.js test/distributed/harness/publication-evidence-contract.js`
6. `node scripts/check-guideline-literals.js src/control-plane/publication-recovery-evidence.js src/control-plane/priority-recovery-observation-snapshot-stage-1.js src/control-plane/priority-recovery-observation-snapshot-stage-2.js test/distributed/harness/publication-evidence-contract.js`
7. `node scripts/check-guideline-literals.js --include-tests test/control-plane/priority-recovery-snapshot-core-04-test-cases.js test/control-plane/publication-recovery-evidence-open-membership.test.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js`
8. `git diff --check`
9. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-publication-membership-open-selected-cohort-20260507T002638Z.report.json --fast-local --verbose`

## Done When

1. The representative path either clears the epoch-5 `ACK_PENDING`
   selected-membership deficit boundary or migrates to a different named owner
   with replayable evidence.
2. Sprint bookkeeping points to the successor package as the sole current
   representative owner.
