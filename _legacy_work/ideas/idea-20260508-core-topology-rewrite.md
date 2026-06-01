# Core Topology Control-Plane Rewrite

Opened: 2026-05-08

## Idea

Rewrite the core topology control plane around four semantic owners and one
projection/readiness contract so boot, join, rejoin, partitioning, and
rebalancing stop sharing implicit phase state and fallback interpretation.

## Problem

The Phase 0.1 representative gate keeps migrating across topology publication,
operation scheduling, workflow progress, snapshot reachability, and readiness
boundaries. The repeated migrations indicate that the current control-plane
surface is too porous: bootstrap phases, join/rejoin paths, rebalancer logic,
partition placement, projection publication, and readiness consumers can each
reinterpret partial evidence.

## Rewrite Shape

The rewrite must define four semantic owners:

1. Topology membership owner: node identity, incarnation, admission, join, and
   rejoin session state.
2. Topology placement owner: partition assignment, replica intent, split/move
   intent, and placement policy.
3. Topology operation owner: durable topology operations, workflow progress,
   actuation, retry, terminal outcome, and resume.
4. Topology publication owner: canonical topology projection, acknowledgements,
   freshness, and watch/resume visibility.

Projection/readiness is the shared consumer contract above those owners:

1. Projection publishes one canonical snapshot and revision stream.
2. Readiness consumes the projection plus explicit owner outcomes.
3. Readiness emits named internal, repair, and serve states.
4. Consumers may not combine raw cache, SQL, transport, or phase evidence to
   recreate readiness locally.

## Initial Package Queue

1. `work/packages/done-20260508-core-topology-rewrite-spec-and-roadmap-rebaseline.md`
2. `work/packages/done-20260508-core-topology-owner-boundary-inventory.md`
3. `work/packages/done-20260508-core-topology-boot-join-rejoin-kernel.md`
4. `work/packages/done-20260508-core-topology-partitioning-rebalancing-kernel.md`
5. `work/packages/done-20260508-core-topology-publication-projection-boundary.md`
6. `work/packages/done-20260508-core-topology-projection-readiness-contract.md`
7. `work/packages/done-20260508-core-topology-legacy-path-deletion-and-proof.md`

## Out Of Scope

1. Pro or Enterprise control surfaces.
2. User-facing partition or replica management APIs.
3. Runtime/source-code changes in the setup and spec package.
4. Harness timeout increases or presentation-only blocker relabeling.
