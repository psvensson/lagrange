import {SERVICE_STATUS, SERVICE_TYPE} from '../constants/index.js';
import {isVoterRaftRole} from '../raft/replica-voter-readiness.js';
import {copyDenseOwnDataRecordArray} from '../utils/strict-own-data.js';
import {
  CRITICAL_SYSTEM_PARTITION_IDS,
  resolvePartitionTableId,
} from './system-partition-classification.js';
import {getInitialReplicaIds} from './system-table-schemas-constants.js';

const arrayIsArray = Array.isArray;
const arrayPush = Function.call.bind(Array.prototype.push);
const sortArray = Function.call.bind(Array.prototype.sort);
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const SetConstructor = Set;
const setAdd = Function.call.bind(Set.prototype.add);
const setHas = Function.call.bind(Set.prototype.has);
const setValues = Function.call.bind(Set.prototype.values);
const setIteratorNext = Function.call.bind(
  Object.getPrototypeOf(setValues(new Set())).next,
);
const stringTrim = Function.call.bind(String.prototype.trim);
const DESCRIPTOR_VALUE_FIELD = 'value';
const EMPTY_STRING = '';

// Service-row column names, named once here rather than written raw at each
// read site.
const SERVICE_ROW_FIELD = Object.freeze({
  NODE_ID: 'node_id',
  PARTITION_ID: 'partition_id',
  RAFT_ROLE: 'raft_role',
  SERVICE_TYPE: 'service_type',
  STATUS: 'status',
});

/**
 * Drain a Set through its captured iterator rather than Set.prototype.forEach,
 * which is a seam an ambient callback can use to inject values that were never
 * added. The idiom matches system-partition-classification.js.
 *
 * @param {Set<string>} values
 * @return {string[]}
 */
function drainSetValues(values) {
  const drained = [];
  const iterator = setValues(values);
  for (let step = setIteratorNext(iterator);
    !step.done;
    step = setIteratorNext(iterator)) {
    arrayPush(drained, step.value);
  }
  return drained;
}

// Why this exists: system tables are created with their full replica count
// already satisfied on the seed alone (system-table-schemas-constants.js:
// "Each partition has 3 replicas on the seed node"). A logical replica count
// is therefore satisfied at t=0 by a single-node cluster and proves nothing
// about serving topology. The only sound formation question is how many
// DISTINCT nodes actually hold a QUORUM-VOTING replica of the partition:
// learners are catching up and guarantee no quorum, so they are not eligible
// serving capacity. The voter predicate is the canonical isVoterRaftRole
// (raft/replica-voter-readiness.js), not a local copy.
const CRITICAL_PLACEMENT_REASON = Object.freeze({
  CONVERGED: 'converged',
  EVIDENCE_ABSENT: 'placement_evidence_absent',
  INSUFFICIENT_DISTINCT_NODES: 'insufficient_distinct_nodes',
  REQUIRED_COUNT_UNKNOWN: 'required_replica_count_unknown',
});

function normalizeNonEmptyString(value) {
  if (typeof value !== 'string') {
    return EMPTY_STRING;
  }
  return stringTrim(value);
}

function readOwnField(record, propertyName) {
  const descriptor = objectGetOwnPropertyDescriptor(record, propertyName);
  if (!descriptor || !objectHasOwn(descriptor, DESCRIPTOR_VALUE_FIELD)) {
    return EMPTY_STRING;
  }
  return normalizeNonEmptyString(descriptor.value);
}

/**
 * Required replica count for one critical partition, read from the declared
 * initial replica IDs rather than any local replication-factor literal.
 *
 * @param {string} tableId
 * @return {number} the declared count, or 0 when the table declares none.
 */
function resolveRequiredReplicaCount(tableId) {
  const initialReplicaIds = getInitialReplicaIds(tableId);
  return arrayIsArray(initialReplicaIds) ? initialReplicaIds.length : 0;
}

/**
 * Distinct serving node IDs holding one partition. A node that holds several
 * replicas of the same partition contributes one failure domain, so it is
 * counted once; non-active rows contribute none.
 *
 * @param {Object[]} serviceRows
 * @param {string} partitionId
 * @return {string[]} sorted distinct node IDs
 */
function resolveDistinctServingNodeIds(serviceRows, partitionId) {
  const distinctNodeIds = new SetConstructor();
  for (let index = 0; index < serviceRows.length; index += 1) {
    const serviceRow = serviceRows[index];
    if (readOwnField(serviceRow, SERVICE_ROW_FIELD.PARTITION_ID) !==
        partitionId) {
      continue;
    }
    // ACTIVE only. The rebalancer's quorum predicate also counts REMOVING,
    // because a removing replica's ack is still needed mid-REPLACE — that is a
    // quorum-ack question. Formation convergence asks whether the spread has
    // SETTLED, and counting a replica on its way out would declare convergence
    // on a spread about to shrink.
    if (readOwnField(serviceRow, SERVICE_ROW_FIELD.STATUS) !==
        SERVICE_STATUS.ACTIVE) {
      continue;
    }
    if (readOwnField(serviceRow, SERVICE_ROW_FIELD.SERVICE_TYPE) !==
        SERVICE_TYPE.PARTITION) {
      continue;
    }
    if (!isVoterRaftRole(readOwnField(serviceRow, SERVICE_ROW_FIELD.RAFT_ROLE))) {
      continue;
    }
    const nodeId = readOwnField(serviceRow, SERVICE_ROW_FIELD.NODE_ID);
    if (nodeId.length === 0) {
      continue;
    }
    setAdd(distinctNodeIds, nodeId);
  }
  const nodeIds = drainSetValues(distinctNodeIds);
  sortArray(nodeIds);
  return nodeIds;
}

