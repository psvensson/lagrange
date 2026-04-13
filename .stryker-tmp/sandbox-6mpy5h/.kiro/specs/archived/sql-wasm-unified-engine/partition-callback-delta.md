# Spec Delta: Partition_Callback Runtime Bridge

## Purpose

Define the explicit v0 delta required to make
`SqlRequest.executionMode = partition_callback` a first-class runtime execution
path.

This delta removes ambiguity where callback metadata can exist but callback
runtime execution is not routed through a dedicated owned path.

## Problem Statement

Current state has strong adapter normalization and runtime primitives, but
`partition_callback` must be executed through a concrete owned dispatch and
invocation path in SqlCore.

Without this delta:

1. callback execution ownership is unclear
2. callback runtime behavior can diverge from stage/runtime behavior
3. future runtime-kind expansion (native/WASM/container) would require
   duplicated callback engines

## Delta Scope

In scope:

1. SqlCore dispatch ownership for `partition_callback`
2. partition callback planning and per-partition batch invocation
3. shared callback execution host contract
4. runtime-kind-aware callback invocation surface
5. budget/cancellation/lineage/dedupe/telemetry parity

Out of scope:

1. replacing partition core storage/raft execution with pluggable runtimes
2. full protocol feature parity changes unrelated to callback execution
3. broad query-planner rewrites beyond callback dispatch ownership

## Ownership Contract

1. `SqlCore.executeRequest` remains the single owner for execution-mode
   dispatch.
2. `partition_callback` mode has a dedicated dispatch branch.
3. `Callback_Execution_Host` is the single callback invocation surface.
4. Runtime-kind selection for callback execution uses shared runtime ownership
   (native/WASM now, container under gate).
5. No parallel callback execution path is allowed.

## Execution Flow

1. Adapter emits canonical `SqlRequest` with mode `partition_callback`.
2. SqlCore dispatches to partition callback branch.
3. Branch resolves target partitions from callback select query.
4. Rows are grouped/batched per partition.
5. Batches are invoked through `Callback_Execution_Host`.
6. Host applies:
   - cancellation checks
   - budget checks
   - lineage ID attachment
   - dedupe checks/registration
   - primitive runtime wiring (`lookup`, `emit`, `broadcast`, `out`)
7. Results and diagnostics are aggregated and returned in stable response
   contract.

## Runtime-Kind Compatibility

The callback host supports runtime kinds through shared runtime selection rules:

1. `native_js` (immediate callback path)
2. `wasm_component` (existing module export invocation path)
3. `oci_container` (feature-gated, policy-gated, disabled by default)

## Failure and Safety Rules

1. Unknown/unsupported runtime kind: fail closed with explicit error.
2. Budget exceeded: fail with typed budget-limit error.
3. Cancellation/timeout: propagate to active callback batches.
4. Retry behavior: stage/batch scoped with lineage+stage dedupe.
5. No silent fallback to plain statement execution.

## Required Artifacts Updated by this Delta

1. `requirements.md` — adds partition callback runtime bridge requirement.
2. `design.md` — adds explicit partition callback bridge design section.
3. `tasks.md` — adds partition callback bridge implementation workstream.

## Verification Matrix

1. Unit: callback dispatch mode routing and host contract validation.
2. Integration: multi-partition callback invocation and result aggregation.
3. Failure-path: cancellation, timeout, budget exceed, retry dedupe.
4. Compatibility: existing SQL statement/protocol behavior unchanged.
