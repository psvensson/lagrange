// A deterministic driver for the production raft-rs-wasm backend.
//
// It owns no Raft logic: every peer is created, driven and restored through
// the production modules under src/raft, over a real better-sqlite3 database
// per peer on disk. The driver only moves messages between peers and decides
// when to tick.
//
// It deliberately has NO cache parameter and no service parameter. A restart
// here is `restoreRaftRsGroup` reading the peer's own durable record.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {
  createRaftRsGroup,
  loadRaftRsCore,
  restoreRaftRsGroup,
} from './raw-raft-rs-test-core.js';
import {drainReady} from './raw-raft-rs-test-ready.js';

const DB_FILE_PREFIX = 'peer-';
const DB_FILE_SUFFIX = '.sqlite';
const TEMP_PREFIX = 'raft-rs-backend-';
const DEFAULT_SETTLE_ROUNDS = 400;
// How many rounds one peer may be ticked alone before it should have run its
// election out. The core's own election tick is smaller; this is the bound,
// not the expectation.
const DEFAULT_CAMPAIGN_ROUNDS = 80;

/**
 * One peer: its own database file, its own durable store, its own handle.
 */
class ClusterPeer {
  /**
   * @param {Object} parts - The peer's parts.
   */
  constructor({peerId, dbFile, db, store, handle}) {
    this.peerId = peerId;
    this.dbFile = dbFile;
    this.db = db;
    this.store = store;
    this.handle = handle;
    this.live = true;
  }
}

/**
 * A cluster of raft-rs peers driven through the production loop.
 */
class DeterministicRaftRsCluster {
  /**
   * @param {Object} options - The cluster's shape.
   * @param {Array<string>} options.voters - Voter ids as decimal strings.
   * @param {string} options.groupId - The group every peer belongs to.
   * @param {Object} [options.storeFactory] - Builds a store for a peer.
   * @param {Object} [options.core] - A runtime to use instead of the shared
   *   one, so a test can drive a runtime it is free to destroy.
   * @param {Function} [options.dispatch] - Delivers one message into one
   *   peer. The default steps it straight into the core; an ingress test puts
   *   its safety boundary here.
   * @param {Object} [options.tuning] - Core tuning every peer is created and
   *   restored with. Absent means the group owner's own defaults, which is
   *   what every earlier scenario ran on; an election scenario that is about
   *   pre_vote or check_quorum names them here.
   */
  constructor({voters, groupId, storeFactory, core, dispatch, tuning}) {
    this.core = core || loadRaftRsCore();
    this.groupId = groupId;
    this.voters = voters;
    this.tuning = tuning;
    this.storeFactory = storeFactory || ((db) => new RaftRsDurableStore(db));
    this.dispatch = dispatch ||
      ((peer, message) => this.core.step(peer.handle, message));
    this.directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
    this.inbox = new Map(voters.map((peerId) => [peerId, []]));
    this.partitioned = new Set();
    this.peers = new Map();
    for (const peerId of voters) {
      this.peers.set(peerId, this.startFresh(peerId));
    }
  }

  /**
   * Add a peer that was not in the founding configuration. It is created
   * holding the configuration it is joining - which a caller reads off a
   * member's core, never declares - and it is NOT a member of it until the
   * group's own committed configuration change says so.
   * @param {string} peerId - The joining peer.
   * @param {Array<string>} voters - The configuration it is joining.
   * @return {ClusterPeer} The new peer.
   */
  addPeer(peerId, voters) {
    const dbFile = this.dbFileFor(peerId);
    const db = new Database(dbFile);
    const store = this.storeFactory(db, peerId);
    const handle = createRaftRsGroup({
      core: this.core,
      store,
      groupId: this.groupId,
      peerId,
      voters,
      tuning: this.tuning,
    });
    const peer = new ClusterPeer({peerId, dbFile, db, store, handle});
    this.peers.set(peerId, peer);
    this.inbox.set(peerId, []);
    return peer;
  }

  /**
   * Cut a peer off the network in both directions. It keeps its handle and
   * its record; only messages stop.
   * @param {string} peerId - The peer.
   */
  partition(peerId) {
    this.partitioned.add(peerId);
    this.inbox.set(peerId, []);
  }

  /**
   * Put a partitioned peer back on the network.
   * @param {string} peerId - The peer.
   */
  heal(peerId) {
    this.partitioned.delete(peerId);
  }

  /**
   * Let exactly one peer's election timer run. Nobody else is ticked, so the
   * peer that times out is the one chosen, and the election itself is
   * raft-rs's: the driver never steps a local message or calls campaign.
   * @param {string} peerId - The peer whose timer runs.
   * @param {Object} [options] - The round bound.
   * @return {boolean} Whether that peer ended up leading itself.
   */
  campaign(peerId, options = {}) {
    const rounds = options.rounds || DEFAULT_CAMPAIGN_ROUNDS;
    for (let round = 0; round < rounds; round += 1) {
      const peer = this.peers.get(peerId);
      if (!peer || !peer.live) {
        return false;
      }
      if (this.core.status(peer.handle).lead === peerId) {
        return true;
      }
      this.core.tick(peer.handle);
      this.runReady();
      this.deliver();
      this.runReady();
    }
    const peer = this.peers.get(peerId);
    return this.core.status(peer.handle).lead === peerId;
  }

  /**
   * @param {string} peerId - The peer.
   * @return {string} Where that peer's database lives.
   */
  dbFileFor(peerId) {
    return path.join(
      this.directory, `${DB_FILE_PREFIX}${peerId}${DB_FILE_SUFFIX}`);
  }

