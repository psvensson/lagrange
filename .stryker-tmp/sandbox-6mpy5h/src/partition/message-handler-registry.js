/**
 * MessageHandlerRegistry - Map-based handler registry for message routing.
 *
 * This class implements the Message Handler Registry pattern for routing
 * application messages to their appropriate handlers. It replaces switch
 * statements with a Map-based lookup for better maintainability and
 * extensibility.
 *
 * @interface
 *
 * @constructor
 * @param {Object} [options] - Configuration options
 * @param {Object} [options.logger] - Logger instance for debugging (optional)
 *
 * @method register
 * @param {string} messageType - The message type to register
 * @param {Function} handler - The handler function for this message type
 *
 * @method handle
 * @param {Object} message - The message to handle
 * @return {Promise<Object>} Handler result or error response
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
const MESSAGE_HANDLER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("99500") ? {} : (stryCov_9fa48("99500"), {
  unknownMessageType: stryMutAct_9fa48("99501") ? () => undefined : (stryCov_9fa48("99501"), type => stryMutAct_9fa48("99502") ? `` : (stryCov_9fa48("99502"), `Unknown message type: ${type}`))
}));

/**
 * Registry for mapping message types to handler functions.
 * Provides a clean pattern for message routing without switch statements.
 */
class MessageHandlerRegistry {
  /**
   * Creates a new MessageHandlerRegistry instance.
   * @param {Object} [options] - Configuration options.
   * @param {Object} [options.logger] - Logger instance for debugging.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("99503")) {
      {}
    } else {
      stryCov_9fa48("99503");
      this.handlers = new Map();
      this.logger = stryMutAct_9fa48("99506") ? options.logger && null : stryMutAct_9fa48("99505") ? false : stryMutAct_9fa48("99504") ? true : (stryCov_9fa48("99504", "99505", "99506"), options.logger || null);
    }
  }

  /**
   * Registers a handler function for a specific message type.
   * @param {string} messageType - The message type to register.
   * @param {Function} handler - The handler function (should return a Promise).
   */
  register(messageType, handler) {
    if (stryMutAct_9fa48("99507")) {
      {}
    } else {
      stryCov_9fa48("99507");
      this.handlers.set(messageType, handler);
      if (stryMutAct_9fa48("99509") ? false : stryMutAct_9fa48("99508") ? true : (stryCov_9fa48("99508", "99509"), this.logger)) {
        if (stryMutAct_9fa48("99510")) {
          {}
        } else {
          stryCov_9fa48("99510");
          this.logger.debug(stryMutAct_9fa48("99511") ? "" : (stryCov_9fa48("99511"), 'Registered message handler'), stryMutAct_9fa48("99512") ? {} : (stryCov_9fa48("99512"), {
            messageType
          }));
        }
      }
    }
  }

  /**
   * Handles an incoming message by routing it to the appropriate handler.
   * @param {Object} message - The message to handle.
   * @return {Promise<Object>} The handler result or an error response.
   */
  async handle(message) {
    if (stryMutAct_9fa48("99513")) {
      {}
    } else {
      stryCov_9fa48("99513");
      const messageType = stryMutAct_9fa48("99514") ? message.payload.type : (stryCov_9fa48("99514"), message.payload?.type);
      const handler = this.handlers.get(messageType);
      if (stryMutAct_9fa48("99517") ? false : stryMutAct_9fa48("99516") ? true : stryMutAct_9fa48("99515") ? handler : (stryCov_9fa48("99515", "99516", "99517"), !handler)) {
        if (stryMutAct_9fa48("99518")) {
          {}
        } else {
          stryCov_9fa48("99518");
          if (stryMutAct_9fa48("99520") ? false : stryMutAct_9fa48("99519") ? true : (stryCov_9fa48("99519", "99520"), this.logger)) {
            if (stryMutAct_9fa48("99521")) {
              {}
            } else {
              stryCov_9fa48("99521");
              this.logger.warn(stryMutAct_9fa48("99522") ? "" : (stryCov_9fa48("99522"), 'Unknown message type received'), stryMutAct_9fa48("99523") ? {} : (stryCov_9fa48("99523"), {
                messageType
              }));
            }
          }
          return stryMutAct_9fa48("99524") ? {} : (stryCov_9fa48("99524"), {
            acknowledged: stryMutAct_9fa48("99525") ? true : (stryCov_9fa48("99525"), false),
            error: MESSAGE_HANDLER_ERROR_MSG.unknownMessageType(messageType)
          });
        }
      }
      return handler(message);
    }
  }

  /**
   * Checks if a handler is registered for a specific message type.
   * @param {string} messageType - The message type to check.
   * @return {boolean} True if a handler is registered.
   */
  has(messageType) {
    if (stryMutAct_9fa48("99526")) {
      {}
    } else {
      stryCov_9fa48("99526");
      return this.handlers.has(messageType);
    }
  }

  /**
   * Gets the number of registered handlers.
   * @return {number} The count of registered handlers.
   */
  get size() {
    if (stryMutAct_9fa48("99527")) {
      {}
    } else {
      stryCov_9fa48("99527");
      return this.handlers.size;
    }
  }

  /**
   * Clears all registered handlers.
   */
  clear() {
    if (stryMutAct_9fa48("99528")) {
      {}
    } else {
      stryCov_9fa48("99528");
      this.handlers.clear();
      if (stryMutAct_9fa48("99530") ? false : stryMutAct_9fa48("99529") ? true : (stryCov_9fa48("99529", "99530"), this.logger)) {
        if (stryMutAct_9fa48("99531")) {
          {}
        } else {
          stryCov_9fa48("99531");
          this.logger.debug(stryMutAct_9fa48("99532") ? "" : (stryCov_9fa48("99532"), 'Cleared all message handlers'));
        }
      }
    }
  }
}
export { MessageHandlerRegistry, MESSAGE_HANDLER_ERROR_MSG };