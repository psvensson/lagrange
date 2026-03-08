# Progression Entry Point Inventory

## Overview

This document inventories all progression entry points for the three
control-plane concerns: dispatch, rebalance, and split. Each entry point is
classified by trigger type (event, cache, polling, or message) and mapped to
its owner key and owning component.

Duplicate and overlapping paths are flagged for consolidation in Task 1.2.

---

## 1. Dispatch Progression

Owner component: `ReplicaDispatchService`
(`src/control-plane/replica-dispatch-service.js`)

Owner key: `operationId` (per replica operation)

### 1.1 Entry Points

| # | Trigger Type | Method | Source | Runs Progression Inline? |
|---|-------------|--------|--------|--------------------------|
| D1 | Event (coordinator) | `handleCoordinatorOperationCreated` | `RebalanceCoordinator` emits `OPERATION_CREATED` | Yes — calls `dispatchOperationRow` directly |
| D2 | CDC event | `handleCdcApplied` (replica_operations table, PENDING) | MG `CDC_APPLIED` event on replica_operations rows | Yes — calls `dispatchOperationRow` directly |
| D3 | CDC event | `handleCdcApplied` (replica_operations table, ACTIVE+REPLACE) | MG `CDC_APPLIED` event on REPLACE ops in ACTIVE step | Yes — calls `rebalanceCoordinator.executeOperation` directly |
| D4 | CDC event | `handleCdcApplied` (nodes table) | MG `CDC_APPLIED` event on nodes rows | Yes — calls `retryPendingDispatchesForReadyNode` |
| D5 | Cache change | `handleCacheNodeChange` (nodes table) | `SystemTableCache.onCacheChange` for nodes | Yes — calls `retryPendingDispatchesForReadyNode` |
| D6 | Cache change | `handleCacheNodeChange` (services table) | `SystemTableCache.onCacheChange` for services | Yes — calls `retryPendingDispatchesForNode` |
| D7 | Event (node state) | `handleNodeStateUpdate` | MG message `NODE_STATE_UPDATE` | Yes — calls `retryPendingDispatchesForReadyNode` |
| D8 | Message | `handleReplicaOperationDispatch` | MG message `REPLICA_OPERATION_DISPATCH` | Yes — calls `dispatchOperationRow` |

### 1.2 Duplicate / Overlapping Paths

1. **D4 + D5 (nodes CDC vs nodes cache change)**: Both trigger
   `retryPendingDispatchesForReadyNode` when a node row changes. D4 fires
   from the CDC_APPLIED event on the message group; D5 fires from the
   SystemTableCache `onCacheChange` listener. These are two independent
   triggers for the same semantic: "node became ready, retry pending
   dispatches." The watermark dedup in `shouldRetryNodeReadyWatermark`
   partially mitigates double execution, but both paths run inline
   progression logic.

2. **D7 + D4/D5 (node state update message vs CDC/cache)**: The
   `NODE_STATE_UPDATE` message handler also calls
   `retryPendingDispatchesForReadyNode`. This is a third trigger for the
   same "node ready → retry dispatches" semantic.

3. **D1 + D2 (coordinator event vs CDC on replica_operations)**: When the
   coordinator creates an operation, it emits `OPERATION_CREATED` (D1) and
   the row also propagates via CDC (D2). Both call `dispatchOperationRow`.
   The `dispatchInFlight` Set provides dedup, but both paths execute
   progression inline.

4. **D3 (CDC-triggered executeOperation for REPLACE)**: The dispatch service
   directly calls `rebalanceCoordinator.executeOperation` from a CDC event
   handler. This is long-running progression logic executed inline from an
   event handler.

---

## 2. Rebalance Progression

Owner components:
- Planning: `UnifiedRebalancer` (`src/rebalancer/unified-rebalancer.js`)
  — one instance per partition/message-group entity on the leader replica
- Execution: `RebalanceCoordinator` (`src/rebalancer/rebalance-coordinator.js`)
  — one shared instance per node

### 2.1 UnifiedRebalancer Entry Points

Owner key: `entityId` (partitionId or message group groupId)

