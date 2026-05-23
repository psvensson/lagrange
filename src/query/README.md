# Query Owner Card

## Role

`src/query/` owns SQL request normalization, SQL planning and execution,
partition routing, distributed query primitives, runtime calls, and query
budget enforcement.

## Primary Owners

- `SQLQueryEngine` is the single SQL planner and executor.
- `SqlRequest` owns normalized query ingress shape.
- `QueryExecutor` owns execution over resolved partitions.
- `PartitionResolver` owns partition lookup for query planning.
- `QueryRouter` owns partition message routing and bounded retry.
- `TableCreationService` owns table bootstrap provisioning through the caller
  timeout budget.
- Runtime primitives such as `lookup`, `emit`, and `broadcast` must route
  through the shared execution model.

## First Files

- `index.js` for exported query/runtime surface.
- `sql-request.js` before adding entrypoint input shape.
- `sql-query-engine.js` before changing SQL semantics.
- `query-executor.js` and `query-router.js` before changing execution or
  routing behavior.
- `canonical-leader-routing.js` for canonical leader-gap decisions.
- `runtime-runner.js` and `execution-context.js` for runtime API changes.
- Existing `sql-query-engine-segment-*`, `query-executor-segment-*`, and
  `table-creation-service-class-part-*` files are legacy compatibility
  surfaces. Use `work/inventory/ordinal-segments.md` when opening semantic
  migration packages for these files.

## Do Not

- Do not add a second SQL engine or fallback execution path.
- Do not start nested work with a fresh default timeout budget; derive from the
  caller budget.
- Do not infer write leader identity from supporting service metadata when the
  canonical owner row exists.
- Do not leak raw storage, transport, or parser shapes into runtime contracts.
- Do not add new `segment`, `stage`, or `part` files when extracting; use
  owner-specific names for new boundaries.

## Proof Surface

- Focused tests under `test/query/`.
- PG wire tests when protocol-visible SQL behavior changes.
- Runtime adapter tests when service or WASM calls consume the changed path.
- Runtime grammar and decision-boundary guardrails for routing, retry, budget,
  and outcome changes.
