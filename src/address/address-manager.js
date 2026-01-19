/**
 * Address Manager - Unique address generation and management.
 * Provides unique addresses for nodes and services using UUID v4.
 * Requirements: 1.5, 2.1, 7.1
 */

import {v4 as uuidv4, validate as uuidValidate} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';

/**
 * Address types supported by the system.
 * @enum {string}
 */
const AddressType = {
  NODE: 'node',
  SERVICE: 'service',
};

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
      loggingService.forSubsystem('address') : null;
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
      this.logger.debug('Generated node address', {address});
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
      this.logger.debug('Generated service address', {
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
    if (typeof address !== 'string') {
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
        this.logger.warn('Invalid node address format', {address});
      }
      return false;
    }

    if (this.hasAddressConflict(address)) {
      if (this.logger) {
        this.logger.warn('Node address conflict detected', {address});
      }
      return false;
    }

    this.nodeAddresses.add(address);

    if (this.logger) {
      this.logger.debug('Registered node address', {address});
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
        this.logger.warn('Invalid service address format', {address});
      }
      return false;
    }

    if (this.hasAddressConflict(address)) {
      if (this.logger) {
        this.logger.warn('Service address conflict detected', {address});
      }
      return false;
    }

    this.serviceAddresses.add(address);

    if (this.logger) {
      this.logger.debug('Registered service address', {address});
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
      this.logger.debug('Unregistered node address', {address});
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
      this.logger.debug('Unregistered service address', {address});
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
      this.logger.debug('Cleared all addresses');
    }
  }
}

export {AddressManager, AddressType};
