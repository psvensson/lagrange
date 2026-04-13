# Implementation Plan: Distributed SQL Examples Runtime and WASM Stub Closure

## Tasks

- [x] 1. Create example catalog scaffold
  - [x] 1.1 Add `examples/distributed-sql/` directory with ordered examples
  - [x] 1.2 Add per-example metadata (`example.manifest.json`) and expected output contracts
  - [x] 1.3 Add `examples/distributed-sql/README.md` explaining basic-to-advanced progression and copy/paste usage

- [x] 2. Implement shared example packaging and runner script
  - [x] 2.1 Add `scripts/examples/build-upload-run.js` for discover -> package -> upload -> execute -> artifact
  - [x] 2.2 Add deterministic artifact identity and digest generation
  - [x] 2.3 Add CLI flags for target admin endpoint, include/exclude examples, and output path
  - [x] 2.4 Fail script on any required example failure with non-zero exit code

- [x] 3. Add admin callback invocation contract
  - [x] 3.1 Extend `src/admin/admin-websocket-api.js` to accept `partition_callback` messages
  - [x] 3.2 Map callback envelope into canonical `createSqlRequest()` with `executionMode: PARTITION_CALLBACK`
  - [x] 3.3 Return structured callback result payloads in `query_result` responses
  - [x] 3.4 Preserve backward compatibility for `query` and `refresh`

- [x] 4. Extend harness node API for callback execution
  - [x] 4.1 Add `NodeHandle.partitionCallback(...)` in `test/distributed/harness/cluster.js`
  - [x] 4.2 Reuse existing admin socket and pending-query map ownership; do not create parallel socket path
  - [x] 4.3 Add parsing for callback result frames and timeout/error handling

- [x] 5. Integrate examples into distributed scenarios
  - [x] 5.1 Add `test/distributed/scenarios/examples-catalog.js`
  - [x] 5.2 Scenario should call shared runner logic instead of duplicating orchestration
  - [x] 5.3 Scenario should fail when any required example fails

- [x] 6. Preserve scenario payload in reports
  - [x] 6.1 Update `test/distributed/run.js` to merge scenario `run(cluster)` return data into `scenarioResult`
  - [x] 6.2 Extend `test/distributed/harness/report-writer.js` to persist `exampleResults` (or generic details field)
  - [x] 6.3 Keep backward-compatible report fields for existing dashboard and consumers

- [x] 7. Surface example results in admin test-run service and dashboard
  - [x] 7.1 Update `src/admin/admin-test-run-service.js` to extract and summarize example result payloads
  - [x] 7.2 Update `src/admin/static/test-run-dashboard.html` to display example summary and artifact links
  - [x] 7.3 Ensure archived/live run views both expose example outcomes

- [x] 8. Close ModuleMirror artifact stub
  - [x] 8.1 Replace placeholder `Buffer.alloc(0)` in `src/wasm-service/module-mirror.js` with real module retrieval
  - [x] 8.2 Ensure cache stores complete module object used by `WasmExecutor` (`wasmBytes`, `manifest`, `exports`, version)
  - [x] 8.3 Wire invalidation to code updates without parallel cache owners

- [x] 9. Enforce fail-closed wasm startup semantics
  - [x] 9.1 Update `src/wasm-service/wasm-service-lifecycle.js` to fail startup when required module is unavailable
  - [x] 9.2 Update `src/runtime/wasm-component-driver.js` to propagate startup failures explicitly
  - [x] 9.3 Add lifecycle/operation diagnostics for missing module failures

- [x] 10. Implement role/leader flush methods in wasm replica
  - [x] 10.1 Implement `flushRoleUpdate()` in `src/wasm-service/wasm-service-replica.js`
  - [x] 10.2 Implement `flushLeaderNodeUpdate()` in `src/wasm-service/wasm-service-replica.js`
  - [x] 10.3 Route writes through canonical SQL/CDC owner callback; no direct cache mutation

- [x] 11. Close advanced distributed primitive stubs required by examples
  - [x] 11.1 Wire `lookup` in `src/query/execution-context.js`
  - [x] 11.2 Wire `broadcast` in `src/query/execution-context.js`
  - [x] 11.3 Wire `useBroadcast` in `src/query/execution-context.js`
  - [x] 11.4 Ensure `src/query/callback-stage-executor.js` default stub context is test-only and not used in production callback path

- [x] 12. Add test coverage for new behavior
  - [x] 12.1 Unit tests for packaging/runner result aggregation
  - [x] 12.2 Admin API tests for `partition_callback` request validation and execution routing
  - [x] 12.3 Harness tests for new node callback API and scenario payload persistence
  - [x] 12.4 WASM unit tests for ModuleMirror retrieval, fail-closed startup, and role/leader flush writes
  - [x] 12.5 Distributed scenario test(s) for `examples-catalog`

- [x] 13. Update documentation and architecture notes
  - [x] 13.1 Update `docs/wasm-services-user-guide.md` with examples packaging/upload/run flow
  - [x] 13.2 Update `docs/admin-test-run-landing.md` with example result visualization behavior
  - [x] 13.3 Update architecture documentation for callback invocation contract and wasm stub closure ownership
