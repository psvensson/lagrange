/**
 * CDC Subscription Manager - Manages programmatic CDC subscriptions.
 * Builds on the Live Query infrastructure for function-triggered subscriptions.
 * Requirements: 34.14, 34.15
 */

import {v4 as uuidv4} from 'uuid';
import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {compilePredicate} from '../live-query/live-query-service.js';

/**
 * Subscription types.
 */
const SubscriptionType = {
  CALLBACK: 'callback',
  INVOKE: 'invoke',
};

/**
 * CDCSubscriptionManager manages programmatic CDC subscriptions
 * for functions and services.
 */
class CDCSubscriptionManager extends EventEmitter {
  /**
   * Create a new CDCSubscriptionManager.
   * @param {Object} options - Configuration options.
   * @param {Object} options.liveQueryManager - Live query manager for CDC infrastructure.
   * @param {Object} options.functionRegistry - Function registry for invocations.
   */
  constructor(options = {}) {
    super();

    this.liveQueryManager = options.liveQueryManager || null;
    this.functionRegistry = options.functionRegistry || null;
    this.subscriptions = new Map(); // subscriptionId → subscription
    this.subscriberSubscriptions = new Map(); // subscriberId → Set<subscriptionId>
    this.logger = this.initLogger();
    this.initialized = false;
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem('cdc-subscription-manager');
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Initialize the subscription manager.
   * @param {Object} options - Initialization options.
   * @param {Object} options.liveQueryManager - Live query manager.
   * @param {Object} options.functionRegistry - Function registry.
   */
  initialize(options = {}) {
    if (options.liveQueryManager) {
      this.liveQueryManager = options.liveQueryManager;
    }
    if (options.functionRegistry) {
      this.functionRegistry = options.functionRegistry;
    }

    this.initialized = true;

    this.logger.info('CDC subscription manager initialized');
  }

  /**
   * Subscribe to CDC events with a callback function.
   * @param {string} subscriberId - Unique identifier for subscriber.
   * @param {string} tableName - Table to subscribe to.
   * @param {string} predicate - SQL WHERE clause predicate.
   * @param {Function} callback - Called when matching events occur.
   * @return {Promise<Object>} Subscription result with subscriptionId.
   */
  async subscribe(subscriberId, tableName, predicate, callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }

    const subscriptionId = `${subscriberId}:${tableName}:${uuidv4()}`;

    const subscription = {
      subscriptionId,
      subscriberId,
      tableName,
      predicate,
      callback,
      type: SubscriptionType.CALLBACK,
      compiledPredicate: this.compilePredicate(predicate),
      createdAt: Date.now(),
      eventCount: 0,
    };

    this.subscriptions.set(subscriptionId, subscription);
    this.trackSubscriberSubscription(subscriberId, subscriptionId);

    this.logger.info('CDC subscription created', {
      subscriptionId,
      subscriberId,
      tableName,
      type: SubscriptionType.CALLBACK,
    });

    this.emit('subscription-created', {
      subscriptionId,
      subscriberId,
      tableName,
      type: SubscriptionType.CALLBACK,
    });

    return {subscriptionId};
  }

  /**
   * Subscribe to CDC events that trigger a function invocation.
   * @param {string} subscriberId - Unique identifier for subscriber.
   * @param {string} tableName - Table to subscribe to.
   * @param {string} predicate - SQL WHERE clause predicate.
   * @param {string} functionId - Function to invoke on matching events.
   * @param {Object} baseContext - Base context to pass to function.
   * @return {Promise<Object>} Subscription result with subscriptionId.
   */
  async subscribeWithInvoke(subscriberId, tableName, predicate, functionId, baseContext = {}) {
    if (!functionId) {
      throw new Error('Function ID is required');
    }

    const subscriptionId = `${subscriberId}:${tableName}:${uuidv4()}`;

    const subscription = {
      subscriptionId,
      subscriberId,
      tableName,
      predicate,
      functionId,
      baseContext,
      type: SubscriptionType.INVOKE,
      compiledPredicate: this.compilePredicate(predicate),
      createdAt: Date.now(),
      eventCount: 0,
    };

    this.subscriptions.set(subscriptionId, subscription);
    this.trackSubscriberSubscription(subscriberId, subscriptionId);

    this.logger.info('CDC subscription with invoke created', {
      subscriptionId,
      subscriberId,
      tableName,
      functionId,
      type: SubscriptionType.INVOKE,
    });

    this.emit('subscription-created', {
      subscriptionId,
      subscriberId,
      tableName,
      functionId,
      type: SubscriptionType.INVOKE,
    });

    return {subscriptionId};
  }

