# Architecture Overview

Global architecture role, principles, and single-path ownership contract.

## Document Role

This document governs the current architecture of the repository.

Use this file for:

- current concrete owner maps
- current runtime boundaries
- current data-flow descriptions
- links to deeper subsystem architecture documents

Do not use this file for:

- the short-form implementation doctrine
- stable implementation rules
- stable testing policy
- roadmap scope decisions

For those concerns, use:

- [`docs/steering/doctrine.md`](../docs/steering/doctrine.md)
- [`docs/steering/system-guidelines.md`](../docs/steering/system-guidelines.md)
- [`docs/steering/testing-guidelines.md`](../docs/steering/testing-guidelines.md)
- [`docs/steering/roadmap.md`](../docs/steering/roadmap.md)
- [`roadmap.md`](../roadmap.md)

This document describes the architecture of the distributed database system.
It is the first domain file of the architecture tree — [`INDEX.md`](INDEX.md)
is the canonical entrypoint — and should be updated as features are added or
changed. Supporting architecture documents live under `architecture/` and are
linked from the index.

Current owner-map supplement:

- [`architecture/current-owner-maps.md`](current-owner-maps.md)

## Overview

A scalable distributed database where:
- ALL persistent information is stored in tables
- ALL tables are implemented as partitions
- ALL partitions are Raft consensus groups with odd-numbered replicas
  (minimum floor from `POLICY_DEFAULT.MIN_REPLICA_COUNT` in
  `src/policy/policy-constants.js`)
- ALL partitions use SQLite for storage
- Replicated service groups host service runtimes selected by
  `service_definitions.runtime_kind` (WASM, native admin, PG wire)

## Core Principles

1. **Tables as the Universal Storage Model** - System metadata and user data are stored in tables
2. **Partitions as Raft Groups** - Each partition is a Raft consensus group using liferaft
3. **System Cache as Canonical Observational Read Model** - In-memory cache of
   CDC-propagated system tables, updated by CDC events. It is the steady-state
   read model for propagated metadata, but it is not a second completion oracle
   for topology workflows. Non-propagated tables remain queryable from their
   owning partition via SQL.
4. **Message Router for All Communication** - All messages (local and remote) route through MessageRouter
5. **No Fallback Code Paths** - Single code path for any given logic; no legacy or alternative mechanisms
6. **System Cache Read Policy** - The system cache is strictly read-only from
   the consumer perspective (updated only by CDC events). Components may read
   directly from the cache for performance-critical paths. No component may
   write to the cache outside the CDC event path (plus bootstrap hydration).
7. **Single Owner per Concern** - Each concern (state tracking, failure detection, replica state, writes) has exactly one owning component
## Single-Path Contract

To prevent overlap and contradictory runtime behavior:

1. **SQL Execution:** `SqlCore` (SQLQueryEngine) is the single SQL planner and
   executor. All entrypoints (internal, external protocol, WASM DB.call,
   service replica `replicaContext.queryExecutor`)
   normalize into `SqlRequest` and delegate to SqlCore. No fallback engine.
2. **Placement Planning:** `MovePlanner` is the only planner implementation.  
   `UnifiedRebalancer` may orchestrate, but must not duplicate planning logic.
3. **Operation Lifecycle:** `RebalanceCoordinator` + `replica_operations` owns
   operation state. Workflow transitions must be monotonic and idempotent.
   Step transitions route through `DurableWorkflowCoordinator.transitionStep()`
   to persist canonical transition records.
   Atomic `replica_operations` step transitions are serialized on one
   coordinator-owned queue before opening system-partition transactions so
   `replica_operations-p1` cannot see overlapping owner writes under load.
   Owner-managed `replica_operations` fields (`status`, `workflow_step`,
   `completed_at`, `error_message`, `steps_history`) are written only by
   `RebalanceCoordinator`.
   Executor-side components (`ReplicaHandler`, `MessageGroupServiceHandler`,
   `RuntimeServiceHandler`) emit typed outcomes via `ExecutorOutcomeEmitter`
   instead of writing to `replica_operations` directly. The coordinator
   consumes those outcomes through the owner-key reconcile queue and advances
   executor-owned boundaries only after durable acknowledgement or authoritative
   owner validation.
   **Ownership boundary:** `BootstrapAPI` owns a separate domain for
   MOVE_REPLICA handoff (`type = 'ADD'` during handoff) and MOVE_ASSIGNMENT
   reservation (`type = 'MOVE_ASSIGNMENT'`) rows created during node join.
   The two domains are distinguished by operation type and creation context.
   Neither domain may create or mutate the other's rows.
