# Requirements Document

## Introduction

This feature defines the v0 execution model for unified SQL and programmatic
WASM execution on one runtime path:

- One SQL engine (`SqlCore`) for all entrypoints
- One scaling model (replicated WASM services)
- One runtime API surface for programmatic execution:
  - `runtime.run(async (ctx) => { ... }, opts?)`
  - `ctx.call(query, params?, handler?, opts?)`
  - `ctx.emit(key, value, meta?)`
  - `ctx.out(value, meta?)`
  - `ctx.broadcast(...)` / `ctx.useBroadcast(...)`

The system must keep user computation flexible while restricting distributed
traffic to explicit primitives so batching, dedupe, backpressure, and budgets
are enforceable in production.

## Glossary

- **SqlCore**: The single planner + executor implementation for all SQL
  requests in the system.
- **SQL_Service_Profile**: A replicated WASM service profile configured to host
  SQL protocol/session handling while delegating plan execution to SqlCore.
- **Runtime_Run**: `runtime.run(userFn, opts?)` entrypoint that injects a
  context and executes one program.
- **Distributed_Context**: Runtime context passed to user code. Contains `call`,
  `emit`, `out`, `lookup`, and broadcast helpers.
- **Iterator_Mode**: `ctx.call(...)` without a handler; returns async iterator
  output.
- **Stage_Mode**: `ctx.call(...)` with a handler; executes partition batches and
  invokes handler per batch.
- **Exchange_Stream**: Engine-managed intermediate stream used by `emit`.
- **ReduceByKey_Plan**: Plan object consumed by `ctx.call` to execute grouped
  reductions from an exchange stream.
- **Out_Stream**: Final result stream emitted by `ctx.out`.
- **Bounded_Nested_Call**: Inline nested `ctx.call` whose work can be strictly
  bounded (pk/unique lookup, capped batched key lookup, strict indexable limit).
- **Dependency_Lock**: Persisted resolved dependency graph pinned to immutable
  digests for deterministic activation.
- **Lineage_ID**: Deterministic identifier attached to stage outputs and
  primitive requests for retry dedupe.
- **Partition_Callback_Mode**: `SqlRequest.executionMode = partition_callback`
  for `DB.call(select, callback)` style execution.
- **Callback_Execution_Host**: Shared invocation surface that executes callback
  handlers through runtime drivers instead of ad-hoc callback code paths.

## Requirements

### Requirement 1: Single SQL Engine Ownership

**User Story:** As a platform operator, I want one SQL engine implementation so
that behavior and optimization remain coherent across entrypoints.

#### Acceptance Criteria

1. THE System SHALL route SQL execution from internal API calls, external SQL
   protocol sessions, and programmatic WASM calls through SqlCore.
2. THE System SHALL maintain exactly one logical planner and one operator
   library for SQL execution.
3. THE System SHALL reject configuration that enables a second SQL execution
   path or fallback engine.
4. WHEN a statement cannot be planned by SqlCore, THE System SHALL return a
   descriptive error instead of silently falling back to alternate execution.
5. THE System SHALL preserve existing SQL table/index semantics through the
   unified SqlCore path.

### Requirement 2: SQL Uses Replicated WASM Service Scaling

**User Story:** As a system architect, I want SQL and WASM workloads to scale
with one replicated service lifecycle and one distributed context model.

#### Acceptance Criteria

1. THE System SHALL represent SQL service instances as replicated WASM service
   definitions using SQL_Service_Profile.
2. THE System SHALL manage SQL service replica lifecycle with the same
   placement, rebalancing, and failover framework used for replicated WASM
   services.
3. THE System SHALL use the existing Distributed_Context backend for SQL
   service state and SHALL NOT introduce a second distributed context backend.
4. THE System SHALL expose SQL service replicas through the existing service
   endpoint registry.
5. THE System SHALL apply the same policy controls for replica count and
   placement constraints to SQL_Service_Profile as other replicated WASM
   services.

### Requirement 3: External SQL Protocol Integration

**User Story:** As an application developer, I want external SQL clients to
connect through a standard protocol while still using the same engine.

#### Acceptance Criteria

1. THE System SHALL provide an external SQL endpoint compatible with the
   PostgreSQL wire protocol (converging compatibility).
2. WHEN protocol sessions submit SQL statements, THE System SHALL compile and
   execute those statements via SqlCore.
