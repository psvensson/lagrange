// One WASM runtime holding many raft-rs groups: who may enter it, what an
// entry produced, and what happens when one traps.
//
// THE CAPABILITY LIVES HERE AND NOWHERE ELSE. The runtime facade and the
// handles are private fields of this class; nothing it returns carries
// either, and no caller can ask for one. What a caller gets is the outcome of
// a named entry, because two rejections proved that a boundary which hands
// out the core - under any property name, at any depth - is not a boundary.
//
// EVERY entry crosses one gate. `enter` takes the kind of operation it is,
// asks the hosted group's own lifecycle owner whether an operation of that
// kind is allowed, and only then invokes. There is no second check copied
// into a caller and no path that skips this one: a caller that holds this
// host still cannot tick a retired replica.
//
// PROVENANCE, NOT CLASSIFICATION. Host preparation happens before the
// invocation and host persistence, sending and applying happen after it, so
// the only thing inside the invocation is the call. The invocation reports
// which of the two things the BINDING did - returned its refusal, or trapped
// - and refuses to judge anything else: a value that is neither escapes
// unclassified and is host failure at this boundary by elimination. Host
// JavaScript therefore never passes through the core classifier at all.
//
// Binding direction §8: a trap marks the containing runtime unhealthy. This
// host does exactly that and nothing cleverer - it does not retry, it does
// not quarantine the group that trapped and keep the rest running, and it
// does not decide the trap was harmless. A trap is the execution container
// failing; it never retires a logical replica, which is a different state
// with a different owner.

import {
  RAFT_RS_CALL_OUTCOME,
  RAFT_RS_CORE_ENTRY,
  RAFT_RS_CORE_REFUSAL_TYPE,
  RAFT_RS_FAILURE_ORIGIN,
  RAFT_RS_GROUP_ORIGIN,
  RAFT_RS_INVOCATION_RESULT,
  RAFT_RS_ORIGIN_OUTCOME,
  RAFT_RS_PANIC_CHANNEL,
  RAFT_RS_PANIC_JOINER,
  RAFT_RS_RUNTIME_ERROR_MSG,
  RAFT_RS_RUNTIME_HEALTH,
} from './raft-rs-runtime-health-constants.js';
import {createRaftRsGroup, restoreRaftRsGroup} from './raft-rs-group.js';

/**
 * Host preparation: everything the call needs, made plain, OUTSIDE the
 * invocation.
 *
 * An argument the generated glue has to walk is copied here, in host code,
 * so that by the time the invocation runs there is no host object left for
 * it to touch - no getter of ours, no proxy, no lazily built value. A copy
 * that cannot be made fails HERE, where a failure is host preparation, and
 * never inside the boundary that decides what the core did.
 * @param {Array} args - The caller's arguments.
 * @return {Array} The same arguments, made plain.
 */
function preparedArguments(args) {
  return args.map((argument) => {
    if (argument === null || typeof argument !== 'object' ||
      ArrayBuffer.isView(argument)) {
      return argument;
    }
    return globalThis.structuredClone(argument);
  });
}

/**
 * One invocation of one core primitive, reporting what the BINDING did.
 *
 * The two core outcomes are told apart by execution provenance, not by the
 * JavaScript type of a thrown object:
 *
 *   a Rust panic writes its reason to the crate's panic channel before the
 *   abort, which is the binding's own explicit indication of a fatal;
 *   the platform reports an instance that aborted as a WebAssembly trap,
 *   which is the runtime telling us the container died, not a taxonomy of
 *   JavaScript errors;
 *   the binding returns its own refusals through jserr, whose convention a
 *   receipt parses out of the crate's source and proves load-bearing.
 *
 * Anything else that comes out of the call is NOT the core's and is not
 * judged here: it is rethrown, and the boundary above calls it host failure
 * because nothing else could have produced it.
 * @param {Function} primitive - The binding's own function.
 * @param {Array} args - Its prepared arguments.
 * @return {Object} {result, value, error, diagnosis}.
 */
