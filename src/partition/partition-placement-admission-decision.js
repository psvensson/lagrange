// The placement admission applier's decision over the committed ledger at
// its log position (quest replica-placement-admission-owner, design section
// 2.5 steps 4-8): a pure function of the command and the replica_operations
// rows this replica has applied, never of the clock, a cache or the locale,
// so every replica decides the same. It is the one canonical owner of
// target-wide and source-wide copy occupancy: every committed row counts,
// whichever coordinator or owner created it.
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {classifySystemPartition, SYSTEM_PARTITION_CLASS} from
  '../bootstrap/system-partition-classification.js';
import {UNIFIED_SERVICE_TYPE} from '../constants/unified-service-lifecycle.js';
import {WORKFLOW_STEP} from '../constants/workflow.js';
import {genesisStamp} from '../raft/raft-committed-membership-stamp.js';
import {OPERATION_METADATA_KEY, OperationType} from
  '../rebalancer/replica-operation-progress.js';
import {createOperationAt, getOperationMetadataObject, getOperationMetadataValue} from
  '../rebalancer/replica-status.js';
import {memoizedParseStepsHistoryString} from '../rebalancer/steps-history-parse-memo.js';
import {isGenesisFoundingCreateOperation, ReplicaOperationField} from
  '../rebalancer/replica-operation-constants.js';
import {COPY_PHASE_WORKFLOW_STEPS, INCOMPLETE_OPERATION_CANDIDATE_WORKFLOW_STEPS,
  isIncompleteOperationRowStep} from '../rebalancer/replica-operation-step-policy.js';
import {buildCanonicalReplicaOperationRow} from
  '../rebalancer/replica-operation-repository-mutation-row-methods.js';
import {buildRuntimeServiceTargetClaimKey} from
  '../rebalancer/runtime-service-replica-identity.js';
import {PLACEMENT_DISPATCH_HOLD, PLACEMENT_OUTCOME, PLACEMENT_REFUSAL as REFUSAL,
  PLACEMENT_TRANSITION_KIND as KIND} from
  '../rebalancer/replica-placement-owner-constants.js';
import {placementOperationIdOf, placementReplicaIdOf} from
  './partition-placement-admission-identity.js';

const TABLE = SYSTEM_TABLE_NAME.REPLICA_OPERATIONS;
const SQL_PARAMETER = '?';
const SQL_LIST_SEPARATOR = ', ';
const LEDGER_PARTITION_ID = `${TABLE}-p1`;
const CENSUS_SQL = 'SELECT operation_id, type, entity_type, entity_id, ' +
  'target_node_id, copy_source_node_id, target_claim_key, workflow_step, ' +
  `steps_history FROM ${TABLE} WHERE workflow_step IN ` +
  `(${INCOMPLETE_OPERATION_CANDIDATE_WORKFLOW_STEPS.map(() => SQL_PARAMETER)
    .join(SQL_LIST_SEPARATOR)}) ` +
  'ORDER BY operation_id';
const CLAIM_SQL = `SELECT operation_id FROM ${TABLE} WHERE target_claim_key = ?`;
const ROW_SQL = `SELECT * FROM ${TABLE} WHERE operation_id = ?`;
const RELEASE_SQL = `UPDATE ${TABLE} SET steps_history = ?, updated_at = ? ` +
  'WHERE operation_id = ?';
const COPY_TYPES = Object.freeze(new Set([OperationType.ADD, OperationType.REPLACE]));

function parsedHistory(row) {
  return typeof row.steps_history === 'string' && row.steps_history.length > 0 ?
    memoizedParseStepsHistoryString(row.steps_history) : [];
}

