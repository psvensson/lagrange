// One WASM runtime holding many raft-rs groups, and what happens when it
// traps.
//
// Binding direction §8: a trap marks the containing runtime unhealthy. This
// host does exactly that and nothing cleverer - it does not retry, it does
// not quarantine the group that trapped and keep the rest running, and it
// does not decide the trap was harmless. After a trap every dispatch into
// that runtime is refused by name until it is replaced.
//
// Replacement instantiates a fresh module and restores every registered group
// from ITS OWN DURABLE RECORD through the phase-1 restore path. Nothing is
// carried over from the dead runtime's memory: the only inputs to a restored
// group are its group id, its peer id and its store.

import {
  RAFT_RS_CALL_OUTCOME,
  RAFT_RS_PANIC_CHANNEL,
  RAFT_RS_PANIC_JOINER,
  RAFT_RS_RUNTIME_ERROR_MSG,
  RAFT_RS_RUNTIME_HEALTH,
} from './raft-rs-runtime-health-constants.js';
import {createRaftRsGroup, restoreRaftRsGroup} from './raft-rs-group.js';

/**
 * Run one piece of work with the crate's panic channel captured.
 *
 * A raft-rs fatal reaches JavaScript as a trap carrying no reason; the reason
 * is what the panic hook wrote to console.error while the trap was unwinding.
 * Capturing it is the only way a host learns what happened.
 * @param {Function} work - The work to run.
 * @return {Object} {threw, error, diagnosis}.
 */
function runCapturingThePanicChannel(work) {
  const captured = [];
  const original = console[RAFT_RS_PANIC_CHANNEL];
  console[RAFT_RS_PANIC_CHANNEL] = (...args) => {
    captured.push(
      args.map((arg) => String(arg)).join(RAFT_RS_PANIC_JOINER.ARGUMENTS));
  };
  try {
    const value = work();
    return {threw: false, value, error: null, diagnosis: null};
  } catch (error) {
    return {
      threw: true,
      value: undefined,
      error: String(error?.message || error),
      diagnosis: captured.join(RAFT_RS_PANIC_JOINER.LINES),
    };
  } finally {
    console[RAFT_RS_PANIC_CHANNEL] = original;
  }
}

/**
 * One group this runtime holds: what it is, and what it can be rebuilt from.
 */
class RaftRsHostedGroup {
  /**
   * @param {Object} parts - The group's parts.
   * @param {string} parts.key - What this host calls this hosted node. A
   *   runtime may hold several replicas of one group, so the host's key and
   *   the durable record's group id are separate names.
   * @param {string} parts.groupId - The group whose durable record this is.
   * @param {string} parts.peerId - This peer's raft id, a decimal string.
   * @param {Object} parts.store - The group's durable Raft record.
   * @param {number} parts.handle - Its handle in the current runtime.
   */
  constructor({key, groupId, peerId, store, handle}) {
    this.key = key;
    this.groupId = groupId;
    this.peerId = peerId;
    this.store = store;
    this.handle = handle;
  }
}

/**
 * A Multi-Raft host: one runtime, many groups, one health state.
 */
class RaftRsRuntimeHost {
  /**
   * @param {Object} options - The host's inputs.
   * @param {Function} options.instantiate - Builds a fresh runtime.
   */
  constructor({instantiate}) {
    this.instantiate = instantiate;
    this.runtime = instantiate();
    this.groupsById = new Map();
    this.healthState = RAFT_RS_RUNTIME_HEALTH.HEALTHY;
    this.trap = null;
  }

  /** @return {Object} The runtime every group currently lives in. */
  get core() {
    return this.runtime;
  }

  /** @return {string} The runtime's health, by name. */
  get health() {
    return this.healthState;
  }

  /** @return {Object|null} What the last trap was, or null. */
  get lastTrap() {
    return this.trap;
  }

  /** @return {Array<string>} Every hosted node, by this host's own key. */
  groups() {
    return [...this.groupsById.keys()];
  }

