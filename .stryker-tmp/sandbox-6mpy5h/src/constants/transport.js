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
import { ADDRESS, ENTITY_TYPE, HOST, NUM, PROTOCOL, STRING, TYPEOF } from './index.js';
import { ENTRYPOINT_DEFAULT } from './entrypoint.js';
const CONNECTION_STATE = Object.freeze(stryMutAct_9fa48("54996") ? {} : (stryCov_9fa48("54996"), {
  DISCONNECTED: stryMutAct_9fa48("54997") ? "" : (stryCov_9fa48("54997"), 'disconnected'),
  CONNECTING: stryMutAct_9fa48("54998") ? "" : (stryCov_9fa48("54998"), 'connecting'),
  CONNECTED: stryMutAct_9fa48("54999") ? "" : (stryCov_9fa48("54999"), 'connected'),
  RECONNECTING: stryMutAct_9fa48("55000") ? "" : (stryCov_9fa48("55000"), 'reconnecting'),
  CLOSED: stryMutAct_9fa48("55001") ? "" : (stryCov_9fa48("55001"), 'closed')
}));
const ROUTER_MESSAGE_TYPE = Object.freeze(stryMutAct_9fa48("55002") ? {} : (stryCov_9fa48("55002"), {
  SERVICE_MESSAGE: stryMutAct_9fa48("55003") ? "" : (stryCov_9fa48("55003"), 'service_message'),
  SERVICE_RESPONSE: stryMutAct_9fa48("55004") ? "" : (stryCov_9fa48("55004"), 'service_response'),
  ACK: stryMutAct_9fa48("55005") ? "" : (stryCov_9fa48("55005"), 'ack'),
  IDENTIFY: stryMutAct_9fa48("55006") ? "" : (stryCov_9fa48("55006"), 'identify'),
  PING: stryMutAct_9fa48("55007") ? "" : (stryCov_9fa48("55007"), 'ping'),
  PONG: stryMutAct_9fa48("55008") ? "" : (stryCov_9fa48("55008"), 'pong'),
  JOIN_REQUEST: stryMutAct_9fa48("55009") ? "" : (stryCov_9fa48("55009"), 'join_request'),
  JOIN_RESPONSE: stryMutAct_9fa48("55010") ? "" : (stryCov_9fa48("55010"), 'join_response'),
  JOIN_COMPLETE: stryMutAct_9fa48("55011") ? "" : (stryCov_9fa48("55011"), 'join_complete'),
  JOIN_COMPLETE_ACK: stryMutAct_9fa48("55012") ? "" : (stryCov_9fa48("55012"), 'join_complete_ack')
}));
const WS_MESSAGE_TYPE = Object.freeze(stryMutAct_9fa48("55013") ? {} : (stryCov_9fa48("55013"), {
  RAFT_MESSAGE: stryMutAct_9fa48("55014") ? "" : (stryCov_9fa48("55014"), 'raft_message'),
  SERVICE_MESSAGE: stryMutAct_9fa48("55015") ? "" : (stryCov_9fa48("55015"), 'service_message'),
  SERVICE_RESPONSE: stryMutAct_9fa48("55016") ? "" : (stryCov_9fa48("55016"), 'service_response'),
  PING: stryMutAct_9fa48("55017") ? "" : (stryCov_9fa48("55017"), 'ping'),
  PONG: stryMutAct_9fa48("55018") ? "" : (stryCov_9fa48("55018"), 'pong'),
  ACK: stryMutAct_9fa48("55019") ? "" : (stryCov_9fa48("55019"), 'ack'),
  IDENTIFY: stryMutAct_9fa48("55020") ? "" : (stryCov_9fa48("55020"), 'identify')
}));
const TRANSPORT_CONFIG_KEY = Object.freeze(stryMutAct_9fa48("55021") ? {} : (stryCov_9fa48("55021"), {
  WS_HOST: stryMutAct_9fa48("55022") ? "" : (stryCov_9fa48("55022"), 'transport.wsHost'),
  MESSAGE_TIMEOUT_MS: stryMutAct_9fa48("55023") ? "" : (stryCov_9fa48("55023"), 'transport.messageTimeoutMs'),
  ACK_TIMEOUT_QUARANTINE_THRESHOLD: stryMutAct_9fa48("55024") ? "" : (stryCov_9fa48("55024"), 'transport.ackTimeoutQuarantineThreshold'),
  PING_TIMEOUT_MS: stryMutAct_9fa48("55025") ? "" : (stryCov_9fa48("55025"), 'transport.pingTimeoutMs'),
  RECONNECT_INTERVAL_MS: stryMutAct_9fa48("55026") ? "" : (stryCov_9fa48("55026"), 'transport.reconnectIntervalMs'),
  RECONNECT_MAX_ATTEMPTS: stryMutAct_9fa48("55027") ? "" : (stryCov_9fa48("55027"), 'transport.reconnectMaxAttempts'),
  PING_INTERVAL_MS: stryMutAct_9fa48("55028") ? "" : (stryCov_9fa48("55028"), 'transport.pingIntervalMs'),
  RECONNECT_BACKOFF_MULTIPLIER: stryMutAct_9fa48("55029") ? "" : (stryCov_9fa48("55029"), 'transport.reconnectBackoffMultiplier'),
  OUTBOUND_QUEUE_MAX_CONCURRENT: stryMutAct_9fa48("55030") ? "" : (stryCov_9fa48("55030"), 'transport.outboundQueueMaxConcurrent'),
  OUTBOUND_QUEUE_MAX_PENDING: stryMutAct_9fa48("55031") ? "" : (stryCov_9fa48("55031"), 'transport.outboundQueueMaxPending'),
  OUTBOUND_QUEUE_CRITICAL_RESERVE: stryMutAct_9fa48("55032") ? "" : (stryCov_9fa48("55032"), 'transport.outboundQueueCriticalReserve'),
  CONNECTION_POOL_TTL_MS: stryMutAct_9fa48("55033") ? "" : (stryCov_9fa48("55033"), 'transport.connectionPoolTtlMs'),
  CONNECTION_POOL_CLEANUP_INTERVAL_MS: stryMutAct_9fa48("55034") ? "" : (stryCov_9fa48("55034"), 'transport.connectionPoolCleanupIntervalMs')
}));
const TRANSPORT_DEFAULT = Object.freeze(stryMutAct_9fa48("55035") ? {} : (stryCov_9fa48("55035"), {
  WS_PORT: stryMutAct_9fa48("55036") ? ENTRYPOINT_DEFAULT.REST_API_PORT - ENTRYPOINT_DEFAULT.WS_PORT_OFFSET : (stryCov_9fa48("55036"), ENTRYPOINT_DEFAULT.REST_API_PORT + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET),
  WS_HOST: HOST.LOCALHOST,
  WS_PROTOCOL: PROTOCOL.WS,
  LOCAL_ADDRESS_PREFIX: stryMutAct_9fa48("55037") ? "" : (stryCov_9fa48("55037"), 'ws-'),
  MESSAGE_TIMEOUT_MS: 5000,
  ACK_TIMEOUT_QUARANTINE_THRESHOLD: 2,
  PING_TIMEOUT_MS: 1000,
  RECONNECT_INTERVAL_MS: 1000,
  RECONNECT_MAX_ATTEMPTS: 10,
  PING_INTERVAL_MS: 30000,
  RECONNECT_BACKOFF_MULTIPLIER: 1.5,
  OUTBOUND_QUEUE_CONCURRENCY: 32,
  OUTBOUND_QUEUE_MAX_PENDING: 64,
  OUTBOUND_QUEUE_CRITICAL_RESERVE: NUM.SIXTEEN,
  SHUTDOWN_WAIT_MS: 100,
  RPC_TIMEOUT_MS: 30000,
  EMPTY: STRING.EMPTY,
  CONNECTION_POOL_TTL_MS: 300000,
  // 5 minutes
  CONNECTION_POOL_CLEANUP_INTERVAL_MS: 60000 // 1 minute
}));
const OUTBOUND_DELIVERY_PRIORITY = Object.freeze(stryMutAct_9fa48("55038") ? {} : (stryCov_9fa48("55038"), {
  CRITICAL: stryMutAct_9fa48("55039") ? "" : (stryCov_9fa48("55039"), 'critical'),
  BACKGROUND: stryMutAct_9fa48("55040") ? "" : (stryCov_9fa48("55040"), 'background')
}));
const TRANSPORT_STRING = Object.freeze(stryMutAct_9fa48("55041") ? {} : (stryCov_9fa48("55041"), {
  NEWLINE: stryMutAct_9fa48("55042") ? "" : (stryCov_9fa48("55042"), '\n')
}));
const TRANSPORT_FORMAT = Object.freeze(stryMutAct_9fa48("55043") ? {} : (stryCov_9fa48("55043"), {
  buildWebSocketAddress: stryMutAct_9fa48("55044") ? () => undefined : (stryCov_9fa48("55044"), (host, port) => stryMutAct_9fa48("55045") ? `` : (stryCov_9fa48("55045"), `${TRANSPORT_DEFAULT.WS_PROTOCOL}${host}:${port}`)),
  buildDefaultNodeAddress: stryMutAct_9fa48("55046") ? () => undefined : (stryCov_9fa48("55046"), port => stryMutAct_9fa48("55047") ? `` : (stryCov_9fa48("55047"), `${TRANSPORT_DEFAULT.WS_PROTOCOL}${TRANSPORT_DEFAULT.WS_HOST}:${port}`)),
  buildLocalAddress: stryMutAct_9fa48("55048") ? () => undefined : (stryCov_9fa48("55048"), nodeId => stryMutAct_9fa48("55049") ? `` : (stryCov_9fa48("55049"), `${TRANSPORT_DEFAULT.LOCAL_ADDRESS_PREFIX}${nodeId}`))
}));