function censusRowOf(row) {
  const history = parsedHistory(row);
  const founder = isGenesisFoundingCreateOperation({type: row.type,
    [ReplicaOperationField.BOOTSTRAP_MEMBERSHIP]:
      getOperationMetadataObject(history, OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP)});
  return Object.freeze({operationId: row.operation_id, type: row.type,
    entityType: row.entity_type, entityId: row.entity_id,
    targetNodeId: row.target_node_id, copySourceNodeId: row.copy_source_node_id,
    step: row.workflow_step, founder,
    incomplete: isIncompleteOperationRowStep(row.type, row.workflow_step),
    dispatchHold: getOperationMetadataValue(history, OPERATION_METADATA_KEY.DISPATCH_HOLD),
    admission: getOperationMetadataObject(history,
      OPERATION_METADATA_KEY.PLACEMENT_ADMISSION)});
}

/**
 * Every committed row at a step where it can be incomplete, in id order.
 * @param {Object} db - The partition's connection (inside the apply).
 * @return {Array<Object>} Frozen census rows.
 */
function readPlacementCensus(db) {
  return db.prepare(CENSUS_SQL).all(...INCOMPLETE_OPERATION_CANDIDATE_WORKFLOW_STEPS)
    .map(censusRowOf);
}

function refused(reason, detail = {}) {
  return Object.freeze({outcome: PLACEMENT_OUTCOME.REFUSED, reason, ...detail});
}

function idsOf(rows) {
  return rows.map((row) => row.operationId);
}

// A copy occupies its copy source and its target while its durable step is
// in the copy phase. A founder ADD is not a copy (FOUND is exempt) and a
// REMOVE copies nothing.
function isOccupyingCopy(row) {
  return row.incomplete && COPY_TYPES.has(row.type) && !row.founder &&
    COPY_PHASE_WORKFLOW_STEPS.has(row.step) &&
    row.entityType === UNIFIED_SERVICE_TYPE.PARTITION;
}

// Step 4 (FOUND only): a static-catalog partition is founded by the seed;
// any other partition is founded while some founder row is incomplete or
// ACTIVE. A set whose founders all FAILED leaves it unfounded.
function foundingRefusal(statement, census) {
  if (classifySystemPartition({partitionId: statement.partitionId})
    .partitionClass === SYSTEM_PARTITION_CLASS.BOOTSTRAP_CRITICAL) {
    return refused(REFUSAL.SYSTEM_PARTITION_SEED_FOUNDED);
  }
  const live = census.filter((row) => row.founder &&
    row.entityType === statement.entityType && row.entityId === statement.entityId &&
    (row.incomplete || row.step === WORKFLOW_STEP.ACTIVE));
  if (live.length === 0) return null;
  // A founding set admitted by FOUND names its intent; a set the seed or an
  // earlier founding path wrote carries no admission record.
  const [first] = live;
  return refused(REFUSAL.ALREADY_FOUNDED, {operationIds: idsOf(live),
    foundingIntentId: first.admission === null ? null : first.admission.foundingIntentId});
}

// Step 7 (PLACEMENT copies only): occupancy over every committed copy-phase
// row; a row without copy_source_node_id counts against every source.
function capacityRefusal(statement, census) {
  const move = statement.moves[0];
  if (statement.transitionKind !== KIND.PLACEMENT || !COPY_TYPES.has(move.type)) {
    return null;
  }
  const copies = census.filter(isOccupyingCopy);
  const sourceOccupancy = copies.filter((row) => row.copySourceNodeId === null ||
    row.copySourceNodeId === move.copySourceNodeId).length;
  const targetOccupancy = copies.filter((row) =>
    row.targetNodeId === move.targetNodeId).length;
  const occupancy = Object.freeze({copySourceNodeId: move.copySourceNodeId,
    sourceOccupancy, sourceLimit: statement.kSrcForClass,
    targetNodeId: move.targetNodeId, targetOccupancy, targetLimit: statement.kTgt});
  if (sourceOccupancy >= statement.kSrcForClass) {
    return refused(REFUSAL.SOURCE_AT_CAPACITY, {occupancy});
  }
  return targetOccupancy >= statement.kTgt ?
    refused(REFUSAL.TARGET_AT_CAPACITY, {occupancy}) : null;
}

