/**
 * CDC delivery logic extracted from PartitionService.
 * Manages CDC subscriber registration, event delivery, buffering, and replay.
 *
 * This is a helper class that operates on the owning PartitionService's state.
 * It receives the owner via constructor and reads/writes CDC-related fields
 * directly on it, keeping the mutable state in one place.
 */

import {
  CDC_PIPELINE_METRIC,
  CDC_LIFECYCLE_LOG_MSG,
} from '../constants/cdc-lifecycle-constants.js';
import {isTableCdcObligationRecorded} from '../cache/cdc-table-policy.js';
import {hasDurableCdcEvents, isCommittedCdcOutcome,
  isProvisionalCdcOutcome} from '../cdc/cdc-delivery-outcome.js';
import {assertCdcDeliveryInvocation, beginCdcDeliveryInvocation} from
  '../cdc/cdc-delivery-invocation.js';
import {captureCdcEvents} from '../cdc/cdc-event-envelope.js';
import {
  PARTITION_SERVICE_CDC,
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_TYPE,
} from './partition-service-constants.js';
import {PARTITION_CDC_OBLIGATION_REASON} from
  './partition-cdc-obligation-constants.js';
import {
  cdcObligationDiagnosticsOf,
  createCdcObligationLane,
  driveCdcObligations,
  flushCdcAcknowledgements,
  resetCdcObligationLane,
  settleAcknowledgedObligations,
} from './partition-cdc-obligation-delivery.js';

const PARTITION_CDC_DELIVERY_LITERAL = Object.freeze({
  OBJECT: 'object',
  CDCREPLAYBUFFERGROWTHCOUNT: 'cdcReplayBufferGrowthCount',
  CDCBUFFERREPLAYTIMER: 'cdcBufferReplayTimer',
  CDCREPLAYRETRYDEPTH: 'cdcReplayRetryDepth',
});
const CDC_SUBSCRIBER_NOT_READY_MSG = 'CDC subscriber not ready for delivery';
const CDC_SUBSCRIBER_REFUSED_MSG = 'CDC subscriber refused the event';
const CDC_SUBSCRIBER_REFUSED_CODE = 'cdc_subscriber_refused';

async function deliverCapturedCdcEvent(delivery, subscriber, cdcEvent) {
  const {owner} = delivery;
  const tenure = owner.leadershipTenure;
  const subscriptionEpoch = owner.cdcSubscriptionEpoch;
  const context = beginCdcDeliveryInvocation(delivery, () =>
    owner.isLeader && owner.leadershipTenure === tenure &&
    owner.cdcSubscriptionEpoch === subscriptionEpoch);
  try {
    const captured = Object.freeze({...cdcEvent, ...captureCdcEvents([cdcEvent])[0]});
    return await delivery.deliverCDCEventToSubscriber(subscriber, captured, context);
  } finally {
    context.finish();
  }
}

/**
 * The one shape of a subscription handshake's answer (CDC decision D4: a
 * registration, no catch-up of its own).
 * @param {Object} fields - {status, subscriberId, subscriptionEpoch,
 *   streamVersion}.
 * @return {Object} The frozen handshake answer.
 */
function buildCdcSubscriptionHandshake({status, subscriberId, subscriptionEpoch,
  streamVersion}) {
  return Object.freeze({status, subscriberId, subscriptionEpoch,
    versionContext: Object.freeze({streamVersion})});
}

function assertSubscriberReadiness(readiness) {
  if (readiness.ready === true) return;
  const error = new Error(readiness.reason || CDC_SUBSCRIBER_NOT_READY_MSG);
  error.ownerNotReady = true;
  if (readiness.retryAfterMs > 0) error.retryAfterMs = readiness.retryAfterMs;
  throw error;
}

function assertSubscriberAcceptance(answer, cdcEvent) {
  if (isProvisionalCdcOutcome(answer, [cdcEvent])) return;
  const refused = hasDurableCdcEvents([cdcEvent]) ?
    !isCommittedCdcOutcome(answer, [cdcEvent]) : answer?.success === false;
  if (!refused) return;
  const error = new Error(CDC_SUBSCRIBER_REFUSED_MSG);
  error.code = CDC_SUBSCRIBER_REFUSED_CODE;
  error.cause = answer;
  error.retryAfterMs = answer?.retryAfterMs;
  throw error;
}

