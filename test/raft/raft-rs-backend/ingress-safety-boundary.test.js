// Receipts:
//   ingress-validation-refuses-routing-faults-and-admits-transition-traffic
//   hostile-messages-that-still-reach-a-trap-are-enumerated
//
// The boundary around `step` validates what the host can know
// authoritatively - group and partition identity, the recipient, the
// envelope's shape - and nothing else (binding direction §6). It never refuses
// a sender for being absent from the receiver's applied configuration: the
// round-3 verifier measured that rule dropping legitimate traffic ("Peer 3
// refused all 8 messages from 5 ... Entry 6 never commits", round-3.md,
// attack c), and that scenario is driven here against this boundary.
//
// Expectations come from the core and from the vendored binding: the message
// and entry type ranges the validator accepts are read out of the binding's
// own `num_to_msg_type` and `num_to_entry_type`, and the list of hostile
// shapes that must be driven is read out of the owner's §7. Nothing is
// declared by this file.

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';
import {TextEncoder} from 'node:util';

import {
  parameterNamesOf,
  parseRepositoryModule,
  readRepositoryFile,
} from './module-shape.js';
import {
  RAFT_RS_INGRESS_OUTCOME,
  RAFT_RS_INGRESS_REFUSAL,
  admitRaftRsMessage,
  dispatchRaftRsMessage,
} from '../../../src/raft/raft-rs-ingress.js';
import {
  RAFT_RS_MESSAGE_TYPE_RANGE,
} from '../../../src/raft/raft-rs-ingress-constants.js';
import {
  RAFT_RS_ENTRY_TYPE,
} from '../../../src/raft/raft-rs-ready-loop-constants.js';
import {
  DeterministicRaftRsCluster,
} from './deterministic-raft-rs-cluster.js';
import {
  HOSTILE_SHAPE,
  OWNER_HOSTILE_SHAPE_TEXT,
  hostileShapeProbePath,
} from './hostile-message-shapes.js';

const GROUP_ID = 'partition-under-test';
const OTHER_GROUP_ID = 'a-different-partition';
const VOTERS = Object.freeze(['1', '2', '3']);
const FOUNDING_LEADER = '1';
const PARTITIONED = '3';
const JOINING_VOTER = '5';
const ADD_NODE_CHANGE_TYPE = 0;
const CONF_CHANGE_AUTO_TRANSITION = 0;
const MSG_HEARTBEAT = 8;
const SETTLE_ROUNDS = 200;
const INGRESS_MODULE = 'src/raft/raft-rs-ingress.js';
const BINDING_SOURCE = 'src/raft/raft-rs-wasm/src/lib.rs';
const ADMIT_FUNCTION = 'admitRaftRsMessage';
// A parameter through which the validator could learn the applied
// configuration. It must have none of them.
const CONFIGURATION_SHAPED_NAME = /core|handle|conf|member|voter|peers/iu;
// A refusal name that would mean "the sender is not one of ours".
const SENDER_MEMBERSHIP_WORD = /member|voter|conf|configuration|unknown_peer/iu;
const TEXT_ENCODING = 'utf8';
const PROBE_TIMEOUT_MS = 120_000;
const MATCH_ARM = /^\s*(\d+)\s*=>/gmu;

// The numbers the BINDING itself maps, read out of the vendored Rust. The
// validator's accepted range is checked against this, never against a number
// this file chose.
function bindingMatchArms(functionName) {
  const source = readRepositoryFile(BINDING_SOURCE);
  const start = source.indexOf(`fn ${functionName}(`);
  assert.ok(start > 0, `${functionName} must exist in the binding`);
  const body = source.slice(start, source.indexOf('\n}', start));
  return [...body.matchAll(MATCH_ARM)].map((match) => Number(match[1]));
}

// A core that records what reached `step` without running any Raft.
function recordingCore() {
  const stepped = [];
  return {stepped, step: (handle, message) => stepped.push({handle, message})};
}

function wellFormedHeartbeat(to) {
  return {
    from: FOUNDING_LEADER, to, msgType: MSG_HEARTBEAT,
    term: '1', logTerm: '0', index: '0', commit: '0',
  };
}

