# Priority Recovery Publication Closure Witness Contract

## Why

The previous runtime-grammar sprint did implement a
`PriorityRecoveryActuationContract` and threaded it into
`PriorityRecoveryDecisionSnapshot`.

That work was real, but the latest `node-join-under-load` failure shows the
interlocking state machines still do not have one cross-machine closure
witness between priority recovery and membership publication:

1. operation workflow evidence for `sql_transactions-p1` contains terminal
   replacement operations
2. final captured service rows replay through runtime derivation as satisfied
   priority spread
3. durable publication metadata still reports `sql_transactions-p1` as blocked
4. presentation reports `eligible_but_no_operation_created` even though
   witness operation ids exist for that partition

So the missing concept is not "actuation" from scratch. The missing concept is
one revisioned closure witness that says whether priority recovery has produced
enough fresh evidence for the membership publication owner to publish the
next priority-spread summary.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Publication-scoped consistency and node-join closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Priority recovery readiness and workflow convergence closure](./active-20260423-priority-recovery-readiness-and-workflow-convergence-closure.md)
2. [Membership publication planning evidence union closure](./active-20260423-membership-publication-planning-evidence-union-closure.md)

## Dominant Blocker

Fresh rerun after publication recovery gate summary authority closure:

1. `failureClass = publication_convergence_blocked`
2. `dominantReason = priority_recovery_operation_scheduling_event_driven`
3. durable summary blocked `sql_transactions-p1`
4. replayed runtime derivation reported `steady_published`, satisfied spread,
   and no blocked partitions
5. replay classification:
   `durable_stale_replayed_satisfied`

## In Scope

1. Define one priority-recovery closure witness produced from the existing
   decision snapshot, not from presentation artifacts.
2. Include enough freshness/revision evidence for membership publication to
   distinguish:
   - action still required
   - action completed but visibility is not fresh enough
   - fresh evidence satisfies spread
   - refresh/persist is deferred by pressure or authority
3. Make membership publication refresh consume that witness when deciding
   whether durable priority spread metadata is stale.
4. Add focused proof using the latest `sql_transactions-p1` shape: terminal
   operations plus final service rows that satisfy spread.
5. Preserve the membership publication owner as the only durable publication
   writer.

## Out Of Scope

1. Harness-side repair of durable publication metadata.
2. Replacing `PriorityRecoveryActuationContract`.
3. Changing replica placement policy.
4. Broad CDC/cache rewrites outside the evidence freshness needed here.

## Shared Boundary Contract

- Semantic owner:
  `PriorityRecoveryDecisionSnapshot` owns per-partition recovery meaning;
  `MembershipPublicationCoordinator` owns durable publication refresh.
- Canonical contract:
  a priority recovery closure witness is the handoff from decision state to
  publication refresh. It is derived from actuation, progress, visibility,
  operation evidence, and spread evidence together.
- Operational authority:
  membership publication may persist durable priority spread only after
  consuming this closure witness or deriving an equivalent local witness through
  the same decision owner.
- Diagnostics-only observation:
  replay output and failure bundles may display witness fields but must not
  rewrite runtime state.
- Prohibited reinterpretations:
  durable publication summary alone as current priority recovery truth,
  operation absence inferred from partial rows, or replayed rows as a runtime
  repair path.
- Primary proof:
  priority-recovery snapshot tests, membership publication coordinator tests,
  replay classification, and the representative scenario rerun.

## Progress Grammar

1. `closure_pending` means recovery still requires an action or observation.
2. `closure_satisfied_fresh` means decision and visibility evidence prove
   spread is satisfied for publication refresh.
3. `closure_satisfied_stale_publication` means runtime evidence is satisfied
   but durable publication metadata has not caught up.
4. `closure_deferred` means the owner cannot safely refresh yet because
   authority, visibility, or pressure evidence is deferred.
5. `closure_failed` means the owner has terminal failure evidence.

## Hotspots

1. `src/control-plane/priority-recovery-snapshot.js`
2. `src/control-plane/membership-publication-coordinator.js`
3. `src/control-plane/membership-publication-planning.js`
4. `src/control-plane/priority-recovery-observation-snapshot.js`
5. `test/control-plane/priority-recovery-snapshot.test.js`
6. `test/control-plane/membership-publication-coordinator.test.js`
7. `test/distributed/harness/publication-evidence-replay.js`

## Detection / Analysis Tasks

- [x] Prove the existing actuation/progress contract exists but is not a
      sufficient publication refresh witness.
- [x] Reproduce latest `sql_transactions-p1` terminal-operation plus satisfied
      final-service-row shape in focused tests.
- [x] Identify freshness/revision evidence already available from operation
      rows, service rows, and publication rows.

## Implementation Tasks

- [x] Add one closure-witness builder on the priority recovery decision owner
      path.
- [x] Thread the witness into membership publication candidate derivation or
      refresh planning without creating a second publication writer.
- [x] Make durable publication refresh detect stale priority spread metadata
      from the witness.
- [x] Carry witness state into observation snapshots for diagnostics.
- [x] Record witness state in replay output for failed artifacts.

## Residual Closure Inventory

- [x] Owner path: priority recovery emits one closure witness from the decision
      layer.
- [x] Tail consumer: membership publication consumes the witness for refresh.
- [x] Diagnostics: observation/replay/failure-bundle surfaces display but do
      not reinterpret the witness.
- [x] Superseded path: no consumer treats durable priority summary as the
      current recovery decision when fresher closure evidence exists.
- [x] Proof: focused tests, replay, metrics, and representative scenario rerun.

## Progress Notes

1. Added `buildPriorityRecoveryClosureWitness(...)` on the priority recovery
   decision path and threaded the witness into membership publication refresh,
   publication recovery gate construction, and observation snapshots.
2. Harness-side consumers now preserve `closureRecordId`,
   `closureWitnessClass`, and witness state from canonical decision snapshots
   instead of reconstructing closure from stale durable summaries.
3. Replay tooling now reads captured decision snapshots from failure bundles
   and classifies closure-witness state alongside durable-versus-replayed
   summary drift.
4. Focused proof and supporting suites passed:
   `npx tap test/control-plane/priority-recovery-snapshot.test.js`,
   `npx tap test/control-plane/membership-publication-coordinator.test.js`,
   `npx tap test/distributed/harness/__tests__/publication-evidence-replay.test.js`,
   `npm run audit:runtime-grammar`, and `npm run test:metrics`.
5. Representative rerun on April 23, 2026 no longer fails on stale durable
   priority spread. Publication gate readiness is `true`, blocked priority
   partitions are `0`, unresolved priority partitions are `0`, and the
   scenario now fails later on `dominantReason = nodeAdmissionBlocked`.

## Validation

1. `npx tap test/control-plane/priority-recovery-snapshot.test.js`
2. `npx tap test/control-plane/membership-publication-coordinator.test.js`
3. `npx tap test/distributed/harness/__tests__/publication-evidence-replay.test.js`
4. `npm run audit:runtime-grammar`
5. `npm run test:metrics`
6. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`

## Done When

1. Membership publication can tell "runtime closure satisfied but durable
   summary stale" without replay tooling.
2. The durable priority summary refreshes from the membership publication
   owner when the closure witness is fresh and satisfied.
3. `node-join-under-load` no longer fails with
   `durable_stale_replayed_satisfied`, or the next blocker is explicitly split.
