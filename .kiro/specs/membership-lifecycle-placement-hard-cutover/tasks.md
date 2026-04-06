# Implementation Plan: Membership Lifecycle And Placement Hard Cutover

## Overview

This plan implements the hard cutover in six phases. Each phase has both
construction tasks and deletion gates. The work is not complete when new owners
exist alongside old runtime paths.

## Tasks

### Phase 1: Membership Lifecycle Authority

- [x] 1. Define the canonical membership lifecycle model
  - Add the durable lifecycle state taxonomy for member admission, restart
    re-entry, publication pending, published active, drain, and removal.
  - Document the exact transition rules and epoch boundaries.
  - _Requirements: 1.1, 1.2, 1.3, 3.1_

- [x] 2. Consolidate join, restart, and leave intent under one owner
  - Introduce or refactor the canonical lifecycle controller so join, restart,
    and leave submit intent through one owner path.
  - Route existing bootstrap/join entrypoints through delegation adapters only.
  - _Requirements: 1.1, 1.3, 3.1, 3.3_

- [x] 3. Cut all active-node consumers over to published membership
  - Update convergence, admission, harness, and restart-readiness consumers to
    use the published membership epoch and active-node set only.
  - Remove active runtime membership derivations outside publication.
  - _Requirements: 2.1, 2.2, 2.3, 2.5_

- [x]* 4. Add deterministic lifecycle-owner regressions
  - Add tests proving join, restart, and leave all use the lifecycle owner.
  - Add regressions proving published membership is the only active-set truth.
  - _Requirements: 1.4, 2.1, 2.2, 12.1, 12.2_

- [x] 5. Delete legacy lifecycle progression branches
  - Remove old restart/join-specific semantic branches that remain active after
    delegation is verified.
  - _Requirements: 3.3, 11.1, 11.2_

### Phase 2: Placement Narrowing And Priority Spread

- [x] 6. Bind placement planning to published membership epoch
  - Make placement and rebalance plans explicitly epoch-bound.
  - Invalidate stale plans through the canonical owner path when membership
    changes.
  - _Requirements: 4.1, 4.2, 4.4_

- [x] 7. Reduce steady-state placement inputs to published topology and health
  - Remove startup or phase-specific topology truth from active placement
    semantics.
  - Keep health, capacity, and authoritative replica state as inputs.
  - _Requirements: 4.2, 4.5, 10.1_

- [x] 8. Promote priority control-plane spread to an explicit invariant
  - Consolidate priority spread checks inside the placement owner.
  - Ensure budget and authoritative reads for priority work use critical
    semantics.
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x]* 9. Add deterministic placement-owner regressions
  - Add tests for epoch invalidation, priority spread invariants, and stale
    placement rejection.
  - _Requirements: 4.4, 5.1, 5.3, 12.2_

- [x] 10. Delete legacy rebalance gating paths
  - Remove legacy phase-specific or mixed-truth rebalance progression branches
    once equivalent owner behavior is verified.
  - _Requirements: 4.5, 5.5, 11.1_

### Phase 3: Readiness Demotion To Pure Projection

- [x] 11. Split repair progression out of readiness
  - Move authoritative repair or reconciliation side effects behind explicit
    owner-key reconcilers.
  - Leave readiness as a derived projection only.
  - _Requirements: 6.1, 6.3, 6.4_

- [x] 12. Standardize canonical readiness consumption
  - Ensure internal control-plane consumers use `repairEligible`.
  - Ensure routing and external traffic admission use `serveEligible`.
  - Record decision dimension usage in diagnostics.
  - _Requirements: 6.2, 6.5_

- [x]* 13. Add readiness projection regressions
  - Add tests proving readiness does not write lifecycle or placement state.
  - Add tests proving correct `repairEligible` vs `serveEligible` usage.
  - _Requirements: 6.1, 6.5, 12.2_

- [x] 14. Delete readiness-owned repair code from active runtime paths
  - Remove legacy mutation or repair branches embedded in readiness once the
    explicit owner path is in place.
  - _Requirements: 6.4, 11.3_

### Phase 4: Projection Boundary And Gateway Closure

- [x] 15. Define authoritative and projection read classes structurally
  - Refactor the gateway boundary so semantic callers choose either the
    authoritative owner path or the projection path explicitly.
  - _Requirements: 9.1, 9.2, 9.3, 9.5_

