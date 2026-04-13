/**
 * EventBus - Central event bus for inter-component communication
 * Supports namespaced events, priorities, wildcards, and debug mode
 *
 * Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7
 */
// @ts-nocheck


/**
 * @typedef {Object} EventHandler
 * @property {Function} callback - The handler function
 * @property {number} priority - Handler priority (higher = earlier execution)
 * @property {boolean} once - Whether to auto-unregister after first call
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
export class EventBus {
  constructor(options = {}) {
    if (stryMutAct_9fa48("42294")) {
      {}
    } else {
      stryCov_9fa48("42294");
      /** @type {Map<string, EventHandler[]>} */
      this.handlers = new Map();
      this.debugMode = stryMutAct_9fa48("42297") ? options.debugMode && false : stryMutAct_9fa48("42296") ? false : stryMutAct_9fa48("42295") ? true : (stryCov_9fa48("42295", "42296", "42297"), options.debugMode || (stryMutAct_9fa48("42298") ? true : (stryCov_9fa48("42298"), false)));
      this.eventLog = stryMutAct_9fa48("42299") ? ["Stryker was here"] : (stryCov_9fa48("42299"), []);
      this.maxLogSize = stryMutAct_9fa48("42302") ? options.maxLogSize && 1000 : stryMutAct_9fa48("42301") ? false : stryMutAct_9fa48("42300") ? true : (stryCov_9fa48("42300", "42301", "42302"), options.maxLogSize || 1000);
    }
  }

  /**
   * Register an event handler
   * @param {string} event - Event name (supports wildcards like 'cache:*')
   * @param {Function} callback - Handler function
   * @param {Object} options - Handler options
   * @param {number} [options.priority=0] - Handler priority (higher = earlier)
   * @returns {Function} Unsubscribe function
   */
  on(event, callback, options = {}) {
    if (stryMutAct_9fa48("42303")) {
      {}
    } else {
      stryCov_9fa48("42303");
      const priority = stryMutAct_9fa48("42306") ? options.priority && 0 : stryMutAct_9fa48("42305") ? false : stryMutAct_9fa48("42304") ? true : (stryCov_9fa48("42304", "42305", "42306"), options.priority || 0);
      const handler = stryMutAct_9fa48("42307") ? {} : (stryCov_9fa48("42307"), {
        callback,
        priority,
        once: stryMutAct_9fa48("42308") ? true : (stryCov_9fa48("42308"), false)
      });
      if (stryMutAct_9fa48("42311") ? false : stryMutAct_9fa48("42310") ? true : stryMutAct_9fa48("42309") ? this.handlers.has(event) : (stryCov_9fa48("42309", "42310", "42311"), !this.handlers.has(event))) {
        if (stryMutAct_9fa48("42312")) {
          {}
        } else {
          stryCov_9fa48("42312");
          this.handlers.set(event, stryMutAct_9fa48("42313") ? ["Stryker was here"] : (stryCov_9fa48("42313"), []));
        }
      }
      const handlers = this.handlers.get(event);
      handlers.push(handler);
      // Sort by priority descending (higher priority first)
      stryMutAct_9fa48("42314") ? handlers : (stryCov_9fa48("42314"), handlers.sort(stryMutAct_9fa48("42315") ? () => undefined : (stryCov_9fa48("42315"), (a, b) => stryMutAct_9fa48("42316") ? b.priority + a.priority : (stryCov_9fa48("42316"), b.priority - a.priority))));
      if (stryMutAct_9fa48("42318") ? false : stryMutAct_9fa48("42317") ? true : (stryCov_9fa48("42317", "42318"), this.debugMode)) {
        if (stryMutAct_9fa48("42319")) {
          {}
        } else {
          stryCov_9fa48("42319");
          this.log(stryMutAct_9fa48("42320") ? "" : (stryCov_9fa48("42320"), 'subscribe'), stryMutAct_9fa48("42321") ? {} : (stryCov_9fa48("42321"), {
            event,
            priority
          }));
        }
      }

      // Return unsubscribe function
      return stryMutAct_9fa48("42322") ? () => undefined : (stryCov_9fa48("42322"), () => this.off(event, callback));
    }
  }

  /**
   * Register a one-time event handler
   * @param {string} event - Event name
   * @param {Function} callback - Handler function
   * @param {Object} options - Handler options
   * @returns {Function} Unsubscribe function
   */
  once(event, callback, options = {}) {
    if (stryMutAct_9fa48("42323")) {
      {}
    } else {
      stryCov_9fa48("42323");
      const priority = stryMutAct_9fa48("42326") ? options.priority && 0 : stryMutAct_9fa48("42325") ? false : stryMutAct_9fa48("42324") ? true : (stryCov_9fa48("42324", "42325", "42326"), options.priority || 0);
      const handler = stryMutAct_9fa48("42327") ? {} : (stryCov_9fa48("42327"), {
        callback,
        priority,
        once: stryMutAct_9fa48("42328") ? false : (stryCov_9fa48("42328"), true)
      });
      if (stryMutAct_9fa48("42331") ? false : stryMutAct_9fa48("42330") ? true : stryMutAct_9fa48("42329") ? this.handlers.has(event) : (stryCov_9fa48("42329", "42330", "42331"), !this.handlers.has(event))) {
        if (stryMutAct_9fa48("42332")) {
          {}
        } else {
          stryCov_9fa48("42332");
          this.handlers.set(event, stryMutAct_9fa48("42333") ? ["Stryker was here"] : (stryCov_9fa48("42333"), []));
        }
      }
      const handlers = this.handlers.get(event);
      handlers.push(handler);
      stryMutAct_9fa48("42334") ? handlers : (stryCov_9fa48("42334"), handlers.sort(stryMutAct_9fa48("42335") ? () => undefined : (stryCov_9fa48("42335"), (a, b) => stryMutAct_9fa48("42336") ? b.priority + a.priority : (stryCov_9fa48("42336"), b.priority - a.priority))));
      if (stryMutAct_9fa48("42338") ? false : stryMutAct_9fa48("42337") ? true : (stryCov_9fa48("42337", "42338"), this.debugMode)) {
        if (stryMutAct_9fa48("42339")) {
          {}
        } else {
          stryCov_9fa48("42339");
          this.log(stryMutAct_9fa48("42340") ? "" : (stryCov_9fa48("42340"), 'subscribe-once'), stryMutAct_9fa48("42341") ? {} : (stryCov_9fa48("42341"), {
            event,
            priority
          }));
        }
      }
      return stryMutAct_9fa48("42342") ? () => undefined : (stryCov_9fa48("42342"), () => this.off(event, callback));
    }
  }

  /**
   * Unregister an event handler
   * @param {string} event - Event name
   * @param {Function} callback - Handler function to remove
   */
  off(event, callback) {
    if (stryMutAct_9fa48("42343")) {
      {}
    } else {
      stryCov_9fa48("42343");
      const handlers = this.handlers.get(event);
      if (stryMutAct_9fa48("42346") ? false : stryMutAct_9fa48("42345") ? true : stryMutAct_9fa48("42344") ? handlers : (stryCov_9fa48("42344", "42345", "42346"), !handlers)) return;
      const index = handlers.findIndex(stryMutAct_9fa48("42347") ? () => undefined : (stryCov_9fa48("42347"), h => stryMutAct_9fa48("42350") ? h.callback !== callback : stryMutAct_9fa48("42349") ? false : stryMutAct_9fa48("42348") ? true : (stryCov_9fa48("42348", "42349", "42350"), h.callback === callback)));
      if (stryMutAct_9fa48("42353") ? index === -1 : stryMutAct_9fa48("42352") ? false : stryMutAct_9fa48("42351") ? true : (stryCov_9fa48("42351", "42352", "42353"), index !== (stryMutAct_9fa48("42354") ? +1 : (stryCov_9fa48("42354"), -1)))) {
        if (stryMutAct_9fa48("42355")) {
          {}
        } else {
          stryCov_9fa48("42355");
          handlers.splice(index, 1);
          if (stryMutAct_9fa48("42357") ? false : stryMutAct_9fa48("42356") ? true : (stryCov_9fa48("42356", "42357"), this.debugMode)) {
            if (stryMutAct_9fa48("42358")) {
              {}
            } else {
              stryCov_9fa48("42358");
              this.log(stryMutAct_9fa48("42359") ? "" : (stryCov_9fa48("42359"), 'unsubscribe'), stryMutAct_9fa48("42360") ? {} : (stryCov_9fa48("42360"), {
                event
              }));
            }
          }
        }
      }

      // Clean up empty handler arrays
      if (stryMutAct_9fa48("42363") ? handlers.length !== 0 : stryMutAct_9fa48("42362") ? false : stryMutAct_9fa48("42361") ? true : (stryCov_9fa48("42361", "42362", "42363"), handlers.length === 0)) {
        if (stryMutAct_9fa48("42364")) {
          {}
        } else {
          stryCov_9fa48("42364");
          this.handlers.delete(event);
        }
      }
    }
  }

  /**
   * Emit an event to all registered handlers
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (stryMutAct_9fa48("42365")) {
      {}
    } else {
      stryCov_9fa48("42365");
      if (stryMutAct_9fa48("42367") ? false : stryMutAct_9fa48("42366") ? true : (stryCov_9fa48("42366", "42367"), this.debugMode)) {
        if (stryMutAct_9fa48("42368")) {
          {}
        } else {
          stryCov_9fa48("42368");
          this.log(stryMutAct_9fa48("42369") ? "" : (stryCov_9fa48("42369"), 'emit'), stryMutAct_9fa48("42370") ? {} : (stryCov_9fa48("42370"), {
            event,
            data
          }));
        }
      }
      const handlersToCall = this.getMatchingHandlers(event);
      const handlersToRemove = stryMutAct_9fa48("42371") ? ["Stryker was here"] : (stryCov_9fa48("42371"), []);
      for (const {
        event: handlerEvent,
        handler
      } of handlersToCall) {
        if (stryMutAct_9fa48("42372")) {
          {}
        } else {
          stryCov_9fa48("42372");
          try {
            if (stryMutAct_9fa48("42373")) {
              {}
            } else {
              stryCov_9fa48("42373");
              handler.callback(data, event);
            }
          } catch (err) {
            if (stryMutAct_9fa48("42374")) {
              {}
            } else {
              stryCov_9fa48("42374");
              if (stryMutAct_9fa48("42376") ? false : stryMutAct_9fa48("42375") ? true : (stryCov_9fa48("42375", "42376"), this.debugMode)) {
                if (stryMutAct_9fa48("42377")) {
                  {}
                } else {
                  stryCov_9fa48("42377");
                  this.log(stryMutAct_9fa48("42378") ? "" : (stryCov_9fa48("42378"), 'error'), stryMutAct_9fa48("42379") ? {} : (stryCov_9fa48("42379"), {
                    event,
                    error: err.message
                  }));
                }
              }
            }
          }
          if (stryMutAct_9fa48("42381") ? false : stryMutAct_9fa48("42380") ? true : (stryCov_9fa48("42380", "42381"), handler.once)) {
            if (stryMutAct_9fa48("42382")) {
              {}
            } else {
              stryCov_9fa48("42382");
              handlersToRemove.push(stryMutAct_9fa48("42383") ? {} : (stryCov_9fa48("42383"), {
                event: handlerEvent,
                handler
              }));
            }
          }
        }
      }

      // Remove one-time handlers after execution
      for (const {
        event: handlerEvent,
        handler
      } of handlersToRemove) {
        if (stryMutAct_9fa48("42384")) {
          {}
        } else {
          stryCov_9fa48("42384");
          this.off(handlerEvent, handler.callback);
        }
      }
    }
  }

  /**
   * Get all handlers matching an event (including wildcards)
   * @param {string} event - Event name
   * @returns {Array<{event: string, handler: EventHandler}>}
   */
  getMatchingHandlers(event) {
    if (stryMutAct_9fa48("42385")) {
      {}
    } else {
      stryCov_9fa48("42385");
      const result = stryMutAct_9fa48("42386") ? ["Stryker was here"] : (stryCov_9fa48("42386"), []);
      for (const [pattern, handlers] of this.handlers) {
        if (stryMutAct_9fa48("42387")) {
          {}
        } else {
          stryCov_9fa48("42387");
          if (stryMutAct_9fa48("42389") ? false : stryMutAct_9fa48("42388") ? true : (stryCov_9fa48("42388", "42389"), this.matchesPattern(event, pattern))) {
            if (stryMutAct_9fa48("42390")) {
              {}
            } else {
              stryCov_9fa48("42390");
              for (const handler of handlers) {
                if (stryMutAct_9fa48("42391")) {
                  {}
                } else {
                  stryCov_9fa48("42391");
                  result.push(stryMutAct_9fa48("42392") ? {} : (stryCov_9fa48("42392"), {
                    event: pattern,
                    handler
                  }));
                }
              }
            }
          }
        }
      }

      // Sort all matching handlers by priority
      stryMutAct_9fa48("42393") ? result : (stryCov_9fa48("42393"), result.sort(stryMutAct_9fa48("42394") ? () => undefined : (stryCov_9fa48("42394"), (a, b) => stryMutAct_9fa48("42395") ? b.handler.priority + a.handler.priority : (stryCov_9fa48("42395"), b.handler.priority - a.handler.priority))));
      return result;
    }
  }

  /**
   * Check if an event matches a pattern (supports wildcards)
   * @param {string} event - Event name
   * @param {string} pattern - Pattern to match (e.g., 'cache:*')
   * @returns {boolean}
   */
  matchesPattern(event, pattern) {
    if (stryMutAct_9fa48("42396")) {
      {}
    } else {
      stryCov_9fa48("42396");
      if (stryMutAct_9fa48("42399") ? pattern !== event : stryMutAct_9fa48("42398") ? false : stryMutAct_9fa48("42397") ? true : (stryCov_9fa48("42397", "42398", "42399"), pattern === event)) return stryMutAct_9fa48("42400") ? false : (stryCov_9fa48("42400"), true);

      // Handle wildcard patterns
      if (stryMutAct_9fa48("42403") ? pattern.startsWith(':*') : stryMutAct_9fa48("42402") ? false : stryMutAct_9fa48("42401") ? true : (stryCov_9fa48("42401", "42402", "42403"), pattern.endsWith(stryMutAct_9fa48("42404") ? "" : (stryCov_9fa48("42404"), ':*')))) {
        if (stryMutAct_9fa48("42405")) {
          {}
        } else {
          stryCov_9fa48("42405");
          const prefix = stryMutAct_9fa48("42406") ? pattern : (stryCov_9fa48("42406"), pattern.slice(0, stryMutAct_9fa48("42407") ? +1 : (stryCov_9fa48("42407"), -1))); // Remove '*'
          return stryMutAct_9fa48("42408") ? event.endsWith(prefix) : (stryCov_9fa48("42408"), event.startsWith(prefix));
        }
      }
      if (stryMutAct_9fa48("42411") ? pattern !== '*' : stryMutAct_9fa48("42410") ? false : stryMutAct_9fa48("42409") ? true : (stryCov_9fa48("42409", "42410", "42411"), pattern === (stryMutAct_9fa48("42412") ? "" : (stryCov_9fa48("42412"), '*')))) {
        if (stryMutAct_9fa48("42413")) {
          {}
        } else {
          stryCov_9fa48("42413");
          return stryMutAct_9fa48("42414") ? false : (stryCov_9fa48("42414"), true);
        }
      }
      return stryMutAct_9fa48("42415") ? true : (stryCov_9fa48("42415"), false);
    }
  }

  /**
   * Log an event for debugging
   * @param {string} type - Log type
   * @param {Object} details - Log details
   */
  log(type, details) {
    if (stryMutAct_9fa48("42416")) {
      {}
    } else {
      stryCov_9fa48("42416");
      const entry = stryMutAct_9fa48("42417") ? {} : (stryCov_9fa48("42417"), {
        timestamp: Date.now(),
        type,
        ...details
      });
      this.eventLog.push(entry);

      // Trim log if too large
      if (stryMutAct_9fa48("42421") ? this.eventLog.length <= this.maxLogSize : stryMutAct_9fa48("42420") ? this.eventLog.length >= this.maxLogSize : stryMutAct_9fa48("42419") ? false : stryMutAct_9fa48("42418") ? true : (stryCov_9fa48("42418", "42419", "42420", "42421"), this.eventLog.length > this.maxLogSize)) {
        if (stryMutAct_9fa48("42422")) {
          {}
        } else {
          stryCov_9fa48("42422");
          this.eventLog = stryMutAct_9fa48("42423") ? this.eventLog : (stryCov_9fa48("42423"), this.eventLog.slice(stryMutAct_9fa48("42424") ? +this.maxLogSize : (stryCov_9fa48("42424"), -this.maxLogSize)));
        }
      }
    }
  }

  /**
   * Get event log (for debugging)
   * @returns {Array} Event log entries
   */
  getEventLog() {
    if (stryMutAct_9fa48("42425")) {
      {}
    } else {
      stryCov_9fa48("42425");
      return stryMutAct_9fa48("42426") ? [] : (stryCov_9fa48("42426"), [...this.eventLog]);
    }
  }

  /**
   * Clear all handlers
   */
  clear() {
    if (stryMutAct_9fa48("42427")) {
      {}
    } else {
      stryCov_9fa48("42427");
      this.handlers.clear();
      if (stryMutAct_9fa48("42429") ? false : stryMutAct_9fa48("42428") ? true : (stryCov_9fa48("42428", "42429"), this.debugMode)) {
        if (stryMutAct_9fa48("42430")) {
          {}
        } else {
          stryCov_9fa48("42430");
          this.log(stryMutAct_9fa48("42431") ? "" : (stryCov_9fa48("42431"), 'clear'), {});
        }
      }
    }
  }

  /**
   * Enable or disable debug mode
   * @param {boolean} enabled - Whether debug mode is enabled
   */
  setDebugMode(enabled) {
    if (stryMutAct_9fa48("42432")) {
      {}
    } else {
      stryCov_9fa48("42432");
      this.debugMode = enabled;
    }
  }

  /**
   * Get count of handlers for an event
   * @param {string} event - Event name
   * @returns {number} Handler count
   */
  listenerCount(event) {
    if (stryMutAct_9fa48("42433")) {
      {}
    } else {
      stryCov_9fa48("42433");
      const handlers = this.handlers.get(event);
      return handlers ? handlers.length : 0;
    }
  }

  /**
   * Get all registered event names
   * @returns {string[]} Event names
   */
  eventNames() {
    if (stryMutAct_9fa48("42434")) {
      {}
    } else {
      stryCov_9fa48("42434");
      return Array.from(this.handlers.keys());
    }
  }
}