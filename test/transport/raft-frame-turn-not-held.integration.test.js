// Census C5-C7 of the raft frame delivery record
// (lagrange-takeover-20261121/reports/raft-frame-delivery-record.md): a raft
// group's turn does not wait on the delivery of its messages to a slow or
// unconnected peer.
//
// The group's peer delivery awaits each message's delivery before the next
// one and before the turn ends (raft-rs-peer-delivery.js sendMessages). Today
// a message to a peer this node holds no connection to takes the router's
// fallback path: a delivery-triggered dial, then an ACK wait and a
// SERVICE_RESPONSE wait over the slow link (message-router-delivery-behaviors.js
// deliverRemote, message-router-ack-delivery.js sendWithAck), so the turn is
// held for at least two crossings of that link. The contract: the turn ends
// without waiting on the link (red today: about 2 x SLOW_LINK_EXTRA_MS).
//
// Anti-vacuity: the campaign's pre-vote reaches the connected follower and
// the leader is elected by it.
//
// Real: three MessageRouters on their nodes' network clocks; a three-replica
// raft-rs partition (PartitionNodeCluster -> createRaftRsOperationPort) whose
// candidate sends through the SEND_TO_PEER closure. Substituted: the link
// (VirtualNetwork, 1 ms, plus SLOW_LINK_EXTRA_MS on the candidate's link to
// the third node, which it was never connected to); the receiving handler
// (the partition handler's raft branch).
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {ROUTER_CLOCK, RaftRouterWorld} from './raft-frame-router-world.js';

const NODE_A = 'rft-a';
const NODE_B = 'rft-b';
const NODE_C = 'rft-c';
const PARTITION_ID = 'rft-p1';
const CANDIDATE = 'rft-p1-r1';
const CONNECTED_FOLLOWER = 'rft-p1-r2';
const SLOW_FOLLOWER = 'rft-p1-r3';
const SLOW_LINK_EXTRA_MS = 2000;
const HOLD_BOUND_MS = 10000;
const ELECTION_BOUND_MS = 3000;
// Elections and a slow link on a shared, slow lab host.
const WITNESS_TIMEOUT_MS = 120000;

test('C7: a raft group\'s turn does not wait on a slow, unconnected peer',
  {timeout: WITNESS_TIMEOUT_MS}, async () => {
    const world = new RaftRouterWorld({
      nodeIds: [NODE_A, NODE_B, NODE_C],
      groups: [{partitionId: PARTITION_ID, replicas: [[CANDIDATE, NODE_A],
        [CONNECTED_FOLLOWER, NODE_B], [SLOW_FOLLOWER, NODE_C]]}],
      routerClock: ROUTER_CLOCK.NETWORK,
      // The candidate's node holds no connection to the slow follower's node.
      dialPairs: [[NODE_A, NODE_B], [NODE_B, NODE_C]],
      slowLinks: [[NODE_A, NODE_C, SLOW_LINK_EXTRA_MS]],
    });
    await world.start();
    try {
      const startedAt = world.network.now();
      let endedAt = null;
      const turn = Promise.resolve(turnChainValue(world.node(CANDIDATE).campaign()))
        .then(() => {
          endedAt = world.network.now();
        });
      while (endedAt === null && world.network.now() < startedAt + HOLD_BOUND_MS) {
        await world.driveFor(1);
      }
      await world.driveUntil(() => world.isLeader(CANDIDATE), ELECTION_BOUND_MS);
      const measured = {
        heldMs: endedAt === null ? null : endedAt - startedAt,
        dials: world.dials,
        raftSends: world.raftSends.map((send) =>
          `${send.fromNode}>${send.toNode}@${send.atMs}`),
      };
      const report = `measured ${JSON.stringify(measured)}`;
      assert.ok(world.raftReceipts.some((receipt) =>
        receipt.replicaId === CONNECTED_FOLLOWER),
      `the pre-vote reached the connected follower: ${report}`);
      assert.ok(endedAt !== null, `the campaign turn ended: ${report}`);
      assert.ok(measured.heldMs < SLOW_LINK_EXTRA_MS,
        `the turn did not wait on the slow, unconnected peer: ${report}`);
      await turn;
    } finally {
      await world.end();
    }
  });
