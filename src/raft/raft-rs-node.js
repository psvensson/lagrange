// The LifeRaft-shaped node object the provider seam asks a backend for.
//
// `createNodeClass` is the seam's real integration surface: production holds
// what it returns in `this.raft` and asks the census's 20 methods, 33
// properties and 27 events of it. Phase 1 deferred it rather than shim it;
// this is the minimum of it a fresh cluster needs, built so that every census
// member is answered from the core or refused by name (see
// raft-rs-node-constants.js for the partition and the reason per member).
//
// What runs behind it is production, not a driver: an inbound packet emitted
// into the node goes through the envelope boundary of raft-rs-ingress.js and
// then through the trap boundary of raft-rs-runtime-health.js, so a raft-rs
// fatal marks the containing runtime unhealthy here and not only in a test.

import {dispatchRaftRsMessage} from './raft-rs-ingress.js';
import {drainReady} from './raft-rs-ready-loop.js';
import {
  RAFT_RS_CALL_OUTCOME,
} from './raft-rs-runtime-health-constants.js';
import {
  RAFT_RS_CORE_ROLE_STATE,
  RAFT_RS_NODE_ERROR_MSG,
  RAFT_RS_NODE_EVENT,
  RAFT_RS_NODE_EVENT_VALUES,
  RAFT_RS_NODE_MEMBER_CLASS,
  RAFT_RS_NODE_PEER_ENTRY_REASON,
  RAFT_RS_NODE_REQUIRED_CONTEXT,
  RAFT_RS_NODE_STATE,
  RAFT_RS_NODE_SURFACE,
  RAFT_RS_NODE_WRITE_REFUSAL,
} from './raft-rs-node-constants.js';

const KEY_SEPARATOR = '/';
const NO_LEADER = '0';
const PEER_PROJECTION_FIELDS = Object.freeze([
  'address', 'raftPeerId', 'learner']);

/**
 * Every census member this node does not serve, with the reason it does not.
 * A name appearing as both a method and a property is one member.
 * @return {Map<string, string>} Name to reason.
 */
function unservedMembers() {
  const unserved = new Map();
  for (const bucket of [RAFT_RS_NODE_SURFACE.methods,
    RAFT_RS_NODE_SURFACE.properties]) {
    for (const [name, entry] of Object.entries(bucket)) {
      if (entry.memberClass !== RAFT_RS_NODE_MEMBER_CLASS.SERVED) {
        unserved.set(name, entry.reason);
      }
    }
  }
  return unserved;
}

/**
 * One member of the committed configuration, as the host may read it.
 *
 * A liferaft `nodes` entry is a whole node clone. This is not one, and it
 * refuses to pretend: a read of any other field throws instead of answering
 * undefined, so a caller expecting liferaft's object finds out.
 * @param {Object} fields - The projected fields.
 * @return {Object} The projection.
 */
function peerProjection(fields) {
  return new Proxy(Object.freeze({...fields}), {
    get(target, property, receiver) {
      if (typeof property !== 'string' ||
        PEER_PROJECTION_FIELDS.includes(property)) {
        return Reflect.get(target, property, receiver);
      }
      throw new Error(RAFT_RS_NODE_ERROR_MSG.notServed(
        `${RAFT_RS_NODE_WRITE_REFUSAL.PEER_ENTRY.member}.${property}`,
        RAFT_RS_NODE_PEER_ENTRY_REASON));
    },
    set() {
      throw new Error(RAFT_RS_NODE_ERROR_MSG.refusedWrite(
        RAFT_RS_NODE_WRITE_REFUSAL.PEER_ENTRY.member,
        RAFT_RS_NODE_WRITE_REFUSAL.PEER_ENTRY.reason));
    },
  });
}

/**
 * Refuse every census member this backend does not serve, by name, on the
 * instance - present, so a caller never reads `undefined` and takes a quiet
 * path, and throwing, so it never believes an imitation.
 * @param {Object} node - The node.
 */
function installRefusals(node) {
  for (const [name, reason] of unservedMembers()) {
    Object.defineProperty(node, name, {
      configurable: false,
      enumerable: false,
      get() {
        throw new Error(RAFT_RS_NODE_ERROR_MSG.notServed(name, reason));
      },
      set() {
        throw new Error(RAFT_RS_NODE_ERROR_MSG.notServed(name, reason));
      },
    });
  }
}

/**
 * The context the seam hands `createNodeClass` does not carry what a raft-rs
 * node needs. Whatever is missing is named, never defaulted.
 * @param {Object} context - The seam context, extended by the caller.
 */
function assertContext(context) {
  for (const field of RAFT_RS_NODE_REQUIRED_CONTEXT) {
    if (context?.[field] === undefined || context?.[field] === null) {
      throw new Error(RAFT_RS_NODE_ERROR_MSG.missingContext(field));
    }
  }
}

