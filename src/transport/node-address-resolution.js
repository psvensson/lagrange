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

function normalizeAddressString(value) {
  return typeof value === TYPEOF.STRING ?
    value.trim() :
    '';
}

function parseAddressParts(address) {
  const normalized = normalizeAddressString(address);
  if (normalized.length === NUM.ZERO) {
    return {host: null, port: null, protocol: null};
  }

  if (normalized.includes('://')) {
    try {
      const parsed = new URL(normalized);
      const parsedPort = Number(parsed.port);
      return {
        host: parsed.hostname || null,
        port: Number.isInteger(parsedPort) && parsedPort > NUM.ZERO ?
          parsedPort :
          null,
        protocol: parsed.protocol || null,
      };
    } catch (_error) {
      return {host: null, port: null, protocol: null};
    }
  }

  if (normalized.startsWith('[')) {
    const closingBracket = normalized.indexOf(']');
    if (closingBracket > NUM.ZERO) {
      const host = normalized.substring(NUM.ONE, closingBracket);
      const remainder = normalized.substring(closingBracket + NUM.ONE);
      const port = remainder.startsWith(':') ?
        Number(remainder.substring(NUM.ONE)) :
        null;
      return {
        host: host || null,
        port: Number.isInteger(port) && port > NUM.ZERO ? port : null,
        protocol: null,
      };
    }
  }

  const firstColon = normalized.indexOf(':');
  const lastColon = normalized.lastIndexOf(':');
  if (firstColon > NUM.ZERO && firstColon === lastColon) {
    const host = normalized.substring(NUM.ZERO, lastColon);
    const port = Number(normalized.substring(lastColon + NUM.ONE));
    return {
      host: host || null,
      port: Number.isInteger(port) && port > NUM.ZERO ? port : null,
      protocol: null,
    };
  }

  return {
    host: normalized,
    port: null,
    protocol: null,
  };
}

function formatHostForWebSocketUrl(host) {
  if (typeof host !== TYPEOF.STRING || host.length === NUM.ZERO) {
    return null;
  }
  return host.includes(':') && !host.startsWith('[') ?
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
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(host || ''));
}

function isIpv6Literal(host) {
  return String(host || '').includes(':');
}

function isLocalOnlyHost(host) {
  const normalized = String(host || '').toLowerCase();
  return normalized === HOST.LOCALHOST ||
    normalized === '127.0.0.1' ||
    normalized === '::1';
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
      if (family === 'IPv4') {
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

function resolveAdvertisedWebSocketAddress(options = {}) {
  const explicitAddress = normalizeAddressString(options.advertisedAddress);
  const explicitWsPort =
    Number.isInteger(options.wsPort) && options.wsPort > NUM.ZERO ?
      Math.floor(options.wsPort) :
      null;

  if (explicitAddress.length > NUM.ZERO) {
    if (explicitAddress.startsWith(PROTOCOL.WS) ||
        explicitAddress.startsWith(PROTOCOL.WSS)) {
      return explicitAddress;
    }
    const parsedExplicit = parseAddressParts(explicitAddress);
    const explicitPort = parsedExplicit.port || explicitWsPort;
    const explicitWsAddress =
      buildWebSocketAddress(parsedExplicit.host, explicitPort);
    if (explicitWsAddress) {
      return explicitWsAddress;
    }
  }

  const nodeAddress = normalizeAddressString(options.nodeAddress);
  const parsedNodeAddress = parseAddressParts(nodeAddress);
  const derivedWsPort = explicitWsPort ||
    (Number.isInteger(parsedNodeAddress.port) &&
      parsedNodeAddress.port > NUM.ZERO ?
      ((parsedNodeAddress.protocol === 'ws:' ||
          parsedNodeAddress.protocol === 'wss:') ?
        parsedNodeAddress.port :
        parsedNodeAddress.port + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET) :
      null);

  let host = parsedNodeAddress.host;
  const shouldPreferRoutableInterface =
    options.preferRoutableInterface === true ||
    (options.wsHost === HOST.ANY &&
      typeof host === TYPEOF.STRING &&
      host.length > NUM.ZERO &&
      !isIpLiteral(host) &&
      !isLocalOnlyHost(host));
  if (shouldPreferRoutableInterface) {
    host = resolveRoutableLocalIpAddress() || host;
  }

  const advertisedWsAddress = buildWebSocketAddress(host, derivedWsPort);
  return advertisedWsAddress || normalizeToWebSocketAddress(nodeAddress);
}

function resolveAdvertisedEndpointHost(options = {}) {
  const advertisedWsAddress =
    resolveAdvertisedWebSocketAddress(options);
  const advertisedHost =
    parseAddressParts(advertisedWsAddress).host;
  if (advertisedHost) {
    return advertisedHost;
  }
  const nodeHost = parseAddressParts(options.nodeAddress).host;
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
  const targetNodeId = options.targetNodeId;
  if (!targetNodeId) {
    return null;
  }

  const bootstrapResponse = options.bootstrapResponse || null;
  if (targetNodeId === bootstrapResponse?.seedNodeId &&
      typeof bootstrapResponse?.seedNodeWsAddress === TYPEOF.STRING &&
      bootstrapResponse.seedNodeWsAddress.length > NUM.ZERO) {
    return bootstrapResponse.seedNodeWsAddress;
  }

  const systemTableCache = options.systemTableCache || null;
  const cacheEndpointRows =
    getCacheEndpointRows(systemTableCache, targetNodeId);
  const cacheEndpointAddress =
    cacheEndpointRows[NUM.ZERO]?.[COLUMN.ADDRESS] || null;
  if (cacheEndpointAddress) {
    return normalizeToWebSocketAddress(cacheEndpointAddress) ||
      cacheEndpointAddress;
  }

  const bootstrapEndpointRows =
    getBootstrapSnapshotEndpointRows(bootstrapResponse, targetNodeId);
  const bootstrapEndpointAddress =
    bootstrapEndpointRows[NUM.ZERO]?.[COLUMN.ADDRESS] || null;
  if (bootstrapEndpointAddress) {
    return normalizeToWebSocketAddress(bootstrapEndpointAddress) ||
      bootstrapEndpointAddress;
  }

  return null;
}

export {
  parseAddressParts,
  resolveAdvertisedEndpointHost,
  resolveAdvertisedWebSocketAddress,
  resolveNodeWebSocketAddress,
  resolveRoutableLocalIpAddress,
};
