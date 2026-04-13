/**
 * LiveQueryManager - Manages live query subscriptions
 *
 * Handles LIVE SELECT subscriptions that stream matching changes in real-time.
 * Supports subscribe, pause, resume, cancel, and renew operations.
 *
 * Requirements: 32.1, 32.7, 32.9, 32.10, 32.11
 */

/**
 * @typedef {'pending'|'active'|'paused'|'expired'|'cancelled'|'renewing'} SubscriptionStatus
 */

/**
 * @typedef {Object} LiveQueryEvent
 * @property {'INSERT'|'UPDATE'|'DELETE'} eventType - Type of change
 * @property {Object} data - Row data
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
 * @property {Object[]} [initialResults] - Initial query results
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
    this.maxSubscriptions = options.maxSubscriptions || 100;

    /** @type {number} */
    this.maxEventsPerSubscription = options.maxEventsPerSubscription || 1000;
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
      initialResults: null,
    };

    this.subscriptions.set(subscriptionId, subscription);

    // Send subscription request to server
    if (this.connectionManager) {
      this.connectionManager.subscribeLiveQuery(subscriptionId, sql);
    }

    this.emitEvent('livequery:subscribed', {subscriptionId, sql});

    return subscriptionId;
  }

  /**
   * Handle incoming live query event from server
   * @param {Object} message - Server message
   */
  handleLiveQueryEvent(message) {
    const {subscriptionId, eventType, data, partitions, type} = message;
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      return;
    }

    const nextSubscriptionStatus =
      type === 'live_query_initial' || type === 'live_query_renewed' ?
        'active' :
        type === 'live_query_expired' ?
          'expired' :
          subscription.status;
    subscription.status = nextSubscriptionStatus;

    switch (type) {
    case 'live_query_initial':
      // Initial results received
      subscription.partitions = partitions || [];
      subscription.initialResults = data;
      this.emitEvent('livequery:initialized', {
        subscriptionId,
        data,
        partitions,
      });
      break;
    case 'live_query_event':
      // CDC event received
      // Requirements: 32.7 - Don't add events when paused
      if (!subscription.paused) {
        const event = {
          eventType,
          data,
          timestamp: Date.now(),
        };

        subscription.events.push(event);
        subscription.lastEventAt = Date.now();

        // Trim events if exceeding max
        if (subscription.events.length > this.maxEventsPerSubscription) {
          subscription.events.shift();
        }

        // Update event rate
        // Requirements: 32.10
        this.updateEventRate(subscription);

        this.emitEvent('livequery:event', {
          subscriptionId,
          eventType,
          data,
          timestamp: event.timestamp,
        });
      }
      break;
    case 'live_query_expired':
      // Subscription expired
      this.emitEvent('livequery:expired', {subscriptionId});
      break;
    case 'live_query_renewed':
      // Subscription renewed
      this.emitEvent('livequery:renewed', {subscriptionId});
      break;
    default:
      break;
    }
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

    if (subscription.status !== 'active') {
      return false;
    }

    subscription.paused = true;
    this.emitEvent('livequery:paused', {subscriptionId});
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
    this.emitEvent('livequery:resumed', {subscriptionId});
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

    subscription.status = 'cancelled';
    this.subscriptions.delete(subscriptionId);
    this.emitEvent('livequery:cancelled', {subscriptionId});
    return true;
  }

  /**
   * Renew an expired live query subscription
   * @param {string} subscriptionId - Subscription ID
   * @return {boolean} True if renewal initiated
   */
  renew(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      return false;
    }

    if (subscription.status !== 'expired') {
      return false;
    }

    subscription.status = 'renewing';

    // Re-subscribe with same SQL
    if (this.connectionManager) {
      this.connectionManager.subscribeLiveQuery(subscriptionId, subscription.sql);
    }

    this.emitEvent('livequery:renewing', {subscriptionId});
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
      .filter((s) => s.status === 'active').length;
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
