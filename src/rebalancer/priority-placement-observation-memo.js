import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {readAllSharedRows} from '../cache/shared-row-read.js';
import {buildCurrentPriorityPlacementObservation} from
  '../control-plane/current-priority-placement-observation.js';
import {readMembershipPlanningDerivationVersionKey} from
  '../control-plane/membership-planning-version-key.js';
import {isCatchupLearnerRaftRole} from
  '../raft/replica-voter-readiness.js';

const {
  TABLES,
  UNIFIED_REBALANCER_LITERAL,
  classifySystemPartition,
  normalizeServiceRow,
} = UNIFIED_REBALANCER_SHARED;

// The current-priority-placement observation makes several full canonical
// copy passes over every service and partition row per build, and formation
// planning sweeps build it once per entity plus a dozen times per priority
// entity in one synchronous burst — profiled at ~46 percent of seed CPU with
// the quadratic term per-entity spread-blocker evaluation × per-call
// full-table copying (live evidence:
// movielens-lagrange-service-affinity-live-2026-08-15T15-15-18-658Z).
// Memoized per cache instance on the shared planning version key plus every
// non-table input the observation consumes; heartbeat writes bound staleness
// at the heartbeat interval — the same bound the shipped planning-derivation
// memo accepts. Caches that cannot version their tables disable the memo
// (context resolves to null and read/store become no-ops).
const OBSERVATION_MEMO_BY_CACHE = new WeakMap();
const OBSERVATION_MEMO_MAX_VARIANTS = 32;
const OBSERVATION_KEY_PART_SEPARATOR = '\u001f';
const OBSERVATION_KEY_LIST_SEPARATOR = ',';
const OBSERVATION_KEY_NO_CURRENT_ROWS = 'no-current-rows';

function joinSortedNodeIds(nodeIds) {
  return [...nodeIds].sort().join(OBSERVATION_KEY_LIST_SEPARATOR);
}

function buildObservationVariantKey({
  planningSnapshot,
  planningPublishedActiveNodeIds,
  readyNodeIds,
  cohortNodeIds,
  normalizedCurrentPartitionId,
  currentPartitionServiceRows,
}) {
  return [
    normalizedCurrentPartitionId,
    Array.isArray(currentPartitionServiceRows) ?
      JSON.stringify(currentPartitionServiceRows) :
      OBSERVATION_KEY_NO_CURRENT_ROWS,
    joinSortedNodeIds(readyNodeIds),
    joinSortedNodeIds(cohortNodeIds),
    joinSortedNodeIds(planningPublishedActiveNodeIds),
    joinSortedNodeIds(planningSnapshot?.projectedServingNodeIds || []),
  ].join(OBSERVATION_KEY_PART_SEPARATOR);
}

/**
 * @param {Object} options - The placement build inputs plus the normalized
 *   current partition id.
 * @return {Object|null} Memo context for read/store, or null when the cache
 *   cannot version its tables and memoization must disable.
 */
function resolvePlacementObservationMemoContext(options) {
  const {systemTableCache, readinessService} = options;
  const versionKey = readMembershipPlanningDerivationVersionKey(
    systemTableCache,
    options.observedAt,
  );
  if (versionKey === null) {
    return null;
  }
  return {
    systemTableCache,
    readinessService,
    versionKey,
    variantKey: buildObservationVariantKey(options),
  };
}

function readMemoizedPlacementObservation(context) {
  if (!context) {
    return null;
  }
  const memo = OBSERVATION_MEMO_BY_CACHE.get(context.systemTableCache);
  if (!memo || memo.versionKey !== context.versionKey ||
    memo.readinessService !== context.readinessService) {
    return null;
  }
  return memo.observationByVariant.get(context.variantKey) || null;
}

