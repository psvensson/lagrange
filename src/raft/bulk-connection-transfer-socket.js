// Bulk-connection / transfer-socket adapter (quest raft-snapshot-live-rebuild,
// spec solve/specs/raft-snapshot-transfer-install/live-rebuild-design.md,
// S6 Phase A link 5). The S3 bulk connection API and the S3 transfer socket
// contract do not compose on their own: the transfer driver loops speak
// `.on('message'|'close')/.send()` while the bulk connection exposes
// onMessage/sendControl/sendChunkFrame. This adapter closes that gap WITHOUT
// voiding the S3 lane property — every binary chunk frame is routed through
// `connection.sendChunkFrame`, so the sender-side token bucket and the
// bounded pending-send cap stay authoritative. Verifier MUST-CHANGE holes
// closed here: any non-SENT chunk outcome (PENDING_LIMIT silent drop,
// CLOSED, CANCELLED) is treated as FATAL — the connection is closed and a
// local close is emitted so both drivers abort typed instead of hanging
// forever (drivers have no timeouts). Order safety: the protocol is strict
// lockstep (one chunk queued at a time; the only control frame that can
// overtake a queued chunk is a terminal ABORT, which is safe), so routing
// control frames via sendControl and chunks via the serialized
// sendChunkFrame chain preserves effective order.

import {
  BULK_CHANNEL_SEND_OUTCOME,
} from '../transport/bulk-transfer-channel.js';

const TRANSFER_SOCKET_EVENT = Object.freeze({
  MESSAGE: 'message',
  CLOSE: 'close',
});
const TRANSFER_SOCKET_TYPEOF = Object.freeze({
  STRING: 'string',
});

/**
 * Wrap one bulk transfer connection as a transfer-driver socket
 * (`.on('message'|'close')/.send()`). Frames arriving before the first
 * message listener registers are buffered and replayed in order (the offer
 * router's peek-then-replay handoff rides this same buffer via
 * options.replayFrames).
 * @param {Object} connection bulk transfer connection
 *   (createBulkTransferConnection API: onMessage/offMessage/onClose/
 *   sendControl/sendChunkFrame/close)
 * @param {Object} [options] adapter options
 * @param {Array<{data: *, isBinary: boolean}>} [options.replayFrames] frames
 *   already consumed off the connection (e.g. the peeked OFFER) to replay to
 *   the first message listener before any live frame
 * @return {Object} frozen socket-like ({on, send, close})
 */
function bulkConnectionTransferSocket(connection, options = {}) {
  const pendingFrames = [...(options.replayFrames || [])];
  const messageListeners = [];
  const closeListeners = [];
  let closed = false;

  const deliver = (data, isBinary) => {
    if (messageListeners.length === 0) {
      pendingFrames.push(Object.freeze({data, isBinary}));
      return;
    }
    for (const listener of [...messageListeners]) {
      listener(data, isBinary);
    }
  };

  const emitClose = () => {
    if (closed) {
      return;
    }
    closed = true;
    for (const listener of [...closeListeners]) {
      listener();
    }
  };

  // Any non-SENT chunk outcome is FATAL: close the channel and surface a
  // local close so BOTH driver loops abort typed (never a silent drop).
  const fatalAbort = () => {
    connection.close();
    emitClose();
  };

  connection.onMessage(deliver);
  connection.onClose(emitClose);

  return Object.freeze({
    on(event, listener) {
      if (event === TRANSFER_SOCKET_EVENT.MESSAGE) {
        messageListeners.push(listener);
        while (pendingFrames.length > 0) {
          const frame = pendingFrames.shift();
          for (const registered of [...messageListeners]) {
            registered(frame.data, frame.isBinary);
          }
        }
        return;
      }
      if (event === TRANSFER_SOCKET_EVENT.CLOSE) {
        closeListeners.push(listener);
        if (closed) {
          listener();
        }
      }
    },
    send(payload) {
      // Control frames arrive as encoded JSON text (the driver's
      // encodeControlFrame); sendControl re-encodes an object, so decode
      // once here rather than double-encoding on the wire.
      if (typeof payload === TRANSFER_SOCKET_TYPEOF.STRING) {
        const result = connection.sendControl(JSON.parse(payload));
        if (result.outcome !== BULK_CHANNEL_SEND_OUTCOME.SENT) {
          fatalAbort();
        }
        return;
      }
      void connection.sendChunkFrame(payload).then(
        (result) => {
          if (result.outcome !== BULK_CHANNEL_SEND_OUTCOME.SENT) {
            fatalAbort();
          }
        },
        () => fatalAbort());
    },
    close() {
      connection.close();
      emitClose();
    },
  });
}

export {
  bulkConnectionTransferSocket,
};
