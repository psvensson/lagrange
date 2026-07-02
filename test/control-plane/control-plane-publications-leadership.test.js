import t from 'tap';
import {
  isControlPlanePublicationsWriteLeader,
  resolveControlPlanePublicationsLeadership,
  LEADERSHIP_TIER,
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
    'in-memory non-leader -> false without consulting stale cache tiers',
  );
  // throwing cdc -> fall through to cache tiers, fail-safe
  t.equal(
    isControlPlanePublicationsWriteLeader(emptyCache, 'seed', {
      canWriteSystemTableLocally: () => {
        throw new Error('x');
      },
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

t.test('tier 0: live non-leader verdict wins over stale partition row', async (t) => {
  const staleLeaderCache = {
    get: (table, key) =>
      table === 'partitions' && key === CONTROL_PLANE_PUBLICATIONS_PARTITION_ID ?
        {leader_node_id: 'seed'} :
        null,
    find: () => null,
  };
  const liveNonLeader = {
    canWriteSystemTableLocally: () => false,
  };
  t.strictSame(
    resolveControlPlanePublicationsLeadership(
      staleLeaderCache,
      'seed',
      liveNonLeader,
    ),
    {isLeader: false, tier: LEADERSHIP_TIER.RAFT_LIVE},
    'a live Raft non-leader result prevents stale partition-row ownership',
  );
  t.equal(
    isControlPlanePublicationsWriteLeader(
      staleLeaderCache,
      'seed',
      liveNonLeader,
    ),
    false,
    'predicate also fails closed on live non-leader evidence',
  );
});

t.test('tier 0: unavailable live probe falls back to partition row', async (t) => {
  const leaderCache = {
    get: (table, key) =>
      table === 'partitions' && key === CONTROL_PLANE_PUBLICATIONS_PARTITION_ID ?
        {leader_node_id: 'seed'} :
        null,
    find: () => null,
  };
  const throwingProbe = {
    canWriteSystemTableLocally: () => {
      throw new Error('probe unavailable');
    },
  };
  t.strictSame(
    resolveControlPlanePublicationsLeadership(
      leaderCache,
      'seed',
      throwingProbe,
    ),
    {isLeader: true, tier: LEADERSHIP_TIER.PARTITION_ROW},
    'a failed live probe is unavailable, not a live non-leader verdict',
  );
  t.equal(
    isControlPlanePublicationsWriteLeader(
      leaderCache,
      'seed',
      throwingProbe,
    ),
    true,
    'predicate preserves the cache fallback when live probing fails',
  );
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
      {get: () => {
        throw new Error('x');
      }, find: () => {
        throw new Error('y');
      }},
      'seed',
    ),
    false,
  );
});

t.test('resolveLeadership reports the deciding tier', async (t) => {
  const emptyCache = {get: () => null, find: () => null};
  t.strictSame(
    resolveControlPlanePublicationsLeadership(emptyCache, 'seed', {
      canWriteSystemTableLocally: () => true,
    }),
    {isLeader: true, tier: LEADERSHIP_TIER.RAFT_LIVE},
  );
  t.strictSame(
    resolveControlPlanePublicationsLeadership(emptyCache, 'seed', {
      canWriteSystemTableLocally: () => false,
    }),
    {isLeader: false, tier: LEADERSHIP_TIER.RAFT_LIVE},
  );
  t.strictSame(
    resolveControlPlanePublicationsLeadership(
      {get: () => ({leader_node_id: 'seed'}), find: () => null},
      'seed',
    ),
    {isLeader: true, tier: LEADERSHIP_TIER.PARTITION_ROW},
  );
  t.strictSame(
    resolveControlPlanePublicationsLeadership(
      {get: () => null, find: () => ({})},
      'seed',
    ),
    {isLeader: true, tier: LEADERSHIP_TIER.SERVICES_WITNESS},
  );
  t.strictSame(
    resolveControlPlanePublicationsLeadership(emptyCache, 'seed'),
    {isLeader: false, tier: LEADERSHIP_TIER.NONE},
  );
});

// The boolean predicate MUST stay exactly resolveLeadership().isLeader across
// every branch — this predicate has been wrong twice, so the delegation is
// guarded against drift here.
t.test('predicate equals resolveLeadership().isLeader for all branches', async (t) => {
  const cdcTrue = {canWriteSystemTableLocally: () => true};
  const cdcFalse = {canWriteSystemTableLocally: () => false};
  const cdcThrows = {canWriteSystemTableLocally: () => {
    throw new Error('x');
  }};
  const partitionLeaderCache = {
    get: (table, key) =>
      table === 'partitions' && key === CONTROL_PLANE_PUBLICATIONS_PARTITION_ID ?
        {leader_node_id: 'seed'} :
        null,
    find: () => null,
  };
  const witnessCache = {
    get: () => null,
    find: (table, predicate) =>
      table === 'services' &&
      predicate({
        partition_id: CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
        node_id: 'seed',
        raft_role: 'leader',
      }) ?
        {} :
        null,
  };
  const throwingCache = {
    get: () => {
      throw new Error('x');
    },
    find: () => {
      throw new Error('y');
    },
  };
  const cases = [
    [null, 'seed', null],
    [{get: () => null, find: () => null}, null, cdcFalse],
    [{get: () => null, find: () => null}, 'seed', cdcTrue],
    [{get: () => null, find: () => null}, 'seed', cdcThrows],
    [partitionLeaderCache, 'seed', null],
    [partitionLeaderCache, 'seed', cdcThrows],
    [partitionLeaderCache, 'seed', cdcFalse],
    [partitionLeaderCache, 'other', cdcFalse],
    [witnessCache, 'seed', null],
    [witnessCache, 'seed', cdcFalse],
    [witnessCache, 'other', cdcFalse],
    [throwingCache, 'seed', cdcFalse],
  ];
  for (const [cache, nodeId, cdc] of cases) {
    t.equal(
      isControlPlanePublicationsWriteLeader(cache, nodeId, cdc),
      resolveControlPlanePublicationsLeadership(cache, nodeId, cdc).isLeader,
      'predicate matches resolver for a branch',
    );
  }
});
