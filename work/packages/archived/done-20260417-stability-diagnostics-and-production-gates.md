# Stability Diagnostics And Production Gates

## Why

The current diagnostics already contain strong raw evidence, but the operator
surface still under-reports the real blocker.

The latest failure bundle can identify:

1. the blocked critical partitions
2. the stalled operation
3. the semantic partition states

Yet the top-level triage summary can still say:

1. `Root Cause Class: unknown`
2. `Top Reasons: none`

That makes verification slower and also blocks the repo's remaining
AGPL-scoped production guarantees work, because the system cannot yet state or
measure its own critical failure class cleanly.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
2. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
3. `Failover SLO definition` (`roadmap.md`, `edition-matrix.md`)
4. `Durability SLO definition` (`roadmap.md`, `edition-matrix.md`)

Architecture and analysis basis:

1. `test/distributed/harness/failure-bundle.js`
2. `test/distributed/harness/report-writer.js`
3. `work/sprints/archived/done-2026-q2-distributed-stability-and-recovery-completion.md`

## Sprint Umbrella

[Distributed Stability And Recovery Completion Sprint](../sprints/archived/done-2026-q2-distributed-stability-and-recovery-completion.md)

## In Scope

1. Promote canonical critical-lane witnesses into the top-level triage and
   report surfaces.
2. Define one stability-focused reason hierarchy for the current recovery
   family.
3. Add measurable gates for failover, convergence, and restart recovery.
4. Define the minimal AGPL-scoped failover and durability production bars
   needed for this workstream.

## Out Of Scope

1. Pro-only advanced observability features.
2. A full metrics platform redesign.
3. Broad durability feature work outside definition, reporting, and gating.

## Invariants

1. If a canonical witness exists, the top-level report must not collapse to
   `unknown`.
2. Diagnostics must consume owner-owned vocabularies instead of inventing a
   second semantic layer.
3. Production gates must be measurable from repo-owned evidence and scenarios.

## Hotspots

1. `test/distributed/harness/failure-bundle.js`
2. `test/distributed/harness/report-writer.js`
3. `test/distributed/README.local.md`
4. `src/admin/admin-control-snapshot.js`
5. `src/control-plane/control-plane-diagnostics-ledger.js`
6. `roadmap.md`
7. `.kiro/steering/testing-guidelines.md`

## Detection / Analysis Tasks

- [x] Inventory the current root-cause and reason hierarchies across reports.
- [x] Detect where canonical witnesses are dropped before top-level reporting.
- [x] Define the minimal stability gate set for failover, restart recovery,
      and convergence.
- [x] Define how those gates will be measured from distributed-harness output.
- [x] Detect missing operator-facing diagnostics for critical recovery health.

## Implementation Tasks

- [x] Surface canonical critical witnesses into triage summaries and reports.
- [x] Add explicit failover and recovery gate fields to the report outputs.
- [x] Record the AGPL-scoped failover and durability bar definitions needed by
      this workstream.
- [x] Add focused tests for reason selection and gate calculation.
- [x] Perform the required closure deep dive across all affected code and doc
      areas; fix spotted mistakes, irregularities, and doctrine violations or
      split follow-up packages before closure.

## Validation

1. Failure-bundle and report-writer regression tests.
2. One artifact replay using the latest seven-node failure.
3. One passing scenario and one failing scenario proving the gate outputs.
4. Review that the production-bar definitions remain AGPL-scoped.

## Done When

1. Top-level triage reports the real critical-lane blocker when one exists.
2. Failover, restart recovery, and convergence gates are explicit and
   measurable.
3. The remaining AGPL-scoped production guarantees work has concrete report
   surfaces and test hooks.
4. The required closure deep dive is complete and any discovered issues are
   fixed or split forward.
