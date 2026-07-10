import t from 'tap';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {
  PriorityPublicationSafetyTopology,
} from '../../src/rebalancer/priority-publication-safety-topology.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';

// CL-035: the learner->voter promotion updates only in-memory raft state + a
// DEFERRED durable raft_role write that flushes through the control plane being
// recovered. So the REPLACE remove-safety gate
// (PriorityPublicationSafetyTopology.isVoterReadyReplicaTopology) reads the
// SERVICES row's raft_role, sees learner/null long after the replica is actually
// a voter, and defers removing the superseded source forever -> priority
// control-plane spread never recovers post-restart (run3 stuck at 1/5, run4 2/5).
// Fix: seedLocalPriorityReplicaRaftRole writes the locally-decided voting role
// into the LOCAL cache row at the voter-ready activation moment (no control-plane
// round-trip), so the gate observes local truth. These tests exercise the seed
// (via ReplicaHandler.prototype with a mock `this` + a REAL SystemTableCache so
// the UPSERT merge semantics are exercised), the gate's acceptance of the seeded
// role, and the activation-path wiring.

const PRIORITY_PARTITION = 'control_plane_publications-p1';
const NON_PRIORITY_PARTITION = 'services-p1';
const REPLICA_ID = 'control_plane_publications-p1-r4';
const ADDRESS = 'ws://127.0.0.1:8082';

const seedRaftRole =
  ReplicaHandler.prototype.seedLocalPriorityReplicaRaftRole;
const isVoterReadyTopology =
  PriorityPublicationSafetyTopology.prototype.isVoterReadyReplicaTopology;
const waitForVoterReady =
  ReplicaHandler.prototype.waitForVoterReadyActivation;

function makeCacheWithRow({raftRole = 'learner', status = 'active'} = {}) {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(
    SYSTEM_TABLE_NAME.SERVICES,
    'INSERT',
    {
      service_id: REPLICA_ID,
      service_type: 'partition',
      partition_id: PRIORITY_PARTITION,
      node_id: 'node-a',
      status,
      address: ADDRESS,
      raft_role: raftRole,
      created_at: 1000,
      updated_at: 1000,
    },
    {causeId: 'test-seed'},
  );
  return cache;
}

function makeSeedThis(cache, {trackedRole = 'follower'} = {}) {
  const marked = [];
  return {
    self: {marked},
    systemTableCache: cache,
    getTrackedReplicaRole: () => trackedRole,
    replicaStateMachine: {
      markServiceRowLocalOnly: (id) => marked.push(id),
    },
  };
}

t.test('CL-035 seed: priority voter promotion writes raft_role into the local row', (t) => {
  const cache = makeCacheWithRow({raftRole: 'learner'});
  const ctx = makeSeedThis(cache, {trackedRole: 'follower'});

  const applied = seedRaftRole.call(ctx, REPLICA_ID, PRIORITY_PARTITION);

  t.equal(applied, true, 'seed applied');
  const row = cache.get(SYSTEM_TABLE_NAME.SERVICES, REPLICA_ID);
  t.equal(row.raft_role, 'follower', 'row raft_role advanced learner -> follower');
  t.equal(row.status, 'active', 'status preserved by the merge');
  t.equal(row.address, ADDRESS, 'address preserved by the merge');
  t.same(ctx.self.marked, [REPLICA_ID], 'row re-marked local-only');
  t.end();
});

t.test('CL-035 seed: collapses a leader role to follower (matches durable value)', (t) => {
  const cache = makeCacheWithRow({raftRole: 'learner'});
  const ctx = makeSeedThis(cache, {trackedRole: 'leader'});

  seedRaftRole.call(ctx, REPLICA_ID, PRIORITY_PARTITION);

  const row = cache.get(SYSTEM_TABLE_NAME.SERVICES, REPLICA_ID);
  t.equal(row.raft_role, 'follower', 'leader collapsed to follower');
  t.end();
});

