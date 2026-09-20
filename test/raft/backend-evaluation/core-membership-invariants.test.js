// Three invariants about the core's membership, driven on the fork.
//
//  - convergence: after a configuration entry is committed AND applied on a
//    peer, that peer reports the ConfState its own apply returned; identity
//    at every instant is not required, agreement after apply is;
//  - the same two Lagrange cache contents that gave liferaft two voting
//    configurations in part A change nothing here, and the harness takes no
//    cache parameter at all - which is asserted structurally;
//  - a second configuration change proposed while one is pending is
//    OBSERVED, not prescribed.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';

import {hostAmbientInputCensus} from './host-consensus-surface.js';
import {
  FORK,
  assertMembershipDiffers,
  assertMembershipEqual,
  assertMembershipIncludes,
  assertMembershipNotEmpty,
} from './forked-core-harness.js';
import {
  PART_A_CACHES,
  runConfStateConvergence,
  runDisagreeingCaches,
  runPendingConfChange,
} from './core-scenarios.js';

const CACHE_PARAMETER_NAMES =
  /\b(cache|serviceRows|systemTableCache|services)\b/u;
const HARNESS_SIGNATURE = /function createDeterministicCluster\(\{([^}]*)\}/u;

function assertWitnessed(record) {
  assert.ok(record.witness.total > 0,
    `${record.id}: the scenario must have read membership from the core`);
  assert.equal(record.witness.refusals, 0,
    `${record.id}: no membership value may have bypassed a core read`);
}

test('ConfState converges after apply and membership decisions come from ' +
  'the core', () => {
  const record = runConfStateConvergence();
  assertWitnessed(record);

  assert.ok(record.peersThatApplied.length > 0,
    'at least one peer must have applied the configuration entry');
  for (const peerId of record.peersThatApplied) {
    assertMembershipEqual(record.after[peerId].voters,
      record.appliedConfByPeer[peerId].voters,
      `${peerId} must report the ConfState its own apply returned`);
    assertMembershipDiffers(record.after[peerId].voters,
      record.before[peerId].voters,
      `${peerId} must have moved to a new configuration`);
  }
  assert.equal(record.converged, true,
    'peers that applied the entry must agree on the configuration');
  // The quorum a decision uses is the core's own voter set.
  assertMembershipNotEmpty(record.after[record.leaderId].voters,
    'the leader must take its membership from its own reported voters');
});

test('disagreeing service caches leave raft membership identical', () => {
  const record = runDisagreeingCaches();
  assertWitnessed(record);

  // The caches are the SAME two contents part A drove on liferaft.
  const views = Object.values(PART_A_CACHES)
    .map((rows) => rows.map((row) => row.replica).sort().join());
  assert.equal(new Set(views).size, 2,
    'the two cache contents must genuinely disagree, as they did in part A');
  assert.equal(record.cachesDisagree, true,
    'the scenario must have held two contradictory views');
  assert.ok(Object.values(PART_A_CACHES).flat()
    .some((row) => row.status === 'syncing'),
  'one cache must hold a still-syncing replica, as part A\'s did');

  // And they changed nothing.
  assert.equal(record.unchanged, true,
    'Raft membership must be unchanged by the caches');
  assert.equal(record.identicalOnEveryPeer, true,
    'every peer must report exactly the same voters');

  // The caches were LIVE and hostile: mutable, different per peer, rewritten
  // between every round of the drive - and the configuration never moved in
  // any round. Round 1's caches were a frozen constant nothing read, which
  // proved nothing about a cache that changes under a running system.
  assert.equal(record.cachesAreLive, true,
    'the cache doubles must have been mutated under the drive');
  assert.ok(record.cacheMutations.length > 1,
    'the caches must have changed more than once');
  assert.equal(record.unchangedInEveryRound, true,
    'the configuration moved in a round where only the caches changed: ' +
    JSON.stringify(record.perRound.filter((entry) => !entry.unchanged)));
  assert.ok(record.poisonedGlobals.length > 0,
    'the ambient channels a cache could arrive through must be poisoned');

  // Structurally unread, two ways. The driver takes no cache parameter, and
  // - the claim the verifier called weak - there is no channel for one to
  // arrive through: every module the driver and the wasm glue pull in is a
  // node builtin or the fork's own files.
  const harness = fs.readFileSync(FORK.SELF, 'utf8');
  const signature = HARNESS_SIGNATURE.exec(harness);
  assert.ok(signature, 'the cluster factory signature must be readable');
  assert.ok(!CACHE_PARAMETER_NAMES.test(signature[1]),
    'the core driver must take no cache parameter: ' +
    `saw {${signature[1].trim()}}`);
  const ambient = hostAmbientInputCensus();
  assert.deepEqual(ambient.foreignImports, [],
    'the core driver or the wasm glue imports something that is neither a ' +
    `node builtin nor the fork itself: ${JSON.stringify(
      ambient.foreignImports)}`);
  assert.equal(ambient.onlyBuiltinsAndTheGlue, true,
    'a service-row cache has no channel into the driver');
  assert.ok(ambient.files.includes('raft-core/pkg/raft_wasm.js'),
    'the census must include the wasm glue, which is where an ambient ' +
    'dependency would actually hide');
});

test('a second configuration change while one is pending is observed, not ' +
  'prescribed', () => {
  const record = runPendingConfChange();
  assertWitnessed(record);

  // Only the record's internal consistency is asserted. What the core does
  // is what is recorded.
  assert.ok(record.observation.first, 'the first proposal must be recorded');
  assert.ok(record.observation.second, 'the second proposal must be recorded');
  assert.ok(Array.isArray(record.committedEntryTypes),
    'the committed entry types must be recorded');
  assert.equal(typeof record.pendingConfIndexAfter, 'number',
    'the core\'s own pending configuration index must be recorded');

  if (record.secondChangeTookEffect) {
    assert.ok(record.committedConfEntryCount >= 2,
      'if the second change took effect, a second configuration entry must ' +
      'have been committed and applied');
  } else {
    assertMembershipIncludes(record.votersAfter, record.votersRequestedToRemove,
      'if the second change did not take effect, its target must still be ' +
      'a voter');
    assert.equal(record.committedConfEntryCount, 1,
      'exactly one configuration entry may have taken effect');
  }
  // Whatever the core did with the second request, the first must not have
  // been lost by it.
  assert.equal(record.firstChangeTookEffect, true,
    'the first configuration change must still have taken effect');
});
