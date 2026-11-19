// Durable cluster formation declaration and latch record on
// control_plane_publications-p1 (publication_id = 'cluster_formation'),
// decoded by ServeEligibilityOwner.answerFormation() and advanced only by the
// FORMATION_TRANSITION committed command (DECLARE -> LATCH).
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {PRIORITY_CONTROL_PLANE_TABLE_IDS} from
  '../bootstrap/system-partition-classification.js';
import {
  REPLICATION_TARGET_SOURCE,
  resolveDesiredReplicationFactor,
  resolveVoterTarget,
} from '../bootstrap/replication-target-authority.js';
import {COLUMN, SERVICE_TYPE, TABLES} from '../constants/index.js';
import {deepFreeze} from '../raft/raft-operation-port.js';
import {isCaughtUpVoterReadyReplica} from
  '../raft/replica-voter-readiness.js';
import {PLACEMENT_FORMATION_STATE} from
  '../rebalancer/replica-placement-owner-constants.js';
import {NODE_HOST_IDENTITY_STATE, readNodeHostIdentity} from
  '../topology/node-host-identity.js';
import {readUpperStateField} from '../utils/state-field-read.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {projectNodeLivenessSemantics} from
  './node-liveness-semantic-projection.js';

const FORMATION_PUBLICATION_ID = 'cluster_formation';
const FORMATION_PUBLICATION_KIND = 'cluster_formation';
const FORMATION_RECORD_VERSION = 1;
const FORMATION_TRANSITION_TYPE = 'FORMATION_TRANSITION';
const PUBLICATIONS_PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS];
const PRIORITY_PARTITION_IDS = Object.freeze(
  [...PRIORITY_CONTROL_PLANE_TABLE_IDS]
    .sort()
    .map((tableName) => INITIAL_PARTITION_IDS[tableName]),
);
const MEMBERSHIP_PUBLICATION_KIND = 'cluster_membership';
const PUBLISHED_STATUS = 'PUBLISHED';
const MIN_MULTI_HOST_DECLARED_COUNT = 3;
const FORMATION_DECLARED_PENDING_REASON = 'declared_hosts_pending';
const FORMATION_DECLARED_HOST_UNIT = 'declared_host';
const SELECT_FORMATION_ROW_SQL =
  'SELECT * FROM control_plane_publications WHERE publication_id = ?';

const FORMATION_RECORD_STATUS = Object.freeze({
  DECLARED: 'DECLARED',
  FORMED: 'FORMED',
});
const FORMATION_TRANSITION_ACTION = Object.freeze({
  DECLARE: 'DECLARE',
  LATCH: 'LATCH',
});
const FORMATION_TRANSITION_OUTCOME = Object.freeze({
  APPLIED: 'APPLIED',
  SETTLED: 'SETTLED',
  REFUSED: 'REFUSED',
});
const FORMATION_REFUSAL_REASON = Object.freeze({
  ABSENT: 'FORMATION_RECORD_ABSENT',
  MALFORMED: 'FORMATION_RECORD_MALFORMED',
  IDENTITY_MISMATCH: 'FORMATION_RECORD_IDENTITY_MISMATCH',
  CLUSTER_MISMATCH: 'FORMATION_CLUSTER_MISMATCH',
  ALREADY_DECLARED: 'FORMATION_ALREADY_DECLARED',
  ALREADY_FORMED: 'FORMATION_ALREADY_FORMED',
  NOT_DECLARED: 'FORMATION_NOT_DECLARED',
  INVALID_COMMAND: 'FORMATION_TRANSITION_COMMAND_INVALID',
  ORIGIN_REFUSED: 'FORMATION_TRANSITION_ORIGIN_REFUSED',
  TARGET_PARTITION_INVALID: 'FORMATION_TRANSITION_TARGET_PARTITION_INVALID',
  CDC_CAPACITY: 'PARTITION_CDC_OWED_CAPACITY_EXCEEDED',
  PRIORITY_PARTITION_POLICY_UNREADABLE: 'PRIORITY_PARTITION_POLICY_UNREADABLE',
  PRIORITY_PARTITION_VOTER_TARGET_PENDING:
    'PRIORITY_PARTITION_VOTER_TARGET_PENDING',
  PUBLISHED_MEMBERSHIP_ABSENT: 'PUBLISHED_MEMBERSHIP_ABSENT',
  DECLARED_HOST_QUORUM_PENDING: 'DECLARED_HOST_QUORUM_PENDING',
});

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidDeclaredHostCount(value) {
  return (
    Number.isSafeInteger(value) &&
    (value === 1 || value >= MIN_MULTI_HOST_DECLARED_COUNT)
  );
}

