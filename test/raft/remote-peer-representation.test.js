// A remote participant is represented, not re-implemented.
//
// Base liferaft models a peer by CLONING the local runtime class, so every
// peer used to be a complete local Raft runtime: its own timers, log, election
// configuration and state machine, standing in for a participant hosted on
// another node. Measured across a whole production formation, an owner asked
// its representation for exactly two things - it SENT through write and
// DISPOSED of it with end - and the base library read its address. The rest of
// that inherited runtime was capability belonging to a different semantic
// role, and it acted on its own initiative: disposal alone made every cloned
// peer compute an election timeout and arm a heartbeat, for a participant it
// does not host.
//
// The defect was never a missing dependency. Handing those clones a
// deterministic clock and a seeded random source would have silenced the
// symptom and left a representation holding a state machine it has no standing
// to own. So the invariant these seal is ABSENCE OF PEER PROTOCOL AUTHORITY,
// not absence of ambient reads - which is why the last test here supplies a
// representation with both substrates and shows it still cannot become a
// participant.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import BaseLifeRaft from '@markwylde/liferaft';
import LifeRaft from '../../src/raft/liferaft.js';
import {
  RemotePeerRepresentation,
  createRemotePeerRepresentation,
} from '../../src/raft/remote-peer-representation.js';

const PEER_ADDRESS = 'node-b/partition/users-p1-r2';
// Everything a local Raft runtime can do that a representation must not.
const PROTOCOL_AUTHORITY = Object.freeze([
  'timeout', 'heartbeat', 'promote', 'join', 'leave', 'change', 'message',
  'packet', 'indefinitely', 'timing', 'quorum', 'majority',
]);

function virtualTimeSource() {
  return {
    now: () => 0,
    setTimeout: () => 1,
    clearTimeout: () => undefined,
    setInterval: () => 1,
    clearInterval: () => undefined,
    charge: () => undefined,
  };
}

test('1. joining a peer produces a representation, not a Raft runtime', () => {
  const owner = new LifeRaft('node-a/partition/users-p1-r1', {
    'timeSource': virtualTimeSource(),
    'randomSource': {random: () => 0.5},
    'election min': 100, 'election max': 200,
  });
  const peer = owner.join(PEER_ADDRESS);

  assert.ok(peer, 'the owner still has a peer to send through');
  assert.equal(peer.address, PEER_ADDRESS, 'identity is unchanged');
  assert.ok(peer instanceof RemotePeerRepresentation);
  assert.ok(!(peer instanceof BaseLifeRaft),
    'and it is not a Raft runtime of any kind');
  assert.equal(owner.nodes.length, 1,
    'the owner counts it for quorum exactly as before');
  assert.equal(owner.nodes[0], peer);
});

test('2. a representation has no protocol authority to exercise', () => {
  const peer = createRemotePeerRepresentation({
    address: PEER_ADDRESS, write: (_packet, callback) => callback(null, {}),
  });
  for (const name of PROTOCOL_AUTHORITY) {
    assert.equal(typeof peer[name], 'undefined',
      `a representation must not be able to ${name}`);
  }
  // Nor the substrate a participant would need to act on its own.
  for (const field of ['timers', 'log', 'election', 'beat', 'state']) {
    assert.equal(peer[field], undefined,
      `a representation must not carry ${field}`);
  }
});

test('3. the owner still sends through its representation', () => {
  const sent = [];
  const owner = new LifeRaft('node-a/partition/users-p1-r1', {
    'timeSource': virtualTimeSource(),
    'randomSource': {random: () => 0.5},
    'election min': 100, 'election max': 200,
  });
  // The owner class's own write travels with the representation, so the
  // destination is still read from `this.address`.
  owner.write = function write(packet, callback) {
    sent.push({to: this.address, packet});
    callback(null, {ok: true});
  };
  const peer = owner.join(PEER_ADDRESS);
  let result = null;
  peer.write({type: 'append'}, (error, value) => {
    result = {error, value};
  });
  assert.deepEqual(sent, [{to: PEER_ADDRESS, packet: {type: 'append'}}],
    'the packet reached the remote address the representation stands for');
  assert.deepEqual(result, {error: null, value: {ok: true}});
});

test('4. owner-directed disposal stays valid, and stays representation-only',
  () => {
    const owner = new LifeRaft('node-a/partition/users-p1-r1', {
      'timeSource': virtualTimeSource(),
      'randomSource': {random: () => 0.5},
      'election min': 100, 'election max': 200,
    });
    const peer = owner.join(PEER_ADDRESS);

    // The owner reaches disposal twice - directly, and through the leave()
    // its own end-signal triggers - so it has to be idempotent.
    assert.equal(peer.end(), true, 'the first disposal takes effect');
    assert.equal(peer.end(), false, 'and the second is a no-op');
    assert.equal(owner.nodes.length, 0,
      'disposal still removes the peer from the owner\'s membership');

    // Every lifecycle operation production legitimately exposes, exercised
    // against the representation. None may cross into protocol lifecycle.
    const secondPeer = owner.join(PEER_ADDRESS);
    const crossings = [];
    for (const name of PROTOCOL_AUTHORITY) {
      if (typeof secondPeer[name] === 'function') crossings.push(name);
    }
    owner.leave(secondPeer);
    for (const name of PROTOCOL_AUTHORITY) {
      if (typeof secondPeer[name] === 'function') crossings.push(name);
    }
    assert.deepEqual(crossings, [],
      'no lifecycle operation gives a representation protocol authority');
  });

test('5. supplying deterministic substrates cannot restore the old abstraction',
  () => {
    // The adversarial case. If the invariant were "no ambient reads", a
    // future change could hand peers a clock and a seeded source and call it
    // repaired. The invariant is that a representation is not a participant,
    // so substrates are simply not something it can hold.
    const owner = new LifeRaft('node-a/partition/users-p1-r1', {
      'timeSource': virtualTimeSource(),
      'randomSource': {random: () => 0.5},
      'election min': 100, 'election max': 200,
    });
    const peer = owner.join(PEER_ADDRESS);
    peer.timeSource = virtualTimeSource();
    peer.randomSource = {random: () => 0.5};
    peer._electionRandomSource = {random: () => 0.5};

    assert.equal(typeof peer.timeout, 'undefined',
      'a representation with a clock still cannot compute an election timeout');
    assert.equal(typeof peer.heartbeat, 'undefined',
      'nor arm a heartbeat');
    assert.ok(!(peer instanceof BaseLifeRaft),
      'nor has it become a runtime by acquiring substrates');
  });
