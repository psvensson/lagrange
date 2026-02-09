/**
 * PeerAddressResolver - Resolves peer replica IDs to unified addresses.
 * Replaces the duplicated buildPeerAddress() logic across services.
 * Single implementation for all peer address resolution.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import {NUM, TABLES} from '../constants/index.js';
import {AddressManager} from '../address/address-manager.js';
import {
  PEER_ADDRESS_RESOLVER_ADDRESS,
  PEER_ADDRESS_RESOLVER_ERROR_MSG,
  PEER_ADDRESS_RESOLVER_LOG_MSG,
} from './peer-address-resolver-constants.js';

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
    this.addressManager = options.addressManager || AddressManager.getInstance();
    this.systemTableCache = options.systemTableCache;
    this.entityType = options.entityType;
    this.logger = options.logger || console;
  }

  /**
   * Resolve a peer ID to a unified address.
   * @param {string} peerId - Peer replica ID or unified address.
   * @param {Array<string>} [peerAddresses] - Known peer addresses.
   * @return {string} Unified address.
   * @throws {Error} If peer cannot be resolved.
   */
  resolve(peerId, peerAddresses) {
    // Path 1: Already unified format → validate and return
    if (peerId.includes(PEER_ADDRESS_RESOLVER_ADDRESS.SEPARATOR)) {
      return this.resolveUnified(peerId);
    }

    // Path 2: peerAddresses array → search and return
    if (peerAddresses && peerAddresses.length > NUM.ZERO) {
      const found = this.resolveFromPeerAddresses(peerId, peerAddresses);
      if (found) {
        return found;
      }
    }

    // Path 3: systemTableCache → lookup node_id, format address
    if (this.systemTableCache) {
      const found = this.resolveFromCache(peerId);
      if (found) {
        return found;
      }
    }

    // Path 4: Throw with descriptive error
    throw new Error(
      PEER_ADDRESS_RESOLVER_ERROR_MSG.peerAddressUnresolved(peerId),
    );
  }

  /**
   * Validate and return a peerId that is already in unified format.
   * @param {string} peerId - Peer address in unified format.
   * @return {string} Validated unified address.
   * @throws {Error} If the address is not valid unified format.
   * @private
   */
  resolveUnified(peerId) {
    const validation = this.addressManager.validate(peerId);
    if (validation.valid) {
      return peerId;
    }
    this.logger.error(PEER_ADDRESS_RESOLVER_LOG_MSG.PEER_ADDRESS_NOT_UNIFIED, {
      peerId,
      error: validation.error,
    });
    throw new Error(
      PEER_ADDRESS_RESOLVER_ERROR_MSG.peerAddressNotUnified(peerId),
    );
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
    for (const addr of peerAddresses) {
      const validation = this.addressManager.validate(addr);
      if (!validation.valid) {
        this.logger.error(
          PEER_ADDRESS_RESOLVER_LOG_MSG.PEER_ADDRESS_NOT_UNIFIED, {
            peerId: addr,
            error: validation.error,
          },
        );
        throw new Error(
          PEER_ADDRESS_RESOLVER_ERROR_MSG.peerAddressNotUnified(addr),
        );
      }
      const parsed = this.addressManager.parse(addr);
      if (parsed.serviceId === peerId) {
        this.logger.debug(
          PEER_ADDRESS_RESOLVER_LOG_MSG.PEER_ADDRESS_FROM_LIST, {
            peerId,
            address: addr,
          },
        );
        return addr;
      }
    }
    return null;
  }

  /**
   * Look up the node ID from systemTableCache and construct address.
   * @param {string} peerId - Peer replica ID.
   * @return {string|null} Constructed unified address or null.
   * @private
   */
  resolveFromCache(peerId) {
    const service = this.systemTableCache.get(TABLES.SERVICES, peerId);
    if (service && service.node_id) {
      const address = this.addressManager.format(
        service.node_id,
        this.entityType,
        peerId,
      );
      this.logger.debug(
        PEER_ADDRESS_RESOLVER_LOG_MSG.PEER_ADDRESS_FROM_CACHE, {
          peerId,
          nodeId: service.node_id,
          address,
        },
      );
      return address;
    }
    return null;
  }
}

export {PeerAddressResolver};
