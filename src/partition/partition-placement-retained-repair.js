import {RETAINED_COPY_POLICY_STATE as POLICY} from './partition-placement-admission-constants.js';
// The placement owner's retained-row decision, inside the ledger apply transaction.
// The existing repository record validator and canonical row builder own its shape.
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {assertOperationUpdateRecord, copyOperationOutcomeData} from
  '../rebalancer/replica-operation-update-outcome.js';
import {buildCanonicalReplicaOperationRow} from
  '../rebalancer/replica-operation-repository-mutation-row-methods.js';
import {operationCarriesReplicaCreateAdmission} from
  '../rebalancer/replica-operation-create-admission-fields.js';
import {operationCarriesMessageGroupMembership} from
  '../rebalancer/replica-operation-message-group-membership-fields.js';
import {canonicalPlacementStatement, PLACEMENT_STATEMENT_VALIDITY as VALIDITY} from
  '../rebalancer/replica-placement-owner-admission-statement.js';
import {classifyPlacementClass} from '../rebalancer/replica-placement-owner-order.js';
import {OPERATION_METADATA_KEY} from '../rebalancer/replica-operation-progress.js';
import {getOperationMetadataValue} from '../rebalancer/replica-status.js';
import {PLACEMENT_TRANSITION_KIND, PLACEMENT_OUTCOME, PLACEMENT_REFUSAL} from
  '../rebalancer/replica-placement-owner-constants.js';
import {admissionRefusal, entityAdmissionDecision, ENTITY_ADMISSION_STATE, operationHoldsPlacementCopyCapacity,
  readPlacementCensus} from './partition-placement-admission-decision.js';

const READY_POLICY_FIELDS = Object.freeze(['state', 'statement']);
const BODY_FIELDS = Object.freeze({OPERATION: 'operation', COPY_POLICY: 'copyPolicy'});
const READ_BLOCKER_SQL = 'SELECT created_at, workflow_step, completed_at ' +
  'FROM replica_operations WHERE operation_id = ?';
const READ_ROW_SQL = 'SELECT * FROM replica_operations WHERE operation_id = ?';
const LEASE_COLUMN = 'lease_expires_at';
const SQL_SEPARATOR = ', ';
const SQL_PARAMETER = '?';
const INVALID = Object.freeze({validity: VALIDITY.INVALID});
const IDENTITY_COLUMNS = Object.freeze(['operation_id', 'type', 'partition_id',
  'entity_type', 'entity_id', 'replica_id', 'source_replica_id', 'source_node_id',
  'target_node_id', 'created_at']);


function canonicalRetainedPlacementRepair(input) {
  const body = copyStrictOwnDataRecord(input);
  if (body === null || Object.keys(body).some((key) =>
    key !== BODY_FIELDS.OPERATION && key !== BODY_FIELDS.COPY_POLICY) ||
      !Object.hasOwn(body, BODY_FIELDS.OPERATION)) {
    return INVALID;
  }
  try {
    assertOperationUpdateRecord(body.operation);
    const copyPolicy = canonicalCopyPolicy(body.copyPolicy, body.operation);
    if (copyPolicy === INVALID) return INVALID;
    return Object.freeze({validity: VALIDITY.VALID,
      statement: Object.freeze({operation: copyOperationOutcomeData(body.operation), copyPolicy})});
  } catch {
    return INVALID;
  }
}

function canonicalCopyPolicy(input, operation) {
  if (input === undefined) {
    return Object.freeze({state: operationHoldsPlacementCopyCapacity(operation) ?
      POLICY.UNAVAILABLE : POLICY.NOT_REQUIRED});
  }
  const policy = copyStrictOwnDataRecord(input);
  if (!policy) return INVALID;
  if (policy.state !== POLICY.READY) {
    return Object.keys(policy).length === 1 &&
      [POLICY.NOT_REQUIRED, POLICY.UNAVAILABLE].includes(policy.state) ?
      Object.freeze({state: policy.state}) : INVALID;
  }
  if (Object.keys(policy).length !== READY_POLICY_FIELDS.length) return INVALID;
  const canonical = canonicalPlacementStatement(policy.statement);
  if (canonical.validity !== VALIDITY.VALID ||
      !matchesRepairStatement(operation, canonical.statement)) return INVALID;
  return Object.freeze({state: POLICY.READY, statement: canonical.statement});
}

const SUBJECT_FIELDS = Object.freeze(['entityType', 'entityId', 'partitionId', 'sourceNodeId']);
const COPY_MOVE_FIELDS = Object.freeze(['type', 'targetNodeId', 'copySourceNodeId',
  'targetNodeBootIncarnation', 'targetNodeStorageIncarnation', 'sourceReplicaId']);

function sameCopyMove(operation, move) {
  return COPY_MOVE_FIELDS.every((key) => (move[key] ?? null) === (operation[key] ?? null));
}

function matchesRepairStatement(operation, statement) {
  const [move] = statement.moves;
  const subject = SUBJECT_FIELDS.every((key) => statement[key] === operation[key]);
  const identityPresent = typeof operation.replicaId === 'string' && operation.replicaId.length > 0;
  return [subject, identityPresent,
    statement.transitionKind === PLACEMENT_TRANSITION_KIND.PLACEMENT,
    statement.placementClass === classifyPlacementClass(operation.partitionId),
    statement.membershipPublicationEpoch === (operation.membershipPublicationEpoch ?? null),
    statement.moves.length === 1, move.replicaId === null,
    sameCopyMove(operation, move)].every(Boolean);
}

