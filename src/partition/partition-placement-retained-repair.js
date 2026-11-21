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
import {PLACEMENT_STATEMENT_VALIDITY as VALIDITY} from
  '../rebalancer/replica-placement-owner-admission-statement.js';
import {PLACEMENT_OUTCOME, PLACEMENT_REFUSAL} from
  '../rebalancer/replica-placement-owner-constants.js';
import {readPlacementCensus} from './partition-placement-admission-decision.js';

const INVALID = Object.freeze({validity: VALIDITY.INVALID});
const IDENTITY_COLUMNS = Object.freeze(['operation_id', 'type', 'partition_id',
  'entity_type', 'entity_id', 'replica_id', 'source_replica_id', 'source_node_id',
  'target_node_id', 'created_at']);
const RETAINED_REPAIR_REFUSAL = Object.freeze({
  IDENTITY_CHANGED: 'retained_identity_changed',
  EXISTING_CHANGED: 'retained_row_changed',
  ADMISSION_REQUIRED: 'retained_admission_required',
});

function canonicalRetainedPlacementRepair(input) {
  const body = copyStrictOwnDataRecord(input);
  if (body === null || Object.keys(body).length !== 1 ||
      !Object.hasOwn(body, 'operation')) return INVALID;
  try {
    assertOperationUpdateRecord(body.operation);
    return Object.freeze({validity: VALIDITY.VALID,
      statement: Object.freeze({operation: copyOperationOutcomeData(body.operation)})});
  } catch {
    return INVALID;
  }
}

function rowOf(operation) {
  // Repair restores the retained raw lease; lease renewal remains its own write.
  return {...buildCanonicalReplicaOperationRow(operation, operation.ownerLeaseExpiresAt ?? null),
    copy_source_node_id: operation.copySourceNodeId ?? null};
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

function decideRetainedPlacementRepair(db, {operation}) {
  const row = rowOf(operation);
  const existing = db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
    .get(operation.operationId);
  if (existing !== undefined) {
    if (IDENTITY_COLUMNS.some((key) => existing[key] !== row[key])) {
      return refuse(RETAINED_REPAIR_REFUSAL.IDENTITY_CHANGED);
    }
    if (Object.keys(row).some((key) => existing[key] !== row[key])) {
      return refuse(RETAINED_REPAIR_REFUSAL.EXISTING_CHANGED);
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
    return refuse(RETAINED_REPAIR_REFUSAL.ADMISSION_REQUIRED);
  }
  // A terminal restoration retains evidence; it creates no live entity lane.
  if (operation.completedAt === null) {
    const peers = readPlacementCensus(db).filter((peer) => peer.incomplete &&
      peer.entityType === row.entity_type && peer.entityId === row.entity_id);
    if (peers.length > 0) return refuse(PLACEMENT_REFUSAL.PARTITION_BUSY,
      peers.map((peer) => blockerOf(db, peer)));
  }
  const columns = Object.keys(row);
  db.prepare(`INSERT INTO replica_operations (${columns.join(', ')}) VALUES ` +
    `(${columns.map(() => '?').join(', ')})`).run(...columns.map((key) => row[key]));
  return {result: Object.freeze({outcome: PLACEMENT_OUTCOME.ADMITTED,
    operationIds: Object.freeze([operation.operationId])}), rows: [row]};
}

export {canonicalRetainedPlacementRepair, decideRetainedPlacementRepair,
  RETAINED_REPAIR_REFUSAL};