/**
 * Normalize a node address to a WebSocket address.
 *
 * If the address already starts with ws:// or wss://, return it as-is.
 * If it is a bare host:port (REST API address), derive the WebSocket
 * address by applying the standard WS_PORT_OFFSET.
 * Returns null for addresses that cannot be normalized.
 *
 * @param {string} nodeAddress - Raw node address.
 * @return {string|null} WebSocket address or null.
 */
function normalizeToWebSocketAddress(nodeAddress) {
  if (stryMutAct_9fa48("55050")) {
    {}
  } else {
    stryCov_9fa48("55050");
    if (stryMutAct_9fa48("55053") ? !nodeAddress && typeof nodeAddress !== TYPEOF.STRING : stryMutAct_9fa48("55052") ? false : stryMutAct_9fa48("55051") ? true : (stryCov_9fa48("55051", "55052", "55053"), (stryMutAct_9fa48("55054") ? nodeAddress : (stryCov_9fa48("55054"), !nodeAddress)) || (stryMutAct_9fa48("55056") ? typeof nodeAddress === TYPEOF.STRING : stryMutAct_9fa48("55055") ? false : (stryCov_9fa48("55055", "55056"), typeof nodeAddress !== TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("55057")) {
        {}
      } else {
        stryCov_9fa48("55057");
        return null;
      }
    }
    if (stryMutAct_9fa48("55060") ? nodeAddress.startsWith(PROTOCOL.WS) && nodeAddress.startsWith(PROTOCOL.WSS) : stryMutAct_9fa48("55059") ? false : stryMutAct_9fa48("55058") ? true : (stryCov_9fa48("55058", "55059", "55060"), (stryMutAct_9fa48("55061") ? nodeAddress.endsWith(PROTOCOL.WS) : (stryCov_9fa48("55061"), nodeAddress.startsWith(PROTOCOL.WS))) || (stryMutAct_9fa48("55062") ? nodeAddress.endsWith(PROTOCOL.WSS) : (stryCov_9fa48("55062"), nodeAddress.startsWith(PROTOCOL.WSS))))) {
      if (stryMutAct_9fa48("55063")) {
        {}
      } else {
        stryCov_9fa48("55063");
        return nodeAddress;
      }
    }
    const colonIndex = nodeAddress.lastIndexOf(ADDRESS.PORT_SEPARATOR);
    if (stryMutAct_9fa48("55067") ? colonIndex > NUM.ZERO : stryMutAct_9fa48("55066") ? colonIndex < NUM.ZERO : stryMutAct_9fa48("55065") ? false : stryMutAct_9fa48("55064") ? true : (stryCov_9fa48("55064", "55065", "55066", "55067"), colonIndex <= NUM.ZERO)) {
      if (stryMutAct_9fa48("55068")) {
        {}
      } else {
        stryCov_9fa48("55068");
        return null;
      }
    }
    const hostname = stryMutAct_9fa48("55069") ? nodeAddress : (stryCov_9fa48("55069"), nodeAddress.substring(NUM.ZERO, colonIndex));
    const restPort = Number(stryMutAct_9fa48("55070") ? nodeAddress : (stryCov_9fa48("55070"), nodeAddress.substring(stryMutAct_9fa48("55071") ? colonIndex - NUM.ONE : (stryCov_9fa48("55071"), colonIndex + NUM.ONE))));
    if (stryMutAct_9fa48("55074") ? (!hostname || !Number.isFinite(restPort)) && restPort <= NUM.ZERO : stryMutAct_9fa48("55073") ? false : stryMutAct_9fa48("55072") ? true : (stryCov_9fa48("55072", "55073", "55074"), (stryMutAct_9fa48("55076") ? !hostname && !Number.isFinite(restPort) : stryMutAct_9fa48("55075") ? false : (stryCov_9fa48("55075", "55076"), (stryMutAct_9fa48("55077") ? hostname : (stryCov_9fa48("55077"), !hostname)) || (stryMutAct_9fa48("55078") ? Number.isFinite(restPort) : (stryCov_9fa48("55078"), !Number.isFinite(restPort))))) || (stryMutAct_9fa48("55081") ? restPort > NUM.ZERO : stryMutAct_9fa48("55080") ? restPort < NUM.ZERO : stryMutAct_9fa48("55079") ? false : (stryCov_9fa48("55079", "55080", "55081"), restPort <= NUM.ZERO)))) {
      if (stryMutAct_9fa48("55082")) {
        {}
      } else {
        stryCov_9fa48("55082");
        return null;
      }
    }
    const wsPort = stryMutAct_9fa48("55083") ? restPort - ENTRYPOINT_DEFAULT.WS_PORT_OFFSET : (stryCov_9fa48("55083"), restPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET);
    return (stryMutAct_9fa48("55084") ? `` : (stryCov_9fa48("55084"), `${PROTOCOL.WS}${hostname}`)) + (stryMutAct_9fa48("55085") ? `` : (stryCov_9fa48("55085"), `${ADDRESS.PORT_SEPARATOR}${wsPort}`));
  }
}
const TRANSPORT_EVENT = Object.freeze(stryMutAct_9fa48("55086") ? {} : (stryCov_9fa48("55086"), {
  INITIALIZED: stryMutAct_9fa48("55087") ? "" : (stryCov_9fa48("55087"), 'initialized'),
  CONNECTION: stryMutAct_9fa48("55088") ? "" : (stryCov_9fa48("55088"), 'connection'),
  LISTENING: stryMutAct_9fa48("55089") ? "" : (stryCov_9fa48("55089"), 'listening'),
  ERROR: stryMutAct_9fa48("55090") ? "" : (stryCov_9fa48("55090"), 'error'),
  MESSAGE: stryMutAct_9fa48("55091") ? "" : (stryCov_9fa48("55091"), 'message'),
  CLOSE: stryMutAct_9fa48("55092") ? "" : (stryCov_9fa48("55092"), 'close'),
  OPEN: stryMutAct_9fa48("55093") ? "" : (stryCov_9fa48("55093"), 'open'),
  CONNECTION_ESTABLISHED: stryMutAct_9fa48("55094") ? "" : (stryCov_9fa48("55094"), 'connectionEstablished'),
  CONNECTION_CLOSED: stryMutAct_9fa48("55095") ? "" : (stryCov_9fa48("55095"), 'connectionClosed'),
  NODE_CONNECTED: stryMutAct_9fa48("55096") ? "" : (stryCov_9fa48("55096"), 'nodeConnected'),
  NODE_IDENTIFIED: stryMutAct_9fa48("55097") ? "" : (stryCov_9fa48("55097"), 'nodeIdentified'),
  PEER_IDENTIFIED: stryMutAct_9fa48("55098") ? "" : (stryCov_9fa48("55098"), 'peerIdentified'),
  SELF_DISCONNECT: stryMutAct_9fa48("55099") ? "" : (stryCov_9fa48("55099"), 'selfDisconnect'),
  TIMEOUT: stryMutAct_9fa48("55100") ? "" : (stryCov_9fa48("55100"), 'timeout'),
  RESPONSE: stryMutAct_9fa48("55101") ? "" : (stryCov_9fa48("55101"), 'response'),
  SHUTDOWN: stryMutAct_9fa48("55102") ? "" : (stryCov_9fa48("55102"), 'shutdown')
}));
const TRANSPORT_SUBSYSTEM = Object.freeze(stryMutAct_9fa48("55103") ? {} : (stryCov_9fa48("55103"), {
  ROUTER: stryMutAct_9fa48("55104") ? "" : (stryCov_9fa48("55104"), 'message-router'),
  WEBSOCKET: stryMutAct_9fa48("55105") ? "" : (stryCov_9fa48("55105"), 'websocket-transport'),
  RPC: stryMutAct_9fa48("55106") ? "" : (stryCov_9fa48("55106"), 'rpc-client')
}));
const ROUTER_VALID_ENTITY_TYPES = Object.freeze(stryMutAct_9fa48("55107") ? [] : (stryCov_9fa48("55107"), [ENTITY_TYPE.MESSAGE_GROUP, ENTITY_TYPE.PARTITION, ENTITY_TYPE.LIFECYCLE, ENTITY_TYPE.SERVICE, ENTITY_TYPE.BOOTSTRAP]));
const ROUTER_EXPECTED_ENTITY_TYPES = Object.freeze(stryMutAct_9fa48("55108") ? [] : (stryCov_9fa48("55108"), [ENTITY_TYPE.MESSAGE_GROUP, ENTITY_TYPE.PARTITION, ENTITY_TYPE.LIFECYCLE, ENTITY_TYPE.SERVICE, ENTITY_TYPE.BOOTSTRAP]));
const ROUTER_ADDRESS = Object.freeze(stryMutAct_9fa48("55109") ? {} : (stryCov_9fa48("55109"), {
  SEPARATOR: ADDRESS.SEPARATOR,
  SERVICE_ID: stryMutAct_9fa48("55110") ? "" : (stryCov_9fa48("55110"), 'router'),
  buildSourceAddress: stryMutAct_9fa48("55111") ? () => undefined : (stryCov_9fa48("55111"), nodeId => stryMutAct_9fa48("55112") ? `` : (stryCov_9fa48("55112"), `${nodeId}${ADDRESS.SEPARATOR}${ROUTER_ADDRESS.SERVICE_ID}`))
}));
const TRANSPORT_ERROR_MSG = Object.freeze(stryMutAct_9fa48("55113") ? {} : (stryCov_9fa48("55113"), {
  HANDLER_MUST_BE_FUNCTION: stryMutAct_9fa48("55114") ? "" : (stryCov_9fa48("55114"), 'Handler must be a function'),
  MESSAGE_NOT_ACKNOWLEDGED: stryMutAct_9fa48("55115") ? "" : (stryCov_9fa48("55115"), 'Message not acknowledged'),
  MESSAGE_TIMEOUT: stryMutAct_9fa48("55116") ? "" : (stryCov_9fa48("55116"), 'Message timeout')
}));
const ROUTER_LOG_MSG = Object.freeze(stryMutAct_9fa48("55117") ? {} : (stryCov_9fa48("55117"), {
  INITIALIZING: stryMutAct_9fa48("55118") ? "" : (stryCov_9fa48("55118"), 'Initializing MessageRouter'),
  INVALID_ADDRESS: stryMutAct_9fa48("55119") ? "" : (stryCov_9fa48("55119"), 'Invalid target address'),
  SENDING_MESSAGE: stryMutAct_9fa48("55120") ? "" : (stryCov_9fa48("55120"), 'Sending message'),
  SELF_CONNECTION_FAILED: stryMutAct_9fa48("55121") ? "" : (stryCov_9fa48("55121"), 'Failed to establish self-connection'),
  WS_SERVER_LISTENING: stryMutAct_9fa48("55122") ? "" : (stryCov_9fa48("55122"), 'MessageRouter WebSocket server listening'),
  WS_SERVER_ERROR: stryMutAct_9fa48("55123") ? "" : (stryCov_9fa48("55123"), 'MessageRouter WebSocket server error'),
  INCOMING_CONNECTION: stryMutAct_9fa48("55124") ? "" : (stryCov_9fa48("55124"), 'Incoming WebSocket connection'),
  WS_CONNECTION_ERROR: stryMutAct_9fa48("55125") ? "" : (stryCov_9fa48("55125"), 'WebSocket connection error'),
  SELF_CONNECTION_START: stryMutAct_9fa48("55126") ? "" : (stryCov_9fa48("55126"), 'Establishing self-connection'),
  ALREADY_CONNECTED: stryMutAct_9fa48("55127") ? "" : (stryCov_9fa48("55127"), 'Already connected to node'),
  CONNECTING: stryMutAct_9fa48("55128") ? "" : (stryCov_9fa48("55128"), 'Connecting to node'),
  CONNECTED: stryMutAct_9fa48("55129") ? "" : (stryCov_9fa48("55129"), 'Connected to node'),
  WS_ERROR: stryMutAct_9fa48("55130") ? "" : (stryCov_9fa48("55130"), 'WebSocket error'),
  MESSAGE_RECEIVED: stryMutAct_9fa48("55131") ? "" : (stryCov_9fa48("55131"), 'Received message'),
  MESSAGE_UNKNOWN: stryMutAct_9fa48("55132") ? "" : (stryCov_9fa48("55132"), 'Unknown message type'),
  MESSAGE_PARSE_FAILED: stryMutAct_9fa48("55133") ? "" : (stryCov_9fa48("55133"), 'Failed to parse message'),
  IDENTIFICATION_MISSING_FIELDS: stryMutAct_9fa48("55134") ? "" : (stryCov_9fa48("55134"), 'Identification missing required fields'),
  FAILED_CLOSE_UNIDENTIFIED: stryMutAct_9fa48("55135") ? "" : (stryCov_9fa48("55135"), 'Failed to close unidentified connection'),
  IDENTIFICATION_RECEIVED: stryMutAct_9fa48("55136") ? "" : (stryCov_9fa48("55136"), 'Received identification from remote node'),
  FAILED_TERMINATE_EXISTING: stryMutAct_9fa48("55137") ? "" : (stryCov_9fa48("55137"), 'Failed to terminate existing connection'),
  REKEYED_CONNECTION: stryMutAct_9fa48("55138") ? "" : (stryCov_9fa48("55138"), 'Re-keyed incoming connection to node ID'),
  KEEP_ORIGINAL_CONNECTION: stryMutAct_9fa48("55139") ? "" : (stryCov_9fa48("55139"), 'Keeping incoming connection under original ID'),
  SELF_CONNECTION_ALREADY_REGISTERED: stryMutAct_9fa48("55140") ? "" : (stryCov_9fa48("55140"), 'self-connection already registered'),
  SERVICE_MESSAGE_HANDLING: stryMutAct_9fa48("55141") ? "" : (stryCov_9fa48("55141"), 'Handling service message'),
  SERVICE_RESPONSE_RECEIVED: stryMutAct_9fa48("55142") ? "" : (stryCov_9fa48("55142"), 'Received service response'),
  SERVICE_RESPONSE_NO_PENDING: stryMutAct_9fa48("55143") ? "" : (stryCov_9fa48("55143"), 'No pending service response request'),
  SERVICE_RESPONSE_ERROR: stryMutAct_9fa48("55144") ? "" : (stryCov_9fa48("55144"), 'Service response indicated error'),
  SERVICE_RESPONSE_SENT: stryMutAct_9fa48("55145") ? "" : (stryCov_9fa48("55145"), 'Service response sent'),
  MESSAGE_NOT_ACKED: stryMutAct_9fa48("55146") ? "" : (stryCov_9fa48("55146"), 'Message not acknowledged'),
  CONNECTION_CLOSED: stryMutAct_9fa48("55147") ? "" : (stryCov_9fa48("55147"), 'Connection closed'),
  SELF_CONNECTION_LOST: stryMutAct_9fa48("55148") ? "" : (stryCov_9fa48("55148"), 'Self-connection lost - fatal error'),
  NO_SELF_CONNECTION: stryMutAct_9fa48("55149") ? "" : (stryCov_9fa48("55149"), 'No self-connection available for local delivery'),
  MAX_RECONNECTS_REACHED: stryMutAct_9fa48("55150") ? "" : (stryCov_9fa48("55150"), 'Max reconnection attempts reached'),
  SCHEDULING_RECONNECT: stryMutAct_9fa48("55151") ? "" : (stryCov_9fa48("55151"), 'Scheduling reconnection'),
  RECONNECT_FAILED: stryMutAct_9fa48("55152") ? "" : (stryCov_9fa48("55152"), 'Reconnection failed'),
  HANDLER_REGISTERED: stryMutAct_9fa48("55153") ? "" : (stryCov_9fa48("55153"), 'Registered handler'),
  HANDLER_UNREGISTERED: stryMutAct_9fa48("55154") ? "" : (stryCov_9fa48("55154"), 'Unregistered handler'),
  NO_TARGET_CONNECTION: stryMutAct_9fa48("55155") ? "" : (stryCov_9fa48("55155"), 'No connection to target node for message delivery'),
  SHUTTING_DOWN: stryMutAct_9fa48("55156") ? "" : (stryCov_9fa48("55156"), 'Shutting down MessageRouter'),
  TRANSPORT_REGISTRY_SET: stryMutAct_9fa48("55157") ? "" : (stryCov_9fa48("55157"), 'TransportRegistry configured for MessageRouter'),
  TRANSPORT_DELIVERY_START: stryMutAct_9fa48("55158") ? "" : (stryCov_9fa48("55158"), 'Starting transport-based delivery'),
  TRANSPORT_ENDPOINT_SELECTED: stryMutAct_9fa48("55159") ? "" : (stryCov_9fa48("55159"), 'Selected endpoint for delivery'),
  TRANSPORT_DELIVERY_SUCCESS: stryMutAct_9fa48("55160") ? "" : (stryCov_9fa48("55160"), 'Transport delivery succeeded'),
  TRANSPORT_DELIVERY_FAILED: stryMutAct_9fa48("55161") ? "" : (stryCov_9fa48("55161"), 'Transport delivery failed, trying fallback'),
  TRANSPORT_ALL_FAILED: stryMutAct_9fa48("55162") ? "" : (stryCov_9fa48("55162"), 'All transport endpoints failed'),
  TRANSPORT_NO_ENDPOINTS: stryMutAct_9fa48("55163") ? "" : (stryCov_9fa48("55163"), 'No endpoints available for node'),
  TRANSPORT_FALLBACK_WS: stryMutAct_9fa48("55164") ? "" : (stryCov_9fa48("55164"), 'Falling back to WebSocket delivery'),
  JOIN_REQUEST_RECEIVED: stryMutAct_9fa48("55165") ? "" : (stryCov_9fa48("55165"), 'Join request received'),
  JOIN_RESPONSE_SENT: stryMutAct_9fa48("55166") ? "" : (stryCov_9fa48("55166"), 'Join response sent'),
  JOIN_REQUEST_FAILED: stryMutAct_9fa48("55167") ? "" : (stryCov_9fa48("55167"), 'Failed to process join request'),
  JOIN_COMPLETE_RECEIVED: stryMutAct_9fa48("55168") ? "" : (stryCov_9fa48("55168"), 'Join complete received'),
  JOIN_COMPLETE_ACK_SENT: stryMutAct_9fa48("55169") ? "" : (stryCov_9fa48("55169"), 'Join complete acknowledgment sent'),
  JOIN_COMPLETE_FAILED: stryMutAct_9fa48("55170") ? "" : (stryCov_9fa48("55170"), 'Failed to process join complete message'),
  RAFT_DIRECT_DELIVERY: stryMutAct_9fa48("55171") ? "" : (stryCov_9fa48("55171"), 'Delivering raft packet directly'),
  RAFT_DIRECT_DELIVERY_FAILED: stryMutAct_9fa48("55172") ? "" : (stryCov_9fa48("55172"), 'Failed to deliver raft packet directly')
}));
const ROUTER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("55173") ? {} : (stryCov_9fa48("55173"), {
  invalidAddressFormat: stryMutAct_9fa48("55174") ? () => undefined : (stryCov_9fa48("55174"), address => (stryMutAct_9fa48("55175") ? `` : (stryCov_9fa48("55175"), `Invalid address format: ${address}. `)) + (stryMutAct_9fa48("55176") ? "" : (stryCov_9fa48("55176"), 'Expected format: nodeId/entityType/entityId where entityType is one of: ')) + (stryMutAct_9fa48("55177") ? `` : (stryCov_9fa48("55177"), `${ROUTER_EXPECTED_ENTITY_TYPES.join(stryMutAct_9fa48("55178") ? "" : (stryCov_9fa48("55178"), ', '))}`))),
  noConnectionToNode: stryMutAct_9fa48("55179") ? () => undefined : (stryCov_9fa48("55179"), nodeId => stryMutAct_9fa48("55180") ? `` : (stryCov_9fa48("55180"), `No connection to node ${nodeId}`)),
  connectionClosed: stryMutAct_9fa48("55181") ? () => undefined : (stryCov_9fa48("55181"), nodeId => stryMutAct_9fa48("55182") ? `` : (stryCov_9fa48("55182"), `Connection to node ${nodeId} closed`)),
  selfConnectionFailed: stryMutAct_9fa48("55183") ? () => undefined : (stryCov_9fa48("55183"), message => stryMutAct_9fa48("55184") ? `` : (stryCov_9fa48("55184"), `Self-connection failed: ${message}`)),
  noHandlerForAddress: stryMutAct_9fa48("55185") ? () => undefined : (stryCov_9fa48("55185"), address => stryMutAct_9fa48("55186") ? `` : (stryCov_9fa48("55186"), `No handler registered for address ${address}`)),
  QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED: stryMutAct_9fa48("55187") ? "" : (stryCov_9fa48("55187"), 'Query/data-plane message-group transport is not configured'),
  PENDING_RESPONSE_TIMEOUT: stryMutAct_9fa48("55188") ? "" : (stryCov_9fa48("55188"), 'Pending response timeout'),
  SHUTDOWN: stryMutAct_9fa48("55189") ? "" : (stryCov_9fa48("55189"), 'Router shutdown'),
  ALL_TRANSPORTS_FAILED: stryMutAct_9fa48("55190") ? "" : (stryCov_9fa48("55190"), 'All transport endpoints failed'),
  NO_ENDPOINTS_FOR_NODE: stryMutAct_9fa48("55191") ? "" : (stryCov_9fa48("55191"), 'No endpoints available for node'),
  noEndpointsForNode: stryMutAct_9fa48("55192") ? () => undefined : (stryCov_9fa48("55192"), nodeId => stryMutAct_9fa48("55193") ? `` : (stryCov_9fa48("55193"), `No endpoints available for node ${nodeId}`)),
  outboundQueueBackpressured: stryMutAct_9fa48("55194") ? () => undefined : (stryCov_9fa48("55194"), (nodeId, maxPending) => (stryMutAct_9fa48("55195") ? `` : (stryCov_9fa48("55195"), `Outbound queue for node ${nodeId} is saturated `)) + (stryMutAct_9fa48("55196") ? `` : (stryCov_9fa48("55196"), `(maxPending=${maxPending})`)))
}));
const WS_LOG_MSG = Object.freeze(stryMutAct_9fa48("55197") ? {} : (stryCov_9fa48("55197"), {
  INITIALIZING: stryMutAct_9fa48("55198") ? "" : (stryCov_9fa48("55198"), 'Initializing WebSocketTransport'),
  SERVER_LISTENING: stryMutAct_9fa48("55199") ? "" : (stryCov_9fa48("55199"), 'WebSocket server listening'),
  SERVER_ERROR: stryMutAct_9fa48("55200") ? "" : (stryCov_9fa48("55200"), 'WebSocket server error'),
  INCOMING_CONNECTION: stryMutAct_9fa48("55201") ? "" : (stryCov_9fa48("55201"), 'Incoming WebSocket connection'),
  CONNECTION_ERROR: stryMutAct_9fa48("55202") ? "" : (stryCov_9fa48("55202"), 'WebSocket connection error'),
  ALREADY_CONNECTED: stryMutAct_9fa48("55203") ? "" : (stryCov_9fa48("55203"), 'Already connected to peer'),
  CONNECTING: stryMutAct_9fa48("55204") ? "" : (stryCov_9fa48("55204"), 'Connecting to peer'),
  CONNECTED: stryMutAct_9fa48("55205") ? "" : (stryCov_9fa48("55205"), 'Connected to peer'),
  WS_ERROR: stryMutAct_9fa48("55206") ? "" : (stryCov_9fa48("55206"), 'WebSocket error'),
  MESSAGE_RECEIVED: stryMutAct_9fa48("55207") ? "" : (stryCov_9fa48("55207"), 'Received message'),
  MESSAGE_UNKNOWN: stryMutAct_9fa48("55208") ? "" : (stryCov_9fa48("55208"), 'Unknown message type'),
  MESSAGE_PARSE_FAILED: stryMutAct_9fa48("55209") ? "" : (stryCov_9fa48("55209"), 'Failed to parse message'),
  IDENTIFICATION_RECEIVED: stryMutAct_9fa48("55210") ? "" : (stryCov_9fa48("55210"), 'Received identification'),
  MESSAGE_NOT_ACKED: stryMutAct_9fa48("55211") ? "" : (stryCov_9fa48("55211"), 'Message not acknowledged'),
  CONNECTION_CLOSED: stryMutAct_9fa48("55212") ? "" : (stryCov_9fa48("55212"), 'Connection closed'),
  MAX_RECONNECTS_REACHED: stryMutAct_9fa48("55213") ? "" : (stryCov_9fa48("55213"), 'Max reconnection attempts reached'),
  SCHEDULING_RECONNECT: stryMutAct_9fa48("55214") ? "" : (stryCov_9fa48("55214"), 'Scheduling reconnection'),
  RECONNECT_FAILED: stryMutAct_9fa48("55215") ? "" : (stryCov_9fa48("55215"), 'Reconnection failed'),
  HANDLER_REGISTERED: stryMutAct_9fa48("55216") ? "" : (stryCov_9fa48("55216"), 'Registered message handler'),
  NO_TARGET_CONNECTION: stryMutAct_9fa48("55217") ? "" : (stryCov_9fa48("55217"), 'No connection to target node'),
  SHUTTING_DOWN: stryMutAct_9fa48("55218") ? "" : (stryCov_9fa48("55218"), 'Shutting down WebSocketTransport')
}));
const WS_ERROR_MSG = Object.freeze(stryMutAct_9fa48("55219") ? {} : (stryCov_9fa48("55219"), {
  NO_CONNECTION: stryMutAct_9fa48("55220") ? "" : (stryCov_9fa48("55220"), 'No connection to target node'),
  SHUTDOWN: stryMutAct_9fa48("55221") ? "" : (stryCov_9fa48("55221"), 'Transport shutdown')
}));
const RPC_LOG_MSG = Object.freeze(stryMutAct_9fa48("55222") ? {} : (stryCov_9fa48("55222"), {
  CALL_INITIATED: stryMutAct_9fa48("55223") ? "" : (stryCov_9fa48("55223"), 'RPC call initiated'),
  TIMEOUT: stryMutAct_9fa48("55224") ? "" : (stryCov_9fa48("55224"), 'RPC timeout'),
  SEND_FAILED: stryMutAct_9fa48("55225") ? "" : (stryCov_9fa48("55225"), 'RPC send failed'),
  NO_PENDING: stryMutAct_9fa48("55226") ? "" : (stryCov_9fa48("55226"), 'No pending request for correlation ID'),
  RESPONSE_RECEIVED: stryMutAct_9fa48("55227") ? "" : (stryCov_9fa48("55227"), 'RPC response received'),
  REQUEST_CANCELLED: stryMutAct_9fa48("55228") ? "" : (stryCov_9fa48("55228"), 'RPC request cancelled'),
  SHUTTING_DOWN: stryMutAct_9fa48("55229") ? "" : (stryCov_9fa48("55229"), 'Shutting down RPC client')
}));
const RPC_ERROR_MSG = Object.freeze(stryMutAct_9fa48("55230") ? {} : (stryCov_9fa48("55230"), {
  NO_MESSAGE_GROUP: stryMutAct_9fa48("55231") ? "" : (stryCov_9fa48("55231"), 'RPCClient: No message group service configured'),
  timeout: stryMutAct_9fa48("55232") ? () => undefined : (stryCov_9fa48("55232"), timeoutMs => stryMutAct_9fa48("55233") ? `` : (stryCov_9fa48("55233"), `RPC timeout after ${timeoutMs}ms`)),
  cancelled: stryMutAct_9fa48("55234") ? () => undefined : (stryCov_9fa48("55234"), reason => stryMutAct_9fa48("55235") ? `` : (stryCov_9fa48("55235"), `RPC cancelled: ${reason}`)),
  SHUTDOWN: stryMutAct_9fa48("55236") ? "" : (stryCov_9fa48("55236"), 'RPC client shutdown')
}));
const RPC_DEFAULT = Object.freeze(stryMutAct_9fa48("55237") ? {} : (stryCov_9fa48("55237"), {
  TIMEOUT_MS: TRANSPORT_DEFAULT.RPC_TIMEOUT_MS,
  CANCEL_REASON: stryMutAct_9fa48("55238") ? "" : (stryCov_9fa48("55238"), 'Cancelled')
}));
const TRANSPORT_TYPEOF = Object.freeze(stryMutAct_9fa48("55239") ? {} : (stryCov_9fa48("55239"), {
  FUNCTION: TYPEOF.FUNCTION,
  OBJECT: TYPEOF.OBJECT,
  STRING: TYPEOF.STRING
}));
const TRANSPORT_NUM = Object.freeze(stryMutAct_9fa48("55240") ? {} : (stryCov_9fa48("55240"), {
  ZERO: NUM.ZERO,
  ONE: NUM.ONE,
  TWO: NUM.TWO,
  THREE: NUM.THREE,
  FOUR: NUM.FOUR,
  FIVE: NUM.FIVE,
  SIX: NUM.SIX
}));
const TRANSPORT_METRIC = Object.freeze(stryMutAct_9fa48("55241") ? {} : (stryCov_9fa48("55241"), {
  DELIVER_SUCCESS_SAMPLE_EVERY: NUM.TWO_HUNDRED_FIFTY_SIX,
  DELIVER_FAULT_SAMPLE_EVERY: NUM.TWO_HUNDRED_FIFTY_SIX,
  DELIVER_SLOW_THRESHOLD_MS: 25,
  DELIVER_QUEUE_BACKPRESSURE_THRESHOLD: NUM.THIRTY,
  DELIVER_QUEUE_CHANGE_THRESHOLD: NUM.SIXTEEN
}));
const TRANSPORT_METRIC_TRIGGER = Object.freeze(stryMutAct_9fa48("55242") ? {} : (stryCov_9fa48("55242"), {
  SAMPLE: stryMutAct_9fa48("55243") ? "" : (stryCov_9fa48("55243"), 'sample'),
  SLOW: stryMutAct_9fa48("55244") ? "" : (stryCov_9fa48("55244"), 'slow'),
  BACKPRESSURE: stryMutAct_9fa48("55245") ? "" : (stryCov_9fa48("55245"), 'backpressure'),
  QUEUE_DRAINED: stryMutAct_9fa48("55246") ? "" : (stryCov_9fa48("55246"), 'queue_drained'),
  FAULT: stryMutAct_9fa48("55247") ? "" : (stryCov_9fa48("55247"), 'fault')
}));
export { CONNECTION_STATE, OUTBOUND_DELIVERY_PRIORITY, ROUTER_MESSAGE_TYPE, ROUTER_VALID_ENTITY_TYPES, ROUTER_EXPECTED_ENTITY_TYPES, ROUTER_ADDRESS, ROUTER_LOG_MSG, ROUTER_ERROR_MSG, TRANSPORT_CONFIG_KEY, TRANSPORT_DEFAULT, TRANSPORT_EVENT, TRANSPORT_FORMAT, TRANSPORT_METRIC, TRANSPORT_METRIC_TRIGGER, TRANSPORT_ERROR_MSG, TRANSPORT_NUM, TRANSPORT_STRING, TRANSPORT_SUBSYSTEM, TRANSPORT_TYPEOF, WS_LOG_MSG, WS_ERROR_MSG, WS_MESSAGE_TYPE, RPC_DEFAULT, RPC_LOG_MSG, RPC_ERROR_MSG, normalizeToWebSocketAddress };