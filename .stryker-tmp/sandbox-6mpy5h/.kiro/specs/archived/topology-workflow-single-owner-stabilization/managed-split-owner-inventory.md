# Managed Split Owner Inventory

## Task 2.2 — Enumerate every component advancing managed split state and map phase ownership

### Split Lifecycle Phases (from `PARTITION_TRANSITION_STATE`)

| Phase | Constant | Meaning |
| --- | --- | --- |
| Admission pending | `ADMISSION_PENDING` | Split requested, awaiting capacity check |
| Blocked | `BLOCKED` | Admission denied (hard) |
| Deferred | `DEFERRED` | Admission denied (soft, retryable) |
| Preparing | `SPLIT_PREPARING` | Admission passed, split plan built, child metadata being inserted |
| Backfilling | `SPLIT_BACKFILLING` | Child partitions provisioned, source snapshot being replicated |
| Catch-up | *(process-local only: `'split_catchup'`)* | Snapshot complete, queued writes being flushed |
| Cutover active | `SPLIT_CUTOVER_ACTIVE` | Live writes mirrored to children, cutover in progress |
| Failed | `FAILED` | Terminal failure |

Note: there is no `SPLIT_CLEANUP` or `COMPLETED` constant. The lifecycle
currently has no durable cleanup or terminal-success phase.

---

## Components That Advance Split State

### 1. `ManagedSplitWorkflow` — Intended durable owner

**File:** `src/partition/managed-split-workflow.js`

**Phases owned in practice:**

| Phase transition | Mechanism | Durable? |
| --- | --- | --- |
| → `ADMISSION_PENDING` | `workflowCoordinator.registerWorkflow()` → `persistWorkflowTransition()` | Yes — writes `tables.partition_transition_state` + `partition_transition_metadata` |
| → `BLOCKED` / `DEFERRED` | `workflowCoordinator.updateWorkflow()` → `persistWorkflowTransition()` | Yes |
| → `SPLIT_PREPARING` | `workflowCoordinator.updateWorkflow()` → `persistWorkflowTransition()` | Yes |
| Child metadata insertion | `insertPartitionMetadataAtomically()` → `DistributedTransactionCoordinator` (when wired) or sequential fallback | Yes — inserts `partitions` rows |
| Child provisioning | `provisionInitialTablePartition()` (delegated to `SQLQueryEngine`) | Yes — creates `replica_operations` + `services` rows |
| → `SPLIT_BACKFILLING` | `workflowCoordinator.updateWorkflow()` → `persistWorkflowTransition()` | Yes |
| Trigger source replication | `startSplitReplicationOnSourcePartition()` (delegated to `SQLQueryEngine` → message to `PartitionService`) | Fire-and-forget message |
| → `FAILED` | `persistExecutionFailure()` → `workflowCoordinator.updateWorkflow()` | Yes |

**What it does NOT own:**

- Backfill execution (delegated to `PartitionService`)
- Catch-up phase transition (owned by `PartitionService` in process memory)
- Cutover activation (owned by `PartitionService` via system table write)
- Cutover write mirroring (owned by `PartitionService` + `SQLQueryEngine`)
- Cleanup / terminal success (no component owns this today)

**Single-flight mechanism:** Uses `workflowCoordinator.runExclusive(partitionId, ...)`
to prevent concurrent split execution for the same partition.

**Workflow cleanup:** Calls `workflowCoordinator.removeWorkflow()` in the
`finally` block of `executeInternal()`, which means the in-memory workflow
record is discarded after execution completes or fails. The durable state
on the `tables` row persists, but the `DurableWorkflowCoordinator`
in-memory map is cleared.

---

### 2. `PartitionService` — Source-side execution participant (de facto phase owner)

**File:** `src/partition/partition-service.js`

**Phases owned in practice:**

