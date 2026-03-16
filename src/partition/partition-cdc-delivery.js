/**
 * CDC delivery logic extracted from PartitionService.
 * Manages CDC subscriber registration, event delivery, buffering, and replay.
 *
 * This is a helper class that operates on the owning PartitionService's state.
 * It receives the owner via constructor and reads/writes CDC-related fields
 * directly on it, keeping the mutable state in one place.
 */

import {NUM, TABLES} from '../constants/index.js';
import {
  CDC_PIPELINE_METRIC,
  CDC_LIFECYCLE_LOG_MSG,
} from '../constants/cdc-lifecycle-constants.js';
import {getTableCdcPolicy} from '../cache/cdc-table-policy.js';
import {buildEventIdentity} from './cdc-event-buffer.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  PARTITION_SERVICE_CDC,
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_TYPE,
} from './partition-service-constants.js';

const CDC_NO_SUBSCRIBER_BUFFER_SUPPRESSED_TABLES = new Set([
  SYSTEM_TABLE_NAME.LOGS,
]);

/**
 * Parse external CDC allowed override from table policy JSON.
 * @param {string|Object|null} rawPolicy - Raw table_policies value.
 * @return {boolean|null} Override value or null when absent.
 */
function parseExternalCdcAllowedOverride(rawPolicy) {
  if (!rawPolicy) {
    return null;
  }

  let policy = rawPolicy;
  if (typeof policy === 'string') {
    try {
      policy = JSON.parse(policy);
    } catch (_parseErr) {
      return null;
    }
  }

  if (!policy || typeof policy !== 'object') {
    return null;
  }
  if (typeof policy.externalCdcAllowed === 'boolean') {
    return policy.externalCdcAllowed;
  }
  if (typeof policy.changeDataCapture?.externalCdcAllowed === 'boolean') {
    return policy.changeDataCapture.externalCdcAllowed;
  }
  return null;
}

/**
 * Check whether a value is a valid CDC subscriber.
 * @param {*} subscriber - Candidate subscriber.
 * @return {boolean} True when subscriber is valid.
 */
function isCDCSubscriber(subscriber) {
  if (typeof subscriber === PARTITION_SERVICE_TYPE.FUNCTION) {
    return true;
  }
  return Boolean(
    subscriber &&
    typeof subscriber.handleCDCEvent === PARTITION_SERVICE_TYPE.FUNCTION,
  );
}

/**
 * Helper class encapsulating CDC delivery, subscription, and buffering logic.
 *
 * Operates directly on the owning PartitionService instance's mutable state
 * so that the single source of truth for CDC fields remains on the owner.
 */
class PartitionCDCDelivery {
  /**
   * @param {Object} owner - The PartitionService instance that owns CDC state.
   */
  constructor(owner) {
    this.owner = owner;
  }

  /**
   * Resolve whether late-subscriber external CDC is enabled for a table.
   * @param {string} tableName - Table name.
   * @return {boolean} True when external CDC buffering should remain enabled.
   */
  isExternalCdcAllowedForTable(tableName) {
    if (!tableName || tableName !== this.owner.tableName) {
      return getTableCdcPolicy(tableName)?.externalCdcAllowed === true;
    }
    if (typeof this.owner.externalCdcAllowed === 'boolean') {
      return this.owner.externalCdcAllowed;
    }
    const tableRow =
      this.owner.systemTableCache?.get?.(TABLES.TABLES, this.owner.tableId) ||
      null;
    const policyOverride = parseExternalCdcAllowedOverride(
      tableRow?.table_policies || null,
    );
    if (typeof policyOverride === 'boolean') {
      return policyOverride;
    }
    return getTableCdcPolicy(tableName)?.externalCdcAllowed === true;
  }

  /**
   * Determine whether CDC events should be buffered when there are no
   * subscribers yet.
   * @param {string} tableName - Table name.
   * @return {boolean} True when buffering should stay enabled.
   */
  shouldBufferCdcWithoutSubscribers(tableName) {
    if (CDC_NO_SUBSCRIBER_BUFFER_SUPPRESSED_TABLES.has(tableName)) {
      return false;
    }
    const policy = getTableCdcPolicy(tableName, {
      externalCdcAllowed: this.isExternalCdcAllowedForTable(tableName),
    });
    return policy.internalCachePropagation === true ||
      policy.externalCdcAllowed === true;
  }

