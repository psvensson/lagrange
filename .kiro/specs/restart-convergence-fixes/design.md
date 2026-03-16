# Restart Convergence Fixes — Bugfix Design

## Overview

Two bugs prevent restarted nodes from reaching ACTIVE state during rolling restart of a 5-node cluster, causing the `rolling-restart-5n-fix14` distributed test to fail with a 120-second timeout.

Bug A: `scheduleBackgroundRetry` in `CDCGroupPropagationService` recursively schedules retries with no maximum attempt cap, despite `deliveryRetryMaxAttempts` being enforced in the synchronous `deliverToTargetsWithRetry` path. This causes unbounded timer and connection accumulation for unreachable nodes.

Bug B: `collectCanonicalInFlightReplicaOperationDetails` in `JoinReadinessEvaluator` counts ALL in-flight replica operations including those where `targetNodeId` is the joining node itself. Since those operations cannot complete until the node finishes joining, this creates a circular dependency deadlock.

The fix approach is minimal and targeted: enforce the existing `deliveryRetryMaxAttempts` cap in the background retry path, and filter self-targeted operations from the in-flight count during join readiness evaluation.

## Glossary

- **Bug_Condition (C)**: Two conditions: (A) `scheduleBackgroundRetry` called with `attempt >= deliveryRetryMaxAttempts` and delivery still failing; (B) `evaluateCanonicalJoinTopologyReadiness` called when in-flight operations target the joining node itself
- **Property (P)**: (A) Background retries stop after max attempts, releasing resources; (B) Self-targeted operations are excluded from the in-flight count, allowing join to proceed
- **Preservation**: (A) Retries within the bounded limit continue to work, successful deliveries are unaffected, `clearBackgroundRetryTimers` on stop is unaffected; (B) Non-self-targeted in-flight operations still block join readiness, zero-operation case still yields ready
- **scheduleBackgroundRetry**: The method in `src/topology/cdc-group-propagation-service.js` that recursively schedules timer-based delivery retries after the synchronous retry loop is exhausted
- **deliveryRetryMaxAttempts**: The existing instance property (default `CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS = 3`) that caps synchronous retries but is not checked in the background path
- **backgroundRetryTimers**: The `Set` of active `setTimeout` handles for background retries, cleaned up on `stop()`
- **collectCanonicalInFlightReplicaOperationDetails**: The method in `src/bootstrap/join-readiness-evaluator.js` that reads `replica_operations` from `SystemTableCache` and returns non-terminal operations
- **evaluateCanonicalJoinTopologyReadiness**: The method that requires `inFlightReplicaOperations === 0` before declaring topology ready for join

## Bug Details

### Bug Condition

The bugs manifest in two independent code paths during rolling restart:

**Bug A — Unbounded Background Retry**: After the synchronous `deliverToTargetsWithRetry` exhausts `deliveryRetryMaxAttempts` and hands off to `scheduleBackgroundRetry`, the background path never checks the attempt count against any maximum. Each failed delivery spawns a new timer that re-attempts and spawns another timer on failure, indefinitely.

**Bug B — Self-Targeted Operation Deadlock**: When a node restarts and the rebalance coordinator dispatches ADD operations targeting that node, `collectCanonicalInFlightReplicaOperationDetails` counts those operations. The join readiness check requires zero in-flight operations, but the self-targeted operations cannot complete until the join completes.

**Formal Specification:**
```
FUNCTION isBugConditionA(input)
  INPUT: input of type {attempt: number, deliveryFailed: boolean, serviceState: string}
  OUTPUT: boolean

  RETURN input.serviceState === 'running'
         AND input.deliveryFailed === true
         AND input.attempt >= deliveryRetryMaxAttempts
         AND scheduleBackgroundRetry does NOT check attempt against max
END FUNCTION

FUNCTION isBugConditionB(input)
  INPUT: input of type {inFlightOperations: Array, joiningNodeId: string}
  OUTPUT: boolean

  LET selfTargeted = input.inFlightOperations.filter(
    op => op.targetNodeId === input.joiningNodeId
  )
  LET nonSelfTargeted = input.inFlightOperations.filter(
    op => op.targetNodeId !== input.joiningNodeId
  )
  RETURN selfTargeted.length > 0
         AND nonSelfTargeted.length === 0
         AND topology declared not-ready due to selfTargeted count
END FUNCTION
```

