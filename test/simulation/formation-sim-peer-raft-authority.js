// What a peer Raft object is allowed to be.
//
// Production creates owner Raft instances through its own construction
// authority. Base liferaft creates a SECOND population of instances of the
// same subclass, outside that authority: join(address) calls clone(), and
// clone copies exactly five liferaft options - Log, election max, election
// min, heartbeat, threshold - before calling new raft.constructor(...). A
// peer therefore inherits every capability of a local runtime while receiving
// none of the host dependencies the production owner installs.
//
// This module measures which behaviours each population actually executes, by
// CONSTRUCTION PROVENANCE rather than by address or count: an instance that
// came out of clone() is a peer, and everything else came through the
// production construction authority. Provenance matters because the two
// populations do not have the same cardinality - each peer address is
// represented once per sibling replica - so any acceptance rule that inferred
// the population from an event count would be measuring the wrong thing.
//
// The contract it checks: a peer is a REPRESENTATION of a remote participant.
// Its legitimate surface is its address and its write. Election timing,
// heartbeat scheduling and the local timer substrate are LOCAL RUNTIME
// AUTHORITY, and a representation should not possess them.
import BaseLifeRaft from '@markwylde/liferaft';

import LifeRaft from '../../src/raft/liferaft.js';
import {
  RemotePeerRepresentation,
} from '../../src/raft/remote-peer-representation.js';

// What an OWNER asks of its representation. The base library uses a peer for
// its address and its write, and disposes of it with end() during its own
// teardown. All three are requests made BY the owner, so all three are the
// owner's authority being exercised through the representation.
const OWNER_INVOKED_SURFACE = Object.freeze(['write', 'end']);

// What a representation must never do ON ITS OWN INITIATIVE. Nothing asks a
// peer for an election timeout or a heartbeat; its inherited state machine
// computes them for itself. That is LOCAL RUNTIME AUTHORITY, and a
// representation of a REMOTE participant has no standing to exercise it.
const SELF_INITIATED_RUNTIME_AUTHORITY = Object.freeze([
  'timeout', 'heartbeat', 'promote', 'join', 'leave',
]);

/**
 * Instrument both populations for the duration of one scenario.
 *
 * @return {Object} {census, restore} - census() reports what each population
 *   did; restore() puts every patched prototype back.
 */
function observePeerRaftAuthority() {
  const representations = new WeakSet();
  const peerObjects = {created: 0, addresses: new Set()};
  const ownerAddresses = new Set();
  const calls = new Map();
  const restorers = [];
  // Any object that reached a peer slot while still being a Raft runtime.
  // Zero is the structural half of the contract; it is measured, not assumed,
  // because a representation that stopped being observable would otherwise
  // look identical to one that stopped misbehaving.
  const runtimesInPeerSlots = new Set();

  const bump = (population, name) => {
    const key = `${population}.${name}`;
    calls.set(key, (calls.get(key) || 0) + 1);
  };

  // Provenance through the production creation authority.
  const realCreate = RemotePeerRepresentation.prototype.constructor;
  const realWrite = RemotePeerRepresentation.prototype.write;
  const realEnd = RemotePeerRepresentation.prototype.end;
  void realCreate;
  RemotePeerRepresentation.prototype.write = function(...args) {
    bump('peer', 'write');
    return realWrite.apply(this, args);
  };
  RemotePeerRepresentation.prototype.end = function(...args) {
    bump('peer', 'end');
    return realEnd.apply(this, args);
  };
  restorers.push(() => {
    RemotePeerRepresentation.prototype.write = realWrite;
    RemotePeerRepresentation.prototype.end = realEnd;
  });

  // Every peer slot is filled through clone(), whoever owns that path.
  const realClone = LifeRaft.prototype.clone;
  LifeRaft.prototype.clone = function(options) {
    const node = realClone.call(this, options);
    representations.add(node);
    peerObjects.created += 1;
    peerObjects.addresses.add(node.address);
    if (node instanceof BaseLifeRaft) runtimesInPeerSlots.add(node.address);
    return node;
  };
  restorers.push(() => {
    LifeRaft.prototype.clone = realClone;
  });

  // Behaviour on the runtime class: anything a representation still manages
  // to execute there is authority it should not possess.
  const proto = BaseLifeRaft.prototype;
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === 'constructor' || typeof proto[name] !== 'function') continue;
    const real = proto[name];
    Object.defineProperty(proto, name, {
      configurable: true, writable: true,
      value: function(...args) {
        const population = representations.has(this) ? 'peer' : 'owner';
        if (population === 'owner') ownerAddresses.add(this.address);
        bump(population, name);
        return real.apply(this, args);
      },
    });
    restorers.push(() => {
      Object.defineProperty(proto, name, {
        configurable: true, writable: true, value: real,
      });
    });
  }

  return {
    census: () => buildCensus({
      calls, peerObjects, ownerAddresses, runtimesInPeerSlots,
    }),
    restore: () => {
      for (const restore of restorers.reverse()) restore();
    },
  };
}

function buildCensus({calls, peerObjects, ownerAddresses, runtimesInPeerSlots}) {
  const behaviours = (population) => Object.fromEntries(
    [...calls.entries()]
      .filter(([key]) => key.startsWith(`${population}.`))
      .map(([key, count]) => [key.slice(population.length + 1), count])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const peerBehaviours = behaviours('peer');
  const breaches = Object.entries(peerBehaviours)
    .filter(([name]) => SELF_INITIATED_RUNTIME_AUTHORITY.includes(name))
    .map(([name, count]) => ({name, count}));
  const ownerInvoked = Object.entries(peerBehaviours)
    .filter(([name]) => OWNER_INVOKED_SURFACE.includes(name))
    .map(([name, count]) => ({name, count}));
  return {
    ownerAddressCount: ownerAddresses.size,
    peerObjectCount: peerObjects.created,
    peerAddressCount: peerObjects.addresses.size,
    peerBehaviours,
    ownerBehaviours: behaviours('owner'),
    // What the owner asked of its representation. Not a breach.
    ownerInvoked,
    // The surface a representation is entitled to.
    representationSurface: [...OWNER_INVOKED_SURFACE],
    // Every self-initiated local-runtime behaviour. Zero is the contract.
    authorityBreaches: breaches,
    // A peer slot still holding a Raft runtime is a structural breach even if
    // it never misbehaves, so it counts.
    runtimesInPeerSlots: [...runtimesInPeerSlots],
    authorityBreachCount: breaches.reduce((total, b) => total + b.count, 0) +
      runtimesInPeerSlots.size,
  };
}

export {observePeerRaftAuthority};
