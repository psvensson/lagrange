/**
 * Consensus transport envelope utilities.
 *
 * The cutover has one active wire shape: the semantic raft-rs envelope.
 * Transport may classify that envelope for direct delivery, but it must never
 * recreate or recognize the retired native packet protocol.
 */

import {RAFT_RS_TRANSPORT_PROTOCOL} from './raft-rs-ingress-constants.js';

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
  return isRaftRsTransportEnvelope(payload);
}

export {
  isRaftRsTransportEnvelope,
  isRaftTransportPayload,
};
