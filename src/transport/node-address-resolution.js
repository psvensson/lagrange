import os from 'os';
import {URL} from 'node:url';
import {
  COLUMN,
  ENDPOINT_STATUS,
  HOST,
  PROTOCOL,
  TABLES,
  TRANSPORT_TYPE,
} from '../constants/index.js';
import {ENTRYPOINT_DEFAULT} from '../constants/entrypoint.js';
import {normalizeToWebSocketAddress} from '../constants/transport.js';

const LOCAL_STR_LBRACKET = '[';
const LOCAL_STR_RBRACKET = ']';
const LOCAL_STR_COLON = ':';
const LOCAL_STR_127_0_0_1 = '127.0.0.1';
const LOCAL_STR_COLON_COLON_1 = '::1';
const LOCAL_STR_HOST = 'host';
const LOCAL_STR_PORT = 'port';

const NODE_WEBSOCKET_ADDRESS_RESOLUTION_REASON = Object.freeze({
  TARGET_NODE_MISSING: 'target_node_missing',
  CANONICAL_METADATA_MISSING: 'canonical_websocket_metadata_missing',
});

const NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE = Object.freeze({
  RESOLVED: 'resolved',
  UNAVAILABLE: 'unavailable',
});

const ADDRESS_PARSE_STATE = Object.freeze({
  EMPTY: 'empty',
  INVALID: 'invalid',
  PARSED: 'parsed',
});

const ADDRESS_PART_STATE = Object.freeze({
  ABSENT: 'absent',
  PRESENT: 'present',
});

const NETWORK_FAMILY = Object.freeze({
  IPV4: 'IPv4',
});

const WEBSOCKET_URL_PROTOCOL = Object.freeze({
  WS: 'ws:',
  WSS: 'wss:',
});

const NODE_WEBSOCKET_ADDRESS_RESOLUTION_AUTHORITY = Object.freeze({
  NORMALIZED_BOOTSTRAP_SEED: 'normalized_bootstrap_seed',
  CANONICAL_NODE_ENDPOINT: 'canonical_node_endpoint',
});

const NODE_WEBSOCKET_ADDRESS_RESOLUTION_EVIDENCE_SOURCE = Object.freeze({
  BOOTSTRAP_SEED_INGRESS: 'bootstrap_seed_ingress',
  BOOTSTRAP_SNAPSHOT_NODE_ENDPOINTS: 'bootstrap_snapshot_node_endpoints',
  SYSTEM_TABLE_CACHE: 'system_table_cache',
});

const ADDRESS_PROTOCOL_SEPARATOR = '://';

function normalizeAddressString(value) {
  return typeof value === 'string' ?
    value.trim() :
    '';
}

function buildAddressStateResult(state) {
  return Object.freeze({state});
}

function buildAddressStringPart(value) {
  return typeof value === 'string' && value.length > 0 ?
    Object.freeze({
      state: ADDRESS_PART_STATE.PRESENT,
      value,
    }) :
    Object.freeze({
      state: ADDRESS_PART_STATE.ABSENT,
    });
}

function buildAddressPortPart(value) {
  return Number.isInteger(value) && value > 0 ?
    Object.freeze({
      state: ADDRESS_PART_STATE.PRESENT,
      value,
    }) :
    Object.freeze({
      state: ADDRESS_PART_STATE.ABSENT,
    });
}

function buildParsedAddressResult(options = {}) {
  return Object.freeze({
    state: ADDRESS_PARSE_STATE.PARSED,
    host: buildAddressStringPart(options.host || null),
    port: buildAddressPortPart(options.port),
    protocol: buildAddressStringPart(options.protocol || null),
  });
}

function normalizeParsedUrlHost(host) {
  return typeof host === 'string' &&
    host.startsWith(LOCAL_STR_LBRACKET) &&
    host.endsWith(LOCAL_STR_RBRACKET) ?
    host.substring(1, host.length - 1) :
    host;
}

function readParsedAddressPartValue(parsedAddress, partName) {
  return parsedAddress?.state === ADDRESS_PARSE_STATE.PARSED &&
    parsedAddress?.[partName]?.state === ADDRESS_PART_STATE.PRESENT ?
    parsedAddress[partName].value :
    null;
}

function parseUrlAddressParts(normalizedAddress) {
  try {
    const parsed = new URL(normalizedAddress);
    return buildParsedAddressResult({
      host: normalizeParsedUrlHost(parsed.hostname),
      port: Number(parsed.port),
      protocol: parsed.protocol,
    });
  } catch (_error) {
    return buildAddressStateResult(ADDRESS_PARSE_STATE.INVALID);
  }
}

