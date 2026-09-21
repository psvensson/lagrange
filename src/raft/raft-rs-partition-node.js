// The node one Lagrange partition group runs on, under the experimental
// raft-rs backend.
//
// This is what `RaftRsWasmProvider.createPartitionNode` builds, and it is the
// answer to the refusal phase 1 recorded: the durable store opened on the
// replica's OWN database, a peer identity REGISTERED for this replica and for
// every bootstrap member, a tick driver on the substrate the group handed
// over, transport through the request's own send hook, and the retirement
// record read BEFORE anything ticks.
//
// Three things it deliberately does not do:
//
//   it never reads a service or system-table row. The only inputs are the
//   request's declared fields and this replica's own durable record, and the
//   import list below is the structural half of that claim;
//
//   it never derives an identity from a position. Every raft peer id comes
//   from the durable registry (§10), so the same replica gets the same
//   identity whatever order a caller happened to list it in;
//
//   it never starts a retired replica ticking. Retirement is read from the
//   durable record before the tick driver exists, so a restart preserves it
//   without depending on anything the process learns later (addendum §5).

import {RaftRsDurableStore} from './raft-rs-durable-store.js';
import {RaftRsPeerIdentityRegistry} from './raft-rs-peer-identity.js';
import {RaftRsReplicaLifecycle} from './raft-rs-replica-lifecycle.js';
import {RaftRsRuntimeHost} from './raft-rs-runtime-health.js';
import {
  campaignRaftRsPeer,
  retiredElectionRefusal,
} from './raft-rs-election-safety.js';
import {
  RAFT_RS_CALL_OUTCOME,
} from './raft-rs-runtime-health-constants.js';
import {createRaftRsNodeClass} from './raft-rs-node.js';
import {instantiateRaftRsCore} from './raft-rs-core.js';
import {resolveTimeSource} from '../time/time-source.js';
import {
  RAFT_PARTITION_NODE_REQUEST,
} from './raft-provider-contract-constants.js';
import {
  RAFT_RS_GROUP_TUNING,
} from './raft-rs-group-constants.js';
import {
  RAFT_RS_NODE_EVENT,
} from './raft-rs-node-constants.js';
import {
  RAFT_RS_ENTRY_DATA_ENCODING,
  RAFT_RS_PARTITION_ERROR_MSG,
  RAFT_RS_TICK_FLOOR_MS,
  RAFT_RS_TICK_SCHEDULING,
} from './raft-rs-partition-node-constants.js';

// One runtime per process holds every raft-rs group (§9). It is lazy for the
// same reason the core loader is: a process that never selects this backend
// never instantiates a WASM module.
let sharedHost = null;

/**
 * The runtime every raft-rs partition group in this process lives in.
 * @return {RaftRsRuntimeHost} The shared Multi-Raft host.
 */
function sharedRuntimeHost() {
  if (sharedHost === null) {
    sharedHost = new RaftRsRuntimeHost({instantiate: instantiateRaftRsCore});
  }
  return sharedHost;
}

/**
 * Read one declared field of the partition node request, refusing by name
 * when the boundary does not carry it.
 * @param {Object} request - The partition group's requirements.
 * @param {string} field - A RAFT_PARTITION_NODE_REQUEST value.
 * @return {*} The field.
 */
function required(request, field) {
  const value = request?.[field];
  if (value === undefined || value === null) {
    throw new Error(RAFT_RS_PARTITION_ERROR_MSG.missingRequest(field));
  }
  return value;
}

/**
 * How often the host ticks this group's core.
 *
 * Derived, never chosen: the group states a heartbeat interval in
 * milliseconds and the core counts heartbeats in ticks, so one tick is the
 * heartbeat divided by the core's own heartbeat tick count. A group that
 * states a tick interval outright is taken at its word.
 * @param {Object} timing - The request's timing.
 * @return {number} The tick period in milliseconds.
 */
