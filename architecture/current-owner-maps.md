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

## Runtime Grammar Hierarchy

The current active target hierarchy for runtime coherence work is defined in
[runtime-grammar-hierarchy.md](./runtime-grammar-hierarchy.md).

The layer order is:

1. `intent`
2. `authority`
3. `actuation`
4. `conditions`
5. `decision`
6. `presentation`

The important active rule is:

- `decision` is the first layer allowed to answer canonical current meaning
- `presentation` may summarize `decision`, but must not invent new runtime
  meaning
- the current pilot slice is priority recovery under load

## Core Ownership Assignments

The current concrete ownership map is:

- Node state -> `NodeLifecycleStateMachine`
- Replica state -> `ReplicaStateMachine`
- Epoch -> `config.current_epoch` via CDC
- Placement planning -> `MovePlanner`
- Operation lifecycle -> `OperationWorkflowOwner` owns
  `operation_progress`; `RebalanceCoordinator` remains the writer of
  owner-managed `replica_operations` workflow fields.
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
- `OperationWorkflowOwner` is the single writer for `operation_progress`.
  Publication owner, startup active-gate owner, diagnostics, and harness
  observers consume its persisted outcome/event projection and must not
  re-derive operation progress from topology step fields, publication
  symptoms, or snapshot coverage.

## Operation Progress Owner File Map

- Resource: `operation_progress`
- Semantic owner and writer: `OperationWorkflowOwner`
- FSM/resource schema and single advance function:
  `src/rebalancer/operation-lifecycle.js`
- Persisted resource load, compare-and-swap, and event-log storage:
  `src/rebalancer/operation-progress-store.js`
- Lifecycle event definitions, append helpers, and event projection:
  `src/rebalancer/operation-progress-events.js`
- Read-only projections for diagnostics, gates, and tests:
  `src/rebalancer/operation-progress-observer.js`
- Runtime ingress orchestration:
  `src/rebalancer/operation-workflow-owner-adapter.js`
- Effect command adapter:
  `src/rebalancer/operation-workflow-owner-effects.js`
- Owner port executor boundary:
  `src/rebalancer/operation-workflow-owner-ports.js`
- Compatibility entry point for existing workflow decision callers:
  `src/rebalancer/operation-workflow-owner-decision.js`
- Runtime evidence normalizer:
  `src/rebalancer/operation-workflow-owner-evidence.js`
- Observation rule: publication, active-gate, readiness, diagnostics, and
  harness code may project from `operation_progress` events/outcomes but must
  not write lifecycle state or infer lifecycle progress from symptom metrics.
- Retired source vocabulary is not operation lifecycle authority. Current
  diagnostics and gates consume `operation_progress.resource`,
  `operation_progress.state`, `operation_progress.lastAcceptedEventId`, and
  event projections. Historical report adapters may render old fields only as
  presentation-only compatibility, outside lifecycle decision code.

## Rebalancer Segment Removal Ledger

The following ordinal files are allowlisted temporary compatibility wrappers.
They may not implement or import the `operation_progress` resource/FSM/store
path. New operation-progress runtime work must land in the named owner files
listed above.

