# Requirements Document

## Introduction

The system has strong architectural invariants (everything is tables → partitions → Raft groups, CDC-propagated cache as the routing truth, a single SQL execution path, message-router-mediated communication). However, implementation complexity has accumulated across bootstrap/join orchestration, cache access shapes, transport selection, and mode-specific write paths.

This spec defines a simplification/unification effort that reduces duplication and abstraction leakage while preserving system goals and the existing user-facing behavior.

## Scope

This spec covers unification work in these areas:

1. Seed bootstrap and node joining orchestration (shared pipeline and phases)
2. System cache read access (unified read client over direct vs proxy cache)
3. Transport endpoint selection ownership (single owner for “how to reach node X”)
4. CDC integration bootstrap vs normal writes (strategy-based router vs boolean mode)
5. Replica lifecycle wiring (make `ServiceLifecycleManager` + `ServiceReconciler` the only owners)

## Non-Goals

1. Changing external SQL semantics, pgwire compatibility, or WASM call semantics
2. Changing partitioning policy, rebalancer policy, or Raft correctness
3. Adding new runtime features, UI, or new operational modes
4. Rewriting the SQL engine (SqlCore/SqlQueryEngine) or swapping Raft libraries

## Glossary

- **Seed Bootstrap**: the seed-node-only initialization sequence that creates initial services, performs registration writes, hydrates cache, and enters normal routing.
- **Node Join**: the joining-node sequence that fetches bootstrap snapshots, hydrates cache, subscribes to CDC, registers itself, and becomes ready.
- **SystemTableCache**: authoritative in-memory view of system tables updated by CDC (plus a sanctioned hydration exception).
- **ReadOnlySystemTableCache**: wrapper that enforces read-only access to the underlying cache at runtime.
- **SystemCacheProxy**: a stateless proxy that forwards cache queries to a worker-held cache.
- **SystemCacheClient**: proposed unified read interface used by consumers regardless of cache backing.
- **Write Router Strategy**: proposed internal strategy object used by `CDCIntegrationService` to route writes (direct bootstrap writes vs SQL routing), replacing a boolean flag.
- **Startup Pipeline**: proposed shared orchestration engine for seed/bootstrap and join/boot.
- **Unified Lifecycle Owners**: `ServiceLifecycleManager` + `ServiceReconciler` + service-type adapters.

## Requirements

### Requirement 1: Preserve core invariants

**User Story:** As an operator and developer, I want simplification changes to preserve the system’s core invariants so that correctness and operational expectations remain stable.

**Acceptance Criteria**

1. All persistent state continues to be stored in system/user tables backed by partitions and Raft groups.
2. System cache remains the single routing source of truth and is updated only via CDC events (plus hydration exception).
3. All SQL entrypoints still normalize to a canonical request and execute via a single SQL engine path.
4. All intra-node and inter-node communication continues to route through the message router/message groups.

### Requirement 2: Unify bootstrap and join orchestration under one pipeline

**User Story:** As a developer, I want a shared startup pipeline so that seed bootstrap and node join use the same phase mechanics, logging, cleanup, and diagnostics.

**Acceptance Criteria**

1. There exists one pipeline runner (shared implementation) that executes an ordered list of phases with:
   - a consistent phase state model
   - a shared cleanup strategy
   - consistent event emission and diagnostics
2. Seed bootstrap and join paths each provide only a small plan/configuration (phase list and options), not duplicate orchestration logic.
3. A phase failure produces a consistent error shape and consistent cleanup behavior in both seed and join.

### Requirement 3: Unify cache read access via a SystemCacheClient interface

**User Story:** As a subsystem owner, I want to depend on one cache-read interface so that the system can change cache backing (direct, proxy) without widespread branching.

**Acceptance Criteria**

1. A `SystemCacheClient` contract exists that exposes the read-only operations used by consumers: `get`, `find`, `filter`, `getAll`, `has`, `count`, `getTableNames`, `onCacheChange`, `offCacheChange`.
2. A direct implementation wraps the existing read-only wrapper.
3. A proxy implementation wraps `SystemCacheProxy` (forwarding read operations).
4. Consumers depend on the client interface; they do not need to know whether they are reading from direct cache or proxy.

### Requirement 4: Single-owner transport endpoint selection

**User Story:** As a developer, I want a single owner to decide transport endpoint selection so endpoint routing logic is not duplicated.

**Acceptance Criteria**

1. There is exactly one owner that:
   - queries node endpoints from cache
   - filters by availability
   - selects by priority
   - produces the delivery target info needed by MessageRouter
2. There is no parallel endpoint selection logic elsewhere.
3. Transport selection remains cache-driven (no extra endpoint caches introduced).

### Requirement 5: Replace CDC bootstrap-mode boolean with a write-router strategy

**User Story:** As a developer, I want CDC integration to encapsulate “bootstrap direct writes vs normal SQL routing” without leaking mode branching.

**Acceptance Criteria**

1. `CDCIntegrationService` routes writes via an internal strategy object rather than a `bootstrapMode` boolean.
2. Seed bootstrap can still perform direct partition writes during the registration phase.
3. After hydration, seed transitions to SQL routing without changing external call sites.
4. Joining nodes always use SQL routing.

### Requirement 6: Enforce unified lifecycle ownership

**User Story:** As a developer, I want replica creation/start/stop to be owned by the unified lifecycle manager and reconciler so there are no parallel lifecycle owners.

**Acceptance Criteria**

1. Bootstrap/join startup uses `ServiceLifecycleManager` + `ServiceReconciler` as the canonical way to create/start/stop replicas.
2. Service type adapters cover partition, message-group, and runtime service types.
3. Any remaining direct start/stop paths are treated as compatibility shims and are scheduled for removal (tracked in tasks).

### Requirement 7: No user-visible behavior regression

**User Story:** As an operator, I want this refactor to be behavior-preserving so deployments don’t require new runbooks.

**Acceptance Criteria**

1. Existing tests remain green without updating test intent (except where tests were asserting internal wiring details).
2. Bootstrap and join readiness timing remains within existing tolerances (no indefinite waits).
3. Debugging signals (correlation IDs, subsystem logs) remain available and are not reduced.

