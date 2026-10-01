/**
 * Shared Raft packet utilities.
 * Transport routing and the consensus ingress of every hosted replica use
 * them for consistent Raft packet detection without type conversion.
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import {RAFT_PACKET_TYPES} from './constants.js';
import {RAFT_RS_TRANSPORT_PROTOCOL} from './raft-rs-ingress-constants.js';

/**
 * Detect if a payload carries one of the Raft packet type names: 'vote',
 * 'voted', 'append', 'appended'. Transport routing uses it to classify
 * consensus traffic; no hosted replica ingests such a packet.
 * Requirements: 2.1, 2.4, 9.1, 9.3
 * @param {Object} payload - Message payload to check.
 * @return {boolean} True if payload is a Raft packet.
 */
function isRaftPacket(payload) {
  return Boolean(
    payload &&
    typeof payload.type === 'string' &&
    RAFT_PACKET_TYPES.has(payload.type),
  );
}

function isRaftRsTransportEnvelope(payload) {
  return Boolean(
    payload &&
    payload.protocol === RAFT_RS_TRANSPORT_PROTOCOL &&
    typeof payload.groupId === 'string' &&
    payload.groupId.length > 0 &&
    typeof payload.from === 'string' &&
    payload.from.length > 0 &&
    typeof payload.to === 'string' &&
    payload.to.length > 0 &&
    payload.message &&
    typeof payload.message === 'object',
  );
}

function isRaftTransportPayload(payload) {
  return isRaftPacket(payload) || isRaftRsTransportEnvelope(payload);
}

export {
  RAFT_PACKET_TYPES,
  isRaftPacket,
  isRaftRsTransportEnvelope,
  isRaftTransportPayload,
};
