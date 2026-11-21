// Red witness (e) of the raft frame delivery record
// (lagrange-takeover-20261121/reports/raft-frame-delivery-record.md):
// a raft envelope crosses the router link as one frame and nothing comes
// back for it at the transport level - no ACK frame, no SERVICE_RESPONSE
// frame, no orphaned-response record on the sender, no per-message
// delivery-lifetime deadline timer on the sender's clock.
//
// Today (red): for N raft envelopes one way the wire carries 3N frames, 2N of
// them back to the sender (an ACK and a SERVICE_RESPONSE per envelope,
// message-router-inbound-dispatch.js handleServiceMessage), the sender
// records N orphaned responses (the direct raft send registers no waiter,
// message-router-delivery-behaviors.js tryDeliverRaftDirect) and arms N
// deadline timers (message-router-delivery-lifetime.js createDeliveryLifetime).
//
// Anti-vacuity: the receiving handler gets exactly the N envelopes the
// leader's port handed to the transport, and the leader stays leader. Anchor:
// an ordinary request on the same link still gets its ACK and its
// SERVICE_RESPONSE and settles DELIVERED with the handler's answer.
//
// Real: two MessageRouters, a three-replica raft-rs partition whose leader
// sends through the SEND_TO_PEER closure body. Substituted: see
// raft-frame-router-world.js; here the followers' raft answers return to the
// leader in process, so the router link carries one direction only.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {ROUTER_MESSAGE_TYPE} from '../../src/constants/transport.js';
import {RAFT_RS_GROUP_TUNING} from '../../src/raft/raft-rs-group-constants.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {
  deliveryAnswerOf, deliveryTransportOf, isDeliveredTransportDeliveryOutcome,
} from '../../src/transport/transport-semantic-outcome.js';
import {RaftRouterWorld} from './raft-frame-router-world.js';

const NODE_A = 'rfe-a';
const NODE_B = 'rfe-b';
const PARTITION_ID = 'rfe-p1';
const LEADER = 'rfe-p1-r1';
const FOLLOWERS = Object.freeze(['rfe-p1-r2', 'rfe-p1-r3']);
const HEARTBEAT_ROUNDS = 25;
const ELECTION_BOUND_MS = 3000;
const ECHO_ADDRESS = `${NODE_B}/service/rfe-echo`;
const ECHO_VALUE = 7;
// An election over two real routers on a shared, slow lab host.
const WITNESS_TIMEOUT_MS = 120000;

async function electedWorld() {
  const world = new RaftRouterWorld({
    nodeIds: [NODE_A, NODE_B],
    groups: [{partitionId: PARTITION_ID, replicas: [
      [LEADER, NODE_A], [FOLLOWERS[0], NODE_B], [FOLLOWERS[1], NODE_B]]}],
    inProcessFrom: [NODE_B],
  });
  await world.start();
  try {
    world.startScheduling();
    await turnChainValue(world.node(LEADER).campaign());
    await world.driveUntil(() => world.isLeader(LEADER) && FOLLOWERS.every(
      (id) => world.node(id).readStatus().commitIndex ===
        world.node(LEADER).readStatus().commitIndex), ELECTION_BOUND_MS);
    // From here on only the test ticks the leader: the measurement starts
    // and ends with nothing in flight.
    world.stopScheduling();
    await world.driveUntilQuiet();
  } catch (error) {
    await world.end();
    throw error;
  }
  return world;
}