function parseBracketedAddressParts(normalizedAddress) {
  if (!normalizedAddress.startsWith(LOCAL_STR_LBRACKET)) {
    return null;
  }

  const closingBracket = normalizedAddress.indexOf(']');
  if (closingBracket <= 0) {
    return null;
  }

  const host = normalizedAddress.substring(1, closingBracket);
  const remainder = normalizedAddress.substring(closingBracket + 1);
  const port = remainder.startsWith(':') ?
    Number(remainder.substring(1)) :
    null;
  return buildParsedAddressResult({
    host,
    port,
  });
}

function parseSingleColonAddressParts(normalizedAddress) {
  const firstColon = normalizedAddress.indexOf(':');
  const lastColon = normalizedAddress.lastIndexOf(':');
  if (firstColon <= 0 || firstColon !== lastColon) {
    return null;
  }

  return buildParsedAddressResult({
    host: normalizedAddress.substring(0, lastColon),
    port: Number(normalizedAddress.substring(lastColon + 1)),
  });
}

function parseAddressPartsResult(address) {
  const normalized = normalizeAddressString(address);
  if (normalized.length === 0) {
    return buildAddressStateResult(ADDRESS_PARSE_STATE.EMPTY);
  }

  if (normalized.includes(ADDRESS_PROTOCOL_SEPARATOR)) {
    return parseUrlAddressParts(normalized);
  }

  const bracketedParts = parseBracketedAddressParts(normalized);
  if (bracketedParts) {
    return bracketedParts;
  }

  const hostPortParts = parseSingleColonAddressParts(normalized);
  if (hostPortParts) {
    return hostPortParts;
  }

  return buildParsedAddressResult({
    host: normalized,
  });
}

function formatHostForWebSocketUrl(host) {
  if (typeof host !== 'string' || host.length === 0) {
    return null;
  }
  return host.includes(LOCAL_STR_COLON) && !host.startsWith(LOCAL_STR_LBRACKET) ?
    `[${host}]` :
    host;
}

function buildWebSocketAddress(host, port) {
  const formattedHost = formatHostForWebSocketUrl(host);
  if (!formattedHost || !Number.isInteger(port) || port <= 0) {
    return null;
  }
  return `${PROTOCOL.WS}${formattedHost}:${port}`;
}

function isIpv4Literal(host) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(host || ''));
}

function isIpv6Literal(host) {
  return String(host || '').includes(LOCAL_STR_COLON);
}

function isLocalOnlyHost(host) {
  const normalized = String(host || '').toLowerCase();
  return normalized === HOST.LOCALHOST ||
    normalized === LOCAL_STR_127_0_0_1 ||
    normalized === LOCAL_STR_COLON_COLON_1;
}

function isIpLiteral(host) {
  return isIpv4Literal(host) || isIpv6Literal(host);
}

function resolveRoutableLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  const ipv4Candidates = [];
  const fallbackCandidates = [];

  for (const interfaceEntries of Object.values(interfaces || {})) {
    if (!Array.isArray(interfaceEntries)) {
      continue;
    }
    for (const entry of interfaceEntries) {
      if (!entry || entry.internal === true ||
        typeof entry.address !== 'string' ||
        entry.address.length === 0) {
        continue;
      }

      const family = typeof entry.family === 'string' ?
        entry.family :
        String(entry.family || '');
      if (family === NETWORK_FAMILY.IPV4) {
        ipv4Candidates.push(entry.address);
        continue;
      }
      fallbackCandidates.push(entry.address);
    }
  }

  return ipv4Candidates[0] ||
    fallbackCandidates[0] ||
    null;
}

function resolveExplicitWebSocketPort(wsPort) {
  return Number.isInteger(wsPort) && wsPort > 0 ?
    Math.floor(wsPort) :
    null;
}

function resolveExplicitAdvertisedWebSocketAddress(
  explicitAddress,
  explicitWsPort,
) {
  if (explicitAddress.length === 0) {
    return null;
  }
  if (explicitAddress.startsWith(PROTOCOL.WS) ||
      explicitAddress.startsWith(PROTOCOL.WSS)) {
    return explicitAddress;
  }

  const parsedExplicit = parseAddressPartsResult(explicitAddress);
  return buildWebSocketAddress(
    readParsedAddressPartValue(parsedExplicit, LOCAL_STR_HOST),
    readParsedAddressPartValue(parsedExplicit, LOCAL_STR_PORT) || explicitWsPort,
  );
}

