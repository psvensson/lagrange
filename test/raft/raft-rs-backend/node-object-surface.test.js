// The LifeRaft-shaped node object the provider seam asks a backend for.
//
// Phase 1 deferred `createNodeClass` and recorded why: the seam's real
// integration surface is not the provider's ten methods but the node object
// production holds in `this.raft`, which the census finds to be 20 methods,
// 33 properties and 27 events. This file measures three things:
//
//   1. that the raft-rs node's own partition of that census - served,
//      deferred, never - covers it exactly and disjointly, so a census member
//      the backend answers neither way cannot exist;
//   2. that a fresh cluster actually runs on it: a message from a transport
//      goes envelope-check -> dispatch -> core, a leader emerges, a proposal
//      commits, and every value checked is one the core reported;
//   3. what the seam cannot carry, derived from `src` rather than asserted -
//      the modules that build or read a node WITHOUT the provider.
//
// Nothing here is compared against a literal this file owns. The census comes
// from parsing `src`; the liferaft state values come from LifeRaft itself;
// the cluster's expectations come from the core's own status and conf_state.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import LifeRaft from '../../../src/raft/liferaft.js';
import {
  RAFT_BACKEND,
  RAFT_BACKEND_OPTION,
} from '../../../src/raft/raft-backend-constants.js';
import {createRaftProvider} from '../../../src/raft/raft-backend-selection.js';
import {
  RAFT_RS_INGRESS_REFUSAL,
} from '../../../src/raft/raft-rs-ingress.js';
import {
  RAFT_RS_NODE_EVENT,
  RAFT_RS_NODE_MEMBER_CLASS,
  RAFT_RS_NODE_STATE,
  RAFT_RS_NODE_SURFACE,
} from '../../../src/raft/raft-rs-node-constants.js';
import {
  RAFT_RS_RUNTIME_HEALTH,
} from '../../../src/raft/raft-rs-runtime-health.js';
import {
  censusNames,
  deriveProductionRaftCallCensus,
} from './production-raft-call-census.js';
import {
  NodeBackedCluster,
  seamBypassSites,
} from './node-object-cluster.js';

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GROUP_ID = 'partition-node-surface';
const VOTERS = Object.freeze(['11', '12', '13']);
const PROPOSAL = 'a-committed-command';
const SETTLE_ROUNDS = 200;

function classified(bucket, memberClass) {
  return Object.entries(bucket)
    .filter(([, entry]) => entry.memberClass === memberClass)
    .map(([name]) => name);
}

function partitionOf(bucket) {
  return {
    served: classified(bucket, RAFT_RS_NODE_MEMBER_CLASS.SERVED),
    deferred: classified(bucket, RAFT_RS_NODE_MEMBER_CLASS.DEFERRED),
    never: classified(bucket, RAFT_RS_NODE_MEMBER_CLASS.NOT_APPLICABLE),
  };
}

function assertPartitions(bucket, censusList, label) {
  const {served, deferred, never} = partitionOf(bucket);
  const all = [...served, ...deferred, ...never];
  assert.equal(all.length, new Set(all).size,
    `${label}: a member is served, deferred or never - never two of them`);
  assert.deepEqual(all.slice().sort(), censusList.slice().sort(),
    `${label}: the three classes must cover the derived census exactly, so ` +
    'a member the backend answers in no way cannot exist');
  for (const [name, entry] of Object.entries(bucket)) {
    assert.ok(entry.reason.length > 0, `${label}: ${name} needs a reason`);
  }
}

test('the node object partitions the production node census exactly',
  async () => {
    const census = censusNames(deriveProductionRaftCallCensus());
    assert.ok(census.nodeMethods.length > 0);
    assertPartitions(RAFT_RS_NODE_SURFACE.methods, census.nodeMethods,
      'methods');
    assertPartitions(RAFT_RS_NODE_SURFACE.properties, census.nodeProperties,
      'properties');
    assertPartitions(RAFT_RS_NODE_SURFACE.events, census.nodeEvents, 'events');
  });