| Legacy file | Classification | Replacement owner file | Deletion condition |
| --- | --- | --- | --- |
| `src/rebalancer/operation-workflow-owner-segment-1.js` | temporary compatibility wrapper | `src/rebalancer/operation-workflow-owner.js`, `src/rebalancer/operation-workflow-owner-adapter.js`, `src/rebalancer/operation-workflow-owner-ports.js` | Delete after public construction and workflow owner ingress no longer extend ordinal classes. |
| `src/rebalancer/operation-workflow-owner-segment-2.js` | temporary compatibility wrapper | `src/rebalancer/operation-workflow-owner.js`, `src/rebalancer/operation-workflow-owner-ports.js` | Delete after owner-lane and workflow-coordinator helpers are extracted behind named ports. |
| `src/rebalancer/operation-workflow-owner-segment-3.js` | extract into responsibility-named module | `src/rebalancer/operation-workflow-owner-ports.js` | Delete after transition persistence/recovery helpers are routed through named owner ports. |
| `src/rebalancer/operation-workflow-owner-segment-4.js` | extract into responsibility-named module | `src/rebalancer/operation-workflow-owner-ports.js` | Delete after dispatch wake and retry helpers move behind named effect ports. |
| `src/rebalancer/operation-workflow-owner-segment-5-stage-1.js` | extract into responsibility-named module | future `src/rebalancer/priority-publication-safety.js` | Delete after priority publication safety evidence is extracted and callers import the named module. |
| `src/rebalancer/operation-workflow-owner-segment-5-stage-2.js` | extract into responsibility-named module | future `src/rebalancer/priority-publication-safety.js` | Delete after replica-row safety merge reads are owned by the named safety module. |
| `src/rebalancer/operation-workflow-owner-segment-5-stage-3.js` | extract into responsibility-named module | future `src/rebalancer/priority-publication-safety.js` | Delete after leader/follower source-removal safety snapshots move to the named safety module. |
| `src/rebalancer/operation-workflow-owner-segment-5-stage-4.js` | extract into responsibility-named module | future `src/rebalancer/priority-publication-handoff.js` | Delete after remove-safety handoff continuation behavior moves to the named handoff module. |
| `src/rebalancer/operation-workflow-owner-segment-5-stage-5.js` | extract into responsibility-named module | future `src/rebalancer/priority-recovery-observation.js` | Delete after priority recovery observation selection moves to the named observation module. |
| `src/rebalancer/operation-workflow-owner-segment-5-stage-shared.js` | temporary compatibility wrapper | future `src/rebalancer/priority-publication-safety.js` | Delete after stage-shared constants are collapsed into named safety/observation modules. |
| `src/rebalancer/operation-workflow-owner-segment-5.js` | temporary compatibility wrapper | future `src/rebalancer/priority-publication-safety.js` | Delete after segment-five public imports point at the named safety module. |
| `src/rebalancer/operation-workflow-owner-segment-6.js` | extract into responsibility-named module | future `src/rebalancer/priority-recovery-superseded-target.js` | Delete after superseded-target and remove-safety participation decisions move to named modules. |
| `src/rebalancer/operation-workflow-owner-segment-7-stage-1.js` | extract into responsibility-named module | future `src/rebalancer/operation-workflow-recovery-observation.js` | Delete after observed target-progress routing moves to the named recovery observation module. |
| `src/rebalancer/operation-workflow-owner-segment-7-stage-2.js` | extract into responsibility-named module | future `src/rebalancer/operation-workflow-recovery-reconcile.js` | Delete after reconciled status resolution and target admission move to the named reconcile module. |
| `src/rebalancer/operation-workflow-owner-segment-7-stage-3.js` | extract into responsibility-named module | future `src/rebalancer/operation-workflow-recovery-drain.js` | Delete after executor outcome and drain release decisions move to the named drain module. |
| `src/rebalancer/operation-workflow-owner-segment-7-stage-4.js` | extract into responsibility-named module | future `src/rebalancer/operation-workflow-recovery-drain.js` | Delete after priority recovery drain owner decisions move to the named drain module. |
| `src/rebalancer/operation-workflow-owner-segment-7-stage-5.js` | extract into responsibility-named module | `src/rebalancer/operation-workflow-owner-adapter.js`, future `src/rebalancer/operation-workflow-recovery-reconcile.js` | Delete after priority recovery re-entry uses `operation_progress` projections and named reconcile modules only. |
| `src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js` | temporary compatibility wrapper | future `src/rebalancer/operation-workflow-recovery-reconcile.js` | Delete after stage-shared recovery constants are collapsed into named recovery modules. |
| `src/rebalancer/operation-workflow-owner-segment-7.js` | temporary compatibility wrapper | future `src/rebalancer/operation-workflow-recovery-reconcile.js` | Delete after segment-seven public imports point at named recovery modules. |
| `src/rebalancer/rebalance-coordinator-segment-1.js` | temporary compatibility wrapper | `src/rebalancer/rebalance-coordinator.js` | Delete after coordinator construction imports no ordinal classes. |
| `src/rebalancer/rebalance-coordinator-segment-2.js` | extract into responsibility-named module | future `src/rebalancer/rebalance-operation-admission.js` | Delete after operation admission and planning helpers move to named coordinator modules. |
| `src/rebalancer/rebalance-coordinator-segment-3.js` | extract into responsibility-named module | future `src/rebalancer/rebalance-operation-dispatch.js` | Delete after dispatch orchestration enters named coordinator modules and owner ports. |
| `src/rebalancer/rebalance-coordinator-segment-4.js` | extract into responsibility-named module | future `src/rebalancer/rebalance-operation-reconcile.js` | Delete after reconciliation and timeout helpers move to named coordinator modules. |
| `src/rebalancer/rebalance-coordinator-segment-5.js` | temporary compatibility wrapper | `src/rebalancer/rebalance-coordinator.js` | Delete after the top-level coordinator class composes named modules directly. |
| `src/rebalancer/unified-rebalancer-segment-1.js` | temporary compatibility wrapper | `src/rebalancer/unified-rebalancer.js` | Delete after unified rebalancer construction imports no ordinal classes. |
| `src/rebalancer/unified-rebalancer-segment-2.js` | extract into responsibility-named module | `src/rebalancer/move-planner.js` | Delete after placement planning helpers consume `MovePlanner` directly. |
| `src/rebalancer/unified-rebalancer-segment-3.js` | extract into responsibility-named module | future `src/rebalancer/replica-operation-status-projection.js` | Delete after replica-operation progress/status projection moves to the named projection module. |
| `src/rebalancer/unified-rebalancer-segment-4-stage-1.js` | extract into responsibility-named module | future `src/rebalancer/rebalance-health-evaluation.js` | Delete after health/admission stage-one helpers move to the named evaluation module. |
| `src/rebalancer/unified-rebalancer-segment-4-stage-2.js` | extract into responsibility-named module | future `src/rebalancer/rebalance-health-evaluation.js` | Delete after health/admission stage-two helpers move to the named evaluation module. |
| `src/rebalancer/unified-rebalancer-segment-4-stage-3.js` | extract into responsibility-named module | future `src/rebalancer/rebalance-health-evaluation.js` | Delete after health/admission stage-three helpers move to the named evaluation module. |
| `src/rebalancer/unified-rebalancer-segment-4-stage-4.js` | extract into responsibility-named module | future `src/rebalancer/rebalance-health-evaluation.js` | Delete after health/admission stage-four helpers move to the named evaluation module. |
| `src/rebalancer/unified-rebalancer-segment-4-stage-5.js` | extract into responsibility-named module | future `src/rebalancer/rebalance-health-evaluation.js` | Delete after health/admission stage-five helpers move to the named evaluation module. |
| `src/rebalancer/unified-rebalancer-segment-4-stage-shared.js` | temporary compatibility wrapper | future `src/rebalancer/rebalance-health-evaluation.js` | Delete after shared health/admission constants move to the named evaluation module. |
| `src/rebalancer/unified-rebalancer-segment-4.js` | temporary compatibility wrapper | future `src/rebalancer/rebalance-health-evaluation.js` | Delete after segment-four public imports point at the named evaluation module. |
| `src/rebalancer/unified-rebalancer-segment-5.js` | temporary compatibility wrapper | `src/rebalancer/unified-rebalancer.js` | Delete after the top-level unified rebalancer class composes named modules directly. |

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
11. `PriorityRecoveryPartitionObservation`
   - owned by `src/control-plane/priority-recovery-snapshot.js`
   - derives one partition observation contract from:
     - workflow-bearing `replica_operations` rows and timeline evidence
     - visibility evidence carried by the shared snapshot surface
     - spread/admission/publication convergence state
   - emits one explicit three-axis view:
     - `workflowState`: `none`, `in_flight`, `remove_phase`, `terminal`
     - `visibilityState`: `none`, `cache_visible`, `deferred`, `unknown`
     - `convergenceState`: `converged`,
       `spread_satisfied_in_flight`, or `spread_gap`
   - also emits provenance:
     - `capturedAt`
     - `workflowSource`
     - `timelineSource`
     - `semanticSource`
   - is shared by admin/control-snapshot diagnostics and harness witness
     construction so those consumers do not merge workflow truth, visibility
     lag, and convergence state back into one local semantic guess
