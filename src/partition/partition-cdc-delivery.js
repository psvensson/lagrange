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
import {CDC_COMPLETION, hasDurableCdcEvents, isCommittedCdcOutcome,
  isProvisionalCdcOutcome} from '../cdc/cdc-delivery-outcome.js';
import {assertCdcDeliveryInvocation} from '../cdc/cdc-delivery-invocation.js';
import {readStateField} from '../utils/state-field-read.js';
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
import {retireRecipientInvocations} from './partition-cdc-obligation-lane.js';
import {
  acknowledgeHydratedObligationsThrough,
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

function invalidCdcDeliveryShape() {
  return Object.assign(new Error(CDC_COMPLETION.INVALID), {code: CDC_COMPLETION.INVALID});
}

// Invoke a CDC subscriber: a subscriber is a callback (the one subscriber
// shape) and receives what was delivered: an ordinary event, or a durable
// vector with its invocation.
function invoke(subscriber, ...delivered) {
  return subscriber(...delivered);
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

// A durable vector is accepted only by the committed (or provisional)
// outcome over that exact vector; an ordinary event by any answer that is
// not an explicit refusal.
function assertSubscriberAcceptance(answer, refused) {
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
 * Check whether a value is a valid CDC subscriber: a callback.
 * @param {*} subscriber - Candidate subscriber.
 * @return {boolean} True when subscriber is valid.
 */ function isCDCSubscriber(subscriber) {
  return typeof subscriber === PARTITION_SERVICE_TYPE.FUNCTION;
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
    // recipientCustody: one custody slot per recipient of the obligation
    // lane (at most one delivery in flight per recipient; a slot is released
    // only by its delivery's actual local cleanup, also across tenures).
    this.recipientCustody = new Map();
    this.obligationLane = createCdcObligationLane();
    if (typeof owner.on === PARTITION_SERVICE_TYPE.FUNCTION) {
      owner.on(PARTITION_SERVICE_EVENT.LEADER_ELECTED, () => {
        resetCdcObligationLane(this);
        this.driveCdcObligations(PARTITION_CDC_OBLIGATION_REASON.LEADER_ELECTED);
      });
      owner.on(PARTITION_SERVICE_EVENT.SHUTDOWN, () => resetCdcObligationLane(this));
      owner.on(PARTITION_SERVICE_EVENT.SHUTDOWN_STARTED, () => {
        retireRecipientInvocations(this);
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
   * Acknowledge owed obligations at or below a hydration image's applied index.
   * @param {number|string} appliedIndex - Hydrated applied log index.
   * @return {Promise<Object>} Acknowledgement summary.
   */ acknowledgeHydratedObligationsThrough(appliedIndex) {
    return acknowledgeHydratedObligationsThrough(this, appliedIndex);
  }
  /**
   * The ledger committed these events delivered (a CDC_DELIVERED applied).
   * @param {Array<string>} eventKeys - Their event keys.
   * @param {Object|null} [progress] - The ledger's compact progress after it:
   *   every position at or below it is delivered too.
   */ settleAcknowledgedObligations(eventKeys, progress = null) {
    settleAcknowledgedObligations(this, eventKeys, progress);
  }
  /**
   * @return {Object} The obligation lane's diagnostics.
   */ getCdcObligationDiagnostics() {
    return cdcObligationDiagnosticsOf(this);
  }
  /**
   * Resolve the underlying subscriber object from a wrapper.
   * @param {Function} subscriber
   * @return {Function}
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
   * @param {Function} subscriber
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
          for (const subscriber of subscribers) {
            await this.deliverCDCEventToSubscriber(
              subscriber, markReplayOnlyCdcEvent(cdcEvent));
          }
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
   * @param {Function} subscriber - Subscriber.
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
   * Deliver one ordinary (not durable) CDC event to a subscriber
   * callback. A durable event travels only as a vector
   * (deliverCdcVectorToSubscriber); here it is refused as invalid.
   * @param {Function} subscriber - Subscriber callback.
   * @param {Object} cdcEvent - Event payload.
   * @return {Promise<*>} The subscriber's answer.
   */ async deliverCDCEventToSubscriber(subscriber, cdcEvent) {
    if (hasDurableCdcEvents([cdcEvent])) throw invalidCdcDeliveryShape();
    assertSubscriberReadiness(this.resolveCDCSubscriberReadiness(subscriber, cdcEvent));
    const answer = await invoke(subscriber, cdcEvent);
    assertSubscriberAcceptance(answer, answer?.success === false);
    return answer;
  }
  /**
   * Deliver one vector of durable CDC events (one table, one partition, in
   * log order) to a subscriber: the durable subscriber contract is
   * (events, deliveryContext), answered with the outcome over that exact
   * vector. Readiness is asked with the vector's first event.
   * @param {Function} subscriber - Subscriber callback.
   * @param {Array<Object>} events - The durable vector.
   * @param {Object} deliveryContext - The obligation lane's delivery
   *   invocation for the vector's recipient (the one caller).
   * @return {Promise<Object>} The subscriber's committed or provisional
   *   outcome.
   */ async deliverCdcVectorToSubscriber(subscriber, events, deliveryContext) {
    if (!hasDurableCdcEvents(events)) throw invalidCdcDeliveryShape();
    assertCdcDeliveryInvocation(deliveryContext);
    assertSubscriberReadiness(this.resolveCDCSubscriberReadiness(subscriber, events[0]));
    const answer = await deliveryContext.run(() =>
      invoke(subscriber, events, deliveryContext));
    assertSubscriberAcceptance(answer, !isProvisionalCdcOutcome(answer, events) &&
      !isCommittedCdcOutcome(answer, events));
    return answer;
  }
  /**
   * Create a wrapper that enriches stream metadata for one subscriber. It
   * carries both delivery contracts of the partition: an ordinary event
   * (cdcEvent), and the durable vector (events, deliveryContext).
   * @param {Function} subscriber - Target subscriber.
   * @param {Object} subscriptionState - Mutable state for this subscriber.
   * @return {Function} Wrapper callback.
   */ buildCDCSubscriberWrapper(subscriber, subscriptionState) {
    const decorate = (cdcEvent) => Object.freeze({
      ...(Number.isFinite(cdcEvent.sequenceNumber) ? cdcEvent :
        {...cdcEvent, sequenceNumber: this.nextCDCEventSequenceNumber()}),
      subscriberId: subscriptionState.subscriberId,
      subscriptionEpoch: subscriptionState.subscriptionEpoch,
    });
    const recordDelivered = (decoratedEvent) => {
      subscriptionState.lastDeliveredSequenceNumber = decoratedEvent.sequenceNumber;
      subscriptionState.lastDeliveredAt = this.owner.timeSource.now();
    };
    return async (delivered, deliveryContext = null) => {
      if (!Array.isArray(delivered)) {
        const decoratedEvent = decorate(delivered);
        const answer = await this.deliverCDCEventToSubscriber(subscriber, decoratedEvent);
        recordDelivered(decoratedEvent);
        return answer;
      }
      const decorated = Object.freeze(delivered.map(decorate));
      const answer = await this.deliverCdcVectorToSubscriber(
        subscriber, decorated, deliveryContext);
      assertCdcDeliveryInvocation(deliveryContext);
      if (isProvisionalCdcOutcome(answer, delivered)) return answer;
      recordDelivered(decorated.at(-1));
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
   * A partition has one propagation subscriber (options.role
   * SUBSCRIBER_ROLE_PROPAGATION): re-registering it is ALREADY_SUBSCRIBED;
   * a second, different one is refused (HANDSHAKE_STATUS_PROPAGATION_HELD,
   * naming the holder) and registers nothing. Other subscribers declare no
   * role.
   * @param {Function} subscriber - Subscriber callback.
   * @param {Object} [options] - Handshake options.
   * @param {string} [options.subscriberId] - Stable subscriber identifier.
   * @param {string} [options.role] - SUBSCRIBER_ROLE_PROPAGATION, or none.
   * @return {Promise<Object>} Handshake acknowledgment, or the refusal.
   */ async subscribeToCDCWithHandshake(subscriber, options = {}) {
    if (!isCDCSubscriber(subscriber)) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.CDC_INVALID_SUBSCRIBER);
    }
    const subscriberId = this.resolveCDCSubscriberId(subscriber, options);
    const existingById = typeof options.subscriberId === 'string' &&
      options.subscriberId.length > 0 ?
      [...this.owner.cdcSubscriberStates.entries()]
        .find(([, state]) => state.subscriberId === subscriberId)?.[0] :
      null;
    const subscriberKey = this.owner.cdcSubscriberWrappers.has(subscriber) ?
      subscriber : (existingById || subscriber);
    const existingWrapper = this.owner.cdcSubscriberWrappers.get(subscriberKey);
    const role = readStateField(options.role);
    const holder = !existingWrapper && role === PARTITION_SERVICE_CDC.SUBSCRIBER_ROLE_PROPAGATION ?
      this.propagationSubscriptionOtherThan(subscriberKey) : null;
    if (holder !== null) return this.refusePropagationSubscriber(subscriberId, holder);
    const status = existingWrapper ?
      PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_ALREADY_SUBSCRIBED :
      PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_OK;
    let subscriptionState = this.owner.cdcSubscriberStates.get(subscriberKey);
    const subscriptionEpoch = existingWrapper && subscriptionState ?
      subscriptionState.subscriptionEpoch :
      this.owner.cdcSubscriptionEpoch + 1;
    if (!existingWrapper) {
      this.owner.cdcSubscriptionEpoch = subscriptionEpoch;
      subscriptionState = {
        subscriberId,
        role,
        subscriptionEpoch,
        lastDeliveredSequenceNumber: null,
        lastDeliveredAt: null,
      };
      this.owner.cdcSubscriberStates.set(subscriberKey, subscriptionState);
      const wrapper = this.buildCDCSubscriberWrapper(subscriber, subscriptionState);
      wrapper.cdcSourceSubscriber = subscriber;
      this.owner.cdcSubscriberWrappers.set(subscriberKey, wrapper);
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
   * The current propagation subscription other than the one keyed by
   * `subscriberKey`, or null.
   * @param {Function} subscriberKey - The registering subscriber's key.
   * @return {Object|null} Its subscription state.
   * @private
   */ propagationSubscriptionOtherThan(subscriberKey) {
    for (const [key, state] of this.owner.cdcSubscriberStates) {
      if (key !== subscriberKey &&
          state.role === PARTITION_SERVICE_CDC.SUBSCRIBER_ROLE_PROPAGATION) return state;
    }
    return null;
  }
  /**
   * Refuse a second propagation subscriber: the lane keeps its one holder.
   * @param {string} subscriberId - The refused registration's id.
   * @param {Object} holder - The holder's subscription state.
   * @return {Object} The frozen refusal.
   * @private
   */ refusePropagationSubscriber(subscriberId, holder) {
    const refusal = Object.freeze({
      status: PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_PROPAGATION_HELD,
      subscriberId, holderSubscriberId: holder.subscriberId,
    });
    this.owner.logger.warn(PARTITION_SERVICE_LOG_MSG.CDC_PROPAGATION_SUBSCRIBER_REFUSED, {
      partitionId: this.owner.partitionId, ...refusal});
    return refusal;
  }
  /**
   * Subscribe to CDC events from this partition.
   * @param {Function} subscriber - Subscriber callback.
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
   * @param {Function} subscriber - Subscriber to remove.
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
