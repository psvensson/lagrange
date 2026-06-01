# Query Executor Boundary Decompression and Formatting

## Why

`src/query/query-executor.js` is still a compressed hotspot that mixes
routing authority, retry budgets, candidate ordering, transport behavior,
and diagnostics shaping in one file. That shape slows down current harness
bug hunts because simple changes are hard to localize and review safely.

Before deeper owner-splitting work continues, the file needs one formatting
and structural readability pass so later edits can follow the system
guidelines instead of piling more logic onto an unreadable surface.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Rewrite `src/query/query-executor.js` into a readable, consistently
   formatted file without changing its semantic contracts.
2. Split obviously compressed helper blocks into owner-local helpers where
   needed to make later boundary extraction safe.
3. Preserve the current query-routing, retry, and diagnostics behavior while
   improving file readability and reviewability.
4. Update direct query-owner tests only where fixture or snapshot formatting
   expectations require it.

## Out Of Scope

1. New routing or retry behavior
2. Large contract changes between `QueryExecutor`, `SQLQueryEngine`, and
   transport
3. Broader query-lane simplification beyond the readability/decompression pass

## Scenario Targets

1. `seven-node-load-during-partitioning`
2. `seven-node-read-write-load-transaction-recovery`
3. `node-join-under-load`

## Invariants

1. The pass must be formatting-first and behavior-preserving.
2. Existing query-routing diagnostics and typed retry metadata must remain
   intact.
3. The resulting file must be materially easier to inspect before follow-on
   owner-split packages begin.

## Hotspots

1. `src/query/query-executor.js`
2. direct query-owner tests that prove behavior stayed stable

## Detection / Analysis Tasks

- [ ] Record the current compressed sections and the helper clusters they hide.
- [ ] Identify sections that can be safely split without changing behavior.
- [ ] Confirm the formatting pass preserves current boundary contracts.

## Implementation Tasks

- [ ] Rewrite the file into readable, consistently formatted sections.
- [ ] Extract owner-local helpers only where needed to remove compressed blocks.
- [ ] Keep behavior stable and avoid broad logic changes in this package.

## Residual Closure Inventory

- [ ] `src/query/query-executor.js` no longer contains compressed sections that
      block follow-on refactors.
- [ ] Query-owner tests still prove the pre-existing behavior.
- [ ] Follow-on owner-split work is linked explicitly rather than implied.

## Validation

1. Targeted `QueryExecutor` unit coverage
2. Focused query-path integration coverage that exercises fanout and retries
3. `npm run test:metrics`

## Done When

1. `src/query/query-executor.js` is readable enough for bounded owner-split
   work.
2. The pass is behavior-preserving and tests stay green.
3. Follow-on routing/delivery owner-split work can proceed without first doing
   another formatting cleanup.
