const LOCAL_NUM_1000 = 1000;
const LOCAL_STR_SUBSCRIBE = 'subscribe';
const LOCAL_STR_SUBSCRIBE_ONCE = 'subscribe-once';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_UNSUBSCRIBE = 'unsubscribe';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_EMIT = 'emit';
const LOCAL_STR_ERROR = 'error';
const LOCAL_STR_11QPC = ':*';
const LOCAL_STR_ASTERISK = '*';
const LOCAL_STR_CLEAR = 'clear';

/**
 * EventBus - Central event bus for inter-component communication
 * Supports namespaced events, priorities, wildcards, and debug mode
 *
 * Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7
 */

/**
 * @typedef {Object} EventHandler
 * @property {Function} callback - The handler function
 * @property {number} priority - Handler priority (higher = earlier execution)
 * @property {boolean} once - Whether to auto-unregister after first call
 */

export class EventBus {
  constructor(options = {}) {
    /** @type {Map<string, EventHandler[]>} */
    this.handlers = new Map();
    this.debugMode = options.debugMode || false;
    this.eventLog = [];
    this.maxLogSize = options.maxLogSize || LOCAL_NUM_1000;
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
    const priority = options.priority || 0;
    const handler = {callback, priority, once: false};

    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }

    const handlers = this.handlers.get(event);
    handlers.push(handler);
    // Sort by priority descending (higher priority first)
    handlers.sort((a, b) => b.priority - a.priority);

    if (this.debugMode) {
      this.log(LOCAL_STR_SUBSCRIBE, {event, priority});
    }

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Register a one-time event handler
   * @param {string} event - Event name
   * @param {Function} callback - Handler function
   * @param {Object} options - Handler options
   * @returns {Function} Unsubscribe function
   */
  once(event, callback, options = {}) {
    const priority = options.priority || 0;
    const handler = {callback, priority, once: true};

    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }

    const handlers = this.handlers.get(event);
    handlers.push(handler);
    handlers.sort((a, b) => b.priority - a.priority);

    if (this.debugMode) {
      this.log(LOCAL_STR_SUBSCRIBE_ONCE, {event, priority});
    }

    return () => this.off(event, callback);
  }

  /**
   * Unregister an event handler
   * @param {string} event - Event name
   * @param {Function} callback - Handler function to remove
   */
  off(event, callback) {
    const handlers = this.handlers.get(event);
    if (!handlers) return;

    const index = handlers.findIndex((h) => h.callback === callback);
    if (index !== -LOCAL_NUM_ONE) {
      handlers.splice(index, LOCAL_NUM_ONE);
      if (this.debugMode) {
        this.log(LOCAL_STR_UNSUBSCRIBE, {event});
      }
    }

    // Clean up empty handler arrays
    if (handlers.length === LOCAL_NUM_ZERO) {
      this.handlers.delete(event);
    }
  }

  /**
   * Emit an event to all registered handlers
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (this.debugMode) {
      this.log(LOCAL_STR_EMIT, {event, data});
    }

    const handlersToCall = this.getMatchingHandlers(event);
    const handlersToRemove = [];

    for (const {event: handlerEvent, handler} of handlersToCall) {
      try {
        handler.callback(data, event);
      } catch (err) {
        if (this.debugMode) {
          this.log(LOCAL_STR_ERROR, {event, error: err.message});
        }
      }

      if (handler.once) {
        handlersToRemove.push({event: handlerEvent, handler});
      }
    }

    // Remove one-time handlers after execution
    for (const {event: handlerEvent, handler} of handlersToRemove) {
      this.off(handlerEvent, handler.callback);
    }
  }

  /**
   * Get all handlers matching an event (including wildcards)
   * @param {string} event - Event name
   * @returns {Array<{event: string, handler: EventHandler}>}
   */
  getMatchingHandlers(event) {
    const result = [];

    for (const [pattern, handlers] of this.handlers) {
      if (this.matchesPattern(event, pattern)) {
        for (const handler of handlers) {
          result.push({event: pattern, handler});
        }
      }
    }

    // Sort all matching handlers by priority
    result.sort((a, b) => b.handler.priority - a.handler.priority);
    return result;
  }

  /**
   * Check if an event matches a pattern (supports wildcards)
   * @param {string} event - Event name
   * @param {string} pattern - Pattern to match (e.g., 'cache:*')
   * @returns {boolean}
   */
  matchesPattern(event, pattern) {
    if (pattern === event) return true;

    // Handle wildcard patterns
    if (pattern.endsWith(LOCAL_STR_11QPC)) {
      const prefix = pattern.slice(0, -1); // Remove '*'
      return event.startsWith(prefix);
    }

    if (pattern === LOCAL_STR_ASTERISK) {
      return true;
    }

    return false;
  }

  /**
   * Log an event for debugging
   * @param {string} type - Log type
   * @param {Object} details - Log details
   */
  log(type, details) {
    const entry = {
      timestamp: Date.now(),
      type,
      ...details,
    };

    this.eventLog.push(entry);

    // Trim log if too large
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize);
    }
  }

  /**
   * Get event log (for debugging)
   * @returns {Array} Event log entries
   */
  getEventLog() {
    return [...this.eventLog];
  }

  /**
   * Clear all handlers
   */
  clear() {
    this.handlers.clear();
    if (this.debugMode) {
      this.log(LOCAL_STR_CLEAR, {});
    }
  }

  /**
   * Enable or disable debug mode
   * @param {boolean} enabled - Whether debug mode is enabled
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
  }

  /**
   * Get count of handlers for an event
   * @param {string} event - Event name
   * @returns {number} Handler count
   */
  listenerCount(event) {
    const handlers = this.handlers.get(event);
    return handlers ? handlers.length : LOCAL_NUM_ZERO;
  }

  /**
   * Get all registered event names
   * @returns {string[]} Event names
   */
  eventNames() {
    return Array.from(this.handlers.keys());
  }
}
