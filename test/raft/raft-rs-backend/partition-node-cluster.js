// A cluster whose peers are REAL PARTITION NODES: each one is what
// `provider.createPartitionNode(request)` returned for a request shaped
// exactly as `PartitionService` shapes it.
//
// Nothing here is a raft-rs concept. The driver hands each peer the group's
// own requirements - the thirteen names of RAFT_PARTITION_NODE_REQUEST, read
// off the contract owner so a field added or removed breaks the driver rather
// than being silently absent - a database file of its own, and a transport
// that moves envelopes between inboxes. It owns no Raft logic, no peer
// identity, no configuration and no expectation: the peer ids the core uses
// are the ones the backend registered, and the driver asks the backend for
// them rather than choosing them.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {
  RAFT_BACKEND,
  RAFT_BACKEND_OPTION,
} from '../../../src/raft/raft-backend-constants.js';
import {createRaftProvider} from '../../../src/raft/raft-backend-selection.js';
import {
  RAFT_PARTITION_NODE_REQUEST,
} from '../../../src/raft/raft-provider-contract-constants.js';
import {
  RAFT_RS_NODE_EVENT,
} from '../../../src/raft/raft-rs-node-constants.js';

const TEMP_PREFIX = 'raft-rs-real-partition-';
const DB_SUFFIX = '.sqlite';
const ADDRESS_PREFIX = 'raft-rs://replica-';
const NO_LEADER = '0';

// The timing a partition group hands its backend. Long enough that only the
// peer the test ticks can time out.
const PARTITION_TIMING = Object.freeze({
  heartbeatMs: 50,
  electionMinMs: 150,
  electionMaxMs: 300,
  tickIntervalMs: 10,
});

// The services rows a replica caches. Shaped like Lagrange's own: one row per
// replica of one partition, carrying a lifecycle status. They exist here to
// be hostile - rewritten between settle rounds - and the point of the test is
// that nothing the backend does reads them.
const SERVICES_DDL =
  'CREATE TABLE IF NOT EXISTS services (' +
  'service_id TEXT PRIMARY KEY, partition_id TEXT, service_type TEXT, ' +
  'status TEXT)';

/**
 * One replica: its own database file, the request it was built from, and the
 * node its backend returned.
 */
class PartitionReplica {
  /**
   * @param {Object} parts - The replica's parts.
   */
  constructor({replicaId, dbFile, db, request, node}) {
    this.replicaId = replicaId;
    this.dbFile = dbFile;
    this.db = db;
    this.request = request;
    this.node = node;
    this.inbox = [];
    this.appliedCommands = [];
  }
}

/**
 * A partition on the experimental backend, driven through the real seam.
 */
class PartitionNodeCluster {
  /**
   * @param {Object} options - The partition's shape.
   * @param {string} options.partitionId - The group.
   * @param {Array<string>} options.replicaIds - Logical Lagrange replica ids.
   */
  constructor({partitionId, replicaIds, substrateFor = null}) {
    this.partitionId = partitionId;
    this.replicaIds = [...replicaIds];
    this.substrateFor = substrateFor;
    this.isolated = new Set();
    this.directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
    this.provider = createRaftProvider({
      [RAFT_BACKEND_OPTION]: RAFT_BACKEND.RAFT_RS_WASM,
    });
    this.replicas = new Map();
    for (const replicaId of this.replicaIds) {
      this.replicas.set(replicaId, this.buildReplica(replicaId, replicaIds));
    }
    this.tickers = [replicaIds[0]];
  }

  /**
   * @param {string} replicaId - The logical replica.
   * @return {string} The unified address the partition resolves for it.
   */
  addressOf(replicaId) {
    return `${ADDRESS_PREFIX}${replicaId}`;
  }

  /**
   * @param {string} address - An address this partition resolved.
   * @return {string} The replica behind it.
   * @private
   */
  replicaIdOf(address) {
    return address.slice(ADDRESS_PREFIX.length);
  }

  /**
   * @param {string} replicaId - The replica.
   * @return {string} Its database file.
   */
  dbFileOf(replicaId) {
    return path.join(this.directory, `${replicaId}${DB_SUFFIX}`);
  }

