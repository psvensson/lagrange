// Follower-side snapshot OFFER router (quest raft-snapshot-live-rebuild,
// spec solve/specs/raft-snapshot-transfer-install/live-rebuild-design.md,
// S6 Phase A link 6). PEEK-THEN-REPLAY (verifier MUST-CHANGE:
// receiver-owns-from-frame-1 is impossible — the receiver needs the target
// replica, and the OFFER descriptor carries raftGroupId (= partitionId) and
// entity.id (= tableName), NO replicaId): on bulk-connection adoption a
// first-frame watcher is armed; the OFFER control frame is BUFFERED, the
// descriptor's raftGroupId is mapped to the local replica, the buffered
// frame(s) are REPLAYED into the freshly built transfer socket, and the
// injected orchestrate callback (production:
// orchestrateSnapshotCatchupInstall) takes over. The peek listener
// self-removes via the connection's offMessage at handoff — or on any typed
// refusal. Every non-route is a typed frozen outcome here AND a typed ABORT
// frame to the offering side (its serve loop has no other way to learn that
// nobody will answer): REPLICA_NOT_FOUND when this node holds no replica of
// the offered group, REPLICA_INSTALLING when its replica is stopped for an
// install it already received (the node brings it back itself; it is not
// absent), RECEIVER_AMBIGUOUS when the node runs more than one replica of the
// offered group, RECEIVER_NOT_ADMITTED when the node's admission of the offer
// (asked before anything is received, the offered frames buffered meanwhile)
// refuses it, CHUNK_FRAME_INVALID when the first frame is no offer.
//
// Transfer contract: one bulk connection carries ONE transfer. The offering
// side dials it and closes it when its dispatch ends
// (snapshot-catchup.js dispatchSnapshotCatchup); this router is therefore
// one-shot per adopted connection and is never re-armed, and the transfer
// socket's listeners end with the connection. This side closes the lane as
// well: when the receive ends, and when the connection delivers no frame for
// RAFT_SNAPSHOT_ADOPTED_LANE_IDLE_BOUND_MS while this side waits on the
// offering node (the bulk channel has no keepalive).

import {resolveTimeSource} from '../time/time-source.js';

import {bulkConnectionTransferSocket} from './bulk-connection-transfer-socket.js';
import {
  RAFT_SNAPSHOT_TRANSFER_ABORT_REASON,
  RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND,
} from './snapshot-transfer-constants.js';

const OFFER_KIND = RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND.OFFER;
const ABORT_KIND = RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND.ABORT;
// The transferId of an abort answering a frame that named none.
const NO_TRANSFER_ID = '';
const OFFER_ROUTER_TYPEOF = Object.freeze({
  STRING: 'string',
});
const OFFER_ROUTER_ENCODING = 'utf8';

// What the node answers for its replica of an offered raft group.
const RAFT_SNAPSHOT_OFFER_RECEIVER = Object.freeze({
  RUNNING: 'running',
  INSTALLING: 'installing',
  AMBIGUOUS: 'ambiguous',
  ABSENT: 'absent',
});

// Typed outcomes of one armed first-frame watch.
const RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME = Object.freeze({
  ROUTED: 'routed',
  NOT_OFFER: 'not_offer',
  REPLICA_NOT_FOUND: 'replica_not_found',
  REPLICA_INSTALLING: 'replica_installing',
  RECEIVER_AMBIGUOUS: 'receiver_ambiguous',
  NOT_ADMITTED: 'not_admitted',
  DISARMED: 'disarmed',
  // The adopted connection delivered no frame for the lane idle bound while
  // an offer or a transfer was awaited: closed by this side.
  LANE_IDLE_CLOSED: 'lane_idle_closed',
});