3. THE System SHALL map authenticated protocol sessions to tenant/service policy
   before query execution.
4. THE System SHALL expose protocol capability/feature negotiation so
   unsupported features fail explicitly.
5. THE System SHALL publish protocol endpoint metadata in the service endpoint
   registry.

### Requirement 4: Runtime Entry Surface (v0)

**User Story:** As a WASM developer, I want one small runtime surface for
programmatic execution that is easy to reason about.

#### Acceptance Criteria

1. THE System SHALL provide `runtime.run(async (ctx) => { ... }, opts?)` as the
   top-level execution entrypoint.
2. `runtime.run` SHALL accept execution options including session identity,
   snapshot mode, and default budgets.
3. THE System SHALL provide `ctx.call(query, params?, handler?, opts?)` as the
   only query execution entrypoint inside runtime code.
4. THE System SHALL provide `ctx.emit(key, value, meta?)` for intermediate
   keyed movement and `ctx.out(value, meta?)` for final outputs.
5. Runtime context SHALL expose only approved distributed movement capabilities
   and SHALL NOT allow ad-hoc cross-partition RPC surfaces.

### Requirement 5: Unified `ctx.call` Modes

**User Story:** As a runtime user, I want one call API that works for iterator,
stage, and runtime-plan execution modes.

#### Acceptance Criteria

1. IF `ctx.call` is invoked without a handler, THEN THE System SHALL execute in
   Iterator_Mode and return an async iterator.
2. IF `ctx.call` is invoked with a handler, THEN THE System SHALL execute in
   Stage_Mode and invoke the handler on partition batches.
3. THE System SHALL accept SQL string queries and supported plan objects as
   `query` inputs.
4. Supported plan objects SHALL include at least `reduceByKey` and
   `useBroadcast` in v0.
5. Stage options SHALL include `batchSize` and explicit exchange controls.

### Requirement 6: Restricted Cross-Partition Movement Primitives

**User Story:** As a cluster operator, I want distributed movement to be
explicit so the engine can apply batching, dedupe, and backpressure safely.

#### Acceptance Criteria

1. THE System SHALL allow cross-partition data movement only through
   `ctx.emit`, `ctx.lookup`, and `ctx.broadcast`/`ctx.useBroadcast`.
2. THE System SHALL enforce `lookup` as batched key access limited to primary,
   unique, or explicitly bounded index lookups.
3. THE System SHALL execute `emit` through an engine-managed shuffle/group stage
   with quota-aware buffering and backpressure.
4. THE System SHALL require broadcast datasets to be versioned and below a hard
   server-enforced size limit.
5. THE System SHALL record per-primitive bytes, request counts, and latency
   metrics for each query and tenant.

### Requirement 7: Exchange Semantics and Delivery Guarantees

**User Story:** As a query author, I want explicit exchange behavior and clear
delivery semantics when keys are shuffled.

#### Acceptance Criteria

1. Stage options SHALL support explicit `exchangeBy` behavior, including
   exchange by key.
2. IF `exchangeBy = key`, THEN THE System SHALL route equal keys to the same
   destination partition for downstream grouped processing.
3. Exchange delivery SHALL be at-least-once and SHALL document duplicate
   possibility under retries.
4. The system SHALL provide no global ordering guarantee for exchanged records.
5. Emit metadata SHALL support dedupe keys for idempotency control.

### Requirement 8: Nested `ctx.call` Classification and Guardrails

**User Story:** As an operator, I want nested calls to be bounded so one
logical query cannot fan out into unbounded distributed chatter.

#### Acceptance Criteria

1. THE System SHALL classify nested `ctx.call` inside stage handlers as bounded
   or unbounded.
2. Bounded nested calls SHALL include pk/unique point lookups, capped batched
   key lookups, and strict indexable limit queries.
3. Unbounded nested calls SHALL be rejected by default in v0.
4. Rejection errors SHALL explain allowed bounded forms and direct users to
   `emit` + `reduceByKey` patterns.
5. Nested call classification and rejection reasons SHALL be observable in query
   diagnostics.

### Requirement 9: Resource Guardrails and Backpressure

**User Story:** As an operator, I want strict execution budgets and explicit
backpressure to prevent cluster instability.

#### Acceptance Criteria

