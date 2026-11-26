// The consensus delivery class: how raft-rs envelopes travel between the
// routers of two replicas of consensus groups (partition, message group or
// WASM service alike).
//
// The sending router declares the class on the frame (CONSENSUS_ENVELOPE) and
// batches envelopes for one directed peer pair over the current event-loop
// turn (`queueMicrotaskFn`). Raft re-sends what a peer did not receive, so
// nothing answers the frame: no ACK, no SERVICE_RESPONSE, no delivery
// lifetime, no deadline timer, no pending waiter and no queued or
// reconnecting fallback.
//
// Byte accounting per directed pair includes pending application batches for
// that peer, the socket's buffered bytes (`ws.bufferedAmount`) and the new
// encoded batch, bounded both per peer (`consensusMaxPeerBufferedBytes`) and
// across all peers on the router (`consensusMaxTotalBufferedBytes`). At either
// bound the unsent envelope or batch is refused with a named reason, counted
// in `consensusDelivery.sendRefusals`, its resources released and the failure
// reported to Raft. Pending batches are bound to the connection incarnation:
// closing or replacing a connection settles and drops the old connection's
// pending batch rather than replaying it through a successor socket. Local
// delivery outcomes settle truthfully when written to the socket (or refused).
import {
  CONSENSUS_RECEIPT_REFUSAL,
  CONSENSUS_SEND_REFUSAL,
} from '../constants/transport.js';
import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';
import {
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
} from './transport-error-codes.js';
import {observeConsensusSendReturned} from './message-router-socket-evidence.js';
import {buildDeliveryEnvelope} from './transport-semantic-outcome.js';

const {
  ConnectionState,
  ROUTER_ADDRESS,
  ROUTER_ERROR_MSG,
  ROUTER_LOG_MSG,
  RouterMessageType,
  TRANSPORT_NUM,
  TRANSPORT_TYPEOF,
  WebSocket,
  isRaftTransportPayload,
  queueMicrotaskFn,
} = MESSAGE_ROUTER_SHARED;

// Every written envelope has the same outcome: the router wrote it.
const CONSENSUS_ENVELOPE_WRITTEN = buildDeliveryEnvelope({acknowledged: true});
const NO_ERROR_CODE = null;
const COMPUTED_REASON_CODE = null;
// A refusal is counted under its reason, or under reason:code when the
// handler's throw named a code.
const REFUSAL_KEY_SEPARATOR = ':';

function notWritten(error, errorCode, reasonCode = COMPUTED_REASON_CODE) {
  return buildDeliveryEnvelope({
    acknowledged: false,
    deferRetry: false,
    error,
    errorCode,
    ...(reasonCode === COMPUTED_REASON_CODE ? {} : {reasonCode}),
  });
}

function targetNodeOf(router, targetAddress) {
  return router.parseAddress(targetAddress).nodeId ||
    router.resolveServiceNode?.(targetAddress) || null;
}

function openConnectionTo(router, targetNodeId) {
  const connection = router.nodeConnections.get(targetNodeId);
  return connection && connection.retired !== true &&
    connection.state === ConnectionState.CONNECTED &&
    connection.ws && connection.ws.readyState === WebSocket.OPEN ?
    connection : null;
}

function buildConsensusBatchFrame(sourceNodeId, envelopes) {
  return {
    type: RouterMessageType.CONSENSUS_ENVELOPE,
    sourceNodeId,
    envelopes,
  };
}

// The last field of the canonical frame is its envelopes array. Keep the
// encoded wrapper and fill it with the same JSON fragments admitted below.
const CONSENSUS_FRAME_END = ']}';

function socketBufferedBytes(connection) {
  const amount = connection?.ws?.bufferedAmount;
  return Number.isFinite(amount) && amount > TRANSPORT_NUM.ZERO ?
    amount : TRANSPORT_NUM.ZERO;
}

function totalSocketBufferedBytes(router) {
  let total = TRANSPORT_NUM.ZERO;
  for (const [nodeId] of router.nodeConnections) {
    const connection = openConnectionTo(router, nodeId);
    if (connection !== null) {
      total += socketBufferedBytes(connection);
    }
  }
  return total;
}

function doesBatchMatchConnection(batch, connection) {
  return Boolean(
    connection &&
    connection.retired !== true &&
    connection === batch.connection &&
    connection.ws === batch.ws &&
    (connection.connectionId ?? null) === batch.connectionId,
  );
}

