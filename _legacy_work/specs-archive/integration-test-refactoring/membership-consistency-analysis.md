# Membership Consistency Integration Test Analysis

## Overview

This document analyzes each test in `test/integration/membership-consistency.integration.test.js` to determine whether it can use real components or needs minimal mocking (specifically CDC latency simulation).

**Key Insight**: The membership-consistency tests are specifically designed to test **CDC propagation latency effects** on membership decisions. Unlike other integration tests that mock components unnecessarily, these tests have a legitimate need for controlled CDC latency simulation to verify that the system handles eventual consistency correctly.

## Analysis Summary

| Test # | Test Name | Decision | Rationale |
|--------|-----------|----------|-----------|
| 1 | CDC latency causes temporary membership divergence | **Keep CDC latency simulation** | Core purpose is testing CDC latency effects |
| 2 | rebalancer sees stale membership during CDC propagation | **Keep CDC latency simulation** | Tests stale view during propagation |
| 3 | lease expires during rebalancer stabilization period | **Use real components** | Tests lease expiration, not CDC latency |
| 4 | rapid node state changes cause membership oscillation | **Use real components** | Tests cache change tracking, not CDC |
| 5 | failure detector may see stale heartbeat due to CDC latency | **Keep CDC latency simulation** | Tests CDC latency effect on failure detection |
| 6 | lease sweep may miss nodes due to CDC propagation delay | **Keep CDC latency simulation** | Tests CDC latency effect on lease sweep |
| 7 | concurrent rebalancers may make conflicting decisions | **Use real components** | Tests concurrent decisions, not CDC latency |
| 8 | WebSocket disconnection not reflected in cache | **Use real components** | Tests WS state vs cache divergence |
| 9 | timing parameters are properly coordinated | **Use real components** | Pure configuration validation test |
| 10 | bootstrap data is consistent after mode transition | **Use real BootstrapService** | Can use real bootstrap flow |
| 11 | node join and failure occur simultaneously | **Use real components** | Tests concurrent operations |
| 12 | out-of-order CDC events are handled correctly | **Use real CDCHandler** | Already uses real CDCHandler |
| 13 | stabilization timer resets on each state change | **Use real components** | Tests rebalancer timer logic |
| 14 | getReadyNodes returns consistent results across caches | **Use real components** | Tests cache consistency logic |
| 15 | failure detector increases threshold on flapping | **Use real components** | Tests failure detector logic |
| 16 | non-leader forwards control messages to leader | **Use real components** | Tests message forwarding |

## Detailed Analysis

### Test 1: CDC latency causes temporary membership divergence
**Decision: Keep CDC latency simulation**

**Rationale**: This test's core purpose is to verify that CDC propagation latency causes temporary divergence between leader and follower caches. The `createRealisticCDCService` with configurable `propagationDelayMs` is essential to demonstrate this behavior.

**What to keep**:
- `createRealisticCDCService` with controlled delay
- Two separate `SystemTableCache` instances (leader/follower)

**What can be improved**:
- The test is already well-structured for its purpose
- No changes needed

---

### Test 2: rebalancer sees stale membership during CDC propagation
**Decision: Keep CDC latency simulation**

**Rationale**: This test verifies that the rebalancer makes decisions based on potentially stale membership data during CDC propagation. The controlled delay is essential to demonstrate the stale view.

**What to keep**:
- `createRealisticCDCService` with controlled delay
- Separate caches for leader and rebalancer

**What can be improved**:
- Could use real `UnifiedRebalancer` (already does)
- Mock `TablePolicyService` and `RebalanceCoordinator` are acceptable here since we're testing the rebalancer's view of membership, not the actual rebalancing operations

---

### Test 3: lease expires during rebalancer stabilization period
**Decision: Use real components**

**Rationale**: This test verifies that lease expiration is detected during the stabilization period. It doesn't require CDC latency simulation - it's testing the rebalancer's handling of lease expiration.

**Current mocks that can be removed**:
- `createMockTablePolicyService()` - could use real TablePolicyService
- `createMockMessageRouter()` - could use real MessageRouter
- `createMockRebalanceCoordinator()` - could use real RebalanceCoordinator

**Recommended approach**:
- Use real `BootstrapService` to create a seed node
- Use real `SystemTableCache` from `NodeService.getInstance()`
- Use real `CDCIntegrationService` from bootstrap result
- Use real `UnifiedRebalancer` with real dependencies

---

### Test 4: rapid node state changes cause membership oscillation
**Decision: Use real components**

