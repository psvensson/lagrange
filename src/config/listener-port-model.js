const LISTENER_PORT_RANGE = Object.freeze({
  MINIMUM: 1,
  MAXIMUM: 65535,
});

const LISTENER_PORT_OFFSET = Object.freeze({
  ADMIN_WEBSOCKET: 1,
  TRANSPORT_WEBSOCKET: 2,
});

const DEFAULT_REST_API_PORT = 8080;

const LISTENER_PORT_DEFAULT = Object.freeze({
  REST_API: DEFAULT_REST_API_PORT,
  ADMIN_WEBSOCKET:
    DEFAULT_REST_API_PORT + LISTENER_PORT_OFFSET.ADMIN_WEBSOCKET,
  TRANSPORT_WEBSOCKET:
    DEFAULT_REST_API_PORT + LISTENER_PORT_OFFSET.TRANSPORT_WEBSOCKET,
});

const LISTENER_PORT_ENV = Object.freeze({
  REST_API: 'REST_API_PORT',
  ADMIN_WEBSOCKET: 'ADMIN_WEBSOCKET_PORT',
  TRANSPORT_WEBSOCKET: 'NODE_WS_PORT',
});

const LISTENER_PORT_NAME = Object.freeze({
  REST_API: 'REST API',
  ADMIN_WEBSOCKET: 'admin WebSocket',
  TRANSPORT_WEBSOCKET: 'transport WebSocket',
});

const LISTENER_PORT_ERROR = Object.freeze({
  invalid: (name, value) =>
    `${name} listener port must be an integer between ` +
    `${LISTENER_PORT_RANGE.MINIMUM} and ${LISTENER_PORT_RANGE.MAXIMUM}; ` +
    `received ${String(value)}`,
  collision: (ports) =>
    'Listener ports must be distinct: ' +
    `REST=${ports.restApiPort}, ` +
    `admin WS=${ports.adminWebSocketPort}, ` +
    `transport WS=${ports.transportWebSocketPort}`,
});

const WEBSOCKET_PROTOCOL = Object.freeze({
  PLAIN: 'ws://',
  SECURE: 'wss://',
});

const ADDRESS_PORT_SEPARATOR = ':';

function assertListenerPort(port, name) {
  if (!Number.isInteger(port) ||
      port < LISTENER_PORT_RANGE.MINIMUM ||
      port > LISTENER_PORT_RANGE.MAXIMUM) {
    throw new RangeError(LISTENER_PORT_ERROR.invalid(name, port));
  }
  return port;
}

function deriveOffsetPort(restApiPort, offset, name) {
  const basePort = assertListenerPort(
    restApiPort,
    LISTENER_PORT_NAME.REST_API,
  );
  return assertListenerPort(basePort + offset, name);
}

function deriveAdminWebSocketPort(restApiPort) {
  return deriveOffsetPort(
    restApiPort,
    LISTENER_PORT_OFFSET.ADMIN_WEBSOCKET,
    LISTENER_PORT_NAME.ADMIN_WEBSOCKET,
  );
}

function deriveTransportWebSocketPort(restApiPort) {
  return deriveOffsetPort(
    restApiPort,
    LISTENER_PORT_OFFSET.TRANSPORT_WEBSOCKET,
    LISTENER_PORT_NAME.TRANSPORT_WEBSOCKET,
  );
}

function assertDistinctListenerPorts(ports) {
  const distinctPorts = new Set([
    ports.restApiPort,
    ports.adminWebSocketPort,
    ports.transportWebSocketPort,
  ]);
  if (distinctPorts.size !== 3) {
    throw new RangeError(LISTENER_PORT_ERROR.collision(ports));
  }
}

function resolveListenerPorts(options = {}) {
  const restApiPort = options.restApiPort === undefined ?
    LISTENER_PORT_DEFAULT.REST_API :
    assertListenerPort(options.restApiPort, LISTENER_PORT_NAME.REST_API);
  const adminWebSocketPort = options.adminWebSocketPort === undefined ?
    deriveAdminWebSocketPort(restApiPort) :
    assertListenerPort(
      options.adminWebSocketPort,
      LISTENER_PORT_NAME.ADMIN_WEBSOCKET,
    );
  const transportWebSocketPort = options.transportWebSocketPort === undefined ?
    deriveTransportWebSocketPort(restApiPort) :
    assertListenerPort(
      options.transportWebSocketPort,
      LISTENER_PORT_NAME.TRANSPORT_WEBSOCKET,
    );
  const ports = Object.freeze({
    restApiPort,
    adminWebSocketPort,
    transportWebSocketPort,
  });
  assertDistinctListenerPorts(ports);
  return ports;
}

function deriveTransportWebSocketAddress(nodeAddress) {
  if (typeof nodeAddress !== 'string') {
    return null;
  }
  const normalizedAddress = nodeAddress.trim();
  if (normalizedAddress.length === 0) {
    return null;
  }
  if (normalizedAddress.startsWith(WEBSOCKET_PROTOCOL.PLAIN) ||
      normalizedAddress.startsWith(WEBSOCKET_PROTOCOL.SECURE)) {
    return normalizedAddress;
  }

  const colonIndex = normalizedAddress.lastIndexOf(ADDRESS_PORT_SEPARATOR);
  if (colonIndex <= 0) {
    return null;
  }
  const hostname = normalizedAddress.substring(0, colonIndex);
  const restApiPort = Number(normalizedAddress.substring(colonIndex + 1));
  if (hostname.length === 0 || !Number.isInteger(restApiPort)) {
    return null;
  }

  try {
    const transportWebSocketPort = deriveTransportWebSocketPort(restApiPort);
    return `${WEBSOCKET_PROTOCOL.PLAIN}${hostname}` +
      `${ADDRESS_PORT_SEPARATOR}${transportWebSocketPort}`;
  } catch (_error) {
    return null;
  }
}

export {
  LISTENER_PORT_DEFAULT,
  LISTENER_PORT_ENV,
  LISTENER_PORT_OFFSET,
  LISTENER_PORT_RANGE,
  assertDistinctListenerPorts,
  deriveAdminWebSocketPort,
  deriveTransportWebSocketAddress,
  deriveTransportWebSocketPort,
  resolveListenerPorts,
};