// How long an adopted bulk connection may deliver NO frame while this side
// waits on the offering node (for its offer, then for each frame of the
// transfer) before this side closes it. The bulk channel has no keepalive: a
// connection whose peer stopped without a close would otherwise read as that
// node's live transfer for ever and block every dispatch towards it (an open
// connection to a node is a busy lane). Relation to the offering side's
// dispatch idle bound (60 s, partition-snapshot-progress-constants.js): a
// live offering node never leaves this side waiting longer than that bound,
// because it aborts and closes its own dispatch at 60 s without progress,
// and between frames it only reads and digests one chunk and waits for one
// paced send; so this bound is twice that, and silence that reaches it means
// the close was lost. It does not run once the receive has ended (the
// receiver's own publication and install are not the peer's silence).
const RAFT_SNAPSHOT_ADOPTED_LANE_IDLE_BOUND_MS = 120000;

// A receiver that takes no offer: the route outcome and the abort it sends.
const RECEIVER_REFUSALS = Object.freeze({
  [RAFT_SNAPSHOT_OFFER_RECEIVER.INSTALLING]: Object.freeze({
    outcome: RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.REPLICA_INSTALLING,
    reason: RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.REPLICA_INSTALLING}),
  [RAFT_SNAPSHOT_OFFER_RECEIVER.AMBIGUOUS]: Object.freeze({
    outcome: RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.RECEIVER_AMBIGUOUS,
    reason: RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.RECEIVER_AMBIGUOUS}),
  [RAFT_SNAPSHOT_OFFER_RECEIVER.ABSENT]: Object.freeze({
    outcome: RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.REPLICA_NOT_FOUND,
    reason: RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.REPLICA_NOT_FOUND}),
});

function routeOutcome(outcome, extra = {}) {
  return Object.freeze({outcome, ...extra});
}

// The first frame is an OFFER only when it is a TEXT control frame whose
// parsed kind is the transfer OFFER (binary frames and any other control
// kind are typed non-offers; a fresh bulk connection speaks OFFER first by
// protocol, so anything else is not a snapshot transfer).
function parseOfferFrame(data, isBinary) {
  const isText = typeof data === OFFER_ROUTER_TYPEOF.STRING ||
    isBinary === false;
  if (!isText) {
    return null;
  }
  let message;
  try {
    message = JSON.parse(typeof data === OFFER_ROUTER_TYPEOF.STRING ?
      data :
      data.toString(OFFER_ROUTER_ENCODING));
  } catch {
    return null;
  }
  return message?.kind === OFFER_KIND ? message : null;
}

/**
 * Arm the peek-then-replay snapshot offer router on one adopted bulk
 * connection. The FIRST inbound frame decides: a control OFFER frame is
 * buffered, mapped to the local replica via
 * resolveLocalReplica(descriptor.raftGroupId), and replayed into a fresh
 * transfer socket handed to orchestrate; anything else is a typed refusal.
 * In every terminal case the peek listener is removed via offMessage.
 * @param {Object} options router options
 * @param {Object} options.connection adopted bulk transfer connection
 * @param {Function} options.resolveLocalReplica (raftGroupId) -> the local
 *   partition service for that raft group, or null
 * @param {Function} options.orchestrate ({service, socket, offer,
 *   onTransferEnded}) -> Promise of the typed install-orchestration result;
 *   it calls onTransferEnded when its receive ends, for any reason
 * @param {Object} [options.timeSource] the node's clock for the lane idle
 *   bound (the platform clock when absent)
 * @param {Function} [options.onOutcome] observer receiving the typed frozen
 *   route outcome (ROUTED carries {raftGroupId, completion})
 * @return {Object} frozen {disarm} — removes the peek listener if unfired
 */
