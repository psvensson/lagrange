/**
 * PeerAddressResolver - Resolves peer replica IDs to unified addresses.
 * Replaces the duplicated buildPeerAddress() logic across services.
 * Single implementation for all peer address resolution.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
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
import { NUM, TABLES } from '../constants/index.js';
import { AddressManager } from '../address/address-manager.js';
import { PEER_ADDRESS_RESOLVER_ADDRESS, PEER_ADDRESS_RESOLVER_ERROR_MSG, PEER_ADDRESS_RESOLVER_LOG_MSG } from './peer-address-resolver-constants.js';

/**
 * Resolves peer replica IDs to unified addresses using multiple sources.
 * Resolution order:
 *   1. Already unified format → validate and return
 *   2. peerAddresses array → search and return
 *   3. systemTableCache → lookup node_id, format address
 *   4. Throw with descriptive error
 */
class PeerAddressResolver {
  /**
   * @param {Object} options - Configuration options.
   * @param {Object} options.addressManager - AddressManager instance.
   * @param {Object} options.systemTableCache - SystemTableCache for lookups.
   * @param {string} options.entityType - Entity type for address formatting.
   * @param {Object} [options.logger] - Logger instance.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("127553")) {
      {}
    } else {
      stryCov_9fa48("127553");
      this.addressManager = stryMutAct_9fa48("127556") ? options.addressManager && AddressManager.getInstance() : stryMutAct_9fa48("127555") ? false : stryMutAct_9fa48("127554") ? true : (stryCov_9fa48("127554", "127555", "127556"), options.addressManager || AddressManager.getInstance());
      this.systemTableCache = options.systemTableCache;
      this.entityType = options.entityType;
      this.logger = stryMutAct_9fa48("127559") ? options.logger && console : stryMutAct_9fa48("127558") ? false : stryMutAct_9fa48("127557") ? true : (stryCov_9fa48("127557", "127558", "127559"), options.logger || console);
    }
  }

  /**
   * Resolve a peer ID to a unified address.
   * @param {string} peerId - Peer replica ID or unified address.
   * @param {Array<string>} [peerAddresses] - Known peer addresses.
   * @return {string} Unified address.
   * @throws {Error} If peer cannot be resolved.
   */
  resolve(peerId, peerAddresses) {
    if (stryMutAct_9fa48("127560")) {
      {}
    } else {
      stryCov_9fa48("127560");
      // Path 1: Already unified format → validate and return
      if (stryMutAct_9fa48("127562") ? false : stryMutAct_9fa48("127561") ? true : (stryCov_9fa48("127561", "127562"), peerId.includes(PEER_ADDRESS_RESOLVER_ADDRESS.SEPARATOR))) {
        if (stryMutAct_9fa48("127563")) {
          {}
        } else {
          stryCov_9fa48("127563");
          return this.resolveUnified(peerId);
        }
      }

      // Path 2: peerAddresses array → search and return
      if (stryMutAct_9fa48("127566") ? peerAddresses || peerAddresses.length > NUM.ZERO : stryMutAct_9fa48("127565") ? false : stryMutAct_9fa48("127564") ? true : (stryCov_9fa48("127564", "127565", "127566"), peerAddresses && (stryMutAct_9fa48("127569") ? peerAddresses.length <= NUM.ZERO : stryMutAct_9fa48("127568") ? peerAddresses.length >= NUM.ZERO : stryMutAct_9fa48("127567") ? true : (stryCov_9fa48("127567", "127568", "127569"), peerAddresses.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("127570")) {
          {}
        } else {
          stryCov_9fa48("127570");
          const found = this.resolveFromPeerAddresses(peerId, peerAddresses);
          if (stryMutAct_9fa48("127572") ? false : stryMutAct_9fa48("127571") ? true : (stryCov_9fa48("127571", "127572"), found)) {
            if (stryMutAct_9fa48("127573")) {
              {}
            } else {
              stryCov_9fa48("127573");
              return found;
            }
          }
        }
      }

      // Path 3: systemTableCache → lookup node_id, format address
      if (stryMutAct_9fa48("127575") ? false : stryMutAct_9fa48("127574") ? true : (stryCov_9fa48("127574", "127575"), this.systemTableCache)) {
        if (stryMutAct_9fa48("127576")) {
          {}
        } else {
          stryCov_9fa48("127576");
          const found = this.resolveFromCache(peerId);
          if (stryMutAct_9fa48("127578") ? false : stryMutAct_9fa48("127577") ? true : (stryCov_9fa48("127577", "127578"), found)) {
            if (stryMutAct_9fa48("127579")) {
              {}
            } else {
              stryCov_9fa48("127579");
              return found;
            }
          }
        }
      }

      // Path 4: Throw with descriptive error
      throw new Error(PEER_ADDRESS_RESOLVER_ERROR_MSG.peerAddressUnresolved(peerId));
    }
  }

  /**
   * Validate and return a peerId that is already in unified format.
   * @param {string} peerId - Peer address in unified format.
   * @return {string} Validated unified address.
   * @throws {Error} If the address is not valid unified format.
   * @private
   */
  resolveUnified(peerId) {
    if (stryMutAct_9fa48("127580")) {
      {}
    } else {
      stryCov_9fa48("127580");
      const validation = this.addressManager.validate(peerId);
      if (stryMutAct_9fa48("127582") ? false : stryMutAct_9fa48("127581") ? true : (stryCov_9fa48("127581", "127582"), validation.valid)) {
        if (stryMutAct_9fa48("127583")) {
          {}
        } else {
          stryCov_9fa48("127583");
          return peerId;
        }
      }
      this.logger.error(PEER_ADDRESS_RESOLVER_LOG_MSG.PEER_ADDRESS_NOT_UNIFIED, stryMutAct_9fa48("127584") ? {} : (stryCov_9fa48("127584"), {
        peerId,
        error: validation.error
      }));
      throw new Error(PEER_ADDRESS_RESOLVER_ERROR_MSG.peerAddressNotUnified(peerId));
    }
  }

  /**
   * Search the peerAddresses array for a matching address.
   * @param {string} peerId - Peer replica ID.
   * @param {Array<string>} peerAddresses - Known peer addresses.
   * @return {string|null} Matching unified address or null.
   * @throws {Error} If a peerAddresses entry is not valid unified format.
   * @private
   */
  resolveFromPeerAddresses(peerId, peerAddresses) {
    if (stryMutAct_9fa48("127585")) {
      {}
    } else {
      stryCov_9fa48("127585");
      for (const addr of peerAddresses) {
        if (stryMutAct_9fa48("127586")) {
          {}
        } else {
          stryCov_9fa48("127586");
          const validation = this.addressManager.validate(addr);
          if (stryMutAct_9fa48("127589") ? false : stryMutAct_9fa48("127588") ? true : stryMutAct_9fa48("127587") ? validation.valid : (stryCov_9fa48("127587", "127588", "127589"), !validation.valid)) {
            if (stryMutAct_9fa48("127590")) {
              {}
            } else {
              stryCov_9fa48("127590");
              this.logger.error(PEER_ADDRESS_RESOLVER_LOG_MSG.PEER_ADDRESS_NOT_UNIFIED, stryMutAct_9fa48("127591") ? {} : (stryCov_9fa48("127591"), {
                peerId: addr,
                error: validation.error
              }));
              throw new Error(PEER_ADDRESS_RESOLVER_ERROR_MSG.peerAddressNotUnified(addr));
            }
          }
          const parsed = this.addressManager.parse(addr);
          if (stryMutAct_9fa48("127594") ? parsed.serviceId !== peerId : stryMutAct_9fa48("127593") ? false : stryMutAct_9fa48("127592") ? true : (stryCov_9fa48("127592", "127593", "127594"), parsed.serviceId === peerId)) {
            if (stryMutAct_9fa48("127595")) {
              {}
            } else {
              stryCov_9fa48("127595");
              this.logger.debug(PEER_ADDRESS_RESOLVER_LOG_MSG.PEER_ADDRESS_FROM_LIST, stryMutAct_9fa48("127596") ? {} : (stryCov_9fa48("127596"), {
                peerId,
                address: addr
              }));
              return addr;
            }
          }
        }
      }
      return null;
    }
  }

  /**
   * Look up the node ID from systemTableCache and construct address.
   * @param {string} peerId - Peer replica ID.
   * @return {string|null} Constructed unified address or null.
   * @private
   */
  resolveFromCache(peerId) {
    if (stryMutAct_9fa48("127597")) {
      {}
    } else {
      stryCov_9fa48("127597");
      const service = this.systemTableCache.get(TABLES.SERVICES, peerId);
      if (stryMutAct_9fa48("127600") ? service || service.node_id : stryMutAct_9fa48("127599") ? false : stryMutAct_9fa48("127598") ? true : (stryCov_9fa48("127598", "127599", "127600"), service && service.node_id)) {
        if (stryMutAct_9fa48("127601")) {
          {}
        } else {
          stryCov_9fa48("127601");
          const address = this.addressManager.format(service.node_id, this.entityType, peerId);
          this.logger.debug(PEER_ADDRESS_RESOLVER_LOG_MSG.PEER_ADDRESS_FROM_CACHE, stryMutAct_9fa48("127602") ? {} : (stryCov_9fa48("127602"), {
            peerId,
            nodeId: service.node_id,
            address
          }));
          return address;
        }
      }
      return null;
    }
  }
}
export { PeerAddressResolver };