// A cluster whose peers are the PRODUCTION node objects the provider seam
// returns, not a driver's own peers.
//
// Every peer here is `new (provider.createNodeClass(context))(address)`, so
// the path a message takes is the production one: the host emits the data
// event into the node, the node runs the envelope boundary, the core steps,
// the Ready loop persists to a real SQLite file and the node emits what the
// core did. The helper moves packets and decides when to tick; it owns no
// Raft logic and no expectation.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {TextEncoder} from 'node:util';

import Database from 'better-sqlite3';

import {
  RAFT_BACKEND,
  RAFT_BACKEND_OPTION,
} from '../../../src/raft/raft-backend-constants.js';
import {createRaftProvider} from '../../../src/raft/raft-backend-selection.js';
import {instantiateRaftRsCore} from '../../../src/raft/raft-rs-core.js';
import {
  RAFT_RS_NODE_EVENT,
} from '../../../src/raft/raft-rs-node-constants.js';
import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {
  RaftRsReplicaLifecycle,
} from '../../../src/raft/raft-rs-replica-lifecycle.js';
import {RaftRsRuntimeHost} from '../../../src/raft/raft-rs-runtime-health.js';

const TEMP_PREFIX = 'raft-rs-node-surface-';
const DB_PREFIX = 'peer-';
const DB_SUFFIX = '.sqlite';
const ADDRESS_PREFIX = 'raft-rs://peer-';
const NO_LEADER = '0';
const HEARTBEAT_MESSAGE_TYPE = 8;
const IMPOSSIBLE_COMMIT = '999999';
const BASE64 = 'base64';
const UTF8 = 'utf8';
const TICK_INTERVAL_MS = 5;
const SOURCE_ROOT = 'src';
const JS_SUFFIX = '.js';
const LIFERAFT_OWN_PREFIX = 'src/raft/liferaft';
const DIRECT_SUBCLASS = /class\s+\w+\s+extends\s+(Base)?LifeRaft\b/u;
const STATE_COMPARISON = /\.state\s*===?\s*LifeRaft\.\w+/u;
const SEAM_CONSTRUCTION = /\.createNodeClass\(/u;

/**
 * One peer: its database, its store, the production node object, and the
 * envelopes the transport has for it.
 */
class NodeBackedPeer {
  /**
   * @param {Object} parts - The peer's parts.
   */
  constructor({peerId, dbFile, db, store, node}) {
    this.peerId = peerId;
    this.dbFile = dbFile;
    this.db = db;
    this.store = store;
    this.node = node;
    this.inbox = [];
  }
}

/**
 * A cluster of production raft-rs node objects in one runtime.
 */
class NodeBackedCluster {
  /**
   * @param {Object} options - The cluster's shape.
   * @param {string} options.groupId - The group.
   * @param {Array<string>} options.voters - Raft peer ids, decimal strings.
   */
  constructor({groupId, voters}) {
    this.groupId = groupId;
    this.voters = voters;
    this.directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
    this.host = new RaftRsRuntimeHost({instantiate: instantiateRaftRsCore});
    this.provider = createRaftProvider({
      [RAFT_BACKEND_OPTION]: RAFT_BACKEND.RAFT_RS_WASM,
    });
    this.peers = new Map();
    // One peer's timer runs, so which peer times out first is chosen rather
    // than raced. The election itself is still the core's.
    this.tickers = [voters[0]];
    for (const peerId of voters) {
      this.peers.set(peerId, this.startPeer(peerId));
    }
  }

  /**
   * @param {string} peerId - The peer.
   * @return {NodeBackedPeer} A started peer.
   * @private
   */
  startPeer(peerId) {
    const dbFile = path.join(
      this.directory, `${DB_PREFIX}${peerId}${DB_SUFFIX}`);
    const db = new Database(dbFile);
    const store = new RaftRsDurableStore(db);
    const NodeClass = this.provider.createNodeClass({
      replicaId: peerId,
      runtimeHost: this.host,
      store,
      groupId: this.groupId,
      peerId,
      voters: this.voters,
      // The production owner of "may this local replica participate at all",
      // reading this peer's own durable record - which holds no retirement,
      // so it answers admitted.
      lifecycle: new RaftRsReplicaLifecycle({
        store, groupId: this.groupId, peerId}),
      resolvePeerAddress: (raftPeerId) => this.addressOf(raftPeerId),
      deliverPacket: (address, envelope) => this.queue(address, envelope),
      scheduleTick: () => undefined,
    });
    const node = new NodeClass(this.addressOf(peerId));
    node.setTickInterval(TICK_INTERVAL_MS);
    return new NodeBackedPeer({peerId, dbFile, db, store, node});
  }

  /**
   * @param {string} raftPeerId - A raft peer id.
   * @return {string} The address the host resolves for it.
   */
  addressOf(raftPeerId) {
    return `${ADDRESS_PREFIX}${raftPeerId}`;
  }

  /**
   * @param {string} address - An address this cluster resolved.
   * @return {string} The peer id behind it.
   * @private
   */
  peerIdOf(address) {
    return address.slice(ADDRESS_PREFIX.length);
  }

  /**
   * @param {string} peerId - The peer.
   * @return {Object} Its production node object.
   */
  node(peerId) {
    return this.peers.get(peerId).node;
  }

  /**
   * The transport: hold an envelope for its recipient.
   * @param {string} address - Where it is going.
   * @param {Object} envelope - The envelope.
   * @private
   */
  queue(address, envelope) {
    const peer = this.peers.get(this.peerIdOf(address));
    if (peer) {
      peer.inbox.push(envelope);
    }
  }

  /**
   * Emit one envelope into one node, which is how a packet arrives.
   * @param {string} peerId - The recipient.
   * @param {Object} envelope - The envelope.
   * @return {Object} The node's named dispatch outcome.
   */
  deliverEnvelope(peerId, envelope) {
    return this.node(peerId).emit(RAFT_RS_NODE_EVENT.DATA, envelope);
  }

  /**
   * Deliver everything the transport is holding.
   * @private
   */
  deliverAll() {
    for (const peer of this.peers.values()) {
      const pending = peer.inbox.splice(0, peer.inbox.length);
      for (const envelope of pending) {
        peer.node.emit(RAFT_RS_NODE_EVENT.DATA, envelope);
      }
    }
  }

  /**
   * Tick the chosen peers, then deliver, until a predicate holds.
   * @param {Function} untilTrue - What the cluster is waiting for.
   * @param {number} rounds - The bound.
   * @return {boolean} Whether it held.
   */
  settle(untilTrue, rounds) {
    for (let round = 0; round < rounds; round += 1) {
      if (untilTrue()) {
        return true;
      }
      for (const peerId of this.tickers) {
        this.node(peerId).tickOnce();
      }
      this.deliverAll();
    }
    return untilTrue();
  }

  /**
   * What the core itself says about a peer, read past the node object so an
   * expectation never comes from the code under test.
   * @param {string} peerId - The peer.
   * @return {Object} The core's status.
   */
  coreStatus(peerId) {
    return this.host.core.status(
      this.host.handleOf(`${this.groupId}/${peerId}`));
  }

  /**
   * @param {string} peerId - The peer.
   * @return {Object} The configuration the core holds.
   */
  coreConfState(peerId) {
    return this.host.core.conf_state(
      this.host.handleOf(`${this.groupId}/${peerId}`));
  }

  /**
   * @return {string|null} The leader every peer agrees on, or null.
   */
  leaderPeerId() {
    const leads = new Set(
      [...this.peers.keys()].map((peerId) => this.coreStatus(peerId).lead));
    return leads.size === 1 && !leads.has(NO_LEADER) ? [...leads][0] : null;
  }

  /**
   * Record every event each node emits.
   * @return {Object} The recordings, by peer.
   */
  observeEvents() {
    const roles = new Map();
    const termChanges = new Map();
    const leaderChanges = new Map();
    const commits = new Map();
    for (const peerId of this.peers.keys()) {
      roles.set(peerId, []);
      termChanges.set(peerId, []);
      leaderChanges.set(peerId, []);
      commits.set(peerId, []);
      const node = this.node(peerId);
      for (const role of [RAFT_RS_NODE_EVENT.LEADER,
        RAFT_RS_NODE_EVENT.FOLLOWER, RAFT_RS_NODE_EVENT.CANDIDATE]) {
        node.on(role, () => roles.get(peerId).push(role));
      }
      node.on(RAFT_RS_NODE_EVENT.TERM_CHANGE,
        (term) => termChanges.get(peerId).push(term));
      node.on(RAFT_RS_NODE_EVENT.LEADER_CHANGE,
        (lead) => leaderChanges.get(peerId).push(lead));
      node.on(RAFT_RS_NODE_EVENT.COMMIT,
        (data) => commits.get(peerId).push(decodeEntryData(data)));
    }
    return {roles, termChanges, leaderChanges, commits};
  }

  /**
   * Propose one command through the node.
   * @param {string} peerId - The proposing peer.
   * @param {string} command - The command.
   * @return {Object} The node's named outcome.
   */
  propose(peerId, command) {
    return this.node(peerId).proposeCommand(
      new TextEncoder().encode(command));
  }

  /**
   * Whether every peer's own durable record holds the command.
   * @param {string} command - The command.
   * @return {boolean} Whether all of them do.
   */
  everyPeerCommitted(command) {
    for (const peer of this.peers.values()) {
      const record = peer.store.readDurableRecord(this.groupId);
      const carrying = record.entries.find((entry) =>
        decodeEntryData(entry.data) === command);
      // In the durable log is not enough: the durable applied index must
      // have reached it, which is what "committed and applied" means here.
      if (carrying === undefined ||
        BigInt(record.appliedIndex) < BigInt(carrying.index)) {
        return false;
      }
    }
    return true;
  }

  /**
   * A legitimate heartbeat, built from what the two cores report.
   * @param {string} fromPeerId - The sender.
   * @param {string} toPeerId - The recipient.
   * @return {Object} The envelope.
   */
  envelopeFrom(fromPeerId, toPeerId) {
    return {
      groupId: this.groupId,
      to: toPeerId,
      message: {
        from: fromPeerId,
        to: toPeerId,
        msgType: HEARTBEAT_MESSAGE_TYPE,
        term: this.coreStatus(fromPeerId).term,
        commit: this.coreStatus(toPeerId).commit,
      },
    };
  }

  /**
   * The same heartbeat with a commit position the recipient's log cannot
   * hold: correctly routed, and one of the shapes that still reaches a trap.
   * @param {string} peerId - The recipient.
   * @return {Object} The envelope.
   */
  trapEnvelopeFor(peerId) {
    const envelope = this.envelopeFrom(this.leaderPeerId(), peerId);
    envelope.message.commit = IMPOSSIBLE_COMMIT;
    return envelope;
  }

  /** Close every database and remove the directory. */
  dispose() {
    for (const peer of this.peers.values()) {
      try {
        peer.node.end();
      } catch {
        // A trapped runtime cannot free a handle; the files still close.
      }
      peer.db.close();
    }
    fs.rmSync(this.directory, {recursive: true, force: true});
  }
}

/**
 * A committed entry's data, as the binding encodes it.
 * @param {string|undefined} data - Base64, or undefined for an empty entry.
 * @return {string|null} The command.
 */
function decodeEntryData(data) {
  return data === undefined || data === null ?
    null :
    Buffer.from(data, BASE64).toString(UTF8);
}

function sourceFiles(root, directory, collected) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(root, absolute, collected);
    } else if (entry.isFile() && entry.name.endsWith(JS_SUFFIX)) {
      collected.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  }
  return collected;
}

