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
    for (const name of Object.keys(RAFT_RS_PROVIDER_DEFERRED)) {
      this[name] = () => refuseDeferred(name);
    }
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
