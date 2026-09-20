// The experimental raft-rs-wasm provider: what the backend seam selects when
// a configuration names `raft-rs-wasm`.
//
// It is experimental and it is phase 1. Every seam name the production call
// census finds is present; the names phase 1 measured are served from the
// core, and the rest refuse by name with the reason they are deferred. There
// is no quieter path: a caller either gets an answer the core gave or a typed
// refusal.

import {
  RAFT_RS_PROVIDER_DEFERRED,
  RAFT_RS_PROVIDER_ERROR_MSG,
  RAFT_RS_PROVIDER_SERVED,
  RAFT_RS_PROVIDER_STATUS_FIELD,
} from './raft-rs-provider-constants.js';
import {createRaftRsNodeClass} from './raft-rs-node.js';
import {loadRaftRsCore} from './raft-rs-core.js';
import {
  RAFT_RS_TICK_SCHEDULING,
  buildRaftRsPartitionNode,
} from './raft-rs-partition-node.js';
import {
  RAFT_RS_PARTITION_ERROR_MSG,
} from './raft-rs-partition-node-constants.js';

/**
 * One group of this backend: a handle inside the shared WASM runtime, its
 * durable record, and the group it belongs to.
 */
class RaftRsGroupHandle {
  /**
   * @param {Object} parts - The group's parts.
   * @param {Object} parts.core - The raft-rs primitive facade.
   * @param {number} parts.handle - The core handle.
   * @param {Object} parts.store - The durable Raft record.
   * @param {string} parts.groupId - The group id.
   */
  constructor({core, handle, store, groupId}) {
    this.core = core;
    this.handle = handle;
    this.store = store;
    this.groupId = groupId;
  }
}

/**
 * The group behind whatever the seam handed us.
 *
 * The seam passes `this.raft` - the node object - to every provider method,
 * while a group of this backend is a handle inside a runtime. One function
 * resolves both spellings, so there is a single path from the seam's argument
 * to the core, and anything else is refused by name.
 * @param {*} value - What the seam passed.
 * @return {RaftRsGroupHandle} The group.
 */
function raftRsGroupOf(value) {
  if (value instanceof RaftRsGroupHandle) {
    return value;
  }
  if (typeof value?.raftRsGroupParts === 'function') {
    return new RaftRsGroupHandle(value.raftRsGroupParts());
  }
  throw new Error(RAFT_RS_PROVIDER_ERROR_MSG.notARaftRsGroup(value));
}

/**
 * Read one 64-bit field of the core's status without rounding it.
 * @param {RaftRsGroupHandle} group - The group.
 * @param {string} field - The status field.
 * @return {number} The value.
 */
function exactStatusNumber(group, field) {
  const value = group.core.status(group.handle)[field];
  const asNumber = Number(value);
  if (!Number.isSafeInteger(asNumber)) {
    throw new Error(
      RAFT_RS_PROVIDER_ERROR_MSG.beyondSafeInteger(field, value));
  }
  return asNumber;
}

/**
 * Refuse what the seam asks for but phase 1 does not serve.
 * @param {string} name - The seam method name.
 */
function refuseDeferred(name) {
  throw new Error(RAFT_RS_PROVIDER_ERROR_MSG.deferred(name));
}

/**
 * The experimental raft-rs backend behind the provider seam.
 */
class RaftRsWasmProvider {
  /**
   * @param {Object} [options] - The options the seam was selected from.
   */
  constructor(options = {}) {
    this.options = options;
    this.core = options.core || loadRaftRsCore();
    // What this backend holds about each partition node IT built: the tick
    // driver, the peer registry and the durable retirement record. It is a
    // WeakMap so the node stays the only handle, and so the seam's node
    // surface does not grow a member for the backend's own bookkeeping.
    this.partitionControls = new WeakMap();
    for (const name of Object.keys(RAFT_RS_PROVIDER_DEFERRED)) {
      this[name] = () => refuseDeferred(name);
    }
  }

  /**
   * What this backend holds about one node it built.
   * @param {Object} node - The node the seam passed back.
   * @return {Object} Its control.
   * @private
   */
  partitionControlOf(node) {
    const control = this.partitionControls.get(node);
    if (control === undefined) {
      throw new Error(RAFT_RS_PARTITION_ERROR_MSG.notAPartitionNode());
    }
    return control;
  }

  /**
   * Build the node one partition group runs on.
   * @param {Object} request - The partition group's requirements.
   * @return {Object} The node.
   */
  createPartitionNode(request) {
    const control = buildRaftRsPartitionNode(request);
    this.partitionControls.set(control.node, control);
    return control.node;
  }

