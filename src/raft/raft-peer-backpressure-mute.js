/**
 * Per-peer backpressure mute for raft packet delivery (closure records
 * CL-009(ii) / CL-003).
 *
 * Production witness: the seed's raft append fan-out hot-retried per-source
 * outbound backpressure rejections — 6,434 rejected sends to one
 * REPLACE-created learner replica in ~3 minutes — starving the learner's
 * catch-up so it failed voter-ready promotion within its 60s budget and
 * wedging priority control-plane spread recovery (CL-003
 * recovering_in_flight on all five priority partitions).
 *
 * Mechanism: when transport.deliver rejects with
 * ROUTER_OUTBOUND_QUEUE_BACKPRESSURED, the peer's lane is muted for the
 * rejection's retryAfterMs (default 500ms). While muted, BACKGROUND sends
 * (append bulk / learner catch-up) fail fast without touching the router;
 * CRITICAL and READINESS traffic (votes, heartbeat-appends, acks, priority
 * consensus) always attempts, because the router's critical reserve may
 * admit it even while the per-source lane is saturated. Any successful
 * delivery clears the mute.
 *
 * Safety ("never break, only slow"): raft is built on lossy channels — a
 * muted send is indistinguishable from a dropped packet, and liferaft's
 * heartbeat-driven append/append-fail loop regenerates everything within a
 * few heartbeats. Verified send-class analysis: votes, vote replies, append
 * acks, and heartbeat-appends can never resolve to BACKGROUND priority.
 *
 * Mute keys are scope-aware: a 'node'-scoped rejection mutes the whole
 * node's lane (the outbound queue is per node), a 'delivery_source'-scoped
 * rejection mutes only the replica address that saturated.
 */

import {
  OUTBOUND_DELIVERY_PRIORITY,
  TRANSPORT_DEFAULT,
} from '../constants/transport.js';
import {
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
} from '../transport/message-router-shared-vocabulary.js';
import {resolveRaftTransportDeliveryOptions} from './constants.js';

const RAFT_PEER_MUTED_ERROR_MSG =
  'Raft send skipped: peer outbound lane backpressure-muted';
const BACKPRESSURE_SCOPE_NODE = 'node';
const ADDRESS_SEPARATOR = '/';

class RaftPeerBackpressureMute {
  constructor() {
    this.mutedUntilMsByKey = new Map();
  }

  /**
   * @param {string} peerAddress - Unified address {nodeId}/{type}/{id}.
   * @return {string|null} The node-scoped mute key.
   * @private
   */
  resolveNodeKey(peerAddress) {
    const address = String(peerAddress || '');
    const separatorIndex = address.indexOf(ADDRESS_SEPARATOR);
    return separatorIndex > 0 ?
      address.slice(0, separatorIndex) :
      null;
  }

  /**
   * @param {string|null} key
   * @return {number} Remaining milliseconds, 0 when not muted. Expired
   *   entries are cleaned up lazily.
   * @private
   */
  getKeyRemainingMs(key) {
    if (!key) {
      return 0;
    }
    const mutedUntilMs = this.mutedUntilMsByKey.get(key);
    if (!Number.isFinite(mutedUntilMs)) {
      return 0;
    }
    const remainingMs = mutedUntilMs - Date.now();
    if (remainingMs <= 0) {
      this.mutedUntilMsByKey.delete(key);
      return 0;
    }
    return remainingMs;
  }

  /**
   * @param {string} peerAddress
   * @return {number} Remaining mute window across address and node scope.
   */
  getMuteRemainingMs(peerAddress) {
    return Math.max(
      this.getKeyRemainingMs(peerAddress),
      this.getKeyRemainingMs(this.resolveNodeKey(peerAddress)),
    );
  }

  /**
   * Record one router backpressure rejection.
   * @param {string} peerAddress
   * @param {Object} error - Rejection carrying retryAfterMs and
   *   backpressureScope.
   * @return {void}
   */
  recordRejection(peerAddress, error) {
    const retryAfterMs =
      Number.isFinite(error?.retryAfterMs) &&
      error.retryAfterMs > 0 ?
        Math.floor(error.retryAfterMs) :
        TRANSPORT_DEFAULT.OUTBOUND_QUEUE_BACKPRESSURE_RETRY_AFTER_MS;
    const muteKey =
      error?.backpressureScope === BACKPRESSURE_SCOPE_NODE ?
        this.resolveNodeKey(peerAddress) || peerAddress :
        peerAddress;
    this.mutedUntilMsByKey.set(muteKey, Date.now() + retryAfterMs);
  }

  /**
   * A successful delivery proves the lane drains — clear both scopes.
   * @param {string} peerAddress
   * @return {void}
   */
  clearPeer(peerAddress) {
    if (this.mutedUntilMsByKey.size === 0) {
      return;
    }
    this.mutedUntilMsByKey.delete(peerAddress);
    const nodeKey = this.resolveNodeKey(peerAddress);
    if (nodeKey) {
      this.mutedUntilMsByKey.delete(nodeKey);
    }
  }

  /**
   * @param {number} remainingMs
   * @return {Error}
   * @private
   */
  buildMutedError(remainingMs) {
    const error = new Error(RAFT_PEER_MUTED_ERROR_MSG);
    error.code = OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE;
    error.retryAfterMs = remainingMs;
    error.deferRetry = true;
    error.peerBackpressureMuted = true;
    return error;
  }

  /**
   * Deliver one raft packet with mute semantics.
   * @param {Object} transport - Object exposing deliver(address, message,
   *   options).
   * @param {string} peerAddress - Unified peer address.
   * @param {Object} message - Message payload to deliver.
   * @param {Object} [deliveryOptions] - Pre-resolved delivery options;
   *   defaults to resolveRaftTransportDeliveryOptions on the message.
   * @return {Promise<*>} The transport result.
   */
  async deliver(
    transport,
    peerAddress,
    message,
    deliveryOptions = resolveRaftTransportDeliveryOptions({
      ...message,
      targetAddress: peerAddress,
    }),
  ) {
    if (
      deliveryOptions?.deliveryPriority ===
        OUTBOUND_DELIVERY_PRIORITY.BACKGROUND
    ) {
      const remainingMs = this.getMuteRemainingMs(peerAddress);
      if (remainingMs > 0) {
        throw this.buildMutedError(remainingMs);
      }
    }
    try {
      const result = await transport.deliver(
        peerAddress,
        message,
        deliveryOptions,
      );
      this.clearPeer(peerAddress);
      return result;
    } catch (error) {
      if (
        error?.code === OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE &&
        error?.peerBackpressureMuted !== true
      ) {
        this.recordRejection(peerAddress, error);
      }
      throw error;
    }
  }
}

/**
 * Process-wide shared mute: the outbound queues are per target node and
 * shared across every raft group in the process, so the mute state is too.
 */
const sharedRaftPeerBackpressureMute = new RaftPeerBackpressureMute();

/**
 * Deliver one raft packet through the shared process-wide mute. Drop-in for
 * the `transport.deliver(peerAddress, packet, resolveRaftTransport...)`
 * pattern used by the raft send paths.
 * @param {Object} transport
 * @param {string} peerAddress
 * @param {Object} packet
 * @param {RaftPeerBackpressureMute} [mute]
 * @return {Promise<*>}
 */
function deliverRaftPacketWithBackpressureMute(
  transport,
  peerAddress,
  packet,
  mute = sharedRaftPeerBackpressureMute,
) {
  return mute.deliver(transport, peerAddress, packet);
}

export {
  RaftPeerBackpressureMute,
  deliverRaftPacketWithBackpressureMute,
  sharedRaftPeerBackpressureMute,
};
