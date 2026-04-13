# Runtime Failure Reproduction and Trace Alignment Pack

## Why

The rerun set already narrowed the system down to three residual runtime
families, but the evidence is still spread across scenario logs, failure-bundle
output, and subsystem-specific warnings. Before changing runtime ownership
paths again, we need one aligned evidence table that ties scenario, signature,
owner path, and first destabilizing signal together.

## Scope Basis

Roadmap and AGPL-scoped matrix rows:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Convergence Ownership and Stability Sprint](../sprints/done-2026-q2-runtime-convergence-ownership-and-stability.md)

## In Scope

1. Build one focused baseline table for the seven failed rerun scenarios.
2. Map each scenario to one primary runtime family and one backup signal chain.
3. Align existing failure-bundle output, report JSON, and subsystem logs around
   shared evidence fields.
4. Add explicit capture for selected-seed health, publication-set disagreement,
   and late admin visibility collapse.
5. Keep the resulting evidence shape small enough to drive implementation work
   without reading raw logs first.

## Out Of Scope

1. Broad matrix expansion beyond the focused failing scenario set.
2. New dashboards or UI work outside harness artifacts.
3. Runtime changes that are not justified by the aligned evidence table.

## Invariants

1. Each failed scenario maps to one primary runtime family.
2. The first destabilizing signal is explicit, not reconstructed from broad
   timeout wording.
3. Evidence fields used for runtime fixes come from stable artifact output, not
   ad-hoc log grep alone.

## Hotspots

1. `test/distributed/harness/failure-bundle.js`
2. `test/distributed/harness/cluster.js`
3. `test-output/reports/rerun-*.report.json`
4. `test/distributed/run.js`

## Status

Completed on 2026-04-11 for the focused 7-scenario rerun set.

## Evidence Table

| Scenario | Result | Primary family | First destabilizing signal | Terminal symptom |
| --- | --- | --- | --- | --- |
| `node-join-under-load` | fail | startup selected-seed / snapshot survivability | selected snapshot `3/5`, seed readiness probe timeout, missing published nodes `2/5` | ACTIVE timeout at ~122s |
| `postgres-baseline-comparison` | fail | startup selected-seed / snapshot survivability | selected snapshot `0/5`, non-authoritative bootstrap-health witness | ACTIVE timeout at ~122s |
| `seven-node-load-during-partitioning` | pass | none | none | stabilized |
| `seven-node-read-write-load-distribution` | fail | admin visibility / write-pressure collapse | split-policy apply fails with distributed participant failures | split-policy visibility timeout |
| `seven-node-postgres-baseline-partition-split` | fail | startup selected-seed / snapshot survivability | selected snapshot `0/7` despite admin-ready witness | ACTIVE timeout at ~229s |
| `seven-node-read-write-load-transaction-recovery` | fail | recovery-pressure admin visibility collapse | control-lane create timed out after 15000ms | `table_id` visibility timeout |
| `seven-node-table-partition-distribution` | fail | startup selected-seed / snapshot survivability | active nodes reach `5/7` while selected snapshot remains `0/7` | ACTIVE timeout at ~227s |

## Detection / Analysis Tasks

- [x] Build the seven-scenario baseline table with primary family, first signal,
      and terminal symptom.
- [x] Confirm whether selected-seed choice, publication disagreement, and admin
      visibility timeout are already represented in one stable artifact shape.
- [x] Identify missing evidence fields required to make runtime fixes without
      reopening raw log spelunking.

## Implementation Tasks

- [x] Add any missing summary fields needed for selected-seed, publication-set,
      and admin-visibility diagnosis.
- [x] Normalize focused rerun output into one comparable scenario summary shape.
- [ ] Add a focused regression or fixture path that locks the scenario-to-family
      mapping for the current rerun set.

## Validation

1. The seven failing reruns can be summarized without opening full raw logs.
2. Each scenario has one primary runtime family and one explicit owner-path hint.
3. The evidence table is sufficient to drive the next three packages.

## Done When

1. The rerun set is pinned to a stable runtime-family baseline.
2. Selected-seed, publication, and admin-collapse evidence are first-class
   summary fields.
3. Further stabilization work can rely on aligned artifacts instead of raw log
   archaeology.