  /**
   * Allocate next CDC event sequence number.
   * @return {number} Monotonic sequence number.
   */
  nextCDCEventSequenceNumber() {
    this.owner.cdcEventSequenceNumber += NUM.ONE;
    return this.owner.cdcEventSequenceNumber;
  }

  /**
   * Buffer one CDC event for retry and schedule replay when possible.
   * @param {Object} cdcEvent - Event payload.
   * @param {string} reason - Buffering reason.
   * @return {boolean} True when buffered, false when dropped.
   */
  bufferCDCEventForRetry(cdcEvent, reason) {
    if (!this.shouldBufferCdcWithoutSubscribers(cdcEvent.tableName)) {
      return false;
    }

    const buffered = this.owner.cdcEventBuffer.buffer(cdcEvent);
    if (buffered) {
      this.owner.cdcPipelineMetrics.increment(
        CDC_PIPELINE_METRIC.EVENTS_BUFFERED,
      );
      this.owner.logger.warn(
        PARTITION_SERVICE_LOG_MSG.CDC_DELIVERY_BUFFERED_FOR_RETRY, {
          partitionId: this.owner.partitionId,
          tableName: cdcEvent.tableName,
          operation: cdcEvent.operation,
          reason,
          bufferedEvents: this.owner.cdcEventBuffer.size(),
        });
      this.scheduleBufferedCDCReplay(reason);
      return true;
    }

    this.owner.cdcPipelineMetrics.increment(
      CDC_PIPELINE_METRIC.EVENTS_DROPPED,
    );
    this.owner.logger.warn(CDC_LIFECYCLE_LOG_MSG.EVENT_DROPPED_OVERFLOW, {
      partitionId: this.owner.partitionId,
      tableName: cdcEvent.tableName,
      operation: cdcEvent.operation,
      reason,
      bufferedEvents: this.owner.cdcEventBuffer.size(),
      bufferCapacity: this.owner.cdcEventBuffer.capacity,
    });
    return false;
  }

  /**
   * Schedule buffered CDC replay with bounded backoff.
   * @param {string} reason - Trigger reason.
   */
  scheduleBufferedCDCReplay(reason) {
    if (this.owner.cdcBufferReplayTimer ||
        this.owner.cdcBufferReplayInFlight) {
      return;
    }
    if (this.owner.isShutdown) {
      this.owner.logger.debug(
        PARTITION_SERVICE_LOG_MSG.TIMER_SKIPPED_AFTER_SHUTDOWN, {
          partitionId: this.owner.partitionId,
          timer: 'cdcBufferReplayTimer',
        });
      return;
    }
    if (this.owner.cdcSubscribers.size === NUM.ZERO ||
        !this.owner.cdcEventBuffer.hasEvents()) {
      return;
    }

    const retryDelayMs = Math.max(
      NUM.ONE,
      Math.floor(this.owner.cdcBufferReplayDelayMs),
    );
    this.owner.logger.debug(
      PARTITION_SERVICE_LOG_MSG.CDC_BUFFER_REPLAY_SCHEDULED, {
        partitionId: this.owner.partitionId,
        reason,
        retryDelayMs,
        bufferedEvents: this.owner.cdcEventBuffer.size(),
        subscriberCount: this.owner.cdcSubscribers.size,
      });

    this.owner.cdcBufferReplayTimer = setTimeout(() => {
      this.owner.cdcBufferReplayTimer = null;
      this.flushBufferedCDCEvents(reason).catch((error) => {
        this.owner.logger.warn(
          PARTITION_SERVICE_LOG_MSG.CDC_BUFFER_REPLAY_FAILED, {
            partitionId: this.owner.partitionId,
            reason,
            error: error.message,
          });
      });
    }, retryDelayMs);
  }

