// Observations are hints for the retained-record owner, never row authority.
// Each record holds only this finite mask; a drain consumes it after pending
// work settles and confirms current authority before retrying or retiring.
import {LEDGER_PARTITION_ID, copyCapacityObservationAffects} from
  '../partition/partition-placement-admission-decision.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {RETAINED_COPY_POLICY_STATE as POLICY} from '../partition/partition-placement-admission-constants.js';

const REPAIR_OBSERVATION = Object.freeze({NONE: 0, OWN_ROW: 1, CLEARING: 2, LEADER: 4});

function peerObservationMayClear(attempt, row) {
  if (!row) return false;
  const operation = attempt.operation;
  const sameEntity = row.entity_type === operation.entityType &&
    row.entity_id === operation.entityId;
  const ledger = operation.partitionId === LEDGER_PARTITION_ID ||
    row.entity_id === LEDGER_PARTITION_ID;
  if (sameEntity || ledger) return true;
  return attempt.body?.copyPolicy.state === POLICY.READY &&
    copyCapacityObservationAffects(attempt.body.copyPolicy.statement, row);
}

function ownRowObservation(attempt, tableName, row) {
  return tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
    row?.operation_id === attempt.operation.operationId;
}

function recordRepairObservation(attempt, kind) {
  attempt.observations = (attempt.observations ?? REPAIR_OBSERVATION.NONE) | kind;
  if (kind !== REPAIR_OBSERVATION.OWN_ROW) attempt.delegated = null;
}

function takeRepairObservations(attempt) {
  const observations = attempt.observations;
  attempt.observations = REPAIR_OBSERVATION.NONE;
  return observations;
}

function observationAllowsRetry(observations) {
  return (observations & (REPAIR_OBSERVATION.CLEARING | REPAIR_OBSERVATION.LEADER)) !== 0;
}

export {REPAIR_OBSERVATION, peerObservationMayClear, ownRowObservation,
  recordRepairObservation, takeRepairObservations, observationAllowsRetry};