function isNonEmptyStringArray(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => isNonEmptyString(entry))
  );
}

function hasDistinctHostList(hostIds, minCount) {
  return (
    isNonEmptyStringArray(hostIds) &&
    hostIds.length >= minCount &&
    new Set(hostIds).size === hostIds.length
  );
}

function parseFormationRecordPayload(raw) {
  if (isPlainObject(raw)) {
    return raw;
  }
  let parsed = null;
  if (isNonEmptyString(raw)) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  return isPlainObject(parsed) ? parsed : null;
}

function isValidDeclaredNullFields(record) {
  return (
    record.formedAt === null &&
    record.formedByNodeId === null &&
    record.formedPublicationEpoch === null &&
    record.formedHostIds === null &&
    record.formedReadyNodeIds === null &&
    record.priorityPartitionVoters === null
  );
}

function isValidFormedIdentity(record, minDeclaredAt = 0) {
  return (
    Number.isSafeInteger(record.formedAt) &&
    record.formedAt >= minDeclaredAt &&
    isNonEmptyString(record.formedByNodeId) &&
    Number.isSafeInteger(record.formedPublicationEpoch) &&
    record.formedPublicationEpoch >= 1
  );
}

function isValidFormedTopology(record) {
  return (
    hasDistinctHostList(record.formedHostIds, record.declaredHostCount) &&
    isNonEmptyStringArray(record.formedReadyNodeIds) &&
    record.formedReadyNodeIds.length >= record.declaredHostCount &&
    isPlainObject(record.priorityPartitionVoters)
  );
}

function isValidFormedFields(record) {
  return (
    isValidFormedIdentity(record, record.declaredAt) &&
    isValidFormedTopology(record)
  );
}

function isValidFormationStatus(status) {
  return (
    status === FORMATION_RECORD_STATUS.DECLARED ||
    status === FORMATION_RECORD_STATUS.FORMED
  );
}

function hasValidFormationRecordEnvelope(row, record) {
  if (!record || record.version !== FORMATION_RECORD_VERSION) {
    return false;
  }
  const hasValidHeader =
    isNonEmptyString(record.clusterId) &&
    isValidDeclaredHostCount(record.declaredHostCount) &&
    isNonEmptyString(record.declaredByNodeId) &&
    Number.isSafeInteger(record.declaredAt) &&
    record.declaredAt >= 0;
  return (
    hasValidHeader &&
    isValidFormationStatus(record.status) &&
    row.status === record.status
  );
}

function extractExpectedClusterId(options) {
  if (isNonEmptyString(options)) {
    return options;
  }
  return isNonEmptyString(options?.clusterId) ? options.clusterId : null;
}

function buildUnavailableFormation(reason, extra = {}) {
  return Object.freeze({
    state: PLACEMENT_FORMATION_STATE.UNAVAILABLE,
    reason,
    latchEpoch: null,
    ...extra,
  });
}

