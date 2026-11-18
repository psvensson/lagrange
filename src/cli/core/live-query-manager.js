const LOCAL_NUM_ONE_HUNDRED = 100;
const LOCAL_NUM_ONE_HUNDRED0 = 1000;
const LOCAL_STR_LIVEQUERY_SUBSCRIBED = 'livequery:subscribed';
const LOCAL_STR_LIVE_QUERY_SUBSCRIBED = 'live_query_subscribed';
const LOCAL_STR_LIVE_QUERY_EVENT = 'live_query_event';
const LOCAL_STR_LIVEQUERY_EVENT = 'livequery:event';
const LOCAL_STR_LIVEQUERY_RESULT = 'livequery:result';
const LOCAL_STR_LIVEQUERY_ERROR = 'livequery:error';
const LOCAL_STR_FAILED = 'failed';
const LOCAL_STR_ERROR_EVENT_TYPE = 'error';
// The event types whose `rows` is a whole result that replaces the shown
// one: the first result (snapshot) and the re-executed one (reset).
const LOCAL_RESULT_EVENT_TYPES = new Set(['snapshot', 'reset']);
// The row fields of a change event: the row it is about, and the row before
// an update.
const LOCAL_CHANGE_ROW_FIELDS = Object.freeze(['data', 'oldData']);
const LOCAL_STR_ACTIVE = 'active';
const LOCAL_STR_LIVEQUERY_PAUSED = 'livequery:paused';
const LOCAL_STR_LIVEQUERY_RESUMED = 'livequery:resumed';
const LOCAL_STR_CANCELLED = 'cancelled';
const LOCAL_STR_LIVEQUERY_CANCELLED = 'livequery:cancelled';

/**
 * LiveQueryManager - Manages live query subscriptions
 *
 * Handles LIVE SELECT subscriptions that stream matching changes in real-time.
 * Supports subscribe, pause, resume and cancel operations.
 *
 * Requirements: 32.1, 32.7, 32.9, 32.10, 32.11
 */

/**
 * @typedef {'pending'|'active'|'paused'|'cancelled'|'failed'}
 *   SubscriptionStatus - pending until the server's live_query_subscribed;
 *   failed once an error event names what failed.
 */

/**
 * @typedef {Object} LiveQueryEvent
 * @property {string} eventType - Type of change (insert/update/delete)
 * @property {Object} data - The row the change is about
 * @property {Object} [oldData] - The row before an update (update only)
 * @property {number} timestamp - Event timestamp
 */

/**
 * @typedef {Object} LiveQuerySubscription
 * @property {string} id - Subscription ID
 * @property {string} sql - LIVE SELECT statement
 * @property {SubscriptionStatus} status - Current status
 * @property {LiveQueryEvent[]} events - Received events
 * @property {number} eventRate - Events per second
 * @property {string[]} partitions - Monitored partitions
 * @property {number} createdAt - Creation timestamp
 * @property {number|null} lastEventAt - Last event timestamp
 * @property {boolean} paused - Whether subscription is paused
 */

export class LiveQueryManager {
  /**
   * Creates a new LiveQueryManager
   * @param {Object} connectionManager - Connection manager for WebSocket
   * @param {import('./event-bus.js').EventBus} eventBus - Event bus for notifications
   * @param {Object} [options] - Configuration options
   * @param {number} [options.maxSubscriptions=100] - Maximum concurrent subscriptions
   * @param {number} [options.maxEventsPerSubscription=1000] - Max events to keep
   */
  constructor(connectionManager, eventBus, options = {}) {
    this.connectionManager = connectionManager;
    this.eventBus = eventBus;

    /** @type {Map<string, LiveQuerySubscription>} */
    this.subscriptions = new Map();

    /** @type {number} */
    this.maxSubscriptions = options.maxSubscriptions || LOCAL_NUM_ONE_HUNDRED;

    /** @type {number} */
    this.maxEventsPerSubscription = options.maxEventsPerSubscription || LOCAL_NUM_ONE_HUNDRED0;
  }


  /**
   * Subscribe to a live query
   * Requirements: 32.1, 32.11
   * @param {string} sql - LIVE SELECT statement
   * @param {Object} [options] - Subscription options
   * @return {string} Subscription ID
   * @throws {Error} If maximum subscriptions reached
   */
  subscribe(sql, _options = {}) {
    // Enforce maximum concurrent subscriptions limit
    // Requirements: 32.11
    if (this.subscriptions.size >= this.maxSubscriptions) {
      throw new Error(
        `Maximum ${this.maxSubscriptions} concurrent live queries reached`,
      );
    }

    const subscriptionId = this.generateSubscriptionId();

    /** @type {LiveQuerySubscription} */
    const subscription = {
      id: subscriptionId,
      sql,
      status: 'pending',
      events: [],
      eventRate: 0,
      partitions: [],
      createdAt: Date.now(),
      lastEventAt: null,
      paused: false,
    };

    this.subscriptions.set(subscriptionId, subscription);

    // Send subscription request to server
    if (this.connectionManager) {
      this.connectionManager.subscribeLiveQuery(subscriptionId, sql);
    }

    this.emitEvent(LOCAL_STR_LIVEQUERY_SUBSCRIBED, {subscriptionId, sql});

    return subscriptionId;
  }

