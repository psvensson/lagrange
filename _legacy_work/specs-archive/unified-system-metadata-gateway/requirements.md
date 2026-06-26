# Requirements Document

## Introduction

Runtime access to shared cluster metadata is still fragmented across multiple
paths:

- `ControlPlaneSystemTableGateway`
- direct `cdcIntegrationService.*SystemTableRow(...)`
- direct `sqlQueryEngine.executeQuery(...)` against system tables
- direct `SystemTableCache` reads in owner and non-owner code
- bootstrap-only helpers that remain reachable from runtime code

That fragmentation creates three classes of bugs:

1. inconsistent backpressure and coalescing behavior
2. duplicated semantic decisions about freshness, readiness, and routing
3. repeated leaks of bootstrap/runtime exceptions into steady-state logic

This spec makes the existing `ControlPlaneSystemTableGateway` the single
runtime ingress for shared metadata reads and writes. It does not add a second
metadata service, a second cache, or a second write path. `SystemTableCache`
remains the only local cache, CDC remains the only propagation path, and
bootstrap exceptions remain tightly scoped to bootstrap.

This spec intentionally applies to **shared metadata and system-table access**
for ingress unification, while also requiring **one shared pressure policy**
that is reused by both metadata and query-plane paths. It does **not** route
user-table query traffic through the metadata gateway because the system
guidelines require control-plane/query-plane isolation.

## Scope

In scope:

- all runtime reads of system tables
- all runtime mutations of system tables
- owner boundaries for `nodes`, `services`, `partitions`, `message_groups`,
  `replica_operations`, `logs`, `service_endpoints`, `service_definitions`,
  and other shared metadata tables
- gateway-based pressure handling, coalescing, and typed admission outcomes
- one reusable pressure/admission model shared by control-plane and query-plane
  ingress paths
- bootstrap exception containment
- CI enforcement that prevents future bypasses

Out of scope:

- routing user-table and query-plane reads/writes through the metadata gateway
- replacing CDC, `SystemTableCache`, or the partition leader write path
- inventing a new topology store or second metadata cache

## Glossary

- **Shared_Metadata**: Cluster topology and control-plane information stored in
  system tables.
- **Canonical_Gateway**: The existing
  `ControlPlaneSystemTableGateway`, extended so it becomes the only runtime
  ingress for shared metadata reads and writes.
- **Semantic_Owner**: The single module responsible for deciding when and how a
  metadata concern changes, for example node lifecycle, service lifecycle, or
  partition ownership.
- **Mutation_Intent**: A typed write request submitted by a semantic owner to
  the canonical gateway.
- **Read_Intent**: A typed read request submitted by a semantic owner to the
  canonical gateway.
- **Read_Strategy**: The declared contract for a metadata read. This spec uses
  `cache`, `authoritative`, `authoritative_required`,
  `owner_local_non_propagated`, and `bootstrap_snapshot`.
- **Coalescing_Key**: A stable identity used by the gateway to collapse
  duplicate or supersedable work.
- **Bootstrap_Exception**: The strictly limited pre-CDC write/hydration path
  used only during initial bootstrap and join snapshot hydration.
- **Shared_Pressure_Policy**: One reusable admission/coalescing/backpressure
  model, implemented by the pressure governor and consumed by both metadata and
  query-plane ingress paths.

## Requirements

### Requirement 1: Single Runtime Mutation Ingress

**User Story:** As a maintainer, I want one runtime path for all shared
metadata writes so that backpressure, coalescing, and correctness rules are
enforced uniformly.

#### Acceptance Criteria

1. ALL runtime `INSERT`, `UPDATE`, `UPSERT`, and `DELETE` operations targeting
   system tables SHALL flow through
   `ControlPlaneSystemTableGateway.submitMutation(...)`.
2. NO runtime module outside the canonical gateway and sanctioned bootstrap
   exceptions SHALL call `cdcIntegrationService.insertSystemTableRow`,
   `updateSystemTableRow`, `upsertSystemTableRow`, or `deleteSystemTableRow`
   for system tables.
3. THE canonical gateway SHALL accept a typed `Mutation_Intent` carrying at
   least: `owner`, `tableName`, `operation`, identity fields
   (`row` or `whereClause`), mutation payload, `workClass`,
   `deliveryPriority`, `routingReadinessDimension`, `coalescingKey`, and
   pressure policy flags.
4. THE canonical gateway SHALL return typed mutation outcomes, including at
   minimum `applied`, `no_op`, `deferred`, `rejected`,
   `observed_state_changed`, and `owner_not_ready`, instead of relying on raw
   timeout-only failure semantics.