| # | Trigger Type | Method | Source | Runs Progression Inline? |
|---|-------------|--------|--------|--------------------------|
| R1 | Polling (periodic timer) | `scheduleNextCheck` → `checkRebalance` → `rebalance` | Self-scheduling `setTimeout` loop | Yes — full rebalance cycle inline |
| R2 | Event (node state CDC) | `onNodeStateChange` → `triggerImmediateCheck` → `checkRebalance` | `CDCEventHandler.handleNodeStateCDC` via `CDCIntegrationService.rebalancer` | Yes — full rebalance cycle inline after short delay |
| R3 | Event (critical CDC) | `onCDCEvent` → `triggerImmediateCheck` → `checkRebalance` | Defined but **never called from runtime code** | N/A (dead code) |
| R4 | Event (leader election) | `setLeader(true)` → `scheduleNextCheck` → `checkRebalance` | Raft leader callback in `PartitionService` / `MessageGroupService` | Yes — starts periodic loop |
| R5 | Event (bootstrap node-ready) | `BootstrapService.triggerRebalancingOnAllPartitions` → `PartitionService.triggerRebalanceCheck` → `rebalancer.recordStateChange` | `BootstrapService.handleNodeReadyRebalanceTrigger` via CDC on nodes table | Indirect — resets stabilization timer, next periodic check picks it up |

### 2.2 RebalanceCoordinator Entry Points

Owner key: `operationId` (per replica operation)

| # | Trigger Type | Method | Source | Runs Progression Inline? |
|---|-------------|--------|--------|--------------------------|
| RC1 | Direct call | `executeOperation` | Called from `ReplicaDispatchService.dispatchOperationRow` (D1/D2/D8) | Yes — full operation execution |
| RC2 | Direct call | `executeOperation` | Called from `ReplicaDispatchService.handleCdcApplied` for REPLACE ACTIVE (D3) | Yes — full operation execution from CDC handler |
| RC3 | Polling (periodic timer) | `checkTimeouts` → `reconcileOperationProgress` → `executeOperation` | `setInterval` in `startTimeoutChecking` | Yes — reconciles + re-executes operations |
| RC4 | Recovery sweep | `handleRecovery` | Defined but **never called from runtime code** (test-only) | N/A |

### 2.3 Duplicate / Overlapping Paths

1. **R1 + R2 + R5 (periodic vs CDC-triggered vs bootstrap-triggered)**:
   Three independent paths can trigger `checkRebalance` → `rebalance` for
   the same entity. R1 is the periodic timer. R2 is the CDC node-state
   event. R5 is the bootstrap node-ready trigger. All three converge on
   `checkRebalance` but there is no single reconcile queue — they rely on
   `triggerImmediateCheck` cancelling the pending timer, which is a
   best-effort dedup.

2. **R3 (dead code)**: `UnifiedRebalancer.onCDCEvent` is defined but never
   wired up from runtime code. The CDC integration service only calls
   `onNodeStateChange` (R2), not `onCDCEvent`. This is dead code that
   should be removed or properly wired.

3. **RC1 + RC2 + RC3 (dispatch-triggered vs CDC-triggered vs
   polling-triggered executeOperation)**: `executeOperation` is called from
   three different paths. The `operationsInExecution` single-flight guard
   prevents parallel execution per operationId, but the timeout polling
   loop (RC3) independently queries SQL for incomplete operations and calls
   `reconcileOperationProgress` → `executeOperation`, creating a second
   mutation path alongside the dispatch-driven path.

4. **R2 + R5 (CDC node-state vs bootstrap node-ready)**: Both react to
   node-ready transitions. R2 goes through `CDCEventHandler` →
   `UnifiedRebalancer.onNodeStateChange`. R5 goes through
   `BootstrapService.handleNodeReadyRebalanceTrigger` →
   `PartitionService.triggerRebalanceCheck`. These are parallel paths for
   the same semantic event.

---

## 3. Split Progression

Owner component: `PartitionSplitMergeManager`
(`src/partition/partition-split-merge-manager.js`)

Execution: `ManagedSplitWorkflow`
(`src/partition/managed-split-workflow.js`)