  /**
   * Unsubscribe from CDC events.
   * @param {string} subscriptionId - Subscription to cancel.
   * @return {Promise<boolean>} True if unsubscribed.
   */
  async unsubscribe(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      this.logger.debug('Subscription not found for unsubscribe', {subscriptionId});
      return false;
    }

    this.subscriptions.delete(subscriptionId);
    this.untrackSubscriberSubscription(subscription.subscriberId, subscriptionId);

    this.logger.info('CDC subscription removed', {
      subscriptionId,
      subscriberId: subscription.subscriberId,
      tableName: subscription.tableName,
    });

    this.emit('subscription-removed', {
      subscriptionId,
      subscriberId: subscription.subscriberId,
    });

    return true;
  }

  /**
   * Unsubscribe all subscriptions for a subscriber.
   * @param {string} subscriberId - Subscriber ID.
   * @return {Promise<number>} Number of subscriptions removed.
   */
  async unsubscribeAll(subscriberId) {
    const subscriptionIds = this.subscriberSubscriptions.get(subscriberId);

    if (!subscriptionIds || subscriptionIds.size === 0) {
      return 0;
    }

    let count = 0;
    for (const subscriptionId of subscriptionIds) {
      if (await this.unsubscribe(subscriptionId)) {
        count++;
      }
    }

    this.subscriberSubscriptions.delete(subscriberId);

    this.logger.info('All subscriptions removed for subscriber', {
      subscriberId,
      count,
    });

    return count;
  }

  /**
   * Handle a CDC event from a table.
   * Evaluates predicates and dispatches to matching subscriptions.
   * @param {string} tableName - Table the event is from.
   * @param {Object} change - CDC change event.
   */
  async handleCDCEvent(tableName, change) {
    const matchingSubscriptions = this.getSubscriptionsForTable(tableName);

    for (const subscription of matchingSubscriptions) {
      try {
        const matchResult = this.evaluateChange(change, subscription.compiledPredicate);

        if (matchResult) {
          subscription.eventCount++;
          await this.dispatchToSubscription(subscription, change, matchResult);
        }
      } catch (error) {
        this.logger.error('Error handling CDC event for subscription', {
          subscriptionId: subscription.subscriptionId,
          tableName,
          error: error.message,
        });
      }
    }
  }

  /**
   * Dispatch a matching event to a subscription.
   * @param {Object} subscription - Subscription to dispatch to.
   * @param {Object} change - CDC change event.
   * @param {Object} matchResult - Result of predicate evaluation.
   * @private
   */
  async dispatchToSubscription(subscription, change, matchResult) {
    if (subscription.type === SubscriptionType.CALLBACK) {
      try {
        await subscription.callback(change, matchResult);

        this.logger.debug('CDC callback executed', {
          subscriptionId: subscription.subscriptionId,
          matchType: matchResult.type,
        });
      } catch (error) {
        this.logger.error('CDC callback failed', {
          subscriptionId: subscription.subscriptionId,
          error: error.message,
        });
      }
    } else if (subscription.type === SubscriptionType.INVOKE) {
      if (!this.functionRegistry) {
        this.logger.error('Function registry not available for invoke', {
          subscriptionId: subscription.subscriptionId,
        });
        return;
      }

      try {
        await this.functionRegistry.invoke(subscription.functionId, {
          ...subscription.baseContext,
          cdcEvent: change,
          matchResult,
          subscriptionId: subscription.subscriptionId,
        });

        this.logger.debug('CDC function invoked', {
          subscriptionId: subscription.subscriptionId,
          functionId: subscription.functionId,
          matchType: matchResult.type,
        });
      } catch (error) {
        this.logger.error('CDC function invocation failed', {
          subscriptionId: subscription.subscriptionId,
          functionId: subscription.functionId,
          error: error.message,
        });
      }
    }
  }

  /**
   * Compile a predicate string into an evaluation function.
   * @param {string} predicate - SQL WHERE clause predicate.
   * @return {Function} Compiled predicate function.
   * @private
   */
  compilePredicate(predicate) {
    if (!predicate || predicate === '*' || predicate === 'true') {
      return () => true;
    }

    // The live-query compilePredicate expects an AST object, not a string.
    // For string predicates, use our simple predicate parser.
    if (typeof predicate === 'string') {
      return this.createSimplePredicate(predicate);
    }

    try {
      // Use live query's predicate compiler for AST objects
      return compilePredicate(predicate);
    } catch {
      // Fallback: match all
      this.logger.warn('Could not compile predicate, matching all', {predicate});
      return () => true;
    }
  }

  /**
   * Create a simple predicate for common patterns.
   * @param {string} predicate - Predicate string.
   * @return {Function} Predicate function.
   * @private
   */
  createSimplePredicate(predicate) {
    // Handle simple equality: "column = 'value'" or "column = value"
    const eqMatch = predicate.match(/^(\w+)\s*=\s*['"]?([^'"]+)['"]?$/);
    if (eqMatch) {
      const [, column, value] = eqMatch;
      return (row) => String(row[column]) === value;
    }

    // Default: match all
    this.logger.warn('Could not parse predicate, matching all', {predicate});
    return () => true;
  }

  /**
   * Evaluate a CDC change against a predicate.
   * @param {Object} change - CDC change event.
   * @param {Function} predicate - Compiled predicate function.
   * @return {Object|null} Match result or null.
   * @private
   */
  evaluateChange(change, predicate) {
    const {operation, data: newRow, old_data: oldRow} = change;

    switch (operation?.toUpperCase()) {
    case 'INSERT':
      if (newRow && predicate(newRow)) {
        return {type: 'insert', row: newRow};
      }
      break;

    case 'UPDATE': {
      const oldMatched = oldRow && predicate(oldRow);
      const newMatched = newRow && predicate(newRow);

      if (!oldMatched && newMatched) {
        return {type: 'enter', row: newRow};
      }
      if (oldMatched && !newMatched) {
        return {type: 'exit', row: oldRow};
      }
      if (oldMatched && newMatched) {
        return {type: 'update', old: oldRow, new: newRow};
      }
      break;
    }

    case 'DELETE':
      if (oldRow && predicate(oldRow)) {
        return {type: 'delete', row: oldRow};
      }
      break;
    }

    return null;
  }

  /**
   * Get all subscriptions for a table.
   * @param {string} tableName - Table name.
   * @return {Array} Array of subscriptions.
   * @private
   */
  getSubscriptionsForTable(tableName) {
    const result = [];
    for (const subscription of this.subscriptions.values()) {
      if (subscription.tableName === tableName) {
        result.push(subscription);
      }
    }
    return result;
  }

  /**
   * Track a subscription for a subscriber.
   * @param {string} subscriberId - Subscriber ID.
   * @param {string} subscriptionId - Subscription ID.
   * @private
   */
  trackSubscriberSubscription(subscriberId, subscriptionId) {
    if (!this.subscriberSubscriptions.has(subscriberId)) {
      this.subscriberSubscriptions.set(subscriberId, new Set());
    }
    this.subscriberSubscriptions.get(subscriberId).add(subscriptionId);
  }

  /**
   * Untrack a subscription for a subscriber.
   * @param {string} subscriberId - Subscriber ID.
   * @param {string} subscriptionId - Subscription ID.
   * @private
   */
  untrackSubscriberSubscription(subscriberId, subscriptionId) {
    const subscriptions = this.subscriberSubscriptions.get(subscriberId);
    if (subscriptions) {
      subscriptions.delete(subscriptionId);
      if (subscriptions.size === 0) {
        this.subscriberSubscriptions.delete(subscriberId);
      }
    }
  }

  /**
   * Get subscription by ID.
   * @param {string} subscriptionId - Subscription ID.
   * @return {Object|undefined} Subscription or undefined.
   */
  getSubscription(subscriptionId) {
    return this.subscriptions.get(subscriptionId);
  }

  /**
   * Get all subscriptions for a subscriber.
   * @param {string} subscriberId - Subscriber ID.
   * @return {Array} Array of subscriptions.
   */
  getSubscriptionsForSubscriber(subscriberId) {
    const subscriptionIds = this.subscriberSubscriptions.get(subscriberId);
    if (!subscriptionIds) {
      return [];
    }

    const result = [];
    for (const id of subscriptionIds) {
      const subscription = this.subscriptions.get(id);
      if (subscription) {
        result.push(subscription);
      }
    }
    return result;
  }

  /**
   * Get statistics.
   * @return {Object} Manager statistics.
   */
  getStats() {
    let totalEvents = 0;
    for (const subscription of this.subscriptions.values()) {
      totalEvents += subscription.eventCount;
    }

    return {
      subscriptionCount: this.subscriptions.size,
      subscriberCount: this.subscriberSubscriptions.size,
      totalEventsProcessed: totalEvents,
    };
  }

  /**
   * Check if manager is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Shutdown the manager.
   */
  shutdown() {
    this.subscriptions.clear();
    this.subscriberSubscriptions.clear();
    this.initialized = false;
    this.removeAllListeners();

    this.logger.info('CDC subscription manager shutdown');
  }
}

export {CDCSubscriptionManager, SubscriptionType};
