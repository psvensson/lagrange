# Core Topology Control-Plane Rewrite Sprint

## Goal

Make the core topology control plane explicit enough that Phase 0.1 closure no
longer depends on reactive fixes across bootstrap, join/rejoin, publication,
readiness, operation scheduling, and rebalancer paths.

## Current Blocker Snapshot

Active package:

1. [Core Topology Rewrite Spec And Roadmap Rebaseline](../packages/active-20260508-core-topology-rewrite-spec-and-roadmap-rebaseline.md)

Current blocker:

1. Phase 0.1 representative gate evidence keeps migrating across topology
   owners instead of reducing to one stable contract boundary.
2. The sprint setup must establish the rewrite spec, roadmap truth, package
   queue, and current-blocker handoff before runtime work starts.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, especially:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Edition matrix status: Community / AGPL repo.

## Semantic Owners

1. Topology membership owner.
2. Topology placement owner.
3. Topology operation owner.
4. Topology publication owner.

Projection/readiness is the consumer contract above those owners, not a fifth
mutation owner.

## Package Queue

1. Active: [Core Topology Rewrite Spec And Roadmap Rebaseline](../packages/active-20260508-core-topology-rewrite-spec-and-roadmap-rebaseline.md)
2. Todo: [Core Topology Owner Boundary Inventory](../packages/todo-20260508-core-topology-owner-boundary-inventory.md)
3. Todo: [Core Topology Boot Join Rejoin Kernel](../packages/todo-20260508-core-topology-boot-join-rejoin-kernel.md)
4. Todo: [Core Topology Partitioning Rebalancing Kernel](../packages/todo-20260508-core-topology-partitioning-rebalancing-kernel.md)
5. Todo: [Core Topology Projection Readiness Contract](../packages/todo-20260508-core-topology-projection-readiness-contract.md)
6. Todo: [Core Topology Legacy Path Deletion And Proof](../packages/todo-20260508-core-topology-legacy-path-deletion-and-proof.md)

## Execution Order

1. Rebaseline roadmap and architecture spec truth.
2. Inventory current owner boundaries and duplicated topology decision paths.
3. Extract boot/join/rejoin into the membership owner contract.
4. Extract partitioning/rebalancing into placement and operation owner
   contracts.
5. Cut projection/readiness consumers over to the canonical contract.
6. Delete legacy paths and prove the representative gates.

## Out Of Scope

1. Pro or Enterprise-only behavior, operator flows, or control surfaces.
2. Runtime/source-code changes in the spec and roadmap rebaseline package.
3. User-visible partition, replica, or rebalancing management APIs.
4. Broad Phase 0.5 or Phase 1.0 platform work.

## Validation Ladder

1. `npm run work:validate`
2. `npm run work:context`
3. `git diff --check -- work/ideas work/packages work/sprints .kiro/specs/core-topology-control-plane-rewrite roadmap.md`
4. Runtime package-specific proof ladders after the setup package.

## Done When

1. The roadmap names this rewrite as the current Phase 0.1 representative track.
2. The active package and successor queue exist in root package scope.
3. The architecture spec exists under
   `.kiro/specs/core-topology-control-plane-rewrite/`.
4. Current-blocker handoff points at the active rewrite package.
