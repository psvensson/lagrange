/**
 * raft-rs-network-host - real raft-rs partition operation ports on a DT6
 * VirtualNetwork (test/distributed/harness/virtual-network.js).
 *
 * Every peer is the operation port `RaftRsWasmProvider.createPartitionPort`
 * returns, built by PartitionNodeCluster over its own SQLite file. The host
 * adds only a network: the port's substrate clock is its node's network clock,
 * so the port's own tick scheduling and inbound drain run on virtual time, and
 * every envelope the port sends travels as one VirtualNetwork message that the
 * receiving port steps. Partitions, heals and the delivery order of co-due
 * messages (a seeded or PCT scheduler) belong to the network.
 *
 * A test reads semantics only: a replica's role, term and commit index from
 * the port's own status, and the committed entries its application received
 * once their transaction committed. A test acts only by proposing a command
 * through the port.
 *
 * The seed: raft-rs draws its randomized election timeout from the platform
 * RNG, so no seed can choose that draw. The seed chooses each replica's
 * election window instead - the per-replica timing input production already
 * varies (replica-election-timeouts.js) - and the windows are disjoint, so the
 * seed alone decides which live replica times out first. A scenario that
 * elects its leader explicitly passes one `electionMinMs` window for every
 * replica instead and asks the chosen replica's port to campaign.
 *
 * A stopped replica's node is down on the network, so nothing reaches or
 * leaves its port; a restart closes that port and its database and reopens
 * the replica from its own SQLite file, so it resumes from durable state only.
 */

import {PartitionNodeCluster} from
  '../raft/raft-rs-backend/partition-node-cluster.js';
import {SeededRandomSource} from '../../src/random/random-source.js';
import {driveNetwork} from '../distributed/harness/virtual-network.js';

const ENVELOPE_MESSAGE = 'raftRsEnvelope';
const LEADER_ROLE = 'leader';
// A send is accepted once the network queued it; the network, not the
// sender, decides whether it arrives.
const SEND_QUEUED = Object.freeze({queued: true});
const DEFAULT_LINK_DELAY_MS = 1;
const HEARTBEAT_MS = 30;
const TICK_INTERVAL_MS = 10;
const BASE_ELECTION_MIN_MS = 150;
const WINDOW_GROWTH = 2;

/**
 * Seeded, disjoint election windows: the replica ranked r waits
 * [base * 2^r, base * 2^(r+1)) without hearing a leader before campaigning.
 * @param {Array<string>} ids - The replicas.
 * @param {number} seed - The scenario seed.
 * @return {Map<string, Object>} replica -> its timing request.
 */
function seededElectionTimings(ids, seed) {
  const random = new SeededRandomSource({seed});
  const ranked = ids.map((id) => ({id, draw: random.random()}))
    .sort((a, b) => a.draw - b.draw);
  return new Map(ranked.map(({id}, rank) => {
    const electionMinMs = BASE_ELECTION_MIN_MS * (WINDOW_GROWTH ** rank);
    return [id, Object.freeze({
      heartbeatMs: HEARTBEAT_MS,
      electionMinMs,
      electionMaxMs: electionMinMs * WINDOW_GROWTH,
      tickIntervalMs: TICK_INTERVAL_MS,
    })];
  }));
}

/**
 * One explicit election window for every replica: none times out first.
 * @param {Array<string>} ids - The replicas.
 * @param {number} electionMinMs - The shared window's lower bound.
 * @return {Map<string, Object>} replica -> its timing request.
 */
function sharedElectionTimings(ids, electionMinMs) {
  const timing = Object.freeze({
    heartbeatMs: HEARTBEAT_MS,
    electionMinMs,
    electionMaxMs: electionMinMs * WINDOW_GROWTH,
    tickIntervalMs: TICK_INTERVAL_MS,
  });
  return new Map(ids.map((id) => [id, timing]));
}

/** A partition's real operation ports, connected by a VirtualNetwork. */
class RaftRsNetworkHost {
  /**
   * @param {Object} net - A VirtualNetwork.
   * @param {Array<string>} ids - The partition's replicas.
   * @param {Object} options - {partitionId, seed, linkDelayMs,
   *   electionMinMs}.
   */
  constructor(net, ids, {partitionId, seed, electionMinMs,
    linkDelayMs = DEFAULT_LINK_DELAY_MS}) {
    this.net = net;
    this.ids = [...ids];
    this.linkDelayMs = linkDelayMs;
    this.listeners = new Map(this.ids.map((id) => [id, new Set()]));
    this.committed = new Map(this.ids.map((id) => [id, []]));
    const timings = electionMinMs === undefined ?
      seededElectionTimings(this.ids, seed) :
      sharedElectionTimings(this.ids, electionMinMs);
    for (const id of this.ids) {
      net.registerNode(id, (message) => this.receive(id, message));
    }
    this.cluster = new PartitionNodeCluster({
      partitionId,
      replicaIds: this.ids,
      timingFor: (id) => timings.get(id),
      substrateFor: (id) => ({timeSource: net.networkTimeSource(id)}),
      sendFor: (from, address, envelope) =>
        this.send(from, address, envelope),
      applyFor: (id, command, {index, term, effects}) =>
        effects.afterCommit.push(() =>
          this.observeCommitted(id, Object.freeze({index, term, command}))),
    });
  }

