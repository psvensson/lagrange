# Rolling Restart Convergence Bugfix Design

## Overview

Three interrelated bugs prevent a 5-node cluster from converging after rolling restarts. The primary bug (C) is a circular deadlock: `evaluateCanonicalJoinTopologyReadiness` blocks warming nodes on ALL non-self-targeted in-flight replica operations, but operations targeting other warming nodes can never complete because those targets haven't finished joining. The rebalancer immediately recreates failed operations, keeping the in-flight count perpetually above zero. Two secondary bugs amplify the failure: CDC retry closures retain full event payloads causing 24MB/min memory growth (D), and concurrent `replica_operations` writes produce transaction conflicts (E).

The fix approach extends the existing self-targeted exclusion filter in `collectCanonicalInFlightReplicaOperationDetails` to also exclude operations targeting warming/not-ready nodes, breaks the CDC closure's reference to the payload, and scopes the operation single-flight key to include the target partition.

## Glossary

- **Bug_Condition (C)**: The set of conditions that trigger the three bugs — warming-node operation deadlock, CDC closure memory retention, and concurrent partition transaction conflicts
- **Property (P)**: Correct behavior — warming nodes converge independently, CDC closures release payloads, and partition mutations serialize correctly
- **Preservation**: Existing behavior for ready-node operations, successful CDC deliveries, and non-conflicting mutations must remain unchanged
- **`collectCanonicalInFlightReplicaOperationDetails`**: Method in `JoinReadinessEvaluator` (`src/bootstrap/join-readiness-evaluator.js`) that collects in-flight replica operations from cache and filters them for join readiness evaluation
- **`scheduleBackgroundRetry`**: Method in `CDCGroupPropagationService` (`src/topology/cdc-group-propagation-service.js`) that schedules deferred CDC delivery retries via setTimeout closures
- **`operationWorkflowRunExclusive`**: Single-flight mechanism in `RebalanceCoordinator` (`src/rebalancer/rebalance-coordinator.js`) that serializes operation workflow mutations through `OperationLane`
- **warming node**: A node in a pre-ACTIVE state (JOINING, SYNCING, READY, CONTROL_READY) that has not completed join readiness
- **repair-eligible**: The `ControlPlaneReadinessService` dimension indicating a node can participate in internal topology work (rebalance, dispatch, split admission)

## Bug Details

### Bug Condition

The bugs manifest in three distinct but interrelated conditions during rolling restart convergence:

**Bug C (Warming-Node Operation Deadlock)**: When the rebalancer creates operations targeting warming nodes, those operations time out because the targets cannot process them. `reconcileTimeoutOperation` fails them, but `queryExistingInFlightOperation` no longer finds a matching non-terminal operation, so the rebalancer immediately recreates replacements. Meanwhile, `collectCanonicalInFlightReplicaOperationDetails` counts these perpetually-recycled operations as blocking, preventing ALL warming nodes from completing join readiness.

**Bug D (CDC Closure Memory Leak)**: When `scheduleBackgroundRetry` creates a setTimeout closure, it captures the full `options` object including `options.data` (the CDC event payload). Even with bounded attempt caps, many concurrent CDC events during rolling restarts accumulate closures holding payload references, causing 24MB/min memory growth.

**Bug E (Concurrent Transaction Conflicts)**: When `checkTimeouts` and `dispatchOperation` execute concurrently for different operations that target the same `replica_operations` partition, both attempt SQL transactions on the same partition simultaneously, producing "Transaction already active" errors.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type {bugType, context}
  OUTPUT: boolean

  IF input.bugType = 'warming_node_deadlock' THEN
    RETURN input.context.operationTargetNodeState NOT IN [ACTIVE]
           AND input.context.operationTargetNodeId != input.context.evaluatingNodeId
           AND isReplicaOperationInFlight(input.context.operation)

  IF input.bugType = 'cdc_closure_memory' THEN
    RETURN input.context.retryClosureReferencesFullPayload = true
           AND input.context.deliveryFailed = true

  IF input.bugType = 'concurrent_transaction' THEN
    RETURN input.context.concurrentMutationsOnSamePartition = true
           AND input.context.singleFlightKeyDoesNotIncludePartition = true

  RETURN false
