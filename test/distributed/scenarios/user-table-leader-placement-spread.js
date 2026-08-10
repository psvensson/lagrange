/**
 * Scenario: user-table-leader-placement-spread
 *
 * Creates an ordinary user table on a live 3-node cluster, drives a
 * managed split through split-friendly policies plus write activity,
 * waits for the children's replicas to occupy at least two distinct
 * hosts, and then requires the platform itself to spread the child
 * partition RAFT LEADERS across more than one host: the rebalancer's
 * user-table leader-placement cure must mint the leader handoffs — the
 * scenario never fabricates topology and exposes no admin transfer.
 *
 * Red-on-revert: without the leader-placement cure every child leader
 * stays on the seed and the leader-spread wait times out. The scenario
 * also fails if the split never happens, if replica placement cannot
 * support spread, or if leadership keeps churning after spread is
 * reached (the hysteresis guard: spread must hold through a bounded
 * stability hold with an unchanged leader fingerprint).
 */

import assert from 'node:assert/strict';
import {
  buildSentinelRow,
  generateDatasetRows,
} from './public-path-baseline-helpers.js';
import {
  buildUserActivityTableSql,
  createTableTopologyHelpers,
  selectSettledPartitionRows,
  topologyFingerprint,
} from './user-table-topology-helpers.js';

const SCENARIO_NAME = 'user-table-leader-placement-spread';
const TABLE_NAME = 'leader_spread_activity';

const ZERO = 0;
const ONE = 1;
const MIN_NODE_COUNT = 3;
const MIN_PARTITION_COUNT = 2;
const MIN_DISTINCT_LEADER_HOSTS = 2;
const MIN_DISTINCT_REPLICA_HOSTS = 2;
const SPREAD_POLL_MS = 500;
const SPLIT_WAIT_TIMEOUT_MS = 180_000;
const REPLICA_SPREAD_TIMEOUT_MS = 120_000;
// A cold 3-node boot legitimately holds non-system rebalancing behind
// the priority control-plane spread deferral (recorded stability window
// + [70,80)s release delay) well past three minutes; the sealed red
// condition is leaders staying concentrated INDEFINITELY, so the
// measured window must outlast the formation tail, not race it
// (witnessed live: run 20260810T185440Z timed out 25s before the
// deferral released).
const LEADER_SPREAD_TIMEOUT_MS = 420_000;
const TOPOLOGY_STABLE_READBACKS = 2;
// After spread is reached the leader set must hold: continued movement
// is exactly the flapping the cure's hysteresis guard must prevent.
const STABILITY_HOLD_POLLS = 20;
const MAX_SENTINEL_ROWS = 40;
const REPORT_DETAIL_SCHEMA_VERSION = 1;

const SQL = Object.freeze({
  ...buildUserActivityTableSql(TABLE_NAME),
  SELECT_SERVICES:
    'SELECT partition_id, node_id, status, raft_role FROM services',
});

const helpers = createTableTopologyHelpers({
  scenarioName: SCENARIO_NAME,
  sql: SQL,
  tableName: TABLE_NAME,
});

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveScenarioDependencies(cluster) {
  const overrides =
    cluster?._scenarioOverrides?.userTableLeaderPlacementSpread || {};
  return {
    leaderSpreadTimeoutMs: Number.isInteger(overrides.leaderSpreadTimeoutMs) ?
      overrides.leaderSpreadTimeoutMs :
      LEADER_SPREAD_TIMEOUT_MS,
    replicaSpreadTimeoutMs:
      Number.isInteger(overrides.replicaSpreadTimeoutMs) ?
        overrides.replicaSpreadTimeoutMs :
        REPLICA_SPREAD_TIMEOUT_MS,
    sleep: overrides.sleep || defaultSleep,
    splitWaitTimeoutMs: Number.isInteger(overrides.splitWaitTimeoutMs) ?
      overrides.splitWaitTimeoutMs :
      SPLIT_WAIT_TIMEOUT_MS,
    stabilityHoldPolls: Number.isInteger(overrides.stabilityHoldPolls) ?
      overrides.stabilityHoldPolls :
      STABILITY_HOLD_POLLS,
  };
}

function distinctLeaderHosts(partitionRows) {
  return new Set(
    partitionRows
      .map((row) => row?.leader_node_id)
      .filter((id) => typeof id === 'string' && id.length > ZERO),
  );
}