/**
 * Where production builds or reads a Raft node WITHOUT the provider seam.
 *
 * Derived from `src`, so it is a fact about the tree rather than a claim:
 * a module that extends LifeRaft itself never reaches `createNodeClass`, and
 * a module that compares the node's state against LifeRaft's own class
 * constants is using a vocabulary the seam does not own. Liferaft's own
 * implementation is excluded, because it IS liferaft.
 * @param {string} repositoryRoot - The repository root.
 * @return {Object} {directSubclasses, stateComparisons, seamConstructionSites}.
 */
function seamBypassSites(repositoryRoot) {
  const root = path.join(repositoryRoot, SOURCE_ROOT);
  const files = sourceFiles(repositoryRoot, root, []);
  const directSubclasses = [];
  const stateComparisons = [];
  const seamConstructionSites = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(repositoryRoot, file), UTF8);
    if (SEAM_CONSTRUCTION.test(text)) {
      seamConstructionSites.push(file);
    }
    if (file.startsWith(LIFERAFT_OWN_PREFIX)) {
      continue;
    }
    if (DIRECT_SUBCLASS.test(text)) {
      directSubclasses.push(file);
    }
    if (STATE_COMPARISON.test(text)) {
      stateComparisons.push(file);
    }
  }
  return Object.freeze({
    directSubclasses: Object.freeze(directSubclasses),
    stateComparisons: Object.freeze(stateComparisons),
    seamConstructionSites: Object.freeze(seamConstructionSites),
  });
}

export {NodeBackedCluster, seamBypassSites};
