/**
 * Address Manager - Unique address generation and management.
 * Provides unique addresses for nodes and services using UUID v4.
 * Also provides unified address parsing, formatting, and validation.
 * Unified address format: {nodeId}/{serviceType}/{serviceId}
 * Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 2.1, 7.1
 */

import {v4 as uuidv4, validate as uuidValidate} from 'uuid';
import {ADDRESS} from '../constants/index.js';
import {LoggingService} from '../logging/logging-service.js';
import {
  ADDRESS_COMPONENT,
  ADDRESS_ERROR_MSG,
  ADDRESS_ERROR_NAME,
  ADDRESS_FORMAT,
  ADDRESS_LOG_MSG,
  ADDRESS_SUBSYSTEM,
  ADDRESS_TYPE,
  ADDRESS_VALIDATE,
} from './constants.js';

/**
 * Address types supported by the system.
 * @enum {string}
 */
const AddressType = ADDRESS_TYPE;

/**
 * Error thrown when an address is malformed.
 */
class MalformedAddressError extends Error {
  /**
   * Create a MalformedAddressError.
   * @param {string} message - Error message.
   * @param {string} address - The malformed address.
   */
  constructor(message, address) {
    super(message);
    this.name = ADDRESS_ERROR_NAME.MALFORMED;
    this.address = address;
  }
}

/**
 * Error thrown when an address component is empty.
 */
class EmptyComponentError extends Error {
  /**
   * Create an EmptyComponentError.
   * @param {string} component - The name of the empty component.
   * @param {string} address - The address with the empty component.
   */
  constructor(component, address) {
    super(ADDRESS_ERROR_MSG.COMPONENT_EMPTY(component));
    this.name = ADDRESS_ERROR_NAME.EMPTY_COMPONENT;
    this.component = component;
    this.address = address;
  }
}

/**
 * AddressManager provides unique address generation and validation.
 * Ensures no address collisions occur within the system.
 */
class AddressManager {
  static instance = null;

  /**
   * Create a new AddressManager instance.
   * @private
   */
  constructor() {
    // Track all generated addresses to detect conflicts
    this.nodeAddresses = new Set();
    this.serviceAddresses = new Set();

    // Set up subsystem logger
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(ADDRESS_SUBSYSTEM.NAME) : null;
  }

