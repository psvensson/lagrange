/**
 * Split-brain write-acceptance guard (write-routing-repair-under-control-plane-moves).
 *
 * Run-15 production witness: after a formation-time REPLACE, the freshly
 * added replica_operations-p1-r5 on node-1 held a stale self-only replica
 * list (its cache view of siblings was churn-filtered, CL-013 class). A
 * coordinator write delivered to it took the single-replica DIRECT commit
 * path — appending leader-format, self-acked entries at raft log indexes
 * the true leader (r4@node-2) was also committing into, and fabricating
 * phantom "active" replica operations. The REPLACE-completion safety gate
 * then read those phantoms ("Quorum check failed: concurrent partition
 * operation ... is active") and wedged the control plane cluster-wide for
 * the rest of the run.
 *
 * The guard: a write reaching a replica whose self-only replica list is
 * contradicted by independent topology witnesses (a known remote leader, or
 * the partition row's replica_count) must be REJECTED — no local raft log
 * append, no table mutation — so the caller re-routes to the true leader.
 */

import {
  afterEach,
  beforeEach,
  test,
} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function createSelfOnlyPartition(id) {
  return new PartitionService({
    partitionId: id,
    tableId: 'test_table',
    tableName: 'test_table',
    replicaId: `${id}-r5`,
    replicaIds: [`${id}-r5`],
    peerAddresses: [`test-node/partition/${id}-r5`],
    schema: {
      columns: [
        {name: 'id', type: 'TEXT', primaryKey: true},
        {name: 'value', type: 'TEXT'},
      ],
    },
    dbPath: ':memory:',
  });
}

function countRaftLogRows(partition) {
  const tableRow = partition.db
    .prepare(
      'SELECT name FROM sqlite_master WHERE type = ? AND name = ?',
    )
    .get('table', '_raft_log');
  if (!tableRow) {
    return 0;
  }
  return partition.db
    .prepare('SELECT COUNT(*) AS logCount FROM _raft_log')
    .get().logCount;
}

function buildForwardedInsert(partition, rowId) {
  return {
    payload: {
      type: 'FORWARD_WRITE',
      operation: {
        type: 'INSERT',
        tableName: 'test_table',
        sql: 'INSERT INTO test_table (id, value) VALUES (?, ?)',
        params: [rowId, 'phantom'],
        data: {id: rowId, value: 'phantom'},
      },
    },
  };
}

test('stale self-only replica with a known remote leader rejects forwarded writes',
  async (t) => {
    const partition = createSelfOnlyPartition('stale-remote-leader');
    await partition.initialize();

    // Reproduce the r5 churn state: the replica knows a remote leader (it
    // replicated from it moments ago) but its replica list collapsed to
    // self-only, so the pre-fix kernel resolved DIRECT.
    partition.role = 'follower';
    partition.isLeader = false;
    partition.leaderId = 'stale-remote-leader-r4';

    const logRowsBefore = countRaftLogRows(partition);
    const response = await partition.handleApplicationMessage(
      buildForwardedInsert(partition, 'phantom-row-1'),
    );

    t.equal(
      response?.success,
      false,
      'forwarded write must be rejected, not self-committed',
    );
    t.match(
      String(response?.error || ''),
      /No leader available/i,
      'rejection should surface the no-leader routing error',
    );
    const row = partition.db
      .prepare('SELECT value FROM test_table WHERE id = ?')
      .get('phantom-row-1');
    t.equal(row, undefined, 'no phantom row may reach the table');
    t.equal(
      countRaftLogRows(partition),
      logRowsBefore,
      'no entry may be appended to the local raft log at a self-assigned index',
    );

    await partition.shutdown();
  });

test('stale self-only replica contradicted by the published leader pointer rejects forwarded writes',
  async (t) => {
    const partition = createSelfOnlyPartition('stale-leader-pointer');
    await partition.initialize();

    // No raft-observed leader this time — only the published partitions-row
    // leader pointer (an ACTUAL, written by leadership publication) says the
    // leader lives on another node.
    partition.role = 'follower';
    partition.isLeader = false;
    partition.leaderId = null;
    partition.systemTableCache = {
      get: (tableName, key) =>
        tableName === 'partitions' && key === 'stale-leader-pointer' ?
          {
            partition_id: 'stale-leader-pointer',
            leader_node_id: 'some-other-node',
            replica_count: 3,
          } :
          null,
    };

    const logRowsBefore = countRaftLogRows(partition);
    const response = await partition.handleApplicationMessage(
      buildForwardedInsert(partition, 'phantom-row-2'),
    );

    t.equal(
      response?.success,
      false,
      'forwarded write must be rejected when the leader pointer names another node',
    );
    const row = partition.db
      .prepare('SELECT value FROM test_table WHERE id = ?')
      .get('phantom-row-2');
    t.equal(row, undefined, 'no phantom row may reach the table');
    t.equal(
      countRaftLogRows(partition),
      logRowsBefore,
      'no entry may be appended to the local raft log',
    );

    await partition.shutdown();
  });

