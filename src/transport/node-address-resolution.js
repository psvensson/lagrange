import os from 'os';
import {URL} from 'node:url';
import {
  COLUMN,
  ENDPOINT_STATUS,
  HOST,
  NUM,
  PROTOCOL,
  TABLES,
  TRANSPORT_TYPE,
  TYPEOF,
} from '../constants/index.js';
import {ENTRYPOINT_DEFAULT} from '../constants/entrypoint.js';
import {normalizeToWebSocketAddress} from '../constants/transport.js';

const LOCAL_STR_EMPTY = '';
const LOCAL_STR_1PLYW = '[';
const LOCAL_STR_1NY19 = ']';
const LOCAL_STR_COLON = ':';
const LOCAL_STR_127_0_0_1 = '127.0.0.1';
const LOCAL_STR_1 = '::1';
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
  return typeof value === TYPEOF.STRING ?
    value.trim() :
    LOCAL_STR_EMPTY;
}

function buildAddressStateResult(state) {
  return Object.freeze({state});
}

function buildAddressStringPart(value) {
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO ?
    Object.freeze({
      state: ADDRESS_PART_STATE.PRESENT,
      value,
    }) :
    Object.freeze({
      state: ADDRESS_PART_STATE.ABSENT,
    });
}

function buildAddressPortPart(value) {
  return Number.isInteger(value) && value > NUM.ZERO ?
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
  return typeof host === TYPEOF.STRING &&
    host.startsWith(LOCAL_STR_1PLYW) &&
    host.endsWith(LOCAL_STR_1NY19) ?
    host.substring(NUM.ONE, host.length - NUM.ONE) :
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
  if (!normalizedAddress.startsWith(LOCAL_STR_1PLYW)) {
    return null;
  }

  const closingBracket = normalizedAddress.indexOf(']');
  if (closingBracket <= NUM.ZERO) {
    return null;
  }

  const host = normalizedAddress.substring(NUM.ONE, closingBracket);
  const remainder = normalizedAddress.substring(closingBracket + NUM.ONE);
  const port = remainder.startsWith(':') ?
    Number(remainder.substring(NUM.ONE)) :
    null;
  return buildParsedAddressResult({
    host,
    port,
  });
}

function parseSingleColonAddressParts(normalizedAddress) {
  const firstColon = normalizedAddress.indexOf(':');
  const lastColon = normalizedAddress.lastIndexOf(':');
  if (firstColon <= NUM.ZERO || firstColon !== lastColon) {
    return null;
  }

  return buildParsedAddressResult({
    host: normalizedAddress.substring(NUM.ZERO, lastColon),
    port: Number(normalizedAddress.substring(lastColon + NUM.ONE)),
  });
}

function parseAddressPartsResult(address) {
  const normalized = normalizeAddressString(address);
  if (normalized.length === NUM.ZERO) {
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
  if (typeof host !== TYPEOF.STRING || host.length === NUM.ZERO) {
    return null;
  }
  return host.includes(LOCAL_STR_COLON) && !host.startsWith(LOCAL_STR_1PLYW) ?
    `[${host}]` :
    host;
}

function buildWebSocketAddress(host, port) {
  const formattedHost = formatHostForWebSocketUrl(host);
  if (!formattedHost || !Number.isInteger(port) || port <= NUM.ZERO) {
    return null;
  }
  return `${PROTOCOL.WS}${formattedHost}:${port}`;
}

function isIpv4Literal(host) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(host || LOCAL_STR_EMPTY));
}

function isIpv6Literal(host) {
  return String(host || LOCAL_STR_EMPTY).includes(LOCAL_STR_COLON);
}

function isLocalOnlyHost(host) {
  const normalized = String(host || '').toLowerCase();
  return normalized === HOST.LOCALHOST ||
    normalized === LOCAL_STR_127_0_0_1 ||
    normalized === LOCAL_STR_1;
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
        typeof entry.address !== TYPEOF.STRING ||
        entry.address.length === NUM.ZERO) {
        continue;
      }

      const family = typeof entry.family === TYPEOF.STRING ?
        entry.family :
        String(entry.family || '');
      if (family === NETWORK_FAMILY.IPV4) {
        ipv4Candidates.push(entry.address);
        continue;
      }
      fallbackCandidates.push(entry.address);
    }
  }

  return ipv4Candidates[NUM.ZERO] ||
    fallbackCandidates[NUM.ZERO] ||
    null;
}