function recordSendRefusal(router, reason, count = TRANSPORT_NUM.ONE, facts = null) {
  router.consensusDelivery.notWritten += count;
  const refusals = router.consensusDelivery.sendRefusals;
  refusals.set(reason, (refusals.get(reason) ?? TRANSPORT_NUM.ZERO) + count);
  if (facts !== null) {
    router.logger.debug(ROUTER_LOG_MSG.CONSENSUS_SEND_REFUSED, {reason, ...facts});
  }
}

function detachPendingBatch(router, batch) {
  if (batch.settled) {
    return false;
  }
  batch.settled = true;
  if (router.consensusDelivery.pendingBatches.get(batch.targetNodeId) === batch) {
    router.consensusDelivery.pendingBatches.delete(batch.targetNodeId);
  }
  router.consensusDelivery.pendingBatchBytes = Math.max(
    TRANSPORT_NUM.ZERO,
    router.consensusDelivery.pendingBatchBytes - batch.byteLength,
  );
  return true;
}

function finishPendingConsensusBatch(router, batch, {
  refusalTag,
  error,
  errorCode,
  reasonCode = COMPUTED_REASON_CODE,
}) {
  if (!detachPendingBatch(router, batch)) {
    return;
  }
  const items = batch.items.splice(TRANSPORT_NUM.ZERO);
  recordSendRefusal(router, refusalTag, items.length, {
    targetNodeId: batch.targetNodeId,
    batchEnvelopes: items.length,
    batchBytes: batch.byteLength,
    error,
  });
  const delivery = notWritten(error, errorCode, reasonCode);
  for (const item of items) {
    item.resolve(delivery);
  }
}

function inspectBatchBeforeFlush(router, batch) {
  const current = router.nodeConnections.get(batch.targetNodeId) ?? null;
  const open = openConnectionTo(router, batch.targetNodeId);
  const peerBuffered = open === null ?
    TRANSPORT_NUM.ZERO :
    socketBufferedBytes(open) + batch.byteLength;
  let aborted = null;
  if (router.isShuttingDown) {
    aborted = {
      refusalTag: CONSENSUS_SEND_REFUSAL.SHUTDOWN,
      error: ROUTER_ERROR_MSG.SHUTDOWN,
      errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
      reasonCode: COMPUTED_REASON_CODE,
    };
  } else if (current !== null && !doesBatchMatchConnection(batch, current)) {
    aborted = {
      refusalTag: CONSENSUS_SEND_REFUSAL.CONNECTION_REPLACED,
      error: ROUTER_ERROR_MSG.consensusConnectionReplaced(batch.targetNodeId),
      errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
      reasonCode: CONSENSUS_SEND_REFUSAL.CONNECTION_REPLACED,
    };
  } else if (open === null || !doesBatchMatchConnection(batch, open)) {
    aborted = {
      refusalTag: CONSENSUS_SEND_REFUSAL.CONNECTION_CLOSED,
      error: ROUTER_ERROR_MSG.connectionClosed(batch.targetNodeId),
      errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
      reasonCode: COMPUTED_REASON_CODE,
    };
  } else if (peerBuffered > router.consensusMaxPeerBufferedBytes) {
    aborted = {
      refusalTag: CONSENSUS_SEND_REFUSAL.PEER_BUFFER_EXCEEDED,
      error: ROUTER_ERROR_MSG.consensusPeerBufferExceeded(
        batch.targetNodeId, peerBuffered, router.consensusMaxPeerBufferedBytes),
      errorCode: OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
      reasonCode: CONSENSUS_SEND_REFUSAL.PEER_BUFFER_EXCEEDED,
    };
  }
  return aborted;
}

