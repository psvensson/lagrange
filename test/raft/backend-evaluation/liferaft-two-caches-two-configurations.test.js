// MEASURED (part A): one partition, one underlying state, two caches.
//
// Node A's cached `services` rows say the replicas are A, B and C. Node B's
// cached rows say A, B and D. Neither cache is illegal and no consensus
// operation of any kind runs. The real `reconcileRaftPeersFromCacheForService`
// and the real `LiferaftProvider.joinPeer` are driven on each, and each Raft
// instance is then asked what it believes its voting configuration and its
// majority to be.
//
// Nothing about the configuration is declared here: every member address
// comes out of a node's own `nodes` array and every majority number out of
// that node's own `majority()`.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {runTwoCachesTwoConfigurations} from './liferaft-scenarios.js';

test('liferaft: the same partition under two caches yields two voting ' +
  'configurations with no consensus operation', () => {
  const record = runTwoCachesTwoConfigurations();

  // No consensus operation occurred: the two configurations were reached by
  // local reconciliation alone.
  assert.equal(record.protocolMessagesEmitted, 0,
    'reconciling a configuration must have sent no protocol message');

  // Two voting configurations for one partition.
  assert.notDeepEqual(record.configurationA, record.configurationB,
    'the two nodes must believe in different voting configurations');
  assert.equal(record.configurationA.length, 3,
    'node A must report three members');
  assert.equal(record.configurationB.length, 3,
    'node B must report three members');
  assert.ok(record.unknownToA.length > 0,
    'node B must count a member node A does not count at all');

  // A still-syncing row was admitted as a voting member.
  assert.equal(record.syncingRowAdmittedAsVoter, true,
    'a SYNCING service row must have been admitted as a voting member');

  // Each node's quorum arithmetic runs over its own configuration, so a
  // quorum on one node can rest on a member the other does not count.
  assert.ok(record.majorityA > 0 && record.majorityB > 0,
    'both nodes must report a majority over their own configuration');
  assert.equal(record.bCanReachItsMajorityOnMembersADoesNotCount, true,
    'node B must be able to reach its own majority using itself plus ' +
    'members node A does not count, so the two configurations can decide ' +
    'independently');
});
