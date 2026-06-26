# CDC Sliding Window Catchup Bugfix Design

## Overview

CDC events are permanently lost for late-arriving subscribers because `CDCEventBuffer` discards events after delivery. During topology transitions (node joins, seed restarts, partition splits), new subscribers find an empty buffer and receive no catchup, causing system cache divergence.

The fix adds a bounded sliding window (circular array, capacity 256) to the existing `CDCEventBuffer` class. After each successful delivery, the event is recorded in the sliding window. During `subscribeToCDCWithHandshake`, after replaying the pre-subscriber buffer, the handshake also replays recent events from the sliding window, deduplicating via the existing `buildEventIdentity` function. This is a minimal, additive change — no new classes, no new state on `PartitionService`, no new delivery mechanisms.

## Glossary

- **Bug_Condition (C)**: A subscriber registers via `subscribeToCDCWithHandshake` after events have already been delivered to other subscribers and removed from the pre-subscriber buffer
- **Property (P)**: Late subscribers receive recent events from the sliding window, deduplicated against any events already replayed from the pre-subscriber buffer
- **Preservation**: Pre-subscriber buffering, `replay()`, retry buffering via `bufferCDCEventForRetry`, and steady-state delivery to existing subscribers remain unchanged
- **CDCEventBuffer**: The class in `src/partition/cdc-event-buffer.js` that buffers CDC events before subscribers register and replays them on subscription
- **buildEventIdentity**: Existing function in `cdc-event-buffer.js` that produces a deduplication key from `tableName:operation:primaryKey:timestamp`
- **Sliding window**: A bounded circular array of recently delivered CDC events, owned by `CDCEventBuffer`, capacity `CDC_EVENT_SLIDING_WINDOW_CAPACITY` (256)
- **Pre-subscriber buffer**: The existing `events[]` array in `CDCEventBuffer` that captures events when no subscribers exist

## Bug Details

### Bug Condition

The bug manifests when a new CDC subscriber registers after events have already been delivered to existing subscribers and cleared from the pre-subscriber buffer. The `subscribeToCDCWithHandshake` function finds an empty buffer and performs no catchup, so the late subscriber permanently misses all recently delivered events.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type CDCSubscriptionEvent
  OUTPUT: boolean

  RETURN input.subscriberRegistrationTime > input.lastEventDeliveryTime
         AND input.preSubscriberBufferSize = 0
         AND input.recentlyDeliveredEventCount > 0
END FUNCTION
```

### Examples

- **Node join**: Node B joins the cluster. Partition P1 on Node A has been delivering CDC events to Node C's message group. Node B's message group calls `subscribeToCDCWithHandshake` on P1. The pre-subscriber buffer is empty (events were already delivered to C). Node B receives zero catchup events. Expected: Node B receives recent events from the sliding window.

- **Seed restart**: The seed node crashes and restarts. During downtime, partitions on other nodes continue generating and delivering CDC events to surviving subscribers. When the seed re-subscribes, the pre-subscriber buffer is empty. The seed's rebuilt cache diverges from authoritative state. Expected: The seed receives recent events from the sliding window.

- **Split child subscription**: A partition split creates child partitions. The parent's CDC subscribers are already active. A new subscriber for the child partition registers late. The pre-subscriber buffer was already flushed. Expected: The late subscriber receives recent events from the sliding window.

- **Edge case — window full**: 300 events have been delivered. The sliding window (capacity 256) contains only the most recent 256. A late subscriber receives those 256 events. The oldest 44 are permanently lost. This is expected bounded behavior.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Pre-subscriber buffering via `CDCEventBuffer.buffer()` must continue to capture events when no subscribers exist
- `CDCEventBuffer.replay()` must continue to replay buffered events and clear the buffer after replay
- `bufferCDCEventForRetry` must continue to re-buffer events on delivery failure without interference from the sliding window
- Steady-state delivery to existing subscribers via `generateCDCEvent` must remain unchanged
- `subscribeToCDCWithHandshake` returning `already_subscribed` for duplicate subscriptions must remain unchanged
- The handshake response structure must remain backward-compatible (new fields are additive)

**Scope:**
All inputs that do NOT involve a late-arriving subscriber (i.e., the pre-subscriber buffer is non-empty, or no events have been delivered yet) should be completely unaffected by this fix. This includes:
- Normal first-subscriber registration with buffered events
- Steady-state event delivery to active subscribers
- Event buffering when no subscribers exist
- Retry buffering on delivery failure
- Unsubscription via `unsubscribeFromCDC`

## Hypothesized Root Cause

Based on the bug description, the root cause is a design gap rather than a code defect:

1. **No post-delivery retention**: `CDCEventBuffer` was designed as a pre-subscriber buffer only. Once events are delivered (via `replay()` or `flushBufferedCDCEvents`), they are removed from the buffer with no retained history. There is no mechanism to serve catchup to subscribers that arrive after delivery.

2. **Handshake only checks pre-subscriber buffer**: `subscribeToCDCWithHandshake` determines catchup mode solely based on `this.owner.cdcEventBuffer.size()`. If the buffer is empty, `catchupMode` is set to `CATCHUP_MODE_NONE` and no replay occurs. There is no secondary source of recent events.

3. **No recording at delivery site**: Neither `generateCDCEvent` (direct delivery path) nor `flushBufferedCDCEvents` (buffer replay path) records delivered events anywhere. Once delivery succeeds, the event reference is lost.

The fix addresses all three gaps by adding a sliding window to `CDCEventBuffer` that retains recently delivered events, and integrating it into the handshake catchup flow.

## Correctness Properties

Property 1: Bug Condition - Late Subscriber Receives Recent Events

_For any_ subscriber that registers via `subscribeToCDCWithHandshake` after events have been delivered to other subscribers (isBugCondition returns true), the fixed handshake SHALL replay events from the sliding window that the subscriber has not yet seen, deduplicated via `buildEventIdentity`, so the subscriber receives recent CDC history.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Pre-Subscriber Buffer Behavior Unchanged

_For any_ input where the bug condition does NOT hold (pre-subscriber buffer has events, or no events have been delivered), the fixed code SHALL produce the same behavior as the original code, preserving pre-subscriber buffering, `replay()` semantics, retry buffering, and steady-state delivery.

**Validates: Requirements 3.1, 3.2, 3.4, 3.5, 3.6**

Property 3: Bounded Sliding Window

_For any_ sequence of `recordDelivered` calls, the sliding window size SHALL never exceed `CDC_EVENT_SLIDING_WINDOW_CAPACITY` (256). When full, the oldest event is evicted to make room for the new event.

**Validates: Requirements 2.1, 3.3**

Property 4: Deduplication Between Buffer Replay and Sliding Window Replay

_For any_ handshake where both the pre-subscriber buffer and the sliding window contain events, events SHALL be deduplicated using `buildEventIdentity` so no event is delivered twice to the same subscriber.

**Validates: Requirements 2.2**

Property 5: Delivery Failure Retry Unchanged

_For any_ CDC event delivery failure, the existing `bufferCDCEventForRetry` mechanism SHALL continue to operate without interference from the sliding window. The sliding window only records successfully delivered events.

**Validates: Requirements 3.4**

Property 6: Idempotent Recording

_For any_ CDC event recorded to the sliding window multiple times (e.g., replayed from buffer then delivered again), the sliding window SHALL contain the event without corrupting its state. Recording the same event twice is harmless — it simply occupies an additional slot.

**Validates: Requirements 2.1**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/constants/cdc-lifecycle-constants.js`