// Envelope and routing faults, each with the envelope that carries it.
function routingFaultCases(localPeerId) {
  const sound = wellFormedHeartbeat(localPeerId);
  return [
    ['a missing group id fails open unless it is refused',
      {to: localPeerId, message: sound},
      RAFT_RS_INGRESS_REFUSAL.MISSING_GROUP_ID],
    ['an empty group id is not a group id',
      {groupId: '', to: localPeerId, message: sound},
      RAFT_RS_INGRESS_REFUSAL.MISSING_GROUP_ID],
    ['cross-group delivery',
      {groupId: OTHER_GROUP_ID, to: localPeerId, message: sound},
      RAFT_RS_INGRESS_REFUSAL.GROUP_MISMATCH],
    ['no recipient on the envelope',
      {groupId: GROUP_ID, message: sound},
      RAFT_RS_INGRESS_REFUSAL.MISSING_RECIPIENT],
    ['a recipient that is not this peer',
      {groupId: GROUP_ID, to: JOINING_VOTER,
        message: wellFormedHeartbeat(JOINING_VOTER)},
      RAFT_RS_INGRESS_REFUSAL.RECIPIENT_MISMATCH],
    ['an envelope and a payload that disagree about the recipient',
      {groupId: GROUP_ID, to: localPeerId,
        message: wellFormedHeartbeat(JOINING_VOTER)},
      RAFT_RS_INGRESS_REFUSAL.RECIPIENT_MISMATCH],
    ['an envelope carrying no message',
      {groupId: GROUP_ID, to: localPeerId},
      RAFT_RS_INGRESS_REFUSAL.MALFORMED_ENVELOPE],
    ['a message with no type at all',
      {groupId: GROUP_ID, to: localPeerId,
        message: {from: FOUNDING_LEADER, to: localPeerId}},
      RAFT_RS_INGRESS_REFUSAL.MALFORMED_MESSAGE_TYPE],
    ['a message type the binding does not map',
      {groupId: GROUP_ID, to: localPeerId,
        message: {...sound, msgType: RAFT_RS_MESSAGE_TYPE_RANGE.MAX + 1}},
      RAFT_RS_INGRESS_REFUSAL.MALFORMED_MESSAGE_TYPE],
    ['a sender id that is not a raft peer id',
      {groupId: GROUP_ID, to: localPeerId,
        message: {...sound, from: 'not-a-peer-id'}},
      RAFT_RS_INGRESS_REFUSAL.MALFORMED_PEER_ID],
    ['a log position that is not a 64-bit decimal',
      {groupId: GROUP_ID, to: localPeerId,
        message: {...sound, index: '-1'}},
      RAFT_RS_INGRESS_REFUSAL.MALFORMED_POSITION],
    ['an entry of a type the binding does not map',
      {groupId: GROUP_ID, to: localPeerId,
        message: {...sound, entries: [{
          term: '1', index: '1',
          entryType: RAFT_RS_ENTRY_TYPE.CONF_CHANGE_V2 + 1,
        }]}},
      RAFT_RS_INGRESS_REFUSAL.MALFORMED_ENTRY],
  ];
}

// The membership race the round-3 verifier drove, under a chosen ingress
// rule. `senderRule` is given the receiving peer and the message and says
// whether the host lets it through; the boundary under test never asks.
function driveMembershipRace(senderRule) {
  const admitted = [];
  const refused = [];
  const cluster = new DeterministicRaftRsCluster({
    voters: VOTERS, groupId: GROUP_ID,
    dispatch: (peer, message) => {
      if (senderRule && !senderRule(cluster, peer, message)) {
        refused.push({to: peer.peerId, from: message.from});
        return;
      }
      const result = dispatchRaftRsMessage({
        core: cluster.core, handle: peer.handle,
        envelope: {groupId: GROUP_ID, to: peer.peerId, message},
        localGroupId: GROUP_ID, localPeerId: peer.peerId,
      });
      (result.admitted ? admitted : refused).push(result);
    },
  });
  cluster.campaign(FOUNDING_LEADER);
  cluster.settle((current) => current.leaderId() === FOUNDING_LEADER,
    {rounds: SETTLE_ROUNDS, ticking: false});
  assert.equal(cluster.leaderId(), FOUNDING_LEADER,
    'the founding leader must be elected before the race starts');

  // A new voter is added while one peer is partitioned. It is created
  // holding the configuration a member's core reports, and is not a member of
  // it until the group commits the change.
  cluster.addPeer(JOINING_VOTER, cluster.confState(FOUNDING_LEADER).voters);
  assert.ok(!cluster.confState(JOINING_VOTER).voters.includes(JOINING_VOTER));
  cluster.partition(PARTITIONED);
  const leader = cluster.peer(FOUNDING_LEADER);
  cluster.core.propose_conf_change_v2(leader.handle, {
    transition: CONF_CHANGE_AUTO_TRANSITION,
    changes: [{changeType: ADD_NODE_CHANGE_TYPE, nodeId: JOINING_VOTER}],
  });
  cluster.settle((current) => current
    .confState(JOINING_VOTER).voters.includes(JOINING_VOTER),
  {rounds: SETTLE_ROUNDS, ticking: false});
  assert.ok(cluster.confState(JOINING_VOTER).voters.includes(JOINING_VOTER),
    'the joining peer must have learned the configuration it is a voter in');

  // The new voter takes leadership on the votes of the peers that are up.
  cluster.campaign(JOINING_VOTER);
  cluster.settle((current) =>
    current.status(JOINING_VOTER).lead === JOINING_VOTER &&
    current.status('2').lead === JOINING_VOTER,
  {rounds: SETTLE_ROUNDS, ticking: false});
  assert.equal(cluster.status(JOINING_VOTER).lead, JOINING_VOTER,
    'the new voter must be leading before the partitioned peer returns');

  // The founding leader dies and the partitioned peer comes back. Only the
  // new leader's timer runs, so the returning peer never campaigns: what is
  // measured is whether IT accepts traffic, not who wins an election.
  cluster.crash(FOUNDING_LEADER);
  cluster.heal(PARTITIONED);
  const before = cluster.status(PARTITIONED).commit;
  cluster.core.propose(cluster.peer(JOINING_VOTER).handle,
    new TextEncoder().encode('after-the-race'));
  cluster.settle((current) =>
    BigInt(current.status(PARTITIONED).commit) > BigInt(before),
  {rounds: SETTLE_ROUNDS, tickOnly: [JOINING_VOTER]});
  const result = {
    commitBefore: before,
    commitOnReturned: cluster.status(PARTITIONED).commit,
    commitOnLeader: cluster.status(JOINING_VOTER).commit,
    configurationOnReturned: cluster.confState(PARTITIONED).voters,
    admitted: admitted.length,
    refused,
  };
  cluster.dispose();
  return result;
}

