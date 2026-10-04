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
 *
 * The measured phases start only after a cluster-wide leader-quiescence
 * hold: the cure must move leadership away from a HEALTHY stable leader
 * (quest user-table-leader-handoff-demotion-pairing). Runs that split
 * during the formation tail let ambient election churn hand the
 * directed election a free win, masking the paired-demotion mechanism
 * this scenario is sealed to certify (run 20260810T221340Z: a stable
 * seed absorbed two completed handoff dispatches with zero campaigns).
 */

import assert from 'node:assert/strict';
import {
  buildSentinelRow,
  generateDatasetRows,
} from './public-path-baseline-helpers.js';
import {
  buildUserActivityTableSql,
  createTableTopologyHelpers,
  topologyFingerprint,
} from './user-table-topology-helpers.js';
import {
  PARTITION_ROLE,
  buildGateRecord,
  describeGateFailure,
  evaluateSplitSpreadClaim,
} from '../harness/scenario-ground-truth.js';
import {
  createScenarioStepRunner,
  recordScenarioGate,
} from '../harness/scenario-step-log.js';

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
// Pre-phase leader quiescence: the WHOLE cluster's partition-leader
// fingerprint must hold unchanged this many consecutive polls before
// the data substrate is even created, so the cure later fires against
// healthy stable leaders instead of riding formation-tail churn. The
// timeout mirrors the leader-spread budget: a cold boot legitimately
// churns for minutes before settling.
const QUIESCENCE_POLL_MS = 1000;
const QUIESCENCE_STABLE_POLLS = 30;
const QUIESCENCE_TIMEOUT_MS = 420_000;
const REPORT_DETAIL_SCHEMA_VERSION = 2;

// What each measured gate claims (module docstring), stated as explicit
// ground-truth conditions (scenario-ground-truth): HOSTS are the
// harness's provider placement, replicas are active voters, and the
// managed split is complete only once the parent is dissolved.
const MANAGED_SPLIT_CLAIM = Object.freeze({
  minChildren: MIN_PARTITION_COUNT,
  minDistinctLeaderHosts: ZERO,
  minReplicaHostsPerChild: ZERO,
  requireChildLeader: false,
  requireParentDissolved: true,
  requirePolicyReplicaCount: false,
});
const REPLICA_SPREAD_CLAIM = Object.freeze({
  ...MANAGED_SPLIT_CLAIM,
  minReplicaHostsPerChild: MIN_DISTINCT_REPLICA_HOSTS,
});
const LEADER_SPREAD_CLAIM = Object.freeze({
  ...REPLICA_SPREAD_CLAIM,
  minDistinctLeaderHosts: MIN_DISTINCT_LEADER_HOSTS,
  requireChildLeader: true,
});
const GATE = Object.freeze({
  LEADER_SPREAD: 'leader-spread',
  LEADER_SPREAD_HOLD: 'leader-spread-hold',
  MANAGED_SPLIT: 'managed-split',
  REPLICA_SPREAD_SUPPORT: 'replica-spread-support',
});

const SQL = Object.freeze({
  ...buildUserActivityTableSql(TABLE_NAME),
  // Cluster-wide leader census for the pre-phase quiescence hold: the
  // formation tail lives in SYSTEM partitions, so the hold must sweep
  // every partition, not the (not-yet-existing) scenario table's.
  SELECT_ALL_PARTITIONS:
    'SELECT partition_id, leader_node_id, state FROM partitions',
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
    now: overrides.now || Date.now,
    sleep: overrides.sleep || defaultSleep,
    splitWaitTimeoutMs: Number.isInteger(overrides.splitWaitTimeoutMs) ?
      overrides.splitWaitTimeoutMs :
      SPLIT_WAIT_TIMEOUT_MS,
    stabilityHoldPolls: Number.isInteger(overrides.stabilityHoldPolls) ?
      overrides.stabilityHoldPolls :
      STABILITY_HOLD_POLLS,
    quiescenceStablePolls: Number.isInteger(overrides.quiescenceStablePolls) ?
      overrides.quiescenceStablePolls :
      QUIESCENCE_STABLE_POLLS,
    quiescenceTimeoutMs: Number.isInteger(overrides.quiescenceTimeoutMs) ?
      overrides.quiescenceTimeoutMs :
      QUIESCENCE_TIMEOUT_MS,
  };
}

// Cluster-wide leader quiescence: every partition's leader assignment
// (system partitions included — they are the formation tail) must hold
// an identical fingerprint across consecutive polls. Returns the held
// fingerprint and how long the hold took, for the report detail.
async function waitForClusterLeaderQuiescence(nodes, deps) {
  const startedAtMs = Date.now();
  const deadline = startedAtMs + deps.quiescenceTimeoutMs;
  let fingerprint = null;
  let stableCount = ZERO;
  while (Date.now() < deadline) {
    const rows = await helpers.queryRowsAcrossNodes(
      nodes, SQL.SELECT_ALL_PARTITIONS);
    const current = topologyFingerprint(rows);
    stableCount = rows.length > ZERO && current === fingerprint ?
      stableCount + ONE :
      ONE;
    fingerprint = current;
    if (rows.length > ZERO && stableCount >= deps.quiescenceStablePolls) {
      return {
        fingerprint,
        holdMs: Date.now() - startedAtMs,
        stablePolls: stableCount,
      };
    }
    await deps.sleep(QUIESCENCE_POLL_MS);
  }
  throw new Error(
    `${SCENARIO_NAME}: cluster leaders never went quiescent for ` +
    `${deps.quiescenceStablePolls} consecutive polls within ` +
    `${deps.quiescenceTimeoutMs}ms (last fingerprint: ${fingerprint})`,
  );
}

