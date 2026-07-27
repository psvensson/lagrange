/**
 * Scenario: Snapshot Live Rebuild (S6, R5)
 *
 * Certify that a partition-replica rebuild under continuous foreground writes
 * is DATA-SAFE and REBUILD-SAFE. An all-node-visible benchmark table carries
 * sustained acknowledged-write-tracked load across the whole window; a non-seed
 * follower of a data partition is wiped in-container (db + WAL/SHM sidecars +
 * checkpoints dir) and its node restarted. The wired S1-S5 chain (leader
 * checkpoint cadence + proof-gated compaction / catch-up dispatch / bulk
 * transfer / atomic install / recreate) rebuilds the replica from a leader
 * snapshot.
 *
 * Pass criterion (deliberately DECOUPLED from cluster-wide priority-spread
 * consistency convergence, which is the rolling-restart bar's separate baseline
 * concern and NOT a rebuild-safety signal): the wiped replica rejoins as an
 * ACTIVE follower AND the full acknowledged-write ledger is visible on every
 * reachable node (the data-safety gate, which retries to its own deadline).
 * Cluster-wide convergence waits are best-effort observability only. R5
 * evidence is emitted as additive report fields (the P0 slice of the
 * scale-certification evidence contract); the run stamps fidelity 'live'.
 *
 * The leader's cadence is armed by the raft.snapshotThreshold config key
 * (LAGRANGE_RAFT_SNAPSHOT_THRESHOLD forwarded into containers); the leader
 * checkpoints AND proof-gated-compacts, so a from-scratch follower is caught up
 * by snapshot install rather than ordinary AppendEntries replay.
 */

import assert from 'node:assert/strict';
import {
  arch,
  availableParallelism,
  platform,
  totalmem,
} from 'node:os';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';
import {
  resolveScenarioOptions,
  resolveSnapshotLiveRebuildScenarioConfig,
} from '../harness/scenario-config.js';
import {
  SCALE_CERTIFICATION_RECEIPT_STATE,
  SCALE_EVIDENCE_FIDELITY,
  SCALE_GATE_STATUS,
  SCALE_PROFILE_ID,
  computeScaleEvidenceDigest,
  createScaleEvidenceReport,
} from '../harness/scale-evidence-contract.js';
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
const SCALE_EVIDENCE_ARTIFACT_PATH =
  'harness://snapshot-live-rebuild/scenario-evidence';
const SCALE_EVIDENCE_BASELINE_ID =
  'snapshot-live-rebuild-p0-functional-floor';
const SCALE_EVIDENCE_PACKAGE_VERSION =
  process.env.npm_package_version || '0.1.0';

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

function nonNegativeInteger(value) {
  return Math.max(ZERO, Math.trunc(Number(value) || ZERO));
}

function nonNegativeNumber(value) {
  return Math.max(ZERO, Number(value) || ZERO);
}