function tickIntervalMsOf(timing) {
  if (Number.isFinite(timing.tickIntervalMs) && timing.tickIntervalMs > 0) {
    return timing.tickIntervalMs;
  }
  return Math.max(RAFT_RS_TICK_FLOOR_MS,
    Math.floor(timing.heartbeatMs / RAFT_RS_GROUP_TUNING.HEARTBEAT_TICK));
}

/**
 * The tick driver of one partition node, and the reason it is or is not
 * running.
 */
class RaftRsPartitionTickDriver {
  /**
   * @param {Object} parts - The driver's inputs.
   * @param {Object} parts.timers - The substrate's clock.
   * @param {number} parts.intervalMs - The derived tick period.
   * @param {RaftRsReplicaLifecycle} parts.lifecycle - Whether this local
   *   replica may participate at all. The driver holds no retirement flag of
   *   its own: one owner answers that question for every caller.
   */
  constructor({timers, intervalMs, lifecycle}) {
    this.timers = timers;
    this.intervalMs = intervalMs;
    this.lifecycle = lifecycle;
    this.handle = null;
    this.state = lifecycle.retired ?
      RAFT_RS_TICK_SCHEDULING.REFUSED_RETIRED :
      RAFT_RS_TICK_SCHEDULING.STOPPED;
    this.ticksDriven = 0;
  }

  /** @return {boolean} Whether this replica is retired, per its owner. */
  get retired() {
    return this.lifecycle.retired;
  }

  /**
   * Start driving, unless this replica is retired.
   *
   * This is the whole of "retirement is scheduling eligibility": a retired
   * replica is never given to the clock, so it takes no election ticks and
   * cannot campaign by timeout. The campaign guard remains, but it is not
   * what protects the cluster here.
   * @param {Function} tick - One tick into the core.
   * @param {number} [intervalMs] - Override the derived period.
   * @return {string} The named scheduling state.
   */
  start(tick, intervalMs) {
    if (this.retired) {
      return RAFT_RS_TICK_SCHEDULING.REFUSED_RETIRED;
    }
    if (Number.isFinite(intervalMs) && intervalMs > 0) {
      this.intervalMs = intervalMs;
    }
    this.stop();
    this.handle = this.timers.setInterval(() => {
      this.ticksDriven += 1;
      tick();
    }, this.intervalMs);
    this.state = RAFT_RS_TICK_SCHEDULING.RUNNING;
    return this.state;
  }

  /**
   * Stop driving. A retired replica keeps its own state, because it was never
   * merely stopped.
   * @return {string} The named scheduling state.
   */
  stop() {
    if (this.handle !== null) {
      this.timers.clearInterval(this.handle);
      this.handle = null;
    }
    if (!this.retired) {
      this.state = RAFT_RS_TICK_SCHEDULING.STOPPED;
    }
    return this.state;
  }
}

/**
 * Everything this backend holds about one partition node it built.
 */
class RaftRsPartitionControl {
  /**
   * @param {Object} parts - The control's parts.
   */
  constructor({node, store, registry, groupId, peerId, driver, lifecycle}) {
    this.node = node;
    this.store = store;
    this.registry = registry;
    this.groupId = groupId;
    this.peerId = peerId;
    this.driver = driver;
    this.lifecycle = lifecycle;
  }

  /** @return {boolean} Whether the durable record retired this replica. */
  get retired() {
    return this.lifecycle.retired;
  }

  /** @return {string} The named scheduling state. */
  get scheduling() {
    return this.driver.state;
  }

  /** @return {number} How many ticks the host has driven into the core. */
  get ticksDriven() {
    return this.driver.ticksDriven;
  }

  /**
   * Campaign, through the one guarded path (§11), with the durable
   * retirement record as the host's own answer.
   * @return {Object} {campaigned, refusal, detail}.
   */
  campaign() {
    const ran = this.node.raftRsGroupParts().admitted((core, handle) =>
      campaignRaftRsPeer({core, handle, peerId: this.peerId}));
    if (ran.outcome === RAFT_RS_CALL_OUTCOME.COMPLETED) {
      return ran.value;
    }
    // The admission boundary refused before the core was touched. The
    // election owner names that refusal in its own vocabulary.
    return retiredElectionRefusal(this.peerId);
  }
}