// The sender rule the verifier falsified, kept here only as the control that
// shows the scenario discriminates.
function senderMustBeInTheReceiversConfiguration(cluster, peer, message) {
  const confState = cluster.core.conf_state(peer.handle);
  return [...confState.voters, ...confState.learners].includes(message.from);
}

function runHostileShapeProbe(shape) {
  const stdout = execFileSync(process.execPath,
    [hostileShapeProbePath(), shape], {
      encoding: TEXT_ENCODING, timeout: PROBE_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  return JSON.parse(stdout);
}

test('the envelope boundary refuses routing faults and admits a membership ' +
  'transition', async () => {
  // The accepted ranges are the binding's own, read out of the vendored Rust.
  const messageArms = bindingMatchArms('num_to_msg_type');
  const entryArms = bindingMatchArms('num_to_entry_type');
  assert.equal(RAFT_RS_MESSAGE_TYPE_RANGE.MIN, Math.min(...messageArms));
  assert.equal(RAFT_RS_MESSAGE_TYPE_RANGE.MAX, Math.max(...messageArms));
  assert.equal(RAFT_RS_ENTRY_TYPE.CONF_CHANGE_V2, Math.max(...entryArms));

  // Every routing and envelope fault is refused by a NAMED state, and none of
  // them reaches the core.
  const localPeerId = VOTERS[0];
  for (const [why, envelope, expected] of routingFaultCases(localPeerId)) {
    const verdict = admitRaftRsMessage({
      envelope, localGroupId: GROUP_ID, localPeerId,
    });
    assert.equal(verdict.admitted, false, `${why} must be refused`);
    assert.equal(verdict.outcome, expected, `${why}: wrong refusal state`);
    const core = recordingCore();
    const dispatched = dispatchRaftRsMessage({
      core, handle: 1, envelope, localGroupId: GROUP_ID, localPeerId,
    });
    assert.equal(dispatched.outcome, expected);
    assert.deepEqual(core.stepped, [],
      `${why} reached step; a refused envelope must never get there`);
  }
  // A correctly routed, well-formed envelope is admitted and does reach step.
  const core = recordingCore();
  const sound = {
    groupId: GROUP_ID, to: localPeerId,
    message: wellFormedHeartbeat(localPeerId),
  };
  const admittedVerdict = dispatchRaftRsMessage({
    core, handle: 7, envelope: sound,
    localGroupId: GROUP_ID, localPeerId,
  });
  assert.equal(admittedVerdict.outcome, RAFT_RS_INGRESS_OUTCOME.ADMITTED);
  assert.deepEqual(core.stepped, [{handle: 7, message: sound.message}]);

  // No refusal this boundary can produce is a sender-membership refusal.
  for (const refusal of Object.values(RAFT_RS_INGRESS_REFUSAL)) {
    assert.ok(!SENDER_MEMBERSHIP_WORD.test(refusal),
      `${refusal} refuses a sender for who it is, not for how it arrived`);
  }
  // Structurally it could not apply one: the validator is given no core, no
  // handle and no configuration.
  const tree = parseRepositoryModule(INGRESS_MODULE);
  const names = parameterNamesOf(tree, ADMIT_FUNCTION);
  assert.ok(names.length > 0, 'the validator must have been found');
  for (const name of names) {
    assert.ok(!CONFIGURATION_SHAPED_NAME.test(name),
      `${ADMIT_FUNCTION} takes ${name}, through which the receiver's applied ` +
      'configuration could reach a refusal decision');
  }
  // The structural check can fail: the dispatcher does take a core.
  assert.ok(parameterNamesOf(tree, 'dispatchRaftRsMessage')
    .some((name) => CONFIGURATION_SHAPED_NAME.test(name)));

  // The membership race: a new voter's traffic must be admitted by a peer
  // that has not yet learned of it.
  const withBoundary = driveMembershipRace(null);
  assert.ok(
    BigInt(withBoundary.commitOnReturned) > BigInt(withBoundary.commitBefore),
    'the returning peer must commit the entry the new leader proposed');
  assert.equal(withBoundary.commitOnReturned, withBoundary.commitOnLeader,
    'the returning peer and the new leader must agree on the commit');
  assert.ok(
    withBoundary.configurationOnReturned.includes(JOINING_VOTER),
    'the returning peer must have learned the configuration that added the ' +
    'new voter');
  assert.deepEqual(withBoundary.refused, [],
    'the boundary refused legitimate membership-transition traffic');
  assert.ok(withBoundary.admitted > 0, 'traffic must have gone through it');

  // The control: the rule the verifier falsified stalls exactly this race.
  const withSenderRule = driveMembershipRace(
    senderMustBeInTheReceiversConfiguration);
  assert.ok(withSenderRule.refused.length > 0,
    'the falsified rule must refuse something, or the control proves nothing');
  assert.ok(
    BigInt(withSenderRule.commitOnReturned) <=
    BigInt(withSenderRule.commitBefore),
    'the falsified rule must stall the race the boundary under test passes');
});

test('every hostile message that still reaches a trap is enumerated',
  async () => {
    // The shapes the owner's §7 names, read out of the owner's own text.
    const ownerShapes = OWNER_HOSTILE_SHAPE_TEXT;
    assert.ok(ownerShapes.length > 0, '§7 must name the shapes to drive');
    const driven = Object.values(HOSTILE_SHAPE);
    for (const ownerShape of ownerShapes) {
      assert.ok(
        driven.some((shape) => shape.ownerText === ownerShape),
        `§7 names "${ownerShape}" and no shape is driven for it`);
    }

    const measured = [];
    for (const shape of driven) {
      const verdict = runHostileShapeProbe(shape.id);
      assert.equal(verdict.shape, shape.id);
      measured.push(verdict);
    }

    const refusedByValidator = measured.filter((row) => !row.admitted);
    const trapped = measured.filter((row) => row.admitted && row.trapped);
    const accepted = measured.filter((row) => row.admitted && !row.trapped);

    // Routing faults the host can know: refused, and never near the core.
    for (const row of refusedByValidator) {
      assert.ok(Object.values(RAFT_RS_INGRESS_REFUSAL).includes(row.outcome),
        `${row.shape} was refused by an unnamed state`);
      assert.equal(row.reachedStep, false,
        `${row.shape} was refused and still reached step`);
    }
    // §7's premise: correct routing validation does not make the core safe.
    assert.ok(trapped.length > 0,
      'not one hostile shape trapped; §7 records that some still do, so ' +
      'either the shapes are wrong or the finding has changed');
    for (const row of trapped) {
      assert.equal(row.reachedStep, true);
      assert.ok(typeof row.diagnosis === 'string' && row.diagnosis.length > 0,
        `${row.shape} trapped with no diagnosis captured; the panic hook's ` +
        'console.error is the only channel that carries one');
      assert.ok(row.runtimeUnhealthy,
        `${row.shape} trapped and the runtime was left healthy`);
    }
    for (const row of accepted) {
      assert.equal(row.trapped, false);
    }
    // A shape aimed at a leader must actually have met one, or what it
    // enumerates is not what it says.
    const atLeader = measured.find((row) =>
      row.shape === HOSTILE_SHAPE.EMPTY_READ_INDEX_TO_LEADER.id);
    assert.equal(atLeader.recipientLead, atLeader.recipient,
      'the leader-directed shape did not reach a peer that was leading');
    const atFollower = measured.find((row) =>
      row.shape === HOSTILE_SHAPE.EMPTY_READ_INDEX_TO_FOLLOWER.id);
    assert.notEqual(atFollower.recipientLead, atFollower.recipient,
      'the follower-directed shape reached a leader');

    // The enumeration is the measurement, and it accounts for every shape.
    assert.equal(
      refusedByValidator.length + trapped.length + accepted.length,
      driven.length);
    console.log('hostile ingress enumeration: %s',
      JSON.stringify(measured.map((row) => ({
        shape: row.shape,
        outcome: row.outcome,
        recipientWasLeader: row.recipientLead === row.recipient,
        trapped: row.trapped,
        diagnosis: row.trapped ?
          row.diagnosis.split('\n').slice(0, 2).join(' | ') : null,
      })), null, 1));
  });
