/**
 * CDC Subscription Manager - Manages programmatic CDC subscriptions.
 * Builds on the Live Query infrastructure for function-triggered subscriptions.
 * Requirements: 34.14, 34.15
 */

import {v4 as uuidv4} from 'uuid';
import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {compilePredicate} from '../live-query/live-query-service.js';
import {
  FUNCTION_CDC_MATCH_TYPE,
  FUNCTION_CDC_OPERATION,
  FUNCTION_CDC_PREDICATE,
  FUNCTION_ERROR_MSG,
  FUNCTION_EVENT,
  FUNCTION_LOG_MSG,
  FUNCTION_PREDICATE,
  FUNCTION_SEPARATOR,
  FUNCTION_SUBSCRIPTION_TYPE,
  FUNCTION_SUBSYSTEM,
  TYPEOF,
} from './function-constants.js';

const LOCAL_NUM_ZERO = 0;

/**
 * Subscription types.
 */
const SubscriptionType = FUNCTION_SUBSCRIPTION_TYPE;

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
        return loggingService.forSubsystem(FUNCTION_SUBSYSTEM.CDC_SUBSCRIPTION_MANAGER);
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

    this.logger.info(FUNCTION_LOG_MSG.SUBSCRIPTION_MANAGER_INITIALIZED);
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
    if (typeof callback !== TYPEOF.FUNCTION) {
      throw new Error(FUNCTION_ERROR_MSG.CALLBACK_MUST_BE_FUNCTION);
    }

    const subscriptionId = `${subscriberId}${FUNCTION_SEPARATOR.SUBSCRIPTION_ID}` +
      `${tableName}${FUNCTION_SEPARATOR.SUBSCRIPTION_ID}${uuidv4()}`;

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

    this.logger.info(FUNCTION_LOG_MSG.SUBSCRIPTION_CREATED, {
      subscriptionId,
      subscriberId,
      tableName,
      type: SubscriptionType.CALLBACK,
    });

    this.emit(FUNCTION_EVENT.SUBSCRIPTION_CREATED, {
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
      throw new Error(FUNCTION_ERROR_MSG.FUNCTION_ID_REQUIRED);
    }

    const subscriptionId = `${subscriberId}${FUNCTION_SEPARATOR.SUBSCRIPTION_ID}` +
      `${tableName}${FUNCTION_SEPARATOR.SUBSCRIPTION_ID}${uuidv4()}`;

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

    this.logger.info(FUNCTION_LOG_MSG.SUBSCRIPTION_INVOKE_CREATED, {
      subscriptionId,
      subscriberId,
      tableName,
      functionId,
      type: SubscriptionType.INVOKE,
    });

    this.emit(FUNCTION_EVENT.SUBSCRIPTION_CREATED, {
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
      this.logger.debug(FUNCTION_LOG_MSG.SUBSCRIPTION_NOT_FOUND, {subscriptionId});
      return false;
    }

    this.subscriptions.delete(subscriptionId);
    this.untrackSubscriberSubscription(subscription.subscriberId, subscriptionId);

    this.logger.info(FUNCTION_LOG_MSG.SUBSCRIPTION_REMOVED, {
      subscriptionId,
      subscriberId: subscription.subscriberId,
      tableName: subscription.tableName,
    });

    this.emit(FUNCTION_EVENT.SUBSCRIPTION_REMOVED, {
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

    if (!subscriptionIds || subscriptionIds.size === LOCAL_NUM_ZERO) {
      return LOCAL_NUM_ZERO;
    }

    let count = LOCAL_NUM_ZERO;
    for (const subscriptionId of subscriptionIds) {
      if (await this.unsubscribe(subscriptionId)) {
        count++;
      }
    }

    this.subscriberSubscriptions.delete(subscriberId);

    this.logger.info(FUNCTION_LOG_MSG.SUBSCRIPTIONS_REMOVED_FOR_SUBSCRIBER, {
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
        this.logger.error(FUNCTION_LOG_MSG.CDC_EVENT_HANDLING_FAILED, {
          subscriptionId: subscription.subscriptionId,
          tableName,
          error: error.message,
        });
        throw error;
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

        this.logger.debug(FUNCTION_LOG_MSG.CDC_CALLBACK_EXECUTED, {
          subscriptionId: subscription.subscriptionId,
          matchType: matchResult.type,
        });
      } catch (error) {
        this.logger.error(FUNCTION_LOG_MSG.CDC_CALLBACK_FAILED, {
          subscriptionId: subscription.subscriptionId,
          error: error.message,
        });
        throw error;
      }
    } else if (subscription.type === SubscriptionType.INVOKE) {
      if (!this.functionRegistry) {
        this.logger.error(FUNCTION_LOG_MSG.CDC_INVOKE_MISSING_REGISTRY, {
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

        this.logger.debug(FUNCTION_LOG_MSG.CDC_INVOKE_EXECUTED, {
          subscriptionId: subscription.subscriptionId,
          functionId: subscription.functionId,
          matchType: matchResult.type,
        });
      } catch (error) {
        this.logger.error(FUNCTION_LOG_MSG.CDC_INVOKE_FAILED, {
          subscriptionId: subscription.subscriptionId,
          functionId: subscription.functionId,
          error: error.message,
        });
        throw error;
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
    if (!predicate ||
        predicate === FUNCTION_PREDICATE.MATCH_ALL ||
        predicate === FUNCTION_PREDICATE.TRUE) {
      return () => true;
    }

    // The live-query compilePredicate expects an AST object, not a string.
    // For string predicates, use our simple predicate parser.
    if (typeof predicate === TYPEOF.STRING) {
      return this.createSimplePredicate(predicate);
    }

    try {
      // Use live query's predicate compiler for AST objects
      return compilePredicate(predicate);
    } catch {
      // Fallback: match all
      this.logger.warn(FUNCTION_LOG_MSG.PREDICATE_COMPILE_FAILED, {predicate});
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
    const eqMatch = predicate.match(FUNCTION_CDC_PREDICATE.SIMPLE_EQUALS);
    if (eqMatch) {
      const [, column, value] = eqMatch;
      return (row) => String(row[column]) === value;
    }

    // Default: match all
    this.logger.warn(FUNCTION_LOG_MSG.PREDICATE_PARSE_FAILED, {predicate});
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
    case FUNCTION_CDC_OPERATION.INSERT:
      if (newRow && predicate(newRow)) {
        return {type: FUNCTION_CDC_MATCH_TYPE.INSERT, row: newRow};
      }
      break;

    case FUNCTION_CDC_OPERATION.UPDATE: {
      const oldMatched = oldRow && predicate(oldRow);
      const newMatched = newRow && predicate(newRow);

      if (!oldMatched && newMatched) {
        return {type: FUNCTION_CDC_MATCH_TYPE.ENTER, row: newRow};
      }
      if (oldMatched && !newMatched) {
        return {type: FUNCTION_CDC_MATCH_TYPE.EXIT, row: oldRow};
      }
      if (oldMatched && newMatched) {
        return {type: FUNCTION_CDC_MATCH_TYPE.UPDATE, old: oldRow, new: newRow};
      }
      break;
    }

    case FUNCTION_CDC_OPERATION.DELETE:
      if (oldRow && predicate(oldRow)) {
        return {type: FUNCTION_CDC_MATCH_TYPE.DELETE, row: oldRow};
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
      if (subscriptions.size === LOCAL_NUM_ZERO) {
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
    let totalEvents = LOCAL_NUM_ZERO;
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

    this.logger.info(FUNCTION_LOG_MSG.SUBSCRIPTION_MANAGER_SHUTDOWN);
  }
}

export {CDCSubscriptionManager, SubscriptionType};