  /**
   * The request one replica hands its backend, in the contract owner's own
   * field names.
   * @param {string} replicaId - The replica.
   * @param {Array<string>} bootstrapReplicaIds - The group's founding members.
   * @param {Object} db - The replica's own database.
   * @return {Object} The request.
   * @private
   */
  requestFor(replicaId, bootstrapReplicaIds, db) {
    const replicaOf = () => this.replicas.get(replicaId);
    return {
      [RAFT_PARTITION_NODE_REQUEST.GROUP_ID]: this.partitionId,
      [RAFT_PARTITION_NODE_REQUEST.PEER_ID]: replicaId,
      [RAFT_PARTITION_NODE_REQUEST.PEER_ADDRESS]: this.addressOf(replicaId),
      [RAFT_PARTITION_NODE_REQUEST.BOOTSTRAP_PEER_IDS]: bootstrapReplicaIds,
      [RAFT_PARTITION_NODE_REQUEST.DURABLE_LOG]: {
        end: () => undefined,
      },
      [RAFT_PARTITION_NODE_REQUEST.DURABLE_STORAGE]: db,
      [RAFT_PARTITION_NODE_REQUEST.TIMING]: PARTITION_TIMING,
      [RAFT_PARTITION_NODE_REQUEST.SUBSTRATE]:
        this.substrateFor === null ? {} : this.substrateFor(replicaId),
      [RAFT_PARTITION_NODE_REQUEST.DEFER_ELECTION]: true,
      [RAFT_PARTITION_NODE_REQUEST.SEND_TO_PEER]: (peerAddress, packet) => {
        this.queue(replicaId, peerAddress, packet);
        return Promise.resolve();
      },
      [RAFT_PARTITION_NODE_REQUEST.RESOLVE_PEER_ADDRESS]: (peerReplicaId) =>
        this.addressOf(peerReplicaId),
      [RAFT_PARTITION_NODE_REQUEST.APPLY_COMMITTED_ENTRY]: (command) => {
        replicaOf().appliedCommands.push(command);
      },
      [RAFT_PARTITION_NODE_REQUEST.SNAPSHOT_CATCHUP_NEEDED]: () => undefined,
      [RAFT_PARTITION_NODE_REQUEST.APPLY_TRANSACTION_ROLLED_BACK]: () =>
        undefined,
    };
  }

  /**
   * Build one replica through the seam.
   * @param {string} replicaId - The replica.
   * @param {Array<string>} bootstrapReplicaIds - The founding members.
   * @return {PartitionReplica} The replica.
   * @private
   */
  buildReplica(replicaId, bootstrapReplicaIds) {
    const dbFile = this.dbFileOf(replicaId);
    const db = new Database(dbFile);
    db.exec(SERVICES_DDL);
    const request = this.requestFor(replicaId, bootstrapReplicaIds, db);
    const replica = new PartitionReplica({
      replicaId, dbFile, db, request, node: null});
    this.replicas.set(replicaId, replica);
    replica.node = this.provider.createPartitionNode(request);
    return replica;
  }

  /**
   * @param {string} replicaId - The replica.
   * @return {PartitionReplica} Its parts.
   */
  replica(replicaId) {
    return this.replicas.get(replicaId);
  }

  /**
   * @param {string} replicaId - The replica.
   * @return {Object} The node the backend returned for it.
   */
  node(replicaId) {
    return this.replica(replicaId).node;
  }

  /**
   * The raft peer id the BACKEND registered for a replica. The driver never
   * chooses one.
   * @param {string} replicaId - The replica.
   * @return {string} The registered identity.
   */
  raftPeerIdOf(replicaId) {
    return this.node(replicaId).peerId;
  }

  /**
   * The transport: hold an envelope for its recipient. An isolated replica
   * neither sends nor receives, which is how a peer is cut off from the
   * cluster without being stopped.
   * @param {string} fromReplicaId - Who sent it.
   * @param {string} address - Where it is going.
   * @param {Object} envelope - The envelope.
   * @private
   */
  queue(fromReplicaId, address, envelope) {
    const toReplicaId = this.replicaIdOf(address);
    if (this.isolated.has(fromReplicaId) || this.isolated.has(toReplicaId)) {
      return;
    }
    const replica = this.replicas.get(toReplicaId);
    if (replica) {
      replica.inbox.push(envelope);
    }
  }

  /**
   * Cut one replica off from the cluster.
   * @param {string} replicaId - The replica.
   */
  isolate(replicaId) {
    this.isolated.add(replicaId);
    this.replica(replicaId).inbox.length = 0;
  }

  /**
   * Let it talk again.
   * @param {string} replicaId - The replica.
   */
  heal(replicaId) {
    this.isolated.delete(replicaId);
  }

  /** Deliver everything the transport is holding. */
  deliverAll() {
    for (const replica of this.replicas.values()) {
      const pending = replica.inbox.splice(0, replica.inbox.length);
      for (const envelope of pending) {
        replica.node.emit(RAFT_RS_NODE_EVENT.DATA, envelope);
      }
    }
  }

  /**
   * Tick the chosen replicas, deliver, and run `between` each round, until a
   * predicate holds.
   * @param {Function} untilTrue - What the partition is waiting for.
   * @param {Object} [options] - {rounds, between}.
   * @return {boolean} Whether it held.
   */
  settle(untilTrue, {rounds = 200, between = null} = {}) {
    for (let round = 0; round < rounds; round += 1) {
      if (untilTrue()) {
        return true;
      }
      for (const replicaId of this.tickers) {
        this.node(replicaId).tickOnce();
      }
      this.deliverAll();
      if (between) {
        between(round);
      }
    }
    return untilTrue();
  }

