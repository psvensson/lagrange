# Query Owner Shared Front And Routing Contract Reduction

## Status

Done on 2026-04-20.

This child package executes the next highest-signal internal duplication slice
under `done-20260420-segmented-owner-internal-duplication-reduction-umbrella.md`.

## Why

The query boundary had two coupled problems:

1. oversized shared fronts in the segmented query owners
2. duplicated canonical-leader and retryable control-plane mutation shaping
   spread across `sql-query-engine` and `query-executor`

The package goal was to collapse those fronts semantically, not by adding more
numbered slices, while keeping the canonical shared ingresses intact.

## Scope

1. `src/query/query-executor-shared.js`
2. `src/query/query-executor-segment-2-part-2.js`
3. `src/query/query-executor-segment-3-part-1.js`
4. `src/query/query-executor-segment-3-part-2.js`
2. `src/query/sql-query-engine-shared.js`
6. `src/query/sql-query-engine-segment-7.js`

## Invariants

1. `QUERY_EXECUTOR_SHARED` and `SQL_QUERY_ENGINE_SHARED` remain the canonical
   shared ingresses for their owners.
2. No new synthetic bundle objects or segmentation layers.
3. The reduction must leave the touched files lint-clean under the repo ESLint
   config.
4. Canonical leader identity, routing-gap, and retryable control-plane
   mutation outcomes still flow through one owner-shaped contract.

## Validation

1. `npx eslint src/query/query-executor-shared.js src/query/query-executor-segment-2-part-2.js src/query/query-executor-segment-3-part-1.js src/query/query-executor-segment-3-part-2.js src/query/sql-query-engine-segment-2.js src/query/sql-query-engine-segment-7.js src/query/sql-query-engine-shared.js`
2. `npx tap test/query/query-executor.test.js --grep "fresh bootstrap routing admits transport-connected services while node heartbeat publication lags"`
3. `npx tap test/query/query-executor.test-part-6.js`
4. `npx tap test/query/sql-query-engine.test-part-3.js`
5. `npx tap test/query/sql-query-engine.test-part-8.js`
6. `npm run test:duplication`
7. `npm run test:metrics`

## Closure Notes

1. The query-owner shared fronts now only destructure the dependencies their
   segments actually consume.
2. Canonical leader routing state is emitted through one richer snapshot
   contract instead of being rebuilt differently across callers.
3. Retryable transaction-control failures now preserve lower-path semantics
   when the recovery routing contract allows widening, while still collapsing to
   canonical defer results when the owner gap is real.
4. Repository duplication baseline tightened from `21 / 964` to
   `18 / 715`.
