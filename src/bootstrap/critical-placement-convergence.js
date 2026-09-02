import {SERVICE_STATUS, SERVICE_TYPE} from '../constants/index.js';
import {isVoterRaftRole} from '../raft/replica-voter-readiness.js';
import {copyDenseOwnDataRecordArray} from '../utils/strict-own-data.js';
import {
  CRITICAL_SYSTEM_PARTITION_IDS,
  resolvePartitionTableId,
} from './system-partition-classification.js';
import {
  REPLICATION_TARGET_SOURCE,
  resolveDesiredReplicationFactor,
} from './replication-target-authority.js';

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
const MapConstructor = Map;
const mapDelete = Function.call.bind(Map.prototype.delete);
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
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

// Both persisted spellings of the partitions-row identity: the column is
// snake_case and the normalized in-memory row carries the camel alias, the
// same duality the replication-target authority accepts for replica_count.
const PARTITION_ROW_ID_FIELDS = Object.freeze(['partition_id', 'partitionId']);

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

// The three-state evidence vocabulary. UNKNOWN is a first-class answer, not a
// flavour of failure: absent or malformed policy evidence means the question
// "is this partition converged?" has no measurable answer, and reporting it
// as KNOWN_NOT_CONVERGED would let a guessed requirement drive repair while
// reporting it as KNOWN_CONVERGED would let absent evidence authorize
// traffic. A `converged` boolean still exists on every snapshot, but only as
// the strict projection evidenceState === KNOWN_CONVERGED: false always means
// "not authorized", never "known not converged".
const CRITICAL_PLACEMENT_EVIDENCE_STATE = Object.freeze({
  UNKNOWN: 'unknown',
  KNOWN_NOT_CONVERGED: 'known_not_converged',
  KNOWN_CONVERGED: 'known_converged',
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
 * Index persisted partitions policy rows by their own partition identity.
 * Own DATA properties only, first present spelling decides, and a row whose
 * two spellings disagree declares no identity — the same fail-closed rule the
 * replication-target authority applies to a disagreeing replica_count.
 * A DUPLICATE identity is ambiguous policy: two rows both claiming to be one
 * partition's policy cannot be ranked here, so the identity resolves to no
 * row at all and the partition's requirement stays unknown.
 *
 * @param {Object[]|null} partitionRows copied strict-own-data rows
 * @return {Map<string, Object>} identity -> policy row (ambiguous ids absent)
 */
function indexPartitionPolicyRows(partitionRows) {
  const rowsById = new MapConstructor();
  const ambiguousIds = new SetConstructor();
  if (partitionRows === null) {
    return rowsById;
  }
  for (let index = 0; index < partitionRows.length; index += 1) {
    const partitionRow = partitionRows[index];
    let rowId = EMPTY_STRING;
    let disagreement = false;
    for (let field = 0; field < PARTITION_ROW_ID_FIELDS.length; field += 1) {
      const value = readOwnField(partitionRow, PARTITION_ROW_ID_FIELDS[field]);
      if (value.length === 0) {
        continue;
      }
      if (rowId.length === 0) {
        rowId = value;
      } else if (rowId !== value) {
        disagreement = true;
      }
    }
    if (rowId.length === 0 || disagreement) {
      continue;
    }
    if (setHas(ambiguousIds, rowId)) {
      continue;
    }
    if (mapHas(rowsById, rowId)) {
      mapDelete(rowsById, rowId);
      setAdd(ambiguousIds, rowId);
      continue;
    }
    mapSet(rowsById, rowId, partitionRow);
  }
  return rowsById;
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
/**
 * One eligible-serving read per row, shared by the single-partition scan and
 * the aggregate's grouping index so the two paths cannot drift apart.
 * ACTIVE only: the rebalancer's quorum predicate also counts REMOVING,
 * because a removing replica's ack is still needed mid-REPLACE — that is a
 * quorum-ack question. Formation convergence asks whether the spread has
 * SETTLED, and counting a replica on its way out would declare convergence
 * on a spread about to shrink.
 *
 * @param {Object} serviceRow one copied strict-own-data row
 * @return {Object|null} {partitionId, nodeId} for an eligible voting row
 */
function readEligibleServingRow(serviceRow) {
  if (readOwnField(serviceRow, SERVICE_ROW_FIELD.STATUS) !==
      SERVICE_STATUS.ACTIVE) {
    return null;
  }
  if (readOwnField(serviceRow, SERVICE_ROW_FIELD.SERVICE_TYPE) !==
      SERVICE_TYPE.PARTITION) {
    return null;
  }
  if (!isVoterRaftRole(readOwnField(serviceRow, SERVICE_ROW_FIELD.RAFT_ROLE))) {
    return null;
  }
  const nodeId = readOwnField(serviceRow, SERVICE_ROW_FIELD.NODE_ID);
  if (nodeId.length === 0) {
    return null;
  }
  const partitionId = readOwnField(
    serviceRow, SERVICE_ROW_FIELD.PARTITION_ID);
  if (partitionId.length === 0) {
    return null;
  }
  return {partitionId, nodeId};
}

function resolveDistinctServingNodeIds(serviceRows, partitionId) {
  const distinctNodeIds = new SetConstructor();
  for (let index = 0; index < serviceRows.length; index += 1) {
    const eligible = readEligibleServingRow(serviceRows[index]);
    if (eligible === null || eligible.partitionId !== partitionId) {
      continue;
    }
    setAdd(distinctNodeIds, eligible.nodeId);
  }
  const nodeIds = drainSetValues(distinctNodeIds);
  sortArray(nodeIds);
  return nodeIds;
}

/**
 * One pass over the copied service rows, grouping distinct serving node ids
 * by partition. The aggregate ran the per-partition scan once per critical
 * partition, which re-read every row ~45 times per projection — measured at
 * ~55ms per observation on a realistic seven-node shape, which is real
 * event-loop load on the 500ms join barrier poll this projection now rides.
 * Same filters, one traversal.
 *
 * @param {Object[]} serviceRows copied strict-own-data rows
 * @return {Map<string, Set<string>>} partitionId -> distinct node ids
 */
function indexServingNodeIdsByPartition(serviceRows) {
  const nodeIdsByPartition = new MapConstructor();
  for (let index = 0; index < serviceRows.length; index += 1) {
    const eligible = readEligibleServingRow(serviceRows[index]);
    if (eligible === null) {
      continue;
    }
    let nodeIds = mapGet(nodeIdsByPartition, eligible.partitionId);
    if (nodeIds === undefined) {
      nodeIds = new SetConstructor();
      mapSet(nodeIdsByPartition, eligible.partitionId, nodeIds);
    }
    setAdd(nodeIds, eligible.nodeId);
  }
  return nodeIdsByPartition;
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

// An unknown requirement can answer nothing; a valid requirement makes the
// holder measurement decisive either way. EVIDENCE_ABSENT stays a KNOWN
// deficit deliberately: the service rows handed in are the authoritative
// holder projection, and a readable projection with no active voting row for
// a partition is a real measurement of zero holders, not missing knowledge.
// Whether the projection itself was readable is the OBSERVER's question, and
// an unreadable one never reaches this function.
function resolveEvidenceStateForReason(reasonCode) {
  if (reasonCode === CRITICAL_PLACEMENT_REASON.REQUIRED_COUNT_UNKNOWN) {
    return CRITICAL_PLACEMENT_EVIDENCE_STATE.UNKNOWN;
  }
  return reasonCode === CRITICAL_PLACEMENT_REASON.CONVERGED ?
    CRITICAL_PLACEMENT_EVIDENCE_STATE.KNOWN_CONVERGED :
    CRITICAL_PLACEMENT_EVIDENCE_STATE.KNOWN_NOT_CONVERGED;
}

/**
 * Placement convergence for one critical partition. This is a projection over
 * supplied rows: it mints no readiness verdict and no lifecycle transition,
 * and derives nothing from nodes.status, publication counts, or coverage.
 *
 * The required replica count resolves EXCLUSIVELY through the
 * replication-target authority on this partition's persisted policy row.
 * There is deliberately no other source: not the declared initial replica
 * identities (an identity count is runtime state, not policy — the exact
 * drifted-denominator defect the epic measured), not a schema creation
 * default (that seeds a NEW row; it is not a reading of a row that failed to
 * declare one), and not a table-policy fallback. Where the authority decodes
 * UNDECLARED, the requirement is unknown and the evidence is UNKNOWN.
 *
 * @param {Object} options
 * @param {string} options.partitionId
 * @param {Object[]} [options.serviceRows]
 * @param {Object|null} [options.partitionRow] persisted partitions policy row
 * @return {Object} frozen placement snapshot
 */
function resolveCriticalPartitionPlacement(options = {}) {
  const partitionId = normalizeNonEmptyString(options.partitionId);
  const serviceRows = copyDenseOwnDataRecordArray(options.serviceRows) || [];
  return resolvePlacementFromMeasuredNodeIds({
    partitionId,
    partitionRow: options.partitionRow,
    distinctNodeIds: resolveDistinctServingNodeIds(serviceRows, partitionId),
  });
}

/**
 * The placement decision over ALREADY-MEASURED distinct node ids. Internal:
 * the copy and the eligibility filters have run exactly once upstream —
 * either in the public per-partition entry or in the aggregate's single
 * grouping pass — so this stage holds only the authority resolution and the
 * three-state decision.
 *
 * @param {Object} options
 * @return {Object} frozen placement snapshot
 */
function resolvePlacementFromMeasuredNodeIds(options) {
  const partitionId = options.partitionId;
  const tableId = resolvePartitionTableId({partitionId}) || EMPTY_STRING;
  // The authority performs its own strict own-data read and never executes
  // an accessor, so the row is handed through unwrapped: the only runtime
  // value the decoder receives IS the persisted policy.
  const desiredReplication = resolveDesiredReplicationFactor(
    options.partitionRow ?? null,
  );
  const requiredReplicaCount =
    desiredReplication.source === REPLICATION_TARGET_SOURCE.PARTITION_ROW ?
      desiredReplication.replicationFactor :
      0;
  const distinctNodeIds = options.distinctNodeIds;
  const distinctNodeCount = distinctNodeIds.length;
  const reasonCode = resolvePlacementReason(
    requiredReplicaCount,
    distinctNodeCount,
  );
  const evidenceState = resolveEvidenceStateForReason(reasonCode);
  return Object.freeze({
    partitionId,
    tableId,
    requiredReplicaCount,
    requiredReplicaCountSource: desiredReplication.source,
    distinctNodeCount,
    distinctNodeIds: Object.freeze(distinctNodeIds),
    evidenceState,
    converged:
      evidenceState === CRITICAL_PLACEMENT_EVIDENCE_STATE.KNOWN_CONVERGED,
    reasonCode,
  });
}

/**
 * The whole-set evidence decision, over COUNTS alone. Extracted so the empty
 * and mixed cases are directly pinnable. An empty critical set measures
 * nothing and is UNKNOWN. One partition with a proven deficit makes the SET
 * provenly not converged — a deficit measured under valid policy is knowledge
 * that no unknown neighbour can retract. Only a set whose every partition is
 * measurably satisfied is KNOWN_CONVERGED: a single unknown partition blocks
 * it, because convergence claimed over an unreadable requirement is a guess.
 *
 * Callable surface, stated so a future consumer is not misled: this validates
 * nothing about its arguments. It is a decision over counts the projection
 * has already measured, NOT an entry point for convergence: computing counts
 * by hand would skip the partition filter, the voter filter, the authority
 * resolution and the distinct-node measurement entirely. Only
 * resolveCriticalPlacementConvergence may supply them.
 *
 * @param {number} unknownCount partitions whose evidence is UNKNOWN
 * @param {number} pendingCount partitions KNOWN_NOT_CONVERGED
 * @param {number} partitionCount all inspected critical partitions
 * @return {string} CRITICAL_PLACEMENT_EVIDENCE_STATE member
 */
function resolveAggregatePlacementEvidenceState(
  unknownCount, pendingCount, partitionCount,
) {
  if (partitionCount <= 0) {
    return CRITICAL_PLACEMENT_EVIDENCE_STATE.UNKNOWN;
  }
  if (pendingCount > 0) {
    return CRITICAL_PLACEMENT_EVIDENCE_STATE.KNOWN_NOT_CONVERGED;
  }
  if (unknownCount > 0) {
    return CRITICAL_PLACEMENT_EVIDENCE_STATE.UNKNOWN;
  }
  return CRITICAL_PLACEMENT_EVIDENCE_STATE.KNOWN_CONVERGED;
}

/**
 * Placement convergence across the whole declared critical partition set.
 * Fails closed in every direction: absent holder evidence under valid policy
 * is a measured deficit, absent or malformed POLICY evidence is UNKNOWN and
 * never either KNOWN state, and the aggregate claims KNOWN_CONVERGED only
 * when every partition is measurably satisfied.
 *
 * @param {Object} options
 * @param {Object[]} [options.serviceRows]
 * @param {Object[]} [options.partitionRows] persisted partitions policy rows
 * @return {Object} frozen convergence snapshot
 */
function resolveCriticalPlacementConvergence(options = {}) {
  const serviceRows = copyDenseOwnDataRecordArray(options.serviceRows) || [];
  // One malformed ROW nukes the copied array to null by design (a container
  // that cannot be strictly read is not partially trustworthy); every policy
  // then resolves UNDECLARED and the whole set reports UNKNOWN — closed, in
  // the only safe direction.
  const partitionRowsById = indexPartitionPolicyRows(
    copyDenseOwnDataRecordArray(options.partitionRows),
  );
  const partitionIds = drainSetValues(CRITICAL_SYSTEM_PARTITION_IDS);
  sortArray(partitionIds);
  const servingNodeIdsByPartition = indexServingNodeIdsByPartition(serviceRows);

  const partitions = [];
  const pendingPartitionIds = [];
  const unknownPartitionIds = [];
  for (let index = 0; index < partitionIds.length; index += 1) {
    const measuredNodeIds = drainSetValues(
      mapGet(servingNodeIdsByPartition, partitionIds[index]) ??
        new SetConstructor(),
    );
    sortArray(measuredNodeIds);
    const placement = resolvePlacementFromMeasuredNodeIds({
      partitionId: partitionIds[index],
      distinctNodeIds: measuredNodeIds,
      partitionRow: mapGet(partitionRowsById, partitionIds[index]) ?? null,
    });
    arrayPush(partitions, placement);
    if (placement.evidenceState ===
        CRITICAL_PLACEMENT_EVIDENCE_STATE.KNOWN_NOT_CONVERGED) {
      arrayPush(pendingPartitionIds, placement.partitionId);
    } else if (placement.evidenceState ===
        CRITICAL_PLACEMENT_EVIDENCE_STATE.UNKNOWN) {
      arrayPush(unknownPartitionIds, placement.partitionId);
    }
  }

  const evidenceState = resolveAggregatePlacementEvidenceState(
    unknownPartitionIds.length,
    pendingPartitionIds.length,
    partitions.length,
  );
  return Object.freeze({
    evidenceState,
    converged:
      evidenceState === CRITICAL_PLACEMENT_EVIDENCE_STATE.KNOWN_CONVERGED,
    partitions: Object.freeze(partitions),
    pendingPartitionIds: Object.freeze(pendingPartitionIds),
    unknownPartitionIds: Object.freeze(unknownPartitionIds),
  });
}

function isCriticalPlacementPartitionId(partitionId) {
  return setHas(
    CRITICAL_SYSTEM_PARTITION_IDS,
    normalizeNonEmptyString(partitionId),
  );
}

export {
  CRITICAL_PLACEMENT_EVIDENCE_STATE,
  CRITICAL_PLACEMENT_REASON,
  isCriticalPlacementPartitionId,
  resolveAggregatePlacementEvidenceState,
  resolveCriticalPartitionPlacement,
  resolveCriticalPlacementConvergence,
};