12. `PriorityRecoveryObservationSnapshot`
   - owned by `src/control-plane/priority-recovery-observation-snapshot.js`
   - derives one canonical observation contract from:
     - `PriorityRecoveryDecisionSnapshot` partition evidence
     - publication convergence and recovery-gate state
     - active-gate progress, blocker history, and closure witness evidence
     - projection diagnostics and invariant summaries
   - emits one shared diagnostics-only envelope:
     - publication/recovery protocol state
     - canonical reason codes and gate reasons
     - blocked versus unresolved partition views
     - per-partition witness snapshots, blocker history, and semantic-state
       history
   - is shared by readiness, admin/control-snapshot surfaces, scenario
     retained diagnostics, cluster wait/error shaping, failure bundles,
     playback artifacts, and report generation so those consumers do not
     reconstruct priority-recovery meaning from partial snapshots or collapse
     deferred evidence into `null`, `[]`, or `0`
   - live/runtime consumers must consume explicit
     `semanticState` / `semanticStateId` or the decision-layer
     `partitionIdsBySemanticState` index when that contract is present;
     bounded semantic-state inference remains only for legacy retained
     artifacts that predate the decision-layer contract
13. `PriorityRecoveryDecisionSnapshot`
   - owned by `src/control-plane/priority-recovery-snapshot.js` and exposed at
     runtime through
     `OperationWorkflowOwner.getPriorityRecoveryDecisionSnapshotForOperation(...)`
     and
     `OperationWorkflowOwner.getPriorityRecoveryDecisionSnapshotForPartitionOperations(...)`
   - reuses one existing composed envelope:
     `completion`,
     `observation`,
     `actuation`,
     `progress`,
     `semanticState`,
     `spreadCompletion`,
     `admission`,
     `publication`,
     `coordinator`,
     and `blockerReasons`
   - keeps terminal workflow semantics for completed follow-up `ADD`
     operations while still counting an eligible operational target as
     spread-satisfying evidence, so consumers do not reopen a synthetic
     rebalancer-handoff stall from the same snapshot
   - emits one actuation contract:
     `no_action_needed`,
     `action_required`,
     `persisted_not_dispatched`,
     `dispatched_waiting_progress`,
     `transition_deferred`,
     `terminal_completed`,
     or `terminal_failed`
   - is now shared by runtime add-budget and priority remove-safety consumers,
     and feeds the canonical priority-recovery observation snapshot so touched
     runtime and reporting paths do not rebuild completion from planning
     snapshots, projection cohorts, or stale publication math