function buildFormingFormation(row, record) {
  const epoch = Number(row.publication_epoch);
  return Object.freeze({
    state: PLACEMENT_FORMATION_STATE.FORMING,
    status: FORMATION_RECORD_STATUS.DECLARED,
    reason: FORMATION_DECLARED_PENDING_REASON,
    unit: FORMATION_DECLARED_HOST_UNIT,
    clusterId: record.clusterId,
    declaredHostCount: record.declaredHostCount,
    declaredByNodeId: record.declaredByNodeId,
    declaredAt: record.declaredAt,
    readyHostCount: 0,
    missingHostCount: record.declaredHostCount,
    readyHosts: Object.freeze([]),
    missingHosts: Object.freeze([]),
    blockedPartitionIds: Object.freeze([]),
    publicationEpoch: Number.isSafeInteger(epoch) ? epoch : 0,
    formedAt: null,
    formedByNodeId: null,
    formedPublicationEpoch: null,
    latchEpoch: null,
    formedHostIds: null,
    formedReadyNodeIds: null,
    formedNodeIds: null,
    priorityPartitionVoters: null,
    requirementByPartitionId: null,
  });
}

function buildFormedFormation(record) {
  const frozenHostIds = Object.freeze([...record.formedHostIds]);
  const frozenNodeIds = Object.freeze([...record.formedReadyNodeIds]);
  const frozenVoters = deepFreeze(
    structuredClone(record.priorityPartitionVoters),
  );
  return Object.freeze({
    state: PLACEMENT_FORMATION_STATE.FORMED,
    status: FORMATION_RECORD_STATUS.FORMED,
    unit: FORMATION_DECLARED_HOST_UNIT,
    clusterId: record.clusterId,
    declaredHostCount: record.declaredHostCount,
    declaredByNodeId: record.declaredByNodeId,
    declaredAt: record.declaredAt,
    formedAt: record.formedAt,
    formedByNodeId: record.formedByNodeId,
    formedPublicationEpoch: record.formedPublicationEpoch,
    latchEpoch: record.formedPublicationEpoch,
    formedHostIds: frozenHostIds,
    formedReadyNodeIds: frozenNodeIds,
    formedNodeIds: frozenNodeIds,
    priorityPartitionVoters: frozenVoters,
    requirementByPartitionId: frozenVoters,
  });
}

function decodeValidatedFormationRecord(row, record) {
  if (record.status === FORMATION_RECORD_STATUS.DECLARED) {
    return isValidDeclaredNullFields(record) ?
      buildFormingFormation(row, record) :
      buildUnavailableFormation(FORMATION_REFUSAL_REASON.MALFORMED);
  }
  return isValidFormedFields(record) ?
    buildFormedFormation(record) :
    buildUnavailableFormation(FORMATION_REFUSAL_REASON.MALFORMED);
}

function decodeFormationRecord(row, options = {}) {
  const expectedClusterId = extractExpectedClusterId(options);
  if (row === null || row === undefined) {
    return Object.freeze({
      state: PLACEMENT_FORMATION_STATE.UNDECLARED,
      reason: FORMATION_REFUSAL_REASON.ABSENT,
      clusterId: expectedClusterId,
      latchEpoch: null,
    });
  }
  if (
    !isPlainObject(row) ||
    row.publication_id !== FORMATION_PUBLICATION_ID ||
    row.publication_kind !== FORMATION_PUBLICATION_KIND
  ) {
    return buildUnavailableFormation(
      FORMATION_REFUSAL_REASON.IDENTITY_MISMATCH,
    );
  }
  const record = parseFormationRecordPayload(row.formation_record);
  if (!hasValidFormationRecordEnvelope(row, record)) {
    return buildUnavailableFormation(FORMATION_REFUSAL_REASON.MALFORMED);
  }
  if (expectedClusterId !== null && record.clusterId !== expectedClusterId) {
    return buildUnavailableFormation(
      FORMATION_REFUSAL_REASON.CLUSTER_MISMATCH,
      {clusterId: record.clusterId, expectedClusterId},
    );
  }
  return decodeValidatedFormationRecord(row, record);
}

function parseJsonStringArray(value) {
  let parsed = Array.isArray(value) ? value : null;
  if (!parsed && isNonEmptyString(value)) {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = null;
    }
  }
  return Array.isArray(parsed) ?
    parsed.filter((item) => isNonEmptyString(item)) :
    [];
}

