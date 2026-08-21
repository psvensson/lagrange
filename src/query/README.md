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
- `QueryExecutor` owns partition message routing and deadline-bounded retry.
- `TableCreationService` owns normalized schema intent and composes
  `SchemaProvisioningJobOwner`: one atomic `schema_operations` outbox row,
  storage-fenced replay, deterministic metadata/child-operation identity, and
  stable pending/success/failure projection. The caller timeout only bounds
  waiting for that durable job; it never cancels the job itself. Public CREATE
  has no legacy fallback: unavailable durable persistence fails closed.
- Runtime primitives such as `lookup`, `emit`, and `broadcast` must route
  through the shared execution model.

## First Files

- `index.js` for exported query/runtime surface.
- `sql-request.js` before adding entrypoint input shape.
- `sql-query-engine.js` before changing SQL semantics.
- `query-executor.js` and its partition-delivery segments before changing
  execution or routing behavior.
- `canonical-leader-routing.js` for canonical leader-gap decisions.
- `runtime-runner.js` and `execution-context.js` for runtime API changes.

## Do Not

- Do not add a second SQL engine or fallback execution path.
- Do not start nested work with a fresh default timeout budget; derive from the
  caller budget.
- Do not provision CREATE side effects before the schema job insert, and do not
  add a schema-local lease implementation beside `DurableWorkflowCoordinator`.
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