t.test('CL-035 seed: does NOT write for a non-priority partition', (t) => {
  const cache = makeCacheWithRow({raftRole: 'learner'});
  const ctx = makeSeedThis(cache, {trackedRole: 'follower'});

  const applied = seedRaftRole.call(ctx, REPLICA_ID, NON_PRIORITY_PARTITION);

  t.equal(applied, false, 'non-priority partition is a no-op');
  const row = cache.get(SYSTEM_TABLE_NAME.SERVICES, REPLICA_ID);
  t.equal(row.raft_role, 'learner', 'row unchanged');
  t.same(ctx.self.marked, [], 'no local-only marking');
  t.end();
});

t.test('CL-035 seed: does NOT write while the local role is still learner', (t) => {
  const cache = makeCacheWithRow({raftRole: 'learner'});
  const ctx = makeSeedThis(cache, {trackedRole: 'learner'});

  const applied = seedRaftRole.call(ctx, REPLICA_ID, PRIORITY_PARTITION);

  t.equal(applied, false, 'learner is not a voter -> no seed');
  const row = cache.get(SYSTEM_TABLE_NAME.SERVICES, REPLICA_ID);
  t.equal(row.raft_role, 'learner', 'row unchanged (gate must still defer)');
  t.end();
});

t.test('CL-035 seed: does NOT synthesize an incomplete row when none exists', (t) => {
  const cache = new SystemTableCache();
  const ctx = makeSeedThis(cache, {trackedRole: 'follower'});

  const applied = seedRaftRole.call(ctx, REPLICA_ID, PRIORITY_PARTITION);

  t.equal(applied, false, 'no existing row -> no write');
  t.equal(
    cache.get(SYSTEM_TABLE_NAME.SERVICES, REPLICA_ID),
    undefined,
    'no partial row created',
  );
  t.end();
});

t.test('CL-035 gate: accepts the seeded follower role, still rejects learner/null', (t) => {
  const base = {status: 'active', address: ADDRESS};
  t.equal(
    isVoterReadyTopology.call(null, {...base, raft_role: 'follower'}),
    true,
    'follower row is voter-ready (the seeded state)',
  );
  t.equal(
    isVoterReadyTopology.call(null, {...base, raft_role: 'leader'}),
    true,
    'leader row is voter-ready',
  );
  // Proves the gate is not merely weakened: a genuine learner / null still defers.
  t.equal(
    isVoterReadyTopology.call(null, {...base, raft_role: 'learner'}),
    false,
    'learner row is NOT voter-ready',
  );
  t.equal(
    isVoterReadyTopology.call(null, {...base, raft_role: null}),
    false,
    'null raft_role is NOT voter-ready',
  );
  t.end();
});

t.test('CL-035 end-to-end: seeded row passes the gate that previously deferred', (t) => {
  const cache = makeCacheWithRow({raftRole: 'learner'});
  // Before the seed the gate would defer (learner).
  t.equal(
    isVoterReadyTopology.call(null, cache.get(SYSTEM_TABLE_NAME.SERVICES, REPLICA_ID)),
    false,
    'pre-seed: gate defers on the learner row',
  );
  const ctx = makeSeedThis(cache, {trackedRole: 'follower'});
  seedRaftRole.call(ctx, REPLICA_ID, PRIORITY_PARTITION);
  // After the seed the same row satisfies the gate.
  t.equal(
    isVoterReadyTopology.call(null, cache.get(SYSTEM_TABLE_NAME.SERVICES, REPLICA_ID)),
    true,
    'post-seed: gate proceeds (remove no longer blocked)',
  );
  t.end();
});

t.test('CL-035 wiring: voter-ready activation seeds the role before returning', async (t) => {
  const calls = [];
  const ctx = {
    nodeId: 'node-a',
    syncTimeoutMs: 1000,
    logger: {info: () => {}, warn: () => {}},
    throwIfShuttingDown: () => {},
    isReplicaVoterReady: () => true,
    getTrackedService: () => null,
    seedLocalPriorityReplicaRaftRole: (replicaId, partitionId) => {
      calls.push({replicaId, partitionId});
      return true;
    },
  };

  await waitForVoterReady.call(ctx, REPLICA_ID, PRIORITY_PARTITION);

  t.same(
    calls,
    [{replicaId: REPLICA_ID, partitionId: PRIORITY_PARTITION}],
    'activation path invoked the raft_role seed exactly once',
  );
  t.end();
});