function isAcknowledgedPublishedMembershipRow(row) {
  if (
    !row ||
    row.publication_kind !== MEMBERSHIP_PUBLICATION_KIND ||
    readUpperStateField(row.status) !== PUBLISHED_STATUS
  ) {
    return false;
  }
  const activeIds = parseJsonStringArray(row.published_active_node_ids);
  if (activeIds.length === 0) {
    return false;
  }
  const ackSet = new Set(parseJsonStringArray(row.acknowledged_node_ids));
  return activeIds.every((nodeId) => ackSet.has(nodeId));
}

function findLatestAcknowledgedMembershipRow(publicationRows, publicationRow) {
  const candidates = [
    ...(publicationRow ? [publicationRow] : []),
    ...(Array.isArray(publicationRows) ? publicationRows : []),
  ];
  let best = null;
  for (const row of candidates) {
    const epoch = Number(row?.publication_epoch);
    if (
      isAcknowledgedPublishedMembershipRow(row) &&
      Number.isSafeInteger(epoch) &&
      epoch >= 1 &&
      (best === null || epoch > Number(best.publication_epoch))
    ) {
      best = row;
    }
  }
  return best;
}

function extractNodeDeclaredHost(row, publishedSet, floorMap, nowMs) {
  const nodeId = row?.[COLUMN.NODE_ID];
  const hostIdentity =
    isNonEmptyString(nodeId) && publishedSet.has(nodeId) ?
      readNodeHostIdentity(row) :
      undefined;
  const evaluation =
    hostIdentity?.state === NODE_HOST_IDENTITY_STATE.DECLARED ?
      (floorMap?.get(nodeId) ||
        projectNodeLivenessSemantics({nodeRow: row, nowMs}).projection) :
      undefined;
  return evaluation?.readyNow === true ?
    {eligible: true, hostId: hostIdentity.hostId} :
    {eligible: false};
}

function collectReadyPublishedNodes(
  publishedNodeIds,
  nodeRows,
  committedNodeFloor,
  nowMs,
) {
  const publishedSet = new Set(publishedNodeIds);
  const matchedNodes = [];
  const matchedHosts = new Set();
  const hostIdByNodeId = new Map();
  const floorMap = committedNodeFloor?.nodeSemanticsById;
  const synthesizedFloor = new Map();
  for (const row of Array.isArray(nodeRows) ? nodeRows : []) {
    const hostCheck = extractNodeDeclaredHost(
      row,
      publishedSet,
      floorMap,
      nowMs,
    );
    if (!hostCheck.eligible) {
      continue;
    }
    const nodeId = row[COLUMN.NODE_ID];
    matchedNodes.push(nodeId);
    matchedHosts.add(hostCheck.hostId);
    hostIdByNodeId.set(nodeId, hostCheck.hostId);
    synthesizedFloor.set(nodeId, Object.freeze({readyNow: true}));
  }
  return {
    readyNodeIds: matchedNodes.sort(),
    readyHostIds: [...matchedHosts].sort(),
    hostIdByNodeId,
    committedNodeFloor: floorMap ?
      committedNodeFloor :
      Object.freeze({nodeSemanticsById: synthesizedFloor}),
  };
}

function isMatchingCaughtUpPartitionVoter(row, partitionId, context) {
  return (
    row?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
    row?.[COLUMN.PARTITION_ID] === partitionId &&
    context.readyNodeIdSet.has(row?.[COLUMN.NODE_ID]) &&
    isCaughtUpVoterReadyReplica(row, {
      committedNodeFloor: context.committedNodeFloor,
    })
  );
}

