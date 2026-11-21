// A replica's committed SERVICES lifecycle row orders disk recovery and
// native retirement. NODES boot eligibility is a prerequisite, not the
// serialization point. The retire marker identifies one durable operation.
import {COLUMN, SERVICE_TYPE, TABLES} from '../constants/index.js';
import {CONTROL_PLANE_MUTATION_OPERATION} from
  '../control-plane/control-plane-system-table-gateway.js';
import {
  buildReplicaLifecycleMutationPredicateFromRow,
  durableRowVersion,
  isReplicaLifecycleMutationPredicate,
  nextLifecycleStateEntry,
  observeAuthoritativeReplicaLifecycle,
  rowMatchesReplicaLifecyclePredicate,
} from './replica-state-machine-lifecycle-observation.js';

const CLEANUP_TOKEN_COLUMN = 'cleanup_token';
const TRIGGER_REASON_COLUMN = 'trigger_reason';
const DISK_REJOIN_REASON = 'placement_learner_disk_rejoin';
const RETIREMENT_TOKEN_PREFIX = 'placement-learner-retire:';
const CRITICAL_MUTATION = Object.freeze({
  allowCoalescing: false, deliveryPriority: 'critical', workClass: 'critical',
});

const LEARNER_LIFECYCLE_CUSTODY = Object.freeze({
  ACQUIRED: 'acquired',
  UNKNOWN: 'unknown',
  CHANGED: 'changed',
});

function learnerRetirementToken(operationId) {
  return RETIREMENT_TOKEN_PREFIX + operationId;
}

function isLearnerRetirementToken(token) {
  return learnerRetirementOperationId(token) !== null;
}

function learnerRetirementOperationId(token) {
  return typeof token === 'string' && token.startsWith(RETIREMENT_TOKEN_PREFIX) &&
    token.length > RETIREMENT_TOKEN_PREFIX.length ?
    token.slice(RETIREMENT_TOKEN_PREFIX.length) : null;
}

function claimOf(state, row = null) {
  return Object.freeze({state, row});
}

async function writeLifecycleCustody(stateMachine, row, data) {
  const predicate = buildReplicaLifecycleMutationPredicateFromRow(row);
  if (!isReplicaLifecycleMutationPredicate(predicate)) return false;
  try {
    await stateMachine.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.SERVICES,
      whereClause: predicate,
      data,
    }, CRITICAL_MUTATION);
  } catch (error) {
    stateMachine.logger.warn('replica lifecycle custody write acknowledgement uncertain',
      {replicaId: row[COLUMN.REPLICA_ID], error: String(error)});
  }
  const observed = await observeAuthoritativeReplicaLifecycle(
    stateMachine, row[COLUMN.REPLICA_ID]);
  const expected = buildReplicaLifecycleMutationPredicateFromRow({...row, ...data});
  return observed.available === true &&
    rowMatchesReplicaLifecyclePredicate(observed.row, expected) &&
    Object.entries(data).every(([field, value]) => observed.row[field] === value);
}

function matchesIncumbentIdentity(row, scope) {
  return row?.[COLUMN.REPLICA_ID] === scope.replicaId &&
    row[COLUMN.SERVICE_ID] === scope.replicaId &&
    row[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
    row[COLUMN.PARTITION_ID] === scope.partitionId && row[COLUMN.NODE_ID] === scope.targetNodeId;
}

function exactIncumbent(row, scope) {
  return matchesIncumbentIdentity(row, scope) && row[COLUMN.CREATED_AT] === scope.replicaCreatedAt;
}

function provesNewerDiskRejoin(row, scope) {
  const version = durableRowVersion(row);
  return row[TRIGGER_REASON_COLUMN] === DISK_REJOIN_REASON && version !== null &&
    version.value > scope.lifecycleVersion;
}

function capturedVersionMatches(row, scope) {
  const version = durableRowVersion(row);
  return version !== null && version.column === scope.lifecycleVersionColumn &&
    version.value === scope.lifecycleVersion;
}

async function observeLearnerRetirementCustody(stateMachine, scope) {
  const observation = await observeAuthoritativeReplicaLifecycle(stateMachine, scope.replicaId);
  const row = observation.row;
  if (observation.available !== true || !matchesIncumbentIdentity(row, scope)) {
    return claimOf(LEARNER_LIFECYCLE_CUSTODY.UNKNOWN);
  }
  const birth = row[COLUMN.CREATED_AT];
  if (Number.isSafeInteger(birth) && birth > scope.replicaCreatedAt) {
    return claimOf(LEARNER_LIFECYCLE_CUSTODY.CHANGED);
  }
  if (birth !== scope.replicaCreatedAt) return claimOf(LEARNER_LIFECYCLE_CUSTODY.UNKNOWN);
  const token = row[CLEANUP_TOKEN_COLUMN];
  if (token === learnerRetirementToken(scope.operationId)) {
    return claimOf(LEARNER_LIFECYCLE_CUSTODY.ACQUIRED, row);
  }
  if (token === null && provesNewerDiskRejoin(row, scope)) {
    return claimOf(LEARNER_LIFECYCLE_CUSTODY.CHANGED);
  }
  return claimOf(LEARNER_LIFECYCLE_CUSTODY.UNKNOWN,
    token === null && capturedVersionMatches(row, scope) ? row : null);
}

async function acquireLearnerRetirementCustody(stateMachine, scope, row) {
  if (!row || !exactIncumbent(row, scope) || !capturedVersionMatches(row, scope)) {
    return claimOf(LEARNER_LIFECYCLE_CUSTODY.UNKNOWN);
  }
  const token = learnerRetirementToken(scope.operationId);
  const version = nextLifecycleStateEntry(stateMachine.now(), durableRowVersion(row).value);
  await writeLifecycleCustody(stateMachine, row, {
    [CLEANUP_TOKEN_COLUMN]: token,
    [COLUMN.STATE_ENTERED_AT]: version,
    [COLUMN.UPDATED_AT]: version,
  });
  return observeLearnerRetirementCustody(stateMachine, scope);
}

async function releaseLearnerRetirementCustody(stateMachine, row, operationId) {
  if (row?.[CLEANUP_TOKEN_COLUMN] !== learnerRetirementToken(operationId)) return false;
  const version = nextLifecycleStateEntry(stateMachine.now(), durableRowVersion(row).value);
  return writeLifecycleCustody(stateMachine, row, {
    [CLEANUP_TOKEN_COLUMN]: null,
    [COLUMN.STATE_ENTERED_AT]: version,
    [COLUMN.UPDATED_AT]: version,
  });
}

async function claimLearnerDiskRejoin(stateMachine, row) {
  if (row[CLEANUP_TOKEN_COLUMN] !== null) return false;
  const version = durableRowVersion(row);
  if (version === null) return false;
  const next = nextLifecycleStateEntry(stateMachine.now(), version.value);
  return writeLifecycleCustody(stateMachine, row, {
    [TRIGGER_REASON_COLUMN]: DISK_REJOIN_REASON,
    [COLUMN.STATE_ENTERED_AT]: next,
    [COLUMN.UPDATED_AT]: next,
  });
}

export {
  LEARNER_LIFECYCLE_CUSTODY,
  acquireLearnerRetirementCustody,
  claimLearnerDiskRejoin,
  isLearnerRetirementToken,
  learnerRetirementOperationId,
  learnerRetirementToken,
  observeLearnerRetirementCustody,
  releaseLearnerRetirementCustody,
};