4. **Dispatch:** `ReplicaDispatchService` dispatches only after the
   coordinator claims the operation via `claimDispatchTransition`
   (`PENDING -> SENDING`) through the owner path. No component writes
   to `replica_operations` outside the coordinator for steady-state
   operations.
   Event handlers (CDC, cache change, node state, coordinator events) enqueue
   owner keys into `OwnerKeyReconcileQueue` instances with typed reason codes.
   No event handler runs long-running progression logic inline.
5. **Leader Discovery for Writes:** write routing consults canonical owner
   rows first: `partitions.leader_node_id` for partition leaders and
   `message_groups.leader_node_id` for message-group leaders. `services`
   metadata is supporting replica detail only (`address`, `status`,
   `raft_role`) and must not replace canonical leader identity. When the
   owner row names a leader but the local cache is missing that leader's
   service row, write execution may do one bounded authoritative node/service
   repair and then use a routable partition replica only as redirect transport
   to the canonical leader.
6. **Readiness Gating:** internal topology consumers (`ReplicaDispatchService`,
   `RebalanceCoordinator`, `ManagedSplitWorkflow`, admission planning) use the
   shared `repairEligible` dimension from `ControlPlaneReadinessService`;
   routing and benchmark admission use `serveEligible`. The membership-health
   guards and the shared cross-layer owner-contract kernels (mutation-defer,
   write-health, leader-gap routing, priority-recovery, strict-CDC ingress,
   benchmark admission, boundary catalog) are documented in
   [`readiness-and-owner-contracts.md`](readiness-and-owner-contracts.md). The
   rule: callers branch on `contractState`/`nextAction`; visibility, phase, and
   owner-specific labels stay in evidence, and fixes extend the owner catalog in
   [`current-owner-maps.md`](current-owner-maps.md) rather than adding
   caller-local reinterpretations.
7. **Epoch Propagation:** `config.current_epoch` + CDC is the single epoch
   authority; no secondary epoch source.
8. **Control-Plane Progression:** Event-triggered control-plane work (dispatch,
   rebalance checks) flows through `OwnerKeyReconcileQueue`
   (`src/workflow/owner-key-reconcile-queue.js`). The queue de-duplicates by
   owner key and drains items through a single reconcile callback. Periodic
   polling loops remain as recovery-only paths.
9. **SQL Scaling:** SQL service replicas use the replicated service lifecycle
   (`service_profile = 'sql_engine'`, active `runtime_kind = native_js`
   via `SQL_ENGINE_RUNTIME_KIND`). No parallel SQL-specific scaling framework.
10. **WASM Entity Management:** External module/service administration flows
   through the default replicated meta service (`sys-wasm-meta`). Other APIs
   may expose adapters, but must delegate to the meta-service command path.
11. **Admin API Ownership:** Node-local admin APIs are compatibility adapters.
    Service-owned handlers (`sys-admin-meta` and `sys-wasm-meta`) are the
    mutation/control owners.
12. **Programmatic Runtime API Ownership:** `runtime.run` + `ctx.call` is the
    single user-facing execution surface for programmatic distributed SQL
    workflows. No parallel runtime API may bypass this path.
13. **Execution Mode Dispatch Ownership:** `SqlCore.executeRequest(SqlRequest)`
    is the owner for execution-mode dispatch (`sql_statement`,
    `partition_callback`, and plan-object execution). Each mode has a dedicated
    dispatch branch; `partition_callback` is not aliased to statement execution.
    Adapters may normalize requests but must not own runtime dispatch logic.
14. **Runtime Selection Ownership:** `Runtime_Driver_Registry` is the single
    selector from `runtime_kind` to runtime driver. No fallback driver
    selection is allowed.
15. **Runtime Lifecycle Ownership:** `Service_Runtime_Lifecycle` is the single
    owner for runtime prepare/start/stop/health orchestration across all
    runtime kinds.
16. **Adapter Boundary Ownership:** Node-local admin endpoints are ingress
    adapters only (fixed port `ADMIN_DEFAULT.WEBSOCKET_PORT` in
    `src/admin/admin-constants.js`), not mutation owners.
17. **Runtime Mutation Ownership:** Runtime drivers must not write system
    metadata directly; service and operation mutations flow through SQL/CDC.
18. **Timeout Budget Tree:** Every top-level control-plane operation starts
   with one canonical budget (`createTopLevelOperationBudget` in
   `src/control-plane/timeout-budget.js`). Sub-operations derive from
   remaining budget via `createChildTimeoutBudget`; they never start with
   fresh defaults. Sub-operations below `MINIMUM_OPERATION_BUDGET_MS` are
   rejected. Named constants for rebalance, split, and dispatch budgets
   live in `TIMEOUT_BUDGET_DEFAULT`.