| Phase transition | Mechanism | Durable? |
| --- | --- | --- |
| Accept replication request | `handleStartSplitReplication()` — sets `this.splitReplication.phase = SPLIT_BACKFILLING` | **No** — process-local object |
| Backfill snapshot rows | `backfillSplitSnapshot()` → `applySplitSnapshotRow()` → `routeSplitMirroredWrite()` | Data is durable (written to child partitions), but progress tracking is not |
| → `'split_catchup'` | `runSplitReplicationWorkflow()` sets `splitReplication.phase = 'split_catchup'` | **No** — process-local string assignment |
| Flush queued writes | `flushSplitReplicationQueue()` → `replaySplitEntry()` | Data is durable, progress is not |
| → `SPLIT_CUTOVER_ACTIVE` (system table) | `markSplitCutoverActive()` → `cdcIntegrationService.updateSystemTableRow(TABLES.TABLES, ...)` | **Yes** — writes `tables.partition_transition_state`, `active_partition_version`, `partition_count` |
| → `SPLIT_CUTOVER_ACTIVE` (local) | `splitReplication.phase = SPLIT_CUTOVER_ACTIVE` | **No** — process-local |
| Live write mirroring | `handleSplitReplicationAfterWrite()` → `replaySplitEntry()` / queue | **No** — process-local queue |
| → `'failed'` | `splitReplication.phase = 'failed'` on catch | **No** — process-local |

**Process-local state (`this.splitReplication`):**

```javascript
{
  metadata,                    // split transition metadata (from message)
  phase,                       // 'split_backfilling' | 'split_catchup' |
                               //   'split_cutover_active' | 'failed'
  pendingEntries: [],          // queued write entries awaiting flush
  flushInFlight: false,        // flush concurrency guard
  startedAt: Date.now(),       // start timestamp
  lastError: null,             // last error message
}
```

This entire object is the **only truth** for source-side split progress.
It is not persisted anywhere. If the process restarts, all of this is lost.

**Critical observation:** `PartitionService` directly writes the
`tables.partition_transition_state` to `SPLIT_CUTOVER_ACTIVE` via
`markSplitCutoverActive()`. This is a system table mutation performed by
an execution participant, not by the declared workflow owner
(`ManagedSplitWorkflow`). This violates the single-owner contract
(System Guidelines §1.4.2).

**Additional split-related methods:**

| Method | Role |
| --- | --- |
| `normalizeSplitTransitionMetadata()` | Parses and validates incoming split metadata |
| `isSameSplitReplication()` | Idempotency check for duplicate replication requests |
| `openSplitSnapshotDatabase()` | Opens SQLite snapshot for backfill source |
| `resolveSplitTargetPartitionId()` | Routes rows to left/right child by split key |
| `extractSplitRoutingKey()` | Extracts routing key from write entry |
| `cloneSplitEntry()` | Deep-copies write entries for the pending queue |

---

### 3. `SQLQueryEngine` — Ingress adapter and infrastructure provider

**File:** `src/query/sql-query-engine.js`

**Phases involved in practice:**

| Role | Mechanism | Advances split state? |
| --- | --- | --- |
| Split entry point | `executeManagedSplit()` — thin delegation to `managedSplitWorkflow.execute()` | No — pure delegation |
| `ManagedSplitWorkflow` factory | Constructor creates `ManagedSplitWorkflow` with injected dependencies when none is provided | No — wiring only |
| Split plan computation | `buildManagedSplitPlan()` — calculates median key and child key ranges | No — pure computation, delegated to `ManagedSplitWorkflow` |
| Source replication trigger | `startSplitReplicationOnSourcePartition()` — sends `START_SPLIT_REPLICATION` message via `MessageRouter` to `PartitionService` | No — message delivery only |
| Child partition provisioning | `provisionInitialTablePartition()` — creates replica operations and waits for routable services | Yes — creates `replica_operations` rows (via `RebalanceCoordinator`) |
| Cutover write mirroring | `addTransitionMirrorParticipants()` — reads `tables.partition_transition_state`, adds mirror write participants when `SPLIT_CUTOVER_ACTIVE` | **Yes** — adds distributed write participants that mirror writes to source partition during cutover |
| Cache/metadata waiting | `waitForTablePartitionMetadata()`, `waitForRoutablePartitionService()` | No — polling only |

**Key observation:** `SQLQueryEngine.addTransitionMirrorParticipants()`
reads the `partition_transition_state` from cache and, when it is
`SPLIT_CUTOVER_ACTIVE`, adds a mirror write participant that routes
writes to the source partition. This is a **cache-driven cutover
behavior** — the write mirroring activates based on cache visibility of
the transition state that `PartitionService` wrote directly.

---

### 4. `PartitionSplitMergeManager` — Periodic evaluation and trigger

**File:** `src/partition/partition-split-merge-manager.js`

**Phases involved in practice:**

