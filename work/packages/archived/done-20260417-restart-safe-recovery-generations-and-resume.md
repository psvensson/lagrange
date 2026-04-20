# Restart-Safe Recovery Generations And Resume

## Why

A stable distributed system cannot depend on "keep retrying until logs look
better" for critical recovery.

When nodes or seeds restart, the repo needs one deterministic answer for
non-terminal critical work:

1. resume it
2. supersede it
3. fail it closed

The current failure family suggests the cluster still lacks a strong generation
or epoch boundary for priority recovery work that spans restart windows.

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

1. Define one generation or epoch model for critical recovery workflows across
   restart boundaries.
2. Make startup recovery, rebalance coordination, and dispatch share that
   model.
3. Define resume, supersede, and stale-operation handling rules.
4. Add focused restart tests for non-terminal priority operations.

## Out Of Scope

1. A global epoch redesign for unrelated runtime areas.
2. Reworking all startup logic outside the critical recovery lane.
3. Best-effort cleanup of historical rows without a clear owner rule.

## Invariants

1. Only one live recovery generation may advance a given critical workflow.
2. Restart must not duplicate or orphan critical work silently.
3. Resume rules must consume durable owner state, not log-derived guesswork.

## Hotspots

1. `src/bootstrap/startup-recovery-coordinator.js`
2. `src/rebalancer/rebalance-coordinator.js`
3. `src/control-plane/replica-dispatch-service.js`
4. `src/replica-operation-repository.js`
5. `src/assignment-epoch-manager.js`
6. `src/operation-workflow-owner.js`
7. `test/bootstrap/startup-recovery-coordinator.test.js`

## Detection / Analysis Tasks

- [x] Inventory the current restart-resume and replay rules for priority work.
- [x] Detect where restart ownership is still split between startup and steady
      coordinators.
- [x] Detect where stale operations can survive without a supersession rule.
- [x] Define one generation-scoped resume matrix for critical operations.
- [x] Detect which diagnostics need generation identity and stale/superseded
      evidence.

## Implementation Tasks

- [x] Add the explicit recovery generation and resume contract.
- [x] Cut startup recovery, coordinator, and dispatch paths over to that
      contract.
- [x] Add stale-operation supersession or fail-closed behavior.
- [x] Add focused restart coverage for node and seed restart cases.
- [x] Perform the required closure deep dive across all affected code areas;
      fix spotted mistakes, irregularities, and doctrine violations or split
      follow-up packages before closure.

## Validation

1. Targeted startup recovery and coordinator unit tests.
2. Focused restart integration tests for critical operations.
3. Boundary scenarios covering node restart and seed restart during
   non-terminal recovery.
4. Seven-node reruns validating deterministic resume instead of drift.

## Done When

1. Critical recovery has one explicit generation-scoped resume model.
2. Restarts no longer leave critical operations in ambiguous ownership.
3. Stale critical work is resumed, superseded, or failed closed explicitly.
4. The required closure deep dive is complete and any discovered issues are
   fixed or split forward.
