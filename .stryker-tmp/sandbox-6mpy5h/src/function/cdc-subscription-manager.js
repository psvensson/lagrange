/**
 * CDC Subscription Manager - Manages programmatic CDC subscriptions.
 * Builds on the Live Query infrastructure for function-triggered subscriptions.
 * Requirements: 34.14, 34.15
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { LoggingService } from '../logging/logging-service.js';
import { compilePredicate } from '../live-query/live-query-service.js';
import { FUNCTION_CDC_MATCH_TYPE, FUNCTION_CDC_OPERATION, FUNCTION_CDC_PREDICATE, FUNCTION_ERROR_MSG, FUNCTION_EVENT, FUNCTION_LOG_MSG, FUNCTION_PREDICATE, FUNCTION_SEPARATOR, FUNCTION_SUBSCRIPTION_TYPE, FUNCTION_SUBSYSTEM, TYPEOF } from './function-constants.js';

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
    if (stryMutAct_9fa48("79100")) {
      {}
    } else {
      stryCov_9fa48("79100");
      super();
      this.liveQueryManager = stryMutAct_9fa48("79103") ? options.liveQueryManager && null : stryMutAct_9fa48("79102") ? false : stryMutAct_9fa48("79101") ? true : (stryCov_9fa48("79101", "79102", "79103"), options.liveQueryManager || null);
      this.functionRegistry = stryMutAct_9fa48("79106") ? options.functionRegistry && null : stryMutAct_9fa48("79105") ? false : stryMutAct_9fa48("79104") ? true : (stryCov_9fa48("79104", "79105", "79106"), options.functionRegistry || null);
      this.subscriptions = new Map(); // subscriptionId → subscription
      this.subscriberSubscriptions = new Map(); // subscriberId → Set<subscriptionId>
      this.logger = this.initLogger();
      this.initialized = stryMutAct_9fa48("79107") ? true : (stryCov_9fa48("79107"), false);
    }
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("79108")) {
      {}
    } else {
      stryCov_9fa48("79108");
      try {
        if (stryMutAct_9fa48("79109")) {
          {}
        } else {
          stryCov_9fa48("79109");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("79111") ? false : stryMutAct_9fa48("79110") ? true : (stryCov_9fa48("79110", "79111"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("79112")) {
              {}
            } else {
              stryCov_9fa48("79112");
              return loggingService.forSubsystem(FUNCTION_SUBSYSTEM.CDC_SUBSCRIPTION_MANAGER);
            }
          }
        }
      } catch {
        // Logging not available
      }
      return console;
    }
  }

  /**
   * Initialize the subscription manager.
   * @param {Object} options - Initialization options.
   * @param {Object} options.liveQueryManager - Live query manager.
   * @param {Object} options.functionRegistry - Function registry.
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("79113")) {
      {}
    } else {
      stryCov_9fa48("79113");
      if (stryMutAct_9fa48("79115") ? false : stryMutAct_9fa48("79114") ? true : (stryCov_9fa48("79114", "79115"), options.liveQueryManager)) {
        if (stryMutAct_9fa48("79116")) {
          {}
        } else {
          stryCov_9fa48("79116");
          this.liveQueryManager = options.liveQueryManager;
        }
      }
      if (stryMutAct_9fa48("79118") ? false : stryMutAct_9fa48("79117") ? true : (stryCov_9fa48("79117", "79118"), options.functionRegistry)) {
        if (stryMutAct_9fa48("79119")) {
          {}
        } else {
          stryCov_9fa48("79119");
          this.functionRegistry = options.functionRegistry;
        }
      }
      this.initialized = stryMutAct_9fa48("79120") ? false : (stryCov_9fa48("79120"), true);
      this.logger.info(FUNCTION_LOG_MSG.SUBSCRIPTION_MANAGER_INITIALIZED);
    }
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
    if (stryMutAct_9fa48("79121")) {
      {}
    } else {
      stryCov_9fa48("79121");
      if (stryMutAct_9fa48("79124") ? typeof callback === TYPEOF.FUNCTION : stryMutAct_9fa48("79123") ? false : stryMutAct_9fa48("79122") ? true : (stryCov_9fa48("79122", "79123", "79124"), typeof callback !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("79125")) {
          {}
        } else {
          stryCov_9fa48("79125");
          throw new Error(FUNCTION_ERROR_MSG.CALLBACK_MUST_BE_FUNCTION);
        }
      }
      const subscriptionId = (stryMutAct_9fa48("79126") ? `` : (stryCov_9fa48("79126"), `${subscriberId}${FUNCTION_SEPARATOR.SUBSCRIPTION_ID}`)) + (stryMutAct_9fa48("79127") ? `` : (stryCov_9fa48("79127"), `${tableName}${FUNCTION_SEPARATOR.SUBSCRIPTION_ID}${uuidv4()}`));
      const subscription = stryMutAct_9fa48("79128") ? {} : (stryCov_9fa48("79128"), {
        subscriptionId,
        subscriberId,
        tableName,
        predicate,
        callback,
        type: SubscriptionType.CALLBACK,
        compiledPredicate: this.compilePredicate(predicate),
        createdAt: Date.now(),
        eventCount: 0
      });
      this.subscriptions.set(subscriptionId, subscription);
      this.trackSubscriberSubscription(subscriberId, subscriptionId);
      this.logger.info(FUNCTION_LOG_MSG.SUBSCRIPTION_CREATED, stryMutAct_9fa48("79129") ? {} : (stryCov_9fa48("79129"), {
        subscriptionId,
        subscriberId,
        tableName,
        type: SubscriptionType.CALLBACK
      }));
      this.emit(FUNCTION_EVENT.SUBSCRIPTION_CREATED, stryMutAct_9fa48("79130") ? {} : (stryCov_9fa48("79130"), {
        subscriptionId,
        subscriberId,
        tableName,
        type: SubscriptionType.CALLBACK
      }));
      return stryMutAct_9fa48("79131") ? {} : (stryCov_9fa48("79131"), {
        subscriptionId
      });
    }
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
    if (stryMutAct_9fa48("79132")) {
      {}
    } else {
      stryCov_9fa48("79132");
      if (stryMutAct_9fa48("79135") ? false : stryMutAct_9fa48("79134") ? true : stryMutAct_9fa48("79133") ? functionId : (stryCov_9fa48("79133", "79134", "79135"), !functionId)) {
        if (stryMutAct_9fa48("79136")) {
          {}
        } else {
          stryCov_9fa48("79136");
          throw new Error(FUNCTION_ERROR_MSG.FUNCTION_ID_REQUIRED);
        }
      }
      const subscriptionId = (stryMutAct_9fa48("79137") ? `` : (stryCov_9fa48("79137"), `${subscriberId}${FUNCTION_SEPARATOR.SUBSCRIPTION_ID}`)) + (stryMutAct_9fa48("79138") ? `` : (stryCov_9fa48("79138"), `${tableName}${FUNCTION_SEPARATOR.SUBSCRIPTION_ID}${uuidv4()}`));
      const subscription = stryMutAct_9fa48("79139") ? {} : (stryCov_9fa48("79139"), {
        subscriptionId,
        subscriberId,
        tableName,
        predicate,
        functionId,
        baseContext,
        type: SubscriptionType.INVOKE,
        compiledPredicate: this.compilePredicate(predicate),
        createdAt: Date.now(),
        eventCount: 0
      });
      this.subscriptions.set(subscriptionId, subscription);
      this.trackSubscriberSubscription(subscriberId, subscriptionId);
      this.logger.info(FUNCTION_LOG_MSG.SUBSCRIPTION_INVOKE_CREATED, stryMutAct_9fa48("79140") ? {} : (stryCov_9fa48("79140"), {
        subscriptionId,
        subscriberId,
        tableName,
        functionId,
        type: SubscriptionType.INVOKE
      }));
      this.emit(FUNCTION_EVENT.SUBSCRIPTION_CREATED, stryMutAct_9fa48("79141") ? {} : (stryCov_9fa48("79141"), {
        subscriptionId,
        subscriberId,
        tableName,
        functionId,
        type: SubscriptionType.INVOKE
      }));
      return stryMutAct_9fa48("79142") ? {} : (stryCov_9fa48("79142"), {
        subscriptionId
      });
    }
  }

  /**
   * Unsubscribe from CDC events.
   * @param {string} subscriptionId - Subscription to cancel.
   * @return {Promise<boolean>} True if unsubscribed.
   */
  async unsubscribe(subscriptionId) {
    if (stryMutAct_9fa48("79143")) {
      {}
    } else {
      stryCov_9fa48("79143");
      const subscription = this.subscriptions.get(subscriptionId);
      if (stryMutAct_9fa48("79146") ? false : stryMutAct_9fa48("79145") ? true : stryMutAct_9fa48("79144") ? subscription : (stryCov_9fa48("79144", "79145", "79146"), !subscription)) {
        if (stryMutAct_9fa48("79147")) {
          {}
        } else {
          stryCov_9fa48("79147");
          this.logger.debug(FUNCTION_LOG_MSG.SUBSCRIPTION_NOT_FOUND, stryMutAct_9fa48("79148") ? {} : (stryCov_9fa48("79148"), {
            subscriptionId
          }));
          return stryMutAct_9fa48("79149") ? true : (stryCov_9fa48("79149"), false);
        }
      }
      this.subscriptions.delete(subscriptionId);
      this.untrackSubscriberSubscription(subscription.subscriberId, subscriptionId);
      this.logger.info(FUNCTION_LOG_MSG.SUBSCRIPTION_REMOVED, stryMutAct_9fa48("79150") ? {} : (stryCov_9fa48("79150"), {
        subscriptionId,
        subscriberId: subscription.subscriberId,
        tableName: subscription.tableName
      }));
      this.emit(FUNCTION_EVENT.SUBSCRIPTION_REMOVED, stryMutAct_9fa48("79151") ? {} : (stryCov_9fa48("79151"), {
        subscriptionId,
        subscriberId: subscription.subscriberId
      }));
      return stryMutAct_9fa48("79152") ? false : (stryCov_9fa48("79152"), true);
    }
  }

  /**
   * Unsubscribe all subscriptions for a subscriber.
   * @param {string} subscriberId - Subscriber ID.
   * @return {Promise<number>} Number of subscriptions removed.
   */
  async unsubscribeAll(subscriberId) {
    if (stryMutAct_9fa48("79153")) {
      {}
    } else {
      stryCov_9fa48("79153");
      const subscriptionIds = this.subscriberSubscriptions.get(subscriberId);
      if (stryMutAct_9fa48("79156") ? !subscriptionIds && subscriptionIds.size === 0 : stryMutAct_9fa48("79155") ? false : stryMutAct_9fa48("79154") ? true : (stryCov_9fa48("79154", "79155", "79156"), (stryMutAct_9fa48("79157") ? subscriptionIds : (stryCov_9fa48("79157"), !subscriptionIds)) || (stryMutAct_9fa48("79159") ? subscriptionIds.size !== 0 : stryMutAct_9fa48("79158") ? false : (stryCov_9fa48("79158", "79159"), subscriptionIds.size === 0)))) {
        if (stryMutAct_9fa48("79160")) {
          {}
        } else {
          stryCov_9fa48("79160");
          return 0;
        }
      }
      let count = 0;
      for (const subscriptionId of subscriptionIds) {
        if (stryMutAct_9fa48("79161")) {
          {}
        } else {
          stryCov_9fa48("79161");
          if (stryMutAct_9fa48("79163") ? false : stryMutAct_9fa48("79162") ? true : (stryCov_9fa48("79162", "79163"), await this.unsubscribe(subscriptionId))) {
            if (stryMutAct_9fa48("79164")) {
              {}
            } else {
              stryCov_9fa48("79164");
              stryMutAct_9fa48("79165") ? count-- : (stryCov_9fa48("79165"), count++);
            }
          }
        }
      }
      this.subscriberSubscriptions.delete(subscriberId);
      this.logger.info(FUNCTION_LOG_MSG.SUBSCRIPTIONS_REMOVED_FOR_SUBSCRIBER, stryMutAct_9fa48("79166") ? {} : (stryCov_9fa48("79166"), {
        subscriberId,
        count
      }));
      return count;
    }
  }

  /**
   * Handle a CDC event from a table.
   * Evaluates predicates and dispatches to matching subscriptions.
   * @param {string} tableName - Table the event is from.
   * @param {Object} change - CDC change event.
   */
  async handleCDCEvent(tableName, change) {
    if (stryMutAct_9fa48("79167")) {
      {}
    } else {
      stryCov_9fa48("79167");
      const matchingSubscriptions = this.getSubscriptionsForTable(tableName);
      for (const subscription of matchingSubscriptions) {
        if (stryMutAct_9fa48("79168")) {
          {}
        } else {
          stryCov_9fa48("79168");
          try {
            if (stryMutAct_9fa48("79169")) {
              {}
            } else {
              stryCov_9fa48("79169");
              const matchResult = this.evaluateChange(change, subscription.compiledPredicate);
              if (stryMutAct_9fa48("79171") ? false : stryMutAct_9fa48("79170") ? true : (stryCov_9fa48("79170", "79171"), matchResult)) {
                if (stryMutAct_9fa48("79172")) {
                  {}
                } else {
                  stryCov_9fa48("79172");
                  stryMutAct_9fa48("79173") ? subscription.eventCount-- : (stryCov_9fa48("79173"), subscription.eventCount++);
                  await this.dispatchToSubscription(subscription, change, matchResult);
                }
              }
            }
          } catch (error) {
            if (stryMutAct_9fa48("79174")) {
              {}
            } else {
              stryCov_9fa48("79174");
              this.logger.error(FUNCTION_LOG_MSG.CDC_EVENT_HANDLING_FAILED, stryMutAct_9fa48("79175") ? {} : (stryCov_9fa48("79175"), {
                subscriptionId: subscription.subscriptionId,
                tableName,
                error: error.message
              }));
              throw error;
            }
          }
        }
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
    if (stryMutAct_9fa48("79176")) {
      {}
    } else {
      stryCov_9fa48("79176");
      if (stryMutAct_9fa48("79179") ? subscription.type !== SubscriptionType.CALLBACK : stryMutAct_9fa48("79178") ? false : stryMutAct_9fa48("79177") ? true : (stryCov_9fa48("79177", "79178", "79179"), subscription.type === SubscriptionType.CALLBACK)) {
        if (stryMutAct_9fa48("79180")) {
          {}
        } else {
          stryCov_9fa48("79180");
          try {
            if (stryMutAct_9fa48("79181")) {
              {}
            } else {
              stryCov_9fa48("79181");
              await subscription.callback(change, matchResult);
              this.logger.debug(FUNCTION_LOG_MSG.CDC_CALLBACK_EXECUTED, stryMutAct_9fa48("79182") ? {} : (stryCov_9fa48("79182"), {
                subscriptionId: subscription.subscriptionId,
                matchType: matchResult.type
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("79183")) {
              {}
            } else {
              stryCov_9fa48("79183");
              this.logger.error(FUNCTION_LOG_MSG.CDC_CALLBACK_FAILED, stryMutAct_9fa48("79184") ? {} : (stryCov_9fa48("79184"), {
                subscriptionId: subscription.subscriptionId,
                error: error.message
              }));
              throw error;
            }
          }
        }
      } else if (stryMutAct_9fa48("79187") ? subscription.type !== SubscriptionType.INVOKE : stryMutAct_9fa48("79186") ? false : stryMutAct_9fa48("79185") ? true : (stryCov_9fa48("79185", "79186", "79187"), subscription.type === SubscriptionType.INVOKE)) {
        if (stryMutAct_9fa48("79188")) {
          {}
        } else {
          stryCov_9fa48("79188");
          if (stryMutAct_9fa48("79191") ? false : stryMutAct_9fa48("79190") ? true : stryMutAct_9fa48("79189") ? this.functionRegistry : (stryCov_9fa48("79189", "79190", "79191"), !this.functionRegistry)) {
            if (stryMutAct_9fa48("79192")) {
              {}
            } else {
              stryCov_9fa48("79192");
              this.logger.error(FUNCTION_LOG_MSG.CDC_INVOKE_MISSING_REGISTRY, stryMutAct_9fa48("79193") ? {} : (stryCov_9fa48("79193"), {
                subscriptionId: subscription.subscriptionId
              }));
              return;
            }
          }
          try {
            if (stryMutAct_9fa48("79194")) {
              {}
            } else {
              stryCov_9fa48("79194");
              await this.functionRegistry.invoke(subscription.functionId, stryMutAct_9fa48("79195") ? {} : (stryCov_9fa48("79195"), {
                ...subscription.baseContext,
                cdcEvent: change,
                matchResult,
                subscriptionId: subscription.subscriptionId
              }));
              this.logger.debug(FUNCTION_LOG_MSG.CDC_INVOKE_EXECUTED, stryMutAct_9fa48("79196") ? {} : (stryCov_9fa48("79196"), {
                subscriptionId: subscription.subscriptionId,
                functionId: subscription.functionId,
                matchType: matchResult.type
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("79197")) {
              {}
            } else {
              stryCov_9fa48("79197");
              this.logger.error(FUNCTION_LOG_MSG.CDC_INVOKE_FAILED, stryMutAct_9fa48("79198") ? {} : (stryCov_9fa48("79198"), {
                subscriptionId: subscription.subscriptionId,
                functionId: subscription.functionId,
                error: error.message
              }));
              throw error;
            }
          }
        }
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
    if (stryMutAct_9fa48("79199")) {
      {}
    } else {
      stryCov_9fa48("79199");
      if (stryMutAct_9fa48("79202") ? (!predicate || predicate === FUNCTION_PREDICATE.MATCH_ALL) && predicate === FUNCTION_PREDICATE.TRUE : stryMutAct_9fa48("79201") ? false : stryMutAct_9fa48("79200") ? true : (stryCov_9fa48("79200", "79201", "79202"), (stryMutAct_9fa48("79204") ? !predicate && predicate === FUNCTION_PREDICATE.MATCH_ALL : stryMutAct_9fa48("79203") ? false : (stryCov_9fa48("79203", "79204"), (stryMutAct_9fa48("79205") ? predicate : (stryCov_9fa48("79205"), !predicate)) || (stryMutAct_9fa48("79207") ? predicate !== FUNCTION_PREDICATE.MATCH_ALL : stryMutAct_9fa48("79206") ? false : (stryCov_9fa48("79206", "79207"), predicate === FUNCTION_PREDICATE.MATCH_ALL)))) || (stryMutAct_9fa48("79209") ? predicate !== FUNCTION_PREDICATE.TRUE : stryMutAct_9fa48("79208") ? false : (stryCov_9fa48("79208", "79209"), predicate === FUNCTION_PREDICATE.TRUE)))) {
        if (stryMutAct_9fa48("79210")) {
          {}
        } else {
          stryCov_9fa48("79210");
          return stryMutAct_9fa48("79211") ? () => undefined : (stryCov_9fa48("79211"), () => stryMutAct_9fa48("79212") ? false : (stryCov_9fa48("79212"), true));
        }
      }

      // The live-query compilePredicate expects an AST object, not a string.
      // For string predicates, use our simple predicate parser.
      if (stryMutAct_9fa48("79215") ? typeof predicate !== TYPEOF.STRING : stryMutAct_9fa48("79214") ? false : stryMutAct_9fa48("79213") ? true : (stryCov_9fa48("79213", "79214", "79215"), typeof predicate === TYPEOF.STRING)) {
        if (stryMutAct_9fa48("79216")) {
          {}
        } else {
          stryCov_9fa48("79216");
          return this.createSimplePredicate(predicate);
        }
      }
      try {
        if (stryMutAct_9fa48("79217")) {
          {}
        } else {
          stryCov_9fa48("79217");
          // Use live query's predicate compiler for AST objects
          return compilePredicate(predicate);
        }
      } catch {
        if (stryMutAct_9fa48("79218")) {
          {}
        } else {
          stryCov_9fa48("79218");
          // Fallback: match all
          this.logger.warn(FUNCTION_LOG_MSG.PREDICATE_COMPILE_FAILED, stryMutAct_9fa48("79219") ? {} : (stryCov_9fa48("79219"), {
            predicate
          }));
          return stryMutAct_9fa48("79220") ? () => undefined : (stryCov_9fa48("79220"), () => stryMutAct_9fa48("79221") ? false : (stryCov_9fa48("79221"), true));
        }
      }
    }
  }

  /**
   * Create a simple predicate for common patterns.
   * @param {string} predicate - Predicate string.
   * @return {Function} Predicate function.
   * @private
   */
  createSimplePredicate(predicate) {
    if (stryMutAct_9fa48("79222")) {
      {}
    } else {
      stryCov_9fa48("79222");
      // Handle simple equality: "column = 'value'" or "column = value"
      const eqMatch = predicate.match(FUNCTION_CDC_PREDICATE.SIMPLE_EQUALS);
      if (stryMutAct_9fa48("79224") ? false : stryMutAct_9fa48("79223") ? true : (stryCov_9fa48("79223", "79224"), eqMatch)) {
        if (stryMutAct_9fa48("79225")) {
          {}
        } else {
          stryCov_9fa48("79225");
          const [, column, value] = eqMatch;
          return stryMutAct_9fa48("79226") ? () => undefined : (stryCov_9fa48("79226"), row => stryMutAct_9fa48("79229") ? String(row[column]) !== value : stryMutAct_9fa48("79228") ? false : stryMutAct_9fa48("79227") ? true : (stryCov_9fa48("79227", "79228", "79229"), String(row[column]) === value));
        }
      }

      // Default: match all
      this.logger.warn(FUNCTION_LOG_MSG.PREDICATE_PARSE_FAILED, stryMutAct_9fa48("79230") ? {} : (stryCov_9fa48("79230"), {
        predicate
      }));
      return stryMutAct_9fa48("79231") ? () => undefined : (stryCov_9fa48("79231"), () => stryMutAct_9fa48("79232") ? false : (stryCov_9fa48("79232"), true));
    }
  }

  /**
   * Evaluate a CDC change against a predicate.
   * @param {Object} change - CDC change event.
   * @param {Function} predicate - Compiled predicate function.
   * @return {Object|null} Match result or null.
   * @private
   */
  evaluateChange(change, predicate) {
    if (stryMutAct_9fa48("79233")) {
      {}
    } else {
      stryCov_9fa48("79233");
      const {
        operation,
        data: newRow,
        old_data: oldRow
      } = change;
      switch (stryMutAct_9fa48("79235") ? operation.toUpperCase() : stryMutAct_9fa48("79234") ? operation?.toLowerCase() : (stryCov_9fa48("79234", "79235"), operation?.toUpperCase())) {
        case FUNCTION_CDC_OPERATION.INSERT:
          if (stryMutAct_9fa48("79236")) {} else {
            stryCov_9fa48("79236");
            if (stryMutAct_9fa48("79239") ? newRow || predicate(newRow) : stryMutAct_9fa48("79238") ? false : stryMutAct_9fa48("79237") ? true : (stryCov_9fa48("79237", "79238", "79239"), newRow && predicate(newRow))) {
              if (stryMutAct_9fa48("79240")) {
                {}
              } else {
                stryCov_9fa48("79240");
                return stryMutAct_9fa48("79241") ? {} : (stryCov_9fa48("79241"), {
                  type: FUNCTION_CDC_MATCH_TYPE.INSERT,
                  row: newRow
                });
              }
            }
            break;
          }
        case FUNCTION_CDC_OPERATION.UPDATE:
          if (stryMutAct_9fa48("79242")) {} else {
            stryCov_9fa48("79242");
            {
              if (stryMutAct_9fa48("79243")) {
                {}
              } else {
                stryCov_9fa48("79243");
                const oldMatched = stryMutAct_9fa48("79246") ? oldRow || predicate(oldRow) : stryMutAct_9fa48("79245") ? false : stryMutAct_9fa48("79244") ? true : (stryCov_9fa48("79244", "79245", "79246"), oldRow && predicate(oldRow));
                const newMatched = stryMutAct_9fa48("79249") ? newRow || predicate(newRow) : stryMutAct_9fa48("79248") ? false : stryMutAct_9fa48("79247") ? true : (stryCov_9fa48("79247", "79248", "79249"), newRow && predicate(newRow));
                if (stryMutAct_9fa48("79252") ? !oldMatched || newMatched : stryMutAct_9fa48("79251") ? false : stryMutAct_9fa48("79250") ? true : (stryCov_9fa48("79250", "79251", "79252"), (stryMutAct_9fa48("79253") ? oldMatched : (stryCov_9fa48("79253"), !oldMatched)) && newMatched)) {
                  if (stryMutAct_9fa48("79254")) {
                    {}
                  } else {
                    stryCov_9fa48("79254");
                    return stryMutAct_9fa48("79255") ? {} : (stryCov_9fa48("79255"), {
                      type: FUNCTION_CDC_MATCH_TYPE.ENTER,
                      row: newRow
                    });
                  }
                }
                if (stryMutAct_9fa48("79258") ? oldMatched || !newMatched : stryMutAct_9fa48("79257") ? false : stryMutAct_9fa48("79256") ? true : (stryCov_9fa48("79256", "79257", "79258"), oldMatched && (stryMutAct_9fa48("79259") ? newMatched : (stryCov_9fa48("79259"), !newMatched)))) {
                  if (stryMutAct_9fa48("79260")) {
                    {}
                  } else {
                    stryCov_9fa48("79260");
                    return stryMutAct_9fa48("79261") ? {} : (stryCov_9fa48("79261"), {
                      type: FUNCTION_CDC_MATCH_TYPE.EXIT,
                      row: oldRow
                    });
                  }
                }
                if (stryMutAct_9fa48("79264") ? oldMatched || newMatched : stryMutAct_9fa48("79263") ? false : stryMutAct_9fa48("79262") ? true : (stryCov_9fa48("79262", "79263", "79264"), oldMatched && newMatched)) {
                  if (stryMutAct_9fa48("79265")) {
                    {}
                  } else {
                    stryCov_9fa48("79265");
                    return stryMutAct_9fa48("79266") ? {} : (stryCov_9fa48("79266"), {
                      type: FUNCTION_CDC_MATCH_TYPE.UPDATE,
                      old: oldRow,
                      new: newRow
                    });
                  }
                }
                break;
              }
            }
          }
        case FUNCTION_CDC_OPERATION.DELETE:
          if (stryMutAct_9fa48("79267")) {} else {
            stryCov_9fa48("79267");
            if (stryMutAct_9fa48("79270") ? oldRow || predicate(oldRow) : stryMutAct_9fa48("79269") ? false : stryMutAct_9fa48("79268") ? true : (stryCov_9fa48("79268", "79269", "79270"), oldRow && predicate(oldRow))) {
              if (stryMutAct_9fa48("79271")) {
                {}
              } else {
                stryCov_9fa48("79271");
                return stryMutAct_9fa48("79272") ? {} : (stryCov_9fa48("79272"), {
                  type: FUNCTION_CDC_MATCH_TYPE.DELETE,
                  row: oldRow
                });
              }
            }
            break;
          }
      }
      return null;
    }
  }

  /**
   * Get all subscriptions for a table.
   * @param {string} tableName - Table name.
   * @return {Array} Array of subscriptions.
   * @private
   */
  getSubscriptionsForTable(tableName) {
    if (stryMutAct_9fa48("79273")) {
      {}
    } else {
      stryCov_9fa48("79273");
      const result = stryMutAct_9fa48("79274") ? ["Stryker was here"] : (stryCov_9fa48("79274"), []);
      for (const subscription of this.subscriptions.values()) {
        if (stryMutAct_9fa48("79275")) {
          {}
        } else {
          stryCov_9fa48("79275");
          if (stryMutAct_9fa48("79278") ? subscription.tableName !== tableName : stryMutAct_9fa48("79277") ? false : stryMutAct_9fa48("79276") ? true : (stryCov_9fa48("79276", "79277", "79278"), subscription.tableName === tableName)) {
            if (stryMutAct_9fa48("79279")) {
              {}
            } else {
              stryCov_9fa48("79279");
              result.push(subscription);
            }
          }
        }
      }
      return result;
    }
  }

  /**
   * Track a subscription for a subscriber.
   * @param {string} subscriberId - Subscriber ID.
   * @param {string} subscriptionId - Subscription ID.
   * @private
   */
  trackSubscriberSubscription(subscriberId, subscriptionId) {
    if (stryMutAct_9fa48("79280")) {
      {}
    } else {
      stryCov_9fa48("79280");
      if (stryMutAct_9fa48("79283") ? false : stryMutAct_9fa48("79282") ? true : stryMutAct_9fa48("79281") ? this.subscriberSubscriptions.has(subscriberId) : (stryCov_9fa48("79281", "79282", "79283"), !this.subscriberSubscriptions.has(subscriberId))) {
        if (stryMutAct_9fa48("79284")) {
          {}
        } else {
          stryCov_9fa48("79284");
          this.subscriberSubscriptions.set(subscriberId, new Set());
        }
      }
      this.subscriberSubscriptions.get(subscriberId).add(subscriptionId);
    }
  }

  /**
   * Untrack a subscription for a subscriber.
   * @param {string} subscriberId - Subscriber ID.
   * @param {string} subscriptionId - Subscription ID.
   * @private
   */
  untrackSubscriberSubscription(subscriberId, subscriptionId) {
    if (stryMutAct_9fa48("79285")) {
      {}
    } else {
      stryCov_9fa48("79285");
      const subscriptions = this.subscriberSubscriptions.get(subscriberId);
      if (stryMutAct_9fa48("79287") ? false : stryMutAct_9fa48("79286") ? true : (stryCov_9fa48("79286", "79287"), subscriptions)) {
        if (stryMutAct_9fa48("79288")) {
          {}
        } else {
          stryCov_9fa48("79288");
          subscriptions.delete(subscriptionId);
          if (stryMutAct_9fa48("79291") ? subscriptions.size !== 0 : stryMutAct_9fa48("79290") ? false : stryMutAct_9fa48("79289") ? true : (stryCov_9fa48("79289", "79290", "79291"), subscriptions.size === 0)) {
            if (stryMutAct_9fa48("79292")) {
              {}
            } else {
              stryCov_9fa48("79292");
              this.subscriberSubscriptions.delete(subscriberId);
            }
          }
        }
      }
    }
  }

  /**
   * Get subscription by ID.
   * @param {string} subscriptionId - Subscription ID.
   * @return {Object|undefined} Subscription or undefined.
   */
  getSubscription(subscriptionId) {
    if (stryMutAct_9fa48("79293")) {
      {}
    } else {
      stryCov_9fa48("79293");
      return this.subscriptions.get(subscriptionId);
    }
  }

  /**
   * Get all subscriptions for a subscriber.
   * @param {string} subscriberId - Subscriber ID.
   * @return {Array} Array of subscriptions.
   */
  getSubscriptionsForSubscriber(subscriberId) {
    if (stryMutAct_9fa48("79294")) {
      {}
    } else {
      stryCov_9fa48("79294");
      const subscriptionIds = this.subscriberSubscriptions.get(subscriberId);
      if (stryMutAct_9fa48("79297") ? false : stryMutAct_9fa48("79296") ? true : stryMutAct_9fa48("79295") ? subscriptionIds : (stryCov_9fa48("79295", "79296", "79297"), !subscriptionIds)) {
        if (stryMutAct_9fa48("79298")) {
          {}
        } else {
          stryCov_9fa48("79298");
          return stryMutAct_9fa48("79299") ? ["Stryker was here"] : (stryCov_9fa48("79299"), []);
        }
      }
      const result = stryMutAct_9fa48("79300") ? ["Stryker was here"] : (stryCov_9fa48("79300"), []);
      for (const id of subscriptionIds) {
        if (stryMutAct_9fa48("79301")) {
          {}
        } else {
          stryCov_9fa48("79301");
          const subscription = this.subscriptions.get(id);
          if (stryMutAct_9fa48("79303") ? false : stryMutAct_9fa48("79302") ? true : (stryCov_9fa48("79302", "79303"), subscription)) {
            if (stryMutAct_9fa48("79304")) {
              {}
            } else {
              stryCov_9fa48("79304");
              result.push(subscription);
            }
          }
        }
      }
      return result;
    }
  }

  /**
   * Get statistics.
   * @return {Object} Manager statistics.
   */
  getStats() {
    if (stryMutAct_9fa48("79305")) {
      {}
    } else {
      stryCov_9fa48("79305");
      let totalEvents = 0;
      for (const subscription of this.subscriptions.values()) {
        if (stryMutAct_9fa48("79306")) {
          {}
        } else {
          stryCov_9fa48("79306");
          stryMutAct_9fa48("79307") ? totalEvents -= subscription.eventCount : (stryCov_9fa48("79307"), totalEvents += subscription.eventCount);
        }
      }
      return stryMutAct_9fa48("79308") ? {} : (stryCov_9fa48("79308"), {
        subscriptionCount: this.subscriptions.size,
        subscriberCount: this.subscriberSubscriptions.size,
        totalEventsProcessed: totalEvents
      });
    }
  }

  /**
   * Check if manager is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("79309")) {
      {}
    } else {
      stryCov_9fa48("79309");
      return this.initialized;
    }
  }

  /**
   * Shutdown the manager.
   */
  shutdown() {
    if (stryMutAct_9fa48("79310")) {
      {}
    } else {
      stryCov_9fa48("79310");
      this.subscriptions.clear();
      this.subscriberSubscriptions.clear();
      this.initialized = stryMutAct_9fa48("79311") ? true : (stryCov_9fa48("79311"), false);
      this.removeAllListeners();
      this.logger.info(FUNCTION_LOG_MSG.SUBSCRIPTION_MANAGER_SHUTDOWN);
    }
  }
}
export { CDCSubscriptionManager, SubscriptionType };