  /**
   * Replay buffered CDC events to current subscribers.
   * @param {string} reason - Trigger reason.
   * @return {Promise<void>}
   */
  async flushBufferedCDCEvents(reason) {
    if (this.owner.cdcBufferReplayInFlight) {
      return;
    }
    if (this.owner.cdcSubscribers.size === NUM.ZERO ||
        !this.owner.cdcEventBuffer.hasEvents()) {
      return;
    }

    this.owner.cdcBufferReplayInFlight = true;
    let replayedEvents = NUM.ZERO;
    try {
      while (this.owner.cdcSubscribers.size > NUM.ZERO &&
             this.owner.cdcEventBuffer.hasEvents()) {
        const replayedCount = await this.owner.cdcEventBuffer.replay(
          async (cdcEvent) => {
            const subscribers = [...this.owner.cdcSubscribers];
            for (const subscriber of subscribers) {
              await this.deliverCDCEventToSubscriber(subscriber, cdcEvent);
            }
            this.owner.cdcPipelineMetrics.increment(
              CDC_PIPELINE_METRIC.EVENTS_DELIVERED,
            );
            this.owner.emit(PARTITION_SERVICE_EVENT.CDC_EVENT, cdcEvent);
          });
        replayedEvents += replayedCount;
        if (replayedCount === NUM.ZERO) {
          break;
        }
      }

      this.owner.cdcBufferReplayDelayMs =
        PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
      this.owner.logger.debug(
        PARTITION_SERVICE_LOG_MSG.CDC_BUFFER_REPLAY_COMPLETE, {
          partitionId: this.owner.partitionId,
          reason,
          replayedEvents,
          bufferedEvents: this.owner.cdcEventBuffer.size(),
        });
    } catch (error) {
      this.owner.cdcPipelineMetrics.increment(
        CDC_PIPELINE_METRIC.DELIVERY_FAILURES,
      );
      this.owner.cdcBufferReplayDelayMs = Math.min(
        PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_MAX_DELAY_MS,
        this.owner.cdcBufferReplayDelayMs * NUM.TWO,
      );
      this.owner.logger.warn(
        PARTITION_SERVICE_LOG_MSG.CDC_BUFFER_REPLAY_FAILED, {
          partitionId: this.owner.partitionId,
          reason,
          error: error.message,
          retryDelayMs: this.owner.cdcBufferReplayDelayMs,
          bufferedEvents: this.owner.cdcEventBuffer.size(),
        });
    } finally {
      this.owner.cdcBufferReplayInFlight = false;
    }

    if (this.owner.cdcSubscribers.size > NUM.ZERO &&
        this.owner.cdcEventBuffer.hasEvents()) {
      this.scheduleBufferedCDCReplay(
        PARTITION_SERVICE_CDC.REPLAY_REASON_BUFFERED_REMAINING,
      );
    }
  }

  /**
   * Resolve a stable subscriber identifier.
   * @param {Function|Object} subscriber - Subscriber.
   * @param {Object} options - Subscription options.
   * @return {string} Stable subscriber identifier.
   */
  resolveCDCSubscriberId(subscriber, options = {}) {
    const candidateId = options.subscriberId;
    if (typeof candidateId === 'string' && candidateId.length > NUM.ZERO) {
      return candidateId;
    }

    const existingState =
      this.owner.cdcSubscriberStates.get(subscriber);
    if (existingState?.subscriberId) {
      return existingState.subscriberId;
    }

    const fallbackOrdinal =
      this.owner.cdcSubscriberStates.size + NUM.ONE;
    return `${PARTITION_SERVICE_CDC.SUBSCRIBER_ID_PREFIX}-${fallbackOrdinal}`;
  }

  /**
   * Deliver one CDC event to a subscriber callback/object.
   * @param {Function|Object} subscriber - Subscriber callback/object.
   * @param {Object} cdcEvent - Event payload.
   * @return {Promise<void>}
   */
  async deliverCDCEventToSubscriber(subscriber, cdcEvent) {
    if (typeof subscriber === PARTITION_SERVICE_TYPE.FUNCTION) {
      await subscriber(cdcEvent);
      return;
    }
    await subscriber.handleCDCEvent(cdcEvent);
  }

