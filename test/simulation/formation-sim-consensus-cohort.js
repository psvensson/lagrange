// A staged raft-rs cohort over the virtual network: one replica group whose
// seed founds it alone, and whose joiners are admitted at their scheduled
// join time (join times are data). Every replica is a real raft-rs
// operation port built through the production backend seam, on its own
// replica database, with the node's network clock and the node's own seeded
// randomness as its substrate (the port draws its group's election seed from
// that randomness, owner decision O2); the core decides every election,
// commit and configuration.
//
// The seed founds the group from a GENESIS stamp and campaigns once, the
// production lone-replica rule. A joiner joins the production partition way:
// the leader's bootstrap read of its committed membership is the joiner's
// COMMITTED stamp, every member reserves the joiner and admits it through
// the group-neutral admission owner (only the leader proposes), and the
// joiner's participation gate holds its scheduling until it applies its own
// admission. Admissions a member deferred or could not propose are re-driven
// when a configuration change settles and when it gains leadership, as the
// message group re-drives them.
//
// Every delivered envelope and every timer the port arms is one
// raft_protocol segment charged to its node under the deterministic guard.

import Database from 'better-sqlite3';

import {FORMATION_OWNER} from '../../src/diagnostics/formation-diagnostics-contract.js';
import {runOnExecutionNode} from '../../src/diagnostics/formation-turn-attribution.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
} from '../../src/raft/raft-committed-membership-constants.js';
import {
  committedStampOfAnswer, genesisStamp,
} from '../../src/raft/raft-committed-membership-stamp.js';
import {RAFT_EVENT, RAFT_OPERATION} from '../../src/raft/raft-operation-port-constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from '../../src/raft/raft-operation-port-request.js';
import {createRaftRsOperationPort} from '../../src/raft/raft-rs-operation-port.js';
import {
  reserveAndAdmitGroupPeer, takeGroupAdmissionsInFlight,
} from '../../src/raft/raft-rs-group-membership-admission.js';
import {guardedDispatch} from './formation-sim-guard.js';

const ENVELOPE_MESSAGE = 'raftRsEnvelope';
const IN_MEMORY_DATABASE = ':memory:';
const QUIET_LOGGER = Object.freeze({warn() {}, info() {}, debug() {}, error() {}});

/**
 * One cohort (one raft group) with staged membership.
 * @param {object} options
 * @param {object} options.network
 * @param {string} options.groupId
 * @param {string} options.seedId
 * @param {number} options.linkDelayMs
 * @param {object} options.timing - The port timing ({electionMinMs, heartbeatMs, ...}).
 * @param {ChargeAccumulator} options.charges
 * @returns {{admit: Function, ports: Map, leaderId: Function, isFormed: Function,
 *   handleMessage: Function, groupId: string, end: Function}}
 */