function rowOf(operation) {
  // Repair restores the retained raw lease; lease renewal remains its own write.
  return buildCanonicalReplicaOperationRow(operation, operation.ownerLeaseExpiresAt ?? null);
}

function refuse(reason, blockingOperations = []) {
  return {result: Object.freeze({outcome: PLACEMENT_OUTCOME.REFUSED, reason,
    operationIds: Object.freeze(blockingOperations.map((row) => row.operationId)),
    blockingOperations: Object.freeze(blockingOperations)}), rows: []};
}

function blockerOf(db, peer) {
  const row = db.prepare(READ_BLOCKER_SQL).get(peer.operationId);
  return Object.freeze({operationId: peer.operationId, createdAt: row.created_at,
    workflowStep: row.workflow_step, completedAt: row.completed_at});
}

const REPAIR_CLEAR = Object.freeze({state: ENTITY_ADMISSION_STATE.CLEAR});

function existingRowRepairResult(existing, row) {
  if (IDENTITY_COLUMNS.some((key) => existing[key] !== row[key])) {
    return refuse(PLACEMENT_REFUSAL.RETAINED_IDENTITY_CHANGED);
  }
  // The independent lease write owner keeps its current raw SQLite value.
  if (Object.keys(row).some((key) => key !== LEASE_COLUMN && existing[key] !== row[key])) {
    return refuse(PLACEMENT_REFUSAL.RETAINED_ROW_CHANGED);
  }
  return {result: Object.freeze({outcome: PLACEMENT_OUTCOME.ADMITTED,
    operationIds: Object.freeze([row.operation_id])}), rows: []};
}

function blockingRepairDecision(db, census, decision) {
  const ids = decision.operationIds;
  const hasBlockers = Array.isArray(ids) && ids.length > 0;
  const result = hasBlockers ? Object.freeze({...decision,
    blockingOperations: Object.freeze(census.filter((peer) => ids.includes(peer.operationId))
      .map((peer) => blockerOf(db, peer)))}) : decision;
  return {state: ENTITY_ADMISSION_STATE.REFUSED, result};
}

function unavailableCopyDecision() {
  return {state: ENTITY_ADMISSION_STATE.REFUSED,
    ...refuse(PLACEMENT_REFUSAL.RETAINED_COPY_POLICY_UNAVAILABLE)};
}

function copyRepairDecision(db, operation, copyPolicy, census) {
  if (copyPolicy.state !== POLICY.READY) {
    return unavailableCopyDecision();
  }
  const statement = copyPolicy.statement;
  const retainedHold = getOperationMetadataValue(operation.stepsHistory,
    OPERATION_METADATA_KEY.DISPATCH_HOLD);
  if (statement.dispatchHold !== null && retainedHold !== statement.dispatchHold) {
    return unavailableCopyDecision();
  }
  const capacity = admissionRefusal(db, statement, census);
  return capacity === null ? REPAIR_CLEAR : blockingRepairDecision(db, census, capacity);
}

function liveRepairDecision(db, operation, copyPolicy) {
  if (operation.completedAt !== null) return REPAIR_CLEAR;
  const census = readPlacementCensus(db);
  const entity = entityAdmissionDecision({transitionKind: PLACEMENT_TRANSITION_KIND.PLACEMENT,
    entityType: operation.entityType, entityId: operation.entityId,
    dispatchHold: getOperationMetadataValue(operation.stepsHistory,
      OPERATION_METADATA_KEY.DISPATCH_HOLD),
    moves: [{type: operation.type}]}, census);
  if (entity.state === ENTITY_ADMISSION_STATE.REFUSED) {
    return blockingRepairDecision(db, census, entity.result);
  }
  return operationHoldsPlacementCopyCapacity(operation) ?
    copyRepairDecision(db, operation, copyPolicy, census) : REPAIR_CLEAR;
}

function insertRetainedRow(db, row) {
  const columns = Object.keys(row);
  const values = columns.map((key) => row[key]);
  db.prepare(`INSERT INTO replica_operations (${columns.join(SQL_SEPARATOR)}) VALUES ` +
    `(${columns.map(() => SQL_PARAMETER).join(SQL_SEPARATOR)})`).run(...values);
}

function decideRetainedPlacementRepair(db, {operation, copyPolicy}) {
  const row = rowOf(operation);
  const existing = db.prepare(READ_ROW_SQL).get(operation.operationId);
  if (existing !== undefined) return existingRowRepairResult(existing, row);
  // Admission-bearing CREATE, membership and FOUND recovery remain with their
  // original owners. Restoring a process projection cannot recreate those grants.
  if (operationCarriesReplicaCreateAdmission(operation) ||
      operationCarriesMessageGroupMembership(operation)) {
    return refuse(PLACEMENT_REFUSAL.RETAINED_ADMISSION_REQUIRED);
  }
  const live = liveRepairDecision(db, operation, copyPolicy);
  if (live.state === ENTITY_ADMISSION_STATE.REFUSED) return {result: live.result, rows: []};
  insertRetainedRow(db, row);
  return {result: Object.freeze({outcome: PLACEMENT_OUTCOME.ADMITTED,
    operationIds: Object.freeze([operation.operationId])}), rows: [row]};
}

export {canonicalRetainedPlacementRepair, decideRetainedPlacementRepair};
