/**
 * Evidence projection for the single-zone service/data-affinity demo.
 *
 * The demo intentionally evaluates placement with the same production
 * weight builder as the runtime-service policy owner. This avoids the
 * weak "the node holds any accessed partition" proxy: locality is the
 * fraction of the best achievable normalized node-weight score occupied
 * by the live service replicas.
 */

import {COLUMN, TABLES} from '../../src/constants/index.js';
import {
  buildServiceDataAffinityWeights,
} from '../../src/rebalancer/service-data-affinity-weights.js';
import {
  parseResultSnapshotWitness,
  RESULT_SNAPSHOT_STATE,
  resolveCompletePartialSnapshot,
} from '../../src/runtime/sql-query-loop-parallel-reduce.js';

const COMPLETE_LOCALITY_RATIO = 1;
const LOCALITY_EPSILON = 1e-9;
const RESULT_EPSILON = 1e-9;

function cacheFromRows({nodes, partitions, services, attributionRows}) {
  const rowsByTable = new Map([
    [TABLES.NODES, nodes],
    [TABLES.PARTITIONS, partitions],
    [TABLES.SERVICES, services],
    [TABLES.SERVICE_PARTITION_ACCESS, attributionRows],
  ]);
  const keyColumnByTable = new Map([
    [TABLES.NODES, COLUMN.NODE_ID],
    [TABLES.PARTITIONS, COLUMN.PARTITION_ID],
  ]);
  return {
    get(tableName, key) {
      const keyColumn = keyColumnByTable.get(tableName);
      return (rowsByTable.get(tableName) || [])
        .find((row) => row?.[keyColumn] === key) || null;
    },
    filter(tableName, predicate) {
      return (rowsByTable.get(tableName) || []).filter(predicate);
    },
  };
}

function buildWeightedLocalitySnapshot(options) {
  const {
    serviceId,
    placements,
    nodes,
    partitions,
    services,
    attributionRows,
    nowMs,
  } = options;
  const cache = cacheFromRows({
    nodes, partitions, services, attributionRows,
  });
  const {nodeWeights} = buildServiceDataAffinityWeights({
    systemTableCache: cache,
    serviceId,
    nowMs,
  });
  const weights = Object.entries(nodeWeights)
    .sort((left, right) => right[1] - left[1]);
  const placementScore = placements.reduce(
    (score, placement) => score + (nodeWeights[placement.nodeId] || 0),
    0,
  );
  const bestScore = weights
    .slice(0, placements.length)
    .reduce((score, entry) => score + entry[1], 0);
  const localityRatio = bestScore > 0 ? placementScore / bestScore : 0;
  return {
    nodeWeights,
    placementScore,
    bestScore,
    localityRatio,
    optimalNodeIds: weights
      .slice(0, placements.length)
      .map(([nodeId]) => nodeId),
  };
}

function topNRowsEqual(leftRows, rightRows) {
  if (leftRows.length !== rightRows.length) {
    return false;
  }
  return leftRows.every((left, index) => {
    const right = rightRows[index];
    return Number(left?.rank) === Number(right?.rank) &&
      String(left?.group_key) === String(right?.group_key) &&
      Math.abs(Number(left?.agg_value) - Number(right?.agg_value)) <=
        RESULT_EPSILON;
  });
}

function sameIdentitySet(left, right) {
  return left.size === right.size &&
    [...left].every((identity) => right.has(identity));
}

function isCompleteAssessment(checks) {
  return Object.values(checks).every(Boolean);
}

function resolvePartialSnapshotEvidence(
  reduceSlots, parallelReduceConfig, partialLimit,
) {
  try {
    return resolveCompletePartialSnapshot(
      reduceSlots,
      parallelReduceConfig,
      partialLimit,
      Date.now(),
    );
  } catch {
    return {complete: false, candidates: []};
  }
}