END FUNCTION
```

### Examples

- **Bug C example**: Node B is warming (JOINING state). Rebalancer creates ADD operation targeting Node B. Operation times out after 30s. Rebalancer recreates it. Node A evaluates join readiness, sees 3 in-flight operations targeting Node B, blocks. Node B also blocks on operations targeting Node A. Neither can join.
- **Bug C example 2**: 5-node cluster rolling restart. Nodes 3, 4, 5 restart. Rebalancer on seed node creates message group ADD operations targeting nodes 3-5. All time out and get recreated. Nodes 3-5 each block on each other's in-flight operations. Cluster stuck with 2/5 nodes active.
- **Bug D example**: During rolling restart, 200 CDC events fail delivery to restarting nodes. Each schedules a background retry closure holding ~120KB payload. 200 × 120KB = 24MB retained per retry cycle. With 5 retry attempts at increasing delays, peak retention reaches ~120MB before closures expire.
- **Bug E example**: `checkTimeouts` reconciles operation-A (partition P1) while `dispatchOperation` dispatches operation-B (also partition P1). Both call `executeOperationMutationWithRetry` which opens a SQL transaction on P1. Second transaction gets "Transaction already active" error, retries after delay, slowing lifecycle progression.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Operations targeting ACTIVE (fully joined, repair-eligible) nodes must continue to be dispatched immediately and counted as blocking in join readiness evaluation (Req 3.1, 3.3)
- Operations targeting ACTIVE nodes that time out must continue to allow immediate recreation by the rebalancer (Req 3.2)
- When zero in-flight operations exist, join readiness must continue to declare the dimension as ready (Req 3.4)
- Self-targeted operations must continue to be excluded from the blocking count per the first-round fix (Req 3.5)
- CDC deliveries that succeed on first attempt must continue without any retry scheduling or payload handling changes (Req 3.6)
- CDC background retries that eventually succeed must continue to deliver the full event payload (Req 3.7)
- Single (non-conflicting) replica_operations mutations must continue without additional serialization overhead (Req 3.8)
- Per-operation single-flight keys must continue to prevent concurrent reconciliation of the same operation (Req 3.9)

**Scope:**
All inputs that do NOT involve warming-node-targeted operations, failed CDC deliveries, or concurrent same-partition mutations should be completely unaffected by this fix. This includes:
- Operations targeting fully joined nodes
- Successful CDC deliveries
- Sequential or different-partition mutations
- Mouse/keyboard/API interactions unrelated to these code paths

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Bug C — Missing warming-node exclusion in join readiness filter**: `collectCanonicalInFlightReplicaOperationDetails` (line 944 of `join-readiness-evaluator.js`) already excludes self-targeted operations but does NOT check whether the operation's `targetNodeId` refers to a node that is in a warming/not-ready state. The method has access to `systemTableCache` and could check `TABLES.NODES` rows (the same pattern used by `getCanonicalJoinActiveNodeIds`) but doesn't. This means operations targeting warming nodes are counted as blocking even though they can never complete until those targets finish joining — creating the circular dependency.

2. **Bug D — Full options object captured in setTimeout closure**: `scheduleBackgroundRetry` (line 456 of `cdc-group-propagation-service.js`) passes the entire `options` object into the setTimeout callback, which then references `options.data` for the retry delivery call. The closure captures the full `options` reference, keeping the CDC event payload alive in memory until the timer fires and the retry completes or exhausts attempts. During rolling restarts with many concurrent CDC events, this accumulates significant memory pressure.

3. **Bug E — Operation-scoped single-flight key ignores partition**: Both `checkTimeouts` and `dispatchOperation` use `operationWorkflowRunExclusive` with keys scoped to the individual `operationId` (`getOperationOwnerSingleFlightKey` / `getExecuteOperationSingleFlightKey`). This correctly prevents concurrent work on the SAME operation, but does NOT prevent concurrent SQL transactions on the SAME `replica_operations` partition from DIFFERENT operations. Since the SQL engine does not support concurrent transactions on a single partition, this produces "Transaction already active" errors.

## Correctness Properties

Property 1: Bug Condition C — Warming-Node Operations Excluded From Join Readiness Blocking Count

_For any_ call to `collectCanonicalInFlightReplicaOperationDetails` where in-flight replica operations exist targeting nodes that are NOT in ACTIVE state (warming/not-ready), the fixed function SHALL exclude those operations from the returned `inFlightOperations` array and track them in a separate `excludedWarmingTargetCount`, so that warming nodes are not blocked from completing join readiness by operations that cannot make progress.

**Validates: Requirements 2.3, 2.4**

Property 2: Preservation — Ready-Node Operations Still Block Join Readiness

_For any_ call to `collectCanonicalInFlightReplicaOperationDetails` where in-flight replica operations exist targeting nodes that ARE in ACTIVE state (fully joined, repair-eligible), the fixed function SHALL continue to include those operations in the returned `inFlightOperations` array, preserving the existing blocking behavior for operations that can make progress.

**Validates: Requirements 3.1, 3.3, 3.4, 3.5**

Property 3: Bug Condition D — CDC Retry Closures Release Payload Reference

_For any_ call to `scheduleBackgroundRetry` where a CDC delivery has failed, the fixed function SHALL NOT retain a reference to the full `options.data` payload in the setTimeout closure. Only minimal metadata fields (tableName, operation, sourceGroupId) and target identifiers SHALL be captured, and the payload reference SHALL be re-fetched or omitted from the closure scope.

**Validates: Requirements 2.5**

Property 4: Bug Condition E — Partition-Scoped Transaction Serialization

_For any_ concurrent `replica_operations` mutations targeting the same partition from different operations (e.g., `checkTimeouts` and `dispatchOperation`), the fixed function SHALL serialize those mutations through a partition-scoped single-flight key in addition to the per-operation key, preventing "Transaction already active" errors.

**Validates: Requirements 2.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/bootstrap/join-readiness-evaluator.js`