function invokeCore(primitive, args) {
  const captured = [];
  const original = console[RAFT_RS_PANIC_CHANNEL];
  console[RAFT_RS_PANIC_CHANNEL] = (...parts) => {
    captured.push(
      parts.map((part) => String(part)).join(RAFT_RS_PANIC_JOINER.ARGUMENTS));
  };
  try {
    return {
      result: RAFT_RS_INVOCATION_RESULT.CORE_OK,
      value: primitive(...args),
      error: null,
      diagnosis: null,
    };
  } catch (thrown) {
    const diagnosis = captured.join(RAFT_RS_PANIC_JOINER.LINES);
    if (diagnosis.length > 0 ||
      thrown instanceof globalThis.WebAssembly.RuntimeError) {
      return {
        result: RAFT_RS_INVOCATION_RESULT.CORE_FATAL,
        value: undefined,
        error: String(thrown?.message || thrown),
        diagnosis,
      };
    }
    if (typeof thrown === RAFT_RS_CORE_REFUSAL_TYPE) {
      return {
        result: RAFT_RS_INVOCATION_RESULT.CORE_REFUSED,
        value: undefined,
        error: thrown,
        diagnosis: null,
      };
    }
    // Not the core's doing. This boundary does not classify it.
    throw thrown;
  } finally {
    console[RAFT_RS_PANIC_CHANNEL] = original;
  }
}

/**
 * What an invocation reported, carried out of the work so the host code
 * around it cannot be mistaken for it.
 *
 * Not an Error: host code that catches Errors must not be able to swallow
 * it, and the boundary recognises it by identity.
 */
class RaftRsInvocationFailure {
  /**
   * @param {Object} invocation - What invokeCore reported.
   */
  constructor(invocation) {
    this.origin = invocation.result === RAFT_RS_INVOCATION_RESULT.CORE_FATAL ?
      RAFT_RS_FAILURE_ORIGIN.WASM_INVOCATION :
      RAFT_RS_FAILURE_ORIGIN.CORE_REFUSAL;
    this.error = invocation.error;
    this.diagnosis = invocation.diagnosis;
  }
}

/**
 * The same primitives, each one its own prepared, provenance-reporting
 * invocation.
 *
 * The facade is built here and handed only to work running inside `enter`;
 * it is never returned to a caller.
 * @param {Object} core - The raft-rs primitive facade.
 * @return {Object} A frozen facade of guarded primitives.
 */
function guardedCore(core) {
  const guarded = {};
  for (const [name, primitive] of Object.entries(core)) {
    guarded[name] = (...args) => {
      const prepared = preparedArguments(args);
      const invocation = invokeCore(primitive, prepared);
      if (invocation.result === RAFT_RS_INVOCATION_RESULT.CORE_OK) {
        return invocation.value;
      }
      throw new RaftRsInvocationFailure(invocation);
    };
  }
  return Object.freeze(guarded);
}

/**
 * What a failure that escaped the work means.
 * @param {*} thrown - What the work threw.
 * @return {RaftRsInvocationFailure} Its classification.
 */
function classifyEscapedFailure(thrown) {
  if (thrown instanceof RaftRsInvocationFailure) {
    return thrown;
  }
  // Nothing reported it as the core's, so it was not the core's: host
  // JavaScript, and it says nothing about the runtime.
  return {
    origin: RAFT_RS_FAILURE_ORIGIN.HOST,
    error: String(thrown?.message || thrown),
    diagnosis: null,
  };
}

/**
 * One group this runtime holds: what it is, what it may do, and what it can
 * be rebuilt from.
 */
class RaftRsHostedGroup {
  /**
   * @param {Object} parts - The group's parts.
   * @param {string} parts.key - What this host calls this hosted node.
   * @param {string} parts.groupId - The group whose durable record this is.
   * @param {string} parts.peerId - This peer's raft id, a decimal string.
   * @param {Object} parts.store - The group's durable Raft record.
   * @param {Object} parts.lifecycle - Whether this local replica may take
   *   part at all. The gate asks this and nothing else.
   * @param {number} parts.handle - Its handle in the current runtime.
   * @param {string} [parts.origin] - How it came to be here, by name.
   */
  constructor({
    key, groupId, peerId, store, lifecycle, handle,
    origin = RAFT_RS_GROUP_ORIGIN.ADOPTED,
  }) {
    this.key = key;
    this.groupId = groupId;
    this.peerId = peerId;
    this.store = store;
    this.lifecycle = lifecycle;
    this.handle = handle;
    this.origin = origin;
    this.activeEntries = 0;
  }
}