14. `OwnerContractOutcome`
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
15. `MessageGroupStrictCdcRecoveryRouting`
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
16. `ControlPlaneWriteHealth`
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
17. `StartupWorkflowStore`
   - owned by `src/bootstrap/startup-workflow-store.js` with
     `JoinSessionStore` and `SeedStartupSessionStore` as boundary-specific
     wrappers
   - derives one durable startup workflow record from:
     - workflow kind plus node/session identity
     - checkpoint and phase progression
     - retryability, terminal outcome, and failure details
     - attempt accounting and timestamps
   - emits one workflow status: `active`, `failed_retryable`,
     `failed_terminal`, or `completed`
   - is shared by `StartupPipelineRunner.runWorkflow(...)`, join startup, and
     seed bootstrap so resume and failure meaning come from one persisted
     contract instead of local phase reconstruction
18. `StartupAuthoritySnapshot`
   - owned by
     `src/control-plane/startup-authority-snapshot-owner.js` and served
     through `ControlPlaneReadinessService.getStartupAuthoritySnapshot...`
   - derives one startup-authority snapshot from:
     - planning snapshots
     - publication observation
     - priority-partition recovery state
     - target participation and failure reason evidence
   - emits one startup-authority state: `ready`, `recovery_pending`,
     `seed_locally_ready_unpublished`, `authority_unavailable`, or `blocked`
   - is shared by startup recovery, bootstrap cluster view, bootstrap
     readiness, and join readiness so those consumers do not rebuild startup
     authority from local cache rows or phase-specific booleans
19. `StartupRuntimeHandoffOwner`
   - owned by `src/bootstrap/owners/startup-runtime-handoff-owner.js` with
     `activateSteadyStateRuntimeHandoff(...)` and
     `attachSqlRuntimeToStartupOwner(...)` as the canonical handoff helpers
   - derives one startup-to-runtime handoff contract from:
     - metadata publication readiness
     - control-plane background writer activation
     - CDC/runtime SQL engine upgrade
     - deferred recovery and latency-topology activation
   - emits one owner-controlled activation path for steady-state writers,
     runtime SQL wiring, deferred recovery, and post-bootstrap topology
   - is shared by seed bootstrap and join finalization so runtime handoff no
     longer depends on duplicated tail orchestration at phase completion
20. `PriorityRecoveryProgressContract`
   - owned by `src/control-plane/priority-recovery-snapshot.js`
   - extends the existing
     `PriorityRecoveryDecisionSnapshot`
     instead of creating a second owner surface
   - derives one explicit liveness/handoff contract from:
     - `PriorityRecoveryCompletion`
     - `PriorityRecoveryPartitionObservation`
     - existing blocker reasons and semantic-state evidence
     - operation `updatedAt` / `completedAt` timestamps already owned by the
       workflow/coordinator path
     - workflow-step age and timeout evidence reused from the existing
       workflow-owner / `ReplicaOperationLiveness` path
     - the shared `OwnerContractOutcome` vocabulary for
       `contractState` and `nextAction`
   - emits one contract:
     `PriorityRecoveryProgressContract { contractState, nextAction, currentOwner, nextRequiredAction, blockingBoundary, waitMode, workflowProgressPhaseId, stepAgeMs, stepTimeoutMs, lastProgressAtMs, retryAfterMs, evidenceSourceIds }`
   - keeps terminal prior-operation evidence in
     `workflowProgressPhaseId`,
     `lastProgressAtMs`,
     and related observation fields,
     but `actuation.state = terminal_completed` is only valid when the same
     snapshot no longer requires a new recovery action
   - is shared by priority-recovery observation snapshots and later
     admin/harness/reporting consumers so the touched path can discuss
     owner handoff, blocked-next-progress, and timeout-reconcile-due workflow
     waits without rebuilding meaning from partial workflow, visibility, or
     planner evidence
