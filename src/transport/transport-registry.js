/**
 * TransportRegistry - Central registry for managing transport providers.
 *
 * Manages transport providers and selects the best transport for message delivery.
 * Does NOT cache endpoint information - always queries SystemTableCache.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7
 */

import {LoggingService} from '../logging/logging-service.js';
import {COLUMN, ENDPOINT_STATUS, TABLES} from '../constants/index.js';

/**
 * Subsystem name for logging.
 */
const REGISTRY_SUBSYSTEM = 'transport-registry';

/**
 * Log messages for TransportRegistry.
 */
const REGISTRY_LOG_MSG = Object.freeze({
  PROVIDER_REGISTERED: 'Transport provider registered',
  PROVIDER_UNREGISTERED: 'Transport provider unregistered',
  PROVIDER_NOT_FOUND: 'Transport provider not found',
  PROVIDER_ALREADY_REGISTERED: 'Transport provider already registered',
  SELECTING_ENDPOINT: 'Selecting endpoint for node',
  ENDPOINT_SELECTED: 'Endpoint selected for node',
  NO_ENDPOINTS_FOUND: 'No endpoints found for node',
  NO_AVAILABLE_PROVIDER: 'No available provider for endpoint',
  NO_AVAILABLE_ENDPOINTS: 'No available endpoints for node',
  GETTING_ENDPOINTS: 'Getting endpoints for node',
});

/**
 * Error messages for TransportRegistry.
 */
const REGISTRY_ERROR_MSG = Object.freeze({
  PROVIDER_REQUIRED: 'Provider is required',
  PROVIDER_MUST_HAVE_GET_TYPE: 'Provider must implement getType() method',
  TRANSPORT_TYPE_REQUIRED: 'Transport type is required',
  NODE_ID_REQUIRED: 'Node ID is required',
  SYSTEM_CACHE_REQUIRED: 'SystemTableCache is required',
  noEndpointsForNode: (nodeId) => `No endpoints found for node ${nodeId}`,
  noAvailableTransport: (nodeId) =>
    `No available transport for node ${nodeId}`,
});

/**
 * TransportRegistry manages transport providers and selects best transport.
 * Does NOT cache endpoint information - always queries SystemTableCache.
 */
class TransportRegistry {
  /**
   * Create a new TransportRegistry instance.
   * @param {Object} systemTableCache - SystemTableCache instance for endpoint lookups
   * @throws {Error} If systemTableCache is not provided
   */
  constructor(systemTableCache) {
    if (!systemTableCache) {
      throw new Error(REGISTRY_ERROR_MSG.SYSTEM_CACHE_REQUIRED);
    }

    this.systemTableCache = systemTableCache;
    this.providers = new Map();
    this.logger = LoggingService.getInstance().forSubsystem(REGISTRY_SUBSYSTEM);
  }

  /**
   * Register a transport provider.
   *
   * The provider will be available for message delivery once registered.
   * If a provider with the same type is already registered, it will be replaced.
   *
   * @param {Object} provider - TransportProvider instance to register
   * @throws {Error} If provider is not provided or doesn't implement getType()
   */
  registerProvider(provider) {
    if (!provider) {
      throw new Error(REGISTRY_ERROR_MSG.PROVIDER_REQUIRED);
    }

    if (typeof provider.getType !== 'function') {
      throw new Error(REGISTRY_ERROR_MSG.PROVIDER_MUST_HAVE_GET_TYPE);
    }

    const transportType = provider.getType();

    if (this.providers.has(transportType)) {
      this.logger.warn(REGISTRY_LOG_MSG.PROVIDER_ALREADY_REGISTERED, {
        transportType,
      });
    }

    this.providers.set(transportType, provider);

    this.logger.info(REGISTRY_LOG_MSG.PROVIDER_REGISTERED, {
      transportType,
    });
  }

  /**
   * Unregister a transport provider.
   *
   * The provider will no longer be used for new connections after unregistration.
   *
   * @param {string} transportType - Type of transport to unregister
   * @throws {Error} If transportType is not provided
   * @return {boolean} True if provider was unregistered, false if not found
   */
  unregisterProvider(transportType) {
    if (!transportType) {
      throw new Error(REGISTRY_ERROR_MSG.TRANSPORT_TYPE_REQUIRED);
    }

    const existed = this.providers.delete(transportType);

    if (existed) {
      this.logger.info(REGISTRY_LOG_MSG.PROVIDER_UNREGISTERED, {
        transportType,
      });
    } else {
      this.logger.debug(REGISTRY_LOG_MSG.PROVIDER_NOT_FOUND, {
        transportType,
      });
    }

    return existed;
  }

