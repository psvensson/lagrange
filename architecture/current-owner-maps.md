# Current Owner Maps

## Document Role

This document governs current concrete owner maps and shared owner-path building
blocks for the active implementation.

Use this file for:

- current concrete ownership assignments
- current workflow owner boundaries
- current shared control-plane building blocks

Do not use this file for:

- stable implementation rules that should survive refactors
- testing policy
- roadmap scope decisions

For durable implementation rules, use
[`.kiro/steering/system guidelines.md`](../.kiro/steering/system%20guidelines.md).

## Core Ownership Assignments

The current concrete ownership map is:

- Node state -> `NodeLifecycleStateMachine`
- Replica state -> `ReplicaStateMachine`
- Epoch -> `config.current_epoch` via CDC
- Placement planning -> `MovePlanner`
- Operation lifecycle -> `RebalanceCoordinator` + `replica_operations`
- Dispatch -> `ReplicaDispatchService`
- Failure detection -> `FailureDetector`
- System cache -> `SystemTableCache`

## Topology Workflow Owner Map

Current workflow ownership boundaries are:

- `RebalanceCoordinator` is the writer of owner-managed
  `replica_operations` workflow fields.
- `ManagedSplitWorkflow` is the durable owner of split lifecycle phase
  transitions from admission through cleanup.
- Executors such as `ReplicaHandler` and `PartitionService` are participants.
  They emit typed acknowledgements or outcomes and do not persist
  owner-managed phase transitions directly.

## Shared Control-Plane Building Blocks

The current shared building blocks for control-plane work are:

1. `AuthoritativeControlPlaneView`
2. `EligibilitySnapshot`
3. `OperationLane`
4. `WorkflowStepRunner`
5. `TimeoutPolicy`
6. `ControlPlaneMutationReadiness`
   - owns one canonical deferred/retryable mutation outcome for local
     control-plane authority-establishment pressure
   - is shared by background gateway metadata mutations and retryable
     system-table SQL DML so callers consume one readiness-owned contract
   - also owns one canonical transaction-control routing-gap defer state
     when `sql_transactions`, `sql_transaction_participants`, or
     `sql_write_operations` still have a canonical leader owner/service gap,
     so `SQLQueryEngine` and `CDCIntegrationService` preserve one typed
     `query_admission_deferred` outcome instead of rewrapping or retrying
     owner-missing transaction-control mutations as opaque distributed
     failures
7. `SqlRequest.timeoutBudget`
   - owned by `AdminWebSocketAPI.executeSqlRequestWithTimeout(...)`
   - derives one inner SQL completion budget with bounded margin before the
     outer admin request deadline
8. `TableCreationService` bootstrap provisioning budget
   - owned by `SQLQueryEngine.executeCreateTable(...)` and
     `TableCreationService.createTable(...)`
   - carries the caller-owned timeout budget through fresh `CREATE TABLE`
     bootstrap and `IF NOT EXISTS` reconciliation provisioning
9. `CanonicalLeaderRoutingGap`
   - owned by `src/query/canonical-leader-routing.js`
   - derives one canonical leader-identity gap state from the routing
     snapshot: `none`, `owner_missing`, or `service_missing`
   - is shared by query write routing and control-plane kernel ingress so
     recovery-owned system-table writes may widen on `owner_missing` or
     `service_missing` during `controlPlaneRecoveryEligible`, while
     steady-state writes stay fail-closed and local `NODE_STATE_UPDATE`
     ingress keeps only a bounded local fallback on that same contract
10. `PriorityRecoveryCompletion`
   - owned by `src/control-plane/priority-recovery-completion.js`
   - derives one canonical completion state plus bounded
     `temporaryOverflowVoterBudget` for critical replace/remove recovery
11. `OwnerContractOutcome`
   - owned by `src/control-plane/owner-contract-outcome.js`
   - normalizes one promise-shaped cross-layer envelope: `contractState`
     (`ready`, `pending`, `deferred`, `blocked`, `failed`) plus `nextAction`
     (`proceed`, `wait`, `retry`, `stop`)
   - keeps owner-specific fields such as `visibilityState`, `outcome`,
     `reasonCodes`, `runtimeAuthority`, `retryAfterMs`, or durable
     phase as reasons/evidence instead of widening the public branch surface
   - is now cut through `ControlPlaneSystemTableGateway`,
     `AdminWebSocketAPI`, harness query parsing, and
     `table-distribution-helpers` as the first live migration slice
   - is shared by learner-promotion admission, priority remove-safety,
     and other recovery consumers so temporary overflow and recovery
     projection membership both come from one recovery-owned contract
     instead of duplicated local voter-count or stale published-membership
     branches
