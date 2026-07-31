import {COLUMN} from '../constants/index.js';

const REJOIN_ROLE_SEED = 'seed';
const REJOIN_ROLE_JOINER = 'joiner';
const MULTI_NODE_CLUSTER_THRESHOLD = 1;

function normalizeAddress(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNodeCount(nodeRows) {
  return Array.isArray(nodeRows) ? nodeRows.length : 0;
}

function normalizeNodeRole(value) {
  const normalized = normalizeAddress(value);
  if (!normalized) {
    return null;
  }
  const role = normalized.toLowerCase();
  if (role === REJOIN_ROLE_SEED || role === REJOIN_ROLE_JOINER) {
    return role;
  }
  return null;
}

function parseClusterNodeCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}

function extractPeerAddressEntry(value) {
  const peerAddress = normalizeAddress(
    value?.[COLUMN.NODE_ADDRESS] ?? value?.node_address ?? value,
  );
  if (!peerAddress) {
    return null;
  }
  return {
    rowNodeId: normalizeAddress(
      value?.[COLUMN.NODE_ID] ?? value?.node_id ?? null,
    ),
    peerAddress,
  };
}

function isLocalPeerEntry(entry, normalizedNodeId, normalizedNodeAddress) {
  if (normalizedNodeId && entry.rowNodeId === normalizedNodeId) {
    return true;
  }
  return normalizedNodeAddress !== null &&
    entry.peerAddress === normalizedNodeAddress;
}

function normalizePeerAddresses(peerAddresses, nodeId, nodeAddress) {
  const normalizedNodeId = normalizeAddress(nodeId);
  const normalizedNodeAddress = normalizeAddress(nodeAddress);
  const uniquePeerAddresses = new Set();

  for (const value of Array.isArray(peerAddresses) ? peerAddresses : []) {
    const entry = extractPeerAddressEntry(value);
    if (
      entry &&
      !isLocalPeerEntry(entry, normalizedNodeId, normalizedNodeAddress)
    ) {
      uniquePeerAddresses.add(entry.peerAddress);
    }
  }

  return Array.from(uniquePeerAddresses);
}

function deriveRequiresPeerRejoin(options = {}) {
  return normalizeNodeRole(options.nodeRole) === REJOIN_ROLE_JOINER ||
    parseClusterNodeCount(options.clusterNodeCount) >
      MULTI_NODE_CLUSTER_THRESHOLD ||
    normalizePeerAddresses(options.peerAddresses).length > 0;
}

function extractPeerAddresses(nodeRows, nodeId, nodeAddress) {
  return normalizePeerAddresses(nodeRows, nodeId, nodeAddress);
}

function prioritizePeerAddress(peerAddresses, selectedPeerAddress) {
  const normalizedPeerAddresses = normalizePeerAddresses(peerAddresses);
  const normalizedSelectedPeerAddress = normalizeAddress(selectedPeerAddress);
  if (!normalizedSelectedPeerAddress) {
    return normalizedPeerAddresses;
  }
  return [
    normalizedSelectedPeerAddress,
    ...normalizedPeerAddresses.filter(
      (peerAddress) => peerAddress !== normalizedSelectedPeerAddress,
    ),
  ];
}

export {
  deriveRequiresPeerRejoin,
  extractPeerAddresses,
  normalizeAddress,
  normalizeNodeCount,
  normalizeNodeRole,
  normalizePeerAddresses,
  parseClusterNodeCount,
  prioritizePeerAddress,
};
