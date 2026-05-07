# Rolling Restart Startup Steady-Published Selected Membership Deficit Readiness Timeout Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-publication-membership-open-selected-cohort-20260507T002638Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-publication-membership-open-selected-cohort-20260507T002638Z/rolling-restart/",
  "owner": "Startup steady-published selected-membership deficit over readiness-timeout fallback and last-meaningful progress retention",
  "boundary": "Startup steady-published selected-membership deficit / readiness-timeout owner",
  "dominantReason": "readiness_probe_timeout_fallback",
  "currentState": "The pending-ACK selected-membership seam is closed. The representative rerun now fails as startup_recovery_blocked on a fresh-join readiness timeout for 7493... while priorityRecoveryObservation and current activeGate progress on selected snapshot 35a... still carry a four-node steady-published selected-membership deficit that top-level publicationConvergence and lastMeaningfulProgress partially collapse back to 0.",
  "nextAction": "Extract the 002638Z publicationConvergence, priorityRecoveryObservation, activeGate current progress, lastMeaningfulProgress, and error-string fixture; decide whether the canonical owner is current steady-published selected-membership deficit, readiness-timeout fallback, or stale last-meaningful missingPublished normalization between them; then repair only that owner path.",
  "proof": [
    "Focused 002638Z steady-published selected-membership deficit / readiness-timeout fixture",
    "Owner regression for current versus last-meaningful missingPublished normalization under steady_published startup recovery",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-recovery-evidence-open-membership.test.js",
    "test/distributed/harness/publication-evidence-contract.js",
    "test/distributed/harness/failure-bundle-segment-5.js",
    "test/distributed/harness/__tests__/failure-bundle.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-publication-ack-pending-selected-membership-deficit-owner-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Publication ACK-Pending Selected Membership Deficit Owner Reentry](./done-20260506-rolling-restart-publication-ack-pending-selected-membership-deficit-owner-reentry.md)
closed by migration. The representative rerun no longer fails on epoch-5
`ACK_PENDING` publication debt. The live blocker is now a startup
`steady_published` disagreement where current selected publication-membership
deficit evidence survives in `priorityRecoveryObservation` and current
active-gate progress, but top-level `publicationConvergence` and
`lastMeaningfulProgress` drop parts of that deficit while the failure
classification falls back to readiness-timeout startup debt.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-publication-membership-open-selected-cohort-20260507T002638Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-publication-membership-open-selected-cohort-20260507T002638Z/rolling-restart/`.
3. Result: failed after `126.9s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification is now `startup_recovery_blocked` with root cause
   class `startup`, dominant reason
   `readiness_probe_timeout_fallback=Node readiness probe timed out for 7493...`,
   confidence `medium`, and signal `startupMode=fresh_join`.
6. Publication convergence is epoch `3` `PUBLISHED` with pending ACK count
   `0`, blocked-node count `0`, missing-published count `0`, and recovery
   protocol state `steady_published`.
7. Current active-gate progress reaches active `3/5`, snapshot coverage `1/5`,
   selected snapshot node `35a...`, selected published-active count `1`, and
   selected missing-published nodes `11601...`, `35a...`, `8be8...`, and
   `ebc4...`, with `missingPublishedCount=4`.
8. `priorityRecoveryObservation` agrees with that four-node deficit and keeps
   `priorityRecoveryClosureState=closure_satisfied_fresh` plus no unresolved
   priority recovery classes.
9. `lastMeaningfulProgress` keeps the same selected missing-published node ids
   but collapses `missingPublishedCount` back to `0`, while the terminal error
   string also reports `progress ... missingPublished=0` alongside
   `publicationConvergence=blocked#recovery=steady_published#missingPublished=4`.
10. The new owner question is therefore narrow: whether the canonical owner is
    the current steady-published selected-membership deficit itself, the
    readiness-timeout fallback on `7493...`, or the stale
    current-versus-last-meaningful normalization crossover that hides live
    publication debt inside startup failure guidance.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract a focused `002638Z` steady-published fixture for top-level
   `publicationConvergence`, `priorityRecoveryObservation`, current
   active-gate progress, `lastMeaningfulProgress`, and the terminal error
   string.
2. Decide whether the canonical owner is current selected-membership deficit,
   readiness-timeout fallback, or stale last-meaningful normalization between
   them.
3. Repair only the selected startup/publication owner path.
4. Preserve the closed pending-ACK selected-membership regression.

## Out Of Scope

1. Reopening the closed epoch-5 `ACK_PENDING` package unless pending ACK debt
   directly re-enters the representative blocker.
2. Harness-only timeout increases, startup exemptions, or publication
   suppressions that hide the disagreement.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Current steady-published selected-membership deficit owns the boundary when
   current active-gate progress and `priorityRecoveryObservation` agree on the
   missing-published node set and no unresolved priority recovery classes
   remain.
2. Readiness-timeout fallback owns the boundary when the startup probe timeout
   on `7493...` is the direct blocker and publication evidence is only stale
   supporting context.
3. Last-meaningful progress may retain predecessor context, but it must not
   erase a stronger current selected-membership deficit once startup
   publication evidence remains live.

Canonical contract shape:

1. `publicationConvergence`, `priorityRecoveryObservation`, current
   active-gate progress, `lastMeaningfulProgress`, and the terminal error text
   must agree whether the live steady-published selected-membership deficit is
   present.
2. If startup timeout is the owner, the proof must show why the current
   four-node selected-membership deficit is stale, non-authoritative, or
   subordinate to readiness failure.
3. If current publication deficit remains live, the startup failure guidance
   must preserve it without collapsing counts back to zero in downstream
   summary surfaces.

## Residual Closure Inventory

- [ ] Extract the `002638Z` steady-published selected-membership deficit /
      readiness-timeout fixture.
- [ ] Decide the owner boundary: current selected-membership deficit,
      readiness-timeout fallback, or stale last-meaningful normalization.
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

## Progress Notes

May 6 migration from the pending-ACK selected-membership package:

1. Canonical publication evidence now preserves current selected-membership
   deficit while publication recovery remains open and the selected snapshot
   closes the full expected membership cohort.
2. The representative rerun
   `rolling-restart-after-publication-membership-open-selected-cohort-20260507T002638Z`
   proves the old `ACK_PENDING` owner seam is closed: publication reaches
   `steady_published` with `pendingAckCount=0`.
3. The same artifact immediately exposes a new startup disagreement:
   `priorityRecoveryObservation` and current active-gate progress keep a
   four-node selected-membership deficit, while top-level
   `publicationConvergence` and `lastMeaningfulProgress` collapse parts of it
   back to zero under readiness-timeout failure guidance.

## Validation

1. Pending.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the startup steady-published selected-membership deficit /
   readiness-timeout boundary with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
