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
import {OPERATION_METADATA_KEY, OperationType} from '../rebalancer/replica-operation-progress.js';
import {getOperationMetadataValue} from '../rebalancer/replica-status.js';
import {PLACEMENT_TRANSITION_KIND, PLACEMENT_OUTCOME, PLACEMENT_REFUSAL} from
  '../rebalancer/replica-placement-owner-constants.js';
import {admissionRefusal, entityAdmissionRefusal, readPlacementCensus} from './partition-placement-admission-decision.js';

const INVALID = Object.freeze({validity: VALIDITY.INVALID});
const IDENTITY_COLUMNS = Object.freeze(['operation_id', 'type', 'partition_id',
  'entity_type', 'entity_id', 'replica_id', 'source_replica_id', 'source_node_id',
  'target_node_id', 'created_at']);


function canonicalRetainedPlacementRepair(input) {
  const body = copyStrictOwnDataRecord(input);
  if (body === null || Object.keys(body).some((key) =>
    key !== 'operation' && key !== 'admissionStatement') || !Object.hasOwn(body, 'operation')) {
    return INVALID;
  }
  try {
    assertOperationUpdateRecord(body.operation);
    let admissionStatement = null;
    if (body.admissionStatement !== null && body.admissionStatement !== undefined) {
      const canonical = canonicalPlacementStatement(body.admissionStatement);
      if (canonical.validity !== VALIDITY.VALID ||
          !matchesRepairStatement(body.operation, canonical.statement)) return INVALID;
      admissionStatement = canonical.statement;
    }
    return Object.freeze({validity: VALIDITY.VALID,
      statement: Object.freeze({operation: copyOperationOutcomeData(body.operation),
        admissionStatement})});
  } catch {
    return INVALID;
  }
}

function matchesRepairStatement(operation, statement) {
  const [move] = statement.moves;
  return statement.transitionKind === PLACEMENT_TRANSITION_KIND.PLACEMENT &&
    statement.entityType === operation.entityType && statement.entityId === operation.entityId &&
    statement.partitionId === operation.partitionId &&
    statement.sourceNodeId === operation.sourceNodeId &&
    statement.membershipPublicationEpoch === (operation.membershipPublicationEpoch ?? null) &&
    statement.placementClass === classifyPlacementClass(operation.partitionId) &&
    statement.moves.length === 1 && move.type === operation.type &&
    // Ordinary policy leaves a copy's new replica unallocated. The retained
    // operation envelope, not this resource policy, owns its existing identity.
    move.replicaId === null && typeof operation.replicaId === 'string' &&
    operation.replicaId.length > 0 && move.targetNodeId === operation.targetNodeId &&
    move.copySourceNodeId === operation.copySourceNodeId &&
    (move.targetNodeBootIncarnation ?? null) === (operation.targetNodeBootIncarnation ?? null) &&
    (move.targetNodeStorageIncarnation ?? null) === (operation.targetNodeStorageIncarnation ?? null) &&
    (move.sourceReplicaId ?? null) === (operation.sourceReplicaId ?? null);
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
  const row = db.prepare('SELECT created_at, workflow_step, completed_at ' +
    'FROM replica_operations WHERE operation_id = ?').get(peer.operationId);
  return Object.freeze({operationId: peer.operationId, createdAt: row.created_at,
    workflowStep: row.workflow_step, completedAt: row.completed_at});
}

function decideRetainedPlacementRepair(db, {operation, admissionStatement}) {
  const row = rowOf(operation);
  const existing = db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
    .get(operation.operationId);
  if (existing !== undefined) {
    if (IDENTITY_COLUMNS.some((key) => existing[key] !== row[key])) {
      return refuse(PLACEMENT_REFUSAL.RETAINED_IDENTITY_CHANGED);
    }
    // Lease renewal has its own write owner. A newer raw SQLite lease is
    // consumed as-is; this idempotent branch never replaces it.
    if (Object.keys(row).some((key) => key !== 'lease_expires_at' && existing[key] !== row[key])) {
      return refuse(PLACEMENT_REFUSAL.RETAINED_ROW_CHANGED);
    }
    return {result: Object.freeze({outcome: PLACEMENT_OUTCOME.ADMITTED,
      operationIds: Object.freeze([operation.operationId])}), rows: []};
  }
  // Placement-admitted founding sets and physical CREATE/membership work cannot
  // be reconstructed from a process projection. Their original admission owner
  // retains their recovery. Thus a FOUND sibling never takes a generic lane;
  // the normal FOUND admission/replay algorithm remains unchanged.
  if (operationCarriesReplicaCreateAdmission(operation) ||
      operationCarriesMessageGroupMembership(operation)) {
    return refuse(PLACEMENT_REFUSAL.RETAINED_ADMISSION_REQUIRED);
  }
  // A terminal restoration retains evidence; it creates no live entity lane.
  if (operation.completedAt === null) {
    const census = readPlacementCensus(db);
    const decision = entityAdmissionRefusal({
      transitionKind: PLACEMENT_TRANSITION_KIND.PLACEMENT,
      entityType: row.entity_type, entityId: row.entity_id,
      dispatchHold: getOperationMetadataValue(operation.stepsHistory, OPERATION_METADATA_KEY.DISPATCH_HOLD),
      moves: [{type: operation.type}],
    }, census);
    // Copies require a current policy statement before their capacity arm;
    // do not substitute a guessed historical repair flag or copy source.
    if (decision !== null) return {result: Array.isArray(decision.operationIds) && decision.operationIds.length > 0 ?
      Object.freeze({...decision, blockingOperations: Object.freeze(census.filter((peer) =>
        decision.operationIds.includes(peer.operationId)).map((peer) => blockerOf(db, peer)))}) :
      decision, rows: []};
    if (operation.type === OperationType.ADD || operation.type === OperationType.REPLACE) {
      if (admissionStatement === null ||
          (admissionStatement.dispatchHold !== null &&
            operation.stepsHistory[0]?.[OPERATION_METADATA_KEY.DISPATCH_HOLD] !==
              admissionStatement.dispatchHold)) {
        return refuse(PLACEMENT_REFUSAL.RETAINED_COPY_POLICY_UNAVAILABLE);
      }
      const capacity = admissionRefusal(db, admissionStatement, census);
      if (capacity !== null) return {result: capacity, rows: []};
    }
  }
  const columns = Object.keys(row);
  db.prepare(`INSERT INTO replica_operations (${columns.join(', ')}) VALUES ` +
    `(${columns.map(() => '?').join(', ')})`).run(...columns.map((key) => row[key]));
  return {result: Object.freeze({outcome: PLACEMENT_OUTCOME.ADMITTED,
    operationIds: Object.freeze([operation.operationId])}), rows: [row]};
}

export {canonicalRetainedPlacementRepair, decideRetainedPlacementRepair};