test('(e) a raft envelope is one frame with nothing back: no ACK, no ' +
  'SERVICE_RESPONSE, no orphan, no per-message deadline timer',
{timeout: WITNESS_TIMEOUT_MS}, async () => {
  const world = await electedWorld();
  try {
    const termBefore = world.node(LEADER).readStatus().term;
    const framesBefore = world.frames.length;
    const sendsBefore = world.raftSends.length;
    const receiptsBefore = world.raftReceipts.length;
    const orphanedBefore = world.orphanedResponses(NODE_A);
    const timeoutsBefore = world.routerTimeouts(NODE_A);
    for (let round = 0; round < HEARTBEAT_ROUNDS; round += 1) {
      for (let tick = 0; tick < RAFT_RS_GROUP_TUNING.HEARTBEAT_TICK; tick += 1) {
        await turnChainValue(world.node(LEADER).tick());
      }
      await world.driveUntilQuiet();
    }
    const sent = world.raftSends.slice(sendsBefore);
    const received = world.raftReceipts.slice(receiptsBefore);
    const measured = {
      raftEnvelopesSent: sent.length,
      raftEnvelopesReceived: received.length,
      framesAtoB: world.dataFramesBetween(NODE_A, NODE_B, framesBefore).length,
      framesBtoA: world.dataFramesBetween(NODE_B, NODE_A, framesBefore).length,
      framesBtoAByType: countByType(
        world.dataFramesBetween(NODE_B, NODE_A, framesBefore)),
      orphanedResponsesAtA: world.orphanedResponses(NODE_A) - orphanedBefore,
      routerTimersArmedAtA: world.routerTimeouts(NODE_A) - timeoutsBefore,
    };
    const report = `measured ${JSON.stringify(measured)}`;
    // Anti-vacuity first: the leader really sent through the router, every
    // envelope reached the receiving handler once, and nothing re-elected.
    assert.ok(sent.length >= HEARTBEAT_ROUNDS * FOLLOWERS.length,
      `the leader handed its heartbeats to the transport: ${report}`);
    assert.ok(sent.every((send) => send.fromNode === NODE_A &&
      send.toNode === NODE_B), `every raft send went A to B: ${report}`);
    assert.equal(received.length, sent.length,
      `every raft envelope reached the receiving handler exactly once: ${report}`);
    assert.equal(world.node(LEADER).readStatus().term, termBefore,
      `the leader kept its term: ${report}`);
    // The contract (red today: 3N frames, 2N back, N orphaned, N timers).
    assert.deepEqual({
      totalFramesWithinEnvelopes:
        measured.framesAtoB + measured.framesBtoA <= sent.length,
      framesBtoA: measured.framesBtoA,
      orphanedResponsesAtA: measured.orphanedResponsesAtA,
      routerTimersArmedAtA: measured.routerTimersArmedAtA,
    }, {
      totalFramesWithinEnvelopes: true,
      framesBtoA: 0,
      orphanedResponsesAtA: 0,
      routerTimersArmedAtA: 0,
    }, `raft envelopes carry no transport answer and no delivery lifetime: ${report}`);
  } finally {
    await world.end();
  }
});

test('(e) anchor: an ordinary request on the same link still gets its ACK ' +
  'and its SERVICE_RESPONSE and settles with the answer',
{timeout: WITNESS_TIMEOUT_MS}, async () => {
  const world = await electedWorld();
  try {
    world.router(NODE_B).register(ECHO_ADDRESS,
      (envelope) => ({echo: envelope.payload.value}));
    const framesBefore = world.frames.length;
    const orphanedBefore = world.orphanedResponses(NODE_A);
    const delivery = world.router(NODE_A).deliver(ECHO_ADDRESS,
      {type: 'rfe-echo', value: ECHO_VALUE});
    await world.driveUntilQuiet();
    const outcome = await delivery;
    const request = world.dataFramesBetween(NODE_A, NODE_B, framesBefore);
    const answers = world.dataFramesBetween(NODE_B, NODE_A, framesBefore);
    const report = `request ${JSON.stringify(request)} answers ${
      JSON.stringify(answers)}`;
    assert.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(outcome)),
      true, `the request is delivered: ${report}`);
    assert.deepEqual(deliveryAnswerOf(outcome), {echo: ECHO_VALUE},
      `the handler's answer comes back: ${report}`);
    assert.equal(request.length, 1, `one request frame: ${report}`);
    assert.deepEqual(answers.map((frame) => frame.type).sort(),
      [ROUTER_MESSAGE_TYPE.ACK, ROUTER_MESSAGE_TYPE.SERVICE_RESPONSE].sort(),
      `its ACK and its SERVICE_RESPONSE come back: ${report}`);
    assert.ok(answers.every((frame) =>
      frame.messageId === request[0].messageId),
    `both answer the request's own message id: ${report}`);
    assert.equal(world.orphanedResponses(NODE_A) - orphanedBefore, 0,
      `the awaited response is settled, not orphaned: ${report}`);
    assert.equal(world.router(NODE_A).pendingResponses.size, 0,
      `no response waiter is left: ${report}`);
  } finally {
    await world.end();
  }
});

function countByType(frames) {
  const counts = {};
  for (const frame of frames) {
    counts[frame.type] = (counts[frame.type] ?? 0) + 1;
  }
  return counts;
}