function flushPendingConsensusBatch(router, batch) {
  if (batch.settled) {
    return;
  }
  const aborted = inspectBatchBeforeFlush(router, batch);
  if (aborted !== null) {
    finishPendingConsensusBatch(router, batch, aborted);
    return;
  }
  detachPendingBatch(router, batch);
  const items = batch.items.splice(TRANSPORT_NUM.ZERO);
  const entries = items.map((item) => item.encodedEntry).join(',');
  const frame = batch.framePrefix + entries + CONSENSUS_FRAME_END;
  let sendError = null;
  try {
    batch.ws.send(frame);
  } catch (error) {
    sendError = error;
  }
  if (sendError !== null) {
    const message = String(sendError?.message ?? sendError);
    recordSendRefusal(router, CONSENSUS_SEND_REFUSAL.CONNECTION_CLOSED,
      items.length, {targetNodeId: batch.targetNodeId, error: message});
    const failedDelivery = notWritten(message, ROUTER_CONNECTION_CLOSED_ERROR_CODE);
    for (const item of items) {
      item.resolve(failedDelivery);
    }
    return;
  }
  observeConsensusSendReturned(batch.ws, batch.byteLength);
  router.consensusDelivery.written += items.length;
  router.consensusDelivery.framesWritten += TRANSPORT_NUM.ONE;
  for (const item of items) {
    item.resolve(CONSENSUS_ENVELOPE_WRITTEN);
  }
}

function activeBatchForConnection(router, targetNodeId, connection) {
  const existing = router.consensusDelivery.pendingBatches.get(targetNodeId) ?? null;
  if (existing === null) {
    return null;
  }
  if (doesBatchMatchConnection(existing, connection)) {
    return existing;
  }
  finishPendingConsensusBatch(router, existing, {
    refusalTag: CONSENSUS_SEND_REFUSAL.CONNECTION_REPLACED,
    error: ROUTER_ERROR_MSG.consensusConnectionReplaced(targetNodeId),
    errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
    reasonCode: CONSENSUS_SEND_REFUSAL.CONNECTION_REPLACED,
  });
  return null;
}

function inspectBatchBufferBounds(router, targetNodeId, connection, batch, addedBytes) {
  const peerBatchBytes =
    (batch === null ? TRANSPORT_NUM.ZERO : batch.byteLength) + addedBytes;
  const peerBufferedBytes = socketBufferedBytes(connection) + peerBatchBytes;
  const totalBufferedBytes = totalSocketBufferedBytes(router) +
    router.consensusDelivery.pendingBatchBytes + addedBytes;
  let exceeded = null;
  if (peerBufferedBytes > router.consensusMaxPeerBufferedBytes) {
    exceeded = {
      refusalTag: CONSENSUS_SEND_REFUSAL.PEER_BUFFER_EXCEEDED,
      error: ROUTER_ERROR_MSG.consensusPeerBufferExceeded(
        targetNodeId, peerBufferedBytes, router.consensusMaxPeerBufferedBytes),
    };
  } else if (totalBufferedBytes > router.consensusMaxTotalBufferedBytes) {
    exceeded = {
      refusalTag: CONSENSUS_SEND_REFUSAL.TOTAL_BUFFER_EXCEEDED,
      error: ROUTER_ERROR_MSG.consensusTotalBufferExceeded(
        targetNodeId, totalBufferedBytes, router.consensusMaxTotalBufferedBytes),
    };
  }
  return exceeded;
}

function enqueueRemoteConsensusEnvelope(router, targetNodeId, connection, entry) {
  const encodedEntry = JSON.stringify(entry);
  const entryBytes = Buffer.byteLength(encodedEntry);
  let batch = activeBatchForConnection(router, targetNodeId, connection);
  const {frameEncoding} = router.consensusDelivery;
  const addedBytes = entryBytes + (batch === null ?
    frameEncoding.emptyBytes : TRANSPORT_NUM.ONE);
  const bufferRefusal = inspectBatchBufferBounds(
    router, targetNodeId, connection, batch, addedBytes);
  if (bufferRefusal !== null) {
    recordSendRefusal(router, bufferRefusal.refusalTag, TRANSPORT_NUM.ONE, {
      targetNodeId,
      addedBytes,
      error: bufferRefusal.error,
    });
    return notWritten(
      bufferRefusal.error,
      OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
      bufferRefusal.refusalTag,
    );
  }
  if (batch === null) {
    batch = {
      targetNodeId,
      connection,
      connectionId: connection.connectionId ?? null,
      ws: connection.ws,
      framePrefix: frameEncoding.prefix,
      byteLength: TRANSPORT_NUM.ZERO,
      settled: false,
      items: [],
    };
    router.consensusDelivery.pendingBatches.set(targetNodeId, batch);
    queueMicrotaskFn(() => flushPendingConsensusBatch(router, batch));
  }
  batch.byteLength += addedBytes;
  router.consensusDelivery.pendingBatchBytes += addedBytes;
  return new Promise((resolve) => {
    batch.items.push({encodedEntry, resolve});
  });
}