function resultSnapshotIsFresh(options) {
  const {
    serviceTopN,
    parallelReduceConfig,
    partialLimit,
    phaseStartedAt,
    placedReplicaIds,
    expectedMergeCandidateCount,
  } = options;
  if (serviceTopN.length === 0) {
    return false;
  }
  const snapshotColumn = parallelReduceConfig?.resultSnapshotColumn;
  const sourceSnapshotJson = serviceTopN[0]?.[snapshotColumn];
  const sourceSnapshot = parseResultSnapshotWitness(
    sourceSnapshotJson,
    parallelReduceConfig,
    partialLimit,
  );
  if (sourceSnapshot.state !== RESULT_SNAPSHOT_STATE.AVAILABLE) {
    return false;
  }
  const resultComputedAt = Number(serviceTopN[0]?.computed_at);
  const sourceReplicaIds = new Set(
    sourceSnapshot.slots.map((slot) => slot.replicaId),
  );
  const sourceCandidateCount = sourceSnapshot.slots.reduce(
    (count, slot) => count + slot.candidateCount,
    0,
  );
  return Number.isFinite(resultComputedAt) &&
    resultComputedAt >= phaseStartedAt &&
    sourceCandidateCount <= expectedMergeCandidateCount &&
    sameIdentitySet(sourceReplicaIds, placedReplicaIds) &&
    serviceTopN.every((row) =>
      Number(row.computed_at) === resultComputedAt &&
      row[snapshotColumn] === sourceSnapshotJson) &&
    sourceSnapshot.slots.every((slot) =>
      slot.computedAt >= phaseStartedAt &&
      slot.computedAt <= resultComputedAt);
}

function assessAffinityDemoCompletion(options) {
  const {
    expectedReplicaCount,
    placements,
    weightedLocality,
    referenceTopN,
    serviceTopN,
    reduceSlots,
    expectedMergeCandidateCount,
    phaseStartedAt,
    parallelReduceConfig,
    partialLimit,
  } = options;
  const partialSnapshot = resolvePartialSnapshotEvidence(
    reduceSlots, parallelReduceConfig, partialLimit,
  );
  const slotReplicaIds = new Set(
    reduceSlots.map((row) => row.replica_id).filter(Boolean),
  );
  const placedReplicaIds = new Set(
    placements.map((placement) => placement.replicaId),
  );
  const partialReplicaCount = slotReplicaIds.size;
  const mergeCandidateCount = partialSnapshot.candidates?.length || 0;
  const partialsFresh = reduceSlots.every((row) =>
    Number(row.computed_at) >= phaseStartedAt &&
    Number(row.lease_expires_at) > Date.now());
  const resultFresh = resultSnapshotIsFresh({
    serviceTopN,
    parallelReduceConfig,
    partialLimit,
    phaseStartedAt,
    placedReplicaIds,
    expectedMergeCandidateCount,
  });
  const partialsBounded = partialSnapshot.complete &&
    mergeCandidateCount <= expectedMergeCandidateCount;
  const identitiesCurrent = sameIdentitySet(
    slotReplicaIds, placedReplicaIds,
  );
  const distinctPlacementNodes = new Set(
    placements.map((placement) => placement.nodeId),
  ).size;
  const resultCorrect = topNRowsEqual(referenceTopN, serviceTopN);
  const placementOptimal = weightedLocality.bestScore > 0 &&
    weightedLocality.localityRatio >=
      COMPLETE_LOCALITY_RATIO - LOCALITY_EPSILON &&
    weightedLocality.localityRatio <=
      COMPLETE_LOCALITY_RATIO + LOCALITY_EPSILON;
  const complete = isCompleteAssessment({
    replicaCount: placements.length === expectedReplicaCount,
    distinctPlacementNodes:
      distinctPlacementNodes === expectedReplicaCount,
    partialReplicaCount: partialReplicaCount === expectedReplicaCount,
    identitiesCurrent,
    partialsFresh,
    partialsBounded,
    resultFresh,
    placementOptimal,
    resultCorrect,
  });
  return {
    complete,
    partialReplicaCount,
    mergeCandidateCount,
    identitiesCurrent,
    partialsFresh,
    partialsBounded,
    resultFresh,
    placementOptimal,
    resultCorrect,
  };
}

export {
  assessAffinityDemoCompletion,
  buildWeightedLocalitySnapshot,
  topNRowsEqual,
};
