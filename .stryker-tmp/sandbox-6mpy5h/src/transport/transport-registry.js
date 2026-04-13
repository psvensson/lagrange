/**
 * TransportRegistry - Central registry for managing transport providers.
 *
 * Manages transport providers and selects the best transport for message delivery.
 * Does NOT cache endpoint information - always queries SystemTableCache.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7
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
import { LoggingService } from '../logging/logging-service.js';
import { COLUMN, ENDPOINT_STATUS, TABLES } from '../constants/index.js';

/**
 * Subsystem name for logging.
 */
const REGISTRY_SUBSYSTEM = stryMutAct_9fa48("159428") ? "" : (stryCov_9fa48("159428"), 'transport-registry');

/**
 * Log messages for TransportRegistry.
 */
const REGISTRY_LOG_MSG = Object.freeze(stryMutAct_9fa48("159429") ? {} : (stryCov_9fa48("159429"), {
  PROVIDER_REGISTERED: stryMutAct_9fa48("159430") ? "" : (stryCov_9fa48("159430"), 'Transport provider registered'),
  PROVIDER_UNREGISTERED: stryMutAct_9fa48("159431") ? "" : (stryCov_9fa48("159431"), 'Transport provider unregistered'),
  PROVIDER_NOT_FOUND: stryMutAct_9fa48("159432") ? "" : (stryCov_9fa48("159432"), 'Transport provider not found'),
  PROVIDER_ALREADY_REGISTERED: stryMutAct_9fa48("159433") ? "" : (stryCov_9fa48("159433"), 'Transport provider already registered'),
  SELECTING_ENDPOINT: stryMutAct_9fa48("159434") ? "" : (stryCov_9fa48("159434"), 'Selecting endpoint for node'),
  ENDPOINT_SELECTED: stryMutAct_9fa48("159435") ? "" : (stryCov_9fa48("159435"), 'Endpoint selected for node'),
  NO_ENDPOINTS_FOUND: stryMutAct_9fa48("159436") ? "" : (stryCov_9fa48("159436"), 'No endpoints found for node'),
  NO_AVAILABLE_PROVIDER: stryMutAct_9fa48("159437") ? "" : (stryCov_9fa48("159437"), 'No available provider for endpoint'),
  NO_AVAILABLE_ENDPOINTS: stryMutAct_9fa48("159438") ? "" : (stryCov_9fa48("159438"), 'No available endpoints for node'),
  GETTING_ENDPOINTS: stryMutAct_9fa48("159439") ? "" : (stryCov_9fa48("159439"), 'Getting endpoints for node')
}));

/**
 * Error messages for TransportRegistry.
 */
const REGISTRY_ERROR_MSG = Object.freeze(stryMutAct_9fa48("159440") ? {} : (stryCov_9fa48("159440"), {
  PROVIDER_REQUIRED: stryMutAct_9fa48("159441") ? "" : (stryCov_9fa48("159441"), 'Provider is required'),
  PROVIDER_MUST_HAVE_GET_TYPE: stryMutAct_9fa48("159442") ? "" : (stryCov_9fa48("159442"), 'Provider must implement getType() method'),
  TRANSPORT_TYPE_REQUIRED: stryMutAct_9fa48("159443") ? "" : (stryCov_9fa48("159443"), 'Transport type is required'),
  NODE_ID_REQUIRED: stryMutAct_9fa48("159444") ? "" : (stryCov_9fa48("159444"), 'Node ID is required'),
  SYSTEM_CACHE_REQUIRED: stryMutAct_9fa48("159445") ? "" : (stryCov_9fa48("159445"), 'SystemTableCache is required'),
  noEndpointsForNode: stryMutAct_9fa48("159446") ? () => undefined : (stryCov_9fa48("159446"), nodeId => stryMutAct_9fa48("159447") ? `` : (stryCov_9fa48("159447"), `No endpoints found for node ${nodeId}`)),
  noAvailableTransport: stryMutAct_9fa48("159448") ? () => undefined : (stryCov_9fa48("159448"), nodeId => stryMutAct_9fa48("159449") ? `` : (stryCov_9fa48("159449"), `No available transport for node ${nodeId}`))
}));