  /**
   * Register one logical Lagrange replica's raft identity with this node's
   * own durable registry, and answer what it is.
   *
   * The identity is a derivation of the replica's own name (§10), so every
   * peer that registers the same replica computes the same value - but a peer
   * can only ADDRESS an identity it holds a reservation for, because the
   * derivation is one-way. Adding a replica to a group is therefore a
   * Lagrange workflow step that names the joining replica to each existing
   * peer before any configuration change is proposed; the backend never
   * discovers a replica by reading a service row.
   * @param {Object} node - A node this backend built.
   * @param {string} replicaIdentity - The joining replica's logical name.
   * @return {string} Its raft peer id, as an exact decimal string.
   */
  registerPartitionPeer(node, replicaIdentity) {
    return this.partitionControlOf(node).registry
      .registerReplica(replicaIdentity);
  }

  /**
   * How this backend is scheduling one partition node, by name.
   * @param {Object} node - A node this backend built.
   * @return {Object} {scheduling, retired, ticksDriven, peerId}.
   */
  partitionScheduling(node) {
    const control = this.partitionControlOf(node);
    return Object.freeze({
      scheduling: control.scheduling,
      retired: control.retired,
      ticksDriven: control.ticksDriven,
      peerId: control.peerId,
    });
  }

  /**
   * Durably retire one replica from runtime scheduling and stop driving it.
   *
   * Not a campaign guard: after this the host gives the core no ticks at all,
   * in this process and - because the record is durable and read before the
   * tick driver exists - in every later one.
   * @param {Object} node - A node this backend built.
   * @param {string} retiredAt - When the decision was taken.
   * @return {Object} {scheduling, retiredAt}.
   */
  retireFromScheduling(node, retiredAt) {
    const control = this.partitionControlOf(node);
    const recorded = control.store.putRetirement(
      control.groupId, control.peerId, retiredAt);
    control.retirement = control.store.readRetirement(
      control.groupId, control.peerId);
    control.driver.retired = true;
    control.driver.stop();
    control.driver.state = RAFT_RS_TICK_SCHEDULING.REFUSED_RETIRED;
    return Object.freeze({
      scheduling: control.scheduling, retiredAt: recorded});
  }

  /**
   * Start driving this group's core, which is how an election becomes
   * possible under this backend: raft-rs has no host-owned election timer,
   * elections follow from tick().
   * @param {Object} node - A node this backend built.
   * @return {string} The named scheduling state.
   */
  startElectionTimer(node) {
    const control = this.partitionControlOf(node);
    return control.driver.start(() => control.node.tickOnce());
  }

  /**
   * Stop driving this group's core.
   * @param {Object} node - A node this backend built.
   * @return {string} The named scheduling state.
   */
  clearTimers(node) {
    return this.partitionControlOf(node).driver.stop();
  }

  /**
   * Ask this peer to campaign now, through the guarded path.
   * @param {Object} node - A node this backend built.
   * @return {Object} {campaigned, refusal, detail}.
   */
  requestElectionNow(node) {
    return this.partitionControlOf(node).campaign();
  }

  /** The seam names this backend answers from the core.
   * @return {Array<string>} The served names. */
  static servedMethods() {
    return RAFT_RS_PROVIDER_SERVED.slice();
  }

  /** The seam names this backend refuses, with the reason for each.
   * @return {Object} Name to reason. */
  static deferredMethods() {
    return {...RAFT_RS_PROVIDER_DEFERRED};
  }

  /**
   * Propose one command's bytes into the group's core.
   * @param {*} node - The node, or the group behind it.
   * @param {Uint8Array} command - The command's bytes.
   * @param {Function} [callback] - Called with the outcome.
   * @return {Promise<void>} Resolved when the core accepted the proposal.
   */
  propose(node, command, callback) {
    const group = raftRsGroupOf(node);
    try {
      group.core.propose(group.handle, command);
    } catch (error) {
      if (typeof callback === 'function') {
        callback(error);
      }
      throw error;
    }
    if (typeof callback === 'function') {
      callback(null);
    }
    return Promise.resolve();
  }

  /**
   * The node class the seam asks a backend for: one raft-rs group presented
   * at the node shape production holds in `this.raft`.
   *
   * The seam's context is shaped for a liferaft node, so the node class
   * refuses by name whatever a raft-rs group additionally needs and the
   * context does not carry.
   * @param {Object} context - The seam's context.
   * @return {Function} The node class.
   */
  createNodeClass(context) {
    return createRaftRsNodeClass(context);
  }

  /**
   * Free the group's handle in the WASM runtime.
   * @param {*} node - The node, or the group behind it.
   */
  shutdownNode(node) {
    const group = raftRsGroupOf(node);
    group.core.free(group.handle);
  }

  /**
   * The term the core reports.
   * @param {*} node - The node, or the group behind it.
   * @return {number} The term.
   */
  getCurrentTerm(node) {
    return exactStatusNumber(
      raftRsGroupOf(node), RAFT_RS_PROVIDER_STATUS_FIELD.TERM);
  }

  /**
   * The commit index the core reports.
   * @param {*} node - The node, or the group behind it.
   * @return {number} The commit index.
   */
  getCommittedIndex(node) {
    return exactStatusNumber(
      raftRsGroupOf(node), RAFT_RS_PROVIDER_STATUS_FIELD.COMMIT);
  }
}

export {RaftRsWasmProvider};
