# Bugfix Requirements Document

## Introduction

CDC events can be permanently lost for late-arriving subscribers during topology transitions (partition splits, node joins, seed restarts). The `CDCEventBuffer` only retains events until they are delivered to current subscribers. Once events are delivered and removed from the buffer, a new subscriber that registers via `subscribeToCDCWithHandshake` finds an empty buffer and receives no catchup. This causes system cache divergence on newly joined or restarted nodes, leading to stale metadata and cluster instability.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a CDC event is generated and delivered to all current subscribers THEN the system removes the event from `CDCEventBuffer` with no retained history, making it permanently unavailable to future subscribers

1.2 WHEN a new subscriber registers via `subscribeToCDCWithHandshake` after events have already been delivered to existing subscribers THEN the system finds an empty `CDCEventBuffer` and performs no catchup, resulting in the subscriber missing all recently delivered events

1.3 WHEN a node joins the cluster and its message group subscribes to CDC on a partition that already has active subscribers THEN the system delivers zero catchup events because the buffer was already flushed by prior deliveries, causing the joiner's system cache to lack rows created before subscription

1.4 WHEN a seed node restarts and re-subscribes to CDC on partitions that continued generating events during the restart window THEN the system provides no catchup for events delivered to other subscribers during the downtime, causing the seed's rebuilt cache to diverge from authoritative state

### Expected Behavior (Correct)

2.1 WHEN a CDC event is generated and delivered to all current subscribers THEN the system SHALL retain the event in a bounded sliding window within `CDCEventBuffer` so it remains available for catchup by future subscribers

2.2 WHEN a new subscriber registers via `subscribeToCDCWithHandshake` after events have already been delivered to existing subscribers THEN the system SHALL replay events from the sliding window that the subscriber has not yet seen, using `buildEventIdentity` for deduplication

2.3 WHEN a node joins the cluster and its message group subscribes to CDC on a partition that already has active subscribers THEN the system SHALL deliver recent events from the sliding window as catchup, ensuring the joiner's system cache receives rows created before subscription

2.4 WHEN a seed node restarts and re-subscribes to CDC on partitions that continued generating events during the restart window THEN the system SHALL deliver recent events from the sliding window as catchup, allowing the seed's cache to converge with authoritative state

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a CDC event is generated with no subscribers registered THEN the system SHALL CONTINUE TO buffer the event in the existing pre-subscriber buffer (not the sliding window) for replay when the first subscriber registers

3.2 WHEN a subscriber registers via `subscribeToCDCWithHandshake` and the pre-subscriber buffer has events THEN the system SHALL CONTINUE TO replay those buffered events via the existing `replay()` mechanism before entering steady-state delivery

3.3 WHEN the sliding window reaches its fixed capacity THEN the system SHALL CONTINUE TO operate within bounded memory by evicting the oldest event when a new event is recorded, never growing unbounded

3.4 WHEN a CDC event delivery fails for a subscriber THEN the system SHALL CONTINUE TO buffer the event for retry via the existing `bufferCDCEventForRetry` mechanism without interference from the sliding window

3.5 WHEN events are replayed from the pre-subscriber buffer during handshake catchup THEN the system SHALL CONTINUE TO clear the pre-subscriber buffer after replay as it does today

3.6 WHEN a subscriber is already subscribed and `subscribeToCDCWithHandshake` is called again THEN the system SHALL CONTINUE TO return the existing wrapper with `already_subscribed` status

---

## Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type CDCSubscriptionEvent
  OUTPUT: boolean

  // The bug triggers when a subscriber registers AFTER events have
  // already been delivered to other subscribers and removed from the
  // pre-subscriber buffer.
  RETURN X.subscriberRegistrationTime > X.lastEventDeliveryTime
    AND X.preSubscriberBufferSize = 0
    AND X.recentlyDeliveredEventCount > 0
END FUNCTION
```

## Fix Property

```pascal
// Property: Fix Checking — Late subscriber catchup
FOR ALL X WHERE isBugCondition(X) DO
  handshake ← subscribeToCDCWithHandshake'(X.subscriber)
  recentEvents ← cdcEventBuffer.getRecentEvents()
  ASSERT handshake.catchup.bufferedEventsReplayed >= MIN(
    recentEvents.length,
    eventsDeliveredSinceSubscriberLastSeen
  )
  ASSERT no events in recentEvents are duplicated in delivery
    (verified via buildEventIdentity)
END FOR
```

## Preservation Property

```pascal
// Property: Preservation Checking — Existing behavior unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT subscribeToCDCWithHandshake(X) = subscribeToCDCWithHandshake'(X)
  ASSERT generateCDCEvent(X) delivers to same subscribers as before
  ASSERT CDCEventBuffer.buffer(X) behaves identically
  ASSERT CDCEventBuffer.replay(X) behaves identically
END FOR
```
