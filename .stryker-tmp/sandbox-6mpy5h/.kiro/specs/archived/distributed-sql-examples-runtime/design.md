# Design Document: Distributed SQL Examples Runtime and WASM Stub Closure

## Overview

This design introduces a single executable examples pipeline and integrates it with the distributed harness and admin dashboard. It also completes wasm/runtime paths that are currently stubbed so example execution is genuinely end-to-end in a running cluster.

The design preserves existing ownership constraints:

1. All execution routes through `SqlCore.executeRequest()`.
2. All durable metadata flows through SQL/CDC system-table writes.
3. No parallel runtime selector or ad-hoc module cache is introduced.

## Current Gaps

1. `src/wasm-service/module-mirror.js` `pullModule()` stores placeholder bytes (`Buffer.alloc(0)`).
2. `src/wasm-service/wasm-service-replica.js` role/leader flush methods are stubs.
3. `src/wasm-service/wasm-service-lifecycle.js` logs missing module but still continues startup.
4. `src/admin/admin-websocket-api.js` only handles `query` and `refresh` message types.
5. Harness node handle (`test/distributed/harness/cluster.js`) only supports SQL string query calls.
6. `test/distributed/run.js` ignores scenario return payload details when building report entries.

## High-Level Architecture

### Functional Flow

1. Examples live under `examples/distributed-sql/`.
2. Build script packages examples into runnable artifacts and produces a build manifest.
3. Upload stage writes artifacts into canonical tables (`code`, `module_manifests`, and supporting rows as required).
4. Execute stage invokes partition-callback runtime on live nodes through an explicit callback request contract.
5. Runner writes one detailed result artifact.
6. Distributed scenario calls the same runner and surfaces results in test report.
7. Admin service/dashboard exposes summary and links.

### Components

1. `examples/distributed-sql/*`
- User-facing examples and metadata.

2. `scripts/examples/build-upload-run.js`
- Canonical CLI pipeline for packaging, upload, execution, and artifact emission.

3. Admin callback invocation contract
- New message type handled by `AdminWebSocketAPI` that maps to `SqlRequest` with `PARTITION_CALLBACK` execution mode.

4. Harness scenario
- `test/distributed/scenarios/examples-catalog.js` invokes shared runner.

5. Report and UI integration
- `ReportWriter` and `AdminTestRunService` surface example results and links.

6. WASM runtime completion
- `ModuleMirror` artifact retrieval and cache correctness.
- fail-closed startup semantics.
- role/leader metadata flush implementation.

## Data Contracts

### Example Metadata (`example.manifest.json`)

```json
{
  "id": "03-plan-reduce-by-key",
  "title": "Plan reduceByKey",
  "level": "advanced",
  "entry": "index.js",
  "runtimeKind": "wasm_component",
  "callbackExport": "run",
  "select": "SELECT * FROM logs WHERE level = ?",
  "params": ["info"],
  "expected": {
    "shape": "array",
    "minRows": 1
  }
}
```

### Example Runner Output (`test-output/examples/<runId>.json`)

```json
{
  "runId": "examples-20260215T120000Z",
  "startedAt": "2026-02-15T12:00:00.000Z",
  "endedAt": "2026-02-15T12:00:20.000Z",
  "summary": {
    "total": 5,
    "passed": 5,
    "failed": 0,
    "durationMs": 20000
  },
  "examples": [
    {
      "id": "01-basic-iterator",
      "passed": true,
      "durationMs": 1200,
      "result": {"rows": 3},
      "error": null
    }
  ]
}
```

### Admin Callback Request Envelope

```json
{
  "type": "partition_callback",
  "queryId": "cb-123",
  "statement": "SELECT * FROM logs",
  "parameters": [],
  "callbackModuleRef": "ex-01-basic-v1",
  "callbackExport": "run",
  "runtimeKind": "wasm_component",
  "sessionId": "examples-run-1",
  "budgets": {}
}
```

### Admin Callback Response Envelope

```json
{
  "type": "query_result",
  "queryId": "cb-123",
  "operation": "partition_callback",
  "results": [],
  "hostResult": {
    "state": "completed",
    "processedPartitions": 3,
    "failedPartitions": 0,
    "totalRows": 42
  }
}
```

## Detailed Design

## 1. Example Catalog Layout

Directory layout:

```text
examples/
  distributed-sql/
    01-basic-iterator/
      index.js
      example.manifest.json
      expected.json
    02-stage-batching/
      index.js
      example.manifest.json
      expected.json
    03-plan-reduce-by-key/
      index.js
      example.manifest.json
      expected.json
    04-nested-bounded-call/
      index.js
      example.manifest.json
      expected.json
    05-guardrail-failure/
      index.js
      example.manifest.json
      expected.json
```

Design choice:

1. Keep source examples in JS for readability.
2. Packaging stage is responsible for runtime artifact generation and metadata normalization.

## 2. Packaging and Upload Pipeline

### CLI

