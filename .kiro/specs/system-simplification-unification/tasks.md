# Implementation Plan: System Simplification and Unification

## Overview

Incremental refactor that reduces duplication and consolidates ownership boundaries without changing user-facing behavior.

## Tasks

- [ ] 1. Baseline + guardrails
  - [ ] 1.1 Record baseline test commands and expected green set for bootstrap/join/transport
  - [ ] 1.2 Identify and list the top cache consumers (SQL routing, transport, meta-service routing) and confirm their read API surface

- [ ] 2. Introduce SystemCacheClient abstraction (read-only)
  - [ ] 2.1 Add `src/cache/system-cache-client.js`
    - Export a factory that can build a “direct client” and a “proxy client”
    - Keep API shape aligned with existing cache reads
  - [ ] 2.2 Refactor a small set of consumers to accept `systemCacheClient` instead of a concrete cache
    - Start with transport endpoint selection owner and meta-service router
  - [ ] 2.3 Add unit tests for direct vs proxy client behavior parity (mock proxy responses)

- [ ] 3. Consolidate endpoint selection ownership
  - [ ] 3.1 Decide ownership direction (MessageRouter owns selection, or TransportRegistry owns selection)
  - [ ] 3.2 Refactor the non-owning component into a thin delegator
  - [ ] 3.3 Add regression tests that validate priority selection and provider availability behavior

- [ ] 4. CDCIntegrationService write-router strategy
  - [ ] 4.1 Add `src/cdc/write-router/index.js` with two strategies
    - BootstrapDirectWriteRouter
    - SqlWriteRouter
  - [ ] 4.2 Refactor CDCIntegrationService to depend on the strategy object, preserving the public API
  - [ ] 4.3 Update bootstrap wiring to swap routers after hydration
  - [ ] 4.4 Add unit tests for router swap and error reporting

- [ ] 5. Shared StartupPipelineRunner
  - [ ] 5.1 Add `src/bootstrap/pipeline/startup-pipeline-runner.js`
    - phase runner, cleanup runner, and shared telemetry/events
  - [ ] 5.2 Create plans:
    - `seed-startup-plan.js`
    - `join-startup-plan.js`
  - [ ] 5.3 Migrate seed/bootstrap to use the pipeline runner (initially with phases that call existing methods)
  - [ ] 5.4 Migrate node-join to use the pipeline runner
  - [ ] 5.5 Add unit tests for pipeline failure cleanup ordering

- [ ] 6. Lifecycle ownership closure
  - [ ] 6.1 Ensure bootstrap/join replica actions route through `ServiceLifecycleManager` + adapters
  - [ ] 6.2 Remove or quarantine remaining direct replica start paths (leave compatibility shims only where required)
  - [ ] 6.3 Add tests that assert adapters are invoked for replica lifecycle operations

- [ ] 7. Final validation
  - [ ] 7.1 Run full test suite
  - [ ] 7.2 Add a short operational note in docs if any observable logging/diagnostic path changes

## Notes

- The recommended starting point is Task 2 (SystemCacheClient), as it is low risk and immediately reduces branching.
- Pipeline unification (Task 5) should land after cache/transport ownership is stable.