12. `MessageGroupStrictCdcRecoveryRouting`
   - owned by
     `MessageGroupForwardingOwner.resolveStrictCdcRecoveryRoutingContract(...)`
   - derives one canonical strict-CDC recovery-routing state for
     system-table dissemination from:
     - the system-table partition
       `controlPlaneRecoveryEligible` routing snapshot
     - ordered connected message-group forward candidates
     - bounded local system-table write availability
   - emits one routing state: `none`, `remote_targets_available`, or
     `local_only`
   - is shared by metadata-ingress readiness, strict CDC forward-target
     selection, and local-vs-forward CDC apply decisions so those call sites
     consume one recovery-owned contract instead of separately inferring
     leader-unknown, local-ingress, or widened-forward fallbacks
13. `ControlPlaneWriteHealth`
   - owned by `src/bootstrap/control-plane-write-health-owner.js`
   - derives one explicit write-health state from:
     - heartbeat publication failure count and last publication mode
     - message-router queue evidence reused through `PressureGovernor`
     - contained background backlog versus exhausted critical reserve
   - emits one state: `healthy`, `background_backlog_contained`, or
     `critical_write_unhealthy`
   - also emits one dependency classification for readiness consumption:
     - `hard` for true critical write loss
     - `soft` for contained background backlog
   - is shared by bootstrap/startup readiness so background observability
     backlog no longer poisons the same hard dependency used by real
     control-plane write exhaustion

New control-plane work should extend these shared owners before adding
feature-local mechanics.

## Distributed Harness Building Blocks

The current shared building blocks for distributed harness load work are:

1. `BenchmarkLoadAdmissionSnapshot`
   - owned by `Cluster.resolveBenchmarkLoadAdmissionSnapshot(...)`
   - reuses table-local benchmark discovery plus the real load lane to emit
     one canonical node state: `local_ready`, `routed_ready`,
     `local_blocked`, `discovery_pressured`, `gate_blocked`, or
     `unavailable`
   - preserves the discovery-owned readiness and degradation evidence that
     explains that state, including routing/schema/topology readiness,
     local replica role and voter readiness, degradation state,
     discovery reason details, load-lane reason codes, and bounded
     `retryAfterMs`
   - `Cluster.resolveBenchmarkReadyLoadNodes(...)` remains only as a
     compatibility wrapper over that snapshot
2. `BenchmarkPartitionConvergence`
   - owned by `test/distributed/harness/benchmark-partition-convergence.js`
   - combines replica-bearing spread with the admission snapshot so
     partitioning planners and timeout diagnostics distinguish:
     `ready_replica`, `replica_blocked`, `routed_admission_only`, and
     `absent`
   - also derives one explicit dispatch-contribution state from the same
     shared evaluations: `local_primary`, `local_blocked`,
     `routed_support`, or `none`
   - prevents the harness from counting routed benchmark admission as proof
     that a spread replica is already locally usable
3. `BenchmarkPartitionDispatchMode`
   - owned by `resolveBenchmarkPartitionDispatchMode(...)` in
     `test/distributed/harness/benchmark-partition-convergence.js`
   - derives one canonical partitioning dispatch mode from the shared
     convergence snapshot: `local_ready_only` or
     `bootstrap_backfill_required`
   - keeps partitioning load in backfill mode until the usable-spread target
     exists, so the planner does not collapse to the smaller bootstrap quorum
     while replica-bearing or routed backfill is still needed
4. `LoadNodeAvailability`
   - owned by `test/distributed/harness/load-node-availability.js`
   - emits one canonical harness dispatch outcome for a benchmark node:
     `ready`, `slot_borrowing`, `local_blocked`, `external_blocked`,
     `slot_saturated`, or `slot_stalled`
   - decides both:
     - whether dispatch may target the node now
     - whether the node still contributes dispatch-capacity budget
   - is shared by both normal candidate selection and recovery fallback, so
     only `local_blocked` nodes may re-enter through the fallback path while
     `slot_stalled` is reserved for peers that have aged out at the borrowed
     dispatch ceiling, not merely at the steady contribution floor

