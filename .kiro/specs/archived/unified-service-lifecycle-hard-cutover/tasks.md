# Implementation Plan: Unified Service Lifecycle Hard Cutover

## Overview

This plan delivers one lifecycle and reconciliation path for all service kinds,
then removes all legacy paths before completion.

No task in this plan may leave fallback lifecycle ownership in shipping code.

## Workstreams and Tasks

- [x] 1. Define unified service lifecycle contracts and constants
- [x] 1.1 Add canonical constants for service types, lifecycle states,
  operation states, and envelope schema fields.
  - _Requirements: 1.1, 3.1, 4.1_
- [x] 1.2 Add a single `Service_Type_Adapter` interface contract.
  - _Requirements: 1.1, 6.1, 14.1_
- [x] 1.3 Add typed errors for unknown service type and unknown runtime kind.
  - _Requirements: 1.4, 8.3_
- [x] 1.4 Add contract unit tests.
  - _Requirements: 11.1, 15.3_

- [x] 2. Implement `Service_Lifecycle_Manager` as sole lifecycle owner
- [x] 2.1 Implement create/start/stop/restart operations with operation
  journaling hooks.
  - _Requirements: 1.1, 10.1_
- [x] 2.2 Enforce idempotency at lifecycle operation boundary.
  - _Requirements: 10.2, 10.4_
- [x] 2.3 Enforce adapter-only delegation; no direct service-kind branching
  outside adapter lookup.
  - _Requirements: 1.3, 14.1_
- [x] 2.4 Add unit tests for lifecycle state transitions and error handling.
  - _Requirements: 10.4, 11.2_

- [x] 3. Implement `Service_Reconciler` as sole reconciliation owner
- [x] 3.1 Implement desired-vs-actual diff planner based on system tables.
  - _Requirements: 2.1, 9.1_
- [x] 3.2 Implement action emission to `Service_Lifecycle_Manager` only.
  - _Requirements: 2.2, 2.4_
- [x] 3.3 Implement drift correction loop and event-driven triggers.
  - _Requirements: 2.1, 13.4_
- [x] 3.4 Implement reconciliation decision telemetry.
  - _Requirements: 11.2, 11.4_
- [x] 3.5 Add unit tests for diff planning and deterministic action ordering.
  - _Requirements: 15.3_

- [x] 4. Build service-type adapter implementations
- [x] 4.1 Implement partition service adapter wrapping existing partition
  internals.
  - _Requirements: 6.2, 6.3_
- [x] 4.2 Implement message-group service adapter wrapping existing
  message-group internals.
  - _Requirements: 6.1, 6.3_
- [x] 4.3 Implement runtime service adapter delegating to runtime registry/
  runtime lifecycle owner.
  - _Requirements: 7.1, 8.1, 8.2_
- [x] 4.4 Add adapter conformance tests with shared fixture suite.
  - _Requirements: 11.1, 15.3_

- [x] 5. Unify invocation path with canonical `Service_Message`
- [x] 5.1 Add `Service_Message` schema and validator.
  - _Requirements: 4.1, 4.4_
- [x] 5.2 Implement `Service_Dispatcher` for envelope validation, leader
  resolution, and routing.
  - _Requirements: 4.3, 5.4_
- [x] 5.3 Refactor admin websocket handling to adapter-only translation into
  `Service_Message`.
  - _Requirements: 4.2, 5.1, 5.2, 5.3_
- [x] 5.4 Add dispatcher and adapter integration tests.
  - _Requirements: 11.3, 15.3_

- [x] 6. Normalize service descriptor model
- [x] 6.1 Add/validate canonical descriptor fields for all service kinds.
  - _Requirements: 3.1, 3.2_
- [x] 6.2 Ensure all built-in service registrations populate canonical
  descriptor fields.
  - _Requirements: 3.1, 6.1_
- [x] 6.3 Ensure userland service creation path uses same descriptor schema.
  - _Requirements: 7.1, 7.2_
- [x] 6.4 Add descriptor validation tests for each service kind.
  - _Requirements: 3.4, 12.4_

- [x] 7. Rewire seed bootstrap to unified lifecycle
- [x] 7.1 Replace direct partition/message-group startup calls with
  `Service_Lifecycle_Manager` API calls.
  - _Requirements: 1.2, 6.4_
- [x] 7.2 Start `Service_Reconciler` after foundational infra is ready.
  - _Requirements: 2.1, 13.4_
