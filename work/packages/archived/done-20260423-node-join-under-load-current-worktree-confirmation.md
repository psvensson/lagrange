# Fresh Node-Join-Under-Load Current-Worktree Confirmation

## Why

The latest retained `node-join-under-load` failure artifact from 2026-04-23
showed a narrowed blocker on the priority-recovery pilot slice, but several
focused closures landed after that artifact and now test green locally.

This package exists to refresh the blocker truth on the current worktree before
starting more structural work.

The package is intentionally narrow:

1. rerun the named scenario on the current worktree
2. capture the new artifact set
3. decide whether the blocker is still on the touched runtime boundary
4. either execute one narrow follow-on package or split it explicitly

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [System grammar whole and confirmation entry sprint](../sprints/archived/done-2026-q2-system-grammar-whole-and-confirmation-entry.md)

## In Scope

1. Run `node-join-under-load` once on the current worktree with the normal
   local harness config.
2. Record the new report path, failure bundle path, and triage summary path.
3. Compare the new dominant blocker against the 2026-04-23 blocker record.
4. If the blocker remains on the touched priority-recovery boundary and is
   narrow enough, execute the next owner-boundary fix package in the same work
   cycle.
5. If the blocker migrates outside the touched boundary, split the next
   package explicitly and update sprint links in the same change.

## Out Of Scope

1. Broad startup/rebalancer middle-layer implementation before the fresh rerun
2. A second broad runtime-grammar redesign package
3. Multiple repeated harness reruns before one fresh blocker is named and
   acted on

## Invariants

1. The fresh report, failure bundle, and triage summary are the authority for
   blocker naming in this package.
2. The shared priority-recovery decision snapshot remains the canonical owner
   surface for the touched control-plane slice.
3. If the blocker migrates, the move must be recorded explicitly before this
   package is renamed away from `active-...`.

## Hotspots

1. `test-output/reports/`
2. `test-output/reports/.playback/`
3. `test/distributed/harness/`
4. `src/control-plane/priority-recovery-snapshot.js`
5. `src/rebalancer/`

## Shared Boundary Contract

- Semantic owner:
  the fresh scenario confirmation pass consuming the shared
  `PriorityRecoveryDecisionSnapshot` and failure-bundle surfaces
- Canonical contract shape / vocabulary:
  one named dominant blocker from the current report, failure bundle, and triage
  summary, with blocker migration recorded relative to the last retained rerun
- Allowed consumers:
  this sprint, the next narrow work package, and the scenario-confirmation
  record
- Prohibited reinterpretations:
  using stale artifacts as the primary blocker source once fresh artifacts
  exist, or inferring new blocker meaning from raw row lag outside the shared
  decision snapshot
- Primary diagnostics / proof surfaces:
  current report JSON, scenario failure bundle, triage summary, and any focused
  proof required by the next narrow package

## Detection / Analysis Tasks

- [x] Run the fresh `node-join-under-load` scenario on the current worktree.
- [x] Capture the new report, failure-bundle, and triage-summary paths.
- [x] Compare the new dominant blocker to the 2026-04-23 retained blocker.
- [x] Identify whether the blocker remains on the touched priority-recovery
      owner seam or has migrated.
- [x] Split or activate the next narrow package accordingly.

## Implementation Tasks

- [x] Update any touched sprint or package links when the next package is
      split.

## Residual Closure Inventory

- [x] Fresh blocker truth has been recorded from the current worktree.
- [x] Blocker migration from the 2026-04-23 rerun is explicit.
- [x] The next concern is either fixed or split into one narrow package.
- [x] Tail tracking documents point at the fresh blocker package rather than an
      older artifact.
- [ ] Required proof for any follow-on implementation is complete.

## Execution Notes

1. Ran
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`
   on the current worktree at 2026-04-23 06:07 UTC.
2. The fresh current-worktree report landed at `test-output/report.json`.
3. The fresh scenario artifact set landed at:
   `test-output/.playback/report/node-join-under-load/failure-bundle.json`,
   `test-output/.playback/report/node-join-under-load/triage-summary.json`,
   and
   `test-output/.playback/report/failure-bundles/run-failure-bundle.json`.
4. The blocker migrated materially from the retained 2026-04-23 rerun:
   the previous dominant reason
   `priority_recovery_operation_scheduling_persist_blocked_by_pressure`
   no longer dominates, pending writes on the dominant witness fell from `241`
   to `39`, and the fresh dominant reason is now
   `priority_recovery_rebalancer_handoff_stalled`.
5. The fresh dominant witness remains `replica_operations-p1`, but its shape is
   different:
   `latestOperationStatus = active`,
   `latestOperationWorkflowStep = ACTIVE`,
   `nextRequiredAction = schedule_followup_rebalance`,
   `blockingBoundary = rebalancer_handoff`,
   `semanticStateId = blocked_unclassified`,
   with no priority-recovery blocker reasons remaining.
6. The fresh decision snapshots show `replica_operations-p1` as the only
   unresolved priority-recovery partition. The other touched priority
   partitions now classify as `spread_satisfied_in_flight`.
7. The next concern is therefore split explicitly to
   [Priority-recovery completed-add handoff and spread-completion closure](./done-20260423-priority-recovery-completed-add-handoff-and-spread-completion-closure.md).

## Validation

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`
2. Focused proof required by any follow-on narrow package
3. `npm run test:metrics` before closing any implementation follow-on package

## Done When

1. One fresh current-worktree `node-join-under-load` artifact set exists.
2. The surviving blocker is named from that artifact set.
3. The next concern is either fixed in one narrow package or split into one
   narrow package with links updated in the same change.