21. `SeedStartupCheckpointSnapshot`
   - owned by `BootstrapService.buildSeedStartupCheckpointSnapshot()`
   - derives one explicit seed-startup checkpoint snapshot from:
     - local router/runtime handler wiring
     - message-group and partition service creation
     - cache hydration and local endpoint publication
     - steady-state runtime handoff and background-writer activation
   - emits one checkpoint satisfaction view keyed by
     `SEED_STARTUP_CHECKPOINT`
   - is shared by seed rerun guards and finalization checks so bootstrap no
     longer infers checkpoint truth from raw object-existence branches or
     `phase` alone
22. `CanonicalJoinReadinessAttempt`
   - owned by `JoinReadinessEvaluator.collectCanonicalJoinReadinessAttempt()`
     with blocked-action resolution in
     `resolveCanonicalJoinBlockedAction(...)`
   - derives one join-readiness attempt contract from:
     - the canonical readiness snapshot
     - the evaluated readiness state and reasons
     - one explicit blocked-action plan for the touched repair path
     - timeout-shaping metadata
   - emits one grouped attempt:
     `{ snapshot, snapshotError, evaluation }`
     plus blocked action
     `none` or `repair_topology_visibility`
   - is shared by the convergence wait loop, repair path, and timeout
     diagnostics so join readiness does not merge snapshot, repair, waiter,
     and timeout semantics back into one boundary
23. `RebalancePlanningGateDecision`
   - owned by `UnifiedRebalancerSegment5.resolveCheckRebalanceGateDecision()`
   - derives one planning-gate decision from:
     - cluster-readiness confirmation
     - start-delay and stabilization cadence
     - topology-settling and traffic/local-serve readiness
     - local mutation readiness, priority spread, and transport backpressure
   - emits one explicit planning result:
     `decision=defer_planning`,
     `nextAction=schedule_retry`,
     `gate`,
     `blocker`,
     `logLevel`,
     `scheduleMode`,
     and `scheduleDelayMs`
   - is shared by periodic checks and the legacy blocker facade so logging and
     cadence reuse one gate contract instead of becoming a second implicit
     admission grammar
24. `LocalDispatchHandlerCapability`
   - owned by
     `ReplicaDispatchServiceSegment4.resolveLocalHandlerCapabilityAddress()`
     and `hasHandlerOnTarget(...)`
   - derives one same-node execution-capability contract from:
     - canonical local router registration keyed by handler address
     - `services` row visibility as the steady-state fallback
   - emits one bounded local capability answer for partition,
     message-group, and runtime-service dispatch
   - is shared by same-node dispatch readiness and ready-node retry reuse so
     local dispatch does not self-deadlock waiting for its own `services` row
     to reach `ACTIVE`
25. `MembershipPublicationPlanningEvidenceUnion`
   - owned by `MembershipPublicationCoordinator.readTableRows(...)` when the
     read profile is membership-publication planning
   - derives one planning row set for key-stable topology tables from:
     - authoritative owner-read rows
     - cache-projected owner rows
     - per-row freshness fields such as `updated_at`, heartbeat, lease, and
       storage-budget timestamps
   - emits one merged planning evidence snapshot for `nodes`,
     `node_endpoints`, `partitions`, and `services`
   - is shared by membership-publication candidate derivation and metadata-only
     publication refresh, while diagnostics reads retain the explicit strict
     authoritative owner-read contract
   - prevents a successful but stale authoritative read from suppressing
     fresher owner-owned projection rows during priority-spread recomputation
26. `PriorityRecoveryVisibilityProgressWakeup`
   - owned by
     `UnifiedRebalancer.buildPriorityRecoveryVisibilityRebalanceDecision(...)`
     and `handlePriorityRecoveryVisibilityEvent(...)`
   - derives one visibility-progress decision from:
     - CDC table identity
     - priority-partition classification
     - active partition-service row evidence
     - local rebalancer leadership when enqueueing runtime work
   - emits the canonical `priority_recovery_progress` reconcile reason for
     both rebalancing and membership-publication reconciliation
   - is shared by critical CDC event handling and publication refresh wakeup so
     spread-changing service visibility no longer depends on a periodic timer
     or on diagnostics repairing stale publication metadata
27. `ReplicaRemovalDurableCleanup`
   - owned by `ReplicaHandler.reconcileRemovedReplicaCleanup(...)`
   - derives one idempotent removal cleanup contract from:
     - local replica lifecycle state
     - canonical partition `services` row ownership
     - optional tracked local runtime service cleanup
   - emits one durable cleanup action through
     `PartitionServiceRowOwner.removeReplica(...)` before an already-removed
     partition replica can complete a remove request
   - is shared by REPLACE source-removal replay and priority control-plane
     recovery so local `REMOVED` state does not bypass durable service truth
     when the cache misses a stale service row

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
5. `PublicationScopedConsistencyComparison`
   - owned by `assertConsistency(...)` and
     `assertConsistencyFromSnapshots(...)` in
     `test/distributed/harness/assertions-segment-3.js`
   - derives one canonical final-consistency contract from:
     - canonical control-snapshot `leaders`
     - published membership / authoritative active-node view
     - partition set
     - publication-recovery gate readiness from control-plane diagnostics
   - emits one explicit comparison grammar:
     - membership/partition mismatch
     - publication-recovery gate not ready
     - publication epoch mismatch
     - strict leader mismatch
   - is shared by live node-query convergence waits and pre-collected snapshot
     assertions so the harness does not compare observer-local leader maps
     before the publication-recovery owner says strict agreement is ready
