import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';

const {TRANSPORT_NUM} = MESSAGE_ROUTER_SHARED;

/**
 * The one shape of a router's peer connection record. Every way a record is
 * created starts here - an outbound dial (connectToNode), an accepted inbound
 * socket (handleIncomingConnection), the reconnect owner armed after a failed
 * connect, and the replacement of a quarantined connection - so the reconnect
 * schedule, the ACK-timeout streak and the keepalive read initialized fields
 * whichever end dialed. An adopted inbound record becomes its peer's reconnect
 * owner when it closes; created without its attempt count, its schedule was
 * NaN (finding F-2 of the raft frame delivery record). A record is current until
 * retireConnection marks it (every reader treats the absent mark as current).
 * @param {Object} fields - The creating path's own fields: at least
 *   connectionId, state and createdAt; any field below may be given.
 * @return {Object} A new connection record.
 */
function createPeerConnectionRecord(fields) {
  return {
    nodeId: null,
    address: null,
    configuredAddress: null,
    observedAddress: null,
    ws: null,
    reconnectAttempts: TRANSPORT_NUM.ZERO,
    reconnectTimeout: null,
    reconnectDueAt: null,
    pingInterval: null,
    missedPings: TRANSPORT_NUM.ZERO,
    isIncoming: false,
    isSelfConnection: false,
    bootIncarnation: TRANSPORT_NUM.ZERO,
    ackTimeoutStreak: TRANSPORT_NUM.ZERO,
    lastAckAt: null,
    lastAckTimeoutAt: null,
    ...fields,
  };
}

export {createPeerConnectionRecord};
