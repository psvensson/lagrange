// Residual R-1 of the raft frame delivery record
// (lagrange-takeover-20261121/reports/raft-frame-delivery-record.md, census
// C1-C3): what the keepalive, quarantine and ping guards decide about a peer
// that answers no raft at all and shares no other traffic, while its link is
// slow enough that every keepalive pong misses its deadline.
//
// Before repair (e) the peer's router answers each raft frame with an ACK
// and a SERVICE_RESPONSE, and those frames are the inbound evidence the
// guards read (message-router-inbound-dispatch.js recordNodeInboundActivity).
// After (e) a raft frame is answered by nothing. The guards must still find
// the peer alive: its late pongs and its own keepalive pings are evidence
// too. The test is the same before and after; if it turns red after (e),
// the repair changed this outcome and the line stops on it.
//
// In exactly this case the ACK-timeout quarantine guard is never consulted:
// there is no ACK-path delivery to time out. The witness asserts that the
// connection survives (no quarantine, no keepalive sever) and that a ping
// probe at two instants is answered "reachable".
//
// Real: two MessageRouters on their nodes' network clocks with the default
// keepalive (30 s interval, 1 s pong deadline, 2 misses, 30 s liveness
// window). Substituted: the link (VirtualNetwork, SLOW_LINK_MS each way); the
// raft traffic (a raft-rs heartbeat envelope through the router's send entry
// every 60 ms, to an address the peer has no handler for).
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {TRANSPORT_EVENT} from '../../src/constants/transport.js';
import {RAFT_RS_MESSAGE_TYPE, RAFT_RS_TRANSPORT_PROTOCOL} from
  '../../src/raft/raft-rs-ingress-constants.js';
import {ROUTER_CLOCK, RaftRouterWorld} from './raft-frame-router-world.js';

const NODE_A = 'rfl-a';
const NODE_B = 'rfl-b';
// Slower than half the pong deadline each way, so every pong is late.
const SLOW_LINK_MS = 1500;
const RAFT_SEND_EVERY_MS = 60;
const RUN_MS = 125000;
const STEP_MS = 5;
const SAMPLE_EVERY_MS = 1000;
const PING_PROBE_AT_MS = Object.freeze([45000, 105000]);
const UNANSWERED_ADDRESS = `${NODE_B}/partition/rfl-absent-r2`;
// Four keepalive cycles over a slow link on a shared, slow lab host.
const WITNESS_TIMEOUT_MS = 300000;

function heartbeatEnvelope() {
  return {protocol: RAFT_RS_TRANSPORT_PROTOCOL, groupId: 'rfl-absent',
    from: '1', to: '2', message: {msgType: RAFT_RS_MESSAGE_TYPE.HEARTBEAT,
      from: '1', to: '2', term: '1', commit: '0'}};
}

test('R-1: a slow peer that answers no raft and shares no other traffic ' +
  'stays alive to the keepalive, quarantine and ping guards',
{timeout: WITNESS_TIMEOUT_MS}, async () => {
  const world = new RaftRouterWorld({nodeIds: [NODE_A, NODE_B],
    linkDelayMs: SLOW_LINK_MS, routerClock: ROUTER_CLOCK.NETWORK,
    dialPairs: [[NODE_A, NODE_B]]});
  await world.start();
  try {
    const routerA = world.router(NODE_A);
    const connectionAtStart = routerA.nodeConnections.get(NODE_B).connectionId;
    const closures = [];
    routerA.on(TRANSPORT_EVENT.CONNECTION_CLOSED, (event) => {
      closures.push({atMs: world.network.now(), nodeId: event?.nodeId ?? null});
    });
    const sendErrors = [];
    const stopRaft = world.every(NODE_A, RAFT_SEND_EVERY_MS, () => {
      world.sendRaftEnvelope(NODE_A, UNANSWERED_ADDRESS, heartbeatEnvelope())
        .then(undefined, (error) => sendErrors.push(String(error?.message)));
    });
    const startedAt = world.network.now();
    const framesBefore = world.frames.length;
    const pings = [];
    let maxEvidenceAgeMs = 0;
    let maxMissedPings = 0;
    let nextSampleAt = startedAt;
    const probes = [...PING_PROBE_AT_MS];
    while (world.network.now() < startedAt + RUN_MS) {
      const elapsed = world.network.now() - startedAt;
      if (probes.length > 0 && elapsed >= probes[0]) {
        probes.shift();
        const probe = {atMs: elapsed, reachable: null};
        pings.push(probe);
        routerA.pingNode(NODE_B).then((reachable) => {
          probe.reachable = reachable;
        });
      }
      if (world.network.now() >= nextSampleAt) {
        nextSampleAt += SAMPLE_EVERY_MS;
        const lastInbound = routerA.getNodeInboundActivityAt(NODE_B) ?? 0;
        maxEvidenceAgeMs = Math.max(maxEvidenceAgeMs,
          world.network.now() - lastInbound);
        maxMissedPings = Math.max(maxMissedPings,
          routerA.nodeConnections.get(NODE_B)?.missedPings ?? 0);
      }
      await world.driveFor(STEP_MS, STEP_MS);
    }
    stopRaft();
    const fromB = world.dataFramesBetween(NODE_B, NODE_A, framesBefore);
    const measured = {
      raftFramesSent: world.dataFramesBetween(NODE_A, NODE_B, framesBefore)
        .filter((frame) => frame.raft).length,
      framesFromBByType: fromB.reduce((counts, frame) =>
        ({...counts, [frame.type]: (counts[frame.type] ?? 0) + 1}), {}),
      maxEvidenceAgeMs, maxMissedPings, pings, closures, sendErrors,
      connectionUnchanged:
        routerA.nodeConnections.get(NODE_B)?.connectionId === connectionAtStart,
    };
    const report = `measured ${JSON.stringify(measured)}`;
    // Anti-vacuity: raft really went one way and the keepalive really
    // missed its pongs, so the guards were consulted.
    assert.ok(measured.raftFramesSent >= RUN_MS / RAFT_SEND_EVERY_MS / 2,
      `raft frames went to the peer throughout: ${report}`);
    assert.deepEqual(sendErrors, [], `every raft send settled: ${report}`);
    assert.ok(maxMissedPings >= 1,
      `the slow link made the keepalive miss its pongs: ${report}`);
    // The outcome that must not change: the peer stays alive to every guard.
    assert.deepEqual({
      connectionUnchanged: measured.connectionUnchanged,
      closures: closures.length,
      pingsReachable: pings.map((probe) => probe.reachable),
    }, {
      connectionUnchanged: true,
      closures: 0,
      pingsReachable: PING_PROBE_AT_MS.map(() => true),
    }, `the guards keep the slow, raft-silent peer: ${report}`);
  } finally {
    await world.end();
  }
});
