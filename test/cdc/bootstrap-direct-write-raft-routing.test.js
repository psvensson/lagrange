/**
 * Bootstrap-mode direct SQL: writes ride raft when a leader exists.
 *
 * The direct per-replica fan-out writes only to the replicas present and
 * usable at that instant, outside the raft log — a replica missing from
 * the set at write time diverges durably and nothing ever heals it
 * (round-11: the registration-era services rows missing from the leader
 * db, the 43-row "No row found for CDC update" wave, serve-eligibility
 * wedged, phase-1 routable-partition timeouts). Registration waits for
 * partition leadership before writing, so when a leader replica is
 * present the write goes through its raft append (executeQuery →
 * proposeWrite) and replicates to every replica; the per-replica direct
 * loop remains only for the genuinely leaderless earliest-bootstrap
 * window. Reads keep the local lane.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  CDCRoutedMutationReadiness,
} from '../../src/cdc/cdc-routed-mutation-readiness.js';

const INSERT_SQL =
  'INSERT OR REPLACE INTO services (service_id) VALUES (?)';
const SELECT_SQL = 'SELECT * FROM services';

function buildReplica({partitionId, isLeader, calls, name, raftLaneFails}) {
  return {
    partitionId,
    isLeader,
    initialized: true,
    async executeQuery(sql, params) {
      calls.raft.push({name, sql, params});
      if (raftLaneFails) {
        throw new Error('no leader available for write');
      }
      return {success: true, partitionId, raft: true};
    },
    async executeLocalQuery(sql, params) {
      calls.local.push({name, sql, params});
      return {success: true, partitionId, rows: [], count: 0};
    },
  };
}

function buildHost({withLeader, raftLaneFails = false}) {
  const calls = {raft: [], local: []};
  const host = Object.create(CDCRoutedMutationReadiness.prototype);
  host.bootstrapMode = true;
  host.logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
  host.localPartitionServices = new Map([
    ['services-p1-r1', buildReplica({
      partitionId: 'services-p1',
      isLeader: withLeader,
      calls,
      name: 'r1',
      raftLaneFails,
    })],
    ['services-p1-r2', buildReplica({
      partitionId: 'services-p1',
      isLeader: false,
      calls,
      name: 'r2',
      raftLaneFails,
    })],
    ['services-p1-r3', buildReplica({
      partitionId: 'services-p1',
      isLeader: false,
      calls,
      name: 'r3',
      raftLaneFails,
    })],
  ]);
  return {host, calls};
}

test('a bootstrap-mode write with a local leader rides the raft append, ' +
  'not the per-replica direct loop', async (t) => {
  const {host, calls} = buildHost({withLeader: true});
  const result = await host.executeSQLDirectToLocalPartition(
    INSERT_SQL,
    ['mg-1-r1'],
  );
  t.equal(result.success, true);
  t.equal(calls.raft.length, 1,
    'the write goes through the leader raft lane exactly once');
  t.equal(calls.raft[0].name, 'r1', 'the leader replica carries the append');
  t.equal(calls.local.length, 0,
    'no per-replica direct write when a leader exists');
  t.end();
});

test('a bootstrap-mode write with only followers still rides the raft ' +
  'lane (proposeWrite forwards to the known leader)', async (t) => {
  const {host, calls} = buildHost({withLeader: false});
  const result = await host.executeSQLDirectToLocalPartition(
    INSERT_SQL,
    ['mg-1-r1'],
  );
  t.equal(result.success, true);
  t.equal(calls.raft.length, 1,
    'a follower candidate carries the append via leader forwarding');
  t.equal(calls.local.length, 0,
    'no per-replica direct write while the raft lane works');
  t.end();
});

test('a bootstrap-mode write falls back to the per-replica direct fan-out ' +
  'only when the raft lane itself fails (leaderless window)', async (t) => {
  const {host, calls} = buildHost({withLeader: false, raftLaneFails: true});
  const result = await host.executeSQLDirectToLocalPartition(
    INSERT_SQL,
    ['mg-1-r1'],
  );
  t.equal(result.success, true);
  t.equal(calls.raft.length, 1, 'the raft lane was attempted first');
  t.equal(calls.local.length, 3,
    'the leaderless window keeps the direct fan-out to every replica');
  t.end();
});

test('a bootstrap-mode read keeps the local lane even with a leader',
  async (t) => {
    const {host, calls} = buildHost({withLeader: true});
    const result = await host.executeSQLDirectToLocalPartition(SELECT_SQL);
    t.equal(result.success, true);
    t.equal(calls.raft.length, 0, 'reads never ride the raft append');
    t.equal(calls.local.length, 1, 'reads stay on one local replica');
    t.end();
  });