function resolveDerivedAdvertisedWebSocketPort(
  parsedNodeAddress,
  explicitWsPort,
) {
  if (Number.isInteger(explicitWsPort) && explicitWsPort > 0) {
    return explicitWsPort;
  }

  const nodeAddressPort = readParsedAddressPartValue(parsedNodeAddress, 'port');
  if (!Number.isInteger(nodeAddressPort) || nodeAddressPort <= 0) {
    return null;
  }

  const nodeAddressProtocol =
    readParsedAddressPartValue(parsedNodeAddress, 'protocol');
  if (nodeAddressProtocol === WEBSOCKET_URL_PROTOCOL.WS ||
      nodeAddressProtocol === WEBSOCKET_URL_PROTOCOL.WSS) {
    return nodeAddressPort;
  }
  return nodeAddressPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET;
}

function shouldPreferRoutableAdvertisedHost(options, host) {
  return options.preferRoutableInterface === true ||
    (options.wsHost === HOST.ANY &&
      typeof host === 'string' &&
      host.length > 0 &&
      !isIpLiteral(host) &&
      !isLocalOnlyHost(host));
}

function resolveAdvertisedWebSocketHost(options, parsedNodeAddress) {
  const host = readParsedAddressPartValue(parsedNodeAddress, 'host');
  if (!shouldPreferRoutableAdvertisedHost(options, host)) {
    return host;
  }
  return resolveRoutableLocalIpAddress() || host;
}

function resolveAdvertisedWebSocketAddress(options = {}) {
  const explicitAddress = normalizeAddressString(options.advertisedAddress);
  const explicitWsPort = resolveExplicitWebSocketPort(options.wsPort);
  const explicitWsAddress = resolveExplicitAdvertisedWebSocketAddress(
    explicitAddress,
    explicitWsPort,
  );
  if (explicitWsAddress) {
    return explicitWsAddress;
  }

  const nodeAddress = normalizeAddressString(options.nodeAddress);
  const parsedNodeAddress = parseAddressPartsResult(nodeAddress);
  const advertisedWsAddress = buildWebSocketAddress(
    resolveAdvertisedWebSocketHost(options, parsedNodeAddress),
    resolveDerivedAdvertisedWebSocketPort(parsedNodeAddress, explicitWsPort),
  );
  return advertisedWsAddress || normalizeToWebSocketAddress(nodeAddress);
}

function resolveAdvertisedEndpointHost(options = {}) {
  const advertisedWsAddress =
    resolveAdvertisedWebSocketAddress(options);
  const advertisedHost = readParsedAddressPartValue(
    parseAddressPartsResult(advertisedWsAddress),
    'host',
  );
  if (advertisedHost) {
    return advertisedHost;
  }
  const nodeHost = readParsedAddressPartValue(
    parseAddressPartsResult(options.nodeAddress),
    'host',
  );
  if (nodeHost) {
    return nodeHost;
  }
  return typeof options.fallbackHost === 'string' &&
    options.fallbackHost.length > 0 ?
    options.fallbackHost :
    null;
}

function getActiveWebSocketEndpointRows(rows, targetNodeId) {
  if (!Array.isArray(rows) || rows.length === 0 || !targetNodeId) {
    return [];
  }

  return rows
    .filter((row) => {
      return row?.[COLUMN.NODE_ID] === targetNodeId &&
        row?.[COLUMN.STATUS] === ENDPOINT_STATUS.ACTIVE &&
        row?.[COLUMN.TRANSPORT_TYPE] === TRANSPORT_TYPE.WEBSOCKET &&
        typeof row?.[COLUMN.ADDRESS] === 'string' &&
        row[COLUMN.ADDRESS].length > 0;
    })
    .sort((left, right) => {
      return Number(left?.[COLUMN.PRIORITY] || 0) -
        Number(right?.[COLUMN.PRIORITY] || 0);
    });
}

function getCacheEndpointRows(systemTableCache, targetNodeId) {
  if (!systemTableCache || !targetNodeId) {
    return [];
  }
  if (typeof systemTableCache.filter === 'function') {
    return getActiveWebSocketEndpointRows(
      systemTableCache.filter(
        TABLES.NODE_ENDPOINTS,
        (row) => row?.[COLUMN.NODE_ID] === targetNodeId,
      ),
      targetNodeId,
    );
  }
  if (typeof systemTableCache.getAll === 'function') {
    return getActiveWebSocketEndpointRows(
      systemTableCache.getAll(TABLES.NODE_ENDPOINTS) || [],
      targetNodeId,
    );
  }
  return [];
}