/**
 * Send one raft-rs envelope to the replica at `targetAddress`.
 * @param {Object} router - The sending MessageRouter.
 * @param {string} targetAddress - The peer replica's router address.
 * @param {Object} envelope - The raft-rs envelope, carried unchanged.
 * @return {Object|Promise<Object>} The router's delivery envelope, DELIVERED or FAILED.
 */
function deliverConsensusEnvelope(router, targetAddress, envelope) {
  if (router.isShuttingDown) {
    recordSendRefusal(router, CONSENSUS_SEND_REFUSAL.SHUTDOWN);
    return notWritten(ROUTER_ERROR_MSG.SHUTDOWN, ROUTER_CONNECTION_CLOSED_ERROR_CODE);
  }
  const targetNodeId = targetNodeOf(router, targetAddress);
  if (!targetNodeId) {
    recordSendRefusal(router, CONSENSUS_SEND_REFUSAL.INVALID_ADDRESS);
    return notWritten(ROUTER_ERROR_MSG.invalidAddressFormat(targetAddress), NO_ERROR_CODE);
  }
  const entry = {targetAddress, payload: envelope};
  if (targetNodeId === router.nodeId) {
    router.consensusDelivery.written += TRANSPORT_NUM.ONE;
    router.receiveConsensusEnvelope(
      buildConsensusBatchFrame(router.nodeId, [entry]),
      router.connectionAuthorityOwner?.captureLocalDelivery() ?? null,
    );
    return CONSENSUS_ENVELOPE_WRITTEN;
  }
  const connection = openConnectionTo(router, targetNodeId);
  if (connection === null) {
    recordSendRefusal(router, CONSENSUS_SEND_REFUSAL.NO_CONNECTION);
    return notWritten(ROUTER_ERROR_MSG.noConnectionToNode(targetNodeId),
      ROUTER_NO_CONNECTION_ERROR_CODE);
  }
  return enqueueRemoteConsensusEnvelope(router, targetNodeId, connection, entry);
}

function dropPendingConsensusBatchForConnection(router, connection) {
  const nodeId = connection?.nodeId;
  if (!nodeId) {
    return;
  }
  const batch = router.consensusDelivery.pendingBatches.get(nodeId) ?? null;
  if (batch !== null && batch.connection === connection) {
    finishPendingConsensusBatch(router, batch, {
      refusalTag: CONSENSUS_SEND_REFUSAL.CONNECTION_REPLACED,
      error: ROUTER_ERROR_MSG.consensusConnectionReplaced(nodeId),
      errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
      reasonCode: CONSENSUS_SEND_REFUSAL.CONNECTION_REPLACED,
    });
  }
}

function dropPendingConsensusBatchForClosedNode(router, nodeId, connection = null) {
  const batch = router.consensusDelivery.pendingBatches.get(nodeId) ?? null;
  if (batch !== null && (connection === null || batch.connection === connection)) {
    finishPendingConsensusBatch(router, batch, {
      refusalTag: CONSENSUS_SEND_REFUSAL.CONNECTION_CLOSED,
      error: ROUTER_ERROR_MSG.connectionClosed(nodeId),
      errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
      reasonCode: COMPUTED_REASON_CODE,
    });
  }
}

function dropAllPendingConsensusBatches(router) {
  for (const batch of [...router.consensusDelivery.pendingBatches.values()]) {
    finishPendingConsensusBatch(router, batch, {
      refusalTag: CONSENSUS_SEND_REFUSAL.SHUTDOWN,
      error: ROUTER_ERROR_MSG.SHUTDOWN,
      errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
      reasonCode: COMPUTED_REASON_CODE,
    });
  }
}

// A refusal's error code, when the handler's throw named one.
function refusalCodeOf(error) {
  return typeof error?.code === TRANSPORT_TYPEOF.STRING && error.code.length > 0 ?
    error.code : null;
}

function refusalLogFacts(reason, code, frame, error) {
  return {
    reason,
    code,
    targetAddress: frame?.targetAddress ?? null,
    sourceNodeId: frame?.sourceNodeId ?? null,
    error: error === null ? null : String(error?.message ?? error),
  };
}