Owner key: `partitionId` (per partition being evaluated for split)

### 3.1 Entry Points

| # | Trigger Type | Method | Source | Runs Progression Inline? |
|---|-------------|--------|--------|--------------------------|
| S1 | Polling (periodic timer) | `startPeriodicEvaluation` → `evaluateAllPartitions` → `executeManagedSplitCandidate` | `setInterval` in `startPeriodicEvaluation` | Yes — full split evaluation + execution inline |
| S2 | Direct call | `splitPartition` | Admin API or programmatic call | Yes — full split execution |

### 3.2 Duplicate / Overlapping Paths

1. **S1 is the only automated path**: Split progression is simpler than
   dispatch/rebalance — it has one periodic polling loop and one direct
   API. The `ManagedSplitWorkflow.execute` uses
   `workflowCoordinator.runExclusive(partitionId, ...)` which provides
   single-flight per partition. This is closer to the target architecture.

2. **No event-triggered or cache-triggered split paths exist**: Split
   evaluation is purely polling-based. This means split reactions to state
   changes (e.g., partition size crossing threshold) are delayed by the
   polling interval.

---

## 4. Summary of Duplicate Paths to Remove

### High Priority (inline progression from event handlers)

| ID | Concern | Description | Action |
|----|---------|-------------|--------|
| DUP-1 | Dispatch | D4+D5+D7: Three triggers for "node ready → retry dispatches" | Consolidate into enqueue-only; single reconcile per nodeId |
| DUP-2 | Dispatch | D1+D2: Coordinator event + CDC both dispatch same operation | Consolidate into enqueue-only; single reconcile per operationId |
| DUP-3 | Dispatch | D3: CDC handler calls `executeOperation` inline for REPLACE | Move to enqueue; do not run long progression from CDC handler |
| DUP-4 | Rebalance | R1+R2+R5: Three triggers for rebalance check on same entity | Route all through owner-key reconcile queue per entityId |
| DUP-5 | Rebalance | RC1+RC2+RC3: Three paths into `executeOperation` | Route all through owner-key reconcile queue per operationId |

### Medium Priority (dead code / cleanup)

| ID | Concern | Description | Action |
|----|---------|-------------|--------|
| DUP-6 | Rebalance | R3: `onCDCEvent` defined but never called | Remove dead code or wire properly |
| DUP-7 | Rebalance | RC4: `handleRecovery` never called from runtime | Wire into recovery sweep or remove |

### Already Acceptable

| ID | Concern | Description | Status |
|----|---------|-------------|--------|
| OK-1 | Split | S1: Single periodic polling loop with `runExclusive` | Matches target architecture pattern |
| OK-2 | Dispatch | `dispatchInFlight` Set dedup | Partial mitigation, but not a reconcile queue |
| OK-3 | Rebalance | `operationsInExecution` single-flight guard | Partial mitigation, but not a reconcile queue |

---

## 5. Component Ownership Map

| Concern | Owner Key | Owning Component | File |
|---------|-----------|-----------------|------|
| Dispatch (operation routing) | operationId | ReplicaDispatchService | src/control-plane/replica-dispatch-service.js |
| Dispatch (node-ready retry) | nodeId | ReplicaDispatchService | src/control-plane/replica-dispatch-service.js |
| Rebalance (planning) | entityId (partitionId / groupId) | UnifiedRebalancer | src/rebalancer/unified-rebalancer.js |
| Rebalance (execution) | operationId | RebalanceCoordinator | src/rebalancer/rebalance-coordinator.js |
| Rebalance (timeout/progress) | operationId | RebalanceCoordinator | src/rebalancer/rebalance-coordinator.js |
| Split (evaluation) | partitionId | PartitionSplitMergeManager | src/partition/partition-split-merge-manager.js |
| Split (execution) | partitionId | ManagedSplitWorkflow | src/partition/managed-split-workflow.js |
| Node state CDC → rebalancer | nodeId | CDCEventHandler | src/cdc/cdc-event-handler.js |
| Bootstrap node-ready → rebalancer | nodeId | BootstrapService | src/bootstrap/bootstrap-service.js |