**Function**: `collectCanonicalInFlightReplicaOperationDetails`

**Specific Changes**:
1. **Add warming-node target exclusion**: After the existing self-targeted exclusion check, add a check that looks up the operation's `targetNodeId` in the `TABLES.NODES` cache rows. If the target node's status is NOT `NODE_STATE.ACTIVE`, exclude the operation from the blocking `inFlightOperations` array.
2. **Track excluded warming-target count**: Add an `excludedWarmingTargetCount` counter (parallel to the existing `excludedSelfTargetedCount`) to track how many operations were excluded due to warming targets, for diagnostic logging.
3. **Use existing cache pattern**: Use the same `systemTableCache.getAll(TABLES.NODES)` pattern already used by `getCanonicalJoinActiveNodeIds` to build a Set of active node IDs, then check each operation's `targetNodeId` against that Set.
4. **Return new counter**: Include `excludedWarmingTargetCount` in the returned object so `evaluateCanonicalJoinTopologyReadiness` can log it for diagnostics.

**File**: `src/topology/cdc-group-propagation-service.js`

**Function**: `scheduleBackgroundRetry`

**Specific Changes**:
5. **Extract metadata before closure**: At the top of `scheduleBackgroundRetry`, extract `tableName`, `operation`, `sourceGroupId`, and `targets` from `options` into local variables. Extract `data` into a separate local variable.
6. **Null out data reference in closure**: Inside the setTimeout callback, pass `data` as a parameter to `deliverToTargets` but structure the recursive `scheduleBackgroundRetry` call to NOT pass `data` for subsequent retries. Instead, the first retry carries the payload, and if it fails, subsequent retries should still carry it — so the fix is to avoid capturing the entire `options` object. Destructure only the needed fields into the closure scope and let the original `options` object be GC'd.

**File**: `src/rebalancer/rebalance-coordinator.js`

**Function**: `checkTimeouts` (and the `runReplicaOperationTransitionExclusive` serialization)