  /**
   * @param {string} from - The sending replica.
   * @param {string} address - The address its port resolved.
   * @param {Object} envelope - The port's envelope.
   * @return {Object} The network's acceptance.
   * @private
   */
  send(from, address, envelope) {
    this.net.send({
      from,
      to: this.cluster.replicaIdOf(address),
      type: ENVELOPE_MESSAGE,
      payload: {envelope},
      delayMs: this.linkDelayMs,
    });
    return SEND_QUEUED;
  }

  /**
   * @param {string} id - The receiving replica.
   * @param {Object} message - The delivered network message.
   * @private
   */
  receive(id, message) {
    if (message.type === ENVELOPE_MESSAGE) {
      this.cluster.node(id).step(message.payload.envelope);
    }
  }

  /**
   * @param {string} id - The replica whose application committed an entry.
   * @param {Object} entry - {index, term, command}.
   * @private
   */
  observeCommitted(id, entry) {
    this.committed.get(id).push(entry);
    for (const listener of this.listeners.get(id)) {
      listener(entry);
    }
  }

  /** Let every port schedule its own ticks on its node's network clock. */
  start() {
    for (const id of this.ids) {
      this.cluster.node(id).startScheduling();
    }
  }

  /**
   * Run the network to `untilMs`, letting asynchronous work the delivered
   * events started settle between bounded steps.
   * @param {number} untilMs - The global virtual instant to reach.
   * @param {Object} [options] - {stepMs}.
   * @return {Promise<void>}
   */
  async runUntil(untilMs, {stepMs} = {}) {
    await driveNetwork(this.net, {untilMs, stepMs});
  }

  /**
   * @param {string} id - The replica.
   * @return {Object} Its port's own status.
   */
  status(id) {
    return this.cluster.node(id).readStatus();
  }

  /**
   * @param {string} id - The replica.
   * @return {boolean} Whether its port reports it leads.
   */
  isLeader(id) {
    return this.status(id).role === LEADER_ROLE;
  }

  /**
   * @param {string} id - The replica.
   * @return {number} Its current term.
   */
  term(id) {
    return Number(this.status(id).term);
  }

  /**
   * @param {string} id - The replica.
   * @return {number} Its commit index.
   */
  commitIndex(id) {
    return Number(this.status(id).commitIndex);
  }

  /**
   * Ask a replica's port to campaign.
   * @param {string} id - The replica.
   * @return {Object} The port's named outcome.
   */
  campaign(id) {
    return this.cluster.node(id).campaign();
  }

  /**
   * Take a replica's node down: nothing reaches or leaves its port.
   * @param {string} id - The replica.
   */
  stop(id) {
    this.net.killNode(id);
  }

  /**
   * Reopen a stopped replica from its own SQLite file and bring its node
   * back up; the reopened port schedules its own ticks again.
   * @param {string} id - The replica.
   */
  restart(id) {
    this.cluster.restart(id);
    this.net.startNode(id);
    this.cluster.node(id).startScheduling();
  }

  /**
   * Propose a command through a replica's port.
   * @param {string} id - The proposing replica.
   * @param {*} command - A JSON value.
   * @return {Object} The port's named outcome.
   */
  propose(id, command) {
    return this.cluster.node(id).propose(command);
  }

  /**
   * @param {string} id - The replica.
   * @param {Function} listener - Called with each {index, term, command} its
   *   application committed.
   */
  onCommitted(id, listener) {
    this.listeners.get(id).add(listener);
  }

  /**
   * @param {string} id - The replica.
   * @return {Array<Object>} Every {index, term, command} it committed.
   */
  committedEntries(id) {
    return [...this.committed.get(id)];
  }

  /** Close every port and database and remove the files. */
  dispose() {
    this.cluster.dispose();
  }
}

/**
 * Register the replicas on the network and build their real ports.
 * @param {Object} net - A VirtualNetwork.
 * @param {Array<string>} ids - The partition's replicas.
 * @param {Object} options - {partitionId, seed, linkDelayMs,
 *   electionMinMs}.
 * @return {RaftRsNetworkHost} The connected partition (call start()).
 */
function connectRaftRsNetwork(net, ids, options) {
  return new RaftRsNetworkHost(net, ids, options);
}

export {connectRaftRsNetwork};