| Role | Mechanism | Advances split state? |
| --- | --- | --- |
| Periodic evaluation | `startPeriodicEvaluation()` → `evaluateAllPartitions()` | No — evaluates criteria only |
| Split candidate execution | `executeManagedSplitCandidate()` → `executeSplitCandidate()` (wired to `sqlQueryEngine.executeManagedSplit()`) | No — delegates to `ManagedSplitWorkflow` |
| Outcome classification | `classifyManagedSplitExecution()` — reads `execution.state` to classify as success/deferred/error | No — reads only |
| Legacy split plan | `splitPartition()` — computes split plan with key ranges and emits events | No — does not write system tables; used for non-managed splits |

**Classification:** Trigger/evaluator only. Does not advance durable
split state. The `executeSplitCandidate` callback is wired through
`SQLQueryEngine.executeManagedSplit()` → `ManagedSplitWorkflow.execute()`.

---

### 5. `DurableWorkflowCoordinator` — Workflow persistence runtime

**File:** `src/workflow/durable-workflow-coordinator.js`

**Role:** Provides the persistence and single-flight runtime that
`ManagedSplitWorkflow` composes. Maintains an in-memory map of active
workflows and delegates persistence to the `persistWorkflow` callback
(which calls `ManagedSplitWorkflow.persistWorkflowTransition()`).

**Does it advance split state?** Not independently — it is a reusable
runtime. `ManagedSplitWorkflow` calls `registerWorkflow()`,
`updateWorkflow()`, and `removeWorkflow()` to drive transitions.

**Key limitation:** The coordinator's in-memory workflow map is cleared
by `removeWorkflow()` in the `finally` block of `executeInternal()`.
After execution, the coordinator has no memory of the workflow. Recovery
would need to reconstruct from the `tables` row, but no recovery path
currently exists.

---

### 6. `AdminControlSnapshot` — Read-only diagnostics

**File:** `src/admin/admin-control-snapshot.js`

**Role:** Reads `partition_transition_state` and
`partition_transition_metadata` from `SystemTableCache` for diagnostics
snapshots. Does not advance split state.

---

### 7. `TableCreationService` / `SeedRegistrationPhase` — Initial table setup

**Files:** `src/query/table-creation-service.js`,
`src/bootstrap/phases/seed-registration-phase.js`

**Role:** Set `partition_transition_state: null` and
`partition_transition_metadata: null` during initial table creation.
These are not split state transitions — they establish the initial
null state.

---

## Phase Ownership Map

| Split Phase | Durable State Writer | Process-Local State Owner | Gap |
| --- | --- | --- | --- |
| **Admission** (`admission_pending` → `blocked`/`deferred`) | `ManagedSplitWorkflow` via `DurableWorkflowCoordinator` | — | None — fully durable |
| **Preparation** (`split_preparing`) | `ManagedSplitWorkflow` via `DurableWorkflowCoordinator` | — | None — fully durable |
| **Child metadata insertion** | `ManagedSplitWorkflow` via `insertPartitionMetadataAtomically()` | — | Transaction coordinator is optional (sequential fallback exists) |
| **Child provisioning** | `SQLQueryEngine.provisionInitialTablePartition()` (delegated from `ManagedSplitWorkflow`) | — | Provisioning is durable but not tracked as a split workflow participant |
| **Backfilling** (`split_backfilling`) | `ManagedSplitWorkflow` writes the durable phase | `PartitionService.splitReplication.phase` tracks execution progress | **GAP:** Backfill progress (which rows copied, pending queue depth) exists only in process memory |
| **Catch-up** (`'split_catchup'`) | **None** — no durable constant exists | `PartitionService.splitReplication.phase = 'split_catchup'` | **GAP:** Entire phase is process-local. The string `'split_catchup'` is not even in `PARTITION_TRANSITION_STATE` |
| **Cutover activation** (`split_cutover_active`) | `PartitionService.markSplitCutoverActive()` writes `tables` row directly | `PartitionService.splitReplication.phase` | **GAP:** The execution participant (`PartitionService`) writes the durable transition state, not the declared owner (`ManagedSplitWorkflow`) |
| **Cutover write mirroring** | — | `SQLQueryEngine.addTransitionMirrorParticipants()` reads cache; `PartitionService.handleSplitReplicationAfterWrite()` queues/replays | **GAP:** Mirroring activation is cache-driven, not acknowledgement-driven |
| **Cleanup** | **None** | **None** | **GAP:** No cleanup phase exists. No component removes the source partition mirror, clears transition metadata, or marks the split as terminally complete |
| **Failure** (`failed`) | `ManagedSplitWorkflow.persistExecutionFailure()` | `PartitionService.splitReplication.phase = 'failed'` | Partial — `ManagedSplitWorkflow` persists failures during its execution scope, but `PartitionService` failures are process-local only |