  /**
   * Create a wrapper that enriches stream metadata for one subscriber.
   * @param {Function|Object} subscriber - Target subscriber.
   * @param {Object} subscriptionState - Mutable state for this subscriber.
   * @return {Function} Wrapper callback.
   */
  buildCDCSubscriberWrapper(subscriber, subscriptionState) {
    return async (cdcEvent) => {
      const sequencedEvent = Number.isFinite(cdcEvent.sequenceNumber) ?
        cdcEvent :
        {
          ...cdcEvent,
          sequenceNumber: this.nextCDCEventSequenceNumber(),
        };

      const decoratedEvent = {
        ...sequencedEvent,
        streamMode: subscriptionState.streamMode,
        subscriberId: subscriptionState.subscriberId,
        subscriptionEpoch: subscriptionState.subscriptionEpoch,
      };

      await this.deliverCDCEventToSubscriber(subscriber, decoratedEvent);
      this.owner.cdcEventBuffer.recordDelivered(cdcEvent);
      subscriptionState.lastDeliveredSequenceNumber =
        decoratedEvent.sequenceNumber;
      subscriptionState.lastDeliveredAt = Date.now();
    };
  }

  /**
   * Subscribe to CDC with explicit handshake acknowledgment and catch-up.
   * @param {Function|Object} subscriber - Subscriber function or object.
   * @param {Object} [options] - Handshake options.
   * @param {string} [options.subscriberId] - Stable subscriber identifier.
   * @return {Promise<Object>} Handshake acknowledgment.
   */
  async subscribeToCDCWithHandshake(subscriber, options = {}) {
    if (!isCDCSubscriber(subscriber)) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.CDC_INVALID_SUBSCRIBER);
    }

    const existingWrapper =
      this.owner.cdcSubscriberWrappers.get(subscriber);
    const status = existingWrapper ?
      PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_ALREADY_SUBSCRIBED :
      PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_OK;

    const subscriptionEpoch = this.owner.cdcSubscriptionEpoch + NUM.ONE;
    this.owner.cdcSubscriptionEpoch = subscriptionEpoch;
    const handshakeStartSequence = this.owner.cdcEventSequenceNumber;
    const subscriberId =
      this.resolveCDCSubscriberId(subscriber, options);

    let subscriptionState =
      this.owner.cdcSubscriberStates.get(subscriber);
    if (!subscriptionState) {
      subscriptionState = {
        subscriberId,
        subscriptionEpoch,
        streamMode: PARTITION_SERVICE_CDC.STREAM_MODE_STEADY,
        lastDeliveredSequenceNumber: null,
        lastDeliveredAt: null,
        catchupCompletedAt: null,
      };
      this.owner.cdcSubscriberStates.set(subscriber, subscriptionState);
    } else {
      subscriptionState.subscriberId = subscriberId;
      subscriptionState.subscriptionEpoch = subscriptionEpoch;
      subscriptionState.catchupCompletedAt = null;
    }

    let wrapper = existingWrapper;
    if (!wrapper) {
      wrapper = this.buildCDCSubscriberWrapper(
        subscriber, subscriptionState,
      );
      this.owner.cdcSubscriberWrappers.set(subscriber, wrapper);
      this.owner.cdcSubscribers.add(wrapper);
      this.owner.logger.debug(
        PARTITION_SERVICE_LOG_MSG.CDC_SUBSCRIBER_ADDED, {
          partitionId: this.owner.partitionId,
          subscriberId,
          subscriberCount: this.owner.cdcSubscribers.size,
        });
    }

    const bufferedEventsAtHandshake = this.owner.cdcEventBuffer.size();
    let catchupMode = bufferedEventsAtHandshake > NUM.ZERO ?
      PARTITION_SERVICE_CDC.CATCHUP_MODE_BACKFILL :
      PARTITION_SERVICE_CDC.CATCHUP_MODE_NONE;
    let bufferedEventsReplayed = NUM.ZERO;
    let catchupCompletedAt = Date.now();
    const deliveredIdentities = new Set();

    if (catchupMode === PARTITION_SERVICE_CDC.CATCHUP_MODE_BACKFILL) {
      subscriptionState.streamMode =
        PARTITION_SERVICE_CDC.STREAM_MODE_CATCHUP;
      this.owner.emit(PARTITION_SERVICE_EVENT.CDC_CATCHUP_STARTED, {
        partitionId: this.owner.partitionId,
        subscriberId,
        subscriptionEpoch,
        bufferedEventsAtHandshake,
      });
      this.owner.logger.debug(
        PARTITION_SERVICE_LOG_MSG.CDC_CATCHUP_STARTED, {
          partitionId: this.owner.partitionId,
          subscriberId,
          subscriptionEpoch,
          bufferedEventsAtHandshake,
        });

      const trackingWrapper = async (cdcEvent) => {
        deliveredIdentities.add(buildEventIdentity(cdcEvent));
        await wrapper(cdcEvent);
      };
      try {
        bufferedEventsReplayed =
          await this.owner.cdcEventBuffer.replay(trackingWrapper);
      } catch (error) {
        this.owner.cdcPipelineMetrics.increment(
          CDC_PIPELINE_METRIC.DELIVERY_FAILURES,
        );
        this.owner.cdcBufferReplayDelayMs = Math.min(
          PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_MAX_DELAY_MS,
          this.owner.cdcBufferReplayDelayMs * NUM.TWO,
        );
        this.owner.logger.warn(
          PARTITION_SERVICE_LOG_MSG.CDC_BUFFER_REPLAY_FAILED, {
            partitionId: this.owner.partitionId,
            subscriberId,
            reason: 'handshake_catchup_replay_failed',
            error: error.message,
            retryDelayMs: this.owner.cdcBufferReplayDelayMs,
            bufferedEvents: this.owner.cdcEventBuffer.size(),
          });
      }
      catchupCompletedAt = Date.now();
      subscriptionState.catchupCompletedAt = catchupCompletedAt;
      this.owner.emit(
        PARTITION_SERVICE_EVENT.CDC_CATCHUP_COMPLETED, {
          partitionId: this.owner.partitionId,
          subscriberId,
          subscriptionEpoch,
          bufferedEventsReplayed,
          bufferedEventsRemaining: this.owner.cdcEventBuffer.size(),
        });
      this.owner.logger.debug(
        PARTITION_SERVICE_LOG_MSG.CDC_CATCHUP_COMPLETED, {
          partitionId: this.owner.partitionId,
          subscriberId,
          subscriptionEpoch,
          bufferedEventsReplayed,
          bufferedEventsRemaining: this.owner.cdcEventBuffer.size(),
        });
    }

    // Sliding window replay: deliver recent events that the new
    // subscriber missed, deduplicating against buffer-replayed events.
    // Skip for already-subscribed subscribers — they already received
    // these events during their prior subscription.
    // Delivers directly to subscriber (not through wrapper) to avoid
    // re-recording events that are already in the sliding window.
    let slidingWindowEventsReplayed = NUM.ZERO;
    if (!existingWrapper) {
      const recentEvents =
        this.owner.cdcEventBuffer.getRecentEvents();
      for (const cdcEvent of recentEvents) {
        const identity = buildEventIdentity(cdcEvent);
        if (deliveredIdentities.has(identity)) {
          continue;
        }
        deliveredIdentities.add(identity);
        const replayEvent = {
          ...cdcEvent,
          sequenceNumber: Number.isFinite(cdcEvent.sequenceNumber) ?
            cdcEvent.sequenceNumber :
            this.nextCDCEventSequenceNumber(),
          streamMode: subscriptionState.streamMode,
          subscriberId: subscriptionState.subscriberId,
          subscriptionEpoch: subscriptionState.subscriptionEpoch,
        };
        await this.deliverCDCEventToSubscriber(
          subscriber, replayEvent,
        );
        subscriptionState.lastDeliveredSequenceNumber =
          replayEvent.sequenceNumber;
        subscriptionState.lastDeliveredAt = Date.now();
        slidingWindowEventsReplayed++;
      }
      if (catchupMode === PARTITION_SERVICE_CDC.CATCHUP_MODE_NONE &&
          slidingWindowEventsReplayed > NUM.ZERO) {
        catchupMode =
          PARTITION_SERVICE_CDC.CATCHUP_MODE_SLIDING_WINDOW;
      }
    }

    subscriptionState.streamMode =
      PARTITION_SERVICE_CDC.STREAM_MODE_STEADY;
    subscriptionState.subscriptionEpoch = subscriptionEpoch;

    const handshake = {
      status,
      subscriberId,
      subscriptionEpoch,
      versionContext: {
        streamVersion: this.owner.cdcEventSequenceNumber,
        handshakeStartSequence,
      },
      catchup: {
        mode: catchupMode,
        bufferedEventsAtHandshake,
        bufferedEventsReplayed,
        slidingWindowEventsReplayed,
        completed: this.owner.cdcEventBuffer.size() === NUM.ZERO,
        completedAt: catchupCompletedAt,
      },
      streamMode: subscriptionState.streamMode,
    };

    this.owner.logger.debug(
      PARTITION_SERVICE_LOG_MSG.CDC_SUBSCRIPTION_HANDSHAKE_ACK, {
        partitionId: this.owner.partitionId,
        subscriberId,
        subscriptionEpoch,
        status: handshake.status,
        catchupMode: handshake.catchup.mode,
        bufferedEventsAtHandshake,
        bufferedEventsReplayed,
        streamVersion: handshake.versionContext.streamVersion,
      });

    this.owner.cdcBufferReplayDelayMs =
      PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
    this.scheduleBufferedCDCReplay('post_subscription_handshake');

    return handshake;
  }

  /**
   * Subscribe to CDC events from this partition.
   * @param {Function|Object} subscriber - Subscriber function or object.
   */
  subscribeToCDC(subscriber) {
    this.subscribeToCDCWithHandshake(subscriber).catch((error) => {
      this.owner.logger.error(
        PARTITION_SERVICE_ERROR_MSG.CDC_SUBSCRIPTION_FAILED, {
          partitionId: this.owner.partitionId,
          error: error.message,
        });
    });
  }

  /**
   * Unsubscribe from CDC events.
   * @param {Function|Object} subscriber - Subscriber to remove.
   */
  unsubscribeFromCDC(subscriber) {
    const wrapper = this.owner.cdcSubscriberWrappers.get(subscriber);
    const subscriberToDelete = wrapper || subscriber;
    this.owner.cdcSubscribers.delete(subscriberToDelete);
    this.owner.cdcSubscriberWrappers.delete(subscriber);
    this.owner.cdcSubscriberStates.delete(subscriber);
    if (this.owner.cdcSubscribers.size === NUM.ZERO &&
        this.owner.cdcBufferReplayTimer) {
      clearTimeout(this.owner.cdcBufferReplayTimer);
      this.owner.cdcBufferReplayTimer = null;
    }
    this.owner.logger.debug(
      PARTITION_SERVICE_LOG_MSG.CDC_SUBSCRIBER_REMOVED, {
        partitionId: this.owner.partitionId,
        subscriberCount: this.owner.cdcSubscribers.size,
      });
  }

  /**
   * Get CDC subscription diagnostics for this partition.
   * @return {Object} CDC subscription diagnostics.
   */
  getCDCSubscriptionDiagnostics() {
    const subscriptions = [];
    for (const state of this.owner.cdcSubscriberStates.values()) {
      subscriptions.push({
        subscriberId: state.subscriberId,
        subscriptionEpoch: state.subscriptionEpoch,
        streamMode: state.streamMode,
        lastDeliveredSequenceNumber: state.lastDeliveredSequenceNumber,
        lastDeliveredAt: state.lastDeliveredAt,
        catchupCompletedAt: state.catchupCompletedAt,
      });
    }

    return {
      partitionId: this.owner.partitionId,
      subscriptionEpoch: this.owner.cdcSubscriptionEpoch,
      streamVersion: this.owner.cdcEventSequenceNumber,
      subscriberCount: this.owner.cdcSubscribers.size,
      bufferedEvents: this.owner.cdcEventBuffer.size(),
      bufferReplayInFlight: this.owner.cdcBufferReplayInFlight,
      bufferReplayDelayMs: this.owner.cdcBufferReplayDelayMs,
      subscriptions,
    };
  }
}

export {PartitionCDCDelivery};