- [x] 16. Demote cache and CDC to projection-only semantics
  - Ensure cache freshness, bootstrap hydration, and CDC catch-up do not act as
    completion or promotion oracles.
  - Emit typed divergence diagnostics that re-enter owner queues only.
  - _Requirements: 7.1, 7.3, 7.4_

- [x] 17. Reclassify transport as health evidence only
  - Remove transport-driven lifecycle shortcuts that behave like alternate
    membership truth.
  - _Requirements: 10.1, 10.2, 10.3, 10.5_

- [x]* 18. Add projection-boundary regressions and guards
  - Add tests and structural guards proving mixed cache/authoritative control
    decisions cannot reappear.
  - _Requirements: 7.3, 9.4, 10.4, 12.2, 12.3_

- [x] 19. Delete legacy cache-as-proof and transport-shortcut paths
  - Remove active runtime code that still treats cache or transport as an
    alternate semantic owner.
  - _Requirements: 7.5, 10.5, 11.4_


### Phase 5: Bootstrap And Join Handoff Closure


- [x] 20. Reduce bootstrap and join services to phase adapters
  - Keep them responsible for runtime-owner startup and initial handoff only.
  - Remove remaining steady-state lifecycle ownership from those services.
  - _Requirements: 3.3, 8.1, 8.2_

- [x] 21. Remove phase-owned live runtime dependencies
  - Audit message-group ingress, CDC bridges, cache bridges, and similar phase
    mechanisms to ensure none remain the only live runtime path after phase
    completion.
  - _Requirements: 7.5, 8.3, 8.4_

- [x]* 22. Add continuity and teardown regressions
  - Add tests proving phase completion leaves steady-state runtime mechanisms
    intact and phase teardown does not strand the cluster.
  - _Requirements: 8.2, 8.3, 12.2_

- [x] 23. Delete obsolete phase-owned runtime logic
  - Remove remaining steady-state logic from phase owners after continuity
    coverage passes.
  - _Requirements: 8.5, 11.2, 11.4_

### Phase 6: Documentation, Deletion Inventory, And Distributed Closure

- [x] 24. Update architecture and operational documentation
  - Rewrite `architecture.md` and relevant operational docs to describe only
    the new ownership model for lifecycle, placement, readiness, projection,
    and transport evidence.
  - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [x] 25. Produce deletion inventory and closure checklist
  - Record which old lifecycle, readiness, rebalance, gateway, cache, and
    phase-owned paths were removed.
  - Treat the inventory as an exit artifact for the cutover.
  - _Requirements: 11.5, 13.5_

- [x] 26. Run focused deterministic verification suites
  - Lifecycle owner regressions
  - placement and priority spread regressions
  - readiness projection regressions
  - projection-boundary guards
  - handoff continuity tests
  - _Requirements: 12.1, 12.2, 12.3_

- [ ] 27. Run distributed scenario closure ladder
  - Rolling restart
  - Node join under load
  - Seed restart under load
  - Transaction recovery under restart churn
  - Maintain `closure-ledger.md` using `closure-grammar.md`; every red scenario
    must map to one first violated invariant before runtime code changes.
  - Confirm one published membership epoch and one published active-node set.
  - _Requirements: 12.4_

- [ ] 28. Final hard-cutover audit
  - Verify no dual path remains active for any concern covered by this spec.
  - Verify every open distributed blocker is either closed or explicitly parked
    in `closure-ledger.md` with witness, repro, and guard evidence.
  - Verify documentation, tests, and deletion inventory all match runtime.
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 12.5, 13.1_

## Current Progress Notes

- 2026-04-02: Partition `REPLACE` bootstrap topology now uses the shared
  replicated-service topology helper and excludes the retiring source replica
  from bootstrap replica ids and peer addresses.
- 2026-04-02: Durable rejoin partition restore planning moved out of
  `NodeJoiningService` into
  `src/bootstrap/shared/durable-rejoin-partition-restore-planner.js`.
- 2026-04-02: Publication, readiness, and placement now share
  `ControlPlaneReadinessService` membership-publication planning snapshots for
  published epoch binding and priority recovery semantics.
- 2026-04-02: Focused deterministic suites for readiness, bootstrap API, and
  unified rebalancer are green after the above changes; the distributed
  closure ladder remains open and the broader coordinator ownership suite is
  still red on separate authoritative replica-operation persistence failures.
