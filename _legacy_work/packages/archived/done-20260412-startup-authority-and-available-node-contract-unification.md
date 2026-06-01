# Startup Authority and Available-Node Contract Unification

## Why

The current reruns show `availableNodeCount = 1` while `healthyReplicaCount = 3`.
That is not a physical-capacity problem. It means startup-authority policy and
available-node policy are not aligned.

Bootstrap, readiness, active-node projection, and rebalancer currently consume
overlapping but not identical cohort semantics. That is a structural loop.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Seed Startup Authority and Initial Publication Establishment Sprint](../../sprints/active-2026-q2-seed-startup-authority-and-initial-publication-establishment.md)

## In Scope

1. Define one startup-authority snapshot that includes the canonical node
   cohort for startup decisions.
2. Make rebalancer available-node policy consume the same cohort contract.
3. Remove weaker startup authority fallbacks based on bootstrap-topology
   `activeNodeIds` and raw `nodes.status`.
4. Make the seed-side ready/active/available vocabulary consistent.

## Out Of Scope

1. Full active-node projection redesign for non-startup runtime phases.
2. Rebalancer policy changes unrelated to startup-authority semantics.

## Invariants

1. Bootstrap and rebalancer must not disagree on the node cohort that is
   startup-eligible.
2. Startup-authority decisions must not depend on weaker bootstrap-local node
   status hints.
3. A node that is counted as available for startup-sensitive rebalancing must
   satisfy the same authority contract as startup readiness.

## Hotspots

1. `src/bootstrap/owners/bootstrap-cluster-view-owner.js`
2. `src/bootstrap/join-readiness-evaluator.js`
3. `src/bootstrap/bootstrap-topology-snapshot.js`
4. `src/control-plane/active-node-projection.js`
5. `src/rebalancer/unified-rebalancer.js`
6. `src/bootstrap/owners/bootstrap-readiness-owner.js`

## Detection / Analysis Tasks

- [ ] Trace where `availableNodeCount` is derived for startup-sensitive
      rebalancing.
- [ ] Inventory the remaining active-node fallbacks used only during startup.
- [ ] Confirm where bootstrap and rebalancer still observe different cohorts
      for the same seed-side topology.

## Implementation Tasks

- [ ] Introduce one startup-authority snapshot with canonical node cohort.
- [ ] Make bootstrap cluster view, join readiness, and startup-sensitive
      rebalancer logic consume that snapshot.
- [ ] Remove or quarantine bootstrap-topology and `nodes.status` fallback from
      startup-authority decisions.
- [ ] Surface cohort source and exclusion reasons in diagnostics.

## Validation

1. Logs for startup-sensitive rebalancing and bootstrap readiness report the
   same node cohort source and count.
2. `availableNodeCount = 1` no longer persists merely because startup
   consumers disagree about authority.

## Done When

1. Startup authority and available-node policy share one node cohort contract.
2. Bootstrap-local fallback semantics no longer silently override readiness or
   publication truth during startup.

## 2026-04-12 execution update

Status: implemented.

What landed:
- bootstrap cluster view now prefers readiness-owned startup-authority cohorts during unpublished startup
- join readiness now prefers readiness-owned recovery-eligible / startup-authority cohorts instead of bootstrap-topology active-node metadata
- unified rebalancer now consumes the startup-authority cohort when determining available system-partition nodes during startup

Validation:
- focused startup-authority consumer tests passed
- existing bootstrap, join-readiness, and unified-rebalancer suites passed

Runtime result:
- consumer unification did not move the live blocker
- distributed runs still flatline before first authoritative publication is created

## 2026-04-12 implementation slice

Implemented:
- readiness planning answers now come from `MembershipPublicationCoordinator` sync/async derivation instead of inferring startup phase only from the latest publication row
- this preserves one owner path for the startup cohort and removes the earlier null-driven phase collapse

Validation:
- `test/control-plane/membership-publication-coordinator.test.js`
- `test/control-plane/control-plane-readiness-service.test.js`
- `test/bootstrap/bootstrap-api.test.js`
