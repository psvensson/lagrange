import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';

const {
  ROUTER_ADDRESS,
  ROUTER_ERROR_MSG,
  ROUTER_LOG_MSG,
  ROUTER_VALID_ENTITY_TYPES,
  TRANSPORT_ERROR_MSG,
  TRANSPORT_NUM,
  TRANSPORT_TYPEOF,
} = MESSAGE_ROUTER_SHARED;

/**
 * Handler registry and unified-address grammar for the message router:
 * register/unregister service (and worker-alias) handlers, parse the
 * ${nodeId}/${entityType}/${entityId} address form, and validate it against the
 * allowed entity types.
 */
class MessageRouterHandlerRegistry {
  /**
   * Register a service handler.
   * The handler will be invoked when messages arrive for this address.
   * Requirements: 5.1
   * @param {string} address - Service address in unified format (nodeId/entityType/entityId).
   * @param {Function} handler - Message handler function.
   */
  register(address, handler, _options = {}) {
    if (typeof handler !== TRANSPORT_TYPEOF.FUNCTION) {
      throw new Error(TRANSPORT_ERROR_MSG.HANDLER_MUST_BE_FUNCTION);
    }
    if (!this.isValidAddress(address)) {
      throw new Error(ROUTER_ERROR_MSG.invalidAddressFormat(address));
    }
    this.handlers.set(address, handler);
    this.logger.debug(ROUTER_LOG_MSG.HANDLER_REGISTERED, {
      address,
      routerId: this.routerId,
      totalHandlers: this.handlers.size,
    });
  }
  /**
   * Register a worker delivery handler.
   * Alias for register() used by ReplicaWorkerManager.
   * @param {string} address - Worker unified address.
   * @param {Function} deliverFn - Worker delivery function.
   */
  registerWorkerHandler(address, deliverFn) {
    this.register(address, deliverFn);
  }
  /**
   * Parse a unified address into its components.
   * Address format: ${nodeId}/${entityType}/${entityId}
   * Requirements: 1.2, 9.1
   * @param {string} address - Address to parse.
   * @return {Object} Parsed address with nodeId, entityType, entityId.
   *                  Returns null values for malformed addresses.
   */
  parseAddress(address) {
    if (!address || typeof address !== TRANSPORT_TYPEOF.STRING) {
      return {
        nodeId: null,
        entityType: null,
        entityId: null,
      };
    }
    const parts = address.split(ROUTER_ADDRESS.SEPARATOR);
    if (parts.length !== TRANSPORT_NUM.THREE) {
      return {
        nodeId: null,
        entityType: null,
        entityId: null,
      };
    }
    return {
      nodeId: parts[TRANSPORT_NUM.ZERO] || null,
      entityType: parts[TRANSPORT_NUM.ONE] || null,
      entityId: parts[TRANSPORT_NUM.TWO] || null,
    };
  }
  /**
   * Validate that an address follows the unified format.
   * Format: ${nodeId}/${entityType}/${entityId}
   * Valid entityTypes: message-group, partition, lifecycle, service
   * Requirements: 1.1, 1.3
   * @param {string} address - Address to validate.
   * @return {boolean} True if address is valid.
   */
  isValidAddress(address) {
    if (!address || typeof address !== TRANSPORT_TYPEOF.STRING) {
      return false;
    }
    const parts = address.split(ROUTER_ADDRESS.SEPARATOR);
    if (parts.length !== TRANSPORT_NUM.THREE) {
      return false;
    }
    const [nodeId, entityType, entityId] = parts;
    if (!nodeId || !entityType || !entityId) {
      return false;
    }
    return ROUTER_VALID_ENTITY_TYPES.includes(entityType);
  }
  /**
   * Unregister a service handler.
   * @param {string} address - Service address.
   */
  unregister(address) {
    this.handlers.delete(address);
    this.logger.debug(ROUTER_LOG_MSG.HANDLER_UNREGISTERED, {
      address,
      routerId: this.routerId,
      totalHandlers: this.handlers.size,
    });
  }
  /**
   * Unregister a worker delivery handler.
   * Alias for unregister() used by ReplicaWorkerManager.
   * @param {string} address - Worker unified address.
   */
  unregisterWorkerHandler(address) {
    this.unregister(address);
  }
  /**
   * Check whether a worker handler is registered.
   * @param {string} address - Worker unified address.
   * @return {boolean} True if registered.
   */
  hasWorkerHandler(address) {
    return this.handlers.has(address);
  }
}

function defineMessageRouterHandlerRegistry(serviceClass) {
  Object.defineProperties(
    serviceClass.prototype,
    Object.fromEntries(
      Object.entries(
        Object.getOwnPropertyDescriptors(
          MessageRouterHandlerRegistry.prototype,
        ),
      ).filter(([name]) => name !== 'constructor'),
    ),
  );
}

export {defineMessageRouterHandlerRegistry};
