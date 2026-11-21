// The consensus delivery class: how a raft-rs envelope travels between the
// routers of two replicas of one consensus group (partition, message group or
// WASM service alike).
//
// The sending router declares the class on the frame (CONSENSUS_ENVELOPE)
// and writes it to the peer node's open connection. Raft re-sends what a peer
// did not receive, so nothing answers the frame: no ACK, no SERVICE_RESPONSE,
// no delivery lifetime, no deadline timer, no pending waiter and no queued or
// reconnecting fallback. The sender's outcome is the router's own fact about
// the write - DELIVERED once the frame is written to the peer's open
// connection (or handed to this router's own dispatch for a same-node peer),
// FAILED when there is no open connection or the write threw - answered at
// once. What the receiving router could not hand to a handler (a malformed
// envelope, no handler at the address, a handler that threw) is recorded at
// the receiver, typed by reason; it is never answered to the sender. One
// shape for a remote and a same-node peer.
import {CONSENSUS_RECEIPT_REFUSAL} from '../constants/transport.js';
import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';
import {
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
} from './transport-error-codes.js';
import {buildDeliveryEnvelope} from './transport-semantic-outcome.js';

const {
  ConnectionState,
  ROUTER_ADDRESS,
  ROUTER_ERROR_MSG,
  ROUTER_LOG_MSG,
  RouterMessageType,
  TRANSPORT_NUM,
  WebSocket,
  isRaftTransportPayload,
} = MESSAGE_ROUTER_SHARED;

// Every written envelope has the same outcome: the router wrote it.
const CONSENSUS_ENVELOPE_WRITTEN = buildDeliveryEnvelope({acknowledged: true});
const NO_ERROR_CODE = null;

function notWritten(error, errorCode) {
  return buildDeliveryEnvelope({acknowledged: false, error, errorCode});
}

function targetNodeOf(router, targetAddress) {
  return router.parseAddress(targetAddress).nodeId ||
    router.resolveServiceNode?.(targetAddress) || null;
}

function openConnectionTo(router, targetNodeId) {
  const connection = router.nodeConnections.get(targetNodeId);
  return connection && connection.state === ConnectionState.CONNECTED &&
    connection.ws && connection.ws.readyState === WebSocket.OPEN ?
    connection : null;
}

/**
 * Send one raft-rs envelope to the replica at `targetAddress`.
 * @param {Object} router - The sending MessageRouter.
 * @param {string} targetAddress - The peer replica's router address.
 * @param {Object} envelope - The raft-rs envelope, carried unchanged.
 * @return {Object} The router's delivery envelope, DELIVERED or FAILED.
 */
function deliverConsensusEnvelope(router, targetAddress, envelope) {
  if (router.isShuttingDown) {
    router.consensusDelivery.notWritten += TRANSPORT_NUM.ONE;
    return notWritten(ROUTER_ERROR_MSG.SHUTDOWN, ROUTER_CONNECTION_CLOSED_ERROR_CODE);
  }
  const targetNodeId = targetNodeOf(router, targetAddress);
  if (!targetNodeId) {
    router.consensusDelivery.notWritten += TRANSPORT_NUM.ONE;
    return notWritten(ROUTER_ERROR_MSG.invalidAddressFormat(targetAddress), NO_ERROR_CODE);
  }
  const frame = {
    type: RouterMessageType.CONSENSUS_ENVELOPE,
    targetAddress,
    sourceNodeId: router.nodeId,
    payload: envelope,
  };
  if (targetNodeId === router.nodeId) {
    router.consensusDelivery.written += TRANSPORT_NUM.ONE;
    router.receiveConsensusEnvelope(frame,
      router.connectionAuthorityOwner?.captureLocalDelivery() ?? null);
    return CONSENSUS_ENVELOPE_WRITTEN;
  }
  const connection = openConnectionTo(router, targetNodeId);
  if (connection === null) {
    router.consensusDelivery.notWritten += TRANSPORT_NUM.ONE;
    return notWritten(ROUTER_ERROR_MSG.noConnectionToNode(targetNodeId),
      ROUTER_NO_CONNECTION_ERROR_CODE);
  }
  try {
    connection.ws.send(JSON.stringify(frame));
  } catch (error) {
    router.consensusDelivery.notWritten += TRANSPORT_NUM.ONE;
    return notWritten(String(error?.message ?? error), ROUTER_CONNECTION_CLOSED_ERROR_CODE);
  }
  router.consensusDelivery.written += TRANSPORT_NUM.ONE;
  return CONSENSUS_ENVELOPE_WRITTEN;
}

function recordReceiptRefusal(router, reason, frame, error = null) {
  const code = typeof error?.code === 'string' && error.code.length > 0 ?
    error.code : null;
  const key = code === null ? reason : `${reason}:${code}`;
  const refusals = router.consensusDelivery.receiptRefusals;
  refusals.set(key, (refusals.get(key) ?? TRANSPORT_NUM.ZERO) + TRANSPORT_NUM.ONE);
  router.logger.debug(ROUTER_LOG_MSG.CONSENSUS_ENVELOPE_REFUSED, {
    reason,
    code,
    targetAddress: frame?.targetAddress ?? null,
    sourceNodeId: frame?.sourceNodeId ?? null,
    error: error === null ? null : String(error?.message ?? error),
  });
}

/**
 * Hand a consensus envelope frame to the handler registered at its target
 * address, answering nothing; record what could not be handed over.
 * @param {Object} router - The receiving MessageRouter.
 * @param {Object} frame - The CONSENSUS_ENVELOPE frame.
 * @param {Object|null} delivery - The connection authority's delivery capture.
 * @return {void}
 */
function receiveConsensusEnvelope(router, frame, delivery = null) {
  const {targetAddress, sourceNodeId, payload} = frame ?? {};
  if (!isRaftTransportPayload(payload)) {
    recordReceiptRefusal(router, CONSENSUS_RECEIPT_REFUSAL.MALFORMED_ENVELOPE, frame);
    return;
  }
  const handler = router.handlers.get(targetAddress);
  if (!handler) {
    recordReceiptRefusal(router, CONSENSUS_RECEIPT_REFUSAL.NO_HANDLER, frame);
    return;
  }
  const envelope = {
    sourceAddress: ROUTER_ADDRESS.buildSourceAddress(sourceNodeId),
    sourceNodeId,
    targetAddress,
    payload,
  };
  Promise.resolve()
    .then(() => handler(envelope, delivery))
    .then(undefined, (error) => recordReceiptRefusal(router,
      CONSENSUS_RECEIPT_REFUSAL.HANDLER_FAILED, frame, error));
}

/**
 * The consensus class's own counts: envelopes written and not written by
 * this router as a sender, and the receipts it refused as a receiver.
 * @param {Object} router - The MessageRouter.
 * @return {Object} Frozen counts.
 */
function consensusDeliveryStats(router) {
  const {written, notWritten: failed, receiptRefusals} = router.consensusDelivery;
  return Object.freeze({
    written,
    notWritten: failed,
    receiptRefusals: Object.freeze(Object.fromEntries(
      [...receiptRefusals.entries()].sort(([left], [right]) =>
        left.localeCompare(right)))),
  });
}

function createConsensusDeliveryRecord() {
  return {written: TRANSPORT_NUM.ZERO, notWritten: TRANSPORT_NUM.ZERO,
    receiptRefusals: new Map()};
}

export {
  consensusDeliveryStats,
  createConsensusDeliveryRecord,
  deliverConsensusEnvelope,
  receiveConsensusEnvelope,
};
