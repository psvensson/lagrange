# System Partition Placement And Spread Policy Hardening

## Why

Critical control-plane and transaction-control partitions still carry cluster
availability risk, but their placement and spread semantics are not yet
strictly separated from generic partition balancing.

CockroachDB's system-range treatment and FoundationDB's failure-domain team
selection point at the same lesson: cluster-critical data needs a stronger
policy class than ordinary user data.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
3. `Production guarantees` (`roadmap.md`, `edition-matrix.md`)

Architecture and analysis basis:

1. `src/system-partition-classification.js`
2. `work/sprints/archived/done-2026-q2-distributed-stability-and-recovery-completion.md`

## Sprint Umbrella

[Distributed Stability And Recovery Completion Sprint](../sprints/archived/done-2026-q2-distributed-stability-and-recovery-completion.md)

## In Scope

1. Define one stronger placement policy class for control-plane and
   transaction-control priority partitions.
2. Harden spread requirements, fault-domain diversity, and temporary overflow
   rules for that class.
3. Make planning and acceptance checks use that critical policy class
   explicitly.
4. Add focused tests for recovery, rejoin, and restart placement under the
   stronger policy.

## Out Of Scope

1. A generic placement rewrite for all partitions.
2. Edition-specific multi-region feature work.
3. Operator UX work unrelated to critical placement correctness.

## Invariants

1. Cluster-critical partitions must preserve a majority-safe spread policy.
2. The critical policy must be explicit and named, not implied through
   scattered branch piles.
3. Temporary overflow for recovery must remain bounded and typed.

## Hotspots

1. `src/system-partition-classification.js`
2. `src/rebalancer/move-planner.js`
3. `src/rebalancer/unified-rebalancer.js`
4. `src/control-plane/priority-recovery-completion.js`
5. `src/odd-replica-count.js`
6. `src/bootstrap/node-storage-budget-service.js`
7. `test/bootstrap/startup-recovery-coordinator.test.js`

## Detection / Analysis Tasks

- [x] Inventory the current critical partition classes and their effective
      placement rules.
- [x] Detect where critical and generic placement policies still share the
      same planning assumptions.
- [x] Detect where priority spread completion can be reported without the
      intended fault-domain guarantees.
- [x] Define one explicit critical placement and spread state model.
- [x] Detect where diagnostics need to surface fault-domain insufficiency
      directly.

## Implementation Tasks

- [x] Add the explicit critical placement and spread policy class.
- [x] Cut the move planner and priority recovery checks over to that class.
- [x] Add focused tests for restart, replacement, and rejoin cases against the
      stronger policy.
- [x] Surface critical spread insufficiency in diagnostics.
- [x] Perform the required closure deep dive across all affected code areas;
      fix spotted mistakes, irregularities, and doctrine violations or split
      follow-up packages before closure.

## Validation

1. Targeted planner and priority recovery unit tests.
2. Focused integration coverage for critical placement across node failures.
3. Boundary scenarios that exercise critical spread under restart and join
   pressure.
4. One seven-node rerun validating critical spread completion.

## Done When

1. Critical partitions use an explicit stronger placement and spread policy.
2. Priority spread completion consumes that policy instead of generic
   balancing assumptions.
3. Fault-domain insufficiency is diagnosable from typed output.
4. The required closure deep dive is complete and any discovered issues are
   fixed or split forward.