function claimGate(deps, name, claim, budgetMs, extra = {}) {
  return {
    budgetMs,
    claim,
    name,
    now: deps.now,
    pollMs: SPREAD_POLL_MS,
    sleep: deps.sleep,
    stableReadbacks: TOPOLOGY_STABLE_READBACKS,
    ...extra,
  };
}

// Wait for the policy-driven split: at least MIN_PARTITION_COUNT children
// and the parent dissolved (a lingering parent reads state NORMAL until
// dissolution, so a state filter cannot tell it from a child). While the
// table is still single-partition a bounded trickle of sentinel rows
// keeps write-activity split evaluation firing.
async function waitForManagedSplit(cluster, nodes, seedNode, deps) {
  let sentinelCount = ZERO;
  const proven = await helpers.waitForSplitClaim(cluster, nodes, claimGate(
    deps, GATE.MANAGED_SPLIT, MANAGED_SPLIT_CLAIM, deps.splitWaitTimeoutMs, {
      onReadback: async (evaluation) => {
        const current = evaluation.partitions
          .filter((entry) => entry.role !== PARTITION_ROLE.PARENT).length;
        if (current < MIN_PARTITION_COUNT &&
            sentinelCount < MAX_SENTINEL_ROWS) {
          const sentinel = buildSentinelRow(sentinelCount);
          await seedNode.query(SQL.INSERT_ROW, [
            sentinel.id, sentinel.accountId, sentinel.amountCents,
            sentinel.flagged, sentinel.pad,
          ]);
          sentinelCount += ONE;
        }
      },
    }));
  return {...proven, sentinelCount};
}

// Leader spread is only achievable once every child has ACTIVE VOTERS on
// at least two distinct hosts; gate on that first so a leader-spread
// timeout can never mask a replica-placement failure.
async function waitForReplicaSpreadSupport(cluster, nodes, deps,
  knownParentIds) {
  const proven = await helpers.waitForSplitClaim(cluster, nodes, claimGate(
    deps, GATE.REPLICA_SPREAD_SUPPORT, REPLICA_SPREAD_CLAIM,
    deps.replicaSpreadTimeoutMs, {knownParentIds}));
  return new Map(proven.record.partitions.map((entry) =>
    [entry.partitionId, entry.activeVoterHosts.hosts.length]));
}

function childLeaderRows(record) {
  return record.partitions
    .filter((entry) => entry.role === PARTITION_ROLE.CHILD)
    .map((entry) => ({
      leader_node_id: entry.leader.nodeId,
      partition_id: entry.partitionId,
    }));
}

// The measured gate: the PLATFORM must move child leaders apart onto
// distinct HOSTS, holding across consecutive identical readbacks so a
// mid-handoff window is never frozen into the measured topology.
async function waitForLeaderSpread(cluster, nodes, deps, knownParentIds) {
  const proven = await helpers.waitForSplitClaim(cluster, nodes, claimGate(
    deps, GATE.LEADER_SPREAD, LEADER_SPREAD_CLAIM,
    deps.leaderSpreadTimeoutMs, {knownParentIds}));
  const partitionRows = childLeaderRows(proven.record);
  return {
    fingerprint: topologyFingerprint(partitionRows),
    hostIndex: proven.hostIndex,
    partitionRows,
    record: proven.record,
  };
}

function leaderFlap(previousLeaders, evaluation) {
  for (const entry of evaluation.partitions) {
    const previousLeader = previousLeaders.get(entry.partitionId);
    if (entry.role === PARTITION_ROLE.CHILD && previousLeader !== undefined &&
        previousLeader !== entry.leader.nodeId) {
      return `${entry.partitionId} leader ${previousLeader} -> ` +
        String(entry.leader.nodeId);
    }
  }
  return null;
}

function holdGateRecord(frozen, evaluation, outcome, deps) {
  return buildGateRecord({
    budgetMs: deps.stabilityHoldPolls * SPREAD_POLL_MS,
    claim: LEADER_SPREAD_CLAIM,
    gate: GATE.LEADER_SPREAD_HOLD,
    hostIndex: frozen.hostIndex,
    outcome: {evaluation, unmetTally: {}, ...outcome},
    stableReadbacksRequired: deps.stabilityHoldPolls,
  });
}

