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
  RAFT_RS_CORE_REFUSAL_TYPE,
  RAFT_RS_FAILURE_ORIGIN,
  RAFT_RS_GROUP_ORIGIN,
  RAFT_RS_ORIGIN_OUTCOME,
  RAFT_RS_PANIC_CHANNEL,
  RAFT_RS_PANIC_JOINER,
  RAFT_RS_RUNTIME_ERROR_MSG,
  RAFT_RS_RUNTIME_HEALTH,
} from './raft-rs-runtime-health-constants.js';
import {createRaftRsGroup, restoreRaftRsGroup} from './raft-rs-group.js';

/**
 * Which domain a value thrown BY AN INVOCATION came from.
 *
 * Structural, and derived from the binding: a refusal is the binding's own
 * `jserr` string, a fatal is the abort's `WebAssembly.RuntimeError`, and
 * anything else is JavaScript that is neither - the generated glue failing to
 * convert an argument, most often. Nothing reads a message.
 * @param {*} thrown - What the invocation threw.
 * @return {string} A RAFT_RS_FAILURE_ORIGIN value.
 */
function originOfThrownValue(thrown) {
  if (typeof thrown === RAFT_RS_CORE_REFUSAL_TYPE) {
    return RAFT_RS_FAILURE_ORIGIN.CORE_REFUSAL;
  }
  // A trap announces itself as a RuntimeError; an invocation that ran out of
  // stack traps too, and THAT one arrives as a RangeError. Both abort the
  // call inside the instance, so both are fatal. This test is only ever
  // applied to a value an invocation threw - host code that recurses away
  // its own stack never reaches here - so widening it cannot make host
  // JavaScript fatal.
  if (thrown instanceof globalThis.WebAssembly.RuntimeError ||
    thrown instanceof RangeError) {
    return RAFT_RS_FAILURE_ORIGIN.WASM_INVOCATION;
  }
  return RAFT_RS_FAILURE_ORIGIN.HOST;
}

/**
 * What one invocation of one core primitive did, carried out of the call so
 * the host code around it cannot be mistaken for it.
 *
 * It is not an Error: host code that catches Errors must not be able to
 * swallow this, and the boundary recognises it by identity rather than by
 * type.
 */
class RaftRsInvocationFailure {
  /**
   * @param {Object} parts - {origin, error, diagnosis}.
   */
  constructor({origin, error, diagnosis}) {
    this.origin = origin;
    this.error = error;
    this.diagnosis = diagnosis;
  }
}

/**
 * Call one core primitive with the crate's panic channel captured, and
 * classify anything it throws.
 *
 * This is THE classifying boundary, and it is exactly one WASM call wide:
 * host preparation happens before it, host persistence, sending and applying
 * happen after it, and neither can reach this catch. A raft-rs fatal reaches
 * JavaScript as a trap carrying no reason - the reason is what the panic hook
 * wrote to console.error while the process was aborting - so the channel is
 * captured for the duration of this call and no longer.
 * @param {Function} primitive - The binding's own function.
 * @param {Array} args - Its arguments.
 * @return {*} What the core returned.
 */
function invokeCorePrimitive(primitive, args) {
  const captured = [];
  const original = console[RAFT_RS_PANIC_CHANNEL];
  console[RAFT_RS_PANIC_CHANNEL] = (...parts) => {
    captured.push(
      parts.map((part) => String(part)).join(RAFT_RS_PANIC_JOINER.ARGUMENTS));
  };
  try {
    return primitive(...args);
  } catch (thrown) {
    throw new RaftRsInvocationFailure({
      origin: originOfThrownValue(thrown),
      error: String(thrown?.message || thrown),
      diagnosis: captured.join(RAFT_RS_PANIC_JOINER.LINES),
    });
  } finally {
    console[RAFT_RS_PANIC_CHANNEL] = original;
  }
}

/**
 * The same primitives, each one its own classified invocation.
 *
 * Work given to `run` is handed this rather than the bare facade, so the only
 * code inside the classifying boundary is the call itself.
 * @param {Object} core - The raft-rs primitive facade.
 * @return {Object} A frozen facade of guarded primitives.
 */
function guardedCore(core) {
  const guarded = {};
  for (const [name, primitive] of Object.entries(core)) {
    guarded[name] = (...args) => invokeCorePrimitive(primitive, args);
  }
  return Object.freeze(guarded);
}

/**
 * What a failure that escaped the work means, whichever domain raised it.
 * @param {*} thrown - What the work threw.
 * @return {RaftRsInvocationFailure} Its classification.
 */
