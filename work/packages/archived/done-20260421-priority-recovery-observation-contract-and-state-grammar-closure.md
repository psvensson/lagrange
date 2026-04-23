# Priority-Recovery Observation Contract And State Grammar Closure

## Why

The latest `node-join-under-load` confirmation artifact contains a real
priority-recovery blocker, but the recorded surfaces do not yet preserve one
stable reasoning grammar for that blocker.

In the same run:

1. detailed control-plane diagnostics carry real blocked partitions and spread
   gaps
2. normalized scenario summaries collapse key priority-recovery fields to
   `null`, `[]`, or `0`
3. readers still have to infer state from scattered logs, wait reasons, and
   partial snapshots

That means the shared observation contract for this boundary is still porous
even when the runtime path is becoming narrower.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Coherence Closure Before Harness Sprint](../../../sprints/archived/done-2026-q2-remaining-runtime-hotspot-reduction.md)

Sequencing dependency:

1. [Priority-recovery completion and remove-safety under load closure](./done-20260421-priority-recovery-completion-and-remove-safety-under-load-closure.md)
2. [Priority-recovery workflow, visibility, and convergence contract unification](./done-20260421-priority-recovery-workflow-visibility-and-convergence-contract-unification.md)
3. [Priority-recovery runtime decision-snapshot owner cutover](./done-20260421-priority-recovery-runtime-decision-snapshot-owner-cutover.md)

## In Scope

1. Define one canonical observation contract for the
   priority-recovery-completion boundary.
2. Define one per-partition semantic state grammar for priority-recovery
   observation.
3. Preserve closure witness, active-gate progress, blocker history,
   projection diagnostics, invariant failures, and per-partition blocker state
   through the canonical observation owner.
4. Align control-plane readiness and admin/control-snapshot surfaces to emit
   that contract without consumer-local recomputation.
5. Update
   [architecture/current-owner-maps.md](../../architecture/current-owner-maps.md)
   and one bounded static guardrail if the boundary contract becomes durable
   and mechanically checkable.

## Out Of Scope

1. Runtime transport/remove-safety logic changes beyond what is required to
   expose the owner observation contract correctly
2. Scenario/failure-bundle/report-writer tail-consumer cutovers beyond the
   explicit harness/reporting follow-on package
3. Broad harness redesign or file decomposition
4. Unrelated startup or rolling-restart follow-up work

## Invariants

1. One blocked priority partition snapshot must not degrade to
   `unknown`, `0`, or `[]` in another observation surface for the same run.
2. Diagnostics-only observation must not become operational authority.
3. Missing or deferred evidence must stay explicit instead of collapsing to
   success or empty visibility.
4. Per-partition semantic state must come from one canonical observation
   snapshot, not from consumer-local inference over raw rows.

## Hotspots

1. `src/control-plane/priority-recovery-snapshot.js`
2. `src/control-plane/recovery-protocol-snapshot.js`
3. `src/control-plane/control-plane-readiness-service-segment-4.js`
4. `src/control-plane/publication-recovery-gate.js`
5. `src/admin/admin-control-snapshot-readiness-diagnostics-methods.js`
6. `src/admin/admin-control-snapshot.js`
7. `architecture/current-owner-maps.md`

## Shared Boundary Contract

- Semantic owner:
  control-plane priority-recovery observation boundary emitted from the runtime
  owner-path evidence by the readiness/snapshot owners
- Canonical contract shape / vocabulary:
  `PriorityRecoveryObservationSnapshot { publicationStatus, recoveryProtocolState, closureRecordId, closureWitnessClass, projectionDiagnostics, invariants, retryAfterMs, partitionSnapshots[] }`
  plus
  `PriorityRecoveryPartitionSnapshot { partitionId, semanticStateId, progressClassIds, blockerReasonCodes, spreadGap, readyDistinctNodeCount, requiredDistinctNodeCount, authoritativeVisibilityState, removeSafetyState, transportPressureState, witnessIds, retryAfterMs }`
- Allowed consumers:
  control-plane readiness, admin control snapshots, harness cluster waiters,
  failure-bundle/reporting follow-ons, and bounded contract tests
