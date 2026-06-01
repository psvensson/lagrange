# Priority-Recovery Completion And Remove-Safety Under Load Closure

## Status

Closed on 2026-04-23 after focused proof, downstream consumer cutovers, and
later harness confirmation moved the remaining blocker onto narrower follow-on
packages.

This package was kept open too long, and its old `active-...` status had
started to overstate what remained:

1. the observation, reporting, progress-consumer, and grammar follow-ons are
   already closed
2. the 2026-04-23 confirmation rerun no longer points at a broad
   completion/remove-safety grammar gap
3. the current dominant blocker is the narrower rebalancer-leader follow-up
   creation seam tracked in
   [Priority-recovery operation-scheduling pressure and follow-up creation closure](./done-20260423-priority-recovery-operation-scheduling-pressure-and-followup-creation-closure.md)

This package is a closed runtime-foundation slice, not the place for new
implementation unless a later rerun proves the blocker moved back onto this
boundary.

## Why

`node-join-under-load` no longer fails on startup intent, join runtime handoff,
or early readiness. This package landed the broad runtime completion and
remove-safety slice that used to hide later blockers behind mixed semantics.

That work is still the correct foundation:

1. `publication_convergence_blocked`
2. `priority_spread_pending`
3. the shared runtime path now emits one canonical completion/remove-safety
   contract instead of local fallbacks
4. later blockers are now exposed as narrower owner seams rather than broad
   completion ambiguity

The current rerun no longer points at this package as the first unresolved
runtime defect. The remaining direct blockers are explicitly split out, which
means this package needs accurate closure text more than new implementation
scope.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Coherence Closure Before Harness Sprint](../../../sprints/archived/done-2026-q2-remaining-runtime-hotspot-reduction.md)

Predecessor package:

1. [Startup-rejoin priority-recovery under load closure](./archived/superseded-20260421-startup-rejoin-priority-recovery-under-load-closure.md)

## In Scope

1. Keep priority-recovery completion and remove-safety semantics on one
   canonical runtime owner path under load.
2. Keep transaction-control delivery and metadata persistence for
   `sql_transactions`,
   `sql_transaction_participants`,
   `sql_write_operations`,
   `control_plane_publications`, and
   `replica_operations`
   on one explicit critical recovery profile instead of generic routed-query
   defaults.
3. Make unresolved completion/remove-safety work emit one structured deferred
   outcome with canonical reasons and retry semantics instead of local timeout
   silence or handler-local fallback meaning.
4. Align critical delivery, authoritative replica-operation visibility, and
   remove-safety progression so they describe one owner-path completion state.
5. Split the diagnostics/reporting/admin/harness residuals explicitly before
   package closure instead of letting them drift behind the hot path.

## Out Of Scope

1. Admin/control-snapshot observation contract redesign beyond the exact
   runtime handoff named in the follow-on packages
2. Harness/report writer/failure-bundle tail-consumer cutovers beyond the
   explicit follow-on packages
3. Broad startup/rejoin redesign work already moved out of the active critical
   path to
   [Cluster-incarnation fence and existing-owner admission cutover](./done-20260422-cluster-incarnation-fence-and-existing-owner-admission-cutover.md)
4. `rolling-restart` load-pressure follow-up outside the touched
   priority-recovery/remove-safety runtime path
5. General harness decomposition or file-hygiene work

## Invariants

1. Join startup/runtime handoff must remain outside the critical-path blocker
   for this package.
2. Priority-recovery completion and remove-safety must use one owner-path
   decision rather than handler-local or leader-local interpretation.
3. Critical recovery traffic may defer or retry under pressure, but it must
   not fall back to generic background routing assumptions or empty visibility.
4. Already-active peers that are `CONTROL_PLANE_WRITABLE` must not be hidden
   behind stronger unpublished Postgres-wire visibility requirements on the
   touched path.

## Hotspots

1. `src/rebalancer/rebalance-coordinator-segment-3.js`
2. `src/rebalancer/rebalance-coordinator-segment-5.js`
3. `src/rebalancer/operation-workflow-owner-segment-6.js`
4. `src/rebalancer/replica-operation-repository.js`
5. `src/rebalancer/unified-rebalancer-segment-3.js`
6. `src/control-plane/control-plane-readiness-service-segment-4.js`
7. `src/control-plane/membership-publication-planning.js`
8. `src/partition/partition-service-segment-4-part-2.js`

## Shared Boundary Contract

- Semantic owner:
  priority-recovery completion/remove-safety boundary spanning the rebalancer
  execution owner, authoritative replica-operation visibility owner, and the
  readiness/publication recovery gate
- Canonical contract shape / vocabulary:
  `PriorityRecoveryCompletionDecision { state, reasonCodes, blockedPartitionIds, retryAfterMs, closureRecordId, closureWitnessClass }`
  plus
  `PriorityRecoveryPartitionState { partitionId, semanticStateId, blockerReasonCodes, spreadGap, authoritativeVisibilityState, removeSafetyState, transportPressureState, retryAfterMs }`
- Allowed consumers:
  touched rebalancer runtime owners, readiness/publication recovery owners, and
  the explicit observation/reporting follow-on packages
- Prohibited reinterpretations:
  handler-local completion fallback, leader-local remove-safety meaning,
  generic background-query routing for critical recovery traffic, or
  scenario-local reconstruction of runtime state from scattered evidence
