/**
 * Per-latency-group data-affinity weights for a runtime service
 * (service↔data affinity placement epic — the production A[s][p] join).
 *
 * Aggregates the CDC-propagated `service_partition_access` rows for one
 * service across nodes (staleness-bounded), then joins each accessed
 * partition to latency groups using the same cluster-cached tables the
 * placement kernel reads:
 *   - READ counts credit every latency group holding an ACTIVE replica
 *     of the partition (locality read routing can serve the read in any
 *     of them — the router model the readLocality policy enables);
 *   - WRITE counts credit only the partition LEADER's group (writes
 *     always route to the leader).
 * Weights are normalized so the best group is 1 and the rest are
 * proportional — the shape `buildDataAffinityContext` expects on
 * `policy.dataAffinity.groupWeights`. No fresh attribution, or no
 * joinable partitions, yields an empty object (the DATA_AFFINITY
 * dimension family then stays gated off).
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

function resolvePartitionReplicaGroupIds(cache, partitionId) {
  const replicaRows = cache.filter(
    TABLES.SERVICES,
    (service) =>
      service?.[COLUMN.PARTITION_ID] === partitionId &&
      service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
      service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE &&
      service?.[COLUMN.NODE_ID],
  ) || [];
  const groupIds = new Set();
  for (const replica of replicaRows) {
    const groupId = resolveNodeGroupId(cache, replica[COLUMN.NODE_ID]);
    if (groupId) {
      groupIds.add(groupId);
    }
  }
  return groupIds;
}

function resolvePartitionLeaderGroupId(cache, partitionId) {
  const partitionRow = cache.get(TABLES.PARTITIONS, partitionId);
  return resolveNodeGroupId(cache, partitionRow?.[COLUMN.LEADER_NODE_ID]);
}

function accumulateGroupScores(cache, countsByPartition) {
  const scoreByGroup = new Map();
  const addScore = (groupId, score) => {
    if (groupId && score > 0) {
      scoreByGroup.set(groupId, (scoreByGroup.get(groupId) || 0) + score);
    }
  };
  for (const [partitionId, counts] of countsByPartition) {
    const readCount = counts[SERVICE_PARTITION_ACCESS_KIND.READ];
    if (readCount > 0) {
      for (const groupId of
        resolvePartitionReplicaGroupIds(cache, partitionId)) {
        addScore(groupId, readCount);
      }
    }
    addScore(
      resolvePartitionLeaderGroupId(cache, partitionId),
      counts[SERVICE_PARTITION_ACCESS_KIND.WRITE],
    );
  }
  return scoreByGroup;
}

function normalizeGroupScores(scoreByGroup) {
  let maxScore = 0;
  for (const score of scoreByGroup.values()) {
    maxScore = Math.max(maxScore, score);
  }
  if (maxScore <= 0) {
    return {};
  }
  const groupWeights = {};
  for (const [groupId, score] of scoreByGroup) {
    groupWeights[groupId] = score / maxScore;
  }
  return groupWeights;
}

/**
 * Build normalized per-latency-group affinity weights for a service.
 * @param {Object} options
 * @param {Object} options.systemTableCache - Node-local system cache.
 * @param {string} options.serviceId - Runtime service id.
 * @param {number} options.nowMs - Current time (injectable).
 * @param {number} [options.maxAgeMs] - Attribution staleness bound.
 * @return {Object} `{latencyGroupId: weight in (0..1]}`, empty when no
 *   fresh joinable attribution exists.
 */
function buildServiceDataAffinityGroupWeights(options = {}) {
  const cache = options.systemTableCache;
  const serviceId = options.serviceId;
  if (!cache || typeof cache.filter !== 'function' ||
      typeof cache.get !== 'function' || !serviceId) {
    return {};
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
  return normalizeGroupScores(
    accumulateGroupScores(cache, countsByPartition),
  );
}

export {buildServiceDataAffinityGroupWeights};
