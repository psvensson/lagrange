// Finding F-2 of the raft frame delivery record
// (lagrange-takeover-20261121/reports/raft-frame-delivery-record.md, sections
// 13.3 and 19): a router that ADOPTED a peer's inbound connection becomes that
// peer's reconnect owner when the connection closes
// (message-router-connection-close-reconnect.js handleConnectionClose, since
// a662f2b10), but the inbound record is created without the reconnect
// counter (message-router-server-lifecycle.js handleIncomingConnection), so
// scheduleReconnect computes `undefined + 1` = NaN: the attempt bound never
// holds and the backoff delay is NaN, which a timer runs at once. The adopted
// end re-dials on every turn for as long as the peer is unreachable (GCP run 1
// of f580579a5, node fab780c9 at teardown: 51 refused re-dials in 517 ms).
//
// Contract: every connection record follows the one declared reconnect
// schedule, whichever end dialed. Over the same outage the adopted end dials
// as often as the dialing end, never twice within the schedule's shortest
// delay (reconnectIntervalMs), and its attempt count is a number. The
// adopted end still dials (it stays a reconnect owner).
//
// Real: two MessageRouters on their nodes' network clocks (IDENTIFY and
// adoption, close handling, the reconnect schedule and its timers).
// Substituted: the link (VirtualNetwork, 1 ms); the outage (the link's sockets
// closed and, for its length, dials to either node find no endpoint -
// ECONNREFUSED). No raft or other traffic: only the routers' own schedule
// dials.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {ROUTER_CLOCK, RaftRouterWorld} from './raft-frame-router-world.js';

const DIALER = 'rcs-a';
const ADOPTER = 'rcs-b';
const NODES = Object.freeze([DIALER, ADOPTER]);
const STEP_MS = 5;
// Six attempts of the declared schedule (1000, 1500, 2250, 3375, 5063,
// 7594 ms) fall inside it.
const OUTAGE_MS = 30000;
const WITNESS_TIMEOUT_MS = 300000;

function dialInstantsBy(world, dialer, severedAt) {
  const target = NODES.find((nodeId) => nodeId !== dialer);
  return world.refusedDials.filter((dial) => dial.to === target)
    .map((dial) => dial.atMs - severedAt);
}

function shortestGapMs(instants) {
  const gaps = instants.slice(1).map((atMs, index) => atMs - instants[index]);
  return gaps.length === 0 ? null : Math.min(...gaps);
}

function recordOf(world, owner) {
  const peer = NODES.find((nodeId) => nodeId !== owner);
  const connection = world.router(owner).nodeConnections.get(peer) ?? null;
  return {state: connection?.state ?? null,
    reconnectAttempts: connection?.reconnectAttempts ?? null};
}

test('F-2: the adopted end of a closed connection follows the declared ' +
  'reconnect schedule, as the dialing end does', {timeout: WITNESS_TIMEOUT_MS},
async () => {
  const world = new RaftRouterWorld({nodeIds: NODES,
    routerClock: ROUTER_CLOCK.NETWORK, dialPairs: [[DIALER, ADOPTER]]});
  await world.start();
  try {
    const adopted = world.router(ADOPTER).nodeConnections.get(DIALER);
    const dialed = world.router(DIALER).nodeConnections.get(ADOPTER);
    // The schedule under test: the adopter holds the dialer's inbound socket,
    // the dialer its own outbound one.
    assert.equal(adopted?.isIncoming, true, 'the adopter holds an inbound record');
    assert.equal(dialed?.isIncoming, false, 'the dialer holds an outbound record');
    const router = world.router(ADOPTER);
    const schedule = {reconnectIntervalMs: router.reconnectIntervalMs,
      reconnectBackoffMultiplier: router.reconnectBackoffMultiplier,
      reconnectMaxAttempts: router.reconnectMaxAttempts};
    world.blackout(NODES);
    world.severLink(DIALER, ADOPTER);
    const severedAt = world.network.now();
    await world.driveFor(OUTAGE_MS, STEP_MS);
    const dialerInstants = dialInstantsBy(world, DIALER, severedAt);
    const adopterInstants = dialInstantsBy(world, ADOPTER, severedAt);
    const measured = {
      schedule,
      dials: {dialer: dialerInstants.length, adopter: adopterInstants.length},
      shortestGapMs: {dialer: shortestGapMs(dialerInstants),
        adopter: shortestGapMs(adopterInstants)},
      firstDials: {dialer: dialerInstants.slice(0, 8),
        adopter: adopterInstants.slice(0, 8)},
      records: {dialer: recordOf(world, DIALER), adopter: recordOf(world, ADOPTER)},
    };
    const report = `measured ${JSON.stringify(measured)}`;
    // Anti-vacuity: both ends are reconnect owners and dialed.
    assert.ok(measured.dials.dialer > 0 && measured.dials.adopter > 0,
      `both ends dialed during the outage: ${report}`);
    assert.ok(Number.isFinite(measured.records.adopter.reconnectAttempts),
      `the adopted end counts its attempts: ${report}`);
    assert.ok(measured.shortestGapMs.adopter === null ||
      measured.shortestGapMs.adopter >= schedule.reconnectIntervalMs - STEP_MS,
    `the adopted end never re-dials within the schedule's shortest delay: ${report}`);
    assert.ok(Math.abs(measured.dials.adopter - measured.dials.dialer) <= 1,
      `the adopted end dials as often as the dialing end: ${report}`);
  } finally {
    world.heal();
    await world.end();
  }
});
