/**
 * Test for append fail packet detection.
 *
 * Bug: The liferaft library generates 'append fail' messages as part of its
 * Raft protocol when a follower cannot find a log entry at the specified index.
 * However, RAFT_PACKET_TYPES doesn't include 'append fail', causing these
 * packets to be treated as unknown application messages instead of Raft packets.
 *
 * This causes the partition service to log "Unknown message type received"
 * and return {acknowledged: false}, which can cause node joining to hang.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {isRaftPacket, RAFT_PACKET_TYPES} from '../../src/raft/raft-packet-utils.js';
import {RAFT_PACKET_TYPE} from '../../src/raft/constants.js';

test('isRaftPacket detects append fail packets from liferaft', async (t) => {
  // This is the exact packet format liferaft generates when append fails
  // See: node_modules/@markwylde/liferaft/index.js line 316
  const appendFailPacket = {
    type: 'append fail',
    term: 1,
    data: {
      term: 1,
      index: 5,
    },
    address: 'node-1/partition/replica-1',
  };

  const result = isRaftPacket(appendFailPacket);

  t.ok(result, 'append fail packet should be detected as a Raft packet');
});

test('RAFT_PACKET_TYPES includes append fail', async (t) => {
  t.ok(
    RAFT_PACKET_TYPES.has('append fail'),
    'RAFT_PACKET_TYPES should include "append fail"',
  );
});

test('RAFT_PACKET_TYPE constant includes APPEND_FAIL', async (t) => {
  t.ok(
    RAFT_PACKET_TYPE.APPEND_FAIL,
    'RAFT_PACKET_TYPE should have APPEND_FAIL constant',
  );
  t.equal(
    RAFT_PACKET_TYPE.APPEND_FAIL,
    'append fail',
    'APPEND_FAIL should equal "append fail"',
  );
});

test('all liferaft packet types are recognized', async (t) => {
  // All packet types that liferaft can generate
  // From node_modules/@markwylde/liferaft/index.js
  const liferaftPacketTypes = [
    'vote', // Request vote
    'voted', // Vote response
    'append', // Append entries
    'appended', // Append entries response
    'append fail', // Append entries failure (log mismatch)
  ];

  for (const packetType of liferaftPacketTypes) {
    const packet = {type: packetType, term: 1};
    t.ok(
      isRaftPacket(packet),
      `packet type "${packetType}" should be recognized as Raft packet`,
    );
  }
});