function getBootstrapSnapshotEndpointRows(bootstrapResponse, targetNodeId) {
  return getActiveWebSocketEndpointRows(
    bootstrapResponse?.systemTableSnapshots?.node_endpoints || [],
    targetNodeId,
  );
}

function resolveNodeWebSocketAddress(options = {}) {
  return resolveNodeWebSocketAddressResult(options);
}

function resolveNodeWebSocketAddressResult(options = {}) {
  const targetNodeId = options.targetNodeId;
  if (!targetNodeId) {
    return Object.freeze({
      state: NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.UNAVAILABLE,
      reason: NODE_WEBSOCKET_ADDRESS_RESOLUTION_REASON.TARGET_NODE_MISSING,
    });
  }

  const bootstrapResponse = options.bootstrapResponse;
  const systemTableCache = options.systemTableCache;
  const cacheEndpointRows =
    getCacheEndpointRows(systemTableCache, targetNodeId);
  const cacheEndpointAddress = cacheEndpointRows[0]?.[COLUMN.ADDRESS];
  const hasCanonicalCacheRow =
    typeof cacheEndpointAddress === 'string' &&
    cacheEndpointAddress.length > 0;

  // The seed pin (bootstrapResponse.seedNodeWsAddress) and the canonical
  // node_endpoints cache row are the SAME self-advertised value; the pin is a
  // point-in-time bootstrap snapshot while the cache row is CDC-updated. When a
  // seed restarts with a new address, a peer's held bootstrapResponse goes
  // stale, so the fresher canonical cache row must win. The seed pin remains the
  // authority only during cold start, before CDC has populated the cache.
  if (!hasCanonicalCacheRow &&
      targetNodeId === bootstrapResponse?.seedNodeId &&
      typeof bootstrapResponse?.seedNodeWsAddress === 'string' &&
      bootstrapResponse.seedNodeWsAddress.length > 0) {
    return Object.freeze({
      state: NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED,
      address: bootstrapResponse.seedNodeWsAddress,
      authority:
        NODE_WEBSOCKET_ADDRESS_RESOLUTION_AUTHORITY
          .NORMALIZED_BOOTSTRAP_SEED,
      evidenceSource:
        NODE_WEBSOCKET_ADDRESS_RESOLUTION_EVIDENCE_SOURCE
          .BOOTSTRAP_SEED_INGRESS,
    });
  }

  if (hasCanonicalCacheRow) {
    return Object.freeze({
      state: NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED,
      address:
        normalizeToWebSocketAddress(cacheEndpointAddress) ||
        cacheEndpointAddress,
      authority:
        NODE_WEBSOCKET_ADDRESS_RESOLUTION_AUTHORITY
          .CANONICAL_NODE_ENDPOINT,
      evidenceSource:
        NODE_WEBSOCKET_ADDRESS_RESOLUTION_EVIDENCE_SOURCE.SYSTEM_TABLE_CACHE,
    });
  }

  const bootstrapEndpointRows =
    getBootstrapSnapshotEndpointRows(bootstrapResponse, targetNodeId);
  const bootstrapEndpointAddress =
    bootstrapEndpointRows[0]?.[COLUMN.ADDRESS];
  if (typeof bootstrapEndpointAddress === 'string' &&
      bootstrapEndpointAddress.length > 0) {
    return Object.freeze({
      state: NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED,
      address:
        normalizeToWebSocketAddress(bootstrapEndpointAddress) ||
        bootstrapEndpointAddress,
      authority:
        NODE_WEBSOCKET_ADDRESS_RESOLUTION_AUTHORITY
          .CANONICAL_NODE_ENDPOINT,
      evidenceSource:
        NODE_WEBSOCKET_ADDRESS_RESOLUTION_EVIDENCE_SOURCE
          .BOOTSTRAP_SNAPSHOT_NODE_ENDPOINTS,
    });
  }

  return Object.freeze({
    state: NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.UNAVAILABLE,
    reason:
      NODE_WEBSOCKET_ADDRESS_RESOLUTION_REASON.CANONICAL_METADATA_MISSING,
  });
}

export {
  NODE_WEBSOCKET_ADDRESS_RESOLUTION_AUTHORITY,
  NODE_WEBSOCKET_ADDRESS_RESOLUTION_EVIDENCE_SOURCE,
  NODE_WEBSOCKET_ADDRESS_RESOLUTION_REASON,
  NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE,
  parseAddressPartsResult,
  resolveAdvertisedEndpointHost,
  resolveAdvertisedWebSocketAddress,
  resolveNodeWebSocketAddress,
  resolveNodeWebSocketAddressResult,
  resolveRoutableLocalIpAddress,
};