19. **Live Query Runtime Ownership:** `createLiveQueryStartupWiring` is the
    single startup-owned path that creates one `LiveQueryManager` per node,
    wires it into `AdminWebSocketAPI`, and bridges `SystemTableCache` CDC
    notifications to active live subscriptions.

### Distributed SQL Canonical Ownership (Hard Cutover)

The distributed SQL layer is now single-path and owner-specific:

1. `DistributedQueryPlanner` is the only owner of multi-table partition
   planning, predicate-shape diagnostics, join strategy selection, and
   pushdown planning.
2. `ParallelQueryCoordinator` is the only owner of fanout scheduling and
   per-partition execution outcomes. Partition limits are enforced through
   deterministic chunking; no partition truncation is allowed.
3. `DistributedMergeEngine` (over `StreamingAggregator`) is the only owner of
   global merge semantics (`DISTINCT`, `GROUP/HAVING`, `ORDER`, `LIMIT`,
   set-operation merge behavior).
4. `DistributedWriteCoordinator` is the only owner for distributed
   INSERT/UPDATE/DELETE routing, participant result aggregation, and
   idempotency envelope metadata.
5. `DurableWorkflowCoordinator` is the reusable workflow runtime for
   durable owner-key workflow state, participant persistence,
   recovery-from-rows, single-flight execution, and monotonic step
   transitions. It owns workflow mechanics only, not transaction or
   partition semantics. Owners that require cross-process exclusion provide
   storage-backed claim and transition compare-and-swap ports plus their
   terminal-state policy; in-memory single-flight is only a contention
   optimization. The coordinator applies accepted storage state before
   mutating memory, rejects live-lease takeover and stale fences, and rebuilds
   transition idempotency from recovered history. All topology-changing operations
   (split/rebalance/replace) route step transitions through
   `transitionStep()`, which persists `previousStep`, `nextStep`,
   `reason`, `timestamp`, and `ownerKey` on every transition.
6. `DistributedTransactionCoordinator` is the only owner for distributed
   transaction participant enlistment, final participant freeze, commit-mode
   selection, and 1PC/2PC phase transitions
   (`PREPARING/PREPARED/COMMITTING/ROLLING_BACK`), prepare/commit/rollback
   dispatch, timeout-budget enforcement, and recovery from
   `sql_transactions`, `sql_transaction_participants`, and
   `sql_write_operations`. It composes `DurableWorkflowCoordinator`, persists
   commit/rollback decisions before participant fanout, runs recovery replay,
   and runs periodic recovery sweeps for timed-out non-terminal workflows.
   Transaction-only semantics (write-operation journaling, retry/backoff,
   timeout classification) remain local to this owner. Independent
   `RebalanceCoordinator` step mutations use the guarded autocommit persistence
   lane; SQL promotes only a final post-mirror multi-participant statement to
   a statement-owned transaction. Idempotency is enforced
   by operation id and step id via
   `DurableWorkflowCoordinator.isTransitionIdempotent()`.
7. `SchemaProvisioningJobOwner` extends `TableCreationService` with a durable
   long-running-operation boundary. One `schema_operations` row atomically
   records the cluster-global normalized CREATE intent and parent workflow;
   deterministic table, partition, replica-operation, and replica identities
   make replay level-triggered and idempotent. READY activation resumes
   nonterminal rows. CREATE has no legacy fallback, exact-fence transitions
   require a live durable lease, and pre-cutover metadata must match the
   deterministic identity and schema before replay attaches. Admin and
   PostgreSQL project the same typed job
   outcome (`55P03` with structured retry detail on protocol deadline).
8. `ManagedSplitWorkflow` is the only owner for managed partition-split
   lifecycle from admission through cleanup. It composes
   `DurableWorkflowCoordinator`, persists split workflow identity in
   `tables.partition_transition_metadata`, and owns all durable phase
   transitions including cutover activation. `PartitionService` acts as
   a source-execution participant that delegates cutover transition
   persistence back to `ManagedSplitWorkflow.advanceSplitPhase()`.
   Canonical source/child participants are registered on the workflow before
   source-side replication begins, and async participant acknowledgements
   rehydrate workflow state from the durable tables transition row when the
   initiating owner execution has already returned.
   `SPLIT_OWNER_MANAGED_PHASES` in `partition-constants.js` enumerates
   every phase that only the workflow owner may persist.
8. `SQLQueryEngine` remains the orchestration entrypoint and delegates to the
   owners above. It does not keep alternate distributed execution branches.

Forbidden patterns for distributed SQL:

1. `failOpen` read/write behavior toggles.
2. External ad-hoc join-partition injection (`options.joinPartitions`) in
   execution entrypoints.
3. Legacy distributed planning/execution fallback branches in
   `SQLQueryEngine` or `QueryExecutor`.