// Wait for the policy-driven split: at least MIN_PARTITION_COUNT settled
// children with no transitional parent left. While the table is still
// single-partition a bounded trickle of sentinel rows keeps
// write-activity split evaluation firing.
async function waitForManagedSplit(nodes, seedNode, deps) {
  const deadline = Date.now() + deps.splitWaitTimeoutMs;
  let sentinelCount = ZERO;
  let lastRows = [];
  while (Date.now() < deadline) {
    const allRows =
      await helpers.queryRowsAcrossNodes(nodes, SQL.SELECT_PARTITIONS);
    lastRows = selectSettledPartitionRows(allRows);
    if (lastRows.length >= MIN_PARTITION_COUNT &&
        allRows.length === lastRows.length) {
      return {partitionRows: lastRows, sentinelCount};
    }
    if (lastRows.length < MIN_PARTITION_COUNT &&
        sentinelCount < MAX_SENTINEL_ROWS) {
      const sentinel = buildSentinelRow(sentinelCount);
      await seedNode.query(SQL.INSERT_ROW, [
        sentinel.id, sentinel.accountId, sentinel.amountCents,
        sentinel.flagged, sentinel.pad,
      ]);
      sentinelCount += ONE;
    }
    await deps.sleep(SPREAD_POLL_MS);
  }
  throw new Error(
    `${SCENARIO_NAME}: no managed split within ` +
    `${deps.splitWaitTimeoutMs}ms: ` +
    JSON.stringify(lastRows),
  );
}

function replicaHostsByPartition(serviceRows, partitionIds) {
  const hosts = new Map();
  for (const partitionId of partitionIds) {
    hosts.set(partitionId, new Set());
  }
  for (const row of serviceRows) {
    const partitionId = row?.partition_id;
    const nodeId = row?.node_id;
    if (hosts.has(partitionId) &&
        typeof nodeId === 'string' && nodeId.length > ZERO) {
      hosts.get(partitionId).add(nodeId);
    }
  }
  return hosts;
}

function replicaSpreadSupported(hostsByPartition) {
  for (const hosts of hostsByPartition.values()) {
    if (hosts.size < MIN_DISTINCT_REPLICA_HOSTS) {
      return false;
    }
  }
  return hostsByPartition.size > ZERO;
}

// Leader spread is only achievable once every settled child has
// replicas on at least two distinct hosts; gate on that first so a
// leader-spread timeout can never mask a replica-placement failure.
async function waitForReplicaSpreadSupport(nodes, deps) {
  const deadline = Date.now() + deps.replicaSpreadTimeoutMs;
  let lastHosts = new Map();
  while (Date.now() < deadline) {
    const partitionRows = selectSettledPartitionRows(
      await helpers.queryRowsAcrossNodes(nodes, SQL.SELECT_PARTITIONS));
    const partitionIds = partitionRows
      .map((row) => row?.partition_id)
      .filter((id) => typeof id === 'string' && id.length > ZERO);
    const serviceRows =
      await helpers.queryRowsAcrossNodes(nodes, SQL.SELECT_SERVICES);
    lastHosts = replicaHostsByPartition(serviceRows, partitionIds);
    if (partitionRows.length >= MIN_PARTITION_COUNT &&
        replicaSpreadSupported(lastHosts)) {
      return lastHosts;
    }
    await deps.sleep(SPREAD_POLL_MS);
  }
  const summary = [...lastHosts.entries()]
    .map(([partitionId, hosts]) => `${partitionId}:${hosts.size}`)
    .join(',');
  throw new Error(
    `${SCENARIO_NAME}: replica placement never supported leader ` +
    `spread within ${deps.replicaSpreadTimeoutMs}ms ` +
    `(distinct replica hosts per partition: ${summary})`,
  );
}

// The measured gate: the PLATFORM must move child leaders apart. The
// spread must hold with an identical partition/leader fingerprint
// across consecutive polls so a mid-handoff window is never frozen into
// the measured topology.
async function waitForLeaderSpread(nodes, deps) {
  const deadline = Date.now() + deps.leaderSpreadTimeoutMs;
  let lastRows = [];
  let stableFingerprint = null;
  let stableCount = ZERO;
  while (Date.now() < deadline) {
    const allRows =
      await helpers.queryRowsAcrossNodes(nodes, SQL.SELECT_PARTITIONS);
    lastRows = selectSettledPartitionRows(allRows);
    if (lastRows.length >= MIN_PARTITION_COUNT &&
        allRows.length === lastRows.length &&
        distinctLeaderHosts(lastRows).size >= MIN_DISTINCT_LEADER_HOSTS) {
      const fingerprint = topologyFingerprint(lastRows);
      stableCount = fingerprint === stableFingerprint ?
        stableCount + ONE :
        ONE;
      stableFingerprint = fingerprint;
      if (stableCount >= TOPOLOGY_STABLE_READBACKS) {
        return {fingerprint, partitionRows: lastRows};
      }
    } else {
      stableFingerprint = null;
      stableCount = ZERO;
    }
    await deps.sleep(SPREAD_POLL_MS);
  }
  throw new Error(
    `${SCENARIO_NAME}: user-table leader placement never spread ` +
    `across >= ${MIN_DISTINCT_LEADER_HOSTS} hosts within ` +
    `${deps.leaderSpreadTimeoutMs}ms (leaders on ` +
    `${distinctLeaderHosts(lastRows).size} host(s)): ` +
    JSON.stringify(lastRows),
  );
}

