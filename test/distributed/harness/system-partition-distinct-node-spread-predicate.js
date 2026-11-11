/**
 * Pure predicate: "every system partition is on the declared number of
 * distinct nodes" (2026-11-11: 39 of the 46 system partitions stayed on the
 * seed for ever after a three-node formation, and no predicate looked; the
 * sealed fresh-formation scenario checks the six priority partitions only).
 *
 * The oracle is the product's own critical-placement observer
 * (src/bootstrap/critical-placement-formation-observer.js): it is handed the
 * AUTHORITATIVE `services`, `partitions` and `control_plane_publications`
 * rows the scenario read from the cluster and answers the owner's
 * three-state evidence. This module adds no placement arithmetic of its own.
 * What it adds is the claim's shape:
 *   - the verdict is the observer's KNOWN_CONVERGED over the whole critical
 *     set, named per partition (through the convergence owner the observer
 *     delegates to) so an unmet run says which partitions are where;
 *   - a system-table partition outside the first-partition critical set is
 *     held to the same owner decision, so "every system partition" stays
 *     true after a split;
 *   - the persisted policy must itself require the declared distinct node
 *     count: a set converged against a policy of one replica is not spread;
 *   - integrity: a failed, absent or incomplete read is a named unmet
 *     reason, never rows; the declared count has no default.
 *
 * The scenario supplies reads in the shape the fresh-formation scenario's
 * readRows already produces: {rows, complete} or {error}.
 */

import {
  CRITICAL_PLACEMENT_EVIDENCE_STATE,
  isCriticalPlacementPartitionId,
  resolveCriticalPartitionPlacement,
  resolveCriticalPlacementConvergence,
} from '../../../src/bootstrap/critical-placement-convergence.js';
import {
  CRITICAL_PLACEMENT_EPOCH_STATE,
  observeCriticalPlacement,
} from '../../../src/bootstrap/critical-placement-formation-observer.js';
import {
  isSystemTablePartition,
} from '../../../src/bootstrap/system-partition-classification.js';
import {SYSTEM_TABLE_NAME} from
  '../../../src/bootstrap/system-table-schemas-constants.js';

const arrayMap = Function.call.bind(Array.prototype.map);

const PREDICATE_NAME = 'system-partitions-on-distinct-nodes';

const SPREAD_REASON = Object.freeze({
  REQUIRED_COUNT_UNDECLARED: 'required_distinct_node_count_undeclared',
  READ_FAILED: 'read_failed',
  ROWS_ABSENT: 'rows_absent',
  OBSERVATION_INCOMPLETE: 'observation_incomplete',
  MEMBERSHIP_EPOCH_UNAVAILABLE: 'membership_epoch_unavailable',
  PLACEMENT_EVIDENCE_UNKNOWN: 'placement_evidence_unknown',
  PARTITION_EVIDENCE_UNKNOWN: 'system_partition_evidence_unknown',
  PARTITION_NOT_SPREAD: 'system_partition_not_spread',
  POLICY_BELOW_REQUIRED: 'system_partition_policy_below_required',
});

// The three authoritative reads the observer consumes, by the key the
// scenario files them under and the table the observer asks its cache for.
const AUTHORITY_READS = Object.freeze([
  Object.freeze({key: 'services', tableName: SYSTEM_TABLE_NAME.SERVICES}),
  Object.freeze({key: 'partitions', tableName: SYSTEM_TABLE_NAME.PARTITIONS}),
  Object.freeze({
    key: 'controlPlanePublications',
    tableName: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  }),
]);

function unmet(reasonCodes, detail) {
  return Object.freeze({
    name: PREDICATE_NAME,
    met: false,
    reasonCodes: Object.freeze(reasonCodes),
    detail: Object.freeze(detail),
  });
}

/**
 * The rows of every authority read, or the named reasons they are not
 * usable. A read is usable only when it answered rows AND declared the row
 * set complete.
 * @param {Object|null} authority
 * @return {{rowsByTable: Map<string, Object[]>, reasons: string[]}}
 */
function readAuthority(authority) {
  const rowsByTable = new Map();
  const reasons = [];
  for (const {key, tableName} of AUTHORITY_READS) {
    const read = authority?.[key];
    if (read === null || typeof read !== 'object') {
      reasons.push(`${SPREAD_REASON.ROWS_ABSENT}:${key}`);
    } else if (typeof read.error === 'string' && read.error.length > 0) {
      reasons.push(`${SPREAD_REASON.READ_FAILED}:${key}:${read.error}`);
    } else if (!Array.isArray(read.rows)) {
      reasons.push(`${SPREAD_REASON.ROWS_ABSENT}:${key}`);
    } else if (read.complete !== true) {
      reasons.push(`${SPREAD_REASON.OBSERVATION_INCOMPLETE}:${key}`);
    } else {
      rowsByTable.set(tableName, read.rows);
    }
  }
  return {rowsByTable, reasons};
}

/**
 * The owner's placement decision for every system-table partition the
 * authoritative partitions rows name outside the critical set (the set the
 * observer inspects is the first partition of every system table).
 * @param {Object[]} partitionRows
 * @param {Object[]} serviceRows
 * @return {Object[]}
 */
function resolveFurtherSystemPartitionPlacements(partitionRows, serviceRows) {
  const placements = [];
  for (const partitionRow of partitionRows) {
    const partitionId = partitionRow?.partition_id;
    if (typeof partitionId !== 'string' ||
        isCriticalPlacementPartitionId(partitionId) ||
        !isSystemTablePartition({partitionId})) {
      continue;
    }
    placements.push(resolveCriticalPartitionPlacement({
      partitionId, partitionRow, serviceRows,
    }));
  }
  return placements;
}

