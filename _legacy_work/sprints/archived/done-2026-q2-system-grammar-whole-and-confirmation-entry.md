# System Grammar Whole And Confirmation Entry Sprint (AGPL)

## Goal

Make the current runtime-grammar slice operationally trustworthy on the current
worktree, then use that fresh truth to enter the remaining startup and
rebalancer middle-layer closure work without reopening another broad grammar
umbrella.

The sprint target is:

1. rerun one named harness scenario on the current worktree
2. treat the fresh artifact set as the only authority for the next blocker
3. split any retained blocker into one narrow owner-boundary package
4. enter the existing middle-layer closure sprint only after the grammar entry
   gate is clean enough to stop hiding blockers behind stale or mixed meaning

## Status

Closed on 2026-04-23.

The entry-gate rerun first exposed one narrow completed-add handoff seam on
`replica_operations-p1`. The follow-on package closed that shared snapshot
gap, re-ran `node-join-under-load`, and the current-worktree scenario now
passes from the fresh authoritative harness report.

## Why This Sprint Exists

The last retained `node-join-under-load` failure artifact from 2026-04-23 was
good enough to show that the grammar pilot slice had improved materially, but
it is no longer sufficient as the sole steering source for active execution.

Since that rerun:

1. focused proof went green for the shared priority-recovery snapshot
2. focused proof went green for the harness/failure-bundle dominant-reason
   shaping
3. focused proof went green for the summary-row reuse closure on the stale
   follow-up creation seam
4. the repo metrics ratchets returned to green

That means the next step cannot be another strategy-only pass. The system needs
one current-worktree scenario truth pass so the next package is anchored in the
actual surviving blocker rather than in an older artifact or in package intent.

## Relationship To Current Work

This sprint follows:

1. [Runtime grammar hierarchy and actuation closure sprint](./done-2026-q2-runtime-grammar-hierarchy-and-actuation-closure.md)
2. [Coherence closure before harness sprint](./done-2026-q2-remaining-runtime-hotspot-reduction.md)

This sprint is the entry gate for:

1. [Startup and rebalancer middle-layer closure sprint](../todo-2026-q2-startup-and-rebalancer-middle-layer-closure.md)

The middle-layer sprint stays out of active execution until this sprint
establishes one fresh blocker truth for the current worktree and confirms that
the priority-recovery pilot no longer fails first because of a grammar hole.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Run a fresh `node-join-under-load` harness confirmation on the current
   worktree.
2. Capture the resulting report, failure bundle, and triage summary as the new
   authoritative blocker record.
3. Compare the fresh blocker against the now-green focused proof so blocker
   migration is explicit.
4. If the blocker remains in the touched runtime boundary and is narrow enough,
   execute the next owner-boundary package in this sprint.
5. If the blocker has migrated outside the touched runtime boundary, split the
   next package explicitly and stop widening the current concern.
6. Keep the existing startup/rebalancer middle-layer sprint blocked until this
   entry gate is satisfied.

## Out Of Scope

1. Broad repo-wide grammar rewriting outside the already-touched control-plane
   and convergence seams
2. New feature delivery or roadmap expansion
3. Starting the full middle-layer sprint before the fresh blocker truth is
   recorded
4. Treating older 2026-04-23 artifacts as authoritative once the new rerun
   exists

## Scenario Target

1. `node-join-under-load`

## Completed Packages

1. [Fresh node-join-under-load current-worktree confirmation](../../packages/done-20260423-node-join-under-load-current-worktree-confirmation.md)
2. [Priority-recovery completed-add handoff and spread-completion closure](../../packages/done-20260423-priority-recovery-completed-add-handoff-and-spread-completion-closure.md)

The confirmation package moved the blocker from operation-scheduling pressure
to a narrower priority-recovery handoff seam on `replica_operations-p1`.
The follow-on package closed that seam on the shared snapshot path and the
fresh rerun now passes.

## Entry Gate

This sprint closed once all of the following were true:

1. the current-worktree `node-join-under-load` rerun has completed once
2. the resulting artifacts identify one named dominant blocker
3. blocker migration from the 2026-04-23 rerun is recorded explicitly
4. the active next package is one narrow owner-boundary concern rather than
   another grammar umbrella

## Simplification Rules

1. Fresh harness artifacts outrank older artifacts and package intent.
2. The canonical priority-recovery decision snapshot remains the read-facing
   owner surface for the touched slice.
3. Raw cache-visible row lag is `conditions` evidence only; it must not become
   a second decision path.
4. Presentation surfaces may summarize the shared decision snapshot, but they
   must not invent new blocker meaning.
5. If the blocker has moved, record the move and split it cleanly instead of
   patching inside the wrong package.

## Validation

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`
2. Focused owner-path or harness tests required by any follow-on package
3. `npm run test:metrics` before closing any implementation package opened by
   this sprint

## Exit Check

1. The sprint has one fresh current-worktree scenario truth artifact.
2. The surviving blocker is named from that artifact set, not inferred from an
   older report.
3. Any surviving blocker is either fixed in one narrow package or split into
   one narrow package before this sprint hands off to the middle-layer sprint.
4. The startup/rebalancer middle-layer sprint is entered only after this
   entry-gate sprint stops discovering grammar ambiguity on the priority-
   recovery pilot slice.