  /**
   * Create a peer's database, store and fresh group.
   * @param {string} peerId - The peer.
   * @return {ClusterPeer} The peer.
   */
  startFresh(peerId) {
    const dbFile = this.dbFileFor(peerId);
    const db = new Database(dbFile);
    const store = this.storeFactory(db, peerId);
    const handle = createRaftRsGroup({
      core: this.core,
      store,
      groupId: this.groupId,
      peerId,
      voters: this.voters,
      tuning: this.tuning,
    });
    return new ClusterPeer({peerId, dbFile, db, store, handle});
  }

  /**
   * @param {string} peerId - The peer.
   * @return {ClusterPeer} That peer.
   */
  peer(peerId) {
    return this.peers.get(peerId);
  }

  /**
   * Queue the messages one Ready produced.
   * @param {Array<Object>} messages - Messages from the core.
   */
  route(messages) {
    for (const message of messages) {
      if (this.partitioned.has(message.from) ||
        this.partitioned.has(message.to)) {
        continue;
      }
      const queue = this.inbox.get(message.to);
      if (queue) {
        queue.push(message);
      }
    }
  }

  /**
   * Deliver every queued message into its recipient's core.
   * @return {number} How many messages were delivered.
   */
  deliver() {
    let delivered = 0;
    for (const [peerId, queue] of this.inbox) {
      const peer = this.peers.get(peerId);
      const pending = queue.splice(0, queue.length);
      if (!peer || !peer.live) {
        continue;
      }
      for (const message of pending) {
        this.dispatch(peer, message);
        delivered += 1;
      }
    }
    return delivered;
  }

  /**
   * Run every live peer's Ready loop once, routing what it produced.
   * @return {Array<Object>} Every cycle that ran.
   */
  runReady() {
    const cycles = [];
    for (const peer of this.peers.values()) {
      if (!peer.live) {
        continue;
      }
      const peerCycles = drainReady({
        core: this.core,
        handle: peer.handle,
        store: peer.store,
        groupId: this.groupId,
        send: (messages) => this.route(messages),
      });
      cycles.push(...peerCycles);
    }
    return cycles;
  }

  /**
   * Tick live peers once.
   * @param {Array<string>} [peerIds] - Whose timers run. Every live peer when
   *   omitted; a scenario that must not let a peer time out names the rest.
   */
  tick(peerIds) {
    for (const peer of this.peers.values()) {
      const ticking = peerIds === undefined || peerIds.includes(peer.peerId);
      if (peer.live && ticking) {
        this.core.tick(peer.handle);
      }
    }
  }

  /**
   * Drive the cluster until a predicate holds or the round budget runs out.
   * @param {Function} untilTrue - Reads the cluster and says whether to stop.
   * @param {Object} [options] - Budget and whether to tick.
   * @return {boolean} Whether the predicate held.
   */
  settle(untilTrue, options = {}) {
    const rounds = options.rounds || DEFAULT_SETTLE_ROUNDS;
    const ticking = options.ticking !== false;
    for (let round = 0; round < rounds; round += 1) {
      if (untilTrue(this)) {
        return true;
      }
      if (ticking) {
        this.tick(options.tickOnly);
      }
      this.runReady();
      this.deliver();
      this.runReady();
    }
    return untilTrue(this);
  }

  /**
   * @param {string} peerId - The peer.
   * @return {Object} What the core says about that peer right now.
   */
  status(peerId) {
    const peer = this.peers.get(peerId);
    return this.core.status(peer.handle);
  }

  /**
   * @param {string} peerId - The peer.
   * @return {Object} The configuration the core holds for that peer.
   */
  confState(peerId) {
    const peer = this.peers.get(peerId);
    return this.core.conf_state(peer.handle);
  }

  /**
   * @return {string|null} The leader every live peer agrees on, or null.
   */
  leaderId() {
    const leads = new Set();
    for (const peer of this.peers.values()) {
      if (peer.live) {
        leads.add(this.core.status(peer.handle).lead);
      }
    }
    return leads.size === 1 && !leads.has('0') ? [...leads][0] : null;
  }

  /**
   * Lose a peer's process: free its handle and close its database. The
   * database FILE stays, because that is the peer's durable record.
   * @param {string} peerId - The peer.
   */
  crash(peerId) {
    const peer = this.peers.get(peerId);
    this.core.free(peer.handle);
    peer.db.close();
    peer.live = false;
    this.inbox.set(peerId, []);
  }

  /**
   * Bring a crashed peer back from its own durable record.
   * @param {string} peerId - The peer.
   * @param {Object} [options] - Restore options.
   * @return {ClusterPeer} The restarted peer.
   */
  restart(peerId, options = {}) {
    const peer = this.peers.get(peerId);
    const db = new Database(peer.dbFile);
    const store = this.storeFactory(db, peerId);
    const handle = restoreRaftRsGroup({
      core: this.core,
      store,
      groupId: this.groupId,
      peerId,
      tuning: this.tuning,
      ...options,
    });
    peer.db = db;
    peer.store = store;
    peer.handle = handle;
    peer.live = true;
    return peer;
  }

  /**
   * Take up a runtime that replaced the one this cluster was driving. The
   * handles are whatever the new runtime restored; the databases were never
   * closed, so the stores stay as they are.
   * @param {Object} core - The replacement runtime.
   * @param {Function} handleForPeer - Gives each peer its new handle.
   */
  adoptRuntime(core, handleForPeer) {
    this.core = core;
    for (const peer of this.peers.values()) {
      if (peer.live) {
        peer.handle = handleForPeer(peer.peerId);
      }
    }
  }

  /** Free every handle, close every database and remove the directory. */
  dispose() {
    for (const peer of this.peers.values()) {
      if (peer.live) {
        this.core.free(peer.handle);
        peer.db.close();
        peer.live = false;
      }
    }
    fs.rmSync(this.directory, {recursive: true, force: true});
  }
}

export {DeterministicRaftRsCluster};