function recordReceiptRefusal(router, reason, frame, error = null) {
  const code = refusalCodeOf(error);
  const key = code === null ? reason : `${reason}${REFUSAL_KEY_SEPARATOR}${code}`;
  const refusals = router.consensusDelivery.receiptRefusals;
  refusals.set(key, (refusals.get(key) ?? TRANSPORT_NUM.ZERO) + TRANSPORT_NUM.ONE);
  router.logger.debug(ROUTER_LOG_MSG.CONSENSUS_ENVELOPE_REFUSED,
    refusalLogFacts(reason, code, frame, error));
}

function dispatchSingleConsensusEnvelope(router, sourceNodeId, entry, delivery) {
  const {targetAddress, payload} = entry ?? {};
  const frameFacts = {sourceNodeId, targetAddress};
  if (!isRaftTransportPayload(payload)) {
    recordReceiptRefusal(
      router, CONSENSUS_RECEIPT_REFUSAL.MALFORMED_ENVELOPE, frameFacts);
    return;
  }
  const handler = router.handlers.get(targetAddress);
  if (!handler) {
    recordReceiptRefusal(router, CONSENSUS_RECEIPT_REFUSAL.NO_HANDLER, frameFacts);
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
    .then(undefined, (error) => recordReceiptRefusal(
      router, CONSENSUS_RECEIPT_REFUSAL.HANDLER_FAILED, frameFacts, error));
}

/**
 * Hand a consensus envelope batch frame to the handlers registered at each
 * item's target address in FIFO order, answering nothing; record what could
 * not be handed over.
 * @param {Object} router - The receiving MessageRouter.
 * @param {Object} frame - The CONSENSUS_ENVELOPE frame.
 * @param {Object|null} delivery - The connection authority's delivery capture.
 * @return {void}
 */
function receiveConsensusEnvelope(router, frame, delivery = null) {
  const {sourceNodeId, envelopes} = frame ?? {};
  if (!Array.isArray(envelopes) || envelopes.length === TRANSPORT_NUM.ZERO) {
    recordReceiptRefusal(
      router, CONSENSUS_RECEIPT_REFUSAL.MALFORMED_ENVELOPE, frame);
    return;
  }
  for (const entry of envelopes) {
    dispatchSingleConsensusEnvelope(router, sourceNodeId, entry, delivery);
  }
}

function freezeSortedCountMap(map) {
  return Object.freeze(Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  ));
}

/**
 * The consensus class's own counts: envelopes written and not written by
 * this router as a sender, wire batch frames written, current pending batch
 * occupancy in bytes, sender refusals by reason, and receiver refusals.
 * @param {Object} router - The MessageRouter.
 * @return {Object} Frozen counts.
 */
function consensusDeliveryStats(router) {
  const {
    written,
    notWritten: failed,
    framesWritten,
    pendingBatchBytes,
    sendRefusals,
    receiptRefusals,
  } = router.consensusDelivery;
  return Object.freeze({
    written,
    notWritten: failed,
    framesWritten,
    pendingBatchBytes,
    sendRefusals: freezeSortedCountMap(sendRefusals),
    receiptRefusals: freezeSortedCountMap(receiptRefusals),
  });
}

function createConsensusDeliveryRecord(sourceNodeId) {
  const emptyFrame = JSON.stringify(buildConsensusBatchFrame(sourceNodeId, []));
  return {
    frameEncoding: Object.freeze({
      prefix: emptyFrame.slice(0, -CONSENSUS_FRAME_END.length),
      emptyBytes: Buffer.byteLength(emptyFrame),
    }),
    written: TRANSPORT_NUM.ZERO,
    notWritten: TRANSPORT_NUM.ZERO,
    framesWritten: TRANSPORT_NUM.ZERO,
    pendingBatchBytes: TRANSPORT_NUM.ZERO,
    pendingBatches: new Map(),
    sendRefusals: new Map(),
    receiptRefusals: new Map(),
  };
}

export {
  consensusDeliveryStats,
  createConsensusDeliveryRecord,
  deliverConsensusEnvelope,
  dropAllPendingConsensusBatches,
  dropPendingConsensusBatchForClosedNode,
  dropPendingConsensusBatchForConnection,
  receiveConsensusEnvelope,
};