- Prohibited reinterpretations:
  consumer-local reconstruction from raw rows,
  collapsing missing fields to `0` or `[]`,
  treating diagnostics-only repair results as operational authority,
  or deriving semantic state separately in each consumer
- Primary diagnostics / proof surfaces:
  priority-recovery snapshot tests,
  publication-recovery gate tests,
  control-plane snapshot owner tests,
  admin control-snapshot contract tests,
  architecture record update,
  and the sequenced harness/reporting follow-on package
- View roles:
  operational authority is the runtime completion/remove-safety owner path;
  diagnostics-only observation is the emitted observation snapshot;
  owner-internal retained state remains owner-internal and must not leak as a
  direct caller contract

## Detection / Analysis Tasks

- [x] Inventory every current priority-recovery observation view and the field
      mismatches between runtime, readiness, admin, and latest
      `node-join-under-load` artifacts.
- [x] Identify which fields are forwarded, recomputed, or dropped entirely on
      the touched observation path.
- [x] Identify where `null`, empty arrays, or zero counts currently encode
      deferred or unknown observation state.
- [x] Define the per-partition semantic state table and blocker vocabulary
      before implementation begins.

## Implementation Tasks

- [x] Add guardrail tests first for a canonical
      `PriorityRecoveryObservationSnapshot` and
      `PriorityRecoveryPartitionSnapshot`.
- [x] Introduce the canonical observation snapshot normalizer/owner path.
- [x] Introduce the per-partition semantic state grammar.
- [x] Route readiness and admin/control-snapshot observation emitters through
      the shared snapshot instead of consumer-local reconstruction.
- [x] Preserve closure witness, progress snapshot, blocker history,
      projection diagnostics, invariants, and per-partition blocker data
      through the canonical snapshot.
- [x] Update
      [architecture/current-owner-maps.md](../../architecture/current-owner-maps.md)
      in the same work cycle.
- [x] Add one bounded static guardrail for contract drift, or split that
      guardrail explicitly before closure.

## Residual Closure Inventory

- [x] Owner-path observation emitters use one canonical snapshot grammar.
- [x] Admin/control-snapshot surfaces consume the same snapshot without local
      reinterpretation.
- [x] Harness/reporting tail consumers are handed off explicitly to
      [Priority-recovery harness, reporting, and tail-consumer cutover](./done-20260421-priority-recovery-harness-reporting-and-tail-consumer-cutover.md).
- [x] Superseded local observation vocabulary and zero/null fallbacks are
      deleted on the touched path.
- [x] Required proof layers are complete before closure.

## Execution Notes

1. Landed the canonical `PriorityRecoveryObservationSnapshot` and
   `PriorityRecoveryPartitionSnapshot` across readiness and admin surfaces.
2. Completed the owner-map update and removed the touched local
   zero/null/empty observation fallbacks on the shared path.
3. Focused proof is green:
   - `npx tap test/control-plane/priority-recovery-snapshot.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/control-plane-snapshot-owner.test.js`
   - `npx tap test/control-plane/control-plane-readiness-service.test.js test/admin/admin-control-snapshot.test.js test/admin/admin-control-snapshot-response-contract.test.js`
4. The harness/reporting handoff is now complete. `npm run test:metrics` is
   currently red in the dirty worktree because the repo-wide
   cognitive-complexity ratchet is set to `144` while the current worktree
   reports `147` violations.

## Validation

1. `npx tap test/control-plane/priority-recovery-snapshot.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/control-plane-snapshot-owner.test.js`
2. `npx tap test/control-plane/control-plane-readiness-service.test.js test/admin/admin-control-snapshot.test.js test/admin/admin-control-snapshot-response-contract.test.js`
3. `npm run test:metrics`
4. Explicit handoff to the sequenced harness/reporting package before the
   sprint-level scenario rerun

## Done When

1. One canonical observation snapshot carries per-partition semantic state,
   blockers, witnesses, invariants, and projection diagnostics for this
   boundary.
2. Readiness and admin/control-snapshot surfaces no longer recompute or narrow
   the same boundary locally.
3. The architecture record names the owner, vocabulary, consumers, and
   forbidden reinterpretations.
4. The sequenced harness/reporting package is explicit before closure so the
   tail-consumer cutover cannot drift into an implicit residual.