// The hysteresis gate: once spread is reached, no child's leader may
// move - that is the flapping the cure's deadband and one-directional
// bound must prevent - and the full leader-spread claim (children only,
// parent dissolved, leaders on distinct hosts) must hold on every poll.
async function assertLeaderSpreadHolds(cluster, nodes, frozen, deps,
  knownParentIds) {
  const startedAtMs = deps.now();
  let previousLeaders = new Map(frozen.partitionRows.map((row) =>
    [row.partition_id, row.leader_node_id]));
  let evaluation = frozen.record;
  for (let poll = ZERO; poll < deps.stabilityHoldPolls; poll += ONE) {
    await deps.sleep(SPREAD_POLL_MS);
    const truth = await helpers.readSplitGroundTruth(nodes);
    evaluation = evaluateSplitSpreadClaim({
      claim: LEADER_SPREAD_CLAIM, hostIndex: frozen.hostIndex,
      knownParentIds, ...truth,
    });
    const flap = leaderFlap(previousLeaders, evaluation);
    if (flap !== null || !evaluation.satisfied) {
      const record = holdGateRecord(frozen, evaluation, {
        elapsedMs: deps.now() - startedAtMs, passed: false,
        readbacks: poll + ONE, stableReadbacks: poll,
      }, deps);
      recordScenarioGate(cluster, record);
      throw new Error(
        `${SCENARIO_NAME}: leader ${flap === null ? 'spread was lost' :
          'placement flapped'} during the stability hold (poll ` +
        `${poll + ONE}/${deps.stabilityHoldPolls}` +
        `${flap === null ? '' : `: ${flap}`}): ` +
        describeGateFailure(record));
    }
    previousLeaders = new Map(evaluation.partitions.map((entry) =>
      [entry.partitionId, entry.leader.nodeId]));
  }
  recordScenarioGate(cluster, holdGateRecord(frozen, evaluation, {
    elapsedMs: deps.now() - startedAtMs, passed: true,
    readbacks: deps.stabilityHoldPolls,
    stableReadbacks: deps.stabilityHoldPolls,
  }, deps));
  return evaluation;
}

function composeTopologyDetail(evaluation, replicaHostCounts) {
  const partitions = evaluation.partitions
    .filter((entry) => entry.role === PARTITION_ROLE.CHILD)
    .map((entry) => ({
      leaderNodeId: entry.leader.nodeId,
      partitionId: entry.partitionId,
      replicaHostCount: replicaHostCounts.get(entry.partitionId) ?? ZERO,
    }));
  return {
    distinctLeaderHosts: evaluation.leaderHosts.length,
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

  const step = createScenarioStepRunner(cluster, SCENARIO_NAME, deps.now);

  // The stable-leader precondition: no data substrate exists until the
  // cluster's leader topology has held still — the cure's later target
  // is a healthy, heartbeating leader, never formation churn.
  const quiescence = await step('cluster-leader-quiescence', () =>
    waitForClusterLeaderQuiescence(nodes, deps));

  // Data substrate: table, split-friendly policies, deterministic
  // dataset sized for exactly one managed split. Setup writes retry
  // transient post-boot settling; measured phases do not.
  const rows = generateDatasetRows();
  await step('create-table', () => helpers.retryTransientAdminQuery(
    deps, 'create-table', () => seedNode.query(SQL.CREATE_TABLE)));
  const tableId = await step('resolve-table-id', () =>
    helpers.retryTransientAdminQuery(deps, 'resolve-table-id',
      () => helpers.resolveTableId(seedNode)));
  await step('apply-split-policies', () =>
    helpers.applySplitPolicies(seedNode, tableId, deps));
  await step('wait-table-write-readiness', () =>
    helpers.waitForTableWriteReadiness(nodes, deps));
  await step('seed-dataset', () => helpers.seedDataset(seedNode, rows, deps));

  // Measured phases: split, replica-spread support, then the platform
  // spreading the child leaders across hosts - and holding them spread.
  const split = await step(GATE.MANAGED_SPLIT, () =>
    waitForManagedSplit(cluster, nodes, seedNode, deps));
  const knownParentIds = split.knownParentIds;
  const replicaHostCounts = await step(GATE.REPLICA_SPREAD_SUPPORT, () =>
    waitForReplicaSpreadSupport(cluster, nodes, deps, knownParentIds));
  const spread = await step(GATE.LEADER_SPREAD, () =>
    waitForLeaderSpread(cluster, nodes, deps, knownParentIds));
  const held = await step(GATE.LEADER_SPREAD_HOLD, () =>
    assertLeaderSpreadHolds(cluster, nodes, spread, deps, knownParentIds));

  const topology = composeTopologyDetail(held, replicaHostCounts);
  assert.ok(
    topology.distinctLeaderHosts >= MIN_DISTINCT_LEADER_HOSTS,
    `${SCENARIO_NAME}: final topology lost leader spread`,
  );
  return {
    leaderFingerprint: spread.fingerprint,
    preQuiescenceHoldMs: quiescence.holdMs,
    preQuiescenceStablePolls: quiescence.stablePolls,
    schemaVersion: REPORT_DETAIL_SCHEMA_VERSION,
    sentinelRowCount: split.sentinelCount,
    stabilityHoldPolls: deps.stabilityHoldPolls,
    tableName: TABLE_NAME,
    topology,
  };
}
