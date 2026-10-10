import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  run,
} from '../../scenarios/user-table-leader-placement-spread.js';

// Module-load captures — the harness tree's ambient-intrinsics rule.
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFind = Function.call.bind(Array.prototype.find);
const arraySlice = Function.call.bind(Array.prototype.slice);

// Virtual-clock budgets: every gate reads the stub topology at
// SPREAD_POLL_MS (500 ms) virtual steps, so a 5 s budget is ten readbacks.
const SHORT_WAIT_TIMEOUT_MS = 5_000;
const HOLD_POLLS = 3;
const NODE_COUNT = 3;
// The pre-phase quiescence hold consumes exactly this many partition
// reads when the stubbed topology is constant; each of the three
// measured gates then needs two stable readbacks before the hold.
const QUIESCENCE_POLLS = 2;
const HOLD_FIRST_READ = QUIESCENCE_POLLS + 7;

function partitionRow(partitionId, leaderNodeId, version, keyStart, keyEnd) {
  return {
    leader_node_id: leaderNodeId,
    partition_id: partitionId,
    partition_key_end: keyEnd,
    partition_key_start: keyStart,
    partition_version: version,
    replica_count: 3,
    state: version === 1 ? 'normal' : 'NORMAL',
    table_id: 'tbl-1',
  };
}

const PARENT_ROW = partitionRow('p-0', 'node-1', 1, null, null);
const SPREAD_PARTITION_ROWS = Object.freeze([
  partitionRow('p-1', 'node-1', 2, null, '80.0'),
  partitionRow('p-2', 'node-2', 2, '80.0', null),
]);
const SINGLE_HOST_PARTITION_ROWS = Object.freeze([
  partitionRow('p-1', 'node-1', 2, null, '80.0'),
  partitionRow('p-2', 'node-1', 2, '80.0', null),
]);
const SINGLE_PARTITION_ROWS = Object.freeze([PARENT_ROW]);
const WITH_PARENT_ROWS = Object.freeze([PARENT_ROW, ...SPREAD_PARTITION_ROWS]);

function serviceRow(nodeId, partitionId, raftRole) {
  return {node_id: nodeId, partition_id: partitionId, raft_role: raftRole,
    service_type: 'partition', status: 'active'};
}

const SPREAD_SERVICE_ROWS = Object.freeze([
  serviceRow('node-1', 'p-1', 'leader'), serviceRow('node-2', 'p-1', 'follower'),
  serviceRow('node-3', 'p-1', 'follower'), serviceRow('node-1', 'p-2', 'follower'),
  serviceRow('node-2', 'p-2', 'leader'), serviceRow('node-3', 'p-2', 'follower'),
]);
const CO_LOCATED_SERVICE_ROWS = Object.freeze([
  serviceRow('node-1', 'p-1', 'leader'), serviceRow('node-1', 'p-2', 'leader'),
]);

function buildQueryHandler(state) {
  return async (sql) => {
    if (stringStartsWith(sql, 'CREATE TABLE') ||
        stringStartsWith(sql, 'INSERT') ||
        stringStartsWith(sql, 'UPDATE tables')) {
      return {rows: []};
    }
    if (stringStartsWith(sql, 'SELECT table_id FROM tables')) {
      return {rows: [{table_id: 'tbl-1'}]};
    }
    if (stringStartsWith(sql, 'SELECT table_policies FROM tables')) {
      return {rows: [{
        table_policies: JSON.stringify({splitStorageThreshold: 16384}),
      }]};
    }
    if (stringStartsWith(sql, 'SELECT partition_id, leader_node_id')) {
      state.partitionReads += 1;
      const rows = typeof state.partitionRowsForRead === 'function' ?
        state.partitionRowsForRead(state.partitionReads) :
        state.partitionRows;
      return {rows: [...rows]};
    }
    if (stringStartsWith(sql, 'SELECT partition_id, node_id')) {
      return {rows: [...state.serviceRows]};
    }
    throw new Error(`unexpected stub query: ${sql}`);
  };
}

