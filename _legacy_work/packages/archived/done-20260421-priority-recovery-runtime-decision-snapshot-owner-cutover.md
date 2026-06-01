# Priority-Recovery Runtime Decision-Snapshot Owner Cutover

## Why

The priority-recovery grammar now exists, but the richest composed contract is
still stranded on the diagnostics side.

Today:

1. the workflow owner and repository already preserve deferred visibility and
   owner-persisted transition evidence
2. the shared snapshot builder already emits one canonical
   `PriorityRecoveryDecisionSnapshot`
3. runtime consumers such as priority add-budget gating and priority
   remove-safety still rebuild local answers from planning snapshots,
   projection cohorts, and spread math

That means the codebase still has two reasoning centers for one boundary. This
package cuts the existing decision snapshot over to the runtime owner path so
the next slices can delete local reinterpretation instead of adding more.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Coherence Closure Before Harness Sprint](../../../sprints/archived/done-2026-q2-remaining-runtime-hotspot-reduction.md)

Sequencing dependencies:

1. [Priority-recovery completion and remove-safety under load closure](./done-20260421-priority-recovery-completion-and-remove-safety-under-load-closure.md)
2. [Priority-recovery workflow, visibility, and convergence contract unification](./done-20260421-priority-recovery-workflow-visibility-and-convergence-contract-unification.md)

## Status

1. Executed on 2026-04-21 with focused proof and `npm run test:metrics`
   green.
2. Remaining publication-row and harness/reporting consumer cutovers stay in
   their sequenced follow-on packages and are intentionally out of scope here.

## In Scope

1. Extract one reusable single-partition `PriorityRecoveryDecisionSnapshot`
   builder from the existing shared snapshot module.
2. Expose runtime-owner snapshot reads through the workflow owner for:
   `getPriorityRecoveryDecisionSnapshotForOperation(...)` and
   `getPriorityRecoveryDecisionSnapshotForPartitionOperations(...)`.
3. Reuse repository-owned deferred incomplete-operation observation when the
   runtime owner composes decision snapshots.
4. Cut the touched add-budget and remove-safety consumers over to the runtime
   decision snapshot instead of rebuilding completion locally from planning
   snapshots alone.
5. Update
   [architecture/current-owner-maps.md](../../architecture/current-owner-maps.md)
   in the same work cycle.

## Out Of Scope

1. Full admin/control-snapshot cutover to owner-path decision snapshots
2. Full publication-row admission-plan redesign
3. Harness/report-writer tail-consumer cutover beyond the sequenced reporting
   package
4. New recovery grammars or parallel state models

## Invariants

1. This package must reuse the existing `PriorityRecoveryCompletion`,
   `PriorityRecoveryPartitionObservation`, and
   `PriorityRecoveryDecisionSnapshot` vocabulary.
2. Runtime consumers must not introduce a second local recovery-state grammar.
3. Deferred owner visibility must remain explicit and must come from the
   repository-owned observation contract, not from a new ad hoc probe.
4. Planning snapshots remain input evidence, not the final runtime authority
   once the workflow owner already exposes a decision snapshot.

## Hotspots

1. `src/control-plane/priority-recovery-snapshot.js`
2. `src/rebalancer/operation-workflow-owner-shared.js`
3. `src/rebalancer/operation-workflow-owner-segment-5.js`
4. `src/rebalancer/operation-workflow-owner-segment-6.js`
5. `src/rebalancer/rebalance-coordinator-segment-3.js`
6. `src/rebalancer/rebalance-coordinator-segment-5.js`
7. `test/control-plane/priority-recovery-snapshot.test.js`
8. `test/rebalancer/rebalance-coordinator-operation-ownership-tail-test-cases.js`
9. `architecture/current-owner-maps.md`

## Shared Boundary Contract

- Semantic owner:
  `OperationWorkflowOwner` runtime decision-snapshot surface
- Canonical contract shape / vocabulary:
  `PriorityRecoveryDecisionSnapshot { completion, observation, semanticState, spreadCompletion, admission, publication, coordinator, blockerReasons }`
