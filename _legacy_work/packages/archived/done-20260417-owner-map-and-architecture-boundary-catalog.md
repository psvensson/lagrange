# Owner-Map And Architecture Boundary Catalog

## Why

The current architecture and owner-map docs already help, but repeated runtime
and harness debugging still requires too much code archaeology to answer four
basic questions:

1. who owns this boundary
2. what evidence is canonical
3. what outcome vocabulary is canonical
4. which consumers may read versus reinterpret that outcome

That means the current docs are useful but not yet explicit enough at the
shared boundary level where the recent failures cluster.

This package exists to strengthen the documentation so active architectural
boundaries are recorded as concrete owner contracts rather than only as prose
or scattered implementation details.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
2. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Add a boundary catalog to the current owner-map and architecture docs for
   the active distributed and control-plane hotspot families.
2. For each documented boundary, record:
   - semantic owner
   - canonical evidence inputs
   - canonical snapshot or outcome vocabulary
   - allowed consumers
   - prohibited caller-side reinterpretations
   - primary diagnostics fields
3. Make the new benchmark and recovery boundary work packages update that
   catalog when they add or reshape shared owner contracts.
4. Prefer concise tables or structured subsections over long narrative prose.

## Out Of Scope

1. Broad conceptual essays detached from current implementation.
2. New roadmap or product-scope decisions.
3. Duplicating stable doctrine text inside architecture docs.
4. Treating documentation as a substitute for missing runtime ownership.

## Invariants

1. `architecture/current-owner-maps.md` remains the home for current concrete
   owner paths.
2. `architecture.md` remains the canonical implementation architecture record.
3. The catalog must describe active owner boundaries precisely enough that a
   maintainer can tell whether a proposed fix adds a shadow interpretation
   layer.
4. Documentation must describe one boundary once instead of repeating slightly
   different explanations in several places.

## Hotspots

1. `architecture/current-owner-maps.md`
2. `architecture.md`
3. `work/packages/archived/done-20260417-benchmark-usable-spread-owner-collapse.md`
4. `work/packages/archived/done-20260417-canonical-convergence-diagnostics-emission.md`
5. `work/packages/archived/done-20260417-structured-deferred-outcome-doctrine-and-audit.md`

## Analysis Tasks

- [x] Confirm that recent debugging still depends too much on reading code
  because boundary docs do not fully spell out consumers and canonical
  outcomes.
- [x] Confirm that current owner-map docs are the right record to extend rather
  than introducing a new parallel documentation layer.
- [x] Identify the core fields each boundary entry must carry to stay useful.

## Implementation Tasks

- [x] Add a reusable boundary-catalog structure to
  `architecture/current-owner-maps.md`.
- [x] Add the corresponding higher-level explanation to `architecture.md`.
- [x] Populate the catalog for the current benchmark admission, usable spread,
  dispatch contribution, and deferred-outcome boundaries.
- [x] Update related work packages so their documentation decisions point at
  the catalog instead of describing new ad hoc destinations.

## Progress Notes

1. `architecture/current-owner-maps.md` now includes one reusable active
   boundary catalog with owner, evidence, vocabulary, consumers, forbidden
   reinterpretations, and diagnostics for each hotspot.
2. `architecture.md` now points future fixes back to that catalog instead of
   allowing new prose-only explanations to fork away from the concrete owner
   map.

## Documentation Decision

1. This package intentionally uses `architecture/current-owner-maps.md` and
   `architecture.md` as the only durable records.
2. No new documentation home should be introduced for current owner-path
   boundary catalogs.
3. Stable doctrine wording belongs in `.kiro/steering/doctrine.md`, which is
   handled by a separate package.

## Validation

1. Manual consistency check across the touched work packages and architecture
   docs
2. Link and reference sanity review in the touched markdown files

## Done When

1. The active hotspot boundaries are documented in one consistent catalog.
2. Each catalog entry states owner, evidence, vocabulary, consumers, and
   forbidden reinterpretations.
3. Future package work can extend the catalog instead of restating the same
   boundary informally.