/**
 * TransportRegistry manages transport providers and selects best transport.
 * Does NOT cache endpoint information - always queries SystemTableCache.
 */
class TransportRegistry {
  /**
   * Create a new TransportRegistry instance.
   * @param {Object} systemCacheClient - Read-only cache client for endpoint lookups.
   * @throws {Error} If systemCacheClient is not provided.
   */
  constructor(systemCacheClient) {
    if (stryMutAct_9fa48("159450")) {
      {}
    } else {
      stryCov_9fa48("159450");
      if (stryMutAct_9fa48("159453") ? false : stryMutAct_9fa48("159452") ? true : stryMutAct_9fa48("159451") ? systemCacheClient : (stryCov_9fa48("159451", "159452", "159453"), !systemCacheClient)) {
        if (stryMutAct_9fa48("159454")) {
          {}
        } else {
          stryCov_9fa48("159454");
          throw new Error(REGISTRY_ERROR_MSG.SYSTEM_CACHE_REQUIRED);
        }
      }
      this.systemCacheClient = systemCacheClient;
      this.providers = new Map();
      this.logger = LoggingService.getInstance().forSubsystem(REGISTRY_SUBSYSTEM);
    }
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
    if (stryMutAct_9fa48("159455")) {
      {}
    } else {
      stryCov_9fa48("159455");
      if (stryMutAct_9fa48("159458") ? false : stryMutAct_9fa48("159457") ? true : stryMutAct_9fa48("159456") ? provider : (stryCov_9fa48("159456", "159457", "159458"), !provider)) {
        if (stryMutAct_9fa48("159459")) {
          {}
        } else {
          stryCov_9fa48("159459");
          throw new Error(REGISTRY_ERROR_MSG.PROVIDER_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("159462") ? typeof provider.getType === 'function' : stryMutAct_9fa48("159461") ? false : stryMutAct_9fa48("159460") ? true : (stryCov_9fa48("159460", "159461", "159462"), typeof provider.getType !== (stryMutAct_9fa48("159463") ? "" : (stryCov_9fa48("159463"), 'function')))) {
        if (stryMutAct_9fa48("159464")) {
          {}
        } else {
          stryCov_9fa48("159464");
          throw new Error(REGISTRY_ERROR_MSG.PROVIDER_MUST_HAVE_GET_TYPE);
        }
      }
      const transportType = provider.getType();
      if (stryMutAct_9fa48("159466") ? false : stryMutAct_9fa48("159465") ? true : (stryCov_9fa48("159465", "159466"), this.providers.has(transportType))) {
        if (stryMutAct_9fa48("159467")) {
          {}
        } else {
          stryCov_9fa48("159467");
          this.logger.warn(REGISTRY_LOG_MSG.PROVIDER_ALREADY_REGISTERED, stryMutAct_9fa48("159468") ? {} : (stryCov_9fa48("159468"), {
            transportType
          }));
        }
      }
      this.providers.set(transportType, provider);
      this.logger.info(REGISTRY_LOG_MSG.PROVIDER_REGISTERED, stryMutAct_9fa48("159469") ? {} : (stryCov_9fa48("159469"), {
        transportType
      }));
    }
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
    if (stryMutAct_9fa48("159470")) {
      {}
    } else {
      stryCov_9fa48("159470");
      if (stryMutAct_9fa48("159473") ? false : stryMutAct_9fa48("159472") ? true : stryMutAct_9fa48("159471") ? transportType : (stryCov_9fa48("159471", "159472", "159473"), !transportType)) {
        if (stryMutAct_9fa48("159474")) {
          {}
        } else {
          stryCov_9fa48("159474");
          throw new Error(REGISTRY_ERROR_MSG.TRANSPORT_TYPE_REQUIRED);
        }
      }
      const existed = this.providers.delete(transportType);
      if (stryMutAct_9fa48("159476") ? false : stryMutAct_9fa48("159475") ? true : (stryCov_9fa48("159475", "159476"), existed)) {
        if (stryMutAct_9fa48("159477")) {
          {}
        } else {
          stryCov_9fa48("159477");
          this.logger.info(REGISTRY_LOG_MSG.PROVIDER_UNREGISTERED, stryMutAct_9fa48("159478") ? {} : (stryCov_9fa48("159478"), {
            transportType
          }));
        }
      } else {
        if (stryMutAct_9fa48("159479")) {
          {}
        } else {
          stryCov_9fa48("159479");
          this.logger.debug(REGISTRY_LOG_MSG.PROVIDER_NOT_FOUND, stryMutAct_9fa48("159480") ? {} : (stryCov_9fa48("159480"), {
            transportType
          }));
        }
      }
      return existed;
    }
  }

  /**
   * Get provider for a transport type.
   *
   * @param {string} transportType - Transport type to look up
   * @return {Object|null} TransportProvider or null if not registered
   */
  getProvider(transportType) {
    if (stryMutAct_9fa48("159481")) {
      {}
    } else {
      stryCov_9fa48("159481");
      return stryMutAct_9fa48("159484") ? this.providers.get(transportType) && null : stryMutAct_9fa48("159483") ? false : stryMutAct_9fa48("159482") ? true : (stryCov_9fa48("159482", "159483", "159484"), this.providers.get(transportType) || null);
    }
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
    if (stryMutAct_9fa48("159485")) {
      {}
    } else {
      stryCov_9fa48("159485");
      if (stryMutAct_9fa48("159488") ? false : stryMutAct_9fa48("159487") ? true : stryMutAct_9fa48("159486") ? nodeId : (stryCov_9fa48("159486", "159487", "159488"), !nodeId)) {
        if (stryMutAct_9fa48("159489")) {
          {}
        } else {
          stryCov_9fa48("159489");
          throw new Error(REGISTRY_ERROR_MSG.NODE_ID_REQUIRED);
        }
      }
      this.logger.debug(REGISTRY_LOG_MSG.SELECTING_ENDPOINT, stryMutAct_9fa48("159490") ? {} : (stryCov_9fa48("159490"), {
        nodeId
      }));
      const candidates = this.getDeliveryCandidates(nodeId);
      if (stryMutAct_9fa48("159493") ? candidates.length !== 0 : stryMutAct_9fa48("159492") ? false : stryMutAct_9fa48("159491") ? true : (stryCov_9fa48("159491", "159492", "159493"), candidates.length === 0)) {
        if (stryMutAct_9fa48("159494")) {
          {}
        } else {
          stryCov_9fa48("159494");
          this.logger.debug(REGISTRY_LOG_MSG.NO_AVAILABLE_ENDPOINTS, stryMutAct_9fa48("159495") ? {} : (stryCov_9fa48("159495"), {
            nodeId
          }));
          return null;
        }
      }
      const selected = candidates[0];
      this.logger.debug(REGISTRY_LOG_MSG.ENDPOINT_SELECTED, stryMutAct_9fa48("159496") ? {} : (stryCov_9fa48("159496"), {
        nodeId,
        endpointId: selected.endpoint[COLUMN.ENDPOINT_ID],
        transportType: selected.endpoint[COLUMN.TRANSPORT_TYPE],
        priority: selected.endpoint[COLUMN.PRIORITY]
      }));
      return selected.endpoint;
    }
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
    if (stryMutAct_9fa48("159497")) {
      {}
    } else {
      stryCov_9fa48("159497");
      if (stryMutAct_9fa48("159500") ? false : stryMutAct_9fa48("159499") ? true : stryMutAct_9fa48("159498") ? nodeId : (stryCov_9fa48("159498", "159499", "159500"), !nodeId)) {
        if (stryMutAct_9fa48("159501")) {
          {}
        } else {
          stryCov_9fa48("159501");
          throw new Error(REGISTRY_ERROR_MSG.NODE_ID_REQUIRED);
        }
      }
      this.logger.debug(REGISTRY_LOG_MSG.GETTING_ENDPOINTS, stryMutAct_9fa48("159502") ? {} : (stryCov_9fa48("159502"), {
        nodeId
      }));

      // Query SystemTableCache for endpoints matching this node
      const endpoints = stryMutAct_9fa48("159503") ? this.systemCacheClient : (stryCov_9fa48("159503"), this.systemCacheClient.filter(TABLES.NODE_ENDPOINTS, stryMutAct_9fa48("159504") ? () => undefined : (stryCov_9fa48("159504"), endpoint => stryMutAct_9fa48("159507") ? endpoint[COLUMN.NODE_ID] === nodeId || endpoint[COLUMN.STATUS] === ENDPOINT_STATUS.ACTIVE : stryMutAct_9fa48("159506") ? false : stryMutAct_9fa48("159505") ? true : (stryCov_9fa48("159505", "159506", "159507"), (stryMutAct_9fa48("159509") ? endpoint[COLUMN.NODE_ID] !== nodeId : stryMutAct_9fa48("159508") ? true : (stryCov_9fa48("159508", "159509"), endpoint[COLUMN.NODE_ID] === nodeId)) && (stryMutAct_9fa48("159511") ? endpoint[COLUMN.STATUS] !== ENDPOINT_STATUS.ACTIVE : stryMutAct_9fa48("159510") ? true : (stryCov_9fa48("159510", "159511"), endpoint[COLUMN.STATUS] === ENDPOINT_STATUS.ACTIVE))))));

      // Sort by priority (lower number = higher preference)
      stryMutAct_9fa48("159512") ? endpoints : (stryCov_9fa48("159512"), endpoints.sort((a, b) => {
        if (stryMutAct_9fa48("159513")) {
          {}
        } else {
          stryCov_9fa48("159513");
          const priorityA = stryMutAct_9fa48("159514") ? a[COLUMN.PRIORITY] && 0 : (stryCov_9fa48("159514"), a[COLUMN.PRIORITY] ?? 0);
          const priorityB = stryMutAct_9fa48("159515") ? b[COLUMN.PRIORITY] && 0 : (stryCov_9fa48("159515"), b[COLUMN.PRIORITY] ?? 0);
          return stryMutAct_9fa48("159516") ? priorityA + priorityB : (stryCov_9fa48("159516"), priorityA - priorityB);
        }
      }));
      return endpoints;
    }
  }

  /**
   * Resolve endpoint delivery candidates with providers, in priority order.
   * This method is the single owner for endpoint/provider selection rules.
   * @param {string} nodeId - Target node ID.
   * @return {Array<{endpoint: Object, provider: Object}>} Ordered candidates.
   */
  getDeliveryCandidates(nodeId) {
    if (stryMutAct_9fa48("159517")) {
      {}
    } else {
      stryCov_9fa48("159517");
      if (stryMutAct_9fa48("159520") ? false : stryMutAct_9fa48("159519") ? true : stryMutAct_9fa48("159518") ? nodeId : (stryCov_9fa48("159518", "159519", "159520"), !nodeId)) {
        if (stryMutAct_9fa48("159521")) {
          {}
        } else {
          stryCov_9fa48("159521");
          throw new Error(REGISTRY_ERROR_MSG.NODE_ID_REQUIRED);
        }
      }
      const endpoints = this.getEndpointsForNode(nodeId);
      if (stryMutAct_9fa48("159524") ? endpoints.length !== 0 : stryMutAct_9fa48("159523") ? false : stryMutAct_9fa48("159522") ? true : (stryCov_9fa48("159522", "159523", "159524"), endpoints.length === 0)) {
        if (stryMutAct_9fa48("159525")) {
          {}
        } else {
          stryCov_9fa48("159525");
          this.logger.debug(REGISTRY_LOG_MSG.NO_ENDPOINTS_FOUND, stryMutAct_9fa48("159526") ? {} : (stryCov_9fa48("159526"), {
            nodeId
          }));
          return stryMutAct_9fa48("159527") ? ["Stryker was here"] : (stryCov_9fa48("159527"), []);
        }
      }
      const candidates = stryMutAct_9fa48("159528") ? ["Stryker was here"] : (stryCov_9fa48("159528"), []);
      for (const endpoint of endpoints) {
        if (stryMutAct_9fa48("159529")) {
          {}
        } else {
          stryCov_9fa48("159529");
          const transportType = endpoint[COLUMN.TRANSPORT_TYPE];
          const provider = this.providers.get(transportType);
          if (stryMutAct_9fa48("159532") ? false : stryMutAct_9fa48("159531") ? true : stryMutAct_9fa48("159530") ? provider : (stryCov_9fa48("159530", "159531", "159532"), !provider)) {
            if (stryMutAct_9fa48("159533")) {
              {}
            } else {
              stryCov_9fa48("159533");
              this.logger.debug(REGISTRY_LOG_MSG.NO_AVAILABLE_PROVIDER, stryMutAct_9fa48("159534") ? {} : (stryCov_9fa48("159534"), {
                nodeId,
                transportType,
                endpointId: endpoint[COLUMN.ENDPOINT_ID]
              }));
              continue;
            }
          }
          if (stryMutAct_9fa48("159537") ? false : stryMutAct_9fa48("159536") ? true : stryMutAct_9fa48("159535") ? provider.isAvailable() : (stryCov_9fa48("159535", "159536", "159537"), !provider.isAvailable())) {
            if (stryMutAct_9fa48("159538")) {
              {}
            } else {
              stryCov_9fa48("159538");
              this.logger.debug(REGISTRY_LOG_MSG.NO_AVAILABLE_PROVIDER, stryMutAct_9fa48("159539") ? {} : (stryCov_9fa48("159539"), {
                nodeId,
                transportType,
                endpointId: endpoint[COLUMN.ENDPOINT_ID],
                reason: stryMutAct_9fa48("159540") ? "" : (stryCov_9fa48("159540"), 'provider not available')
              }));
              continue;
            }
          }
          candidates.push(stryMutAct_9fa48("159541") ? {} : (stryCov_9fa48("159541"), {
            endpoint,
            provider
          }));
        }
      }
      return candidates;
    }
  }

  /**
   * Get all registered transport types.
   *
   * @return {Array<string>} Array of registered transport type strings
   */
  getRegisteredTypes() {
    if (stryMutAct_9fa48("159542")) {
      {}
    } else {
      stryCov_9fa48("159542");
      return Array.from(this.providers.keys());
    }
  }

  /**
   * Check if a transport type is registered.
   *
   * @param {string} transportType - Transport type to check
   * @return {boolean} True if the transport type is registered
   */
  hasProvider(transportType) {
    if (stryMutAct_9fa48("159543")) {
      {}
    } else {
      stryCov_9fa48("159543");
      return this.providers.has(transportType);
    }
  }

  /**
   * Get the count of registered providers.
   *
   * @return {number} Number of registered providers
   */
  getProviderCount() {
    if (stryMutAct_9fa48("159544")) {
      {}
    } else {
      stryCov_9fa48("159544");
      return this.providers.size;
    }
  }
}
export { TransportRegistry, REGISTRY_SUBSYSTEM, REGISTRY_LOG_MSG, REGISTRY_ERROR_MSG };