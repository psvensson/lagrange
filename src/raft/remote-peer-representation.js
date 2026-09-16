/**
 * A remote Raft participant, as this node represents it.
 *
 * Base liferaft models a peer by CLONING the local runtime class: join(address)
 * calls clone(), which copies five protocol options and then calls
 * `new raft.constructor(options)`. The object that comes back is a complete
 * local Raft runtime - its own timers, log, election configuration and state
 * machine - standing in for a participant that lives on another node.
 *
 * Nothing wants it to be that. Measured across a whole production formation,
 * an owner asks its representation for exactly two things: it SENDS through
 * `write`, and it DISPOSES of it with `end` during its own teardown. The base
 * library reads `address` and nothing else. What the cloned runtime did with
 * the rest of its inherited capability was act on its own initiative: when
 * disposal set its state to STOPPED, its inherited state-change handler
 * computed an election timeout and armed a heartbeat - for a participant it
 * does not host, on a clock and a randomness source its owner never gave it.
 *
 * That is not a missing dependency. It is an object holding capabilities that
 * belong to a different semantic role. So the repair is capability reduction
 * at the one creation site, not dependency injection into a full runtime: a
 * representation carries remote identity, the owner's outbound send, and
 * owner-directed disposal, and is structurally incapable of anything else.
 *
 * @module raft/remote-peer-representation
 */

const END_EVENT = 'end';

/**
 * The write a representation gets when its owner supplied no transport: it
 * refuses rather than silently dropping the packet.
 * @param {string} address
 * @return {Function}
 */
function refuseWrite(address) {
  return (packet, callback) =>
    callback(new Error(`no transport for peer ${address}`));
}

/**
 * The listener surface base liferaft uses on a peer, and no more. It arms one
 * `once('end', fn, context)` when it joins the peer and never registers
 * anything else, so this is deliberately not a general event emitter: a
 * representation that could carry arbitrary listeners would be a place for
 * protocol behaviour to reattach itself.
 */
class RemotePeerEndSignal {
  constructor() {
    this.listeners = [];
  }

  once(event, listener, context) {
    if (event !== END_EVENT || typeof listener !== 'function') {
      return this;
    }
    this.listeners.push({listener, context});
    return this;
  }

  emit(event) {
    if (event !== END_EVENT) return false;
    const pending = this.listeners;
    this.listeners = [];
    for (const {listener, context} of pending) {
      listener.call(context);
    }
    return pending.length > 0;
  }
}

/**
 * One remote participant, as this node represents it.
 *
 * It is NOT a Raft runtime and deliberately has no way to become one: no
 * timers, no log, no election configuration, no state machine, and no
 * heartbeat or timeout of its own.
 */
class RemotePeerRepresentation {
  /**
   * @param {Object} options - {address, write}.
   */
  constructor(options = {}) {
    this.address = options.address;
    this.ended = false;
    this.endSignal = new RemotePeerEndSignal();
    // The owner's outbound send IS this peer's write, installed as an OWN
    // property exactly as base liferaft installs it on a cloned peer. That
    // placement is part of the contract, not an implementation detail:
    // callers rebuild a cohort by harvesting `node.write` from the peers they
    // have and handing it back to join(). A wrapper standing in front of the
    // owner's function would be harvested instead of it, and the next
    // representation would be given a wrapper that calls itself.
    //
    // The owner's write still runs with this representation as its subject,
    // so `this.address` is the destination exactly as it was before.
    this.write = typeof options.write === 'function' ?
      options.write :
      refuseWrite(this.address);
  }

  /**
   * Owner-directed disposal. Idempotent, because the owner reaches it twice:
   * once directly, and once through the leave() its own end-signal triggers.
   * @return {boolean} true the first time only.
   */
  end() {
    if (this.ended) return false;
    this.ended = true;
    this.endSignal.emit(END_EVENT);
    return true;
  }

  once(event, listener, context) {
    this.endSignal.once(event, listener, context);
    return this;
  }
}

/**
 * The single creation authority for remote-peer representations.
 * @param {Object} options - {address, write}.
 * @return {RemotePeerRepresentation}
 */
function createRemotePeerRepresentation(options = {}) {
  return new RemotePeerRepresentation(options);
}

export {RemotePeerRepresentation, createRemotePeerRepresentation};
