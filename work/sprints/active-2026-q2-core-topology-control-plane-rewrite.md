# Core Topology Control-Plane Rewrite Sprint

## Goal

Make the core topology control plane explicit enough that Phase 0.1 closure no
longer depends on reactive fixes across bootstrap, join/rejoin, publication,
readiness, operation scheduling, and rebalancer paths.

## Current Blocker Snapshot

Active package:

1. [Core Topology Boot Join Rejoin Kernel](../packages/active-20260508-core-topology-boot-join-rejoin-kernel.md)

Current blocker:

1. Agent Dalton implemented the boot/join/rejoin membership owner outcome
   across rejoin hints, startup join decisions, membership lifecycle intents,
   seed contact, bootstrap admission, and durable rejoin registration.
2. Focused owner-path validation, file-scoped guardrails, work validation,
   context refresh, and diff whitespace proof are green; the package remains
   uncommitted per user instruction.

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

1. Done: [Core Topology Rewrite Spec And Roadmap Rebaseline](../packages/done-20260508-core-topology-rewrite-spec-and-roadmap-rebaseline.md)
2. Done: [Core Topology Owner Boundary Inventory](../packages/done-20260508-core-topology-owner-boundary-inventory.md)
3. Active: [Core Topology Boot Join Rejoin Kernel](../packages/active-20260508-core-topology-boot-join-rejoin-kernel.md)
4. Todo: [Core Topology Partitioning Rebalancing Kernel](../packages/todo-20260508-core-topology-partitioning-rebalancing-kernel.md)
5. Todo: Publication Projection Boundary (package file to create when the
   partitioning/rebalancing kernel hands off)
6. Todo: [Core Topology Projection Readiness Contract](../packages/todo-20260508-core-topology-projection-readiness-contract.md)
7. Todo: [Core Topology Legacy Path Deletion And Proof](../packages/todo-20260508-core-topology-legacy-path-deletion-and-proof.md)

## Execution Order

1. Rebaseline roadmap and architecture spec truth.
2. Inventory current owner boundaries and duplicated topology decision paths.
3. Extract boot/join/rejoin into the membership owner contract.
4. Extract partitioning/rebalancing into placement and operation owner
   contracts.
5. Canonicalize publication rows, ACK/freshness state, and recovery gate state
   as the only publication stream consumed by projection/readiness.
6. Cut projection/readiness consumers over to the canonical contract.
7. Delete legacy paths and prove the representative gates.

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
5. The owner-boundary inventory is recorded in
   `.kiro/specs/core-topology-control-plane-rewrite/owner-boundary-inventory.md`.
