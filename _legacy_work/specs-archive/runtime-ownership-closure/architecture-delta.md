# Architecture Delta Plan

This file defines the required `architecture.md` updates to close runtime
ownership drift.

## A. Active vs Target State Labels

Apply explicit labels (`Active`, `Target`, `Planned`) to the following sections:

1. Unified Service Runtime overview
2. Runtime_Driver_Registry and Service_Runtime_Lifecycle ownership text
3. Admin serviceization flow
4. Partition callback runtime bridge section

## B. SQL Engine Runtime Mapping

Set one canonical active mapping statement:

- `service_profile = sql_engine` uses `runtime_kind = native_js`
  (via `SQL_ENGINE_RUNTIME_KIND`).

Remove contradictory statements indicating current `wasm_component` runtime for
`sql_engine` unless explicitly marked as target/future.

## C. Execution-Mode Dispatch Truthfulness

Update execution-mode section so that active claims match code state at merge:

1. If stage/plan are wired through `SqlCore.executeRequest`, mark active.
2. If not yet wired at doc update time, mark explicitly as target and include
   owner + planned branch.

No unlabeled aspirational text is permitted.

## D. Callback Runtime Ownership

Update callback ownership wording to enforce one selector owner:

1. remove wording that implies an independent callback selector owner
2. reference unified runtime selector ownership
3. keep `CallbackExecutionHost` as invocation owner

## E. Admin Ingress Contract

Update admin section to state:

1. ingress remains fixed port compatibility endpoint (`8081`)
2. command/mutation ownership is serviceized via adapter and meta-service
   routing
3. guard modes and unavailable-leader behavior are explicit

## F. Anti-Pattern Section Additions

Ensure anti-pattern section explicitly bans:

1. schema/model contract divergence for service definitions
2. unlabeled active-vs-target documentation claims
3. task completion without production-path evidence

## G. Cross-Document Links

Add cross-links from `architecture.md` to:

1. `docs/admin-migration-guide.md`
2. `docs/wasm-services-user-guide.md`
3. `.kiro/specs/runtime-ownership-closure/shortcomings-traceability.md`

These links are required to keep operations guidance aligned with architecture
ownership.
