/**
 * Test for append ack packet detection.
 *
 * Liferaft sends 'append ack' packets when a follower successfully appends
 * an entry and acknowledges it back to the leader. This is distinct from
 * 'appended' which is the initial response to an append request.
 *
 * Without proper detection, these packets are treated as unknown application
 * messages, causing "Unknown message type received" warnings and breaking
 * Raft consensus (leadership flapping).
 */

import {test} from '../../src/test-helpers/tap.js';
import {isRaftPacket, RAFT_PACKET_TYPES} from '../../src/raft/raft-packet-utils.js';
import {RAFT_PACKET_TYPE} from '../../src/raft/constants.js';

test('isRaftPacket detects append ack packets from liferaft', async (t) => {
  // This is the exact packet format liferaft generates when acknowledging
  // a successfully appended entry back to the leader.
  // See: node_modules/@markwylde/liferaft/index.js
  const appendAckPacket = {
    type: 'append ack',
    data: {
      term: 1,
      index: 5,
    },
    address: 'node-1/partition/test-p1-r1',
  };

  const result = isRaftPacket(appendAckPacket);

  t.ok(result, 'append ack packet should be detected as a Raft packet');
  t.end();
});

test('RAFT_PACKET_TYPE includes APPEND_ACK constant', async (t) => {
  t.ok(
    RAFT_PACKET_TYPE.APPEND_ACK,
    'RAFT_PACKET_TYPE should have APPEND_ACK constant',
  );
  t.equal(
    RAFT_PACKET_TYPE.APPEND_ACK,
    'append ack',
    'APPEND_ACK should equal "append ack"',
  );
  t.end();
});

test('RAFT_PACKET_TYPES set includes append ack', async (t) => {
  t.ok(
    RAFT_PACKET_TYPES.has('append ack'),
    'RAFT_PACKET_TYPES should include "append ack"',
  );
  t.end();
});

test('all liferaft packet types are recognized', async (t) => {
  // All packet types that liferaft can send
  const liferaftPacketTypes = [
    'vote',
    'voted',
    'append',
    'appended',
    'append fail',
    'append ack',
    'exec',
    'error',
  ];

  for (const packetType of liferaftPacketTypes) {
    const packet = {type: packetType, term: 1};
    t.ok(
      isRaftPacket(packet),
      `packet type "${packetType}" should be recognized as Raft packet`,
    );
  }
  t.end();
});