function buildStubCluster(state) {
  const query = buildQueryHandler(state);
  const nodes = [];
  for (let index = 1; index <= NODE_COUNT; index += 1) {
    const providerIndex = state.nodeProviders[index - 1];
    nodes.push({
      containerId: `container-${index}`,
      hostIdentity: {hostId: `host:machine-${providerIndex}`,
        label: `10.0.0.${providerIndex + 1}`, providerIndex},
      id: `node-${index}`,
      ip: `10.0.0.${index}`,
      query,
      role: index === 1 ? 'seed' : 'member',
    });
  }
  return {
    _scenarioOverrides: {
      userTableLeaderPlacementSpread: {
        leaderSpreadTimeoutMs: SHORT_WAIT_TIMEOUT_MS,
        quiescenceStablePolls: QUIESCENCE_POLLS,
        quiescenceTimeoutMs: SHORT_WAIT_TIMEOUT_MS,
        replicaSpreadTimeoutMs: SHORT_WAIT_TIMEOUT_MS,
        now: () => state.clockMs,
        sleep: async (ms) => {
          state.clockMs += ms;
        },
        splitWaitTimeoutMs: SHORT_WAIT_TIMEOUT_MS,
        stabilityHoldPolls: HOLD_POLLS,
      },
    },
    getNodes: () => nodes,
    recordScenarioEvent: (type, entityId, details) => {
      state.events.push({details, entityId, type});
      return true;
    },
  };
}

function greenState() {
  return {
    clockMs: 0,
    events: [],
    nodeProviders: [0, 1, 2],
    partitionReads: 0,
    partitionRows: SPREAD_PARTITION_ROWS,
    partitionRowsForRead: null,
    serviceRows: SPREAD_SERVICE_ROWS,
  };
}