test('the node projects its role into the seam without inventing a liferaft state',
  async () => {
    // The mapping is LifeRaft's own constants, read off LifeRaft. A copy
    // would drift; this cannot.
    assert.equal(RAFT_RS_NODE_STATE.LEADER, LifeRaft.LEADER);
    assert.equal(RAFT_RS_NODE_STATE.CANDIDATE, LifeRaft.CANDIDATE);
    assert.equal(RAFT_RS_NODE_STATE.FOLLOWER, LifeRaft.FOLLOWER);
    assert.equal(RAFT_RS_NODE_STATE.STOPPED, LifeRaft.STOPPED);
    // raft-rs has a fourth role liferaft has no name for. It is deliberately
    // not any liferaft state: `=== LifeRaft.CANDIDATE` must be false for a
    // pre-candidate, because a pre-candidate has not raised its term.
    const liferaftStates = new Set(
      LifeRaft.states.map((name) => LifeRaft[name]));
    assert.ok(!liferaftStates.has(RAFT_RS_NODE_STATE.PRE_CANDIDATE),
      'a pre-candidate mapped onto a liferaft state would be an imitation ' +
      'that silently lies about whether a term was raised');
  });

test('the node refuses every census member it must not imitate, by name',
  async () => {
    const cluster = new NodeBackedCluster({groupId: GROUP_ID, voters: VOTERS});
    try {
      const node = cluster.node(VOTERS[0]);
      const refusable = [
        ...Object.entries(RAFT_RS_NODE_SURFACE.methods),
        ...Object.entries(RAFT_RS_NODE_SURFACE.properties),
      ].filter(([, entry]) =>
        entry.memberClass !== RAFT_RS_NODE_MEMBER_CLASS.SERVED);
      assert.ok(refusable.length > 0);
      for (const [name, entry] of refusable) {
        assert.ok(Reflect.has(node, name),
          `${name} must be present, so a caller gets a named refusal ` +
          'instead of undefined');
        assert.throws(() => {
          const member = node[name];
          if (typeof member === 'function') {
            member.call(node);
          }
        }, (error) => error.message.includes(name) &&
          error.message.includes(entry.reason),
        `${name} must refuse by name with the reason it is not served`);
      }
      // The two writes production performs on a liferaft node directly.
      assert.throws(() => {
        node.term = '99';
      }, /term/u);
      assert.throws(() => {
        node.leader = 'somewhere';
      }, /leader/u);
      // An event the raft-rs node can never emit cannot be subscribed to:
      // a listener that will never fire is the quiet path this refuses.
      const neverEvents = classified(
        RAFT_RS_NODE_SURFACE.events, RAFT_RS_NODE_MEMBER_CLASS.NOT_APPLICABLE);
      assert.ok(neverEvents.length > 0);
      for (const expression of neverEvents) {
        const value = RAFT_RS_NODE_SURFACE.events[expression].value;
        assert.throws(() => node.on(value, () => {}),
          (error) => error.message.includes(String(value)));
      }
    } finally {
      cluster.dispose();
    }
  });

test('a fresh cluster forms, commits and reports itself through the node object',
  async () => {
    const cluster = new NodeBackedCluster({groupId: GROUP_ID, voters: VOTERS});
    try {
      const observed = cluster.observeEvents();
      assert.ok(cluster.settle(() => cluster.leaderPeerId() !== null,
        SETTLE_ROUNDS), 'the cluster must elect through the node objects');
      const leaderPeerId = cluster.leaderPeerId();
      const leader = cluster.node(leaderPeerId);
      // Every expectation below is the core's own answer, read through the
      // core and compared with what the node reported.
      const status = cluster.coreStatus(leaderPeerId);
      assert.equal(leader.state, RAFT_RS_NODE_STATE.LEADER);
      assert.equal(leader.term, status.term);
      assert.equal(leader.leader, cluster.addressOf(status.lead));
      const confState = cluster.coreConfState(leaderPeerId);
      assert.deepEqual(
        leader.nodes.map((peer) => peer.address).sort(),
        confState.voters
          .filter((id) => id !== leaderPeerId)
          .map((id) => cluster.addressOf(id))
          .sort(),
        'nodes projects the committed configuration, never a local array');
      assert.ok(observed.roles.get(leaderPeerId)
        .includes(RAFT_RS_NODE_EVENT.LEADER));
      assert.ok(observed.termChanges.get(leaderPeerId).length > 0);
      assert.deepEqual(
        observed.termChanges.get(leaderPeerId).at(-1), status.term);

      cluster.propose(leaderPeerId, PROPOSAL);
      assert.ok(cluster.settle(
        () => cluster.everyPeerCommitted(PROPOSAL), SETTLE_ROUNDS),
      'a proposal made through the node must commit on every peer');
      for (const peerId of VOTERS) {
        assert.ok(observed.commits.get(peerId).includes(PROPOSAL));
      }
    } finally {
      cluster.dispose();
    }
  });

