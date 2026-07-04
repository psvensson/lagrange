/**
 * Data-affinity weights for a runtime service at TWO granularities
 * (service↔data affinity placement epic — the production A[s][p] join).
 *
 * Aggregates the CDC-propagated `service_partition_access` rows for one
 * service across nodes (staleness-bounded), then joins each accessed
 * partition to the placement coordinates the kernel scores:
 *   - NODE weights (the primary nearness coordinate): READ counts
 *     credit every node hosting an ACTIVE replica of the partition
 *     (local reads never leave the node); WRITE counts credit the
 *     partition LEADER's node. This is what "code moves to its data"
 *     means inside a single latency group.
 *   - GROUP weights (the coarse outer term for multi-latency-domain
 *     clusters): the same credits collapsed to the nodes' latency
 *     groups. Latency groups exist for CDC fan-out efficiency; for
 *     placement they only express "don't cross a latency domain", not
 *     within-domain nearness.
 * Weights are normalized so the best entry is 1 and the rest are
 * proportional — the shape `buildDataAffinityContext` expects on
 * `policy.dataAffinity.{groupWeights,nodeWeights}`. No fresh
 * attribution, or no joinable partitions, yields empty objects (the
 * DATA_AFFINITY dimension family then stays gated off).
 */

import {
  COLUMN,
  SERVICE_PARTITION_ACCESS_COL as SPA_COL,
  SERVICE_PARTITION_ACCESS_KIND,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../constants/index.js';

// Rows older than this are ignored: ~4 publish windows (publisher
// default 30s), so a departed or wedged node's stale counts age out of
// the matrix instead of steering placement forever.
const SERVICE_PARTITION_ACCESS_MAX_AGE_MS = 120000;

function parseAccessJson(row) {
  try {
    const parsed = JSON.parse(row?.[SPA_COL.ACCESS_JSON]);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ?
      parsed :
      {};
  } catch (_error) {
    return {};
  }
}

function sumFreshPartitionCounts(cache, serviceId, nowMs, maxAgeMs) {
  const cutoffMs = nowMs - maxAgeMs;
  const rows = cache.filter(
    TABLES.SERVICE_PARTITION_ACCESS,
    (row) =>
      row?.[SPA_COL.SERVICE_ID] === serviceId &&
      Number(row?.[SPA_COL.PUBLISHED_AT]) >= cutoffMs,
  ) || [];
  const countsByPartition = new Map();
  for (const row of rows) {
    for (const [partitionId, counts] of Object.entries(parseAccessJson(row))) {
      const entry = countsByPartition.get(partitionId) || {
        [SERVICE_PARTITION_ACCESS_KIND.READ]: 0,
        [SERVICE_PARTITION_ACCESS_KIND.WRITE]: 0,
      };
      for (const kind of Object.values(SERVICE_PARTITION_ACCESS_KIND)) {
        const count = counts?.[kind];
        if (Number.isFinite(count) && count > 0) {
          entry[kind] += count;
        }
      }
      countsByPartition.set(partitionId, entry);
    }
  }
  return countsByPartition;
}

function resolveNodeGroupId(cache, nodeId) {
  if (!nodeId) {
    return null;
  }
  const nodeRow = cache.get(TABLES.NODES, nodeId);
  return nodeRow?.[COLUMN.LATENCY_GROUP_ID] || null;
}

function resolvePartitionReplicaNodeIds(cache, partitionId) {
  const replicaRows = cache.filter(
    TABLES.SERVICES,
    (service) =>
      service?.[COLUMN.PARTITION_ID] === partitionId &&
      service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
      service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE &&
      service?.[COLUMN.NODE_ID],
  ) || [];
  const nodeIds = new Set();
  for (const replica of replicaRows) {
    nodeIds.add(replica[COLUMN.NODE_ID]);
  }
  return nodeIds;
}

function resolvePartitionLeaderNodeId(cache, partitionId) {
  const partitionRow = cache.get(TABLES.PARTITIONS, partitionId);
  return partitionRow?.[COLUMN.LEADER_NODE_ID] || null;
}

function accumulateAffinityScores(cache, countsByPartition) {
  const scoreByNode = new Map();
  const scoreByGroup = new Map();
  const addScore = (map, key, score) => {
    if (key && score > 0) {
      map.set(key, (map.get(key) || 0) + score);
    }
  };
  const creditNode = (nodeId, score) => {
    addScore(scoreByNode, nodeId, score);
    addScore(scoreByGroup, resolveNodeGroupId(cache, nodeId), score);
  };
  for (const [partitionId, counts] of countsByPartition) {
    const readCount = counts[SERVICE_PARTITION_ACCESS_KIND.READ];
    if (readCount > 0) {
      for (const nodeId of
        resolvePartitionReplicaNodeIds(cache, partitionId)) {
        creditNode(nodeId, readCount);
      }
    }
    creditNode(
      resolvePartitionLeaderNodeId(cache, partitionId),
      counts[SERVICE_PARTITION_ACCESS_KIND.WRITE],
    );
  }
  return {scoreByNode, scoreByGroup};
}

function normalizeScores(scoreByKey) {
  let maxScore = 0;
  for (const score of scoreByKey.values()) {
    maxScore = Math.max(maxScore, score);
  }
  if (maxScore <= 0) {
    return {};
  }
  const weights = {};
  for (const [key, score] of scoreByKey) {
    weights[key] = score / maxScore;
  }
  return weights;
}

/**
 * Build normalized affinity weights for a service at both placement
 * granularities.
 * @param {Object} options
 * @param {Object} options.systemTableCache - Node-local system cache.
 * @param {string} options.serviceId - Runtime service id.
 * @param {number} options.nowMs - Current time (injectable).
 * @param {number} [options.maxAgeMs] - Attribution staleness bound.
 * @return {{nodeWeights: Object, groupWeights: Object}} weights in
 *   (0..1] keyed by nodeId / latencyGroupId; both empty when no fresh
 *   joinable attribution exists.
 */
function buildServiceDataAffinityWeights(options = {}) {
  const cache = options.systemTableCache;
  const serviceId = options.serviceId;
  if (!cache || typeof cache.filter !== 'function' ||
      typeof cache.get !== 'function' || !serviceId) {
    return {nodeWeights: {}, groupWeights: {}};
  }
  const maxAgeMs =
    Number.isFinite(options.maxAgeMs) && options.maxAgeMs > 0 ?
      options.maxAgeMs :
      SERVICE_PARTITION_ACCESS_MAX_AGE_MS;
  const countsByPartition = sumFreshPartitionCounts(
    cache,
    serviceId,
    options.nowMs,
    maxAgeMs,
  );
  const {scoreByNode, scoreByGroup} =
    accumulateAffinityScores(cache, countsByPartition);
  return {
    nodeWeights: normalizeScores(scoreByNode),
    groupWeights: normalizeScores(scoreByGroup),
  };
}

/**
 * Group-weights-only view (kept for the group-granular callers/tests).
 * @param {Object} options - Same as buildServiceDataAffinityWeights.
 * @return {Object} `{latencyGroupId: weight in (0..1]}`.
 */
function buildServiceDataAffinityGroupWeights(options = {}) {
  return buildServiceDataAffinityWeights(options).groupWeights;
}

export {
  buildServiceDataAffinityGroupWeights,
  buildServiceDataAffinityWeights,
};