`node scripts/examples/build-upload-run.js --target ws://<host>:8081/api/admin/stream --out test-output/examples/<runId>.json`

### Pipeline stages

1. Discover examples and validate metadata schema.
2. Build/package artifacts and compute digest.
3. Upload module/function metadata through admin SQL path.
4. Execute callback request for each example.
5. Validate outputs against expected contracts.
6. Emit result artifact and exit non-zero on failure.

### Idempotency

1. Artifact identity is `exampleId + version`.
2. Upload uses deterministic ids and upsert/update-safe behavior.

## 3. Admin API Extension for Callback Invocation

### Changes

1. Add `partition_callback` handling branch in `AdminWebSocketAPI.handleMessage()`.
2. Construct canonical `SqlRequest` with `executionMode: PARTITION_CALLBACK`.
3. Delegate to existing SQL core path.
4. Return callback host results in query_result envelope.

### Rationale

1. No new execution engine.
2. Backward-compatible with existing `query` and `refresh` messages.
3. Enables harness and external runners to invoke distributed callbacks on live clusters.

## 4. Harness and Report Integration

### Scenario

1. Add `test/distributed/scenarios/examples-catalog.js`.
2. Scenario calls shared runner logic (not a duplicate implementation).
3. Scenario fails when runner summary includes failures.

### Report model changes

1. Preserve arbitrary scenario return payload under an explicit `artifacts` or `details` field.
2. Extend `ReportWriter.buildScenarioEntry()` to include `exampleResults` payload when present.
3. Ensure `AdminTestRunService.extractReportSummary()` can compute run-level example summary.

## 5. Dashboard Changes

1. Add an "Examples" summary segment in run detail panel.
2. Show totals and failed example ids.
3. Add link button for detailed artifact JSON.

This is additive and does not replace playback/log features.

## 6. WASM Stub Closure Design

## 6.1 ModuleMirror Completion

### Current

`ModuleMirror.pullModule()` stores placeholder bytes and does not provide manifest/exports.

### Target

1. `pullModule(functionId, version, sourceNodeId)` fetches real module payload.
2. Payload includes `wasmBytes`, `manifest`, and validated `exports` metadata.
3. Cache stores complete module object needed by `WasmExecutor`.
4. `onCodeUpdate()` invalidation remains version-driven.

### Source path

1. Use one owner path for retrieval through existing transport/router callback.
2. Avoid direct cache writes from unrelated components.

## 6.2 Fail-Closed Startup

### Current

`WasmServiceLifecycle.startReplica()` logs unavailable module and still starts.

### Target

1. Startup checks module availability before port allocation/ready transition.
2. Unavailable module returns failed status with explicit reason.
3. `WasmComponentDriver.start()` propagates failure as failed lifecycle start.

## 6.3 Role/Leader Flush Implementation

### Current

`WasmServiceReplica.flushRoleUpdate()` and `flushLeaderNodeUpdate()` are stubs.

### Target

1. Implement both methods through a provided writer callback owned by lifecycle/control-plane owner.
2. Persist service role/leader changes to canonical system-table path.
3. Ensure no direct `SystemTableCache` writes.

## 7. Advanced Primitive Stub Closure

To support advanced examples, production execution path must not throw wired-stub errors for lookup/broadcast primitives.

1. `ExecutionContext.lookup()` wired to bounded lookup primitive.
2. `ExecutionContext.broadcast()` wired to broadcast primitive.
3. `ExecutionContext.useBroadcast()` wired to retrieval primitive.
4. `createDefaultContext()` stub remains test-only and excluded from production callback path.

## Error Handling

1. Packaging errors are fail-fast per example with clear stage labeling.
2. Upload errors include SQL/action context and example id.
3. Callback execution errors include `queryId`, example id, and host result state.
4. Runtime missing-module conditions fail closed (not warning-only).

## Security and Safety

1. Capability and manifest validation stays in existing validation owners.
2. No new direct write channels bypassing SQL/CDC.
3. Callback request contract validates runtime kind and required fields.

## Rollout Plan

### Phase 1

1. Example catalog + runner + harness scenario + report artifact retention.
2. Admin callback invocation contract.

### Phase 2

1. ModuleMirror real pull path and cache completion.
2. fail-closed startup.
3. role/leader flush implementation.

### Phase 3

1. Advanced primitive wiring (`lookup`, `broadcast`, `useBroadcast`).
2. Additional advanced examples that depend on these primitives.

## Testing Strategy

1. Unit tests for example metadata validation and runner orchestration.
2. Unit tests for admin callback request handling.
3. Unit tests for ModuleMirror pull/invalidation and startup failure propagation.
4. Integration tests for callback execution through admin stream.
5. Distributed scenario tests for end-to-end examples run.

## Open Decisions

1. Packaging backend for JS examples to wasm artifacts: choose one deterministic toolchain and pin version.
2. Whether example upload uses SQL upsert or versioned immutable rows with active-pointer updates.
3. Whether dashboard shows full per-example table inline or summary + artifact link only.