### Examples

- **Bug A Example 1**: Node B is stopped for rolling restart. Node A's CDC propagation fails to deliver to Node B. Synchronous retries exhaust 3 attempts, then `scheduleBackgroundRetry` is called with `attempt: 4`. Delivery fails again, schedules attempt 5, which fails and schedules attempt 6, ad infinitum. After 60 seconds, hundreds of timers accumulate in `backgroundRetryTimers`.
- **Bug A Example 2**: Two CDC events fail delivery to the same unreachable node. Each spawns its own independent unbounded retry chain, doubling the timer accumulation rate.
- **Bug B Example 1**: Node C restarts. The rebalance coordinator creates an ADD operation with `targetNodeId = nodeC`. `collectCanonicalInFlightReplicaOperationDetails` returns this operation. `evaluateCanonicalJoinTopologyReadiness` sees `inFlightReplicaOperations = 1`, sets `ready = false`. Node C cannot join. The ADD operation cannot complete. Deadlock.
- **Bug B Example 2**: Node C restarts with 3 self-targeted ADD operations and 0 non-self-targeted operations. All 3 are counted, `ready = false`, deadlock persists.
- **Edge Case**: Node C restarts with 1 self-targeted and 1 non-self-targeted operation. After fix, the non-self-targeted operation still blocks readiness correctly.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- CDC background retries within the bounded attempt limit continue to retry and succeed when the target node recovers
- Successful first-attempt CDC deliveries do not trigger any background retries
- `clearBackgroundRetryTimers()` on service `stop()` continues to clear all pending timers
- `deliverToTargetsWithRetry` synchronous retry loop behavior is completely unchanged
- Non-self-targeted in-flight replica operations continue to block join readiness
- Zero in-flight operations continue to yield `ready = true` for the topology dimension
- Mixed self-targeted and non-self-targeted operations block on the non-self-targeted ones
- The `DELIVERY_RETRY_EXHAUSTED` log message continues to be emitted when synchronous retries are exhausted

**Scope:**
All inputs that do NOT involve (A) background retry attempts exceeding the max or (B) self-targeted in-flight operations during join readiness evaluation should be completely unaffected by this fix. This includes:
- Normal CDC propagation with reachable nodes
- Synchronous retry behavior in `deliverToTargetsWithRetry`
- Join readiness evaluation when no in-flight operations exist
- Join readiness evaluation when all in-flight operations target other nodes
- Message router connection management
- Rebalance coordinator `checkTimeouts` reconciliation loop

## Hypothesized Root Cause

Based on the code analysis, the root causes are confirmed (not hypothesized):

1. **Missing Max Attempt Guard in Background Retry Path**: `scheduleBackgroundRetry` accepts an `attempt` parameter and increments it on each recursive call, but never compares it against `this.deliveryRetryMaxAttempts`. The synchronous path in `deliverToTargetsWithRetry` correctly uses `const maxAttempts = Math.max(NUM.ONE, this.deliveryRetryMaxAttempts)` and loops `while (attempt <= maxAttempts)`, but the background path was written without this guard. The constant `CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS = 3` exists and is loaded into `this.deliveryRetryMaxAttempts`, but is simply never consulted in `scheduleBackgroundRetry`.

2. **No Self-Exclusion Filter in In-Flight Operation Collection**: `collectCanonicalInFlightReplicaOperationDetails` iterates all `replica_operations` rows from `SystemTableCache`, normalizes each, checks `isReplicaOperationInFlight`, and collects matching operations. It already extracts `targetNodeId` from each normalized operation but does not compare it against `this.nodeId`. The `evaluateCanonicalJoinTopologyReadiness` method then requires `inFlightReplicaOperations === NUM.ZERO` with no distinction between self-targeted and externally-targeted operations.

## Correctness Properties

Property 1: Bug Condition A — Background Retry Bounded Termination

_For any_ CDC background retry where the attempt number meets or exceeds the configured `deliveryRetryMaxAttempts` and delivery continues to fail, the fixed `scheduleBackgroundRetry` SHALL NOT schedule any further retry timers, SHALL log the exhaustion, and SHALL not add new entries to `backgroundRetryTimers`.

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition B — Self-Targeted Operation Exclusion