/**
 * A Multi-Raft host: one runtime, many groups, one health state, one gate.
 */
class RaftRsRuntimeHost {
  #runtime;
  #guarded;
  #groupsByKey;
  #healthState;
  #trap;
  #instantiate;

  /**
   * @param {Object} options - The host's inputs.
   * @param {Function} options.instantiate - Builds a fresh runtime.
   */
  constructor({instantiate}) {
    this.#instantiate = instantiate;
    this.#runtime = instantiate();
    this.#guarded = guardedCore(this.#runtime);
    this.#groupsByKey = new Map();
    this.#healthState = RAFT_RS_RUNTIME_HEALTH.HEALTHY;
    this.#trap = null;
  }

  /** @return {string} The runtime's health, by name. */
  get health() {
    return this.#healthState;
  }

  /** @return {Object|null} What the last trap was, or null. */
  get lastTrap() {
    return this.#trap;
  }

  /** @return {Array<string>} Every hosted node, by this host's own key. */
  groups() {
    return [...this.#groupsByKey.keys()];
  }

  /**
   * How many ACTIVE entries one hosted group has made into the core.
   *
   * The instrument the retirement falsifier reads: an operation that took
   * part in the group moves it, a read or a teardown does not, so "the core
   * was never entered" is a number rather than an inference.
   * @param {string} key - What this host calls it.
   * @return {number} The count.
   */
  activeCoreEntries(key) {
    return this.#hostedGroup(key).activeEntries;
  }

  /**
   * @param {string} key - What this host calls it.
   * @return {RaftRsHostedGroup} The hosted group.
   */
  #hostedGroup(key) {
    const hosted = this.#groupsByKey.get(key);
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
   * @return {string} The key this host holds it under.
   */
  openGroup({
    key, groupId, peerId, store, lifecycle, voters, learners, tuning}) {
    const resumed = store.hasDurableRecord(groupId);
    const handle = resumed ?
      restoreRaftRsGroup({
        core: this.#runtime, store, groupId, peerId, tuning}) :
      createRaftRsGroup({
        core: this.#runtime, store, groupId, peerId, voters, learners, tuning,
      });
    const held = key ?? groupId;
    this.#groupsByKey.set(held, new RaftRsHostedGroup({
      key: held,
      groupId,
      peerId,
      store,
      lifecycle,
      handle,
      origin: resumed ?
        RAFT_RS_GROUP_ORIGIN.RESTORED_FROM_DURABLE_RECORD :
        RAFT_RS_GROUP_ORIGIN.CREATED_FRESH,
    }));
    return held;
  }

  /**
   * How a hosted group came to be in this runtime, by name.
   * @param {string} key - What this host calls it.
   * @return {string} A RAFT_RS_GROUP_ORIGIN value.
   */
  originOf(key) {
    return this.#hostedGroup(key).origin;
  }

