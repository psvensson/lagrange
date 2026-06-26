# Runtime Ownership Completion Gates

Completion status is blocked until production-path evidence exists for every
checkpoint. Unit-only proof is insufficient.

## Gate Checklist

- [ ] `G1` Canonical contract parity (`S1`, `S8`) proven by schema/model/mapping tests.
- [ ] `G2` Production execution-mode dispatch (`S2`, `S6`) proven through
  `SqlCore.executeRequest` tests.
- [ ] `G3` Runtime ownership activation (`S4`, `S5`, `S7`) proven from startup
  and lifecycle integration paths.
- [ ] `G4` Admin ownership (`S3`) proven with adapter-first ingress tests,
  including unavailable meta-leader behavior.
- [ ] `G5` Documentation parity (`S8`, `S9`) verified against active behavior.
- [ ] `G6` Closure governance (`S10`) complete with evidence matrix and runbook.

## Required Evidence Per Closed Task

1. One production-path code reference (not test-only helper code).
2. One or more targeted test commands and passing output.
3. One documentation reference aligned with active behavior.
4. One shortcoming mapping entry in
   `.kiro/specs/runtime-ownership-closure/closure-matrix.md`.

## Targeted Checkpoint Commands

### V1 Contract Checkpoint (`S1`, `S8`)

```bash
npm test -- \
  test/bootstrap/wasm-meta-table-schemas.test.js \
  test/bootstrap/registration-service-definitions-migration.test.js \
  test/wasm-service/backward-compat-serialization.test.js \
  test/constants/runtime.test.js \
  test/wasm-service/runtime-legacy-mapping.test.js \
  test/wasm-service/sql-profile-factory.test.js
```

### V2 Dispatch Checkpoint (`S2`, `S6`)

```bash
npm test -- \
  test/query/execute-request.test.js \
  test/query/sql-request.test.js \
  test/query/partition-callback-dispatcher.test.js \
  test/query/partition-callback-integration.test.js \
  test/query/wasm-call-adapter.test.js \
  test/query/wasm-call-adapter.integration.test.js
```

### V3 Runtime Ownership Checkpoint (`S4`, `S5`, `S7`)

```bash
npm test -- \
  test/runtime/runtime-startup-wiring.test.js \
  test/runtime/service-runtime-lifecycle.test.js \
  test/query/callback-runtime-driver-registry.test.js \
  test/query/callback-execution-host.test.js \
  test/wasm-service/runtime-descriptor-validator.test.js \
  test/wasm-service/service-definition-validator.test.js
```

### V4 Admin Ownership Checkpoint (`S3`)

```bash
npm test -- \
  test/admin/admin-websocket-api.test.js \
  test/admin/admin-api-adapter.test.js \
  test/admin/admin-adapter-contract.test.js \
  test/admin/wasm-meta-serviceized-routing.test.js
```

### V5 Documentation Parity Checkpoint (`S8`, `S9`)

Manual review must confirm:

1. `.kiro/steering/architecture.md` uses explicit `Active`/`Target`/`Planned`
   labels.
2. `README.md` execution-mode ownership matches active code paths.
3. `docs/admin-migration-guide.md` and
   `docs/wasm-services-user-guide.md` match active ingress and runtime
   ownership.

### V6 Governance Closure Checkpoint (`S10`)

Manual review must confirm:

1. `.kiro/specs/runtime-ownership-closure/closure-matrix.md` includes all
   `S1..S10`.
2. `.kiro/specs/runtime-ownership-closure/tasks.md` closure claims match
   command/test evidence.
3. `docs/runtime-ownership-rollout-runbook.md` is present and current.

## Release Rule

No checklist item in `tasks.md` may be marked complete unless the corresponding
checkpoint command(s) or review evidence is complete.
