// A replica group's deliveries to its peers, and the per-sender refusals of
// what peers delivered to it: observations the runtime owner records against
// each peer. Nothing here enters the core; the runtime owner hands in the
// group's own sendToPeer and resolvePeerAddress and reads the observations
// back for its status.

import {deepFreeze} from './raft-operation-port.js';
import {RAFT_RS_TRANSPORT_PROTOCOL} from './raft-rs-ingress-constants.js';
import {
  INBOUND_STEP_REFUSAL_OBSERVATION_LIMIT,
  PEER_DELIVERY_OBSERVATION_LIMIT,
  PEER_DELIVERY_OUTCOME,
  RUNTIME_PHASE,
  RUNTIME_REASON,
} from './raft-rs-runtime-owner-constants.js';

function thenMaybe(value, continuation) {
  return value && typeof value.then === 'function' ?
    value.then(continuation) : continuation(value);
}

// A delivery to one peer is that peer's transport outcome. Raft re-sends
// what a peer did not receive (the next append or heartbeat), so a failed
// delivery drops the message, is recorded against the peer, and leaves the
// Ready - its persistence, its application and the group's role and runtime -
// exactly as it was. Later messages of the same batch to a peer that just
// failed are dropped with it rather than waited on again.
function recordPeerDelivery(group, raftPeerId, observation) {
  const key = String(raftPeerId);
  group.peerDelivery.delete(key);
  group.peerDelivery.set(key, deepFreeze(observation));
  if (group.peerDelivery.size > PEER_DELIVERY_OBSERVATION_LIMIT) {
    group.peerDelivery.delete(group.peerDelivery.keys().next().value);
  }
}

// A delivered envelope the core refused to step (a response from a peer it
// holds no progress for, a proposal it drops, a local-only message type): the
// core's own refusal record, kept per sender with how many of that sender's
// envelopes it has refused, oldest sender evicted first past the
// bound. An observation for the group's status; it answers nothing.
function recordInboundStepRefusal(group, envelope, refused) {
  const sender = String(envelope.message?.from ?? envelope.from);
  const previous = group.inboundStepRefusals.get(sender);
  group.inboundStepRefusals.delete(sender);
  group.inboundStepRefusals.set(sender, deepFreeze({
    from: sender,
    msgType: envelope.message?.msgType ?? null,
    outcome: refused.outcome,
    reason: refused.reason,
    phase: refused.phase,
    refusalCount: (previous?.refusalCount ?? 0) + 1,
  }));
  if (group.inboundStepRefusals.size >
      INBOUND_STEP_REFUSAL_OBSERVATION_LIMIT) {
    group.inboundStepRefusals.delete(
      group.inboundStepRefusals.keys().next().value);
  }
}

function peerDeliveryFailed(group, raftPeerId, phase, cause, failedPeers) {
  const previous = group.peerDelivery.get(String(raftPeerId));
  recordPeerDelivery(group, raftPeerId, {
    outcome: PEER_DELIVERY_OUTCOME.FAILED,
    phase,
    reason: String(cause?.message || cause || RUNTIME_REASON.DELIVERY_FAILED),
    consecutiveFailures: previous?.outcome === PEER_DELIVERY_OUTCOME.FAILED ?
      previous.consecutiveFailures + 1 : 1,
  });
  failedPeers.add(String(raftPeerId));
  return null;
}

function settlePeerDelivery(group, raftPeerId, delivery, failedPeers) {
  if (delivery && typeof delivery === 'object' &&
      (delivery.noHandler === true || delivery.deferRetry === true ||
        delivery.acknowledged === false || delivery.error)) {
    return peerDeliveryFailed(group, raftPeerId,
      delivery.noHandler ? RUNTIME_PHASE.SEND_NO_HANDLER : RUNTIME_PHASE.SEND,
      delivery.error || delivery.reason, failedPeers);
  }
  recordPeerDelivery(group, raftPeerId, {
    outcome: PEER_DELIVERY_OUTCOME.DELIVERED, consecutiveFailures: 0,
  });
  return null;
}

function deliverToPeer(group, message, failedPeers) {
  let address;
  try {
    address = group.resolvePeerAddress(message.to);
  } catch (error) {
    return peerDeliveryFailed(group, message.to,
      RUNTIME_PHASE.ADDRESS_RESOLUTION, error, failedPeers);
  }
  let delivered;
  try {
    delivered = group.sendToPeer(address, {
      protocol: RAFT_RS_TRANSPORT_PROTOCOL,
      groupId: group.groupId,
      from: message.from,
      to: message.to,
      message,
    });
  } catch (error) {
    return peerDeliveryFailed(group, message.to, RUNTIME_PHASE.SEND, error,
      failedPeers);
  }
  if (delivered && typeof delivered.then === 'function') {
    return Promise.resolve(delivered).then(
      (delivery) => settlePeerDelivery(group, message.to, delivery,
        failedPeers),
      (error) => peerDeliveryFailed(group, message.to, RUNTIME_PHASE.SEND,
        error, failedPeers));
  }
  return settlePeerDelivery(group, message.to, delivered, failedPeers);
}

function sendMessages(group, messages, index = 0, failedPeers = new Set()) {
  if (index >= messages.length) {
    return null;
  }
  const message = messages[index];
  const delivered = failedPeers.has(String(message.to)) ? null :
    deliverToPeer(group, message, failedPeers);
  return thenMaybe(delivered, () =>
    sendMessages(group, messages, index + 1, failedPeers));
}

export {recordInboundStepRefusal, sendMessages};
