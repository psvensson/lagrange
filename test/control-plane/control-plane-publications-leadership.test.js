import t from 'tap';
import {
  isControlPlanePublicationsWriteLeader,
  CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
} from '../../src/control-plane/control-plane-publications-leadership.js';

t.test('partition id resolves', async (t) => {
  t.equal(CONTROL_PLANE_PUBLICATIONS_PARTITION_ID, 'control_plane_publications-p1');
});

t.test('tier 0: live in-memory role via canWriteSystemTableLocally (never lags)', async (t) => {
  const emptyCache = {get: () => null, find: () => null};
  const cdcLeader = {
    canWriteSystemTableLocally: (table) => table === 'control_plane_publications',
  };
  // Tier-0 wins even when the cache is empty (the stall case that defeated cache-only)
  t.equal(
    isControlPlanePublicationsWriteLeader(emptyCache, 'seed', cdcLeader),
    true,
    'in-memory leader recognized despite empty cache',
  );
  t.equal(
    isControlPlanePublicationsWriteLeader(emptyCache, 'seed', {
      canWriteSystemTableLocally: () => false,
    }),
    false,
    'in-memory non-leader -> false (falls to empty cache)',
  );
  // throwing cdc -> fall through to cache tiers, fail-safe
  t.equal(
    isControlPlanePublicationsWriteLeader(emptyCache, 'seed', {
      canWriteSystemTableLocally: () => {throw new Error('x');},
    }),
    false,
  );
});

t.test('tier 1: partitions row leader_node_id', async (t) => {
  const cache = {
    get: (table, key) =>
      table === 'partitions' && key === CONTROL_PLANE_PUBLICATIONS_PARTITION_ID ?
        {leader_node_id: 'seed'} :
        null,
    find: () => null,
  };
  t.equal(isControlPlanePublicationsWriteLeader(cache, 'seed'), true, 'leader');
  t.equal(isControlPlanePublicationsWriteLeader(cache, 'rejoiner'), false, 'non-leader');
});

t.test('tier 2: live services raft_role witness (case-insensitive)', async (t) => {
  const cache = {
    get: () => null,
    find: (table, predicate) =>
      table === 'services' &&
      predicate({
        partition_id: CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
        node_id: 'seed',
        raft_role: 'LEADER',
      }) ?
        {} :
        null,
  };
  t.equal(isControlPlanePublicationsWriteLeader(cache, 'seed'), true);
  t.equal(isControlPlanePublicationsWriteLeader(cache, 'other'), false);
});

t.test('fail-safe: null cache / nodeId / throwing cache -> false', async (t) => {
  t.equal(isControlPlanePublicationsWriteLeader(null, 'seed'), false);
  t.equal(isControlPlanePublicationsWriteLeader({get: () => null, find: () => null}, null), false);
  t.equal(
    isControlPlanePublicationsWriteLeader(
      {get: () => {throw new Error('x');}, find: () => {throw new Error('y');}},
      'seed',
    ),
    false,
  );
});
