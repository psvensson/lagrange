# Requirements: Architecture Hygiene Consolidation

## Introduction

This feature addresses six categories of architecture hygiene issues discovered
during a codebase audit. The violations span constants duplication, dead code
paths, shadow state, and direct cache writes that bypass the documented CDC
ownership model. Each issue either violates the zero-duplication contract, the
single-code-path rule, or the single-source-of-truth principle documented in
the system guidelines and architecture.

## Glossary

- **STATE** — General-purpose state enum (`src/constants/states.js`) containing
  values like ACTIVE, READY, CONNECTED, DISCONNECTED. Used for service replica
  status and connection state.
- **NODE_STATE** — Unified node lifecycle enum (`src/constants/node-state.js`)
  containing values like ACTIVE, READY, STARTING, JOINING. Used for node
  lifecycle state tracking.
- **SERVICE_STATE** — Bootstrap service lifecycle enum
  (`src/bootstrap/service-lifecycle-constants.js`) with states CREATED →
  INITIALIZED → RUNNING → STOPPED. Used by `ServiceLifecycleMixin`.
- **SERVICE_LIFECYCLE_STATE** — Unified service lifecycle enum
  (`src/constants/unified-service-lifecycle.js`) with states CREATED →
  STARTING → RUNNING → STOPPING → STOPPED → FAILED. Used by the hard-cutover
  service lifecycle model.
- **MetadataCache** — A TTL-based in-memory cache class
  (`src/message-group/metadata-cache.js`) with query-on-miss behavior. Exported
  from the message-group module but never instantiated in production code.
- **SystemTableCache** — The canonical in-memory cache of all CDC-propagated
  system tables (`src/cache/system-table-cache.js`), updated only by CDC events.
- **TransportRegistry** — An endpoint-resolution abstraction
  (`src/transport/transport-registry.js`) that was designed to replace direct
  WebSocket delivery. Never wired in production bootstrap or join flows.
- **Bootstrap phase delegation adapters** — Thin wrapper classes in
  `src/bootstrap/phases/` labeled "Legacy phase entry point retained for API
  compatibility." They delegate to canonical phase owners but are no longer
  imported by any production code.
- **CDC** — Change Data Capture. The mechanism by which system table writes on
  partition leaders propagate to all node caches.
- **Bootstrap hydration exception** — The documented exception allowing direct
  `applySystemTableChange` calls during initial cache population from bootstrap
  snapshots, before CDC subscriptions are active.

## Requirements

### Requirement 1: Separate Service Status from Node State Constants

**User Story:** As a system maintainer, I want service replica status values
and node lifecycle state values to come from clearly distinct enums, so that
there is no ambiguity about which enum to use for which purpose.

#### Acceptance Criteria

1. THE system SHALL define a `SERVICE_STATUS` enum (or equivalent clearly-named
   constant) that owns the values used in the `services` table `status` column
   (ACTIVE, and any other service-specific statuses).
2. THE `STATE` enum in `src/constants/states.js` SHALL be reduced to contain
   only non-node, non-service-status values: CONNECTED, DISCONNECTED, NORMAL,
   and READY (connection/readiness states used for `connection_state` column).
3. ALL production code that currently uses `STATE.ACTIVE` for service replica
   status SHALL be migrated to use the new `SERVICE_STATUS.ACTIVE` constant.
4. ALL production code that currently uses `STATE.READY`, `STATE.CONNECTED`,
   or `STATE.DISCONNECTED` for connection state SHALL continue using `STATE`
   (these are connection states, not service statuses).
5. THE `NODE_STATE` enum SHALL remain unchanged — it already correctly owns
   node lifecycle values.
6. WHEN a developer needs to set a service's `status` column, THE developer
   SHALL import from `SERVICE_STATUS`, not from `STATE` or `NODE_STATE`.

### Requirement 2: Unify Service Lifecycle State Enums

**User Story:** As a system maintainer, I want a single service lifecycle
state enum, so that there are not two overlapping lifecycle state definitions
that could be confused.

#### Acceptance Criteria

1. THE `ServiceLifecycleMixin` SHALL be migrated to use
   `SERVICE_LIFECYCLE_STATE` from `src/constants/unified-service-lifecycle.js`
   instead of `SERVICE_STATE` from
   `src/bootstrap/service-lifecycle-constants.js`.
2. THE `SERVICE_LIFECYCLE_STATE` enum SHALL be extended with an `INITIALIZED`
   value if the mixin's CREATED → INITIALIZED → RUNNING → STOPPED flow
   requires it, OR the mixin's flow SHALL be adapted to use CREATED → STARTING
   → RUNNING → STOPPED to match the existing unified enum.
3. WHEN the migration is complete and no production code imports from
   `src/bootstrap/service-lifecycle-constants.js`, THE file SHALL be deleted.
4. THE `ServiceLifecycleMixin` SHALL continue to enforce valid state
   transitions after migration — no transition that was previously invalid
   SHALL become valid, and no transition that was previously valid SHALL
   become invalid.

### Requirement 3: Remove Dead Transport Delivery Path

**User Story:** As a system maintainer, I want a single message delivery code
path in the MessageRouter, so that there is no dead branch that could confuse
future developers or accidentally diverge.

#### Acceptance Criteria

1. THE `MessageRouter.deliver()` method SHALL have exactly one delivery path
   for remote messages — the existing WebSocket delivery via `deliverRemote()`.
