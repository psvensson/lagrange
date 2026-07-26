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

const ZERO = 0;
const LOAD_LOG_COLUMNS =
  '(log_id, timestamp, level, node_id, message, created_at)';
const PRELOAD_KEY_PREFIX = 'snap-preload-';
const PRELOAD_KEY_PAD = 12;
const PRELOAD_LEVEL = 'info';
const PRELOAD_NODE_ID = 'preload';
const PRELOAD_MAX_BATCH_BYTES = 262144;
const SERVICE_TYPE_PARTITION = 'partition';
const RAFT_ROLE_LEADER = 'leader';
const STATUS_ACTIVE = 'active';
const EVIDENCE_CONTRACT_P0 = 'scale-certification-evidence-contract:P0';
const MS_PER_SECOND = 1000;

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

function escapeSql(value) {
  return String(value).replace(/'/g, '\'\'');
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

function buildPayload(payloadBytes) {
  return 'x'.repeat(Math.max(1, Math.floor(payloadBytes)));
}

/**
 * Preload one target partition's key range to the declared floor via batched
 * multi-row INSERTs over the admin lane (not the paced load lane). Keys share a
 * single contiguous zero-padded prefix so they stay inside one partition's key
 * range; the default 'logs' table starts as a single data partition, so the
 * whole preload lands in that partition (whole-table == target-partition bytes
 * at this scale). A fat message column carries the byte weight.
 */
async function preloadTargetPartition(seedNode, cfg) {
  const payload = buildPayload(cfg.preloadPayloadBytes);
  const rowsPerBatch = Math.max(
    1,
    Math.min(
      Math.floor(cfg.preloadBatchSize),
      Math.max(1, Math.floor(PRELOAD_MAX_BATCH_BYTES / Math.max(1, cfg.preloadPayloadBytes))),
    ),
  );
  const baseTs = Date.now();
  let inserted = ZERO;
  for (let start = ZERO; start < cfg.preloadRows; start += rowsPerBatch) {
    const end = Math.min(cfg.preloadRows, start + rowsPerBatch);
    const values = [];
    for (let index = start; index < end; index += 1) {
      const key = PRELOAD_KEY_PREFIX + String(index).padStart(PRELOAD_KEY_PAD, '0');
      const ts = baseTs + index;
      values.push(
        '(\'' + escapeSql(key) + '\', ' + ts + ', \'' + PRELOAD_LEVEL +
        '\', \'' + PRELOAD_NODE_ID + '\', \'' + payload + '\', ' + ts + ')',
      );
    }
    const sql = 'INSERT INTO ' + cfg.tableName + ' ' + LOAD_LOG_COLUMNS +
      ' VALUES ' + values.join(', ');
    await runNodeQuery(seedNode, sql);
    inserted += (end - start);
  }
  return {
    rowsInserted: inserted,
    payloadBytes: Math.floor(cfg.preloadPayloadBytes),
    approxBytes: inserted * Math.floor(cfg.preloadPayloadBytes),
    rowsPerBatch,
  };
}

/**
 * Resolve a non-seed follower replica of the target table to rebuild. Reads the
 * authoritative partitions + services system tables. replicaId follows the same
 * resolution the durable-rejoin planner uses (replica_id, else service_id) and
 * equals the on-disk {rid} in {rid}.db.
 */
async function resolveRebuildTarget(seedNode, nodes, tableName, seedNodeId) {
  const partitionsResult = await runNodeQuery(
    seedNode,
    'SELECT partition_id, leader_node_id FROM partitions WHERE table_name = \'' +
      escapeSql(tableName) + '\'',
  );
  const servicesResult = await runNodeQuery(
    seedNode,
    'SELECT partition_id, node_id, replica_id, service_id, raft_role, status ' +
      'FROM services WHERE service_type = \'' + SERVICE_TYPE_PARTITION + '\'',
  );
  const partitionRows = rowsFromResult(partitionsResult);
  const serviceRows = rowsFromResult(servicesResult);
  const nodeIds = new Set(nodes.map((node) => String(node?.id || '')));

  for (const partitionRow of partitionRows) {
    const partitionId = normalizeString(partitionRow?.partition_id);
    if (partitionId.length === ZERO) {
      continue;
    }
    const leaderNodeId = normalizeString(partitionRow?.leader_node_id);
    for (const serviceRow of serviceRows) {
      if (normalizeString(serviceRow?.partition_id) !== partitionId) {
        continue;
      }
      const nodeId = normalizeString(serviceRow?.node_id);
      const raftRole = normalizeString(serviceRow?.raft_role).toLowerCase();
      const status = normalizeString(serviceRow?.status).toLowerCase();
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
      const replicaId = normalizeString(serviceRow?.replica_id) ||
        normalizeString(serviceRow?.service_id);
      if (replicaId.length === ZERO) {
        continue;
      }
      return {partitionId, replicaId, followerNodeId: nodeId, leaderNodeId};
    }
  }
  return null;
}

function buildR5EvidenceSlice({
  cfg,
  preload,
  target,
  wiped,
  catchupDurationMs,
  metrics,
  rebuildWindow,
  acknowledgedWriteVisibility,
  restartabilityLeg,
}) {
  const approxBytes = preload.approxBytes;
  const catchupSeconds = catchupDurationMs > ZERO ?
    catchupDurationMs / MS_PER_SECOND :
    null;
  const transferBytesAndRate = {
    declaredFloorBytes: cfg.floorBytes,
    preloadApproxBytes: approxBytes,
    catchupDurationMs,
    approxBytesPerSec: catchupSeconds ?
      Math.round(approxBytes / catchupSeconds) :
      null,
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
async function run(cluster, options = {}) {
  const scenarioOptions = resolveScenarioOptions(
    options,
    cluster,
    'snapshotLiveRebuild',
  );
  const cfg = resolveSnapshotLiveRebuildScenarioConfig(scenarioOptions);

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
      // Best-effort readiness; the preload and load below surface real issues.
    }
  } else if (typeof cluster.waitForAllActive === 'function') {
    await cluster.waitForAllActive({timeoutMs: cfg.preLoadReadinessTimeoutMs});
  }

  // 2. Preload the target partition to the declared floor.
  const preload = await preloadTargetPartition(seedNode, cfg);

  // 3. Resolve a non-seed follower replica of the target table to rebuild.
  const target = await resolveRebuildTarget(
    seedNode,
    nodes,
    cfg.tableName,
    seedNodeId,
  );
  assert.ok(
    target,
    'No non-seed active follower replica of table ' + cfg.tableName +
      ' available to rebuild',
  );
  const followerNode = nodes.find(
    (node) => String(node.id) === String(target.followerNodeId),
  );
  assert.ok(
    followerNode,
    'Follower node handle not found: ' + target.followerNodeId,
  );

  // 4. Start sustained acknowledged-write-tracked load for the whole window.
  const loadNodesById = new Map(nodes.map((node) => [String(node.id), node]));
  const availableLoadNodeIds = new Set(
    nodes
      .filter((node) => node.role !== 'seed')
      .map((node) => String(node.id)),
  );
  const resolveLoadNodes = () => Array.from(availableLoadNodeIds)
    .map((nodeId) => loadNodesById.get(nodeId))
    .filter((node) => node && typeof node.query === 'function');

  const loadRun = cluster.startLoad({
    nodes: resolveLoadNodes(),
    nodeResolver: resolveLoadNodes,
    opsPerSec: cfg.loadOpsPerSec,
    duration: cfg.loadDuration,
    queryTimeoutMs: cfg.queryTimeoutMs,
    trackAcknowledgedWrites: true,
    tableName: cfg.tableName,
  });
  let loadRunCompleted = false;
  let restartabilityLeg = null;

  try {
    await sleep(cfg.preWipeSettleMs);
    const preWipeMetrics = loadRun.getMetrics();
    const preWipeTotal = Number(preWipeMetrics?.total || ZERO);
    const preWipeSuccess = Number(preWipeMetrics?.success || ZERO);

    // 5. Stop the follower, wipe its durable replica state, restart it.
    availableLoadNodeIds.delete(String(followerNode.id));
    const wipeStartedAt = Date.now();
    await cluster.stopNode(followerNode.id);
    const wiped = await cluster.wipeReplicaData(followerNode.id, {
      partitionId: target.partitionId,
      replicaId: target.replicaId,
    });
    await cluster.startNode(followerNode.id, {
      readinessTimeoutMs: cfg.rejoinReadinessTimeoutMs,
    });
    availableLoadNodeIds.add(String(followerNode.id));

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
      cfg,
      preload,
      target,
      wiped,
      catchupDurationMs,
      metrics,
      rebuildWindow,
      acknowledgedWriteVisibility,
      restartabilityLeg,
    });

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
  } finally {
    if (!loadRunCompleted && typeof loadRun.cancel === 'function') {
      loadRun.cancel();
    }
  }
}

export {
  run,
  preloadTargetPartition,
  resolveRebuildTarget,
  buildR5EvidenceSlice,
};
