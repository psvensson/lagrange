// Census C13 of the raft frame delivery record
// (lagrange-takeover-20261121/reports/raft-frame-delivery-record.md): who
// re-establishes a lost peer connection once raft frames no longer take the
// router's fallback path (which today can dial the peer itself:
// message-router-delivery-behaviors.js deliverRemote -> tryDeliverAfterReconnect).
//
// The connection owner is the router's close handling: every closed non-self
// peer connection with a remembered address schedules reconnect attempts
// (message-router-connection-close-reconnect.js handleConnectionClose ->
// scheduleReconnect), 1 s then x1.5 each, at most transport.reconnectMaxAttempts
// (10, about 113 s in all). Two cases, raft traffic flowing both ways all the
// time:
//   1. a short outage: both ends schedule their reconnect and it restores the
//      link - no raft frame is needed (green before and after (e));
//   2. an outage longer than that budget: once both ends spent their
//      attempts, the link comes back after the heal only if some owner dials.
//      Before (e) a raft frame on the fallback path does; the contract asks
//      that the link come back after (e) too. If it does not, (e) changed
//      this outcome and the line stops on it.
//
// Real: two MessageRouters on their nodes' network clocks (keepalive,
// reconnect schedule and delivery lifetimes on virtual time). Substituted:
// the link (VirtualNetwork, 1 ms); the outage (the link's sockets closed and,
// for its length, dials to either node find no endpoint - ECONNREFUSED);
// the raft traffic (a raft-rs heartbeat envelope through each router's send
// entry every 60 ms, to a handler that counts it).
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RAFT_RS_MESSAGE_TYPE, RAFT_RS_TRANSPORT_PROTOCOL} from
  '../../src/raft/raft-rs-ingress-constants.js';
import {ROUTER_CLOCK, RaftRouterWorld} from './raft-frame-router-world.js';

const NODE_A = 'rfr-a';
const NODE_B = 'rfr-b';
const NODES = Object.freeze([NODE_A, NODE_B]);
const RAFT_SEND_EVERY_MS = 60;
const STEP_MS = 5;
const SHORT_OUTAGE_MS = 3000;
// Longer than the whole default reconnect schedule (about 113 s).
const LONG_OUTAGE_MS = 130000;
const RESTORE_BOUND_MS = 60000;
// Up to three minutes of virtual time on a shared, slow lab host.
const WITNESS_TIMEOUT_MS = 300000;

function addressOn(nodeId) {
  return `${nodeId}/partition/rfr-p1-${nodeId}`;
}

function heartbeatEnvelope(from, to) {
  return {protocol: RAFT_RS_TRANSPORT_PROTOCOL, groupId: 'rfr-p1', from, to,
    message: {msgType: RAFT_RS_MESSAGE_TYPE.HEARTBEAT, from, to, term: '1',
      commit: '0'}};
}

// Two routers, a counting handler on each, raft heartbeats both ways.
async function trafficWorld() {
  const world = new RaftRouterWorld({nodeIds: NODES,
    routerClock: ROUTER_CLOCK.NETWORK, dialPairs: [[NODE_A, NODE_B]]});
  await world.start();
  const received = {[NODE_A]: 0, [NODE_B]: 0};
  const sendErrors = [];
  for (const nodeId of NODES) {
    world.router(nodeId).register(addressOn(nodeId), () => {
      received[nodeId] += 1;
      return null;
    });
  }
  const stops = [[NODE_A, NODE_B, '1', '2'], [NODE_B, NODE_A, '2', '1']].map(
    ([from, to, fromPeer, toPeer]) => world.every(from, RAFT_SEND_EVERY_MS, () => {
      world.sendRaftEnvelope(from, addressOn(to), heartbeatEnvelope(fromPeer, toPeer))
        .then(undefined, (error) => sendErrors.push(String(error?.message)));
    }));
  return {world, received, sendErrors, stop: () => stops.forEach((stop) => stop())};
}

function reconnectState(world) {
  return Object.fromEntries(NODES.map((nodeId) => {
    const peer = NODES.find((other) => other !== nodeId);
    const router = world.router(nodeId);
    const connection = router.nodeConnections.get(peer) ?? null;
    return [nodeId, {state: connection?.state ?? null,
      scheduled: router.hasScheduledReconnect(connection),
      attempts: connection?.reconnectAttempts ?? null}];
  }));
}

async function outageThenHeal({world, received}, outageMs) {
  world.blackout(NODES);
  world.severLink(NODE_A, NODE_B);
  await world.driveFor(STEP_MS * 2, STEP_MS);
  const afterSever = reconnectState(world);
  await world.driveFor(outageMs, STEP_MS);
  const atHeal = reconnectState(world);
  const dialsBeforeHeal = world.dials.length;
  world.heal();
  const healedAt = world.network.now();
  const receivedAtHeal = {...received};
  let restoredAfterMs = null;
  while (world.network.now() < healedAt + RESTORE_BOUND_MS) {
    if (world.connected(NODE_A, NODE_B)) {
      restoredAfterMs = world.network.now() - healedAt;
      break;
    }
    await world.driveFor(STEP_MS, STEP_MS);
  }
  await world.driveFor(RAFT_SEND_EVERY_MS * 4, STEP_MS);
  return {afterSever, atHeal, restoredAfterMs,
    dialsAfterHeal: world.dials.slice(dialsBeforeHeal),
    raftReceivedAfterHeal: Object.fromEntries(NODES.map((nodeId) =>
      [nodeId, received[nodeId] - receivedAtHeal[nodeId]]))};
}

test('C13: a short outage is repaired by the routers\' own reconnect ' +
  'schedule, without a raft frame', {timeout: WITNESS_TIMEOUT_MS}, async () => {
  const traffic = await trafficWorld();
  try {
    const measured = await outageThenHeal(traffic, SHORT_OUTAGE_MS);
    const report = `measured ${JSON.stringify(measured)} sendErrors ${
      JSON.stringify(traffic.sendErrors)}`;
    assert.deepEqual(Object.values(measured.afterSever).map((end) => end.scheduled),
      [true, true], `both ends scheduled their own reconnect: ${report}`);
    assert.ok(measured.restoredAfterMs !== null,
      `the link came back after the heal: ${report}`);
    assert.ok(Object.values(measured.raftReceivedAfterHeal).every((count) => count > 0),
      `raft flows both ways again: ${report}`);
  } finally {
    traffic.stop();
    await traffic.world.end();
  }
});

test('C13: after an outage longer than the reconnect schedule, the link ' +
  'still comes back once the network heals', {timeout: WITNESS_TIMEOUT_MS},
async () => {
  const traffic = await trafficWorld();
  try {
    const measured = await outageThenHeal(traffic, LONG_OUTAGE_MS);
    const report = `measured ${JSON.stringify(measured)} sendErrors ${
      JSON.stringify(traffic.sendErrors)}`;
    // Anti-vacuity: the outage really outlasted both schedules.
    assert.deepEqual(Object.values(measured.atHeal).map((end) => end.scheduled),
      [false, false], `both ends had spent their reconnect schedule: ${report}`);
    assert.ok(measured.restoredAfterMs !== null,
      `the link came back within ${RESTORE_BOUND_MS} ms of the heal: ${report}`);
    assert.ok(Object.values(measured.raftReceivedAfterHeal).every((count) => count > 0),
      `raft flows both ways again: ${report}`);
  } finally {
    traffic.stop();
    await traffic.world.end();
  }
});