**Specific Changes**:
7. **Add partition-scoped serialization**: Wrap the `executeOperationMutationWithRetry` calls (or the broader mutation paths) with the existing `runReplicaOperationTransitionExclusive` queue to serialize all `replica_operations` partition mutations. Since `runReplicaOperationTransitionExclusive` already exists as a sequential promise queue, route the SQL mutation through it to prevent concurrent transactions on the same partition.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fixes. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write unit tests that construct the specific conditions for each bug and assert the current (broken) behavior. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **Warming-Node Deadlock Test**: Create a `JoinReadinessEvaluator` with mock `systemTableCache` containing in-flight operations targeting a node with status JOINING. Assert that `collectCanonicalInFlightReplicaOperationDetails` currently includes those operations in the blocking count (will demonstrate the bug on unfixed code).
2. **Circular Dependency Test**: Set up two warming nodes each with in-flight operations targeting the other. Assert that `evaluateCanonicalJoinTopologyReadiness` returns `ready: false` for both (will demonstrate the deadlock on unfixed code).
3. **CDC Closure Memory Test**: Call `scheduleBackgroundRetry` with a large `data` payload and verify the closure retains a reference to it (will demonstrate the memory issue on unfixed code).
4. **Concurrent Transaction Test**: Simulate concurrent `checkTimeouts` and `dispatchOperation` calls targeting the same partition and verify "Transaction already active" errors occur (will demonstrate the conflict on unfixed code).

**Expected Counterexamples**:
- `collectCanonicalInFlightReplicaOperationDetails` returns warming-node-targeted operations in the blocking array
- Both warming nodes evaluate as `ready: false` due to each other's operations
- setTimeout closure holds reference to full payload object

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  IF input.bugType = 'warming_node_deadlock' THEN
    result := collectCanonicalInFlightReplicaOperationDetails_fixed(cache)
    ASSERT input.operation NOT IN result.inFlightOperations
    ASSERT result.excludedWarmingTargetCount > 0

  IF input.bugType = 'cdc_closure_memory' THEN
    closureRefs := capturedReferences(scheduleBackgroundRetry_fixed(options))
    ASSERT options.data NOT IN closureRefs

  IF input.bugType = 'concurrent_transaction' THEN
    results := concurrentMutations_fixed(opA, opB, samePartition)
    ASSERT NO 'Transaction already active' errors IN results
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT collectCanonicalInFlightReplicaOperationDetails_original(input)
       = collectCanonicalInFlightReplicaOperationDetails_fixed(input)
  ASSERT scheduleBackgroundRetry_original(input)
       = scheduleBackgroundRetry_fixed(input)  // same delivery behavior
  ASSERT operationMutation_original(input)
       = operationMutation_fixed(input)  // same mutation result
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for ready-node operations, successful CDC deliveries, and non-conflicting mutations, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Ready-Node Operation Preservation**: Verify that operations targeting ACTIVE nodes continue to appear in the blocking `inFlightOperations` array after the fix
2. **Self-Targeted Exclusion Preservation**: Verify that self-targeted operations continue to be excluded (first-round fix preserved)
3. **Zero Operations Preservation**: Verify that when no in-flight operations exist, the result is unchanged
4. **Successful CDC Delivery Preservation**: Verify that successful first-attempt CDC deliveries are unaffected by the closure changes
5. **Sequential Mutation Preservation**: Verify that single (non-concurrent) mutations execute without additional overhead

### Unit Tests

- Test `collectCanonicalInFlightReplicaOperationDetails` with mixed node states (ACTIVE, JOINING, SYNCING, READY)
- Test `collectCanonicalInFlightReplicaOperationDetails` with all operations targeting warming nodes (should return empty blocking array)
- Test `collectCanonicalInFlightReplicaOperationDetails` with mix of self-targeted, warming-targeted, and ready-targeted operations
- Test `scheduleBackgroundRetry` closure does not retain `data` reference
- Test `scheduleBackgroundRetry` still delivers full payload on retry
- Test partition-scoped serialization prevents concurrent transaction errors

### Property-Based Tests

- Generate random sets of in-flight operations with random target node states and verify: operations targeting ACTIVE nodes are always in the blocking array, operations targeting non-ACTIVE nodes are always excluded
- Generate random CDC event payloads and verify: retry closures never retain the full payload reference, but delivery still receives the correct data
- Generate random concurrent operation pairs and verify: same-partition pairs are serialized, different-partition pairs can execute concurrently

### Integration Tests

- Test full join readiness evaluation with a simulated rolling restart scenario (multiple warming nodes with cross-targeted operations)
- Test CDC propagation under delivery failures with memory pressure monitoring
- Test concurrent rebalance operation lifecycle with multiple operations targeting the same partition