  /**
   * The handle a hosted node has in the current runtime.
   * @param {string} key - What this host calls it.
   * @return {number} Its handle.
   */
  handleOf(key) {
    return this.hostedGroup(key).handle;
  }

  /**
   * @param {string} key - What this host calls it.
   * @return {RaftRsHostedGroup} The hosted group.
   * @private
   */
  hostedGroup(key) {
    const hosted = this.groupsById.get(key);
    if (hosted === undefined) {
      throw new Error(RAFT_RS_RUNTIME_ERROR_MSG.unknownGroup(key));
    }
    return hosted;
  }

  /**
   * Create a fresh group in this runtime and hold it.
   * @param {Object} options - The group's inputs.
   * @return {number} Its handle.
   */
  openGroup({key, groupId, peerId, store, voters, learners, tuning}) {
    const handle = createRaftRsGroup({
      core: this.runtime, store, groupId, peerId, voters, learners, tuning,
    });
    this.groupsById.set(key ?? groupId,
      new RaftRsHostedGroup({
        key: key ?? groupId, groupId, peerId, store, handle}));
    return handle;
  }

  /**
   * Hold a node that already exists in this runtime, so a replacement can
   * restore it.
   * @param {Object} options - The node's parts.
   */
  adoptGroup({key, groupId, peerId, store, handle}) {
    this.groupsById.set(key ?? groupId,
      new RaftRsHostedGroup({
        key: key ?? groupId, groupId, peerId, store, handle}));
  }

  /**
   * Run work against one group inside the trap boundary.
   *
   * Nothing runs in an unhealthy runtime: the refusal is a named outcome, not
   * an exception the caller might swallow.
   * @param {string} key - The hosted node to run against.
   * @param {Function} work - Called with (core, handle).
   * @return {Object} {outcome, value, error, diagnosis}.
   */
  run(key, work) {
    if (this.healthState !== RAFT_RS_RUNTIME_HEALTH.HEALTHY) {
      return Object.freeze({
        outcome: RAFT_RS_CALL_OUTCOME.RUNTIME_UNHEALTHY,
        value: undefined,
        error: RAFT_RS_RUNTIME_ERROR_MSG.stillUnhealthy(),
        diagnosis: this.trap === null ? null : this.trap.diagnosis,
      });
    }
    const hosted = this.hostedGroup(key);
    const ran = runCapturingThePanicChannel(
      () => work(this.runtime, hosted.handle));
    if (!ran.threw) {
      return Object.freeze({
        outcome: RAFT_RS_CALL_OUTCOME.COMPLETED,
        value: ran.value, error: null, diagnosis: null,
      });
    }
    this.healthState = RAFT_RS_RUNTIME_HEALTH.UNHEALTHY_AFTER_TRAP;
    this.trap = Object.freeze({
      key, groupId: hosted.groupId, error: ran.error,
      diagnosis: ran.diagnosis,
    });
    return Object.freeze({
      outcome: RAFT_RS_CALL_OUTCOME.TRAPPED,
      value: undefined, error: ran.error, diagnosis: ran.diagnosis,
    });
  }

  /**
   * Retire the runtime and rebuild it: a fresh instance, and every group back
   * from its own durable Raft record.
   * @return {Object} {restored, health}.
   */
  replaceRuntime() {
    this.runtime = this.instantiate();
    const restored = [];
    for (const hosted of this.groupsById.values()) {
      hosted.handle = restoreRaftRsGroup({
        core: this.runtime,
        store: hosted.store,
        groupId: hosted.groupId,
        peerId: hosted.peerId,
      });
      restored.push(hosted.key);
    }
    this.healthState = RAFT_RS_RUNTIME_HEALTH.HEALTHY;
    return Object.freeze({restored: Object.freeze(restored),
      health: this.healthState});
  }
}

export {
  RAFT_RS_CALL_OUTCOME,
  RAFT_RS_RUNTIME_HEALTH,
  RaftRsRuntimeHost,
};