function collectPartitionCaughtUpVoters(partitionId, serviceRows, context) {
  const voterHostIds = new Set();
  const voterNodeIds = new Set();
  const voterReplicaIds = [];
  for (const row of Array.isArray(serviceRows) ? serviceRows : []) {
    if (!isMatchingCaughtUpPartitionVoter(row, partitionId, context)) {
      continue;
    }
    const nodeId = row[COLUMN.NODE_ID];
    const hostId = context.hostIdByNodeId.get(nodeId);
    if (!isNonEmptyString(hostId)) {
      continue;
    }
    voterHostIds.add(hostId);
    voterNodeIds.add(nodeId);
    const replicaId = row[COLUMN.REPLICA_ID];
    if (isNonEmptyString(replicaId)) {
      voterReplicaIds.push(replicaId);
    }
  }
  return {voterHostIds, voterNodeIds, voterReplicaIds};
}

function readPartitionTargetVoterHosts(partitionRow, declaredHostCount) {
  const rfDecision = resolveDesiredReplicationFactor(partitionRow);
  return rfDecision.source === REPLICATION_TARGET_SOURCE.PARTITION_ROW &&
    rfDecision.replicationFactor > 0 ?
    resolveVoterTarget(rfDecision.replicationFactor, declaredHostCount) :
    0;
}

function verifyPartitionVoterTarget(partitionId, targetVoterHosts, voters) {
  if (voters.voterHostIds.size < targetVoterHosts) {
    return {
      satisfied: false,
      reason: FORMATION_REFUSAL_REASON.PRIORITY_PARTITION_VOTER_TARGET_PENDING,
      partitionId,
      requiredVoterHosts: targetVoterHosts,
      actualVoterHosts: voters.voterHostIds.size,
    };
  }
  return {
    satisfied: true,
    entry: {
      voterNodeIds: [...voters.voterNodeIds].sort(),
      voterHostIds: [...voters.voterHostIds].sort(),
      voterReplicaIds: voters.voterReplicaIds.sort(),
      targetVoterHosts,
    },
  };
}

function checkSinglePriorityPartitionVoters(partitionId, partitionRow, context) {
  const targetVoterHosts = readPartitionTargetVoterHosts(
    partitionRow,
    context.declaredHostCount,
  );
  if (targetVoterHosts <= 0) {
    return {
      satisfied: false,
      reason: FORMATION_REFUSAL_REASON.PRIORITY_PARTITION_POLICY_UNREADABLE,
      partitionId,
    };
  }
  const voters = collectPartitionCaughtUpVoters(
    partitionId,
    context.serviceRows,
    context,
  );
  return verifyPartitionVoterTarget(partitionId, targetVoterHosts, voters);
}

function collectPriorityPartitionVoters(context) {
  const partitionRowById = new Map();
  for (const row of Array.isArray(context.partitionRows) ?
    context.partitionRows :
    []) {
    const id = row?.[COLUMN.PARTITION_ID];
    if (isNonEmptyString(id)) {
      partitionRowById.set(id, row);
    }
  }
  const priorityPartitionVoters = {};
  for (const partitionId of PRIORITY_PARTITION_IDS) {
    const check = checkSinglePriorityPartitionVoters(
      partitionId,
      partitionRowById.get(partitionId) || null,
      context,
    );
    if (!check.satisfied) {
      return check;
    }
    priorityPartitionVoters[partitionId] = check.entry;
  }
  return {satisfied: true, priorityPartitionVoters};
}

function readTableInputRows(explicitRows, cache, tableName) {
  return Array.isArray(explicitRows) ?
    explicitRows :
    (cache?.getAll?.(tableName) || []);
}

function readFormationRowInput(inputs, publicationRows, cache) {
  if (inputs.formationRow !== undefined) {
    return inputs.formationRow;
  }
  return (
    publicationRows.find(
      (row) => row?.publication_id === FORMATION_PUBLICATION_ID,
    ) ||
    cache?.get?.(TABLES.CONTROL_PLANE_PUBLICATIONS, FORMATION_PUBLICATION_ID) ||
    null
  );
}