6. `PublicationEvidenceReplay`
   - owned by `test/distributed/harness/publication-evidence-replay.js`
   - adapts `failure-bundle.json` plus the latest `snapshots.ndjson` topology
     rows into the runtime
     `deriveMembershipPublicationCandidate(...)` publication derivation
   - emits a diagnostic-only durable-vs-replayed priority-spread comparison
   - is shared by local failed-run triage and future work-package analysis so
     the harness can identify stale publication summaries without inventing a
     second publication-planning grammar or rerunning the scenario

Harness load work should extend these shared admission, convergence, and
availability contracts before adding more scheduler-local booleans or retry
heuristics.

## Active Boundary Catalog

| Boundary | Semantic owner | Canonical evidence | Canonical vocabulary | Allowed consumers | Prohibited reinterpretation | Primary diagnostics |
| --- | --- | --- | --- | --- | --- | --- |
| Benchmark load admission | `Cluster.resolveBenchmarkLoadAdmissionSnapshot(...)` | table-local discovery readiness, load-lane admission result, local replica role/voter readiness, degradation evidence, retry hint | `local_ready`, `routed_ready`, `local_blocked`, `discovery_pressured`, `gate_blocked`, `unavailable` with `reasonCodes`, `discoveryReasonCodes`, `loadLaneReasonCodes`, `retryAfterMs` | `Cluster.resolveBenchmarkReadyLoadNodes(...)`, `BenchmarkPartitionConvergence`, harness diagnostics | callers must not treat routed admission as proof of local usability; callers must not collapse retryable pressure into plain exclusion; hard load-lane serve admission must not reject from a reused cached ineligible readiness snapshot when authoritative refresh is available | admission-ready node ids, readiness histogram, per-node reason codes and retry hints |
| Usable benchmark spread | `BenchmarkPartitionConvergence` | admission snapshot plus replica-bearing spread for the target table | `ready_replica`, `replica_blocked`, `routed_admission_only`, `absent` plus dispatch contribution `local_primary`, `local_blocked`, `routed_support`, `none` | partitioning planners, timeout diagnostics, triage summaries, failure bundles | raw replica spread count must not be treated as usable split-driving spread; routed support must not be promoted to local-ready contribution | ready-replica node ids, local-primary node ids, routed-support node ids, convergence evaluations |
| Benchmark dispatch contribution | `resolveBenchmarkPartitionDispatchMode(...)` and `LoadNodeAvailability` | convergence snapshot, local cooldown, external admission, in-flight slot age/capacity | `local_ready_only`, `bootstrap_backfill_required`; node availability `ready`, `slot_borrowing`, `local_blocked`, `external_blocked`, `slot_saturated`, `slot_stalled` | `table-distribution-helpers`, `load-generator` | callers must not collapse to bootstrap quorum while the usable-spread target is still short; callers must not keep slot-stalled nodes in capacity budgets; borrowed healthy-node overflow must not be mistaken for fresh local readiness | selected node ids, dispatch contribution histogram, wait-reason counters, per-node availability state |
| Publication-scoped consistency comparison | `assertConsistency(...)` and `assertConsistencyFromSnapshots(...)` | canonical control-snapshot `leaders`, authoritative published membership, partition set, publication-recovery gate readiness | membership mismatch, partition mismatch, `publication_recovery_gate_not_ready`, publication epoch mismatch, strict leader mismatch | `waitForConsistencyConvergence`, scenario final convergence gates, snapshot-based convergence assertions | callers must not synthesize strict leader truth from `replicaRoles` or `replicaRoleDiagnostics`, and must not enforce leader agreement before the publication-recovery gate is ready | consistency mismatch diagnostics, per-node publication-gate summaries, assert-consistency regressions, representative scenario reruns |
| Control-plane write health | `ControlPlaneWriteHealth` | heartbeat publication failures, last publication mode, message-router pressure summary, contained background backlog evidence | `healthy`, `background_backlog_contained`, `critical_write_unhealthy` plus dependency classification `hard` or `soft` | bootstrap/startup readiness, diagnostics, probe consumers | callers must not equate background heartbeat failure churn with true critical control-plane write loss when critical reserve is still available | readiness snapshots, degraded reasons, heartbeat publication diagnostics, transport queue pressure summaries |
| Membership publication authority view | `MembershipPublicationCoordinator` with `AuthoritativeControlPlaneView` as the shared read ingress | latest publication row, latest published row, projected serving membership, retained owner-only reconciliation state | explicit non-overlapping views: `published_authority`, `observed_projection`, `retained_owner_state` | routing, readiness, topology planning, operator diagnostics | callers must not treat observed projection or retained owner state as a second publishable authority surface | publication convergence snapshots, projection diagnostics, recovery-protocol snapshots, membership-publication regression tests |
| Canonical peer endpoint authority | `src/transport/node-address-resolution.js` consumed by `MessageRouter` | canonical `node_endpoints` data, ingress-normalized bootstrap inputs, transport-observed endpoint evidence | `canonical_endpoint_authority`, `ingress_normalized_endpoint`, `observed_transport_endpoint` | bootstrap registration, heartbeat/publication routing, reconnect planning, diagnostics | raw `node_address` and observed transport addresses must not overwrite canonical peer identity once ingress normalization completes | endpoint-resolution diagnostics, reconnect traces, node-endpoint regression tests |
| Replica-operation visibility read contract | `ReplicaOperationRepository.queryIncompleteOperations(...)` and `queryAuthoritativeOperationVisibilityObservation(...)` | cache-visible `replica_operations` rows, owner-RPC visibility reads, deferred retry hints, deferred owner-read completion state | visibility modes `cache_only`, `cache_preferred_sql_fallback`, `owner_rpc_required`; observation states `present`, `empty`, `deferred` | timeout recovery, priority recovery rediscovery, planner admission, operation diagnostics | callers must not rebuild these modes from boolean bags, treat cache-empty visibility as terminal absence when deferred visibility is active, or let cache-visible current-operation rows erase a deferred authoritative owner-read when priority-recovery completion/remove-safety consumes the snapshot | incomplete-operation observation state, retry-after hints, authoritative visibility sources, repository/recovery regression tests |
| Rebalancer concurrent-budget read mode | `RebalanceCoordinator.resolveConcurrentBudgetReadMode(...)` | cache counts, priority-partition classification, saturation recheck evidence | `cache_only`, `owner_rpc_recheck_on_saturation` | add/replace/remove admission, priority recovery serial gates, planner diagnostics | callers must not reintroduce `preferAuthoritativeCount` or perform their own saturation fallback outside the coordinator contract | concurrent-budget admission traces, serial-gate diagnostics, coordinator/rebalancer regression tests |
| Node-state recovery publication | `NodeJoiningService.sendControlPlaneNodeStateUpdate(...)`, `ReplicaDispatchService.deferNodeStateUpdateRetry(...)`, and `MessageRouter` pending replacement | latest heartbeat-only node-state payload per target/node owner key, deferred retry slot per node, retry-after budget, transport pending replacement evidence | deferred recovery publication plus heartbeat-only pending replacement on `node_state_update:<target>:<node>` | node-joining recovery publication, replica-dispatch retry replay, transport diagnostics | callers must not let repeated heartbeat-only `NODE_STATE_UPDATE` deliveries accumulate in the pending queue when one owner slot already represents the latest semantic update | node-state deferred retry maps, router pending replacement results, queue source summaries, retry-after diagnostics |
| Priority-recovery observation snapshot | `buildPriorityRecoveryObservationSnapshot(...)` from readiness/admin emitters and retained harness diagnostics | publication convergence, recovery-gate state, `PriorityRecoveryDecisionSnapshot`, tracked-priority current summary, active-gate witness state, projection diagnostics, invariant summaries | canonical observation snapshot with publication/recovery protocol state, canonical reason codes, tracked blocked and unresolved partition views, retained per-partition witness diagnostics, blocker history, semantic-state history, closure witness, and invariant failures | readiness, admin/control snapshots, scenario retained diagnostics, cluster wait/error shaping, failure bundle, playback/report writers, triage consumers | consumers must not narrow the shared snapshot to scenario-local subsets, recompute semantic state from raw rows, treat retained spread-satisfied witness diagnostics as reopened blocked progress once the current summary is empty, or let witness detail outrank an explicit active publication gate | readiness/admin contract tests, node-join scenario tests, failure-bundle/report-writer regressions, sprint-level harness confirmation |
| Structured deferred owner outcomes | `OwnerContractOutcome` carried by `ControlPlaneMutationReadiness`, `ControlPlaneSystemTableGateway`, `PriorityRecoveryCompletion`, and deferred-preserving harness consumers | readiness snapshot runtime authority, recovery assessment/planner state, retry-after hints, visibility outcome, owner-specific reason/evidence fields | `contractState` (`ready`, `pending`, `deferred`, `blocked`, `failed`) plus `nextAction` (`proceed`, `wait`, `retry`, `stop`); owner-specific fields such as `outcome`, `completionState`, `reasonCodes`, `retryAfterMs`, `runtimeAuthority`, `visibilityState`, and `allowTemporaryOverflowPromotion` remain evidence | gateway ingress, SQL DML, admin adapters, harness preparation helpers, diagnostics/report consumers | callers must not branch on timeout-only silence, `[]`, `null`, or raw phase/evidence when the canonical contract already answers the next legal move | contract-state/next-action fields in admin replies, harness traces, failure bundles, triage summaries, and owner-path regression tests |
| Strict CDC recovery ingress | `MessageGroupForwardingOwner.resolveCdcIngressDecision(...)` with `MessageGroupStrictCdcRecoveryRouting` | live raft leadership, strict-forward target selection, system-table recovery-routing snapshot, connected forward candidates, local system-table write availability | ingress decision states `local_raft_leader`, `forward_non_strict`, `forward_strict_target`, `forward_strict_recovery_target`, `local_strict_convergence_ingress`, `local_strict_recovery_ingress`, `defer_ingress_not_initialized`, `defer_strict_target_unknown` plus recovery-routing state `none`, `remote_targets_available`, `local_only` | `canAcceptCDCEvent`, metadata-ingress readiness, strict CDC apply/forward execution, bootstrap/join CDC propagation | callers must not treat strict leader-target loss as immediate dead-end when recovery-owned remote candidates or bounded local system-table ingress still exist; callers must not widen non-strict CDC or bypass the forwarding owner with ad hoc local writes | message-group service decision snapshots, deferred retry hints, recovery-routing diagnostics in focused strict-CDC regressions |
| Startup workflow durability | `StartupPipelineRunner.runWorkflow(...)` with `JoinSessionStore` and `SeedStartupSessionStore` | durable workflow record, checkpoint sequence, retryability, failure details, terminal state, timestamps | workflow statuses `active`, `failed_retryable`, `failed_terminal`, `completed` plus checkpoint/phase identity | `JoinCoordinator`, `NodeJoiningService`, `BootstrapService`, cleanup/report consumers, focused startup tests | callers must not rebuild startup progress from local phase strings or hidden post-pipeline tail work when the durable workflow record already answers checkpoint, failure, and resume state | join/seed session store tests, startup pipeline runner tests, bootstrap/join checkpoint characterization |
| Startup authority snapshot | `ControlPlaneReadinessService.getStartupAuthoritySnapshot...` backed by `startup-authority-snapshot-owner.js` | planning snapshot, publication observation, priority recovery evidence, target participation, failure reason | startup-authority states `ready`, `recovery_pending`, `seed_locally_ready_unpublished`, `authority_unavailable`, `blocked` plus canonical startup node ids and publication descriptors | bootstrap readiness, startup recovery, bootstrap cluster view, join readiness, diagnostics | consumers must not infer startup authority from cache-local `nodes` rows, direct publication-status booleans, or phase-local fallback ladders once the canonical snapshot is available | startup-authority consumption tests, readiness diagnostics, recovery-protocol traces |
| Startup runtime handoff | `StartupRuntimeHandoffOwner` with `activateSteadyStateRuntimeHandoff(...)` and `attachSqlRuntimeToStartupOwner(...)` | metadata-publication readiness, background-writer activation state, runtime SQL engine, CDC integration state, deferred recovery activation | one owner-controlled handoff path for background writers, runtime SQL/CDC upgrade, deferred recovery, and latency-topology start | seed/bootstrap finalization, join finalization, startup runtime diagnostics | callers must not duplicate post-phase runtime wiring or activate deferred recovery ahead of the handoff owner contract | startup-runtime-handoff-owner tests, startup-sql-runtime-handoff tests, bootstrap/join finalization regressions |
| Canonical convergence diagnostics | report and bundle generation as consumers, not semantic owners | canonical harness snapshots already attached to scenario diagnostics | emitted derived views over canonical snapshots: histograms, dominant reasons, per-node convergence evaluations | `report-writer`, `failure-bundle`, triage markdown/json, admin report readers | report generation must not invent a second state vocabulary or drop the owner snapshot while preserving only symptom counters | triage summary `partitioning.*`, failure-bundle partitioning section, report detail payloads |
| Harness failing-barrier precedence | scenario barrier sequence plus owner snapshots attached to diagnostics | thrown barrier phase, canonical owner snapshots, retained playback observations | barrier phases `active_gate`, `convergence`, `quiescence`, `consistency` with owner-state evidence as contributors | `failure-bundle`, triage markdown/json, report generation, sprint blocker migration notes | retained readiness, publication, priority-recovery, or snapshot evidence must not outrank the barrier that actually threw once the earlier owner gate is closed | failure-classification dominant reason, barrier signal, latest rolling-restart replay proof |