  /**
   * Get the singleton instance.
   * @return {AddressManager} The address manager instance.
   */
  static getInstance() {
    if (!AddressManager.instance) {
      AddressManager.instance = new AddressManager();
    }
    return AddressManager.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance() {
    AddressManager.instance = null;
  }

  /**
   * Generate a unique node address.
   * @return {string} A unique UUID v4 node address.
   */
  generateNodeAddress() {
    const address = uuidv4();
    this.nodeAddresses.add(address);

    if (this.logger) {
      this.logger.debug(ADDRESS_LOG_MSG.GENERATED_NODE, {address});
    }

    return address;
  }

  /**
   * Generate a unique service address.
   * @param {string} nodeAddress - The node address this service belongs to.
   * @return {string} A unique UUID v4 service address.
   */
  generateServiceAddress(nodeAddress) {
    const address = uuidv4();
    this.serviceAddresses.add(address);

    if (this.logger) {
      this.logger.debug(ADDRESS_LOG_MSG.GENERATED_SERVICE, {
        address,
        nodeAddress,
      });
    }

    return address;
  }

  /**
   * Validate an address format.
   * @param {string} address - The address to validate.
   * @return {boolean} True if the address is a valid UUID v4.
   */
  validateAddress(address) {
    if (typeof address !== ADDRESS_VALIDATE.TYPEOF_STRING) {
      return false;
    }
    return uuidValidate(address);
  }

  /**
   * Check if a node address already exists (conflict detection).
   * @param {string} address - The address to check.
   * @return {boolean} True if the address already exists.
   */
  hasNodeAddressConflict(address) {
    return this.nodeAddresses.has(address);
  }

  /**
   * Check if a service address already exists (conflict detection).
   * @param {string} address - The address to check.
   * @return {boolean} True if the address already exists.
   */
  hasServiceAddressConflict(address) {
    return this.serviceAddresses.has(address);
  }

  /**
   * Check if any address (node or service) already exists.
   * @param {string} address - The address to check.
   * @return {boolean} True if the address already exists.
   */
  hasAddressConflict(address) {
    return this.nodeAddresses.has(address) || this.serviceAddresses.has(address);
  }

  /**
   * Register an external node address (e.g., from another node joining).
   * @param {string} address - The node address to register.
   * @return {boolean} True if registered successfully, false if conflict.
   */
  registerNodeAddress(address) {
    if (!this.validateAddress(address)) {
      if (this.logger) {
        this.logger.warn(ADDRESS_LOG_MSG.INVALID_NODE_FORMAT, {address});
      }
      return false;
    }

    if (this.hasAddressConflict(address)) {
      if (this.logger) {
        this.logger.warn(ADDRESS_LOG_MSG.NODE_CONFLICT, {address});
      }
      return false;
    }

    this.nodeAddresses.add(address);

    if (this.logger) {
      this.logger.debug(ADDRESS_LOG_MSG.REGISTERED_NODE, {address});
    }

    return true;
  }

  /**
   * Register an external service address.
   * @param {string} address - The service address to register.
   * @return {boolean} True if registered successfully, false if conflict.
   */
  registerServiceAddress(address) {
    if (!this.validateAddress(address)) {
      if (this.logger) {
        this.logger.warn(ADDRESS_LOG_MSG.INVALID_SERVICE_FORMAT, {address});
      }
      return false;
    }

    if (this.hasAddressConflict(address)) {
      if (this.logger) {
        this.logger.warn(ADDRESS_LOG_MSG.SERVICE_CONFLICT, {address});
      }
      return false;
    }

    this.serviceAddresses.add(address);

    if (this.logger) {
      this.logger.debug(ADDRESS_LOG_MSG.REGISTERED_SERVICE, {address});
    }

    return true;
  }

  /**
   * Unregister a node address (e.g., when a node leaves).
   * @param {string} address - The node address to unregister.
   * @return {boolean} True if unregistered successfully.
   */
  unregisterNodeAddress(address) {
    const removed = this.nodeAddresses.delete(address);

    if (removed && this.logger) {
      this.logger.debug(ADDRESS_LOG_MSG.UNREGISTERED_NODE, {address});
    }

    return removed;
  }

  /**
   * Unregister a service address (e.g., when a service stops).
   * @param {string} address - The service address to unregister.
   * @return {boolean} True if unregistered successfully.
   */
  unregisterServiceAddress(address) {
    const removed = this.serviceAddresses.delete(address);

    if (removed && this.logger) {
      this.logger.debug(ADDRESS_LOG_MSG.UNREGISTERED_SERVICE, {address});
    }

    return removed;
  }

  /**
   * Get the count of registered node addresses.
   * @return {number} The number of registered node addresses.
   */
  getNodeAddressCount() {
    return this.nodeAddresses.size;
  }

  /**
   * Get the count of registered service addresses.
   * @return {number} The number of registered service addresses.
   */
  getServiceAddressCount() {
    return this.serviceAddresses.size;
  }

  /**
   * Get all registered node addresses.
   * @return {string[]} Array of registered node addresses.
   */
  getAllNodeAddresses() {
    return Array.from(this.nodeAddresses);
  }

  /**
   * Get all registered service addresses.
   * @return {string[]} Array of registered service addresses.
   */
  getAllServiceAddresses() {
    return Array.from(this.serviceAddresses);
  }

  /**
   * Clear all registered addresses (for testing).
   */
  clear() {
    this.nodeAddresses.clear();
    this.serviceAddresses.clear();

    if (this.logger) {
      this.logger.debug(ADDRESS_LOG_MSG.CLEARED);
    }
  }

  // ============================================================
  // Unified Address Methods (format: {nodeId}/{serviceType}/{serviceId})
  // ============================================================

  /**
   * Parse a unified address string into components.
   * @param {string} address - Address in format nodeId/serviceType/serviceId.
   * @return {{nodeId: string, serviceType: string, serviceId: string}}
   *   Parsed address components.
   * @throws {MalformedAddressError} If address doesn't have exactly 3 components.
   * @throws {EmptyComponentError} If any component is empty.
   */
  parse(address) {
    if (typeof address !== ADDRESS_VALIDATE.TYPEOF_STRING) {
      throw new MalformedAddressError(
        ADDRESS_ERROR_MSG.MUST_BE_STRING,
        String(address),
      );
    }

    const parts = address.split(ADDRESS.SEPARATOR);

    if (parts.length !== ADDRESS_VALIDATE.COMPONENT_COUNT) {
      throw new MalformedAddressError(
        ADDRESS_ERROR_MSG.MUST_HAVE_COMPONENTS(parts.length),
        address,
      );
    }

    const [nodeId, serviceType, serviceId] = parts;

    if (!nodeId) {
      throw new EmptyComponentError(ADDRESS_COMPONENT.NODE_ID, address);
    }
    if (!serviceType) {
      throw new EmptyComponentError(ADDRESS_COMPONENT.SERVICE_TYPE, address);
    }
    if (!serviceId) {
      throw new EmptyComponentError(ADDRESS_COMPONENT.SERVICE_ID, address);
    }

    return {nodeId, serviceType, serviceId};
  }

  /**
   * Format components into a unified address string.
   * @param {string} nodeId - The node identifier.
   * @param {string} serviceType - The service type (e.g., 'partition', 'raft').
   * @param {string} serviceId - The service identifier.
   * @return {string} The canonical address string.
   * @throws {EmptyComponentError} If any component is empty.
   */
  format(nodeId, serviceType, serviceId) {
    if (!nodeId) {
      throw new EmptyComponentError(ADDRESS_COMPONENT.NODE_ID, ADDRESS_FORMAT.EMPTY);
    }
    if (!serviceType) {
      throw new EmptyComponentError(ADDRESS_COMPONENT.SERVICE_TYPE, ADDRESS_FORMAT.EMPTY);
    }
    if (!serviceId) {
      throw new EmptyComponentError(ADDRESS_COMPONENT.SERVICE_ID, ADDRESS_FORMAT.EMPTY);
    }

    return ADDRESS_FORMAT.build(nodeId, serviceType, serviceId);
  }

  /**
   * Validate an address without throwing.
   * @param {string} address - The address to validate.
   * @return {{valid: boolean, error?: string}} Validation result.
   */
  validate(address) {
    if (typeof address !== ADDRESS_VALIDATE.TYPEOF_STRING) {
      return {valid: false, error: ADDRESS_ERROR_MSG.MUST_BE_STRING};
    }

    const parts = address.split(ADDRESS.SEPARATOR);

    if (parts.length !== ADDRESS_VALIDATE.COMPONENT_COUNT) {
      return {
        valid: false,
        error: ADDRESS_ERROR_MSG.MUST_HAVE_COMPONENTS(parts.length),
      };
    }

    const [nodeId, serviceType, serviceId] = parts;

    if (!nodeId) {
      return {
        valid: false,
        error: ADDRESS_ERROR_MSG.COMPONENT_CANNOT_BE_EMPTY(
          ADDRESS_COMPONENT.NODE_ID,
        ),
      };
    }
    if (!serviceType) {
      return {
        valid: false,
        error: ADDRESS_ERROR_MSG.COMPONENT_CANNOT_BE_EMPTY(
          ADDRESS_COMPONENT.SERVICE_TYPE,
        ),
      };
    }
    if (!serviceId) {
      return {
        valid: false,
        error: ADDRESS_ERROR_MSG.COMPONENT_CANNOT_BE_EMPTY(
          ADDRESS_COMPONENT.SERVICE_ID,
        ),
      };
    }

    return {valid: true};
  }

  /**
   * Extract nodeId from a unified address.
   * @param {string} address - The unified address.
   * @return {string} The nodeId component.
   * @throws {MalformedAddressError} If address is malformed.
   * @throws {EmptyComponentError} If any component is empty.
   */
  getNodeId(address) {
    return this.parse(address).nodeId;
  }

  /**
   * Extract serviceType from a unified address.
   * @param {string} address - The unified address.
   * @return {string} The serviceType component.
   * @throws {MalformedAddressError} If address is malformed.
   * @throws {EmptyComponentError} If any component is empty.
   */
  getServiceType(address) {
    return this.parse(address).serviceType;
  }

  /**
   * Extract serviceId from a unified address.
   * @param {string} address - The unified address.
   * @return {string} The serviceId component.
   * @throws {MalformedAddressError} If address is malformed.
   * @throws {EmptyComponentError} If any component is empty.
   */
  getServiceId(address) {
    return this.parse(address).serviceId;
  }
}

export {AddressManager, AddressType, MalformedAddressError, EmptyComponentError};