- Primary diagnostics / proof surfaces:
  focused control-plane and rebalancer owner-path tests,
  `npm run test:metrics`,
  then sprint-level scenario confirmation after the sequenced follow-on
  packages land
- View roles:
  operational authority is the runtime owner-path decision above;
  diagnostics-only observation is handled by the sequenced observation package;
  owner-internal retained state stays owner-internal and must not become a
  caller contract directly

## Detection / Analysis Tasks

- [x] Build the concern inventory for completion, authoritative visibility,
      critical delivery, and remove-safety on the touched priority partitions.
- [x] Trace every touched path that still relies on generic under-load routing
      assumptions for critical recovery traffic.
- [x] Trace where authoritative replica-operation confirmation and
      control-plane-writable visibility still disagree on the touched path.
- [x] Confirm the blocker remains later convergence rather than startup/runtime
      handoff before code changes continue.

## Implementation Tasks

- [x] Add or extend failing owner-path tests first for the touched completion,
      visibility, and remove-safety cases.
- [x] Collapse the touched runtime paths onto one
      `PriorityRecoveryCompletionDecision`.
- [x] Move transaction-control and mutation traffic for critical
      priority-recovery partitions onto one explicit critical recovery profile.
- [x] Align remove-safety progression and authoritative operation visibility so
      unresolved work remains explicitly deferred instead of timing out into
      silence.
- [x] Delete touched local fallbacks, generic-lane reinterpretations, and
      shadow vocabulary on the runtime path.
- [x] Update [architecture/current-owner-maps.md](../../architecture/current-owner-maps.md)
      in the same work cycle if the runtime boundary contract changes durably.

## Residual Closure Inventory

- [x] Direct owner-path cutovers are complete for priority-recovery
      completion, authoritative visibility, critical delivery, and
      remove-safety.
- [x] Admin/observation contract closure is split explicitly to
      [Priority-recovery observation contract and state grammar closure](./done-20260421-priority-recovery-observation-contract-and-state-grammar-closure.md).
- [x] Harness/reporting tail-consumer closure is split explicitly to
      [Priority-recovery harness, reporting, and tail-consumer cutover](./done-20260421-priority-recovery-harness-reporting-and-tail-consumer-cutover.md).
- [x] Startup/rejoin node-admission closure is split explicitly to
      [Cluster-incarnation fence and existing-owner admission cutover](./done-20260422-cluster-incarnation-fence-and-existing-owner-admission-cutover.md).
- [x] The post-amendment dominant runtime blocker is now split explicitly to
      [Priority-recovery operation-scheduling pressure and follow-up creation closure](./done-20260423-priority-recovery-operation-scheduling-pressure-and-followup-creation-closure.md).
- [x] Superseded runtime fallbacks and generic-lane reinterpretations are
      deleted on the touched path.
- [x] Required runtime proof layers are complete before closure.

## Execution Notes

1. Closed the STOPPING visibility, deferred owner-visibility, and canonical
   completion/remove-safety contract work on the rebalancer and readiness
   owner path.
2. Preserved one runtime completion grammar through the downstream
   observation and reporting cutovers instead of leaving local tactical
   fallbacks in each consumer.
3. Focused runtime proof is green:
   - `npx tap test/control-plane/priority-recovery-completion.test.js test/rebalancer/replica-operation-observation-contract.test.js`
   - `npx tap test/rebalancer/rebalance-coordinator-operation-ownership.test.js test/rebalancer/quorum-conditioned-remove-safety.test.js test/rebalancer/rebalance-coordinator-outcome-routing.test.js`
   - `npx tap test/rebalancer/coordinator-created-operation-progress.test.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js test/rebalancer/rebalance-coordinator-diagnostics.test.js`
4. The later 2026-04-23 confirmation rerun did not reopen a broad
   completion/remove-safety defect. It narrowed the remaining runtime issue to
   pressure-blocked follow-up operation creation on `sql_write_operations-p1`.
5. `npm run test:metrics` is currently red in the dirty worktree because the
   repo-wide cognitive-complexity ratchet is set to `144` while the current
   worktree reports `147` violations.

## Validation

1. `npx tap test/control-plane/priority-recovery-completion.test.js test/rebalancer/replica-operation-observation-contract.test.js`
2. `npx tap test/rebalancer/rebalance-coordinator-operation-ownership.test.js test/rebalancer/quorum-conditioned-remove-safety.test.js test/rebalancer/rebalance-coordinator-outcome-routing.test.js`
3. `npx tap test/rebalancer/coordinator-created-operation-progress.test.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js test/rebalancer/rebalance-coordinator-diagnostics.test.js`
4. `npm run test:metrics`
5. Later named confirmation in
   `work/packages/archived/done-20260422-runtime-grammar-pilot-harness-confirmation.md`

## Done When

1. The landed runtime slice remains the canonical completion/remove-safety
   contract rather than local handler or leader fallbacks.
2. Later blockers remain split explicitly to downstream packages instead of
   being pulled back into this package as implicit residual work.
3. No current scenario evidence points at a missing completion/remove-safety
   grammar edge inside this package.
4. The package is closed and any new blocker at this boundary would require a
   new follow-on package instead of reopening this one implicitly.
