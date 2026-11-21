// Census C13 of the raft frame delivery record
// (lagrange-takeover-20261121/reports/raft-frame-delivery-record.md): who
// re-establishes a lost peer connection once raft frames no longer take the
// router's fallback path (which today can dial the peer itself:
// message-router-delivery-behaviors.js deliverRemote -> tryDeliverAfterReconnect).
//
// The connection owner is the router's close handling: every closed non-self
// peer connection with a remembered address schedules reconnect attempts
// (message-router-connection-close-reconnect.js handleConnectionClose ->
// scheduleReconnect), from both ends; the existing simultaneous-dial
// resolution keeps one connection. The declared schedule waits
// reconnectIntervalMs x reconnectBackoffMultiplier^(n-1) before attempt n for
// the first reconnectMaxAttempts attempts (1 s x 1.5, 10 attempts, about
// 113 s). Before (e) a raft envelope to a disconnected node also dialed; after
// (e) nothing else does, so for a pair that exchanges only raft the schedule
// is the whole reconnect owner. Two cases, raft traffic both ways all the
// time:
//   1. a short outage: both ends schedule their reconnect and it restores the
//      link - no raft frame is needed (green before and after (e));
//   2. an outage that outlasts the bounded part of the schedule (the original
//      clause of this witness, restored: 5e5f5ffa8 had weakened it to "more
//      than zero dials each", which the first ten attempts satisfy): both ends
//      keep dialing for the whole outage at the schedule's capped cadence
//      (never faster), and once the network heals the link returns within one
//      capped delay and raft traffic alone resumes both ways - no other
//      traffic, no restart. Measured before the reconnect owner (lab
//      raftframes-s2e-before-r2, f0892b478): the dialing end stopped after its
//      schedule and the link returned only through defect F-2 (the adopted
//      end re-dialing every turn, 240001 refused dials in 20 minutes); with
//      F-2 merely bounded neither end ever dials again (record section 19).
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
const LONG_OUTAGE_MS = 1200000;
const RESTORE_BOUND_MS = 60000;
// Scheduling slack per measured instant: the drive step, the link and the
// refused dial's own turn.
const SLACK_MS = 1000;
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

// The declared schedule, from the router's own parameters: the delays of its
// bounded attempts, their span, and the last of them (the capped cadence).
function declaredSchedule(router) {
  const delays = Array.from({length: router.reconnectMaxAttempts}, (_, index) =>
    router.reconnectIntervalMs * router.reconnectBackoffMultiplier ** index);
  return {intervalMs: router.reconnectIntervalMs, attempts: delays.length,
    boundedSpanMs: delays.reduce((sum, delay) => sum + delay, 0),
    capMs: delays[delays.length - 1]};
}

// The most dials the capped schedule permits within `spanMs`.
function dialsPermittedWithin(schedule, spanMs) {
  return schedule.attempts + Math.max(0,
    Math.floor((spanMs - schedule.boundedSpanMs) / schedule.capMs)) + 1;
}

// Each end's refused dials, as instants after the sever (an end's dials are
// the refused dials to the other node).
function dialInstantsByEnd(world, severedAt) {
  return Object.fromEntries(NODES.map((nodeId) => {
    const peer = NODES.find((other) => other !== nodeId);
    return [nodeId, world.refusedDials.filter((dial) => dial.to === peer)
      .map((dial) => dial.atMs - severedAt)];
  }));
}

async function outageThenHeal({world, received}, outageMs) {
  world.blackout(NODES);
  world.severLink(NODE_A, NODE_B);
  const severedAt = world.network.now();
  await world.driveFor(STEP_MS * 2, STEP_MS);
  const afterSever = reconnectState(world);
  await world.driveFor(outageMs, STEP_MS);
  const atHeal = reconnectState(world);
  const outageLastedMs = world.network.now() - severedAt;
  const refusedDialsByTarget = world.refusedDials.reduce((counts, dial) =>
    ({...counts, [dial.to]: (counts[dial.to] ?? 0) + 1}), {});
  const dialInstants = dialInstantsByEnd(world, severedAt);
  const dialsByEnd = Object.fromEntries(NODES.map((nodeId) => {
    const instants = dialInstants[nodeId];
    return [nodeId, {count: instants.length, first: instants.slice(0, 12),
      lastBeforeHealAgoMs: instants.length === 0 ? null :
        outageLastedMs - instants[instants.length - 1]}];
  }));
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
  return {afterSever, atHeal, outageLastedMs, refusedDialsByTarget, dialsByEnd,
    restoredAfterMs,
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

test('C13: after an outage that outlasts the bounded reconnect schedule, both ' +
  'ends keep dialing at the capped cadence and raft alone resumes after the heal',
{timeout: WITNESS_TIMEOUT_MS}, async (t) => {
  const traffic = await trafficWorld();
  try {
    const schedule = declaredSchedule(traffic.world.router(NODE_A));
    const measured = await outageThenHeal(traffic, LONG_OUTAGE_MS);
    const permitted = dialsPermittedWithin(schedule, measured.outageLastedMs);
    const report = `schedule ${JSON.stringify({...schedule, permitted})} measured ${
      JSON.stringify(measured)} sendErrors ${JSON.stringify(traffic.sendErrors.length)}`;
    t.diagnostic(report);
    // Anti-vacuity: the heal arrives later than the bounded part of the
    // schedule, by more than one capped delay.
    assert.ok(measured.outageLastedMs > schedule.boundedSpanMs + schedule.capMs,
      `the outage outlasted the bounded schedule: ${report}`);
    // Both ends keep trying for the whole outage: each dialed within one
    // capped delay of the heal.
    assert.ok(NODES.every((nodeId) => {
      const ago = measured.dialsByEnd[nodeId].lastBeforeHealAgoMs;
      return ago !== null && ago <= schedule.capMs + SLACK_MS;
    }), `both ends kept dialing until the heal: ${report}`);
    // At the schedule's cadence, never faster: no dial storm.
    assert.ok(NODES.every((nodeId) =>
      measured.dialsByEnd[nodeId].count <= permitted),
    `neither end dialed more often than the capped schedule permits: ${report}`);
    assert.ok(measured.restoredAfterMs !== null &&
      measured.restoredAfterMs <= schedule.capMs + SLACK_MS,
    `the link came back within one capped delay of the heal: ${report}`);
    assert.ok(Object.values(measured.raftReceivedAfterHeal).every((count) => count > 0),
      `raft traffic alone flows both ways again: ${report}`);
  } finally {
    traffic.stop();
    await traffic.world.end();
  }
});
