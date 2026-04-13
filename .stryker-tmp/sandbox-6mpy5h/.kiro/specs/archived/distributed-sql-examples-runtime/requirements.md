# Requirements Document

## Introduction

This spec defines an executable distributed SQL examples catalog that users can copy from, compile/package, upload into a running cluster, execute, and inspect through the existing distributed test harness and admin test-run UI.

It also closes currently documented wasm/runtime blanks so the examples path is real end-to-end instead of partial:

- `src/wasm-service/module-mirror.js` uses placeholder bytes in `pullModule()`.
- `src/wasm-service/wasm-service-replica.js` has stubbed `flushRoleUpdate()` and `flushLeaderNodeUpdate()`.
- `src/wasm-service/wasm-service-lifecycle.js` logs missing modules but does not fail closed.
- Current harness/admin contracts do not expose first-class partition-callback invocation for example execution.

## Goals

1. Provide copyable JS examples from basic to advanced distributed SQL (`ctx.call`, stage handlers, plan mode, bounded nested calls).
2. Make examples executable in a running cluster via one script.
3. Reuse examples in distributed harness scenarios and CI.
4. Expose example run results in report artifacts and admin dashboard.
5. Replace wasm/runtime stubs with concrete, testable behavior.

## Non-Goals

1. Adding a second SQL execution path outside `SqlCore.executeRequest()`.
2. Introducing parallel metadata stores outside system tables.
3. Shipping a full debugger feature set (separate spec).

## Requirements

### Requirement 1: Example Catalog Structure

**User Story:** As a user, I want a curated examples folder ordered from basic to advanced so I can learn and build on real patterns.

#### Acceptance Criteria

1. The repository SHALL include `examples/distributed-sql/` with ordered examples (`01-...`, `02-...`, etc.).
2. Each example SHALL include source code, metadata, and expected result shape.
3. The catalog SHALL include at least: iterator call, stage batching, reduce-by-key plan, bounded nested call, and failure/guardrail example.
4. Examples SHALL be directly copyable without requiring hidden harness internals.

### Requirement 2: Example Packaging Contract

**User Story:** As a developer, I want one command to compile/package examples so artifacts are deterministic and runnable.

#### Acceptance Criteria

1. A single script SHALL package all examples and produce a deterministic manifest of artifacts.
2. Packaging output SHALL include module/function identity, version, digest, and entry export.
3. Packaging SHALL fail with descriptive errors when example metadata is invalid.
4. Packaging SHALL support re-running without manual cleanup.

### Requirement 3: Upload and Activation Contract

**User Story:** As an operator, I want packaged examples uploaded into a running system through canonical SQL/CDC paths.

#### Acceptance Criteria

1. Example upload SHALL write module/function rows through the canonical SQL engine path.
2. Upload SHALL be idempotent per example version (re-run updates or no-ops, not duplicates with ambiguous identity).
3. Activation metadata SHALL be discoverable via system tables after upload.
4. Upload failures SHALL include failing example id and exact operation stage.

### Requirement 4: Remote Partition Callback Execution API

**User Story:** As the harness, I want to invoke partition-callback execution on running nodes so examples execute in the real distributed runtime.

#### Acceptance Criteria

1. Admin ingress SHALL expose a typed request contract for partition-callback execution (module ref, export, runtime kind, select statement, params).
2. The new request SHALL route through `SqlCore.executeRequest()` using `PARTITION_CALLBACK` mode.
3. Unknown/invalid callback requests SHALL return structured errors without crashing the connection.
4. Existing `query` and `refresh` behavior SHALL remain backward compatible.

### Requirement 5: Example Runner and Result Artifact

**User Story:** As a maintainer, I want one runner that uploads and executes every example and produces a machine-readable result artifact.

#### Acceptance Criteria

1. Runner SHALL execute all catalog examples against a running cluster.
2. Runner SHALL emit a JSON artifact containing per-example status, duration, outputs, and errors.
3. Runner SHALL return non-zero exit code if any required example fails.
4. Runner SHALL support selecting a subset of examples.

### Requirement 6: Harness Integration

**User Story:** As a test engineer, I want examples to be part of distributed scenarios so regressions are caught in CI.

#### Acceptance Criteria

1. A distributed scenario SHALL invoke the shared example runner.
2. Scenario output SHALL include structured example result data in the final report.
3. `test/distributed/run.js` SHALL preserve scenario return payload fields rather than discarding them.
4. Harness failure semantics SHALL fail the scenario when required examples fail.

### Requirement 7: Report and Dashboard Visibility

**User Story:** As an operator, I want to inspect example run outcomes from test reports and the admin dashboard.

#### Acceptance Criteria

1. Report schema SHALL persist example result summaries and artifact links.
2. Admin test-run service SHALL surface example summaries when listing/getting runs.
3. Dashboard SHALL show an example status summary for selected runs.
4. Dashboard SHALL provide direct links to detailed example artifact JSON.

### Requirement 8: ModuleMirror Stub Closure

**User Story:** As the runtime owner, I want module retrieval to use real artifact bytes, not placeholder buffers.

#### Acceptance Criteria

1. `ModuleMirror.pullModule()` SHALL fetch actual module bytes via a concrete source path.
2. Pulled module payload SHALL include bytes and runtime metadata needed by `WasmExecutor` (`manifest`, `exports`, `wasmBytes`).
3. Cached entries SHALL be keyed/versioned so stale entries are invalidated correctly on code updates.
4. Placeholder `Buffer.alloc(0)` behavior SHALL be removed.

### Requirement 9: Fail-Closed WASM Startup

**User Story:** As an operator, I want service startup to fail closed when module artifacts are missing so bad replicas do not appear healthy.

#### Acceptance Criteria

1. WASM replica startup SHALL fail when required module bytes/metadata are unavailable.
2. Startup SHALL not continue with log-only warnings for missing modules.
3. Failure reason SHALL propagate through runtime lifecycle status and operation journaling.
4. Retry behavior, if configured, SHALL remain explicit and bounded.

### Requirement 10: Replica Role/Leader Metadata Stub Closure

**User Story:** As a control-plane consumer, I want role and leader metadata to be persisted through canonical writes.

#### Acceptance Criteria

1. `flushRoleUpdate()` SHALL persist raft role updates through the canonical system-table write path.
2. `flushLeaderNodeUpdate()` SHALL persist leader-node updates through the canonical path.
3. Updates SHALL not write directly to cache objects.
4. Leadership transitions SHALL become visible in system tables without manual refresh hacks.

### Requirement 11: Distributed Primitive Stub Closure for Advanced Examples

**User Story:** As an advanced user, I want examples using lookup/broadcast primitives to run on real implementations, not stubs.

#### Acceptance Criteria

1. Production callback context SHALL use real `lookup`, `broadcast`, and `useBroadcast` implementations.
2. Paths throwing `"ctx.lookup is not yet wired"`, `"ctx.broadcast is not yet wired"`, and `"ctx.useBroadcast is not yet wired"` SHALL be removed from production execution flows.
3. Default/stub callback contexts SHALL only be used in isolated tests, not runtime code paths.
4. Guardrails for bounded nested calls SHALL remain enforced.

### Requirement 12: Test Coverage and CI Gates

**User Story:** As a maintainer, I want strong automated coverage so this pipeline stays reliable.

#### Acceptance Criteria

1. Unit tests SHALL cover example packaging, upload planning, and result aggregation.
2. Integration tests SHALL cover remote partition-callback invocation contract.
3. Distributed scenario tests SHALL cover full examples-catalog execution.
4. New wasm stub-closure behaviors SHALL include dedicated regression tests.
