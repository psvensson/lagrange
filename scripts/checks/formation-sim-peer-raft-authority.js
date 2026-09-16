#!/usr/bin/env node
/**
 * Peer Raft runtime authority probe
 * (`formation-sim-peer-raft-authority` quest, epic
 * formation-seed-decoupling).
 *
 *   node scripts/checks/formation-sim-peer-raft-authority.js [--explain]
 *
 * Prints the number of LOCAL RUNTIME BEHAVIOURS a peer Raft object exercised
 * during the production-composed seed chain (the quest probe; target 0).
 *
 * Production creates owner Raft instances through its own construction
 * authority. Base liferaft creates a second population of instances of the
 * same subclass outside that authority, through join(address) -> clone(),
 * and clone propagates neither the injected time source nor the injected
 * randomness. A peer is a REPRESENTATION of a remote participant: its
 * legitimate surface is its address and its write. Election timing and
 * heartbeat scheduling are local runtime authority, and a representation
 * should not possess them.
 *
 * The probe measures by CONSTRUCTION PROVENANCE, never by address or by event
 * count: the two populations have different cardinality - each peer address
 * is represented once per sibling replica - so a rule that inferred the
 * population from a count would measure the wrong thing.
 */
import {runPeerRaftAuthorityProbe} from './peer-raft-authority-probe.js';

runPeerRaftAuthorityProbe();