function armSnapshotOfferRouter(options) {
  const {connection, resolveReceiver, admitOffer, orchestrate, onOutcome} = options;
  const clock = resolveTimeSource(options);
  let terminal = false;
  // The lane idle watch: armed now (at adoption), re-armed by every frame
  // the connection delivers, ended when the receive ends or the connection
  // closes. Expiry closes the connection: a typed outcome, never a hang.
  let watching = true;
  let idleTimer = clock.setTimeout(closeIdleLane, RAFT_SNAPSHOT_ADOPTED_LANE_IDLE_BOUND_MS);
  idleTimer.unref?.();

  function endIdleWatch() {
    watching = false;
    clock.clearTimeout(idleTimer);
    connection.offMessage(frameSeen);
  }

  function closeIdleLane() {
    if (!watching) {
      return;
    }
    endIdleWatch();
    terminal = true;
    connection.offMessage(peek);
    onOutcome?.(routeOutcome(RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.LANE_IDLE_CLOSED,
      {boundMs: RAFT_SNAPSHOT_ADOPTED_LANE_IDLE_BOUND_MS}));
    connection.close();
  }

  function frameSeen() {
    clock.clearTimeout(idleTimer);
    idleTimer = clock.setTimeout(closeIdleLane, RAFT_SNAPSHOT_ADOPTED_LANE_IDLE_BOUND_MS);
    idleTimer.unref?.();
  }

  // The receive ended, for any reason: the watch ends and this side closes
  // the lane too, one turn later so its last control frame is delivered. A
  // lane never outlives its one transfer on either side.
  const receiveEnded = () => {
    endIdleWatch();
    setImmediate(() => connection.close());
  };

  const finish = (outcome) => {
    terminal = true;
    connection.offMessage(peek);
    onOutcome?.(outcome);
    return outcome;
  };

  // The offering side's serve loop ends on any ABORT frame with its reason.
  const answerAbort = (transferId, reason) => {
    connection.sendControl({kind: ABORT_KIND, transferId, reason});
  };

  function peek(data, isBinary) {
    if (terminal) {
      return;
    }
    const offer = parseOfferFrame(data, isBinary);
    if (!offer) {
      finish(routeOutcome(RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.NOT_OFFER));
      answerAbort(NO_TRANSFER_ID,
        RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.CHUNK_FRAME_INVALID);
      return;
    }
    const raftGroupId = offer.descriptor?.raftGroupId;
    const receiver = resolveReceiver(raftGroupId);
    if (receiver.state !== RAFT_SNAPSHOT_OFFER_RECEIVER.RUNNING) {
      const refusal = RECEIVER_REFUSALS[receiver.state];
      finish(routeOutcome(refusal.outcome, {raftGroupId}));
      answerAbort(offer.transferId, refusal.reason);
      return;
    }
    // The watch ends here (synchronously — no frame can interleave inside
    // this callback); the OFFER and whatever arrives while the node decides
    // are buffered for the transfer socket's replay prefix.
    terminal = true;
    connection.offMessage(peek);
    const frames = [Object.freeze({data, isBinary})];
    const buffer = (nextData, nextIsBinary) => {
      frames.push(Object.freeze({data: nextData, isBinary: nextIsBinary}));
    };
    connection.onMessage(buffer);
    const refuse = (detail) => {
      connection.offMessage(buffer);
      onOutcome?.(routeOutcome(
        RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.NOT_ADMITTED, {raftGroupId, ...detail}));
      answerAbort(offer.transferId,
        RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.RECEIVER_NOT_ADMITTED);
    };
    // Admission BEFORE anything is received: a refusal leaves the replica
    // untouched and tells the offering side why. Then the handoff: the
    // transfer socket replays the buffered frames and the orchestrator's
    // receiver subscribes and drains them.
    Promise.resolve().then(() => admitOffer({service: receiver.service, offer}))
      .then((admission) => {
        if (admission.admitted !== true) {
          refuse({admission});
          return;
        }
        connection.offMessage(buffer);
        const socket = bulkConnectionTransferSocket(connection,
          {replayFrames: frames});
        const completion = Promise.resolve(orchestrate({
          service: receiver.service, socket, offer, onTransferEnded: receiveEnded}));
        onOutcome?.(routeOutcome(RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.ROUTED, {
          raftGroupId,
          completion,
        }));
      }, (error) => refuse({detail: error?.message}));
  }

  connection.onMessage(frameSeen);
  connection.onMessage(peek);
  connection.onClose(endIdleWatch);
  return Object.freeze({
    disarm() {
      if (!terminal) {
        finish(routeOutcome(RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.DISARMED));
      }
    },
  });
}

export {
  RAFT_SNAPSHOT_ADOPTED_LANE_IDLE_BOUND_MS,
  RAFT_SNAPSHOT_OFFER_RECEIVER,
  RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME,
  armSnapshotOfferRouter,
};
