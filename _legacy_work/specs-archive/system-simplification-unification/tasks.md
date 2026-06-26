# Implementation Plan: System Simplification and Unification

## Overview

Incremental refactor that reduces duplication and consolidates ownership boundaries without changing user-facing behavior.

## Tasks

## Status Audit (2026-02-21)

- Confirmed recent CDC propagation bugfixes landed in bootstrap/join CDC subscription paths and tests.
- SystemCacheClient abstraction is now implemented and wired into initial consumers (transport endpoint selection + meta-service router).
- Transport endpoint selection ownership is now centralized in `TransportRegistry` with `RouterDeliveryManager` delegating candidate selection.
- Startup pipeline runner is now introduced and both seed/bootstrap and join flows are migrated to plan-driven phase execution.
- CDC write-router strategy is now integrated in `CDCIntegrationService` with bootstrap/SQL strategy swapping and tests.
- Lifecycle ownership closure is now complete for bootstrap/join replica lifecycle operations with adapter-routing tests and direct election starts quarantined behind compatibility shims.

- [ ] 1. Baseline + guardrails
  - [ ] 1.1 Record baseline test commands and expected green set for bootstrap/join/transport
  - [ ] 1.2 Identify and list the top cache consumers (SQL routing, transport, meta-service routing) and confirm their read API surface

- [x] 2. Introduce SystemCacheClient abstraction (read-only)
  - [x] 2.1 Add `src/cache/system-cache-client.js`
    - Export a factory that can build a “direct client” and a “proxy client”
    - Keep API shape aligned with existing cache reads
  - [x] 2.2 Refactor a small set of consumers to accept `systemCacheClient` instead of a concrete cache
    - Start with transport endpoint selection owner and meta-service router
  - [x] 2.3 Add unit tests for direct vs proxy client behavior parity (mock proxy responses)

- [ ] 3. Consolidate endpoint selection ownership
  - [x] 3.1 Decide ownership direction (MessageRouter owns selection, or TransportRegistry owns selection)
    - Direction chosen: `TransportRegistry` owns endpoint/provider candidate selection.
  - [x] 3.2 Refactor the non-owning component into a thin delegator
  - [x] 3.3 Add regression tests that validate priority selection and provider availability behavior
  - [x] 3.4 Remove duplicate endpoint filtering/selection logic currently in `RouterDeliveryManager.deliverViaTransportRegistry()` by delegating to the chosen owner

- [x] 4. CDCIntegrationService write-router strategy
  - [x] 4.1 Add `src/cdc/write-router/index.js` with two strategies
    - BootstrapDirectWriteRouter
    - SqlWriteRouter
  - [x] 4.2 Refactor CDCIntegrationService to depend on the strategy object, preserving the public API
  - [x] 4.3 Update bootstrap wiring to swap routers after hydration
  - [x] 4.4 Add unit tests for router swap and error reporting
  - [x] 4.5 Ensure CDC partition-event propagation resolves to a leader-capable message-group path (leader-preferred + fallback resolution)
  - [x] 4.6 Add regression tests for CDC propagation correctness during bootstrap/join transitions
    - `test/bootstrap/cdc-leader-only-replication.test.js`
    - `test/bootstrap/cdc-initial-subscription-leader-fallback.test.js`

- [x] 5. Shared StartupPipelineRunner
  - [x] 5.1 Add `src/bootstrap/pipeline/startup-pipeline-runner.js`
    - phase runner, cleanup runner, and shared telemetry/events
  - [x] 5.2 Create plans:
    - `seed-startup-plan.js`
    - `join-startup-plan.js`
  - [x] 5.3 Migrate seed/bootstrap to use the pipeline runner (initially with phases that call existing methods)
  - [x] 5.4 Migrate node-join to use the pipeline runner
  - [x] 5.5 Add unit tests for pipeline failure cleanup ordering

- [x] 6. Lifecycle ownership closure
  - [x] 6.1 Ensure bootstrap/join replica actions route through `ServiceLifecycleManager` + adapters
  - [x] 6.2 Remove or quarantine remaining direct replica start paths (leave compatibility shims only where required)
  - [x] 6.3 Add tests that assert adapters are invoked for replica lifecycle operations

- [ ] 7. Final validation
  - [ ] 7.1 Run full test suite
  - [x] 7.2 Add a short operational note in docs if any observable logging/diagnostic path changes
    - `CDC_PROPAGATION_FIX.md`

## Notes

- The recommended starting point is Task 2 (SystemCacheClient), as it is low risk and immediately reduces branching.
- Pipeline unification (Task 5) should land after cache/transport ownership is stable.

