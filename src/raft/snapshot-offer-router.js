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
// refusal — so a long-lived bulk connection never accumulates listeners.
// Every non-route is a typed frozen outcome, never a silent drop.

import {bulkConnectionTransferSocket} from './bulk-connection-transfer-socket.js';
import {
  RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND,
} from './snapshot-transfer-constants.js';

const OFFER_KIND = RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND.OFFER;
const OFFER_ROUTER_TYPEOF = Object.freeze({
  STRING: 'string',
});
const OFFER_ROUTER_ENCODING = 'utf8';

// Typed outcomes of one armed first-frame watch.
const RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME = Object.freeze({
  ROUTED: 'routed',
  NOT_OFFER: 'not_offer',
  REPLICA_NOT_FOUND: 'replica_not_found',
  DISARMED: 'disarmed',
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
 * @param {Function} options.orchestrate ({service, socket, offer}) ->
 *   Promise of the typed install-orchestration result
 * @param {Function} [options.onOutcome] observer receiving the typed frozen
 *   route outcome (ROUTED carries {raftGroupId, completion})
 * @return {Object} frozen {disarm} — removes the peek listener if unfired
 */
function armSnapshotOfferRouter(options) {
  const {connection, resolveLocalReplica, orchestrate, onOutcome} = options;
  let terminal = false;

  const finish = (outcome) => {
    terminal = true;
    connection.offMessage(peek);
    onOutcome?.(outcome);
    return outcome;
  };

  const peek = (data, isBinary) => {
    if (terminal) {
      return;
    }
    const offer = parseOfferFrame(data, isBinary);
    if (!offer) {
      finish(routeOutcome(RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.NOT_OFFER));
      return;
    }
    const raftGroupId = offer.descriptor?.raftGroupId;
    const service = resolveLocalReplica(raftGroupId);
    if (!service) {
      finish(routeOutcome(
        RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.REPLICA_NOT_FOUND, {raftGroupId}));
      return;
    }
    // Handoff: remove the peek FIRST (synchronously — no frame can
    // interleave inside this callback), then build the transfer socket with
    // the buffered OFFER as its replay prefix, then let the orchestrator's
    // receiver subscribe and drain it.
    terminal = true;
    connection.offMessage(peek);
    const socket = bulkConnectionTransferSocket(connection, {
      replayFrames: [Object.freeze({data, isBinary})],
    });
    const completion = Promise.resolve(
      orchestrate({service, socket, offer}));
    onOutcome?.(routeOutcome(RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.ROUTED, {
      raftGroupId,
      completion,
    }));
  };

  connection.onMessage(peek);
  return Object.freeze({
    disarm() {
      if (!terminal) {
        finish(routeOutcome(RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.DISARMED));
      }
    },
  });
}

export {
  RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME,
  armSnapshotOfferRouter,
};
