# Critical Partition Quorum-Neutral Catch-Up Lane

## Why

The current failure family shows that critical replacement work still behaves
too much like generic balancing:

1. a move can be planned for a priority partition
2. the target can start retrying pending work
3. the cluster still has no safe, explicit proof that the target is ready to
   promote or serve

Comparable systems avoid this by using a non-voting or non-serving catch-up
phase before promotion. This repo already has learner mechanics, but the
critical recovery lane still needs one explicit, quorum-neutral catch-up
contract.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
3. `Production guarantees` (`roadmap.md`, `edition-matrix.md`)

Architecture and analysis basis:

1. `architecture/current-owner-maps.md`
2. `work/sprints/archived/done-2026-q2-distributed-stability-and-recovery-completion.md`

## Sprint Umbrella

[Distributed Stability And Recovery Completion Sprint](../sprints/archived/done-2026-q2-distributed-stability-and-recovery-completion.md)

## In Scope

1. Define one explicit catch-up lane for control-plane and
   transaction-control priority partitions during add and replace work.
2. Keep that lane quorum-neutral and non-serving until explicit promotion
   conditions are met.
3. Separate catch-up readiness from serve readiness and leader eligibility.
4. Reuse existing learner semantics where possible instead of creating a
   parallel replica type.
5. Add focused tests for critical catch-up, promotion, and restart carry-over.

## Out Of Scope

1. A broad redesign of all user-partition balancing.
2. Relaxing steady-state leader safety for normal partitions.
3. Non-critical optimization work unrelated to critical-lane safety.

## Invariants

1. Critical replacement targets must not silently widen quorum before
   promotion is explicitly safe.
2. Learner or catch-up replicas must not be treated as serving leaders.
3. Promotion must consume explicit catch-up evidence rather than generic
   "retry succeeded" heuristics.

## Hotspots

1. `src/partition/partition-service.js`
2. `src/partition/partition-service-constants.js`
3. `src/rebalancer/rebalance-coordinator.js`
4. `src/control-plane/replica-dispatch-service.js`
5. `src/bootstrap/startup-recovery-coordinator.js`
6. `src/system-partition-classification.js`
7. `test/partition/partition-service.test.js`

## Detection / Analysis Tasks

- [x] Inventory the current critical add/replace/promotion states and callers.
- [x] Detect where critical lanes still borrow generic serving readiness.
- [x] Detect where catch-up completion is inferred indirectly instead of owned
      explicitly.
- [x] Define one canonical promotion eligibility snapshot for critical lanes.
- [x] Detect restart gaps where catch-up or promotion intent can be lost or
      reinterpreted.

## Implementation Tasks

- [x] Add one explicit critical catch-up lane contract using the existing
      learner substrate where possible.
- [x] Make promotion and serving admission consume that contract.
- [x] Make leader eligibility impossible before promotion completion.
- [x] Add focused unit and integration coverage for critical replace/add
      catch-up and promotion.
- [x] Perform the required closure deep dive across all affected code areas;
      fix spotted mistakes, irregularities, and doctrine violations or split
      follow-up packages before closure.

## Validation

1. Targeted `partition-service` and promotion unit tests.
2. Targeted startup and recovery-owner tests.
3. One focused integration or harness scenario that exercises critical
   replacement catch-up.
4. One restart-recovery check for non-terminal catch-up work.

## Done When

1. Critical add and replace work use one explicit quorum-neutral catch-up
   lane.
2. Promotion and serving eligibility consume one shared critical snapshot.
3. Critical targets cannot remain ambiguously "retrying" and "serving
   eligible" at the same time.
4. The required closure deep dive is complete and any discovered issues are
   fixed or split forward.
