// A staged real-LifeRaft cohort over the virtual network: the seed forms the
// group alone, and joiners are admitted at their scheduled join time (join
// times are data). The request/reply transport shape follows
// test/distributed/harness/raft-network-host.js; every inbound packet is one
// raft_protocol segment charged to the receiving node under the
// deterministic guard.

import LifeRaft from '../../src/raft/liferaft.js';
import {FORMATION_OWNER} from '../../src/diagnostics/formation-diagnostics-contract.js';
import {runOnExecutionNode} from '../../src/diagnostics/formation-turn-attribution.js';
import {guardedDispatch} from './formation-sim-guard.js';

const MESSAGE_REQUEST = 'raftReq';
const MESSAGE_REPLY = 'raftReply';
const DATA_EVENT = 'data';
const FIRST_SEQUENCE = 0;
const ONE = 1;

/**
 * One cohort (one raft group) with staged membership.
 * @param {object} options
 * @param {object} options.network
 * @param {string} options.groupId
 * @param {string} options.seedId
 * @param {number} options.linkDelayMs
 * @param {Function} options.raftOptions nodeId -> LifeRaft options (timing, randomSource)
 * @param {ChargeAccumulator} options.charges
 * @returns {{admit: Function, rafts: Map, leaderId: Function}}
 */
function createStagedCohort({network, groupId, seedId, linkDelayMs, raftOptions, charges}) {
  const rafts = new Map();
  const pendingReplies = new Map();
  let requestSequence = FIRST_SEQUENCE;

  function handleMessage(nodeId, message, api) {
    const raft = rafts.get(nodeId);
    if (!raft || message.payload?.groupId !== groupId) return false;
    charges.segment(nodeId, FORMATION_OWNER.RAFT_PROTOCOL);
    if (message.type === MESSAGE_REQUEST) {
      guardedDispatch(FORMATION_OWNER.RAFT_PROTOCOL, () => {
        raft.emit(DATA_EVENT, message.payload.packet, (reply) => {
          api.send({
            from: nodeId, to: message.from, type: MESSAGE_REPLY,
            payload: {groupId, reply: reply || null, reqId: message.payload.reqId},
            delayMs: linkDelayMs,
          });
        });
      });
      return true;
    }
    if (message.type === MESSAGE_REPLY) {
      const written = pendingReplies.get(message.payload.reqId);
      if (written) {
        pendingReplies.delete(message.payload.reqId);
        guardedDispatch(FORMATION_OWNER.RAFT_PROTOCOL, () =>
          written(null, message.payload.reply || undefined));
      }
      return true;
    }
    return false;
  }

  function link(from, to) {
    rafts.get(from).join(to, (packet, written) => {
      const reqId = (requestSequence += ONE);
      if (typeof written === 'function') pendingReplies.set(reqId, written);
      network.send({
        from, to, type: MESSAGE_REQUEST,
        payload: {groupId, packet, reqId},
        delayMs: linkDelayMs,
      });
    });
  }

  // A timer armed by the Raft owner fires as a Raft owner turn: the
  // callback is one raft_protocol segment on its node, under the guard.
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

  // Constructing a Raft runs protocol work immediately: LifeRaft's
  // constructor calls heartbeat, which is an attributed raft_protocol
  // segment. In production that construction happens in the node's own
  // process, so the scheduler binds the node around it here too.
  function construct(nodeId) {
    runOnExecutionNode(nodeId, () => {
      rafts.set(nodeId, new LifeRaft(nodeId, {
        timeSource: chargingTimeSource(nodeId),
        ...raftOptions(nodeId),
      }));
    });
  }

  // Formed for this group: one leader, every member knows it, and the
  // group holds every expected member.
  function isFormed(expectedMembers) {
    const leader = leaderId();
    if (leader === null || rafts.size !== expectedMembers) return false;
    for (const raft of rafts.values()) {
      if (raft.leader !== leader) return false;
    }
    return true;
  }

  // Admit a node: construct its raft and link it both ways with every
  // member already in the group.
  function admit(nodeId) {
    const members = [...rafts.keys()];
    construct(nodeId);
    for (const member of members) {
      link(member, nodeId);
      link(nodeId, member);
    }
  }

  function leaderId() {
    for (const [nodeId, raft] of rafts) {
      if (raft.state === LifeRaft.LEADER) return nodeId;
    }
    return null;
  }

  construct(seedId);
  rafts.get(seedId).promote();
  // Every Raft this cohort created is ended through LifeRaft's own lifecycle
  // before the scenario seals. Without it the promotion chain each instance
  // starts at construction survives the scenario and resumes inside the next
  // one, which is how the first in-process run differed from every later one.
  function end() {
    for (const raft of rafts.values()) {
      runOnExecutionNode(raft.address, () => raft.end());
    }
  }

  return Object.freeze({admit, rafts, leaderId, isFormed, handleMessage, groupId, end});
}

export {createStagedCohort};