function createStagedCohort({network, groupId, seedId, linkDelayMs, timing, charges,
  randomSources}) {
  const ports = new Map();
  const databases = new Map();
  const pendingJoins = [];

  // A timer armed by the port fires as a Raft owner turn: the callback is
  // one raft_protocol segment on its node, under the guard.
  function chargingTimeSource(nodeId) {
    const source = network.networkTimeSource(nodeId);
    const wrap = (fn) => (...args) => {
      charges.segment(nodeId, FORMATION_OWNER.RAFT_PROTOCOL);
      return guardedDispatch(FORMATION_OWNER.RAFT_PROTOCOL, () => fn(...args));
    };
    return Object.freeze({
      now: () => source.now(),
      setTimeout: (fn, ms, ...args) => source.setTimeout(wrap(fn), ms, ...args),
      clearTimeout: (handle) => source.clearTimeout(handle),
      setInterval: (fn, ms, ...args) => source.setInterval(wrap(fn), ms, ...args),
      clearInterval: (handle) => source.clearInterval(handle),
      charge: (opKey, inputSize) => source.charge(opKey, inputSize),
    });
  }

  function handleMessage(nodeId, message) {
    const port = ports.get(nodeId);
    if (!port || message.type !== ENVELOPE_MESSAGE ||
        message.payload?.groupId !== groupId) {
      return false;
    }
    charges.segment(nodeId, FORMATION_OWNER.RAFT_PROTOCOL);
    guardedDispatch(FORMATION_OWNER.RAFT_PROTOCOL, () =>
      port.step(message.payload.envelope));
    return true;
  }

  function statusOf(nodeId) {
    return runOnExecutionNode(nodeId, () => ports.get(nodeId).readStatus());
  }

  function leaderId() {
    for (const nodeId of ports.keys()) {
      if (statusOf(nodeId)?.role === RAFT_ROLE.LEADER) return nodeId;
    }
    return null;
  }

  // Formed for this group: one leader, every member knows it, and the
  // leader's configuration holds every expected member.
  function isFormed(expectedMembers) {
    const leader = leaderId();
    if (leader === null || ports.size !== expectedMembers ||
        statusOf(leader).confState?.voters?.length !== expectedMembers) {
      return false;
    }
    for (const nodeId of ports.keys()) {
      if (statusOf(nodeId)?.leaderId !== leader) return false;
    }
    return true;
  }

  function admissionGroup(nodeId) {
    return {groupId, localReplicaIdentity: nodeId, logger: QUIET_LOGGER};
  }

  // Every member reserves the joiner and admits it; only the leader
  // proposes, and the others record why they did not.
  function admitOnEveryMember(joinerId) {
    for (const [memberId, port] of ports) {
      runOnExecutionNode(memberId, () => reserveAndAdmitGroupPeer(port,
        admissionGroup(memberId), {replicaIdentity: joinerId, peerAddress: joinerId}));
    }
  }

  // Each admission this member proposed or deferred is evaluated once more,
  // then the joins still waiting for a leader are driven.
  function redrive(nodeId) {
    const port = ports.get(nodeId);
    if (!port) return;
    for (const joinerId of takeGroupAdmissionsInFlight(port)) {
      reserveAndAdmitGroupPeer(port, admissionGroup(nodeId),
        {replicaIdentity: joinerId, peerAddress: joinerId});
    }
    drivePendingJoins();
  }

  // Each port is opened inside its node, and every envelope it sends is a
  // network message from that node.
  function open(nodeId, {bootstrapMembership, bootstrapPeerIds}) {
    const database = new Database(IN_MEMORY_DATABASE);
    databases.set(nodeId, database);
    const port = runOnExecutionNode(nodeId, () => createRaftRsOperationPort({
      [RAFT_OPERATION_PORT_REQUEST.GROUP_ID]: groupId,
      [RAFT_OPERATION_PORT_REQUEST.PEER_ID]: nodeId,
      [RAFT_OPERATION_PORT_REQUEST.PEER_ADDRESS]: nodeId,
      [RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_PEER_IDS]: bootstrapPeerIds,
      [RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]: bootstrapMembership,
      [RAFT_OPERATION_PORT_REQUEST.DURABLE_STORAGE]: database,
      [RAFT_OPERATION_PORT_REQUEST.TIMING]: timing,
      [RAFT_OPERATION_PORT_REQUEST.SUBSTRATE]: {timeSource: chargingTimeSource(nodeId),
        randomSource: randomSources.get(nodeId)},
      [RAFT_OPERATION_PORT_REQUEST.DEFER_ELECTION]: false,
      [RAFT_OPERATION_PORT_REQUEST.SEND_TO_PEER]: (peerAddress, envelope) => {
        network.send({
          from: nodeId, to: peerAddress, type: ENVELOPE_MESSAGE,
          payload: {groupId, envelope}, delayMs: linkDelayMs,
        });
      },
      [RAFT_OPERATION_PORT_REQUEST.RESOLVE_PEER_ADDRESS]: (replicaIdentity) => replicaIdentity,
      [RAFT_OPERATION_PORT_REQUEST.APPLY_COMMITTED_ENTRY]: () => undefined,
      [RAFT_OPERATION_PORT_REQUEST.SNAPSHOT_CATCHUP_NEEDED]: () => undefined,
    }));
    ports.set(nodeId, port);
    // Announced inside the port's own turn, so the re-drive runs after it.
    const scheduleRedrive = () => queueMicrotask(() => redrive(nodeId));
    port.subscribe(RAFT_EVENT.CONF_CHANGE_APPLIED, scheduleRedrive);
    port.subscribe(RAFT_EVENT.LEADER, scheduleRedrive);
    return port;
  }

  // One join at a time, as one configuration change at a time: a join needs
  // the leader's committed configuration, so without a leader, or while the
  // leader cannot answer one, it waits for the next leadership announcement
  // or settled change, which drives the next waiting join.
  function drivePendingJoins() {
    const leader = pendingJoins.length > 0 ? leaderId() : null;
    if (leader === null) return;
    const stamp = committedStampOfAnswer(runOnExecutionNode(leader, () =>
      ports.get(leader)[RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP]({
        purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP,
      })));
    if (stamp === null) return;
    const joinerId = pendingJoins.shift();
    const bootstrapPeerIds = [...ports.keys(), joinerId];
    admitOnEveryMember(joinerId);
    open(joinerId, {bootstrapMembership: stamp, bootstrapPeerIds});
  }

  function admit(nodeId) {
    pendingJoins.push(nodeId);
    drivePendingJoins();
  }

  const seedPort = open(seedId, {
    bootstrapMembership: genesisStamp([seedId]), bootstrapPeerIds: [seedId],
  });
  runOnExecutionNode(seedId, () => seedPort.campaign());

  // Every port this cohort opened is closed, then the database it ran over,
  // before the scenario seals.
  function end() {
    for (const [nodeId, port] of ports) {
      runOnExecutionNode(nodeId, () => port.close());
      databases.get(nodeId).close();
    }
    ports.clear();
    databases.clear();
  }

  return Object.freeze({admit, ports, leaderId, isFormed, handleMessage, groupId, end});
}

export {createStagedCohort};