**Specific Changes**:
1. **Add sliding window capacity constant**: Add `CDC_EVENT_SLIDING_WINDOW_CAPACITY = NUM.TWO_HUNDRED_FIFTY_SIX` alongside the existing `CDC_EVENT_BUFFER_CAPACITY`.
2. **Export the new constant** from the module.

**File**: `src/constants/index.js`

**Specific Changes**:
1. **Re-export `CDC_EVENT_SLIDING_WINDOW_CAPACITY`** from the cdc-lifecycle-constants barrel export.

**File**: `src/partition/cdc-event-buffer.js`

**Function**: `CDCEventBuffer` class

**Specific Changes**:
1. **Add `recentEvents` circular array**: Initialize `this.recentEvents = []` and `this.recentEventsHead = 0` in the constructor. Import `CDC_EVENT_SLIDING_WINDOW_CAPACITY`. Store `this.slidingWindowCapacity` from options or the constant.
2. **Add `recordDelivered(cdcEvent)` method**: Appends the event to the circular array. When `recentEvents.length < slidingWindowCapacity`, push. When full, overwrite at `recentEventsHead` index and advance head `(head + 1) % capacity`. No logging on eviction (normal operation).
3. **Add `getRecentEvents()` method**: Returns a copy of the sliding window contents in insertion order. When the array is not full, return `this.recentEvents.slice()`. When full, return `[...recentEvents.slice(head), ...recentEvents.slice(0, head)]`.
4. **Add `recentEventsSize()` method**: Returns `this.recentEvents.length`.
5. **Add `clearRecentEvents()` method**: Resets `this.recentEvents = []` and `this.recentEventsHead = 0`. Used in `clear()` to reset all state.
6. **Update `clear()` method**: Also call `this.clearRecentEvents()` to reset the sliding window when the buffer is fully cleared.

**File**: `src/partition/partition-service.js`

**Function**: `generateCDCEvent`

**Specific Changes**:
1. **Record to sliding window after successful delivery**: After the delivery loop completes with zero failures (the path that reaches `CDC_DELIVERY_COMPLETE` log), call `this.cdcEventBuffer.recordDelivered(cdcEvent)` before the metrics increment. This is the only direct-delivery recording site.

**File**: `src/partition/partition-cdc-delivery.js`

**Function**: `flushBufferedCDCEvents`

**Specific Changes**:
1. **Record to sliding window during buffer replay**: Inside the `replay` callback, after delivering to all subscribers and incrementing the `EVENTS_DELIVERED` metric, call `this.owner.cdcEventBuffer.recordDelivered(cdcEvent)`. This ensures events replayed from the pre-subscriber buffer also enter the sliding window.