  /**
   * Hold a node that already exists in this runtime, so a replacement can
   * restore it.
   * @param {Object} options - The node's parts.
   * @return {string} The key this host holds it under.
   */
  adoptGroup({key, groupId, peerId, store, lifecycle, handle}) {
    const held = key ?? groupId;
    this.#groupsByKey.set(held, new RaftRsHostedGroup({
      key: held, groupId, peerId, store, lifecycle, handle}));
    return held;
  }

  /**
   * THE GATE, and the only way into the core.
   *
   * One predicate, owning exactly two things: whether this local replica is
   * durably retired, and whether this runtime is fit to be entered. It owns
   * no membership decision, no readiness, no node health and no sender
   * question - a retired replica is refused whoever is talking to it, and a
   * live one is admitted whoever the sender is.
   * @param {RaftRsHostedGroup} hosted - The group being entered.
   * @param {string} entryKind - A RAFT_RS_CORE_ENTRY value.
   * @return {Object|null} The refusal, or null when the entry may proceed.
   */
  #assertCoreEntryAllowed(hosted, entryKind) {
    if (this.#healthState !== RAFT_RS_RUNTIME_HEALTH.HEALTHY) {
      return Object.freeze({
        outcome: RAFT_RS_CALL_OUTCOME.RUNTIME_UNHEALTHY,
        origin: null,
        value: undefined,
        error: RAFT_RS_RUNTIME_ERROR_MSG.stillUnhealthy(),
        diagnosis: this.#trap === null ? null : this.#trap.diagnosis,
      });
    }
    if (entryKind !== RAFT_RS_CORE_ENTRY.ACTIVE) {
      // Reading this replica's own state and releasing its handle are not
      // taking part in the group: a retired replica may still be inspected,
      // and refusing to free it would leak what retirement tells the host to
      // release.
      return null;
    }
    const admission = hosted.lifecycle.admit();
    if (admission.admitted) {
      return null;
    }
    return Object.freeze({
      outcome: admission.outcome,
      origin: null,
      value: undefined,
      error: admission.detail,
      diagnosis: null,
    });
  }

  /**
   * Enter the core for one hosted group, for one named kind of operation.
   *
   * The work receives the guarded facade and this group's handle; both are
   * arguments of a call this host makes, never values it returns, so neither
   * survives the entry. Host code inside the work - persistence, sending,
   * applying - produces host failure by construction, because the only thing
   * that can report a core outcome is an invocation.
   * @param {string} key - The hosted node to enter.
   * @param {string} entryKind - A RAFT_RS_CORE_ENTRY value.
   * @param {Function} work - Called with (guarded core, handle).
   * @return {Object} {outcome, origin, value, error, diagnosis}.
   */
  enter(key, entryKind, work) {
    const hosted = this.#hostedGroup(key);
    const refused = this.#assertCoreEntryAllowed(hosted, entryKind);
    if (refused !== null) {
      return refused;
    }
    if (entryKind === RAFT_RS_CORE_ENTRY.ACTIVE) {
      hosted.activeEntries += 1;
    }
    try {
      return Object.freeze({
        outcome: RAFT_RS_CALL_OUTCOME.COMPLETED,
        origin: null,
        value: work(this.#guarded, hosted.handle),
        error: null,
        diagnosis: null,
      });
    } catch (thrown) {
      return this.#failed(key, hosted, classifyEscapedFailure(thrown));
    }
  }

  /**
   * One failure, answered by the domain it came from.
   *
   * A core refusal and a host failure leave the runtime exactly as it was; a
   * fatal retires the RUNTIME under §8's recorded policy and nothing else -
   * the logical replica's lifecycle is a different state with a different
   * owner, and a trap never touches it.
   * @param {string} key - The hosted node the call was for.
   * @param {RaftRsHostedGroup} hosted - Its group.
   * @param {Object} failure - What happened, by origin.
   * @return {Object} The frozen outcome.
   */
  #failed(key, hosted, failure) {
    const fatal = failure.origin === RAFT_RS_FAILURE_ORIGIN.WASM_INVOCATION;
    if (fatal) {
      this.#healthState = RAFT_RS_RUNTIME_HEALTH.UNHEALTHY_AFTER_TRAP;
      this.#trap = Object.freeze({
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
   *
   * The execution container is replaced. No logical replica is retired by
   * this, and none is given a new identity: each group comes back as the
   * same replica of the same group, from its own record.
   * @return {Object} {restored, health}.
   */
  replaceRuntime() {
    this.#runtime = this.#instantiate();
    this.#guarded = guardedCore(this.#runtime);
    const restored = [];
    for (const hosted of this.#groupsByKey.values()) {
      hosted.handle = restoreRaftRsGroup({
        core: this.#runtime,
        store: hosted.store,
        groupId: hosted.groupId,
        peerId: hosted.peerId,
      });
      hosted.origin = RAFT_RS_GROUP_ORIGIN.RESTORED_FROM_DURABLE_RECORD;
      restored.push(hosted.key);
    }
    this.#healthState = RAFT_RS_RUNTIME_HEALTH.HEALTHY;
    this.#trap = null;
    return Object.freeze({restored: Object.freeze(restored),
      health: this.#healthState});
  }
}

export {
  RAFT_RS_CALL_OUTCOME,
  RAFT_RS_CORE_ENTRY,
  RAFT_RS_RUNTIME_HEALTH,
  RaftRsRuntimeHost,
};