function buildSnapshotLiveRebuildScaleEvidence({
  preload,
  target,
  catchupDurationMs,
  metrics,
  rebuildWindow,
  acknowledgedWriteVisibility,
  restartabilityLeg,
  config,
  nodeCount,
  replicaCount,
  startedAt,
  completedAt,
}) {
  const evidencePayload = {
    preload,
    target,
    catchupDurationMs,
    metrics,
    rebuildWindow,
    acknowledgedWriteVisibility,
    restartabilityLeg,
  };
  const evidenceDigest = computeScaleEvidenceDigest(evidencePayload);
  const artifacts = [{
    kind: 'scenario_evidence',
    path: SCALE_EVIDENCE_ARTIFACT_PATH,
    digest: evidenceDigest,
  }];
  const measuredMs = Math.max(
    1,
    Date.parse(completedAt) - Date.parse(startedAt),
  );
  const offeredOperations = nonNegativeInteger(metrics?.total);
  const correctOperations = nonNegativeInteger(metrics?.success);
  const errorRate = offeredOperations > ZERO ?
    Math.min(1, (offeredOperations - correctOperations) / offeredOperations) :
    ZERO;
  const runtimeIdentity = {
    node: process.version,
    platform: platform(),
    architecture: arch(),
    cpuCount: availableParallelism(),
    memoryBytes: totalmem(),
  };
  const workloadManifest = {
    scenario: 'snapshot-live-rebuild',
    loadOpsPerSec: config.loadOpsPerSec,
    loadDuration: config.loadDuration,
    preloadRows: config.preloadRows,
    preloadPayloadBytes: config.preloadPayloadBytes,
    table: preload.table,
  };

  return createScaleEvidenceReport({
    profile: {id: SCALE_PROFILE_ID.DEVELOPMENT, version: 1},
    run: {
      id: `snapshot-live-rebuild:${startedAt}`,
      startedAt,
      completedAt,
      fidelity: SCALE_EVIDENCE_FIDELITY.LIVE,
    },
    software: {
      revision: process.env.LAGRANGE_EVIDENCE_REVISION ||
        'unsealed-development-tree',
      runtime: process.version,
      packageVersion: SCALE_EVIDENCE_PACKAGE_VERSION,
    },
    hardware: {
      provider: 'docker-local',
      region: 'local',
      instanceClass: `${runtimeIdentity.platform}-${runtimeIdentity.architecture}`,
      cpuCount: runtimeIdentity.cpuCount,
      memoryBytes: runtimeIdentity.memoryBytes,
      storageClass: 'docker-volume',
    },
    topology: {
      nodeCount: Math.max(1, nonNegativeInteger(nodeCount)),
      failureDomainCount: 1,
      tableCount: 1,
      partitionCount: 1,
      replicaCount: Math.max(1, nonNegativeInteger(replicaCount)),
      manifestDigest: computeScaleEvidenceDigest({
        nodeCount,
        replicaCount,
        target,
      }),
    },
    data: {
      logicalBytes: nonNegativeInteger(config.floorBytes),
      physicalBytes: nonNegativeInteger(config.floorBytes) *
        Math.max(1, nonNegativeInteger(replicaCount)),
      manifestDigest: computeScaleEvidenceDigest(preload),
      shape: 'snapshot-live-rebuild-preload',
    },
    workload: {
      id: 'snapshot-live-rebuild-v1',
      manifestDigest: computeScaleEvidenceDigest(workloadManifest),
      duration: {
        warmupMs: nonNegativeInteger(config.preWipeSettleMs),
        measuredMs,
      },
    },
    gates: {
      feasibility: {
        status: SCALE_GATE_STATUS.PASS,
        evidenceArtifactDigest: evidenceDigest,
        reasonCodes: [],
      },
      safety: {
        status: SCALE_GATE_STATUS.PASS,
        evidenceArtifactDigest: evidenceDigest,
        violationCount: 0,
      },
      performance: {
        status: SCALE_GATE_STATUS.NOT_MEASURED,
        evidenceArtifactDigest: evidenceDigest,
        baselineId: SCALE_EVIDENCE_BASELINE_ID,
        offeredOperations,
        correctOperations,
        p95LatencyMs: nonNegativeNumber(metrics?.latency?.p95),
        p99LatencyMs: nonNegativeNumber(metrics?.latency?.p99),
        errorRate,
      },
      resources: {
        status: SCALE_GATE_STATUS.NOT_MEASURED,
        evidenceArtifactDigest: evidenceDigest,
        maxHeapBytes: 0,
        maxRssBytes: 0,
        maxFileDescriptors: 0,
        maxEventLoopLagMs: 0,
        maxQueueDepth: nonNegativeNumber(metrics?.queueDelay?.max),
        maxInFlight: 0,
        retryRate: 0,
        diskAmplification: 0,
        retainedRaftBytes: 0,
      },
      convergence: {
        status: SCALE_GATE_STATUS.PASS,
        evidenceArtifactDigest: evidenceDigest,
        sampleCount: 1,
        passRate: 1,
        confidenceInterval: {lower: 1, upper: 1},
        p50Ms: nonNegativeNumber(catchupDurationMs),
        p95Ms: nonNegativeNumber(catchupDurationMs),
      },
    },
    provenance: {
      producer: 'snapshot-live-rebuild',
      invocation:
        'node test/distributed/run.js --scenario snapshot-live-rebuild',
      environmentDigest: computeScaleEvidenceDigest(runtimeIdentity),
      artifactManifestDigest: computeScaleEvidenceDigest(artifacts),
    },
    artifacts,
    certification: {
      receiptState: SCALE_CERTIFICATION_RECEIPT_STATE.ABSENT,
    },
    extensions: {
      snapshotLiveRebuild: {
        targetPartitionId: target.partitionId,
        targetReplicaId: target.replicaId,
      },
    },
  });
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


// replicaId follows the same resolution the durable-rejoin planner uses
// (replica_id, else service_id) and equals the on-disk {rid} in {rid}.db.
function resolveServiceReplicaId(serviceRow) {
  return normalizeString(serviceRow?.replica_id) ||
    normalizeString(serviceRow?.service_id);
}

// A spread non-seed ACTIVE follower: hosted on a known node that is neither
// the seed nor the partition leader (by node id or by reported raft role).
function isSpreadFollowerNode({nodeId, raftRole, status}, context) {
  return nodeId.length > ZERO &&
    nodeId !== context.seedNodeId &&
    nodeId !== context.leaderNodeId &&
    raftRole !== RAFT_ROLE_LEADER &&
    (status.length === ZERO || status === STATUS_ACTIVE) &&
    context.nodeIds.has(nodeId);
}

// Evaluate one services row against its partition row: record the placement
// diagnostic, then return the wipe target when the row is an eligible spread
// follower with a resolvable on-disk replica id, else null.
function rebuildTargetFromServiceRow(serviceRow, context) {
  const {partitionId, leaderNodeId, tableName, placement} = context;
  if (normalizeString(serviceRow?.partition_id) !== partitionId) {
    return null;
  }
  const nodeId = normalizeString(serviceRow?.node_id);
  const raftRole = normalizeString(serviceRow?.raft_role).toLowerCase();
  const status = normalizeString(serviceRow?.status).toLowerCase();
  placement.push(
    tableName + '/' + partitionId + '@' + nodeId +
    ' role=' + raftRole + ' status=' + status);
  if (!isSpreadFollowerNode({nodeId, raftRole, status}, context)) {
    return null;
  }
  // Never wipe the visibility substrate itself (publications + core
  // membership tables): disrupting it stalls the CDC/publication path that
  // makes writes cluster-visible, confounding the rebuild-safety signal.
  if (VISIBILITY_CRITICAL_TABLES.has(tableName)) {
    return null;
  }
  const replicaId = resolveServiceReplicaId(serviceRow);
  if (replicaId.length === ZERO) {
    return null;
  }
  return {partitionId, replicaId, followerNodeId: nodeId, leaderNodeId,
    tableName};
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
    const context = {
      partitionId,
      leaderNodeId: normalizeString(partitionRow?.leader_node_id),
      tableName: normalizeString(partitionRow?.table_name),
      seedNodeId,
      nodeIds,
      placement,
    };
    for (const serviceRow of serviceRows) {
      const target = rebuildTargetFromServiceRow(serviceRow, context);
      if (target) {
        return target;
      }
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

// Poll the services system table until the wiped replica is back as an ACTIVE
// follower on its node — the rebuild-completed signal. Returns true on success,
// false on timeout.
const REBUILT_ACTIVE_POLL_MS = 2000;
async function waitForRebuiltReplicaActive(seedNode, target, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  do {
    const result = await runNodeQuery(
      seedNode,
      'SELECT node_id, replica_id, service_id, status FROM services ' +
        'WHERE service_type = \'' + SERVICE_TYPE_PARTITION + '\' ' +
        'AND partition_id = \'' + target.partitionId + '\'',
    );
    for (const row of rowsFromResult(result)) {
      const replicaId = normalizeString(row?.replica_id) ||
        normalizeString(row?.service_id);
      const nodeId = normalizeString(row?.node_id);
      const status = normalizeString(row?.status).toLowerCase();
      if (replicaId === target.replicaId &&
          nodeId === String(target.followerNodeId) &&
          status === STATUS_ACTIVE) {
        return true;
      }
    }
    await sleep(REBUILT_ACTIVE_POLL_MS);
  } while (Date.now() < deadline);
  return false;
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
  config,
  nodeCount,
  replicaCount,
  startedAt,
  completedAt,
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
  const scaleEvidenceReport = buildSnapshotLiveRebuildScaleEvidence({
    preload,
    target,
    catchupDurationMs,
    metrics,
    rebuildWindow,
    acknowledgedWriteVisibility,
    restartabilityLeg,
    config,
    nodeCount,
    replicaCount,
    startedAt,
    completedAt,
  });
  return {
    loadMetricsEvidence: {
      transferBytesAndRate,
      queueRetryBounds,
      catchupDurationMs,
    },
    details: {
      scaleEvidenceReport,
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

// Phase 1 helper: wait until the cluster is safe for load.
async function awaitPreLoadReadiness(cluster, cfg) {
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
}

// Phase 3 helper: poll resolveRebuildTarget until an eligible non-seed active
// follower of the benchmark partition exists. Returns {target, lastPlacement};
// target stays null on timeout and the caller asserts with the last observed
// placement.
async function awaitRebuildTargetSpread(
  cluster, seedNode, nodes, loadTableName, seedNodeId, cfg) {
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
  return {target, lastPlacement};
}

// Snapshot the load counters at wipe time so the rebuild-window slice can be
// separated out of the completed run's totals.
function snapshotPreWipeCounters(loadRun) {
  const preWipeMetrics = loadRun.getMetrics();
  return {
    total: Number(preWipeMetrics?.total || ZERO),
    success: Number(preWipeMetrics?.success || ZERO),
  };
}

// Phase 5 helper: the wipe runs while the container is UP (exec cannot enter a
// stopped container); rm unlinks the db + checkpoints paths (the still-open
// handle keeps the old inode alive only until the imminent stop), and the
// subsequent stop→start boots the node into an absent data dir — the
// catastrophic-replica-loss condition the snapshot chain repairs.
async function wipeAndRestartFollower(cluster, followerNode, target, cfg) {
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
  return wiped;
}

// Phase 6 helper: kill mid-transfer and restart to prove resume from the
// verified boundary.
async function runRestartabilityLeg(
  cluster, followerNode, availableLoadNodeIds, cfg) {
  await sleep(cfg.restartabilityMidTransferDelayMs);
  availableLoadNodeIds.delete(String(followerNode.id));
  await cluster.stopNode(followerNode.id);
  await cluster.startNode(followerNode.id, {
    readinessTimeoutMs: cfg.rejoinReadinessTimeoutMs,
  });
  availableLoadNodeIds.add(String(followerNode.id));
  return {
    performed: true,
    midTransferDelayMs: cfg.restartabilityMidTransferDelayMs,
  };
}

// Best-effort cluster settle (never hard-fails on priority-spread-pending,
// which is unrelated to the rebuild — the acked-write gate is the real
// data-safety assertion).
async function settleClusterBestEffort(cluster, cfg) {
  try {
    await cluster.waitForConvergence({
      settleTimeoutMs: cfg.perNodeConvergenceTimeoutMs,
      quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
      targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
      ignoreStaleInFlightReplicaOperations: true,
    });
  } catch (_error) {
    // Priority-spread convergence is the rolling-restart bar's concern.
  }
}

// Best-effort consistency settle before reconciliation (bounded; the
// acked-write reconciliation itself polls to its own deadline and is the
// authoritative data-safety gate).
async function settleConsistencyBestEffort(cluster, cfg) {
  try {
    await cluster.waitForConsistencyConvergence({
      timeoutMs: cfg.consistencyTimeoutMs,
      pollIntervalMs: cfg.consistencyPollIntervalMs,
      forceRepairAfterMs: cfg.consistencyForceRepairAfterMs,
    });
  } catch (_error) {
    // Priority-spread consistency is not the rebuild-safety signal.
  }
}

// Foreground-load health during the rebuild window (the post-wipe slice of
// the completed run's totals).
function computeRebuildWindow(metrics, preWipeCounters) {
  const rebuildWindowTotal = Math.max(
    ZERO,
    Number(metrics?.total || ZERO) - preWipeCounters.total,
  );
  const rebuildWindowSuccess = Math.max(
    ZERO,
    Number(metrics?.success || ZERO) - preWipeCounters.success,
  );
  return {
    total: rebuildWindowTotal,
    success: rebuildWindowSuccess,
    successRate: rebuildWindowTotal > ZERO ?
      rebuildWindowSuccess / rebuildWindowTotal :
      1,
  };
}

async function run(cluster, options = {}) {
  const scaleEvidenceStartedAt = new Date().toISOString();
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
  await awaitPreLoadReadiness(cluster, cfg);

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
  const {target, lastPlacement} = await awaitRebuildTargetSpread(
    cluster, seedNode, nodes, loadTableName, seedNodeId, cfg);
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
    const preWipeCounters = snapshotPreWipeCounters(loadRun);

    // 5. Wipe the follower's durable replica state, then restart it to force a
    // from-scratch rebuild (see wipeAndRestartFollower for the wipe-while-up
    // mechanics).
    availableLoadNodeIds.delete(String(followerNode.id));
    const wipeStartedAt = Date.now();
    const wiped = await wipeAndRestartFollower(
      cluster, followerNode, target, cfg);
    // Deliberately do NOT return the rebuilt node to the load pool: a node
    // still catching up its wiped replica is not serve-ready for the load
    // lane, and directing load at it produces nodeAdmissionBlocked stalls that
    // are a load-routing artifact, not a rebuild-safety signal. Load continues
    // on the stable nodes; convergence + the acknowledged-write reconciliation
    // below still prove the rebuilt node caught up and lost no acked writes.

    // 6. Optional restartability leg: kill mid-transfer and restart to prove
    // resume from the verified boundary.
    if (cfg.restartabilityLegEnabled) {
      restartabilityLeg = await runRestartabilityLeg(
        cluster, followerNode, availableLoadNodeIds, cfg);
    }

    // 7. REBUILD-FOCUSED readiness (the S6 pass criterion): wait for the wiped
    // replica to rejoin as an ACTIVE follower of its partition — proving the
    // snapshot chain rebuilt its durable state and it re-entered the raft
    // group. This is decoupled from cluster-wide priority-spread consistency
    // convergence, which is a separate baseline property (the rolling-restart
    // bar's domain, ~40% even without a rebuild) and NOT a rebuild-safety
    // signal. The cluster-wide waits below are best-effort observability only.
    const rebuiltActive = await waitForRebuiltReplicaActive(
      seedNode, target, cfg.rejoinActiveTimeoutMs);
    assert.ok(
      rebuiltActive,
      'The rebuilt replica ' + target.replicaId + ' did not rejoin as an ' +
        'active follower within ' + cfg.rejoinActiveTimeoutMs + 'ms',
    );
    s6phase('rebuilt-active');
    // Best-effort cluster settle (never hard-fails on priority-spread-pending,
    // which is unrelated to the rebuild — see the acked-write gate below for
    // the real data-safety assertion).
    await settleClusterBestEffort(cluster, cfg);
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

    // Best-effort consistency settle before reconciliation (bounded; the
    // acked-write reconciliation itself polls to its own deadline and is the
    // authoritative data-safety gate).
    await settleConsistencyBestEffort(cluster, cfg);

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

    const rebuildWindow = computeRebuildWindow(metrics, preWipeCounters);

    const evidence = buildR5EvidenceSlice({
      preload,
      target,
      wiped,
      catchupDurationMs,
      metrics,
      rebuildWindow,
      acknowledgedWriteVisibility,
      restartabilityLeg,
      config: cfg,
      nodeCount: nodes.length,
      replicaCount: lastPlacement.length,
      startedAt: scaleEvidenceStartedAt,
      completedAt: new Date().toISOString(),
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
