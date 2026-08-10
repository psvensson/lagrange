import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  run,
} from '../../scenarios/user-table-leader-placement-spread.js';

// Module-load captures — the harness tree's ambient-intrinsics rule.
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const arrayEvery = Function.call.bind(Array.prototype.every);

const SHORT_WAIT_TIMEOUT_MS = 50;
const HOLD_POLLS = 3;
const NODE_COUNT = 3;

const SPREAD_PARTITION_ROWS = Object.freeze([
  {leader_node_id: 'node-1', partition_id: 'p-1', state: 'active'},
  {leader_node_id: 'node-2', partition_id: 'p-2', state: 'active'},
]);
const SINGLE_HOST_PARTITION_ROWS = Object.freeze([
  {leader_node_id: 'node-1', partition_id: 'p-1', state: 'active'},
  {leader_node_id: 'node-1', partition_id: 'p-2', state: 'active'},
]);
const SINGLE_PARTITION_ROWS = Object.freeze([
  {leader_node_id: 'node-1', partition_id: 'p-1', state: 'active'},
]);
const SPREAD_SERVICE_ROWS = Object.freeze([
  {node_id: 'node-1', partition_id: 'p-1', raft_role: 'leader',
    status: 'active'},
  {node_id: 'node-2', partition_id: 'p-1', raft_role: 'follower',
    status: 'active'},
  {node_id: 'node-3', partition_id: 'p-1', raft_role: 'follower',
    status: 'active'},
  {node_id: 'node-1', partition_id: 'p-2', raft_role: 'follower',
    status: 'active'},
  {node_id: 'node-2', partition_id: 'p-2', raft_role: 'leader',
    status: 'active'},
  {node_id: 'node-3', partition_id: 'p-2', raft_role: 'follower',
    status: 'active'},
]);
const CO_LOCATED_SERVICE_ROWS = Object.freeze([
  {node_id: 'node-1', partition_id: 'p-1', raft_role: 'leader',
    status: 'active'},
  {node_id: 'node-1', partition_id: 'p-2', raft_role: 'leader',
    status: 'active'},
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
    nodes.push({
      containerId: `container-${index}`,
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
        replicaSpreadTimeoutMs: SHORT_WAIT_TIMEOUT_MS,
        sleep: async () => {},
        splitWaitTimeoutMs: SHORT_WAIT_TIMEOUT_MS,
        stabilityHoldPolls: HOLD_POLLS,
      },
    },
    getNodes: () => nodes,
  };
}

function greenState() {
  return {
    partitionReads: 0,
    partitionRows: SPREAD_PARTITION_ROWS,
    partitionRowsForRead: null,
    serviceRows: SPREAD_SERVICE_ROWS,
  };
}

describe('user-table-leader-placement-spread scenario', () => {
  it('passes when the platform spreads and holds child leaders', async () => {
    const detail = await run(buildStubCluster(greenState()));
    assert.equal(detail.schemaVersion, 1);
    assert.equal(detail.tableName, 'leader_spread_activity');
    assert.equal(detail.topology.distinctLeaderHosts, 2);
    assert.equal(detail.topology.partitions.length, 2);
    assert.ok(arrayEvery(detail.topology.partitions,
      (partition) => partition.replicaHostCount === 3));
  });

  it('fails when every child leader stays on one host', async () => {
    const state = greenState();
    state.partitionRows = SINGLE_HOST_PARTITION_ROWS;
    await assert.rejects(
      run(buildStubCluster(state)),
      /leader placement never spread across >= 2 hosts/u,
    );
  });

  it('fails when the managed split never happens', async () => {
    const state = greenState();
    state.partitionRows = SINGLE_PARTITION_ROWS;
    await assert.rejects(
      run(buildStubCluster(state)),
      /no managed split/u,
    );
  });

  it('fails when replica placement cannot support spread', async () => {
    const state = greenState();
    state.serviceRows = CO_LOCATED_SERVICE_ROWS;
    await assert.rejects(
      run(buildStubCluster(state)),
      /replica placement never supported leader spread/u,
    );
  });

  it('fails when leadership flaps during the stability hold', async () => {
    const state = greenState();
    const flapped = [
      {leader_node_id: 'node-3', partition_id: 'p-1', state: 'active'},
      {leader_node_id: 'node-2', partition_id: 'p-2', state: 'active'},
    ];
    // Spread readbacks stay stable long enough to freeze the topology,
    // then the leader set changes while the hold is polling.
    state.partitionRowsForRead = (readCount) =>
      readCount >= 8 ? flapped : SPREAD_PARTITION_ROWS;
    await assert.rejects(
      run(buildStubCluster(state)),
      /flapped during the stability hold/u,
    );
  });

  it('tolerates a dissolving split parent during the hold', async () => {
    const state = greenState();
    const withParent = [
      {leader_node_id: 'node-1', partition_id: 'p-0', state: 'active'},
      ...SPREAD_PARTITION_ROWS,
    ];
    // The parent row reads settled through the freeze, then dissolves
    // mid-hold; the surviving children's leaders never move.
    state.partitionRowsForRead = (readCount) =>
      readCount >= 8 ? SPREAD_PARTITION_ROWS : withParent;
    const detail = await run(buildStubCluster(state));
    assert.equal(detail.topology.partitions.length, 2);
    assert.equal(detail.topology.distinctLeaderHosts, 2);
  });

  it('fails when spread itself is lost during the hold', async () => {
    const state = greenState();
    const collapsed = [
      {leader_node_id: 'node-2', partition_id: 'p-2', state: 'active'},
    ];
    state.partitionRowsForRead = (readCount) =>
      readCount >= 8 ? collapsed : SPREAD_PARTITION_ROWS;
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
