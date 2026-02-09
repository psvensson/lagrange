/**
 * Constants for PeerAddressResolver - unified peer address resolution.
 * Replaces duplicated buildPeerAddress() logic across services.
 */

const PEER_ADDRESS_RESOLVER_ADDRESS = Object.freeze({
  SEPARATOR: '/',
});

const PEER_ADDRESS_RESOLVER_ERROR_MSG = Object.freeze({
  peerAddressNotUnified: (peerId) =>
    `Peer address must be unified: ${peerId}`,
  peerAddressUnresolved: (peerId) =>
    `Unable to resolve unified peer address for ${peerId}`,
});

const PEER_ADDRESS_RESOLVER_LOG_MSG = Object.freeze({
  PEER_ADDRESS_FROM_LIST: 'Built peer address from peerAddresses array',
  PEER_ADDRESS_FROM_CACHE: 'Built peer address from cache',
  PEER_ADDRESS_NOT_UNIFIED: 'Peer address must be in unified format',
});

export {
  PEER_ADDRESS_RESOLVER_ADDRESS,
  PEER_ADDRESS_RESOLVER_ERROR_MSG,
  PEER_ADDRESS_RESOLVER_LOG_MSG,
};
