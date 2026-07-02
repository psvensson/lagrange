const LOCAL_STR_REGISTERED_MESSAGE_HANDLER = 'Registered message handler';
const LOCAL_STR_UNKNOWN_MESSAGE_TYPE_RECEIVED = 'Unknown message type received';
const LOCAL_STR_CLEARED_ALL_MESSAGE_HANDLERS = 'Cleared all message handlers';

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

const MESSAGE_HANDLER_ERROR_MSG = Object.freeze({
  unknownMessageType: (type) => `Unknown message type: ${type}`,
});

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
    this.handlers = new Map();
    this.logger = options.logger || null;
  }

  /**
   * Registers a handler function for a specific message type.
   * @param {string} messageType - The message type to register.
   * @param {Function} handler - The handler function (should return a Promise).
   */
  register(messageType, handler) {
    this.handlers.set(messageType, handler);
    if (this.logger) {
      this.logger.debug(LOCAL_STR_REGISTERED_MESSAGE_HANDLER, {messageType});
    }
  }

  /**
   * Handles an incoming message by routing it to the appropriate handler.
   * @param {Object} message - The message to handle.
   * @return {Promise<Object>} The handler result or an error response.
   */
  async handle(message) {
    const messageType = message.payload?.type;
    const handler = this.handlers.get(messageType);

    if (!handler) {
      if (this.logger) {
        this.logger.warn(LOCAL_STR_UNKNOWN_MESSAGE_TYPE_RECEIVED, {messageType});
      }
      return {
        acknowledged: false,
        error: MESSAGE_HANDLER_ERROR_MSG.unknownMessageType(messageType),
      };
    }

    return handler(message);
  }

  /**
   * Checks if a handler is registered for a specific message type.
   * @param {string} messageType - The message type to check.
   * @return {boolean} True if a handler is registered.
   */
  has(messageType) {
    return this.handlers.has(messageType);
  }

  /**
   * Gets the number of registered handlers.
   * @return {number} The count of registered handlers.
   */
  get size() {
    return this.handlers.size;
  }

  /**
   * Clears all registered handlers.
   */
  clear() {
    this.handlers.clear();
    if (this.logger) {
      this.logger.debug(LOCAL_STR_CLEARED_ALL_MESSAGE_HANDLERS);
    }
  }
}

export {MessageHandlerRegistry, MESSAGE_HANDLER_ERROR_MSG};