function incrementBoundedOwnerCounter(owner, fieldName, delta = 1) {
  if (!owner || typeof fieldName !== 'string' || fieldName.length === 0) {
    return;
  }
  if (!Number.isFinite(delta) || delta <= 0) {
    return;
  }
  const currentValue = Number.isFinite(owner[fieldName]) ? owner[fieldName] : 0;
  owner[fieldName] = Math.min(
    Number.MAX_SAFE_INTEGER,
    currentValue + Math.max(1, Math.floor(delta)),
  );
}
function markReplayOnlyCdcEvent(cdcEvent) {
  if (!cdcEvent || typeof cdcEvent !== PARTITION_CDC_DELIVERY_LITERAL.OBJECT) {
    return cdcEvent;
  }
  return {...cdcEvent, replayOnly: true};
}
/**
 * Check whether a value is a valid CDC subscriber.
 * @param {*} subscriber - Candidate subscriber.
 * @return {boolean} True when subscriber is valid.
 */ function isCDCSubscriber(subscriber) {
  if (typeof subscriber === PARTITION_SERVICE_TYPE.FUNCTION) {
    return true;
  }
  return Boolean(
    subscriber && typeof subscriber.handleCDCEvent === PARTITION_SERVICE_TYPE.FUNCTION,
  );
}
/**
 * Helper class encapsulating CDC delivery, subscription, and buffering logic.
 *
 * Operates directly on the owning PartitionService instance's mutable state
 * so that the single source of truth for CDC fields remains on the owner.
 * It also owns the obligation lane (partition-cdc-obligation-delivery.js):
 * the durable obligations a committed participant decision records are
 * driven from here on the leader, their acknowledgements batched by committed
 * entry and proposed as CDC_DELIVERED; a new leadership tenure re-drives the
 * ledger's owed obligations, and a subscription handshake drives them to the
 * new subscriber.
 */ class PartitionCDCDelivery {
  /**
   * @param {Object} owner - The PartitionService instance that owns CDC state.
   */ constructor(owner) {
    this.owner = owner;
    this.activeCdcInvocation = null;
    this.obligationLane = createCdcObligationLane();
    if (typeof owner.on === PARTITION_SERVICE_TYPE.FUNCTION) {
      owner.on(PARTITION_SERVICE_EVENT.LEADER_ELECTED, () => {
        resetCdcObligationLane(this);
        this.driveCdcObligations(PARTITION_CDC_OBLIGATION_REASON.LEADER_ELECTED);
      });
      owner.on(PARTITION_SERVICE_EVENT.SHUTDOWN, () => resetCdcObligationLane(this));
      owner.on(PARTITION_SERVICE_EVENT.SHUTDOWN_STARTED, () => {
        this.activeCdcInvocation?.retire();
        resetCdcObligationLane(this);
      });
    }
  }
  /**
   * Drive the ledger's owed obligations to the current subscribers (leader
   * only; tracked so shutdown awaits it). Delegates to the obligation lane.
   * @param {string} reason - A PARTITION_CDC_OBLIGATION_REASON.
   * @return {Promise<Object>} The drive's outcome.
   */ driveCdcObligations(reason) {
    const drive = driveCdcObligations(this, reason);
    if (typeof this.owner.trackPendingCDCEvent === PARTITION_SERVICE_TYPE.FUNCTION) {
      this.owner.trackPendingCDCEvent(drive);
    }
    return drive;
  }
  /**
   * Propose the pending acknowledgements now, as one CDC_DELIVERED.
   * @param {string} reason - A PARTITION_CDC_OBLIGATION_REASON.
   * @return {Promise<Object>} The flush's outcome.
   */ flushCdcAcknowledgements(reason) {
    return flushCdcAcknowledgements(this, reason);
  }
  /**
   * The ledger committed these events delivered (a CDC_DELIVERED applied).
   * @param {Array<string>} eventKeys - Their event keys.
   */ settleAcknowledgedObligations(eventKeys) {
    settleAcknowledgedObligations(this, eventKeys);
  }
  /**
   * @return {Object} The obligation lane's diagnostics.
   */ getCdcObligationDiagnostics() {
    return cdcObligationDiagnosticsOf(this);
  }
  /**
   * Resolve the underlying subscriber object from a wrapper.
   * @param {Function|Object} subscriber
   * @return {Function|Object}
   * @private
   */ getCDCSubscriberSource(subscriber) {
    return subscriber?.cdcSourceSubscriber || subscriber;
  }
  buildCDCSubscriberReadiness(ready, retryAfterMs, reason) {
    return {ready, retryAfterMs, reason};
  }
  /**
   * Normalize optional subscriber readiness metadata.
   * @param {*} readiness
   * @return {{ready:boolean,retryAfterMs:number,reason:string|null}}
   * @private
   */ normalizeCDCSubscriberReadiness(readiness) {
    let ready = true;
    let retryAfterMs = 0;
    let reason = null;
    if (readiness === false) {
      ready = false;
    } else if (
      readiness !== true &&
      readiness != null &&
      typeof readiness === PARTITION_CDC_DELIVERY_LITERAL.OBJECT
    ) {
      ready = readiness.ready !== false;
      retryAfterMs =
        Number.isFinite(readiness.retryAfterMs) && readiness.retryAfterMs > 0 ?
          Math.floor(readiness.retryAfterMs) :
          0;
      reason =
        typeof readiness.reason === 'string' && readiness.reason.length > 0 ?
          readiness.reason :
          null;
    }
    return this.buildCDCSubscriberReadiness(ready, retryAfterMs, reason);
  }
  /**
   * Resolve whether a subscriber-owner is ready to accept this CDC event.
   * @param {Function|Object} subscriber
   * @param {Object} cdcEvent
   * @return {{ready:boolean,retryAfterMs:number,reason:string|null}}
   * @private
   */ resolveCDCSubscriberReadiness(subscriber, cdcEvent) {
    const sourceSubscriber = this.getCDCSubscriberSource(subscriber);
    if (
      sourceSubscriber &&
      typeof sourceSubscriber.canAcceptCDCEvent === PARTITION_SERVICE_TYPE.FUNCTION
    ) {
      return this.normalizeCDCSubscriberReadiness(sourceSubscriber.canAcceptCDCEvent(cdcEvent));
    }
    return {ready: true, retryAfterMs: 0, reason: null};
  }
  /**
   * Resolve the next buffered replay delay after a subscriber miss.
   * Honors typed retryAfter hints from downstream owners when present.
   * @param {*} error
   * @return {number}
   * @private
   */ resolveBufferedReplayDelayAfterError(error) {
    if (Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0) {
      return Math.min(
        PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_MAX_DELAY_MS,
        Math.floor(error.retryAfterMs),
      );
    }
    return Math.min(
      PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_MAX_DELAY_MS,
      this.owner.cdcBufferReplayDelayMs * 2,
    );
  }
  /**
   * Allocate next CDC event sequence number.
   * @return {number} Monotonic sequence number.
   */ nextCDCEventSequenceNumber() {
    this.owner.cdcEventSequenceNumber += 1;
    return this.owner.cdcEventSequenceNumber;
  }
  /**
   * Buffer one CDC event for retry and schedule replay when possible.
   * @param {Object} cdcEvent - Event payload.
   * @param {string} reason - Buffering reason.
   * @return {boolean} True when buffered, false when dropped.
   */ bufferCDCEventForRetry(cdcEvent, reason) {
    if (!isTableCdcObligationRecorded(cdcEvent.tableName)) {
      return false;
    }
    const buffered = this.owner.cdcEventBuffer.buffer(cdcEvent);
    if (buffered) {
      incrementBoundedOwnerCounter(
        this.owner,
        PARTITION_CDC_DELIVERY_LITERAL.CDCREPLAYBUFFERGROWTHCOUNT,
      );
      this.owner.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_BUFFERED);
      this.owner.logger.warn(PARTITION_SERVICE_LOG_MSG.CDC_DELIVERY_BUFFERED_FOR_RETRY, {
        partitionId: this.owner.partitionId,
        tableName: cdcEvent.tableName,
        operation: cdcEvent.operation,
        reason,
        bufferedEvents: this.owner.cdcEventBuffer.size(),
        replayBufferGrowthCount: this.owner.cdcReplayBufferGrowthCount || 0,
      });
      this.scheduleBufferedCDCReplay(reason);
      return true;
    }
    this.owner.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_DROPPED);
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
   */ scheduleBufferedCDCReplay(reason) {
    if (this.owner.cdcBufferReplayTimer || this.owner.cdcBufferReplayInFlight) {
      return;
    }
    if (this.owner.isShutdown) {
      this.owner.logger.debug(PARTITION_SERVICE_LOG_MSG.TIMER_SKIPPED_AFTER_SHUTDOWN, {
        partitionId: this.owner.partitionId,
        timer: PARTITION_CDC_DELIVERY_LITERAL.CDCBUFFERREPLAYTIMER,
      });
      return;
    }
    if (this.owner.cdcSubscribers.size === 0 || !this.owner.cdcEventBuffer.hasEvents()) {
      return;
    }
    const retryDelayMs = Math.max(1, Math.floor(this.owner.cdcBufferReplayDelayMs));
    this.owner.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_BUFFER_REPLAY_SCHEDULED, {
      partitionId: this.owner.partitionId,
      reason,
      retryDelayMs,
      bufferedEvents: this.owner.cdcEventBuffer.size(),
      subscriberCount: this.owner.cdcSubscribers.size,
    });
    // The replay hop is the owning replica's, on its clock.
    this.owner.cdcBufferReplayTimer = this.owner.timeSource.setTimeout(() => {
      this.owner.cdcBufferReplayTimer = null;
      this.flushBufferedCDCEvents(reason).catch((error) => {
        incrementBoundedOwnerCounter(
          this.owner,
          PARTITION_CDC_DELIVERY_LITERAL.CDCREPLAYRETRYDEPTH,
        );
        this.owner.logger.warn(PARTITION_SERVICE_LOG_MSG.CDC_BUFFER_REPLAY_FAILED, {
          partitionId: this.owner.partitionId,
          reason,
          error: error.message,
          replayRetryDepth: this.owner.cdcReplayRetryDepth || 0,
          replayBufferGrowthCount: this.owner.cdcReplayBufferGrowthCount || 0,
        });
      });
    }, retryDelayMs);
  }
  /**
   * Replay buffered CDC events to current subscribers.
   * @param {string} reason - Trigger reason.
   * @return {Promise<void>}
   */ async flushBufferedCDCEvents(reason) {
    if (this.owner.cdcBufferReplayInFlight) {
      return;
    }
    if (this.owner.cdcSubscribers.size === 0 || !this.owner.cdcEventBuffer.hasEvents()) {
      return;
    }
    this.owner.cdcBufferReplayInFlight = true;
    let replayedEvents = 0;
    try {
      while (this.owner.cdcSubscribers.size > 0 && this.owner.cdcEventBuffer.hasEvents()) {
        const replayedCount = await this.owner.cdcEventBuffer.replay(async (cdcEvent) => {
          const subscribers = [...this.owner.cdcSubscribers];
          let provisional = false;
          for (const subscriber of subscribers) {
            const answer = await this.deliverCDCEventToSubscriber(
              subscriber, markReplayOnlyCdcEvent(cdcEvent));
            provisional ||= isProvisionalCdcOutcome(answer, [cdcEvent]);
          }
          if (provisional) return false;
          this.owner.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_DELIVERED);
          this.owner.emit(PARTITION_SERVICE_EVENT.CDC_EVENT, cdcEvent);
        });
        replayedEvents += replayedCount;
        if (replayedCount === 0) {
          break;
        }
      }
      this.owner.cdcBufferReplayDelayMs =
        PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
      this.owner.cdcReplayRetryDepth = 0;
      this.owner.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_BUFFER_REPLAY_COMPLETE, {
        partitionId: this.owner.partitionId,
        reason,
        replayedEvents,
        bufferedEvents: this.owner.cdcEventBuffer.size(),
      });
    } catch (error) {
      this.owner.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.DELIVERY_FAILURES);
      this.owner.cdcBufferReplayDelayMs = this.resolveBufferedReplayDelayAfterError(error);
      incrementBoundedOwnerCounter(this.owner, PARTITION_CDC_DELIVERY_LITERAL.CDCREPLAYRETRYDEPTH);
      this.owner.logger.warn(PARTITION_SERVICE_LOG_MSG.CDC_BUFFER_REPLAY_FAILED, {
        partitionId: this.owner.partitionId,
        reason,
        error: error.message,
        retryDelayMs: this.owner.cdcBufferReplayDelayMs,
        bufferedEvents: this.owner.cdcEventBuffer.size(),
        replayRetryDepth: this.owner.cdcReplayRetryDepth || 0,
        replayBufferGrowthCount: this.owner.cdcReplayBufferGrowthCount || 0,
      });
    } finally {
      this.owner.cdcBufferReplayInFlight = false;
    }
    if (this.owner.cdcSubscribers.size > 0 && this.owner.cdcEventBuffer.hasEvents()) {
      this.scheduleBufferedCDCReplay(PARTITION_SERVICE_CDC.REPLAY_REASON_BUFFERED_REMAINING);
    }
  }
  /**
   * Resolve a stable subscriber identifier.
   * @param {Function|Object} subscriber - Subscriber.
   * @param {Object} options - Subscription options.
   * @return {string} Stable subscriber identifier.
   */ resolveCDCSubscriberId(subscriber, options = {}) {
    const candidateId = options.subscriberId;
    if (typeof candidateId === 'string' && candidateId.length > 0) {
      return candidateId;
    }
    const existingState = this.owner.cdcSubscriberStates.get(subscriber);
    if (existingState?.subscriberId) {
      return existingState.subscriberId;
    }
    const fallbackOrdinal = this.owner.cdcSubscriberStates.size + 1;
    return `${PARTITION_SERVICE_CDC.SUBSCRIBER_ID_PREFIX}-${fallbackOrdinal}`;
  }
  /**
   * Deliver one CDC event to a subscriber callback/object.
   * @param {Function|Object} subscriber - Subscriber callback/object.
   * @param {Object} cdcEvent - Event payload.
   * @return {Promise<void>}
   */ async deliverCDCEventToSubscriber(subscriber, cdcEvent, deliveryContext = null) {
    if (hasDurableCdcEvents([cdcEvent]) && deliveryContext === null) {
      return deliverCapturedCdcEvent(this, subscriber, cdcEvent);
    }
    if (deliveryContext !== null) assertCdcDeliveryInvocation(deliveryContext);
    const readiness = this.resolveCDCSubscriberReadiness(subscriber, cdcEvent);
    assertSubscriberReadiness(readiness);
    const invoke = () => typeof subscriber === PARTITION_SERVICE_TYPE.FUNCTION ?
      subscriber(cdcEvent, deliveryContext) :
      subscriber.handleCDCEvent(cdcEvent, deliveryContext);
    const answer = deliveryContext === null ? await invoke() : await deliveryContext.run(invoke);
    assertSubscriberAcceptance(answer, cdcEvent);
    return answer;
  }
  /**
   * Create a wrapper that enriches stream metadata for one subscriber.
   * @param {Function|Object} subscriber - Target subscriber.
   * @param {Object} subscriptionState - Mutable state for this subscriber.
   * @return {Function} Wrapper callback.
   */ buildCDCSubscriberWrapper(subscriber, subscriptionState) {
    return async (cdcEvent, deliveryContext = null) => {
      const sequencedEvent = Number.isFinite(cdcEvent.sequenceNumber) ?
        cdcEvent :
        {...cdcEvent, sequenceNumber: this.nextCDCEventSequenceNumber()};
      const decoratedEvent = Object.freeze({
        ...sequencedEvent,
        subscriberId: subscriptionState.subscriberId,
        subscriptionEpoch: subscriptionState.subscriptionEpoch,
      });
      const answer = await this.deliverCDCEventToSubscriber(
        subscriber, decoratedEvent, deliveryContext);
      if (deliveryContext !== null) assertCdcDeliveryInvocation(deliveryContext);
      if (isProvisionalCdcOutcome(answer, [cdcEvent])) return answer;
      subscriptionState.lastDeliveredSequenceNumber = decoratedEvent.sequenceNumber;
      subscriptionState.lastDeliveredAt = this.owner.timeSource.now();
      return answer;
    };
  }
  /**
   * Subscribe to CDC: register the subscriber, then drive the ledger's owed
   * obligations (CDC decision D4). Registration is synchronous: from the
   * moment this returns, no event can be acknowledged without this
   * subscriber's handler having resolved for it, so a hydration image read
   * after registration (readHydrationImage, at applied index P) and the lane
   * meet at P with no gap. Nothing is replayed outside the lane: events at
   * or below P that still reach the subscriber (owed history, an event
   * acknowledged but not yet committed delivered) are absorbed by the
   * consumer's row-version merge.
   * @param {Function|Object} subscriber - Subscriber function or object.
   * @param {Object} [options] - Handshake options.
   * @param {string} [options.subscriberId] - Stable subscriber identifier.
   * @return {Promise<Object>} Handshake acknowledgment.
   */ async subscribeToCDCWithHandshake(subscriber, options = {}) {
    if (!isCDCSubscriber(subscriber)) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.CDC_INVALID_SUBSCRIBER);
    }
    const existingWrapper = this.owner.cdcSubscriberWrappers.get(subscriber);
    const status = existingWrapper ?
      PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_ALREADY_SUBSCRIBED :
      PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_OK;
    const subscriptionEpoch = this.owner.cdcSubscriptionEpoch + 1;
    this.owner.cdcSubscriptionEpoch = subscriptionEpoch;
    const subscriberId = this.resolveCDCSubscriberId(subscriber, options);
    let subscriptionState = this.owner.cdcSubscriberStates.get(subscriber);
    if (!subscriptionState) {
      subscriptionState = {
        subscriberId,
        subscriptionEpoch,
        lastDeliveredSequenceNumber: null,
        lastDeliveredAt: null,
      };
      this.owner.cdcSubscriberStates.set(subscriber, subscriptionState);
    } else {
      subscriptionState.subscriberId = subscriberId;
      subscriptionState.subscriptionEpoch = subscriptionEpoch;
    }
    if (!existingWrapper) {
      const wrapper = this.buildCDCSubscriberWrapper(subscriber, subscriptionState);
      wrapper.cdcSourceSubscriber = subscriber;
      this.owner.cdcSubscriberWrappers.set(subscriber, wrapper);
      this.owner.cdcSubscribers.add(wrapper);
      this.owner.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_SUBSCRIBER_ADDED, {
        partitionId: this.owner.partitionId,
        subscriberId,
        subscriberCount: this.owner.cdcSubscribers.size,
      });
    }
    const handshake = buildCdcSubscriptionHandshake({status, subscriberId,
      subscriptionEpoch, streamVersion: this.owner.cdcEventSequenceNumber});
    this.owner.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_SUBSCRIPTION_HANDSHAKE_ACK, {
      partitionId: this.owner.partitionId,
      subscriberId,
      subscriptionEpoch,
      status,
      streamVersion: handshake.versionContext.streamVersion,
    });
    // The ledger's owed obligations reach every current subscriber, this one
    // included, in log order.
    this.driveCdcObligations(PARTITION_CDC_OBLIGATION_REASON.SUBSCRIPTION_HANDSHAKE)
      .catch(() => undefined);
    return handshake;
  }
  /**
   * Subscribe to CDC events from this partition.
   * @param {Function|Object} subscriber - Subscriber function or object.
   */ subscribeToCDC(subscriber) {
    this.subscribeToCDCWithHandshake(subscriber).catch((error) => {
      this.owner.logger.error(PARTITION_SERVICE_ERROR_MSG.CDC_SUBSCRIPTION_FAILED, {
        partitionId: this.owner.partitionId,
        error: error.message,
      });
    });
  }
  /**
   * Unsubscribe from CDC events.
   * @param {Function|Object} subscriber - Subscriber to remove.
   */ unsubscribeFromCDC(subscriber) {
    const wrapper = this.owner.cdcSubscriberWrappers.get(subscriber);
    const subscriberToDelete = wrapper || subscriber;
    this.owner.cdcSubscribers.delete(subscriberToDelete);
    this.owner.cdcSubscriberWrappers.delete(subscriber);
    this.owner.cdcSubscriberStates.delete(subscriber);
    if (this.owner.cdcSubscribers.size === 0 && this.owner.cdcBufferReplayTimer) {
      this.owner.timeSource.clearTimeout(this.owner.cdcBufferReplayTimer);
      this.owner.cdcBufferReplayTimer = null;
    }
    this.owner.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_SUBSCRIBER_REMOVED, {
      partitionId: this.owner.partitionId,
      subscriberCount: this.owner.cdcSubscribers.size,
    });
  }
  /**
   * Get CDC subscription diagnostics for this partition.
   * @return {Object} CDC subscription diagnostics.
   */ getCDCSubscriptionDiagnostics() {
    const subscriptions = [];
    for (const state of this.owner.cdcSubscriberStates.values()) {
      subscriptions.push({
        subscriberId: state.subscriberId,
        subscriptionEpoch: state.subscriptionEpoch,
        lastDeliveredSequenceNumber: state.lastDeliveredSequenceNumber,
        lastDeliveredAt: state.lastDeliveredAt,
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
export {PartitionCDCDelivery, buildCdcSubscriptionHandshake};
