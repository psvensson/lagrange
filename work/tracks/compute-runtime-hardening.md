# Track: Compute Runtime Hardening

## Document Role

This track owns the long-lived hardening concern for compute-near-data services,
including WASM execution, service lifecycle reconciliation, dispatch, and
resource isolation.

It can contain development, bugfix, stabilization, maintenance, and release-gate
sprints.

## Track Type

`runtime-invariant`

## Release Consumers

- `work/releases/0.1-stabilization.md`

For the 0.1 release consumer, this track is optional unless the 0.1 claim
includes programmable compute as a working capability.

## Proven Pattern

Untrusted or potentially long-running compute should run behind a real isolation
and interruption boundary: worker thread, child process, container, or a WASM
runtime with fuel/epoch interruption.

Lifecycle systems should reconcile desired state to actual state through
idempotent operations and durable owner outcomes.

## Local Divergence

The current WASM executor uses an in-process runtime adapter and Promise timeout
guards. That can classify asynchronous delays, but it cannot reliably preempt a
CPU-bound synchronous handler.

The service lifecycle and dispatch architecture has clear owners, but each
consuming release needs an explicit decision about how much of that surface is
part of the release claim.

## Target Invariant

For a consuming release, compute-near-data is either:

1. in scope with a proven isolation/resource/lifecycle contract, or
2. explicitly scoped as experimental and excluded from release gates.

If in scope, service execution cannot block the node event loop indefinitely,
and service lifecycle operations are idempotent under restart/reconcile.

## Gate Or Acceptance Proof

If compute is in scope:

```text
service create/start/dispatch/stop/recover succeeds under restart and bounded resource failure
```

If compute is out of scope:

```text
release docs say compute-near-data exists but is experimental for that release
```

## Current Evidence

Planned and optional.

Known implementation context:

- `src/wasm-service/wasm-executor.js`
- `src/debug-runtime/wasm-runtime-adapter.js`
- `src/service/service-lifecycle-manager.js`
- `src/service/service-reconciler.js`
- `src/service/service-dispatcher.js`
- `src/node/runtime-service-handler.js`

## Codebase Analysis Notes

The in-process runtime adapter is explicitly a foundation layer, not a full
preemption boundary. Current timeout behavior is based on Promise racing and
cooperative adapter behavior; it should not be used as proof against CPU-bound
synchronous handlers.

The track also includes module availability, runtime manifest validation,
operation lifecycle persistence, replicated WASM service groups, service
type adapters, and node runtime-service dispatch outcomes. Those areas must be
in scope if a release claims programmable compute as working rather than
experimental.

## Owner Boundaries

Candidate boundaries:

- `compute_runtime_owner / resource_isolation`
- `wasm_runtime_owner / runtime_adapter_isolation`
- `module_mirror_owner / module_availability`
- `runtime_service_owner / executor_outcomes`
- `wasm_service_replica_owner / replicated_service_state`
- `service_lifecycle_owner / idempotent_reconcile`
- `service_dispatch_owner / leader_routed_delivery`

## Sprint Membership

No sprints are currently attached. Future development, bugfix, or release-gate
sprints may attach here after the release scope decision.

## Likely Files

These are context candidates, not write authorization:

- `src/wasm-service/wasm-executor.js`
- `src/wasm-service/module-mirror.js`
- `src/wasm-service/operation-lifecycle.js`
- `src/wasm-service/wasm-service-replica.js`
- `src/wasm-service/wasm-service-lifecycle.js`
- `src/wasm-service/manifest-runtime-validator.js`
- `src/debug-runtime/wasm-runtime-adapter.js`
- `src/service/adapters/runtime-service-adapter.js`
- `src/service/service-lifecycle-manager.js`
- `src/service/service-reconciler.js`
- `src/service/service-dispatcher.js`
- `src/node/runtime-service-handler.js`
- `test/wasm-service/wasm-executor-runtime-adapter-parity.test.js`
- `test/debug-runtime/wasm-runtime-adapter.test.js`
- `test/node/runtime-service-handler.test.js`
- `test/service/service-lifecycle-manager.test.js`
- `test/service/service-reconciler.test.js`
- `test/service/service-dispatcher.test.js`
- `test/distributed/scenarios/wasm-service-failover.js`

## Entry Condition

Start this track only after a consuming release decision confirms compute
services are in scope, or after release documentation needs to explicitly scope
them out.

## Exit Condition

This track can close when compute is either release-gated with focused proof or
excluded from the consuming release's working-system claim.

## Next Package

None active. Create a package only after the entry condition is met.