5. THE canonical gateway SHALL be wired from the composition root. Runtime
   consumers SHALL NOT lazily construct local replacement gateways.

### Requirement 2: Single Runtime Read Ingress

**User Story:** As a maintainer, I want one runtime path for all shared
metadata reads so that freshness, authoritative reads, and admission semantics
are consistent.

#### Acceptance Criteria

1. ALL runtime reads of system tables SHALL flow through
   `ControlPlaneSystemTableGateway.executeRead(...)` or typed owner read
   methods that delegate to it.
2. NO runtime module outside the canonical gateway SHALL call
   `sqlQueryEngine.executeQuery(...)` directly for system-table reads.
3. EVERY `Read_Intent` SHALL declare exactly one `Read_Strategy`:
   `cache`, `authoritative`, `authoritative_required`,
   `owner_local_non_propagated`, or `bootstrap_snapshot`.
4. THE canonical gateway SHALL execute exactly one declared read strategy per
   request and SHALL NOT implement sequential "new path failed, try old path"
   fallback chains.
5. IDENTICAL in-flight read intents SHALL single-flight inside the gateway by
   stable request key rather than multiplying concurrent reads from multiple
   call sites.

### Requirement 3: One Consume Path and One Cache

**User Story:** As a maintainer, I want all shared metadata consumers to see
one read model so that control-plane logic cannot drift across parallel caches
or shadow state.

#### Acceptance Criteria

1. `SystemTableCache` SHALL remain the only runtime cache for
   CDC-propagated system tables.
2. NO runtime component SHALL maintain a parallel cache, shadow copy, or
   ad-hoc in-memory metadata store outside `SystemTableCache`.
3. SUCCESSFUL shared metadata writes SHALL become visible to consumers through
   CDC propagation to `SystemTableCache` or via an explicit authoritative read
   result returned by the canonical gateway, not by local side effects in the
   caller.
4. READS of non-propagated system tables SHALL still route through the
   canonical gateway using `owner_local_non_propagated`, which may execute an
   owner-scoped SQL read against the authoritative partition.
5. JOIN bootstrap snapshot hydration SHALL remain the only sanctioned cache
   write path before CDC subscriptions become active.

### Requirement 4: Semantic Owners Stay Distinct

**User Story:** As a maintainer, I want one semantic owner per metadata concern
even though all I/O goes through one gateway, so that row lifecycle ownership
remains explicit and defensible.

#### Acceptance Criteria

1. EVERY shared metadata table family SHALL have exactly one semantic owner for
   runtime lifecycle decisions:
   `nodes`, `services`, `partitions`, `message_groups`, `replica_operations`,
   `logs`, `service_endpoints`, `service_definitions`, and any future shared
   metadata table.
2. CALLERS SHALL invoke typed owner methods such as
   `nodesOwner.markActive(...)` or `servicesOwner.updateReplicaStatus(...)`,
   not construct raw table writes in arbitrary business logic.
3. ONLY the semantic owner for a concern SHALL be permitted to construct
   mutation intents for that concern.
4. MISSING semantic owner dependencies SHALL be hard dependency errors with a
   typed failure, not permission to synthesize alternate local behavior.
5. OWNER dependency refreshes SHALL route through canonical setter/injection
   paths from the composition root.

### Requirement 5: Gateway-Owned Pressure, Coalescing, and Admission

**User Story:** As an operator, I want all shared metadata traffic to obey one
pressure policy so that producers slow down uniformly and memory stays bounded
under load.

#### Acceptance Criteria

1. THE canonical gateway SHALL evaluate pressure and admission for every
   runtime shared metadata read and write.
2. IDEMPOTENT duplicate mutations with the same owner, identity, operation
   class, and `coalescingKey` SHALL be collapsed inside the gateway rather
   than retried independently by callers.
3. SUPERSedable status-style mutations marked by the owner SHALL support
   bounded last-write-wins replacement while preserving owner-key ordering.
4. WHEN the gateway cannot admit work immediately, THEN it SHALL return a typed
   defer/reject result including `retryAfterMs` where appropriate instead of
   leaving callers to discover overload via timeout expiry.
5. THE canonical gateway SHALL bound in-flight work, coalescing maps, and
   pending retry state so that producer pressure cannot cause unbounded memory
   growth.

### Requirement 6: Shared Pressure Policy Across Metadata and Query Paths

**User Story:** As an operator, I want both control-plane metadata traffic and
query-plane traffic to obey the same pressure semantics so that overload is
handled consistently even though the two planes stay isolated.

#### Acceptance Criteria