- Allowed consumers:
  priority add-budget gating,
  priority remove-safety gating,
  admin/control-snapshot follow-on consumers,
  and the sequenced observation/reporting packages
- Prohibited reinterpretations:
  rebuilding completion from planning snapshots alone,
  treating projected active cohorts as the final runtime answer when the owner
  already exposes a decision snapshot,
  or inventing a second visibility-deferred state outside the repository-owned
  observation contract

## Detection / Analysis Tasks

- [x] Confirm the existing `PriorityRecoveryDecisionSnapshot` already carries
      the needed completion/observation/publication/admission grammar.
- [x] Confirm the workflow owner already has repository-owned deferred
      visibility evidence that can be reused instead of adding new probes.
- [x] Confirm the first runtime consumers to cut over are grouped priority
      add-budget gating and priority remove-safety assessment.

## Implementation Tasks

- [x] Extract a reusable single-partition decision-snapshot builder from
      `src/control-plane/priority-recovery-snapshot.js`.
- [x] Expose runtime-owner decision-snapshot getters from
      `OperationWorkflowOwner`.
- [x] Reuse `ReplicaOperationRepository.resolveIncompleteOperationObservation`
      when composing runtime decision snapshots.
- [x] Cut grouped priority add-budget gating over to the workflow-owner
      decision snapshot before planning-snapshot fallback.
- [x] Cut priority remove-safety assessment context over to the runtime
      decision snapshot so completion comes from the shared owner contract.
- [x] Update
      [architecture/current-owner-maps.md](../../architecture/current-owner-maps.md)
      in the same work cycle.

## Residual Closure Inventory

- [x] One reusable decision-snapshot builder now exists in the shared snapshot
      module.
- [x] The workflow owner exposes runtime decision-snapshot getters.
- [x] The grouped priority add-budget path prefers the runtime decision
      snapshot before planning fallback.
- [x] Priority remove-safety assessment context now reuses runtime decision
      snapshots for canonical completion.
- [ ] Publication-row admission-plan tracking still derives from the published
      summary and remains sequenced follow-on work rather than part of this
      narrow owner cutover.

## Execution Notes

1. Extracted `buildPriorityRecoveryDecisionSnapshot(...)` from the existing
   shared snapshot module so the per-partition contract can be reused outside
   admin diagnostics.
2. Added workflow-owner runtime surfaces for one operation and one partition’s
   active operations, both reusing repository-owned deferred incomplete-
   operation observation instead of issuing a second visibility grammar.
3. Cut priority add-budget gating and priority remove-safety assessment
   context over to the workflow-owner decision snapshot with planning-snapshot
   fallback preserved for compatibility.
4. Reduced the new shared builder back to the sprint cognitive baseline by
   splitting selection logic into local helper functions and leaving one thin
   composition surface for the runtime-owned decision snapshot.
5. Validated with:
   - `node --test test/control-plane/priority-recovery-snapshot.test.js`
   - `node --test test/rebalancer/rebalance-coordinator-operation-ownership.test.js`
   - `node --test test/rebalancer/quorum-conditioned-remove-safety.test.js`
   - `npm run test:metrics`

## Validation

1. `node --test test/control-plane/priority-recovery-snapshot.test.js`
2. `node --test test/rebalancer/rebalance-coordinator-operation-ownership.test.js`
3. `node --test test/rebalancer/quorum-conditioned-remove-safety.test.js`
4. `npm run test:metrics`

## Done When

1. Runtime consumers can read the existing `PriorityRecoveryDecisionSnapshot`
   from the workflow owner instead of rebuilding one from planning snapshots.
2. Deferred visibility in the runtime snapshot comes from the repository-owned
   observation contract.
3. The touched add-budget and remove-safety paths consume the same decision
   snapshot grammar already used by diagnostics.
4. The sprint can continue narrowing observation/reporting surfaces without
   inventing another runtime state layer.