2. THE `TransportRegistry` branch in `deliver()` (the `if
   (this.hasTransportRegistry())` block) SHALL be removed.
3. THE `deliverViaTransportRegistry()` method SHALL be removed from
   `MessageRouter`.
4. THE `deliverViaEndpoint()` method SHALL be removed from `MessageRouter`.
5. THE `hasTransportRegistry()` method SHALL be removed from `MessageRouter`.
6. THE `setTransportRegistry()` method SHALL be removed from `MessageRouter`.
7. THE `transportRegistry` and `connectionPool` fields SHALL be removed from
   `MessageRouter`.
8. THE `shouldFallbackToInProcess()` method and the in-process fallback branch
   in `startServer()` SHALL be removed. Tests that need in-process transport
   SHALL construct the router with `inProcess: true` explicitly.
9. THE `TransportRegistry` class, `TransportProvider` base class,
   `ConnectionPool` class, and `RouterDeliveryManager` class SHALL be preserved
   as library code (they are tested and may be wired in the future), but SHALL
   NOT be referenced from `MessageRouter`.
10. ALL tests that mock `hasTransportRegistry` or `getTransportRegistry` SHALL
    be updated to remove those mocks.

### Requirement 4: Remove Dead MetadataCache Class

**User Story:** As a system maintainer, I want no unused shadow cache classes
in the codebase, so that there is no risk of someone accidentally instantiating
a parallel cache that violates the single-source-of-truth principle.

#### Acceptance Criteria

1. WHEN no production code instantiates `MetadataCache`, THE
   `src/message-group/metadata-cache.js` file SHALL be deleted.
2. THE `MetadataCache` export SHALL be removed from
   `src/message-group/index.js`.
3. ALL test files that test `MetadataCache` in isolation SHALL be deleted.
4. IF any production code is discovered to instantiate `MetadataCache`, THAT
   code SHALL be migrated to use `SystemTableCache` queries instead, and THEN
   the class SHALL be deleted.

### Requirement 5: Remove Dead Bootstrap Phase Delegation Adapters

**User Story:** As a system maintainer, I want no legacy delegation adapter
classes that are not imported by any production code, so that the codebase
does not contain dead compatibility shims.

#### Acceptance Criteria

1. WHEN no production code imports from `src/bootstrap/phases/`, THE following
   files SHALL be deleted:
   - `src/bootstrap/phases/infrastructure-phase.js`
   - `src/bootstrap/phases/partition-phase.js`
   - `src/bootstrap/phases/message-group-phase.js`
   - `src/bootstrap/phases/cache-hydration-phase.js`
   - `src/bootstrap/phases/registration-phase.js`
2. ANY re-exports of these classes from `src/bootstrap/index.js` SHALL be
   removed.
3. ALL test files that test the delegation adapters in isolation SHALL be
   deleted.
4. IF any production code is discovered to import these adapters, THAT code
   SHALL be migrated to use the canonical phase owners directly, and THEN the
   adapter files SHALL be deleted.

### Requirement 6: Audit and Document Direct Cache Write Exceptions

**User Story:** As a system maintainer, I want every direct
`applySystemTableChange` call outside the CDC path to be either justified as
a documented bootstrap exception or eliminated, so that the single-write-path
contract is verifiable.

#### Acceptance Criteria

1. THE direct `applySystemTableChange` call in
   `NodeJoiningService.hydrateSystemCacheFromSnapshots()` (line ~2184) SHALL
   be recognized as a valid bootstrap hydration exception — it populates the
   cache from bootstrap snapshots before CDC subscriptions are active. This
   call SHALL NOT be removed. It SHALL be annotated with a comment referencing
   the bootstrap hydration exception documented in architecture.md.
2. THE direct `applySystemTableChange` call in
   `NodeJoiningService.registerMessageGroupService()` (line ~1300) SHALL be
   analyzed for necessity:
   - This call writes a services table entry to the local cache immediately
     after the HTTP POST to the seed node's register-service endpoint.
   - The seed node's register-service endpoint writes the row to the services
     partition leader, which generates a CDC event that will eventually
     propagate to all nodes including this one.
   - THE analysis SHALL determine whether removing this eager cache write
     creates a race condition where the joining node needs the service entry
     in its local cache before the CDC event arrives (chicken-and-egg).
   - IF the eager write is necessary to avoid a bootstrap deadlock (e.g., the
     node needs to route messages to its own message group replica before CDC
     delivers the entry), THEN the call SHALL be preserved and annotated as a
     bootstrap timing exception with a comment explaining the race condition.
   - IF the eager write is not necessary (CDC delivery is fast enough or the
     node does not need the entry before CDC arrives), THEN the call SHALL be
     removed.
3. THE `CacheHydrationService` default applier (line ~42 in
   `src/cache/cache-hydration-service.js`) SHALL be recognized as a valid
   bootstrap hydration path — it is the standard mechanism for populating
   cache during bootstrap. This SHALL NOT be removed.
4. THE `CDCHandler.applyEvent()` call in `src/message-group/cdc-handler.js`
   (line ~335) SHALL be recognized as the canonical CDC cache-apply path. This
   SHALL NOT be removed.
5. AFTER the audit, architecture.md SHALL be updated with an explicit list of
   all sanctioned direct `applySystemTableChange` call sites and their
   justification category (bootstrap hydration, CDC apply path, or bootstrap
   timing exception).