  /**
   * Get provider for a transport type.
   *
   * @param {string} transportType - Transport type to look up
   * @return {Object|null} TransportProvider or null if not registered
   */
  getProvider(transportType) {
    return this.providers.get(transportType) || null;
  }

  /**
   * Select best endpoint for a node based on priority and availability.
   *
   * Queries SystemTableCache for node_endpoints records, filters to those
   * with available providers, and returns the highest priority endpoint
   * (lowest priority number).
   *
   * @param {string} nodeId - Target node ID
   * @return {Object|null} Best endpoint object or null if none available
   * @throws {Error} If nodeId is not provided
   */
  selectEndpoint(nodeId) {
    if (!nodeId) {
      throw new Error(REGISTRY_ERROR_MSG.NODE_ID_REQUIRED);
    }

    this.logger.debug(REGISTRY_LOG_MSG.SELECTING_ENDPOINT, {nodeId});

    // Get all endpoints for the node from SystemTableCache
    const endpoints = this.getEndpointsForNode(nodeId);

    if (endpoints.length === 0) {
      this.logger.debug(REGISTRY_LOG_MSG.NO_ENDPOINTS_FOUND, {nodeId});
      return null;
    }

    // Find the first endpoint (already sorted by priority) with an available provider
    for (const endpoint of endpoints) {
      const provider = this.providers.get(endpoint[COLUMN.TRANSPORT_TYPE]);

      if (!provider) {
        this.logger.debug(REGISTRY_LOG_MSG.NO_AVAILABLE_PROVIDER, {
          nodeId,
          transportType: endpoint[COLUMN.TRANSPORT_TYPE],
          endpointId: endpoint[COLUMN.ENDPOINT_ID],
        });
        continue;
      }

      if (!provider.isAvailable()) {
        this.logger.debug(REGISTRY_LOG_MSG.NO_AVAILABLE_PROVIDER, {
          nodeId,
          transportType: endpoint[COLUMN.TRANSPORT_TYPE],
          endpointId: endpoint[COLUMN.ENDPOINT_ID],
          reason: 'provider not available',
        });
        continue;
      }

      this.logger.debug(REGISTRY_LOG_MSG.ENDPOINT_SELECTED, {
        nodeId,
        endpointId: endpoint[COLUMN.ENDPOINT_ID],
        transportType: endpoint[COLUMN.TRANSPORT_TYPE],
        priority: endpoint[COLUMN.PRIORITY],
      });

      return endpoint;
    }

    this.logger.debug(REGISTRY_LOG_MSG.NO_AVAILABLE_ENDPOINTS, {nodeId});
    return null;
  }

  /**
   * Get all available endpoints for a node.
   *
   * Queries SystemTableCache for node_endpoints records for the given node,
   * filters to active endpoints, and returns them sorted by priority
   * (lower priority number = higher preference).
   *
   * @param {string} nodeId - Target node ID
   * @return {Array<Object>} Endpoints sorted by priority (ascending)
   * @throws {Error} If nodeId is not provided
   */
  getEndpointsForNode(nodeId) {
    if (!nodeId) {
      throw new Error(REGISTRY_ERROR_MSG.NODE_ID_REQUIRED);
    }

    this.logger.debug(REGISTRY_LOG_MSG.GETTING_ENDPOINTS, {nodeId});

    // Query SystemTableCache for endpoints matching this node
    const endpoints = this.systemTableCache.filter(
      TABLES.NODE_ENDPOINTS,
      (endpoint) =>
        endpoint[COLUMN.NODE_ID] === nodeId &&
        endpoint[COLUMN.STATUS] === ENDPOINT_STATUS.ACTIVE,
    );

    // Sort by priority (lower number = higher preference)
    endpoints.sort((a, b) => {
      const priorityA = a[COLUMN.PRIORITY] ?? 0;
      const priorityB = b[COLUMN.PRIORITY] ?? 0;
      return priorityA - priorityB;
    });

    return endpoints;
  }

  /**
   * Get all registered transport types.
   *
   * @return {Array<string>} Array of registered transport type strings
   */
  getRegisteredTypes() {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a transport type is registered.
   *
   * @param {string} transportType - Transport type to check
   * @return {boolean} True if the transport type is registered
   */
  hasProvider(transportType) {
    return this.providers.has(transportType);
  }

  /**
   * Get the count of registered providers.
   *
   * @return {number} Number of registered providers
   */
  getProviderCount() {
    return this.providers.size;
  }
}

export {
  TransportRegistry,
  REGISTRY_SUBSYSTEM,
  REGISTRY_LOG_MSG,
  REGISTRY_ERROR_MSG,
};