function runtimeServiceClaimKeyOf(statement, move, replicaId) {
  return statement.transitionKind === KIND.RUNTIME_SERVICE &&
    move.type !== OperationType.REMOVE ?
    buildRuntimeServiceTargetClaimKey(replicaId, statement.entityId) : null;
}

// A runtime-service target identity is claimed once, for ever.
function claimRefusal(db, statement) {
  const move = statement.moves[0];
  const claimKey = runtimeServiceClaimKeyOf(statement, move, move.replicaId);
  if (claimKey === null) return null;
  const holder = db.prepare(CLAIM_SQL).get(claimKey);
  return holder === undefined ? null :
    refused(REFUSAL.TARGET_CLAIM_TAKEN, {operationIds: [holder.operation_id]});
}

function ledgerPartitionRefusal(command) {
  return command.partitionId === LEDGER_PARTITION_ID ? null :
    refused(REFUSAL.LEDGER_PARTITION_REQUIRED, {partitionId: command.partitionId,
      ledgerPartitionId: LEDGER_PARTITION_ID});
}

function admissionRefusal(db, statement, census) {
  const entityRows = census.filter((row) => row.incomplete &&
    row.entityType === statement.entityType && row.entityId === statement.entityId);
  const ledgerRows = census.filter((row) => row.incomplete &&
    row.entityType === UNIFIED_SERVICE_TYPE.PARTITION &&
    row.entityId === LEDGER_PARTITION_ID);
  if (statement.transitionKind === KIND.FOUND) {
    const founded = foundingRefusal(statement, census);
    if (founded !== null) return founded;
  }
  if (entityRows.length > 0) {
    return refused(REFUSAL.PARTITION_BUSY, {operationIds: idsOf(entityRows)});
  }
  if (ledgerRows.length > 0) {
    return refused(REFUSAL.LEDGER_TRANSITION_UNRESOLVED,
      {operationIds: idsOf(ledgerRows)});
  }
  return capacityRefusal(statement, census) ?? claimRefusal(db, statement);
}

function admissionMetadataOf(command, statement) {
  return Object.freeze({entryId: command.entryId,
    transitionKind: statement.transitionKind, placementClass: statement.placementClass,
    repair: statement.repair, formationLatchEpoch: statement.formationLatchEpoch,
    foundingIntentId: statement.foundingIntentId});
}

function operationOf(command, statement, move, identity) {
  const operation = createOperationAt({operationId: identity.operationId,
    type: move.type, partitionId: statement.partitionId,
    sourceNodeId: statement.sourceNodeId, targetNodeId: move.targetNodeId,
    replicaId: identity.replicaId, sourceReplicaId: move.sourceReplicaId,
    membershipPublicationEpoch: statement.membershipPublicationEpoch,
    targetNodeBootIncarnation: move.targetNodeBootIncarnation,
    targetNodeStorageIncarnation: move.targetNodeStorageIncarnation},
  command.proposedAt);
  operation.entityType = statement.entityType;
  operation.entityId = statement.entityId;
  operation.membershipPublicationEpoch = statement.membershipPublicationEpoch;
  operation.targetClaimKey = runtimeServiceClaimKeyOf(statement, move,
    identity.replicaId);
  const first = operation.stepsHistory[0];
  first[OPERATION_METADATA_KEY.PLACEMENT_ADMISSION] =
    admissionMetadataOf(command, statement);
  if (statement.dispatchHold !== null) {
    first[OPERATION_METADATA_KEY.DISPATCH_HOLD] = statement.dispatchHold;
  }
  return operation;
}

// A founding set opens its group from the GENESIS stamp of exactly its
// founders, minted here from the identities this apply derives; the rows
// wait for the provisioner's topology release as every founding create does.
function stampFoundingSet(operations) {
  const replicaIds = operations.map((operation) => operation.replicaId);
  const stamp = genesisStamp(replicaIds, Object.fromEntries(operations.map(
    (operation) => [operation.replicaId, operation.targetNodeId])));
  for (const operation of operations) {
    const first = operation.stepsHistory[0];
    first[OPERATION_METADATA_KEY.REPLICA_IDS] = replicaIds;
    first[OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP] = stamp;
    first[OPERATION_METADATA_KEY.BOOTSTRAP_TOPOLOGY_DISPATCH_DEFERRED] = true;
    operation[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP] = stamp;
  }
}