function storeMemoizedPlacementObservation(context, observation) {
  if (!context) {
    return;
  }
  let memo = OBSERVATION_MEMO_BY_CACHE.get(context.systemTableCache);
  if (!memo || memo.versionKey !== context.versionKey ||
    memo.readinessService !== context.readinessService ||
    memo.observationByVariant.size >= OBSERVATION_MEMO_MAX_VARIANTS) {
    memo = {
      versionKey: context.versionKey,
      readinessService: context.readinessService,
      observationByVariant: new Map(),
    };
    OBSERVATION_MEMO_BY_CACHE.set(context.systemTableCache, memo);
  }
  memo.observationByVariant.set(context.variantKey, observation);
}

function resolvePriorityLearnerNodeIds(serviceRows) {
  const nodeIds = new Set();
  for (const serviceRow of serviceRows) {
    const service = normalizeServiceRow(serviceRow);
    if (
      service.nodeId &&
      isCatchupLearnerRaftRole(service.raftRole) &&
      classifySystemPartition({partitionId: service.partitionId})
        .priorityControlPlane
    ) {
      nodeIds.add(service.nodeId);
    }
  }
  return nodeIds;
}

function buildCurrentPriorityPlacementFromRebalancerCache({
  systemTableCache,
  readinessService,
  planningSnapshot,
  planningPublishedActiveNodeIds,
  readyNodeIds,
  cohortNodeIds,
  observedAt,
  currentPartitionId = null,
  currentPartitionServiceRows = null,
}) {
  const locallyEligibleNodeIds = [
    ...new Set([...readyNodeIds, ...cohortNodeIds]),
  ];
  const normalizedCurrentPartitionId = String(
    currentPartitionId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
  ).trim();
  // See priority-placement-observation-memo.js for why this build memoizes
  // and the staleness bound it accepts.
  const memoContext = resolvePlacementObservationMemoContext({
    systemTableCache,
    readinessService,
    planningSnapshot,
    planningPublishedActiveNodeIds,
    readyNodeIds,
    cohortNodeIds,
    normalizedCurrentPartitionId,
    currentPartitionServiceRows,
    observedAt,
  });
  const memoized = readMemoizedPlacementObservation(memoContext);
  if (memoized) {
    return memoized;
  }
  const partitionRows = readAllSharedRows(
    systemTableCache,
    TABLES.PARTITIONS,
  );
  const cachedServiceRows = readAllSharedRows(
    systemTableCache,
    TABLES.SERVICES,
  );
  const serviceRows =
    normalizedCurrentPartitionId.length > 0 &&
    Array.isArray(currentPartitionServiceRows) ?
      [
        ...cachedServiceRows.filter(
          (serviceRow) =>
            normalizeServiceRow(serviceRow).partitionId !==
              normalizedCurrentPartitionId,
        ),
        ...currentPartitionServiceRows,
      ] :
      cachedServiceRows;
  const locallyEligibleNodeIdSet = new Set(locallyEligibleNodeIds);
  const priorityLearnerNodeIds =
    resolvePriorityLearnerNodeIds(serviceRows);
  const readinessByNodeId =
    typeof readinessService?.getNodeReadinessSync === 'function' ?
      Object.fromEntries(
        [...priorityLearnerNodeIds]
          .filter((nodeId) => locallyEligibleNodeIdSet.has(nodeId))
          .map((nodeId) => [
            nodeId,
            readinessService.getNodeReadinessSync(nodeId, {
              allowStaleOnCacheChange: false,
            }),
          ]),
      ) :
      {};
  const observation = buildCurrentPriorityPlacementObservation({
    capturedAt: observedAt,
    partitionRows,
    serviceRows,
    readinessByNodeId,
    activeNodeViews: {
      locallyEligibleNodeIds,
      projectedServingNodeIds:
        planningSnapshot?.projectedServingNodeIds || [],
      publishedActiveNodeIds: [...planningPublishedActiveNodeIds],
    },
  });
  storeMemoizedPlacementObservation(memoContext, observation);
  return observation;
}

export {
  buildCurrentPriorityPlacementFromRebalancerCache,
};