---

## Process-Local State That Is the Only Truth

| State | Location | What is lost on restart |
| --- | --- | --- |
| `splitReplication.phase` | `PartitionService` instance field | Current execution phase (backfilling/catchup/cutover/failed) |
| `splitReplication.pendingEntries` | `PartitionService` instance field | Queued write entries not yet flushed to children |
| `splitReplication.flushInFlight` | `PartitionService` instance field | Whether a flush is currently running |
| `splitReplication.metadata` | `PartitionService` instance field | Parsed transition metadata (recoverable from `tables` row) |
| `splitReplication.startedAt` | `PartitionService` instance field | When replication started |
| `splitReplication.lastError` | `PartitionService` instance field | Last error encountered |
| `splitReplicationRun` | `PartitionService` instance field | Promise handle for the running workflow |
| `DurableWorkflowCoordinator` in-memory map | `ManagedSplitWorkflow.workflowCoordinator` | Active workflow records (cleared in `finally` block) |

---

## Gap Between Current and Target Ownership

### Target (Design §3): `ManagedSplitWorkflow` owns admission → cleanup

| Gap | Current | Target |
| --- | --- | --- |
| **Backfill/catch-up/cutover phase ownership** | `PartitionService` owns these phases via process-local state and direct system table writes | `ManagedSplitWorkflow` owns all phases; `PartitionService` reports typed acknowledgements |
| **Cutover system table write** | `PartitionService.markSplitCutoverActive()` writes `tables.partition_transition_state` directly | `ManagedSplitWorkflow` advances the durable phase after receiving a cutover-ready acknowledgement from `PartitionService` |
| **Catch-up phase constant** | `'split_catchup'` is a bare string, not in `PARTITION_TRANSITION_STATE` | Add to `PARTITION_TRANSITION_STATE` and persist durably |
| **Source execution progress** | Entirely in `this.splitReplication` (process memory) | Persisted as workflow participant state via `DurableWorkflowCoordinator` |
| **Write mirroring activation** | Cache-driven (`SQLQueryEngine` reads `partition_transition_state` from cache) | Acknowledgement-driven (explicit cutover acknowledgement from source) |
| **Cleanup phase** | Does not exist | `ManagedSplitWorkflow` owns cleanup: remove source mirror, clear transition metadata, mark terminal success |
| **Recovery** | Impossible — process-local state is lost on restart | `ManagedSplitWorkflow` reconstructs from durable workflow + participant state |
| **Failure persistence** | Split between `ManagedSplitWorkflow` (admission/preparation failures) and `PartitionService` (execution failures are process-local) | All failures persisted through `ManagedSplitWorkflow` |
| **Transaction atomicity** | `insertPartitionMetadataAtomically()` falls back to sequential writes when `DistributedTransactionCoordinator` is absent | Fail closed — no sequential fallback (Design §6) |

---

## Wiring Path (Production)

```
index.js
  └─ PartitionSplitMergeManager
       ├─ executeSplitCandidate → sqlQueryEngine.executeManagedSplit()
       └─ (periodic timer)

  └─ SQLQueryEngine (constructor)
       └─ ManagedSplitWorkflow (created internally)
            ├─ DurableWorkflowCoordinator (created internally)
            │    └─ persistWorkflow → ManagedSplitWorkflow.persistWorkflowTransition()
            │         └─ cdcIntegrationService.updateSystemTableRow(TABLES.TABLES, ...)
            ├─ provisionInitialTablePartition → SQLQueryEngine.provisionInitialTablePartition()
            ├─ startSplitReplicationOnSourcePartition → SQLQueryEngine
            │    └─ messageRouter.deliver() → PartitionService.handleStartSplitReplication()
            │         └─ PartitionService.runSplitReplicationWorkflow()
            │              ├─ backfillSplitSnapshot() → routeSplitMirroredWrite()
            │              ├─ flushSplitReplicationQueue() → replaySplitEntry()
            │              └─ markSplitCutoverActive() → cdcIntegrationService.updateSystemTableRow()
            └─ insertPartitionMetadataAtomically → DistributedTransactionCoordinator (optional)
```