function resolveExplicitWebSocketPort(wsPort) {
  return Number.isInteger(wsPort) && wsPort > NUM.ZERO ?
    Math.floor(wsPort) :
    null;
}

function resolveExplicitAdvertisedWebSocketAddress(
  explicitAddress,
  explicitWsPort,
) {
  if (explicitAddress.length === NUM.ZERO) {
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
  if (Number.isInteger(explicitWsPort) && explicitWsPort > NUM.ZERO) {
    return explicitWsPort;
  }

  const nodeAddressPort = readParsedAddressPartValue(parsedNodeAddress, 'port');
  if (!Number.isInteger(nodeAddressPort) || nodeAddressPort <= NUM.ZERO) {
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
      typeof host === TYPEOF.STRING &&
      host.length > NUM.ZERO &&
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
  return typeof options.fallbackHost === TYPEOF.STRING &&
    options.fallbackHost.length > NUM.ZERO ?
    options.fallbackHost :
    null;
}

function getActiveWebSocketEndpointRows(rows, targetNodeId) {
  if (!Array.isArray(rows) || rows.length === NUM.ZERO || !targetNodeId) {
    return [];
  }

  return rows
    .filter((row) => {
      return row?.[COLUMN.NODE_ID] === targetNodeId &&
        row?.[COLUMN.STATUS] === ENDPOINT_STATUS.ACTIVE &&
        row?.[COLUMN.TRANSPORT_TYPE] === TRANSPORT_TYPE.WEBSOCKET &&
        typeof row?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
        row[COLUMN.ADDRESS].length > NUM.ZERO;
    })
    .sort((left, right) => {
      return Number(left?.[COLUMN.PRIORITY] || NUM.ZERO) -
        Number(right?.[COLUMN.PRIORITY] || NUM.ZERO);
    });
}

function getCacheEndpointRows(systemTableCache, targetNodeId) {
  if (!systemTableCache || !targetNodeId) {
    return [];
  }
  if (typeof systemTableCache.filter === TYPEOF.FUNCTION) {
    return getActiveWebSocketEndpointRows(
      systemTableCache.filter(
        TABLES.NODE_ENDPOINTS,
        (row) => row?.[COLUMN.NODE_ID] === targetNodeId,
      ),
      targetNodeId,
    );
  }
  if (typeof systemTableCache.getAll === TYPEOF.FUNCTION) {
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
  const cacheEndpointAddress = cacheEndpointRows[NUM.ZERO]?.[COLUMN.ADDRESS];
  const hasCanonicalCacheRow =
    typeof cacheEndpointAddress === TYPEOF.STRING &&
    cacheEndpointAddress.length > NUM.ZERO;

  // The seed pin (bootstrapResponse.seedNodeWsAddress) and the canonical
  // node_endpoints cache row are the SAME self-advertised value; the pin is a
  // point-in-time bootstrap snapshot while the cache row is CDC-updated. When a
  // seed restarts with a new address, a peer's held bootstrapResponse goes
  // stale, so the fresher canonical cache row must win. The seed pin remains the
  // authority only during cold start, before CDC has populated the cache.
  if (!hasCanonicalCacheRow &&
      targetNodeId === bootstrapResponse?.seedNodeId &&
      typeof bootstrapResponse?.seedNodeWsAddress === TYPEOF.STRING &&
      bootstrapResponse.seedNodeWsAddress.length > NUM.ZERO) {
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
    bootstrapEndpointRows[NUM.ZERO]?.[COLUMN.ADDRESS];
  if (typeof bootstrapEndpointAddress === TYPEOF.STRING &&
      bootstrapEndpointAddress.length > NUM.ZERO) {
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