function classifyEscapedFailure(thrown) {
  if (thrown instanceof RaftRsInvocationFailure) {
    return thrown;
  }
  // Nothing tagged it, so it was not raised by an invocation at all: it is
  // host JavaScript, and it says nothing about the runtime.
  return new RaftRsInvocationFailure({
    origin: RAFT_RS_FAILURE_ORIGIN.HOST,
    error: String(thrown?.message || thrown),
    diagnosis: null,
  });
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
   * @param {string} [parts.origin] - How it came to be here, by name.
   */
  constructor({
    key, groupId, peerId, store, handle,
    origin = RAFT_RS_GROUP_ORIGIN.ADOPTED,
  }) {
    this.key = key;
    this.groupId = groupId;
    this.peerId = peerId;
    this.store = store;
    this.handle = handle;
    this.origin = origin;
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
    this.guarded = guardedCore(this.runtime);
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
   * Bring one group up in this runtime and hold it.
   *
   * A group that already has a durable record comes back FROM THAT RECORD -
   * the same restore path a runtime replacement uses - and only a group with
   * no record is created from the bootstrap membership the caller passed. A
   * restart is not a second formation, so the bootstrap list is an input to
   * creation alone and can never overwrite a committed configuration.
   * @param {Object} options - The group's inputs.
   * @return {number} Its handle.
   */
  openGroup({key, groupId, peerId, store, voters, learners, tuning}) {
    const resumed = store.hasDurableRecord(groupId);
    const handle = resumed ?
      restoreRaftRsGroup({
        core: this.runtime, store, groupId, peerId, tuning}) :
      createRaftRsGroup({
        core: this.runtime, store, groupId, peerId, voters, learners, tuning,
      });
    this.groupsById.set(key ?? groupId,
      new RaftRsHostedGroup({
        key: key ?? groupId,
        groupId,
        peerId,
        store,
        handle,
        origin: resumed ?
          RAFT_RS_GROUP_ORIGIN.RESTORED_FROM_DURABLE_RECORD :
          RAFT_RS_GROUP_ORIGIN.CREATED_FRESH,
      }));
    return handle;
  }

  /**
   * How a hosted group came to be in this runtime, by name.
   * @param {string} key - What this host calls it.
   * @return {string} A RAFT_RS_GROUP_ORIGIN value.
   */
  originOf(key) {
    return this.hostedGroup(key).origin;
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
   * Run work against one group, with every core call inside it classified.
   *
   * The work is host code: it prepares, it calls the core through the guarded
   * facade, it persists, sends and applies. Only the calls can produce a
   * fatal, because only the calls are inside the classifying boundary - a
   * SQLite write, a send hook, an address resolver or an application callback
   * that throws here reaches this catch untagged and is host failure by
   * construction.
   *
   * Nothing runs in an unhealthy runtime: the refusal is a named outcome, not
   * an exception the caller might swallow.
   * @param {string} key - The hosted node to run against.
   * @param {Function} work - Called with (guarded core, handle).
   * @return {Object} {outcome, origin, value, error, diagnosis}.
   */
  run(key, work) {
    if (this.healthState !== RAFT_RS_RUNTIME_HEALTH.HEALTHY) {
      return Object.freeze({
        outcome: RAFT_RS_CALL_OUTCOME.RUNTIME_UNHEALTHY,
        origin: null,
        value: undefined,
        error: RAFT_RS_RUNTIME_ERROR_MSG.stillUnhealthy(),
        diagnosis: this.trap === null ? null : this.trap.diagnosis,
      });
    }
    const hosted = this.hostedGroup(key);
    try {
      return Object.freeze({
        outcome: RAFT_RS_CALL_OUTCOME.COMPLETED,
        origin: null,
        value: work(this.guarded, hosted.handle),
        error: null,
        diagnosis: null,
      });
    } catch (thrown) {
      return this.failed(key, hosted, classifyEscapedFailure(thrown));
    }
  }

  /**
   * One failure, answered by the domain it came from.
   *
   * A core refusal and a host failure leave the runtime exactly as it was; a
   * fatal retires it under §8's recorded policy. The mapping is the owner's
   * one table, so no caller has to decide what an origin costs.
   * @param {string} key - The hosted node the call was for.
   * @param {RaftRsHostedGroup} hosted - Its group.
   * @param {RaftRsInvocationFailure} failure - What happened, classified.
   * @return {Object} The frozen outcome.
   * @private
   */
  failed(key, hosted, failure) {
    const fatal = failure.origin === RAFT_RS_FAILURE_ORIGIN.WASM_INVOCATION;
    if (fatal) {
      this.healthState = RAFT_RS_RUNTIME_HEALTH.UNHEALTHY_AFTER_TRAP;
      this.trap = Object.freeze({
        key, groupId: hosted.groupId, error: failure.error,
        diagnosis: failure.diagnosis,
      });
    }
    return Object.freeze({
      outcome: RAFT_RS_ORIGIN_OUTCOME[failure.origin],
      origin: failure.origin,
      value: undefined,
      error: failure.error,
      diagnosis: fatal ? failure.diagnosis : null,
    });
  }

  /**
   * Retire the runtime and rebuild it: a fresh instance, and every group back
   * from its own durable Raft record.
   * @return {Object} {restored, health}.
   */
  replaceRuntime() {
    this.runtime = this.instantiate();
    this.guarded = guardedCore(this.runtime);
    const restored = [];
    for (const hosted of this.groupsById.values()) {
      hosted.handle = restoreRaftRsGroup({
        core: this.runtime,
        store: hosted.store,
        groupId: hosted.groupId,
        peerId: hosted.peerId,
      });
      hosted.origin = RAFT_RS_GROUP_ORIGIN.RESTORED_FROM_DURABLE_RECORD;
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