function insertRow(db, row) {
  const columns = Object.keys(row);
  db.prepare(`INSERT INTO ${TABLE} (${columns.join(SQL_LIST_SEPARATOR)}) VALUES ` +
    `(${columns.map(() => SQL_PARAMETER).join(SQL_LIST_SEPARATOR)})`).run(...columns.map((column) =>
    row[column]));
}

/**
 * Steps 4-8 of PLACEMENT_ADMIT at this log position: a typed refusal, or
 * the admitted rows inserted (operation ids pl-<partitionId>-<index>-<n>).
 * @param {Object} db - The partition's connection (inside the apply).
 * @param {Object} committed - {command, statement, index}.
 * @return {Object} {result, rows}: the frozen typed result and the rows
 *   inserted (none for a refusal).
 */
function decidePlacementAdmission(db, {command, statement, index}) {
  const refusal = ledgerPartitionRefusal(command) ??
    admissionRefusal(db, statement, readPlacementCensus(db));
  if (refusal !== null) return {result: refusal, rows: []};
  const operations = statement.moves.map((move, ordinal) => {
    const operationId = placementOperationIdOf(statement.partitionId, index, ordinal);
    return operationOf(command, statement, move, {operationId,
      replicaId: move.replicaId === null ? placementReplicaIdOf(operationId) :
        move.replicaId});
  });
  if (statement.transitionKind === KIND.FOUND) stampFoundingSet(operations);
  const rows = operations.map((operation, ordinal) => Object.freeze({
    ...buildCanonicalReplicaOperationRow(operation, null),
    copy_source_node_id: statement.moves[ordinal].copySourceNodeId}));
  for (const row of rows) insertRow(db, row);
  return {result: Object.freeze({outcome: PLACEMENT_OUTCOME.ADMITTED,
    operationIds: rows.map((row) => row.operation_id)}), rows};
}

/**
 * PLACEMENT_RELEASE_HOLD at this log position: the engaged ledger move's
 * hold is lifted when no other copy-phase row exists; removal-phase rows
 * never delay it.
 * @param {Object} db - The partition's connection (inside the apply).
 * @param {Object} committed - {command, release}.
 * @return {Object} {result, rows}: the typed result and the changed row.
 */
function decideHoldRelease(db, {command, release}) {
  const wrongPartition = ledgerPartitionRefusal(command);
  if (wrongPartition !== null) return {result: wrongPartition, rows: []};
  const census = readPlacementCensus(db);
  const held = census.find((row) => row.operationId === release.operationId);
  if (held === undefined || !held.incomplete ||
      held.dispatchHold !== PLACEMENT_DISPATCH_HOLD.LEDGER_AWAITING_COPY_IDLE) {
    return {result: refused(REFUSAL.HOLD_NOT_HELD), rows: []};
  }
  const copying = census.filter((row) => row.operationId !== held.operationId &&
    isOccupyingCopy(row));
  if (copying.length > 0) {
    return {result: refused(REFUSAL.COPY_PHASE_NOT_IDLE,
      {operationIds: idsOf(copying)}), rows: []};
  }
  const row = db.prepare(ROW_SQL).get(held.operationId);
  const history = JSON.parse(row.steps_history);
  delete history[0][OPERATION_METADATA_KEY.DISPATCH_HOLD];
  db.prepare(RELEASE_SQL).run(JSON.stringify(history), command.proposedAt,
    held.operationId);
  return {result: Object.freeze({outcome: PLACEMENT_OUTCOME.RELEASED,
    operationIds: [held.operationId]}),
  rows: [Object.freeze({...db.prepare(ROW_SQL).get(held.operationId)})]};
}

export {
  LEDGER_PARTITION_ID,
  decideHoldRelease,
  decidePlacementAdmission,
  isOccupyingCopy,
  readPlacementCensus,
};
