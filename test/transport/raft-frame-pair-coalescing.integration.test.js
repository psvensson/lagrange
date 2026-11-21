// Red witness (c1) of the raft frame delivery record
// (lagrange-takeover-20261121/reports/raft-frame-delivery-record.md):
// between two nodes the router writes a number of frames per second that
// does not grow with the number of raft groups the pair shares. Raft
// envelopes for one node pair leave together (framing only: every envelope
// delivered unchanged and in order per group).
//
// Today (red): every raft envelope is its own frame plus an ACK frame and a
// SERVICE_RESPONSE frame, so frames per node pair per second are
// proportional to the groups the pair hosts.
//
// Anti-vacuity: the raft envelopes the receiving handlers took do grow with
// the groups, and no group changed leader or term in the window.
//
// Real: three MessageRouters and G three-replica raft-rs partitions, one
// replica per node, every raft envelope through the SEND_TO_PEER closure
// body in both directions. Substituted: see raft-frame-router-world.js.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RAFT_ROLE} from '../../src/raft/constants.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {RaftRouterWorld} from './raft-frame-router-world.js';

const NODES = Object.freeze(['rfc-a', 'rfc-b', 'rfc-c']);
const GROUP_COUNTS = Object.freeze([4, 8, 16]);
const ELECTION_BOUND_MS = 3000;
const SETTLE_MS = 300;
const WINDOW_MS = 1000;
// Independent of the group count: the largest world may write at most this
// many times the frames per pair of the smallest (today it writes about the
// ratio of their group counts, here 4).
const MAX_FRAME_GROWTH = 1.5;
// The traffic itself must grow with the groups, or the window measured an
// idle link.
const MIN_ENVELOPE_GROWTH = 3;
// Three router worlds on a shared, slow lab host.
const WITNESS_TIMEOUT_MS = 300000;

function groupsOf(count) {
  return Array.from({length: count}, (_, index) => {
    const partitionId = `rfc-g${index}`;
    return {partitionId, replicas: NODES.map((nodeId, position) =>
      [`${partitionId}-r${position + 1}`, nodeId])};
  });
}

function leadersOf(world, groups) {
  return groups.map(({partitionId, replicas}) => {
    const statuses = replicas.map(([replicaId]) =>
      world.node(replicaId).readStatus());
    const leader = statuses.find((status) => status.role === RAFT_ROLE.LEADER);
    return {partitionId, leaderId: leader?.replicaIdentity ?? null,
      term: leader?.term ?? null,
      agreed: statuses.every((status) =>
        status.leaderId === (leader?.replicaIdentity ?? null))};
  });
}

async function measure(groupCount) {
  const groups = groupsOf(groupCount);
  const world = new RaftRouterWorld({nodeIds: NODES, groups});
  await world.start();
  try {
    world.startScheduling();
    // Each group's node-b replica stands first; the others are followers.
    for (const {replicas} of groups) {
      await turnChainValue(world.node(replicas[1][0]).campaign());
    }
    await world.driveUntil(() => leadersOf(world, groups).every(
      (group) => group.leaderId !== null && group.agreed), ELECTION_BOUND_MS);
    await world.driveFor(SETTLE_MS);
    const before = leadersOf(world, groups);
    const framesBefore = world.frames.length;
    const receiptsBefore = world.raftReceipts.length;
    await world.driveFor(WINDOW_MS);
    const after = leadersOf(world, groups);
    const pairs = {};
    for (const from of NODES) {
      for (const to of NODES) {
        if (from !== to) {
          pairs[`${from}>${to}`] =
            world.dataFramesBetween(from, to, framesBefore).length;
        }
      }
    }
    return {
      groupCount,
      pairs,
      raftEnvelopesReceived: world.raftReceipts.length - receiptsBefore,
      leadershipStable: JSON.stringify(before) === JSON.stringify(after),
    };
  } finally {
    await world.end();
  }
}

test('(c1) frames per node pair per second do not grow with the raft ' +
  'groups the pair shares', {timeout: WITNESS_TIMEOUT_MS}, async () => {
  const results = [];
  for (const groupCount of GROUP_COUNTS) {
    results.push(await measure(groupCount));
  }
  const report = `measured per ${WINDOW_MS} virtual ms ${JSON.stringify(results)}`;
  const smallest = results[0];
  const largest = results[results.length - 1];
  for (const result of results) {
    assert.equal(result.leadershipStable, true,
      `no group changed leader or term in the window: ${report}`);
  }
  assert.ok(largest.raftEnvelopesReceived >=
    MIN_ENVELOPE_GROWTH * smallest.raftEnvelopesReceived,
  `raft traffic grows with the groups: ${report}`);
  const growth = Object.fromEntries(Object.keys(smallest.pairs).map((pair) =>
    [pair, largest.pairs[pair] / Math.max(1, smallest.pairs[pair])]));
  assert.ok(Object.values(growth).every((ratio) => ratio <= MAX_FRAME_GROWTH),
    `frames per pair grew ${JSON.stringify(growth)} from ${smallest.groupCount} ` +
    `to ${largest.groupCount} groups (allowed ${MAX_FRAME_GROWTH}): ${report}`);
});
