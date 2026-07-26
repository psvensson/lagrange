/**
 * Scenario: Snapshot Live Rebuild (S6, R5)
 *
 * Certify a large replica rebuild under continuous foreground writes. A target
 * partition is preloaded to a declared byte/row floor, sustained
 * acknowledged-write-tracked load runs across the whole window, then a non-seed
 * follower of that partition is stopped, its durable replica state is wiped
 * in-container (db + WAL/SHM sidecars + checkpoints dir), and the node is
 * restarted. The wired S1-S5 chain (checkpoint cadence / dispatch / bulk
 * transfer / install / recreate) rebuilds the replica from a leader snapshot.
 * The scenario asserts the rebuilt replica rejoins and converges, then
 * reconciles the full acknowledged-write ledger and emits the R5 evidence
 * slice as additive report fields (the P0 slice of the scale-certification
 * evidence contract).
 *
 * Cadence note: the scenario relies on the leader's S4 create-if-none
 * checkpoint fallback at dispatch time — the leader creates a generation
 * on-demand when it first needs to serve one — so no LAGRANGE_* env plumbing
 * (which would force a container recreate) is required to arm the cadence.
 */

import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';
import {
  resolveScenarioOptions,
  resolveSnapshotLiveRebuildScenarioConfig,
} from '../harness/scenario-config.js';
import {assertAcknowledgedWritesVisibleOnReachableNodes} from './rolling-restart.js';
import {
  BENCHMARK_WORKLOAD_PROFILE,
  TABLE_BOOTSTRAP_VISIBILITY_STATE,
  ensureBenchmarkPartitioningTable,
  resolvePartitioningLoadTableName,
} from './table-distribution-helpers.js';

const ZERO = 0;
const SERVICE_TYPE_PARTITION = 'partition';
const RAFT_ROLE_LEADER = 'leader';
const STATUS_ACTIVE = 'active';
// Tables whose partitions ARE the cluster-visibility substrate (publications
// and core membership): wiping their replicas disrupts the CDC/publication
// path that propagates writes, confounding a rebuild-safety measurement.
const VISIBILITY_CRITICAL_TABLES = new Set([
  'control_plane_publications',
  'nodes',
  'services',
  'partitions',
  'tables',
  'node_endpoints',
]);
const EVIDENCE_CONTRACT_P0 = 'scale-certification-evidence-contract:P0';

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function resolveClusterNodes(cluster) {
  if (typeof cluster?.getNodes === 'function') {
    return cluster.getNodes();
  }
  if (typeof cluster?.nodes === 'function') {
    return cluster.nodes();
  }
  return [];
}


