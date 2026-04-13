/**
 * LiveQueryManager - Manages live query subscriptions
 *
 * Handles LIVE SELECT subscriptions that stream matching changes in real-time.
 * Supports subscribe, pause, resume, cancel, and renew operations.
 *
 * Requirements: 32.1, 32.7, 32.9, 32.10, 32.11
 */
// @ts-nocheck


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
 */function stryNS_9fa48() {
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
    if (stryMutAct_9fa48("43215")) {
      {}
    } else {
      stryCov_9fa48("43215");
      this.connectionManager = connectionManager;
      this.eventBus = eventBus;

      /** @type {Map<string, LiveQuerySubscription>} */
      this.subscriptions = new Map();

      /** @type {number} */
      this.maxSubscriptions = stryMutAct_9fa48("43218") ? options.maxSubscriptions && 100 : stryMutAct_9fa48("43217") ? false : stryMutAct_9fa48("43216") ? true : (stryCov_9fa48("43216", "43217", "43218"), options.maxSubscriptions || 100);

      /** @type {number} */
      this.maxEventsPerSubscription = stryMutAct_9fa48("43221") ? options.maxEventsPerSubscription && 1000 : stryMutAct_9fa48("43220") ? false : stryMutAct_9fa48("43219") ? true : (stryCov_9fa48("43219", "43220", "43221"), options.maxEventsPerSubscription || 1000);
    }
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
    if (stryMutAct_9fa48("43222")) {
      {}
    } else {
      stryCov_9fa48("43222");
      // Enforce maximum concurrent subscriptions limit
      // Requirements: 32.11
      if (stryMutAct_9fa48("43226") ? this.subscriptions.size < this.maxSubscriptions : stryMutAct_9fa48("43225") ? this.subscriptions.size > this.maxSubscriptions : stryMutAct_9fa48("43224") ? false : stryMutAct_9fa48("43223") ? true : (stryCov_9fa48("43223", "43224", "43225", "43226"), this.subscriptions.size >= this.maxSubscriptions)) {
        if (stryMutAct_9fa48("43227")) {
          {}
        } else {
          stryCov_9fa48("43227");
          throw new Error(stryMutAct_9fa48("43228") ? `` : (stryCov_9fa48("43228"), `Maximum ${this.maxSubscriptions} concurrent live queries reached`));
        }
      }
      const subscriptionId = this.generateSubscriptionId();

      /** @type {LiveQuerySubscription} */
      const subscription = stryMutAct_9fa48("43229") ? {} : (stryCov_9fa48("43229"), {
        id: subscriptionId,
        sql,
        status: stryMutAct_9fa48("43230") ? "" : (stryCov_9fa48("43230"), 'pending'),
        events: stryMutAct_9fa48("43231") ? ["Stryker was here"] : (stryCov_9fa48("43231"), []),
        eventRate: 0,
        partitions: stryMutAct_9fa48("43232") ? ["Stryker was here"] : (stryCov_9fa48("43232"), []),
        createdAt: Date.now(),
        lastEventAt: null,
        paused: stryMutAct_9fa48("43233") ? true : (stryCov_9fa48("43233"), false),
        initialResults: null
      });
      this.subscriptions.set(subscriptionId, subscription);

      // Send subscription request to server
      if (stryMutAct_9fa48("43235") ? false : stryMutAct_9fa48("43234") ? true : (stryCov_9fa48("43234", "43235"), this.connectionManager)) {
        if (stryMutAct_9fa48("43236")) {
          {}
        } else {
          stryCov_9fa48("43236");
          this.connectionManager.subscribeLiveQuery(subscriptionId, sql);
        }
      }
      this.emitEvent(stryMutAct_9fa48("43237") ? "" : (stryCov_9fa48("43237"), 'livequery:subscribed'), stryMutAct_9fa48("43238") ? {} : (stryCov_9fa48("43238"), {
        subscriptionId,
        sql
      }));
      return subscriptionId;
    }
  }

  /**
   * Handle incoming live query event from server
   * @param {Object} message - Server message
   */
  handleLiveQueryEvent(message) {
    if (stryMutAct_9fa48("43239")) {
      {}
    } else {
      stryCov_9fa48("43239");
      const {
        subscriptionId,
        eventType,
        data,
        partitions,
        type
      } = message;
      const subscription = this.subscriptions.get(subscriptionId);
      if (stryMutAct_9fa48("43242") ? false : stryMutAct_9fa48("43241") ? true : stryMutAct_9fa48("43240") ? subscription : (stryCov_9fa48("43240", "43241", "43242"), !subscription)) {
        if (stryMutAct_9fa48("43243")) {
          {}
        } else {
          stryCov_9fa48("43243");
          return;
        }
      }
      const nextSubscriptionStatus = (stryMutAct_9fa48("43246") ? type === 'live_query_initial' && type === 'live_query_renewed' : stryMutAct_9fa48("43245") ? false : stryMutAct_9fa48("43244") ? true : (stryCov_9fa48("43244", "43245", "43246"), (stryMutAct_9fa48("43248") ? type !== 'live_query_initial' : stryMutAct_9fa48("43247") ? false : (stryCov_9fa48("43247", "43248"), type === (stryMutAct_9fa48("43249") ? "" : (stryCov_9fa48("43249"), 'live_query_initial')))) || (stryMutAct_9fa48("43251") ? type !== 'live_query_renewed' : stryMutAct_9fa48("43250") ? false : (stryCov_9fa48("43250", "43251"), type === (stryMutAct_9fa48("43252") ? "" : (stryCov_9fa48("43252"), 'live_query_renewed')))))) ? stryMutAct_9fa48("43253") ? "" : (stryCov_9fa48("43253"), 'active') : (stryMutAct_9fa48("43256") ? type !== 'live_query_expired' : stryMutAct_9fa48("43255") ? false : stryMutAct_9fa48("43254") ? true : (stryCov_9fa48("43254", "43255", "43256"), type === (stryMutAct_9fa48("43257") ? "" : (stryCov_9fa48("43257"), 'live_query_expired')))) ? stryMutAct_9fa48("43258") ? "" : (stryCov_9fa48("43258"), 'expired') : subscription.status;
      subscription.status = nextSubscriptionStatus;
      switch (type) {
        case stryMutAct_9fa48("43260") ? "" : (stryCov_9fa48("43260"), 'live_query_initial'):
          if (stryMutAct_9fa48("43259")) {} else {
            stryCov_9fa48("43259");
            // Initial results received
            subscription.partitions = stryMutAct_9fa48("43263") ? partitions && [] : stryMutAct_9fa48("43262") ? false : stryMutAct_9fa48("43261") ? true : (stryCov_9fa48("43261", "43262", "43263"), partitions || (stryMutAct_9fa48("43264") ? ["Stryker was here"] : (stryCov_9fa48("43264"), [])));
            subscription.initialResults = data;
            this.emitEvent(stryMutAct_9fa48("43265") ? "" : (stryCov_9fa48("43265"), 'livequery:initialized'), stryMutAct_9fa48("43266") ? {} : (stryCov_9fa48("43266"), {
              subscriptionId,
              data,
              partitions
            }));
            break;
          }
        case stryMutAct_9fa48("43268") ? "" : (stryCov_9fa48("43268"), 'live_query_event'):
          if (stryMutAct_9fa48("43267")) {} else {
            stryCov_9fa48("43267");
            // CDC event received
            // Requirements: 32.7 - Don't add events when paused
            if (stryMutAct_9fa48("43271") ? false : stryMutAct_9fa48("43270") ? true : stryMutAct_9fa48("43269") ? subscription.paused : (stryCov_9fa48("43269", "43270", "43271"), !subscription.paused)) {
              if (stryMutAct_9fa48("43272")) {
                {}
              } else {
                stryCov_9fa48("43272");
                const event = stryMutAct_9fa48("43273") ? {} : (stryCov_9fa48("43273"), {
                  eventType,
                  data,
                  timestamp: Date.now()
                });
                subscription.events.push(event);
                subscription.lastEventAt = Date.now();

                // Trim events if exceeding max
                if (stryMutAct_9fa48("43277") ? subscription.events.length <= this.maxEventsPerSubscription : stryMutAct_9fa48("43276") ? subscription.events.length >= this.maxEventsPerSubscription : stryMutAct_9fa48("43275") ? false : stryMutAct_9fa48("43274") ? true : (stryCov_9fa48("43274", "43275", "43276", "43277"), subscription.events.length > this.maxEventsPerSubscription)) {
                  if (stryMutAct_9fa48("43278")) {
                    {}
                  } else {
                    stryCov_9fa48("43278");
                    subscription.events.shift();
                  }
                }

                // Update event rate
                // Requirements: 32.10
                this.updateEventRate(subscription);
                this.emitEvent(stryMutAct_9fa48("43279") ? "" : (stryCov_9fa48("43279"), 'livequery:event'), stryMutAct_9fa48("43280") ? {} : (stryCov_9fa48("43280"), {
                  subscriptionId,
                  eventType,
                  data,
                  timestamp: event.timestamp
                }));
              }
            }
            break;
          }
        case stryMutAct_9fa48("43282") ? "" : (stryCov_9fa48("43282"), 'live_query_expired'):
          if (stryMutAct_9fa48("43281")) {} else {
            stryCov_9fa48("43281");
            // Subscription expired
            this.emitEvent(stryMutAct_9fa48("43283") ? "" : (stryCov_9fa48("43283"), 'livequery:expired'), stryMutAct_9fa48("43284") ? {} : (stryCov_9fa48("43284"), {
              subscriptionId
            }));
            break;
          }
        case stryMutAct_9fa48("43286") ? "" : (stryCov_9fa48("43286"), 'live_query_renewed'):
          if (stryMutAct_9fa48("43285")) {} else {
            stryCov_9fa48("43285");
            // Subscription renewed
            this.emitEvent(stryMutAct_9fa48("43287") ? "" : (stryCov_9fa48("43287"), 'livequery:renewed'), stryMutAct_9fa48("43288") ? {} : (stryCov_9fa48("43288"), {
              subscriptionId
            }));
            break;
          }
        default:
          if (stryMutAct_9fa48("43289")) {} else {
            stryCov_9fa48("43289");
            break;
          }
      }
    }
  }

  /**
   * Update the event rate for a subscription
   * Requirements: 32.10
   * @param {LiveQuerySubscription} subscription - Subscription to update
   */
  updateEventRate(subscription) {
    if (stryMutAct_9fa48("43290")) {
      {}
    } else {
      stryCov_9fa48("43290");
      const oneSecondAgo = stryMutAct_9fa48("43291") ? Date.now() + 1000 : (stryCov_9fa48("43291"), Date.now() - 1000);
      const recentEvents = stryMutAct_9fa48("43292") ? subscription.events : (stryCov_9fa48("43292"), subscription.events.filter(stryMutAct_9fa48("43293") ? () => undefined : (stryCov_9fa48("43293"), e => stryMutAct_9fa48("43297") ? e.timestamp <= oneSecondAgo : stryMutAct_9fa48("43296") ? e.timestamp >= oneSecondAgo : stryMutAct_9fa48("43295") ? false : stryMutAct_9fa48("43294") ? true : (stryCov_9fa48("43294", "43295", "43296", "43297"), e.timestamp > oneSecondAgo))));
      subscription.eventRate = recentEvents.length;
    }
  }

  /**
   * Pause a live query subscription
   * Requirements: 32.7
   * @param {string} subscriptionId - Subscription ID
   * @return {boolean} True if paused successfully
   */
  pause(subscriptionId) {
    if (stryMutAct_9fa48("43298")) {
      {}
    } else {
      stryCov_9fa48("43298");
      const subscription = this.subscriptions.get(subscriptionId);
      if (stryMutAct_9fa48("43301") ? false : stryMutAct_9fa48("43300") ? true : stryMutAct_9fa48("43299") ? subscription : (stryCov_9fa48("43299", "43300", "43301"), !subscription)) {
        if (stryMutAct_9fa48("43302")) {
          {}
        } else {
          stryCov_9fa48("43302");
          return stryMutAct_9fa48("43303") ? true : (stryCov_9fa48("43303"), false);
        }
      }
      if (stryMutAct_9fa48("43306") ? subscription.status === 'active' : stryMutAct_9fa48("43305") ? false : stryMutAct_9fa48("43304") ? true : (stryCov_9fa48("43304", "43305", "43306"), subscription.status !== (stryMutAct_9fa48("43307") ? "" : (stryCov_9fa48("43307"), 'active')))) {
        if (stryMutAct_9fa48("43308")) {
          {}
        } else {
          stryCov_9fa48("43308");
          return stryMutAct_9fa48("43309") ? true : (stryCov_9fa48("43309"), false);
        }
      }
      subscription.paused = stryMutAct_9fa48("43310") ? false : (stryCov_9fa48("43310"), true);
      this.emitEvent(stryMutAct_9fa48("43311") ? "" : (stryCov_9fa48("43311"), 'livequery:paused'), stryMutAct_9fa48("43312") ? {} : (stryCov_9fa48("43312"), {
        subscriptionId
      }));
      return stryMutAct_9fa48("43313") ? false : (stryCov_9fa48("43313"), true);
    }
  }

  /**
   * Resume a paused live query subscription
   * Requirements: 32.7
   * @param {string} subscriptionId - Subscription ID
   * @return {boolean} True if resumed successfully
   */
  resume(subscriptionId) {
    if (stryMutAct_9fa48("43314")) {
      {}
    } else {
      stryCov_9fa48("43314");
      const subscription = this.subscriptions.get(subscriptionId);
      if (stryMutAct_9fa48("43317") ? false : stryMutAct_9fa48("43316") ? true : stryMutAct_9fa48("43315") ? subscription : (stryCov_9fa48("43315", "43316", "43317"), !subscription)) {
        if (stryMutAct_9fa48("43318")) {
          {}
        } else {
          stryCov_9fa48("43318");
          return stryMutAct_9fa48("43319") ? true : (stryCov_9fa48("43319"), false);
        }
      }
      if (stryMutAct_9fa48("43322") ? false : stryMutAct_9fa48("43321") ? true : stryMutAct_9fa48("43320") ? subscription.paused : (stryCov_9fa48("43320", "43321", "43322"), !subscription.paused)) {
        if (stryMutAct_9fa48("43323")) {
          {}
        } else {
          stryCov_9fa48("43323");
          return stryMutAct_9fa48("43324") ? true : (stryCov_9fa48("43324"), false);
        }
      }
      subscription.paused = stryMutAct_9fa48("43325") ? true : (stryCov_9fa48("43325"), false);
      this.emitEvent(stryMutAct_9fa48("43326") ? "" : (stryCov_9fa48("43326"), 'livequery:resumed'), stryMutAct_9fa48("43327") ? {} : (stryCov_9fa48("43327"), {
        subscriptionId
      }));
      return stryMutAct_9fa48("43328") ? false : (stryCov_9fa48("43328"), true);
    }
  }

  /**
   * Cancel a live query subscription
   * Requirements: 32.9
   * @param {string} subscriptionId - Subscription ID
   * @return {boolean} True if cancelled successfully
   */
  cancel(subscriptionId) {
    if (stryMutAct_9fa48("43329")) {
      {}
    } else {
      stryCov_9fa48("43329");
      const subscription = this.subscriptions.get(subscriptionId);
      if (stryMutAct_9fa48("43332") ? false : stryMutAct_9fa48("43331") ? true : stryMutAct_9fa48("43330") ? subscription : (stryCov_9fa48("43330", "43331", "43332"), !subscription)) {
        if (stryMutAct_9fa48("43333")) {
          {}
        } else {
          stryCov_9fa48("43333");
          return stryMutAct_9fa48("43334") ? true : (stryCov_9fa48("43334"), false);
        }
      }

      // Send unsubscribe to server
      if (stryMutAct_9fa48("43336") ? false : stryMutAct_9fa48("43335") ? true : (stryCov_9fa48("43335", "43336"), this.connectionManager)) {
        if (stryMutAct_9fa48("43337")) {
          {}
        } else {
          stryCov_9fa48("43337");
          this.connectionManager.unsubscribeLiveQuery(subscriptionId);
        }
      }
      subscription.status = stryMutAct_9fa48("43338") ? "" : (stryCov_9fa48("43338"), 'cancelled');
      this.subscriptions.delete(subscriptionId);
      this.emitEvent(stryMutAct_9fa48("43339") ? "" : (stryCov_9fa48("43339"), 'livequery:cancelled'), stryMutAct_9fa48("43340") ? {} : (stryCov_9fa48("43340"), {
        subscriptionId
      }));
      return stryMutAct_9fa48("43341") ? false : (stryCov_9fa48("43341"), true);
    }
  }

  /**
   * Renew an expired live query subscription
   * @param {string} subscriptionId - Subscription ID
   * @return {boolean} True if renewal initiated
   */
  renew(subscriptionId) {
    if (stryMutAct_9fa48("43342")) {
      {}
    } else {
      stryCov_9fa48("43342");
      const subscription = this.subscriptions.get(subscriptionId);
      if (stryMutAct_9fa48("43345") ? false : stryMutAct_9fa48("43344") ? true : stryMutAct_9fa48("43343") ? subscription : (stryCov_9fa48("43343", "43344", "43345"), !subscription)) {
        if (stryMutAct_9fa48("43346")) {
          {}
        } else {
          stryCov_9fa48("43346");
          return stryMutAct_9fa48("43347") ? true : (stryCov_9fa48("43347"), false);
        }
      }
      if (stryMutAct_9fa48("43350") ? subscription.status === 'expired' : stryMutAct_9fa48("43349") ? false : stryMutAct_9fa48("43348") ? true : (stryCov_9fa48("43348", "43349", "43350"), subscription.status !== (stryMutAct_9fa48("43351") ? "" : (stryCov_9fa48("43351"), 'expired')))) {
        if (stryMutAct_9fa48("43352")) {
          {}
        } else {
          stryCov_9fa48("43352");
          return stryMutAct_9fa48("43353") ? true : (stryCov_9fa48("43353"), false);
        }
      }
      subscription.status = stryMutAct_9fa48("43354") ? "" : (stryCov_9fa48("43354"), 'renewing');

      // Re-subscribe with same SQL
      if (stryMutAct_9fa48("43356") ? false : stryMutAct_9fa48("43355") ? true : (stryCov_9fa48("43355", "43356"), this.connectionManager)) {
        if (stryMutAct_9fa48("43357")) {
          {}
        } else {
          stryCov_9fa48("43357");
          this.connectionManager.subscribeLiveQuery(subscriptionId, subscription.sql);
        }
      }
      this.emitEvent(stryMutAct_9fa48("43358") ? "" : (stryCov_9fa48("43358"), 'livequery:renewing'), stryMutAct_9fa48("43359") ? {} : (stryCov_9fa48("43359"), {
        subscriptionId
      }));
      return stryMutAct_9fa48("43360") ? false : (stryCov_9fa48("43360"), true);
    }
  }

  /**
   * Get a subscription by ID
   * @param {string} subscriptionId - Subscription ID
   * @return {LiveQuerySubscription|undefined} Subscription or undefined
   */
  getSubscription(subscriptionId) {
    if (stryMutAct_9fa48("43361")) {
      {}
    } else {
      stryCov_9fa48("43361");
      return this.subscriptions.get(subscriptionId);
    }
  }

  /**
   * Get all subscriptions
   * @return {LiveQuerySubscription[]} All subscriptions
   */
  getAllSubscriptions() {
    if (stryMutAct_9fa48("43362")) {
      {}
    } else {
      stryCov_9fa48("43362");
      return Array.from(this.subscriptions.values());
    }
  }

  /**
   * Get count of active subscriptions
   * @return {number} Active subscription count
   */
  getActiveCount() {
    if (stryMutAct_9fa48("43363")) {
      {}
    } else {
      stryCov_9fa48("43363");
      return stryMutAct_9fa48("43364") ? Array.from(this.subscriptions.values()).length : (stryCov_9fa48("43364"), Array.from(this.subscriptions.values()).filter(stryMutAct_9fa48("43365") ? () => undefined : (stryCov_9fa48("43365"), s => stryMutAct_9fa48("43368") ? s.status !== 'active' : stryMutAct_9fa48("43367") ? false : stryMutAct_9fa48("43366") ? true : (stryCov_9fa48("43366", "43367", "43368"), s.status === (stryMutAct_9fa48("43369") ? "" : (stryCov_9fa48("43369"), 'active'))))).length);
    }
  }

  /**
   * Get total subscription count
   * @return {number} Total subscription count
   */
  getSubscriptionCount() {
    if (stryMutAct_9fa48("43370")) {
      {}
    } else {
      stryCov_9fa48("43370");
      return this.subscriptions.size;
    }
  }

  /**
   * Check if at maximum capacity
   * Requirements: 32.11
   * @return {boolean} True if at max subscriptions
   */
  isAtCapacity() {
    if (stryMutAct_9fa48("43371")) {
      {}
    } else {
      stryCov_9fa48("43371");
      return stryMutAct_9fa48("43375") ? this.subscriptions.size < this.maxSubscriptions : stryMutAct_9fa48("43374") ? this.subscriptions.size > this.maxSubscriptions : stryMutAct_9fa48("43373") ? false : stryMutAct_9fa48("43372") ? true : (stryCov_9fa48("43372", "43373", "43374", "43375"), this.subscriptions.size >= this.maxSubscriptions);
    }
  }

  /**
   * Get the maximum subscriptions limit
   * @return {number} Maximum subscriptions
   */
  getMaxSubscriptions() {
    if (stryMutAct_9fa48("43376")) {
      {}
    } else {
      stryCov_9fa48("43376");
      return this.maxSubscriptions;
    }
  }

  /**
   * Generate a unique subscription ID
   * @return {string} Subscription ID
   */
  generateSubscriptionId() {
    if (stryMutAct_9fa48("43377")) {
      {}
    } else {
      stryCov_9fa48("43377");
      const timestamp = Date.now();
      const random = stryMutAct_9fa48("43378") ? Math.random().toString(36) : (stryCov_9fa48("43378"), Math.random().toString(36).substring(2, 11));
      return stryMutAct_9fa48("43379") ? `` : (stryCov_9fa48("43379"), `lq_${timestamp}_${random}`);
    }
  }

  /**
   * Emit an event via the event bus
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emitEvent(event, data = {}) {
    if (stryMutAct_9fa48("43380")) {
      {}
    } else {
      stryCov_9fa48("43380");
      if (stryMutAct_9fa48("43382") ? false : stryMutAct_9fa48("43381") ? true : (stryCov_9fa48("43381", "43382"), this.eventBus)) {
        if (stryMutAct_9fa48("43383")) {
          {}
        } else {
          stryCov_9fa48("43383");
          this.eventBus.emit(event, data);
        }
      }
    }
  }

  /**
   * Cancel all subscriptions and clean up
   */
  destroy() {
    if (stryMutAct_9fa48("43384")) {
      {}
    } else {
      stryCov_9fa48("43384");
      for (const subscriptionId of this.subscriptions.keys()) {
        if (stryMutAct_9fa48("43385")) {
          {}
        } else {
          stryCov_9fa48("43385");
          this.cancel(subscriptionId);
        }
      }
      this.subscriptions.clear();
    }
  }
}