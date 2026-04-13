# Runtime Ownership Closure Matrix

This artifact is the release-gate evidence map for audited shortcomings
`S1..S10`. A shortcoming may be marked closed only when code, tests, and docs
are all present.

| Shortcoming | Code Evidence | Test Evidence | Documentation Evidence |
|---|---|---|---|
| S1: `service_definitions` contract drift | `src/bootstrap/system-table-schemas-constants.js`<br>`src/wasm-service/wasm-service-models.js`<br>`src/wasm-service/meta-command-handlers.js` | `test/bootstrap/wasm-meta-table-schemas.test.js`<br>`test/bootstrap/registration-service-definitions-migration.test.js`<br>`test/wasm-service/backward-compat-serialization.test.js` | `.kiro/steering/architecture.md` (runtime descriptor model + anti-patterns)<br>`docs/wasm-services-user-guide.md` (explicit runtime descriptor columns) |
| S2: stage/plan dispatch not wired in production | `src/query/sql-query-engine.js` (`executeRequest` stage/plan routing)<br>`src/query/sql-adapter-constants.js` (typed stage/plan errors) | `test/query/execute-request.test.js` | `README.md` (`executeRequest` mode ownership)<br>`.kiro/steering/architecture.md` (single execution-mode owner) |
| S3: admin ingress still node-local mutation owner | `src/admin/admin-websocket-api.js` (adapter-first ingress)<br>`src/admin/admin-api-adapter.js`<br>`src/admin/admin-mutation-guard.js` | `test/admin/admin-websocket-api.test.js`<br>`test/admin/admin-api-adapter.test.js`<br>`test/admin/admin-adapter-contract.test.js`<br>`test/admin/wasm-meta-serviceized-routing.test.js` | `docs/admin-migration-guide.md`<br>`.kiro/steering/architecture.md` (fixed ingress, service-owned mutation) |
| S4: unified runtime lifecycle not startup-owned | `src/runtime/runtime-startup-wiring.js`<br>`src/bootstrap/bootstrap-service.js`<br>`src/bootstrap/node-joining-service.js`<br>`src/index.js` | `test/runtime/runtime-startup-wiring.test.js`<br>`test/runtime/service-runtime-lifecycle.test.js` | `.kiro/steering/architecture.md` (active runtime ownership flow) |
| S5: parallel callback runtime selector owner | `src/query/callback-runtime-driver-registry.js`<br>`src/query/sql-query-engine.js` (unified registry adapter usage)<br>`src/query/callback-execution-host.js` | `test/query/callback-runtime-driver-registry.test.js`<br>`test/query/callback-execution-host.test.js`<br>`test/query/partition-callback-integration.test.js` | `.kiro/steering/architecture.md` (callback selector ownership) |
| S6: implicit callback runtime-kind defaults | `src/query/sql-request.js` (explicit callback runtime kind required)<br>`src/query/wasm-call-adapter.js` (deterministic WASM callback intent)<br>`src/query/partition-callback-dispatcher.js` (SELECT-only enforcement) | `test/query/sql-request.test.js`<br>`test/query/wasm-call-adapter.test.js`<br>`test/query/wasm-call-adapter.integration.test.js`<br>`test/query/partition-callback-dispatcher.test.js` | `README.md` and `.kiro/steering/architecture.md` (first-class callback mode ownership) |
| S7: runtime descriptor validation not enforced at boundaries | `src/wasm-service/runtime-descriptor-validator.js`<br>`src/wasm-service/meta-command-handlers.js`<br>`src/wasm-service/service-definition-validator.js`<br>`src/runtime/service-runtime-lifecycle.js` | `test/wasm-service/runtime-descriptor-validator.test.js`<br>`test/wasm-service/meta-command-handlers.test.js`<br>`test/wasm-service/service-definition-validator.test.js`<br>`test/runtime/service-runtime-lifecycle.test.js` | `docs/runtime-ownership-rollout-runbook.md` (failure catalog + rollback triggers) |
| S8: SQL engine runtime mapping contradictions | `src/constants/runtime.js` (`SQL_ENGINE_RUNTIME_KIND`)<br>`src/wasm-service/runtime-legacy-mapping.js`<br>`src/wasm-service/sql-profile-factory.js` | `test/constants/runtime.test.js`<br>`test/wasm-service/runtime-legacy-mapping.test.js`<br>`test/wasm-service/sql-profile-factory.test.js` | `.kiro/steering/architecture.md` (active `sql_engine -> native_js` mapping)<br>`README.md` |
| S9: docs drift from implementation state | `.kiro/steering/architecture.md`<br>`README.md`<br>`docs/admin-migration-guide.md`<br>`docs/wasm-services-user-guide.md` | Documentation checkpoint commands in `.kiro/specs/runtime-ownership-closure/completion-gates.md` | `.kiro/specs/runtime-ownership-closure/completion-gates.md` |
| S10: completion governance lacked production evidence | `.kiro/specs/runtime-ownership-closure/closure-matrix.md`<br>`.kiro/specs/runtime-ownership-closure/completion-gates.md`<br>`.kiro/specs/runtime-ownership-closure/tasks.md` | Verification checkpoint command matrix in `.kiro/specs/runtime-ownership-closure/completion-gates.md` | `docs/runtime-ownership-rollout-runbook.md` (rollout + rollback governance) |

## Closure Rule

A shortcoming is closed only if:

1. code evidence exists on the production path
2. targeted tests pass
3. documentation is aligned
4. checkpoint command evidence is recorded
