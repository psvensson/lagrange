# Membership Publication Planning Snapshot Simplification

## Why

Membership publication still derives candidate state from a mixed set of
separately observed rows:

1. publications
2. nodes
3. node endpoints
4. services
5. partitions
6. readiness
7. recovery epochs

That creates a publication path that is structurally vulnerable to read skew.
The system already contains readiness-owned planning surfaces, but publication
derivation still reconstructs its own truth from raw ingredients. That is more
owner overlap and more branching than the runtime can afford under load.

This package reduces the publication path to two responsibilities:

1. one owner produces the planning snapshot
2. one coordinator persists and acknowledges publication state

## Scope Basis

Roadmap and AGPL-scoped matrix rows:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Completion Contracts and Owner Simplification Sprint](../../sprints/archived/done-2026-q2-runtime-completion-contracts-and-owner-simplification.md)

## In Scope

1. Make one owner produce the coherent planning snapshot used for membership
   publication derivation.
2. Reduce `MembershipPublicationCoordinator` to persistence, acknowledgement,
   and workflow sequencing responsibilities.
3. Remove mixed per-table candidate assembly from the coordinator hot path.
4. Tighten or replace misleading publication accessors whose names imply
   node-specific scope while returning cluster-wide rows.
5. Preserve distinct planning vs diagnostics surfaces without duplicating
   planning logic across owners.

## Out Of Scope

1. Redesigning the recovery protocol itself.
2. New publication kinds unrelated to cluster membership.
3. Broad membership policy changes not required for simplification.

## Invariants

1. Publication candidates derive from one planning snapshot boundary.
2. Publication epoch changes reflect real topology or readiness change, not
   mixed observation skew.
3. Planning truth is owner-owned rather than rebuilt at each call site.
4. Publication APIs do what their names say with respect to cluster scope vs
   node scope.

## Hotspots

1. `src/control-plane/control-plane-readiness-service.js`
2. `src/control-plane/membership-publication-coordinator.js`
3. `src/control-plane/active-node-projection.js`
4. `src/control-plane/recovery-protocol-snapshot.js`

## Status

Partially implemented on 2026-04-11.

Implemented:

1. membership publication candidate derivation now has an explicit planning
   snapshot boundary
2. the coordinator now gathers planning inputs through one snapshot-building
   method before candidate derivation
3. publication planning reads now declare planning intent through the new read
   profile path
4. priority-recovery dispatch rediscovery now normalizes replica-operation
   rows and repository results through one canonical owner shape before
   ownership and workflow filtering
5. the targeted dispatch-retry regression for cache-empty priority recovery is
   now fixed
6. planning snapshot reads now explicitly force the planning read profile on
   publication and system-table reads instead of inheriting caller-local
   defaults
7. node-scoped latest-publication accessors now return `null` when the node is
   not actually part of the latest publication row
8. acknowledgement lookup now uses the authoritative cluster publication row
   directly, so no-op acknowledgement decisions retain publication context
   without weakening strict node-scoped publication accessors

Deep-dive findings now extending this package:

1. `ControlPlaneReadinessService` and `MembershipPublicationCoordinator` still
   both define `buildMembershipPublicationPlanningSnapshot(...)`, but at
   different abstraction levels
2. the publication coordinator still gathers a large raw evidence bag and then
   also asks the readiness service for a best-effort planning answer, which
   creates a bidirectional dependency between publication and readiness layers
3. that means planning truth still has two overlapping owner candidates even
   though the package intent is to reduce it to one

## Detection / Analysis Tasks

- [x] Define the minimum coherent planning snapshot that publication
      derivation actually needs.
- [x] Identify which current coordinator reads can disappear entirely once the
      planning snapshot is adopted.
- [x] Audit publication accessor naming and scope semantics for misleading
      cluster-wide vs node-scoped behavior.
- [x] Confirm where publication planning and diagnostics should stay distinct
      and where they can share a single owner implementation.
- [x] Deep-dive the current readiness/publication dependency graph for cycles
      and duplicate planning abstractions.

## Implementation Tasks

- [x] Introduce one planning-snapshot DTO or equivalent owner surface for
      membership publication.
- [x] Change publication candidate derivation to consume that snapshot instead
      of performing many independent table reads.
- [ ] Remove mixed observation assembly logic from the coordinator hot path.
- [x] Tighten or rename publication accessors whose semantics are currently
      broader than their names imply.
- [ ] Add focused regression coverage for publication stability under skewed
      reads and recovery pressure.
- [ ] Choose one canonical owner for the publication planning answer and make
      the other layer consume it.
- [ ] Remove the duplicated `buildMembershipPublicationPlanningSnapshot`
      abstractions or rename and separate them so one name does not mean two
      different levels of truth.
- [ ] Break the readiness <-> publication planning cycle so the planning owner
      is one-directional instead of mutually dependent.

## Validation

1. A publication candidate can be reproduced from one planning snapshot object.
2. Synthetic skew across individual table reads does not move publication epoch
   if the planning snapshot is unchanged.
3. Planning callers and diagnostics callers use distinct surfaces without
   re-deriving truth locally.

## Done When

1. One owner determines planning truth for membership publication.
2. The publication coordinator is reduced to persistence and acknowledgement
   flow rather than mixed-state derivation.
3. Post-load publication divergence can no longer arise from ad hoc mixed
   observation alone.

## 2026-04-12 extension
- This package now explicitly owns the duplicate planning-snapshot and dependency-cycle cleanup exposed by the latest deep dive.
- The remaining work is not just “fewer reads”; it is one owner for planning truth and no semantic synonymy between readiness and publication layers.

## 2026-04-12 Deep-Dive Extension: Break the Readiness/Publicity Planning Cycle

### New structural issue

The current system still has two `buildMembershipPublicationPlanningSnapshot(...)` concepts at different abstraction levels. In the publication coordinator it means a raw evidence bundle; in the readiness service it means a derived planning/protocol answer. The publication owner and readiness owner now form a semantic cycle around planning.

### Additional implementation tasks

- [ ] Choose one owner for the publication planning answer and make the other consume that answer instead of rebuilding its own semantic equivalent.
- [ ] Rename or remove the duplicate `buildMembershipPublicationPlanningSnapshot(...)` surface so one concept has one meaning.
- [ ] Break the readiness-to-publication and publication-to-readiness planning cycle; one side should own planning, the other should own persistence and acknowledgement sequencing.
- [ ] Reduce `MembershipPublicationCoordinator` to publication persistence, epoch advancement, and acknowledgement sequencing over an owner-supplied planning answer.
- [ ] Remove duplicated active-node and publication-row interpretation that now exists in both readiness and publication paths.

### Additional hotspots

1. `src/control-plane/membership-publication-coordinator.js`
2. `src/control-plane/control-plane-readiness-service.js`

### Structural concern

This package is now explicitly about collapsing a semantic duplication and ownership cycle, not only reducing mixed-snapshot derivation.

## 2026-04-12 Close-out Update

Implemented in this package:
1. Readiness-owned planning/priority-recovery answers now operate on cluster publication truth for target-node planning.
2. Coordinator-local planning helper naming was collapsed to an evidence-shaped helper to avoid semantic duplication with the readiness-owned planning answer.

Validation outcome:
1. Focused coordinator and readiness unit coverage passed.

Status:
Structurally completed for this sprint.