function buildLatchInputs(inputs = {}) {
  const cache = inputs.systemTableCache || null;
  const publicationRows = readTableInputRows(
    inputs.publicationRows,
    cache,
    TABLES.CONTROL_PLANE_PUBLICATIONS,
  );
  return {
    formationRow: readFormationRowInput(inputs, publicationRows, cache),
    publicationRows,
    publicationRow: inputs.publicationRow || null,
    nodeRows: readTableInputRows(inputs.nodeRows, cache, TABLES.NODES),
    partitionRows: readTableInputRows(
      inputs.partitionRows,
      cache,
      TABLES.PARTITIONS,
    ),
    serviceRows: readTableInputRows(inputs.serviceRows, cache, TABLES.SERVICES),
  };
}

function evaluateFormingLatchReadiness(decoded, resolved, inputs) {
  const declaredHostCount = decoded.declaredHostCount;
  const publishedRow = findLatestAcknowledgedMembershipRow(
    resolved.publicationRows,
    resolved.publicationRow,
  );
  if (!publishedRow) {
    return Object.freeze({
      shouldLatch: false,
      state: PLACEMENT_FORMATION_STATE.FORMING,
      reason: FORMATION_REFUSAL_REASON.PUBLISHED_MEMBERSHIP_ABSENT,
      declaredHostCount,
    });
  }
  const publishedActiveNodeIds = parseJsonStringArray(
    publishedRow.published_active_node_ids,
  );
  const nowMs = Number.isFinite(inputs.nowMs) ? inputs.nowMs : Date.now();
  const ready = collectReadyPublishedNodes(
    publishedActiveNodeIds,
    resolved.nodeRows,
    inputs.committedNodeFloor || null,
    nowMs,
  );
  if (ready.readyHostIds.length < declaredHostCount) {
    return Object.freeze({
      shouldLatch: false,
      state: PLACEMENT_FORMATION_STATE.FORMING,
      reason: FORMATION_REFUSAL_REASON.DECLARED_HOST_QUORUM_PENDING,
      declaredHostCount,
      readyHostCount: ready.readyHostIds.length,
      readyHostIds: Object.freeze(ready.readyHostIds),
      readyNodeIds: Object.freeze(ready.readyNodeIds),
    });
  }
  const priorityCheck = collectPriorityPartitionVoters({
    declaredHostCount,
    partitionRows: resolved.partitionRows,
    serviceRows: resolved.serviceRows,
    readyNodeIdSet: new Set(ready.readyNodeIds),
    hostIdByNodeId: ready.hostIdByNodeId,
    committedNodeFloor: ready.committedNodeFloor,
  });
  if (!priorityCheck.satisfied) {
    return Object.freeze({
      shouldLatch: false,
      state: PLACEMENT_FORMATION_STATE.FORMING,
      reason: priorityCheck.reason,
      partitionId: priorityCheck.partitionId,
      declaredHostCount,
      ...(priorityCheck.requiredVoterHosts !== undefined ?
        {
          requiredVoterHosts: priorityCheck.requiredVoterHosts,
          actualVoterHosts: priorityCheck.actualVoterHosts,
        } :
        {}),
    });
  }
  return Object.freeze({
    shouldLatch: true,
    state: PLACEMENT_FORMATION_STATE.FORMED,
    clusterId: decoded.clusterId,
    declaredHostCount,
    formedPublicationEpoch: Number(publishedRow.publication_epoch),
    formedHostIds: Object.freeze(ready.readyHostIds),
    formedReadyNodeIds: Object.freeze(ready.readyNodeIds),
    priorityPartitionVoters: deepFreeze(priorityCheck.priorityPartitionVoters),
  });
}

function evaluateFormationLatch(inputs = {}) {
  const resolved = buildLatchInputs(inputs);
  const decoded = decodeFormationRecord(resolved.formationRow, {
    clusterId: inputs.clusterId,
  });
  if (decoded.state === PLACEMENT_FORMATION_STATE.FORMED) {
    return Object.freeze({
      shouldLatch: false,
      state: PLACEMENT_FORMATION_STATE.FORMED,
      reason: FORMATION_REFUSAL_REASON.ALREADY_FORMED,
      formation: decoded,
    });
  }
  if (decoded.state !== PLACEMENT_FORMATION_STATE.FORMING) {
    return Object.freeze({
      shouldLatch: false,
      state: decoded.state,
      reason: decoded.reason,
      formation: decoded,
    });
  }
  return evaluateFormingLatchReadiness(decoded, resolved, inputs);
}