/**
 * Build the node class for one replica of one group.
 *
 * @param {Object} context - The seam's context, extended with what a raft-rs
 *   node needs: runtimeHost, store, groupId, peerId, voters,
 *   resolvePeerAddress, deliverPacket, scheduleTick.
 * @return {Function} The node class production instantiates.
 */
function createRaftRsNodeClass(context) {
  assertContext(context);

  /**
   * One raft-rs group, presented at the seam's node shape.
   */
  class RaftRsNode {
    /**
     * @param {string} address - This replica's unified address.
     * @param {Object} [options] - The seam's node options.
     */
    constructor(address, options = {}) {
      this.address = address;
      this.options = options;
      this.host = context.runtimeHost;
      this.store = context.store;
      this.groupId = context.groupId;
      this.peerId = context.peerId;
      this.key = `${context.groupId}${KEY_SEPARATOR}${context.peerId}`;
      this.subscribers = new Map();
      this.interval = null;
      this.stopped = false;
      this.host.openGroup({
        key: this.key,
        groupId: context.groupId,
        peerId: context.peerId,
        store: context.store,
        voters: context.voters,
        learners: context.learners,
        tuning: context.tuning,
      });
      this.lastObserved = this.observe();
      installRefusals(this);
    }

    /**
     * The parts the provider seam's group-taking methods need. The handle
     * comes from the runtime that holds this group NOW, so a runtime
     * replacement does not leave a stale one behind.
     * @return {Object} {core, handle, store, groupId}.
     */
    raftRsGroupParts() {
      return {
        core: this.host.core,
        handle: this.host.handleOf(this.key),
        store: this.store,
        groupId: this.groupId,
      };
    }

    /**
     * Every active call passes through here FIRST.
     *
     * Active means anything that would take part in the group: a tick, a
     * step, a proposal. The lifecycle owner is asked before the work runs,
     * so a retired replica's refusal cannot depend on what the core would
     * have said - the core is not reached at all (addendum §6). Reads are
     * not active calls: a retired replica may still be inspected.
     * @param {Function} work - What to do if this replica may.
     * @return {Object} The work's outcome, or the typed refusal.
     * @private
     */
    ifAdmitted(work) {
      const admission = context.lifecycle.admit();
      if (!admission.admitted) {
        return Object.freeze({
          admitted: false,
          outcome: admission.outcome,
          detail: admission.detail,
          origin: null,
          diagnosis: null,
          trapped: false,
          runtimeUnhealthy: false,
        });
      }
      return work();
    }

    /**
     * Propose one command into the core, inside the trap boundary, and drain
     * what it made ready.
     * @param {*} command - The command's bytes.
     * @return {Object} The named dispatch outcome.
     */
    proposeCommand(command) {
      return this.ifAdmitted(() => {
        const ran = this.host.run(this.key, (core, handle) =>
          core.propose(handle, command));
        if (ran.outcome !== RAFT_RS_CALL_OUTCOME.COMPLETED) {
          return this.outcomeOf(ran, null);
        }
        return this.drain();
      });
    }

    /** @return {string} The runtime's health, by name. */
    get runtimeHealth() {
      return this.host.health;
    }

    /**
     * What the core says about this peer right now.
     * @return {Object} The core's own status.
     * @private
     */
    coreStatus() {
      const ran = this.host.run(this.key, (core, handle) =>
        core.status(handle));
      if (ran.outcome !== RAFT_RS_CALL_OUTCOME.COMPLETED) {
        throw new Error(ran.error);
      }
      return ran.value;
    }

    /**
     * The transition-visible part of the core's state.
     * @return {Object} {state, term, lead}.
     * @private
     */
    observe() {
      const status = this.coreStatus();
      return {
        state: this.stateOf(status.raftState),
        term: status.term,
        lead: status.lead,
      };
    }

    /**
     * @param {number} role - The core's raft_state.
     * @return {*} The seam state for it.
     * @private
     */
    stateOf(role) {
      const state = RAFT_RS_CORE_ROLE_STATE[role];
      if (state === undefined) {
        throw new Error(RAFT_RS_NODE_ERROR_MSG.unknownRole(role));
      }
      return state;
    }

    /** @return {*} The role, in the enum the seam compares against. */
    get state() {
      return this.stopped ?
        RAFT_RS_NODE_STATE.STOPPED :
        this.stateOf(this.coreStatus().raftState);
    }

    /** @return {string} The term the core holds, as a decimal string. */
    get term() {
      return this.coreStatus().term;
    }

    /** @param {*} _value - Refused: the term is the core's. */
    set term(_value) {
      throw new Error(RAFT_RS_NODE_ERROR_MSG.refusedWrite(
        RAFT_RS_NODE_WRITE_REFUSAL.TERM.member,
        RAFT_RS_NODE_WRITE_REFUSAL.TERM.reason));
    }

    /** @return {string|null} The leader's address, or null when there is none. */
    get leader() {
      const lead = this.coreStatus().lead;
      return lead === NO_LEADER ? null : context.resolvePeerAddress(lead);
    }

    /** @param {*} _value - Refused: leadership is the core's. */
    set leader(_value) {
      throw new Error(RAFT_RS_NODE_ERROR_MSG.refusedWrite(
        RAFT_RS_NODE_WRITE_REFUSAL.LEADER.member,
        RAFT_RS_NODE_WRITE_REFUSAL.LEADER.reason));
    }

    /** @return {Array<Object>} The committed configuration, minus this peer. */
    get nodes() {
      const ran = this.host.run(this.key, (core, handle) =>
        core.conf_state(handle));
      if (ran.outcome !== RAFT_RS_CALL_OUTCOME.COMPLETED) {
        throw new Error(ran.error);
      }
      const confState = ran.value;
      const members = [
        ...confState.voters.map((id) => [id, false]),
        ...confState.learners.map((id) => [id, true]),
      ];
      return Object.freeze(members
        .filter(([id]) => id !== this.peerId)
        .map(([id, learner]) => peerProjection({
          address: context.resolvePeerAddress(id),
          raftPeerId: id,
          learner,
        })));
    }

    /** @return {number|null} The tick interval the host set. */
    get tickIntervalMs() {
      return this.interval;
    }

    /**
     * Set how often the host ticks the core.
     * @param {number} intervalMs - The interval.
     */
    setTickInterval(intervalMs) {
      this.interval = intervalMs;
      context.scheduleTick(intervalMs, () => this.tickOnce());
    }

    /**
     * The configured form of the same owner.
     * @param {Object} [configuration] - {tickIntervalMs}.
     */
    configureTickInterval(configuration = {}) {
      this.setTickInterval(configuration.tickIntervalMs);
    }

    /**
     * One tick into the core, then whatever it made ready.
     * @return {Object} The dispatch outcome.
     */
    tickOnce() {
      return this.ifAdmitted(() => {
        const ran = this.host.run(this.key,
          (core, handle) => core.tick(handle));
        if (ran.outcome !== RAFT_RS_CALL_OUTCOME.COMPLETED) {
          return this.outcomeOf(ran, null);
        }
        return this.drain();
      });
    }

    /**
     * Subscribe to an event this node can actually emit.
     * @param {string} event - The event.
     * @param {Function} listener - The listener.
     * @return {RaftRsNode} This node.
     */
    on(event, listener) {
      if (!RAFT_RS_NODE_EVENT_VALUES.includes(event)) {
        throw new Error(RAFT_RS_NODE_ERROR_MSG.unknownEvent(
          event, RAFT_RS_NODE_EVENT_VALUES));
      }
      if (!this.subscribers.has(event)) {
        this.subscribers.set(event, []);
      }
      this.subscribers.get(event).push(listener);
      return this;
    }

    /**
     * @param {string} event - The event.
     * @return {Array<Function>} Its listeners.
     */
    listeners(event) {
      return (this.subscribers.get(event) || []).slice();
    }

    /**
     * @param {string} event - The event.
     * @param {Function} listener - The listener to drop.
     * @return {RaftRsNode} This node.
     */
    removeListener(event, listener) {
      const registered = this.subscribers.get(event);
      if (registered) {
        this.subscribers.set(event,
          registered.filter((candidate) => candidate !== listener));
      }
      return this;
    }

    /**
     * Emit into the node.
     *
     * The data event is the host's inbound path, so emitting it is this
     * backend's ingress: the envelope boundary, then the core, then the Ready
     * loop. Every other served event is a notification to listeners.
     * @param {string} event - The event.
     * @param {...*} args - Its arguments.
     * @return {*} The dispatch outcome for data; otherwise this node.
     */
    emit(event, ...args) {
      if (event === RAFT_RS_NODE_EVENT.DATA) {
        return this.ingest(args[0]);
      }
      if (!RAFT_RS_NODE_EVENT_VALUES.includes(event)) {
        throw new Error(RAFT_RS_NODE_ERROR_MSG.unknownEvent(
          event, RAFT_RS_NODE_EVENT_VALUES));
      }
      this.notify(event, args);
      return this;
    }

    /**
     * @param {string} event - The event.
     * @param {Array} args - Its arguments.
     * @private
     */
    notify(event, args) {
      for (const listener of this.listeners(event)) {
        listener(...args);
      }
    }

    /**
     * One transport envelope: admitted by the envelope boundary, stepped into
     * the core inside the trap boundary, then drained.
     * @param {Object} envelope - {groupId, to, message}.
     * @return {Object} The named dispatch outcome.
     * @private
     */
    ingest(envelope) {
      // Before the envelope boundary and therefore before `step`: a retired
      // replica's admissibility is a property of THIS replica's lifecycle,
      // never of who sent the envelope, so nothing about the sender is
      // looked at here.
      return this.ifAdmitted(() => {
        const ran = this.host.run(this.key, (core, handle) =>
          dispatchRaftRsMessage({
            core,
            handle,
            envelope,
            localGroupId: this.groupId,
            localPeerId: this.peerId,
          }));
        if (ran.outcome !== RAFT_RS_CALL_OUTCOME.COMPLETED) {
          return this.outcomeOf(ran, null);
        }
        if (!ran.value.admitted) {
          return this.outcomeOf(ran, ran.value);
        }
        const drained = this.drain();
        return drained.trapped ? drained : this.outcomeOf(ran, ran.value);
      });
    }

    /**
     * Run the core's Ready cycles and turn what they did into events.
     * @return {Object} The named dispatch outcome.
     * @private
     */
    drain() {
      const committed = [];
      const ran = this.host.run(this.key, (core, handle) => drainReady({
        core,
        handle,
        store: this.store,
        groupId: this.groupId,
        send: (messages) => this.send(messages),
        applyEntry: (entry) => committed.push(entry),
      }));
      if (ran.outcome !== RAFT_RS_CALL_OUTCOME.COMPLETED) {
        return this.outcomeOf(ran, null);
      }
      this.announce(committed);
      return this.outcomeOf(ran, null);
    }

    /**
     * Emit what changed, reading every value off the core.
     * @param {Array<Object>} committed - The entries applied this drain.
     * @private
     */
    announce(committed) {
      const now = this.observe();
      const before = this.lastObserved;
      this.lastObserved = now;
      if (now.state !== before.state) {
        this.notify(now.state === RAFT_RS_NODE_STATE.LEADER ?
          RAFT_RS_NODE_EVENT.LEADER :
          now.state === RAFT_RS_NODE_STATE.CANDIDATE ?
            RAFT_RS_NODE_EVENT.CANDIDATE :
            RAFT_RS_NODE_EVENT.FOLLOWER, []);
      }
      if (now.term !== before.term) {
        this.notify(RAFT_RS_NODE_EVENT.TERM_CHANGE, [now.term]);
      }
      if (now.lead !== before.lead) {
        this.notify(RAFT_RS_NODE_EVENT.LEADER_CHANGE, [now.lead]);
      }
      for (const entry of committed) {
        this.notify(RAFT_RS_NODE_EVENT.COMMIT, [entry.data]);
      }
    }

    /**
     * Hand every Ready message to the transport, addressed by the address the
     * host resolves for the peer id the core chose.
     * @param {Array<Object>} messages - Messages from the core.
     * @private
     */
    send(messages) {
      for (const message of messages) {
        context.deliverPacket(context.resolvePeerAddress(message.to), {
          groupId: this.groupId,
          to: message.to,
          message,
        });
      }
    }

    /**
     * One named outcome for every dispatch, so a caller never reads success
     * out of an absent error.
     * @param {Object} ran - What the trap boundary returned.
     * @param {Object|null} admission - The envelope boundary's answer.
     * @return {Object} The frozen outcome.
     * @private
     */
    outcomeOf(ran, admission) {
      const trapped = ran.outcome === RAFT_RS_CALL_OUTCOME.TRAPPED;
      const unhealthy = ran.outcome === RAFT_RS_CALL_OUTCOME.RUNTIME_UNHEALTHY;
      return Object.freeze({
        admitted: admission === null ?
          ran.outcome === RAFT_RS_CALL_OUTCOME.COMPLETED :
          admission.admitted,
        outcome: admission === null ? ran.outcome : admission.outcome,
        detail: admission === null ? ran.error : admission.detail,
        // Which domain the failure came from, carried out unchanged: a caller
        // of this node decides what to do about a failure by its origin, and
        // must not have to infer one from the outcome's name.
        origin: ran.origin ?? null,
        diagnosis: ran.diagnosis ?? null,
        trapped,
        runtimeUnhealthy: unhealthy,
      });
    }

    /** Stop this node: the handle goes, the durable record stays. */
    end() {
      if (this.stopped) {
        return;
      }
      this.stopped = true;
      this.host.run(this.key, (core, handle) => core.free(handle));
    }
  }

  return RaftRsNode;
}

export {createRaftRsNodeClass};