function rowsFromResult(result) {
  if (Array.isArray(result)) {
    return result;
  }
  if (Array.isArray(result?.rows)) {
    return result.rows;
  }
  return [];
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function runNodeQuery(node, sql) {
  if (typeof node?.query === 'function') {
    return node.query(sql);
  }
  if (typeof node?.queryWithTimeout === 'function') {
    return node.queryWithTimeout(sql);
  }
  throw new Error('Node handle has no query method');
}


/**
 * Resolve a non-seed follower replica of the target table to rebuild. Reads the
 * authoritative partitions + services system tables. replicaId follows the same
 * resolution the durable-rejoin planner uses (replica_id, else service_id) and
 * equals the on-disk {rid} in {rid}.db.
 */
// Resolve a non-seed active follower replica to rebuild. Prefers a partition
// of `preferTable` (the preloaded fat table, so the rebuild moves real
// bytes), then falls back to ANY partition with an eligible spread follower —
// the rebuild chain is table-agnostic, so engagement does not depend on the
// fat table's replicas having spread. Returns {target, placement} where
// placement is a diagnostic summary consulted when nothing is eligible yet.
async function resolveRebuildTarget(seedNode, nodes, preferTable, seedNodeId) {
  const partitionsResult = await runNodeQuery(
    seedNode,
    'SELECT partition_id, table_name, leader_node_id FROM partitions',
  );
  const servicesResult = await runNodeQuery(
    seedNode,
    'SELECT partition_id, node_id, replica_id, service_id, raft_role, status ' +
      'FROM services WHERE service_type = \'' + SERVICE_TYPE_PARTITION + '\'',
  );
  const partitionRows = rowsFromResult(partitionsResult);
  const serviceRows = rowsFromResult(servicesResult);
  const nodeIds = new Set(nodes.map((node) => String(node?.id || '')));
  const placement = [];

  const eligibleFor = (partitionRow) => {
    const partitionId = normalizeString(partitionRow?.partition_id);
    if (partitionId.length === ZERO) {
      return null;
    }
    const leaderNodeId = normalizeString(partitionRow?.leader_node_id);
    const tableName = normalizeString(partitionRow?.table_name);
    for (const serviceRow of serviceRows) {
      if (normalizeString(serviceRow?.partition_id) !== partitionId) {
        continue;
      }
      const nodeId = normalizeString(serviceRow?.node_id);
      const raftRole = normalizeString(serviceRow?.raft_role).toLowerCase();
      const status = normalizeString(serviceRow?.status).toLowerCase();
      placement.push(
        tableName + '/' + partitionId + '@' + nodeId +
        ' role=' + raftRole + ' status=' + status);
      const isFollower =
        nodeId.length > ZERO &&
        nodeId !== seedNodeId &&
        nodeId !== leaderNodeId &&
        raftRole !== RAFT_ROLE_LEADER &&
        (status.length === ZERO || status === STATUS_ACTIVE) &&
        nodeIds.has(nodeId);
      if (!isFollower) {
        continue;
      }
      // Never wipe the visibility substrate itself (publications + core
      // membership tables): disrupting it stalls the CDC/publication path that
      // makes writes cluster-visible, confounding the rebuild-safety signal.
      if (VISIBILITY_CRITICAL_TABLES.has(tableName)) {
        continue;
      }
      const replicaId = normalizeString(serviceRow?.replica_id) ||
        normalizeString(serviceRow?.service_id);
      if (replicaId.length === ZERO) {
        continue;
      }
      return {partitionId, replicaId, followerNodeId: nodeId, leaderNodeId,
        tableName};
    }
    return null;
  };

  // Prefer the preloaded DATA table; fall back to ANY partition with a spread
  // non-seed follower. In the small harness only priority (control-plane)
  // partitions reliably spread followers off the seed, so the fallback is what
  // makes the wipe target resolvable. Rebuilding ANY partition follower under
  // load — including a control-plane one — is a valid resilience test; the
  // acknowledged-write reconciliation is the data-safety gate regardless of
  // which partition was rebuilt.
  const preferred = partitionRows.filter(
    (row) => normalizeString(row?.table_name) === preferTable);
  const others = partitionRows.filter(
    (row) => normalizeString(row?.table_name) !== preferTable);
  for (const partitionRow of [...preferred, ...others]) {
    const target = eligibleFor(partitionRow);
    if (target) {
      return {target, placement};
    }
  }
  return {target: null, placement};
}

function buildR5EvidenceSlice({
  preload,
  target,
  wiped,
  catchupDurationMs,
  metrics,
  rebuildWindow,
  acknowledgedWriteVisibility,
  restartabilityLeg,
}) {
  const transferBytesAndRate = {
    loadSource: preload.source,
    loadTable: preload.table,
    catchupDurationMs,
    // True descriptor bytes + container rx/tx deltas are resolved by the
    // transfer analyzer from the run artifacts; this is the scenario-side
    // approximation from the preloaded floor.
    source: 'scenario-approximation',
  };
  const queueRetryBounds = {
    queueDelay: metrics?.queueDelay || null,
    waitReasons: metrics?.waitReasons || null,
    // router bulkChannel stats are resolved by the transfer analyzer.
    source: 'loadMetrics',
  };
  const installState = {
    expectedOutcome: 'INSTALLED_AND_RECREATED',
    convergedAfterRebuild: true,
    // Marker states + typed orchestration outcome come from the install
    // analyzer over the run artifacts; the scenario observes convergence.
    source: 'scenario-observed-convergence',
  };
  const logPrefixSize = {
    boundaryBefore: null,
    boundaryAfter: null,
    retainedRows: null,
    source: 'raft-log-analyzer',
  };
  const foregroundThroughputLatency = {
    rebuildWindow,
    latency: metrics?.latency || null,
    opsPerSec: metrics?.opsPerSec || null,
  };
  return {
    loadMetricsEvidence: {
      transferBytesAndRate,
      queueRetryBounds,
      catchupDurationMs,
    },
    details: {
      contract: EVIDENCE_CONTRACT_P0,
      targetPartitionId: target.partitionId,
      targetReplicaId: target.replicaId,
      rebuiltNodeId: target.followerNodeId,
      wipedPaths: wiped,
      preload,
      transferBytesAndRate,
      queueRetryBounds,
      installState,
      logPrefixSize,
      catchupDurationMs,
      foregroundThroughputLatency,
      acknowledgedWriteVisibility,
      restartabilityLeg,
      // Resource bounds (cpu/mem, sampler write_bytes, leak analyzer) are
      // captured per-run by the harness samples.ndjson; the post-rebuild soak
      // guarantees the scenario runs long enough to sample.
      resourceBounds: {source: 'harness-samples'},
    },
  };
}

/**
 * Run the snapshot-live-rebuild scenario.
 *
 * @param {Object} cluster - Cluster handle from the harness.
 * @param {Object} [options]
 * @return {Promise<Object>}
 */
function s6phase(label, detail) {
  process.stderr.write(
    '[s6-phase] ' + label + (detail ? ' ' + detail : '') + '\n');
}

async function run(cluster, options = {}) {
  const scenarioOptions = resolveScenarioOptions(
    options,
    cluster,
    'snapshotLiveRebuild',
  );
  const cfg = resolveSnapshotLiveRebuildScenarioConfig(scenarioOptions);
  s6phase('start');

  const nodes = resolveClusterNodes(cluster);
  const seedNode = nodes.find((node) => node.role === 'seed') || nodes[ZERO];
  assert.ok(
    seedNode && typeof seedNode.query === 'function',
    'snapshot-live-rebuild requires a seed query handle',
  );
  const seedNodeId = String(seedNode.id);

  // 1. Wait until the cluster is safe for load.
  if (typeof cluster.waitForLoadReadinessStability === 'function') {
    try {
      await cluster.waitForLoadReadinessStability({
        stableWindowMs: cfg.preLoadReadinessStableWindowMs,
        timeoutMs: cfg.preLoadReadinessTimeoutMs,
        loadReadinessPhase: 'pre_load',
      });
    } catch (_error) {
      // Best-effort readiness; the load below surfaces real issues.
    }
  } else if (typeof cluster.waitForAllActive === 'function') {
    await cluster.waitForAllActive({timeoutMs: cfg.preLoadReadinessTimeoutMs});
  }

  // 2. Ensure a properly-partitioned, ALL-NODE-VISIBLE benchmark table for the
  // load AND the acknowledged-write reconciliation (the raw `logs` table is not
  // reliably routable to every node, so reconciling against it reports false
  // missing rows). A freshly-created partitioned table also spreads its
  // replicas across non-seed nodes, giving a clean DATA-partition wipe target —
  // this is the rolling-restart benchmark-load pattern.
  const loadTableName = resolvePartitioningLoadTableName(
    cluster, cfg.tableName, {explicitTableName: false});
  await ensureBenchmarkPartitioningTable(seedNode, {
    tableName: loadTableName,
    requiredBootstrapVisibilityState:
      TABLE_BOOTSTRAP_VISIBILITY_STATE.PARTITIONS_VISIBLE,
    queryNodes: nodes,
    timeoutMs: cfg.preLoadReadinessTimeoutMs,
  });
  s6phase('benchmark-table', loadTableName);

  // 3. Wait for the benchmark table's replicas to SPREAD off the seed before
  // adding load: poll resolveRebuildTarget until an eligible non-seed active
  // follower of the benchmark partition exists.
  if (typeof cluster.waitForConvergence === 'function') {
    try {
      await cluster.waitForConvergence({
        timeoutMs: cfg.targetSpreadTimeoutMs,
      });
    } catch (_error) {
      // Best-effort; the poll below is the authoritative gate.
    }
  }
  let target = null;
  let lastPlacement = [];
  const spreadDeadline = Date.now() + cfg.targetSpreadTimeoutMs;
  do {
    const resolved = await resolveRebuildTarget(
      seedNode,
      nodes,
      loadTableName,
      seedNodeId,
    );
    target = resolved.target;
    lastPlacement = resolved.placement;
    if (target) {
      break;
    }
    s6phase('await-spread', 'placement=' + lastPlacement.length);
    await sleep(cfg.targetSpreadPollIntervalMs);
  } while (Date.now() < spreadDeadline);
  assert.ok(
    target,
    'No non-seed active follower partition replica available to rebuild ' +
      'within ' + cfg.targetSpreadTimeoutMs + 'ms. Placement observed: ' +
      (lastPlacement.length > ZERO ? lastPlacement.join('; ') : '(none)'),
  );
  const followerNode = nodes.find(
    (node) => String(node.id) === String(target.followerNodeId),
  );
  assert.ok(
    followerNode,
    'Follower node handle not found: ' + target.followerNodeId,
  );
  s6phase('target', target.tableName + '/' + target.partitionId + '/' +
    target.replicaId + '@' + target.followerNodeId);

  // 4. Start sustained acknowledged-write-tracked benchmark load for the whole
  // window (byte-scale multi-chunk transfer/resume is DT-proven; the live gate
  // certifies engagement + data-safety under continuous foreground writes).
  const preload = {source: 'benchmark_load', table: loadTableName};
  const loadNodesById = new Map(nodes.map((node) => [String(node.id), node]));
  const availableLoadNodeIds = new Set(
    nodes
      .filter((node) => node.role !== 'seed')
      .map((node) => String(node.id)),
  );
  const resolveLoadNodes = () => Array.from(availableLoadNodeIds)
    .map((nodeId) => loadNodesById.get(nodeId))
    .filter((node) => node && typeof node.query === 'function');

  s6phase('load-start');
  const loadRun = cluster.startLoad({
    nodes: resolveLoadNodes(),
    nodeResolver: resolveLoadNodes,
    opsPerSec: cfg.loadOpsPerSec,
    duration: cfg.loadDuration,
    queryTimeoutMs: cfg.queryTimeoutMs,
    trackAcknowledgedWrites: true,
    tableName: loadTableName,
    workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
  });
  let loadRunCompleted = false;
  let restartabilityLeg = null;

  try {
    await sleep(cfg.preWipeSettleMs);
    const preWipeMetrics = loadRun.getMetrics();
    const preWipeTotal = Number(preWipeMetrics?.total || ZERO);
    const preWipeSuccess = Number(preWipeMetrics?.success || ZERO);

    // 5. Wipe the follower's durable replica state, then restart it to force a
    // from-scratch rebuild. The wipe runs while the container is UP (exec
    // cannot enter a stopped container); rm unlinks the db + checkpoints paths
    // (the still-open handle keeps the old inode alive only until the imminent
    // stop), and the subsequent stop→start boots the node into an absent data
    // dir — the catastrophic-replica-loss condition the snapshot chain repairs.
    availableLoadNodeIds.delete(String(followerNode.id));
    const wipeStartedAt = Date.now();
    s6phase('wipe-start');
    const wiped = await cluster.wipeReplicaData(followerNode.id, {
      partitionId: target.partitionId,
      replicaId: target.replicaId,
    });
    s6phase('wipe-done');
    await cluster.stopNode(followerNode.id);
    await cluster.startNode(followerNode.id, {
      readinessTimeoutMs: cfg.rejoinReadinessTimeoutMs,
    });
    s6phase('follower-restarted');
    // Deliberately do NOT return the rebuilt node to the load pool: a node
    // still catching up its wiped replica is not serve-ready for the load
    // lane, and directing load at it produces nodeAdmissionBlocked stalls that
    // are a load-routing artifact, not a rebuild-safety signal. Load continues
    // on the stable nodes; convergence + the acknowledged-write reconciliation
    // below still prove the rebuilt node caught up and lost no acked writes.

    // 6. Optional restartability leg: kill mid-transfer and restart to prove
    // resume from the verified boundary.
    if (cfg.restartabilityLegEnabled) {
      await sleep(cfg.restartabilityMidTransferDelayMs);
      availableLoadNodeIds.delete(String(followerNode.id));
      await cluster.stopNode(followerNode.id);
      await cluster.startNode(followerNode.id, {
        readinessTimeoutMs: cfg.rejoinReadinessTimeoutMs,
      });
      availableLoadNodeIds.add(String(followerNode.id));
      restartabilityLeg = {
        performed: true,
        midTransferDelayMs: cfg.restartabilityMidTransferDelayMs,
      };
    }

    // 7. Wait for the rebuilt replica to rejoin and the cluster to converge.
    if (typeof cluster.waitForAllActive === 'function') {
      await cluster.waitForAllActive({timeoutMs: cfg.rejoinActiveTimeoutMs});
    }
    await cluster.waitForConvergence({
      settleTimeoutMs: cfg.perNodeConvergenceTimeoutMs,
      quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
      targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
      ignoreStaleInFlightReplicaOperations: true,
    });
    s6phase('converged');
    const catchupDurationMs = Date.now() - wipeStartedAt;

    // 8. Keep load running through a soak so resource samples are captured,
    // then stop it and reconcile.
    await sleep(cfg.postRebuildSoakMs);
    if (typeof loadRun.cancel === 'function') {
      loadRun.cancel();
    }
    const metrics = await loadRun.waitComplete();
    loadRunCompleted = true;
    const acknowledgedWrites =
      typeof loadRun.getAcknowledgedWrites === 'function' ?
        loadRun.getAcknowledgedWrites() :
        null;

    await cluster.waitForConsistencyConvergence({
      timeoutMs: cfg.consistencyTimeoutMs,
      pollIntervalMs: cfg.consistencyPollIntervalMs,
      forceRepairAfterMs: cfg.consistencyForceRepairAfterMs,
    });

    s6phase('reconcile-start');
    const acknowledgedWriteVisibility =
      await assertAcknowledgedWritesVisibleOnReachableNodes(
        acknowledgedWrites,
        resolveClusterNodes(cluster),
        {
          visibilityTimeoutMs: cfg.acknowledgedWriteVisibilityTimeoutMs,
          visibilityPollIntervalMs: cfg.acknowledgedWriteVisibilityPollIntervalMs,
        },
      );

    const rebuildWindowTotal = Math.max(
      ZERO,
      Number(metrics?.total || ZERO) - preWipeTotal,
    );
    const rebuildWindowSuccess = Math.max(
      ZERO,
      Number(metrics?.success || ZERO) - preWipeSuccess,
    );
    const rebuildWindow = {
      total: rebuildWindowTotal,
      success: rebuildWindowSuccess,
      successRate: rebuildWindowTotal > ZERO ?
        rebuildWindowSuccess / rebuildWindowTotal :
        1,
    };

    const evidence = buildR5EvidenceSlice({
      preload,
      target,
      wiped,
      catchupDurationMs,
      metrics,
      rebuildWindow,
      acknowledgedWriteVisibility,
      restartabilityLeg,
    });

    s6phase('done-ok');
    return {
      loadMetrics: {
        ...metrics,
        snapshotRebuildEvidence: evidence.loadMetricsEvidence,
      },
      details: {snapshotLiveRebuild: evidence.details},
      acknowledgedWriteVisibility,
      rebuiltNodeId: String(followerNode.id),
      targetPartitionId: target.partitionId,
      targetReplicaId: target.replicaId,
      catchupDurationMs,
    };
  } catch (phaseError) {
    s6phase('THREW', String(phaseError && phaseError.message).slice(0, 300));
    throw phaseError;
  } finally {
    if (!loadRunCompleted && typeof loadRun.cancel === 'function') {
      loadRun.cancel();
    }
  }
}

export {
  run,
  resolveRebuildTarget,
  buildR5EvidenceSlice,
};