// The hysteresis gate: once spread is reached, no surviving partition's
// leader may move — that is the flapping the cure's deadband and
// one-directional bound must prevent. A partition ROW disappearing is
// not a flap: a dissolving split parent lingers readable in state
// NORMAL through its final window (witnessed live: run
// user-table-leader-placement-spread-20260810T193638Z froze a 3-row
// set, then the parent dissolved mid-hold while both child leaders
// stayed put), so the hold compares leaders on the surviving
// intersection and re-asserts spread on each current set.
async function assertLeaderSpreadHolds(nodes, frozen, deps) {
  let previousLeaders = new Map(frozen.partitionRows.map((row) =>
    [row.partition_id, row.leader_node_id]));
  let lastRows = frozen.partitionRows;
  for (let poll = ZERO; poll < deps.stabilityHoldPolls; poll += ONE) {
    await deps.sleep(SPREAD_POLL_MS);
    const rows = selectSettledPartitionRows(
      await helpers.queryRowsAcrossNodes(nodes, SQL.SELECT_PARTITIONS));
    for (const row of rows) {
      const previousLeader = previousLeaders.get(row?.partition_id);
      if (previousLeader !== undefined &&
          previousLeader !== row?.leader_node_id) {
        throw new Error(
          `${SCENARIO_NAME}: leader placement flapped during the ` +
          `stability hold (poll ${poll + ONE}/` +
          `${deps.stabilityHoldPolls}): ${row?.partition_id} leader ` +
          `${previousLeader} -> ${row?.leader_node_id}`,
        );
      }
    }
    if (rows.length < MIN_PARTITION_COUNT ||
        distinctLeaderHosts(rows).size < MIN_DISTINCT_LEADER_HOSTS) {
      throw new Error(
        `${SCENARIO_NAME}: leader spread was lost during the ` +
        `stability hold (poll ${poll + ONE}/` +
        `${deps.stabilityHoldPolls}): ` +
        JSON.stringify(rows),
      );
    }
    previousLeaders = new Map(rows.map((row) =>
      [row.partition_id, row.leader_node_id]));
    lastRows = rows;
  }
  return lastRows;
}

function composeTopologyDetail(partitionRows, hostsByPartition) {
  const partitions = partitionRows.map((row) => ({
    leaderNodeId: row?.leader_node_id,
    partitionId: row?.partition_id,
    replicaHostCount:
      hostsByPartition.get(row?.partition_id)?.size ?? ZERO,
  }));
  return {
    distinctLeaderHosts: distinctLeaderHosts(partitionRows).size,
    partitions,
  };
}

export async function run(cluster) {
  const nodes = cluster.getNodes();
  assert.ok(
    Array.isArray(nodes) && nodes.length >= MIN_NODE_COUNT,
    `${SCENARIO_NAME} requires a ${MIN_NODE_COUNT}-node cluster`,
  );
  const deps = resolveScenarioDependencies(cluster);
  const seedNode = nodes.find((node) => node.role === 'seed') ||
    nodes[ZERO];

  // Data substrate: table, split-friendly policies, deterministic
  // dataset sized for exactly one managed split. Setup writes retry
  // transient post-boot settling; measured phases do not.
  const rows = generateDatasetRows();
  await helpers.retryTransientAdminQuery(deps, 'create-table',
    () => seedNode.query(SQL.CREATE_TABLE));
  const tableId = await helpers.retryTransientAdminQuery(
    deps, 'resolve-table-id', () => helpers.resolveTableId(seedNode));
  await helpers.applySplitPolicies(seedNode, tableId, deps);
  await helpers.waitForTableWriteReadiness(nodes, deps);
  await helpers.seedDataset(seedNode, rows, deps);

  // Measured phases: split, replica-spread support, then the platform
  // spreading the child leaders — and holding them spread.
  const split = await waitForManagedSplit(nodes, seedNode, deps);
  const hostsByPartition = await waitForReplicaSpreadSupport(nodes, deps);
  const spread = await waitForLeaderSpread(nodes, deps);
  const heldRows = await assertLeaderSpreadHolds(nodes, spread, deps);

  const topology =
    composeTopologyDetail(heldRows, hostsByPartition);
  assert.ok(
    topology.distinctLeaderHosts >= MIN_DISTINCT_LEADER_HOSTS,
    `${SCENARIO_NAME}: final topology lost leader spread`,
  );
  return {
    leaderFingerprint: spread.fingerprint,
    schemaVersion: REPORT_DETAIL_SCHEMA_VERSION,
    sentinelRowCount: split.sentinelCount,
    stabilityHoldPolls: deps.stabilityHoldPolls,
    tableName: TABLE_NAME,
    topology,
  };
}