1. THE System SHALL enforce limits on CPU, memory, wall time, nested call
   count, nested key count, nested bytes, emit bytes, and out bytes.
2. Stage runtime SHALL enforce max inflight nested operations per handler.
3. IF downstream cannot keep up, THEN `ctx.emit` SHALL be backpressured (await,
   block, spill, or fail with budget error).
4. IF any budget is exceeded, THEN THE System SHALL terminate the operation and
   return a descriptive limit error.
5. THE System SHALL support query cancellation and timeout propagation across
   active distributed stages.

### Requirement 10: Failure, Retries, and Idempotency

**User Story:** As a platform operator, I want retry behavior to be safe and
predictable under failures and rebalancing.

#### Acceptance Criteria

1. Stage execution SHALL support coarse-grained retries for failed/timeout
   batches.
2. THE System SHALL attach Lineage_ID values to stage artifacts and primitive
   calls.
3. WHEN retries occur, THE System SHALL deduplicate by Lineage_ID and stage id
   to avoid duplicate side effects.
4. Runtime docs and errors SHALL state that handlers may run more than once and
   must remain idempotent.
5. Retry and dedupe outcomes SHALL be surfaced through metrics and diagnostics.

### Requirement 11: `reduceByKey` Batch Contract

**User Story:** As a runtime user, I want reduction payloads optimized for WASM
execution and bounded memory behavior.

#### Acceptance Criteria

1. THE System SHALL support `ctx.call({kind: "reduceByKey", ...}, ...)`.
2. Reduce handlers SHALL receive batches grouped by key
   (`[{key, records, continuation?}, ...]`).
3. Reduce execution SHALL enforce limits for groups per batch, records per
   group, and batch bytes.
4. IF a group exceeds limits, THEN THE System SHALL split delivery using
   continuation tokens.
5. Continuation semantics SHALL be documented and test-covered.

### Requirement 12: WASM Module Runtime Contract

**User Story:** As a platform developer, I want module entry execution to be
real runtime behavior, not a stubbed placeholder.

#### Acceptance Criteria

1. THE System SHALL require a WASM_Module_Manifest for each deployable module.
2. The manifest SHALL include module id, version, digest, declared exports,
   dependencies, capabilities, and `run_export`.
3. BEFORE activation, THE System SHALL validate that `run_export` exists and
   matches the required runtime signature.
4. IF undeclared imports or undeclared dependency usage is detected, THEN THE
   System SHALL reject deployment.
5. Runtime handler invocation SHALL execute the declared export from loaded WASM
   module instances, not a stubbed fallback implementation.

### Requirement 13: Production Wiring, Migration, and Observability

**User Story:** As a maintainer, I want the v0 runtime model wired into
production execution paths with migration safety and unified diagnostics.

#### Acceptance Criteria

1. THE System SHALL execute `SqlRequest.executionMode` in SqlCore production
   paths, not only in tests or adapter metadata.
2. Budget, primitive, and stage controls SHALL be enforced in production
   runtime execution paths.
3. THE System SHALL provide unified logs, metrics, and trace identifiers across
   internal SQL, external SQL protocol, and runtime program execution.
4. THE System SHALL provide compatibility tests proving existing SQL workloads
   still pass after migration.
5. THE System SHALL update `architecture.md` and `README.md` to document the
   v0 runtime model and single-path ownership rules.

### Requirement 14: Partition Callback Runtime Bridge

**User Story:** As a platform maintainer, I want `partition_callback`
execution to be a first-class runtime path so callback behavior is consistent
with replicated service runtime ownership and future runtime kinds.

#### Acceptance Criteria

1. WHEN `SqlRequest.executionMode = partition_callback`, THE System SHALL use a
   dedicated SqlCore dispatch path and SHALL NOT silently alias to plain
   statement execution.
2. THE System SHALL resolve target partitions from the callback's `select`
   query and execute callback work per partition batch via one
   Callback_Execution_Host contract.
3. Callback execution SHALL reuse runtime-driver ownership (native/WASM and
   future gated runtimes) instead of creating a parallel callback engine.
4. Callback execution context SHALL preserve the same bounded primitive surface
   (`lookup`, `emit`, `broadcast`, `out`, bounded nested call policy) used by
   runtime stage execution.
5. Budget enforcement, cancellation propagation, lineage dedupe, and telemetry
   SHALL be applied uniformly to partition callback execution paths.