test('a transport message reaches the core only through the envelope boundary',
  async () => {
    const cluster = new NodeBackedCluster({groupId: GROUP_ID, voters: VOTERS});
    try {
      assert.ok(cluster.settle(() => cluster.leaderPeerId() !== null,
        SETTLE_ROUNDS));
      const peerId = VOTERS[2];
      const before = cluster.coreStatus(peerId);
      const misrouted = cluster.envelopeFrom(cluster.leaderPeerId(), peerId);
      misrouted.groupId = `${GROUP_ID}-other`;
      const refusal = cluster.deliverEnvelope(peerId, misrouted);
      assert.equal(refusal.admitted, false);
      assert.equal(refusal.outcome, RAFT_RS_INGRESS_REFUSAL.GROUP_MISMATCH);
      assert.deepEqual(cluster.coreStatus(peerId), before,
        'a refused envelope must not have reached step()');
      // The same envelope with its own group id is admitted, so the refusal
      // above discriminates rather than refusing everything.
      const admitted = cluster.deliverEnvelope(
        peerId, cluster.envelopeFrom(cluster.leaderPeerId(), peerId));
      assert.equal(admitted.admitted, true);
    } finally {
      cluster.dispose();
    }
  });

test('a trap taken through the node marks the runtime unhealthy in production',
  async () => {
    const cluster = new NodeBackedCluster({groupId: GROUP_ID, voters: VOTERS});
    try {
      assert.ok(cluster.settle(() => cluster.leaderPeerId() !== null,
        SETTLE_ROUNDS));
      const peerId = VOTERS[1];
      const node = cluster.node(peerId);
      assert.equal(node.runtimeHealth, RAFT_RS_RUNTIME_HEALTH.HEALTHY);
      // Built while the runtime is still healthy: after a trap the instance
      // cannot even be read, which is the point of retiring it.
      const leaderId = cluster.leaderPeerId();
      const healthy = new Map(VOTERS.map(
        (id) => [id, cluster.envelopeFrom(leaderId, id)]));
      const trapEnvelope = cluster.trapEnvelopeFor(peerId);
      const trapped = cluster.deliverEnvelope(peerId, trapEnvelope);
      assert.equal(trapped.trapped, true);
      assert.equal(node.runtimeHealth,
        RAFT_RS_RUNTIME_HEALTH.UNHEALTHY_AFTER_TRAP);
      // Every node in the runtime stops dispatching, not only the one that
      // trapped: the trap is a property of the runtime.
      for (const otherId of VOTERS) {
        const outcome = cluster.deliverEnvelope(otherId, healthy.get(otherId));
        assert.equal(outcome.runtimeUnhealthy, true,
          `${otherId} must refuse dispatch while the runtime is unhealthy`);
      }
    } finally {
      cluster.dispose();
    }
  });

// Phase 3 recorded, as a fact derived from src, that no module under
// src/partition reached the provider seam to build its node: the partition
// service extended LifeRaft itself. Phase 4 closed that (addendum §1), so the
// same census now says the opposite, and what remains of the LifeRaft
// dependency is stated exactly rather than left implied.
test('no partition module builds a raft node outside the provider seam',
  async () => {
    const sites = seamBypassSites(REPOSITORY_ROOT);
    assert.deepEqual(
      sites.directSubclasses.filter(
        (file) => file.startsWith('src/partition/')),
      [],
      'nothing under src/partition extends LifeRaft any more; the backend ' +
      'builds the node');
    // The state vocabulary is NOT closed yet, and this says so rather than
    // implying it: the modules that still read LifeRaft's own class constants
    // are the interface-reduction table's remaining work.
    assert.ok(sites.stateComparisons.length > 0,
      'modules that are not liferaft still compare node state against ' +
      'LifeRaft\'s own class constants');
    // A control on the search itself: liferaft's own provider still builds a
    // LifeRaft subclass, so an empty result above is a fact and not a broken
    // census.
    assert.ok(fs.readFileSync(
      path.join(REPOSITORY_ROOT, 'src/raft/liferaft-provider.js'), 'utf8')
      .includes('extends LifeRaft'));
    // Both backends answer the partition-construction name; the experimental
    // one refuses by name rather than being absent.
    const provider = createRaftProvider({
      [RAFT_BACKEND_OPTION]: RAFT_BACKEND.RAFT_RS_WASM,
    });
    assert.equal(typeof provider.createNodeClass, 'function');
    assert.equal(typeof provider.createPartitionNode, 'function');
  });
