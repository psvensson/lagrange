# Rolling Restart Startup Steady-Published Selected Membership Deficit Readiness Timeout Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-06",
  "closed": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-steady-published-selected-membership-timeout-alignment-20260507T005730Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-steady-published-selected-membership-timeout-alignment-20260507T005730Z/rolling-restart/",
  "owner": "Startup steady-published selected-membership deficit over readiness-timeout fallback and last-meaningful progress retention",
  "boundary": "Startup steady-published selected-membership deficit / readiness-timeout owner",
  "dominantReason": "publication_missing_active_node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7",
  "currentState": "The steady-published selected-membership count-collapse seam is closed. The representative rerun now classifies as topology/publication_convergence_blocked on epoch 4 steady_published missingPublishedCount=3, with current publicationConvergence, priorityRecoveryObservation, and timeout progress aligned on the same three missing-active nodes.",
  "nextAction": "Use the successor topology publication-missing-active workflow-progress package to decide whether explicit publication_missing_active_node or operation_workflow_owner / workflow_progress / replace_remove_safety_blocked now owns the representative blocker.",
  "proof": [
    "Focused 002638Z steady-published selected-membership deficit / readiness-timeout fixture",
    "Focused steady_published current-versus-terminal progress normalization regressions",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-recovery-evidence-open-membership.test.js",
    "test/distributed/harness/publication-evidence-contract.js",
    "test/distributed/harness/cluster-segment-2.js",
    "test/distributed/harness/__tests__/publication-evidence-open-membership.test.js",
    "test/distributed/harness/__tests__/cluster-publication-membership-count.test.js"
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

Closure update on May 7, 2026: the focused steady-published normalization
repair now closes that owner seam. The fresh representative rerun
`test-output/reports/rolling-restart-after-steady-published-selected-membership-timeout-alignment-20260507T005730Z.report.json`
keeps top-level `publicationConvergence`, `priorityRecoveryObservation`, and
timeout progress aligned on the same three-node steady-published
missing-active set. The dominant blocker migrated away from startup readiness
fallback and into topology `publication_missing_active_node` with supporting
`operation_workflow_owner / workflow_progress` evidence. The successor package
is
[Rolling Restart Topology Publication Missing-Active Workflow Progress Reentry](./active-20260507-rolling-restart-topology-publication-missing-active-workflow-progress-reentry.md).

## Closing Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-steady-published-selected-membership-timeout-alignment-20260507T005730Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-steady-published-selected-membership-timeout-alignment-20260507T005730Z/rolling-restart/`.
3. Result: failed after `130.7s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification is now `publication_convergence_blocked` with root
   cause class `topology`, dominant reason
   `publication_missing_active_node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7`,
   and high confidence.
6. Publication convergence is epoch `4` `PUBLISHED` with pending ACK count
   `0`, blocked-node count `0`, missing-published count `3`, recovery
   protocol state `steady_published`, and explicit gate reasons
   `snapshot_coverage=2/5` plus one
   `publication_missing_active_node=<node>` reason for each missing node.
7. Current active-gate progress now agrees with that top-level publication
   debt: active `2/5`, snapshot coverage `2/5`, selected published active
   `2/5`, and `missingPublishedCount=3` on nodes `35a...`, `8be8...`, and
   `ebc4...`.
8. `priorityRecoveryObservation` agrees with that three-node deficit and keeps
   `priorityRecoveryClosureState=closure_satisfied_fresh` plus no unresolved
   priority recovery classes.
9. The timeout error string now keeps the same current publication debt in
   both summary surfaces:
   `publicationConvergence=blocked#recovery=steady_published#missingPublished=3`
   alongside `progress ... missingPublished=3`.
10. Supporting evidence has migrated with the blocker instead of outranking it:
    the failure bundle now surfaces `priorityRecoveryPartition=replica_operations-p1`,
    owner `operation_workflow_owner`, boundary `workflow_progress`, wait mode
    `event_driven`, next action `wait_for_operation_progress`, and log
    evidence for operation `d80b0e5b-2605-4257-abef-5fd0afb034b8` deferred by
    `replace_remove_safety_blocked`.

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

- [x] Extract the `002638Z` steady-published selected-membership deficit /
      readiness-timeout fixture.
- [x] Decide the owner boundary: current selected-membership deficit,
      readiness-timeout fallback, or stale last-meaningful normalization.
- [x] Add the focused regression and repair the selected owner path.
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
- [x] Any out-of-scope inherited violation has a linked follow-on package:
      [Guardrail Authority Alignment](./todo-20260426-guardrail-authority-alignment.md).

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

May 7 closure by migration:

1. Canonical publication evidence now keeps the steady-published selected
   missing-published count open through top-level publication convergence,
   priority recovery observation, and timeout progress diagnostics.
2. Focused regressions cover both the runtime publication evidence builder and
   the distributed harness projection of the same steady-published
   selected-membership deficit.
3. The representative rerun
   `rolling-restart-after-steady-published-selected-membership-timeout-alignment-20260507T005730Z`
   proves the old startup/readiness fallback seam is no longer selected. The
   live blocker migrated to topology `publication_missing_active_node` with
   supporting `operation_workflow_owner / workflow_progress` evidence.

## Validation

1. `./node_modules/.bin/tap test/control-plane/publication-recovery-evidence.test.js test/control-plane/publication-recovery-evidence-open-membership.test.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js test/distributed/harness/__tests__/cluster-publication-membership-count.test.js`
2. `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-recovery-evidence.js test/distributed/harness/publication-evidence-contract.js test/distributed/harness/cluster-segment-2.js`
3. `node scripts/check-guideline-literals.js src/control-plane/publication-recovery-evidence.js test/distributed/harness/publication-evidence-contract.js`
4. `node scripts/check-guideline-literals.js --include-tests test/control-plane/publication-recovery-evidence-open-membership.test.js test/distributed/harness/__tests__/publication-evidence-open-membership.test.js test/distributed/harness/__tests__/cluster-publication-membership-count.test.js`
5. `git diff --check`
6. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-steady-published-selected-membership-timeout-alignment-20260507T005730Z.report.json --fast-local --verbose`

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the startup steady-published selected-membership deficit /
   readiness-timeout boundary with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