/**
 * Build the node one partition group runs on, on the raft-rs core.
 * @param {Object} request - The partition group's requirements.
 * @return {RaftRsPartitionControl} The node and what this backend holds
 *   about it.
 */
function buildRaftRsPartitionNode(request) {
  const groupId = required(request, RAFT_PARTITION_NODE_REQUEST.GROUP_ID);
  const replicaIdentity =
    required(request, RAFT_PARTITION_NODE_REQUEST.PEER_ID);
  const database =
    required(request, RAFT_PARTITION_NODE_REQUEST.DURABLE_STORAGE);
  const timing = required(request, RAFT_PARTITION_NODE_REQUEST.TIMING);
  const sendToPeer =
    required(request, RAFT_PARTITION_NODE_REQUEST.SEND_TO_PEER);
  const resolvePeerAddress =
    required(request, RAFT_PARTITION_NODE_REQUEST.RESOLVE_PEER_ADDRESS);
  const applyCommittedEntry =
    required(request, RAFT_PARTITION_NODE_REQUEST.APPLY_COMMITTED_ENTRY);
  const bootstrapReplicaIds =
    required(request, RAFT_PARTITION_NODE_REQUEST.BOOTSTRAP_PEER_IDS);

  const store = new RaftRsDurableStore(database);
  const registry = new RaftRsPeerIdentityRegistry(database);
  const peerId = registry.registerReplica(replicaIdentity);
  const voters = bootstrapReplicaIds.map(
    (identity) => registry.registerReplica(identity));

  // Read BEFORE the node exists, so nothing can tick or be delivered between
  // construction and the answer - and so a restart has the answer before it
  // has anything else.
  const lifecycle = new RaftRsReplicaLifecycle({store, groupId, peerId});
  const driver = new RaftRsPartitionTickDriver({
    timers: resolveTimeSource(
      request[RAFT_PARTITION_NODE_REQUEST.SUBSTRATE] || {}),
    intervalMs: tickIntervalMsOf(timing),
    lifecycle,
  });

  const NodeClass = createRaftRsNodeClass({
    runtimeHost: sharedRuntimeHost(),
    store,
    groupId,
    peerId,
    voters,
    learners: [],
    lifecycle,
    resolvePeerAddress: (raftPeerId) => {
      const identity = registry.replicaIdentityOf(raftPeerId);
      if (identity === null) {
        throw new Error(
          RAFT_RS_PARTITION_ERROR_MSG.unknownPeerIdentity(raftPeerId));
      }
      return resolvePeerAddress(identity);
    },
    deliverPacket: (address, envelope) => sendToPeer(address, envelope),
    scheduleTick: (intervalMs, tick) => driver.start(tick, intervalMs),
  });

  const node = new NodeClass(
    required(request, RAFT_PARTITION_NODE_REQUEST.PEER_ADDRESS));
  // The group asked to be told what committed, in bytes. The Ready loop hands
  // the entry's own data to the node, which announces it; the fact crosses,
  // the shape of a liferaft command does not.
  node.on(RAFT_RS_NODE_EVENT.COMMIT, (data) =>
    applyCommittedEntry(Buffer.from(data, RAFT_RS_ENTRY_DATA_ENCODING)));
  const control = new RaftRsPartitionControl({
    node, store, registry, groupId, peerId, driver, lifecycle});
  if (request[RAFT_PARTITION_NODE_REQUEST.DEFER_ELECTION] === true) {
    driver.state = driver.retired ?
      RAFT_RS_TICK_SCHEDULING.REFUSED_RETIRED :
      RAFT_RS_TICK_SCHEDULING.DEFERRED_BY_THE_GROUP;
    return control;
  }
  driver.start(() => node.tickOnce());
  return control;
}

export {
  RAFT_RS_TICK_SCHEDULING,
  buildRaftRsPartitionNode,
};