**Rationale**: This test verifies that rapid state changes are tracked correctly by the cache. It uses `createRealisticCDCService` but only for the update operations, not for latency simulation.

**Current mocks that can be removed**:
- The CDC service is used for updates, not latency simulation

**Recommended approach**:
- Use real `BootstrapService` to create a seed node
- Use real `CDCIntegrationService` for updates
- The test is primarily about cache change tracking

---

### Test 5: failure detector may see stale heartbeat due to CDC latency
**Decision: Keep CDC latency simulation**

**Rationale**: This test specifically verifies that the failure detector sees stale heartbeat data due to CDC propagation latency. The controlled delay is essential.

**What to keep**:
- `createRealisticCDCService` with controlled delay
- Separate caches for leader and detector

**What can be improved**:
- Uses real `FailureDetector` (good)
- The wrapping of CDC service to track updates is acceptable

---

### Test 6: lease sweep may miss nodes due to CDC propagation delay
**Decision: Keep CDC latency simulation**

**Rationale**: This test verifies that lease sweep operations may have inconsistent views due to CDC propagation delay. The controlled delay is essential.

**What to keep**:
- `createRealisticCDCService` with controlled delay
- Separate caches for leader and follower

**What can be improved**:
- `MockMessageGroupService` could potentially be replaced with real component
- `createMockMessageRouter()` could be replaced with real MessageRouter
- `createMockRebalanceCoordinator()` could be replaced with real RebalanceCoordinator

---

### Test 7: concurrent rebalancers may make conflicting decisions
**Decision: Use real components**

**Rationale**: This test verifies that concurrent rebalancers on different nodes may make conflicting decisions. It doesn't require CDC latency simulation - it's testing concurrent decision-making.

**Current mocks that can be removed**:
- `createMockTablePolicyService()` - could use real TablePolicyService
- `createMockMessageRouter()` - could use real MessageRouter
- `createMockRebalanceCoordinator()` - could use real RebalanceCoordinator

**Recommended approach**:
- Use real `BootstrapService` to create a multi-node cluster
- Use real `UnifiedRebalancer` instances with real dependencies

---

### Test 8: WebSocket disconnection not reflected in cache
**Decision: Use real components with minimal mocking**

**Rationale**: This test verifies that WebSocket connection state can diverge from cache state. The mock message router is needed to simulate a specific connection state.

**What to keep**:
- `createMockMessageRouter()` with `setConnectionState()` - needed to simulate disconnected state

**What can be improved**:
- `MockMessageGroupService` could potentially be replaced
- `createMockRebalanceCoordinator()` could be replaced with real RebalanceCoordinator

**Note**: This test legitimately needs to mock the message router to simulate a specific connection state that would be difficult to achieve with real components.

---

### Test 9: timing parameters are properly coordinated
**Decision: Use real components (no changes needed)**

**Rationale**: This is a pure configuration validation test that verifies timing constants are properly coordinated. It doesn't use any mocks and doesn't need real components.

**Status**: Already correct - no mocks used, just validates constants.

---

### Test 10: bootstrap data is consistent after mode transition
**Decision: Use real BootstrapService**

**Rationale**: This test verifies that bootstrap data is consistent after transitioning from bootstrap mode to normal mode. It should use real `BootstrapService` instead of manually creating caches.

**Current approach**:
- Manually creates `SystemTableCache` instances
- Manually applies changes to simulate bootstrap

**Recommended approach**:
- Use real `BootstrapService` to create a seed node
- Verify cache consistency using real bootstrap flow
- The test can verify that follower nodes receive bootstrap data via CDC

---

### Test 11: node join and failure occur simultaneously
**Decision: Use real components**

**Rationale**: This test verifies that node join and failure detection can occur simultaneously. It should use real components.

**Current mocks that can be removed**:
- The tracking CDC service wrapper is acceptable for verification

**Recommended approach**:
- Use real `BootstrapService` to create a seed node
- Use real `FailureDetector` (already does)
- Use real `CDCIntegrationService` for operations

---

### Test 12: out-of-order CDC events are handled correctly
**Decision: Use real CDCHandler (already does)**

**Rationale**: This test verifies that out-of-order CDC events are handled correctly by the CDCHandler. It already uses the real `CDCHandler` class.

**Status**: Already correct - uses real `CDCHandler`.

---

### Test 13: stabilization timer resets on each state change
**Decision: Use real components**

**Rationale**: This test verifies that the rebalancer's stabilization timer resets on state changes. It should use real components.