function resolvePlacementReason(requiredReplicaCount, distinctNodeCount) {
  if (requiredReplicaCount === 0) {
    return CRITICAL_PLACEMENT_REASON.REQUIRED_COUNT_UNKNOWN;
  }
  if (distinctNodeCount === 0) {
    return CRITICAL_PLACEMENT_REASON.EVIDENCE_ABSENT;
  }
  return distinctNodeCount >= requiredReplicaCount ?
    CRITICAL_PLACEMENT_REASON.CONVERGED :
    CRITICAL_PLACEMENT_REASON.INSUFFICIENT_DISTINCT_NODES;
}

/**
 * Placement convergence for one critical partition. This is a projection over
 * supplied rows: it mints no readiness verdict and no lifecycle transition,
 * and derives nothing from nodes.status, publication counts, or coverage.
 *
 * @param {Object} options
 * @param {string} options.partitionId
 * @param {Object[]} [options.serviceRows]
 * @return {Object} frozen placement snapshot
 */
function resolveCriticalPartitionPlacement(options = {}) {
  const partitionId = normalizeNonEmptyString(options.partitionId);
  const serviceRows = copyDenseOwnDataRecordArray(options.serviceRows) || [];
  const tableId = resolvePartitionTableId({partitionId}) || EMPTY_STRING;
  const requiredReplicaCount = resolveRequiredReplicaCount(tableId);
  const distinctNodeIds = resolveDistinctServingNodeIds(
    serviceRows,
    partitionId,
  );
  const distinctNodeCount = distinctNodeIds.length;
  const reasonCode = resolvePlacementReason(
    requiredReplicaCount,
    distinctNodeCount,
  );
  return Object.freeze({
    partitionId,
    tableId,
    requiredReplicaCount,
    distinctNodeCount,
    distinctNodeIds: Object.freeze(distinctNodeIds),
    converged: reasonCode === CRITICAL_PLACEMENT_REASON.CONVERGED,
    reasonCode,
  });
}

/**
 * Placement convergence across the whole declared critical partition set.
 * Convergence is all-or-nothing and fails closed: absent evidence is never
 * read as satisfaction.
 *
 * @param {Object} options
 * @param {Object[]} [options.serviceRows]
 * @return {Object} frozen convergence snapshot
 */
function resolveCriticalPlacementConvergence(options = {}) {
  const serviceRows = copyDenseOwnDataRecordArray(options.serviceRows) || [];
  const partitionIds = drainSetValues(CRITICAL_SYSTEM_PARTITION_IDS);
  sortArray(partitionIds);

  const partitions = [];
  const pendingPartitionIds = [];
  for (let index = 0; index < partitionIds.length; index += 1) {
    const placement = resolveCriticalPartitionPlacement({
      partitionId: partitionIds[index],
      serviceRows,
    });
    arrayPush(partitions, placement);
    if (!placement.converged) {
      arrayPush(pendingPartitionIds, placement.partitionId);
    }
  }

  return Object.freeze({
    converged: isConvergedPlacementCount(
      pendingPartitionIds.length, partitions.length),
    partitions: Object.freeze(partitions),
    pendingPartitionIds: Object.freeze(pendingPartitionIds),
  });
}

/**
 * The convergence decision, over COUNTS alone. Extracted so the empty-set case
 * is directly pinnable: an empty critical set has no pending partitions, so a
 * bare `pendingCount === 0` would report convergence over nothing. Taking
 * counts rather than a partition list keeps the critical-set vocabulary in one
 * owner.
 *
 * @param {number} pendingCount
 * @param {number} partitionCount
 * @return {boolean}
 */
// Callable surface, stated so a future consumer is not misled: this validates
// nothing about its arguments. (0, 1) is true, and so are (0, 0.5) and
// (0, Infinity). It is a decision over counts the projection has already
// measured, NOT an entry point for convergence: computing counts by hand would
// skip the partition filter, the voter filter and the distinct-node
// measurement entirely. Only resolveCriticalPlacementConvergence may supply them.
function isConvergedPlacementCount(pendingCount, partitionCount) {
  return partitionCount > 0 && pendingCount === 0;
}

function isCriticalPlacementPartitionId(partitionId) {
  return setHas(
    CRITICAL_SYSTEM_PARTITION_IDS,
    normalizeNonEmptyString(partitionId),
  );
}

export {
  CRITICAL_PLACEMENT_REASON,
  isConvergedPlacementCount,
  isCriticalPlacementPartitionId,
  resolveCriticalPartitionPlacement,
  resolveCriticalPlacementConvergence,
};
