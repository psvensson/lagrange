# Query Magic-Literal Cleanup Batch 1

## Why

The first literal audit showed `src/query` as one of the largest doctrine and
system-guideline violation clusters:
1. `913` violations before cleanup
2. `src/query/sql-parser.js`: `72`
3. `src/query/partition-resolver.js`: `36`
4. `src/query/distributed/parallel-query-coordinator.js`: `37`

These files were good first targets because:
1. they are central query-path utilities
2. they were below the two largest query hotspots
3. they allow mechanical constant-owner cleanup without changing deeper query
   semantics

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## Guideline Basis

From `.kiro/steering/system guidelines.md` §4.1:
1. never use string or number literals directly in code
2. shared scalars belong in constants-owner modules
3. private file-local named constants are allowed

## Scope

Files in this batch:
1. [sql-parser.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/query/sql-parser.js)
2. [partition-resolver.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/query/partition-resolver.js)
3. [parallel-query-coordinator.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/query/distributed/parallel-query-coordinator.js)

## Invariants

1. Reuse existing constant owners where they already exist.
2. Use file-local named constants for query-local literals instead of creating
   new cross-cutting constants modules.
3. Keep the changes mechanical and behavior-preserving.
4. Prove the cleanup with focused query suites.

## Implementation Tasks

- [x] Replace shared numeric and `typeof` literals with existing `NUM` and
      `TYPEOF` constants where appropriate.
- [x] Introduce file-local named constants for parser/query-local literals.
- [x] Run focused query suites for the touched files.
- [x] Rerun the literal audit on the touched files and the `src/query` area.

## Done When

1. The three selected query files use named constants instead of free-floating
   strings/numbers on the touched paths.
2. Focused query suites pass.
3. The batch has a measured before/after reduction.

## 2026-04-12 execution update

Implemented:
1. [sql-parser.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/query/sql-parser.js)
   now uses `NUM`, `TYPEOF`, and file-local constants for insert modes,
   schema keywords, join types, sort directions, and SQL operator literals.
2. [partition-resolver.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/query/partition-resolver.js)
   now uses `NUM`, `TYPEOF`, and file-local unary-operator constants on the
   routing/comparison path.
3. [parallel-query-coordinator.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/query/distributed/parallel-query-coordinator.js)
   now uses `NUM`, `TYPEOF`, and file-local result-estimation / replica-status
   constants on the coordinator path.

Focused validation passed:
1. `node test/query/sql-parser.test.js`
2. `node test/query/partition-resolver.test.js`
3. `node test/query/parallel-query-coordinator.test.js`

Measured reduction:
1. three-file batch before: `145` violations
2. three-file batch after: `22` violations
3. reduction: `123`
4. batch report:
   [guideline-literals-query-batch-1.json](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/test-output/analysis/guideline-literals-query-batch-1.json)

Query-area progress:
1. `src/query` before: `913`
2. `src/query` after batch 1: `790`
3. area report:
   [guideline-literals-src-query-after-batch-1.json](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/test-output/analysis/guideline-literals-src-query-after-batch-1.json)

Next target inside `src/query`:
1. `src/query/sql-query-engine.js`
2. `src/query/query-executor.js`
3. `src/query/table-creation-service.js`