Harness load work should extend these shared admission, convergence, and
availability contracts before adding more scheduler-local booleans or retry
heuristics.

## Active Boundary Catalog

| Boundary | Semantic owner | Canonical evidence | Canonical vocabulary | Allowed consumers | Prohibited reinterpretation | Primary diagnostics |
| --- | --- | --- | --- | --- | --- | --- |
| Benchmark load admission | `Cluster.resolveBenchmarkLoadAdmissionSnapshot(...)` | table-local discovery readiness, load-lane admission result, local replica role/voter readiness, degradation evidence, retry hint | `local_ready`, `routed_ready`, `local_blocked`, `discovery_pressured`, `gate_blocked`, `unavailable` with `reasonCodes`, `discoveryReasonCodes`, `loadLaneReasonCodes`, `retryAfterMs` | `Cluster.resolveBenchmarkReadyLoadNodes(...)`, `BenchmarkPartitionConvergence`, harness diagnostics | callers must not treat routed admission as proof of local usability; callers must not collapse retryable pressure into plain exclusion | admission-ready node ids, readiness histogram, per-node reason codes and retry hints |
| Usable benchmark spread | `BenchmarkPartitionConvergence` | admission snapshot plus replica-bearing spread for the target table | `ready_replica`, `replica_blocked`, `routed_admission_only`, `absent` plus dispatch contribution `local_primary`, `local_blocked`, `routed_support`, `none` | partitioning planners, timeout diagnostics, triage summaries, failure bundles | raw replica spread count must not be treated as usable split-driving spread; routed support must not be promoted to local-ready contribution | ready-replica node ids, local-primary node ids, routed-support node ids, convergence evaluations |
| Benchmark dispatch contribution | `resolveBenchmarkPartitionDispatchMode(...)` and `LoadNodeAvailability` | convergence snapshot, local cooldown, external admission, in-flight slot age/capacity | `local_ready_only`, `bootstrap_backfill_required`; node availability `ready`, `slot_borrowing`, `local_blocked`, `external_blocked`, `slot_saturated`, `slot_stalled` | `table-distribution-helpers`, `load-generator` | callers must not collapse to bootstrap quorum while the usable-spread target is still short; callers must not keep slot-stalled nodes in capacity budgets; borrowed healthy-node overflow must not be mistaken for fresh local readiness | selected node ids, dispatch contribution histogram, wait-reason counters, per-node availability state |
| Control-plane write health | `ControlPlaneWriteHealth` | heartbeat publication failures, last publication mode, message-router pressure summary, contained background backlog evidence | `healthy`, `background_backlog_contained`, `critical_write_unhealthy` plus dependency classification `hard` or `soft` | bootstrap/startup readiness, diagnostics, probe consumers | callers must not equate background heartbeat failure churn with true critical control-plane write loss when critical reserve is still available | readiness snapshots, degraded reasons, heartbeat publication diagnostics, transport queue pressure summaries |
| Membership publication authority view | `MembershipPublicationCoordinator` with `AuthoritativeControlPlaneView` as the shared read ingress | latest publication row, latest published row, projected serving membership, retained owner-only reconciliation state | explicit non-overlapping views: `published_authority`, `observed_projection`, `retained_owner_state` | routing, readiness, topology planning, operator diagnostics | callers must not treat observed projection or retained owner state as a second publishable authority surface | publication convergence snapshots, projection diagnostics, recovery-protocol snapshots, membership-publication regression tests |
| Canonical peer endpoint authority | `src/transport/node-address-resolution.js` consumed by `MessageRouter` | canonical `node_endpoints` data, ingress-normalized bootstrap inputs, transport-observed endpoint evidence | `canonical_endpoint_authority`, `ingress_normalized_endpoint`, `observed_transport_endpoint` | bootstrap registration, heartbeat/publication routing, reconnect planning, diagnostics | raw `node_address` and observed transport addresses must not overwrite canonical peer identity once ingress normalization completes | endpoint-resolution diagnostics, reconnect traces, node-endpoint regression tests |
| Replica-operation visibility read contract | `ReplicaOperationRepository.queryIncompleteOperations(...)` and `queryAuthoritativeOperationVisibilityObservation(...)` | cache-visible `replica_operations` rows, owner-RPC visibility reads, deferred retry hints | visibility modes `cache_only`, `cache_preferred_sql_fallback`, `owner_rpc_required`; observation states `present`, `empty`, `deferred` | timeout recovery, priority recovery rediscovery, planner admission, operation diagnostics | callers must not rebuild these modes from boolean bags or treat cache-empty visibility as terminal absence when deferred visibility is active | incomplete-operation observation state, retry-after hints, authoritative visibility sources, repository/recovery regression tests |
| Rebalancer concurrent-budget read mode | `RebalanceCoordinator.resolveConcurrentBudgetReadMode(...)` | cache counts, priority-partition classification, saturation recheck evidence | `cache_only`, `owner_rpc_recheck_on_saturation` | add/replace/remove admission, priority recovery serial gates, planner diagnostics | callers must not reintroduce `preferAuthoritativeCount` or perform their own saturation fallback outside the coordinator contract | concurrent-budget admission traces, serial-gate diagnostics, coordinator/rebalancer regression tests |
| Node-state recovery publication | `NodeJoiningService.sendControlPlaneNodeStateUpdate(...)`, `ReplicaDispatchService.deferNodeStateUpdateRetry(...)`, and `MessageRouter` pending replacement | latest heartbeat-only node-state payload per target/node owner key, deferred retry slot per node, retry-after budget, transport pending replacement evidence | deferred recovery publication plus heartbeat-only pending replacement on `node_state_update:<target>:<node>` | node-joining recovery publication, replica-dispatch retry replay, transport diagnostics | callers must not let repeated heartbeat-only `NODE_STATE_UPDATE` deliveries accumulate in the pending queue when one owner slot already represents the latest semantic update | node-state deferred retry maps, router pending replacement results, queue source summaries, retry-after diagnostics |
| Structured deferred owner outcomes | `OwnerContractOutcome` carried by `ControlPlaneMutationReadiness`, `ControlPlaneSystemTableGateway`, `PriorityRecoveryCompletion`, and deferred-preserving harness consumers | readiness snapshot runtime authority, recovery assessment/planner state, retry-after hints, visibility outcome, owner-specific reason/evidence fields | `contractState` (`ready`, `pending`, `deferred`, `blocked`, `failed`) plus `nextAction` (`proceed`, `wait`, `retry`, `stop`); owner-specific fields such as `outcome`, `completionState`, `reasonCodes`, `retryAfterMs`, `runtimeAuthority`, `visibilityState`, and `allowTemporaryOverflowPromotion` remain evidence | gateway ingress, SQL DML, admin adapters, harness preparation helpers, diagnostics/report consumers | callers must not branch on timeout-only silence, `[]`, `null`, or raw phase/evidence when the canonical contract already answers the next legal move | contract-state/next-action fields in admin replies, harness traces, failure bundles, triage summaries, and owner-path regression tests |
| Strict CDC recovery ingress | `MessageGroupForwardingOwner.resolveCdcIngressDecision(...)` with `MessageGroupStrictCdcRecoveryRouting` | live raft leadership, strict-forward target selection, system-table recovery-routing snapshot, connected forward candidates, local system-table write availability | ingress decision states `local_raft_leader`, `forward_non_strict`, `forward_strict_target`, `forward_strict_recovery_target`, `local_strict_convergence_ingress`, `local_strict_recovery_ingress`, `defer_ingress_not_initialized`, `defer_strict_target_unknown` plus recovery-routing state `none`, `remote_targets_available`, `local_only` | `canAcceptCDCEvent`, metadata-ingress readiness, strict CDC apply/forward execution, bootstrap/join CDC propagation | callers must not treat strict leader-target loss as immediate dead-end when recovery-owned remote candidates or bounded local system-table ingress still exist; callers must not widen non-strict CDC or bypass the forwarding owner with ad hoc local writes | message-group service decision snapshots, deferred retry hints, recovery-routing diagnostics in focused strict-CDC regressions |
| Canonical convergence diagnostics | report and bundle generation as consumers, not semantic owners | canonical harness snapshots already attached to scenario diagnostics | emitted derived views over canonical snapshots: histograms, dominant reasons, per-node convergence evaluations | `report-writer`, `failure-bundle`, triage markdown/json, admin report readers | report generation must not invent a second state vocabulary or drop the owner snapshot while preserving only symptom counters | triage summary `partitioning.*`, failure-bundle partitioning section, report detail payloads |