function buildFormationDeclareBody(input = {}) {
  const body = copyStrictOwnDataRecord(input);
  if (
    body === null ||
    !isNonEmptyString(body.clusterId) ||
    !isValidDeclaredHostCount(body.declaredHostCount) ||
    !isNonEmptyString(body.declaredByNodeId) ||
    !Number.isSafeInteger(body.declaredAt) ||
    body.declaredAt < 0
  ) {
    return null;
  }
  return Object.freeze({
    action: FORMATION_TRANSITION_ACTION.DECLARE,
    clusterId: body.clusterId,
    declaredHostCount: body.declaredHostCount,
    declaredByNodeId: body.declaredByNodeId,
    declaredAt: body.declaredAt,
  });
}

function isValidLatchBodyRecord(body) {
  return (
    body !== null &&
    isNonEmptyString(body.clusterId) &&
    isValidDeclaredHostCount(body.declaredHostCount) &&
    isValidFormedIdentity(body, 0) &&
    isValidFormedTopology(body)
  );
}

function buildFormationLatchBody(input = {}) {
  const body = copyStrictOwnDataRecord(input);
  if (!isValidLatchBodyRecord(body)) {
    return null;
  }
  return Object.freeze({
    action: FORMATION_TRANSITION_ACTION.LATCH,
    clusterId: body.clusterId,
    declaredHostCount: body.declaredHostCount,
    formedAt: body.formedAt,
    formedByNodeId: body.formedByNodeId,
    formedPublicationEpoch: body.formedPublicationEpoch,
    formedHostIds: Object.freeze([...body.formedHostIds]),
    formedReadyNodeIds: Object.freeze([...body.formedReadyNodeIds]),
    priorityPartitionVoters: deepFreeze(
      structuredClone(body.priorityPartitionVoters),
    ),
  });
}

function readFormationRecordIn(db) {
  return db ?
    (db.prepare(SELECT_FORMATION_ROW_SQL).get(FORMATION_PUBLICATION_ID) || null) :
    null;
}

let registeredFormationTransitionExecutor = null;

function registerFormationTransitionExecutor(executor) {
  registeredFormationTransitionExecutor = executor;
}

async function requestFormationTransition(service, payload) {
  if (
    service?.tableName !== SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS ||
    service?.partitionId !== PUBLICATIONS_PARTITION_ID
  ) {
    return {
      success: false,
      admitted: false,
      partitionId: service?.partitionId ?? null,
      failureCode: FORMATION_REFUSAL_REASON.TARGET_PARTITION_INVALID,
    };
  }
  if (service.executeFormationTransition) {
    return service.executeFormationTransition(payload);
  }
  return registeredFormationTransitionExecutor(service, payload);
}

function requestFormationDeclare(service, payload) {
  return requestFormationTransition(service, {
    entryId: payload?.entryId,
    body: buildFormationDeclareBody(payload?.body || payload),
  });
}

function requestFormationLatch(service, payload) {
  return requestFormationTransition(service, {
    entryId: payload?.entryId,
    body: buildFormationLatchBody(payload?.body || payload),
  });
}

export {
  FORMATION_PUBLICATION_ID,
  FORMATION_PUBLICATION_KIND,
  FORMATION_RECORD_STATUS,
  FORMATION_REFUSAL_REASON,
  FORMATION_TRANSITION_ACTION,
  FORMATION_TRANSITION_OUTCOME,
  FORMATION_TRANSITION_TYPE,
  buildFormationDeclareBody,
  buildFormationLatchBody,
  decodeFormationRecord,
  evaluateFormationLatch,
  readFormationRecordIn,
  registerFormationTransitionExecutor,
  requestFormationDeclare,
  requestFormationLatch,
  requestFormationTransition,
};