- [x] 7.3 Ensure built-in services converge through reconciler actions only.
  - _Requirements: 2.3, 6.1_
- [x] 7.4 Add seed bootstrap integration test asserting unified lifecycle path
  usage.
  - _Requirements: 15.3_

- [x] 8. Rewire node join to unified lifecycle
- [x] 8.1 Replace direct service startup during join with lifecycle manager
  calls.
  - _Requirements: 1.2, 6.4_
- [x] 8.2 Ensure join hydration hands desired/actual state to reconciler.
  - _Requirements: 2.1, 2.2_
- [x] 8.3 Add join integration tests asserting no direct legacy startup path.
  - _Requirements: 15.3_

- [x] 9. Unify operation journal and recovery
- [x] 9.1 Route all mutating lifecycle actions through operation journal owner.
  - _Requirements: 10.1, 9.1_
- [x] 9.2 Add restart recovery logic to resume pending/in-progress lifecycle
  operations.
  - _Requirements: 10.3, 13.4_
- [x] 9.3 Add idempotency tests for duplicate lifecycle commands.
  - _Requirements: 10.2, 15.3_

- [x] 10. Security and policy integration
- [x] 10.1 Enforce shared authn/authz checks in dispatcher layer.
  - _Requirements: 12.1_
- [x] 10.2 Enforce runtime and placement policy checks in lifecycle/reconciler
  path.
  - _Requirements: 12.2, 12.3_
- [x] 10.3 Add fail-closed policy violation tests.
  - _Requirements: 12.4, 15.3_

- [x] 11. Observability and diagnostics
- [x] 11.1 Add required structured logging dimensions.
  - _Requirements: 11.1_
- [x] 11.2 Add lifecycle/reconciler metrics.
  - _Requirements: 11.2_
- [x] 11.3 Add trace propagation adapter -> dispatcher -> service replica.
  - _Requirements: 11.3_
- [x] 11.4 Add diagnostic endpoint/report for reconciliation decisions.
  - _Requirements: 11.4_

- [x] 12. Hard cutover deletion: remove all legacy lifecycle paths
- [x] 12.1 Delete direct bootstrap service-start code paths replaced by unified
  lifecycle APIs.
  - _Requirements: 13.1, 13.2_
- [x] 12.2 Delete direct join-time service-start code paths replaced by unified
  lifecycle APIs.
  - _Requirements: 13.1, 13.2_
- [x] 12.3 Delete alternate maintenance/reconciliation loops.
  - _Requirements: 13.2, 14.2_
- [x] 12.4 Delete fallback/compat branches and feature flags preserving old
  ownership paths.
  - _Requirements: 13.3, 13.4_
- [x] 12.5 Add static checks (grep/lint assertions) for banned legacy symbols.
  - _Requirements: 15.1, 15.2_

- [x] 13. Final validation gates (release-blocking)
- [x] 13.1 Gate A: unit tests for lifecycle/reconciler/dispatcher/adapters pass.
  - _Requirements: 15.3_
- [x] 13.2 Gate B: seed bootstrap + join + rebalance integration tests pass
  using unified path only.
  - _Requirements: 15.3_
- [x] 13.3 Gate C: userland service lifecycle tests pass using same path as
  built-ins.
  - _Requirements: 7.1, 15.3_
- [x] 13.4 Gate D: negative tests prove legacy entrypoints are removed or hard
  fail.
  - _Requirements: 15.2_
- [x] 13.5 Gate E: documentation updated to final architecture only.
  - _Requirements: 15.4_

- [x] 14. Documentation and architecture updates
- [x] 14.1 Update `architecture.md` with final owner map and data flow.
  - _Requirements: 14.5, 15.4_
- [x] 14.2 Update admin/protocol docs to `Service_Message` and adapter-only
  behavior.
  - _Requirements: 4.1, 5.1_
- [x] 14.3 Update service developer docs for unified descriptor/lifecycle model.
  - _Requirements: 3.1, 7.1_
- [x] 14.4 Document anti-pattern bans and non-negotiable rules.
  - _Requirements: 13.4, 14.5_

## Non-Negotiable Guardrails

1. No parallel lifecycle owners in shipped code.
2. No fallback execution paths that preserve old ownership.
3. No adapter-owned service metadata mutation.
4. No service-kind-specific startup path outside lifecycle manager + adapters.
5. No completion sign-off until all hard cutover gates pass.