  /**
   * What the core itself says about a replica.
   * @param {string} replicaId - The replica.
   * @return {Object} The core's own status.
   */
  coreStatus(replicaId) {
    // Through the group the node hands out: there is no unguarded core to
    // read any more, and a read is a read - it asks no admission.
    return this.node(replicaId).raftRsGroupParts()
      .classified((core, handle) => core.status(handle)).value;
  }

  /**
   * The configuration the core holds for a replica.
   * @param {string} replicaId - The replica.
   * @return {Object} The ConfState.
   */
  coreConfState(replicaId) {
    return this.node(replicaId).raftRsGroupParts()
      .classified((core, handle) => core.conf_state(handle)).value;
  }

  /**
   * Propose one configuration change on the current leader, through the core
   * primitive. Membership POLICY is the caller's; this only carries it.
   * @param {Array<Object>} changes - ConfChangeSingle shapes.
   * @param {number} transition - The ConfChangeTransition.
   * @param {string} leader - The replica the caller measured as leading.
   */
  proposeConfigurationChange(changes, transition, leader) {
    this.node(leader).raftRsGroupParts().admitted((core, handle) =>
      core.propose_conf_change_v2(handle, {transition, changes}));
    this.node(leader).tickOnce();
  }

  /**
   * @return {string|null} The replica every peer agrees leads, or null.
   */
  leaderReplicaId() {
    const leads = new Set([...this.replicas.keys()]
      .map((replicaId) => this.coreStatus(replicaId).lead));
    if (leads.size !== 1 || leads.has(NO_LEADER)) {
      return null;
    }
    const [lead] = [...leads];
    return [...this.replicas.keys()]
      .find((replicaId) => this.raftPeerIdOf(replicaId) === lead) ?? null;
  }

  /**
   * Propose one command through the node the backend returned.
   * @param {string} replicaId - The proposing replica.
   * @param {Uint8Array} command - The command's bytes.
   * @return {Object} The node's named outcome.
   */
  propose(replicaId, command) {
    return this.node(replicaId).proposeCommand(command);
  }

  /**
   * Add a replica to this partition after formation: its own file, its own
   * request, built through the same seam with the committed voters as its
   * bootstrap members.
   * @param {string} replicaId - The joining replica.
   * @param {Array<string>} bootstrapReplicaIds - What it starts from.
   * @return {PartitionReplica} The new replica.
   */
  addReplica(replicaId, bootstrapReplicaIds) {
    // Lagrange's own workflow step: every existing peer is told the joining
    // replica's logical name, so it can address the identity that name
    // derives to. Nothing discovers the joiner from a row.
    const identities = new Set();
    for (const existing of this.replicas.values()) {
      identities.add(
        this.provider.registerPartitionPeer(existing.node, replicaId));
    }
    this.replicaIds.push(replicaId);
    const joined = this.buildReplica(replicaId, bootstrapReplicaIds);
    identities.add(joined.node.peerId);
    if (identities.size !== 1) {
      throw new Error('every peer must derive the same identity for one ' +
        `replica; they derived ${[...identities].join(', ')}`);
    }
    return joined;
  }

  /**
   * Restart one replica: close the node and its database, then build it again
   * from the SAME file through the same seam.
   * @param {string} replicaId - The replica.
   * @return {PartitionReplica} The restarted replica.
   */
  restart(replicaId) {
    const replica = this.replica(replicaId);
    const bootstrap =
      replica.request[RAFT_PARTITION_NODE_REQUEST.BOOTSTRAP_PEER_IDS];
    replica.node.end();
    replica.db.close();
    return this.buildReplica(replicaId, bootstrap);
  }

  /**
   * Write one replica's services rows. They are cache rows, and nothing the
   * backend does may read them.
   * @param {string} replicaId - Whose cache.
   * @param {Array<Object>} rows - {serviceId, status}.
   */
  writeServiceRows(replicaId, rows) {
    const {db} = this.replica(replicaId);
    db.prepare('DELETE FROM services').run();
    const insert = db.prepare(
      'INSERT INTO services (service_id, partition_id, service_type, status) ' +
      'VALUES (?, ?, ?, ?)');
    for (const row of rows) {
      insert.run(row.serviceId, this.partitionId, 'PARTITION', row.status);
    }
  }

  /** Close every node and database and remove the directory. */
  dispose() {
    for (const replica of this.replicas.values()) {
      try {
        replica.node.end();
      } catch {
        // A trapped runtime cannot free a handle; the files still close.
      }
      try {
        replica.db.close();
      } catch {
        // Already closed by a restart.
      }
    }
    fs.rmSync(this.directory, {recursive: true, force: true});
  }
}

export {PartitionNodeCluster};
