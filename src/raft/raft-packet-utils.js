/**
 * Consensus transport envelope utilities.
 *
 * The cutover has one active wire shape: the semantic raft-rs envelope.
 * Transport may classify that envelope for direct delivery, but it must never
 * recreate or recognize the retired native packet protocol.
 */

import {RAFT_RS_TRANSPORT_PROTOCOL} from './raft-rs-ingress-constants.js';
import {turnChainValue} from './raft-rs-turn-answer.js';

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

/**
 * The SEND_TO_PEER closure of every consensus group (partition, message
 * group, WASM service): the transport's send entry, which carries a raft-rs
 * envelope as the consensus delivery class (no ACK, no answer, no lifetime).
 * @param {Object} transport - The group's MessageRouter.
 * @param {string} peerAddress - The peer replica's router address.
 * @param {Object} envelope - The raft-rs envelope.
 * @return {Promise<Object>} The router's delivery envelope.
 */
function sendRaftEnvelope(transport, peerAddress, envelope) {
  return transport.deliver(peerAddress, envelope);
}

/**
 * The receiver branch of every consensus group: step the envelope into the
 * group's port. Nothing is answered to the sender; a throw is the receiving
 * router's record (message-router-consensus-delivery.js).
 * @param {Object|null} port - The group's raft operation port.
 * @param {Object} envelope - The raft-rs envelope.
 * @return {Promise<null>} Settles once the port took the step.
 */
async function stepRaftEnvelope(port, envelope) {
  if (port) {
    await turnChainValue(port.step(envelope));
  }
  return null;
}

export {
  isRaftRsTransportEnvelope,
  isRaftTransportPayload,
  sendRaftEnvelope,
  stepRaftEnvelope,
};