_For any_ join readiness evaluation where in-flight replica operations exist and all have `targetNodeId` equal to the joining node's own `nodeId`, the fixed `evaluateCanonicalJoinTopologyReadiness` SHALL exclude those operations from the in-flight count and declare the in-flight operations dimension as satisfied (contributing to `ready = true` when other dimensions are also satisfied).

**Validates: Requirements 2.3, 2.4**

Property 3: Preservation A — Background Retry Within Bounds

_For any_ CDC background retry where the attempt number is below the configured `deliveryRetryMaxAttempts` and delivery fails, the fixed `scheduleBackgroundRetry` SHALL continue to schedule the next retry attempt with exponential backoff, preserving the existing retry-and-recover behavior for temporarily unreachable nodes.

**Validates: Requirements 3.1, 3.2, 3.7**

Property 4: Preservation B — Non-Self-Targeted Operations Still Block

_For any_ join readiness evaluation where in-flight replica operations exist with `targetNodeId` NOT equal to the joining node's `nodeId`, the fixed code SHALL continue to count those operations, preserving the existing blocking behavior for externally-targeted operations.

**Validates: Requirements 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/topology/cdc-group-propagation-service.js`

**Function**: `scheduleBackgroundRetry`

**Specific Changes**:
1. **Add Max Attempt Guard**: At the top of `scheduleBackgroundRetry`, after the existing state and targets checks, add a check: if `attempt` exceeds a background retry maximum (reuse `this.deliveryRetryMaxAttempts` multiplied by a background multiplier, or introduce a dedicated `CDC_GROUP_PROPAGATION_RETRY.BACKGROUND_MAX_ATTEMPTS` constant), log exhaustion using the existing `CDC_GROUP_PROPAGATION_LOG_MSG.DELIVERY_RETRY_EXHAUSTED` message and return without scheduling a timer.
2. **Reuse Existing Constant Pattern**: The background max attempts should be defined as a new field in `CDC_GROUP_PROPAGATION_RETRY` in `src/topology/cdc-group-propagation-constants.js` (e.g., `BACKGROUND_MAX_ATTEMPTS: 5`) to keep the cap explicit and separate from the synchronous retry cap. The total retry budget becomes `MAX_ATTEMPTS` (synchronous) + `BACKGROUND_MAX_ATTEMPTS` (background).
3. **Initialize in Constructor**: Add `this.backgroundRetryMaxAttempts` resolved from `options.backgroundRetryMaxAttempts` with fallback to `CDC_GROUP_PROPAGATION_RETRY.BACKGROUND_MAX_ATTEMPTS`, following the existing `resolvePositiveInteger` pattern.

**File**: `src/bootstrap/join-readiness-evaluator.js`

**Function**: `collectCanonicalInFlightReplicaOperationDetails`

**Specific Changes**:
4. **Add Self-Exclusion Filter**: Inside the `for` loop, after `isReplicaOperationInFlight` check passes, add a condition: if `normalizedOperation.targetNodeId === this.nodeId`, skip this operation (do not push to `inFlightOperations`). This uses the already-extracted `targetNodeId` field from `normalizeReplicaOperationRecord`.
5. **Log Excluded Operations**: When self-targeted operations are excluded, the count should be visible in the topology readiness result for diagnostics. Add an `excludedSelfTargetedCount` field to the return value of `evaluateCanonicalJoinTopologyReadiness` so the join readiness logging can report how many operations were excluded.

**File**: `src/topology/cdc-group-propagation-constants.js`

**Specific Changes**:
6. **Add Background Max Attempts Constant**: Add `BACKGROUND_MAX_ATTEMPTS: 5` to the `CDC_GROUP_PROPAGATION_RETRY` frozen object. This gives a total of 8 attempts (3 synchronous + 5 background) before giving up, which is sufficient for transient failures while preventing unbounded growth.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write unit tests that exercise `scheduleBackgroundRetry` with high attempt numbers and verify unbounded recursion occurs. Write unit tests that call `collectCanonicalInFlightReplicaOperationDetails` with self-targeted operations and verify they are counted. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **Background Retry Unbounded Test**: Call `scheduleBackgroundRetry` with `attempt: 10` (well above `MAX_ATTEMPTS: 3`) on unfixed code, verify it schedules another timer (will demonstrate the bug — it should NOT schedule but does)
2. **Self-Targeted Operation Counted Test**: Populate `SystemTableCache` with a replica operation where `targetNodeId === joiningNodeId`, call `collectCanonicalInFlightReplicaOperationDetails`, verify the operation is returned (will demonstrate the bug — it should be excluded but is not)
3. **Join Topology Deadlock Test**: Set up a scenario with only self-targeted in-flight operations, call `evaluateCanonicalJoinTopologyReadiness`, verify `ready === false` (will demonstrate the deadlock — it should be `true` but is not)

**Expected Counterexamples**:
- `scheduleBackgroundRetry` schedules a timer even when `attempt` is 100
- `collectCanonicalInFlightReplicaOperationDetails` returns operations targeting the joining node
- Possible causes confirmed: missing attempt guard, missing targetNodeId filter

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugConditionA(input) DO
  result := scheduleBackgroundRetry_fixed(input)
  ASSERT no new timer added to backgroundRetryTimers
  ASSERT exhaustion logged
END FOR

FOR ALL input WHERE isBugConditionB(input) DO
  result := evaluateCanonicalJoinTopologyReadiness_fixed(input)
  ASSERT result.inFlightReplicaOperations === 0
  ASSERT result.ready === true (when other dimensions satisfied)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugConditionA(input) DO
  ASSERT scheduleBackgroundRetry_original(input)
       = scheduleBackgroundRetry_fixed(input)
END FOR

FOR ALL input WHERE NOT isBugConditionB(input) DO
  ASSERT collectCanonicalInFlightReplicaOperationDetails_original(input)
       = collectCanonicalInFlightReplicaOperationDetails_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-bug inputs (successful deliveries, non-self-targeted operations), then write property-based tests capturing that behavior.

**Test Cases**:
1. **Background Retry Below Max Preservation**: Generate random attempt values below `backgroundRetryMaxAttempts` with failed deliveries, verify a retry timer is scheduled in both original and fixed code
2. **Successful Delivery Preservation**: Generate random successful delivery scenarios, verify no background retry is scheduled in both original and fixed code
3. **Non-Self-Targeted Operation Preservation**: Generate random in-flight operations where `targetNodeId !== joiningNodeId`, verify they are all counted in both original and fixed code
4. **Empty Operations Preservation**: Verify that zero in-flight operations yields `ready = true` in both original and fixed code

### Unit Tests

- Test `scheduleBackgroundRetry` stops scheduling when `attempt >= backgroundRetryMaxAttempts + synchronousMaxAttempts`
- Test `scheduleBackgroundRetry` logs exhaustion with correct context when max exceeded
- Test `scheduleBackgroundRetry` continues scheduling when `attempt < max`
- Test `collectCanonicalInFlightReplicaOperationDetails` excludes operations where `targetNodeId === this.nodeId`
- Test `collectCanonicalInFlightReplicaOperationDetails` includes operations where `targetNodeId !== this.nodeId`
- Test `evaluateCanonicalJoinTopologyReadiness` returns `ready = true` when only self-targeted operations exist (and other dimensions satisfied)
- Test `evaluateCanonicalJoinTopologyReadiness` returns `ready = false` when non-self-targeted operations exist
- Test `clearBackgroundRetryTimers` still clears all timers after bounded retries

### Property-Based Tests

- Generate random attempt counts and verify: if `attempt >= max`, no timer scheduled; if `attempt < max` and delivery fails, timer scheduled (Property 1 + Property 3)
- Generate random sets of in-flight operations with random `targetNodeId` values and verify: operations where `targetNodeId === joiningNodeId` are excluded, all others are included (Property 2 + Property 4)
- Generate random mixes of self-targeted and non-self-targeted operations and verify the in-flight count equals only the non-self-targeted count

### Integration Tests

- Test full rolling restart scenario where bounded retries prevent memory leak and node converges within timeout
- Test that a joining node with self-targeted ADD operations completes join readiness and the operations subsequently complete via the rebalance coordinator
- Test that `CDCGroupPropagationService.stop()` correctly cleans up bounded background retry timers
