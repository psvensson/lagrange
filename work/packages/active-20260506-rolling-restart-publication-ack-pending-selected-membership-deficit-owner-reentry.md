# Rolling Restart Publication ACK-Pending Selected Membership Deficit Owner Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-startup-guidance-owner-alignment-20260506T232850Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-startup-guidance-owner-alignment-20260506T232850Z/rolling-restart/",
  "owner": "Publication recovery gate selected-membership deficit over pending ACK convergence and priority-recovery no-progress retention",
  "boundary": "Publication ACK-pending selected-membership deficit / pending-ACK owner",
  "dominantReason": "pending_ack_nodes",
  "currentState": "The startup timeout guidance seam is closed. The representative rerun now fails as publication_convergence_blocked on epoch 5 ACK_PENDING with pending ACK node 35a..., but the selected snapshot on ebc4... still carries missing-published nodes 11601... and 8be8... while normalized publicationConvergence.missingPublishedCount collapses to 0 and last meaningful progress retains eligible_but_no_operation_created predecessor debt.",
  "nextAction": "Extract the 232850Z publicationConvergence, activeGate progress, selectedMissingPublishedNodeIds, selectedPublishedActiveNodeIds, and lastMeaningfulProgress fixture; decide whether the canonical owner is current selected publication-membership deficit, pending ACK convergence, or stale authoritative-membership filtering between them; then repair only that owner path.",
  "proof": [
    "Focused 232850Z selected-membership deficit / pending-ACK fixture",
    "Owner regression for current selected missing-published evidence versus pending ACK dominance",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "test/distributed/harness/failure-bundle-segment-4.js",
    "test/distributed/harness/__tests__/failure-bundle-publication-closure-tail-test-cases.js",
    "test/distributed/harness/__tests__/failure-bundle.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-startup-active-gate-snapshot-coverage-selected-snapshot-timeout-bootstrap-readiness-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Startup Active Gate Snapshot Coverage Selected-Snapshot Timeout Bootstrap Readiness Reentry](./done-20260506-rolling-restart-startup-active-gate-snapshot-coverage-selected-snapshot-timeout-bootstrap-readiness-reentry.md)
closed by migration. The representative rerun no longer fails on startup
selected-snapshot timeout guidance. The live blocker is now publication
ACK-pending selected-membership evidence that disappears when the normalized
publication summary filters current selected missing-published nodes through a
lagging authoritative membership set.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-startup-guidance-owner-alignment-20260506T232850Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-startup-guidance-owner-alignment-20260506T232850Z/rolling-restart/`.
3. Result: failed after `132.9s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification is now `publication_convergence_blocked` with root
   cause class `topology`, dominant reason `pending_ack_nodes`, confidence
   `high`, and signals showing `pendingAckCount=1`,
   `missingPublishedCount=0`, `recoveryProtocolState=publication_pending`,
   and `prioritySpreadPending=true`.
6. Publication convergence is epoch `5` `ACK_PENDING` with pending ACK node
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, blocked-node count `0`,
   normalized missing-published count `0`, and recovery protocol state
   `publication_pending`.
7. The summary error string and triage summary still record
   `publicationConvergence=blocked#status=ACK_PENDING#recovery=publication_pending#pendingAck=1#missingPublished=2`,
   so the normalized `missingPublishedCount=0` surface is inconsistent with
   the same representative artifact.
8. Current active-gate progress reaches active `3/5`, snapshot coverage `2/5`,
   selected snapshot node `ebc4...`, selected published active count `3`, and
   selected missing-published nodes `11601...` and `8be8...`.
9. Last meaningful progress attempt `8` still records blocker signature
   `inactive_nodes=2|snapshot_coverage=2/5|priority_recovery_progress_class=eligible_but_no_operation_created`,
   while current progress keeps only
   `recovering_in_flight` / `blocked_unclassified` semantic-state debt.
10. The new owner question is therefore narrow: whether explicit current
    selected publication-membership deficit must dominate pending ACK debt when
    the selected snapshot accounts for the full five-node membership but the
    authoritative publication summary lags behind it.

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

- [ ] Extract the `232850Z` selected-membership deficit / pending-ACK fixture.
- [ ] Decide the owner boundary: selected-membership deficit, pending ACK
      convergence, or stale authoritative-membership filtering.
- [ ] Add the focused regression and repair the selected publication path.
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

May 6 migration from startup timeout guidance:

1. Startup guidance now keeps bootstrap-readiness triage when timeout is only
   the terminal observation, and the representative rerun no longer fails on
   `selectedSnapshotError`.
2. The fresh `232850Z` rerun moved again to epoch `5` `ACK_PENDING`
   publication convergence with pending ACK node `35a...`.
3. The selected snapshot on `ebc4...` still reports missing-published nodes
   `11601...` and `8be8...`, but normalized publication convergence drops that
   current deficit back to `missingPublishedCount=0`.
4. The next slice must decide whether that filtered-away selected-membership
   deficit is the canonical publication owner or only supporting evidence under
   pending ACK debt.

## Validation

1. `./node_modules/.bin/tap test/distributed/harness/__tests__/failure-bundle.test.js -g "prefers startup readiness guidance over timeout guidance when timeout is only terminal observation debt"`
2. `./node_modules/.bin/tap test/distributed/harness/__tests__/failure-bundle.test.js`
3. `node scripts/check-guideline-literals.js test/distributed/harness/failure-bundle-segment-5.js`
4. `node scripts/check-guideline-literals.js --include-tests test/distributed/harness/__tests__/failure-bundle-publication-closure-tail-test-cases.js`
5. `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/failure-bundle-segment-5.js`
6. `git diff --check`
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-startup-guidance-owner-alignment-20260506T232850Z.report.json --fast-local --verbose`

## Done When

1. The representative path either clears the epoch-5 `ACK_PENDING`
   selected-membership deficit boundary or migrates to a different named owner
   with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
