/**
 * Test for append fail packet detection.
 *
 * Bug history: the retired native runtime generated 'append fail' messages as part of its
 * Raft protocol when a follower cannot find a log entry at the specified index.
 * However, RAFT_PACKET_TYPES doesn't include 'append fail', causing these
 * packets to be treated as unknown application messages instead of Raft packets.
 *
 * This causes the partition service to log "Unknown message type received"
 * and return {acknowledged: false}, which can cause node joining to hang.
 */

import {test} from '../../src/test-helpers/tap.js';
import {isRaftPacket, RAFT_PACKET_TYPES} from '../../src/raft/raft-packet-utils.js';
import {RAFT_PACKET_TYPE} from '../../src/raft/constants.js';

test('isRaftPacket detects native append fail packets', async (t) => {
  // This is the native packet shape used when append fails
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

test('all supported native Raft packet types are recognized', async (t) => {
  // All packet types retained by the native transport classifier
  const nativePacketTypes = [
    'vote', // Request vote
    'voted', // Vote response
    'append', // Append entries
    'appended', // Append entries response
    'append fail', // Append entries failure (log mismatch)
  ];

  for (const packetType of nativePacketTypes) {
    const packet = {type: packetType, term: 1};
    t.ok(
      isRaftPacket(packet),
      `packet type "${packetType}" should be recognized as Raft packet`,
    );
  }
});
