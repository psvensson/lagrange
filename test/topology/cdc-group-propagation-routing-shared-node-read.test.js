// Witness for the per-target node read in buildSafeTargets
// (src/topology/cdc-group-propagation-routing.js observedServiceRoute): the
// read is the cache's shared frozen view, not a cloned row, and the clone it
// replaced protected no mutation. The route copies one primitive
// (boot_incarnation) out of the row, never retains the row, and never writes
// to it; the stored row is unchanged and the targets are the same values a
// cloned read gives (quest system-table-row-decoders, round 2 F12).

import {test} from '../../src/test-helpers/tap.js';
import {
  CDC_OPERATIONS,
  SystemTableCache,
  getSharedRowReadStats,
  resetSharedRowReadStats,
} from '../../src/cache/system-table-cache.js';
import {COLUMN, SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {buildSafeTargets} from '../../src/topology/cdc-group-propagation-routing.js';
import {CDC_MESSAGE_GROUP_REPLICA_SUFFIX} from
  '../../src/topology/cdc-group-propagation-constants.js';
import {nodesRow, servicesRow} from '../test-helpers/system-table-row-fixture.js';

const TARGET_COUNT = 3;
const NODE_ID = 'node-target';
const BOOT_INCARNATION = 7;

function seedCache() {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.INSERT, nodesRow({
    node_id: NODE_ID, boot_incarnation: BOOT_INCARNATION,
  }));
  for (let index = 1; index <= TARGET_COUNT; index += 1) {
    const groupId = `mg-target-${index}`;
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATIONS.INSERT, servicesRow({
      service_id: `${groupId}${CDC_MESSAGE_GROUP_REPLICA_SUFFIX}1`,
      replica_id: `${groupId}${CDC_MESSAGE_GROUP_REPLICA_SUFFIX}1`,
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      status: SERVICE_STATUS.ACTIVE,
      node_id: NODE_ID,
      address: `ws://127.0.0.1:900${index}`,
    }));
  }
  return cache;
}

function safeTargets(cache) {
  return buildSafeTargets({systemTableCache: cache,
    messageGroupReplicaSuffix: CDC_MESSAGE_GROUP_REPLICA_SUFFIX});
}

test('buildSafeTargets reads each target node through the shared view and ' +
  'neither retains nor mutates it', async (t) => {
  const cache = seedCache();
  const storedBefore = cache.get(TABLES.NODES, NODE_ID);
  resetSharedRowReadStats();
  const targets = safeTargets(cache);
  t.equal(targets.length, TARGET_COUNT, 'one target per message group');
  // One shared view per matching services row (the filter) plus one per
  // target node read; a cloned node read would leave only the first.
  t.equal(getSharedRowReadStats().engagements, 2 * TARGET_COUNT,
    'the per-target node read is the no-clone shared view');
  t.ok(targets.every((target) => target.nodeBootIncarnation === BOOT_INCARNATION),
    'every target carries the node\'s boot incarnation');
  t.ok(targets.every((target) => Object.values(target).every((value) =>
    value === null || typeof value !== 'object')),
  'a target holds only primitives: no reference to a cache row escapes');
  t.ok(Object.isFrozen(cache.getShared(TABLES.NODES, NODE_ID)),
    'the shared node row is frozen: a write through it would throw');
  t.same(cache.get(TABLES.NODES, NODE_ID), storedBefore,
    'the stored node row is unchanged by the read');
  for (const target of targets) target.nodeBootIncarnation = -1;
  t.same(safeTargets(cache).map((target) => target.nodeBootIncarnation),
    Array(TARGET_COUNT).fill(BOOT_INCARNATION),
    'mutating a returned target cannot reach the cache');
  t.equal(storedBefore[COLUMN.BOOT_INCARNATION], BOOT_INCARNATION,
    'the cloned read of the same row gives the same value');
});