describe('user-table-leader-placement-spread scenario', () => {
  it('passes when the platform spreads and holds child leaders', async () => {
    const state = greenState();
    const detail = await run(buildStubCluster(state));
    assert.equal(detail.schemaVersion, 3);
    assert.equal(detail.topology.spreadUnit, 'node');
    assert.equal(detail.tableName, 'leader_spread_activity');
    assert.equal(detail.preQuiescenceStablePolls, QUIESCENCE_POLLS);
    assert.ok(detail.preQuiescenceHoldMs >= 0);
    assert.equal(detail.topology.distinctLeaderNodes, 2);
    assert.equal(detail.topology.partitions.length, 2);
    assert.ok(arrayEvery(detail.topology.partitions,
      (partition) => partition.replicaNodeCount === 3));
    const gates = arrayFilter(state.events, (event) =>
      event.type === 'scenario.gate');
    assert.deepEqual(arrayMap(gates, (event) =>
      [event.entityId, event.details.passed]), [
      ['managed-split', true], ['replica-node-spread-support', true],
      ['leader-node-spread', true], ['leader-node-spread-hold', true],
    ]);
  });

  it('fails when cluster leaders never go quiescent', async () => {
    const state = greenState();
    // Every read swings the leader assignment: no fingerprint can ever
    // repeat across consecutive polls.
    state.partitionRowsForRead = (readCount) => [
      partitionRow('p-1', `node-${(readCount % 2) + 1}`, 1, null, null)];
    await assert.rejects(
      run(buildStubCluster(state)),
      /never went quiescent/u,
    );
  });

  it('fails when every child leader stays on one node', async () => {
    const state = greenState();
    state.partitionRows = SINGLE_HOST_PARTITION_ROWS;
    await assert.rejects(
      run(buildStubCluster(state)),
      /leader-node-spread not met .*spread unit: node .*leader_nodes_insufficient\(unit="node" observed=1 required=2/u,
    );
  });

  it('fails when the managed split never happens', async () => {
    const state = greenState();
    state.partitionRows = SINGLE_PARTITION_ROWS;
    await assert.rejects(
      run(buildStubCluster(state)),
      /managed-split not met .*split_children_missing/u,
    );
  });

  it('fails when replica placement cannot support spread', async () => {
    const state = greenState();
    state.serviceRows = CO_LOCATED_SERVICE_ROWS;
    await assert.rejects(
      run(buildStubCluster(state)),
      /replica-node-spread-support not met .*child_replica_nodes_insufficient/u,
    );
  });

  it('fails when leadership flaps during the stability hold', async () => {
    const state = greenState();
    const flapped = [
      partitionRow('p-1', 'node-3', 2, null, '80.0'),
      SPREAD_PARTITION_ROWS[1],
    ];
    // Spread readbacks stay stable long enough to freeze the topology,
    // then the leader set changes while the hold is polling.
    state.partitionRowsForRead = (readCount) =>
      readCount >= HOLD_FIRST_READ + 1 ? flapped : SPREAD_PARTITION_ROWS;
    await assert.rejects(
      run(buildStubCluster(state)),
      /flapped during the stability hold/u,
    );
  });

  it('the managed-split gate waits for the lingering parent to dissolve',
    async () => {
      const state = greenState();
      // The parent row reads NORMAL beside its children for four
      // readbacks after quiescence, then dissolves.
      state.partitionRowsForRead = (readCount) =>
        readCount <= QUIESCENCE_POLLS + 4 ? WITH_PARENT_ROWS :
          SPREAD_PARTITION_ROWS;
      const detail = await run(buildStubCluster(state));
      assert.equal(detail.topology.partitions.length, 2);
      assert.equal(detail.topology.distinctLeaderNodes, 2);
      const split = arrayFind(state.events, (event) =>
        event.type === 'scenario.gate' && event.entityId === 'managed-split');
      assert.equal(split.details.passed, true);
      // Every readback with the parent present was refused; only the
      // two stable dissolved readbacks passed.
      assert.ok(split.details.unmetTally.parent_not_dissolved >= 3);
      assert.equal(split.details.readbacks,
        split.details.unmetTally.parent_not_dissolved + 2);
    });

  it('an undissolved parent never passes as a split child', async () => {
    const state = greenState();
    state.partitionRows = WITH_PARENT_ROWS;
    state.serviceRows = [...SPREAD_SERVICE_ROWS,
      serviceRow('node-1', 'p-0', 'follower')];
    await assert.rejects(run(buildStubCluster(state)),
      /managed-split not met .*parent_not_dissolved\(partitionId="p-0"/u);
  });

  it('counts distinct leader NODES (its stated unit): two leader nodes on ' +
    'one host pass, and the record says host spread was not measured',
  async () => {
    const state = greenState();
    state.nodeProviders = [0, 0, 1];
    const detail = await run(buildStubCluster(state));
    assert.equal(detail.topology.spreadUnit, 'node');
    assert.equal(detail.topology.distinctLeaderNodes, 2);
    assert.equal(detail.topology.distinctLeaderHosts, undefined);
    const spread = arrayFilter(state.events, (event) =>
      event.type === 'scenario.gate' &&
      event.entityId === 'leader-node-spread')[0].details;
    assert.equal(spread.spreadUnit, 'node');
    assert.deepEqual(spread.leaderSpread.unit, 'node');
    assert.equal(spread.leaderSpread.members.length, 2);
    assert.deepEqual(spread.leaderHosts, ['host:machine-0']);
  });

  it('a node-unit claim does not need host topology', async () => {
    const state = greenState();
    const cluster = buildStubCluster(state);
    for (const node of cluster.getNodes()) {
      node.hostIdentity = null;
    }
    const detail = await run(cluster);
    assert.equal(detail.topology.distinctLeaderNodes, 2);
  });

  it('learner and syncing rows do not support replica spread', async () => {
    const state = greenState();
    state.serviceRows = [
      serviceRow('node-1', 'p-1', 'leader'),
      {...serviceRow('node-2', 'p-1', 'learner')},
      {...serviceRow('node-3', 'p-1', 'follower'), status: 'syncing'},
      ...arraySlice(SPREAD_SERVICE_ROWS, 3),
    ];
    await assert.rejects(run(buildStubCluster(state)),
      /replica-node-spread-support not met .*child_replica_nodes_insufficient\(partitionId="p-1" unit="node" observed=1 required=2\)/u);
  });

  it('fails when spread itself is lost during the hold', async () => {
    const state = greenState();
    const collapsed = [SPREAD_PARTITION_ROWS[1]];
    state.partitionRowsForRead = (readCount) =>
      readCount >= HOLD_FIRST_READ + 1 ? collapsed : SPREAD_PARTITION_ROWS;
    await assert.rejects(
      run(buildStubCluster(state)),
      /leader spread was lost during the stability hold/u,
    );
  });

  it('fails below three nodes', async () => {
    const cluster = buildStubCluster(greenState());
    const nodes = cluster.getNodes().slice(0, 2);
    await assert.rejects(
      run({...cluster, getNodes: () => nodes}),
      /requires a 3-node cluster/u,
    );
  });
});
