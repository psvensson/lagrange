// A replica's committed SERVICES lifecycle row orders disk recovery and
// native retirement. NODES boot eligibility is a prerequisite, not the
// serialization point. The retire marker identifies one durable operation.
import {COLUMN, TABLES} from '../constants/index.js';
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
    rowMatchesReplicaLifecyclePredicate(observed.row, expected);
}

function exactIncumbent(row, scope) {
  return row?.[COLUMN.REPLICA_ID] === scope.replicaId &&
    row[COLUMN.SERVICE_ID] === scope.replicaId &&
    row[COLUMN.PARTITION_ID] === scope.partitionId &&
    row[COLUMN.NODE_ID] === scope.targetNodeId &&
    row[COLUMN.CREATED_AT] === scope.replicaCreatedAt;
}

function capturedVersionMatches(row, scope) {
  const version = durableRowVersion(row);
  return version !== null && version.column === scope.lifecycleVersionColumn &&
    version.value === scope.lifecycleVersion;
}

async function observeLearnerRetirementCustody(stateMachine, scope) {
  const observation = await observeAuthoritativeReplicaLifecycle(stateMachine, scope.replicaId);
  if (observation.available !== true) return claimOf(LEARNER_LIFECYCLE_CUSTODY.UNKNOWN);
  if (!exactIncumbent(observation.row, scope)) return claimOf(LEARNER_LIFECYCLE_CUSTODY.CHANGED);
  const token = observation.row[CLEANUP_TOKEN_COLUMN];
  if (token === learnerRetirementToken(scope.operationId)) {
    return claimOf(LEARNER_LIFECYCLE_CUSTODY.ACQUIRED, observation.row);
  }
  if (token !== null || !capturedVersionMatches(observation.row, scope)) {
    return claimOf(LEARNER_LIFECYCLE_CUSTODY.CHANGED);
  }
  return claimOf(LEARNER_LIFECYCLE_CUSTODY.UNKNOWN, observation.row);
}

async function acquireLearnerRetirementCustody(stateMachine, scope, row) {
  if (!row || !exactIncumbent(row, scope) || !capturedVersionMatches(row, scope)) {
    return claimOf(LEARNER_LIFECYCLE_CUSTODY.CHANGED);
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