**Function**: `subscribeToCDCWithHandshake`

**Specific Changes**:
1. **Replay from sliding window after pre-subscriber buffer replay**: After the existing buffer replay block (whether it ran or not), add a sliding window replay phase. Call `this.owner.cdcEventBuffer.getRecentEvents()` to get recent events. Build a `deliveredIdentities` Set from events already delivered during the buffer replay phase (using `buildEventIdentity`). Iterate the sliding window events, skip any whose identity is in `deliveredIdentities`, and deliver the rest to the wrapper. Track `slidingWindowEventsReplayed` count.
2. **Update handshake response**: Add `slidingWindowEventsReplayed` to the `catchup` object in the handshake response. Update `catchupMode` to a new `CATCHUP_MODE_SLIDING_WINDOW` when the pre-subscriber buffer was empty but the sliding window had events.
3. **Track delivered identities during buffer replay**: Pass a `deliveredIdentities` Set to `replay()` (it already accepts this parameter) and reuse it for sliding window dedup.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that late subscribers receive zero catchup events when the pre-subscriber buffer is empty.

**Test Plan**: Write tests that create a `CDCEventBuffer`, deliver events to an initial subscriber via the handshake flow, then register a second subscriber and observe that it receives no catchup. Run these tests on the UNFIXED code to observe failures and confirm the root cause.

**Test Cases**:
1. **Late subscriber gets no catchup**: Deliver events to subscriber A, then register subscriber B. Assert B receives zero catchup events (will fail on unfixed code — confirms the bug)
2. **Node join scenario**: Simulate a partition with active CDC delivery, then a new message group subscribing. Assert the new subscriber misses recent events (will fail on unfixed code)
3. **Seed restart scenario**: Simulate events delivered during seed downtime, then seed re-subscribes. Assert seed receives zero catchup (will fail on unfixed code)

**Expected Counterexamples**:
- `subscribeToCDCWithHandshake` returns `catchupMode: 'none'` and `bufferedEventsReplayed: 0` for late subscribers
- The pre-subscriber buffer is empty because events were already delivered to existing subscribers

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  // Deliver events to existing subscribers
  deliverEvents(cdcEventBuffer, events, existingSubscribers)
  // Register late subscriber
  handshake := subscribeToCDCWithHandshake'(lateSubscriber)
  // Assert catchup from sliding window
  ASSERT handshake.catchup.slidingWindowEventsReplayed > 0
  ASSERT lateSubscriber received recent events
  ASSERT no duplicate events delivered (via buildEventIdentity)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT CDCEventBuffer.buffer(input) behaves identically
  ASSERT CDCEventBuffer.replay(input) behaves identically
  ASSERT subscribeToCDCWithHandshake(input) produces same handshake
  ASSERT generateCDCEvent(input) delivers to same subscribers
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for pre-subscriber buffering, replay, and steady-state delivery, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Pre-subscriber buffer preservation**: Verify that `buffer()` and `replay()` work identically with the sliding window present — buffer captures events when no subscribers exist, replay delivers them and clears the buffer
2. **Retry buffer preservation**: Verify that `bufferCDCEventForRetry` continues to work when delivery fails, independent of the sliding window
3. **Steady-state delivery preservation**: Verify that `generateCDCEvent` delivers to active subscribers identically, with the only addition being the `recordDelivered` call
4. **Already-subscribed preservation**: Verify that re-subscribing returns `already_subscribed` status unchanged

### Unit Tests

- `CDCEventBuffer.recordDelivered()` — records events into the sliding window
- `CDCEventBuffer.recordDelivered()` — evicts oldest when at capacity (circular array semantics)
- `CDCEventBuffer.getRecentEvents()` — returns events in insertion order
- `CDCEventBuffer.getRecentEvents()` — returns empty array when no events recorded
- `CDCEventBuffer.recentEventsSize()` — tracks count correctly
- `CDCEventBuffer.clear()` — also clears the sliding window
- Sliding window does not interfere with pre-subscriber buffer operations
- `recordDelivered` is idempotent (recording same event twice does not corrupt state)

### Property-Based Tests

- Generate random sequences of `recordDelivered` calls and verify `getRecentEvents()` always returns at most `CDC_EVENT_SLIDING_WINDOW_CAPACITY` events in correct insertion order
- Generate random interleaving of `buffer()`, `replay()`, and `recordDelivered()` calls and verify pre-subscriber buffer behavior is unchanged
- Generate random CDC events and verify deduplication via `buildEventIdentity` correctly prevents duplicate delivery during sliding window replay

### Integration Tests

- Full handshake flow: deliver events to subscriber A, then subscriber B registers and receives sliding window catchup
- Handshake with both pre-subscriber buffer and sliding window events — deduplication works correctly
- Handshake with empty sliding window — behaves identically to unfixed code
- `generateCDCEvent` records to sliding window after successful delivery
- `flushBufferedCDCEvents` records to sliding window during buffer replay
