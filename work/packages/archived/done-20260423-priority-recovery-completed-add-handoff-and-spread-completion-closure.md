# Priority-Recovery Completed-Add Handoff And Spread-Completion Closure

## Why

The fresh 2026-04-23 current-worktree `node-join-under-load` rerun no longer
fails first on operation-scheduling pressure.

The new dominant witness is:

1. `replica_operations-p1`
2. dominant reason `priority_recovery_rebalancer_handoff_stalled`
3. `blockingBoundary = rebalancer_handoff`
4. `latestOperationStatus = active`
5. `latestOperationWorkflowStep = ACTIVE`
6. `nextRequiredAction = schedule_followup_rebalance`
7. `semanticStateId = blocked_unclassified`
8. no remaining priority-recovery blocker reasons

The same fresh decision snapshot shows the follow-up `ADD` operation on that
partition as terminal `ACTIVE` with
`targetVisibilityState = active_operational` on an eligible node.

That means the remaining seam is now narrow and local:
the shared priority-recovery assessment does not treat a completed `ADD ACTIVE`
handoff on an eligible operational target as spread-satisfying evidence, so the
partition falls back to `blocked_unclassified` and the rebalancer-handoff stall
grammar even though the target is already visible as operational.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [System grammar whole and confirmation entry sprint](../sprints/archived/done-2026-q2-system-grammar-whole-and-confirmation-entry.md)

Predecessor package:

1. [Fresh node-join-under-load current-worktree confirmation](./done-20260423-node-join-under-load-current-worktree-confirmation.md)

## In Scope

1. Reproduce the fresh `replica_operations-p1` handoff shape directly in the
   shared priority-recovery snapshot tests.
2. Treat completed `ADD ACTIVE` follow-up operations on eligible operational
   targets as spread-satisfying evidence on the shared assessment path.
3. Remove the touched fallback from `blocked_unclassified` /
   `rebalancer_handoff` when the same snapshot already has enough evidence to
   classify the partition as `spread_satisfied_in_flight`.
4. Re-run the named `node-join-under-load` scenario after focused proof is
   green so blocker migration is explicit again.

## Out Of Scope

1. Broad publication-summary redesign
2. New priority-recovery vocabulary outside the existing shared grammar
3. Startup/rebalancer middle-layer work outside the touched handoff seam
4. More than one broad harness rerun before focused proof is green

## Invariants

1. `PriorityRecoveryDecisionSnapshot` remains the single owner-facing read
   surface for this slice.
2. Terminal `ADD ACTIVE` should remain terminal for workflow semantics; the
   fix must only widen spread-completion evidence, not redefine operation
   lifecycle semantics.
3. Presentation surfaces must keep consuming the shared decision snapshot
   rather than inventing a special-case handoff interpretation.

## Hotspots

1. `src/control-plane/priority-recovery-snapshot.js`
2. `test/control-plane/priority-recovery-snapshot.test.js`
3. `architecture/current-owner-maps.md`
4. `test-output/report.json`
5. `test-output/.playback/report/node-join-under-load/`

## Shared Boundary Contract

- Semantic owner:
  `PriorityRecoveryDecisionSnapshot` assessment, completion, actuation, and
  progress composition on the `replica_operations-p1` handoff seam
- Canonical contract shape / vocabulary:
  terminal `ADD ACTIVE` follow-up operations may stay terminal for workflow
  semantics while still counting as spread-satisfying evidence when
  `targetVisibilityState = active_operational` on an eligible target
- Allowed consumers:
  shared completion and progress contracts, observation snapshots, admin, and
  harness/failure-bundle consumers
- Prohibited reinterpretations:
  report-local handoff exceptions, reclassifying `ADD ACTIVE` as in-flight
  globally, or keeping `blocked_unclassified` once the shared snapshot already
  has spread-satisfying evidence
- Primary diagnostics / proof surfaces:
  focused priority-recovery snapshot tests and the rerun of
  `node-join-under-load`

## Detection / Analysis Tasks

- [x] Reproduce the fresh `replica_operations-p1` handoff shape in focused
      snapshot tests.
- [x] Confirm exactly why the completed `ADD ACTIVE` follow-up does not count
      toward spread completion today.
- [x] Record the expected post-fix classification for semantic state,
      completion state, and progress contract on this seam.

## Implementation Tasks

- [x] Add failing focused snapshot proof first for the completed-add handoff
      case.
- [x] Reuse the existing spread-completion path instead of inventing a new
      handoff-only grammar.
- [x] Remove the touched fallback to `blocked_unclassified` /
      `rebalancer_handoff` when spread-satisfying evidence is already present.
- [x] Re-run `node-join-under-load` after focused proof is green.

## Residual Closure Inventory

- [x] Completed-add handoff classification is fixed on the shared snapshot
      owner path.
- [x] Tail admin and harness consumers inherit the fix through the shared
      snapshot without local patching.
- [x] Fresh scenario blocker migration is recorded after the rerun.
- [x] Required focused proof and metrics proof are complete.

## Execution Notes

1. Reproduced the fresh `replica_operations-p1` handoff seam in the shared
   snapshot suite and confirmed the root cause:
   spread completion only considered non-terminal operation contexts, so a
   completed follow-up `ADD` that was already operational on an eligible node
   stayed invisible to the spread-satisfaction path.
2. Added one shared helper that keeps terminal workflow semantics intact while
   widening spread-completion evidence to include completed `ADD ACTIVE`
   follow-up operations exactly when they are operationally visible on an
   eligible target.
3. Tightened the shared progress contract so
   `completion.state = spread_satisfied_in_flight` resolves directly to
   `ready/proceed` instead of falling through to the
   `blocked_unclassified` / `rebalancer_handoff` fallback.
4. Updated [architecture/current-owner-maps.md](../../architecture/current-owner-maps.md)
   so the durable `PriorityRecoveryDecisionSnapshot` contract now states that
   completed follow-up `ADD` operations can remain terminal for workflow
   semantics while still satisfying spread when the target is already
   operational and eligible.
5. Re-ran
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`
   on the current worktree at 2026-04-23 06:22 UTC. The fresh authoritative
   harness report at `test-output/report.json` is timestamped
   `2026-04-23T06:26:59.422Z` and records `node-join-under-load` as passed.
6. The scenario-local
   `test-output/.playback/report/node-join-under-load/failure-bundle.json`
   and `triage-summary.json` files remained at `2026-04-23T06:11:29Z` from the
   earlier failed rerun, so package closure treats the fresh top-level harness
   report as the authority for the passing confirmation instead of reusing the
   stale failure-only playback summaries.

## Validation

1. `npx tap test/control-plane/priority-recovery-snapshot.test.js`
2. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`
3. `npm run test:metrics`

## Done When

1. A completed `ADD ACTIVE` follow-up on an eligible operational target counts
   as spread-satisfying evidence on the shared snapshot path.
2. The touched partition no longer falls back to `blocked_unclassified` /
   `rebalancer_handoff` when the shared snapshot already has that evidence.
3. The post-fix scenario rerun either passes or names the next blocker
   explicitly from fresh artifacts.