1. THE repository SHALL expose one `Shared_Pressure_Policy` abstraction that
   defines work classes, resource keys, defer/reject semantics, retry hints,
   and bounded coalescing rules.
2. `ControlPlaneSystemTableGateway` SHALL consume that shared pressure policy
   for all metadata reads and writes.
3. QUERY-plane ingress paths SHALL also consume that shared pressure policy for
   admission and defer/reject decisions, without routing user-table I/O through
   the metadata gateway.
4. THE shared pressure policy SHALL support separate resource keys and capacity
   partitioning so control-plane pressure and query-plane pressure can be
   isolated while still using one decision model.
5. NO ingress path SHALL implement an unrelated local overload policy once the
   shared pressure policy is available.

### Requirement 7: Bootstrap Exceptions Must Be Contained

**User Story:** As a maintainer, I want bootstrap exceptions to remain
phase-scoped so that the runtime cannot accidentally keep alternate write paths
alive.

#### Acceptance Criteria

1. BOOTSTRAP-only writers and cache hydrators SHALL be callable only during the
   bootstrap/join phases that require them.
2. NO runtime steady-state module SHALL import or invoke bootstrap-only write
   helpers such as `SystemTableWriter` or direct cache mutation helpers.
3. THE canonical gateway MAY support `bootstrap_snapshot` reads, but only for
   explicit bootstrap/join flows and never as a runtime fallback after steady
   state begins.
4. WHEN bootstrap completes, THEN sanctioned bootstrap exceptions SHALL be
   unreachable from runtime code paths.
5. CI SHALL fail if a runtime path imports or invokes a bootstrap-only helper.

### Requirement 8: Structural Enforcement, Not Table-by-Table Exceptions

**User Story:** As a maintainer, I want the architecture to enforce the single
path structurally so that we do not need to maintain growing lists of tables or
special-case writers.

#### Acceptance Criteria

1. THE repository SHALL include a static audit that fails when runtime code
   directly calls low-level system-table CDC methods outside the canonical
   gateway and sanctioned bootstrap files.
2. THE repository SHALL include a static audit that fails when runtime code
   directly executes system-table SQL outside the canonical gateway.
3. THE repository SHALL include a static audit that fails when runtime code
   mutates `SystemTableCache` directly outside sanctioned bootstrap hydration
   and tests.
4. THE enforcement model SHALL be structural by module boundary and forbidden
   low-level API use, not by an ever-growing allowlist of arbitrary table/file
   combinations.
5. LEGACY helper methods may temporarily delegate to the canonical gateway
   during migration, but those helper methods SHALL be marked transitional and
   removed by the end of the migration.

### Requirement 9: Observability and Diagnostics

**User Story:** As an operator, I want to see where metadata pressure and
staleness come from so that regressions are visible before they turn into
timeouts or leaks.

#### Acceptance Criteria

1. THE canonical gateway SHALL emit metrics and structured logs for reads and
   writes including: `owner`, `tableName`, `operation`, `readStrategy`,
   `workClass`, `deliveryPriority`, `coalescingKey`, outcome, latency, and
   queue/coalescing counts.
2. THE canonical gateway SHALL expose diagnostics for cache hits, authoritative
   reads, deferred work, rejected work, coalesced work, and superseded work.
3. WHEN the gateway returns a defer/reject result, THEN the reason code SHALL
   be typed and attributable to one canonical owner path.
4. THE migration SHALL add memory-focused diagnostics that prove in-flight
   shared metadata work remains bounded under pressure.
5. DISTRIBUTED harness output SHALL make it possible to distinguish gateway
   deferral from transport timeout, owner-not-ready, and authoritative
   read-required failures.

### Requirement 10: Verification and Success Criteria

**User Story:** As a maintainer, I want explicit proof that the single-path
architecture is real so that extending scenario timeouts does not hide bugs.

#### Acceptance Criteria

1. UNIT and integration tests SHALL prove that representative owners use the
   canonical gateway for both reads and writes and fail when the gateway is
   bypassed.
2. PROPERTY or matrix-style tests SHALL verify write coalescing, typed defer
   semantics, strategy-specific read behavior, and shared pressure-policy reuse
   across the metadata and query ingress paths.
3. TARGETED regression suites SHALL cover at least the `services` lifecycle
   path, `nodes` readiness path, and bootstrap/join snapshot path.
4. DISTRIBUTED verification SHALL rerun at minimum:
   `node-join-under-load`, `rolling-restart`, and
   `seven-node-table-partition-distribution`.
5. THE distributed reruns SHALL demonstrate bounded metadata producer behavior
   and the absence of unbounded gateway-retained memory growth before any
   timeout window is increased.
