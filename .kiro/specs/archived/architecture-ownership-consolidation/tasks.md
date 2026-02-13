# Implementation Plan: Architecture Ownership Consolidation

## Overview

Consolidate duplicated ownership and eliminate parallel implementations across
bootstrap/join flows, setup modules, CDC handling, cache key metadata, and
runtime wiring. Work is executed in delegation-first order so behavior remains
stable while duplicate bodies are removed.

## Tasks

- [x] 1. Establish ownership guardrails and baseline checks
  - Add a concise owner map reference in this spec package for implementation
    traceability.
  - Capture baseline behavior by running targeted bootstrap, joining, CDC, cache,
    and runtime callback tests before refactor.
  - Define explicit "forbidden duplication" checks for setup creation sites,
    duplicate key maps, and implicit runtime wiring creation.
  - _Requirements: 7.1, 7.2, 9.1, 9.2_

- [x] 2. Consolidate seed bootstrap phase ownership
  - Extract canonical owner implementations for seed phases and make
    `BootstrapService` call owners directly.
  - Convert any retained phase class implementation bodies into pure
    Delegation_Adapters.
  - Remove duplicate phase logic bodies from non-owner locations.
  - Preserve existing bootstrap lifecycle events and external API behavior.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 7.2, 7.4_

- [x] 3. Consolidate joining pipeline ownership
  - Extract canonical owner implementations for joining steps and make
    `NodeJoiningService` call owners directly.
  - Convert retained joining phase classes to Delegation_Adapters only.
  - Remove duplicate joining step logic from non-owner locations.
  - Preserve joining lifecycle events, retries, and readiness behavior.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 7.2, 7.4_

- [x] 4. Enforce shared setup component ownership in runtime paths
  - Route all runtime MessageRouter setup through `MessageRouterSetup`.
  - Route all runtime CDC integration setup and upgrades through
    `CDCIntegrationSetup`.
  - Route all runtime replica handler setup through `ReplicaHandlerSetup`.
  - Route all runtime control-plane setup through `ControlPlaneSetup`.
  - Remove duplicated inline setup logic from `BootstrapService` and
    `NodeJoiningService`.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 5. Consolidate message-group CDC handling to one owner
  - Select and finalize one CDC owner module (recommended: `CDCHandler`).
  - Refactor `MessageGroupService` CDC methods to delegate to the owner.
  - Remove parallel CDC logic from non-owner modules.
  - Ensure subscription checks, ordering, dedupe, and replication semantics
    remain behaviorally equivalent.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 7.4_

- [x] 6. Introduce canonical System_Cache_Key_Descriptor
  - Add a single key descriptor module sourced from canonical system-table
    metadata.
  - Refactor `SystemTableCache` to consume descriptor-only key mapping.
  - Refactor `SQLiteSystemCache` to consume descriptor-only key mapping.
  - Remove local duplicated key-map constants from cache implementations.
  - Preserve logs exclusion from default hydration/sync selection.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 7. Enforce startup-owned runtime wiring
  - Restrict `createRuntimeStartupWiring` usage to startup composition
    boundaries.
  - Refactor callback runtime registry creation to require injected runtime
    ownership (no implicit fallback wiring creation).
  - Ensure `SQLQueryEngine` callback path fails closed when runtime registry
    ownership is absent.
  - Remove hidden runtime owner creation from non-startup modules.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 8.3_

- [x] 8. Remove remaining duplicate bodies and dead paths
  - Remove obsolete duplicated methods and redundant helper paths once
    delegation migration is complete.
  - Keep only owner implementations plus thin adapters where API compatibility
    is required.
  - Verify there is one executable logic path per consolidated concern.
  - _Requirements: 1.4, 2.4, 7.2, 7.3_

- [x] 9. Add ownership contract and regression tests
  - Add contract tests for seed/join orchestration delegating to owners.
  - Add tests that assert shared setup owners are used by runtime paths.
  - Add CDC single-owner behavior tests (subscription + apply path).
  - Add descriptor consistency tests across both cache implementations.
  - Add runtime ownership tests to detect implicit fallback wiring creation.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 10. Add diagnostics for ownership violations
  - Standardize owner-specific missing dependency errors.
  - Add startup logs indicating which owner initialized each major concern.
  - Ensure ownership violations fail fast without fallback behavior.
  - _Requirements: 8.1, 8.2, 8.3_

- [x] 11. Update architecture and technical documentation
  - Update `.kiro/steering/architecture.md` with consolidated owner map and
    no-dual-path policy for affected concerns.
  - Update relevant internal docs to align terminology with owner components.
  - Add traceability references from architecture sections to this spec.
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 12. Final verification checkpoint
  - Run full targeted test suite for bootstrap, joining, CDC, cache, runtime,
    and integration coverage.
  - Confirm no duplicated ownership paths remain via static checks and code
    search gates.
  - Mark tasks complete only after behavior parity and ownership constraints are
    verified.
  - _Requirements: 7.4, 9.1, 9.2, 9.3, 9.4, 9.5_

## Notes

- No fallback/feature-flag split between old and new owners is permitted.
- Delegation-first migration is required: extract owner -> delegate -> remove
  duplicate body.
- If a concern cannot be consolidated in one step, leave only one executable
  implementation and temporary adapters with no duplicated logic.
