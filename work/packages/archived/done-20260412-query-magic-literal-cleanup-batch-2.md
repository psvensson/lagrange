# Query Magic-Literal Cleanup Batch 2

## Why

After batch 1, `src/query` still contained `790` guideline violations. A second
low-risk batch could keep reducing the area without reopening the two largest
query hotspots yet.

Selected files before cleanup:
1. `src/query/streaming-aggregator.js`: `24`
2. `src/query/query-router.js`: `11`
3. `src/query/distributed/distributed-query-planner.js`: `13`

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## Guideline Basis

From `.kiro/steering/system guidelines.md` §4.1:
1. never use string or number literals directly in code
2. shared scalars belong in constants-owner modules
3. file-local private constants are allowed

## Scope

Files in this batch:
1. [streaming-aggregator.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/query/streaming-aggregator.js)
2. [query-router.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/query/query-router.js)
3. [distributed-query-planner.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/query/distributed/distributed-query-planner.js)

## Invariants

1. Reuse `NUM` and `TYPEOF` where they already fit.
2. Introduce file-local named constants only where the query module owns the
   literal meaning.
3. Keep the cleanup behavior-preserving and bounded.
4. Prove the changes with the existing file-level query suites.

## Implementation Tasks

- [x] Replace obvious numeric and `typeof` literals in the selected files.
- [x] Introduce file-local planner/estimation constants where the module owns
      the literal.
- [x] Run targeted query suites.
- [x] Rerun the literal audit on the touched files and the `src/query` area.

## Done When

1. The selected files are measurably cleaner under the literal audit.
2. The file-level query suites pass.
3. The next remaining query hotspots are clearer than before.

## 2026-04-12 execution update

Implemented:
1. [streaming-aggregator.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/query/streaming-aggregator.js)
   now uses `NUM`, `TYPEOF`, and a file-local result-estimate constant on the
   streaming and aggregate paths.
2. [query-router.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/query/query-router.js)
   now uses `TYPEOF` for routing cache and leader-resolution checks.
3. [distributed-query-planner.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/query/distributed/distributed-query-planner.js)
   now uses `NUM`, `TYPEOF`, and a file-local plan-hash constant on the planner
   normalization and deterministic-ID path.

Focused validation passed:
1. `node test/query/distributed-query-planner.test.js`
2. `node test/query/query-router.test.js`
3. `node test/query/streaming-aggregation.property.test.js`

Measured reduction:
1. three-file batch before: `48` violations
2. three-file batch after: `8` violations
3. reduction: `40`
4. batch report:
   [guideline-literals-query-batch-2.json](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/test-output/analysis/guideline-literals-query-batch-2.json)

Query-area progress:
1. `src/query` before batch 2: `790`
2. `src/query` after batch 2: `750`
3. area report:
   [guideline-literals-src-query-after-batch-2.json](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/test-output/analysis/guideline-literals-src-query-after-batch-2.json)

Next target inside `src/query`:
1. `src/query/sql-query-engine.js`
2. `src/query/query-executor.js`
3. `src/query/table-creation-service.js`