test('rejected query-routed writes propagate the failure through the response envelope',
  async (t) => {
    const partition = createSelfOnlyPartition('query-envelope');
    await partition.initialize();

    // The split-brain-candidate shape: the local replica still believes it
    // is leader (so the QUERY ingress role gate lets the write through to
    // applyWrite), but the published leader pointer names another node and
    // the commit guard rejects. The coordinator delivers writes as QUERY
    // messages too; a rejection collapsed to success would be acked and
    // silently dropped — the caller must see the failure so its retry
    // machinery re-routes to the true leader.
    partition.role = 'leader';
    partition.isLeader = true;
    partition.leaderId = partition.replicaId;
    partition.systemTableCache = {
      get: (tableName, key) =>
        tableName === 'partitions' && key === 'query-envelope' ?
          {
            partition_id: 'query-envelope',
            leader_node_id: 'some-other-node',
            replica_count: 3,
          } :
          null,
    };
    const response = await partition.handleApplicationMessage({
      payload: {
        type: 'QUERY',
        sql: 'INSERT INTO test_table (id, value) VALUES (?, ?)',
        params: ['query-phantom-1', 'phantom'],
      },
    });

    t.equal(
      response?.success,
      false,
      'the envelope must carry the rejection, not ack it as success',
    );
    t.match(
      String(response?.error || ''),
      /No leader available/i,
      'the routing error must reach the caller for re-route',
    );
    const row = partition.db
      .prepare('SELECT value FROM test_table WHERE id = ?')
      .get('query-phantom-1');
    t.equal(row, undefined, 'no phantom row may reach the table');

    await partition.shutdown();
  });

test('single-replica placement under a replica_count>1 partition row keeps accepting writes',
  async (t) => {
    const partition = createSelfOnlyPartition('single-node-target-3');
    await partition.initialize();

    // The single-node-cluster shape: CREATE TABLE writes replica_count from
    // the config default (minimum 3) BEFORE placement clamps to one visible
    // node, and nothing writes the placed count back. The partition row is
    // a TARGET; with no actual remote leader (pointer names THIS node) the
    // lone replica must keep serving writes — rejecting here bricked every
    // user table on default-config single-node clusters.
    partition.systemTableCache = {
      get: (tableName, key) =>
        tableName === 'partitions' && key === 'single-node-target-3' ?
          {
            partition_id: 'single-node-target-3',
            leader_node_id: partition.nodeId,
            replica_count: 3,
          } :
          null,
    };

    const response = await partition.handleApplicationMessage(
      buildForwardedInsert(partition, 'single-node-row-1'),
    );

    t.equal(
      response?.success,
      true,
      'the lone placed replica must keep accepting writes',
    );
    const row = partition.db
      .prepare('SELECT value FROM test_table WHERE id = ?')
      .get('single-node-row-1');
    t.equal(row?.value, 'phantom', 'the write must land');

    await partition.shutdown();
  });

test('metadata publication helpers are wired for CAS-miss guard refresh', async (t) => {
  const partition = createSelfOnlyPartition('publication-wiring');
  await partition.initialize();

  // The leader-pointer and raft-role publications CAS-guard on the locally
  // cached row; both helpers must carry the guard-refresh escape hatch or a
  // stalled CDC feed starves the publication forever (run-15: 4.3 minutes).
  t.equal(
    typeof partition.leaderNodeMutationHelper?.refreshObservedRow,
    'function',
    'leader_node_id publication must be able to refresh its CAS guard row',
  );
  t.equal(
    typeof partition.roleMutationHelper?.refreshObservedRow,
    'function',
    'raft_role publication must be able to refresh its CAS guard row',
  );

  await partition.shutdown();
});

test('genuine single-replica groups keep accepting direct writes', async (t) => {
  const partition = createSelfOnlyPartition('genuine-single');
  await partition.initialize();

  // A real single-replica group self-promotes at initialize: leaderId is
  // itself and no partitions-row witness contradicts the list, so the
  // direct path must keep working (message groups, replica_count=1 tables).
  const response = await partition.handleApplicationMessage(
    buildForwardedInsert(partition, 'legit-row-1'),
  );

  t.equal(
    response?.success,
    true,
    'direct single-replica writes must keep succeeding',
  );
  const row = partition.db
    .prepare('SELECT value FROM test_table WHERE id = ?')
    .get('legit-row-1');
  t.equal(row?.value, 'phantom', 'row should be persisted');

  await partition.shutdown();
});