  /**
   * Handle one live-query message from the server: the subscribe
   * acknowledgement or an event.
   * @param {Object} message - Server message
   */
  handleLiveQueryEvent(message) {
    const subscription = this.subscriptions.get(message.subscriptionId);
    if (!subscription) {
      return;
    }

    switch (message.type) {
    case LOCAL_STR_LIVE_QUERY_SUBSCRIBED:
      subscription.status = LOCAL_STR_ACTIVE;
      subscription.partitions = message.partitions;
      break;
    case LOCAL_STR_LIVE_QUERY_EVENT:
      this.applyLiveQueryEvent(subscription, message);
      break;
    default:
      break;
    }
  }

  /**
   * Apply one live_query_event. An error ends the subscription and names
   * what failed; a snapshot or reset replaces the result (livequery:result,
   * the one rule every view consumes); any other event is a change
   * (livequery:event). A paused subscription takes neither results nor
   * changes (Requirements: 32.7).
   * @param {LiveQuerySubscription} subscription
   * @param {Object} message - The live_query_event message
   */
  applyLiveQueryEvent(subscription, message) {
    const subscriptionId = subscription.id;
    const {eventType} = message;
    if (eventType === LOCAL_STR_ERROR_EVENT_TYPE) {
      subscription.status = LOCAL_STR_FAILED;
      this.emitEvent(LOCAL_STR_LIVEQUERY_ERROR,
        {subscriptionId, error: message.error, errorCode: message.errorCode});
      return;
    }
    if (subscription.paused) {
      return;
    }
    if (LOCAL_RESULT_EVENT_TYPES.has(eventType)) {
      this.emitEvent(LOCAL_STR_LIVEQUERY_RESULT,
        {subscriptionId, eventType, rows: message.rows});
      return;
    }

    const event = {eventType, timestamp: Date.now()};
    for (const field of LOCAL_CHANGE_ROW_FIELDS) {
      event[field] = message[field];
    }
    subscription.events.push(event);
    subscription.lastEventAt = event.timestamp;
    if (subscription.events.length > this.maxEventsPerSubscription) {
      subscription.events.shift();
    }
    // Requirements: 32.10
    this.updateEventRate(subscription);
    this.emitEvent(LOCAL_STR_LIVEQUERY_EVENT, {subscriptionId, ...event});
  }

  /**
   * Update the event rate for a subscription
   * Requirements: 32.10
   * @param {LiveQuerySubscription} subscription - Subscription to update
   */
  updateEventRate(subscription) {
    const oneSecondAgo = Date.now() - 1000;
    const recentEvents = subscription.events.filter(
      (e) => e.timestamp > oneSecondAgo,
    );
    subscription.eventRate = recentEvents.length;
  }

  /**
   * Pause a live query subscription
   * Requirements: 32.7
   * @param {string} subscriptionId - Subscription ID
   * @return {boolean} True if paused successfully
   */
  pause(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      return false;
    }

    if (subscription.status !== LOCAL_STR_ACTIVE) {
      return false;
    }

    subscription.paused = true;
    this.emitEvent(LOCAL_STR_LIVEQUERY_PAUSED, {subscriptionId});
    return true;
  }

  /**
   * Resume a paused live query subscription
   * Requirements: 32.7
   * @param {string} subscriptionId - Subscription ID
   * @return {boolean} True if resumed successfully
   */
  resume(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      return false;
    }

    if (!subscription.paused) {
      return false;
    }

    subscription.paused = false;
    this.emitEvent(LOCAL_STR_LIVEQUERY_RESUMED, {subscriptionId});
    return true;
  }

  /**
   * Cancel a live query subscription
   * Requirements: 32.9
   * @param {string} subscriptionId - Subscription ID
   * @return {boolean} True if cancelled successfully
   */
  cancel(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      return false;
    }

    // Send unsubscribe to server
    if (this.connectionManager) {
      this.connectionManager.unsubscribeLiveQuery(subscriptionId);
    }

    subscription.status = LOCAL_STR_CANCELLED;
    this.subscriptions.delete(subscriptionId);
    this.emitEvent(LOCAL_STR_LIVEQUERY_CANCELLED, {subscriptionId});
    return true;
  }

  /**
   * Get a subscription by ID
   * @param {string} subscriptionId - Subscription ID
   * @return {LiveQuerySubscription|undefined} Subscription or undefined
   */
  getSubscription(subscriptionId) {
    return this.subscriptions.get(subscriptionId);
  }

  /**
   * Get all subscriptions
   * @return {LiveQuerySubscription[]} All subscriptions
   */
  getAllSubscriptions() {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Get count of active subscriptions
   * @return {number} Active subscription count
   */
  getActiveCount() {
    return Array.from(this.subscriptions.values())
      .filter((s) => s.status === LOCAL_STR_ACTIVE).length;
  }

  /**
   * Get total subscription count
   * @return {number} Total subscription count
   */
  getSubscriptionCount() {
    return this.subscriptions.size;
  }

  /**
   * Check if at maximum capacity
   * Requirements: 32.11
   * @return {boolean} True if at max subscriptions
   */
  isAtCapacity() {
    return this.subscriptions.size >= this.maxSubscriptions;
  }

  /**
   * Get the maximum subscriptions limit
   * @return {number} Maximum subscriptions
   */
  getMaxSubscriptions() {
    return this.maxSubscriptions;
  }

  /**
   * Generate a unique subscription ID
   * @return {string} Subscription ID
   */
  generateSubscriptionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `lq_${timestamp}_${random}`;
  }

  /**
   * Emit an event via the event bus
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emitEvent(event, data = {}) {
    if (this.eventBus) {
      this.eventBus.emit(event, data);
    }
  }

  /**
   * Cancel all subscriptions and clean up
   */
  destroy() {
    for (const subscriptionId of this.subscriptions.keys()) {
      this.cancel(subscriptionId);
    }
    this.subscriptions.clear();
  }
}