**Current mocks that can be removed**:
- `createMockTablePolicyService()` - could use real TablePolicyService
- `createMockMessageRouter()` - could use real MessageRouter
- `createMockRebalanceCoordinator()` - could use real RebalanceCoordinator

**Recommended approach**:
- Use real `BootstrapService` to create a seed node
- Use real `UnifiedRebalancer` with real dependencies

---

### Test 14: getReadyNodes returns consistent results across caches
**Decision: Use real components (no changes needed)**

**Rationale**: This test verifies that `getReadyNodes()` returns consistent results across caches with the same data. It doesn't use any mocks.

**Status**: Already correct - no mocks used, just tests cache logic.

---

### Test 15: failure detector increases threshold on flapping
**Decision: Use real components**

**Rationale**: This test verifies that the failure detector increases its threshold when flapping is detected. It should use real components.

**Current mocks that can be removed**:
- `createRealisticCDCService` is used but not for latency simulation

**Recommended approach**:
- Use real `BootstrapService` to create a seed node
- Use real `FailureDetector` (already does)
- Use real `CDCIntegrationService`

---

### Test 16: non-leader forwards control messages to leader
**Decision: Use real components with minimal mocking**

**Rationale**: This test verifies that non-leader control plane instances forward messages to the leader. The `MockMessageGroupService` is needed to simulate a follower replica.

**What to keep**:
- `MockMessageGroupService` with `isLeader: false` - needed to simulate follower behavior

**What can be improved**:
- `createMockMessageRouter()` could be replaced with real MessageRouter
- `createMockRebalanceCoordinator()` could be replaced with real RebalanceCoordinator

**Note**: This test legitimately needs to mock the message group service to simulate follower behavior.

---

## Summary of Decisions

### Tests that MUST keep CDC latency simulation (4 tests):
1. **Test 1**: CDC latency causes temporary membership divergence
2. **Test 2**: rebalancer sees stale membership during CDC propagation
3. **Test 5**: failure detector may see stale heartbeat due to CDC latency
4. **Test 6**: lease sweep may miss nodes due to CDC propagation delay

These tests are specifically designed to verify CDC latency effects and require controlled delay injection.

### Tests that can use real BootstrapService (8 tests):
1. **Test 3**: lease expires during rebalancer stabilization period
2. **Test 4**: rapid node state changes cause membership oscillation
3. **Test 7**: concurrent rebalancers may make conflicting decisions
4. **Test 10**: bootstrap data is consistent after mode transition
5. **Test 11**: node join and failure occur simultaneously
6. **Test 13**: stabilization timer resets on each state change
7. **Test 15**: failure detector increases threshold on flapping
8. **Test 16**: non-leader forwards control messages to leader (partial)

### Tests that are already correct (3 tests):
1. **Test 9**: timing parameters are properly coordinated (pure config validation)
2. **Test 12**: out-of-order CDC events are handled correctly (uses real CDCHandler)
3. **Test 14**: getReadyNodes returns consistent results across caches (no mocks)

### Tests that need minimal mocking for specific scenarios (2 tests):
1. **Test 8**: WebSocket disconnection not reflected in cache - needs mock router for connection state
2. **Test 16**: non-leader forwards control messages to leader - needs mock message group for follower simulation

---

## Recommended Refactoring Approach

### Phase 1: Keep CDC Latency Tests As-Is
The `createRealisticCDCService` helper is well-designed and serves a legitimate purpose. Tests 1, 2, 5, and 6 should keep this pattern.

### Phase 2: Refactor Tests to Use Real BootstrapService
For tests 3, 4, 7, 10, 11, 13, 15:
1. Use `initializeTestEnvironment()` from cluster-test-helpers.js
2. Use `BootstrapService` to create seed node
3. Use real `SystemTableCache` from `NodeService.getInstance()`
4. Use real `CDCIntegrationService` from bootstrap result
5. Use `cleanupTestEnvironment()` in finally block

### Phase 3: Document Minimal Mocking
For tests 8 and 16, document why minimal mocking is necessary:
- Test 8: Mock router needed to simulate specific connection state
- Test 16: Mock message group needed to simulate follower behavior

---

## Requirements Validation

This analysis validates:
- **Requirement 6.2**: Tests verify the same functional requirements (CDC latency effects)
- **Requirement 6.4**: Tests that cannot use real components are documented with justification

The CDC latency simulation tests are a legitimate use case for controlled mocking because:
1. They test eventual consistency behavior that requires precise timing control
2. Real CDC propagation timing would be non-deterministic and make tests flaky
3. The mocking is minimal and focused on delay injection, not bypassing real logic