function placementReason(placement, requiredDistinctNodeCount) {
  if (placement.evidenceState === CRITICAL_PLACEMENT_EVIDENCE_STATE.UNKNOWN) {
    return `${SPREAD_REASON.PARTITION_EVIDENCE_UNKNOWN}:` +
      `${placement.partitionId}:${placement.reasonCode}`;
  }
  if (placement.evidenceState ===
      CRITICAL_PLACEMENT_EVIDENCE_STATE.KNOWN_NOT_CONVERGED) {
    return `${SPREAD_REASON.PARTITION_NOT_SPREAD}:${placement.partitionId}:` +
      `${placement.distinctNodeCount}/${placement.requiredReplicaCount}`;
  }
  if (placement.requiredReplicaCount < requiredDistinctNodeCount) {
    return `${SPREAD_REASON.POLICY_BELOW_REQUIRED}:${placement.partitionId}:` +
      `${placement.requiredReplicaCount}/${requiredDistinctNodeCount}`;
  }
  return null;
}

function describePlacement(placement) {
  return Object.freeze({
    partitionId: placement.partitionId,
    evidenceState: placement.evidenceState,
    requiredReplicaCount: placement.requiredReplicaCount,
    distinctNodeCount: placement.distinctNodeCount,
    distinctNodeIds: placement.distinctNodeIds,
    reasonCode: placement.reasonCode,
  });
}

// How many partitions sit on how many distinct nodes, and how many each
// node holds: the two numbers that say "39 on one node" at a glance.
function summarizeConcentration(placements) {
  const partitionCountByDistinctNodeCount = {};
  const partitionCountByNodeId = {};
  for (const placement of placements) {
    const key = String(placement.distinctNodeCount);
    partitionCountByDistinctNodeCount[key] =
      (partitionCountByDistinctNodeCount[key] || 0) + 1;
    for (const nodeId of placement.distinctNodeIds) {
      partitionCountByNodeId[nodeId] =
        (partitionCountByNodeId[nodeId] || 0) + 1;
    }
  }
  return {partitionCountByDistinctNodeCount, partitionCountByNodeId};
}

/**
 * Evaluate the spread of every system partition over distinct nodes.
 *
 * @param {Object} input
 * @param {Object} input.authority {services, partitions,
 *   controlPlanePublications}, each {rows, complete} or {error}
 * @param {number} input.requiredDistinctNodeCount the declared formation
 *   spread (three for the three-node formation); no default
 * @return {Object} frozen {name, met, reasonCodes, detail}
 */
function evaluateSystemPartitionDistinctNodeSpread(input) {
  const requiredDistinctNodeCount = input?.requiredDistinctNodeCount;
  if (!Number.isSafeInteger(requiredDistinctNodeCount) ||
      requiredDistinctNodeCount < 1) {
    return unmet([SPREAD_REASON.REQUIRED_COUNT_UNDECLARED], {});
  }
  const {rowsByTable, reasons} = readAuthority(input.authority);
  if (reasons.length > 0) {
    return unmet(reasons, {requiredDistinctNodeCount});
  }
  const serviceRows = rowsByTable.get(SYSTEM_TABLE_NAME.SERVICES);
  const partitionRows = rowsByTable.get(SYSTEM_TABLE_NAME.PARTITIONS);
  const observation = observeCriticalPlacement({
    systemTableCache: {getAll: (tableName) => rowsByTable.get(tableName)},
  });
  const placements = [
    ...resolveCriticalPlacementConvergence({serviceRows, partitionRows})
      .partitions,
    ...resolveFurtherSystemPartitionPlacements(partitionRows, serviceRows),
  ];
  const reasonCodes = [];
  if (observation.membershipEpoch.state !==
      CRITICAL_PLACEMENT_EPOCH_STATE.AVAILABLE) {
    reasonCodes.push(SPREAD_REASON.MEMBERSHIP_EPOCH_UNAVAILABLE);
  }
  for (const placement of placements) {
    const reason = placementReason(placement, requiredDistinctNodeCount);
    if (reason !== null) {
      reasonCodes.push(reason);
    }
  }
  // The observer's verdict stands on its own: a set it does not answer
  // KNOWN_CONVERGED is unmet even where no single partition named why.
  if (observation.converged !== true && reasonCodes.length === 0) {
    reasonCodes.push(`${SPREAD_REASON.PLACEMENT_EVIDENCE_UNKNOWN}:` +
      `${observation.evidenceState}:${observation.reasonCodes.join(',')}`);
  }
  return Object.freeze({
    name: PREDICATE_NAME,
    met: observation.converged === true && reasonCodes.length === 0,
    reasonCodes: Object.freeze(reasonCodes),
    detail: Object.freeze({
      requiredDistinctNodeCount,
      evidenceState: observation.evidenceState,
      observerReasonCodes: observation.reasonCodes,
      membershipEpoch: observation.membershipEpoch,
      observedPartitionCount: placements.length,
      pendingPartitionIds: observation.pendingPartitionIds,
      unknownPartitionIds: observation.unknownPartitionIds,
      ...summarizeConcentration(placements),
      placements: Object.freeze(arrayMap(placements, describePlacement)),
    }),
  });
}

export {
  PREDICATE_NAME as SYSTEM_PARTITION_DISTINCT_NODE_SPREAD_PREDICATE,
  SPREAD_REASON as SYSTEM_PARTITION_DISTINCT_NODE_SPREAD_REASON,
  evaluateSystemPartitionDistinctNodeSpread,
};
